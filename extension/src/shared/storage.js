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
// In development builds only, jarvis.dev.apiBase points the API client at a local mock.

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
});

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
