// Conversation history in IndexedDB (SPEC §5, §6).
//
// Database `jarvis` (version 2) with three object stores, all keyPath 'id':
//   conversations  full Conversation objects (structured clones of what the engine passes in)
//   meta           one small row per conversation for the history list:
//                  { id, title, createdAt, updatedAt, preview, turnCount }
//                  preview = last user message (one line, ≤ 120 chars); turnCount = turns.length
//   library        saved holograms and blueprints (version 2; see library.js, which owns its
//                  records and reaches the store through libraryTransaction() below), with
//                  indexes byCreated (createdAt), byPart (partKey) and bySegment (segmentId)
// A save writes both rows in one transaction, so the list never disagrees with the data.
// The version 1 -> 2 upgrade only adds the library store: every conversation stays untouched. An
// older app version (still cached) opening the version 2 database gets a VersionError and uses it
// as it is (openExisting); it simply ignores the library.
//
// The API history (conversation.apiMessages: append-only, and it carries every photo and PDF as
// base64) is kept in its own record of the conversations store, keyed [id, 'api'], and rewritten
// only when it changed; the conversation record itself (turns, missions, pending...) holds
// `apiSplit: { count, rev }` instead. Saves during a run (about one a second) then copy kilobytes,
// not the whole multi-megabyte history. Both records (and the history row) are written in ONE
// transaction, so a crash can never leave them out of step. getConversation() reassembles the
// conversation (callers never see apiSplit); a record stored whole by an earlier version is read
// as it is and split on its next save. No schema change: the database stays at version 1.
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
//   - Two windows on one conversation: every stored conversation record carries `rev`, raised by
//     each save. A window remembers the rev it last read or wrote; a save over a NEWER stored rev
//     (another window saved meanwhile) is refused - saveConversation() resolves false and
//     onConversationConflict listeners hear { id } - instead of silently dropping the other
//     window's turns. The check and the write happen in one transaction. Backup restores
//     (restoreConversation) always win. Each save is also announced to the other windows over
//     BroadcastChannel('jarvis-saves'); onRemoteSave(fn) hears them as { id, updatedAt, rev }.
//     (Runs are announced by the app on its own channel, 'jarvis-runs'.)
//   - Deletion is final for this session: after deleteConversation(id) (or
//     deleteAllConversations()), later saves of that id are ignored, so a turn that is still
//     finishing in the background cannot resurrect a conversation the owner deleted.
//     (Start a new conversation in the UI after deleting the open one.) Restoring a backup
//     (restoreConversation, used by backup.js) lifts this.

import { cleanLine, isPlainObject, newId, reportWarning, truncate } from './util.js';

export const DB_NAME = 'jarvis';
export const DB_VERSION = 2;
const STORE = 'conversations';
const META = 'meta';
/** The saved library's store (version 2). Internal: library.js owns its records. */
export const LIBRARY_STORE = 'library';
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
// What this page last wrote of each conversation's API history: { count, tail, rev }, where tail
// is the last message object. The history is append-only (only trailing messages are ever
// removed), so an unchanged count and last message mean an unchanged history.
const apiWritten = new Map();
const historyKey = (id) => [id, 'api'];
const knownRev = new Map(); // id -> the stored rev this window last read or wrote
const conflictListeners = new Set();
const remoteListeners = new Set();
let channel; // BroadcastChannel('jarvis-saves'), null when unavailable (created on first use)
const persistenceListeners = new Set();
let lastWriteProblem = null; // why the latest failed save fell back to memory: 'quota' | 'unavailable'
// Saved library items library.js could only keep in memory, and why (they count as not persistent).
let libraryFallback = { count: 0, reason: null };
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

/**
 * The full conversation (a fresh copy), or null. The copy becomes this window's baseline for the
 * two-window check (see the header); `{ track: false }` reads without that (an export, a
 * comparison), so a copy this window still has open keeps its own baseline.
 */
