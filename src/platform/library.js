// The saved library: every finished hologram and blueprint, kept on this device so it reopens for
// free ("you save the diagrams"). IndexedDB store `library` of the `jarvis` database (version 2,
// created by db.js's upgrade), written through db.js's serial queue and connection.
//
//   saveLibraryItem({ kind, title, subject, spec, stats, conversationId, turnId, segmentId,
//                     parent: { model, part } | null, partName, costUsd })
//                                         -> Promise<{ id: 'lib_' + 10 base36, persisted }>
//   getLibraryItem(id)                    -> Promise<Item | null>   (spec re-validated on every read)
//   listLibraryItems({ kind, limit })     -> Promise<Row[]>          metadata only, newest first
//   findPartBlueprint(modelId, partId|null) -> Promise<Row | null>   newest blueprint of that part
//                                            (partId null: of the whole object)
//   setLibraryThumbnail(id, dataUrl)      -> Promise<boolean>        data:image/jpeg|png, ≤ 60 KB
//   deleteLibraryItem(id)                 -> Promise<boolean>
//   onLibraryChange(fn)                   -> unsubscribe; fn({ type, id, remote }) for this window's
//                                            changes and other windows' (BroadcastChannel
//                                            'jarvis-library'); type 'saved' | 'deleted' |
//                                            'thumbnail' | 'imported' | 'cleared'
//   exportLibraryItems() / importLibraryItems(data) / deleteAllLibraryItems()   (backup.js)
//
//   Item = { id, v: 1, kind: 'hologram'|'blueprint', title, subject, sheet (blueprints) | null,
//            spec (normalized), stats, createdAt, updatedAt, conversationId, turnId, segmentId,
//            parent: { model, part } | null, partName, costUsd, thumbnail: dataUrl | null }
//   Row  = the same without `spec`.
//
// Robustness, as db.js: nothing here rejects for storage problems. When IndexedDB is unavailable or
// the device is out of space, a saved item is kept in memory for this session (it still opens,
// lists and gets its thumbnail), getPersistence()/onPersistenceChange in db.js report it, and the
// next successful save writes the waiting items too. Saving is idempotent per segment (a resumed
// turn never saves twice). Deletion is final for the session: a late thumbnail never resurrects an
// item. Specs are stored normalized and re-validated on every read and import, so a damaged record
// never reaches a renderer.

import { libraryTransaction, setLibraryFallback } from './db.js';
import { normalizeHologramSpec } from '../lib/hologram-spec.js';
import { SHEET_KINDS, normalizeBlueprintSpec, summarizeBlueprint } from '../lib/blueprint-spec.js';
import { cleanLine, isPlainObject, reportWarning } from './util.js';

export const LIBRARY_CHANNEL = 'jarvis-library';
export const LIBRARY_RECORD_VERSION = 1;
/** Largest thumbnail data URL kept (characters). */
export const THUMBNAIL_MAX_CHARS = 60 * 1024;
/** Most items one backup import may bring in. */
export const IMPORT_MAX_ITEMS = 2000;
const LIST_MAX = 5000;

const ID_RE = /^lib_[a-z0-9]{6,16}$/;
const PART_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const THUMB_RE = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
const KINDS = ['hologram', 'blueprint'];
const MAX_TIME = 8.64e15;
const REF_CHARS = 200;

const memoryItems = new Map(); // id -> record kept only in memory (storage unavailable or full)
let memoryReason = null; // why: 'quota' | 'unavailable'
const deleted = new Set(); // ids deleted this session
const listeners = new Set();
let channel; // BroadcastChannel, null when unavailable (created on first use)
let askedPersist = false;

// ---------------------------------------------------------------------------------------------
// Records

/** 'lib_' + 10 base36 characters. */
export function newLibraryId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let bytes = null;
  try {
    bytes = new Uint8Array(10);
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    bytes = null;
  }
  let id = 'lib_';
  for (let i = 0; i < 10; i++) id += chars[(bytes ? bytes[i] : Math.floor(Math.random() * 256)) % 36];
  return id;
}

const text = (v, max) => cleanLine(typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '', max);
const ref = (v) => (typeof v === 'string' && v.length <= REF_CHARS ? v.replace(/[\u0000-\u001F\u007F]/g, '') : '');
const time = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_TIME ? v : null);

/** { model, part } with valid ids, or null. */
function cleanParent(v) {
  if (!isPlainObject(v)) return null;
  const model = typeof v.model === 'string' ? v.model : '';
  const part = v.part === undefined || v.part === null || v.part === '' ? null : v.part;
  if (!ID_RE.test(model) || (part !== null && (typeof part !== 'string' || !PART_RE.test(part)))) return null;
  return { model, part };
}

