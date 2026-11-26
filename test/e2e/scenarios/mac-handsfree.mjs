// v8.1 Hands-free on a Mac (SPEC §28.1, §28.4, §28.5; §22 and §26 notes): Jarvis listens and speaks with his
// window in the background (A1), every woken session goes back to Standby (A2), George and the Mac's own voice
// never hang there (A3), the follow-up window and the hidden brake (A6), barge-in by "Hey Jarvis" or claps
// while George speaks (A8), and one Jarvis per Mac answers (A9).
//
// The page is hidden the way optics.mjs does it (document.hidden and visibilityState redefined, then a
// visibilitychange event). Speech is faked by installFakeSpeech (features.mjs), the microphone by
// installFakeMic (fake-mic.mjs), George by the fake Core's voice (core-fakes.mjs), "Hey Jarvis" by the
// localhost stand-in (window.__jarvisWake.say()). Recorded here: notifications (__notes), the chimes' voices
// started while hidden (__chimes) and the tab title (__titles).

import { tid } from '../harness.mjs';
import { CORE_URL } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';
import { installFakeMic } from '../fake-mic.mjs';
import { installAudioFakes } from '../audio-fakes.mjs';
import { setHidden } from './optics.mjs';
import * as S from '../../unit/wake.signals.mjs';

const pad = (x, before = 0.4, after = 0.9) => S.concat(S.silence(before), x, S.silence(after));
const DOUBLE_CLAP = Array.from(pad(S.doubleClap({ gapMs: 420, at: 0.2, seconds: 1.0, peakDb: -10 })));
const QUESTION = 'What is the capital of France?';
const ANSWER = /The capital of France is Paris\./;
const GEORGE = { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'owner' };
// Barge-in's gate (A8): setup 1 chosen, the hands-free Test's self-trigger step passed (mac-dev writes both), on what
// it measured (MAC-9: setup 1, the default microphone and speaker here, claps and "Hey Jarvis").
const BARGE_IN = { audioSetup: 'speaker-mac-mic' };
const TEST_PASSED = JSON.stringify({ at: 1_800_000_000_000, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: true, measured: { setup: 'speaker-mac-mic', wakeMic: '', speaker: '', clap: true, word: true } });

// ---- probes (init scripts) ------------------------------------------------------------------------------

/** Notifications: window.Notification and the service worker's, recorded in window.__notes ({ title, body, tag, closed }). */
function installNotifyProbe() {
  const notes = [];
  window.__notes = notes;
  class FakeNotification {
    constructor(title, options = {}) {
      this.title = String(title);
      this.body = String(options.body || '');
      this.tag = String(options.tag || '');
      this.closed = false;
      this.onclick = null;
      this.onclose = null;
      notes.push(this);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      if (typeof this.onclose === 'function') this.onclose();
    }
    static get permission() {
      return 'granted';
    }
    static requestPermission() {
      return Promise.resolve('granted');
    }
  }
  window.Notification = FakeNotification;
  try {
    const proto = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
    if (proto) {
      proto.showNotification = function showNotification(title, options = {}) {
        // A new one with the same tag replaces the old one, as a system notification does.
        for (const n of notes) if (options.tag && n.tag === options.tag && !n.closed) n.closed = true;
        new FakeNotification(title, options);
        return Promise.resolve();
      };
      proto.getNotifications = function getNotifications(filter = {}) {
        return Promise.resolve(notes.filter((n) => !n.closed && (!filter || !filter.tag || n.tag === filter.tag)));
      };
    }
  } catch {
    /* no service worker API */
  }
}

/**
 * The chimes (src/ui/sounds.js plays them on its own AudioContext, latencyHint 'interactive'): each voice
 * started is recorded with the page's visibility then, in window.__chimes ({ t, hidden }). The tab title's
 * changes are recorded in window.__titles.
 */
function installSoundProbe() {
  const chimes = [];
  window.__chimes = chimes;
  const Real = window.AudioContext;
  if (Real) {
    class ProbeAudioContext extends Real {
      constructor(opts) {
        super(opts);
        this.__chime = !!opts && opts.latencyHint === 'interactive';
      }
    }
    window.AudioContext = ProbeAudioContext;
    const start = AudioScheduledSourceNode.prototype.start;
    AudioScheduledSourceNode.prototype.start = function probedStart(...args) {
      try {
        if (this.context && this.context.__chime) chimes.push({ t: performance.now(), hidden: document.visibilityState === 'hidden' });
      } catch {
        /* bookkeeping only */
      }
      return start.apply(this, args);
    };
  }
  const titles = [];
  window.__titles = titles;
  const note = () => {
    if (titles[titles.length - 1] !== document.title) titles.push(document.title);
  };
  document.addEventListener('DOMContentLoaded', () => {
    note();
    const el = document.querySelector('title');
    if (el) new MutationObserver(note).observe(el, { childList: true, characterData: true, subtree: true });
  });
}

/** George's 24 kHz contexts: `window.__george.stick()` stops their clocks (suspended; resume() does nothing). */
function installGeorgeProbe() {
  const Real = window.AudioContext;
  if (!Real) return;
  const st = { stuck: false, contexts: [] };
  window.__george = st;
  class GeorgeContext extends Real {
    constructor(opts) {
      super(opts);
      if (opts && opts.sampleRate === 24000) st.contexts.push(this);
    }
    resume() {
      if (st.stuck && st.contexts.includes(this)) return Promise.resolve();
      return super.resume();
    }
  }
  window.AudioContext = GeorgeContext;
  st.stick = () => {
    st.stuck = true;
    for (const c of st.contexts) c.suspend().catch(() => {});
  };
}

/**
 * A page Chrome opened after a restart: no click yet. `navigator.userActivation` follows Chrome's rule from a clean
 * start (active from the first press or key on, before the page's own handlers see it): a test page opened by the
 * harness may count as already active, so this stands in for it. `window.__activation.real` keeps Chrome's value.
 */
function installNoClickYet() {
  let active = false;
  const real = navigator.userActivation;
  const mark = (e) => {
    if (e.isTrusted) active = true;
  };
  for (const type of ['pointerdown', 'mousedown', 'keydown', 'touchend']) window.addEventListener(type, mark, true);
  const ua = {
    get hasBeenActive() {
      return active;
    },
    get isActive() {
      return active;
    },
  };
  window.__activation = { real: () => (real ? real.hasBeenActive : null), fake: () => active };
  try {
    Object.defineProperty(Navigator.prototype, 'userActivation', { configurable: true, get: () => ua });
  } catch {
    /* Chrome's own stays */
  }
}

// ---- helpers ----------------------------------------------------------------------------------------------

const play = (page, samples) => page.evaluate((x) => window.__fakeMic.play(x), samples);
const said = (page) => page.evaluate(() => window.__voice.said.slice());
const listens = (page) => page.evaluate(() => window.__voice.listens);
const leadCount = (t) => t.requests('lead').length;

async function standbyState(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="standby"]');
    if (!el || el.hidden) return null;
    const use = el.querySelector('[data-testid="standby-use-here"]');
    return { listening: el.dataset.listening, word: el.dataset.word, pill: (el.querySelector('[data-testid="standby-pill"]')?.textContent || '').trim(), hint: (el.querySelector('[data-testid="standby-hint"]')?.textContent || '').trim(), useHere: !!use && !use.hidden };
  });
}

const voiceState = (page) => page.evaluate(() => document.querySelector('[data-testid="voice-mode"]')?.getAttribute('data-state') || null);
const voiceStatus = (page) => page.evaluate(() => (document.querySelector('[data-testid="voice-status"]')?.textContent || '').trim());

async function waitListening(t, page = t.page, timeout = 15000) {
  await t.waitFor(async () => (await standbyState(page))?.listening === 'live', { timeout, message: async () => `Standby to listen (${JSON.stringify(await standbyState(page))})` });
}

async function waitSaid(t, re, { timeout = 20000, page = t.page } = {}) {
  await t.waitFor(async () => (await said(page)).some((x) => re.test(x)), { timeout, message: async () => `Jarvis to say ${re} (said: ${JSON.stringify(await said(page))})` });
}

async function waitVoice(t, state, { timeout = 15000, page = t.page } = {}) {
  await t.waitFor(async () => (await voiceState(page)) === state, { timeout, message: async () => `Voice Mode to be ${state} (${await voiceState(page)}, “${await voiceStatus(page)}”)` });
}

async function backInStandby(t, page = t.page, timeout = 20000) {
  await page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout });
  await t.visible('standby', { page, message: 'Standby comes back' });
  await waitListening(t, page);
}

