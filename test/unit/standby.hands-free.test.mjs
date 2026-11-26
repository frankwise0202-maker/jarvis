// v8.1 Standby on a Mac (src/ui/standby.js, SPEC §28.4, §28.5): one Jarvis per Mac answers (A9: the Web
// Lock, "Standby is on in another Jarvis window", Use this window), and barge-in keeps Standby's microphone
// and "Hey Jarvis" on through a woken session (A8) so two claps or the wake word can stop him while he
// speaks. Node, with a tiny DOM, fake captures, and the fake LockManager of standby.fakes.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeLocks } from './standby.fakes.mjs';
import { createStandbyLock, holdVoiceLock, voiceOpenSomewhere } from '../../src/platform/standby-lock.js';

// ---- a tiny DOM (enough for standby.js and dom.js) -------------------------------------------------------

function installDom() {
  class Node {
    constructor() {
      this.childNodes = [];
      this.parentNode = null;
      this._l = {};
    }
    appendChild(c) {
      if (c.parentNode) c.parentNode.removeChild(c);
      this.childNodes.push(c);
      c.parentNode = this;
      return c;
    }
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
      c.parentNode = null;
      return c;
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get children() {
      return this.childNodes.filter((n) => n instanceof Element);
    }
    addEventListener(t, fn) {
      (this._l[t] ||= new Set()).add(fn);
    }
    removeEventListener(t, fn) {
      if (this._l[t]) this._l[t].delete(fn);
    }
    dispatch(t, ev = {}) {
      const e = { type: t, target: this, defaultPrevented: false, preventDefault() {
        this.defaultPrevented = true;
      }, stopPropagation() {
        this.stopped = true;
      }, ...ev };
      for (let n = this; n && !e.stopped; n = n.parentNode) for (const fn of Array.from(n._l[t] || [])) fn(e);
      return e;
    }
    get isConnected() {
      for (let n = this; n; n = n.parentNode) if (n === globalThis.document) return true;
      return false;
    }
    get textContent() {
      return this._text ?? this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this.childNodes = [];
      this._text = String(v);
    }
  }
  class Text extends Node {
    constructor(t) {
      super();
      this._text = t;
    }
  }
  class Element extends Node {
    constructor(tag) {
      super();
      this.tagName = String(tag).toUpperCase();
      this.attributes = {};
      this.dataset = {};
      this.hidden = false;
      this.inert = false;
      this.style = {};
      const cls = new Set();
      this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, on) => ((on ?? !cls.has(c)) ? cls.add(c) : cls.delete(c)) };
    }
    appendChild(c) {
      this._text = undefined;
      return super.appendChild(c);
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    }
    getAttribute(k) {
      return this.attributes[k] ?? null;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    focus() {
      globalThis.document.activeElement = this;
    }
    click() {
      return this.dispatch('click');
    }
    find(testid) {
      if (this.attributes['data-testid'] === testid) return this;
      for (const c of this.childNodes) {
        if (c instanceof Element) {
          const f = c.find(testid);
          if (f) return f;
        }
      }
      return null;
    }
  }
  const saved = {};
  for (const k of ['Node', 'Element', 'document', 'window']) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  const doc = new Node();
  doc.hidden = false;
  doc.createElement = (t) => new Element(t);
  doc.createElementNS = (_ns, t) => new Element(t);
  doc.createTextNode = (t) => new Text(t);
  doc.documentElement = new Element('html');
  doc.body = new Element('body');
  doc.appendChild(doc.documentElement);
  doc.documentElement.appendChild(doc.body);
  doc.activeElement = doc.body;
  const win = new Node();
  win.innerWidth = 1440;
  win.innerHeight = 900;
  for (const [k, v] of Object.entries({ Node, Element, document: doc, window: win })) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  return {
    doc,
    restore() {
      for (const [k, d] of Object.entries(saved)) {
        if (d) Object.defineProperty(globalThis, k, d);
        else delete globalThis[k];
      }
    },
  };
}

// ---- fakes ---------------------------------------------------------------------------------------------

