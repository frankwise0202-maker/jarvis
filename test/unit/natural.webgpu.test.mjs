// The natural voice on the graphics chip (v7): WebGPU detection, the engine plans (fp32 on WebGPU,
// q8 on WASM), the fallback ladder WebGPU -> WASM -> built-in voice by the measured speed, the
// crash guard, the download sizes shown before the download, and self-hosted files split into
// parts under GitHub's limits (joined and checked by the worker).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createGuardedFetch, createKokoroEngine } from '../../src/platform/voice/natural/kokoro-engine.js';
import { createNaturalEngine } from '../../src/platform/voice/natural/engine-client.js';
import { ENGINE_PLANS, MODEL, PART_BYTES, RUNTIME, downloadPlan, formatMegabytes, partRanges, partsOf, planFor, sourceConfig } from '../../src/platform/voice/natural/catalog.js';
import { webgpuAvailable } from '../../src/platform/voice/natural/setup.js';
import { createFakeWorker, installClock } from './natural.fakes.mjs';

const APP = 'https://owner.github.io/jarvis/';
const ORIGIN = 'https://owner.github.io';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const W = { webgpu: { path: 'onnx/model.onnx', bytes: 10, sha256: 'a'.repeat(64), parts: 1 }, wasm: { path: 'onnx/model_quantized.onnx', bytes: 5, sha256: 'b'.repeat(64), parts: 1 } };

function memoryStore() {
  const saved = new Map();
  return { saved, get: (k) => (saved.has(k) ? saved.get(k) : null), set: (k, v) => saved.set(k, v), remove: (k) => saved.delete(k) };
}

/** A client with two plans; `gpu`: what the WebGPU check answers (a value or a Promise). */
function twoPlans({ gpu = true, store = memoryStore() } = {}) {
  const workers = [];
  const engine = createNaturalEngine({
    workerUrl: 'voice/kokoro-worker.js',
    source: {},
    scope: {},
    store,
    createWorker: () => {
      const w = createFakeWorker();
      workers.push(w);
      return w;
    },
    plans: [
      { device: 'webgpu', dtype: 'fp32', weights: W.webgpu, available: () => gpu },
      { device: 'wasm', dtype: 'q8', weights: W.wasm },
    ],
  });
  return { engine, workers, store };
}

const flush = () => new Promise((r) => setImmediate(r));

test('catalog: the two engines, their download sizes, and split files under GitHub\'s limits', () => {
  assert.deepEqual(ENGINE_PLANS.map((p) => [p.device, p.dtype]), [['webgpu', 'fp32'], ['wasm', 'q8']], 'WebGPU (fp32, kokoro-js\'s choice there) first');
  assert.equal(planFor('webgpu').dtype, 'fp32');
  assert.equal(planFor('anything').device, 'wasm');
  const gpu = downloadPlan({ dtype: 'fp32' }).bytes;
  const cpu = downloadPlan({ dtype: 'q8' }).bytes;
  assert.equal(formatMegabytes(gpu), '350 MB');
  assert.equal(formatMegabytes(cpu), '117 MB');
  assert.equal(gpu - cpu, MODEL.weights.fp32.bytes - MODEL.weights.q8.bytes, 'the same runtime, worker and voice; only the model differs');
  for (const [dtype, w] of Object.entries(MODEL.weights)) {
    assert.equal(w.parts, partsOf(w.bytes), `${dtype}: pinned part count`);
    const last = w.bytes - (w.parts - 1) * PART_BYTES;
    assert.ok(PART_BYTES < 50 * 1024 * 1024 && last > 0 && last <= PART_BYTES, `${dtype}: every part under GitHub's 50 MB warning`);
  }
  assert.deepEqual([MODEL.weights.q8.parts, MODEL.weights.fp32.parts], [2, 7]);
  assert.ok(RUNTIME.bytes < 100 * 1000 * 1000, 'the ONNX Runtime file is one file under 100 MB');
});

test('webgpuAvailable(): a real adapter only (no WebGPU, no adapter, a software adapter or an error is no)', async () => {
  const scope = (gpu) => ({ navigator: { gpu } });
  assert.equal(await webgpuAvailable(scope({ requestAdapter: async () => ({ info: { vendor: 'apple', isFallbackAdapter: false } }) })), true);
  assert.equal(await webgpuAvailable(scope({ requestAdapter: async () => ({ features: new Set() }) })), true, 'older browsers have no info');
  assert.equal(await webgpuAvailable(scope({ requestAdapter: async () => null })), false);
  assert.equal(await webgpuAvailable(scope({ requestAdapter: async () => ({ isFallbackAdapter: true }) })), false);
  assert.equal(await webgpuAvailable(scope({ requestAdapter: async () => ({ info: { isFallbackAdapter: true } }) })), false);
  assert.equal(await webgpuAvailable(scope({ requestAdapter: async () => { throw new Error('GPU process crashed'); } })), false);
  assert.equal(await webgpuAvailable(scope(undefined)), false);
  assert.equal(await webgpuAvailable({}), false);
});

