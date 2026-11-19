// Safe localStorage access for the platform modules (internal; not part of the SPEC contract).
//
// Every call is wrapped in try/catch: Safari private mode, blocked site data,
// sandboxed frames and full quotas all throw. A write that cannot be persisted is
// kept in an in-memory overlay, so the app keeps working for the rest of the
// session; reads prefer that overlay because it is newer than what is on disk.
// Writes from other tabs arrive through the `storage` event, drop the stale
// overlay entry and notify watchers.

import { reportWarning } from './util.js';

const overlay = new Map(); // key -> string | null (null = removed in this session, not persisted)
const watchers = new Map(); // key -> Set<fn(newValue: string|null)>
let warned = false;
let lastWriteFailed = false;
let listening = false;

function getStore() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null; // SecurityError when site data is blocked
  }
}

function warnOnce(err) {
  lastWriteFailed = true;
  if (warned) return;
  warned = true;
  reportWarning('Browser storage is unavailable; changes will only last for this session.', err && err.name ? err.name : undefined);
}

/** Read a string value (or null). Never throws. */
export function readItem(key) {
  if (overlay.has(key)) return overlay.get(key);
  const s = getStore();
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

/** Write a string value. Returns true if it was persisted. Never throws. */
export function writeItem(key, value) {
  const str = String(value);
  const s = getStore();
  if (s) {
    try {
      s.setItem(key, str);
      overlay.delete(key);
      lastWriteFailed = false;
      return true;
    } catch (err) {
      overlay.set(key, str);
      warnOnce(err);
      return false;
    }
  }
  overlay.set(key, str);
  warnOnce();
  return false;
}

/** Remove a value. Returns true if the removal reached storage. Never throws. */
export function removeItem(key) {
  const s = getStore();
  if (s) {
    try {
      s.removeItem(key);
      overlay.delete(key);
      return true;
    } catch {
      /* fall through to the overlay tombstone */
    }
  }
  overlay.set(key, null);
  return false;
}

/**
 * Remove every key that starts with `prefix` (storage and overlay), optionally only those for
 * which `filter(key)` is true. Returns how many keys were removed. Never throws.
 */
export function removeItemsWithPrefix(prefix, filter) {
  const keys = new Set();
  const wanted = (k) => k.startsWith(prefix) && (typeof filter !== 'function' || filter(k));
  const s = getStore();
  if (s) {
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k !== null && wanted(k)) keys.add(k);
      }
    } catch {
      /* ignore */
    }
  }
  for (const k of overlay.keys()) if (wanted(k)) keys.add(k);
  for (const k of keys) removeItem(k);
  return keys.size;
}

/** False when storage is missing or the most recent write could not be persisted. */
export function isStoragePersistent() {
  return !!getStore() && !lastWriteFailed;
}

/**
 * Call fn(newValue) when another tab changes `key` (newValue is null when removed
 * or when the other tab cleared storage). Returns an unsubscribe function.
 */
export function watchItem(key, fn) {
  if (typeof fn !== 'function') return () => {};
  ensureListening();
  let set = watchers.get(key);
  if (!set) watchers.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

function ensureListening() {
  if (listening) return;
  listening = true;
  try {
    globalThis.addEventListener('storage', onStorageEvent);
  } catch {
    /* not a window (worker / tests) */
  }
}

function onStorageEvent(event) {
  let area = null;
  try {
    area = globalThis.localStorage;
  } catch {
    return;
  }
  if (!event || event.storageArea !== area) return;
  const changed = event.key === null ? Array.from(watchers.keys()) : [event.key];
  for (const key of changed) {
    overlay.delete(key); // the other tab's persisted value is newer than our unpersisted one
    const set = watchers.get(key);
    if (!set) continue;
    const value = event.key === null ? null : event.newValue;
    for (const fn of Array.from(set)) {
      try {
        fn(value);
      } catch (err) {
        reportWarning(`storage watcher for ${key} failed`, err);
      }
    }
  }
}
