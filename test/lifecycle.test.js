import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import net from 'node:net';
import { startBroker } from '../src/broker.js';
import { ensureBroker, probe } from '../src/lifecycle.js';
import { request } from '../src/client.js';

test('MCP reuses an authenticated existing broker instead of starting another', async t => {
  const broker = await startBroker({ port: 0, token: 'e'.repeat(64) }); t.after(() => broker.close());
  const result = await ensureBroker({ port: broker.port, token: 'e'.repeat(64) });
  assert.equal(result.started, false); assert.equal(result.status.service, 'chatrelay');
  await assert.rejects(probe({ port: broker.port, token: 'a'.repeat(64) }), /different credentials/);
});

test('on-demand startup survives concurrent callers and can be stopped explicitly', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'chatrelay-lifecycle-'));
  const allocator = net.createServer(); await new Promise(resolve => allocator.listen(0, '127.0.0.1', resolve));
  const port = allocator.address().port; await new Promise(resolve => allocator.close(resolve));
  const config = { port, token: 'e'.repeat(64) };
  await writeFile(join(dir, 'config.json'), JSON.stringify(config));
  const env = { ...process.env, CHATRELAY_HOME: dir };
  t.after(async () => {
    await request(config, '/shutdown', {}).catch(() => {});
    if (!resolve(dir).startsWith(resolve(tmpdir()) + sep)) throw new Error('Refusing cleanup outside temp directory.');
    await rm(dir, { recursive: true, force: true });
  });
  const [a, b] = await Promise.all([ensureBroker(config, { env }), ensureBroker(config, { env })]);
  assert.equal(a.status.service, 'chatrelay'); assert.equal(b.status.service, 'chatrelay');
  assert.equal((await request(config, '/status')).connected, false);
  const result = await request(config, '/shutdown', {}); assert.equal(result.stopped, true);
});
