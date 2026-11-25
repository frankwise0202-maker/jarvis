// Hearing and voice through the home base (v7.7, beta, SPEC §25): the WAV encoder and decoder, the
// energy VAD, the views of GET api/senses, the context words, the client (a fake fetch), the
// controller (its gate and cool-downs), the hearing wrapper behind stt.js's interface (a fake
// capture, a fake stt.js and fake senses: on, off, unreachable, slow, keepListening, stop, abort, no
// speech, the microphone failing), the home base's voice engine, and the voice router's ladder
// (the home base, then the on-device George, then the device voice).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, decodeWav, createVad, sensesView, senseReady, sensesProblem, hearText, contextPrompt, hearEndSilenceMs, hearModelLabel, HEAR_PROMPT_MAX } from '../../src/lib/senses.js';
import { getSenses, putSenses, hearWav, speakText } from '../../src/platform/senses.js';
import { createSenses } from '../../src/ui/senses.js';
import { createHomeBaseHearing } from '../../src/platform/voice/homebase-hearing.js';
import { createHomeBaseVoiceEngine } from '../../src/platform/voice/homebase-voice.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../../src/platform/settings.js';
import { RESTORED_SETTINGS } from '../../src/platform/backup.js';

const BASE = 'https://alienware.tail4e5f6a.ts.net/';
const SR = 16000;
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

// ---- signals ---------------------------------------------------------------------------------------

function room(seconds, amp = 0.001, seed = 7) {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    x[i] = ((s / 4294967296) * 2 - 1) * amp;
  }
  return x;
}

/** Voice-like: a 220 Hz tone with syllable-rate loudness changes, about -27 dBFS, over a quiet room. */
function speech(seconds, amp = 0.1) {
  const x = room(seconds);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] += amp * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t));
  }
  return x;
}

function concat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function feed(vad, x, block = 1280) {
  const events = [];
  for (let i = 0; i < x.length; i += block) for (const ev of vad.push(x.subarray(i, i + block))) events.push({ ...ev, at: (i + block) / SR });
  return events;
}

// ---- WAV ---------------------------------------------------------------------------------------------

test('senses: encodeWav writes a mono PCM16 WAV the decoder reads back (clipped, NaN as silence)', () => {
  const x = Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2, NaN]);
  const wav = encodeWav(x, 16000);
  assert.equal(wav.byteLength, 44 + x.length * 2);
  const v = new DataView(wav.buffer);
  const tag = (at) => String.fromCharCode(...wav.slice(at, at + 4));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(tag(36), 'data');
  assert.equal(v.getUint16(20, true), 1, 'PCM');
  assert.equal(v.getUint16(22, true), 1, 'mono');
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), x.length * 2);
  assert.equal(v.getInt16(44 + 3 * 2, true), 32767);
  assert.equal(v.getInt16(44 + 4 * 2, true), -32768);
  assert.equal(v.getInt16(44 + 5 * 2, true), 32767, 'clipped');
  assert.equal(v.getInt16(44 + 7 * 2, true), 0, 'NaN is silence');
  const back = decodeWav(wav);
  assert.equal(back.sampleRate, 16000);
  assert.equal(back.channels, 1);
  assert.ok(Math.abs(back.pcm[1] - 0.5) < 1e-4 && Math.abs(back.pcm[2] + 0.5) < 1e-4);
});

test('senses: decodeWav reads 24 kHz PCM16, stereo, float and a streamed (oversized) data chunk; refuses garbage', () => {
  const tone = new Float32Array(2400).map((_, i) => 0.25 * Math.sin(i / 10));
  const wav = encodeWav(tone, 24000);
  const d = decodeWav(wav.buffer);
  assert.equal(d.sampleRate, 24000);
  assert.equal(d.pcm.length, 2400);
  // A data chunk that says 0xFFFFFFFF bytes (a streamed WAV): read to the end.
  const streamed = wav.slice();
  new DataView(streamed.buffer).setUint32(40, 0xffffffff, true);
  assert.equal(decodeWav(streamed).pcm.length, 2400);
  // Stereo float32.
  const n = 10;
  const buf = new ArrayBuffer(44 + n * 8);
  const v = new DataView(buf);
  const put = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  put(0, 'RIFF');
  v.setUint32(4, 36 + n * 8, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, 22050, true);
  v.setUint32(28, 22050 * 8, true);
  v.setUint16(32, 8, true);
  v.setUint16(34, 32, true);
  put(36, 'data');
  v.setUint32(40, n * 8, true);
  for (let i = 0; i < n; i++) {
    v.setFloat32(44 + i * 8, 0.5, true);
    v.setFloat32(44 + i * 8 + 4, -0.1, true);
  }
  const f = decodeWav(buf);
  assert.equal(f.channels, 2);
  assert.ok(Math.abs(f.pcm[0] - 0.2) < 1e-6, 'mixed to mono');
  assert.equal(decodeWav(new Uint8Array(10)), null);
  assert.equal(decodeWav(new TextEncoder().encode('{"error":"busy","message":"one at a time"}'.padEnd(60, ' '))), null);
  assert.equal(decodeWav(null), null);
});

// ---- the VAD -------------------------------------------------------------------------------------------

test('senses: the VAD hears speech, then ends it after 1.2 s of silence with a little before and after it', () => {
  const vad = createVad({ endSilenceMs: 1200 });
  const ev = feed(vad, concat(room(0.6), speech(1.5), room(2.0)));
  const types = ev.map((e) => e.type);
  assert.deepEqual(types, ['speech', 'end']);
  const end = ev[1];
  assert.equal(end.reason, 'silence');
  assert.ok(end.at >= 0.6 + 1.5 + 1.2 - 0.05 && end.at <= 0.6 + 1.5 + 1.35, `ended ${end.at.toFixed(2)} s in`);
  const secs = end.samples.length / SR;
  assert.ok(secs >= 1.5 && secs <= 1.5 + 0.3 + 0.35 + 0.15, `kept ${secs.toFixed(2)} s (the speech, 300 ms before, 300 ms after)`);
});

