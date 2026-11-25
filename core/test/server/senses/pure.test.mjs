// The senses' pure parts: WAV in/out, the resampler, sentence splitting, prompts, settings validation and
// the model catalog. No worker, no libraries.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseWav, readHearingWav, encodeWav, resample } from '../../../server/senses/wav.mjs';
import { splitSentences, cleanPrompt, cleanSpeech, CHUNK_MAX } from '../../../server/senses/text.mjs';
import { validateSensesBody, checkDeps, defaultSensesSettings } from '../../../server/senses/index.mjs';
import { HEAR_MODELS, SPEAK_MODELS, sizeMb, onDisk, strayFiles, modelDir, defaultModelsDir, VOICES } from '../../../server/senses/models.mjs';

const sine = (n, rate, hz, amp = 0.5) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

/** A hand-built WAV header + data, for formats encodeWav never writes. */
function rawWav({ format = 1, channels = 1, rate = 16000, bits = 16, data = Buffer.alloc(3200), dataSize = data.length, extra = [] }) {
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(format, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE((rate * channels * bits) / 8, 16);
  fmt.writeUInt16LE((channels * bits) / 8, 20);
  fmt.writeUInt16LE(bits, 22);
  const head = Buffer.alloc(8);
  head.write('data', 0, 'ascii');
  head.writeUInt32LE(dataSize >>> 0, 4);
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, ...extra, head, data]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

test('encodeWav writes 16-bit PCM mono that parseWav reads back within one step', () => {
  const s = sine(2400, 24000, 440);
  const wav = encodeWav(s, 24000);
  assert.equal(wav.length, 44 + 2400 * 2);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  const w = parseWav(wav);
  assert.deepEqual([w.format, w.channels, w.sampleRate, w.bitsPerSample], [1, 1, 24000, 16]);
  assert.equal(w.samples.length, 2400);
  for (let i = 0; i < s.length; i += 97) assert.ok(Math.abs(w.samples[i] - s[i]) < 1 / 16000, `sample ${i}`);
  // out-of-range and non-finite values are clipped, never wrapped
  const clipped = parseWav(encodeWav(Float32Array.from([2, -2, NaN, Infinity]), 16000)).samples;
  assert.ok(clipped[0] > 0.999 && clipped[1] === -1 && clipped[2] === 0);
});

test('readHearingWav takes 16 kHz mono 16-bit up to 30 s and explains everything else', () => {
  const ok = readHearingWav(encodeWav(sine(16000 * 3, 16000, 300), 16000));
  assert.equal(ok.ok, true);
  assert.equal(ok.audio.length, 48000);
  assert.equal(ok.seconds, 3);

  const cases = [
    [Buffer.from('hello, not audio'), 'bad_audio', /not a WAV/],
    [encodeWav(sine(48000, 48000, 300), 48000), 'bad_audio', /16 kHz \(this one is 48000 Hz\)/],
    [rawWav({ channels: 2, data: Buffer.alloc(6400) }), 'bad_audio', /mono \(this one has 2 channels\)/],
    [rawWav({ bits: 8, data: Buffer.alloc(1600) }), 'bad_audio', /16-bit PCM/],
    [rawWav({ format: 3, bits: 32, data: Buffer.alloc(6400) }), 'bad_audio', /16-bit PCM/],
    [encodeWav(new Float32Array(16000 * 31), 16000), 'audio_too_long', /up to 30 seconds \(this one is 31\.0 s\)/],
    [encodeWav(new Float32Array(100), 16000), 'audio_too_short', /too short/],
    [Buffer.alloc(0), 'bad_audio', /not a WAV/],
  ];
  for (const [buf, code, re] of cases) {
    const r = readHearingWav(buf);
    assert.equal(r.ok, false);
    assert.equal(r.code, code, r.message);
    assert.match(r.message, re);
  }
});

test('parseWav copes with what recorders really write: extra chunks, a streaming size, odd padding, EXTENSIBLE', () => {
  const data = encodeWav(sine(1600, 16000, 500), 16000).subarray(44);
  // a LIST chunk (odd length, padded) before the data
  const list = Buffer.concat([Buffer.from('LIST'), Buffer.from([3, 0, 0, 0]), Buffer.from('abc'), Buffer.from([0])]);
  const a = parseWav(rawWav({ data, extra: [list] }));
  assert.equal(a.samples.length, 1600);
  // a recorder that never went back to fill in the data size
  for (const size of [0, 0xffffffff]) assert.equal(parseWav(rawWav({ data, dataSize: size })).samples.length, 1600);
  // WAVE_FORMAT_EXTENSIBLE with the PCM sub-format reads as PCM
  const ext = rawWav({ data });
  const fmt = Buffer.alloc(48);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(40, 4);
  fmt.writeUInt16LE(0xfffe, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(16000, 12);
  fmt.writeUInt32LE(32000, 16);
  fmt.writeUInt16LE(2, 20);
  fmt.writeUInt16LE(16, 22);
  fmt.writeUInt16LE(22, 24);
  fmt.writeUInt16LE(1, 32); // sub-format GUID starts with 0x0001 (PCM)
  const extWav = Buffer.concat([ext.subarray(0, 12), fmt, ext.subarray(12 + 24)]);
  extWav.writeUInt32LE(extWav.length - 8, 4);
  assert.equal(readHearingWav(extWav).ok, true);
  assert.throws(() => parseWav(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])), /no format chunk/);
});

