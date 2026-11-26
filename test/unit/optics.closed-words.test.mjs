// v8.1 fix MONEY-7: with Optics closed, the live view's and Watch's off words and the picture's own words
// ("stop video mode", "video mode off", "stop live view", "stop watching", "expand the picture", "back to
// live", "close the picture") have nothing to act on. They get a free line on every surface (Voice Mode
// and the chat), never a question to Claude. With Optics open they stay Optics' own (as before).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, emptyState, registerTodayCommands } from '../../src/lib/command-router.js';
import { register as registerOpticsCommands } from '../../src/ui/commands/optics.js';
import { matchOpticsClosedWords, opticsClosedLine } from '../../src/lib/optics-commands.js';

const WORDS = ['stop video mode', 'video mode off', 'stop live view', 'stop watching', 'expand the picture', 'back to live', 'close the picture'];

function router() {
  const r = createRouter();
  registerTodayCommands(r);
  registerOpticsCommands(r, {});
  return r;
}

test('MONEY-7: with Optics closed, the off words and the picture words are a free line on the voice and chat surfaces', () => {
  const r = router();
  for (const surface of ['voice', 'chat']) {
    for (const words of WORDS) {
      const hit = r.route([words], { ...emptyState(surface), surface });
      assert.equal(hit && hit.id, 'optics-idle', `"${words}" on ${surface}: ${hit ? hit.id : 'Claude (a paid question)'}`);
      const out = r.run(hit, { surface, reading: words });
      assert.match(out.say, /^(?:The live view is off\.|Watch is off\.|There’s no picture on screen\.)$/, words);
      assert.equal(hit.action.free !== false && !hit.action.camera, true, 'free, and no camera');
    }
  }
  assert.equal(opticsClosedLine(matchOpticsClosedWords('stop video mode').kind), 'The live view is off.');
  assert.equal(opticsClosedLine(matchOpticsClosedWords('stop watching').kind), 'Watch is off.');
  assert.equal(opticsClosedLine(matchOpticsClosedWords('close the picture').kind), 'There’s no picture on screen.');
});

test('MONEY-7: not taken: "that\'s enough" (Voice Mode\'s hush), "expand it", ordinary sentences, and anything with Optics open', () => {
  for (const words of ["that's enough", 'expand it', 'put the picture to the side', 'stop watching the news', 'what is a live view', 'close the picture frame shop']) {
    assert.equal(matchOpticsClosedWords(words), null, words);
  }
  const r = router();
  const open = { ...emptyState('voice'), surface: 'voice', optics: { open: true, mode: 'live', liveView: true, card: null, cameraAllowed: 'granted', sceneChanged: null } };
  for (const words of WORDS) {
    const hit = r.route([words], open);
    assert.notEqual(hit && hit.id, 'optics-idle', `"${words}" with Optics open is Optics' own`);
  }
});

// v8.1.1 fix MONEY-R2-4: the live view's and Watch's off words are never about a hologram, a blueprint or
// a window. With one on screen, or with Optics open under a hologram (which stops the live view and Watch),
// they get the free line too: in Voice Mode, the chat and the hologram's own field. The picture's words
// still could be about what is on screen, so they are left to it (or to the question).
const HOLO = { open: true, inWindow: false, parts: [{ id: 'battery', name: 'Battery' }], selected: null, title: 'Charger' };
const COVERED = { open: true, mode: 'live', liveView: false, watch: false, card: null, cameraAllowed: 'granted', sceneChanged: null };

test('MONEY-R2-4: the off words with a hologram or a blueprint on screen, or a hologram over Optics: the free line; the picture words stay theirs', () => {
  const r = router();
  const states = {
    'a hologram (Voice Mode)': { ...emptyState('voice'), surface: 'voice', hologram: HOLO },
    "a hologram (typed in its field)": { ...emptyState('hologram'), surface: 'hologram', via: 'typed', hologram: HOLO },
    'a hologram (the chat)': { ...emptyState('chat'), surface: 'chat', via: 'typed', hologram: HOLO },
    'a blueprint (Voice Mode)': { ...emptyState('voice'), surface: 'voice', blueprintOpen: true },
    'a hologram over Optics (Voice Mode)': { ...emptyState('voice'), surface: 'voice', hologram: HOLO, optics: COVERED },
    'a hologram over Optics (its field)': { ...emptyState('hologram'), surface: 'hologram', via: 'typed', hologram: HOLO, optics: COVERED },
  };
  for (const [name, st] of Object.entries(states)) {
    for (const words of ['stop video mode', 'video mode off', 'stop live view', 'stop watching']) {
      const hit = r.route([words], st);
      assert.equal(hit && hit.id, 'optics-idle', `"${words}" with ${name}: ${hit ? hit.id : 'Claude (a paid question)'}`);
      assert.match(r.run(hit, { surface: st.surface, reading: words }).say, /^(?:The live view is off\.|Watch is off\.)$/, words);
    }
    for (const words of ['expand the picture', 'back to live', 'close the picture']) {
      const hit = r.route([words], st);
      assert.notEqual(hit && hit.id, 'optics-idle', `"${words}" with ${name} may be about it`);
    }
  }
  // Still running in this window (never so under a hologram, but if it were): never "it's off".
  const running = { ...emptyState('voice'), surface: 'voice', hologram: HOLO, optics: { ...COVERED, liveView: true, watch: true } };
  for (const words of ['stop live view', 'stop watching']) {
    const hit = r.route([words], running);
    assert.notEqual(hit && hit.id, 'optics-idle', `"${words}" with it running`);
  }
});