async function setup(t, { device = 'mac', speech = {}, settings = {}, george = false, bargeIn = false, wordStub = false, devVoice = null, noClickYet = false, page = null } = {}) {
  const p = page || (await t.newPage({ device, settings: { ...(t.scenario.settings || {}), ...(george ? GEORGE : {}), ...(bargeIn ? BARGE_IN : {}), ...settings } }));
  await p.addInitScript(installFakeSpeech, speech);
  await p.addInitScript(installFakeMic, { wakeLock: true });
  await p.addInitScript(installNotifyProbe);
  await p.addInitScript(installSoundProbe);
  if (george) await p.addInitScript(installGeorgeProbe);
  if (noClickYet) await p.addInitScript(installNoClickYet);
  await p.addInitScript(() => {
    window.__voice.queue = [];
  });
  if (bargeIn || wordStub || devVoice) {
    await p.addInitScript(
      ({ test, stub, voice }) => {
        try {
          if (test) localStorage.setItem('jarvis.handsFreeTest.v1', test);
          if (stub) localStorage.setItem('jarvis.dev.wakeWord', 'stub');
          if (voice) localStorage.setItem('jarvis.dev.voice', voice);
        } catch {
          /* storage unavailable */
        }
      },
      { test: bargeIn ? TEST_PASSED : '', stub: wordStub, voice: devVoice ? JSON.stringify(devVoice) : '' },
    );
  }
  await t.goto('/', { page: p });
  return p;
}

async function enterStandby(t, page = t.page) {
  await (await t.visible('quick-key-standby', { page, message: 'Home offers Standby' })).click();
  await t.visible('standby', { page, message: 'Standby opens' });
  await waitListening(t, page);
}

async function wakeByClaps(t, page = t.page) {
  await play(page, DOUBLE_CLAP);
  await page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
}

/** The words the recognizer hears in its next sessions, in order ('' = nobody speaks in that one). */
const queue = (page, ...items) => page.evaluate((list) => window.__voice.queue.push(...list), items);

// ---- v8.1.1 (review 2) --------------------------------------------------------------------------------------

// The owner's setup: setup 1 (the speakerphone speaks, the Mac's microphone listens), the Test passed on it.
const SETUP1 = { audioSetup: 'speaker-mac-mic', audioInputId: 'mac-mic', audioInputLabel: 'MacBook Pro Microphone (Built-in)', audioOutputId: 'sp-out', audioOutputLabel: 'Desk Speakerphone (Bluetooth)' };
const TEST_PASSED_SETUP1 = { at: 1_800_000_000_000, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: true, measured: { setup: 'speaker-mac-mic', wakeMic: 'mac-mic', speaker: 'sp-out', clap: true, word: true } };

/**
 * George's sources (24 kHz contexts) as intervals, recognizer sessions open at once, and the recognizer started while
 * George or the device voice is audible (the owner run's checks; from the review's probe).
 */
function installTalkProbe() {
  const P = { george: [], overlapsRec: 0, recOpen: 0, recMax: 0, recWhileTalking: [] };
  window.__talk = P;
  const now = () => performance.now();
  if (window.AudioContext) {
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function probed(when = 0, offset = 0, duration) {
      try {
        const ctx = this.context;
        if (ctx && ctx.sampleRate === 24000 && this.buffer) {
          const lead = Math.max(0, (Number(when) || 0) - ctx.currentTime) * 1000;
          const len = (duration !== undefined ? Number(duration) : this.buffer.duration - (Number(offset) || 0)) * 1000;
          const rec = { from: now() + lead, to: now() + lead + len, stopped: 0 };
          this.__rec = rec;
          P.george.push(rec);
        }
      } catch {
        /* bookkeeping */
      }
      return start.apply(this, arguments);
    };
    AudioBufferSourceNode.prototype.stop = function probedStop() {
      try {
        if (this.__rec && !this.__rec.stopped) {
          this.__rec.stopped = now();
          if (this.__rec.to > this.__rec.stopped) this.__rec.to = Math.max(this.__rec.from, this.__rec.stopped);
        }
      } catch {
        /* bookkeeping */
      }
      return stop.apply(this, arguments);
    };
  }
  const talkingNow = () => {
    const t = now();
    const g = P.george.some((r) => r.from <= t && t < r.to);
    const d = (window.__voice && window.__voice.log ? window.__voice.log : []).some((e) => e.at <= t && (!e.endAt || t < e.endAt));
    return g ? 'george' : d ? 'device' : '';
  };
  const patch = () => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R || !R.prototype || R.prototype.__talkPatched) return;
    const start = R.prototype.start;
    const end = R.prototype.end;
    R.prototype.start = function s(...args) {
      if (!this.__open) {
        this.__open = true;
        P.recOpen += 1;
        P.recMax = Math.max(P.recMax, P.recOpen);
        if (P.recOpen > 1) P.overlapsRec += 1;
      }
      const talk = talkingNow();
      if (talk) P.recWhileTalking.push({ at: Math.round(now()), talk });
      return start.apply(this, args);
    };
    if (end) {
      R.prototype.end = function e(...args) {
        if (this.__open) {
          this.__open = false;
          P.recOpen -= 1;
        }
        return end.apply(this, args);
      };
    }
    R.prototype.__talkPatched = true;
  };
  patch();
  document.addEventListener('DOMContentLoaded', patch);
}

/** Two windows of one browser: A on Standby (hidden) with claps and the "Hey Jarvis" stand-in; B on the app. */
async function twoWindows(t, { speechB = {} } = {}) {
  const a = await setup(t, { wordStub: true });
  const b = await t.page.context().newPage();
  t.attachPageGuards(b);
  await setup(t, { page: b, speech: speechB });
  await (await t.visible('quick-key-standby', { page: a })).click();
  await t.waitFor(async () => (await standbyState(a))?.word === 'ready' && (await standbyState(a))?.listening === 'live', { timeout: 15000, message: 'A on Standby, claps and the stand-in ready' });
  await setHidden(a, true);
  return { a, b };
}

