// One Jarvis per Mac answers (v8.1, SPEC §28.5, A9). With hands-free listening in the background (A1), the
// installed app and a forgotten Jarvis tab would both answer "Hey Jarvis" and both pay. So Standby takes a
// Web Lock before it listens, and keeps it through a woken session; another window waits behind it and says
// so ("Standby is on in another Jarvis window", with Use this window).
//
//   const lock = createStandbyLock({ onChange, locks, name });
//   lock.acquire()  ask for it: 'held' when it is free; otherwise 'elsewhere' (another window holds it),
//                   waiting in line: onChange('held') once that window closes, or onChange('left') when the owner
//                   left Standby there (PRIVACY-7: this one leaves Standby too; nothing listens)
//   lock.take()     "Use this window": take it from the window holding it now (Web Locks' steal: the
//                   browser takes it from that window at once, ahead of any other window waiting); that
//                   window is told (its lock request fails with AbortError) and steps back to 'elsewhere',
//                   waiting in line behind this one
//   lock.release()  let go (Standby left, or the woken session is over without a return); stops waiting too.
//                   The windows waiting behind are told 'left', not 'held'
//   lock.state      'off' | 'asking' | 'held' | 'elsewhere' | 'left' | 'unsupported'
//   onChange(state) on every change of state
//
// PRIVACY-7: leaving Standby turns the microphone off, in every window. Only a holder's window closing (the
// browser lets go of its locks) hands Standby on by itself. A holder that lets go on purpose first holds the
// "left" lock (`<name>-off`, shared) for LEFT_MS; a window granted the lock from the line checks it: held, the
// window ahead left Standby, so this one holds it too (for the next in line) and lets go: 'left'. Free, the
// window ahead closed: 'held'. The lock manager orders both, so there is no race with a message. The owner
// opening Standby (acquire) or pressing Use this window (take) clears an earlier mark.
// Without Web Locks: 'unsupported' at once; Standby listens as before (each window decides alone).
// The lock covers the windows of one browser profile on one device (Web Locks are per origin and storage).
//
// MAC-6: Voice Mode open in any window counts as "Jarvis is busy here". It holds VOICE_LOCK (shared: one per
// window) for its life, and Standby asks before it wakes, so a forgotten tab on Standby doesn't answer the owner
// talking to Voice Mode in another window (two voices, two paid requests):
//   const close = holdVoiceLock({ locks });   Voice Mode opened; close() when it closes (a closed window lets go too)
//   voiceOpenSomewhere({ locks })             Promise<boolean>: Voice Mode is open in some window (false without
//                                             Web Locks: as before)
//
// REGRESS-1: Standby at launch (A11) opens only where it can listen. app.js asks standbyHeldSomewhere({ locks })
// (Promise<boolean>, read-only: navigator.locks.query()) before opening it, and a launch that still finds Standby
// held elsewhere steps back (standby.js) instead of covering the window with a Standby that can't listen.

export const STANDBY_LOCK = 'jarvis-standby';
export const VOICE_LOCK = 'jarvis-voice';
const LEFT_MS = 10000; // PRIVACY-7: how long "the owner left Standby" is kept for the windows waiting behind

/** setTimeout that doesn't keep a Node process alive (tests); the same as setTimeout in a page. */
function later(fn, ms) {
  const t = setTimeout(fn, ms);
  if (t && typeof t === 'object' && typeof t.unref === 'function') t.unref();
  return t;
}

function defaultLocks() {
  try {
    const n = globalThis.navigator;
    return n && n.locks && typeof n.locks.request === 'function' ? n.locks : null;
  } catch {
    return null;
  }
}

