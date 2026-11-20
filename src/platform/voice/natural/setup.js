// The app's natural voice: one engine (worker client) and one audio output, configured for
// this site. Nothing is downloaded or started until the owner turns the voice on in Settings
// (or, once it is on, until something is spoken).
//
//   const natural = createNaturalVoice({ getVoice: () => getSettings().naturalVoiceId });
//   natural.engine / natural.audio      for createVoiceRouter({ natural })
//   natural.support                     { ok, reason } (naturalSupport)
//   natural.plan                        { files, bytes } what the processor (WASM) engine downloads
//   natural.planFor(device)             the same for 'webgpu' (fp32, about 350 MB) or 'wasm' (q8, about 117 MB)
//   natural.choosePlan()                Promise<'webgpu'|'wasm'>: what turning it on will download
//   natural.isDownloaded()              Promise<boolean>: a model is in Cache Storage
//   natural.persistStorage()            ask the browser not to evict the download (best effort)
//
// WebGPU: when navigator.gpu gives a real adapter (not a software one), the engine runs the fp32
// model on the graphics chip (kokoro-js's recommendation for WebGPU); it falls back to the q8 model
// on WASM, then to the built-in voice, by the measured speed (engine-client.js).

import { createNaturalEngine, naturalSupport } from './engine-client.js';
import { createAudioOut } from './audio-out.js';
import { MODEL, RUNTIME, VOICES, DEFAULT_DTYPE, DEFAULT_VOICE, ENGINE_PLANS, planFor as enginePlan, sourceConfig, downloadPlan } from './catalog.js';

/**
 * Whether this browser offers a real WebGPU adapter (not a software fallback one). Asked once per
 * page; never throws. The worker checks again when it loads the model (and falls back on failure).
 */
export async function webgpuAvailable(scope = globalThis) {
  try {
    const gpu = scope.navigator && scope.navigator.gpu;
    if (!gpu || typeof gpu.requestAdapter !== 'function') return false;
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return false;
    const info = adapter.info || null;
    if (adapter.isFallbackAdapter === true || (info && info.isFallbackAdapter === true)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Where the model comes from: 'self' (GitHub Pages, recommended) or 'hf' (huggingface.co). */
export const SOURCE_MODE = 'self';

/**
 * Tests only: localStorage['jarvis.dev.voiceStandin'] = '1' accepts a stand-in model (no pinned
 * size or SHA-256), honored only on localhost / 127.0.0.1, like jarvis.dev.apiBase.
 */
function devStandin(scope) {
  try {
    const host = scope.location && scope.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return false;
    return scope.localStorage && scope.localStorage.getItem('jarvis.dev.voiceStandin') === '1';
  } catch {
    return false;
  }
}

/** Tests only: localStorage['jarvis.dev.voiceSource'] = 'hf' on localhost / 127.0.0.1. */
function devSource(scope) {
  try {
    const host = scope.location && scope.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return '';
    return scope.localStorage && scope.localStorage.getItem('jarvis.dev.voiceSource') === 'hf' ? 'hf' : '';
  } catch {
    return '';
  }
}

function buildId() {
  try {
    const m = document.querySelector('meta[name="jarvis-build"]');
    const v = m && m.getAttribute('content');
    return v && /^[0-9a-f]{8}$/.test(v) ? v : '';
  } catch {
    return '';
  }
}

export function createNaturalVoice({ scope = globalThis, base = globalThis.document ? document.baseURI : 'http://localhost/', getVoice = () => DEFAULT_VOICE, mode = devSource(scope) || SOURCE_MODE, gpu = null } = {}) {
  const support = naturalSupport(scope);
  const source = sourceConfig(mode, { base });
  // The stand-in model (tests) has no pinned size or hash and is never split.
  const standin = devStandin(scope);
  const weightsOf = (dtype) => (standin ? { path: MODEL.weights[dtype].path } : MODEL.weights[dtype]);
  const weights = weightsOf(DEFAULT_DTYPE);
  const build = buildId();
  const runtimeUrl = new URL(`voice/ort/${RUNTIME.wasm}`, base).href;
  let gpuCheck = null;
  const gpuAvailable = () => (gpuCheck = gpuCheck || Promise.resolve(gpu ? gpu() : webgpuAvailable(scope)).catch(() => false));
  const plans = ENGINE_PLANS.map((p) => ({ device: p.device, dtype: p.dtype, weights: weightsOf(p.dtype), ...(p.device === 'webgpu' ? { available: gpuAvailable } : {}) }));
  const engine = createNaturalEngine({
    workerUrl: new URL(`voice/kokoro-worker.js${build ? `?v=${build}` : ''}`, base).href,
    source,
    plans,
    voice: getVoice(),
    weights,
    runtime: { url: runtimeUrl, bytes: RUNTIME.bytes, sha256: RUNTIME.sha256, label: 'runtime' },
    voiceFiles: VOICES.map((v) => ({ id: v.id, bytes: MODEL.voiceBytes, sha256: v.sha256 })),
    modelId: MODEL.id,
    scope,
  });
  const audio = createAudioOut({ scope });
  const urlOf = (w) => `${source.remoteHost}${source.pathTemplate.replace('{model}', MODEL.id)}${w.path}`;
  const weightsUrl = urlOf(weights);
  // Start the engine with the voice the owner picked (the warm-up uses it).
  const start = engine.start;
  engine.start = () => {
    engine.setVoice(getVoice());
    return start();
  };

  /** A model is in Cache Storage (either engine's; `device` asks about one). */
  async function isDownloaded(device = null) {
    try {
      const cache = await scope.caches.open('transformers-cache');
      for (const p of plans) {
        if (device && p.device !== device) continue;
        if (await cache.match(urlOf(p.weights))) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  const planFor = (device) => downloadPlan({ dtype: enginePlan(device).dtype, voices: [getVoice()] });
  const choosePlan = () => engine.planInfo().then((p) => p.device, () => 'wasm');

  async function persistStorage() {
    try {
      const s = scope.navigator && scope.navigator.storage;
      if (s && typeof s.persist === 'function') return await s.persist();
    } catch {
      /* ignore */
    }
    return false;
  }

  return { engine, audio, support, source, plan: downloadPlan({ dtype: DEFAULT_DTYPE, voices: [getVoice()] }), planFor, choosePlan, isDownloaded, persistStorage, weightsUrl };
}
