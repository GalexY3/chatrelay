import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { request } from './client.js';

const cli = fileURLToPath(new URL('./cli.js', import.meta.url));
export async function probe(config) {
  try {
    const status = await request(config, '/status', undefined, { timeoutMs: 600 });
    if (status.service !== 'chatrelay') throw new Error('The configured port belongs to another service. Choose a different local port.');
    return status;
  } catch (error) {
    if (error.code === 'CHATRELAY_UNREACHABLE') return null;
    throw error;
  }
}

export async function ensureBroker(config, { timeoutMs = 6000, env = process.env } = {}) {
  const existing = await probe(config);
  if (existing) return { status: existing, started: false };
  // No OS startup registration or system changes: one on-demand user process.
  const child = spawn(process.execPath, [cli, 'serve'], {
    detached: true, windowsHide: true, stdio: 'ignore', env,
  });
  let launchError;
  child.on('error', error => { launchError = error; }); child.unref();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (launchError) throw new Error(`Could not start local service: ${launchError.message}`);
    await sleep(100);
    const status = await probe(config);
    if (status) return { status, started: true };
  }
  throw new Error('Local service did not become ready. Run `node src/cli.js serve` to see diagnostics.');
}
