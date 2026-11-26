// v8.1 (SPEC §26 note, §28.1, A3): George and the Mac's own voice never hang while Jarvis is in the
// background on a computer. Both voices' watchdogs counted only visible time (iOS pauses speech and Web Audio
// in the background), so on a Mac a reply whose 'end' was lost, or whose audio clock stopped, while hidden
// never ended: Voice Mode neither listened nor slept. app.js now calls setPausesWhenHidden(phoneLike) on both
// modules: on a computer hidden time counts (George's watchdog at most 1 s a tick, a hidden page's timers
// running once a second), on an iPhone nothing changes.
//
// Fakes: the virtual clock and voices of natural.fakes.mjs, the fake speechSynthesis of
// platform.voice.fakeengine.test.mjs (with playsHidden: speech goes on in the background, as on a Mac).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock, createFakeEngine, createFakeAudio } from './natural.fakes.mjs';
import { createFakeSpeech } from './platform.voice.fakeengine.test.mjs';
import { createHomeBaseVoiceEngine } from '../../src/platform/voice/homebase-voice.js';

let loads = 0;
const TICK = 40;
const TEXT = 'Good evening, sir. The forecast for tonight is mild, with light rain after six and a clear morning. Your three o’clock moved to Thursday, and the lab inspection is at four. Shall I read the rest of the briefing?';

