// Presence controller (SPEC 2.4): the one place that turns real app state into the HUD — the
// header's state word, privacy pills and sensor tape, the home screen (state word, situation line,
// Needs-you, quick keys, Full HUD readouts, the core legend), the desktop awareness rail
// (chronometer, Needs-you, Systems glance, the Home base tile), and the Living Core's telemetry,
// sensor beads and alert bead. It also keeps the Needs-you ledger, runs the startup scan for interrupted replies,
// applies the HUD preferences (Calm/Full, motion, boot) and plays the once-a-session boot.
//
//   const presence = createPresence({ root, demo, sttOk, getSettings, getSpend, getTodaySpend,
//                                     store, canResume, sounds, actions });
//   header gets presence.pills.el / presence.tape.el / presence.phoneTape.el;
//   chat gets presence.home; the desktop panel gets presence.rail.el.
//   presence.update(appSnapshot)         // after any change (coalesced to one frame)
//   presence.noteRunEnded(conv, turn, { away, briefing })
//   presence.noteSeen(convId) · presence.noteBriefing(date) · presence.forget(convId)
//   presence.scan() · presence.boot() · presence.cue('answer')
//
// Everything shown maps to a named source (SPEC rule 1). Never throws into the app.

import { h, raf, setText } from '../dom.js';
import { setCoreMotion } from '../hud/core.js';
import { getHud, saveHud, onHudChange } from './hud-prefs.js';
import {
  stateWord,
  telemetryOf,
  runningMissions,
  situationLine,
  deriveNeeds,
  readyBriefing,
  normalizeLedger,
  noteUnread,
  noteSeen,
  noteBriefing,
  forgetConversation,
  interruptedInfo,
  unreadFromTurn,
  chronometer,
  partOfDay,
  briefingName,
  heroSize,
  money,
  LEDGER_KEY,
  dayKeyOf,
} from './model.js';
import { createStateWord, createLivePills, createTape, createNeedsList, createQuickKeys, createReadouts, createLegend, createChronometer, createSystemsGlance } from './views.js';
import { createHomeBaseTile, homeBaseGlance } from '../homebase.js';

