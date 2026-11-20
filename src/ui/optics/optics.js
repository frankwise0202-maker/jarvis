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
//   Camera  the picker under the title lists every camera (the MacBook's, a Logitech webcam, an
//           iPhone's back lenses): the owner's choice is remembered (deps.cameraChoice); a camera
//           plugged in or out is followed (src/platform/camera.js). Flip: front ↔ back on a phone.
//           A camera that faces the owner is previewed mirrored; frames are sent as the camera sees
//           them, and the frozen frame shows exactly what was sent.
//   Follow-ups on an answer: "Tell me more", "Hologram of this" (the frozen frame turns into a
//           schematic while Jarvis builds the hologram, which then opens in the hologram viewer:
//           deps.hologram, deps.openHologram) and, after a tap on a pin, "What's this part?".
//   Voice   over Voice Mode (deps.voice), what is heard goes to command(text) first: "what am I
//           looking at?" is a Look, "flip", "close", "tell me more", "hologram of this", "what's
//           this part?"; the mic button is Voice Mode's.
//
//   openOptics(deps) -> { close(), el, command(text), stopWatch() }   isOpticsOpen()   currentOptics()
//   opticsCameraBridge (engine deps.camera)
//   deps: { look({ text, frame }) -> Promise<{ run, frameId?, note? } | { error }>, ask({ text }) -> same,
//           watchLook(frame, { goal, previous, signal }) -> Promise<{ ok, worthSaying, line, summary, costUsd }>,
//           getSettings(), stt?, sttSupported?, sounds?, wakeLock?: { keepAwake, allowSleep },
//           lookBlocked?() -> null | { code: 'busy', title, text }: the chat is busy, so LOOK offers
//           "Look in a new chat" (look({ …, newChat: true })) or Wait instead of freezing a frame,
//           fallbackPhoto?(), onLiveChange?({ camera, watch, watchEndsAt }), onClose?(), watchOptions?, review?,
//           onCapture?({ source }) (a frame was taken: Presence flares the core),
//           screenCommand?(text, { spoken }) -> true when Screens took the words ("put the camera on
//           my other screen"), asked first for what is typed or said here,
//           cameraChoice?: { get() -> { id, label } | null, set({ id, label }) },
//           hologram?({ subject, frameId }) -> { run } | { error }, canHologram?() -> boolean,
//           hologramEstimate?() -> usd, openHologram?(run, segment),
//           voice?: { tap(), info() -> { listening, heard, busy } } (opened over Voice Mode) }
//   review: { preview, width, height, source, question, answer, pins, frameId } opens a past Look
//           (from the chat) frozen, without starting the camera.
//   start: 'screen' opens straight into "look at my screen" (call from the tap: getDisplayMedia
//           needs the gesture); the camera starts only if the owner taps Camera later. A cancelled
//           picker (or macOS not allowing Chrome to record the screen) shows "No screen shared"
//           with Try again and Use the camera (through the first-use card), never the camera.
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
import { hologramRequest, matchOpticsCommand, partQuestion, theName } from '../../lib/optics-commands.js';
import { drawSchematic } from './schematic.js';

const INTRO_KEY = 'jarvis.optics.intro.v1';
const WATCH_DAY_KEY = 'jarvis.optics.watch.v1';
// On screen a phone's cameras are BACK and FRONT, like the iPhone's own names (the frame's source
// stays 'rear' for Claude: "the owner's rear camera").
const SOURCE_LABEL = { rear: 'BACK', front: 'FRONT', camera: 'CAMERA', screen: 'SCREEN' };
// The two-column desktop layout; a phone held sideways (short) keeps the phone layout (optics.css).
const DESKTOP_MQ = '(min-width: 900px) and (min-height: 501px)';

let current = null;

export function isOpticsOpen() {
  return !!current;
}

