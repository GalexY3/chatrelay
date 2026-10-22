import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Pairing } from '../src/pairing.js';
import { startBroker } from '../src/broker.js';
import { request } from '../src/client.js';
import { connectExtension, openExtension } from './ws-helper.js';
import { clientProof } from '../src/ws-auth.js';

test('temporary codes expire and can be consumed only once', () => {
  let now = 0; const pairing = new Pairing({ now: () => now });
  const code = pairing.issue(39391);
  assert.match(code.code, /^cr1:39391:[a-f0-9]{64}$/);
  const ticket = code.code.split(':')[2];
  assert.equal(pairing.consume(ticket), true);
  assert.equal(pairing.consume(ticket), false);
  const expired = pairing.issue(39391).code.split(':')[2];
  now = 120001; assert.equal(pairing.consume(expired), false);
  for (let i = 0; i < 20; i++) pairing.issue(39391);
  assert.equal(pairing.tickets.size, 5);
});

test('a temporary code exchanges the permanent credential locally and cannot pair a second browser', async t => {
  const token = 'f'.repeat(64);
  const broker = await startBroker({ port: 0, token }); t.after(() => broker.close());
  const config = { port: broker.port, token };
  const issued = await request(config, '/pairing', {});
  assert.ok(!issued.code.includes(token));
  const ticket = issued.code.split(':')[2];
  const first = await connectExtension(broker.port, ticket);
  assert.equal(first.pairedCredential, token);
  const gone = once(first, 'close'); first.close(); await gone;
  await new Promise(resolve => setTimeout(resolve, 20));
  const { ws: second, value } = await openExtension(broker.port);
  const rejected = once(second, 'close'); second.send(JSON.stringify({ type: 'hello', protocol: 2, clientNonce: value.clientNonce, proof: clientProof(ticket, value) }));
  assert.equal((await rejected)[0], 1008);
});