/** A Standby capture: start() opens "the microphone" (live), stop() releases it. */
function fakeCapture(log, who) {
  return ({ onClap }) => {
    const cap = {
      live: false,
      starts: 0,
      stops: 0,
      context: { state: 'running' },
      prepare() {},
      async start() {
        cap.starts += 1;
        cap.live = true;
        log.push(`${who}:start`);
        return { ok: true };
      },
      stop() {
        if (cap.live) {
          cap.stops += 1;
          log.push(`${who}:stop`);
        }
        cap.live = false;
      },
      close() {
        cap.stop();
      },
      configure() {},
      wordPort: () => null,
      clap: () => onClap(),
    };
    log.caps[who] = cap;
    return cap;
  };
}

const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
};

let loads = 0;

async function setup(t) {
  const dom = installDom();
  const made = [];
  t.after(() => {
    for (const sb of made) sb.exit({ silent: true }); // their clocks and timers end with them
    dom.restore();
  });
  const { createStandby } = await import(`../../src/ui/standby.js?hf=${++loads}`);
  const locks = createFakeLocks();
  const log = [];
  log.caps = {};
  const make = (who, { bargeIn = null, lock = true, settings = { wakeClap: true, wakeWord: false }, createWakeWord = null, needsClick, unlock, ...more } = {}) => {
    const woken = [];
    const sb = createStandby({
      getSettings: () => settings,
      createCapture: fakeCapture(log, who),
      createWakeWord,
      needsClick,
      unlock,
      onWake: (w) => woken.push(w.trigger),
      onExit: more.onExit,
      createLock: lock ? (onChange) => createStandbyLock({ locks: locks.as(who), onChange }) : null,
      bargeIn,
      ...more, // voiceElsewhere, pauseWhenHidden, …
    });
    made.push(sb);
    return { sb, woken, cap: () => log.caps[who] };
  };
  const shown = () => {
    // the Standby root on screen now (the last one mounted)
    const roots = dom.doc.body.childNodes.filter((n) => n.attributes && n.attributes['data-testid'] === 'standby' && !n.hidden);
    return roots;
  };
  return { make, log, locks, dom, shown };
}

const pill = (root) => root.find('standby-pill').textContent;
const hint = (root) => root.find('standby-hint').textContent;

test('two windows on Standby: only the one holding the lock listens; the other says so and offers Use this window', async (t) => {
  const { make, shown } = await setup(t);
  const a = make('A');
  a.sb.enter();
  await settle();
  assert.equal(a.sb.listening, 'live');
  assert.equal(a.cap().live, true);
  const b = make('B');
  b.sb.enter();
  await settle();
  assert.equal(b.sb.listening, 'elsewhere');
  assert.equal(b.cap().starts, 0, 'B never opened the microphone');
  const rootB = shown().at(-1);
  assert.equal(pill(rootB), 'NOT LISTENING IN THIS WINDOW');
  assert.equal(hint(rootB), 'Standby is on in another Jarvis window.');
  const use = rootB.find('standby-use-here');
  assert.equal(use.hidden, false, 'Use this window is offered');
  assert.equal(rootB.dataset.listening, 'elsewhere');
});

test('Use this window: Standby moves to B (B listens, A stops and says so); when the owner leaves Standby in B, A leaves too and no microphone opens (PRIVACY-7)', async (t) => {
  const { make, shown } = await setup(t);
  const a = make('A');
  a.sb.enter();
  await settle();
  const b = make('B');
  b.sb.enter();
  await settle();
  const rootA = shown()[0];
  const rootB = shown().at(-1);
  const e = rootB.find('standby-use-here').click();
  assert.ok(e.stopped, 'the click is not the tap that leaves Standby');
  await settle();
  assert.equal(b.sb.listening, 'live');
  assert.equal(b.cap().live, true);
  assert.equal(a.sb.listening, 'elsewhere');
  assert.equal(a.cap().live, false, 'A released its microphone');
  assert.equal(pill(rootA), 'NOT LISTENING IN THIS WINDOW');
  assert.equal(b.sb.isOpen(), true, 'B is still on Standby (the button didn’t leave it)');
  const starts = a.cap().starts;
  b.sb.exit();
  await settle();
  assert.equal(a.sb.isOpen(), false, 'A left Standby too: leaving Standby turns the microphone off');
  assert.equal(a.cap().live, false);
  assert.equal(a.cap().starts, starts, 'A never opened the microphone again');
  assert.equal(shown().length, 0, 'no Standby on screen in either window');
});

