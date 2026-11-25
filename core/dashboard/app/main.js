// Jarvis Core dashboard: the 24/7 system report on the Alienware's screen (and, through
// Tailscale, on the owner's other devices). Wires the data link, the view model, the panels, the
// living core, the sparklines, the status assistant and the kiosk behaviour together.
//
// The kiosk behaviour (night dim, pixel shift, the hidden cursor, the daily refresh, typing
// anywhere) belongs to the Alienware's own screen only; the iPhone and the Mac are remote viewers
// (kiosk.js: screenFeatures). The layout follows the window's size (dashboard.css): the kiosk
// layout where it fits, one scrolling column on a phone, two columns on a tablet or a small window.
//
// Rendering is coalesced: snapshots (one a second from the Core, or many a second in the
// accelerated long-run test) go into the sparkline rings at once, and the DOM is updated at most
// once per animation frame from the newest view model.

import { createAssistant } from './assistant.js';
import { createClient } from './client.js';
import { createOrb } from './core-orb.js';
import { $, setData, setHidden, setText, setVar } from './dom.js';
import { clockParts, fmtAgo, fmtDate, fmtEventTime, num } from './format.js';
import { createKiosk, readSettings, screenFeatures } from './kiosk.js';
import { applyTick, historyPoints, normalize, parseEvents, readInfo } from './model.js';
import { createPanels, fullest } from './panels.js';
import { createSpark, TimeRing } from './spark.js';

const JARVIS_URL = 'https://frankwise0202-maker.github.io/jarvis/';
const SPARK_SECONDS = 600; // the sparklines show the last 10 minutes

const params = new URLSearchParams(location.search);
let settings = readSettings(params);
// The clock's time zone: ?tz= (tests), else the Core's own (GET api/info), else the browser's.
let timeZone = validZone(params.get('tz')) || undefined;
// Its locale (12 or 24 hours, date order): ?locale=, else the Core's, so the clock, the event log and
// the assistant's answers all read the same; the browser's until the Core has answered.
let locale = validLocale(params.get('locale')) || undefined;

function validLocale(l) {
  if (!l || typeof l !== 'string') return null;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([l])[0] || null;
  } catch {
    return null;
  }
}

function validZone(tz) {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0);
    return tz;
  } catch {
    return null;
  }
}

const root = document.documentElement;
const stage = $('stage');
// The Alienware's own screen (localhost) or a remote viewer (the tailnet name on the iPhone or Mac).
const screenMode = screenFeatures(location.hostname);
setData(root, 'view', screenMode.view);
const panels = createPanels();

// --- state ------------------------------------------------------------------------------------
let raw = null; // the merged status as the Core sent it
let info = null;
let vm = null;
let online = false;
let everOnline = false;
let lastSampleClient = 0; // this browser's clock when the newest snapshot arrived ("12 s ago")
let lastSampleCore = 0; // the Core's time of the newest snapshot ("no data since 9:47 PM")
let skew = 0; // the Core's clock − this browser's, at the newest snapshot (≈0 on the real machine)
let lastCheckStamp = null;
let lastMinute = -1;
let loadedVersion = null;

// Ring names are the Core's history series (GET api/history?series=cpu,gpu,ram,netRx,netTx).
const rings = {
  cpu: new TimeRing(SPARK_SECONDS),
  gpu: new TimeRing(SPARK_SECONDS),
  ram: new TimeRing(SPARK_SECONDS),
  netRx: new TimeRing(SPARK_SECONDS),
  netTx: new TimeRing(SPARK_SECONDS),
};
const sparks = {
  cpu: createSpark($('spark-cpu'), rings.cpu, { scale: 'pct' }),
  gpu: createSpark($('spark-gpu'), rings.gpu, { scale: 'pct' }),
  ram: createSpark($('spark-mem'), rings.ram, { scale: 'pct' }),
  netRx: createSpark($('spark-down'), rings.netRx, { scale: { floor: 125000 } }), // at least 1 Mb/s tall
  netTx: createSpark($('spark-up'), rings.netTx, { scale: { floor: 125000 } }),
};

// --- the living core and its corner readouts ----------------------------------------------------
const coreStage = $('core-stage');
const coreLabel = $('core-label');
const readouts = { cpu: $('g-cpu'), gpu: $('g-gpu'), ram: $('g-ram'), disk: $('g-disk') };
const orb = createOrb($('core-canvas'), {
  readoutWidth: 150,
  onLayout({ cx, cy, R, anchors }) {
    setVar(coreLabel, '--cx', `${cx}px`);
    setVar(coreLabel, '--cy', `${cy}px`);
    setVar(coreLabel, '--core-word', `${Math.max(16, Math.min(48, R * 0.13)).toFixed(1)}px`);
    for (const [name, node] of Object.entries(readouts)) {
      const a = anchors[name];
      const left = name === 'cpu' || name === 'ram';
      const width = Math.max(96, left ? a.hx - 10 : coreStage.clientWidth - a.hx - 10);
      setVar(node, '--w', `${width}px`);
      setVar(node, '--x', `${left ? a.hx - 10 - width : a.hx + 10}px`);
      setVar(node, '--y', `${a.ey}px`);
    }
  },
});

