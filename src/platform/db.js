// Conversation history in IndexedDB (SPEC §5, §6).
//
// Database `jarvis` (version 1) with two object stores, both keyPath 'id':
//   conversations  full Conversation objects (structured clones of what the engine passes in)
//   meta           one small row per conversation for the history list:
//                  { id, title, createdAt, updatedAt, preview, turnCount }
//                  preview = last user message (one line, ≤ 120 chars); turnCount = turns.length
// A save writes both rows in one transaction, so the list never disagrees with the data.
//
// Robustness rules:
//   - Every operation goes through one serial queue: writes never interleave (per id or at all),
//     and a read issued after a save sees that save. Queued saves of the same conversation are
//     coalesced (the newest object wins), so a fast-streaming turn never piles up writes.
//   - Nothing here throws or rejects for storage problems (private mode, quota, a lost
//     connection, a blocked upgrade). Problems are logged once; affected conversations are kept
//     in memory for this session, and isPersistent() turns false. getPersistence() says why
//     ({ persistent, reason: null | 'quota' | 'unavailable' }) and onPersistenceChange(fn)
//     reports every change, so the UI can tell the owner (e.g. the device is out of storage).
//   - Safari can drop the IndexedDB connection while the app is in the background; a failed
//     transaction on a closed connection is retried once on a fresh connection.
//   - Deletion is final for this session: after deleteConversation(id) (or
//     deleteAllConversations()), later saves of that id are ignored, so a turn that is still
//     finishing in the background cannot resurrect a conversation the owner deleted.
//     (Start a new conversation in the UI after deleting the open one.) Restoring a backup
//     (restoreConversation, used by backup.js) lifts this.

import { cleanLine, isPlainObject, reportWarning, truncate } from './util.js';

export const DB_NAME = 'jarvis';
export const DB_VERSION = 1;
const STORE = 'conversations';
const META = 'meta';
const OPEN_TIMEOUT_MS = 6000;
const PREVIEW_CHARS = 120;

let dbPromise = null; // Promise<IDBDatabase | null>
let openFailed = false; // IndexedDB unusable for this session (missing, blocked, timed out)
let warnedOpen = false;
let warnedWrite = false;
const memory = new Map(); // id -> { conv, meta }: conversations not (yet) on disk
const deleted = new Set(); // ids deleted this session (see header)
const queuedSaves = new Map(); // id -> { conv, promise } for saves waiting in the queue
let queue = Promise.resolve();
const persistenceListeners = new Set();
let lastWriteProblem = null; // why the latest failed save fell back to memory: 'quota' | 'unavailable'
let reported = { persistent: true, reason: null }; // the state listeners last heard

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

/** History rows, newest `updatedAt` first: [{ id, title, createdAt, updatedAt, preview, turnCount }]. */
export function listConversations() {
  return enqueue(async () => {
    const rows = new Map();
    const res = await withDb((db) => readAll(db, META), 'list conversations');
    if (res.ok) {
      for (const raw of res.value) {
        const row = cleanMeta(raw);
        if (row && !deleted.has(row.id)) rows.set(row.id, row);
      }
    }
    for (const [id, entry] of memory) rows.set(id, { ...entry.meta });
    return Array.from(rows.values()).sort(byNewest);
  }, []);
}

/** The full conversation (a fresh copy), or null. */
export function getConversation(id) {
  if (typeof id !== 'string' || !id) return Promise.resolve(null);
  return enqueue(async () => {
    if (deleted.has(id)) return null;
    const mem = memory.get(id);
    if (mem) return snapshot(mem.conv);
    const res = await withDb((db) => readOne(db, STORE, id), 'load a conversation');
    return res.ok && isPlainObject(res.value) && res.value.id === id ? res.value : null;
  }, null);
}

/**
 * Save a conversation (structured clone) and its history row. Resolves true when it reached
 * IndexedDB, false when it is only kept in memory (or was ignored). Never rejects.
 */
export function saveConversation(conv) {
  if (!isPlainObject(conv) || typeof conv.id !== 'string' || !conv.id) {
    reportWarning('saveConversation ignored a value without a string id');
    return Promise.resolve(false);
  }
  if (deleted.has(conv.id)) return Promise.resolve(false);
  return queueSave(conv);
}

