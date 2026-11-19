// Speech streams (tts.js createSpeechStream): text appended while it is spoken, as Voice Mode
// does with a reply that is still streaming. Runs against the fake engine on a virtual clock
// (platform.voice.fakeengine.test.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock, createFakeSpeech, VOICES } from './platform.voice.fakeengine.test.mjs';

let loads = 0;

async function setup(t, config = {}) {
  const clock = installClock();
  const fake = createFakeSpeech(clock, config).install();
  const tts = await import(`../../src/platform/voice/tts.js?stream=${++loads}`);
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

function prng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const REPLY = [
  'Good evening, sir. The forecast for London is mild, with light rain after six.',
  'Your three o’clock with Pepper moved to Thursday. She sent the revised budget, which is about twelve percent under last quarter.',
  'Two items need you today: the lab inspection at four, and the Stark Expo keynote draft. Shall I read the draft?',
  'One last thing: the suit diagnostics finished overnight, and every system is nominal',
].join('\n');

/** Append `raw` in random pieces (mid-word and mid-sentence), with time passing in between. */
function streamIn(ctx, stream, raw, rnd, { maxPiece = 14, maxGap = 300, check } = {}) {
  let i = 0;
  let sent = '';
  while (i < raw.length) {
    const n = 1 + Math.floor(rnd() * maxPiece);
    const piece = raw.slice(i, i + n);
    i += n;
    sent += piece;
    if (check) check(sent);
    stream.append(piece);
    ctx.clock.advance(Math.floor(rnd() * maxGap));
  }
  return sent;
}

test('stream: text appended in many pieces (mid-word, mid-sentence) is spoken once, in order, in whole sentences queued only when complete', async (t) => {
  for (let seed = 1; seed <= 12; seed++) {
    const ctx = await setup(t);
    const rnd = prng(seed);
    const r = recorder();
    const stream = ctx.tts.createSpeechStream({ ...r.opts, voiceURI: seed % 2 ? VOICES.googleUK.voiceURI : '' });
    let raw = '';
    let finished = false;
    // Every utterance must be complete when it is queued: whole sentences or lines, followed by
    // whitespace (or the end after finish()).
    const speak = globalThis.speechSynthesis.speak;
    globalThis.speechSynthesis.speak = (u) => {
      const text = stream.text();
      const at = text.indexOf(u.text);
      assert.ok(at >= 0, `queued text is in text(): ${u.text}`);
      const end = at + u.text.length;
      const complete = end < text.length ? text[end] === ' ' : finished || /\s$/.test(raw);
      assert.ok(complete, `queued before it was complete: "${u.text}" (seed ${seed})`);
      assert.match(u.text, /([.!?…]["'”’)\]]*|nominal)$/, 'whole sentences or a whole line');
      speak(u);
    };
    raw = streamIn(ctx, stream, REPLY, rnd, { check: (sent) => (raw = sent) });
    assert.equal(stream.text(), REPLY.replace(/\s+/g, ' '));
    ctx.clock.runUntil(() => stream.spokenUpTo() >= REPLY.lastIndexOf('\n'), 10 * 60_000);
    ctx.clock.advance(100);
    assert.equal(r.log.at(-1), 'idle', 'onIdle once it caught up');
    assert.ok(!ctx.fake.completed().join(' ').includes('nominal'), 'the unfinished last line waits');
    finished = true;
    stream.finish();
    ctx.clock.runUntil(() => r.ends.length > 0, 10 * 60_000);
    assert.deepEqual(r.ends, ['done']);
    assert.equal(ctx.fake.completed().join(' '), stream.text());
    assert.equal(ctx.fake.submitted.length, ctx.fake.completed().length, 'nothing queued twice');
    assert.ok(ctx.fake.maxOurs <= 2);
    assert.deepEqual(r.chunks.map((c) => c.text), ctx.fake.completed());
    for (const c of r.chunks) assert.equal(stream.text().slice(c.start, c.end), c.text);
    assert.equal(stream.spokenUpTo(), stream.text().length);
    assert.equal(stream.active(), false);
  }
});

test('stream: complete sentences start at once; the tail waits for more text or finish(); onIdle each time it catches up', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const stream = ctx.tts.createSpeechStream(r.opts);
  stream.append('Good evening, sir. The weather');
  assert.deepEqual(ctx.fake.submitted.map((s) => s.text), ['Good evening, sir.'], 'queued synchronously');
  ctx.clock.advance(10_000);
  assert.deepEqual(r.log, ['start', 'chunk:Good evening, sir.', 'idle']);
  stream.append(' today is mild');
  ctx.clock.advance(5000);
  assert.equal(ctx.fake.submitted.length, 1, 'no end punctuation yet');
  stream.append('. Rain later');
  ctx.clock.advance(10_000);
  assert.deepEqual(ctx.fake.completed(), ['Good evening, sir.', 'The weather today is mild.']);
  // A sentence end at the very end of the text is not complete until whitespace follows ("3." may become "3.5").
  stream.append(' at 3.');
  ctx.clock.advance(5000);
  assert.equal(ctx.fake.submitted.length, 2);
  stream.append('5 inches. ');
  ctx.clock.advance(10_000);
  assert.deepEqual(ctx.fake.completed().at(-1), 'Rain later at 3.5 inches.');
  // A line break completes a line without punctuation.
  stream.append('Agenda\nItem one');
  ctx.clock.advance(5000);
  assert.deepEqual(ctx.fake.completed().at(-1), 'Agenda');
  assert.equal(r.idles, 4);
  stream.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(ctx.fake.completed().at(-1), 'Item one');
  assert.deepEqual(r.log.slice(-3), ['idle', 'chunk:Item one', 'end:done']);
  assert.equal(r.idles, 4, 'no onIdle after finish()');
});

test('stream: onChunk and onBoundary offsets index into text(); spokenUpTo() follows the audio', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const ups = [];
  const stream = ctx.tts.createSpeechStream({
    ...r.opts,
    onChunk: (c) => {
      r.chunks.push(c);
      ups.push(stream.spokenUpTo());
    },
  });
  stream.append('  Hello   there.\n\n  General ');
  assert.equal(stream.text(), 'Hello there. General');
  stream.append('Kenobi. You are a bold one.\nOne more line, sir. ');
  stream.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  const text = stream.text();
  assert.equal(text, 'Hello there. General Kenobi. You are a bold one. One more line, sir.');
  assert.deepEqual(r.chunks.map((c) => c.text), ['Hello there.', 'General Kenobi. You are a bold one.', 'One more line, sir.']);
  for (const c of r.chunks) assert.equal(text.slice(c.start, c.end), c.text);
  assert.deepEqual(ups, [0, r.chunks[0].end, r.chunks[1].end]);
  const words = r.boundaries.map((b) => text.slice(b.charIndex, b.charIndex + b.charLength));
  assert.deepEqual(words, text.split(' '));
  assert.deepEqual([...new Set(r.boundaries.map((b) => b.chunkIndex))], [0, 1, 2]);
  assert.equal(stream.spokenUpTo(), text.length);
});

test('stream: a new stream or speak() cancels the previous one; stopSpeaking() and isSpeaking() cover streams', async (t) => {
  const ctx = await setup(t);
  const r1 = recorder();
  const s1 = ctx.tts.createSpeechStream(r1.opts);
  s1.append('First stream, first sentence. First stream, second sentence. ');
  ctx.clock.advance(1000);
  assert.equal(ctx.tts.isSpeaking(), true);
  const r2 = recorder();
  const s2 = ctx.tts.createSpeechStream(r2.opts);
  assert.deepEqual(r1.ends, ['cancelled'], 'synchronously');
  assert.equal(s1.active(), false);
  assert.equal(ctx.fake.queued(), 0, 'the old stream left nothing in the engine');
  s1.append('Ignored now. ');
  s1.finish();
  s1.cancel();
  assert.deepEqual(r1.ends, ['cancelled']);
  s2.append('Second stream. ');
  ctx.clock.advance(5000);
  // Idle, waiting for more text: still "speaking" (the session is open).
  assert.equal(ctx.tts.isSpeaking(), true);
  assert.equal(r2.idles, 1);
  const r3 = recorder();
  ctx.tts.speak('A replacement that is cut short.', r3.opts);
  assert.deepEqual(r2.ends, ['cancelled']);
  ctx.clock.advance(500);
  const r4 = recorder();
  const s4 = ctx.tts.createSpeechStream(r4.opts);
  assert.deepEqual(r3.ends, ['cancelled'], 'a stream cancels speak()');
  s4.append('Fourth. ');
  ctx.tts.stopSpeaking();
  assert.deepEqual(r4.ends, ['cancelled']);
  assert.equal(ctx.tts.isSpeaking(), false);
  ctx.clock.advance(30_000);
  assert.deepEqual(ctx.fake.completed(), ['Second stream.']);
  assert.ok(!ctx.fake.submitted.some((s) => /Ignored|Fourth/.test(s.text) && !s.dropped && ctx.fake.completed().includes(s.text)));
  for (const r of [r1, r2, r3, r4]) assert.equal(r.ends.length, 1);
});

test('stream: finish() with nothing ends "empty"; finish()/cancel() are idempotent; append() after finish() is ignored', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.tts.createSpeechStream(r.opts);
  s.append('   \n ');
  s.finish();
  s.finish();
  ctx.clock.advance(10);
  assert.deepEqual(r.ends, ['empty']);
  assert.equal(s.active(), false);
  const r2 = recorder();
  const s2 = ctx.tts.createSpeechStream(r2.opts);
  s2.append('Only this. ');
  s2.finish();
  s2.append('Not this. ');
  s2.finish();
  ctx.clock.runUntil(() => r2.ends.length > 0, 60_000);
  s2.cancel();
  assert.deepEqual(r2.ends, ['done']);
  assert.deepEqual(ctx.fake.completed(), ['Only this.']);
  assert.equal(s2.text(), 'Only this.');
  // finish() once everything has been spoken ends the stream, not inside finish() itself.
  const r3 = recorder();
  const s3 = ctx.tts.createSpeechStream(r3.opts);
  s3.append('Spoken already. ');
  ctx.clock.advance(10_000);
  s3.finish();
  assert.deepEqual(r3.ends, []);
  ctx.clock.advance(10);
  assert.deepEqual(r3.ends, ['done']);
  // Non-string input.
  const r4 = recorder();
  const s4 = ctx.tts.createSpeechStream(r4.opts);
  s4.append(null);
  s4.append(undefined);
  s4.append(42);
  s4.finish();
  ctx.clock.runUntil(() => r4.ends.length > 0, 60_000);
  assert.deepEqual([r4.ends, ctx.fake.completed().at(-1)], [['done'], '42']);
});

test('stream: a sentence longer than a chunk is released in clause-sized pieces while it is still streaming', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.tts.createSpeechStream({ ...r.opts, voiceURI: VOICES.googleUK.voiceURI }); // 220-character chunks
  const clauses = Array.from({ length: 12 }, (_, i) => `clause number ${i + 1} adds another detail to the list`);
  const long = clauses.join(', ');
  s.append(long.slice(0, 300));
  ctx.clock.advance(100);
  assert.equal(ctx.fake.submitted.length, 1, 'the first piece is queued before the sentence ends');
  assert.ok(ctx.fake.submitted[0].text.endsWith(',') && ctx.fake.submitted[0].text.length <= 220);
  s.append(long.slice(300) + '. Then a short one.');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 10 * 60_000);
  assert.equal(ctx.fake.completed().join(' '), s.text());
  assert.ok(ctx.fake.completed().every((c) => c.length <= 220));
  assert.deepEqual(r.ends, ['done']);
});

