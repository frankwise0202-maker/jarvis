// Backup, restore and reset (SPEC §5).
//
//   exportBackup()     -> Promise<Blob>  application/json:
//                         { app: 'jarvis', version: 1, exportedAt, settings, memory, conversations,
//                           library: { version: 1, items } }  (saved holograms and blueprints,
//                           thumbnails included; see library.js)
//                         settings exclude onboarded/features; never the API key, never spend.
//                         Conversations are never edited: one that contains the saved API key, or
//                         anything shaped like an Anthropic key (sk-ant-…), is left out and listed
//                         in blob.excludedConversations ([{ id }]); everywhere else (memory,
//                         protocols, …) such text is replaced by "[API key removed]".
//   importBackup(file) -> Promise<{ conversations, copies, replaced, memory, settings,
//                         settingsChanged, skipped, library? }>
//                         conversations merged by id (the newer updatedAt wins; `replaced` lists
//                         the ids of local conversations overwritten). A newer backup copy never
//                         deletes local turns: when this device's copy has turns the backup's lacks
//                         (the two diverged), the backup's is added as a separate conversation
//                         (title + " (from backup)"; counted in `copies`). Memory merged
//                         (case-insensitive dedupe). Only the owner's profile, voice and
//                         appearance settings are restored (RESTORED_SETTINGS; never limits,
//                         models, spending or feature flags): `settings` says whether any changed
//                         and `settingsChanged` lists those keys (the home base's address only
//                         comes back to a device with none linked: `homeBase` names it). Imported conversations are
//                         vetted and rebuilt from known fields (see cleanConversation): only ones
//                         Jarvis made are accepted, nothing imported can be resumed; `skipped`
//                         counts the ones left out. Throws an Error with a user-facing message
//                         for files that are not a usable Jarvis backup. Library items are
//                         vetted the same way (ids, kinds, references, every spec re-validated,
//                         thumbnails only when safe; newer updatedAt wins): `library` (present when
//                         the backup has one) counts the items added or updated. Hologram and
//                         blueprint chat cards are rebuilt
//                         with their specs re-validated too.
//   resetApp()         -> Promise<{ ok, failed }>  clears settings, API key, memory, spend, all
//                         conversations, the saved library and other jarvis.* local data (custom protocols, stats,
//                         UI preferences), unregisters this app's
//                         service worker and deletes its caches, the natural voice's download
//                         included (NATURAL_CACHES), and the "Hey Jarvis" models (WAKE_CACHE). Never
//                         throws. Reload afterwards.
//   backupFileName()   -> 'jarvis-backup-YYYY-MM-DD.json' (local date)
//   registerBackupPart(name, { exportData, importData }) -> unregister()
//                         lets a feature module add its own data (the app registers the owner's
//                         custom protocols and usage statistics), so this platform module never
//                         imports UI code. exportData() returns JSON-safe data (or undefined to
//                         leave it out) stored at backup[name]; importData(value) merges it and
//                         returns a count or boolean reported as result[name]. Parts are
//                         optional in a backup: older backups simply don't have them.

import { DEFAULT_SETTINGS, getSettings, saveSettings, resetSettings } from './settings.js';
import { listMemory, mergeMemory, clearMemory, memoryKey, MEMORY_MAX_ITEMS } from './memory.js';
import { getApiKey, clearApiKey } from './secrets.js';
import { resetSpend } from './spend.js';
import { listConversations, getConversation, deleteAllConversations, restoreConversation } from './db.js';
import { deleteAllLibraryItems, exportLibraryItems, importLibraryItems, listLibraryIds, listLibraryItems, IMPORT_MAX_ITEMS } from './library.js';
import { removeItemsWithPrefix } from './storage.js';
import { isPlainObject, reportWarning } from './util.js';
import { DEPTHS, MODES } from '../engine/models.js';
import { isKnownLeadSetup } from '../engine/prompts.js';
import { normalizeHologramSpec } from '../lib/hologram-spec.js';
import { normalizeBlueprintSpec, summarizeBlueprint } from '../lib/blueprint-spec.js';
import { cleanFrame, cleanLabelText, OPTICS_LIMITS } from '../lib/optics.js';
import { MUSIC_SEARCH_KINDS, cleanMusicItems, cleanQuery, cleanText } from '../lib/music.js';
import { NATURAL_CACHES } from './voice/natural/catalog.js';
import { WAKE_CACHE } from '../lib/wake/catalog.js';
import { normalizeHomeBaseUrl, homeBaseName } from '../lib/homebase.js';
import { conversationAction, mirrorAction, mirrorIdOf, mirrorTitle, forkIdOf, forkTitle } from '../lib/sync.js';

export const BACKUP_APP = 'jarvis';
export const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
// Never exported: onboarding and feature flags, and the camera chosen last in Optics (v7.1: a
// per-browser device id and the webcam's model with its USB ids, local to this device: SPEC 18.1).
// v7.7: hearing and voice through the home base are this device's own choice (and a download on the
// home base): never exported, never applied from a backup (v7.8: nor who made that choice).
// v8.1: the microphone and speaker setup is this computer's own (device ids are per browser, and another
// device's speakerphone means nothing here): never exported, never synced, never applied from a backup.
const EXCLUDED_SETTINGS = ['onboarded', 'features', 'opticsCameraId', 'opticsCameraLabel', 'homeBaseHear', 'homeBaseSpeak', 'homeBaseSpeakBy', 'audioSetup', 'audioInputId', 'audioInputLabel', 'audioOutputId', 'audioOutputLabel'];