export function createStandbyLock({ onChange = () => {}, locks = defaultLocks(), name = STANDBY_LOCK, leftMs = LEFT_MS } = {}) {
  const offName = `${name}-off`;
  let state = locks ? 'off' : 'unsupported';
  let gen = 0; // each ask; an answer for an older one is let go at once
  let letGo = null; // resolves the held lock's promise (the lock is released then)
  let waiting = null; // the AbortController of the ask waiting in line

  function set(next) {
    if (state === next) return;
    state = next;
    try {
      onChange(next);
    } catch (err) {
      console.error('[jarvis] standby lock listener failed:', err);
    }
  }

  /**
   * Granted: hold it until release(), a step back, or another window's take(). `queued`: granted from the line,
   * after the window ahead let go: take over only if that window closed (PRIVACY-7).
   */
  function hold(my, queued = false) {
    if (my !== gen) return undefined; // let go meanwhile: give it back at once
    waiting = null;
    const held = new Promise((resolve) => {
      letGo = resolve;
    });
    if (!queued) {
      set('held');
      return held;
    }
    leftAhead().then((left) => {
      if (my !== gen) return; // let go or taken meanwhile
      if (!left) {
        set('held'); // the window ahead closed: this one listens, as before
        return;
      }
      // The owner left Standby there: leave too, and pass it on to the next in line; nothing listens here.
      const r = letGo;
      letGo = null;
      gen += 1;
      markLeft().then(() => r && r());
      set('left');
    });
    return held;
  }

  /** PRIVACY-7: whether the window ahead left Standby on purpose (it holds the "left" lock a moment). */
  function leftAhead() {
    try {
      return Promise.resolve(locks.request(offName, { mode: 'exclusive', ifAvailable: true }, (lock) => !lock)).then(
        (v) => v === true,
        () => false,
      );
    } catch {
      return Promise.resolve(false);
    }
  }

  /** PRIVACY-7: say "the owner left Standby" to the windows waiting behind: resolves once it is said (or can't be). */
  function markLeft() {
    return new Promise((said) => {
      let done = false;
      let timer = 0;
      const go = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        said();
      };
      timer = later(go, 1000); // a lock manager that never answers: let go anyway
      try {
        const p = locks.request(offName, { mode: 'shared' }, () => {
          go();
          return new Promise((r) => later(r, leftMs));
        });
        Promise.resolve(p).catch(go);
      } catch {
        go();
      }
    });
  }

  /** PRIVACY-7: the owner opened Standby here (or pressed Use this window): an earlier "left" no longer counts. */
  function clearLeft() {
    try {
      Promise.resolve(locks.request(offName, { steal: true }, () => undefined)).catch(() => {});
    } catch {
      /* it ends by itself after LEFT_MS */
    }
  }

  /** The held lock's request ended: let go by us (resolved), or taken by another window (AbortError). */
  function ended(my, err) {
    if (my !== gen || state !== 'held') return;
    letGo = null;
    if (err && err.name === 'AbortError') queue(); // taken by "Use this window" elsewhere: wait behind it
    else set('off');
  }

  function request(options, my, queued = false) {
    try {
      const p = locks.request(name, options, (lock) => (lock ? hold(my, queued) : null));
      return Promise.resolve(p).then(
        (v) => {
          ended(my, null);
          return v;
        },
        (err) => {
          ended(my, err);
          return null;
        },
      );
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /** Wait in line for it (another window holds it). */
  function queue() {
    const my = ++gen;
    letGo = null;
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    waiting = ac;
    set('elsewhere');
    request(ac ? { signal: ac.signal } : {}, my, true).catch(() => {});
  }

  function acquire() {
    if (state === 'unsupported' || state === 'held' || state === 'asking' || state === 'elsewhere') return state;
    const my = ++gen;
    set('asking');
    clearLeft();
    try {
      locks
        .request(name, { ifAvailable: true }, (lock) => {
          if (my !== gen) return undefined;
          if (lock) return hold(my);
          queue(); // held by another window: say so, and wait in line
          return undefined;
        })
        .then(
          () => ended(my, null),
          (err) => ended(my, err),
        );
    } catch {
      gen += 1;
      set('unsupported');
    }
    return state;
  }

  function take() {
    if (state !== 'elsewhere') return false;
    if (waiting) {
      try {
        waiting.abort();
      } catch {
        /* gone */
      }
      waiting = null;
    }
    const my = ++gen;
    set('asking');
    clearLeft();
    request({ steal: true }, my).catch(() => {
      if (my === gen) queue();
    });
    return true;
  }

  function release() {
    const listening = state === 'held';
    gen += 1;
    if (waiting) {
      try {
        waiting.abort();
      } catch {
        /* gone */
      }
      waiting = null;
    }
    const r = letGo;
    letGo = null;
    if (r) {
      // PRIVACY-7: the owner left Standby: the windows waiting behind leave too instead of starting to listen.
      if (listening) markLeft().then(r);
      else r();
    }
    if (state !== 'unsupported') set('off');
  }

  return {
    acquire,
    take,
    release,
    get state() {
      return state;
    },
  };
}

/** MAC-6: Voice Mode is open in this window: hold VOICE_LOCK (shared) until the returned function is called. */
export function holdVoiceLock({ locks = defaultLocks(), name = VOICE_LOCK } = {}) {
  let letGo = null;
  let closed = false;
  if (locks) {
    try {
      const p = locks.request(name, { mode: 'shared' }, () =>
        closed
          ? undefined
          : new Promise((resolve) => {
              letGo = resolve;
            }),
      );
      Promise.resolve(p).catch(() => {});
    } catch {
      /* no Web Locks here: nothing is held (as before) */
    }
  }
  return () => {
    closed = true;
    const r = letGo;
    letGo = null;
    if (r) r();
  };
}

/** MAC-6: whether Voice Mode is open in some Jarvis window (VOICE_LOCK held), without taking it from anyone. */
export function voiceOpenSomewhere({ locks = defaultLocks(), name = VOICE_LOCK } = {}) {
  if (!locks) return Promise.resolve(false);
  try {
    return Promise.resolve(locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => !lock)).then(
      (busy) => busy === true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * REGRESS-1: whether some Jarvis window holds Standby now (another window, since this one asks before it opens
 * Standby). Read-only (navigator.locks.query()): it neither takes the lock nor waits in line, so a window opening
 * Standby at that moment isn't disturbed. Unknown (no query(), an error): false.
 */
export function standbyHeldSomewhere({ locks = defaultLocks(), name = STANDBY_LOCK } = {}) {
  if (!locks || typeof locks.query !== 'function') return Promise.resolve(false);
  try {
    return Promise.resolve(locks.query()).then(
      (snap) => !!snap && Array.isArray(snap.held) && snap.held.some((l) => l && l.name === name),
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}
