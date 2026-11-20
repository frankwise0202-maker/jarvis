// The natural voice's stand-in model for the E2E tests: a tiny ONNX graph with Kokoro-82M's
// interface (input_ids int64 [1, seq], style float32 [1, 256], speed float32 [1] -> waveform),
// which outputs a 220 Hz tone, 50 ms per input token. It runs the REAL pipeline (the worker,
// transformers.js, ONNX Runtime WASM, the eSpeak phonemizer, the tokenizer, Web Audio) without the
// 92 MB model. It is not a voice. (From the natural-voice prototype's make-standin.mjs.)
//
//   writeVoiceStandin(dir, { brokenFp32 })   writes <dir>/onnx-community/Kokoro-82M-v1.0-ONNX/:
//     config.json, tokenizer.json, tokenizer_config.json, onnx/model_quantized.onnx (q8, WASM),
//     onnx/model.onnx (fp32, the WebGPU engine's file: the same graph, or with brokenFp32 a file
//     ONNX Runtime refuses, so the WebGPU attempt fails on any machine and the WASM engine takes
//     over), and voices/<id>.bin copied from the kokoro-js package.
// The app accepts it only with localStorage['jarvis.dev.voiceStandin'] = '1' on localhost.

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- minimal protobuf writer ----
function varint(n) {
  let v = BigInt(n);
  const out = [];
  if (v < 0n) v += 1n << 64n;
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return out;
}
const key = (field, wire) => varint((field << 3) | wire);
const enc = new TextEncoder();
function msg(...fields) {
  return fields.flat();
}
const fInt = (field, n) => [...key(field, 0), ...varint(n)];
const fBytes = (field, bytes) => [...key(field, 2), ...varint(bytes.length), ...bytes];
const fStr = (field, s) => fBytes(field, [...enc.encode(s)]);
const fMsg = (field, m) => fBytes(field, m);
const fFloat = (field, x) => {
  const b = new Uint8Array(new Float32Array([x]).buffer);
  return [...key(field, 5), ...b];
};

// TensorProto: dims 1, data_type 2, float_data 4 (packed), int64_data 7 (packed), name 8
const FLOAT = 1;
const INT64 = 7;
function tensorScalar(name, type, value) {
  const data = type === FLOAT ? (() => { const b = new Uint8Array(new Float32Array([value]).buffer); return fBytes(4, [...b]); })() : fBytes(7, varint(value));
  return msg(fInt(2, type), data, fStr(8, name));
}
// AttributeProto: name 1, f 2, i 3, t 5, type 20 (FLOAT=1, INT=2, TENSOR=4)
const attrInt = (name, i) => msg(fStr(1, name), fInt(3, i), fInt(20, 2));
const attrTensor = (name, t) => msg(fStr(1, name), fMsg(5, t), fInt(20, 4));
// NodeProto: input 1, output 2, name 3, op_type 4, attribute 5
function node(op, inputs, outputs, attrs = []) {
  return msg(...inputs.map((i) => fStr(1, i)), ...outputs.map((o) => fStr(2, o)), fStr(3, `${op}_${outputs[0]}`), fStr(4, op), ...attrs.map((a) => fMsg(5, a)));
}
const constant = (out, type, value) => node('Constant', [], [out], [attrTensor('value', tensorScalar(out, type, value))]);
// ValueInfoProto: name 1, type 2 { tensor_type 1 { elem_type 1, shape 2 { dim 1 { dim_value 1 | dim_param 2 } } } }
function valueInfo(name, type, dims) {
  const dimMsgs = dims.map((d) => fMsg(1, typeof d === 'number' ? fInt(1, d) : fStr(2, d)));
  return msg(fStr(1, name), fMsg(2, fMsg(1, msg(fInt(1, type), fMsg(2, msg(...dimMsgs))))));
}

