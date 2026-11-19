// Backup, restore and reset (SPEC §5).
//
//   exportBackup()     -> Promise<Blob>  application/json:
//                         { app: 'jarvis', version: 1, exportedAt, settings, memory, conversations }
//                         settings exclude onboarded/features; never the API key, never spend.
//                         Conversations are never edited: one that contains the API key is left
//                         out and listed in blob.excludedConversations ([{ id }]).
//   importBackup(file) -> Promise<{ conversations, memory, settings }>
//                         conversations merged by id (the newer updatedAt wins), memory merged
//                         (case-insensitive dedupe), settings restored (validated and clamped).
//                         Throws an Error with a user-facing message for files that are not a
//                         usable Jarvis backup.
//   resetApp()         -> Promise<{ ok, failed }>  clears settings, API key, memory, spend, all
//                         conversations and other jarvis.* local data (custom protocols, stats,
//                         UI preferences), unregisters this app's
//                         service worker and deletes its caches. Never throws. Reload afterwards.
//   backupFileName()   -> 'jarvis-backup-YYYY-MM-DD.json' (local date)
//   registerBackupPart(name, { exportData, importData }) -> unregister()
//                         lets a feature module add its own data (the app registers the owner's
//                         custom protocols and usage statistics), so this platform module never
//                         imports UI code. exportData() returns JSON-safe data (or undefined to
//                         leave it out) stored at backup[name]; importData(value) merges it and
//                         returns a count or boolean reported as result[name]. Parts are
//                         optional in a backup: older backups simply don't have them.

import { DEFAULT_SETTINGS, getSettings, saveSettings, resetSettings } from './settings.js';
import { listMemory, mergeMemory, clearMemory } from './memory.js';
import { getApiKey, clearApiKey } from './secrets.js';
import { resetSpend } from './spend.js';
import { listConversations, getConversation, deleteAllConversations, restoreConversation } from './db.js';
import { removeItemsWithPrefix } from './storage.js';
import { isPlainObject, reportWarning } from './util.js';

export const BACKUP_APP = 'jarvis';
export const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const EXCLUDED_SETTINGS = ['onboarded', 'features'];
const TURN_STATUSES = ['running', 'done', 'stopped', 'error', 'interrupted'];
// Top-level backup fields a part may never use (nor anything that names secrets or spend).
const RESERVED_PARTS = new Set(['app', 'version', 'exportedAt', 'settings', 'memory', 'conversations', 'apiKey', 'spend']);
const parts = new Map(); // name -> { exportData, importData }

/** Add a feature module's data to backups (see the header). Returns an unregister function. */
export function registerBackupPart(name, part) {
  if (typeof name !== 'string' || !/^[a-z][A-Za-z0-9]{0,31}$/.test(name) || RESERVED_PARTS.has(name)) throw new TypeError(`registerBackupPart: invalid name "${name}"`);
  if (!part || typeof part.exportData !== 'function' || typeof part.importData !== 'function') throw new TypeError('registerBackupPart: exportData and importData are required');
  parts.set(name, part);
  return () => {
    if (parts.get(name) === part) parts.delete(name);
  };
}

/** Everything worth keeping, as a JSON Blob. The API key and spend are never included. */
export async function exportBackup() {
  const settings = {};
  const current = getSettings();
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!EXCLUDED_SETTINGS.includes(key)) settings[key] = current[key];
  }
  const memory = listMemory().map(({ id, text, createdAt }) => ({ id, text, createdAt }));
  const key = getApiKey();
  const mentionsKey = (value) => !!key && key.length >= 8 && JSON.stringify(value).includes(key);
  const conversations = [];
  const excluded = [];
  for (const row of await listConversations()) {
    const conv = await getConversation(row.id);
    if (!conv) continue;
    // A conversation is never edited (its thinking blocks are bound to the exact history, SPEC
    // §8.3), so one in which the owner pasted their API key is left out of the backup instead.
    if (mentionsKey(conv)) excluded.push({ id: conv.id });
    else conversations.push(conv);
  }
  const data = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings, memory, conversations };
  for (const [name, part] of parts) {
    try {
      const value = await part.exportData();
      if (value !== undefined && value !== null) data[name] = JSON.parse(JSON.stringify(value));
    } catch (err) {
      reportWarning(`Backup: could not export ${name}`, err);
    }
  }
  let json = JSON.stringify(data);
  // The key must never leave in a backup: anywhere else it appears (a remembered fact, a custom
  // protocol) is plain data, not frozen history, so it is masked there.
  if (key && key.length >= 8 && json.includes(key)) json = json.split(key).join('[API key removed]');
  const blob = new Blob([json], { type: 'application/json' });
  // What was left out, so the UI can say so: [{ id }] (no titles: a title may hold the key).
  Object.defineProperty(blob, 'excludedConversations', { value: excluded, enumerable: false });
  return blob;
}

