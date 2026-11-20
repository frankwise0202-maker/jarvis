// Natural voice (Kokoro-82M, Apache-2.0): what gets downloaded, from where, and the voices.
// Pure data and helpers (no DOM), shared by the page, the worker, the build and the tests.
//
//   MODEL                 the pinned model repo, revision and files per dtype (bytes + SHA-256)
//   RUNTIME               the ONNX Runtime WebAssembly file the worker needs (self-hosted)
//   VOICES                the voices offered in Settings, British first
//   DEFAULT_VOICE         'bm_george'
//   voiceById(id), isVoiceId(id)
//   downloadPlan({ dtype, voices })   -> { files: [{ path, bytes, sha256?, kind }], bytes }
//   ENGINE_PLANS / planFor(device)    the two ways to run it: 'webgpu' (fp32, the graphics chip)
//                                     and 'wasm' (q8, the processor)
//   PART_BYTES / partsOf(bytes) / partRanges(bytes)   self-hosted files are split into parts
//                                     under GitHub's limits (100 MiB per file; it warns above 50 MiB)
//   formatMegabytes(bytes)            -> "115 MB"
//   sourceConfig(mode, { origin, base })  where the files come from: 'self' (GitHub Pages, the
//                         recommendation) or 'hf' (huggingface.co, pinned revision)
//
// Sizes and hashes are the Hugging Face listing of revision 1939ad2a… (checked 2026-11-19 with
// the HF API: /api/models/onnx-community/Kokoro-82M-v1.0-ONNX/tree/<rev>); voice hashes match the
// copies in the kokoro-js npm package (bm_george: c4b235a4…, same as HF's x-linked-etag).