export function getConversation(id, { track = true } = {}) {
  if (typeof id !== 'string' || !id) return Promise.resolve(null);
  return enqueue(async () => {
    if (deleted.has(id)) return null;
    const mem = memory.get(id);
    if (mem) return snapshot(mem.conv);
    const res = await withDb((db) => readRecords(db, id), 'load a conversation');
    return res.ok ? assemble(id, res.value, track !== false) : null;
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
  apiWritten.delete(id);
  knownRev.delete(id);
  notifyPersistence();
  return enqueue(async () => {
    await withDb((db) => write(db, (stores) => {
      stores[STORE].delete(id);
      stores[STORE].delete(historyKey(id));
      stores[META].delete(id);
    }), 'delete a conversation');
  }, undefined);
}

/** Delete every conversation. */
export function deleteAllConversations() {
  for (const id of memory.keys()) deleted.add(id);
  for (const id of queuedSaves.keys()) deleted.add(id);
  memory.clear();
  apiWritten.clear();
  knownRev.clear();
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
 * i.e. some history (or a saved library item) only lives in memory. Accurate after the first
 * awaited db call.
 */
export function isPersistent() {
  return !openFailed && hasIndexedDB() && memory.size === 0 && libraryFallback.count === 0;
}

/**
 * Whether history and the saved library are reaching the device's storage, and if not why:
 * { persistent: true, reason: null } | { persistent: false, reason: 'quota' | 'unavailable' }.
 * 'quota': the device is out of storage space; 'unavailable': IndexedDB is blocked, missing (e.g.
 * private browsing) or failing. Same facts as isPersistent(); accurate after the first db call.
 */
export function getPersistence() {
  if (openFailed || !hasIndexedDB()) return { persistent: false, reason: 'unavailable' };
  const reasons = [];
  if (memory.size > 0) reasons.push(lastWriteProblem || 'unavailable');
  if (libraryFallback.count > 0) reasons.push(libraryFallback.reason || 'unavailable');
  if (reasons.length) return { persistent: false, reason: reasons.includes('quota') ? 'quota' : 'unavailable' };
  return { persistent: true, reason: null };
}

/**
 * Internal (library.js): how many saved library items are kept only in memory, and why
 * ('quota' | 'unavailable'); 0 when all reached the disk. Feeds getPersistence() and its listeners,
 * so the app's "storage is full" banner covers the library too.
 */
export function setLibraryFallback(count, reason) {
  const n = Number.isInteger(count) && count > 0 ? count : 0;
  libraryFallback = { count: n, reason: n ? (reason === 'quota' ? 'quota' : 'unavailable') : null };
  notifyPersistence();
}

/**
 * Internal (library.js): runs `body(store, box)` in ONE transaction on the library store, on the
 * same serial queue and connection as the conversations (so writes never interleave), retrying once
 * on a lost connection. Set box.value to resolve with it. Never rejects:
 * { ok: true, value } | { ok: false, reason: 'quota' | 'unavailable', error? }.
 */
export function libraryTransaction(mode, body) {
  const unavailable = { ok: false, reason: 'unavailable' };
  return enqueue(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const db = await openDb();
      if (!db || !db.objectStoreNames.contains(LIBRARY_STORE)) return unavailable;
      try {
        const value = await transaction(db, [LIBRARY_STORE], mode, (stores, box) => body(stores[LIBRARY_STORE], box));
        return { ok: true, value };
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
        return { ok: false, reason: isQuotaError(err) ? 'quota' : 'unavailable', error: err };
      }
    }
    return unavailable;
  }, unavailable);
}

function isQuotaError(err) {
  return !!err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message || '')));
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
 * fn({ id }) when a save was refused because another window saved a newer version of that
 * conversation since this window loaded it: reload it with getConversation() before continuing.
 * Returns an unsubscribe function.
 */
export function onConversationConflict(fn) {
  if (typeof fn !== 'function') return () => {};
  conflictListeners.add(fn);
  return () => {
    conflictListeners.delete(fn);
  };
}

/**
 * fn({ id, updatedAt, rev }) after each save made by ANOTHER window of Jarvis (never this one's).
 * Returns an unsubscribe function.
 */
export function onRemoteSave(fn) {
  if (typeof fn !== 'function') return () => {};
  openChannel();
  remoteListeners.add(fn);
  return () => {
    remoteListeners.delete(fn);
  };
}

