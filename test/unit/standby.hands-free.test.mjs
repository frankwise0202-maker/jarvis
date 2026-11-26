// v8.1 Standby on a Mac (src/ui/standby.js, SPEC §28.4, §28.5): one Jarvis per Mac answers (A9: the Web
// Lock, "Standby is on in another Jarvis window", Use this window), and barge-in keeps Standby's microphone
// and "Hey Jarvis" on through a woken session (A8) so two claps or the wake word can stop him while he
// speaks. Node, with a tiny DOM, fake captures, and the fake LockManager of standby.fakes.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeLocks } from './standby.fakes.mjs';
import { createStandbyLock } from '../../src/platform/standby-lock.js';

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
  const make = (who, { bargeIn = null, lock = true, settings = { wakeClap: true, wakeWord: false }, createWakeWord = null, needsClick, unlock } = {}) => {
    const woken = [];
    const sb = createStandby({
      getSettings: () => settings,
      createCapture: fakeCapture(log, who),
      createWakeWord,
      needsClick,
      unlock,
      onWake: (w) => woken.push(w.trigger),
      createLock: lock ? (onChange) => createStandbyLock({ locks: locks.as(who), onChange }) : null,
      bargeIn,
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

test('Use this window: Standby moves to B (B listens, A stops and says so); A takes it back when B leaves', async (t) => {
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
  b.sb.exit();
  await settle();
  assert.equal(a.sb.listening, 'live', 'A listens again by itself');
  assert.equal(a.cap().live, true);
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
  assert.equal(b.sb.listening, 'live');
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
  let clicked = false;
  const unlocks = [];
  const a = make('A', { lock: false, needsClick: () => !clicked, unlock: (o) => {
    unlocks.push(o);
    if (o && o.tap) clicked = true; // the page has had its click now
  } });
  a.sb.enter({ again: true }); // opened by itself at launch: no tap behind it
  await settle();
  const root = shown().at(-1);
  assert.equal(root.find('standby-state').textContent, 'CLICK ONCE SO JARVIS CAN SPEAK');
  assert.equal(root.find('standby-state').hidden, false);
  root.click();
  assert.equal(a.sb.isOpen(), true, 'Standby stays');
  assert.deepEqual(unlocks.at(-1), { tap: true }, 'speech unlocked inside the click');
  assert.equal(root.find('standby-state').textContent, '', 'the line goes');
  root.click();
  assert.equal(a.sb.isOpen(), false, 'an ordinary tap leaves, as before');
});
