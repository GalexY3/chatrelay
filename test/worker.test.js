import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { newNonce, serverProof, encryptCredential, verifyClientProof, verifyAckProof } from '../src/ws-auth.js';

const code = await readFile(new URL('../extension/worker.js', import.meta.url), 'utf8');
const authCode = await readFile(new URL('../extension/auth.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function until(check) { for (let i = 0; i < 200; i++) { if (check()) return; await flush(); } assert.ok(check(), 'Expected worker activity did not settle.'); }
function hook() { const handlers = []; return { handlers, addListener(fn) { handlers.push(fn); } }; }
function harness() {
  const connections = [], sent = [], tabs = [], delivered = [], injections = [];
  const local = { enabled: true, port: 39391, token: 'b'.repeat(64) }, state = {};
  const chrome = {
    storage: {
      local: { async get() { return { ...local }; }, async set(data) { Object.assign(local, data); } },
      session: { async set(data) { Object.assign(state, data); }, async get() { return { ...state }; } },
    },
    runtime: { id: 'a'.repeat(32), getURL: path => `chrome-extension://${'a'.repeat(32)}/${path}`, onMessage: hook(), onStartup: hook() },
    alarms: { create() {}, onAlarm: hook() },
    tabs: {
      async create(options) { const tab = { id: tabs.length + 1, ...options, status: 'complete' }; tabs.push(tab); return tab; },
      async get(id) { return tabs.find(tab => tab.id === id); },
      async sendMessage(tabId, message) { delivered.push({ tabId, message }); return { ok: true }; },
      async update(tabId, options) { const tab = tabs.find(t => t.id === tabId); if (!tab) throw new Error('Tab closed.'); Object.assign(tab, options); return tab; },
      onRemoved: hook(),
    },
    scripting: { async executeScript(options) { injections.push(options); } },
  };
  class FakeSocket {
    static OPEN = 1; static CONNECTING = 0;
    readyState = 0;
    constructor(url) { this.url = url; connections.push(this); }
    send(message) { sent.push(JSON.parse(message)); }
    close() { this.readyState = 3; }
  }
  const context = vm.createContext({ chrome, WebSocket: FakeSocket, URL, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, setTimeout, setInterval: () => 1, clearInterval() {} });
  context.importScripts = name => { assert.equal(name, 'auth.js'); vm.runInContext(authCode, context); };
  vm.runInContext(code, context);
  async function begin() {
    await flush();
    const ws = connections.at(-1); ws.readyState = 1;
    const secret = local.token, serverNonce = newNonce();
    await ws.onmessage({ data: JSON.stringify({ type: 'challenge', protocol: 2, serverNonce }) });
    const hello = sent.at(-1);
    const value = { port: Number(new URL(ws.url).port), origin: `chrome-extension://${chrome.runtime.id}`, serverNonce, clientNonce: hello.clientNonce };
    assert.ok(verifyClientProof(secret, value, hello.proof));
    assert.equal(hello.token, undefined);
    return { ws, secret, value };
  }
  async function finish(session, credential) {
    const { ws, secret, value } = session;
    const box = credential ? encryptCredential(secret, value, credential) : undefined;
    await ws.onmessage({ data: JSON.stringify({ type: 'ready', protocol: 2, proof: serverProof(secret, value, box), ...(box ? { credentialBox: box } : {}) }) });
    if (ws.readyState === 1) { const ack = sent.at(-1); assert.equal(ack.type, 'ready-ack'); assert.ok(verifyAckProof(secret, value, ack.proof)); }
    return ws;
  }
  const ready = async () => finish(await begin());
  const popup = { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html'), tab: { id: 999 } };
  const message = data => new Promise(resolve => chrome.runtime.onMessage.handlers[0](data, popup, resolve));
  async function run(ws, id = '11111111-1111-4111-8111-111111111111', maxOutputChars = 200) {
    await ws.onmessage({ data: JSON.stringify({ type: 'run', id, prompt: 'Bounded question', timeoutSeconds: 30, maxOutputChars }) });
    await until(() => delivered.some(({ message }) => message.type === 'chatrelay-run' && message.id === id));
    return id;
  }
  return { connections, sent, tabs, delivered, injections, local, state, chrome, begin, finish, ready, popup, message, run };
}

test('overlapping startup/alarm events authenticate once without sending the credential', async () => {
  const h = harness(); h.chrome.runtime.onStartup.handlers[0](); h.chrome.alarms.onAlarm.handlers[0]({ name: 'reconnect' });
  await h.ready();
  assert.equal(h.connections.length, 1); assert.equal(h.sent.filter(message => message.type === 'hello').length, 1);
  assert.ok(!JSON.stringify(h.sent).includes(h.local.token)); assert.match(h.state.status, /Connected/);
});

test('worker opens inactive task tabs and accepts results only from the owning extension tab', async () => {
  const h = harness(), ws = await h.ready(), id = await h.run(ws);
  assert.equal(h.tabs.length, 1); assert.equal(h.tabs[0].active, false); assert.equal(h.tabs[0].url, 'https://chatgpt.com/');
  assert.deepEqual([...h.injections[0].files], ['dom-adapter.js', 'content.js']);
  const handler = h.chrome.runtime.onMessage.handlers[0], message = { type: 'job-event', id, event: { type: 'completed', output: 'advice' } };
  handler(message, { id: h.chrome.runtime.id, tab: { id: 999 } }, () => {});
  handler(message, { id: 'other-extension', tab: { id: 1 } }, () => {});
  assert.equal(h.sent.filter(m => m.type === 'job-event').length, 0);
  let response; handler(message, { id: h.chrome.runtime.id, tab: { id: 1 } }, value => { response = value; });
  assert.equal(response.ok, true); assert.equal(h.sent.filter(m => m.type === 'job-event').length, 1);
  handler(message, { id: h.chrome.runtime.id, tab: { id: 1 } }, () => {});
  assert.equal(h.sent.filter(m => m.type === 'job-event').length, 1);
});

test('disconnect cancels collection, clears activity and rejects late content events', async () => {
  const h = harness(), ws = await h.ready(), id = await h.run(ws);
  await h.message({ type: 'disconnect' }); await until(() => h.state.activeJob === null);
  assert.equal(h.local.enabled, false); assert.equal(h.delivered.at(-1).message.type, 'chatrelay-abort');
  h.chrome.runtime.onMessage.handlers[0]({ type: 'job-event', id, event: { type: 'completed', output: 'late' } }, { id: h.chrome.runtime.id, tab: { id: 1 } }, () => {});
  assert.equal(h.sent.filter(m => m.type === 'job-event').length, 0);
});

test('large answers are bounded before the socket while preserving length metadata', async () => {
  const h = harness(), ws = await h.ready(), id = await h.run(ws, undefined, 201);
  h.chrome.runtime.onMessage.handlers[0]({ type: 'job-event', id, event: { type: 'completed', output: '🙂'.repeat(110000) } }, { id: h.chrome.runtime.id, tab: { id: 1 } }, () => {});
  const sent = h.sent.find(message => message.type === 'job-event');
  assert.equal(sent.event.output.length, 200); assert.equal(sent.event.outputChars, 220000); assert.equal(sent.event.truncated, true);
  assert.ok(JSON.stringify(sent).length < 1000);
});

test('a temporary setup code exchanges an encrypted persistent credential and supports popup tabs', async () => {
  const h = harness(); await h.ready();
  assert.equal((await h.message({ type: 'pair', code: `cr1:39392:${'d'.repeat(64)}` })).ok, true);
  const session = await h.begin(); await h.finish(session, 'e'.repeat(64));
  assert.equal(h.local.token, 'e'.repeat(64)); assert.equal(h.local.port, 39392);
  assert.ok(!JSON.stringify(h.sent).includes('d'.repeat(64))); assert.ok(!JSON.stringify(h.sent).includes('e'.repeat(64)));
});

test('open last task only activates the tab created by this worker', async () => {
  const h = harness(), ws = await h.ready(); await h.run(ws);
  assert.equal(h.tabs[0].active, false); assert.equal((await h.message({ type: 'open-task' })).ok, true); assert.equal(h.tabs[0].active, true);
});

test('pairing is acknowledged only after credential storage completes, then immediate dispatch succeeds', async () => {
  const h = harness(); await h.ready(); await h.message({ type: 'pair', code: `cr1:39392:${'d'.repeat(64)}` });
  const session = await h.begin(); let release;
  const stored = new Promise(resolve => { release = resolve; }), originalSet = h.chrome.storage.local.set;
  h.chrome.storage.local.set = async values => { await stored; await originalSet(values); };
  const ackCount = h.sent.filter(x => x.type === 'ready-ack').length;
  const accepting = h.finish(session, 'e'.repeat(64));
  await flush(); await flush(); assert.equal(h.sent.filter(x => x.type === 'ready-ack').length, ackCount);
  release(); const ws = await accepting; await h.run(ws);
  assert.equal(h.tabs.length, 1); assert.equal(h.local.token, 'e'.repeat(64));
});

test('failed credential storage closes the connection without acknowledging readiness', async () => {
  const h = harness(); await h.ready(); await h.message({ type: 'pair', code: `cr1:39392:${'d'.repeat(64)}` });
  const session = await h.begin(), count = h.sent.filter(x => x.type === 'ready-ack').length;
  h.chrome.storage.local.set = async () => { throw new Error('Storage unavailable.'); };
  await h.finish(session, 'e'.repeat(64));
  assert.equal(session.ws.readyState, 3); assert.match(h.state.status, /Storage unavailable/);
  assert.equal(h.sent.filter(x => x.type === 'ready-ack').length, count);
});

test('task cancellation while session storage is pending cannot create a tab', async () => {
  const h = harness(), ws = await h.ready(); let release;
  const original = h.chrome.storage.session.set;
  h.chrome.storage.session.set = async values => { if (values.activeJob) await new Promise(resolve => { release = resolve; }); await original(values); };
  const id = '11111111-1111-4111-8111-111111111111';
  await ws.onmessage({ data: JSON.stringify({ type: 'run', id, prompt: 'Cancelled before tab creation', timeoutSeconds: 30, maxOutputChars: 200 }) });
  await until(() => Boolean(release));
  const cancel = ws.onmessage({ data: JSON.stringify({ type: 'cancel', id }) }); await flush(); release(); await cancel;
  await until(() => h.state.activeJob === null); assert.equal(h.tabs.length, 0); assert.equal(h.injections.length, 0);
});

test('closed tabs clear activity and content scripts cannot issue popup commands', async () => {
  const h = harness(), ws = await h.ready(); await h.run(ws);
  h.chrome.tabs.onRemoved.handlers[0](1); await until(() => h.state.activeJob === null);
  let responded = false;
  h.chrome.runtime.onMessage.handlers[0]({ type: 'disconnect' }, { id: h.chrome.runtime.id, url: 'https://chatgpt.com/', tab: { id: 1 } }, () => { responded = true; });
  await flush(); assert.equal(responded, false); assert.equal(h.local.enabled, true);
});
