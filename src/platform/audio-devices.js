// Microphone and speaker on a computer (v8.1, SPEC §28.2-§28.3): the media side of src/lib/audio-devices.js.
// Settings → Voice → Microphone and speaker chooses a setup and the devices; this module makes every part of
// Jarvis use them and follows them when they come and go.
//
//   audioChoiceSupported(scope)   the card can be shown: AudioContext.setSinkId exists (Chrome or Edge on a
//                                 computer; not Safari, the iPhone or Firefox)
//   recognizerTakesTrack(scope)   the speech recognizer hears a track it is given (recognition.start(track))
//   micPermission(scope)          'granted' | 'denied' | 'prompt' | 'unknown'
//   enumerateAudio(scope)         Promise<listAudioDevices(enumerateDevices())>
//   showMyDevices(scope)          inside a tap, while the microphone isn't allowed: open the default microphone
//                                 and stop it at once (the names appear); Promise<{ ok, reason? }>
//   openMic(want, { scope })      Promise<{ stream, track, label, deviceId, fellBack, stop() }>: the device by
//                                 exact id with its processing; NotFoundError or OverconstrainedError fall back
//                                 to the default device (fellBack: true) instead of failing
//   firstSound(track, maxMs)      Promise<boolean>: true once the track delivers a non-zero sample (setup 3's
//                                 listen chime), false after maxMs
//
//   const audio = createAudioDevices({ getSettings, scope, phoneLike, playChime });
//   audio.supported()             the card is offered (a computer with setSinkId)
//   audio.plan() / audio.devices()   planSetup() now (with the watcher's confirmed absences) / the last list
//   audio.refresh()               enumerate now: Promise<devices> (the card; a track ended; George's context)
//   audio.check()                 the same, debounced (devicechange bursts)
//   audio.subscribe(fn)           fn(snapshot) after any change: { plan, devices, state, trackUse } -> off
//   audio.wakeAudio() / audio.questionAudio()   for Standby's capture and the home base's capture:
//                                 { id, processing } | null (null: nothing chosen, as before)
//   audio.wrapStt(stt)            stt.js's API with every listen given the question microphone's track
//                                 (audioTrack) when a microphone is chosen and the recognizer can take one
//   audio.addSink(target)         George's context, the sounds context, the music <audio>: target.setSink(id)
//                                 is called with the planned speaker ('' = default) now and on every change;
//                                 target.settle(ms) (George) after a Bluetooth microphone closes; target.probe()
//                                 after the Mac slept; target.onDevice(fn) (George's context: its error and
//                                 statechange events) makes the watcher check the devices. -> off
//   audio.noteMicClosed({ id, label })  a Jarvis microphone closed (capture.js onRelease): a Bluetooth one makes
//                                 George wait SETTLE_MS before he starts
//   audio.holdChime(name, opts)   setup 3: 'listen-start' waits for the question track's first sound (or 1.2 s);
//                                 true when held (the caller doesn't play it)
//   audio.standbyPill(device)     { name, gone } for the Standby pill (device: the capture's own), or null
//   audio.wakeKey(fellBack)       Standby's microphone as a key (its capture starts again when it changes)
//   audio.standbyHooks()          { pill, wakeKey, subscribe, check, onWoke, firstTimeLine } for createStandby
//   audio.awayLine()              once per absence: "I’m on the Mac’s speakers; the speakerphone isn’t connected."
//   audio.firstTimeLine()         Promise<string>: Standby's one-time Bluetooth line, or ''
//   audio.onWoke(fn)              the Mac slept (a long jump in Date.now()) -> off; the sleep check runs only
//                                 while someone listens (Standby)
//   audio.trackUse()              { at, used } the recognizer's last track (A10's card)
//   audio.destroy()
//
// Nothing here opens a microphone by itself: openMic runs for a listen or a Test the owner started, and
// showMyDevices only inside the owner's tap. With nothing chosen everything stays as before (no device ids,
// no setSinkId, recognition.start() as always).

import {
  AUDIO_NOTES,
  DEVICECHANGE_DEBOUNCE_MS,
  SETTLE_MS,
  SLEEP_CHECK_MS,
  SWITCH_CHIME_MAX_MS,
  audioConstraints,
  audioHotplugPlan,
  awayLine as awayLineFor,
  chosenDevices,
  clockJumped,
  describeAudioDevice,
  goneName,
  goneOf,
  initialHotplugState,
  isBluetooth,
  listAudioDevices,
  micPillName,
  planSetup,
  setupOf,
  trackStartSupport,
} from '../lib/audio-devices.js';

