import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { request } from '../src/client.js';
import { verifyRequest, signResponse } from '../src/http-auth.js';

async function server(t, respond) {
  const requests = [];
  const instance = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push(body);
    const auth = verifyRequest({ port: instance.address().port, token: 'a'.repeat(64) }, req.method, req.url, req.headers.authorization);
    assert.ok(auth);
    respond(res, body, auth);
  });
  instance.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  t.after(async () => {
    instance.closeAllConnections();
    await new Promise(resolve => instance.close(resolve));
  });
  return { config: { port: instance.address().port, token: 'a'.repeat(64) }, requests };
}

for (const batch of [false, true]) {
  test(`${batch ? 'batch' : 'single'} submission keeps recovery IDs when its acknowledgement body is interrupted`, async t => {
    const { config, requests } = await server(t, res => {
      res.writeHead(202, { 'Content-Type': 'application/json', 'Content-Length': 1000 });
      res.write('{"id":"');
      setTimeout(() => res.destroy(), 20);
    });
    const input = batch ? { tasks: [{ task: 'First task' }, { task: 'Second task' }] } : { task: 'Single task' };
    await assert.rejects(request(config, batch ? '/jobs/batch' : '/jobs', input), error => {
      assert.match(error.message, /Submission outcome unknown/);
      const ids = batch ? requests[0].tasks.map(task => task.requestId) : [requests[0].requestId];
      for (const id of ids) {
        assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
        assert.ok(error.message.includes(id));
      }
      return true;
    });
    assert.equal(requests.length, 1, 'An interrupted acknowledgement must never trigger another submission.');
  });
}

test('explicit HTTP rejection retains the broker error instead of implying uncertain submission', async t => {
  const { config, requests } = await server(t, (res, _, auth) => {
    const body = JSON.stringify({ error: 'Batch validation failed.' });
    res.writeHead(400, { 'Content-Type': 'application/json', 'X-ChatRelay-Response': signResponse('a'.repeat(64), auth, 400, body) });
    res.end(body);
  });
  await assert.rejects(request(config, '/jobs/batch', { tasks: [{ task: 'Question' }] }), { message: 'Batch validation failed.' });
  assert.equal(requests.length, 1);
});
