// Records (SPEC 14.4): lightweight usage statistics and the "Systems" dashboard.
//
// Aggregates live in localStorage['jarvis.stats.v1'] (a few KB): all-time totals, one bucket
// per local day for the last 60 days, ranked agent roles, and a bounded list of the turns
// already recorded. recordTurn() is idempotent by turn id; when a turn is recorded again with
// more work in it (an interrupted turn that was resumed), only the difference is added.
// Every storage call is wrapped (Safari private mode, blocked site data, full quota) and falls
// back to an in-memory copy, so stats keep working for the session.

import { h, clear, setText, setStyle, raf } from './dom.js';
import { icon } from './icons.js';
import { fmtUsd, fmtCount, fmtDuration } from './hud/format.js';
import { turnMetrics } from './share.js';

export const STATS_KEY = 'jarvis.stats.v1';

const DAYS_KEPT = 60; // per-day buckets
const CHART_DAYS = 14;
const SEEN_MAX = 250; // recorded turn ids remembered for idempotency / resume deltas
const ROLE_CANDIDATES = 60; // ranked roles kept before pruning (so the top 20 stay stable)
const ROLE_KEEP = 40;
const TOP_ROLES = 20;
const VIEW_ROLES = 8;

// Snapshot fields stored per recorded turn (order matters; persisted as arrays).
const SNAP = ['agents', 'agentsOk', 'searches', 'sources', 'missions', 'costMicros', 'fetches', 'durationMs', 'roles'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const int = (v) => Math.round(num(v));
const money = (v) => Math.round(num(v) * 1e6) / 1e6;
const pad2 = (n) => String(n).padStart(2, '0');

function zeroTotals() {
  return { turns: 0, missions: 0, agents: 0, agentsOk: 0, searches: 0, fetches: 0, sources: 0, costUsd: 0, durationMs: 0 };
}
function zeroDay() {
  return { turns: 0, missions: 0, agents: 0, searches: 0, sources: 0, costUsd: 0 };
}
function emptyState() {
  return { v: 1, since: 0, updatedAt: 0, totals: zeroTotals(), byDay: {}, roles: [], seen: [] };
}

/** Local calendar day "YYYY-MM-DD" for an epoch-ms timestamp. */
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Noon of the local day `n` days from `ms` (noon sidesteps DST edges). */
function shiftDays(ms, n) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12).getTime();
}

function clock(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now.getTime();
  if (typeof now === 'number' && Number.isFinite(now)) return now;
  return Date.now();
}

// ---------------------------------------------------------------------------------------------
// Storage (never throws)

let memory = null; // newest state this session (used when storage is missing or a write failed)
let memoryNewer = false;
const listeners = new Set();
let listening = false;

function storage() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

function normalize(raw) {
  const state = emptyState();
  if (!isObj(raw)) return state;
  state.since = num(raw.since);
  state.updatedAt = num(raw.updatedAt);
  if (isObj(raw.totals)) {
    for (const k of Object.keys(state.totals)) state.totals[k] = k === 'costUsd' ? money(raw.totals[k]) : int(raw.totals[k]);
  }
  if (isObj(raw.byDay)) {
    for (const key of Object.keys(raw.byDay)) {
      const d = raw.byDay[key];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !isObj(d)) continue;
      const day = zeroDay();
      for (const k of Object.keys(day)) day[k] = k === 'costUsd' ? money(d[k]) : int(d[k]);
      state.byDay[key] = day;
    }
  }
  if (Array.isArray(raw.roles)) {
    for (const r of raw.roles) {
      if (Array.isArray(r) && typeof r[0] === 'string' && r[0] && typeof r[1] === 'string' && int(r[2]) > 0) state.roles.push([r[0], cleanRole(r[1]) || r[0], int(r[2]), num(r[3])]);
    }
  }
  if (Array.isArray(raw.seen)) {
    for (const e of raw.seen) {
      if (Array.isArray(e) && typeof e[0] === 'string' && e[0]) state.seen.push([e[0], ...SNAP.map((_, i) => int(e[i + 1]))]);
    }
    if (state.seen.length > SEEN_MAX) state.seen = state.seen.slice(-SEEN_MAX);
  }
  return state;
}

function load() {
  if (memoryNewer && memory) return normalize(memory);
  const s = storage();
  if (!s) return normalize(memory);
  let text = null;
  try {
    text = s.getItem(STATS_KEY);
  } catch {
    return normalize(memory);
  }
  if (typeof text !== 'string' || !text) return emptyState();
  try {
    return normalize(JSON.parse(text));
  } catch {
    return emptyState(); // corrupted: start over rather than break the dashboard
  }
}

function save(state) {
  memory = state;
  const s = storage();
  if (s) {
    try {
      s.setItem(STATS_KEY, JSON.stringify(state));
      memoryNewer = false;
      return true;
    } catch {
      /* quota or blocked: keep the in-memory copy */
    }
  }
  memoryNewer = true;
  return false;
}

function notify() {
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch (err) {
      try {
        console.error('[jarvis] stats listener failed:', err);
      } catch {
        /* ignore */
      }
    }
  }
}

/** fn() after any change to the stats (this tab or another). Returns an unsubscribe function. */
export function onStatsChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  if (!listening) {
    listening = true;
    try {
      globalThis.addEventListener('storage', (event) => {
        if (!event || (event.key !== STATS_KEY && event.key !== null)) return;
        memoryNewer = false; // the other tab's persisted copy is newer
        notify();
      });
    } catch {
      /* not a window */
    }
  }
  return () => {
    listeners.delete(fn);
  };
}

/** The raw statistics as plain data, for backups (undefined when nothing was recorded yet). */
export function exportStats() {
  const state = load();
  if (!state.totals.turns && !state.seen.length) return undefined;
  return JSON.parse(JSON.stringify(state));
}

/**
 * Merge statistics from a backup. Every counter keeps the larger of the two values (totals,
 * each day, each role), and the recorded-turn lists are united, so restoring onto a new
 * device brings the history along while importing the same backup twice, or onto the device
 * it came from, never double counts. Returns true when anything changed.
 */
