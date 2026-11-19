// Voice Mode's streamed speech (src/ui/voice-stream.js): the spoken part of a reply (cut at the
// first thematic break), complete sentences only, never one twice, the ~1,500-character cap; and,
// end to end, a streamed spoken reply fed into the real speech stream (tts.js) on the fake engine
// (platform.voice.fakeengine.test.mjs), with engine quirks. Plus the Settings → Voice helpers
// (src/ui/settings.js): voice labels and the "Get a more natural voice" tip. Plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spokenSource, textClosed, cutAtBreak, splitSentences, createSpokenFeed, SPOKEN_CAP, SPOKEN_CLOSING } from '../../src/ui/voice-stream.js';
import { markdownToPlainText } from '../../src/lib/markdown.js';
import { voiceOptionLabel, autoVoiceLabel, naturalVoiceTip } from '../../src/ui/settings.js';
import { installClock, createFakeSpeech, VOICES } from './platform.voice.fakeengine.test.mjs';

const speech = (md) => markdownToPlainText(md, { speech: true });
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const text = (t, req = 0) => ({ id: `t${Math.random()}`, kind: 'text', text: t, req, citations: [] });

function prng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/** Split `s` into word-sized deltas like the mock (2-4 words, each with the whitespace before it). */
function wordDeltas(s, rnd) {
  const words = s.match(/\s*\S+/g) || [];
  const out = [];
  for (let i = 0; i < words.length; ) {
    const n = 2 + Math.floor(rnd() * 3);
    out.push(words.slice(i, i + n).join(''));
    i += n;
  }
  const tail = s.slice(out.join('').length);
  if (tail) out.push(tail);
  return out;
}

/** Feed `deltas` one by one into a text segment; returns every piece the feed handed out. */
function streamThrough(feed, deltas, { before = [], after = [] } = {}) {
  const seg = text('');
  const pieces = [];
  let finish = false;
  for (const d of deltas) {
    seg.text += d;
    const r = feed.update({ segments: [...before, seg, ...after] });
    pieces.push(...r.pieces);
    finish = finish || r.finish;
  }
  return { seg, pieces, finish };
}

const SPOKEN = "The capital of France is Paris. It's the seat of government and the country's cultural heart, home to just over two million people. I've put a few details on screen; would you like a quick travel brief, Tony?";
const DETAILS = "## Details\n\n- **Paris** is France's seat of government, home to the Louvre.\n- **Next step:** ask me for a quick travel brief for Paris.";
const REPLY = `${SPOKEN}\n\n---\n\n${DETAILS}`;

// ---- spokenSource / textClosed --------------------------------------------------------------

test('spokenSource joins the text segments in order with blank lines and skips everything else', () => {
  const segs = [
    { kind: 'thinking', text: 'hmm' },
    text('Let me check the latest on that.'),
    { kind: 'tool', tool: 'web_search', status: 'done' },
    text('   '),
    text("Here's what I found.", 1),
    { kind: 'notice', text: 'note' },
    null,
    { kind: 'text', text: 42 },
  ];
  assert.equal(spokenSource(segs), "Let me check the latest on that.\n\nHere's what I found.");
  assert.equal(spokenSource(null), '');
  assert.equal(spokenSource([]), '');
});

test('textClosed: the last text is complete once a search, mission, memory change or thinking follows it', () => {
  assert.equal(textClosed([]), false);
  assert.equal(textClosed([text('Hi.')]), false);
  for (const kind of ['tool', 'mission', 'memory', 'thinking']) assert.equal(textClosed([text('Hi.'), { kind }]), true, kind);
  // A notice or an error does not close it (a retry may still replace that text).
  assert.equal(textClosed([text('Hi.'), { kind: 'notice' }]), false);
  assert.equal(textClosed([text('Hi.'), { kind: 'error' }]), false);
  // Only the last text segment matters.
  assert.equal(textClosed([text('A.'), { kind: 'tool' }, text('B')]), false);
  assert.equal(textClosed([{ kind: 'tool' }]), false, 'no text at all');
});

