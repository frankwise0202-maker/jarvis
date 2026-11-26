// v8.1 (SPEC §28.5, A9): one Jarvis per Mac answers. Standby takes the 'jarvis-standby' Web Lock before it
// listens; another window waits behind it ("Standby is on in another Jarvis window") and "Use this window"
// takes it (src/platform/standby-lock.js). A fake LockManager with the Web Locks rules: one holder, a FIFO
// line, ifAvailable, an AbortSignal that withdraws a waiting request, and steal (the holder's request then
// fails with AbortError).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStandbyLock, STANDBY_LOCK, VOICE_LOCK, holdVoiceLock, voiceOpenSomewhere } from '../../src/platform/standby-lock.js';
import { createFakeLocks } from './standby.fakes.mjs';

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

function windowOn(locks, who) {
  const seen = [];
  const lock = createStandbyLock({ locks: locks.as(who), onChange: (s) => seen.push(s) });
  return { lock, seen };
}

test('the lock’s name', () => {
  assert.equal(STANDBY_LOCK, 'jarvis-standby');
});

test('one window: it holds the lock while on Standby, and lets go when it leaves', async () => {
  const locks = createFakeLocks();
  const a = windowOn(locks, 'A');
  a.lock.acquire();
  await settle();
  assert.equal(a.lock.state, 'held');
  assert.equal(locks.holder(STANDBY_LOCK), 'A');
  a.lock.acquire(); // again: nothing changes
  await settle();
  assert.deepEqual(a.seen, ['asking', 'held']);
  a.lock.release();
  await settle();
  assert.equal(a.lock.state, 'off');
  assert.equal(locks.holder(STANDBY_LOCK), null, 'free again');
});

// PRIVACY-7: leaving Standby turns the microphone off. The window waiting behind used to take over (and start
// listening) whenever the holder let go; now only when the holder's window closes. When the owner leaves Standby,
// the windows waiting behind are told 'left' (they leave Standby too) and never hold the lock to listen.
test('two windows: the second waits ("elsewhere"); when the first leaves Standby, the second is told to leave too and never listens', async () => {
  const locks = createFakeLocks();
  const a = windowOn(locks, 'A');
  const b = windowOn(locks, 'B');
  a.lock.acquire();
  await settle();
  b.lock.acquire();
  await settle();
  assert.equal(a.lock.state, 'held');
  assert.equal(b.lock.state, 'elsewhere');
  assert.deepEqual(locks.waiting(STANDBY_LOCK), ['B']);
  a.lock.release();
  await settle();
  assert.equal(b.lock.state, 'left', 'B is told: the owner left Standby');
  assert.deepEqual(b.seen, ['asking', 'elsewhere', 'left'], 'never held to listen');
  assert.equal(locks.holder(STANDBY_LOCK), null, 'nobody holds it');
});

test('two windows: when the first window closes (its locks go with it), the second takes over by itself', async () => {
  const locks = createFakeLocks();
  const a = windowOn(locks, 'A');
  const b = windowOn(locks, 'B');
  a.lock.acquire();
  await settle();
  b.lock.acquire();
  await settle();
  locks.close('A');
  await settle();
  assert.equal(b.lock.state, 'held');
  assert.equal(locks.holder(STANDBY_LOCK), 'B');
  assert.deepEqual(b.seen, ['asking', 'elsewhere', 'held']);
});

test('"Use this window": B takes it from A at once; A steps back and waits; when the owner leaves Standby in B, A leaves too', async () => {
  const locks = createFakeLocks();
  const a = windowOn(locks, 'A');
  const b = windowOn(locks, 'B');
  a.lock.acquire();
  await settle();
  b.lock.acquire();
  await settle();
  assert.equal(b.lock.take(), true);
  await settle();
  assert.equal(b.lock.state, 'held');
  assert.equal(locks.holder(STANDBY_LOCK), 'B');
  assert.equal(a.lock.state, 'elsewhere', 'A is told and steps back');
  assert.deepEqual(locks.waiting(STANDBY_LOCK), ['A'], 'A waits in line');
  assert.deepEqual(a.seen, ['asking', 'held', 'elsewhere']);
  b.lock.release();
  await settle();
  assert.equal(a.lock.state, 'left', 'B left Standby: A leaves too (PRIVACY-7)');
  assert.equal(a.lock.take(), false, 'nothing to take: A isn’t waiting any more');
  assert.equal(locks.holder(STANDBY_LOCK), null);
});

test('"Use this window", then B’s window closes: A has it again by itself', async () => {
  const locks = createFakeLocks();
  const a = windowOn(locks, 'A');
  const b = windowOn(locks, 'B');
  a.lock.acquire();
  await settle();
  b.lock.acquire();
  await settle();
  b.lock.take();
  await settle();
  locks.close('B');
  await settle();
  assert.equal(a.lock.state, 'held');
  assert.equal(a.lock.take(), false, 'nothing to take when holding it');
});

