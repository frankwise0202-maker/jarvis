// v8.1 Standby with the Microphone and speaker choice (src/ui/standby.js, SPEC §28.3, A5 and A12's mute half):
// a failed capture is tried again after 2 s, 5 s, 15 s, 60 s, then every 5 minutes (also hidden on a Mac; a phone
// waits until shown); the pill names the chosen microphone and a disconnected speakerphone; the capture moves when
// the chosen microphone goes and comes back, and starts again after the Mac slept; the one-time Bluetooth line;
// "MICROPHONE MUTED?" after exact digital silence. Node, on the virtual clock, with a tiny DOM and fake captures
// (the same kind of DOM as standby.hands-free.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock } from './platform.voice.fakeengine.test.mjs';

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
      const e = { type: t, target: this, preventDefault() {}, stopPropagation() {}, ...ev };
      for (let n = this; n; n = n.parentNode) for (const fn of Array.from(n._l[t] || [])) fn(e);
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

/** A Standby capture whose next starts fail with the given reasons; `device` its live track's microphone. */
function fakeCapture(script) {
  return (opts) => {
    const cap = {
      opts,
      live: false,
      starts: 0,
      startAt: [],
      context: { state: 'running' },
      device: script.device || { id: 'mac-mic', label: 'MacBook Pro Microphone (Built-in)', fellBack: false },
      prepare() {},
      async start() {
        cap.starts += 1;
        cap.startAt.push(Date.now());
        const fail = script.fail.shift();
        if (fail) return { ok: false, reason: fail };
        cap.live = true;
        return { ok: true };
      },
      stop() {
        cap.live = false;
      },
      close() {
        cap.live = false;
      },
      configure() {},
      wordPort: () => null,
      /** The system ended the track (a call, the speakerphone turned off). */
      end() {
        cap.live = false;
        opts.onState({ state: 'off', reason: 'ended' });
      },
    };
    script.caps.push(cap);
    return cap;
  };
}

