// Screens × Optics (v7.1): a camera screen window turns the camera on by itself only when the main
// window has just opened it for the owner (src/ui/screens/screen-page.js armCameraGo / takeCameraGo):
// a fresh navigation with an opener and this screen's one-time nonce, under 30 s old. A reload, a
// window Chrome restores after a relaunch or a crash, or a load from history waits for a tap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_GO_KEY, CAMERA_GO_MS, armCameraGo, takeCameraGo } from '../../src/ui/screens/screen-page.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k),
  };
}

const OPENER = {};

test('the window the main window just opened for the owner may start the camera, once', () => {
  const storage = memoryStorage();
  const now = 1_700_000_000_000;
  const nonce = armCameraGo('s1abc', { storage, now });
  assert.match(nonce, /^[a-z0-9]{24}$/);
  assert.deepEqual(JSON.parse(storage.getItem(CAMERA_GO_KEY)), { s: 's1abc', n: nonce, at: now });
  const fresh = { screenId: 's1abc', hash: `#go=${nonce}`, opener: OPENER, navigationType: 'navigate', storage, now: now + 800 };
  assert.equal(takeCameraGo(fresh), true);
  assert.equal(storage.has(CAMERA_GO_KEY), false, 'the nonce is used up');
  assert.equal(takeCameraGo(fresh), false, 'a second load of the same URL (the hash kept) does not count');
  assert.notEqual(armCameraGo('s1abc', { storage, now }), nonce, 'a new nonce each time');
});

test('a reload, a restored window, history, another screen, a stale or a missing nonce: the camera waits for a tap', () => {
  const now = 1_700_000_000_000;
  const cases = [
    ['reload', { navigationType: 'reload' }],
    ['restored after a relaunch or a crash', { navigationType: 'back_forward', opener: null }],
    ['opened from history or a bookmark (no opener)', { opener: null }],
    ['no hash', { hash: '' }],
    ['another nonce', { hash: '#go=aaaaaaaaaaaaaaaaaaaaaaaa' }],
    ['another screen', { screenId: 's9xyz' }],
    ['30 s later', { now: now + CAMERA_GO_MS }],
    ['a clock gone back', { now: now - 1000 }],
    ['unknown navigation type', { navigationType: '' }],
  ];
  for (const [label, change] of cases) {
    const storage = memoryStorage();
    const nonce = armCameraGo('s1abc', { storage, now });
    const opts = { screenId: 's1abc', hash: `#go=${nonce}`, opener: OPENER, navigationType: 'navigate', storage, now: now + 500, ...change };
    assert.equal(takeCameraGo(opts), false, label);
    assert.equal(storage.has(CAMERA_GO_KEY), false, `${label}: the stored nonce is removed anyway`);
  }
  // Nothing stored at all (a direct load of ?screen=camera), or storage that throws.
  assert.equal(takeCameraGo({ screenId: 's1abc', hash: '#go=abcdefghijkl', opener: OPENER, navigationType: 'navigate', storage: memoryStorage() }), false);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(armCameraGo('s1abc', { storage: broken }), '', 'no storage: no nonce (the window then shows Turn on camera)');
  assert.equal(takeCameraGo({ screenId: 's1abc', hash: '#go=abcdefghijkl', opener: OPENER, navigationType: 'navigate', storage: broken }), false);
  assert.equal(takeCameraGo({ screenId: 's1abc', hash: '#go=abcdefghijkl', opener: OPENER, navigationType: 'navigate', storage: { getItem: () => '{not json', removeItem() {} } }), false);
});
