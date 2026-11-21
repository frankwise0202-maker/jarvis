// "Hey Jarvis" (SPEC §22): the openWakeWord pipeline (src/lib/wake/oww.js) with the REAL models
// (public/models/openwakeword/) on ONNX Runtime Web's WebAssembly build in Node, the same runtime
// the Standby worker uses in the browser:
//   - the models, the runtime and the catalog agree (sizes and SHA-256 pinned);
//   - the scores equal a Python reference of openWakeWord v0.5.1's own streaming code
//     (fixtures/wake/oww-reference.json, made by fixtures/wake/oww_reference.py);
//   - "Hey Jarvis" said by three synthetic voices (Kokoro-82M: George, Heart, Michael) triggers, once;
//   - no trigger on "Hey Travis" (the nearest miss), a question, room noise, white noise, music,
//     speech-like babble, claps, or silence.
// Real people were not recorded: see the README's "Wake Jarvis" notes.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWakePipeline, createFramer, OWW } from '../../src/lib/wake/oww.js';
import { WAKE_MODELS, WAKE_RUNTIME, WAKE_WORD, wakeWordDownloadBytes, formatMegabytes } from '../../src/lib/wake/catalog.js';
import { createResampler } from '../../src/lib/wake/resample.js';
import * as S from './wake.signals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODELS = path.join(ROOT, 'public', 'models', 'openwakeword');
const FIX = path.join(ROOT, 'test', 'unit', 'fixtures', 'wake');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

let ort = null;
let sessions = null;

before(async () => {
  // onnxruntime-web's WebAssembly build (the ESM bundle the worker imports as 'onnxruntime-web/wasm').
  const req = createRequire(path.join(ROOT, 'package.json'));
  const dir = path.dirname(req.resolve('onnxruntime-web/wasm'));
  ort = await import(pathToFileURL(path.join(dir, 'ort.wasm.bundle.min.mjs')).href);
  ort.env.wasm.numThreads = 1;
  const load = async (m) => ort.InferenceSession.create(await readFile(path.join(MODELS, m.file)), { executionProviders: ['wasm'] });
  sessions = { mel: await load(WAKE_MODELS.melspectrogram), emb: await load(WAKE_MODELS.embedding), ww: await load(WAKE_MODELS.heyJarvis) };
});

function pipeline(opts = {}) {
  const { mel, emb, ww } = sessions;
  return createWakePipeline({
    ...opts,
    melspec: async (x) => (await mel.run({ input: new ort.Tensor('float32', Float32Array.from(x), [1, x.length]) })).output.data,
    embed: async (m) => (await emb.run({ input_1: new ort.Tensor('float32', Float32Array.from(m), [1, 76, 32, 1]) })).conv2d_19.data,
    classify: async (f) => (await ww.run({ 'x.1': new ort.Tensor('float32', Float32Array.from(f), [1, 16, 96]) }))['53'].data[0],
  });
}

/** Run a whole signal (16 kHz, -1..1) through a pipeline in 80 ms frames: scores and detections. */
async function score(x, opts = {}) {
  const p = pipeline(opts);
  const scores = [];
  const detections = [];
  for (let i = 0; i + OWW.frame <= x.length; i += OWW.frame) {
    const r = await p.push(x.subarray(i, i + OWW.frame));
    scores.push(r.score);
    if (r.detected) detections.push(scores.length - 1);
  }
  return { scores, detections, max: Math.max(0, ...scores) };
}

async function wav(name) {
  return S.readWav(await readFile(path.join(FIX, name)));
}

/** A fixture with 1 s of silence before and after (as openWakeWord's predict_clip pads). */
async function padded(name) {
  const { rate, samples } = await wav(name);
  assert.equal(rate, 16000);
  return S.concat(S.silence(1), samples, S.silence(1));
}

test('the models and the runtime are the pinned files', async () => {
  for (const m of Object.values(WAKE_MODELS)) {
    const buf = await readFile(path.join(MODELS, m.file));
    assert.equal(buf.length, m.bytes, `${m.file} size`);
    assert.equal(sha256(buf), m.sha256, `${m.file} SHA-256`);
  }
  const req = createRequire(path.join(ROOT, 'package.json'));
  const wasm = await readFile(path.join(path.dirname(req.resolve('onnxruntime-web/wasm')), WAKE_RUNTIME.file));
  assert.equal(wasm.length, WAKE_RUNTIME.bytes, 'the runtime binary size (update catalog.js with onnxruntime-web)');
  assert.equal(sha256(wasm), WAKE_RUNTIME.sha256, 'the runtime binary SHA-256');
  const license = await readFile(path.join(MODELS, 'LICENSE.md'), 'utf8');
  assert.match(license, /CC BY-NC-SA 4\.0/);
  assert.match(license, /non-commercial/i);
  for (const m of Object.values(WAKE_MODELS)) assert.ok(license.includes(m.sha256), `LICENSE.md lists ${m.file}'s SHA-256`);
  assert.equal(formatMegabytes(wakeWordDownloadBytes()), '15 MB');
});