test('plans: WebGPU when there is an adapter (fp32, two warm-up runs); WASM q8 when there is none; planInfo() says which before anything downloads', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const a = twoPlans({ gpu: Promise.resolve(true) });
  assert.equal((await a.engine.planInfo()).device, 'webgpu');
  const p = a.engine.start();
  await flush();
  const init = a.workers[0].posted[0];
  assert.deepEqual([init.type, init.config.device, init.config.dtype, init.config.warmupRuns, init.config.weights.path], ['init', 'webgpu', 'fp32', 2, 'onnx/model.onnx']);
  a.workers[0].emit({ type: 'ready', device: 'webgpu', dtype: 'fp32', loadMs: 3000, warmupMs: 150, warmupAudioS: 1.5, threads: 1 });
  await p;
  assert.deepEqual([a.engine.status().state, a.engine.status().plan, a.engine.status().fallback], ['ready', 'webgpu', '']);

  const b = twoPlans({ gpu: Promise.resolve(false) });
  assert.equal((await b.engine.planInfo()).device, 'wasm');
  b.engine.start();
  await flush();
  assert.deepEqual([b.workers[0].posted[0].config.device, b.workers[0].posted[0].config.dtype, b.workers[0].posted[0].config.warmupRuns], ['wasm', 'q8', 1]);
  assert.equal(b.workers.length, 1, 'no GPU worker was started');
});

test('ladder 1: WebGPU fails to load -> the WASM engine loads instead (verdict kept), and start() resolves when it is ready', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const { engine, workers, store } = twoPlans({ gpu: true });
  const states = [];
  engine.subscribe((s) => states.push(`${s.state}:${s.plan}:${s.fallback}`));
  let resolved = false;
  const p = engine.start().then(() => (resolved = true));
  assert.equal(workers[0].posted[0].config.device, 'webgpu', 'a known-good check needs no wait');
  workers[0].emit({ type: 'progress', stage: 'download', loaded: 5, total: 10 });
  workers[0].emit({ type: 'progress', stage: 'load', loaded: 0, total: 1 });
  assert.ok(store.saved.has('jarvis.voice.natural.attempt'), 'the GPU set-up is marked while it runs');
  workers[0].emit({ type: 'error', code: 'webgpu', message: 'no available backend found. ERR: [webgpu] Error: WebGPU is not supported' });
  assert.equal(workers[0].terminated, true, 'the GPU worker is stopped');
  assert.equal(store.saved.has('jarvis.voice.natural.attempt'), false);
  assert.equal(JSON.parse(store.saved.get('jarvis.voice.natural.webgpu')).failed, true);
  assert.equal(workers.length, 2);
  assert.deepEqual([workers[1].posted[0].config.device, workers[1].posted[0].config.dtype], ['wasm', 'q8']);
  assert.equal(engine.status().fallback, 'webgpu-failed');
  await flush();
  assert.equal(resolved, false, 'start() still waits');
  workers[1].emit({ type: 'ready', device: 'wasm', dtype: 'q8', loadMs: 900, warmupMs: 600, warmupAudioS: 1.5, threads: 1 });
  await p;
  assert.deepEqual([engine.status().state, engine.status().plan, engine.status().fallback], ['ready', 'wasm', 'webgpu-failed']);
  assert.ok(states.includes('starting:wasm:webgpu-failed'));
  // The next page goes straight to WASM (the verdict lasts 30 days) …
  const again = twoPlans({ gpu: true, store });
  assert.equal((await again.engine.planInfo()).device, 'wasm');
  // … until the owner taps Try again.
  again.engine.resetVerdict();
  assert.equal((await again.engine.planInfo()).device, 'webgpu');
});