test('stream: voices that load late (Chrome): text waits, then is spoken with the chosen voice', async (t) => {
  const ctx = await setup(t, { voices: [] });
  const r = recorder();
  const s = ctx.tts.createSpeechStream({ ...r.opts, voiceURI: VOICES.googleUK.voiceURI });
  s.append('Waiting for voices. ');
  ctx.clock.advance(200);
  assert.equal(ctx.fake.submitted.length, 0);
  ctx.fake.setVoices([VOICES.daniel, VOICES.googleUK]);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  ctx.clock.advance(100);
  assert.deepEqual(ctx.fake.submitted.map((x) => [x.text, x.voice]), [['Waiting for voices.', VOICES.googleUK.voiceURI]]);
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);

  // No voices at all (after 1.5 s): the browser's default voice.
  const ctx2 = await setup(t, { voices: [] });
  const r2 = recorder();
  ctx2.tts.speak('Default voice.', r2.opts);
  ctx2.clock.advance(1600);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  ctx2.clock.runUntil(() => r2.ends.length > 0, 60_000);
  assert.deepEqual([r2.ends, ctx2.fake.submitted[0].voice], [['done'], null]);
});

test('stream: append() and speak() from inside callbacks are safe (WebKit drops speak() inside onend)', async (t) => {
  const ctx = await setup(t, { quirks: { dropSpeakInEnd: true } });
  const r = recorder();
  const parts = ['Second sentence arrives from onIdle. ', 'Third one too. '];
  const s = ctx.tts.createSpeechStream({
    ...r.opts,
    onIdle: () => {
      r.idles += 1;
      if (parts.length) s.append(parts.shift());
      else s.finish();
    },
    onChunk: (c) => {
      r.chunks.push(c);
      if (c.index === 0) s.append('');
    },
  });
  s.append('First sentence. ');
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.fake.completed(), ['First sentence.', 'Second sentence arrives from onIdle.', 'Third one too.']);
  assert.equal(ctx.fake.submitted.filter((x) => x.dropped).length, 0);
});

