// The speech engine (tts.js) against Chromium's and WebKit's real queue semantics, as the fake
// engine models them (platform.voice.fakeengine.test.mjs): `speaking` is true from speak() on, so a
// silently dropped utterance looks "speaking" and holds the queue until cancel(); a lost completion
// stalls the queue. Covers what the reviews found:
//   - a dropped chunk is retried, never counted as spoken (onChunk and onEnd 'done' are not proof);
//   - a stall is recovered at once once the stuck chunk is known to be over (its last word, or
//     its time), without using up the waiting chunk's retry, and sooner after a first stall;
//   - the last chunk with stuck flags ends soon after its audio: from its last word, or from the
//     speed this voice was measured at (never from assumed starts, early ends or short chunks).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock, createFakeSpeech, VOICES } from './platform.voice.fakeengine.test.mjs';

let loads = 0;

async function setup(t, config = {}) {
  const clock = installClock();
  const fake = createFakeSpeech(clock, config).install();
  const tts = await import(`../../src/platform/voice/tts.js?recovery=${++loads}`);
  const consoleError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = consoleError;
    fake.uninstall();
    clock.restore();
  });
  return { clock, fake, tts };
}

function recorder(clock) {
  const r = { chunks: [], chunkT: [], ends: [], endT: -1, starts: 0, boundaries: 0 };
  r.opts = {
    onStart: () => (r.starts += 1),
    onChunk: (c) => {
      r.chunks.push(c.text);
      r.chunkT.push(clock.now);
    },
    onBoundary: () => (r.boundaries += 1),
    onEnd: (e) => {
      r.ends.push(e.reason);
      r.endT = clock.now;
    },
  };
  return r;
}

/** speak() and run until onEnd, then a minute more (nothing may happen then). */
function run(ctx, text, opts = {}, { before, maxMs = 20 * 60_000 } = {}) {
  const r = recorder(ctx.clock);
  r.t0 = ctx.clock.now;
  ctx.tts.speak(text, { ...r.opts, ...opts });
  if (before) before(r);
  ctx.clock.runUntil(() => r.ends.length > 0, maxMs);
  r.ms = ctx.clock.now - r.t0;
  const submitted = ctx.fake.submitted.length;
  ctx.clock.advance(60_000);
  assert.equal(ctx.fake.submitted.length, submitted, 'nothing is spoken after onEnd');
  assert.equal(r.ends.length, 1, `onEnd exactly once: ${r.ends}`);
  return r;
}

const sentence = (i) => `Point ${i + 1} adds one more detail about the results, and what it means for you.`;
const paragraph = (from, count) => Array.from({ length: count }, (_, i) => sentence(from + i)).join(' ');
const LOCAL = 360;
const ms = (text, rate = 1) => (text.length / (15 * rate)) * 1000; // the engine's expected time
const endTimeout = (text, rate = 1) => Math.max(4000, 2.5 * ms(text, rate) + 1500);
const TICK = 250;
const firstAudio = (ctx, text) => ctx.fake.audio.find((a) => a.text === text);
const heardOnce = (ctx, expected) => {
  assert.deepEqual(ctx.fake.completed(), expected, 'everything heard once, in order');
  assert.equal(ctx.fake.partial().length, 0, 'no audio cut');
};
/** Speak something first, so the engine knows this voice sends word events (and plays at all). */
function warmUp(ctx, opts = {}) {
  const r = run(ctx, 'Warming up the voice, sir.', opts);
  assert.deepEqual(r.ends, ['done']);
  return ctx.fake.audio.length;
}

// ---- engine:F1 - a silently dropped chunk is retried, not counted as spoken ---------------------------

test('F1: a dropped one-sentence reply (voice without word events) is spoken again, not ended "done" in silence', async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { dropSpeak: (u, k) => k === 0 } });
  const one = 'The capital of France is Paris.';
  const r = run(ctx, one);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, [one]);
  assert.equal(ctx.fake.submitted[0].dropped, 'custom');
  assert.equal(ctx.fake.cancels, 1, 'cancel() cleared the dropped utterance');
  // Chromium says "speaking" all along; only after the time this sentence could have taken does
  // the engine conclude it was dropped: max(4 s, 2.5 × expected + 1.5 s), then 500 ms.
  const started = firstAudio(ctx, one).startT - r.t0;
  const bound = endTimeout(one) + 500 + TICK + 100;
  assert.ok(started <= bound, `heard after ${started} ms (≤ ${bound})`);
});

