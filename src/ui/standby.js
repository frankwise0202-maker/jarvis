// Standby (SPEC §22): the ambient screen for a charger or a desk. A dim Presence display (the time,
// the date, the core breathing slowly, one status line), the screen kept awake, and, while it is
// open, Jarvis listening ON THIS DEVICE for two claps and (once its download is on) "Hey Jarvis".
// A small pill says truthfully what it listens for. Nothing leaves the device until he is woken.
//
//   const standby = createStandby({ getSettings, onSettingsChange, createCore, wakeLock,
//                                   createCapture, createWakeWord, statusLine, stateWord, chronometer,
//                                   onWake, onExit, unlock, pauseWhenHidden, isIOS, audio });
//   audio (v8.1, a computer; src/platform/audio-devices.js through app.js): { pill(captureDevice) -> { name,
//                         gone } | null, wakeKey(fellBack) -> string, subscribe(fn) -> off, check(),
//                         onWoke(fn) -> off, firstTimeLine() -> Promise<string> }: the pill names the
//                         microphone ("LISTENING ON THE MAC’S MICROPHONE · SPEAKERPHONE DISCONNECTED"), the
//                         capture moves when the chosen microphone goes and comes back, and starts again after
//                         the Mac slept; once, a line about setting up a Bluetooth speakerphone
//   standby.enter()       inside a tap where possible (iOS starts audio only there): show it, listen
//   standby.enter({ again: true })   v7.8.1: entered again without a tap (Voice Mode closed into Standby):
//                         unlock({ tap: false }), so what the voice knows about stuck audio stays
//   standby.resume()      after the wake routine (Voice Mode closed): show it again, listen again
//   standby.exit()        leave (a tap on the screen, Escape): the microphone is released
//   standby.isOpen() / standby.isAwaiting()   on screen / woken (Voice Mode up, coming back after)
//   standby.update()      the app's state changed (the status line)
//   standby.trigger(kind) wake it as if the owner clapped ('clap') or said "Hey Jarvis" ('word')
//
// Waking (two claps or "Hey Jarvis"): the microphone is released FIRST (never two captures at once:
// iOS refuses speech recognition while another capture runs), then onWake({ trigger }) opens Voice
// Mode with the wake routine. Leaving: a tap anywhere, Escape, or the wake routine.
//
// The page hidden: on a phone (pauseWhenHidden) listening pauses and comes back when Jarvis is on
// screen again (iOS stops it anyway); on a Mac it keeps listening in a background tab or window.
// v8.1: a capture that fails (the microphone busy or gone, its track ended) is tried again with back-off:
// 2 s, 5 s, 15 s, 60 s, then every 5 minutes (src/lib/audio-devices.js), also in the background on a Mac.
// OLED: a black page, dim text, the content shifted a few pixels every minute, dimmer after 5 min.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { CLAP_SENSITIVITIES } from '../lib/wake/clap.js';
import { createBackoff, captureRetryable } from '../lib/audio-devices.js';

const SHIFT_MS = 60000;
const DEEP_DIM_MS = 5 * 60000;
const SHIFTS = [
  [0, 0],
  [3, -2],
  [-2, 3],
  [2, 2],
  [-3, -1],
  [1, -3],
  [-1, 2],
  [3, 1],
];