/** Delete one conversation (and its history row). */
export function deleteConversation(id) {
  if (typeof id !== 'string' || !id) return Promise.resolve();
  deleted.add(id);
  memory.delete(id);
  notifyPersistence();
  return enqueue(async () => {
    await withDb((db) => write(db, (stores) => {
      stores[STORE].delete(id);
      stores[META].delete(id);
    }), 'delete a conversation');
  }, undefined);
}

/** Delete every conversation. */
export function deleteAllConversations() {
  for (const id of memory.keys()) deleted.add(id);
  for (const id of queuedSaves.keys()) deleted.add(id);
  memory.clear();
  notifyPersistence();
  return enqueue(async () => {
    const keys = await withDb((db) => readAllKeys(db, META), 'list conversations');
    if (keys.ok) for (const id of keys.value) if (typeof id === 'string') deleted.add(id);
    await withDb((db) => write(db, (stores) => {
      stores[STORE].clear();
      stores[META].clear();
    }), 'delete conversations');
  }, undefined);
}

/**
 * False when IndexedDB is unavailable (private mode, blocked) or a save could not reach it,
 * i.e. some history only lives in memory. Accurate after the first awaited db call.
 */
export function isPersistent() {
  return !openFailed && hasIndexedDB() && memory.size === 0;
}

/**
 * Whether history is reaching the device's storage, and if not why:
 * { persistent: true, reason: null } | { persistent: false, reason: 'quota' | 'unavailable' }.
 * 'quota': the device is out of storage space; 'unavailable': IndexedDB is blocked, missing (e.g.
 * private browsing) or failing. Same facts as isPersistent(); accurate after the first db call.
 */
export function getPersistence() {
  if (openFailed || !hasIndexedDB()) return { persistent: false, reason: 'unavailable' };
  if (memory.size > 0) return { persistent: false, reason: lastWriteProblem || 'unavailable' };
  return { persistent: true, reason: null };
}

/**
 * fn({ persistent, reason }) whenever getPersistence() changes (saving stopped, or works again
 * after space was freed). Not called on subscribe: read getPersistence() for the current state.
 * Returns an unsubscribe function.
 */
export function onPersistenceChange(fn) {
  if (typeof fn !== 'function') return () => {};
  persistenceListeners.add(fn);
  return () => {
    persistenceListeners.delete(fn);
  };
}

/**
 * Save a conversation even if it was deleted earlier in this session (backup restore).
 * Same result as saveConversation().
 */
export function restoreConversation(conv) {
  if (!isPlainObject(conv) || typeof conv.id !== 'string' || !conv.id) return Promise.resolve(false);
  deleted.delete(conv.id);
  return queueSave(conv);
}

/** History row for a conversation (exported for tests and backup). */
export function conversationMeta(conv) {
  const turns = Array.isArray(conv.turns) ? conv.turns : [];
  let lastUser = '';
  let firstUser = '';
  for (const t of turns) {
    if (!isPlainObject(t) || t.role !== 'user') continue;
    let line = typeof t.text === 'string' ? t.text : '';
    // Attachment-only messages have no text: describe the files instead so the
    // history row isn't blank ("Shared a photo: kitchen.jpg").
    if (!line.trim() && Array.isArray(t.attachments) && t.attachments.length) {
      const names = t.attachments.map((a) => (isPlainObject(a) && typeof a.name === 'string' ? a.name : '')).filter(Boolean);
      const allImages = t.attachments.every((a) => isPlainObject(a) && a.kind === 'image');
      const what = t.attachments.length === 1 ? (allImages ? 'a photo' : 'a file') : `${t.attachments.length} ${allImages ? 'photos' : 'files'}`;
      line = `Shared ${what}${names.length ? `: ${names.join(', ')}` : ''}`;
    }
    if (line.trim()) {
      if (!firstUser) firstUser = line;
      lastUser = line;
    }
  }
  const created = finite(conv.createdAt) ?? finite(conv.updatedAt) ?? Date.now();
  const updated = finite(conv.updatedAt) ?? created;
  const title = cleanLine(typeof conv.title === 'string' ? conv.title : '', 0) || cleanLine(firstUser, 0);
  return {
    id: conv.id,
    title: truncate(title, PREVIEW_CHARS, true),
    createdAt: created,
    updatedAt: updated,
    preview: truncate(cleanLine(lastUser, 0), PREVIEW_CHARS, true),
    turnCount: turns.length,
  };
}

