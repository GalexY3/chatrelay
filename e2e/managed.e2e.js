import { test, expect, chromium } from '@playwright/test';
import { ManagedBrowser } from '../src/managed-browser.js';
import { startBroker } from '../src/broker.js';
import { request } from '../src/client.js';
import { syntheticChat } from './site.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcp } from '../src/mcp.js';

async function fixture(info, { idleMs = 60000 } = {}) {
  let site = { output: 'Hidden final answer' }, launches = 0, lastContext;
  const runner = new ManagedBrowser({ home: info.outputPath('home'), ready: true, idleMs,
    executablePath: process.env.CHATRELAY_E2E_BROWSER_EXECUTABLE,
    launch: async (profile, options) => {
      expect(options.headless).toBe(true); expect(options.chromiumSandbox).toBe(true);
      launches++;
      const context = lastContext = await chromium.launchPersistentContext(profile, { ...options,
        args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
      });
      await context.route('**/*', route => route.request().url().startsWith('https://chatgpt.com/')
        ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: syntheticChat(site) }) : route.abort());
      return context;
    },
  });
  const token = 'c'.repeat(64), broker = await startBroker({ port: 0, token, backend: 'managed' }, { runner });
  const config = { port: broker.port, token };
  return { broker, runner, config, site: value => { site = value; }, launches: () => launches, context: () => lastContext };
}

test('MCP delegates through the background browser with no extension or visible tabs', async ({}, info) => {
  const f = await fixture(info); const client = new Client({ name: 'hidden-e2e', version: '1' });
  try {
    f.site({ editor: 'modern', output: 'Hidden final answer' });
    const [server, peer] = InMemoryTransport.createLinkedPair(); await createMcp(f.config).connect(server); await client.connect(peer);
    const submission = await client.callTool({ name: 'chatrelay_delegate', arguments: { task: 'A hidden task', maxOutputChars: 200 } });
    expect(submission.isError).toBeUndefined(); const job = JSON.parse(submission.content[0].text);
    const response = await client.callTool({ name: 'chatrelay_result', arguments: { id: job.id, waitSeconds: 15 } });
    const result = JSON.parse(response.content[0].text);
    expect(result.state, result.error).toBe('completed'); expect(result.output).toBe('Hidden final answer');
    expect(f.launches()).toBe(1); expect((await request(f.config, '/status')).backend).toBe('managed');
    expect(f.context().pages().filter(page => page.url().startsWith('https://chatgpt.com/'))).toHaveLength(0);
  } finally { await client.close(); await f.broker.close(); }
});

test('background context closes after idle and can reopen using the same private profile', async ({}, info) => {
  const f = await fixture(info, { idleMs: 50 });
  try {
    const first = await request(f.config, '/jobs', { task: 'First private page' });
    expect((await request(f.config, `/jobs/${first.id}?wait=15`)).state).toBe('completed');
    await expect.poll(() => f.runner.context).toBe(null);
    const second = await request(f.config, '/jobs', { task: 'Second private page' });
    expect((await request(f.config, `/jobs/${second.id}?wait=15`)).state).toBe('completed');
    expect(f.launches()).toBe(2);
  } finally { await f.broker.close(); }
});

test('background mode refuses Work and signed-out pages, then cancels without blocking the next task', async ({}, info) => {
  const f = await fixture(info);
  try {
    for (const mode of ['work', 'logged-out']) {
      f.site({ mode }); const job = await request(f.config, '/jobs', { task: 'Do not submit this.' });
      const result = await request(f.config, `/jobs/${job.id}?wait=15`);
      expect(result.state).toBe('failed'); expect(result.submitted).toBe(false);
    }
    f.site({ mode: 'never-finishes' }); const slow = await request(f.config, '/jobs', { task: 'Cancel this collection.' });
    await expect.poll(async () => (await request(f.config, `/jobs/${slow.id}`)).state).toBe('running');
    await request(f.config, `/jobs/${slow.id}/cancel`, {});
    f.site({ output: 'Recovered without resubmission' }); const next = await request(f.config, '/jobs', { task: 'New independent work' });
    const result = await request(f.config, `/jobs/${next.id}?wait=15`);
    expect(result.state, result.error).toBe('completed'); expect(result.output).toBe('Recovered without resubmission');
    expect((await request(f.config, `/jobs/${slow.id}`)).state).toBe('cancelled');
  } finally { await f.broker.close(); }
});

test('background answers are bounded before leaving the browser while preserving original length', async ({}, info) => {
  const f = await fixture(info);
  try {
    f.site({ output: '🙂'.repeat(110000) });
    const job = await request(f.config, '/jobs', { task: 'Return a bounded answer.', maxOutputChars: 201 });
    const result = await request(f.config, `/jobs/${job.id}?wait=15`);
    expect(result.state, result.error).toBe('completed'); expect(result.output.length).toBe(200);
    expect(result.outputChars).toBe(220000); expect(result.truncated).toBe(true);
  } finally { await f.broker.close(); }
});

test('rendered formulas return once with readable paragraphs instead of duplicate glyphs', async ({}, info) => {
  const f = await fixture(info);
  try {
    f.site({ editor: 'modern', renderMath: true });
    const job = await request(f.config, '/jobs', { task: 'Read the rendered formula.' });
    const result = await request(f.config, `/jobs/${job.id}?wait=15`);
    expect(result.state, result.error).toBe('completed');
    expect(result.output).toBe('Objective $L = a + b$.\n\nEnd.');
    expect(result.outputChars).toBe(result.output.length);
  } finally { await f.broker.close(); }
});