// ---- cutAtBreak -------------------------------------------------------------------------------

test('cutAtBreak: the part above the first ---, *** or ___ line (outside code fences)', () => {
  assert.deepEqual(cutAtBreak(REPLY), { text: `${SPOKEN}\n\n`, cut: true });
  for (const line of ['***', '___', '- - -', '* * *', '  ---', '-----', '---   ', '_ _ _', '-- -']) {
    assert.deepEqual(cutAtBreak(`A.\n\n${line}\nB.`), { text: 'A.\n\n', cut: true }, JSON.stringify(line));
  }
  // Not breaks: indented code, other text on the line, two dashes, a table rule, emphasis, mixed.
  for (const line of ['    ---', '--', '--- x', '|---|---|', '***bold***', '- --x', '-*-']) {
    assert.equal(cutAtBreak(`A.\n\n${line}\nB.`).cut, false, JSON.stringify(line));
  }
  // Directly under a paragraph line (a setext underline in Markdown) it still ends the spoken part.
  assert.deepEqual(cutAtBreak('Spoken.\n---\nDetails'), { text: 'Spoken.\n', cut: true });
  // The first break wins; text after it is never spoken.
  assert.deepEqual(cutAtBreak('A.\n\n---\n\nB.\n\n***\n\nC.'), { text: 'A.\n\n', cut: true });
  assert.deepEqual(cutAtBreak('No break here.'), { text: 'No break here.', cut: false });
  assert.deepEqual(cutAtBreak(''), { text: '', cut: false });
});

test('cutAtBreak ignores --- inside fenced code (``` and ~~~), and cuts after the fence closes', () => {
  const fenced = 'Intro.\n\n```\n---\n```\n\nMore.\n\n---\n\nDetails.';
  assert.deepEqual(cutAtBreak(fenced), { text: 'Intro.\n\n```\n---\n```\n\nMore.\n\n', cut: true });
  assert.equal(cutAtBreak('A.\n\n~~~md\n---\n~~~~\n').cut, false, 'still inside? no: closed by ~~~~, but nothing follows');
  assert.deepEqual(cutAtBreak('A.\n\n~~~md\n***\n~~~~\n___\n'), { text: 'A.\n\n~~~md\n***\n~~~~\n', cut: true });
  // An unclosed fence (still streaming): nothing inside it is a break.
  assert.equal(cutAtBreak('A.\n\n```js\nconst x = 1;\n---\n').cut, false);
  // A shorter closing fence doesn't close it.
  assert.equal(cutAtBreak('````\n```\n---\n').cut, false);
  // ``` with a backtick in its info string is not a fence.
  assert.equal(cutAtBreak('``` `x` ```\n---\n').cut, true);
});

test('cutAtBreak: only complete lines count while the text is still streaming', () => {
  assert.deepEqual(cutAtBreak('A.\n\n---'), { text: 'A.\n\n---', cut: false }, 'the --- may still grow into something else');
  assert.deepEqual(cutAtBreak('A.\n\n---', true), { text: 'A.\n\n', cut: true }, 'final: the last line is complete');
  assert.deepEqual(cutAtBreak('A.\n\n---\n'), { text: 'A.\n\n', cut: true });
  assert.deepEqual(cutAtBreak('A.\n\n***'), { text: 'A.\n\n***', cut: false }, '"***" may become "***Bold***"');
  assert.deepEqual(cutAtBreak('A.\r\n\r\n---\r\nB'), { text: 'A.\r\n\r\n', cut: true }, 'CRLF');
});

// ---- splitSentences -----------------------------------------------------------------------------

