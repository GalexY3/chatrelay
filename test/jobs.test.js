import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Jobs, packet, publicJob, validPageUrl } from '../src/jobs.js';

test('bounded packet, validation, truncation and terminal states', () => {
  const jobs = new Jobs();
  assert.throws(() => jobs.create({ task: ' ' }));
  assert.throws(() => jobs.create({ task: 'x', context: 'x'.repeat(24001) }));
  const job = jobs.create({ task: 'Find a flaw.', context: 'Some code', maxOutputChars: 200 });
  assert.match(packet(job), /TASK:\nFind a flaw/);
  assert.equal(publicJob(job).task, undefined);
  jobs.next();
  assert.equal(jobs.event(job.id, { type: 'completed', output: 'premature' }), false);
  jobs.event(job.id, { type: 'submitted', pageUrl: 'https://chatgpt.com/c/test' });
  jobs.event(job.id, { type: 'completed', output: 'x'.repeat(500) });
  assert.equal(job.output.length, 200);
  assert.equal(job.outputChars, 500);
  assert.equal(job.truncated, true);
  assert.equal(job.task, '');
  assert.equal(job.context, '');
  assert.equal(jobs.event(job.id, { type: 'completed', output: 'duplicate' }), false);
  assert.equal(job.output.length, 200);
});

test('one dispatch at a time, cancel queue, no retry after lost connection', () => {
  const jobs = new Jobs();
  const a = jobs.create({ task: 'a' });
  const b = jobs.create({ task: 'b' });
  assert.equal(jobs.next().id, a.id);
  assert.equal(jobs.next(), null);
  jobs.cancel(b.id);
  assert.equal(b.state, 'cancelled');
  assert.equal(jobs.disconnect(), a.id);
  assert.equal(a.state, 'uncertain');
  assert.equal(jobs.next(), null);
});

test('timeouts and retention use explicit timestamps, not truthiness', () => {
  let now = 0;
  const jobs = new Jobs({ now: () => now });
  const job = jobs.create({ task: 'test', timeoutSeconds: 30 });
  jobs.next();
  now = 29999; assert.equal(jobs.expire(), null);
  now = 30000; assert.equal(jobs.expire(), job.id);
  assert.equal(job.state, 'uncertain');
  now += 3600001; jobs.prune(); assert.equal(jobs.jobs.size, 0);
});

test('never trust arbitrary URLs or output protocol events', () => {
  assert.equal(validPageUrl('https://chatgpt.com/c/a'), true);
  assert.equal(validPageUrl('https://chatgpt.com.attacker.example/c/a'), false);
  assert.equal(validPageUrl('https://user:pass@chatgpt.com/'), false);
  const jobs = new Jobs();
  const job = jobs.create({ task: 'test' }); jobs.next();
  jobs.event(job.id, { type: 'submitted', pageUrl: 'javascript:alert(1)' });
  assert.equal(job.pageUrl, null);
  jobs.event(job.id, { type: 'failed', error: 'lost response' });
  assert.equal(job.state, 'uncertain');
});

test('already-bounded browser answers keep original length and truncation metadata', () => {
  const jobs = new Jobs();
  const job = jobs.create({ task: 'test', maxOutputChars: 200 }); jobs.next();
  jobs.event(job.id, { type: 'submitted' });
  jobs.event(job.id, { type: 'completed', output: 'x'.repeat(200), outputChars: 220000, truncated: true });
  assert.equal(job.state, 'completed');
  assert.equal(job.output.length, 200);
  assert.equal(job.outputChars, 220000);
  assert.equal(job.truncated, true);
});

test('batch validation and capacity rejection never enqueue part of the work', () => {
  const jobs = new Jobs({ limit: 2 });
  const initial = jobs.create({ task: 'Existing work' });
  assert.throws(() => jobs.createMany({ tasks: [] }), /1–8/);
  assert.throws(() => jobs.createMany({ tasks: Array.from({ length: 9 }, () => ({ task: 'x' })) }), /1–8/);
  assert.throws(() => jobs.createMany({ tasks: [{ task: 'Valid first' }, { task: ' ' }] }), /Task must/);
  assert.equal(jobs.jobs.size, 1);
  assert.throws(() => jobs.createMany({ tasks: [{ task: 'One' }, { task: 'Two' }] }), /limit reached/);
  assert.deepEqual([...jobs.jobs.keys()], [initial.id]);
  assert.equal(jobs.next(), initial);
  assert.equal(jobs.next(), null);
});

test('batch shared context is combined once with each bounded task context', () => {
  const jobs = new Jobs();
  const [first, second] = jobs.createMany({
    context: 'Common reference',
    tasks: [{ task: 'Check assumptions' }, { task: 'Check arithmetic', context: 'Local numbers' }],
  });
  assert.equal(first.context, 'Common reference');
  assert.equal(second.context, 'Common reference\n\nLocal numbers');
  assert.match(packet(second), /Common reference\n\nLocal numbers/);
  const size = jobs.jobs.size;
  assert.throws(() => jobs.createMany({ context: 'x'.repeat(24000), tasks: [{ task: 'Too much', context: 'y' }] }), /Combined/);
  assert.throws(() => jobs.createMany({ context: null, tasks: [{ task: 'No' }] }), /Shared context/);
  assert.throws(() => jobs.createMany({ tasks: [{ task: 'Valid' }, null] }), /object/);
  assert.equal(jobs.jobs.size, size);
  const [boundary] = jobs.createMany({ context: 'x'.repeat(24000), tasks: [{ task: 'Fits' }] });
  assert.equal(boundary.context.length, 24000);
});

test('batch request IDs dedupe against retained work and within the same batch', () => {
  const jobs = new Jobs({ limit: 2 });
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const initial = jobs.create({ task: 'Existing work', requestId: id });
  const newTask = { task: 'Second work', requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
  const results = jobs.createMany({ tasks: [{ task: 'Existing work', requestId: id.toUpperCase() }, newTask, newTask] });
  assert.equal(results[0], initial);
  assert.equal(results[1], results[2]);
  assert.equal(jobs.jobs.size, 2);
  jobs.next();
  jobs.event(initial.id, { type: 'submitted' });
  jobs.event(initial.id, { type: 'completed', output: 'Already answered' });
  assert.equal(jobs.createMany({ tasks: [{ task: 'Existing work', requestId: id }] })[0], initial);
  assert.equal(initial.task, '');
  assert.equal(initial.state, 'completed');
});

test('conflicting IDs reject the full batch without consuming IDs or changing retention', () => {
  let now = 0;
  const jobs = new Jobs({ now: () => now });
  const old = jobs.create({ task: 'Expired result' });
  jobs.cancel(old.id);
  now = 3600001;
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  assert.throws(() => jobs.createMany({ tasks: [{ task: 'A', requestId: id }, { task: 'B', requestId: id }] }), /different task/);
  assert.deepEqual([...jobs.jobs.keys()], [old.id]);
  const [accepted] = jobs.createMany({ tasks: [{ task: 'A', requestId: id }] });
  assert.equal(accepted.id, id);
  assert.equal(jobs.jobs.has(old.id), false);
  const freshId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  assert.throws(() => jobs.createMany({ tasks: [{ task: 'New first', requestId: freshId }, { task: 'Conflict', requestId: id }] }), /different task/);
  assert.deepEqual([...jobs.jobs.keys()], [accepted.id]);
});
