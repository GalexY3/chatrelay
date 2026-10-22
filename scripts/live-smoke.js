// Explicit live-account check, never run by CI. Sign-in is always manual.
// Run from the repository: node scripts/live-smoke.js
import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startBroker } from '../src/broker.js';
import { request } from '../src/client.js';
import { VERSION } from '../src/version.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = join(root, 'artifacts/live-profile');
const temporary = await mkdtemp(join(tmpdir(), 'chatrelay-live-'));
const token = randomBytes(32).toString('hex');
const broker = await startBroker({ port: 0, token });
const client = new Client({ name: 'chatrelay-live-check', version: VERSION });
let context;
const terminal = createInterface({ input: process.stdin, output: process.stdout });
try {
  await mkdir(profile, { recursive: true, mode: 0o700 });
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: false,
    ...(process.env.CHATRELAY_E2E_BROWSER_EXECUTABLE ? { executablePath: process.env.CHATRELAY_E2E_BROWSER_EXECUTABLE } : {}),
    args: [`--disable-extensions-except=${join(root, 'extension')}`, `--load-extension=${join(root, 'extension')}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const config = { port: broker.port, token };
  await writeFile(join(temporary, 'config.json'), JSON.stringify(config), { mode: 0o600 });
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  const pairing = await request(config, '/pairing', {});
  await popup.locator('#code').fill(pairing.code);
  await popup.getByRole('button', { name: 'Connect', exact: true }).click();
  await popup.locator('#status').filter({ hasText: 'Connected. Ready' }).waitFor();
  const page = await context.newPage(); await page.goto('https://chatgpt.com/'); await page.bringToFront();
  console.log(`Dedicated test window ready. Sign in manually and select Chat. Local profile: ${profile}`);
  console.log('One short real prompt will be sent only after you type run. Chat account limits apply.');
  if ((await terminal.question('Type run to test, or anything else to stop: ')).trim() !== 'run') throw new Error('Live check cancelled before submission.');
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'src/cli.js'), 'mcp'], env: { ...process.env, CHATRELAY_HOME: temporary }, stderr: 'pipe' }));
  const marker = 'CHATRELAY_OK_20261020';
  const submission = await client.callTool({ name: 'chatrelay_delegate', arguments: {
    task: `Integration check. Without tools or browsing, respond exactly ${marker}: 7. Verify that 2 + 5 = 7.`, maxOutputChars: 200, timeoutSeconds: 120,
  } });
  if (submission.isError) throw new Error(submission.content[0].text);
  const job = JSON.parse(submission.content[0].text);
  console.log('Submitted once. Waiting through the actual MCP/broker/extension pipeline.');
  let result;
  for (let i = 0; i < 5; i++) {
    const response = await client.callTool({ name: 'chatrelay_result', arguments: { id: job.id, waitSeconds: 30 } });
    if (response.isError) throw new Error(response.content[0].text);
    result = JSON.parse(response.content[0].text);
    if (['completed', 'failed', 'cancelled', 'uncertain'].includes(result.state)) break;
  }
  const passed = result?.state === 'completed' && result.submitted && new RegExp(`^${marker}:\\s*7$`).test(result.output?.trim());
  const evidence = { version: VERSION, checkedAt: new Date().toISOString(), node: process.version, browser: context.browser()?.version(), scope: 'actual MCP + local broker + MV3 extension + user Chat account', state: result?.state, submitted: result?.submitted, expectedAnswer: passed, error: result?.error || null, quotaSavingsMeasured: false };
  await writeFile(join(root, 'artifacts/live-extension-result.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (!passed) throw new Error(result?.error || `Live result was ${result?.state || 'missing'} or did not match. Never retry an uncertain submission automatically.`);
  console.log('Live end-to-end check passed. Public-safe evidence: artifacts/live-extension-result.json');
} finally {
  terminal.close(); await client.close().catch(() => {}); await context?.close(); await broker.close();
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep)) throw new Error('Refusing cleanup outside temporary directory.');
  await rm(temporary, { recursive: true, force: true });
  console.log('Test service stopped. The dedicated signed-in profile remains local and Git-ignored; do not publish it.');
}
