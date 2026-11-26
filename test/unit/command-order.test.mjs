// The one router's order and rules (src/lib/command-order.js, v8.1 C1): the layers and their ids in
// order, the word cap with carriers exempt (R3), questions (R4), alternatives only for free, undoable,
// unchecked actions that touch neither the camera nor the microphone (R7), and which open question a
// bare "cancel" or "no" answers. Plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYERS,
  ORDER,
  ORDER_STEPS,
  sortRegistrations,
  MAX_WORDS,
  wordCount,
  overCap,
  isQuestion,
  alternativeOk,
  readingsToTry,
  isBareNo,
  isStopWord,
  lastAsked,
} from '../../src/lib/command-order.js';
import { act } from '../../src/lib/app-commands.js';

test('the layers of contract (b), in the order (1)-(8)', () => {
  assert.deepEqual([...LAYERS], ['standby', 'answer', 'stop', 'destination', 'top', 'app', 'media', 'camera']);
  for (const layer of LAYERS) assert.ok(Array.isArray(ORDER[layer]), layer);
  assert.deepEqual(Object.keys(ORDER), [...LAYERS]);
  // Each id has one place.
  const ids = LAYERS.flatMap((l) => ORDER[l]);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ORDER_STEPS.map((s) => s.step), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(ORDER_STEPS[0].layer, 'wake');
  assert.equal(ORDER_STEPS[9].layer, 'claude');
});

test('within a layer: the declared order, then the rest as registered', () => {
  assert.deepEqual([...ORDER.answer], ['chrome.prompt', 'question'], "the Chrome prompt's reserved words, then the newest owner question");
  assert.deepEqual([...ORDER.top], ['tour', 'tour.start', 'hologram', 'optics'], 'a tour, then a hologram or blueprint, then Optics');
  assert.equal(ORDER.destination.indexOf('chrome.open') < ORDER.destination.indexOf('chrome.task'), true, 'opening a page (free) before a task (paid)');
  assert.equal(ORDER.destination.indexOf('windows') < ORDER.destination.indexOf('screens'), true);
  assert.deepEqual([...ORDER.media], ['music', 'homebase', 'brain']);
  const regs = [
    { id: 'camera', layer: 'camera' },
    { id: 'zzz', layer: 'app' },
    { id: 'app', layer: 'app' },
    { id: 'hologram', layer: 'top' },
    { id: 'tour', layer: 'top' },
    { id: 'voice.controls', layer: 'app' },
    { id: 'yyy', layer: 'app' },
    { id: 'standby', layer: 'standby' },
    { id: 'nowhere', layer: 'nowhere' },
    null,
  ];
  assert.deepEqual(sortRegistrations(regs).map((r) => r.id), ['standby', 'tour', 'hologram', 'voice.controls', 'app', 'zzz', 'yyy', 'camera']);
  assert.deepEqual(sortRegistrations(null), []);
});

test('R3: at most 18 words, "Hey Jarvis" aside; carriers are exempt', () => {
  assert.equal(MAX_WORDS, 18);
  assert.equal(wordCount('Hey Jarvis, open optics'), 2);
  assert.equal(wordCount("Jarvis, what's the weather in Boston?"), 5);
  assert.equal(wordCount(''), 0);
  const long = 'find a 4K monitor under three hundred dollars with good reviews and add the cheapest one to the cart in Chrome';
  assert.ok(wordCount(long) > MAX_WORDS);
  assert.equal(overCap(long), true);
  assert.equal(overCap(long, true), false, 'a carrier (a Chrome task) keeps the owner’s long words');
  assert.equal(overCap('open settings'), false);
});

test('R4: a sentence that starts like a question', () => {
  for (const t of ["what's the best camera", 'How do I open a new window in Chrome?', 'Jarvis, is the camera on', 'can I open two windows', 'should I use George', 'which browser is fastest']) {
    assert.equal(isQuestion(t), true, t);
  }
  for (const t of ['open the camera', 'can you open the camera', 'new chat', 'Hey Jarvis, stop', 'take a picture']) assert.equal(isQuestion(t), false, t);
});

test('R7: another reading takes only a free, undoable, unchecked action, never the camera or the microphone', () => {
  assert.equal(alternativeOk(act('new-chat')), true);
  assert.equal(alternativeOk(act('open', { sheet: 'settings' })), true);
  assert.equal(alternativeOk(act('look', { free: false, camera: true })), false, 'a Look is paid');
  assert.equal(alternativeOk(act('optics-open', { camera: true })), false, '"topics" heard, "optics" another reading: never the camera');
  assert.equal(alternativeOk(act('mic-off', { mic: true })), false);
  assert.equal(alternativeOk(act('exit-voice', { mic: true, undo: false })), false);
  assert.equal(alternativeOk(act('search', { check: true })), false, 'a Google search carries words out: never from another reading');
  assert.equal(alternativeOk(act('task', { free: false, check: true })), false);
  assert.equal(alternativeOk(null), false);
  assert.equal(alternativeOk({ do: 'x' }), true, 'the defaults are free and undoable');
  assert.deepEqual(readingsToTry(['new jacket', 'new chat']), ['new jacket', 'new chat']);
  assert.deepEqual(readingsToTry(["what's the best camera", 'open the camera']), ["what's the best camera"], 'the best reading is a question: no alternatives');
  assert.deepEqual(readingsToTry(['', 'x']), ['x']);
  assert.deepEqual(readingsToTry('open settings'), ['open settings']);
  assert.deepEqual(readingsToTry([]), []);
});

test('the answer layer: bare "cancel" or "no", and "stop", which is never an answer', () => {
  for (const t of ['no', 'No.', 'cancel', 'Cancel that', 'no thanks', 'never mind', 'nevermind', 'Jarvis, cancel', 'nope']) assert.equal(isBareNo(t), true, t);
  for (const t of ['cancel Chrome', 'deny', 'no, I said Boston', 'cancel my meeting', 'stop', 'approve']) assert.equal(isBareNo(t), false, t);
  for (const t of ['stop', 'Stop!', 'okay stop', 'Jarvis, stop', 'stop it', 'stop stop']) assert.equal(isStopWord(t), true, t);
  for (const t of ['stop the tour', 'stop Chrome', 'stop talking', 'stop worrying', 'stop that']) assert.equal(isStopWord(t), false, t);
});

test('lastAsked: the newest of the Chrome prompt and the top owner question', () => {
  const tour = { id: 'tour-choice', askedAt: 1000 };
  const offer = { id: 'research', askedAt: 2000 };
  const prompt = { id: 'p1', askedAt: 3000 };
  assert.equal(lastAsked({ prompt, questions: [tour, offer] }), 'prompt');
  assert.equal(lastAsked({ prompt: { ...prompt, askedAt: 1500 }, questions: [tour, offer] }), offer, 'the research offer was asked after the prompt');
  assert.equal(lastAsked({ prompt: null, questions: [tour, offer] }), offer, 'the questions stack newest last');
  assert.equal(lastAsked({ prompt, questions: [] }), 'prompt');
  assert.equal(lastAsked({ prompt: { id: 'p' }, questions: [tour] }), tour, 'a prompt not said yet counts as oldest');
  assert.equal(lastAsked({}), null);
});
