// Comms: a terminal-style record of what a swarm is doing, derived by diffing agent states each
// time a mission is observed. The engine mutates missions in place and only exposes their current
// state, so this module keeps a small snapshot per agent and turns the differences into entries:
//
//   06:41:12  ATLAS   searching “kyoto ryokan prices april”
//   06:41:15  NOVA    reading japan-guide.com/e/e3913.html
//   06:41:20  ECHO    report filed · 7 sources · 48s
//   06:42:01  WAVE 1  complete · 6/6 agents · 23 searches · 41 sources · 1m 12s
//
// Mission cards and Mission Control both call observeMission() on every update; observing is
// idempotent (an unchanged mission adds nothing), so whoever sees a change first records it and
// the log keeps growing while Mission Control is closed. A mission seen for the first time after it
// already made progress (a conversation restored from history, say) gets a backlog rebuilt from its
// saved state: its searches and page reads keep their order but have no time of their own.
//
// Each agent also gets a "trail": its searches and page reads of the current attempt in the order
// they were observed, with times, for the agent card's search log.
//
// No DOM access: plain data only (unit-tested in Node).

import { errorPhrase, fmtDuration, hostname, isRetryActivity, plural } from './format.js';

export const MAX_ENTRIES = 300; // per mission
const MAX_MISSIONS = 24; // logs kept (least recently observed are dropped)

