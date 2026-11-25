// Health rules. Each rule turns part of the live snapshot into an item with a level (ok | warn | alert),
// with hysteresis so a value hovering at a threshold never flaps:
//
//   - threshold rules rise only after the value has stayed past the threshold for `raiseSec`, and fall back
//     only once it is `margin` below the threshold (above, for "below" rules) for `clearSec`;
//   - check rules (internet, API, site, Tailscale) need `failures` failed checks in a row; one good check
//     clears them;
//   - the runaway-process rule needs one process to keep a CPU thread busy for 5 minutes.
//
// evaluate(snapshot, t) → { health, transitions }. transitions are the items whose level changed this
// tick; the core turns them into events. Unknown values (no sensor, not checked yet) never raise anything:
// the item says it is not available.

import { isNum } from './util.mjs';
import { fmtBytes, fmtTemp, fmtPct, fmtMs, fmtDuration } from './format.mjs';

export const LEVELS = ['ok', 'warn', 'alert'];
const rank = (l) => LEVELS.indexOf(l);

export const DEFAULT_THRESHOLDS = {
  cpuTemp: { warn: 80, alert: 90, margin: 5, raiseSec: 10, clearSec: 30 },
  gpuTemp: { warn: 80, alert: 88, margin: 4, raiseSec: 10, clearSec: 30 },
  disk: { warn: 85, alert: 95, margin: 1, raiseSec: 0, clearSec: 60 },
  memory: { warn: 10, alert: 5, margin: 2, raiseSec: 15, clearSec: 30 }, // percent of RAM still available
  swap: { warn: 50, alert: 80, margin: 5, raiseSec: 60, clearSec: 60 },
  cpuBusy: { warn: 90, margin: 15, raiseSec: 300, clearSec: 60 },
  processPin: { threadPct: 90, clearPct: 60, raiseSec: 300, clearSec: 30 },
  checks: { failures: 2 }, // internet, API, site, Tailscale
  gpuErrors: 3, // nvidia-smi errors in a row before "GPU driver" warns
  unknownResetSec: 60, // a value unreadable this long drops its item back to ok
};

/** A level tracker with delayed rises and falls. */
function createTracker() {
  let level = 'ok';
  let since = null;
  let pending = null;
  return {
    get level() {
      return level;
    },
    get since() {
      return since;
    },
    /** Move toward `target` after waiting raiseMs (up) or clearMs (down). Returns the old level on change. */
    want(target, t, raiseMs = 0, clearMs = 0) {
      if (target === level) {
        pending = null;
        return null;
      }
      if (!pending || pending.level !== target) pending = { level: target, at: t };
      const wait = rank(target) > rank(level) ? raiseMs : clearMs;
      if (t - pending.at < wait) return null;
      const from = level;
      level = target;
      since = t;
      pending = null;
      return from;
    },
    reset(t) {
      const from = level;
      level = 'ok';
      since = t;
      pending = null;
      return from === 'ok' ? null : from;
    },
    /** Set the "since" time of a tracker that has never changed (its first evaluation). */
    touch(t) {
      if (since === null) since = t;
    },
    /** Start at a saved level (a restart), so a condition that still holds is not logged again. */
    seed(l, s) {
      level = l;
      since = Number.isFinite(s) ? s : null;
      pending = null;
    },
  };
}

/** The raw level of a value against warn/alert thresholds with release margins, given the current level. */
export function thresholdLevel(v, current, { warn, alert = null, margin = 0, dir = 'above' }) {
  const over = (th) => (dir === 'above' ? v >= th : v <= th);
  const released = (th) => (dir === 'above' ? v < th - margin : v > th + margin);
  let r = alert !== null && over(alert) ? 'alert' : over(warn) ? 'warn' : 'ok';
  if (rank(r) < rank(current)) {
    const th = current === 'alert' ? alert : warn;
    if (!released(th)) r = current;
    else if (current === 'alert' && r === 'ok' && !released(warn)) r = 'warn';
  }
  return r;
}

const mountLabel = (m) => (m === '/' ? 'Main drive' : `Drive ${m}`);

