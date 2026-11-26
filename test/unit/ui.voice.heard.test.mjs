// "Show, then send" (src/ui/voice-heard.js, v7.2): what the owner says while Jarvis shows what it
// heard (cancel, a correction, send, wait, the sentence going on), how a correction is applied (and
// when Jarvis is only guessing, so the owner confirms it), the reading chosen among alternatives, and
// the phrases for Chrome's contextual biasing. Plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_MS, reviewReply, applyCorrection, planCorrection as plan, pickHeard, namesPart, commandReading, listenPhrases, COMMAND_PHRASES } from '../../src/ui/voice-heard.js';
import { matchMusicCommand } from '../../src/lib/music-commands.js';
import { matchScreenCommand } from '../../src/lib/screen-commands.js';

test('the check lasts 2 seconds', () => {
  assert.equal(REVIEW_MS, 2000);
});

test('reviewReply: cancel, never mind, forget it, scratch that (with "Jarvis", "no", punctuation, any case)', () => {
  for (const s of ['cancel', 'Cancel.', 'Cancel that', 'Never mind', 'nevermind', 'no, never mind', 'Jarvis, cancel', 'Forget it!', 'scratch that', "Don't send it", 'stop', 'Cancel, please']) {
    assert.deepEqual(reviewReply(s, 'What is the weather'), { kind: 'cancel' }, s);
  }
});

test('reviewReply: "no, I said …" and "I said …" correct it, with the words as spoken', () => {
  assert.deepEqual(reviewReply('No, I said Boston', 'What is the weather in Austin'), { kind: 'correct', text: 'Boston' });
  assert.deepEqual(reviewReply('I said what is the weather in Boston?', 'x'), { kind: 'correct', text: 'what is the weather in Boston?' });
  assert.deepEqual(reviewReply('no I meant Tuesday', 'x'), { kind: 'correct', text: 'Tuesday' });
  assert.deepEqual(reviewReply('Nope, I mean the red one', 'x'), { kind: 'correct', text: 'the red one' });
  assert.deepEqual(reviewReply('Jarvis, no, I said "Ann"', 'x'), { kind: 'correct', text: 'Ann' });
  // The sentence said again replaces it too.
  assert.deepEqual(reviewReply("What's the weather in Boston", "What's the weather in Austin"), { kind: 'correct', text: "What's the weather in Boston" });
});

test('reviewReply: send now, wait, fillers, and anything else carries the sentence on', () => {
  for (const s of ['Send it', 'yes', 'Go ahead.', "That's right", 'send now']) assert.deepEqual(reviewReply(s, 'x y'), { kind: 'send' }, s);
  for (const s of ['wait', 'Hold on', 'hang on', 'No.', 'one second', 'not quite']) assert.deepEqual(reviewReply(s, 'x y'), { kind: 'wait' }, s);
  for (const s of ['um', 'uh, hmm', '', '  ']) assert.deepEqual(reviewReply(s, 'x y'), { kind: 'filler' }, JSON.stringify(s));
  assert.deepEqual(reviewReply('and should I bring an umbrella', 'What is the weather tomorrow'), { kind: 'more', text: 'and should I bring an umbrella' });
  assert.deepEqual(reviewReply('in Boston', 'What is the weather'), { kind: 'more', text: 'in Boston' });
  // A sentence that only contains "I said" later is not a correction.
  assert.equal(reviewReply('and tell her what I said yesterday', 'Text Ann').kind, 'more');
  assert.equal(reviewReply('cancel my two o clock meeting', 'x').kind, 'more', 'cancel as part of a request is not a cancel');
});

