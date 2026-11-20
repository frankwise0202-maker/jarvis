// The voice router (platform/voice/voice-router.js): one tts.js-shaped API over the device voice
// (the real tts.js on the fake speechSynthesis of platform.voice.fakeengine.test.mjs) and the
// natural voice (fake worker engine and fake audio clock): which engine speaks, the wait for a
// loading engine, and the mid-stream handoff to the device voice with offsets kept intact.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSpeech } from './platform.voice.fakeengine.test.mjs';
import { installClock, createFakeEngine, createFakeAudio } from './natural.fakes.mjs';

let loads = 0;

async function setup(t, { natural = true, state = 'ready', rtf = 0.3, failOn, settings = {} } = {}) {
  const clock = installClock();
  const speech = createFakeSpeech(clock, {}).install();
  const device = await import(`../../src/platform/voice/tts.js?router=${++loads}`);
  const { createVoiceRouter } = await import(`../../src/platform/voice/voice-router.js?router=${loads}`);
  const engine = createFakeEngine(clock, { rtf, failOn, state });
  const audio = createFakeAudio(clock);
  let s = { naturalVoice: natural, naturalVoiceId: 'bm_fable', ...settings };
  const router = createVoiceRouter({ device, natural: { engine, audio }, getSettings: () => s });
  const errors = [];
  const consoleError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  t.after(() => {
    console.error = consoleError;
    speech.uninstall();
    clock.restore();
  });
  return { clock, speech, device, engine, audio, router, errors, setSettings: (p) => (s = { ...s, ...p }) };
}

function recorder() {
  const r = { log: [], chunks: [], boundaries: [], ends: [], starts: 0, idles: 0 };
  r.opts = {
    onStart: () => {
      r.starts += 1;
      r.log.push('start');
    },
    onChunk: (c) => {
      r.chunks.push(c);
      r.log.push(`chunk:${c.text}`);
    },
    onBoundary: (b) => r.boundaries.push(b),
    onIdle: () => {
      r.idles += 1;
      r.log.push('idle');
    },
    onEnd: (e) => {
      r.ends.push(e.reason);
      r.log.push(`end:${e.reason}`);
    },
  };
  return r;
}

test('router: with the natural voice off, streams and speak() go to the device voice exactly as before', async (t) => {
  const ctx = await setup(t, { natural: false });
  const r = recorder();
  const s = ctx.router.createSpeechStream(r.opts);
  s.append('Hello there, sir. ');
  assert.deepEqual(ctx.speech.submitted.map((x) => x.text), ['Hello there, sir.'], 'queued synchronously in speechSynthesis');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.engine.requests.length, 0);
  const r2 = recorder();
  ctx.router.speak('A one-off sentence.', r2.opts);
  assert.equal(ctx.speech.submitted.at(-1).text, 'A one-off sentence.', 'tts.speak() starts synchronously (iOS gesture)');
  ctx.clock.runUntil(() => r2.ends.length > 0, 60_000);
  assert.deepEqual(r2.ends, ['done']);
  assert.equal(ctx.router.getOutputLevel(), null);
  assert.equal(ctx.router.activeEngine(), null);
});

test('router: a ready natural voice speaks the stream (with the chosen Kokoro voice) and reports a real output level', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.router.createSpeechStream({ ...r.opts, rate: 1.1 });
  s.append('Good evening, sir. All systems are online.\nShall I read the briefing? ');
  ctx.clock.runUntil(() => r.chunks.length > 0, 30_000);
  assert.equal(ctx.router.activeEngine(), 'natural');
  assert.equal(ctx.router.isSpeaking(), true);
  assert.ok(ctx.router.getOutputLevel() > 0);
  const bands = new Float32Array(8);
  assert.equal(ctx.router.getOutputBands(bands), true);
  assert.ok(bands[0] > 0);
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.speech.submitted.length, 0, 'the device voice said nothing');
  assert.ok(ctx.engine.requests.every((q) => q.voice === 'bm_fable' && q.speed === 1.1));
  assert.deepEqual(r.chunks.map((c) => c.text).join(' '), s.text());
  for (const c of r.chunks) assert.equal(s.text().slice(c.start, c.end), c.text);
  assert.equal(r.starts, 1);
  assert.equal(ctx.router.getOutputLevel(), null, 'nothing playing');
});

test('router: when the natural voice turns out slower than real time, the device voice says the rest; offsets stay offsets into text()', async (t) => {
  const ctx = await setup(t, { rtf: 1.7 });
  const r = recorder();
  const s = ctx.router.createSpeechStream(r.opts);
  const text = [
    'This is the first sentence of a longer reply.',
    'Here comes the second sentence, a bit longer than the first one was.',
    'A third sentence follows it.',
    'Then a fourth line.',
    'And finally the fifth.',
  ];
  s.append(text.slice(0, 3).join(' ') + '\n');
  ctx.clock.advance(3000);
  s.append(text.slice(3).join('\n'));
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 10 * 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.engine.status().state, 'slow');
  assert.ok(ctx.speech.completed().length > 0, 'the device voice took over');
  const full = s.text();
  assert.equal(full, text.join(' '));
  // Every chunk the router reported indexes into the router's text, in order, without overlap.
  let at = 0;
  for (const c of r.chunks) {
    assert.equal(full.slice(c.start, c.end), c.text, `chunk offsets: ${c.text}`);
    assert.ok(c.start >= at, 'in order, no repeats');
    at = c.end;
  }
  assert.equal(r.chunks.map((c) => c.text).join(' '), full, 'all of it, once');
  assert.equal(r.starts, 1);
  assert.equal(s.spokenUpTo(), full.length);
  // The device voice kept the line breaks: its chunks never cross them.
  for (const u of ctx.speech.completed()) assert.ok(!/fourth line\. And/.test(u), `no chunk across a line break: ${u}`);
  for (const b of r.boundaries) assert.ok(b.charIndex >= 0 && b.charIndex < full.length);
});

