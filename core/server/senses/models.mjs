// The speech models the home base can download: ONNX community builds on huggingface.co, each at a pinned
// commit (a later change to the repository can never swap what the Core runs), with the exact files
// transformers.js fetches for the chosen dtype and their sizes in bytes. The sizes drive the download
// progress and tell a complete download from a partial one.
//
// Hearing: Whisper English-only, q8 (8-bit weights: the fastest on a CPU; base.en 1.5 s for 6.6 s of speech
// on the 4-core test container, fp32 2.0 s). Voice: Kokoro-82M, fp32 (on the same container fp32 synthesises
// 1.7x faster than q8, whose int8 convolutions are slow on CPUs; q8 stays available, it is a third of the
// download). Numbers and how they were measured: core/server/README.md, "Hearing and voice".

import os from 'node:os';
import path from 'node:path';

const WHISPER_COMMON = (sizes) => [
  ['config.json', sizes.config],
  ['generation_config.json', sizes.generation],
  ['preprocessor_config.json', 339],
  ['tokenizer.json', 2405679],
  ['tokenizer_config.json', 282662],
];

/** Hearing models, by the name the API uses. */
export const HEAR_MODELS = Object.freeze({
  'tiny.en': {
    repo: 'onnx-community/whisper-tiny.en',
    revision: '794207fec2761281fe63a23a94b7e9f53a4efbc1',
    dtype: 'q8',
    label: 'Tiny (tests)',
    files: [
      ...WHISPER_COMMON({ config: 2197, generation: 1646 }),
      ['onnx/encoder_model_quantized.onnx', 10124993],
      ['onnx/decoder_model_merged_quantized.onnx', 30718858],
    ],
  },
  'base.en': {
    repo: 'onnx-community/whisper-base.en',
    revision: '51eefc0af78b103839eda9e7e4f4186acc6517fe',
    dtype: 'q8',
    label: 'Fast',
    files: [
      ...WHISPER_COMMON({ config: 2197, generation: 1556 }),
      ['onnx/encoder_model_quantized.onnx', 23201320],
      ['onnx/decoder_model_merged_quantized.onnx', 53692803],
    ],
  },
  'small.en': {
    repo: 'onnx-community/whisper-small.en',
    revision: '482fb8ba081b6e906f92efe103622316b2a0cc69',
    dtype: 'q8',
    label: 'Accurate',
    files: [
      ...WHISPER_COMMON({ config: 2203, generation: 1956 }),
      ['onnx/encoder_model_quantized.onnx', 92326170],
      ['onnx/decoder_model_merged_quantized.onnx', 156750076],
    ],
  },
});

export const DEFAULT_HEAR_MODEL = 'base.en';

const KOKORO = {
  repo: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
  common: [
    ['config.json', 44],
    ['tokenizer.json', 3497],
    ['tokenizer_config.json', 113],
  ],
};

/** The voice model in each dtype the Core supports. */
export const SPEAK_MODELS = Object.freeze({
  fp32: { repo: KOKORO.repo, revision: KOKORO.revision, dtype: 'fp32', label: 'Kokoro 82M', files: [...KOKORO.common, ['onnx/model.onnx', 325532232]] },
  q8: { repo: KOKORO.repo, revision: KOKORO.revision, dtype: 'q8', label: 'Kokoro 82M (8-bit)', files: [...KOKORO.common, ['onnx/model_quantized.onnx', 92361116]] },
});

export const DEFAULT_SPEAK_DTYPE = 'fp32';

/** Kokoro's voices (kokoro-js 1.2.1 ships them). British George is the app's natural voice. */
export const VOICES = Object.freeze([
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily', 'bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable',
]);
export const DEFAULT_VOICE = 'bm_george';

export const totalBytes = (model) => model.files.reduce((n, [, size]) => n + size, 0);
export const sizeMb = (model) => Math.round(totalBytes(model) / 1e6);

/** Where transformers.js keeps a model's files: <cacheDir>/<repo>/<revision>/<file>. */
export const modelDir = (cacheDir, model) => path.join(cacheDir, ...model.repo.split('/'), model.revision);

/**
 * How much of a model is on disk: { bytes, complete }. A file counts only at its exact size, so a download
 * cut short (power cut, Core stopped) is never mistaken for a model.
 */
export function onDisk(fs, cacheDir, model) {
  const dir = modelDir(cacheDir, model);
  let bytes = 0;
  let complete = true;
  for (const [file, size] of model.files) {
    let st = null;
    try {
      st = fs.statSync(path.join(dir, file));
    } catch {
      st = null;
    }
    if (st?.isFile() && st.size === size) bytes += size;
    else complete = false;
  }
  return { bytes, complete };
}

/** Files of a model that are present at the wrong size (a cut-short download): removed before a retry. */
export function strayFiles(fs, cacheDir, model) {
  const dir = modelDir(cacheDir, model);
  const out = [];
  for (const [file, size] of model.files) {
    try {
      const st = fs.statSync(path.join(dir, file));
      if (!st.isFile() || st.size !== size) out.push(path.join(dir, file));
    } catch {
      // missing is fine
    }
  }
  return out;
}

/** ~/.cache/jarvis-core/models, or $XDG_CACHE_HOME/jarvis-core/models, or JARVIS_CORE_MODELS_DIR. */
export function defaultModelsDir(env = process.env) {
  if (env.JARVIS_CORE_MODELS_DIR) return path.resolve(env.JARVIS_CORE_MODELS_DIR);
  const cacheHome = env.XDG_CACHE_HOME && path.isAbsolute(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : path.join(os.homedir(), '.cache');
  return path.join(cacheHome, 'jarvis-core', 'models');
}
