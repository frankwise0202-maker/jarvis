// The speech engine (tts.js speak/createSpeechStream) against the scriptable fake
// speechSynthesis (platform.voice.fakeengine.test.mjs), one test per engine quirk H3 a-h of the
// voice brief, alone and combined, on a virtual clock. In every scenario: the whole text is
// spoken, every chunk exactly once (a chunk that never started may be queued once more), in
// order, never more than 2 of our utterances in the engine, onEnd exactly once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock, createFakeSpeech, VOICES } from './platform.voice.fakeengine.test.mjs';

let loads = 0;

/** A fresh tts.js module, fake engine and virtual clock for one test. */
async function setup(t, config = {}) {
  const clock = installClock();
  const fake = createFakeSpeech(clock, config).install();
  const tts = await import(`../../src/platform/voice/tts.js?engine=${++loads}`);
  const errors = [];
  const consoleError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  t.after(() => {
    console.error = consoleError;
    fake.uninstall();
    clock.restore();
  });
  return { clock, fake, tts, errors };
}

function recorder(clock) {
  const r = { log: [], chunks: [], boundaries: [], ends: [], starts: 0, idles: 0, endT: -1 };
  r.opts = {
    onStart: () => {
      r.starts += 1;
      r.log.push('start');
    },
    onChunk: (c) => {
      r.chunks.push(c);
      r.log.push(`chunk${c.index}`);
    },
    onBoundary: (b) => r.boundaries.push(b),
    onIdle: () => {
      r.idles += 1;
      r.log.push('idle');
    },
    onEnd: (e) => {
      r.ends.push(e.reason);
      r.log.push(`end:${e.reason}`);
      r.endT = clock.now;
    },
  };
  return r;
}

const sentence = (i) => `Sentence ${i + 1} tells you a little more about the swarm results, and what they mean.`;
const paragraph = (from, count) => Array.from({ length: from + count }, (_, i) => sentence(i)).slice(from).join(' ');
const TEXT = paragraph(0, 12); // ~1,000 characters: 3 chunks for an on-device voice, 5 for an online one
const LOCAL = 360;
const ONLINE = 220;

/** speak() the text and run the clock until onEnd, then a minute more (nothing may happen then). */
function run(ctx, text, opts = {}, { maxMs = 15 * 60_000, before } = {}) {
  const r = recorder(ctx.clock);
  const t0 = ctx.clock.now;
  const handle = ctx.tts.speak(text, { ...r.opts, ...opts });
  if (before) before(r, handle);
  ctx.clock.runUntil(() => r.ends.length > 0, maxMs);
  r.ms = ctx.clock.now - t0;
  const submittedAtEnd = ctx.fake.submitted.length;
  ctx.clock.advance(60_000);
  assert.equal(ctx.fake.submitted.length, submittedAtEnd, 'nothing is spoken after onEnd');
  assert.equal(r.ends.length, 1, `onEnd exactly once: ${r.ends}`);
  assert.equal(ctx.tts.isSpeaking(), false);
  return r;
}

/** The whole text was heard, every chunk exactly once, in order; at most 2 of ours queued. */
function assertSpokenOnce(ctx, expected, { partial = 0 } = {}) {
  assert.deepEqual(ctx.fake.completed(), expected, 'every chunk played to the end exactly once, in order');
  assert.equal(ctx.fake.partial().length, partial, 'audio cut off');
  assert.ok(ctx.fake.maxOurs <= 2, `at most 2 of our utterances in the engine (saw ${ctx.fake.maxOurs})`);
  const counts = new Map();
  for (const s of ctx.fake.submitted) if (s.text) counts.set(s.text, (counts.get(s.text) || 0) + 1);
  for (const [text, k] of counts) assert.ok(k <= 2, `queued ${k} times: ${text.slice(0, 40)}`);
}

const queuedTimes = (ctx, text) => ctx.fake.submitted.filter((s) => s.text === text).length;

// ---- well-behaved engine ---------------------------------------------------------------------

