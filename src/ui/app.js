// Application shell: owns app state (current conversation, active runs, layout, sheets),
// wires the engine to the platform modules and the UI components, and maps Jarvis's
// activity onto the HUD core (idle / listening / thinking / working / speaking / error /
// offline). Demo mode (?demo=1) swaps in a scripted engine and an in-memory store.

import { h, on, raf } from './dom.js';
import { icon } from './icons.js';
import { createHeader } from './header.js';
import { createChat, plainText } from './chat.js';
import { createComposer } from './composer.js';
import { createHistory } from './history.js';
import { createSettingsPanel } from './settings.js';
import * as sounds from './sounds.js';
import { applyTheme } from './themes.js';
import { initAttention, missionFinished, describeFinishedTurn } from './attention.js';
import { createOnboarding } from './onboarding.js';
import { createInstallGuide } from './install-guide.js';
import { initSheets, createSheet, anySheetOpen } from './sheet.js';
import { createToasts } from './toasts.js';
import { createDemo } from './demo.js';
import { createMissionControl } from './hud/mission-control.js';
import { createCore } from './hud/core.js';
import { openVoiceMode, isVoiceModeOpen, finalAnswerMarkdown, voiceModeSpoke } from './voice-mode.js';
import { recordTurn, createStatsView, createStatsLauncher, exportStats, importStats } from './stats.js';
import { createShareOptions, redactSecrets } from './share.js';
import { createFollowupChips, parseProtocolPrompt, exportCustomProtocols, importCustomProtocols } from './protocols.js';
import { fmtUsd } from './hud/format.js';
import { openHologramViewer, getHologramViewer } from './hologram/viewer.js';
import { openBlueprintViewer, getBlueprintViewer } from './blueprint/open.js';
import { createLibraryView } from './library.js';
import { createThumbs } from './thumbs.js';
import { isOverlayOpen } from './overlay.js';
import { matchHologramCommand, normalizeCommandText } from '../lib/hologram-commands.js';
import { createJarvis, MODELS, DEPTHS, blueprintCostUsd, costLabel, blueprintRequestText, hasVisualTools, isVisualSegment, visualExportLine } from '../engine/index.js';
import { suggestFollowups } from '../engine/followups.js';
import { getSettings, saveSettings, onSettingsChange } from '../platform/settings.js';
import { getApiKey, getDevApiBase } from '../platform/secrets.js';
import { listMemory, addMemory, removeMemory, onMemoryChange } from '../platform/memory.js';
import { addSpend, getSpend, onSpendChange } from '../platform/spend.js';
import { listConversations, getConversation, saveConversation, deleteConversation, deleteAllConversations, isPersistent, getPersistence, onPersistenceChange, onConversationConflict, onRemoteSave } from '../platform/db.js';
import { resetApp, registerBackupPart } from '../platform/backup.js';
import { saveLibraryItem, getLibraryItem, listLibraryItems, findPartBlueprint, setLibraryThumbnail, deleteLibraryItem, onLibraryChange } from '../platform/library.js';
import { isOnline, onOnlineChange } from '../platform/env.js';
import { keepAwake, allowSleep } from '../platform/wakelock.js';
import { registerServiceWorker } from '../platform/pwa.js';
import * as stt from '../platform/voice/stt.js';
import * as deviceTts from '../platform/voice/tts.js';
import { createVoiceRouter } from '../platform/voice/voice-router.js';
import { createNaturalVoice } from '../platform/voice/natural/setup.js';
import { markdownToPlainText } from '../lib/markdown.js';
import { currentOptics, isOpticsOpen, openOptics, opticsCameraBridge } from './optics/optics.js';
import { runWatchLook } from '../engine/watch.js';
import { estimateHologramCost, estimateLookCost } from '../lib/optics.js';
import { voiceCameraRequest } from '../lib/optics-commands.js';
import { cameraPermission, cameraSupported, screenLookSupported } from '../platform/camera.js';
import { isIOS } from '../platform/env.js';
import { base64ByteLength } from './attachments.js';

const { sttSupported, startListening } = stt;
// Speech: the device voice (tts.js), or the opt-in natural voice (Kokoro in a Worker) when it
// is on and ready; the router has tts.js's API, so Voice Mode and the chat use it unchanged.
const naturalVoice = safeInit(() => createNaturalVoice({ getVoice: () => getSettings().naturalVoiceId }));
const tts = createVoiceRouter({ device: deviceTts, natural: naturalVoice, getSettings });
// With the natural voice on, ask once which engine this device runs (a WebGPU adapter or not), so a
// device already measured too slow speaks with the built-in voice at once (engine knownSlow()).
if (naturalVoice && safeInit(() => getSettings().naturalVoice)) naturalVoice.choosePlan().catch(() => {});
const { ttsSupported, unlockSpeech, speak, stopSpeaking, toSpeech } = tts;

function safeInit(fn) {
  try {
    return fn();
  } catch (err) {
    console.error('[jarvis] natural voice unavailable:', err);
    return null;
  }
}

const UI_KEYS = {
  last: 'jarvis.ui.lastConversation',
  sidebar: 'jarvis.ui.sidebar',
  spendDismissed: 'jarvis.ui.spendDismissed',
};
const RESTORE_WINDOW_MS = 3 * 60 * 60 * 1000;
const DESKTOP_MQ = '(min-width: 900px)';
const WIDE_MQ = '(min-width: 1200px)';

// ---- tiny utilities ---------------------------------------------------------------------

function uiGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function uiSet(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: per-session only */
  }
}
function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    console.error('[jarvis]', err);
    return fallback;
  }
}
function usd(v) {
  try {
    return fmtUsd(Number(v) || 0);
  } catch {
    return `≈ $${(Number(v) || 0).toFixed(2)}`;
  }
}
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** A conversation's turns / a turn's segments, objects only (stored records can be damaged). */
const turnsOf = (conv) => (conv && Array.isArray(conv.turns) ? conv.turns.filter(isObj) : []);
const segmentsOf = (turn) => (turn && Array.isArray(turn.segments) ? turn.segments.filter(isObj) : []);
const missionsOf = (turn) => (turn && isObj(turn.missions) ? turn.missions : {});
function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall back below */
  }
  try {
    const ta = h('textarea', { value: text, class: 'visually-hidden', attrs: { 'aria-hidden': 'true', readonly: '' } });
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ---- app ----------------------------------------------------------------------------------

export async function startApp(rootEl) {
  const root = rootEl || document.getElementById('app');
  if (!root) throw new Error('Missing #app root element');
  const params = new URLSearchParams(location.search);
  const demoMode = params.get('demo') === '1';

  const state = {
    demo: demoMode,
    conv: null,
    runs: new Map(), // convId -> { run, conv, unsub }
    layout: 'phone',
    online: safe(() => isOnline(), true),
    listening: null,
    speaking: null, // { turnId, handle }
    errorUntil: 0,
    sidebarOpen: true,
    mcSel: null, // { turnId, missionId }
    pendingUpdate: null,
    lastSettings: safe(getSettings, {}),
    bootDone: false,
  };

  // Ambience (SPEC §14.3): theme first (before anything paints), then sounds and attention.
  safe(() => applyTheme(state.lastSettings.theme));
  safe(() => sounds.initSounds(getSettings));
  safe(() => initAttention(getSettings));
  // Backups also carry the owner's custom protocols and usage statistics (merged on import).
  safe(() => registerBackupPart('protocols', { exportData: () => exportCustomProtocols(), importData: (list) => importCustomProtocols(list) }));
  safe(() => registerBackupPart('stats', { exportData: () => exportStats(), importData: (data) => importStats(data) }));

  const ttsOk = safe(() => ttsSupported(), false);
  const sttOk = safe(() => sttSupported(), false);

  // ---- engine & store ---------------------------------------------------------------------
  // The saved library of holograms and blueprints (IndexedDB, src/platform/library.js).
  const lib = {
    save: (record) => saveLibraryItem(record),
    get: (id) => getLibraryItem(id),
    list: (opts) => listLibraryItems(opts),
    findPartBlueprint: (modelId, partId) => findPartBlueprint(modelId, partId),
    setThumbnail: (id, dataUrl) => setLibraryThumbnail(id, dataUrl),
    remove: (id) => deleteLibraryItem(id),
    onChange: (fn) => onLibraryChange(fn),
  };
  const thumbs = createThumbs(lib);
  let engine;
  let store;
  let demo = null;
  if (state.demo) {
    demo = createDemo({ speed: Number(params.get('speed')) || 1, getSettings });
    engine = demo.engine;
    store = demo.store;
  } else {
    store = {
      list: () => listConversations(),
      get: (id) => getConversation(id),
      save: (c) => saveConversation(c),
      remove: (id) => deleteConversation(id),
      removeAll: () => deleteAllConversations(),
      isPersistent: () => safe(() => isPersistent(), true),
    };
    engine = createJarvis({
      getSettings,
      getApiKey,
      getApiBase: getDevApiBase,
      // Optics: the live camera while the Optics screen is open (look_through_camera, lead tools V5).
      camera: opticsCameraBridge,
      memory: { list: () => listMemory(), add: (text) => addMemory(text), remove: (text) => removeMemory(text) },
      library: { save: lib.save, get: lib.get, list: lib.list, findPartBlueprint: lib.findPartBlueprint },
      // A busy or old device can take seconds to write a big spec to IndexedDB: wait longer than the
      // engine's default before going on without saving (an unsaved hologram can't get blueprints).
      libraryTimeoutMs: 12000,
      persist: async (conv) => {
        await saveConversation(conv);
        scheduleHistoryRefresh();
      },
      onSpend: (amount) => {
        try {
          addSpend(amount);
        } catch (err) {
          console.error('[jarvis] addSpend failed:', err);
        }
      },
      onFeatureUnsupported: (name) => {
        try {
          saveSettings({ features: { [name]: false } });
        } catch (err) {
          console.error('[jarvis] disabling feature failed:', err);
        }
      },
    });
  }

  // ---- DOM skeleton -----------------------------------------------------------------------
  const toasts = createToasts();
  const live = h('div', { class: 'visually-hidden', attrs: { 'aria-live': 'polite', role: 'status', 'data-testid': 'live-region' } });
  const sheetLayer = h('div', { class: 'sheet-layer' });

  const header = createHeader({
    demo: state.demo,
    voice: sttOk || ttsOk,
    onVoice: () => openVoice(),
    onHistory: () => openHistory(),
    onLibrary: () => openLibrary(),
    onSettings: () => openSettings(),
    onNewChat: () => newChat(),
  });

  const chat = createChat({
    isTurnActive: (turnId) => {
      for (const entry of state.runs.values()) if (entry.run.turn && entry.run.turn.id === turnId) return true;
      return false;
    },
    canResume: () => !!(state.conv && !state.runs.has(state.conv.id) && !runningElsewhere(state.conv.id) && safe(() => engine.canResume(state.conv), false)),
    runningElsewhere: () => !!(state.conv && !state.runs.has(state.conv.id) && runningElsewhere(state.conv.id)),
    onResume: () => resume(),
    onRetry: (turn) => retry(turn),
    onCopy: (turn) => copyTurn(turn),
    onShare: (turn) => openShare(turn),
    // Hologram and blueprint cards (live while building; thumbnails from the saved library).
    onOpenHologram: (turn, seg) => openVisualSegment(turn, seg),
    onOpenBlueprint: (turn, seg) => openVisualSegment(turn, seg),
    thumbs,
    // Memory chips: "Undo" removes a fact Jarvis just saved (the demo has no real memory).
    isRemembered: (fact) => (state.demo ? null : isRemembered(fact)),
    onForgetMemory: state.demo ? null : (fact) => forgetMemory(fact),
    onSpeak: (turn) => toggleSpeakTurn(turn),
    isSpeaking: (turnId) => !!(state.speaking && state.speaking.turnId === turnId),
    onOpenMission: (turn, missionId) => openMission(turn, missionId),
    onOpenSettings: (section) => openSettings({ section, focus: section === 'apikey' ? 'apikey-input' : null }),
    onNewChat: () => newChat(),
    // Like a protocol, a suggestion's mode applies to that run only: the composer keeps the owner's
    // own mode, so follow-ups never inherit a Swarm (or Quick) they didn't choose. A send that was
    // refused (offline, no key) leaves the text and its mode waiting in the composer.
    onSuggestion: (text, mode) => {
      if (!send(text, mode)) {
        composer.setMode(mode);
        composer.setText(text);
      }
    },
    // A protocol's mode applies to that run only (the composer keeps its own mode). Returning
    // send()'s boolean keeps the protocol's input row open when the run couldn't start.
    onProtocol: (text, mode) => send(text, mode),
    onVoice: sttOk || ttsOk ? () => openVoice() : null,
    getSettings: () => getSettings(),
    sounds,
    getGreeting: () => greeting(),
    // Optics: a Look's frame card (and a pins row) reopens the frozen frame with its labels.
    onOpenOptics: (turn, seg) => reviewOptics(turn, seg),
    ttsSupported: ttsOk,
  });

  const composer = createComposer({
    mode: state.lastSettings.mode,
    micSupported: sttOk,
    // The camera key opens Optics (live camera); false = no camera API here, use the system camera.
    onCamera: () => (state.demo || !safe(() => cameraSupported(), false) ? false : openOpticsScreen()),
    getSettings: () => getSettings(),
    onSend: (text, mode, extras) => send(text, mode, extras),
    onStop: () => stop(),
    onMic: () => toggleMic(),
    onHintAction: (code) => {
      if (code === 'nokey') openSettings({ section: 'apikey', focus: 'apikey-input' });
    },
  });

  const banners = h('div', { class: 'banners', attrs: { 'aria-live': 'polite' } });

  const history = createHistory({
    onSelect: (id) => openConversation(id),
    onNew: () => newChat(),
    onLibrary: () => openLibrary(),
    onDelete: (id) => removeConversation(id),
    isRunning: (id) => state.runs.has(id),
    onCollapse: () => setSidebar(false),
  });

  const sidebar = h('aside', { class: 'sidebar', attrs: { 'aria-label': 'History' } });
  const sidebarScrim = h('div', { class: 'sidebar-scrim', attrs: { 'aria-hidden': 'true' }, on: { click: () => setSidebar(false) } });
  const panelMcHost = h('div', { class: 'panel-mc' });
  const panelStats = h('div', { class: 'panel-stats', attrs: { 'aria-label': 'Session' } });
  const statsLauncher = createStatsLauncher({ onOpen: () => openSystems() });
  const panel = h('aside', { class: 'panel', attrs: { 'aria-label': 'Mission Control' } }, panelMcHost, panelStats, statsLauncher.el);
  const main = h('main', { class: 'main' }, banners, chat.el, composer.el);
  const body = h('div', { class: 'body' }, sidebar, sidebarScrim, main, panel);
  const shell = h('div', { class: 'shell' }, header.el, body);
  const bg = h('div', { class: 'app-bg', attrs: { 'aria-hidden': 'true' } }, h('div', { class: 'app-bg-grid' }), h('div', { class: 'app-bg-glow' }));

  root.replaceChildren(bg, shell, sheetLayer, toasts.el, live);
  root.classList.add('app');
  root.dataset.demo = state.demo ? 'true' : 'false';
  initSheets({ layer: sheetLayer, shell });

  const toast = (msg, opts) => toasts.show(msg, opts);

  // ---- announcements (throttled aria-live) ------------------------------------------------
  let lastAnnounce = '';
  // Each message is spoken, at most one every 2.5 s (a burst such as "Mission complete" then
  // "Reply ready" is queued, not collapsed to its last line); repeats of the line just spoken
  // or already waiting are skipped.
  const ANNOUNCE_GAP_MS = 2500;
  const announceQueue = [];
  let announceTimer = 0;
  let lastAnnouncedAt = -Infinity;
  function speakNextAnnouncement() {
    announceTimer = 0;
    const msg = announceQueue.shift();
    if (!msg) return;
    lastAnnounce = msg;
    lastAnnouncedAt = performance.now();
    live.textContent = msg;
    setTimeout(() => {
      if (lastAnnounce === msg) lastAnnounce = '';
    }, 4000);
    if (announceQueue.length) announceTimer = setTimeout(speakNextAnnouncement, ANNOUNCE_GAP_MS);
  }
  function announce(msg) {
    if (!msg || msg === lastAnnounce || announceQueue.includes(msg)) return;
    announceQueue.push(msg);
    if (announceQueue.length > 4) announceQueue.splice(0, announceQueue.length - 4); // stay current
    if (announceTimer) return;
    const wait = Math.max(0, lastAnnouncedAt + ANNOUNCE_GAP_MS - performance.now());
    announceTimer = setTimeout(speakNextAnnouncement, wait);
  }

  // ---- greeting & readouts --------------------------------------------------------------
  function metaLine() {
    const s = getSettings();
    const model = (MODELS[s.leadModel] && MODELS[s.leadModel].short) || s.leadModel;
    const depth = (DEPTHS[s.depth] && DEPTHS[s.depth].label) || s.depth;
    return `${model} · ${depth} · up to ${s.maxAgents} agents`;
  }
  function greeting() {
    const s = getSettings();
    const hour = new Date().getHours();
    const part = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening';
    return {
      title: `Good ${part}, ${s.userName || 'sir'}.`,
      subtitle: 'Ask me anything. I can answer directly, search the web, or deploy a team of research agents.',
      meta: `Systems online · ${metaLine()}`,
    };
  }

  // ---- core state ---------------------------------------------------------------------------
  function activeMissionAgents() {
    let n = 0;
    let anyMission = false;
    for (const entry of state.runs.values()) {
      const missions = (entry.run.turn && entry.run.turn.missions) || {};
      for (const m of Object.values(missions)) {
        if (m.status === 'planning' || m.status === 'running') {
          anyMission = true;
          n += (m.agents || []).filter((a) => !['done', 'error', 'stopped', 'interrupted', 'queued'].includes(a.status)).length;
        }
      }
    }
    return { anyMission, n };
  }

  function computeCore() {
    if (state.listening) return ['listening', 'Listening…'];
    if (state.speaking) return ['speaking', 'Speaking…'];
    if (state.runs.size) {
      const { anyMission, n } = activeMissionAgents();
      if (anyMission) return ['working', n ? `Working · ${n} agent${n === 1 ? '' : 's'}` : 'Working…'];
      return ['thinking', 'Working…'];
    }
    if (!state.online) return ['offline', 'Offline'];
    if (Date.now() < state.errorUntil) return ['error', 'Check reply'];
    return ['idle', 'Online'];
  }

  const updateCore = raf(() => {
    const [coreState, text] = computeCore();
    header.setState(coreState, text);
    chat.setCoreState(coreState);
    root.dataset.core = coreState;
  });

  // ---- banners ------------------------------------------------------------------------------
  function banner(testid, tone, iconName, text, actions = []) {
    return h(
      'div',
      { class: ['banner', `banner--${tone}`], attrs: { 'data-testid': testid, role: tone === 'warn' || tone === 'err' ? 'alert' : 'status' } },
      h('span', { class: 'banner-icon' }, icon(iconName, { size: 18 })),
      h('span', { class: 'banner-text', text }),
      actions.length ? h('div', { class: 'banner-actions' }, actions) : null,
    );
  }
  function bannerBtn(label, fn, extra = {}) {
    return h('button', { class: ['banner-btn', extra.icon && 'banner-btn--icon'], type: 'button', attrs: { 'aria-label': extra.label || null }, on: { click: fn } }, extra.icon ? icon(extra.icon, { size: 16 }) : h('span', { text: label }));
  }

  const newChatHintDismissed = new Set(); // conversation ids whose "need a new chat" hint was dismissed
  function renderBanners() {
    const list = [];
    const s = getSettings();
    if (!state.online) {
      list.push(banner('banner-offline', 'warn', 'wifi-off', 'You’re offline. Jarvis will be ready when your connection returns.'));
    }
    if (!state.demo && s.onboarded && !safe(getApiKey, '')) {
      list.push(banner('banner-no-key', 'info', 'key', 'Add your Anthropic API key to start talking to Jarvis.', [bannerBtn('Add key', () => openSettings({ section: 'apikey', focus: 'apikey-input' }))]));
    }
    if (!state.demo && s.spendWarnUsd > 0) {
      const sp = safe(getSpend, { monthUsd: 0 });
      const dismissedKey = `${monthKey()}:${s.spendWarnUsd}`;
      if (sp.monthUsd >= s.spendWarnUsd && uiGet(UI_KEYS.spendDismissed) !== dismissedKey) {
        list.push(
          banner('banner-spend', 'warn', 'dollar', `This month’s estimated spend is ${usd(sp.monthUsd).replace(/^≈\s*/, '≈ ')}, above your $${s.spendWarnUsd} warning.`, [
            bannerBtn('Review', () => openSettings({ section: 'apikey' })),
            bannerBtn('', () => {
              uiSet(UI_KEYS.spendDismissed, dismissedKey);
              renderBanners();
            }, { icon: 'close', label: 'Dismiss spend warning' }),
          ]),
        );
      }
    }
    // A chat from before holograms (its tools are frozen without show_hologram) answers "show me…"
    // in words only: after such a request in it, say how to get one.
    const conv = state.conv;
    if (!state.demo && conv && !state.runs.has(conv.id) && !hasVisualTools(conv, 'show_hologram') && !newChatHintDismissed.has(conv.id)) {
      const asked = turnsOf(conv).filter((t) => t.role === 'user').pop();
      if (asked && /\b(show me|pull up|hologram|blueprint|diagram|3d|2d)\b/i.test(String(asked.text || ''))) {
        list.push(
          banner('banner-new-chat', 'info', 'hologram', 'Holograms and blueprints need a new chat (this one is from before them).', [
            bannerBtn('Start one', () => newChat()),
            bannerBtn('', () => {
              newChatHintDismissed.add(conv.id);
              renderBanners();
            }, { icon: 'close', label: 'Dismiss' }),
          ]),
        );
      }
    }
    banners.replaceChildren(...list);
    banners.hidden = list.length === 0;
  }

  // ---- composer state -------------------------------------------------------------------
  function currentRunning() {
    return !!(state.conv && state.runs.has(state.conv.id));
  }
  function updateComposer() {
    composer.setRunning(currentRunning());
    if (!state.online) composer.setBlocked({ code: 'offline', icon: 'wifi-off', message: 'You’re offline — reconnect to send' });
    else if (!state.demo && !safe(getApiKey, '')) composer.setBlocked({ code: 'nokey', icon: 'key', message: 'Add your API key in Settings to start', actionLabel: 'Add key' });
    else composer.setBlocked(null);
    const s = getSettings();
    const depth = (DEPTHS[s.depth] && DEPTHS[s.depth].label) || s.depth;
    composer.setMeta(`${depth} · ≤${s.maxAgents} agents`);
  }

  function updateAll() {
    renderBanners();
    updateComposer();
    updateCore();
    header.setNewChatVisible(!!(state.conv && state.conv.turns && state.conv.turns.length));
    renderPanelStats();
  }

  // ---- history ------------------------------------------------------------------------------
  let historyTimer = 0;
  async function refreshHistory() {
    clearTimeout(historyTimer);
    historyTimer = 0;
    try {
      const items = await store.list();
      history.setItems(items);
      const persistence = state.demo ? { persistent: true, reason: null } : safe(() => getPersistence(), { persistent: store.isPersistent(), reason: null });
      history.setPersistent(persistence.persistent, persistence.reason);
      history.setActive(state.conv ? state.conv.id : null);
    } catch (err) {
      console.error('[jarvis] listing conversations failed:', err);
    }
  }
  function scheduleHistoryRefresh() {
    if (historyTimer) return;
    historyTimer = setTimeout(refreshHistory, 600);
  }

  // ---- conversations ------------------------------------------------------------------------
  function rememberCurrent() {
    if (state.demo) return;
    uiSet(UI_KEYS.last, state.conv ? JSON.stringify({ id: state.conv.id, at: Date.now() }) : null);
  }

  function setConversation(conv, { remember = true } = {}) {
    clearFollowups();
    state.conv = conv || null;
    // A turn saved as running with no live run here was cut off (the app was closed or killed
    // mid-reply). Asking the engine settles it (status "interrupted", agents and missions too)
    // before anything renders, so no mission card shows a stale RUNNING next to "Resume".
    if (state.conv && !state.runs.has(state.conv.id) && !runningElsewhere(state.conv.id)) safe(() => engine.canResume(state.conv));
    chat.setConversation(state.conv);
    history.setActive(state.conv ? state.conv.id : null);
    selectLatestMission();
    if (remember) rememberCurrent();
    updateAll();
  }

  function newChat() {
    closePhoneSheets();
    clearFollowups();
    if (!state.conv || !state.conv.turns || !state.conv.turns.length) {
      if (state.layout === 'desktop') composer.focus();
      return;
    }
    setConversation(null);
    composer.setMode(getSettings().mode);
    if (state.layout === 'desktop') composer.focus();
  }

  async function openConversation(id) {
    if (state.conv && state.conv.id === id) {
      closePhoneSheets();
      return;
    }
    const entry = state.runs.get(id);
    let conv = entry ? entry.conv : null;
    if (!conv) {
      try {
        conv = await store.get(id);
      } catch (err) {
        console.error('[jarvis] loading conversation failed:', err);
      }
    }
    if (!conv) {
      toast('That conversation couldn’t be found.', { level: 'warn' });
      refreshHistory();
      return;
    }
    closePhoneSheets();
    setConversation(conv);
  }

  async function removeConversation(id) {
    const entry = state.runs.get(id);
    if (entry) {
      safe(() => entry.run.abort());
      await withTimeout(entry.run.done, 3000, null);
    }
    await store.remove(id);
    if (state.conv && state.conv.id === id) setConversation(null);
    await refreshHistory();
    toast('Conversation deleted.', { level: 'success' });
  }

  // ---- runs -----------------------------------------------------------------------------------
  /**
   * Start a turn. extras (SPEC §15.1, from the composer): { attachments: Attachment[], maxAgents? }.
   * A message may be attachments only (empty text). Returns true when the turn started.
   */
  function send(text, mode, extras) {
    const clean = String(text || '').trim();
    const attachments = extras && Array.isArray(extras.attachments) ? extras.attachments.filter((a) => a && typeof a === 'object') : [];
    if (!clean && !attachments.length) return false;
    if (!state.demo && !safe(getApiKey, '')) {
      toast('Add your API key first.', { level: 'info' });
      openSettings({ section: 'apikey', focus: 'apikey-input' });
      return false;
    }
    if (!state.online) {
      toast('You’re offline. Reconnect to send.', { level: 'warn' });
      return false;
    }
    if (currentRunning()) return false;
    if (state.conv && runningElsewhere(state.conv.id)) {
      toast('Jarvis is still working on this conversation in another window. Wait for it, or start a new chat.', { level: 'info', id: 'elsewhere' });
      return false;
    }
    stopSpeakingNow();
    let conv = state.conv;
    const fresh = !conv;
    if (!conv) conv = engine.newConversation();
    const input = { text: clean, mode: mode || composer.getMode() };
    if (attachments.length) input.attachments = attachments;
    const maxAgents = extras ? Number(extras.maxAgents) : NaN;
    if (Number.isFinite(maxAgents) && maxAgents >= 1) input.maxAgents = Math.min(20, Math.round(maxAgents));
    if (extras && extras.keepOnStop === true) input.keepOnStop = true; // Voice Mode: never withdrawn on Stop
    if (extras && extras.spoken === true) input.spoken = true; // Voice Mode: the reply is written for the ear
    if (extras && extras.blueprintFor) input.blueprintFor = extras.blueprintFor; // a 2D request from the hologram viewer
    if (extras && extras.optics) input.optics = extras.optics; // a Look: the one image is an Optics frame
    clearFollowups();
    let run;
    try {
      run = engine.startTurn(conv, input);
    } catch (err) {
      console.error('[jarvis] startTurn failed:', err);
      toast(err && err.message ? err.message : 'Jarvis couldn’t start that request.', { level: 'error' });
      return false;
    }
    // A conversation started by a protocol is titled by its headline ("Morning briefing — Thursday
    // 19 November"), not by the start of its brief (set before the turn's first save).
    const protocol = turnsOf(conv).filter((t) => t.role === 'user').length === 1 ? safe(() => parseProtocolPrompt(clean), null) : null;
    const headline = protocol && typeof protocol.headline === 'string' ? protocol.headline.replace(/\s+/g, ' ').trim() : '';
    if (headline) conv.title = headline.length > 60 ? `${headline.slice(0, 59).trimEnd()}…` : headline;
    attachRun(conv, run, { text: clean, attachments, maxAgents: input.maxAgents });
    if (!safe(() => isVoiceModeOpen(), false)) safe(() => sounds.cue('send')); // Voice Mode has its own cues
    if (fresh || state.conv !== conv) setConversation(conv);
    else chat.sync();
    chat.scrollToBottom(false);
    updateAll();
    scheduleHistoryRefresh();
    if (state.layout === 'phone') composer.blur();
    return true;
  }

  // ---- Voice Mode (SPEC §14.1) ----------------------------------------------------------------
  // send() reports problems with toasts or by opening Settings, both hidden behind the overlay,
  // so Voice Mode gets errors it can say out loud instead.
  let voiceApi = null; // the open Voice Mode: viewers opened from it route words and 2D requests through it
  let voiceInfo = null; // its listening state, mirrored on the mic button of a hologram viewer over it
  // The hologram last shown over this Voice Mode ({ segment, conversationId, turnId }): once its
  // viewer is closed, a command for it ("expand it", "show the separator") opens it again, free.
  let lastVoiceHologram = null;
  const REOPEN_ACTIONS = new Set(['explode', 'collapse', 'select', 'focus', 'isolate', 'labels-on', 'labels-off', 'view', 'parts-list', 'photos', 'show-all', 'zoom-in', 'zoom-out', 'rotate', 'blueprint']);

  function startTurnForVoice(text, { mode, blueprintFor, attachments, optics } = {}) {
    if (!state.demo && !safe(getApiKey, '')) throw new Error('Add your Anthropic API key first: exit voice mode, then open Settings → API key.');
    if (!state.online) throw new Error('You’re offline. Reconnect and try again.');
    if (currentRunning()) throw new Error('I’m still working on the previous request.');
    // keepOnStop: a spoken question that is interrupted stays in the conversation (nothing is put
    // back in the hidden message box), so what the owner says next keeps its context.
    // spoken: the reply is read aloud, so Jarvis writes it for the ear (details for the screen go below a --- line).
    // blueprintFor: "blueprint the <part>" from a hologram viewer over Voice Mode.
    const extras = { keepOnStop: true, spoken: true };
    if (blueprintFor) extras.blueprintFor = blueprintFor;
    // An Optics Look in Voice Mode ("what am I looking at?"): the frame goes with the words.
    if (Array.isArray(attachments) && attachments.length) extras.attachments = attachments;
    if (optics) extras.optics = optics;
    // A chat from before holograms (its tools are frozen without show_hologram) can't show one: Voice
    // Mode, whose headline is "show me this car", asks in a new chat instead (the old one stays in History).
    const oldChat = !state.demo && !!state.conv && turnsOf(state.conv).length > 0 && !hasVisualTools(state.conv, 'show_hologram') && !state.runs.has(state.conv.id);
    if (oldChat) setConversation(null);
    if (!send(text, mode, extras)) throw new Error('I couldn’t start that request.');
    if (oldChat && voiceApi) safe(() => voiceApi.note('New chat: older chats can’t show holograms.'));
    const entry = state.conv && state.runs.get(state.conv.id);
    const run = entry ? entry.run : null;
    // A hologram is open over Voice Mode: the reply is captioned there too.
    const viewer = run ? getHologramViewer() : null;
    if (viewer) safe(() => viewer.follow(run));
    return run;
  }

  /**
   * Voice Mode × holograms (SPEC §14.1, §16): a hologram of a Voice Mode reply opens over Voice
   * Mode as soon as it starts building, a blueprint once it is drawn; what is heard while one is
   * open goes to its local commands first; the viewer's mic button is Voice Mode's.
   */
  const voiceVisuals = {
    open: (run, seg) => openVisualForVoice(run, seg),
    // Optics over Voice Mode counts as a viewer: listening carries on, and what is heard goes to it first.
    isOpen: () => !!(getHologramViewer() || getBlueprintViewer() || isOpticsOpen()),
    command: (text, opts) => {
      const optics = currentOptics();
      // A hologram or blueprint opened from Optics is on top: its commands first.
      if (optics && !getHologramViewer() && !getBlueprintViewer()) return safe(() => optics.command(text), null) || { handled: false };
      const res = voiceCommand(text, opts);
      if (res && res.handled) return res;
      return (!optics && voiceLookRequest(text)) || res;
    },
    note: (text) => {
      const viewer = getHologramViewer();
      if (viewer) safe(() => viewer.note(text));
    },
    spoken: () => {
      const viewer = getHologramViewer();
      if (viewer) safe(() => viewer.captionSpoken());
    },
    sync: (info) => {
      voiceInfo = info && typeof info === 'object' ? info : null;
      const viewer = getHologramViewer();
      if (viewer) safe(() => viewer.setVoice(voiceInfo));
      const optics = currentOptics();
      if (optics && optics.overVoice) safe(() => optics.setVoice(voiceInfo));
    },
  };

  function openVisualForVoice(run, seg) {
    if (!run || !isVisualSegment(seg)) return null;
    const conv = run.conversation || state.conv;
    const source = { segment: seg, conversationId: conv ? conv.id : null, turnId: run.turn ? run.turn.id : null, run };
    if (seg.kind === 'blueprint') return openBlueprintSource(source);
    // A new hologram replaces what is shown, a blueprint on top included (it would cover the new one).
    const sheet = getBlueprintViewer();
    if (sheet) safe(() => sheet.close());
    let viewer = null;
    try {
      viewer = openHologramViewer({ source, deps: viewerDeps() });
    } catch (err) {
      console.error('[jarvis] hologram viewer failed:', err);
      return null;
    }
    safe(() => viewer.follow(run)); // the spoken reply is captioned in the viewer
    if (voiceInfo) safe(() => viewer.setVoice(voiceInfo));
    lastVoiceHologram = { segment: seg, conversationId: source.conversationId, turnId: source.turnId };
    return viewer;
  }

  /**
   * Voice Mode with no viewer open: words that are a command for the hologram it showed last
   * ("expand it", "show the separator") open that hologram again (free) for them; else null.
   */
  function reopenForVoice(text) {
    const last = lastVoiceHologram;
    const seg = last && last.segment;
    const spec = seg && seg.status !== 'building' && isObj(seg.spec) && Array.isArray(seg.spec.parts) ? seg.spec : null;
    if (!spec) return null;
    const parts = spec.parts.filter(isObj).map((p) => ({ id: p.id, name: p.name, aka: Array.isArray(p.aka) ? p.aka : [] }));
    const cmd = safe(() => matchHologramCommand(String(text || ''), parts, {}), null);
    if (!cmd || !REOPEN_ACTIONS.has(cmd.action)) return null;
    let viewer = null;
    try {
      viewer = openHologramViewer({ source: { segment: seg, conversationId: last.conversationId, turnId: last.turnId }, deps: viewerDeps() });
    } catch (err) {
      console.error('[jarvis] hologram viewer failed:', err);
      return null;
    }
    if (voiceInfo) safe(() => viewer.setVoice(voiceInfo));
    return viewer;
  }

  /**
   * Words heard in Voice Mode while a viewer is open: a hologram command acts at once ({ handled:
   * true, command, done? }), anything else is for Jarvis ({ handled: false }). With a blueprint on
   * top, "close", "close the blueprint", "hide the drawing", "back to the hologram" or "go back"
   * close it (free; never read as a part, never a paid message), and another hologram command acts
   * on the hologram under it, shown again.
   *   opts.signal  Stop while a 2D request still looks in the library: nothing is started
   *   opts.spoken  Voice Mode says the acknowledgement (no toast); opts.later: the hologram is
   *                still building, so a 2D request waits ({ handled: false, later: true })
   */
  function voiceCommand(text, { signal = null, spoken = true, later = false } = {}) {
    let holo = getHologramViewer();
    const sheet = getBlueprintViewer();
    if (!holo && !sheet) holo = reopenForVoice(text); // the viewer was closed: "expand it" opens it again
    if (sheet) {
      const words = String(text || '');
      const cmd = safe(() => matchHologramCommand(words, [], {}), null);
      const back = /^(?:go )?back$/.test(safe(() => normalizeCommandText(words), ''));
      if ((cmd && (cmd.action === 'close' || cmd.action === 'close-blueprint')) || back) {
        safe(() => sheet.close());
        return { handled: true, command: cmd && cmd.action === 'close' ? cmd : { action: 'close-blueprint' } };
      }
    }
    if (!holo) return { handled: false };
    const res = safe(() => holo.command(text, { source: 'voice', signal, spoken, later, confirmBuild: true }), null);
    if (!res || !res.handled) return res && res.later ? { handled: false, later: true } : { handled: false };
    if (sheet && res.command && res.command.action !== 'blueprint' && res.command.action !== 'close') safe(() => sheet.close());
    return res;
  }

  /** Open Voice Mode. Call synchronously inside a click/keydown (iOS mic and speech rules). */
  function openVoice() {
    refreshCameraPermission();
    stopSpeakingNow();
    if (state.listening) safe(() => state.listening.stop());
    const entry = state.conv && state.runs.get(state.conv.id);
    try {
      voiceApi = openVoiceMode({
        getSettings,
        saveSettings,
        startTurn: startTurnForVoice,
        createCore,
        stt,
        tts,
        markdownToPlainText,
        sounds,
        // Its own owner: closing Voice Mode must not let the screen sleep while a run continues.
        wakeLock: { keepAwake: () => keepAwake('voice'), allowSleep: () => allowSleep('voice') },
        activeRun: entry ? entry.run : null,
        // Optics: Look in the dock opens the camera over Voice Mode.
        look: { supported: () => !state.demo && safe(() => cameraSupported(), false), open: () => openOpticsScreen({ voice: true }) },
        mode: () => composer.getMode(),
        visuals: voiceVisuals,
        onClose: () => {
          voiceApi = null;
          voiceInfo = null;
          lastVoiceHologram = null;
          // Optics opened from Voice Mode goes with it (its mic and its turns were Voice Mode's).
          const optics = currentOptics();
          if (optics && optics.overVoice) safe(() => optics.close());
          const viewer = getHologramViewer();
          if (viewer) safe(() => viewer.setVoice(null)); // its own mic again
          // The home screen (greeting and core) stays where it was; a conversation shows its end.
          if (!chat.isEmpty()) chat.scrollToBottom(false);
          updateAll();
        },
      });
    } catch (err) {
      console.error('[jarvis] voice mode failed:', err);
      toast('Voice mode couldn’t start in this browser.', { level: 'warn' });
    }
  }

  // ---- Optics (the camera) ----------------------------------------------------------------------
  // A Look is a normal turn of the current conversation (quick mode) whose one image is the frame;
  // follow-up questions reuse it. Watch frames are one-off requests outside any conversation.

  /** Dev and test overrides for Watch timing ('jarvis.dev.optics' JSON), clamped to safe ranges. */
  function devOpticsOptions() {
    try {
      const raw = JSON.parse(localStorage.getItem('jarvis.dev.optics') || 'null');
      if (!raw || typeof raw !== 'object') return {};
      const out = {};
      const num = (k, lo, hi) => {
        const v = Number(raw[k]);
        if (Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v));
      };
      num('minIntervalMs', 1000, 600000);
      num('sessionMs', 5000, 5 * 60 * 1000);
      num('sampleMs', 100, 5000);
      num('settleMs', 0, 10000);
      num('maxLooksPerDay', 1, 60);
      if (typeof raw.model === 'string' && MODELS[raw.model]) out.model = raw.model;
      return out;
    } catch {
      return {};
    }
  }

  function opticsProblem() {
    if (!state.demo && !safe(getApiKey, '')) return 'Add your Anthropic API key first: close Optics, then open Settings → API key.';
    if (!state.online) return 'You’re offline. Reconnect and try again.';
    if (currentRunning()) return 'Jarvis is still answering. Try again in a moment.';
    if (state.conv && runningElsewhere(state.conv.id)) return 'Jarvis is busy with this conversation in another window.';
    return '';
  }

  /** A Look's frame as a photo attachment (startTurn checks it), and its Optics record. */
  function opticsAttachment(frame) {
    const at = frame.capturedAt || Date.now();
    const clock = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const attachment = {
      id: `optics_${at.toString(36)}`,
      kind: 'image',
      name: `Optics ${clock}`,
      mediaType: 'image/jpeg',
      size: base64ByteLength(frame.data),
      data: frame.data,
      thumb: frame.preview || null,
      width: frame.width,
      height: frame.height,
    };
    return { attachment, optics: { source: frame.source, capturedAt: at } };
  }

  function lookFromOptics({ text, frame }) {
    const problem = opticsProblem();
    if (problem) return { error: problem };
    const { attachment, optics } = opticsAttachment(frame);
    if (!send(text, 'quick', { attachments: [attachment], optics })) return { error: 'That look couldn’t be sent.' };
    const entry = state.conv && state.runs.get(state.conv.id);
    if (!entry) return { error: 'That look couldn’t be sent.' };
    const user = state.conv.turns[state.conv.turns.length - 2];
    return { run: entry.run, frameId: user && user.optics ? user.optics.frameId : null };
  }

  function askFromOptics({ text }) {
    const problem = opticsProblem();
    if (problem) return { error: problem };
    if (!send(text, 'quick')) return { error: 'That question couldn’t be sent.' };
    const entry = state.conv && state.runs.get(state.conv.id);
    return entry ? { run: entry.run } : { error: 'That question couldn’t be sent.' };
  }

  function watchFromOptics(frame, { goal, previous, signal, model } = {}) {
    if (!state.online) return Promise.resolve({ ok: false, error: 'offline' });
    return runWatchLook({
      apiKey: safe(getApiKey, ''),
      apiBase: safe(getDevApiBase, ''),
      model: model || getSettings().leadModel,
      frame,
      goal,
      previous,
      signal,
      onSpend: (usd) => safe(() => addSpend(usd)),
    });
  }

  /** About what the next Look costs: the conversation's prompt is cached for 5 minutes after use. */
  function lookEstimate() {
    const conv = state.conv;
    const warm = !!(conv && conv.apiMessages && conv.apiMessages.length && Date.now() - (conv.updatedAt || 0) < 4.5 * 60 * 1000);
    return estimateLookCost({ model: getSettings().leadModel, prefixCached: warm }).usd;
  }

  // ---- Optics over Voice Mode: a Look, a question or a hologram is a Voice Mode turn (spoken) ----
  function voiceTurnResult(res) {
    if (!res || res.error) return { error: (res && res.error) || 'That couldn’t be sent.' };
    if (res.held) return { error: 'I’ll take that once the details are on screen.' };
    const run = res.run || (state.conv && state.runs.get(state.conv.id) ? state.runs.get(state.conv.id).run : null);
    return run ? { run } : { error: 'That couldn’t be sent.' };
  }

  function lookViaVoice({ text, frame }) {
    if (!voiceApi) return lookFromOptics({ text, frame });
    const problem = opticsProblem();
    if (problem) return { error: problem };
    const { attachment, optics } = opticsAttachment(frame);
    const out = voiceTurnResult(safe(() => voiceApi.ask(text || 'What am I looking at?', { mode: 'quick', attachments: [attachment], optics }), null));
    if (out.error) return out;
    const user = state.conv ? state.conv.turns[state.conv.turns.length - 2] : null;
    return { run: out.run, frameId: user && user.optics ? user.optics.frameId : null };
  }

  function askViaVoice({ text }) {
    if (!voiceApi) return askFromOptics({ text });
    const problem = opticsProblem();
    if (problem) return { error: problem };
    return voiceTurnResult(safe(() => voiceApi.ask(text, { mode: 'quick' }), null));
  }

  // The camera permission, read without asking (Voice Mode may open the camera by voice only once
  // the owner has allowed it, and never on iPhone, where it needs a tap).
  let cameraAllowed = 'unknown';
  function refreshCameraPermission() {
    cameraPermission()
      .then((p) => (cameraAllowed = p))
      .catch(() => {});
  }

  /**
   * "What am I looking at?" in Voice Mode with the camera closed: on a computer where the camera is
   * allowed, Optics opens over Voice Mode and looks at once; otherwise Jarvis asks for a tap on Look.
   */
  function voiceLookRequest(text) {
    if (state.demo || !voiceApi || !safe(() => cameraSupported(), false)) return null;
    // Only words plainly about seeing: "what's that?" or "what is it?" in a conversation is about
    // something Jarvis said, and goes to Jarvis as usual. So does "what is this?" while a hologram or
    // blueprint is on screen: it is about that.
    const viewerOpen = !!(getHologramViewer() || getBlueprintViewer());
    const kind = safe(() => voiceCameraRequest(text, { viewerOpen, cameraAllowed, ios: isIOS() }), null);
    if (!kind) return null;
    if (kind === 'need-tap') return { handled: true, command: { action: 'optics', kind: 'need-tap', ack: 'Tap Look, and show me.' } };
    const optics = openOpticsScreen({ voice: true, autoLook: String(text).trim() });
    const done = optics && optics.autoLookDone ? optics.autoLookDone : Promise.resolve({ error: 'The camera couldn’t start.' });
    return { handled: true, command: { action: 'optics', kind: 'look', ack: '' }, done };
  }

  function opticsDeps(extra = {}) {
    return {
      getSettings,
      lookEstimate,
      look: lookFromOptics,
      ask: askFromOptics,
      // The camera the owner chose last on this device (deviceId and label; Settings are local).
      cameraChoice: {
        get: () => {
          const st = getSettings();
          return st.opticsCameraId || st.opticsCameraLabel ? { id: st.opticsCameraId, label: st.opticsCameraLabel } : null;
        },
        set: ({ id, label } = {}) => safe(() => saveSettings({ opticsCameraId: String(id || '').slice(0, 256), opticsCameraLabel: String(label || '').slice(0, 120) })),
      },
      // Hologram of this: a normal turn of this conversation (it holds the frame), once it can show holograms.
      canHologram: () => !!(state.demo || !state.conv || hasVisualTools(state.conv, 'show_hologram')),
      hologram: ({ text }) => askFromOptics({ text }),
      hologramEstimate: () => estimateHologramCost({ model: getSettings().leadModel }).usd,
      openHologram: (run, seg) => (run && run.turn ? openVisualSegment(run.turn, seg) : null),
      watchLook: watchFromOptics,
      stt,
      sttSupported: sttOk,
      sounds,
      wakeLock: { keepAwake: () => keepAwake('optics'), allowSleep: () => allowSleep('optics') },
      // The system camera (a photo attachment) when the live camera is blocked or missing.
      fallbackPhoto: state.layout === 'phone' ? () => composer.openCamera() : null,
      watchOptions: devOpticsOptions(),
      onClose: ({ cameraOff } = {}) => {
        if (cameraOff) toast('Camera off.', { level: 'info', id: 'optics-off' });
        if (!chat.isEmpty()) chat.scrollToBottom(false);
        updateAll();
      },
      ...extra,
    };
  }

  /**
   * Opens Optics (call from a tap: iOS asks for the camera only inside a user gesture).
   * voice: over Voice Mode (its turns are spoken; Voice Mode opens a hologram itself); autoLook: the
   * words of a Look to take as soon as the camera is live ("what am I looking at?" said in Voice Mode).
   * Returns the Optics api (truthy), or false.
   */
  function openOpticsScreen({ start, voice = false, autoLook = '' } = {}) {
    if (isOpticsOpen()) return currentOptics() || true;
    if (!voice) stopSpeakingNow();
    if (state.listening) safe(() => state.listening.stop());
    const extra = {};
    if (start === 'screen') extra.start = start;
    if (autoLook) extra.autoLook = autoLook;
    if (voice && voiceApi) {
      Object.assign(extra, {
        voice: { tap: () => safe(() => voiceApi && voiceApi.tap()) },
        look: lookViaVoice,
        ask: askViaVoice,
        hologram: askViaVoice,
        openHologram: () => null, // a Voice Mode reply's hologram is opened by Voice Mode (visuals.open)
        onClose: ({ cameraOff } = {}) => {
          if (cameraOff) toast('Camera off.', { level: 'info', id: 'optics-off' });
          updateAll();
        },
      });
    }
    try {
      const api = openOptics(opticsDeps(extra));
      if (voice && voiceInfo && api && api.setVoice) safe(() => api.setVoice(voiceInfo));
      return api || true;
    } catch (err) {
      console.error('[jarvis] optics failed:', err);
      toast('The camera couldn’t start in this browser.', { level: 'warn' });
      return false;
    }
  }

  /** Reopens a past Look (from the chat) frozen, with the labels pinned on it. */
  function reviewOptics(turn, seg) {
    const conv = state.conv;
    if (!conv || isOpticsOpen()) return;
    const turns = conv.turns || [];
    const frameId = seg && seg.frameId ? seg.frameId : turn && turn.optics ? turn.optics.frameId : null;
    const userTurn = turns.find((t) => t && t.role === 'user' && t.optics && t.optics.frameId === frameId) || (turn && turn.role === 'user' ? turn : null);
    if (!userTurn || !userTurn.optics) return;
    const meta = (userTurn.attachments || [])[0] || {};
    const idx = turns.indexOf(userTurn);
    // The labels: the given segment, else the newest pins on this frame in the turns that follow.
    let pins = seg && Array.isArray(seg.labels) ? seg.labels : null;
    let answerText = '';
    for (let i = idx + 1; i < turns.length; i++) {
      const t = turns[i];
      if (!t || t.role !== 'jarvis') continue;
      for (const s of t.segments || []) {
        if (s && s.kind === 'pins' && s.status === 'done' && s.frameId === frameId && !seg) pins = s.labels;
        if (i === idx + 1 && s && s.kind === 'text') answerText += `${answerText ? '\n\n' : ''}${s.text || ''}`;
      }
    }
    openOptics(opticsDeps({
      review: {
        preview: meta.thumb,
        width: userTurn.optics.width,
        height: userTurn.optics.height,
        source: userTurn.optics.source,
        frameId,
        question: userTurn.text || 'What am I looking at?',
        answer: answerText,
        pins: pins || [],
      },
    }));
  }

  // ---- holograms, blueprints and the saved library ------------------------------------------
  // Viewers are full-screen overlays above the app (src/ui/overlay.js). Words typed or spoken in
  // the hologram viewer that are not a local command go to Jarvis as a message in the hologram's
  // conversation; a 2D request opens a saved blueprint, or starts the paid build as a new turn.

  /** Why a message from a viewer can't be sent right now (shown in the viewer), or ''. */
  function viewerSendProblem(conv) {
    if (!state.demo && !safe(getApiKey, '')) return 'Add your Anthropic API key first: close this view, then open Settings → API key.';
    if (!state.online) return 'You’re offline. Reconnect and try again.';
    if (conv && state.runs.has(conv.id)) return 'Jarvis is still working on the current reply. Try again when it finishes.';
    if (conv && runningElsewhere(conv.id)) return 'Jarvis is busy with this conversation in another window.';
    return '';
  }

  /** The conversation a viewer belongs to, shown behind the overlay (a new one if it was deleted). */
  async function viewerConversation(conversationId) {
    if (state.conv && (!conversationId || state.conv.id === conversationId)) return state.conv;
    if (conversationId) {
      const entry = state.runs.get(conversationId);
      let conv = entry ? entry.conv : null;
      if (!conv) conv = await Promise.resolve(store.get(conversationId)).catch(() => null);
      if (conv) {
        if (state.conv !== conv) setConversation(conv);
        return conv;
      }
    }
    if (state.conv) setConversation(null);
    return null;
  }

  /**
   * Send words from a viewer as a chat message. Returns { run } or { error }. `signal`: Voice Mode's
   * Stop for a 2D request; once it is aborted nothing is sent ({ error, stopped: true }).
   */
  async function sendFromViewer(text, { conversationId, mode = 'auto', blueprintFor = null, signal = null } = {}) {
    const clean = String(text || '').trim();
    if (!clean) return { error: 'Nothing to send.' };
    let conv = await viewerConversation(conversationId);
    if (signal && signal.aborted) return { error: 'Stopped.', stopped: true };
    // A conversation from before holograms can't take a 2D request: ask in a new one.
    if (blueprintFor && conv && !hasVisualTools(conv, 'draw_blueprint')) {
      setConversation(null);
      conv = null;
    }
    // Voice Mode is open under the viewer: the words (or the 2D request) become a Voice Mode turn,
    // so the reply is spoken and captioned, and Voice Mode listens again afterwards.
    if (voiceApi && safe(() => isVoiceModeOpen(), false)) {
      const res = safe(() => voiceApi.ask(clean, { mode: blueprintFor ? mode : undefined, blueprintFor, signal }), null);
      if (res && res.run) viewerStartedTurn = true;
      return res && typeof res === 'object' ? res : { error: 'That message couldn’t be sent.' };
    }
    const problem = viewerSendProblem(conv);
    if (problem) return { error: problem };
    const extras = blueprintFor ? { blueprintFor } : undefined;
    if (!send(clean, mode, extras)) return { error: 'That message couldn’t be sent.' };
    const entry = state.conv && state.runs.get(state.conv.id);
    if (entry) viewerStartedTurn = true;
    return entry ? { run: entry.run } : { error: 'That message couldn’t be sent.' };
  }

  // A turn started from a viewer: when the last viewer closes, the chat shows its end (the reply).
  let viewerStartedTurn = false;
  function onViewerClosed() {
    updateAll();
    if (viewerStartedTurn && !isOverlayOpen()) {
      viewerStartedTurn = false;
      if (!chat.isEmpty()) chat.scrollToBottom(false);
    }
  }

  /**
   * The owner asked for a 2D blueprint: open the saved one (free), or build it (a new turn).
   * `ask` (Voice Mode, a softer wording): when nothing is saved, build nothing and return
   * { ask: true, cost } so the owner is asked first. `signal` (Voice Mode's Stop): checked after
   * each library lookup; once aborted nothing opens and nothing is sent ({ error, stopped: true }).
   */
  async function requestBlueprint({ model, part = null, rebuild = false, conversationId, signal = null, ask = false } = {}) {
    const stopped = () => !!(signal && signal.aborted);
    if (!rebuild) {
      const saved = await Promise.resolve(lib.findPartBlueprint(model, part)).catch(() => null);
      const full = saved && saved.id ? await Promise.resolve(lib.get(saved.id)).catch(() => null) : null;
      if (stopped()) return { error: 'Stopped.', stopped: true };
      if (full) {
        openLibraryItem(full);
        return { opened: true };
      }
    }
    const hologram = await Promise.resolve(lib.get(model)).catch(() => null);
    if (stopped()) return { error: 'Stopped.', stopped: true };
    if (!hologram || hologram.kind !== 'hologram') return { error: 'That hologram is no longer in your library.' };
    const target = conversationId || hologram.conversationId;
    if (ask) return { ask: true, cost: blueprintCost(target) };
    const text = blueprintRequestText(hologram.spec, part);
    return sendFromViewer(text, { conversationId: target, mode: 'quick', blueprintFor: { model, part: part || null }, signal });
  }

  /** When the conversation's last lead request ended (its cached prefix lives 5 minutes), or 0. */
  function lastRequestAt(conversationId) {
    const entry = conversationId ? state.runs.get(conversationId) : null;
    if (entry) return Date.now(); // a reply is under way: the cache is warm
    const conv = state.conv && (!conversationId || state.conv.id === conversationId) ? state.conv : null;
    if (!conv || !hasVisualTools(conv, 'draw_blueprint')) return 0; // unknown, or a new conversation would be used
    const last = turnsOf(conv).filter((t) => t.role === 'jarvis').pop();
    return last ? Number(last.endedAt) || Number(last.createdAt) || 0 : 0;
  }

  /**
   * "≈ $0.15": a blueprint is about 6K output tokens (with thinking) on the lead model, plus the
   * conversation so far (about 45K tokens: tools, the hologram's spec). That prefix is a cheap cache
   * read only while the cache is warm (5 minutes after the last request); later it is written again,
   * which on Opus 5.5 makes it about $0.35.
   */
  function blueprintCost(conversationId) {
    const last = lastRequestAt(conversationId);
    const warm = last > 0 && Date.now() - last < 4.5 * 60 * 1000;
    return costLabel(blueprintCostUsd(getSettings().leadModel, { warm }));
  }

  /** "Stop building" in a hologram viewer: Voice Mode's Stop when it runs the turn, else the chat's. */
  function stopBuild({ conversationId } = {}) {
    if (voiceApi && safe(() => isVoiceModeOpen(), false) && safe(() => voiceApi.stop(), false)) return;
    const entry = conversationId ? state.runs.get(conversationId) : state.conv && state.runs.get(state.conv.id);
    if (entry) safe(() => entry.run.abort());
  }

  function viewerDeps() {
    return {
      library: lib,
      stt,
      getSettings,
      blueprintCost: (conversationId) => blueprintCost(conversationId),
      requestBlueprint: (req) => requestBlueprint(req),
      sendMessage: (text, opts) => sendFromViewer(text, opts),
      openBlueprint: (source) => openBlueprintSource(source),
      // Voice Mode covers the chat: "Open in chat" leaves it (as Exit does: a running reply carries
      // on in the chat), so the reply, details below its --- line included, is what shows.
      openInChat: ({ conversationId, turnId } = {}) => {
        if (voiceApi && safe(() => isVoiceModeOpen(), false)) safe(() => voiceApi.close());
        showInChat(conversationId, turnId);
      },
      stopBuild: (opts) => stopBuild(opts),
      // Voice Mode open under the viewer: the mic button is its talk button (while a hologram it
      // builds is shown, a tap listens for a command instead of stopping him: Voice Mode decides).
      voice: { active: () => !!voiceApi && safe(() => isVoiceModeOpen(), false), tap: () => voiceApi && voiceApi.viewerTap() },
      onClose: () => onViewerClosed(),
    };
  }

  function showInChat(conversationId, turnId) {
    viewerStartedTurn = false;
    if (conversationId && (!state.conv || state.conv.id !== conversationId)) openConversation(conversationId);
    if (librarySheet) librarySheet.close('navigate');
    closePhoneSheets();
    requestAnimationFrame(() => {
      const el = turnId ? document.querySelector(`[data-testid="turn-jarvis"][data-turn-id="${turnId}"]`) : null;
      if (el) el.scrollIntoView({ block: 'start' });
      else chat.scrollToBottom(false);
    });
  }

  function openBlueprintSource(source) {
    try {
      return openBlueprintViewer({ source, deps: { library: lib, onClose: () => onViewerClosed() } });
    } catch (err) {
      console.error('[jarvis] blueprint viewer failed:', err);
      toast('The blueprint viewer couldn’t open.', { level: 'error' });
      return null;
    }
  }

  /** A card's Open: the viewer for that segment (following the live build while it streams). */
  function openVisualSegment(turn, seg) {
    if (!turn || !isVisualSegment(seg)) return;
    const conv = state.conv;
    const entry = conv && state.runs.get(conv.id);
    const run = entry && entry.run && entry.run.turn === turn ? entry.run : null;
    const source = { segment: seg, conversationId: conv ? conv.id : null, turnId: turn.id, run };
    if (seg.kind === 'blueprint') {
      openBlueprintSource(source);
      return;
    }
    try {
      openHologramViewer({ source, deps: viewerDeps() });
    } catch (err) {
      console.error('[jarvis] hologram viewer failed:', err);
      toast('The hologram viewer couldn’t open.', { level: 'error' });
    }
  }

  /** Open a saved item (with its spec) from the library or a part card. */
  function openLibraryItem(item) {
    if (!item || !item.spec) return;
    if (item.kind === 'blueprint') {
      openBlueprintSource({ item });
      return;
    }
    try {
      openHologramViewer({ source: { item }, deps: viewerDeps() });
    } catch (err) {
      console.error('[jarvis] hologram viewer failed:', err);
      toast('The hologram viewer couldn’t open.', { level: 'error' });
    }
  }

  let librarySheet = null;
  /** The Blueprints library sheet (header button, History). Viewers open above it. */
  function openLibrary() {
    if (librarySheet) return;
    closePhoneSheets();
    let view;
    try {
      view = createLibraryView({ lib, thumbs, onOpen: (item) => openLibraryItem(item), toast });
    } catch (err) {
      console.error('[jarvis] library failed:', err);
      toast('The library couldn’t open.', { level: 'error' });
      return;
    }
    const sheet = createSheet({
      kind: 'full',
      title: 'Blueprints',
      testid: 'library-sheet',
      className: 'sheet--library',
      onClose: () => {
        safe(() => view.destroy());
        if (librarySheet === sheet) librarySheet = null;
      },
    });
    sheet.body.appendChild(view.el);
    librarySheet = sheet;
    sheet.open();
  }

  /** History shows how many items the library holds. */
  let libraryCountTimer = 0;
  function refreshLibraryCount() {
    clearTimeout(libraryCountTimer);
    libraryCountTimer = setTimeout(() => {
      Promise.resolve(lib.list({ limit: 500 }))
        .then((rows) => safe(() => history.setLibraryCount(Array.isArray(rows) ? rows.length : 0)))
        .catch(() => {});
    }, 200);
  }
  safe(() => lib.onChange(() => refreshLibraryCount()));
  refreshLibraryCount();

  // ---- follow-up suggestions (SPEC §14.5) ----------------------------------------------------
  // Chips under the latest finished reply; a new send, another conversation or New chat
  // removes them (and aborts a pending suggestion request).
  let followup = null; // { controller, chips }
  function clearFollowups() {
    if (!followup) return;
    const { controller, chips } = followup;
    followup = null;
    safe(() => controller.abort());
    chips.el.remove();
  }

  function offerFollowups(conv, turn) {
    const s = getSettings();
    const key = state.demo ? '' : safe(getApiKey, '');
    if (s.followups === false || !turn) return;
    if (!state.demo && (!state.online || !key)) return;
    const answer = (answerText(turn) || turnText(turn, false)).trim();
    if (!answer) return;
    const turns = (conv && conv.turns) || [];
    const user = turns.slice(0, Math.max(0, turns.indexOf(turn))).reverse().find((t) => isObj(t) && t.role === 'user');
    const parsed = user ? safe(() => parseProtocolPrompt(user.text), null) : null;
    const question = user ? (parsed ? parsed.headline : user.text || '') : '';
    clearFollowups();
    const controller = new AbortController();
    const chips = createFollowupChips({
      onPick: (q) => {
        clearFollowups();
        if (!send(q, composer.getMode())) composer.setText(q);
      },
    });
    if (!chat.showFollowups(turn.id, chips.el)) return;
    const current = { controller, chips };
    followup = current;
    chips.setLoading(true);
    const request = state.demo
      ? demo.suggestFollowups(turn, { signal: controller.signal })
      : suggestFollowups({ apiKey: key, apiBase: safe(getDevApiBase, ''), question, answer, signal: controller.signal, onSpend: (usd) => safe(() => addSpend(usd)) });
    Promise.resolve(request)
      .catch(() => [])
      .then((qs) => {
        if (followup === current) chips.set(qs);
      });
  }

  // ---- other windows -------------------------------------------------------------------------
  // Two windows (a tab and the installed app) share storage. Each tells the others which
  // conversations it is running, so a conversation running elsewhere is never resumed or
  // continued here (that would run the swarm twice), shows "Running in another window"
  // instead, and reloads from storage when that run ends.
  //
  // The guard comes down only after the stored conversation has been read again: when the other
  // window says its run ended, when that window closes (pagehide), or when it has been silent for
  // REMOTE_RUN_TTL_MS (crashed or frozen; its saves count as signs of life). A message or Resume
  // here then always starts from what that window saved - never from this window's stale copy,
  // whose saves would be refused and the paid reply lost.
  const windowId = Math.random().toString(36).slice(2);
  const remoteRuns = new Map(); // conversation id -> { timer, ending, seenSave } while another window runs it
  const REMOTE_RUN_TTL_MS = 30000; // a window silent this long (no message, no save) stops counting
  let runChannel = null;
  try {
    runChannel = !state.demo && typeof BroadcastChannel === 'function' ? new BroadcastChannel('jarvis-runs') : null;
  } catch {
    runChannel = null;
  }
  function broadcastRun(id, running) {
    try {
      if (runChannel && id) runChannel.postMessage({ type: 'run', id, running, from: windowId });
    } catch {
      /* closed channel */
    }
  }
  function runningElsewhere(id) {
    return !!(id && remoteRuns.has(id));
  }
  /** Another window runs `id` (it said so, or it saved it): keep the guard up for another TTL. */
  function markRemoteRun(id) {
    const prev = remoteRuns.get(id);
    if (prev) clearTimeout(prev.timer);
    const entry = { timer: 0, ending: false, seenSave: !!(prev && !prev.ending && prev.seenSave) };
    entry.timer = setTimeout(() => releaseRemoteRun(id, entry), REMOTE_RUN_TTL_MS);
    remoteRuns.set(id, entry);
    return entry;
  }
  /**
   * That window's run ended, or the window went away: read what it saved, then lift the guard and
   * show that copy (a turn it never finished settles as interrupted, with Resume).
   */
  function releaseRemoteRun(id, entry) {
    if (!entry || remoteRuns.get(id) !== entry || entry.ending) return;
    entry.ending = true;
    clearTimeout(entry.timer);
    const showing = () => !!(state.conv && state.conv.id === id && !state.runs.has(id));
    Promise.resolve(showing() ? store.get(id) : null)
      .catch((err) => {
        console.error('[jarvis] reloading the conversation failed:', err);
        return null;
      })
      .then((fresh) => {
        if (remoteRuns.get(id) !== entry) return; // that window spoke up again meanwhile
        remoteRuns.delete(id);
        if (showing()) setConversation(fresh || state.conv, { remember: false });
        scheduleHistoryRefresh();
      });
  }
  function reloadCurrentFromStore() {
    const id = state.conv && state.conv.id;
    if (!id || state.runs.has(id)) return;
    Promise.resolve(store.get(id))
      .then((fresh) => {
        if (fresh && state.conv && state.conv.id === id && !state.runs.has(id)) setConversation(fresh, { remember: false });
      })
      .catch((err) => console.error('[jarvis] reloading the conversation failed:', err));
  }
  if (runChannel) {
    runChannel.onmessage = (e) => {
      const m = e && e.data;
      if (!m || m.from === windowId) return;
      if (m.type === 'hello') {
        for (const id of state.runs.keys()) broadcastRun(id, true);
        return;
      }
      if (m.type !== 'run' || typeof m.id !== 'string') return;
      if (!m.running) {
        releaseRemoteRun(m.id, remoteRuns.get(m.id));
        return;
      }
      const prev = remoteRuns.get(m.id);
      markRemoteRun(m.id);
      // The open conversation started running elsewhere: show the stored state (and again on that
      // window's first save, which carries the new turn - see onRemoteSave).
      if ((!prev || prev.ending) && state.conv && state.conv.id === m.id) {
        reloadCurrentFromStore();
        scheduleHistoryRefresh();
      }
    };
    runChannel.postMessage({ type: 'hello', from: windowId });
    setInterval(() => {
      for (const id of state.runs.keys()) broadcastRun(id, true);
    }, 10000);
    // Closing this window (or freezing it in the back-forward cache) ends its runs: say so now, so
    // the others offer Resume at once instead of waiting for the guard to time out.
    window.addEventListener('pagehide', () => {
      for (const id of state.runs.keys()) broadcastRun(id, false);
    });
    window.addEventListener('pageshow', (e) => {
      if (e && e.persisted) for (const id of state.runs.keys()) broadcastRun(id, true);
    });
  }

  // Storage-level guard (db.js keeps a revision per conversation): another window saved this
  // conversation more recently, so our stale copy was not written. Show the stored version
  // instead of silently keeping changes that only live in this window's memory.
  const conflictedRecently = new Set(); // conversations whose run was just stopped by a conflict
  if (!state.demo) {
    safe(() =>
      onConversationConflict(({ id } = {}) => {
        if (!id) return;
        const entry = state.runs.get(id);
        if (entry) {
          // Nothing this run does can be saved any more: stop it now rather than pay for a reply
          // that would be thrown away (onRunDone shows the stored copy and gives the message back).
          if (!entry.conflict) {
            entry.conflict = true;
            safe(() => entry.run.abort());
          }
          return;
        }
        if (conflictedRecently.has(id) || !state.conv || state.conv.id !== id) return;
        reloadCurrentFromStore();
        toast('This conversation was changed in another window — showing the latest.', { level: 'info', id: 'conflict' });
      }),
    );
    // Keep an idle open conversation in step with saves made in other windows.
    safe(() =>
      onRemoteSave(({ id } = {}) => {
        const remote = id ? remoteRuns.get(id) : null;
        if (remote && !remote.ending) {
          // That window is still running it: each save is a sign of life (a background tab's timers
          // may be throttled), and its first save carries the new turn to show here. Otherwise wait
          // for its run-end message (one reload, not one per save).
          markRemoteRun(id).seenSave = true;
          if (!remote.seenSave && state.conv && state.conv.id === id) reloadCurrentFromStore();
        } else if (id && state.conv && state.conv.id === id && !state.runs.has(id)) reloadCurrentFromStore();
        scheduleHistoryRefresh();
      }),
    );
  }

  /**
   * A run stopped because another window had saved its conversation first (see the conflict
   * handler): show the stored copy, and give the message back if it never reached storage.
   */
  function settleConflictedRun(entry, turn, sent) {
    const id = entry.conv.id;
    conflictedRecently.add(id); // its last saves are refused too: no second notice for those
    setTimeout(() => conflictedRecently.delete(id), 5000);
    const turns = turnsOf(entry.conv);
    const at = turn ? turns.indexOf(turn) : -1;
    const asked = at > 0 && turns[at - 1].role === 'user' ? turns[at - 1] : null;
    Promise.resolve(store.get(id))
      .catch(() => null)
      .then((fresh) => {
        const kept = !!(fresh && asked && turnsOf(fresh).some((t) => t.id === asked.id));
        const showing = !!(state.conv && state.conv.id === id && !state.runs.has(id));
        if (showing && fresh) setConversation(fresh, { remember: false });
        if (showing && !kept && sent && (sent.text || (sent.attachments && sent.attachments.length))) {
          safe(() => composer.restoreMessage(sent.text, sent.attachments, sent.maxAgents));
          toast('This conversation was changed in another window, so Jarvis stopped and your message wasn’t saved. It’s back in the box.', { level: 'warn', id: 'conflict' });
        } else if (showing) {
          toast('This conversation was changed in another window — showing the latest.', { level: 'info', id: 'conflict' });
        }
        scheduleHistoryRefresh();
      });
  }

  /** `sent` = { text, attachments, maxAgents } of a new message: given back if the turn is withdrawn. */
  function attachRun(conv, run, sent = null) {
    const entry = { run, conv, sent, unsub: null, missions: new Set(), started: new Set(), ended: new Set(), agentsDone: new Set() };
    state.runs.set(conv.id, entry);
    entry.unsub = run.on('*', (evt) => onRunEvent(entry, evt));
    broadcastRun(conv.id, true);
    Promise.resolve(run.done)
      .catch((err) => console.error('[jarvis] run failed:', err))
      .then(() => onRunDone(entry));
    safe(() => keepAwake('run'));
    announce('Jarvis is working');
    updateCore();
  }

  function isCurrent(entry) {
    return !!(state.conv && entry.conv && state.conv.id === entry.conv.id);
  }

  function onRunEvent(entry, evt) {
    if (!evt || !evt.type) return;
    if (evt.type === 'notice') {
      if (evt.message) toast(evt.message, { level: evt.level === 'warn' ? 'warn' : 'info', id: `notice:${evt.message}` });
      return;
    }
    const current = isCurrent(entry);
    if (current) chat.handleEvent(evt);
    if (evt.type === 'mission' && evt.mission) {
      const m = evt.mission;
      if (!entry.missions.has(m.id)) {
        entry.missions.add(m.id);
        if (current) {
          state.mcSel = { turnId: evt.turn.id, missionId: m.id };
          mcShowSelected();
        }
      }
      if (m.status === 'running' && !entry.started.has(m.id)) {
        entry.started.add(m.id);
        const n = (m.agents || []).length;
        announce(`Mission launched: ${n} agent${n === 1 ? '' : 's'} deployed`);
        safe(() => sounds.cue('launch'));
      } else if ((m.status === 'done' || m.status === 'partial') && !entry.ended.has(m.id)) {
        entry.ended.add(m.id);
        announce(m.status === 'done' ? 'Mission complete' : 'Mission finished with some agents failing');
        safe(() => sounds.cue('mission-done'));
      }
      if (current) mcMarkDirty(evt.turn, m);
    } else if (evt.type === 'agent' && evt.mission && current) {
      mcMarkDirty(evt.turn, evt.mission);
    }
    if (evt.type === 'agent' && evt.agent && evt.agent.status === 'done' && !entry.agentsDone.has(evt.agent.id)) {
      entry.agentsDone.add(evt.agent.id);
      safe(() => sounds.play('agent-done'));
    }
    if (evt.type === 'turn' || evt.type === 'mission' || evt.type === 'agent' || evt.type === 'end') updateCore();
    if (evt.type === 'usage' && current) renderPanelStatsSoon();
  }

  function onRunDone(entry) {
    if (entry.unsub) safe(() => entry.unsub());
    broadcastRun(entry.conv.id, false);
    if (state.runs.get(entry.conv.id) === entry) state.runs.delete(entry.conv.id);
    if (!state.runs.size) safe(() => allowSleep('run'));
    const turn = entry.run.turn;
    if (turn && !state.demo) safe(() => recordTurn(turn));
    if (isCurrent(entry)) {
      chat.refresh();
      mcMarkDirty(turn, null);
    }
    refreshHistory();
    if (entry.conflict) settleConflictedRun(entry, turn, entry.sent);
    // Stopped before Jarvis showed any reply, the message was taken back (the engine marks the turn
    // withdrawn; once part of the reply is on screen it stays in the conversation instead): its
    // text, attachments and team size go back in the box, ready to edit or send again.
    else if (turn && turn.withdrawn === true && entry.sent && isCurrent(entry)) {
      safe(() => composer.restoreMessage(entry.sent.text, entry.sent.attachments, entry.sent.maxAgents));
      toast('Stopped before Jarvis replied. Your message is back in the box.', { level: 'info', id: 'withdrawn' });
    }
    entry.sent = null;
    const status = turn && turn.status;
    if (status === 'done') announce('Reply ready');
    else if (status === 'stopped') announce('Stopped');
    else if (status === 'interrupted') {
      announce('Interrupted — you can resume');
      if (!isCurrent(entry)) toast('A reply was interrupted. Open it to resume.', { level: 'warn', action: { label: 'Open', fn: () => openConversation(entry.conv.id) } });
    } else if (status === 'error') {
      announce(turn.error && turn.error.message ? turn.error.message : 'Jarvis hit an error');
      state.errorUntil = Date.now() + 2500;
      setTimeout(updateCore, 2600);
    }
    // Voice Mode plays its own listen/reply/error sounds and speaks the answer itself.
    const voiceOpen = safe(() => isVoiceModeOpen(), false);
    if (status === 'done' && !voiceOpen) safe(() => sounds.play('reply-done'));
    else if (status === 'error' && !voiceOpen) safe(() => sounds.cue('error'));
    const finished = safe(() => describeFinishedTurn(turn, entry.conv), null);
    if (finished) safe(() => missionFinished(finished));
    if (status === 'done' && isCurrent(entry)) {
      // Not when Voice Mode had already begun saying this answer before the owner left it: Exit
      // was to silence Jarvis, and the chat reading it again from the start would undo that.
      if (!voiceOpen && !safe(() => voiceModeSpoke(entry.run), false)) autoSpeak(turn);
      offerFollowups(entry.conv, turn);
    }
    updateAll();
    if (!state.runs.size && state.pendingUpdate) {
      const apply = state.pendingUpdate;
      state.pendingUpdate = null;
      toast('Updating Jarvis…', { level: 'info' });
      setTimeout(() => safe(apply), 800);
    }
  }

  /** Abort every run and wait (briefly) for each to settle, so no late persist re-saves data. */
  async function stopAllRuns() {
    const entries = Array.from(state.runs.values());
    for (const entry of entries) safe(() => entry.run.abort());
    await Promise.all(entries.map((entry) => withTimeout(Promise.resolve(entry.run.done).catch(() => null), 3000, null)));
  }

  function stop() {
    if (!state.conv) return;
    const entry = state.runs.get(state.conv.id);
    if (entry) safe(() => entry.run.abort());
  }

  function resume() {
    if (!state.conv || currentRunning()) return;
    if (runningElsewhere(state.conv.id)) {
      toast('Jarvis is still working on this in another window.', { level: 'info', id: 'elsewhere' });
      return;
    }
    if (!state.online) {
      toast('You’re offline. Reconnect to resume.', { level: 'warn' });
      return;
    }
    let run = null;
    try {
      run = engine.resumeTurn(state.conv);
    } catch (err) {
      console.error('[jarvis] resumeTurn failed:', err);
    }
    if (!run) {
      toast('This reply can’t be resumed. Try asking again.', { level: 'warn' });
      chat.refresh();
      return;
    }
    attachRun(state.conv, run);
    chat.refresh();
    chat.scrollToBottom(true);
    updateAll();
  }

  function retry(turn) {
    if (!state.conv || currentRunning()) return;
    const turns = state.conv.turns || [];
    const idx = turns.indexOf(turn);
    let user = null;
    for (let i = (idx >= 0 ? idx : turns.length) - 1; i >= 0; i--) {
      if (isObj(turns[i]) && turns[i].role === 'user') {
        user = turns[i];
        break;
      }
    }
    if (!user) return;
    // Attachments are stored without their data (SPEC §15.1), so they can't be re-sent:
    // hand the text back to the composer and ask for the files again.
    if (Array.isArray(user.attachments) && user.attachments.length) {
      composer.setText(user.text || '');
      toast('Attach the file again to retry this request.', { level: 'info', id: 'retry-attachments' });
      if (state.layout === 'desktop') composer.focus();
      return;
    }
    send(user.text, user.mode || composer.getMode());
  }

  // ---- memory chips ----------------------------------------------------------------------
  // Like the platform's removal by text: case-insensitive, ignoring punctuation and spacing.
  const memoryKey = (text) =>
    String(text || '')
      .toLowerCase()
      .replace(/[\p{P}\p{S}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  /** Is a fact Jarvis remembered still saved? null when memory can't be read. */
  function isRemembered(fact) {
    const key = memoryKey(fact);
    if (!key) return null;
    return safe(() => listMemory().some((m) => {
      const k = memoryKey(m.text);
      return k === key || (/…$/.test(m.text) && k.length > 20 && key.startsWith(k)); // stored facts are capped at 300 characters
    }), null);
  }

  /** Undo a remembered fact from its chip in the transcript. */
  function forgetMemory(fact) {
    const removed = safe(() => removeMemory(fact), false);
    const shown = fact.length > 60 ? `${fact.slice(0, 57).trimEnd()}…` : fact;
    toast(removed ? `Forgot “${shown}”.` : 'That isn’t in Jarvis’s memory any more.', { level: removed ? 'success' : 'info', id: 'memory-undo' });
    chat.refreshMemory();
    return removed;
  }

  // ---- copy & speech ---------------------------------------------------------------------
  function turnText(turn, lastRequestOnly) {
    const segs = segmentsOf(turn).filter((s) => s.kind === 'text' && typeof s.text === 'string' && s.text.trim());
    if (!segs.length) return '';
    let use = segs;
    if (lastRequestOnly) {
      const maxReq = Math.max(...segs.map((s) => Number(s.req) || 0));
      use = segs.filter((s) => (Number(s.req) || 0) === maxReq);
    }
    return use.map((s) => s.text).join('\n\n');
  }

  /** The reply's final answer (the text after its last search or mission), for speech and copy. */
  function answerText(turn) {
    return safe(() => finalAnswerMarkdown(turn), '') || turnText(turn, true);
  }

  async function copyTurn(turn) {
    // Copied text leaves the app like a share does: never with the API key in it.
    const visuals = segmentsOf(turn).filter((seg) => isVisualSegment(seg)).map((seg) => safe(() => visualExportLine(seg), '')).filter(Boolean);
    const body = plainText(answerText(turn) || turnText(turn, false));
    const text = redactSecrets([...visuals, body].filter(Boolean).join('\n\n'), state.demo ? '' : safe(getApiKey, ''));
    const ok = await copyText(text);
    toast(ok ? 'Copied to clipboard.' : 'Couldn’t copy. Select the text instead.', { level: ok ? 'success' : 'warn', id: 'copy' });
  }

  function stopSpeakingNow() {
    if (!state.speaking) return;
    const { handle } = state.speaking;
    state.speaking = null;
    safe(() => allowSleep('speech'));
    safe(() => handle && handle.cancel && handle.cancel());
    safe(() => stopSpeaking());
    chat.refreshSpeaking();
    updateCore();
  }

  let levelTimer = 0;
  function pulseLevel() {
    header.setLevel(1);
    chat.setCoreLevel(1);
    clearTimeout(levelTimer);
    levelTimer = setTimeout(() => {
      header.setLevel(0.2);
      chat.setCoreLevel(0.2);
    }, 180);
  }

  /**
   * Read a reply aloud: mode 'full' (the Speak button, Speak replies → Whole reply) reads the whole
   * answer, 'summary' its opening paragraph. The speech engine (platform tts.js) chunks it, keeps
   * the next chunk queued and recovers from the browsers' speech quirks, so onEnd always comes.
   * The screen stays on while it reads (wake lock owner 'speech'): iOS pauses speech once the
   * screen locks, so a long answer would otherwise stop after Auto-Lock's 30 s or a minute.
   */
  function speakTurn(turn, mode) {
    if (!ttsOk) return;
    const md = answerText(turn);
    const text = safe(() => toSpeech(md, mode), '');
    if (!text) return;
    stopSpeakingNow();
    const s = getSettings();
    const entry = { turnId: turn.id, handle: null };
    state.speaking = entry;
    safe(() => keepAwake('speech')); // after stopSpeakingNow(), which lets it go
    try {
      entry.handle = speak(text, {
        voiceURI: s.voiceURI,
        rate: s.voiceRate,
        onChunk: () => pulseLevel(),
        onBoundary: () => pulseLevel(),
        onEnd: (info) => {
          const reason = info && info.reason;
          // Only while this read is the current one: a replaced read ends ('cancelled') inside the
          // next one's speak(), and the lock (one per owner) now belongs to that one.
          if (state.speaking === entry) {
            state.speaking = null;
            safe(() => allowSleep('speech'));
            chat.refreshSpeaking();
            updateCore();
            // 'error': the voice stopped responding (the engine already retried); 'unsupported': no speech here.
            if (reason === 'error') toast('The voice stopped responding. Try again, or pick another voice in Settings → Voice.', { level: 'warn', id: 'speech' });
            else if (reason === 'unsupported') toast('This browser couldn’t play speech.', { level: 'warn', id: 'speech' });
          }
        },
      });
    } catch (err) {
      console.error('[jarvis] speak failed:', err);
      if (state.speaking === entry) {
        state.speaking = null;
        safe(() => allowSleep('speech'));
      }
      toast('This browser couldn’t play speech.', { level: 'warn' });
    }
    chat.refreshSpeaking();
    updateCore();
  }

  function toggleSpeakTurn(turn) {
    if (state.speaking && state.speaking.turnId === turn.id) stopSpeakingNow();
    else speakTurn(turn, 'full');
  }

  function autoSpeak(turn) {
    const mode = getSettings().speakReplies;
    if (mode === 'summary' || mode === 'full') speakTurn(turn, mode);
  }

  // ---- microphone ------------------------------------------------------------------------
  function toggleMic() {
    if (state.listening) {
      safe(() => state.listening.stop());
      return;
    }
    if (!sttOk) return;
    stopSpeakingNow();
    safe(() => unlockSpeech());
    const prefix = composer.getText().trim();
    const join = (t) => [prefix, String(t || '').trim()].filter(Boolean).join(' ');
    let handle = null;
    let ended = false; // the STT module may end (or fail) synchronously inside startListening()
    const finish = () => {
      if (!ended) safe(() => sounds.play('listen-stop'));
      ended = true;
      if (state.listening === handle) state.listening = null;
      composer.setListening(false);
      header.setLevel(0);
      updateCore();
    };
    try {
      handle = startListening({
        lang: getSettings().listenLang,
        onPartial: (t) => {
          composer.setText(join(t));
          pulseLevel();
        },
        onFinal: (t) => {
          const text = join(t);
          composer.setText(text);
          if (text && !currentRunning() && state.online && (state.demo || safe(getApiKey, ''))) {
            // submit() goes through onSend with the composer's attachments and team size,
            // and clears the input and attachments only when the send is accepted.
            composer.submit();
          }
        },
        onEnd: finish,
        onError: (e) => {
          const code = e && e.code;
          const msg =
            code === 'not-allowed'
              ? (e && e.message) || 'Microphone access is blocked. Allow it in your browser’s site settings.'
              : code === 'no-speech'
                ? 'I didn’t catch that. Tap the mic and try again.'
                : code === 'network'
                  ? 'Voice input needs a connection.'
                  : code === 'unsupported'
                    ? 'Voice input isn’t supported in this browser.'
                    : code === 'aborted'
                      ? ''
                      : (e && e.message) || 'Voice input stopped unexpectedly.';
          if (msg) toast(msg, { level: code === 'no-speech' ? 'info' : 'warn', id: 'stt' });
          finish();
        },
      });
    } catch (err) {
      console.error('[jarvis] startListening failed:', err);
      toast('Voice input couldn’t start.', { level: 'warn' });
      return;
    }
    if (ended || !handle) return;
    state.listening = handle;
    safe(() => sounds.play('listen-start'));
    composer.setListening(true);
    updateCore();
  }

  // ---- Mission Control ---------------------------------------------------------------------
  let mcPanel = null;
  let mcSheet = null; // { sheet, mc }
  const mcDirty = new Map(); // missionId|'' -> { turn, mission }

  function findTurn(turnId) {
    if (!state.conv || !turnId) return null;
    return turnsOf(state.conv).find((t) => t.id === turnId) || null;
  }

  function selectLatestMission() {
    state.mcSel = null;
    const turns = turnsOf(state.conv);
    for (let i = turns.length - 1; i >= 0 && !state.mcSel; i--) {
      const t = turns[i];
      const missions = missionsOf(t);
      if (t.role !== 'jarvis') continue;
      const segs = segmentsOf(t).filter((s) => s.kind === 'mission' && isObj(missions[s.missionId]));
      const ids = segs.length ? segs.map((s) => s.missionId) : Object.keys(missions).filter((id) => isObj(missions[id]));
      if (ids.length) state.mcSel = { turnId: t.id, missionId: ids[ids.length - 1] };
    }
    mcShowSelected();
  }

  function ensureMcTestId(host) {
    if (!host.querySelector('[data-testid="mission-control"]')) host.setAttribute('data-testid', 'mission-control');
  }

  function mcShowSelected() {
    const turn = state.mcSel && findTurn(state.mcSel.turnId);
    if (mcPanel) {
      safe(() => (turn ? mcPanel.show(turn, state.mcSel.missionId) : mcPanel.clear()));
      panel.classList.toggle('has-mission', !!turn);
    }
    if (mcSheet && turn) safe(() => mcSheet.mc.show(turn, state.mcSel.missionId));
    renderPanelStats();
  }

  const mcFlush = raf(() => {
    const sel = state.mcSel;
    for (const { turn, mission } of mcDirty.values()) {
      if (!sel || !turn || turn.id !== sel.turnId) continue;
      if (mcPanel) safe(() => mcPanel.update(turn, mission || undefined));
      if (mcSheet) safe(() => mcSheet.mc.update(turn, mission || undefined));
    }
    mcDirty.clear();
  });
  function mcMarkDirty(turn, mission) {
    if (!turn) return;
    mcDirty.set(mission ? mission.id : `turn:${turn.id}`, { turn, mission });
    mcFlush();
  }

  function createPanelMc() {
    if (mcPanel) return;
    try {
      mcPanel = createMissionControl({ container: panelMcHost, variant: 'panel' });
      if (mcPanel.el && mcPanel.el.parentNode !== panelMcHost) panelMcHost.appendChild(mcPanel.el);
      ensureMcTestId(panelMcHost);
    } catch (err) {
      console.error('[jarvis] Mission Control panel failed:', err);
      mcPanel = null;
    }
    mcShowSelected();
  }
  function destroyPanelMc() {
    if (!mcPanel) return;
    safe(() => mcPanel.destroy && mcPanel.destroy());
    panelMcHost.replaceChildren();
    panelMcHost.removeAttribute('data-testid');
    mcPanel = null;
  }

  function openMission(turn, missionId) {
    if (!turn) return;
    const id = missionId || Object.keys(missionsOf(turn)).pop();
    if (!id) return;
    state.mcSel = { turnId: turn.id, missionId: id };
    if (state.layout === 'desktop') {
      mcShowSelected();
      panel.classList.remove('is-flash');
      void panel.offsetWidth;
      panel.classList.add('is-flash');
      return;
    }
    if (mcSheet) {
      safe(() => mcSheet.mc.show(turn, id));
      return;
    }
    const missionShare = h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        attrs: { 'aria-label': 'Share or export this mission', 'data-testid': 'mission-share', title: 'Share or export' },
        on: { click: () => state.mcSel && openShare(findTurn(state.mcSel.turnId), state.mcSel.missionId) },
      },
      icon('share', { size: 20 }),
    );
    const sheet = createSheet({
      kind: 'bottom',
      tall: true,
      title: 'Mission Control',
      className: 'sheet--mission',
      headerExtra: [missionShare],
      onClose: () => {
        if (mcSheet && mcSheet.sheet === sheet) {
          safe(() => mcSheet.mc.destroy && mcSheet.mc.destroy());
          mcSheet = null;
        }
      },
    });
    let mc;
    try {
      mc = createMissionControl({ container: sheet.body, variant: 'sheet' });
      if (mc.el && mc.el.parentNode !== sheet.body) sheet.body.appendChild(mc.el);
    } catch (err) {
      console.error('[jarvis] Mission Control failed:', err);
      toast('Mission Control couldn’t open.', { level: 'error' });
      return;
    }
    ensureMcTestId(sheet.panel);
    mcSheet = { sheet, mc };
    sheet.open();
    safe(() => mc.show(turn, id));
  }

  // Panel footer: session readout (and month spend) under the core / agent list.
  const renderPanelStatsSoon = raf(() => renderPanelStats());
  function renderPanelStats() {
    if (state.layout !== 'desktop') return;
    const turns = (state.conv && state.conv.turns) || [];
    let replies = 0;
    let agents = 0;
    let searches = 0;
    let sources = 0;
    let cost = 0;
    for (const t of turns) {
      if (!isObj(t) || t.role !== 'jarvis') continue;
      replies += 1;
      const st = isObj(t.stats) ? t.stats : {};
      if (t.status === 'running') {
        for (const m of Object.values(missionsOf(t))) agents += isObj(m) && Array.isArray(m.agents) ? m.agents.length : 0;
      } else {
        agents += Number(st.agents) || 0;
        searches += Number(st.searches) || 0;
        sources += Number(st.sources) || 0;
      }
      cost += Number(t.costUsd) || 0;
    }
    const sp = state.demo ? null : safe(getSpend, null);
    const cell = (label, value) => h('div', { class: 'stat-cell' }, h('span', { class: 'stat-value', text: value }), h('span', { class: 'stat-label', text: label }));
    panelStats.replaceChildren(
      h('div', { class: 'panel-stats-head' }, h('span', { class: 'label-caps', text: state.conv && turns.length ? 'This conversation' : 'Session' }), sp ? h('span', { class: 'panel-month mono', text: `Month ${usd(sp.monthUsd)}` }) : null),
      h('div', { class: 'stat-grid' }, cell('Replies', String(replies)), cell('Agents', String(agents)), cell('Searches', String(searches)), cell('Sources', String(sources)), cell('Cost', usd(cost))),
    );
  }

  // ---- sheets ---------------------------------------------------------------------------------
  let historySheet = null;
  let settingsSheet = null;
  let settingsPanel = null;
  let onboardingSheet = null;
  let installSheet = null;

  function closePhoneSheets() {
    if (historySheet) historySheet.close('navigate');
  }

  function openHistory() {
    if (state.layout === 'desktop') {
      if (!state.sidebarOpen) setSidebar(true);
      history.focusSearch();
      return;
    }
    if (historySheet) return;
    refreshHistory();
    const sheet = createSheet({
      kind: 'left',
      title: 'History',
      className: 'sheet--history',
      initialFocus: () => null,
      onClose: () => {
        if (historySheet === sheet) historySheet = null;
        header.setHistoryExpanded(false);
        setTimeout(() => {
          if (!historySheet && history.el.parentNode === sheet.body) history.el.remove();
        }, 400);
      },
    });
    history.setCollapsible(false);
    sheet.body.appendChild(history.el);
    historySheet = sheet;
    header.setHistoryExpanded(true);
    sheet.open();
  }

  function setSidebar(open, persist = true) {
    state.sidebarOpen = !!open;
    root.dataset.sidebar = open ? 'open' : 'closed';
    header.setHistoryExpanded(state.layout === 'desktop' && open);
    if (persist) uiSet(UI_KEYS.sidebar, open ? 'open' : 'closed');
  }

  function openSettings(opts = {}) {
    if (settingsSheet) {
      if (opts.section && settingsPanel) settingsPanel.scrollToSection(opts.section, true);
      if (opts.focus && settingsPanel) settingsPanel.focus(opts.focus);
      return;
    }
    closePhoneSheets();
    const panelCtl = createSettingsPanel({
      demo: state.demo,
      naturalVoice: naturalVoice ? { natural: naturalVoice, tts } : null,
      testApiKey: (key) => engine.testApiKey(key),
      onKeyChanged: () => updateAll(),
      openInstallGuide: () => openInstallGuide(),
      openSystems: () => openSystems(),
      deleteAllConversations: async () => {
        await stopAllRuns();
        await store.removeAll();
        setConversation(null);
        await refreshHistory();
      },
      resetApp: async () => {
        await stopAllRuns();
        if (!state.demo) await resetApp();
        uiSet(UI_KEYS.last, null);
        uiSet(UI_KEYS.sidebar, null);
        uiSet(UI_KEYS.spendDismissed, null);
        location.replace(location.pathname);
      },
      refreshHistory: () => refreshHistory(),
      // An import may have replaced the open conversation with the backup's newer copy.
      onImported: (res) => {
        const id = state.conv && state.conv.id;
        if (!id || !res || !Array.isArray(res.replaced) || !res.replaced.includes(id) || state.runs.has(id)) return;
        Promise.resolve(store.get(id))
          .then((fresh) => {
            if (fresh && state.conv && state.conv.id === id && !state.runs.has(id)) setConversation(fresh);
          })
          .catch((err) => console.error('[jarvis] reloading the imported conversation failed:', err));
      },
      replayOnboarding: () => {
        if (settingsSheet) settingsSheet.close('navigate');
        setTimeout(() => openOnboarding(), 50);
      },
      toast,
    });
    const sheet = createSheet({
      kind: 'full',
      title: 'Settings',
      testid: 'settings-sheet',
      closeTestid: 'settings-close',
      className: 'sheet--settings',
      onClose: () => {
        safe(() => panelCtl.flush());
        safe(() => panelCtl.destroy());
        if (settingsSheet === sheet) {
          settingsSheet = null;
          settingsPanel = null;
        }
        updateAll();
      },
    });
    sheet.body.appendChild(panelCtl.el);
    panelCtl.setScrollRoot(sheet.body);
    settingsSheet = sheet;
    settingsPanel = panelCtl;
    sheet.open();
    if (opts.section) requestAnimationFrame(() => panelCtl.scrollToSection(opts.section, false));
    if (opts.focus) setTimeout(() => panelCtl.focus(opts.focus), 380);
  }

  // ---- records (SPEC §14.4): share & export, Systems dashboard ----------------------------
  let shareSheet = null;
  function openShare(turn, missionId) {
    if (shareSheet || !turn) return;
    let options;
    try {
      options = createShareOptions({
        turn,
        conversation: state.conv,
        mission: missionId,
        apiKey: state.demo ? '' : safe(getApiKey, ''),
        onDone: () => {
          if (shareSheet) shareSheet.close('done');
        },
        toast,
      });
    } catch (err) {
      console.error('[jarvis] share options failed:', err);
      toast('Sharing isn’t available for this reply.', { level: 'warn' });
      return;
    }
    const sheet = createSheet({
      kind: 'bottom',
      title: 'Share & export',
      testid: 'share-sheet',
      className: 'sheet--share',
      onClose: () => {
        safe(() => options.destroy());
        if (shareSheet === sheet) shareSheet = null;
      },
    });
    sheet.body.appendChild(options.el);
    shareSheet = sheet;
    sheet.open();
  }

  let systemsSheet = null;
  function openSystems() {
    if (systemsSheet) return;
    let view;
    try {
      view = createStatsView({ getSpend: () => (state.demo ? null : getSpend()), listConversations: () => store.list(), getSettings, compact: true });
    } catch (err) {
      console.error('[jarvis] Systems dashboard failed:', err);
      toast('The Systems dashboard couldn’t open.', { level: 'error' });
      return;
    }
    const sheet = createSheet({
      kind: 'full',
      title: 'Systems',
      testid: 'stats-sheet',
      className: 'sheet--stats',
      onClose: () => {
        safe(() => view.destroy());
        if (systemsSheet === sheet) systemsSheet = null;
      },
    });
    sheet.body.appendChild(view.el);
    systemsSheet = sheet;
    sheet.open();
    safe(() => view.refresh());
  }

  function openInstallGuide() {
    if (installSheet) return;
    const guide = createInstallGuide({ toast });
    const sheet = createSheet({
      kind: 'bottom',
      title: 'Install Jarvis',
      testid: 'install-guide',
      className: 'sheet--install',
      onClose: () => {
        safe(() => guide.destroy());
        if (installSheet === sheet) installSheet = null;
      },
    });
    sheet.body.appendChild(guide.el);
    installSheet = sheet;
    sheet.open();
  }

  function openOnboarding(startAt) {
    if (onboardingSheet) return;
    const ob = createOnboarding({
      startAt,
      testApiKey: (key) => engine.testApiKey(key),
      onKeyChanged: () => updateAll(),
      openInstallGuide: () => openInstallGuide(),
      onDone: () => {
        if (onboardingSheet) onboardingSheet.close('done');
        updateAll();
        chat.refreshEmpty();
        setTimeout(() => {
          if (state.layout === 'desktop') composer.focus();
        }, 360);
      },
    });
    const sheet = createSheet({
      kind: 'full',
      label: 'Welcome to Jarvis',
      header: false,
      dismissible: false,
      className: 'sheet--onboarding',
      onClose: () => {
        safe(() => ob.destroy());
        if (onboardingSheet === sheet) onboardingSheet = null;
      },
    });
    sheet.body.appendChild(ob.el);
    onboardingSheet = sheet;
    sheet.open();
  }

  // ---- layout ---------------------------------------------------------------------------------
  const desktopMq = safe(() => window.matchMedia(DESKTOP_MQ), null);
  const wideMq = safe(() => window.matchMedia(WIDE_MQ), null);

  function applyLayout() {
    const desktop = !!(desktopMq && desktopMq.matches);
    const next = desktop ? 'desktop' : 'phone';
    const changed = next !== state.layout || !root.dataset.layout;
    state.layout = next;
    root.dataset.layout = next;
    if (!changed) return;
    if (desktop) {
      if (historySheet) historySheet.close('layout');
      if (mcSheet) mcSheet.sheet.close('layout');
      history.setCollapsible(true);
      sidebar.appendChild(history.el);
      const pref = uiGet(UI_KEYS.sidebar);
      setSidebar(pref ? pref === 'open' : !!(wideMq && wideMq.matches), false);
      createPanelMc();
      renderPanelStats();
    } else {
      if (history.el.parentNode === sidebar) history.el.remove();
      destroyPanelMc();
      setSidebar(false, false);
      header.setHistoryExpanded(false);
    }
  }
  if (desktopMq) {
    const onChange = () => applyLayout();
    if (desktopMq.addEventListener) desktopMq.addEventListener('change', onChange);
    else if (desktopMq.addListener) desktopMq.addListener(onChange);
  }
  if (wideMq) {
    const onWide = () => {
      if (state.layout === 'desktop' && !uiGet(UI_KEYS.sidebar)) setSidebar(wideMq.matches, false);
    };
    if (wideMq.addEventListener) wideMq.addEventListener('change', onWide);
    else if (wideMq.addListener) wideMq.addListener(onWide);
  }

  // Keep the app inside the visual viewport (iOS on-screen keyboard), unless pinch-zoomed.
  const vv = window.visualViewport;
  const syncViewport = () => {
    if (!vv) return;
    if (Math.abs((vv.scale || 1) - 1) > 0.01) return;
    const docEl = document.documentElement;
    docEl.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    docEl.style.setProperty('--vvt', `${Math.max(0, Math.round(vv.offsetTop))}px`);
    root.dataset.keyboard = window.innerHeight - vv.height > 140 ? 'open' : 'closed';
  };
  if (vv) {
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
  }
  syncViewport();
  // iOS sometimes leaves the page scrolled after the keyboard closes.
  composer.input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (window.scrollY) window.scrollTo(0, 0);
    }, 120);
  });

  // ---- global listeners ----------------------------------------------------------------------
  on(document, 'keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      if (onboardingSheet || isVoiceModeOpen()) return;
      e.preventDefault();
      if (settingsSheet) settingsSheet.close('shortcut');
      if (installSheet) installSheet.close('shortcut');
      if (shareSheet) shareSheet.close('shortcut');
      if (systemsSheet) systemsSheet.close('shortcut');
      newChat();
      composer.focus();
      return;
    }
    // Optics on a computer: Ctrl/⌘ Shift L (Look). Presence-ui's Look and Screen quick keys call the same.
    if (mod && e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L') && !isOverlayOpen() && !isVoiceModeOpen() && !anySheetOpen()) {
      e.preventDefault();
      openOpticsScreen();
      return;
    }
    if (e.key === '/' && !mod && !e.altKey && !anySheetOpen() && !isVoiceModeOpen() && !isOverlayOpen()) {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      composer.focus();
    }
  });

  // iOS needs speech to be started from a user gesture once. unlockSpeech() is one-shot and iOS
  // does not accept pointerdown as that gesture, so listen for click (and keydown) instead.
  const unlockOnce = () => {
    safe(() => unlockSpeech());
    document.removeEventListener('click', unlockOnce, true);
    document.removeEventListener('keydown', unlockOnce, true);
  };
  if (ttsOk) {
    document.addEventListener('click', unlockOnce, true);
    document.addEventListener('keydown', unlockOnce, true);
  }

  safe(() =>
    onOnlineChange((online) => {
      const was = state.online;
      state.online = typeof online === 'boolean' ? online : safe(() => isOnline(), true);
      updateAll();
      if (!was && state.online && state.conv && !currentRunning() && !runningElsewhere(state.conv.id) && safe(() => engine.canResume(state.conv), false)) {
        toast('Back online.', { level: 'success', action: { label: 'Resume', fn: () => resume() } });
      }
    }),
  );

  safe(() =>
    onSettingsChange((s) => {
      const prev = state.lastSettings || {};
      state.lastSettings = s;
      if (s.mode !== prev.mode) composer.setMode(s.mode);
      if (s.theme !== prev.theme) safe(() => applyTheme(s.theme));
      if (s.followups === false && prev.followups !== false) clearFollowups();
      if (s.userName !== prev.userName || s.leadModel !== prev.leadModel || s.depth !== prev.depth || s.maxAgents !== prev.maxAgents) chat.refreshEmpty();
      if (s.speakReplies === 'off' && prev.speakReplies !== 'off' && state.speaking) stopSpeakingNow();
      updateAll();
    }),
  );
  safe(() => onSpendChange(() => {
    renderBanners();
    renderPanelStatsSoon();
  }));
  // A fact undone from a chip, edited in Settings or changed in another tab: update the chips.
  safe(() => onMemoryChange(() => chat.refreshMemory()));
  // History stops reaching the device (full storage, blocked database): say so once, plainly.
  let warnedStorage = false;
  if (!state.demo) {
    safe(() =>
      onPersistenceChange((p) => {
        scheduleHistoryRefresh();
        if (p && p.persistent) {
          if (warnedStorage) toast('Saving works again.', { level: 'success', id: 'storage' });
          warnedStorage = false;
        } else if (p && !warnedStorage) {
          warnedStorage = true;
          const full = p.reason === 'quota';
          toast(full ? 'Your device is out of storage — new conversations aren’t being saved. Free up space or export a backup.' : 'This browser isn’t saving your conversations right now. Export a backup to keep them.', {
            level: 'error',
            timeout: 0,
            id: 'storage',
            action: { label: 'Export', fn: () => openSettings({ section: 'data' }) },
          });
        }
      }),
    );
  }

  // Another tab saved or removed the API key.
  window.addEventListener('storage', (e) => {
    if (e.key === 'jarvis.apiKey' || e.key === null) updateAll();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      chat.refresh();
      updateAll();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (!state.runs.size || state.demo) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // Greeting changes with the time of day.
  setInterval(() => {
    if (chat.isEmpty() && !document.hidden) chat.refreshEmpty();
  }, 10 * 60 * 1000);

  // ---- boot ------------------------------------------------------------------------------------
  applyLayout();
  setConversation(null, { remember: false });

  await withTimeout(refreshHistory(), 2500, null);

  if (state.demo) {
    const conv = await store.get(demo.showcaseId);
    if (conv) {
      setConversation(conv);
      composer.setMode('swarm');
      send(demo.showcasePrompt, 'swarm');
      composer.setMode(getSettings().mode);
    }
  } else {
    await withTimeout(restoreLast(), 2500, null);
  }

  if (!state.demo && !getSettings().onboarded) openOnboarding();

  {
    try {
      Promise.resolve(
        registerServiceWorker({
        onUpdateReady: (apply) => {
          toast('A new version of Jarvis is ready.', {
            level: 'info',
            timeout: 0,
            id: 'sw-update',
            action: {
              label: 'Update',
              fn: () => {
                if (state.runs.size) {
                  state.pendingUpdate = apply;
                  toast('Jarvis will update when the current task finishes.', { level: 'info' });
                } else safe(apply);
              },
            },
          });
        },
        }),
      ).catch((err) => console.error('[jarvis] service worker registration failed:', err));
    } catch (err) {
      console.error('[jarvis] service worker registration failed:', err);
    }
  }

  state.bootDone = true;
  root.dataset.ready = 'true';
  root.setAttribute('aria-busy', 'false');
  // ?optics=1 opens Optics at start (a bookmark on the Mac; tests). Phones open it from a tap.
  if (!state.demo && params.get('optics') === '1' && safe(() => cameraSupported(), false)) setTimeout(() => openOpticsScreen(), 0);

  async function restoreLast() {
    let saved = null;
    try {
      saved = JSON.parse(uiGet(UI_KEYS.last) || 'null');
    } catch {
      saved = null;
    }
    if (saved && saved.id && Date.now() - (Number(saved.at) || 0) < RESTORE_WINDOW_MS) {
      const conv = await store.get(saved.id).catch(() => null);
      // A slow start: the owner may already have opened or started a chat while this loaded.
      if (state.conv || state.runs.size) return;
      // A chat from before holograms is not reopened (its tools can't show one): the first launch
      // after the update starts on the home screen, and the old chat waits in History.
      if (conv && conv.turns && conv.turns.length && (state.demo || hasVisualTools(conv, 'show_hologram'))) {
        setConversation(conv);
        return;
      }
    }
    // Not restoring: still point out an interrupted reply in the newest conversation.
    try {
      const items = await store.list();
      const newest = items && items[0];
      if (!newest || Date.now() - newest.updatedAt > 24 * 3600 * 1000) return;
      const conv = await store.get(newest.id);
      const last = conv && conv.turns && conv.turns[conv.turns.length - 1];
      if (last && last.role === 'jarvis' && (last.status === 'interrupted' || last.status === 'running')) {
        toast('Your last request was interrupted.', { level: 'warn', timeout: 9000, action: { label: 'Open', fn: () => openConversation(conv.id) } });
      }
    } catch {
      /* best effort */
    }
  }

  return {
    state,
    openSettings,
    openHistory,
    openInstallGuide,
    openOnboarding,
    newChat,
    openLibrary,
    openLibraryItem,
    // Optics: presence-ui's Look quick key and Voice Mode's Look call this (from a tap).
    openOptics: (opts) => openOpticsScreen(opts), // { start: 'screen' } for the desktop Screen key
    screenLookSupported: () => safe(() => screenLookSupported(), false),
    // Voice Mode hooks (see src/ui/hologram/viewer.js): open a hologram card's viewer, and the open
    // viewers (command(text, { source: 'voice' }), submit(text), close()).
    openHologram: (turn, seg) => openVisualSegment(turn, seg),
    getHologramViewer,
    getBlueprintViewer,
  };
}
