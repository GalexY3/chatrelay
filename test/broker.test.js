import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startBroker, allowedOrigin } from '../src/broker.js';
import { createMcp } from '../src/mcp.js';
import { request } from '../src/client.js';
import { signRequest } from '../src/http-auth.js';
import { connectExtension } from './ws-helper.js';

const token = 'b'.repeat(64);
const origin = 'chrome-extension://' + 'a'.repeat(32);
async function extension(port) {
  return connectExtension(port, token, { origin });
}
test('MCP -> broker -> paired simulated extension -> bounded result', async t => {
  const broker = await startBroker({ port: 0, token });
  t.after(() => broker.close());
  const config = { port: broker.port, token };
  const ws = await extension(broker.port);
  const mcp = createMcp(config);
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await mcp.connect(a); await client.connect(b);
  t.after(() => client.close());
  assert.equal((await client.listTools()).tools.length, 6);
  const outgoing = once(ws, 'message');
  const submitted = await client.callTool({ name: 'chatrelay_delegate', arguments: { task: 'Review this hypothesis', maxOutputChars: 200 } });
  assert.equal(submitted.isError, undefined);
  const job = JSON.parse(submitted.content[0].text);
  const wire = JSON.parse((await outgoing)[0]);
  assert.equal(wire.id, job.id);
  assert.match(wire.prompt, /Review this hypothesis/);
  const collecting = client.callTool({ name: 'chatrelay_result', arguments: { id: job.id, waitSeconds: 2 } });
  ws.send(JSON.stringify({ type: 'job-event', id: job.id, event: { type: 'submitted' } }));
  ws.send(JSON.stringify({ type: 'job-event', id: job.id, event: { type: 'completed', output: 'a'.repeat(300) } }));
  const result = JSON.parse((await collecting).content[0].text);
  assert.equal(result.state, 'completed');
  assert.equal(result.output.length, 200);
  assert.equal(result.truncated, true);
  assert.equal(result.task, undefined);
});

test('reject unauthenticated requests, web origins and work without a paired extension', async t => {
  const broker = await startBroker({ port: 0, token });
  t.after(() => broker.close());
  const base = `http://127.0.0.1:${broker.port}`;
  assert.equal((await fetch(`${base}/status`)).status, 401);
  assert.equal((await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status, 403);
  const spoofedHostStatus = await new Promise((resolve, reject) => {
    const req = http.get(`${base}/status`, { headers: { Authorization: `Bearer ${token}`, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(spoofedHostStatus, 403);
  await assert.rejects(request({ port: broker.port, token }, '/jobs', { task: 'test' }), /No paired extension/);
  assert.equal(allowedOrigin('https://chatgpt.com'), false);
  assert.equal(allowedOrigin('chrome-extension://' + 'z'.repeat(32)), false);
  assert.equal(allowedOrigin(origin), true);
});

test('wrong pairing and disconnect cannot redispatch an ambiguous job', async t => {
  const broker = await startBroker({ port: 0, token });
  t.after(() => broker.close());
  const bad = new WebSocket(`ws://127.0.0.1:${broker.port}/extension`, { origin });
  await once(bad, 'open');
  const closed = once(bad, 'close');
  bad.send(JSON.stringify({ type: 'hello', token: 'wrong' }));
  assert.equal((await closed)[0], 1008);
  const ws = await extension(broker.port);
  const job = await request({ port: broker.port, token }, '/jobs', { task: 'test' });
  const lost = once(ws, 'close'); ws.close(); await lost;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(broker.jobs.get(job.id).state, 'uncertain');
  assert.equal(broker.jobs.next(), null);
});

test('HTTP chunk boundaries preserve accented text and emoji in delegated tasks', async t => {
  const broker = await startBroker({ port: 0, token });
  t.after(() => broker.close());
  const ws = await extension(broker.port);
  const wire = once(ws, 'message');
  const payload = Buffer.from(JSON.stringify({ task: 'España 🙂 y análisis' }));
  const boundary = payload.indexOf(Buffer.from('ñ')) + 1;
  const status = await new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${broker.port}/jobs`, {
      method: 'POST', headers: { Authorization: signRequest({ token, port: broker.port }, 'POST', '/jobs', payload).authorization, 'Content-Type': 'application/json' },
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write(payload.subarray(0, boundary));
    setImmediate(() => req.end(payload.subarray(boundary)));
  });
  assert.equal(status, 202);
  assert.match(JSON.parse((await wire)[0]).prompt, /España 🙂 y análisis/);
});

test('a malformed HTTP target returns an error without taking down the broker', async t => {
  const broker = await startBroker({ port: 0, token });
  t.after(() => broker.close());
  const status = await new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: broker.port, path: 'http://[', headers: { Authorization: signRequest({ token, port: broker.port }, 'GET', 'http://[').authorization } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(status, 400);
  assert.equal((await request({ port: broker.port, token }, '/status')).connected, false);
});

test('retrying a submission with the same operation ID cannot dispatch it twice', async t => {
  const broker = await startBroker({ port: 0, token });
  t.after(() => broker.close());
  const config = { port: broker.port, token };
  const ws = await extension(broker.port);
  const dispatched = [];
  ws.on('message', data => { const event = JSON.parse(data); if (event.type === 'run') dispatched.push(event); });
  const payload = { task: 'Only one paid generation', requestId: '11111111-1111-4111-8111-111111111111' };
  const first = await request(config, '/jobs', payload);
  const repeat = await request(config, '/jobs', payload);
  assert.equal(first.id, repeat.id);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dispatched.length, 1);
  await assert.rejects(request(config, '/jobs', { ...payload, task: 'Another question' }), /different task/);
  assert.equal(broker.jobs.jobs.size, 1);
});

test('uppercase operation IDs remain recoverable through single, multi-result and cancellation routes', async t => {
  const broker = await startBroker({ port: 0, token }); t.after(() => broker.close());
  const config = { port: broker.port, token }; await extension(broker.port);
  const id = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  const job = await request(config, '/jobs', { task: 'Recover this operation', requestId: id });
  assert.equal(job.id, id.toLowerCase());
  assert.equal((await request(config, `/jobs/${id}`)).id, job.id);
  assert.equal((await request(config, `/jobs?ids=${id}&wait=0`)).jobs[0].id, job.id);
  assert.equal((await request(config, `/jobs/${id}/cancel`, {})).state, 'cancelled');
});
