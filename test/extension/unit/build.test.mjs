// The build: a valid MV3 manifest with minimal permissions, icons, and a zip that unpacks to one
// folder; release builds carry no development hooks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildExtension, ZIP_FOLDER } from '../../../scripts/build-extension.mjs';
import { listZip } from '../../../extension/build/zip.mjs';

test('release build: manifest, icons, zip', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jarvis-ext-build-'));
  try {
    const out = path.join(dir, 'ext');
    const zipPath = path.join(dir, 'ext.zip');
    const res = await buildExtension({ outDir: out, zipPath, quiet: true });
    const m = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
    assert.equal(m.manifest_version, 3);
    assert.equal(m.name, 'Jarvis for Chrome');
    // downloads: every download that starts while Jarvis works waits for the owner (RT2-A02);
    // no activeTab: nothing uses it (RT2 T13); alarms: the 30-s tick that restarts the link to
    // Jarvis's home base when Chrome stopped the worker (v1.1, Voice from Jarvis).
    assert.deepEqual(m.permissions.sort(), ['alarms', 'debugger', 'downloads', 'sidePanel', 'storage', 'tabs']);
    assert.deepEqual(m.host_permissions, ['https://api.anthropic.com/*']);
    // The home base is asked for by name when the owner links (never granted at install), and only
    // on Tailscale; no externally_connectable: no web page can message the extension.
    assert.deepEqual(m.optional_host_permissions, ['https://*.ts.net/*']);
    assert.ok(!('externally_connectable' in m), 'no web page can message Jarvis for Chrome');
    assert.ok(!('optional_permissions' in m), 'no other optional permission');
    assert.equal(m.version, '1.1.0');
    assert.equal(m.background.service_worker, 'background.js');
    assert.equal(m.background.type, 'module');
    assert.equal(m.side_panel.default_path, 'sidepanel.html');
    assert.ok(m.commands['stop-jarvis'].suggested_key.mac, 'a Stop shortcut');
    assert.ok(m.commands._execute_action, 'a shortcut that opens Jarvis');
    assert.match(m.content_security_policy.extension_pages, /script-src 'self'/);
    assert.match(m.content_security_policy.extension_pages, /connect-src https:\/\/api\.anthropic\.com https:\/\/\*\.ts\.net(;|$)/);
    assert.ok(!('content_scripts' in m), 'nothing runs on pages Jarvis is not working on');
    for (const size of [16, 32, 48, 128]) {
      const png = await readFile(path.join(out, 'icons', `icon-${size}.png`));
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
    }
    const entries = listZip(await readFile(zipPath)).map((e) => e.name);
    assert.ok(entries.every((n) => n.startsWith(`${ZIP_FOLDER}/`)), 'one top-level folder');
    for (const f of ['manifest.json', 'background.js', 'sidepanel.html', 'sidepanel.js', 'sidepanel.css', 'mic.html', 'icons/icon-128.png']) assert.ok(entries.includes(`${ZIP_FOLDER}/${f}`), f);
    assert.ok(!entries.some((n) => n.endsWith('.map')));
    const bg = await readFile(path.join(out, 'background.js'), 'utf8');
    for (const marker of ['jarvis.dev.apiBase', '__jarvisController', 'testStop']) assert.ok(!bg.includes(marker), marker);
    assert.equal(res.version, m.version);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('development build: local mock allowed, no zip', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jarvis-ext-build-'));
  try {
    const res = await buildExtension({ dev: true, outDir: dir, quiet: true });
    assert.equal(res.zipPath, null);
    const m = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    assert.ok(m.host_permissions.includes('http://127.0.0.1/*'));
    assert.match(m.content_security_policy.extension_pages, /http:\/\/127\.0\.0\.1:\*/);
    const bg = await readFile(path.join(dir, 'background.js'), 'utf8');
    assert.ok(bg.includes('jarvis.dev.apiBase'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the Public Suffix List data matches the vendored list (RT2 T10)', async () => {
  const { generatePslModule, PSL_MODULE } = await import('../../../extension/build/psl.mjs');
  const { readFile: rf } = await import('node:fs/promises');
  assert.equal(await rf(PSL_MODULE, 'utf8'), generatePslModule(), 'regenerate with node extension/build/psl.mjs');
});
