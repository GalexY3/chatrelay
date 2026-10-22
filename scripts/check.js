import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

let failed = false;
for (const folder of ['src', 'extension', 'scripts', 'test', 'e2e']) {
  for (const entry of await readdir(folder)) {
    if (!entry.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', `${folder}/${entry}`], { stdio: 'inherit' });
    if (result.status !== 0) failed = true;
  }
}
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.manifest_version !== 3 || manifest.permissions.includes('cookies')) throw new Error('Unexpected extension permissions.');
if (pkg.version !== (manifest.version_name || manifest.version)) throw new Error('Runtime and extension display versions differ.');
if (failed) process.exitCode = 1;
else console.log('JavaScript syntax and extension manifest checks passed.');
