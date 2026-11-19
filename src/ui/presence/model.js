// Presence data model (SPEC 2.4.3, 2.4.4, 2.4.13): pure functions that turn real app state into
// what the HUD shows — the state word, the situation line, the Needs-you items, the telemetry
// gauges and the chronometer — plus the small Needs-you ledger. No DOM, no storage, no clock
// reads (callers pass `now`), so every rule is unit-tested in plain Node.
//
// Rule 1 of the spec applies throughout: real data or nothing. Unknown values are null and show
// as "—"; nothing is invented, sampled at random or padded.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v) => (typeof v === 'string' ? v : '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const pad2 = (n) => String(n).padStart(2, '0');

// ---- state word (SPEC 2.4.3) ----------------------------------------------------------------

/** Tone of each state word (the header dot and text color). */
export const STATE_TONES = Object.freeze({
  idle: 'ok',
  listening: 'active',
  thinking: 'think',
  working: 'active',
  speaking: 'active',
  optics: 'active',
  analyzing: 'active',
  watching: 'active',
  updated: 'ok',
  error: 'err',
  offline: 'warn',
});

/** "4:12" from milliseconds (rounded up, so a countdown never shows 0:00 while running). */
export function clockText(ms) {
  const s = Math.max(0, Math.ceil(num(ms) / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/**
 * The exact state word: STANDING BY · LISTENING · THINKING · WORKING · 3 AGENTS · SPEAKING ·
 * OPTICS LIVE · ANALYZING · WATCHING 4:12 · OFFLINE · ERROR (and SYSTEMS UPDATED for 3 s after an
 * update). Returns { word, label, detail, tone }: label/detail split at " · " for narrow headers.
 */
export function stateWord({ state = 'idle', agents = 0, watchLeftMs = null, updated = false } = {}) {
  let word;
  let key = state;
  switch (state) {
    case 'listening':
      word = 'LISTENING';
      break;
    case 'thinking':
      word = 'THINKING';
      break;
    case 'working': {
      const n = Math.max(0, Math.floor(num(agents)));
      word = n ? `WORKING · ${plural(n, 'AGENT', 'AGENTS')}` : 'WORKING';
      break;
    }
    case 'speaking':
      word = 'SPEAKING';
      break;
    case 'optics':
      word = 'OPTICS LIVE';
      break;
    case 'analyzing':
      word = 'ANALYZING';
      break;
    case 'watching':
      word = watchLeftMs === null || watchLeftMs === undefined ? 'WATCHING' : `WATCHING ${clockText(watchLeftMs)}`;
      break;
    case 'offline':
      word = 'OFFLINE';
      break;
    case 'error':
      word = 'ERROR';
      break;
    default:
      key = 'idle';
      word = updated ? 'SYSTEMS UPDATED' : 'STANDING BY';
      if (updated) key = 'updated';
  }
  const [label, ...rest] = word.split(' · ');
  return { word, label, detail: rest.join(' · '), tone: STATE_TONES[key] || 'ok', state: key };
}

// ---- time of day ----------------------------------------------------------------------------

/** 'morning' | 'afternoon' | 'evening' — the same split the briefing protocol uses. */
export function partOfDay(date) {
  const h = date instanceof Date ? date.getHours() : 12;
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

/** Local calendar day "YYYY-MM-DD". */
export function dayKeyOf(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "Morning briefing" etc. */
export function briefingName(part) {
  return `${part === 'morning' ? 'Morning' : part === 'afternoon' ? 'Afternoon' : 'Evening'} briefing`;
}

// ---- telemetry (the core's three gauges, the readout chips, the legend) ----------------------

/**
 * Real telemetry: { spend, agents, mission } for core.setTelemetry, plus labels and numbers for the
 * readout chips, the legend and the rail.
 *   spend:   this month's estimate ÷ the owner's spend alert (null when the alert is off or the
 *            spend is unknown, e.g. in the demo); above 1 lights the gauge amber
 *   agents:  [active, maxAgents]
 *   mission: [agents finished, agents] of the running mission(s), or null when none is running
 */
export function telemetryOf({ monthUsd = null, todayUsd = null, spendAlertUsd = 0, activeAgents = 0, maxAgents = 8, mission = null } = {}) {
  const month = typeof monthUsd === 'number' && Number.isFinite(monthUsd) ? Math.max(0, monthUsd) : null;
  const today = typeof todayUsd === 'number' && Number.isFinite(todayUsd) ? Math.max(0, todayUsd) : null;
  const alert = num(spendAlertUsd) > 0 ? num(spendAlertUsd) : 0;
  const spend = month !== null && alert ? month / alert : null;
  const max = Math.max(1, Math.floor(num(maxAgents)) || 1);
  const active = Math.max(0, Math.floor(num(activeAgents)));
  const m = isObj(mission) && num(mission.total) > 0 ? [Math.max(0, Math.floor(num(mission.done))), Math.floor(num(mission.total))] : null;
  return {
    core: { spend, agents: [active, max], mission: m },
    spendOver: spend !== null && spend > 1,
    monthUsd: month,
    todayUsd: today,
    spendAlertUsd: alert,
    labels: {
      spend: spend === null ? 'SPEND —' : `SPEND ${Math.round(spend * 100)}%`,
      agents: `AGENTS ${active}/${max}`,
      mission: m ? `MISSION ${m[0]}/${m[1]}` : 'MISSION —',
    },
  };
}

/** "$0.42" for spend readouts ("<$0.01" for tiny non-zero amounts, "—" when unknown). */
export function money(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v > 0 && v < 0.01) return '<$0.01';
  return `$${v.toFixed(2)}`;
}

// ---- running missions -------------------------------------------------------------------------

const AGENT_DONE = new Set(['done', 'error', 'stopped', 'interrupted']);
const AGENT_IDLE = new Set(['done', 'error', 'stopped', 'interrupted', 'queued']);

/**
 * From the live runs' turns: [{ title, active, done, total }] for each planning/running mission.
 * `turns` are the turns of the runs in flight.
 */
export function runningMissions(turns) {
  const out = [];
  for (const turn of Array.isArray(turns) ? turns : []) {
    if (!isObj(turn) || !isObj(turn.missions)) continue;
    for (const m of Object.values(turn.missions)) {
      if (!isObj(m) || (m.status !== 'planning' && m.status !== 'running')) continue;
      const agents = Array.isArray(m.agents) ? m.agents.filter(isObj) : [];
      out.push({
        title: str(m.title).replace(/\s+/g, ' ').trim(),
        active: agents.filter((a) => !AGENT_IDLE.has(a.status)).length,
        done: agents.filter((a) => AGENT_DONE.has(a.status)).length,
        total: agents.length,
      });
    }
  }
  return out;
}

// ---- situation line (SPEC 2.4.4 item 5) ------------------------------------------------------

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

function shortTitle(t, max = 28) {
  const s = str(t).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/**
 * One line built on the device (no Claude call), in order and only from real data:
 * the weather (when set up), the goal (the live mission, a ready briefing, what needs the owner,
 * or "Nothing needs you."), and the Jarvis Core when a Pi is paired and offline.
 */
export function situationLine({ weather = null, running = [], busy = [], needs = [], briefingReady = null, coreLine = null } = {}) {
  const parts = [];
  if (str(weather)) parts.push(str(weather).trim());
  // running: live missions; busy: titles of replies in flight without one (the lead at work).
  const live = Array.isArray(running) && running.some(isObj) ? running.filter(isObj) : (Array.isArray(busy) ? busy : []).map((title) => ({ title, active: 0 }));
  const list = Array.isArray(needs) ? needs.filter(isObj) : [];
  if (live.length) {
    const r = live[0];
    const title = shortTitle(r.title);
    const n = Math.max(0, Math.floor(num(r.active)));
    if (n && title) parts.push(`${plural(n, 'agent', 'agents')} still working on “${title}”.`);
    else if (title) parts.push(`Working on “${title}”.`);
    else parts.push(n ? `${plural(n, 'agent', 'agents')} still working.` : 'Working on it.');
  } else if (briefingReady) {
    parts.push(`Your ${str(briefingReady).toLowerCase()} is ready.`);
  } else if (list.length) {
    const n = list.length;
    parts.push(n === 1 ? 'One thing needs you.' : `${n < WORDS.length ? WORDS[n] : n} things need you.`);
  } else {
    parts.push('Nothing needs you.');
  }
  if (str(coreLine)) parts.push(str(coreLine).trim());
  return parts.join(' ');
}

// ---- Needs-you (SPEC 2.4.4 item 6) -------------------------------------------------------------
// The ledger lives in localStorage (the controller loads and saves it). It records what the app
// saw happen, never guesses:
//   unread:    missions that finished while the owner was away (page hidden or another chat)
//   seen:      convId -> the last time the owner opened that conversation
//   briefings: 'YYYY-MM-DD' -> ['morning' | 'afternoon' | 'evening'] the briefing protocol ran

export const LEDGER_KEY = 'jarvis.needs.v1';
const UNREAD_MAX = 12;
const BRIEFING_DAYS = 14;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PARTS = ['morning', 'afternoon', 'evening'];

export function emptyLedger() {
  return { unread: [], seen: {}, briefings: {} };
}

/** A valid ledger from stored JSON (anything malformed is dropped). */
export function normalizeLedger(raw) {
  const out = emptyLedger();
  if (!isObj(raw)) return out;
  if (Array.isArray(raw.unread)) {
    for (const u of raw.unread) {
      if (!isObj(u) || !str(u.convId) || !str(u.turnId)) continue;
      out.unread.push({
        convId: str(u.convId),
        turnId: str(u.turnId),
        title: str(u.title).slice(0, 120),
        status: str(u.status) || 'done',
        agents: Math.max(0, Math.floor(num(u.agents))),
        failed: Math.max(0, Math.floor(num(u.failed))),
        briefing: str(u.briefing) && PARTS.includes(u.briefing) ? u.briefing : '',
        at: num(u.at),
      });
    }
    out.unread = out.unread.slice(-UNREAD_MAX);
  }
  if (isObj(raw.seen)) for (const [k, v] of Object.entries(raw.seen)) if (k && num(v) > 0) out.seen[k] = num(v);
  if (isObj(raw.briefings)) {
    for (const [k, v] of Object.entries(raw.briefings)) {
      if (!DAY_RE.test(k) || !Array.isArray(v)) continue;
      const parts = v.filter((p) => PARTS.includes(p));
      if (parts.length) out.briefings[k] = Array.from(new Set(parts));
    }
  }
  return out;
}

/** A mission finished while the owner was away. */
export function noteUnread(ledger, item) {
  const l = normalizeLedger(ledger);
  if (!isObj(item) || !str(item.convId) || !str(item.turnId)) return l;
  l.unread = l.unread.filter((u) => !(u.convId === item.convId && u.turnId === item.turnId));
  l.unread.push(normalizeLedger({ unread: [item] }).unread[0]);
  l.unread = l.unread.slice(-UNREAD_MAX);
  return l;
}

/** The owner opened a conversation: everything in it up to `at` is seen. */
export function noteSeen(ledger, convId, at) {
  const l = normalizeLedger(ledger);
  if (!str(convId)) return l;
  l.seen[convId] = Math.max(num(l.seen[convId]), num(at));
  l.unread = l.unread.filter((u) => !(u.convId === convId && u.at <= l.seen[convId]));
  const ids = Object.keys(l.seen);
  if (ids.length > 200) for (const id of ids.sort((a, b) => l.seen[a] - l.seen[b]).slice(0, ids.length - 200)) delete l.seen[id];
  return l;
}

/** The briefing protocol ran (part of day) on `date`. Keeps two weeks. */
export function noteBriefing(ledger, date, part) {
  const l = normalizeLedger(ledger);
  if (!PARTS.includes(part)) return l;
  const key = dayKeyOf(date);
  l.briefings[key] = Array.from(new Set([...(l.briefings[key] || []), part]));
  const keys = Object.keys(l.briefings).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - BRIEFING_DAYS))) delete l.briefings[k];
  return l;
}

/** Forget a conversation everywhere (it was deleted). */
export function forgetConversation(ledger, convId) {
  const l = normalizeLedger(ledger);
  l.unread = l.unread.filter((u) => u.convId !== convId);
  delete l.seen[convId];
  return l;
}

/**
 * The owner has a briefing habit for this part of the day: it ran on at least `min` of the
 * previous 7 days. Only then does a missing briefing become a Needs-you item (no nagging).
 */
export function briefingHabit(ledger, date, part, min = 2) {
  const l = normalizeLedger(ledger);
  let days = 0;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - i, 12);
    if ((l.briefings[dayKeyOf(d)] || []).includes(part)) days++;
  }
  return days >= min;
}

