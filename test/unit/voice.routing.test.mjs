// Voice Mode's routing on its fakes (v8.1.1, the second review's routing findings): words heard in Voice Mode, with
// the app's router built from today's matchers and the modules involved, as app.js registers them.
//   ROUTING-R2-1  D3 with Optics open here: the hologram's commands act in its window, Optics keeps its own words
//   ROUTING-R2-4  the emphatic no's answer the research offer (never a paid question)
//   ROUTING-R2-7  the laptop shown last and closed opens again only for a command about it
//   ROUTING-R2-10 the research offer answered in Optics' field (the router and the module's run)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceEnv } from './voice-mode.fakes.mjs';
import { createRouter, registerTodayCommands, emptyState } from '../../src/lib/command-router.js';
import { register as registerWindows } from '../../src/ui/commands/windows.js';
import { register as registerOptics } from '../../src/ui/commands/optics.js';
import { LAPTOP_PARTS } from './fixtures/voice-corpus-base.mjs';

const WIN = [{ id: 'h1', kind: 'hologram', label: 'Laptop', focused: false, parts: LAPTOP_PARTS, selected: null }];
const OPTICS = { open: true, mode: 'live', liveView: false, card: null, cameraAllowed: 'granted', sceneChanged: null };

/** Voice Mode hearing `words` once, with a hologram in its own window and Optics open here. */
async function heardWithWindow(t, words, optics = OPTICS) {
  const env = await voiceEnv(t);
  const sent = [];
  const opticsWords = [];
  const router = createRouter();
  registerTodayCommands(router);
  registerWindows(router, { screens: { commandIn: (kind, command) => (sent.push([kind, command && command.action]), { ok: true }) } });
  registerOptics(router, {});
  const state = (local) => ({ ...emptyState('voice'), optics, windows: WIN, ...(local || {}) });
  env.say((i) => (i === 0 ? words : null));
  env.open({
    settings: { listenSend: 'now' },
    answer: 'An answer.',
    extra: {
      router: { route: (r, local, o) => router.route(r, state(local), o), run: (hit, ctx) => router.run(hit, ctx) },
      visuals: { command: (w) => (opticsWords.push(w), { handled: true, command: { action: 'close', ack: '' } }), isOpen: () => false },
    },
  });
  await env.advance(8000);
  return { env, sent, opticsWords };
}

for (const [words, action] of [
  ['Explode it.', 'explode'],
  ['Show the battery.', 'select'],
  ['Rotate it.', 'rotate'],
  ['Isolate the fan.', 'isolate'],
]) {
  test(`ROUTING-R2-1: with Optics open here, "${words}" acts in the hologram's window (D3), never a paid question`, async (t) => {
    for (const optics of [OPTICS, { ...OPTICS, mode: 'frozen' }, { ...OPTICS, liveView: true }]) {
      const { env, sent } = await heardWithWindow(t, words, optics);
      assert.deepEqual(env.log.turns, [], `"${words}" went to Claude as a question (${optics.mode}, live view ${optics.liveView})`);
      assert.deepEqual(sent, [['hologram', action]], `"${words}" acted in the window (${optics.mode})`);
    }
  });
}

test('ROUTING-R2-1: with Optics open here, Optics keeps its own words ("close it", "expand it"): not the window', async (t) => {
  for (const words of ['Close it.', 'Expand it.', 'Show me the camera.']) {
    const { env, sent, opticsWords } = await heardWithWindow(t, words);
    assert.deepEqual(sent, [], `"${words}" didn't act in the hologram's window`);
    assert.deepEqual(opticsWords, [words], `"${words}" went to Optics`);
    assert.deepEqual(env.log.turns, []);
  }
});

// ---- ROUTING-R2-4: the emphatic no's, said to the research offer (the reviewer's probe, kept) -----------------------

const RESEARCH_CHOICES = [
  { id: 'quick', label: 'Quick · about 10¢', words: ['quick', 'quick answer'], dear: false },
  { id: 'mission', label: 'Mission · about $1.70', words: ['mission', 'a mission', 'research mission'], dear: true },
  { id: 'homebase', label: 'Home base · up to $1.25', words: ['home base'], dear: true },
  { id: 'cancel', label: 'Cancel', words: ['cancel', 'no', 'never mind'], dear: false },
];

