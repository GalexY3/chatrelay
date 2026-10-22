import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startBroker } from '../src/broker.js';
import { request } from '../src/client.js';
import { connectExtension } from './ws-helper.js';

test('batch HTTP flow validates atomically, queues once and collects all results with one wait', async t => {
  const token = 'a'.repeat(64);
  const broker = await startBroker({ port: 0, token }); t.after(() => broker.close());
  const config = { port: broker.port, token };
  const browser = await connectExtension(broker.port, token);
  await assert.rejects(request(config, '/jobs/batch', { tasks: [{ task: 'Valid' }, { task: '' }] }), /Task/);
  assert.equal(broker.jobs.jobs.size, 0);
  const firstDispatch = once(browser, 'message');
  const input = { context: 'Shared input', tasks: [
    { task: 'Review assumptions', requestId: '11111111-1111-4111-8111-111111111111' },
    { task: 'Find counterexample', requestId: '22222222-2222-4222-8222-222222222222' },
  ] };
  const batch = await request(config, '/jobs/batch', input);
  assert.equal(batch.jobs.length, 2);
  assert.equal(batch.jobs[0].state, 'dispatched'); assert.equal(batch.jobs[1].state, 'queued');
  assert.match(JSON.parse((await firstDispatch)[0]).prompt, /Shared input/);
  const collecting = request(config, `/jobs?wait=2&ids=${batch.jobs.map(j => j.id).join(',')}`);
  const nextDispatch = once(browser, 'message');
  browser.send(JSON.stringify({ type: 'job-event', id: batch.jobs[0].id, event: { type: 'submitted' } }));
  browser.send(JSON.stringify({ type: 'job-event', id: batch.jobs[0].id, event: { type: 'completed', output: 'First result' } }));
  const second = JSON.parse((await nextDispatch)[0]); assert.equal(second.id, batch.jobs[1].id);
  browser.send(JSON.stringify({ type: 'job-event', id: second.id, event: { type: 'submitted' } }));
  browser.send(JSON.stringify({ type: 'job-event', id: second.id, event: { type: 'completed', output: 'Second result' } }));
  const results = await collecting;
  assert.deepEqual(results.jobs.map(j => j.output), ['First result', 'Second result']);
  assert.ok(results.jobs.every(j => j.state === 'completed' && j.task === undefined));
  const repeat = await request(config, '/jobs/batch', input);
  assert.ok(repeat.jobs.every(j => j.state === 'completed'));
  assert.equal(broker.jobs.jobs.size, 2);
});
