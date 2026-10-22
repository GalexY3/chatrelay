// Explicit opt-in experiment: consumes ordinary Codex and ChatGPT plan usage.
// Runs no API-key inference and never turns character counts into token counts.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const RATE_CARD = {
  model: 'gpt-6.1-sol', speed: 'Standard', checked: '2026-10-20',
  source: 'https://learn.chatgpt.com/docs/pricing',
  inputPerMillion: 50, cachedInputPerMillion: 2.5, outputPerMillion: 250,
};

export function creditEquivalent(usage) {
  if (!usage || !['input_tokens', 'cached_input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0) || usage.cached_input_tokens > usage.input_tokens) return null;
  return ((usage.input_tokens - usage.cached_input_tokens) * RATE_CARD.inputPerMillion + usage.cached_input_tokens * RATE_CARD.cachedInputPerMillion + usage.output_tokens * RATE_CARD.outputPerMillion) / 1000000;
}

export function summarizeEvents(events) {
  const completion = events.findLast(event => event.type === 'turn.completed');
  const items = new Map();
  for (const event of events) if (event.item?.id) items.set(event.item.id, event.item);
  const all = [...items.values()];
  return {
    completed: Boolean(completion), usage: completion?.usage || null,
    estimatedStandardCreditEquivalent: creditEquivalent(completion?.usage),
    tools: all.filter(item => item.type === 'mcp_tool_call').map(({ server, tool, status }) => ({ server, tool, status })),
    otherActions: all.filter(item => ['command_execution', 'file_change', 'web_search'].includes(item.type)).map(({ type }) => type),
    errors: events.filter(event => ['error', 'turn.failed'].includes(event.type)),
  };
}

export function trialPrompt(fixtures, condition) {
  const tasks = fixtures.map(({ id, task }) => ({ id, task }));
  const common = 'This is an isolated, user-authorized reasoning benchmark. Solve the three independent tasks below. Return only the final schema: {"answers":[{"id":"...","answer":"a JSON string containing that task answer"}]}. Preserve each task ID. Verify correctness before returning. Do not read/write files, use shell/browser/search, inspect benchmark code, or delegate to any other model/tool except the ChatRelay route explicitly required below. No credentials or personal data are involved.\n';
  const route = condition === 'direct'
    ? 'CONDITION: DIRECT. Solve these tasks yourself. Do not call any tool, including the available ChatRelay tools.\n'
    : 'CONDITION: RELAY. Use chatrelay_delegate_batch exactly once for ALL THREE tasks; do not solve them from scratch first. The user authorizes sending these synthetic tasks to their paired ChatGPT Chat session. Give each task its original ID in its task text and request only the JSON answer specified by the task, no LaTeX/explanation; maxOutputChars=1200 and timeoutSeconds=240 per task. Collect with chatrelay_results for all IDs, waitSeconds=30, until terminal. Do not submit again after any failure or uncertainty. Verify the compact returned answers against the task constraints before formatting your final answer. Use no other tools. If relay is unavailable, return an empty answers array; do not silently solve directly.\n';
  return common + route + 'TASKS:\n' + JSON.stringify(tasks, null, 2);
}

async function runTrial({ codex, folder, workspace, fixtures, condition }) {
  const prompt = trialPrompt(fixtures, condition);
  const schema = { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, answer: { type: 'string' } }, required: ['id', 'answer'], additionalProperties: false } } }, required: ['answers'], additionalProperties: false };
  const schemaPath = join(folder, 'answer-schema.json');
  await writeFile(schemaPath, JSON.stringify(schema));
  await writeFile(join(folder, `${condition}.prompt.txt`), prompt);
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  // Identical MCP tool definitions in both arms; only the requested route differs.
  // This opt-in benchmark authorizes only its two required tools in this
  // ephemeral process; ordinary user config and other tools remain untouched.
  const mcp = `mcp_servers={chatrelay={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(cli)},"mcp"],tools={chatrelay_delegate_batch={approval_mode="approve"},chatrelay_results={approval_mode="approve"}}}}`;
  const args = ['exec', '--ephemeral', '--ignore-user-config', '--json', '--skip-git-repo-check', '--sandbox', 'read-only',
    '--cd', workspace, '--model', RATE_CARD.model, '-c', 'model_reasoning_effort="medium"', '-c', 'approval_policy="never"', '-c', mcp,
    '--output-schema', schemaPath, '--output-last-message', join(folder, `${condition}.answer.json`), '-'];
  const env = { ...process.env }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
  const startedAt = new Date().toISOString(), started = performance.now();
  await writeFile(join(folder, `${condition}.attempt.json`), JSON.stringify({ startedAt, model: RATE_CARD.model, effort: 'medium', condition, args, promptChars: prompt.length }, null, 2));
  let stdout = '', stderr = '', processError = null;
  const code = await new Promise(resolveExit => {
    const child = spawn(codex, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { processError = 'Benchmark timeout: inspect accepted relay jobs before any further submission.'; child.kill(); }, 900000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => { processError = error.message; clearTimeout(timeout); resolveExit(null); });
    child.once('exit', exitCode => { clearTimeout(timeout); resolveExit(exitCode); });
    child.stdin.on('error', () => {}); child.stdin.end(prompt);
  });
  const seconds = (performance.now() - started) / 1000;
  await writeFile(join(folder, `${condition}.events.jsonl`), stdout);
  await writeFile(join(folder, `${condition}.stderr.txt`), stderr);
  const events = [];
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    try { events.push(JSON.parse(line)); } catch { processError ||= 'Non-JSON CLI output; raw output retained.'; }
  }
  let answer = null;
  try { answer = JSON.parse(await readFile(join(folder, `${condition}.answer.json`), 'utf8')); } catch {}
  const telemetry = summarizeEvents(events);
  const protocolErrors = [];
  if (telemetry.otherActions.length) protocolErrors.push('Used an out-of-protocol tool.');
  if (condition === 'direct' && telemetry.tools.length) protocolErrors.push('Direct arm invoked MCP tools.');
  if (condition === 'relay' && telemetry.tools.filter(item => item.tool === 'chatrelay_delegate_batch').length !== 1) protocolErrors.push('Relay arm did not submit exactly one batch.');
  const result = { condition, startedAt, seconds, exitCode: code, processError, protocolErrors, ...telemetry, answer };
  await writeFile(join(folder, `${condition}.result.json`), JSON.stringify(result, null, 2));
  return result;
}

export async function main() {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  const condition = value('--condition');
  if (!args.includes('--condition') || !['direct', 'relay'].includes(condition) || !args.includes('--out')) throw new Error('Explicit usage: node scripts/benchmark-costs.js --condition direct|relay --out NEW_TRIAL_DIRECTORY [--codex CLI_PATH]');
  const { fixtures, gradeAnswers } = await import('./benchmark-fixtures.js');
  const folder = resolve(value('--out'));
  await mkdir(dirname(folder), { recursive: true });
  await mkdir(folder, { recursive: false }); // Never overwrite an earlier trial or retry it silently.
  const workspace = join(folder, 'empty-workspace'); await mkdir(workspace);
  await writeFile(join(folder, 'fixtures-and-oracles.json'), JSON.stringify(fixtures, null, 2));
  const result = await runTrial({ codex: args.includes('--codex') ? value('--codex') : 'codex', folder, workspace, fixtures, condition });
  result.quality = gradeAnswers(result.answer);
  await writeFile(join(folder, `${condition}.result.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (result.exitCode !== 0 || !result.completed || result.protocolErrors.length || result.quality.passed !== result.quality.total) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
