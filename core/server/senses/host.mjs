// The Core's side of one speech engine (hearing or voice): an engine process (senses/worker.mjs, forked on
// demand, at nice 10), one request at a time with at most `queueMax` waiting, a deadline for each request,
// and the process (and with it all of the model's memory) let go after `idleMs` without a request.
//
//   const host = createSenseHost({ kind: 'hear', getModel: () => HEAR_MODELS['base.en'], cacheDir, … });
//   await host.load();                                    // download if needed, load, warm up
//   await host.run(input, { timeoutMs, signal })          // → { output, ms, waitedMs }
//   host.status()                                         // { loaded, loading, busy, queued, progress, nice, lastError }
//   host.touch()                                          // start the idle time again (a request is coming)
//   host.unload(); await host.stop();
//
// A request whose deadline passes ends the engine process at once (onnxruntime cannot be interrupted
// mid-run); the next request starts a fresh one. An engine that crashes, even inside onnxruntime's native
// code, only ends its own process: its request fails and the next request starts a fresh one.

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export class SenseError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const WORKER_FILE = fileURLToPath(new URL('./worker.mjs', import.meta.url));

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
  let worker = null; // the engine's child process
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
  const label = kind === 'hear' ? 'hearing' : 'voice';

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
      log(`${label}: unloading the model after ${Math.round(idleMs / 60_000)} minutes without a request`);
      killWorker('idle');
    }, idleMs);
    idleTimer.unref?.();
  }

  function rejectPending(err) {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  }

  /** Hold the Core's event loop open only while a reply is due: an idle engine never keeps anything alive. */
  function hold(child, on) {
    try {
      if (on) {
        child.ref();
        child.channel?.ref?.();
      } else {
        child.unref();
        child.channel?.unref?.();
      }
    } catch {
      // the process already ended
    }
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
      hold(w, false);
      try {
        w.kill('SIGKILL'); // a model in memory has nothing to save: free it at once
      } catch {
        // already gone
      }
    }
    rejectPending(new SenseError(503, 'engine_stopped', `the ${label} engine was stopped (${reason})`));
    onChange();
  }

  function spawn(model) {
    const tail = []; // the engine's last lines of output, for the log when it fails
    const w = fork(workerFile, [], {
      execArgv: [], // never the Core's own flags (a test runner's --test, an inspector)
      serialization: 'advanced', // Float32Array audio crosses as it is
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    for (const stream of [w.stdout, w.stderr]) {
      stream?.setEncoding('utf8');
      stream?.on('data', (chunk) => {
        for (const line of String(chunk).split('\n')) if (line.trim()) tail.push(line.slice(0, 300));
        tail.splice(0, Math.max(0, tail.length - 12));
      });
      stream?.unref?.();
    }
    hold(w, false);
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
      if (!pending.size) hold(w, false);
      if (msg.type === 'error') p.reject(new SenseError(500, 'engine_failed', msg.message || 'the speech engine failed'));
      else p.resolve(msg);
    });
    w.on('error', (err) => {
      log(`${label}: the engine process failed: ${err?.message ?? err}`);
      if (worker === w) {
        lastError = String(err?.message ?? err);
        killWorker('failed');
      }
    });
    w.on('exit', (code, signal) => {
      if (worker === w) {
        const why = signal ? `signal ${signal}` : `code ${code}`;
        log(`${label}: the engine process ended (${why})${tail.length ? `: ${tail.slice(-3).join(' | ')}` : ''}`);
        lastError = `the engine process ended (${why})`;
        killWorker(`ended with ${why}`);
      }
    });
    w.send({ type: 'init', kind, engineUrl, model: { repo: model.repo, revision: model.revision, dtype: model.dtype, files: model.files }, cacheDir, nice, threads, options: engineOptions });
    worker = w;
    workerModelKey = modelKey(model);
    return w;
  }

  function call(type, payload = {}) {
    const w = worker;
    if (!w) return Promise.reject(new SenseError(503, 'engine_stopped', 'the speech engine is not running'));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      hold(w, true);
      try {
        w.send({ type, id, ...payload }, (err) => {
          if (!err || !pending.has(id)) return;
          pending.delete(id);
          if (!pending.size) hold(w, false);
          reject(new SenseError(503, 'engine_stopped', `the ${label} engine could not be reached`));
        });
      } catch (err) {
        pending.delete(id);
        if (!pending.size) hold(w, false);
        reject(err);
      }
    });
  }

  /**
   * Make sure the current model is loaded (downloading it first if needed). warm: false skips the warm-up run
   * when a real request is waiting to be the first run anyway (the first request after an idle unload).
   */
  function load({ warm = true } = {}) {
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
      timer = setTimeout(() => reject(new SenseError(504, 'load_timeout', `loading the ${label} model took longer than ${Math.round(loadTimeoutMs / 60_000)} minutes`)), loadTimeoutMs);
      timer.unref?.();
    });
    onChange();
    loadingPromise = Promise.race([call('load', { warm }), timeout])
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
      await Promise.race([load({ warm: false }), deadline]);
      const r = await Promise.race([call('run', { input: job.input }), deadline]);
      return { output: r.output, ms: r.ms };
    } catch (err) {
      if (err?.code === 'timeout') {
        log(`${label}: a request passed its deadline; the engine is restarted for the next one`);
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
  function run(input, { timeoutMs = 60_000, signal } = {}) {
    if (stopped) return Promise.reject(new SenseError(503, 'stopped', 'the Core is stopping'));
    if (queue.length >= queueMax) return Promise.reject(new SenseError(503, 'busy', `the home base is busy with other ${kind === 'hear' ? 'transcriptions' : 'speech'}; try again in a moment`, { 'Retry-After': '2' }));
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const job = { input, queuedAt: now, deadline: now + timeoutMs, resolve, reject };
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
      for (const job of queue.splice(0)) job.reject(new SenseError(503, 'engine_stopped', `the ${label} engine was ${reason}`));
      killWorker(reason);
    },
    /** Start the idle time again for a loaded engine (a request is coming). */
    touch() {
      if (loaded && worker) armIdle();
    },
    status() {
      return {
        loaded: loaded && !!worker,
        pid: worker?.pid ?? null,
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
      killWorker('Core stopping');
    },
  };
}
