import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { startBroker } from '../src/broker.js';
import { request } from '../src/client.js';
import { clientProof, verifyClientProof, serverProof, encryptCredential, decryptCredential, verifyAckProof } from '../src/ws-auth.js';
import { openExtension, connectExtension } from './ws-helper.js';

const token = 'f'.repeat(64), ticket = 'e'.repeat(64);
const value = { port: 39391, origin: 'chrome-extension://' + 'a'.repeat(32), serverNonce: '1'.repeat(64), clientNonce: '2'.repeat(64) };
const browserCode = await readFile(new URL('../extension/auth.js', import.meta.url), 'utf8');

test('Node and browser crypto interoperate and bind every handshake context and encrypted credential', async () => {
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array }); vm.runInContext(browserCode, context);
  const browser = context.ChatRelayAuth;
  assert.equal(await browser.clientProof(ticket, value), clientProof(ticket, value));
  assert.ok(verifyAckProof(ticket, value, await browser.ackProof(ticket, value)));
  const box = encryptCredential(ticket, value, token), proof = serverProof(ticket, value, box);
  assert.equal(await browser.verifyServerProof(ticket, value, proof, box), true);
  assert.equal(await browser.decryptCredential(ticket, value, box), token);
  assert.equal(decryptCredential(ticket, value, box), token);
  assert.ok(!JSON.stringify(box).includes(token));
  for (const modified of [{ ...value, port: 39392 }, { ...value, origin: 'chrome-extension://' + 'b'.repeat(32) }, { ...value, serverNonce: '3'.repeat(64) }, { ...value, clientNonce: '4'.repeat(64) }]) {
    assert.equal(verifyClientProof(ticket, modified, clientProof(ticket, value)), false);
    assert.equal(await browser.verifyServerProof(ticket, modified, proof, box), false);
    await assert.rejects(browser.decryptCredential(ticket, modified, box));
  }
  const changed = { ...box, ciphertext: (box.ciphertext[0] === '0' ? '1' : '0') + box.ciphertext.slice(1) };
  assert.equal(await browser.verifyServerProof(ticket, value, proof, changed), false);
  await assert.rejects(browser.decryptCredential(ticket, value, changed));
});

test('broker does not accept work until the extension acknowledges stored pairing readiness', async t => {
  const broker = await startBroker({ port: 0, token }, { authTimeoutMs: 200 }); t.after(() => broker.close());
  const config = { port: broker.port, token }, session = await openExtension(broker.port);
  session.ws.send(JSON.stringify({ type: 'hello', protocol: 2, clientNonce: session.value.clientNonce, proof: clientProof(token, session.value) }));
  assert.equal((await session.next()).type, 'ready');
  assert.equal((await request(config, '/status')).connected, false);
  await assert.rejects(request(config, '/jobs', { task: 'No dispatch before acknowledgement.' }), /No paired extension/);
  await once(session.ws, 'close'); assert.equal(broker.jobs.jobs.size, 0);
});

test('a replayed client proof cannot authenticate a new socket challenge', async t => {
  const broker = await startBroker({ port: 0, token }); t.after(() => broker.close());
  const first = await openExtension(broker.port), replay = clientProof(token, first.value);
  const gone = once(first.ws, 'close'); first.ws.close(); await gone;
  const second = await openExtension(broker.port), closed = once(second.ws, 'close');
  second.ws.send(JSON.stringify({ type: 'hello', protocol: 2, clientNonce: first.value.clientNonce, proof: replay }));
  assert.equal((await closed)[0], 1008);
});

test('an unresponsive authenticated extension loses ownership without redispatching its active work', async t => {
  const broker = await startBroker({ port: 0, token }, { heartbeatTimeoutMs: 250, heartbeatIntervalMs: 20 }); t.after(() => broker.close());
  const config = { port: broker.port, token }, ws = await connectExtension(broker.port, token), closed = once(ws, 'close');
  const first = await request(config, '/jobs', { task: 'Uncertain after heartbeat loss.' });
  const second = await request(config, '/jobs', { task: 'Still queued.' });
  await closed;
  for (let i = 0; i < 20 && (await request(config, '/status')).connected; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await request(config, `/jobs/${first.id}`)).state, 'uncertain');
  assert.equal((await request(config, `/jobs/${second.id}`)).state, 'queued');
  const resumed = await connectExtension(broker.port, token); t.after(() => resumed.terminate());
  assert.equal(broker.jobs.active, second.id); assert.equal(broker.jobs.get(first.id).state, 'uncertain');
});
