// Listening (src/platform/voice/stt.js, SPEC §9.2, v7.2): Jarvis decides when the owner has finished,
// not the browser. Plain Node on a virtual clock, against fake recognizers that behave like iOS
// Safari (one growing result, final only at the end, a session that ends after a pause, 'no-speech'
// from a restarted session, revised words) and Chrome (several results, finals after pauses).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock } from './platform.voice.fakeengine.test.mjs';
import { installRecognition, freshStt, chrome, ios } from './stt.fakes.mjs';

/** A listen with a log of everything it reported: ['partial:…', 'final:…', 'error:code', 'end']. */
function listen(stt, options = {}) {
  const log = [];
  const finals = [];
  const handle = stt.startListening({
    onPartial: (t) => log.push(`partial:${t}`),
    onFinal: (t, info) => {
      log.push(`final:${t}`);
      finals.push({ text: t, info });
    },
    onError: (e) => log.push(`error:${e.code}${e.restarted ? ':restarted' : ''}`),
    onEnd: () => log.push('end'),
    ...options,
  });
  return { handle, log, finals, partials: () => log.filter((x) => x.startsWith('partial:')).map((x) => x.slice(8)) };
}

async function setup(t, options = {}) {
  const clock = installClock();
  const rec = installRecognition(options);
  const stt = await freshStt();
  t.after(() => {
    rec.uninstall();
    clock.restore();
  });
  return { clock, rec, stt };
}

// ---- pure helpers -------------------------------------------------------------------------------

test('the silence windows: short 1.0 s, normal 1.6 s (the default), long 2.6 s', async () => {
  const stt = await freshStt();
  assert.deepEqual({ ...stt.LISTEN_WAITS }, { short: 1000, normal: 1600, long: 2600 });
  assert.equal(stt.listenWaitMs('short'), 1000);
  assert.equal(stt.listenWaitMs('long'), 2600);
  assert.equal(stt.listenWaitMs(undefined), 1600);
  assert.equal(stt.listenWaitMs('forever'), 1600);
});

test('sentenceUnfinished: a hanging last word or only an opener waits longer; a finished sentence does not', async () => {
  const stt = await freshStt();
  for (const s of ['Remind me to buy milk and', 'What is the capital of', 'Tell me about the', 'I want to go to', 'So, um', 'Is it raining in', 'Jarvis,', 'Hey Jarvis', 'Okay so', 'can you', 'What’s']) {
    assert.equal(stt.sentenceUnfinished(s), true, s);
  }
  for (const s of ['What is the capital of France?', 'Expand it.', 'Thank you', 'Close', 'Show the separator', 'Turn it off', 'yes', '']) {
    assert.equal(stt.sentenceUnfinished(s), false, s);
  }
  assert.equal(stt.turnSilenceMs('and the', 1600), 2600);
  assert.equal(stt.turnSilenceMs('done now', 1000), 1000);
});

test('joinWords appends a restarted session without repeating words (case and punctuation ignored)', async () => {
  const stt = await freshStt();
  assert.equal(stt.joinWords('What is the capital', 'of France'), 'What is the capital of France');
  assert.equal(stt.joinWords('What is the capital', 'the capital of France'), 'What is the capital of France');
  assert.equal(stt.joinWords('What is the capital.', 'Capital of France?'), 'What is the capital. of France?');
  assert.equal(stt.joinWords('What is the capital', 'what is the capital of France'), 'what is the capital of France');
  assert.equal(stt.joinWords('What is the capital of France', 'France'), 'What is the capital of France');
  assert.equal(stt.joinWords('', 'hello'), 'hello');
  assert.equal(stt.joinWords('hello', ''), 'hello');
  assert.equal(stt.joinWords('no', 'no I said Boston'), 'no I said Boston');
});

