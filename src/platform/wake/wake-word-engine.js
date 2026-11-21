// The "Hey Jarvis" engine. It runs INSIDE the dedicated module Worker (wake-word-worker.js, bundled
// to dist/wake/), so model loading, WebAssembly compilation and inference never touch the page. The
// CSP approach is the natural voice's (engine-client.js): a same-origin module Worker takes its
// policy from its own response headers, so on GitHub Pages it may compile WebAssembly while the
// page keeps script-src 'self' without 'wasm-unsafe-eval'. The worker polices its own network
// access: it fetches only from its own origin.
//
// Messages in:
//   { type: 'init', base }        load once: the runtime and the three models from `base` (the app's
//                                 URL), each checked (size, SHA-256) and kept in Cache Storage
//                                 'wake-word-v1' (offline afterwards)
//   { type: 'audio' } + port      the AudioWorklet's frames arrive on this MessagePort
//   { type: 'reset' }             forget the audio so far (the microphone restarts)
//   { type: 'clear' }             delete the download
// Messages out:
//   { type: 'progress', loaded, total }   download progress (bytes)
//   { type: 'ready', loadMs, cached }
//   { type: 'detected', score }
//   { type: 'stats', frames, avgMs, dropped }   every ~10 s while listening (CPU cost)
//   { type: 'error', code, message }           init | network | integrity | blocked-host | wasm
//   { type: 'cleared' }

import { createWakePipeline, OWW } from '../../lib/wake/oww.js';
import { WAKE_MODELS, WAKE_MODEL_BASE, WAKE_RUNTIME, WAKE_CACHE, WAKE_WORD } from '../../lib/wake/catalog.js';

const MAX_BACKLOG = 10; // frames (800 ms): further behind than this, the backlog is dropped
const STATS_EVERY = 125; // frames (10 s)

