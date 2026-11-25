// The Core's side of one speech engine (hearing or voice): a worker thread (senses/worker.mjs) started on
// demand, one request at a time with at most `queueMax` waiting, a deadline for each request, and the
// worker (and with it the model's memory) let go after `idleMs` without a request.
//
//   const host = createSenseHost({ kind: 'hear', getModel: () => HEAR_MODELS['base.en'], cacheDir, … });
//   await host.load();                                    // download if needed, load, warm up
//   await host.run(input, { timeoutMs, signal })          // → { output, ms, waitedMs }
//   host.status()                                         // { loaded, loading, busy, queued, progress, nice, lastError }
//   await host.unload(); await host.stop();
//
// A request whose deadline passes ends the worker (onnxruntime cannot be interrupted mid-run); the next
// request starts a fresh one. A worker that crashes rejects its request and is replaced the same way.

import { Worker } from 'node:worker_threads';

export class SenseError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const WORKER_FILE = new URL('./worker.mjs', import.meta.url);

export function createSenseHost({
  kind,
  getModel,
  cacheDir,
  engineUrl = new URL('./engines.mjs', import.meta.url).href,
  workerFile = WORKER_FILE,
  nice = 10,
  threads,
  engineOptions = {},
  idleMs = 30 * 60_000,
  loadTimeoutMs = 30 * 60_000,
  queueMax = 3,
  queueWaitMs = 30_000,
  onProgress = () => {},
  onChange = () => {},
  log = () => {},
}) {
  let worker = null;
  let workerModelKey = null;
  let loaded = false;
  let loadingPromise = null;
  let progress = { loaded: 0, total: 0 };
  let niceValue = null;
  let lastError = null;
  let idleTimer = null;
  let seq = 0;
  const pending = new Map(); // message id → { resolve, reject }
  const queue = []; // waiting jobs
  let running = null;
  let stopped = false;
  const timings = { loadMs: null, warmMs: null };

  const modelKey = (m) => `${m.repo}@${m.revision}:${JSON.stringify(m.dtype)}`;

  function clearIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function armIdle() {
    clearIdle();
    if (!worker || running || queue.length || !Number.isFinite(idleMs) || idleMs <= 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (running || queue.length) return;
      log(`${kind}: unloading the model after ${Math.round(idleMs / 60_000)} minutes without a request`);
      killWorker('idle');
    }, idleMs);
    idleTimer.unref?.();
  }

  function rejectPending(err) {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  }

  function killWorker(reason) {
    const w = worker;
    worker = null;
    workerModelKey = null;
    loaded = false;
    clearIdle();
    if (w) {
      w.removeAllListeners('message');
      w.removeAllListeners('exit');
      w.on('error', () => {});
      w.terminate().catch(() => {});
    }
    rejectPending(new SenseError(503, 'engine_stopped', `the ${kind === 'hear' ? 'hearing' : 'voice'} engine was stopped (${reason})`));
    onChange();
  }

  function spawn(model) {
    const w = new Worker(workerFile, {
      workerData: { kind, engineUrl, model: { repo: model.repo, revision: model.revision, dtype: model.dtype, files: model.files }, cacheDir, nice, threads, options: engineOptions },
      stdout: false,
      stderr: false,
    });
    w.unref(); // never keeps the Core (or a test) alive by itself
    w.on('message', (msg) => {
      if (msg?.type === 'progress') {
        progress = { loaded: msg.loaded, total: msg.total };
        onProgress(progress);
        return;
      }
      if (msg?.type === 'nice') {
        niceValue = msg.value;
        return;
      }
      const p = pending.get(msg?.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new SenseError(500, 'engine_failed', msg.message || 'the speech engine failed'));
      else p.resolve(msg);
    });
    w.on('error', (err) => {
      log(`${kind}: the engine stopped with an error: ${err?.message ?? err}`);
      if (worker === w) {
        lastError = String(err?.message ?? err);
        killWorker('crashed');
      }
    });
    w.on('exit', (code) => {
      if (worker === w) {
        log(`${kind}: the engine exited (${code})`);
        killWorker(`exited with code ${code}`);
      }
    });
    worker = w;
    workerModelKey = modelKey(model);
    return w;
  }

  function call(type, payload = {}, transfer = []) {
    const w = worker;
    if (!w) return Promise.reject(new SenseError(503, 'engine_stopped', 'the speech engine is not running'));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        w.postMessage({ type, id, ...payload }, transfer);
      } catch (err) {
        pending.delete(id);
        reject(err);
      }
    });
  }

  /** Make sure the current model is loaded (downloading it first if needed). */
  function load() {
    if (stopped) return Promise.reject(new SenseError(503, 'stopped', 'the Core is stopping'));
    const model = getModel();
    if (worker && workerModelKey !== modelKey(model)) killWorker('model changed');
    if (loaded && worker) return Promise.resolve({ ms: 0, warmMs: 0 });
    if (loadingPromise) return loadingPromise;
    if (!worker) spawn(model);
    progress = { loaded: 0, total: model.files.reduce((n, [, s]) => n + s, 0) };
    const w = worker;
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new SenseError(504, 'load_timeout', `loading the ${kind === 'hear' ? 'hearing' : 'voice'} model took longer than ${Math.round(loadTimeoutMs / 60_000)} minutes`)), loadTimeoutMs);
      timer.unref?.();
    });
    onChange();
    loadingPromise = Promise.race([call('load'), timeout])
      .then((r) => {
        if (worker !== w) throw new SenseError(503, 'engine_stopped', 'the speech engine was stopped while loading');
        loaded = true;
        lastError = null;
        timings.loadMs = r.ms ?? null;
        timings.warmMs = r.warmMs ?? null;
        progress = { loaded: progress.total, total: progress.total };
        armIdle();
        return r;
      })
      .catch((err) => {
        lastError = String(err?.message ?? err);
        if (worker === w) killWorker('load failed');
        throw err instanceof SenseError ? err : new SenseError(500, 'load_failed', lastError);
      })
      .finally(() => {
        clearTimeout(timer);
        loadingPromise = null;
        onChange();
      });
    return loadingPromise;
  }

  async function execute(job) {
    const remaining = () => job.deadline - Date.now();
    let timer = null;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new SenseError(504, 'timeout', `the ${kind === 'hear' ? 'transcription' : 'speech'} took too long`)), Math.max(1, remaining()));
      timer.unref?.();
    });
    try {
      await Promise.race([load(), deadline]);
      const r = await Promise.race([call('run', { input: job.input }, job.transfer), deadline]);
      return { output: r.output, ms: r.ms };
    } catch (err) {
      if (err?.code === 'timeout') {
        log(`${kind}: a request passed its deadline; restarting the engine`);
        killWorker('deadline passed');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function pump() {
    if (running || stopped) return;
    const job = queue.shift();
    if (!job) {
      armIdle();
      return;
    }
    clearIdle();
    running = job;
    job.startedAt = Date.now();
    onChange();
    execute(job)
      .then((r) => job.resolve({ ...r, waitedMs: job.startedAt - job.queuedAt }), (err) => job.reject(err))
      .finally(() => {
        running = null;
        onChange();
        pump();
      });
  }

  /** Queue one request. Rejects with 503 busy when queueMax are already waiting. */
  function run(input, { timeoutMs = 60_000, signal, transfer = [] } = {}) {
    if (stopped) return Promise.reject(new SenseError(503, 'stopped', 'the Core is stopping'));
    if (queue.length >= queueMax) return Promise.reject(new SenseError(503, 'busy', `the home base is busy with other ${kind === 'hear' ? 'transcriptions' : 'speech'}; try again in a moment`, { 'Retry-After': '2' }));
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const job = { input, transfer, queuedAt: now, deadline: now + timeoutMs, resolve, reject };
      queue.push(job);
      // Waiting too long in the queue, or the asker went away: drop it before it uses the engine.
      const waitTimer = setTimeout(() => {
        const i = queue.indexOf(job);
        if (i >= 0) {
          queue.splice(i, 1);
          reject(new SenseError(503, 'busy', 'the home base was busy for too long; try again', { 'Retry-After': '2' }));
          onChange();
        }
      }, Math.min(queueWaitMs, timeoutMs));
      waitTimer.unref?.();
      const settle = (fn) => (v) => {
        clearTimeout(waitTimer);
        signal?.removeEventListener?.('abort', onAbort);
        fn(v);
      };
      job.resolve = settle(resolve);
      job.reject = settle(reject);
      const onAbort = () => {
        const i = queue.indexOf(job);
        if (i >= 0) {
          queue.splice(i, 1);
          job.reject(new SenseError(499, 'cancelled', 'the request was cancelled'));
          onChange();
        }
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener?.('abort', onAbort, { once: true });
      onChange();
      pump();
    });
  }

  return {
    kind,
    load,
    run,
    /** Let the model go (memory back to the system); the next request loads it again. */
    unload(reason = 'turned off') {
      for (const job of queue.splice(0)) job.reject(new SenseError(503, 'engine_stopped', `the ${kind === 'hear' ? 'hearing' : 'voice'} engine was ${reason}`));
      killWorker(reason);
    },
    status() {
      return {
        loaded: loaded && !!worker,
        loading: !!loadingPromise,
        busy: !!running,
        queued: queue.length,
        progress: { ...progress },
        nice: niceValue,
        lastError,
        loadMs: timings.loadMs,
        warmMs: timings.warmMs,
      };
    },
    async stop() {
      stopped = true;
      for (const job of queue.splice(0)) job.reject(new SenseError(503, 'stopped', 'the Core is stopping'));
      const w = worker;
      killWorker('Core stopping');
      if (w) await w.terminate().catch(() => {});
    },
  };
}
