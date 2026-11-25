// v7.8.1: George never leaves the owner in silence. The natural stream (natural/natural-stream.js) drives
// words, chunk ends and the end of a reply from the Web Audio clock; when that clock stops (iOS: an audio
// interruption, a route change, the microphone holding the audio session; a context never unlocked by a
// tap) its watchdog kicks the output once at 1.5 s and hands what wasn't heard to the device voice at
// 3.5 s. The router (voice-router.js) then remembers the stuck audio and speaks new replies with the
// device voice at once, until a gesture unlocks audio again or the clock is seen moving.
//
// Fakes: natural.fakes.mjs (a virtual clock with block(), an audio output whose clock can stop, a worker
// engine), the real tts.js on the fake speechSynthesis (platform.voice.fakeengine.test.mjs) for the device
// voice, and the home base engine (homebase-voice.js) on a fake senses client.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock, createFakeEngine, createFakeAudio } from './natural.fakes.mjs';
import { createFakeSpeech } from './platform.voice.fakeengine.test.mjs';
import { createHomeBaseVoiceEngine } from '../../src/platform/voice/homebase-voice.js';
import { voiceInUse } from '../../src/lib/voice-choice.js';

let loads = 0;
const TICK = 40;

/** A document whose visibility a test controls (the watchdog reads document.hidden and its events). */
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

async function setup(t, { rtf = 0.4, frozen = false, handoff = true, doc = null } = {}) {
  const clock = installClock();
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  if (doc) Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  const engine = createFakeEngine(clock, { rtf });
  const audioZero = clock.now;
  const audio = createFakeAudio(clock, { frozen });
  const mod = await import(`../../src/platform/voice/natural/natural-stream.js?stall=${++loads}`);
  const handoffs = [];
  const deps = { engine, audio, voice: 'bm_george', onHandoff: handoff ? (h) => handoffs.push({ ...h, at: clock.now }) : undefined };
  t.after(() => {
    if (doc) {
      if (saved) Object.defineProperty(globalThis, 'document', saved);
      else delete globalThis.document;
    }
    clock.restore();
  });
  return { clock, engine, audio, audioZero, mod, deps, handoffs };
}

function recorder() {
  const r = { chunks: [], boundaries: [], ends: [] };
  r.opts = {
    onChunk: (c) => r.chunks.push(c),
    onBoundary: (b) => r.boundaries.push(b),
    onEnd: (e) => r.ends.push(e.reason),
  };
  return r;
}

const TEXT = 'Good evening, sir. The forecast for tonight is mild, with light rain after six and a clear morning. Your three o’clock moved to Thursday, and the lab inspection is at four. Shall I read the rest of the briefing?';

// ---- the stream's watchdog ----------------------------------------------------------------------------------

test('stall watchdog: a clock stopped from the start (a context never unlocked) — kicked once at 1.5 s, handed over at 3.5 s from the very start, its audio and synthesis dropped', async (t) => {
  const ctx = await setup(t, { frozen: true });
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(TEXT);
  s.finish();
  ctx.clock.runUntil(() => ctx.audio.played.length > 0, 30_000);
  const scheduledAt = ctx.clock.now;
  ctx.clock.runUntil(() => ctx.handoffs.length > 0, 30_000);
  const took = ctx.handoffs[0].at - scheduledAt;
  assert.ok(took >= 3500 && took <= 3500 + 2 * TICK, `handed over ${took} ms after the first chunk was put on the clock`);
  assert.equal(ctx.audio.kicks, 1, 'kicked once');
  const kickAfter = ctx.audio.kickTimes[0] - scheduledAt;
  assert.ok(kickAfter >= 1500 && kickAfter <= 1500 + 2 * TICK, `kicked ${kickAfter} ms in`);
  const h = ctx.handoffs[0];
  assert.equal(h.reason, 'stall');
  assert.equal(h.from, 0, 'nothing was heard: the device voice says it all');
  assert.deepEqual(r.chunks, [], 'no chunk ever started');
  assert.deepEqual(r.boundaries, []);
  assert.ok(ctx.audio.played.every((p) => p.stopped), 'every scheduled chunk stopped');
  assert.deepEqual(r.ends, [], 'the router owns onEnd after a handoff');
  assert.equal(s.active(), false);
  const asked = ctx.engine.requests.length;
  ctx.clock.advance(20_000);
  assert.equal(ctx.engine.requests.length, asked, 'nothing more is made');
  assert.equal(ctx.handoffs.length, 1, 'once');
  assert.equal(ctx.audio.kicks, 1);
});