test('baseline: chunks of whole sentences, the next one queued while the current plays (no gap), callbacks and offsets', async (t) => {
  const ctx = await setup(t);
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  assert.equal(expected.length, 3);
  let speakingDuring = null;
  const r = run(ctx, TEXT, { rate: 1 }, {
    before: () => {
      ctx.clock.advance(2000);
      speakingDuring = ctx.tts.isSpeaking();
    },
  });
  assertSpokenOnce(ctx, expected);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(speakingDuring, true);
  assert.equal(ctx.fake.cancels, 0);
  assert.equal(ctx.fake.maxOurs, 2, 'queue ahead keeps the next chunk in the engine');
  // Back to back: the next chunk was already queued when the previous one ended (only the
  // engine's own gap and start latency remain, never our hand-off).
  const audio = ctx.fake.audio;
  for (let i = 1; i < audio.length; i++) assert.ok(audio[i].startT - audio[i - 1].endT <= 15 + 30, `gap before chunk ${i}`);
  for (let i = 1; i < ctx.fake.submitted.length; i++) {
    const t0 = ctx.fake.submitted[i].t;
    assert.ok(t0 >= audio[i - 1].startT && t0 < audio[i - 1].endT, `chunk ${i} was queued while chunk ${i - 1} played`);
  }
  // Callbacks: onStart once, then onChunk 0..n-1 with offsets into the whitespace-normalised text.
  assert.equal(r.starts, 1);
  assert.deepEqual(r.log.filter((l) => l !== 'idle'), ['start', 'chunk0', 'chunk1', 'chunk2', 'end:done']);
  for (const c of r.chunks) assert.equal(TEXT.slice(c.start, c.end), c.text);
  assert.deepEqual(r.chunks.map((c) => c.text), expected);
  // Every word boundary indexes the text; together they are every word in order.
  const words = r.boundaries.map((b) => TEXT.slice(b.charIndex, b.charIndex + b.charLength));
  assert.deepEqual(words, TEXT.split(' '));
  for (const b of r.boundaries) {
    const c = r.chunks[b.chunkIndex];
    assert.ok(b.name === 'word' && b.charIndex >= c.start && b.charIndex + b.charLength <= c.end, JSON.stringify(b));
  }
  assert.equal(r.idles, 0, 'speak() finishes its stream: no onIdle');
  // Voice, rate and language on every utterance.
  for (const s of ctx.fake.submitted) assert.deepEqual([s.voice, s.rate, s.lang], [VOICES.daniel.voiceURI, 1, 'en-GB']);
});

test('chunk size: up to 360 characters for an on-device voice, 220 for an online or unknown voice, fewer below rate 1', async (t) => {
  const ctx = await setup(t);
  const long = paragraph(0, 30);
  run(ctx, long, { voiceURI: VOICES.daniel.voiceURI });
  const local = ctx.fake.completed();
  assert.deepEqual(local, ctx.tts.chunkText(long, LOCAL));
  assert.ok(local.some((c) => c.length > 220) && local.every((c) => c.length <= 360));
  for (const [rate, limit] of [[1, 220], [1.5, 220], [0.8, 176], [0.7, 154]]) {
    const before = ctx.fake.audio.length;
    run(ctx, long, { voiceURI: VOICES.googleUK.voiceURI, rate });
    const chunks = ctx.fake.completed().slice(before);
    assert.deepEqual(chunks, ctx.tts.chunkText(long, limit), `rate ${rate}`);
    assert.ok(chunks.every((c) => c.length <= limit));
  }
});

test('pacing: a line break always ends a chunk; a sentence is never split when it fits', async (t) => {
  const ctx = await setup(t);
  const text = 'Here is the plan.\nFirst, we check the weather.\nSecond, we pack.\n' + paragraph(0, 3) + '\nDone';
  run(ctx, text);
  assert.deepEqual(ctx.fake.completed(), ['Here is the plan.', 'First, we check the weather.', 'Second, we pack.', paragraph(0, 3), 'Done']);
});

// ---- quirk a: speaking / pending stuck true ----------------------------------------------------

test('quirk a: speaking (or pending) stuck true after an utterance ends does not stall the chain', async (t) => {
  for (const quirks of [{ stuckSpeaking: true }, { stuckPending: true }, { stuckSpeaking: true, stuckPending: true, stuckThroughCancel: true }]) {
    const ctx = await setup(t, { quirks });
    const expected = ctx.tts.chunkText(TEXT, LOCAL);
    const r = run(ctx, TEXT);
    assertSpokenOnce(ctx, expected);
    assert.deepEqual(r.ends, ['done'], JSON.stringify(quirks));
    assert.equal(ctx.fake.cancels, 0);
    assert.ok(r.endT - ctx.fake.audio.at(-1).endT < 200, 'ends right after the last chunk, not on a timeout');
  }
});

// ---- quirk b: missing 'end' ------------------------------------------------------------------

test('quirk b: a missing end event; the next chunk starting settles it, the last one times out after 3 s of silence', async (t) => {
  const ctx = await setup(t, { quirks: { dropEnd: () => true } });
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const r = run(ctx, TEXT);
  assertSpokenOnce(ctx, expected);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.fake.cancels, 0);
  const quiet = r.endT - ctx.fake.audio.at(-1).endT;
  assert.ok(quiet >= 3000 && quiet <= 3600, `ended ${quiet} ms after the audio`);
  assert.equal(r.chunks.length, expected.length);
});