const TONE_ORDER = { interrupted: 0, failed: 1, spend: 2, finished: 3, briefing: 4 };

function timeText(at, locale) {
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(at));
  } catch {
    const d = new Date(at);
    return `${d.getHours()}:${pad2(d.getMinutes())}`;
  }
}

/**
 * Needs-you items, most urgent first: [{ id, kind, tone, icon, title, detail, action, convId?,
 * turnId?, part? }]. kind: 'interrupted' (Resume) · 'failed' (Retry) · 'spend' (Review) ·
 * 'finished' (View) · 'briefing' (Run).
 *   ledger        the Needs-you ledger
 *   interrupted   [{ convId, turnId, title, done, total }] from the startup scan (engine.canResume)
 *   spend         { monthUsd, alertUsd, dismissed } (the spend banner's own dismissal counts)
 *   briefingRun   whether this part's briefing already ran today; habit: briefingHabit(...)
 *   currentConvId the conversation on screen (its items are already in view)
 */
export function deriveNeeds({ ledger, interrupted = [], spend = null, now = new Date(), currentConvId = null, locale } = {}) {
  const l = normalizeLedger(ledger);
  const items = [];
  const seenIds = new Set();
  const push = (item) => {
    if (seenIds.has(item.id)) return;
    seenIds.add(item.id);
    items.push(item);
  };
  for (const it of Array.isArray(interrupted) ? interrupted : []) {
    if (!isObj(it) || !str(it.convId) || it.convId === currentConvId) continue;
    const total = Math.floor(num(it.total));
    const done = Math.floor(num(it.done));
    push({
      id: `interrupted:${it.convId}`,
      kind: 'interrupted',
      tone: 'warn',
      icon: 'refresh',
      title: shortTitle(it.title, 48) || (total ? 'Mission interrupted' : 'Reply interrupted'),
      detail: [total ? 'MISSION INTERRUPTED' : 'REPLY INTERRUPTED', total ? `${done} OF ${total} AGENTS DONE` : ''].filter(Boolean).join(' · '),
      action: 'Resume',
      convId: it.convId,
      turnId: str(it.turnId),
    });
  }
  for (const u of l.unread.slice().reverse()) {
    if (u.convId === currentConvId) continue;
    if (u.status === 'error') {
      push({
        id: `failed:${u.convId}:${u.turnId}`,
        kind: 'failed',
        tone: 'err',
        icon: 'alert',
        title: shortTitle(u.title, 48) || (u.agents ? 'Mission failed' : 'Request failed'),
        detail: [u.agents ? 'MISSION FAILED' : 'REQUEST FAILED', timeText(u.at, locale).toUpperCase()].filter(Boolean).join(' · '),
        action: 'Retry',
        convId: u.convId,
        turnId: u.turnId,
      });
      continue;
    }
    const status = u.briefing ? 'READY' : u.failed ? `${u.failed} OF ${u.agents} FAILED` : u.agents ? `DONE · ${plural(u.agents, 'AGENT', 'AGENTS')}` : 'DONE';
    push({
      id: `finished:${u.convId}:${u.turnId}`,
      kind: 'finished',
      tone: u.failed ? 'warn' : 'ok',
      icon: u.briefing ? 'clock' : 'check',
      title: u.briefing ? `${briefingName(u.briefing)} is ready` : shortTitle(u.title, 48) || 'Mission complete',
      detail: [status, timeText(u.at, locale).toUpperCase()].filter(Boolean).join(' · '),
      action: 'View',
      convId: u.convId,
      turnId: u.turnId,
      briefing: u.briefing || '',
    });
  }
  if (isObj(spend) && num(spend.alertUsd) > 0 && num(spend.monthUsd) >= num(spend.alertUsd) && !spend.dismissed) {
    push({
      id: `spend:${dayKeyOf(now).slice(0, 7)}`,
      kind: 'spend',
      tone: 'warn',
      icon: 'dollar',
      title: 'Spending passed your alert',
      detail: `${money(num(spend.monthUsd))} THIS MONTH · ALERT $${num(spend.alertUsd)}`,
      action: 'Review',
    });
  }
  const part = partOfDay(now);
  const ranToday = (l.briefings[dayKeyOf(now)] || []).includes(part);
  if (!ranToday && briefingHabit(l, now, part)) {
    push({
      id: `briefing:${dayKeyOf(now)}:${part}`,
      kind: 'briefing',
      tone: 'accent',
      icon: 'clock',
      title: `${briefingName(part)} hasn’t run yet`,
      detail: 'YOU USUALLY RUN IT ABOUT NOW',
      action: 'Run',
      part,
    });
  }
  items.sort((a, b) => TONE_ORDER[a.kind] - TONE_ORDER[b.kind]);
  return items;
}