test('splitSentences tiles the text; decimals, domains and abbreviations do not end a sentence; a line break does', () => {
  const s = 'Dr. Smith paid 3.5 dollars at example.com today. Really?! Yes… "Quoted." Next line\nAnother line';
  const ranges = splitSentences(s);
  assert.equal(ranges.map((r) => s.slice(r.start, r.end)).join(''), s, 'tiles the whole string');
  assert.deepEqual(
    ranges.map((r) => s.slice(r.start, r.end).trim()),
    ['Dr. Smith paid 3.5 dollars at example.com today.', 'Really?!', 'Yes…', '"Quoted."', 'Next line', 'Another line'],
  );
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('   '), [{ start: 0, end: 3 }]);
});

// ---- createSpokenFeed ------------------------------------------------------------------------------

test('feed: sentences are handed out as soon as they are complete; the unfinished last one waits for the end of the turn', () => {
  const feed = createSpokenFeed({ convert: speech });
  const seg = text('');
  const step = (t, done = false) => {
    seg.text = t;
    return feed.update({ segments: [seg], done });
  };
  assert.deepEqual(step('The capital of France'), { pieces: [], finish: false });
  assert.deepEqual(step('The capital of France is Paris.'), { pieces: [], finish: false }, 'a sentence end at the very end may still change ("3." -> "3.5")');
  assert.deepEqual(step("The capital of France is Paris. It's the"), { pieces: ['The capital of France is Paris. '], finish: false });
  assert.deepEqual(step("The capital of France is Paris. It's the seat of government."), { pieces: [], finish: false });
  assert.deepEqual(step("The capital of France is Paris. It's the seat of government.", true), { pieces: ["It's the seat of government.\n\n"], finish: true });
  assert.deepEqual(feed.update({ segments: [seg], done: true }), { pieces: [], finish: false }, 'nothing after the end');
  const st = feed.state();
  assert.equal(norm(st.spoken), "The capital of France is Paris. It's the seat of government.");
  assert.equal(st.finished, true);
});

test('feed: a streamed spoken reply (random word-sized deltas) is handed out whole, once, in order, and nothing below --- ever', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rnd = prng(seed);
    const feed = createSpokenFeed({ convert: speech });
    const { seg, pieces, finish } = streamThrough(feed, wordDeltas(REPLY, rnd));
    assert.equal(finish, true, 'the --- line finishes it before the turn ends');
    const end = feed.update({ segments: [seg], done: true });
    const all = [...pieces, ...end.pieces];
    assert.equal(norm(all.join('')), norm(SPOKEN), `seed ${seed}`);
    assert.ok(all.every((p) => /[ \n]$/.test(p)), 'every piece ends with its separator');
    assert.ok(!/Details|Louvre|Next step|\*\*/.test(all.join('')), 'nothing below the line');
    assert.equal(new Set(all).size, all.length, 'never a sentence twice');
  }
});

test('feed: the preamble is spoken while the tools run; the answer continues after it as a new paragraph', () => {
  const feed = createSpokenFeed({ convert: speech });
  const pre = text('Let me check the latest on that.');
  assert.deepEqual(feed.update({ segments: [pre] }).pieces, [], 'not yet known to be complete');
  const tool = { kind: 'tool', tool: 'web_search', status: 'running' };
  assert.deepEqual(feed.update({ segments: [pre, tool] }), { pieces: ['Let me check the latest on that.\n\n'], finish: false }, 'the search started: the preamble is complete');
  const answer = text('', 1);
  const segs = [pre, tool, answer];
  const got = [];
  for (const d of wordDeltas("Here's what I found on electric cars, Tony. The sources broadly agree. I've put the key points on screen.\n\n---\n\n## Details\n\n- point", prng(7))) {
    answer.text += d;
    got.push(...feed.update({ segments: segs }).pieces);
  }
  got.push(...feed.update({ segments: segs, done: true }).pieces);
  assert.deepEqual(got, ["Here's what I found on electric cars, Tony. ", 'The sources broadly agree. ', "I've put the key points on screen.\n\n"]);
  assert.equal(feed.state().spoken, "Let me check the latest on that.\n\nHere's what I found on electric cars, Tony. The sources broadly agree. I've put the key points on screen.\n\n");
});

