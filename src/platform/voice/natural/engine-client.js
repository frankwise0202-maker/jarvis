// The page's handle on the natural-voice worker (kokoro-worker.js).
//
//   const engine = createNaturalEngine({ workerUrl, source, plans, voice });
//   engine.start()            Promise: spawn the worker and load the model (downloads it the
//                             first time, then from Cache Storage). Resolves when ready.
//   engine.planInfo()         Promise<{ device, dtype, weights }>: what start() will run (the
//                             Settings card shows its download size before the download starts)
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
// Plans (catalog.js ENGINE_PLANS): `plans` lists the ways to run the voice, best first, e.g.
// [{ device: 'webgpu', dtype: 'fp32', weights, available }, { device: 'wasm', dtype: 'q8', weights }]
// (`available`: a boolean, a Promise of one, or a function returning either: does the browser
// offer a real WebGPU adapter?). The ladder, by the measured speed:
//   1. WebGPU: when it fails to load, or its warm-up or its speech is slower than real time, the
//      verdict is kept for 30 days ('jarvis.voice.natural.webgpu') and the WASM plan loads instead
//      (status.fallback: 'webgpu-failed' | 'webgpu-slow').
//   2. WASM: when it is too slow, state 'slow' (verdict 'jarvis.voice.natural.verdict'): the
//      built-in voice speaks.
// A page that died while the GPU model was being set up (iOS ends a tab that takes too much memory)
// leaves 'jarvis.voice.natural.attempt' behind: the next start skips WebGPU.
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
const VERDICT_KEY = 'jarvis.voice.natural.verdict'; // { slow: true, rtf, at }: kept across reloads (WASM)
const WEBGPU_KEY = 'jarvis.voice.natural.webgpu'; // { failed|slow: true, rtf, code, at }: WebGPU ruled out for now
const ATTEMPT_KEY = 'jarvis.voice.natural.attempt'; // { device: 'webgpu', at } while the GPU model is set up
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
  plans = null,
} = {}) {
  const planList = (Array.isArray(plans) && plans.length ? plans : [{ device, dtype, weights }]).map((p) => ({ ...p, weights: p.weights || weights }));
  let current = null; // the plan the worker runs
  let worker = null;
  let startPromise = null;
  let nextId = 1;
  const pending = new Map(); // id -> { resolve, reject }
  const listeners = new Set();
  const timings = [];
  let idleTimer = 0;
  let hiddenTimer = 0;
  let st = { state: 'off', stage: '', loaded: 0, total: 0, file: '', device: planList[0].device, dtype: planList[0].dtype, plan: '', fallback: '', error: null, rtf: null, underruns: 0, loadMs: null, warmupMs: null, downloadedBytes: 0, threads: 1 };

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
        // The download is done and the GPU model is being set up: if the page dies now, the next
        // start knows (iOS ends tabs that use too much memory).
        if (msg.stage === 'load' && current && current.device === 'webgpu') writeJson(ATTEMPT_KEY, { device: 'webgpu', at: Date.now() });
        set({ state: msg.stage === 'download' ? 'downloading' : msg.stage === 'warmup' ? 'warming' : 'loading', stage: msg.stage, loaded: msg.loaded || 0, total: msg.total || 0, file: msg.file || '' });
        break;
      case 'ready': {
        removeKey(ATTEMPT_KEY);
        // A first speed reading from the warm-up: a device far slower than real time never gets
        // to start a reply in the natural voice only to switch to the device voice mid-sentence.
        const warmRtf = msg.warmupMs > 0 && msg.warmupAudioS > 0 ? msg.warmupMs / 1000 / msg.warmupAudioS : null;
        const warmSlow = warmRtf !== null && warmRtf > WARMUP_SLOW_RTF;
        if (current && current.device === 'webgpu' && warmSlow && nextPlan()) {
          // The graphics chip is slower than real time: try the processor (WASM) instead.
          saveWebgpuVerdict({ slow: true, rtf: Math.round(warmRtf * 100) / 100 });
          fallBack('webgpu-slow');
          break;
        }
        const saved = current && current.device === 'webgpu' ? null : savedVerdict();
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
        removeKey(ATTEMPT_KEY);
        if (current && current.device === 'webgpu' && nextPlan()) {
          // WebGPU could not load the model (no adapter in the worker, a kernel it lacks, memory):
          // the processor (WASM) instead.
          saveWebgpuVerdict({ failed: true, code: msg.code || 'webgpu' });
          fallBack('webgpu-failed');
          break;
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

  // ---- plans: WebGPU first when the browser offers it, else WASM -------------------------------
  function readJson(key) {
    try {
      return JSON.parse(store.get(key) || 'null');
    } catch {
      return null;
    }
  }
  function writeJson(key, value) {
    try {
      store.set(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: it lasts this session */
    }
  }
  function removeKey(key) {
    try {
      store.remove(key);
    } catch {
      /* ignore */
    }
  }

  /** WebGPU ruled out for now: a failure or a slow verdict from the last 30 days. */
  function webgpuVerdict() {
    const v = readJson(WEBGPU_KEY);
    return v && (v.failed || v.slow) && Date.now() - v.at < VERDICT_DAYS * 86400000 ? v : null;
  }
  function saveWebgpuVerdict(v) {
    writeJson(WEBGPU_KEY, { ...v, at: Date.now() });
  }

  /** A page that died while setting up the GPU model (the attempt marker is still there). */
  function crashedOnGpu() {
    const a = readJson(ATTEMPT_KEY);
    if (!a || a.device !== 'webgpu') return false;
    removeKey(ATTEMPT_KEY);
    saveWebgpuVerdict({ failed: true, code: 'crashed' });
    return true;
  }

  function ruledOut(plan) {
    return plan.device === 'webgpu' && !!webgpuVerdict();
  }

  let gpuAnswer = null; // the last answer of a plan's `available` check (true | false | null: not asked yet)

  /** The plan after the one in use (the fallback), or null. */
  function nextPlan() {
    const i = planList.indexOf(current);
    return planList.slice(i + 1).find((p) => !ruledOut(p)) || null;
  }

  /** The plan start() runs: a Promise, or the plan itself when no browser check is needed. */
  function resolvePlan() {
    if (planList.some((p) => p.device === 'webgpu')) crashedOnGpu();
    const viable = planList.filter((p) => !ruledOut(p));
    const list = viable.length ? viable : [planList[planList.length - 1]];
    const check = (p) => {
      const a = typeof p.available === 'function' ? p.available() : p.available;
      return a === undefined ? true : a;
    };
    const first = list[0];
    const ok = check(first);
    if (ok === true || list.length === 1) return first;
    if (ok === false) return list[1];
    return Promise.resolve(ok).then(
      (yes) => {
        gpuAnswer = !!yes;
        return yes ? first : list[1];
      },
      () => {
        gpuAnswer = false;
        return list[1];
      },
    );
  }

  function start() {
    if (startPromise) return startPromise.promise;
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const sp = { promise, resolve, reject };
    startPromise = sp;
    promise.catch(() => {}); // callers that don't wait still see the state
    set({ state: 'starting', stage: '', error: null, loaded: 0, total: 0, fallback: '' });
    const plan = resolvePlan();
    if (plan && typeof plan.then === 'function') plan.then((p) => startPromise === sp && spawn(p));
    else spawn(plan);
    watchVisibility();
    return promise;
  }

  function spawn(plan) {
    current = plan;
    // Told with the next change ('downloading', 'ready', …): no extra 'starting' notice.
    st = { ...st, plan: plan.device, device: plan.device, dtype: plan.dtype };
    try {
      worker = createWorker(workerUrl);
    } catch (err) {
      fail({ code: 'worker', message: `The voice worker could not start: ${String((err && err.message) || err)}` });
      return;
    }
    const w = worker;
    worker.onmessage = onMessage;
    worker.onerror = (e) => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (worker !== w) return;
      // The GPU set-up can take the worker down: the processor plan, if there is one.
      if (current && current.device === 'webgpu' && st.state !== 'ready' && nextPlan()) {
        removeKey(ATTEMPT_KEY);
        saveWebgpuVerdict({ failed: true, code: 'worker' });
        fallBack('webgpu-failed');
        return;
      }
      fail({ code: 'worker', message: (e && e.message) || 'The voice worker failed to load.' });
    };
    worker.postMessage({
      type: 'init',
      config: { modelId, source, dtype: plan.dtype, device: plan.device, voice, weights: plan.weights, runtime, voiceFiles, warmup: true, warmupRuns: plan.device === 'webgpu' ? 2 : 1 },
    });
  }

  /** WebGPU failed or was slow while starting: the next plan loads in a new worker (start() still waits). */
  function fallBack(reason) {
    const next = nextPlan();
    if (worker) {
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
    }
    worker = null;
    for (const [, p] of pending) p.reject(Object.assign(new Error('The voice engine changed.'), { code: 'stopped' }));
    pending.clear();
    timings.length = 0;
    if (!next) {
      fail({ code: 'webgpu', message: 'The graphics chip could not run the voice.' });
      return;
    }
    set({ state: 'starting', stage: '', loaded: 0, total: 0, fallback: reason, rtf: null, plan: next.device, device: next.device, dtype: next.dtype });
    spawn(next);
  }

  /** What start() will run: { device, dtype, weights } (the Settings card shows its download size). */
  function planInfo() {
    return Promise.resolve(resolvePlan()).then((p) => ({ device: p.device, dtype: p.dtype, weights: p.weights }));
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
    if (slow && current && current.device === 'webgpu' && st.state === 'ready' && nextPlan()) {
      // The graphics chip turned out slower than real time: this reply hands over to the device
      // voice ('slow'), and the processor (WASM) engine loads for the next ones.
      saveWebgpuVerdict({ slow: true, rtf: Math.round(rtf * 100) / 100 });
      set({ rtf: Math.round(rtf * 1000) / 1000, underruns, state: 'slow' });
      setTimeout(() => {
        if (st.state !== 'slow' || !current || current.device !== 'webgpu') return;
        stop();
        start();
        set({ fallback: 'webgpu-slow' });
      }, 0);
      return;
    }
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

  /**
   * Too slow here, by a verdict from the last 30 days: the processor (WASM) was slower than real
   * time and the graphics chip cannot take over (no WebGPU plan, ruled out, or no adapter).
   */
  function knownSlow() {
    if (!savedVerdict()) return false;
    const gpu = planList.find((p) => p.device === 'webgpu');
    return !gpu || ruledOut(gpu) || gpuAnswer === false;
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

  /** The owner chose to try again (Settings): forget the slow verdicts (WebGPU's too). */
  function resetVerdict() {
    timings.length = 0;
    forgetVerdict();
    removeKey(WEBGPU_KEY);
    removeKey(ATTEMPT_KEY);
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
    planInfo,
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
    /** The kept "too slow" verdict of the processor engine ({ slow, rtf, at }), or null. */
    verdict: () => savedVerdict(),
    setVoice(v) {
      voice = v;
    },
    get voice() {
      return voice;
    },
  };
}