/** The open Optics' api ({ close, command, el, state, overVoice }), or null. */
export function currentOptics() {
  return current ? current.api : null;
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
  // The HUD viewport frame shared with the rest of the look (hud.css .hud-viewport): its brackets in
  // the theme's --accent-2.
  const brackets = h('div', { class: 'optics-brackets hud-viewport', attrs: { 'aria-hidden': 'true' } });
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
  // Hologram of this: the frozen frame as a schematic (edges) while the hologram is built.
  const schematic = h('canvas', { class: 'optics-schematic', attrs: { 'data-testid': 'optics-schematic', 'aria-hidden': 'true' } });
  const schematicLabel = h('p', { class: 'optics-schematic-label', attrs: { 'data-testid': 'optics-schematic-label', 'aria-hidden': 'true' } });
  const stage = h('div', { class: 'optics-stage' }, video, frozenHost, schematic, brackets, reticle, scan, pinsLayer, schematicLabel, flash, card);

  const title = h('span', { class: 'optics-title', text: 'OPTICS' });
  // The camera's name (shortened with "…" when long) and then its frame size and state, always whole.
  const subName = h('span', { class: 'optics-sub-name' });
  const subRest = h('span', { class: 'optics-sub-rest' });
  const sub = h('span', { class: 'optics-sub', attrs: { 'data-testid': 'optics-sub' } }, subName, subRest);
  // The camera picker: the line under the title names the camera in use; a tap lists every camera.
  const camCaret = h('span', { class: 'optics-cam-caret', attrs: { 'aria-hidden': 'true' } }, icon('chevron-down', { size: 14 }));
  const camBtn = h(
    'button',
    { class: 'optics-cam-btn', type: 'button', attrs: { 'data-testid': 'optics-camera', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Camera' }, on: { click: () => toggleCameraMenu() } },
    sub,
    camCaret,
  );
  const camList = h('div', { class: 'optics-cam-list', attrs: { role: 'group', 'aria-label': 'Cameras' } });
  const camHint = h('p', { class: 'optics-cam-hint' });
  const camMenu = h('div', { class: 'optics-cam-menu', hidden: true, attrs: { 'data-testid': 'optics-camera-menu' } }, h('p', { class: 'optics-cam-menu-title', text: 'CAMERA' }), camList, camHint);
  const notice = h('p', { class: 'optics-notice', hidden: true, attrs: { 'data-testid': 'optics-notice', role: 'status' } });
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
  const top = h('div', { class: 'optics-top' }, h('div', { class: 'optics-titles' }, title, camBtn, camMenu), h('div', { class: 'optics-top-actions' }, livePill, closeBtn));

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
  // Back to the live camera: in the answer's actions on a computer; on a phone in the deck's ask row,
  // beside the field it would otherwise focus (onResize moves it), so the sheet keeps its room for
  // the answer.
  const liveBtn = h('button', { class: 'btn btn-sm optics-live-btn', type: 'button', attrs: { 'data-testid': 'optics-live' }, on: { click: () => backToLive() } }, icon('camera', { size: 16 }), h('span', { text: 'Live' }));
  const moreBtn = h('button', { class: 'btn btn-sm optics-ask-more', type: 'button', attrs: { 'data-testid': 'optics-ask-more' }, on: { click: () => askInput.focus() } }, h('span', { text: 'Ask more' }));
  const inChat = h('span', { class: 'optics-in-chat', text: 'In chat ✓', hidden: true });
  // Follow-ups on an answer: a pin the owner tapped first ("What's this part?"), then "Tell me more"
  // and "Hologram of this" (a conversation that can show holograms); with a pin tapped, the hologram
  // chip names it ("Hologram of the screwdriver"). On a phone they wrap onto a second line rather
  // than slide off the edge.
  const partBtn = h('button', { class: 'optics-chip optics-chip--part', type: 'button', hidden: true, attrs: { 'data-testid': 'optics-part' }, on: { click: () => askPart() } }, icon('pin', { size: 15 }), h('span', { text: 'What’s this part?' }));
  const moreChip = h('button', { class: 'optics-chip', type: 'button', attrs: { 'data-testid': 'optics-more' }, on: { click: () => tellMore() } }, h('span', { text: 'Tell me more' }));
  const holoCost = h('span', { class: 'optics-chip-cost' });
  const holoText = h('span', { class: 'optics-chip-text', text: 'Hologram of this' });
  const holoChip = h('button', { class: 'optics-chip optics-chip--holo', type: 'button', hidden: true, attrs: { 'data-testid': 'optics-hologram' }, on: { click: () => hologramOfThis() } }, icon('hologram', { size: 15 }), holoText, holoCost);
  const followRow = h('div', { class: 'optics-followups', hidden: true, attrs: { 'data-testid': 'optics-followups' } }, partBtn, moreChip, holoChip);
  const answerActions = h('div', { class: 'optics-answer-actions' }, liveBtn, moreBtn);
  const answer = h(
    'section',
    { class: 'optics-answer', hidden: true, attrs: { 'data-testid': 'optics-answer', 'aria-label': 'Jarvis’s answer' } },
    h('div', { class: 'optics-answer-head' }, answerState, h('span', { class: 'optics-answer-meta' }, inChat, answerCost)),
    answerQ,
    answerBody,
    pinList,
    followRow,
    answerActions,
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
  const micBtn = h('button', { class: 'optics-mic', type: 'button', hidden: !deps.sttSupported && !deps.voice, attrs: { 'data-testid': 'optics-mic', 'aria-label': 'Ask by voice', 'aria-pressed': 'false' }, on: { click: () => toggleMic() } }, icon('mic', { size: 20 }));
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
  const askRow = h('div', { class: 'optics-ask-row' }, askInput, micBtn);
  const deck = h('div', { class: 'optics-deck' }, askRow, keys);
  const live = h('div', { class: 'visually-hidden', attrs: { 'aria-live': 'polite', role: 'status' } });
  const main = h('div', { class: 'optics-main' }, stage, deck);

  const el = h(
    'div',
    { class: 'optics', attrs: { 'data-testid': 'optics', 'aria-label': 'Optics, the camera', 'data-state': 'starting', 'data-camera': 'off' } },
    main,
    side,
    top,
    notice,
    watchHud,
    live,
  );

  // ---- state ---------------------------------------------------------------------------------
  let mode = 'starting'; // intro | starting | live | frozen | paused | error | review | closed
  let frozen = null; // { canvas|img, width, height, source, mirrored, preview, frameId, pins, question, text, status, costUsd, run, unsub }
  let followups = []; // [{ question, text, status }]
  // The newest follow-up stays in view in the answer's scrolling body (its "› question" line at the
  // top) while Jarvis answers it, until the owner scrolls the answer themselves.
  let followInView = null; // the follow-up entry
  let followScrolledByOwner = false;
  let watch = null;
  let mic = null;
  let closed = false;
  let resumeOnVisible = false;
  let selectedPin = -1; // the pin the owner tapped (What's this part?)
  let holo = null; // Hologram of this: { entry, run, opened }
  let menuOpen = false;
  let noticeTimer = 0;
  // "What am I looking at?" said in Voice Mode opened Optics: look as soon as the camera is live.
  let autoLook = typeof deps.autoLook === 'string' ? deps.autoLook.trim().slice(0, 500) : '';
  let autoLookResolve = null;
  const autoLookDone = autoLook ? new Promise((resolve) => (autoLookResolve = resolve)) : null;
  function settleAutoLook(value) {
    autoLook = '';
    if (!autoLookResolve) return;
    const resolve = autoLookResolve;
    autoLookResolve = null;
    resolve(value);
  }
  const offs = [];
  const choice = deps.cameraChoice && typeof deps.cameraChoice.get === 'function' ? deps.cameraChoice : null;
  const camera = createCamera({
    video,
    onState: onCameraState,
    onDevices: () => {
      if (menuOpen) renderCameraMenu();
      // The keys follow the list too: Flip turns on when a second camera is plugged in.
      setMode(mode);
    },
    onSwitch: (e) => onCameraSwitched(e),
    preferred: () => (choice ? choice.get() : null),
    // A camera plugged in is switched to by itself only while nothing is under way.
    allowAutoSwitch: () => !watch && !isBusy() && !holo,
  });
  const desktopMq = window.matchMedia ? window.matchMedia(DESKTOP_MQ) : null;

  function setMode(next) {
    mode = next;
    el.dataset.state = next;
    el.dataset.frozen = frozen && (next === 'frozen' || next === 'review') ? 'true' : 'false';
    const liveNow = camera.live;
    deck.dataset.frozen = el.dataset.frozen;
    lookBtn.disabled = !(liveNow && (next === 'live' || next === 'frozen')) || isBusy();
    flipBtn.disabled = !(liveNow && camera.canFlip) || !!watch || isBusy();
    watchBtn.disabled = !(liveNow && (next === 'live' || watch));
    if (screenBtn) screenBtn.disabled = isBusy() || !!watch;
    syncTop();
    renderLookCost();
    fitLive();
  }

  /**
   * Phones: the live picture is letterboxed in the room between the top bar and the deck (a column on
   * the right when the phone is held sideways), so what the viewfinder shows is the whole frame a Look
   * sends; the brackets and the reticle sit on that frame (CSS --live-*, --frame-*, data-framed).
   */
  function fitLive() {
    if (el.dataset.layout !== 'phone') {
      el.dataset.framed = 'false';
      return;
    }
    const sb = stage.getBoundingClientRect();
    if (!sb.width || !sb.height) return;
    const tb = top.getBoundingClientRect();
    const db = deck.getBoundingClientRect();
    const column = db.left > sb.left + sb.width / 2 && db.top < sb.top + sb.height / 2; // the deck on the right
    const room = { l: 0, t: Math.max(0, tb.bottom - sb.top), r: column ? Math.max(0, sb.right - db.left) : 0, b: column ? 6 : Math.max(0, sb.bottom - db.top) };
    for (const k of ['l', 't', 'r', 'b']) el.style.setProperty(`--live-${k}`, `${Math.round(room[k])}px`);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const W = sb.width - room.l - room.r;
    const H = sb.height - room.t - room.b;
    if (!vw || !vh || W <= 0 || H <= 0) {
      el.dataset.framed = 'false';
      return;
    }
    const scale = Math.min(W / vw, H / vh);
    const fw = vw * scale;
    const fh = vh * scale;
    el.style.setProperty('--frame-l', `${(room.l + (W - fw) / 2).toFixed(1)}px`);
    el.style.setProperty('--frame-t', `${(room.t + (H - fh) / 2).toFixed(1)}px`);
    el.style.setProperty('--frame-w', `${fw.toFixed(1)}px`);
    el.style.setProperty('--frame-h', `${fh.toFixed(1)}px`);
    el.dataset.framed = 'true';
  }
  video.addEventListener('loadedmetadata', () => fitLive());
  video.addEventListener('resize', () => fitLive());

  function isBusy() {
    return !!(frozen && frozen.status === 'analyzing') || followups.some((f) => f.status === 'analyzing');
  }

  function announce(text) {
    setText(live, '');
    setTimeout(() => setText(live, text), 30);
  }

  /** What the line under OPTICS calls the camera: "BACK", "FRONT", "MACBOOK CAMERA", "LOGITECH WEBCAM". */
  function cameraWord(source, cam) {
    if (source === 'screen') return SOURCE_LABEL.screen;
    if (cam && cam.name && (cam.known || !camera.phone)) return cam.name.toUpperCase();
    return SOURCE_LABEL[source] || 'CAMERA';
  }

  function syncTop() {
    const s = camera.size;
    const isFrozen = !!frozen && el.dataset.frozen === 'true';
    const word = isFrozen ? frozen.cameraWord || cameraWord(frozen.source, null) : cameraWord(camera.facing, camera.current);
    const dims = isFrozen ? `${frozen.width}×${frozen.height}` : s.width ? `${s.width}×${s.height}` : '';
    setText(subName, word);
    setText(subRest, ['', dims, isFrozen ? 'FROZEN' : ''].filter((x, i) => i === 0 || x).join(' · ').replace(/^ · $/, ''));
    const many = camera.cameras.length;
    camCaret.hidden = !many;
    camBtn.disabled = !many && !camera.live;
    camBtn.setAttribute('aria-label', `Camera: ${camera.current ? camera.current.name : word.toLowerCase()}. ${many > 1 ? `${many} cameras, choose one` : 'Show cameras'}`);
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
        // watchEndsAt (ms since the epoch, or null): the app's status line can count Watch down.
        deps.onLiveChange && deps.onLiveChange({ camera: on, watch: !!watch, watchEndsAt: watch ? watch.endsAt : null });
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
      if (autoLook && mode === 'live') {
        const words = autoLook;
        autoLook = '';
        // A moment for the exposure to settle, then the Look.
        setTimeout(() => {
          if (closed) return settleAutoLook({ error: 'Closed.' });
          look({ textOverride: words }).then(settleAutoLook, (err) => settleAutoLook({ error: (err && err.message) || 'That look couldn’t be sent.' }));
        }, 300);
      }
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
          text: info && info.reason === 'ended' ? endedText(info.camera) : 'Jarvis turns the camera off whenever this screen is hidden.',
          primary: { label: 'Resume camera', testid: 'optics-resume', fn: () => startCamera() },
        });
      } else syncTop();
      resumeOnVisible = !!(info && info.reason === 'hidden') && cameraPlatform().autoResume;
      return;
    }
    if (state === 'error') {
      stopWatch('');
      settleAutoLook({ error: 'The camera couldn’t start.' });
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
    // The camera chosen last on this device (local settings), else the back camera on a phone and
    // the built-in one on a computer.
    const res = await camera.start();
    if (closed) {
      camera.stop('closed');
      return;
    }
    if (res.ok) {
      announce(`Camera on: ${cameraName()}.`);
      safeCue('tap');
    }
  }

  /** Why a camera stopped by itself: a phone's is taken by a call or Siri; a computer's names the camera. */
  function endedText(cam) {
    if (camera.phone) return 'The camera was interrupted (another app, a call or Siri).';
    const name = cam && cam.name ? cameraName(cam) : 'the camera';
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} stopped (unplugged, or another app is using it).`;
  }

  /** The camera in use, in words: "the back camera", "the MacBook camera", "the Logitech webcam". */
  function cameraName(cam = camera.current) {
    const n = cam && cam.name && (cam.known || !camera.phone) ? cam.name : '';
    if (!n) return camera.facing === 'front' ? 'the front camera' : camera.facing === 'rear' ? 'the back camera' : 'the camera';
    if (/^(back|front)\b/i.test(n)) return `the ${n.toLowerCase().replace(/ camera$/, '')} camera`;
    if (/^built-in/i.test(n)) return `the ${n[0].toLowerCase()}${n.slice(1)}`;
    return `the ${n}`;
  }

  /** Remember the owner's camera on this device (an explicit choice: the picker or Flip). */
  function rememberCamera() {
    if (!choice || typeof choice.set !== 'function' || !camera.deviceId) return;
    try {
      choice.set({ id: camera.deviceId, label: camera.current ? camera.current.label : '' });
    } catch {
      /* settings unavailable: the choice lasts this session */
    }
  }

  function showNotice(text, ms = 5000) {
    clearTimeout(noticeTimer);
    setText(notice, text);
    notice.hidden = !text;
    if (text) noticeTimer = setTimeout(() => (notice.hidden = true), ms);
  }

  /** The camera changed by itself: unplugged (back to the built-in one) or the chosen one plugged in. */
  function onCameraSwitched({ why, from, to } = {}) {
    if (closed) return;
    const toName = cameraName(to);
    const fromName = from && from.name ? from.name : 'The camera';
    const text = why === 'plugged' ? `${(to && to.name) || 'Your camera'} connected: switched to it.` : `${fromName} was unplugged. Using ${toName}.`;
    showNotice(text, 6000);
    announce(text);
    if (watch && watch.detector) watch.detector.reset(); // a new picture: Watch starts over from it
    if (menuOpen) renderCameraMenu();
    setMode(mode);
  }

  // ---- the camera picker ---------------------------------------------------------------------------
  function toggleCameraMenu(force) {
    const open = force === undefined ? !menuOpen : !!force;
    if (open === menuOpen) return;
    menuOpen = open;
    camMenu.hidden = !open;
    camBtn.setAttribute('aria-expanded', String(open));
    el.dataset.cameraMenu = open ? 'open' : 'closed';
    if (open) {
      renderCameraMenu();
      camera.refreshDevices().then(() => menuOpen && renderCameraMenu());
      const first = camList.querySelector('[aria-checked="true"]') || camList.querySelector('button');
      if (first) {
        try {
          first.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    }
  }

  function renderCameraMenu() {
    const cams = camera.cameras;
    const currentId = camera.deviceId;
    camList.replaceChildren(
      ...cams.map((c) =>
        h(
          'button',
          {
            class: 'optics-cam-item',
            type: 'button',
            attrs: { role: 'menuitemradio', 'aria-checked': String(c.id === currentId), 'data-testid': 'optics-camera-option', 'data-device-id': c.id, 'data-current': String(c.id === currentId) },
            on: { click: () => selectCamera(c) },
          },
          h('span', { class: 'optics-cam-check', attrs: { 'aria-hidden': 'true' } }, c.id === currentId ? icon('check', { size: 16 }) : null),
          h('span', { class: 'optics-cam-text' }, h('span', { class: 'optics-cam-name', text: c.name }), c.detail && c.detail !== c.name ? h('span', { class: 'optics-cam-detail', text: c.detail }) : null),
        ),
      ),
    );
    setText(camHint, camera.phone ? 'Flip switches between front and back.' : cams.length < 2 ? 'Plug in a USB webcam and it appears here.' : 'Jarvis remembers your choice on this device.');
  }

  async function selectCamera(cam) {
    toggleCameraMenu(false);
    if (!cam || !cam.id || (cam.id === camera.deviceId && camera.live)) return;
    if (watch) stopWatch('Watch stopped: the camera changed.');
    const res = await camera.select(cam.id);
    if (closed) return;
    if (res.ok) {
      rememberCamera();
      announce(`Switched to ${cameraName()}.`);
    } else if (!res.paused && !res.cancelled) {
      showNotice(res.error ? res.error.message : 'That camera could not start.');
    }
    setMode(mode);
  }

  const onMenuOutside = (e) => {
    if (!menuOpen) return;
    if (camMenu.contains(e.target) || camBtn.contains(e.target)) return;
    toggleCameraMenu(false);
  };
  document.addEventListener('pointerdown', onMenuOutside, true);
  offs.push(() => document.removeEventListener('pointerdown', onMenuOutside, true));

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
    if (!camera.live || watch || isBusy()) return false;
    flipBtn.disabled = true;
    const res = await camera.flip();
    if (closed) return false;
    if (!res.ok) {
      if (!res.paused && !res.cancelled) announce(res.error ? res.error.message : 'Could not switch cameras.');
    } else {
      rememberCamera();
      announce(`Switched to ${cameraName()}.`);
    }
    setMode(mode);
    return !!res.ok;
  }

  // ---- LOOK ---------------------------------------------------------------------------------------
  function safeCue(name) {
    try {
      if (deps.sounds) deps.sounds.cue(name);
    } catch {
      /* sounds are optional */
    }
  }

  /** A frame was taken (a Look, the screen, or Jarvis's look_through_camera): the core's scanner pass. */
  function captured(source) {
    try {
      if (deps.onCapture) deps.onCapture({ source });
    } catch {
      /* optional */
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
      // The frozen frame is exactly what Jarvis sees (never mirrored, even when the live preview
      // was): text reads the right way round and "on the left" means the frame's left.
      mirrored: false,
      cameraWord: cameraWord(frame.source, frame.source === 'screen' ? null : camera.current),
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
    el.dataset.frozenMirror = 'false';
    followups = [];
    selectedPin = -1;
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
    followInView = null;
    answerBody.scrollTop = 0;
    selectedPin = -1;
    endSchematic();
    frozenHost.replaceChildren();
    clearPins();
  }

  async function look({ textOverride, newChat = false } = {}) {
    if (!camera.live || isBusy() || !(mode === 'live' || mode === 'frozen')) return { error: camera.live ? 'Jarvis is still answering.' : 'The camera is off.' };
    // This chat is busy (a reply or a mission running): never a frozen frame that can't be sent. The
    // owner chooses: the Look in a new chat now, or wait.
    const blocked = newChat ? null : lookBlockedNow();
    if (blocked) {
      const words = (textOverride ?? askInput.value).trim();
      showCard({
        kind: 'busy',
        title: blocked.title || 'Jarvis is still answering',
        text: blocked.text || '',
        primary: { label: 'Look in a new chat', testid: 'optics-look-new-chat', fn: () => (hideCard(), look({ textOverride: words, newChat: true })) },
        secondary: { label: 'Wait', testid: 'optics-look-wait', fn: () => hideCard() },
      });
      announce(blocked.title || 'Jarvis is still answering.');
      return { error: blocked.title || 'Jarvis is still answering.', blocked: true };
    }
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
      return { error: (err && err.message) || 'Could not capture a frame.' };
    }
    return sendFrame(frame, question, { newChat });
  }

  function lookBlockedNow() {
    try {
      return typeof deps.lookBlocked === 'function' ? deps.lookBlocked() : null;
    } catch {
      return null;
    }
  }

  /** One frame of the screen, sent as a Look. Resolves { captureError } when no frame was taken. */
  async function lookAtScreen({ newChat = false } = {}) {
    if (isBusy() || watch) return { skipped: true };
    const blocked = newChat ? null : lookBlockedNow();
    if (blocked) {
      showCard({
        kind: 'busy',
        title: blocked.title || 'Jarvis is still answering',
        text: blocked.text || '',
        primary: { label: 'Look in a new chat', testid: 'optics-look-new-chat', fn: () => (hideCard(), lookAtScreen({ newChat: true })) },
        secondary: { label: 'Wait', testid: 'optics-look-wait', fn: () => hideCard() },
      });
      return { skipped: true, blocked: true };
    }
    let frame;
    try {
      frame = await captureScreenFrame({ maxEdge: OPTICS_LIMITS.screenMaxEdge });
      hideCard();
    } catch (err) {
      announce(err && err.message ? err.message : 'Screen look cancelled.');
      if (!frozen) setMode(camera.live ? 'live' : mode);
      return { captureError: err || new CameraError('other', 'The screen could not be captured.') };
    }
    playFlash();
    safeCue('optics');
    return sendFrame(frame, askInput.value.trim(), { newChat });
  }

  /**
   * Opened with the Screen key (start: 'screen'): the screen picker first, and nothing else. A
   * cancelled picker (or macOS not letting Chrome record the screen) never turns the camera on: a
   * card offers Try again, or the camera, which goes through the usual first-use card.
   */
  function screenFirst() {
    setMode('screen');
    showCard({ kind: 'starting', title: 'Choose a screen…', text: '' });
    lookAtScreen().then((res) => {
      if (closed || frozen || (res && res.blocked)) return; // the busy card offers a new chat
      if (res && res.captureError) showScreenFailed(res.captureError);
      else hideCard();
    });
  }

  function showScreenFailed(error) {
    const err = error instanceof CameraError ? error : classifyCameraError(error);
    setMode('screen');
    const cancelled = err.code === 'denied';
    const mac = cameraPlatform().os === 'mac';
    showCard({
      kind: 'screen-failed',
      title: cancelled ? 'No screen shared' : 'Screen look failed',
      text: cancelled ? 'Nothing was sent, and the camera stays off.' : `${err.message} Nothing was sent.`,
      steps: cancelled && mac ? ['If you did choose a screen: Chrome needs permission to record it. Open System Settings › Privacy & Security › Screen Recording, turn Chrome on, then quit and reopen Chrome.'] : null,
      primary: { label: 'Try again', testid: 'optics-screen-retry', fn: () => screenFirst() },
      secondary: cameraSupported() ? { label: 'Use the camera', testid: 'optics-use-camera', fn: () => (hideCard(), startWithIntro()) } : null,
    });
  }

  async function sendFrame(frame, question, { newChat = false } = {}) {
    captured(frame.source);
    freezeWith(frame, question || 'What am I looking at?');
    askInput.value = '';
    setMode('frozen');
    playScan();
    safeCue('scan');
    announce('Analyzing.');
    layoutSoon();
    let res;
    try {
      res = await deps.look(newChat ? { text: question, frame, newChat: true } : { text: question, frame });
    } catch (err) {
      res = { error: err && err.message ? err.message : 'That look could not be sent.' };
    }
    if (!frozen || closed) return res || { error: 'Closed.' };
    if (!res || res.error || !res.run) {
      frozen.status = 'error';
      frozen.text = (res && res.error) || 'That look could not be sent.';
      renderAnswer();
      setMode('frozen');
      return { error: frozen.text };
    }
    inChat.hidden = false;
    if (res.frameId) frozen.frameId = res.frameId;
    // The app may say something about where the Look went ("New chat: labels need one…").
    if (typeof res.note === 'string' && res.note) {
      showNotice(res.note, 7000);
      announce(res.note);
    }
    follow(res.run, frozen);
    addLogEntry(frozen);
    return res;
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
            const labels = seg.labels.map((l) => ({ text: l.text, x: l.x, y: l.y }));
            // The Look's own answer sets the labels; a follow-up's ("What's this part?") adds to them.
            frozen.pins = target === frozen ? labels : mergePins(frozen.pins, labels);
            if (seg.frameId) frozen.frameId = seg.frameId;
            renderPinsSoon();
            renderPinList();
          }
        } else if (seg.kind === 'hologram' && seg.status !== 'error') {
          // Hologram of this, or a hologram asked for in words: the viewer opens over Optics.
          if (typeof target.onHologram === 'function') target.onHologram(seg, run);
          else openHologramOnce(seg, run);
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
            if (typeof target.onEnd === 'function') target.onEnd(t);
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

  /**
   * A follow-up about the frozen frame (the same conversation, so Claude still has the frame).
   * `display`: what the sheet shows when the words sent say more (the pin's frame and pixel).
   * `send`: how it is sent (default deps.ask; Hologram of this uses deps.hologram).
   */
  async function ask(question, { display = '', send = null, entryExtra = null } = {}) {
    if (!frozen || isBusy()) return null;
    const entry = { question: display || question, text: '', status: 'analyzing', costUsd: 0, unsub: null, ...(entryExtra || {}) };
    followups.push(entry);
    followInView = entry;
    followScrolledByOwner = false;
    renderAnswer();
    setMode(mode);
    let res;
    try {
      res = await (send ? send() : deps.ask({ text: question }));
    } catch (err) {
      res = { error: err && err.message ? err.message : 'That question could not be sent.' };
    }
    if (closed) return null;
    if (!res || res.error || !res.run) {
      entry.status = 'error';
      entry.text = (res && res.error) || 'That question could not be sent.';
      if (typeof entry.onEnd === 'function') entry.onEnd(null);
      renderAnswer();
      setMode(mode);
      return null;
    }
    follow(res.run, entry);
    return entry;
  }

  /** Labels added by a follow-up: a new object gets its pin; one already pinned (same name, nearby) stays put. */
  function mergePins(pins, more) {
    const out = pins.slice();
    for (const p of more) {
      const near = out.findIndex((q) => q.text.toLowerCase() === p.text.toLowerCase() || Math.hypot(q.x - p.x, q.y - p.y) < 12);
      if (near < 0 && out.length < OPTICS_LIMITS.maxLabels) out.push(p);
    }
    return out;
  }

  const openedHolograms = new Set();
  function openHologramOnce(seg, run) {
    if (!seg || !seg.id || openedHolograms.has(seg.id) || closed) return;
    openedHolograms.add(seg.id);
    try {
      if (typeof deps.openHologram === 'function') deps.openHologram(run, seg);
    } catch (err) {
      console.error('[jarvis] hologram viewer failed:', err);
    }
  }

  // ---- follow-ups: Tell me more, What's this part?, Hologram of this ---------------------------------
  function tellMore() {
    return ask('Tell me more.');
  }

  function selectedPinData() {
    return frozen && selectedPin >= 0 && frozen.pins[selectedPin] ? frozen.pins[selectedPin] : null;
  }

  function askPart() {
    const pin = selectedPinData();
    if (!pin) return null;
    return ask(partQuestion(pin, frozen.frameId), { display: `What’s this part? · ${pin.text}` });
  }

  function selectPin(index) {
    if (!frozen || !frozen.pins[index]) return;
    selectedPin = selectedPin === index ? -1 : index;
    renderPins();
    renderPinList();
    renderAnswer();
    const pin = selectedPinData();
    if (pin) announce(`${pin.text} selected. Ask what this part is, or make a hologram of it.`);
  }

  function canHologram() {
    try {
      return typeof deps.hologram === 'function' && (typeof deps.canHologram !== 'function' || deps.canHologram() === true);
    } catch {
      return false;
    }
  }

  /**
   * Hologram of this (scan → schematic, as in the Mark 45 scene): the frozen frame turns into its
   * edges while Jarvis builds a hologram of the object (the tapped pin's, else the first one named);
   * the hologram viewer opens as soon as the build starts, over Optics. The frame is already in the
   * conversation, so Claude sees what it is modelling.
   */
  async function hologramOfThis(subjectOverride) {
    if (!frozen || isBusy() || holo || !canHologram()) return null;
    const pin = selectedPinData() || (frozen.pins.length ? frozen.pins[0] : null);
    const subject = subjectOverride !== undefined && subjectOverride !== null ? subjectOverride : pin ? pin.text : '';
    const text = hologramRequest(subject);
    startSchematic(subject);
    const state = { opened: false };
    holo = state;
    const entry = await ask(text, {
      display: subject ? `Hologram of ${theName(subject)}` : 'Hologram of this',
      send: () => deps.hologram({ text, subject: subject || null, frameId: frozen ? frozen.frameId : null }),
      entryExtra: {
        onHologram: (seg, run) => {
          if (state.opened || closed) return;
          state.opened = true;
          announce('Building the hologram.');
          openHologramOnce(seg, run);
        },
        onEnd: (turn) => {
          if (holo === state) holo = null;
          endSchematic();
          if (!state.opened && turn && turn.status === 'done') announce('Jarvis answered without a hologram.');
          setMode(mode);
        },
      },
    });
    if (!entry && holo === state) {
      holo = null;
      endSchematic();
    }
    return entry;
  }

  let schematicOn = false;
  function startSchematic(subject) {
    if (!frozen) return;
    const source = frozen.canvas && frozen.canvas.width ? frozen.canvas : frozen.node;
    let ok = null;
    try {
      ok = drawSchematic(schematic, source, { width: frozen.width, height: frozen.height });
    } catch {
      ok = null;
    }
    schematicOn = !!ok;
    el.dataset.schematic = ok ? 'true' : 'false';
    setText(schematicLabel, `BUILDING HOLOGRAM${subject ? ` · ${String(subject).toUpperCase()}` : '…'}`);
    schematicLabel.hidden = !ok;
    if (ok) playScan();
  }

  function endSchematic() {
    if (!schematicOn && el.dataset.schematic !== 'true') return;
    schematicOn = false;
    el.dataset.schematic = 'false';
    schematicLabel.hidden = true;
    releaseCanvas(schematic);
  }

  /** Screens takes "put the camera on my other screen" first (it acts at once, no Look). */
  function screenWords(text, spoken) {
    try {
      return !!(text && deps.screenCommand && deps.screenCommand(text, { spoken }));
    } catch {
      return false;
    }
  }

  function onAskKey(e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const q = askInput.value.trim();
    if (screenWords(q, false)) {
      askInput.value = '';
      return;
    }
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
    else startWithIntro(); // a screen look or a past Look reviewed: the camera was never on
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

  /**
   * The newest follow-up's question at the top of the answer's scrolling body (or as near as the
   * text allows), so its answer streams in view; not once the owner has scrolled the answer.
   */
  function keepFollowUpInView() {
    const node = followInView && !followScrolledByOwner && followInView.node ? followInView.node.firstElementChild : null;
    if (!node || !node.isConnected || answer.hidden) return;
    const top = node.getBoundingClientRect().top - answerBody.getBoundingClientRect().top + answerBody.scrollTop;
    const want = Math.max(0, Math.round(top - 4));
    if (Math.abs(answerBody.scrollTop - want) > 1) answerBody.scrollTop = want;
  }
  // The owner scrolls the answer (a wheel, a finger, the keyboard): stop moving it for them.
  const ownerScrolls = () => {
    if (followInView) followScrolledByOwner = true;
  };
  for (const type of ['wheel', 'touchmove', 'keydown']) answerBody.addEventListener(type, ownerScrolls, { passive: true });

  function renderAnswer() {
    if (!frozen) {
      answer.hidden = true;
      return;
    }
    answer.hidden = false;
    const busy = isBusy();
    // data-status is the Look's own answer; the header follows the newest question: ANALYZING while
    // Jarvis works on a follow-up too, NO ANSWER when the newest one failed.
    answer.dataset.status = frozen.status;
    answer.dataset.busy = busy ? 'true' : 'false';
    const newest = followups.length ? followups[followups.length - 1] : frozen;
    const tone = busy ? 'busy' : newest.status === 'error' ? 'error' : 'done';
    answerState.dataset.tone = tone;
    setText(answerState, tone === 'busy' ? 'ANALYZING' : tone === 'error' ? 'NO ANSWER' : 'ANSWER');
    const total = frozen.costUsd + followups.reduce((s, f) => s + (f.costUsd || 0), 0);
    setText(answerCost, total > 0 ? `${busy ? 'So far' : 'This look'} ${formatUsd(total)}` : '');
    setText(answerQ, frozen.question);
    const blocks = [];
    if (frozen.text) blocks.push(renderMarkdown(frozen.text, { streaming: frozen.status === 'analyzing' }));
    else if (frozen.status === 'analyzing') blocks.push(h('p', { class: 'optics-answer-wait', text: 'Jarvis is looking…' }));
    for (const f of followups) {
      f.node = h(
        'div',
        { class: 'optics-answer-follow' },
        h('p', { class: 'optics-answer-q optics-answer-q--follow', text: f.question }),
        f.text ? renderMarkdown(f.text, { streaming: f.status === 'analyzing' }) : h('p', { class: 'optics-answer-wait', text: f.status === 'error' ? 'No answer.' : 'Jarvis is thinking…' }),
      );
      blocks.push(f.node);
    }
    answerBody.replaceChildren(...blocks);
    answerBody.classList.toggle('is-error', frozen.status === 'error');
    // Follow-ups once Jarvis has answered (one question at a time).
    const answered = frozen.status === 'done';
    const pin = selectedPinData();
    followRow.hidden = !answered;
    partBtn.hidden = !pin;
    partBtn.setAttribute('aria-label', pin ? `What’s this part: ${pin.text}?` : 'What’s this part?');
    holoChip.hidden = !canHologram();
    if (!holoChip.hidden) {
      let est = 0;
      try {
        est = typeof deps.hologramEstimate === 'function' ? Number(deps.hologramEstimate()) || 0 : 0;
      } catch {
        est = 0;
      }
      setText(holoCost, est > 0 ? `≈${formatUsd(est)}` : '');
      // A tapped pin: the chip says which object ("Hologram of the screwdriver").
      setText(holoText, pin && theName(pin.text) ? `Hologram of ${theName(pin.text)}` : 'Hologram of this');
      holoChip.setAttribute('aria-label', `Hologram of ${pin ? pin.text : frozen.pins.length ? frozen.pins[0].text : 'this'}${est > 0 ? ` (about ${formatUsd(est)})` : ''}`);
    }
    for (const b of [partBtn, moreChip, holoChip]) b.disabled = busy || !!holo;
    liveBtn.disabled = false;
    moreBtn.disabled = busy;
    setText(liveBtn.lastChild, camera.live ? 'Live' : 'Camera');
    keepFollowUpInView();
  }

  function renderPinList() {
    const items = frozen ? frozen.pins : [];
    pinList.replaceChildren(
      ...items.map((p, i) =>
        h(
          'li',
          null,
          h('button', { class: 'optics-pin-chip', type: 'button', text: p.text, attrs: { 'aria-pressed': String(i === selectedPin), 'data-testid': 'optics-pin-chip' }, on: { click: () => selectPin(i) } }),
        ),
      ),
    );
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
    // Plates may sit in the black beside (or above and below) the frame: a small frozen frame (an SE's
    // Safari tab gives it 212 px) has no room for five plates on the picture alone.
    const safe = { x: 4, y: 4, w: Math.max(1, box.w - 8), h: Math.max(1, box.h - 8) };
    const layout = layoutPins(pins, { safe, measure: (text) => measureLabel(text, pinsLayer), plateH: 26, padX: 9, gap: 22, maxPlateW: Math.min(200, safe.w) });
    const motion = !reducedMotion();
    let order = 0;
    for (const l of layout) {
      const key = `${frozen.pins[l.index].text}|${frozen.pins[l.index].x}|${frozen.pins[l.index].y}`;
      const fresh = !shown.has(key);
      shown.add(key);
      const delay = fresh && motion ? `${order++ * 60}ms` : '0ms';
      if (l.leader) leaders.append(h('line', { x1: l.leader.x1, y1: l.leader.y1, x2: l.leader.x2, y2: l.leader.y2, class: fresh && motion ? 'is-new' : '', style: { animationDelay: delay } }));
      const picked = l.index === selectedPin;
      pinsLayer.append(
        h('span', { class: ['optics-dot', l.clipped && 'is-clipped', fresh && motion && 'is-new', picked && 'is-selected'], style: { left: `${l.ax}px`, top: `${l.ay}px`, animationDelay: delay } }),
        h('span', {
          class: ['optics-plate', fresh && motion && 'is-new', picked && 'is-selected'],
          text: l.text,
          attrs: { 'data-testid': 'optics-pin', 'data-index': String(l.index), 'data-selected': String(picked), 'data-x': String(Math.round(l.ax)), 'data-y': String(Math.round(l.ay)), 'data-frame-x': String(frozen.pins[l.index].x), 'data-frame-y': String(frozen.pins[l.index].y) },
          style: { left: `${l.plate.x}px`, top: `${l.plate.y}px`, width: `${l.plate.w}px`, animationDelay: delay },
          // A tap picks the object (What's this part?, Hologram of this). The pin list is the
          // keyboard and screen-reader way to do the same (this layer is aria-hidden).
          on: { click: (e) => (e.stopPropagation(), selectPin(l.index)) },
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

  // ---- words: Optics commands (typed, spoken here, or heard by Voice Mode) -----------------------------
  /**
   * Words for Optics: { handled: false } when they are for Jarvis as usual, else { handled: true,
   * command: { action: 'optics', ack, kind }, done? } (done: a Promise of the turn started, { run }
   * or { error }). Used by the mic here and, over Voice Mode, for everything Voice Mode hears.
   */
  function command(text) {
    if (closed) return { handled: false };
    const showing = !!frozen && (mode === 'frozen' || mode === 'review');
    const cmd = matchOpticsCommand(text, { frozen: showing });
    if (!cmd) return { handled: false };
    const ack = (kind, line) => ({ handled: true, command: { action: 'optics', kind, ack: line } });
    // A turn starts on the next tick: Voice Mode first takes note that a command is under way (its
    // "One moment…"), then the turn it is handed replaces that note.
    const started = (kind, start) => ({
      handled: true,
      command: { action: 'optics', kind, ack: '' },
      done: new Promise((resolve) => setTimeout(resolve, 0))
        .then(() => (closed ? { error: 'Closed.' } : start()))
        .then((r) => r || { error: 'That didn’t work.' }, (err) => ({ error: (err && err.message) || 'That didn’t work.' })),
    });
    const asked = (p) => Promise.resolve(p).then((e) => (e ? { run: true } : null));
    const busy = isBusy() || !!holo;
    switch (cmd.action) {
      case 'look':
        if (busy) return ack('busy', 'One moment, I’m still on the last one.');
        if (!camera.live) {
          if (showing) return started('ask', () => asked(ask(cmd.question)));
          return ack('no-camera', 'The camera is off. Tap Live to turn it on.');
        }
        return started('look', () => look({ textOverride: cmd.question }));
      case 'ask':
        if (busy) return ack('busy', 'One moment, I’m still on the last one.');
        return started('ask', () => asked(ask(cmd.question)));
      case 'more':
        if (!showing) return { handled: false };
        if (busy) return ack('busy', 'One moment, I’m still on the last one.');
        return started('more', () => asked(tellMore()));
      case 'part':
        if (!showing) return { handled: false };
        if (busy) return ack('busy', 'One moment, I’m still on the last one.');
        if (!selectedPinData()) return started('ask', () => asked(ask(cmd.question)));
        return started('part', () => asked(askPart()));
      case 'hologram':
        if (busy) return ack('busy', 'One moment, I’m still on the last one.');
        if (!canHologram()) return ack('no-hologram', 'This chat can’t show holograms. Start a new chat, then ask again.');
        if (showing) return started('hologram', () => asked(hologramOfThis(cmd.subject)));
        if (!camera.live) return ack('no-camera', 'The camera is off. Tap Live to turn it on.');
        // Live: a Look whose question asks for the hologram (the frame goes with it).
        return started('hologram', () => look({ textOverride: hologramRequest(cmd.subject) }));
      case 'flip': {
        if (!camera.live || !camera.canFlip || watch || busy) return ack('flip', camera.canFlip ? 'Not right now.' : 'There’s only one camera.');
        const want = cmd.side;
        if (want && camera.phone && camera.facing === want) return ack('flip', `That’s the ${want === 'front' ? 'front' : 'back'} camera already.`);
        flip();
        return ack('flip', 'Switching cameras.');
      }
      case 'close':
        setTimeout(() => close('voice'), 0);
        return ack('close', 'Camera off.');
      case 'live':
        if (!showing) return ack('live', 'This is the live view.');
        backToLive();
        return ack('live', 'Back to the live view.');
      case 'watch':
        if (cmd.on && !watch) {
          if (!camera.live || showing) return ack('watch', 'Go live first, then say watch.');
          startWatch();
          return ack('watch', watch ? 'Watching. I’ll speak up if something changes.' : 'Watch can’t start right now.');
        }
        if (!cmd.on && watch) {
          stopWatch('Watch stopped.');
          return ack('watch', 'Watch off.');
        }
        return ack('watch', cmd.on ? 'I’m already watching.' : 'Watch is already off.');
      default:
        return { handled: false };
    }
  }

  // Opened over Voice Mode: the mic button is Voice Mode's (a tap is the core's tap), and it shows
  // whether Voice Mode is listening and what it hears.
  function setVoice(info) {
    if (!deps.voice) return;
    const i = info && typeof info === 'object' ? info : {};
    micBtn.hidden = false;
    micBtn.setAttribute('aria-pressed', String(!!i.listening));
    micBtn.classList.toggle('is-listening', !!i.listening);
    micBtn.setAttribute('aria-label', i.listening ? 'Listening. Tap to send' : i.busy ? 'Stop Jarvis' : 'Talk to Jarvis');
    if (i.listening && typeof i.heard === 'string' && !askInput.value.trim()) askInput.placeholder = i.heard || 'Listening…';
    else askInput.placeholder = 'Ask about what you see…';
  }

  // ---- mic --------------------------------------------------------------------------------------
  function toggleMic() {
    if (deps.voice && typeof deps.voice.tap === 'function') {
      try {
        deps.voice.tap();
      } catch (err) {
        console.warn('[jarvis] voice tap failed:', err);
      }
      return;
    }
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
        // Spoken words: a screen command or an Optics command first ("flip", "hologram of this",
        // "tell me more"), else a question that goes straight out: a Look when live, a follow-up
        // when frozen.
        if (screenWords(t.trim(), true)) {
          askInput.value = '';
          return;
        }
        const res = command(t);
        if (res && res.handled) {
          askInput.value = '';
          if (res.command && res.command.ack) announce(res.command.ack);
          return;
        }
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
    followInView = null;
    answerBody.scrollTop = 0;
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
      captured(frame.source);
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
    const layout = desktopMq && desktopMq.matches ? 'desktop' : 'phone';
    el.dataset.layout = layout;
    // Live sits in the answer's actions on a computer, and in the deck's ask row on a phone.
    const home = layout === 'desktop' ? answerActions : askRow;
    if (liveBtn.parentNode !== home) home.prepend(liveBtn);
    layoutSoon();
    keepFollowUpInView();
    fitLive();
  };
  window.addEventListener('resize', onResize);
  offs.push(() => window.removeEventListener('resize', onResize));
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    // The stage grows back over a short transition after Live (and the deck changes height with its
    // keys): the room for the live picture and the cards (--live-*) is measured again as they settle.
    // Before, it kept the frozen stage's numbers, so after Live part of the frame was hidden under the
    // top bar and the deck and the brackets sat elsewhere.
    ro = new ResizeObserver(() => {
      fitLive();
      layoutSoon();
    });
    ro.observe(stage);
    ro.observe(deck);
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && resumeOnVisible && !closed && camera.state === 'paused') {
      resumeOnVisible = false;
      startCamera();
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  offs.push(() => document.removeEventListener('visibilitychange', onVisible));

  // Covered by another overlay (the hologram viewer Hologram of this opened): the camera turns off
  // (it never runs unseen), Watch stops; once Optics shows again the frozen answer is still there,
  // and the live view comes back by itself on a computer (a tap on iPhone).
  let covered = false;
  let coverObserver = null;
  const onCover = () => {
    const now = !!el.inert;
    if (now === covered || closed) return;
    covered = now;
    el.dataset.covered = now ? 'true' : 'false';
    if (now) {
      toggleCameraMenu(false);
      stopWatch('');
      if (camera.live) camera.stop('covered');
      syncTop();
      return;
    }
    if (frozen) {
      setMode(mode === 'review' ? 'review' : 'frozen');
      layoutSoon();
    } else if (cameraPlatform().autoResume) startCamera();
    else {
      setMode('paused');
      showCard({ kind: 'paused', title: 'Camera paused', text: 'Jarvis turns the camera off while something covers this screen.', primary: { label: 'Resume camera', testid: 'optics-resume', fn: () => startCamera() } });
    }
  };
  try {
    if (typeof MutationObserver === 'function') {
      coverObserver = new MutationObserver(onCover);
      coverObserver.observe(el, { attributes: true, attributeFilter: ['inert'] });
    }
  } catch {
    coverObserver = null;
  }

  /**
   * Starts the camera, first saying what it is for (report §2.4.9) unless the owner has seen that
   * card or already allowed the camera: "Let Jarvis see", then Turn on camera or Not now.
   */
  async function startWithIntro() {
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
      text: 'Jarvis uses the camera only while this screen is open. A frame goes to Claude only when you tap Look (or while Watch is on, which you start and which turns itself off), and it is exactly the picture you see between the brackets.',
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
  }

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
    if (coverObserver) coverObserver.disconnect();
    clearTimeout(layoutTimer);
    clearTimeout(noticeTimer);
    endSchematic();
    settleAutoLook({ error: 'Closed.' });
    deps.wakeLock && deps.wakeLock.allowSleep && deps.wakeLock.allowSleep();
    try {
      deps.onLiveChange && deps.onLiveChange({ camera: false, watch: false, watchEndsAt: null });
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

  const overlay = openOverlay({
    el,
    label: 'Optics, the camera',
    // Esc closes the camera list first, then Optics.
    onEscape: () => {
      if (menuOpen) {
        toggleCameraMenu(false);
        try {
          camBtn.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
        return;
      }
      close('escape');
    },
    initialFocus: () => lookBtn,
  });
  onResize();
  renderLookCost();
  syncTop();

  const api = {
    el,
    close: () => close('api'),
    /** Words for Optics (see command()): Voice Mode routes what it hears here while Optics is open. */
    command: (text) => command(text),
    /** Voice Mode's listening state for the mic button (opened over Voice Mode). */
    setVoice: (info) => setVoice(info),
    /** Watch off (the WATCH pill in the header); the camera stays on. */
    stopWatch: () => stopWatch('Watch stopped.'),
    /** Opened over Voice Mode (its turns are spoken, its mic is Voice Mode's). */
    overVoice: !!deps.voice,
    /** deps.autoLook: a Promise of the Look's outcome ({ run, frameId } | { error }), else null. */
    autoLookDone,
    get state() {
      return mode;
    },
    get frozen() {
      return !!frozen && (mode === 'frozen' || mode === 'review');
    },
    /** The Look on screen (frozen, with its frame id), for Screens' "this": { frameId, question, analyzing } | null. */
    frozenLook() {
      if (!frozen || !(mode === 'frozen' || mode === 'review') || !frozen.frameId) return null;
      return { frameId: frozen.frameId, question: frozen.question || '', analyzing: isBusy() };
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
    frozen = { node: img, canvas: null, width: r.width, height: r.height, source: r.source || 'camera', mirrored: false, preview: r.preview, frameId: r.frameId || null, pins: Array.isArray(r.pins) ? r.pins : [], question: r.question || 'What am I looking at?', text: r.answer || '', status: 'done', costUsd: Number(r.costUsd) || 0, unsub: null, at: Date.now() };
    setMode('review');
    renderAnswer();
    renderPinList();
    layoutSoon();
    return api;
  }

  if (deps.start === 'screen' && screenLookSupported()) {
    screenFirst();
    return api;
  }

  startWithIntro();
  return api;
}