/**
 * The settings an import restores: the owner's profile, voice and appearance. Never limits, models,
 * spending or feature flags (maxAgents, maxParallel, maxWaves, depth, mode, spendWarnUsd, leadModel,
 * workerModel, features, onboarded): a backup - possibly one someone else made - must not be able
 * to raise what Jarvis may spend or switch off the spending warning. The natural voice's speaker
 * (naturalVoiceId, v7.1) is restored, but never naturalVoice itself: an import never starts a
 * download. Wake Jarvis (Standby): two claps, their sensitivity and the return to Standby are
 * restored; "Hey Jarvis" (wakeWord) is carried in the file but never switched on by an import, for
 * the same reason (its models are a download). The home base's address (homeBaseUrl, v7.5) is
 * restored only on a device with none linked, and only a valid one (https on a *.ts.net name): an
 * import never unlinks this device (a device that never linked one exports "") and never points a
 * linked one at another address (the backup may be someone else's). importBackup() names it
 * (`homeBase`: the machine name) when it was restored.
 */
export const RESTORED_SETTINGS = Object.freeze([
  'userName', 'tone', 'verbosity', 'theme', 'sounds', 'soundVolume', 'haptics', 'voiceURI', 'voiceRate', 'listenLang',
  'speakReplies', 'voiceContinuous', 'followups', 'showThinking', 'location', 'memoryEnabled', 'notifyOnFinish',
  'naturalVoiceId', 'listenWait', 'listenSend', 'wakeClap', 'wakeClapSensitivity', 'wakeReturn', 'homeBaseUrl',
]);

/** What replaces an API key in exported data. */
export const KEY_REMOVED = '[API key removed]';
/**
 * Anything shaped like an Anthropic API key (not only the saved one: an old or second key too),
 * in any letter case (a key retyped or auto-capitalized by a phone keyboard).
 */
const KEY_LIKE = /sk-ant-[A-Za-z0-9_-]{20,}/i;
const KEY_LIKE_ALL = new RegExp(KEY_LIKE.source, 'gi');
// Top-level backup fields a part may never use (nor anything that names secrets or spend).
const RESERVED_PARTS = new Set(['app', 'version', 'exportedAt', 'settings', 'memory', 'conversations', 'library', 'apiKey', 'spend']);
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
  const { json, excluded } = await buildBackup();
  const blob = new Blob([json], { type: 'application/json' });
  // What was left out, so the UI can say so: [{ id }] (no titles: a title may hold the key).
  Object.defineProperty(blob, 'excludedConversations', { value: excluded, enumerable: false });
  return blob;
}

/**
 * v7.6 sync (SPEC §24.7): this device's backup as JSON text (exactly what exportBackup() saves) and
 * what is in it: { json, ids: { conv, lib, mem } } (conversation ids, saved item ids, the facts'
 * keys), plus `excluded` (conversations left out because they hold a key).
 */
export async function buildSyncBackup() {
  return buildBackup();
}

async function buildBackup() {
  const settings = {};
  const current = getSettings();
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!EXCLUDED_SETTINGS.includes(key)) settings[key] = current[key];
  }
  const memory = listMemory().map(({ id, text, createdAt }) => ({ id, text, createdAt }));
  const key = getApiKey();
  // The saved key as it appears inside JSON text (identical for any real key).
  const savedKey = typeof key === 'string' && key.length >= 8 ? JSON.stringify(key).slice(1, -1) : '';
  const mentionsKey = (json) => (!!savedKey && json.includes(savedKey)) || KEY_LIKE.test(json);
  const conversations = [];
  const excluded = [];
  for (const row of await listConversations()) {
    const conv = await getConversation(row.id, { track: false }); // a read-only copy: never this window's baseline
    if (!conv) continue;
    // A conversation is never edited (its thinking blocks are bound to the exact history, SPEC
    // §8.3), so one in which the owner pasted an API key is left out of the backup instead.
    if (mentionsKey(JSON.stringify(conv))) excluded.push({ id: conv.id });
    else conversations.push(conv);
  }
  const data = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings, memory, conversations };
  try {
    data.library = await exportLibraryItems();
  } catch (err) {
    reportWarning('Backup: could not export the saved library', err);
  }
  for (const [name, part] of parts) {
    try {
      const value = await part.exportData();
      if (value !== undefined && value !== null) data[name] = JSON.parse(JSON.stringify(value));
    } catch (err) {
      reportWarning(`Backup: could not export ${name}`, err);
    }
  }
  let json = JSON.stringify(data);
  // No key may leave in a backup: anywhere else one appears (a remembered fact, a custom protocol)
  // is plain data, not frozen history, so it is masked there - the saved key and anything shaped
  // like one. (The pattern never spans a JSON string boundary, so the JSON stays valid.)
  if (savedKey) json = json.split(savedKey).join(KEY_REMOVED);
  json = json.replace(KEY_LIKE_ALL, KEY_REMOVED);
  const ids = {
    conv: conversations.map((c) => c.id).concat(excluded.map((c) => c.id)),
    lib: data.library && Array.isArray(data.library.items) ? data.library.items.map((it) => it && it.id).filter((id) => typeof id === 'string') : [],
    mem: memory.map((m) => memoryKey(m.text)).filter(Boolean),
  };
  return { json, excluded, ids };
}

