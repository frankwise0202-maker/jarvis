// Optics: Jarvis's camera screen (report §2.4.9 / §4.1). A full-screen overlay (src/ui/overlay.js)
// with the live camera, a LIVE pill (tap = camera off), and a control deck: an ask field with a
// mic, then Flip · LOOK · Watch (· Screen on computers).
//
//   LOOK    flash, freeze the full frame (≤ 1,280 px, JPEG), send it with the owner's question as a
//           normal turn of the current conversation (deps.look), stream the answer into a sheet and
//           pin Claude's labels (pin_labels) on the frozen frame, EDITH style. Follow-up questions
//           while frozen reuse the frame (deps.ask).
//   Watch   sends a frame only when the scene changes (frame differencing on a 64 px thumbnail):
//           at most one every 10 s, off after 5 minutes, with a countdown and the cost so far.
//   Screen  "look at my screen" (computers): one frame of the screen, then the capture stops.
//
//   openOptics(deps) -> { close(), el }   isOpticsOpen()   opticsCameraBridge (engine deps.camera)
//   deps: { look({ text, frame }) -> Promise<{ run } | { error }>, ask({ text }) -> same,
//           watchLook(frame, { goal, previous, signal }) -> Promise<{ ok, worthSaying, line, summary, costUsd }>,
//           getSettings(), stt?, sttSupported?, sounds?, wakeLock?: { keepAwake, allowSleep },
//           fallbackPhoto?(), onLiveChange?({ camera, watch }), onClose?(), watchOptions?, review? }
//   review: { preview, width, height, source, question, answer, pins, frameId } opens a past Look
//           (from the chat) frozen, without starting the camera.
//   start: 'screen' opens straight into "look at my screen" (call from the tap: getDisplayMedia
//           needs the gesture); the camera starts only if the owner taps Camera later.
//
// Privacy: the camera runs only while this screen is open and visible (src/platform/camera.js);
// nothing is sent until LOOK (or Watch, which the owner starts and which shows its countdown).

import '../../styles/optics.css';
import { h, setText } from '../dom.js';
import { icon } from '../icons.js';
import { openOverlay } from '../overlay.js';
import { renderMarkdown } from '../../lib/markdown.js';
import {
  CameraError,
  cameraPermission,
  cameraPlatform,
  cameraSupported,
  captureScreenFrame,
  classifyCameraError,
  createCamera,
  deniedHelp,
  releaseCanvas,
  screenLookSupported,
} from '../../platform/camera.js';
import { OPTICS_LIMITS, WATCH_DEFAULTS, createChangeDetector, estimateLookCost, estimateWatchCost, fitTransform, formatUsd, frameToView, layoutPins } from '../../lib/optics.js';

const INTRO_KEY = 'jarvis.optics.intro.v1';
const WATCH_DAY_KEY = 'jarvis.optics.watch.v1';
const SOURCE_LABEL = { rear: 'REAR', front: 'FRONT', camera: 'CAMERA', screen: 'SCREEN' };
const DESKTOP_MQ = '(min-width: 900px)';

let current = null;

export function isOpticsOpen() {
  return !!current;
}

/** The live camera for the engine's look_through_camera (deps.camera): follows the open Optics. */
export const opticsCameraBridge = Object.freeze({
  isLive: () => !!(current && current.cameraLive()),
  source: () => (current ? current.cameraFacing() : 'camera'),
  grab: (opts) => (current ? current.grabForJarvis(opts) : Promise.resolve(null)),
});

const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  },
};

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const timeLabel = (at = Date.now()) => {
  try {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function watchLooksToday() {
  try {
    const v = JSON.parse(store.get(WATCH_DAY_KEY) || '{}');
    return v.day === todayKey() ? Number(v.looks) || 0 : 0;
  } catch {
    return 0;
  }
}

function countWatchLook() {
  store.set(WATCH_DAY_KEY, JSON.stringify({ day: todayKey(), looks: watchLooksToday() + 1 }));
}

/** Text width of a pin label, measured with the plate's computed font (+1 px for rounding). */
let measureCtx = null;
let measureFont = '';
function measureLabel(text, host) {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureFont && host) {
      const probe = document.createElement('span');
      probe.className = 'optics-plate';
      probe.style.visibility = 'hidden';
      host.append(probe);
      const cs = getComputedStyle(probe);
      measureFont = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      probe.remove();
    }
    measureCtx.font = measureFont || '500 13px sans-serif';
    return Math.ceil(measureCtx.measureText(text).width) + 1;
  } catch {
    return text.length * 8;
  }
}

/**
 * Opens Optics. Call it from a tap: iOS asks for the camera only inside a user gesture.
 */
