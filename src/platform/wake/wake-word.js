// The page's handle on the "Hey Jarvis" worker (wake-word-worker.js, dist/wake/).
//
//   const ww = createWakeWord({ workerUrl, base });
//   ww.start()        Promise: spawn the worker and load the models (downloads ~15 MB the first time,
//                     then from Cache Storage); resolves when ready, rejects with { code, message }
//   ww.attach(port)   the AudioWorklet's frames arrive on this MessagePort (capture.js makes it)
//   ww.reset()        the microphone restarted: forget the audio so far
//   ww.status()       { state: 'off'|'loading'|'ready'|'error', loaded, total, error, avgMs, cached }
//   ww.subscribe(fn)  fn(status) on every change; returns unsubscribe
//   ww.onDetect(fn)   fn({ score }) when "Hey Jarvis" is heard; returns unsubscribe
//   ww.stop()         end the worker (memory); start() loads again from the cache
//   ww.clear()        delete the download (Settings → turning the wake word off keeps it; Reset deletes it)
//
// Test hook (localhost only, like the natural voice's stand-in): localStorage 'jarvis.dev.wakeWord'
// = 'stub' makes a stand-in that is ready at once and "hears" the phrase when the page calls
// window.__jarvisWake.say() (E2E: the "Hey Jarvis" path without a real voice).

import { WAKE_CACHE, WAKE_WORKER_PATH } from '../../lib/wake/catalog.js';

export function createWakeWord({ workerUrl = WAKE_WORKER_PATH, base = './', scope = globalThis, createWorker = (url) => new Worker(url, { type: 'module', name: 'jarvis-wake' }) } = {}) {
  let worker = null;
  let startPromise = null;
  const listeners = new Set();
  const detectors = new Set();
  let st = { state: 'off', loaded: 0, total: 0, error: null, avgMs: null, cached: false };

  function set(patch) {
    st = { ...st, ...patch };
    for (const fn of Array.from(listeners)) {
      try {
        fn(st);
      } catch (err) {
        console.error('[jarvis] wake word listener failed:', err);
      }
    }
  }

  function onMessage(event) {
    const msg = event && event.data;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'progress':
        set({ state: 'loading', loaded: msg.loaded || 0, total: msg.total || 0 });
        break;
      case 'ready':
        set({ state: 'ready', error: null, cached: !!msg.cached, loaded: st.total || st.loaded });
        if (startPromise && startPromise.resolve) startPromise.resolve();
        break;
      case 'detected':
        for (const fn of Array.from(detectors)) {
          try {
            fn({ score: msg.score });
          } catch (err) {
            console.error('[jarvis] wake word handler failed:', err);
          }
        }
        break;
      case 'stats':
        set({ avgMs: msg.avgMs, frames: msg.frames, dropped: msg.dropped });
        break;
      case 'error':
        fail(msg.code || 'init', msg.message || 'The wake word could not start.');
        break;
      default:
        break;
    }
  }

  function fail(code, message) {
    set({ state: 'error', error: { code, message } });
    if (startPromise && startPromise.reject) startPromise.reject({ code, message });
    startPromise = null;
    if (worker) {
      try {
        worker.terminate();
      } catch {
        /* gone */
      }
    }
    worker = null;
  }

  function start() {
    if (st.state === 'ready' && worker) return Promise.resolve();
    if (startPromise) return startPromise.promise;
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => {});
    startPromise = { promise, resolve, reject };
    set({ state: 'loading', error: null, loaded: 0 });
    try {
      worker = createWorker(new URL(workerUrl, scope.location ? scope.location.href : undefined).href);
      worker.onmessage = onMessage;
      worker.onerror = (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        fail('init', 'The wake word could not start (its worker failed to load).');
      };
      const appBase = new URL(base, scope.location ? scope.location.href : undefined).href;
      worker.postMessage({ type: 'init', base: appBase });
    } catch (err) {
      fail('init', String((err && err.message) || err));
    }
    return promise.then(() => {
      startPromise = null;
    });
  }

  function attach(port) {
    if (!worker || !port) return false;
    try {
      worker.postMessage({ type: 'audio' }, [port]);
      return true;
    } catch {
      return false;
    }
  }

  function reset() {
    if (worker) worker.postMessage({ type: 'reset' });
  }

  function stop() {
    if (worker) {
      try {
        worker.terminate();
      } catch {
        /* gone */
      }
    }
    worker = null;
    if (startPromise && startPromise.reject) startPromise.reject({ code: 'stopped', message: 'Stopped.' });
    startPromise = null;
    set({ state: 'off', loaded: 0 });
  }

  async function clear() {
    stop();
    try {
      if (scope.caches) await scope.caches.delete(WAKE_CACHE);
    } catch {
      /* ignore */
    }
  }

  return {
    start,
    attach,
    reset,
    stop,
    clear,
    status: () => st,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onDetect(fn) {
      detectors.add(fn);
      return () => detectors.delete(fn);
    },
  };
}

/**
 * The E2E stand-in (localhost only): ready after a short "download", and "hears" the phrase when the
 * page calls window.__jarvisWake.say(). Its frames port is accepted and drained.
 */
export function createWakeWordStub({ scope = globalThis, loadMs = 300 } = {}) {
  const listeners = new Set();
  const detectors = new Set();
  let st = { state: 'off', loaded: 0, total: 0, error: null, avgMs: null, cached: false, stub: true };
  let port = null;
  let frames = 0;
  const set = (patch) => {
    st = { ...st, ...patch };
    for (const fn of Array.from(listeners)) fn(st);
  };
  const api = {
    start() {
      if (st.state === 'ready') return Promise.resolve();
      set({ state: 'loading', loaded: 0, total: 100 });
      return new Promise((resolve) => setTimeout(() => {
        set({ state: 'ready', loaded: 100 });
        resolve();
      }, loadMs));
    },
    attach(p) {
      port = p || null;
      if (port) {
        port.onmessage = () => {
          frames += 1;
        };
      }
      return !!port;
    },
    reset() {},
    stop() {
      if (port) port.close();
      port = null;
      set({ state: 'off' });
    },
    async clear() {
      api.stop();
    },
    status: () => st,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onDetect(fn) {
      detectors.add(fn);
      return () => detectors.delete(fn);
    },
    get frames() {
      return frames;
    },
  };
  try {
    scope.__jarvisWake = {
      say: () => {
        if (st.state !== 'ready' || !port) return false;
        for (const fn of Array.from(detectors)) fn({ score: 0.99 });
        return true;
      },
      frames: () => frames,
    };
  } catch {
    /* no global */
  }
  return api;
}
