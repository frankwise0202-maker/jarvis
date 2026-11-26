// v8.1.1: where the fix branches meet (the integrator's checks). Each fix has its own tests; these hold the pairs
// together: fix-mac's voice lock and hidden count with fix-cvoice's barge-in listen (the owner's), and fix-cvoice's
// Chrome words with fix-routing's in the app's router (every command module registered).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceEnv } from './voice-mode.fakes.mjs';
import { createRouter, registerTodayCommands, emptyState } from '../../src/lib/command-router.js';

/** Advance the virtual clock 50 ms at a time until `cond()` holds (at most `maxMs`). */
async function until(env, cond, what = 'the condition', maxMs = 180000) {
  const end = env.clock.now() + maxMs;
  while (!cond()) {
    if (env.clock.now() > end) throw new Error(`timed out waiting for ${what}`);
    await env.advance(50);
  }
}

const BRAKE = 'Say “Hey Jarvis” when you need me.';

// fix-cvoice (CHROME-VOICE-R2-1) opens the barge-in's listen as the owner's ({ owner: true }); fix-mac (MAC-R2-1, MAC-R2-3)
// holds the voice lock while Voice Mode can hear the owner and keeps the hidden count across claps-woken sessions.
// Two claps over the wake greeting (George's own line, no turn): the lock stays held from the greeting through that
// listen, the listen's question counts like any other, the count is never started again, and the brake comes at the
// third question across sessions, as MAC-R2-3 counts them.
test('mac + cvoice: two claps over the greeting open the owner\'s listen with the voice lock held; its question counts, the count goes on across claps-woken sessions and the brake comes at the third', async (t) => {
  const env = await voiceEnv(t, { speechMs: 6000 });
  env.voice('natural');
  env.setHidden(true);
  let carried = { asked: 1, braked: false };
  const hiddenCount = { get: () => carried, set: (c) => (carried = c) };
  // The wake window hears nobody; every listen after it hears the TV's question.
  let wakeListen = -1;
  env.say((n) => (n === wakeListen ? null : 'what is the capital of Spain'));
  const greeting = () => env.log.spoken.find((g) => /briefing/.test(g.text) && !g.cancelled && !g.done);

  // Session 1 (count 1 carried): the claps' barge-in listens; the TV's question is the second; its answer's follow-up
  // hears the TV again: the third; then the brake and Standby. The count carried is 3, braked.
  let vm = null;
  {
    const seen = [];
    wakeListen = env.log.listens.length;
    vm = env.open({ wake: env.wakeHooks({ trigger: 'clap' }), listenWhileHidden: () => true, answer: 'Madrid.', extra: { hiddenCount, onActive: (on, o = {}) => seen.push(o.now ? `${on}:now` : on) } });
    await until(env, () => !!greeting(), 'session 1: the greeting');
    await env.advance(1000);
    assert.equal(seen.at(-1), true, 'session 1: active while George says the greeting');
    const from = seen.length;
    const listens = env.log.listens.length;
    assert.equal(vm.bargeIn('clap'), true, 'session 1: two claps stop the greeting (count 1 of 3)');
    await env.advance(200);
    assert.equal(env.log.listens.length, listens + 1, 'session 1: the barge-in listens');
    assert.equal(vm.state, 'listening');
    assert.ok(!seen.slice(from).some((x) => x === false || x === 'false:now'), `session 1: the voice lock held from the greeting into the owner's listen (${JSON.stringify(seen)})`);
    await until(env, () => env.log.closes.length >= 1, 'session 1 to end', 120000);
    assert.equal(env.log.turns.length, 2, `session 1: the barge-in's question and one follow-up (${JSON.stringify(env.log.turns)})`);
    assert.ok(env.log.spoken.some((s) => s.text === BRAKE), 'session 1: the brake at the third question of the count');
    assert.deepEqual(carried, { asked: 3, braked: true }, 'session 1: the count carried on, braked');
  }

  // Session 2 (claps again, braked): two claps over the greeting are the weak signal at the limit: no listen, no
  // question; the session ends with the brake line.
  {
    wakeListen = env.log.listens.length;
    vm = env.open({ wake: env.wakeHooks({ trigger: 'clap' }), listenWhileHidden: () => true, answer: 'Madrid.', extra: { hiddenCount } });
    await until(env, () => !!greeting(), 'session 2: the greeting');
    await env.advance(1000);
    assert.equal(vm.bargeIn('clap'), false, 'session 2: braked: the claps open no listen');
    await until(env, () => env.log.closes.length >= 2, 'session 2 to end', 120000);
    assert.equal(env.log.turns.length, 2, 'session 2: no paid question');
    assert.ok(carried.braked && carried.asked >= 3, `session 2: still braked (${JSON.stringify(carried)})`);
  }

  // Session 3 ("Hey Jarvis"): the owner calls him: the count starts again, and a "Hey Jarvis" barge-in over the
  // greeting opens the owner's listen, whose question is taken.
  {
    wakeListen = env.log.listens.length;
    vm = env.open({ wake: env.wakeHooks({ trigger: 'word' }), listenWhileHidden: () => true, answer: 'Madrid.', extra: { hiddenCount } });
    await until(env, () => !!greeting(), 'session 3: the greeting');
    await env.advance(1000);
    assert.equal(vm.bargeIn('word'), true, 'session 3: "Hey Jarvis" stops the greeting');
    await until(env, () => env.log.turns.length >= 3, 'session 3: the question after "Hey Jarvis"', 60000);
  }
});

