// Synthetic, self-contained fixtures for one paired pilot of three tasks (n = 3).
// This tiny, single-batch pilot cannot establish savings in account quota or credits.
// Give models only `id` and `task`; `expected` and the oracles are local grading data.

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasKeys = (value, keys) => isObject(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

const events = [
  ['a', 0], ['b', 0], ['a', 1], ['b', 4], ['a', 5], ['b', 5], ['a', 6],
  ['b', 9], ['a', 10], ['b', 10], ['a', 11], ['a', 15], ['b', 15],
];

function traceLimiter(useNullish) {
  const last = new Map();
  return events.map(([key, time]) => {
    const previous = useNullish ? (last.get(key) ?? -Infinity) : (last.get(key) || -Infinity);
    if (time - previous < 5) return false;
    last.set(key, time);
    return true;
  });
}

const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const orderRules = [
  ['C occurs before A.', p => p.C < p.A],
  ['A occurs before F.', p => p.A < p.F],
  ['B occurs before D.', p => p.B < p.D],
  ['D occurs before G.', p => p.D < p.G],
  ['E occurs before F.', p => p.E < p.F],
  ['C and E are not adjacent.', p => Math.abs(p.C - p.E) !== 1],
  ['Exactly two letters occur between B and G.', p => Math.abs(p.B - p.G) === 3],
  ['D occurs immediately after A.', p => p.D === p.A + 1],
];

function* permutations(prefix = [], remaining = letters) {
  if (!remaining.length) {
    yield prefix;
    return;
  }
  for (let index = 0; index < remaining.length; index++) {
    yield* permutations(
      [...prefix, remaining[index]],
      remaining.filter((_, other) => other !== index),
    );
  }
}

function orderOracle() {
  // Enumerate up to all 7! permutations in ordinary A < B < ... < G order.
  for (const permutation of permutations()) {
    const positions = Object.fromEntries(permutation.map((letter, index) => [letter, index]));
    if (orderRules.every(([, accepts]) => accepts(positions))) return permutation.join('');
  }
  throw new Error('Ordering fixture has no solution.');
}

const jobs = [
  { job: 'A', duration: 3, after: [] },
  { job: 'B', duration: 4, after: [] },
  { job: 'C', duration: 2, after: ['A'] },
  { job: 'D', duration: 5, after: ['A'] },
  { job: 'E', duration: 3, after: ['B'] },
  { job: 'F', duration: 4, after: ['B', 'C'] },
  { job: 'G', duration: 2, after: ['D', 'E'] },
  { job: 'H', duration: 3, after: ['F', 'G'] },
];

function scheduleOracle() {
  const allComplete = (1 << jobs.length) - 1;
  const dependencyMasks = jobs.map(({ after }) => after.reduce(
    (mask, dependency) => mask | (1 << jobs.findIndex(({ job }) => job === dependency)), 0,
  ));
  const memo = new Map();

  function solve(completed, running, time) {
    if (completed === allComplete) return { makespan: time, starts: [] };
    const key = `${completed}|${time}|${running.map(({ index, end }) => `${index}:${end}`).join(',')}`;
    if (memo.has(key)) return memo.get(key);

    const activeMask = running.reduce((mask, { index }) => mask | (1 << index), completed);
    const ready = jobs.flatMap((_, index) => (
      !(activeMask & (1 << index))
      && (dependencyMasks[index] & completed) === dependencyMasks[index] ? [index] : []
    ));
    const free = 2 - running.length;
    let best = null;
    for (let subset = 0; subset < (1 << ready.length); subset++) {
      const chosen = ready.filter((_, bit) => subset & (1 << bit));
      if (chosen.length > free || (!running.length && !chosen.length)) continue;
      const nextRunning = [
        ...running,
        ...chosen.map(index => ({ index, end: time + jobs[index].duration })),
      ].sort((left, right) => left.index - right.index);
      const nextTime = Math.min(...nextRunning.map(({ end }) => end));
      const nextCompleted = nextRunning.reduce(
        (mask, { index, end }) => end === nextTime ? mask | (1 << index) : mask, completed,
      );
      const continuation = solve(
        nextCompleted, nextRunning.filter(({ end }) => end > nextTime), nextTime,
      );
      if (continuation && (!best || continuation.makespan < best.makespan)) {
        best = {
          makespan: continuation.makespan,
          starts: [...chosen.map(index => ({ index, start: time })), ...continuation.starts],
        };
      }
    }
    // Subsets include intentional idling until the next completion. Starting a ready
    // job at an arbitrary intervening time cannot improve on starting it now: no
    // dependency or worker becomes available between consecutive completion events.
    memo.set(key, best);
    return best;
  }

  const optimum = solve(0, [], 0);
  if (!optimum) throw new Error('Scheduling fixture has no solution.');
  const workerEnds = [0, 0];
  const schedule = [...optimum.starts]
    .sort((left, right) => left.start - right.start || left.index - right.index)
    .map(({ index, start }) => {
      const worker = workerEnds.findIndex(end => end <= start);
      if (worker < 0) throw new Error('Scheduling oracle exceeded two workers.');
      workerEnds[worker] = start + jobs[index].duration;
      return { job: jobs[index].job, worker: worker + 1, start };
    });
  return { makespan: optimum.makespan, schedule };
}

export const fixtures = [
  {
    id: 'limiter-zero',
    task: `Evaluate this JavaScript rate limiter for the given events, in their listed order.
The interval is 5. Each event is [key, timestamp]. Timestamps are integers.
The Map starts empty. Only accepted events update it. A difference of exactly 5 is accepted.

function trace(events) {
  const last = new Map();
  return events.map(([key, time]) => {
    const previous = last.get(key) || -Infinity;
    if (time - previous < 5) return false;
    last.set(key, time);
    return true;
  });
}

Events: ${JSON.stringify(events)}
Compute the original trace, then the corrected trace after replacing only || with ??.
Return only JSON with exactly these keys: {"original":[booleans],"corrected":[booleans]}.
Both arrays must contain one boolean per event.`,
    expected: { original: traceLimiter(false), corrected: traceLimiter(true) },
  },
  {
    id: 'lex-order',
    task: `Arrange A, B, C, D, E, F, G, each exactly once, into the lexicographically
smallest string satisfying all eight constraints. Lexicographic order uses A < B < C < D < E < F < G.
${orderRules.map(([text], index) => `${index + 1}. ${text}`).join('\n')}
Return only JSON with exactly one key: {"order":"seven-letter string"}.`,
    expected: { order: orderOracle() },
  },
  {
    id: 'two-worker-schedule',
    task: `Schedule all eight jobs on two identical workers, numbered 1 and 2.
Time starts at 0. Each job runs once, continuously for its given duration on one worker.
A worker cannot run overlapping jobs. Jobs may start when all listed predecessors have finished;
starting exactly when another job finishes is allowed. Start times must be nonnegative integers.
Idle time is allowed. Minimize the makespan, the latest job finishing time.
Jobs (after lists all immediate predecessors): ${JSON.stringify(jobs)}
Return only JSON with exactly these keys:
{"makespan":minimum_integer,"schedule":[{"job":"A","worker":1,"start":0},...]}
The schedule must contain all eight jobs exactly once. Any feasible optimal schedule is accepted.`,
    expected: scheduleOracle(),
  },
];

function gradeTrace(answer, expected) {
  if (!hasKeys(answer, ['original', 'corrected'])) return ['Expected exactly original and corrected.'];
  const errors = [];
  for (const key of ['original', 'corrected']) {
    if (!Array.isArray(answer[key]) || answer[key].length !== events.length
      || answer[key].some(value => typeof value !== 'boolean')) {
      errors.push(`${key} must contain exactly ${events.length} booleans.`);
    } else if (JSON.stringify(answer[key]) !== JSON.stringify(expected[key])) {
      errors.push(`${key} acceptance trace is incorrect.`);
    }
  }
  return errors;
}

function gradeOrder(answer, expected) {
  if (!hasKeys(answer, ['order']) || typeof answer.order !== 'string') {
    return ['Expected exactly one string field, order.'];
  }
  return answer.order === expected.order ? [] : ['The order is not the lexicographically smallest valid order.'];
}

function gradeSchedule(answer, expected) {
  if (!hasKeys(answer, ['makespan', 'schedule']) || !Number.isInteger(answer.makespan)
    || !Array.isArray(answer.schedule) || answer.schedule.length !== jobs.length) {
    return ['Expected integer makespan and a schedule containing exactly eight jobs.'];
  }
  const errors = [];
  const records = new Map();
  for (const entry of answer.schedule) {
    if (!hasKeys(entry, ['job', 'worker', 'start'])
      || !jobs.some(({ job }) => job === entry.job)
      || ![1, 2].includes(entry.worker) || !Number.isInteger(entry.start) || entry.start < 0) {
      errors.push('Each entry needs a known job, worker 1 or 2, and a nonnegative integer start.');
      continue;
    }
    if (records.has(entry.job)) errors.push(`Job ${entry.job} occurs more than once.`);
    records.set(entry.job, entry);
  }
  for (const { job } of jobs) if (!records.has(job)) errors.push(`Job ${job} is missing.`);
  if (errors.length) return errors;

  const finish = job => records.get(job).start + jobs.find(candidate => candidate.job === job).duration;
  for (const { job, after } of jobs) {
    for (const predecessor of after) {
      if (records.get(job).start < finish(predecessor)) {
        errors.push(`Job ${job} starts before predecessor ${predecessor} finishes.`);
      }
    }
  }
  for (let left = 0; left < jobs.length; left++) {
    for (let right = left + 1; right < jobs.length; right++) {
      const a = records.get(jobs[left].job);
      const b = records.get(jobs[right].job);
      if (a.worker === b.worker && a.start < finish(b.job) && b.start < finish(a.job)) {
        errors.push(`Jobs ${a.job} and ${b.job} overlap on worker ${a.worker}.`);
      }
    }
  }
  const actualMakespan = Math.max(...jobs.map(({ job }) => finish(job)));
  if (answer.makespan !== actualMakespan) errors.push('Reported makespan differs from the schedule.');
  if (answer.makespan !== expected.makespan) errors.push(`Makespan is not the minimum ${expected.makespan}.`);
  return errors;
}

const graders = [gradeTrace, gradeOrder, gradeSchedule];

// Required final schema: {answers:[{id,answer}]}; answer is a JSON string, not an object.
// No model or network calls occur during oracle generation or grading.
export function gradeAnswers(finalObject) {
  const schemaErrors = [];
  if (!hasKeys(finalObject, ['answers']) || !Array.isArray(finalObject.answers)) {
    schemaErrors.push('Final output must be an object containing only an answers array.');
  }
  const submitted = Array.isArray(finalObject?.answers) ? finalObject.answers : [];
  if (submitted.length !== fixtures.length) schemaErrors.push('Expected exactly three answers.');
  for (const entry of submitted) {
    if (!hasKeys(entry, ['id', 'answer']) || typeof entry.id !== 'string'
      || typeof entry.answer !== 'string') {
      schemaErrors.push('Each answer must contain only a string id and a string answer.');
    } else if (!fixtures.some(({ id }) => id === entry.id)) {
      schemaErrors.push(`Unknown fixture id: ${entry.id}.`);
    }
  }

  const results = fixtures.map((fixture, index) => {
    const entries = submitted.filter(entry => entry?.id === fixture.id);
    const errors = [...schemaErrors];
    if (entries.length !== 1) {
      errors.push(`Expected exactly one answer for ${fixture.id}.`);
    } else if (!hasKeys(entries[0], ['id', 'answer']) || typeof entries[0].answer !== 'string') {
      errors.push('answer must be a JSON string.');
    } else {
      try {
        errors.push(...graders[index](JSON.parse(entries[0].answer), fixture.expected));
      } catch {
        errors.push('answer is not valid JSON.');
      }
    }
    return { id: fixture.id, passed: errors.length === 0, errors };
  });
  const passed = results.filter(result => result.passed).length;
  return {
    passed,
    total: fixtures.length,
    score: passed / fixtures.length,
    allPassed: passed === fixtures.length && schemaErrors.length === 0,
    schemaErrors,
    results,
  };
}