test('F1: on a voice known to send word events, a dropped reply is detected at its 3 s start time-out', async (t) => {
  const ctx = await setup(t, { quirks: { dropSpeak: (u, k) => k === 1 } });
  const before = warmUp(ctx);
  const one = 'The capital of France is Paris.';
  const r = run(ctx, one);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.fake.completed().slice(before), [one]);
  const started = firstAudio(ctx, one).startT - r.t0;
  assert.ok(started >= 3000 && started <= 3000 + 500 + TICK + 100, `heard after ${started} ms`);
  assert.ok(r.chunkT[0] - r.t0 >= 3000, 'onChunk only once it really played (no event came for the dropped one)');
});

test('F1: a dropped middle chunk of a long reply is spoken again; the rest follows, nothing is lost', async (t) => {
  // No word events: the engine first assumes the chunk plays (it says "speaking", nothing pending),
  // queues the next one behind it, and concludes "dropped" when that one still waits long after
  // the dropped chunk would have ended: 1.5 × its expected time + 3 s.
  const ctx = await setup(t, { boundaries: false, quirks: { dropSpeak: (u, k) => k === 2 } });
  const text = paragraph(0, 20);
  const expected = ctx.tts.chunkText(text, LOCAL);
  assert.ok(expected.length >= 5);
  const r = run(ctx, text);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, expected);
  const dropped = ctx.fake.submitted[2];
  assert.equal(dropped.dropped, 'custom');
  const prev = ctx.fake.audio.find((a) => a.text === expected[1]);
  const again = ctx.fake.audio.find((a) => a.text === dropped.text);
  const silence = again.startT - prev.endT;
  const bound = 1.5 * ms(dropped.text) + 3000 + 500 + 2 * TICK;
  assert.ok(silence <= bound, `silence before it was spoken again: ${silence} ms (≤ ${bound})`);
  assert.equal(ctx.fake.cancels, 1);
});

test('F1: Chat, Speak on a second answer while the first is read, Chrome dropping for 400 ms after cancel(): all of it is heard, and the next replace waits out the window', async (t) => {
  const ctx = await setup(t, { quirks: { dropAfterCancelMs: 400 } });
  ctx.tts.unlockSpeech();
  ctx.clock.advance(1000);
  const a = recorder(ctx.clock);
  ctx.tts.speak(paragraph(0, 8), a.opts);
  ctx.clock.advance(2500);
  const b = paragraph(10, 8);
  const expectedB = ctx.tts.chunkText(b, LOCAL);
  const audioB = ctx.fake.audio.length;
  const rB = run(ctx, b);
  assert.deepEqual(a.ends, ['cancelled']);
  assert.deepEqual(rB.ends, ['done']);
  assert.deepEqual(ctx.fake.completed().slice(-expectedB.length), expectedB, 'the second answer was heard in full');
  const dropped = ctx.fake.submitted.filter((s) => s.dropped === 'after-cancel');
  assert.equal(dropped.length, 1, 'its first chunk fell in the drop window once');
  // The voice sends word events: dropped at its 3 s start time-out; spoken that late after our
  // cancel(), so the window is longer than 250 ms: the retry waits 1 s.
  const started = ctx.fake.audio[audioB].startT - rB.t0;
  assert.ok(started >= 250 + 3000 + 1000 && started <= 250 + 3000 + 1000 + TICK + 100, `heard after ${started} ms`);
  // The next replace waits longer after its cancel() (learned: the 250 ms it took + 250 ms): no drop.
  ctx.tts.speak(paragraph(20, 8), {});
  ctx.clock.advance(2500);
  const c = paragraph(30, 4);
  const cancelAt = ctx.clock.now;
  const audioC = ctx.fake.audio.length;
  const rC = run(ctx, c);
  assert.deepEqual(rC.ends, ['done']);
  assert.equal(ctx.fake.submitted.filter((s) => s.dropped).length, 1, 'no drop this time');
  const startedC = ctx.fake.audio[audioC].startT - cancelAt;
  assert.ok(startedC >= 500 && startedC < 700, `the third answer started ${startedC} ms after the cancel`);
});

test('F1: the same replace on a voice without word events: the dropped chunk is retried once its next one is still waiting behind it', async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { dropAfterCancelMs: 400 } });
  ctx.tts.unlockSpeech();
  ctx.clock.advance(1000);
  ctx.tts.speak(paragraph(0, 8), {});
  ctx.clock.advance(2500);
  const b = paragraph(10, 8);
  const expectedB = ctx.tts.chunkText(b, LOCAL);
  const rB = run(ctx, b);
  assert.deepEqual(rB.ends, ['done']);
  assert.deepEqual(ctx.fake.completed().slice(-expectedB.length), expectedB, 'the second answer was heard in full');
  assert.equal(ctx.fake.partial().length, 1, 'only the first answer was cut (by the second)');
  const started = ctx.fake.audio.find((x) => x.text === expectedB[0]).startT - rB.t0;
  const bound = 250 + 1.5 * ms(expectedB[0]) + 3000 + 1000 + 2 * TICK;
  assert.ok(started <= bound, `heard after ${started} ms (≤ ${bound})`);
  // The tentative start fired onChunk; the stream still ended 'done' only after real audio.
  assert.equal(rB.starts, 1);
});

