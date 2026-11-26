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
import { REVIEW_MS, listenPhrases } from './voice-heard.js';
import { partHint, nothingBackAck } from './voice-visuals.js';
import { createMicBands } from './hud/voice-bands.js';
import { recordTurn, createStatsView, createStatsLauncher, exportStats, importStats, getStats, dayKey } from './stats.js';
import { createShareOptions, redactSecrets } from './share.js';
import { createFollowupChips, parseProtocolPrompt, exportCustomProtocols, importCustomProtocols, getProtocol } from './protocols.js';
import { createPresence } from './presence/presence.js';
import { exportHud, importHud } from './presence/hud-prefs.js';
import { partOfDay, chronometer } from './presence/model.js';
import { fmtUsd } from './hud/format.js';
import { openHologramViewer, getHologramViewer, renderHologramImage } from './hologram/viewer.js';
import { openBlueprintViewer, getBlueprintViewer } from './blueprint/open.js';
import { createLibraryView } from './library.js';
import { createThumbs } from './thumbs.js';
import { isOverlayOpen } from './overlay.js';
import { currentPhoto } from './photos.js';
import { createScreens, screenAck, screenMessage } from './screens/controller.js';
import { isScreenMode } from './screens/screen-page.js';
import { createBrowserTabs } from './browser-tab.js';
import { linksOf, lookSnapshot } from '../lib/screen-targets.js';
import { detectScreenEnv } from '../lib/screen-placement.js';
import { matchHologramCommand, normalizeCommandText } from '../lib/hologram-commands.js';
import { matchScreenCommand } from '../lib/screen-commands.js';
import { createJarvis, MODELS, DEPTHS, blueprintCostUsd, costLabel, blueprintRequestText, hasVisualTools, isVisualSegment, visualExportLine, appendHomeBaseTurn } from '../engine/index.js';
import { suggestFollowups } from '../engine/followups.js';
import { getSettings, saveSettings, onSettingsChange } from '../platform/settings.js';
import { getApiKey, getDevApiBase } from '../platform/secrets.js';
import { listMemory, addMemory, removeMemory, onMemoryChange } from '../platform/memory.js';
import { addSpend, getSpend, getTodaySpend, onSpendChange } from '../platform/spend.js';
import { listConversations, getConversation, saveConversation, deleteConversation, deleteAllConversations, isPersistent, getPersistence, onPersistenceChange, onConversationConflict, onRemoteSave } from '../platform/db.js';
import { resetApp, registerBackupPart } from '../platform/backup.js';
import { saveLibraryItem, getLibraryItem, listLibraryItems, findPartBlueprint, setLibraryThumbnail, deleteLibraryItem, onLibraryChange } from '../platform/library.js';
import { isOnline, onOnlineChange, isIOS, isAndroid, isTouch, parseUserAgent, isStandalone } from '../platform/env.js';
import { keepAwake, allowSleep } from '../platform/wakelock.js';
import { registerServiceWorker } from '../platform/pwa.js';
import * as stt from '../platform/voice/stt.js';
import * as deviceTts from '../platform/voice/tts.js';
import { createVoiceRouter } from '../platform/voice/voice-router.js';
import { createNaturalVoice } from '../platform/voice/natural/setup.js';
import { createHomeBaseHearing } from '../platform/voice/homebase-hearing.js';
import { createHomeBaseVoiceEngine } from '../platform/voice/homebase-voice.js';
import { createSenses } from './senses.js';
import { contextPrompt } from '../lib/senses.js';
import { createVoiceAuto, setHomeBaseVoice } from './voice-auto.js';
import { createVoiceNotice } from './voice-notice.js';
import { voiceLabel } from '../lib/voice-choice.js';
import { voiceById } from '../platform/voice/natural/catalog.js';
import { markdownToPlainText } from '../lib/markdown.js';
import { currentOptics, isOpticsOpen, openOptics, opticsCameraBridge } from './optics/optics.js';
import { runWatchLook } from '../engine/watch.js';
import { LIVE_DEFAULT_MODEL, runLiveLook } from '../engine/live.js';
import { estimateHologramCost, estimateLookCost } from '../lib/optics.js';
import { createLiveBudget as liveViewBudget } from '../lib/live-view.js'; // v8.1 voice: the spend readout's live view hour
import { voiceCameraRequest, voiceLiveViewRequest } from '../lib/optics-commands.js';
import { cameraPermission, cameraSupported, screenLookSupported } from '../platform/camera.js';
import { base64ByteLength } from './attachments.js';
import { matchMusicCommand } from '../lib/music-commands.js';
import { describeItem, musicExportItem, musicLine } from '../lib/music.js';
import { searchMusic, topSongs, lookupMusic } from '../platform/music.js';
import { appendMusicTurn, musicSegment } from '../engine/music.js';
import { createMusicPlayer } from './music/player.js';
import { createMusicCardView, isMacDevice } from './music/card.js';
import { createStandby } from './standby.js';
import { createHomeBase } from './homebase.js';
import { matchHomeBaseCommand, escapeMarkdown } from '../lib/homebase.js';
import { createBrain, createMorningCard } from './brain.js';
import { createSync } from './sync.js';
import { createHomeBaseView } from './homebase-sheet.js';
import { matchBrainCommand, parseHomeBaseLink, briefingMarkdown, briefingSpeech, resultsMarkdown, resultsSpeech, brainProblem, briefingFallback, NO_KEY_MESSAGE, FRESH_BRIEFING_MS, deviceLabel } from '../lib/brain.js';
import { createStandbyCapture } from '../platform/wake/capture.js';
import { createAudioDevices } from '../platform/audio-devices.js';
import '../styles/audio-devices.css'; // v8.1: Settings → Voice → Microphone and speaker, Always on, Standby's one-time line
import { createWakeWord, createWakeWordStub } from '../platform/wake/wake-word.js';
import { noteMusicPlayed, suggestedMusic } from '../platform/music-recent.js';
import { standbyCommand } from '../lib/wake/phrases.js';
import { createWakePending } from '../lib/wake/pending.js';
import { setPausesWhenHidden as naturalPausesWhenHidden } from '../platform/voice/natural/natural-stream.js';
import { createStandbyLock, createVoiceBusy, voiceBusyElsewhere, standbyHeldSomewhere } from '../platform/standby-lock.js';
import { bargeInAllowed, readHandsFreeTest } from '../lib/hands-free.js';
import { setupOf, handsFreeMeasure } from '../lib/audio-devices.js';
// v8.1: one router for what the owner says (SPEC §30), and each track's commands in its own module.
import { createRouter, registerTodayCommands, emptyState, REOPEN_ACTIONS } from '../lib/command-router.js';
import { register as registerMacCommands } from './commands/mac.js';
import { register as registerAudioCommands } from './commands/audio.js';
import { register as registerTourCommands } from './commands/tours.js';
import { register as registerVoiceCommands } from './commands/voice.js';
import { register as registerChromeVoiceCommands } from './commands/chrome-voice.js';
import { CHROME_VOICE_CHANNEL, createChromeVoice, voiceAdapter } from './chrome-task.js'; // v8.1 chrome-voice
import { notify as notifyAttention, closeNotify } from './attention.js'; // v8.1 chrome-voice
import { register as registerWindowCommands } from './commands/windows.js';
import { register as registerOpticsCommands } from './commands/optics.js';
import { register as registerChromeCommands } from './commands/chrome.js';
// v8.1 chrome-relay: Jarvis for Chrome, linked through the home base (SPEC §32.1).
import { installChromeLink } from '../platform/chrome-link.js';
import { notify as notifyOwner } from './attention.js';
// v8.1 Optics (Track 5): the live view's gate for answers, "open optics", "research this".
import { createLiveBudget } from '../lib/live-view.js';
import { GATE_LIMITS, createLiveGate, createTurnGate, gateNote, requestWorstUsd } from '../lib/live-gate.js';
import { LIVE_VIEW_COUNTS, OFFLINE_LINE, lookFirstLine, matchOfferChoice, researchOffer, researchPrompt, researchSubject } from '../lib/research-offer.js';
import { briefingUsd } from '../lib/app-commands.js'; // v8.1 fix (MONEY-5): the briefing's price
import { matchOpticsCommand, opticsOpenLine, voiceOpticsOpen } from '../lib/optics-commands.js';
import { resolveThis } from '../lib/this-target.js';
import { commandAck as viewerAck } from './voice-visuals.js';

// v8.1 (SPEC §28.2-§28.3): Settings → Voice → Microphone and speaker (a computer in Chrome or Edge). Standby's
// capture and every listen use the microphones chosen there, and George, the chimes and music previews the
// speaker; one watcher follows them when they come and go. Nothing chosen: everything as before. Not in a
// screen window (it never listens or speaks).
/**
 * MAC-R2-1, MAC-R2-4: an stt API whose every listen counts as "this window can hear the owner" (`busy`: createVoiceBusy)
 * from its start to its onEnd (stt.js calls onEnd exactly once, however listening ended). Without `busy`: as it was.
 */
function withVoiceBusy(base, busy) {
  if (!busy || !base || typeof base.startListening !== 'function') return base;
  let seq = 0;
  return {
    ...base,
    startListening(options = {}) {
      const o = options && typeof options === 'object' ? options : {};
      const tag = `listen:${++seq}`;
      let open = true;
      const done = () => {
        if (!open) return;
        open = false;
        safeInit(() => busy.set(tag, false));
      };
      safeInit(() => busy.set(tag, true));
      try {
        return base.startListening({
          ...o,
          onEnd: (...args) => {
            done();
            return typeof o.onEnd === 'function' ? o.onEnd(...args) : undefined;
          },
        });
      } catch (err) {
        done();
        throw err;
      }
    },
  };
}

const audioDevices = isScreenMode()
  ? null
  : safeInit(() => createAudioDevices({ getSettings, phoneLike: safeInit(() => isIOS() || isAndroid() || (isTouch() && window.matchMedia('(max-width: 1024px)').matches)) === true, playChime: (name, o) => sounds.play(name, o) }));
// MAC-R2-1, MAC-R2-4: this window can hear the owner, or is answering: every listen on this device (the chat box's
// microphone, Voice Mode, a viewer's or Optics' microphone, the hands-free Test) and Voice Mode's own work (its check, a
// turn, speech) hold the voice lock, so a Standby in another Jarvis window stays asleep meanwhile and only then. Not on
// a phone (its Standby listens only on screen), nor in a screen window (it never listens).
const voiceBusy =
  isScreenMode() || safeInit(() => isIOS() || isAndroid() || (isTouch() && window.matchMedia('(max-width: 1024px)').matches)) === true ? null : safeInit(() => createVoiceBusy());
// Every recognizer listen hears the chosen question microphone (recognition.start(track), Chrome 135+).
const sttDevice = withVoiceBusy(audioDevices ? audioDevices.wrapStt(stt) : stt, voiceBusy);
// Voice Mode's chimes: in "Switch" (setup 3) the listen chime waits for the speakerphone's microphone.
const voiceSounds = audioDevices ? { ...sounds, play: (name, o) => (audioDevices.holdChime(name, o) ? true : sounds.play(name, o)) } : sounds;
const { sttSupported, startListening } = sttDevice;
// Speech: the device voice (tts.js), or the opt-in natural voice (Kokoro in a Worker) when it
// is on and ready; the router has tts.js's API, so Voice Mode and the chat use it unchanged.
// Not in a screen window (?screen=…, src/main.js starts the screen page there, which never speaks):
// it would only ask about the voice engine while the main window may be setting it up.
const naturalVoice = isScreenMode() ? null : safeInit(() => createNaturalVoice({ getVoice: () => getSettings().naturalVoiceId }));
// Hearing and voice through the home base (v7.7, beta, SPEC §25): Whisper and George's voice made by
// Jarvis Core on the Alienware. Off until the owner turns each on (Settings → Home base → Hearing and
// voice); this device's recognizer and voices stay the fallback. Not in a screen window.
const senses = isScreenMode() ? null : safeInit(() => createSenses({ getSettings, onSettingsChange }));
let sensesAllowed = true; // false in the demo (?demo=1: no network there), set by startApp()
const homeBaseVoice = senses && naturalVoice ? { engine: createHomeBaseVoiceEngine({ senses }), audio: naturalVoice.audio, canSpeak: () => sensesAllowed && senses.canSpeak() } : null;
const tts = createVoiceRouter({ device: deviceTts, natural: naturalVoice, homebase: homeBaseVoice, getSettings });
// Voice Mode's listens: stt.js, or the home base's Whisper when it is on and ready (a listen asks for
// it with homeBase: true; every other caller keeps stt.js itself). hearPrompt: the conversation's
// context words for Whisper (set once the app runs).
let hearPrompt = () => '';
const listening = senses ? safeInit(() => createHomeBaseHearing({ stt: sttDevice, senses, createCapture: (o) => createStandbyCapture({ ...o, ...captureOn('question') }), getPrompt: () => hearPrompt(), getSettings })) || sttDevice : sttDevice;
// v8.1: George (on this device and from the home base: one output) and the chimes play on the chosen speaker.
if (audioDevices) {
  if (naturalVoice) safeInit(() => audioDevices.addSink(naturalVoice.audio));
  audioDevices.addSink({ setSink: (id) => sounds.setSoundsSink(id) });
  onSettingsChange(() => audioDevices.settingsChanged());
}

/**
 * v8.1: what a microphone capture (capture.js) needs to use the chosen microphones: Standby's ('wake') or the
 * questions' ('question': the home base's hearing). Nothing chosen: {} (as before).
 */
