// Fakes for Voice Mode unit tests (not a test file itself): a tiny DOM, a virtual clock (Date.now,
// performance.now, timers, requestAnimationFrame), a fake recognizer (stt) and fake voices (tts), and
// openVoiceMode() opened the way app.js does. From the u-mac study's probe (probes/u-mac/app/shim.mjs).
//
//   const env = await voiceEnv(t);                         // installs everything; restored after the test
//   const vm = env.open({ wake: env.wakeHooks(), listenWhileHidden: () => true, extra: { router }, ... });
//   env.setHidden(true); await env.advance(ms);
//   env.log: { listens: [opts], turns: [text], spoken: [{ text, voice }], closes: [info], ... }
//
// The recognizer: env.say(n) decides what listen n hears: a string (heard 1.5 s after the start, final),
// null (nothing: 'no-speech' after `noSpeechMs`, or never with noSpeech: false). env.voice('natural')
// makes the next speech George's (tts.voiceNow()), 'device' the Mac's own. Each speech lasts `speechMs`.

let loads = 0;

export function installDom() {
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
    insertBefore(c, ref) {
      if (c.parentNode) c.parentNode.removeChild(c);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(c);
      else this.childNodes.splice(i, 0, c);
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
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] || null;
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
    dispatchEvent(ev) {
      for (const fn of Array.from(this._l[ev.type] || [])) fn(ev);
      return true;
    }
    dispatch(t, ev = {}) {
      return this.dispatchEvent({ type: t, target: this, preventDefault() {}, stopPropagation() {}, ...ev });
    }
    contains(n) {
      for (; n; n = n.parentNode) if (n === this) return true;
      return false;
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
      this.value = '';
      const self = this;
      this.style = {
        setProperty(k, v) {
          self.style[k] = v;
        },
        removeProperty(k) {
          delete self.style[k];
        },
      };
      const cls = new Set();
      this.classList = { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, on) => ((on ?? !cls.has(c)) ? cls.add(c) : cls.delete(c)) };
    }
    appendChild(c) {
      this._text = undefined;
      return super.appendChild(c);
    }
    append(...kids) {
      for (const k of kids) this.appendChild(typeof k === 'string' ? new Text(k) : k);
    }
    replaceChildren(...kids) {
      this.childNodes = [];
      this._text = undefined;
      this.append(...kids);
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    }
    getAttribute(k) {
      return this.attributes[k] ?? null;
    }
    removeAttribute(k) {
      delete this.attributes[k];
    }
    hasAttribute(k) {
      return k in this.attributes;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    focus() {
      globalThis.document.activeElement = this;
    }
    blur() {}
    click() {
      this.dispatch('click');
    }
    getContext() {
      return null;
    }
    getClientRects() {
      return [1];
    }
    getBoundingClientRect() {
      return { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 };
    }
    scrollTo() {}
    scrollIntoView() {}
    setSelectionRange() {}
    closest() {
      return null;
    }
    querySelector() {
      return null;
    }
    querySelectorAll() {
      return [];
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
  const doc = new Node();
  doc.hidden = false;
  doc.visibilityState = 'visible';
  doc.baseURI = 'https://jarvis.example/';
  doc.titles = ['Jarvis']; // every title the page had, in order
  Object.defineProperty(doc, 'title', {
    get: () => doc.titles[doc.titles.length - 1],
    set: (v) => {
      if (String(v) !== doc.titles[doc.titles.length - 1]) doc.titles.push(String(v));
    },
  });
  doc.createElement = (t) => new Element(t);
  doc.createElementNS = (_ns, t) => new Element(t);
  doc.createTextNode = (t) => new Text(t);
  doc.documentElement = new Element('html');
  doc.body = new Element('body');
  doc.appendChild(doc.documentElement);
  doc.documentElement.appendChild(doc.body);
  doc.activeElement = doc.body;
  doc.querySelector = () => null;
  doc.querySelectorAll = () => [];
  const win = new Node();
  win.innerWidth = 1440;
  win.innerHeight = 900;
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return { Node, Element, Text, doc, win };
}

export function installClock(start = Date.UTC(2026, 10, 26, 21, 0, 0)) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, now: Date.now };
  const flush = () => new Promise((r) => setImmediate(r));
  const clock = {
    now: () => now,
    install() {
      Date.now = () => now;
      globalThis.setTimeout = (fn, ms = 0) => {
        const id = ++seq;
        timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, every: 0 });
        return id;
      };
      globalThis.setInterval = (fn, ms = 0) => {
        const id = ++seq;
        const every = Math.max(1, Number(ms) || 0);
        timers.set(id, { at: now + every, fn, every });
        return id;
      };
      globalThis.clearTimeout = globalThis.clearInterval = (id) => {
        timers.delete(id);
      };
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
        await flush();
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = t.at;
        if (t.every) t.at += t.every;
        else timers.delete(id);
        try {
          t.fn();
        } catch (err) {
          console.error('timer threw', err);
        }
      }
      now = end;
      await flush();
      await flush();
    },
    restore() {
      Object.assign(globalThis, { setTimeout: real.setTimeout, clearTimeout: real.clearTimeout, setInterval: real.setInterval, clearInterval: real.clearInterval });
      Date.now = real.now;
    },
  };
  return clock;
}