export class WakeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function sha256Hex(subtle, buffer) {
  const digest = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The Cache Storage key of a pinned file: its URL tied to its hash (a changed file is a new key). */
export function cacheKey(url, sha256) {
  const u = new URL(url);
  u.searchParams.set('sha256', sha256);
  return u.href;
}

/**
 * @param {object} deps
 * @param {object} deps.scope   the worker global (fetch, caches, crypto, location)
 * @param {(msg: object, transfer?: Transferable[]) => void} deps.post
 * @param {object} deps.ort     onnxruntime-web (its WASM build)
 */
export function createWakeWordEngine({ scope, post, ort, now = () => performance.now() }) {
  let sessions = null;
  let loading = null;
  let pipeline = null;
  let port = null;
  const queue = [];
  let running = false;
  let frames = 0;
  let spent = 0;
  let dropped = 0;
  let statsAt = 0;

  const send = (msg) => {
    try {
      post(msg);
    } catch {
      /* the page went away */
    }
  };

  function origin() {
    return scope.location ? scope.location.origin : '';
  }

  /** A same-origin file, checked: from Cache Storage, else downloaded with progress. */
  async function pinned(url, spec, onProgress) {
    const u = new URL(url);
    if (u.origin !== origin()) throw new WakeError('blocked-host', `The wake word may not fetch from ${u.host}.`);
    const key = cacheKey(u.href, spec.sha256);
    let cache = null;
    try {
      cache = await scope.caches.open(WAKE_CACHE);
      const hit = await cache.match(key);
      if (hit) {
        const buf = await hit.arrayBuffer();
        if (buf.byteLength === spec.bytes) return { buf, cached: true };
        await cache.delete(key);
      }
    } catch {
      cache = null;
    }
    let res;
    try {
      res = await scope.fetch(u.href, { credentials: 'same-origin' });
    } catch {
      throw new WakeError('network', `${spec.file} could not be downloaded (offline?).`);
    }
    if (!res.ok || !res.body) throw new WakeError('network', `${spec.file} could not be downloaded (HTTP ${res.status}).`);
    const reader = res.body.getReader();
    const parts = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.byteLength;
      if (loaded > spec.bytes) throw new WakeError('integrity', `${spec.file} is bigger than the pinned ${spec.bytes} bytes.`);
      onProgress(loaded);
    }
    if (loaded !== spec.bytes) throw new WakeError('integrity', `${spec.file}: expected ${spec.bytes} bytes, got ${loaded}.`);
    const bytes = new Uint8Array(loaded);
    let at = 0;
    for (const p of parts) {
      bytes.set(p, at);
      at += p.byteLength;
    }
    if ((await sha256Hex(scope.crypto.subtle, bytes.buffer)) !== spec.sha256) throw new WakeError('integrity', `${spec.file} is damaged or was changed (SHA-256 mismatch).`);
    if (cache) {
      try {
        await cache.put(key, new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(loaded) } }));
      } catch {
        /* storage full: downloaded again next time */
      }
    }
    return { buf: bytes.buffer, cached: false };
  }

  async function init(base) {
    if (sessions) {
      send({ type: 'ready', loadMs: 0, cached: true });
      return;
    }
    if (loading) return loading;
    loading = (async () => {
      const t0 = now();
      const root = new URL(base || './', scope.location ? scope.location.href : undefined);
      const files = [
        { spec: { ...WAKE_RUNTIME, file: WAKE_RUNTIME.file }, url: new URL(WAKE_RUNTIME.path, root).href },
        ...Object.entries(WAKE_MODELS).map(([name, m]) => ({ name, spec: m, url: new URL(WAKE_MODEL_BASE + m.file, root).href })),
      ];
      const total = files.reduce((n, f) => n + f.spec.bytes, 0);
      const got = new Map();
      const progress = () => send({ type: 'progress', loaded: Array.from(got.values()).reduce((a, b) => a + b, 0), total });
      let cachedAll = true;
      const out = {};
      for (const f of files) {
        const { buf, cached } = await pinned(f.url, f.spec, (n) => {
          got.set(f.url, n);
          progress();
        });
        got.set(f.url, f.spec.bytes);
        progress();
        cachedAll = cachedAll && cached;
        out[f.name || 'runtime'] = buf;
      }
      // ONNX Runtime: one thread (the page is not cross-origin isolated), no proxy worker, our checked
      // binary.
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      // The glue module comes from this app's own wake/ort/ (same origin as this worker); the binary
      // is the checked copy above (wasmBinary: ONNX Runtime does not fetch it again).
      ort.env.wasm.wasmPaths = { mjs: new URL(WAKE_RUNTIME.glue.path, root).href, wasm: files[0].url };
      ort.env.wasm.wasmBinary = out.runtime;
      ort.env.logLevel = 'error';
      const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
      try {
        sessions = {
          mel: await ort.InferenceSession.create(new Uint8Array(out.melspectrogram), opts),
          emb: await ort.InferenceSession.create(new Uint8Array(out.embedding), opts),
          ww: await ort.InferenceSession.create(new Uint8Array(out.heyJarvis), opts),
        };
      } catch (err) {
        throw new WakeError(/WebAssembly|wasm|CompileError|Content Security/i.test(String((err && err.message) || err)) ? 'wasm' : 'init', String((err && err.message) || err).slice(0, 300));
      }
      pipeline = makePipeline();
      send({ type: 'ready', loadMs: Math.round(now() - t0), cached: cachedAll });
    })().catch((err) => {
      loading = null;
      sessions = null;
      send({ type: 'error', code: err instanceof WakeError ? err.code : 'init', message: String((err && err.message) || err).slice(0, 300) });
    });
    return loading;
  }

  function makePipeline() {
    const { mel, emb, ww } = sessions;
    return createWakePipeline({
      threshold: WAKE_WORD.threshold,
      patience: WAKE_WORD.patience,
      refractoryMs: WAKE_WORD.refractoryMs,
      melspec: async (x) => (await mel.run({ input: new ort.Tensor('float32', Float32Array.from(x), [1, x.length]) })).output.data,
      embed: async (m) => (await emb.run({ input_1: new ort.Tensor('float32', Float32Array.from(m), [1, 76, 32, 1]) })).conv2d_19.data,
      classify: async (f) => (await ww.run({ 'x.1': new ort.Tensor('float32', Float32Array.from(f), [1, 16, 96]) }))['53'].data[0],
    });
  }

  function attach(p) {
    if (port) {
      try {
        port.close();
      } catch {
        /* closed */
      }
    }
    port = p || null;
    queue.length = 0;
    if (pipeline) pipeline.reset();
    if (!port) return;
    port.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.type !== 'frame' || !(msg.samples instanceof Float32Array) || msg.samples.length !== OWW.frame) return;
      queue.push(msg.samples);
      if (queue.length > MAX_BACKLOG) {
        // Too far behind (a slow device, or the page was paused): start again from now.
        dropped += queue.length;
        queue.length = 0;
        if (pipeline) pipeline.reset();
        return;
      }
      pump();
    };
  }

  async function pump() {
    if (running || !pipeline) return;
    running = true;
    try {
      while (queue.length) {
        const frame = queue.shift();
        const t0 = now();
        const r = await pipeline.push(frame);
        spent += now() - t0;
        frames += 1;
        if (r.detected) send({ type: 'detected', score: Math.round(r.score * 1000) / 1000 });
        if (frames - statsAt >= STATS_EVERY) {
          statsAt = frames;
          send({ type: 'stats', frames, avgMs: Math.round((spent / frames) * 100) / 100, dropped });
        }
      }
    } catch (err) {
      send({ type: 'error', code: 'wasm', message: String((err && err.message) || err).slice(0, 300) });
      queue.length = 0;
    } finally {
      running = false;
    }
  }

  async function clear() {
    queue.length = 0;
    try {
      await scope.caches.delete(WAKE_CACHE);
    } catch {
      /* ignore */
    }
    send({ type: 'cleared' });
  }

  function handle(msg, ports) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'init':
        init(typeof msg.base === 'string' ? msg.base : './');
        break;
      case 'audio':
        attach(ports && ports[0]);
        break;
      case 'reset':
        queue.length = 0;
        if (pipeline) pipeline.reset();
        break;
      case 'clear':
        clear();
        break;
      default:
        break;
    }
  }

  return { handle };
}