/** The audio hooks app.js gives Standby (src/platform/audio-devices.js standbyHooks()), controllable. */
function fakeAudio() {
  const a = {
    key: 'mac-mic|100',
    named: { name: 'THE MAC’S MICROPHONE', gone: '' },
    line: '',
    listeners: new Set(),
    woke: new Set(),
    checks: 0,
    pill: () => a.named,
    wakeKey: (fellBack) => (fellBack ? `|${a.key.split('|')[1]}` : a.key),
    subscribe: (fn) => (a.listeners.add(fn), () => a.listeners.delete(fn)),
    check: () => (a.checks += 1),
    onWoke: (fn) => (a.woke.add(fn), () => a.woke.delete(fn)),
    firstTimeLine: async () => a.line,
    emit: () => a.listeners.forEach((fn) => fn({})),
  };
  return a;
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

let loads = 0;
async function setup(t, { fail = [], pauseWhenHidden = false, audio = null, device = null } = {}) {
  const dom = installDom();
  const clock = installClock();
  const script = { fail: [...fail], caps: [], device };
  const { createStandby } = await import(`../../src/ui/standby.js?audio=${++loads}`);
  const sb = createStandby({ getSettings: () => ({ wakeClap: true, wakeWord: false }), createCapture: fakeCapture(script), pauseWhenHidden, audio });
  t.after(() => {
    sb.exit({ silent: true });
    clock.restore();
    dom.restore();
  });
  const root = () => dom.doc.body.childNodes.find((n) => n.attributes && n.attributes['data-testid'] === 'standby');
  const text = (id) => root().find(id).textContent;
  return { sb, clock, dom, script, cap: () => script.caps[script.caps.length - 1], text, root };
}

test('a busy microphone is tried again after 2 s, then 5 s, and listens; the hint says it tries by itself', async (t) => {
  const { sb, clock, cap, text } = await setup(t, { fail: ['busy', 'busy'] });
  sb.enter();
  await flush();
  assert.equal(sb.listening, 'busy');
  assert.equal(text('standby-pill'), 'NOT LISTENING');
  assert.equal(text('standby-hint'), 'The microphone is busy. Jarvis tries it again by himself.');
  clock.advance(1999);
  await flush();
  assert.equal(cap().starts, 1, 'not before 2 s');
  clock.advance(1);
  await flush();
  assert.equal(cap().starts, 2);
  clock.advance(5000);
  await flush();
  assert.equal(cap().starts, 3);
  assert.equal(sb.listening, 'live');
  const at = cap().startAt;
  assert.deepEqual([at[1] - at[0], at[2] - at[1]], [2000, 5000]);
  assert.equal(text('standby-pill'), 'LISTENING ON THIS DEVICE · TWO CLAPS', 'nothing chosen: as before');
});

test('the back-off goes on: 15 s, 60 s, then every 5 minutes', async (t) => {
  const { sb, clock, cap } = await setup(t, { fail: ['no-mic', 'no-mic', 'no-mic', 'no-mic', 'no-mic', 'no-mic'] });
  sb.enter();
  await flush();
  for (const ms of [2000, 5000, 15000, 60000, 300000]) {
    clock.advance(ms);
    await flush();
  }
  const at = cap().startAt;
  assert.deepEqual(at.slice(1).map((v, i) => v - at[i]), [2000, 5000, 15000, 60000, 300000]);
  clock.advance(300000);
  await flush();
  assert.equal(sb.listening, 'live', 'the sixth try works');
});

test('a refused microphone is never tried again by itself (the owner must allow it)', async (t) => {
  const refused = await setup(t, { fail: ['denied'] });
  refused.sb.enter();
  await flush();
  refused.clock.advance(10 * 60000);
  await flush();
  assert.equal(refused.cap().starts, 1, 'no retries');
  assert.equal(refused.sb.listening, 'denied');
});

test('a track that ends is tried again after 2 s, also hidden on a Mac', async (t) => {
  const mac = await setup(t);
  mac.sb.enter();
  await flush();
  mac.dom.doc.hidden = true;
  mac.cap().end();
  assert.equal(mac.sb.listening, 'paused');
  assert.equal(mac.text('standby-hint'), 'The microphone stopped. Jarvis tries it again by himself.');
  mac.clock.advance(2000);
  await flush();
  assert.equal(mac.sb.listening, 'live', 'listening again while hidden');
  assert.equal(mac.cap().starts, 2);
});

test('a phone waits until it is shown before trying again', async (t) => {
  const phone = await setup(t, { pauseWhenHidden: true });
  phone.sb.enter();
  await flush();
  phone.cap().end();
  phone.dom.doc.hidden = true;
  phone.clock.advance(60000);
  await flush();
  assert.equal(phone.cap().starts, 1, 'no retry while hidden on a phone');
});

test('the pill names the chosen microphone, and the speakerphone when it is disconnected', async (t) => {
  const audio = fakeAudio();
  const { sb, text } = await setup(t, { audio });
  sb.enter();
  await flush();
  assert.equal(text('standby-pill'), 'LISTENING ON THE MAC’S MICROPHONE · TWO CLAPS');
  audio.named = { name: 'THE MAC’S MICROPHONE', gone: 'SPEAKERPHONE' };
  audio.emit();
  assert.equal(text('standby-pill'), 'LISTENING ON THE MAC’S MICROPHONE · SPEAKERPHONE DISCONNECTED');
  audio.named = null; // nothing chosen
  audio.emit();
  assert.equal(text('standby-pill'), 'LISTENING ON THIS DEVICE · TWO CLAPS');
});

test('the chosen microphone gone or back: the capture starts again on the right one; after the Mac slept too', async (t) => {
  const audio = fakeAudio();
  const { sb, cap } = await setup(t, { audio });
  sb.enter();
  await flush();
  assert.equal(cap().starts, 1);
  audio.emit(); // a devices check that changed nothing
  await flush();
  assert.equal(cap().starts, 1, 'nothing moved: no restart');
  audio.key = '|100'; // gone: the default microphone
  audio.emit();
  await flush();
  assert.equal(cap().starts, 2, 'moved to the default');
  audio.key = 'mac-mic|100'; // back
  audio.emit();
  await flush();
  assert.equal(cap().starts, 3, 'moved back');
  for (const fn of audio.woke) fn(); // the Mac slept
  await flush();
  assert.equal(cap().starts, 4, 'started again after the sleep');
  cap().end();
  assert.equal(audio.checks, 1, 'an ended track has the devices checked');
});

test('a capture that fell back by itself is not restarted when the watcher confirms the absence', async (t) => {
  const audio = fakeAudio();
  audio.key = 'sp-mic|000';
  const { sb, cap } = await setup(t, { audio, device: { id: 'default', label: 'Default - MacBook Pro Microphone (Built-in)', fellBack: true } });
  // The start "fell back" (the chosen one wasn't there): Standby remembers the key without the id.
  sb.enter();
  await flush();
  const first = cap();
  first.start = async () => {
    first.starts += 1;
    first.live = true;
    return { ok: true, fellBack: true };
  };
  // Restart once so the fallback start is the one remembered.
  audio.key = 'sp-mic|001';
  audio.emit();
  await flush();
  const starts = first.starts;
  assert.equal(starts, 2, 'the restart that fell back');
  audio.key = '|001'; // the watcher confirms: gone (the default, same processing)
  audio.emit();
  await flush();
  assert.equal(first.starts, starts, 'already on the default: no second restart');
});

test('the one-time Bluetooth line shows during that Standby only', async (t) => {
  const audio = fakeAudio();
  audio.line = 'Using a Bluetooth speakerphone? Set it up in Settings → Voice.';
  const { sb, root } = await setup(t, { audio });
  sb.enter();
  await flush();
  const tip = root().find('standby-tip');
  assert.equal(tip.hidden, false);
  assert.equal(tip.textContent, 'Using a Bluetooth speakerphone? Set it up in Settings → Voice.');
  sb.exit({ silent: true });
  assert.equal(tip.hidden, true, 'hidden once Standby is left');
});

test('MICROPHONE MUTED? after exact digital silence (the capture says so), and listening again at the first sound', async (t) => {
  const { sb, cap, text, root } = await setup(t, { audio: fakeAudio() });
  sb.enter();
  await flush();
  assert.equal(typeof cap().opts.onSilence, 'function', 'Standby asks its capture about silence');
  cap().opts.onSilence(true);
  assert.equal(text('standby-pill'), 'MICROPHONE MUTED?');
  assert.equal(root().dataset.muted, 'true');
  assert.equal(text('standby-hint'), 'No sound at all is coming from the microphone. Is it muted (the speakerphone’s mute button)?');
  cap().opts.onSilence(false);
  assert.equal(text('standby-pill'), 'LISTENING ON THE MAC’S MICROPHONE · TWO CLAPS');
  assert.equal(root().dataset.muted, 'false');
});