export default [
  // ---- A1: listening and speaking in the background ----------------------------------------------------------
  {
    name: 'mac-handsfree-hidden-wake',
    title: 'Mac, Jarvis in the background: two claps wake him; he greets, hears the question while still hidden, answers it out loud, then goes back to Standby by himself',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await setHidden(t.page, true);
      const before = await listens(t.page);
      await t.step('woken in the background: the greeting, then he listens there', async () => {
        await queue(t.page, '', QUESTION); // the wake window hears nobody; the offer's listen hears the question
        await wakeByClaps(t);
        await waitSaid(t, /Shall I put on some/);
        await t.waitFor(async () => (await listens(t.page)) >= before + 2, { message: async () => `two listens while hidden (${(await listens(t.page)) - before})` });
      });
      await t.step('the question is sent once and answered out loud, while hidden', async () => {
        await t.waitFor(() => leadCount(t) === 1, { timeout: 20000, message: 'the question to be sent' });
        await waitSaid(t, ANSWER, { timeout: 30000 });
        t.assert(await t.page.evaluate(() => document.hidden), 'still in the background');
      });
      await t.step('then quiet: back to Standby, listening, still hidden', async () => {
        await backInStandby(t, t.page, 30000);
        t.assert(leadCount(t) === 1, `one request (${leadCount(t)})`);
      });
    },
  },
  {
    name: 'mac-handsfree-hidden-mid-listen',
    title: 'Mac, a session opened by a tap: Jarvis is hidden while he listens; he keeps listening (no "Paused"), hears the question and answers it in the background',
    device: 'mac',
    timeout: 120000,
    async run(t) {
      await setup(t, { speech: { noSpeechMs: 6000 } }); // the recognizer waits for the words that come later
      await queue(t.page, { parts: [{ at: 2500, text: 'What is the capital' }, { at: 3300, revise: QUESTION }] });
      await (await t.visible('voice-open')).click();
      await waitVoice(t, 'listening');
      const sessions = await t.page.evaluate(() => window.__voice.sessions.length);
      await setHidden(t.page, true);
      await t.step('hidden mid-listen: the same listen goes on', async () => {
        await t.page.waitForTimeout(800);
        t.assert((await voiceState(t.page)) === 'listening', `still listening (${await voiceState(t.page)}, “${await voiceStatus(t.page)}”)`);
        t.assert((await t.page.evaluate(() => window.__voice.sessions.length)) === sessions, 'the recognizer was not stopped and started again');
      });
      await t.step('the question is sent and answered in the background', async () => {
        await t.waitFor(() => leadCount(t) === 1, { timeout: 20000, message: 'the question to be sent' });
        await waitSaid(t, ANSWER, { timeout: 30000 });
        t.assert(!/Paused/.test(await voiceStatus(t.page)), 'never "Paused while you were away"');
      });
    },
  },
  {
    name: 'mac-handsfree-hidden-check',
    title: 'Mac, woken: hidden during the 2-second check, the check keeps counting and sends; the answer is said; then Standby (u-mac probe C: before, nothing was sent and Standby stayed deaf)',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await queue(t.page, '', QUESTION);
      await wakeByClaps(t);
      await waitSaid(t, /Shall I put on some/);
      await t.step('the owner switches to another app during the check', async () => {
        await t.page.locator(tid('voice-review')).waitFor({ state: 'visible', timeout: 15000 });
        await setHidden(t.page, true);
        await t.waitFor(() => leadCount(t) === 1, { timeout: 8000, message: 'the check to send while hidden' });
      });
      await t.step('answered, then back to Standby', async () => {
        await waitSaid(t, ANSWER, { timeout: 30000 });
        await backInStandby(t, t.page, 30000);
      });
    },
  },
  {
    name: 'mac-handsfree-setting-off',
    title: 'Mac, "Keep talking when Jarvis is in the background" off: today’s behaviour — woken hidden he greets but doesn’t listen, the notification says to switch to Jarvis; on screen again he listens',
    device: 'mac',
    fakeMusic: true,
    settings: { handsFreeBackground: false },
    timeout: 150000,
    async run(t) {
      await setup(t);
      await t.step('the setting shows in Settings → Voice → Wake Jarvis, off', async () => {
        await (await t.visible('settings-button')).click();
        const sw = t.locator('setting-handsFreeBackground');
        await sw.scrollIntoViewIfNeeded();
        t.assert(!(await sw.isChecked()), 'off');
        await t.page.keyboard.press('Escape');
      });
      await enterStandby(t);
      await setHidden(t.page, true);
      const before = await listens(t.page);
      await wakeByClaps(t);
      await waitSaid(t, /Shall I put on some/);
      await t.page.waitForTimeout(1500);
      t.assert((await listens(t.page)) === before, 'no listening while Jarvis is not on screen');
      t.assert((await voiceState(t.page)) !== 'listening', 'not listening');
      const notes = await t.page.evaluate(() => window.__notes.map((n) => ({ title: n.title, body: n.body })));
      t.assert(notes.some((n) => /Switch to Jarvis to answer\./.test(n.body)), `today’s notification (${JSON.stringify(notes)})`);
      await setHidden(t.page, false);
      await waitVoice(t, 'listening');
      t.assert(leadCount(t) === 0, 'nothing sent');
    },
  },
  {
    name: 'mac-handsfree-iphone',
    title: 'iPhone: unchanged — hidden pauses listening ("Paused while you were away"), nothing is heard or sent in the background',
    device: 'iphone13',
    timeout: 90000,
    async run(t) {
      await setup(t, { device: 'iphone13' });
      await queue(t.page, { parts: [{ at: 2500, text: QUESTION }] });
      await (await t.visible('voice-open')).click();
      await waitVoice(t, 'listening');
      await setHidden(t.page, true);
      await t.waitFor(async () => /Paused/.test(await voiceStatus(t.page)), { timeout: 5000, message: 'Paused' });
      await t.page.waitForTimeout(3500);
      t.assert(leadCount(t) === 0, 'nothing sent from the background');
      const titles = await t.page.evaluate(() => window.__titles.slice());
      t.assert(!titles.some((x) => /Listening ·/.test(x)), `no session title on an iPhone (${JSON.stringify(titles)})`);
    },
  },
  {
    name: 'mac-handsfree-indicators',
    title: 'Mac, a hidden hands-free session says honestly what it does: the tab title (Listening, Thinking, Speaking · Jarvis), one notification ("Jarvis is listening…") closed at the end, and the listen chimes while hidden',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await setHidden(t.page, true);
      await queue(t.page, '', QUESTION);
      await wakeByClaps(t);
      await waitSaid(t, /Shall I put on some/);
      // After the wake chime: the listen chimes of the offer's listen and the ones after.
      const chimesBefore = await t.page.evaluate(() => window.__chimes.filter((c) => c.hidden).length);
      await t.waitFor(() => leadCount(t) === 1, { timeout: 30000, message: 'the question to be sent' });
      await waitSaid(t, ANSWER, { timeout: 30000 });
      await backInStandby(t, t.page, 30000);
      const titles = await t.page.evaluate(() => window.__titles.slice());
      for (const word of ['Listening', 'Thinking', 'Speaking']) t.assert(titles.includes(`${word} · Jarvis`), `“${word} · Jarvis” (${JSON.stringify(titles)})`);
      t.assert((await t.page.evaluate(() => document.title)) === 'Jarvis', 'the title is back');
      const notes = await t.page.evaluate(() => window.__notes.map((n) => ({ title: n.title, body: n.body, tag: n.tag, closed: n.closed })));
      const mine = notes.filter((n) => /Jarvis is listening/.test(n.title));
      t.assert(mine.length === 1, `one notification for the session (${JSON.stringify(notes)})`);
      t.assert(/Ask away, or say “go back to sleep”\./.test(mine[0].body), `its words (${mine[0].body})`);
      t.assert(mine[0].closed, 'closed when the session ended');
      t.assert(!notes.some((n) => /Switch to Jarvis/.test(n.body)), 'not the old “Switch to Jarvis to answer.”');
      const chimes = await t.page.evaluate(() => window.__chimes.filter((c) => c.hidden).length);
      t.assert(chimes > chimesBefore, `the listen chimes played while hidden, after the wake chime: ${chimes - chimesBefore} voices`);
    },
  },
  // ---- A3: a hidden stall hands over ---------------------------------------------------------------------------
  {
    name: 'mac-handsfree-stall-hidden',
    title: 'Mac: George’s sound stops while Jarvis is hidden (a stuck AudioContext): the Mac’s own voice says the rest, in the background, and Voice Mode listens next',
    device: 'mac',
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 150000,
    async run(t) {
      await setup(t, { george: true });
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      await queue(t.page, QUESTION);
      await (await t.visible('voice-open')).click();
      await t.waitFor(() => t.core.senses.speaks.length > 0, { timeout: 30000, message: 'George to start the answer' });
      await setHidden(t.page, true);
      await t.page.evaluate(() => window.__george.stick());
      await t.step('the Mac’s voice takes over in the background', async () => {
        await t.waitFor(async () => (await said(t.page)).length > 0, { timeout: 15000, message: 'the device voice to say the rest while hidden' });
        t.assert(await t.page.evaluate(() => document.hidden), 'still hidden');
      });
      await t.step('then Voice Mode listens (hidden, on a Mac)', async () => {
        const before = await listens(t.page);
        await t.waitFor(async () => (await listens(t.page)) > before, { timeout: 30000, message: 'a listen after the reply' });
      });
    },
  },
  // ---- A6: the follow-up window and the brake ----------------------------------------------------------------
  {
    name: 'mac-handsfree-followup-window',
    title: 'Mac, woken: after an answer Jarvis listens 8 s for a follow-up; one said within it is answered; 8 s of silence sends him back to Standby',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t, { speech: { noSpeechMs: 60000 } }); // the recognizer never gives up by itself: the 8 s window decides
      await enterStandby(t);
      await queue(t.page, '', QUESTION, { parts: [{ at: 3000, text: 'And what about Germany?' }] }, '');
      await wakeByClaps(t);
      await t.step('a follow-up 3 s into the window is answered', async () => {
        await t.waitFor(() => leadCount(t) === 2, { timeout: 60000, message: 'the follow-up to be sent' });
        await waitSaid(t, /The capital of Germany is Berlin\./, { timeout: 30000 });
      });
      await t.step('then 8 s of silence: Standby', async () => {
        // Listens: the wake window, the offer's, the first follow-up, then the one that hears nobody.
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.listenLog.length)) >= 4, { message: 'the second follow-up listen' });
        const listenAt = await t.page.evaluate(() => window.__voice.listenLog[3]);
        await backInStandby(t, t.page, 30000);
        const took = (await t.page.evaluate(() => performance.now())) - listenAt;
        t.assert(took >= 8000 && took < 16000, `back to Standby ${Math.round(took)} ms after the listen began (8 s window, then the 2.5 s return)`);
        t.assert(leadCount(t) === 2, 'nothing more was sent');
      });
    },
  },
  {
    name: 'mac-handsfree-hidden-tapped',
    title: 'Mac, a session opened by a tap, then hidden, with steady speech in the room (a TV): at most 3 questions are taken, then "Say “Hey Jarvis” when you need me." and no more listening or requests',
    device: 'mac',
    timeout: 180000,
    async run(t) {
      await setup(t);
      await (await t.visible('voice-open')).click();
      await waitVoice(t, 'listening');
      await setHidden(t.page, true);
      // The TV: a sentence in every listen from now on.
      await t.page.evaluate(() => {
        window.__voice.queue.length = 0;
        const proto = window.SpeechRecognition.prototype;
        const start = proto.start;
        proto.start = function tv(...args) {
          if (!window.__voice.queue.length) window.__voice.queue.push('What is the capital of Spain?');
          return start.apply(this, args);
        };
      });
      await waitSaid(t, /Say “Hey Jarvis” when you need me\./, { timeout: 120000 });
      const n = leadCount(t);
      t.assert(n <= 3, `at most 3 requests (${n})`);
      const listensAfter = await listens(t.page);
      await t.page.waitForTimeout(12000);
      t.assert(leadCount(t) === n, 'no more requests');
      t.assert((await listens(t.page)) === listensAfter, 'no more listening');
    },
  },
  // ---- A2: every end of a woken session goes back to Standby ------------------------------------------------
  {
    name: 'standby-session-ends',
    title: 'Every end of a woken session goes back to Standby: after the mock’s error (an apology), after a voice-input error, and after a paused 2-second check',
    device: 'mac',
    fakeMusic: true,
    timeout: 300000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await t.step('an apology (a refusal from the mock): Standby again', async () => {
        await queue(t.page, '', 'Tell me something [[refuse]]');
        await wakeByClaps(t);
        await waitSaid(t, /I’m afraid I can’t help with that one/, { timeout: 30000 });
        await backInStandby(t, t.page, 90000);
      });
      await t.step('a voice-input error (the network): Standby again', async () => {
        await t.page.evaluate(() => {
          const proto = window.SpeechRecognition.prototype;
          const start = proto.start;
          let n = 0;
          proto.start = function failing(...args) {
            const r = start.apply(this, args);
            if (++n === 2) setTimeout(() => this.onerror && this.onerror({ type: 'error', error: 'network' }), 60);
            return r;
          };
        });
        await queue(t.page, '');
        await wakeByClaps(t);
        await t.waitFor(async () => /Voice input offline/.test(await voiceStatus(t.page)), { timeout: 20000, message: 'the voice-input error' });
        await backInStandby(t, t.page, 90000);
      });
      await t.step('a paused check ("wait"): Standby again, nothing sent', async () => {
        await queue(t.page, '', { parts: [{ at: 500, text: 'What is the capital of Italy?' }, { at: 2600, text: 'wait' }] });
        const before = leadCount(t);
        await wakeByClaps(t);
        await t.waitFor(async () => /Ready when you are/.test(await voiceStatus(t.page)), { timeout: 20000, message: 'the paused check' });
        await backInStandby(t, t.page, 120000);
        t.assert(leadCount(t) === before, 'the paused words were not sent');
      });
    },
  },
  {
    name: 'standby-hold-timeout',
    title: 'A held session (a tour waiting at a decision) stays out of Standby until its cap after the owner’s last words, then goes back by itself (the 2 minutes shortened to 20 s)',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t, { devVoice: { holdCapMs: 20000 }, speech: { noSpeechMs: 60000 } });
      await enterStandby(t);
      await queue(t.page, '');
      await wakeByClaps(t);
      await waitSaid(t, /Shall I put on some/);
      const heldAt = await t.page.evaluate(() => (window.__jarvisVoice.hold('tour') ? performance.now() : -1));
      t.assert(heldAt > 0, 'held');
      await t.step('held: not back after the usual quiet (8 s window, then 2.5 s)', async () => {
        await t.page.waitForTimeout(15000);
        t.assert(await t.page.locator(tid('voice-mode')).count(), 'Voice Mode is still up 15 s after the hold');
      });
      await t.step('the cap is up: Standby, by itself', async () => {
        await backInStandby(t, t.page, 20000);
        const took = (await t.page.evaluate(() => performance.now())) - heldAt;
        t.assert(took >= 19500, `back ${Math.round(took)} ms after the hold (its cap: 20 s)`);
        t.assert(leadCount(t) === 0, 'nothing was sent');
      });
    },
  },
  // ---- A8: barge-in ------------------------------------------------------------------------------------------
  {
    name: 'mac-barge-in',
    title: 'Mac, setup 1 and the hands-free Test passed: "Hey Jarvis" while George speaks stops him and he listens; Standby’s microphone stayed on through the session',
    device: 'mac',
    fakeMusic: true,
    fakeCore: { senses: { speak: 'ready' } },
    settings: { wakeWord: true },
    timeout: 180000,
    async run(t) {
      await setup(t, { george: true, bargeIn: true, wordStub: true });
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      await (await t.visible('quick-key-standby')).click();
      await t.waitFor(async () => (await standbyState(t.page))?.word === 'ready', { timeout: 15000, message: 'the stand-in ready' });
      await queue(t.page, '', 'Tell me about solar panels [[long]]');
      const stopsBefore = await t.page.evaluate(() => window.__fakeMic.stops);
      await t.page.evaluate(() => window.__jarvisWake.say());
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
      await t.step('the microphone stays on through the session', async () => {
        await t.page.waitForTimeout(500);
        const m = await t.page.evaluate(() => ({ stops: window.__fakeMic.stops, live: window.__fakeMic.live, log: window.__fakeMic.log.slice() }));
        t.assert(m.stops === stopsBefore && m.live >= 1, `Standby’s capture was not released at the wake (${JSON.stringify(m)})`);
      });
      await t.step('while George speaks the answer, "Hey Jarvis": he stops and listens', async () => {
        await t.waitFor(() => leadCount(t) === 1, { timeout: 30000, message: 'the question to be sent' });
        await waitVoice(t, 'speaking', { timeout: 30000 });
        await t.waitFor(() => t.core.senses.speaks.length >= 2, { timeout: 30000, message: 'George well into the answer' });
        await t.page.waitForTimeout(1600); // past the wake's own 1.5 s guard
        const listensBefore = await listens(t.page);
        t.assert(await t.page.evaluate(() => window.__jarvisWake.say()), 'the stand-in heard it');
        await waitVoice(t, 'listening', { timeout: 5000 });
        t.assert((await listens(t.page)) > listensBefore, 'a new listen');
      });
    },
  },
  {
    name: 'mac-handsfree-brake-claps',
    title: 'MAC-4: Mac, setup 1 with barge-in, woken in the background by claps, a TV heard in every listen and a double bang during each of George’s answers: the claps stop him, yet at most 3 paid questions, then the brake and Standby',
    device: 'mac',
    fakeMusic: true,
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 240000,
    async run(t) {
      await setup(t, { george: true, bargeIn: true });
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      await enterStandby(t);
      await setHidden(t.page, true);
      const tv = 'Tell me about solar panels [[long]]';
      await queue(t.page, '', tv, tv, tv, tv, tv, tv, tv);
      await wakeByClaps(t);
      let bangs = 0;
      let clappedFor = 0;
      const end = Date.now() + 200000;
      while (Date.now() < end && (await t.page.locator(tid('voice-mode')).count())) {
        const n = leadCount(t);
        if (n > clappedFor && (await voiceState(t.page)) === 'speaking' && t.core.senses.speaks.length >= 2) {
          clappedFor = n;
          await t.page.waitForTimeout(1600); // George well into the answer, past the 1.5 s between two triggers
          await play(t.page, DOUBLE_CLAP);
          bangs += 1;
        }
        await t.page.waitForTimeout(250);
      }
      t.assert(bangs >= 3, `a double bang during each answer (${bangs})`);
      t.assert(leadCount(t) === 3, `at most 3 paid questions while hidden without "Hey Jarvis" or a tap (${leadCount(t)} requests, ${bangs} bangs)`);
      t.assert((await said(t.page)).some((x) => /Say “Hey Jarvis” when you need me\./.test(x)) || t.core.senses.speaks.some((s) => /when you need me/.test(s.text)), 'the brake was said');
      await t.visible('standby', { message: 'back to Standby' });
      await waitListening(t);
    },
  },
  {
    name: 'mac-barge-in-self',
    title: 'Mac, barge-in on: George says "Jarvis" and the wake detector is fed his own word at that moment — nothing interrupts him; the same detection at another word does',
    device: 'mac',
    fakeMusic: true,
    fakeCore: { senses: { speak: 'ready' } },
    settings: { wakeWord: true },
    timeout: 180000,
    async run(t) {
      await setup(t, { george: true, bargeIn: true, wordStub: true });
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      // The detector "hears" George: when the karaoke word being said is "Jarvis", the stand-in fires.
      await t.page.evaluate(() => {
        window.__selfFired = [];
        new MutationObserver(() => {
          const w = document.querySelector('[data-testid="voice-mode"] .vm-w');
          if (w && /^jarvis\b/i.test((w.textContent || '').trim()) && !window.__selfFired.includes(w)) {
            window.__selfFired.push(w);
            window.__jarvisWake.say();
          }
        }).observe(document.body, { subtree: true, childList: true, characterData: true });
      });
      await (await t.visible('quick-key-standby')).click();
      await t.waitFor(async () => (await standbyState(t.page))?.word === 'ready', { timeout: 15000, message: 'the stand-in ready' });
      await queue(t.page, '', 'Tell me about the Jarvis Core');
      await t.page.evaluate(() => window.__jarvisWake.say());
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
      await t.waitFor(() => leadCount(t) === 1, { timeout: 30000, message: 'the question to be sent' });
      await t.step('George says "Jarvis": the detection is masked', async () => {
        await t.waitFor(async () => (await t.page.evaluate(() => window.__selfFired.length)) > 0, { timeout: 30000, message: 'George to say "Jarvis"' });
        await t.page.waitForTimeout(600);
        t.assert((await voiceState(t.page)) === 'speaking', `still speaking (${await voiceState(t.page)})`);
      });
      await t.step('the same detection a few words later (outside the mask): he stops and listens', async () => {
        await t.page.waitForTimeout(1900); // past about 1 s after "Jarvis"
        t.assert((await voiceState(t.page)) === 'speaking', 'he is still answering');
        await t.page.evaluate(() => window.__jarvisWake.say());
        await waitVoice(t, 'listening', { timeout: 5000 });
      });
    },
  },
  // ---- SHOULD: A11 and A12 ------------------------------------------------------------------------------------
  {
    name: 'mac-standby-at-launch',
    title: 'Mac with "Hey Jarvis" on: after a restart (no click yet) Jarvis opens Standby by himself and says CLICK ONCE SO JARVIS CAN SPEAK; that click unlocks speech and Standby stays; an iPhone, or an address asking for something else, doesn’t open it',
    device: 'mac',
    settings: { wakeWord: true, standbyAtLaunch: '' }, // automatic (the harness seeds 'off')
    timeout: 120000,
    async run(t) {
      await setup(t, { wordStub: true, noClickYet: true });
      await t.step('Standby opens by itself at launch', async () => {
        await t.visible('standby', { message: 'Standby at launch' });
        t.note(`navigator.userActivation.hasBeenActive in the test page before any click: ${await t.page.evaluate(() => window.__activation.real())} (stood in for: false)`);
        await t.waitFor(async () => /CLICK ONCE SO JARVIS CAN SPEAK/.test(await t.text(t.locator('standby-state'))), { message: 'the click-once line' });
        await t.screenshot('1-standby-at-launch');
      });
      await t.step('the click unlocks speech; Standby stays and listens', async () => {
        await t.locator('standby').click({ position: { x: 40, y: 40 } });
        await t.page.waitForTimeout(500);
        t.assert(await t.locator('standby').isVisible(), 'still on Standby');
        t.assert(!/CLICK ONCE/.test(await t.text(t.locator('standby-state'))), 'the line is gone');
        await waitListening(t);
      });
      await t.step('an iPhone with the same settings doesn’t open it', async () => {
        const page = await t.newPage({ device: 'iphone13', settings: { wakeWord: true, standbyAtLaunch: '' } });
        await setup(t, { page });
        await page.waitForTimeout(1500);
        t.assert(!(await page.locator(tid('standby')).count()), 'no Standby at launch on an iPhone');
      });
      await t.step('a Mac opened at an address that asks for something else (?homebase=… from a notification) doesn’t open it', async () => {
        const page = await t.newPage({ device: 'mac', settings: { wakeWord: true, standbyAtLaunch: '' } });
        await page.addInitScript(installFakeMic, { wakeLock: true });
        await page.addInitScript(installNoClickYet);
        await t.goto('/?homebase=briefing', { page });
        await page.waitForTimeout(1500);
        t.assert(!(await page.locator(tid('standby')).count()), 'no Standby at launch with ?homebase=');
      });
    },
  },
  {
    name: 'mac-standby-at-launch-two-windows',
    title: 'REGRESS-1, MISSED-1: Standby at launch with a second Jarvis window on the Mac: the window opened second comes up on the app, not on a Standby that can’t listen, and waits for nothing; when the owner leaves Standby in the first, the second’s microphone stays closed and claps wake nothing there',
    device: 'mac',
    settings: { wakeWord: true, standbyAtLaunch: '' }, // automatic (the harness seeds 'off')
    timeout: 120000,
    async run(t) {
      const a = await setup(t, { wordStub: true });
      await t.step('A opens Standby by itself and listens', async () => {
        await t.visible('standby', { page: a, message: 'Standby at launch in A' });
        await waitListening(t, a);
      });
      const b = await t.page.context().newPage();
      t.attachPageGuards(b);
      await setup(t, { page: b });
      await t.step('B, opened second, comes up on the app', async () => {
        await b.waitForTimeout(2000);
        const st = await standbyState(b);
        t.assert(!st, `no Standby in B (${JSON.stringify(st)})`);
        const covered = await b.evaluate(() => {
          const c = document.querySelector('[data-testid="composer-input"]');
          if (!c) return 'no composer';
          const r = c.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return el && el.closest('[data-testid="standby"]') ? 'standby' : '';
        });
        t.assert(covered === '', `the chat isn’t covered (${covered})`);
        t.assert((await b.evaluate(() => window.__fakeMic.gets)) === 0, 'B never opened the microphone');
      });
      await t.step('the owner leaves Standby in A: B’s microphone stays closed, and claps wake nothing in B', async () => {
        await setHidden(b, true);
        await a.keyboard.press('Escape');
        await a.locator(tid('standby')).waitFor({ state: 'detached', timeout: 5000 });
        await b.waitForTimeout(1500);
        t.assert((await b.evaluate(() => window.__fakeMic.gets)) === 0, 'B’s microphone never opened');
        await play(b, DOUBLE_CLAP);
        await b.waitForTimeout(2000);
        t.assert(!(await b.locator(tid('voice-mode')).count()), 'claps wake nothing in B');
      });
    },
  },
  {
    name: 'standby-word-restart',
    title: '"Hey Jarvis" whose download failed starts again by itself with back-off (the hint says so); once the download works, Standby listens for it',
    device: 'mac',
    settings: { wakeClap: false, wakeWord: true },
    allowConsole: [/status of 503/],
    timeout: 180000,
    async run(t) {
      await setup(t);
      let failing = true;
      let asked = 0;
      await t.page.context().route('**/models/openwakeword/**', (route) => {
        asked += 1;
        return failing ? route.fulfill({ status: 503, body: 'down' }) : route.continue();
      });
      await (await t.visible('quick-key-standby')).click();
      await t.visible('standby');
      await t.step('the download fails: the hint says he tries again', async () => {
        await t.waitFor(async () => (await standbyState(t.page))?.word === 'error', { timeout: 30000, message: async () => `the wake word to fail (${JSON.stringify(await standbyState(t.page))})` });
        const st = await standbyState(t.page);
        t.assert(/couldn’t load/.test(st.hint) && /Jarvis tries again by himself\./.test(st.hint), `the hint (${st.hint})`);
        t.assert((await t.page.evaluate(() => window.__fakeMic.gets)) === 0, 'the microphone stays off meanwhile (claps are off)');
      });
      await t.step('the network is back: the next try downloads it and Standby listens for it', async () => {
        const before = asked;
        failing = false;
        await t.waitFor(async () => (await standbyState(t.page))?.word === 'ready', { timeout: 120000, message: async () => `the wake word to be ready (${JSON.stringify(await standbyState(t.page))})` });
        t.assert(asked > before, 'asked again by itself');
        await waitListening(t);
        t.assert((await standbyState(t.page)).pill === 'LISTENING ON THIS DEVICE · “HEY JARVIS”', (await standbyState(t.page)).pill);
      });
    },
  },
  // ---- A9: one Jarvis per Mac answers --------------------------------------------------------------------------
  {
    name: 'standby-one-window',
    title: 'Two Jarvis windows on one Mac: only one listens on Standby; the other says "Standby is on in another Jarvis window"; Use this window moves it; leaving gives it back',
    device: 'mac',
    timeout: 120000,
    async run(t) {
      const a = await setup(t);
      const b = await t.page.context().newPage();
      t.attachPageGuards(b);
      await setup(t, { page: b });
      await enterStandby(t, a);
      await (await t.visible('quick-key-standby', { page: b })).click();
      await t.visible('standby', { page: b });
      await t.step('the second window waits', async () => {
        await t.waitFor(async () => (await standbyState(b))?.listening === 'elsewhere', { message: async () => `B to wait (${JSON.stringify(await standbyState(b))})` });
        const st = await standbyState(b);
        t.assert(st.pill === 'NOT LISTENING IN THIS WINDOW' && /Standby is on in another Jarvis window\./.test(st.hint) && st.useHere, JSON.stringify(st));
        t.assert((await b.evaluate(() => window.__fakeMic.gets)) === 0, 'B never opened the microphone');
        await play(b, DOUBLE_CLAP);
        await b.waitForTimeout(1500);
        t.assert(!(await b.locator(tid('voice-mode')).count()), 'claps heard there wake nothing');
      });
      await t.step('Use this window', async () => {
        await b.locator(tid('standby-use-here')).click();
        await waitListening(t, b);
        await t.waitFor(async () => (await standbyState(a))?.listening === 'elsewhere', { message: 'A to step back' });
        t.assert((await a.evaluate(() => window.__fakeMic.standby)) === 0, 'A released its microphone');
        t.assert(await b.locator(tid('standby')).isVisible(), 'B is still on Standby');
      });
      // PRIVACY-7: leaving Standby turns the microphone off. The window waiting behind leaves Standby too (it
      // used to start listening by itself); it takes over by itself only when the one listening closes.
      await t.step('B leaves Standby: A leaves too, and no microphone opens there', async () => {
        const gets = await a.evaluate(() => window.__fakeMic.gets);
        await b.keyboard.press('Escape');
        await b.locator(tid('standby')).waitFor({ state: 'detached', timeout: 5000 });
        await a.locator(tid('standby')).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
        await a.waitForTimeout(1500);
        const st = await standbyState(a);
        t.assert(!st, `A left Standby too (${JSON.stringify(st)})`);
        t.assert((await a.evaluate(() => window.__fakeMic.gets)) === gets && (await a.evaluate(() => window.__fakeMic.standby)) === 0, 'A never opened the microphone');
      });
      await t.step('the window on Standby closes: the one waiting behind it takes over by itself', async () => {
        await (await t.visible('quick-key-standby', { page: b })).click();
        await waitListening(t, b);
        await (await t.visible('quick-key-standby', { page: a })).click();
        await t.waitFor(async () => (await standbyState(a))?.listening === 'elsewhere', { message: async () => `A to wait (${JSON.stringify(await standbyState(a))})` });
        await b.close();
        await waitListening(t, a);
      });
    },
  },
  // ---- review fixes (v8.1) ----------------------------------------------------------------------------------
  {
    name: 'standby-woken-sheet',
    title: 'MAC-2: a woken session ended by "open settings" keeps Standby’s place: Standby comes back by itself once Settings is closed, or after a quiet spell (shortened to 6 s) over the sheet, which stays underneath',
    device: 'mac',
    fakeMusic: true,
    timeout: 180000,
    async run(t) {
      await setup(t, { devVoice: { sheetReturnMs: 6000 } });
      await enterStandby(t);
      await t.step('woken by claps, "open settings": the line, then Settings', async () => {
        await queue(t.page, '', 'Open settings.');
        await wakeByClaps(t);
        await waitSaid(t, /Settings are open\./);
        await t.visible('settings-sheet', { message: 'Settings opens' });
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 10000 });
      });
      await t.step('Settings closed: Standby comes back and listens', async () => {
        await t.page.keyboard.press('Escape');
        await t.visible('standby', { timeout: 5000, message: 'Standby comes back once Settings is closed' });
        await waitListening(t);
      });
      await t.step('two claps wake him again; "open settings", then nobody touches anything: Standby comes back over the sheet', async () => {
        await t.page.waitForTimeout(1600); // past Standby's own 1.5 s guard
        await queue(t.page, '', 'Open settings.');
        await wakeByClaps(t);
        await t.visible('settings-sheet', { timeout: 20000, message: 'Settings opens again' });
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 10000 });
        await t.visible('standby', { timeout: 15000, message: 'Standby comes back after the quiet spell' });
        await waitListening(t);
        await t.page.locator(tid('standby')).click(); // a tap leaves Standby: Settings is still there
        await t.page.locator(tid('standby')).waitFor({ state: 'detached', timeout: 5000 });
        await t.visible('settings-sheet', { message: 'Settings stayed open under Standby' });
      });
    },
  },
  {
    name: 'standby-woken-sheet-hidden',
    title: 'MAC-2: Jarvis in the background, a woken session ended by "open settings" (nobody looks at the sheet there) goes back to Standby at once, listening; claps wake him again',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await setHidden(t.page, true);
      await queue(t.page, '', 'Open settings.');
      await wakeByClaps(t);
      await waitSaid(t, /Settings are open\./);
      await t.step('back to Standby at once, listening, still hidden', async () => {
        await backInStandby(t, t.page, 10000);
        t.assert(await t.page.evaluate(() => document.hidden), 'still in the background');
      });
      await t.step('two claps wake him again there', async () => {
        await t.page.waitForTimeout(1600);
        await queue(t.page, '');
        await wakeByClaps(t);
      });
    },
  },
  {
    name: 'standby-voice-elsewhere',
    title: 'MAC-6: two Jarvis windows, a forgotten one on Standby in the background while the owner talks to Voice Mode in the other: "Hey Jarvis, …" said to Voice Mode doesn’t wake the Standby too (one answer, one request); once Voice Mode is closed, it wakes again',
    device: 'mac',
    fakeMusic: true,
    settings: { wakeWord: true },
    timeout: 150000,
    async run(t) {
      const a = await setup(t, { wordStub: true });
      const b = await t.page.context().newPage();
      t.attachPageGuards(b);
      await setup(t, { page: b });
      await (await t.visible('quick-key-standby', { page: a })).click();
      await t.waitFor(async () => (await standbyState(a))?.word === 'ready', { timeout: 15000, message: 'A on Standby with the "Hey Jarvis" stand-in ready' });
      await setHidden(a, true);
      await queue(a, 'what is the capital of France'); // what A would hear if it woke: the rest of the sentence
      await queue(b, { parts: [{ at: 1500, text: 'Hey Jarvis, what is the capital of France?' }] });
      await (await t.visible('voice-open', { page: b })).click();
      await waitVoice(t, 'listening', { page: b });
      await t.step('"Hey Jarvis" heard by A too while B’s Voice Mode listens: A stays asleep', async () => {
        t.assert(await a.evaluate(() => window.__jarvisWake.say()), 'A’s stand-in heard it');
        await t.waitFor(() => leadCount(t) >= 1, { timeout: 20000, message: 'B to send the question' });
        await a.waitForTimeout(4000);
        t.assert(!(await a.locator(tid('voice-mode')).count()), 'A did not wake');
        t.assert(leadCount(t) === 1, `one request (${leadCount(t)})`);
        t.assert((await standbyState(a))?.listening === 'live', `A is still on Standby, listening (${JSON.stringify(await standbyState(a))})`);
      });
      await t.step('B’s Voice Mode closed: "Hey Jarvis" wakes A again', async () => {
        await b.keyboard.press('Escape');
        await b.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
        await a.evaluate(() => {
          window.__voice.queue.length = 0;
        });
        await queue(a, '');
        await a.waitForTimeout(1600);
        await a.evaluate(() => window.__jarvisWake.say());
        await a.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
      });
    },
  },
  {
    name: 'standby-voice-idle-elsewhere',
    title: 'MAC-R2-1: Voice Mode left open and idle in window B (opened by a tap, heard nobody): two claps and "Hey Jarvis" still wake the Standby in window A',
    device: 'mac',
    fakeMusic: true,
    settings: { wakeWord: true },
    timeout: 150000,
    async run(t) {
      const { a, b } = await twoWindows(t);
      await t.step('B: the owner taps Voice Mode and says nothing; it goes idle and stays open', async () => {
        await queue(b, '', '');
        await (await t.visible('voice-open', { page: b })).click();
        await t.waitFor(async () => (await voiceState(b)) === 'idle', { timeout: 30000, message: async () => `B idle (${await voiceState(b)} “${await voiceStatus(b)}”)` });
        await b.waitForTimeout(3000); // past the moment B keeps the voice lock after it went idle
      });
      await t.step('two claps to A wake A (B hears nothing)', async () => {
        await a.bringToFront(); // the tab's audio runs (a background headless tab is throttled); still reported hidden
        await setHidden(a, true);
        await a.waitForTimeout(1600);
        await queue(a, '', '');
        await play(a, DOUBLE_CLAP);
        await a.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
        t.assert((await a.locator(tid('voice-mode')).count()) > 0, `claps wake A while B’s Voice Mode sits idle (A: ${JSON.stringify(await standbyState(a))})`);
        t.assert((await voiceState(b)) === 'idle', 'B still open and idle');
        await a.keyboard.press('Escape'); // A's woken session ends: back to Standby
        await backInStandby(t, a, 20000);
      });
      await t.step('"Hey Jarvis" to A wakes A too', async () => {
        await a.waitForTimeout(1600);
        await queue(a, '', '');
        t.assert(await a.evaluate(() => window.__jarvisWake.say()), 'A’s stand-in heard "Hey Jarvis"');
        await a.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
        t.assert((await a.locator(tid('voice-mode')).count()) > 0, `"Hey Jarvis" wakes A while B’s Voice Mode sits idle (A: ${JSON.stringify(await standbyState(a))})`);
      });
    },
  },
  {
    name: 'standby-chat-mic-elsewhere',
    title: 'MAC-R2-4: the owner dictates "Hey Jarvis, what is the capital of France?" into the chat box’s microphone in window B while the Standby in window A (hidden) hears the same words: A stays asleep, one request',
    device: 'mac',
    fakeMusic: true,
    settings: { wakeWord: true },
    timeout: 120000,
    async run(t) {
      const { a, b } = await twoWindows(t, { speechB: { noSpeechMs: 6000 } });
      await queue(a, 'what is the capital of France'); // what A would hear if it woke: the rest of the sentence
      await queue(b, { parts: [{ at: 1200, text: 'Hey Jarvis, what is the capital of France?' }] });
      await (await t.visible('composer-mic', { page: b })).click();
      await b.waitForTimeout(400);
      t.assert(await a.evaluate(() => window.__jarvisWake.say()), 'A’s stand-in heard "Hey Jarvis"');
      let aWoke = false;
      for (let i = 0; i < 24; i++) {
        await b.waitForTimeout(500);
        if ((await a.locator(tid('voice-mode')).count()) > 0) aWoke = true;
      }
      t.assert(!aWoke, 'A stayed asleep');
      t.assert(leadCount(t) <= 1, `one answer for one sentence (${leadCount(t)} paid requests)`);
      t.assert((await standbyState(a))?.listening === 'live', `A is still on Standby, listening (${JSON.stringify(await standbyState(a))})`);
    },
  },
  {
    name: 'standby-woken-sheet-then-tap',
    title: 'MAC-R2-2: woken by claps, "open my history" (the sidebar: Standby waits to come back); the owner taps the voice button, asks nothing and closes Voice Mode: Standby still comes back, and claps wake him',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t, { devVoice: { sheetReturnMs: 6000 } });
      await enterStandby(t);
      await queue(t.page, '', 'Open my history.');
      await wakeByClaps(t);
      await waitSaid(t, /history is open/i, { timeout: 30000 });
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 10000 });
      await t.step('the owner taps the voice button within the quiet spell, asks nothing, closes Voice Mode', async () => {
        await queue(t.page, '', '');
        await (await t.visible('voice-open')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
        await t.waitFor(async () => (await voiceState(t.page)) === 'idle', { timeout: 30000, message: 'the tapped Voice Mode idle' });
        await t.page.keyboard.press('Escape');
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
      });
      await t.step('Standby comes back after the quiet spell, listening; claps wake him', async () => {
        await t.visible('standby', { timeout: 15000, message: 'Standby back after the tapped conversation' });
        await waitListening(t);
        await t.page.waitForTimeout(1600);
        await queue(t.page, '');
        await wakeByClaps(t);
      });
    },
  },
  {
    name: 'mac-handsfree-brake-claps-wakes',
    title: 'MAC-R2-3: hidden, a TV heard in every listen, and a false double bang each time Jarvis is back on Standby (claps wake, no barge-in): the brake holds across wakes — at most 3 paid questions over three wakes',
    device: 'mac',
    fakeMusic: true,
    timeout: 400000,
    async run(t) {
      await setup(t, { speech: { noSpeechMs: 6000 } });
      await enterStandby(t);
      await setHidden(t.page, true);
      // The TV: a sentence in every listen from now on.
      await t.page.evaluate(() => {
        window.__voice.queue.length = 0;
        const proto = window.SpeechRecognition.prototype;
        const start = proto.start;
        proto.start = function tv(...args) {
          if (!window.__voice.queue.length) window.__voice.queue.push('What is the capital of Spain?');
          return start.apply(this, args);
        };
      });
      const cycles = [];
      for (let c = 1; c <= 3; c++) {
        await waitListening(t, t.page, 60000);
        await t.page.waitForTimeout(1700);
        const before = leadCount(t);
        await play(t.page, DOUBLE_CLAP);
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 10000 });
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 120000 });
        const brakes = (await said(t.page)).filter((x) => /when you need me/.test(x)).length;
        cycles.push({ cycle: c, requests: leadCount(t) - before, brakesSaidSoFar: brakes });
      }
      t.note(`cycles: ${JSON.stringify(cycles)}`);
      t.assert(leadCount(t) <= 3, `at most 3 paid questions while hidden without "Hey Jarvis" or a tap (got ${leadCount(t)}: ${JSON.stringify(cycles)})`);
      t.assert(cycles.every((x) => x.brakesSaidSoFar >= x.cycle), `each wake ends with the brake line (${JSON.stringify(cycles)})`);
      await waitListening(t, t.page, 60000); // and he is back on Standby, listening
    },
  },
  {
    // Ported from the verify's r3-mac-brake-claps-heyjarvis.
    name: 'mac-handsfree-brake-claps-heyjarvis',
    title: 'MAC-R3-1: after the brake (hidden, a TV), the owner claps twice and says "Hey Jarvis, what is the capital of France?" in one breath (Standby takes the claps; the wake window hears the words), then asks again: answered, not braked',
    device: 'mac',
    fakeMusic: true,
    timeout: 300000,
    async run(t) {
      await setup(t, { speech: { noSpeechMs: 6000 } });
      await enterStandby(t);
      await setHidden(t.page, true);
      await t.page.evaluate(() => {
        window.__voice.queue.length = 0;
        window.__tv = true;
        const proto = window.SpeechRecognition.prototype;
        const start = proto.start;
        proto.start = function tv(...args) {
          if (window.__tv && !window.__voice.queue.length) window.__voice.queue.push('What is the capital of Spain?');
          return start.apply(this, args);
        };
      });
      // A false double bang: the TV runs up 3 paid questions, then the brake, then Standby.
      await waitListening(t, t.page, 60000);
      await t.page.waitForTimeout(1700);
      await play(t.page, DOUBLE_CLAP);
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 10000 });
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 120000 });
      const afterBrake = leadCount(t);
      const brakes1 = (await said(t.page)).filter((x) => /when you need me/.test(x)).length;
      t.note(`after the brake: ${afterBrake} paid, brake lines ${brakes1}`);
      // The owner: two claps and "Hey Jarvis, …" in one breath, then the question again in the offer's listen. The TV
      // is off now.
      await waitListening(t, t.page, 60000);
      await t.page.waitForTimeout(1700);
      await t.page.evaluate(() => {
        window.__tv = false;
        window.__voice.queue.length = 0;
        window.__voice.queue.push('Hey Jarvis, what is the capital of France?', 'What is the capital of France?');
      });
      await play(t.page, DOUBLE_CLAP);
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 10000 });
      await t.waitFor(async () => leadCount(t) > afterBrake || (await said(t.page)).filter((x) => /when you need me/.test(x)).length > brakes1, { timeout: 90000, message: 'an answer or the brake line again' });
      const brakes = (await said(t.page)).filter((x) => /when you need me/.test(x)).length;
      t.note(`claps + "Hey Jarvis": paid ${leadCount(t) - afterBrake}, brake lines ${brakes} (was ${brakes1})`);
      t.assert(leadCount(t) > afterBrake && brakes === brakes1, `the owner said "Hey Jarvis": the question is answered and no brake line (paid ${leadCount(t) - afterBrake}, brake lines ${brakes1} -> ${brakes})`);
    },
  },
  {
    name: 'mac-handsfree-brake-claps-free',
    title: 'MAC-R3-3: after the brake (hidden, a TV), a claps wake still carries out a free command ("play Back in Black": the Music card, no Claude request, no brake line), and a question in the same braked state gets the brake line and is not sent',
    device: 'mac',
    fakeMusic: true,
    timeout: 300000,
    async run(t) {
      await setup(t, { speech: { noSpeechMs: 6000 } });
      await enterStandby(t);
      await setHidden(t.page, true);
      await t.page.evaluate(() => {
        window.__voice.queue.length = 0;
        window.__tv = true;
        const proto = window.SpeechRecognition.prototype;
        const start = proto.start;
        proto.start = function tv(...args) {
          if (window.__tv && !window.__voice.queue.length) window.__voice.queue.push('What is the capital of Spain?');
          return start.apply(this, args);
        };
      });
      await waitListening(t, t.page, 60000);
      await t.page.waitForTimeout(1700);
      await play(t.page, DOUBLE_CLAP);
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 10000 });
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 120000 });
      const afterBrake = leadCount(t);
      const brakes1 = (await said(t.page)).filter((x) => /when you need me/.test(x)).length;
      t.assert(afterBrake <= 3 && brakes1 >= 1, `the TV braked him (${afterBrake} paid, ${brakes1} brake lines)`);
      await t.step('braked, claps and "play Back in Black" in the offer’s listen: the Music card, nothing paid, no brake line', async () => {
        await waitListening(t, t.page, 60000);
        await t.page.waitForTimeout(1700);
        await t.page.evaluate(() => {
          window.__tv = false;
          window.__voice.queue.length = 0;
          window.__voice.queue.push('', 'Play Back in Black.');
        });
        await play(t.page, DOUBLE_CLAP);
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 10000 });
        await t.page.locator(tid('music-card')).last().waitFor({ state: 'attached', timeout: 30000 });
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 120000 });
        const brakes = (await said(t.page)).filter((x) => /when you need me/.test(x)).length;
        t.assert(leadCount(t) === afterBrake, `nothing paid (${leadCount(t) - afterBrake})`);
        t.assert(brakes === brakes1, `no brake line for a free command (${brakes1} -> ${brakes})`);
      });
      await t.step('still braked: claps and a question get the brake line, nothing sent', async () => {
        await waitListening(t, t.page, 60000);
        await t.page.waitForTimeout(1700);
        await t.page.evaluate(() => {
          window.__voice.queue.length = 0;
          window.__voice.queue.push('', 'What is the capital of Italy?');
        });
        const brakes0 = (await said(t.page)).filter((x) => /when you need me/.test(x)).length;
        await play(t.page, DOUBLE_CLAP);
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 10000 });
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 120000 });
        const brakes = (await said(t.page)).filter((x) => /when you need me/.test(x)).length;
        t.assert(leadCount(t) === afterBrake, `nothing paid (${leadCount(t) - afterBrake})`);
        t.assert(brakes > brakes0, 'the brake line');
      });
    },
  },
  {
    // Ported from the verify's r3-mac-woken-sheet-tap-left-open.
    name: 'standby-woken-sheet-tap-left-open',
    title: 'MAC-R3-4: woken by claps, "open my history"; the owner taps the voice button, asks nothing, leaves the idle Voice Mode open and switches away (Jarvis hidden): it closes and Standby comes back, listening',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t, { devVoice: { sheetReturnMs: 6000 } });
      await enterStandby(t);
      await queue(t.page, '', 'Open my history.');
      await wakeByClaps(t);
      await waitSaid(t, /history is open/i, { timeout: 30000 });
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 10000 });
      await queue(t.page, '', '');
      await (await t.visible('voice-open')).click();
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
      await t.waitFor(async () => (await voiceState(t.page)) === 'idle', { timeout: 30000, message: 'the tapped Voice Mode idle' });
      await setHidden(t.page, true); // the owner walks away, Voice Mode left open
      await t.waitFor(async () => (await standbyState(t.page))?.listening === 'live', {
        timeout: 15000,
        message: async () => `Standby back and listening (${JSON.stringify(await standbyState(t.page))}; Voice Mode open ${(await t.page.locator(tid('voice-mode')).count()) > 0})`,
      });
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 }); // the idle Voice Mode closed
    },
  },
  {
    name: 'mac-handsfree-owner-10x',
    title: 'The owner’s setup, ten rounds: setup 1 (the speakerphone speaks, the Mac’s microphone listens), the Test passed, George, Jarvis hidden the whole time; wake by claps or "Hey Jarvis", ask, answer, barge-in by "Hey Jarvis", claps or none, follow-up, back to Standby: never deaf, never stuck, never two listens at once, never talking over himself',
    device: 'mac',
    fakeMusic: true,
    fakeCore: { senses: { speak: 'ready' } },
    settings: { wakeWord: true, ...SETUP1 },
    timeout: 1500000,
    async run(t) {
      const page = await t.newPage({ device: 'mac', settings: { ...t.scenario.settings, ...GEORGE } });
      await page.addInitScript(installFakeSpeech, { noSpeechMs: 60000 });
      await page.addInitScript(installFakeMic, { wakeLock: true });
      await page.addInitScript(installAudioFakes, {});
      await page.addInitScript(installTalkProbe);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await page.addInitScript(
        ({ test }) => {
          try {
            localStorage.setItem('jarvis.handsFreeTest.v1', test);
            localStorage.setItem('jarvis.dev.wakeWord', 'stub');
          } catch {
            /* storage unavailable */
          }
        },
        { test: JSON.stringify(TEST_PASSED_SETUP1) },
      );
      await t.goto('/', { page });
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
      await (await t.visible('quick-key-standby', { page })).click();
      await t.waitFor(async () => (await standbyState(page))?.word === 'ready' && (await standbyState(page))?.listening === 'live', { timeout: 20000, message: 'Standby with the stand-in ready' });
      await setHidden(page, true);
      const speaks = () => t.core.senses.speaks.map((x) => x.text);
      const sayNow = (text) => page.evaluate((x) => window.__voice.say(x), text);
      const waitState = async (st, timeout = 30000) => t.waitFor(async () => (await voiceState(page)) === st, { timeout, message: async () => `Voice Mode ${st} (${await voiceState(page)} “${await voiceStatus(page)}”)` });
      const results = [];
      const countries = ['France', 'Spain', 'Italy', 'Germany', 'Japan', 'Portugal', 'Canada', 'Egypt', 'Norway', 'Sweden', 'Ireland', 'Australia'];
      for (let round = 1; round <= 10; round++) {
        const r = { round, wake: round % 2 ? 'claps' : 'word', barge: ['word', 'clap', 'none'][round % 3], ok: true, notes: [] };
        const lead0 = leadCount(t);
        const sp0 = t.core.senses.speaks.length;
        try {
          await waitListening(t, page, 30000);
          await page.waitForTimeout(1700);
          if (r.wake === 'claps') {
            await play(page, DOUBLE_CLAP);
            await page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 10000 });
            await t.waitFor(() => speaks().slice(sp0).some((x) => /Shall I|Good (?:morning|afternoon|evening)|Welcome/.test(x)), { timeout: 30000, message: 'the greeting' });
            await waitState('listening', 30000);
            await page.waitForTimeout(300);
            await sayNow('Tell me about solar panels [[long]]');
          } else {
            await page.evaluate(() => window.__jarvisWake.say());
            await page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 10000 });
            await waitState('listening', 15000); // the wake window: one breath
            await sayNow('Tell me about solar panels [[long]]');
          }
          await t.waitFor(() => leadCount(t) === lead0 + 1, { timeout: 30000, message: 'the question sent once' });
          await t.waitFor(() => speaks().slice(sp0).some((x) => /detailed guide/.test(x)), { timeout: 30000, message: 'George starts the answer' });
          if (r.barge !== 'none') {
            await page.waitForTimeout(2200);
            const st = await voiceState(page);
            if (st !== 'speaking') r.notes.push(`not speaking at barge-in (${st})`);
            if (r.barge === 'word') await page.evaluate(() => window.__jarvisWake.say());
            else await play(page, DOUBLE_CLAP);
            await waitState('listening', 8000);
            await page.waitForTimeout(300);
            await sayNow(`What is the capital of ${countries[round]}?`);
            await t.waitFor(() => leadCount(t) === lead0 + 2, { timeout: 30000, message: 'the follow-up sent once' });
            await t.waitFor(() => speaks().slice(sp0).some((x) => /The capital of/.test(x)), { timeout: 30000, message: 'George answers the follow-up' });
          }
          await page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 60000 }); // nobody speaks: back by himself
          await waitListening(t, page, 20000);
          r.leads = leadCount(t) - lead0;
          const P = await page.evaluate(() => ({ recMax: window.__talk.recMax, recOpen: window.__talk.recOpen }));
          const expected = r.barge === 'none' ? 1 : 2;
          if (r.leads !== expected) {
            r.ok = false;
            r.notes.push(`requests ${r.leads}, expected ${expected}`);
          }
          if (P.recMax > 1) {
            r.ok = false;
            r.notes.push(`two recognizer sessions open at once (max ${P.recMax})`);
          }
        } catch (err) {
          r.ok = false;
          r.notes.push(`FAILED: ${String(err && err.message ? err.message : err).slice(0, 300)}`);
          results.push(r);
          await t.screenshot(`round-${round}-failed`);
          break;
        }
        results.push(r);
      }
      const talk = await page.evaluate(() => {
        const g = window.__talk.george.map((x) => [x.from, x.to]).sort((a, b) => a[0] - b[0]);
        const d = (window.__voice.log || []).map((e) => [e.at, e.endAt || e.at]);
        let gg = 0;
        for (let i = 1; i < g.length; i++) if (g[i][0] < g[i - 1][1] - 50) gg += 1;
        let gd = 0;
        for (const [a, b] of d) for (const [c, e] of g) if (a < e - 50 && c < b - 50) gd += 1;
        return { georgeSources: g.length, georgeOverGeorge: gg, georgeOverDevice: gd, recWhileTalking: window.__talk.recWhileTalking.length };
      });
      t.note(`rounds: ${JSON.stringify(results.map((x) => ({ round: x.round, wake: x.wake, barge: x.barge, ok: x.ok, leads: x.leads, notes: x.notes })))}; talk: ${JSON.stringify(talk)}`);
      const bad = results.filter((x) => !x.ok);
      t.assert(results.length === 10 && !bad.length, `10 of 10 rounds (${results.length}, failed: ${JSON.stringify(bad)})`);
      t.assert(talk.georgeOverGeorge === 0 && talk.georgeOverDevice === 0, `never talking over himself (${JSON.stringify(talk)})`);
    },
  },
];
