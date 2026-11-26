// Jarvis for Chrome's relay (Core 1.3.0, SPEC §32.1, wire v1): two boxes of sealed messages between the Jarvis
// app (in the owner's usual Chrome profile) and Jarvis for Chrome (in its own "Jarvis" profile), which can't talk
// to each other directly. The home base only holds the messages: each is sealed (AES-GCM-256) with a key only
// the two ends have, so the Core can't read them. They live in memory only: never logged, never on disk, at most
// 50 a box, each for 2 minutes.
//
//   POST /api/relay/to-ext | /api/relay/to-app   body { id, iv, ct } (JSON, at most 24 KB)  → 200 { ok: true }
//        400 bad_json / bad_envelope · 413 too_large · 415 unsupported_type · 429 rate_limited
//        (the same id again is accepted and kept once: a sender may retry)
//   GET  /api/relay/to-ext | /api/relay/to-app ?after=<id>&wait=<0-25>
//        → 200 { messages: [{ id, iv, ct }], last }: the messages after `after` (all held ones when `after` is
//        missing or no longer held), oldest first; `last` is the newest id held (or `after` when none is). With
//        nothing to send it waits up to `wait` seconds (default 0) for a message, then answers messages: [].
//   GET  /api/relay/status → 200 { extSeenAt, appSeenAt }: when each side last read its box (ms since 1970, or
//        null); a read waiting right now counts as now. Reading to-ext counts as Jarvis for Chrome, to-app as the app.
//   120 requests a minute per box (both methods) and for the status, for each client (its Tailscale login and its
//   Origin): one client can't use up another's. The relay's requests never take from the API's general limit
//   (server.mjs), so relay traffic can't starve speak, hear, sync or the brain (REDTEAM-LINK-2).
//   At most 8 reads wait on a box at once, 4 of them from one client. A long poll that finds them taken (and
//   nothing to read) is refused with 429 busy and Retry-After, never answered at once: an answer at once made a
//   reader that loops right away spin (REDTEAM-LINK-2). A short read (wait=0) is never refused for this.
//
// The access check (the tailnet or this computer) and the origin rule run first, in server.mjs: for these routes
// only, access.mjs checkRelayOrigin also allows chrome-extension:// origins. The shape is checked on the strings'
// lengths and alphabet; the Core never decodes or decrypts anything, and nothing here logs.

import { createRateLimiter } from './ratelimit.mjs';

export const RELAY_BOXES = Object.freeze(['to-ext', 'to-app']);
export const RELAY_BODY_BYTES = 24 * 1024;
export const RELAY_MAX_MESSAGES = 50;
export const RELAY_TTL_MS = 2 * 60_000;
export const RELAY_WAIT_MAX_S = 25;
export const RELAY_PER_MINUTE = 120;
export const RELAY_MAX_WAITERS = 8; // long polls waiting on one box at once (more are refused: 429 busy)
export const RELAY_MAX_WAITERS_PER_CLIENT = 4; // of them, from one client (its login and Origin)
export const RELAY_BUSY_RETRY_S = 2; // Retry-After for a long poll refused because the box's places are taken
const SWEEP_MS = 10_000;

// The envelope's sizes (src/lib/relay-envelope.js): id 16 bytes, iv 12 bytes, ct = a plaintext of at most
// 16,384 bytes plus the 16-byte tag, all base64url without padding.
const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const IV_RE = /^[A-Za-z0-9_-]{16}$/;
const CT_RE = /^[A-Za-z0-9_-]+$/;
export const CT_MIN_CHARS = 24;
export const CT_MAX_CHARS = 21867;

const ROUTE_RE = /^\/api\/relay\/(to-ext|to-app|status)$/;

/** True for the relay's routes (a trailing slash is ignored, as for every route). */
export function isRelayRoute(pathname) {
  return ROUTE_RE.test(String(pathname ?? '').replace(/\/+$/, ''));
}

/** Exactly { id, iv, ct } of the envelope's lengths and alphabet (checked before anything else looks at it). */
export function isRelayEnvelope(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const own = (k) => Object.prototype.hasOwnProperty.call(value, k);
  if (Object.keys(value).length !== 3 || !own('id') || !own('iv') || !own('ct')) return false;
  const { id, iv, ct } = value;
  if (typeof id !== 'string' || typeof iv !== 'string' || typeof ct !== 'string') return false;
  if (ct.length < CT_MIN_CHARS || ct.length > CT_MAX_CHARS || ct.length % 4 === 1) return false;
  return ID_RE.test(id) && IV_RE.test(iv) && CT_RE.test(ct);
}

