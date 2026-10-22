import { mkdir, readFile, writeFile, link, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

export const configDir = () => process.env.CHATRELAY_HOME || join(homedir(), '.chatrelay');
export async function initConfig() {
  const dir = configDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, 'config.json');
  const temporary = join(dir, `config-${randomUUID()}.tmp`);
  const config = { port: 39391, token: randomBytes(32).toString('hex'), backend: 'managed', managedReady: false };
  try {
    await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    // Publish a fully written file atomically, without overwriting another startup.
    try { await link(temporary, path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  } finally { await unlink(temporary).catch(() => {}); }
  return loadConfig();
}
export async function loadConfig() {
  const config = JSON.parse(await readFile(join(configDir(), 'config.json'), 'utf8'));
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || !/^[a-f0-9]{64}$/.test(config.token)) {
    throw new Error('Invalid local config. Expected port 1024–65535 and a 64-character hex pairing token.');
  }
  if (config.backend !== undefined && !['managed', 'extension'].includes(config.backend)) throw new Error('Invalid backend. Expected managed or extension.');
  if (config.managedReady !== undefined && typeof config.managedReady !== 'boolean') throw new Error('Invalid managedReady. Expected a boolean.');
  return config;
}

export async function updateConfig(patch) {
  const config = { ...await loadConfig(), ...patch };
  const path = join(configDir(), 'config.json'), temporary = join(configDir(), `config-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    const { rename } = await import('node:fs/promises'); await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
  return loadConfig();
}