const FIRST_TIME_KEY = 'jarvis.audio.firstTimeLine';

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function mediaDevices(scope) {
  return safe(() => scope.navigator.mediaDevices, null) || null;
}

/** The card is offered: AudioContext.setSinkId exists (Chrome or Edge on a computer). */
export function audioChoiceSupported(scope = globalThis) {
  return safe(() => {
    const AC = scope.AudioContext;
    const md = mediaDevices(scope);
    return typeof AC === 'function' && typeof AC.prototype.setSinkId === 'function' && !!md && typeof md.enumerateDevices === 'function' && typeof md.getUserMedia === 'function';
  }, false);
}

/** The speech recognizer hears a track it is given (Chrome and Edge 135+ on a computer, Firefox 160+). */
export function recognizerTakesTrack(scope = globalThis) {
  return safe(() => {
    const n = scope.navigator || {};
    const uad = n.userAgentData || null;
    return trackStartSupport({ brands: uad && Array.isArray(uad.brands) ? uad.brands : null, mobile: uad ? uad.mobile === true : false, userAgent: String(n.userAgent || '') });
  }, false);
}

/** The microphone permission: 'granted' | 'denied' | 'prompt' | 'unknown'. */
export async function micPermission(scope = globalThis) {
  try {
    const p = await scope.navigator.permissions.query({ name: 'microphone' });
    return p && ['granted', 'denied', 'prompt'].includes(p.state) ? p.state : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The microphones and speakers listed now (listAudioDevices). */
export async function enumerateAudio(scope = globalThis) {
  const md = mediaDevices(scope);
  if (!md || typeof md.enumerateDevices !== 'function') return listAudioDevices([]);
  try {
    return listAudioDevices(await md.enumerateDevices());
  } catch {
    return listAudioDevices([]);
  }
}

function stopStream(stream) {
  try {
    for (const t of stream.getTracks()) t.stop();
  } catch {
    /* gone */
  }
}

/** Inside the owner's tap, before the microphone is allowed: ask once and let go at once (names appear). */
export async function showMyDevices(scope = globalThis) {
  const md = mediaDevices(scope);
  if (!md || typeof md.getUserMedia !== 'function') return { ok: false, reason: 'unsupported' };
  try {
    const s = await md.getUserMedia({ audio: true, video: false });
    stopStream(s);
    return { ok: true };
  } catch (err) {
    const name = String((err && err.name) || '');
    return { ok: false, reason: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error' };
  }
}

/**
 * Open a microphone for a listen or a Test: `want` { id, processing } (id '' = the default). A chosen device
 * that isn't there (NotFoundError, OverconstrainedError) falls back to the default device with fellBack.
 */
export async function openMic(want = {}, { scope = globalThis } = {}) {
  const md = mediaDevices(scope);
  if (!md || typeof md.getUserMedia !== 'function') {
    const e = new Error('No microphone API here.');
    e.name = 'NotSupportedError';
    throw e;
  }
  const w = want && typeof want === 'object' ? want : {};
  const constraints = audioConstraints(w.id ? { id: w.id } : null, w.processing);
  let stream;
  let fellBack = false;
  try {
    stream = await md.getUserMedia({ audio: constraints, video: false });
  } catch (err) {
    const name = String((err && err.name) || '');
    if (!constraints.deviceId || (name !== 'NotFoundError' && name !== 'OverconstrainedError')) throw err;
    const { deviceId, ...rest } = constraints;
    stream = await md.getUserMedia({ audio: rest, video: false });
    fellBack = true;
  }
  const track = (stream.getAudioTracks && stream.getAudioTracks()[0]) || null;
  if (!track) {
    stopStream(stream);
    const e = new Error('No microphone track.');
    e.name = 'NotFoundError';
    throw e;
  }
  return {
    stream,
    track,
    fellBack,
    label: String(track.label || ''),
    deviceId: safe(() => String(track.getSettings().deviceId || ''), ''),
    stop: () => stopStream(stream),
  };
}

/**
 * True once `track` delivers a non-zero sample (a Bluetooth microphone that has finished switching),
 * false after maxMs or where it can't be told. Listens through a small AudioContext of its own.
 */
export function firstSound(track, maxMs = SWITCH_CHIME_MAX_MS, scope = globalThis) {
  return new Promise((resolve) => {
    let done = false;
    let ctx = null;
    let timer = 0;
    let poll = 0;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      if (ctx) safe(() => ctx.close().catch(() => {}));
      resolve(v);
    };
    timer = setTimeout(() => finish(false), Math.max(0, maxMs));
    try {
      const AC = scope.AudioContext || scope.webkitAudioContext;
      const MS = scope.MediaStream;
      if (!AC || !MS || !track) return;
      ctx = new AC();
      const src = ctx.createMediaStreamSource(new MS([track]));
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      poll = setInterval(() => {
        if (track.readyState !== 'live') return finish(false);
        an.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] !== 0) return finish(true);
        }
        return undefined;
      }, 40);
    } catch {
      /* the timer decides */
    }
  });
}

