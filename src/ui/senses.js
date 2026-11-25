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
//   senses.subscribe(fn)     fn(state) on every change; returns unsubscribe
//
// Opt-in twice over: nothing is asked of the home base unless a home base is linked AND this device
// turned hearing or voice on (settings homeBaseHear / homeBaseSpeak, Settings → Home base → Hearing and
// voice (beta)), or the Settings card is open. Off, every listen and every reply is exactly as before.
// A failure (the home base unreachable, slower than 4 s, an error) keeps this device on its own
// recognizer and voice for a minute; the next use after that tries the home base again.

import { getSenses, putSenses, hearWav, speakText } from '../platform/senses.js';
import { sensesProblem, senseReady } from '../lib/senses.js';

const MIN_LOAD_MS = 10000;
const STALE_MS = 5 * 60 * 1000; // an older reading is used, but read again in the background
const COOL_MS = 60 * 1000; // after a failure, this device's own recognizer / voice for this long
const POLL_MS = 2000;

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
        if (r && r.ok) set({ phase: 'ready', senses: r.senses, problem: null, at: now() });
        else set({ phase: 'failed', problem: sensesProblem(r), ...(r && r.kind === 'http' && r.status === 404 ? { senses: null } : {}) });
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
    if (r && r.ok) noteSuccess('hear');
    else if (r && r.kind !== 'aborted') noteFailure('hear', r.kind);
    return r;
  }

  async function speak(args, opts = {}) {
    const url = base();
    if (!url) return { ok: false, kind: 'unset' };
    const r = await Promise.resolve()
      .then(() => client.speakText(url, args, opts))
      .catch(() => ({ ok: false, kind: 'error' }));
    if (r && r.ok) noteSuccess('speak');
    else if (r && r.kind !== 'aborted' && r.kind !== 'empty') noteFailure('speak', r.kind);
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
    /** At launch with hearing or voice on: one reading, so the first listen or reply can use it. */
    prime() {
      const s = settings();
      if (base() && (s.homeBaseHear === true || s.homeBaseSpeak === true)) load();
    },
  };
}