test('feed: Markdown is spoken for the ear (lists and headings become lines, ** and links are dropped)', () => {
  const feed = createSpokenFeed({ convert: speech });
  const seg = text('Three picks, **Tony**:\n\n- Alpha, about 12% cheaper\n- Bravo ([review](https://example.com/r))\n- Charlie [1]\n\nWant more?');
  const { pieces, finish } = feed.update({ segments: [seg], done: true });
  assert.equal(finish, true);
  assert.deepEqual(pieces, ['Three picks, Tony:\n\n', 'Alpha, about 12 percent cheaper.\n\n', 'Bravo (review).\n\n', 'Charlie.\n\n', 'Want more?\n\n']);
});

test('feed: about 1,500 characters at most, then "The rest is on screen." (only when something was left out)', () => {
  const sentence = (i) => `Sentence number ${i} is here to make this reply long enough for the cap to matter at all.`; // 89-90 chars
  const long = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(' ');
  const feed = createSpokenFeed({ convert: speech });
  const seg = text('');
  const pieces = [];
  let finish = false;
  for (const d of wordDeltas(long, prng(3))) {
    seg.text += d;
    const r = feed.update({ segments: [seg] });
    pieces.push(...r.pieces);
    if (r.finish) finish = true;
  }
  assert.equal(finish, true, 'finished as soon as the cap was reached, before the turn ended');
  assert.equal(pieces.at(-1), SPOKEN_CLOSING);
  const said = pieces.slice(0, -1).join('');
  assert.ok(said.length <= SPOKEN_CAP + 1 && said.length > SPOKEN_CAP - 100, `${said.length} characters`);
  assert.ok(norm(long).startsWith(norm(said)), 'the first sentences, in order');
  assert.deepEqual(feed.update({ segments: [seg], done: true }), { pieces: [], finish: false });
  assert.equal(feed.state().capped, true);

  // Exactly within the cap: no closing line.
  const fits = Array.from({ length: 10 }, (_, i) => sentence(i + 1)).join(' ');
  const f2 = createSpokenFeed({ convert: speech });
  const r2 = f2.update({ segments: [text(fits)], done: true });
  assert.ok(!r2.pieces.includes(SPOKEN_CLOSING));
  assert.equal(norm(r2.pieces.join('')), norm(fits));
  assert.equal(f2.state().capped, false);

  // A custom cap and closing; the first sentence is always spoken.
  const f3 = createSpokenFeed({ cap: 10, closing: 'More on screen.' });
  assert.deepEqual(f3.update({ segments: [text('A rather long first sentence. Second one.')], done: true }).pieces, ['A rather long first sentence. ', 'More on screen.']);
});

test('feed: a segment removed by a retry never makes it repeat; the retried text continues after what was said', () => {
  const feed = createSpokenFeed({ convert: speech });
  const seg = text('The capital of France is Paris. It is the seat of');
  assert.deepEqual(feed.update({ segments: [seg] }).pieces, ['The capital of France is Paris. ']);
  // The request failed: its segments were removed before the retry.
  assert.deepEqual(feed.update({ segments: [{ kind: 'notice', text: 'Retrying…' }] }).pieces, []);
  // The retry streams the same text again: nothing is repeated, it carries on after "Paris."
  const again = text('');
  const got = [];
  for (const d of wordDeltas('The capital of France is Paris. It is the seat of government. It is lovely.', prng(11))) {
    again.text += d;
    got.push(...feed.update({ segments: [again] }).pieces);
  }
  got.push(...feed.update({ segments: [again], done: true }).pieces);
  assert.deepEqual(got, ['It is the seat of government. ', 'It is lovely.\n\n']);

  // The retry wrote something else: what was said stays said (by count), the rest continues.
  const f2 = createSpokenFeed({ convert: speech });
  assert.deepEqual(f2.update({ segments: [text('One. Two. Three')] }).pieces, ['One. ', 'Two. ']);
  assert.deepEqual(f2.update({ segments: [text('Uno. Dos. Tres. Cuatro')] }).pieces, ['Tres. ']);
  assert.deepEqual(f2.update({ segments: [text('Uno. Dos. Tres. Cuatro.')], done: true }).pieces, ['Cuatro.\n\n']);
});