test('readResults: Chrome phrases follow each other; iOS one growing result; repeats and cumulative results collapse', async () => {
  const stt = await freshStt();
  const r = (items) =>
    items.map(([text, final, ...alts]) => {
      const x = [{ transcript: text }, ...alts.map((a) => ({ transcript: a }))];
      x.isFinal = final;
      return x;
    });
  const text = (items) => stt.readResults(r(items)).map((p) => p.text).join(' ');
  assert.equal(text([['what is the', true], [' capital of', true], [' France', false]]), 'what is the capital of France');
  assert.equal(text([['What is the capital of France', false]]), 'What is the capital of France');
  assert.equal(text([['hello world', true], ['hello world', true], ['how are you', false]]), 'hello world how are you');
  assert.equal(text([['hello', true], ['hello how', true], ['hello how are you', false]]), 'hello how are you');
  assert.equal(text([['no', true], [' no', true]]), 'no no'); // a single word said twice stays twice
  assert.equal(text([['', false], ['  ', true], ['ok', false]]), 'ok');
  // WebKit sometimes hands back a final with the same words twice in a row: one copy is kept.
  assert.equal(text([['what time is it What time is it?', true]]), 'What time is it?');
  assert.equal(text([['go team go', true]]), 'go team go', 'not a repeat');
  assert.equal(text([['no no', true]]), 'no no', 'too short to be the quirk');
  const parts = stt.readResults(r([['expand it', true, 'expanded', 'x band it']]));
  assert.deepEqual(parts, [{ text: 'expand it', alts: ['expanded', 'x band it'], final: true }]);
});

test('resolveListenLang: the Settings value, else the device language, else en-US', async () => {
  const stt = await freshStt();
  assert.equal(stt.resolveListenLang('en-GB', { language: 'fr-FR' }), 'en-GB');
  assert.equal(stt.resolveListenLang('', { language: 'en-AU' }), 'en-AU');
  assert.equal(stt.resolveListenLang(undefined, { language: '', languages: ['de-DE'] }), 'de-DE');
  assert.equal(stt.resolveListenLang('en_GB', {}), 'en-GB');
  assert.equal(stt.resolveListenLang('not a language!', { language: 'nl-NL' }), 'nl-NL');
  assert.equal(stt.resolveListenLang('', null), 'en-US');
});

// ---- one turn -----------------------------------------------------------------------------------

test('configures a continuous recognizer: interim results, three alternatives, the language asked for or the device one', async (t) => {
  const { rec, stt } = await setup(t);
  const a = listen(stt, { lang: 'en-GB' });
  assert.deepEqual(
    { lang: rec.current.lang, continuous: rec.current.continuous, interim: rec.current.interimResults, alts: rec.current.maxAlternatives, calls: rec.current.calls },
    { lang: 'en-GB', continuous: true, interim: true, alts: 3, calls: ['start'] },
  );
  assert.deepEqual(a.log, [], 'nothing is reported synchronously');
  a.handle.abort();
  listen(stt, { lang: '' });
  assert.equal(rec.current.lang, stt.resolveListenLang(''), 'blank: the device language');
});

test('Chrome: several finals make one turn; it ends 1.6 s after the words stop changing, then the recognizer is released', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const c = chrome(rec);
  const a = listen(stt);
  clock.advance(300);
  c.say('what is the');
  clock.advance(400);
  c.say('what is the capital');
  c.finalize();
  clock.advance(700); // a pause Chrome finalizes; the owner goes on
  c.say('of France');
  c.finalize();
  clock.advance(1500);
  assert.ok(!a.log.some((x) => x.startsWith('final:')), 'not yet: 1.5 s of silence');
  clock.advance(100);
  assert.deepEqual(a.finals.map((f) => f.text), ['what is the capital of France']);
  assert.equal(a.finals[0].info.reason, 'silence');
  assert.ok(rec.current.calls.includes('abort'), 'the recognizer is released at once');
  clock.advance(100);
  assert.equal(a.log.at(-1), 'end');
  assert.equal(a.log.filter((x) => x === 'end').length, 1);
  assert.deepEqual(a.partials(), ['what is the', 'what is the capital', 'what is the capital of France']);
});

