// The page's handle on the natural-voice worker (kokoro-worker.js).
//
//   const engine = createNaturalEngine({ workerUrl, source, dtype, device, voice });
//   engine.start()            Promise: spawn the worker and load the model (downloads it the
//                             first time, then from Cache Storage). Resolves when ready.
//   engine.synth(text, { voice, speed }) -> { id, promise }   promise -> { pcm, sampleRate, synthMs }
//   engine.cancel(ids)        drop queued jobs (array of ids, or 'all')
//   engine.noteTiming(synthMs, audioSeconds, { underrun })   real-time-factor bookkeeping
//   engine.status()           { state, stage, loaded, total, device, dtype, error, rtf, loadMs, … }
//   engine.subscribe(fn)      fn(status) on every change; returns unsubscribe
//   engine.stop()             terminate the worker to free memory (start() reloads from cache)
//   engine.clear()            delete the downloaded files and stop
//   naturalSupport(scope)     { ok, reason } quick capability check before offering the download
//
// States: 'off' -> 'starting' -> 'downloading' -> 'loading' -> 'warming' -> 'ready'; 'slow' when
// synthesis runs slower than real time (rtf > 1 over ≥ 3 s of audio) and 'error' when the worker,
// WebAssembly or the download fails. The router (voice-router.js) uses the natural voice only in
// 'ready'; everything else speaks with the device voice.
//
// CSP (measured in headless Chromium 157, tools/csp-probe/probe.mjs): a same-origin module
// Worker takes its policy from its OWN response headers, not from the page's <meta> CSP. On
// GitHub Pages (no headers) the worker may compile WebAssembly while the page itself may not, so
// the page keeps script-src 'self' with no 'wasm-unsafe-eval'. A host that sends CSP headers must
// send the worker script its own policy: script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'
// (+ the model host). WebKit is expected to behave the same (CSP3 §4.2.2) but is untested here:
// if Safari refuses to compile, the engine reports code 'wasm' and Jarvis keeps the device voice.

const SLOW_RTF = 1.0;
// The warm-up is the engine's first inference (kernel set-up included), so it is judged leniently.
const WARMUP_SLOW_RTF = 1.6;
const WARMUP_FAST_RTF = 0.8;
const VERDICT_KEY = 'jarvis.voice.natural.verdict'; // { slow: true, rtf, at }: kept across reloads
const VERDICT_DAYS = 30;
const RTF_WINDOW = 6;
const MIN_AUDIO_FOR_VERDICT = 3; // seconds
const IDLE_STOP_MS = 5 * 60 * 1000;
const HIDDEN_STOP_MS = 60 * 1000;

// The smallest module with a SIMD instruction (v128.const + i8x16.popcnt), from wasm-feature-detect.
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

