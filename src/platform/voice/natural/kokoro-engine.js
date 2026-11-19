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
//     before anything is cached or compiled.

const HF_MAIN_VOICES = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/';
const RUNTIME_CACHE = 'voice-runtime-v1'; // not 'jarvis-…': the service worker deletes those on every update
const KNOWN_CACHES = ['transformers-cache', 'kokoro-voices', RUNTIME_CACHE];
const WARMUP_TEXT = 'All systems are ready.'; // ~1.5 s of audio: long enough for a first speed reading

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
 *   hooks: { onProgress({ file, loaded, total }), onDownloaded(bytes) }
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
    const spec = (cfg.tracked || []).find((t) => url.pathname.endsWith(t.suffix));
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
    if (hooks.onDownloaded) hooks.onDownloaded(loaded);
    return new Response(buf, { status: 200, statusText: 'OK', headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'content-length': String(loaded) } });
  };
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
      if (rt && rt.url && !(await inCache(RUNTIME_CACHE, rt.url))) expected += rt.bytes || 0;
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
            { suffix: `/${weights.path}`, bytes: weights.bytes, sha256: weights.sha256, label: weights.path },
            // Every voice the owner may pick: small, but checked like the model.
            ...(config.voiceFiles || []).map((v) => ({ suffix: `/voices/${v.id}.bin`, bytes: v.bytes, sha256: v.sha256, label: `voices/${v.id}.bin` })),
          ],
        },
        { onProgress: ({ file, loaded, total }) => report(file, loaded, total), onDownloaded: (n) => (downloaded += n) },
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
          const bin = await cachedBinary(rt.url, rt.bytes, (l, t) => report(rt.label || 'runtime', l, t), (n) => (downloaded += n));
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
        const w0 = now();
        const out = await model.generate(WARMUP_TEXT, { voice: config.voice, speed: 1 });
        warmupMs = Math.round(now() - w0);
        warmupAudioS = out && out.audio ? out.audio.length / (out.sampling_rate || 24000) : 0;
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

  async function cachedBinary(url, bytes, onProgress, onDownloaded) {
    let cache = null;
    try {
      cache = await scope.caches.open(RUNTIME_CACHE);
      const hit = await cache.match(url);
      if (hit) return await hit.arrayBuffer();
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
    onDownloaded(loaded);
    if (cache) {
      try {
        await cache.put(url, new Response(buf, { headers: { 'content-type': 'application/wasm', 'content-length': String(loaded) } }));
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