test('stall watchdog: a clock that stops mid-chunk — the device voice starts at the last word heard (integrator, L3: at the one before it when that word had only just begun)', async (t) => {
  // Stopped well inside a word (0.32 s after its boundary, before the next): from that word.
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(TEXT);
  s.finish();
  ctx.clock.runUntil(() => r.boundaries.length >= 3, 30_000);
  let found = false;
  for (let guard = 0; guard < 40 && !found; guard++) {
    const n = r.boundaries.length;
    const firedAt = ctx.clock.now; // the boundary fires within one 40 ms tick of its estimated time
    ctx.clock.runUntil(() => r.boundaries.length > n || ctx.clock.now - firedAt >= 320, 5_000);
    found = r.boundaries.length === n; // 0.32 s into this word and the next hasn't begun: stop here
  }
  assert.ok(found, 'a word longer than 0.32 s');
  ctx.audio.suspend(); // the clock stops (an audio interruption)
  const heard = r.boundaries.length;
  const last = r.boundaries.at(-1);
  ctx.clock.runUntil(() => ctx.handoffs.length > 0, 30_000);
  assert.equal(r.boundaries.length, heard, 'no word after the clock stopped');
  const h = ctx.handoffs[0];
  assert.equal(h.reason, 'stall');
  assert.equal(h.from, last.charIndex, `from the last word heard (“${s.text().slice(last.charIndex, last.charIndex + last.charLength)}”)`);
  assert.ok(h.from > 0 && h.from < r.chunks.at(-1).end, 'inside the chunk that was playing');
  assert.equal(ctx.audio.kicks, 1);
  assert.ok(ctx.audio.played.every((p) => p.stopped || p.when + p.duration <= ctx.audio.now()), 'nothing left to play');

  // Stopped right after a boundary (within 0.3 s: with a speaker lagging the clock, e.g. Bluetooth, that word
  // may not be heard yet and the end of the one before it may be cut): from the word before it.
  const ctx2 = await setup(t);
  const r2 = recorder();
  const s2 = ctx2.mod.createNaturalStream(ctx2.deps, r2.opts);
  s2.append(TEXT);
  s2.finish();
  ctx2.clock.runUntil(() => r2.boundaries.length >= 6, 30_000);
  ctx2.audio.suspend();
  const prev = r2.boundaries.at(-2);
  ctx2.clock.runUntil(() => ctx2.handoffs.length > 0, 30_000);
  assert.equal(ctx2.handoffs[0].from, prev.charIndex, `from the word before the last boundary (“${s2.text().slice(prev.charIndex, prev.charIndex + prev.charLength)}”): one word said twice rather than one lost`);
});

test('stall watchdog: a clock that stops after a chunk’s voice was all heard (in its last silence) — the device voice starts at the next chunk', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(TEXT);
  s.finish();
  ctx.clock.runUntil(() => ctx.audio.played.length > 0, 30_000);
  const p0 = ctx.audio.played[0];
  // The chunk keeps 50 ms of silence after its voice: stop the clock in the middle of it.
  const target = ctx.audioZero + (p0.when + p0.duration - 0.025) * 1000;
  ctx.clock.advance(Math.ceil(target - ctx.clock.now));
  ctx.audio.suspend();
  ctx.clock.runUntil(() => ctx.handoffs.length > 0, 30_000);
  assert.equal(r.chunks.length, 1);
  assert.equal(ctx.handoffs[0].from, r.chunks[0].end, 'not a word of the first chunk again');
});

test('stall watchdog: stopped 1 s, then moving — nothing happens; stopped 2 s — one kick, which works, and George carries on', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(TEXT);
  s.finish();
  ctx.clock.runUntil(() => r.boundaries.length >= 3, 30_000);
  ctx.audio.suspend();
  ctx.clock.advance(1000);
  ctx.audio.resume();
  ctx.clock.runUntil(() => r.boundaries.length >= 12, 60_000);
  assert.equal(ctx.audio.kicks, 0, 'a second’s hiccup: no kick');
  ctx.audio.onKick = (a) => a.resume(); // this time the kick starts it again
  ctx.audio.suspend();
  ctx.clock.runUntil(() => ctx.audio.kicks > 0, 10_000);
  ctx.clock.runUntil(() => r.ends.length > 0, 120_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.handoffs, []);
  assert.equal(ctx.audio.kicks, 1);
  assert.deepEqual(r.boundaries.map((b) => s.text().slice(b.charIndex, b.charIndex + b.charLength)), s.text().split(' '), 'every word once, by George');
});