test('the scores equal openWakeWord’s own streaming code (Python reference) from the 16th frame on', async () => {
  const ref = JSON.parse(await readFile(path.join(FIX, 'oww-reference.json'), 'utf8'));
  for (const name of ['hey-jarvis-george.wav', 'hey-travis-george.wav']) {
    const { samples } = await wav(name);
    // The reference read the WAV as int16: feed the same integers.
    const ints = new Float32Array(samples.length + 32000);
    for (let i = 0; i < samples.length; i++) ints[16000 + i] = Math.round(samples[i] * 32768);
    const p = pipeline({ int16: true });
    const got = [];
    for (let i = 0; i + OWW.frame <= ints.length; i += OWW.frame) got.push((await p.push(ints.subarray(i, i + OWW.frame))).score);
    const want = ref.scores[name];
    assert.equal(got.length, want.length, `${name}: frame count`);
    for (let i = 0; i < OWW.features - 1; i++) assert.equal(got[i], 0, `${name}: no score before 16 real embeddings`);
    let worst = 0;
    for (let i = OWW.features; i < want.length; i++) worst = Math.max(worst, Math.abs(got[i] - want[i]));
    assert.ok(worst < 1e-4, `${name}: max difference ${worst}`);
  }
});

test('"Hey Jarvis" by three synthetic voices triggers, exactly once', async () => {
  for (const name of ['hey-jarvis-george.wav', 'hey-jarvis-heart.wav', 'hey-jarvis-wake-up-michael.wav']) {
    const r = await score(await padded(name));
    assert.ok(r.max > 0.9, `${name}: peak score ${r.max}`);
    assert.equal(r.detections.length, 1, `${name}: one detection (refractory), got ${r.detections.length}`);
  }
});

test('still triggers with room noise and a television-level babble under it (10 dB below)', async () => {
  const x = await padded('hey-jarvis-george.wav');
  S.withRoom(x, { rmsDb: -45, seed: 9 });
  const babble = S.speechLike({ seconds: x.length / 16000, seed: 77, peakDb: -26 });
  for (let i = 0; i < x.length; i++) x[i] += babble[i];
  const r = await score(x);
  assert.equal(r.detections.length, 1, `peak ${r.max}`);
});

test('no trigger: "Hey Travis", a question, noise, music, babble, claps, silence', async () => {
  const cases = {
    'hey travis': await padded('hey-travis-george.wav'),
    question: await padded('weather-emma.wav'),
    silence: S.silence(4),
    'room noise': S.roomNoise(6, { rmsDb: -50, hum: true }),
    'white noise': (() => {
      const r = S.rng(3);
      return Float32Array.from({ length: 16000 * 5 }, () => S.gauss(r) * 0.1);
    })(),
    music: S.musicLike({ seconds: 8, bpm: 110 }),
    babble: S.speechLike({ seconds: 10, seed: 5 }),
    claps: S.withRoom(S.doubleClap({ seconds: 3 })),
  };
  for (const [name, x] of Object.entries(cases)) {
    const r = await score(x);
    assert.equal(r.detections.length, 0, `${name}: detected (peak ${r.max})`);
    assert.ok(r.max < WAKE_WORD.threshold, `${name}: peak ${r.max}`);
  }
});

test('patience: one frame above the threshold is not a detection; refractory time', async () => {
  // A scripted classifier (no models): the detection logic alone.
  const run = async (scores, opts) => {
    let k = 0;
    const p = createWakePipeline({ melspec: async () => new Float32Array(8 * 32), embed: async () => new Float32Array(96), classify: async () => scores[Math.min(scores.length - 1, Math.max(0, k++))], ...opts });
    const out = [];
    for (let i = 0; i < 15 + scores.length; i++) out.push((await p.push(new Float32Array(1280))).detected);
    return out.map((d, i) => (d ? i - 15 : -1)).filter((i) => i >= 0);
  };
  assert.deepEqual(await run([0, 0.9, 0, 0.9, 0], { patience: 2 }), []);
  assert.deepEqual(await run([0, 0.6, 0.7, 0, 0], { patience: 2 }), [2]);
  // Above the threshold for long: once, then again only after the refractory 2 s (25 frames).
  const long = new Array(60).fill(0.99);
  const hits = await run(long, { patience: 2, refractoryMs: 2000 });
  assert.deepEqual(hits, [1, 26, 51]);
});

test('frames: 128-sample blocks become 1280-sample frames; resampled 48 kHz audio scores like 16 kHz', async () => {
  const frames = [];
  const f = createFramer(1280, (fr) => frames.push(fr));
  for (let i = 0; i < 25; i++) f.push(new Float32Array(128).fill(i));
  assert.equal(frames.length, 2);
  assert.equal(frames[1][0], 10);
  // George at 48 kHz (upsampled), back to 16 kHz through the Standby resampler: still a detection.
  const x16 = await padded('hey-jarvis-george.wav');
  const up = createResampler(16000, 48000);
  const x48 = S.concat(up.push(x16), up.push(new Float32Array(64)));
  const down = createResampler(48000, 16000);
  const blocks = [];
  for (let i = 0; i < x48.length; i += 128) blocks.push(down.push(x48.subarray(i, i + 128)));
  const back = S.concat(...blocks);
  const r = await score(back);
  assert.equal(r.detections.length, 1, `peak ${r.max}`);
});

test('the pipeline refuses wrong frame sizes and overlapping pushes', async () => {
  const p = pipeline();
  await assert.rejects(() => p.push(new Float32Array(100)), RangeError);
  const a = p.push(new Float32Array(1280));
  await assert.rejects(() => p.push(new Float32Array(1280)), /previous frame/);
  await a;
});