test('resample keeps a tone, its loudness and the length; going down it removes what would alias', () => {
  const from = 24000;
  const tone = sine(24000, from, 1000);
  const down = resample(tone, from, 16000);
  assert.equal(down.length, 16000);
  // the 1 kHz tone survives: compare with a fresh 1 kHz sine at 16 kHz (skip the edges)
  const ref = sine(16000, 16000, 1000);
  let err = 0;
  for (let i = 100; i < 15900; i++) err = Math.max(err, Math.abs(down[i] - ref[i]));
  assert.ok(err < 0.02, `max error ${err}`);
  // 10 kHz is above 16 kHz's Nyquist: it must mostly vanish, not fold down to 6 kHz
  const high = resample(sine(24000, from, 10000), from, 16000);
  let peak = 0;
  for (let i = 100; i < high.length - 100; i++) peak = Math.max(peak, Math.abs(high[i]));
  assert.ok(peak < 0.08, `aliased peak ${peak}`);
  assert.deepEqual(Array.from(resample(Float32Array.from([0.1, 0.2]), 16000, 16000)), [Float32Array.from([0.1])[0], Float32Array.from([0.2])[0]]);
});

test('splitSentences: sentence ends, not abbreviations, decimals, initials or addresses; long ones are split', () => {
  assert.deepEqual(splitSentences('Good morning, Frank. It is 4.30 and 41 degrees! Shall I read the news?'), ['Good morning, Frank.', 'It is 4.30 and 41 degrees!', 'Shall I read the news?']);
  assert.deepEqual(splitSentences('Dr. Smith met Mr. J. Jones at St. Paul’s. Then they left…  Fine.'), ['Dr. Smith met Mr. J. Jones at St. Paul’s.', 'Then they left…', 'Fine.']);
  assert.deepEqual(splitSentences('See example.com for more. "Quoted," he said. (Aside.) Done'), ['See example.com for more.', '"Quoted," he said.', '(Aside.)', 'Done']);
  assert.deepEqual(splitSentences('   '), []);
  assert.deepEqual(splitSentences('...'), []);
  const long = `${'word '.repeat(80)}and then, ${'more words '.repeat(30)}.`;
  const parts = splitSentences(long);
  assert.ok(parts.length >= 2);
  for (const p of parts) assert.ok(p.length <= CHUNK_MAX, `${p.length} > ${CHUNK_MAX}`);
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), cleanSpeech(long));
  const giant = 'x'.repeat(700);
  assert.deepEqual(splitSentences(giant).map((p) => p.length), [CHUNK_MAX, CHUNK_MAX, 700 - 2 * CHUNK_MAX]);
});

test('prompts and speech text are cleaned: control and invisible characters, Whisper markers, 200 characters', () => {
  assert.equal(cleanPrompt('  Frank,​ home‮ base <|endoftext|>  Jarvis '), 'Frank, home base endoftext Jarvis');
  const long = `${'context '.repeat(40)}end`;
  const p = cleanPrompt(long);
  assert.ok(p.length <= 200 && !p.endsWith(' ') && long.startsWith(p));
  assert.equal(cleanPrompt(42), '');
  assert.equal(cleanSpeech('Hello\n\tthere\u0007 you'), 'Hello there you');
});