test('stream: exceptions in callbacks are caught and logged; the stream carries on', async (t) => {
  const ctx = await setup(t);
  const ends = [];
  const s = ctx.tts.createSpeechStream({
    onIdle: () => {
      throw new Error('idle bug');
    },
    onChunk: () => {
      throw new Error('chunk bug');
    },
    onEnd: (e) => ends.push(e.reason),
  });
  s.append('One. ');
  ctx.clock.advance(10_000);
  s.append('Two. ');
  s.finish();
  ctx.clock.runUntil(() => ends.length > 0, 60_000);
  assert.deepEqual(ends, ['done']);
  assert.deepEqual(ctx.fake.completed(), ['One.', 'Two.']);
  assert.ok(ctx.errors.some((e) => e.includes('idle bug')) && ctx.errors.some((e) => e.includes('chunk bug')));
});

test('stream: under engine quirks (a, b, c, f, h) a streamed reply is still spoken once, in order', async (t) => {
  for (let seed = 1; seed <= 16; seed++) {
    const rnd = prng(seed * 31);
    const lost = new Set();
    const noStart = new Set();
    const early = new Set();
    for (let n = 0; n < 30; n++) {
      if (rnd() < 0.3) lost.add(n);
      if (rnd() < 0.3) noStart.add(n);
      if (rnd() < 0.2) early.add(n);
    }
    const ctx = await setup(t, {
      boundaries: rnd() < 0.5,
      quirks: {
        stuckSpeaking: rnd() < 0.5,
        dropEnd: (u, n) => lost.has(n),
        stallAfterLostEnd: rnd() < 0.3,
        dropSpeakInEnd: true,
        noStart: (u, n) => noStart.has(n),
        earlyEnd: (u, n) => (early.has(n) ? 0.4 : false),
        doubleEnd: (u, n) => n % 4 === 3,
        cancelErrorDelayMs: Math.floor(rnd() * 600),
      },
    });
    const r = recorder();
    const s = ctx.tts.createSpeechStream(r.opts);
    streamIn(ctx, s, REPLY + '. And that is all.', rnd, { maxPiece: 20, maxGap: 500 });
    s.finish();
    ctx.clock.runUntil(() => r.ends.length > 0, 20 * 60_000);
    const label = `seed ${seed}`;
    assert.deepEqual(r.ends, ['done'], label);
    assert.equal(ctx.fake.completed().join(' '), s.text(), label);
    assert.equal(ctx.fake.partial().length, 0, label);
    assert.ok(ctx.fake.maxOurs <= 2, label);
    assert.equal(new Set(ctx.fake.completed()).size, ctx.fake.completed().length, label);
  }
});
