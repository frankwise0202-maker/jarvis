// The natural voice's synthesis engine. It runs INSIDE the dedicated module Worker
// (kokoro-worker.js) so model loading and inference never block the page. No DOM.
//
//   const engine = createKokoroEngine({ scope: self, post, loadModel, tfEnv });
//   self.onmessage = (e) => engine.handle(e.data);
//
// Messages in (from engine-client.js):
//   { type: 'init', config }        load once: { source (catalog.sourceConfig), dtype, device,
//                                    weights {path, bytes, sha256}, runtime {url, bytes},
//                                    modelId, voice, warmup: true }
//   { type: 'synth', id, text, voice, speed }
//   { type: 'cancel', ids?: number[], all?: boolean }    drop queued jobs (a running one is discarded)
//   { type: 'clear' }               delete everything this voice cached (model, voices, runtime)
// Messages out:
//   { type: 'progress', stage: 'download'|'compile'|'load'|'warmup', loaded, total, file }
//     ('load' as the library starts, 'download' while files come in, 'compile' once the model file
//     is downloaded and checked and the runtime sets it up, 'warmup' for the first synthesis)
//   { type: 'ready', device, dtype, loadMs, warmupMs, downloadedBytes, threads }
//   { type: 'audio', id, pcm: Float32Array (transferred), sampleRate, synthMs, chars }
//   { type: 'error', id?, code, message }   codes: init | network | blocked-host | integrity |
//                                           wasm | webgpu | synth | busy
//   { type: 'cleared' }
//
// Fetch guard. transformers.js, kokoro-js and ONNX Runtime all call the global fetch(); the
// engine replaces it in the worker with a guard that
//   - rewrites kokoro-js's hard-coded voice URL (huggingface.co/…/resolve/main/voices/x.bin) to
//     the configured voice base (self-hosted, or HF at the pinned revision);
//   - refuses every URL outside the configured origins (and, for redirects, host suffixes):
//     the page's CSP does not govern this worker on GitHub Pages (no response headers), so the
//     worker polices its own network access;
//   - streams the big files (model weights, runtime) with progress and checks their SHA-256
//     before anything is cached or compiled;
//   - joins a self-hosted file that was split into parts (<file>.part0, .part1, …: GitHub Pages
//     keeps every file under 100 MB) back into the one file transformers.js asked for, then checks
//     the whole file's size and SHA-256.
//
// WebGPU (config.device 'webgpu', dtype 'fp32'): the same flow; the first inference compiles the
// GPU kernels, so the warm-up runs twice (config.warmupRuns) and the speed is read from the last.

import { NATURAL_CACHES } from './catalog.js';

const HF_MAIN_VOICES = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/';
const RUNTIME_CACHE = 'voice-runtime-v1'; // not 'jarvis-…': the service worker deletes those on every update
const KNOWN_CACHES = NATURAL_CACHES; // transformers-cache (the model), kokoro-voices, RUNTIME_CACHE
const WARMUP_TEXT = 'All systems are ready.'; // ~1.5 s of audio: long enough for a first speed reading

/** The runtime's cache key: its URL, tied to the pinned SHA-256 of this build's binary (v7.1). */
export function runtimeKey(rt) {
  if (!rt || !rt.url) return '';
  if (!rt.sha256) return rt.url;
  const u = new URL(rt.url, 'https://localhost/');
  u.searchParams.set('sha256', rt.sha256);
  return /^[a-z]+:/i.test(rt.url) ? u.href : `${u.pathname}${u.search}`;
}

function selfOriginOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return 'https://localhost';
  }
}

