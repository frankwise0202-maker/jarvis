// v8.1 hands-free on a Mac (src/lib/hands-free.js, SPEC §28): the follow-up window and the hidden brake
// (A6), the barge-in gate (A8) and the mask that keeps Jarvis from waking himself when he says "Jarvis"
// (critique M8). Pure functions; the mask on a virtual clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDS_FREE, followUp, bargeInAllowed, readHandsFreeTest, jarvisSpans, createSelfMask } from '../../src/lib/hands-free.js';
import { HANDS_FREE_TEST_KEY } from '../../src/lib/audio-devices.js';

test('the owner’s numbers, each in one place: 8 s to start a follow-up, 3 questions in a row while hidden, barge-in in setups 1 and 3', () => {
  assert.equal(HANDS_FREE.followUpMs, 8000);
  assert.equal(HANDS_FREE.hiddenQuestions, 3);
  assert.deepEqual([...HANDS_FREE.bargeInSetups], ['speaker-mac-mic', 'switch']);
  assert.equal(HANDS_FREE.maskBeforeMs, 1000);
  assert.equal(HANDS_FREE.maskAfterMs, 1000);
  assert.equal(HANDS_FREE_TEST_KEY, 'jarvis.handsFreeTest.v1');
});

test('followUp: a woken session listens once for 8 s after an answer, on screen or not', () => {
  for (const away of [false, true]) {
    assert.deepEqual(followUp({ woken: true, away, continuous: true, asked: 1 }), { listen: true, brake: false, noSpeechMs: 8000, tries: 1 });
  }
});

test('followUp: a tapped session in the background follows the same window; on screen it keeps today’s Continuous rule', () => {
  assert.deepEqual(followUp({ woken: false, away: true, continuous: true, asked: 1 }), { listen: true, brake: false, noSpeechMs: 8000, tries: 1 });
  assert.deepEqual(followUp({ woken: false, away: false, continuous: true, asked: 7 }), { listen: true, brake: false, noSpeechMs: 0, tries: 0 }, 'today: two tries of up to 12 s, no count');
});

test('followUp: Continuous off keeps today’s rule (no listen), except the wake routine’s offer, which waits for its answer', () => {
  assert.deepEqual(followUp({ woken: true, continuous: false }), { listen: false, brake: false, noSpeechMs: 0, tries: 0 });
  assert.deepEqual(followUp({ woken: false, away: true, continuous: false }), { listen: false, brake: false, noSpeechMs: 0, tries: 0 });
  assert.deepEqual(followUp({ woken: true, continuous: false, asking: true, asked: 0 }), { listen: true, brake: false, noSpeechMs: 8000, tries: 1 });
});

test('followUp: the brake — while hidden, after the 3rd question in a row no follow-up listen; on screen the count doesn’t matter', () => {
  for (const woken of [true, false]) {
    assert.equal(followUp({ woken, away: true, asked: 2 }).listen, true, `2 asked (woken ${woken})`);
    assert.deepEqual(followUp({ woken, away: true, asked: 3 }), { listen: false, brake: true, noSpeechMs: 0, tries: 0 }, `3 asked (woken ${woken})`);
    assert.equal(followUp({ woken, away: true, asked: 9 }).brake, true);
    assert.equal(followUp({ woken, away: false, asked: 9 }).brake, false, 'on screen: no brake');
  }
});

test('bargeInAllowed: a computer, setup 1 or 3, and the hands-free Test’s self-trigger step passed — nothing less', () => {
  const passed = { selfTrigger: 'passed' };
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: passed }), true);
  assert.equal(bargeInAllowed({ computer: true, setup: 'switch', test: passed }), true);
  assert.equal(bargeInAllowed({ computer: true, setup: 'speakerphone-both', test: passed }), false, 'setup 2: the speakerphone’s microphone open while he speaks would make George a phone call');
  assert.equal(bargeInAllowed({ computer: true, setup: undefined, test: passed }), false, 'no setup chosen: today’s behaviour');
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: { selfTrigger: 'failed' } }), false, 'George woke the detector in the Test');
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: { selfTrigger: null } }), false, 'the Test not run');
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: null }), false);
  assert.equal(bargeInAllowed({ computer: false, setup: 'speaker-mac-mic', test: passed }), false, 'never on an iPhone');
  assert.equal(bargeInAllowed(), false);
});

