import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { clientProof, newNonce, verifyServerProof, ackProof, decryptCredential } from '../src/ws-auth.js';

export const extensionOrigin = 'chrome-extension://' + 'a'.repeat(32);
export async function openExtension(port, origin = extensionOrigin) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/extension`, { origin });
  const queue = [], waiters = [];
  const receive = data => { const packet = JSON.parse(data); if (waiters.length) waiters.shift().resolve(packet); else queue.push(packet); };
  ws.on('message', receive);
  ws.on('close', code => { for (const waiter of waiters.splice(0)) waiter.reject(new Error(`Extension closed: ${code}`)); });
  await once(ws, 'open');
  const next = () => queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  const challenge = await next(); assert.equal(challenge.type, 'challenge'); assert.equal(challenge.protocol, 2);
  return { ws, next, value: { port, origin, serverNonce: challenge.serverNonce, clientNonce: newNonce() }, release: () => ws.off('message', receive) };
}

export async function connectExtension(port, secret, { origin = extensionOrigin } = {}) {
  const session = await openExtension(port, origin);
  const { ws, next, value } = session;
  ws.send(JSON.stringify({ type: 'hello', protocol: 2, clientNonce: value.clientNonce, proof: clientProof(secret, value) }));
  const ready = await next(); assert.equal(ready.type, 'ready');
  assert.ok(verifyServerProof(secret, value, ready.proof, ready.credentialBox));
  const credential = ready.credentialBox ? decryptCredential(secret, value, ready.credentialBox) : secret;
  ws.send(JSON.stringify({ type: 'ready-ack', protocol: 2, proof: ackProof(secret, value) }));
  assert.equal((await next()).type, 'connected');
  session.release(); ws.pairedCredential = credential;
  return ws;
}