test('PRIVACY-7: the window listening on Standby closes: the one waiting behind it takes over by itself', async (t) => {
  const { make, locks } = await setup(t);
  const a = make('A');
  a.sb.enter();
  await settle();
  const b = make('B');
  b.sb.enter();
  await settle();
  assert.equal(b.sb.listening, 'elsewhere');
  locks.close('A'); // A's tab closes: the browser lets go of its locks
  await settle();
  assert.equal(b.sb.listening, 'live', 'B listens by itself');
  assert.equal(b.cap().live, true);
});

test('a window that leaves Standby lets go; one opened later listens at once', async (t) => {
  const { make } = await setup(t);
  const a = make('A');
  a.sb.enter();
  await settle();
  a.sb.exit();
  await settle();
  const b = make('B');
  b.sb.enter();
  await settle();
  assert.equal(b.sb.listening, 'live');
});

test('without a lock (no Web Locks, or not passed): each window listens, as before', async (t) => {
  const { make } = await setup(t);
  const a = make('A', { lock: false });
  const b = make('B', { lock: false });
  a.sb.enter();
  b.sb.enter();
  await settle();
  assert.equal(a.sb.listening, 'live');
  assert.equal(b.sb.listening, 'live');
});

test('a woken window keeps the lock through the session: another window opened meanwhile waits', async (t) => {
  const { make } = await setup(t);
  const a = make('A');
  a.sb.enter();
  await settle();
  a.cap().clap();
  assert.deepEqual(a.woken, ['clap']);
  assert.equal(a.sb.isAwaiting(), true);
  assert.equal(a.cap().live, false, 'no barge-in: the microphone was released for Voice Mode, as before');
  const b = make('B');
  b.sb.enter();
  await settle();
  assert.equal(b.sb.listening, 'elsewhere');
  a.sb.resume();
  await settle();
  assert.equal(a.sb.listening, 'live');
  a.sb.release();
  a.sb.exit();
  await settle();
  assert.equal(b.sb.isOpen(), false, 'the owner left Standby in A: B leaves too (PRIVACY-7)');
  assert.equal(b.cap().starts, 0, 'B never opened the microphone');
});

test('barge-in allowed (keep()): the microphone stays on through the session; claps then go to detected(), and after the session the same microphone listens on', async (t) => {
  const { make } = await setup(t);
  const detections = [];
  let acts = true;
  const a = make('A', { bargeIn: { keep: () => true, detected: (d) => (detections.push(d.trigger), acts) } });
  a.sb.enter();
  await settle();
  assert.equal(a.cap().starts, 1);
  a.cap().clap();
  assert.deepEqual(a.woken, ['clap']);
  assert.equal(a.cap().live, true, 'kept on');
  assert.equal(a.cap().stops, 0);
  // Two claps during the session (within 1.5 s of the wake: ignored, as any double trigger).
  a.cap().clap();
  assert.deepEqual(detections, []);
  await new Promise((r) => setTimeout(r, 1600));
  a.cap().clap();
  assert.deepEqual(detections, ['clap'], 'Voice Mode is asked');
  assert.deepEqual(a.woken, ['clap'], 'never a second wake');
  acts = false;
  await new Promise((r) => setTimeout(r, 1600));
  a.cap().clap();
  a.cap().clap();
  assert.deepEqual(detections, ['clap', 'clap', 'clap'], 'not acted on (not speaking, or his own "Jarvis"): no rate limit spent');
  a.sb.resume();
  await settle();
  assert.equal(a.sb.listening, 'live');
  assert.equal(a.cap().starts, 1, 'the same capture listens on (no second start)');
  assert.equal(a.cap().stops, 0);
});

test('barge-in not allowed (keep() false, or none): the microphone is released at the wake, as before; detections during the session do nothing', async (t) => {
  const { make } = await setup(t);
  for (const bargeIn of [null, { keep: () => false, detected: () => assert.fail('never') }]) {
    const a = make('A', { bargeIn, lock: false });
    a.sb.enter();
    await settle();
    a.cap().clap();
    assert.equal(a.cap().live, false);
    assert.equal(a.cap().stops, 1);
    a.sb.release();
  }
});