export const MODEL = Object.freeze({
  id: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
  license: 'Apache-2.0',
  sampleRate: 24000,
  // Small files: their git blob id (sha1 of "blob <size>\0" + content), as the HF API lists it.
  common: Object.freeze([
    Object.freeze({ path: 'config.json', bytes: 44, gitSha1: '790faf216e7e3f490e71e8bc80df79ed8941101c' }),
    Object.freeze({ path: 'tokenizer.json', bytes: 3497, gitSha1: '4280f55fc1c32211bc9bb4d55545759a00054ecd' }),
    Object.freeze({ path: 'tokenizer_config.json', bytes: 113, gitSha1: '5c81e9a3a06db9139900d6ee5b60e8bb701ccb0b' }),
  ]),
  // transformers.js dtype -> ONNX file. q8 is the default (WASM); fp32 is what kokoro-js
  // recommends for WebGPU (the q8 graph's integer MatMul/Conv ops are not WebGPU kernels).
  // `parts`: how many files it is split into when self-hosted (partsOf(bytes)).
  weights: Object.freeze({
    q8: Object.freeze({ path: 'onnx/model_quantized.onnx', bytes: 92361116, sha256: 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478', parts: 2 }),
    q8f16: Object.freeze({ path: 'onnx/model_q8f16.onnx', bytes: 86033585, sha256: '04c658aec1b6008857c2ad10f8c589d4180d0ec427e7e6118ceb487e215c3cd0', parts: 2 }),
    fp16: Object.freeze({ path: 'onnx/model_fp16.onnx', bytes: 163234740, sha256: 'ba4527a874b42b21e35f468c10d326fdff3c7fc8cac1f85e9eb6c0dfc35c334a', parts: 4 }),
    fp32: Object.freeze({ path: 'onnx/model.onnx', bytes: 325532232, sha256: '8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb', parts: 7 }),
  }),
  voiceBytes: 522240, // 510 × 256 float32 style vectors per voice
});

/** The ONNX Runtime build the worker loads (from node_modules, copied to dist/voice/ort/). */
export const RUNTIME = Object.freeze({
  wasm: 'ort-wasm-simd-threaded.jsep.wasm', // WASM + WebGPU (JSEP) build used by transformers.js 3.8
  bytes: 21596019,
  gzipBytes: 5016261,
  worker: 'kokoro-worker.js', // dist/voice/: kokoro-js + transformers.js + ONNX Runtime + eSpeak NG (as JS)
  workerBytes: 2_223_513, // minified build of 2026-11-19 (900 kB gzipped)
});

// Grades are the model card's (hexgrad/Kokoro-82M VOICES.md, also in kokoro-js): A best, F worst.
export const VOICES = Object.freeze(
  [
    { id: 'bm_george', name: 'George', accent: 'British', gender: 'male', grade: 'C', sha256: 'c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc' },
    { id: 'bm_fable', name: 'Fable', accent: 'British', gender: 'male', grade: 'C', sha256: 'f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1' },
    { id: 'bm_lewis', name: 'Lewis', accent: 'British', gender: 'male', grade: 'D+', sha256: 'b8f671cef828c30e66fdf0b0756a76bba58f6bb3398cbbf27058642acbcedb97' },
    { id: 'bm_daniel', name: 'Daniel', accent: 'British', gender: 'male', grade: 'D', sha256: '6b3194bbceffb746733cbc22c8f593dd44e401a71d53895a2dca891bc595a1e8' },
    { id: 'bf_emma', name: 'Emma', accent: 'British', gender: 'female', grade: 'B-', sha256: '669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73' },
    { id: 'bf_isabella', name: 'Isabella', accent: 'British', gender: 'female', grade: 'C', sha256: '3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f' },
    { id: 'bf_alice', name: 'Alice', accent: 'British', gender: 'female', grade: 'D', sha256: '08afa6ba24da61ea5e8efa139e5aadc938d83f0a6da5a900adaf763ac1da5573' },
    { id: 'bf_lily', name: 'Lily', accent: 'British', gender: 'female', grade: 'D', sha256: '5e0ee32ebe64a467124976b14e69590746f1c4ce41a12b587a50c862edfea335' },
    { id: 'am_michael', name: 'Michael', accent: 'American', gender: 'male', grade: 'C+', sha256: '1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1' },
    { id: 'am_fenrir', name: 'Fenrir', accent: 'American', gender: 'male', grade: 'C+', sha256: 'c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43' },
    { id: 'am_puck', name: 'Puck', accent: 'American', gender: 'male', grade: 'C+', sha256: 'fcf73c989033e9233e0b98713eca600c8c74dcc1614b37009d5450ff4a2274a0' },
    { id: 'af_heart', name: 'Heart', accent: 'American', gender: 'female', grade: 'A', sha256: 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b' },
    { id: 'af_bella', name: 'Bella', accent: 'American', gender: 'female', grade: 'A-', sha256: 'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b' },
  ].map((v) => Object.freeze(v)),
);

export const DEFAULT_VOICE = 'bm_george';
export const DEFAULT_DTYPE = 'q8';

/**
 * Self-hosted files bigger than this are split into numbered parts (<file>.part0, .part1, …):
 * GitHub refuses files over 100 MiB and warns above 50 MiB. 48 MiB keeps every part under both.
 * The worker joins the parts and checks the whole file's size and SHA-256 (kokoro-engine.js).
 */
export const PART_BYTES = 48 * 1024 * 1024;

/** How many parts a self-hosted file of `bytes` is split into (1 = not split). */
export function partsOf(bytes) {
  const n = Number(bytes) || 0;
  return n > PART_BYTES ? Math.ceil(n / PART_BYTES) : 1;
}

/** The byte ranges [start, end) of those parts, in order (the deploy script cuts the file with these). */
export function partRanges(bytes, partBytes = PART_BYTES) {
  const n = Math.max(0, Number(bytes) || 0);
  const size = Math.max(1, Number(partBytes) || PART_BYTES);
  const out = [];
  for (let start = 0; start < n; start += size) out.push([start, Math.min(n, start + size)]);
  return out.length ? out : [[0, 0]];
}

/**
 * The two ways to run the voice, best first. 'webgpu' runs the fp32 model on the graphics chip
 * (kokoro-js recommends fp32 there; the owner's Mac in Chrome has WebGPU, recent iPhones likely
 * do too); 'wasm' runs the q8 model on the processor. Jarvis tries WebGPU when the browser offers
 * a real adapter, falls back to WASM when it fails or is too slow, and to the built-in voice when
 * WASM is too slow as well (engine-client.js).
 */
export const ENGINE_PLANS = Object.freeze([
  Object.freeze({ device: 'webgpu', dtype: 'fp32' }),
  Object.freeze({ device: 'wasm', dtype: 'q8' }),
]);

export function planFor(device) {
  return ENGINE_PLANS.find((p) => p.device === device) || ENGINE_PLANS[1];
}

export function voiceById(id) {
  return VOICES.find((v) => v.id === id) || null;
}

export function isVoiceId(id) {
  return typeof id === 'string' && VOICES.some((v) => v.id === id);
}

/** The label the picker shows, e.g. "George — British male (grade C)". */
export function voiceLabel(v) {
  return `${v.name} — ${v.accent} ${v.gender} (grade ${v.grade})`;
}

/**
 * Everything the first use downloads for one dtype and the given voices (each voice file is
 * fetched only when that voice is first used): model files, voices and the runtime.
 */
export function downloadPlan({ dtype = DEFAULT_DTYPE, voices = [DEFAULT_VOICE], runtime = true } = {}) {
  const weights = { ...(MODEL.weights[dtype] || MODEL.weights[DEFAULT_DTYPE]) };
  const files = [
    ...MODEL.common.map((f) => ({ ...f, kind: 'model' })),
    { ...weights, kind: 'model' },
    ...voices.filter(isVoiceId).map((id) => ({ path: `voices/${id}.bin`, bytes: MODEL.voiceBytes, sha256: voiceById(id).sha256, kind: 'voice' })),
  ];
  if (runtime) files.push({ path: RUNTIME.wasm, bytes: RUNTIME.bytes, kind: 'runtime' }, { path: RUNTIME.worker, bytes: RUNTIME.workerBytes, kind: 'runtime' });
  const bytes = files.reduce((n, f) => n + f.bytes, 0);
  return { files, bytes };
}

/** "92 MB" style (decimal megabytes, as download sizes are usually quoted). */
export function formatMegabytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} kB`;
  return `${Math.round(n / 1e6)} MB`;
}

/**
 * Where the worker fetches files from.
 *   'self' (recommended): the GitHub Pages site serves models/<repo>/… (put there at deploy time
 *          by scripts/fetch-voice-model.mjs, SHA-256 checked) — same origin, no CSP change.
 *   'hf':  huggingface.co at the pinned revision; large files redirect to the HF CDN (seen
 *          2026-11-19: us.aws.cdn.hf.co; earlier cas-bridge.xethub.hf.co and cdn-lfs*.hf.co).
 * `base` is the app's base URL (e.g. https://owner.github.io/jarvis/).
 * Returns { mode, remoteHost, pathTemplate, voiceBase, wasmBase, allowOrigins, allowHostSuffixes }.
 */
export function sourceConfig(mode, { base }) {
  const app = new URL('./', base).href;
  const wasmBase = new URL('voice/ort/', app).href;
  if (mode === 'hf') {
    return {
      mode: 'hf',
      remoteHost: 'https://huggingface.co/',
      pathTemplate: `{model}/resolve/${MODEL.revision}/`,
      voiceBase: `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/voices/`,
      wasmBase,
      allowOrigins: [new URL(app).origin, 'https://huggingface.co'],
      allowHostSuffixes: ['.hf.co'], // redirect targets of large files
    };
  }
  return {
    mode: 'self',
    remoteHost: new URL('models/', app).href,
    pathTemplate: '{model}/',
    voiceBase: new URL(`models/${MODEL.id}/voices/`, app).href,
    wasmBase,
    allowOrigins: [new URL(app).origin],
    allowHostSuffixes: [],
  };
}
