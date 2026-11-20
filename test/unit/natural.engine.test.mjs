// The natural voice's engine: the worker core (natural/kokoro-engine.js) with a fake model,
// fake fetch and fake Cache Storage, and the page-side client (natural/engine-client.js) with a
// fake Worker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createGuardedFetch, createKokoroEngine, classifyError, EngineError } from '../../src/platform/voice/natural/kokoro-engine.js';
import { createNaturalEngine, naturalSupport } from '../../src/platform/voice/natural/engine-client.js';
import { MODEL, sourceConfig } from '../../src/platform/voice/natural/catalog.js';
import { createFakeWorker, installClock } from './natural.fakes.mjs';

const APP = 'https://owner.github.io/jarvis/';
const ORIGIN = 'https://owner.github.io';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function bytes(n, seed = 7) {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * seed + 13) & 255;
  return b;
}

/** A fetch over a table of URL -> { body, status, redirectTo, type } that records requests. */
function fakeFetch(table) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const entry = table[url];
    if (!entry) return Object.defineProperty(new Response('not found', { status: 404 }), 'url', { value: url });
    const finalUrl = entry.redirectTo || url;
    const res = new Response(entry.body, { status: entry.status || 200, headers: { 'content-type': entry.type || 'application/octet-stream', 'content-length': String(entry.body.byteLength ?? entry.body.length) } });
    return Object.defineProperty(res, 'url', { value: finalUrl });
  };
  fn.calls = calls;
  return fn;
}

function fakeCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        async match(key) {
          const v = m.get(String(key));
          return v ? new Response(v.slice()) : undefined;
        },
        async put(key, res) {
          m.set(String(key), new Uint8Array(await res.arrayBuffer()));
        },
      };
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
}

test('fetch guard: kokoro-js voice URLs are rewritten to the configured base; other hosts are refused', async () => {
  const src = sourceConfig('self', { base: APP });
  const voiceUrl = `${APP}models/${MODEL.id}/voices/bm_george.bin`;
  const base = fakeFetch({ [voiceUrl]: { body: bytes(16) } });
  const guarded = createGuardedFetch(base, webcrypto.subtle, { selfOrigin: ORIGIN, voiceBase: src.voiceBase, allowOrigins: src.allowOrigins, allowHostSuffixes: src.allowHostSuffixes, tracked: [] });
  const res = await guarded('https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/bm_george.bin');
  assert.equal(res.status, 200);
  assert.deepEqual(base.calls, [voiceUrl], 'served by the app itself, not Hugging Face');
  await assert.rejects(guarded('https://cdn.jsdelivr.net/npm/x/ort.wasm'), (e) => e instanceof EngineError && e.code === 'blocked-host');
  await assert.rejects(guarded('https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/bm_nobody.bin'), (e) => e.code === 'network' && /bm_nobody\.bin.*404/.test(e.message), 'a missing voice is an error, not data');
  await assert.rejects(guarded('https://huggingface.co/other/model/resolve/main/x'), (e) => e.code === 'blocked-host', 'self mode allows only the app origin');
  await assert.rejects(guarded('http://owner.github.io/jarvis/x'), (e) => e.code === 'blocked-host', 'no plain http');
});

test('fetch guard (Hugging Face mode): the pinned revision, redirects to *.hf.co are allowed, redirects elsewhere are refused', async () => {
  const src = sourceConfig('hf', { base: APP });
  assert.equal(src.pathTemplate, `{model}/resolve/${MODEL.revision}/`);
  const okUrl = `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/onnx/model_quantized.onnx`;
  const badUrl = `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/tokenizer.json`;
  const base = fakeFetch({
    [okUrl]: { body: bytes(32), redirectTo: 'https://us.aws.cdn.hf.co/xet-bridge-us/abc' },
    [badUrl]: { body: bytes(8), redirectTo: 'https://evil.example/x' },
  });
  const guarded = createGuardedFetch(base, webcrypto.subtle, { selfOrigin: ORIGIN, voiceBase: src.voiceBase, allowOrigins: src.allowOrigins, allowHostSuffixes: src.allowHostSuffixes, tracked: [] });
  assert.equal((await guarded(okUrl)).status, 200);
  await assert.rejects(guarded(badUrl), (e) => e.code === 'blocked-host' && /evil\.example/.test(e.message));
  const v = await guarded('https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/bm_lewis.bin').catch((e) => e);
  assert.equal(base.calls.at(-1), `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/voices/bm_lewis.bin`, 'voices pinned too');
  assert.ok(v);
});

