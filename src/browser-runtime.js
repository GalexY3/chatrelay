import { chromium } from 'playwright-core';
import { access, cp, mkdir, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, basename, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
export function browserExecutable(home) {
  if (process.env.CHATRELAY_BROWSER_EXECUTABLE) return resolve(process.env.CHATRELAY_BROWSER_EXECUTABLE);
  const installed = chromium.executablePath();
  return process.platform === 'win32' ? join(home, 'browser-runtime', basename(dirname(dirname(installed))), basename(dirname(installed)), basename(installed)) : installed;
}

async function hash(path) {
  const digest = createHash('sha256'); for await (const chunk of createReadStream(path)) digest.update(chunk); return digest.digest('hex');
}

export async function prepareBrowser(home) {
  const executable = browserExecutable(home);
  if (process.env.CHATRELAY_BROWSER_EXECUTABLE) { await access(executable); return executable; }
  const source = chromium.executablePath();
  try { await access(source); } catch {
    console.log('Downloading the matching Chromium runtime from the Playwright browser distribution.');
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(dirname(require.resolve('playwright-core/package.json')), 'cli.js'), 'install', 'chromium', '--no-shell'], { windowsHide: true, stdio: 'inherit' });
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Browser installation failed (${code}).`)));
    });
  }
  if (process.platform === 'win32') {
    let matches = false;
    try { matches = await hash(source) === await hash(executable); } catch {}
    if (!matches) {
      console.log('Preparing an independent local browser runtime.');
      await mkdir(dirname(executable), { recursive: true });
      await cp(dirname(source), dirname(executable), { recursive: true, force: true });
      if (await hash(source) !== await hash(executable)) throw new Error('Browser runtime copy verification failed.');
    }
  }
  return executable;
}

export async function connectBrowser(home, executablePath) {
  const context = await chromium.launchPersistentContext(join(home, 'browser-profile'), { channel: 'chromium', headless: false, chromiumSandbox: true, acceptDownloads: false, executablePath });
  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://chatgpt.com/');
    console.log('Sign in manually in this one-time connection window and select Chat. It will close when ready.');
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline && !page.isClosed()) {
      // Navigation during sign-in clears the adapter, so reinstall only this
      // local DOM helper; no login fields, cookies or credentials are inspected.
      try {
        if (new URL(page.url()).origin === 'https://chatgpt.com') {
          await page.evaluate(await readFile(new URL('../extension/dom-adapter.js', import.meta.url), 'utf8'));
          if (await page.evaluate(() => globalThis.ChatRelayDOM.chatMode(document) === 'chat' && !document.querySelector('form[data-logged-out]') && Boolean(document.querySelector('[contenteditable="true"][role="textbox"],#prompt-textarea')))) return;
        }
      } catch { /* User-controlled login/navigation is still in progress. */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Connection was not completed. Run chatrelay connect when ready.');
  } finally { await context.close(); }
}