test('stall watchdog: stopped 3 s, then moving by itself after the kick did nothing — no handoff', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(TEXT);
  s.finish();
  ctx.clock.runUntil(() => r.boundaries.length >= 3, 30_000);
  ctx.audio.suspend();
  ctx.clock.advance(3000);
  ctx.audio.resume();
  ctx.clock.runUntil(() => r.ends.length > 0, 120_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.handoffs, []);
  assert.equal(ctx.audio.kicks, 1);
});

test('stall watchdog: hidden, it never counts (iOS stops audio in the background); back in view it counts again from fresh readings', async (t) => {
  const doc = fakeDocument();
  const ctx = await setup(t, { doc });
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(TEXT);
  s.finish();
  ctx.clock.runUntil(() => r.boundaries.length >= 3, 30_000);
  doc.setHidden(true);
  ctx.audio.suspend();
  ctx.clock.advance(60_000);
  assert.deepEqual(ctx.handoffs, [], 'a minute hidden: nothing');
  assert.equal(ctx.audio.kicks, 0);
  // Back, and the audio comes back with it: nothing.
  doc.setHidden(false);
  ctx.clock.advance(500);
  ctx.audio.resume();
  ctx.clock.advance(3000);
  assert.deepEqual(ctx.handoffs, []);
  assert.equal(ctx.audio.kicks, 0);
  // Hidden again; this time the audio stays stopped once back: the full time again, from the return.
  doc.setHidden(true);
  ctx.audio.suspend();
  ctx.clock.advance(30_000);
  doc.setHidden(false);
  const shownAt = ctx.clock.now;
  ctx.clock.advance(3400);
  assert.deepEqual(ctx.handoffs, [], 'not before 3.5 s in view');
  ctx.clock.runUntil(() => ctx.handoffs.length > 0, 10_000);
  const took = ctx.handoffs[0].at - shownAt;
  assert.ok(took >= 3500 && took <= 3500 + 2 * TICK, `handed over ${took} ms after the page came back`);
  assert.ok(ctx.audio.kickTimes[0] - shownAt >= 1500, 'kicked only once back in view');
  assert.equal(ctx.handoffs[0].reason, 'stall');
});

test('stall watchdog: a blocked page or late timers with the clock moving never count; a stopped clock during a block counts one step at most', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(`${TEXT} ${TEXT} ${TEXT}`); // about 40 s of speech
  s.finish();
  ctx.clock.runUntil(() => r.boundaries.length >= 2, 30_000);
  // The main thread blocked for 2 s at a time (a big reply rendering, a hologram being built), five times.
  for (let i = 0; i < 5; i++) ctx.clock.block(2000);
  assert.deepEqual(ctx.handoffs, []);
  assert.equal(ctx.audio.kicks, 0);
  // Late timers: the tick every 400 ms instead of 40, for 6 s.
  for (let i = 0; i < 15; i++) ctx.clock.block(400);
  assert.equal(ctx.audio.kicks, 0);
  // The clock stopped during a 3 s block and moving again right after: one step (250 ms) counted, no kick.
  ctx.clock.runUntil(() => ctx.audio.busy(), 30_000);
  assert.ok(ctx.audio.busy() && r.ends.length === 0, 'a chunk is playing');
  ctx.audio.suspend();
  ctx.clock.block(3000);
  ctx.audio.resume();
  ctx.clock.runUntil(() => r.ends.length > 0, 120_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.handoffs, []);
  assert.equal(ctx.audio.kicks, 0);
});

test('stall watchdog: with throttled timers (a tick a second) and the clock really stopped, the owner still hears the rest, later', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(TEXT);
  s.finish();
  ctx.clock.runUntil(() => r.boundaries.length >= 2, 30_000);
  ctx.audio.suspend();
  let ticks = 0;
  while (!ctx.handoffs.length && ticks < 40) {
    ctx.clock.block(1000);
    ticks += 1;
  }
  assert.equal(ctx.handoffs.length, 1);
  assert.ok(ticks >= 14 && ticks <= 16, `each late tick counted 250 ms at most (${ticks} ticks)`);
});

