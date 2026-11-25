// The home base's HTTP client (v7.5, SPEC §23): the Jarvis Core's API over Tailscale.
//
//   getHomeBaseStatus(base)   GET  api/status -> { ok: true, data } | failure
//   testHomeBase(base)        GET  api/info, then api/status -> { ok: true, host, version, level, summary } | failure
//   askHomeBase(base, q)      POST api/ask {q} -> { ok: true, answer, intent, suggestions } | failure
//   requestHomeBase(base, path, { method, body, timeoutMs, fetchImpl, signal })
//
// A failure is { ok: false, kind, status?, code?, message? } with kind 'unreachable' | 'down' |
// 'refused' | 'starting' | 'rate' | 'notcore' | 'http' | 'aborted' (src/lib/homebase.js
// failureState() words it). Every request: credentials omitted, no referrer, never cached, a timeout.
// The Core allows this app's origin (CORS), its refusals (403) included, so "refused" is only ever a
// readable 403 that says why. A request the browser can't read (a TypeError) is told apart by a
// no-cors ping: an (opaque) answer means the Alienware answered but the Core didn't ('down': Tailscale
// serve answers 502 without CORS headers while the Core is stopped, restarting or still starting);
// no answer means it can't be reached at all ('unreachable': Tailscale off, the machine asleep or off).
// Asking the home base is free: the Core answers from its own rules, never Claude.

import { homeBaseApi, cleanLine, ASK_MAX_CHARS } from '../lib/homebase.js';

const STATUS_TIMEOUT_MS = 10000;
const ASK_TIMEOUT_MS = 12000;
const PROBE_TIMEOUT_MS = 5000;
const MAX_BODY_CHARS = 512 * 1024; // a status is ~12 KB

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function fetchOf(fetchImpl) {
  const f = fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  if (!f) throw new Error('fetch is not available');
  return f;
}

/** A timeout that also follows an outside signal. */
function deadline(ms, outer) {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, ms);
  const onAbort = () => ctl.abort();
  if (outer) {
    if (outer.aborted) ctl.abort();
    else outer.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctl.signal,
    timedOut: () => timedOut,
    done() {
      clearTimeout(timer);
      if (outer) outer.removeEventListener('abort', onAbort);
    },
  };
}

/** Is anything answering at the home base? (a no-cors ping: an opaque answer is enough) */
async function answersAtAll(base, f) {
  const d = deadline(PROBE_TIMEOUT_MS);
  try {
    await f(homeBaseApi(base, 'ping'), { mode: 'no-cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: d.signal });
    return true;
  } catch {
    return false;
  } finally {
    d.done();
  }
}

/**
 * One request to the home base: { ok: true, data } (the JSON answer) or a failure (see the header).
 * `base` is a stored address ('https://<host>.ts.net/').
 */
export async function requestHomeBase(base, path, { method = 'GET', body, timeoutMs = STATUS_TIMEOUT_MS, fetchImpl, signal } = {}) {
  const f = fetchOf(fetchImpl);
  const d = deadline(timeoutMs, signal);
  const init = { method, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', mode: 'cors', signal: d.signal };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let res;
  let text = '';
  try {
    res = await f(homeBaseApi(base, path), init);
    text = await res.text();
  } catch {
    const timedOut = d.timedOut();
    d.done();
    if (signal && signal.aborted) return { ok: false, kind: 'aborted' };
    if (timedOut || res) return { ok: false, kind: 'unreachable' }; // no answer in time (or the answer stopped halfway)
    return { ok: false, kind: (await answersAtAll(base, f)) ? 'down' : 'unreachable' };
  }
  d.done();
  let data = null;
  if (text && text.length <= MAX_BODY_CHARS) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  const status = res.status;
  const code = isObj(data) && typeof data.error === 'string' ? cleanLine(data.error, 40) : undefined;
  const message = isObj(data) && typeof data.message === 'string' ? cleanLine(data.message, 160) : undefined;
  if (status === 403) return { ok: false, kind: 'refused', status, code, message };
  if (status === 503 && code === 'starting') return { ok: false, kind: 'starting', status, code, message };
  if (status === 429) return { ok: false, kind: 'rate', status, code, message };
  if (status < 200 || status > 299) return { ok: false, kind: 'http', status, code, message };
  if (!isObj(data)) return { ok: false, kind: 'notcore', status };
  return { ok: true, data };
}

/** GET api/status: the Core's full snapshot (src/lib/homebase.js homeBaseView() reads it). */
export function getHomeBaseStatus(base, opts = {}) {
  return requestHomeBase(base, 'status', opts);
}

/**
 * Settings → Home base → Test: api/info (the host name and the Core's version), then api/status
 * (its health). { ok: true, host, version, level, summary } or a failure.
 */
export async function testHomeBase(base, opts = {}) {
  const info = await requestHomeBase(base, 'info', opts);
  if (!info.ok) return info;
  const i = info.data;
  if (i.name !== 'jarvis-core') return { ok: false, kind: 'notcore', status: 200 };
  const st = await requestHomeBase(base, 'status', opts);
  const health = st.ok && isObj(st.data.health) ? st.data.health : null;
  return {
    ok: true,
    host: cleanLine(i.hostname, 64),
    version: cleanLine(i.version, 24),
    level: health && ['ok', 'warn', 'alert'].includes(health.level) ? health.level : null,
    summary: health ? cleanLine(health.summary, 220) : '',
    healthError: st.ok ? null : st,
  };
}

/**
 * POST api/ask {q}: the Core's own status assistant answers (rules on the Core: free, no Claude).
 * { ok: true, answer, intent, suggestions } or a failure ('empty' for an empty question).
 */
export async function askHomeBase(base, question, opts = {}) {
  const q = typeof question === 'string' ? question.replace(/\s+/g, ' ').trim().slice(0, ASK_MAX_CHARS) : '';
  if (!q) return { ok: false, kind: 'empty' };
  const r = await requestHomeBase(base, 'ask', { method: 'POST', body: { q }, timeoutMs: ASK_TIMEOUT_MS, ...opts });
  if (!r.ok) return r;
  const answer = cleanLine(r.data.answer, 1200);
  if (!answer) return { ok: false, kind: 'notcore', status: 200 };
  const suggestions = Array.isArray(r.data.suggestions) ? r.data.suggestions.map((s) => cleanLine(s, 40)).filter(Boolean).slice(0, 3) : [];
  return { ok: true, answer, intent: cleanLine(r.data.intent, 40), suggestions };
}
