// Backup, restore and reset (SPEC §5).
//
//   exportBackup()     -> Promise<Blob>  application/json:
//                         { app: 'jarvis', version: 1, exportedAt, settings, memory, conversations }
//                         settings exclude onboarded/features; never the API key, never spend.
//                         Conversations are never edited: one that contains the saved API key, or
//                         anything shaped like an Anthropic key (sk-ant-…), is left out and listed
//                         in blob.excludedConversations ([{ id }]); everywhere else (memory,
//                         protocols, …) such text is replaced by "[API key removed]".
//   importBackup(file) -> Promise<{ conversations, copies, replaced, memory, settings,
//                         settingsChanged, skipped }>
//                         conversations merged by id (the newer updatedAt wins; `replaced` lists
//                         the ids of local conversations overwritten). A newer backup copy never
//                         deletes local turns: when this device's copy has turns the backup's lacks
//                         (the two diverged), the backup's is added as a separate conversation
//                         (title + " (from backup)"; counted in `copies`). Memory merged
//                         (case-insensitive dedupe). Only the owner's profile, voice and
//                         appearance settings are restored (RESTORED_SETTINGS; never limits,
//                         models, spending or feature flags): `settings` says whether any changed
//                         and `settingsChanged` lists those keys. Imported conversations are
//                         vetted and rebuilt from known fields (see cleanConversation): only ones
//                         Jarvis made are accepted, nothing imported can be resumed; `skipped`
//                         counts the ones left out. Throws an Error with a user-facing message
//                         for files that are not a usable Jarvis backup.
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
import { DEPTHS, MODES } from '../engine/models.js';
import { isKnownLeadSetup } from '../engine/prompts.js';

export const BACKUP_APP = 'jarvis';
export const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const EXCLUDED_SETTINGS = ['onboarded', 'features'];

/**
 * The settings an import restores: the owner's profile, voice and appearance. Never limits, models,
 * spending or feature flags (maxAgents, maxParallel, maxWaves, depth, mode, spendWarnUsd, leadModel,
 * workerModel, features, onboarded): a backup - possibly one someone else made - must not be able
 * to raise what Jarvis may spend or switch off the spending warning.
 */
export const RESTORED_SETTINGS = Object.freeze([
  'userName', 'tone', 'verbosity', 'theme', 'sounds', 'soundVolume', 'haptics', 'voiceURI', 'voiceRate', 'listenLang',
  'speakReplies', 'voiceContinuous', 'followups', 'showThinking', 'location', 'memoryEnabled', 'notifyOnFinish',
]);

/** What replaces an API key in exported data. */
export const KEY_REMOVED = '[API key removed]';
/** Anything shaped like an Anthropic API key (not only the saved one: an old or second key too). */
const KEY_LIKE = /sk-ant-[A-Za-z0-9_-]{20,}/;
const KEY_LIKE_ALL = new RegExp(KEY_LIKE.source, 'g');
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
  // The saved key as it appears inside JSON text (identical for any real key).
  const savedKey = typeof key === 'string' && key.length >= 8 ? JSON.stringify(key).slice(1, -1) : '';
  const mentionsKey = (json) => (!!savedKey && json.includes(savedKey)) || KEY_LIKE.test(json);
  const conversations = [];
  const excluded = [];
  for (const row of await listConversations()) {
    const conv = await getConversation(row.id);
    if (!conv) continue;
    // A conversation is never edited (its thinking blocks are bound to the exact history, SPEC
    // §8.3), so one in which the owner pasted an API key is left out of the backup instead.
    if (mentionsKey(JSON.stringify(conv))) excluded.push({ id: conv.id });
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
  // No key may leave in a backup: anywhere else one appears (a remembered fact, a custom protocol)
  // is plain data, not frozen history, so it is masked there - the saved key and anything shaped
  // like one. (The pattern never spans a JSON string boundary, so the JSON stays valid.)
  if (savedKey) json = json.split(savedKey).join(KEY_REMOVED);
  json = json.replace(KEY_LIKE_ALL, KEY_REMOVED);
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

/** Whether this device's copy of `conv` has turns that the (newer) backup copy lacks. */
async function divergedFrom(conv) {
  const local = await getConversation(conv.id);
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
  if (!Object.keys(patch).length) return [];
  const before = getSettings();
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
    default:
      break;
  }
  return seg;
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
  const apiStart = int(t.apiStart, 0, 1e9);
  if (apiStart !== null) turn.apiStart = apiStart;
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

async function clearCaches() {
  const store = globalThis.caches;
  if (!store || typeof store.keys !== 'function') return;
  const names = await store.keys();
  await Promise.all(names.filter((n) => n.startsWith('jarvis-')).map((n) => store.delete(n)));
}
