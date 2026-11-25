// The kiosk's own behaviour belongs to the Alienware's screen only (app/kiosk.js: screenFeatures,
// createKiosk; app/assistant.js: startsQuestion). A remote viewer (the iPhone or the Mac through
// Tailscale, https://<machine>.<tailnet>.ts.net/) never dims at night, never shifts, never hides
// its cursor, never reloads itself and never pulls typed keys into the question box.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { startsQuestion } from '../app/assistant.js';
import { createKiosk, isKioskHost, readSettings, screenFeatures } from '../app/kiosk.js';

const KIOSK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1', 'LOCALHOST', 'localhost.'];
const REMOTE_HOSTS = [
  'alienware.tail4e5f6a.ts.net',
  'alienware.tail4e5f6a.ts.net.',
  '100.101.102.103', // the machine's Tailscale address
  '192.168.1.42',
  'alienware',
  'localhost.evil.example',
  '127.0.0.1.nip.io',
  '',
  undefined,
  null,
];

test('only the Alienware itself (localhost, 127.0.0.1, [::1]) is the kiosk screen', () => {
  for (const h of KIOSK_HOSTS) assert.equal(isKioskHost(h), true, String(h));
  for (const h of REMOTE_HOSTS) assert.equal(isKioskHost(h), false, String(h));
});

test('every kiosk behaviour is on for the kiosk and off for a remote viewer', () => {
  const FLAGS = ['nightDim', 'pixelShift', 'hideCursor', 'dailyRefresh', 'reloadOnUpdate', 'typeAnywhere'];
  for (const h of KIOSK_HOSTS) {
    const f = screenFeatures(h);
    assert.equal(f.kiosk, true);
    assert.equal(f.view, 'kiosk');
    for (const k of FLAGS) assert.equal(f[k], true, `${k} on ${h}`);
  }
  for (const h of REMOTE_HOSTS) {
    const f = screenFeatures(h);
    assert.equal(f.kiosk, false);
    assert.equal(f.view, 'remote');
    for (const k of FLAGS) assert.equal(f[k], false, `${k} on ${h}`);
  }
  assert.ok(Object.isFrozen(screenFeatures('localhost')));
});

/** A stand-in for <html>, the stage and window: records what the kiosk controller does to them. */
function fakePage() {
  const listeners = [];
  const classes = new Set();
  globalThis.window = {
    addEventListener: (type) => listeners.push(type),
    removeEventListener: (type) => listeners.splice(listeners.indexOf(type), 1),
  };
  const style = () => ({
    props: {},
    setProperty(k, v) {
      this.props[k] = v;
    },
  });
  const root = { dataset: {}, style: style(), classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } };
  const stage = { style: style() };
  return { root, stage, listeners, classes };
}

const START = Date.parse('2026-11-25T02:50:00Z');
const NIGHT = Date.parse('2026-11-25T23:31:00Z');

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START }));
afterEach(() => {
  mock.timers.reset();
  delete globalThis.window;
});

function run(kiosk) {
  const page = fakePage();
  const refreshes = [];
  const night = [];
  const k = createKiosk({
    root: page.root,
    stage: page.stage,
    veil: null,
    settings: readSettings(new URLSearchParams('')),
    timeZone: 'UTC',
    isCoreLive: () => true,
    onRefresh: () => refreshes.push(Date.now()),
    onNightChange: (on) => night.push(on),
    kiosk,
  });
  // Three seconds without the mouse: a kiosk hides its cursor.
  mock.timers.tick(3500);
  const cursorHidden = page.classes.has('cursor-hidden');
  // Night (23:31, the Core's clock) and the pixel shift's next step.
  k.tick(NIGHT);
  const dimmed = page.root.dataset.night;
  const shift = page.stage.style.props['--shift-x'];
  // 04:00 the next morning on the wall clock, the page open for over an hour, the Core answering.
  mock.timers.setTime(Date.parse('2026-11-25T04:00:20Z'));
  k.tick(Date.now());
  return { listeners: [...page.listeners], cursorHidden, dimmed, shift, refreshes, night, isNight: k.isNight(), k };
}

test('the kiosk screen dims at night, shifts, hides the cursor and refreshes at 04:00', () => {
  const r = run(true);
  assert.deepEqual(r.listeners.sort(), ['keydown', 'mousemove', 'pointerdown']);
  assert.equal(r.cursorHidden, true);
  assert.equal(r.dimmed, 'on');
  assert.deepEqual(r.night, [true]);
  assert.notEqual(r.shift, undefined);
  assert.equal(r.refreshes.length, 1);
});

test('a remote viewer never dims, shifts, hides its cursor or refreshes itself', () => {
  const r = run(false);
  assert.deepEqual(r.listeners, [], 'no mouse or key listeners at all');
  assert.equal(r.cursorHidden, false);
  assert.equal(r.dimmed, 'off', 'not dimmed at 23:31');
  assert.equal(r.isNight, false);
  assert.deepEqual(r.night, [false]);
  assert.equal(r.shift, undefined, 'the stage never moves');
  assert.deepEqual(r.refreshes, [], 'no daily reload');
  r.k.wake(); // touching the screen at night changes nothing either
  r.k.tick(NIGHT + 60000);
  assert.equal(r.isNight, false);
  r.k.destroy();
});

test('typing anywhere starts a question on the kiosk screen only', () => {
  const body = { closest: () => null };
  const field = { closest: (sel) => (sel.includes('input') ? field : null) };
  const key = (k, extra = {}) => ({ key: k, target: body, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });
  assert.equal(startsQuestion(key('h'), true), true);
  assert.equal(startsQuestion(key('?'), true), true);
  assert.equal(startsQuestion(key('h'), false), false, 'a remote viewer: keys stay where they are typed');
  assert.equal(startsQuestion(key('?'), false), false);
  for (const k of ['Enter', 'Escape', 'Tab', 'ArrowDown', 'Shift']) assert.equal(startsQuestion(key(k), true), false, k);
  assert.equal(startsQuestion(key('j', { altKey: true }), true), false, 'Alt+J opens Jarvis');
  assert.equal(startsQuestion(key('c', { ctrlKey: true }), true), false);
  assert.equal(startsQuestion(key('f', { metaKey: true }), true), false);
  assert.equal(startsQuestion(key('h', { defaultPrevented: true }), true), false);
  assert.equal(startsQuestion(key('h', { target: field }), true), false, 'typing in a field stays in that field');
});