export function createStandby(deps = {}) {
  const {
    getSettings = () => ({}),
    onSettingsChange = null,
    createCore = null,
    wakeLock = null,
    createCapture,
    createWakeWord = null,
    statusLine = () => '',
    stateWord = () => '',
    chronometer = defaultClock,
    onWake = () => {},
    onExit = () => {},
    unlock = () => {},
    pauseWhenHidden = false,
    isIOS = false,
    audio = null,
  } = deps;

  let phase = 'closed'; // 'closed' | 'open' | 'awaiting' (woken: Voice Mode is up)
  let root = null;
  let core = null;
  let capture = null;
  let word = null; // the "Hey Jarvis" client (created when the setting is on)
  let wordUnsubs = [];
  // the capture: 'off' | 'starting' | 'live' | 'paused' | 'waiting' ("Hey Jarvis" alone, not ready:
  // the microphone stays off) | 'denied' | 'no-mic' | 'needs-tap' | 'error' | 'unsupported'
  let listen = 'off';
  let clockTimer = 0;
  let shiftTimer = 0;
  let dimTimer = 0;
  let shiftIndex = 0;
  let unsubSettings = null;
  let offs = [];
  let lastTrigger = 0;
  let prevFocus = null;
  const els = {};
  // v8.1: the capture's retries (2 s, 5 s, 15 s, 60 s, then every 5 minutes), the microphone it started on,
  // and the watchers of the chosen devices and of the Mac's sleep while Standby is open.
  const retry = createBackoff(() => retryCapture());
  let startedKey = null;
  let audioOffs = [];
  let tipAsked = false;

  const settings = () => {
    try {
      return getSettings() || {};
    } catch {
      return {};
    }
  };
  const clapOn = () => settings().wakeClap !== false;
  const sensitivity = () => (CLAP_SENSITIVITIES.includes(settings().wakeClapSensitivity) ? settings().wakeClapSensitivity : 'normal');
  const wordOn = () => settings().wakeWord === true;

  // ------------------------------------------------------------------------------------- DOM

  function build() {
    els.canvas = h('canvas', { class: 'standby-core-canvas', attrs: { 'aria-hidden': 'true' } });
    els.core = h('div', { class: 'standby-core', attrs: { 'data-testid': 'standby-core', 'aria-hidden': 'true' } }, els.canvas);
    els.digits = h('span', { class: 'standby-digits' });
    els.period = h('span', { class: 'standby-period' });
    els.time = h('time', { class: 'standby-time', attrs: { 'data-testid': 'standby-time' } }, els.digits, els.period);
    els.date = h('p', { class: 'standby-date hud-label', attrs: { 'data-testid': 'standby-date' } });
    els.status = h('p', { class: 'standby-status', attrs: { 'data-testid': 'standby-status' } });
    els.word = h('p', { class: 'standby-state hud-label', attrs: { 'data-testid': 'standby-state' } });
    const info = h('div', { class: 'standby-info' }, els.time, els.date, els.word, els.status);
    els.stage = h('div', { class: 'standby-stage' }, els.core, info);
    els.pillDot = h('span', { class: 'standby-pill-dot', attrs: { 'aria-hidden': 'true' } });
    els.pillText = h('span', { class: 'standby-pill-text' });
    els.pill = h('p', { class: 'standby-pill', attrs: { 'data-testid': 'standby-pill', role: 'status' } }, els.pillDot, els.pillText);
    els.hint = h('p', { class: 'standby-hint', attrs: { 'data-testid': 'standby-hint' } });
    els.tip = h('p', { class: 'standby-hint standby-tip', hidden: true, attrs: { 'data-testid': 'standby-tip' } });
    els.leave = h('span', { class: 'standby-leave', attrs: { 'aria-hidden': 'true' } }, icon('moon', { size: 14 }), h('span', { text: 'Tap anywhere to leave Standby' }));
    const foot = h('div', { class: 'standby-foot' }, els.pill, els.hint, els.tip, els.leave);
    els.live = h('p', { class: 'visually-hidden', attrs: { 'aria-live': 'polite', 'data-testid': 'standby-announcer' } });
    root = h(
      'div',
      {
        class: 'standby',
        tabIndex: 0,
        attrs: {
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': 'Standby. Tap or press Escape to leave.',
          'data-testid': 'standby',
          'data-listening': 'off',
          'data-word': 'off',
          'data-clap': 'off',
          'data-dim': 'soft',
        },
        on: { click: onTap },
      },
      els.stage,
      foot,
      els.live,
    );
  }

  let inerted = []; // what Standby covers: made inert while it is open (aria-modal is true, and the
  // cores underneath sleep instead of drawing behind the black screen all night)

  function mount() {
    if (!root) build();
    try {
      prevFocus = document.activeElement;
    } catch {
      prevFocus = null;
    }
    if (!root.isConnected) document.body.appendChild(root);
    document.documentElement.classList.add('standby-open');
    root.hidden = false;
    for (const el of Array.from(document.body.children)) {
      if (el === root || el.inert || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE') continue;
      el.inert = true;
      inerted.push(el);
    }
    if (createCore && !core) {
      try {
        const size = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.4);
        core = createCore(els.canvas, { size, mode: 'hero', maxFps: 15 });
        if (core && typeof core.setState === 'function') core.setState('standby');
      } catch (err) {
        console.warn('[jarvis] standby core unavailable', err);
        core = null;
      }
    }
    try {
      root.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  function unmount() {
    if (!root) return;
    if (els.tip) els.tip.hidden = true; // v8.1: the one-time line is for that first Standby only
    for (const el of inerted) if (el.isConnected) el.inert = false;
    inerted = [];
    root.hidden = true;
    document.documentElement.classList.remove('standby-open');
    if (core) {
      try {
        core.destroy();
      } catch {
        /* ignore */
      }
      core = null;
    }
    root.remove();
  }

  // ------------------------------------------------------------------------------ lifecycle

  /**
   * Open Standby (call inside the tap that asked for it where possible). `again`: entered without a tap (Voice
   * Mode closed into Standby): the voice is told so (v7.8.1: what it knows about stuck audio stays).
   */
  function enter({ again = false } = {}) {
    if (phase === 'open') return;
    if (typeof createCapture !== 'function') return;
    try {
      unlock({ tap: !again }); // the voice that will greet the owner later is unlocked in this tap (iOS)
    } catch {
      /* decoration */
    }
    if (!capture) capture = createCapture({ onClap: () => trigger('clap'), onState: onCaptureState });
    try {
      capture.prepare(); // the AudioContext starts inside the tap (iOS)
    } catch {
      /* the start reports it */
    }
    open();
  }

  /** Back to Standby after the wake routine or a conversation (no tap needed: the context is ready). */
  function resume() {
    if (phase === 'open') return;
    if (!capture && typeof createCapture === 'function') capture = createCapture({ onClap: () => trigger('clap'), onState: onCaptureState });
    open();
  }

  function open() {
    phase = 'open';
    mount();
    shiftIndex = 0;
    applyShift();
    setDim('soft');
    keepAwake();
    tickClock();
    scheduleClock();
    shiftTimer = setInterval(() => {
      shiftIndex = (shiftIndex + 1) % SHIFTS.length;
      applyShift();
    }, SHIFT_MS);
    resetDim();
    if (!offs.length) {
      offs = [listenOn(document, 'visibilitychange', onVisibility), listenOn(window, 'pagehide', onPageHide), listenOn(document, 'keydown', onKey, true)];
    }
    if (typeof onSettingsChange === 'function' && !unsubSettings) unsubSettings = onSettingsChange(() => applySettings());
    watchAudio();
    render();
    announce(`Standby. ${listenSummary()}`);
    startListening();
  }

  /** Leave Standby (a tap, Escape): release the microphone and the screen. */
  function exit({ silent = false } = {}) {
    if (phase === 'closed') return;
    const was = phase;
    phase = 'closed';
    teardown();
    stopWord({ terminate: true });
    if (capture) {
      try {
        capture.close();
      } catch {
        /* ignore */
      }
      capture = null;
    }
    listen = 'off';
    unmount();
    if (was === 'open') {
      try {
        if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
    if (!silent) {
      try {
        onExit({ from: was });
      } catch (err) {
        console.error('[jarvis] standby exit failed:', err);
      }
    }
  }

  function teardown() {
    clearTimeout(clockTimer);
    clearInterval(shiftTimer);
    clearTimeout(dimTimer);
    clockTimer = shiftTimer = dimTimer = 0;
    for (const off of offs) off();
    offs = [];
    retry.cancel();
    for (const off of audioOffs) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
    audioOffs = [];
    if (unsubSettings) {
      try {
        unsubSettings();
      } catch {
        /* ignore */
      }
      unsubSettings = null;
    }
    allowSleep();
  }

  /** Two claps or "Hey Jarvis": release the microphone, then wake (Voice Mode, the routine). */
  function trigger(kind) {
    if (phase !== 'open') return false;
    const now = Date.now();
    if (now - lastTrigger < 1500) return false;
    lastTrigger = now;
    phase = 'awaiting';
    // The microphone goes first: Voice Mode's speech recognition must find it free (iOS).
    if (capture) capture.stop();
    listen = 'off';
    wordPortGiven = false;
    if (word) word.reset();
    teardown();
    unmount();
    try {
      onWake({ trigger: kind === 'word' ? 'word' : kind === 'clap' ? 'clap' : 'tap' });
    } catch (err) {
      console.error('[jarvis] waking failed:', err);
    }
    return true;
  }

  // ------------------------------------------------------------------------------ listening

  async function startListening() {
    if (phase !== 'open' || !capture) return;
    const wantClap = clapOn();
    const wantWord = wordOn();
    if (!wantClap && !wantWord) {
      capture.stop();
      listen = 'off';
      render();
      return;
    }
    if (pauseWhenHidden && document.hidden) {
      listen = 'paused';
      render();
      return;
    }
    if (wantWord) ensureWord();
    if (!wantClap && !wordReady()) {
      waitForWord();
      return;
    }
    listen = 'starting';
    wordPortGiven = false; // each start makes a new frames channel
    render();
    const res = await capture.start({ clap: wantClap, sensitivity: sensitivity(), word: wantWord && wordReady() });
    if (phase !== 'open') {
      if (res.ok) capture.stop();
      return;
    }
    if (res.ok && !clapOn() && !wordReady()) {
      // "Hey Jarvis" alone, and it stopped while the microphone started: nothing would listen.
      waitForWord();
      return;
    }
    if (!res.ok) {
      if (res.reason !== 'stopped') {
        listen = res.reason === 'needs-tap' ? 'needs-tap' : res.reason || 'error';
        if (captureRetryable(listen)) retry.failed(); // v8.1: busy or gone: tried again with back-off
        render();
      }
      return;
    }
    if (capture.context && capture.context.state !== 'running') {
      // The browser wants a tap before its audio runs (iOS outside a gesture): the microphone is not
      // held for nothing, and the pill asks for that tap.
      capture.stop();
      listen = 'needs-tap';
      render();
      return;
    }
    listen = 'live';
    retry.succeeded();
    startedKey = audio ? safeCall(() => audio.wakeKey(!!res.fellBack), null) : null;
    connectWord();
    render();
    firstTimeTip();
  }

  function onCaptureState(info) {
    if (phase !== 'open' || !info) return;
    if (info.state === 'off' && info.reason === 'ended' && listen === 'live') {
      // The system took the microphone (a call, another app) or it went away (the speakerphone turned
      // off): try again with back-off (v8.1; before, once after 1.5 s and only on screen).
      listen = 'paused';
      render();
      if (audio) safeCall(() => audio.check()); // gone? the device watcher decides (two enumerations)
      retry.failed();
    }
  }

  /** v8.1: a retry is due: start again unless Standby closed, listens already, or waits for the page (a phone). */
  function retryCapture() {
    if (phase !== 'open') return;
    if (listen !== 'paused' && !captureRetryable(listen)) return;
    if (pauseWhenHidden && document.hidden) return; // a phone: onVisibility starts it again
    startListening();
  }

  /**
   * v8.1: while Standby is open, follow the chosen microphone (gone: the default at once; back: the chosen
   * one), say on the pill which one listens, and start the capture again after the Mac slept.
   */
  function watchAudio() {
    if (!audio || audioOffs.length) return;
    const restartIfMoved = () => {
      if (phase !== 'open') return;
      const key = safeCall(() => audio.wakeKey(false), null);
      const moved = startedKey !== null && key !== null && key !== startedKey;
      if (moved && (listen === 'live' || captureRetryable(listen) || listen === 'paused')) {
        startListening();
        return;
      }
      render();
    };
    const off1 = safeCall(() => audio.subscribe(restartIfMoved), null);
    const off2 = safeCall(
      () =>
        audio.onWoke(() => {
          // The Mac slept: whatever the capture held may be stale; start it again (a phone pauses instead).
          if (phase === 'open' && (listen === 'live' || listen === 'paused' || captureRetryable(listen)) && !(pauseWhenHidden && document.hidden)) startListening();
        }),
      null,
    );
    audioOffs = [off1, off2].filter((f) => typeof f === 'function');
  }

  /** v8.1: once on this device, nothing chosen and a Bluetooth output: how to set it up. */
  function firstTimeTip() {
    if (!audio || tipAsked) return;
    tipAsked = true;
    Promise.resolve(safeCall(() => audio.firstTimeLine(), ''))
      .then((line) => {
        if (!line || !els.tip || phase === 'closed') return;
        setText(els.tip, line);
        els.tip.hidden = false;
      })
      .catch(() => {});
  }

  function ensureWord() {
    if (word || typeof createWakeWord !== 'function') return;
    try {
      word = createWakeWord();
    } catch (err) {
      console.warn('[jarvis] the wake word could not be created', err);
      word = null;
      return;
    }
    wordUnsubs = [
      word.subscribe(() => {
        if (phase === 'open') {
          if (wordReady() && listen === 'live') connectWord();
          else if (wordReady() && listen === 'waiting') startListening(); // its download is done
          else if (!wordReady() && !clapOn() && (listen === 'live' || listen === 'starting')) waitForWord(); // it failed
        }
        render();
      }),
      word.onDetect(() => trigger('word')),
    ];
    word.start().catch(() => render());
  }

  function wordReady() {
    return !!word && word.status().state === 'ready';
  }

  /**
   * "Hey Jarvis" alone (claps off) and not ready yet (downloading, or its download failed): the
   * microphone is not held while nothing listens. It starts once the word is ready.
   */
  function waitForWord() {
    if (capture) capture.stop();
    wordPortGiven = false;
    listen = 'waiting';
    render();
  }

  let wordPortGiven = false; // the worker has this start's frames channel
  function connectWord() {
    if (!capture || !word || !wordReady() || listen !== 'live' || wordPortGiven) return;
    const port = capture.wordPort();
    if (port && word.attach(port)) {
      wordPortGiven = true;
      capture.configure({ word: true });
      render();
    }
  }

  function stopWord({ terminate = false } = {}) {
    wordPortGiven = false;
    if (!word) return;
    if (terminate) {
      for (const u of wordUnsubs) {
        try {
          u();
        } catch {
          /* ignore */
        }
      }
      wordUnsubs = [];
      try {
        word.stop();
      } catch {
        /* ignore */
      }
      word = null;
    }
  }

  function applySettings() {
    if (phase !== 'open') return;
    if (!wordOn() && word) {
      if (capture) capture.configure({ word: false });
      stopWord({ terminate: true });
    }
    const listening = listen === 'live' || listen === 'starting';
    // Not listening yet, or claps just turned off while "Hey Jarvis" is not ready: (re)decide.
    const recheck = !listening || (!clapOn() && !wordReady());
    if ((clapOn() || wordOn()) && recheck && listen !== 'denied' && listen !== 'needs-tap') {
      startListening();
      return;
    }
    if (!clapOn() && !wordOn()) {
      if (capture) capture.stop();
      listen = 'off';
    } else if (capture) {
      capture.configure({ clap: clapOn(), sensitivity: sensitivity() });
      if (wordOn()) {
        ensureWord();
        connectWord();
      }
    }
    render();
  }

  // ------------------------------------------------------------------------------- events

  function onTap(event) {
    if (phase !== 'open') return;
    if (event) event.preventDefault();
    // iOS may want one tap before its microphone and audio start: this tap starts them.
    if (listen === 'needs-tap' && capture) {
      capture.prepare();
      startListening();
      return;
    }
    exit();
  }

  function onKey(event) {
    if (phase !== 'open') return;
    if (event.key === 'Escape' || event.key === 'Esc' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      exit();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault(); // nothing else to reach: the whole screen is the one control
      return;
    }
    event.stopPropagation(); // the app's shortcuts do not act underneath
  }

  function onVisibility() {
    if (phase !== 'open') return;
    if (document.hidden) {
      if (pauseWhenHidden) {
        // A phone: Jarvis listens only while he is on screen.
        if (capture) capture.stop();
        if (word) word.reset();
        wordPortGiven = false;
        listen = 'paused';
        render();
      }
      return;
    }
    tickClock();
    if (listen === 'paused' || listen === 'off') startListening();
  }

  function onPageHide() {
    if (phase === 'closed') return;
    if (capture) capture.stop();
    wordPortGiven = false;
    listen = 'paused';
  }

  // ------------------------------------------------------------------------------- render

  function listensFor() {
    const out = [];
    if (listen !== 'live') return out;
    if (clapOn()) out.push('TWO CLAPS');
    if (wordOn() && wordReady() && wordPortGiven) out.push('“HEY JARVIS”');
    return out;
  }

  function listenSummary() {
    const what = listensFor();
    if (!what.length) return 'Not listening. Tap to leave.';
    return `Listening on this device for ${what.map((w) => w.toLowerCase()).join(' and ')}.`;
  }

  function render() {
    if (!root) return;
    const what = listensFor();
    root.dataset.listening = listen;
    root.dataset.clap = clapOn() && listen === 'live' ? 'on' : 'off';
    const ws = word ? word.status() : null;
    root.dataset.word = !wordOn() || !ws ? 'off' : ws.state === 'ready' ? (wordPortGiven ? 'ready' : 'connecting') : ws.state;
    // The wake word's cost: its worker's average inference time per 80 ms frame (diagnostics).
    if (ws && Number.isFinite(ws.avgMs)) root.dataset.wordMs = String(ws.avgMs);
    let pill;
    let tone = 'off';
    const micOn = !!capture && capture.live === true;
    const wordComing = wordOn() && (!ws || ws.state === 'loading' || ws.state === 'off' || (ws.state === 'ready' && !wordPortGiven));
    // v8.1: the microphone it listens on, when one is chosen (else "this device", as before).
    const named = audio && micOn ? safeCall(() => audio.pill(capture.device), null) : null;
    if (what.length && named && named.gone) {
      pill = `LISTENING ON ${named.name} · ${named.gone} DISCONNECTED`;
      tone = 'live';
    } else if (what.length) {
      pill = `LISTENING ON ${named ? named.name : 'THIS DEVICE'} · ${what.join(' · ')}`;
      tone = 'live';
    } else if (listen === 'starting') {
      pill = 'STARTING THE MICROPHONE…';
    } else if (micOn) {
      // A track is live but nothing listens yet ("Hey Jarvis" connecting): the pill says the
      // microphone is on, as the system's own indicator does.
      pill = wordComing ? 'MICROPHONE ON · GETTING “HEY JARVIS” READY' : 'MICROPHONE ON';
      tone = 'live';
    } else if (listen === 'waiting') {
      // "Hey Jarvis" alone: the microphone waits for it (off meanwhile).
      pill = wordComing ? 'GETTING “HEY JARVIS” READY · MICROPHONE OFF' : 'NOT LISTENING';
      tone = wordComing ? 'off' : 'warn';
    } else if (listen === 'paused') {
      pill = 'MICROPHONE PAUSED';
    } else if (listen === 'denied') {
      pill = 'MICROPHONE BLOCKED · NOT LISTENING';
      tone = 'warn';
    } else if (listen === 'no-mic') {
      pill = 'NO MICROPHONE · NOT LISTENING';
      tone = 'warn';
    } else if (listen === 'needs-tap') {
      pill = 'TAP ONCE TO START LISTENING';
      tone = 'warn';
    } else if (listen === 'error' || listen === 'busy' || listen === 'unsupported') {
      pill = 'NOT LISTENING';
      tone = 'warn';
    } else {
      pill = 'NOT LISTENING';
    }
    setText(els.pillText, pill);
    els.pill.dataset.tone = tone;
    els.pill.setAttribute('aria-label', what.length ? `The microphone is on, on this device only, listening for ${what.map((w) => w.toLowerCase()).join(' and ')}.` : micOn ? `The microphone is on, on this device only${wordComing ? '; “Hey Jarvis” is getting ready' : ''}.` : pill.toLowerCase());
    setText(els.hint, hintText(what, ws));
    setText(els.status, safeText(statusLine));
    const word0 = safeText(stateWord);
    setText(els.word, word0 && word0 !== 'STANDING BY' ? word0 : '');
    els.word.hidden = !els.word.textContent;
  }

  function hintText(what, ws) {
    const both = clapOn() && wordOn();
    if (listen === 'denied') return 'Allow the microphone for Jarvis in your browser’s settings to wake him by clapping or by voice.';
    if (listen === 'no-mic') return 'Connect a microphone to wake Jarvis by clapping or by voice.';
    if (listen === 'needs-tap') return 'This browser needs one tap before it listens.';
    if (listen === 'paused' && retry.pending) return 'The microphone stopped. Jarvis tries it again by himself.';
    if (listen === 'paused') return isIOS ? 'Jarvis listens only while he is open on screen.' : 'Listening resumes when Jarvis is on screen again.';
    if ((listen === 'busy' || listen === 'error') && retry.pending) return 'The microphone is busy. Jarvis tries it again by himself.';
    if (!clapOn() && !wordOn()) return 'Turn on Clap twice or Say “Hey Jarvis” in Settings → Voice → Wake Jarvis.';
    if (wordOn() && ws && ws.state === 'loading') {
      const pct = ws.total ? Math.round((ws.loaded / ws.total) * 100) : 0;
      return `Getting “Hey Jarvis” ready… ${pct}%${clapOn() ? ' Two claps work meanwhile.' : ''}`;
    }
    if (wordOn() && ws && ws.state === 'error') return `“Hey Jarvis” couldn’t load${ws.error && ws.error.code === 'network' ? ' (offline?)' : ''}.${clapOn() ? ' Two claps still work.' : ''}`;
    if (!what.length) return '';
    const how = both && what.length === 2 ? 'Clap twice or say “Hey Jarvis”' : what[0] === 'TWO CLAPS' ? 'Clap twice' : 'Say “Hey Jarvis”';
    return `${how} to wake Jarvis.${isIOS ? ' He listens only while he is open on screen.' : ''}`;
  }

  function safeCall(fn, fallback) {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  function safeText(fn) {
    try {
      const v = fn();
      return typeof v === 'string' ? v : '';
    } catch {
      return '';
    }
  }

  function tickClock() {
    if (!root) return;
    const c = chronometer(new Date());
    setText(els.digits, c.digits || '');
    setText(els.period, c.period || '');
    els.period.hidden = !c.period;
    setText(els.date, c.date || '');
    els.time.setAttribute('datetime', new Date().toISOString());
  }

  function scheduleClock() {
    clearTimeout(clockTimer);
    const now = new Date();
    const ms = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50;
    clockTimer = setTimeout(() => {
      tickClock();
      render();
      scheduleClock();
    }, ms);
  }

  function applyShift() {
    if (!els.stage) return;
    const [x, y] = SHIFTS[shiftIndex];
    els.stage.style.transform = x || y ? `translate(${x}px, ${y}px)` : '';
  }

  function setDim(level) {
    if (root) root.dataset.dim = level;
  }

  function resetDim() {
    clearTimeout(dimTimer);
    setDim('soft');
    dimTimer = setTimeout(() => setDim('deep'), DEEP_DIM_MS);
  }

  function announce(text) {
    if (els.live) setText(els.live, text);
  }

  function keepAwake() {
    try {
      if (wakeLock && typeof wakeLock.keepAwake === 'function') wakeLock.keepAwake();
    } catch {
      /* ignore */
    }
  }

  function allowSleep() {
    try {
      if (wakeLock && typeof wakeLock.allowSleep === 'function') wakeLock.allowSleep();
    } catch {
      /* ignore */
    }
  }

  return {
    enter,
    resume,
    exit,
    trigger,
    update: () => {
      if (phase === 'open') render();
    },
    isOpen: () => phase === 'open',
    isAwaiting: () => phase === 'awaiting',
    /** The owner is done with the woken session (Voice Mode closed and no return): fully closed. */
    release: () => {
      if (phase === 'awaiting') exit({ silent: true });
    },
    get listening() {
      return listen;
    },
  };
}

function listenOn(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

function defaultClock(d) {
  return { digits: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, period: '', date: d.toDateString().toUpperCase() };
}