test('quirks a+b: no end event and speaking stuck true; even a stalled engine is recovered (cancel, re-queue)', async (t) => {
  // The engine keeps playing its queue: each next start settles the previous chunk. Nothing settles
  // the last one and the stuck flag never reports silence: it ends soon after its audio anyway,
  // from its last word's boundary event, or (no word events) from the speed this stream measured.
  for (const boundaries of [true, false]) {
    const ctx = await setup(t, { boundaries, quirks: { stuckSpeaking: true, dropEnd: () => true } });
    const expected = ctx.tts.chunkText(TEXT, LOCAL);
    const r = run(ctx, TEXT);
    assertSpokenOnce(ctx, expected);
    assert.deepEqual(r.ends, ['done']);
    const last = ctx.fake.audio.at(-1);
    const dur = last.endT - last.startT;
    const timeout = Math.max(4000, 2.5 * (last.text.length / 15) * 1000 + 1500);
    assert.ok(r.endT >= last.endT, `onEnd after the last audio (boundaries ${boundaries}): ${r.endT - last.endT} ms`);
    assert.ok(r.endT - last.endT <= 0.3 * dur + 1500 + 250, `onEnd ${r.endT - last.endT} ms after the last audio (${dur} ms), not on the ${timeout} ms time-out (boundaries ${boundaries})`);
  }

  // Worst case: after the lost end the engine stops altogether (only cancel() revives it).
  const ctx2 = await setup(t, { quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 0, stallAfterLostEnd: true } });
  const expected = ctx2.tts.chunkText(TEXT, LOCAL);
  const r2 = run(ctx2, TEXT);
  assertSpokenOnce(ctx2, expected);
  assert.deepEqual(r2.ends, ['done']);
  assert.equal(ctx2.fake.cancels, 1, 'one recovery cancel');
  assert.equal(queuedTimes(ctx2, expected[1]), 2, 'the chunk stuck behind the stall was queued again once');
  assert.equal(queuedTimes(ctx2, expected[2]), 1);
});

// ---- quirk c: speak() inside onend is dropped -----------------------------------------------------

test('quirk c: speak() is never called inside an engine event, with queue-ahead or without start events', async (t) => {
  const ctx = await setup(t, { quirks: { dropSpeakInEnd: true } });
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  run(ctx, TEXT);
  assertSpokenOnce(ctx, expected);
  assert.equal(ctx.fake.submitted.filter((s) => s.dropped).length, 0);

  // No start events and short chunks: no queue-ahead, so every chunk is handed over after the
  // previous 'end' - deferred out of the handler, so nothing is dropped.
  const ctx2 = await setup(t, { boundaries: false, quirks: { dropSpeakInEnd: true, noStart: () => true } });
  const lines = ['One.', 'Two.', 'Three.', 'Four.', 'Five.'];
  const r2 = run(ctx2, lines.join('\n'));
  assertSpokenOnce(ctx2, lines);
  assert.deepEqual(r2.ends, ['done']);
  assert.equal(ctx2.fake.submitted.filter((s) => s.dropped).length, 0);

  // A new speak() from a callback that runs inside an engine event is not dropped either.
  const ctx3 = await setup(t, { quirks: { dropSpeakInEnd: true } });
  const r3 = recorder(ctx3.clock);
  let second = null;
  ctx3.tts.speak('First answer.', {
    onEnd: (e) => {
      r3.ends.push(e.reason);
      second = recorder(ctx3.clock);
      ctx3.tts.speak('Second answer.', second.opts);
    },
  });
  ctx3.clock.runUntil(() => second && second.ends.length > 0, 60_000);
  assert.deepEqual([r3.ends, second.ends], [['done'], ['done']]);
  assert.deepEqual(ctx3.fake.completed(), ['First answer.', 'Second answer.']);
});

// ---- quirk d: Chrome drops an utterance queued right after cancel() ----------------------------------

test('quirk d: the first utterance after a cancel() is dropped silently; it is spoken again after 3 s', async (t) => {
  const ctx = await setup(t, { quirks: { dropAfterCancelMs: 150 } });
  const first = recorder(ctx.clock);
  ctx.tts.speak(paragraph(20, 6), first.opts);
  ctx.clock.advance(4000);
  assert.ok(ctx.tts.isSpeaking());
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const audioBefore = ctx.fake.audio.length;
  const t0 = ctx.clock.now;
  const r = run(ctx, TEXT);
  assert.deepEqual(first.ends, ['cancelled']);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.fake.completed(), expected);
  assert.equal(ctx.fake.partial().length, 1, 'only the first answer was cut (by the new one)');
  assert.equal(ctx.fake.audio.length - audioBefore, expected.length);
  const firstTry = ctx.fake.submitted.find((s) => s.text === expected[0]);
  assert.equal(firstTry.dropped, 'after-cancel');
  assert.equal(queuedTimes(ctx, expected[0]), 2);
  const started = ctx.fake.audio[audioBefore].startT - t0;
  assert.ok(started >= 3000 && started < 3800, `respoken after the 3 s start time-out (${started} ms)`);
});