const BOOT_SESSION_KEY = 'jarvis.ui.booted';
const BUILD_KEY = 'jarvis.ui.build';
const UPDATED_MS = 3000;
const SCAN_MAX = 6; // recent conversations checked at startup for an interrupted reply
const SCAN_WINDOW_MS = 48 * 3600 * 1000;
const ANNOUNCE_GAP_MS = 2000;
const LONG_PRESS_MS = 520;

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.error('[jarvis] presence:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function store(kind) {
  try {
    const s = kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

function isMac() {
  try {
    const ua = navigator.userAgent || '';
    return /Macintosh/.test(ua) && !(navigator.maxTouchPoints > 1);
  } catch {
    return false;
  }
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root                 the app root (gets data-density / data-motion)
 * @param {boolean} o.demo
 * @param {boolean} o.sttOk                     speech recognition available (the MIC bead is ready)
 * @param {() => object} o.getSettings
 * @param {() => { monthUsd: number }} [o.getSpend]
 * @param {() => number|null} [o.getTodaySpend]  today's recorded spend (Records), USD
 * @param {{ list: Function, get: Function }} o.store
 * @param {(conv: object) => boolean} o.canResume
 * @param {{ play?: Function, haptic?: Function }} [o.sounds]
 * @param {object} o.actions  openConversation(id) · resume(convId) · retry(convId, turnId) ·
 *   openSettings(opts) · openSystems() · openHistory() · talk() · look(event) · brief() ·
 *   screen?() · standby?() · stopSensor(kind) · spendDismissed() → bool
 * @param {object} [o.homeBase]  the Home base controller (src/ui/homebase.js, v7.5): a tile on the
 *   home and one in the rail; the Systems glance's "Jarvis Core" row and the tape's CORE follow it
 */
export function createPresence(o) {
  const actions = o.actions || {};
  const sounds = o.sounds || {};
  const root = o.root;
  const local = store('local');
  const session = store('session');
  const locale = undefined; // the browser's locale

  let ledger = normalizeLedger(local ? readJson(local, LEDGER_KEY) : null);
  let interrupted = []; // from the startup scan
  let snap = { coreState: 'idle', agents: 0, listening: false, speaking: false, online: true, convId: null, turns: [], optics: false, watchLeftMs: null };
  let hud = getHud();
  let updatedUntil = 0;
  let cameraPresent = false;
  let lastNeedsIds = new Set();
  let needsPrimed = false;
  let destroyed = false;

  // ---- views ----------------------------------------------------------------------------------
  const pills = createLivePills({ onStop: (kind) => safe(() => actions.stopSensor && actions.stopSensor(kind)) });
  const tape = createTape({ onOpen: () => safe(() => actions.openSystems && actions.openSystems()) });
  const phoneTape = createTape({ testid: 'sensor-tape-phone', interactive: false });
  phoneTape.el.classList.add('hud-tape--phone');

  // Home (phone and desktop center).
  const homeWord = createStateWord({ testid: 'state-word' });
  const situation = h('p', { class: 'situation', attrs: { 'data-testid': 'situation' } });
  const homeNeeds = createNeedsList({ onAction: (item) => onNeedsAction(item), onMore: () => safe(() => actions.openHistory && actions.openHistory()) });
  homeNeeds.el.classList.add('needs--home');
  const keyDefs = [
    { id: 'look', label: 'Look', icon: 'eye', title: 'Look: show Jarvis something with the camera' },
    { id: 'talk', label: 'Talk', icon: 'wave', title: 'Talk to Jarvis (voice mode)' },
    { id: 'brief', label: 'Brief me', icon: 'clock', title: 'Run the briefing for this time of day' },
  ];
  if (typeof actions.screen === 'function' && isMac()) keyDefs.push({ id: 'screen', label: 'Screen', icon: 'laptop', title: 'Show Jarvis your screen' });
  // Standby (v7.4, SPEC §22): the ambient screen; two claps or "Hey Jarvis" wake Jarvis.
  if (typeof actions.standby === 'function') keyDefs.push({ id: 'standby', label: 'Standby', icon: 'moon', title: 'Standby: clap twice or say “Hey Jarvis” to wake Jarvis' });
  const keys = createQuickKeys({ keys: keyDefs, onKey: (id, e) => onKey(id, e) });
  const readouts = createReadouts();
  // The core's menu (long-press the core): its legend, and Standby.
  const legend = createLegend({
    action:
      typeof actions.standby === 'function'
        ? {
            label: 'Standby',
            icon: 'moon',
            testid: 'core-legend-standby',
            run: (e) => {
              legend.close();
              safe(() => actions.standby(e));
            },
          }
        : null,
  });

  // Home base (v7.5, SPEC §23): the Jarvis Core tile (home on phones, the rail on desktop).
  const hb = o.homeBase || null;
  const openHomeBaseSettings = () => safe(() => actions.openSettings && actions.openSettings({ section: 'homebase', focus: 'homebase-url' }));
  const homeTile = hb ? safe(() => createHomeBaseTile(hb, { variant: 'home', onSetup: openHomeBaseSettings }), null) : null;
  const railTile = hb ? safe(() => createHomeBaseTile(hb, { variant: 'rail', onSetup: openHomeBaseSettings }), null) : null;
  const offHomeBase = hb ? safe(() => hb.subscribe(() => render()), null) : null;

  // Desktop rail.
  const chrono = createChronometer({ onSuggest: () => onKey('brief') });
  const railNeeds = createNeedsList({ onAction: (item) => onNeedsAction(item), onMore: () => safe(() => actions.openHistory && actions.openHistory()), testid: 'rail-needs', heading: true });
  railNeeds.el.classList.add('rail-panel', 'needs--rail');
  const glance = createSystemsGlance({ onOpen: () => safe(() => actions.openSystems && actions.openSystems()) });
  glance.el.classList.add('rail-panel');
  const live = h('section', { class: 'rail-live rail-panel hud-frame', attrs: { 'aria-label': 'Live', 'data-testid': 'rail-live' } }, chrono.el);
  const railPanels = [live, railNeeds.el, glance.el, railTile ? railTile.el : null].filter(Boolean);
  const rail = {
    el: h('div', { class: 'panel-rail hud-assemble', attrs: { 'data-testid': 'awareness-rail', role: 'region', 'aria-label': 'Awareness' } }, ...railPanels),
  };
  railPanels.forEach((el, i) => el.style.setProperty('--i', String(i)));

  // A visually hidden live region for the state word: at most one announcement every 2 s.
  const announcer = h('p', { class: 'visually-hidden', attrs: { 'aria-live': 'polite', 'data-testid': 'state-announcer' } });
  let announceTimer = 0;
  let announcedAt = -Infinity;
  let pendingWord = '';
  let spokenWord = '';
  function announceWord(word) {
    pendingWord = word;
    if (announceTimer) return;
    const wait = Math.max(0, announcedAt + ANNOUNCE_GAP_MS - Date.now());
    announceTimer = setTimeout(() => {
      announceTimer = 0;
      if (pendingWord === spokenWord) return;
      spokenWord = pendingWord;
      announcedAt = Date.now();
      setText(announcer, spokenWord.toLowerCase().replace(' · ', ', '));
    }, wait);
  }

  // Cores fed by the controller: the hero (home) and the header's mini orb.
  const cores = new Set();
  let heroCore = null;
  let lastCoreData = null;

  // ---- the home object chat.js places -----------------------------------------------------------
  const home = {
    stateWordEl: homeWord.el,
    situationEl: situation,
    needsEl: homeNeeds.el,
    keysEl: keys.el,
    homeBaseEl: homeTile ? homeTile.el : null,
    readoutsEl: readouts.el,
    legendEl: legend.el,
    /** Hero size for the current viewport (SPEC 2.4.4). */
    heroSize: () => heroSize({ width: window.innerWidth, height: window.innerHeight }),
    /** chat.js created (or destroyed: null) the hero core. */
    attachCore(core) {
      if (heroCore) cores.delete(heroCore);
      heroCore = core || null;
      if (heroCore) {
        cores.add(heroCore);
        if (lastCoreData) pushCore(heroCore, lastCoreData);
      }
    },
    /** Long-press (or right-click, or the context-menu key) on the hero core. */
    openLegend(from) {
      safe(() => legend.open(legendRows(), from));
    },
    /** Wire the hero button: tap → onTap; long-press / context menu → the legend. */
    bindHero(button, onTap) {
      let timer = 0;
      let longFired = false;
      let startX = 0;
      let startY = 0;
      const cancel = () => {
        if (timer) clearTimeout(timer);
        timer = 0;
      };
      button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        longFired = false;
        startX = e.clientX;
        startY = e.clientY;
        cancel();
        timer = setTimeout(() => {
          timer = 0;
          longFired = true;
          home.openLegend(button);
        }, LONG_PRESS_MS);
      });
      button.addEventListener('pointermove', (e) => {
        if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
      });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, cancel);
      button.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        cancel();
        longFired = true;
        home.openLegend(button);
      });
      button.addEventListener('click', (e) => {
        if (longFired) {
          longFired = false;
          e.preventDefault();
          return;
        }
        if (typeof onTap === 'function') onTap(e);
      });
    },
    get booting() {
      return bootActive;
    },
  };

  /** Mirror a core's data (the header orb registers itself too). */
  function attachCore(core) {
    if (!core) return () => {};
    cores.add(core);
    if (lastCoreData) pushCore(core, lastCoreData);
    return () => cores.delete(core);
  }

  function pushCore(core, d) {
    safe(() => {
      core.setTelemetry(d.telemetry);
      core.setSensors(d.sensors);
      core.setAlert(d.alert);
    });
  }

  // ---- data ------------------------------------------------------------------------------------
  function settings() {
    return safe(() => o.getSettings(), {}) || {};
  }

  function saveLedger() {
    if (!local) return;
    try {
      local.setItem(LEDGER_KEY, JSON.stringify(ledger));
    } catch {
      /* full or blocked storage: this session only */
    }
  }

  function computeNeeds(now) {
    const s = settings();
    const sp = o.demo ? null : safe(() => o.getSpend && o.getSpend(), null);
    return deriveNeeds({
      ledger,
      interrupted: interrupted.filter((i) => i.convId !== snap.convId),
      spend: sp ? { monthUsd: sp.monthUsd, alertUsd: s.spendWarnUsd, dismissed: !!safe(() => actions.spendDismissed && actions.spendDismissed(), false) } : null,
      now,
      currentConvId: snap.convId,
      locale,
    });
  }

  function sensorsNow() {
    const micLive = !!(snap.listening || snap.micLive);
    return {
      mic: micLive ? 'live' : o.sttOk ? 'ready' : 'off',
      optics: snap.optics ? 'live' : cameraPresent ? 'ready' : 'off',
    };
  }

  function legendRows() {
    const d = lastCoreData;
    if (!d) return [];
    const t = d.tele;
    const sp = t.monthUsd === null ? 'Spend is not tracked here' : t.spendAlertUsd ? `${Math.round((t.monthUsd / t.spendAlertUsd) * 100)}% of your $${t.spendAlertUsd} monthly alert (${money(t.monthUsd)} this month${t.todayUsd !== null ? `, ${money(t.todayUsd)} today` : ''})` : `Alert off · ${money(t.monthUsd)} this month`;
    const [active, max] = t.core.agents;
    const m = t.core.mission;
    return [
      { term: 'Heart', text: `Jarvis's state: ${d.word.word.toLowerCase()}. It breathes at rest and follows the voice.` },
      { term: 'Outer ticks · left', text: `SPEND: ${sp}.` },
      { term: 'Outer ticks · right', text: `AGENTS: ${active} of ${max} working.` },
      { term: 'Outer ticks · bottom', text: m ? `MISSION: ${m[0]} of ${m[1]} agents finished.` : 'MISSION: none running (dark).' },
      { term: 'Thick band', text: 'Moves with your voice while Jarvis listens, and with his while he speaks.' },
      { term: 'Inner beads', text: `MIC ${d.sensors.mic} · OPTICS ${d.sensors.optics}. Red means live.` },
      { term: 'Amber bead', text: d.alert ? `${d.alert} thing${d.alert === 1 ? '' : 's'} need${d.alert === 1 ? 's' : ''} you.` : 'Nothing needs you.' },
    ];
  }

  // ---- render ---------------------------------------------------------------------------------
  const render = raf(() => {
    if (destroyed) return;
    safe(renderNow);
  });

  function renderNow() {
    const now = new Date();
    const s = settings();
    const running = runningMissions(snap.turns);
    const mission = running.length ? { done: running.reduce((a, m) => a + m.done, 0), total: running.reduce((a, m) => a + m.total, 0) } : null;
    const sp = o.demo ? null : safe(() => o.getSpend && o.getSpend(), null);
    const today = o.demo ? null : safe(() => (o.getTodaySpend ? o.getTodaySpend() : null), null);
    const tele = telemetryOf({ monthUsd: sp ? sp.monthUsd : null, todayUsd: today, spendAlertUsd: s.spendWarnUsd, activeAgents: snap.agents, maxAgents: s.maxAgents, mission });
    const needs = computeNeeds(now);
    const word = stateWord({ state: snap.coreState, agents: snap.agents, watchLeftMs: snap.watchLeftMs, updated: Date.now() < updatedUntil && snap.coreState === 'idle' });
    const sensors = sensorsNow();

    // State word: home, header (through the app), and the throttled announcement.
    homeWord.set(word);
    if (!bootTyping) announceWord(word.word);

    // Situation line.
    const busy = (snap.turns || []).length && !running.length ? (snap.titles || []).filter(Boolean) : [];
    setText(situation, situationLine({ running, busy: busy.length ? busy : (snap.turns || []).length ? [''] : [], needs, briefingReady: readyBriefing(needs) }));

    // Needs-you (home on phones, the rail on desktop) and the alert sound when an item arrives.
    homeNeeds.set(needs);
    railNeeds.set(needs);
    const ids = new Set(needs.map((n) => n.id));
    if (needsPrimed) {
      for (const id of ids) {
        if (!lastNeedsIds.has(id)) {
          safe(() => sounds.play && sounds.play('alert'));
          safe(() => sounds.haptic && sounds.haptic('light'));
          break;
        }
      }
    }
    lastNeedsIds = ids;
    needsPrimed = true;

    // Cores.
    const coreData = { telemetry: tele.core, sensors, alert: needs.length, tele, word };
    lastCoreData = coreData;
    for (const core of cores) pushCore(core, coreData);
    readouts.set(tele.labels, { spendOver: tele.spendOver });

    // Privacy pills.
    pills.set({ mic: sensors.mic === 'live', optics: !!snap.optics, watchLeft: snap.watchLeftMs ? word.word.replace(/^WATCHING /, '') : null });

    // Sensor tape (desktop header; a 24px row on phones in Full HUD).
    const clock = chronometer(now, locale);
    const homeBase = hb ? homeBaseGlance(safe(() => hb.getState(), null)) : null;
    const readings = [
      { id: 'net', label: 'NET', value: snap.online ? 'ONLINE' : 'OFFLINE', title: `Network ${snap.online ? 'online' : 'offline'}` },
      homeBase ? { id: 'core', label: 'CORE', value: homeBase.tape, unknown: homeBase.unknown, title: homeBase.title } : { id: 'core', label: 'CORE', value: '—', unknown: true, title: 'Jarvis Core: not paired' },
      { id: 'spend', label: 'SPEND', value: tele.todayUsd === null ? '—' : `${money(tele.todayUsd)} TODAY`, unknown: tele.todayUsd === null, title: tele.todayUsd === null ? 'Spend: not tracked' : `Spend today ${money(tele.todayUsd)}` },
      { id: 'time', label: '', value: `${clock.digits}${clock.period ? ` ${clock.period}` : ''}`, title: `Time ${clock.digits} ${clock.period}`.trim() },
    ];
    tape.set(readings);
    phoneTape.set(readings);

    // Rail: chronometer + suggestion, Systems glance.
    const part = partOfDay(now);
    const ranToday = (ledger.briefings[dayKeyOf(now)] || []).includes(part);
    chrono.set({ clock, suggestion: ranToday ? null : { label: briefingName(part), part } });
    const model = safe(() => o.modelLabel && o.modelLabel(), '');
    glance.set({
      network: snap.online,
      core: homeBase ? homeBase.text : '',
      coreTone: homeBase ? homeBase.tone : 'muted',
      mic: sensors.mic,
      optics: sensors.optics,
      model,
      spend: {
        known: tele.monthUsd !== null,
        today: tele.todayUsd,
        month: tele.monthUsd,
        alert: tele.spendAlertUsd,
        frac: tele.core.spend === null ? 0 : tele.core.spend,
        over: tele.spendOver,
      },
    });

    if (typeof o.onRendered === 'function') safe(() => o.onRendered({ word, needs, tele, sensors }));
  }

  // ---- actions ----------------------------------------------------------------------------------
  function onKey(id, e) {
    safe(() => sounds.play && sounds.play('tap'));
    if (id === 'talk') safe(() => actions.talk && actions.talk(e));
    else if (id === 'look') safe(() => actions.look && actions.look(e));
    else if (id === 'brief') safe(() => actions.brief && actions.brief(e));
    else if (id === 'screen') safe(() => actions.screen && actions.screen(e));
    else if (id === 'standby') safe(() => actions.standby && actions.standby(e));
  }

  function onNeedsAction(item) {
    safe(() => sounds.play && sounds.play('tap'));
    switch (item.kind) {
      case 'interrupted':
        safe(() => actions.resume && actions.resume(item.convId));
        break;
      case 'failed':
        safe(() => actions.retry && actions.retry(item.convId, item.turnId));
        break;
      case 'finished':
        safe(() => actions.openConversation && actions.openConversation(item.convId, item.turnId));
        break;
      case 'spend':
        safe(() => actions.openSettings && actions.openSettings({ section: 'apikey' }));
        break;
      case 'briefing':
        safe(() => actions.brief && actions.brief());
        break;
      default:
        break;
    }
  }

  // ---- HUD preferences --------------------------------------------------------------------------
  function applyHud(prefs, initial = false) {
    hud = prefs;
    if (root) {
      root.dataset.density = prefs.density;
      document.documentElement.dataset.motion = prefs.motion;
    }
    setCoreMotion(prefs.motion);
    if (!initial && typeof o.onHud === 'function') safe(() => o.onHud(prefs));
    if (!initial) render();
  }
  applyHud(hud, true);
  const offHud = onHudChange((p) => applyHud(p));

  // ---- camera presence (the OPTICS bead reads "ready" only when a camera exists) ------------------
  async function probeCamera() {
    try {
      const md = navigator.mediaDevices;
      if (!md || typeof md.enumerateDevices !== 'function') return;
      const devices = await md.enumerateDevices();
      const has = devices.some((d) => d.kind === 'videoinput');
      if (has !== cameraPresent) {
        cameraPresent = has;
        render();
      }
    } catch {
      /* no camera information: the bead stays off */
    }
  }
  probeCamera();
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', probeCamera);
  } catch {
    /* ignore */
  }

  // ---- clock: the chronometer and the tape change once a minute (no seconds, nothing ticks) -------
  let minuteTimer = 0;
  function scheduleMinute() {
    const now = Date.now();
    const wait = 60000 - (now % 60000) + 50;
    minuteTimer = setTimeout(() => {
      if (!document.hidden) render();
      scheduleMinute();
    }, wait);
  }
  scheduleMinute();
  const onVisible = () => {
    if (!document.hidden) render();
  };
  document.addEventListener('visibilitychange', onVisible);

  // ---- boot sequence (SPEC 2.4.13) -----------------------------------------------------------------
  let bootActive = false;
  let bootTyping = false;

  /** Is this launch the first after an update? (remembers the build for next time) */
  function checkUpdated() {
    let build = '';
    try {
      const meta = document.querySelector('meta[name="jarvis-build"]');
      build = meta ? meta.getAttribute('content') || '' : '';
    } catch {
      build = '';
    }
    if (!build || build === '__BUILD_ID__' || !local) return false;
    const prev = safe(() => local.getItem(BUILD_KEY), null);
    safe(() => local.setItem(BUILD_KEY, build));
    return !!prev && prev !== build;
  }

  function shouldBoot(force) {
    if (force) return true;
    const pref = hud.boot;
    if (pref === 'never') return false;
    if (pref === 'launch') return true;
    if (session && safe(() => session.getItem(BOOT_SESSION_KEY), null)) return false;
    return true;
  }

  /**
   * Play the boot: the hero core assembles (1.6 s), the state word types itself in from 1.0 s and
   * the greeting fades in. Any tap skips it; reduced motion and "Still" skip it entirely. Plays
   * once per session by default (HUD → Boot sequence). force: the "Replay now" button.
   */
  async function boot({ force = false, emptyEl = null } = {}) {
    if (bootActive) return false;
    const updated = !force && checkUpdated();
    if (updated) {
      updatedUntil = Date.now() + UPDATED_MS;
      render();
      setTimeout(() => render(), UPDATED_MS + 50);
    }
    if (!shouldBoot(force) && !updated) return false;
    if (session) safe(() => session.setItem(BOOT_SESSION_KEY, '1'));
    const core = heroCore;
    if (!core) return false;
    const host = emptyEl || (homeWord.el.closest('.empty-state') || null);
    bootActive = true;
    // 0–1.0 s: only the core shows; 1.0–1.6 s: the state word types in and the rest fades in.
    const reveal = () => {
      if (!host) return;
      host.classList.remove('is-booting');
      host.classList.add('is-booted');
    };
    host && host.classList.add('is-booting');
    let skipped = false;
    const skip = () => {
      skipped = true;
      safe(() => core.skipBoot());
      reveal();
    };
    window.addEventListener('pointerdown', skip, { capture: true, once: true });
    window.addEventListener('keydown', skip, { capture: true, once: true });
    safe(() => sounds.play && sounds.play('boot'));
    const typeTimer = setTimeout(() => {
      if (skipped) return;
      bootTyping = true;
      homeWord.type();
      reveal();
      setTimeout(() => {
        bootTyping = false;
      }, 700);
    }, 1000);
    const played = await safe(() => core.boot(), Promise.resolve(false));
    clearTimeout(typeTimer);
    window.removeEventListener('pointerdown', skip, { capture: true });
    window.removeEventListener('keydown', skip, { capture: true });
    reveal();
    bootTyping = false;
    bootActive = false;
    if (skipped || !played) render();
    return !!played && !skipped;
  }

  // ---- ledger events ----------------------------------------------------------------------------
  /** A run ended. away: the owner wasn't looking (page hidden or another conversation). */
  function noteRunEnded(conv, turn, { away = false, briefing = '' } = {}) {
    if (o.demo) return;
    if (away) {
      const item = unreadFromTurn(conv, turn, briefing);
      if (item) {
        ledger = noteUnread(ledger, item);
        saveLedger();
      }
    }
    // A conversation that finished or was resumed is no longer interrupted.
    if (conv && conv.id) interrupted = interrupted.filter((i) => i.convId !== conv.id);
    render();
  }

  function noteSeenNow(convId) {
    if (!convId || o.demo) return;
    ledger = noteSeen(ledger, convId, Date.now());
    saveLedger();
    render();
  }

  function noteBriefingNow(date = new Date()) {
    if (o.demo) return;
    ledger = noteBriefing(ledger, date, partOfDay(date));
    saveLedger();
    render();
  }

  function forget(convId) {
    ledger = forgetConversation(ledger, convId);
    interrupted = interrupted.filter((i) => i.convId !== convId);
    saveLedger();
    render();
  }

  /** Startup scan: recent conversations whose last reply was cut off (engine.canResume). */
  async function scan() {
    if (o.demo || !o.store) return;
    try {
      const items = (await o.store.list()) || [];
      const recent = items.filter((it) => it && Date.now() - (Number(it.updatedAt) || 0) < SCAN_WINDOW_MS).slice(0, SCAN_MAX);
      const found = [];
      for (const it of recent) {
        const conv = await o.store.get(it.id);
        if (!conv) continue;
        if (safe(() => o.canResume(conv), false)) {
          const info = interruptedInfo(conv);
          if (info) found.push(info);
        }
      }
      interrupted = found;
      render();
    } catch (err) {
      safe(() => console.warn('[jarvis] presence scan failed', err));
    }
  }

  // Sync across tabs: another window recorded something.
  const onStorage = (e) => {
    if (e.key !== LEDGER_KEY && e.key !== null) return;
    ledger = normalizeLedger(local ? readJson(local, LEDGER_KEY) : null);
    render();
  };
  window.addEventListener('storage', onStorage);

  return {
    pills,
    tape,
    phoneTape,
    home,
    rail,
    announcer,
    attachCore,
    getHud: () => hud,
    setHud: (patch) => saveHud(patch),
    /** Feed the latest app state; renders on the next frame. */
    update(next) {
      snap = { ...snap, ...(next || {}) };
      render();
    },
    /** Render right away (tests, or before a screenshot). */
    flush() {
      render.flush();
    },
    word: () => stateWord({ state: snap.coreState, agents: snap.agents, watchLeftMs: snap.watchLeftMs, updated: Date.now() < updatedUntil && snap.coreState === 'idle' }),
    noteRunEnded,
    noteSeen: noteSeenNow,
    noteBriefing: noteBriefingNow,
    forget,
    scan,
    boot,
    /** Alpha events: 'answer' flares the hero core. */
    cue(name) {
      if (heroCore) safe(() => heroCore.cue(name));
    },
    needs: () => computeNeeds(new Date()),
    destroy() {
      destroyed = true;
      offHud();
      clearTimeout(minuteTimer);
      clearTimeout(announceTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
      pills.destroy();
      homeWord.destroy();
      if (typeof offHomeBase === 'function') safe(offHomeBase);
      if (homeTile) safe(() => homeTile.destroy());
      if (railTile) safe(() => railTile.destroy());
    },
  };
}