/** The research offer asked as app.js asks it, then `words` heard once. */
async function offerHears(t, words) {
  const env = await voiceEnv(t);
  const { register: registerVoiceCommands } = await import('../../src/ui/commands/voice.js');
  const { matchOfferChoice } = await import('../../src/lib/research-offer.js');
  const picked = [];
  const router = createRouter();
  registerTodayCommands(router);
  registerVoiceCommands(router, { stopTarget: () => {} });
  registerOptics(router, { answerResearch: (choice) => (picked.push(['dear', choice]), { say: '' }) });
  const vm = env.open({
    settings: { listenSend: 'now' },
    answer: 'An answer.',
    extra: { router: { route: (readings, local, opts) => router.route(readings, { ...emptyState('voice'), ...(local || {}) }, opts), run: (hit, ctx) => router.run(hit, ctx) } },
  });
  await env.advance(100);
  let heard = 0;
  env.say(() => (heard++ === 0 ? words : null));
  vm.question({
    id: 'research-offer',
    say: 'Research this? A quick answer, about 10 cents. A research mission, about $1.70.',
    choices: RESEARCH_CHOICES,
    match: (w) => matchOfferChoice(w, RESEARCH_CHOICES.filter((c) => !c.dear)),
    onAnswer: (choice) => picked.push(['answer', choice]),
    onExpire: (reason) => picked.push(['expire', reason]),
  });
  await env.advance(15000);
  return { env, picked };
}

for (const words of ['No.', 'No thanks.', 'No, no, no.', 'No, cancel that.', 'Jarvis, no, cancel that.', 'No wait.', 'Nope, nope.', 'No no, never mind.']) {
  test(`ROUTING-R2-4: "${words}" to the research offer answers it (a no), never a paid question`, async (t) => {
    const { env, picked } = await offerHears(t, words);
    assert.deepEqual(env.log.turns, [], `"${words}" went to Claude as a question (offer: ${JSON.stringify(picked)})`);
    assert.ok(picked.some(([k, v]) => (k === 'answer' && v === 'cancel') || (k === 'expire' && v === 'dismissed')), `the offer was answered no: ${JSON.stringify(picked)}`);
  });
}

// ---- ROUTING-R2-7: the laptop shown last over Voice Mode, closed (the router alone) -------------------------------

test('ROUTING-R2-7: with a laptop shown last and closed, E2\'s camera words open Optics and questions reach Jarvis; commands still reopen it', () => {
  const router = createRouter();
  registerTodayCommands(router);
  registerOptics(router, {});
  const closedLaptop = {
    ...emptyState('voice'),
    voiceOpen: true,
    camera: { supported: true, allowed: 'granted', ios: false },
    reply: { links: [], hologram: { title: 'Laptop', parts: [{ id: 'display', name: 'Display panel', aka: ['screen'] }, { id: 'webcam', name: 'Camera module', aka: ['webcam', 'camera'] }, { id: 'battery', name: 'Battery', aka: [] }] } },
  };
  const pick = (words) => {
    const hit = router.route([words], closedLaptop);
    return hit ? `${hit.id}:${hit.action.do}` : 'claude';
  };
  for (const words of ['Open the camera.', 'Camera on.', 'Show me the camera.', 'Turn the camera on.']) assert.equal(pick(words), 'optics-open:optics-open', words);
  for (const words of ['Is the camera on?', 'Is my camera on?', 'What does the battery do?', 'Show my screen.']) assert.equal(pick(words), 'claude', words);
  for (const words of ['Expand it.', 'Show the battery.', 'Rotate it.']) assert.equal(pick(words), 'hologram:hologram', words);
});

// ---- ROUTING-R2-10: the research offer answered in Optics' field ---------------------------------------------------

test('ROUTING-R2-10: in Optics\' field the research offer is answered (typed: any way; said: the cheap ones, a dear one asks for the tap)', async () => {
  const picked = [];
  const router = createRouter();
  registerTodayCommands(router);
  registerOptics(router, { answerResearch: (choice) => (picked.push(choice), { say: choice === 'cancel' ? 'Okay, no research.' : '' }) });
  const offer = { choices: RESEARCH_CHOICES };
  const field = (via, extra = {}) => ({ ...emptyState('optics'), via, optics: OPTICS, researchOffer: offer, ...extra });
  const said = async (words, st) => {
    const hit = router.route([words], st);
    if (!hit) return { id: null };
    const out = await router.run(hit, { surface: 'optics' });
    return { id: hit.id, do: hit.action.do, say: out && out.say };
  };
  assert.deepEqual(await said('mission', field('typed')), { id: 'optics-research-field', do: 'research-answer', say: '' });
  assert.deepEqual(await said('Quick.', field('typed')), { id: 'optics-research-field', do: 'research-answer', say: '' });
  assert.deepEqual(await said('cancel', field('voice')), { id: 'optics-research-field', do: 'research-answer', say: 'Okay, no research.' });
  assert.deepEqual(picked, ['mission', 'quick', 'cancel']);
  // A dear way said to Optics' microphone (no 2-second check there): the card's tap, nothing started.
  assert.deepEqual(await said('Mission.', field('voice')), { id: 'optics-research-field', do: 'research-tap', say: 'Tap Mission on the card to start it.' });
  assert.deepEqual(await said('home base', field('voice')), { id: 'optics-research-field', do: 'research-tap', say: 'Tap Home base on the card to start it.' });
  assert.deepEqual(picked, ['mission', 'quick', 'cancel']);
  // No card up: the words are the Look's question, as before.
  assert.equal((await said('mission', field('typed', { researchOffer: null }))).id, null);
});
