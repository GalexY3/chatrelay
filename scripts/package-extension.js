import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function extensionArchive() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(root, 'extension/manifest.json'), 'utf8'));
  if (pkg.version !== (manifest.version_name || manifest.version) || pkg.version.split('-')[0] !== manifest.version) throw new Error('Package and extension versions must match (version_name identifies a release candidate).');
  const archive = {};
  const fixedTime = new Date(1980, 0, 1);
  for (const file of (await readdir(join(root, 'extension'))).sort()) {
    // Explicit source types only. Never include logs, profiles, local config or arbitrary directories.
    if (!/^[a-z-]+\.(json|js|html|css)$/.test(file)) throw new Error(`Unexpected extension file: ${file}`);
    archive[file] = [new Uint8Array(await readFile(join(root, 'extension', file))), { mtime: fixedTime }];
  }
  archive['LICENSE'] = [new Uint8Array(await readFile(join(root, 'LICENSE'))), { mtime: fixedTime }];
  archive['INSTALL.txt'] = [strToU8('ChatRelay ' + pkg.version + '\nUnzip this folder, then load it unpacked in Chrome/Edge.\nRun chatrelay setup --extension and paste its temporary code into the extension.\nSelect Chat in ChatGPT. Work and unrecognized modes are rejected.\nMIT licensed. No hosted account or API key required. Your ChatGPT account limits still apply.\nExperimental independent integration. Account compatibility is limited to recorded checks; credit savings remain unmeasured.\nRelease candidates are for unpacked testing, not extension-store publication.\n'), { mtime: fixedTime }];
  return { version: pkg.version, bytes: zipSync(archive, { level: 9 }) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version, bytes } = await extensionArchive();
  const folder = join(root, 'artifacts'); await mkdir(folder, { recursive: true });
  const name = `chatrelay-extension-${version}.zip`;
  const hash = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(folder, name), bytes);
  await writeFile(join(folder, name + '.sha256'), `${hash}  ${name}\n`);
  console.log(`Created artifacts/${name} (${bytes.length} bytes) and SHA-256 checksum.`);
}
