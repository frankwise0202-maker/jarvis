// Facts Jarvis remembers about the owner (SPEC §5), in localStorage['jarvis.memory.v1']
// as [{ id, text, createdAt }] (oldest first).
//
// Text is normalized (control characters removed, whitespace collapsed, max 300
// characters); duplicates are detected case-insensitively; at most 100 facts are kept
// (the oldest are dropped).

import { readItem, writeItem, removeItem, watchItem } from './storage.js';
import { cleanLine, createEmitter, isPlainObject, newId, parseJson, truncate } from './util.js';

export const MEMORY_KEY = 'jarvis.memory.v1';
export const MEMORY_MAX_ITEMS = 100;
export const MEMORY_MAX_CHARS = 300;

const changes = createEmitter('memory');
let items = null; // cached, normalized list (oldest first)

/** Normalize fact text; '' when nothing usable remains. */
function normText(text) {
  if (typeof text !== 'string') return '';
  const line = cleanLine(text, 0);
  return line.length > MEMORY_MAX_CHARS ? truncate(line, MEMORY_MAX_CHARS, true) : line;
}

/** Key for exact (case-insensitive) duplicate detection. */
function dedupeKey(text) {
  return text.toLowerCase();
}

/** The key a fact is told apart by (v7.6 sync): normalized and case-insensitive; '' for no fact. */
export function memoryKey(text) {
  const clean = normText(typeof text === 'string' ? text : '');
  return clean ? dedupeKey(clean) : '';
}

/** Looser key for removal by text: also ignores punctuation, quotes and bullets. */
function looseKey(text) {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeList(raw) {
  const out = [];
  const seen = new Set();
  const ids = new Set();
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    const rawText = typeof entry === 'string' ? entry : isPlainObject(entry) ? entry.text : null;
    const text = normText(rawText);
    if (!text) continue;
    const key = dedupeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    let id = isPlainObject(entry) && typeof entry.id === 'string' && entry.id && entry.id.length <= 100 ? entry.id : '';
    if (!id || ids.has(id)) id = newId();
    ids.add(id);
    const createdAt = isPlainObject(entry) && Number.isFinite(entry.createdAt) ? entry.createdAt : 0;
    out.push({ id, text, createdAt });
  }
  // Keep the newest MEMORY_MAX_ITEMS (stable for equal timestamps).
  return out.length > MEMORY_MAX_ITEMS ? out.slice(out.length - MEMORY_MAX_ITEMS) : out;
}

function load() {
  return sanitizeList(parseJson(readItem(MEMORY_KEY), []));
}

function ensure() {
  if (!items) {
    items = load();
    watchItem(MEMORY_KEY, () => {
      items = load();
      changes.emit(listMemory());
    });
  }
  return items;
}

function commit(next) {
  items = next;
  if (next.length) writeItem(MEMORY_KEY, JSON.stringify(next));
  else removeItem(MEMORY_KEY);
  changes.emit(listMemory());
}

/** All facts, oldest first, as fresh copies: [{ id, text, createdAt }]. */
export function listMemory() {
  return ensure().map((m) => ({ ...m }));
}

/**
 * Remember a fact. Returns the stored item ({ id, text, createdAt }) — the existing one
 * when it is a duplicate — or null when the text is empty.
 */
export function addMemory(text) {
  const clean = normText(text);
  if (!clean) return null;
  const list = ensure();
  const key = dedupeKey(clean);
  const existing = list.find((m) => dedupeKey(m.text) === key);
  if (existing) return { ...existing };
  const item = { id: newId(), text: clean, createdAt: Date.now() };
  const next = list.concat(item);
  commit(next.length > MEMORY_MAX_ITEMS ? next.slice(next.length - MEMORY_MAX_ITEMS) : next);
  return { ...item };
}

/**
 * Forget a fact by id, or by text (case-insensitive). If no text matches exactly, a match
 * that ignores punctuation and quotes is tried, but only when exactly one fact matches it
 * (so a loose match can never remove several different facts). Returns true if removed.
 */
export function removeMemory(idOrText) {
  if (typeof idOrText !== 'string' || !idOrText.trim()) return false;
  const list = ensure();
  let next = list.filter((m) => m.id !== idOrText);
  if (next.length === list.length) {
    const clean = normText(idOrText);
    const key = dedupeKey(clean);
    next = list.filter((m) => dedupeKey(m.text) !== key);
    if (next.length === list.length) {
      const loose = looseKey(clean);
      const hits = loose ? list.filter((m) => looseKey(m.text) === loose) : [];
      if (hits.length === 1) next = list.filter((m) => m !== hits[0]);
    }
  }
  if (next.length === list.length) return false;
  commit(next);
  return true;
}

/** Forget everything. */
export function clearMemory() {
  const had = ensure().length > 0;
  items = [];
  removeItem(MEMORY_KEY);
  if (had) changes.emit([]);
}

/** fn(list) after every change (including other tabs). Returns unsubscribe. */
export function onMemoryChange(fn) {
  ensure();
  return changes.on(fn);
}

/**
 * Merge facts from a backup: [{ text, createdAt?, id? } | string]. Duplicates
 * (case-insensitive) are skipped, the result is ordered by createdAt and capped at
 * MEMORY_MAX_ITEMS. Returns the number of facts added.
 */
export function mergeMemory(incoming) {
  const list = ensure();
  const add = sanitizeList(incoming);
  const seen = new Set(list.map((m) => dedupeKey(m.text)));
  const ids = new Set(list.map((m) => m.id));
  const fresh = [];
  for (const m of add) {
    const key = dedupeKey(m.text);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push({ ...m, id: ids.has(m.id) ? newId() : m.id });
  }
  if (!fresh.length) return 0;
  const merged = list
    .concat(fresh)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.createdAt - b.m.createdAt || a.i - b.i)
    .map((x) => x.m);
  const kept = merged.length > MEMORY_MAX_ITEMS ? merged.slice(merged.length - MEMORY_MAX_ITEMS) : merged;
  const keptFresh = fresh.filter((m) => kept.includes(m)).length;
  commit(kept);
  return keptFresh;
}