test('readHandsFreeTest: the Test’s results as Settings → Voice → Microphone and speaker writes them; anything else is null', () => {
  const store = (v) => ({ getItem: (k) => (k === 'jarvis.handsFreeTest.v1' ? v : null) });
  assert.deepEqual(readHandsFreeTest(store(JSON.stringify({ at: 5, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: false }))), { at: 5, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: false });
  assert.deepEqual(readHandsFreeTest(store(JSON.stringify({ at: 9, selfTrigger: 'yes', hiddenWords: 'x' }))), { at: 9, hiddenWords: null, selfTrigger: null, heardSpeaker: null });
  assert.equal(readHandsFreeTest(store(JSON.stringify({ selfTrigger: 'passed' }))), null, 'no time: not a result');
  assert.equal(readHandsFreeTest(store(null)), null);
  assert.equal(readHandsFreeTest(store('{oops')), null);
  assert.equal(readHandsFreeTest(store('[1]')), null);
  assert.equal(readHandsFreeTest(null), null);
  assert.equal(readHandsFreeTest({ getItem: () => { throw new Error('blocked'); } }), null);
});

test('jarvisSpans: each "Jarvis" as a whole word, any case, "Jarvis’s" included; not inside another word', () => {
  const text = 'Jarvis here. Ask JARVIS anything; Jarvis’s answer, jarvisbot, the Jarvises.';
  const spans = jarvisSpans(text);
  assert.deepEqual(spans.map((s) => text.slice(s.start, s.end)), ['Jarvis', 'JARVIS', 'Jarvis']);
  assert.deepEqual(jarvisSpans('Chrome asks: add it to the cart?'), [], 'Jarvis’s own lines say “Chrome asks”');
  assert.deepEqual(jarvisSpans(''), []);
  assert.deepEqual(jarvisSpans(null), []);
});

/** A mask on a clock the test moves; `say` moves the spoken position as George's word events would. */
function maskOn(text, { rate = 1 } = {}) {
  let now = 1000;
  const mask = createSelfMask({ now: () => now });
  mask.begin(text, rate);
  return {
    mask,
    at: (ms) => {
      now = ms;
    },
    get now() {
      return now;
    },
  };
}

test('the self-mask: masked from about 1 s before each "Jarvis" to about 1 s after it, following the word events; clear elsewhere', () => {
  const lead = 'Here is the plan for tonight, and the lights go out at ten. '; // 60 characters before "Jarvis"
  const text = `${lead}Jarvis will remind you. After that the house is quiet until the morning comes again.`;
  const j = text.indexOf('Jarvis');
  const m = maskOn(text);
  assert.equal(m.mask.masked(), false, 'nothing has played yet');
  m.mask.chunk({ start: 0 });
  assert.equal(m.mask.masked(), false, 'the start of the reply');
  // A word ~2 s of speech before "Jarvis" (29 characters at 14.5 a second): clear.
  m.mask.boundary({ charIndex: j - 29 });
  assert.equal(m.mask.masked(), false, '2 s before');
  // A word just under 1 s before (14 characters): masked.
  m.mask.boundary({ charIndex: j - 14 });
  assert.equal(m.mask.masked(), true, '1 s before');
  m.mask.boundary({ charIndex: j });
  assert.equal(m.mask.masked(), true, 'the word itself');
  // Between events the position is estimated at 14.5 characters a second.
  const end = j + 'Jarvis'.length;
  m.mask.boundary({ charIndex: end + 1 });
  m.at(m.now + 900);
  assert.equal(m.mask.masked(), true, 'just under 1 s after it');
  m.at(m.now + 300);
  assert.equal(m.mask.masked(), false, 'more than 1 s after it');
  m.mask.boundary({ charIndex: text.indexOf('morning') });
  assert.equal(m.mask.masked(), false, 'later words');
});

test('the self-mask: a faster voice covers the same time (the rate); a streamed reply’s new text is masked too; end() clears it', () => {
  const m = maskOn('Okay.', { rate: 1.5 });
  m.mask.chunk({ start: 0 });
  m.mask.text('Okay. One more thing for you from Jarvis tonight.');
  const j = 'Okay. One more thing for you from Jarvis tonight.'.indexOf('Jarvis');
  m.mask.boundary({ charIndex: j - 20 }); // 20 characters at 1.5 × 14.5 a second: 0.92 s before
  assert.equal(m.mask.masked(), true);
  m.mask.end();
  assert.equal(m.mask.masked(), false, 'not speaking: nothing masked');
});

test('the self-mask: no "Jarvis" in the text, never masked; bad events are ignored', () => {
  const m = maskOn('Chrome asks: shall I add it to the cart?');
  m.mask.chunk({ start: 0 });
  m.mask.boundary({ charIndex: 'nope' });
  m.mask.chunk(null);
  for (let i = 0; i < 40; i += 4) {
    m.mask.boundary({ charIndex: i });
    assert.equal(m.mask.masked(), false);
  }
});
