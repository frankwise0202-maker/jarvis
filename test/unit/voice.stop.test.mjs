// A bare "stop" heard in Voice Mode (v8.1, SPEC §30 (3); REGRESS-2): it stops what runs, the turn of the
// chat included (an answer whose details are still being written, a research mission, a Look's answer),
// and says what stopped. Never "Okay." while a paid run goes on. Voice Mode itself on the tiny DOM and
// virtual clock of voice-mode.fakes.mjs, with the app's router (today's matchers and voice's module).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceEnv } from './voice-mode.fakes.mjs';
import { createRouter, registerTodayCommands, emptyState } from '../../src/lib/command-router.js';
import { register as registerVoiceCommands } from '../../src/ui/commands/voice.js';

/** The app's router as app.js builds it (the parts "stop" needs), with the app's state of the moment. */
function appRouter(app) {
  const router = createRouter();
  registerTodayCommands(router);
  registerVoiceCommands(router, { stopTarget: (target) => app.stopped.push(target) });
  return {
    route: (readings, local, opts) => router.route(readings, { ...emptyState('voice'), running: app.running, ...(local || {}) }, opts),
    run: (hit, ctx) => router.run(hit, ctx),
  };
}

async function until(env, cond, what, maxMs = 20000) {
  const end = env.clock.now() + maxMs;
  while (!cond()) {
    if (env.clock.now() > end) throw new Error(`timed out waiting for ${what}`);
    await env.advance(50);
  }
}

test('REGRESS-2: "stop" in Voice Mode while a turn of the chat runs stops it and says so (not "Okay.")', async (t) => {
  const env = await voiceEnv(t);
  const app = { running: true, stopped: [] };
  env.say((i) => (i === 0 ? 'stop' : null));
  env.open({ extra: { router: appRouter(app) } });
  await until(env, () => env.log.spoken.length > 0, 'a line');
  assert.deepEqual(app.stopped, ['answer'], 'the running turn is stopped (as its Stop button does)');
  assert.equal(env.log.spoken[0].text, 'The answer is stopped.');
  assert.equal(env.log.turns.length, 0, 'nothing goes to Claude');
});

test('REGRESS-2: with nothing running, "stop" in Voice Mode is still a free "Okay."', async (t) => {
  const env = await voiceEnv(t);
  const app = { running: false, stopped: [] };
  env.say((i) => (i === 0 ? 'okay stop' : null));
  env.open({ extra: { router: appRouter(app) } });
  await until(env, () => env.log.spoken.length > 0, 'a line');
  assert.deepEqual(app.stopped, []);
  assert.equal(env.log.spoken[0].text, 'Okay.');
  assert.equal(env.log.turns.length, 0);
});

// ---- ROUTING-12: the research offer's dear answer, corrected during its 2-second check --------------------

const RESEARCH_CHOICES = [
  { id: 'quick', label: 'Quick · about 10¢', words: ['quick', 'quick answer'], dear: false },
  { id: 'mission', label: 'Mission · about $1.70', words: ['mission', 'a mission', 'research mission'], dear: true },
  { id: 'homebase', label: 'Home base · up to $1.25', words: ['home base'], dear: true },
  { id: 'cancel', label: 'Cancel', words: ['cancel', 'no', 'never mind'], dear: false },
];

/** Voice Mode with the app's router (today's matchers and optics' module), the offer asked as app.js asks it. */
async function offerSetup(t) {
  const env = await voiceEnv(t);
  const { register: registerOpticsCommands } = await import('../../src/ui/commands/optics.js');
  const { matchOfferChoice } = await import('../../src/lib/research-offer.js');
  const picked = [];
  const router = createRouter();
  registerTodayCommands(router);
  registerOpticsCommands(router, { answerResearch: (choice) => (picked.push(['dear', choice]), { say: '' }) });
  const vm = env.open({
    settings: { listenSend: 'show' }, // the 2-second check, its microphone open
    answer: 'A quick answer.',
    extra: {
      router: {
        route: (readings, local, opts) => router.route(readings, { ...emptyState('voice'), ...(local || {}) }, opts),
        run: (hit, ctx) => router.run(hit, ctx),
      },
    },
  });
  await env.advance(100);
  let heard = 0;
  env.say(() => (heard++ === 0 ? 'mission' : null));
  vm.question({
    id: 'research-offer',
    say: 'Research this? A quick answer, about 10 cents. A research mission, about $1.70.',
    choices: RESEARCH_CHOICES,
    match: (words) => matchOfferChoice(words, RESEARCH_CHOICES.filter((c) => !c.dear)),
    onAnswer: (choice) => picked.push(['answer', choice]),
    onExpire: (reason) => picked.push(['expire', reason]),
  });
  return { env, vm, picked };
}

test('ROUTING-12: "mission" for the research offer, corrected to "quick" during its check, answers the offer (no paid question)', async (t) => {
  const { env, picked } = await offerSetup(t);
  // "mission" heard: the dear answer waits in the 2-second check, the recognizer that heard it still open.
  await until(env, () => env.status() === 'Sending…', 'the check');
  assert.deepEqual(picked.filter(([k]) => k !== 'expire'), [], 'nothing chosen yet');
  env.log.listens.at(-1).onFinal('no, I said quick', { alternatives: [] });
  await env.advance(6000);
  assert.deepEqual(env.log.turns, [], 'nothing went to Claude as a question');
  assert.deepEqual(picked.filter(([k]) => k !== 'expire'), [['answer', 'quick']], `the offer was answered: ${JSON.stringify(picked)}`);
});

test('ROUTING-12: "mission" for the research offer, left unchanged in its check, is the dear answer once (the offer is not dropped first)', async (t) => {
  const { env, picked } = await offerSetup(t);
  await until(env, () => env.status() === 'Sending…', 'the check');
  assert.deepEqual(picked, [], 'the offer is still open while its answer is checked');
  await env.advance(6000);
  assert.deepEqual(env.log.turns, [], 'nothing went to Claude as a question');
  assert.deepEqual(picked.filter(([k]) => k !== 'expire'), [['dear', 'mission']], JSON.stringify(picked));
});
