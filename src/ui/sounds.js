// Sounds and haptics (SPEC 14.3): a small family of HUD sounds synthesized with WebAudio
// (no audio files): glassy FM bells, warm filtered tones and soft filtered noise, all in
// A-major pentatonic so overlapping sounds stay consonant, through a short generated
// reverb and a safety compressor.
//
//   initSounds(getSettings)   // once at boot: unlocks audio on the first tap/key (iOS)
//   play('launch')            // see SOUND_NAMES; returns true if the sound was scheduled
//   play('wake', { hidden: true })  // a sound that may play in a background tab: Jarvis woken from
//                             // Standby on a Mac (the owner clapped; he should hear it). v8.1: also
//                             // 'listen-start', 'listen-stop' and 'error' in a hands-free session there
//                             // (SPEC §28.1: the chime before each listen is the honest signal across the room)
//   haptic('success')         // 'light' | 'success' | 'error' (navigator.vibrate; Android)
//   cue('mission-done')       // play() + the matching haptic
//   setSoundsSink(id)         // v8.1: the speaker the chimes play on (AudioContext.setSinkId; '' = the
//                             // default output), with George's: Settings → Voice → Microphone and speaker
//
// Never throws. Nothing plays when settings.sounds is false or soundVolume is 0, while the
// page is hidden (except HIDDEN_SOUNDS asked for with { hidden: true }), or before the owner has
// interacted with the page (browsers block audio until then). Rapid repeats are rate-limited
// (e.g. at most one 'agent-done' per 120 ms).

export const SOUND_NAMES = Object.freeze(['send', 'launch', 'agent-done', 'mission-done', 'reply-done', 'error', 'listen-start', 'listen-stop', 'tap', 'notify', 'boot', 'optics', 'scan', 'alert', 'wake']);
/** The sounds that may play while the page is hidden, when asked with { hidden: true } (v8.1: a session on a Mac). */
export const HIDDEN_SOUNDS = Object.freeze(['wake', 'listen-start', 'listen-stop', 'error']);

// gap: minimum ms between two plays of the same sound. big: a prominent sound; small
// sounds are skipped for a moment after one so they never clutter it. gain: output level,
// calibrated so the family is balanced (at full volume big sounds peak near -9 dBFS and
// ticks near -17 dBFS; measured offline). verb: reverb send (ticks stay nearly dry).
const SPECS = {
  tap: { gap: 45, small: true, gain: 0.38, verb: 0.2 },
  send: { gap: 120, gain: 0.96, verb: 0.55 },
  launch: { gap: 400, big: true, gain: 0.88, verb: 1 },
  'agent-done': { gap: 120, small: true, gain: 0.98, verb: 0.85 },
  'mission-done': { gap: 400, big: true, gain: 0.67, verb: 0.9 },
  'reply-done': { gap: 400, big: true, gain: 0.87, verb: 0.75 },
  error: { gap: 400, big: true, gain: 1.00, verb: 0.3 },
  'listen-start': { gap: 90, gain: 0.49, verb: 0.25 },
  'listen-stop': { gap: 90, gain: 0.47, verb: 0.25 },
  notify: { gap: 600, big: true, gain: 1.22, verb: 1 },
  // Presence cues (SPEC 2.4.18). The boot, a camera capture and its scan, a Needs-you item.
  boot: { gap: 2000, big: true, gain: 0.7, verb: 1 },
  optics: { gap: 250, small: true, gain: 0.5, verb: 0.4 },
  scan: { gap: 500, small: true, gain: 0.22, verb: 0.3 },
  alert: { gap: 1200, big: true, gain: 0.8, verb: 0.6 },
  // Wake Jarvis (Standby): a swell and four bells climbing, as the core boots.
  wake: { gap: 2000, big: true, gain: 0.75, verb: 1 },
};

const DEFAULT_VOLUME = 0.6;
const SMALL_AFTER_BIG_MS = 180;
const MAX_ACTIVE = 10; // concurrent sound instances
const IDLE_SUSPEND_MS = 8000; // suspend the AudioContext when quiet (not on WebKit, see below)
const LOOKAHEAD = 0.012; // seconds between scheduling and the first sample

