// The "Hey Jarvis" worker's engine (src/platform/wake/wake-word-engine.js) in Node, with a fake
// worker scope (fetch, Cache Storage, location) and a scripted ONNX Runtime: every file is checked
// (size, SHA-256) before use and cached under a key tied to its hash; another origin is refused;
// progress covers the whole download; frames arrive on a MessagePort and a detection is reported
// once; a backlog is dropped; clear() deletes the download. Also the page's client
// (src/platform/wake/wake-word.js) with a fake Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { createWakeWordEngine, cacheKey } from '../../src/platform/wake/wake-word-engine.js';
import { createWakeWord } from '../../src/platform/wake/wake-word.js';
import { WAKE_MODELS, WAKE_RUNTIME, WAKE_CACHE, WAKE_MODEL_BASE } from '../../src/lib/wake/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'https://jarvis.test';
const BASE = `${ORIGIN}/jarvis/`;

async function realFiles() {
  const req = createRequire(path.join(ROOT, 'package.json'));
  const ortDir = path.dirname(req.resolve('onnxruntime-web/wasm'));
  const files = new Map();
  files.set(`${BASE}${WAKE_RUNTIME.path}`, await readFile(path.join(ortDir, WAKE_RUNTIME.file)));
  for (const m of Object.values(WAKE_MODELS)) files.set(`${BASE}${WAKE_MODEL_BASE}${m.file}`, await readFile(path.join(ROOT, 'public', 'models', 'openwakeword', m.file)));
  return files;
}

function fakeCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        match: async (key) => (m.has(String(key)) ? new Response(m.get(String(key))) : undefined),
        put: async (key, res) => m.set(String(key), new Uint8Array(await res.arrayBuffer())),
        delete: async (key) => m.delete(String(key)),
      };
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
}

function fakeScope(files, { fetched = [] } = {}) {
  return {
    location: { origin: ORIGIN, href: BASE },
    crypto: webcrypto,
    caches: fakeCaches(),
    fetch: async (url) => {
      fetched.push(url);
      const body = files.get(url);
      if (!body) return new Response('not found', { status: 404 });
      // Deliver in chunks, like a network stream.
      let at = 0;
      const stream = new ReadableStream({
        pull(ctl) {
          if (at >= body.length) return ctl.close();
          ctl.enqueue(new Uint8Array(body.subarray(at, at + 262144)));
          at += 262144;
        },
      });
      return new Response(stream, { status: 200 });
    },
  };
}

/** A scripted ONNX Runtime: the classifier returns the next score from `scores`. */
function fakeOrt(scores = []) {
  let k = 0;
  const created = [];
  const env = { wasm: {}, logLevel: 'warning' };
  class Tensor {
    constructor(type, data, dims) {
      Object.assign(this, { type, data, dims });
    }
  }
  const session = (kind) => ({
    run: async () => {
      if (kind === 'mel') return { output: { data: new Float32Array(8 * 32) } };
      if (kind === 'emb') return { conv2d_19: { data: new Float32Array(96) } };
      return { 53: { data: [scores[Math.min(k++, scores.length - 1)] ?? 0] } };
    },
  });
  return {
    env,
    Tensor,
    created,
    InferenceSession: {
      create: async (bytes) => {
        created.push(bytes.length);
        return session(created.length === 1 ? 'mel' : created.length === 2 ? 'emb' : 'ww');
      },
    },
  };
}

