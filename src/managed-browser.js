import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const adapterPath = new URL('../extension/dom-adapter.js', import.meta.url);

export class ManagedBrowser {
  constructor({ home, ready = false, executablePath, launch, idleMs = 60000 } = {}) {
    this.home = home; this.ready = ready; this.idleMs = idleMs;
    this.launch = () => (launch || chromium.launchPersistentContext.bind(chromium))(join(home, 'browser-profile'), {
      channel: 'chromium', headless: true, chromiumSandbox: true, acceptDownloads: false,
      ...(executablePath ? { executablePath } : {}),
    });
    this.entries = new Map(); this.chain = Promise.resolve(); this.context = null; this.closed = false; this.idleTimer = null;
  }

  run(message, emit) {
    const entry = { cancelled: false, page: null };
    this.entries.set(message.id, entry); clearTimeout(this.idleTimer);
    const work = this.chain.catch(() => {}).then(async () => {
      if (entry.cancelled || this.closed) { this.entries.delete(message.id); this.scheduleIdle(); return; }
      let terminal, mayHaveSubmitted = false;
      try {
        await this.releasing;
        if (this.closed || entry.cancelled) return;
        if (!this.context) {
          const context = await this.launch();
          // Shutdown may finish while the browser process is still launching.
          // Close that late context directly, independently of an older release.
          if (this.closed) { await context.close(); return; }
          this.context = context;
        }
        if (entry.cancelled) return;
        const page = entry.page = await this.context.newPage();
        await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (new URL(page.url()).origin !== 'https://chatgpt.com') throw new Error('Sign in manually using chatrelay connect. No automatic login or fallback.');
        if (entry.cancelled) return;
        await page.exposeBinding('__chatrelaySubmitted', async () => {
          mayHaveSubmitted = true;
          if (!entry.cancelled) await emit({ type: 'submitted', pageUrl: page.url() });
        });
        await page.evaluate(await readFile(adapterPath, 'utf8'));
        if (entry.cancelled) return;
        mayHaveSubmitted = true; // A page/pipe failure after evaluation may hide a click.
        const result = await page.evaluate(async ({ prompt, timeoutSeconds, maxOutputChars }) => {
          globalThis.chatrelayController = new AbortController();
          try {
            const output = await globalThis.ChatRelayDOM.run({ document, prompt, timeoutSeconds, signal: globalThis.chatrelayController.signal, onSubmitted: () => globalThis.__chatrelaySubmitted() });
            const bounded = output.slice(0, maxOutputChars).replace(/[\uD800-\uDBFF]$/, '');
            return { ok: true, output: bounded, outputChars: output.length, truncated: output.length > bounded.length };
          } catch (error) { return { ok: false, error: error.message, mayHaveSubmitted: Boolean(error.mayHaveSubmitted) }; }
        }, message);
        if (result.ok) {
          const output = result.output.slice(0, message.maxOutputChars).replace(/[\uD800-\uDBFF]$/, '');
          terminal = { type: 'completed', output, outputChars: result.outputChars, truncated: result.truncated, pageUrl: page.url() };
        } else terminal = { type: 'failed', error: result.error, mayHaveSubmitted: result.mayHaveSubmitted, pageUrl: page.url() };
      } catch (error) {
        terminal = { type: 'failed', error: error.message, mayHaveSubmitted };
        if (this.context?.browser() && !this.context.browser().isConnected()) this.context = null;
      } finally {
        await entry.page?.close().catch(() => {});
        this.entries.delete(message.id);
        if (!entry.cancelled && terminal && !this.closed) await emit(terminal);
        this.scheduleIdle();
      }
    });
    this.chain = work; return work;
  }

  cancel(id) {
    const entry = this.entries.get(id); if (!entry) return;
    entry.cancelled = true;
    // These pages belong only to the private background profile, never the
    // user's normal browser. Closing also interrupts a pending navigation.
    entry.page?.close().catch(() => {});
  }
  scheduleIdle() {
    clearTimeout(this.idleTimer);
    if (!this.entries.size && !this.closed) {
      this.idleTimer = setTimeout(() => this.release().catch(() => {}), this.idleMs); this.idleTimer.unref?.();
    }
  }
  async release() {
    if (this.releasing) return this.releasing;
    clearTimeout(this.idleTimer);
    const context = this.context; this.context = null;
    this.releasing = Promise.resolve().then(() => context?.close()).finally(() => { this.releasing = null; });
    return this.releasing;
  }
  async close() {
    this.closed = true; for (const id of this.entries.keys()) this.cancel(id);
    await this.release(); await this.chain.catch(() => {});
  }
}
