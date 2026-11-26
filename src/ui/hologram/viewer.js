// Hologram viewer: the full-screen chrome around the 3D renderer. The renderer (hologram.js, with
// three.js) is a lazily imported chunk; this file is in the main bundle, so the viewer opens at once
// and the model materializes as soon as the chunk is ready.
//
//   const v = openHologramViewer({ source, deps })
//     source: { segment, conversationId, turnId, run? }   a live or finished chat segment
//           | { item }                                    a saved library item (with its spec)
//     deps:   see openHologramViewer below (library, requestBlueprint, sendMessage, stt, …)
//   v.update(segment)       a newer copy of the followed segment (live build)
//   v.command(text, { source: 'voice', signal, spoken, confirmBuild, later })
//                           -> { handled: true, command, done? } | { handled: false, later? }
//                           done (a 2D request): a Promise of { opened } | { run } | { held } |
//                           { confirm } (confirmBuild and a softer wording: ask first, then
//                           confirm.proceed()) | { error } | { error, stopped } (signal aborted)
//                           spoken: Voice Mode says the acknowledgement, so no toast; later: the
//                           reply that builds it still streams, so a 2D request waits ({ later: true })
//   v.submit(text)          what the command field does: local command first, else a chat message
//                           (v8.1: deps.route(text, opts), the app's router, picks the command:
//                           this hologram's, Screens or Apple Music; without it, this hologram's)
//   v.parts()               [{ id, name, aka }]: the parts its commands match (the router's state)
//   v.follow(run)           caption a reply that Voice Mode follows (text only: Voice Mode opens
//                           what it shows)
//   v.note(text)            a caption from Voice Mode ("I'll take that once the hologram is built.")
//   v.setVoice(info|null)   Voice Mode drives the mic: { listening, heard, label, busy, state,
//                           canListen (the mic listens instead of stopping: a hologram is building) }
//   v.close()  v.isOpen()  v.getState()
//   getHologramViewer()     the open viewer or null (one at a time)
//   Walkthroughs (v8.1, SPEC §29; src/ui/hologram/tour-player.js plays them on the renderer's tourTarget()):
//   v.startTour({ partId, plan })  a tour of this hologram (the free local plan unless one is given):
//                           { ok: true } | { ok: false, reason: 'building' | 'nogl' | 'none' | 'closed' }
//   v.tour()                the tour's state for the router ({ active, atChoice, choices, defaultId,
//                           stepId, paused, waits, justSaid, status, index, total, view }) or null
//   v.tourCommand(action)   { do: 'tour-next' | 'tour-back' | … } (src/ui/commands/tours.js): truthy
//                           when it acted; { say } for a view shown away from a decision
//   v.showView(view, partId) no tour: "show it enclosed / opened" on that part → { say } | null
//   v.viewerContext()       what is on screen, for the turn context (startTurn's viewer option)
//   The tour bar replaces the assembly row and the tools while it runs; ← and → step, Space pauses and
//   plays, Esc ends the tour first (then closes as before); a touch on the model pauses it; a hidden
//   page pauses it and lets go of Voice Mode's hold. deps.tourVoice() (the open Voice Mode, or null)
//   speaks it (narrate), asks its decisions (question, kept open) and holds a woken session.
//
// Chrome: title and part count, Assembled/Exploded with a slider, Labels, Rotate, View, Parts, 2D,
// Photos, Reset, Close; a part card (name, group, info, material, Build 2D blueprint / Open
// blueprint + Rebuild, Photos, Isolate, Focus); a command field with a mic. Typed or spoken words
// go through the local matcher (src/lib/hologram-commands.js, free) first; anything else is sent to
// Jarvis as a chat message in the hologram's conversation and the reply shows as a caption here.
//
// Test hooks: the root ([data-testid="hologram-viewer"]) mirrors the model and renderer state in
// data-state (building while the input streams, then ready; loading|incomplete|error|nogl),
// data-gl (loading|ready|none|error: the 3D view), data-parts, data-exploded (0..1), data-labels
// (on|off), data-selected (part id), data-isolated, data-view, data-rotate, data-panel,
// data-model (library id), data-meshing (pending|settled: hull bodies and panels still meshing) and
// data-mesher (worker|main: where they were meshed), so tests never depend on raycasting pixels.
// Walkthroughs: data-tour (on), data-tour-status, data-tour-step, data-tour-index, data-tour-total,
// data-tour-view, and the renderer's emphasis as data-glow, data-ghost and data-hide (part ids).
// Text from specs and replies is only ever set with textContent.

import { h, setText, clear } from '../dom.js';
import { icon } from '../icons.js';
import { openOverlay } from '../overlay.js';
import { matchHologramCommand, blueprintAskedOutright, commandNeedingPart } from '../../lib/hologram-commands.js';
import { markdownToPlainText } from '../../lib/markdown.js';
import { createPhotoStrip, createPhotoViewer } from '../photos.js';
import { photoQueries, searchPhotos, searchPhotosMerged } from '../../platform/photos.js';
import { cutAtBreak } from '../voice-stream.js';
import { listenPhrases } from '../voice-heard.js';
import { choiceReply, localTourPlan, partPlacement, partViewShow, spokenName } from '../../lib/tour.js';
import { createTourBar, createTourPlayer } from './tour-player.js';

const LIVE_INTERVAL = 125; // ms between live-build updates (about 8 per second)
const VIEW_CYCLE = ['front-left', 'front', 'left', 'top', 'back', 'front-right'];
const VIEW_LABELS = {
  front: 'Front view',
  back: 'Back view',
  left: 'Left side',
  right: 'Right side',
  top: 'Top view',
  bottom: 'Bottom view',
  'front-left': 'Three-quarter view',
  'front-right': 'Three-quarter view (right)',
  'back-left': 'Rear three-quarter view',
  'back-right': 'Rear three-quarter view (right)',
};
const CAPTION_HIDE_MS = 20000;
// Commands that leave a "show it enclosed" look on the model (the others change what is shown).
const KEEPS_VIEW = new Set(['labels-on', 'labels-off', 'rotate', 'stop', 'zoom-in', 'zoom-out', 'view', 'photos', 'parts-list', 'blueprint', 'close', 'close-blueprint', 'which-part']);
const SPOKEN_HIDE_MS = 3000; // Voice Mode has said the reply: the caption only repeats it
const HEARD_HIDE_MS = 6000; // Voice Mode's "what I heard" line (its 2-second check) goes after this long
const DESKTOP_MQ = '(min-width: 900px)';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v : '');
const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

let rendererModule = null;
/** The lazily loaded 3D renderer chunk (three.js + hologram.js). Safe to call early to warm it up. */
export function loadHologramRenderer() {
  if (!rendererModule) {
    rendererModule = import('./hologram.js').catch((err) => {
      rendererModule = null;
      throw err;
    });
  }
  return rendererModule;
}

let active = null;
/** The open hologram viewer (or null). Voice Mode and the app route commands to it. */
export function getHologramViewer() {
  return active && active.isOpen() ? active : null;
}

/**
 * Render a saved hologram to an image without showing it (library thumbnails, "Download"): a
 * short-lived renderer in a hidden box, released at once. Resolves to a data URL, or null when the
 * device has no WebGL or the spec shows nothing.
 */
export async function renderHologramImage(spec, { width = 320, height = 240, type = 'image/jpeg', quality = 0.82 } = {}) {
  if (!isObj(spec)) return null;
  const { createHologram } = await loadHologramRenderer();
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', width: `${Math.min(width, 640)}px`, height: `${Math.min(height, 480)}px`, pointerEvents: 'none', opacity: '0' });
  document.body.appendChild(host);
  let holo = null;
  try {
    holo = createHologram(host, { labels: false, autoRotate: false, reveal: false, antialias: false });
    const res = holo.setSpec(spec);
    if (!res || !res.ok) return null;
    // hull bodies and panels are meshed off the main thread: wait for their fine meshes (at most 4 s)
    if (holo.settled) await holo.settled(4000);
    return holo.snapshot({ width, height, type, quality, view: spec.view || null });
  } catch (err) {
    console.warn('[jarvis] hologram image failed:', err && err.message);
    return null;
  } finally {
    if (holo) safe(() => holo.dispose());
    host.remove();
  }
}

/** A plain description of the hologram the viewer shows: what a saved item or a segment holds. */
function modelFromSource(source) {
  if (source && isObj(source.item)) {
    const it = source.item;
    return {
      key: `lib:${it.id}`,
      spec: isObj(it.spec) ? it.spec : null,
      title: txt(it.title) || (isObj(it.spec) ? txt(it.spec.title) : ''),
      status: 'done',
      libraryId: typeof it.id === 'string' ? it.id : null,
      conversationId: typeof it.conversationId === 'string' ? it.conversationId : null,
      segmentId: typeof it.segmentId === 'string' ? it.segmentId : null,
      turnId: typeof it.turnId === 'string' ? it.turnId : null,
      fromLibrary: true,
    };
  }
  const seg = source && isObj(source.segment) ? source.segment : {};
  return {
    key: `seg:${seg.id}`,
    spec: isObj(seg.spec) ? seg.spec : null,
    title: txt(seg.title) || (isObj(seg.spec) ? txt(seg.spec.title) : ''),
    status: seg.status === 'building' || seg.status === 'error' ? seg.status : 'done',
    libraryId: typeof seg.libraryId === 'string' ? seg.libraryId : null,
    conversationId: typeof source.conversationId === 'string' ? source.conversationId : null,
    segmentId: typeof seg.id === 'string' ? seg.id : null,
    turnId: typeof source.turnId === 'string' ? source.turnId : null,
    fromLibrary: !!seg.fromLibrary,
  };
}

/** Parts of a (normalized) spec for the parts list and the matcher, without the renderer. */
function specParts(spec) {
  if (!isObj(spec) || !Array.isArray(spec.parts)) return [];
  const groups = new Map((Array.isArray(spec.groups) ? spec.groups : []).filter(isObj).map((g) => [g.id, txt(g.name)]));
  return spec.parts
    .filter((p) => isObj(p) && typeof p.id === 'string' && p.name)
    .map((p) => ({ id: p.id, name: txt(p.name), group: p.group || null, groupName: groups.get(p.group) || '', tone: p.tone, info: txt(p.info), material: txt(p.material), aka: Array.isArray(p.aka) ? p.aka.filter((a) => typeof a === 'string') : [] }));
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return '';
  const r = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return r.toLocaleString('en-US');
}

/**
 * Open the viewer (closing any other hologram viewer first).
 *
 * deps (all optional; a missing one turns its feature off):
 *   library: { get(id), findPartBlueprint(modelId, partId|null), setThumbnail(id, dataUrl), onChange(fn) }
 *   requestBlueprint({ model, part, partName, title, rebuild, conversationId, signal, ask })
 *       -> Promise<{ opened } | { run } | { held } | { ask: true, cost } | { error, stopped? }>
 *     opens a saved blueprint, or starts the paid build (a new turn) and returns its run; with
 *     `ask`, nothing is built (the caller asks the owner first); a stopped `signal` starts nothing
 *   sendMessage(text, { conversationId }) -> { run } | { error }   unmatched words go to Jarvis
 *   openInChat({ conversationId, turnId })   close the viewer and show that reply in the chat
 *   blueprintCost(conversationId) -> '≈ $0.15'   the part card's cost estimate
 *   stopBuild({ conversationId })           stop the turn that is building this hologram
 *   stt: { sttSupported(), startListening(opts) }, getSettings()
 *   voice: { active(), tap() }               Voice Mode is open under the viewer: the mic button
 *                                             is its talk button (it listens for the viewer)
 *   onClose()
 */