function run(scope, ort) {
  const out = [];
  const engine = createWakeWordEngine({ scope, post: (m) => out.push(m), ort });
  const waitFor = async (type, ms = 15000) => {
    const t0 = Date.now();
    for (;;) {
      const hit = out.find((m) => m.type === type);
      if (hit) return hit;
      if (Date.now() - t0 > ms) throw new Error(`no ${type} (got ${out.map((m) => m.type).join(',')})`);
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  return { engine, out, waitFor };
}

test('init: every file is downloaded, checked by size and SHA-256, cached by its hash; ONNX Runtime gets our binary', async () => {
  const files = await realFiles();
  const fetched = [];
  const scope = fakeScope(files, { fetched });
  const ort = fakeOrt();
  const { engine, out, waitFor } = run(scope, ort);
  engine.handle({ type: 'init', base: BASE });
  const ready = await waitFor('ready');
  assert.equal(ready.cached, false);
  assert.equal(fetched.length, 4, 'the runtime and three models');
  assert.ok(fetched.every((u) => u.startsWith(ORIGIN)), 'only from its own origin');
  const progress = out.filter((m) => m.type === 'progress');
  assert.ok(progress.length > 4, 'progress while it downloads');
  const last = progress.at(-1);
  assert.equal(last.loaded, last.total);
  assert.equal(last.total, WAKE_RUNTIME.bytes + Object.values(WAKE_MODELS).reduce((n, m) => n + m.bytes, 0));
  assert.equal(ort.env.wasm.numThreads, 1);
  assert.equal(ort.env.wasm.proxy, false);
  assert.equal(ort.env.wasm.wasmBinary.byteLength, WAKE_RUNTIME.bytes);
  assert.ok(ort.env.wasm.wasmPaths.mjs.endsWith(WAKE_RUNTIME.glue.path), 'the glue from the app');
  assert.deepEqual(ort.created, [WAKE_MODELS.melspectrogram.bytes, WAKE_MODELS.embedding.bytes, WAKE_MODELS.heyJarvis.bytes]);
  const cache = scope.caches.stores.get(WAKE_CACHE);
  assert.ok(cache.has(cacheKey(`${BASE}${WAKE_MODEL_BASE}${WAKE_MODELS.heyJarvis.file}`, WAKE_MODELS.heyJarvis.sha256)), 'cached under a key with its hash');
  // A second worker (the next Standby) starts from the cache: nothing downloads.
  const fetched2 = [];
  const scope2 = { ...fakeScope(files, { fetched: fetched2 }), caches: scope.caches };
  const second = run(scope2, fakeOrt());
  second.engine.handle({ type: 'init', base: BASE });
  assert.equal((await second.waitFor('ready')).cached, true);
  assert.equal(fetched2.length, 0);
});

test('a damaged or changed file is refused (integrity), a missing one is a network error, another origin is blocked', async () => {
  const files = await realFiles();
  const bad = new Map(files);
  const key = `${BASE}${WAKE_MODEL_BASE}${WAKE_MODELS.embedding.file}`;
  const changed = Buffer.from(files.get(key));
  changed[1000] ^= 0xff;
  bad.set(key, changed);
  let r = run(fakeScope(bad), fakeOrt());
  r.engine.handle({ type: 'init', base: BASE });
  let err = await r.waitFor('error');
  assert.equal(err.code, 'integrity');
  assert.match(err.message, /SHA-256/);
  // Wrong size.
  const short = new Map(files);
  short.set(key, files.get(key).subarray(10));
  r = run(fakeScope(short), fakeOrt());
  r.engine.handle({ type: 'init', base: BASE });
  err = await r.waitFor('error');
  assert.equal(err.code, 'integrity');
  // Missing (404).
  const missing = new Map(files);
  missing.delete(key);
  r = run(fakeScope(missing), fakeOrt());
  r.engine.handle({ type: 'init', base: BASE });
  assert.equal((await r.waitFor('error')).code, 'network');
  // Another origin: never fetched.
  const fetched = [];
  r = run(fakeScope(files, { fetched }), fakeOrt());
  r.engine.handle({ type: 'init', base: 'https://evil.example/' });
  assert.equal((await r.waitFor('error')).code, 'blocked-host');
  assert.equal(fetched.length, 0);
  // A cached copy of the wrong size is dropped and downloaded again.
  const scope = fakeScope(files);
  const store = await scope.caches.open(WAKE_CACHE);
  await store.put(cacheKey(key, WAKE_MODELS.embedding.sha256), new Response(new Uint8Array(10)));
  r = run(scope, fakeOrt());
  r.engine.handle({ type: 'init', base: BASE });
  assert.equal((await r.waitFor('ready')).cached, false);
});

test('frames on the MessagePort: one detection for "Hey Jarvis", stats, a backlog dropped; clear() deletes the download', async () => {
  const files = await realFiles();
  const scope = fakeScope(files);
  // 15 frames to fill the 16 embeddings (no score), then two frames above 0.5: a detection.
  const ort = fakeOrt([0.1, 0.2, 0.9, 0.95, 0.97, 0.2]);
  const { engine, out, waitFor } = run(scope, ort);
  engine.handle({ type: 'init', base: BASE });
  await waitFor('ready');
  const { port1, port2 } = new MessageChannel();
  engine.handle({ type: 'audio' }, [port2]);
  for (let i = 0; i < 22; i++) {
    port1.postMessage({ type: 'frame', samples: new Float32Array(1280) });
    await new Promise((r) => setTimeout(r, 5));
  }
  const hit = await waitFor('detected');
  assert.ok(hit.score >= 0.5);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(out.filter((m) => m.type === 'detected').length, 1, 'once');
  // Wrong frames are ignored.
  port1.postMessage({ type: 'frame', samples: new Float32Array(10) });
  port1.postMessage({ type: 'nonsense' });
  port1.close();
  engine.handle({ type: 'clear' });
  await waitFor('cleared');
  assert.equal(scope.caches.stores.has(WAKE_CACHE), false);
});

test('the page client: start() resolves on ready, detections reach onDetect, errors reject, stop() ends the worker', async () => {
  const posted = [];
  let worker = null;
  const createWorker = (url) => {
    worker = {
      url,
      onmessage: null,
      terminated: false,
      postMessage: (m) => posted.push(m),
      terminate() {
        this.terminated = true;
      },
    };
    return worker;
  };
  const ww = createWakeWord({ workerUrl: 'wake/wake-word-worker.js', base: './', scope: { location: { href: BASE } }, createWorker });
  const states = [];
  ww.subscribe((s) => states.push(s.state));
  const heard = [];
  ww.onDetect((d) => heard.push(d.score));
  const started = ww.start();
  assert.equal(worker.url, `${BASE}wake/wake-word-worker.js`);
  assert.deepEqual(posted[0], { type: 'init', base: BASE });
  worker.onmessage({ data: { type: 'progress', loaded: 5, total: 10 } });
  worker.onmessage({ data: { type: 'ready', loadMs: 3, cached: false } });
  await started;
  assert.equal(ww.status().state, 'ready');
  worker.onmessage({ data: { type: 'detected', score: 0.93 } });
  assert.deepEqual(heard, [0.93]);
  worker.onmessage({ data: { type: 'stats', avgMs: 5.6, frames: 125, dropped: 0 } });
  assert.equal(ww.status().avgMs, 5.6);
  ww.stop();
  assert.equal(worker.terminated, true);
  assert.equal(ww.status().state, 'off');
  // An error rejects start() and reports the code.
  const again = ww.start();
  worker.onmessage({ data: { type: 'error', code: 'network', message: 'offline' } });
  await assert.rejects(again, (e) => e.code === 'network');
  assert.equal(ww.status().state, 'error');
  assert.ok(states.includes('loading') && states.includes('ready'));
});