test('applyCorrection: a short fix replaces the word that sounds most like it; a restatement replaces everything', () => {
  assert.equal(applyCorrection("What's the weather in Austin tomorrow?", 'Boston'), "What's the weather in Boston tomorrow?");
  assert.equal(applyCorrection('Call Dan at home', 'Ann'), 'Call Ann at home');
  assert.equal(applyCorrection('Set a timer for 15 minutes', '50'), 'Set a timer for 50 minutes');
  assert.equal(applyCorrection('Remind me at five', 'nine.'), 'Remind me at nine');
  assert.equal(applyCorrection('Show me the alternate', 'alternator'), 'Show me the alternator');
  assert.equal(applyCorrection('What is the capital of France', 'what is the capital of Spain'), 'what is the capital of Spain');
  assert.equal(applyCorrection('Play some jazz', 'turn on the lights'), 'turn on the lights', 'a whole new sentence: it replaces it all');
  assert.equal(applyCorrection('Text Bob', 'Rob'), 'Text Rob');
  assert.equal(applyCorrection('Call Ann at home', 'Ann'), 'Call Ann at home', 'it already says that');
  assert.equal(applyCorrection('Text Bob', 'call Rob'), 'call Rob', 'as long as the sentence: a restatement');
  assert.equal(applyCorrection('', 'hello'), 'hello');
  assert.equal(applyCorrection('hello', ''), 'hello');
});

test('reviewReply: a run of "no", "oh" or "wait" before a cancel phrase is a cancel', () => {
  for (const s of ['No no, cancel', 'no no no cancel that', 'Oh no, never mind', 'Wait, wait, forget it', 'No, no. Scratch that.', 'Jarvis, no no, cancel', 'nope, cancel']) {
    assert.deepEqual(reviewReply(s, 'Tell me a joke about robots'), { kind: 'cancel' }, s);
  }
  assert.equal(reviewReply('no no cancel my two o clock meeting', 'x').kind !== 'cancel', true, 'a request that only starts like it is not a cancel');
});

test('reviewReply: "no, <a few words>" corrects them; "no no" and "no, wait" stop the countdown', () => {
  assert.deepEqual(reviewReply('No, Boston', "What's the weather in Austin"), { kind: 'correct', text: 'Boston' });
  assert.deepEqual(reviewReply('no Boston Massachusetts', "What's the weather in Austin"), { kind: 'correct', text: 'Boston Massachusetts' });
  assert.deepEqual(reviewReply('Nope, for four.', 'Book a table for two'), { kind: 'correct', text: 'for four.' });
  assert.deepEqual(reviewReply('No no, I said Boston', "What's the weather in Austin"), { kind: 'correct', text: 'Boston' });
  assert.deepEqual(reviewReply("No, what's the weather in Boston", "What's the weather in Austin"), { kind: 'correct', text: "what's the weather in Boston" });
  for (const s of ['no no', 'No, no, no.', 'no, wait', 'No, hold on', 'no um']) assert.deepEqual(reviewReply(s, 'x y'), { kind: 'wait' }, s);
  assert.deepEqual(reviewReply('No, send it', 'x y'), { kind: 'send' });
  for (const s of ["No, that's fine", "That's fine.", 'Looks good', "it's fine"]) assert.deepEqual(reviewReply(s, 'x y'), { kind: 'send' }, s);
});

test('planCorrection: a multi-word fix is anchored on the words it shares with the sentence; only that span changes', () => {
  assert.deepEqual(plan('Remind me to buy milk', 'oat milk'), { text: 'Remind me to buy oat milk', sure: true });
  assert.deepEqual(plan('Remind me to buy milk tomorrow', 'oat milk'), { text: 'Remind me to buy oat milk tomorrow', sure: true });
  assert.deepEqual(plan('Book a table for two at seven', 'for four'), { text: 'Book a table for four at seven', sure: true });
  assert.deepEqual(plan('Book a table for two at seven', 'at eight'), { text: 'Book a table for two at eight', sure: true });
  assert.deepEqual(plan("What's the weather in Nice", 'Nice, France'), { text: "What's the weather in Nice, France", sure: true });
  assert.deepEqual(plan("What's the weather in Nice today?", 'Nice, France'), { text: "What's the weather in Nice, France today?", sure: true });
  assert.deepEqual(plan('Buy oat milk and eggs', 'almond milk'), { text: 'Buy almond milk and eggs', sure: true });
  assert.deepEqual(plan('Show me the blue one', 'the red one'), { text: 'Show me the red one', sure: true });
  assert.deepEqual(plan("What's the weather in austin", 'in Paris'), { text: "What's the weather in Paris", sure: true });
  assert.deepEqual(plan('Remind me to call Dan tomorrow at nine', 'remind me to call Ann'), { text: 'remind me to call Ann tomorrow at nine', sure: true });
});

