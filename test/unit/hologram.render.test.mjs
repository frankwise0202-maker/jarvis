// The hologram renderer with format v2 shapes, in real headless Chromium (platform harness; WebGL on
// SwiftShader) with the app's CSP: each v2 fixture streamed in 250-character deltas through
// parsePartialJson -> updateSpec, then the final setSpec. Every shape is built once (shapesRebuilt
// 0), hull and panel chunks upgrade at most twice each (empty -> coarse -> fine), no panel is left
// without its host's mesh, the hulls are meshed in the worker (assets/hull-worker.js), and
// settled() resolves. Without Worker (or with the worker script missing) meshing falls back to the
// main thread and still settles. The viewer takes a saved hull car's library thumbnail only once its
// meshes have settled.
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
    { hologram: 'src/ui/hologram/hologram.js', viewer: 'src/ui/hologram/viewer.js', spec: 'src/lib/hologram-spec.js', util: 'src/engine/util.js' },
    { routes: { '/assets/hull-worker.js': (req, res) => serveWorker(res) } },
  );
});
after(async () => {
  if (harness) await harness.close();
});

let workerRequests = 0;
let workerMissing = false;
let workerDelayMs = 0;
function serveWorker(res) {
  workerRequests++;
  if (workerDelayMs) {
    // a slow start (a phone on a cold cache): the script arrives after this long
    const ms = workerDelayMs;
    workerDelayMs = 0;
    setTimeout(() => sendWorker(res), ms);
    return;
  }
  sendWorker(res);
}
function sendWorker(res) {
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

test('the viewer takes a saved hull car\'s library thumbnail once its meshes have settled', async () => {
  workerMissing = false;
  workerRequests = 0;
  // a slow worker start: the thumbnail's first chance (900 ms after the first full render) comes
  // while every hull and panel is still meshing; it waits for them (at most 4 s)
  workerDelayMs = 1500;
  const page = await harness.newPage();
  const r = await page.evaluate(async (text) => {
    const { openHologramViewer } = window.__mods.viewer;
    const { normalizeHologramSpec } = window.__mods.spec;
    const full = normalizeHologramSpec(JSON.parse(text)).spec;
    const shots = [];
    let root = null;
    const t0 = performance.now();
    const library = {
      get: async (id) => ({ id, kind: 'hologram', title: full.title, spec: full, thumbnail: null }),
      findPartBlueprint: async () => null,
      setThumbnail: async (id, url) => shots.push({ id, meshing: root && root.dataset.meshing, jpeg: url.startsWith('data:image/jpeg'), length: url.length, ms: Math.round(performance.now() - t0) }),
      onChange: () => () => {},
    };
    const viewer = openHologramViewer({
      source: { item: { id: 'lib_thumbhull01', kind: 'hologram', title: full.title, spec: full, conversationId: 'c' } },
      deps: { library, blueprintCost: () => '', requestBlueprint: async () => ({}), sendMessage: async () => ({}), onClose: () => {} },
    });
    root = document.querySelector('[data-testid="hologram-viewer"]');
    const seen = [];
    while (!shots.length && performance.now() - t0 < 30000) {
      const m = root.dataset.meshing || '';
      if (seen[seen.length - 1] !== m) seen.push(m);
      await new Promise((res) => setTimeout(res, 40));
    }
    const out = { shots, seen, mesher: root.dataset.mesher };
    viewer.close();
    return out;
  }, fixture('model3'));
  const msg = JSON.stringify(r);
  assert.equal(r.shots.length, 1, msg);
  assert.equal(r.shots[0].id, 'lib_thumbhull01');
  assert.equal(r.shots[0].jpeg, true, msg);
  assert.ok(r.shots[0].length > 2000 && r.shots[0].length <= 60000, msg);
  assert.ok(r.seen.includes('pending'), `it was still meshing when the thumbnail was first due: ${msg}`);
  assert.equal(r.shots[0].meshing, 'settled', `taken after the meshes landed: ${msg}`);
  assert.equal(r.mesher, 'worker', msg);
  assert.equal(workerRequests, 1);
  assert.deepEqual(await page.cspViolations(), []);
  assert.deepEqual(page.problems, []);
});

test('a hull car reopened after its live build and its card thumbnail meshes nothing again (UX73-2)', async () => {
  // The Camry has 23 hull and panel meshes (7 hulls, 16 panels): the shared cache must hold all of
  // them, so the thumbnail and every reopen are served from it with no worker job (the cache held 20
  // entries: the LRU dropped the car's own meshes while it was shown, and each reopen re-meshed them).
  workerMissing = false;
  workerRequests = 0;
  const page = await harness.newPage({
    init: () => {
      window.__posted = [];
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (msg, ...rest) {
        window.__posted.push(msg && msg.kind ? `${msg.kind}-${msg.level}` : 'other');
        return post.call(this, msg, ...rest);
      };
    },
  });
  const r = await page.evaluate(async (text) => {
    const { createHologram } = window.__mods.hologram;
    const { renderHologramImage } = window.__mods.viewer;
    const { normalizeHologramSpec } = window.__mods.spec;
    const spec = normalizeHologramSpec(JSON.parse(text)).spec;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:420px';
    document.body.append(host);
    const opts = { labels: false, autoRotate: false, reveal: false };
    const live = createHologram(host, opts);
    live.setSpec(spec);
    const liveSettled = await live.settled(60000);
    const afterLive = window.__posted.length;
    // the card's thumbnail, while the live hologram is still shown
    const image = await renderHologramImage(spec);
    const afterThumb = window.__posted.length;
    live.dispose();
    const reopens = [];
    for (let i = 0; i < 3; i++) {
      const again = createHologram(host, opts);
      again.setSpec(spec);
      const settled = await again.settled(60000);
      const info = again.debugInfo();
      reopens.push({ settled, posted: window.__posted.length, empty: info.meshes.empty, cached: info.hullStats.cached });
      again.dispose();
    }
    host.remove();
    return { liveSettled, afterLive, afterThumb, image: typeof image === 'string' && image.startsWith('data:image/'), reopens, kinds: window.__posted.slice(afterLive) };
  }, fixture('camry'));
  const msg = JSON.stringify(r);
  assert.equal(r.liveSettled, true, msg);
  assert.equal(r.afterLive, 46, `the live build: coarse and fine for each of the 23 meshes: ${msg}`);
  assert.equal(r.image, true, msg);
  assert.equal(r.afterThumb, r.afterLive, `the thumbnail meshes nothing: ${msg}`);
  for (const reopen of r.reopens) {
    assert.equal(reopen.settled, true, msg);
    assert.equal(reopen.posted, r.afterLive, `a reopen meshes nothing: ${msg}`);
    assert.equal(reopen.empty, 0, msg);
    assert.ok(reopen.cached >= 23, msg);
  }
  assert.equal(workerRequests, 1);
  assert.deepEqual(page.problems, []);
});