// ---------------------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------------------

function enqueue(task, fallback) {
  const run = queue.then(task).catch((err) => {
    reportWarning('Conversation storage error', err);
    return fallback;
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function queueSave(conv) {
  const id = conv.id;
  const waiting = queuedSaves.get(id);
  if (waiting) {
    waiting.conv = conv; // coalesce: the queued write will store the newest object
    return waiting.promise;
  }
  const entry = { conv, promise: null };
  queuedSaves.set(id, entry);
  entry.promise = enqueue(async () => {
    if (queuedSaves.get(id) === entry) queuedSaves.delete(id);
    if (deleted.has(id)) return false;
    return writeConversation(entry.conv);
  }, false);
  return entry.promise;
}

async function writeConversation(conv) {
  let meta;
  try {
    meta = conversationMeta(conv);
  } catch (err) {
    reportWarning('Could not index a conversation', err);
    return false;
  }
  try {
    const res = await withDb((db) => write(db, (stores) => {
      putClone(stores[STORE], conv);
      stores[META].put(meta);
    }), null);
    if (res.ok) {
      memory.delete(conv.id);
      notifyPersistence();
      return true;
    }
  } catch (err) {
    const full = !!err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message)));
    lastWriteProblem = full ? 'quota' : 'unavailable';
    if (!warnedWrite) {
      warnedWrite = true;
      reportWarning(
        full
          ? 'Device storage is full: new conversation history is kept only until this page closes.'
          : 'Could not save conversation history; it is kept only until this page closes.',
        err && err.name,
      );
    }
  }
  memory.set(conv.id, { conv: snapshot(conv), meta });
  notifyPersistence();
  return false;
}

/** Tell listeners when getPersistence() changed since they last heard. Never throws. */
function notifyPersistence() {
  const next = getPersistence();
  if (next.persistent === reported.persistent && next.reason === reported.reason) return;
  reported = next;
  for (const fn of Array.from(persistenceListeners)) {
    try {
      fn({ ...next });
    } catch (err) {
      reportWarning('A persistence listener failed', err);
    }
  }
}

/** put() a structured clone; values that cannot be cloned (functions…) fall back to JSON. */
function putClone(store, conv) {
  try {
    store.put(conv);
  } catch (err) {
    if (err && err.name === 'DataCloneError') store.put(JSON.parse(JSON.stringify(conv)));
    else throw err;
  }
}

/** A detached copy for the in-memory store (structured clone, else JSON, else as-is). */
function snapshot(value) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------------------
// IndexedDB plumbing
// ---------------------------------------------------------------------------------------

function hasIndexedDB() {
  try {
    return !!globalThis.indexedDB;
  } catch {
    return false; // SecurityError when storage is blocked
  }
}

function openDb() {
  if (dbPromise) return dbPromise;
  if (openFailed) return Promise.resolve(null);
  dbPromise = new Promise((resolve) => {
    let idb = null;
    try {
      idb = globalThis.indexedDB || null;
    } catch {
      idb = null;
    }
    if (!idb) return resolve(giveUp('IndexedDB is not available'));
    let settled = false;
    const finish = (db, why) => {
      if (settled) {
        if (db) db.close(); // opened after we gave up: don't hold a connection we won't use
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (db) {
        adopt(db);
        resolve(db);
      } else resolve(giveUp(why));
    };
    const timer = setTimeout(() => finish(null, 'opening IndexedDB timed out'), OPEN_TIMEOUT_MS);
    let req;
    try {
      req = idb.open(DB_NAME, DB_VERSION);
    } catch (err) {
      return finish(null, err);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE) && db.objectStoreNames.contains(META)) finish(db);
      else {
        db.close();
        finish(null, 'IndexedDB is missing its object stores');
      }
    };
    req.onerror = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      const err = req.error;
      if (err && err.name === 'VersionError') {
        // A newer app version upgraded the database; use it as-is if our stores are there.
        openExisting(idb).then((db) => finish(db, err));
      } else finish(null, err);
    };
    // onblocked: another tab holds an older version open; the timeout covers a stuck upgrade.
  });
  return dbPromise;
}