test('quirk d: a drop reported as a "canceled" error right after our cancel() is retried at once', async (t) => {
  const ctx = await setup(t, { quirks: { dropAfterCancelMs: 150, dropWithError: true } });
  ctx.tts.speak(paragraph(20, 6), {});
  ctx.clock.advance(4000);
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const audioBefore = ctx.fake.audio.length;
  const t0 = ctx.clock.now;
  const r = run(ctx, TEXT);
  assert.deepEqual(r.ends, ['done'], 'the error of a dropped utterance is not a foreign cancel');
  assert.deepEqual(ctx.fake.completed(), expected);
  const started = ctx.fake.audio[audioBefore].startT - t0;
  assert.ok(started < 600, `respoken after ${started} ms`);
});

test('quirk d: once speech is unlocked, the first speak() after a cancel() waits 250 ms instead of being dropped', async (t) => {
  const ctx = await setup(t, { quirks: { dropAfterCancelMs: 150 } });
  ctx.tts.unlockSpeech();
  ctx.clock.advance(1000);
  ctx.tts.speak(paragraph(20, 6), {});
  ctx.clock.advance(4000);
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const audioBefore = ctx.fake.audio.length;
  const t0 = ctx.clock.now;
  run(ctx, TEXT);
  assert.deepEqual(ctx.fake.completed(), expected);
  assert.equal(ctx.fake.submitted.filter((s) => s.dropped).length, 0);
  const started = ctx.fake.audio[audioBefore].startT - t0;
  assert.ok(started >= 250 && started < 400, `started after ${started} ms`);
});

test('unlockSpeech() then speak() in the same gesture: the first chunk is queued at once, the silent utterance is not cancelled', async (t) => {
  const ctx = await setup(t, { quirks: { dropAfterCancelMs: 150 } });
  ctx.tts.unlockSpeech();
  ctx.tts.unlockSpeech();
  const r = recorder(ctx.clock);
  ctx.tts.speak(TEXT, r.opts);
  assert.deepEqual(ctx.fake.submitted.map((s) => s.text), ['', ctx.tts.chunkText(TEXT, LOCAL)[0]], 'synchronously, inside the gesture');
  assert.equal(ctx.fake.cancels, 0);
  ctx.clock.runUntil(() => r.ends.length > 0, 10 * 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.fake.completed(), ctx.tts.chunkText(TEXT, LOCAL));
});

test('quirk d after a recovery cancel: the retry waits out the drop window, so it is not dropped again', async (t) => {
  const ctx = await setup(t, { quirks: { dropAfterCancelMs: 200, stuckSpeaking: true, dropEnd: (u, n) => n === 1, stallAfterLostEnd: true } });
  const expected = ctx.tts.chunkText(paragraph(0, 20), LOCAL);
  const r = run(ctx, paragraph(0, 20));
  assertSpokenOnce(ctx, expected);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.fake.cancels, 1);
  assert.equal(ctx.fake.submitted.filter((s) => s.dropped).length, 0);
});

// ---- quirk e: long utterances stop after ~15 s ------------------------------------------------------

test('quirk e: online-voice chunks stay under the 15 s cut-off; a cut-off that still happens is recovered', async (t) => {
  const ctx = await setup(t, { quirks: { cutoffMs: 15_000, cutoffOnlineOnly: true } });
  const long = paragraph(0, 30);
  for (const rate of [0.7, 1, 1.5]) {
    const before = ctx.fake.audio.length;
    const r = run(ctx, long, { voiceURI: VOICES.googleUK.voiceURI, rate });
    assert.deepEqual(r.ends, ['done']);
    assert.deepEqual(ctx.fake.completed().slice(before), ctx.tts.chunkText(long, Math.min(220, Math.floor(220 * rate))));
  }
  const local = ctx.fake.audio.length;
  run(ctx, long, { voiceURI: VOICES.daniel.voiceURI, rate: 0.7 });
  assert.deepEqual(ctx.fake.completed().slice(local), ctx.tts.chunkText(long, LOCAL), 'on-device voices are not cut');
  assert.equal(ctx.fake.partial().length, 0);

  // Every utterance cut after 4 s: each chunk is attempted, the stream still ends.
  const ctx2 = await setup(t, { quirks: { cutoffMs: 4000 } });
  const expected = ctx2.tts.chunkText(TEXT, LOCAL);
  const r2 = run(ctx2, TEXT);
  assert.deepEqual(r2.ends, ['done']);
  assert.deepEqual(ctx2.fake.audio.map((a) => a.text), expected, 'each chunk was heard (cut) once, in order');
  assert.ok(ctx2.fake.audio.every((a) => a.cut));
  for (const c of expected.slice(1)) assert.equal(queuedTimes(ctx2, c), 2);
});

