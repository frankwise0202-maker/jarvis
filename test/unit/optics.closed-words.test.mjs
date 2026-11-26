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