function captureOn(role) {
  if (!audioDevices) return {};
  return {
    device: () => (role === 'wake' ? audioDevices.wakeAudio() : audioDevices.questionAudio()),
    onRelease: (d) => audioDevices.noteMicClosed(d),
    onTrack: () => audioDevices.check(),
  };
}
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
  if (demoMode) sensesAllowed = false; // the demo never asks the home base to hear or speak

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
    convCount: 0, // conversations in History (the home's starter prompts show for the first three)
  };

  // Ambience (SPEC §14.3): theme first (before anything paints), then sounds and attention.
  safe(() => applyTheme(state.lastSettings.theme));
  safe(() => sounds.initSounds(getSettings));
  safe(() => initAttention(getSettings));
  // Backups also carry the owner's custom protocols and usage statistics (merged on import).
  safe(() => registerBackupPart('protocols', { exportData: () => exportCustomProtocols(), importData: (list) => importCustomProtocols(list) }));
  safe(() => registerBackupPart('stats', { exportData: () => exportStats(), importData: (data) => importStats(data) }));
  // HUD preferences (Calm/Full, motion, boot) travel in backups too (src/ui/presence/hud-prefs.js).
  safe(() => registerBackupPart('hud', { exportData: () => exportHud(), importData: (data) => importHud(data) }));

  const ttsOk = safe(() => ttsSupported(), false);
  const sttOk = safe(() => sttSupported(), false);
  // v8.1: the command router (SPEC §30), with today's four chains' matchers; each track's commands
  // are registered below (registerCommandModules), and routerState() gives it the moment's state.
  const commandRouter = createRouter();
  registerTodayCommands(commandRouter);

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
  // Sync through the home base (v7.6, SPEC §24.7): created with the home base below; every change worth
  // backing up (a conversation saved or deleted, the library, memory, settings) tells it.
  let syncCtl = null;
  const noteSyncChange = () => {
    if (syncCtl) safe(() => syncCtl.noteChange());
  };
  // Screens (v7): created once the shell exists; the engine's open_screen tool calls it (deps.screens).
  let screensCtl = null;
  const screensDep = {
    open: (input, opts) => (screensCtl ? screensCtl.openFromTool(input, opts) : Promise.resolve({ status: 'error', message: 'Screens are still starting up.' })),
  };
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
      save: (c) => {
        noteSyncChange();
        return saveConversation(c);
      },
      remove: (id) => {
        noteSyncChange();
        return deleteConversation(id);
      },
      removeAll: () => {
        noteSyncChange();
        return deleteAllConversations();
      },
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
      screens: screensDep,
      // Apple Music (lead tools V6): find_music searches on this device, free (src/platform/music.js).
      music: { search: (input, { signal } = {}) => searchMusic(input.query, { kind: input.kind, limit: input.limit, signal }) },
      // A busy or old device can take seconds to write a big spec to IndexedDB: wait longer than the
      // engine's default before going on without saving (an unsaved hologram can't get blueprints).
      libraryTimeoutMs: 12000,
      persist: async (conv) => {
        await saveConversation(conv);
        noteSyncChange();
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

  // Home base (v7.5, SPEC §23): the Jarvis Core on the owner's Alienware, over Tailscale. Polled only
  // while its tile is on screen; not in the demo (no network there).
  const homeBase = state.demo ? null : safe(() => createHomeBase({ getSettings, onSettingsChange }), null);
  // The home base's brain (v7.6, SPEC §24): research, watchers, the morning briefing and push on
  // Jarvis Core 1.1. Read when the app starts (the morning card) and when its sheet or Settings opens.
  const brain = state.demo ? null : safe(() => createBrain({ getSettings, onSettingsChange }), null);
  // Sync through the home base (v7.6, SPEC §24.7): this device's backup goes to the home base and the
  // other devices' come back, merged in (only ever adding). On by default once a home base is linked.
  syncCtl = state.demo
    ? null
    : safe(
        () =>
          createSync({
            getSettings,
            onSettingsChange,
            label: deviceLabel(safe(() => parseUserAgent(navigator.userAgent, navigator.maxTouchPoints).os, 'other')),
            // A conversation running here or in another window is left for the next sync.
            isBusy: (id) => state.runs.has(id) || runningElsewhere(id),
            onMerged: (res) => {
              scheduleHistoryRefresh();
              const id = state.conv && state.conv.id;
              // A "(from Mac)" copy the owner carried on here became a conversation of its own: the
              // open one goes on showing it (the copy itself follows the Mac again).
              const moved = id && res && Array.isArray(res.forked) ? res.forked.find((f) => f && f.from === id) : null;
              if (moved && !state.runs.has(id)) {
                Promise.resolve(store.get(moved.to))
                  .then((fresh) => {
                    if (fresh && state.conv && state.conv.id === id && !state.runs.has(id)) setConversation(fresh);
                  })
                  .catch((err) => console.error('[jarvis] opening the kept conversation failed:', err));
                return;
              }
              if (id && res && Array.isArray(res.conversations) && res.conversations.includes(id) && !state.runs.has(id)) reloadCurrentFromStore();
            },
          }),
        null,
      );
  // ---- chrome-relay ▸ Jarvis for Chrome, linked through the home base (v8.1, SPEC §32.1): `chromeLink` is
  // app.chromeLink (contract (f)) for "pull this up in Chrome" and Chrome tasks by voice (pass it in your
  // register() deps); Settings → Jarvis for Chrome gets `chromeLinkCtl.control`. Computers only; not in the demo.
  const chromeLinkCtl = state.demo ? null : safe(() => installChromeLink({ getSettings, notice: (n) => chromeLinkNotice(n) }), null);
  const chromeLink = chromeLinkCtl ? chromeLinkCtl.api : null;
  /** Something Jarvis for Chrome did that no request is waiting for (D5: a task that started late was stopped). */
  function chromeLinkNotice(n) {
    const line = n && typeof n.line === 'string' ? n.line : '';
    if (!line) return;
    const shown = typeof n.show === 'string' && n.show ? n.show : line; // (`line` is said; `show` may hold ⌘⇧.)
    safe(() => toast(shown, { level: 'warn', timeout: 8000 }));
    const voice = safe(() => (voiceApi && isVoiceModeOpen() ? voiceApi : null), null);
    if (voice && typeof voice.say === 'function') safe(() => voice.say(line));
    else if (document.hidden) safe(() => notifyOwner({ tag: 'chrome-link', title: 'Jarvis', body: shown }));
  }
  // ---- chrome-relay ◂
  const morningCard = brain
    ? safe(
        () =>
          createMorningCard(brain, {
            onOpen: () => {
              // Read: the rail stops suggesting the (paid) briefing protocol this morning.
              safe(() => presence.noteBriefing(new Date()));
              openHomeBase({ tab: 'briefing' });
            },
          }),
        null,
      )
    : null;

  // Presence (SPEC 2.4): the state word, privacy pills, sensor tape, home and awareness rail.
  const presence = createPresence({
    root,
    demo: state.demo,
    sttOk,
    getSettings: () => getSettings(),
    getSpend: () => getSpend(),
    getTodaySpend: () => todaySpend(),
    modelLabel: () => modelLabel(),
    // The scan reads without tracking: it must never reset the two-window baseline of a chat.
    store: { list: () => store.list(), get: (id) => (state.demo ? store.get(id) : getConversation(id, { track: false })) },
    canResume: (conv) => !state.runs.has(conv.id) && !runningElsewhere(conv.id) && engine.canResume(conv),
    sounds,
    homeBase,
    morningEl: morningCard ? morningCard.el : null,
    onRendered: ({ needs }) => header.setAlert(needs.length),
    onHud: () => {
      renderPanelStatsSoon();
      updateCore();
    },
    actions: {
      talk: () => openVoice(),
      look: () => look(),
      // "Show Jarvis your screen" (Optics' screen look; Presence shows the key on a Mac only).
      screen: !state.demo && safe(() => screenLookSupported(), false) ? () => openOpticsScreen({ start: 'screen' }) : undefined,
      brief: () => briefMe(),
      // Standby (v7.4): the ambient screen; two claps or "Hey Jarvis" wake Jarvis. Not in the demo.
      standby: state.demo ? undefined : () => enterStandby(),
      openConversation: (id) => openConversation(id),
      resume: (id) => openThen(id, () => resume()),
      retry: (id, turnId) => openThen(id, () => {
        const turn = findTurn(turnId);
        if (turn) retry(turn);
      }),
      openSettings: (opts) => openSettings(opts),
      openSystems: () => openSystems(),
      openHistory: () => openHistory(),
      // v7.6: the home base tiles open the Home base sheet.
      openHomeBase: brain ? () => openHomeBase() : undefined,
      stopSensor: (kind) => {
        if ((kind === 'mic' || kind === 'all') && state.listening) {
          safe(() => state.listening.stop());
          toast('Microphone off.', { level: 'info', id: 'sensor-off' });
        }
        // WATCH stops Watch only; OPTICS turns the camera off (Optics, and a camera on another screen).
        const optics = currentOptics();
        if (kind === 'watch' && optics && optics.stopWatch) safe(() => optics.stopWatch());
        if (kind === 'optics' || kind === 'all') {
          const screensClosed = screensCtl ? safe(() => screensCtl.closeKind('camera'), 0) : 0;
          if (optics) safe(() => optics.close());
          if (optics || screensClosed) toast('Camera off.', { level: 'info', id: 'optics-off' });
        }
      },
      spendDismissed: () => {
        const s = getSettings();
        return uiGet(UI_KEYS.spendDismissed) === `${monthKey()}:${s.spendWarnUsd}`;
      },
    },
  });

  const header = createHeader({
    pills: presence.pills.el,
    tape: presence.tape.el,
    phoneTape: presence.phoneTape.el,
    demo: state.demo,
    voice: sttOk || ttsOk,
    onVoice: () => openVoice(),
    onHistory: () => openHistory(),
    onLibrary: () => openLibrary(),
    onSettings: () => openSettings(),
    onNewChat: () => newChat(),
  });

  // Apple Music: one preview player for every Music card. A preview never starts while a microphone
  // listens (dictation, the viewer's or Optics' mic, or Voice Mode listening or showing its 2-second
  // check) or while words from the chat's mic wait in the box to be sent (the chat's check), and it
  // stops Jarvis's own speech first.
  const musicPlayer = createMusicPlayer({
    canStart: () => {
      if (state.listening || otherMics > 0 || (voiceApi && safe(() => voiceApi.isListening(), false))) return 'listening';
      return safe(() => composer.counting(), false) ? 'checking' : true;
    },
    onStart: (item) => {
      stopSpeakingNow();
      if (voiceApi) safe(() => voiceApi.hush());
      if (item) safe(() => noteMusicPlayed(item)); // the wake routine offers what was played lately
    },
  });
  if (audioDevices) audioDevices.addSink(musicPlayer); // v8.1: previews play on the chosen speaker too
  const onMac = safe(() => isMacDevice(), false);
  // The hologram viewer's and Optics' own microphones: a preview playing would be heard as speech,
  // so it pauses before they listen, and none starts until they have stopped (the chat's mic and
  // Voice Mode see to it themselves).
  let otherMics = 0;
  const sttPausingPreviews = {
    ...sttDevice,
    startListening: (options = {}) => {
      // Jarvis stops talking first, as the chat mic does (v8.0): a live view line or a reply read
      // aloud through the Mac's speakerphone would otherwise be heard as the owner's question.
      safe(() => stopSpeakingNow());
      safe(() => musicPlayer.pauseForMic());
      let open = true;
      otherMics += 1;
      const closed = () => {
        if (!open) return;
        open = false;
        otherMics = Math.max(0, otherMics - 1);
      };
      try {
        return sttDevice.startListening({
          ...options,
          // stt.js calls onEnd exactly once, however listening ended.
          onEnd: (...args) => {
            closed();
            if (typeof options.onEnd === 'function') return options.onEnd(...args);
            return undefined;
          },
        });
      } catch (err) {
        closed();
        throw err;
      }
    },
  };

  const chat = createChat({
    musicPlayer,
    isMac: onMac,
    notify: (msg) => toast(msg, { level: 'info', id: 'music' }),
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
    // v7.8: the voice reading it aloud ("George · home base", "iPhone voice"…), beside its Stop.
    speakingVoice: (turnId) => (state.speaking && state.speaking.turnId === turnId ? labelOfVoiceNow() : null),
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
    onProtocol: (text, mode, p) => {
      const ok = send(text, mode);
      if (ok && p && p.id === 'morning-briefing') presence.noteBriefing(new Date());
      return ok;
    },
    onVoice: sttOk || ttsOk ? () => openVoice() : null,
    getSettings: () => getSettings(),
    sounds,
    getGreeting: () => greeting(),
    // Optics: a Look's frame card (and a pins row) reopens the frozen frame with its labels.
    onOpenOptics: (turn, seg) => reviewOptics(turn, seg),
    canReviewOptics: (turn, seg) => !!opticsFrameFor(turn, seg),
    ttsSupported: ttsOk,
    // Presence home (SPEC 2.4.4); the starter prompts are onboarding: first three conversations.
    home: presence.home,
    showStarters: () => state.demo || state.convCount < 3,
  });

  const composer = createComposer({
    mode: state.lastSettings.mode,
    micSupported: sttOk,
    // The camera key opens Optics (live camera); false = no camera API here, use the system camera.
    onCamera: () => (opticsAvailable() ? openOpticsScreen() : false),
    getSettings: () => getSettings(),
    onSend: (text, mode, extras) => send(text, mode, extras),
    // "Open this on my other screen", "float it", "bring it back": acted on here, free (Screens, v7),
    // also while Jarvis is working ("put mission control on screen 2").
    // Apple Music: "play Back in Black" is found here, free (no Claude request): a Music card.
    // "How's the home base?": the Jarvis Core answers, free (a local exchange; v7.5).
    // v7.6: "research … in the background", "what did the home base find?", "watch for …", "brief me":
    // the home base acts (free, local exchanges) while one is linked.
    // v8.1: the router picks the command, in the chat's order (routeChat); if it fails, the words
    // are a message, as for any words no command takes.
    onCommand: (text) => safe(() => routeChat(text), false),
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
  // Desktop awareness rail (SPEC 2.4.4): replaces Mission Control's empty "Standing by" panel; a
  // mission still takes the whole rail (Mission mode).
  const panelRail = presence.rail.el;
  const panel = h('aside', { class: 'panel', attrs: { 'aria-label': 'Mission Control' } }, panelMcHost, panelRail, panelStats, statsLauncher.el);
  const main = h('main', { class: 'main' }, banners, chat.el, composer.el);
  const body = h('div', { class: 'body' }, sidebar, sidebarScrim, main, panel);
  const shell = h('div', { class: 'shell' }, header.el, body);
  const bg = h('div', { class: 'app-bg', attrs: { 'aria-hidden': 'true' } }, h('div', { class: 'app-bg-grid' }), h('div', { class: 'app-bg-glow' }));

  root.replaceChildren(bg, shell, sheetLayer, toasts.el, live, presence.announcer);
  root.classList.add('app');
  root.dataset.demo = state.demo ? 'true' : 'false';
  initSheets({ layer: sheetLayer, shell });

  const toast = (msg, opts) => toasts.show(msg, opts);

  // ---- Jarvis's voice (v7.8, SPEC §26) ----------------------------------------------------------
  // The voice label (Voice Mode, a reply read aloud, Settings' Test) names the voice that actually
  // speaks; George from the home base is turned on once by itself (voice-auto.js) with a notice.
  const deviceOs = safe(() => parseUserAgent(navigator.userAgent, navigator.maxTouchPoints).os, 'other') || 'other';
  const speakerName = () => (voiceById(getSettings().naturalVoiceId) || voiceById('bm_george') || { name: 'George' }).name;
  const labelFor = (engine) => voiceLabel(engine, { voiceName: speakerName(), os: deviceOs });
  /** The sample a notice or Settings plays: through the router, inside the owner's tap (iOS). */
  function testVoice({ onVoice } = {}) {
    safe(() => unlockSpeech());
    const s = getSettings();
    const hr = new Date().getHours();
    const line = `Good ${hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'}, ${s.userName || 'sir'}. This is my voice, made on your home base.`;
    return new Promise((resolve) => {
      const off = typeof tts.onVoiceChange === 'function' ? tts.onVoiceChange((engine) => engine && typeof onVoice === 'function' && safe(() => onVoice(engine, labelFor(engine)))) : () => {};
      const done = () => {
        safe(() => off());
        resolve();
      };
      try {
        stopSpeakingNow();
        speak(line, { voiceURI: s.voiceURI, rate: s.voiceRate, onEnd: done });
      } catch {
        done();
      }
    });
  }
  const voiceNotice =
    senses && !state.demo
      ? safe(
          () =>
            createVoiceNotice({
              senses,
              getSettings,
              os: deviceOs,
              voiceName: speakerName,
              turnOff: () => setHomeBaseVoice(senses, false, { commit: saveSettings }),
              test: (o) => testVoice(o),
              openSettings: () => openSettings({ section: 'voice' }),
            }),
          null,
        )
      : null;
  if (voiceNotice) toasts.el.prepend(voiceNotice.el);
  const voiceAuto = senses
    ? createVoiceAuto({
        senses,
        getSettings,
        saveSettings,
        demo: () => state.demo || !sensesAllowed,
        onEnabled: () => voiceNotice && voiceNotice.show(),
      })
    : null;
  const checkVoiceAuto = (opts) => voiceAuto && safe(() => voiceAuto.check(opts));
  /** The voice speaking now, as the label shows it: { engine, label } or null. */
  function labelOfVoiceNow() {
    const engine = typeof tts.voiceNow === 'function' ? safe(() => tts.voiceNow(), null) : null;
    return engine ? { engine, label: labelFor(engine) } : null;
  }
  // A reply read aloud shows its voice beside Stop; it changes when George hands over mid-reply.
  if (typeof tts.onVoiceChange === 'function') safe(() => tts.onVoiceChange(() => state.speaking && chat.refreshSpeaking()));

  // ---- Screens (v7): another monitor, a floating panel, a window ---------------------------------
  // src/ui/screens/controller.js places things; this part tells it what the app shows and how to
  // show something here again (a screen that closes hands its content back).
  function findSegment(segmentId) {
    if (!segmentId || !state.conv) return null;
    for (const t of turnsOf(state.conv)) {
      const seg = segmentsOf(t).find((x) => x.id === segmentId);
      if (seg) return { turn: t, seg };
    }
    return null;
  }

  /** "This": the viewer on top (photo, blueprint, hologram), the Mission Control sheet, or a screen in the app. */
  function describeOpenViewer() {
    const inapp = screensCtl ? safe(() => screensCtl.inappTarget(), null) : null;
    if (inapp) return inapp;
    const photo = safe(() => currentPhoto(), null);
    if (photo && photo.src) return { kind: 'photo', ref: photo, title: photo.title };
    const bp = getBlueprintViewer();
    if (bp) {
      const at = findSegment(bp.segmentId);
      return {
        kind: 'blueprint',
        ref: { libraryId: bp.modelId || null, segmentId: bp.segmentId || null, conversationId: at ? state.conv.id : null, turnId: at ? at.turn.id : null },
        title: at ? at.seg.title || (at.seg.spec && at.seg.spec.title) || '' : '',
        live: !!(at && at.seg.status === 'building'),
      };
    }
    const holo = getHologramViewer();
    if (holo) {
      const st = safe(() => holo.getState(), null) || {};
      const at = findSegment(st.segmentId);
      return {
        kind: 'hologram',
        ref: { libraryId: st.libraryId || null, segmentId: st.segmentId || null, conversationId: at ? state.conv.id : null, turnId: at ? at.turn.id : null },
        title: st.title || '',
        live: st.status === 'building',
      };
    }
    // Optics (under a hologram it opened, above everything else): a Look on screen (frozen, with its
    // labels and answer) is "this"; otherwise the live camera.
    if (isOpticsOpen()) {
      const look = safe(() => currentOptics().frozenLook(), null);
      if (look && state.conv) return { kind: 'look', ref: { conversationId: state.conv.id, frameId: look.frameId }, title: look.question, live: !!look.analyzing };
      return { kind: 'camera', ref: {}, title: 'Optics', live: true };
    }
    if (mcSheet && state.mcSel && state.conv) return { kind: 'mission', ref: { conversationId: state.conv.id, turnId: state.mcSel.turnId, missionId: state.mcSel.missionId }, title: '' };
    return null;
  }

  /** Moving content out closes the in-app viewer that showed it (one live 3D view at a time). */
  function closeViewerFor(target) {
    const r = (target && target.ref) || {};
    const same = (a, b) => !!a && a === b;
    if (target.kind === 'hologram') {
      const v = getHologramViewer();
      const st = v ? safe(() => v.getState(), null) || {} : null;
      if (v && (same(st.libraryId, r.libraryId) || same(st.segmentId, r.segmentId))) {
        safe(() => v.close());
        return true;
      }
    } else if (target.kind === 'blueprint') {
      const v = getBlueprintViewer();
      if (v && (same(v.modelId, r.libraryId) || same(v.segmentId, r.segmentId))) {
        safe(() => v.close());
        return true;
      }
    } else if (target.kind === 'mission' && mcSheet) {
      safe(() => mcSheet.sheet.close('screens'));
      return true;
    } else if (target.kind === 'look' && isOpticsOpen()) {
      // v8.1 (E5): a Look on the other screen is its picture, labels and answer, no camera: Optics stays
      // open and live here, and the Look's card folds ("On your other screen"). Closing that screen
      // (or "bring it back") hands the Look back to its card.
      return !!safe(() => currentOptics().sendAway(r.frameId || null), false);
    } else if (target.kind === 'camera' && isOpticsOpen()) {
      // The camera moves to the other screen: Optics closes here, so one view holds the camera.
      safe(() => currentOptics().close());
      return true;
    }
    return false;
  }

  /** Show content in the main window: a screen handed it back, or a phone shows it full screen. */
  function showScreenInApp(target, { reason, back = false } = {}) {
    const r = (target && target.ref) || {};
    if (target.kind === 'look') {
      // v8.1 (E5): Optics open (the Look went to the other screen from it): its card opens again, the
      // camera still live. Optics closed: the Look again, frozen in Optics with its labels (camera off):
      // "bring it back", a screen that hands it back, or a phone (where Optics already shows it).
      if (isOpticsOpen()) {
        if (r.frameId) safe(() => currentOptics().bringBack(r.frameId));
        return;
      }
      if (state.conv && state.conv.id === r.conversationId && r.frameId) reviewOptics({ optics: { frameId: r.frameId } }, null);
      return;
    }
    if (target.kind === 'camera') {
      // Optics again, on "bring it back" or on a phone; a camera screen that is just closed leaves the
      // camera off (closing it is how the owner turns that camera off).
      if ((reason === 'inapp' || back) && opticsAvailable()) openOpticsScreen({ voice: !!voiceApi });
      return;
    }
    if (target.kind === 'hologram' || target.kind === 'blueprint') {
      const at = findSegment(r.segmentId);
      if (at) openVisualSegment(at.turn, at.seg);
      else if (r.libraryId) Promise.resolve(lib.get(r.libraryId)).then((item) => item && openLibraryItem(item)).catch(() => {});
      return;
    }
    if (target.kind === 'mission') {
      const turn = findTurn(r.turnId);
      if (turn) openMission(turn, r.missionId);
      else if (r.conversationId) showInChat(r.conversationId, r.turnId);
      return;
    }
    if (target.kind === 'answer' && reason === 'handback' && r.conversationId) showInChat(r.conversationId, r.turnId);
  }

  screensCtl = safe(
    () =>
      createScreens({
        getConversation: () => state.conv,
        getLiveTurn: (conversationId, turnId) => {
          const entry = state.runs.get(conversationId);
          const turn = entry && entry.run ? entry.run.turn : null;
          return turn && turn.id === turnId ? turn : null;
        },
        describeOpen: () => describeOpenViewer(),
        closeInApp: (target) => closeViewerFor(target),
        showInApp: (target, opts) => showScreenInApp(target, opts),
        getLibraryItem: (id) => lib.get(id),
        snapshot: (spec, size) => renderHologramImage(spec, { ...size, type: 'image/png' }),
        toast: (msg, opts) => toast(msg, opts),
        // A camera on another screen lights the OPTICS pill here (one tap turns it off).
        onChange: () => updateCore(),
        // Jarvis's open_screen may move a camera that is on, never turn one on (controller.js).
        cameraLive: () => opticsCameraBridge.isLive(),
        // v8.1 (windows, D6): Jarvis floating ("float yourself"): his core, the state word, the words heard.
        jarvisState: () => floatingJarvisState(),
      }),
    null,
  );

  /** A screen command typed in the composer or a viewer: acted on here (true), else false. */
  function screenCommand(text, extras, source) {
    if (!screensCtl) return false;
    if (extras && Array.isArray(extras.attachments) && extras.attachments.length) return false;
    const res = safe(() => screensCtl.command(String(text || ''), { source }), null);
    if (!res || !res.handled) return false;
    res.done.then((o) => {
      const ok = o && (o.status === 'opened' || o.status === 'closed');
      // A one-tap button or the explainer is on screen already; a phone shows the screen itself.
      const shown = o && (o.status === 'needs_tap' || o.status === 'needs_permission' || (o.status === 'opened' && o.mode === 'inapp'));
      if (source !== 'viewer' && !shown) toast(screenMessage(o), { level: ok ? 'success' : 'warn', id: 'screens' });
    });
    return res;
  }

  // ---- windows (v8.1, SPEC §31): several windows by voice, "pull this up in Chrome" --------------------
  // The words are src/ui/commands/windows.js's (registered with the router below); this part gives them
  // what the app knows: the newest reply's links, what "this" is, the Chrome link, and the viewers.

  /** The newest reply's links, in order ([{ url, title }]; none when it has none). */
  function newestReplyLinks() {
    const turns = state.conv ? turnsOf(state.conv) : [];
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const t = turns[i];
      if (t.role !== 'jarvis') continue;
      return linksOf(segmentsOf(t).filter((x) => x.kind === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n\n'));
    }
    return [];
  }

  /** The owner's last question in the open chat (its first line). */
  function lastOwnerQuestion() {
    const turns = state.conv ? turnsOf(state.conv) : [];
    for (let i = turns.length - 1; i >= 0; i -= 1) if (turns[i].role === 'user' && typeof turns[i].text === 'string') return turns[i].text.split('\n')[0];
    return '';
  }

  /** What "this" can be right now: resolveThis's inputs (src/lib/this-target.js, contract (c)). */
  function thisInputs() {
    const inapp = screensCtl ? safe(() => screensCtl.inappTarget(), null) : null;
    const linkWin = screensCtl ? safe(() => screensCtl.shown('link'), null) : null;
    const linkRef = inapp && inapp.kind === 'link' ? inapp.ref : linkWin ? linkWin.ref : null;
    const optics = currentOptics();
    const frozen = optics ? safe(() => optics.frozenLook(), null) : null;
    const snap = frozen && state.conv ? safe(() => lookSnapshot(state.conv, frozen.frameId), null) : null;
    const labels = snap && snap.data && Array.isArray(snap.data.pins) ? snap.data.pins.map((p) => p.text) : [];
    const live = optics ? safe(() => optics.liveView, null) : null;
    let hologram = null;
    const holo = getHologramViewer();
    if (holo) {
      const st = safe(() => holo.getState(), null) || {};
      const part = st.selected ? (safe(() => holo.parts(), []) || []).find((p) => p && p.id === st.selected) : null;
      hologram = { title: st.title || '', part: part ? part.name : '' };
    } else if (screensCtl) {
      const w = safe(() => screensCtl.shown('hologram'), null);
      const part = w && w.selected && Array.isArray(w.parts) ? w.parts.find((p) => p && p.id === w.selected) : null;
      if (w) hologram = { title: w.title || '', part: part ? part.name : '' };
    }
    return {
      linkOnScreen: linkRef && linkRef.url ? { url: linkRef.url, title: linkRef.title || '' } : null,
      look: labels.length ? { labels, selected: null } : null,
      liveSummary: live && live.on && typeof live.summary === 'string' ? live.summary : '',
      hologram,
      reply: { links: newestReplyLinks() },
      lastQuestion: lastOwnerQuestion(),
    };
  }

  /**
   * What Jarvis floating shows (D6): Voice Mode's own state while it is open (listening, the words heard,
   * thinking, speaking), else the app's core and Presence's state word.
   */
  function floatingJarvisState() {
    const v = voiceApi ? safe(() => voiceInfo, null) : null;
    if (v && typeof v.state === 'string') {
      const core = v.listening ? 'listening' : v.state === 'error' ? 'error' : v.state === 'idle' ? 'idle' : v.state;
      const words = { listening: 'LISTENING', speaking: 'SPEAKING', thinking: 'THINKING', idle: 'VOICE MODE', error: 'CHECK REPLY' };
      return { core, word: words[core] || core.toUpperCase(), heard: v.listening ? v.heard || '' : '' };
    }
    return { core: root.dataset.core || 'idle', word: safe(() => presence.word().word, ''), heard: '' };
  }

  /** "Close everything": the main window's viewers close too (Voice Mode stays). */
  function closeViewers() {
    const sheet = getBlueprintViewer();
    if (sheet) safe(() => sheet.close());
    const holo = getHologramViewer();
    if (holo) safe(() => holo.close());
    const optics = currentOptics();
    if (optics) safe(() => optics.close());
    if (mcSheet) safe(() => mcSheet.sheet.close('screens'));
  }

  /**
   * D3: words for the hologram while it is in a window and no viewer is open here act in that window
   * ({ handled, command }); null when no window shows it or the window can't run that command.
   */
  function windowHologramCommand(text) {
    if (!screensCtl || getHologramViewer() || getBlueprintViewer()) return null;
    const w = safe(() => screensCtl.shown('hologram'), null);
    if (!w) return null;
    const cmd = safe(() => matchHologramCommand(String(text || ''), w.parts || [], { selected: w.selected || null }), null);
    if (!cmd) return null;
    const res = safe(() => screensCtl.commandIn('hologram', cmd), null);
    return res && res.handled ? { handled: true, command: cmd } : null;
  }

  /** "Pull this up in Chrome": a tab, a window beside Jarvis, or the Jarvis window (src/ui/browser-tab.js). */
  const browserTabs = createBrowserTabs({
    // app.chromeLink (contract (f), made by the Chrome link's own wiring), when there is one.
    chromeLink: () => safe(() => (typeof chromeLink !== 'undefined' && chromeLink ? chromeLink.api || chromeLink : null), null),
    screens: screensCtl,
    // Optics (its live view included) or a walkthrough on screen: the page goes beside Jarvis.
    onScreen: () =>
      safe(() => {
        const tour = routerState('voice').tour;
        return isOpticsOpen() || !!(tour && tour.active);
      }, false),
    hidden: () => !!document.hidden,
    standalone: () => safe(() => detectScreenEnv(window).standalone, false),
    // Voice Mode keeps listening while Jarvis is covered (mac-hf's A1 setting, on a computer).
    listensHidden: () => safe(() => getSettings().handsFreeBackground === true, false),
    toast: (msg, opts) => toast(msg, opts),
  });

  // ---- Apple Music (find & open, free) --------------------------------------------------------
  /**
   * "Play Back in Black" (typed in the composer or a viewer, or said or typed in Voice Mode):
   * searched in Apple Music on this device, with no Claude request. The chat gets a local exchange
   * (the owner's words, Jarvis's line and the Music card; src/engine/music.js appendMusicTurn), in
   * the open conversation or a new one. "Stop the music" stops a preview. Returns null (not a music
   * command, or this chat is busy: the words wait like any message) or { handled: true, done }
   * (done: Promise<{ ack, segment }>). `found`: what was already found for these words (the wake
   * routine's offer, looked up by id): shown without searching again.
   */
  function musicCommand(text, { source = 'typed', spoken = false, found = null } = {}) {
    const words = String(text || '').trim();
    const cmd = safe(() => matchMusicCommand(words), null);
    if (!cmd) return null;
    if (cmd.action === 'stop') {
      const was = musicPlayer.isPlaying();
      musicPlayer.stop();
      if (!spoken) toast(was ? 'Preview stopped.' : 'Nothing is playing.', { level: 'info', id: 'music' });
      return { handled: true, stop: true, done: Promise.resolve({ ack: was ? 'Stopped.' : 'Nothing is playing.' }) };
    }
    let conv = state.conv;
    // One turn at a time in a chat: while Jarvis is answering in it, the words wait.
    if (conv && (state.runs.has(conv.id) || runningElsewhere(conv.id))) return null;
    const fresh = !conv;
    if (!conv) conv = engine.newConversation();
    clearFollowups(); // the suggestions under the last reply are moot now
    const seg = musicSegment({ ok: true, items: [] }, { query: cmd.query, kind: cmd.kind, local: true });
    seg.status = 'searching';
    let added;
    try {
      added = appendMusicTurn(conv, { text: words, line: '', segment: seg, spoken, mode: composer.getMode() });
    } catch (err) {
      console.error('[jarvis] the music turn failed:', err);
      return null;
    }
    const { turn, textSegment } = added;
    if (fresh || state.conv !== conv) setConversation(conv);
    else chat.sync();
    chat.scrollToBottom(false);
    if (!safe(() => isVoiceModeOpen(), false)) safe(() => sounds.cue('send'));
    if (state.layout === 'phone' && source === 'typed') composer.blur();
    const known = found && found.ok && Array.isArray(found.items) && found.items.length ? found : null;
    const done = (known ? Promise.resolve(known) : searchMusic(cmd.query, { kind: cmd.kind, limit: 5, title: cmd.title, artist: cmd.artist }))
      .catch(() => ({ ok: false, error: 'network', message: 'Apple Music could not be reached.' }))
      .then((outcome) => {
        const filled = musicSegment(outcome, { query: cmd.query, kind: cmd.kind, local: true });
        Object.assign(seg, { ...filled, id: seg.id });
        const line = musicLine(outcome, { action: cmd.action, query: cmd.query, voice: spoken });
        textSegment.text = line;
        turn.endedAt = Date.now();
        conv.updatedAt = turn.endedAt;
        if (state.conv === conv) {
          chat.refresh(turn.id);
          chat.scrollToBottom(false);
        }
        Promise.resolve(store.save(conv))
          .then(() => scheduleHistoryRefresh())
          .catch((err) => console.error('[jarvis] saving the music turn failed:', err));
        // "Play a preview of …" typed: the preview starts (never while a mic listens).
        const top = seg.items[0];
        if (top) safe(() => noteMusicPlayed(top)); // the wake routine offers what was played lately
        if (cmd.action === 'preview' && !spoken && top && top.previewUrl) musicPlayer.play(top);
        return { ack: line, segment: seg, outcome };
      });
    updateAll();
    return { handled: true, done };
  }

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
    // Optics (the camera): Watch, a Look being answered (a turn of the open conversation), the live camera.
    if (isOpticsOpen()) {
      if (opticsLive.watch) return ['watching', 'Watching'];
      if (opticsLive.liveView) return ['watching', 'Live view'];
      if (state.conv && state.runs.has(state.conv.id)) return ['analyzing', 'Analyzing…'];
      if (opticsLive.camera) return ['optics', 'Optics live'];
    }
    if (state.runs.size) {
      const { anyMission, n } = activeMissionAgents();
      if (anyMission) return ['working', n ? `Working · ${n} agent${n === 1 ? '' : 's'}` : 'Working…'];
      return ['thinking', 'Working…'];
    }
    if (!state.online) return ['offline', 'Offline'];
    if (Date.now() < state.errorUntil) return ['error', 'Check reply'];
    if (cameraOnScreen()) return ['optics', 'Optics live']; // the camera on another screen (Screens)
    return ['idle', 'Online'];
  }

  /**
   * A screen opened from here runs the camera (another monitor, a floating panel, a window): its
   * camera is live or starting (or has not said yet). One turned off with its own Camera off, paused
   * while its window is hidden, or in error does not light the indicator.
   */
  function cameraOnScreen() {
    return !!(screensCtl && safe(() => screensCtl.cameraOn(), false));
  }

  // Presence's state words ANALYZING and WATCHING are the cores' thinking and optics.
  const CORE_OF = { analyzing: 'thinking', watching: 'optics' };
  let standby = null; // Standby and wake (v7.4): created below with the Voice Mode wiring
  const updateCore = raf(() => {
    const [wordState] = computeCore();
    const coreState = CORE_OF[wordState] || wordState;
    const { n } = activeMissionAgents();
    const turns = [];
    const titles = [];
    for (const entry of state.runs.values()) {
      if (entry.run && entry.run.turn) turns.push(entry.run.turn);
      titles.push(entry.conv && typeof entry.conv.title === 'string' ? entry.conv.title : '');
    }
    // The OPTICS pill and beads: Optics' live camera, or the camera on another screen (Screens).
    const cameraScreen = cameraOnScreen();
    const watchLeftMs = opticsLive.watchEndsAt ? Math.max(0, opticsLive.watchEndsAt - Date.now()) : null;
    presence.update({ coreState: wordState, agents: n, listening: !!state.listening, speaking: !!state.speaking, online: state.online, convId: state.conv ? state.conv.id : null, turns, titles, optics: opticsLive.camera || cameraScreen, watchLeftMs });
    const word = presence.word();
    header.setState(coreState, word.word, word.tone);
    chat.setCoreState(coreState);
    root.dataset.core = coreState;
    if (standby) safe(() => standby.update());
  });

  // Optics' live state (deps.onLiveChange): the camera, and Watch with its end (the state word and the
  // WATCH pill count it down once a second).
  const opticsLive = { camera: false, watch: false, watchEndsAt: null, liveView: false };
  let watchTicker = 0;
  function onOpticsLive({ camera, watch, watchEndsAt, liveView } = {}) {
    opticsLive.camera = !!camera;
    opticsLive.watch = !!watch;
    opticsLive.liveView = !!liveView;
    opticsLive.watchEndsAt = opticsLive.watch && Number.isFinite(watchEndsAt) ? watchEndsAt : null;
    clearInterval(watchTicker);
    watchTicker = opticsLive.watchEndsAt ? setInterval(() => updateCore(), 1000) : 0;
    updateCore();
  }

  // ---- Presence data and actions ----------------------------------------------------------------
  /**
   * Today's spend (USD): every cost of the day (replies, Watch frames, follow-up suggestions) as
   * spend.js adds it up, so it agrees with the month figure. What Records logged today plus the
   * replies still running covers a day that began before that total existed (the larger wins).
   */
  function todaySpend() {
    const stats = safe(() => getStats(), null);
    const day = stats && stats.byDay ? stats.byDay[dayKey(Date.now())] : null;
    let usd = day ? Number(day.costUsd) || 0 : 0;
    for (const entry of state.runs.values()) usd += Number(entry.run && entry.run.turn && entry.run.turn.costUsd) || 0;
    return Math.max(usd, safe(() => getTodaySpend(), 0));
  }
  function modelLabel() {
    const s = getSettings();
    const model = (MODELS[s.leadModel] && MODELS[s.leadModel].short) || s.leadModel;
    const depth = (DEPTHS[s.depth] && DEPTHS[s.depth].label) || s.depth;
    return `${model} · ${String(depth).toLowerCase()}`;
  }
  /** Open a conversation, then act on it (Needs-you: Resume, Retry). */
  async function openThen(id, fn) {
    if (!state.conv || state.conv.id !== id) await openConversation(id);
    if (state.conv && state.conv.id === id) safe(fn);
  }
  /** Brief me: the briefing protocol for the time of day, in a fresh conversation. */
  function briefMe() {
    // v7.6: with a home base linked and its briefing new or fresh (the morning card), the key and
    // the rail's suggestion open that briefing (free) instead of writing another with Claude.
    if (homeBaseBriefingFresh()) {
      safe(() => presence.noteBriefing(new Date()));
      openHomeBase({ tab: 'briefing' });
      return true;
    }
    const p = safe(() => getProtocol('morning-briefing'), null);
    if (!p) return false;
    const text = safe(() => p.buildPrompt({ input: '', settings: getSettings(), now: new Date() }), '');
    if (!text) return false;
    if (state.conv && turnsOf(state.conv).length && !currentRunning()) newChat();
    const ok = send(text, p.mode || 'swarm');
    if (ok) presence.noteBriefing(new Date());
    return ok;
  }
  /** The linked home base has a briefing the owner hasn't seen yet, or one made in the last 3 hours. */
  function homeBaseBriefingFresh() {
    if (!brain || !brain.base()) return false;
    if (safe(() => brain.morning(), null)) return true;
    const st = safe(() => brain.getState(), null);
    const at = st && st.phase === 'ready' && st.brain && st.brain.briefing ? st.brain.briefing.lastAt : null;
    const age = typeof at === 'number' && at > 0 ? Date.now() - at : NaN;
    return age >= -5 * 60 * 1000 && age < FRESH_BRIEFING_MS;
  }
  /**
   * Look: the live camera (Optics) where it can run; otherwise (the demo, no camera API) the system
   * camera, which is also Optics' fallback when the camera is missing or denied. Call from the tap.
   */
  function look() {
    if (opticsAvailable() && openOpticsScreen()) return;
    composer.takePhoto();
  }
  /** Optics can run here: not the demo, and a camera API (getUserMedia in a secure context). */
  function opticsAvailable() {
    return !state.demo && safe(() => cameraSupported(), false);
  }

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
      const before = state.convCount;
      state.convCount = Array.isArray(items) ? items.length : 0;
      // The starter prompts are onboarding (first three conversations): rebuild the home when the
      // window opens or closes, never while a protocol's input row is in use.
      if ((before < 3) !== (state.convCount < 3) && chat.isEmpty() && !(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName))) chat.rebuildEmpty();
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
    // Words from the mic still waiting to be sent belong to the chat they were said in: they stay in
    // the box, unsent.
    if (conv !== state.conv) safe(() => composer.cancelCountdown());
    state.conv = conv || null;
    // A turn saved as running with no live run here was cut off (the app was closed or killed
    // mid-reply). Asking the engine settles it (status "interrupted", agents and missions too)
    // before anything renders, so no mission card shows a stale RUNNING next to "Resume".
    if (state.conv && !state.runs.has(state.conv.id) && !runningElsewhere(state.conv.id)) safe(() => engine.canResume(state.conv));
    chat.setConversation(state.conv);
    history.setActive(state.conv ? state.conv.id : null);
    selectLatestMission();
    if (remember) rememberCurrent();
    if (state.conv) presence.noteSeen(state.conv.id);
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
    presence.forget(id);
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
    const onScreen = viewerTurnContext(); // v8.1: a hologram on screen (a viewer's words, Voice Mode over it): Claude knows what glows
    if (onScreen) input.viewer = onScreen;
    // v8.1 (E0): an answer asked while the live view is on goes through its $1-an-hour gate, as a quick
    // answer (agents are outside the gate); a research mission is outside it (its offer says so).
    if (!takeOutsideLiveView(extras, clean)) {
      input.gate = liveTurnGate();
      if (liveViewOn()) input.mode = 'quick';
    }
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
  let voiceOwnerStarted = false; // v8.1 (A1): the owner opened it (a tap, a key, a wake): it may go on hidden
  // MAC-R2-3: the hidden count (A6) across sessions: woken by claps in the background, a session goes on from it, so a
  // TV's false double bang can't buy 3 more paid questions each time. "Hey Jarvis", a tap or key, or Jarvis on screen
  // start it again (Voice Mode, and here when the page shows).
  let hiddenCount = { asked: 0, braked: false };
  safe(() =>
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) hiddenCount = { asked: 0, braked: false };
    }),
  );
  let voiceInfo = null; // its listening state, mirrored on the mic button of a hologram viewer over it
  // The hologram last shown over this Voice Mode ({ segment, conversationId, turnId }): once its
  // viewer is closed, a command for it ("expand it", "show the separator") opens it again, free.
  let lastVoiceHologram = null; // REOPEN_ACTIONS (command-router.js): the commands that open it again

  function startTurnForVoice(text, { mode, blueprintFor, attachments, optics, newChat: freshChat = false } = {}) {
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
    // So does a Look in a chat from before the camera (no pin_labels): labels need a new chat.
    const oldChat = !state.demo && !!state.conv && turnsOf(state.conv).length > 0 && !hasVisualTools(state.conv, 'show_hologram') && !state.runs.has(state.conv.id);
    const oldForLook = !oldChat && !!optics && preOpticsChat();
    // The wake routine's "brief me": the briefing in a chat of its own, like the Brief me key.
    const briefingChat = !!freshChat && !!state.conv && turnsOf(state.conv).length > 0 && !state.runs.has(state.conv.id);
    if (oldChat || oldForLook || briefingChat) setConversation(null);
    if (!send(text, mode, extras)) throw new Error('I couldn’t start that request.');
    if (oldChat && voiceApi) safe(() => voiceApi.note('New chat: older chats can’t show holograms.'));
    if (oldForLook && voiceApi) safe(() => voiceApi.note(PRE_OPTICS_NOTE));
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
    // The words to listen for and prefer among the readings heard: the open hologram's part names
    // (and their other names), else those of the hologram shown last over Voice Mode.
    vocabulary: () => ({ parts: voicePartNames() }),
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
    note: (text, opts) => {
      const viewer = getHologramViewer();
      if (viewer) safe(() => viewer.note(text, opts));
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

  function voicePartNames() {
    const viewer = getHologramViewer();
    if (viewer && typeof viewer.partNames === 'function') return safe(() => viewer.partNames(), []);
    const seg = lastVoiceHologram && lastVoiceHologram.segment;
    const parts = seg && isObj(seg.spec) && Array.isArray(seg.spec.parts) ? seg.spec.parts : [];
    const out = [];
    for (const p of parts) {
      if (!isObj(p)) continue;
      for (const n of [p.name, ...(Array.isArray(p.aka) ? p.aka : [])]) if (typeof n === 'string' && n.trim() && !out.includes(n.trim())) out.push(n.trim());
    }
    return out.slice(0, 120);
  }

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
    // v8.1 (windows, D3): the hologram is in a window and none is here: its words act there.
    const inWindow = !holo && !sheet ? windowHologramCommand(text) : null;
    if (inWindow) return inWindow;
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

  /**
   * Open Voice Mode. Call synchronously inside a click/keydown (iOS mic and speech rules). The wake
   * routine (Standby, v7.4) opens it without a tap: { wake } carries the routine's hooks.
   */
  function openVoice({ wake = null, ownerStarted = true } = {}) {
    voiceOwnerStarted = ownerStarted !== false; // every way it opens today is the owner's own (a tap, a key, a wake)
    refreshCameraPermission();
    if (senses && !state.demo) safe(() => senses.prime({ warm: true })); // hearing / voice through the home base: a fresh reading, warmed up
    checkVoiceAuto(); // v7.8: George from the home base, on once by itself (when it couldn't be asked at launch)
    stopSpeakingNow();
    if (state.listening) safe(() => state.listening.stop());
    safe(() => composer.cancelCountdown()); // Voice Mode takes over: words waiting in the box stay there
    const entry = state.conv && state.runs.get(state.conv.id);
    try {
      voiceApi = openVoiceMode({
        getSettings,
        saveSettings,
        startTurn: startTurnForVoice,
        createCore,
        stt: state.demo ? stt : listening,
        tts,
        markdownToPlainText,
        sounds: voiceSounds,
        // Its own owner: closing Voice Mode must not let the screen sleep while a run continues.
        wakeLock: { keepAwake: () => keepAwake('voice'), allowSleep: () => allowSleep('voice') },
        activeRun: entry ? entry.run : null,
        // Optics: Look in the dock opens the camera over Voice Mode.
        // Look: the words of a "what am I looking at?" that had to wait for this tap (iPhone) are
        // looked at as soon as the camera is live.
        look: { supported: () => !state.demo && safe(() => cameraSupported(), false), open: () => openOpticsForVoiceLook() },
        mode: () => composer.getMode(),
        visuals: voiceVisuals,
        // v8.1: the command router, with the app's state of the moment (Voice Mode adds its own part).
        router: {
          route: (readings, local, opts) => commandRouter.route(readings, routerState('voice', local), opts),
          run: (hit, ctx) => commandRouter.run(hit, ctx),
        },
        // Standby (v7.4): "Jarvis, standby" / "go to sleep" closes Voice Mode into Standby.
        standby: state.demo ? null : {},
        wake,
        // v8.1 (A1, SPEC §28.1): on a computer, a session the owner started goes on while Jarvis is hidden.
        listenWhileHidden: () => handsFreeHidden(),
        // MAC-R2-1: while it can hear the owner or is answering (not while it merely sits open), a Standby in another
        // Jarvis window doesn't wake on the same words.
        onActive: (on, o) => voiceBusy && !state.demo && safe(() => voiceBusy.set('voice', on, o || {})),
        // MAC-R2-3: the hidden count, kept across sessions.
        hiddenCount: {
          get: () => hiddenCount,
          set: (c) => {
            hiddenCount = { asked: Math.max(0, Number(c && c.asked) || 0), braked: !!(c && c.braked) };
          },
        },
        ...devVoiceOptions(), // v8.1 tests: a shorter hold
        // Real mic bands for the core's voice band (SPEC 2.4.13). Not on iOS yet: Safari's speech
        // recognizer may hold the mic, so a second stream must be tested on a device first.
        // v8.1: on the microphone chosen for questions (Settings → Voice → Microphone and speaker).
        createMicBands: safe(() => isIOS(), false) ? null : audioDevices ? (o) => createMicBands({ ...o, getUserMedia: (c) => audioDevices.getQuestionMedia(c) }) : createMicBands,
        // Screens (v7): spoken "put it on my other screen" acts at once; Jarvis says a short line.
        screens: {
          command: (text) => {
            const res = screensCtl ? safe(() => screensCtl.command(String(text || ''), { source: 'voice' }), null) : null;
            return res && res.handled ? { handled: true, done: res.done.then((o) => ({ ack: screenAck(o), outcome: o })) } : null;
          },
        },
        // Home base (v7.5): "how's the home base?" said or typed here; Jarvis says the Core's answer (free).
        homeBase: homeBase ? { command: (text) => homeBaseFromVoice(text) } : null,
        // v7.8: the label of the voice speaking ("George · home base", "iPhone voice"…).
        voiceLabel: (engine) => labelFor(engine),
        // Apple Music: "play Back in Black" said here is found at once (free) and shown as a Music card.
        music: {
          command: (text, extra) => musicCommand(text, { source: 'voice', spoken: true, found: (extra && extra.found) || null }),
          card: (seg) => {
            const view = createMusicCardView({
              player: musicPlayer,
              isMac: onMac,
              notify: (m) => voiceApi && safe(() => voiceApi.note(m)),
              testid: 'voice-music-card',
              micHint: 'Tap the core to stop listening first.',
            });
            view.update(seg);
            return view;
          },
          onListen: () => musicPlayer.pauseForMic(),
          // Jarvis starts speaking (a line, an answer): a preview playing would play over him.
          onSpeak: () => {
            if (musicPlayer.isPlaying()) musicPlayer.pause();
          },
        },
        onClose: (info) => {
          voiceApi = null;
          voiceInfo = null;
          withdrawCameraNote(); // PRIVACY-2: what was asked for in this session goes with it
          safe(() => chromeVoice && chromeVoice.voiceChanged()); // v8.1 chrome-voice: its prompts go to notifications
          lastVoiceHologram = null;
          // Back to Standby: "go to sleep", or the end of a conversation Standby started (Settings).
          const reason = info && info.reason;
          // v8.1: a sheet the owner asked for by voice ("open settings") is what they look at next.
          const woken = !!(info && info.wakeSession) && safe(() => getSettings().wakeReturn !== false, true);
          const back = reason === 'standby' || (reason !== 'command' && woken);
          // MAC-2: ...but a woken session never leaves Standby for good: it comes back after the sheet. MAC-R2-2: so
          // does a conversation the owner started by a tap while that Standby still waited to come back.
          const waiting = !back && !woken && !state.demo && !!standby && safe(() => standby.isAwaiting(), false) && safe(() => getSettings().wakeReturn !== false, true);
          const afterSheet = ((reason === 'command' && woken) || waiting) && !state.demo;
          setTimeout(() => {
            if (back && !state.demo) enterStandby({ again: true });
            else if (afterSheet && standby && safe(() => standby.isAwaiting(), false)) returnAfterSheet();
            else if (standby) safe(() => standby.release());
          }, 0);
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
      safe(() => chromeVoice && chromeVoice.voiceChanged()); // v8.1 chrome-voice: its prompts and cards come to Voice Mode
    } catch (err) {
      console.error('[jarvis] voice mode failed:', err);
      toast('Voice mode couldn’t start in this browser.', { level: 'warn' });
    }
  }

  // ---- Standby and wake (v7.4, SPEC §22) ---------------------------------------------------------
  // Standby: the ambient screen. While it is open Jarvis listens on THIS device for two claps and,
  // once its download is on, for "Hey Jarvis"; nothing leaves the device until he is woken. Waking
  // opens Voice Mode with the wake routine (the greeting, an Apple Music card, the briefing for the
  // time of day): the routine asks Claude nothing; only what the owner asks next costs. On a phone
  // listening pauses while Jarvis is not on screen; on a Mac it goes on in a background tab.
  const phoneLike = safe(() => isIOS() || isAndroid() || (isTouch() && window.matchMedia('(max-width: 1024px)').matches), false);
  // v8.1 (A3, SPEC §26 note): on a computer the voices go on while Jarvis is hidden, so their watchdogs count that
  // time too (a stall there hands over in about 4 s); an iPhone or iPad keeps today's rule (iOS pauses them).
  safe(() => deviceTts.setPausesWhenHidden(phoneLike));
  safe(() => naturalPausesWhenHidden(phoneLike));

  /**
   * v8.1 (A1, SPEC §28.1): Voice Mode goes on listening and speaking while Jarvis is hidden: a computer, Settings →
   * Voice → Wake Jarvis → "Keep talking when Jarvis is in the background (Mac)" on (the default), and a session the
   * owner started. Nothing else ever opens the microphone for questions.
   */
  function handsFreeHidden() {
    return !phoneLike && safe(() => getSettings().handsFreeBackground !== false, false) && voiceOwnerStarted;
  }

  /**
   * v8.1 dev and test override ('jarvis.dev.voice' JSON { holdCapMs }): a held session's cap, shorter only (2 s to
   * its 2 minutes). On localhost it also gives tests window.__jarvisVoice { hold(reason), release(reason) } for the
   * open Voice Mode (nothing in the app holds a session yet besides a tour).
   */
  function devVoiceOptions() {
    try {
      const raw = JSON.parse(localStorage.getItem('jarvis.dev.voice') || 'null');
      const v = raw && typeof raw === 'object' ? Number(raw.holdCapMs) : Number.NaN;
      if (!Number.isFinite(v)) return {};
      const host = location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        window.__jarvisVoice = { hold: (r) => !!voiceApi && safe(() => (voiceApi.hold(r), true), false), release: (r) => !!voiceApi && safe(() => (voiceApi.release(r), true), false) };
      }
      return { holdCapMs: Math.min(120000, Math.max(2000, v)) };
    } catch {
      return {};
    }
  }

  // v8.1 (lead decision D3): the lines said before the wake greeting. wakePending.add(fn, { waits }):
  // fn() -> a line or null, asked at each wake; waits: it asks something and waits for the answer (Chrome's
  // question), said first. The command modules get it as deps.wakePending (src/lib/wake/pending.js).
  const wakePending = createWakePending();
  // mac-dev (A5): "I’m on the Mac’s speakers; the speakerphone isn’t connected.", once per absence.
  wakePending.add(() => audioWakeLine());
  standby = createStandby({
    getSettings,
    onSettingsChange,
    createCore,
    wakeLock: { keepAwake: () => keepAwake('standby'), allowSleep: () => allowSleep('standby') },
    createCapture: (o) => createStandbyCapture({ ...o, ...captureOn('wake') }),
    createWakeWord: () => (wakeStubAllowed() ? createWakeWordStub() : createWakeWord()),
    statusLine: () => safe(() => String(presence.home.situationEl.textContent || '').trim(), ''),
    stateWord: () => safe(() => presence.word().word, ''),
    chronometer: (d) => chronometer(d),
    onWake: ({ trigger }) => wakeUp(trigger),
    onExit: () => updateAll(),
    unlock: (o) => safe(() => unlockSpeech(o)), // v7.8.1: { tap: false } when Standby is entered again
    pauseWhenHidden: phoneLike,
    isIOS: safe(() => isIOS(), false),
    // v8.1: the pill names the chosen microphone, the capture follows it, the one-time Bluetooth line.
    audio: audioDevices ? audioDevices.standbyHooks() : null,
    // v8.1 (A9, SPEC §28.5): one Jarvis per Mac listens on Standby (a Web Lock; "Use this window" moves it). Not on a
    // phone (MAC-10): Standby there listens only on screen, as before.
    createLock: phoneLike ? null : (onChange) => createStandbyLock({ onChange }),
    // v8.1 (A8, SPEC §28.4): barge-in. In setup 1 or 3, once the hands-free Test's self-trigger step passed,
    // Standby's microphone and "Hey Jarvis" stay on through a woken session; what they hear goes to Voice Mode.
    bargeIn: {
      // MAC-9: only on what the Test's self-trigger step measured (the setup, wake microphone, speaker, wake words).
      keep: () => !phoneLike && safe(() => bargeInAllowed({ computer: true, setup: setupOf(getSettings()), test: readHandsFreeTest(localStorage), now: handsFreeMeasure({ plan: audioDevices ? audioDevices.plan() : null, settings: getSettings() }) }), false),
      detected: ({ trigger }) => !!voiceApi && safe(() => voiceApi.bargeIn(trigger) === true, false),
    },
    // v8.1 (A11): no click yet (a restart, an update) and George can't speak without one: Standby says
    // "CLICK ONCE SO JARVIS CAN SPEAK", and that click unlocks speech instead of leaving Standby.
    needsClick: () => !phoneLike && !safe(() => navigator.userActivation.hasBeenActive === true, true) && !georgeWithoutClick(),
    // MAC-6, MAC-R2-1: another Jarvis window can hear the owner or is answering (a listen, Voice Mode's check, a turn,
    // speech): this Standby stays asleep. This window's own lingering hold doesn't count. Not on a phone (as before).
    voiceElsewhere: phoneLike ? null : () => voiceBusyElsewhere({ own: voiceBusy }),
  });

  /**
   * v8.1 (A11): George can speak before any click: his voice is on and ready (the home base's or this Mac's), and
   * Jarvis is installed as an app (Chrome lets an installed app play sound without a click; the built-in voice
   * always needs one after a reload).
   */
  function georgeWithoutClick() {
    const s = getSettings();
    const home = !!s.homeBaseSpeak && !!homeBaseVoice && safe(() => homeBaseVoice.canSpeak() === true, false);
    const local = !!s.naturalVoice && !!naturalVoice && safe(() => naturalVoice.engine.status().state === 'ready', false);
    return (home || local) && safe(() => isStandalone(), false) && !safe(() => tts.audioStuck(), false);
  }

  /**
   * v8.1 (A11): open Standby when Jarvis starts: a computer, Settings (automatic: on when "Hey Jarvis" is on). Not
   * when the address asks for something else (?optics=1, or ?homebase=… from a tapped notification).
   */
  function standbyAtLaunch() {
    const s = getSettings();
    if (params.get('optics') === '1' || params.get('homebase')) return false;
    return !phoneLike && !state.demo && !!s.onboarded && (s.standbyAtLaunch === 'on' || (s.standbyAtLaunch !== 'off' && s.wakeWord === true));
  }

  /** Tests on localhost only: a stand-in for the "Hey Jarvis" worker (no download, said on demand). */
  function wakeStubAllowed() {
    try {
      const host = location.hostname;
      return (host === 'localhost' || host === '127.0.0.1') && localStorage.getItem('jarvis.dev.wakeWord') === 'stub';
    } catch {
      return false;
    }
  }

  /**
   * Open Standby: the Home's Standby key, the core's menu, Settings, "Jarvis, standby" typed or said.
   * Call inside the tap where possible (iOS starts the microphone's audio only there). `again`: back
   * after the wake routine or a conversation (no tap needed then).
   */
  function enterStandby({ again = false, launch = false } = {}) {
    if (state.demo) return false;
    if (isVoiceModeOpen()) return false; // Voice Mode closes itself into Standby ("go to sleep")
    cancelSheetReturn();
    if (state.listening) safe(() => state.listening.stop());
    safe(() => composer.cancelCountdown());
    if (settingsSheet) settingsSheet.close('navigate');
    closePhoneSheets();
    if (!standby) return false;
    if (again && standby.isAwaiting()) standby.resume();
    else standby.enter({ again, launch }); // v7.8.1: again = no tap behind it; REGRESS-1: launch = by itself at start
    return true;
  }

  // MAC-2: a woken session that left for a sheet ("open settings", history, the library, Mission Control, the home
  // base) never leaves Standby for good. Standby keeps its place meanwhile (the lock stays with this window; a
  // microphone kept for barge-in is let go) and comes back by itself: once that sheet is closed, after a quiet spell
  // (no click, key, scroll or touch for a minute), or at once while Jarvis is in the background, where nobody looks
  // at the sheet. It comes back above a sheet still open, which stays underneath.
  const SHEET_RETURN_MS = 60000;
  let sheetReturn = null; // { sheet, last, timer, offs }

  function returnAfterSheet() {
    cancelSheetReturn();
    safe(() => standby.rest());
    const R = { sheet: safe(() => anySheetOpen(), false), last: Date.now(), timer: 0, offs: [] };
    sheetReturn = R;
    const input = () => {
      R.last = Date.now();
    };
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
      window.addEventListener(type, input, { capture: true, passive: true });
      R.offs.push(() => window.removeEventListener(type, input, { capture: true, passive: true }));
    }
    const quiet = sheetReturnMs();
    const tick = () => {
      R.timer = 0;
      if (sheetReturn !== R) return;
      // Back already (the Standby key), or let go of: nothing left to do.
      if (!standby || !safe(() => standby.isAwaiting(), false)) {
        cancelSheetReturn();
        return;
      }
      // MAC-R2-2: the owner talks to Jarvis (a tap on the voice button): wait; its close starts the quiet spell again.
      if (isVoiceModeOpen()) {
        R.last = Date.now();
        R.timer = setTimeout(tick, 1000);
        return;
      }
      const closed = R.sheet && !safe(() => anySheetOpen(), false);
      if (document.hidden || closed || Date.now() - R.last >= quiet) {
        cancelSheetReturn();
        safe(() => standby.resume());
        return;
      }
      R.timer = setTimeout(tick, 1000);
    };
    tick();
  }

  function cancelSheetReturn() {
    const R = sheetReturn;
    sheetReturn = null;
    if (!R) return;
    clearTimeout(R.timer);
    for (const off of R.offs) safe(off);
  }

  /** MAC-2's quiet spell (tests on localhost: 'jarvis.dev.voice' { sheetReturnMs }, shorter only, 2 s at least). */
  function sheetReturnMs() {
    try {
      const host = location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') return SHEET_RETURN_MS;
      const raw = JSON.parse(localStorage.getItem('jarvis.dev.voice') || 'null');
      const v = raw && typeof raw === 'object' ? Number(raw.sheetReturnMs) : Number.NaN;
      return Number.isFinite(v) ? Math.min(SHEET_RETURN_MS, Math.max(2000, v)) : SHEET_RETURN_MS;
    } catch {
      return SHEET_RETURN_MS;
    }
  }

  /** "standby" / "go to sleep" typed (or dictated) in the chat. */
  function standbyFromChat(text) {
    if (state.demo || !safe(() => standbyCommand(text), false)) return false;
    return enterStandby();
  }

  // ---- Home base (v7.5, SPEC §23) --------------------------------------------------------------
  /**
   * "How's the home base?" / "home base status" typed (or dictated) in the chat: the Jarvis Core's
   * own assistant answers (POST api/ask; free, no Claude request), as a local exchange in the open
   * conversation or a new one. False when the words are something else or this chat is busy (they
   * wait like any message).
   */
  function homeBaseFromChat(text) {
    const words = String(text || '').trim();
    if (!homeBase || !words || !safe(() => matchHomeBaseCommand(words), false)) return false;
    let conv = state.conv;
    if (conv && (state.runs.has(conv.id) || runningElsewhere(conv.id))) return false;
    const fresh = !conv;
    if (!conv) conv = engine.newConversation();
    clearFollowups();
    let added;
    try {
      added = appendHomeBaseTurn(conv, { text: words, line: 'Asking the home base…', mode: composer.getMode() });
    } catch (err) {
      console.error('[jarvis] the home base turn failed:', err);
      return false;
    }
    const { turn, textSegment } = added;
    if (fresh || state.conv !== conv) setConversation(conv);
    else chat.sync();
    chat.scrollToBottom(false);
    safe(() => sounds.cue('send'));
    if (state.layout === 'phone') composer.blur();
    Promise.resolve(homeBase.ask(words))
      .catch(() => ({ ok: false, message: 'Something went wrong asking the home base.' }))
      .then((r) => {
        // The Core's words, shown as they are (never Markdown: no links or formatting from the Core).
        textSegment.text = escapeMarkdown((r && r.ok ? r.answer : r && r.message) || 'No answer from the home base.');
        turn.endedAt = Date.now();
        conv.updatedAt = turn.endedAt;
        if (state.conv === conv) {
          chat.refresh(turn.id);
          chat.scrollToBottom(false);
        }
        Promise.resolve(store.save(conv))
          .then(() => scheduleHistoryRefresh())
          .catch((err) => console.error('[jarvis] saving the home base turn failed:', err));
      });
    updateAll();
    return true;
  }

  /**
   * The same words said in Voice Mode: Jarvis says the home base's answer (free, no turn). v7.6: and
   * "brief me", "research … in the background", "what did the home base find?", "watch for …".
   */
  function homeBaseFromVoice(text) {
    const words = String(text || '').trim();
    if (!homeBase || !words) return null;
    if (!safe(() => matchHomeBaseCommand(words), false)) return brainFromVoice(words);
    const done = Promise.resolve(homeBase.ask(words))
      .catch(() => ({ ok: false, message: 'Something went wrong asking the home base.' }))
      .then((r) => ({ ack: (r && r.ok ? r.answer : r && r.message) || 'No answer from the home base.' }));
    return { handled: true, done };
  }

  // ---- the home base's brain from the chat and Voice Mode (v7.6, SPEC §24) ------------------------
  /**
   * A brain command for the linked home base, or null. No home base linked: nothing new, so every
   * sentence (also "brief me", "watch for …") goes to Jarvis as before.
   */
  function brainCommandOf(words) {
    if (!brain || !brain.base()) return null;
    return safe(() => matchBrainCommand(words), null);
  }

  /**
   * What a brain command does: { line (chat Markdown), speech (what Jarvis says), ok, paid? }. paid (v7.8.1):
   * the home base spent money on it with the owner's key (a full briefing it made just now).
   */
  async function runBrainCommand(cmd) {
    const problem = (r) => {
      const p = brainProblem(r, { limits: brain.getState().brain ? brain.getState().brain.limits : null });
      return { line: escapeMarkdown(p.message), speech: p.state === 'nokey' ? 'The home base needs your Claude key for that. You can give it the key in Settings, under Home base.' : p.message, ok: false, state: p.state };
    };
    if (cmd.kind === 'brief') {
      const r = await brain.latestBriefing({ fresh: true });
      // Out of reach (or a 1.0 Core): `fallback`, so the caller briefs as before v7.6.
      if (!r || !r.ok) return { ...problem(r), fallback: briefingFallback(r) };
      safe(() => brain.dismissMorning(r.briefing));
      safe(() => presence.noteBriefing(new Date()));
      // v7.8.1: one made just now with the key is a full (paid) briefing: its turn isn't labelled "Free".
      const paid = r.made === true && !!r.briefing && r.briefing.kind === 'full';
      return { line: briefingMarkdown(r.briefing), speech: briefingSpeech(r.briefing), ok: true, paid };
    }
    if (cmd.kind === 'results') {
      const r = await brain.call('listJobs');
      if (!r || !r.ok) return problem(r);
      return { line: resultsMarkdown(r.jobs), speech: resultsSpeech(r.jobs), ok: true };
    }
    if (cmd.kind === 'research') {
      const r = await brain.call('startJob', { prompt: cmd.prompt, depth: cmd.depth });
      if (!r || !r.ok) return problem(r);
      safe(() => brain.refresh());
      const deep = cmd.depth === 'deep';
      const m = `The home base is researching it${deep ? ' in depth' : ''}: “${r.job.title}”. It keeps going while your phone is locked and lets you know when it’s done. Ask “what did the home base find?” any time.`;
      return { line: escapeMarkdown(m), speech: `Very good. The home base is researching ${r.job.title}${deep ? ', in depth' : ''}. I’ll let you know when it’s done.`, ok: true, jobId: r.job.id };
    }
    if (cmd.kind === 'watch') {
      const r = await brain.call('addWatcher', { what: cmd.what, every: '24h' });
      if (!r || !r.ok) return problem(r);
      safe(() => brain.refresh());
      const m = `The home base is watching for it: “${r.watcher.what}”. It checks once a day and lets you know when it happens (change how often in Home base → Watching).`;
      return { line: escapeMarkdown(m), speech: `Certainly. The home base will keep an eye out and let you know when it happens.`, ok: true };
    }
    return { line: escapeMarkdown(NO_KEY_MESSAGE), speech: '', ok: false };
  }

  /**
   * "Research … in the background", "what did the home base find?", "watch for …", "brief me" typed
   * (or dictated) in the chat: a free, local exchange (no Claude request from this device), like
   * "how's the home base?". False when the words are something else or this chat is busy.
   */
  function brainFromChat(text) {
    const words = String(text || '').trim();
    if (!words || !homeBase) return false;
    const cmd = brainCommandOf(words);
    if (!cmd) return false;
    let conv = state.conv;
    if (conv && (state.runs.has(conv.id) || runningElsewhere(conv.id))) return false;
    const fresh = !conv;
    if (!conv) conv = engine.newConversation();
    clearFollowups();
    const waiting = { brief: 'Getting your briefing from the home base…', results: 'Asking the home base what it found…', research: 'Handing it to the home base…', watch: 'Telling the home base…' }[cmd.kind];
    let added;
    try {
      added = appendHomeBaseTurn(conv, { text: words, line: waiting, mode: composer.getMode() });
    } catch (err) {
      console.error('[jarvis] the home base turn failed:', err);
      return false;
    }
    const { userTurn, turn, textSegment } = added;
    const mode = composer.getMode();
    if (fresh || state.conv !== conv) setConversation(conv);
    else chat.sync();
    chat.scrollToBottom(false);
    safe(() => sounds.cue('send'));
    if (state.layout === 'phone') composer.blur();
    Promise.resolve(runBrainCommand(cmd))
      .catch(() => ({ line: escapeMarkdown('Something went wrong asking the home base.'), ok: false }))
      .then((r) => {
        // "Brief me" the home base can't answer (out of reach, a 1.0 Core): asked of Jarvis instead,
        // as before v7.6. The waiting exchange goes (it was never saved, and never reached Claude's
        // history) and the owner's words are sent as an ordinary message in its place.
        const canAsk = state.online && (state.demo || !!safe(getApiKey, ''));
        if (r && r.fallback && cmd.kind === 'brief' && canAsk && state.conv === conv && !state.runs.has(conv.id) && !runningElsewhere(conv.id)) {
          const at = conv.turns.indexOf(userTurn);
          if (at >= 0 && conv.turns[at + 1] === turn) {
            conv.turns.splice(at, 2);
            chat.setConversation(conv);
            if (send(words, mode)) return;
            conv.turns.splice(at, 0, userTurn, turn); // couldn't be sent: the home base's words stay
            chat.setConversation(conv);
          }
        }
        // Built in src/lib/brain.js: the Core's words escaped, links only from checked addresses.
        textSegment.text = String((r && r.line) || escapeMarkdown('No answer from the home base.')).slice(0, 12000);
        if (r && r.paid === true) turn.homeBasePaid = true; // v7.8.1: "Home base", not "Free · Home base"
        turn.endedAt = Date.now();
        conv.updatedAt = turn.endedAt;
        if (state.conv === conv) {
          chat.refresh(turn.id);
          chat.scrollToBottom(false);
        }
        Promise.resolve(store.save(conv))
          .then(() => scheduleHistoryRefresh())
          .catch((err) => console.error('[jarvis] saving the home base turn failed:', err));
      });
    updateAll();
    return true;
  }

  /**
   * The same, said in Voice Mode: Jarvis says it (free, no turn). "Brief me" the home base can't
   * answer (out of reach, a 1.0 Core) is asked of Jarvis instead, as before v7.6 ({ send }).
   */
  function brainFromVoice(words) {
    const cmd = brainCommandOf(words);
    if (!cmd) return null;
    const done = Promise.resolve(runBrainCommand(cmd))
      .catch(() => ({ speech: 'I couldn’t reach the home base just now.' }))
      .then((r) => (r && r.fallback && cmd.kind === 'brief' ? { send: words } : { ack: (r && r.speech) || 'No answer from the home base.' }));
    return { handled: true, done };
  }

  /** Two claps or "Hey Jarvis" in Standby (its microphone is already released): the routine. */
  /**
   * v8.1 (A5, decision D3): the one short line before the wake greeting when the chosen speakerphone isn't
   * connected ("I’m on the Mac’s speakers; the speakerphone isn’t connected."), once per absence; else null.
   * Said only at a wake the owner made, never out loud by itself. For mac-hf's wake.pending() hook.
   */
  function audioWakeLine() {
    return (audioDevices && safe(() => audioDevices.awayLine(), '')) || null;
  }

  function wakeUp(trigger) {
    if (isVoiceModeOpen()) return;
    if (state.listening) safe(() => state.listening.stop());
    openVoice({
      wake: {
        trigger,
        name: () => {
          const n = String(getSettings().userName || '').trim();
          return n || 'sir';
        },
        offer: () => wakeOffer(),
        briefing: () => wakeBriefing(),
        returnToStandby: () => getSettings().wakeReturn !== false,
        canSleep: () => !musicPlayer.isPlaying(),
        pending: () => wakePending.lines(), // v8.1 (D3): said before the greeting
        // Woken in a background tab (a Mac): the greeting is said out loud; a notification brings Jarvis forward.
        // v8.1 (A1): hands-free on, Voice Mode shows its own ("Jarvis is listening. Ask away, …") and listens there.
        onAwake: ({ line, hidden }) => {
          if (hidden && !handsFreeHidden()) safe(() => missionFinished({ title: 'Jarvis is awake', summary: `${line} Switch to Jarvis to answer.` }));
        },
      },
    });
  }

  /**
   * The routine's music: the artist the owner played lately (this device's history), else Back in
   * Black by AC/DC, found in Apple Music (free) by Apple's ids where known: an iTunes lookup, which
   * Apple never redirects (an iPhone's search for music can be sent to the Music app instead), then
   * a search. { artist, segment, playText, found } or null; `found` is what "yes" shows.
   */
  async function wakeOffer() {
    const pick = safe(() => suggestedMusic(), null);
    if (!pick) return null;
    const kind = pick.fromHistory ? 'artist' : 'song';
    const usable = (o) => !!o && o.ok && Array.isArray(o.items) && o.items.length > 0;
    let outcome = null;
    if (pick.fromHistory && pick.artistId) outcome = await topSongs(pick.artistId, { limit: 4, artist: pick.artist }).catch(() => null);
    else if (!pick.fromHistory && pick.ids.length) outcome = await lookupMusic(pick.ids, { query: pick.query }).catch(() => null);
    if (!usable(outcome)) {
      outcome = await searchMusic(pick.query, pick.fromHistory ? { kind, limit: 4 } : { kind, limit: 4, title: pick.title, artist: pick.artist }).catch(() => null);
    }
    if (!usable(outcome)) return null;
    const segment = musicSegment(outcome, { query: pick.query, kind, local: true });
    const playText = pick.fromHistory ? `play some ${pick.artist}` : `play ${pick.title} by ${pick.artist}`;
    return { artist: pick.artist, segment, playText, found: outcome };
  }

  /**
   * "Brief me": the briefing protocol for the time of day (a chat of its own; a paid request). v7.6:
   * with a home base linked, the home base's own briefing instead, said out loud (free: { done }).
   */
  function wakeBriefing() {
    const protocol = () => {
      const p = safe(() => getProtocol('morning-briefing'), null);
      if (!p) return null;
      const text = safe(() => p.buildPrompt({ input: '', settings: getSettings(), now: new Date() }), '');
      return text ? { text, mode: p.mode || 'swarm' } : null;
    };
    // MONEY-4, MAC-5: the protocol is a paid team of agents: Voice Mode asks first with its price
    // (MONEY-5: at the owner's team size and depth), and it is noted as given only once it is sent.
    const noted = () => safe(() => presence.noteBriefing(new Date()));
    if (brain && brain.base()) {
      safe(() => presence.noteBriefing(new Date()));
      const done = Promise.resolve(runBrainCommand({ kind: 'brief' }))
        .catch(() => ({ speech: 'I couldn’t reach the home base just now.' }))
        .then((r) => {
          // The home base can't brief (out of reach, a 1.0 Core): the briefing protocol, as before v7.6.
          const fallback = r && r.fallback ? protocol() : null;
          return fallback ? { send: fallback.text, mode: fallback.mode, usd: briefingPrice(), paid: true } : { ack: (r && r.speech) || 'No briefing from the home base just now.' };
        });
      return { done };
    }
    const b = protocol();
    if (!b) return null;
    return { ...b, usd: briefingPrice(), paid: true, sent: noted };
  }

  /** MONEY-5: what the briefing protocol costs now, at the owner's team size and depth (app-commands.js briefingUsd). */
  function briefingPrice() {
    const s = getSettings();
    return briefingUsd({ maxAgents: s.maxAgents, depth: s.depth, location: s.location });
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

  /**
   * Dev and test override for the live view (v8.0, 'jarvis.dev.optics' JSON { liveSessionMs }): a
   * shorter session only (5 s to the hour). Nothing here can raise the $1 or widen the hour.
   */
  function devLiveOptions() {
    try {
      const raw = JSON.parse(localStorage.getItem('jarvis.dev.optics') || 'null');
      const v = raw && typeof raw === 'object' ? Number(raw.liveSessionMs) : Number.NaN;
      return Number.isFinite(v) ? { sessionMs: Math.min(3600000, Math.max(5000, v)) } : {};
    } catch {
      return {};
    }
  }

  function opticsProblem({ newChat = false } = {}) {
    if (!state.demo && !safe(getApiKey, '')) return 'Add your Anthropic API key first: close Optics, then open Settings → API key.';
    if (!state.online) return 'You’re offline. Reconnect and try again.';
    if (newChat) return ''; // a new chat has nothing running
    if (currentRunning()) return 'Jarvis is still answering. Try again in a moment.';
    if (state.conv && runningElsewhere(state.conv.id)) return 'Jarvis is busy with this conversation in another window.';
    return '';
  }

  /**
   * Before a Look is taken: is this chat busy (a reply or a mission still running, here or in another
   * window)? Optics then offers the Look in a new chat instead of freezing a frame it can't send.
   */
  function opticsLookBlocked() {
    if (state.demo || !state.conv) return null;
    if (currentRunning()) return { code: 'busy', title: 'Jarvis is still answering in this chat', text: 'Look in a new chat now (this one keeps going), or wait until he’s done.' };
    if (runningElsewhere(state.conv.id)) return { code: 'busy', title: 'This chat is busy in another window', text: 'Look in a new chat now, or wait until it’s done.' };
    return null;
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

  /**
   * A chat from before the camera (v7): its tools are frozen without pin_labels, so a Look there
   * would be answered in words only, with no labels and no "What's this part?". Such a Look goes to
   * a new chat instead (the old one stays in History), as Voice Mode does for holograms; Optics says so.
   */
  function preOpticsChat() {
    return !state.demo && !!state.conv && turnsOf(state.conv).length > 0 && !hasVisualTools(state.conv, 'pin_labels') && !state.runs.has(state.conv.id);
  }
  const PRE_OPTICS_NOTE = 'New chat: labels need one (this chat is from before the camera).';

  function lookFromOptics({ text, frame, newChat = false }) {
    const problem = opticsProblem({ newChat });
    if (problem) return { error: problem };
    const { attachment, optics } = opticsAttachment(frame);
    const old = !newChat && preOpticsChat();
    if (newChat || old) setConversation(null);
    // keepOnStop: a Look stopped before Jarvis replies stays in the chat as a Look (as a Voice Mode
    // question does). Before v7.1 it was withdrawn and its camera frame went back into the chat box as
    // a photo, so the owner's next chat message sent the frame again.
    if (!send(text, 'quick', { attachments: [attachment], optics, keepOnStop: true })) return { error: 'That look couldn’t be sent.' };
    const entry = state.conv && state.runs.get(state.conv.id);
    if (!entry) return { error: 'That look couldn’t be sent.' };
    const user = state.conv.turns[state.conv.turns.length - 2];
    const note = newChat ? 'New chat: the other one is still running (it’s in History).' : old ? PRE_OPTICS_NOTE : '';
    return { run: entry.run, frameId: user && user.optics ? user.optics.frameId : null, note };
  }

  function askFromOptics({ text }) {
    const problem = opticsProblem();
    if (problem) return { error: problem };
    // A follow-up asked in Optics stays there when stopped (never put back in the chat box).
    if (!send(text, 'quick', { keepOnStop: true })) return { error: 'That question couldn’t be sent.' };
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

  // ---- Optics' live view (v8.0): one-off looks on the cheap model, about once a second ------------
  function liveFromOptics(frame, { summary, said, signal, model } = {}) {
    if (!state.online) return Promise.resolve({ ok: false, costUsd: 0, error: 'offline' });
    return runLiveLook({
      apiKey: safe(getApiKey, ''),
      apiBase: safe(getDevApiBase, ''),
      model: model || LIVE_DEFAULT_MODEL,
      frame,
      summary,
      said,
      signal,
      // Each look is part of the month's spending too, as Watch frames are.
      onSpend: (usd) => safe(() => addSpend(usd)),
    });
  }

  /**
   * May Jarvis say a live view line now? Only where he speaks anyway (Voice Mode open, or replies
   * read aloud), never while the owner is talking (a microphone hearing words) or he is speaking.
   */
  function liveSpeechState() {
    const vm = !!voiceApi && safe(() => isVoiceModeOpen(), false);
    const mode = safe(() => getSettings().speakReplies, 'off');
    const readAloud = mode === 'summary' || mode === 'full';
    const info = (vm && voiceInfo) || {};
    return {
      allowed: !!ttsOk && (vm || readAloud),
      ownerSpeaking: !!state.listening || (vm && !!info.listening && !!String(info.heard || '').trim()),
      jarvisSpeaking: !!state.speaking || (vm && (info.state === 'speaking' || !!info.busy)),
    };
  }

  /** A live view line through the voice output (Voice Mode's, else the router: George when he's on). */
  function sayLiveLine(line) {
    const text = String(line || '').trim();
    if (!text) return false;
    if (voiceApi && safe(() => isVoiceModeOpen(), false)) return safe(() => voiceApi.say && voiceApi.say(text), false) === true;
    if (!ttsOk || state.speaking || state.listening) return false;
    if (musicPlayer.isPlaying()) safe(() => musicPlayer.pause()); // a preview would play over him
    const s = getSettings();
    const entry = { turnId: null, live: true, handle: null };
    state.speaking = entry;
    try {
      entry.handle = speak(text, {
        voiceURI: s.voiceURI,
        rate: s.voiceRate,
        onChunk: () => pulseLevel(),
        onEnd: () => {
          if (state.speaking === entry) {
            state.speaking = null;
            updateCore();
          }
        },
      });
    } catch (err) {
      console.warn('[jarvis] live view line not spoken:', err);
      if (state.speaking === entry) state.speaking = null;
      return false;
    }
    updateCore();
    return true;
  }

  /** About what the next Look costs: the conversation's prompt is cached for 5 minutes after use. */
  function lookEstimate() {
    const conv = state.conv;
    const warm = !!(conv && conv.apiMessages && conv.apiMessages.length && Date.now() - (conv.updatedAt || 0) < 4.5 * 60 * 1000);
    return estimateLookCost({ model: getSettings().leadModel, prefixCached: warm }).usd;
  }
  /** Whole cents, at least 1: "about 3¢" warm, "about 8¢" in a new or quiet chat (MONEY-8). */
  const centsOf = (usd) => Math.max(1, Math.round(Number(usd) * 100) || 1);

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
    const moved = preOpticsChat();
    const out = voiceTurnResult(safe(() => voiceApi.ask(text || 'What am I looking at?', { mode: 'quick', attachments: [attachment], optics }), null));
    if (out.error) return out;
    const user = state.conv ? state.conv.turns[state.conv.turns.length - 2] : null;
    return { run: out.run, frameId: user && user.optics ? user.optics.frameId : null, note: moved ? PRE_OPTICS_NOTE : '' };
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
  // "What am I looking at?" said where the camera needs a tap first (iPhone): kept for Voice Mode's Look.
  // v8.0: "live view" said there waits the same way: the tap on Look then starts the live view.
  // v8.1: "open optics" said there (and "switch cameras"): only the camera opens with the tap (open,
  // command: the switch to make once it is live).
  let pendingVoiceLook = null; // { text, at, live, open?, command? }
  const PENDING_LOOK_MS = 30000;
  function takePendingVoiceLook() {
    const p = pendingVoiceLook;
    pendingVoiceLook = null;
    return p && Date.now() - p.at <= PENDING_LOOK_MS ? p : null;
  }
  /** Voice Mode's Look button: Optics over Voice Mode, with what was said before the tap. */
  function openOpticsForVoiceLook() {
    const p = takePendingVoiceLook();
    return openOpticsScreen({ voice: true, autoLook: p && !p.live && !p.open ? p.text : '', autoLive: !!(p && p.live), autoCommand: (p && p.command) || '' });
  }

  /**
   * v8.1 (E2): Jarvis hidden on a Mac (he listens there, A1): the camera only runs on screen, so one
   * notification brings him up, and its click opens Optics (`open`: what to do then).
   * PRIVACY-2: the notification says what its click does (`intent`: 'look' with a Look's price, 'live'
   * with the live view's cap, else 'open': the camera only). It is good for the same 30 s as a tap on
   * Look: then, and when Voice Mode closes, it is withdrawn, and a click that still comes later (a
   * hidden tab's timers run late) only opens Optics: no Look, no live view.
   */
  let cameraNote = null; // { at, timer }: the camera notification showing now
  function withdrawCameraNote() {
    const note = cameraNote;
    cameraNote = null;
    if (note && note.timer) clearTimeout(note.timer);
    safe(() => closeNotify('jarvis-optics'));
  }
  function cameraNoteBody(intent) {
    if (intent === 'look') return `Click to bring Jarvis up and look through the camera (about ${centsOf(lookEstimate())}¢).`;
    if (intent === 'live') return 'Click to bring Jarvis up and start the live view (up to $1 an hour).';
    return 'Click to bring Jarvis up and turn the camera on.';
  }
  function cameraNeedsFront(open, intent = 'open') {
    withdrawCameraNote();
    const note = { at: Date.now(), timer: null };
    cameraNote = note;
    note.timer = setTimeout(() => {
      if (cameraNote === note) withdrawCameraNote();
    }, PENDING_LOOK_MS);
    safe(() =>
      notifyOwner({
        tag: 'jarvis-optics',
        title: 'Jarvis: the camera',
        body: cameraNoteBody(intent),
        onClick: () => {
          const fresh = cameraNote === note && Date.now() - note.at <= PENDING_LOOK_MS;
          withdrawCameraNote();
          if (fresh) return safe(() => open());
          // Late: the camera comes on, and nothing more. Once Optics is up, a line where Jarvis may speak
          // (Voice Mode free), else shown.
          safe(() => openOpticsScreen({ voice: !!voiceApi }));
          const line = 'Optics is on. Ask me again, or tap Look.';
          setTimeout(() => {
            if (!safe(() => sayLiveLine(line), false)) safe(() => toast(line, { level: 'info', id: 'optics-late' }));
          }, 1200);
          return undefined;
        },
      }),
    );
    return 'The camera only runs while I’m on screen. Click the notification to bring me up.';
  }

  function voiceLookRequest(text) {
    if (state.demo || !voiceApi || !safe(() => cameraSupported(), false)) return null;
    // Only words plainly about seeing: "what's that?" or "what is it?" in a conversation is about
    // something Jarvis said, and goes to Jarvis as usual. So does "what is this?" while a hologram or
    // blueprint is on screen: it is about that. The live view's words follow the same rule: with a
    // hologram or blueprint on screen, "keep watching" never turns the camera on (v8.0).
    const viewerOpen = !!(getHologramViewer() || getBlueprintViewer());
    // v8.1: Jarvis hidden on a Mac: a notification first (the camera never runs hidden).
    const hidden = !!document.hidden && !safe(() => isIOS(), false);
    // "Live view", "watch me", "keep watching", "video mode": the camera opens by the same rule, then the live view.
    const live = safe(() => voiceLiveViewRequest(text, { viewerOpen, cameraAllowed, ios: isIOS(), hidden }), null);
    if (live === 'need-front') return { handled: true, command: { action: 'optics', kind: 'need-front', ack: cameraNeedsFront(() => openOpticsScreen({ voice: !!voiceApi, autoLive: true }), 'live') } };
    if (live === 'need-tap') {
      pendingVoiceLook = { text: '', at: Date.now(), live: true };
      return { handled: true, command: { action: 'optics', kind: 'need-tap', ack: 'Tap Look, and I’ll keep watching.' } };
    }
    if (live === 'start') {
      // Jarvis says the outcome once the camera is live and the live view has started: "Live view
      // on…", the pause at the hour's $1, or why the camera couldn't start (never "on" when it isn't).
      const optics = openOpticsScreen({ voice: true, autoLive: true, autoLiveSaid: true });
      const done = optics && optics.autoLiveDone ? optics.autoLiveDone : Promise.resolve({ error: 'The camera couldn’t start.' });
      return { handled: true, command: { action: 'optics', kind: 'liveview', ack: '' }, done };
    }
    const kind = safe(() => voiceCameraRequest(text, { viewerOpen, cameraAllowed, ios: isIOS(), hidden }), null);
    if (!kind) return null;
    if (kind === 'need-front') {
      const words = String(text).trim().slice(0, 500);
      return { handled: true, command: { action: 'optics', kind: 'need-front', ack: cameraNeedsFront(() => openOpticsScreen({ voice: !!voiceApi, autoLook: words }), 'look') } };
    }
    if (kind === 'need-tap') {
      // The question waits for that tap (30 s): Look then looks at once, with these words.
      pendingVoiceLook = { text: String(text).trim().slice(0, 500), at: Date.now(), live: false };
      return { handled: true, command: { action: 'optics', kind: 'need-tap', ack: 'Tap Look, and show me.' } };
    }
    const optics = openOpticsScreen({ voice: true, autoLook: String(text).trim() });
    const done = optics && optics.autoLookDone ? optics.autoLookDone : Promise.resolve({ error: 'The camera couldn’t start.' });
    return { handled: true, command: { action: 'optics', kind: 'look', ack: '' }, done };
  }

  // ---- v8.1 (E0): the live view's $1 an hour holds for answers -------------------------------------
  // One gate for this window over v8.0's budget (localStorage: every window's hour), each window's
  // reservations beside it, and a Web Lock so two windows can't both take the hour's last room.
  const gateStorage = {
    getItem: (k) => safe(() => localStorage.getItem(k), null),
    setItem: (k, v) => safe(() => localStorage.setItem(k, v)),
    removeItem: (k) => safe(() => localStorage.removeItem(k)),
    key: (i) => safe(() => localStorage.key(i), null),
    get length() {
      return safe(() => localStorage.length, 0);
    },
  };
  let liveGate = null;
  function getLiveGate() {
    if (!liveGate) {
      const budget = createLiveBudget({ storage: gateStorage, now: () => Date.now() });
      const locks = typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function' ? navigator.locks : null;
      liveGate = createLiveGate({ budget, storage: gateStorage, lock: locks ? (fn) => locks.request('jarvis.liveView.gate', () => fn()) : null });
    }
    return liveGate;
  }
  /** Whether the live view is on in this window now (paused counts as on). */
  function liveViewOn() {
    const optics = currentOptics();
    return !!(optics && safe(() => optics.liveView.on, false));
  }
  /**
   * A gate for one turn (startTurn({ gate })), made as the turn starts: a turn asked while the live
   * view is off is never held by it, even if the live view starts before the turn ends (MONEY-2).
   */
  function liveTurnGate() {
    return state.demo ? null : createTurnGate({ gate: getLiveGate(), isOn: liveViewOn });
  }
  // A research way outside the live view's dollar (a mission: its offer says so) is the send() of
  // exactly its words, whenever it comes (Voice Mode may hold a request a moment), once.
  let outsideLiveViewText = '';
  function takeOutsideLiveView(extras, text) {
    if (state.demo || (extras && extras.outsideLiveView)) return true;
    if (!outsideLiveViewText || text !== outsideLiveViewText) return false;
    outsideLiveViewText = '';
    return true;
  }
  /**
   * Whether a quick answer would be sent now: the room left in the live view's hour covers its first
   * request (as the engine builds it: this chat's, or a new chat's system prompt, tools and turn
   * context, MONEY-6) with a useful answer and one web search.
   */
  function quickAnswerFits(text = 'Research this with a web search.') {
    if (!liveViewOn()) return true;
    const model = getSettings().leadModel;
    const params = safe(() => engine.previewRequest(state.conv, { text, mode: 'quick', spoken: !!voiceApi, lines: [gateNote] }), null);
    if (!params) return true;
    const quick = { ...params, model, max_tokens: GATE_LIMITS.usefulTokens };
    return safe(() => getLiveGate().room() >= requestWorstUsd(quick, { model, web: { searches: 1, fetches: 0 } }), true);
  }

  // ---- v8.1 (E2): "open optics" by voice, free (no Look) ------------------------------------------
  /**
   * "Open optics", "open the camera", "switch cameras", "use the Logitech camera" (the router's
   * optics-open): with Optics open, "Optics is on."; typed in the chat, it opens on every device (Enter
   * is a gesture); said: a Mac where the camera is allowed and Jarvis on screen opens it over Voice
   * Mode, no Look ("Optics is on."); Jarvis hidden, a notification first; an iPhone or the camera not
   * allowed yet, "Tap Look to turn the camera on." (it waits 30 s for that tap). A switch is made once
   * the camera is live.
   */
  function openOpticsByWords({ text, surface, open = false } = {}) {
    if (open || isOpticsOpen()) return { say: 'Optics is on.' };
    const cmd = safe(() => matchOpticsCommand(String(text || '')), null);
    const autoCommand = cmd && (cmd.action === 'flip' || cmd.action === 'camera') ? String(text || '').trim() : '';
    if (surface === 'chat') return { say: openOpticsScreen({ autoCommand }) ? '' : 'The camera couldn’t start in this browser.' };
    const kind = safe(() => voiceOpticsOpen(text, { cameraAllowed, ios: isIOS(), hidden: !!document.hidden }), null);
    if (kind === 'need-tap') {
      pendingVoiceLook = { text: '', at: Date.now(), live: false, open: true, command: autoCommand };
      return { say: 'Tap Look to turn the camera on.' };
    }
    if (kind === 'need-front') return { say: cameraNeedsFront(() => openOpticsScreen({ voice: !!voiceApi, autoCommand })) };
    if (kind !== 'open') return false;
    const api = openOpticsScreen({ voice: !!voiceApi, autoCommand });
    if (!api) return { say: 'The camera couldn’t start.' };
    // "Optics is on." only once the camera is live; else why not ("I can't find a camera.", in use…).
    const done = api && api.cameraDone && typeof api.cameraDone.then === 'function' ? api.cameraDone : null;
    if (!done) return { say: 'Optics is on.' };
    const late = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 12000));
    return Promise.race([done, late]).then((r) => ({ say: opticsOpenLine(r) }));
  }

  /** "Close the camera" with Optics closed: a camera view on another screen goes off (Screens), else nothing to do. */
  function closeCameraByWords() {
    const shown = screensCtl ? safe(() => screensCtl.list().some((w) => w.kind === 'camera'), false) : false;
    if (shown && screenCommand('close the camera window', null, 'voice')) return { say: 'Camera off.' };
    return { say: 'The camera is off.' };
  }

  /**
   * R10: "open the camera" with a laptop hologram on top (the router's optics-camera-part): the
   * hologram selects its camera part as it does today, and Jarvis adds how to reach Optics.
   */
  function hologramPartByWords({ text, surface, hint }) {
    const words = String(text || '');
    const res = surface === 'voice' ? safe(() => voiceCommand(words), null) : safe(() => getHologramViewer().command(words, { source: 'typed' }), null);
    if (!res || !res.handled) return false;
    const ack = safe(() => viewerAck(res.command), '');
    return { say: [ack, hint].filter(Boolean).join(' ') };
  }

  /** Optics' own words (the router's optics-card, optics-close in its field): its line, or false. */
  function opticsCommandByWords(text) {
    const optics = currentOptics();
    const res = optics ? safe(() => optics.command(String(text || '')), null) : null;
    if (!res || !res.handled) return false;
    const line = (res.command && res.command.ack) || '';
    return res.done ? Promise.resolve(res.done).then(() => ({ say: line })) : { say: line };
  }

  // ---- v8.1 (E3): "research this", the price first ----------------------------------------------
  let researchAsk = null; // the open offer: { handle (Voice Mode's question), card (Optics'), offer, subject, deep }
  /** What "this" is outside Optics (resolveThis): a hologram's title, the newest reply, the last question. */
  function thisOutsideOptics() {
    const viewer = getHologramViewer();
    const title = viewer ? safe(() => viewer.getState().title, '') : '';
    const turns = state.conv ? turnsOf(state.conv) : [];
    const lastUser = [...turns].reverse().find((t) => t && t.role === 'user' && t.text);
    return safe(() => resolveThis({ hologram: title ? { title } : null, lastQuestion: lastUser ? lastUser.text : '' }), null);
  }

  /**
   * The router's optics-research: the subject in words, the offer with each way's price (Voice Mode:
   * a question said and answered by voice; Optics: a card with its buttons, said where Jarvis speaks),
   * then the way the owner picks. Nothing is spent before that. No subject yet with the camera live:
   * "Let me look first: about 3¢." (a Look, then the offer; its price warm or cold, MONEY-8).
   */
  function researchThis({ where = 'offer', deep = false, surface = 'voice' } = {}) {
    if (!state.online) return { say: OFFLINE_LINE };
    const optics = currentOptics();
    const card = optics ? safe(() => optics.card(), null) : null;
    const subject = researchSubject({
      label: card ? card.tapped || (card.labels && card.labels[0]) || '' : '',
      answer: card && !card.analyzing ? card.answer : '',
      liveSummary: optics ? safe(() => optics.liveSummary, '') : '',
      resolved: optics ? null : thisOutsideOptics(),
    });
    if (!subject && optics && safe(() => optics.canLook(), false)) {
      // A Look first (by name, about 3¢), then the offer about what it found. In Voice Mode the Look
      // starts once Jarvis has said so (its turn would cut the line short).
      const go = () => {
        const looking = Promise.resolve(safe(() => optics.question('What am I looking at?'), null)).then((res) => (res && res.run && res.run.done ? res.run.done : null));
        looking.then((turn) => {
          if (turn && turn.status === 'done') researchThis({ where, deep, surface });
        });
      };
      if (voiceApi && safe(() => isVoiceModeOpen(), false)) afterVoiceSays(go);
      else go();
      return { say: lookFirstLine(lookEstimate()) }; // MONEY-8: warm or cold, as the LOOK button says
    }
    const settings = getSettings();
    const offer = researchOffer({
      subject,
      homeBase: !!(brain && safe(() => brain.base(), null)),
      online: state.online,
      liveView: liveViewOn() ? { on: true, quickFits: quickAnswerFits() } : null,
      agents: settings.maxAgents,
      depth: settings.depth,
      deep,
      only: where === 'homebase' ? 'homebase' : null,
    });
    if (offer.refuse) return { say: offer.lookFirst ? 'Show me first: open Optics and look, then say research this.' : offer.refuse };
    closeResearchOffer();
    const entry = { offer, subject, deep, handle: null, card: null };
    researchAsk = entry;
    const pick = (choice) => {
      if (researchAsk !== entry) return;
      closeResearchOffer();
      runResearch(choice, subject, { deep });
    };
    const voice = !!voiceApi && safe(() => isVoiceModeOpen(), false);
    if (voice && typeof voiceApi.question === 'function') {
      // Quick and Cancel are the question's own answers (at once); Mission and Home base, the dear
      // ones, are the router's optics-research-answer, through the 2-second check.
      const cheap = offer.choices.filter((c) => !c.dear);
      entry.handle = safe(() =>
        voiceApi.question({
          id: 'research-offer', // RESEARCH_OFFER_ID (src/ui/commands/optics.js)
          say: offer.say,
          choices: offer.choices.map((c) => ({ id: c.id, label: c.label, words: c.words, dear: c.dear })),
          match: (words) => matchOfferChoice(words, cheap),
          onAnswer: (choice) => pick(choice),
          onExpire: (reason) => {
            if (researchAsk !== entry) return;
            if (reason === 'dropped') {
              // Other words were heard. They may be the offer's dear answer ("mission", "home base": the
              // router's optics-research-answer, which goes through the 2-second check first), so the
              // offer stays answerable that way a little longer; its question and card are gone.
              entry.handle = null;
              if (entry.card) safe(() => entry.card.close());
              entry.card = null;
              entry.dropTimer = setTimeout(() => {
                if (researchAsk === entry) closeResearchOffer();
              }, 30000);
              return;
            }
            closeResearchOffer();
          },
        }),
      );
    }
    if (optics) entry.card = safe(() => optics.offerResearch(offer, (choice) => (entry.handle ? entry.handle.answer(choice) : pick(choice))), null);
    if (entry.handle) return { say: '' }; // Voice Mode says the question itself
    return { say: surface === 'voice' ? offer.say : '' };
  }

  /**
   * Runs `fn` once Voice Mode has said what it is saying now (its `busy`, as it syncs it): when it is no
   * longer busy after it was, after 400 ms if it never was; at most 4 s.
   */
  function afterVoiceSays(fn) {
    const t0 = Date.now();
    let seen = false;
    const tick = () => {
      const busy = !!(voiceInfo && voiceInfo.busy);
      if (busy) seen = true;
      const waited = Date.now() - t0;
      if ((!busy && (seen || waited >= 400)) || waited >= 4000) {
        safe(fn);
        return;
      }
      setTimeout(tick, 80);
    };
    setTimeout(tick, 80);
  }

  /** The open research offer goes (answered, expired, replaced). */
  function closeResearchOffer() {
    const entry = researchAsk;
    researchAsk = null;
    if (!entry) return;
    clearTimeout(entry.dropTimer);
    if (entry.card) safe(() => entry.card.close());
  }

  /** Mission or Home base said for the open offer (after the 2-second check): the router's optics-research-answer. */
  function answerResearchOffer(choice) {
    const entry = researchAsk;
    // Never "mission" sent to Claude as a question: the offer has gone, so say so.
    if (!entry) return { say: 'That research offer has gone. Say research this again.' };
    if (entry.handle && safe(() => entry.handle.answer(choice), false)) return { say: '' };
    closeResearchOffer();
    return runResearch(choice, entry.subject, { deep: entry.deep });
  }

  /**
   * The way the owner picked: Quick = a follow-up in this chat with a web search (with the live view
   * on, through its gate); Mission = a swarm turn with the subject in words (outside the live view's
   * dollar); Home base = the home base's own research job (words only). Returns { say }.
   */
  function runResearch(choice, subject, { deep = false } = {}) {
    const voice = !!voiceApi && safe(() => isVoiceModeOpen(), false);
    // In Voice Mode a turn starts on the next tick: an answer is acted on while Voice Mode is still
    // taking the words (the router's run, a question's onAnswer), and a turn started then would be
    // overwritten by its "One moment…"; on the next tick ask() takes over from it.
    const later = (fn) =>
      new Promise((resolve) =>
        setTimeout(() => {
          safe(fn);
          resolve({ say: '' });
        }, 0),
      );
    if (choice === 'cancel') {
      const line = 'Okay, no research.';
      if (voice) setTimeout(() => safe(() => voiceApi.say(line)), 0);
      return { say: line };
    }
    const optics = currentOptics();
    // Owner question 9 (LIVE_VIEW_COUNTS): a way that doesn't count toward the live view's dollar is
    // sent outside its gate (the send() of exactly its words).
    const outside = !LIVE_VIEW_COUNTS[choice];
    if (choice === 'quick') {
      const text = researchPrompt(subject, 'quick');
      outsideLiveViewText = outside ? text : '';
      // With a Look on screen it is that Look's follow-up (the card shows it); else a quick question.
      const go = () => {
        if (optics && safe(() => optics.card(), null)) safe(() => optics.followUp(text));
        else if (voice) voiceTurnResult(safe(() => voiceApi.ask(text, { mode: 'quick' }), null));
        else send(text, 'quick', { keepOnStop: true });
      };
      if (voice) return later(go);
      go();
      return { say: '' };
    }
    if (choice === 'mission') {
      const text = researchPrompt(subject, 'mission');
      outsideLiveViewText = outside ? text : '';
      if (voice) return later(() => voiceTurnResult(safe(() => voiceApi.ask(text, { mode: 'swarm' }), null)));
      const ok = send(text, 'swarm');
      if (ok && optics) safe(() => optics.notice('The research mission is under way: it’s in the chat.'));
      return { say: ok ? 'The research mission is under way: it’s in the chat.' : 'I couldn’t start the mission.' };
    }
    if (choice === 'homebase') {
      const done = Promise.resolve(runBrainCommand({ kind: 'research', prompt: researchPrompt(subject, 'homebase'), depth: deep ? 'deep' : 'quick' }))
        .catch(() => ({ speech: 'Something went wrong asking the home base.' }))
        .then((r) => {
          const line = (r && r.speech) || 'The home base has it.';
          if (voice) safe(() => voiceApi.say(line));
          if (optics) safe(() => optics.notice(line));
          return { say: line };
        });
      return done;
    }
    return false;
  }

  function opticsDeps(extra = {}) {
    return {
      getSettings,
      lookEstimate,
      look: lookFromOptics,
      lookBlocked: opticsLookBlocked,
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
      // v8.0 Live view: looks on the cheap model, the lines spoken through the voice output.
      liveLook: state.demo ? null : liveFromOptics,
      // v8.1 (E0): the hour's budget with the answers' reservations (the same gate the turns use).
      liveGate: state.demo ? null : getLiveGate(),
      liveSpeech: { state: liveSpeechState, say: sayLiveLine, unlock: () => safe(() => unlockSpeech()) },
      // A live look sent but never answered (stopped, a timeout): the month counts its estimate too.
      liveSpendEstimate: (usd) => safe(() => addSpend(usd)),
      liveOptions: devLiveOptions(),
      stt: sttPausingPreviews,
      sttSupported: sttOk,
      sounds,
      wakeLock: { keepAwake: () => keepAwake('optics'), allowSleep: () => allowSleep('optics') },
      // The system camera (a photo attachment) when the live camera is blocked or missing.
      fallbackPhoto: state.layout === 'phone' ? () => composer.takePhoto() : null,
      watchOptions: devOpticsOptions(),
      // Presence: the state word (OPTICS LIVE, ANALYZING, WATCHING m:ss), the OPTICS and WATCH pills
      // and the cores' OPTICS bead; a Look's capture flares the home's core.
      onLiveChange: (live) => onOpticsLive(live),
      onCapture: () => presence.cue('capture'),
      // v8.1: words typed or said in Optics go to the router first ("put the camera on my other
      // screen", then Optics' own words: routeFromOptics).
      route: (text, { spoken = false, alternatives = [] } = {}) => routeFromOptics(text, { spoken, alternatives }),
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
  function openOpticsScreen({ start, voice = false, autoLook = '', autoLive = false, autoLiveSaid = false, autoCommand = '' } = {}) {
    if (isOpticsOpen()) return currentOptics() || true;
    if (!voice) stopSpeakingNow();
    if (state.listening) safe(() => state.listening.stop());
    const extra = {};
    if (start === 'screen') extra.start = start;
    if (autoLook) extra.autoLook = autoLook;
    if (autoCommand) extra.autoCommand = autoCommand; // v8.1: "switch cameras" said with Optics closed: made once live
    if (autoLive) extra.autoLive = true; // "live view" said in Voice Mode: it starts once the camera is live
    if (autoLive && autoLiveSaid) extra.autoLiveSaid = true; // and Voice Mode says the outcome (autoLiveDone)
    if (voice && voiceApi) {
      Object.assign(extra, {
        voice: { tap: () => safe(() => voiceApi && voiceApi.tap()) },
        look: lookViaVoice,
        lookBlocked: null, // Voice Mode says when it is still on the last request
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

  /**
   * Reopens a past Look (from the chat) frozen, with the labels pinned on it: the owner's Look (its
   * attachment), or a frame Jarvis took itself with look_through_camera (its frame segment's preview).
   */
  function reviewOptics(turn, seg) {
    const conv = state.conv;
    if (!conv || isOpticsOpen()) return;
    const found = opticsFrameFor(turn, seg);
    if (!found) return;
    const { frameId, preview, width, height, source, question, idx, after } = found;
    const turns = conv.turns || [];
    // The labels: the given segment, else the newest pins on this frame in the turns that follow.
    let pins = seg && Array.isArray(seg.labels) ? seg.labels : null;
    let answerText = '';
    for (let i = idx; i < turns.length; i++) {
      const t = turns[i];
      if (!t || t.role !== 'jarvis') continue;
      const segs = t.segments || [];
      for (let j = 0; j < segs.length; j++) {
        const s = segs[j];
        if (s && s.kind === 'pins' && s.status === 'done' && s.frameId === frameId && !seg) pins = s.labels;
        // The answer: the reply's text (for a frame Jarvis took, the text after it).
        if (i === after.turn && j >= after.seg && s && s.kind === 'text') answerText += `${answerText ? '\n\n' : ''}${s.text || ''}`;
      }
    }
    openOptics(opticsDeps({ review: { preview, width, height, source, frameId, question, answer: answerText, pins: pins || [] } }));
  }

  /**
   * The picture of an Optics frame in this conversation: the owner's Look (user turn) or a frame Jarvis
   * took itself (a reply's frame segment). -> { frameId, preview, width, height, source, question, idx,
   * after: { turn, seg } } or null (nothing to show: no preview kept).
   */
  function opticsFrameFor(turn, seg) {
    const conv = state.conv;
    const turns = (conv && conv.turns) || [];
    const frameId = seg && seg.frameId ? seg.frameId : turn && turn.optics ? turn.optics.frameId : null;
    const userTurn = turns.find((t) => t && t.role === 'user' && t.optics && t.optics.frameId === frameId) || (turn && turn.role === 'user' && turn.optics ? turn : null);
    if (userTurn && userTurn.optics) {
      const meta = (userTurn.attachments || [])[0] || {};
      if (!meta.thumb) return null;
      const idx = turns.indexOf(userTurn);
      return { frameId: frameId || userTurn.optics.frameId, preview: meta.thumb, width: userTurn.optics.width, height: userTurn.optics.height, source: userTurn.optics.source, question: userTurn.text || 'What am I looking at?', idx: idx + 1, after: { turn: idx + 1, seg: 0 } };
    }
    if (!frameId) return null;
    // A frame Jarvis took itself (look_through_camera): its frame segment in a reply.
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (!t || t.role !== 'jarvis') continue;
      const j = (t.segments || []).findIndex((s) => s && s.kind === 'frame' && s.frameId === frameId);
      if (j < 0) continue;
      const f = t.segments[j];
      if (typeof f.thumb !== 'string' || !f.thumb) return null;
      const asked = turns[i - 1] && turns[i - 1].role === 'user' ? turns[i - 1].text : '';
      return { frameId, preview: f.thumb, width: f.width, height: f.height, source: f.source || 'camera', question: asked || f.reason || 'Jarvis took a look', idx: i, after: { turn: i, seg: j + 1 } };
    }
    return null;
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
    // v8.1: "put this on my other screen" and "play Back in Black" typed in a viewer are taken before
    // this, by the router (routeFromViewer).
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
      stt: sttPausingPreviews,
      getSettings,
      blueprintCost: (conversationId) => blueprintCost(conversationId),
      requestBlueprint: (req) => requestBlueprint(req),
      sendMessage: (text, opts) => sendFromViewer(text, opts),
      // v8.1: the command field's words go to the router first (the hologram's, Screens, Apple Music).
      route: (text, opts) => routeFromViewer(text, opts),
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
      // v8.1 walkthroughs: Voice Mode, while open, says the tour, asks its decisions and holds a woken session.
      tourVoice: () => (voiceApi && safe(() => isVoiceModeOpen(), false) ? voiceApi : null),
      onClose: () => onViewerClosed(),
    };
  }

  // ---- v8.1 walkthroughs (SPEC §29) ---------------------------------------------------------------

  /** The newest reply's hologram, when the newest reply showed one: { segment, conversationId, turnId } or null. */
  function newestReplyHologram() {
    const conv = state.conv;
    const last = conv ? turnsOf(conv).filter((t) => t && t.role === 'jarvis').pop() : null;
    const segs = last && Array.isArray(last.segments) ? last.segments : [];
    let seg = null;
    for (let i = segs.length - 1; i >= 0 && !seg; i -= 1) if (isObj(segs[i]) && segs[i].kind === 'hologram') seg = segs[i];
    if (!seg || seg.status === 'building' || seg.status === 'error' || !isObj(seg.spec) || !Array.isArray(seg.spec.parts) || !seg.spec.parts.length) return null;
    return { segment: seg, conversationId: conv.id, turnId: last.id };
  }

  /** The router's `tourReply`: the newest reply's hologram ({ title, parts }) a walkthrough would open. */
  function tourReplyState() {
    const r = newestReplyHologram();
    if (!r) return null;
    const spec = r.segment.spec;
    return { title: String(spec.title || r.segment.title || ''), parts: spec.parts.filter(isObj).map((p) => ({ id: p.id, name: p.name, aka: Array.isArray(p.aka) ? p.aka : [] })) };
  }

  /** "Walk me through it" with the viewer closed, right after a reply that showed a hologram: open it again. */
  function openReplyHologram() {
    const r = newestReplyHologram();
    if (!r) return null;
    const sheet = getBlueprintViewer();
    if (sheet) safe(() => sheet.close());
    let viewer = null;
    try {
      viewer = openHologramViewer({ source: { segment: r.segment, conversationId: r.conversationId, turnId: r.turnId }, deps: viewerDeps() });
    } catch (err) {
      console.error('[jarvis] hologram viewer failed:', err);
      return null;
    }
    if (voiceInfo) safe(() => viewer.setVoice(voiceInfo));
    return viewer;
  }

  /** What the open hologram viewer shows (its title, the glowing part, the tour's step), for a turn's context (B6). */
  function viewerTurnContext() {
    const viewer = getHologramViewer();
    return viewer && typeof viewer.viewerContext === 'function' ? safe(() => viewer.viewerContext(), null) : null;
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

  /** Whether a sent message carried an Optics frame (a camera Look or a screen look). */
  function sentOpticsFrame(sent) {
    return !!(sent && Array.isArray(sent.attachments) && sent.attachments.some((a) => a && typeof a.id === 'string' && a.id.startsWith('optics_')));
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
    if (screensCtl) safe(() => screensCtl.onRunEvent(entry, evt)); // live content on other screens
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
    if (screensCtl) safe(() => screensCtl.onRunDone(entry));
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
    // Never an Optics frame (a Look is kept on Stop; this is a backstop): it would become an ordinary
    // photo in the box and go out with the next message.
    else if (turn && turn.withdrawn === true && entry.sent && isCurrent(entry) && !sentOpticsFrame(entry.sent)) {
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
    // Presence: a mission that ended while the owner was away becomes a Needs-you item.
    const away = document.hidden || !isCurrent(entry);
    const briefing = safe(() => {
      const first = turnsOf(entry.conv).find((t) => t.role === 'user');
      const parsed = first ? parseProtocolPrompt(first.text || '') : null;
      return parsed && /briefing/i.test(parsed.name || '') ? partOfDay(new Date(Number(first.createdAt) || Date.now())) : '';
    }, '');
    safe(() => presence.noteRunEnded(entry.conv, turn, { away, briefing }));
    if (status === 'done' && !away) safe(() => presence.cue('answer'));
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
      run = engine.resumeTurn(state.conv, { gate: liveTurnGate() }); // v8.1 (E0): the live view's gate, as send()'s
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
    // Apple Music cards: the song or album and its link ("Apple Music: Back In Black by AC/DC — https://…").
    const songs = segmentsOf(turn).map((seg) => safe(() => musicExportItem(seg), null)).filter(Boolean).map((item) => `Apple Music: ${describeItem(item)} — ${item.url}`);
    const text = redactSecrets([...visuals, body, ...songs].filter(Boolean).join('\n\n'), state.demo ? '' : safe(getApiKey, ''));
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
    // A preview playing now would play over Jarvis's voice (Speak, Speak replies): it pauses.
    if (musicPlayer.isPlaying()) safe(() => musicPlayer.pause());
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
    // Inside the tap: iOS lets George's voice (Web Audio) play only after a gesture started it (v7.8: he
    // may have been turned on by himself after the app's first tap).
    safe(() => unlockSpeech());
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
    composer.cancelCountdown(); // listening again: words still waiting in the box are kept, not sent
    stopSpeakingNow();
    musicPlayer.pauseForMic(); // a preview playing would be heard as speech
    safe(() => unlockSpeech());
    const prefix = composer.getText().trim();
    const join = (t) => [prefix, String(t || '').trim()].filter(Boolean).join(' ');
    let handle = null;
    let ended = false; // the STT module may end (or fail) synchronously inside startListening()
    let heard = ''; // the words of the turn (onFinal): taken once the mic has closed (below)
    const convId = state.conv ? state.conv.id : null; // the chat they are said in
    const finish = () => {
      if (!ended) safe(() => sounds.play('listen-stop'));
      ended = true;
      if (state.listening === handle) state.listening = null;
      composer.setListening(false);
      header.setLevel(0);
      updateCore();
      const text = heard;
      heard = '';
      if (text) afterChatMic(text, convId);
    };
    const st = getSettings();
    try {
      handle = startListening({
        lang: st.listenLang, // '' = the device's language
        wait: st.listenWait, // Jarvis decides when the owner has finished (stt.js)
        phrases: listenPhrases(), // Chrome's contextual biasing, where it exists
        onPartial: (t) => {
          composer.setText(join(t));
          pulseLevel();
        },
        onFinal: (t, info) => {
          const text = join(chatReading(t, info));
          composer.setText(text);
          // Taken once the recognizer has closed (onEnd follows at once): "play a preview of …"
          // then finds the mic off, and nothing is heard while it acts.
          heard = text;
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

  /**
   * Words from the chat's mic, once it has closed. A local command (Screens, Apple Music) acts now,
   * as in Voice Mode: no 2-second check (it is free, and a misheard one only shows the wrong card or
   * screen); like a typed one it also works while Jarvis is busy. A message waits 2 seconds in the box
   * (Settings → Voice → After I stop talking), or goes at once with "Send right away".
   */
  function afterChatMic(text, convId) {
    if (composer.getText().trim() !== text.trim()) return; // the owner changed the box meanwhile
    // Voice Mode opened, or another chat, while the mic closed: the words stay in the box, unsent.
    if ((state.conv ? state.conv.id : null) !== convId || safe(() => isVoiceModeOpen(), false)) return;
    if (safe(() => composer.submitCommand(), false)) return;
    if (!currentRunning() && state.online && (state.demo || safe(getApiKey, ''))) {
      // submit() goes through onSend with the composer's attachments and team size, and clears the
      // input and attachments only when the send is accepted. With "Show what I said for 2 seconds,
      // then send" the words wait in the box first: a tap on the box (or typing) stops that, and the
      // owner sends them.
      if (getSettings().listenSend === 'now') composer.submit();
      else composer.startCountdown(REVIEW_MS, () => composer.submit());
    }
  }

  /**
   * The reading of words from the chat's mic to use (so what the box shows is what the chat takes):
   * v8.1, the router's pick in the chat's order, with its rule for other readings (R7: only for a
   * free, undoable command, and never when the best reading is a question); Apple Music by another
   * reading only when the best one is nothing else. No command: the best reading.
   */
  function chatReading(text, info) {
    const alts = info && Array.isArray(info.alternatives) ? info.alternatives : [];
    const hit = safe(() => commandRouter.route([text, ...alts], routerState('chat', { via: 'voice' })), null);
    return hit && hit.reading ? hit.reading : String(text || '').trim();
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
    // The awareness rail stands in for Mission Control's empty state (and the panel says which).
    panelRail.hidden = !!turn;
    panel.setAttribute('aria-label', turn ? 'Mission Control' : 'Awareness');
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
      mcPanel = createMissionControl({ container: panelMcHost, variant: 'panel', commsOpen: presence.getHud().density === 'full' });
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
      mc = createMissionControl({ container: sheet.body, variant: 'sheet', commsOpen: presence.getHud().density === 'full' });
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
      if (opts.brain && settingsPanel) safe(() => settingsPanel.revealBrain(opts.brain));
      return;
    }
    closePhoneSheets();
    const panelCtl = createSettingsPanel({
      demo: state.demo,
      naturalVoice: naturalVoice ? { natural: naturalVoice, tts } : null,
      // v7.8: Settings → Voice → Jarvis's voice (the voice in use, Test, George on or off).
      voice: { tts, natural: naturalVoice || null, senses: senses && !state.demo ? senses : null },
      // v7.7 (beta): Settings → Home base → Hearing and voice.
      // v7.8.1: its Test unlocks through the voice router (a stuck output is started afresh in the tap), and
      // a sample that didn't play marks George's sound stuck (replies use the device voice meanwhile).
      senses: senses && !state.demo ? { senses, audio: naturalVoice ? naturalVoice.audio : null, createCapture: (o) => createStandbyCapture({ ...o, ...captureOn('question') }), stopSpeaking: () => safe(() => stopSpeakingNow()), unlockVoice: () => safe(() => unlockSpeech()), onSilent: (a) => safe(() => tts.noteAudioStuck(a)) } : null,
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
        // The natural voice's worker first (it could still be writing its download), then its files
        // go with everything else (resetApp deletes its caches too).
        if (!state.demo && naturalVoice) await Promise.resolve(safe(() => naturalVoice.engine.clear(), null)).catch(() => {});
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
      // HUD → Boot sequence → Replay now: back on the home screen, once the sheet is gone (a
      // covered core sleeps, and the boot would play unseen).
      replayBoot: () => {
        if (settingsSheet) settingsSheet.close('navigate');
        setTimeout(() => {
          if (!chat.isEmpty()) newChat();
          setTimeout(() => safe(() => presence.boot({ force: true, emptyEl: chat.emptyElement() })), 80);
        }, 460);
      },
      replayOnboarding: () => {
        if (settingsSheet) settingsSheet.close('navigate');
        setTimeout(() => openOnboarding(), 50);
      },
      // Voice → Wake Jarvis → Go to Standby (inside the tap: iOS starts the microphone's audio there).
      enterStandby: () => enterStandby(),
      // v7.6: Settings → Home base → what the home base does on its own (key, limits, briefing, push).
      brain,
      // v7.6: Settings → Home base → keep this device in sync.
      sync: syncCtl,
      toast,
      // ==== v8.1: what each builder's Settings slot needs, between its markers (keep them) ====
      // ---- mac-dev ▸ (Voice → Microphone and speaker)
      audioDevices:
        audioDevices && !state.demo
          ? {
              audio: audioDevices,
              stt: sttDevice,
              tts,
              createCapture: (o) => createStandbyCapture({ ...o, ...captureOn('wake') }),
              createWakeWord: () => (wakeStubAllowed() ? createWakeWordStub() : createWakeWord()),
              // A10's card: is George ready to speak (from the home base, or on this Mac)?
              george: () => {
                const st = getSettings();
                if (safe(() => tts.audioStuck(), false)) return { ready: false };
                if (senses && sensesAllowed && st.homeBaseSpeak === true && safe(() => senses.canSpeak(), false)) return { ready: true, label: 'George (home base)' };
                if (naturalVoice && st.naturalVoice === true && safe(() => naturalVoice.engine.status().state, 'off') === 'ready') return { ready: true, label: 'George (this Mac)' };
                return { ready: false };
              },
            }
          : null,
      // ---- mac-dev ◂
      // ---- mac-hf ▸
      // ---- mac-hf ◂
      // ---- tours ▸ (Holograms)
      // ---- tours ◂
      // ---- voice ▸
      // ---- voice ◂
      // ---- chrome-voice ▸
      // ---- chrome-voice ◂
      // ---- windows ▸
      // ---- windows ◂
      // ---- optics ▸
      // ---- optics ◂
      // ---- chrome-relay ▸ (Jarvis for Chrome)
      chromeLink: chromeLinkCtl ? chromeLinkCtl.control : null,
      // ---- chrome-relay ◂
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
    if (opts.brain) setTimeout(() => safe(() => panelCtl.revealBrain(opts.brain)), 420);
  }

  // ---- Home base sheet (v7.6, SPEC §24) ---------------------------------------------------------
  let homeBaseSheet = null;
  /**
   * The Home base sheet: Briefing · Research · Watching · Spending. { tab, jobId, watchId } opens it
   * there (a deep link, a notification, the morning card, the chat); already open, it switches.
   */
  function openHomeBase({ tab = 'briefing', jobId = '', watchId = '' } = {}) {
    if (!brain) return false;
    if (homeBaseSheet) {
      safe(() => homeBaseSheet.view.show(tab, { jobId, watchId }));
      return true;
    }
    let view;
    try {
      view = createHomeBaseView(brain, {
        tab,
        jobId,
        watchId,
        toast,
        onSettings: (focus) => {
          if (homeBaseSheet) homeBaseSheet.sheet.close('navigate');
          setTimeout(() => openSettings({ section: 'homebase', brain: focus === 'url' ? null : focus || 'key', focus: focus === 'url' ? 'homebase-url' : null }), 340);
        },
      });
    } catch (err) {
      console.error('[jarvis] the Home base sheet failed:', err);
      toast('The Home base sheet couldn’t open.', { level: 'error' });
      return false;
    }
    const sheet = createSheet({
      kind: 'full',
      title: 'Home base',
      testid: 'brain-sheet',
      closeTestid: 'brain-close',
      className: 'sheet--homebase',
      onClose: () => {
        safe(() => view.destroy());
        if (homeBaseSheet && homeBaseSheet.sheet === sheet) homeBaseSheet = null;
      },
    });
    sheet.body.appendChild(view.el);
    homeBaseSheet = { sheet, view };
    sheet.open();
    return true;
  }

  /** ?homebase=job:<id> | briefing | watch:<id> (a notification's link): the Home base sheet there. */
  function openHomeBaseLink(value) {
    const link = parseHomeBaseLink(value);
    if (!link || !brain || !brain.base()) return false;
    if (isVoiceModeOpen()) return false;
    // A notification tapped while Standby is on screen: the owner wants to look, and Standby sits
    // above the app and its sheets, so it is left first (its microphone released).
    if (standby && safe(() => standby.isOpen(), false)) safe(() => standby.exit());
    if (link.kind === 'job') return openHomeBase({ tab: 'research', jobId: link.id });
    if (link.kind === 'watch') return openHomeBase({ tab: 'watching', watchId: link.id });
    return openHomeBase({ tab: 'briefing' });
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
  let unlockArmedFor = '';
  const unlockOnce = () => {
    safe(() => unlockSpeech());
    document.removeEventListener('click', unlockOnce, true);
    document.removeEventListener('keydown', unlockOnce, true);
  };
  if (ttsOk) {
    document.addEventListener('click', unlockOnce, true);
    document.addEventListener('keydown', unlockOnce, true);
    // v7.8: George's voice from the home base turned on later (by itself, or on another screen): the next
    // tap unlocks its audio too, so a reply read aloud (Speak replies) can play it on iOS.
    safe(() =>
      onSettingsChange((next) => {
        if (next.homeBaseSpeak !== true || unlockArmedFor === next.homeBaseUrl) return;
        unlockArmedFor = next.homeBaseUrl;
        document.addEventListener('click', unlockOnce, true);
        document.addEventListener('keydown', unlockOnce, true);
      }),
    );
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
      // v7.8: a home base linked (or another one): George from it, on once by itself.
      if (s.homeBaseUrl && s.homeBaseUrl !== prev.homeBaseUrl && prev.homeBaseUrl !== undefined) setTimeout(() => checkVoiceAuto({ force: true }), 600);
      updateAll();
    }),
  );
  safe(() => onSpendChange(() => {
    renderBanners();
    renderPanelStatsSoon();
    updateCore(); // SPEND · TODAY on the tape and in the Systems glance (Watch frames too)
  }));
  // A fact undone from a chip, edited in Settings or changed in another tab: update the chips.
  safe(() => onMemoryChange(() => chat.refreshMemory()));
  // What a backup carries changed: the sync sends it 2 minutes after the last change (v7.6).
  if (syncCtl) {
    safe(() => onMemoryChange(() => noteSyncChange()));
    safe(() => onSettingsChange(() => noteSyncChange()));
    safe(() => onLibraryChange((e) => {
      if (!e || !e.remote) noteSyncChange();
    }));
  }
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
      // v7.8: back in front: have the home base load George before the next reply, and turn him on
      // once if that couldn't be done at launch (the home base didn't answer then).
      if (senses && !state.demo) safe(() => senses.prime({ voice: true }));
      checkVoiceAuto();
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

  // ---- v8.1: one router for what the owner says (SPEC §30) --------------------------------------
  // command-router.js picks which local command takes the words, in each surface's order; the surface
  // carries it out. Today's matchers were registered at the start (registerTodayCommands); each
  // track's own commands come from its module in src/ui/commands/ (registerCommandModules, below).

  /**
   * The router's view of the app at the moment of routing (contract (b)): command-router.js's
   * emptyState(surface) with what exists today, then `local` (the surface's own part: Voice Mode's
   * questions and prompt, whether it speaks, how the words came). Each builder fills its own fields
   * in its block below (keep them apart: one line between blocks).
   */
  function routerState(surface, local = null) {
    const s = emptyState(surface);
    const holo = getHologramViewer();
    const optics = currentOptics();
    s.hologram = holo ? safe(() => ({ open: true, inWindow: false, parts: holo.parts(), selected: holo.getState().selected || null }), null) : null;
    s.blueprintOpen = !!getBlueprintViewer();
    s.optics = optics ? { open: true, mode: optics.frozen ? 'frozen' : optics.state === 'live' ? 'live' : null, liveView: !!(optics.liveView && optics.liveView.on), card: null, cameraAllowed, sceneChanged: null } : null;
    s.camera = { supported: !state.demo && safe(() => cameraSupported(), false), allowed: cameraAllowed, ios: safe(() => isIOS(), false) };
    s.windows = screensCtl ? safe(() => screensCtl.list().map((w) => ({ id: w.id, kind: w.kind, label: w.label, focused: false })), []) : [];
    s.reply = { links: [], hologram: reopenableHologram() };
    s.music = { playing: safe(() => musicPlayer.isPlaying(), false) };
    s.homebase = { available: !!homeBase, linked: !!(brain && safe(() => brain.base(), null)) };
    s.standby = { available: !state.demo && !!standby, open: !!standby && safe(() => standby.isOpen(), false) };
    s.voiceOpen = !!voiceApi && safe(() => isVoiceModeOpen(), false);
    s.hidden = !!document.hidden;
    s.phone = phoneLike;
    // ---- mac-dev ▸ its state fields
    // ---- mac-dev ◂
    // ---- mac-hf ▸
    // ---- mac-hf ◂
    // ---- tours ▸ (s.tour)
    // The walkthrough on screen (its words claim "next", "back", "enclosed" only then), and the hologram
    // a "walk me through it" would tour: the open one, else the newest reply's (never an older one: L3).
    s.tour = holo && typeof holo.tour === 'function' ? safe(() => holo.tour(), null) : null;
    if (s.hologram && holo) s.hologram.title = safe(() => holo.getState().title, '') || '';
    s.tourReply = holo ? null : safe(() => tourReplyState(), null);
    // ---- tours ◂
    // ---- voice ▸
    // The chat's Speak reading an answer aloud: "stop" typed (or said in a viewer's field) stops it.
    if (surface !== 'voice') s.speaking = !!state.speaking;
    // The prices the paid commands say first (MONEY-5, MONEY-8): the briefing at the owner's team size and
    // depth, a Look warm or cold in this chat.
    s.briefingUsd = safe(() => briefingPrice(), 0);
    s.lookUsd = safe(() => lookEstimate(), 0);
    // ---- voice ◂
    // ---- windows ▸ (s.windows, s.reply.links)
    // The windows Jarvis opened (the one with the focus marked); a hologram's window carries its parts and
    // selection, for its words said here (windows-hologram, D3). The newest reply's links ("open the second link").
    s.windows = screensCtl
      ? safe(
          () =>
            screensCtl.list().map((w) => {
              const holoWin = w.kind === 'hologram' ? screensCtl.shown('hologram') : null;
              const own = holoWin && holoWin.id === w.id;
              return { id: w.id, kind: w.kind, label: w.label, focused: !!w.focused, ...(own ? { parts: holoWin.parts || [], selected: holoWin.selected || null } : {}) };
            }),
          [],
        )
      : [];
    s.reply.links = safe(() => newestReplyLinks(), []);
    // ---- windows ◂
    // ---- optics ▸ (s.optics.mode 'aside', card, sceneChanged)
    if (optics && s.optics) {
      // v8.1: a Look in its card beside the live video ('aside'), its labels, and (only then: a 64 × 36
      // grab) whether the scene changed since its picture.
      const look = safe(() => optics.card(), null);
      if (safe(() => optics.mode, null) === 'aside') s.optics.mode = 'aside';
      s.optics.card = look ? { frameId: look.frameId, labels: look.labels || [], aside: !!look.aside } : null;
      s.optics.sceneChanged = look && look.aside ? safe(() => optics.sceneChanged(), null) : null;
    }
    // ---- optics ◂
    // ---- fix-routing ▸ (REGRESS-2: what else a bare "stop" stops: the chat's turn, an answer, a mission or a
    // Look's answer, as its Stop button does; and Optics' Watch. ROUTING-R2-3: every chat's run in this window, and
    // whether another window runs one, which "stop" can only name)
    s.running = state.runs.size > 0;
    s.runningElsewhere = [...remoteRuns.values()].some((entry) => !entry.ending);
    if (s.optics) s.optics.watch = !!opticsLive.watch;
    // ROUTING-R2-10: the research offer's card in Optics: its ways, for its answers typed or said in Optics' field.
    s.researchOffer = researchAsk && researchAsk.card && researchAsk.offer ? { choices: safe(() => researchAsk.offer.choices.map((c) => ({ id: c.id, label: c.label, words: c.words, dear: !!c.dear })), []) } : null;
    // ---- fix-routing ◂
    // ---- chrome-relay ▸ (s.chrome)
    if (chromeLink) {
      const c = safe(() => chromeLink.state(), null);
      if (c) s.chrome = { ...(s.chrome || {}), linked: c.linked, online: c.online, task: c.task };
    }
    // ---- chrome-relay ◂
    // ---- chrome-voice ▸ (s.chrome: the link, the latest task, the Chrome context)
    // After chrome-relay's block: a task in its check ('starting', before Jarvis for Chrome has it) is the task a
    // typed "stop" or "cancel" withdraws (REDTEAM-VOICE-5); the rest comes from the same link.
    if (chromeVoice) s.chrome = { ...s.chrome, ...safe(() => chromeVoice.state(), {}) };
    // ---- chrome-voice ◂
    return local ? Object.assign(s, local) : s;
  }

  /** The hologram shown last over Voice Mode, while a command about it can open it again (free). */
  function reopenableHologram() {
    const seg = lastVoiceHologram && lastVoiceHologram.segment;
    const spec = seg && seg.status !== 'building' && isObj(seg.spec) && Array.isArray(seg.spec.parts) ? seg.spec : null;
    if (!spec) return null;
    return { title: String(spec.title || seg.title || ''), parts: spec.parts.filter(isObj).map((p) => ({ id: p.id, name: p.name, aka: Array.isArray(p.aka) ? p.aka : [] })) };
  }

  /**
   * A command registered by a src/ui/commands module, carried out on a surface (Voice Mode does its
   * own): its run() acts; `present(say)` shows its line. True when it acted.
   */
  function runRouted(hit, ctx, present) {
    let out;
    try {
      out = commandRouter.run(hit, { ...ctx, reading: hit.reading });
    } catch (err) {
      console.error('[jarvis] a command failed:', err);
      return false;
    }
    if (out === false) return false;
    Promise.resolve(out).then(
      (o) => present(o && typeof o.say === 'string' ? o.say : ''),
      () => present('That didn’t work.'),
    );
    return true;
  }

  /**
   * Words typed in the chat (or its microphone's, once in the box): the first local command the router
   * picks acts here (today: Screens, Apple Music, Standby, the home base, its brain). True when one did.
   */
  function routeChat(text) {
    const words = String(text || '');
    const st = routerState('chat', { via: 'typed' });
    for (let hit = commandRouter.route([words], st); hit; hit = commandRouter.route([words], st, { after: hit })) {
      if (runChat(hit, words)) return true;
    }
    return false;
  }

  function runChat(hit, text) {
    switch (hit.id) {
      case 'screens':
        return !!screenCommand(text, null, 'typed');
      case 'music':
        return !!musicCommand(text, { source: 'typed' });
      case 'standby':
        return standbyFromChat(text);
      case 'homebase':
        return homeBaseFromChat(text);
      case 'brain':
        return brainFromChat(text);
      default:
        return runRouted(hit, { surface: 'chat', via: 'typed' }, (say) => {
          if (say) toast(say, { level: 'info', id: 'command' });
        });
    }
  }

  /**
   * Words from a hologram's command field or its microphone: the first local command the router picks
   * acts (today: the hologram's own, then Screens, then Apple Music while Voice Mode is closed):
   * { handled: true, …the hologram's result } or { handled: true, notice: Promise<line> } (the viewer
   * shows the line); null: they go to Jarvis (the viewer sends them).
   */
  function routeFromViewer(text, opts = {}) {
    const words = String(text || '');
    const viewer = opts.viewer || getHologramViewer();
    const st = routerState('hologram', { via: opts.source === 'voice' ? 'voice' : 'typed' });
    for (let hit = commandRouter.route([words], st); hit; hit = commandRouter.route([words], st, { after: hit })) {
      const out = runFromViewer(hit, words, viewer, opts);
      if (out) return out;
    }
    return null;
  }

  function runFromViewer(hit, text, viewer, opts) {
    const clean = text.trim();
    switch (hit.id) {
      case 'standby':
        // v8.1 (C2): the Standby words in the hologram's field too.
        return standbyFromViewer() ? { handled: true } : null;
      case 'hologram': {
        const res = viewer ? safe(() => viewer.command(text, opts), null) : null;
        if (!(res && res.handled)) return null;
        // v8.1: "go back" with nothing to go back to is answered (C3); a part that took camera words
        // says how to reach the camera (R10).
        const cmd = res.command || {};
        if (cmd.action === 'close-blueprint' && !getBlueprintViewer()) return { ...res, notice: Promise.resolve(nothingBackAck()) };
        const hint = partHint(text, cmd);
        return hint ? { ...res, notice: Promise.resolve(hint) } : res;
      }
      case 'screens': {
        // "Put this on my other screen" typed in a viewer: a screen command, not a message for Jarvis.
        const sc = screenCommand(clean, null, 'viewer');
        return sc ? { handled: true, notice: sc.done.then((o) => screenMessage(o)) } : null;
      }
      case 'music': {
        // "Play Back in Black": found in Apple Music, free; the card is in the chat behind the viewer.
        const mc = !voiceApi ? musicCommand(clean, { source: 'viewer' }) : null;
        if (!mc) return null;
        return { handled: true, notice: mc.done.then((out) => (mc.stop ? out.ack : `${out.ack}${out.segment && out.segment.items.length ? ' It’s in the chat.' : ''}`)) };
      }
      default: {
        let said = null;
        const notice = new Promise((resolve) => (said = resolve));
        // A line for a viewer that closed meanwhile ("open the library" closes it first) is a toast.
        const present = (say) => (getHologramViewer() ? said(say) : (said(''), say && toast(say, { level: 'info', id: 'command' })));
        return runRouted(hit, { surface: 'hologram', via: opts.source === 'voice' ? 'voice' : 'typed' }, present) ? { handled: true, notice } : null;
      }
    }
  }

  /**
   * Words typed in Optics' field (spoken: heard by its own microphone): the first local command the
   * router picks acts (today: Screens, then Optics' own words; typed, only the live view's words and
   * "stop watching"): { handled: true, ack, done? } (Optics announces the ack, and done's line), or
   * null: Optics takes them as the Look's question (live) or a follow-up (frozen).
   */
  function routeFromOptics(text, { spoken = false, alternatives = [] } = {}) {
    const words = String(text || '');
    // PRIVACY-3: Optics' own microphone gives every reading, best first; the router takes another one
    // only for what R7 allows (never the camera, a paid action or the microphone), and the command acts
    // on the reading it chose.
    const readings = [words];
    for (const a of Array.isArray(alternatives) ? alternatives : []) {
      const r = typeof a === 'string' ? a.trim() : '';
      if (r && !readings.some((x) => x.toLowerCase() === r.toLowerCase())) readings.push(r);
    }
    const st = routerState('optics', { via: spoken ? 'voice' : 'typed' });
    for (let hit = commandRouter.route(readings, st); hit; hit = commandRouter.route(readings, st, { after: hit })) {
      const chosen = typeof hit.reading === 'string' && hit.reading ? hit.reading : words;
      if (hit.id === 'standby') {
        // v8.1 (C2): the Standby words in Optics' field too.
        if (standbyFromViewer()) return { handled: true, ack: '' };
      } else if (hit.id === 'screens') {
        if (screenCommand(chosen, null, spoken ? 'voice' : 'typed')) return { handled: true, ack: '' };
      } else if (hit.id === 'optics') {
        const optics = currentOptics();
        const res = optics ? safe(() => optics.command(chosen), null) : null;
        if (res && res.handled) return { handled: true, ack: (res.command && res.command.ack) || '' };
      } else {
        let said = null;
        const done = new Promise((resolve) => (said = resolve));
        const present = (say) => (currentOptics() ? said(say) : (said(''), say && toast(say, { level: 'info', id: 'command' })));
        if (runRouted(hit, { surface: 'optics', via: spoken ? 'voice' : 'typed' }, present)) return { handled: true, ack: '', done };
      }
    }
    return null;
  }

  // ---- voice (Track 3): what the app's own commands do (src/ui/commands/voice.js) ---------------

  /** "Go to standby" in a hologram's or Optics' field: the viewers close and Standby opens. */
  function standbyFromViewer() {
    if (state.demo || !standby) return false;
    closeViewersForSheet();
    return enterStandby();
  }

  /** Before a sheet opens by voice: the viewers that would cover it close (as the owner would, to tap its button). */
  function closeViewersForSheet() {
    const sheet = getBlueprintViewer();
    if (sheet) safe(() => sheet.close());
    const holo = getHologramViewer();
    if (holo) safe(() => holo.close());
    const optics = currentOptics();
    if (optics) safe(() => optics.close());
  }

  /** The device's voice, by name, for "This is the Mac's own voice." */
  function deviceName() {
    if (onMac) return 'Mac';
    if (safe(() => isIOS(), false)) return /iPad/.test(navigator.userAgent || '') ? 'iPad' : 'iPhone';
    return phoneLike ? 'phone' : 'computer';
  }

  /** Open a sheet as its button does: { linked?, none? } for the line. */
  function openSheetNow(sheet, section) {
    switch (sheet) {
      case 'history':
        openHistory();
        return {};
      case 'settings':
        openSettings(section ? { section } : {});
        return {};
      case 'library':
        openLibrary();
        return {};
      case 'mission': {
        const turn = state.conv ? turnsOf(state.conv).filter((t) => Object.keys(missionsOf(t)).length).pop() : null;
        if (!turn) return { none: true };
        openMission(turn);
        return {};
      }
      case 'homebase':
        if (!getSettings().homeBaseUrl || !brain) {
          openSettings({ section: 'homebase', focus: 'homebase-url' });
          return { linked: false };
        }
        return openHomeBase() ? {} : { linked: false };
      default:
        return {};
    }
  }

  function voiceCommandDeps() {
    return {
      newChat: () => newChat(),
      // From Voice Mode: Jarvis says the line, Voice Mode closes (not into Standby), then the sheet opens;
      // from a viewer's field: the viewers close first. Mission Control with no mission opens nothing.
      openSheet: (sheet, { section = null, surface = 'chat' } = {}) => {
        if (sheet === 'mission' && !(state.conv && turnsOf(state.conv).some((t) => Object.keys(missionsOf(t)).length))) return { none: true };
        if (sheet === 'homebase' && (!getSettings().homeBaseUrl || !brain)) {
          if (surface === 'voice') return { linked: false, leave: () => openSheetNow(sheet, section) };
          closeViewersForSheet();
          return openSheetNow(sheet, section);
        }
        if (surface === 'voice' && safe(() => isVoiceModeOpen(), false)) return { leave: () => openSheetNow(sheet, section) };
        if (surface === 'hologram' || surface === 'optics') closeViewersForSheet();
        return openSheetNow(sheet, section);
      },
      useVoice: async (which) => {
        const device = deviceName();
        if (which === 'device') {
          saveSettings({ naturalVoice: false, homeBaseSpeak: false, homeBaseSpeakBy: 'owner' });
          return { ok: true, device };
        }
        // George from the home base when its voice can speak now; else the one on this device.
        if (getSettings().homeBaseUrl && homeBaseVoice && !state.demo && safe(() => homeBaseVoice.canSpeak(), false)) {
          saveSettings({ homeBaseSpeak: true, homeBaseSpeakBy: 'owner' });
          return { ok: true, device };
        }
        const downloaded = naturalVoice ? await safe(() => naturalVoice.isDownloaded(), Promise.resolve(false)).catch(() => false) : false;
        if (downloaded) {
          saveSettings({ naturalVoice: true, naturalVoiceId: 'bm_george' });
          return { ok: true, device };
        }
        openSettings({ section: 'voice' });
        return { ok: false, needsDownload: !!naturalVoice, device };
      },
      spend: () => ({
        todayUsd: safe(() => todaySpend(), 0),
        monthUsd: safe(() => getSpend().monthUsd, 0),
        liveUsd: safe(() => liveViewBudget().spent(), 0),
      }),
      // SHOULD C5: the one-tap button for a Look at the screen (its share picker needs a tap); the
      // price on it. In the chat, the line is the toast that carries the button.
      screenLook: ({ surface = 'chat' } = {}) => {
        if (state.demo || !safe(() => screenLookSupported(), false)) return { supported: false };
        const fromVoice = surface === 'voice' && !!voiceApi && safe(() => isVoiceModeOpen(), false);
        const tap = () => openOpticsScreen({ start: 'screen', voice: fromVoice });
        if (fromVoice) {
          safe(() => voiceApi.offer({ label: `Look at my screen · about ${centsOf(lookEstimate())}¢`, testid: 'voice-screen-look', onTap: tap }));
          return { supported: true };
        }
        if (surface === 'hologram' || surface === 'optics') closeViewersForSheet();
        const cents = centsOf(lookEstimate());
        toast(`Tap Look to look at your screen. A Look costs about ${cents} cent${cents === 1 ? '' : 's'}.`, { level: 'info', id: 'screen-look', timeout: 30000, action: { label: 'Look', fn: tap } });
        return { supported: true, shown: true };
      },
      // SHOULD C6: "brief me" with no home base (asked first in Voice Mode): the briefing protocol's words.
      briefing: () => {
        const p = safe(() => getProtocol('morning-briefing'), null);
        const text = p ? safe(() => p.buildPrompt({ input: '', settings: getSettings(), now: new Date() }), '') : '';
        if (!text) return false;
        safe(() => presence.noteBriefing(new Date()));
        return { send: text, mode: p.mode || 'swarm' };
      },
      stopTarget: (target) => {
        switch (target) {
          case 'answer': {
            // Every chat's turn in this window (an answer, a mission, a Look's answer), as each chat's Stop button
            // stops it (REGRESS-2, ROUTING-R2-3): { here, other } for the line ("… in your other chat is stopped").
            const openId = state.conv ? state.conv.id : null;
            const did = { here: 0, other: 0 };
            for (const [id, entry] of [...state.runs.entries()]) {
              if (!entry || !entry.run || !safe(() => (entry.run.abort(), true), false)) continue;
              if (id === openId) did.here += 1;
              else did.other += 1;
            }
            return did;
          }
          case 'watch': {
            const optics = currentOptics();
            if (optics) safe(() => optics.stopWatch());
            break;
          }
          case 'liveview': {
            const optics = currentOptics();
            if (optics) safe(() => optics.stopLiveView());
            break;
          }
          case 'music':
            safe(() => musicPlayer.stop());
            break;
          case 'speech':
            safe(() => stopSpeakingNow());
            break;
          case 'tour': {
            // tours: the walkthrough pauses at its step ("continue" goes on); its narration stops with Jarvis's voice
            const viewer = getHologramViewer();
            if (viewer && typeof viewer.tourCommand === 'function') safe(() => viewer.tourCommand({ do: 'tour-pause' }));
            break;
          }
          case 'chrome':
            // v8.1 chrome-voice: a bare "stop" withdraws a Chrome check and stops the Chrome task too; what it did
            // ({ withdrawn, stopping }) makes voice's line ("Chrome is stopping.", "Okay, nothing sent to Chrome.").
            return safe(() => (chromeVoice ? chromeVoice.stopFromVoice() : undefined), undefined);
          default:
            break;
        }
      },
    };
  }

  /**
   * Each track's commands, registered once (contract (b)): every module gets the shared deps plus its
   * own, added in its own call below (keep one line between calls).
   */
  // ---- chrome-voice ▸ Jarvis for Chrome by voice (v8.1 G4, G5): the controller and its cards in the chat
  // (src/ui/chrome-task.js). Tasks, prompts and the final answer reach Jarvis here: Voice Mode says them
  // (api.prompt, api.chrome), the chat shows the cards above the composer, and with Voice Mode closed or
  // on Standby a prompt is a notification.
  const chromeDock = h('div', { class: 'chrome-dock', attrs: { 'data-testid': 'chrome-dock' } });
  main.insertBefore(chromeDock, composer.el);
  const chromeVoice = safe(
    () =>
      createChromeVoice({
        link: () => chromeLink, // app.chromeLink (contract (f), chrome-relay's), or null (demo, a phone)
        voice: () => voiceAdapter(voiceApi && safe(() => isVoiceModeOpen(), false) ? voiceApi : null),
        dock: chromeDock,
        notify: (n) => notifyAttention(n),
        closeNotice: (tag) => closeNotify(tag),
        focusApp: () => safe(() => window.focus()),
        toast: (msg, opts) => toast(msg, opts),
        hidden: () => !!document.hidden,
        // This device's other Jarvis windows: prompts, their closing and a task's end reach each of them (REDTEAM-VOICE-7).
        channel: () => (typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHROME_VOICE_CHANNEL) : null),
      }),
    null,
  );
  safe(() => window.addEventListener('pagehide', () => safe(() => chromeVoice && chromeVoice.bye())));
  // Tests on localhost only ('jarvis.dev.chromeVoice' = '1'): window.__jarvisChromeVoice.question(spec) asks an owner
  // question in the open Voice Mode (the chrome-voice-stack E2E: a stand-in for a tour's decision beside a prompt).
  safe(() => {
    const host = location.hostname;
    if ((host === 'localhost' || host === '127.0.0.1') && localStorage.getItem('jarvis.dev.chromeVoice') === '1') {
      window.__jarvisChromeVoice = { question: (spec) => !!voiceApi && safe(() => !!voiceApi.question(spec), false) };
    }
  });
  // ---- chrome-voice ◂

  function registerCommandModules() {
    const shared = {
      getSettings,
      saveSettings,
      toast: (msg, opts) => toast(msg, opts),
      voice: () => (voiceApi && safe(() => isVoiceModeOpen(), false) ? voiceApi : null),
      routerState: (surface, local) => routerState(surface, local),
      phone: phoneLike,
      demo: state.demo,
      wakePending, // v8.1 (D3): wakePending.add(fn, { waits }) -> remove: a line before the wake greeting
    };
    const register = (name, fn, deps) => {
      try {
        fn(commandRouter, deps);
      } catch (err) {
        console.error(`[jarvis] the ${name} commands could not register:`, err);
      }
    };
    // mac-hf (src/ui/commands/mac.js):
    register('mac', registerMacCommands, { ...shared });
    // mac-dev (src/ui/commands/audio.js):
    register('audio', registerAudioCommands, { ...shared, audio: audioDevices });
    // tours (src/ui/commands/tours.js):
    register('tour', registerTourCommands, { ...shared, tours: { viewer: () => getHologramViewer(), openReply: () => openReplyHologram() } });
    // voice (src/ui/commands/voice.js):
    register('voice', registerVoiceCommands, { ...shared, ...voiceCommandDeps() });
    // chrome-voice (src/ui/commands/chrome-voice.js):
    register('chrome-voice', registerChromeVoiceCommands, { ...shared, chromeLink, chromeVoice: () => chromeVoice });
    // windows (src/ui/commands/windows.js):
    register('windows', registerWindowCommands, { ...shared, screens: screensCtl, tabs: browserTabs, thisInputs: () => thisInputs(), links: () => newestReplyLinks(), closeViewers: () => closeViewers() });
    // optics (src/ui/commands/optics.js):
    register('optics', registerOpticsCommands, { ...shared, opticsCommand: opticsCommandByWords, openOptics: openOpticsByWords, closeCamera: closeCameraByWords, researchThis, answerResearch: answerResearchOffer, hologramPart: hologramPartByWords });
    // chrome-relay (src/ui/commands/chrome.js):
    register('chrome', registerChromeCommands, { ...shared, chromeLink, openSettings: (opts) => openSettings(opts) });
  }
  registerCommandModules();

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
  // v8.1 (A11): back on Standby after a restart or an update, without a click (a Mac whose owner wakes Jarvis by voice).
  // REGRESS-1: only where it can listen. Another Jarvis window holding Standby (the lock): this one opens on the app as
  // in v8.0, and never waits in line for the microphone; one that loses a race to it steps back by itself (launch).
  else if (safe(() => standbyAtLaunch(), false)) {
    Promise.resolve(safe(() => standbyHeldSomewhere(), false))
      .catch(() => false)
      .then((held) => {
        if (!held && !isVoiceModeOpen() && safe(() => standbyAtLaunch(), false)) safe(() => enterStandby({ again: true, launch: true }));
      });
  }

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
  if (params.get('optics') === '1' && opticsAvailable()) setTimeout(() => openOpticsScreen(), 0);

  // Home base (v7.6): ?homebase=job:<id> | briefing | watch:<id> (a notification opened Jarvis) opens
  // the Home base sheet there; the link leaves the address (a reload doesn't reopen it). A tapped
  // notification while Jarvis is open arrives from the service worker (HOMEBASE_LINK). At start, a
  // new morning briefing puts its card at the top of the home.
  if (brain) {
    const link = params.get('homebase');
    if (link) {
      try {
        const u = new URL(location.href);
        u.searchParams.delete('homebase');
        window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
      } catch {
        /* keep the address */
      }
      if (!onboardingSheet) setTimeout(() => safe(() => openHomeBaseLink(link)), 0);
    }
    try {
      if (navigator.serviceWorker && typeof navigator.serviceWorker.addEventListener === 'function') {
        navigator.serviceWorker.addEventListener('message', (event) => {
          const data = event && event.data;
          if (!data || typeof data !== 'object' || data.type !== 'HOMEBASE_LINK' || typeof data.link !== 'string') return;
          safe(() => openHomeBaseLink(data.link));
        });
        // Messages from the worker wait until the page says it listens.
        if (typeof navigator.serviceWorker.startMessages === 'function') navigator.serviceWorker.startMessages();
      }
    } catch {
      /* no service worker here */
    }
    if (brain.base()) setTimeout(() => safe(() => brain.checkMorning()), 1200);
  }
  // Hearing and voice through the home base (v7.7): one reading at launch when either is on, and the
  // context words Whisper gets with each utterance (the owner's name, the parts of the hologram on
  // screen, this conversation's title and the names in its latest messages).
  if (senses && !state.demo) {
    hearPrompt = () => {
      const conv = state.conv;
      const turns = conv && Array.isArray(conv.turns) ? conv.turns : [];
      const texts = [];
      for (let i = turns.length - 1; i >= 0 && texts.length < 2; i--) {
        const t = turns[i];
        if (t && t.role === 'user' && typeof t.text === 'string') texts.push(t.text);
        else if (t && t.role === 'jarvis' && Array.isArray(t.segments)) texts.push(t.segments.filter((g) => g && g.kind === 'text' && typeof g.text === 'string').map((g) => g.text).join(' ').slice(0, 4000));
      }
      const parts = safe(() => voiceVisuals.vocabulary().parts, []) || [];
      return contextPrompt({ names: ['Jarvis', getSettings().userName, ...parts], title: conv && conv.title, texts });
    };
    setTimeout(() => safe(() => senses.prime()), 1500);
    // v7.8: George from the home base, on once by itself; a notice left from the last launch comes back.
    setTimeout(() => {
      if (voiceNotice) safe(() => voiceNotice.resume());
      checkVoiceAuto();
    }, 1700);
  }
  // Sync (v7.6): a first sync a few seconds after the boot, then every 10 minutes while open.
  if (syncCtl) safe(() => syncCtl.start());

  // Presence: the boot sequence on the home screen (once a session by default), then the scan for
  // interrupted replies in recent conversations (Needs-you).
  if (chat.isEmpty() && !onboardingSheet) safe(() => presence.boot({ emptyEl: chat.emptyElement() }));
  setTimeout(() => safe(() => presence.scan()), 400);

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
    // Not restoring: an interrupted reply in a recent conversation becomes a Needs-you item
    // (presence.scan(), after the boot), quieter than a toast (SPEC 2.4.1 rule 8).
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
    presence,
  };
}