test('planCorrection: a short fix with nothing close, or a number among several, is a guess the owner confirms (sure: false), never the whole sentence', () => {
  assert.deepEqual(plan("What's the weather in Austin", 'Paris'), { text: "What's the weather in Paris", sure: false });
  assert.deepEqual(plan("what's the weather in austin", 'Paris'), { text: "what's the weather in Paris", sure: false });
  assert.deepEqual(plan('Book a table for two at seven', 'eight'), { text: 'Book a table for two at eight', sure: false });
  assert.deepEqual(plan('Turn on the porch light', 'lamp'), { text: 'Turn on the porch lamp', sure: false });
  assert.deepEqual(plan("What's the weather in Austin", 'New Jersey'), { text: "What's the weather in New Jersey", sure: false });
  assert.deepEqual(plan('Text Sarah that I am running late', 'Sara with no h'), { text: 'Text Sarah that I am running late', sure: false }, 'no guess: unchanged, the owner fixes it');
  assert.deepEqual(plan('Call Dan and Jan', 'Ann'), { text: 'Call Dan and Ann', sure: false }, 'two words sound alike: a guess');
});

test('planCorrection: the clear cases stay sure', () => {
  assert.deepEqual(plan("What's the weather in Austin tomorrow?", 'Boston'), { text: "What's the weather in Boston tomorrow?", sure: true });
  assert.deepEqual(plan('Set a timer for 15 minutes', 'twenty five'), { text: 'Set a timer for twenty five minutes', sure: true });
  assert.deepEqual(plan('Set a timer for 15 minutes', '50'), { text: 'Set a timer for 50 minutes', sure: true });
  assert.deepEqual(plan('Call Ann at home', 'Ann'), { text: 'Call Ann at home', sure: true });
  assert.deepEqual(plan('What is the capital of France', 'what is the capital of Spain'), { text: 'what is the capital of Spain', sure: true });
  assert.deepEqual(plan("What's the weather in Austin", 'I want the weather in Boston'), { text: 'I want the weather in Boston', sure: true });
});

test('pickHeard: an alternative that names a part of the open hologram wins over a reading that names none', () => {
  const parts = ['Alternator', 'Water pump', 'Serpentine belt', 'x'];
  assert.equal(pickHeard('what does the alternate er do', ['what does the alternator do', 'what does the ultimate do'], parts), 'what does the alternator do');
  assert.equal(pickHeard('how is the water pump driven', ['how is the water bump driven'], parts), 'how is the water pump driven', 'the best reading already names one');
  assert.equal(pickHeard('what time is it', ['what time is hit'], parts), 'what time is it', 'no reading names a part');
  assert.equal(pickHeard('show the serpent in belt', [], parts), 'show the serpent in belt');
  assert.equal(pickHeard('anything', ['anything else'], []), 'anything');
});

test('listenPhrases: Jarvis first, then the part names (once each), then the command words; at most 80', () => {
  const p = listenPhrases({ partNames: ['Alternator', 'alternator', 'Water pump', '', 'x', ...Array.from({ length: 60 }, (_, i) => `Part ${i}`)] });
  assert.deepEqual(p[0], { phrase: 'Jarvis', boost: 2.5 });
  assert.deepEqual(p.slice(1, 3), [
    { phrase: 'Alternator', boost: 2 },
    { phrase: 'Water pump', boost: 2 },
  ]);
  assert.ok(p.length <= 80);
  assert.ok(p.some((x) => x.phrase === 'expand it' && x.boost === 1.2));
  assert.ok(p.every((x) => x.boost >= 0 && x.boost <= 10 && typeof x.phrase === 'string' && x.phrase.length <= 60));
  assert.deepEqual(listenPhrases().slice(0, 2), [{ phrase: 'Jarvis', boost: 2.5 }, { phrase: 'expand it', boost: 1.2 }]);
});