test('ladder 2: a WebGPU warm-up slower than real time -> WASM; a WASM warm-up slower too -> "slow" (the built-in voice speaks)', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const { engine, workers, store } = twoPlans({ gpu: true });
  const p = engine.start();
  // 1.5 s of audio took 3.6 s on the graphics chip (a weak integrated GPU, say).
  workers[0].emit({ type: 'ready', device: 'webgpu', dtype: 'fp32', loadMs: 4000, warmupMs: 3600, warmupAudioS: 1.5, threads: 1 });
  assert.equal(JSON.parse(store.saved.get('jarvis.voice.natural.webgpu')).slow, true);
  assert.equal(workers.length, 2);
  assert.equal(engine.status().fallback, 'webgpu-slow');
  workers[1].emit({ type: 'ready', device: 'wasm', dtype: 'q8', loadMs: 900, warmupMs: 4000, warmupAudioS: 1.5, threads: 1 });
  await p;
  assert.equal(engine.status().state, 'slow', 'the processor is too slow as well');
  assert.equal(engine.knownSlow(), true, 'kept: the next reply goes straight to the built-in voice');
  assert.equal(engine.ready(), false);
});

test('ladder 3: WebGPU turning slow while it speaks hands this reply to the built-in voice and loads WASM for the next ones', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const { engine, workers, store } = twoPlans({ gpu: true });
  const p = engine.start();
  workers[0].emit({ type: 'ready', device: 'webgpu', dtype: 'fp32', loadMs: 4000, warmupMs: 200, warmupAudioS: 1.5, threads: 1 });
  await p;
  engine.noteTiming(2400, 1.5);
  engine.noteTiming(2400, 1.5);
  assert.equal(engine.status().state, 'slow', 'the reply in progress hands over');
  assert.equal(JSON.parse(store.saved.get('jarvis.voice.natural.webgpu')).slow, true);
  assert.equal(store.saved.has('jarvis.voice.natural.verdict'), false, 'no verdict against WASM');
  clock.advance(1);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].posted[0].config.device, 'wasm');
  assert.equal(engine.status().fallback, 'webgpu-slow');
  workers[1].emit({ type: 'ready', device: 'wasm', dtype: 'q8', loadMs: 800, warmupMs: 500, warmupAudioS: 1.5, threads: 1 });
  assert.deepEqual([engine.status().state, engine.status().plan], ['ready', 'wasm']);
});

test('crash guard: a page that died while setting up the GPU model starts on WASM next time (a reload mid-download does not count)', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  // The marker follows the attempt: set at 'load', 'download' while the model downloads, 'compile'
  // once it is all there, then gone when the engine is ready.
  const live = twoPlans({ gpu: true });
  live.engine.start();
  const w = live.workers[0];
  const phase = () => (JSON.parse(live.store.saved.get('jarvis.voice.natural.attempt') || 'null') || {}).phase || null;
  w.emit({ type: 'progress', stage: 'download', file: 'runtime', loaded: 5, total: 50 });
  assert.equal(phase(), null, 'the runtime download comes before the attempt');
  w.emit({ type: 'progress', stage: 'load', loaded: 0, total: 1 });
  assert.equal(phase(), 'load');
  w.emit({ type: 'progress', stage: 'download', file: 'onnx/model.onnx', loaded: 20, total: 50 });
  assert.equal(phase(), 'download');
  w.emit({ type: 'progress', stage: 'download', file: 'onnx/model.onnx', loaded: 50, total: 50 });
  assert.equal(phase(), 'compile');
  w.emit({ type: 'progress', stage: 'warmup', loaded: 0, total: 1 });
  assert.equal(phase(), 'warmup');
  w.emit({ type: 'ready', device: 'webgpu', dtype: 'fp32', loadMs: 1000, warmupMs: 100, warmupAudioS: 1.5, threads: 1 });
  assert.equal(phase(), null);
  // The usual first run: the total also counts the speaker's file, which only downloads with the
  // first synthesis, so the download never shows 100%. The worker's 'compile' ends it all the same.
  const first = twoPlans({ gpu: true });
  first.engine.start();
  const fw = first.workers[0];
  const firstPhase = () => (JSON.parse(first.store.saved.get('jarvis.voice.natural.attempt') || 'null') || {}).phase || null;
  fw.emit({ type: 'progress', stage: 'load', loaded: 0, total: 1 });
  fw.emit({ type: 'progress', stage: 'download', file: 'onnx/model.onnx', loaded: 49, total: 50 });
  assert.equal(firstPhase(), 'download');
  fw.emit({ type: 'progress', stage: 'compile', file: 'onnx/model.onnx', loaded: 0, total: 1 });
  assert.equal(firstPhase(), 'compile');
  assert.equal(first.engine.status().state, 'loading', 'the card says it is getting ready, not still downloading');
  fw.emit({ type: 'progress', stage: 'download', file: 'onnx/model.onnx', loaded: 49, total: 50 });
  assert.equal(firstPhase(), 'compile', 'a late progress message does not put it back to downloading');
  // Reloaded in the middle of the download: WebGPU is tried again.
  const mid = memoryStore();
  mid.set('jarvis.voice.natural.attempt', JSON.stringify({ device: 'webgpu', phase: 'download', at: Date.now() - 60_000 }));
  assert.equal((await twoPlans({ gpu: true, store: mid }).engine.planInfo()).device, 'webgpu');
  assert.equal(mid.saved.has('jarvis.voice.natural.webgpu'), false);
  // Died while setting up the model: WASM from now on.
  const store = memoryStore();
  store.set('jarvis.voice.natural.attempt', JSON.stringify({ device: 'webgpu', phase: 'compile', at: Date.now() - 60_000 }));
  const { engine } = twoPlans({ gpu: true, store });
  assert.equal((await engine.planInfo()).device, 'wasm');
  assert.equal(JSON.parse(store.saved.get('jarvis.voice.natural.webgpu')).code, 'crashed');
  assert.equal(store.saved.has('jarvis.voice.natural.attempt'), false);
  // A WASM "too slow" verdict does not keep a working graphics chip from being tried.
  const fresh = memoryStore();
  fresh.set('jarvis.voice.natural.verdict', JSON.stringify({ slow: true, rtf: 2.4, at: Date.now() }));
  const g = twoPlans({ gpu: Promise.resolve(true), store: fresh });
  assert.equal(g.engine.knownSlow(), false);
  assert.equal((await g.engine.planInfo()).device, 'webgpu');
  const n = twoPlans({ gpu: Promise.resolve(false), store: fresh });
  await n.engine.planInfo();
  assert.equal(n.engine.knownSlow(), true, 'no graphics chip: the WASM verdict stands');
});

