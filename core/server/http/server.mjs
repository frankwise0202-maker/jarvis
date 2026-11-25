// The HTTP API (JSON) and the dashboard's static files.
//
//   GET  /api/status                    the full snapshot with health { level, summary, items[] }
//   GET  /api/history?range=&series=&points=&agg=
//   GET  /api/events?limit=&since=&level=
//   GET  /api/stream                    Server-Sent Events: status, tick (every second), event
//   POST /api/ask      { q }            → { answer, facts, intent, suggestions }
//   GET  /api/info                      version, uptimes, Tailscale URL, settings the dashboard needs
//   GET  /api/ping                      liveness
//   GET  /api/fixture, POST /api/fixture { scenario }   fixture mode only: see or switch the scenario
//   /api/brain, /api/spend, /api/jobs, /api/watchers, /api/briefing, /api/push, /api/sync
//                                       the home base brain, push and sync: http/brain-routes.mjs
//   /api/senses, /api/hear, /api/speak  hearing and George's voice (opt-in): http/senses-routes.mjs
//   GET  /*                             static files (the dashboard)
//
// Every request passes the access check (http/access.mjs) and the origin check first. The SSE stream also
// carries the brain's events: job, watcher, briefing, spend.

import http from 'node:http';
import { checkAccess, checkOrigin, corsHeaders } from './access.mjs';
import { createRateLimiter } from './ratelimit.mjs';
import { createSseHub } from './sse.mjs';
import { createStatic } from './static.mjs';
import { RANGES, SERIES_NAMES } from '../history.mjs';
import { createBrainRoutes, isBrainRoute } from './brain-routes.mjs';
import { createSensesRoutes, isSensesRoute } from './senses-routes.mjs';
import { redact } from '../brain/util.mjs';

/** How long a request may take to arrive (headers and body); an upload to PUT /api/sync/* gets longer. */
export const REQUEST_RECEIVE_MS = 15_000;
export const SYNC_UPLOAD_MS = 10 * 60_000;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export const HTML_SECURITY_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'self' https://frankwise0202-maker.github.io",
  'Referrer-Policy': 'no-referrer',
};

class HttpError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function sendJson(req, res, status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const buf = Buffer.from(text);
  res.writeHead(status, { ...JSON_HEADERS, 'Content-Length': buf.length, ...headers });
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new HttpError(413, 'too_large', `the request body is larger than ${limit} bytes`));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(new HttpError(413, 'too_large', `the request body is larger than ${limit} bytes`));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    req.on('error', (err) => {
      if (!done) {
        done = true;
        reject(err);
      }
    });
  });
}

/**
 * createApiServer({ getCore, config, ask, info, fixture, log }) → { server, sse, listen(), close() }
 *   getCore()          the current core (fixture mode can swap it)
 *   ask(q, ctx)        the status assistant
 *   info(access)       the /api/info body
 *   fixture            { get(), set(name) } in fixture mode, else null
 */