test('router: a chunk that fails twice hands the rest to the device voice', async (t) => {
  const ctx = await setup(t, { failOn: (job) => job.text.includes('broken') });
  const r = recorder();
  const s = ctx.router.createSpeechStream(r.opts);
  s.append('This one is fine.\nThis one is broken.\nThis one would be fine too.\n');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 10 * 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(r.chunks.map((c) => c.text), ['This one is fine.', 'This one is broken.', 'This one would be fine too.']);
  assert.deepEqual(ctx.speech.completed(), ['This one is broken.', 'This one would be fine too.']);
});

test('router: a loading engine is waited for (up to 4 s); in time -> natural, too late -> device voice', async (t) => {
  const ctx = await setup(t, { state: 'loading' });
  const r = recorder();
  const s = ctx.router.createSpeechStream(r.opts);
  s.append('Waiting for the engine. ');
  ctx.clock.advance(1500);
  assert.equal(ctx.speech.submitted.length + ctx.engine.requests.length, 0, 'buffered while it loads');
  ctx.engine.setState('ready');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.engine.completed, ['Waiting for the engine.']);

  const ctx2 = await setup(t, { state: 'loading' });
  const r2 = recorder();
  const s2 = ctx2.router.createSpeechStream(r2.opts);
  s2.append('The engine is too slow to load. ');
  ctx2.clock.advance(4100);
  assert.deepEqual(ctx2.speech.submitted.map((x) => x.text), ['The engine is too slow to load.']);
  ctx2.engine.setState('ready');
  s2.finish();
  ctx2.clock.runUntil(() => r2.ends.length > 0, 60_000);
  assert.deepEqual(r2.ends, ['done']);
  assert.equal(ctx2.engine.requests.length, 0);
});

test('router: unlockSpeech() unlocks both engines and starts a stopped natural engine; slow or failed engines are skipped at once', async (t) => {
  const ctx = await setup(t, { state: 'off' });
  ctx.router.unlockSpeech();
  assert.equal(ctx.audio.unlocked, 1);
  assert.equal(ctx.engine.started, 1);
  for (const state of ['slow', 'error']) {
    const c = await setup(t, { state });
    const r = recorder();
    const s = c.router.createSpeechStream(r.opts);
    s.append('Straight to the device voice. ');
    assert.deepEqual(c.speech.submitted.map((x) => x.text), ['Straight to the device voice.'], state);
    s.cancel();
  }
});

test('router: a new stream cancels the previous one across engines; stopSpeaking() and isSpeaking() cover both', async (t) => {
  const ctx = await setup(t);
  const r1 = recorder();
  const s1 = ctx.router.createSpeechStream(r1.opts);
  s1.append('A natural sentence that plays for a while. ');
  ctx.clock.runUntil(() => r1.chunks.length > 0, 30_000);
  ctx.setSettings({ naturalVoice: false });
  const r2 = recorder();
  const s2 = ctx.router.createSpeechStream(r2.opts);
  assert.deepEqual(r1.ends, ['cancelled']);
  assert.ok(ctx.audio.played.every((p) => p.stopped || p.when + p.duration <= ctx.audio.now()), 'natural audio stopped');
  s2.append('Now the device voice. ');
  ctx.clock.advance(500);
  assert.equal(ctx.router.isSpeaking(), true);
  ctx.router.stopSpeaking();
  assert.deepEqual(r2.ends, ['cancelled']);
  assert.equal(ctx.router.isSpeaking(), false);
  for (const r of [r1, r2]) assert.equal(r.ends.length, 1);
});

test('router: speak() with the natural voice on chunks the whole text and ends once', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const h = ctx.router.speak('Good morning, sir. It is a quarter past seven. The coffee is ready.', r.opts);
  assert.equal(typeof h.cancel, 'function');
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.speech.submitted.length, 0);
  assert.equal(r.chunks.map((c) => c.text).join(' '), 'Good morning, sir. It is a quarter past seven. The coffee is ready.');
});

test('router: a device known to be too slow (saved verdict) speaks with the device voice without starting the engine', async (t) => {
  const ctx = await setup(t, { state: 'off' });
  ctx.engine.knownSlow = () => true;
  ctx.router.unlockSpeech();
  assert.equal(ctx.engine.started, 0, 'no 120 MB engine start for nothing');
  const r = recorder();
  const s = ctx.router.createSpeechStream(r.opts);
  s.append('Straight to the device voice. ');
  assert.deepEqual(ctx.speech.submitted.map((x) => x.text).filter(Boolean), ['Straight to the device voice.'], '(the empty one is the iOS unlock)');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);
});
