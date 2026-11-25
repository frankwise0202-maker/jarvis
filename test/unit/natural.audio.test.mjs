// The natural voice's audio output (natural/audio-out.js) on a fake AudioContext, the pure
// helpers of the stream (silence trimming, word timing) and the download catalog.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioOut, bandBins, bandEdges, bandsFromDb, levelFromSamples, BAND_COUNT } from '../../src/platform/voice/natural/audio-out.js';
import { trimSilence, estimateWords, speedFor } from '../../src/platform/voice/natural/natural-stream.js';
import { MODEL, RUNTIME, VOICES, DEFAULT_VOICE, downloadPlan, formatMegabytes, voiceById, voiceLabel, sourceConfig } from '../../src/platform/voice/natural/catalog.js';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fakeContextClass(log) {
  return class FakeAudioContext {
    constructor(opts) {
      log.push(['new', opts]);
      this.sampleRate = (opts && opts.sampleRate) || 48000;
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = { kind: 'destination' };
      this.outputLatency = 0.012;
    }
    resume() {
      this.state = 'running';
      log.push(['resume']);
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
    }
    createGain() {
      return { connect: (n) => log.push(['gain->', n.kind || 'node']), kind: 'gain' };
    }
    createAnalyser() {
      const a = {
        kind: 'analyser',
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        get frequencyBinCount() {
          return a.fftSize / 2;
        },
        connect: (n) => log.push(['analyser->', n.kind]),
        getFloatFrequencyData: (arr) => arr.fill(-60),
        getFloatTimeDomainData: (arr) => arr.fill(0.1),
      };
      return a;
    }
    createBuffer(ch, length, sampleRate) {
      const data = new Float32Array(length);
      return { length, sampleRate, duration: length / sampleRate, copyToChannel: (src) => data.set(src), getChannelData: () => data, data };
    }
    createBufferSource() {
      const src = {
        buffer: null,
        connect: (n) => log.push(['src->', n.kind || 'destination']),
        disconnect() {},
        start: (when) => log.push(['start', when]),
        stop: () => {
          log.push(['stop']);
          if (src.onended) src.onended();
        },
        onended: null,
      };
      return src;
    }
  };
}

test('audio out: one 24 kHz context, gain -> analyser -> speakers; unlock() resumes it in the gesture and asks iOS for playback', () => {
  const log = [];
  const nav = { audioSession: { type: 'auto' } };
  const out = createAudioOut({ AudioContextImpl: fakeContextClass(log), scope: { navigator: nav }, idleSuspendMs: 0 });
  assert.equal(out.supported(), true);
  assert.equal(out.unlock(), true);
  assert.deepEqual(log[0], ['new', { sampleRate: 24000, latencyHint: 'interactive' }]);
  assert.ok(log.some((e) => e[0] === 'resume'));
  assert.ok(log.some((e) => e[0] === 'gain->' && e[1] === 'analyser') && log.some((e) => e[0] === 'analyser->' && e[1] === 'destination'));
  assert.equal(nav.audioSession.type, 'playback', 'Web Audio is not silenced by the ring/silent switch');
  assert.equal(out.context.sampleRate, 24000);
  assert.equal(out.latency(), 0.012);
});

test('audio out: play() schedules at the given time (never in the past); level/bands only while something plays; stopAll()', () => {
  const log = [];
  const out = createAudioOut({ AudioContextImpl: fakeContextClass(log), scope: {}, idleSuspendMs: 0 });
  out.unlock();
  out.context.currentTime = 5;
  const h1 = out.play(new Float32Array(24000), 24000, 4);
  assert.equal(h1.when, 5, 'not in the past');
  assert.equal(h1.duration, 1);
  const h2 = out.play(new Float32Array(12000), 24000, 6.14);
  assert.equal(h2.when, 6.14);
  assert.ok(log.some((e) => e[0] === 'start' && e[1] === 6.14));
  assert.equal(out.busy(), true);
  assert.ok(out.level() > 0);
  const bands = new Float32Array(BAND_COUNT);
  out.bands(bands);
  assert.ok(bands.every((b) => Math.abs(b - 0.5) < 1e-6), '−60 dB is halfway between −90 and −30');
  out.stopAll();
  assert.equal(out.busy(), false);
  assert.equal(out.level(), 0);
  out.bands(bands);
  assert.ok(bands.every((b) => b === 0));
});