test('namesPart: the words name a part of the hologram on screen (whole words, any case, other names too)', () => {
  const parts = ['Separator', 'Positive terminal', 'cap', 'x'];
  assert.equal(namesPart('How does the separator work?', parts), true);
  assert.equal(namesPart('show me the POSITIVE TERMINAL', parts), true);
  assert.equal(namesPart('What is a capacitor?', parts), false, 'whole words only');
  assert.equal(namesPart('play x', parts), false, 'a name of one letter is ignored');
  assert.equal(namesPart('How does the separator work?', []), false);
  assert.equal(namesPart('', parts), false);
});

test('commandReading (the chat\'s mic): a command first; another reading for Apple Music only when the best one is nothing else', () => {
  const m = { isCommand: (t) => matchScreenCommand(t), isMusic: (t) => matchMusicCommand(t) };
  // No alternatives, or the best reading is a command or a music command: the best reading.
  assert.equal(commandReading('What is the capital of France?', [], m), 'What is the capital of France?');
  assert.equal(commandReading('play Back in Black', ['pay back in black'], m), 'play Back in Black');
  assert.equal(commandReading('put mission control on my other screen', ['play mission control'], m), 'put mission control on my other screen');
  // A misheard "play": the reading that is a music command.
  assert.equal(commandReading('Clay Back in Black', ['play Back in Black'], m), 'play Back in Black');
  assert.equal(commandReading('Stop the mu sick', ['stop the music'], m), 'stop the music');
  // A screen command among the other readings comes before a music one.
  assert.equal(commandReading('put mission control on my other green', ['play mission control', 'put mission control on my other screen'], m), 'put mission control on my other screen');
  // A best reading that is a music command keeps it over another reading's screen command.
  assert.equal(commandReading('play Thriller', ['put it on my other screen'], m), 'play Thriller');
  // Nothing is a command: the best reading as it was heard.
  assert.equal(commandReading('What role does OPEC play in oil prices?', ['What role does OPEC play in oil price'], m), 'What role does OPEC play in oil prices?');
  // Matchers that fail count as "no".
  assert.equal(commandReading('Clay Back in Black', ['play Back in Black'], { isMusic: () => { throw new Error('x'); } }), 'Clay Back in Black');
});

test('listenPhrases: Apple Music\'s command words are listened for too (after the check\'s own words)', () => {
  const p = listenPhrases().map((x) => x.phrase);
  for (const w of ['Apple Music', 'stop the music', 'play the album', 'a preview of']) assert.ok(p.includes(w), w);
  assert.ok(p.indexOf('no, I said') < p.indexOf('Apple Music'), 'the check\'s words come first');
  assert.ok(listenPhrases({ partNames: Array.from({ length: 60 }, (_, i) => `Part ${i}`) }).length <= 80);
});

test('listenPhrases: the hands-free words (v8.1) are listened for too, each once', () => {
  const p = listenPhrases().map((x) => x.phrase);
  for (const w of ['Optics', 'Chrome', 'side by side', 'live view', 'video mode', 'new chat', 'walk me through', 'enclosed', 'opened', 'approve']) {
    assert.ok(COMMAND_PHRASES.includes(w), w);
    assert.ok(p.includes(w), w);
  }
  assert.equal(new Set(COMMAND_PHRASES.map((w) => w.toLowerCase())).size, COMMAND_PHRASES.length, 'no phrase twice');
  assert.ok(COMMAND_PHRASES.every((w) => typeof w === 'string' && w.length <= 60));
  assert.ok(Object.isFrozen(COMMAND_PHRASES));
  // Without a hologram every command word fits in the list of 80.
  assert.equal(p.length, 1 + COMMAND_PHRASES.length);
  assert.ok(p.length <= 80);
});