// ---- self-hosted files in parts (the worker joins them) -----------------------------------------

function fakeFetch(table) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const entry = table[url];
    if (!entry) return Object.defineProperty(new Response('not found', { status: 404 }), 'url', { value: url });
    return Object.defineProperty(new Response(entry, { status: 200, headers: { 'content-length': String(entry.length) } }), 'url', { value: url });
  };
  fn.calls = calls;
  return fn;
}

function bytes(n, seed = 5) {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * seed + 3) & 255;
  return b;
}

test('fetch guard: a file split into parts is joined in order, with progress over the whole, and checked like one file', async () => {
  const whole = bytes(10_000);
  const url = `${APP}models/${MODEL.id}/onnx/model.onnx`;
  const parts = { [`${url}.part0`]: whole.slice(0, 4000), [`${url}.part1`]: whole.slice(4000, 8000), [`${url}.part2`]: whole.slice(8000) };
  const progress = [];
  const mk = (spec, table = parts) => {
    const base = fakeFetch(table);
    const guarded = createGuardedFetch(base, webcrypto.subtle, { selfOrigin: ORIGIN, allowOrigins: [ORIGIN], allowHostSuffixes: [], tracked: [{ suffix: '/onnx/model.onnx', label: 'onnx/model.onnx', parts: 3, ...spec }] }, { onProgress: (p) => progress.push(p) });
    return { guarded, base };
  };
  const { guarded, base } = mk({ bytes: whole.length, sha256: sha(whole) });
  const res = await guarded(url);
  const got = new Uint8Array(await res.arrayBuffer());
  assert.equal(sha(got), sha(whole));
  assert.deepEqual(base.calls, [`${url}.part0`, `${url}.part1`, `${url}.part2`], 'only the parts are fetched, in order');
  assert.ok(progress.every((p) => p.total === whole.length) && progress.at(-1).loaded === whole.length);
  await assert.rejects(mk({ bytes: whole.length, sha256: '0'.repeat(64) }).guarded(url), (e) => e.code === 'integrity' && /SHA-256/.test(e.message));
  const missing = { ...parts };
  delete missing[`${url}.part1`];
  await assert.rejects(mk({ bytes: whole.length, sha256: sha(whole) }, missing).guarded(url), (e) => e.code === 'network' && /part 2 of 3/.test(e.message));
  const extra = { ...parts, [`${url}.part2`]: bytes(3000) };
  await assert.rejects(mk({ bytes: whole.length, sha256: sha(whole) }, extra).guarded(url), (e) => e.code === 'integrity');
  await assert.rejects(mk({ bytes: 0 }).guarded(url), (e) => e.code === 'integrity', 'a split file needs its pinned size');
});