export class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Lowercase hex SHA-256 of an ArrayBuffer (WebCrypto). */
export async function sha256Hex(subtle, buffer) {
  const digest = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Error -> one of the engine's codes, for the page's fallback decision and the Settings text. */
export function classifyError(err) {
  if (err instanceof EngineError) return err.code;
  const name = String((err && err.name) || '');
  const msg = String((err && err.message) || err || '');
  if (name === 'CompileError' || /WebAssembly|wasm|Content Security Policy|CSP/i.test(msg)) return 'wasm';
  if (/webgpu|GPUAdapter|adapter/i.test(msg)) return 'webgpu';
  if (name === 'TypeError' && /fetch|network|Failed to fetch|Load failed/i.test(msg)) return 'network';
  return 'init';
}

/**
 * The fetch guard (exported for tests).
 *   cfg: { selfOrigin, voiceBase, allowOrigins: string[], allowHostSuffixes: string[],
 *          tracked: [{ suffix, bytes, sha256?, label }] }
 *   hooks: { onProgress({ file, loaded, total }), onDownloaded(bytes, file) }   (onDownloaded: a tracked
 *          file arrived whole and checked; `file` is its label)
 */
export function createGuardedFetch(baseFetch, subtle, cfg, hooks = {}) {
  const origins = new Set(cfg.allowOrigins || []);
  const suffixes = cfg.allowHostSuffixes || [];
  const allowed = (url, redirected) => {
    if (url.protocol !== 'https:' && url.origin !== cfg.selfOrigin) return false;
    if (origins.has(url.origin)) return true;
    return redirected && url.protocol === 'https:' && suffixes.some((s) => url.hostname.endsWith(s));
  };
  return async function guardedFetch(input, init) {
    const raw = typeof input === 'string' ? input : input && typeof input.url === 'string' ? input.url : String(input);
    let url = new URL(raw, cfg.selfOrigin);
    const isVoice = url.href.startsWith(HF_MAIN_VOICES);
    if (isVoice && cfg.voiceBase) url = new URL(url.href.slice(HF_MAIN_VOICES.length), cfg.voiceBase);
    if (!allowed(url, false)) throw new EngineError('blocked-host', `The voice engine may not fetch from ${url.host}.`);
    const spec = (cfg.tracked || []).find((t) => url.pathname.endsWith(t.suffix));
    // A split self-hosted file: only its parts exist on the server.
    if (spec && spec.parts > 1) return joinParts(url, spec, init);
    const res = await baseFetch(url.href, init);
    // kokoro-js reads (and caches!) a voice response without checking it: never hand it a 404 page.
    if (isVoice && !res.ok) throw new EngineError('network', `The voice file ${url.pathname.split('/').pop()} could not be downloaded (HTTP ${res.status}).`);
    if (res && res.url) {
      let final = null;
      try {
        final = new URL(res.url);
      } catch {
        final = null;
      }
      if (final && final.href !== url.href && !allowed(final, true)) throw new EngineError('blocked-host', `The voice engine was redirected to ${final.host}, which it may not use.`);
    }
    if (!spec || !res.ok || !res.body) return res;
    // A big file: stream it with progress, then check its hash before anyone caches or uses it.
    const total = Number(res.headers.get('content-length')) || spec.bytes || 0;
    const reader = res.body.getReader();
    const parts = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.byteLength;
      if (hooks.onProgress) hooks.onProgress({ file: spec.label || spec.suffix, loaded, total: Math.max(total, loaded) });
    }
    const buf = new Uint8Array(loaded);
    let at = 0;
    for (const p of parts) {
      buf.set(p, at);
      at += p.byteLength;
    }
    parts.length = 0;
    if (spec.bytes && loaded !== spec.bytes) throw new EngineError('integrity', `${spec.label || spec.suffix}: expected ${spec.bytes} bytes, got ${loaded}.`);
    if (spec.sha256) {
      const hex = await sha256Hex(subtle, buf.buffer);
      if (hex !== spec.sha256) throw new EngineError('integrity', `${spec.label || spec.suffix}: the download is damaged or was changed (SHA-256 mismatch).`);
    }
    if (hooks.onDownloaded) hooks.onDownloaded(loaded, spec.label || spec.suffix);
    return new Response(buf, { status: 200, statusText: 'OK', headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'content-length': String(loaded) } });
  };

  /** <url>.part0 … part(n-1) into one buffer of the pinned size, with progress, then the hashes. */
  async function joinParts(url, spec, init) {
    const total = Number(spec.bytes) || 0;
    if (!(total > 0)) throw new EngineError('integrity', `${spec.label || spec.suffix}: a split file needs its pinned size.`);
    const buf = new Uint8Array(total);
    let loaded = 0;
    for (let i = 0; i < spec.parts; i++) {
      const part = new URL(`${url.pathname}.part${i}`, url);
      if (!allowed(part, false)) throw new EngineError('blocked-host', `The voice engine may not fetch from ${part.host}.`);
      const res = await baseFetch(part.href, init);
      if (!res || !res.ok || !res.body) throw new EngineError('network', `${spec.label || spec.suffix}: part ${i + 1} of ${spec.parts} could not be downloaded (HTTP ${res ? res.status : 0}).`);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (loaded + value.byteLength > total) throw new EngineError('integrity', `${spec.label || spec.suffix}: the parts are bigger than the pinned ${total} bytes.`);
        buf.set(value, loaded);
        loaded += value.byteLength;
        if (hooks.onProgress) hooks.onProgress({ file: spec.label || spec.suffix, loaded, total });
      }
    }
    if (loaded !== total) throw new EngineError('integrity', `${spec.label || spec.suffix}: expected ${total} bytes, got ${loaded}.`);
    if (spec.sha256) {
      const hex = await sha256Hex(subtle, buf.buffer);
      if (hex !== spec.sha256) throw new EngineError('integrity', `${spec.label || spec.suffix}: the download is damaged or was changed (SHA-256 mismatch).`);
    }
    if (hooks.onDownloaded) hooks.onDownloaded(loaded, spec.label || spec.suffix);
    return new Response(buf, { status: 200, statusText: 'OK', headers: { 'content-type': 'application/octet-stream', 'content-length': String(loaded) } });
  }
}

