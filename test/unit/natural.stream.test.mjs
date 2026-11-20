// The natural voice's speech stream (natural/natural-stream.js): the tts.js stream contract
// (platform.voice.stream.test.mjs, same scenarios where they apply) on a fake worker engine and
// a fake audio clock, plus what is specific to it: gapless scheduling, prefetch, cancel, the
// audio clock pausing, and the handoff when synthesis is too slow or fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock, createFakeEngine, createFakeAudio, SR } from './natural.fakes.mjs';

let loads = 0;

async function setup(t, { rtf = 0.4, failOn, latency = 0, handoff = false } = {}) {
  const clock = installClock();
  const engine = createFakeEngine(clock, { rtf, failOn });
  const audio = createFakeAudio(clock, { latency });
  const mod = await import(`../../src/platform/voice/natural/natural-stream.js?n=${++loads}`);
  const errors = [];
  const consoleError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  const handoffs = [];
  const deps = { engine, audio, voice: 'bm_george', onHandoff: handoff ? (h) => handoffs.push(h) : undefined };
  t.after(() => {
    console.error = consoleError;
    clock.restore();
  });
  return { clock, engine, audio, mod, deps, errors, handoffs };
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

function streamIn(ctx, stream, raw, rnd, { maxPiece = 14, maxGap = 300 } = {}) {
  let i = 0;
  while (i < raw.length) {
    const n = 1 + Math.floor(rnd() * maxPiece);
    stream.append(raw.slice(i, i + n));
    i += n;
    ctx.clock.advance(Math.floor(rnd() * maxGap));
  }
}

test('natural stream: text appended in pieces (mid-word, mid-sentence) is synthesized once, in order, in whole sentences, and played gaplessly', async (t) => {
  for (let seed = 1; seed <= 10; seed++) {
    const ctx = await setup(t, { rtf: 0.3 });
    const rnd = prng(seed);
    const r = recorder();
    const stream = ctx.mod.createNaturalStream(ctx.deps, r.opts);
    streamIn(ctx, stream, REPLY, rnd);
    assert.equal(stream.text(), REPLY.replace(/\s+/g, ' '));
    // Every request is complete text: whole sentences or a whole line.
    for (const q of ctx.engine.requests) {
      assert.ok(stream.text().includes(q.text), `requested text is in text(): ${q.text}`);
      assert.match(q.text, /([.!?…]["'”’)\]]*|[,;:])$/, `whole sentences or a clause: "${q.text}" (seed ${seed})`);
    }
    ctx.clock.runUntil(() => r.idles > 0 && stream.spokenUpTo() >= REPLY.lastIndexOf('\n'), 10 * 60_000);
    assert.ok(!ctx.engine.requests.some((q) => q.text.includes('nominal')), 'the unfinished last line waits');
    stream.finish();
    ctx.clock.runUntil(() => r.ends.length > 0, 10 * 60_000);
    assert.deepEqual(r.ends, ['done'], `seed ${seed}`);
    assert.equal(ctx.engine.requests.map((q) => q.text).join(' '), stream.text(), 'everything once, in order');
    assert.deepEqual(r.chunks.map((c) => c.text), ctx.engine.requests.map((q) => q.text));
    for (const c of r.chunks) assert.equal(stream.text().slice(c.start, c.end), c.text);
    assert.equal(stream.spokenUpTo(), stream.text().length);
    assert.equal(stream.active(), false);
    assert.ok(ctx.engine.requests[0].text.length <= 140, 'a short first chunk');
    assert.ok(ctx.engine.requests.every((q) => q.text.length <= 260));
    assert.equal(r.starts, 1);
    // No overlaps: each chunk starts after the previous one ended.
    const p = ctx.audio.played;
    for (let i = 1; i < p.length; i++) assert.ok(p[i].when >= p[i - 1].when + p[i - 1].duration - 1e-9, `no overlap at ${i}`);
  }
});

test('natural stream: complete sentences are sent at once; the tail waits for more text or finish(); onIdle each time it catches up', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const stream = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  stream.append('Good evening, sir. The weather');
  assert.deepEqual(ctx.engine.requests.map((q) => q.text), ['Good evening, sir.'], 'requested synchronously');
  ctx.clock.advance(10_000);
  assert.deepEqual(r.log, ['start', 'chunk:Good evening, sir.', 'idle']);
  stream.append(' today is mild');
  ctx.clock.advance(5000);
  assert.equal(ctx.engine.requests.length, 1, 'no end punctuation yet');
  stream.append('. Rain later');
  ctx.clock.advance(10_000);
  assert.deepEqual(ctx.engine.completed, ['Good evening, sir.', 'The weather today is mild.']);
  stream.append(' at 3.');
  ctx.clock.advance(5000);
  assert.equal(ctx.engine.requests.length, 2, '"3." may become "3.5"');
  stream.append('5 inches. ');
  ctx.clock.advance(10_000);
  assert.equal(ctx.engine.completed.at(-1), 'Rain later at 3.5 inches.');
  stream.append('Agenda\nItem one');
  ctx.clock.advance(5000);
  assert.equal(ctx.engine.completed.at(-1), 'Agenda', 'a line break completes a line');
  assert.equal(r.idles, 4);
  stream.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.equal(ctx.engine.completed.at(-1), 'Item one');
  assert.deepEqual(r.log.slice(-3), ['idle', 'chunk:Item one', 'end:done']);
  assert.equal(r.idles, 4, 'no onIdle after finish()');
});

test('natural stream: onChunk and estimated onBoundary offsets index into text(); spokenUpTo() follows the audio', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const ups = [];
  const stream = ctx.mod.createNaturalStream(ctx.deps, {
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
  assert.deepEqual(words, text.split(' '), 'one boundary per word, in order');
  assert.deepEqual([...new Set(r.boundaries.map((b) => b.chunkIndex))], [0, 1, 2]);
  assert.ok(r.boundaries.every((b) => b.name === 'word'));
  assert.equal(stream.spokenUpTo(), text.length);
});

test('natural stream: chunks are scheduled back to back with a pause that depends on how the previous one ended', async (t) => {
  const ctx = await setup(t, { rtf: 0.2 });
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, { ...r.opts, rate: 1.25 });
  s.append('First, a clause that is long enough to be cut somewhere sensible because it keeps going on and on, without any end in sight, until finally it is cut here. Second sentence.\nThird line. ');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 120_000);
  assert.deepEqual(r.ends, ['done']);
  const T = ctx.mod.NATURAL_TIMING;
  const p = ctx.audio.played;
  const q = ctx.engine.requests.map((x) => x.text);
  assert.ok(q.length >= 3);
  assert.ok(ctx.engine.requests.every((x) => x.speed === 1.25), 'speaking speed -> Kokoro speed');
  const norm = s.text();
  const raw = 'First, a clause that is long enough to be cut somewhere sensible because it keeps going on and on, without any end in sight, until finally it is cut here. Second sentence.\nThird line. ';
  for (let i = 1; i < p.length; i++) {
    const gap = p[i].when - (p[i - 1].when + p[i - 1].duration);
    const prevText = q[i - 1];
    const end = norm.indexOf(prevText) + prevText.length;
    const breakAfter = raw[end] === '\n';
    const expected = breakAfter ? T.pauseBreak : /[.!?]$/.test(prevText) ? T.pauseSentence : /[,;:]$/.test(prevText) ? T.pauseClause : T.pauseSpace;
    assert.ok(Math.abs(gap - expected / 1.25) < 1e-6, `gap after "${prevText}" is ${gap.toFixed(3)} s, expected ${(expected / 1.25).toFixed(3)} s`);
  }
  // Silence was trimmed: 0.1 s head and 0.15 s tail of the fake audio became 20 ms and 50 ms.
  const first = p[0];
  const rawSeconds = 0.1 + Math.max(0.2, q[0].length / (15 * 1.25)) + 0.15;
  assert.ok(Math.abs(first.duration - (rawSeconds - 0.08 - 0.1)) < 0.002, `trimmed duration ${first.duration}`);
});

test('natural stream: at most two chunks are synthesized ahead of the one playing', async (t) => {
  const ctx = await setup(t, { rtf: 0.05 });
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  const sentences = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} is here.`);
  s.append(sentences.join('\n') + '\n');
  let maxAhead = 0;
  const T = ctx.mod.NATURAL_TIMING;
  for (let k = 0; k < 400 && !r.ends.length; k++) {
    ctx.clock.advance(100);
    const playing = r.chunks.length; // chunks that have started
    const requested = ctx.engine.requests.length;
    maxAhead = Math.max(maxAhead, requested - playing);
    if (requested === sentences.length) s.finish();
  }
  ctx.clock.runUntil(() => r.ends.length > 0, 120_000);
  assert.deepEqual(r.ends, ['done']);
  assert.ok(maxAhead <= T.prefetch + 1, `requested ahead of playback: ${maxAhead}`);
  assert.equal(ctx.engine.completed.length, sentences.length);
});

test('natural stream: a new stream cancels the previous one; cancel() stops the audio now and drops queued synthesis', async (t) => {
  const ctx = await setup(t, { rtf: 0.5 });
  const r1 = recorder();
  const s1 = ctx.mod.createNaturalStream(ctx.deps, r1.opts);
  s1.append('First stream, first sentence. First stream, second sentence. First stream, third. ');
  ctx.clock.runUntil(() => r1.chunks.length === 1, 30_000);
  assert.equal(ctx.mod.naturalSpeaking(), true);
  const before = ctx.audio.played.length;
  assert.ok(before >= 1);
  const r2 = recorder();
  const s2 = ctx.mod.createNaturalStream(ctx.deps, r2.opts);
  assert.deepEqual(r1.ends, ['cancelled'], 'synchronously');
  assert.equal(s1.active(), false);
  assert.ok(ctx.audio.played.slice(0, before).every((p) => p.stopped), 'its audio stopped at once');
  assert.ok(ctx.engine.cancelled.length >= 1, 'its queued synthesis was cancelled');
  s1.append('Ignored now. ');
  s1.finish();
  s1.cancel();
  assert.deepEqual(r1.ends, ['cancelled']);
  s2.append('Second stream. ');
  ctx.clock.advance(5000);
  assert.equal(r2.idles, 1);
  ctx.mod.stopNatural();
  assert.deepEqual(r2.ends, ['cancelled']);
  assert.equal(ctx.mod.naturalSpeaking(), false);
  assert.ok(!ctx.engine.requests.some((q) => /Ignored/.test(q.text)));
});

test('natural stream: finish() with nothing ends "empty"; finish()/cancel() are idempotent; append() after finish() is ignored; non-strings', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append('   \n ');
  s.finish();
  s.finish();
  ctx.clock.advance(10);
  assert.deepEqual(r.ends, ['empty']);
  const r2 = recorder();
  const s2 = ctx.mod.createNaturalStream(ctx.deps, r2.opts);
  s2.append('Only this. ');
  s2.finish();
  s2.append('Not this. ');
  s2.finish();
  ctx.clock.runUntil(() => r2.ends.length > 0, 60_000);
  s2.cancel();
  assert.deepEqual(r2.ends, ['done']);
  assert.equal(s2.text(), 'Only this.');
  // finish() once everything has been spoken ends the stream, not inside finish() itself.
  const r3 = recorder();
  const s3 = ctx.mod.createNaturalStream(ctx.deps, r3.opts);
  s3.append('Spoken already. ');
  ctx.clock.advance(10_000);
  s3.finish();
  assert.deepEqual(r3.ends, []);
  ctx.clock.advance(10);
  assert.deepEqual(r3.ends, ['done']);
  const r4 = recorder();
  const s4 = ctx.mod.createNaturalStream(ctx.deps, r4.opts);
  s4.append(null);
  s4.append(undefined);
  s4.append(42);
  s4.finish();
  ctx.clock.runUntil(() => r4.ends.length > 0, 60_000);
  assert.deepEqual([r4.ends, ctx.engine.requests.at(-1).text], [['done'], '42']);
});

test('natural stream: a sentence longer than a chunk is released in clause-sized pieces while it is still streaming', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  const clauses = Array.from({ length: 12 }, (_, i) => `clause number ${i + 1} adds another detail to the list`);
  const long = clauses.join(', ');
  s.append(long.slice(0, 300));
  ctx.clock.advance(100);
  assert.ok(ctx.engine.requests.length >= 1, 'the first piece is sent before the sentence ends');
  assert.ok(ctx.engine.requests.every((q) => q.text.endsWith(',')), 'cut at clauses');
  assert.ok(ctx.engine.requests[0].text.length <= 140, 'a short first piece');
  s.append(long.slice(300) + '. Then a short one.');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 10 * 60_000);
  assert.equal(ctx.engine.requests.map((q) => q.text).join(' '), s.text());
  assert.ok(ctx.engine.requests.every((q) => q.text.length <= 260));
  assert.deepEqual(r.ends, ['done']);
});

test('natural stream: append() and finish() from inside callbacks are safe; exceptions in callbacks are logged and the stream carries on', async (t) => {
  const ctx = await setup(t);
  const r = recorder();
  const parts = ['Second sentence arrives from onIdle. ', 'Third one too. '];
  const s = ctx.mod.createNaturalStream(ctx.deps, {
    ...r.opts,
    onIdle: () => {
      if (parts.length) s.append(parts.shift());
      else s.finish();
      throw new Error('idle bug');
    },
    onChunk: (c) => {
      r.chunks.push(c);
      throw new Error('chunk bug');
    },
  });
  s.append('First sentence. ');
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual(ctx.engine.completed, ['First sentence.', 'Second sentence arrives from onIdle.', 'Third one too.']);
  assert.ok(ctx.errors.some((e) => e.includes('idle bug')) && ctx.errors.some((e) => e.includes('chunk bug')));
});

test('natural stream: events follow the audio clock, so they pause while the audio is suspended (iOS background) and honour output latency', async (t) => {
  const ctx = await setup(t, { latency: 0.05 });
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append('One sentence that takes a few seconds to say aloud. Then another one. ');
  s.finish();
  ctx.clock.runUntil(() => r.chunks.length === 1, 30_000);
  const startedAt = ctx.audio.now();
  const p0 = ctx.audio.played[0];
  assert.ok(startedAt >= p0.when + 0.02 + 0.05 - 0.041, 'onChunk once the voiced audio reaches the speaker');
  ctx.audio.suspend();
  const words = r.boundaries.length;
  ctx.clock.advance(20_000);
  assert.equal(r.boundaries.length, words, 'nothing while suspended');
  assert.equal(r.ends.length, 0);
  ctx.audio.resume();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);
});

test('natural stream: a failed chunk is retried once; without a handoff two failures in a row end the stream with "error"', async (t) => {
  let fails = 0;
  const ctx = await setup(t, { failOn: (job) => job.text.startsWith('Bad') && ++fails <= 1 });
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  s.append('Good one.\nBad one once.\nGood again.\n');
  s.finish();
  ctx.clock.runUntil(() => r.ends.length > 0, 60_000);
  assert.deepEqual(r.ends, ['done']);
  assert.deepEqual([...ctx.engine.completed].sort(), ['Bad one once.', 'Good again.', 'Good one.'], 'the retry may finish after the next chunk ...');
  assert.equal(ctx.engine.requests.filter((q) => q.text.includes('Bad')).length, 2, 'retried once');
  assert.deepEqual(r.chunks.map((c) => c.text), ['Good one.', 'Bad one once.', 'Good again.'], '... but playback stays in order');

  const ctx2 = await setup(t, { failOn: () => true });
  const r2 = recorder();
  const s2 = ctx2.mod.createNaturalStream(ctx2.deps, r2.opts);
  s2.append('Never works.\nNor this.\n');
  s2.finish();
  ctx2.clock.runUntil(() => r2.ends.length > 0, 60_000);
  assert.deepEqual(r2.ends, ['error']);
});

test('natural stream: when synthesis is slower than real time it lets the made audio play, then hands the rest over', async (t) => {
  const ctx = await setup(t, { rtf: 1.6, handoff: true });
  const r = recorder();
  const s = ctx.mod.createNaturalStream(ctx.deps, r.opts);
  const text = 'This is the first sentence of a longer reply. Here comes the second sentence, a bit longer than the first. A third sentence follows. And a fourth one. Finally the fifth.';
  s.append(text);
  s.finish();
  ctx.clock.runUntil(() => ctx.handoffs.length > 0, 120_000);
  assert.equal(ctx.engine.status().state, 'slow');
  const h = ctx.handoffs[0];
  assert.equal(h.reason, 'slow');
  const said = r.chunks.map((c) => c.text).join(' ');
  assert.equal(s.text().slice(0, h.from).trim(), said, 'the device voice starts right after the audio that was heard');
  assert.ok(ctx.audio.played.filter((p) => !p.stopped).every((p) => p.when + p.duration <= ctx.audio.now() + 1e-9), 'all natural audio finished first');
  assert.deepEqual(r.ends, [], 'the router owns onEnd after a handoff');
  assert.equal(s.active(), false);
});
