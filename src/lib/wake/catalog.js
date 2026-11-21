// Wake Jarvis (Standby): what the "Hey Jarvis" wake word downloads, pinned. Pure data and helpers
// (no DOM), shared by the page, the wake-word worker, the build and the tests.
//
//   WAKE_MODELS      the three openWakeWord v0.5.1 ONNX models (self-hosted under models/openwakeword/),
//                    each with its size and SHA-256 (the worker checks both before using a file)
//   WAKE_RUNTIME     the ONNX Runtime WebAssembly binary the worker runs them with: onnxruntime-web
//                    1.22.0-dev (the package the natural voice already uses), its plain WASM build
//   WAKE_CACHE       the Cache Storage cache the worker fills (not 'jarvis-…': app updates keep it)
//   wakeWordDownloadBytes() / formatMegabytes()   the size Settings shows before anything downloads
//   WAKE_WORD        the detector's tuning (threshold, patience, refractory time)
//
// Models: openWakeWord by David Scripka (https://github.com/dscripka/openWakeWord), release v0.5.1
// assets, unmodified. The pre-trained models are licensed CC BY-NC-SA 4.0 (personal, non-commercial
// use): see public/models/openwakeword/LICENSE.md. The code that runs them here is Jarvis's own.

export const WAKE_MODEL_BASE = 'models/openwakeword/';

export const WAKE_MODELS = Object.freeze({
  melspectrogram: Object.freeze({ file: 'melspectrogram.onnx', bytes: 1087958, sha256: 'ba2b0e0f8b7b875369a2c89cb13360ff53bac436f2895cced9f479fa65eb176f' }),
  embedding: Object.freeze({ file: 'embedding_model.onnx', bytes: 1326578, sha256: '70d164290c1d095d1d4ee149bc5e00543250a7316b59f31d056cff7bd3075c1f' }),
  heyJarvis: Object.freeze({ file: 'hey_jarvis_v0.1.onnx', bytes: 1271370, sha256: '94a13cfe60075b132f6a472e7e462e8123ee70861bc3fb58434a73712ee0d2cb' }),
});

export const WAKE_MODEL_SOURCE = Object.freeze({
  project: 'openWakeWord',
  author: 'David Scripka',
  release: 'v0.5.1',
  url: 'https://github.com/dscripka/openWakeWord/releases/tag/v0.5.1',
  license: 'CC BY-NC-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
});

/**
 * The ONNX Runtime binary the wake-word worker loads (copied by the build from node_modules to
 * dist/wake/ort/). The plain WebAssembly build of onnxruntime-web 1.22.0-dev.20250409-89f8206ba4: the
 * same package and version the natural voice bundles, without its WebGPU kernels (half the size).
 * The unit test wake.oww pins both numbers to the file in node_modules: update them with
 * onnxruntime-web.
 */
export const WAKE_RUNTIME = Object.freeze({
  file: 'ort-wasm-simd-threaded.wasm',
  path: 'wake/ort/ort-wasm-simd-threaded.wasm',
  bytes: 11133407,
  sha256: 'f061472c6e77d6d50d079aacdc0ff9b63fee287ddd2cbf46cf62438d3891de2b',
  // Its JavaScript glue: the WASM build of onnxruntime-web imports it at start (the natural voice's
  // build has it inside; this one does not), from the same origin as the worker.
  glue: Object.freeze({ file: 'ort-wasm-simd-threaded.mjs', path: 'wake/ort/ort-wasm-simd-threaded.mjs', bytes: 20856 }),
});

/** The worker script (dist/wake/), and the AudioWorklet that listens (dist/assets/, precached). */
export const WAKE_WORKER_PATH = 'wake/wake-word-worker.js';
export const WAKE_WORKLET_PATH = 'assets/wake-worklet.js';

/** Cache Storage for the models and the runtime: outside 'jarvis-…', so app updates keep it. */
export const WAKE_CACHE = 'wake-word-v1';

/**
 * openWakeWord's own advice: a 0.5 threshold. Two 80 ms frames in a row above it (patience) cut
 * false activations; a real "Hey Jarvis" stays above it for 2–8 frames (measured on 39 synthetic
 * voices, see test/unit/wake.oww.test.mjs). After a detection the next 2 s are ignored.
 */
export const WAKE_WORD = Object.freeze({ threshold: 0.5, patience: 2, refractoryMs: 2000 });

/** Everything the wake word downloads the first time (bytes). */
export function wakeWordDownloadBytes() {
  return WAKE_RUNTIME.bytes + WAKE_RUNTIME.glue.bytes + Object.values(WAKE_MODELS).reduce((n, m) => n + m.bytes, 0);
}

/** 15_000_000 -> "15 MB" (decimal megabytes, like the natural voice's card). */
export function formatMegabytes(bytes) {
  const mb = Number(bytes) / 1e6;
  if (!Number.isFinite(mb) || mb <= 0) return '0 MB';
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`;
}