test('PUT /api/senses bodies: known keys only, booleans, models (with fast/accurate), Kokoro voices', () => {
  assert.deepEqual(validateSensesBody({ hear: { enabled: true, model: 'small.en' }, speak: { enabled: false } }), { hear: { enabled: true, model: 'small.en' }, speak: { enabled: false } });
  assert.deepEqual(validateSensesBody({ hear: { model: 'fast' } }), { hear: { model: 'base.en' } });
  assert.deepEqual(validateSensesBody({ hear: { model: 'accurate' } }), { hear: { model: 'small.en' } });
  assert.deepEqual(validateSensesBody({ hear: { model: 'tiny.en' } }), { hear: { model: 'tiny.en' } });
  assert.deepEqual(validateSensesBody({ speak: { voice: 'bf_emma' } }), { speak: { voice: 'bf_emma' } });
  assert.deepEqual(validateSensesBody({}), {});
  const refused = [
    [null, 'bad_settings'],
    [[], 'bad_settings'],
    [{ ears: {} }, 'bad_settings'],
    [{ hear: true }, 'bad_settings'],
    [{ hear: { enabled: 'yes' } }, 'bad_settings'],
    [{ hear: { enable: true } }, 'bad_settings'],
    [{ hear: { model: 'large-v3' } }, 'bad_model'],
    [{ speak: { enabled: 1 } }, 'bad_settings'],
    [{ speak: { voice: 'hal9000' } }, 'bad_voice'],
    [{ speak: { speed: 2 } }, 'bad_settings'],
  ];
  for (const [body, code] of refused) {
    assert.throws(() => validateSensesBody(body), (e) => e.status === 400 && e.code === code, JSON.stringify(body));
  }
  assert.deepEqual(defaultSensesSettings(), { v: 1, hear: { enabled: false, model: 'base.en' }, speak: { enabled: false, voice: 'bm_george' } });
});

test('the model catalog: pinned revisions, sizes in MB as the app shows them, George among the voices', () => {
  for (const m of [...Object.values(HEAR_MODELS), ...Object.values(SPEAK_MODELS)]) {
    assert.match(m.revision, /^[0-9a-f]{40}$/, `${m.repo} is pinned to a commit`);
    assert.match(m.repo, /^onnx-community\//);
    assert.ok(m.files.length >= 4 && m.files.every(([f, s]) => typeof f === 'string' && Number.isInteger(s) && s > 0));
  }
  assert.equal(sizeMb(HEAR_MODELS['base.en']), 80);
  assert.equal(sizeMb(HEAR_MODELS['small.en']), 252);
  assert.equal(sizeMb(HEAR_MODELS['tiny.en']), 44);
  assert.equal(sizeMb(SPEAK_MODELS.q8), 92);
  assert.equal(sizeMb(SPEAK_MODELS.fp32), 326);
  assert.ok(Object.values(HEAR_MODELS).every((m) => m.dtype === 'q8'));
  assert.ok(VOICES.includes('bm_george'));
});

test('onDisk counts a file only at its exact size; strayFiles finds the cut-short ones; the models folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-senses-disk-'));
  try {
    const m = HEAR_MODELS['tiny.en'];
    assert.deepEqual(onDisk(fs, dir, m), { bytes: 0, complete: false });
    const base = modelDir(dir, m);
    assert.equal(base, path.join(dir, 'onnx-community', 'whisper-tiny.en', m.revision));
    for (const [f, size] of m.files) {
      fs.mkdirSync(path.dirname(path.join(base, f)), { recursive: true });
      fs.writeFileSync(path.join(base, f), Buffer.alloc(f.endsWith('.onnx') ? 10 : size)); // the two models cut short
    }
    const partial = onDisk(fs, dir, m);
    assert.equal(partial.complete, false);
    assert.equal(partial.bytes, m.files.filter(([f]) => !f.endsWith('.onnx')).reduce((n, [, s]) => n + s, 0));
    assert.deepEqual(strayFiles(fs, dir, m).map((p) => path.basename(p)).sort(), ['decoder_model_merged_quantized.onnx', 'encoder_model_quantized.onnx']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(defaultModelsDir({ JARVIS_CORE_MODELS_DIR: '/x/models' }), '/x/models');
  assert.equal(defaultModelsDir({ XDG_CACHE_HOME: '/var/cache/u' }), '/var/cache/u/jarvis-core/models');
  assert.equal(defaultModelsDir({ XDG_CACHE_HOME: 'relative' }), path.join(os.homedir(), '.cache', 'jarvis-core', 'models'));
  assert.equal(defaultModelsDir({}), path.join(os.homedir(), '.cache', 'jarvis-core', 'models'));
});

test('checkDeps resolves without loading and names what is missing', () => {
  assert.deepEqual(checkDeps(() => 'file:///x'), { installed: true, missing: [] });
  const r = checkDeps((s) => {
    if (s === 'kokoro-js') throw Object.assign(new Error('nope'), { code: 'ERR_MODULE_NOT_FOUND' });
    return 'file:///x';
  });
  assert.deepEqual(r, { installed: false, missing: ['kokoro-js'] });
});
