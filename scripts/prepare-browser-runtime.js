// Optional Windows test workaround: copy the installed Playwright browser to a
// fresh private path. Downloads nothing and never edits the browser cache.
// PowerShell: $env:CHATRELAY_E2E_BROWSER_EXECUTABLE = node scripts/prepare-browser-runtime.js
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

const installedExecutable = chromium.executablePath();
await stat(installedExecutable);
if (process.platform !== 'win32') {
  console.log(installedExecutable);
} else {
  const source = dirname(installedExecutable);
  const target = resolve('artifacts', 'browser-runtime', `${basename(dirname(source))}-isolated`, basename(source));
  let copiedFiles = 0, unchangedFiles = 0;
  async function copyDirectory(from, to) {
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      const original = join(from, entry.name), copied = join(to, entry.name);
      if (entry.isDirectory()) { await copyDirectory(original, copied); continue; }
      if (!entry.isFile()) throw new Error(`Unexpected browser payload entry: ${original}`);
      const existing = await stat(copied).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (existing?.size === (await stat(original)).size && await digest(original) === await digest(copied)) {
        unchangedFiles++; continue;
      }
      // A real copy keeps future test writes independent of the cache's files.
      await copyFile(original, copied);
      copiedFiles++;
    }
  }
  await copyDirectory(source, target);
  const executable = join(target, basename(installedExecutable));
  const sha256 = await digest(installedExecutable);
  if (await digest(executable) !== sha256) throw new Error('Isolated browser executable does not match the installed browser.');
  await writeFile(resolve('artifacts', 'browser-runtime', 'prepared.json'), JSON.stringify({
    source: installedExecutable, executable, sha256, copiedFiles, unchangedFiles,
    node: process.version, platform: process.platform, downloaded: false, cacheModified: false,
  }, null, 2) + '\n');
  console.log(executable);
}