test('feed: an earlier sentence read differently once more text arrives is not spoken again', () => {
  // An unclosed emphasis or link changes how the start reads; what was handed out stays handed out.
  let calls = 0;
  const convert = (md) => {
    calls += 1;
    return speech(md).replace(/\*/g, '');
  };
  const feed = createSpokenFeed({ convert });
  const seg = text('This is *very important. Then');
  assert.deepEqual(feed.update({ segments: [seg] }).pieces, ['This is very important. ']);
  seg.text = 'This is *very important. Then more* follows. End';
  assert.deepEqual(feed.update({ segments: [seg] }).pieces, ['Then more follows. ']);
  // Unchanged text (a thinking delta, a tool row update): nothing new, and nothing converted again.
  const before = calls;
  assert.deepEqual(feed.update({ segments: [{ kind: 'thinking', text: 'more thoughts' }, seg] }).pieces, []);
  assert.deepEqual(feed.update({ segments: [seg, { kind: 'notice', text: 'x' }] }).pieces, []);
  assert.equal(calls, before, 'the same text is not converted again');
  // The end of the turn always reads it once more (the last sentence is complete now).
  assert.deepEqual(feed.update({ segments: [seg], done: true }).pieces, ['End.\n\n']);
});

test('feed: a failing conversion, empty text or only a mission never crashes and speaks nothing', () => {
  const broken = createSpokenFeed({
    convert: () => {
      throw new Error('boom');
    },
  });
  assert.deepEqual(broken.update({ segments: [text('Hello there. Again.')], done: true }), { pieces: [], finish: true });
  const empty = createSpokenFeed({ convert: speech });
  assert.deepEqual(empty.update({ segments: [{ kind: 'mission', missionId: 'm1' }] }), { pieces: [], finish: false });
  assert.deepEqual(empty.update({ segments: [{ kind: 'mission', missionId: 'm1' }], done: true }), { pieces: [], finish: true });
  const codeOnly = createSpokenFeed({ convert: speech });
  assert.deepEqual(codeOnly.update({ segments: [text('```js\nconst x = 1;\n```')], done: true }).pieces, []);
  const breakFirst = createSpokenFeed({ convert: speech });
  assert.deepEqual(breakFirst.update({ segments: [text('---\n\n## Details\n\n- a')] }), { pieces: [], finish: true });
  assert.deepEqual(createSpokenFeed().update(), { pieces: [], finish: false }, 'no arguments');
});

test('feed.skip: opened mid-reply, what is already complete is not read out; only what follows', () => {
  const feed = createSpokenFeed({ convert: speech });
  const pre = text('Let me check the latest on that.');
  const mission = { kind: 'mission', missionId: 'm1' };
  feed.skip([pre, mission]);
  const answer = text('Your three agents have reported back. It comes down to cost.', 1);
  const r = feed.update({ segments: [pre, mission, answer], done: true });
  assert.deepEqual(r.pieces, ['Your three agents have reported back. ', 'It comes down to cost.\n\n']);
  // Skipped text does not count towards the cap.
  assert.equal(feed.state().chars, r.pieces.join('').trim().length + 1);
  // Opened after the spoken part was complete: nothing more is spoken (the summary path takes over).
  const late = createSpokenFeed({ convert: speech });
  late.skip([text(REPLY)]);
  assert.equal(late.state().finished, true);
  assert.deepEqual(late.update({ segments: [text(REPLY)], done: true }), { pieces: [], finish: false });
});

// ---- end to end: the feed into the real speech stream, on the fake engine ---------------------------

let loads = 0;

