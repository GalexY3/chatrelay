import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { extensionArchive } from '../scripts/package-extension.js';

test('extension archive is reproducible and contains only distributable source', async () => {
  const a = await extensionArchive(), b = await extensionArchive();
  assert.deepEqual(a.bytes, b.bytes);
  const files = unzipSync(a.bytes);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  assert.equal(manifest.version_name || manifest.version, a.version);
  assert.equal(manifest.manifest_version, 3);
  assert.ok(files['worker.js'] && files['popup.html'] && files['LICENSE'] && files['INSTALL.txt']);
  assert.ok(Object.keys(files).every(name => !name.includes('..') && !name.includes('config') && !name.includes('node_modules')));
});
