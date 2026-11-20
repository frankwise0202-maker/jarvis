// The hull worker (bundled on its own to dist/assets/hull-worker.js, a classic worker): meshes
// hulls and panels (hull-mesh.js) off the main thread for hull-service.js. It keeps the hull
// meshes it made (a small LRU), because the panels that lie on a hull arrive after it.

import { hullKey, hullMesh, panelMesh } from './hull-mesh.js';

const MAX = 12;
const hulls = new Map(); // `${key}@${scale}|${level}` -> mesh

function hullFor(shape, level, scale) {
  const k = `${hullKey(shape)}@${scale}|${level}`;
  let mesh = hulls.get(k);
  if (mesh === undefined) {
    mesh = hullMesh(shape, { level, scale });
    hulls.set(k, mesh);
    while (hulls.size > MAX) hulls.delete(hulls.keys().next().value);
  } else {
    hulls.delete(k);
    hulls.set(k, mesh);
  }
  return mesh;
}

/** A copy whose buffers can be transferred (the worker keeps its own). */
function transferable(mesh) {
  if (!mesh) return { mesh: null, transfer: [] };
  const out = { ...mesh };
  const transfer = [];
  for (const k of ['positions', 'normals', 'indices', 'lines', 'lineWeights', 'terms']) {
    if (!out[k]) continue;
    out[k] = out[k].slice();
    transfer.push(out[k].buffer);
  }
  return { mesh: out, transfer };
}

self.onmessage = (e) => {
  const job = e.data || {};
  const t0 = performance.now();
  let result = null;
  try {
    if (job.kind === 'hull') result = hullFor(job.shape, job.level, job.scale);
    else if (job.kind === 'panel') {
      const hosts = (job.hosts || []).map((shape) => ({ mesh: hullFor(shape, job.level, job.scale), shape }));
      result = panelMesh(hosts, job.panel);
    }
  } catch (err) {
    result = null;
    console.warn('[jarvis] hull worker:', err && err.message);
  }
  const { mesh, transfer } = transferable(result);
  self.postMessage({ id: job.id, mesh, ms: performance.now() - t0 }, transfer);
};
