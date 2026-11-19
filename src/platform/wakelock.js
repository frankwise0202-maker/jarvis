// Keep the screen awake while Jarvis works (SPEC §9.3), so a phone does not lock and suspend
// the page in the middle of a swarm.
//
//   keepAwake()  -> Promise<boolean>  request a screen wake lock and keep holding it: browsers
//                   release it whenever the page is hidden, so it is re-acquired when the page
//                   becomes visible again, until allowSleep().
//   allowSleep()    release it and stop re-acquiring.
//   isAwake()       whether a wake lock is currently held.
// Unsupported browsers (or a denied request, e.g. battery saver) make these quiet no-ops.

let wanted = false; // the app asked to stay awake
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

function onVisibility() {
  if (wanted && !sentinel && visible()) acquire();
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
      if (!wanted) {
        // allowSleep() was called while the request was in flight.
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

/** Hold a screen wake lock until allowSleep(). Resolves true if a lock is held now. */
export function keepAwake() {
  wanted = true;
  if (!api()) return Promise.resolve(false);
  if (!listening && globalThis.document && typeof globalThis.document.addEventListener === 'function') {
    listening = true;
    globalThis.document.addEventListener('visibilitychange', onVisibility);
  }
  return acquire();
}

/** Release the wake lock (if any) and stop re-acquiring it. */
export function allowSleep() {
  wanted = false;
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
