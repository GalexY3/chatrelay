import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtures, gradeAnswers } from './benchmark-fixtures.js';

const reference = () => ({ answers: fixtures.map(({ id, expected }) => ({ id, answer: JSON.stringify(expected) })) });

test('all frozen oracle answers pass, including the independently checked optimum of 15', () => {
  const answers = reference();
  assert.equal(JSON.parse(answers.answers[1].answer).order, 'CBADGEF');
  assert.equal(JSON.parse(answers.answers[2].answer).makespan, 15);
  assert.equal(gradeAnswers(answers).allPassed, true);
});

test('grading accepts an equivalent optimal schedule with worker identities exchanged', () => {
  const answers = reference(), schedule = JSON.parse(answers.answers[2].answer);
  for (const entry of schedule.schedule) entry.worker = 3 - entry.worker;
  answers.answers[2].answer = JSON.stringify(schedule);
  assert.equal(gradeAnswers(answers).allPassed, true);
});

test('wrong traces, nonoptimal orders and invalid schedules cannot pass quality gating', () => {
  const answers = reference();
  const trace = JSON.parse(answers.answers[0].answer); trace.original[0] = false; answers.answers[0].answer = JSON.stringify(trace);
  answers.answers[1].answer = JSON.stringify({ order: 'ABCDEFG' });
  const schedule = JSON.parse(answers.answers[2].answer); schedule.schedule.forEach(entry => { entry.worker = 1; }); answers.answers[2].answer = JSON.stringify(schedule);
  const grade = gradeAnswers(answers);
  assert.equal(grade.passed, 0); assert.equal(grade.allPassed, false);
});

test('extra fields, duplicate IDs, non-JSON answers and missing tasks fail the schema gate', () => {
  for (const broken of [null, { answers: [] }, { ...reference(), extra: true }, { answers: [reference().answers[0], reference().answers[0], { id: 'two-worker-schedule', answer: 'not JSON' }] }]) {
    assert.equal(gradeAnswers(broken).allPassed, false);
  }
});
