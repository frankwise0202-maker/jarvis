// v8.1 (SPEC §28.1, A1): listening with Jarvis's window in the background on a computer. Chrome's
// recognizer session ends by itself now and then (a pause, the network, its own limit); stt.js starts it
// again at once. While the page is hidden it used to give up instead (made for iOS, which stops it
// anyway): a hidden Voice Mode then heard nothing (the u-mac probe of stt.js). With `background: true`
// (Voice Mode on a computer, Settings → Voice → Wake Jarvis → "Keep talking when Jarvis is in the
// background") it restarts as when visible. Plain Node, the fake recognizer of stt.fakes.mjs, a virtual clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock } from './platform.voice.fakeengine.test.mjs';
import { installRecognition, freshStt, chrome } from './stt.fakes.mjs';

function listen(stt, options = {}) {
  const log = [];
  const handle = stt.startListening({
    onPartial: (t) => log.push(`partial:${t}`),
    onFinal: (t) => log.push(`final:${t}`),
    onError: (e) => log.push(`error:${e.code}`),
    onEnd: () => log.push('end'),
    ...options,
  });
  return { handle, log };
}

async function setup(t, { hidden = false } = {}) {
  const clock = installClock();
  const rec = installRecognition();
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const doc = { hidden, visibilityState: hidden ? 'hidden' : 'visible' };
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  const stt = await freshStt();
  t.after(() => {
    if (saved) Object.defineProperty(globalThis, 'document', saved);
    else delete globalThis.document;
    rec.uninstall();
    clock.restore();
  });
  return { clock, rec, stt, doc };
}

/** Each recognizer session hears nothing and ends by itself 4 s after it started (as Chrome's may), for `ms`. */
function sessionsEndingEvery4s(clock, rec, ms) {
  const end = clock.now + ms;
  while (clock.now < end) {
    const r = rec.current;
    const at = r && !r.ended ? r.startedAt + 4000 : clock.now + 50;
    clock.advance(Math.max(1, Math.min(at, end) - clock.now));
    if (r && !r.ended && clock.now >= r.startedAt + 4000) r.end();
  }
}

test('hidden, with background: a session that ends by itself is started again, as on screen (3 sessions in 9 s), and nothing is reported', async (t) => {
  const { clock, rec, stt } = await setup(t, { hidden: true });
  const { log } = listen(stt, { background: true });
  sessionsEndingEvery4s(clock, rec, 9000);
  assert.equal(rec.starts, 3, 'started again twice');
  assert.deepEqual(log, [], 'no error, no end');
});

test('hidden, without background: as before, it gives up at the first end (1 session, then no-speech and the end)', async (t) => {
  const { clock, rec, stt } = await setup(t, { hidden: true });
  const { log } = listen(stt);
  sessionsEndingEvery4s(clock, rec, 9000);
  assert.equal(rec.starts, 1);
  assert.deepEqual(log, ['error:no-speech', 'end']);
});

test('on screen: the same 3 sessions in 9 s with or without background', async (t) => {
  for (const background of [false, true]) {
    const { clock, rec, stt } = await setup(t, { hidden: false });
    const { log } = listen(stt, { background });
    sessionsEndingEvery4s(clock, rec, 9000);
    assert.equal(rec.starts, 3, `background ${background}`);
    assert.deepEqual(log, []);
  }
});

test('hidden, with background: the question said in a restarted session is heard and delivered once', async (t) => {
  const { clock, rec, stt } = await setup(t, { hidden: true });
  const { log } = listen(stt, { background: true });
  sessionsEndingEvery4s(clock, rec, 5000); // the first session ended by itself; the second one runs
  assert.equal(rec.starts, 2);
  const speak = chrome(rec);
  speak.say('what time is it');
  clock.advance(300);
  speak.finalize();
  clock.advance(2500); // the silence window ends the turn
  assert.ok(log.includes('final:what time is it'), JSON.stringify(log));
  assert.equal(log.filter((x) => x.startsWith('final:')).length, 1);
  assert.equal(log.at(-1), 'end');
});

test('hidden, with background: words heard before the session ended by itself are kept, and the turn ends with them', async (t) => {
  const { clock, rec, stt } = await setup(t, { hidden: true });
  const { log } = listen(stt, { background: true });
  const speak = chrome(rec);
  clock.advance(500);
  speak.say('set a timer');
  clock.advance(200);
  rec.current.end(); // the session ended mid-sentence: listening goes on in a new one
  clock.advance(50);
  assert.equal(rec.starts, 2, 'started again while hidden');
  speak.say('for ten minutes');
  clock.advance(300);
  speak.finalize();
  clock.advance(2500);
  assert.ok(log.includes('final:set a timer for ten minutes'), JSON.stringify(log));
});

test('hidden, with background: nothing heard at all still ends after the no-speech time (10 s), as on screen', async (t) => {
  const { clock, rec, stt } = await setup(t, { hidden: true });
  const { log } = listen(stt, { background: true });
  sessionsEndingEvery4s(clock, rec, 11000);
  assert.deepEqual(log, ['error:no-speech', 'end']);
});
