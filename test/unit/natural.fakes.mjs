// Fakes for the natural-voice unit tests (not a test file itself).
//
//   createFakeEngine(clock, { rtf, failOn, state })   engine-client.js stand-in: synthesis takes
//                       rtf × the audio's duration of virtual time, one job at a time like the
//                       worker; audio = 0.1 s silence + voiced samples + 0.15 s silence at 24 kHz
//   createFakeAudio(clock, { latency, frozen })        audio-out.js stand-in on the virtual clock.
//                       suspend() / resume() stop and restart its clock (frozen: stopped from the
//                       start). v7.8.1: kick() counts in `kicks` and calls onKick (null: the kick
//                       does nothing, the stuck case); autoResumeMs: play() on a stopped clock
//                       restarts it that much later (the real play() resuming a suspended context)
//   createFakeWorker()                                a Worker for engine-client.js
//   installClock().block(ms)                          v7.8.1: the main thread blocked for `ms`: no timer
//                       runs meanwhile, then each overdue one runs once (an interval once, not ms/period
//                       times), as in a browser; the fake audio clock (another thread) moved on
//
// Results are delivered through a synchronous thenable (not a Promise), so they arrive at the
// exact virtual time inside clock.advance() (Promise callbacks would wait for the microtask
// queue, i.e. until advance() returned).

export const SR = 24000;
export const CPS = 15; // characters per second of fake speech at speed 1
const HEAD_S = 0.1;
const TAIL_S = 0.15;

/** A deferred whose then() callbacks run synchronously on resolve/reject. */
export function syncDeferred() {
  let state = 'pending';
  let value;
  const handlers = [];
  const flush = () => {
    while (handlers.length) {
      const [ok, bad] = handlers.shift();
      if (state === 'resolved' && ok) ok(value);
      if (state === 'rejected' && bad) bad(value);
    }
  };
  return {
    promise: {
      then(ok, bad) {
        handlers.push([ok, bad]);
        if (state !== 'pending') flush();
        return this;
      },
      catch(bad) {
        return this.then(null, bad);
      },
    },
    resolve(v) {
      if (state !== 'pending') return;
      state = 'resolved';
      value = v;
      flush();
    },
    reject(e) {
      if (state !== 'pending') return;
      state = 'rejected';
      value = e;
      flush();
    },
  };
}

/** Fake speech audio for `text`: silence, a voiced middle (|x| = 0.2), silence. */
export function fakePcm(text, speed = 1) {
  const voiced = Math.max(0.2, text.length / (CPS * speed));
  const n = Math.round((HEAD_S + voiced + TAIL_S) * SR);
  const pcm = new Float32Array(n);
  const a = Math.round(HEAD_S * SR);
  const b = a + Math.round(voiced * SR);
  for (let i = a; i < b; i++) pcm[i] = i % 2 ? 0.2 : -0.2;
  return pcm;
}

export function createFakeEngine(clock, { rtf = 0.4, failOn = () => false, state = 'ready', slowRtf = 1.0 } = {}) {
  let st = { state, rtf: null, underruns: 0 };
  const listeners = new Set();
  const queue = [];
  let busy = null;
  let nextId = 1;
  const timings = [];
  const fake = {
    requests: [], // { id, text, voice, speed, at }
    cancelled: [],
    completed: [], // texts whose audio was delivered
    started: 0,
    status: () => st,
    ready: () => st.state === 'ready',
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setState(next) {
      st = { ...st, state: next };
      for (const fn of Array.from(listeners)) fn(st);
    },
    start() {
      fake.started += 1;
      return Promise.resolve();
    },
    synth(text, { voice, speed = 1 } = {}) {
      const id = nextId++;
      const d = syncDeferred();
      const job = { id, text, voice, speed, d, n: fake.requests.length };
      fake.requests.push({ id, text, voice, speed, at: clock.now });
      if (st.state !== 'ready' && st.state !== 'slow') {
        d.reject(Object.assign(new Error('not ready'), { code: 'not-ready' }));
        return { id, promise: d.promise };
      }
      queue.push(job);
      run();
      return { id, promise: d.promise };
    },
    cancel(ids) {
      const list = ids === 'all' ? queue.map((j) => j.id).concat(busy ? [busy.id] : []) : ids;
      for (const id of list) {
        fake.cancelled.push(id);
        const i = queue.findIndex((j) => j.id === id);
        if (i >= 0) {
          const [j] = queue.splice(i, 1);
          j.d.reject(Object.assign(new Error('Cancelled.'), { code: 'cancelled' }));
        }
        if (busy && busy.id === id) {
          busy.cancelled = true;
          busy.d.reject(Object.assign(new Error('Cancelled.'), { code: 'cancelled' }));
        }
      }
    },
    noteTiming(synthMs, audioSeconds, { underrun = false } = {}) {
      timings.push({ synthMs, audioMs: audioSeconds * 1000 });
      if (timings.length > 6) timings.shift();
      const audioMs = timings.reduce((n, t) => n + t.audioMs, 0);
      const r = timings.reduce((n, t) => n + t.synthMs, 0) / audioMs;
      st = { ...st, rtf: r, underruns: st.underruns + (underrun ? 1 : 0) };
      if (audioMs >= 3000 && r > slowRtf && st.state === 'ready') fake.setState('slow');
    },
  };
  function run() {
    if (busy || !queue.length) return;
    const job = queue.shift();
    busy = job;
    const pcm = fakePcm(job.text, job.speed);
    const synthMs = Math.round((pcm.length / SR) * 1000 * (typeof rtf === 'function' ? rtf(job) : rtf));
    setTimeout(() => {
      busy = null;
      if (!job.cancelled) {
        if (failOn(job)) job.d.reject(Object.assign(new Error('synthesis failed'), { code: 'synth' }));
        else {
          fake.completed.push(job.text);
          job.d.resolve({ pcm, sampleRate: SR, synthMs });
        }
      }
      run();
    }, synthMs);
  }
  return fake;
}

