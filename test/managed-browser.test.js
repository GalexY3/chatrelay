import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ManagedBrowser } from '../src/managed-browser.js';
import { startBroker } from '../src/broker.js';
import { request } from '../src/client.js';

test('unconfigured background mode refuses work without launching a browser or opening a window', async t => {
  let launches = 0;
  const runner = new ManagedBrowser({ home: 'unused-test-home', ready: false, launch: () => { launches++; throw new Error('Must not launch.'); } });
  const token = 'd'.repeat(64), broker = await startBroker({ port: 0, token, backend: 'managed' }, { runner }); t.after(() => broker.close());
  const config = { port: broker.port, token };
  assert.equal((await request(config, '/status')).backend, 'managed');
  await assert.rejects(request(config, '/jobs', { task: 'No session configured.' }), /Run chatrelay connect/);
  assert.equal(launches, 0); assert.equal(broker.jobs.jobs.size, 0);
});

test('closing during a browser launch releases the late context and clears queued cancelled entries', async () => {
  let release, closes = 0, pages = 0;
  const launched = new Promise(resolve => { release = resolve; });
  const runner = new ManagedBrowser({ home: 'unused-test-home', ready: true, launch: () => launched });
  const emitted = [];
  const first = runner.run({ id: 'first' }, event => emitted.push(event));
  await new Promise(resolve => setImmediate(resolve));
  const second = runner.run({ id: 'second' }, event => emitted.push(event)); runner.cancel('second');
  const closing = runner.close();
  release({ async close() { closes++; }, async newPage() { pages++; } });
  await Promise.all([first, second, closing]);
  assert.equal(closes, 1); assert.equal(pages, 0); assert.equal(runner.entries.size, 0); assert.deepEqual(emitted, []);
});

test('a failed background browser launch is reported before submission without automatic retry', async () => {
  let launches = 0; const events = [];
  const runner = new ManagedBrowser({ home: 'unused-test-home', ready: true, launch: async () => { launches++; throw new Error('Browser unavailable.'); } });
  try {
    await runner.run({ id: 'first' }, event => events.push(event));
    assert.equal(launches, 1); assert.deepEqual(events, [{ type: 'failed', error: 'Browser unavailable.', mayHaveSubmitted: false }]);
    assert.equal(runner.entries.size, 0);
  } finally { await runner.close(); }
});

test('cancelling the last queued task still releases an idle background context', async () => {
  let navigate, closes = 0;
  const gate = new Promise(resolve => { navigate = resolve; });
  const runner = new ManagedBrowser({ home: 'unused-test-home', ready: true, idleMs: 10 });
  runner.context = {
    async close() { closes++; },
    async newPage() { return {
      async goto() { await gate; }, url() { return 'https://chatgpt.com/'; },
      async exposeBinding() {}, async close() {},
      async evaluate(script) { return typeof script === 'function' ? { ok: true, output: 'done', outputChars: 4, truncated: false } : undefined; },
    }; },
  };
  try {
    const first = runner.run({ id: 'first', maxOutputChars: 200 }, () => {});
    await new Promise(resolve => setImmediate(resolve));
    const second = runner.run({ id: 'second' }, () => {}); runner.cancel('second'); navigate();
    await Promise.all([first, second]);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(runner.entries.size, 0); assert.equal(closes, 1); assert.equal(runner.context, null);
  } finally { await runner.close(); }
});
