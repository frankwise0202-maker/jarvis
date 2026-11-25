// One speech engine in its own worker thread, at low CPU priority, so a transcription or a sentence of
// George's voice never slows the Core's own second-by-second work or the owner's desktop.
//
// workerData: { kind: 'hear'|'speak', engineUrl, model: { repo, revision, dtype, files }, cacheDir, nice, threads, options }
// messages in:  { type: 'load', id } · { type: 'run', id, input }
// messages out: { type: 'progress', loaded, total } · { type: 'loaded', id, ms, warmMs } · { type: 'result', id, output, ms }
//               { type: 'error', id, message } · { type: 'nice', value }
//
// The nice value is per thread on Linux, and the threads onnxruntime starts for this engine are made by this
// thread after the call below, so they inherit it. The engine (senses/engines.mjs, or a test stub) is
// imported only here.

import { parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';

const { kind, engineUrl, model, cacheDir, nice = 10, threads, options = {} } = workerData;

let niceValue = null;
try {
  os.setPriority(0, nice); // 0 = this thread (Linux keeps a nice value per thread)
  niceValue = os.getPriority(0);
} catch {
  niceValue = null; // not fatal: the engine still runs, at the Core's own priority
}
parentPort.postMessage({ type: 'nice', value: niceValue });

const total = model.files.reduce((n, [, size]) => n + size, 0);
const perFile = new Map();
let lastPost = 0;

function onProgress({ file, loaded, total: fileTotal, done }) {
  const expected = model.files.find(([f]) => file === f || file.endsWith(`/${f}`) || f.endsWith(file))?.[1] ?? fileTotal ?? 0;
  const value = done ? expected : Math.min(expected || loaded, loaded);
  perFile.set(file, Math.max(perFile.get(file) ?? 0, value));
  const now = Date.now();
  if (now - lastPost < 250 && !done) return;
  lastPost = now;
  let sum = 0;
  for (const v of perFile.values()) sum += v;
  parentPort.postMessage({ type: 'progress', loaded: Math.min(sum, total), total });
}

let engine = null;
let loading = null;

async function load() {
  if (engine) return { ms: 0, warmMs: 0 };
  loading ??= (async () => {
    const started = performance.now();
    const { createEngine } = await import(engineUrl);
    const e = await createEngine(kind, { ...model, cacheDir, onProgress, threads, options });
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

function transferables(output) {
  const out = [];
  if (output?.audio instanceof Float32Array) {
    const copy = new Float32Array(output.audio); // its own buffer, safe to hand over
    output.audio = copy;
    out.push(copy.buffer);
  }
  return out;
}

parentPort.on('message', async (msg) => {
  const id = msg?.id;
  try {
    if (msg?.type === 'load') {
      const r = await load();
      parentPort.postMessage({ type: 'loaded', id, ...r });
      return;
    }
    if (msg?.type === 'run') {
      await load();
      const started = performance.now();
      const output = await engine.run(msg.input);
      const list = transferables(output);
      parentPort.postMessage({ type: 'result', id, output, ms: Math.round(performance.now() - started) }, list);
      return;
    }
    parentPort.postMessage({ type: 'error', id, message: `unknown message: ${msg?.type}` });
  } catch (err) {
    parentPort.postMessage({ type: 'error', id, message: String(err?.message ?? err).slice(0, 500), code: err?.code ?? null });
  }
});