test('stall watchdog: normal playback never trips it — a long reply, our own idle suspend resumed by play(), a slow resume', async (t) => {
  // A long reply, gaps between chunks while they are made included.
  for (const rtf of [0.2, 0.6, 0.95]) {
    const ctx = await setup(t, { rtf });
    const r = recorder();
    const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
    s.append(`${TEXT} ${TEXT} ${TEXT}`);
    s.finish();
    ctx.clock.runUntil(() => r.ends.length > 0, 10 * 60_000);
    assert.deepEqual(r.ends, ['done'], `rtf ${rtf}`);
    assert.equal(ctx.audio.kicks, 0, `rtf ${rtf}`);
  }
  // The output suspended after 30 idle seconds; play() resumes it, which takes 0.3 s, 1.4 s, or 2.5 s.
  for (const ms of [300, 1400, 2500]) {
    const ctx = await setup(t, { frozen: true });
    ctx.audio.autoResumeMs = ms;
    const r = recorder();
    const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
    s.append(TEXT);
    s.finish();
    ctx.clock.runUntil(() => r.ends.length > 0, 120_000);
    assert.deepEqual(r.ends, ['done'], `resumed after ${ms} ms`);
    assert.deepEqual(ctx.handoffs, [], `resumed after ${ms} ms`);
    assert.equal(ctx.audio.kicks, ms > 1500 ? 1 : 0, `resumed after ${ms} ms: kicked only past 1.5 s`);
  }
});

test('stall watchdog: a "slow" handoff whose made audio never plays (the clock stopped meanwhile) hands over from what wasn’t heard', async (t) => {
  const ctx = await setup(t, { rtf: 1.6 });
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(TEXT);
  s.finish();
  ctx.clock.runUntil(() => ctx.engine.status().state === 'slow', 120_000);
  assert.deepEqual(ctx.handoffs, [], 'the made audio plays out first');
  ctx.audio.suspend();
  ctx.clock.runUntil(() => ctx.handoffs.length > 0, 30_000);
  const h = ctx.handoffs[0];
  assert.equal(h.reason, 'stall', 'the device voice at once, not after audio that will never play');
  const lastHeard = r.boundaries.length ? r.boundaries.at(-1).charIndex : 0;
  assert.ok(h.from <= Math.max(lastHeard, r.chunks.length ? r.chunks.at(-1).end : 0), 'nothing unheard is skipped');
  assert.ok(ctx.audio.played.every((p) => p.stopped || p.when + p.duration <= ctx.audio.now()));
});

test('stall watchdog: without onHandoff there is none (the stream waits for the clock, as before)', async (t) => {
  const ctx = await setup(t, { handoff: false });
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append(TEXT);
  s.finish();
  ctx.clock.runUntil(() => r.boundaries.length >= 2, 30_000);
  ctx.audio.suspend();
  ctx.clock.advance(20_000);
  assert.equal(ctx.audio.kicks, 0);
  assert.deepEqual(r.ends, []);
  ctx.audio.resume();
  ctx.clock.runUntil(() => r.ends.length > 0, 120_000);
  assert.deepEqual(r.ends, ['done']);
});

// ---- the router: both engines, the device voice, and the stuck state ----------------------------------------

/**
 * The router with George from the home base (homebase-voice.js on a fake senses client: each request takes
 * `rtf` × its audio plus 0.15 s) and the on-device George (fake worker engine), sharing one audio output, as
 * in the app. The device voice is the real tts.js on the fake speechSynthesis.
 */