test('iOS: a sentence with a 1.2 s pause in the middle is not cut; the session that ends by itself is restarted and its words appended once', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const a = listen(stt);
  clock.advance(300);
  s.say('What is');
  clock.advance(300);
  s.say('What is the capital');
  clock.advance(700);
  s.pauseEnd(); // iOS ends its session after the pause
  assert.equal(rec.made.length, 2, 'a new recognizer started at once');
  assert.deepEqual(rec.current.calls, ['start']);
  clock.advance(500); // the pause was 1.2 s in all
  s.say('of France');
  clock.advance(400);
  s.say('of France?');
  clock.advance(1599);
  assert.equal(a.finals.length, 0);
  clock.advance(1);
  assert.deepEqual(a.finals.map((f) => f.text), ['What is the capital of France?']);
  assert.ok(!a.partials().includes('What is'.concat(' What is')), 'never a duplicated word');
  assert.deepEqual(a.partials(), ['What is', 'What is the capital', 'What is the capital of France', 'What is the capital of France?']);
});

test('iOS: a sentence started again after a pause is not cut while the owner says it again (repeated words are speech too)', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const a = listen(stt); // one turn: the chat's mic, "Send right away"
  clock.advance(100);
  s.say('Set an alarm for seven');
  clock.advance(700);
  s.pauseEnd(); // iOS ends the session 0.7 s into the pause
  clock.advance(300);
  s.say('Set an'); // the owner says it again, more precisely: the new session hears it from the top
  clock.advance(300);
  s.say('Set an alarm for');
  clock.advance(300);
  s.say('Set an alarm for seven');
  clock.advance(300);
  s.say('Set an alarm for seven thirty');
  assert.equal(a.finals.length, 0, 'not cut 1.6 s after the first attempt while the owner was still talking');
  clock.advance(1599);
  assert.equal(a.finals.length, 0, '1.6 s after the last words');
  clock.advance(1);
  assert.deepEqual(a.finals.map((f) => f.text), ['Set an alarm for seven thirty']);
  assert.ok(!a.partials().some((p) => /seven Set/i.test(p)), 'the repeated words are never added twice');
});

test('iOS: no-speech from a restarted session is ignored within the turn; the words heard so far are kept', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const a = listen(stt);
  clock.advance(200);
  s.say('Turn on the porch light');
  clock.advance(600);
  s.pauseEnd();
  clock.advance(700);
  s.noSpeech(); // the restarted session heard nobody
  assert.equal(rec.made.length, 3, 'and it starts again');
  clock.advance(299);
  assert.equal(a.finals.length, 0, 'still listening: 1.6 s after the last words is not up yet');
  clock.advance(1);
  assert.deepEqual(a.finals.map((f) => f.text), ['Turn on the porch light']);
  assert.equal(a.finals[0].info.reason, 'silence');
  clock.advance(100);
  assert.deepEqual(a.log.filter((x) => !x.startsWith('partial:')), ['final:Turn on the porch light', 'end']);
});

test('iOS: revised words replace the old ones (no flicker on a shrink), and the turn ends with the revision', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const a = listen(stt);
  clock.advance(200);
  s.say('whats the whether like in');
  clock.advance(300);
  s.say('whats the whether like'); // a revision that only drops the last word…
  clock.advance(100);
  assert.deepEqual(a.partials(), ['whats the whether like in'], '…is held a moment instead of flickering');
  s.say("what's the weather like in Paris"); // …and is replaced by more words
  clock.advance(400);
  assert.deepEqual(a.partials(), ['whats the whether like in', "what's the weather like in Paris"]);
  clock.advance(1200);
  assert.deepEqual(a.finals.map((f) => f.text), ["what's the weather like in Paris"]);
});

test('smart extension: a trailing "and" waits 2.6 s; an opener ("Jarvis,") waits too; a finished sentence 1.6 s', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const a = listen(stt);
  s.say('Remind me to buy milk and');
  clock.advance(2000); // 1.6 s would have cut here
  assert.equal(a.finals.length, 0, 'still listening 2 s after "and"');
  s.say('Remind me to buy milk and eggs');
  clock.advance(1599);
  assert.equal(a.finals.length, 0);
  clock.advance(1);
  assert.deepEqual(a.finals.map((f) => f.text), ['Remind me to buy milk and eggs']);

  const b = listen(stt);
  s.say('Jarvis,');
  clock.advance(2500);
  assert.equal(b.finals.length, 0, 'an opener alone waits 2.6 s');
  clock.advance(100);
  assert.deepEqual(b.finals.map((f) => f.text), ['Jarvis,']);
});