test('F1: a dead engine that keeps everything "speaking" (Chromium) ends with "error", nothing assumed spoken', async (t) => {
  const ctx = await setup(t, { quirks: { deadEngine: true } });
  const text = paragraph(0, 10);
  const chunks = ctx.tts.chunkText(text, LOCAL);
  assert.equal(chunks.length, 3);
  const r = run(ctx, text);
  assert.deepEqual(r.ends, ['error'], 'not "done": nothing ever played');
  assert.equal(ctx.fake.audio.length, 0);
  assert.equal(new Set(ctx.fake.submitted.map((s) => s.text)).size, 3, 'two chunks given up (and the one queued behind)');
  for (const c of chunks.slice(0, 2)) assert.equal(ctx.fake.submitted.filter((s) => s.text === c && s.reached).length, 2, 'each tried twice');
  // Each attempt: assumed playing at 3 s, the next chunk queued behind it, dropped after
  // 1.5 × expected + 3 s; retries 500 ms (or 1 s, a longer window) after our cancel().
  const bound = 2 * (1.5 * ms(chunks[0]) + 3000) + 2 * (1.5 * ms(chunks[1]) + 3000) + 3 * 1000 + 8 * TICK;
  assert.ok(r.ms <= bound, `${r.ms} ms (≤ ${bound})`);
});

test('F1: a chunk that played without any event before the next one was queued is not taken for a drop (no cut, no repeat)', async (t) => {
  // Chunk 0 has no start, boundary or end, and the next text arrives only after it has finished:
  // when that next chunk is queued, nothing else waits in the engine, so chunk 0 has completed.
  const ctx = await setup(t, { boundaries: false, quirks: { noStart: (u, n) => n <= 1, dropEnd: (u, n) => n === 0, stuckSpeaking: true } });
  const r = recorder(ctx.clock);
  const s = ctx.tts.createSpeechStream(r.opts);
  const first = 'The forecast for London is mild, with light rain after six.';
  s.append(`${first} `);
  ctx.clock.advance(7000);
  const second = 'Your three o’clock with Pepper moved to Thursday.';
  s.append(`${second} `);
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 120_000);
  ctx.clock.advance(60_000);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, [first, second]);
  assert.equal(ctx.fake.cancels, 0);
});

// ---- engine:F2 - a stall (lost completion) is recovered at once ---------------------------------------

/** Silence between the end of `a`'s audio and the start of `b`'s (first full playing). */
const gapBetween = (ctx, a, b) => firstAudio(ctx, b).startT - firstAudio(ctx, a).endT;

test('F2: a lost completion stalls the queue; with word events the next chunk plays ≤ 3.5 s after the stuck one\'s last word', async (t) => {
  const ctx = await setup(t, { quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 0, stallAfterLostEnd: true } });
  const text = paragraph(0, 12);
  const expected = ctx.tts.chunkText(text, LOCAL);
  const r = run(ctx, text);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, expected);
  const lastWord = ctx.fake.events.filter((e) => e.type === 'boundary' && e.id === ctx.fake.submitted[0].id).at(-1);
  const resumed = firstAudio(ctx, expected[1]).startT - lastWord.t;
  assert.ok(resumed <= 3500, `the next chunk played ${resumed} ms after the stuck chunk's last word`);
  assert.equal(ctx.fake.cancels, 1);
});

test('F2: queuing the chunk stuck behind a stall again costs it no retry: dropped on that attempt, it is still spoken', async (t) => {
  const ctx = await setup(t, { quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 0, stallAfterLostEnd: true, dropSpeak: (u, k) => k === 2 } });
  const text = paragraph(0, 12);
  const expected = ctx.tts.chunkText(text, LOCAL);
  const r = run(ctx, text);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, expected);
  const calls = ctx.fake.submitted.filter((s) => s.text === expected[1]);
  assert.deepEqual(calls.map((c) => [c.reached, c.dropped]), [[false, false], [true, 'custom'], [true, false]], 'stuck behind the stall, then dropped, then spoken');
});