async function routerWith(t, { frozen = false, home = true, natural = false } = {}) {
  const clock = installClock();
  const speech = createFakeSpeech(clock, {}).install();
  const device = await import(`../../src/platform/voice/tts.js?stall=${++loads}`);
  const { createVoiceRouter } = await import(`../../src/platform/voice/voice-router.js?stall=${loads}`);
  t.after(() => {
    speech.uninstall();
    clock.restore();
  });
  const requests = [];
  const failures = [];
  const senses = {
    speak({ text }, { timeoutMs, signal }) {
      const synthMs = (0.4 * text.length * 1000) / 13 + 150;
      requests.push({ text, at: clock.now });
      return new Promise((resolve) => {
        const timer = setTimeout(() => (synthMs > timeoutMs ? resolve({ ok: false, kind: 'timeout' }) : resolve({ ok: true, pcm: new Float32Array(Math.round((text.length / 13) * 24000)).fill(0.1), sampleRate: 24000 })), Math.min(synthMs, timeoutMs));
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve({ ok: false, kind: 'aborted' });
        });
      });
    },
    noteFailure: (w, k) => failures.push(`${w}:${k}`),
  };
  const hEngine = createHomeBaseVoiceEngine({ senses, now: () => Date.now() });
  const audio = createFakeAudio(clock, { frozen });
  const nEngine = createFakeEngine(clock, { rtf: 0.3, state: 'ready' });
  const s = { homeBaseSpeak: home, naturalVoice: natural, naturalVoiceId: 'bm_george' };
  const before = JSON.stringify(s);
  const router = createVoiceRouter({ device, natural: { engine: nEngine, audio }, homebase: { engine: hEngine, audio, canSpeak: () => true }, getSettings: () => s });
  const voices = [];
  router.onVoiceChange((v) => voices.push(v));
  const stuckSeen = [];
  router.onAudioStuck((v) => stuckSeen.push(v));
  const run = async (until, max = 40000) => {
    for (let i = 0; i < max && !until(); i++) {
      clock.advance(20);
      await new Promise((done) => setImmediate(done));
    }
    if (!until()) throw new Error('run: condition not met');
  };
  /** One reply, streamed in (createSpeechStream) or spoken at once (speak()); resolves when it has ended. */
  const reply = async (text, { stream = true } = {}) => {
    const ends = [];
    const rec = { ends, chunks: [], boundaries: [] };
    const opts = { onEnd: (e) => ends.push(e.reason), onChunk: (c) => rec.chunks.push(c), onBoundary: (b) => rec.boundaries.push(b) };
    if (stream) {
      const h = router.createSpeechStream(opts);
      h.append(text);
      h.finish();
      rec.text = () => h.text();
    } else {
      router.speak(text, opts);
      rec.text = () => text;
    }
    rec.done = () => run(() => ends.length > 0);
    return rec;
  };
  return { clock, speech, router, requests, failures, audio, nEngine, voices, stuckSeen, run, reply, settingsUnchanged: () => JSON.stringify(s) === before };
}

const words = (text) => text.split(/\s+/).filter(Boolean);

test('router, George from the home base, the audio stuck from the start: the device voice says every word once, in order, within the threshold; the label follows; Voice Mode gets its onEnd', async (t) => {
  const ctx = await routerWith(t, { frozen: true });
  const rec = await ctx.reply(TEXT);
  await ctx.run(() => ctx.audio.played.length > 0);
  const scheduledAt = ctx.clock.now;
  await ctx.run(() => ctx.speech.submitted.length > 0);
  const took = ctx.clock.now - scheduledAt;
  assert.ok(took >= 3500 && took <= 3500 + 3 * TICK, `the device voice ${took} ms after George’s first chunk was put on the clock`);
  await rec.done();
  assert.deepEqual(rec.ends, ['done'], 'onEnd once, from the device voice');
  assert.deepEqual(words(ctx.speech.completed().join(' ')), words(TEXT), 'every word once, in order');
  assert.deepEqual(ctx.voices, ['homebase', 'device', null], 'the label: George, then the iPhone voice');
  assert.equal(ctx.router.audioStuck(), true);
  assert.deepEqual(ctx.stuckSeen, [true]);
  assert.deepEqual(ctx.failures, [], 'not the home base’s fault: it doesn’t rest');
  assert.ok(ctx.settingsUnchanged(), 'George stays on');
  // Chunk offsets index the router's text: the device voice's chunks cover it all, from 0.
  assert.equal(rec.chunks[0].start, 0);
});

