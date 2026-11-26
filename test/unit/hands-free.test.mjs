// v8.1 hands-free on a Mac (src/lib/hands-free.js, SPEC §28): the follow-up window and the hidden brake
// (A6), the barge-in gate (A8) and the mask that keeps Jarvis from waking himself when he says "Jarvis"
// (critique M8). Pure functions; the mask on a virtual clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDS_FREE, followUp, bargeInAllowed, readHandsFreeTest, jarvisSpans, createSelfMask, startsWithWakeWords } from '../../src/lib/hands-free.js';
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

// The setup and devices now (handsFreeMeasure in src/lib/audio-devices.js) and what the Test's step measured.
const NOW1 = Object.freeze({ setup: 'speaker-mac-mic', wakeMic: 'mac-mic', speaker: 'sp-out', clap: true, word: true });
const passedOn = (measured = NOW1) => ({ selfTrigger: 'passed', measured });

test('bargeInAllowed: a computer, setup 1 or 3, and the hands-free Test’s self-trigger step passed on this setup — nothing less', () => {
  const now3 = { ...NOW1, setup: 'switch' };
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: passedOn(), now: NOW1 }), true);
  assert.equal(bargeInAllowed({ computer: true, setup: 'switch', test: passedOn(now3), now: now3 }), true);
  const now2 = { ...NOW1, setup: 'speakerphone-both' };
  assert.equal(bargeInAllowed({ computer: true, setup: 'speakerphone-both', test: passedOn(now2), now: now2 }), false, 'setup 2: the speakerphone’s microphone open while he speaks would make George a phone call');
  assert.equal(bargeInAllowed({ computer: true, setup: undefined, test: passedOn(), now: NOW1 }), false, 'no setup chosen: today’s behaviour');
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: { selfTrigger: 'failed', measured: NOW1 }, now: NOW1 }), false, 'George woke the detector in the Test');
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: { selfTrigger: null }, now: NOW1 }), false, 'the Test not run');
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: null, now: NOW1 }), false);
  assert.equal(bargeInAllowed({ computer: false, setup: 'speaker-mac-mic', test: passedOn(), now: NOW1 }), false, 'never on an iPhone');
  assert.equal(bargeInAllowed(), false);
});

// MAC-9: a "passed" measured in another setup, or with another microphone or speaker, or before "Hey Jarvis" was on,
// turned barge-in on untested. Now it counts only for what it measured; otherwise the card says to run it again.
test('MAC-9: a passed self-trigger step counts only for the setup, wake microphone and speaker it measured, and the wake detectors that listened', () => {
  const allowed = (measured, now = NOW1) => bargeInAllowed({ computer: true, setup: now.setup, test: passedOn(measured), now });
  assert.equal(allowed(NOW1), true, 'the same: on');
  assert.equal(allowed({ ...NOW1, setup: 'speakerphone-both' }), false, 'measured in “Speakerphone for both”: untested on setup 1');
  assert.equal(allowed({ ...NOW1, wakeMic: 'sp-mic' }), false, 'another wake microphone');
  assert.equal(allowed({ ...NOW1, speaker: 'usb-out' }), false, 'another speaker (or the speakerphone gone: the Mac’s speakers)');
  assert.equal(allowed({ ...NOW1, word: false }), false, '“Hey Jarvis” turned on after a Test on claps alone');
  assert.equal(allowed({ ...NOW1, clap: false }), false, 'claps turned on after a Test on “Hey Jarvis” alone');
  assert.equal(allowed(NOW1, { ...NOW1, clap: false }), true, 'claps turned off since: what listens was tested');
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: { selfTrigger: 'passed' }, now: NOW1 }), false, 'a result that doesn’t say what it measured: run it again');
  assert.equal(bargeInAllowed({ computer: true, setup: 'speaker-mac-mic', test: passedOn() }), false, 'nothing known about now: off');
});

test('readHandsFreeTest: the Test’s results as Settings → Voice → Microphone and speaker writes them; anything else is null', () => {
  const store = (v) => ({ getItem: (k) => (k === 'jarvis.handsFreeTest.v1' ? v : null) });
  assert.deepEqual(readHandsFreeTest(store(JSON.stringify({ at: 5, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: false, measured: NOW1 }))), { at: 5, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: false, measured: { ...NOW1 } });
  assert.deepEqual(readHandsFreeTest(store(JSON.stringify({ at: 9, selfTrigger: 'yes', hiddenWords: 'x' }))), { at: 9, hiddenWords: null, selfTrigger: null, heardSpeaker: null, measured: null });
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

// MAC-V-1: "Hey Jarvis, …" said in a hidden follow-up listen is the owner calling him, not room talk.
test('startsWithWakeWords: a sentence that starts with "Hey Jarvis" (as the recognizer writes it); not one that only mentions him', () => {
  for (const s of ['hey Jarvis what is the capital of France', 'Hey, Jarvis, what time is it?', 'Hey Jarvis.', 'hi jarvis how are you', 'OK Jarvis, play some music', 'okay Jarvis what about Spain', 'A Jarvis what is the weather', 'hey Jervis turn it down', '  HEY JARVIS  ']) {
    assert.equal(startsWithWakeWords(s), true, s);
  }
  for (const s of ['Jarvis, run a diagnostic', 'what is the capital of France', 'tell Jarvis hey', 'hey what is up Jarvis', 'they jarvis', 'hey jarvisx', 'hey', '', null, undefined, 42]) {
    assert.equal(startsWithWakeWords(s), false, String(s));
  }
});
