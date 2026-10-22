// Install the prepared tarball in ignored artifacts, then exercise its actual CLI.
// npm is run as Node + npm-cli.js arguments, never through a shell/.cmd string.
import { readFile, access, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { artifactNames, releaseRoot, digest } from './prepare-release.js';

const run = promisify(execFile);
const pkg = JSON.parse(await readFile(join(releaseRoot, 'package.json'), 'utf8'));
const names = artifactNames(pkg);
const tarball = join(releaseRoot, 'artifacts/release', names.runtime);
const manifest = JSON.parse(await readFile(join(releaseRoot, 'artifacts/release/release-manifest.json'), 'utf8'));
if (manifest.artifacts.find(file => file.file === names.runtime)?.sha256 !== digest(await readFile(tarball))) throw new Error('Runtime checksum does not match prepared release.');
const nodeFolder = dirname(process.execPath);
const candidates = [process.env.CHATRELAY_NPM_CLI,
  join(nodeFolder, 'node_modules/npm/bin/npm-cli.js'),
  join(nodeFolder, '../node_modules/npm/bin/npm-cli.js'),
  join(nodeFolder, '../lib/node_modules/npm/bin/npm-cli.js'),
].filter(Boolean);
let npmCli;
for (const candidate of candidates) { try { await access(candidate); npmCli = resolve(candidate); break; } catch {} }
if (!npmCli) throw new Error('npm-cli.js was not found. Use a Node.js installation with npm or set CHATRELAY_NPM_CLI to its absolute path.');
// A fresh directory on every run prevents stale files from hiding omissions.
// Keep it in ignored artifacts for inspection; no recursive deletion is needed.
const consumer = await mkdtemp(join(releaseRoot, 'artifacts/release-consumer-'));
const install = await run(process.execPath, [npmCli, 'install', '--prefix', consumer, tarball, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: releaseRoot, windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024,
});
if (install.stdout.trim()) console.log(install.stdout.trim());
const installedCli = join(consumer, 'node_modules', ...pkg.name.split('/'), 'src/cli.js');
const verified = await run(process.execPath, [join(releaseRoot, 'scripts/verify-installation.js'), installedCli], {
  cwd: releaseRoot, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024,
});
console.log(verified.stdout.trim());
console.log(`Installed source retained for inspection: ${consumer}`);