test('F2: a lost completion without word events: the silence is at most the time-out\'s slack + 1.5 s, not another 6 s of start time-outs', async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 0, stallAfterLostEnd: true } });
  const text = paragraph(0, 12);
  const expected = ctx.tts.chunkText(text, LOCAL);
  const r = run(ctx, text);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, expected);
  const gap = gapBetween(ctx, expected[0], expected[1]);
  const bound = endTimeout(expected[0]) - ms(expected[0]) + 1500;
  assert.ok(gap <= bound, `silence ${gap} ms (≤ ${bound})`);
  assert.equal(ctx.fake.cancels, 1);
});

test('F2: Voice Mode, a lost completion on the first sentence: the second one, appended later, waits behind it at most ~1 s', async (t) => {
  const ctx = await setup(t, { quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 0, stallAfterLostEnd: true } });
  const r = recorder(ctx.clock);
  const s = ctx.tts.createSpeechStream(r.opts);
  const first = 'The capital of France is Paris.';
  s.append(`${first} `);
  ctx.clock.runUntil(() => ctx.fake.audio.length && ctx.fake.audio[0].complete, 10_000);
  const audioEnd = ctx.fake.audio[0].endT;
  ctx.clock.advance(4000); // the stuck sentence is settled by now (its last word + 1.5 × its time + 1 s)
  const second = "It has been the country's capital for a very long time.";
  const appendedAt = ctx.clock.now;
  s.append(`${second} `);
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 120_000);
  ctx.clock.advance(60_000);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, [first, second]);
  const waited = firstAudio(ctx, second).startT - appendedAt;
  assert.ok(waited <= 1000 + 250 + 2 * TICK, `the second sentence waited ${waited} ms behind the stuck one`);
  assert.ok(appendedAt - audioEnd >= 3000);
});

test('F2: after one stall in a stream, later stalls (no word events) are recovered after 1.6 × expected + 1.5 s', async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { stuckSpeaking: true, dropEnd: () => true, stallAfterLostEnd: true } });
  const text = paragraph(0, 16);
  const expected = ctx.tts.chunkText(text, LOCAL);
  assert.ok(expected.length >= 4);
  const r = run(ctx, text);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, expected);
  for (let i = 1; i < expected.length - 1; i++) {
    const gap = gapBetween(ctx, expected[i], expected[i + 1]);
    const bound = 0.6 * ms(expected[i]) + 1500 + 250 + 2 * TICK;
    assert.ok(gap <= bound, `chunk ${i + 1}: silence ${gap} ms (≤ ${bound})`);
  }
});

test('F2: a lost completion on the last chunk, with word events: onEnd ≤ 2.5 s after its last word, never before its audio ends', async (t) => {
  const ctx = await setup(t, { quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 2, stallAfterLostEnd: true } });
  const text = paragraph(0, 12);
  const expected = ctx.tts.chunkText(text, LOCAL);
  assert.equal(expected.length, 3);
  const r = run(ctx, text);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, expected);
  const last = ctx.fake.audio.at(-1);
  const lastWord = ctx.fake.events.filter((e) => e.type === 'boundary' && e.id === last.id).at(-1);
  assert.ok(r.endT >= last.endT, 'not before the audio ends');
  assert.ok(r.endT - lastWord.t <= 2500, `onEnd ${r.endT - lastWord.t} ms after the last word`);
});

// ---- ux:UX-4 - the last chunk with stuck flags: measured speed ----------------------------------------

/** onEnd after the last audio, and within 0.3 × its duration + 1.5 s (+ one watchdog tick). */
function assertPromptEnd(ctx, r) {
  const last = ctx.fake.audio.at(-1);
  const dur = last.endT - last.startT;
  assert.ok(r.endT >= last.endT, `onEnd ${last.endT - r.endT} ms before the audio ended`);
  assert.ok(r.endT - last.endT <= 0.3 * dur + 1500 + TICK, `onEnd ${r.endT - last.endT} ms after the last audio (${dur} ms)`);
}

test("UX-4: 'end' lost on the last chunk only (flags stuck, no word events): onEnd soon after its audio, from the measured speed", async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 2 } });
  const text = paragraph(0, 12);
  const expected = ctx.tts.chunkText(text, LOCAL);
  const r = run(ctx, text);
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, expected);
  assertPromptEnd(ctx, r);
});

test("UX-4: 'end' lost on every chunk: the speed is measured from the next chunk's start", async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { stuckSpeaking: true, dropEnd: () => true } });
  const text = paragraph(0, 12);
  const expected = ctx.tts.chunkText(text, LOCAL);
  const r = run(ctx, text);
  heardOnce(ctx, expected);
  assertPromptEnd(ctx, r);
});