test('audio out: kick() (v7.8.1) resumes a suspended context, suspends and resumes one that says it runs with its clock stopped (iOS), and never throws', async () => {
  const log = [];
  const nav = { audioSession: { type: 'auto' } };
  const out = createAudioOut({ AudioContextImpl: fakeContextClass(log), scope: { navigator: nav }, idleSuspendMs: 0 });
  assert.equal(out.kick(), false, 'no context yet: nothing to kick');
  out.unlock();
  const ctx = out.context;
  // Suspended (an interruption, a context never unlocked): resumed, with the playback session asked again.
  ctx.state = 'suspended';
  nav.audioSession.type = 'auto';
  log.length = 0;
  assert.equal(out.kick(), true);
  assert.deepEqual(log, [['resume']]);
  assert.equal(nav.audioSession.type, 'playback');
  // Says it runs, but its clock stopped: suspended, then resumed.
  const calls = [];
  const suspend = ctx.suspend.bind(ctx);
  ctx.suspend = () => {
    calls.push('suspend');
    return suspend();
  };
  ctx.state = 'running';
  log.length = 0;
  out.kick();
  assert.deepEqual(calls, ['suspend']);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(log, [['resume']], 'resumed once suspended');
  assert.equal(ctx.state, 'running');
  // Refusals and exceptions are swallowed.
  ctx.suspend = () => {
    throw new Error('InvalidStateError');
  };
  ctx.resume = () => {
    throw new Error('InvalidStateError');
  };
  assert.doesNotThrow(() => out.kick());
  ctx.state = 'suspended';
  ctx.resume = () => Promise.reject(new Error('NotAllowedError'));
  assert.doesNotThrow(() => out.kick());
  await new Promise((r) => setTimeout(r, 0));
});

test('audio out: revive() (v7.8.1 integrator, inside a tap for a stuck output) suspends and resumes the stuck context, closes it, and makes and starts a fresh one in the same call; never throws', async () => {
  const log = [];
  const nav = { audioSession: { type: 'auto' } };
  const out = createAudioOut({ AudioContextImpl: fakeContextClass(log), scope: { navigator: nav }, idleSuspendMs: 0 });
  assert.equal(out.revive(), true, 'no context yet: the same as unlock()');
  const first = out.context;
  assert.equal(first.state, 'running');
  // It says it runs (its clock stopped): suspended, resumed, closed; a fresh 24 kHz context started at once.
  const calls = [];
  first.suspend = () => {
    calls.push('suspend');
    return Promise.resolve();
  };
  first.resume = () => {
    calls.push('resume');
    return Promise.reject(new Error('InvalidStateError: closed')); // WebKit: the close won (swallowed)
  };
  first.close = () => {
    calls.push('close');
    first.state = 'closed';
    return Promise.reject(new Error('InvalidStateError')); // swallowed too
  };
  log.length = 0;
  nav.audioSession.type = 'auto';
  assert.equal(out.revive(), true);
  assert.deepEqual(calls, ['suspend', 'resume', 'close']);
  const second = out.context;
  assert.notEqual(second, first, 'a fresh context');
  assert.equal(second.state, 'running', 'started inside the call (the tap)');
  assert.deepEqual(log.filter((e) => e[0] === 'new' || e[0] === 'resume' || e[0] === 'start'), [['new', { sampleRate: 24000, latencyHint: 'interactive' }], ['resume'], ['start', 0]], 'made, resumed, one silent frame');
  assert.equal(nav.audioSession.type, 'playback');
  // Plays on the fresh one.
  const h = out.play(new Float32Array(2400), 24000, 0.5);
  assert.equal(h.when, 0.5);
  await new Promise((r) => setTimeout(r, 0)); // the rejected promises above were caught
  // A browser that can't make a context any more: false, no exception.
  const broken = createAudioOut({
    AudioContextImpl: class {
      constructor() {
        throw new Error('NotSupportedError');
      }
    },
    scope: {},
  });
  assert.doesNotThrow(() => broken.revive());
  assert.equal(broken.revive(), false);
});