export function importStats(raw) {
  if (!isObj(raw)) return false;
  const incoming = normalize(raw);
  if (!incoming.totals.turns && !incoming.seen.length) return false;
  const state = load();
  let changed = false;
  const takeMax = (target, source, keys) => {
    for (const k of keys) {
      const v = Math.max(target[k] || 0, source[k] || 0);
      if (v !== target[k]) {
        target[k] = v;
        changed = true;
      }
    }
  };
  takeMax(state.totals, incoming.totals, Object.keys(state.totals));
  const cutoff = dayKey(shiftDays(Date.now(), -(DAYS_KEPT - 1)));
  for (const key of Object.keys(incoming.byDay)) {
    if (key < cutoff) continue;
    if (!state.byDay[key]) state.byDay[key] = zeroDay();
    takeMax(state.byDay[key], incoming.byDay[key], Object.keys(state.byDay[key]));
  }
  for (const role of incoming.roles) {
    const hit = state.roles.find((r) => r[0] === role[0]);
    if (!hit) {
      state.roles.push(role.slice());
      changed = true;
    } else {
      if (role[2] > hit[2]) {
        hit[2] = role[2];
        changed = true;
      }
      hit[3] = Math.max(hit[3], role[3]);
      if (!hasAcronym(hit[1]) && hasAcronym(role[1])) hit[1] = role[1];
    }
  }
  if (state.roles.length > ROLE_CANDIDATES) state.roles = rankRoles(state.roles).slice(0, ROLE_KEEP);
  const older = [];
  for (const entry of incoming.seen) {
    const mine = state.seen.find((e) => e[0] === entry[0]);
    if (mine) {
      for (let i = 1; i < mine.length; i++) mine[i] = Math.max(mine[i], entry[i]);
    } else {
      older.push(entry.slice());
      changed = true;
    }
  }
  // Entries only the backup knows go first, so this device's own (newer) turns survive the cap.
  if (older.length) state.seen = [...older, ...state.seen].slice(-SEEN_MAX);
  if (incoming.since && (!state.since || incoming.since < state.since)) {
    state.since = incoming.since;
    changed = true;
  }
  if (!changed) return false;
  state.updatedAt = Math.max(state.updatedAt, incoming.updatedAt, Date.now());
  save(state);
  notify();
  return true;
}

/** Forget every statistic (for "Reset app" / "Clear data"). */
export function resetStats() {
  memory = null;
  memoryNewer = false;
  const s = storage();
  if (s) {
    try {
      s.removeItem(STATS_KEY);
    } catch {
      memory = emptyState();
      memoryNewer = true;
    }
  }
  notify();
}

// ---------------------------------------------------------------------------------------------
// Aggregation

/**
 * Display form of a role: "  battery tech analyst. " → "Battery tech analyst"; shouting is tamed
 * ("TECH REVIEWER" → "Tech reviewer", "Market ANALYST" → "Market analyst") while short acronyms
 * stay ("EV market analyst"). Ranking uses the lowercase form, so every spelling counts together.
 */