// ---- quirk f: early or double end, no start, no boundaries ---------------------------------------------

test('quirk f: an early end does not queue a third utterance or cut the audio; onEnd waits for the last audio', async (t) => {
  const ctx = await setup(t, { quirks: { earlyEnd: () => 0.4 } });
  const expected = ctx.tts.chunkText(paragraph(0, 20), LOCAL);
  const r = run(ctx, paragraph(0, 20));
  assertSpokenOnce(ctx, expected);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.fake.cancels, 0);
  assert.deepEqual(r.chunks.map((c) => c.index), expected.map((_, i) => i));
  const last = ctx.fake.audio.at(-1);
  assert.ok(r.endT >= last.endT && r.endT - last.endT <= 300, `onEnd ${r.endT - last.endT} ms after the audio stopped`);

  // With speaking stuck true as well, onEnd waits no longer than that chunk's expected time.
  const ctx2 = await setup(t, { quirks: { earlyEnd: () => 0.4, stuckSpeaking: true } });
  const one = 'A single sentence whose end event comes far too early, while it is still being read.';
  const r2 = run(ctx2, one);
  const a = ctx2.fake.audio[0];
  const expectedEnd = a.startT + (one.length / 15) * 1000 + 500;
  assert.deepEqual(r2.ends, ['done']);
  assert.ok(r2.endT >= a.endT && r2.endT <= expectedEnd + 300, `onEnd at +${r2.endT - a.startT} ms, audio ${a.endT - a.startT} ms`);
});

test('quirk f: a double end is processed once', async (t) => {
  const ctx = await setup(t, { quirks: { doubleEnd: () => true } });
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const r = run(ctx, TEXT);
  assertSpokenOnce(ctx, expected);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(r.chunks.length, expected.length);
});

test('quirk f: audio without start or boundary events is not mistaken for a dropped utterance', async (t) => {
  const ctx = await setup(t, { boundaries: false, quirks: { noStart: () => true } });
  const expected = ctx.tts.chunkText(paragraph(0, 20), LOCAL);
  const r = run(ctx, paragraph(0, 20));
  assertSpokenOnce(ctx, expected);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.fake.cancels, 0, 'no retry of a chunk that was playing');
  assert.equal(r.starts, 1);
  assert.deepEqual(r.chunks.map((c) => c.text), expected);
  assert.equal(r.boundaries.length, 0);
});

test('quirk f combined: early, double and missing events on different chunks', async (t) => {
  const ctx = await setup(t, {
    boundaries: false,
    quirks: { earlyEnd: (u, n) => (n % 3 === 0 ? 0.3 : false), doubleEnd: (u, n) => n % 3 === 1, noStart: (u, n) => n % 2 === 0 },
  });
  const text = paragraph(0, 24);
  const expected = ctx.tts.chunkText(text, LOCAL);
  const r = run(ctx, text);
  assertSpokenOnce(ctx, expected);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.fake.cancels, 0);
});

// ---- quirk g: hidden page -------------------------------------------------------------------------

