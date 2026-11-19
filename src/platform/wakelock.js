// Keep the screen awake while Jarvis works (SPEC §9.3), so a phone does not lock and suspend
// the page in the middle of a swarm.
//
//   keepAwake(owner = 'default') -> Promise<boolean>  request a screen wake lock and keep holding
//                   it: browsers release it whenever the page is hidden, so it is re-acquired
//                   when the page becomes visible again, until no owner wants it any more.
//   allowSleep(owner = 'default')  this owner no longer needs the screen on; the lock is released
//                   (and no longer re-acquired) once no owner remains.
//   isAwake()       whether a wake lock is currently held.
//   awakeOwners()   the owners currently keeping the screen on (diagnostics, tests).
// Owners are names, e.g. 'run' for agent runs and 'voice' for Voice Mode: closing Voice Mode must
// not let the phone sleep while a swarm is still running. Each owner counts once however many
// times it calls keepAwake(). Calls without an owner (or with a non-string, such as an event
// passed by an event listener) use 'default', so the old one-flag behaviour is unchanged.
// Unsupported browsers (or a denied request, e.g. battery saver) make these quiet no-ops.

const owners = new Set(); // who wants the screen on
let sentinel = null; // current WakeLockSentinel
let requesting = null; // in-flight request promise
let listening = false;

function api() {
  try {
    const n = globalThis.navigator;
    return n && n.wakeLock && typeof n.wakeLock.request === 'function' ? n.wakeLock : null;
  } catch {
    return null;
  }
}

function visible() {
  try {
    return !globalThis.document || globalThis.document.visibilityState === 'visible';
  } catch {
    return true;
  }
}

const ownerName = (owner) => (typeof owner === 'string' && owner ? owner : 'default');
const wanted = () => owners.size > 0;

function onVisibility() {
  if (wanted() && !sentinel && visible()) acquire();
}

function acquire() {
  const wl = api();
  if (!wl) return Promise.resolve(false);
  if (sentinel) return Promise.resolve(true);
  if (requesting) return requesting;
  if (!visible()) return Promise.resolve(false); // requests from hidden pages are rejected; retried on visibility
  requesting = (async () => {
    try {
      const s = await wl.request('screen');
      if (!wanted()) {
        // The last owner called allowSleep() while the request was in flight.
        s.release().catch(() => {});
        return false;
      }
      sentinel = s;
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
      });
      return true;
    } catch {
      return false; // NotAllowedError (hidden page, power saving, permissions policy)
    } finally {
      requesting = null;
    }
  })();
  return requesting;
}

/** Keep the screen on for `owner` until allowSleep(owner). Resolves true if a lock is held now. */
export function keepAwake(owner) {
  owners.add(ownerName(owner));
  if (!api()) return Promise.resolve(false);
  if (!listening && globalThis.document && typeof globalThis.document.addEventListener === 'function') {
    listening = true;
    globalThis.document.addEventListener('visibilitychange', onVisibility);
  }
  return acquire();
}

/** `owner` no longer needs the screen on: the lock is released once no owner remains. */
export function allowSleep(owner) {
  owners.delete(ownerName(owner));
  if (wanted()) return;
  const s = sentinel;
  sentinel = null;
  if (s) {
    try {
      s.release().catch(() => {});
    } catch {
      /* already released */
    }
  }
}

export function isAwake() {
  return !!sentinel && !sentinel.released;
}

export function awakeOwners() {
  return Array.from(owners);
}