const partKeyOf = (parent) => (parent ? `${parent.model}/${parent.part ?? '*'}` : '');

/** A thumbnail data URL that is safe and small enough, else null. */
export function cleanThumbnail(v) {
  return typeof v === 'string' && v.length <= THUMBNAIL_MAX_CHARS && THUMB_RE.test(v) ? v : null;
}

/** The normalized spec and stats for a kind, or null when the spec cannot be shown. */
function checkedSpec(kind, spec) {
  if (kind === 'hologram') {
    const res = normalizeHologramSpec(spec);
    return res.ok ? { spec: res.spec, stats: { parts: res.stats.parts, shapes: res.stats.shapes } } : null;
  }
  if (kind === 'blueprint') {
    const res = normalizeBlueprintSpec(spec);
    return res.spec ? { spec: res.spec, stats: summarizeBlueprint(res.spec) } : null;
  }
  return null;
}

const STAT_KEYS = { hologram: ['parts', 'shapes'], blueprint: ['views', 'shapes', 'primitives', 'callouts', 'parts', 'dimensions', 'steps'] };

function cleanStats(kind, raw) {
  const out = {};
  for (const key of STAT_KEYS[kind]) out[key] = Number.isInteger(raw?.[key]) && raw[key] >= 0 && raw[key] < 1e6 ? raw[key] : 0;
  return out;
}

/**
 * Everything of a record but its spec, rebuilt from known fields (list rows read only this), or
 * null. `id` and timestamps are kept when valid.
 */
function cleanMeta(raw, { id = raw?.id, now = Date.now() } = {}) {
  if (!isPlainObject(raw) || typeof id !== 'string' || !ID_RE.test(id) || !KINDS.includes(raw.kind)) return null;
  const parent = raw.kind === 'blueprint' ? cleanParent(raw.parent) : null;
  const createdAt = time(raw.createdAt) ?? now;
  const updatedAt = Math.max(createdAt, time(raw.updatedAt) ?? createdAt);
  const cost = typeof raw.costUsd === 'number' && Number.isFinite(raw.costUsd) && raw.costUsd >= 0 && raw.costUsd < 1e6 ? raw.costUsd : 0;
  return {
    id,
    v: LIBRARY_RECORD_VERSION,
    kind: raw.kind,
    title: text(raw.title, 80) || 'Untitled',
    subject: text(raw.subject, 120),
    sheet: raw.kind === 'blueprint' ? (SHEET_KINDS.includes(raw.sheet) ? raw.sheet : 'part') : null,
    stats: cleanStats(raw.kind, raw.stats),
    createdAt,
    updatedAt,
    conversationId: ref(raw.conversationId),
    turnId: ref(raw.turnId),
    segmentId: ref(raw.segmentId),
    parent,
    partKey: partKeyOf(parent),
    partName: parent ? text(raw.partName, 40) : '',
    costUsd: Math.round(cost * 1e6) / 1e6,
    thumbnail: cleanThumbnail(raw.thumbnail),
  };
}

/**
 * A record rebuilt from known fields with its spec re-validated (saves, reads and imports), or null
 * when it cannot be shown. Title, sheet and stats follow the validated spec.
 */
export function cleanLibraryRecord(raw, opts = {}) {
  const meta = cleanMeta(raw, opts);
  if (!meta) return null;
  const checked = checkedSpec(meta.kind, raw.spec);
  if (!checked) return null;
  const { spec, stats } = checked;
  return {
    ...meta,
    title: text(raw.title, 80) || spec.title || 'Untitled',
    subject: meta.subject || (meta.kind === 'hologram' ? spec.subtitle : spec.subject) || '',
    sheet: meta.kind === 'blueprint' ? spec.sheet : null,
    spec,
    stats,
  };
}

/** The list row of a record: everything but the spec (and the internal partKey). */
function rowOf(record) {
  const { spec, partKey, ...row } = record;
  return { ...row, parent: row.parent ? { ...row.parent } : null, stats: { ...row.stats } };
}

/** A full record read from storage, re-validated (never trusted as it is). */
function fromStore(raw) {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || deleted.has(raw.id)) return null;
  return cleanLibraryRecord(raw, { id: raw.id, now: time(raw.createdAt) ?? 0 });
}

/** A list row read from storage: its metadata cleaned (the spec is checked when the item is opened). */
function rowFromStore(raw) {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || deleted.has(raw.id)) return null;
  const meta = cleanMeta(raw, { id: raw.id, now: time(raw.createdAt) ?? 0 });
  return meta ? rowOf(meta) : null;
}