test('quirk g: time while the page is hidden is not counted; speech carries on when it is visible again', async (t) => {
  const ctx = await setup(t);
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const r = run(ctx, TEXT, {}, {
    before: () => {
      ctx.clock.advance(5000);
      ctx.fake.setHidden(true);
      ctx.clock.advance(10 * 60_000);
      ctx.fake.setHidden(false);
    },
  });
  assertSpokenOnce(ctx, expected);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.fake.cancels, 0, 'no recovery while the engine was paused');

  // A lost end with speaking stuck, on a voice without word events (nothing earlier to measure its
  // speed by): the time-out counts visible time only.
  const ctx2 = await setup(t, { boundaries: false, quirks: { stuckSpeaking: true, dropEnd: () => true } });
  const one = 'A single sentence whose end event never comes.';
  const timeout = Math.max(4000, 2.5 * (one.length / 15) * 1000 + 1500);
  const r2 = run(ctx2, one, {}, {
    before: () => {
      ctx2.clock.runUntil(() => ctx2.fake.audio.length && ctx2.fake.audio[0].complete, 10_000);
      ctx2.fake.setHidden(true);
      ctx2.clock.advance(5 * 60_000);
      ctx2.fake.setHidden(false);
    },
  });
  assert.deepEqual(r2.ends, ['done']);
  const fromStart = r2.endT - ctx2.fake.audio[0].startT - 5 * 60_000;
  assert.ok(fromStart >= timeout && fromStart <= timeout + 600, `visible time to the time-out: ${fromStart} ms (expected ${timeout})`);

  // With word events the deadline is 1.5 × the last word's time + 1 s after its boundary event:
  // visible time too.
  const ctx4 = await setup(t, { quirks: { stuckSpeaking: true, dropEnd: () => true } });
  const r4 = run(ctx4, one, {}, {
    before: () => {
      ctx4.clock.runUntil(() => ctx4.fake.audio.length && ctx4.fake.audio[0].complete, 10_000);
      ctx4.fake.setHidden(true);
      ctx4.clock.advance(5 * 60_000);
      ctx4.fake.setHidden(false);
    },
  });
  assert.deepEqual(r4.ends, ['done']);
  const lastWord = ctx4.fake.events.filter((e) => e.type === 'boundary').at(-1);
  const after = r4.endT - lastWord.t - 5 * 60_000;
  const deadline = 1.5 * (('comes.'.length / 15) * 1000) + 1000;
  assert.ok(after >= deadline && after <= deadline + 300, `visible time after the last word: ${after} ms (expected ${deadline})`);

  // Nothing starts while hidden: no start time-out either.
  const ctx3 = await setup(t);
  ctx3.fake.setHidden(true);
  const r3 = run(ctx3, TEXT, {}, {
    before: () => {
      ctx3.clock.advance(2 * 60_000);
      assert.equal(ctx3.fake.cancels, 0);
      ctx3.fake.setHidden(false);
    },
  });
  assertSpokenOnce(ctx3, expected);
  assert.deepEqual(r3.ends, ['done']);
});

// ---- quirk h: our own cancel's errors vs someone else's cancel -------------------------------------------

test("quirk h: 'interrupted'/'canceled' errors caused by our recovery cancel never end the session", async (t) => {
  const ctx = await setup(t, { quirks: { cancelErrorDelayMs: 700, stuckSpeaking: true, dropEnd: (u, n) => n === 0, stallAfterLostEnd: true } });
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const r = run(ctx, TEXT);
  assertSpokenOnce(ctx, expected);
  assert.deepEqual(r.ends, ['done']);
  assert.equal(ctx.fake.cancels, 1);
  assert.ok(ctx.fake.events.some((e) => e.type === 'error' && e.error === 'canceled'), 'the recovery cancel produced an error event');
});

test('quirk h: a cancel() by someone else ends the session with "interrupted", once, and nothing more is queued', async (t) => {
  const ctx = await setup(t);
  const r = run(ctx, paragraph(0, 30), {}, {
    before: () => {
      ctx.clock.runUntil(() => ctx.fake.audio.length === 2, 120_000);
      ctx.clock.advance(1000);
      globalThis.speechSynthesis.cancel(); // e.g. another tab or component
    },
  });
  assert.deepEqual(r.ends, ['interrupted']);
  assert.equal(ctx.fake.submitted.length, 3, 'chunk 3 had been queued ahead; nothing after the cancel');
  assert.ok(ctx.tts.chunkText(paragraph(0, 30), LOCAL).length > 5);
  assert.equal(ctx.fake.cancels, 1, 'we do not cancel over them');
});

test('late events of finished, replaced or given-up utterances are ignored', async (t) => {
  const ctx = await setup(t, { quirks: { dropAfterCancelMs: 150 } });
  ctx.tts.speak(paragraph(30, 4), {});
  ctx.clock.advance(2000);
  const old = ctx.fake.submitted[0].id; // spoken by the previous speak(): replaced
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const r = run(ctx, TEXT, {}, {
    before: () => {
      // The new speech's first utterance is dropped (quirk d) and given up after 3 s; stray events
      // of the replaced and the given-up utterance arrive later.
      ctx.clock.runUntil(() => ctx.fake.cancels === 2, 10_000);
      const givenUp = ctx.fake.submitted.find((s) => s.dropped).id;
      for (const id of [old, givenUp]) {
        ctx.fake.fire(id, 'start');
        ctx.fake.fire(id, 'boundary', { name: 'word', charIndex: 0, charLength: 4 });
        ctx.fake.fire(id, 'end');
        ctx.fake.fire(id, 'error', { error: 'interrupted' });
      }
      // Chunk 0 has finished and chunk 1 plays: stray events of chunk 0.
      ctx.clock.runUntil(() => ctx.fake.audio.filter((a) => a.text === expected[1]).length === 1, 120_000);
      ctx.clock.advance(1000);
      const first = ctx.fake.submitted.filter((s) => s.text === expected[0] && !s.dropped)[0].id;
      ctx.fake.fire(first, 'end');
      ctx.fake.fire(first, 'start');
      ctx.fake.fire(first, 'error', { error: 'interrupted' });
      ctx.fake.fire(first, 'boundary', { name: 'word', charIndex: 5, charLength: 2 });
    },
  });
  assertSpokenOnce(ctx, expected, { partial: 1 }); // the replaced speech was cut
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(r.chunks.map((c) => c.index), [0, 1, 2]);
  assert.ok(r.boundaries.every((b) => TEXT.slice(b.charIndex, b.charIndex + b.charLength) !== 'nten'));
});

