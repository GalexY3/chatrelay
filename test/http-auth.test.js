import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { signRequest, verifyRequest, verifyBody, signResponse, verifyResponse, ReplayGuard } from '../src/http-auth.js';
import { startBroker } from '../src/broker.js';
import { request } from '../src/client.js';
import { probe } from '../src/lifecycle.js';

const config = { port: 39391, token: 'a'.repeat(64) };
test('HTTP proofs bind port, method, target, time and body without transmitting the credential', () => {
  const now = 1800000000000, body = '{"task":"España 🙂"}';
  const auth = signRequest(config, 'POST', '/jobs', body, { now });
  assert.ok(!auth.authorization.includes(config.token));
  assert.deepEqual(verifyRequest(config, 'POST', '/jobs', auth.authorization, { now }), {
    timestamp: auth.timestamp, nonce: auth.nonce, bodyHash: auth.bodyHash, signature: auth.signature,
  });
  for (const [other, method, path, time] of [[{ ...config, port: 39392 }, 'POST', '/jobs', now], [config, 'GET', '/jobs', now], [config, 'POST', '/shutdown', now], [config, 'POST', '/jobs', now + 30001]]) {
    assert.equal(verifyRequest(other, method, path, auth.authorization, { now: time }), null);
  }
  assert.equal(verifyBody(auth, body), true); assert.equal(verifyBody(auth, body + ' '), false);
  const answer = '{"output":"result"}', proof = signResponse(config.token, auth, 202, answer);
  assert.equal(verifyResponse(config.token, auth, 202, answer, proof), true);
  assert.equal(verifyResponse(config.token, auth, 200, answer, proof), false);
  assert.equal(verifyResponse(config.token, auth, 202, answer + ' ', proof), false);
  assert.equal(verifyResponse(config.token, signRequest(config, 'POST', '/jobs', body), 202, answer, proof), false);
});

test('replay guard bounds memory without evicting a still-valid request nonce', () => {
  let now = 0; const guard = new ReplayGuard({ now: () => now, limit: 2 });
  assert.equal(guard.accept('a'), true); assert.equal(guard.accept('a'), false);
  assert.equal(guard.accept('b'), true); assert.throws(() => guard.accept('c'), /capacity/);
  assert.equal(guard.accept('a'), false);
  now = 90001; assert.equal(guard.accept('a'), true);
});

test('broker rejects replayed and modified signed HTTP operations before side effects', async t => {
  const broker = await startBroker({ port: 0, token: config.token }); t.after(() => broker.close());
  const target = { ...config, port: broker.port }, base = `http://127.0.0.1:${broker.port}`;
  const auth = signRequest(target, 'POST', '/pairing', '{}');
  const first = await fetch(base + '/pairing', { method: 'POST', body: '{}', headers: { Authorization: auth.authorization } });
  const body = await first.text(); assert.equal(first.status, 201);
  assert.ok(verifyResponse(config.token, auth, first.status, body, first.headers.get('x-chatrelay-response')));
  const again = await fetch(base + '/pairing', { method: 'POST', body: '{}', headers: { Authorization: auth.authorization } });
  assert.equal(again.status, 401); assert.match((await again.json()).error, /nonce/);
  const tampered = signRequest(target, 'POST', '/pairing', '{}');
  const changed = await fetch(base + '/pairing', { method: 'POST', body: '{"changed":true}', headers: { Authorization: tampered.authorization } });
  assert.equal(changed.status, 401); assert.match((await changed.json()).error, /body/);
  assert.equal((await request(target, '/status')).service, 'chatrelay');
});

test('an unrelated local service cannot obtain the credential or forge a healthy broker response', async t => {
  let authorization;
  const other = http.createServer((req, res) => {
    authorization = req.headers.authorization; req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"service":"chatrelay","connected":true}');
  });
  other.listen(0, '127.0.0.1'); await once(other, 'listening');
  t.after(() => { other.closeAllConnections(); other.close(); });
  await assert.rejects(probe({ ...config, port: other.address().port }), /identity could not be verified/);
  assert.ok(authorization.startsWith('ChatRelay-HMAC ')); assert.ok(!authorization.includes(config.token));
});

test('an oversized unverified response is bounded before parsing or returning data to the host', async t => {
  const other = http.createServer((req, res) => { req.resume(); res.end('x'.repeat(1000001)); });
  other.listen(0, '127.0.0.1'); await once(other, 'listening');
  t.after(() => { other.closeAllConnections(); other.close(); });
  await assert.rejects(request({ ...config, port: other.address().port }, '/status'), /protocol limit/);
});
