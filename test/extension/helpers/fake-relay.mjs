// A fake of the home base's relay (Core 1.3.0, wire v1) for Jarvis for Chrome's tests, and a fake
// Jarvis (the web app's end of the link) that speaks the envelope from Node.
//
//   const relay = createFakeRelay({ waitScaleMs });   // in memory, like Core: 50 a box, 2 minutes
//   relay.handle({ method, path, query, body })       -> Promise<{ status, json, headers? }>
//   relay.fetch                                       an in-process fetch for unit tests
//   relay.serve(req, res, bodyText)                   for the E2E test server (http)
//   relay.down = true                                 the home base can't be reached (fetch fails)
//   relay.put(box, msg)                               a message as it is, again (the tests' replays)
//   relay.requests                                    what was asked: { method, path, query, at }
//
// Unlike Core, which keeps a repeated id once, this fake keeps every copy: the extension's own replay
// protection is what the tests check (a home base that misbehaves must not get a message taken twice).
//
//   const app = await createAppPeer({ relay, key });  Jarvis: app.request(kind, body) -> its reply,
//   app.post(kind, body), app.received (everything the extension sent, opened), app.waitFor(fn)
//
// The routes, as SPEC §32 / wire-v1:
//   POST /api/relay/to-ext | /api/relay/to-app   { id, iv, ct } (≤ 24 KB)   -> { ok: true }
//   GET  /api/relay/<box>?after=<id>&wait=<s>    -> { messages: [{ id, iv, ct }], last }
//   GET  /api/relay/status                       -> { extSeenAt, appSeenAt }

import { BOX_TO_APP, BOX_TO_EXT, SeenIds, importLinkKey, randomB64u, seal, toB64u, unseal } from '../../../extension/src/background/envelope.js';

export const BOX_MAX = 50;
export const LIFE_MS = 2 * 60 * 1000;
const B64U = /^[A-Za-z0-9_-]+$/;

/** A fresh link key (32 bytes, base64url). */
export const newLinkKey = () => toB64u(globalThis.crypto.getRandomValues(new Uint8Array(32)));

/** A link code as the app makes it: base64url(JSON.stringify({ v: 1, core, key })). */
export function linkCode({ core, key }) {
  return Buffer.from(JSON.stringify({ v: 1, core, key }), 'utf8').toString('base64url');
}

export function createFakeRelay({ waitScaleMs = 1000, now = () => Date.now() } = {}) {
  const boxes = { [BOX_TO_EXT]: [], [BOX_TO_APP]: [] };
  const waiters = { [BOX_TO_EXT]: new Set(), [BOX_TO_APP]: new Set() };
  const seen = { extSeenAt: null, appSeenAt: null };
  const relay = {
    boxes,
    requests: [],
    down: false, // fetch fails as if the home base were unreachable
    hang: false, // requests never answer (until down/hang is cleared or the caller gives up)
    refuseReads: false, // GET of to-ext answers 429 (a flooded box), while posts still go in
    failPosts: false, // POSTs to to-app fail as if the connection dropped (the extension's messages can't get out)
    seen,
    reset() {
      boxes[BOX_TO_EXT].length = 0;
      boxes[BOX_TO_APP].length = 0;
      relay.requests.length = 0;
      seen.extSeenAt = seen.appSeenAt = null;
      relay.down = relay.hang = false;
    },
    /** Puts a raw { id, iv, ct } in a box (the E2E's replay: the same message again). */
    put(box, msg) {
      prune(box);
      boxes[box].push({ ...msg, at: now() });
      while (boxes[box].length > BOX_MAX) boxes[box].shift();
      for (const w of waiters[box]) w();
    },
    async handle({ method, path, query = {}, body = null }) {
      relay.requests.push({ method, path, query, at: now() });
      const m = /^\/api\/relay\/(to-ext|to-app|status)$/.exec(path);
      if (!m) return { status: 404, json: { error: 'not found' } };
      const box = m[1];
      if (box === 'status') {
        if (method !== 'GET') return { status: 405, json: {} };
        return { status: 200, json: { ...seen } };
      }
      if (method === 'POST') {
        const raw = typeof body === 'string' ? body : JSON.stringify(body ?? null);
        if (raw.length > 24 * 1024) return { status: 413, json: { error: 'too big' } };
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch {
          return { status: 400, json: { error: 'bad' } };
        }
        const okField = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && B64U.test(v);
        if (!msg || typeof msg !== 'object' || !okField(msg.id, 64) || !okField(msg.iv, 64) || !okField(msg.ct, 24 * 1024)) return { status: 400, json: { error: 'bad' } };
        relay.put(box, { id: msg.id, iv: msg.iv, ct: msg.ct });
        return { status: 200, json: { ok: true } };
      }
      if (method !== 'GET') return { status: 405, json: {} };
      if (relay.refuseReads && box === BOX_TO_EXT) return { status: 429, json: { error: 'rate_limited' } };
      if (box === BOX_TO_EXT) seen.extSeenAt = now();
      else seen.appSeenAt = now();
      const after = typeof query.after === 'string' ? query.after : '';
      const wait = Math.max(0, Math.min(25, Number(query.wait) || 0));
      const pick = () => {
        prune(box);
        const list = boxes[box];
        const i = after ? list.findIndex((x) => x.id === after) : -1;
        return i >= 0 ? list.slice(i + 1) : list.slice();
      };
      let out = pick();
      if (!out.length && wait > 0) {
        await new Promise((resolve) => {
          const done = () => {
            clearTimeout(timer);
            waiters[box].delete(done);
            resolve();
          };
          const timer = setTimeout(done, wait * waitScaleMs);
          waiters[box].add(done);
        });
        out = pick();
        if (box === BOX_TO_EXT) seen.extSeenAt = now();
        else seen.appSeenAt = now();
      }
      const list = boxes[box];
      return { status: 200, json: { messages: out.map(({ id, iv, ct }) => ({ id, iv, ct })), last: list.length ? list[list.length - 1].id : after || null } };
    },
    /** An in-process fetch: `<origin>/api/relay/...`. */
    async fetch(url, init = {}) {
      if (init.signal?.aborted) throw abortErr();
      if (relay.down) throw new TypeError('Failed to fetch');
      if (relay.failPosts && (init.method || 'GET') === 'POST' && String(url).includes('/api/relay/to-app')) throw new TypeError('Failed to fetch');
      if (relay.hang) {
        await new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(abortErr()), { once: true }));
      }
      const u = new URL(url);
      const res = await Promise.race([
        relay.handle({ method: init.method || 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ?? null }),
        new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(abortErr()), { once: true })),
      ]);
      if (relay.down) throw new TypeError('Failed to fetch');
      return { ok: res.status >= 200 && res.status < 300, status: res.status, headers: { get: () => null }, json: async () => res.json, text: async () => JSON.stringify(res.json ?? null) };
    },
    /** For an http server: answers one request (CORS as Core does for /api/relay/*). */
    async serve(req, res, bodyText) {
      const origin = String(req.headers.origin || '');
      const cors = origin ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-allow-private-network': 'true', vary: 'Origin' } : {};
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors).end();
        return;
      }
      if (relay.down) {
        req.socket.destroy();
        return;
      }
      if (relay.hang) return; // never answers; the client gives up
      const u = new URL(req.url, 'http://relay.local');
      const out = await relay.handle({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: bodyText || null });
      if (relay.down) {
        req.socket.destroy();
        return;
      }
      res.writeHead(out.status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors });
      res.end(JSON.stringify(out.json));
    },
  };
  function prune(box) {
    const t = now();
    const list = boxes[box];
    while (list.length && t - list[0].at > LIFE_MS) list.shift();
  }
  return relay;
}