test('a preamble that stops on a colon while the tools run ends like a sentence, so the speech stream speaks it now', async (t) => {
  const clock = installClock();
  const fake = createFakeSpeech(clock, { voices: [VOICES.daniel] }).install();
  const tts = await import(`../../src/platform/voice/tts.js?ui-voice=${++loads}`);
  t.after(() => {
    fake.uninstall();
    clock.restore();
  });
  const feed = createSpokenFeed({ convert: speech });
  const pre = text('Let me look into that for you:');
  assert.deepEqual(feed.update({ segments: [pre] }).pieces, []);
  const { pieces } = feed.update({ segments: [pre, { kind: 'mission', missionId: 'm1' }] });
  assert.deepEqual(pieces, ['Let me look into that for you.\n\n']);
  // The engine queues it at once; the colon version would wait for more text or finish().
  const stream = tts.createSpeechStream({ voiceURI: VOICES.daniel.voiceURI });
  stream.append(pieces[0]);
  assert.deepEqual(fake.submitted.map((s) => s.text), ['Let me look into that for you.']);
  stream.cancel();
  const other = tts.createSpeechStream({ voiceURI: VOICES.daniel.voiceURI });
  clock.advance(1000);
  const before = fake.submitted.length;
  other.append('Let me look into that for you:\n\n');
  clock.advance(1000);
  assert.equal(fake.submitted.length, before, 'why: a line without . ! ? … waits in the engine');
  other.cancel();
  // Mid-reply (more text follows) and at the end of the turn, the text is left as it was written.
  const f2 = createSpokenFeed({ convert: speech });
  assert.deepEqual(f2.update({ segments: [text('Options:\n\n- one\n- two')], done: true }).pieces, ['Options:\n\n', 'one.\n\n', 'two.\n\n']);
});

test('a streamed spoken reply goes through the real speech stream once, in order, with engine quirks (a, b, f); nothing below --- is spoken', async (t) => {
  for (let seed = 1; seed <= 6; seed++) {
    const clock = installClock();
    const quirks = seed % 2 ? { stuckSpeaking: true, dropEnd: (u, n) => n % 3 === 1, noStart: (u, n) => n === 2 } : { earlyEnd: (u, n) => (n === 1 ? 0.4 : null), doubleEnd: (u, n) => n === 0 };
    const fake = createFakeSpeech(clock, { quirks, voices: [VOICES.daniel] }).install();
    const tts = await import(`../../src/platform/voice/tts.js?ui-voice=${++loads}`);
    t.after(() => {
      fake.uninstall();
      clock.restore();
    });
    const ends = [];
    const stream = tts.createSpeechStream({ voiceURI: VOICES.daniel.voiceURI, onEnd: (e) => ends.push(e.reason) });
    const feed = createSpokenFeed({ convert: speech });
    const rnd = prng(seed);
    const pre = text('Let me check the latest on that.');
    const segs = [pre];
    const push = (done = false) => {
      const r = feed.update({ segments: segs, done });
      for (const p of r.pieces) stream.append(p);
      if (r.finish) stream.finish();
    };
    push();
    clock.advance(400);
    segs.push({ kind: 'tool', tool: 'web_search', status: 'running' });
    push();
    clock.advance(1200);
    const answer = text('', 1);
    segs.push(answer);
    for (const d of wordDeltas(REPLY, rnd)) {
      answer.text += d;
      push();
      clock.advance(50 + Math.floor(rnd() * 40));
    }
    push(true);
    clock.runUntil(() => ends.length > 0, 10 * 60_000);
    assert.deepEqual(ends, ['done'], `seed ${seed}`);
    assert.equal(norm(fake.completed().join(' ')), norm(`Let me check the latest on that. ${SPOKEN}`), `seed ${seed}: every sentence once, in order`);
    assert.ok(!/Details|Louvre|Next step/.test(fake.audio.map((a) => a.text).join(' ')), 'nothing below the line');
    fake.uninstall();
    clock.restore();
  }
});