// A-major pentatonic, Hz.
const N = {
  Cs3: 138.59, E3: 164.81, A3: 220, Cs4: 277.18, E4: 329.63, A4: 440, B4: 493.88, Cs5: 554.37, D5: 587.33, E5: 659.26,
  A5: 880, B5: 987.77, Cs6: 1108.73, E6: 1318.51, Fs6: 1479.98, A6: 1760, B6: 1975.53, Cs7: 2217.46, E7: 2637.02,
};
// Agent-done chimes climb this ladder while agents keep finishing (two notes per chime).
const LADDER = [N.Cs6, N.E6, N.Fs6, N.A6, N.B6, N.Cs7];

let getSettingsFn = null;
let ctx = null;
let chain = null;
let armed = false;
let gestureSeen = false;
let lastAt = new Map();
let lastBigAt = -Infinity;
let active = 0;
let idleTimer = 0;
let suspendedByUs = false;
let ladderStep = 0;
let ladderAt = -Infinity;
let lastHapticAt = 0;
let warned = false;
let sinkId = ''; // v8.1: '' = the default output (nothing is asked of the context)

// ---- public API -------------------------------------------------------------------------------

/**
 * Remember the settings getter and arm the first-gesture unlock. Safe to call more than once.
 * The AudioContext itself is created lazily, inside a user gesture when possible.
 */
export function initSounds(getSettings) {
  if (typeof getSettings === 'function') getSettingsFn = getSettings;
  arm();
}

/**
 * v8.1: the speaker the sounds play on ('' = the default output); kept for a context made later. Everything
 * Jarvis plays goes to one device (Chrome's echo cancellation takes one output as its reference).
 * Promise<boolean>; never throws.
 */
export function setSoundsSink(id) {
  const next = typeof id === 'string' ? id : '';
  const same = next === sinkId;
  sinkId = next;
  if (!ctx || ctx.state === 'closed' || (same && (ctx.sinkId || '') === next)) return Promise.resolve(true);
  return applySink(ctx);
}