test('Settings → Wait after I stop talking: short ends after 1.0 s, long after 2.6 s', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const short = listen(stt, { wait: 'short' });
  s.say('Close it');
  clock.advance(999);
  assert.equal(short.finals.length, 0);
  clock.advance(1);
  assert.equal(short.finals.length, 1);
  const long = listen(stt, { wait: 'long' });
  s.say('What time is it');
  clock.advance(2599);
  assert.equal(long.finals.length, 0);
  clock.advance(1);
  assert.equal(long.finals.length, 1);
});

test('a turn never runs past 60 s, however the words keep coming', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const c = chrome(rec);
  const a = listen(stt);
  let words = 'and';
  for (let ms = 0; ms < 70000 && !a.finals.length; ms += 500) {
    words += ' and';
    c.say(words);
    clock.advance(500);
  }
  assert.equal(a.finals.length, 1);
  assert.equal(a.finals[0].info.reason, 'max');
  assert.ok(clock.now - 1_800_000_000_000 <= 60000, `ended at ${clock.now - 1_800_000_000_000} ms`);
});

test('tap to send: stop() delivers what was heard now (the recognizer\'s last words included), abort() delivers nothing', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const a = listen(stt);
  s.say('Book a table for two');
  clock.advance(300);
  a.handle.stop();
  assert.deepEqual(rec.current.calls, ['start', 'stop']);
  clock.advance(100);
  assert.deepEqual(a.log.slice(-2), ['final:Book a table for two', 'end']);
  assert.equal(a.finals[0].info.reason, 'stop');

  const b = listen(stt);
  s.say('never mind');
  b.handle.abort();
  clock.advance(1100);
  assert.deepEqual(b.log, ['partial:never mind', 'end']);
});

// ---- errors and restarts ----------------------------------------------------------------------------

test('the first session hearing nobody reports no-speech as before; a network failure after words keeps the words', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const a = listen(stt);
  clock.advance(900);
  rec.current.error('no-speech');
  rec.current.end();
  clock.advance(10);
  assert.deepEqual(a.log, ['error:no-speech', 'end']);

  const s = ios(rec);
  const b = listen(stt);
  s.say('What is the weather');
  rec.current.error('network');
  rec.current.end();
  clock.advance(10);
  assert.deepEqual(b.log, ['partial:What is the weather', 'final:What is the weather', 'end']);
  assert.equal(b.finals[0].info.reason, 'error');
});

test('errors keep their SPEC codes and messages', async () => {
  const stt = await freshStt();
  const mapped = Object.fromEntries(['not-allowed', 'service-not-allowed', 'no-speech', 'network', 'aborted', 'audio-capture', 'language-not-supported', 'bad-grammar', undefined].map((c) => [String(c), stt.mapSttError(c).code]));
  assert.deepEqual(mapped, {
    'not-allowed': 'not-allowed',
    'service-not-allowed': 'not-allowed',
    'no-speech': 'no-speech',
    network: 'network',
    aborted: 'aborted',
    'audio-capture': 'other',
    'language-not-supported': 'unsupported',
    'bad-grammar': 'other',
    undefined: 'other',
  });
  assert.ok(stt.mapSttError('not-allowed').message.length > 20);
});

test('a restart the browser refuses is never retried (no prompt loops): the words so far are delivered', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const a = listen(stt);
  s.say('Call mom');
  clock.advance(500);
  rec.throwOnStart = 'NotAllowedError';
  s.pauseEnd();
  clock.advance(5000);
  assert.equal(rec.made.length, 2, 'one refused attempt, no more');
  assert.deepEqual(a.log.filter((x) => !x.startsWith('partial:')), ['final:Call mom', 'end']);

  rec.throwOnStart = null;
  const b = listen(stt);
  clock.advance(1500);
  rec.throwOnStart = 'NotAllowedError';
  rec.current.end(); // ended by itself with nothing heard; listening again is refused
  clock.advance(5000);
  assert.deepEqual(b.log, ['error:not-allowed:restarted', 'end'], 'nothing heard: the refusal is reported once, marked as a restart');
});