test('UX-4: no measurement from assumed starts, early ends or short chunks: then the generous time-out, never an early onEnd', async (t) => {
  // Earlier chunks have no start event (only assumed), or end early: nothing to measure.
  for (const quirks of [
    { noStart: (u, n) => n < 2, dropEnd: (u, n) => n === 2 },
    { earlyEnd: (u, n) => (n < 2 ? 0.4 : false), dropEnd: (u, n) => n === 2 },
  ]) {
    const ctx = await setup(t, { boundaries: false, quirks: { stuckSpeaking: true, ...quirks } });
    const text = paragraph(0, 12);
    const expected = ctx.tts.chunkText(text, LOCAL);
    const r = run(ctx, text);
    heardOnce(ctx, expected);
    const last = ctx.fake.audio.at(-1);
    assert.ok(r.endT - last.startT >= endTimeout(last.text) - TICK, `on the time-out (${r.endT - last.startT} ms from its start)`);
  }
  // Short chunks (< 24 characters) are not measured either.
  const ctx2 = await setup(t, { boundaries: false, quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 3 } });
  const lines = ['One.', 'Two.', 'Three.', 'And that is the summary for today, sir.'];
  const r2 = run(ctx2, lines.join('\n'));
  heardOnce(ctx2, lines);
  const last = ctx2.fake.audio.at(-1);
  assert.ok(r2.endT - last.startT >= endTimeout(last.text) - TICK);
});

test('UX-4: a last chunk 25 % slower than the rest still ends after its audio', async (t) => {
  const ctx = await setup(t, { boundaries: false, cpsFor: (u, n) => (n === 2 ? 15 / 1.25 : 15), quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 2 } });
  const text = paragraph(0, 12);
  const r = run(ctx, text);
  heardOnce(ctx, ctx.tts.chunkText(text, LOCAL));
  const last = ctx.fake.audio.at(-1);
  assert.ok(r.endT >= last.endT, 'after its audio');
  assert.ok(r.endT - last.endT <= 0.3 * (last.endT - last.startT) + 1500 + TICK);
});

test('UX-4: a single-chunk reply waits the time-out on an unmeasured voice, and ends soon after its audio once the voice was measured', async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 0 || n === 4 } });
  const one = 'The capital of France is Paris, and it has been for a very long time.';
  const r1 = run(ctx, one, { voiceURI: VOICES.daniel.voiceURI });
  const a1 = ctx.fake.audio.at(-1);
  assert.ok(r1.endT - a1.startT >= endTimeout(one) - TICK, 'unmeasured: the time-out');
  run(ctx, paragraph(0, 12), { voiceURI: VOICES.daniel.voiceURI }); // measured here (its chunks end normally)
  const r3 = run(ctx, one, { voiceURI: VOICES.daniel.voiceURI });
  assert.deepEqual(r3.ends, ['done']);
  assertPromptEnd(ctx, r3);
});

test('an early end, then a last chunk with no start event and an early end: onEnd still waits for its audio', async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { earlyEnd: (u, n) => (n >= 1 ? 0.5 : false), noStart: (u, n) => n === 2, stuckSpeaking: true } });
  const text = paragraph(0, 12);
  const r = run(ctx, text);
  heardOnce(ctx, ctx.tts.chunkText(text, LOCAL));
  assert.ok(r.endT >= ctx.fake.audio.at(-1).endT, `onEnd ${ctx.fake.audio.at(-1).endT - r.endT} ms before the last audio ended`);
});

// ---- ux:UX-5 - a voice without start events --------------------------------------------------------

test('UX-5: onChunk says when the chunk started, also when the engine only learns it later (no start or word events)', async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { noStart: () => true } });
  const text = paragraph(0, 12);
  const at = [];
  const r = run(ctx, text, { onChunk: (c) => at.push([c.text, c.at, ctx.clock.now]) });
  assert.deepEqual(r.ends, ['done']);
  heardOnce(ctx, ctx.tts.chunkText(text, LOCAL));
  assert.equal(at.length, 3);
  for (const [chunkText, startedAt, firedAt] of at) {
    const audio = firstAudio(ctx, chunkText);
    assert.ok(firedAt - audio.startT >= 2500, 'learned late (no start event)');
    assert.ok(Math.abs(startedAt - audio.startT) <= 100, `reported start ${startedAt - audio.startT} ms from the audio's start`);
  }
  // With start events it is the moment of the event.
  const ctx2 = await setup(t);
  const at2 = [];
  run(ctx2, text, { onChunk: (c) => at2.push([c.at, ctx2.clock.now]) });
  for (const [startedAt, firedAt] of at2) assert.equal(startedAt, firedAt);
});