function applySink(c) {
  try {
    if (!c || typeof c.setSinkId !== 'function') return Promise.resolve(false);
    return Promise.resolve(c.setSinkId(sinkId)).then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Play a named sound (SOUND_NAMES). Options: { volume } overrides settings.soundVolume (0..1),
 * e.g. to preview the volume slider. Returns true if the sound was scheduled. Never throws.
 */
export function play(name, opts) {
  try {
    const spec = Object.prototype.hasOwnProperty.call(SPECS, name) ? SPECS[name] : null;
    if (!spec) return false;
    arm();
    const s = readSettings();
    if (!s.sounds) return false;
    const volume = opts && opts.volume !== undefined && opts.volume !== null ? toVolume(opts.volume, s.volume) : s.volume;
    if (volume <= 0 || (isHidden() && !(opts && opts.hidden === true && HIDDEN_SOUNDS.includes(name)))) return false;

    const now = nowMs();
    if (now - (lastAt.get(name) ?? -Infinity) < spec.gap) return false;
    if (spec.small && (now - lastBigAt < SMALL_AFTER_BIG_MS || active >= MAX_ACTIVE / 2)) return false;
    if (active >= MAX_ACTIVE) return false;

    const c = ensureContext(inGesture());
    if (!c || !chain) return false;
    let pending = false;
    if (c.state !== 'running') {
      if (!tryResume(c)) return false;
      pending = true;
    }

    lastAt.set(name, now);
    if (spec.big) lastBigAt = now;
    let step = 0;
    if (name === 'agent-done') {
      ladderStep = now - ladderAt < 1600 ? (ladderStep + 1) % (LADDER.length - 2) : 0;
      ladderAt = now;
      step = ladderStep;
    }

    setVolume(chain, volume, c.currentTime);
    const t = c.currentTime + LOOKAHEAD;
    const voice = schedule(c, chain, name, t, step);
    active++;
    const lifetime = Math.max(0.05, voice.end - c.currentTime) + 0.35; // + reverb tail
    setTimeout(() => {
      active = Math.max(0, active - 1);
      voice.dispose();
    }, lifetime * 1000);
    if (pending) {
      // Resuming outside a gesture can be refused: never let a sound play late and stale.
      setTimeout(() => {
        if (c.state !== 'running') voice.dispose();
      }, 400);
    }
    scheduleIdleSuspend(lifetime);
    return true;
  } catch (err) {
    warnOnce('play failed', err);
    return false;
  }
}

/**
 * Vibrate for feedback: 'light' | 'success' | 'error' (unknown kinds act as 'light').
 * Only where navigator.vibrate exists (Android browsers; not iOS) and settings.haptics is on.
 * Returns true if a vibration was requested. Never throws.
 */
export function haptic(kind) {
  try {
    const s = readSettings();
    if (!s.haptics || isHidden()) return false;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.vibrate !== 'function') return false;
    // Chrome blocks (and logs) vibration until the first tap; don't even ask before that.
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return false;
    const now = nowMs();
    if (now - lastHapticAt < 60) return false;
    lastHapticAt = now;
    return nav.vibrate(HAPTICS[kind] || HAPTICS.light) === true;
  } catch {
    return false;
  }
}

const HAPTICS = { light: 8, success: [10, 70, 18], error: [26, 60, 26, 60, 34] };

// Haptic that accompanies each sound in cue().
const CUE_HAPTIC = { send: 'light', launch: 'light', 'mission-done': 'success', error: 'error', 'listen-start': 'light', 'listen-stop': 'light', tap: 'light', notify: 'success', optics: 'light', alert: 'light' };

/** play(name) plus the matching haptic. Returns what play() returned. */
export function cue(name, opts) {
  const played = play(name, opts);
  if (Object.prototype.hasOwnProperty.call(CUE_HAPTIC, name)) haptic(CUE_HAPTIC[name]);
  return played;
}

/** True when this browser can synthesize sounds at all (WebAudio present). */
export function soundsSupported() {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
}

/**
 * Render one sound into any BaseAudioContext (e.g. an OfflineAudioContext for tests or
 * analysis), through the same output chain the app uses. Options: { when = 0, volume = 0.6,
 * step = 0 } (step = agent-done ladder position). Returns { end } (seconds, dry voices).
 */
export function renderSound(context, name, { when = 0, volume = DEFAULT_VOLUME, step = 0 } = {}) {
  if (!Object.prototype.hasOwnProperty.call(SPECS, name)) throw new Error(`Unknown sound: ${name}`);
  const c = buildChain(context, context.destination);
  setVolume(c, toVolume(volume, DEFAULT_VOLUME), 0);
  return { end: schedule(context, c, name, when, step).end };
}

// ---- settings, gestures, context lifecycle ------------------------------------------------------

function readSettings() {
  let s = null;
  try {
    s = getSettingsFn ? getSettingsFn() : null;
  } catch {
    s = null;
  }
  const o = s && typeof s === 'object' ? s : {};
  return { sounds: o.sounds !== false, haptics: o.haptics !== false, volume: toVolume(o.soundVolume, DEFAULT_VOLUME) };
}

function toVolume(v, fallback) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function inGesture() {
  try {
    return typeof navigator !== 'undefined' && !!navigator.userActivation && navigator.userActivation.isActive === true;
  } catch {
    return false;
  }
}

/** Has the owner interacted with the page yet (sticky activation)? */
function wasActivated() {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userActivation : null;
    return ua ? ua.hasBeenActive === true : gestureSeen;
  } catch {
    return gestureSeen;
  }
}

// WebKit (every iOS browser, and Safari) may refuse resume() outside a user gesture, so
// there we never suspend the context ourselves while the page is visible.
function strictAutoplay() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android)/.test(ua);
  return ios || safari;
}

function arm() {
  if (armed || typeof window === 'undefined' || typeof document === 'undefined') return;
  armed = true;
  const opts = { capture: true, passive: true };
  // pointerdown/keydown for desktop; pointerup/touchend/click are what WebKit counts as a
  // user gesture for audio on touch screens.
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, onGesture, opts);
  document.addEventListener('visibilitychange', onVisibility);
}

function onGesture() {
  try {
    // Only events that really activate the page count (Escape, modifier keys and touch
    // pointerdown don't; the pointerup/touchend/click that follows does).
    const ua = typeof navigator !== 'undefined' ? navigator.userActivation : null;
    if (ua && !ua.isActive) return;
    gestureSeen = true;
    if (!readSettings().sounds) return;
    // Running already, or idle-suspended by us where play() can resume it on demand: a tap
    // must not wake the audio device for nothing.
    if (ctx && (ctx.state === 'running' || (suspendedByUs && !strictAutoplay()))) return;
    const c = ensureContext(true);
    if (c && c.state !== 'running') {
      tryResume(c);
      primeSilence(c);
    }
    scheduleIdleSuspend(0);
  } catch (err) {
    warnOnce('audio unlock failed', err);
  }
}

