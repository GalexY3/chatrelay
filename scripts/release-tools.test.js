import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { artifactNames, inspectSourceArchive, assertExtensionParity } from './prepare-release.js';

function archive(entries) {
  const blocks = [];
  for (const [name, content, type = 48] of entries) {
    const value = Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(value.length.toString(8).padStart(11, '0') + '\0', 124);
    header.fill(32, 148, 156); header[156] = type;
    const sum = header.reduce((a, b) => a + b, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(header, value, Buffer.alloc((512 - value.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

const required = ['package.json', 'LICENSE', 'PRIVACY.md', 'SECURITY.md', 'README.md', 'src/cli.js', 'src/mcp.js', 'extension/manifest.json'].map(name => [`package/${name}`, '{}']);

test('release inspection accepts source-only archives without extracting them', () => {
  const files = inspectSourceArchive(archive(required));
  assert.equal(files.size, required.length);
  assert.equal(files.get('package/LICENSE').toString(), '{}');
});

test('release inspection rejects traversal, duplicate entries, links and local-only files', () => {
  for (const extra of [
    ['package/../secret', 'bad'], ['package/src/../../secret', 'bad'],
    ['package/src\\bad.js', 'bad'], ['package/README.md', 'duplicate'],
    ['package/src/link.js', '', 50], ['package/.env', 'bad'],
    ['package/artifacts/config.json', 'bad'], ['package/src/.private.js', 'bad'],
  ]) assert.throws(() => inspectSourceArchive(archive([...required, extra])));
});

test('release inspection requires runtime entrypoints and disclosure files', () => {
  assert.throws(() => inspectSourceArchive(archive(required.filter(([name]) => name !== 'package/PRIVACY.md'))), /Missing package entry/);
  assert.throws(() => inspectSourceArchive(archive([])), /Empty source archive/);
});

test('release filenames accept version changes and reject unsafe name/version inputs', () => {
  assert.deepEqual(artifactNames({ name: 'chatrelay-local', version: '1.0.0-rc.1' }), {
    runtime: 'chatrelay-local-1.0.0-rc.1.tgz', extension: 'chatrelay-extension-1.0.0-rc.1.zip',
  });
  for (const pkg of [{ name: '../secret', version: '1.0.0' }, { name: 'chatrelay', version: '1.0.0/secret' }, { name: 'chatrelay', version: '$(command)' }]) {
    assert.throws(() => artifactNames(pkg));
  }
});

test('same-version archives cannot mix changed, added or removed extension files or licenses', () => {
  const files = new Map([
    ['package/extension/manifest.json', Buffer.from('{"version":"0.2.0"}')],
    ['package/extension/worker.js', Buffer.from('current worker')],
    ['package/extension/auth.js', Buffer.from('current auth')],
    ['package/LICENSE', Buffer.from('current license')],
  ]);
  const zip = {
    'manifest.json': new Uint8Array(files.get('package/extension/manifest.json')),
    'worker.js': new Uint8Array(files.get('package/extension/worker.js')),
    'auth.js': new Uint8Array(files.get('package/extension/auth.js')),
    LICENSE: new Uint8Array(files.get('package/LICENSE')),
    'INSTALL.txt': Buffer.from('generated installation notes'),
  };
  assert.doesNotThrow(() => assertExtensionParity(zip, files));
  assert.throws(() => assertExtensionParity({ ...zip, 'worker.js': Buffer.from('changed same-version worker') }, files), /bytes differ for worker.js/);
  assert.throws(() => assertExtensionParity({ ...zip, LICENSE: Buffer.from('changed license') }, files), /bytes differ for LICENSE/);
  const oldRuntime = new Map(files); oldRuntime.delete('package/extension/auth.js');
  assert.throws(() => assertExtensionParity(zip, oldRuntime), /file sets differ/);
  const oldZip = { ...zip }; delete oldZip['auth.js'];
  assert.throws(() => assertExtensionParity(oldZip, files), /file sets differ/);
});