// ---- v7.6 sync: another device's backup merged in (SPEC §24.7) -------------------------------------

/**
 * Merges another device's backup (pulled from the home base) into this device: its conversations,
 * saved holograms and blueprints and remembered facts, never its settings, protocols or statistics.
 * Only ever adds (src/lib/sync.js has the rules): something missing here is added unless this device
 * had it before (`known`: { conv, lib, mem } Sets; the owner deleted it here); for the same id the
 * newer updatedAt wins, except that a conversation that went another way on each device is never
 * overwritten (that device's version is kept next to it, "(from <label>)"); such a copy the owner
 * carried on here is never written over either: it is kept whole as a conversation of its own
 * ("(from <label>, continued on <selfLabel>)", an ordinary id, synced like any other) before the
 * copy follows that device again (`forked`: [{ from: the copy's id, to: the new id }], so the app can
 * keep showing it); a conversation running here (`isBusy(id)`) is left for the next sync.
 * Everything is vetted exactly like an import. Idempotent. Returns { conversations: [ids written],
 * mirrors, forked, library, memory, busy, skipped, written: { conv, lib, mem } (what this device now
 * has from it, for `known`) }. `from` is that device's id (its versions' ids), `label` its name,
 * `selfLabel` this device's. Throws for a file that isn't a usable Jarvis backup (like importBackup).
 */
export async function mergeSyncedBackup(file, { from, label = '', selfLabel = '', known = {}, isBusy = () => false } = {}) {
  const data = await readBackup(file);
  if (typeof from !== 'string' || !from) throw new TypeError('mergeSyncedBackup: the device id (from) is required');
  const knownConv = known.conv instanceof Set ? known.conv : new Set();
  const knownLib = known.lib instanceof Set ? known.lib : new Set();
  const knownMem = known.mem instanceof Set ? known.mem : new Set();
  const busyOf = (id) => {
    try {
      return !!isBusy(id);
    } catch {
      return false;
    }
  };
  const out = { conversations: [], mirrors: 0, forked: [], library: 0, memory: 0, busy: 0, skipped: 0, written: { conv: [], lib: [], mem: [] } };

  // Conversations.
  if (Array.isArray(data.conversations) && data.conversations.length) {
    const rows = new Map((await listConversations()).map((row) => [row.id, row.updatedAt]));
    const seen = new Set();
    // How far each turn got (a reply resumed later keeps its id: SYNC-2), for the rules in src/lib/sync.js.
    const turnsOf = (c) => (Array.isArray(c.turns) ? c.turns : []).filter(isPlainObject).map((t) => ({ id: t.id, role: t.role, status: t.status, endedAt: t.endedAt }));
    const localOf = async (id, { full = false } = {}) => {
      if (!rows.has(id)) return null;
      const c = await getConversation(id, { track: false });
      if (!c) return null;
      const turns = turnsOf(c);
      return { updatedAt: c.updatedAt, turnIds: turns.map((t) => t.id), turns, conv: full ? c : null };
    };
    for (const raw of data.conversations) {
      // The same version as here (the usual case once two devices are in step): nothing to vet or do.
      if (isPlainObject(raw) && typeof raw.id === 'string' && rows.has(raw.id) && rows.get(raw.id) === raw.updatedAt) {
        seen.add(raw.id);
        continue;
      }
      const conv = cleanConversation(raw);
      if (!conv) {
        out.skipped++;
        continue;
      }
      if (seen.has(conv.id)) continue;
      seen.add(conv.id);
      const remote = { id: conv.id, updatedAt: conv.updatedAt, turnIds: conv.turns.map((t) => t.id), turns: turnsOf(conv) };
      const local = await localOf(conv.id);
      const action = conversationAction({ remote, local, known: knownConv.has(conv.id), busy: !!local && busyOf(conv.id) });
      if (action === 'busy') {
        out.busy++;
        continue;
      }
      if (action === 'add' || action === 'replace') {
        if (await restoreConversation(conv)) {
          out.conversations.push(conv.id);
          out.written.conv.push(conv.id);
        }
        continue;
      }
      if (action !== 'mirror') continue;
      // The two went different ways: theirs is kept next to this device's own, one copy per device.
      const id = mirrorIdOf(conv.id, from);
      if (id.length > 200) continue;
      const mine = await localOf(id, { full: true });
      const what = mirrorAction({ remote, mirror: mine, known: knownConv.has(id) });
      if (what === 'add' || what === 'replace' || what === 'fork') {
        if (mine && busyOf(id)) {
          out.busy++;
          continue;
        }
        if (what === 'fork') {
          // The owner carried this copy on here: kept whole under an ordinary id of its own first
          // (the same id for the same copy), and the copy is only written over once that worked.
          // Already there (a sync cut off half way): left as it is, since the owner may have gone
          // on in it; deleted here since: not brought back.
          const forkId = forkIdOf(conv.id, from, mine.updatedAt);
          if (!forkId || !mine.conv) continue; // can't be kept: the copy stays as it is
          if (!rows.has(forkId) && !knownConv.has(forkId)) {
            const kept = { ...mine.conv, id: forkId, title: forkTitle(conv.title, label, selfLabel) };
            if (!(await restoreConversation(kept))) continue;
            rows.set(forkId, kept.updatedAt);
            out.conversations.push(forkId);
          }
          if (rows.has(forkId)) {
            out.written.conv.push(forkId);
            out.forked.push({ from: id, to: forkId });
          }
        }
        if (await restoreConversation({ ...conv, id, title: mirrorTitle(conv.title, label) })) {
          out.conversations.push(id);
          out.written.conv.push(id);
          out.mirrors++;
        }
      }
    }
  }

  // Saved holograms and blueprints: what this device deleted stays away; the newer updatedAt wins.
  const libList = isPlainObject(data.library) && Array.isArray(data.library.items) ? data.library.items : Array.isArray(data.library) ? data.library : null;
  if (libList && libList.length) {
    if (isPlainObject(data.library) && typeof data.library.version === 'number' && data.library.version > 1) {
      reportWarning('Sync: the library was saved by a newer version of Jarvis and was left out');
    } else {
      try {
        const here = new Set(await listLibraryIds());
        // Saved times of what is here (no spec is read or checked), so an unchanged item is not re-validated.
        const stamps = new Map((await listLibraryItems()).map((row) => [row.id, row.updatedAt]));
        const items = libList.filter((it) => {
          if (!isPlainObject(it) || typeof it.id !== 'string') return false;
          if (stamps.has(it.id)) return typeof it.updatedAt === 'number' && it.updatedAt > stamps.get(it.id);
          return here.has(it.id) || !knownLib.has(it.id);
        });
        // importLibraryItems takes up to IMPORT_MAX_ITEMS at a time: a big library goes in parts.
        for (let i = 0; i < items.length; i += IMPORT_MAX_ITEMS) out.library += await importLibraryItems(items.slice(i, i + IMPORT_MAX_ITEMS));
        const now = new Set(await listLibraryIds());
        for (const it of libList) if (isPlainObject(it) && typeof it.id === 'string' && now.has(it.id)) out.written.lib.push(it.id);
      } catch (err) {
        reportWarning('Sync: could not merge the saved library', err);
      }
    }
  }

  // Remembered facts: added unless this device forgot them, and only into the room left (memory keeps
  // MEMORY_MAX_ITEMS; a merge must never push out a fact this device already has).
  if (Array.isArray(data.memory) && data.memory.length) {
    const factKey = (m) => memoryKey(typeof m === 'string' ? m : isPlainObject(m) ? m.text : '');
    const here = new Set(listMemory().map((m) => memoryKey(m.text)));
    const fresh = data.memory.filter((m) => {
      const k = factKey(m);
      return !!k && !here.has(k) && !knownMem.has(k);
    });
    const room = Math.max(0, MEMORY_MAX_ITEMS - here.size);
    const take = room > 0 ? fresh.slice(-room) : []; // the newest that fit (a backup lists them oldest first)
    if (take.length) out.memory = mergeMemory(take);
    const after = new Set(listMemory().map((m) => memoryKey(m.text)));
    for (const m of data.memory) {
      const k = factKey(m);
      if (k && after.has(k)) out.written.mem.push(k);
    }
  }
  return out;
}