test('senses: a pause of 0.6 s inside a sentence does not end it; Long waits 2.2 s', () => {
  const vad = createVad({ endSilenceMs: hearEndSilenceMs('normal') });
  const ev = feed(vad, concat(room(0.3), speech(1.0), room(0.6), speech(1.0), room(1.6)));
  assert.deepEqual(
    ev.map((e) => e.type),
    ['speech', 'end'],
  );
  assert.ok(ev[1].samples.length / SR > 2.5, 'one utterance with both halves');
  assert.equal(hearEndSilenceMs('short'), 1200);
  assert.equal(hearEndSilenceMs('long'), 2200);
  const slow = createVad({ endSilenceMs: hearEndSilenceMs('long') });
  const ev2 = feed(slow, concat(room(0.3), speech(1.0), room(1.6), speech(0.8), room(2.6)));
  assert.deepEqual(
    ev2.map((e) => e.type),
    ['speech', 'end'],
    'a 1.6 s pause with Long is still one utterance',
  );
});

test('senses: clicks and a short knock are not speech; nothing for 10 s is no speech; 30 s at most', () => {
  const vad = createVad({});
  const click = concat(room(0.5), speech(0.04, 0.5), room(1.0), speech(0.1), room(1.5));
  const ev = feed(vad, click).map((e) => e.type);
  assert.ok(!ev.includes('end'), `no utterance from a click and a knock (${ev.join(',')})`);
  const quiet = createVad({ noSpeechMs: 10000 });
  const ev2 = feed(quiet, room(11));
  assert.deepEqual(
    ev2.map((e) => e.type),
    ['nospeech'],
  );
  assert.ok(ev2[0].at >= 10 && ev2[0].at < 10.2);
  const long = createVad({});
  const ev3 = feed(long, concat(room(0.2), speech(34)));
  const end = ev3.find((e) => e.type === 'end');
  assert.equal(end.reason, 'max');
  assert.ok(end.samples.length / SR <= 30.001, 'never more than 30 s');
});

test('senses: finish() ends an utterance under way (stop); reset() starts over', () => {
  const vad = createVad({});
  feed(vad, concat(room(0.3), speech(0.8)));
  assert.equal(vad.speaking, true);
  const ev = vad.finish();
  assert.equal(ev.type, 'end');
  assert.equal(ev.reason, 'stop');
  assert.ok(ev.samples.length / SR > 0.8);
  assert.equal(vad.finish(), null, 'nothing under way');
  feed(vad, concat(room(0.2), speech(0.5)));
  vad.reset();
  assert.equal(vad.speaking, false);
});

// ---- api/senses views ---------------------------------------------------------------------------------

const SENSES = {
  hear: { enabled: true, model: 'base.en', state: 'ready', progress: 1, sizeMb: 80, error: null },
  speak: { enabled: false, voice: 'bm_george', state: 'off', progress: 0, sizeMb: 92, error: null },
  deps: { installed: true },
};

test('senses: sensesView checks GET api/senses; senseReady needs on + ready + the software', () => {
  const v = sensesView(SENSES);
  assert.deepEqual(v.hear, { enabled: true, state: 'ready', progress: 1, sizeMb: 80, error: null, model: 'base.en' });
  assert.equal(v.speak.voice, 'bm_george');
  assert.equal(v.deps.installed, true);
  assert.equal(senseReady(v, 'hear'), true);
  assert.equal(senseReady(v, 'speak'), false);
  const odd = sensesView({ hear: { enabled: 'yes', state: 'thinking', progress: 7, sizeMb: -1, error: { code: 'download', message: 'huggingface.co\u0000 timed out' }, model: '<b>' }, speak: {}, deps: { installed: false } });
  assert.equal(odd.hear.enabled, false);
  assert.equal(odd.hear.state, 'loading', 'an unknown state is not ready');
  assert.equal(odd.hear.progress, 1);
  assert.equal(odd.hear.sizeMb, null);
  assert.equal(odd.hear.error, 'huggingface.co timed out');
  assert.equal(odd.hear.model, 'base.en');
  assert.equal(odd.speak.progress, null, 'a missing number is null, never 0');
  assert.equal(senseReady(sensesView({ ...SENSES, deps: { installed: false } }), 'hear'), false, 'no speech software');
  assert.equal(sensesView(null), null);
  assert.equal(sensesView({ hear: {} }), null);
  assert.equal(sensesView([]), null);
  assert.equal(hearModelLabel('small.en'), 'Accurate');
  assert.equal(hearModelLabel('base.en'), 'Fast');
});

test('senses: sensesProblem words a failure (an old Core, offline, too slow, the Core’s own words)', () => {
  assert.equal(sensesProblem({ kind: 'http', status: 404, code: 'not_found' }).state, 'old');
  assert.match(sensesProblem({ kind: 'http', status: 404 }).message, /jarvis-core update/);
  assert.equal(sensesProblem({ kind: 'unreachable' }).state, 'offline');
  assert.equal(sensesProblem({ kind: 'down' }).state, 'offline');
  assert.equal(sensesProblem({ kind: 'timeout' }).state, 'slow');
  assert.deepEqual(sensesProblem({ kind: 'http', status: 503, code: 'busy', message: 'one at a time' }), { state: 'said', message: 'One at a time' });
  assert.equal(sensesProblem({ kind: 'http', status: 500, code: 'internal', message: 'oops' }).state, 'error');
});