/** A described device for a live track (its label and id), or null. */
function trackDevice(info) {
  if (!info || (!info.label && !info.id)) return null;
  const d = describeAudioDevice({ kind: 'audioinput', deviceId: info.id || '', label: info.label || '' });
  return d;
}

export function createAudioDevices({ getSettings = () => ({}), scope = globalThis, phoneLike = false, playChime = null, storage = null } = {}) {
  const settings = () => safe(() => getSettings() || {}, {});
  const listeners = new Set();
  const sinks = new Set();
  const wokeListeners = new Set();
  let devices = listAudioDevices([]);
  let listed = false; // at least one enumeration ran
  let hp = initialHotplugState();
  let recheckTimer = 0;
  let debounce = 0;
  let watching = false;
  let destroyed = false;
  let applied = ''; // the speaker id last given to the sinks ('' = the default, as before)
  let awayPending = false; // a chosen device went away since the last wake
  let trackUse = null; // { at, used }
  let sleepTimer = 0;
  let lastTick = 0;
  let chime = null; // { timer, opts } setup 3's held listen chime
  let lastChosenKey = '';

  const store = storage || {
    get: (k) => safe(() => scope.localStorage.getItem(k), null),
    set: (k, v) => safe(() => scope.localStorage.setItem(k, v)),
  };

  const supported = () => !phoneLike && audioChoiceSupported(scope);

  function plan() {
    const chosen = chosenDevices(settings());
    return planSetup(setupOf(settings()), devices, chosen, goneOf(hp, chosen));
  }

  function snapshot() {
    return { plan: plan(), devices, state: { ...hp }, trackUse, listed };
  }

  function emit() {
    if (destroyed) return;
    const snap = snapshot();
    for (const fn of [...listeners]) {
      try {
        fn(snap);
      } catch (err) {
        console.error('[jarvis] audio devices listener failed:', err);
      }
    }
  }

  // ---- the speaker ------------------------------------------------------------------------------------

  function speakerId() {
    const p = plan();
    return p.speaker && p.speaker.id && p.speaker.id !== 'default' ? p.speaker.id : '';
  }

  function applySinks(force = false) {
    if (!supported()) return;
    const id = speakerId();
    if (!force && id === applied) return;
    applied = id;
    for (const s of [...sinks]) giveSink(s, id);
  }

  function giveSink(target, id) {
    try {
      const p = target.setSink(id);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* a sink that can't move stays on the default */
    }
  }

  // ---- watching ----------------------------------------------------------------------------------------

  function chosenKey() {
    const s = settings();
    return `${setupOf(s)}|${s.audioInputId || ''}|${s.audioInputLabel || ''}|${s.audioOutputId || ''}|${s.audioOutputLabel || ''}`;
  }

  let seq = 0; // enumerations may overlap: only the newest one counts
  async function refresh() {
    if (destroyed) return devices;
    const md = mediaDevices(scope);
    if (!md || typeof md.enumerateDevices !== 'function') return devices;
    const my = ++seq;
    let list;
    try {
      list = listAudioDevices(await md.enumerateDevices());
    } catch {
      return devices;
    }
    if (destroyed || my !== seq) return devices;
    devices = list;
    listed = true;
    const r = audioHotplugPlan({ state: hp, devices: list, chosen: chosenDevices(settings()), now: Date.now() });
    hp = r.state;
    clearTimeout(recheckTimer);
    recheckTimer = 0;
    if (r.recheckAt) recheckTimer = setTimeout(() => refresh(), Math.max(0, r.recheckAt - Date.now()));
    for (const a of r.actions) {
      if (a.action === 'fallback') awayPending = true;
    }
    applySinks();
    emit();
    return devices;
  }

  function check() {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = 0;
      refresh();
    }, DEVICECHANGE_DEBOUNCE_MS);
  }

  const onDeviceChange = () => check();

  function watch() {
    if (watching || destroyed || !supported()) return;
    const md = mediaDevices(scope);
    if (!md || typeof md.addEventListener !== 'function') return;
    watching = true;
    md.addEventListener('devicechange', onDeviceChange);
  }

  /** Settings changed: a new choice is enumerated at once and applied. */
  function settingsChanged() {
    const key = chosenKey();
    if (key === lastChosenKey) return;
    lastChosenKey = key;
    awayPending = false;
    if (supported()) {
      watch();
      refresh();
    }
    applySinks();
    emit();
  }

  // ---- the Mac's sleep ----------------------------------------------------------------------------------

  function sleepCheck() {
    const now = Date.now();
    const jumped = clockJumped(lastTick, now, SLEEP_CHECK_MS);
    lastTick = now;
    if (!jumped) return;
    // The Mac slept: the devices may have changed under us, George's context may have stopped.
    refresh();
    for (const s of [...sinks]) safe(() => typeof s.probe === 'function' && s.probe());
    for (const fn of [...wokeListeners]) safe(() => fn());
  }

  function onWoke(fn) {
    if (typeof fn !== 'function') return () => {};
    wokeListeners.add(fn);
    if (!sleepTimer) {
      lastTick = Date.now();
      sleepTimer = setInterval(sleepCheck, SLEEP_CHECK_MS);
    }
    return () => {
      wokeListeners.delete(fn);
      if (!wokeListeners.size && sleepTimer) {
        clearInterval(sleepTimer);
        sleepTimer = 0;
      }
    };
  }

  // ---- microphones -------------------------------------------------------------------------------------

  function wakeAudio() {
    if (!supported()) return null;
    const p = plan();
    if (p.none) return null;
    return { id: p.wakeMic && p.wakeMic.id !== 'default' ? p.wakeMic.id : '', processing: p.wakeProcessing };
  }

  function questionAudio() {
    if (!supported()) return null;
    const p = plan();
    if (p.none) return null;
    return { id: p.questionMic && p.questionMic.id !== 'default' ? p.questionMic.id : '', processing: p.questionProcessing };
  }

  /** Standby's microphone as a key: its capture starts again when this changes (gone, back, a new choice). */
  function wakeKey(fellBack = false) {
    const w = wakeAudio();
    if (!w) return '';
    const p = w.processing || {};
    return `${fellBack ? '' : w.id}|${p.echoCancellation ? 1 : 0}${p.noiseSuppression ? 1 : 0}${p.autoGainControl ? 1 : 0}`;
  }

  function noteMicClosed(info = {}) {
    const d = trackDevice({ label: info && info.label, id: info && info.id });
    if (!d || !isBluetooth(d.transport)) return;
    for (const s of [...sinks]) safe(() => typeof s.settle === 'function' && s.settle(SETTLE_MS));
  }

  function noteTrackUse(used) {
    trackUse = { at: Date.now(), used: !!used };
    emit();
  }

  /** The question microphone's track for one listen, or null (the recognizer's own microphone, as before). */
  function questionTrack() {
    const want = questionAudio();
    if (!want || !want.id || !recognizerTakesTrack(scope)) {
      releaseChime(); // nothing to wait for
      return Promise.resolve(null);
    }
    return openMic(want, { scope }).then(
      (mic) => {
        const dev = trackDevice({ label: mic.label, id: mic.deviceId });
        if (chime) {
          firstSound(mic.track, SWITCH_CHIME_MAX_MS, scope).then(() => releaseChime());
        }
        let stopped = false;
        return {
          track: mic.track,
          label: mic.label,
          fellBack: mic.fellBack,
          stop: () => {
            if (stopped) return;
            stopped = true;
            mic.stop();
            if (dev && isBluetooth(dev.transport)) noteMicClosed({ label: mic.label });
          },
          used: (ok) => noteTrackUse(ok),
        };
      },
      () => {
        releaseChime();
        return null; // the recognizer's own microphone, as before
      },
    );
  }

  function wrapStt(stt) {
    if (!stt || typeof stt.startListening !== 'function') return stt;
    return {
      ...stt,
      startListening(options = {}) {
        const o = options && typeof options === 'object' ? options : {};
        if (o.audioTrack || !questionAudio() || !(questionAudio() || {}).id || !recognizerTakesTrack(scope)) return stt.startListening(o);
        return stt.startListening({ ...o, audioTrack: () => questionTrack() });
      },
    };
  }

  // ---- setup 3's listen chime ----------------------------------------------------------------------------

  function holdChime(name, opts) {
    if (name !== 'listen-start' || typeof playChime !== 'function' || !supported()) return false;
    const p = plan();
    if (p.setup !== 'switch' || !p.questionMic || !p.bluetoothMic || !recognizerTakesTrack(scope)) return false;
    releaseChime({ play: false });
    chime = { opts, timer: setTimeout(() => releaseChime(), SWITCH_CHIME_MAX_MS) };
    return true;
  }

  function releaseChime({ play = true } = {}) {
    const c = chime;
    if (!c) return;
    chime = null;
    clearTimeout(c.timer);
    if (play) safe(() => playChime('listen-start', c.opts));
  }

  // ---- what Standby and the wake say ----------------------------------------------------------------------

  /** The pill's names: the microphone Standby listens on, and a chosen speakerphone that went away. */
  function standbyPill(captureDevice) {
    if (!supported()) return null;
    const p = plan();
    if (p.none) return null;
    const live = trackDevice(captureDevice);
    const fell = !!(captureDevice && captureDevice.fellBack);
    const mic = live && live.label ? live : p.wakeMic || devices.defaultInput || null;
    const chosen = chosenDevices(settings());
    let gone = '';
    if (p.missing.input || fell) gone = goneName(describeLabelled(chosen.input && chosen.input.label));
    else if (p.missing.output) gone = goneName(describeLabelled(chosen.output && chosen.output.label, 'audiooutput'));
    return { name: micPillName(mic), gone };
  }

  function describeLabelled(label, kind = 'audioinput') {
    return label ? describeAudioDevice({ kind, label }) : null;
  }

  /** Once per absence, at the next wake: the line before the greeting ('' when all is well). */
  function awayLine() {
    if (!awayPending || !supported()) return '';
    const line = awayLineFor(plan(), devices);
    if (line) awayPending = false;
    return line;
  }

  /**
   * Standby's one-time line: nothing chosen, and the default output is Bluetooth (the names need the
   * microphone allowed: Standby asks once its capture is live). Said once on this device.
   */
  async function firstTimeLine() {
    if (!supported() || !plan().none) return '';
    if (store.get(FIRST_TIME_KEY)) return '';
    const list = await refresh();
    const out = list.defaultOutput;
    if (!out || !isBluetooth(out.transport)) return '';
    store.set(FIRST_TIME_KEY, String(Date.now()));
    return AUDIO_NOTES.firstTime;
  }

  function addSink(target) {
    if (!target || typeof target.setSink !== 'function') return () => {};
    sinks.add(target);
    if (applied) giveSink(target, applied);
    // George's context says when its output device went away (error) or it stopped: check the devices.
    const off = typeof target.onDevice === 'function' ? safe(() => target.onDevice(() => check()), null) : null;
    return () => {
      sinks.delete(target);
      if (typeof off === 'function') safe(() => off());
    };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Start: a choice made on this computer is enumerated (and its speaker applied) at once.
  lastChosenKey = chosenKey();
  if (supported() && !plan().none) {
    watch();
    refresh();
  }

  /** What Standby needs (src/ui/standby.js's `audio`). */
  function standbyHooks() {
    return { pill: standbyPill, wakeKey, subscribe, check, onWoke, firstTimeLine };
  }

  return {
    supported,
    plan,
    devices: () => devices,
    standbyHooks,
    wakeKey,
    snapshot,
    refresh,
    check,
    subscribe,
    settingsChanged,
    wakeAudio,
    questionAudio,
    questionTrack,
    wrapStt,
    addSink,
    noteMicClosed,
    holdChime,
    standbyPill,
    awayLine,
    firstTimeLine,
    onWoke,
    trackUse: () => trackUse,
    destroy() {
      destroyed = true;
      clearTimeout(recheckTimer);
      clearTimeout(debounce);
      if (sleepTimer) clearInterval(sleepTimer);
      sleepTimer = 0;
      releaseChime({ play: false });
      const md = mediaDevices(scope);
      if (watching && md) safe(() => md.removeEventListener('devicechange', onDeviceChange));
      watching = false;
      listeners.clear();
      sinks.clear();
      wokeListeners.clear();
    },
  };
}
