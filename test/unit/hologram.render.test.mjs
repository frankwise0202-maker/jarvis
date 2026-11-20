// The hologram renderer with format v2 shapes, in real headless Chromium (platform harness; WebGL on
// SwiftShader) with the app's CSP: each v2 fixture streamed in 250-character deltas through
// parsePartialJson -> updateSpec, then the final setSpec. Every shape is built once (shapesRebuilt
// 0), hull and panel chunks upgrade at most twice each (empty -> coarse -> fine), no panel is left
// without its host's mesh, the hulls are meshed in the worker (assets/hull-worker.js), and
// settled() resolves. Without Worker (or with the worker script missing) meshing falls back to the
// main thread and still settles.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHarness, ROOT } from './platform.harness.test.mjs';

const FIXTURES = ['camry', 'f150', 'alternator', 'turbofan', 'model3', 'cessna'];
const fixture = (name) => readFileSync(path.join(ROOT, 'test', 'mock', 'fixtures', 'v2', `${name}.json`), 'utf8');

let harness;
let worker = '';
before(async () => {
  const esbuild = await import('esbuild');
  const out = await esbuild.build({ entryPoints: [path.join(ROOT, 'src', 'ui', 'hologram', 'hull-worker.js')], bundle: true, format: 'iife', target: ['es2020', 'safari15'], write: false, logLevel: 'silent' });
  worker = out.outputFiles[0].text;
  harness = await createHarness(
    { hologram: 'src/ui/hologram/hologram.js', spec: 'src/lib/hologram-spec.js', util: 'src/engine/util.js' },
    { routes: { '/assets/hull-worker.js': (req, res) => serveWorker(res) } },
  );
});
after(async () => {
  if (harness) await harness.close();
});

let workerRequests = 0;
let workerMissing = false;
function serveWorker(res) {
  workerRequests++;
  if (workerMissing) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
  res.end(worker);
}

/** Streams `text` into a fresh hologram in 250-character deltas, then sets the final spec and waits. */
async function stream(page, text, { settleMs = 60000 } = {}) {
  return page.evaluate(
    async ({ text, settleMs }) => {
      const { createHologram } = window.__mods.hologram;
      const { parsePartialJson } = window.__mods.util;
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:420px';
      document.body.append(host);
      const holo = createHologram(host, { labels: false, autoRotate: false, reveal: false });
      let slowest = 0;
      for (let i = 250; i < text.length + 250; i += 250) {
        const draft = parsePartialJson(text.slice(0, i));
        if (!draft) continue;
        const t0 = performance.now();
        holo.updateSpec(draft);
        slowest = Math.max(slowest, performance.now() - t0);
      }
      const t0 = performance.now();
      const res = holo.setSpec(JSON.parse(text));
      const settled = await holo.settled(settleMs);
      const ms = Math.round(performance.now() - t0);
      const info = holo.debugInfo();
      const state = holo.getState();
      holo.dispose();
      // the same hologram reopened (a saved one): it must look exactly like the finished live build
      const again = createHologram(host, { labels: false, autoRotate: false, reveal: false });
      again.setSpec(JSON.parse(text));
      const reopenSettled = await again.settled(settleMs);
      const reopen = again.debugInfo();
      again.dispose();
      host.remove();
      return { ok: res.ok, settled, ms, slowest: Math.round(slowest), parts: state.parts, info, reopenSettled, reopen: { triangles: reopen.triangles, meshes: reopen.meshes } };
    },
    { text, settleMs },
  );
}

test('streaming every v2 fixture: each shape built once, hulls meshed in the worker, at most two upgrades each, settled', async (t) => {
  workerMissing = false;
  workerRequests = 0;
  const page = await harness.newPage();
  for (const name of FIXTURES) {
    const text = fixture(name);
    const spec = JSON.parse(text);
    const r = await stream(page, text);
    const { info } = r;
    const msg = `${name}: ${JSON.stringify({ ms: r.ms, slowest: r.slowest, meshes: info.meshes, upgrades: info.hullUpgrades, rescaled: info.hullRescaled, detail: info.detailRebuilt, triangles: info.triangles, reopen: r.reopen.triangles })}`;
    t.diagnostic(msg);
    assert.equal(r.ok, true, msg);
    assert.equal(r.settled, true, msg);
    assert.equal(r.parts, spec.parts.length, msg);
    assert.equal(info.shapesRebuilt, 0, `${msg}: no shape is ever built twice while streaming`);
    const async = info.meshes.hulls + info.meshes.panels;
    assert.ok(info.hullUpgrades <= 2 * async, `${msg}: at most coarse then fine for each hull and panel`);
    assert.equal(info.meshes.pending, 0, msg);
    assert.equal(info.meshes.empty, 0, `${msg}: every hull meshed, no panel without its host`);
    assert.ok(info.triangles <= 200000, msg);
    if (async) assert.equal(info.hullStats.worker, true, `${msg}: meshed in the worker`);
    // a live build ends exactly like the same hologram reopened (the same detail everywhere)
    assert.equal(r.reopenSettled, true, msg);
    assert.equal(r.reopen.triangles, info.triangles, `${msg}: live build and reopen tessellate alike`);
    // the F-150 is built cab first: its cab was meshed while the model looked smaller
    if (name === 'f150') assert.ok(info.hullRescaled >= 1, msg);
    if (name === 'camry') assert.equal(info.hullRescaled, 0, msg);
  }
  assert.equal(workerRequests, 1, 'one worker for every hologram on the page');
  assert.deepEqual(await page.cspViolations(), []);
  assert.deepEqual(page.problems, []);
});

test('without Worker, hulls mesh on the main thread and the hologram still settles', async () => {
  workerRequests = 0;
  const page = await harness.newPage({ init: () => Object.defineProperty(window, 'Worker', { value: undefined, configurable: true }) });
  // (one job per task on the main thread: slower than the worker, so the smaller hull car)
  const r = await stream(page, fixture('model3'));
  assert.equal(r.settled, true, JSON.stringify(r.info.meshes));
  assert.equal(r.info.hullStats.worker, false);
  assert.equal(r.info.meshes.empty, 0);
  assert.equal(r.info.shapesRebuilt, 0);
  assert.equal(workerRequests, 0);
  assert.deepEqual(page.problems, []);
});

test('a worker script that fails to load: the jobs it had move to the main thread', async () => {
  workerMissing = true;
  workerRequests = 0;
  const page = await harness.newPage();
  const r = await stream(page, fixture('model3'));
  workerMissing = false;
  assert.equal(r.settled, true, JSON.stringify(r.info.meshes));
  assert.ok(workerRequests >= 1, 'it tried the worker');
  assert.equal(r.info.hullStats.worker, false);
  assert.equal(r.info.meshes.empty, 0);
  // the failed load is the only console noise (a 404), nothing thrown
  assert.ok(page.problems.every((p) => /404|Failed to load|hull-worker/i.test(p)), page.problems.join('\n'));
});