export function openOptics(deps = {}) {
  if (current) return current.api;
  const settings = () => {
    try {
      return (deps.getSettings && deps.getSettings()) || {};
    } catch {
      return {};
    }
  };
  const watchOpts = { ...WATCH_DEFAULTS, ...(deps.watchOptions || {}) };
  const leadModel = () => settings().leadModel || 'claude-opus-5-5';
  const watchModel = () => (deps.watchOptions && deps.watchOptions.model) || leadModel();
  // The app knows whether the conversation's prompt is still cached (a cold chat costs more).
  const lookCost = () => {
    try {
      if (typeof deps.lookEstimate === 'function') return deps.lookEstimate();
    } catch {
      /* fall back */
    }
    return estimateLookCost({ model: leadModel() }).usd;
  };

  // ---- DOM ----------------------------------------------------------------------------------
  const video = h('video', { class: 'optics-video', attrs: { 'data-testid': 'optics-video', 'aria-hidden': 'true' } });
  const frozenHost = h('div', { class: 'optics-frozen', attrs: { 'data-testid': 'optics-frozen', 'aria-hidden': 'true' } });
  const brackets = h('div', { class: 'optics-brackets', attrs: { 'aria-hidden': 'true' } }, h('i'), h('i'), h('i'), h('i'));
  const reticle = h(
    'svg',
    { class: 'optics-reticle', attrs: { viewBox: '0 0 72 72', width: '72', height: '72', 'aria-hidden': 'true' } },
    h('circle', { cx: '36', cy: '36', r: '28', fill: 'none', stroke: 'currentColor', 'stroke-width': '1' }),
    h('path', { d: 'M36 0v8M36 64v8M0 36h8M64 36h8', stroke: 'currentColor', 'stroke-width': '1' }),
  );
  const scan = h('div', { class: 'optics-scan', attrs: { 'aria-hidden': 'true' } });
  const flash = h('div', { class: 'optics-flash', attrs: { 'aria-hidden': 'true' } });
  const leaders = h('svg', { class: 'optics-leaders', attrs: { 'aria-hidden': 'true' } });
  const pinsLayer = h('div', { class: 'optics-pins', attrs: { 'data-testid': 'optics-pins', 'aria-hidden': 'true' } }, leaders);
  const card = h('div', { class: 'optics-card', hidden: true, attrs: { 'data-testid': 'optics-card' } });
  const stage = h('div', { class: 'optics-stage' }, video, frozenHost, brackets, reticle, scan, pinsLayer, flash, card);

  const title = h('span', { class: 'optics-title', text: 'OPTICS' });
  const sub = h('span', { class: 'optics-sub', attrs: { 'data-testid': 'optics-sub' } });
  const pillText = h('span', { class: 'optics-pill-text', text: 'OPTICS' });
  const livePill = h(
    'button',
    { class: 'optics-pill', type: 'button', hidden: true, attrs: { 'data-testid': 'optics-live-pill', 'aria-label': 'Camera is on. Turn it off' }, on: { click: () => close('pill') } },
    h('span', { class: 'optics-pill-dot', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'optics-pill-live', text: 'LIVE' }),
    pillText,
  );
  const closeBtn = h(
    'button',
    { class: 'optics-close', type: 'button', attrs: { 'data-testid': 'optics-close', 'aria-label': 'Close Optics' }, on: { click: () => close('button') } },
    icon('close', { size: 20 }),
  );
  const top = h('div', { class: 'optics-top' }, h('div', { class: 'optics-titles' }, title, sub), h('div', { class: 'optics-top-actions' }, livePill, closeBtn));

  // Watch HUD
  const watchClock = h('span', { class: 'optics-watch-clock', attrs: { 'data-testid': 'optics-watch-clock' } });
  const watchStats = h('span', { class: 'optics-watch-stats', attrs: { 'data-testid': 'optics-watch-cost' } });
  const watchNote = h('p', { class: 'optics-watch-note', attrs: { 'data-testid': 'optics-watch-note', 'aria-live': 'polite' } });
  const watchHud = h('div', { class: 'optics-watch', hidden: true, attrs: { 'data-testid': 'optics-watch' } }, h('div', { class: 'optics-watch-row' }, h('span', { class: 'optics-watch-dot', attrs: { 'aria-hidden': 'true' } }), watchClock, watchStats), watchNote);

  // Answer sheet (phone: above the deck; desktop: the side column)
  const answerState = h('span', { class: 'optics-answer-state', attrs: { 'data-testid': 'optics-answer-status' } });
  const answerCost = h('span', { class: 'optics-answer-cost', attrs: { 'data-testid': 'optics-answer-cost' } });
  const answerQ = h('p', { class: 'optics-answer-q' });
  const answerBody = h('div', { class: 'optics-answer-body prose', attrs: { 'data-testid': 'optics-answer-text', 'aria-live': 'polite' } });
  const pinList = h('ul', { class: 'optics-pin-list', attrs: { 'data-testid': 'optics-pin-list', 'aria-label': 'Pinned labels' } });
  const liveBtn = h('button', { class: 'btn btn-sm optics-live-btn', type: 'button', attrs: { 'data-testid': 'optics-live' }, on: { click: () => backToLive() } }, icon('camera', { size: 16 }), h('span', { text: 'Live' }));
  const moreBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'optics-ask-more' }, on: { click: () => askInput.focus() } }, h('span', { text: 'Ask more' }));
  const inChat = h('span', { class: 'optics-in-chat', text: 'In chat ✓', hidden: true });
  const answer = h(
    'section',
    { class: 'optics-answer', hidden: true, attrs: { 'data-testid': 'optics-answer', 'aria-label': 'Jarvis’s answer' } },
    h('div', { class: 'optics-answer-head' }, answerState, answerCost),
    answerQ,
    answerBody,
    pinList,
    h('div', { class: 'optics-answer-actions' }, liveBtn, moreBtn, inChat),
  );
  const logList = h('ol', { class: 'optics-log-list' });
  const log = h('section', { class: 'optics-log', attrs: { 'data-testid': 'optics-log', 'aria-label': 'Optics log' } }, h('h2', { class: 'optics-log-title', text: 'OPTICS LOG' }), logList);
  const side = h('div', { class: 'optics-side' }, answer, log);

  // Deck
  const askInput = h('input', {
    class: 'optics-ask',
    type: 'text',
    placeholder: 'Ask about what you see…',
    autocomplete: 'off',
    enterKeyHint: 'send',
    attrs: { 'data-testid': 'optics-ask', 'aria-label': 'Ask about what you see', maxlength: '500' },
    on: { keydown: (e) => onAskKey(e) },
  });
  const micBtn = h('button', { class: 'optics-mic', type: 'button', hidden: !deps.sttSupported, attrs: { 'data-testid': 'optics-mic', 'aria-label': 'Ask by voice', 'aria-pressed': 'false' }, on: { click: () => toggleMic() } }, icon('mic', { size: 20 }));
  const flipBtn = h('button', { class: 'optics-key', type: 'button', attrs: { 'data-testid': 'optics-flip', 'aria-label': 'Switch camera', title: 'Switch camera (F)' }, on: { click: () => flip() } }, icon('refresh', { size: 22 }), h('span', { class: 'optics-key-label', text: 'Flip' }));
  const lookCaption = h('span', { class: 'optics-look-cost', attrs: { 'data-testid': 'optics-look-cost' } });
  const lookBtn = h(
    'button',
    { class: 'optics-shutter', type: 'button', attrs: { 'data-testid': 'optics-look', 'aria-label': 'Look: send this frame to Jarvis', title: 'Look (Space)' }, on: { click: () => look() } },
    h('span', { class: 'optics-shutter-ring', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'optics-shutter-label', text: 'LOOK' }),
  );
  const watchBtn = h('button', { class: 'optics-key', type: 'button', attrs: { 'data-testid': 'optics-watch-toggle', 'aria-label': 'Watch: look again when the scene changes', 'aria-pressed': 'false', title: 'Watch (W)' }, on: { click: () => toggleWatch() } }, icon('eye', { size: 22 }), h('span', { class: 'optics-key-label', text: 'Watch' }));
  const screenBtn = screenLookSupported()
    ? h('button', { class: 'optics-key', type: 'button', attrs: { 'data-testid': 'optics-screen', 'aria-label': 'Look at my screen', title: 'Look at my screen (one frame)' }, on: { click: () => lookAtScreen() } }, icon('laptop', { size: 22 }), h('span', { class: 'optics-key-label', text: 'Screen' }))
    : null;
  const keys = h('div', { class: 'optics-keys' }, flipBtn, h('div', { class: 'optics-shutter-wrap' }, lookBtn, lookCaption), watchBtn, screenBtn);
  const deck = h('div', { class: 'optics-deck' }, h('div', { class: 'optics-ask-row' }, askInput, micBtn), keys);
  const live = h('div', { class: 'visually-hidden', attrs: { 'aria-live': 'polite', role: 'status' } });
  const main = h('div', { class: 'optics-main' }, stage, deck);

  const el = h(
    'div',
    { class: 'optics', attrs: { 'data-testid': 'optics', 'aria-label': 'Optics, the camera', 'data-state': 'starting', 'data-camera': 'off' } },
    main,
    side,
    top,
    watchHud,
    live,
  );

  // ---- state ---------------------------------------------------------------------------------
  let mode = 'starting'; // intro | starting | live | frozen | paused | error | review | closed
  let frozen = null; // { canvas|img, width, height, source, mirrored, preview, frameId, pins, question, text, status, costUsd, run, unsub }
  let followups = []; // [{ question, text, status }]
  let watch = null;
  let mic = null;
  let closed = false;
  let resumeOnVisible = false;
  const offs = [];
  const camera = createCamera({ video, onState: onCameraState });
  const desktopMq = window.matchMedia ? window.matchMedia(DESKTOP_MQ) : null;

  function setMode(next) {
    mode = next;
    el.dataset.state = next;
    el.dataset.frozen = frozen && (next === 'frozen' || next === 'review') ? 'true' : 'false';
    const liveNow = camera.live;
    deck.dataset.frozen = el.dataset.frozen;
    lookBtn.disabled = !(liveNow && (next === 'live' || next === 'frozen')) || isBusy();
    flipBtn.disabled = !(liveNow && camera.canFlip) || !!watch;
    watchBtn.disabled = !(liveNow && (next === 'live' || watch));
    if (screenBtn) screenBtn.disabled = isBusy() || !!watch;
    syncTop();
    renderLookCost();
  }

  function isBusy() {
    return !!(frozen && frozen.status === 'analyzing') || followups.some((f) => f.status === 'analyzing');
  }

  function announce(text) {
    setText(live, '');
    setTimeout(() => setText(live, text), 30);
  }

  function syncTop() {
    const s = camera.size;
    const src = frozen && el.dataset.frozen === 'true' ? frozen.source : camera.facing;
    const dims = frozen && el.dataset.frozen === 'true' ? `${frozen.width}×${frozen.height}` : s.width ? `${s.width}×${s.height}` : '';
    setText(sub, [SOURCE_LABEL[src] || 'CAMERA', dims, frozen && el.dataset.frozen === 'true' ? 'FROZEN' : ''].filter(Boolean).join(' · '));
    const on = camera.live;
    livePill.hidden = !on;
    closeBtn.hidden = on;
    setText(pillText, watch ? `WATCH ${clock(watch.endsAt - Date.now())}` : 'OPTICS');
    livePill.setAttribute('aria-label', watch ? 'Watch is on. Turn the camera off' : 'Camera is on. Turn it off');
    el.dataset.camera = on ? 'live' : camera.state === 'paused' ? 'paused' : 'off';
    el.dataset.mirrored = camera.mirrored ? 'true' : 'false';
    const liveKey = `${on}|${!!watch}`;
    if (liveKey !== lastLiveKey) {
      lastLiveKey = liveKey;
      try {
        deps.onLiveChange && deps.onLiveChange({ camera: on, watch: !!watch });
      } catch {
        /* optional */
      }
    }
  }
  let lastLiveKey = '';

  function renderLookCost() {
    setText(lookCaption, `≈${formatUsd(lookCost())} a look`);
    lookBtn.setAttribute('aria-label', `Look: send this frame to Jarvis (about ${formatUsd(lookCost())})`);
  }

  // ---- camera ---------------------------------------------------------------------------------
  function onCameraState(state, info) {
    if (closed) return;
    if (state === 'live') {
      if (info && info.interrupted) {
        el.dataset.interrupted = 'true';
        return;
      }
      el.dataset.interrupted = 'false';
      hideCard();
      deps.wakeLock && deps.wakeLock.keepAwake && deps.wakeLock.keepAwake();
      // A frozen Look stays frozen when the camera comes back (after a pause); otherwise live.
      setMode(frozen ? (mode === 'review' ? 'review' : 'frozen') : 'live');
      return;
    }
    if (state === 'paused') {
      stopWatch('The camera stopped.');
      deps.wakeLock && deps.wakeLock.allowSleep && deps.wakeLock.allowSleep();
      if (!frozen) {
        setMode('paused');
        showCard({
          kind: 'paused',
          title: 'Camera paused',
          text: info && info.reason === 'ended' ? 'The camera was interrupted (another app, a call or Siri).' : 'Jarvis turns the camera off whenever this screen is hidden.',
          primary: { label: 'Resume camera', testid: 'optics-resume', fn: () => startCamera() },
        });
      } else syncTop();
      resumeOnVisible = !!(info && info.reason === 'hidden') && cameraPlatform().autoResume;
      return;
    }
    if (state === 'error') {
      stopWatch('');
      showError(info && info.error);
      return;
    }
    syncTop();
  }

  async function startCamera() {
    if (closed) return;
    if (!cameraSupported()) {
      showError(new CameraError('unsupported', "This browser can't use the camera here."));
      return;
    }
    setMode(frozen ? mode : 'starting');
    if (!frozen) showCard({ kind: 'starting', title: 'Starting camera…', text: '' });
    const res = await camera.start({ facing: 'rear' });
    if (closed) {
      camera.stop('closed');
      return;
    }
    if (res.ok) {
      announce(`Camera on, ${camera.facing === 'front' ? 'front' : 'rear'} camera.`);
      safeCue('tap');
    }
  }

  function showError(error) {
    const err = error instanceof CameraError ? error : classifyCameraError(error);
    setMode('error');
    if (err.code === 'denied') {
      const help = deniedHelp();
      showCard({
        kind: 'denied',
        title: help.title,
        text: 'Jarvis can’t see through the camera because access is blocked.',
        steps: help.steps,
        primary: { label: 'Try again', testid: 'optics-retry', fn: () => startCamera() },
        secondary: deps.fallbackPhoto ? { label: 'Take a photo instead', testid: 'optics-fallback', fn: () => fallback() } : null,
      });
    } else {
      showCard({
        kind: err.code,
        title: err.code === 'no-camera' ? 'No camera found' : err.code === 'busy' ? 'Camera in use' : 'Camera unavailable',
        text: err.message,
        primary: err.code === 'unsupported' || err.code === 'insecure' ? null : { label: 'Try again', testid: 'optics-retry', fn: () => startCamera() },
        secondary: deps.fallbackPhoto ? { label: 'Take a photo instead', testid: 'optics-fallback', fn: () => fallback() } : null,
      });
    }
    announce('The camera is off.');
  }

  function fallback() {
    // Close first (the overlay makes the app inert), then open the system camera within this tap:
    // the native picker opens only from a user gesture.
    const open = deps.fallbackPhoto;
    close('fallback');
    try {
      open();
    } catch (err) {
      console.error('[jarvis] system camera failed:', err);
    }
  }

  function showCard({ kind, title: t, text, steps, primary, secondary, extra }) {
    const parts = [
      h('p', { class: 'optics-card-title', text: t }),
      text ? h('p', { class: 'optics-card-text', text }) : null,
      steps && steps.length ? h('ol', { class: 'optics-card-steps' }, steps.map((s) => h('li', { text: s }))) : null,
      extra || null,
      primary || secondary
        ? h(
            'div',
            { class: 'optics-card-actions' },
            primary ? h('button', { class: 'btn btn-primary', type: 'button', text: primary.label, attrs: { 'data-testid': primary.testid }, on: { click: primary.fn } }) : null,
            secondary ? h('button', { class: 'btn', type: 'button', text: secondary.label, attrs: { 'data-testid': secondary.testid }, on: { click: secondary.fn } }) : null,
          )
        : null,
      kind === 'starting' ? h('span', { class: 'optics-card-spinner', attrs: { 'aria-hidden': 'true' } }) : null,
    ];
    card.replaceChildren(...parts.filter(Boolean)); // the native method would print "null"
    card.dataset.kind = kind;
    card.hidden = false;
    // Keyboard and screen-reader users land on the card's main action (LOOK is off meanwhile).
    const main = card.querySelector('.btn-primary') || card.querySelector('.btn');
    if (main && kind !== 'starting') {
      try {
        main.focus({ preventScroll: true });
      } catch {
        /* not focusable yet */
      }
    }
  }

  function hideCard() {
    card.hidden = true;
    card.replaceChildren();
  }

  async function flip() {
    if (!camera.live || watch) return;
    flipBtn.disabled = true;
    const res = await camera.flip();
    if (!res.ok) announce(res.error ? res.error.message : 'Could not switch cameras.');
    else announce(`${camera.facing === 'front' ? 'Front' : camera.facing === 'rear' ? 'Rear' : 'Other'} camera.`);
    setMode(mode);
  }

  // ---- LOOK ---------------------------------------------------------------------------------------
  function safeCue(name) {
    try {
      if (deps.sounds && !deps.sounds.cue(name) && name === 'optics') deps.sounds.cue('tap');
    } catch {
      /* sounds are optional */
    }
  }

  function playFlash() {
    if (reducedMotion()) return;
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
  }

  function playScan() {
    if (reducedMotion()) return;
    scan.classList.remove('is-on');
    void scan.offsetWidth;
    scan.classList.add('is-on');
  }

  function freezeWith(frame, question) {
    clearFrozen();
    const node = frame.canvas || h('img', { src: frame.preview, alt: '' });
    node.classList.add('optics-frozen-media');
    frozenHost.replaceChildren(node);
    frozen = {
      node,
      canvas: frame.canvas || null,
      width: frame.width,
      height: frame.height,
      source: frame.source,
      mirrored: frame.source === 'front',
      preview: frame.preview,
      frameId: null,
      pins: [],
      question,
      text: '',
      status: 'analyzing',
      costUsd: 0,
      unsub: null,
      at: Date.now(),
    };
    el.dataset.frozenMirror = frozen.mirrored ? 'true' : 'false';
    followups = [];
    renderAnswer();
  }

  function clearFrozen() {
    if (frozen) {
      if (frozen.unsub) frozen.unsub();
      for (const f of followups) if (f.unsub) f.unsub();
      if (frozen.canvas && !frozen.logged) releaseCanvas(frozen.canvas);
    }
    frozen = null;
    followups = [];
    frozenHost.replaceChildren();
    clearPins();
  }

  async function look({ textOverride } = {}) {
    if (!camera.live || isBusy() || !(mode === 'live' || mode === 'frozen')) return;
    if (mode === 'frozen') {
      // A new look straight from a frozen one (the desktop deck stays visible): unfreeze first.
      clearFrozen();
      answer.hidden = true;
      setMode('live');
    }
    const question = (textOverride ?? askInput.value).trim();
    let frame;
    try {
      playFlash();
      safeCue('optics');
      frame = await camera.capture({ maxEdge: OPTICS_LIMITS.lookMaxEdge });
    } catch (err) {
      announce(err && err.message ? err.message : 'Could not capture a frame.');
      return;
    }
    await sendFrame(frame, question);
  }

  async function lookAtScreen() {
    if (isBusy() || watch) return;
    let frame;
    try {
      frame = await captureScreenFrame({ maxEdge: OPTICS_LIMITS.screenMaxEdge });
      hideCard();
    } catch (err) {
      announce(err && err.message ? err.message : 'Screen look cancelled.');
      if (frozen) return;
      setMode(camera.live ? 'live' : mode);
      return;
    }
    playFlash();
    safeCue('optics');
    await sendFrame(frame, askInput.value.trim());
  }

  async function sendFrame(frame, question) {
    freezeWith(frame, question || 'What am I looking at?');
    askInput.value = '';
    setMode('frozen');
    playScan();
    safeCue('scan');
    announce('Analyzing.');
    layoutSoon();
    let res;
    try {
      res = await deps.look({ text: question, frame });
    } catch (err) {
      res = { error: err && err.message ? err.message : 'That look could not be sent.' };
    }
    if (!frozen || closed) return;
    if (!res || res.error || !res.run) {
      frozen.status = 'error';
      frozen.text = (res && res.error) || 'That look could not be sent.';
      renderAnswer();
      setMode('frozen');
      return;
    }
    inChat.hidden = false;
    if (res.frameId) frozen.frameId = res.frameId;
    follow(res.run, frozen);
    addLogEntry(frozen);
  }

  /** Streams a run's answer into `target` ({ text, pins, status, costUsd, frameId }). */
  function follow(run, target) {
    const texts = new Map();
    const onEvent = (evt) => {
      if (!evt || closed) return;
      if (evt.type === 'segment' && evt.segment) {
        const seg = evt.segment;
        if (seg.kind === 'text') {
          texts.set(seg.id, seg.text || '');
          target.text = [...texts.values()].filter(Boolean).join('\n\n');
          renderAnswerSoon();
        } else if (seg.kind === 'pins' && Array.isArray(seg.labels) && seg.labels.length && seg.status !== 'error') {
          // Only labels for the frozen frame (a fresh frame Jarvis took has its own id).
          if (frozen && (!frozen.frameId || seg.frameId === frozen.frameId)) {
            frozen.pins = seg.labels.map((l) => ({ text: l.text, x: l.x, y: l.y }));
            if (seg.frameId) frozen.frameId = seg.frameId;
            renderPinsSoon();
            renderPinList();
          }
        } else if (seg.kind === 'error' && seg.error && seg.error.message) {
          target.error = seg.error.message;
        }
      }
      if (evt.type === 'turn' || evt.type === 'end' || evt.type === 'usage') {
        const t = evt.turn || run.turn;
        if (t) {
          target.costUsd = Number(t.costUsd) || 0;
          if (['done', 'error', 'stopped', 'interrupted'].includes(t.status)) {
            target.status = t.status === 'done' ? 'done' : 'error';
            if (t.status !== 'done' && !target.text) target.text = (t.error && t.error.message) || target.error || 'Jarvis couldn’t finish this answer.';
            if (target === frozen && frozen.logEntry) updateLogEntry(frozen);
            if (target.status === 'done') announce(frozen && frozen.pins.length ? `Answer ready. ${frozen.pins.length} labels pinned.` : 'Answer ready.');
            setMode(mode);
          }
          renderAnswerSoon();
        }
      }
    };
    target.unsub = run.on('*', onEvent);
    if (run.turn && run.turn.status && run.turn.status !== 'running') onEvent({ type: 'end', turn: run.turn });
  }

  async function ask(question) {
    if (!frozen || isBusy()) return;
    const entry = { question, text: '', status: 'analyzing', costUsd: 0, unsub: null };
    followups.push(entry);
    renderAnswer();
    setMode(mode);
    let res;
    try {
      res = await deps.ask({ text: question });
    } catch (err) {
      res = { error: err && err.message ? err.message : 'That question could not be sent.' };
    }
    if (closed) return;
    if (!res || res.error || !res.run) {
      entry.status = 'error';
      entry.text = (res && res.error) || 'That question could not be sent.';
      renderAnswer();
      setMode(mode);
      return;
    }
    follow(res.run, entry);
  }

  function onAskKey(e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const q = askInput.value.trim();
    if (frozen && (mode === 'frozen' || mode === 'review')) {
      if (!q) return;
      askInput.value = '';
      ask(q);
    } else if (mode === 'live') {
      look();
    }
  }

  function backToLive() {
    clearFrozen();
    answer.hidden = true;
    if (camera.live) setMode('live');
    else startCamera();
    layoutSoon();
  }

  // ---- answer sheet -----------------------------------------------------------------------------
  let answerQueued = false;
  function renderAnswerSoon() {
    if (answerQueued) return;
    answerQueued = true;
    requestAnimationFrame(() => {
      answerQueued = false;
      renderAnswer();
    });
  }

  function renderAnswer() {
    if (!frozen) {
      answer.hidden = true;
      return;
    }
    answer.hidden = false;
    const busy = isBusy();
    answer.dataset.status = frozen.status;
    setText(answerState, frozen.status === 'analyzing' ? 'ANALYZING' : frozen.status === 'error' ? 'NO ANSWER' : 'ANSWER');
    const total = frozen.costUsd + followups.reduce((s, f) => s + (f.costUsd || 0), 0);
    setText(answerCost, total > 0 ? `${isBusy() ? 'So far' : 'This look'} ${formatUsd(total)}` : '');
    setText(answerQ, frozen.question);
    const blocks = [];
    if (frozen.text) blocks.push(renderMarkdown(frozen.text, { streaming: frozen.status === 'analyzing' }));
    else if (frozen.status === 'analyzing') blocks.push(h('p', { class: 'optics-answer-wait', text: 'Jarvis is looking…' }));
    for (const f of followups) {
      blocks.push(h('p', { class: 'optics-answer-q optics-answer-q--follow', text: f.question }));
      if (f.text) blocks.push(renderMarkdown(f.text, { streaming: f.status === 'analyzing' }));
      else blocks.push(h('p', { class: 'optics-answer-wait', text: f.status === 'error' ? 'No answer.' : 'Jarvis is thinking…' }));
    }
    answerBody.replaceChildren(...blocks);
    answerBody.classList.toggle('is-error', frozen.status === 'error');
    liveBtn.disabled = false;
    moreBtn.disabled = busy;
    setText(liveBtn.lastChild, camera.live ? 'Live' : 'Camera');
  }

  function renderPinList() {
    const items = frozen ? frozen.pins : [];
    pinList.replaceChildren(...items.map((p) => h('li', { class: 'optics-pin-chip', text: p.text })));
    pinList.hidden = !items.length;
  }

  // ---- pins (EDITH plates over the frozen frame) --------------------------------------------------
  const shown = new Set();
  function clearPins() {
    shown.clear();
    for (const n of Array.from(pinsLayer.children)) if (n !== leaders) n.remove();
    leaders.replaceChildren();
    pinList.replaceChildren();
    pinList.hidden = true;
  }

  let pinsQueued = false;
  function renderPinsSoon() {
    if (pinsQueued) return;
    pinsQueued = true;
    requestAnimationFrame(() => {
      pinsQueued = false;
      renderPins();
    });
  }

  /** The frozen frame's rectangle inside the stage (object-fit: contain), in stage pixels. */
  function frameTransform() {
    const box = stage.getBoundingClientRect();
    return fitTransform(frozen.width, frozen.height, { x: 0, y: 0, w: box.width, h: box.height }, 'contain');
  }

  function renderPins() {
    for (const n of Array.from(pinsLayer.children)) if (n !== leaders) n.remove();
    leaders.replaceChildren();
    if (!frozen || !frozen.pins.length || el.dataset.frozen !== 'true') return;
    const t = frameTransform();
    if (!(t.scale > 0)) return;
    const box = t.box;
    leaders.setAttribute('viewBox', `0 0 ${Math.max(1, box.w)} ${Math.max(1, box.h)}`);
    leaders.setAttribute('width', String(box.w));
    leaders.setAttribute('height', String(box.h));
    const pins = frozen.pins.map((p) => {
      const fx = frozen.mirrored ? frozen.width - p.x : p.x;
      const v = frameToView(t, fx, p.y);
      return { text: p.text, x: v.x, y: v.y };
    });
    const safe = { x: Math.max(4, t.x - 40), y: 4, w: Math.min(box.w - 8, t.w + 80), h: box.h - 8 };
    const layout = layoutPins(pins, { safe, measure: (text) => measureLabel(text, pinsLayer), plateH: 26, padX: 9, gap: 22, maxPlateW: Math.min(200, safe.w) });
    const motion = !reducedMotion();
    let order = 0;
    for (const l of layout) {
      const key = `${frozen.pins[l.index].text}|${frozen.pins[l.index].x}|${frozen.pins[l.index].y}`;
      const fresh = !shown.has(key);
      shown.add(key);
      const delay = fresh && motion ? `${order++ * 60}ms` : '0ms';
      if (l.leader) leaders.append(h('line', { x1: l.leader.x1, y1: l.leader.y1, x2: l.leader.x2, y2: l.leader.y2, class: fresh && motion ? 'is-new' : '', style: { animationDelay: delay } }));
      pinsLayer.append(
        h('span', { class: ['optics-dot', l.clipped && 'is-clipped', fresh && motion && 'is-new'], style: { left: `${l.ax}px`, top: `${l.ay}px`, animationDelay: delay } }),
        h('span', {
          class: ['optics-plate', fresh && motion && 'is-new'],
          text: l.text,
          attrs: { 'data-testid': 'optics-pin', 'data-x': String(Math.round(l.ax)), 'data-y': String(Math.round(l.ay)), 'data-frame-x': String(frozen.pins[l.index].x), 'data-frame-y': String(frozen.pins[l.index].y) },
          style: { left: `${l.plate.x}px`, top: `${l.plate.y}px`, width: `${l.plate.w}px`, animationDelay: delay },
        }),
      );
    }
  }

  let layoutTimer = 0;
  function layoutSoon() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      renderPins();
    }, 30);
  }

  // ---- Watch ---------------------------------------------------------------------------------------
  function toggleWatch() {
    if (watch) stopWatch('Watch stopped.');
    else startWatch();
  }

  function startWatch() {
    if (!camera.live || mode !== 'live' || !deps.watchLook) return;
    const cap = watchOpts.maxLooksPerDay;
    if (watchLooksToday() >= cap) {
      announce(`Watch has reached today's limit of ${cap} looks.`);
      setText(watchNote, `Today's limit of ${cap} Watch looks is reached.`);
      watchHud.hidden = false;
      return;
    }
    const now = Date.now();
    watch = {
      startedAt: now,
      endsAt: now + watchOpts.sessionMs,
      looks: 0,
      costUsd: 0,
      goal: askInput.value.trim(),
      previous: '',
      inflight: null,
      detector: createChangeDetector(watchOpts),
      sampleTimer: 0,
      tickTimer: 0,
      notes: 0,
    };
    askInput.value = '';
    el.dataset.watching = 'true';
    el.dataset.watchHud = 'true';
    watchBtn.setAttribute('aria-pressed', 'true');
    watchHud.hidden = false;
    setText(watchNote, watch.goal ? `Watching for: ${watch.goal}` : `I’ll look only when the scene changes (at most every ${Math.round(watchOpts.minIntervalMs / 1000)} s, about ${formatUsd(estimateWatchCost({ model: watchModel() }).usd)} each).`);
    camera.setLowPower(true);
    watch.sampleTimer = setInterval(sampleWatch, watchOpts.sampleMs);
    watch.tickTimer = setInterval(tickWatch, 250);
    tickWatch();
    announce(`Watching for ${Math.round(watchOpts.sessionMs / 60000)} minutes.`);
    setMode('live');
  }

  function tickWatch() {
    if (!watch) return;
    const left = watch.endsAt - Date.now();
    if (left <= 0) {
      stopWatch(`Watch ended after ${clock(watchOpts.sessionMs)}.`);
      return;
    }
    setText(watchClock, `WATCHING ${clock(left)}`);
    setText(watchStats, `${watch.looks} ${watch.looks === 1 ? 'look' : 'looks'} · ${formatUsd(watch.costUsd)}`);
    syncTop();
  }

  function sampleWatch() {
    if (!watch || watch.inflight || !camera.live) return;
    const luma = camera.grabLuma(watchOpts.thumbW);
    if (!luma) return;
    const now = Date.now();
    const d = watch.detector.feed(luma, now);
    el.dataset.watchReason = d.reason;
    if (!d.send) return;
    if (watchLooksToday() >= watchOpts.maxLooksPerDay) {
      stopWatch(`Today's limit of ${watchOpts.maxLooksPerDay} Watch looks is reached.`);
      return;
    }
    watch.detector.markSent(luma, now);
    sendWatchFrame();
  }

  async function sendWatchFrame() {
    const w = watch;
    let frame;
    try {
      frame = await camera.capture({ maxEdge: watchOpts.watchMaxEdge || OPTICS_LIMITS.watchMaxEdge, quality: 0.75, previewEdge: 160 });
    } catch {
      return;
    }
    if (frame.canvas) releaseCanvas(frame.canvas);
    const controller = new AbortController();
    w.inflight = controller;
    w.looks += 1;
    countWatchLook();
    tickWatch();
    el.dataset.watchLooks = String(w.looks);
    let res;
    try {
      res = await deps.watchLook(frame, { goal: w.goal, previous: w.previous, signal: controller.signal, model: watchModel() });
    } catch {
      res = { ok: false };
    }
    if (w.inflight === controller) w.inflight = null;
    if (!res) return;
    w.costUsd += Number(res.costUsd) || 0;
    if (watch !== w) return;
    tickWatch();
    if (res.ok) {
      w.previous = res.summary || w.previous;
      if (res.worthSaying && res.line) {
        w.notes += 1;
        setText(watchNote, res.line);
        watchNote.dataset.kind = 'alert';
        safeCue('notify');
        announce(res.line);
      } else if (w.looks === 1) {
        setText(watchNote, res.summary ? `Watching: ${res.summary}` : 'Watching.');
        watchNote.dataset.kind = 'info';
      }
    }
  }

  function stopWatch(message) {
    if (!watch) return;
    const w = watch;
    watch = null;
    clearInterval(w.sampleTimer);
    clearInterval(w.tickTimer);
    if (w.inflight) w.inflight.abort();
    camera.setLowPower(false);
    el.dataset.watching = 'false';
    watchBtn.setAttribute('aria-pressed', 'false');
    setText(watchClock, 'WATCH OFF');
    setText(watchStats, `${w.looks} ${w.looks === 1 ? 'look' : 'looks'} · ${formatUsd(w.costUsd)}`);
    if (message) {
      setText(watchNote, `${message} ${w.looks} ${w.looks === 1 ? 'look' : 'looks'}, ${formatUsd(w.costUsd)}.`);
      announce(message);
    }
    setTimeout(() => {
      if (!watch && !closed) {
        watchHud.hidden = true;
        el.dataset.watchHud = 'false';
      }
    }, 6000);
    if (!closed) setMode(mode === 'live' ? 'live' : mode);
  }

  // ---- mic --------------------------------------------------------------------------------------
  function toggleMic() {
    if (mic) {
      try {
        mic.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    if (!deps.stt || typeof deps.stt.startListening !== 'function') return;
    const lang = settings().listenLang || 'en-US';
    micBtn.setAttribute('aria-pressed', 'true');
    micBtn.classList.add('is-listening');
    mic = deps.stt.startListening({
      lang,
      onPartial: (t) => {
        askInput.value = t;
      },
      onFinal: (t) => {
        askInput.value = t;
        // A spoken question goes straight out: a Look when live, a follow-up when frozen.
        if (frozen && (mode === 'frozen' || mode === 'review')) {
          askInput.value = '';
          if (t.trim()) ask(t.trim());
        } else if (mode === 'live') look({ textOverride: t });
      },
      onError: (e) => announce(e && e.message ? e.message : 'Voice input stopped.'),
      onEnd: () => {
        mic = null;
        micBtn.setAttribute('aria-pressed', 'false');
        micBtn.classList.remove('is-listening');
      },
    });
  }

  // ---- Optics log (desktop) ----------------------------------------------------------------------
  const logEntries = []; // newest first; only desktop entries keep their full-size canvas
  function addLogEntry(entry) {
    // iOS caps canvas memory: phones (no visible log) keep only the 480 px preview, and desktop
    // keeps the full frame for the four newest entries.
    entry.logged = el.dataset.layout === 'desktop';
    logEntries.unshift(entry);
    for (const old of logEntries.slice(4)) {
      if (old.canvas && old !== frozen) {
        releaseCanvas(old.canvas);
        old.canvas = null;
      }
    }
    if (logEntries.length > 12) logEntries.length = 12;
    const thumb = entry.preview ? h('img', { class: 'optics-log-thumb', src: entry.preview, alt: '' }) : h('span', { class: 'optics-log-thumb' });
    const line = h('span', { class: 'optics-log-line', text: entry.question });
    const meta = h('span', { class: 'optics-log-meta', text: `${timeLabel(entry.at)} · ${SOURCE_LABEL[entry.source] || 'CAMERA'}` });
    const item = h('li', null, h('button', { class: 'optics-log-item', type: 'button', attrs: { 'data-testid': 'optics-log-item' }, on: { click: () => reopen(entry) } }, thumb, h('span', { class: 'optics-log-text' }, line, meta)));
    entry.logEntry = { item, line };
    logList.prepend(item);
    while (logList.children.length > 12) logList.lastChild.remove();
  }

  function updateLogEntry(entry) {
    const first = String(entry.text || '').replace(/[#*_`>[\]]/g, '').split(/(?<=[.!?])\s/)[0] || entry.question;
    setText(entry.logEntry.line, first.length > 90 ? `${first.slice(0, 89)}…` : first);
  }

  function reopen(entry) {
    if (isBusy() || watch || frozen === entry) return;
    if (frozen && frozen !== entry && frozen.unsub) frozen.unsub();
    frozen = entry;
    const node = entry.canvas && entry.canvas.width ? entry.canvas : h('img', { src: entry.preview, alt: '' });
    node.classList.add('optics-frozen-media');
    frozenHost.replaceChildren(node);
    shown.clear();
    followups = [];
    setMode('frozen');
    renderAnswer();
    renderPinList();
    layoutSoon();
  }

  // ---- for the engine (look_through_camera) ---------------------------------------------------------
  async function grabForJarvis() {
    if (!camera.live) return null;
    playFlash();
    safeCue('optics');
    try {
      const frame = await camera.capture({ maxEdge: OPTICS_LIMITS.lookMaxEdge });
      const out = { data: frame.data, thumb: frame.preview, source: frame.source };
      releaseCanvas(frame.canvas);
      announce('Jarvis took a look.');
      return out;
    } catch {
      return null;
    }
  }

  // ---- keys, resize, visibility ----------------------------------------------------------------------
  const onKey = (e) => {
    if (closed || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (typing) return;
    if (e.key === ' ' || e.code === 'Space') {
      if (mode === 'live' || (mode === 'frozen' && camera.live)) {
        e.preventDefault();
        look();
      }
    } else if (e.key === 'f' || e.key === 'F') flip();
    else if (e.key === 'w' || e.key === 'W') toggleWatch();
  };
  window.addEventListener('keydown', onKey);
  offs.push(() => window.removeEventListener('keydown', onKey));
  const onResize = () => {
    el.dataset.layout = desktopMq && desktopMq.matches ? 'desktop' : 'phone';
    layoutSoon();
  };
  window.addEventListener('resize', onResize);
  offs.push(() => window.removeEventListener('resize', onResize));
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => layoutSoon());
    ro.observe(stage);
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && resumeOnVisible && !closed && camera.state === 'paused') {
      resumeOnVisible = false;
      startCamera();
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  offs.push(() => document.removeEventListener('visibilitychange', onVisible));

  // ---- open / close ---------------------------------------------------------------------------------
  function close(reason = 'closed') {
    if (closed) return;
    closed = true;
    stopWatch('');
    if (mic) {
      try {
        mic.abort ? mic.abort() : mic.stop();
      } catch {
        /* ignore */
      }
    }
    camera.stop(reason);
    camera.destroy();
    if (frozen && frozen.unsub) frozen.unsub();
    for (const f of followups) if (f.unsub) f.unsub();
    for (const off of offs.splice(0)) off();
    if (ro) ro.disconnect();
    clearTimeout(layoutTimer);
    deps.wakeLock && deps.wakeLock.allowSleep && deps.wakeLock.allowSleep();
    try {
      deps.onLiveChange && deps.onLiveChange({ camera: false, watch: false });
    } catch {
      /* optional */
    }
    overlay.close();
    current = null;
    if (reason === 'pill') safeCue('tap');
    try {
      deps.onClose && deps.onClose({ reason, cameraOff: reason === 'pill' });
    } catch (err) {
      console.error('[jarvis] optics onClose failed:', err);
    }
  }

  const overlay = openOverlay({ el, label: 'Optics, the camera', onEscape: () => close('escape'), initialFocus: () => lookBtn });
  onResize();
  renderLookCost();
  syncTop();

  const api = {
    el,
    close: () => close('api'),
    get state() {
      return mode;
    },
  };
  current = {
    api,
    cameraLive: () => camera.live,
    cameraFacing: () => camera.facing,
    grabForJarvis,
  };

  // Review a past Look (from the chat): frozen, no camera until the owner taps Camera.
  if (deps.review && deps.review.preview) {
    const r = deps.review;
    const img = h('img', { src: r.preview, alt: '' });
    img.classList.add('optics-frozen-media');
    frozenHost.replaceChildren(img);
    frozen = { node: img, canvas: null, width: r.width, height: r.height, source: r.source || 'camera', mirrored: r.source === 'front', preview: r.preview, frameId: r.frameId || null, pins: Array.isArray(r.pins) ? r.pins : [], question: r.question || 'What am I looking at?', text: r.answer || '', status: 'done', costUsd: Number(r.costUsd) || 0, unsub: null, at: Date.now() };
    setMode('review');
    renderAnswer();
    renderPinList();
    layoutSoon();
    return api;
  }

  if (deps.start === 'screen' && screenLookSupported()) {
    setMode('live');
    showCard({ kind: 'starting', title: 'Choose a screen…', text: '' });
    lookAtScreen().then(() => {
      if (!closed && !frozen) {
        hideCard();
        startCamera();
      }
    });
    return api;
  }

  // First use: say what the camera is for before the system asks (report §2.4.9).
  (async () => {
    const perm = await cameraPermission();
    if (closed) return;
    if (perm === 'granted' || store.get(INTRO_KEY)) {
      startCamera();
      return;
    }
    setMode('intro');
    showCard({
      kind: 'intro',
      title: 'Let Jarvis see',
      text: 'Jarvis uses the camera only while this screen is open. A frame goes to Claude only when you tap Look (or while Watch is on, which you start and which turns itself off).',
      extra: h('p', {
        class: 'optics-card-cost',
        text: `About ${formatUsd(estimateLookCost({ model: leadModel() }).usd)} a look with ${leadModel() === 'claude-opus-5-5' ? 'Opus 5.5' : 'your model'}; the first in a new chat about ${formatUsd(estimateLookCost({ model: leadModel(), prefixCached: false }).usd)}.`,
      }),
      primary: {
        label: 'Turn on camera',
        testid: 'optics-allow',
        fn: () => {
          store.set(INTRO_KEY, '1');
          startCamera();
        },
      },
      secondary: { label: 'Not now', testid: 'optics-not-now', fn: () => close('intro') },
    });
  })();

  return api;
}
