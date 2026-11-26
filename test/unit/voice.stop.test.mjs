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