// ---------------------------------------------------------------------------------------------
// Change events (this window and, over BroadcastChannel, the others)

function emit(change) {
  for (const fn of Array.from(listeners)) {
    try {
      fn({ ...change });
    } catch (err) {
      reportWarning('A library listener failed', err);
    }
  }
}

function openChannel() {
  if (channel !== undefined) return channel;
  channel = null;
  try {
    if (typeof globalThis.BroadcastChannel === 'function') {
      channel = new globalThis.BroadcastChannel(LIBRARY_CHANNEL);
      channel.onmessage = (event) => {
        const msg = event && event.data;
        if (!isPlainObject(msg) || !['saved', 'deleted', 'thumbnail', 'imported', 'cleared'].includes(msg.type)) return;
        if (msg.id !== null && (typeof msg.id !== 'string' || !ID_RE.test(msg.id))) return;
        if (msg.type === 'deleted' && msg.id) {
          deleted.add(msg.id);
          memoryItems.delete(msg.id);
        }
        emit({ type: msg.type, id: msg.id, remote: true });
      };
    }
  } catch {
    channel = null;
  }
  return channel;
}

function changed(type, id = null) {
  emit({ type, id, remote: false });
  try {
    const ch = openChannel();
    if (ch) ch.postMessage({ type, id });
  } catch {
    /* the other windows simply do not hear about it */
  }
}

/**
 * fn({ type: 'saved'|'deleted'|'thumbnail'|'imported'|'cleared', id, remote }) after every change
 * to the library, made in this window (remote false) or another one (remote true). Returns an
 * unsubscribe function.
 */