/** The ready briefing among the Needs-you items ('Evening briefing'), or null. */
export function readyBriefing(needs) {
  const hit = (Array.isArray(needs) ? needs : []).find((n) => isObj(n) && n.kind === 'finished' && n.briefing);
  return hit ? briefingName(hit.briefing) : null;
}

// ---- conversations: what the startup scan finds -------------------------------------------------

/**
 * For a conversation the engine says can be resumed: { convId, turnId, title, done, total } from
 * its last Jarvis turn (the mission's agents), else null.
 */
export function interruptedInfo(conv) {
  if (!isObj(conv) || !Array.isArray(conv.turns)) return null;
  const turns = conv.turns.filter(isObj);
  const last = turns[turns.length - 1];
  if (!last || last.role !== 'jarvis') return null;
  let done = 0;
  let total = 0;
  let title = '';
  for (const m of Object.values(isObj(last.missions) ? last.missions : {})) {
    if (!isObj(m)) continue;
    const agents = Array.isArray(m.agents) ? m.agents.filter(isObj) : [];
    total += agents.length;
    done += agents.filter((a) => a.status === 'done').length;
    if (!title) title = str(m.title);
  }
  return { convId: str(conv.id), turnId: str(last.id), title: title || str(conv.title), done, total };
}

/** What to record when a run ends while the owner is away (null when it isn't a mission). */
export function unreadFromTurn(conv, turn, briefing = '') {
  if (!isObj(conv) || !isObj(turn)) return null;
  const missions = Object.values(isObj(turn.missions) ? turn.missions : {}).filter(isObj);
  if (!missions.length && turn.status !== 'error') return null;
  let agents = 0;
  let failed = 0;
  for (const m of missions) {
    for (const a of Array.isArray(m.agents) ? m.agents.filter(isObj) : []) {
      agents++;
      if (a.status === 'error') failed++;
    }
  }
  const title = str(missions[0] && missions[0].title) || str(conv.title);
  return { convId: str(conv.id), turnId: str(turn.id), title, status: str(turn.status), agents, failed, briefing, at: num(turn.endedAt) || Date.now() };
}