function onVisibility() {
  if (!ctx) return;
  try {
    if (isHidden()) {
      // Release the audio device in the background. WebKit suspends or interrupts the
      // context itself, and may refuse a later resume() without a tap, so leave it alone.
      if (ctx.state === 'running' && !strictAutoplay()) {
        suspendedByUs = true;
        ctx.suspend().catch(() => {});
      }
    } else if (strictAutoplay() && ctx.state !== 'running') {
      tryResume(ctx); // may still need the next tap on iOS; the gesture listener covers that
    }
    // Elsewhere play() resumes the context on demand.
  } catch {
    /* ignore */
  }
}

/** The AudioContext, created on demand once the page has had a user gesture. */
function ensureContext(fromGesture) {
  if (ctx && ctx.state !== 'closed') return ctx;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!fromGesture && !wasActivated()) return null; // creating it earlier only earns an autoplay warning
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch {
    try {
      ctx = new AC();
    } catch (err) {
      warnOnce('AudioContext unavailable', err);
      ctx = null;
      return null;
    }
  }
  chain = buildChain(ctx, ctx.destination);
  suspendedByUs = false;
  if (sinkId) applySink(ctx);
  return ctx;
}

/** Ask a non-running context to resume. Returns true when it is likely to start shortly. */
function tryResume(c) {
  if (c.state === 'closed') return false;
  const plausible = inGesture() || (suspendedByUs && !strictAutoplay()) || c.state === 'running';
  // Without a plausible path Chromium only logs an autoplay warning; WebKit may still lift an
  // interruption (e.g. after a call), so it gets the attempt but no sound is scheduled.
  if (!plausible && !strictAutoplay()) return false;
  try {
    const p = c.resume();
    if (p && typeof p.then === 'function') p.then(() => (suspendedByUs = false), () => {});
  } catch {
    return false;
  }
  return plausible;
}

/** A one-sample silent buffer started inside the gesture fully unlocks older iOS versions. */
function primeSilence(c) {
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
    src.onended = () => disconnect(src);
  } catch {
    /* ignore */
  }
}

function scheduleIdleSuspend(lifetimeSec) {
  if (strictAutoplay()) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    try {
      if (ctx && ctx.state === 'running' && active === 0) {
        suspendedByUs = true;
        ctx.suspend().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, lifetimeSec * 1000 + IDLE_SUSPEND_MS);
}

function warnOnce(message, err) {
  if (warned) return;
  warned = true;
  try {
    console.warn(`[jarvis] sounds: ${message}`, err);
  } catch {
    /* ignore */
  }
}

function disconnect(node) {
  try {
    node.disconnect();
  } catch {
    /* already disconnected */
  }
}

// ---- output chain: voices -> (dry + reverb send) -> volume -> highpass -> soft clipper ----------

const impulseCache = new WeakMap();
const noiseCache = new WeakMap();

function buildChain(c, destination) {
  const input = c.createGain(); // dry
  input.gain.value = 4; // make-up gain: the voices are written at modest levels
  const reverb = c.createGain(); // per-sound sends arrive here
  reverb.gain.value = 4 * 0.32;
  const volume = c.createGain();
  volume.gain.value = 0;
  const verb = c.createConvolver();
  verb.buffer = impulse(c);
  const wet = c.createGain();
  wet.gain.value = 0.42;
  const highpass = c.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 110;
  highpass.Q.value = 0.6;
  // Safety soft-clipper instead of a compressor: stateless (a compressor starts out
  // gain-reduced and would duck the first sound after unlocking), no lookahead delay.
  const limiter = c.createWaveShaper();
  limiter.curve = softClipCurve();
  limiter.oversample = '2x';
  input.connect(volume);
  reverb.connect(verb);
  verb.connect(wet);
  wet.connect(volume);
  volume.connect(highpass);
  highpass.connect(limiter);
  limiter.connect(destination);
  return { input, reverb, volume, level: null };
}

function setVolume(ch, volume, at) {
  // Perceptual taper: the slider feels even, and 0.6 (the default) sits at about -7 dB.
  const g = Math.pow(volume, 1.5);
  if (ch.level === g) return;
  const param = ch.volume.gain;
  try {
    param.cancelScheduledValues(at);
    if (ch.level === null) param.setValueAtTime(g, at);
    else param.setTargetAtTime(g, at, 0.01); // glide (no click) if a sound is still ringing
  } catch {
    param.value = g;
  }
  ch.level = g;
}

let clipCurve = null;
/** Transparent below -3 dBFS, then a smooth tanh shoulder that never exceeds full scale. */
function softClipCurve() {
  if (clipCurve) return clipCurve;
  const n = 2048;
  const knee = 0.7;
  clipCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    clipCurve[i] = Math.sign(x) * y;
  }
  return clipCurve;
}

