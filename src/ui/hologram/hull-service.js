// Hull and panel meshes for the renderer (hull-mesh.js does the work). They are computed off the
// main thread in a Web Worker (hull-worker.js, built to assets/hull-worker.js) when one can start,
// otherwise on the main thread one job per task; in Node (tests) at once. Each hull or panel gets
// a coarse mesh first (fast: shown while the hologram builds) and then the fine one; results are
// cached by content (an LRU shared by every hologram on the page), so reopening a hologram or
// re-showing a part never meshes it again.
//
//   hullGeometry(shape, scale, mode)    -> { key, mesh | null, level: 'coarse' | 'fine' | null, done }
//   panelGeometry(panel, hosts, scale, mode) -> same; hosts: the normalized hull shapes the panel lies on
//                                       mode null: coarse, then fine; 'coarse': only the coarse mesh (a
//                                       hologram that is already heavy; done once it is there); 'fine':
//                                       only the fine one (re-meshing while an older mesh still shows)
//   onHullGeometry(fn)                  -> unsubscribe; fn(key, level) when a better mesh is ready
//   hullJobsPending()                   -> jobs queued or running
//   setHullWorkerUrl(url | null)        -> where the worker script is (null: never start one; default
//                                          assets/hull-worker.js?v=<build> next to the page)

import { hullKey, hullMesh, panelMesh } from './hull-mesh.js';

const MAX_ENTRIES = 20;
const MAX_BYTES = 24 * 1024 * 1024;
const LEVELS = ['coarse', 'fine'];
const cache = new Map(); // key -> { coarse, fine, done, bytes } (Map order = recency)
const queued = new Set(); // `${key}|${level}` jobs queued or running
const listeners = new Set();
const queue = []; // { key, level, kind, shape?, panel?, hosts?, scale }
let running = null; // the job being meshed on the main thread (when there is no worker)
let worker = null;
let workerUrl;
let workerBroken = false;
let jobId = 0;
let mainTimer = 0;

const canWorker = () => typeof Worker === 'function' && workerUrl !== null && !workerBroken;
const isNode = () => typeof window === 'undefined' && typeof process !== 'undefined' && !!(process.versions && process.versions.node);

let levelCap = null;
/** Debug and screenshots only: 'coarse' stops after the coarse meshes everywhere (null: normal). */
export function setHullLevelCap(level) {
  levelCap = level === 'coarse' ? 'coarse' : null;
}