export function createHealth({ thresholds = {}, gpuMissingLevel = 'warn' } = {}) {
  const th = {};
  for (const [k, v] of Object.entries(DEFAULT_THRESHOLDS)) th[k] = typeof v === 'object' ? { ...v, ...(thresholds[k] ?? {}) } : thresholds[k] ?? v;
  const trackers = new Map();
  const unknownSince = new Map();
  const pins = new Map(); // pid → { highSince, label, threadPct, lastSeen }
  let rev = 0;
  let overall = 'ok';
  let overallSince = null;
  let lastIds = '';

  const tracker = (id) => {
    let tr = trackers.get(id);
    if (!tr) {
      tr = createTracker();
      trackers.set(id, tr);
    }
    return tr;
  };

  /** Evaluate a threshold rule; null values hold the level for a while, then reset it. */
  function thresholdItem(id, value, t, cfg, dir = 'above') {
    const tr = tracker(id);
    if (!isNum(value)) {
      const since = unknownSince.get(id) ?? t;
      unknownSince.set(id, since);
      const changed = t - since >= th.unknownResetSec * 1000 ? tr.reset(t) : null;
      return { level: tr.level, changed, available: false };
    }
    unknownSince.delete(id);
    const target = thresholdLevel(value, tr.level, { ...cfg, dir });
    const changed = tr.want(target, t, (cfg.raiseSec ?? 0) * 1000, (cfg.clearSec ?? 0) * 1000);
    return { level: tr.level, changed, available: true };
  }

  /** Evaluate a direct-level rule (checks, driver): `target` null means unknown (hold). */
  function directItem(id, target, t) {
    const tr = tracker(id);
    const changed = target === null ? null : tr.want(target, t);
    return { level: tr.level, changed };
  }

  function evaluate(s, t) {
    const items = [];
    const transitions = [];
    const add = (item, changed) => {
      const tr = tracker(item.id);
      if (tr.since === null) tr.touch(t);
      const full = {
        id: item.id,
        label: item.label,
        level: tr.level,
        available: item.available ?? true,
        value: item.value ?? null,
        unit: item.unit ?? null,
        message: item.message,
        detail: item.detail ?? null,
        since: tr.since,
      };
      items.push(full);
      if (changed) transitions.push({ id: full.id, label: full.label, from: changed, to: full.level, message: full.message, value: full.value, unit: full.unit });
    };

    // ---- CPU temperature
    {
      const v = s.cpu?.temp?.packageC ?? s.cpu?.temp?.maxC ?? null;
      const r = thresholdItem('cpu.temp', v, t, th.cpuTemp);
      const lv = trackers.get('cpu.temp').level;
      add(
        {
          id: 'cpu.temp',
          label: 'CPU temperature',
          available: r.available,
          value: v,
          unit: '°C',
          message: !r.available ? 'No temperature sensor reading' : lv === 'alert' ? `CPU overheating: ${fmtTemp(v)}` : lv === 'warn' ? `CPU running hot: ${fmtTemp(v)}` : `CPU at ${fmtTemp(v)}`,
          detail: !r.available ? 'install lm-sensors and check that the coretemp sensor is loaded' : null,
        },
        r.changed,
      );
    }

    // ---- CPU busy for a long time
    {
      const v = s.cpu?.usagePct ?? null;
      const r = thresholdItem('cpu.load', v, t, th.cpuBusy);
      const lv = trackers.get('cpu.load').level;
      add({ id: 'cpu.load', label: 'CPU load', available: r.available, value: v, unit: '%', message: !r.available ? 'Measuring' : lv === 'ok' ? `CPU at ${fmtPct(v)}` : `CPU busy: ${fmtPct(v)} for over ${fmtDuration(th.cpuBusy.raiseSec)}` }, r.changed);
    }

    // ---- A process pinning a CPU thread
    {
      const cfg = th.processPin;
      for (const p of s.processes?.topCpu ?? []) {
        if (!isNum(p.threadPct)) continue;
        const e = pins.get(p.pid);
        if (p.threadPct >= cfg.threadPct) {
          if (e) Object.assign(e, { lastSeen: t, threadPct: p.threadPct, label: p.label });
          else pins.set(p.pid, { highSince: t, lastSeen: t, threadPct: p.threadPct, label: p.label });
        } else if (e) {
          if (p.threadPct < cfg.clearPct) pins.delete(p.pid);
          else Object.assign(e, { lastSeen: t, threadPct: p.threadPct });
        }
      }
      for (const [pid, e] of pins) if (t - e.lastSeen > 15_000) pins.delete(pid); // gone or no longer near the top
      let worst = null;
      for (const [pid, e] of pins) {
        if (t - e.highSince >= cfg.raiseSec * 1000 && (!worst || e.highSince < worst.highSince)) worst = { pid, ...e };
      }
      const tr = tracker('cpu.process');
      const changed = tr.want(worst ? 'warn' : 'ok', t, 0, cfg.clearSec * 1000);
      add(
        {
          id: 'cpu.process',
          label: 'Runaway process',
          value: worst ? worst.threadPct : null,
          unit: '%',
          message:
            tr.level === 'ok' || !worst
              ? 'No runaway processes'
              : worst.threadPct >= 150
                ? `${worst.label} has been using about ${Math.round(worst.threadPct / 100)} CPU threads for ${fmtDuration((t - worst.highSince) / 1000, { parts: 1 })}`
                : `${worst.label} has kept a CPU thread busy for ${fmtDuration((t - worst.highSince) / 1000, { parts: 1 })}`,
          detail: worst ? `pid ${worst.pid}` : null,
        },
        changed,
      );
    }

    // ---- GPU driver
    {
      const g = s.gpu ?? {};
      const missing = ['not-installed', 'driver-not-loaded', 'no-device'].includes(g.status);
      let target = null;
      if (g.status === 'ok') target = 'ok';
      else if (missing) target = gpuMissingLevel;
      else if (g.status === 'error') target = (g.errors ?? 0) >= th.gpuErrors ? 'warn' : null;
      const r = directItem('gpu.driver', target, t);
      add(
        {
          id: 'gpu.driver',
          label: 'GPU driver',
          available: g.status !== 'pending',
          value: g.driver ?? null,
          message: g.status === 'ok' ? `NVIDIA driver ${g.driver}` : g.status === 'pending' ? 'Checking' : missing ? 'GPU driver not loaded' : 'GPU not answering',
          detail: g.status === 'ok' ? null : g.detail ?? null,
        },
        r.changed,
      );
    }

    // ---- GPU temperature
    {
      const v = s.gpu?.tempC ?? null;
      const r = thresholdItem('gpu.temp', v, t, th.gpuTemp);
      const lv = trackers.get('gpu.temp').level;
      add(
        {
          id: 'gpu.temp',
          label: 'GPU temperature',
          available: r.available,
          value: v,
          unit: '°C',
          message: !r.available ? 'No reading (driver not loaded)' : lv === 'alert' ? `Graphics card overheating: ${fmtTemp(v)}` : lv === 'warn' ? `Graphics card running hot: ${fmtTemp(v)}` : `Graphics card at ${fmtTemp(v)}`,
        },
        r.changed,
      );
    }

    // ---- Memory (available RAM)
    {
      const v = s.memory?.availablePct ?? null;
      const r = thresholdItem('memory', v, t, th.memory, 'below');
      const lv = trackers.get('memory').level;
      add({ id: 'memory', label: 'Memory', available: r.available, value: v, unit: '%', message: lv === 'alert' ? `Memory nearly full: ${fmtPct(v)} available` : lv === 'warn' ? `Memory low: ${fmtPct(v)} available` : `${fmtPct(v)} available` }, r.changed);
    }

    // ---- Swap
    {
      const total = s.memory?.swap?.totalBytes ?? 0;
      const v = total > 0 ? s.memory?.swap?.usedPct ?? null : null;
      const r = thresholdItem('swap', v, t, th.swap);
      const lv = trackers.get('swap').level;
      add(
        {
          id: 'swap',
          label: 'Swap',
          available: total > 0,
          value: v,
          unit: '%',
          message: total <= 0 ? 'No swap' : lv === 'alert' ? `Swap nearly full: ${fmtPct(v)} used` : lv === 'warn' ? `Heavy swap use: ${fmtPct(v)} used` : `${fmtPct(v)} used`,
        },
        r.changed,
      );
    }

    // ---- Disk space, per mounted drive
    for (const m of s.disks?.mounts ?? []) {
      const id = `disk:${m.mount}`;
      const r = thresholdItem(id, m.usedPct, t, th.disk);
      const lv = trackers.get(id).level;
      const free = fmtBytes(m.freeBytes);
      add(
        {
          id,
          label: m.mount === '/' ? 'Main drive (/)' : `Drive ${m.mount}`,
          available: r.available,
          value: m.usedPct,
          unit: '%',
          message: lv === 'ok' ? `${fmtPct(m.usedPct)} full, ${free} free` : `${mountLabel(m.mount)} ${fmtPct(m.usedPct)} full (${free} free)`,
        },
        r.changed,
      );
    }

    // ---- Disk health (SMART)
    {
      const h = s.disks?.health ?? { status: 'not-checked' };
      const target = h.status === 'failing' ? 'alert' : h.status === 'warning' ? 'warn' : h.status === 'ok' ? 'ok' : 'ok';
      const r = directItem('disk.health', target, t);
      add(
        {
          id: 'disk.health',
          label: 'Disk health',
          available: h.status !== 'not-checked',
          message: h.status === 'failing' ? `Disk failing: ${h.detail}` : h.status === 'warning' ? `Disk wear: ${h.detail}` : h.status === 'ok' ? 'SMART health check passed' : `Not checked${h.detail ? ` (${h.detail})` : ''}`,
        },
        r.changed,
      );
    }

    // ---- Internet, Claude API, Jarvis site
    const sv = s.services ?? {};
    const n = th.checks.failures;
    {
      const i = sv.internet ?? {};
      const target = i.status === 'up' ? 'ok' : i.status === 'down' ? (i.failures >= n ? 'alert' : null) : null;
      const r = directItem('internet', target, t);
      const lv = trackers.get('internet').level;
      add({ id: 'internet', label: 'Internet', available: i.status !== 'unknown', value: i.latencyMs ?? null, unit: 'ms', message: lv === 'alert' ? 'Internet down' : i.status === 'up' ? `Online (${fmtMs(i.latencyMs)})` : i.status === 'down' ? 'Not answering, checking again' : 'Checking', detail: i.detail ?? null }, r.changed);
    }
    const internetDown = trackers.get('internet').level !== 'ok';
    {
      const a = sv.api ?? {};
      const target = internetDown ? 'ok' : a.status === 'up' ? 'ok' : a.status === 'down' ? (a.failures >= n ? 'warn' : null) : null;
      const r = directItem('api', target, t);
      const lv = trackers.get('api').level;
      add(
        {
          id: 'api',
          label: 'Claude API',
          available: a.status !== 'unknown' && !internetDown,
          value: a.latencyMs ?? null,
          unit: 'ms',
          message: internetDown ? 'Unknown while the internet is down' : lv === 'warn' ? 'Claude API unreachable' : a.status === 'up' ? `Reachable (${fmtMs(a.latencyMs)})` : a.status === 'down' ? 'Not answering, checking again' : 'Checking',
          detail: a.detail ?? null,
        },
        r.changed,
      );
    }
    {
      const w = sv.site ?? {};
      const target = internetDown ? 'ok' : w.status === 'up' ? 'ok' : w.status === 'down' ? (w.failures >= n ? 'warn' : null) : null;
      const r = directItem('site', target, t);
      const lv = trackers.get('site').level;
      add(
        {
          id: 'site',
          label: 'Jarvis website',
          available: w.status !== 'unknown' && !internetDown,
          value: w.buildId ?? null,
          message: internetDown ? 'Unknown while the internet is down' : lv === 'warn' ? 'Jarvis website unreachable' : w.status === 'up' ? (w.buildId ? `Up, build ${w.buildId}` : 'Up') : w.status === 'down' ? 'Not answering, checking again' : 'Checking',
          detail: w.detail ?? null,
        },
        r.changed,
      );
    }

    // ---- Tailscale
    {
      const ts = sv.tailscale ?? {};
      const bad = ['logged-out', 'needs-approval', 'stopped', 'not-running'].includes(ts.status);
      const target = ts.status === 'running' || ts.status === 'not-installed' ? 'ok' : bad && (ts.failures ?? 0) >= n ? 'warn' : null;
      const r = directItem('tailscale', target, t);
      const words = { 'logged-out': 'Tailscale logged out', 'needs-approval': 'Tailscale waiting for approval', stopped: 'Tailscale switched off', 'not-running': 'Tailscale service not running' };
      add(
        {
          id: 'tailscale',
          label: 'Tailscale',
          available: !['unknown', 'not-installed', 'error'].includes(ts.status ?? 'unknown'),
          value: ts.status === 'running' ? ts.online ?? 0 : null,
          message:
            ts.status === 'running'
              ? `Connected, ${ts.online ?? 0} of ${ts.total ?? 0} devices online`
              : ts.status === 'not-installed'
                ? 'Not installed'
                : words[ts.status] ?? (ts.status === 'starting' ? 'Starting' : ts.status === 'error' ? 'Not answering' : 'Checking'),
          detail: ts.detail ?? null,
        },
        r.changed,
      );
    }

    // ---- Overall
    const counts = { ok: 0, warn: 0, alert: 0 };
    for (const it of items) counts[it.level] += 1;
    const level = counts.alert ? 'alert' : counts.warn ? 'warn' : 'ok';
    const ids = items.map((i) => `${i.id}=${i.level}`).join('|');
    if (ids !== lastIds) {
      rev += 1;
      lastIds = ids;
    }
    if (level !== overall || overallSince === null) {
      overall = level;
      overallSince = t;
    }
    const bad = items.filter((i) => i.level !== 'ok').sort((a, b) => rank(b.level) - rank(a.level));
    let summary = 'All systems normal';
    if (bad.length) {
      const parts = [];
      if (counts.alert) parts.push(`${counts.alert} alert${counts.alert > 1 ? 's' : ''}`);
      if (counts.warn) parts.push(`${counts.warn} warning${counts.warn > 1 ? 's' : ''}`);
      const more = bad.length > 2 ? ` and ${bad.length - 2} more` : '';
      summary = `${parts.join(', ')}: ${bad
        .slice(0, 2)
        .map((i) => i.message)
        .join('; ')}${more}`;
    }
    return { health: { level, summary, counts, rev, since: overallSince, items }, transitions };
  }

  /** Non-ok levels, for the state file: { id: { level, since } }. */
  function serialize() {
    const out = {};
    for (const [id, tr] of trackers) if (tr.level !== 'ok') out[id] = { level: tr.level, since: tr.since };
    return out;
  }

  /** Seed saved levels after a restart. Unknown levels are ignored. */
  function restore(saved) {
    let n = 0;
    for (const [id, v] of Object.entries(saved && typeof saved === 'object' ? saved : {})) {
      if (!LEVELS.includes(v?.level) || v.level === 'ok') continue;
      tracker(id).seed(v.level, v.since);
      n += 1;
    }
    return n;
  }

  /** Forget all state (fixture scenario switch). */
  function reset() {
    trackers.clear();
    unknownSince.clear();
    pins.clear();
    overall = 'ok';
    overallSince = null;
    lastIds = '';
    rev += 1;
  }

  return { evaluate, reset, serialize, restore, thresholds: th };
}

/** The event message for a transition: the item's message, or "<label> back to normal (...)". */
export function transitionMessage(tr) {
  if (tr.to !== 'ok') return tr.message;
  const value = isNum(tr.value) && tr.unit ? ` (${tr.unit === '°C' ? fmtTemp(tr.value) : tr.unit === '%' ? fmtPct(tr.value) : tr.unit === 'ms' ? fmtMs(tr.value) : tr.value})` : '';
  return `${tr.label} back to normal${value}`;
}