test('senses: hearText keeps words, drops Whisper’s sound notes; contextPrompt is ≤ 200 characters, names first', () => {
  assert.equal(hearText({ text: ' What is the capital of France? ' }), 'What is the capital of France?');
  assert.equal(hearText({ text: '[BLANK_AUDIO]' }), '');
  assert.equal(hearText({ text: ' (music) ♪♪ ' }), '');
  assert.equal(hearText({ text: '[Applause] Thank you, Jarvis.' }), 'Thank you, Jarvis.');
  assert.equal(hearText({}), '');
  const p = contextPrompt({
    names: ['Jarvis', 'Frank', { phrase: 'separator', boost: 2 }, 'Jarvis'],
    title: 'Espresso machines under $500',
    texts: ['The Breville Bambino Plus is the best value; the Gaggia Classic Pro suits tinkerers. The LG 27GP850 too.'],
  });
  assert.ok(p.startsWith('Jarvis, Frank, separator, Espresso, machines, under'), p);
  assert.ok(p.includes('Breville') && p.includes('Bambino') && p.includes('Gaggia') && p.includes('27GP850'), p);
  assert.ok(!/\bThe\b/.test(p), 'a sentence’s first word is not a name');
  const big = contextPrompt({ names: Array.from({ length: 80 }, (_, i) => `Name${i}abc`) });
  assert.ok(big.length <= HEAR_PROMPT_MAX, `${big.length} characters`);
  assert.equal(contextPrompt({}), '');
});

// ---- the client --------------------------------------------------------------------------------------

function fakeFetch(answer) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const a = typeof answer === 'function' ? await answer(url, init, calls.length) : answer;
    if (a instanceof Error) throw a;
    const headers = new Map(Object.entries(a.headers || { 'content-type': a.bytes ? 'audio/wav' : 'application/json' }));
    return {
      status: a.status || 200,
      headers: { get: (k) => headers.get(k.toLowerCase()) || null },
      text: async () => (a.body !== undefined ? (typeof a.body === 'string' ? a.body : JSON.stringify(a.body)) : ''),
      arrayBuffer: async () => a.bytes.buffer.slice(a.bytes.byteOffset, a.bytes.byteOffset + a.bytes.byteLength),
    };
  };
  f.calls = calls;
  return f;
}