/** Where the worker script is; null keeps every job on the main thread. */
export function setHullWorkerUrl(url) {
  workerUrl = url === null ? null : String(url);
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

export function onHullGeometry(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function hullJobsPending() {
  return queued.size;
}

// compute time per kind and level (worker time when it runs there), for measurements
const stats = { jobs: 0, ms: 0, byKind: {} };
function record(job, ms) {
  if (!(ms >= 0)) return;
  stats.jobs++;
  stats.ms += ms;
  const k = `${job.kind}-${job.level}`;
  const b = stats.byKind[k] || (stats.byKind[k] = { jobs: 0, ms: 0, max: 0 });
  b.jobs++;
  b.ms += ms;
  b.max = Math.max(b.max, ms);
}
export function hullStats() {
  return JSON.parse(JSON.stringify({ ...stats, cached: cache.size, worker: !!worker && !workerBroken }));
}

/** Model scales are rounded to half octaves, so a hologram that grows a little keeps its meshes. */
export function quantizeScale(scale) {
  if (!(scale > 0)) return 0;
  return Math.round(Math.pow(2, Math.round(Math.log2(scale) * 2) / 2));
}

const placeKey = (s) => JSON.stringify([s.at || [0, 0, 0], s.rot || null, s.repeat || null]);

export function hullGeometry(shape, scale, mode = null) {
  const q = quantizeScale(scale);
  const key = `h:${hullKey(shape)}@${q}`;
  return request(key, { kind: 'hull', shape, scale: q }, mode);
}

export function panelGeometry(panel, hosts, scale, mode = null) {
  const q = quantizeScale(scale);
  const list = Array.isArray(hosts) ? hosts : [];
  const key = `p:${JSON.stringify([panel.face, panel.outline, panel.mirror ? 1 : 0, panel.wrap ? 1 : 0, panel.lift ?? null])}|${list.map((h) => hullKey(h) + placeKey(h)).join('|')}@${q}`;
  if (!list.length) return { key, mesh: null, level: null, done: true };
  return request(key, { kind: 'panel', panel, hosts: list, scale: q }, mode);
}

function request(key, job, mode) {
  let entry = cache.get(key);
  if (entry) {
    cache.delete(key); // most recently used last
    cache.set(key, entry);
  }
  const coarseOnly = mode === 'coarse' || levelCap === 'coarse';
  const fineOnly = mode === 'fine' && !coarseOnly;
  if (isNode()) {
    // tests and tools: the wanted mesh at once (the fine one unless capped)
    const level = mode === 'coarse' ? 'coarse' : 'fine';
    if (entry && entry.done) return { key, mesh: entry.fine, level: 'fine', done: true };
    if (!entry || entry[level] === undefined) entry = store(key, level, compute({ ...job, level }));
    return { key, mesh: entry[level], level, done: true };
  }
  if (entry && entry.done) return { key, mesh: entry.fine, level: 'fine', done: true };
  // a panel whose hosts are already fine needs no coarse version (and costs the same at fine)
  const skipCoarse = job.kind === 'panel' && job.hosts.every((h) => {
    const he = cache.get(`h:${hullKey(h)}@${job.scale}`);
    return he && he.done;
  });
  for (const level of LEVELS) {
    if (level === 'coarse' && (skipCoarse || fineOnly)) continue;
    if (level === 'fine' && coarseOnly && !skipCoarse) continue;
    if ((entry && entry[level] !== undefined) || queued.has(`${key}|${level}`)) continue;
    queued.add(`${key}|${level}`);
    queue.push({ ...job, key, level });
  }
  schedulePump();
  if (entry && entry.coarse) return { key, mesh: entry.coarse, level: 'coarse', done: coarseOnly && !skipCoarse };
  return { key, mesh: null, level: null, done: false };
}

const rankJob = (j) => (j.level === 'coarse' ? 0 : 2) + (j.kind === 'panel' ? 1 : 0);

function store(key, level, mesh) {
  let entry = cache.get(key);
  if (!entry) {
    entry = { coarse: undefined, fine: undefined, done: false, bytes: 0 };
    cache.set(key, entry);
  }
  entry[level] = mesh || null;
  if (level === 'fine') {
    entry.done = true;
    entry.coarse = undefined; // the fine one replaces it
  }
  entry.bytes = sizeOf(entry.coarse) + sizeOf(entry.fine);
  // LRU: drop the least recently used entries beyond the limits
  let total = 0;
  for (const e of cache.values()) total += e.bytes;
  for (const [k, e] of cache) {
    if (cache.size <= MAX_ENTRIES && total <= MAX_BYTES) break;
    if (k === key) continue;
    total -= e.bytes;
    cache.delete(k);
  }
  return entry;
}

function sizeOf(m) {
  if (!m) return 0;
  let n = 0;
  for (const k of ['positions', 'normals', 'indices', 'lines', 'lineWeights', 'terms']) if (m[k]) n += m[k].byteLength;
  return n;
}

function compute(job) {
  if (job.kind === 'hull') return hullMesh(job.shape, { level: job.level, scale: job.scale });
  // a panel: its hosts' meshes at the same level (from the cache, or meshed now)
  const hosts = job.hosts.map((shape) => {
    const hk = `h:${hullKey(shape)}@${job.scale}`;
    let entry = cache.get(hk);
    let mesh = entry && (job.level === 'fine' ? entry.fine : entry.coarse ?? entry.fine);
    if (mesh === undefined || (job.level === 'fine' && !(entry && entry.done))) {
      mesh = hullMesh(shape, { level: job.level, scale: job.scale });
      entry = store(hk, job.level, mesh);
    }
    return { mesh, shape };
  });
  return panelMesh(hosts, job.panel);
}

function finish(job, mesh) {
  queued.delete(`${job.key}|${job.level}`);
  const entry = cache.get(job.key);
  // a fine mesh that landed first makes a late coarse one pointless
  if (!(job.level === 'coarse' && entry && entry.done)) store(job.key, job.level, mesh);
  for (const fn of Array.from(listeners)) {
    try {
      fn(job.key, job.level);
    } catch (err) {
      console.warn('[jarvis] hull listener failed:', err && err.message);
    }
  }
}

const inflight = new Map(); // worker job id -> job (all queued jobs are posted at once, in order)
let pumpScheduled = false;

/** After the current batch of requests (one spec update): coarse jobs before fine ones, hulls before panels. */
function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  queueMicrotask(() => {
    pumpScheduled = false;
    queue.sort((a, b) => rankJob(a) - rankJob(b));
    pump();
  });
}

function pump() {
  if (canWorker() && startWorker()) {
    // the worker works through everything queued, in order: it never waits on the main thread
    while (queue.length) {
      const job = queue.shift();
      if (alreadyDone(job)) continue;
      job.id = ++jobId;
      const msg = job.kind === 'hull' ? { id: job.id, kind: 'hull', shape: job.shape, level: job.level, scale: job.scale } : { id: job.id, kind: 'panel', panel: job.panel, hosts: job.hosts, level: job.level, scale: job.scale };
      try {
        worker.postMessage(msg);
        inflight.set(job.id, job);
      } catch {
        workerBroken = true;
        queue.unshift(job);
        break;
      }
    }
    if (!workerBroken) return;
  }
  // main thread: one job per task, so frames keep coming between them
  if (running || !queue.length) return;
  const job = queue.shift();
  if (alreadyDone(job)) {
    pump();
    return;
  }
  running = job;
  clearTimeout(mainTimer);
  mainTimer = setTimeout(() => {
    let mesh = null;
    const t0 = performance.now();
    try {
      mesh = compute(job);
    } catch (err) {
      console.warn('[jarvis] hull mesh failed:', err && err.message);
    }
    record(job, performance.now() - t0);
    running = null;
    finish(job, mesh);
    pump();
  }, 0);
}

/** A job another hologram already got done (its mesh is cached): drop it. */
function alreadyDone(job) {
  const entry = cache.get(job.key);
  if (entry && (entry.done || entry[job.level] !== undefined)) {
    queued.delete(`${job.key}|${job.level}`);
    return true;
  }
  return false;
}

function startWorker() {
  if (worker) return true;
  let url = workerUrl;
  if (url === undefined) {
    try {
      // next to app.js, versioned like it (the service worker serves this build's copy, offline too)
      const meta = document.querySelector('meta[name="jarvis-build"]');
      const build = meta && /^[0-9a-f]{8}$/.test(meta.content || '') ? meta.content : '';
      url = new URL(`assets/hull-worker.js${build ? `?v=${build}` : ''}`, document.baseURI).href;
    } catch {
      return false;
    }
  }
  try {
    worker = new Worker(url, { name: 'jarvis-hull' });
  } catch {
    workerBroken = true;
    return false;
  }
  worker.onmessage = (e) => {
    const data = e.data || {};
    const job = inflight.get(data.id);
    if (!job) return;
    inflight.delete(data.id);
    record(job, data.ms);
    finish(job, data.mesh || null);
  };
  worker.onerror = (e) => {
    // the script failed to load or threw: what it had not answered moves to the main thread
    if (e && e.preventDefault) e.preventDefault();
    workerBroken = true;
    try {
      worker.terminate();
    } catch {
      /* gone */
    }
    worker = null;
    const pending = Array.from(inflight.values());
    inflight.clear();
    queue.unshift(...pending);
    pump();
  };
  return true;
}
