// Application shell: owns app state (current conversation, active runs, layout, sheets),
// wires the engine to the platform modules and the UI components, and maps Jarvis's
// activity onto the HUD core (idle / listening / thinking / working / speaking / error /
// offline). Demo mode (?demo=1) swaps in a scripted engine and an in-memory store.

import { h, on, raf, throttle } from './dom.js';
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
import { recordTurn, createStatsView, createStatsLauncher, exportStats, importStats } from './stats.js';
import { createShareOptions } from './share.js';
import { createFollowupChips, parseProtocolPrompt, exportCustomProtocols, importCustomProtocols } from './protocols.js';
import { fmtUsd } from './hud/format.js';
import { createJarvis, MODELS, DEPTHS } from '../engine/index.js';
import { suggestFollowups } from '../engine/followups.js';
import { getSettings, saveSettings, onSettingsChange } from '../platform/settings.js';
import { getApiKey, getDevApiBase } from '../platform/secrets.js';
import { listMemory, addMemory, removeMemory } from '../platform/memory.js';
import { addSpend, getSpend, onSpendChange } from '../platform/spend.js';
import { listConversations, getConversation, saveConversation, deleteConversation, deleteAllConversations, isPersistent } from '../platform/db.js';
import { resetApp, registerBackupPart } from '../platform/backup.js';
import { isOnline, onOnlineChange } from '../platform/env.js';
import { keepAwake, allowSleep } from '../platform/wakelock.js';
import { registerServiceWorker } from '../platform/pwa.js';
import { sttSupported, startListening } from '../platform/voice/stt.js';
import { ttsSupported, unlockSpeech, speak, stopSpeaking, toSpeech } from '../platform/voice/tts.js';

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
      memory: { list: () => listMemory(), add: (text) => addMemory(text), remove: (text) => removeMemory(text) },
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
    onHistory: () => openHistory(),
    onSettings: () => openSettings(),
    onNewChat: () => newChat(),
  });

  const chat = createChat({
    isTurnActive: (turnId) => {
      for (const entry of state.runs.values()) if (entry.run.turn && entry.run.turn.id === turnId) return true;
      return false;
    },
    canResume: () => !!(state.conv && !state.runs.has(state.conv.id) && safe(() => engine.canResume(state.conv), false)),
    onResume: () => resume(),
    onRetry: (turn) => retry(turn),
    onCopy: (turn) => copyTurn(turn),
    onShare: (turn) => openShare(turn),
    onSpeak: (turn) => toggleSpeakTurn(turn),
    isSpeaking: (turnId) => !!(state.speaking && state.speaking.turnId === turnId),
    onOpenMission: (turn, missionId) => openMission(turn, missionId),
    onOpenSettings: (section) => openSettings({ section, focus: section === 'apikey' ? 'apikey-input' : null }),
    onNewChat: () => newChat(),
    onSuggestion: (text, mode) => {
      composer.setMode(mode);
      if (!send(text, mode)) composer.setText(text);
    },
    // A protocol's mode applies to that run only (the composer keeps its own mode). Returning
    // send()'s boolean keeps the protocol's input row open when the run couldn't start.
    onProtocol: (text, mode) => send(text, mode),
    getSettings: () => getSettings(),
    sounds,
    getGreeting: () => greeting(),
    ttsSupported: ttsOk,
  });

  const composer = createComposer({
    mode: state.lastSettings.mode,
    micSupported: sttOk,
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
  const announce = throttle((msg) => {
    if (!msg || msg === lastAnnounce) return;
    lastAnnounce = msg;
    live.textContent = msg;
    setTimeout(() => {
      if (lastAnnounce === msg) lastAnnounce = '';
    }, 4000);
  }, 2500);

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
    if (Date.now() < state.errorUntil) return ['error', 'Online'];
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
      history.setPersistent(store.isPersistent());
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
    stopSpeakingNow();
    let conv = state.conv;
    const fresh = !conv;
    if (!conv) conv = engine.newConversation();
    const input = { text: clean, mode: mode || composer.getMode() };
    if (attachments.length) input.attachments = attachments;
    const maxAgents = extras ? Number(extras.maxAgents) : NaN;
    if (Number.isFinite(maxAgents) && maxAgents >= 1) input.maxAgents = Math.min(20, Math.round(maxAgents));
    clearFollowups();
    let run;
    try {
      run = engine.startTurn(conv, input);
    } catch (err) {
      console.error('[jarvis] startTurn failed:', err);
      toast(err && err.message ? err.message : 'Jarvis couldn’t start that request.', { level: 'error' });
      return false;
    }
    attachRun(conv, run);
    safe(() => sounds.cue('send'));
    if (fresh || state.conv !== conv) setConversation(conv);
    else chat.sync();
    chat.scrollToBottom(false);
    updateAll();
    scheduleHistoryRefresh();
    if (state.layout === 'phone') composer.blur();
    return true;
  }

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
    const key = safe(getApiKey, '');
    if (s.followups === false || state.demo || !state.online || !key || !turn) return;
    const answer = (turnText(turn, true) || turnText(turn, false)).trim();
    if (!answer) return;
    const turns = (conv && conv.turns) || [];
    const user = turns.slice(0, Math.max(0, turns.indexOf(turn))).reverse().find((t) => t.role === 'user');
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
    suggestFollowups({ apiKey: key, apiBase: safe(getDevApiBase, ''), question, answer, signal: controller.signal, onSpend: (usd) => safe(() => addSpend(usd)) })
      .catch(() => [])
      .then((qs) => {
        if (followup === current) chips.set(qs);
      });
  }

  function attachRun(conv, run) {
    const entry = { run, conv, unsub: null, missions: new Set(), started: new Set(), ended: new Set(), agentsDone: new Set() };
    state.runs.set(conv.id, entry);
    entry.unsub = run.on('*', (evt) => onRunEvent(entry, evt));
    Promise.resolve(run.done)
      .catch((err) => console.error('[jarvis] run failed:', err))
      .then(() => onRunDone(entry));
    safe(() => keepAwake());
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
    if (state.runs.get(entry.conv.id) === entry) state.runs.delete(entry.conv.id);
    if (!state.runs.size) safe(() => allowSleep());
    const turn = entry.run.turn;
    if (turn && !state.demo) safe(() => recordTurn(turn));
    if (isCurrent(entry)) {
      chat.refresh();
      mcMarkDirty(turn, null);
    }
    refreshHistory();
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
    if (status === 'done') safe(() => sounds.play('reply-done'));
    else if (status === 'error') safe(() => sounds.cue('error'));
    const finished = safe(() => describeFinishedTurn(turn, entry.conv), null);
    if (finished) safe(() => missionFinished(finished));
    if (status === 'done' && isCurrent(entry)) {
      autoSpeak(turn);
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
      if (turns[i].role === 'user') {
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

  // ---- copy & speech ---------------------------------------------------------------------
  function turnText(turn, lastRequestOnly) {
    const segs = (turn.segments || []).filter((s) => s.kind === 'text' && s.text && s.text.trim());
    if (!segs.length) return '';
    let use = segs;
    if (lastRequestOnly) {
      const maxReq = Math.max(...segs.map((s) => Number(s.req) || 0));
      use = segs.filter((s) => (Number(s.req) || 0) === maxReq);
    }
    return use.map((s) => s.text).join('\n\n');
  }

  async function copyTurn(turn) {
    const text = plainText(turnText(turn, false));
    const ok = await copyText(text);
    toast(ok ? 'Copied to clipboard.' : 'Couldn’t copy. Select the text instead.', { level: ok ? 'success' : 'warn', id: 'copy' });
  }

  function stopSpeakingNow() {
    if (!state.speaking) return;
    const { handle } = state.speaking;
    state.speaking = null;
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

  function speakTurn(turn, mode) {
    if (!ttsOk) return;
    const md = turnText(turn, true);
    const text = safe(() => toSpeech(md, mode), '');
    if (!text) return;
    stopSpeakingNow();
    const s = getSettings();
    const entry = { turnId: turn.id, handle: null };
    state.speaking = entry;
    try {
      entry.handle = speak(text, {
        voiceURI: s.voiceURI,
        rate: s.voiceRate,
        onBoundary: () => pulseLevel(),
        onEnd: () => {
          if (state.speaking === entry) {
            state.speaking = null;
            chat.refreshSpeaking();
            updateCore();
          }
        },
      });
    } catch (err) {
      console.error('[jarvis] speak failed:', err);
      state.speaking = null;
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
            if (send(text, composer.getMode())) composer.setText('');
          }
        },
        onEnd: finish,
        onError: (e) => {
          const code = e && e.code;
          const msg =
            code === 'not-allowed'
              ? 'Microphone access is blocked. Allow it in your browser’s site settings.'
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
    return (state.conv.turns || []).find((t) => t.id === turnId) || null;
  }

  function selectLatestMission() {
    state.mcSel = null;
    const turns = (state.conv && state.conv.turns) || [];
    for (let i = turns.length - 1; i >= 0 && !state.mcSel; i--) {
      const t = turns[i];
      if (t.role !== 'jarvis' || !t.missions) continue;
      const segs = (t.segments || []).filter((s) => s.kind === 'mission' && t.missions[s.missionId]);
      const ids = segs.length ? segs.map((s) => s.missionId) : Object.keys(t.missions);
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
    const id = missionId || Object.keys(turn.missions || {}).pop();
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
      if (t.role !== 'jarvis') continue;
      replies += 1;
      const st = t.stats || {};
      if (t.status === 'running') {
        for (const m of Object.values(t.missions || {})) agents += (m.agents || []).length;
      } else {
        agents += st.agents || 0;
        searches += st.searches || 0;
        sources += st.sources || 0;
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
      if (onboardingSheet) return;
      e.preventDefault();
      if (settingsSheet) settingsSheet.close('shortcut');
      if (installSheet) installSheet.close('shortcut');
      if (shareSheet) shareSheet.close('shortcut');
      if (systemsSheet) systemsSheet.close('shortcut');
      newChat();
      composer.focus();
      return;
    }
    if (e.key === '/' && !mod && !e.altKey && !anySheetOpen()) {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      composer.focus();
    }
  });

  // iOS needs speech to be started from a user gesture once.
  const unlockOnce = () => {
    safe(() => unlockSpeech());
    document.removeEventListener('pointerdown', unlockOnce, true);
    document.removeEventListener('keydown', unlockOnce, true);
  };
  if (ttsOk) {
    document.addEventListener('pointerdown', unlockOnce, true);
    document.addEventListener('keydown', unlockOnce, true);
  }

  safe(() =>
    onOnlineChange((online) => {
      const was = state.online;
      state.online = typeof online === 'boolean' ? online : safe(() => isOnline(), true);
      updateAll();
      if (!was && state.online && state.conv && !currentRunning() && safe(() => engine.canResume(state.conv), false)) {
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

  async function restoreLast() {
    let saved = null;
    try {
      saved = JSON.parse(uiGet(UI_KEYS.last) || 'null');
    } catch {
      saved = null;
    }
    if (saved && saved.id && Date.now() - (Number(saved.at) || 0) < RESTORE_WINDOW_MS) {
      const conv = await store.get(saved.id).catch(() => null);
      if (conv && conv.turns && conv.turns.length) {
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
  };
}