test('audio out: probe() (v7.8.1 integrator, outside a tap) kicks a stuck output and lets it idle-suspend as usual; nothing without a context', async () => {
  const log = [];
  const nav = { audioSession: { type: 'auto' } };
  const out = createAudioOut({ AudioContextImpl: fakeContextClass(log), scope: { navigator: nav }, idleSuspendMs: 30 });
  assert.equal(out.probe(), false, 'no context: nothing to ask');
  out.unlock();
  const ctx = out.context;
  ctx.state = 'suspended'; // stuck after a stall; the cause has gone, so a resume() works again
  log.length = 0;
  assert.equal(out.probe(), true);
  assert.deepEqual(log, [['resume']]);
  assert.equal(ctx.state, 'running', 'running again: its clock can move');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(ctx.state, 'suspended', 'then our own idle suspend, as after any reply (nothing plays)');
});

test('audio out (v7.8.1 integrator, L1): a play() while our own idle suspend is still landing (WebKit reads "running" until it has) resumes the context, and again once the suspend has landed', async () => {
  const log = [];
  const out = createAudioOut({ AudioContextImpl: fakeContextClass(log), scope: {}, idleSuspendMs: 10 });
  out.unlock();
  const ctx = out.context;
  let land = null;
  ctx.suspend = () => {
    log.push(['suspend']);
    return new Promise((resolve) => {
      land = () => {
        ctx.state = 'suspended';
        resolve();
      };
    });
  };
  const first = out.play(new Float32Array(240), 24000, 0);
  first.stop(); // the reply ended: the idle suspend is armed
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(land, 'our idle suspend was asked');
  assert.equal(ctx.state, 'running', 'WebKit: still reads running while it lands');
  log.length = 0;
  out.play(new Float32Array(2400), 24000, 0.1); // the next reply's first chunk, in that window
  assert.deepEqual(log.filter((e) => e[0] === 'resume'), [['resume']], 'resumed although it reads running');
  land();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(log.filter((e) => e[0] === 'resume').length, 2, 'and again once the suspend landed under the live chunk');
  assert.equal(ctx.state, 'running');
});

test('audio math: 8 log bands from 100 Hz to 4 kHz, each with at least one FFT bin; dB and RMS mappings', () => {
  const edges = bandEdges();
  assert.equal(edges.length, 9);
  assert.ok(Math.abs(edges[0] - 100) < 1e-9 && Math.abs(edges[8] - 4000) < 1e-9);
  for (const [sr, fft] of [[24000, 512], [48000, 512], [44100, 512]]) {
    const ranges = bandBins(sr, fft);
    assert.equal(ranges.length, 8);
    for (const [from, to] of ranges) assert.ok(to > from && from >= 0 && to <= fft / 2, `${sr}: [${from}, ${to})`);
  }
  const db = new Float32Array(256).fill(-90);
  const out = new Float32Array(8);
  bandsFromDb(db, bandBins(24000, 512), out);
  assert.ok(out.every((v) => v === 0));
  db.fill(-20);
  bandsFromDb(db, bandBins(24000, 512), out);
  assert.ok(out.every((v) => v === 1));
  db.fill(-Infinity);
  bandsFromDb(db, bandBins(24000, 512), out);
  assert.ok(out.every((v) => v === 0), '-Infinity (silence) is the floor');
  assert.equal(levelFromSamples(new Float32Array(64)), 0);
  assert.ok(Math.abs(levelFromSamples(new Float32Array(64).fill(0.1)) - 0.75) < 1e-6, '−20 dBFS -> 0.75');
  assert.equal(levelFromSamples(new Float32Array(64).fill(1)), 1);
});