/**
 * Save a conversation even if it was deleted earlier in this session (backup restore).
 * Same result as saveConversation().
 */
export function restoreConversation(conv) {
  if (!isPlainObject(conv) || typeof conv.id !== 'string' || !conv.id) return Promise.resolve(false);
  deleted.delete(conv.id);
  return queueSave(conv, { force: true });
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

function queueSave(conv, { force = false } = {}) {
  const id = conv.id;
  const waiting = queuedSaves.get(id);
  if (waiting) {
    waiting.conv = conv; // coalesce: the queued write will store the newest object
    waiting.force = waiting.force || force;
    return waiting.promise;
  }
  const entry = { conv, force, promise: null };
  queuedSaves.set(id, entry);
  entry.promise = enqueue(async () => {
    if (queuedSaves.get(id) === entry) queuedSaves.delete(id);
    if (deleted.has(id)) return false;
    return writeConversation(entry.conv, entry.force);
  }, false);
  return entry.promise;
}

async function writeConversation(conv, force = false) {
  let meta;
  try {
    meta = conversationMeta(conv);
  } catch (err) {
    reportWarning('Could not index a conversation', err);
    return false;
  }
  const base = knownRev.get(conv.id) ?? 0;
  try {
    const res = await withDb((db) => write(db, (stores, box) => {
      // Check and write in one transaction: no other window can save in between.
      const current = stores[STORE].get(conv.id);
      current.onsuccess = () => {
        const stored = current.result;
        const storedRev = isPlainObject(stored) && Number.isInteger(stored.rev) && stored.rev > 0 ? stored.rev : 0;
        if (!force && storedRev > base) {
          box.value = { conflict: true };
          return; // another window saved a newer version: write nothing
        }
        try {
          // Split right before put() (which clones synchronously): the conversation record (with its
          // `pending` checkpoint) and the API history are then taken at ONE instant. The engine
          // changes them together in one synchronous step, so they always match; a split taken
          // before the transaction could pair an old checkpoint with a newer history (Resume would
          // then answer a tool round twice).
          const parts = splitForStorage(conv, apiWritten.get(conv.id));
          parts.main.rev = storedRev + 1;
          putClone(stores[STORE], parts.main);
          if (parts.history) putClone(stores[STORE], parts.history);
          stores[META].put(meta);
          box.value = { rev: parts.main.rev, mark: parts.mark };
        } catch (err) {
          box.error = err;
          stores[STORE].transaction.abort();
        }
      };
    }), null);
    if (res.ok && res.value && res.value.conflict) {
      reportWarning('Another window saved a newer version of this conversation; this save was skipped', conv.id);
      emitTo(conflictListeners, { id: conv.id }, 'A conflict listener failed');
      return false;
    }
    if (res.ok) {
      // A restore (force) replaced what this window may still hold open: leave its known rev
      // behind, so saving such a stale copy is refused (and reported) rather than undoing it.
      if (!force) knownRev.set(conv.id, res.value.rev);
      apiWritten.set(conv.id, res.value.mark);
      memory.delete(conv.id);
      notifyPersistence();
      post({ id: conv.id, updatedAt: finite(conv.updatedAt) ?? 0, rev: res.value.rev });
      return true;
    }
  } catch (err) {
    const full = isQuotaError(err);
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
  apiWritten.delete(conv.id); // unsure what reached the disk: write the history again next time
  memory.set(conv.id, { conv: snapshot(conv), meta });
  notifyPersistence();
  return false;
}

/**
 * The records a save writes: the conversation without its API history (plus apiSplit) and, when
 * the history changed since this page last wrote it, the history record. `mark` is what to
 * remember once the write succeeded.
 */
function splitForStorage(conv, last) {
  const messages = Array.isArray(conv.apiMessages) ? conv.apiMessages : [];
  const tail = messages.length ? messages[messages.length - 1] : null;
  const unchanged = !!last && last.count === messages.length && last.tail === tail;
  const rev = unchanged ? last.rev : newId();
  const main = {};
  for (const key of Object.keys(conv)) if (key !== 'apiMessages' && key !== 'apiSplit' && key !== 'rev') main[key] = conv[key];
  main.apiSplit = { count: messages.length, rev };
  return {
    main,
    history: unchanged ? null : { id: historyKey(conv.id), rev, apiMessages: messages },
    mark: { count: messages.length, tail, rev },
  };
}

/** The conversation from its stored records (see the header), or null. */
function assemble(id, { main, history } = {}, track = true) {
  if (!isPlainObject(main) || main.id !== id) return null;
  if (track) knownRev.set(id, Number.isInteger(main.rev) && main.rev > 0 ? main.rev : 0);
  const conv = {};
  for (const key of Object.keys(main)) if (key !== 'apiSplit' && key !== 'rev') conv[key] = main[key];
  if (!isPlainObject(main.apiSplit)) return conv; // stored whole (an earlier version): split on its next save
  if (isPlainObject(history) && Array.isArray(history.apiMessages)) {
    conv.apiMessages = history.apiMessages;
    const messages = conv.apiMessages;
    // Saving this same object again only rewrites the history once it grows.
    if (track) apiWritten.set(id, { count: messages.length, tail: messages.length ? messages[messages.length - 1] : null, rev: history.rev });
  } else {
    reportWarning('A saved conversation is missing its message history', id);
    conv.apiMessages = [];
  }
  return conv;
}

/** Tell listeners when getPersistence() changed since they last heard. Never throws. */
function notifyPersistence() {
  const next = getPersistence();
  if (next.persistent === reported.persistent && next.reason === reported.reason) return;
  reported = next;
  emitTo(persistenceListeners, next, 'A persistence listener failed');
}

function emitTo(listeners, payload, label) {
  for (const fn of Array.from(listeners)) {
    try {
      fn({ ...payload });
    } catch (err) {
      reportWarning(label, err);
    }
  }
}

/** The cross-window channel (created on first use); null where BroadcastChannel is unavailable. */
function openChannel() {
  if (channel !== undefined) return channel;
  channel = null;
  try {
    if (typeof globalThis.BroadcastChannel === 'function') {
      channel = new globalThis.BroadcastChannel('jarvis-saves');
      channel.onmessage = (event) => {
        const msg = event && event.data;
        if (!isPlainObject(msg) || typeof msg.id !== 'string' || !msg.id || !Number.isInteger(msg.rev)) return;
        emitTo(remoteListeners, { id: msg.id, updatedAt: finite(msg.updatedAt) ?? 0, rev: msg.rev }, 'A remote save listener failed');
      };
    }
  } catch {
    channel = null;
  }
  return channel;
}

function post(message) {
  try {
    const ch = openChannel();
    if (ch) ch.postMessage(message);
  } catch {
    /* another window simply does not hear about it */
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
      // Version 2: the saved library. Purely additive: version 1 data is left exactly as it was.
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
        const library = db.createObjectStore(LIBRARY_STORE, { keyPath: 'id' });
        library.createIndex('byCreated', 'createdAt');
        library.createIndex('byPart', 'partKey');
        library.createIndex('bySegment', 'segmentId');
      }
    };
    req.onblocked = () => {
      // Another window still holds the old version open and did not step aside (Jarvis's own
      // windows do, see adopt()); the open timeout below reports it if it never finishes.
      reportWarning('Waiting for other Jarvis windows to close before updating local storage.');
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
    const box = { value: undefined, error: null };
    tx.oncomplete = () => resolve(box.value);
    tx.onabort = () => reject(box.error || tx.error || new DOMException('Transaction aborted', 'AbortError'));
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
  return transaction(db, [STORE, META], 'readwrite', (stores, box) => body(stores, box));
}

/** A conversation's own record and its history record, read together (one consistent snapshot). */
function readRecords(db, id) {
  return transaction(db, [STORE], 'readonly', (stores, box) => {
    box.value = { main: undefined, history: undefined };
    const main = stores[STORE].get(id);
    main.onsuccess = () => {
      box.value.main = main.result;
      if (!isPlainObject(main.result) || !isPlainObject(main.result.apiSplit)) return;
      const history = stores[STORE].get(historyKey(id));
      history.onsuccess = () => {
        box.value.history = history.result;
      };
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
