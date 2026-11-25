// Watchers: "tell me when the LG 27GP850 drops under $300". Each one is checked every 6, 12 or 24 hours
// (with a little jitter) by one small Claude call with web search that answers { met, summary, sources };
// when it is met the owner is notified and the watcher stops. Kept in brain/watchers-v1.json (600).
//
// Watcher: { id: "w_…", what, every: "6h" | "12h" | "24h", status: watching | met | paused | blocked,
//            createdAt, lastCheckAt, nextCheckAt, lastResult: { met, summary, sources } | null, costUsd }
//   paused   no key on the home base (or the SDK is missing): checks resume when it is back
//   blocked  a spending cap was reached at check time: checked again at the next time

import { newId, iso, fromIso, oneLine, usd } from './util.mjs';
import { EVERY_MS, jittered } from './schedule.mjs';

export const WATCHERS_MAX = 20;
export const WHAT_MAX = 300;
/** The first check of a new watcher runs this soon. */
export const FIRST_CHECK_MS = 30_000;

export function publicWatcher(w) {
  return {
    id: w.id,
    what: w.what,
    every: w.every,
    status: w.status,
    createdAt: w.createdAt,
    lastCheckAt: w.lastCheckAt ?? null,
    nextCheckAt: w.status === 'met' ? null : w.nextCheckAt ?? null,
    lastResult: w.lastResult ?? null,
    costUsd: usd(w.costUsd ?? 0),
    checks: w.checks ?? 0,
  };
}

export function createWatchers({ file, now, rand = Math.random, log = () => {}, onChange = () => {}, enqueueCheck, isCheckPending }) {
  let list = [];
  let saveTimer = null;
  const loaded = file.load();
  if (loaded?.v === 1 && Array.isArray(loaded.watchers)) {
    for (const w of loaded.watchers) {
      if (!w || typeof w.id !== 'string' || !/^w_[a-z0-9]{6,20}$/.test(w.id) || typeof w.what !== 'string' || !EVERY_MS[w.every]) continue;
      list.push({ ...w, status: ['watching', 'met', 'paused', 'blocked'].includes(w.status) ? w.status : 'watching' });
    }
  }

  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      file.save({ v: 1, watchers: list });
    }, 200);
    saveTimer.unref?.();
  }

  function changed(w) {
    save();
    try {
      onChange(publicWatcher(w));
    } catch (err) {
      log(`watcher listener failed: ${err?.message ?? err}`);
    }
  }

  const get = (id) => list.find((w) => w.id === id) ?? null;
  const nextAt = (w) => iso(now() + jittered(EVERY_MS[w.every], rand));

  function create({ what, every }) {
    if (list.length >= WATCHERS_MAX) {
      const e = new Error(`you have ${WATCHERS_MAX} watchers already; remove one first`);
      e.code = 'too_many_watchers';
      throw e;
    }
    const w = {
      id: newId('w'),
      what: oneLine(what, WHAT_MAX),
      every,
      status: 'watching',
      createdAt: iso(now()),
      lastCheckAt: null,
      nextCheckAt: iso(now() + FIRST_CHECK_MS),
      lastResult: null,
      costUsd: 0,
      checks: 0,
    };
    list.push(w);
    changed(w);
    return w;
  }

  function remove(id) {
    const w = get(id);
    if (!w) return false;
    list = list.filter((x) => x !== w);
    save();
    return true;
  }

  /** Queue the checks that are due. Returns how many were queued. */
  function tick() {
    let n = 0;
    const t = now();
    for (const w of list) {
      if (w.status === 'met') continue;
      const due = fromIso(w.nextCheckAt);
      if (due !== null && due > t) continue;
      if (isCheckPending(w.id)) continue;
      if (enqueueCheck(w)) n += 1;
      // Even if it could not be queued (a full queue), try again later instead of every tick.
      if (!isCheckPending(w.id)) {
        w.nextCheckAt = iso(t + 15 * 60_000);
        save();
      }
    }
    return n;
  }

  /** A finished check: met stops the watcher (true is returned once, for the notification). */
  function recordResult(id, { met, summary, sources, costUsd = 0 }) {
    const w = get(id);
    if (!w) return { watcher: null, newlyMet: false };
    const wasMet = w.status === 'met';
    w.lastCheckAt = iso(now());
    w.checks = (w.checks ?? 0) + 1;
    w.costUsd = (w.costUsd ?? 0) + (Number.isFinite(costUsd) ? costUsd : 0);
    w.lastResult = { met: met === true, summary: oneLine(summary ?? '', 300), sources: Array.isArray(sources) ? sources.slice(0, 5) : [] };
    if (met === true) {
      w.status = 'met';
      w.nextCheckAt = null;
    } else {
      w.status = 'watching';
      w.nextCheckAt = nextAt(w);
    }
    changed(w);
    return { watcher: w, newlyMet: met === true && !wasMet };
  }

  /** A check that could not run: paused (no key / SDK) or blocked (a cap), or a failed call. */
  function recordSkip(id, { status = 'watching', costUsd = 0, note = null } = {}) {
    const w = get(id);
    if (!w) return null;
    w.costUsd = (w.costUsd ?? 0) + (Number.isFinite(costUsd) ? costUsd : 0);
    if (w.status !== 'met') {
      w.status = status;
      w.nextCheckAt = nextAt(w);
    }
    if (note) w.lastNote = oneLine(note, 200);
    changed(w);
    return w;
  }

  /** A spending cap cleared: blocked watchers go back to watching (their next check time stays). */
  function unblock() {
    for (const w of list) {
      if (w.status === 'blocked') {
        w.status = 'watching';
        changed(w);
      }
    }
  }

  /** The key came back: paused watchers are due again now. */
  function resume() {
    for (const w of list) {
      if (w.status === 'paused') {
        w.status = 'watching';
        w.nextCheckAt = iso(now() + FIRST_CHECK_MS);
        changed(w);
      }
    }
  }

  return {
    create,
    remove,
    get,
    tick,
    recordResult,
    recordSkip,
    resume,
    unblock,
    list: () => list.slice(),
    activeCount: () => list.filter((w) => w.status !== 'met').length,
    flushSync() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      try {
        file.saveSync({ v: 1, watchers: list });
      } catch (err) {
        log(`saving watchers failed: ${err?.message ?? err}`);
      }
    },
  };
}
