// "Show, then send" (src/ui/voice-heard.js, v7.2): what the owner says while Jarvis shows what it
// heard (cancel, a correction, send, wait, the sentence going on), how a correction is applied, the
// reading chosen among alternatives, and the phrases for Chrome's contextual biasing. Plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_MS, reviewReply, applyCorrection, pickHeard, listenPhrases } from '../../src/ui/voice-heard.js';

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
  assert.equal(applyCorrection('Play some jazz', 'turn on the lights'), 'turn on the lights', 'nothing alike: it replaces it all');
  assert.equal(applyCorrection('Text Bob', 'Rob'), 'Text Rob');
  assert.equal(applyCorrection('Call Ann at home', 'Ann'), 'Call Ann at home', 'it already says that');
  assert.equal(applyCorrection('Text Bob', 'call Rob'), 'call Rob', 'as long as the sentence: a restatement');
  assert.equal(applyCorrection('', 'hello'), 'hello');
  assert.equal(applyCorrection('hello', ''), 'hello');
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