// ---- Settings → Voice helpers ----------------------------------------------------------------------

test('voice labels: "Name (lang, Quality, online)"; the quality only when the name does not say it already', () => {
  assert.equal(voiceOptionLabel({ name: 'Serena', lang: 'en-GB', localService: true }), 'Serena (en-GB)');
  assert.equal(voiceOptionLabel({ name: 'Google UK English Male', lang: 'en-GB', localService: false }), 'Google UK English Male (en-GB, online)');
  assert.equal(voiceOptionLabel({ name: 'Daniel', lang: 'en-GB', voiceURI: 'com.apple.voice.enhanced.en-GB.Daniel', localService: true }), 'Daniel (en-GB, Enhanced)');
  assert.equal(voiceOptionLabel({ name: 'Arthur', lang: 'en-GB', voiceURI: 'com.apple.voice.premium.en-GB.Arthur', localService: true }), 'Arthur (en-GB, Premium)');
  assert.equal(voiceOptionLabel({ name: 'Daniel (Enhanced)', lang: 'en-GB', localService: true }), 'Daniel (Enhanced) (en-GB)');
  assert.equal(
    voiceOptionLabel({ name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)', lang: 'en-GB', localService: false }),
    'Microsoft Ryan Online (Natural) - English (United Kingdom) (en-GB, online)',
  );
  assert.equal(voiceOptionLabel({ name: 'Ava (Neural)', lang: 'en-US' }), 'Ava (Neural) (en-US, Natural)', 'Neural voices are Natural');
  assert.equal(voiceOptionLabel({ name: 'Plain', lang: '' }), 'Plain');
  assert.equal(voiceOptionLabel({ voiceURI: 'x-uri' }), 'x-uri');
  assert.equal(voiceOptionLabel(null), 'Voice');
});

test('the Automatic option names the voice Jarvis picks, with its quality and "online"', () => {
  assert.equal(autoVoiceLabel({ name: 'Serena', lang: 'en-GB', localService: true }), 'Automatic — Serena');
  assert.equal(autoVoiceLabel({ name: 'Google UK English Male', lang: 'en-GB', localService: false }), 'Automatic — Google UK English Male (online)');
  assert.equal(autoVoiceLabel({ name: 'Daniel', lang: 'en-GB', voiceURI: 'com.apple.voice.enhanced.en-GB.Daniel', localService: true }), 'Automatic — Daniel (Enhanced)');
  assert.equal(autoVoiceLabel({ name: 'Arthur (Premium)', lang: 'en-GB' }), 'Automatic — Arthur (Premium)');
  assert.equal(autoVoiceLabel(null), 'Automatic (best available voice)');
});

test('"Get a more natural voice" is worded for the platform', () => {
  const ios = naturalVoiceTip('ios');
  assert.equal(ios.platform, 'ios');
  assert.match(ios.text, /Settings → Accessibility → Spoken Content → Voices → English/);
  assert.match(ios.text, /Enhanced or Premium/);
  assert.match(ios.text, /Daniel or Arthur/);
  assert.match(ios.text, /close Jarvis completely/);
  assert.match(ios.text, /doesn’t offer it to web apps/);
  const mac = naturalVoiceTip('mac');
  assert.match(mac.text, /System Settings → Accessibility → Spoken Content → System voice → Manage Voices… → English \(United Kingdom\)/);
  const win = naturalVoiceTip('windows');
  assert.match(win.text, /Microsoft Edge/);
  assert.match(win.text, /“Natural”/);
  assert.match(win.text, /online, so the text they read goes to Microsoft/);
  assert.match(win.text, /Settings → Time & language → Speech → Add voices → English \(United Kingdom\)/);
  const android = naturalVoiceTip('android');
  assert.match(android.text, /Text-to-speech output → Speech Services by Google → Install voice data → English \(United Kingdom\)/);
  for (const os of ['linux', 'chromeos', 'other', undefined]) assert.equal(naturalVoiceTip(os).platform, 'other');
});