// ---- cancel, stop, errors, broken engines ----------------------------------------------------------

test('cancel() stops at once: onEnd("cancelled") exactly once, the engine queue is empty, late events are ignored', async (t) => {
  const ctx = await setup(t, { quirks: { cancelErrorDelayMs: 50 } });
  const r = recorder(ctx.clock);
  const handle = ctx.tts.speak(TEXT, r.opts);
  ctx.clock.advance(3000);
  assert.equal(ctx.fake.queued(), 2);
  handle.cancel();
  assert.deepEqual(r.ends, ['cancelled'], 'synchronously');
  assert.equal(ctx.fake.queued(), 0);
  assert.equal(ctx.tts.isSpeaking(), false);
  handle.cancel();
  ctx.tts.stopSpeaking();
  const n = ctx.fake.submitted.length;
  ctx.clock.advance(60_000);
  assert.deepEqual(r.ends, ['cancelled']);
  assert.equal(ctx.fake.submitted.length, n);
  assert.equal(ctx.fake.cancels, 1);

  // stopSpeaking() cancels the active speech the same way.
  const r2 = recorder(ctx.clock);
  ctx.tts.speak(TEXT, r2.opts);
  ctx.clock.advance(2000);
  ctx.tts.stopSpeaking();
  assert.deepEqual(r2.ends, ['cancelled']);
  assert.equal(ctx.fake.queued(), 0);
});

test('a chunk that fails is skipped and the rest is spoken; "not-allowed" ends with "error"', async (t) => {
  const ctx = await setup(t, { quirks: { failWith: (u, n) => (n === 1 ? 'synthesis-failed' : '') } });
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const r = run(ctx, TEXT);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.fake.completed(), [expected[0], expected[2]]);

  const ctx2 = await setup(t, { quirks: { failWith: () => 'not-allowed' } });
  const r2 = run(ctx2, TEXT);
  assert.deepEqual(r2.ends, ['error']);
  assert.deepEqual(ctx2.fake.completed(), []);
});

test('a dead engine that forgets what it is given (nothing plays, no events, never "speaking") ends with "error" after two chunks were given up, never stuck', async (t) => {
  const ctx = await setup(t, { quirks: { deadEngine: true, invisibleDrops: true } });
  const r = run(ctx, paragraph(0, 30));
  assert.deepEqual(r.ends, ['error']);
  assert.ok(r.ms >= 12_000 && r.ms <= 14_000, `${r.ms} ms`);
  assert.equal(ctx.fake.submitted.length, 4, 'two chunks, each tried twice');
  assert.equal(r.starts, 0);
});

test('without speechSynthesis: unsupported, asynchronously; an empty text ends with "empty"', async (t) => {
  const ctx = await setup(t);
  const r = recorder(ctx.clock);
  ctx.tts.speak('   \n ', r.opts);
  assert.deepEqual(r.ends, []);
  ctx.clock.advance(10);
  assert.deepEqual(r.ends, ['empty']);
  assert.equal(ctx.fake.submitted.length, 0);
  delete globalThis.speechSynthesis;
  const r2 = recorder(ctx.clock);
  const stream = ctx.tts.createSpeechStream(r2.opts);
  stream.append('Hello. ');
  stream.finish();
  assert.deepEqual(r2.ends, []);
  ctx.clock.advance(10);
  assert.deepEqual(r2.ends, ['unsupported']);
  assert.equal(stream.active(), false);
  assert.equal(ctx.tts.isSpeaking(), false);
});

test('exceptions in callbacks are caught and logged; speech carries on', async (t) => {
  const ctx = await setup(t);
  const boom = () => {
    throw new Error('ui bug');
  };
  const expected = ctx.tts.chunkText(TEXT, LOCAL);
  const ends = [];
  ctx.tts.speak(TEXT, { onStart: boom, onChunk: boom, onBoundary: boom, onEnd: (e) => ends.push(e.reason) });
  ctx.clock.runUntil(() => ends.length > 0, 10 * 60_000);
  assert.deepEqual(ends, ['done']);
  assert.deepEqual(ctx.fake.completed(), expected);
  assert.ok(ctx.errors.length > 3 && ctx.errors.every((e) => e.includes('ui bug')));
});