test('senses client: GET/PUT api/senses with the home base rules; a 1.0 Core is old', async () => {
  const f = fakeFetch({ body: SENSES });
  const r = await getSenses(BASE, { fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.senses.hear.state, 'ready');
  assert.equal(f.calls[0].url, `${BASE}api/senses`);
  assert.equal(f.calls[0].init.credentials, 'omit');
  assert.equal(f.calls[0].init.referrerPolicy, 'no-referrer');
  assert.equal(f.calls[0].init.cache, 'no-store');
  const put = fakeFetch({ body: SENSES });
  await putSenses(BASE, { hear: { enabled: true, model: 'small.en', extra: 1 }, speak: { enabled: false }, other: true }, { fetchImpl: put });
  assert.equal(put.calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(put.calls[0].init.body), { hear: { enabled: true, model: 'small.en' }, speak: { enabled: false } });
  const old = await getSenses(BASE, { fetchImpl: fakeFetch({ status: 404, body: { error: 'not_found', message: 'no such endpoint: /api/senses' } }) });
  assert.equal(old.ok, false);
  assert.equal(sensesProblem(old).state, 'old');
  const junk = await getSenses(BASE, { fetchImpl: fakeFetch({ body: { hello: 1 } }) });
  assert.equal(junk.kind, 'notcore');
});

test('senses client: POST api/hear sends the WAV with its type and the context words; too slow is "timeout"; no ping', async () => {
  const wav = encodeWav(speech(0.5));
  const f = fakeFetch({ body: { text: ' Book a table for four. ', ms: 640, model: 'whisper-base.en' } });
  const r = await hearWav(BASE, wav, { prompt: 'Jarvis, Frank, Gaggia & Co?', fetchImpl: f });
  assert.deepEqual({ ok: r.ok, text: r.text, ms: r.ms, model: r.model }, { ok: true, text: 'Book a table for four.', ms: 640, model: 'whisper-base.en' });
  assert.equal(f.calls[0].url, `${BASE}api/hear?prompt=${encodeURIComponent('Jarvis, Frank, Gaggia & Co?')}`);
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(f.calls[0].init.headers['Content-Type'], 'audio/wav');
  assert.equal(f.calls[0].init.body, wav);
  const noPrompt = fakeFetch({ body: { text: '', ms: 10 } });
  const empty = await hearWav(BASE, wav, { fetchImpl: noPrompt });
  assert.equal(noPrompt.calls[0].url, `${BASE}api/hear`);
  assert.equal(empty.text, '');
  // Slower than the timeout: 'timeout', and nothing else asked (no no-cors ping).
  const hang = fakeFetch((url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  const slow = await hearWav(BASE, wav, { fetchImpl: hang, timeoutMs: 30 });
  assert.equal(slow.kind, 'timeout');
  assert.equal(hang.calls.length, 1);
  // Unreachable (a TypeError): at once, no ping.
  const off = fakeFetch(new TypeError('Failed to fetch'));
  const gone = await hearWav(BASE, wav, { fetchImpl: off });
  assert.equal(gone.kind, 'unreachable');
  assert.equal(off.calls.length, 1, 'no no-cors ping: the device’s recognizer takes over at once');
  const busy = await hearWav(BASE, wav, { fetchImpl: fakeFetch({ status: 503, body: { error: 'busy', message: 'the queue is full' } }) });
  assert.equal(busy.kind, 'http');
  assert.equal(busy.code, 'busy');
});

test('senses client: POST api/speak returns the voice as floats; a JSON error is a failure; text is capped', async () => {
  const tone = new Float32Array(4800).map((_, i) => 0.3 * Math.sin(i / 8));
  const f = fakeFetch({ bytes: encodeWav(tone, 24000) });
  const r = await speakText(BASE, { text: 'Good evening, Frank.', voice: 'bm_george', speed: 1.2 }, { fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.sampleRate, 24000);
  assert.equal(r.pcm.length, 4800);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { text: 'Good evening, Frank.', voice: 'bm_george', speed: 1.2 });
  const long = fakeFetch({ bytes: encodeWav(tone, 24000) });
  await speakText(BASE, { text: 'x'.repeat(1500), voice: '<script>', speed: 9 }, { fetchImpl: long });
  const sent = JSON.parse(long.calls[0].init.body);
  assert.equal(sent.text.length, 1000);
  assert.equal(sent.voice, 'bm_george');
  assert.equal(sent.speed, 2);
  const err = await speakText(BASE, { text: 'Hello.' }, { fetchImpl: fakeFetch({ status: 409, body: { error: 'not_ready', message: 'the voice is still downloading' } }) });
  assert.equal(err.ok, false);
  assert.equal(err.code, 'not_ready');
  const bad = await speakText(BASE, { text: 'Hello.' }, { fetchImpl: fakeFetch({ bytes: new Uint8Array(20) }) });
  assert.equal(bad.ok, false);
  assert.equal((await speakText(BASE, { text: '   ' })).kind, 'empty');
});

// ---- the controller -----------------------------------------------------------------------------------

function controller({ settings = {}, senses = SENSES, hear, speak } = {}) {
  let s = { homeBaseUrl: BASE, homeBaseHear: false, homeBaseSpeak: false, ...settings };
  const listeners = new Set();
  let t = 1_000_000;
  const timers = [];
  const calls = { get: 0, put: [], hear: 0, speak: 0 };
  const client = {
    getSenses: async () => {
      calls.get += 1;
      return typeof senses === 'function' ? senses() : { ok: true, senses: sensesView(senses) };
    },
    putSenses: async (base, patch) => {
      calls.put.push(patch);
      return { ok: true, senses: sensesView(senses) };
    },
    hearWav: async (...a) => {
      calls.hear += 1;
      return hear ? hear(...a) : { ok: true, text: 'Hello there.', ms: 300 };
    },
    speakText: async (...a) => {
      calls.speak += 1;
      return speak ? speak(...a) : { ok: true, pcm: new Float32Array(10), sampleRate: 24000 };
    },
  };
  const ctl = createSenses({
    getSettings: () => s,
    onSettingsChange: (fn) => listeners.add(fn),
    client,
    now: () => t,
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => {},
  });
  return {
    ctl,
    calls,
    timers,
    advance: (ms) => (t += ms),
    set: (p) => {
      s = { ...s, ...p };
      for (const fn of listeners) fn(s);
    },
  };
}

test('senses controller: off (the default) asks nothing and never hears or speaks through the home base', async () => {
  assert.equal(DEFAULT_SETTINGS.homeBaseHear, false);
  assert.equal(DEFAULT_SETTINGS.homeBaseSpeak, false);
  const c = controller();
  c.ctl.prime();
  await flush();
  assert.equal(c.calls.get, 0, 'nothing asked while both are off');
  assert.equal(c.ctl.canHear(), false);
  assert.equal(c.ctl.canSpeak(), false);
  const unlinked = controller({ settings: { homeBaseUrl: '', homeBaseHear: true } });
  unlinked.ctl.prime();
  assert.equal(unlinked.ctl.canHear(), false);
  await flush();
  assert.equal(unlinked.calls.get, 0);
});

test('senses controller: on and ready -> canHear; a failure rests it for a minute, then it tries again', async () => {
  const c = controller({ settings: { homeBaseHear: true } });
  c.ctl.prime();
  await flush();
  assert.equal(c.calls.get, 1);
  assert.equal(c.ctl.canHear(), true);
  assert.equal(c.ctl.canSpeak(), false, 'voice is off on this device (and at the home base)');
  c.ctl.noteFailure('hear', 'timeout');
  assert.equal(c.ctl.canHear(), false, 'resting after a failure');
  c.advance(59000);
  assert.equal(c.ctl.canHear(), false);
  c.advance(2000);
  assert.equal(c.ctl.canHear(), true, 'tries the home base again after a minute');
  const r = await c.ctl.hear(new Uint8Array(44), { prompt: 'Jarvis' });
  assert.equal(r.ok, true);
  assert.equal(c.calls.hear, 1);
  // A failed hear rests it too.
  const bad = controller({ settings: { homeBaseHear: true }, hear: () => ({ ok: false, kind: 'unreachable' }) });
  bad.ctl.prime();
  await flush();
  assert.equal(bad.ctl.canHear(), true);
  await bad.ctl.hear(new Uint8Array(44));
  assert.equal(bad.ctl.canHear(), false);
  // An aborted one does not.
  const ab = controller({ settings: { homeBaseHear: true }, hear: () => ({ ok: false, kind: 'aborted' }) });
  ab.ctl.prime();
  await flush();
  await ab.ctl.hear(new Uint8Array(44));
  assert.equal(ab.ctl.canHear(), true);
});

test('senses controller: not ready at the home base (downloading, off there, no software) -> this device’s own', async () => {
  for (const hear of [
    { ...SENSES.hear, state: 'downloading', progress: 0.4 },
    { ...SENSES.hear, enabled: false },
    { ...SENSES.hear, state: 'error', error: 'download failed' },
  ]) {
    const c = controller({ settings: { homeBaseHear: true }, senses: { ...SENSES, hear } });
    c.ctl.prime();
    await flush();
    assert.equal(c.ctl.canHear(), false, JSON.stringify(hear));
  }
  const nodeps = controller({ settings: { homeBaseHear: true }, senses: { ...SENSES, deps: { installed: false } } });
  nodeps.ctl.prime();
  await flush();
  assert.equal(nodeps.ctl.canHear(), false);
  const old = controller({ settings: { homeBaseHear: true }, senses: () => ({ ok: false, kind: 'http', status: 404, code: 'not_found' }) });
  old.ctl.prime();
  await flush();
  assert.equal(old.ctl.getState().problem.state, 'old');
  assert.equal(old.ctl.canHear(), false);
});

test('senses controller: loads at most every 10 s, one at a time; watch() polls every 2 s while a model downloads', async () => {
  let n = 0;
  const c = controller({ settings: { homeBaseHear: true }, senses: () => ({ ok: true, senses: sensesView({ ...SENSES, hear: { ...SENSES.hear, state: n++ < 2 ? 'downloading' : 'ready', progress: 0.5 } }) }) });
  await Promise.all([c.ctl.load(), c.ctl.load()]);
  assert.equal(c.calls.get, 1, 'one at a time');
  await c.ctl.load();
  assert.equal(c.calls.get, 1, 'not again within 10 s');
  const stop = c.ctl.watch();
  await flush();
  assert.equal(c.calls.get, 2, 'watch() reads it at once');
  assert.equal(c.timers.at(-1).ms, 2000, 'and again in 2 s while it downloads');
  c.timers.at(-1).fn();
  await flush();
  assert.equal(c.calls.get, 3);
  assert.equal(c.ctl.getState().senses.hear.state, 'ready');
  const before = c.timers.length;
  stop();
  assert.equal(c.timers.length, before);
  // Linked elsewhere: what was known is forgotten.
  c.set({ homeBaseUrl: '' });
  assert.equal(c.ctl.getState().phase, 'unset');
  assert.equal(c.ctl.canHear(), false);
});

test('senses controller: save() PUTs and turning a part on again clears its rest', async () => {
  const c = controller({ settings: { homeBaseHear: true } });
  await c.ctl.load({ force: true });
  c.ctl.noteFailure('hear', 'unreachable');
  assert.equal(c.ctl.canHear(), false);
  await c.ctl.save({ hear: { enabled: true, model: 'small.en' } });
  assert.deepEqual(c.calls.put, [{ hear: { enabled: true, model: 'small.en' } }]);
  assert.equal(c.ctl.canHear(), true);
});

test('senses settings: two device settings, off by default, never in a backup', () => {
  const s = normalizeSettings({ homeBaseHear: true, homeBaseSpeak: 'yes' });
  assert.equal(s.homeBaseHear, true);
  assert.equal(s.homeBaseSpeak, false, 'only a boolean');
  assert.ok(!RESTORED_SETTINGS.includes('homeBaseHear') && !RESTORED_SETTINGS.includes('homeBaseSpeak'));
});

// ---- the hearing wrapper ------------------------------------------------------------------------------

function fakeStt() {
  const s = { calls: [], handles: [] };
  s.mod = {
    sttSupported: () => true,
    listenWaitMs: () => 1600,
    startListening: (opts) => {
      const h = { opts, stopped: 0, aborted: 0, stop() {
        this.stopped += 1;
      }, abort() {
        this.aborted += 1;
        setTimeout(() => opts.onEnd && opts.onEnd(), 0);
      } };
      s.calls.push(opts);
      s.handles.push(h);
      return h;
    },
  };
  return s;
}

function fakeCapture({ startResult = { ok: true } } = {}) {
  const c = { starts: 0, stops: 0, prepared: 0, port: null, opts: null, events: [] };
  c.create = (opts) => {
    c.opts = opts;
    return {
      supported: () => true,
      prepare: () => {
        c.prepared += 1;
        c.events.push('prepare');
        return true;
      },
      start: async (cfg) => {
        c.starts += 1;
        c.cfg = cfg;
        c.events.push('start');
        return startResult;
      },
      wordPort: () => {
        c.port = { onmessage: null, closed: false, close() {
          this.closed = true;
        }, start() {} };
        return c.port;
      },
      stop: () => {
        c.stops += 1;
        c.events.push('stop');
      },
    };
  };
  c.play = (x) => {
    for (let i = 0; i < x.length; i += 1280) if (c.port && c.port.onmessage) c.port.onmessage({ data: { type: 'frame', samples: x.slice(i, i + 1280) } });
  };
  return c;
}

function fakeSensesGate({ can = true, answers = [] } = {}) {
  const g = { can, hears: [], failures: [], answers: answers.slice() };
  g.api = {
    canHear: () => g.can,
    hear: async (wav, opts) => {
      g.hears.push({ wav, opts });
      const a = g.answers.length ? g.answers.shift() : { ok: true, text: 'What is the capital of France?', ms: 400 };
      const r = typeof a === 'function' ? await a(opts) : a;
      if (!r.ok && r.kind !== 'aborted') g.failures.push(r.kind);
      return r;
    },
    noteFailure: (w, k) => g.failures.push(`${w}:${k}`),
  };
  return g;
}

function listener() {
  const l = { finals: [], partials: [], errors: [], ends: 0, phases: [] };
  l.opts = {
    homeBase: true,
    onPartial: (t) => l.partials.push(t),
    onFinal: (t, info) => l.finals.push({ t, info }),
    onError: (e) => l.errors.push(e.code),
    onEnd: () => (l.ends += 1),
    onHomeBase: (i) => l.phases.push(i.reason ? `${i.phase}:${i.reason}` : i.phase),
  };
  return l;
}

function hearing({ gate, cap, stt, prompt = () => 'Jarvis, Frank' }) {
  return createHomeBaseHearing({ stt: stt.mod, senses: gate.api, createCapture: cap.create, getPrompt: prompt, getSettings: () => ({ listenWait: 'normal' }) });
}

test('hearing: without homeBase: true, or with it off, every listen is stt.js’s own, unchanged', async () => {
  const stt = fakeStt();
  const cap = fakeCapture();
  const off = fakeSensesGate({ can: false });
  const h = hearing({ gate: off, cap, stt });
  const l = listener();
  h.startListening(l.opts);
  assert.equal(stt.calls.length, 1);
  assert.ok(!('homeBase' in stt.calls[0]) && !('onHomeBase' in stt.calls[0]), 'stt.js gets exactly its own options');
  const on = fakeSensesGate({ can: true });
  const h2 = hearing({ gate: on, cap, stt });
  const plain = { lang: 'en-GB', onFinal() {} };
  h2.startListening(plain);
  assert.equal(stt.calls.length, 2, 'a listen that does not ask for the home base');
  assert.equal(stt.calls[1].lang, 'en-GB');
  assert.equal(cap.starts, 0, 'the home base path never ran');
  assert.equal(h2.sttSupported(), true, 'stt.js’s other exports are passed through');
});

test('hearing: on -> the microphone, the VAD, one WAV with the context words, and the words as the final', async () => {
  const stt = fakeStt();
  const cap = fakeCapture();
  const gate = fakeSensesGate();
  const h = hearing({ gate, cap, stt });
  const l = listener();
  const handle = h.startListening(l.opts);
  assert.deepEqual(l.phases, [], 'nothing inside startListening() itself');
  assert.equal(cap.prepared, 1, 'the AudioContext starts inside the tap');
  assert.equal(cap.opts.processed, true, 'the browser’s processed sound (echo cancellation, auto gain)');
  await flush();
  assert.equal(cap.starts, 1);
  assert.deepEqual(cap.cfg, { clap: false, word: true, sensitivity: 'normal' });
  cap.play(concat(room(0.4), speech(1.2), room(1.6)));
  await flush();
  assert.equal(gate.hears.length, 1);
  assert.equal(gate.hears[0].opts.prompt, 'Jarvis, Frank');
  assert.equal(gate.hears[0].opts.timeoutMs, 4000, 'slower than 4 s: the device takes over');
  const wav = decodeWav(gate.hears[0].wav);
  assert.equal(wav.sampleRate, 16000);
  assert.ok(wav.pcm.length / 16000 > 1.2 && wav.pcm.length / 16000 < 2.2);
  assert.deepEqual(l.finals, [{ t: 'What is the capital of France?', info: { alternatives: [], reason: 'silence', turn: 1 } }]);
  assert.equal(l.ends, 1);
  assert.deepEqual(l.phases, ['listening', 'speech', 'sending', 'heard', 'idle']);
  assert.ok(cap.stops >= 1, 'the microphone is released');
  assert.equal(stt.calls.length, 0, 'this device’s recognizer never ran');
  handle.abort();
  await flush();
  assert.equal(l.ends, 1, 'onEnd exactly once');
});

test('hearing: the home base unreachable or slower than 4 s -> this device’s recognizer takes the listen over', async () => {
  for (const [answer, reason] of [
    [{ ok: false, kind: 'unreachable' }, 'unreachable'],
    [{ ok: false, kind: 'timeout' }, 'slow'],
    [{ ok: false, kind: 'http', status: 500 }, 'error'],
  ]) {
    const stt = fakeStt();
    const cap = fakeCapture();
    const gate = fakeSensesGate({ answers: [answer] });
    const h = hearing({ gate, cap, stt });
    const l = listener();
    h.startListening({ ...l.opts, lang: 'en-US', keepListening: true });
    await flush();
    cap.play(concat(room(0.3), speech(1.0), room(1.5)));
    await flush();
    assert.ok(l.phases.includes(`fallback:${reason}`), `${reason}: ${l.phases.join(',')}`);
    assert.equal(stt.calls.length, 1, 'stt.js took over');
    assert.equal(stt.calls[0].lang, 'en-US');
    assert.equal(stt.calls[0].keepListening, true, 'with the same options');
    assert.ok(cap.events.lastIndexOf('stop') > cap.events.lastIndexOf('start'), 'the microphone was released first: never two captures at once');
    // The device's words come through as the listen's.
    stt.calls[0].onFinal('What is the capital of France?', { alternatives: ['what is the capital of france'], reason: 'silence', turn: 1 });
    assert.equal(l.finals.length, 1);
    assert.deepEqual(l.finals[0].info.alternatives, ['what is the capital of france']);
    stt.calls[0].onEnd();
    stt.calls[0].onEnd();
    assert.equal(l.ends, 1, 'onEnd once');
  }
});

test('hearing: keepListening hears the next utterance as turn 2 (the 2-second check); empty words change nothing', async () => {
  const stt = fakeStt();
  const cap = fakeCapture();
  const gate = fakeSensesGate({ answers: [{ ok: true, text: 'Set a timer for ten minutes.' }, { ok: true, text: '' }, { ok: true, text: 'Cancel.' }] });
  const h = hearing({ gate, cap, stt });
  const l = listener();
  const handle = h.startListening({ ...l.opts, keepListening: true });
  await flush();
  cap.play(concat(room(0.3), speech(1.0), room(1.5)));
  await flush();
  cap.play(concat(speech(0.4), room(1.5))); // a cough: no words
  await flush();
  cap.play(concat(speech(0.6), room(1.5)));
  await flush();
  assert.deepEqual(
    l.finals.map((f) => [f.t, f.info.turn]),
    [
      ['Set a timer for ten minutes.', 1],
      ['Cancel.', 2],
    ],
  );
  assert.equal(l.ends, 0, 'still listening');
  handle.abort();
  await flush();
  assert.equal(l.ends, 1);
  assert.ok(cap.stops >= 1);
});

test('hearing: stop() sends what was said so far; abort() delivers nothing; nothing for 10 s is no-speech', async () => {
  const stt = fakeStt();
  const cap = fakeCapture();
  const gate = fakeSensesGate({ answers: [{ ok: true, text: 'Turn on the lights' }] });
  const h = hearing({ gate, cap, stt });
  const l = listener();
  const handle = h.startListening(l.opts);
  await flush();
  cap.play(concat(room(0.3), speech(1.0)));
  handle.stop();
  await flush();
  assert.deepEqual(l.finals, [{ t: 'Turn on the lights', info: { alternatives: [], reason: 'stop', turn: 1 } }]);
  assert.equal(l.ends, 1);
  // stop() with nothing said: just the end.
  const l2 = listener();
  const h2 = h.startListening(l2.opts);
  await flush();
  h2.stop();
  await flush();
  assert.equal(l2.finals.length, 0);
  assert.equal(l2.ends, 1);
  // abort() while the words are on their way: nothing delivered.
  const slowGate = fakeSensesGate({ answers: [(opts) => new Promise((res) => opts.signal.addEventListener('abort', () => res({ ok: false, kind: 'aborted' })))] });
  const h3 = hearing({ gate: slowGate, cap, stt });
  const l3 = listener();
  const hd = h3.startListening(l3.opts);
  await flush();
  cap.play(concat(room(0.3), speech(1.0), room(1.5)));
  await flush();
  assert.equal(slowGate.hears.length, 1);
  hd.abort();
  await flush();
  assert.equal(l3.finals.length, 0);
  assert.equal(l3.ends, 1);
  assert.deepEqual(slowGate.failures, [], 'an abort is not the home base’s failure');
  // Nothing at all for 10 s: no-speech, as stt.js says it.
  const l4 = listener();
  h.startListening(l4.opts);
  await flush();
  cap.play(room(10.2));
  await flush();
  assert.deepEqual(l4.errors, ['no-speech']);
  assert.equal(l4.ends, 1);
});

test('hearing: the microphone not opening -> this device’s recognizer; a home base failure after stop() just ends', async () => {
  const stt = fakeStt();
  const cap = fakeCapture({ startResult: { ok: false, reason: 'denied' } });
  const gate = fakeSensesGate();
  const h = hearing({ gate, cap, stt });
  const l = listener();
  h.startListening(l.opts);
  await flush();
  assert.ok(l.phases.includes('fallback:mic'));
  assert.equal(stt.calls.length, 1);
  assert.deepEqual(gate.failures, [], 'not the home base’s fault: no rest');
  // Said "I'm done", and the home base then failed: nothing more is listened for.
  const stt2 = fakeStt();
  const cap2 = fakeCapture();
  const gate2 = fakeSensesGate({ answers: [{ ok: false, kind: 'timeout' }] });
  const h2 = hearing({ gate: gate2, cap: cap2, stt: stt2 });
  const l2 = listener();
  const hd = h2.startListening(l2.opts);
  await flush();
  cap2.play(concat(room(0.3), speech(0.8)));
  hd.stop();
  await flush();
  assert.ok(l2.phases.includes('fallback:slow'));
  assert.equal(stt2.calls.length, 0);
  assert.equal(l2.ends, 1);
});

// ---- the home base's voice engine ------------------------------------------------------------------------

test('voice engine: one request at a time, in order; a failure drains the queue as not-ready; cancel aborts', async () => {
  const gate = { log: [], failures: [], pending: [] };
  gate.speak = (args, opts) =>
    new Promise((resolve) => {
      gate.log.push(args.text);
      gate.pending.push({ resolve, opts });
      opts.signal.addEventListener('abort', () => resolve({ ok: false, kind: 'aborted' }));
    });
  gate.noteFailure = (w, k) => gate.failures.push(`${w}:${k}`);
  const eng = createHomeBaseVoiceEngine({ senses: gate });
  const a = eng.synth('One.', { voice: 'bm_george', speed: 1 });
  const b = eng.synth('Two.');
  const c = eng.synth('Three.');
  await flush();
  assert.deepEqual(gate.log, ['One.'], 'one at a time');
  gate.pending.shift().resolve({ ok: true, pcm: new Float32Array(24000), sampleRate: 24000 });
  const ra = await a.promise;
  assert.equal(ra.sampleRate, 24000);
  assert.ok(ra.synthMs >= 0);
  await flush();
  assert.deepEqual(gate.log, ['One.', 'Two.']);
  eng.cancel([c.id]);
  await assert.rejects(c.promise, (e) => e.code === 'cancelled');
  gate.pending.shift().resolve({ ok: false, kind: 'unreachable' });
  await assert.rejects(b.promise, (e) => e.code === 'not-ready');
  const d = eng.synth('Four.');
  const e = eng.synth('Five.');
  await flush();
  eng.cancel([d.id]);
  await assert.rejects(d.promise, (x) => x.code === 'cancelled');
  gate.pending.shift(); // d's request, aborted
  await flush();
  assert.deepEqual(gate.log.slice(-2), ['Four.', 'Five.'], 'the next one goes once the cancelled one is gone');
  gate.pending.shift().resolve({ ok: false, kind: 'timeout' });
  await assert.rejects(e.promise, (x) => x.code === 'not-ready');
  // Slower than real time over 3 s of audio: 'slow', and the home base rests.
  eng.noteTiming(4000, 3.2);
  assert.equal(eng.status().state, 'slow');
  assert.deepEqual(gate.failures, ['speak:slow']);
});

// ---- the voice router's ladder ------------------------------------------------------------------------

import { createFakeSpeech } from './platform.voice.fakeengine.test.mjs';
import { installClock, createFakeEngine, createFakeAudio } from './natural.fakes.mjs';

let loads = 0;
async function routerSetup(t, { settings = {}, hbFail, canSpeak = true, naturalState = 'ready' } = {}) {
  const clock = installClock();
  const speech = createFakeSpeech(clock, {}).install();
  const device = await import(`../../src/platform/voice/tts.js?senses=${++loads}`);
  const { createVoiceRouter } = await import(`../../src/platform/voice/voice-router.js?senses=${loads}`);
  const nEngine = createFakeEngine(clock, { rtf: 0.3, state: naturalState });
  const hEngine = createFakeEngine(clock, { rtf: 0.2, failOn: hbFail });
  const audio = createFakeAudio(clock);
  let s = { naturalVoice: false, naturalVoiceId: 'bm_george', homeBaseSpeak: true, ...settings };
  const hb = { engine: hEngine, audio, canSpeak: () => canSpeak, asked: 0 };
  const router = createVoiceRouter({ device, natural: { engine: nEngine, audio }, homebase: hb, getSettings: () => s });
  const errors = [];
  const consoleError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  t.after(() => {
    console.error = consoleError;
    speech.uninstall();
    clock.restore();
  });
  return { clock, speech, nEngine, hEngine, audio, router, hb, setSettings: (p) => (s = { ...s, ...p }) };
}

function rec() {
  const r = { chunks: [], ends: [], starts: 0 };
  r.opts = { onStart: () => (r.starts += 1), onChunk: (c) => r.chunks.push(c), onEnd: (e) => r.ends.push(e.reason) };
  return r;
}

test('router: with home base voice on and ready, the home base’s George speaks each sentence through the same audio path', async (t) => {
  const ctx = await routerSetup(t);
  const r = rec();
  const s = ctx.router.createSpeechStream(r.opts);
  s.append('Good evening, Frank. The kettle is on.\nShall I read the news?');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 5 * 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.ok(ctx.hEngine.requests.length >= 2, 'sentences fetched from the home base');
  assert.equal(ctx.hEngine.requests[0].voice, 'bm_george');
  assert.equal(ctx.nEngine.requests.length, 0, 'the on-device voice never ran');
  assert.equal(ctx.speech.submitted.length, 0, 'nor the built-in voice');
});

test('router: home base voice off, not ready or resting -> exactly as before (the device voice here)', async (t) => {
  for (const opt of [{ settings: { homeBaseSpeak: false } }, { canSpeak: false }]) {
    const ctx = await routerSetup(t, opt);
    const r = rec();
    const s = ctx.router.createSpeechStream(r.opts);
    s.append('Hello there.');
    s.finish();
    ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
    assert.deepEqual(r.ends, ['done']);
    assert.equal(ctx.hEngine.requests.length, 0, JSON.stringify(opt));
    assert.deepEqual(ctx.speech.completed(), ['Hello there.']);
  }
});

test('router: the home base failing mid-reply hands the rest to the on-device George when on, else the built-in voice', async (t) => {
  const ctx = await routerSetup(t, { settings: { naturalVoice: true }, hbFail: (job) => job.text.includes('broken') });
  const r = rec();
  const s = ctx.router.createSpeechStream(r.opts);
  s.append('This one is fine.\nThis one is broken.\nThis one would be fine too.\n');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 10 * 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(
    r.chunks.map((c) => c.text),
    ['This one is fine.', 'This one is broken.', 'This one would be fine too.'],
    'offsets stay offsets into text() across both switches',
  );
  assert.deepEqual(ctx.nEngine.completed, ['This one is broken.', 'This one would be fine too.'], 'on-device George said the rest');
  assert.equal(ctx.speech.submitted.length, 0);

  const ctx2 = await routerSetup(t, { hbFail: (job) => job.text.includes('broken') });
  const r2 = rec();
  const s2 = ctx2.router.createSpeechStream(r2.opts);
  s2.append('This one is fine.\nThis one is broken.\nThis one would be fine too.\n');
  s2.finish();
  ctx2.clock.runUntil(() => r2.ends.length > 0, 10 * 60_000);
  assert.deepEqual(r2.ends, ['done']);
  assert.deepEqual(ctx2.speech.completed(), ['This one is broken.', 'This one would be fine too.'], 'the built-in voice said the rest');
});

test('router: while the home base’s voice plays, the core follows its real output level', async (t) => {
  const ctx = await routerSetup(t);
  const r = rec();
  const s = ctx.router.createSpeechStream(r.opts);
  s.append('A rather long sentence for the level meter to follow along with.');
  s.finish();
  ctx.clock.runUntil(() => r.starts > 0, 60_000);
  assert.equal(ctx.router.activeEngine(), 'homebase');
  assert.equal(typeof ctx.router.getOutputLevel(), 'number');
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.equal(ctx.router.getOutputLevel(), null);
});
