import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcp } from '../src/mcp.js';
import { verifyRequest, verifyBody, signResponse } from '../src/http-auth.js';

const idA = '11111111-1111-4111-8111-111111111111';
const idB = '22222222-2222-4222-8222-222222222222';

async function harness(t, respond) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const data = { method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : undefined };
    requests.push(data);
    const auth = verifyRequest({ port: server.address().port, token: 'c'.repeat(64) }, req.method, req.url, req.headers.authorization);
    assert.ok(auth); assert.ok(verifyBody(auth, raw));
    const body = JSON.stringify(respond(data));
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-ChatRelay-Response': signResponse('c'.repeat(64), auth, 200, body) });
    res.end(body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const mcp = createMcp({ port: server.address().port, token: 'c'.repeat(64) });
  const client = new Client({ name: 'batch-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await mcp.connect(a); await client.connect(b);
  t.after(() => client.close());
  return { client, requests };
}

test('MCP batch sends shared context in one HTTP request and returns only job IDs and states', async t => {
  const { client, requests } = await harness(t, ({ body }) => ({ jobs: body.tasks.map((task, i) => ({
    id: i ? idB : task.requestId, state: 'queued', task: task.task, context: body.context, output: null,
  })) }));
  const result = await client.callTool({ name: 'chatrelay_delegate_batch', arguments: {
    context: 'Shared bounded reference',
    tasks: [{ task: 'Review assumptions', requestId: idA }, { task: 'Look for alternatives', maxOutputChars: 600 }],
  } });
  assert.equal(result.isError, undefined);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/jobs/batch');
  assert.match(requests[0].headers.authorization, /^ChatRelay-HMAC /);
  assert.ok(!requests[0].headers.authorization.includes('c'.repeat(64)));
  assert.equal(requests[0].body.context, 'Shared bounded reference');
  assert.equal(requests[0].body.tasks[0].context, '');
  assert.equal(requests[0].body.tasks[0].requestId, idA);
  assert.match(requests[0].body.tasks[1].requestId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(requests[0].body.tasks[1].maxOutputChars, 600);
  assert.equal(requests[0].body.tasks[0].maxOutputChars, 4000);
  assert.deepEqual(JSON.parse(result.content[0].text), { jobs: [{ id: idA, state: 'queued' }, { id: idB, state: 'queued' }] });
  assert.doesNotMatch(result.content[0].text, /Review assumptions|Shared bounded reference/);
});

test('MCP multi-result collection makes one bounded-wait request for all IDs', async t => {
  const expected = { jobs: [{ id: idA, state: 'completed', output: 'First answer' }, { id: idB, state: 'queued', output: null }] };
  const { client, requests } = await harness(t, () => expected);
  const result = await client.callTool({ name: 'chatrelay_results', arguments: { ids: [idA, idB], waitSeconds: 2 } });
  assert.equal(result.isError, undefined);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'GET');
  const url = new URL(requests[0].url, 'http://127.0.0.1');
  assert.equal(url.pathname, '/jobs');
  assert.equal(url.searchParams.get('wait'), '2');
  assert.equal(url.searchParams.get('ids'), `${idA},${idB}`);
  assert.deepEqual(JSON.parse(result.content[0].text), expected);
});

test('MCP schemas reject oversized batches, empty ID lists and excess waits before network access', async t => {
  const { client, requests } = await harness(t, () => ({ jobs: [] }));
  const invalid = [
    { name: 'chatrelay_delegate_batch', arguments: { tasks: [] } },
    { name: 'chatrelay_delegate_batch', arguments: { tasks: Array.from({ length: 9 }, () => ({ task: 'Too many' })) } },
    { name: 'chatrelay_results', arguments: { ids: [] } },
    { name: 'chatrelay_results', arguments: { ids: [idA], waitSeconds: 31 } },
  ];
  for (const call of invalid) assert.equal((await client.callTool(call)).isError, true);
  assert.equal(requests.length, 0);
});