const AGENT_ACTIVE = new Set(['starting', 'thinking', 'searching', 'reading', 'writing']);
const AGENT_FINAL = new Set(['done', 'error', 'stopped', 'interrupted']);
const MISSION_LIVE = new Set(['planning', 'running']);
const MISSION_FINAL = new Set(['done', 'partial', 'stopped', 'interrupted']);
// Activity lines the engine writes when a single search or page read fails (worth a warning line).
const WARN_ACTIVITY = /\b(unavailable|couldn[’']?t read)\b/i;

const str = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const len = (v) => (Array.isArray(v) ? v.length : 0);
const time = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function oneLine(text, max) {
  const t = str(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Log lines read lower-case ("rate limited — retrying in 12s"), except for names
// ("Claude is busy — …", "Anthropic’s API had a hiccup — …").
function lowerFirst(text) {
  if (!text || /^(Claude|Anthropic|Jarvis)\b/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function agentKey(agent, index) {
  return agent && agent.id !== undefined && agent.id !== null ? String(agent.id) : `#${index}`;
}

export function waveOf(mission) {
  const w = Number(mission && mission.wave);
  return w > 0 ? w : 1;
}

/** "japan-guide.com/e/e3913.html": host plus a short readable path (no query or fragment). */
export function pageLabel(url) {
  let parsed = null;
  try {
    parsed = new URL(str(url));
  } catch {
    parsed = null;
  }
  const host = hostname(str(url));
  if (!parsed || !host) return oneLine(url, 80) || 'a page';
  let path = parsed.pathname || '';
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep it encoded */
  }
  path = path.replace(/\/+$/, '');
  if (path.length > 44) path = `${path.slice(0, 43)}…`;
  return host + path;
}

/** Totals for a mission: agents by outcome, searches, unique sources, duration. */
export function missionTotals(mission, now = Date.now()) {
  const agents = mission && Array.isArray(mission.agents) ? mission.agents : [];
  const out = { total: 0, done: 0, failed: 0, stopped: 0, interrupted: 0, active: 0, searches: 0, fetches: 0, sources: 0, durationMs: null };
  const urls = new Set();
  for (const a of agents) {
    if (!a || typeof a !== 'object') continue;
    out.total++;
    if (a.status === 'done') out.done++;
    else if (a.status === 'error') out.failed++;
    else if (a.status === 'stopped') out.stopped++;
    else if (a.status === 'interrupted') out.interrupted++;
    else if (AGENT_ACTIVE.has(a.status)) out.active++;
    out.searches += len(a.searches);
    out.fetches += len(a.fetches);
    if (Array.isArray(a.sources)) for (const s of a.sources) if (s && s.url) urls.add(s.url);
  }
  out.sources = urls.size;
  const start = time(mission && (mission.startedAt || mission.createdAt));
  if (start !== null) {
    const end = time(mission.endedAt) ?? (MISSION_LIVE.has(mission.status) ? now : null);
    if (end !== null) out.durationMs = Math.max(0, end - start);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Store

let seqCounter = 0;
let lastObserved = null;
const logs = new Map(); // mission id → log, least recently observed first

function createLog(mission) {
  return { id: str(mission.id), wave: waveOf(mission), status: null, entries: [], trimmed: 0, agents: new Map(), mark: false, out: null };
}

function newSnap(key) {
  return {
    key,
    who: 'AGENT',
    status: 'queued',
    attempts: 0,
    activity: '',
    nSearches: 0,
    nFetches: 0,
    online: false, // "online" line written (first time the agent went to work)
    resumed: false, // reset by a resume: the next start reads "back online"
    thought: false, // "thinking" line written in this attempt
    wrote: false, // "writing report" line written in this attempt
    trail: [], // [{ kind: 'search' | 'read', index, at }] for the current attempt
  };
}

function resetAttempt(snap) {
  snap.nSearches = 0;
  snap.nFetches = 0;
  snap.thought = false;
  snap.wrote = false;
  snap.trail = [];
}

function push(log, entry) {
  entry.seq = ++seqCounter;
  log.entries.push(entry);
  if (log.entries.length > MAX_ENTRIES) {
    const drop = log.entries.length - MAX_ENTRIES;
    log.entries.splice(0, drop);
    log.trimmed += drop;
  }
  return entry;
}

function entry(log, at, snapOrNull, kind, tone, text, extra) {
  const e = {
    seq: 0,
    at,
    missionId: log.id,
    wave: log.wave,
    agent: snapOrNull ? snapOrNull.key : null,
    who: snapOrNull ? snapOrNull.who : `WAVE ${log.wave}`,
    kind,
    tone,
    text,
    detail: '',
    replay: false,
  };
  if (extra) Object.assign(e, extra);
  return e;
}

// --- entry builders ---------------------------------------------------------------------------

function onlineText(agent, snap) {
  if (snap.resumed) return 'back online';
  const role = oneLine(agent.role, 64);
  return role ? `online · ${role}` : 'online';
}

function searchText(query) {
  return `searching “${oneLine(query, 160)}”`;
}

function finalEntry(log, snap, agent, at) {
  const status = str(agent.status);
  if (status === 'done') {
    const n = Math.min(len(agent.sources), 30);
    const start = time(agent.startedAt);
    const end = time(agent.endedAt);
    const dur = start !== null && end !== null && end >= start ? ` · ${fmtDuration(end - start)}` : '';
    return entry(log, at, snap, 'done', 'ok', `report filed · ${plural(n, 'source')}${dur}`);
  }
  if (status === 'error') {
    const message = str(agent.error && agent.error.message);
    return entry(log, at, snap, 'fail', 'err', `failed: ${errorPhrase(agent.error || { message: 'unknown error' })}`, { detail: message });
  }
  if (status === 'stopped') return entry(log, at, snap, 'stop', 'warn', 'stopped by owner');
  return entry(log, at, snap, 'interrupt', 'warn', 'interrupted · connection lost');
}

function launchedText(mission) {
  const n = mission && Array.isArray(mission.agents) ? mission.agents.filter(Boolean).length : 0;
  const title = oneLine(mission && mission.title, 90);
  return `launched · ${plural(n, 'agent')}${title ? ` — ${title}` : ''}`;
}

function endEntry(log, mission, at, now) {
  const status = str(mission.status);
  const t = missionTotals(mission, now);
  const tail = [plural(t.searches, 'search', 'searches'), plural(t.sources, 'source')];
  if (t.durationMs !== null) tail.push(fmtDuration(t.durationMs));
  if (status === 'done' || status === 'partial') {
    const parts = [`complete · ${t.done}/${t.total} agents`];
    if (t.failed) parts.push(`${t.failed} failed`);
    if (t.stopped) parts.push(`${t.stopped} stopped`);
    if (t.interrupted) parts.push(`${t.interrupted} interrupted`);
    return entry(log, at, null, 'wave-end', status === 'done' ? 'ok' : 'warn', [...parts, ...tail].join(' · '));
  }
  if (status === 'stopped') return entry(log, at, null, 'wave-end', 'warn', `stopped by owner · ${t.done}/${t.total} done`);
  return entry(log, at, null, 'wave-end', 'warn', `interrupted · ${t.done}/${t.total} done · resume to continue`);
}

function syncWho(snap, agent) {
  const name = str(agent.codename).trim();
  const who = name ? name.toUpperCase() : 'AGENT';
  if (who !== snap.who) snap.who = who;
}

// --- backlog (first sight of a mission that already made progress) ---------------------------

function rebuild(log, mission, now) {
  const status = str(mission.status) || 'planning';
  const agents = Array.isArray(mission.agents) ? mission.agents : [];
  const missionStart = time(mission.startedAt) ?? time(mission.createdAt);
  const items = []; // { t, pri, ord, e }
  let ord = 0;
  let progressed = false; // anything to rebuild beyond the opening line?
  const add = (t, pri, e) => {
    items.push({ t: t ?? Number.MAX_SAFE_INTEGER, pri, ord: ord++, e });
  };

  if (status === 'planning' && !mission.startedAt) {
    add(time(mission.createdAt) ?? now, 0, entry(log, time(mission.createdAt) ?? now, null, 'wave', 'think', 'planning · briefing agents'));
  } else {
    add(missionStart, 0, entry(log, missionStart, null, 'wave', 'wave', launchedText(mission)));
  }

  agents.forEach((a, i) => {
    if (!a || typeof a !== 'object') return;
    const key = agentKey(a, i);
    const snap = newSnap(key);
    log.agents.set(key, snap);
    syncWho(snap, a);
    const st = str(a.status) || 'queued';
    snap.status = st;
    snap.attempts = Number(a.attempts) || 0;
    snap.activity = str(a.activity);
    const nS = len(a.searches);
    const nF = len(a.fetches);
    const started = time(a.startedAt);
    const worked = started !== null || nS > 0 || nF > 0 || AGENT_ACTIVE.has(st);
    if (!worked && !AGENT_FINAL.has(st)) return;
    progressed = true;
    const t0 = started ?? missionStart;
    if (worked) {
      snap.online = true;
      add(t0, 1, entry(log, started, snap, 'online', 'active', onlineText(a, snap)));
    }
    for (let k = 0; k < nS; k++) {
      add(t0, 1, entry(log, null, snap, 'search', 'active', searchText(a.searches[k])));
      snap.trail.push({ kind: 'search', index: k, at: null });
    }
    for (let k = 0; k < nF; k++) {
      add(t0, 1, entry(log, null, snap, 'read', 'active', `reading ${pageLabel(a.fetches[k])}`, { detail: str(a.fetches[k]) }));
      snap.trail.push({ kind: 'read', index: k, at: null });
    }
    snap.nSearches = nS;
    snap.nFetches = nF;
    if (st === 'thinking') snap.thought = true;
    if (st === 'writing') {
      snap.wrote = true;
      add(t0, 1, entry(log, null, snap, 'write', 'active', 'writing report'));
    }
    if (AGENT_FINAL.has(st)) {
      const end = time(a.endedAt);
      add(end ?? t0, 1, finalEntry(log, snap, a, end));
    }
  });

  if (MISSION_FINAL.has(status)) {
    progressed = true;
    const end = time(mission.endedAt);
    add(end, 2, endEntry(log, mission, end, now));
  }

  items.sort((x, y) => x.t - y.t || x.pri - y.pri || x.ord - y.ord);
  for (const it of items) {
    it.e.replay = progressed; // rebuilt from saved state (not seen happening)
    push(log, it.e);
  }
  log.status = status;
}

// --- live diff -------------------------------------------------------------------------------

function diffAgent(log, snap, a, now) {
  syncWho(snap, a);
  const status = str(a.status) || 'queued';
  const attempts = Number(a.attempts) || 0;
  const was = snap.status;

  if (attempts < snap.attempts) {
    // A resume re-runs the agent from scratch (attempts back to 0).
    resetAttempt(snap);
    snap.online = false;
    snap.resumed = true;
  } else if (attempts > snap.attempts) {
    if (snap.attempts >= 1) log.out.push(entry(log, now, snap, 'retry', 'warn', `retrying · attempt ${attempts}`));
    resetAttempt(snap);
  }
  snap.attempts = attempts;

  const nS = len(a.searches);
  const nF = len(a.fetches);
  if (nS < snap.nSearches || nF < snap.nFetches) resetAttempt(snap); // lists restarted

  if (AGENT_ACTIVE.has(status) && !snap.online) {
    log.out.push(entry(log, now, snap, 'online', 'active', onlineText(a, snap)));
    snap.online = true;
    snap.resumed = false;
  }
  if (status === 'thinking' && !snap.thought) {
    log.out.push(entry(log, now, snap, 'think', 'think', 'thinking'));
    snap.thought = true;
  }

  // New searches and page reads. Both lists can grow between two looks; the current status tells
  // which happened last.
  const emitSearches = () => {
    for (let k = snap.nSearches; k < nS; k++) {
      log.out.push(entry(log, now, snap, 'search', 'active', searchText(a.searches[k])));
      snap.trail.push({ kind: 'search', index: k, at: now });
    }
    snap.nSearches = nS;
  };
  const emitReads = () => {
    for (let k = snap.nFetches; k < nF; k++) {
      log.out.push(entry(log, now, snap, 'read', 'active', `reading ${pageLabel(a.fetches[k])}`, { detail: str(a.fetches[k]) }));
      snap.trail.push({ kind: 'read', index: k, at: now });
    }
    snap.nFetches = nF;
  };
  if (status === 'reading') {
    emitSearches();
    emitReads();
  } else {
    emitReads();
    emitSearches();
  }

  if (status === 'writing' && !snap.wrote) {
    log.out.push(entry(log, now, snap, 'write', 'active', 'writing report'));
    snap.wrote = true;
  }

  const activity = str(a.activity);
  const retryNow = isRetryActivity(activity);
  if (status !== was && AGENT_FINAL.has(status)) {
    log.out.push(finalEntry(log, snap, a, now));
  } else if (retryNow && !isRetryActivity(snap.activity)) {
    // A retry wait begins ("Rate limited — retrying in 12s"). The engine then counts the seconds
    // down in the same text; the log records the episode once.
    log.out.push(entry(log, now, snap, 'wait', 'warn', lowerFirst(oneLine(activity, 90))));
  } else if (status !== was && status === 'queued' && AGENT_ACTIVE.has(was) && !retryNow) {
    // Back in the queue mid-run without a countdown (older engines): say what it waits for.
    const text = lowerFirst(oneLine(activity, 90)) || 'waiting for a free slot';
    log.out.push(entry(log, now, snap, 'wait', /rate|busy|overload|retry/i.test(text) ? 'warn' : 'idle', text));
  }
  if (activity !== snap.activity && WARN_ACTIVITY.test(activity) && !AGENT_FINAL.has(status)) {
    log.out.push(entry(log, now, snap, 'warn', 'warn', lowerFirst(oneLine(activity, 120))));
  }
  snap.activity = activity;
  snap.status = status;
}

function diff(log, mission, now) {
  const status = str(mission.status) || 'planning';
  const prev = log.status;
  log.wave = waveOf(mission);
  log.out = [];

  if (status !== prev && status === 'running') {
    if (prev === 'planning' || prev === null) log.out.push(entry(log, now, null, 'wave', 'wave', launchedText(mission)));
    else {
      const todo = Array.isArray(mission.agents) ? mission.agents.filter((a) => a && a.status !== 'done').length : 0;
      log.out.push(entry(log, now, null, 'wave', 'wave', `resuming · ${plural(todo, 'agent')}`));
    }
  }

  const agents = Array.isArray(mission.agents) ? mission.agents : [];
  let present = 0;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!a || typeof a !== 'object') continue;
    const key = agentKey(a, i);
    let snap = log.agents.get(key);
    if (!snap) {
      snap = newSnap(key);
      log.agents.set(key, snap);
    }
    snap.mark = log.mark;
    present++;
    diffAgent(log, snap, a, now);
  }
  if (log.agents.size !== present) {
    // Planned agents beyond the limit are released when the mission launches: forget them.
    for (const [key, snap] of Array.from(log.agents)) if (snap.mark !== log.mark) log.agents.delete(key);
  }
  log.mark = !log.mark;

  if (status !== prev && MISSION_FINAL.has(status) && (prev === null || MISSION_LIVE.has(prev))) {
    log.out.push(endEntry(log, mission, now, now));
  }
  log.status = status;
  for (const e of log.out) push(log, e);
  log.out = null;
}

// --- public API --------------------------------------------------------------------------------

/**
 * Record what changed in `mission` since it was last observed. Returns its log
 * ({ id, wave, status, entries, trimmed }) or null for something that is not a mission.
 */
export function observeMission(mission, now = Date.now()) {
  if (!mission || typeof mission !== 'object' || mission.id === undefined || mission.id === null) return null;
  const id = str(mission.id);
  let log = logs.get(id);
  if (!log) {
    log = createLog(mission);
    logs.set(id, log);
    if (logs.size > MAX_MISSIONS) logs.delete(logs.keys().next().value);
    rebuild(log, mission, now);
    return log;
  }
  diff(log, mission, now);
  // Keep recently observed logs at the end (least recently observed are evicted first).
  if (lastObserved !== id && logs.size > 1) {
    logs.delete(id);
    logs.set(id, log);
  }
  lastObserved = id;
  return log;
}

/** The log of a mission observed before (null if never observed or since evicted). */
export function getMissionLog(missionId) {
  return logs.get(str(missionId)) || null;
}

/**
 * An agent's searches and page reads of its current attempt, in observed order:
 * [{ kind: 'search' | 'read', index, at }] where `index` points into agent.searches / agent.fetches
 * and `at` is null for steps rebuilt from saved state. Null when the agent was never observed.
 */
export function agentTrail(missionId, key) {
  const log = logs.get(str(missionId));
  const snap = log && log.agents.get(str(key));
  return snap ? snap.trail : null;
}

/** The newest entry sequence number handed out so far (cheap change detection). */
export function commsSeq() {
  return seqCounter;
}

/** Forget everything (tests). */
export function resetComms() {
  logs.clear();
  lastObserved = null;
}