test('MAC-2: the woken session left for a sheet ("open settings"): Standby rests — still woken and holding the lock, the kept microphone let go — and resume() listens again', async (t) => {
  const { make, locks } = await setup(t);
  const a = make('A', { bargeIn: { keep: () => true, detected: () => assert.fail('nothing to interrupt behind a sheet') } });
  a.sb.enter();
  await settle();
  a.cap().clap();
  assert.equal(a.cap().live, true, 'kept for barge-in during the session');
  a.sb.rest();
  assert.equal(a.cap().live, false, 'let go while the owner looks at the sheet');
  assert.equal(a.sb.isAwaiting(), true, 'still woken: Standby keeps its place');
  assert.equal(locks.holder('jarvis-standby'), 'A', 'and its lock: no other window takes over meanwhile');
  await new Promise((r) => setTimeout(r, 1600));
  a.cap().clap(); // a bang behind the sheet: nothing listens for it
  a.sb.resume();
  await settle();
  assert.equal(a.sb.listening, 'live', 'back on Standby, listening');
  assert.equal(a.cap().live, true);
  assert.equal(a.cap().starts, 2, 'a fresh start');
});

// MAC-6: the lock keeps two Standbys apart, but an open Voice Mode doesn't take it. A forgotten tab on Standby then
// answered "Hey Jarvis, …" said to Voice Mode in the other window too: two voices, two paid requests.
test('MAC-6: Voice Mode open in another Jarvis window: two claps or "Hey Jarvis" heard here don’t wake this Standby (it stays on, listening); once that Voice Mode closes, they do', async (t) => {
  const { make, locks } = await setup(t);
  const a = make('A', { voiceElsewhere: () => voiceOpenSomewhere({ locks: locks.as('A') }) });
  a.sb.enter();
  await settle();
  assert.equal(a.sb.listening, 'live');
  const closeB = holdVoiceLock({ locks: locks.as('B') }); // Voice Mode opened by a tap in window B
  await settle();
  a.cap().clap();
  await settle();
  assert.deepEqual(a.woken, [], 'A stays asleep: the owner is talking to Voice Mode in B');
  assert.equal(a.sb.isOpen(), true, 'still on Standby');
  assert.equal(a.sb.listening, 'live', 'and listening');
  assert.equal(a.cap().live, true);
  closeB();
  await settle();
  await new Promise((r) => setTimeout(r, 1600)); // past the 1.5 s between two wakes
  a.cap().clap();
  await settle();
  assert.deepEqual(a.woken, ['clap'], 'Voice Mode closed there: claps wake A again');
});

test('MAC-6: without the check (an iPhone, no Web Locks) Standby wakes at once, as before', async (t) => {
  const { make } = await setup(t);
  const a = make('A', { lock: false });
  a.sb.enter();
  await settle();
  a.cap().clap();
  assert.deepEqual(a.woken, ['clap'], 'synchronously, the microphone released first (iOS)');
  assert.equal(a.cap().live, false);
});

// MAC-10: on a phone Standby listens only on screen (pauseWhenHidden); a hidden, paused Standby kept the lock, so a
// second Jarvis window on screen said "NOT LISTENING IN THIS WINDOW". Phones use no lock, as before v8.1.
test('MAC-10: a phone (Standby pauses while hidden) takes no lock: a hidden, paused Standby doesn’t keep another window on screen from listening', async (t) => {
  const { make, locks, dom } = await setup(t);
  const a = make('A', { pauseWhenHidden: true });
  a.sb.enter();
  await settle();
  assert.equal(a.sb.listening, 'live');
  dom.doc.hidden = true;
  dom.doc.dispatch('visibilitychange');
  await settle();
  assert.equal(a.sb.listening, 'paused', 'A paused while hidden (as before)');
  assert.equal(a.cap().live, false);
  dom.doc.hidden = false; // window B on screen (A, another window, hears nothing of it)
  const b = make('B', { pauseWhenHidden: true });
  b.sb.enter();
  await settle();
  assert.equal(b.sb.listening, 'live', 'B listens, as before v8.1');
  assert.equal(locks.holder('jarvis-standby'), null, 'no lock on a phone');
});

