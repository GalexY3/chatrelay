import { test as base, expect, chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { startBroker } from '../src/broker.js';
import { request } from '../src/client.js';
import { syntheticChat } from './site.js';

const token = 'd'.repeat(64);
const extensionPath = fileURLToPath(new URL('../extension', import.meta.url));
const test = base.extend({
  setup: async ({}, use) => {
    const broker = await startBroker({ port: 0, token });
    let context;
    try {
    context = await chromium.launchPersistentContext('', {
      channel: 'chromium', headless: true,
      ...(process.env.CHATRELAY_E2E_BROWSER_EXECUTABLE ? { executablePath: process.env.CHATRELAY_E2E_BROWSER_EXECUTABLE } : {}),
      args: [
        `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`,
        // Also block external DNS before page interception is installed.
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
      ],
    });
    const config = { port: broker.port, token };
    let site = { output: 'Respuesta final: España 🙂', mode: 'normal' };
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    // Deny all external requests. The ChatGPT origin is a synthetic route, not live traffic.
    await context.route('**/*', route => {
      if (route.request().url().startsWith(`chrome-extension://${id}/`)) return route.continue();
      if (route.request().url().startsWith('https://chatgpt.com/')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: syntheticChat(site) });
      return route.abort();
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const pairing = await request(config, '/pairing', {});
    await popup.locator('#code').fill(pairing.code);
    await popup.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(popup.locator('#status')).toContainText('Connected. Ready');
    const stored = await worker.evaluate(() => chrome.storage.local.get(['port', 'token', 'enabled']));
    expect(stored).toEqual({ port: broker.port, token, enabled: true });
    expect(await popup.locator('#code').inputValue()).toBe('');
    // In this Chromium build chrome.tabs.create can navigate before Playwright
    // attaches its interception to the new target. Defer only the fixture's
    // initial navigation: real Chrome tabs, extension APIs and production task
    // processing are retained; external DNS stays blocked throughout.
    await worker.evaluate(() => {
      const create = chrome.tabs.create.bind(chrome.tabs);
      globalThis.fixtureNavigations = new Map();
      chrome.tabs.create = async options => {
        const tab = await create({ ...options, url: 'about:blank' });
        await new Promise(resolve => globalThis.fixtureNavigations.set(tab.id, resolve));
        return chrome.tabs.get(tab.id);
      };
    });
    const fixtureErrors = [];
    context.on('page', page => {
      (async () => {
        await expect.poll(() => worker.evaluate(() => globalThis.fixtureNavigations.size)).toBe(1);
        await page.goto('https://chatgpt.com/');
        await worker.evaluate(() => {
          const [id, resolve] = globalThis.fixtureNavigations.entries().next().value;
          globalThis.fixtureNavigations.delete(id); resolve();
        });
      })().catch(error => fixtureErrors.push(error.message));
    });
    await use({ broker, context, config, popup, site: value => { site = value; } });
    expect(fixtureErrors).toEqual([]);
    } finally { await context?.close(); await broker.close(); }
  },
});

async function collect(config, id) {
  const result = await request(config, `/jobs/${id}?wait=15`);
  await test.info().attach('synthetic-job-result', { body: JSON.stringify(result), contentType: 'application/json' });
  return result;
}

test('real extension pairs, submits Unicode multiline text once and returns the final answer', async ({ setup }) => {
  const { context, config } = setup;
  const task = 'Explica España 🙂\n\nSegunda línea con análisis.';
  const job = await request(config, '/jobs', { task, maxOutputChars: 400 });
  const result = await collect(config, job.id);
  expect(result.state, result.error || 'Expected a completed synthetic answer.').toBe('completed');
  expect(result.output).toBe('Respuesta final: España 🙂');
  const page = context.pages().find(p => p.url().startsWith('https://chatgpt.com/'));
  expect(await page.evaluate(() => window.submissions.length)).toBe(1);
  expect((await page.evaluate(() => window.submissions[0]))).toContain(task);
  expect(result.submitted).toBe(true);
});

test('textarea composer returns the answer after its submitted value is cleared', async ({ setup }) => {
  setup.site({ editor: 'textarea', output: 'Textarea final answer' });
  const job = await request(setup.config, '/jobs', { task: 'Pregunta textarea' });
  const result = await collect(setup.config, job.id);
  expect(result.state).toBe('completed');
  expect(result.output).toBe('Textarea final answer');
});

test('one batch produces serial separate turns and collects both results in one request', async ({ setup }) => {
  const { config, context } = setup;
  const { jobs: [a, b] } = await request(config, '/jobs/batch', {
    context: 'Shared reference for both tasks',
    tasks: [{ task: 'First independent task' }, { task: 'Second independent task' }],
  });
  expect(b.state).toBe('queued');
  const { jobs: results } = await request(config, `/jobs?wait=15&ids=${a.id},${b.id}`);
  expect(results.map(job => job.state)).toEqual(['completed', 'completed']);
  const pages = context.pages().filter(p => p.url().startsWith('https://chatgpt.com/'));
  expect(pages).toHaveLength(2);
  for (const page of pages) {
    const submissions = await page.evaluate(() => window.submissions);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toContain('Shared reference for both tasks');
  }
});

test('a large answer is truncated without losing the extension connection', async ({ setup }) => {
  setup.site({ output: '🙂'.repeat(110000) });
  const job = await request(setup.config, '/jobs', { task: 'A bounded answer', maxOutputChars: 201 });
  const result = await collect(setup.config, job.id);
  expect(result.state).toBe('completed');
  expect(result.output.length).toBe(200);
  expect(result.outputChars).toBe(220000);
  expect(result.truncated).toBe(true);
  expect((await request(setup.config, '/status')).connected).toBe(true);
});

test('usage-limit page reports uncertainty and does not retry the prompt', async ({ setup }) => {
  setup.site({ mode: 'alert' });
  const job = await request(setup.config, '/jobs', { task: 'Do not retry' });
  const result = await collect(setup.config, job.id);
  expect(result.state).toBe('uncertain');
  const page = setup.context.pages().find(p => p.url().startsWith('https://chatgpt.com/'));
  expect(await page.evaluate(() => window.submissions.length)).toBe(1);
});

test('closing the task tab cannot be accepted as a completed answer', async ({ setup }) => {
  setup.site({ mode: 'never-finishes' });
  const job = await request(setup.config, '/jobs', { task: 'A slow task' });
  await expect.poll(async () => (await request(setup.config, `/jobs/${job.id}`)).state).toBe('running');
  const page = setup.context.pages().find(p => p.url().startsWith('https://chatgpt.com/'));
  await page.close();
  const result = await collect(setup.config, job.id);
  expect(result.state).toBe('uncertain');
  expect(result.output).toBeNull();
});

test('an observed signed-out page fails before submission instead of using anonymous chat', async ({ setup }) => {
  setup.site({ mode: 'logged-out' });
  const job = await request(setup.config, '/jobs', { task: 'Requires the user account' });
  const result = await collect(setup.config, job.id);
  expect(result.state).toBe('failed');
  expect(result.submitted).toBe(false);
  expect(result.error).toContain('signed out');
  const page = setup.context.pages().find(p => p.url().startsWith('https://chatgpt.com/'));
  expect(await page.evaluate(() => window.submissions.length)).toBe(0);
});

for (const mode of ['work', 'unknown-mode']) {
  test(`the Chat-only guard blocks ${mode} before putting context in the editor`, async ({ setup }) => {
    setup.site({ mode });
    const job = await request(setup.config, '/jobs', { task: 'Never use Work/Codex quota.' });
    const result = await collect(setup.config, job.id);
    expect(result.state).toBe('failed'); expect(result.submitted).toBe(false); expect(result.error).toContain('Chat mode');
    const page = setup.context.pages().find(p => p.url().startsWith('https://chatgpt.com/'));
    expect(await page.evaluate(() => window.submissions.length)).toBe(0);
    expect(await page.locator('#prompt-textarea').innerText()).toBe('');
  });
}
