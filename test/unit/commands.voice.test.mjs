// voice's registration module (src/ui/commands/voice.js, v8.1 C2): the stop layer's "stop", Voice
// Mode's controls and the app's commands, registered in the router with their run(); what each does
// with the app's deps and the one line it says. Plain Node, fake deps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, registerTodayCommands, emptyState } from '../../src/lib/command-router.js';
import { register } from '../../src/ui/commands/voice.js';

function setup(over = {}) {
  const calls = [];
  let settings = { voiceRate: 1, voiceContinuous: true, listenSend: 'show' };
  const voiceApi = { setContinuous: (on) => calls.push(['setContinuous', on]) };
  const deps = {
    getSettings: () => settings,
    saveSettings: (patch) => {
      settings = { ...settings, ...patch };
      calls.push(['save', patch]);
      return settings;
    },
    toast: () => {},
    voice: () => voiceApi,
    newChat: () => calls.push(['newChat']),
    openSheet: (sheet, opts) => (calls.push(['openSheet', sheet, opts.section, opts.surface]), sheet === 'homebase' ? { linked: false } : {}),
    useVoice: async (which) => (calls.push(['useVoice', which]), { ok: true, device: 'Mac' }),
    spend: () => ({ todayUsd: 0.42, monthUsd: 3.2, liveUsd: 0 }),
    stopTarget: (target) => calls.push(['stop', target]),
    ...over,
  };
  const router = createRouter();
  registerTodayCommands(router);
  register(router, deps);
  const run = async (words, state = {}) => {
    const st = { ...emptyState(state.surface || 'voice'), standby: { available: true, open: false }, ...state };
    const hit = router.route([words], st);
    if (!hit) return { hit: null };
    const out = await router.run(hit, { surface: st.surface });
    return { hit, out };
  };
  return { router, run, calls, settings: () => settings };
}

test('three matchers: stop (layer stop), voice-controls (Voice Mode only, carried out by Voice Mode), app', () => {
  const { router } = setup();
  const byId = Object.fromEntries(router.entries().map((e) => [e.id, e]));
  assert.equal(byId.stop.layer, 'stop');
  assert.equal(byId['voice-controls'].layer, 'app');
  assert.deepEqual([...byId['voice-controls'].surfaces], ['voice']);
  assert.equal(byId['voice-controls'].run, null, 'Voice Mode acts on its own controls');
  assert.equal(byId.app.layer, 'app');
  assert.deepEqual([...byId.app.surfaces], ['voice', 'chat', 'hologram', 'optics']);
});

test('"stop": each running thing is stopped through the deps, then one line', async () => {
  const { run, calls } = setup();
  const running = { id: 't', status: 'running' };
  const { hit, out } = await run('stop', { tour: { active: true }, chrome: { linked: true, online: true, task: running, contextUntil: 0 } });
  assert.equal(hit.id, 'stop');
  assert.deepEqual(calls, [['stop', 'tour'], ['stop', 'chrome']]);
  assert.deepEqual(out, { say: 'The tour is paused and Chrome is stopping.' });
  const idle = await run('Jarvis, stop', { surface: 'chat' });
  assert.deepEqual(idle.out, { say: 'Okay.' });
});

test('REGRESS-2: "stop" with a turn running stops it (and Watch) through the deps, on every surface, and says so', async () => {
  for (const surface of ['chat', 'voice', 'hologram', 'optics']) {
    const { run, calls } = setup();
    const { hit, out } = await run('stop', { surface, via: surface === 'voice' ? 'voice' : 'typed', running: true });
    assert.equal(hit.id, 'stop', surface);
    assert.deepEqual(calls, [['stop', 'answer']], surface);
    assert.deepEqual(out, { say: 'The answer is stopped.' }, surface);
  }
  const { run, calls } = setup();
  const optics = { open: true, mode: 'live', liveView: false, watch: true, card: null, cameraAllowed: 'granted', sceneChanged: null };
  const { out } = await run('stop', { surface: 'optics', via: 'typed', optics });
  assert.deepEqual(calls, [['stop', 'watch']]);
  assert.deepEqual(out, { say: 'Watch is off.' });
});

test('ROUTING-6: "stop" with only a blueprint sheet open is a free "Okay.", never a question for Claude', async () => {
  for (const surface of ['voice', 'chat']) {
    const { run, calls } = setup();
    const { hit, out } = await run('stop', { surface, via: surface === 'voice' ? 'voice' : 'typed', blueprintOpen: true });
    assert.equal(hit && hit.id, 'stop', surface);
    assert.deepEqual(calls, [], surface);
    assert.deepEqual(out, { say: 'Okay.' }, surface);
  }
});

test('the app commands: what they do and say', async () => {
  const { run, calls, settings } = setup();
  assert.deepEqual((await run('new chat')).out, { say: 'New chat.' });
  assert.deepEqual(calls.at(-1), ['newChat']);
  assert.deepEqual((await run('open the voice settings', { surface: 'chat' })).out, { say: 'Voice settings are open.' });
  assert.deepEqual(calls.at(-1), ['openSheet', 'settings', 'voice', 'chat']);
  assert.deepEqual((await run('open the home base')).out, { say: "The home base isn't linked yet. Here's how to set it up." });
  assert.deepEqual((await run('speak slower')).out, { say: 'Slower.' });
  assert.equal(settings().voiceRate, 0.9);
  assert.deepEqual((await run('turn off continuous')).out, { say: 'Continuous conversation off. Tap me when you need me.' });
  assert.equal(settings().voiceContinuous, false);
  assert.deepEqual(calls.at(-1), ['setContinuous', false], 'Voice Mode\'s switch follows');
  assert.deepEqual((await run('send right away')).out, { say: "I'll send what I hear right away." });
  assert.equal(settings().listenSend, 'now');
  assert.deepEqual((await run("use the Mac's voice")).out, { say: "This is the Mac's own voice." });
  assert.deepEqual(calls.at(-1), ['useVoice', 'device']);
  assert.deepEqual((await run('how much have I spent today')).out, { say: 'About 42 cents today.' });
  assert.deepEqual((await run('how much have I spent')).out, { say: 'About 42 cents today, about $3.20 this month.' });
});

test('at the slowest speed: nothing saved, and Jarvis says so', async () => {
  const { run, calls } = setup({ getSettings: () => ({ voiceRate: 0.7 }) });
  assert.deepEqual((await run('slow down')).out, { say: "That's as slow as I go." });
  assert.ok(!calls.some((c) => c[0] === 'save'));
});

test('a sheet from Voice Mode: the deps give `leave`, which Voice Mode calls after the line', async () => {
  let left = 0;
  const { run } = setup({ openSheet: () => ({ leave: () => (left += 1) }) });
  const { out } = await run('open settings');
  assert.equal(out.say, 'Settings are open.');
  assert.equal(typeof out.leave, 'function');
  out.leave();
  assert.equal(left, 1);
});

test('Voice Mode\'s controls are matched only in Voice Mode', async () => {
  const { router } = setup();
  const voice = router.route(['stop listening'], { ...emptyState('voice') });
  assert.deepEqual([voice.id, voice.action.do, voice.action.mic], ['voice-controls', 'mic-off', true]);
  assert.equal(router.route(['stop listening'], { ...emptyState('chat') }), null);
  assert.equal(router.route(['exit voice mode', 'x'], { ...emptyState('voice') }).id, 'voice-controls');
  assert.equal(router.route(['exit voice mod', 'exit voice mode'], { ...emptyState('voice') }), null, 'never from another reading (mic)');
});