export function createFakeAudio(clock, { latency = 0, frozen = false } = {}) {
  const t0 = clock.now;
  let suspendedAt = frozen ? clock.now : -1;
  let pausedTotal = 0;
  const fake = {
    played: [], // { when, duration, samples, stopped }
    unlocked: 0,
    kicks: 0,
    kickTimes: [], // clock.now of each kick
    onKick: null, // fake => void: what a kick does (null: nothing, the clock stays stopped)
    autoResumeMs: null,
    supported: () => true,
    unlock() {
      fake.unlocked += 1;
      return true;
    },
    kick() {
      fake.kicks += 1;
      fake.kickTimes.push(clock.now);
      if (typeof fake.onKick === 'function') fake.onKick(fake);
      return true;
    },
    get frozen() {
      return suspendedAt >= 0;
    },
    ready: () => suspendedAt < 0,
    now() {
      const wall = suspendedAt >= 0 ? suspendedAt : clock.now;
      return (wall - t0 - pausedTotal) / 1000;
    },
    latency: () => latency,
    suspend() {
      if (suspendedAt < 0) suspendedAt = clock.now;
    },
    resume() {
      if (suspendedAt >= 0) pausedTotal += clock.now - suspendedAt;
      suspendedAt = -1;
    },
    play(pcm, sampleRate, when) {
      if (suspendedAt >= 0 && fake.autoResumeMs !== null) setTimeout(() => fake.resume(), fake.autoResumeMs);
      const at = Math.max(when, fake.now());
      const rec = { when: at, duration: pcm.length / sampleRate, samples: pcm.length, stopped: false, stoppedAt: null };
      fake.played.push(rec);
      return {
        when: at,
        duration: rec.duration,
        stop() {
          if (!rec.stopped) {
            rec.stopped = true;
            rec.stoppedAt = fake.now();
          }
        },
      };
    },
    stopAll() {
      for (const p of fake.played) if (!p.stopped) {
        p.stopped = true;
        p.stoppedAt = fake.now();
      }
    },
    busy() {
      const t = fake.now();
      return fake.played.some((p) => !p.stopped && t < p.when + p.duration);
    },
    level: () => (fake.busy() ? 0.5 : 0),
    bands(out) {
      out.fill(fake.busy() ? 0.4 : 0);
      return out;
    },
    close() {},
  };
  return fake;
}

export function createFakeWorker() {
  const w = {
    posted: [],
    terminated: false,
    onmessage: null,
    onerror: null,
    postMessage(msg) {
      w.posted.push(msg);
    },
    terminate() {
      w.terminated = true;
    },
    emit(data) {
      if (w.onmessage) w.onmessage({ data });
    },
    fail(message) {
      if (w.onerror) w.onerror({ message, preventDefault() {} });
    },
  };
  return w;
}

// ---- virtual clock: a copy of installClock() from platform.voice.fakeengine.test.mjs (importing that
// file would also run its self-tests in this process) ----------------------------------------

export function installClock(start = 1_800_000_000_000) {
  const saved = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    now: Date.now,
  };
  let now = start;
  let seq = 0;
  const timers = new Map();
  const add = (fn, ms, args, every) => {
    const id = ++seq;
    timers.set(id, { at: now + (every || Math.max(0, Number(ms) || 0)), fn, args, every, order: id });
    return id;
  };
  globalThis.setTimeout = (fn, ms, ...args) => add(fn, ms, args, 0);
  globalThis.setInterval = (fn, ms, ...args) => add(fn, ms, args, Math.max(1, Number(ms) || 0));
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
  };
  globalThis.clearInterval = globalThis.clearTimeout;
  Date.now = () => now;

  const due = () => {
    let best = null;
    for (const [id, t] of timers) if (!best || t.at < best.t.at || (t.at === best.t.at && t.order < best.t.order)) best = { id, t };
    return best;
  };
  const runTo = (target, stop) => {
    for (let guard = 0; guard < 5_000_000; guard++) {
      if (stop && stop()) return true;
      const n = due();
      if (!n || n.t.at > target) break;
      now = Math.max(now, n.t.at);
      if (n.t.every) {
        n.t.at += n.t.every;
        n.t.order = ++seq;
      } else timers.delete(n.id);
      n.t.fn(...n.t.args);
    }
    if (stop && stop()) return true;
    now = Math.max(now, target);
    return false;
  };
  return {
    get now() {
      return now;
    },
    get timers() {
      return timers.size;
    },
    /** Run every timer due within `ms`, in order, with Date.now() at each timer's time. */
    advance(ms) {
      runTo(now + ms);
    },
    /** Run until `stop()` is true (checked before each timer); returns the virtual ms it took. */
    runUntil(stop, maxMs = 600_000) {
      const t0 = now;
      if (!runTo(now + maxMs, stop)) throw new Error(`runUntil: condition not met within ${maxMs} ms`);
      return now - t0;
    },
    /** The main thread blocked for `ms`: no timer runs meanwhile; then each overdue timer runs once. */
    block(ms) {
      now += Math.max(0, Number(ms) || 0);
      for (const t of timers.values()) if (t.at < now) t.at = now;
      runTo(now);
    },
    restore() {
      Object.assign(globalThis, { setTimeout: saved.setTimeout, clearTimeout: saved.clearTimeout, setInterval: saved.setInterval, clearInterval: saved.clearInterval });
      Date.now = saved.now;
      timers.clear();
    },
  };
}