test('fetch guard: a tracked (big) file streams with progress and must match its size and SHA-256 before anyone gets it', async () => {
  const body = bytes(200_000);
  const url = `${APP}models/${MODEL.id}/onnx/model_quantized.onnx`;
  const progress = [];
  let downloaded = 0;
  const mk = (spec) =>
    createGuardedFetch(fakeFetch({ [url]: { body } }), webcrypto.subtle, { selfOrigin: ORIGIN, allowOrigins: [ORIGIN], allowHostSuffixes: [], tracked: [{ suffix: '/onnx/model_quantized.onnx', label: 'model', ...spec }] }, { onProgress: (p) => progress.push(p), onDownloaded: (n) => (downloaded += n) });
  const res = await mk({ bytes: body.length, sha256: sha(body) })(url);
  const got = new Uint8Array(await res.arrayBuffer());
  assert.equal(got.length, body.length);
  assert.equal(sha(got), sha(body));
  assert.equal(res.headers.get('content-length'), String(body.length));
  assert.ok(progress.length >= 1 && progress.at(-1).loaded === body.length && progress.at(-1).total === body.length);
  assert.equal(downloaded, body.length);
  await assert.rejects(mk({ bytes: body.length, sha256: '0'.repeat(64) })(url), (e) => e.code === 'integrity' && /SHA-256/.test(e.message));
  await assert.rejects(mk({ bytes: body.length + 1 })(url), (e) => e.code === 'integrity' && /bytes/.test(e.message));
});