function openExisting(idb) {
  return new Promise((resolve) => {
    try {
      const req = idb.open(DB_NAME);
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains(STORE) && db.objectStoreNames.contains(META)) resolve(db);
        else {
          db.close();
          resolve(null);
        }
      };
      req.onerror = (event) => {
        if (event && event.preventDefault) event.preventDefault();
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

function giveUp(why) {
  openFailed = true;
  dbPromise = null;
  if (!warnedOpen) {
    warnedOpen = true;
    reportWarning('Conversation history cannot be saved on this device (private browsing or blocked storage); it lasts until this page closes.', why && why.name ? why.name : why);
  }
  notifyPersistence();
  return null;
}

function adopt(db) {
  const forget = () => {
    if (dbPromise) dbPromise = null;
  };
  db.onversionchange = () => {
    // Another tab is upgrading or deleting the database: step aside.
    try {
      db.close();
    } catch {
      /* ignore */
    }
    forget();
  };
  db.onclose = forget; // closed by the browser (e.g. Safari dropped the connection)
}

function isConnectionError(err) {
  if (!err) return false;
  if (err.name === 'InvalidStateError' || err.name === 'UnknownError') return true;
  return /connection|closing|closed/i.test(String(err.message || ''));
}

/**
 * Run `op(db)` with an open database. Resolves { ok: true, value } or { ok: false } when
 * IndexedDB is unavailable. Retries once on a fresh connection if the old one was lost.
 * With `label`, other errors are logged and reported as { ok: false }; without it they throw.
 */
async function withDb(op, label) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const db = await openDb();
    if (!db) return { ok: false };
    try {
      return { ok: true, value: await op(db) };
    } catch (err) {
      if (attempt === 0 && isConnectionError(err)) {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        dbPromise = null;
        continue;
      }
      if (label === null) throw err;
      reportWarning(`Could not ${label}`, err && err.name ? err.name : err);
      return { ok: false };
    }
  }
  return { ok: false };
}

function transaction(db, names, mode, body) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(names, mode);
    } catch (err) {
      reject(err);
      return;
    }
    const box = { value: undefined };
    tx.oncomplete = () => resolve(box.value);
    tx.onabort = () => reject(tx.error || new DOMException('Transaction aborted', 'AbortError'));
    tx.onerror = () => {
      /* onabort follows and rejects */
    };
    try {
      const stores = {};
      for (const name of names) stores[name] = tx.objectStore(name);
      body(stores, box);
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      reject(err);
    }
  });
}

function write(db, body) {
  return transaction(db, [STORE, META], 'readwrite', (stores) => body(stores));
}

function readOne(db, name, key) {
  return transaction(db, [name], 'readonly', (stores, box) => {
    const req = stores[name].get(key);
    req.onsuccess = () => {
      box.value = req.result;
    };
  });
}

function readAll(db, name) {
  return transaction(db, [name], 'readonly', (stores, box) => {
    const req = stores[name].getAll();
    req.onsuccess = () => {
      box.value = Array.isArray(req.result) ? req.result : [];
    };
  });
}

function readAllKeys(db, name) {
  return transaction(db, [name], 'readonly', (stores, box) => {
    const req = stores[name].getAllKeys();
    req.onsuccess = () => {
      box.value = Array.isArray(req.result) ? req.result : [];
    };
  });
}

// ---------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function cleanMeta(raw) {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const createdAt = finite(raw.createdAt) ?? 0;
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '',
    createdAt,
    updatedAt: finite(raw.updatedAt) ?? createdAt,
    preview: typeof raw.preview === 'string' ? raw.preview : '',
    turnCount: Number.isInteger(raw.turnCount) && raw.turnCount >= 0 ? raw.turnCount : 0,
  };
}

function byNewest(a, b) {
  return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