// REGRESS-1 and MISSED-1: with "Hey Jarvis" on, every Jarvis page on a Mac opened Standby by itself at launch. A
// second tab then came up behind a full-screen Standby that couldn't listen, and waited in line for the microphone.
test('REGRESS-1: Standby opened by itself at launch while another window has it steps back at once (no screen that can’t listen, nothing waiting in line)', async (t) => {
  const { make, locks, shown } = await setup(t);
  const a = make('A');
  a.sb.enter();
  await settle();
  assert.equal(a.sb.listening, 'live');
  const exits = [];
  const b = make('B', { onExit: (e) => exits.push(e) });
  b.sb.enter({ again: true, launch: true }); // A11: opened by itself as the page loaded
  await settle();
  assert.equal(b.sb.isOpen(), false, 'B is back on the app');
  assert.equal(shown().length, 1, 'only A’s Standby is on screen');
  assert.deepEqual(locks.waiting('jarvis-standby'), [], 'B doesn’t wait in line');
  assert.equal(b.cap().starts, 0, 'B never opened the microphone');
  assert.deepEqual(exits, [{ from: 'open' }], 'the app is told (its Standby key is up to date)');
  a.sb.exit(); // MISSED-1: the owner leaves Standby in A
  await settle();
  assert.equal(b.cap().starts, 0, 'B still never opened the microphone');
  assert.equal(locks.holder('jarvis-standby'), null, 'nobody holds Standby');
});

test('REGRESS-1: Standby at launch with no other window on Standby opens and listens as before; one the owner opens waits as before', async (t) => {
  const { make } = await setup(t);
  const a = make('A');
  a.sb.enter({ again: true, launch: true });
  await settle();
  assert.equal(a.sb.listening, 'live', 'the launch Standby listens');
  const b = make('B');
  b.sb.enter(); // the owner's own tap: it waits, with Use this window
  await settle();
  assert.equal(b.sb.listening, 'elsewhere');
  b.sb.exit();
  await settle();
  // Taken later by Use this window, a launch Standby that listened steps back like any other (it waits).
  const c = make('C');
  c.sb.enter();
  await settle();
  c.sb.exit();
  await settle();
  assert.equal(a.sb.listening, 'live');
});

test('Standby taken by another window during a kept session: the barge-in microphone goes too', async (t) => {
  const { make, shown } = await setup(t);
  const a = make('A', { bargeIn: { keep: () => true, detected: () => true } });
  a.sb.enter();
  await settle();
  a.cap().clap();
  assert.equal(a.cap().live, true);
  const b = make('B');
  b.sb.enter();
  await settle();
  // B waits; the owner presses Use this window there.
  shown().at(-1).find('standby-use-here').click();
  await settle();
  assert.equal(b.sb.listening, 'live');
  assert.equal(a.cap().live, false, 'A’s kept microphone was released');
  a.sb.resume();
  await settle();
  assert.equal(a.sb.listening, 'elsewhere', 'A comes back to Standby waiting behind B');
});

/** A "Hey Jarvis" client whose start() fails `fails` times (a download that fails), then works. */
function flakyWord(fails) {
  const listeners = new Set();
  let st = { state: 'off', error: null };
  const set = (patch) => {
    st = { ...st, ...patch };
    for (const fn of [...listeners]) fn(st);
  };
  const w = {
    starts: 0,
    start() {
      w.starts += 1;
      set({ state: 'loading', error: null });
      if (w.starts <= fails) {
        set({ state: 'error', error: { code: 'network', message: 'offline' } });
        return Promise.reject({ code: 'network' });
      }
      set({ state: 'ready' });
      return Promise.resolve();
    },
    status: () => st,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onDetect: () => () => {},
    attach: () => true,
    reset() {},
    stop() {
      set({ state: 'off' });
    },
  };
  return w;
}

test('A12: "Hey Jarvis" whose download failed is started again by itself (back-off: 2 s first), and the hint says so', async (t) => {
  const { make, shown } = await setup(t);
  const w = flakyWord(1);
  const a = make('A', { lock: false, settings: { wakeClap: true, wakeWord: true }, createWakeWord: () => w });
  a.sb.enter();
  await settle();
  assert.equal(w.starts, 1);
  assert.equal(w.status().state, 'error');
  assert.match(hint(shown().at(-1)), /couldn’t load \(offline\?\)\. Two claps still work\. Jarvis tries again by himself\./);
  await new Promise((r) => setTimeout(r, 2100));
  await settle();
  assert.equal(w.starts, 2, 'started again after 2 s');
  assert.equal(w.status().state, 'ready');
});