test('three windows: "Use this window" gives it to that window, ahead of one already waiting; closes then hand it on in order', async () => {
  const locks = createFakeLocks();
  const [a, b, c] = ['A', 'B', 'C'].map((w) => windowOn(locks, w));
  for (const w of [a, b, c]) {
    w.lock.acquire();
    await settle();
  }
  assert.deepEqual(locks.waiting(STANDBY_LOCK), ['B', 'C']);
  c.lock.take();
  await settle();
  assert.equal(locks.holder(STANDBY_LOCK), 'C');
  assert.deepEqual([a.lock.state, b.lock.state, c.lock.state], ['elsewhere', 'elsewhere', 'held']);
  assert.deepEqual(locks.waiting(STANDBY_LOCK), ['B', 'A']);
  locks.close('C'); // the one listening closes: the next in line takes over
  await settle();
  assert.equal(locks.holder(STANDBY_LOCK), 'B');
  assert.equal(b.lock.state, 'held');
  b.lock.release(); // the owner leaves Standby in B: A, still waiting, leaves too
  await settle();
  assert.equal(a.lock.state, 'left');
  assert.equal(locks.holder(STANDBY_LOCK), null);
});

test('three windows: the owner leaves Standby in the one listening: both windows waiting behind leave too', async () => {
  const locks = createFakeLocks();
  const [a, b, c] = ['A', 'B', 'C'].map((w) => windowOn(locks, w));
  for (const w of [a, b, c]) {
    w.lock.acquire();
    await settle();
  }
  a.lock.release();
  await settle();
  assert.deepEqual([a.lock.state, b.lock.state, c.lock.state], ['off', 'left', 'left']);
  assert.ok(!b.seen.includes('held') && !c.seen.includes('held'), 'neither ever listened');
  assert.equal(locks.holder(STANDBY_LOCK), null);
});

test('after a leave, Standby opened again listens at once, and a later close hands over as usual (the old leave no longer counts)', async () => {
  const locks = createFakeLocks();
  const a = windowOn(locks, 'A');
  const b = windowOn(locks, 'B');
  a.lock.acquire();
  await settle();
  a.lock.release(); // left on purpose, nobody waiting
  await settle();
  b.lock.acquire(); // the owner opens Standby in B
  await settle();
  assert.equal(b.lock.state, 'held');
  a.lock.acquire(); // and in A again: it waits behind B
  await settle();
  assert.equal(a.lock.state, 'elsewhere');
  locks.close('B'); // B's window closes (within the moment the leave is remembered)
  await settle();
  assert.equal(a.lock.state, 'held', 'A takes over by itself');
});

test('a waiting window that leaves Standby withdraws from the line', async () => {
  const locks = createFakeLocks();
  const a = windowOn(locks, 'A');
  const b = windowOn(locks, 'B');
  a.lock.acquire();
  await settle();
  b.lock.acquire();
  await settle();
  b.lock.release();
  await settle();
  assert.equal(b.lock.state, 'off');
  assert.deepEqual(locks.waiting(STANDBY_LOCK), []);
  a.lock.release();
  await settle();
  assert.equal(locks.holder(STANDBY_LOCK), null, 'B never takes it after leaving');
  assert.equal(b.lock.state, 'off');
});

test('no Web Locks (an old browser): "unsupported" at once, and Standby listens as before', async () => {
  const seen = [];
  const lock = createStandbyLock({ locks: null, onChange: (s) => seen.push(s) });
  assert.equal(lock.state, 'unsupported');
  assert.equal(lock.acquire(), 'unsupported');
  lock.release();
  assert.equal(lock.state, 'unsupported');
  assert.equal(lock.take(), false);
  const throwing = createStandbyLock({
    locks: {
      request() {
        throw new Error('SecurityError');
      },
    },
  });
  throwing.acquire();
  assert.equal(throwing.state, 'unsupported', 'a request that throws (an opaque origin): as before');
});

// MAC-6: an open Voice Mode, in any window, holds the voice lock (shared: one per window); Standby asks before it
// wakes, and stays asleep while the owner talks to Voice Mode elsewhere.
test('MAC-6: Voice Mode open holds the voice lock; voiceOpenSomewhere() says so from any window, until every one is closed', async () => {
  const locks = createFakeLocks();
  const ask = () => voiceOpenSomewhere({ locks: locks.as('A') });
  assert.equal(VOICE_LOCK, 'jarvis-voice');
  assert.equal(await ask(), false, 'no Voice Mode open');
  const closeB = holdVoiceLock({ locks: locks.as('B') });
  await settle();
  assert.equal(await ask(), true, 'open in B');
  const closeC = holdVoiceLock({ locks: locks.as('C') });
  await settle();
  assert.deepEqual(locks.holders(VOICE_LOCK).sort(), ['B', 'C'], 'two windows at once (shared)');
  closeB();
  await settle();
  assert.equal(await ask(), true, 'still open in C');
  closeC();
  closeC(); // twice: nothing more
  await settle();
  assert.equal(await ask(), false, 'all closed');
  holdVoiceLock({ locks: locks.as('D') });
  await settle();
  locks.close('D'); // the window goes away with Voice Mode open
  await settle();
  assert.equal(await ask(), false, 'a closed window takes its lock with it');
  const quick = holdVoiceLock({ locks: locks.as('E') });
  quick(); // closed before the lock was granted
  await settle();
  assert.equal(await ask(), false, 'let go at once');
});

test('MAC-6: without Web Locks the voice lock does nothing and nobody is busy (as before)', async () => {
  const close = holdVoiceLock({ locks: null });
  close();
  assert.equal(await voiceOpenSomewhere({ locks: null }), false);
  const throwing = { request() { throw new Error('SecurityError'); } };
  holdVoiceLock({ locks: throwing })();
  assert.equal(await voiceOpenSomewhere({ locks: throwing }), false);
});