test('a recognizer that keeps ending at once is tried again a little later each time, then given up; one that ends after a while is restarted at once', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const a = listen(stt);
  const startedAt = [];
  for (let i = 0; i < 10 && !a.log.includes('end'); i++) {
    const r = rec.current;
    startedAt.push(r.startedAt - 1_800_000_000_000);
    clock.advance(50);
    r.end(); // the microphone wasn't ready: it ends at once
    for (let k = 0; k < 40 && rec.current === r && !a.log.includes('end'); k++) clock.advance(50);
  }
  clock.advance(100);
  assert.equal(rec.made.length, 5, 'five quick ends in a row, then it stops');
  const gaps = startedAt.slice(1).map((ms, i) => ms - startedAt[i] - 50);
  assert.deepEqual(gaps, [150, 300, 600, 1000], 'each retry waits longer');
  assert.deepEqual(a.log, ['error:no-speech', 'end']);

  const s = ios(rec);
  const b = listen(stt);
  const before = rec.made.length;
  clock.advance(800);
  rec.current.end(); // iOS ended the first session by itself, nobody spoke yet
  for (let i = 0; i < 5; i++) {
    clock.advance(800);
    s.noSpeech(); // restarted sessions that hear nobody
  }
  assert.equal(rec.made.length - before, 6, 'iOS sessions that end after a pause are restarted each time');
  assert.ok(!b.log.some((x) => x.startsWith('error:')), 'their no-speech is not reported');
  s.say('Hello');
  clock.advance(1600);
  assert.deepEqual(b.finals.map((f) => f.text), ['Hello']);
});

test('nothing at all heard: no-speech after 10 s even when the recognizer never says so', async (t) => {
  const { clock, stt } = await setup(t);
  const a = listen(stt);
  clock.advance(9999);
  assert.deepEqual(a.log, []);
  clock.advance(1);
  clock.advance(1100);
  assert.deepEqual(a.log, ['error:no-speech', 'end']);
});

// ---- alternatives and contextual biasing --------------------------------------------------------------

test('alternatives: other readings of the whole turn, best first, without the one chosen', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const c = chrome(rec);
  const a = listen(stt);
  c.say('show the', {});
  c.finalize();
  c.say('alternate later', { alts: ['alternator', 'alternate leader'] });
  c.finalize({ alts: ['alternator', 'alternate leader'] });
  clock.advance(1600);
  assert.equal(a.finals[0].text, 'show the alternate later');
  assert.deepEqual(a.finals[0].info.alternatives, ['show the alternator', 'show the alternate leader']);
});

test('Chrome contextual biasing: phrases are given when the browser supports them; a service that refuses them is asked again without', async (t) => {
  const { clock, rec, stt } = await setup(t, { phrases: true, refusePhrases: true });
  const a = listen(stt, { phrases: ['Jarvis', { phrase: 'alternator', boost: 2 }, '', { phrase: 'x'.repeat(80), boost: 99 }] });
  const first = rec.current;
  assert.deepEqual(
    first.phrases.map((p) => [p.phrase, p.boost]),
    [['Jarvis', 1.5], ['alternator', 2], ['x'.repeat(60), 10]],
  );
  clock.advance(30); // 'phrases-not-supported', then the end
  assert.equal(rec.made.length, 2, 'listening started again at once');
  assert.deepEqual(rec.current.phrases, [], 'without phrases');
  assert.ok(!a.log.some((x) => x.startsWith('error:')), 'no error for the owner');
  ios(rec).say('Hello');
  clock.advance(1600);
  assert.deepEqual(a.finals.map((f) => f.text), ['Hello']);
  listen(stt, { phrases: ['Jarvis'] });
  assert.deepEqual(rec.current.phrases, [], 'and never sent again on this page');
});

test('no contextual biasing API (iOS): phrases are skipped silently', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const a = listen(stt, { phrases: ['Jarvis', 'alternator'] });
  assert.equal('phrases' in rec.current, false);
  ios(rec).say('Expand it');
  clock.advance(1600);
  assert.deepEqual(a.log, ['partial:Expand it', 'final:Expand it']);
});

// ---- keepListening (the 2-second check listens for "no, I said …") ----------------------------------------