test('router: after a stall, the next replies go straight to the device voice (no new wait), until a gesture unlocks audio; then George again', async (t) => {
  const ctx = await routerWith(t, { frozen: true });
  await (await ctx.reply('First reply. It never plays through Web Audio.')).done();
  assert.equal(ctx.router.audioStuck(), true);
  const asked = ctx.requests.length;
  // Next reply, streamed: the device voice at once.
  ctx.voices.length = 0;
  const next = await ctx.reply('Second reply, said by the iPhone voice at once.');
  await ctx.run(() => ctx.speech.submitted.some((u) => /Second reply/.test(u.text)));
  assert.ok(ctx.clock.now - ctx.speech.submitted.find((u) => /Second reply/.test(u.text)).t < 100, 'no new 3.5 s wait');
  await next.done();
  assert.deepEqual(next.ends, ['done']);
  assert.equal(ctx.requests.length, asked, 'nothing asked of George');
  assert.deepEqual(ctx.voices, ['device', null]);
  // speak() (a line said at once, e.g. the wake greeting): the device voice too.
  const line = await ctx.reply('Good evening, Tony.', { stream: false });
  assert.ok(ctx.speech.submitted.some((u) => u.text === 'Good evening, Tony.'), 'at once');
  await line.done();
  assert.equal(ctx.requests.length, asked);
  // A tap (unlockSpeech): George gets his chance again (the audio is unlocked inside it).
  ctx.audio.onKick = null;
  ctx.router.unlockSpeech();
  assert.equal(ctx.router.audioStuck(), false);
  assert.deepEqual(ctx.stuckSeen, [true, false]);
  ctx.audio.resume(); // the unlock worked
  const back = await ctx.reply('Third reply, George again.');
  await back.done();
  assert.ok(ctx.requests.length > asked, 'George asked again');
  assert.ok(!ctx.speech.submitted.some((u) => /Third reply/.test(u.text)), 'and he said it');
  assert.equal(ctx.router.audioStuck(), false);
});

test('router: after a stall, a clock seen moving again (the audio came back by itself) brings George back without a tap', async (t) => {
  const ctx = await routerWith(t, { frozen: true });
  await (await ctx.reply('A reply nobody hears from George.')).done();
  assert.equal(ctx.router.audioStuck(), true);
  // Still stopped: still stuck.
  ctx.clock.advance(5000);
  assert.equal(ctx.router.audioStuck(), true);
  // The interruption ends; the clock moves on.
  ctx.audio.resume();
  ctx.clock.advance(1000);
  const asked = ctx.requests.length;
  const rec = await ctx.reply('George is back by himself.');
  await rec.done();
  assert.ok(ctx.requests.length > asked, 'George asked');
  assert.ok(!ctx.speech.submitted.some((u) => /back by himself/.test(u.text)), 'the device voice said nothing');
  assert.equal(ctx.router.audioStuck(), false);
  assert.deepEqual(ctx.stuckSeen, [true, false]);
});

test('router: a gesture while the audio really is still stuck costs one more wait, then the device voice again (and stuck again)', async (t) => {
  const ctx = await routerWith(t, { frozen: true });
  await (await ctx.reply('One.')).done();
  ctx.router.unlockSpeech(); // the tap doesn't help: the clock stays stopped
  const rec = await ctx.reply('Two, tried with George once more.');
  await rec.done();
  assert.deepEqual(rec.ends, ['done']);
  assert.ok(ctx.speech.completed().some((u) => /Two, tried/.test(u)), 'said by the device voice after all');
  assert.equal(ctx.router.audioStuck(), true);
  assert.deepEqual(ctx.stuckSeen, [true, false, true]);
});

test('router, George on this device (the on-device engine), the clock stopping mid-chunk: the device voice from the last word heard; new replies at once on the device voice; a tap brings him back', async (t) => {
  const ctx = await routerWith(t, { home: false, natural: true });
  const rec = await ctx.reply(TEXT);
  await ctx.run(() => rec.boundaries.length >= 5);
  ctx.audio.suspend(); // within 60 ms of the 5th boundary: that word had only just begun (integrator, L3)
  const from = rec.boundaries.at(-2);
  await rec.done();
  assert.deepEqual(rec.ends, ['done']);
  const said = ctx.speech.completed().join(' ');
  const full = rec.text();
  assert.equal(words(said).join(' '), words(full.slice(from.charIndex)).join(' '), 'the device voice: from the word before the one just begun, to the end');
  const georgeWords = rec.boundaries.filter((b) => b.charIndex < from.charIndex).length;
  assert.equal(georgeWords + words(said).length, words(full).length, 'every word said (the last two George began are said again, from the first one’s start)');
  assert.deepEqual(ctx.voices, ['natural', 'device', null]);
  assert.equal(ctx.router.audioStuck(), true);
  const asked = ctx.nEngine.requests.length;
  const next = await ctx.reply('The next reply, at once on the device voice.');
  await ctx.run(() => ctx.speech.submitted.some((u) => /next reply/.test(u.text)));
  await next.done();
  assert.equal(ctx.nEngine.requests.length, asked, 'the on-device George isn’t asked meanwhile');
  ctx.router.unlockSpeech();
  ctx.audio.resume();
  const back = await ctx.reply('George on this device again.');
  await back.done();
  assert.ok(ctx.nEngine.requests.length > asked);
  assert.ok(!ctx.speech.submitted.some((u) => /this device again/.test(u.text)));
});