// ---- everything at once ----------------------------------------------------------------------

function prng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

test('chaos: random combinations of quirks a-d, f, g and h, 40 seeds', async (t) => {
  for (let seed = 1; seed <= 40; seed++) {
    const rnd = prng(seed * 7919);
    const pick = (p) => rnd() < p;
    const lostEnd = new Set();
    const early = new Set();
    const double = new Set();
    const noStart = new Set();
    for (let n = 0; n < 40; n++) {
      if (pick(0.3)) lostEnd.add(n);
      if (pick(0.2)) early.add(n);
      if (pick(0.2)) double.add(n);
      if (pick(0.3)) noStart.add(n);
    }
    const quirks = {
      stuckSpeaking: pick(0.5),
      dropEnd: (u, n) => lostEnd.has(n),
      stallAfterLostEnd: pick(0.3),
      dropSpeakInEnd: pick(0.5),
      dropAfterCancelMs: pick(0.5) ? 200 : 0,
      earlyEnd: (u, n) => (early.has(n) ? 0.5 : false),
      doubleEnd: (u, n) => double.has(n),
      noStart: (u, n) => noStart.has(n),
      cancelErrorDelayMs: Math.floor(rnd() * 800),
    };
    const ctx = await setup(t, { boundaries: pick(0.5), quirks });
    const text = paragraph(seed, 10 + Math.floor(rnd() * 10)) + '\nAnd that is the summary, sir.';
    const voiceURI = pick(0.5) ? VOICES.daniel.voiceURI : VOICES.googleUK.voiceURI;
    const rate = [0.8, 1, 1.25][Math.floor(rnd() * 3)];
    const limit = voiceURI === VOICES.daniel.voiceURI ? LOCAL : Math.min(220, Math.floor(220 * rate));
    const expected = ctx.tts.chunkText(text, limit);
    const hideAt = pick(0.5) ? 2000 + Math.floor(rnd() * 20_000) : -1;
    const r = run(ctx, text, { voiceURI, rate }, {
      before: () => {
        if (hideAt < 0) return;
        ctx.clock.advance(hideAt);
        ctx.fake.setHidden(true);
        ctx.clock.advance(60_000);
        ctx.fake.setHidden(false);
      },
    });
    const label = `seed ${seed}: ${JSON.stringify({ ...quirks, voiceURI, rate, hideAt })}`;
    assert.deepEqual(r.ends, ['done'], label);
    assert.deepEqual(withoutSilentRepeats(ctx), expected, label);
    assert.equal(ctx.fake.partial().length, 0, label);
    assert.ok(ctx.fake.maxOurs <= 2, label);
    for (const c of expected) assertAttempts(ctx, c, label);
  }
});

/**
 * A chunk reaches the engine's platform at most twice (once more after a drop), and is queued at
 * most twice, or three times when one of those never reached the platform because it waited behind
 * an utterance the engine never completed (a stall: queuing it again costs no retry).
 */
function assertAttempts(ctx, text, label) {
  const calls = ctx.fake.submitted.filter((s) => s.text === text);
  const reached = calls.filter((s) => s.reached).length;
  const stuckBehind = calls.filter((s) => !s.reached && !s.dropped).length;
  assert.ok(reached <= 2, `${label}: reached the platform ${reached} times: ${text.slice(0, 40)}`);
  assert.ok(calls.length <= 2 || (calls.length === 3 && stuckBehind >= 1), `${label}: queued ${calls.length} times: ${text.slice(0, 40)}`);
}

/**
 * What was heard, in order, where a chunk heard twice in a row is counted once only if its first
 * playing sent no event at all (no start, boundary or end) and the engine then held it (stalled):
 * in Chromium and WebKit that is exactly what a silently dropped utterance looks like, so it is
 * spoken again rather than risk losing it. Any other repeat stays in the list (and fails).
 */
function withoutSilentRepeats(ctx) {
  const evented = new Set(ctx.fake.events.filter((e) => e.type === 'start' || e.type === 'boundary' || e.type === 'end').map((e) => e.id));
  const out = [];
  let prev = null;
  for (const a of ctx.fake.audio.filter((x) => x.complete)) {
    if (prev && prev.text === a.text && !evented.has(prev.id)) {
      prev = a;
      continue;
    }
    out.push(a.text);
    prev = a;
  }
  return out;
}