// Seeded PRNG so the reverb and noise are identical on every load (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small, bright "glass room": 0.6 s stereo noise tail, darker as it decays. */
function impulse(c) {
  let buf = impulseCache.get(c);
  if (buf) return buf;
  const rate = c.sampleRate;
  const length = Math.floor(rate * 0.6);
  const predelay = Math.floor(rate * 0.006);
  buf = c.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rand = rng(ch ? 0x51f15e : 0x2c1b3c6d);
    let lp = 0;
    for (let i = predelay; i < length; i++) {
      const x = (i - predelay) / (length - predelay);
      lp += (rand() * 2 - 1 - lp) * (0.62 - 0.5 * x); // one-pole lowpass, closing over time
      data[i] = lp * Math.pow(1 - x, 3.4);
    }
  }
  impulseCache.set(c, buf);
  return buf;
}

function noiseBuffer(c) {
  let buf = noiseCache.get(c);
  if (buf) return buf;
  const length = Math.floor(c.sampleRate * 0.5);
  buf = c.createBuffer(1, length, c.sampleRate);
  const data = buf.getChannelData(0);
  const rand = rng(0x6a09e667);
  for (let i = 0; i < length; i++) data[i] = rand() * 2 - 1;
  noiseCache.set(c, buf);
  return buf;
}

// ---- voices -------------------------------------------------------------------------------------

/**
 * A voice kit bound to one context + output. Each primitive schedules nodes, records them
 * for disposal and returns its end time. Envelope: linear attack, an exponential fall to
 * -12 dB over the first 45% of the decay (the audible body), then on to -60 dB, after which
 * the sources stop (no clicks).
 */
function kit(c, out) {
  const nodes = [];
  let end = 0;
  const track = (...ns) => {
    for (const n of ns) nodes.push(n);
  };
  const finish = (t) => {
    if (t > end) end = t;
    return t;
  };

  function envelope(param, t, attack, decay, peak) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(peak * 0.25, t + attack + decay * 0.45);
    param.exponentialRampToValueAtTime(Math.max(peak * 1e-3, 1e-6), t + attack + decay);
    param.setValueAtTime(0, t + attack + decay + 0.002);
  }

  function panTo(node, pan) {
    if (!pan || typeof c.createStereoPanner !== 'function') {
      node.connect(out);
      return;
    }
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    p.connect(out);
    track(p);
  }

  return {
    nodes,
    get end() {
      return end;
    },

    /** Glassy FM bell: sine carrier, decaying sine modulator (ratio 3.5 = glass, 2 = soft keys). */
    bell({ f, t, decay = 0.25, peak = 0.1, ratio = 3.5, index = 1, attack = 0.003, pan = 0 }) {
      const carrier = c.createOscillator();
      carrier.frequency.setValueAtTime(f, t);
      const mod = c.createOscillator();
      mod.frequency.setValueAtTime(f * ratio, t);
      const depth = c.createGain();
      depth.gain.setValueAtTime(f * index, t);
      depth.gain.exponentialRampToValueAtTime(Math.max(f * index * 0.02, 0.01), t + attack + decay * 0.55);
      const vca = c.createGain();
      envelope(vca.gain, t, attack, decay, peak);
      mod.connect(depth);
      depth.connect(carrier.frequency);
      carrier.connect(vca);
      panTo(vca, pan);
      const stop = t + attack + decay + 0.02;
      carrier.start(t);
      mod.start(t);
      carrier.stop(stop);
      mod.stop(stop);
      track(carrier, mod, depth, vca);
      return finish(stop);
    },

    /** Warm tone: triangle (or `type`) + optional detuned twin, through a gentle lowpass. */
    warm({ f, t, decay = 0.3, peak = 0.06, attack = 0.012, cutoff = 2400, detune = 0, pan = 0, glideTo = 0, type = 'triangle' }) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(cutoff, t);
      lp.Q.value = 0.7;
      const vca = c.createGain();
      envelope(vca.gain, t, attack, decay, peak);
      const stop = t + attack + decay + 0.02;
      const oscs = detune ? [-detune, detune] : [0];
      for (const cents of oscs) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay * 0.8);
        o.detune.value = cents;
        o.connect(lp);
        o.start(t);
        o.stop(stop);
        track(o);
      }
      lp.connect(vca);
      panTo(vca, pan);
      track(lp, vca);
      return finish(stop);
    },

    /** Short pitch-gliding blip (sine): ticks and swipes. */
    blip({ f, to = f, t, glide = 0.04, decay = 0.06, peak = 0.08, attack = 0.002, pan = 0, type = 'sine' }) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (to !== f) o.frequency.exponentialRampToValueAtTime(to, t + glide);
      const vca = c.createGain();
      envelope(vca.gain, t, attack, decay, peak);
      o.connect(vca);
      panTo(vca, pan);
      const stop = t + attack + decay + 0.02;
      o.start(t);
      o.stop(stop);
      track(o, vca);
      return finish(stop);
    },

    /** Filtered noise: air, clicks and risers. The filter sweeps from `f` to `to`. */
    noise({ t, decay = 0.08, peak = 0.04, attack = 0.002, type = 'bandpass', f = 3000, to = f, q = 1, pan = 0 }) {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      const filter = c.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(f, t);
      if (to !== f) filter.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
      filter.Q.value = q;
      const vca = c.createGain();
      envelope(vca.gain, t, attack, decay, peak);
      src.connect(filter);
      filter.connect(vca);
      panTo(vca, pan);
      const stop = t + attack + decay + 0.02;
      const offset = (Math.floor(f) % 97) / 400; // deterministic, varied start inside the buffer
      src.start(t, offset);
      src.stop(stop);
      track(src, filter, vca);
      return finish(stop);
    },
  };
}