function cleanRole(role) {
  if (typeof role !== 'string') return '';
  let s = role.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^["'“‘(]+|["'”’).:;,]+$/g, '').trim();
  if (s.length > 60) s = s.slice(0, 60).trim();
  if (!s) return '';
  if (s.length > 4 && s === s.toUpperCase() && s !== s.toLowerCase()) s = s.toLowerCase();
  else s = s.replace(/\b[A-Z]{5,}\b/g, (w) => w.toLowerCase());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A display form with a short acronym ("EV", "AI", "NASA") beats one that lost it ("Ev …"). */
const hasAcronym = (s) => /\b[A-Z]{2,4}\b/.test(s);

function rankRoles(roles) {
  return roles.slice().sort((a, b) => b[2] - a[2] || b[3] - a[3] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * Add a finished Jarvis turn (any status) to the statistics. Idempotent by turn.id: recording
 * the same turn again adds nothing, unless it has grown since (a resumed turn), in which case
 * only the difference is added. Returns true when anything changed.
 * opts.now (ms or Date) overrides the clock (tests).
 */
export function recordTurn(turn, opts = {}) {
  if (!isObj(turn) || turn.role === 'user') return false;
  const id = typeof turn.id === 'string' ? turn.id : typeof turn.id === 'number' && Number.isFinite(turn.id) ? String(turn.id) : '';
  if (!id) return false;
  const now = clock(isObj(opts) ? opts.now : undefined);

  let m;
  try {
    m = turnMetrics(turn);
  } catch {
    return false;
  }
  const snap = {
    agents: int(m.agents),
    agentsOk: int(m.agentsOk),
    searches: int(m.searches),
    sources: int(m.sources),
    missions: int(m.missions),
    costMicros: Math.round(num(m.costUsd) * 1e6),
    fetches: int(m.fetches),
    durationMs: int(m.durationMs),
    roles: m.roles.length,
  };

  const state = load();
  const idx = state.seen.findIndex((e) => e[0] === id);
  const prev = idx >= 0 ? state.seen[idx] : null;
  const delta = {};
  let grew = false;
  SNAP.forEach((k, i) => {
    delta[k] = Math.max(0, snap[k] - (prev ? prev[i + 1] : 0));
    if (delta[k]) grew = true;
  });
  if (prev && !grew) return false;

  const at = num(turn.endedAt) || num(turn.createdAt) || now;
  const t = state.totals;
  if (!prev) t.turns += 1;
  t.agents += delta.agents;
  t.agentsOk += delta.agentsOk;
  t.missions += delta.missions;
  t.searches += delta.searches;
  t.sources += delta.sources;
  t.fetches += delta.fetches;
  t.durationMs += delta.durationMs;
  t.costUsd = money(t.costUsd + delta.costMicros / 1e6);

  const cutoff = dayKey(shiftDays(now, -(DAYS_KEPT - 1)));
  const key = dayKey(at);
  if (key >= cutoff) {
    const day = state.byDay[key] || (state.byDay[key] = zeroDay());
    if (!prev) day.turns += 1;
    day.agents += delta.agents;
    day.missions += delta.missions;
    day.searches += delta.searches;
    day.sources += delta.sources;
    day.costUsd = money(day.costUsd + delta.costMicros / 1e6);
  }
  for (const k of Object.keys(state.byDay)) if (k < cutoff) delete state.byDay[k];

  // Roles of agents not counted before (agents are append-only in display order).
  const counted = prev ? prev[SNAP.indexOf('roles') + 1] : 0;
  for (const raw of m.roles.slice(counted)) {
    const display = cleanRole(raw);
    if (!display) continue;
    const rkey = display.toLowerCase();
    const hit = state.roles.find((r) => r[0] === rkey);
    if (hit) {
      hit[2] += 1;
      hit[3] = Math.max(hit[3], at);
      if (!hasAcronym(hit[1]) && hasAcronym(display)) hit[1] = display;
    } else {
      state.roles.push([rkey, display, 1, at]);
    }
  }
  if (state.roles.length > ROLE_CANDIDATES) state.roles = rankRoles(state.roles).slice(0, ROLE_KEEP);

  const entry = [id, ...SNAP.map((k, i) => Math.max(snap[k], prev ? prev[i + 1] : 0))];
  if (idx >= 0) state.seen.splice(idx, 1);
  state.seen.push(entry);
  if (state.seen.length > SEEN_MAX) state.seen = state.seen.slice(-SEEN_MAX);

  state.since = state.since ? Math.min(state.since, at) : at;
  state.updatedAt = now;
  save(state);
  notify();
  return true;
}

/**
 * { totals: { turns, missions, agents, agentsOk, searches, fetches, sources, costUsd, durationMs },
 *   byDay: { 'YYYY-MM-DD': { turns, missions, agents, searches, sources, costUsd } },  // last 60 days
 *   topRoles: [[role, n]],                                                             // up to 20
 *   since, updatedAt }   (fresh copies; safe to mutate)
 */
export function getStats(opts = {}) {
  const state = load();
  const now = clock(isObj(opts) ? opts.now : undefined);
  const cutoff = dayKey(shiftDays(now, -(DAYS_KEPT - 1)));
  const byDay = {};
  for (const key of Object.keys(state.byDay).sort()) if (key >= cutoff) byDay[key] = { ...state.byDay[key] };
  return {
    totals: { ...state.totals },
    byDay,
    topRoles: rankRoles(state.roles)
      .slice(0, TOP_ROLES)
      .map((r) => [r[1], r[2]]),
    since: state.since || null,
    updatedAt: state.updatedAt || null,
  };
}

/** The last `n` local days (oldest first), zero-filled: [{ key, ms, turns, missions, agents, searches, sources, costUsd }]. */
export function lastDays(stats, n = CHART_DAYS, now) {
  const at = clock(now);
  const byDay = stats && isObj(stats.byDay) ? stats.byDay : {};
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ms = shiftDays(at, -i);
    const key = dayKey(ms);
    const d = isObj(byDay[key]) ? byDay[key] : {};
    out.push({ key, ms, turns: int(d.turns), missions: int(d.missions), agents: int(d.agents), searches: int(d.searches), sources: int(d.sources), costUsd: money(d.costUsd) });
  }
  return out;
}

/** navigator.storage.estimate() → { usage, quota, persisted } (bytes), or null when unsupported. */
export async function estimateStorage() {
  try {
    const s = globalThis.navigator && globalThis.navigator.storage;
    if (!s || typeof s.estimate !== 'function') return null;
    const est = await s.estimate();
    const usage = Number(est && est.usage);
    const quota = Number(est && est.quota);
    if (!Number.isFinite(usage) || usage < 0) return null;
    let persisted = null;
    try {
      if (typeof s.persisted === 'function') persisted = (await s.persisted()) === true;
    } catch {
      persisted = null;
    }
    return { usage, quota: Number.isFinite(quota) && quota > 0 ? quota : 0, persisted };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Formatting for the dashboard

const plural = (n, one, many = `${one}s`) => `${fmtCount(n)} ${n === 1 ? one : many}`;
const nb = (s) => s.replace(/ /g, '\u00a0'); // keep "12 agents" on one line

/** Spend amounts in the dashboard: "$12.84", "< $0.01", "$1,234" (the panel title says "estimated"). */
function fmtMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '$0.00';
  if (n < 0.01) return '< $0.01';
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
const fmtInt = (n) => (Math.round(n) < 1e7 ? String(Math.round(Math.max(0, n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : fmtCount(n));

/** "812 KB", "3.1 MB", "1.9 GB" (decimal units, as the OS reports them). */
export function fmtBytes(bytes) {
  let v = Number(bytes);
  if (!Number.isFinite(v) || v <= 0) return '0 KB';
  if (v < 1000) return '< 1 KB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)} ${units[i]}`;
}

function fmtDate(ms, options) {
  try {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(ms));
  } catch {
    return new Date(ms).toDateString();
  }
}

const METRICS = {
  agents: { label: 'Agents', one: 'agent', many: 'agents', aria: 'Agents deployed per day' },
  searches: { label: 'Searches', one: 'search', many: 'searches', aria: 'Web searches per day' },
  costUsd: { label: 'Spend', aria: 'Estimated spend per day' },
};

function metricValue(day, metric) {
  return metric === 'costUsd' ? money(day.costUsd) : int(day[metric]);
}

function fmtMetric(v, metric) {
  if (metric === 'costUsd') return fmtUsd(v);
  return plural(v, METRICS[metric].one, METRICS[metric].many);
}

/** Short value label for the top of a bar: "12", "1.2K", "$0.84". */
function fmtPeak(v, metric) {
  if (metric !== 'costUsd') return fmtCount(v);
  if (v < 0.01) return '<$0.01';
  return v < 100 ? `$${v.toFixed(2)}` : `$${fmtCount(Math.round(v))}`;
}

/** Readout fragments; each keeps its number and unit together (no-break spaces). */
function dayDetails(day) {
  const parts = [];
  if (day.turns) parts.push(nb(plural(day.turns, 'request')));
  if (day.missions) parts.push(nb(plural(day.missions, 'mission')));
  if (day.agents) parts.push(nb(plural(day.agents, 'agent')));
  if (day.searches) parts.push(nb(plural(day.searches, 'search', 'searches')));
  if (day.sources) parts.push(nb(plural(day.sources, 'source')));
  if (day.costUsd) parts.push(nb(fmtUsd(day.costUsd)));
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Motion helpers (count-up numbers; all honour prefers-reduced-motion via the duration tokens)

function reducedMotion() {
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/** Duration token (ms) read from CSS so motion follows tokens.css (0 under reduced motion). */
function tokenMs(el, name, fallback) {
  try {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    if (!v) return fallback;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return fallback;
    return /ms$/i.test(v) ? n : /s$/i.test(v) ? n * 1000 : n;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------------------------
// Decorative art (static SVG built with DOM APIs)

function orbitArt(className) {
  const nodes = [];
  const angles = [18, 64, 118, 166, 212, 258, 302, 338];
  angles.forEach((deg, i) => {
    const rad = (deg * Math.PI) / 180;
    nodes.push(h('circle', { class: ['o-node', i % 3 === 0 && 'o-node--hot'], cx: (60 + 50 * Math.cos(rad)).toFixed(2), cy: (60 + 50 * Math.sin(rad)).toFixed(2), r: i % 3 === 0 ? 3 : 2 }));
  });
  return h(
    'svg',
    { class: ['sys-orbit', className], viewBox: '0 0 120 120', attrs: { focusable: 'false', 'aria-hidden': 'true' } },
    h('circle', { class: 'o-ring o-ring--outer', cx: 60, cy: 60, r: 57 }),
    h('circle', { class: 'o-ring o-ring--orbit', cx: 60, cy: 60, r: 50 }),
    h('circle', { class: 'o-ring o-ring--ticks', cx: 60, cy: 60, r: 40 }),
    h('circle', { class: 'o-ring o-ring--inner', cx: 60, cy: 60, r: 27 }),
    h('g', { class: 'o-spin' }, nodes),
    h('circle', { class: 'o-halo', cx: 60, cy: 60, r: 15 }),
    h('circle', { class: 'o-core', cx: 60, cy: 60, r: 8 }),
  );
}

// ---------------------------------------------------------------------------------------------
// The "Systems" dashboard

let viewSeq = 0;
let rememberedMetric = 'agents';

/**
 * createStatsView({ getSpend, listConversations, estimateStorage, getSettings, compact }) → { el, refresh(), destroy() }
 *   getSpend()           → { month, monthUsd, totalUsd } (SPEC 5; may return a Promise)
 *   listConversations()  → Promise<[{ id, … }]>          (SPEC 5; for the conversation count)
 *   estimateStorage()    → Promise<{ usage, quota } | null>  (defaults to this module's estimateStorage)
 *   getSettings()        → settings (optional; shows progress toward spendWarnUsd)
 *   compact              → true inside a host that already shows a "Systems" title (a titled
 *                          sheet): the big title is visually hidden (still announced)
 * All dependencies are optional and failures are contained. Create once and reuse; call
 * refresh() whenever the view is shown. It also refreshes itself when stats change.
 */
export function createStatsView(opts = {}) {
  const deps = isObj(opts) ? opts : {};
  const uid = `sys${++viewSeq}`;
  const ids = { title: `${uid}-title`, spend: `${uid}-spend`, activity: `${uid}-activity`, roles: `${uid}-roles`, device: `${uid}-device` };

  const st = {
    stats: getStats(),
    spend: null,
    settings: null,
    convs: undefined, // undefined = loading, null = unavailable
    storage: undefined,
    days: [],
    metric: rememberedMetric,
    pinned: CHART_DAYS - 1,
    hover: null,
    armed: false, // count-up intro waiting for the view to become visible
    visible: false,
    destroyed: false,
    token: 0,
  };
  const targets = new Map(); // counter element → { value, format }
  const tweens = new Map(); // counter element → rAF id

  // --- header
  const sub = h('p', { class: 'sys-sub' });
  const refreshIcon = h('span', { class: 'sys-refresh-icon' }, icon('refresh', { size: 18 }));
  const refreshBtn = h(
    'button',
    { class: 'sys-icon-btn', type: 'button', title: 'Refresh', attrs: { 'aria-label': 'Refresh statistics', 'data-testid': 'stats-refresh' }, on: { click: onRefreshClick } },
    refreshIcon,
  );
  const head = h(
    'header',
    { class: 'sys-head' },
    h('div', { class: 'sys-badge', attrs: { 'aria-hidden': 'true' } }, icon('logo', { size: 22 })),
    h('div', { class: 'sys-head-text' }, h('p', { class: 'sys-kicker', text: 'Jarvis · Telemetry' }), h('h2', { class: 'sys-title', id: ids.title, text: 'Systems' }), sub),
    refreshBtn,
  );

  // --- empty state
  const empty = h(
    'div',
    { class: 'sys-empty sys-panel', attrs: { 'data-testid': 'stats-empty' } },
    h('div', { class: 'sys-empty-art' }, orbitArt('sys-orbit--empty')),
    h('p', { class: 'sys-empty-title', text: 'Systems standing by' }),
    h('p', { class: 'sys-empty-text', text: 'Nothing logged yet. Every agent Jarvis deploys, every search it runs and every source it reads will be tallied here.' }),
  );

  // --- hero counter
  const heroNum = h('dd', { class: 'sys-num sys-num--hero', attrs: { 'data-testid': 'stats-total-agents' } });
  const heroSub = h('p', { class: 'sys-hero-sub' });
  const hero = h(
    'div',
    { class: 'sys-hero sys-panel' },
    h('dl', { class: 'sys-hero-dl' }, h('div', { class: 'sys-stat' }, h('dt', { class: 'sys-label' }, icon('agents', { size: 14 }), h('span', { text: 'Agents deployed' })), heroNum)),
    heroSub,
    h('div', { class: 'sys-hero-art' }, orbitArt()),
  );

  // --- tiles
  const tile = (label, testid, iconName) => {
    const dd = h('dd', { class: 'sys-num', attrs: { 'data-testid': testid } });
    const el = h('div', { class: 'sys-stat sys-tile sys-panel' }, h('dt', { class: 'sys-label' }, icon(iconName, { size: 14 }), h('span', { text: label })), dd);
    return { el, dd };
  };
  const tMissions = tile('Missions', 'stats-total-missions', 'target');
  const tSearches = tile('Searches', 'stats-total-searches', 'search');
  const tSources = tile('Sources', 'stats-total-sources', 'link');
  const tiles = h('dl', { class: 'sys-tiles' }, tMissions.el, tSearches.el, tSources.el);

  // --- spend
  const spendMonth = h('dd', { class: 'sys-num sys-num--money', attrs: { 'data-testid': 'stats-spend-month' } });
  const spendTotal = h('dd', { class: 'sys-num sys-num--money', attrs: { 'data-testid': 'stats-spend-total' } });
  const spendFill = h('i');
  const spendMeter = h('div', { class: 'sys-meter', attrs: { 'aria-hidden': 'true' } }, spendFill);
  const spendNote = h('p', { class: 'sys-note' });
  const spend = h(
    'section',
    { class: 'sys-spend sys-panel', attrs: { 'aria-labelledby': ids.spend, 'data-testid': 'stats-spend' } },
    h('h3', { class: 'sys-card-title', id: ids.spend }, icon('dollar', { size: 14 }), h('span', { text: 'Estimated spend' })),
    h(
      'dl',
      { class: 'sys-spend-dl' },
      h('div', { class: 'sys-stat' }, h('dt', { class: 'sys-label', text: 'This month' }), spendMonth),
      h('div', { class: 'sys-stat' }, h('dt', { class: 'sys-label', text: 'All time' }), spendTotal),
    ),
    spendMeter,
    spendNote,
  );

  // --- activity chart
  const metricBtns = Object.keys(METRICS).map((key) =>
    h('button', { class: 'sys-seg-btn', type: 'button', text: METRICS[key].label, attrs: { 'aria-pressed': String(key === st.metric), 'data-metric': key }, on: { click: () => setMetric(key) } }),
  );
  const seg = h('div', { class: 'sys-seg', attrs: { role: 'group', 'aria-label': 'Chart metric' } }, metricBtns);
  const readDate = h('span', { class: 'sys-read-date' });
  const readNum = h('span', { class: 'sys-read-num' });
  const readSub = h('span', { class: 'sys-read-sub' });
  const readout = h('div', { class: 'sys-readout', attrs: { 'aria-hidden': 'true' } }, readDate, h('span', { class: 'sys-read-row' }, readNum, readSub));
  const bars = h('div', { class: 'sys-bars' });
  const quiet = h('p', { class: 'sys-quiet', text: 'No activity in the last 14 days', attrs: { 'aria-hidden': 'true' } });
  const plot = h(
    'div',
    {
      class: 'sys-plot',
      tabIndex: 0,
      attrs: { role: 'slider', 'aria-orientation': 'horizontal', 'aria-valuemin': '1', 'aria-valuemax': String(CHART_DAYS), 'data-testid': 'stats-plot' },
      on: { pointerdown: onPointerDown, pointermove: onPointerMove, pointerup: onPointerUp, pointercancel: onPointerCancel, pointerleave: onPointerLeave, keydown: onKey },
    },
    h('div', { class: 'sys-gridlines', attrs: { 'aria-hidden': 'true' } }, h('i'), h('i'), h('i'), h('i')),
    bars,
    quiet,
  );
  const axis = h('div', { class: 'sys-axis', attrs: { 'aria-hidden': 'true' } });
  const rangeFrom = h('span');
  const range = h('div', { class: 'sys-range', attrs: { 'aria-hidden': 'true' } }, rangeFrom, h('span', { text: 'Today' }));
  const srTable = h('table');
  const srData = h('div', { class: 'sys-sr' }, srTable); // a block wrapper: tables ignore width/overflow
  const activity = h(
    'section',
    { class: 'sys-card sys-activity', attrs: { 'aria-labelledby': ids.activity, 'data-testid': 'stats-chart' } },
    h(
      'div',
      { class: 'sys-card-head' },
      h(
        'h3',
        { class: 'sys-card-title', id: ids.activity },
        icon('wave', { size: 14 }),
        h('span', { text: 'Activity' }),
        h('span', { class: 'sys-card-meta' }, h('span', { class: 'sys-card-sep', text: '·', attrs: { 'aria-hidden': 'true' } }), h('span', { text: ' 14 days' })),
      ),
      seg,
    ),
    readout,
    plot,
    axis,
    range,
    srData,
  );
  const cols = [];
  for (let i = 0; i < CHART_DAYS; i++) {
    const bar = h('i', { class: 'sys-bar' });
    const col = h('div', { class: 'sys-col', style: { '--i': i } }, bar);
    bars.appendChild(col);
    const label = h('span');
    axis.appendChild(label);
    cols.push({ col, bar, label });
  }

  // --- roles
  const rolesList = h('ol', { class: 'sys-roles-list' });
  const rolesEmpty = h('p', { class: 'sys-note', text: 'Roles appear here once Jarvis deploys agents.' });
  const roles = h(
    'section',
    { class: 'sys-card sys-roles', attrs: { 'aria-labelledby': ids.roles, 'data-testid': 'stats-roles' } },
    h('h3', { class: 'sys-card-title', id: ids.roles }, icon('agents', { size: 14 }), h('span', { text: 'Top agent roles' })),
    rolesList,
    rolesEmpty,
  );

  // --- device
  const convVal = h('span', { class: 'sys-kv-val', attrs: { 'data-testid': 'stats-conversations' } });
  const turnsVal = h('span', { class: 'sys-kv-val' });
  const fieldVal = h('span', { class: 'sys-kv-val' });
  const storeVal = h('span', { class: 'sys-kv-val', attrs: { 'data-testid': 'stats-storage-used' } });
  const storeFill = h('i');
  const storeMeter = h('div', { class: 'sys-meter', attrs: { 'aria-hidden': 'true' } }, storeFill);
  const storeNote = h('p', { class: 'sys-note' });
  const kv = (label, val) => h('div', { class: 'sys-kv' }, h('span', { class: 'sys-kv-key', text: label }), val);
  const device = h(
    'section',
    { class: 'sys-card sys-device', attrs: { 'aria-labelledby': ids.device, 'data-testid': 'stats-storage' } },
    h('h3', { class: 'sys-card-title', id: ids.device }, icon('chip', { size: 14 }), h('span', { text: 'On this device' })),
    kv('Conversations saved', convVal),
    kv('Requests answered', turnsVal),
    kv('Time in the field', fieldVal),
    kv('Storage used', storeVal),
    storeMeter,
    storeNote,
  );

  const foot = h('p', { class: 'sys-foot', text: 'Kept only on this device. Spend figures are estimates from token counts.' });
  const inner = h('div', { class: 'sys-inner' }, head, empty, hero, tiles, spend, activity, roles, device, foot);
  const el = h('section', { class: ['sys', deps.compact && 'sys--compact'], attrs: { 'data-testid': 'stats-view', 'aria-labelledby': ids.title } }, inner);

  // ------------------------------------------------------------------------------------------
  // Numbers

  function setNumber(dd, value, format) {
    dd.dataset.value = String(value);
    const prev = targets.get(dd);
    targets.set(dd, { value, format });
    if (st.armed) {
      setText(dd, format(0));
      return;
    }
    tween(dd, prev ? prev.value : value, value, format);
  }

  function tween(dd, from, to, format) {
    const running = tweens.get(dd);
    if (running) cancelAnimationFrame(running);
    tweens.delete(dd);
    const dur = reducedMotion() ? 0 : tokenMs(el, '--dur-3', 420) * 2;
    if (!dur || from === to || !el.isConnected || (globalThis.document && document.hidden)) {
      setText(dd, format(to));
      return;
    }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setText(dd, format(p >= 1 ? to : from + (to - from) * eased));
      if (p < 1) tweens.set(dd, requestAnimationFrame(step));
      else tweens.delete(dd);
    };
    setText(dd, format(from));
    tweens.set(dd, requestAnimationFrame(step));
  }

  // Count up from zero (and grow the bars) each time the view comes into sight.
  function arm() {
    if (st.armed || reducedMotion()) return;
    st.armed = true;
    el.classList.add('is-armed');
    for (const [dd, t] of targets) {
      const running = tweens.get(dd);
      if (running) cancelAnimationFrame(running);
      tweens.delete(dd);
      setText(dd, t.format(0));
    }
  }
  function launch() {
    if (!st.armed) return;
    st.armed = false;
    void el.offsetWidth; // commit the zeroed bars so the transition runs
    el.classList.remove('is-armed');
    for (const [dd, t] of targets) tween(dd, 0, t.value, t.format);
  }

  let io = null;
  if (typeof globalThis.IntersectionObserver === 'function' && !reducedMotion()) {
    st.armed = true;
    el.classList.add('is-armed');
    io = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible && !st.visible) {
        st.visible = true;
        raf(launch)();
      } else if (!visible && st.visible) {
        st.visible = false;
        arm();
      }
    });
    io.observe(el);
  }

  // ------------------------------------------------------------------------------------------
  // Render

  function render() {
    const s = st.stats;
    const t = s.totals;
    const hasData = t.turns > 0;
    el.dataset.empty = String(!hasData);
    empty.hidden = hasData;
    hero.hidden = !hasData;
    tiles.hidden = !hasData;
    activity.hidden = !hasData;
    roles.hidden = !hasData;

    setText(sub, s.since ? `Logging since ${fmtDate(s.since, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Standing by · nothing logged yet');

    setNumber(heroNum, t.agents, fmtInt);
    const subParts = [plural(t.missions, 'mission'), plural(t.turns, 'request')];
    if (t.agents) subParts.push(`${Math.round((Math.min(t.agentsOk, t.agents) / t.agents) * 100)}% reported back`);
    setText(heroSub, subParts.map(nb).join(' · '));
    setNumber(tMissions.dd, t.missions, fmtCount);
    setNumber(tSearches.dd, t.searches, fmtCount);
    setNumber(tSources.dd, t.sources, fmtCount);

    renderSpend();
    renderChart();
    renderRoles();
    renderDevice();
  }

  function renderSpend() {
    let month = 0;
    let total = 0;
    const sp = st.spend;
    if (isObj(sp) && (typeof sp.monthUsd === 'number' || typeof sp.totalUsd === 'number')) {
      month = money(sp.monthUsd);
      total = Math.max(money(sp.totalUsd), month);
    } else {
      // No spend module: derive from recorded turns (byDay covers the whole current month).
      const prefix = dayKey(Date.now()).slice(0, 8);
      for (const [key, d] of Object.entries(st.stats.byDay)) if (key.startsWith(prefix)) month += money(d.costUsd);
      month = money(month);
      total = Math.max(money(st.stats.totals.costUsd), month);
    }
    setNumber(spendMonth, month, fmtMoney);
    setNumber(spendTotal, total, fmtMoney);
    const warn = isObj(st.settings) ? num(st.settings.spendWarnUsd) : 0;
    spendMeter.hidden = !warn;
    if (warn) {
      const ratio = month / warn;
      setStyle(spendMeter, { '--w': Math.min(1, ratio).toFixed(4) });
      spendMeter.classList.toggle('is-over', ratio >= 1);
      setText(spendNote, ratio >= 1 ? `Past your $${warn} monthly alert. Estimates from token counts.` : `${Math.round(ratio * 100)}% of your $${warn} monthly alert · estimates from token counts.`);
    } else {
      setText(spendNote, 'Estimates from token counts; your Anthropic console has the exact figures.');
    }
  }

  function renderChart() {
    const days = lastDays(st.stats, CHART_DAYS, Date.now());
    st.days = days;
    const metric = st.metric;
    const values = days.map((d) => metricValue(d, metric));
    const max = Math.max(0, ...values);
    const top = max > 0 ? niceCeil(metric === 'costUsd' ? max : Math.max(max, 4)) : 1;
    const peak = max > 0 ? values.lastIndexOf(max) : -1;
    activity.dataset.metric = metric;
    plot.setAttribute('aria-label', `${METRICS[metric].aria}, last 14 days`);
    days.forEach((d, i) => {
      const { col, label } = cols[i];
      const v = values[i];
      setStyle(col, { '--v': (v / top).toFixed(4) });
      col.classList.toggle('is-zero', v <= 0);
      col.classList.toggle('is-today', i === CHART_DAYS - 1);
      col.classList.toggle('is-peak', i === peak);
      if (i === peak) col.dataset.label = fmtPeak(v, metric);
      else delete col.dataset.label;
      setText(label, fmtDate(d.ms, { weekday: 'narrow' }));
      label.classList.toggle('is-today', i === CHART_DAYS - 1);
    });
    setText(rangeFrom, fmtDate(days[0].ms, { day: 'numeric', month: 'short' }));
    quiet.hidden = max > 0;
    for (const b of metricBtns) b.setAttribute('aria-pressed', String(b.dataset.metric === metric));
    renderSelection();
    renderTable(days);
  }

  function renderSelection() {
    const i = st.hover !== null ? st.hover : st.pinned;
    const d = st.days[i];
    if (!d) return;
    cols.forEach((c, j) => c.col.classList.toggle('is-selected', j === i));
    const isToday = i === CHART_DAYS - 1;
    setText(readDate, `${isToday ? 'Today · ' : ''}${fmtDate(d.ms, { weekday: 'short', day: 'numeric', month: 'short' })}`);
    const metric = st.metric;
    setText(readNum, fmtMetric(metricValue(d, metric), metric));
    const rest = dayDetails(d).filter((p) => !(metric === 'agents' && /\sagents?$/.test(p)) && !(metric === 'searches' && /\ssearch(es)?$/.test(p)) && !(metric === 'costUsd' && p.includes('$')));
    setText(readSub, rest.length ? rest.join(' · ') : 'No activity');
    plot.setAttribute('aria-valuenow', String(i + 1));
    const all = dayDetails(d).map((p) => p.replace(/\u00a0/g, ' '));
    plot.setAttribute('aria-valuetext', `${fmtDate(d.ms, { weekday: 'long', day: 'numeric', month: 'long' })}: ${all.length ? all.join(', ') : 'no activity'}`);
  }

  function renderTable(days) {
    clear(srTable);
    srTable.appendChild(h('caption', { text: 'Daily activity, last 14 days' }));
    srTable.appendChild(h('thead', null, h('tr', null, ['Day', 'Requests', 'Missions', 'Agents', 'Searches', 'Sources', 'Estimated spend'].map((c) => h('th', { attrs: { scope: 'col' }, text: c })))));
    srTable.appendChild(
      h(
        'tbody',
        null,
        days.map((d) =>
          h(
            'tr',
            null,
            h('th', { attrs: { scope: 'row' }, text: fmtDate(d.ms, { weekday: 'short', day: 'numeric', month: 'short' }) }),
            [d.turns, d.missions, d.agents, d.searches, d.sources].map((v) => h('td', { text: fmtCount(v) })),
            h('td', { text: fmtUsd(d.costUsd) }),
          ),
        ),
      ),
    );
  }

  function renderRoles() {
    const top = st.stats.topRoles.slice(0, VIEW_ROLES);
    clear(rolesList);
    const max = top.length ? Math.max(...top.map((r) => r[1])) : 1;
    top.forEach(([role, n], i) => {
      rolesList.appendChild(
        h(
          'li',
          { class: 'sys-role', style: { '--w': (n / max).toFixed(4), '--i': i } },
          h('span', { class: 'sys-role-rank', text: String(i + 1).padStart(2, '0'), attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'sys-role-name', text: role, title: role }),
          h('span', { class: 'sys-role-count' }, h('span', { text: `×${fmtCount(n)}`, attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'sys-sr', text: `${plural(n, 'agent')}` })),
          h('span', { class: 'sys-role-bar', attrs: { 'aria-hidden': 'true' } }),
        ),
      );
    });
    rolesList.hidden = !top.length;
    rolesEmpty.hidden = top.length > 0;
  }

  function renderDevice() {
    const t = st.stats.totals;
    setText(convVal, st.convs === undefined ? '…' : Array.isArray(st.convs) ? fmtInt(st.convs.length) : '—');
    setText(turnsVal, fmtInt(t.turns));
    setText(fieldVal, t.durationMs >= 1000 ? fmtDuration(t.durationMs) : '—');
    const s = st.storage;
    if (st.storage === undefined) {
      setText(storeVal, '…');
      storeMeter.hidden = true;
      setText(storeNote, '');
      storeNote.hidden = true;
    } else if (isObj(s) && Number.isFinite(s.usage)) {
      setText(storeVal, s.quota > 0 ? `${fmtBytes(s.usage)} of ${fmtBytes(s.quota)}` : fmtBytes(s.usage));
      storeMeter.hidden = !(s.quota > 0);
      setStyle(storeMeter, { '--w': s.quota > 0 ? Math.min(1, s.usage / s.quota).toFixed(4) : 0 });
      const note = s.persisted === true ? 'Persistent storage is on: the browser keeps your history.' : s.persisted === false ? 'Best-effort storage: the browser may clear it if the device runs low on space.' : '';
      setText(storeNote, note);
      storeNote.hidden = !note;
    } else {
      setText(storeVal, 'Not reported');
      storeMeter.hidden = true;
      setText(storeNote, 'This browser does not report how much storage Jarvis uses.');
      storeNote.hidden = false;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Chart interaction: tap or drag across the bars (touch keeps vertical scrolling), hover with
  // a mouse, or use the arrow keys on the focused chart (ARIA slider).

  let gesture = null;
  function indexAt(clientX) {
    const r = bars.getBoundingClientRect();
    if (!r.width) return st.pinned;
    return Math.max(0, Math.min(CHART_DAYS - 1, Math.floor(((clientX - r.left) / r.width) * CHART_DAYS)));
  }
  function pin(i) {
    if (i === st.pinned && st.hover === null) return;
    st.pinned = i;
    st.hover = null;
    renderSelection();
  }
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, scrub: e.pointerType === 'mouse' };
    if (e.pointerType === 'mouse') pin(indexAt(e.clientX));
  }
  function onPointerMove(e) {
    if (gesture && gesture.id === e.pointerId) {
      if (!gesture.scrub && Math.abs(e.clientX - gesture.x) > 8 && Math.abs(e.clientX - gesture.x) > Math.abs(e.clientY - gesture.y)) {
        gesture.scrub = true;
        try {
          plot.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      if (gesture.scrub) pin(indexAt(e.clientX));
      return;
    }
    if (e.pointerType === 'mouse') {
      const i = indexAt(e.clientX);
      if (i !== st.hover) {
        st.hover = i;
        renderSelection();
      }
    }
  }
  function onPointerUp(e) {
    if (gesture && gesture.id === e.pointerId && !gesture.scrub) pin(indexAt(e.clientX));
    gesture = null;
  }
  function onPointerCancel() {
    gesture = null;
  }
  function onPointerLeave(e) {
    if (e.pointerType === 'mouse' && !gesture && st.hover !== null) {
      st.hover = null;
      renderSelection();
    }
  }
  function onKey(e) {
    const steps = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageUp: -7, PageDown: 7 };
    let next = null;
    if (e.key in steps) next = st.pinned + steps[e.key];
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = CHART_DAYS - 1;
    if (next === null) return;
    e.preventDefault();
    pin(Math.max(0, Math.min(CHART_DAYS - 1, next)));
  }

  function setMetric(key) {
    if (!METRICS[key] || key === st.metric) return;
    st.metric = key;
    rememberedMetric = key;
    renderChart();
  }

  // ------------------------------------------------------------------------------------------
  // Data

  function call(fn) {
    if (typeof fn !== 'function') return undefined;
    try {
      return fn();
    } catch (err) {
      console.warn('[jarvis] stats view dependency failed:', err);
      return undefined;
    }
  }
  async function settle(value, fallback) {
    try {
      const v = await value;
      return v === undefined ? fallback : v;
    } catch (err) {
      console.warn('[jarvis] stats view dependency failed:', err);
      return fallback;
    }
  }

  async function refresh() {
    if (st.destroyed) return;
    const token = ++st.token;
    st.stats = getStats();
    st.settings = call(deps.getSettings) || null;
    const spend = call(deps.getSpend);
    if (spend && typeof spend.then !== 'function') st.spend = spend;
    render();
    const [spendResult, convs, storageInfo] = await Promise.all([
      settle(spend, null),
      typeof deps.listConversations === 'function' ? settle(call(deps.listConversations), null) : null,
      settle(call(typeof deps.estimateStorage === 'function' ? deps.estimateStorage : estimateStorage), null),
    ]);
    if (token !== st.token || st.destroyed) return;
    st.spend = spendResult;
    st.convs = Array.isArray(convs) ? convs : null;
    st.storage = isObj(storageInfo) ? storageInfo : null;
    renderSpend();
    renderDevice();
  }

  let spinTimer = 0;
  function onRefreshClick() {
    refreshBtn.classList.remove('is-spinning');
    void refreshBtn.offsetWidth;
    refreshBtn.classList.add('is-spinning');
    clearTimeout(spinTimer);
    spinTimer = setTimeout(() => refreshBtn.classList.remove('is-spinning'), 1200);
    refresh();
  }

  let dirty = false;
  const scheduleRefresh = raf(() => {
    if (el.isConnected) refresh();
    else dirty = true;
  });
  const offStats = onStatsChange(scheduleRefresh);
  const onVisibility = () => {
    if (globalThis.document && !document.hidden && el.isConnected) refresh();
  };
  try {
    document.addEventListener('visibilitychange', onVisibility);
  } catch {
    /* no document */
  }

  // First paint is synchronous from localStorage; async parts (spend, conversations, storage) follow.
  refresh();

  return {
    el,
    refresh() {
      dirty = false;
      return refresh();
    },
    destroy() {
      st.destroyed = true;
      offStats();
      scheduleRefresh.cancel();
      clearTimeout(spinTimer);
      if (io) io.disconnect();
      for (const id of tweens.values()) cancelAnimationFrame(id);
      tweens.clear();
      try {
        document.removeEventListener('visibilitychange', onVisibility);
      } catch {
        /* ignore */
      }
    },
    /** True when stats changed while the view was detached (refresh() on show clears it). */
    get stale() {
      return dirty;
    },
  };
}

/**
 * A compact launcher row for the dashboard ("Systems · 227 agents · 44 missions ›"), e.g. under
 * the desktop Mission Control panel. Keeps its readout current as turns are recorded.
 *   createStatsLauncher({ onOpen, testid = 'open-systems-panel' }) → { el, destroy() }
 */
export function createStatsLauncher(opts = {}) {
  const o = isObj(opts) ? opts : {};
  const readout = h('span', { class: 'sys-launch-readout' });
  const el = h(
    'button',
    {
      class: 'sys-launch',
      type: 'button',
      attrs: { 'data-testid': typeof o.testid === 'string' && o.testid ? o.testid : 'open-systems-panel', 'aria-label': 'Open the Systems dashboard' },
      on: { click: () => typeof o.onOpen === 'function' && o.onOpen() },
    },
    h('span', { class: 'sys-launch-icon', attrs: { 'aria-hidden': 'true' } }, icon('chip', { size: 16 })),
    h('span', { class: 'sys-launch-label', text: 'Systems' }),
    readout,
    h('span', { class: 'sys-launch-chevron', attrs: { 'aria-hidden': 'true' } }, icon('chevron-right', { size: 16 })),
  );
  const update = () => {
    const t = getStats().totals;
    setText(readout, t.turns ? [plural(t.agents, 'agent'), plural(t.missions, 'mission')].map(nb).join(' · ') : 'Standing by');
  };
  update();
  const off = onStatsChange(raf(update));
  return {
    el,
    destroy() {
      off();
    },
  };
}

/** Round up to 1, 2, 2.5 or 5 × 10^n. */
function niceCeil(x) {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}