export function onLibraryChange(fn) {
  if (typeof fn !== 'function') return () => {};
  openChannel();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------------------------------------------------------------------------------------------
// Writes

function reportMemory() {
  setLibraryFallback(memoryItems.size, memoryReason);
}

function keepInMemory(record, reason) {
  memoryItems.set(record.id, record);
  memoryReason = reason === 'quota' ? 'quota' : memoryReason || 'unavailable';
  reportMemory();
}

/**
 * Runs `fn` inside an IndexedDB request callback; an exception (e.g. QuotaExceededError from put)
 * aborts the transaction and is what the transaction rejects with (as db.js does).
 */
function guarded(store, box, fn) {
  try {
    fn();
  } catch (err) {
    box.error = err;
    try {
      store.transaction.abort();
    } catch {
      /* already finished */
    }
  }
}

/** Puts records, all in one transaction. */
function putRecords(records) {
  return libraryTransaction('readwrite', (store) => {
    for (const record of records) store.put(record);
  });
}

/** Writes items that are waiting in memory, now that a write worked again. */
async function flushMemory() {
  if (!memoryItems.size) return;
  const waiting = Array.from(memoryItems.values()).filter((r) => !deleted.has(r.id));
  const res = await putRecords(waiting);
  if (!res.ok) return;
  for (const r of waiting) if (memoryItems.get(r.id) === r) memoryItems.delete(r.id);
  if (!memoryItems.size) memoryReason = null;
  reportMemory();
}

function askPersistentStorage() {
  if (askedPersist) return;
  askedPersist = true;
  try {
    const storage = globalThis.navigator && globalThis.navigator.storage;
    if (storage && typeof storage.persist === 'function') Promise.resolve(storage.persist()).catch(() => {});
  } catch {
    /* best effort */
  }
}

/** The id of an item already saved for this segment (a resumed turn saves once), or null. */
async function savedForSegment(segmentId) {
  if (!segmentId) return null;
  for (const r of memoryItems.values()) if (r.segmentId === segmentId && !deleted.has(r.id)) return r.id;
  const res = await libraryTransaction('readonly', (store, box) => {
    const req = store.index('bySegment').getAll(IDBKeyRange.only(segmentId));
    req.onsuccess = () => {
      const hit = (req.result || []).find((r) => isPlainObject(r) && typeof r.id === 'string' && !deleted.has(r.id));
      box.value = hit ? hit.id : null;
    };
  });
  return res.ok ? res.value : null;
}

/**
 * Saves a finished hologram or blueprint. The spec is validated again (the engine passes the
 * normalized one); `stats` are recomputed from it. Resolves { id, persisted }: persisted is false
 * when the item could only be kept in memory for this session. Rejects (TypeError) only for input
 * that is not a showable item.
 */
export async function saveLibraryItem(input = {}) {
  const segmentId = ref(input?.segmentId);
  const existing = await savedForSegment(segmentId);
  if (existing) return { id: existing, persisted: !memoryItems.has(existing) };
  const now = Date.now();
  const record = cleanLibraryRecord({ ...(isPlainObject(input) ? input : {}), createdAt: now, updatedAt: now, thumbnail: input?.thumbnail ?? null }, { id: newLibraryId(), now });
  if (!record) throw new TypeError('saveLibraryItem: kind must be "hologram" or "blueprint" with a spec that can be shown');
  askPersistentStorage();
  const res = await libraryTransaction('readwrite', (store, box) => {
    // A clash with an existing id (about 1 in 3.6e15) takes a fresh one.
    const probe = store.get(record.id);
    probe.onsuccess = () => guarded(store, box, () => {
      if (probe.result) record.id = newLibraryId();
      store.put(record);
    });
  });
  if (!res.ok) {
    if (res.reason === 'quota') reportWarning('Device storage is full: this saved item is kept only until the page closes.');
    keepInMemory(record, res.reason);
    changed('saved', record.id);
    return { id: record.id, persisted: false };
  }
  changed('saved', record.id);
  await flushMemory();
  return { id: record.id, persisted: true };
}

/**
 * Sets an item's thumbnail (a data:image/jpeg or data:image/png URL of at most 60 KB). Resolves
 * false for a bad URL or a missing (or deleted) item.
 */
export async function setLibraryThumbnail(id, dataUrl) {
  const thumb = cleanThumbnail(dataUrl);
  if (!thumb || typeof id !== 'string' || !ID_RE.test(id) || deleted.has(id)) return false;
  const mem = memoryItems.get(id);
  if (mem) {
    mem.thumbnail = thumb;
    mem.updatedAt = Math.max(mem.updatedAt, Date.now());
    changed('thumbnail', id);
    return true;
  }
  const res = await libraryTransaction('readwrite', (store, box) => {
    const req = store.get(id);
    req.onsuccess = () => guarded(store, box, () => {
      const record = req.result;
      if (!isPlainObject(record) || deleted.has(id)) {
        box.value = false;
        return;
      }
      store.put({ ...record, thumbnail: thumb, updatedAt: Math.max(Number(record.updatedAt) || 0, Date.now()) });
      box.value = true;
    });
  });
  if (res.ok && res.value) changed('thumbnail', id);
  return res.ok && res.value === true;
}

/** Deletes one item (for the rest of the session too). Resolves whether it existed. */
export async function deleteLibraryItem(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return false;
  const inMemory = memoryItems.delete(id);
  if (inMemory) reportMemory();
  deleted.add(id);
  const res = await libraryTransaction('readwrite', (store, box) => {
    const req = store.get(id);
    req.onsuccess = () => guarded(store, box, () => {
      box.value = !!req.result;
      if (req.result) store.delete(id);
    });
  });
  const existed = inMemory || (res.ok && res.value === true);
  if (existed) changed('deleted', id);
  return existed;
}

/** Deletes every item (resetApp). */
export async function deleteAllLibraryItems() {
  for (const id of memoryItems.keys()) deleted.add(id);
  memoryItems.clear();
  memoryReason = null;
  reportMemory();
  const res = await libraryTransaction('readwrite', (store, box) => {
    const keys = store.getAllKeys();
    keys.onsuccess = () => guarded(store, box, () => {
      for (const id of keys.result || []) if (typeof id === 'string') deleted.add(id);
      store.clear();
    });
  });
  changed('cleared', null);
  return res.ok;
}

// ---------------------------------------------------------------------------------------------
// Reads

/** The full item (spec re-validated), or null. */
export async function getLibraryItem(id) {
  if (typeof id !== 'string' || !ID_RE.test(id) || deleted.has(id)) return null;
  const mem = memoryItems.get(id);
  if (mem) return fromStore(structuredCopy(mem));
  const res = await libraryTransaction('readonly', (store, box) => {
    const req = store.get(id);
    req.onsuccess = () => {
      box.value = req.result;
    };
  });
  return res.ok ? fromStore(res.value) : null;
}

function structuredCopy(value) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch {
    /* fall through */
  }
  return JSON.parse(JSON.stringify(value));
}

const byNewest = (a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Metadata rows (no spec), newest first. `kind`: 'hologram' | 'blueprint' (default both);
 * `limit`: how many at most (default all).
 */
export async function listLibraryItems({ kind, limit } = {}) {
  const want = KINDS.includes(kind) ? kind : null;
  const max = Number.isInteger(limit) && limit > 0 ? Math.min(limit, LIST_MAX) : LIST_MAX;
  const res = await libraryTransaction('readonly', (store, box) => {
    const rows = [];
    box.value = rows;
    const req = store.index('byCreated').openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || rows.length >= max) return;
      const value = cursor.value;
      if (isPlainObject(value) && (!want || value.kind === want) && !deleted.has(value.id) && !memoryItems.has(value.id)) {
        const row = rowFromStore(value);
        if (row) rows.push(row);
      }
      cursor.continue();
    };
  });
  const rows = res.ok ? res.value : [];
  for (const r of memoryItems.values()) if (!want || r.kind === want) rows.push(rowOf(r));
  return rows.sort(byNewest).slice(0, max);
}