function abortErr() {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

/**
 * Jarvis's end of the link, from Node: sends sealed requests to `to-ext` and reads `to-app`
 * (a loop of short polls while `start()`ed). `received`: every message the extension sent, opened.
 */
export async function createAppPeer({ relay, key, now = () => Date.now(), pollMs = 20 }) {
  const cryptoKey = await importLinkKey(key);
  const seen = new SeenIds();
  const peer = {
    received: [],
    sent: [], // { kind, body, msg } the raw envelopes, for replays
    after: '',
    on: false,
    async post(kind, body = {}, { at = now() } = {}) {
      const msg = await seal(cryptoKey, { box: BOX_TO_EXT, kind, body, at });
      peer.sent.push({ kind, body, msg });
      const res = await relay.handle({ method: 'POST', path: '/api/relay/to-ext', body: JSON.stringify(msg) });
      if (res.status !== 200) throw new Error(`post ${kind}: ${res.status}`);
      return msg;
    },
    /** Posts a request and waits for the extension's reply to it. */
    async request(kind, body = {}, { timeoutMs = 10000 } = {}) {
      const msg = await peer.post(kind, body);
      const reply = await peer.waitFor((m) => m.kind === 'reply' && m.body.re === msg.id, { timeoutMs, what: `the reply to ${kind}` });
      return reply.body;
    },
    async poll() {
      const res = await relay.handle({ method: 'GET', path: '/api/relay/to-app', query: { ...(peer.after ? { after: peer.after } : {}), wait: '0' } });
      if (res.status !== 200) return;
      for (const m of res.json.messages) {
        const out = await unseal(cryptoKey, { box: BOX_TO_APP, msg: m, now: now(), seen });
        if (out.ok) peer.received.push(out.message);
      }
      if (res.json.last) peer.after = res.json.last;
    },
    start() {
      if (peer.on) return;
      peer.on = true;
      (async () => {
        while (peer.on) {
          await peer.poll().catch(() => {});
          await new Promise((r) => setTimeout(r, pollMs));
        }
      })();
    },
    stop() {
      peer.on = false;
    },
    async waitFor(fn, { timeoutMs = 10000, what = 'a message' } = {}) {
      const end = Date.now() + timeoutMs;
      for (;;) {
        await peer.poll().catch(() => {});
        const hit = peer.received.find(fn);
        if (hit) return hit;
        if (Date.now() > end) throw new Error(`timed out waiting for ${what} (got: ${peer.received.map((m) => m.kind).join(', ')})`);
        await new Promise((r) => setTimeout(r, pollMs));
      }
    },
    of: (kind) => peer.received.filter((m) => m.kind === kind),
    randomId: () => randomB64u(16),
  };
  return peer;
}