/** Suggested file name for a backup download. */
export function backupFileName(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `jarvis-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/**
 * Restore from a backup: a File/Blob (from an <input type="file">), JSON text, or the parsed
 * object. Returns { conversations (added or updated, copies included), copies (diverged ones added
 * as a separate conversation), replaced (ids of local conversations overwritten by a newer copy),
 * memory (facts added), settings (whether any restored setting changed), settingsChanged (those
 * keys), skipped (conversations left out: not made by Jarvis, or damaged), ...one entry per
 * registered part }.
 */
export async function importBackup(file) {
  const data = await readBackup(file);
  const settingsChanged = restoreSettings(data.settings);
  const memory = Array.isArray(data.memory) ? mergeMemory(data.memory) : 0;

  let conversations = 0;
  let copies = 0; // diverged conversations added as a separate copy
  const replaced = []; // ids of local conversations a newer backup copy overwrote
  let skipped = 0; // not made by Jarvis, or damaged
  if (Array.isArray(data.conversations) && data.conversations.length) {
    const existing = new Map((await listConversations()).map((row) => [row.id, row.updatedAt]));
    const seen = new Set();
    for (const raw of data.conversations) {
      let conv = cleanConversation(raw);
      if (!conv) {
        skipped++;
        continue;
      }
      if (seen.has(conv.id)) continue;
      seen.add(conv.id);
      if (existing.has(conv.id)) {
        if (!(conv.updatedAt > existing.get(conv.id))) continue;
        if (await divergedFrom(conv)) {
          // Both copies moved on: keep the local one whole and add the backup's next to it. The
          // copy's id is derived from the original, so importing the same file again adds nothing.
          conv = { ...conv, id: `${conv.id}~backup-${conv.updatedAt}`, title: `${conv.title.trim() || 'Conversation'} (from backup)` };
          if (existing.has(conv.id) && !(conv.updatedAt > existing.get(conv.id))) continue;
          copies++;
        } else {
          replaced.push(conv.id);
        }
      }
      await restoreConversation(conv);
      conversations++;
    }
  }
  const result = { conversations, copies, replaced, memory, settings: settingsChanged.length > 0, settingsChanged, skipped };
  if (settingsChanged.includes('homeBaseUrl')) result.homeBase = homeBaseName(getSettings().homeBaseUrl);
  // Like the registered parts: reported only when the backup has a library (older ones do not).
  if (data.library !== undefined && data.library !== null) {
    try {
      result.library = await importLibraryItems(data.library);
    } catch (err) {
      reportWarning('Backup: could not import the saved library', err);
      result.library = 0;
    }
  }
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
  await step('saved library', deleteAllLibraryItems);
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
  if (data.library !== undefined && data.library !== null && !isPlainObject(data.library) && !Array.isArray(data.library)) throw new Error('This Jarvis backup is damaged (library).');
  return data;
}

/** Whether this device's copy of `conv` has turns that the (newer) backup copy lacks. */
async function divergedFrom(conv) {
  const local = await getConversation(conv.id, { track: false });
  if (!local || !Array.isArray(local.turns)) return false;
  const inBackup = new Set(conv.turns.map((t) => t.id));
  return local.turns.some((t) => isPlainObject(t) && typeof t.id === 'string' && !inBackup.has(t.id));
}

/**
 * Restores the profile, voice and appearance settings of a backup (validated and clamped by
 * saveSettings). Returns the keys whose value changed.
 */
function restoreSettings(raw) {
  if (!isPlainObject(raw)) return [];
  const patch = {};
  for (const key of RESTORED_SETTINGS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) patch[key] = raw[key];
  }
  // A backup from before v7.2 carries listenLang 'en-US', the old default: it follows the device's
  // language here too, unless the backup says how listening ends (it was saved by v7.2 or later).
  if (patch.listenLang === 'en-US' && !Object.prototype.hasOwnProperty.call(raw, 'listenWait')) patch.listenLang = '';
  const before = getSettings();
  // The home base's address links this device: an import only fills it in when none is linked, and
  // never with "" (that would unlink it) or an invalid address.
  if (Object.prototype.hasOwnProperty.call(patch, 'homeBaseUrl')) {
    const r = typeof patch.homeBaseUrl === 'string' ? normalizeHomeBaseUrl(patch.homeBaseUrl) : null;
    if (before.homeBaseUrl || !r || !r.ok) delete patch.homeBaseUrl;
    else patch.homeBaseUrl = r.url;
  }
  if (!Object.keys(patch).length) return [];
  const after = saveSettings(patch);
  return RESTORED_SETTINGS.filter((key) => before[key] !== after[key]);
}

// ---- vetting imported conversations (SPEC §6 shapes) ------------------------------------

const TURN_STATUSES = ['running', 'done', 'stopped', 'error', 'interrupted'];
const MISSION_STATUSES = ['planning', 'running', 'done', 'partial', 'stopped', 'interrupted'];
const AGENT_STATUSES = ['queued', 'starting', 'thinking', 'searching', 'reading', 'writing', 'done', 'error', 'stopped', 'interrupted'];
const FINAL_AGENT_STATUSES = ['done', 'error', 'stopped'];
const ERROR_KINDS = ['auth', 'billing', 'rate_limit', 'overloaded', 'network', 'bad_request', 'not_found', 'refusal', 'aborted', 'server', 'context', 'unknown'];
const MAX_TIME = 8.64e15; // the largest valid Date
const SAFE_THUMB = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
const MAX_THUMB_CHARS = 200 * 1024;
const MODEL_ID = /^claude-[a-z0-9.-]{1,60}$/;

const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
/** Text field: strings as they are, numbers and booleans as text, anything else ''. */
const text = (v) => (typeof v === 'string' ? v : (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean' ? String(v) : '');
const time = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_TIME ? v : null);
const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const size = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const int = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const oneOf = (v, list, fallback) => (typeof v === 'string' && list.includes(v) ? v : fallback);
const modelId = (v, fallback) => (typeof v === 'string' && MODEL_ID.test(v) ? v : fallback);
const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Sources (SPEC §6 Source): http(s) URLs only. */
function sources(list) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!isPlainObject(s) || typeof s.url !== 'string' || !/^https?:\/\/\S+$/i.test(s.url)) continue;
    const source = { url: s.url, title: text(s.title) || hostOf(s.url) || s.url };
    if (typeof s.pageAge === 'string' && s.pageAge) source.pageAge = s.pageAge;
    out.push(source);
  }
  return out;
}

function errorInfo(e) {
  if (e === null || e === undefined) return null;
  if (!isPlainObject(e)) return { kind: 'unknown', message: text(e) || 'Something went wrong.', retryable: false };
  const out = { kind: oneOf(e.kind, ERROR_KINDS, 'unknown'), message: text(e.message) || 'Something went wrong.', retryable: e.retryable === true };
  if (int(e.status, 100, 599) !== null) out.status = e.status;
  return out;
}

function usageOf(u) {
  const s = isPlainObject(u) ? u : {};
  return { input: count(s.input), output: count(s.output), cacheWrite: count(s.cacheWrite), cacheRead: count(s.cacheRead), searches: count(s.searches), fetches: count(s.fetches) };
}

function attachment(a) {
  if (!isPlainObject(a) || (a.kind !== 'image' && a.kind !== 'pdf')) return null;
  const thumb = a.kind === 'image' && typeof a.thumb === 'string' && a.thumb.length <= MAX_THUMB_CHARS && SAFE_THUMB.test(a.thumb) ? a.thumb : null;
  return { id: text(a.id), kind: a.kind, name: text(a.name), mediaType: text(a.mediaType), size: count(a.size), thumb, width: size(a.width), height: size(a.height) };
}

/** A segment rebuilt from its known fields; unknown kinds keep only id/kind/req (the UI skips them). */
function segment(s, settled) {
  if (!isPlainObject(s) || typeof s.id !== 'string' || !s.id || typeof s.kind !== 'string' || !s.kind) return null;
  const seg = { id: s.id, kind: s.kind, req: int(s.req, 0, 1e6) ?? 0 };
  switch (s.kind) {
    case 'thinking':
      seg.text = text(s.text);
      seg.startedAt = time(s.startedAt);
      seg.endedAt = time(s.endedAt) ?? seg.startedAt ?? settled.at;
      break;
    case 'text':
      seg.text = text(s.text);
      seg.citations = sources(s.citations);
      break;
    case 'tool':
      seg.tool = text(s.tool) || 'web_search';
      seg.query = text(s.query);
      seg.url = text(s.url);
      seg.status = s.status === 'done' ? 'done' : 'error'; // nothing imported is still running
      seg.results = sources(s.results);
      seg.errorCode = typeof s.errorCode === 'string' && s.errorCode ? s.errorCode : s.status === 'running' ? settled.code : null;
      if (typeof s.toolUseId === 'string' && s.toolUseId) seg.toolUseId = s.toolUseId;
      break;
    case 'mission':
      seg.missionId = text(s.missionId);
      break;
    case 'memory':
      seg.action = oneOf(s.action, ['add', 'remove'], 'add');
      seg.fact = text(s.fact);
      break;
    case 'notice':
      seg.level = oneOf(s.level, ['info', 'warn'], 'info');
      seg.text = text(s.text);
      if (s.transient === true) seg.transient = true;
      break;
    case 'error':
      seg.error = errorInfo(s.error) || { kind: 'unknown', message: 'Something went wrong.', retryable: false };
      break;
    case 'hologram':
    case 'blueprint':
      Object.assign(seg, visualSegment(s));
      break;
    case 'pins':
    case 'frame':
      Object.assign(seg, opticsSegment(s));
      break;
    case 'music':
      // Apple Music cards: every item re-checked (Apple's own hosts only), nothing is still searching.
      seg.status = s.status === 'done' ? 'done' : 'error';
      seg.query = cleanQuery(s.query);
      seg.searchKind = oneOf(s.searchKind, MUSIC_SEARCH_KINDS, 'song');
      seg.items = seg.status === 'done' ? cleanMusicItems(s.items) : [];
      seg.artist = cleanText(s.artist, 120);
      seg.error = seg.status === 'error' ? oneOf(s.error, ['offline', 'timeout', 'network', 'bad_response', 'empty', 'aborted'], 'network') : null;
      if (typeof s.toolUseId === 'string' && s.toolUseId) seg.toolUseId = s.toolUseId;
      if (s.local === true) seg.local = true;
      break;
    default:
      break;
  }
  return seg;
}

/**
 * Optics segments rebuilt from known fields: pins (labels re-checked: text ≤ 24 characters,
 * integer pixels inside the frame size range) and a frame Jarvis took (id, size, source, a safe
 * thumbnail). Nothing imported is still pinning.
 */
function opticsSegment(s) {
  const frameId = typeof s.frameId === 'string' && /^f[1-9]\d{0,3}$/.test(s.frameId) ? s.frameId : null;
  const toolUseId = typeof s.toolUseId === 'string' ? s.toolUseId : '';
  if (s.kind === 'frame') {
    const f = cleanFrame({ id: frameId, width: s.width, height: s.height, source: s.source });
    const thumb = typeof s.thumb === 'string' && s.thumb.length <= MAX_THUMB_CHARS && SAFE_THUMB.test(s.thumb) ? s.thumb : null;
    return f ? { toolUseId, frameId: f.id, width: f.width, height: f.height, source: f.source, reason: line(s.reason, 120), thumb } : { toolUseId, frameId: null };
  }
  const labels = (Array.isArray(s.labels) ? s.labels : [])
    .filter((l) => isPlainObject(l) && Number.isInteger(l.x) && Number.isInteger(l.y) && l.x >= 0 && l.y >= 0 && l.x < 4096 && l.y < 4096)
    .map((l) => ({ text: cleanLabelText(l.text), x: l.x, y: l.y }))
    .filter((l) => l.text)
    .slice(0, OPTICS_LIMITS.maxLabels);
  const done = s.status === 'done' && !!frameId && labels.length > 0;
  return {
    toolUseId,
    status: done ? 'done' : 'error',
    frameId,
    labels: done ? labels : [],
    warnings: (Array.isArray(s.warnings) ? s.warnings : []).filter((w) => typeof w === 'string').slice(0, 10).map((w) => line(w, 300)),
  };
}

/** A user turn's Optics frame record ({ frameId, width, height, source, capturedAt }), or null. */
function opticsOfTurn(o) {
  if (!isPlainObject(o)) return null;
  const f = cleanFrame({ id: o.frameId, width: o.width, height: o.height, source: o.source });
  return f ? { frameId: f.id, width: f.width, height: f.height, source: f.source, capturedAt: time(o.capturedAt) } : null;
}

const LIB_ID = /^lib_[a-z0-9]{6,16}$/;
const PART_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const line = (v, max) => text(v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** { model, part } with valid ids, or null. */
function partRef(v) {
  if (!isPlainObject(v) || typeof v.model !== 'string' || !LIB_ID.test(v.model)) return null;
  const part = v.part === undefined || v.part === null || v.part === '' ? null : v.part;
  if (part !== null && (typeof part !== 'string' || !PART_ID.test(part))) return null;
  return { model: v.model, part };
}

/**
 * A hologram or blueprint chat card rebuilt from known fields, its spec re-validated (a finished
 * card needs a showable spec; one that never finished keeps what was built). Nothing imported is
 * still building.
 */
function visualSegment(s) {
  const done = s.status === 'done';
  const out = { toolUseId: typeof s.toolUseId === 'string' ? s.toolUseId : '', status: done ? 'done' : 'error' };
  let spec = null;
  if (s.kind === 'hologram') {
    const res = isPlainObject(s.spec) ? normalizeHologramSpec(s.spec, { partial: !done, stable: false }) : null;
    if (res && res.spec && (!done || res.ok)) spec = res.spec;
    out.title = spec ? spec.title : line(s.title, 80);
    out.subtitle = spec ? spec.subtitle : line(s.subtitle, 120);
    out.spec = spec;
    out.stats = spec ? { parts: spec.parts.length, shapes: spec.parts.reduce((n, p) => n + p.shapes.length, 0) } : { parts: 0, shapes: 0 };
  } else {
    const res = isPlainObject(s.spec) ? normalizeBlueprintSpec(s.spec, { partial: !done }) : null;
    spec = res && res.spec ? res.spec : null;
    out.title = spec ? spec.title : line(s.title, 80);
    out.subject = spec ? spec.subject : line(s.subject, 80);
    out.sheet = spec ? spec.sheet : 'part';
    out.spec = spec;
    out.stats = spec ? summarizeBlueprint(spec) : { views: 0, shapes: 0, primitives: 0, callouts: 0, parts: 0, dimensions: 0, steps: 0 };
    out.for = partRef(s.for);
  }
  if (done && !spec) out.status = 'error';
  out.warnings = (Array.isArray(s.warnings) ? s.warnings : []).filter((w) => typeof w === 'string').slice(0, 40).map((w) => line(w, 300));
  out.libraryId = typeof s.libraryId === 'string' && LIB_ID.test(s.libraryId) ? s.libraryId : null;
  out.fromLibrary = s.fromLibrary === true;
  return out;
}

function agent(a, i, settled) {
  if (!isPlainObject(a)) return null;
  const status = oneOf(a.status, AGENT_STATUSES, 'stopped');
  const final = FINAL_AGENT_STATUSES.includes(status);
  const startedAt = time(a.startedAt);
  return {
    id: text(a.id) || `agent-${i + 1}`,
    codename: text(a.codename),
    role: text(a.role),
    task: text(a.task),
    web: a.web !== false,
    model: modelId(a.model, 'claude-sonnet-5-5'),
    status: final ? status : 'stopped', // nothing imported is still working
    activity: final ? text(a.activity) : 'Stopped',
    thinking: text(a.thinking),
    report: text(a.report),
    sources: sources(a.sources),
    searches: strings(a.searches),
    fetches: strings(a.fetches),
    usage: usageOf(a.usage),
    costUsd: count(a.costUsd),
    attempts: int(a.attempts, 0, 1e6) ?? 0,
    startedAt,
    endedAt: time(a.endedAt) ?? (startedAt === null ? null : settled.at),
    error: errorInfo(a.error),
  };
}

function missionsOf(raw, settled) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const [id, m] of Object.entries(raw)) {
    if (id === '__proto__' || !id || !isPlainObject(m)) continue;
    const status = oneOf(m.status, MISSION_STATUSES, 'stopped');
    const open = status === 'planning' || status === 'running' || status === 'interrupted';
    const startedAt = time(m.startedAt);
    out[id] = {
      id, // the key: what mission segments and Mission Control look it up by
      wave: int(m.wave, 1, 1e6) ?? 1,
      title: text(m.title),
      toolUseId: text(m.toolUseId),
      createdAt: time(m.createdAt) ?? startedAt ?? settled.at,
      startedAt,
      endedAt: time(m.endedAt) ?? (open ? settled.at : null),
      status: open ? 'stopped' : status, // nothing imported is still working
      agents: (Array.isArray(m.agents) ? m.agents : []).map((a, i) => agent(a, i, settled)).filter(Boolean),
    };
  }
  return out;
}

function turnOf(t, fallbackTime) {
  if (!isPlainObject(t) || typeof t.id !== 'string' || !t.id) return null;
  if (t.role === 'user') {
    if (typeof t.text !== 'string') return null;
    const turn = { id: t.id, role: 'user', text: t.text, mode: own(MODES, t.mode) ? t.mode : 'auto', createdAt: time(t.createdAt) ?? fallbackTime };
    if (Array.isArray(t.attachments)) turn.attachments = t.attachments.map(attachment).filter(Boolean);
    const optics = opticsOfTurn(t.optics);
    if (optics && turn.attachments && turn.attachments.length === 1) turn.optics = optics; // a Look keeps its frame id
    return turn;
  }
  if (t.role !== 'jarvis' || !TURN_STATUSES.includes(t.status) || !Array.isArray(t.segments)) return null;
  // An unfinished turn becomes 'stopped': an import is never resumable, so Resume can never run
  // a step (a memory change, an agent wave) that whoever made the backup prepared.
  const status = t.status === 'running' || t.status === 'interrupted' ? 'stopped' : t.status;
  const createdAt = time(t.createdAt) ?? fallbackTime;
  const endedAt = time(t.endedAt) ?? fallbackTime;
  const settled = { at: endedAt, code: status === 'stopped' ? 'stopped' : 'incomplete' };
  const missions = missionsOf(t.missions, settled);
  const seen = new Set();
  const segments = [];
  for (const raw of t.segments) {
    const seg = segment(raw, settled);
    if (!seg || seen.has(seg.id) || (seg.kind === 'mission' && !own(missions, seg.missionId))) continue;
    seen.add(seg.id);
    segments.push(seg);
  }
  const stats = isPlainObject(t.stats) ? t.stats : {};
  const turn = {
    id: t.id,
    role: 'jarvis',
    createdAt,
    endedAt,
    status,
    mode: own(MODES, t.mode) ? t.mode : 'auto',
    leadModel: modelId(t.leadModel, 'claude-opus-5-5'),
    workerModel: modelId(t.workerModel, 'claude-sonnet-5-5'),
    depth: own(DEPTHS, t.depth) ? t.depth : 'balanced',
    segments,
    missions,
    usage: usageOf(t.usage),
    costUsd: count(t.costUsd),
    stats: { agents: count(stats.agents), searches: count(stats.searches), sources: count(stats.sources), waves: count(stats.waves), durationMs: count(stats.durationMs) },
    error: errorInfo(t.error),
  };
  const maxAgents = int(t.maxAgents, 1, 20);
  if (maxAgents !== null) turn.maxAgents = maxAgents;
  const blueprintFor = partRef(t.blueprintFor);
  if (blueprintFor) turn.blueprintFor = blueprintFor;
  const apiStart = int(t.apiStart, 0, 1e9);
  if (apiStart !== null) turn.apiStart = apiStart;
  if (t.local === 'music') turn.local = 'music'; // a free Apple Music exchange (no model, no cost)
  if (t.local === 'homebase') {
    turn.local = 'homebase'; // a home base exchange (the Jarvis Core answered; free for this device)
    if (t.homeBasePaid === true) turn.homeBasePaid = true; // v7.8.1: a full briefing the home base paid for
  }
  return turn;
}

/** An API message as Jarvis stores it: a role and text or an array of typed content blocks. */
function isApiMessage(m) {
  if (!isPlainObject(m) || (m.role !== 'user' && m.role !== 'assistant')) return false;
  if (typeof m.content === 'string') return true;
  return Array.isArray(m.content) && m.content.every((b) => isPlainObject(b) && typeof b.type === 'string' && !!b.type);
}

/**
 * Vets an imported conversation and rebuilds it from known fields (SPEC §6), so a damaged or
 * hostile record can never break rendering, the engine or the history check. Returns null to
 * skip it:
 * - only conversations Jarvis made are accepted: their frozen system prompt and tools are sent
 *   with every later request (SPEC §8.3), so a backup must not be able to supply its own;
 * - the API history must be well formed (it is never edited: a broken one is skipped whole).
 * Nothing imported can be resumed: `pending` is dropped and unfinished turns become 'stopped'
 * (a pending update_memory would otherwise plant a "fact" with one tap on Resume). The cached
 * code-execution container and the drop-thinking flag belong to the device and account that
 * made the backup, so they are left behind (the engine learns them again when needed).
 */
function cleanConversation(raw) {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 200) return null;
  const createdAt = time(raw.createdAt) ?? time(raw.updatedAt);
  const updatedAt = time(raw.updatedAt) ?? createdAt;
  if (createdAt === null || updatedAt === null) return null;
  if (!isKnownLeadSetup(raw.system, raw.tools)) return null;
  if (!Array.isArray(raw.apiMessages) || !raw.apiMessages.every(isApiMessage)) return null;
  const turns = [];
  const seen = new Set();
  for (const t of Array.isArray(raw.turns) ? raw.turns : []) {
    const turn = turnOf(t, updatedAt);
    if (!turn || seen.has(turn.id)) continue;
    seen.add(turn.id);
    turns.push(turn);
  }
  return {
    id: raw.id,
    v: typeof raw.v === 'number' && Number.isFinite(raw.v) ? raw.v : 1,
    title: text(raw.title),
    createdAt,
    updatedAt,
    system: raw.system,
    tools: raw.tools,
    apiMessages: raw.apiMessages,
    turns,
    pending: null,
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

// The app's offline caches ('jarvis-<build>') and the natural voice's download (the model, the
// speakers and the ONNX Runtime binary: up to about 445 MB, kept outside 'jarvis-' so app updates
// don't delete it). Other sites' caches on this origin are left alone.
async function clearCaches() {
  const store = globalThis.caches;
  if (!store || typeof store.keys !== 'function') return;
  const names = await store.keys();
  await Promise.all(names.filter((n) => n.startsWith('jarvis-') || NATURAL_CACHES.includes(n) || n === WAKE_CACHE).map((n) => store.delete(n)));
}
