// The event log: health state changes and a few system events, newest last inside, newest first out.
// Bounded (default 1000 events), persisted by the store, and never larger than its bound however long the
// Core runs.
//
// Event: { id, t, level, kind, rule, from, to, message }
//   level  'ok' | 'warn' | 'alert' for health changes (the new level), 'info' for system events
//   kind   'health' | 'system'
//   rule   the health item id ("cpu.temp", "disk:/") or the system event name ("core.start", "machine.boot")

const LEVELS = new Set(['ok', 'warn', 'alert', 'info']);

export function createEventLog({ max = 1000 } = {}) {
  let events = [];
  let nextId = 1;
  let dirty = false;
  const listeners = new Set();

  function add({ t, level = 'info', kind = 'system', rule = null, from = null, to = null, message }) {
    const ev = {
      id: nextId,
      t: Number.isFinite(t) ? t : Date.now(),
      level: LEVELS.has(level) ? level : 'info',
      kind,
      rule,
      from,
      to,
      message: String(message ?? '').slice(0, 300),
    };
    nextId += 1;
    events.push(ev);
    if (events.length > max) events.splice(0, events.length - max);
    dirty = true;
    for (const fn of listeners) fn(ev);
    return ev;
  }

  /** Newest first. sinceId returns only events newer than that id. */
  function list({ limit = 50, sinceId = null, level = null } = {}) {
    const n = Math.max(1, Math.min(max, Math.floor(limit) || 50));
    const out = [];
    for (let i = events.length - 1; i >= 0 && out.length < n; i -= 1) {
      const ev = events[i];
      if (sinceId !== null && ev.id <= sinceId) break;
      if (level && ev.level !== level) continue;
      out.push(ev);
    }
    return out;
  }

  /** Events with t in [from, to], oldest first (for the assistant's "what happened" answers). */
  function between(from, to = Infinity) {
    return events.filter((e) => e.t >= from && e.t <= to);
  }

  function serialize() {
    dirty = false;
    return { v: 1, nextId, events };
  }

  function restore(obj) {
    if (!obj || obj.v !== 1 || !Array.isArray(obj.events)) throw new Error('not a jarvis-core events file');
    events = obj.events
      .filter((e) => e && Number.isFinite(e.id) && Number.isFinite(e.t) && typeof e.message === 'string')
      .slice(-max)
      .map((e) => ({ id: e.id, t: e.t, level: LEVELS.has(e.level) ? e.level : 'info', kind: e.kind ?? 'system', rule: e.rule ?? null, from: e.from ?? null, to: e.to ?? null, message: e.message.slice(0, 300) }));
    nextId = Math.max(Number(obj.nextId) || 1, (events.at(-1)?.id ?? 0) + 1);
    dirty = false;
    return events.length;
  }

  function clear() {
    events = [];
    dirty = true;
  }

  return {
    add,
    list,
    between,
    serialize,
    restore,
    clear,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get size() {
      return events.length;
    },
    get dirty() {
      return dirty;
    },
    get latest() {
      return events.at(-1) ?? null;
    },
  };
}
