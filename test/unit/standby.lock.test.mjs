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

test('two windows: the second waits ("elsewhere"), and takes over by itself when the first leaves Standby', async () => {
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
  assert.equal(b.lock.state, 'held');
  assert.equal(locks.holder(STANDBY_LOCK), 'B');
  assert.deepEqual(b.seen, ['asking', 'elsewhere', 'held']);
});

test('"Use this window": B takes it from A at once; A steps back and waits; when B leaves, A has it again', async () => {
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
  assert.equal(a.lock.state, 'held');
  assert.equal(a.lock.take(), false, 'nothing to take when holding it');
});

test('three windows: "Use this window" gives it to that window, ahead of one already waiting; the line then goes in order', async () => {
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
  c.lock.release();
  await settle();
  assert.equal(locks.holder(STANDBY_LOCK), 'B');
  b.lock.release();
  await settle();
  assert.equal(locks.holder(STANDBY_LOCK), 'A');
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