test('the deploy script\'s cut and the worker\'s join round-trip: contiguous parts that cover the file, each under the limit', async () => {
  for (const w of Object.values(MODEL.weights)) {
    const r = partRanges(w.bytes);
    assert.equal(r.length, w.parts);
    assert.equal(r[0][0], 0);
    assert.equal(r.at(-1)[1], w.bytes);
    for (let i = 1; i < r.length; i++) assert.equal(r[i][0], r[i - 1][1], 'contiguous');
    assert.ok(r.every(([a, b]) => b - a > 0 && b - a <= PART_BYTES));
  }
  // A small file cut the same way (as fetch-voice-model.mjs does) and joined by the guard.
  const whole = bytes(25_000, 13);
  const ranges = partRanges(whole.length, 7_000);
  assert.equal(ranges.length, 4);
  const url = `${APP}models/${MODEL.id}/onnx/model.onnx`;
  const table = Object.fromEntries(ranges.map(([a, b], i) => [`${url}.part${i}`, whole.slice(a, b)]));
  const guarded = createGuardedFetch(fakeFetch(table), webcrypto.subtle, { selfOrigin: ORIGIN, allowOrigins: [ORIGIN], allowHostSuffixes: [], tracked: [{ suffix: '/onnx/model.onnx', label: 'model', parts: ranges.length, bytes: whole.length, sha256: sha(whole) }] });
  assert.equal(sha(new Uint8Array(await (await guarded(url)).arrayBuffer())), sha(whole));
});

test('worker core: a self-hosted split model loads through the parts; WebGPU warms up twice and reports the second run', async () => {
  const posted = [];
  const whole = bytes(7000, 9);
  const modelUrl = `${APP}models/${MODEL.id}/onnx/model.onnx`;
  const runtimeUrl = `${APP}voice/ort/ort-wasm-simd-threaded.jsep.wasm`;
  const wasm = bytes(300, 2);
  const fetch = fakeFetch({ [`${modelUrl}.part0`]: whole.slice(0, 3500), [`${modelUrl}.part1`]: whole.slice(3500), [runtimeUrl]: wasm });
  const scope = { location: { origin: ORIGIN }, fetch, crypto: webcrypto, caches: { open: async () => ({ match: async () => undefined, put: async () => {} }), delete: async () => true }, navigator: {}, crossOriginIsolated: false };
  const tfEnv = { backends: { onnx: { wasm: {} } } };
  let clock = 0;
  const runs = [];
  const engine = createKokoroEngine({
    scope,
    post: (msg) => posted.push(msg),
    tfEnv,
    now: () => clock,
    loadModel: async (id, opts) => {
      const res = await scope.fetch(`${tfEnv.remoteHost}${tfEnv.remotePathTemplate.replace('{model}', id)}onnx/model.onnx`);
      assert.equal(sha(new Uint8Array(await res.arrayBuffer())), sha(whole));
      assert.deepEqual([opts.device, opts.dtype], ['webgpu', 'fp32']);
      return {
        async generate() {
          runs.push(clock);
          clock += runs.length === 1 ? 5000 : 300; // the first run compiles the GPU kernels
          return { audio: new Float32Array(36000), sampling_rate: 24000 };
        },
      };
    },
  });
  engine.handle({
    type: 'init',
    config: { modelId: MODEL.id, source: sourceConfig('self', { base: APP }), dtype: 'fp32', device: 'webgpu', voice: 'bm_george', warmupRuns: 2, weights: { path: 'onnx/model.onnx', bytes: whole.length, sha256: sha(whole), parts: 2 }, runtime: { url: runtimeUrl, bytes: wasm.length, label: 'runtime' } },
  });
  // Hashing and the async steps can take a while on a busy machine: wait up to 5 s.
  for (let i = 0; i < 500 && !posted.some((m) => m.type === 'ready' || m.type === 'error'); i++) await new Promise((r) => setTimeout(r, 10));
  const ready = posted.find((m) => m.type === 'ready');
  assert.ok(ready, JSON.stringify(posted.filter((m) => m.type === 'error')));
  assert.equal(runs.length, 2, 'two warm-up runs');
  assert.equal(ready.warmupMs, 300, 'the speed of the second run');
  assert.equal(ready.device, 'webgpu');
  // 'compile' once the joined file is checked: after the last download progress, before the warm-up.
  const stages = posted.filter((m) => m.type === 'progress').map((m) => m.stage);
  const compileAt = stages.indexOf('compile');
  assert.ok(compileAt > stages.lastIndexOf('download'), stages.join(' '));
  assert.ok(compileAt < stages.indexOf('warmup'), stages.join(' '));
  assert.equal(stages.filter((x) => x === 'compile').length, 1);
});