function trafficLevel(v) {
  const bps = (num(v.net.rxBps) ?? 0) + (num(v.net.txBps) ?? 0);
  if (bps < 10000) return 0;
  return Math.max(0, Math.min(1, (Math.log10(bps) - 4) / (Math.log10(1.25e7) - 4)));
}

function feedOrb(v) {
  orb.setHealth(online ? v.health.level : 'offline');
  const d = fullest(v.disks);
  orb.setGauges({
    cpu: { value: v.cpu.usage === null ? null : v.cpu.usage / 100, level: v.levels.cpu },
    gpu: { value: v.gpu.state === 'ok' && v.gpu.util !== null ? v.gpu.util / 100 : null, level: v.levels.gpu },
    ram: { value: v.mem.usedPct === null ? null : v.mem.usedPct / 100, level: v.levels.mem },
    disk: { value: d && d.usedPct !== null ? d.usedPct / 100 : null, level: v.levels.disk },
  });
  orb.setThreads(v.cpu.perThread.length ? v.cpu.perThread.map((p) => (p === null ? 0 : p / 100)) : null);
  orb.setTraffic(trafficLevel(v));
  orb.setAlert(v.health.items.filter((i) => i.level !== 'ok').length);
  // One scanner pass each time the Core refreshes its network checks (every 30 s).
  const stamp = v.internet.checkedAt ?? v.api.checkedAt ?? null;
  if (stamp !== null && stamp !== lastCheckStamp) {
    if (lastCheckStamp !== null) orb.cue('scan');
    lastCheckStamp = stamp;
  }
}

// --- rendering ----------------------------------------------------------------------------------
let renderQueued = false;
let renderTimer = 0;

/** The Core's clock: the same as Date.now() on the machine itself; the simulated time in fixture mode. */
function coreNow() {
  return Date.now() + skew;
}

function ctx(now = coreNow()) {
  return {
    online,
    everOnline,
    now,
    timeZone,
    locale,
    lastSeenText: lastSampleClient ? fmtAgo(lastSampleClient, Date.now()) : null,
  };
}

function render() {
  renderQueued = false;
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = 0;
  }
  if (!vm) vm = normalize(raw || {}, info);
  root.dataset.health = online ? vm.health.level : 'offline';
  panels.render(vm, ctx());
  feedOrb(vm);
  for (const s of Object.values(sparks)) if (s.dirty) s.draw();
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
  // rAF does not run while the page is hidden; a timer keeps the model current anyway.
  renderTimer = setTimeout(render, 1000);
}

function pushSample(v) {
  const t = v.t ?? Date.now();
  rings.cpu.push(t, v.cpu.usage);
  rings.gpu.push(t, v.gpu.state === 'ok' ? v.gpu.util : null);
  rings.ram.push(t, v.mem.usedPct);
  rings.netRx.push(t, v.net.rxBps);
  rings.netTx.push(t, v.net.txBps);
  for (const s of Object.values(sparks)) s.markDirty();
}

// --- the data link ------------------------------------------------------------------------------
const client = createClient({
  onInfo(body) {
    info = body && typeof body === 'object' ? body : null;
    const inf = readInfo(info);
    // The Core was updated (jarvis-core update): the kiosk loads the matching dashboard once it
    // answers; a remote viewer is never reloaded under the owner's thumb, it says so instead.
    if (inf.version && loadedVersion && inf.version !== loadedVersion) {
      if (screenMode.reloadOnUpdate) {
        location.reload();
        return;
      }
      showToast('Jarvis Core was updated. Reload this page to see the new version.', 60000);
    }
    if (inf.version) loadedVersion = inf.version;
    if (Object.keys(inf.config).length) {
      settings = readSettings(params, inf.config);
      kiosk.updateSettings(settings);
    }
    if (!params.get('tz') && validZone(inf.timeZone)) timeZone = inf.timeZone;
    if (!params.get('locale') && validLocale(inf.locale)) locale = validLocale(inf.locale);
    vm = normalize(raw || {}, info);
    scheduleRender();
  },
  onStatus(body) {
    if (!body || typeof body !== 'object') return;
    // A full snapshot replaces the merged state (it carries services and every health item).
    raw = body;
    vm = normalize(raw, info);
    lastSampleClient = Date.now();
    if (vm.t !== null) skew = vm.t - lastSampleClient;
    lastSampleCore = vm.t ?? lastSampleClient;
    pushSample(vm);
    scheduleRender();
  },
  onSnapshot(body) {
    if (!body || typeof body !== 'object') return;
    raw = applyTick(raw, body);
    vm = normalize(raw, info);
    lastSampleClient = Date.now();
    if (vm.t !== null) skew = vm.t - lastSampleClient;
    lastSampleCore = vm.t ?? lastSampleClient;
    pushSample(vm);
    scheduleRender();
  },
  onHistory(body) {
    for (const name of Object.keys(rings)) {
      const points = historyPoints(body, name);
      if (!points.length) continue;
      const ring = rings[name];
      ring.clear();
      for (const [t, value] of points.slice(-SPARK_SECONDS)) ring.push(t, value);
      sparks[name].markDirty();
    }
    scheduleRender();
  },
  onEvents(body) {
    panels.addEvents(parseEvents(body), ctx());
  },
  onLink(up) {
    online = up;
    if (up) everOnline = true;
    vm = normalize(raw || {}, info);
    scheduleRender();
    updateBanner(Date.now());
  },
});