function engineHarness({ loadError = null, rtfMs = 5 } = {}) {
  const posted = [];
  const runtimeUrl = `${APP}voice/ort/ort-wasm-simd-threaded.jsep.wasm`;
  const modelUrl = `${APP}models/${MODEL.id}/onnx/model_quantized.onnx`;
  const wasm = bytes(5000, 3);
  const weights = bytes(40_000, 11);
  const fetch = fakeFetch({ [runtimeUrl]: { body: wasm, type: 'application/wasm' }, [modelUrl]: { body: weights } });
  const scope = { location: { origin: ORIGIN }, fetch, crypto: webcrypto, caches: fakeCaches(), navigator: { hardwareConcurrency: 8 }, crossOriginIsolated: false };
  const tfEnv = { backends: { onnx: { wasm: {} } } };
  const generated = [];
  let clock = 0;
  const engine = createKokoroEngine({
    scope,
    post: (msg, transfer) => posted.push({ msg, transfer }),
    tfEnv,
    now: () => clock,
    loadModel: async (id, opts) => {
      if (loadError) throw loadError;
      // like transformers.js: fetch the weights through the (guarded) global fetch
      const res = await scope.fetch(`${tfEnv.remoteHost}${tfEnv.remotePathTemplate.replace('{model}', id)}onnx/model_quantized.onnx`);
      await res.arrayBuffer();
      return {
        opts,
        async generate(text, o) {
          generated.push({ text, ...o });
          clock += rtfMs * text.length;
          return { audio: new Float32Array(text.length * 100).fill(0.1), sampling_rate: 24000 };
        },
      };
    },
  });
  const config = {
    modelId: MODEL.id,
    source: sourceConfig('self', { base: APP }),
    dtype: 'q8',
    device: 'wasm',
    voice: 'bm_george',
    weights: { path: 'onnx/model_quantized.onnx', bytes: weights.length, sha256: sha(weights) },
    runtime: { url: runtimeUrl, bytes: wasm.length, label: 'runtime' },
  };
  return { posted, engine, scope, tfEnv, generated, config, fetch, wasm, weights, runtimeUrl };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
async function settle(h, type, max = 50) {
  for (let i = 0; i < max; i++) {
    if (h.posted.some((p) => p.msg.type === type)) return;
    await flush();
  }
  throw new Error(`no ${type} message`);
}

test('worker core: init configures transformers.js and ONNX Runtime, downloads with progress, warms up, then reports ready', async () => {
  const h = engineHarness();
  h.engine.handle({ type: 'init', config: h.config });
  await settle(h, 'ready');
  const env = h.tfEnv;
  assert.equal(env.remoteHost, `${APP}models/`);
  assert.equal(env.remotePathTemplate, '{model}/');
  assert.equal(env.allowLocalModels, false);
  assert.equal(env.useBrowserCache, true);
  assert.equal(env.backends.onnx.wasm.numThreads, 1, 'single-threaded without cross-origin isolation');
  assert.equal(env.backends.onnx.wasm.proxy, false);
  assert.deepEqual(env.backends.onnx.wasm.wasmPaths, { wasm: `${APP}voice/ort/ort-wasm-simd-threaded.jsep.wasm` }, 'object form: the glue bundled in the worker, never a CDN');
  assert.equal(new Uint8Array(env.backends.onnx.wasm.wasmBinary).length, h.wasm.length, 'the runtime is handed over as bytes (cached for offline)');
  assert.deepEqual(h.generated[0], { text: 'All systems are ready.', voice: 'bm_george', speed: 1 }, 'warm-up');
  const ready = h.posted.find((p) => p.msg.type === 'ready').msg;
  assert.equal(ready.downloadedBytes, h.wasm.length + h.weights.length);
  assert.equal(ready.cached, false);
  assert.equal(ready.threads, 1);
  const progress = h.posted.filter((p) => p.msg.type === 'progress' && p.msg.stage === 'download').map((p) => p.msg);
  assert.ok(progress.length >= 2);
  assert.equal(progress.at(-1).loaded, progress.at(-1).total, 'overall progress reaches 100%');
  assert.ok(h.scope.caches.stores.get('voice-runtime-v1').size === 1, 'runtime cached');
  // A second init answers at once.
  h.posted.length = 0;
  h.engine.handle({ type: 'init', config: h.config });
  await settle(h, 'ready');
  assert.equal(h.posted[0].msg.cached, true);
});

test('worker core: synthesis runs in order, results are transferred copies; cancel drops queued jobs', async () => {
  const h = engineHarness();
  h.engine.handle({ type: 'init', config: h.config });
  await settle(h, 'ready');
  h.posted.length = 0;
  h.engine.handle({ type: 'synth', id: 1, text: 'First sentence.', voice: 'bm_fable', speed: 1.2 });
  h.engine.handle({ type: 'synth', id: 2, text: 'Second sentence.', voice: 'bm_fable', speed: 1.2 });
  h.engine.handle({ type: 'synth', id: 3, text: 'Third sentence.', voice: 'bm_fable', speed: 1.2 });
  h.engine.handle({ type: 'cancel', ids: [2] });
  for (let i = 0; i < 20; i++) await flush();
  const audio = h.posted.filter((p) => p.msg.type === 'audio');
  assert.deepEqual(audio.map((p) => p.msg.id), [1, 3]);
  for (const p of audio) {
    assert.ok(p.msg.pcm instanceof Float32Array);
    assert.deepEqual(p.transfer, [p.msg.pcm.buffer]);
    assert.equal(p.msg.sampleRate, 24000);
    assert.ok(p.msg.synthMs > 0);
  }
  assert.deepEqual(h.generated.slice(1).map((g) => [g.text, g.voice, g.speed]), [['First sentence.', 'bm_fable', 1.2], ['Third sentence.', 'bm_fable', 1.2]]);
});

test('worker core: a failed load reports a classified error; clear() deletes every cache it made', async () => {
  const h = engineHarness({ loadError: Object.assign(new Error('WebAssembly.instantiate(): Refused to compile or instantiate WebAssembly module because neither wasm-eval nor unsafe-eval is an allowed source'), { name: 'CompileError' }) });
  h.engine.handle({ type: 'init', config: h.config });
  await settle(h, 'error');
  assert.equal(h.posted.find((p) => p.msg.type === 'error').msg.code, 'wasm');
  assert.equal(classifyError(new TypeError('Failed to fetch')), 'network');
  assert.equal(classifyError(new Error('no available adapter for WebGPU')), 'webgpu');
  assert.equal(classifyError(new EngineError('integrity', 'x')), 'integrity');
  h.scope.caches.stores.set('transformers-cache', new Map());
  h.scope.caches.stores.set('kokoro-voices', new Map());
  h.engine.handle({ type: 'clear' });
  await settle(h, 'cleared');
  assert.deepEqual([...h.scope.caches.stores.keys()], []);
});

// ---- the page-side client -----------------------------------------------------------------

test('client: start() spawns a module worker, follows progress to ready; synth() round-trips; noteTiming() turns it slow', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const w = createFakeWorker();
  let spawned = null;
  const states = [];
  const engine = createNaturalEngine({ workerUrl: './voice/kokoro-worker.js', source: sourceConfig('self', { base: APP }), createWorker: (url) => ((spawned = url), w), scope: {} });
  engine.subscribe((s) => states.push(s.state));
  const started = engine.start();
  assert.equal(spawned, './voice/kokoro-worker.js');
  assert.equal(w.posted[0].type, 'init');
  assert.equal(w.posted[0].config.dtype, 'q8');
  assert.equal(engine.start(), started, 'idempotent');
  w.emit({ type: 'progress', stage: 'download', loaded: 50, total: 100, file: 'onnx/model_quantized.onnx' });
  assert.equal(engine.status().state, 'downloading');
  assert.equal(engine.status().loaded, 50);
  w.emit({ type: 'progress', stage: 'warmup', loaded: 0, total: 1 });
  w.emit({ type: 'ready', device: 'wasm', dtype: 'q8', loadMs: 1234, warmupMs: 321, downloadedBytes: 100, threads: 1 });
  await started;
  assert.deepEqual(states, ['starting', 'downloading', 'warming', 'ready']);
  const job = engine.synth('Hello.', { voice: 'bm_lewis', speed: 1 });
  assert.deepEqual(w.posted.at(-1), { type: 'synth', id: job.id, text: 'Hello.', voice: 'bm_lewis', speed: 1 });
  const pcm = new Float32Array(10);
  w.emit({ type: 'audio', id: job.id, pcm, sampleRate: 24000, synthMs: 12 });
  const res = await job.promise;
  assert.equal(res.pcm, pcm);
  const j2 = engine.synth('Cancelled.');
  engine.cancel([j2.id]);
  await assert.rejects(j2.promise, (e) => e.code === 'cancelled');
  assert.deepEqual(w.posted.at(-1), { type: 'cancel', ids: [j2.id] });
  w.emit({ type: 'progress', stage: 'voice', file: 'voices/bm_lewis.bin', loaded: 1000, total: 522240 });
  assert.equal(engine.status().state, 'ready', 'a new speaker downloading does not make the engine unready');
  engine.noteTiming(1500, 1.0);
  assert.equal(engine.status().state, 'ready', 'no verdict before 3 s of audio');
  engine.noteTiming(3000, 2.5);
  assert.equal(engine.status().state, 'slow');
  assert.ok(engine.status().rtf > 1);
  engine.resetVerdict();
  assert.equal(engine.status().state, 'ready');
});

