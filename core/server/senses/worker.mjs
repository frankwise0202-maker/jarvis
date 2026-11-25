// One speech engine in its own low-priority process (started by senses/host.mjs with child_process.fork),
// so a transcription or a sentence of George's voice never slows the Core's own second-by-second work or the
// owner's desktop, and nothing the engine does can take the Core down with it.
//
// Why a process and not a worker thread: onnxruntime-node 1.21 keeps per-process state tied to the first
// JavaScript thread that loads it; a second engine thread (hearing and voice at once), or a new thread after
// an idle unload, aborts the whole process ("Entering the V8 API without proper locking"). A process per
// engine is immune, returns all of its memory when it ends, and can be stopped at once at a deadline.
//
// messages in:  { type: 'init', kind, engineUrl, model: { repo, revision, dtype, files }, cacheDir, nice, threads, options }
//               { type: 'load', id } · { type: 'run', id, input }
// messages out: { type: 'nice', value } · { type: 'progress', loaded, total } · { type: 'loaded', id, ms, warmMs }
//               { type: 'result', id, output, ms } · { type: 'error', id, message }
//
// Linux keeps a nice value per thread: this process lowers every thread it already has, and the threads
// onnxruntime starts later inherit the main thread's.

import os from 'node:os';
import fs from 'node:fs';

const send = (msg) => {
  try {
    process.send?.(msg);
  } catch {
    // the Core went away; 'disconnect' below ends this process
  }
};

function lowerPriority(nice) {
  try {
    os.setPriority(0, nice);
  } catch {
    return null; // not fatal: the engine still runs, at the Core's own priority
  }
  try {
    for (const tid of fs.readdirSync('/proc/self/task')) {
      try {
        os.setPriority(Number(tid), nice);
      } catch {
        // a thread that just ended
      }
    }
  } catch {
    // not Linux: the main thread is enough
  }
  try {
    return os.getPriority(0);
  } catch {
    return null;
  }
}

let cfg = null;
let engine = null;
let loading = null;
const perFile = new Map();
let lastPost = 0;

function onProgress({ file, loaded, total: fileTotal, done }) {
  const total = cfg.model.files.reduce((n, [, size]) => n + size, 0);
  const expected = cfg.model.files.find(([f]) => f === file)?.[1] ?? fileTotal ?? 0;
  const value = done ? expected : Math.min(expected || loaded, loaded);
  perFile.set(file, Math.max(perFile.get(file) ?? 0, value));
  const now = Date.now();
  if (now - lastPost < 250 && !done) return;
  lastPost = now;
  let sum = 0;
  for (const v of perFile.values()) sum += v;
  send({ type: 'progress', loaded: Math.min(sum, total), total });
}

async function load() {
  if (engine) return { ms: 0, warmMs: 0 };
  loading ??= (async () => {
    const started = performance.now();
    const { createEngine } = await import(cfg.engineUrl);
    const e = await createEngine(cfg.kind, { ...cfg.model, cacheDir: cfg.cacheDir, onProgress, threads: cfg.threads, options: cfg.options ?? {} });
    const loadedAt = performance.now();
    await e.warmUp?.();
    engine = e;
    return { ms: Math.round(loadedAt - started), warmMs: Math.round(performance.now() - loadedAt) };
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

process.on('disconnect', () => process.exit(0)); // the Core stopped or restarted: never linger
process.on('message', async (msg) => {
  const id = msg?.id;
  try {
    if (msg?.type === 'init') {
      cfg = msg;
      send({ type: 'nice', value: lowerPriority(Number.isInteger(msg.nice) ? msg.nice : 10) });
      return;
    }
    if (!cfg) throw new Error('the engine was not initialised');
    if (msg?.type === 'load') {
      send({ type: 'loaded', id, ...(await load()) });
      return;
    }
    if (msg?.type === 'run') {
      await load();
      const started = performance.now();
      const output = await engine.run(msg.input);
      send({ type: 'result', id, output, ms: Math.round(performance.now() - started) });
      return;
    }
    send({ type: 'error', id, message: `unknown message: ${msg?.type}` });
  } catch (err) {
    send({ type: 'error', id, message: String(err?.message ?? err).slice(0, 500) });
  }
});
