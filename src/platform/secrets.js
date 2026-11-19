// The owner's Anthropic API key, and the test-only API base override (SPEC §2, §5).
//
// The key lives in localStorage['jarvis.apiKey'] on this device only. This module
// never logs it; UI code must only ever display maskKey(key).

import { readItem, writeItem, removeItem, watchItem } from './storage.js';
import { createEmitter } from './util.js';

export const API_KEY_STORAGE_KEY = 'jarvis.apiKey';
export const DEV_API_BASE_KEY = 'jarvis.dev.apiBase';

const API_KEY_RE = /^sk-ant-[A-Za-z0-9_\-]{20,}$/;
const changes = createEmitter('api key');
let watching = false;

function watch() {
  if (watching) return;
  watching = true;
  watchItem(API_KEY_STORAGE_KEY, () => changes.emit(getApiKey() !== ''));
}

/** The saved API key, or '' when none is saved. */
export function getApiKey() {
  watch();
  const value = readItem(API_KEY_STORAGE_KEY);
  return typeof value === 'string' ? value.trim() : '';
}

/** True when a key is saved. */
export function hasApiKey() {
  return getApiKey() !== '';
}

/** Save the key (trimmed). An empty key clears it. Returns the saved key. */
export function setApiKey(key) {
  watch();
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) {
    clearApiKey();
    return '';
  }
  writeItem(API_KEY_STORAGE_KEY, k);
  changes.emit(true);
  return k;
}

/** Remove the saved key. */
export function clearApiKey() {
  watch();
  removeItem(API_KEY_STORAGE_KEY);
  changes.emit(false);
}

/** fn(hasKey) when the key is saved or removed (here or in another tab). Returns unsubscribe. */
export function onApiKeyChange(fn) {
  watch();
  return changes.on(fn);
}

/**
 * Display form of a key: first 7 characters + "…" + last 4 ("sk-ant-…WXYZ").
 * Strings too short to mask safely are shown as "…" only, so a mask never reveals a whole key.
 */
export function maskKey(key) {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) return '';
  if (k.length < 20) return '…';
  return `${k.slice(0, 7)}…${k.slice(-4)}`;
}

/** Shape check for an Anthropic API key (it does not prove the key works). */
export function looksLikeApiKey(key) {
  return typeof key === 'string' && API_KEY_RE.test(key.trim());
}

/**
 * The API base override for tests: localStorage['jarvis.dev.apiBase'], honored only
 * when it is this page's own origin or its host is localhost / 127.0.0.1 (SPEC §2).
 * Never read from the URL. Returns the override's origin, or '' when not allowed.
 */
export function getDevApiBase() {
  const raw = readItem(DEV_API_BASE_KEY);
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value || value.length > 2048) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.username || url.password) return '';
  let here = '';
  try {
    here = globalThis.location ? globalThis.location.origin : '';
  } catch {
    here = '';
  }
  const sameOrigin = !!here && here !== 'null' && url.origin === here;
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return sameOrigin || loopback ? url.origin : '';
}
