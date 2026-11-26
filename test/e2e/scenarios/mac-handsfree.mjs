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
import { setHidden } from './optics.mjs';
import * as S from '../../unit/wake.signals.mjs';

const pad = (x, before = 0.4, after = 0.9) => S.concat(S.silence(before), x, S.silence(after));
const DOUBLE_CLAP = Array.from(pad(S.doubleClap({ gapMs: 420, at: 0.2, seconds: 1.0, peakDb: -10 })));
const QUESTION = 'What is the capital of France?';
const ANSWER = /The capital of France is Paris\./;
const GEORGE = { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'owner' };
// Barge-in's gate (A8): setup 1 chosen, the hands-free Test's self-trigger step passed (mac-dev writes both).
const BARGE_IN = { audioSetup: 'speaker-mac-mic' };
const TEST_PASSED = JSON.stringify({ at: 1_800_000_000_000, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: true });

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
      await t.step('B leaves Standby: A listens again by itself', async () => {
        await b.keyboard.press('Escape');
        await b.locator(tid('standby')).waitFor({ state: 'detached', timeout: 5000 });
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
];
