// The one router's order and rules (src/lib/command-order.js, v8.1 C1): the layers and their ids in
// order, every surface's passes, the word cap (R3), questions (R4, R7) and which open question a bare
// "cancel" or "no" answers. Plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS, ORDER, ORDER_STEPS, FINAL_ORDER, MAX_WORDS, isQuestion, isBareNo, isStopWord, askedLast } from '../../src/lib/command-order.js';

test('the layers of contract (b), in the order (1)-(8), each with its ids', () => {
  assert.deepEqual([...LAYERS], ['standby', 'answer', 'stop', 'destination', 'top', 'app', 'media', 'camera']);
  assert.deepEqual(Object.keys(ORDER), [...LAYERS]);
  const ids = LAYERS.flatMap((l) => ORDER[l]);
  assert.equal(new Set(ids).size, ids.length, 'each id has one place');
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/, `${id}: a router id`);
  assert.deepEqual(ORDER_STEPS.map((s) => s.step), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(ORDER_STEPS[0].layer, 'wake');
  assert.equal(ORDER_STEPS[9].layer, 'claude');
  assert.equal(MAX_WORDS, 18);
});

test('within a layer: the declared order (D1: a Chrome task before a page in Chrome)', () => {
  assert.deepEqual([...ORDER.answer], ['prompt', 'question', 'reply-building'], "the Chrome prompt's words, then the newest owner question");
  // Optics' picture card before Screens: "put the picture to the side" with a Look on screen is its card's.
  assert.deepEqual([...ORDER.destination], ['chrome-task', 'chrome-open', 'windows', 'optics-card', 'screens', 'screen-look']);
  assert.deepEqual([...ORDER.top], ['tour', 'tour-start', 'blueprint', 'hologram', 'optics'], 'a tour, then a hologram or blueprint, then Optics');
  assert.deepEqual([...ORDER.app], ['voice-controls', 'app', 'optics-open', 'liveview', 'research']);
  assert.deepEqual([...ORDER.media], ['music', 'homebase', 'brain']);
});

test('FINAL_ORDER: one table for every surface (R1); Standby, then the answers (best reading only), then the rest', () => {
  for (const surface of ['voice', 'chat', 'hologram', 'optics']) assert.equal(FINAL_ORDER[surface], FINAL_ORDER.voice);
  const [standby, answers, main, musicAgain] = FINAL_ORDER.voice;
  assert.deepEqual(standby.use, ['standby', '@standby']);
  assert.deepEqual(answers.use, ['prompt', 'question', 'reply-building', '@answer']);
  assert.equal(answers.readings, 'best', 'an answer is never taken from another reading');
  // The main pass: stop, destination, top (the tour's own first, then the rest of the layer, then the viewers), app, media, camera.
  const at = (id) => main.use.indexOf(id);
  for (const [a, b] of [['stop', 'chrome-task'], ['chrome-task', 'chrome-open'], ['screen-look', 'tour'], ['tour-start', '@top'], ['@top', 'blueprint'], ['optics', 'voice-controls'], ['@app', 'music'], ['@media', 'camera']]) {
    assert.ok(at(a) >= 0 && at(a) < at(b), `${a} before ${b}`);
  }
  assert.deepEqual(main.best, ['music'], 'Apple Music the best reading first');
  assert.equal(main.anyReading, undefined, 'R7 for every matcher: no exemptions');
  assert.deepEqual(musicAgain, { use: ['music'], readings: 'alternatives', when: 'bestNamesNoPart' });
  assert.ok(Object.isFrozen(FINAL_ORDER) && Object.isFrozen(FINAL_ORDER.voice[2].use));
});

test('R4 (and R7): a sentence that starts like a question', () => {
  for (const t of ["what's the best camera", 'How do I open a new window in Chrome?', 'Jarvis, is the camera on', 'can I open two windows', 'should I use George', 'which browser is fastest', 'Hey Jarvis, what is this']) {
    assert.equal(isQuestion(t), true, t);
  }
  for (const t of ['open the camera', 'can you open the camera', 'new chat', 'Hey Jarvis, stop', 'take a picture', 'new jacket']) assert.equal(isQuestion(t), false, t);
});

test('the answer layer: bare "cancel" or "no", and "stop", which is never an answer', () => {
  for (const t of ['no', 'No.', 'cancel', 'Cancel that', 'no thanks', 'never mind', 'nevermind', 'Jarvis, cancel', 'nope', "don't", 'no, thank you']) assert.equal(isBareNo(t), true, t);
  for (const t of ['cancel Chrome', 'deny', 'no, I said Boston', 'cancel my meeting', 'stop', 'approve', 'continue']) assert.equal(isBareNo(t), false, t);
  for (const t of ['stop', 'Stop!', 'okay stop', 'Jarvis, stop', 'stop it', 'stop stop', 'stop please']) assert.equal(isStopWord(t), true, t);
  for (const t of ['stop the tour', 'stop Chrome', 'stop talking', 'stop worrying', 'stop that']) assert.equal(isStopWord(t), false, t);
});

test('askedLast: the newest of the Chrome prompt and the top owner question (questions newest first)', () => {
  const tour = { id: 'tour-choice', askedAt: 1 };
  const offer = { id: 'research', askedAt: 2 };
  const prompt = { id: 'p1', askedAt: 3 };
  assert.equal(askedLast({ prompt, questions: [offer, tour] }), 'prompt');
  assert.equal(askedLast({ prompt: { ...prompt, askedAt: 1.5 }, questions: [offer, tour] }), 'question', 'the research offer was asked after the prompt');
  assert.equal(askedLast({ prompt: null, questions: [offer, tour] }), 'question');
  assert.equal(askedLast({ prompt, questions: [] }), 'prompt');
  assert.equal(askedLast({ prompt: { id: 'p' }, questions: [tour] }), 'question', 'a prompt never said counts as the oldest');
  assert.equal(askedLast({ prompt: { id: 'p', askedAt: 1 }, questions: [tour] }), 'prompt', 'a tie goes to the prompt');
  assert.equal(askedLast({}), null);
  assert.equal(askedLast(null), null);
});

test('ROUTING-R2-4: the emphatic no\'s are bare no\'s too; a no that says more is not', () => {
  for (const t of ['no no no', 'No, no, no.', 'no, cancel that', 'Jarvis, no, cancel that.', 'no wait', 'Nope, nope.', 'no no, never mind', 'no, forget it', 'no not now', 'nah nah', 'no no thanks', 'no, cancel it please']) {
    assert.equal(isBareNo(t), true, t);
  }
  for (const t of ['no, I said Boston', 'no way that is true', 'no problem', 'no no I meant the other one', 'nope not that one', 'no stop', 'no cancel Chrome']) assert.equal(isBareNo(t), false, t);
});