function fakeDocument() {
  const doc = new EventTarget();
  doc.hidden = false;
  doc.visibilityState = 'visible';
  doc.setHidden = (hidden) => {
    doc.hidden = !!hidden;
    doc.visibilityState = hidden ? 'hidden' : 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return doc;
}

// ---- George (natural-stream.js): the stall watchdog ------------------------------------------------------

async function stream(t, { computer }) {
  const clock = installClock();
  const doc = fakeDocument();
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  const engine = createFakeEngine(clock, { rtf: 0.4 });
  const audio = createFakeAudio(clock);
  const mod = await import(`../../src/platform/voice/natural/natural-stream.js?hidden=${++loads}`);
  if (computer !== undefined) mod.setPausesWhenHidden(!computer);
  const handoffs = [];
  const deps = { engine, audio, voice: 'bm_george', onHandoff: (h) => handoffs.push({ ...h, at: clock.now }) };
  const r = { chunks: [], boundaries: [], ends: [] };
  const s = mod.createNaturalStream(deps, { onChunk: (c) => r.chunks.push(c), onBoundary: (b) => r.boundaries.push(b), onEnd: (e) => r.ends.push(e.reason) });
  t.after(() => {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
    clock.restore();
  });
  s.append(TEXT);
  s.finish();
  return { clock, doc, audio, handoffs, r, s };
}

test('George on a computer, hidden: a clock that stops hands what wasn’t heard to the device voice after 3.5 s, as on screen', async (t) => {
  const ctx = await stream(t, { computer: true });
  ctx.clock.runUntil(() => ctx.r.boundaries.length >= 3, 30_000);
  ctx.doc.setHidden(true);
  ctx.audio.suspend();
  const stoppedAt = ctx.clock.now;
  ctx.clock.runUntil(() => ctx.handoffs.length > 0, 30_000);
  const took = ctx.handoffs[0].at - stoppedAt;
  assert.ok(took >= 3500 && took <= 3500 + 3 * TICK, `handed over ${took} ms after the clock stopped`);
  assert.equal(ctx.handoffs[0].reason, 'stall');
  assert.equal(ctx.audio.kicks, 1, 'kicked once on the way');
  assert.equal(ctx.handoffs[0].from, ctx.r.boundaries.at(-2).charIndex, 'from what wasn’t heard (the word before the last boundary, as on screen)');
});

test('George on a computer, hidden, the page’s timers once a second: handed over in about 4 s (1 s a tick), not 14 s', async (t) => {
  const ctx = await stream(t, { computer: true });
  ctx.clock.runUntil(() => ctx.r.boundaries.length >= 2, 30_000);
  ctx.doc.setHidden(true);
  ctx.audio.suspend();
  let ticks = 0;
  while (!ctx.handoffs.length && ticks < 40) {
    ctx.clock.block(1000); // a hidden page: one tick a second
    ticks += 1;
  }
  assert.equal(ctx.handoffs.length, 1);
  assert.ok(ticks >= 4 && ticks <= 5, `${ticks} ticks of 1 s`);
});

test('George on a computer, hidden, playing normally (late ticks, the clock moving): no kick, no handover, the reply ends', async (t) => {
  const ctx = await stream(t, { computer: true });
  ctx.clock.runUntil(() => ctx.r.boundaries.length >= 1, 30_000);
  ctx.doc.setHidden(true);
  for (let i = 0; i < 12; i++) ctx.clock.block(1000);
  ctx.clock.runUntil(() => ctx.r.ends.length > 0, 120_000);
  assert.deepEqual(ctx.r.ends, ['done']);
  assert.deepEqual(ctx.handoffs, []);
  assert.equal(ctx.audio.kicks, 0);
});

test('George on an iPhone (setPausesWhenHidden(true), and the default): hidden never counts; back in view, 3.5 s from the return', async (t) => {
  for (const computer of [false, undefined]) {
    const ctx = await stream(t, { computer });
    ctx.clock.runUntil(() => ctx.r.boundaries.length >= 3, 30_000);
    ctx.doc.setHidden(true);
    ctx.audio.suspend();
    ctx.clock.advance(60_000);
    assert.deepEqual(ctx.handoffs, [], `a minute hidden: nothing (computer: ${computer})`);
    assert.equal(ctx.audio.kicks, 0);
    ctx.doc.setHidden(false);
    const shownAt = ctx.clock.now;
    ctx.clock.runUntil(() => ctx.handoffs.length > 0, 10_000);
    const took = ctx.handoffs[0].at - shownAt;
    assert.ok(took >= 3500 && took <= 3500 + 2 * TICK, `handed over ${took} ms after the page came back`);
  }
});

// ---- the Mac's own voice (tts.js): its watchdogs ------------------------------------------------------------

async function device(t, config = {}, { computer } = {}) {
  const clock = installClock();
  const fake = createFakeSpeech(clock, config).install();
  const tts = await import(`../../src/platform/voice/tts.js?hidden=${++loads}`);
  if (computer !== undefined) tts.setPausesWhenHidden(!computer);
  t.after(() => {
    fake.uninstall();
    clock.restore();
  });
  const r = { ends: [], endT: -1 };
  const opts = {
    onEnd: (e) => {
      r.ends.push(e.reason);
      r.endT = clock.now;
    },
  };
  return { clock, fake, tts, r, opts };
}

const ONE = 'A single sentence whose end event never comes.';

test('the Mac’s own voice on a computer, hidden: a reply whose end is lost still ends, on the same time-out as on screen', async (t) => {
  const ctx = await device(t, { playsHidden: true, boundaries: false, quirks: { stuckSpeaking: true, dropEnd: () => true } }, { computer: true });
  ctx.fake.setHidden(true);
  ctx.tts.speak(ONE, ctx.opts);
  ctx.clock.runUntil(() => ctx.r.ends.length > 0, 60_000);
  assert.deepEqual(ctx.r.ends, ['done'], 'ended while still hidden');
  assert.ok(ctx.fake.hidden, 'the page is still hidden');
  const timeout = Math.max(4000, 2.5 * (ONE.length / 15) * 1000 + 1500);
  const fromStart = ctx.r.endT - ctx.fake.audio[0].startT;
  assert.ok(fromStart >= timeout && fromStart <= timeout + 600, `${fromStart} ms from its start (time-out ${timeout} ms)`);
});

test('the Mac’s own voice on a computer, hidden: a whole reply plays and ends normally, every chunk once', async (t) => {
  const ctx = await device(t, { playsHidden: true }, { computer: true });
  const text = Array.from({ length: 8 }, (_, i) => `Sentence ${i + 1} tells you a little more about the results, and what they mean.`).join(' ');
  ctx.fake.setHidden(true);
  ctx.tts.speak(text, ctx.opts);
  ctx.clock.runUntil(() => ctx.r.ends.length > 0, 120_000);
  assert.deepEqual(ctx.r.ends, ['done']);
  assert.equal(ctx.fake.cancels, 0, 'no recovery');
  assert.deepEqual(ctx.fake.completed().join(' ').split(/\s+/), text.split(/\s+/));
});

test('the Mac’s own voice on an iPhone (setPausesWhenHidden(true), and the default): hidden time doesn’t count; it ends once visible again', async (t) => {
  for (const computer of [false, undefined]) {
    const ctx = await device(t, { boundaries: false, quirks: { stuckSpeaking: true, dropEnd: () => true } }, { computer });
    ctx.tts.speak(ONE, ctx.opts);
    ctx.clock.runUntil(() => ctx.fake.audio.length && ctx.fake.audio[0].complete, 10_000);
    ctx.fake.setHidden(true);
    ctx.clock.advance(5 * 60_000);
    assert.deepEqual(ctx.r.ends, [], `five minutes hidden: still waiting (computer: ${computer})`);
    ctx.fake.setHidden(false);
    ctx.clock.runUntil(() => ctx.r.ends.length > 0, 60_000);
    assert.deepEqual(ctx.r.ends, ['done']);
  }
});

// ---- the router: George stuck while hidden on a computer, the device voice says the rest there ----------------

test('router on a computer: George from the home base stuck while Jarvis is hidden — the device voice says the rest while still hidden, and the reply ends', async (t) => {
  const clock = installClock();
  const speech = createFakeSpeech(clock, { playsHidden: true }).install();
  const device = await import(`../../src/platform/voice/tts.js?hidden=${++loads}`);
  const { createVoiceRouter } = await import(`../../src/platform/voice/voice-router.js?hidden=${loads}`);
  const natural = await import('../../src/platform/voice/natural/natural-stream.js'); // the router's own copy
  device.setPausesWhenHidden(false);
  natural.setPausesWhenHidden(false);
  t.after(() => {
    natural.setPausesWhenHidden(true);
    speech.uninstall();
    clock.restore();
  });
  const senses = {
    speak({ text }, { timeoutMs, signal }) {
      const synthMs = (0.4 * text.length * 1000) / 13 + 150;
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ ok: true, pcm: new Float32Array(Math.round((text.length / 13) * 24000)).fill(0.1), sampleRate: 24000 }), Math.min(synthMs, timeoutMs));
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve({ ok: false, kind: 'aborted' });
        });
      });
    },
    noteFailure: () => {},
  };
  const audio = createFakeAudio(clock);
  const router = createVoiceRouter({
    device,
    natural: { engine: createFakeEngine(clock, { rtf: 0.3, state: 'ready' }), audio },
    homebase: { engine: createHomeBaseVoiceEngine({ senses, now: () => Date.now() }), audio, canSpeak: () => true },
    getSettings: () => ({ homeBaseSpeak: true, naturalVoice: false, naturalVoiceId: 'bm_george' }),
  });
  const ends = [];
  const boundaries = [];
  const h = router.createSpeechStream({ onEnd: (e) => ends.push(e.reason), onBoundary: (b) => boundaries.push(b) });
  h.append(TEXT);
  h.finish();
  const run = async (until, max = 40000) => {
    for (let i = 0; i < max && !until(); i++) {
      clock.advance(20);
      await new Promise((done) => setImmediate(done));
    }
    if (!until()) throw new Error('run: condition not met');
  };
  await run(() => boundaries.length >= 3);
  speech.setHidden(true);
  audio.suspend();
  const stoppedAt = clock.now;
  await run(() => speech.submitted.length > 0);
  assert.ok(clock.now - stoppedAt >= 3500 && clock.now - stoppedAt <= 4500, `the device voice took over ${clock.now - stoppedAt} ms after George’s clock stopped`);
  await run(() => ends.length > 0);
  assert.deepEqual(ends, ['done']);
  assert.ok(speech.hidden, 'all of it while hidden');
  assert.ok(speech.completed().length > 0, 'the device voice said the rest');
});