test('client: worker load errors and init errors end in state "error"; the idle worker is terminated to free memory', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const w = createFakeWorker();
  const engine = createNaturalEngine({ workerUrl: 'x.js', source: {}, createWorker: () => w, scope: {}, idleStopMs: 60_000 });
  const p = engine.start();
  w.emit({ type: 'error', code: 'wasm', message: 'Refused to compile WebAssembly' });
  await assert.rejects(p, (e) => e.code === 'wasm');
  assert.equal(engine.status().state, 'error');
  assert.equal(engine.status().error.code, 'wasm');
  assert.equal(w.terminated, true);

  const w2 = createFakeWorker();
  const e2 = createNaturalEngine({ workerUrl: 'x.js', source: {}, createWorker: () => w2, scope: {}, idleStopMs: 60_000 });
  const p2 = e2.start();
  w2.fail('404 worker script');
  await assert.rejects(p2, (e) => e.code === 'worker');

  const w3 = createFakeWorker();
  const e3 = createNaturalEngine({ workerUrl: 'x.js', source: {}, createWorker: () => w3, scope: {}, idleStopMs: 60_000 });
  const p3 = e3.start();
  w3.emit({ type: 'ready', device: 'wasm', dtype: 'q8' });
  await p3;
  const j = e3.synth('Hi.');
  w3.emit({ type: 'audio', id: j.id, pcm: new Float32Array(1), sampleRate: 24000, synthMs: 1 });
  await j.promise;
  clock.advance(59_000);
  assert.equal(w3.terminated, false);
  clock.advance(2_000);
  assert.equal(w3.terminated, true, 'stopped after a minute idle');
  assert.equal(e3.status().state, 'off');
  await assert.rejects(e3.synth('After stop.').promise, (e) => e.code === 'not-ready');
});

test('naturalSupport(): needs Worker, WebAssembly with SIMD, Web Audio and Cache Storage', () => {
  const full = { Worker: function () {}, WebAssembly, AudioContext: function () {}, caches: { open() {} } };
  assert.deepEqual(naturalSupport(full), { ok: true, reason: '' }, 'Node has SIMD');
  assert.equal(naturalSupport({ ...full, Worker: undefined }).reason, 'no-worker');
  assert.equal(naturalSupport({ ...full, WebAssembly: { validate: () => false } }).reason, 'no-simd');
  assert.equal(naturalSupport({ ...full, AudioContext: undefined }).reason, 'no-webaudio');
  assert.equal(naturalSupport({ ...full, caches: undefined }).reason, 'no-cache-storage');
});