/**
 * @param {object} deps
 * @param {object} deps.scope       the worker global (fetch, caches, crypto, location, navigator)
 * @param {(msg: object, transfer?: Transferable[]) => void} deps.post
 * @param {(modelId: string, opts: object) => Promise<{generate(text, opts): Promise<{audio: Float32Array, sampling_rate: number}>}>} deps.loadModel
 * @param {object} deps.tfEnv       transformers.js env (remoteHost, remotePathTemplate, backends.onnx…)
 * @param {() => number} [deps.now]
 */
export function createKokoroEngine({ scope, post, loadModel, tfEnv, now = () => performance.now() }) {
  let model = null;
  let loading = null;
  let info = null;
  const queue = []; // { id, text, voice, speed }
  let running = null; // the job being synthesized
  const discard = new Set(); // ids whose result is no longer wanted
  let busy = false;

  const send = (msg, transfer) => {
    try {
      post(msg, transfer);
    } catch {
      /* the page went away */
    }
  };

  async function init(config) {
    if (model) {
      send({ type: 'ready', ...info, cached: true });
      return;
    }
    if (loading) return loading;
    loading = (async () => {
      const t0 = now();
      const src = config.source;
      const selfOrigin = scope.location ? scope.location.origin : src.allowOrigins[0];
      const weights = config.weights;
      const rt = config.runtime;
      let downloaded = 0;
      // What is not in Cache Storage yet: the progress bar's total is the real download.
      const modelUrl = `${src.remoteHost}${src.pathTemplate.replace('{model}', config.modelId)}${weights.path}`;
      const voiceFile = (config.voiceFiles || []).find((v) => v.id === config.voice);
      let expected = 0;
      if (rt && rt.url && !(await inCache(RUNTIME_CACHE, runtimeKey(rt)))) expected += rt.bytes || 0;
      if (!(await inCache('transformers-cache', modelUrl))) expected += weights.bytes || 0;
      if (voiceFile && !(await inCache('kokoro-voices', `${HF_MAIN_VOICES}${voiceFile.id}.bin`))) expected += voiceFile.bytes || 0;
      const progressState = { files: new Map() };
      const report = (file, loaded, total) => {
        progressState.files.set(file, { loaded, total });
        let l = 0;
        let t = 0;
        for (const v of progressState.files.values()) {
          l += v.loaded;
          t += v.total;
        }
        // After start-up only voice files download (the owner picked another speaker): 'voice'.
        if (model) send({ type: 'progress', stage: 'voice', file, loaded, total });
        else send({ type: 'progress', stage: 'download', file, loaded: l, total: Math.max(t, expected) });
      };
      // 1. The fetch guard (before any library fetches).
      const baseFetch = scope.__jarvisBaseFetch || scope.fetch.bind(scope);
      scope.__jarvisBaseFetch = baseFetch;
      scope.fetch = createGuardedFetch(
        baseFetch,
        scope.crypto.subtle,
        {
          selfOrigin,
          voiceBase: src.voiceBase,
          allowOrigins: src.allowOrigins,
          allowHostSuffixes: src.allowHostSuffixes,
          tracked: [
            // Self-hosted big files come in parts; Hugging Face serves them whole.
            { suffix: `/${weights.path}`, bytes: weights.bytes, sha256: weights.sha256, label: weights.path, parts: src.mode === 'self' && weights.parts > 1 ? weights.parts : 1 },
            // Every voice the owner may pick: small, but checked like the model.
            ...(config.voiceFiles || []).map((v) => ({ suffix: `/voices/${v.id}.bin`, bytes: v.bytes, sha256: v.sha256, label: `voices/${v.id}.bin` })),
          ],
        },
        {
          onProgress: ({ file, loaded, total }) => report(file, loaded, total),
          onDownloaded: (n, file) => {
            downloaded += n;
            // The model file is here and checked: the runtime now sets it up (the GPU kernels, on
            // WebGPU). The page needs to know the download is over: the progress total also counts
            // the speaker's file, which only comes with the first synthesis.
            if (!model && file === weights.path) send({ type: 'progress', stage: 'compile', file, loaded: 0, total: 1 });
          },
        },
      );
      // 2. The ONNX Runtime binary: our own cache first (offline), else download with progress.
      const threads = scope.crossOriginIsolated ? Math.max(1, Math.min(4, (scope.navigator && scope.navigator.hardwareConcurrency) || 1)) : 1;
      const onnx = tfEnv.backends && tfEnv.backends.onnx;
      if (onnx && onnx.wasm) {
        onnx.wasm.numThreads = threads; // >1 only when cross-origin isolated (not on GitHub Pages)
        onnx.wasm.proxy = false;
        // The OBJECT form, never a string: with a string prefix ONNX Runtime import()s its glue
        // module from there instead of using the copy bundled into this worker, and
        // transformers.js presets that prefix to cdn.jsdelivr.net (third-party code in a worker
        // the page's CSP does not cover). With { wasm } it uses the bundled glue and our binary.
        onnx.wasm.wasmPaths = { wasm: (rt && rt.url) || `${src.wasmBase}ort-wasm-simd-threaded.jsep.wasm` };
        if (rt && rt.url) {
          const bin = await cachedBinary(rt, (l, t) => report(rt.label || 'runtime', l, t), (n) => (downloaded += n));
          if (bin) onnx.wasm.wasmBinary = bin;
        }
      }
      // 3. Where transformers.js finds the model, pinned (HF) or self-hosted.
      tfEnv.allowLocalModels = false;
      tfEnv.allowRemoteModels = true;
      tfEnv.remoteHost = src.remoteHost;
      tfEnv.remotePathTemplate = src.pathTemplate;
      tfEnv.useBrowserCache = true;
      // 4. Load (download on first use, Cache Storage afterwards) and compile.
      send({ type: 'progress', stage: 'load', loaded: 0, total: 1 });
      try {
        model = await loadModel(config.modelId, { dtype: config.dtype, device: config.device, progress_callback: () => {} });
      } catch (err) {
        throw err instanceof EngineError ? err : new EngineError(classifyError(err), messageOf(err));
      }
      const loadMs = Math.round(now() - t0);
      // 5. One short synthesis: the first inference is slower (kernel set-up), keep it off the owner's first sentence.
      let warmupMs = 0;
      let warmupAudioS = 0;
      if (config.warmup !== false) {
        send({ type: 'progress', stage: 'warmup', loaded: 0, total: 1 });
        // WebGPU compiles its kernels on the first run: the speed is read from the last run.
        const runs = Math.max(1, Math.min(3, Number(config.warmupRuns) || 1));
        for (let i = 0; i < runs; i++) {
          const w0 = now();
          const out = await model.generate(WARMUP_TEXT, { voice: config.voice, speed: 1 });
          warmupMs = Math.round(now() - w0);
          warmupAudioS = out && out.audio ? out.audio.length / (out.sampling_rate || 24000) : 0;
        }
      }
      info = { device: config.device, dtype: config.dtype, loadMs, warmupMs, warmupAudioS, downloadedBytes: downloaded, threads };
      send({ type: 'ready', ...info, cached: downloaded === 0 });
    })().catch((err) => {
      loading = null;
      model = null;
      send({ type: 'error', code: err instanceof EngineError ? err.code : classifyError(err), message: messageOf(err) });
    });
    return loading;
  }

  async function inCache(name, url) {
    try {
      const cache = await scope.caches.open(name);
      return !!(await cache.match(url));
    } catch {
      return false;
    }
  }

  /**
   * The ONNX Runtime binary (about 21.6 MB): our own cache first (offline), else a download with
   * progress. v7.1: like the model, it is checked. The cache key carries its pinned SHA-256
   * (runtimeKey), so a copy cached for another build of ONNX Runtime is never used; a cached copy of
   * the wrong size (damaged) is dropped and downloaded again; a download is checked (size, SHA-256)
   * before it is cached or compiled, and the copies cached for other builds are deleted.
   */
  async function cachedBinary(rt, onProgress, onDownloaded) {
    const url = rt.url;
    const bytes = rt.bytes;
    const key = runtimeKey(rt);
    let cache = null;
    try {
      cache = await scope.caches.open(RUNTIME_CACHE);
      const hit = await cache.match(key);
      if (hit) {
        const buf = await hit.arrayBuffer();
        if (!bytes || buf.byteLength === bytes) return buf;
        if (typeof cache.delete === 'function') await cache.delete(key);
      }
    } catch {
      cache = null;
    }
    const res = await scope.__jarvisBaseFetch(url);
    if (!res.ok) throw new EngineError('network', `Could not download the voice runtime (HTTP ${res.status}).`);
    const total = Number(res.headers.get('content-length')) || bytes || 0;
    const reader = res.body.getReader();
    const parts = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.byteLength;
      onProgress(loaded, Math.max(total, loaded));
    }
    const buf = new Uint8Array(loaded);
    let at = 0;
    for (const p of parts) {
      buf.set(p, at);
      at += p.byteLength;
    }
    if (bytes && loaded !== bytes) throw new EngineError('integrity', `The voice runtime arrived with ${loaded} bytes instead of ${bytes}.`);
    if (rt.sha256 && (await sha256Hex(scope.crypto.subtle, buf.buffer)) !== rt.sha256) throw new EngineError('integrity', 'The voice runtime did not match its SHA-256 (damaged or changed on the way).');
    onDownloaded(loaded);
    if (cache) {
      try {
        await cache.put(key, new Response(buf, { headers: { 'content-type': 'application/wasm', 'content-length': String(loaded) } }));
        // Copies cached for other builds (or before v7.1, under the bare URL) go.
        if (typeof cache.keys === 'function' && typeof cache.delete === 'function') {
          const keep = new URL(key, selfOriginOf(url)).href;
          for (const req of await cache.keys()) if (req && req.url && req.url !== keep) await cache.delete(req);
        }
      } catch {
        /* storage full: it is fetched again next time */
      }
    }
    return buf.buffer;
  }

  async function pumpQueue() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const job = queue.shift();
        if (discard.delete(job.id)) continue;
        running = job;
        const t0 = now();
        try {
          if (!model) throw new EngineError('init', 'The voice is not loaded.');
          const out = await model.generate(job.text, { voice: job.voice, speed: job.speed });
          const synthMs = now() - t0;
          if (discard.delete(job.id)) continue;
          // A copy: the runtime's output may live in memory it still owns; ours can be transferred.
          const pcm = new Float32Array(out.audio);
          send({ type: 'audio', id: job.id, pcm, sampleRate: out.sampling_rate || 24000, synthMs: Math.round(synthMs * 10) / 10, chars: job.text.length }, [pcm.buffer]);
        } catch (err) {
          if (!discard.delete(job.id)) send({ type: 'error', id: job.id, code: err instanceof EngineError ? err.code : 'synth', message: messageOf(err) });
        } finally {
          running = null;
        }
      }
    } finally {
      busy = false;
    }
  }

  async function clear() {
    queue.length = 0;
    for (const name of KNOWN_CACHES) {
      try {
        await scope.caches.delete(name);
      } catch {
        /* ignore */
      }
    }
    model = null;
    loading = null;
    info = null;
    send({ type: 'cleared' });
  }

  function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'init':
        init(msg.config || {});
        break;
      case 'synth':
        if (typeof msg.id !== 'number' || typeof msg.text !== 'string') return;
        queue.push({ id: msg.id, text: msg.text, voice: msg.voice, speed: Number.isFinite(msg.speed) ? msg.speed : 1 });
        pumpQueue();
        break;
      case 'cancel':
        if (msg.all) {
          for (const j of queue) discard.add(j.id);
          if (running) discard.add(running.id);
        } else if (Array.isArray(msg.ids)) for (const id of msg.ids) discard.add(id);
        // Forget ids that will never be seen again (queued ones are removed when reached).
        if (discard.size > 256) discard.clear();
        break;
      case 'clear':
        clear();
        break;
      default:
        break;
    }
  }

  return { handle, get loaded() {
    return !!model;
  } };
}

function messageOf(err) {
  return String((err && err.message) || err || 'Unknown error').slice(0, 300);
}
