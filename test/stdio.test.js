import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startBroker } from '../src/broker.js';
import { initConfig } from '../src/config.js';

test('real stdio child process loads local config and exposes tools without browser access', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'chatrelay-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const broker = await startBroker({ port: 0, token: 'c'.repeat(64) });
  t.after(() => broker.close());
  await writeFile(join(dir, 'config.json'), JSON.stringify({ port: broker.port, token: 'c'.repeat(64) }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/cli.js', import.meta.url)), 'mcp'],
    env: { ...process.env, CHATRELAY_HOME: dir },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  await client.connect(transport);
  t.after(() => client.close());
  const status = JSON.parse((await client.callTool({ name: 'chatrelay_status', arguments: {} })).content[0].text);
  assert.equal(status.connected, false);
  const result = await client.callTool({ name: 'chatrelay_delegate', arguments: { task: 'Do not send this without a paired extension.' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No paired extension/);
  assert.equal(broker.jobs.jobs.size, 0);
});

test('initialization preserves an existing local token', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'chatrelay-config-test-'));
  const previous = process.env.CHATRELAY_HOME;
  process.env.CHATRELAY_HOME = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.CHATRELAY_HOME;
    else process.env.CHATRELAY_HOME = previous;
    await rm(dir, { recursive: true, force: true });
  });
  const initialized = await Promise.all(Array.from({ length: 12 }, () => initConfig()));
  const a = initialized[0], b = await initConfig();
  assert.ok(initialized.every(config => config.token === a.token));
  assert.equal(a.token.length, 64);
  assert.equal(a.token, b.token);
  assert.equal(JSON.parse(await readFile(join(dir, 'config.json'), 'utf8')).token, a.token);
});
