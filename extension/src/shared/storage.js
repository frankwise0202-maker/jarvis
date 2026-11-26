// Everything Jarvis for Chrome keeps, in chrome.storage.local (this computer only; nothing uses
// chrome.storage.sync, so nothing follows the owner's Google account to other computers).
//
//   jarvis.profile    { separate: true, at } the owner's confirmation, on the first-run screen,
//                     that this Chrome profile is just for Jarvis, with no saved passwords or cards.
//                     The API key can't be saved before it, and no task starts without it.
//   jarvis.apiKey     the owner's Anthropic API key. Read only by the service worker to call the
//                     Claude API; never logged, never sent anywhere but the API.
//   jarvis.settings   { model, budgetUsd, maxSteps, incognito }
//   jarvis.sites      { [site]: 'always' } sites the owner allowed permanently
//   jarvis.everyday   { [site]: true } sites where the owner lets Jarvis take everyday steps
//                     (searching, pages of results, filters and sorting) without asking each time;
//                     off for every site unless the owner turns it on in Settings
//   jarvis.history    finished tasks (not written while incognito is on); can be cleared
//
// Voice from Jarvis (the link to Jarvis, the web app, through the owner's home base; link.js):
//   chromeLink        { v: 1, core, key, linkedAt } the home base's address and the link key the
//                     owner pasted from Jarvis (a link code). The key seals every message (the home
//                     base can't read them); it is never sent anywhere, logged or synced.
//   jarvis.voice      { tasksFromJarvis, approvals } whether Jarvis may start tasks here (Link
//                     turns it on), and "Approve everyday steps by voice" (off; only offered once
//                     VOICE_APPROVALS_AVAILABLE)
//   jarvis.voiceTasks { day, count } tasks Jarvis started today (at most VOICE_TASKS_PER_DAY)
//   jarvis.relay      { after, seen } where reading the home base's messages left off, and the ids
//                     of the last 500 read (a message is never taken twice, also after a restart)
//
// In development builds only, jarvis.dev.apiBase points the API client at a local mock (and
// jarvis.dev.voiceApprovals lets the tests turn voice approvals on before they are available).

import { DEFAULT_MODEL, isModel } from '../background/models.js';
import { DEFAULT_BUDGET_USD, DEFAULT_MAX_STEPS, normalizeBudget, normalizeSteps } from '../background/limits.js';
import { isListedPublicSuffix } from '../background/sites.js';

export const KEYS = Object.freeze({
  profile: 'jarvis.profile',
  apiKey: 'jarvis.apiKey',
  settings: 'jarvis.settings',
  sites: 'jarvis.sites',
  everyday: 'jarvis.everyday',
  history: 'jarvis.history',
  link: 'chromeLink',
  voice: 'jarvis.voice',
  voiceTasks: 'jarvis.voiceTasks',
  relay: 'jarvis.relay',
});

/** Tasks Jarvis may start here in a day (by the computer's calendar). */
export const VOICE_TASKS_PER_DAY = 30;

/* global __DEV__ */
/** True only in development builds (esbuild defines __DEV__; release code paths fold it away). */
export const DEV = typeof __DEV__ !== 'undefined' && __DEV__ === true;

export const HISTORY_MAX = 50;
export const HISTORY_THUMBS = 10;

export const DEFAULT_SETTINGS = Object.freeze({ model: DEFAULT_MODEL, budgetUsd: DEFAULT_BUDGET_USD, maxSteps: DEFAULT_MAX_STEPS, incognito: false });

/** Checks an API key's shape. Returns { ok: true, key } (trimmed) or { ok: false, error }. */
export function validateApiKey(input) {
  const key = String(input ?? '').trim();
  if (!key) return { ok: false, error: 'Paste your Anthropic API key.' };
  if (/\s/.test(key)) return { ok: false, error: 'The key should not contain spaces or line breaks.' };
  if (!key.startsWith('sk-ant-')) return { ok: false, error: 'Anthropic API keys start with "sk-ant-". Copy it again from console.anthropic.com → API keys.' };
  if (key.length < 24 || key.length > 400) return { ok: false, error: 'That key looks incomplete. Copy the whole key and try again.' };
  return { ok: true, key };
}

/** What setApiKey answers before the owner has confirmed the separate profile. */
export const PROFILE_REQUIRED = 'First confirm that this is a separate Chrome profile just for Jarvis.';

/** The stored confirmation if it is one ({ separate: true, at }), else null. */
export function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || raw.separate !== true) return null;
  const at = Number(raw.at);
  return { separate: true, at: Number.isFinite(at) && at > 0 ? at : 0 };
}

/** "sk-ant-…a1B2": enough to recognise a key, never enough to use it. */
export function maskKey(key) {
  const k = String(key ?? '');
  if (k.length < 12) return k ? '••••' : '';
  return `${k.slice(0, 7)}…${k.slice(-4)}`;
}

