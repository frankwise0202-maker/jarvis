// Synthesize the "Hey Jarvis" test voices with Kokoro-82M (the natural voice's model) in Node.
//   node test/unit/fixtures/wake/make-voices.mjs <outDir>
// Needs vendor/kokoro/ (scripts/fetch-voice-model.mjs): the q8 model's parts are joined into a
// temporary local model folder. Writes 24 kHz float32 .f32 files; resample them to 16 kHz WAV with
// ffmpeg (README.md).
import { mkdtemp, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const out = path.resolve(process.argv[2] || '.');
const JOBS = [
  ['bm_george', 1, 'hey-jarvis-george', 'Hey Jarvis.'],
  ['af_heart', 1, 'hey-jarvis-heart', 'Hey Jarvis.'],
  ['am_michael', 1.1, 'hey-jarvis-wake-up-michael', 'Hey Jarvis, wake up.'],
  ['bm_george', 1, 'hey-travis-george', 'Hey Travis, how are you?'],
  ['bf_emma', 1, 'weather-emma', "What's the weather like today in Boston?"],
];

const src = path.join(ROOT, 'vendor', 'kokoro', 'onnx-community', 'Kokoro-82M-v1.0-ONNX');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'kokoro-'));
const dir = path.join(tmp, 'onnx-community', 'Kokoro-82M-v1.0-ONNX');
await mkdir(path.join(dir, 'onnx'), { recursive: true });
for (const f of ['config.json', 'tokenizer.json', 'tokenizer_config.json']) await copyFile(path.join(src, f), path.join(dir, f));
const parts = await Promise.all([0, 1].map((i) => readFile(path.join(src, 'onnx', `model_quantized.onnx.part${i}`))));
const model = Buffer.concat(parts);
const sha = createHash('sha256').update(model).digest('hex');
if (sha !== 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478') throw new Error(`unexpected model ${sha}`);
await writeFile(path.join(dir, 'onnx', 'model_quantized.onnx'), model);

const tf = await import('@huggingface/transformers');
tf.env.allowRemoteModels = false;
tf.env.allowLocalModels = true;
tf.env.localModelPath = `${tmp}/`;
const { KokoroTTS } = await import('kokoro-js');
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
await mkdir(out, { recursive: true });
for (const [voice, speed, name, text] of JOBS) {
  const { audio } = await tts.generate(text, { voice, speed });
  await writeFile(path.join(out, `${name}.f32`), Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength));
  console.log(`${name}.f32: ${voice} "${text}"`);
}
