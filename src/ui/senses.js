// Hearing and voice through the home base (v7.7, beta, SPEC §25): the app's one view of Jarvis Core's
// api/senses, and the gate the listening and speaking paths ask before they use it.
//
//   const senses = createSenses({ getSettings, onSettingsChange });
//   senses.getState()        { phase: 'unset'|'idle'|'loading'|'ready'|'failed', senses, problem, at }
//   senses.load({ force })   GET api/senses (at most every 10 s unless forced; one at a time)
//   senses.save(patch)       PUT api/senses ({ hear: { enabled, model }, speak: { enabled } })
//   senses.canHear()         this device may hear through the home base right now (synchronous: the
//   senses.canSpeak()        listening and speaking paths decide inside the owner's tap)
//   senses.hear(wav, opts)   POST api/hear  -> { ok, text, … } | failure (a failure starts a cool-down)
//   senses.speak(args, opts) POST api/speak -> { ok, pcm, sampleRate } | failure (likewise)
//   senses.noteFailure(which, kind) / noteSuccess(which)
//   senses.watch()           keep it fresh while something shows it (polls every 2 s while a model
//                            downloads or gets ready); returns a function that stops watching
//   senses.warmVoice()       v7.8: PUT api/senses { speak: { enabled: true } } so the Core loads George
//                            (or keeps him loaded) before the first reply: when Voice Mode opens and when
//                            the app comes to the front; at most every 3 minutes, never when just used
//                            v7.8: a reading that finds George off at the home base while this device's
//                            switch is on turns him on there again (the same PUT; at most every 3 minutes):
//                            each device's off switch is its own, so only something else turned him off
//   senses.subscribe(fn)     fn(state) on every change; returns unsubscribe
//
// Opt-in twice over: nothing is asked of the home base unless a home base is linked AND this device
// turned hearing or voice on (settings homeBaseHear / homeBaseSpeak, Settings → Home base → Hearing and
// voice (beta)), or the Settings card is open. Off, every listen and every reply is exactly as before.
// A failure (the home base unreachable, slower than 4 s, an error) keeps this device on its own
// recognizer and voice for a minute; the next use after that tries the home base again.

import { getSenses, putSenses, hearWav, speakText } from '../platform/senses.js';
import { sensesProblem, senseReady, encodeWav, HEAR_SAMPLE_RATE } from '../lib/senses.js';

const MIN_LOAD_MS = 10000;
const STALE_MS = 5 * 60 * 1000; // an older reading is used, but read again in the background
const COOL_MS = 60 * 1000; // after a failure, this device's own recognizer / voice for this long
const POLL_MS = 2000;
// The home base unloads its models after 30 minutes idle: a part not used for this long is warmed up
// when Voice Mode opens (a moment of silence to hear, one word to say), so the first words fit in 4 s.
const WARM_AFTER_MS = 25 * 60 * 1000;
const WARM_TIMEOUT_MS = 30000;
// v7.8: the voice is warmed with the Core's own warm-up path (PUT speak enabled:true: it loads an unloaded
// model in the background; Core 1.2.2 also restarts a loaded one's idle time). The Core allows 60 of those
// an hour, so at most one every 3 minutes, and none within 3 minutes of George speaking.
const WARM_VOICE_MS = 3 * 60 * 1000;

function safeCall(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] home base senses:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