test('stream helpers: silence is trimmed to 20 ms before and 50 ms after the voice; word times follow length and punctuation', () => {
  const sr = 24000;
  const pcm = new Float32Array(sr); // 1 s: voice from 0.3 s to 0.6 s
  for (let i = Math.round(0.3 * sr); i < Math.round(0.6 * sr); i++) pcm[i] = 0.3;
  const cut = trimSilence(pcm, sr);
  assert.equal(cut.from, Math.round(0.28 * sr));
  assert.equal(cut.to, Math.round(0.65 * sr));
  assert.equal(cut.voicedFrom, Math.round(0.02 * sr));
  assert.equal(cut.voicedTo, Math.round(0.32 * sr));
  assert.deepEqual(trimSilence(new Float32Array(100), sr), { from: 0, to: 100, voicedFrom: 0, voicedTo: 100, silent: true });
  const text = 'Good evening, sir. Systems online.';
  const words = estimateWords(text, 1, 3);
  assert.deepEqual(words.map((w) => text.slice(w.ci, w.ci + w.len)), ['Good', 'evening,', 'sir.', 'Systems', 'online.']);
  assert.equal(words[0].at, 1);
  for (let i = 1; i < words.length; i++) assert.ok(words[i].at > words[i - 1].at);
  assert.ok(words.at(-1).at < 3);
  // A word's time is its length plus the pause its punctuation brings: "two." takes longer than "one".
  const w2 = estimateWords('one two. six ten', 0, 1);
  assert.ok(w2[2].at - w2[1].at > 1.9 * (w2[1].at - w2[0].at));
  assert.ok(Math.abs(w2[3].at - w2[2].at - (w2[1].at - w2[0].at)) < 1e-9, 'same length, no punctuation: same time');
  assert.equal(speedFor(0.7), 0.7);
  assert.equal(speedFor(9), 2);
  assert.equal(speedFor(undefined), 1);
});

test('catalog: the ONNX Runtime binary the build copies has the pinned size and SHA-256 (the worker checks both, v7.1)', () => {
  // Resolved as scripts/build.mjs does: the onnxruntime-web that transformers.js uses.
  const require = createRequire(path.join(ROOT, 'node_modules', '@huggingface', 'transformers', 'package.json'));
  let file = null;
  try {
    file = path.join(path.dirname(require.resolve('onnxruntime-web')), RUNTIME.wasm);
  } catch {
    file = null;
  }
  if (!file || !existsSync(file)) return; // no node_modules (the build would fail anyway)
  const bin = readFileSync(file);
  assert.equal(bin.length, RUNTIME.bytes, `${file}: update RUNTIME.bytes with onnxruntime-web`);
  assert.equal(createHash('sha256').update(bin).digest('hex'), RUNTIME.sha256, `${file}: update RUNTIME.sha256 with onnxruntime-web`);
});

test('catalog: pinned model, British voices first, download sizes', () => {
  assert.equal(MODEL.revision.length, 40);
  assert.equal(DEFAULT_VOICE, 'bm_george');
  assert.deepEqual(VOICES.slice(0, 4).map((v) => v.id), ['bm_george', 'bm_fable', 'bm_lewis', 'bm_daniel']);
  assert.ok(VOICES.slice(0, 8).every((v) => v.accent === 'British'));
  assert.equal(voiceLabel(voiceById('bm_fable')), 'Fable — British male (grade C)');
  const plan = downloadPlan();
  assert.equal(plan.bytes, 44 + 3497 + 113 + 92361116 + 522240 + RUNTIME.bytes + RUNTIME.workerBytes);
  assert.equal(formatMegabytes(plan.bytes), '117 MB');
  assert.equal(formatMegabytes(downloadPlan({ dtype: 'fp32' }).bytes), '350 MB');
  const self = sourceConfig('self', { base: 'https://owner.github.io/jarvis/index.html' });
  assert.equal(self.remoteHost, 'https://owner.github.io/jarvis/models/');
  assert.equal(self.wasmBase, 'https://owner.github.io/jarvis/voice/ort/');
  assert.deepEqual(self.allowOrigins, ['https://owner.github.io']);
  const hf = sourceConfig('hf', { base: 'https://owner.github.io/jarvis/' });
  assert.deepEqual(hf.allowOrigins, ['https://owner.github.io', 'https://huggingface.co']);
  assert.deepEqual(hf.allowHostSuffixes, ['.hf.co']);
});