/** Can this browser run the natural voice at all? (Before offering the download.) */
export function naturalSupport(scope = globalThis) {
  try {
    if (typeof scope.Worker !== 'function') return { ok: false, reason: 'no-worker' };
    if (typeof scope.WebAssembly !== 'object' || typeof scope.WebAssembly.validate !== 'function') return { ok: false, reason: 'no-wasm' };
    if (!scope.WebAssembly.validate(SIMD_TEST)) return { ok: false, reason: 'no-simd' };
    if (!(scope.AudioContext || scope.webkitAudioContext)) return { ok: false, reason: 'no-webaudio' };
    if (!scope.caches || typeof scope.caches.open !== 'function') return { ok: false, reason: 'no-cache-storage' };
    return { ok: true, reason: '' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

function localStore(scope) {
  return {
    get: (k) => (scope.localStorage ? scope.localStorage.getItem(k) : null),
    set: (k, v) => scope.localStorage && scope.localStorage.setItem(k, v),
    remove: (k) => scope.localStorage && scope.localStorage.removeItem(k),
  };
}

export function createNaturalEngine({
  workerUrl,
  source,
  dtype = 'q8',
  device = 'wasm',
  voice = 'bm_george',
  weights,
  runtime,
  voiceFiles = [],
  modelId = 'onnx-community/Kokoro-82M-v1.0-ONNX',
  createWorker = (url) => new Worker(url, { type: 'module', name: 'jarvis-voice' }),
  scope = globalThis,
  store = localStore(scope),
  idleStopMs = IDLE_STOP_MS,
  hiddenStopMs = HIDDEN_STOP_MS,
} = {}) {
  let worker = null;
  let startPromise = null;
  let nextId = 1;
  const pending = new Map(); // id -> { resolve, reject }
  const listeners = new Set();
  const timings = [];
  let idleTimer = 0;
  let hiddenTimer = 0;
  let st = { state: 'off', stage: '', loaded: 0, total: 0, file: '', device, dtype, error: null, rtf: null, underruns: 0, loadMs: null, warmupMs: null, downloadedBytes: 0, threads: 1 };

  function set(patch) {
    st = { ...st, ...patch };
    for (const fn of Array.from(listeners)) {
      try {
        fn(st);
      } catch (err) {
        console.error('[jarvis] natural voice listener failed:', err);
      }
    }
  }

  function onMessage(event) {
    const msg = event && event.data;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'progress':
        if (msg.stage === 'voice') {
          set({ voiceLoaded: msg.loaded || 0, voiceTotal: msg.total || 0 }); // a new speaker's file; still ready
          break;
        }
        set({ state: msg.stage === 'download' ? 'downloading' : msg.stage === 'warmup' ? 'warming' : 'loading', stage: msg.stage, loaded: msg.loaded || 0, total: msg.total || 0, file: msg.file || '' });
        break;
      case 'ready': {
        // A first speed reading from the warm-up: a device far slower than real time never gets
        // to start a reply in the natural voice only to switch to the device voice mid-sentence.
        const warmRtf = msg.warmupMs > 0 && msg.warmupAudioS > 0 ? msg.warmupMs / 1000 / msg.warmupAudioS : null;
        const warmSlow = warmRtf !== null && warmRtf > WARMUP_SLOW_RTF;
        const saved = savedVerdict();
        // A clearly fast warm-up overrules an old verdict (it was taken on a busy day, say).
        if (saved && warmRtf !== null && warmRtf < WARMUP_FAST_RTF) forgetVerdict();
        const bySaved = !!saved && !(warmRtf !== null && warmRtf < WARMUP_FAST_RTF);
        const slow = st.state === 'slow' || warmSlow || bySaved;
        const round = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
        const rtf = st.rtf !== null ? st.rtf : warmSlow ? round(warmRtf) : bySaved ? round(saved.rtf) : null;
        set({ state: slow ? 'slow' : 'ready', stage: '', error: null, device: msg.device, dtype: msg.dtype, loadMs: msg.loadMs, warmupMs: msg.warmupMs, warmupRtf: round(warmRtf), rtf, downloadedBytes: msg.downloadedBytes || 0, threads: msg.threads || 1 });
        if (slow) saveVerdict();
        if (startPromise && startPromise.resolve) startPromise.resolve();
        break;
      }
      case 'audio': {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        p.resolve({ pcm: msg.pcm, sampleRate: msg.sampleRate, synthMs: msg.synthMs });
        armIdle();
        break;
      }
      case 'error': {
        if (typeof msg.id === 'number') {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            p.reject(Object.assign(new Error(msg.message || 'Synthesis failed'), { code: msg.code || 'synth' }));
          }
          return;
        }
        fail({ code: msg.code || 'init', message: msg.message || 'The natural voice could not start.' });
        break;
      }
      case 'cleared':
        set({ state: 'off', stage: '', loaded: 0, total: 0, error: null });
        break;
      default:
        break;
    }
  }

  function fail(error) {
    const sp = startPromise;
    teardown();
    set({ state: 'error', stage: '', error });
    if (sp && sp.reject) sp.reject(Object.assign(new Error(error.message), { code: error.code }));
  }

  function teardown() {
    clearTimeout(idleTimer);
    clearTimeout(hiddenTimer);
    if (worker) {
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
    }
    worker = null;
    startPromise = null;
    for (const [, p] of pending) p.reject(Object.assign(new Error('The voice stopped.'), { code: 'stopped' }));
    pending.clear();
  }

  function start() {
    if (startPromise) return startPromise.promise;
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    startPromise = { promise, resolve, reject };
    promise.catch(() => {}); // callers that don't wait still see the state
    set({ state: 'starting', stage: '', error: null, loaded: 0, total: 0 });
    try {
      worker = createWorker(workerUrl);
    } catch (err) {
      fail({ code: 'worker', message: `The voice worker could not start: ${String((err && err.message) || err)}` });
      return promise;
    }
    worker.onmessage = onMessage;
    worker.onerror = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      fail({ code: 'worker', message: (e && e.message) || 'The voice worker failed to load.' });
    };
    worker.postMessage({ type: 'init', config: { modelId, source, dtype, device, voice, weights, runtime, voiceFiles, warmup: true } });
    watchVisibility();
    return promise;
  }

  function synth(text, { voice: v = voice, speed = 1 } = {}) {
    const id = nextId++;
    clearTimeout(idleTimer);
    const promise = new Promise((resolve, reject) => {
      if (!worker || (st.state !== 'ready' && st.state !== 'slow')) {
        reject(Object.assign(new Error('The natural voice is not ready.'), { code: 'not-ready' }));
        return;
      }
      pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'synth', id, text, voice: v, speed });
    });
    return { id, promise };
  }

  function cancel(ids) {
    const list = ids === 'all' ? Array.from(pending.keys()) : (Array.isArray(ids) ? ids : []).filter((id) => pending.has(id));
    if (!list.length) return;
    for (const id of list) {
      const p = pending.get(id);
      pending.delete(id);
      if (p) p.reject(Object.assign(new Error('Cancelled.'), { code: 'cancelled' }));
    }
    if (worker) worker.postMessage({ type: 'cancel', ids: list });
    armIdle();
  }

  /** Real-time factor: synthesis time over audio time, over the last few chunks. */
  function noteTiming(synthMs, audioSeconds, { underrun = false } = {}) {
    if (!(audioSeconds > 0) || !(synthMs >= 0)) return;
    timings.push({ synthMs, audioMs: audioSeconds * 1000 });
    if (timings.length > RTF_WINDOW) timings.shift();
    const audioMs = timings.reduce((n, t) => n + t.audioMs, 0);
    const rtf = timings.reduce((n, t) => n + t.synthMs, 0) / audioMs;
    const underruns = st.underruns + (underrun ? 1 : 0);
    const slow = audioMs >= MIN_AUDIO_FOR_VERDICT * 1000 && rtf > SLOW_RTF;
    set({ rtf: Math.round(rtf * 1000) / 1000, underruns, state: slow && st.state === 'ready' ? 'slow' : st.state });
    if (slow) saveVerdict();
  }

  /** The saved "too slow" verdict ({ slow, rtf, at }) when it is from the last 30 days, else null. */
  function savedVerdict() {
    try {
      const v = JSON.parse(store.get(VERDICT_KEY) || 'null');
      return v && v.slow && Date.now() - v.at < VERDICT_DAYS * 86400000 ? v : null;
    } catch {
      return null;
    }
  }

  function knownSlow() {
    return !!savedVerdict();
  }

  function forgetVerdict() {
    try {
      store.remove(VERDICT_KEY);
    } catch {
      /* ignore */
    }
  }

  function saveVerdict() {
    try {
      const prev = savedVerdict();
      store.set(VERDICT_KEY, JSON.stringify({ slow: true, rtf: st.rtf !== null ? st.rtf : prev ? prev.rtf : null, at: Date.now() }));
    } catch {
      /* storage unavailable: the verdict lasts this session */
    }
  }

  /** The owner chose to try again (Settings): forget the slow verdict. */
  function resetVerdict() {
    timings.length = 0;
    forgetVerdict();
    set({ rtf: null, underruns: 0, state: st.state === 'slow' ? 'ready' : st.state });
  }

  function armIdle() {
    clearTimeout(idleTimer);
    if (!worker || pending.size || !(idleStopMs > 0)) return;
    idleTimer = setTimeout(() => {
      if (!pending.size) stop();
    }, idleStopMs);
  }

  let watching = false;
  function watchVisibility() {
    if (watching) return;
    watching = true;
    try {
      const d = scope.document;
      if (!d || typeof d.addEventListener !== 'function') return;
      d.addEventListener('visibilitychange', () => {
        clearTimeout(hiddenTimer);
        if (d.hidden && worker && hiddenStopMs > 0) hiddenTimer = setTimeout(() => !pending.size && stop(), hiddenStopMs);
      });
    } catch {
      /* ignore */
    }
  }

  /** Terminate the worker (frees the model's memory). The download stays in Cache Storage. */
  function stop() {
    const wasRunning = !!worker;
    teardown();
    if (wasRunning && st.state !== 'error') set({ state: 'off', stage: '' });
  }

  /** Delete the download (model, voices, runtime) and stop. */
  async function clear() {
    teardown();
    for (const name of ['transformers-cache', 'kokoro-voices', 'voice-runtime-v1']) {
      try {
        await scope.caches.delete(name);
      } catch {
        /* ignore */
      }
    }
    timings.length = 0;
    set({ state: 'off', stage: '', loaded: 0, total: 0, error: null, rtf: null, underruns: 0 });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    start,
    synth,
    cancel,
    noteTiming,
    resetVerdict,
    stop,
    clear,
    subscribe,
    status: () => st,
    ready: () => st.state === 'ready',
    knownSlow,
    setVoice(v) {
      voice = v;
    },
    get voice() {
      return voice;
    },
  };
}
