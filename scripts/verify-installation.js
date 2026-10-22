// Verify an installed archive's actual CLI and dependencies, without a browser/account.
// Usage: node scripts/verify-installation.js /absolute/path/to/installed/src/cli.js
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

if (!process.argv[2]) throw new Error('Pass the installed CLI path.');
const cli = resolve(process.argv[2]);
const installedPackage = JSON.parse(await readFile(new URL('../package.json', pathToFileURL(cli)), 'utf8'));
const directory = await mkdtemp(join(tmpdir(), 'chatrelay-install-'));
const allocator = net.createServer();
await new Promise(resolve => allocator.listen(0, '127.0.0.1', resolve));
const port = allocator.address().port;
await new Promise(resolve => allocator.close(resolve));
const env = { ...process.env, CHATRELAY_HOME: directory };
const run = promisify(execFile);
const client = new Client({ name: 'installation-check', version: '1.0.0' });
try {
  await writeFile(join(directory, 'config.json'), JSON.stringify({ port, token: randomBytes(32).toString('hex'), backend: 'managed', managedReady: false }));
  const help = await run(process.execPath, [cli, 'help'], { env, windowsHide: true, timeout: 10000 });
  assert.match(help.stdout, /setup.*mcp/);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], env, stderr: 'pipe' }));
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 6);
  const status = JSON.parse((await client.callTool({ name: 'chatrelay_status', arguments: {} })).content[0].text);
  assert.equal(status.service, 'chatrelay'); assert.equal(status.version, installedPackage.version); assert.equal(status.connected, false);
  assert.equal(status.backend, 'managed');
  const refusal = await client.callTool({ name: 'chatrelay_delegate', arguments: { task: 'Must never send without a configured session.' } });
  assert.equal(refusal.isError, true); assert.match(refusal.content[0].text, /Run chatrelay connect/);
  const setup = await run(process.execPath, [cli, 'setup'], { env, windowsHide: true, timeout: 10000 });
  assert.match(setup.stdout, /Run chatrelay connect once/);
  const entry = JSON.parse(setup.stdout.slice(setup.stdout.indexOf('{'))).mcpServers.chatrelay;
  assert.equal(entry.command, process.execPath); assert.deepEqual(entry.args, [cli, 'mcp']);
  console.log('Installed package: CLI, six MCP tools, cold startup, setup paths and unconfigured background refusal passed. No browser launched.');
} finally {
  await client.close().catch(() => {});
  await run(process.execPath, [cli, 'stop'], { env, windowsHide: true, timeout: 10000 });
  if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Refusing cleanup outside temp directory.');
  await rm(directory, { recursive: true, force: true });
}