test('keepListening: one turn after another on the same recognizer (Chrome results accumulate)', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const c = chrome(rec);
  const a = listen(stt, { keepListening: true });
  c.say('what is the weather in Austin');
  c.finalize();
  clock.advance(1600);
  assert.deepEqual(a.finals.map((f) => f.text), ['what is the weather in Austin']);
  assert.equal(rec.made.length, 1, 'the same recognizer keeps listening');
  assert.equal(rec.current.calls.length, 1);
  clock.advance(500);
  c.say('no I said Boston');
  clock.advance(300);
  assert.equal(a.partials().at(-1), 'no I said Boston', "the next turn's words only");
  c.finalize();
  clock.advance(1600);
  assert.deepEqual(a.finals.map((f) => f.text), ['what is the weather in Austin', 'no I said Boston']);
  assert.deepEqual(a.finals.map((f) => f.info.turn), [0, 1]);
  a.handle.abort();
  clock.advance(100);
  assert.equal(a.log.at(-1), 'end');
});

test('keepListening: iOS sessions end and restart between the turns; the next turn starts empty', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const a = listen(stt, { keepListening: true });
  s.say('Remind me to call Ann');
  clock.advance(700);
  s.pauseEnd();
  clock.advance(900);
  assert.deepEqual(a.finals.map((f) => f.text), ['Remind me to call Ann']);
  clock.advance(400);
  s.say('cancel');
  clock.advance(1600);
  assert.deepEqual(a.finals.map((f) => f.text), ['Remind me to call Ann', 'cancel']);
  // A turn whose recognizer keeps the old words in its one result: only the new words count.
  s.say('cancel and then some');
  clock.advance(1600);
  assert.deepEqual(a.finals.map((f) => f.text).at(-1), 'and then some');
  a.handle.stop();
  clock.advance(100);
  assert.equal(a.log.at(-1), 'end');
});

// The turn that ended may still be rewritten by the same session: Chrome's final for its last phrase
// comes after the turn ended (with the Short wait especially) and formats it ("twenty five" -> "25",
// a last word dropped, "2+2" -> "2 + 2"); iOS rewrites its one growing result. The next turn's words
// are what the session adds after the old ones, never a word count.
async function lateFinal(t, { wait = 'short', heard, final, next }) {
  const { clock, rec, stt } = await setup(t);
  const c = chrome(rec);
  const a = listen(stt, { keepListening: true, wait });
  clock.advance(100);
  c.say(heard);
  clock.advance(stt.listenWaitMs(wait) + 50); // the turn ends: the 2-second check starts
  assert.deepEqual(a.finals.map((f) => f.text), [heard]);
  rec.current.results([{ text: final, final: true }]); // Chrome's late final for that phrase
  clock.advance(300);
  if (next) {
    c.say(next); // said during the check: a new phrase
    clock.advance(200);
    c.finalize();
  }
  clock.advance(3000);
  return a;
}

test('keepListening: a late final with FEWER words for the last turn, then "cancel": the next turn is "cancel"', async (t) => {
  const a = await lateFinal(t, { heard: 'set a timer for twenty five minutes', final: 'set a timer for 25 minutes', next: 'cancel' });
  assert.deepEqual(a.finals.map((f) => f.text), ['set a timer for twenty five minutes', 'cancel']);
  assert.deepEqual(a.finals.map((f) => f.info.turn), [0, 1]);
  assert.equal(a.partials().at(-1), 'cancel');
});

test('keepListening: a late final that drops the last word, then "never mind": said whole, not "mind"', async (t) => {
  const a = await lateFinal(t, { heard: "what's the weather like in Boston today", final: "what's the weather like in Boston", next: 'never mind' });
  assert.deepEqual(a.finals.map((f) => f.text).slice(1), ['never mind']);
});

test('keepListening: the same with the Normal wait and "cancel that": not "that"', async (t) => {
  const a = await lateFinal(t, { wait: 'normal', heard: "what's the weather like in Boston today", final: "what's the weather like in Boston", next: 'cancel that' });
  assert.deepEqual(a.finals.map((f) => f.text).slice(1), ['cancel that']);
});