/**
 * The two boxes, in memory. post(box, envelope) → { stored }; read(box, after) → { messages, last } (marks the
 * box read now); wait(box, after, ms, signal) → Promise of the same, after a message arrives or `ms` pass;
 * status() → { extSeenAt, appSeenAt }; sweep() drops expired messages; close() answers every waiting read and
 * forgets everything.
 */
export function createRelayStore({ now = () => Date.now(), maxMessages = RELAY_MAX_MESSAGES, ttlMs = RELAY_TTL_MS, maxWaiters = RELAY_MAX_WAITERS, maxWaitersPerClient = RELAY_MAX_WAITERS_PER_CLIENT } = {}) {
  const boxes = new Map(RELAY_BOXES.map((name) => [name, { messages: [], seenAt: null, waiters: new Set() }]));
  const box = (name) => {
    const b = boxes.get(name);
    if (!b) throw new TypeError('no such box');
    return b;
  };

  function prune(b, t) {
    while (b.messages.length && t - b.messages[0].t >= ttlMs) b.messages.shift();
    while (b.messages.length > maxMessages) b.messages.shift();
  }

  function after(b, id) {
    const i = id ? b.messages.findIndex((m) => m.id === id) : -1;
    const list = i >= 0 ? b.messages.slice(i + 1) : b.messages;
    return {
      messages: list.map(({ id: mid, iv, ct }) => ({ id: mid, iv, ct })),
      last: b.messages.length ? b.messages[b.messages.length - 1].id : id || null,
    };
  }

  function read(name, afterId = null) {
    const b = box(name);
    const t = now();
    prune(b, t);
    b.seenAt = t;
    return after(b, afterId);
  }

  function post(name, env) {
    const b = box(name);
    const t = now();
    prune(b, t);
    if (b.messages.some((m) => m.id === env.id)) return { stored: false };
    b.messages.push(Object.freeze({ id: env.id, iv: env.iv, ct: env.ct, t }));
    prune(b, t);
    for (const w of Array.from(b.waiters)) w.wake();
    return { stored: true };
  }

  /** Whether a long poll from `client` would find a place to wait on `name` (8 a box, 4 a client). */
  function admits(name, client = null) {
    const b = box(name);
    if (b.waiters.size >= maxWaiters) return false;
    if (client === null || client === undefined) return true;
    let mine = 0;
    for (const w of b.waiters) if (w.client === client) mine += 1;
    return mine < maxWaitersPerClient;
  }

  /** How many messages a read after `afterId` would get now (marks nothing as read). */
  function pending(name, afterId = null) {
    const b = box(name);
    prune(b, now());
    return after(b, afterId).messages.length;
  }

  function wait(name, afterId = null, ms = 0, signal = null, client = null) {
    const first = read(name, afterId);
    const b = box(name);
    if (first.messages.length || ms <= 0 || !admits(name, client) || (signal && signal.aborted)) return Promise.resolve(first);
    return new Promise((resolve) => {
      let timer = null;
      const waiter = {
        client,
        wake() {
          const out = read(name, afterId);
          if (out.messages.length) finish(out);
        },
        stop() {
          finish(null);
        },
      };
      const onAbort = () => finish(null);
      function finish(out) {
        if (!b.waiters.delete(waiter)) return;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(out ?? read(name, afterId));
      }
      b.waiters.add(waiter);
      timer = setTimeout(() => finish(null), ms);
      timer.unref?.();
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function status() {
    const t = now();
    const seen = (name) => {
      const b = boxes.get(name);
      return b.waiters.size ? t : b.seenAt;
    };
    return { extSeenAt: seen('to-ext'), appSeenAt: seen('to-app') };
  }

  function sweep() {
    const t = now();
    for (const b of boxes.values()) prune(b, t);
  }

  const sweeper = setInterval(sweep, SWEEP_MS);
  sweeper.unref?.();

  return {
    post,
    read,
    wait,
    admits,
    pending,
    status,
    sweep,
    /** How many messages and waiting reads each box holds (tests and the dashboard's counters; never the contents). */
    sizes() {
      return Object.fromEntries(Array.from(boxes, ([name, b]) => [name, { messages: b.messages.length, waiting: b.waiters.size }]));
    },
    /** Forget every message; every read still waiting gets its (empty) answer now, not after its timer. */
    close() {
      clearInterval(sweeper);
      for (const b of boxes.values()) {
        b.messages = [];
        for (const w of Array.from(b.waiters)) w.stop();
      }
    },
  };
}

/**
 * createRelayRoutes({ readBody, sendJson, HttpError, now, perMinute, store })
 *   → { handle(req, res, { route, url, cors }), store, close() } (only call handle when isRelayRoute(route)).
 */
export function createRelayRoutes({ readBody, sendJson, HttpError, now = () => Date.now(), perMinute = RELAY_PER_MINUTE, store = null, maxMessages, ttlMs } = {}) {
  const relay = store ?? createRelayStore({ now, maxMessages, ttlMs });
  // Its own buckets, one per box (and the status) per client: never the API's general limit (REDTEAM-LINK-2).
  const limiter = createRateLimiter({ capacity: perMinute, refillPerSec: perMinute / 60, maxKeys: 64, now });

  const take = (key, client) => {
    const r = limiter.take(`${key}|${client ?? ''}`);
    if (!r.ok) throw new HttpError(429, 'rate_limited', 'too many relay requests; slow down', { 'Retry-After': String(r.retryAfterSec) });
  };

  /** The query's after (an id) and wait (whole seconds, 0-25). */
  function readQuery(url) {
    const p = url.searchParams;
    const afterId = p.get('after');
    if (afterId !== null && afterId !== '' && !ID_RE.test(afterId)) throw new HttpError(400, 'bad_after', 'after must be a message id');
    const waitText = p.get('wait');
    let wait = 0;
    if (waitText !== null && waitText !== '') {
      if (!/^\d{1,2}$/.test(waitText) || Number(waitText) > RELAY_WAIT_MAX_S) throw new HttpError(400, 'bad_wait', `wait must be a whole number of seconds from 0 to ${RELAY_WAIT_MAX_S}`);
      wait = Number(waitText);
    }
    return { afterId: afterId || null, wait };
  }

  /**
   * client: who asks, for the per-client limits (server.mjs: the Tailscale login, or 'local', and the Origin).
   */
  async function handle(req, res, { route, url, cors = {}, client = null }) {
    const name = route.replace(/\/+$/, '').slice('/api/relay/'.length);
    const method = req.method;
    if (name === 'status') {
      if (method !== 'GET') throw new HttpError(405, 'method_not_allowed', `${method} is not supported here`, { Allow: 'GET, OPTIONS' });
      take('status', client);
      return sendJson(req, res, 200, relay.status(), cors);
    }
    if (method !== 'GET' && method !== 'POST') throw new HttpError(405, 'method_not_allowed', `${method} is not supported here`, { Allow: 'GET, POST, OPTIONS' });
    take(name, client);
    if (method === 'POST') {
      const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (type !== 'application/json') throw new HttpError(415, 'unsupported_type', 'send JSON: Content-Type: application/json');
      const text = await readBody(req, RELAY_BODY_BYTES);
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        // A fixed message: the parser's own error quotes the body.
        throw new HttpError(400, 'bad_json', 'the body is not valid JSON');
      }
      if (!isRelayEnvelope(body)) throw new HttpError(400, 'bad_envelope', 'send { id, iv, ct }: base64url strings of the envelope’s lengths');
      relay.post(name, body);
      return sendJson(req, res, 200, { ok: true }, cors);
    }
    const { afterId, wait } = readQuery(url);
    let out;
    // Every place to wait is taken and nothing waits to be read: refused, so a reader that loops can't spin.
    if (wait > 0 && !relay.admits(name, client) && relay.pending(name, afterId) === 0) {
      throw new HttpError(429, 'busy', 'too many reads are waiting on this box; try again in a moment', { 'Retry-After': String(RELAY_BUSY_RETRY_S) });
    }
    if (wait > 0) {
      const gone = new AbortController();
      const onClose = () => gone.abort();
      res.once('close', onClose);
      try {
        out = await relay.wait(name, afterId, wait * 1000, gone.signal, client);
      } finally {
        res.off('close', onClose);
      }
      if (gone.signal.aborted || res.destroyed || res.writableEnded) return undefined; // the reader hung up
    } else {
      out = relay.read(name, afterId);
    }
    return sendJson(req, res, 200, out, cors);
  }

  return {
    handle,
    store: relay,
    close() {
      relay.close();
    },
  };
}