export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    model: isModel(s.model) ? s.model : DEFAULT_MODEL,
    budgetUsd: normalizeBudget(s.budgetUsd ?? DEFAULT_BUDGET_USD),
    maxSteps: normalizeSteps(s.maxSteps ?? DEFAULT_MAX_STEPS),
    incognito: s.incognito === true,
  };
}

// ---------------------------------------------------------------------------------------------
// Voice from Jarvis: the link code

const KEY_TEXT = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url without padding

/**
 * The home base's origin from a link code's `core`, or '' when Jarvis for Chrome won't use it: its
 * Tailscale address (https on a *.ts.net machine name, no port, path or user name), as the web app
 * keeps it (the only host the extension may ask Chrome for: manifest optional_host_permissions).
 * Development builds also take a local test relay (http://127.0.0.1:<port>, http://localhost:<port>).
 */
export function homeBaseOrigin(core, { dev = DEV } = {}) {
  let u;
  try {
    u = new URL(String(core ?? ''));
  } catch {
    return '';
  }
  if (u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return '';
  const host = u.hostname.toLowerCase();
  if (u.protocol === 'https:' && host.endsWith('.ts.net') && !u.port) {
    const labels = host.split('.');
    if (labels.length >= 4 && host.length <= 253 && labels.every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return `https://${host}`;
    return '';
  }
  if (dev && u.protocol === 'http:' && (host === '127.0.0.1' || host === 'localhost')) return u.origin;
  return '';
}

/**
 * A link code from Jarvis (Settings → Jarvis for Chrome → Link): base64url of { v: 1, core, key }.
 * Returns { ok: true, link: { v: 1, core, key } } or { ok: false, error } (what to tell the owner).
 */
export function parseLinkCode(input, { dev = DEV } = {}) {
  const text = String(input ?? '').replace(/\s+/g, '');
  const again = 'In Jarvis, open Settings → Jarvis for Chrome → Link, press Copy link code, then paste it here.';
  if (!text) return { ok: false, error: `Paste the link code from Jarvis. ${again}` };
  let data = null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length > 4000) throw new Error('not base64url');
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || data.v !== 1 || typeof data.core !== 'string' || typeof data.key !== 'string') {
    return { ok: false, error: `That isn’t a link code from Jarvis. ${again}` };
  }
  if (!KEY_TEXT.test(data.key)) return { ok: false, error: `That link code is incomplete. ${again}` };
  const core = homeBaseOrigin(data.core, { dev });
  if (!core) return { ok: false, error: 'Jarvis for Chrome reaches your home base only at its Tailscale address (https://…ts.net). In Jarvis, set your home base to that address, then copy a new link code.' };
  return { ok: true, link: { v: 1, core, key: data.key } };
}

/** A stored link if it is one ({ v: 1, core, key, linkedAt }), else null. */
export function normalizeLink(raw, { dev = DEV } = {}) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || typeof raw.key !== 'string' || !KEY_TEXT.test(raw.key)) return null;
  const core = homeBaseOrigin(raw.core, { dev });
  if (!core) return null;
  const linkedAt = Number(raw.linkedAt);
  return { v: 1, core, key: raw.key, linkedAt: Number.isFinite(linkedAt) && linkedAt > 0 ? linkedAt : 0 };
}

export const DEFAULT_VOICE = Object.freeze({ tasksFromJarvis: false, approvals: false });

export function normalizeVoice(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  return { tasksFromJarvis: v.tasksFromJarvis === true, approvals: v.approvals === true };
}