// ---- fix-cvoice's Chrome words with fix-routing's (ROUTING-R2-6, MISSED-R2V-2, MISSED-R2V-1, ROUTING-R2-9) -----------

async function appRouter() {
  const { DEFAULT_SETTINGS } = await import('../../src/platform/settings.js');
  const router = createRouter();
  registerTodayCommands(router);
  const deps = new Proxy(
    { getSettings: () => DEFAULT_SETTINGS, saveSettings: () => DEFAULT_SETTINGS, toast: () => {}, voice: () => null, routerState: (surface, local) => ({ ...emptyState(surface), ...(local || {}) }), phone: false, demo: false },
    { get: (o, k) => (k in o ? o[k] : () => null) },
  );
  for (const m of ['mac', 'audio', 'tours', 'voice', 'chrome-voice', 'windows', 'optics', 'chrome']) (await import(`../../src/ui/commands/${m}.js`)).register(router, deps);
  return router;
}

const VOICE = { surface: 'voice', voiceOpen: true, standby: { available: true, open: false } };
const TYPED = { surface: 'chat', via: 'typed', standby: { available: true, open: false } };
const LINKED = { linked: true, online: true, task: null, contextUntil: 0 };
const CONTEXT = { ...LINKED, contextUntil: Number.MAX_SAFE_INTEGER };
const RUNNING = { ...LINKED, task: { id: 't1', status: 'running', text: 'find a 4K monitor' } };

test('cvoice + routing: "Google Docs won\'t open in Chrome" reaches Jarvis; "google tv shows like Breaking Bad in Chrome" searches; "cancel my Netflix subscription in Chrome" is a task (spoken or typed, linked, in Chrome\'s context, with a task running)', async () => {
  const router = await appRouter();
  const states = {
    voice: VOICE,
    typed: TYPED,
    'voice, linked': { ...VOICE, chrome: LINKED },
    'voice, in context': { ...VOICE, chrome: CONTEXT },
    'voice, a task running': { ...VOICE, chrome: RUNNING },
    'typed, in context': { ...TYPED, chrome: CONTEXT },
    'typed, a task running': { ...TYPED, chrome: RUNNING },
  };
  for (const [name, st] of Object.entries(states)) {
    const pick = (words) => {
      const hit = router.route([words], { ...emptyState(st.surface), ...st });
      return hit ? hit.id : null;
    };
    assert.equal(pick("Google Docs won't open in Chrome"), null, `${name}: a statement about Google Docs is Jarvis's (no task, no search)`);
    assert.equal(pick('google tv shows like Breaking Bad in Chrome'), 'chrome-open', `${name}: a search`);
    assert.equal(pick('cancel my Netflix subscription in Chrome'), 'chrome-task', `${name}: a task`);
  }
});

test('cvoice + routing: a walkthrough with a Chrome task running: "pause it" pauses the tour, "say that again" repeats its step, "stop Chrome" stops the task (playing or waiting at a step, in Voice Mode and in the hologram\'s field)', async () => {
  const router = await appRouter();
  const hologram = { open: true, inWindow: false, parts: [{ id: 'battery', name: 'Battery', aka: [] }], selected: null, title: '14-inch laptop' };
  const playing = { active: true, atChoice: false, choices: [], defaultId: null, stepId: 'apart', status: 'playing', paused: false, waits: false, justSaid: false };
  const waiting = { ...playing, status: 'waiting', waits: true };
  const paused = { ...playing, status: 'paused', paused: true };
  for (const [name, tour] of [['playing', playing], ['waiting', waiting], ['paused', paused]]) {
    for (const [where, base] of [['Voice Mode', VOICE], ["the hologram's field", { surface: 'hologram', via: 'typed' }]]) {
      for (const chrome of [RUNNING, { ...RUNNING, contextUntil: Number.MAX_SAFE_INTEGER }]) {
        const st = { ...emptyState(base.surface), ...base, hologram, tour, chrome };
        const route = (words) => router.route([words], st);
        const label = `${name}, ${where}${chrome.contextUntil ? ', in Chrome\'s context' : ''}`;
        const pause = route('pause it');
        if (name === 'paused') assert.notEqual(pause && pause.id, 'chrome-stop', `${label}: "pause it" never stops the task`);
        else assert.deepEqual(pause && [pause.id, pause.action && pause.action.do], ['tour', 'tour-pause'], `${label}: "pause it" pauses the tour`);
        const again = route('say that again');
        assert.deepEqual(again && [again.id, again.action && again.action.do], ['tour', 'tour-repeat'], `${label}: "say that again" is the tour's repeat`);
        const stop = route('stop Chrome');
        assert.equal(stop && stop.id, 'chrome-stop', `${label}: "stop Chrome" stops the task`);
      }
    }
  }
});