test('router: a stall of George from the home base skips the on-device George (same Web Audio) and goes straight to the device voice', async (t) => {
  const ctx = await routerWith(t, { frozen: true, natural: true });
  const rec = await ctx.reply(TEXT);
  await rec.done();
  assert.deepEqual(rec.ends, ['done']);
  assert.deepEqual(ctx.voices, ['homebase', 'device', null]);
  assert.equal(ctx.nEngine.requests.length, 0, 'the on-device George would have been stuck too');
  assert.deepEqual(words(ctx.speech.completed().join(' ')), words(TEXT));
});

test('router: a hidden page while George’s audio is stopped hands over only once back in view (plus the threshold)', async (t) => {
  const ctx = await routerWith(t);
  const rec = await ctx.reply(TEXT);
  await ctx.run(() => rec.boundaries.length >= 3);
  ctx.speech.setHidden(true);
  ctx.audio.suspend();
  for (let i = 0; i < 30; i++) {
    ctx.clock.advance(1000);
    await new Promise((done) => setImmediate(done));
  }
  assert.equal(ctx.speech.submitted.length, 0, 'nothing while hidden');
  ctx.speech.setHidden(false);
  const shownAt = ctx.clock.now;
  await ctx.run(() => ctx.speech.submitted.length > 0);
  assert.ok(ctx.clock.now - shownAt >= 3500, `not before 3.5 s in view (${ctx.clock.now - shownAt} ms)`);
  await rec.done();
  assert.deepEqual(rec.ends, ['done']);
});

// ---- what Settings → Voice → Jarvis's voice says --------------------------------------------------------------

test('Jarvis’s voice: with George’s audio stuck, the card names the device voice and says why, plainly; George stays on', () => {
  const settings = { homeBaseUrl: 'https://alienware.tail4e5f6a.ts.net/', homeBaseSpeak: true };
  const senses = { phase: 'ready', view: { speak: { enabled: true, state: 'ready' } }, problem: null, cooling: false, canSpeak: true };
  const ok = voiceInUse({ settings, senses, os: 'ios', voiceName: 'George' });
  assert.equal(ok.engine, 'homebase');
  assert.equal(ok.pending, null);
  const stuck = voiceInUse({ settings, senses, os: 'ios', voiceName: 'George', audioStuck: true });
  assert.equal(stuck.engine, 'device');
  assert.equal(stuck.label, 'iPhone voice');
  assert.deepEqual(stuck.pending, { state: 'stuck', text: 'George’s sound didn’t start on this iPhone, so the iPhone voice is speaking. Tap Test to try again.' });
  const mac = voiceInUse({ settings, senses, os: 'mac', voiceName: 'George', audioStuck: true });
  assert.equal(mac.pending.text, 'George’s sound didn’t start on this Mac, so the built-in voice is speaking. Tap Test to try again.');
  // George on this device, stuck the same way.
  const nat = voiceInUse({ settings: { naturalVoice: true }, natural: { supported: true, state: 'ready' }, os: 'ios', voiceName: 'George', audioStuck: true });
  assert.equal(nat.engine, 'device');
  assert.equal(nat.pending.state, 'stuck');
  // George off: nothing to say about his sound.
  const off = voiceInUse({ settings: { ...settings, homeBaseSpeak: false }, senses, os: 'ios', voiceName: 'George', audioStuck: true });
  assert.equal(off.engine, 'device');
  assert.equal(off.pending, null);
});