/** The day a voice task counts toward, by this computer's calendar ("2026-11-26"). */
export function localDay(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Storage bound to a chrome-like object ({ storage: { local } }), so tests can pass a fake. */
export function createStore(chromeLike = globalThis.chrome) {
  const local = chromeLike.storage.local;
  const get = async (key) => (await local.get(key))[key];
  const set = (key, value) => local.set({ [key]: value });

  return {
    /**
     * The owner's confirmation that this Chrome profile is just for Jarvis, with no saved
     * passwords or cards ({ separate: true, at }), or null before the first-run screen.
     */
    async getProfile() {
      return normalizeProfile(await get(KEYS.profile));
    },
    async confirmProfile(at = Date.now()) {
      const value = { separate: true, at };
      await set(KEYS.profile, value);
      return value;
    },

    async getApiKey() {
      const v = await get(KEYS.apiKey);
      return typeof v === 'string' && v ? v : null;
    },
    /** Saves the key: only after the profile confirmation ({ ok: false, needsProfile } before it). */
    async setApiKey(input) {
      if (!(await this.getProfile())) return { ok: false, needsProfile: true, error: PROFILE_REQUIRED };
      const check = validateApiKey(input);
      if (!check.ok) return check;
      await set(KEYS.apiKey, check.key);
      return { ok: true, masked: maskKey(check.key) };
    },
    async clearApiKey() {
      await local.remove(KEYS.apiKey);
    },

    async getSettings() {
      return normalizeSettings(await get(KEYS.settings));
    },
    async setSettings(patch) {
      const next = normalizeSettings({ ...(await this.getSettings()), ...(patch || {}) });
      await set(KEYS.settings, next);
      return next;
    },

    /**
     * Sites allowed permanently. A grant saved by an older version for a whole hosting service
     * (a public suffix such as "ngrok.io", where strangers get subdomains) is dropped: it would
     * cover other people's sites.
     */
    async getSites() {
      const v = await get(KEYS.sites);
      const sites = v && typeof v === 'object' ? { ...v } : {};
      const stale = Object.keys(sites).filter((site) => isListedPublicSuffix(site));
      if (stale.length) {
        for (const site of stale) delete sites[site];
        await set(KEYS.sites, sites);
      }
      return sites;
    },
    async allowSiteAlways(site) {
      if (isListedPublicSuffix(site)) return;
      const sites = await this.getSites();
      sites[site] = 'always';
      await set(KEYS.sites, sites);
    },
    async forgetSite(site) {
      const sites = await this.getSites();
      delete sites[site];
      await set(KEYS.sites, sites);
      await this.setEveryday(site, false);
    },

    /** Sites where everyday steps need no approval: { [site]: true }. Off unless the owner turns it on. */
    async getEveryday() {
      const v = await get(KEYS.everyday);
      const out = {};
      if (v && typeof v === 'object') for (const [site, on] of Object.entries(v)) if (on === true && site && !isListedPublicSuffix(site)) out[site] = true;
      return out;
    },
    async setEveryday(site, on) {
      const map = await this.getEveryday();
      if (on && site && !isListedPublicSuffix(site)) map[site] = true;
      else delete map[site];
      await set(KEYS.everyday, map);
      return map;
    },

    async getHistory() {
      const v = await get(KEYS.history);
      return Array.isArray(v) ? v : [];
    },
    /** Adds (or replaces) a finished task; keeps HISTORY_MAX entries, thumbnails on the newest few. */
    async saveTask(entry) {
      if ((await this.getSettings()).incognito) return false;
      const list = (await this.getHistory()).filter((t) => t && t.id !== entry.id);
      list.unshift(entry);
      const trimmed = list.slice(0, HISTORY_MAX).map((t, i) => (i < HISTORY_THUMBS ? t : stripThumbs(t)));
      await set(KEYS.history, trimmed);
      return true;
    },
    async clearHistory() {
      await local.remove(KEYS.history);
    },

    // Voice from Jarvis -----------------------------------------------------------------------

    /** The link to Jarvis ({ v: 1, core, key, linkedAt }), or null. */
    async getLink() {
      return normalizeLink(await get(KEYS.link));
    },
    /** Saves a link from a parsed link code; the owner's switch for tasks from Jarvis turns on. */
    async setLink({ core, key }, at = Date.now()) {
      const link = normalizeLink({ v: 1, core, key, linkedAt: at });
      if (!link) return { ok: false, error: 'That link code can’t be used.' };
      await set(KEYS.link, link);
      await local.remove(KEYS.relay);
      await this.setVoice({ tasksFromJarvis: true });
      return { ok: true, link };
    },
    async clearLink() {
      await local.remove([KEYS.link, KEYS.relay]);
    },

    async getVoice() {
      return normalizeVoice(await get(KEYS.voice));
    },
    async setVoice(patch) {
      const next = normalizeVoice({ ...(await this.getVoice()), ...(patch || {}) });
      await set(KEYS.voice, next);
      return next;
    },

    /** How many tasks Jarvis has started here today. */
    async voiceTasksToday(now = Date.now()) {
      const v = await get(KEYS.voiceTasks);
      return v && typeof v === 'object' && v.day === localDay(now) && Number.isFinite(v.count) ? v.count : 0;
    },
    /** Counts one more task from Jarvis today; returns the new count. */
    async countVoiceTask(now = Date.now()) {
      const count = (await this.voiceTasksToday(now)) + 1;
      await set(KEYS.voiceTasks, { day: localDay(now), count });
      return count;
    },

    /** Where reading the home base's messages left off: { after, seen } (see relay.js). */
    async getRelayState() {
      const v = await get(KEYS.relay);
      return { after: typeof v?.after === 'string' ? v.after : '', seen: Array.isArray(v?.seen) ? v.seen.filter((x) => typeof x === 'string') : [] };
    },
    async setRelayState({ after = '', seen = [] } = {}) {
      await set(KEYS.relay, { after, seen });
    },

    /** Development builds only: voice approvals on before they are available (the tests). */
    async getDevVoiceApprovals() {
      if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
      return (await get('jarvis.dev.voiceApprovals')) === true;
    },

    /** The API base URL: the real API in release builds; a configurable mock in dev builds. */
    async getApiBase() {
      if (typeof __DEV__ === 'undefined' || !__DEV__) return undefined;
      const v = await get('jarvis.dev.apiBase');
      return typeof v === 'string' && /^https?:\/\//.test(v) ? v : undefined;
    },
  };
}

function stripThumbs(task) {
  if (!task || !Array.isArray(task.steps)) return task;
  return { ...task, steps: task.steps.map(({ thumb, ...rest }) => rest) };
}