test('worker core: the progress total is what is really missing (cached files are not counted again)', async () => {
  const h = engineHarness();
  // The runtime is already cached (a second download after "Remove" kept it, say).
  const c = await h.scope.caches.open('voice-runtime-v1');
  await c.put(h.runtimeUrl, new Response(h.wasm.slice()));
  h.config.voiceFiles = [{ id: 'bm_george', bytes: 1000, sha256: 'f'.repeat(64) }];
  h.engine.handle({ type: 'init', config: h.config });
  await settle(h, 'ready');
  const totals = h.posted.filter((p) => p.msg.type === 'progress' && p.msg.stage === 'download').map((p) => p.msg.total);
  assert.ok(totals.length >= 1);
  assert.equal(totals[0], h.weights.length + 1000, 'model + voice, not the cached runtime');
  // So the download never shows 100% here (the voice comes later): 'compile' says the model is in.
  const stages = h.posted.filter((p) => p.msg.type === 'progress').map((p) => p.msg.stage);
  assert.deepEqual(stages.filter((x) => x !== 'download'), ['load', 'compile', 'warmup']);
  assert.ok(stages.indexOf('compile') > stages.lastIndexOf('download'));
});

test('client: a warm-up far slower than real time marks the device slow at once, and the verdict is kept across reloads until "Try again"', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const saved = new Map();
  const store = { get: (k) => (saved.has(k) ? saved.get(k) : null), set: (k, v) => saved.set(k, v), remove: (k) => saved.delete(k) };
  const w = createFakeWorker();
  const engine = createNaturalEngine({ workerUrl: 'x.js', source: {}, createWorker: () => w, scope: {}, store });
  const p = engine.start();
  // 1.5 s of audio took 4 s (this test machine's real figure was 2.5×, plus first-run set-up).
  w.emit({ type: 'ready', device: 'wasm', dtype: 'q8', loadMs: 2000, warmupMs: 4000, warmupAudioS: 1.5, threads: 1 });
  await p;
  assert.equal(engine.status().state, 'slow');
  assert.equal(engine.status().warmupRtf, 2.67);
  assert.equal(engine.knownSlow(), true);
  // A new page (a reload): the saved verdict says slow before the engine even starts.
  const engine2 = createNaturalEngine({ workerUrl: 'x.js', source: {}, createWorker: () => createFakeWorker(), scope: {}, store });
  assert.equal(engine2.knownSlow(), true);
  engine2.resetVerdict();
  assert.equal(engine2.knownSlow(), false, 'Try again forgets it');
  // A saved verdict shows its own figure; a clearly fast warm-up overrules it and clears it.
  store.set('jarvis.voice.natural.verdict', JSON.stringify({ slow: true, rtf: 2.6, at: Date.now() }));
  const w4 = createFakeWorker();
  const engine4 = createNaturalEngine({ workerUrl: 'x.js', source: {}, createWorker: () => w4, scope: {}, store });
  const p4 = engine4.start();
  w4.emit({ type: 'ready', device: 'wasm', dtype: 'q8', loadMs: 900, warmupMs: 1500, warmupAudioS: 1.5, threads: 1 });
  await p4;
  assert.deepEqual([engine4.status().state, engine4.status().rtf], ['slow', 2.6], 'a middling warm-up keeps the saved verdict and its figure');
  store.set('jarvis.voice.natural.verdict', JSON.stringify({ slow: true, rtf: 2.6, at: Date.now() }));
  const w5 = createFakeWorker();
  const engine5 = createNaturalEngine({ workerUrl: 'x.js', source: {}, createWorker: () => w5, scope: {}, store });
  const p5 = engine5.start();
  w5.emit({ type: 'ready', device: 'wasm', dtype: 'q8', loadMs: 900, warmupMs: 300, warmupAudioS: 1.5, threads: 1 });
  await p5;
  assert.equal(engine5.status().state, 'ready');
  assert.equal(engine5.knownSlow(), false, 'cleared');
  // A fast warm-up is ready.
  const w3 = createFakeWorker();
  const engine3 = createNaturalEngine({ workerUrl: 'x.js', source: {}, createWorker: () => w3, scope: {}, store });
  const p3 = engine3.start();
  w3.emit({ type: 'ready', device: 'wasm', dtype: 'q8', loadMs: 900, warmupMs: 700, warmupAudioS: 1.5, threads: 1 });
  await p3;
  assert.equal(engine3.status().state, 'ready');
});