export function createApiServer({ getCore, config, ask, info, fixture = null, log = () => {}, getBrain = () => null, getPush = () => null, getSync = () => null, getSenses = () => null }) {
  const limits = config.limits;
  const askLimiter = createRateLimiter({ capacity: limits.askBurst, refillPerSec: limits.askPerMinute / 60 });
  const apiLimiter = createRateLimiter({ capacity: limits.apiBurst, refillPerSec: limits.apiPerSecond });
  const sse = createSseHub({ maxClients: limits.sseClients });
  const statics = createStatic({ root: config.dashboardDir, securityHeaders: HTML_SECURITY_HEADERS });
  const counters = { requests: 0, refused: 0, errors: 0 };

  // ---- live updates to every SSE client
  let detach = [];
  function attach(core) {
    for (const off of detach) off();
    detach = [
      core.on('tick', () => sse.broadcast('tick', () => JSON.stringify(core.compact()))),
      core.on('status', (snap) => sse.broadcast('status', () => JSON.stringify(snap))),
      core.on('event', (ev) => sse.broadcast('event', () => JSON.stringify(ev), ev.id)),
    ];
  }
  attach(getCore());

  // ---- the brain's events (job, watcher, briefing, spend) to every SSE client
  const brainDetach = [];
  const brain = getBrain();
  if (brain?.on) {
    for (const name of ['job', 'watcher', 'briefing', 'spend']) brainDetach.push(brain.on(name, (payload) => sse.broadcast(name, () => redact(JSON.stringify(payload)))));
  }
  const brainRoutes = createBrainRoutes({ getBrain, getPush, getSync, readBody, sendJson, HttpError, log });
  const sensesRoutes = createSensesRoutes({ getSenses, readBody, sendJson, HttpError, log });

  function accessOptions() {
    // The port a direct request's Host must name: the one actually bound (tests listen on port 0).
    const address = server.address();
    return {
      tailscaleDnsName: getCore().snapshot?.services?.tailscale?.dnsName ?? null,
      tailscaleLogins: config.tailscaleLogins,
      port: address && typeof address === 'object' ? address.port : config.port,
    };
  }

  // ---- handlers
  async function handleApi(req, res, url, access, cors) {
    const route = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const core = getCore();

    if (route !== '/api/stream') {
      const r = apiLimiter.take(access.key);
      if (!r.ok) throw new HttpError(429, 'rate_limited', 'too many requests, slow down', { 'Retry-After': String(r.retryAfterSec) });
    }

    if (route === '/api/ping' && method === 'GET') return sendJson(req, res, 200, { ok: true, t: core.snapshot?.t ?? null, level: core.snapshot?.health?.level ?? null }, cors);

    if (route === '/api/status' && method === 'GET') {
      if (!core.snapshot) throw new HttpError(503, 'starting', 'the Core is starting, try again in a second', { 'Retry-After': '1' });
      return sendJson(req, res, 200, core.snapshot, cors);
    }

    if (route === '/api/history' && method === 'GET') {
      const range = url.searchParams.get('range') ?? '1h';
      if (!RANGES[range]) throw new HttpError(400, 'bad_range', `range must be one of ${Object.keys(RANGES).join(', ')}`);
      const seriesParam = url.searchParams.get('series');
      const series = seriesParam ? seriesParam.split(',').map((s) => s.trim()).filter(Boolean) : SERIES_NAMES;
      const unknown = series.filter((s) => !SERIES_NAMES.includes(s));
      if (unknown.length) throw new HttpError(400, 'bad_series', `unknown series: ${unknown.join(', ')} (known: ${SERIES_NAMES.join(', ')})`);
      const pointsParam = url.searchParams.get('points');
      let points = null;
      if (pointsParam !== null) {
        points = Number(pointsParam);
        if (!Number.isInteger(points) || points < 1 || points > 10080) throw new HttpError(400, 'bad_points', 'points must be a whole number from 1 to 10080');
      }
      const agg = url.searchParams.get('agg') ?? 'avg';
      if (agg !== 'avg' && agg !== 'max') throw new HttpError(400, 'bad_agg', 'agg must be avg or max');
      const now = core.snapshot?.t ?? core.clock.now();
      return sendJson(req, res, 200, core.history.query({ range, series, points, agg, now }), cors);
    }

    if (route === '/api/events' && method === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? 50);
      if (!Number.isFinite(limit) || limit < 1) throw new HttpError(400, 'bad_limit', 'limit must be a positive number');
      const sinceParam = url.searchParams.get('since');
      const sinceId = sinceParam === null ? null : Number(sinceParam);
      if (sinceId !== null && !Number.isFinite(sinceId)) throw new HttpError(400, 'bad_since', 'since must be an event id');
      const level = url.searchParams.get('level');
      if (level && !['ok', 'warn', 'alert', 'info'].includes(level)) throw new HttpError(400, 'bad_level', 'level must be ok, warn, alert or info');
      const list = core.events.list({ limit: Math.min(limit, limits.eventsMax), sinceId, level });
      return sendJson(req, res, 200, { events: list, total: core.events.size, latestId: core.events.latest?.id ?? null }, cors);
    }

    if (route === '/api/stream' && method === 'GET') {
      const snap = core.snapshot;
      const initial = [];
      if (snap) initial.push({ event: 'status', data: JSON.stringify(snap) });
      const lastId = Number(req.headers['last-event-id']);
      if (Number.isFinite(lastId)) {
        for (const ev of core.events.list({ limit: 50, sinceId: lastId }).reverse()) initial.push({ event: 'event', data: JSON.stringify(ev), id: ev.id });
      }
      const ok = sse.add(req, res, { headers: cors, initial });
      if (!ok) throw new HttpError(503, 'too_many_streams', 'too many live connections; close another dashboard', { 'Retry-After': '10' });
      return undefined;
    }

    if (route === '/api/ask') {
      if (method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'use POST with {"q": "..."}', { Allow: 'POST, OPTIONS' });
      const r = askLimiter.take(access.key);
      if (!r.ok) throw new HttpError(429, 'rate_limited', 'too many questions at once; try again in a moment', { 'Retry-After': String(r.retryAfterSec) });
      const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (type !== 'application/json') throw new HttpError(415, 'unsupported_type', 'send JSON: Content-Type: application/json');
      const text = await readBody(req, limits.askBodyBytes);
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new HttpError(400, 'bad_json', 'the body is not valid JSON');
      }
      const q = typeof body?.q === 'string' ? body.q.trim() : null;
      if (q === null) throw new HttpError(400, 'bad_question', 'send {"q": "your question"}');
      if (!q) throw new HttpError(400, 'empty_question', 'the question is empty');
      if (q.length > limits.questionChars) throw new HttpError(400, 'question_too_long', `questions can be up to ${limits.questionChars} characters`);
      return sendJson(req, res, 200, ask(q, { core, access }), cors);
    }

    if (route === '/api/info' && method === 'GET') return sendJson(req, res, 200, info(access), cors);

    if (route === '/api/fixture' && fixture) {
      if (method === 'GET') return sendJson(req, res, 200, fixture.get(), cors);
      if (method === 'POST') {
        const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (type !== 'application/json') throw new HttpError(415, 'unsupported_type', 'send JSON');
        let body;
        try {
          body = JSON.parse(await readBody(req, 1024));
        } catch (err) {
          if (err instanceof HttpError) throw err;
          throw new HttpError(400, 'bad_json', 'the body is not valid JSON');
        }
        const result = fixture.set(body?.scenario);
        if (!result.ok) throw new HttpError(400, 'bad_scenario', result.error);
        attach(getCore());
        sse.broadcast('status', () => JSON.stringify(getCore().snapshot));
        return sendJson(req, res, 200, fixture.get(), cors);
      }
    }

    if (isBrainRoute(route)) return brainRoutes.handle(req, res, { route, method, url, access, cors });
    if (isSensesRoute(route)) return sensesRoutes.handle(req, res, { route, method, url, access, cors });

    const known = ['/api/ping', '/api/status', '/api/history', '/api/events', '/api/stream', '/api/info', '/api/ask'];
    if (known.includes(route)) throw new HttpError(405, 'method_not_allowed', `${req.method} is not supported here`, { Allow: route === '/api/ask' ? 'POST, OPTIONS' : 'GET, HEAD, OPTIONS' });
    throw new HttpError(404, 'not_found', `no such endpoint: ${route}`);
  }

  // A refused API request still carries CORS headers for an allowed page (the Jarvis app), so the app can
  // read "refused" (403) and tell it apart from a Core that isn't running behind `tailscale serve` (Tailscale
  // then answers 502 without CORS headers). Other origins, pages and public Funnel traffic get nothing readable.
  function refusalCors(req) {
    if (req.headers?.['tailscale-funnel-request'] !== undefined) return {};
    let pathname;
    try {
      pathname = new URL(req.url ?? '/', 'http://core.local').pathname;
    } catch {
      return {};
    }
    if (pathname !== '/api' && !pathname.startsWith('/api/')) return {};
    const origin = checkOrigin(req, null, { allowedOrigins: config.allowedOrigins });
    return origin.ok && origin.allow ? corsHeaders(origin.allow, req) : {};
  }

  /**
   * The request must arrive (headers and body) within 15 s; an upload to PUT /api/sync/* gets 10 minutes.
   * (Node's own requestTimeout is off because it cannot tell an upload apart.)
   */
  function receiveDeadline(req) {
    const upload = req.method === 'PUT' && /^\/api\/sync\//.test(String(req.url ?? ''));
    const timer = setTimeout(() => {
      if (!req.complete) {
        counters.refused += 1;
        req.socket?.destroy();
      }
    }, upload ? SYNC_UPLOAD_MS : REQUEST_RECEIVE_MS);
    timer.unref?.();
    const clear = () => clearTimeout(timer);
    req.once('end', clear);
    req.once('close', clear);
  }

  async function handler(req, res) {
    counters.requests += 1;
    receiveDeadline(req);
    let cors = {};
    try {
      const access = checkAccess(req, accessOptions());
      if (!access.ok) {
        counters.refused += 1;
        cors = refusalCors(req);
        throw new HttpError(403, 'forbidden', access.reason);
      }
      let url;
      try {
        url = new URL(req.url ?? '/', 'http://core.local');
      } catch {
        throw new HttpError(400, 'bad_url', 'malformed address');
      }
      const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
      const origin = checkOrigin(req, access, { allowedOrigins: config.allowedOrigins });
      if (!origin.ok) {
        counters.refused += 1;
        throw new HttpError(403, 'origin_not_allowed', origin.reason);
      }
      cors = isApi ? corsHeaders(origin.allow, req) : {};
      if (req.method === 'OPTIONS') {
        if (!origin.allow) throw new HttpError(400, 'not_preflight', 'OPTIONS needs an Origin header');
        res.writeHead(204, { ...corsHeaders(origin.allow, req, { preflight: true }), 'Cache-Control': 'no-store', 'Content-Length': '0' });
        res.end();
        return;
      }
      if (isApi) {
        await handleApi(req, res, url, access, cors);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed', `${req.method} is not supported here`, { Allow: 'GET, HEAD' });
      await statics.serve(req, res, url.pathname);
    } catch (err) {
      if (!(err instanceof HttpError)) {
        counters.errors += 1;
        log(redact(`request failed: ${req.method} ${req.url}: ${err?.stack ?? err}`));
      }
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = err instanceof HttpError ? err.status : 500;
      const body = err instanceof HttpError ? { error: err.code, message: redact(err.message) } : { error: 'internal', message: 'something went wrong inside the Core' };
      sendJson(req, res, status, body, { ...cors, ...(err.headers ?? {}) });
    }
  }

  const server = http.createServer({ maxHeaderSize: 16 * 1024 }, (req, res) => {
    handler(req, res);
  });
  server.requestTimeout = 0; // receiveDeadline() above: 15 s, or 10 minutes for a sync upload
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  server.maxConnections = 128;
  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });

  return {
    server,
    sse,
    counters,
    attach,
    listen(port = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        const onError = (err) => {
          server.off('listening', onListening);
          reject(err);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve(server.address());
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    close() {
      sse.closeAll();
      for (const off of detach) off();
      for (const off of brainDetach) off();
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}
