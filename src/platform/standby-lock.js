// One Jarvis per Mac answers (v8.1, SPEC §28.5, A9). With hands-free listening in the background (A1), the
// installed app and a forgotten Jarvis tab would both answer "Hey Jarvis" and both pay. So Standby takes a
// Web Lock before it listens, and keeps it through a woken session; another window waits behind it and says
// so ("Standby is on in another Jarvis window", with Use this window).
//
//   const lock = createStandbyLock({ onChange, locks, name });
//   lock.acquire()  ask for it: 'held' when it is free; otherwise 'elsewhere' (another window holds it),
//                   waiting in line: onChange('held') once that window lets go (it left Standby, or closed)
//   lock.take()     "Use this window": take it from the window holding it now (Web Locks' steal: the
//                   browser takes it from that window at once, ahead of any other window waiting); that
//                   window is told (its lock request fails with AbortError) and steps back to 'elsewhere',
//                   waiting in line behind this one
//   lock.release()  let go (Standby left, or the woken session is over without a return); stops waiting too
//   lock.state      'off' | 'asking' | 'held' | 'elsewhere' | 'unsupported'
//   onChange(state) on every change of state
// Without Web Locks: 'unsupported' at once; Standby listens as before (each window decides alone).
// The lock covers the windows of one browser profile on one device (Web Locks are per origin and storage).
//
// MAC-6: Voice Mode open in any window counts as "Jarvis is busy here". It holds VOICE_LOCK (shared: one per
// window) for its life, and Standby asks before it wakes, so a forgotten tab on Standby doesn't answer the owner
// talking to Voice Mode in another window (two voices, two paid requests):
//   const close = holdVoiceLock({ locks });   Voice Mode opened; close() when it closes (a closed window lets go too)
//   voiceOpenSomewhere({ locks })             Promise<boolean>: Voice Mode is open in some window (false without
//                                             Web Locks: as before)

export const STANDBY_LOCK = 'jarvis-standby';
export const VOICE_LOCK = 'jarvis-voice';

function defaultLocks() {
  try {
    const n = globalThis.navigator;
    return n && n.locks && typeof n.locks.request === 'function' ? n.locks : null;
  } catch {
    return null;
  }
}

export function createStandbyLock({ onChange = () => {}, locks = defaultLocks(), name = STANDBY_LOCK } = {}) {
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

  /** Granted: hold it until release(), a step back, or another window's take(). */
  function hold(my) {
    if (my !== gen) return undefined; // let go meanwhile: give it back at once
    waiting = null;
    set('held');
    return new Promise((resolve) => {
      letGo = resolve;
    });
  }

  /** The held lock's request ended: let go by us (resolved), or taken by another window (AbortError). */
  function ended(my, err) {
    if (my !== gen || state !== 'held') return;
    letGo = null;
    if (err && err.name === 'AbortError') queue(); // taken by "Use this window" elsewhere: wait behind it
    else set('off');
  }

  function request(options, my) {
    try {
      const p = locks.request(name, options, (lock) => (lock ? hold(my) : null));
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
    request(ac ? { signal: ac.signal } : {}, my).catch(() => {});
  }

  function acquire() {
    if (state === 'unsupported' || state === 'held' || state === 'asking' || state === 'elsewhere') return state;
    const my = ++gen;
    set('asking');
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
    request({ steal: true }, my).catch(() => {
      if (my === gen) queue();
    });
    return true;
  }

  function release() {
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
    if (r) r();
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
