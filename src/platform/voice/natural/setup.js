// The app's natural voice: one engine (worker client) and one audio output, configured for
// this site. Nothing is downloaded or started until the owner turns the voice on in Settings
// (or, once it is on, until something is spoken).
//
//   const natural = createNaturalVoice({ getVoice: () => getSettings().naturalVoiceId });
//   natural.engine / natural.audio      for createVoiceRouter({ natural })
//   natural.support                     { ok, reason } (naturalSupport)
//   natural.plan                        { files, bytes } what the first use downloads
//   natural.isDownloaded()              Promise<boolean>: the model is in Cache Storage
//   natural.persistStorage()            ask the browser not to evict the download (best effort)

import { createNaturalEngine, naturalSupport } from './engine-client.js';
import { createAudioOut } from './audio-out.js';
import { MODEL, RUNTIME, VOICES, DEFAULT_DTYPE, DEFAULT_VOICE, sourceConfig, downloadPlan } from './catalog.js';

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

export function createNaturalVoice({ scope = globalThis, base = globalThis.document ? document.baseURI : 'http://localhost/', getVoice = () => DEFAULT_VOICE, mode = devSource(scope) || SOURCE_MODE } = {}) {
  const support = naturalSupport(scope);
  const source = sourceConfig(mode, { base });
  const weights = devStandin(scope) ? { path: MODEL.weights[DEFAULT_DTYPE].path } : MODEL.weights[DEFAULT_DTYPE];
  const build = buildId();
  const runtimeUrl = new URL(`voice/ort/${RUNTIME.wasm}`, base).href;
  const engine = createNaturalEngine({
    workerUrl: new URL(`voice/kokoro-worker.js${build ? `?v=${build}` : ''}`, base).href,
    source,
    dtype: DEFAULT_DTYPE,
    device: 'wasm',
    voice: getVoice(),
    weights,
    runtime: { url: runtimeUrl, bytes: RUNTIME.bytes, label: 'runtime' },
    voiceFiles: VOICES.map((v) => ({ id: v.id, bytes: MODEL.voiceBytes, sha256: v.sha256 })),
    modelId: MODEL.id,
    scope,
  });
  const audio = createAudioOut({ scope });
  const weightsUrl = `${source.remoteHost}${source.pathTemplate.replace('{model}', MODEL.id)}${weights.path}`;
  // Start the engine with the voice the owner picked (the warm-up uses it).
  const start = engine.start;
  engine.start = () => {
    engine.setVoice(getVoice());
    return start();
  };

  async function isDownloaded() {
    try {
      const cache = await scope.caches.open('transformers-cache');
      return !!(await cache.match(weightsUrl));
    } catch {
      return false;
    }
  }

  async function persistStorage() {
    try {
      const s = scope.navigator && scope.navigator.storage;
      if (s && typeof s.persist === 'function') return await s.persist();
    } catch {
      /* ignore */
    }
    return false;
  }

  return { engine, audio, support, source, plan: downloadPlan({ dtype: DEFAULT_DTYPE, voices: [getVoice()] }), isDownloaded, persistStorage, weightsUrl };
}