/** Everything a Voice Mode test needs; `t.after` restores the globals. */
export async function voiceEnv(t, { noSpeechMs = 900, speechMs = 1500, heardAfterMs = 1500 } = {}) {
  const { Node, Element, doc, win } = installDom();
  const clock = installClock();
  const saved = {};
  const globals = {
    Node,
    Element,
    document: doc,
    window: win,
    navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', onLine: true, maxTouchPoints: 0, userActivation: { hasBeenActive: true, isActive: false } },
    performance: { now: () => clock.now() },
    requestAnimationFrame: (fn) => setTimeout(() => fn(clock.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    MutationObserver: undefined,
    matchMedia: win.matchMedia,
    Notification: undefined,
  };
  for (const k of Object.keys(globals)) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  for (const [k, v] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  clock.install();
  t.after(() => {
    clock.restore();
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  });
  const mod = await import(`../../src/ui/voice-mode.js?env=${++loads}`);
  const attention = await import('../../src/ui/attention.js');

  const log = { listens: [], turns: [], spoken: [], closes: [], awake: [], aborted: 0, sounds: [], notes: [], titles: [] };
  let sayFn = () => null;
  let voiceKind = 'device';
  let speaking = null;

  // Notifications: a fake constructor (attention.js notify() uses it on a computer).
  class FakeNotification {
    constructor(title, options = {}) {
      this.title = title;
      this.body = options.body || '';
      this.tag = options.tag || '';
      this.closed = false;
      log.notes.push(this);
    }
    close() {
      this.closed = true;
    }
    static get permission() {
      return 'granted';
    }
  }
  Object.defineProperty(globalThis, 'Notification', { value: FakeNotification, configurable: true, writable: true });
  win.Notification = FakeNotification;
  win.isSecureContext = true;

  const stt = {
    sttSupported: () => true,
    listenWaitMs: () => 1600,
    turnSilenceMs: (_t, wait) => wait + 1000,
    startListening(opts) {
      const n = log.listens.length;
      log.listens.push({ ...opts, at: clock.now(), hidden: doc.hidden });
      const words = sayFn(n);
      let done = false;
      const timers = [];
      const later = (fn, ms) => timers.push(setTimeout(fn, ms));
      const h = {
        stop() {
          if (done) return;
          done = true;
          later(() => opts.onEnd && opts.onEnd(), 10);
        },
        abort() {
          log.aborted += 1;
          if (done) return;
          done = true;
          for (const x of timers) clearTimeout(x);
          later(() => opts.onEnd && opts.onEnd(), 10);
        },
      };
      if (typeof words === 'string' && words) {
        later(() => {
          if (done) return;
          opts.onPartial && opts.onPartial(words);
          opts.onFinal && opts.onFinal(words, { alternatives: [] });
          if (!opts.keepListening) {
            done = true;
            later(() => opts.onEnd && opts.onEnd(), 10);
          }
        }, heardAfterMs);
      } else if (words && typeof words === 'object' && words.error) {
        later(() => {
          if (done) return;
          done = true;
          opts.onError && opts.onError({ code: words.error, message: 'failed' });
          later(() => opts.onEnd && opts.onEnd(), 10);
        }, 100);
      } else if (noSpeechMs) {
        const ms = Number.isFinite(opts.noSpeechMs) && opts.noSpeechMs > 0 ? Math.min(opts.noSpeechMs, noSpeechMs) : noSpeechMs;
        later(() => {
          if (done) return;
          done = true;
          opts.onError && opts.onError({ code: 'no-speech', message: 'nothing' });
          later(() => opts.onEnd && opts.onEnd(), 10);
        }, ms);
      }
      return h;
    },
  };

  const voiceListeners = new Set();
  const setVoiceNow = (v) => {
    for (const fn of voiceListeners) fn(v);
  };
  const speakOnce = (text, o) => {
    const rec = { text, voice: voiceKind, at: clock.now(), cancelled: false, done: false };
    log.spoken.push(rec);
    speaking = rec;
    setVoiceNow(voiceKind);
    const words = [];
    for (const m of String(text).matchAll(/\S+/g)) words.push(m.index);
    const t0 = setTimeout(() => {
      if (rec.cancelled) return;
      o.onStart && o.onStart();
      o.onChunk && o.onChunk({ index: 0, start: 0, end: String(text).length, text });
      words.forEach((ci, i) => {
        setTimeout(() => {
          if (rec.cancelled) return;
          if (o.onBoundary) o.onBoundary({ charIndex: ci, charLength: 1, name: 'word', chunkIndex: 0 });
          const word = /^\S+/.exec(String(text).slice(ci))[0];
          if (typeof env.onWord === 'function') env.onWord({ word, charIndex: ci, text });
        }, (i * speechMs) / Math.max(1, words.length));
      });
      setTimeout(() => {
        if (rec.cancelled) return;
        rec.done = true;
        speaking = null;
        setVoiceNow(null);
        o.onEnd && o.onEnd({ reason: 'done' });
      }, speechMs);
    }, 20);
    return {
      cancel() {
        if (rec.cancelled || rec.done) return;
        rec.cancelled = true;
        clearTimeout(t0);
        speaking = null;
        setVoiceNow(null);
      },
    };
  };
  const tts = {
    ttsSupported: () => true,
    speak: (text, o) => speakOnce(text, o),
    createSpeechStream(o) {
      let text = '';
      let handle = null;
      return {
        append(x) {
          text += x;
        },
        finish() {
          handle = speakOnce(text, o);
        },
        cancel() {
          if (handle) handle.cancel();
        },
        text: () => text,
      };
    },
    stopSpeaking() {
      if (speaking) speaking.cancelled = true;
    },
    unlockSpeech() {},
    voiceNow: () => (speaking ? speaking.voice : null),
    onVoiceChange(fn) {
      voiceListeners.add(fn);
      return () => voiceListeners.delete(fn);
    },
  };
  const sounds = {
    play: (name, opts) => {
      log.sounds.push({ name, hidden: doc.hidden, asked: !!(opts && opts.hidden) });
      return true;
    },
    haptic() {},
  };

  const env = {
    onWord: null, // (test) ({ word, charIndex, text }) right after each word event of the voice
    mod,
    attention,
    clock,
    doc,
    log,
    stt,
    tts,
    sounds,
    advance: (ms) => clock.advance(ms),
    /** What listen n hears: a string, null (nobody) or { error: code }. */
    say(fn) {
      sayFn = typeof fn === 'function' ? fn : () => fn;
    },
    /** The voice that says what comes next: 'natural' | 'homebase' (George) or 'device' (the Mac's own). */
    voice(kind) {
      voiceKind = kind;
    },
    setHidden(hidden) {
      doc.hidden = !!hidden;
      doc.visibilityState = hidden ? 'hidden' : 'visible';
      doc.dispatch('visibilitychange');
    },
    /** The wake routine's hooks, as app.js passes them. */
    wakeHooks(extra = {}) {
      return {
        trigger: 'clap',
        name: () => 'Tony',
        offer: async () => null,
        briefing: () => null,
        returnToStandby: () => true,
        canSleep: () => true,
        onAwake: (i) => log.awake.push(i),
        ...extra,
      };
    },
    /**
     * Open Voice Mode the way app.js does. `answer`: each question is a turn that streams this text and ends
     * ('done' after about 1 s); without it, startTurn fails and Jarvis apologises (the mock's error).
     */
    open({ wake = null, listenWhileHidden = undefined, settings = {}, startTurn = null, answer = null, extra = {} } = {}) {
      const turnFor = (text) => {
        log.turns.push(text);
        if (!answer) throw new Error('no API in this test');
        const listeners = new Set();
        const turn = { status: 'running', segments: [], spoken: true, createdAt: clock.now() };
        let resolve;
        const run = {
          turn,
          on(_type, fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
          },
          done: new Promise((r) => (resolve = r)),
          abort() {
            if (turn.status !== 'running') return;
            turn.status = 'stopped';
            resolve(turn);
          },
        };
        const emit = (type, event) => {
          for (const fn of Array.from(listeners)) fn({ type, ...event }, type);
        };
        setTimeout(() => {
          if (turn.status !== 'running') return;
          const segment = { id: `s${log.turns.length}`, kind: 'text', text: typeof answer === 'function' ? answer(text) : answer, req: 0 };
          turn.segments.push(segment);
          emit('segment', { segment });
        }, 300);
        setTimeout(() => {
          if (turn.status !== 'running') return;
          turn.status = 'done';
          turn.endedAt = clock.now();
          emit('end', { turn });
          resolve(turn);
        }, 900);
        return run;
      };
      return mod.openVoiceMode({
        getSettings: () => ({ voiceContinuous: true, listenWait: 'normal', userName: 'Tony', listenSend: 'now', ...settings }),
        saveSettings() {},
        startTurn: startTurn || turnFor,
        createCore: null,
        stt,
        tts,
        markdownToPlainText: (m) => String(m || ''),
        sounds,
        wakeLock: { keepAwake() {}, allowSleep() {} },
        standby: {},
        wake,
        listenWhileHidden,
        onClose: (info) => log.closes.push(info),
        ...extra, // more of app.js's deps (a test's router: { route, run })
      });
    },
    status: () => {
      const find = (el) => {
        if (!el) return null;
        if (el.attributes && el.attributes['data-testid'] === 'voice-status') return el.textContent;
        for (const c of el.childNodes || []) {
          const v = find(c);
          if (v !== null) return v;
        }
        return null;
      };
      return find(doc.body);
    },
  };
  return env;
}