export function openHologramViewer({ source, deps = {} } = {}) {
  if (active) active.close();

  let model = modelFromSource(source);
  let holo = null;
  let holoReady = false;
  let disposed = false;
  let state = { parts: 0, exploded: 0, labels: true, autoRotate: true, view: '', selected: null, isolated: null, building: false };
  let selectedPart = null;
  let panel = null; // 'parts' | 'photos' | null
  let listening = null;
  const pendingOps = []; // commands given before the renderer is ready
  const runSubs = new Set(); // unsubscribe functions for watched runs
  const blueprintCache = new Map(); // partId|'*' -> saved blueprint item | null
  const trackedRuns = new WeakSet(); // replies already captioned here (each run once)
  let voiceInfo = null; // Voice Mode's listening state while it drives the mic (setVoice)
  let voiceWords = false; // the command field shows words Voice Mode is hearing
  let thumbDone = false;
  let lastSelectedId = null; // the last part shown ("isolate it" after the card was closed)
  let tour = null; // the walkthrough playing: { player, bar, plan, voice }
  let viewLook = false; // "show it enclosed" (no tour) put an emphasis on the model
  const readyWaiters = []; // startTour before the renderer is up: resolved when it is

  // ---- DOM ------------------------------------------------------------------------------------

  const eyebrowText = h('span', { text: 'Hologram' });
  const eyebrow = h('p', { class: 'hv__eyebrow' }, h('span', { class: 'hv__eyebrow-dot', attrs: { 'aria-hidden': 'true' } }), eyebrowText);
  const savedBadge = h('span', { class: 'hv__badge', hidden: true, text: 'Saved' });
  const title = h('h2', { class: 'hv__title', id: `hv-title-${Math.random().toString(36).slice(2, 8)}` });
  const subtitle = h('p', { class: 'hv__subtitle' });
  const closeBtn = h('button', { class: 'hv__iconbtn', type: 'button', attrs: { 'aria-label': 'Close hologram', 'data-testid': 'hologram-close', title: 'Close (Esc)' }, on: { click: () => api.close() } }, icon('close', { size: 20 }));
  // While the hologram builds, Stop is its own labelled control (the mic listens instead: Voice Mode).
  const stopBtn = h(
    'button',
    { class: 'hv__stopbtn', type: 'button', hidden: true, attrs: { 'aria-label': 'Stop building', 'data-testid': 'hologram-stop', title: 'Stop building (what is built so far stays, unsaved)' }, on: { click: () => stopBuild() } },
    icon('stop', { size: 16 }),
    h('span', { text: 'Stop' }),
  );
  const top = h('header', { class: 'hv__top' }, h('div', { class: 'hv__heading' }, h('div', { class: 'hv__eyebrow-row' }, eyebrow, savedBadge), title, subtitle), stopBtn, closeBtn);
  const readout = h('p', { class: 'hv__readout', attrs: { 'aria-hidden': 'true' } });
  const stage = h('div', { class: 'hv__stage', attrs: { 'data-testid': 'hologram-stage' } });
  const loadingText = h('span', { text: 'Starting the 3D view…' });
  const retryBtn = h('button', { class: 'hv__textbtn', type: 'button', hidden: true, text: 'Try again', on: { click: () => startRenderer() } });
  const loading = h('div', { class: 'hv__loading', attrs: { role: 'status' } }, h('span', { class: 'hv__loading-ring', attrs: { 'aria-hidden': 'true' } }), loadingText, retryBtn);

  // Bottom bar
  const segAssembled = h('button', { class: 'hv__seg-btn', type: 'button', text: 'Assembled', attrs: { 'aria-pressed': 'true', 'data-testid': 'hologram-assemble' }, on: { click: () => run({ action: 'collapse' }) } });
  const segExploded = h('button', { class: 'hv__seg-btn', type: 'button', text: 'Exploded', attrs: { 'aria-pressed': 'false', 'data-testid': 'hologram-explode' }, on: { click: () => run({ action: 'explode' }) } });
  const slider = h('input', {
    class: 'hv__slider',
    type: 'range',
    min: '0',
    max: '100',
    value: '0',
    attrs: { 'aria-label': 'Explode amount', 'data-testid': 'hologram-explode-slider' },
    on: { input: () => holo && holo.explode(Number(slider.value) / 100, false) },
  });
  const tool = (name, label, testid, onClick, pressed) =>
    h('button', { class: 'hv__tool', type: 'button', attrs: { 'aria-label': label, 'data-testid': testid, 'aria-pressed': pressed === undefined ? null : String(pressed), title: label }, on: { click: onClick } }, icon(name, { size: 20 }), h('span', { text: label }));
  const tLabels = tool('tag', 'Labels', 'hologram-labels', () => run({ action: state.labels ? 'labels-off' : 'labels-on' }), true);
  const tRotate = tool('refresh', 'Rotate', 'hologram-rotate', () => run({ action: state.autoRotate ? 'stop' : 'rotate' }), false);
  const tView = tool('cube', 'View', 'hologram-view', () => cycleView());
  const tParts = tool('list', 'Parts', 'hologram-parts-button', () => togglePanel('parts'), false);
  const t2d = tool('blueprint', '2D', 'hologram-2d', () => onTwoDTool());
  const tPhotos = tool('image', 'Photos', 'hologram-photos-button', () => togglePanel('photos'), false);
  const tReset = tool('reset-view', 'Reset', 'hologram-reset', () => run({ action: 'reset' }));
  t2d.title = 'A 2D blueprint of the whole object (built on request)';

  const cmdInput = h('input', {
    class: 'hv__cmd-input',
    type: 'text',
    placeholder: 'Type or say a command…',
    attrs: { 'aria-label': 'Hologram command or a question for Jarvis', enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false', 'data-testid': 'hologram-command', maxlength: '600' },
  });
  const sttOk = !!(deps.stt && safe(() => deps.stt.sttSupported(), false));
  const micBtn = sttOk ? h('button', { class: 'hv__cmd-btn', type: 'button', attrs: { 'aria-label': 'Speak a command', 'data-testid': 'hologram-mic', 'aria-pressed': 'false' }, on: { click: () => toggleMic() } }, icon('mic', { size: 20 })) : null;
  const sendBtn = h('button', { class: 'hv__cmd-btn hv__cmd-send', type: 'submit', hidden: true, attrs: { 'aria-label': 'Send', 'data-testid': 'hologram-command-send' } }, icon('send', { size: 18 }));
  const cmdForm = h(
    'form',
    {
      class: 'hv__cmd',
      attrs: { role: 'search', 'aria-label': 'Hologram commands' },
      on: {
        submit: (e) => {
          e.preventDefault();
          const text = cmdInput.value;
          if (!text.trim()) return;
          cmdInput.value = '';
          syncSend();
          api.submit(text);
        },
      },
    },
    cmdInput,
    sendBtn,
    micBtn,
  );
  const syncSend = () => {
    sendBtn.hidden = !cmdInput.value.trim() && !!micBtn;
  };
  cmdInput.addEventListener('input', () => {
    voiceWords = false; // typed words are the owner's own, never replaced by what Voice Mode hears
    syncSend();
  });
  syncSend();

  const barInner = h(
    'div',
    { class: 'hv__bar-inner' },
    h('div', { class: 'hv__row' }, h('div', { class: 'hv__seg', attrs: { role: 'group', 'aria-label': 'Assembly' } }, segAssembled, segExploded), slider),
    h('div', { class: 'hv__tools' }, tLabels, tRotate, tView, tParts, t2d, tPhotos, tReset),
    cmdForm,
  );
  const bar = h('footer', { class: 'hv__bar' }, barInner);

  // Part card
  const cardGroup = h('p', { class: 'hv__card-group' });
  const cardName = h('h3', { class: 'hv__card-name' });
  const cardInfo = h('p', { class: 'hv__card-info' });
  const cardMaterialText = h('span');
  const cardMaterial = h('p', { class: 'hv__card-material' }, h('b', { text: 'Material' }), cardMaterialText);
  const cardClose = h('button', { class: 'hv__iconbtn hv__iconbtn--sm', type: 'button', attrs: { 'aria-label': 'Close part card' }, on: { click: () => run({ action: 'deselect' }) } }, icon('close', { size: 18 }));
  const cost = h('span', { class: 'hv__cardbtn-cost' });
  const bpLabel = h('span', { text: 'Build 2D blueprint' });
  const bpBtn = h('button', { class: 'hv__cardbtn hv__cardbtn--primary', type: 'button', attrs: { 'data-testid': 'hologram-build-blueprint' }, on: { click: () => onBlueprintButton(false) } }, icon('blueprint', { size: 18 }), bpLabel, cost);
  const rebuildBtn = h('button', { class: 'hv__linkbtn', type: 'button', hidden: true, text: 'Rebuild', attrs: { 'data-testid': 'hologram-rebuild-blueprint', title: 'Draw a new blueprint (costs tokens)' }, on: { click: () => onBlueprintButton(true) } });
  const bpHint = h('p', { class: 'hv__card-hint', hidden: true });
  const cardBtn = (name, label, testid, onClick) => h('button', { class: 'hv__cardbtn', type: 'button', attrs: { 'data-testid': testid }, on: { click: onClick } }, icon(name, { size: 18 }), h('span', { text: label }));
  const card = h(
    'section',
    { class: 'hv__card', hidden: true, attrs: { 'data-testid': 'hologram-part-card', 'aria-label': 'Selected part' } },
    h('div', { class: 'hv__card-head' }, h('div', { class: 'hv__card-titles' }, cardGroup, cardName), cardClose),
    cardInfo,
    cardMaterial,
    h(
      'div',
      { class: 'hv__card-actions' },
      h('div', { class: 'hv__card-primary' }, bpBtn, rebuildBtn),
      cardBtn('image', 'Photos', 'hologram-part-photos', () => selectedPart && openPanel('photos', selectedPart.id)),
      cardBtn('isolate', 'Isolate', 'hologram-isolate', () => selectedPart && run({ action: state.isolated === selectedPart.id ? 'show-all' : 'isolate', partId: selectedPart.id })),
      cardBtn('focus', 'Focus', 'hologram-focus', () => selectedPart && run({ action: 'focus', partId: selectedPart.id })),
    ),
    bpHint,
  );

  // Side panel: parts list or reference photos
  const panelTitle = h('h3', { class: 'hv__panel-title' });
  const panelClose = h('button', { class: 'hv__iconbtn hv__iconbtn--sm', type: 'button', attrs: { 'aria-label': 'Close panel', 'data-testid': 'hologram-panel-close' }, on: { click: () => closePanel() } }, icon('close', { size: 18 }));
  const panelBody = h('div', { class: 'hv__panel-body' });
  const panelEl = h('aside', { class: 'hv__panel', hidden: true, attrs: { 'aria-labelledby': '' } }, h('div', { class: 'hv__panel-head' }, panelTitle, panelClose), panelBody);
  panelTitle.id = `hv-panel-${Math.random().toString(36).slice(2, 8)}`;
  panelEl.setAttribute('aria-labelledby', panelTitle.id);

  // Caption: Jarvis's reply to words sent from here
  const capStatus = h('span', { class: 'hv__caption-status' });
  const capText = h('p', { class: 'hv__caption-text' });
  const capOpen = h('button', { class: 'hv__linkbtn', type: 'button', text: 'Open in chat', attrs: { 'data-testid': 'hologram-caption-open' }, on: { click: () => openInChat() } });
  const capClose = h('button', { class: 'hv__iconbtn hv__iconbtn--xs', type: 'button', attrs: { 'aria-label': 'Hide reply' }, on: { click: () => hideCaption() } }, icon('close', { size: 16 }));
  const caption = h(
    'div',
    { class: 'hv__caption', hidden: true, attrs: { 'data-testid': 'hologram-caption', 'aria-live': 'polite' } },
    h('div', { class: 'hv__caption-head' }, h('span', { class: 'hv__caption-dot', attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'hv__caption-who', text: 'Jarvis' }), capStatus, h('span', { class: 'hv__caption-actions' }, capOpen, capClose)),
    capText,
  );
  // A one-line caption (phones, with the part card open) opens to its whole text on a tap.
  capText.addEventListener('click', () => {
    if (caption.dataset.compact !== 'true') return;
    caption.dataset.expanded = caption.dataset.expanded === 'true' ? 'false' : 'true';
    layoutSoon();
  });

  const toast = h('div', { class: 'hv__toast', hidden: true, attrs: { role: 'status', 'data-testid': 'hologram-toast' } });

  const el = h(
    'div',
    { class: 'hv', attrs: { 'data-testid': 'hologram-viewer', 'data-state': 'loading', 'aria-labelledby': title.id } },
    stage,
    loading,
    top,
    readout,
    panelEl,
    card,
    caption,
    bar,
    toast,
  );

  const overlay = openOverlay({ el, onEscape: () => onEscape(), initialFocus: () => closeBtn });
  const desktopMq = safe(() => window.matchMedia(DESKTOP_MQ), null);
  const isDesktop = () => !!(desktopMq && desktopMq.matches);

  // ---- renderer -------------------------------------------------------------------------------

  async function startRenderer() {
    retryBtn.hidden = true;
    setText(loadingText, 'Starting the 3D view…');
    loading.hidden = false;
    let mod;
    try {
      mod = await loadHologramRenderer();
    } catch (err) {
      if (disposed) return;
      console.error('[jarvis] the 3D viewer could not load:', err);
      setText(loadingText, 'The 3D view couldn’t load. Check your connection and try again.');
      retryBtn.hidden = false;
      el.dataset.state = 'error';
      return;
    }
    if (disposed) return;
    createRenderer(mod);
  }

  function createRenderer(mod) {
    if (holo) safe(() => holo.dispose());
    holoReady = false;
    holo = mod.createHologram(stage, {
      onState: (s) => syncState(s),
      onSelect: (id, part) => showCard(id, part),
      labels: true,
      autoRotate: true,
      rotateAfterMs: 6000,
    });
    const st = holo.getState();
    if (st && st.error === 'webgl') {
      loading.hidden = true;
      el.dataset.state = 'nogl';
      openPanel('parts');
      return;
    }
    applyModel(true);
    holoReady = true;
    while (pendingOps.length) run(pendingOps.shift());
    if (tour && typeof holo.holdAutoRotate === 'function') safe(() => holo.holdAutoRotate(true));
    while (readyWaiters.length) readyWaiters.shift()(true);
    layout();
  }

  /** Show the current model in the renderer (fresh: a different hologram than before). */
  function applyModel(fresh) {
    if (!holo || !model.spec) {
      syncChrome();
      return;
    }
    if (model.status === 'building') {
      holo.updateSpec(model.spec, { normalized: true });
    } else if (fresh) {
      const res = holo.setSpec(model.spec);
      if (res && !res.ok) holo.updateSpec(model.spec, { normalized: true, final: true });
    } else {
      holo.updateSpec(model.spec, { normalized: true, final: true });
    }
    syncChrome();
    if (model.status === 'done') scheduleThumbnail();
  }

  // ---- live updates ---------------------------------------------------------------------------

  let liveTimer = 0;
  let liveLast = 0;
  let pendingSeg = null;
  function flushLive() {
    liveTimer = 0;
    liveLast = performance.now();
    const seg = pendingSeg;
    pendingSeg = null;
    if (!seg || disposed) return;
    const wasBuilding = model.status === 'building';
    const next = modelFromSource({ segment: seg, conversationId: model.conversationId, turnId: model.turnId });
    next.fromLibrary = model.fromLibrary || next.fromLibrary;
    model = next;
    if (holo && holoReady) {
      if (model.status === 'building') holo.updateSpec(model.spec || {}, { normalized: true });
      else if (wasBuilding) holo.updateSpec(model.spec || {}, { normalized: true, final: true });
      else applyModel(false);
      if (model.status === 'done') scheduleThumbnail();
    }
    syncChrome();
    blueprintCache.clear(); // a library id may have arrived
    if (selectedPart) syncBlueprintButton();
  }

  /** A newer copy of a hologram segment (the engine's live build). */
  function onSegment(seg) {
    if (disposed || !isObj(seg) || seg.kind !== 'hologram') return;
    if (seg.id !== model.segmentId) return;
    pendingSeg = seg;
    const wait = LIVE_INTERVAL - (performance.now() - liveLast);
    if (seg.status !== 'building' || wait <= 0) {
      clearTimeout(liveTimer);
      flushLive();
    } else if (!liveTimer) liveTimer = setTimeout(flushLive, wait);
  }

  /** Switch to another hologram (a new one Jarvis built from words typed here). */
  function switchTo(nextSource) {
    endTour('replaced'); // a different hologram: the tour was about the one before
    viewLook = false;
    model = modelFromSource(nextSource);
    selectedPart = null;
    card.hidden = true;
    thumbDone = false;
    blueprintCache.clear();
    if (holo) {
      loadHologramRenderer()
        .then((mod) => {
          if (!disposed) createRenderer(mod);
        })
        .catch(() => {});
    }
    syncChrome();
    if (panel === 'parts') renderParts();
  }

  function watchRun(runObj, { onSegmentEvent, onEnd } = {}) {
    if (!runObj || typeof runObj.on !== 'function') return () => {};
    const offs = [];
    try {
      offs.push(runObj.on('segment', (evt) => onSegmentEvent && onSegmentEvent(evt && evt.segment, evt && evt.turn)));
      offs.push(runObj.on('end', (evt) => onEnd && onEnd(evt && evt.turn)));
    } catch {
      /* not an engine run */
    }
    const off = () => {
      for (const f of offs) safe(() => typeof f === 'function' && f());
      runSubs.delete(off);
    };
    runSubs.add(off);
    return off;
  }

  // The followed segment's own run (opened from a card while it was still building).
  if (source && source.run && model.status === 'building') {
    watchRun(source.run, { onSegmentEvent: (seg) => onSegment(seg), onEnd: (turn) => onFollowedRunEnd(turn) });
  }
  function onFollowedRunEnd(turn) {
    // A cut stream leaves the segment as it was: read the final copy from the turn.
    const seg = turn && Array.isArray(turn.segments) ? turn.segments.find((s) => isObj(s) && s.id === model.segmentId) : null;
    if (seg) onSegment(seg);
  }

  // ---- state and chrome -----------------------------------------------------------------------

  function syncState(s) {
    if (!s || disposed) return;
    state = { ...state, ...s };
    if (state.selected) lastSelectedId = state.selected;
    syncChrome();
  }

  function syncChrome() {
    const spec = model.spec;
    const parts = state.parts || (spec && Array.isArray(spec.parts) ? spec.parts.length : 0);
    const building = model.status === 'building';
    setText(title, (spec && txt(spec.title)) || model.title || (building ? 'Building hologram…' : 'Hologram'));
    setText(subtitle, (spec && txt(spec.subtitle)) || '');
    subtitle.hidden = !subtitle.textContent;
    eyebrow.dataset.building = building ? 'true' : 'false';
    const label = building ? `Hologram · building · ${parts} part${parts === 1 ? '' : 's'}` : model.status === 'error' ? `Hologram · incomplete · ${parts} part${parts === 1 ? '' : 's'}` : `Hologram · ${parts} part${parts === 1 ? '' : 's'}`;
    setText(eyebrowText, label);
    savedBadge.hidden = !model.fromLibrary;
    const units = state.units || (spec && spec.units) || 'mm';
    const size = Array.isArray(state.size) ? `${fmtNum(state.size[0])} × ${fmtNum(state.size[1])} × ${fmtNum(state.size[2])} ${units}` : '';
    setText(readout, [state.gridCell ? `Grid ${fmtNum(state.gridCell)} ${units}` : '', size].filter(Boolean).join('  ·  '));
    const exploded = (Number(state.exploded) || 0) > 0.5;
    segAssembled.setAttribute('aria-pressed', String(!exploded));
    segExploded.setAttribute('aria-pressed', String(exploded));
    if (document.activeElement !== slider) slider.value = String(Math.round((Number(state.exploded) || 0) * 100));
    tLabels.setAttribute('aria-pressed', String(!!state.labels));
    tRotate.setAttribute('aria-pressed', String(!!state.autoRotate));
    tParts.setAttribute('aria-pressed', String(panel === 'parts'));
    tPhotos.setAttribute('aria-pressed', String(panel === 'photos'));
    t2d.disabled = !model.libraryId || building;
    stopBtn.hidden = !(building && typeof deps.stopBuild === 'function');

    // test hooks: data-state is the model's (building follows the stream even while the 3D chunk
    // loads); data-gl says whether the 3D view is up (loading | ready | none | error).
    const ds = el.dataset;
    const glReady = !!(holo && holoReady);
    if (ds.state !== 'nogl' && !(ds.state === 'error' && !holo)) {
      ds.state = building ? 'building' : !glReady ? 'loading' : model.status === 'error' ? 'incomplete' : state.ready ? 'ready' : 'loading';
    }
    ds.gl = ds.state === 'nogl' ? 'none' : ds.state === 'error' && !holo ? 'error' : glReady ? 'ready' : 'loading';
    ds.parts = String(parts);
    ds.exploded = String(Math.round((Number(state.exploded) || 0) * 100) / 100);
    ds.labels = state.labels ? 'on' : 'off';
    ds.rotate = state.autoRotate ? 'on' : 'off';
    ds.selected = state.selected || '';
    ds.isolated = state.isolated || '';
    ds.view = state.view || '';
    ds.panel = panel || '';
    ds.model = model.libraryId || '';
    ds.meshing = state.meshing ? 'pending' : 'settled';
    ds.mesher = state.mesher || '';
    // walkthroughs: the renderer's emphasis (what glows, what is see-through, what is hidden)
    const emphasis = state.emphasis && typeof state.emphasis === 'object' ? state.emphasis : null;
    ds.glow = emphasis && Array.isArray(emphasis.glow) ? emphasis.glow.join(' ') : '';
    ds.ghost = emphasis && Array.isArray(emphasis.ghost) ? emphasis.ghost.join(' ') : '';
    ds.hide = emphasis && Array.isArray(emphasis.hide) ? emphasis.hide.join(' ') : '';
    if (panel === 'parts') markSelectedRow();
    ds.segment = model.segmentId || '';
    loading.hidden = !!(holo && holoReady && (state.ready || !building)) || ds.state === 'nogl';
    if (holo && holoReady && !state.ready && building) {
      loading.hidden = false;
      setText(loadingText, 'Waiting for the first parts…');
    }
    layoutSoon();
  }

  // ---- part card ------------------------------------------------------------------------------

  function partById(id) {
    if (!id) return null;
    const fromHolo = holo && holoReady ? safe(() => holo.getPart(id), null) : null;
    return fromHolo || specParts(model.spec).find((p) => p.id === id) || null;
  }

  function showCard(id, part) {
    if (viewLook && (!id || id !== (selectedPart && selectedPart.id))) clearViewLook(); // another part: the view it had goes
    selectedPart = part || partById(id);
    if (!selectedPart) {
      card.hidden = true;
      layoutSoon();
      return;
    }
    setText(cardGroup, selectedPart.groupName || 'Part');
    setText(cardName, selectedPart.name);
    setText(cardInfo, selectedPart.info || '');
    cardInfo.hidden = !selectedPart.info;
    setText(cardMaterialText, selectedPart.material || '');
    cardMaterial.hidden = !selectedPart.material;
    card.hidden = false;
    // On a phone the panel and the card share the bottom of the screen: the card wins.
    if (panel && !isDesktop()) closePanel();
    // In Voice Mode a reply caption only repeats what Jarvis said: the card needs the room.
    if (!isDesktop() && voiceInfo && caption.dataset.state === 'done') hideCaption();
    syncBlueprintButton();
    layoutSoon();
  }

  async function savedBlueprint(partId) {
    const key = partId || '*';
    if (blueprintCache.has(key)) return blueprintCache.get(key);
    if (!model.libraryId || !deps.library || typeof deps.library.findPartBlueprint !== 'function') return null;
    let item = null;
    try {
      item = (await deps.library.findPartBlueprint(model.libraryId, partId || null)) || null;
    } catch {
      item = null;
    }
    blueprintCache.set(key, item);
    return item;
  }

  /** Why this hologram can't get a blueprint ('' when it can): still building, stopped or cut short, or not saved. */
  function unsavedReason() {
    if (model.status === 'building') return 'Blueprints are available once the hologram is finished.';
    if (model.libraryId) return '';
    if (model.status === 'error') return 'The build was stopped before it finished, so it wasn’t saved and can’t be blueprinted. Ask again to build the whole model.';
    return 'Blueprints need the hologram saved in your library (storage may be full).';
  }

  let bpSync = 0;
  async function syncBlueprintButton() {
    const part = selectedPart;
    if (!part) return;
    const mine = ++bpSync;
    const label = typeof deps.blueprintCost === 'function' ? safe(() => deps.blueprintCost(model.conversationId), '') : '';
    const canBuild = !!model.libraryId && model.status !== 'building' && typeof deps.requestBlueprint === 'function';
    bpBtn.disabled = !canBuild;
    bpBtn.dataset.saved = 'false';
    setText(bpLabel, 'Build 2D blueprint');
    cost.classList.remove('is-saved');
    setText(cost, label);
    cost.hidden = !label;
    rebuildBtn.hidden = true;
    setText(rebuildBtn, label ? `Rebuild ${label}` : 'Rebuild'); // a paid build: its price is on it
    bpHint.hidden = canBuild;
    setText(bpHint, unsavedReason());
    if (!canBuild) return;
    const saved = await savedBlueprint(part.id);
    if (mine !== bpSync || disposed || selectedPart !== part) return;
    if (saved) {
      bpBtn.dataset.saved = 'true';
      setText(bpLabel, 'Open blueprint');
      setText(cost, 'Saved');
      cost.classList.add('is-saved');
      cost.hidden = false;
      rebuildBtn.hidden = false;
    }
  }

  function onBlueprintButton(rebuild) {
    if (!selectedPart) return;
    requestBlueprint(selectedPart.id, { rebuild });
  }

  /**
   * The 2D tool (the whole object): a saved sheet opens at once (free); a new one is a paid build,
   * so the first tap only says so, with the price, and a second tap within 4 s builds it.
   */
  let twoDArmed = 0;
  let twoDTimer = 0;
  function disarmTwoD() {
    twoDArmed = 0;
    clearTimeout(twoDTimer);
    delete t2d.dataset.armed;
  }
  async function onTwoDTool() {
    if (disposed) return;
    if (twoDArmed && Date.now() < twoDArmed) {
      disarmTwoD();
      run({ action: 'blueprint' });
      return;
    }
    disarmTwoD();
    const saved = model.libraryId && model.status === 'done' ? await savedBlueprint(null) : null;
    if (disposed) return;
    if (saved || !model.libraryId || model.status !== 'done') {
      run({ action: 'blueprint' }); // opens the saved sheet, or says why there is none
      return;
    }
    twoDArmed = Date.now() + 4000;
    t2d.dataset.armed = 'true';
    const label = typeof deps.blueprintCost === 'function' ? safe(() => deps.blueprintCost(model.conversationId), '') : '';
    say(`Tap 2D again to draw the whole object${label ? ` · ${label}` : ''}`);
    twoDTimer = setTimeout(disarmTwoD, 4000);
  }

  // The library changes under an open viewer (a sheet saved by a finished build, deleted or
  // imported in another window): the part card's "Open blueprint · Saved" must follow it.
  const offLibrary = deps.library && typeof deps.library.onChange === 'function'
    ? safe(() => deps.library.onChange((evt) => {
      if (disposed || (evt && evt.type === 'thumbnail')) return;
      blueprintCache.clear();
      if (selectedPart) syncBlueprintButton();
    }), null)
    : null;

  /**
   * The owner asked for a 2D blueprint (part or whole object): open a saved one, else build it.
   * Resolves to the outcome: { opened } | { run } | { held } (Voice Mode sends it once its previous
   * reply is done) | { error } (also shown here) | { error, stopped } (`signal` aborted: Stop in
   * Voice Mode while the library was looked up; nothing started, nothing shown) | { confirm } (`ask`:
   * nothing is saved, so the owner is asked first; confirm.proceed() builds it).
   */
  async function requestBlueprint(partId, { rebuild = false, signal = null, ask = false } = {}) {
    if (typeof deps.requestBlueprint !== 'function') return { error: 'Blueprints aren’t available here.' };
    if (model.status === 'building') {
      const msg = 'The blueprint can be drawn once the hologram is finished.';
      say(msg);
      return { error: msg };
    }
    if (!model.libraryId) {
      const msg = model.status === 'error' ? 'The build was stopped before it finished, so it wasn’t saved and can’t be blueprinted. Ask again to build the whole model.' : 'This hologram isn’t saved, so a blueprint can’t be linked to it.';
      say(model.status === 'error' ? 'This hologram wasn’t finished, so it can’t be blueprinted.' : msg);
      return { error: msg };
    }
    const part = partId ? partById(partId) : null;
    const title = (model.spec && model.spec.title) || model.title;
    let res;
    try {
      res = await deps.requestBlueprint({ model: model.libraryId, part: part ? part.id : null, partName: part ? part.name : '', title, rebuild, conversationId: model.conversationId, signal, ask });
    } catch (err) {
      res = { error: (err && err.message) || 'The blueprint couldn’t be started.' };
    }
    if (!res || typeof res !== 'object') res = { error: 'The blueprint couldn’t be started.' };
    if (disposed || res.stopped) return res; // Stop in Voice Mode: nothing started, nothing to show
    if (res.ask) {
      // Nothing is saved for it: Voice Mode asks the owner first ("Shall I draw …? It costs …").
      return {
        confirm: {
          partName: part ? part.name : '',
          title,
          cost: typeof res.cost === 'string' ? res.cost : '',
          proceed: (opts = {}) => (disposed ? Promise.resolve({ error: 'The hologram was closed.' }) : requestBlueprint(partId, { rebuild, signal: (opts && opts.signal) || null, ask: false })),
        },
      };
    }
    if (res.error) {
      showCaption({ status: 'error', text: res.error });
      return res;
    }
    if (res.held) {
      showCaption({ status: 'thinking', text: 'I’ll draw it as soon as the details on screen are done.' });
      return res;
    }
    if (res.run) {
      const what = part ? `the ${part.name}` : (model.spec && model.spec.title) || 'the whole object';
      showCaption({ status: 'thinking', text: `Drawing a 2D blueprint of ${what}…`, turnId: res.run.turn && res.run.turn.id });
      trackReply(res.run, { blueprint: true });
    }
    return res;
  }

  // ---- side panel -----------------------------------------------------------------------------

  let photoStrip = null;
  let photoSearchInput = null;
  let photoViewer = null;

  function togglePanel(kind) {
    if (panel === kind) closePanel();
    else openPanel(kind);
  }

  function openPanel(kind, partId, query = '') {
    panel = kind;
    panelEl.hidden = false;
    panelEl.dataset.kind = kind;
    if (kind === 'parts') renderParts();
    else renderPhotos(partId, query);
    if (!isDesktop() && !card.hidden) card.hidden = true;
    syncChrome();
    layoutSoon();
  }

  function closePanel() {
    if (!panel) return;
    panel = null;
    panelEl.hidden = true;
    if (photoStrip) {
      photoStrip.destroy();
      photoStrip = null;
    }
    clear(panelBody);
    if (selectedPart && card.hidden) card.hidden = false;
    syncChrome();
    layoutSoon();
  }

  function renderParts() {
    setText(panelTitle, 'Parts');
    clear(panelBody);
    const parts = holo && holoReady ? safe(() => holo.listParts(), []) : [];
    const list = parts.length ? parts : specParts(model.spec);
    if (!list.length) {
      panelBody.append(h('p', { class: 'hv__panel-empty', text: model.status === 'building' ? 'Parts appear here as Jarvis builds the hologram.' : 'No parts to list.' }));
      return;
    }
    const groups = new Map();
    for (const p of list) {
      const g = p.groupName || '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    for (const [name, items] of groups) {
      panelBody.append(
        h(
          'section',
          { class: 'hv__plist-group' },
          name ? h('h4', { class: 'hv__plist-title', text: name }) : null,
          h(
            'ul',
            { class: 'hv__plist', attrs: { role: 'list' } },
            items.map((p) =>
              h(
                'li',
                null,
                h(
                  'button',
                  {
                    class: ['hv__plist-item', p.id === state.selected && 'is-selected', p.tone === 'warning' && 'is-warning'],
                    type: 'button',
                    attrs: { 'data-testid': 'hologram-part', 'data-part-id': p.id, 'aria-pressed': String(p.id === state.selected) },
                    on: {
                      click: () => {
                        if (!isDesktop()) closePanel();
                        run({ action: 'select', partId: p.id });
                        if (!holo || !holoReady) showCard(p.id, p);
                      },
                    },
                  },
                  h('span', { class: 'hv__plist-dot', attrs: { 'aria-hidden': 'true' } }),
                  h('span', { class: 'hv__plist-name', text: p.name }),
                  p.material ? h('span', { class: 'hv__plist-mat', text: p.material }) : null,
                ),
              ),
            ),
          ),
        ),
      );
    }
  }

  function markSelectedRow() {
    for (const row of panelBody.querySelectorAll('.hv__plist-item')) {
      const on = !!state.selected && row.dataset.partId === state.selected;
      row.classList.toggle('is-selected', on);
      row.setAttribute('aria-pressed', String(on));
    }
  }

  function renderPhotos(partId, asked = '') {
    const part = partId ? partById(partId) : null;
    const objectTitle = (model.spec && model.spec.title) || model.title || '';
    // A part's photos name the object too ("alternator rotor", then "rotor"): a bare part name
    // finds unrelated things on Commons. Words the owner gave ("photos of a rusty alternator") as they are.
    const queries = asked ? [String(asked).slice(0, 80)] : photoQueries(objectTitle, part ? part.name : '');
    const query = queries[0] || '';
    setText(panelTitle, part ? `Photos · ${part.name}` : 'Photos');
    clear(panelBody);
    if (photoStrip) photoStrip.destroy();
    const search = (q, opts) => (q === query && queries.length > 1 ? searchPhotosMerged(queries, opts) : searchPhotos(q, opts));
    photoStrip = createPhotoStrip({ search, onOpen: (photos, i) => openPhoto(photos, i), limit: 12 });
    photoSearchInput = h('input', { class: 'hv__photo-input', type: 'search', value: query, attrs: { 'aria-label': 'Search Wikimedia Commons', enterkeyhint: 'search', 'data-testid': 'hologram-photo-query', maxlength: '100' } });
    const form = h(
      'form',
      {
        class: 'hv__photo-search',
        on: {
          submit: (e) => {
            e.preventDefault();
            const q = photoSearchInput.value.trim();
            if (q && photoStrip) photoStrip.search(q);
          },
        },
      },
      photoSearchInput,
      h('button', { class: 'hv__textbtn', type: 'submit', text: 'Search' }),
    );
    panelBody.append(form, photoStrip.el);
    if (query) photoStrip.search(query);
  }

  function openPhoto(photos, index) {
    if (photoViewer) photoViewer.close();
    let pv = null;
    let ov = null;
    const close = () => {
      if (ov) ov.close();
      if (pv) pv.destroy();
      if (photoViewer === handle) photoViewer = null;
    };
    pv = createPhotoViewer({ photos, index, onClose: close });
    pv.el.classList.add('ph-viewer--overlay');
    ov = openOverlay({ el: pv.el, onEscape: close, initialFocus: () => pv.el.querySelector('[data-testid="photo-close"]') });
    const handle = { close };
    photoViewer = handle;
  }

  // ---- commands -------------------------------------------------------------------------------

  /** True when `text` is a local command for this hologram (nothing is done). */
  function isCommand(text) {
    const words = String(text || '');
    return !!(safe(() => matchHologramCommand(words, partsForMatcher(), { selected: state.selected }), null) || safe(() => commandNeedingPart(words), null));
  }

  function partNamesForVoice() {
    const out = [];
    for (const p of partsForMatcher()) {
      for (const n of [p.name, ...(Array.isArray(p.aka) ? p.aka : [])]) {
        const name = typeof n === 'string' ? n.trim() : '';
        if (name && !out.includes(name)) out.push(name);
      }
    }
    return out.slice(0, 120);
  }

  function partsForMatcher() {
    const parts = holo && holoReady ? safe(() => holo.listParts(), []) : [];
    return (parts.length ? parts : specParts(model.spec)).map((p) => ({ id: p.id, name: p.name, aka: p.aka || [] }));
  }

  const ACTION_WORDS = {
    explode: 'Exploded view',
    collapse: 'Assembled',
    rotate: 'Rotating',
    stop: 'Rotation stopped',
    'labels-on': 'Labels on',
    'labels-off': 'Labels off',
    reset: 'View reset',
    'zoom-in': 'Zoomed in',
    'zoom-out': 'Zoomed out',
    'show-all': 'Showing every part',
    deselect: 'Selection cleared',
  };

  /** Run a matched command. Returns a short description for the toast. */
  function run(cmd) {
    if (!cmd || disposed) return '';
    const needsRenderer = !['photos', 'blueprint', 'parts-list', 'close'].includes(cmd.action);
    if (needsRenderer && (!holo || !holoReady)) {
      if (el.dataset.state !== 'nogl') pendingOps.push(cmd);
      return '';
    }
    // "Show it enclosed" put a look on the model: a command that changes what is shown takes it off.
    if (viewLook && !KEEPS_VIEW.has(cmd.action)) clearViewLook();
    switch (cmd.action) {
      case 'explode':
        holo.explode(1);
        break;
      case 'collapse':
        holo.explode(0);
        break;
      case 'rotate':
        holo.autoRotate(true);
        break;
      case 'stop':
        holo.autoRotate(false);
        break;
      case 'labels-on':
        holo.setLabels(true);
        break;
      case 'labels-off':
        holo.setLabels(false);
        break;
      case 'reset':
        holo.isolate(null);
        holo.select(null);
        holo.resetView();
        break;
      case 'view':
        holo.setView(cmd.view);
        return VIEW_LABELS[cmd.view] || 'View';
      case 'zoom-in':
        holo.zoom(0.7);
        break;
      case 'zoom-out':
        holo.zoom(1.4);
        break;
      case 'select':
        holo.select(cmd.partId);
        return cmd.partName || '';
      case 'focus':
        holo.focus(cmd.partId);
        return cmd.partName ? `Focus · ${cmd.partName}` : '';
      case 'isolate':
        holo.isolate(cmd.partId);
        return cmd.partName ? `Isolated · ${cmd.partName}` : '';
      case 'show-all':
        holo.isolate(null);
        break;
      case 'deselect':
        holo.select(null);
        break;
      case 'photos':
        openPanel('photos', cmd.partId || null, !cmd.partId && typeof cmd.query === 'string' ? cmd.query : '');
        return cmd.partName ? `Photos · ${cmd.partName}` : 'Photos';
      case 'blueprint':
        requestBlueprint(cmd.partId || null);
        return '';
      case 'parts-list':
        openPanel('parts');
        return 'Parts';
      case 'close':
        api.close();
        return '';
      default:
        return '';
    }
    return ACTION_WORDS[cmd.action] || '';
  }

  function cycleView() {
    const i = VIEW_CYCLE.indexOf(state.view);
    const next = VIEW_CYCLE[(i + 1) % VIEW_CYCLE.length];
    const word = run({ action: 'view', view: next });
    if (word) say(word);
  }

  let toastTimer = 0;
  function say(text) {
    if (!text || disposed) return;
    setText(toast, text);
    toast.hidden = false;
    layoutSoon();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  // ---- words for Jarvis: send and show the reply as a caption ------------------------------------

  let captionTimer = 0;
  let captionTurn = null; // { conversationId, turnId } for "Open in chat"
  let spokenSoon = false; // Voice Mode has said this reply: once it is done, it leaves after SPOKEN_HIDE_MS
  let captionDetails = false; // the chat holds more of this reply (its details below ---) than was said
  /** How long a finished caption stays: a said one only repeats Jarvis, unless "Open in chat" leads to more. */
  const doneHideMs = () => (spokenSoon && !captionDetails ? SPOKEN_HIDE_MS : CAPTION_HIDE_MS);
  function showCaption({ status, text, turnId, details = false }) {
    clearTimeout(captionTimer);
    if (status === 'thinking' && caption.dataset.state !== 'thinking') spokenSoon = false; // a new question
    captionDetails = details === true;
    caption.hidden = false;
    caption.dataset.state = status;
    setText(capStatus, status === 'thinking' ? 'Thinking…' : status === 'streaming' ? 'Replying' : status === 'error' ? 'Couldn’t send' : status === 'stopped' ? 'Stopped' : status === 'heard' ? 'Heard' : '');
    setText(capText, text || '');
    capText.scrollTop = capText.scrollHeight;
    if (turnId) captionTurn = { conversationId: model.conversationId, turnId };
    // What Voice Mode heard is not a reply: no "Open in chat" for an earlier one under it.
    capOpen.hidden = status === 'heard' || status === 'tour' || !captionTurn || typeof deps.openInChat !== 'function';
    if (status === 'done' || status === 'error' || status === 'stopped') captionTimer = setTimeout(hideCaption, status === 'done' ? doneHideMs() : CAPTION_HIDE_MS);
    else if (status === 'heard') captionTimer = setTimeout(hideCaption, HEARD_HIDE_MS);
    layoutSoon();
  }

  function hideCaption() {
    clearTimeout(captionTimer);
    caption.hidden = true;
    layoutSoon();
  }

  function openInChat() {
    const target = captionTurn;
    if (!target || typeof deps.openInChat !== 'function') return;
    api.close();
    deps.openInChat(target);
  }

  /**
   * Follow a run started from here: caption the reply; follow a new hologram; open a new blueprint.
   * captionOnly (a Voice Mode reply, see follow()): only the caption; Voice Mode opens what it
   * shows. Each run is followed once (the first call decides how).
   */
  function trackReply(runObj, { blueprint = false, captionOnly = false } = {}) {
    if (!runObj || typeof runObj !== 'object' || trackedRuns.has(runObj)) return;
    trackedRuns.add(runObj);
    const turn = runObj && runObj.turn;
    const conversationId = (runObj && runObj.conversation && runObj.conversation.id) || model.conversationId;
    if (conversationId) model.conversationId = conversationId;
    let openedBlueprint = false;
    let followed = false;
    const replyText = (t) => {
      const segs = t && Array.isArray(t.segments) ? t.segments.filter((s) => isObj(s) && s.kind === 'text' && typeof s.text === 'string' && s.text.trim()) : [];
      if (!segs.length) return { text: '', details: false };
      const maxReq = Math.max(...segs.map((s) => Number(s.req) || 0));
      let md = segs.filter((s) => (Number(s.req) || 0) === maxReq).map((s) => s.text).join('\n\n');
      // A spoken reply (Voice Mode): the caption is what Jarvis says; the details below --- stay in the chat.
      let details = false;
      if (t && t.spoken === true) {
        const cut = safe(() => cutAtBreak(md, true), null);
        if (cut) {
          md = cut.text;
          details = cut.cut === true;
        }
      }
      return { text: safe(() => markdownToPlainText(md), md).replace(/\s+/g, ' ').trim(), details };
    };
    const onSegmentEvent = (seg, t) => {
        if (disposed || !isObj(seg)) return;
        if (captionOnly && seg.kind !== 'text') return;
        if (seg.kind === 'hologram' && !followed && !blueprint) {
          followed = true;
          switchTo({ segment: seg, conversationId, turnId: t && t.id });
          showCaption({ status: 'streaming', text: 'Building a new hologram…', turnId: t && t.id });
          return;
        }
        if (seg.kind === 'hologram' && followed && seg.id === model.segmentId) {
          onSegment(seg);
          return;
        }
        if (seg.kind === 'blueprint' && !openedBlueprint && typeof deps.openBlueprint === 'function') {
          openedBlueprint = true;
          deps.openBlueprint({ segment: seg, run: runObj, conversationId, turnId: t && t.id });
          showCaption({ status: 'streaming', text: 'Drawing the blueprint…', turnId: t && t.id });
          return;
        }
        if (seg.kind === 'text') {
          const { text, details } = replyText(t || turn);
          if (text) showCaption({ status: 'streaming', text, turnId: t && t.id, details });
        }
      };
    const onEnd = (t) => {
        if (disposed) return;
        const final = t || turn;
        const { text, details } = replyText(final);
        const status = final && final.status;
        if (status === 'error') {
          const msg = final.error && final.error.message ? final.error.message : 'Jarvis hit a problem with that request.';
          showCaption({ status: 'error', text: msg, turnId: final.id });
        } else if (status === 'stopped') showCaption({ status: 'stopped', text: text || 'Stopped.', turnId: final && final.id });
        else if (text) showCaption({ status: 'done', text, turnId: final && final.id, details });
        else if (blueprint && openedBlueprint) showCaption({ status: 'done', text: 'Blueprint ready.', turnId: final && final.id });
        else hideCaption();
        if (followed) onFollowedRunEnd(final);
      };
    watchRun(runObj, { onSegmentEvent, onEnd });
    // Whatever the turn already holds (events before this subscription): shown the same way.
    if (turn && Array.isArray(turn.segments)) for (const seg of turn.segments.slice()) onSegmentEvent(seg, turn);
    if (turn && turn.status && turn.status !== 'running') onEnd(turn);
  }

  /** v8.1: a local command the app carried out (Screens, Apple Music): its line in the caption, once known. */
  function showNotice(notice) {
    let known = false;
    Promise.resolve(notice).then(
      (line) => {
        known = true;
        if (disposed) return;
        const text = String(line ?? '').trim();
        // No line (a walkthrough's word: the step it starts is the answer): nothing to show.
        if (text) showCaption({ status: 'done', text });
        else if (!caption.hidden && caption.dataset.state === 'thinking') hideCaption();
      },
      (err) => {
        known = true;
        if (!disposed) showCaption({ status: 'error', text: (err && err.message) || 'That message couldn’t be sent.' });
      },
    );
    // "Thinking…" only while the line takes a moment (a command that acts at once shows its line at once).
    setTimeout(() => {
      if (!known && !disposed) showCaption({ status: 'thinking', text: '' });
    }, 0);
  }

  async function sendToJarvis(text) {
    if (typeof deps.sendMessage !== 'function') {
      say('That isn’t a viewer command.');
      return;
    }
    showCaption({ status: 'thinking', text: '' });
    let res;
    try {
      res = await deps.sendMessage(text, { conversationId: model.conversationId });
    } catch (err) {
      res = { error: (err && err.message) || 'That message couldn’t be sent.' };
    }
    if (disposed) return;
    if (res && typeof res.notice === 'string') {
      // The app acted on the words itself (Screens: "put it on screen 2"): no reply to wait for.
      showCaption({ status: 'done', text: res.notice });
      return;
    }
    if (res && res.held) {
      showCaption({ status: 'thinking', text: 'I’ll take that as soon as the details on screen are done.' });
      return;
    }
    if (!res || res.error || !res.run) {
      showCaption({ status: 'error', text: (res && res.error) || 'That message couldn’t be sent.' });
      return;
    }
    if (!trackedRuns.has(res.run)) showCaption({ status: 'thinking', text: '', turnId: res.run.turn && res.run.turn.id });
    trackReply(res.run);
  }

  /** "Stop building": stop the turn that streams this hologram (what is built so far stays, unsaved). */
  function stopBuild() {
    if (disposed || model.status !== 'building' || typeof deps.stopBuild !== 'function') return;
    safe(() => deps.stopBuild({ conversationId: model.conversationId }));
  }

  // ---- microphone -------------------------------------------------------------------------------

  function toggleMic() {
    // Voice Mode is open under the viewer and listens for it: the mic button is its talk button.
    if (deps.voice && safe(() => deps.voice.active(), false)) {
      safe(() => deps.voice.tap());
      return;
    }
    if (listening) {
      safe(() => listening.stop());
      return;
    }
    if (!sttOk) return;
    let handle = null;
    const settings = typeof deps.getSettings === 'function' ? safe(() => deps.getSettings(), {}) : {};
    const finish = () => {
      if (listening === handle) listening = null;
      if (micBtn) {
        micBtn.setAttribute('aria-pressed', 'false');
        micBtn.classList.remove('is-listening');
      }
      cmdInput.placeholder = 'Type or say a command…';
    };
    try {
      handle = deps.stt.startListening({
        lang: settings.listenLang, // '' = the device's language
        wait: settings.listenWait,
        phrases: listenPhrases({ partNames: partNamesForVoice() }),
        onPartial: (t) => {
          cmdInput.value = String(t || '');
          syncSend();
        },
        onFinal: (t, info) => {
          const text = String(t || '').trim();
          cmdInput.value = '';
          syncSend();
          if (!text) return;
          // A reading the recognizer was less sure of that is a command (a part's name) wins over
          // a best reading that isn't one.
          const alts = info && Array.isArray(info.alternatives) ? info.alternatives : [];
          const alt = isCommand(text) ? '' : alts.find((a) => typeof a === 'string' && a.trim() && isCommand(a));
          api.submit(alt ? alt.trim() : text, { source: 'voice' });
        },
        onEnd: finish,
        onError: (e) => {
          const code = e && e.code;
          if (code !== 'aborted' && code !== 'no-speech') say((e && e.message) || 'Voice input stopped.');
          else if (code === 'no-speech') say('I didn’t catch that.');
          finish();
        },
      });
    } catch {
      say('Voice input couldn’t start.');
      return;
    }
    if (!handle) return;
    listening = handle;
    if (micBtn) {
      micBtn.setAttribute('aria-pressed', 'true');
      micBtn.classList.add('is-listening');
    }
    cmdInput.placeholder = 'Listening…';
  }

  /**
   * Voice Mode drives the mic (setVoice): the button shows whether it listens, the words it hears
   * appear in the command field, and while Jarvis thinks or speaks the button stops him (as the
   * core does). null: the viewer's own mic again.
   */
  function syncVoiceMic() {
    if (!micBtn) return;
    const v = voiceInfo;
    if (!v) {
      delete micBtn.dataset.voice;
      micBtn.setAttribute('aria-label', 'Speak a command');
      if (micBtn.dataset.icon === 'stop') {
        micBtn.dataset.icon = 'mic';
        clear(micBtn).appendChild(icon('mic', { size: 20 }));
      }
      if (voiceWords) {
        voiceWords = false;
        cmdInput.value = '';
        cmdInput.placeholder = 'Type or say a command…';
        syncSend();
      }
      if (!listening) {
        micBtn.setAttribute('aria-pressed', 'false');
        micBtn.classList.remove('is-listening');
      }
      return;
    }
    const on = !!v.listening;
    // canListen: Jarvis is building this hologram; a tap listens (commands act on the live model)
    // instead of stopping him, and the labelled Stop button stops the build.
    const listenable = !on && !!v.canListen;
    micBtn.dataset.voice = on ? 'listening' : listenable ? 'idle' : v.busy ? 'busy' : 'idle';
    micBtn.setAttribute('aria-pressed', String(on));
    micBtn.classList.toggle('is-listening', on);
    if (listenable) micBtn.setAttribute('aria-label', 'Speak a command');
    else if (typeof v.label === 'string' && v.label) micBtn.setAttribute('aria-label', v.label);
    const want = !on && v.busy && !listenable ? 'stop' : 'mic';
    if ((micBtn.dataset.icon || 'mic') !== want) {
      micBtn.dataset.icon = want;
      clear(micBtn).appendChild(icon(want, { size: 20 }));
    }
    if (document.activeElement === cmdInput && !voiceWords) return; // the owner is typing
    if (on) {
      cmdInput.placeholder = 'Listening…';
      cmdInput.value = typeof v.heard === 'string' ? v.heard : '';
      voiceWords = true;
    } else {
      cmdInput.placeholder = 'Type or say a command…';
      if (voiceWords) cmdInput.value = '';
      voiceWords = false;
    }
    syncSend();
  }

  // ---- thumbnail for the saved library ----------------------------------------------------------

  let thumbTimer = 0;
  function scheduleThumbnail() {
    if (thumbDone || !model.libraryId || !deps.library || typeof deps.library.setThumbnail !== 'function') return;
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => makeThumbnail(), 900);
  }

  async function makeThumbnail() {
    if (thumbDone || disposed || !holo || !holoReady || model.status !== 'done' || !model.libraryId) return;
    const id = model.libraryId;
    thumbDone = true;
    try {
      const item = typeof deps.library.get === 'function' ? await deps.library.get(id) : null;
      if (!item || item.thumbnail || item.thumb || disposed) return;
      // hull bodies and panels are meshed off the main thread: the picture waits for their fine
      // meshes (at most 4 s), so it shows the finished model
      if (holo && holo.settled) await holo.settled(4000);
      if (disposed || !holo) return;
      const url = holo.snapshot({ width: 320, height: 240, type: 'image/jpeg', quality: 0.82, view: (model.spec && model.spec.view) || null });
      if (url && url.length <= 60000) await deps.library.setThumbnail(id, url);
    } catch (err) {
      console.warn('[jarvis] hologram thumbnail failed:', err && err.message);
    }
  }

  // ---- layout -------------------------------------------------------------------------------------

  let layoutQueued = false;
  function layoutSoon() {
    if (layoutQueued || disposed) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      layout();
    });
  }

  function layout() {
    if (disposed) return;
    const desktop = isDesktop();
    el.dataset.layout = desktop ? 'desktop' : 'phone';
    el.dataset.card = card.hidden ? 'closed' : 'open';
    const topH = top.offsetHeight;
    readout.style.top = `${Math.max(0, topH - 16)}px`;
    const vh = el.clientHeight || window.innerHeight;
    const barRect = bar.getBoundingClientRect();
    const barTop = barRect.height ? barRect.top - el.getBoundingClientRect().top : vh;
    const bottomGap = Math.max(0, vh - barTop);
    let right = 0;
    let left = 0;
    let stack = bottomGap + 8; // where floating things above the bar start (px from the bottom)
    if (desktop) {
      if (!card.hidden) right = card.offsetWidth + 32;
      if (panel) left = panelEl.offsetWidth + 32;
      panelEl.style.bottom = '';
      card.style.bottom = '';
    } else {
      if (!card.hidden) {
        card.style.bottom = `${stack}px`;
        stack += card.offsetHeight + 8;
      }
      if (panel) {
        panelEl.style.bottom = `${stack}px`;
        stack += panelEl.offsetHeight + 8;
      }
    }
    // Phones: the caption never stacks on the part card or the panel (with the model squeezed
    // between them, nothing of it was left to see): with either open, or when it would take more
    // than half the screen, it is a one-line pill under the top bar (tap it to read it all).
    let topStack = topH; // where floating things under the top bar start (px from the top)
    let compact = false;
    if (!desktop && !caption.hidden) {
      compact = !card.hidden || !!panel;
      if (!compact) {
        caption.dataset.compact = 'false'; // measured full-size (the final state is set below, in the same frame)
        compact = stack + caption.offsetHeight > vh * 0.5;
      }
    }
    caption.dataset.compact = compact ? 'true' : 'false';
    if (!compact) delete caption.dataset.expanded;
    if (compact) {
      caption.style.top = `${topH + 2}px`;
      caption.style.bottom = 'auto';
      topStack = topH + 2 + caption.offsetHeight + 4;
    } else {
      caption.style.top = '';
      caption.style.bottom = `${desktop ? bottomGap + 12 : stack}px`;
    }
    const capH = caption.hidden || compact ? 0 : caption.offsetHeight + 8;
    // The toast: on phones under the top bar (never on the model or the selected part); on desktop
    // above the bar and the caption.
    if (desktop) {
      toast.style.top = '';
      toast.style.bottom = `${bottomGap + 12 + capH}px`;
    } else {
      toast.style.bottom = 'auto';
      toast.style.top = `${topStack + 2}px`;
    }
    // The model and its labels keep clear of everything: the caption counts on desktop too.
    const insetBottom = desktop ? bottomGap + (capH ? 12 + capH : 0) : stack + capH - 8;
    if (holo && holoReady) safe(() => holo.setInsets({ top: Math.max(0, topStack - 4), bottom: insetBottom, right, left }));
  }

  const onResize = () => layoutSoon();
  window.addEventListener('resize', onResize);
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => layoutSoon());
    for (const node of [bar, card, panelEl, caption, top]) ro.observe(node);
  }

  // ---- keyboard ---------------------------------------------------------------------------------

  function onEscape() {
    if (photoViewer) return photoViewer.close();
    if (tour) return endTour('esc'); // a walkthrough ends first; the next Esc closes as before
    if (panel) return closePanel();
    if (selectedPart || state.selected) return run({ action: 'deselect' });
    return api.close();
  }

  // ---- walkthroughs (v8.1, SPEC §29) ----------------------------------------------------------------

  /** Resolves true once the renderer is up (now or later), false after `ms` (or with no 3D view). */
  function rendererReady(ms) {
    if (holo && holoReady) return Promise.resolve(true);
    if (disposed || el.dataset.state === 'nogl') return Promise.resolve(false);
    return new Promise((resolve) => {
      const done = (ok) => {
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => {
        const i = readyWaiters.indexOf(done);
        if (i >= 0) readyWaiters.splice(i, 1);
        resolve(false);
      }, ms);
      readyWaiters.push(done);
    });
  }

  /**
   * The tour's renderer target (contract (e)): the renderer's tourTarget(), reached through whatever
   * renderer is up when a step is shown (a tour started as the viewer opens waits for it in settled()).
   */
  function tourTarget() {
    const call = (name, ...args) => {
      const t = holo && holoReady && typeof holo.tourTarget === 'function' ? safe(() => holo.tourTarget(), null) : null;
      return t && typeof t[name] === 'function' ? safe(() => t[name](...args), undefined) : undefined;
    };
    return {
      setEmphasis: (e) => call('setEmphasis', e),
      flyTo: (o) => call('flyTo', o),
      explode: (v, animate) => call('explode', v, animate),
      focus: (id) => call('focus', id),
      select: (id) => call('select', id),
      setLabels: (on) => call('setLabels', on),
      holdAutoRotate: (on) => call('holdAutoRotate', on),
      getState: () => call('getState'),
      settled: (ms) => rendererReady(ms).then((ok) => (ok ? call('settled', ms) : false)),
    };
  }

  /** Voice Mode, while it is open under the viewer (it says the tour, asks its decisions, holds a woken session). */
  const liveVoice = () => {
    const v = typeof deps.tourVoice === 'function' ? safe(() => deps.tourVoice(), null) : null;
    return v && typeof v.narrate === 'function' ? v : null;
  };
  const tourNarrator = { narrate: (o) => { const v = liveVoice(); return v ? v.narrate(o) : null; } };
  const tourAsker = {
    ask: (q) => {
      const v = liveVoice();
      if (!v || typeof v.question !== 'function') return null;
      // Kept open: other words heard at the decision are routed as usual (a question about the part).
      return v.question({ id: q.id, say: q.say, choices: q.choices, match: (text) => choiceReply(text, q.choices, { defaultId: q.defaultId }), keep: true, onAnswer: q.onAnswer, onExpire: q.onExpire });
    },
  };
  const tourHolder = {
    hold: () => { const v = liveVoice(); if (v && typeof v.hold === 'function') v.hold('tour'); },
    release: () => { const v = liveVoice(); if (v && typeof v.release === 'function') v.release('tour'); },
  };
  /** A short line: said by Voice Mode when it is open, else shown. */
  const tourSay = (line) => {
    const v = liveVoice();
    if (!(v && typeof v.say === 'function' && safe(() => v.say(line), false))) say(line);
  };
  const tourVoiceDeps = () => (liveVoice() ? { narrator: tourNarrator, asker: tourAsker, holder: tourHolder, say: tourSay } : { narrator: null, asker: null, holder: null, say: tourSay });

  /** Start a walkthrough of this hologram: the free local plan (part tour with partId), or `plan`. */
  function startTour({ partId = null, plan = null } = {}) {
    if (disposed) return { ok: false, reason: 'closed' };
    if (el.dataset.state === 'nogl') return { ok: false, reason: 'nogl' };
    if (model.status === 'building' || !model.spec) return { ok: false, reason: 'building' };
    const p = plan || safe(() => localTourPlan(model.spec, { partId }), null);
    if (!p || !Array.isArray(p.steps) || !p.steps.length) return { ok: false, reason: 'none' };
    endTour('replaced');
    clearViewLook();
    if (panel) closePanel();
    const t = { plan: p, player: null, bar: null, voiced: !!liveVoice() };
    t.bar = createTourBar({
      onBack: () => tour === t && t.player.back(),
      onToggle: () => tour === t && t.player.toggle(),
      onNext: () => tour === t && t.player.next(),
      onEnd: () => tour === t && endTour('owner'),
      onChoose: (id) => tour === t && t.player.choose(id, { via: 'tap' }),
    });
    tour = t;
    const settings = typeof deps.getSettings === 'function' ? safe(() => deps.getSettings(), {}) : {};
    t.player = createTourPlayer({
      plan: p,
      target: tourTarget(),
      ...tourVoiceDeps(),
      rate: Number(settings && settings.voiceRate) || 1,
      spec: model.spec,
      onChange: (st) => tour === t && onTourChange(st),
    });
    barInner.insertBefore(t.bar.el, cmdForm);
    el.dataset.tour = 'on';
    t.bar.render(t.player.getState());
    // Space and the arrows work at once (the overlay's first focus, Close, would take Space)
    if (document.activeElement === closeBtn || document.activeElement === document.body) safe(() => t.bar.el.querySelector('[data-testid="tour-toggle"]').focus());
    t.player.start();
    if (document.hidden) t.player.setHidden(true);
    layoutSoon();
    return { ok: true, plan: p };
  }

  /** End the walkthrough (the hologram stays where it is). True when there was one. */
  function endTour(reason = 'owner') {
    const t = tour;
    if (!t) return false;
    tour = null;
    safe(() => t.player.end(reason));
    t.bar.destroy();
    const ds = el.dataset;
    for (const k of ['tour', 'tourStatus', 'tourStep', 'tourIndex', 'tourTotal', 'tourView']) delete ds[k];
    if (!caption.hidden && caption.dataset.state === 'tour') hideCaption();
    layoutSoon();
    return true;
  }

  function onTourChange(st) {
    if (disposed || !tour) return;
    tour.bar.render(st);
    const ds = el.dataset;
    ds.tourStatus = st.status;
    ds.tourStep = st.stepId || '';
    ds.tourIndex = String(st.index || 0);
    ds.tourTotal = String(st.total || 0);
    ds.tourView = st.view || '';
    // Phones: the bar keeps the count and the buttons; the step's words are the caption.
    if (!isDesktop() && st.status !== 'ended') {
      const words = st.status === 'choice' ? st.ask : st.say;
      if (words && (caption.hidden || caption.dataset.state !== 'tour' || capText.textContent !== words)) showCaption({ status: 'tour', text: words });
    }
  }

  /** The tour's state for the router (contract (b)'s `tour`), or null when none runs. */
  function tourState() {
    const p = tour && tour.player;
    const st = p ? p.getState() : null;
    if (!st || st.status === 'ended' || st.status === 'idle') return null;
    const atChoice = st.status === 'choice' && st.choices.length > 0;
    return {
      active: true,
      atChoice,
      choices: atChoice ? st.choices : [],
      defaultId: st.defaultId,
      stepId: st.stepId,
      status: st.status,
      paused: st.status === 'paused',
      waits: st.status === 'waiting',
      // "what?" asks for the step again only right after it was said (it waits, or is done)
      justSaid: st.status === 'waiting' || st.status === 'done' || atChoice,
      index: st.index,
      total: st.total,
      view: st.view,
      parts: st.parts,
    };
  }

  /** A tour word (src/ui/commands/tours.js): what it did, truthy; { say } for a view without a step. */
  function tourCommand(action) {
    const p = tour && tour.player;
    if (!p || !action) return false;
    switch (action.do) {
      case 'tour-next':
        p.next();
        return true;
      case 'tour-back':
        p.back();
        return true;
      case 'tour-repeat':
        p.repeat();
        return true;
      case 'tour-pause':
        return p.pause('owner');
      case 'tour-resume':
        p.resume();
        return true;
      case 'tour-end':
        return endTour('owner');
      case 'tour-choice':
        return p.choose(action.choice, { via: 'voice' }) || true;
      case 'tour-jump':
        return p.jump(action.partId);
      case 'tour-view': {
        if (!p.showView(action.view)) return { say: viewLine(action.view, null) };
        // the plan's own step says it; else the view is shown, paused, with a line
        const st = p.getState();
        return st.status === 'paused' ? { say: viewLine(action.view, st.parts[0] || tour.plan.for) } : true;
      }
      default:
        return false;
    }
  }

  /** The line for "show it enclosed / opened" without a step of its own. */
  function viewLine(view, partId) {
    const part = partId ? partById(partId) : null;
    if (!part) return view === 'opened' ? 'I can’t show that one opened.' : 'I can’t show that one enclosed.';
    const the = spokenName(part.name);
    if (view === 'enclosed') return `Here’s ${the}, enclosed: the case is see-through.`;
    const place = model.spec ? safe(() => partPlacement(model.spec, part.id), null) : null;
    return place && place.wayIn ? `Here’s ${the}, with ${place.wayIn} off.` : `Here’s ${the}, opened up.`;
  }

  /** No tour: "show it enclosed / opened" on a part (the selected one): that view, and its line. */
  function showViewOutside(view, partId = null) {
    if (disposed || tour) return null;
    const id = partId || state.selected;
    const part = id ? partById(id) : null;
    if (!part || !holo || !holoReady || typeof holo.tourTarget !== 'function') return null;
    const show = model.spec ? safe(() => partViewShow(model.spec, part.id, view), null) : null;
    if (!show) return view === 'opened' ? { say: `${spokenName(part.name).replace(/^the/, 'The')} doesn’t come out in this hologram, so I can’t show it opened.` } : null;
    const target = holo.tourTarget();
    if (!viewLook) viewLook = { labels: state.labels !== false };
    safe(() => target.setEmphasis({ glow: show.glow, ghost: show.ghost, hide: show.hide }));
    safe(() => target.explode(show.explode));
    safe(() => target.setLabels(show.glow));
    safe(() => target.flyTo({ ids: [part.id], frame: show.frame, ...(show.camera ? { view: show.camera } : {}) }));
    return { say: viewLine(view, part.id) };
  }

  /** The look "show it enclosed" left goes (another part, "reset", a tour). */
  function clearViewLook() {
    const look = viewLook;
    if (!look) return;
    viewLook = false;
    const t = holo && holoReady && typeof holo.tourTarget === 'function' ? safe(() => holo.tourTarget(), null) : null;
    if (!t) return;
    safe(() => t.setEmphasis(null));
    safe(() => t.setLabels(look.labels !== false));
  }

  /** What is on screen, for a question's turn context (startTurn's viewer option). */
  function viewerContext() {
    if (disposed) return null;
    const name = (id) => {
      const p = partById(id);
      return p ? p.name : id;
    };
    const emphasis = state.emphasis && typeof state.emphasis === 'object' ? state.emphasis : null;
    const glowing = emphasis && Array.isArray(emphasis.glow) ? emphasis.glow.filter((id) => partById(id)).map((id) => ({ id, name: name(id) })) : [];
    const st = tour && tour.player ? tour.player.getState() : null;
    const main = st && st.parts && st.parts[0] ? st.parts[0] : null;
    return {
      title: (model.spec && model.spec.title) || model.title || '',
      exploded: Number(state.exploded) || 0,
      selected: state.selected ? { id: state.selected, name: name(state.selected) } : null,
      glowing,
      tour: st && st.status !== 'ended' && st.status !== 'idle' ? { index: st.index, total: st.total, part: main ? spokenName(name(main)) : '', view: st.view } : null,
    };
  }

  // ←, →, Space (not while typing): the tour's steps; Esc ends it first (onEscape).
  function onTourKey(e) {
    if (!tour || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target && typeof e.target.closest === 'function' ? e.target : null;
    if (target && target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    const space = e.key === ' ' || e.key === 'Spacebar';
    if (space && target && target.closest('.hv__tour button')) return; // the bar's own button takes it
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && !space) return;
    e.preventDefault();
    if (e.type !== 'keydown' || e.repeat) return;
    const p = tour.player;
    if (e.key === 'ArrowLeft') p.back();
    else if (e.key === 'ArrowRight') p.next();
    else p.toggle();
  }
  el.addEventListener('keydown', onTourKey);
  el.addEventListener('keyup', onTourKey); // Space on another button (Close) must not click it during a tour

  // A touch or drag on the model pauses the tour (Play goes on from that step).
  const onStagePress = () => {
    if (tour && tour.player) tour.player.pause('touch');
  };
  stage.addEventListener('pointerdown', onStagePress);

  // A hidden page stops drawing: the tour pauses and lets go of the session; shown again, it goes on.
  const onVisibility = () => {
    if (tour && tour.player) tour.player.setHidden(document.hidden);
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ---- public controller --------------------------------------------------------------------------

  const api = {
    el,
    get modelId() {
      return model.libraryId;
    },
    get segmentId() {
      return model.segmentId;
    },
    get conversationId() {
      return model.conversationId;
    },
    isOpen: () => !disposed,
    /** The parts' names and other names (aka): what Voice Mode listens for while this is open. */
    partNames: () => partNamesForVoice(),
    /** v8.1: the parts its commands match, [{ id, name, aka }] (the command router's state). */
    parts: () => partsForMatcher(),
    getState: () => ({ ...state, status: model.status, libraryId: model.libraryId, segmentId: model.segmentId, title: (model.spec && model.spec.title) || model.title, panel }),
    /** A newer copy of a hologram segment (forwarded by the app for any run). */
    update: (seg) => onSegment(seg),
    /**
     * A local (free) viewer command, typed or spoken. Returns { handled: true, command } when the
     * words were a command (and runs it), { handled: false } when they are for Jarvis.
     *   signal        Voice Mode's Stop for a 2D request still looking in the library
     *   spoken        Voice Mode says the acknowledgement itself (no toast over the model)
     *   confirmBuild  Voice Mode: a 2D build from a softer wording ("rotor blueprint") is asked first
     *   later         the owner spoke while the reply that builds it streams: a 2D request waits
     *                 ({ handled: false, later: true })
     */
    command(text, { source: from = 'typed', signal = null, spoken = false, confirmBuild = false, later = false } = {}) {
      if (disposed) return { handled: false };
      const words = String(text || '');
      let cmd = matchHologramCommand(words, partsForMatcher(), { selected: state.selected });
      if (!cmd) {
        // "isolate it" with nothing selected: the last part shown, else ask which (never a paid message).
        const wants = commandNeedingPart(words);
        if (!wants) return { handled: false };
        const last = lastSelectedId ? partById(lastSelectedId) : null;
        cmd = last ? { action: wants, partId: last.id, partName: last.name } : { action: 'which-part', for: wants };
      }
      el.dataset.lastCommand = cmd.action;
      el.dataset.lastSource = from;
      if (cmd.action === 'which-part') {
        if (!spoken) say('Which part? Tap one first.');
        return { handled: true, command: cmd };
      }
      // "close the blueprint" with no blueprint open over the viewer: nothing to do (never a paid message).
      if (cmd.action === 'close-blueprint') return { handled: true, command: cmd };
      if (cmd.action === 'blueprint') {
        // Said while the reply that builds it still streams: a 2D request waits for that reply.
        if (later) return { handled: false, later: true };
        // The owner asked in words, so the paid build may start (or a saved sheet opens): the
        // outcome comes later (Voice Mode says it). A softer wording heard in Voice Mode is asked first.
        const ask = !!confirmBuild && !blueprintAskedOutright(words);
        return { handled: true, command: cmd, done: requestBlueprint(cmd.partId || null, { signal, ask }) };
      }
      const word = run(cmd);
      if (word && !spoken) say(word);
      // Spoken commands move on from the last reply: its caption (said already) makes room.
      if (from === 'voice' && caption.dataset.state === 'done') hideCaption();
      return { handled: true, command: cmd };
    },
    /** A caption from Voice Mode ("I'll take that once the hologram is built."). */
    note(text, { heard = false } = {}) {
      if (disposed || !text) return;
      // heard: Voice Mode's 2-second check (what it heard, before it is sent); it leaves by itself.
      showCaption({ status: heard ? 'heard' : 'thinking', text: String(text) });
    },
    /**
     * Voice Mode has said the reply (or an acknowledgement): the caption only repeats it, so a
     * finished one leaves after a few seconds (and one still streaming, once it finishes). A reply
     * with details in the chat stays as long as any caption: "Open in chat" is the way to them.
     */
    captionSpoken() {
      if (disposed) return;
      spokenSoon = true;
      if (!caption.hidden && caption.dataset.state === 'done') {
        clearTimeout(captionTimer);
        captionTimer = setTimeout(hideCaption, doneHideMs());
      }
    },
    /** Caption a reply that Voice Mode follows (text only: Voice Mode opens what it shows). */
    follow(runObj) {
      if (disposed || !runObj || typeof runObj !== 'object' || trackedRuns.has(runObj)) return;
      const turn = runObj.turn;
      if (turn && turn.status === 'running') showCaption({ status: 'thinking', text: '', turnId: turn.id });
      trackReply(runObj, { captionOnly: true });
    },
    /** Voice Mode drives the mic: { state, label, listening, heard, busy }, or null to stop. */
    setVoice(info) {
      if (disposed) return;
      voiceInfo = info && typeof info === 'object' ? { ...info } : null;
      syncVoiceMic();
      el.dataset.voice = voiceInfo ? (voiceInfo.listening ? 'listening' : voiceInfo.state || 'idle') : '';
      // A walkthrough speaks through Voice Mode while it is open (and on its own when it closes).
      const voiced = !!liveVoice();
      if (tour && tour.voiced !== voiced) {
        tour.voiced = voiced;
        tour.player.setVoice(tourVoiceDeps());
      }
    },
    /** v8.1 walkthroughs (see the file comment). */
    startTour: (opts) => startTour(opts),
    tour: () => tourState(),
    tourCommand: (action) => tourCommand(action),
    endTour: (reason) => endTour(reason),
    showView: (view, partId) => showViewOutside(view, partId),
    viewerContext: () => viewerContext(),
    /**
     * The command field: a local command first, otherwise a chat message to Jarvis. v8.1: the app's
     * router (deps.route) picks the command, in this surface's order (today: this hologram's, then
     * Screens, then Apple Music): its result, { handled: true, notice: Promise<line> } (shown in the
     * caption) or null (the words go to Jarvis). Without a router: this hologram's commands first.
     */
    submit(text, opts = {}) {
      if (typeof deps.route === 'function') {
        let routed;
        try {
          routed = deps.route(text, { ...opts, viewer: api });
        } catch (err) {
          console.warn('[jarvis] the router failed', err);
          routed = undefined;
        }
        if (routed && routed.handled) {
          if (routed.notice) showNotice(routed.notice);
          return routed;
        }
        if (routed === null) {
          sendToJarvis(String(text || '').trim());
          return { handled: false };
        }
      }
      const res = api.command(text, opts);
      if (!res.handled) sendToJarvis(String(text || '').trim());
      return res;
    },
    close() {
      if (disposed) return;
      endTour('closed');
      disposed = true;
      if (active === api) active = null;
      while (readyWaiters.length) readyWaiters.shift()(false);
      el.removeEventListener('keydown', onTourKey);
      el.removeEventListener('keyup', onTourKey);
      stage.removeEventListener('pointerdown', onStagePress);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(liveTimer);
      clearTimeout(toastTimer);
      clearTimeout(captionTimer);
      clearTimeout(thumbTimer);
      clearTimeout(twoDTimer);
      if (typeof offLibrary === 'function') safe(() => offLibrary());
      for (const off of Array.from(runSubs)) off();
      if (listening) safe(() => listening.abort ? listening.abort() : listening.stop());
      if (photoViewer) photoViewer.close();
      if (photoStrip) photoStrip.destroy();
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
      if (holo) safe(() => holo.dispose());
      holo = null;
      overlay.close();
      if (typeof deps.onClose === 'function') safe(() => deps.onClose());
    },
  };

  active = api;
  syncChrome();
  layoutSoon();
  startRenderer();
  return api;
}