/**
 * The newest saved blueprint of part `partId` of the saved hologram `modelId` (partId null: of the
 * whole object), as a row, or null.
 */
export async function findPartBlueprint(modelId, partId = null) {
  const parent = cleanParent({ model: modelId, part: partId });
  if (!parent) return null;
  const key = partKeyOf(parent);
  const found = [];
  for (const r of memoryItems.values()) if (r.kind === 'blueprint' && r.partKey === key) found.push(r);
  const res = await libraryTransaction('readonly', (store, box) => {
    const req = store.index('byPart').getAll(IDBKeyRange.only(key));
    req.onsuccess = () => {
      box.value = req.result || [];
    };
  });
  if (res.ok) {
    for (const raw of res.value) {
      if (!isPlainObject(raw) || raw.kind !== 'blueprint' || memoryItems.has(raw.id)) continue;
      const meta = cleanMeta(raw, { id: raw.id, now: 0 });
      if (meta && !deleted.has(meta.id) && meta.partKey === key) found.push(meta);
    }
  }
  found.sort(byNewest);
  return found.length ? rowOf(found[0]) : null;
}

// ---------------------------------------------------------------------------------------------
// Backups (backup.js)

/** Every item, full records with thumbnails: { version: 1, items }. */
export async function exportLibraryItems() {
  const res = await libraryTransaction('readonly', (store, box) => {
    const req = store.getAll();
    req.onsuccess = () => {
      box.value = req.result || [];
    };
  });
  const items = new Map();
  for (const raw of res.ok ? res.value : []) {
    const record = fromStore(raw);
    if (record) items.set(record.id, record);
  }
  for (const r of memoryItems.values()) items.set(r.id, r);
  return {
    version: LIBRARY_RECORD_VERSION,
    items: Array.from(items.values()).sort(byNewest).map(({ partKey, ...item }) => item),
  };
}

/**
 * Restores items from a backup: { version, items } (or a bare array). Every item is vetted like an
 * imported conversation: id, kind and references checked, the spec re-validated (an item whose spec
 * cannot be shown is skipped), the thumbnail kept only when safe. Merged by id: the newer
 * updatedAt wins. Restoring lifts this session's deletion of an id. Returns how many items were
 * added or updated.
 */
export async function importLibraryItems(data) {
  const list = Array.isArray(data) ? data : isPlainObject(data) && Array.isArray(data.items) ? data.items : null;
  if (!list) return 0;
  if (isPlainObject(data) && typeof data.version === 'number' && data.version > LIBRARY_RECORD_VERSION) {
    reportWarning('Backup: the library was saved by a newer version of Jarvis and was left out');
    return 0;
  }
  const incoming = new Map();
  for (const raw of list.slice(0, IMPORT_MAX_ITEMS)) {
    const record = cleanLibraryRecord(raw, { id: raw?.id, now: Date.now() });
    if (!record) continue;
    const seen = incoming.get(record.id);
    if (!seen || record.updatedAt > seen.updatedAt) incoming.set(record.id, record);
  }
  if (!incoming.size) return 0;
  const ids = Array.from(incoming.keys());
  const current = await libraryTransaction('readonly', (store, box) => {
    const stamps = new Map();
    box.value = stamps;
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        if (isPlainObject(req.result)) stamps.set(id, Number(req.result.updatedAt) || 0);
      };
    }
  });
  const stored = current.ok ? current.value : new Map();
  const toWrite = [];
  for (const record of incoming.values()) {
    const mine = memoryItems.get(record.id);
    const localStamp = mine ? mine.updatedAt : stored.get(record.id);
    if (localStamp !== undefined && !(record.updatedAt > localStamp)) continue;
    deleted.delete(record.id);
    toWrite.push(record);
  }
  if (!toWrite.length) return 0;
  const res = await putRecords(toWrite);
  if (res.ok) {
    for (const r of toWrite) memoryItems.delete(r.id);
    if (!memoryItems.size) memoryReason = null;
    reportMemory();
  } else {
    for (const r of toWrite) memoryItems.set(r.id, r);
    memoryReason = res.reason === 'quota' ? 'quota' : memoryReason || 'unavailable';
    reportMemory();
  }
  changed('imported', null);
  return toWrite.length;
}