export function createSenses({ getSettings, onSettingsChange, client = { getSenses, putSenses, hearWav, speakText }, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  const settings = () => safeCall(() => (typeof getSettings === 'function' ? getSettings() : {}) || {}, {});
  const base = () => {
    const url = settings().homeBaseUrl;
    return typeof url === 'string' ? url : '';
  };
  let st = { phase: base() ? 'idle' : 'unset', senses: null, problem: null, at: 0, url: base() };
  const failures = { hear: null, speak: null };
  const lastOk = { hear: 0, speak: 0 };
  const warming = { hear: null, speak: null };
  let lastVoiceWarm = 0;
  let reviving = null;
  let lastRevive = 0;
  const listeners = new Set();
  let inflight = null;
  let lastTry = 0;
  let watchers = 0;
  let pollTimer = 0;

  function set(patch) {
    st = { ...st, ...patch };
    for (const fn of Array.from(listeners)) safeCall(() => fn(st));
  }

  if (typeof onSettingsChange === 'function') {
    safeCall(() =>
      onSettingsChange(() => {
        const url = base();
        if (url === st.url) return;
        // Linked to another home base (or unlinked): nothing known about it yet.
        failures.hear = failures.speak = null;
        set({ url, phase: url ? 'idle' : 'unset', senses: null, problem: null, at: 0 });
      }),
    );
  }

  function load({ force = false } = {}) {
    const url = base();
    if (!url) {
      set({ url, phase: 'unset', senses: null, problem: null });
      return Promise.resolve(st);
    }
    if (inflight) return inflight;
    if (!force && now() - lastTry < MIN_LOAD_MS) return Promise.resolve(st);
    lastTry = now();
    if (!st.senses) set({ phase: 'loading' });
    inflight = Promise.resolve()
      .then(() => client.getSenses(url))
      .catch(() => ({ ok: false, kind: 'error' }))
      .then((r) => {
        inflight = null;
        if (base() !== url) return st; // the address changed meanwhile
        if (r && r.ok) {
          set({ phase: 'ready', senses: r.senses, problem: null, at: now() });
          reviveVoice();
        } else set({ phase: 'failed', problem: sensesProblem(r), ...(r && r.kind === 'http' && r.status === 404 ? { senses: null } : {}) });
        armPoll();
        return st;
      });
    return inflight;
  }

  async function save(patch) {
    const url = base();
    if (!url) return { ok: false, kind: 'unset' };
    const r = await Promise.resolve()
      .then(() => client.putSenses(url, patch))
      .catch(() => ({ ok: false, kind: 'error' }));
    if (base() !== url) return r;
    if (r && r.ok) {
      // Turned on again here: the last failure no longer holds this device back.
      if (patch && patch.hear && patch.hear.enabled) failures.hear = null;
      if (patch && patch.speak && patch.speak.enabled) failures.speak = null;
      set({ phase: 'ready', senses: r.senses, problem: null, at: now() });
    } else set({ problem: sensesProblem(r) });
    armPoll();
    return r;
  }

  function cooling(which) {
    const f = failures[which];
    return !!f && now() - f.at < COOL_MS;
  }

  function usable(which) {
    const s = settings();
    const on = which === 'hear' ? s.homeBaseHear === true : s.homeBaseSpeak === true;
    if (!on || !base() || cooling(which)) return false;
    if (!st.senses || now() - st.at > STALE_MS) load(); // read it again in the background
    return senseReady(st.senses, which);
  }

  function noteFailure(which, kind) {
    if (which !== 'hear' && which !== 'speak') return;
    failures[which] = { at: now(), kind: String(kind || 'error') };
    set({ failures: { ...failures } });
  }

  function noteSuccess(which) {
    if (!failures[which]) return;
    failures[which] = null;
    set({ failures: { ...failures } });
  }

  async function hear(wav, opts = {}) {
    const url = base();
    if (!url) return { ok: false, kind: 'unset' };
    const r = await Promise.resolve()
      .then(() => client.hearWav(url, wav, opts))
      .catch(() => ({ ok: false, kind: 'error' }));
    if (r && r.ok) {
      lastOk.hear = now();
      noteSuccess('hear');
    } else if (r && r.kind !== 'aborted') noteFailure('hear', r.kind);
    return r;
  }

  async function speak(args, opts = {}) {
    const url = base();
    if (!url) return { ok: false, kind: 'unset' };
    const r = await Promise.resolve()
      .then(() => client.speakText(url, args, opts))
      .catch(() => ({ ok: false, kind: 'error' }));
    if (r && r.ok) {
      lastOk.speak = now();
      noteSuccess('speak');
    } else if (r && r.kind !== 'aborted' && r.kind !== 'empty') noteFailure('speak', r.kind);
    return r;
  }

  // While a model downloads or gets ready and something shows it, read it every 2 s.
  function settling() {
    const s = st.senses;
    if (!s) return false;
    const busy = (p) => p.enabled && (p.state === 'downloading' || p.state === 'loading' || p.state === 'warming');
    return busy(s.hear) || busy(s.speak);
  }

  function armPoll() {
    clearTimer(pollTimer);
    pollTimer = 0;
    if (!watchers || !settling() || !base()) return;
    pollTimer = setTimer(() => {
      pollTimer = 0;
      if (watchers) load({ force: true });
    }, POLL_MS);
  }

  function watch() {
    watchers += 1;
    load({ force: true });
    let on = true;
    return () => {
      if (!on) return;
      on = false;
      watchers = Math.max(0, watchers - 1);
      if (!watchers) {
        clearTimer(pollTimer);
        pollTimer = 0;
      }
    };
  }

  /**
   * Voice Mode opened: hearing, when on and ready but unused for 25 minutes, hears a moment of silence
   * (the Core loads Whisper again); the voice is warmed with warmVoice() (v7.8: before, one word was said).
   */
  function warm() {
    const s = settings();
    const url = base();
    if (!url) return;
    warmVoice();
    for (const which of ['hear']) {
      const on = s.homeBaseHear === true;
      if (!on || warming[which] || cooling(which) || !senseReady(st.senses, which) || (lastOk[which] && now() - lastOk[which] < WARM_AFTER_MS)) continue;
      const ask = () => client.hearWav(url, encodeWav(new Float32Array(Math.round(HEAR_SAMPLE_RATE * 0.4)), HEAR_SAMPLE_RATE), { timeoutMs: WARM_TIMEOUT_MS });
      warming[which] = Promise.resolve()
        .then(ask)
        .then((r) => {
          if (r && r.ok) lastOk[which] = now(); // a failed warm-up rests nothing: the real request decides
        })
        .catch(() => {})
        .then(() => {
          warming[which] = null;
        });
    }
  }

  /**
   * v7.8: this device's switch is on (the owner wants George here), but the home base's reading says his
   * voice is off there: turned off on the Alienware, or by an older Jarvis on another device (v7.8's own
   * switches turn him off only on their device; the home base's George is shared). Turn him on there
   * again (PUT speak enabled:true: the Core loads him, downloading only if he isn't on disk), at most once
   * every 3 minutes, never for a Core without its speech software. Until he is ready, this device's own
   * voices speak. Returns whether it asked.
   */
  function reviveVoice() {
    const s = settings();
    const url = base();
    const v = st.senses;
    if (!url || s.homeBaseSpeak !== true || reviving || !v || !v.speak || v.speak.enabled !== false) return false;
    if (v.deps && v.deps.installed === false) return false;
    if (lastRevive && now() - lastRevive < WARM_VOICE_MS) return false;
    lastRevive = now();
    reviving = save({ speak: { enabled: true } })
      .catch(() => {})
      .then(() => {
        reviving = null;
      });
    return true;
  }

  /**
   * v7.8: have the home base load George before he is needed (Voice Mode opening, the app coming to the
   * front). Only while this device uses him, the home base has him on and downloaded (off there, the
   * reading turns him on again: reviveVoice), not resting after a failure, and neither warmed nor heard in
   * the last 3 minutes. Returns whether it asked.
   */
  function warmVoice() {
    const s = settings();
    const url = base();
    if (!url || s.homeBaseSpeak !== true || warming.speak || cooling('speak')) return false;
    if (!senseReady(st.senses, 'speak')) return false;
    if ((lastVoiceWarm && now() - lastVoiceWarm < WARM_VOICE_MS) || (lastOk.speak && now() - lastOk.speak < WARM_VOICE_MS)) return false;
    lastVoiceWarm = now();
    warming.speak = Promise.resolve()
      .then(() => client.putSenses(url, { speak: { enabled: true } }, { timeoutMs: WARM_TIMEOUT_MS }))
      .then((r) => {
        if (r && r.ok && base() === url) set({ phase: 'ready', senses: r.senses, problem: null, at: now() });
      })
      .catch(() => {})
      .then(() => {
        warming.speak = null;
      });
    return true;
  }

  return {
    getState: () => st,
    base,
    load,
    save,
    canHear: () => usable('hear'),
    canSpeak: () => usable('speak'),
    cooling,
    hear,
    speak,
    noteFailure,
    noteSuccess,
    watch,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * At launch with hearing or voice on: one reading, so the first listen or reply can use it.
     * { warm: true } (Voice Mode opening): then a part unused for 25 minutes is warmed up.
     */
    prime({ warm: andWarm = false, voice = false } = {}) {
      const s = settings();
      if (!base() || (s.homeBaseHear !== true && s.homeBaseSpeak !== true)) return;
      const p = load();
      if (andWarm) Promise.resolve(p).then(() => warm());
      else if (voice) Promise.resolve(p).then(() => warmVoice()); // v7.8: the app came to the front
    },
    warm,
    warmVoice,
    reviveVoice,
  };
}