/**
 * Schedule `name` at time t into chain `ch` through its own level node and reverb send.
 * Returns { end, dispose() }; dispose() silences it immediately and releases every node.
 */
function schedule(c, ch, name, t, step) {
  const spec = SPECS[name];
  const out = c.createGain();
  out.gain.value = spec.gain;
  out.connect(ch.input);
  const send = c.createGain();
  send.gain.value = spec.verb;
  out.connect(send);
  send.connect(ch.reverb);
  const k = kit(c, out);
  RECIPES[name](k, t, step);
  return {
    end: k.end,
    dispose() {
      disconnect(out);
      disconnect(send);
      for (const n of k.nodes) disconnect(n);
    },
  };
}

// ---- the sound family -----------------------------------------------------------------------

const RECIPES = {
  // A barely-there glass tick for selections.
  tap(k, t) {
    k.bell({ f: N.A6, t, decay: 0.05, peak: 0.07, ratio: 4.2, index: 0.35, attack: 0.002 });
    k.noise({ t, decay: 0.012, peak: 0.02, type: 'highpass', f: 6500, q: 0.7 });
  },

  // Message sent: a soft upward swipe of air with a glassy blip riding on it.
  send(k, t) {
    k.noise({ t, decay: 0.13, peak: 0.032, attack: 0.02, type: 'bandpass', f: 1100, to: 4600, q: 0.9, pan: -0.1 });
    k.blip({ f: N.A5, to: N.E6, t: t + 0.01, glide: 0.07, decay: 0.12, peak: 0.075, attack: 0.006, pan: 0.05 });
    k.bell({ f: N.A6, t: t + 0.06, decay: 0.12, peak: 0.04, ratio: 2, index: 0.5, pan: 0.15 });
  },

  // Mission launch: a rising A-major arpeggio sweeping left to right over a swelling riser.
  launch(k, t) {
    k.noise({ t, decay: 0.24, peak: 0.022, attack: 0.14, type: 'bandpass', f: 520, to: 4200, q: 1.1 });
    k.warm({ f: N.A4, t, decay: 0.28, peak: 0.022, attack: 0.09, cutoff: 1900, detune: 7, pan: -0.1 });
    k.warm({ f: N.E5, t: t + 0.04, decay: 0.24, peak: 0.016, attack: 0.09, cutoff: 2200, detune: 7, pan: 0.1 });
    const notes = [N.A4, N.E5, N.A5, N.Cs6, N.E6];
    notes.forEach((f, i) => {
      k.bell({ f, t: t + i * 0.04, decay: 0.15 + i * 0.015, peak: 0.05 + i * 0.006, ratio: 2, index: 0.7, attack: 0.004, pan: -0.35 + i * 0.175 });
    });
    k.bell({ f: N.A6, t: t + 0.18, decay: 0.19, peak: 0.026, ratio: 3.5, index: 0.5, pan: 0.3 });
  },

  // One agent reported: a gentle two-note chime that climbs while agents keep finishing.
  'agent-done'(k, t, step = 0) {
    const i = Math.max(0, Math.min(LADDER.length - 3, step | 0));
    k.bell({ f: LADDER[i], t, decay: 0.15, peak: 0.06, ratio: 3.5, index: 0.55, pan: -0.15 });
    k.bell({ f: LADDER[i + 2], t: t + 0.07, decay: 0.19, peak: 0.066, ratio: 3.5, index: 0.5, pan: 0.15 });
  },

  // Mission complete: a warm suspension (D over A) resolving to A major, with a bell on top.
  'mission-done'(k, t) {
    k.warm({ f: N.A4, t, decay: 0.12, peak: 0.035, attack: 0.01, cutoff: 2600, pan: 0.1 });
    k.warm({ f: N.D5, t, decay: 0.12, peak: 0.035, attack: 0.01, cutoff: 2600, pan: -0.1 });
    const r = t + 0.11;
    k.warm({ f: N.A3, t: r, decay: 0.24, peak: 0.018, attack: 0.02, cutoff: 900, detune: 5 });
    k.warm({ f: N.A4, t: r, decay: 0.25, peak: 0.032, attack: 0.014, cutoff: 2400 });
    k.warm({ f: N.Cs5, t: r, decay: 0.25, peak: 0.036, attack: 0.014, cutoff: 2600, pan: -0.15 });
    k.warm({ f: N.E5, t: r, decay: 0.25, peak: 0.032, attack: 0.014, cutoff: 2600, pan: 0.15 });
    k.bell({ f: N.E6, t: r, decay: 0.25, peak: 0.045, ratio: 2, index: 0.45, attack: 0.006 });
    k.bell({ f: N.A6, t: r + 0.05, decay: 0.2, peak: 0.024, ratio: 3.5, index: 0.35, pan: 0.25 });
  },

  // Reply finished: a lighter resolve, the second degree settling onto a soft A-major third.
  'reply-done'(k, t) {
    k.bell({ f: N.B5, t, decay: 0.08, peak: 0.032, ratio: 2, index: 0.4, pan: -0.1 });
    const r = t + 0.07;
    k.bell({ f: N.A5, t: r, decay: 0.2, peak: 0.055, ratio: 2, index: 0.4, attack: 0.005, pan: -0.08 });
    k.bell({ f: N.Cs6, t: r, decay: 0.2, peak: 0.045, ratio: 2, index: 0.35, attack: 0.005, pan: 0.12 });
    k.warm({ f: N.A4, t: r, decay: 0.19, peak: 0.03, attack: 0.012, cutoff: 1800 });
  },

  // Something went wrong: two low, muted notes falling a minor third. Filtered saw waves keep
  // their harmonics in the band phone speakers reproduce; the sines add body on headphones.
  error(k, t) {
    k.warm({ f: N.E4, t, decay: 0.13, peak: 0.06, attack: 0.006, cutoff: 1350, type: 'sawtooth' });
    k.blip({ f: N.E3, t, decay: 0.13, peak: 0.018, attack: 0.006 });
    const r = t + 0.12;
    k.warm({ f: N.Cs4, t: r, decay: 0.17, peak: 0.056, attack: 0.006, cutoff: 1200, glideTo: N.Cs4 * 0.985, type: 'sawtooth' });
    k.blip({ f: N.Cs3, t: r, decay: 0.17, peak: 0.018, attack: 0.006 });
  },

  // Microphone opens: a crisp click and a quick upward tick.
  'listen-start'(k, t) {
    k.noise({ t, decay: 0.01, peak: 0.035, type: 'bandpass', f: 6200, q: 1.4 });
    k.blip({ f: N.E6, to: N.A6, t, glide: 0.03, decay: 0.055, peak: 0.075 });
  },

  // Microphone closes: the same click with the tick falling back.
  'listen-stop'(k, t) {
    k.noise({ t, decay: 0.01, peak: 0.03, type: 'bandpass', f: 4800, q: 1.4 });
    k.blip({ f: N.A6, to: N.E6, t, glide: 0.03, decay: 0.055, peak: 0.065 });
  },

  // Boot (the core assembling): FM bells climbing A4 → E5, then a soft C#6 bell as the state
  // word types itself in (+1.1 s).
  boot(k, t) {
    k.warm({ f: N.A3, t, decay: 0.5, peak: 0.014, attack: 0.08, cutoff: 900, detune: 6 });
    k.bell({ f: N.A4, t, decay: 0.32, peak: 0.05, ratio: 2, index: 0.8, attack: 0.006, pan: -0.15 });
    k.bell({ f: N.Cs5, t: t + 0.12, decay: 0.3, peak: 0.045, ratio: 2, index: 0.7, attack: 0.006, pan: 0 });
    k.bell({ f: N.E5, t: t + 0.24, decay: 0.42, peak: 0.05, ratio: 2, index: 0.7, attack: 0.006, pan: 0.15 });
    k.noise({ t: t + 0.05, decay: 0.5, peak: 0.01, attack: 0.25, type: 'bandpass', f: 700, to: 2600, q: 0.8 });
    k.bell({ f: N.Cs6, t: t + 1.1, decay: 0.45, peak: 0.032, ratio: 3.5, index: 0.45, attack: 0.008 });
  },

  // Optics capture: a 30 ms filtered-noise tick (the shutter) and an E6 glass ping.
  optics(k, t) {
    k.noise({ t, decay: 0.03, peak: 0.04, type: 'bandpass', f: 5200, q: 1.2 });
    k.bell({ f: N.E6, t: t + 0.02, decay: 0.16, peak: 0.06, ratio: 4.2, index: 0.5, attack: 0.002 });
  },

  // Scan: a 500 ms rising filtered-noise sweep, 800 → 3000 Hz.
  scan(k, t) {
    k.noise({ t, decay: 0.42, peak: 0.05, attack: 0.08, type: 'bandpass', f: 800, to: 3000, q: 1.6 });
  },

  // Needs-you item: a falling E5 → C#5, soft and clear.
  alert(k, t) {
    k.bell({ f: N.E5, t, decay: 0.2, peak: 0.06, ratio: 2, index: 0.6, attack: 0.004, pan: -0.08 });
    k.bell({ f: N.Cs5, t: t + 0.16, decay: 0.3, peak: 0.06, ratio: 2, index: 0.55, attack: 0.004, pan: 0.08 });
    k.warm({ f: N.A4, t: t + 0.16, decay: 0.26, peak: 0.016, attack: 0.012, cutoff: 1600 });
  },

  // Wake Jarvis: a soft swell, then bells climbing E5 → A5 → C#6 → E6 as the core boots (about 1.4 s).
  wake(k, t) {
    k.warm({ f: N.A3, t, decay: 0.9, peak: 0.016, attack: 0.35, cutoff: 1100, detune: 5 });
    k.noise({ t, decay: 0.7, peak: 0.009, attack: 0.4, type: 'bandpass', f: 500, to: 2200, q: 0.7 });
    k.bell({ f: N.E5, t: t + 0.28, decay: 0.32, peak: 0.045, ratio: 2, index: 0.7, attack: 0.006, pan: -0.15 });
    k.bell({ f: N.A5, t: t + 0.42, decay: 0.32, peak: 0.045, ratio: 2, index: 0.65, attack: 0.006, pan: -0.05 });
    k.bell({ f: N.Cs6, t: t + 0.56, decay: 0.36, peak: 0.045, ratio: 2, index: 0.6, attack: 0.006, pan: 0.05 });
    k.bell({ f: N.E6, t: t + 0.7, decay: 0.6, peak: 0.04, ratio: 3.5, index: 0.45, attack: 0.008, pan: 0.15 });
  },

  // Attention: two bright glass pings over a soft fundamental.
  notify(k, t) {
    k.warm({ f: N.A5, t, decay: 0.3, peak: 0.022, attack: 0.01, cutoff: 2400 });
    k.bell({ f: N.A6, t, decay: 0.2, peak: 0.065, ratio: 3.5, index: 0.8, pan: -0.12 });
    k.bell({ f: N.E7, t: t + 0.09, decay: 0.25, peak: 0.055, ratio: 3.5, index: 0.6, pan: 0.12 });
  },
};