// --- the clock, the banner and the kiosk tick ---------------------------------------------------
const clockTime = $('clock-time');
const clockPeriod = $('clock-period');
const clockDate = $('clock-date');
const banner = $('offline-banner');
const bannerText = $('offline-text');
const startedAt = Date.now();

function updateClock(now) {
  const d = new Date(now);
  const parts = clockParts(d, locale, { timeZone });
  setText(clockTime, parts.time);
  setText(clockPeriod, parts.period);
  setText(clockDate, fmtDate(d, locale, timeZone));
}

function updateBanner(now) {
  const show = (everOnline && !online) || (!everOnline && now - startedAt > 8000);
  setHidden(banner, !show);
  if (!show) return;
  if (!everOnline) {
    setText(bannerText, "Can't reach the Core yet. It may still be starting; retrying…");
    return;
  }
  const when = lastSampleCore ? fmtEventTime(lastSampleCore, coreNow(), locale, timeZone) : null;
  setText(bannerText, when ? `No data since ${when} (${fmtAgo(lastSampleClient, now)}). Reconnecting…` : 'No data from the Core. Reconnecting…');
}

const assistant = createAssistant({ isOnline: () => online, typeAnywhere: screenMode.typeAnywhere });

const kiosk = createKiosk({
  root,
  stage,
  veil: $('night-veil'),
  settings,
  timeZone: () => timeZone,
  onNightChange(on) {
    orb.setNight(on);
  },
  onRefresh() {
    location.reload();
  },
  isCoreLive: () => online,
  kiosk: screenMode.kiosk,
});

function tick() {
  const wall = Date.now();
  const now = coreNow();
  updateClock(now);
  updateBanner(wall);
  kiosk.tick(now);
  assistant.tick(wall);
  if (!online && everOnline) {
    // Nothing is known while the Core is away: the sparklines move on with gaps.
    const t = now;
    let moved = false;
    for (const ring of Object.values(rings)) {
      const before = ring.lastSlot;
      ring.advanceTo(t);
      if (ring.lastSlot !== before) moved = true;
    }
    if (moved) {
      for (const s of Object.values(sparks)) s.markDirty();
      scheduleRender();
    }
  }
  const minute = Math.floor(now / 60000);
  if (minute !== lastMinute) {
    lastMinute = minute;
    panels.refreshEventTimes(ctx(now)); // a "today" time becomes a dated one after midnight
    if (vm) scheduleRender(); // "checked 2 min ago" and the like
  }
}

// --- Open Jarvis ----------------------------------------------------------------------------------
const toast = $('toast');
let toastTimer = 0;
function showToast(text, ms = 7000) {
  setText(toast, text);
  setHidden(toast, false);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setHidden(toast, true), ms);
}

/** The regular Jarvis app in its own window; closing that window brings this screen back. */
function openJarvis() {
  const cfg = readInfo(info).config;
  const url = (typeof cfg.jarvisUrl === 'string' && /^https:\/\//.test(cfg.jarvisUrl) && cfg.jarvisUrl) || JARVIS_URL;
  window.open(url, '_blank', 'noopener,noreferrer');
  showToast(screenMode.kiosk ? 'Opening Jarvis in its own window. Close that window (Ctrl+W) to come back here.' : 'Opening Jarvis in a new tab.');
}
$('open-jarvis').addEventListener('click', openJarvis);
window.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'j' || e.key === 'J' || e.code === 'KeyJ')) {
    e.preventDefault();
    openJarvis();
  }
});

// --- start --------------------------------------------------------------------------------------
setData(root, 'health', 'offline');
tick();
setInterval(tick, 1000);
client.start();

// Keep the page itself available while the Core restarts (sw.js: network first, never the API).
if ('serviceWorker' in navigator && !params.has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// For the screenshot and long-run tests (read-only; the page never depends on it).
window.__jarvisCore = {
  stats: () => ({
    client: client.stats(),
    orb: orb.debugStats(),
    events: panels.eventCount(),
    messages: assistant.messageCount(),
    nodes: document.getElementsByTagName('*').length,
    online,
    night: kiosk.isNight(),
    view: screenMode.view,
  }),
};