// ---- chronometer ---------------------------------------------------------------------------------

/**
 * The rail's clock, no seconds: { digits: '9:47', period: 'PM' | '', date: 'THURSDAY 19 NOVEMBER' }.
 * Follows the locale's 12/24-hour preference.
 */
export function chronometer(date, locale) {
  const d = date instanceof Date ? date : new Date();
  let digits = `${d.getHours()}:${pad2(d.getMinutes())}`;
  let period = '';
  let dateText = '';
  try {
    const parts = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).formatToParts(d);
    const hour = parts.find((p) => p.type === 'hour');
    const minute = parts.find((p) => p.type === 'minute');
    const dp = parts.find((p) => p.type === 'dayPeriod');
    if (hour && minute) digits = `${hour.value}:${minute.value}`;
    period = dp ? dp.value.toUpperCase() : '';
    dateText = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(d).replace(/,/g, '').toUpperCase();
  } catch {
    dateText = dayKeyOf(d);
  }
  return { digits, period, date: dateText };
}

// ---- hero size (SPEC 2.4.4 item 2) -----------------------------------------------------------------

/** Hero core size for a viewport: 232 on desktop; 184 / 148 / 120 on phones by height. */
export function heroSize({ width = 390, height = 844 } = {}) {
  if (width >= 900) return 232;
  if (height >= 740) return 184;
  if (height >= 620) return 148;
  return 120;
}