test('A12: the network coming back starts a failed "Hey Jarvis" again at once; leaving Standby stops the retries', async (t) => {
  const { make } = await setup(t);
  const w = flakyWord(2);
  const a = make('A', { lock: false, settings: { wakeClap: true, wakeWord: true }, createWakeWord: () => w });
  a.sb.enter();
  await settle();
  assert.equal(w.starts, 1);
  globalThis.window.dispatch('online');
  await settle();
  assert.equal(w.starts, 2, 'at once when back online');
  assert.equal(w.status().state, 'error', 'still failing');
  a.sb.exit();
  await new Promise((r) => setTimeout(r, 2200));
  assert.equal(w.starts, 2, 'no retry after Standby closed');
});

test('A11: after a restart with no click yet (and George unavailable), Standby says CLICK ONCE SO JARVIS CAN SPEAK; that click unlocks speech and Standby stays; the next one leaves', async (t) => {
  const { make, shown } = await setup(t);
  // Chrome's navigator.userActivation.hasBeenActive: the press makes the page active before its click (or the key
  // before its keydown) reaches Standby.
  let active = false;
  const unlocks = [];
  const a = make('A', { lock: false, needsClick: () => !active, unlock: (o) => unlocks.push(o) });
  a.sb.enter({ again: true }); // opened by itself at launch: no tap behind it
  await settle();
  const root = shown().at(-1);
  assert.equal(root.find('standby-state').textContent, 'CLICK ONCE SO JARVIS CAN SPEAK');
  assert.equal(root.find('standby-state').hidden, false);
  active = true;
  root.click();
  assert.equal(a.sb.isOpen(), true, 'Standby stays');
  assert.deepEqual(unlocks.at(-1), { tap: true }, 'speech unlocked inside the click');
  assert.equal(root.find('standby-state').textContent, '', 'the line goes');
  root.click();
  assert.equal(a.sb.isOpen(), false, 'an ordinary tap leaves, as before');
});

test('A11: Enter answers the click-once line the same way (Standby stays); with George able to speak there is no line and a tap leaves', async (t) => {
  const { make, shown, dom } = await setup(t);
  let active = false;
  const unlocks = [];
  const a = make('A', { lock: false, needsClick: () => !active, unlock: (o) => unlocks.push(o) });
  a.sb.enter({ again: true });
  await settle();
  assert.equal(shown().at(-1).find('standby-state').textContent, 'CLICK ONCE SO JARVIS CAN SPEAK');
  active = true;
  const ev = dom.doc.dispatch('keydown', { key: 'Enter' });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(a.sb.isOpen(), true, 'Standby stays');
  assert.deepEqual(unlocks.at(-1), { tap: true });
  assert.equal(shown().at(-1).find('standby-state').textContent, '');
  dom.doc.dispatch('keydown', { key: 'Enter' });
  assert.equal(a.sb.isOpen(), false, 'the next Enter leaves, as before');

  const b = make('B', { lock: false, needsClick: () => false, unlock: () => {} }); // George can speak without a click
  b.sb.enter({ again: true });
  await settle();
  const root = shown().at(-1);
  assert.equal(root.find('standby-state').hidden, true, 'no click-once line');
  root.click();
  assert.equal(b.sb.isOpen(), false, 'a tap leaves');
});

test('A11: Use this window answers the click-once line too (its click made the page active)', async (t) => {
  const { make, shown } = await setup(t);
  const a = make('A');
  a.sb.enter();
  await settle();
  let active = false;
  const unlocks = [];
  const b = make('B', { needsClick: () => !active, unlock: (o) => unlocks.push(o) });
  b.sb.enter({ again: true });
  await settle();
  const rootB = shown().at(-1);
  assert.equal(rootB.find('standby-state').textContent, 'CLICK ONCE SO JARVIS CAN SPEAK');
  active = true;
  rootB.find('standby-use-here').click();
  await settle();
  assert.equal(b.sb.listening, 'live', 'Standby moved here');
  assert.deepEqual(unlocks.at(-1), { tap: true }, 'speech unlocked inside that click');
  assert.equal(rootB.find('standby-state').textContent, '', 'the line goes');
  rootB.click();
  assert.equal(b.sb.isOpen(), false, 'the next tap leaves');
});
