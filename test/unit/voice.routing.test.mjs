// Voice Mode's routing on its fakes (v8.1.1, the second review's routing findings): words heard in Voice Mode, with
// the app's router built from today's matchers and the modules involved, as app.js registers them.
//   ROUTING-R2-1  D3 with Optics open here: the hologram's commands act in its window, Optics keeps its own words

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