/** Suggested file name for a backup download. */
export function backupFileName(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `jarvis-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/**
 * Restore from a backup: a File/Blob (from an <input type="file">), JSON text, or the parsed
 * object. Returns how many conversations were added or updated and how many facts were added.
 */
export async function importBackup(file) {
  const data = await readBackup(file);
  // Settings (validated by saveSettings; never the key, onboarding state or feature flags).
  let settings = false;
  if (isPlainObject(data.settings)) {
    const patch = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (!EXCLUDED_SETTINGS.includes(key) && Object.prototype.hasOwnProperty.call(data.settings, key)) patch[key] = data.settings[key];
    }
    if (Object.keys(patch).length) {
      saveSettings(patch);
      settings = true;
    }
  }
  const memory = Array.isArray(data.memory) ? mergeMemory(data.memory) : 0;

  let conversations = 0;
  if (Array.isArray(data.conversations) && data.conversations.length) {
    const existing = new Map((await listConversations()).map((row) => [row.id, row.updatedAt]));
    const seen = new Set();
    for (const raw of data.conversations) {
      const conv = cleanConversation(raw);
      if (!conv || seen.has(conv.id)) continue;
      seen.add(conv.id);
      if (existing.has(conv.id) && !(conv.updatedAt > existing.get(conv.id))) continue;
      await restoreConversation(conv);
      conversations++;
    }
  }
  const result = { conversations, memory, settings };
  for (const [name, part] of parts) {
    if (data[name] === undefined) continue;
    try {
      result[name] = await part.importData(data[name]);
    } catch (err) {
      reportWarning(`Backup: could not import ${name}`, err);
      result[name] = 0;
    }
  }
  return result;
}

/** Wipe everything Jarvis stored on this device. Reload the page afterwards. */
export async function resetApp() {
  const failed = [];
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (err) {
      failed.push(name);
      reportWarning(`Reset: could not clear ${name}`, err);
    }
  };
  await step('settings', resetSettings);
  await step('API key', clearApiKey);
  await step('memory', clearMemory);
  await step('spend', resetSpend);
  await step('conversations', deleteAllConversations);
  // Other jarvis.* keys: custom protocols (jarvis.protocols.v1), usage statistics
  // (jarvis.stats.v1) and UI preferences. Test-only jarvis.dev.* overrides are left alone.
  await step('local data', () => removeItemsWithPrefix('jarvis.', (key) => !key.startsWith('jarvis.dev.')));
  await step('service worker', unregisterServiceWorkers);
  await step('offline cache', clearCaches);
  return { ok: failed.length === 0, failed };
}

// ---------------------------------------------------------------------------------------

async function readBackup(file) {
  let data = file;
  if (typeof Blob !== 'undefined' && file instanceof Blob) {
    if (file.size > MAX_BACKUP_BYTES) throw new Error('This backup file is too large to import.');
    data = await file.text();
  }
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error("This file isn't a Jarvis backup (it isn't valid JSON).");
    }
  }
  if (!isPlainObject(data) || data.app !== BACKUP_APP) throw new Error("This file isn't a Jarvis backup.");
  if (typeof data.version !== 'number' || !Number.isFinite(data.version)) throw new Error("This Jarvis backup is missing its version, so it can't be imported.");
  if (data.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of Jarvis. Update Jarvis, then try again.');
  if (data.conversations !== undefined && !Array.isArray(data.conversations)) throw new Error('This Jarvis backup is damaged (conversations).');
  if (data.memory !== undefined && !Array.isArray(data.memory)) throw new Error('This Jarvis backup is damaged (memory).');
  return data;
}

/** Minimal structural validation so a bad record can never break the app or the engine. */
function cleanConversation(raw) {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 200) return null;
  const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
  const createdAt = num(raw.createdAt) ?? num(raw.updatedAt);
  const updatedAt = num(raw.updatedAt) ?? createdAt;
  if (createdAt === null || updatedAt === null) return null;
  const turns = Array.isArray(raw.turns)
    ? raw.turns.filter(
        (t) =>
          isPlainObject(t) &&
          typeof t.id === 'string' &&
          ((t.role === 'user' && typeof t.text === 'string') ||
            (t.role === 'jarvis' && TURN_STATUSES.includes(t.status) && Array.isArray(t.segments))),
      )
    : [];
  return {
    ...raw,
    v: typeof raw.v === 'number' ? raw.v : 1,
    title: typeof raw.title === 'string' ? raw.title : '',
    createdAt,
    updatedAt,
    system: typeof raw.system === 'string' ? raw.system : '',
    tools: Array.isArray(raw.tools) ? raw.tools : [],
    apiMessages: Array.isArray(raw.apiMessages) ? raw.apiMessages.filter(isPlainObject) : [],
    turns,
    pending: isPlainObject(raw.pending) ? raw.pending : null,
  };
}

async function unregisterServiceWorkers() {
  const sw = globalThis.navigator && globalThis.navigator.serviceWorker;
  if (!sw || typeof sw.getRegistrations !== 'function') return;
  // Only this app's registration: other apps may share the origin (e.g. user.github.io).
  const base = new URL('./', globalThis.location.href).href;
  const regs = await sw.getRegistrations();
  await Promise.all(regs.filter((r) => typeof r.scope === 'string' && r.scope.startsWith(base)).map((r) => r.unregister()));
}

async function clearCaches() {
  const store = globalThis.caches;
  if (!store || typeof store.keys !== 'function') return;
  const names = await store.keys();
  await Promise.all(names.filter((n) => n.startsWith('jarvis-')).map((n) => store.delete(n)));
}