test('keepListening: a late final with MORE words ("2+2" -> "2 + 2") is not a new turn', async (t) => {
  const a = await lateFinal(t, { heard: 'what is 2+2', final: 'what is 2 + 2' });
  assert.deepEqual(a.finals.map((f) => f.text), ['what is 2+2'], 'no phantom turn "+ 2"');
  assert.deepEqual(a.partials(), ['what is 2+2'], 'and no partial for a next turn');
});

test('keepListening: a late final that only revises a word (Austin -> Boston) is not a new turn; words after it are', async (t) => {
  const a = await lateFinal(t, { heard: 'what is the weather in Austin', final: 'what is the weather in Boston', next: 'send it' });
  assert.deepEqual(a.finals.map((f) => f.text), ['what is the weather in Austin', 'send it']);
});

test('keepListening: an iOS session that outlives the turn rewrites its one result and adds "cancel": the next turn is "cancel"', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const s = ios(rec);
  const a = listen(stt, { keepListening: true });
  clock.advance(100);
  s.say('Set a timer for twenty five minutes');
  clock.advance(1700); // the turn ends; the session goes on (no pause-end yet)
  assert.deepEqual(a.finals.map((f) => f.text), ['Set a timer for twenty five minutes']);
  clock.advance(300);
  s.say('Set a timer for 25 minutes cancel'); // iOS reformats the whole result as it adds the new word
  clock.advance(700);
  s.pauseEnd();
  clock.advance(2000);
  assert.deepEqual(a.finals.map((f) => f.text), ['Set a timer for twenty five minutes', 'cancel']);
});

test("continuation: how many words of a session are an earlier turn's again, however they were rewritten", async () => {
  const stt = await freshStt();
  assert.equal(typeof stt.continuation, 'function');
  const n = (before, now) => stt.continuation(stt.normalWords(before), stt.normalWords(now));
  assert.equal(n('what is the weather', 'what is the weather in Boston'), 4, 'unchanged: the new words follow');
  assert.equal(n('set a timer for twenty five minutes', 'set a timer for 25 minutes cancel'), 6, 'a number formatted');
  assert.equal(n('what is 2+2', 'what is 2 + 2'), 4, 'one number in two tokens');
  assert.equal(n('in Boston today', 'in Boston never mind'), 2, 'a dropped last word is not taken for a new one');
  assert.equal(n('in Boston today', 'in Boston'), 2);
  assert.equal(n('the weather in Austin', 'the weather in Boston'), 4, 'a word revised to one like it');
  assert.equal(n('the weather in Austin', 'the weather in Boston send it'), 4);
  assert.equal(n('what is the weather', "what's the weather cancel"), 3, 'a contraction');
  assert.equal(n('play some jazz music', 'play some jazz yes'), 3, 'a new word that only shares a letter or two');
  assert.equal(n('set a timer', 'cancel'), 0, 'the old words are gone: all of it is new');
  assert.equal(n('', 'hello there'), 0);
  assert.equal(n('hello there', ''), 0);
});

test('callbacks that throw never break listening', async (t) => {
  const { clock, rec, stt } = await setup(t);
  const errors = [];
  const orig = console.error;
  console.error = (...args) => errors.push(args);
  t.after(() => {
    console.error = orig;
  });
  const log = [];
  stt.startListening({
    onPartial: () => {
      throw new Error('partial');
    },
    onFinal: (x) => {
      log.push(x);
      throw new Error('final');
    },
    onEnd: () => log.push('end'),
  });
  ios(rec).say('Still works');
  clock.advance(1700);
  assert.deepEqual(log, ['Still works', 'end']);
  assert.ok(errors.length >= 2);
});

test('an unsupported browser reports unsupported and ends, never synchronously', async (t) => {
  const clock = installClock();
  const stt = await freshStt();
  const saved = { a: globalThis.SpeechRecognition, b: globalThis.webkitSpeechRecognition };
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  t.after(() => {
    if (saved.a) globalThis.SpeechRecognition = saved.a;
    if (saved.b) globalThis.webkitSpeechRecognition = saved.b;
    clock.restore();
  });
  const a = listen(stt);
  assert.equal(stt.sttSupported(), false);
  assert.deepEqual(a.log, []);
  clock.advance(1);
  assert.deepEqual(a.log, ['error:unsupported', 'end']);
});
