// STAND-IN (Track U, v8.0 build only). The real module is Track E's src/lib/live-view.js: the
// integrator replaces this file with it. It follows the contract in the v8.0 brief, names and
// shapes exactly, so the UI and its tests run before Track E lands. Nothing else here is
// load-bearing.
//
// Live view, the pure part (no DOM): the defaults, the $1-an-hour budget over a rolling hour
// (persisted, shared by every tab through its storage), the cost estimate of one look, the cadence
// (one look a second, one every 5 s from 90 cents, back-off after a rate limit), the speak gate and
// the meter's words.

import { formatUsd, imageTokens } from './optics.js';
import { priceOf } from '../engine/models.js';

export const LIVE_DEFAULTS = Object.freeze({
  model: 'claude-haiku-5-5',
  maxEdge: 640,
  quality: 0.75,
  intervalMs: 1000,
  slowIntervalMs: 5000,
  slowFromUsd: 0.9,
  capUsd: 1,
  windowMs: 3600000,
  sessionMs: 3600000,
  speakGapMs: 15000,
  saidKept: 5,
  backoffStartMs: 2000,
  backoffMaxMs: 30000,
});

const EPS = 1e-9;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN);

/**
 * The spending of the last `windowMs` (default an hour) in `storage` under `key`: entries
 * [{ t, usd }]. Corrupt storage reads as empty; an entry it can't parse is skipped (never read as
 * a negative amount, which would allow more).
 */
export function createLiveBudget({ capUsd = LIVE_DEFAULTS.capUsd, windowMs = LIVE_DEFAULTS.windowMs, now = () => Date.now(), storage = null, key = 'jarvis.liveView.spend' } = {}) {
  let entries = [];
  const clock = () => {
    const t = Number(now());
    return Number.isFinite(t) ? t : Date.now();
  };
  function read() {
    let raw = null;
    try {
      raw = storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null;
    } catch {
      raw = null;
    }
    let list = [];
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      list = Array.isArray(parsed) ? parsed : [];
    } catch {
      list = [];
    }
    entries = list
      .map((e) => ({ t: num(e && e.t), usd: num(e && e.usd) }))
      .filter((e) => Number.isFinite(e.t) && Number.isFinite(e.usd) && e.usd > 0)
      .sort((a, b) => a.t - b.t);
    prune();
  }
  function prune() {
    const from = clock() - windowMs;
    entries = entries.filter((e) => e.t > from);
  }
  function write() {
    try {
      if (storage && typeof storage.setItem === 'function') storage.setItem(key, JSON.stringify(entries.map((e) => ({ t: Math.round(e.t), usd: Math.round(e.usd * 1e8) / 1e8 }))));
    } catch {
      /* storage full or blocked: this tab still counts */
    }
  }
  read();
  const api = {
    spent() {
      prune();
      return entries.reduce((s, e) => s + e.usd, 0);
    },
    canSpend(usd) {
      const v = Math.max(0, Number(usd) || 0);
      return api.spent() + v <= capUsd + EPS;
    },
    add(usd) {
      const v = Number(usd);
      if (!Number.isFinite(v) || v <= 0) return api.spent();
      read(); // another tab may have spent meanwhile
      entries.push({ t: clock(), usd: v });
      prune();
      write();
      return api.spent();
    },
    /** When canSpend(usd) becomes true (ms since the epoch): now when it already is. */
    resumeAt(usd) {
      const v = Math.max(0, Number(usd) || 0);
      const t0 = clock();
      prune();
      let total = entries.reduce((s, e) => s + e.usd, 0);
      if (total + v <= capUsd + EPS) return t0;
      for (const e of entries) {
        total -= e.usd;
        if (total + v <= capUsd + EPS) return e.t + windowMs;
      }
      return t0 + windowMs;
    },
    reload() {
      read();
      return api.spent();
    },
  };
  return api;
}

/** About what one live look costs (USD): the frame, the short system prompt and context, a small JSON answer. */
export function estimateLiveLookUsd({ model = LIVE_DEFAULTS.model, width = 640, height = 360, summaryChars = 0, saidChars = 0 } = {}) {
  const p = priceOf(model);
  // Haiku 5.5's tokenizer counts text about 30% higher than older models.
  const textTokens = Math.ceil(((Number(summaryChars) || 0) + (Number(saidChars) || 0)) / 4 * 1.3) + 60;
  const input = 420 + textTokens + imageTokens(width, height);
  const output = 90;
  return (input * p.inPerM + output * p.outPerM) / 1e6;
}

/** ms until the next look may start: 1 s after the last one started (5 s from 90 cents), after any back-off. */
export function nextLiveDelay({ lastStartAt = 0, now = Date.now(), spentUsd = 0, backoffUntil = 0 } = {}) {
  const interval = (Number(spentUsd) || 0) >= LIVE_DEFAULTS.slowFromUsd - EPS ? LIVE_DEFAULTS.slowIntervalMs : LIVE_DEFAULTS.intervalMs;
  const base = lastStartAt ? Math.max(0, lastStartAt + interval - now) : 0;
  const wait = backoffUntil && backoffUntil > now ? backoffUntil - now : 0;
  return Math.max(base, wait);
}

/** The wait after a 429 or 529: retry-after when the API gave one, else 2 s doubling up to 30 s. */
export function liveBackoff(prevMs, retryAfterMs) {
  const ra = Number(retryAfterMs);
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra, LIVE_DEFAULTS.backoffMaxMs * 4);
  const prev = Number(prevMs);
  if (!Number.isFinite(prev) || prev <= 0) return LIVE_DEFAULTS.backoffStartMs;
  return Math.min(LIVE_DEFAULTS.backoffMaxMs, prev * 2);
}

/** A worth-saying line may be spoken: nobody talking and at least 15 s since the last spoken one. */
export function canSpeakLive({ lastSpokenAt = 0, now = Date.now(), ownerSpeaking = false, jarvisSpeaking = false } = {}) {
  if (ownerSpeaking || jarvisSpeaking) return false;
  return !lastSpokenAt || now - lastSpokenAt >= LIVE_DEFAULTS.speakGapMs;
}

/** "LIVE VIEW · 12 min · 9¢ this hour · limit $1" */
export function liveMeterText({ elapsedMs = 0, spentUsd = 0, capUsd = LIVE_DEFAULTS.capUsd } = {}) {
  const min = Math.max(0, Math.floor((Number(elapsedMs) || 0) / 60000));
  const cap = Number(capUsd) || LIVE_DEFAULTS.capUsd;
  const limit = cap >= 1 && Number.isInteger(cap) ? `$${cap}` : formatUsd(cap);
  return `LIVE VIEW · ${min} min · ${formatUsd(spentUsd)} this hour · limit ${limit}`;
}
