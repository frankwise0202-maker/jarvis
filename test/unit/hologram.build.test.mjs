// The hull worker in the real build (scripts/build.mjs): dist/assets/hull-worker.js is a classic
// worker script (an IIFE: it starts everywhere, Safari included), it is in the service worker's
// precache list (holograms with hull bodies work offline), and the Content-Security-Policy is the
// same as before (worker-src 'self' already allows it: no blob: workers, no eval).
// Built from a temporary root that links the sources (not the 400 MB natural-voice model).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../scripts/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('build: assets/hull-worker.js is a classic worker, precached, under the unchanged CSP', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'jarvis-hull-build-'));
  try {
    for (const name of ['src', 'node_modules', 'package.json']) symlinkSync(path.join(ROOT, name), path.join(tmp, name));
    cpSync(path.join(ROOT, 'public'), path.join(tmp, 'public'), { recursive: true });
    const res = await build({ root: tmp, quiet: true });
    const dist = path.join(tmp, 'dist');
    const file = path.join(dist, 'assets', 'hull-worker.js');
    assert.ok(existsSync(file), 'the worker is built next to app.js');
    const worker = readFileSync(file, 'utf8');
    assert.match(worker.slice(0, 40), /^\s*(?:"use strict";)?\s*\(\(\)\s*=>/, 'an IIFE (a classic worker script)');
    assert.doesNotMatch(worker, /^\s*(?:import|export)\s/m, 'no module syntax');
    assert.doesNotMatch(worker, /\bnew Function\(|\beval\(/, 'nothing the CSP would block');
    assert.match(worker, /onmessage/);
    assert.ok(worker.length < 64 * 1024, `${worker.length} bytes`);
    // precached like every other asset (cache first, so it loads offline)
    assert.ok(res.precache.includes('./assets/hull-worker.js'), res.precache.join(', '));
    assert.ok(!res.precache.includes('./assets/hull-worker.js.map'));
    const sw = readFileSync(path.join(dist, 'sw.js'), 'utf8');
    assert.ok(sw.includes('"./assets/hull-worker.js"'), 'in the built service worker');
    // the CSP is the app's own, unchanged: the worker loads under worker-src 'self'
    const csp = (html) => /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)[1];
    const built = csp(readFileSync(path.join(dist, 'index.html'), 'utf8'));
    assert.equal(built, csp(readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')));
    assert.match(built, /worker-src 'self';/);
    assert.doesNotMatch(built, /unsafe-eval|worker-src[^;]*blob:/);
    // the hologram chunk loads the worker by that path (relative to the page)
    const chunks = res.files.filter((f) => /^assets\/chunks\/hologram-.*\.js$/.test(f.path));
    assert.equal(chunks.length, 1);
    assert.ok(readFileSync(path.join(dist, chunks[0].path), 'utf8').includes('assets/hull-worker.js'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
