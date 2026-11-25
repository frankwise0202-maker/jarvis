// A fake Jarvis Core (the home base, v7.5) for the E2E suite (scenarios with `fakeCore: true`): the
// Core's API at https://alienware.tail4e5f6a.ts.net/ answered through context.route() with the
// real-format JSON captured from the Core's own fixture server (test/unit/fixtures/homebase/; the
// handoff's §3 status, §7 ask, §8 info), so nothing reaches the network and that origin is not a
// third-party request for the guard. Like the real Core it echoes an allowed Origin (the app's) in
// Access-Control-Allow-Origin.
//
// t.core (the newest context's): { mode, delayMs, requests: ['GET /api/status', …], asks: [q, …] }.
// Set t.core.mode to change what it answers next (t.core.delayMs: how long each answer takes):
//   'ok' | 'warn' | 'alert' | 'nogpu' | 'offline'   that scenario's status, info and answers
//   'unreachable'                                    no answer at all (Tailscale off on this device)
//   'down'                                           Tailscale serve's 502 while the Core is stopped or
//                                                    restarting: no CORS headers, so the page can't read it
//   'refused'                                        403 origin_not_allowed (the Core refuses this page;
//                                                    readable: the Core sends CORS headers on its 403s)
//   'starting'                                       503 starting

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'unit', 'fixtures', 'homebase');
export const CORE_HOST = 'alienware.tail4e5f6a.ts.net';
export const CORE_URL = `https://${CORE_HOST}/`;
export const CORE_ORIGIN = `https://${CORE_HOST}`;
export const CORE_SCENARIOS = ['ok', 'warn', 'alert', 'nogpu', 'offline'];

const read = (name) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
let cache = null;
/** The captured answers: { status: { ok: {...}, … }, info, ask: { ok: { 'How are you?': {...} } } }. */
export function coreFixtures() {
  if (!cache) {
    const status = {};
    for (const s of CORE_SCENARIOS) status[s] = read(`status-${s}.json`);
    cache = { status, info: read('info.json'), ask: read('ask.json') };
  }
  return cache;
}

/** The captured question closest to `q` (the Core's own intents, roughly). */
export function fixtureQuestion(q) {
  const s = String(q || '').toLowerCase();
  if (/status|report|summary/.test(s)) return 'home base status';
  if (/wrong|problem|warning|issue/.test(s)) return 'Anything wrong?';
  if (/gpu|graphics|nvidia|vram/.test(s)) return 'GPU temp?';
  if (/how (?:are|r) (?:you|u)|you good|how'?s the home ?base|how is the home ?base|home ?base/.test(s)) return 'How are you?';
  return 'what is the weather';
}

export async function routeFakeCore(context, { mode = 'ok', delayMs = 0 } = {}) {
  const fx = coreFixtures();
  const state = { mode, delayMs, requests: [], asks: [] };
  await context.route(`${CORE_ORIGIN}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    state.requests.push(`${req.method()} ${url.pathname}`);
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    if (state.mode === 'unreachable') return route.abort('internetdisconnected');
    const origin = req.headers().origin;
    // Tailscale serve with the Core stopped: 502 and an empty body, without CORS headers. (Playwright
    // adds Access-Control-Allow-Origin to a fulfilled CORS request that has none, so another origin
    // stands in for "none": the page can't read it either way; the no-cors ping gets an opaque answer.)
    if (state.mode === 'down') return route.fulfill({ status: 502, headers: { 'access-control-allow-origin': 'https://login.tailscale.com', 'cache-control': 'no-store' }, body: '' });
    const cors = origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    const json = (status, body, extra = {}) =>
      route.fulfill({ status, contentType: 'application/json; charset=utf-8', headers: { ...cors, 'cache-control': 'no-store', ...extra }, body: JSON.stringify(body) });
    if (state.mode === 'refused') return json(403, { error: 'origin_not_allowed', message: `origin ${origin || '(none)'} is not allowed` });
    if (state.mode === 'starting') return json(503, { error: 'starting', message: 'the Core is starting, try again in a second' }, { 'retry-after': '1' });
    const scenario = CORE_SCENARIOS.includes(state.mode) ? state.mode : 'ok';
    switch (url.pathname) {
      case '/api/status':
        return json(200, fx.status[scenario]);
      case '/api/info':
        return json(200, { ...fx.info, scenario });
      case '/api/ping':
        return json(200, { ok: true, t: fx.status[scenario].t, level: fx.status[scenario].health.level });
      case '/api/ask': {
        if (req.method() !== 'POST') return json(405, { error: 'method_not_allowed', message: 'use POST with {"q": "..."}' });
        let q = '';
        try {
          q = JSON.parse(req.postData() || '{}').q;
        } catch {
          return json(400, { error: 'bad_json', message: 'the body is not valid JSON' });
        }
        if (typeof q !== 'string' || !q.trim()) return json(400, { error: 'empty_question', message: 'the question is empty' });
        state.asks.push(q);
        return json(200, fx.ask[scenario][fixtureQuestion(q)]);
      }
      default:
        return json(404, { error: 'not_found', message: `no such endpoint: ${url.pathname}` });
    }
  });
  return state;
}