const nodes = [
  node('Shape', ['input_ids'], ['shape']),
  constant('one_i', INT64, 1),
  node('Gather', ['shape', 'one_i'], ['seq_len'], [attrInt('axis', 0)]),
  constant('per_token', INT64, 1200),
  node('Mul', ['seq_len', 'per_token'], ['n_samples']),
  constant('zero_i', INT64, 0),
  node('Range', ['zero_i', 'n_samples', 'one_i'], ['idx']),
  node('Cast', ['idx'], ['idx_f'], [attrInt('to', FLOAT)]),
  constant('omega', FLOAT, (2 * Math.PI * 220) / 24000),
  node('Mul', ['idx_f', 'omega'], ['phase']),
  node('Sin', ['phase'], ['tone']),
  constant('gain', FLOAT, 0.2),
  node('Mul', ['speed', 'gain'], ['amp']),
  node('Mul', ['tone', 'amp'], ['wave0']),
  node('ReduceMean', ['style'], ['style_mean'], [attrInt('keepdims', 0)]),
  constant('nil', FLOAT, 0),
  node('Mul', ['style_mean', 'nil'], ['style_zero']),
  node('Add', ['wave0', 'style_zero'], ['waveform']),
];
const graph = msg(
  ...nodes.map((n) => fMsg(1, n)),
  fStr(2, 'kokoro_standin'),
  fMsg(11, valueInfo('input_ids', INT64, [1, 'sequence_length'])),
  fMsg(11, valueInfo('style', FLOAT, [1, 256])),
  fMsg(11, valueInfo('speed', FLOAT, [1])),
  fMsg(12, valueInfo('waveform', FLOAT, ['num_samples'])),
);
const model = msg(fInt(1, 8), fStr(2, 'jarvis-standin'), fMsg(7, graph), fMsg(8, msg(fStr(1, ''), fInt(2, 17))));


export function writeVoiceStandin(out, { brokenFp32 = false, voices = ['bm_george', 'bm_fable', 'bm_lewis'] } = {}) {
  const dir = path.join(out, 'onnx-community', 'Kokoro-82M-v1.0-ONNX');
  mkdirSync(path.join(dir, 'onnx'), { recursive: true });
  writeFileSync(path.join(dir, 'onnx', 'model_quantized.onnx'), Buffer.from(model));
  writeFileSync(path.join(dir, 'onnx', 'model.onnx'), brokenFp32 ? Buffer.from('not an onnx model') : Buffer.from(model));
  writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ model_type: 'style_text_to_speech_2' }));
  // A character-level tokenizer over the IPA symbols eSpeak produces (ids are not Kokoro's).
  const symbols = [...new Set([...'$;:,.!?¡¿—…"«»“” ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', ...'ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘\'̩ᵻ'])];
  const vocab = Object.fromEntries(symbols.map((c, i) => [c, i]));
  writeFileSync(
    path.join(dir, 'tokenizer.json'),
    JSON.stringify({
      version: '1.0',
      truncation: null,
      padding: null,
      added_tokens: [{ id: 0, content: '$', single_word: false, lstrip: false, rstrip: false, normalized: false, special: true }],
      normalizer: null,
      pre_tokenizer: { type: 'Split', pattern: { Regex: '' }, behavior: 'Isolated', invert: false },
      post_processor: {
        type: 'TemplateProcessing',
        single: [{ SpecialToken: { id: '$', type_id: 0 } }, { Sequence: { id: 'A', type_id: 0 } }, { SpecialToken: { id: '$', type_id: 0 } }],
        pair: [{ SpecialToken: { id: '$', type_id: 0 } }, { Sequence: { id: 'A', type_id: 0 } }, { Sequence: { id: 'B', type_id: 1 } }, { SpecialToken: { id: '$', type_id: 0 } }],
        special_tokens: { $: { id: '$', ids: [0], tokens: ['$'] } },
      },
      decoder: null,
      model: { type: 'WordLevel', vocab, unk_token: '$' },
    }),
  );
  writeFileSync(path.join(dir, 'tokenizer_config.json'), JSON.stringify({ model_max_length: 512, pad_token: '$', unk_token: '$' }));
  const kokoro = path.join(ROOT, 'node_modules', 'kokoro-js'); // its package.json is not exported
  mkdirSync(path.join(dir, 'voices'), { recursive: true });
  for (const id of voices) {
    const from = path.join(kokoro, 'voices', `${id}.bin`);
    if (existsSync(from)) copyFileSync(from, path.join(dir, 'voices', `${id}.bin`));
  }
  return dir;
}
