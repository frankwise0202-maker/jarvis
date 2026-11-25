// The brain's HTTP routes (core/server/brain), push (core/server/push) and sync (core/server/sync).
// Same access rules, CORS, errors ({ error, message }) and general rate limit as the rest of the API
// (server.mjs runs those first). Body limits: 16 KB for /api/brain/key, /api/jobs and /api/watchers,
// 4 KB for everything else, and PUT /api/sync/<device> goes to the sync module un-read (50 MB, streamed).
//
//   GET    /api/brain                       the brain object
//   PUT    /api/brain/settings              { limits?, briefing?, owner? } → the brain object
//   POST   /api/brain/key {key}             → { ok, hint, verified }        (5 an hour)
//   DELETE /api/brain/key                   → 204                            (5 an hour)
//   GET    /api/spend?days=30
//   POST   /api/jobs {kind, prompt, depth, title?} → 202 { job }             (20 an hour)
//   GET    /api/jobs?limit=50&kind=         → { jobs } (without results)
//   GET    /api/jobs/<id>                   → { job } (with its result)
//   DELETE /api/jobs/<id>                   cancel (200 { job }) or remove a finished one (204)
//   POST   /api/watchers {what, every}      → 201 { watcher }
//   GET    /api/watchers                    → { watchers }
//   DELETE /api/watchers/<id>               → 204
//   POST   /api/watchers/<id>/check         → 202 { watcher, job }
//   GET    /api/briefing                    the latest briefing (404 none_yet)
//   POST   /api/briefing/run                → the new briefing
//   POST   /api/push/subscribe, DELETE /api/push/subscribe, POST /api/push/test
//   PUT    /api/sync/<device>, GET /api/sync, GET /api/sync/<device>

import { createRateLimiter } from './ratelimit.mjs';

export const BRAIN_BODY_BYTES = 16 * 1024;
export const SMALL_BODY_BYTES = 4 * 1024;
export const DEVICE_ID = /^[a-z0-9-]{8,64}$/;
const JOB_ID = /^j_[a-z0-9]{6,20}$/;
const WATCHER_ID = /^w_[a-z0-9]{6,20}$/;

const perHour = (n) => createRateLimiter({ capacity: n, refillPerSec: n / 3600 });

export const BRAIN_ROUTE_PREFIXES = ['/api/brain', '/api/spend', '/api/jobs', '/api/watchers', '/api/briefing', '/api/push', '/api/sync'];

export function isBrainRoute(route) {
  return BRAIN_ROUTE_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`));
}

/**
 * createBrainRoutes({ getBrain, push, sync, readBody, sendJson, HttpError, log })
 *   → async handle(req, res, { route, method, url, access, cors }) (only call it when isBrainRoute(route))
 */
export function createBrainRoutes({ getBrain, getPush = () => null, getSync = () => null, readBody, sendJson, HttpError, log = () => {} }) {
  const limits = {
    key: perHour(5),
    jobs: perHour(20),
    watchers: perHour(30),
    check: perHour(30),
    briefing: perHour(12),
    settings: perHour(60),
    push: perHour(30),
    sync: perHour(120),
  };

  const take = (name, access) => {
    const r = limits[name].take(access.key);
    if (!r.ok) throw new HttpError(429, 'rate_limited', 'too many requests of this kind; try again later', { 'Retry-After': String(r.retryAfterSec) });
  };

  async function readJson(req, limit) {
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') throw new HttpError(415, 'unsupported_type', 'send JSON: Content-Type: application/json');
    const text = await readBody(req, limit);
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, 'bad_json', 'the body is not valid JSON');
    }
  }

  /** Errors from the brain, push and sync modules carry status/code/message (and maybe headers). */
  function rethrow(err) {
    if (err instanceof HttpError) throw err;
    if (err && Number.isInteger(err.status) && typeof err.code === 'string') throw new HttpError(err.status, err.code, String(err.message ?? err.code), err.headers ?? {});
    throw err;
  }

  const notAllowed = (allow) => {
    throw new HttpError(405, 'method_not_allowed', 'this method is not supported here', { Allow: `${allow}, OPTIONS` });
  };

  const send = (req, res, status, body, cors, extra = {}) => sendJson(req, res, status, body, { ...cors, ...extra });
  const noContent = (res, cors) => {
    res.writeHead(204, { ...cors, 'Cache-Control': 'no-store' });
    res.end();
  };

  function brainOrFail() {
    const b = getBrain();
    if (!b) throw new HttpError(503, 'brain_unavailable', 'the home base brain is not running');
    return b;
  }

  async function handle(req, res, { route, method, url, access, cors }) {
    try {
      // ---- /api/brain
      if (route === '/api/brain') {
        if (method !== 'GET') notAllowed('GET, HEAD');
        return send(req, res, 200, brainOrFail().info(), cors);
      }
      if (route === '/api/brain/settings') {
        if (method !== 'PUT') notAllowed('PUT');
        take('settings', access);
        const body = await readJson(req, SMALL_BODY_BYTES);
        return send(req, res, 200, await brainOrFail().putSettings(body), cors);
      }
      if (route === '/api/brain/key') {
        if (method === 'POST') {
          take('key', access);
          const body = await readJson(req, BRAIN_BODY_BYTES);
          return send(req, res, 200, await brainOrFail().setKey(body), cors);
        }
        if (method === 'DELETE') {
          take('key', access);
          brainOrFail().deleteKey();
          return noContent(res, cors);
        }
        notAllowed('POST, DELETE');
      }
      if (route === '/api/spend') {
        if (method !== 'GET') notAllowed('GET, HEAD');
        const days = Number(url.searchParams.get('days') ?? 30);
        if (!Number.isInteger(days) || days < 1 || days > 366) throw new HttpError(400, 'bad_days', 'days must be a whole number from 1 to 366');
        return send(req, res, 200, brainOrFail().spendReport(days), cors);
      }

      // ---- /api/jobs
      if (route === '/api/jobs') {
        if (method === 'POST') {
          take('jobs', access);
          const body = await readJson(req, BRAIN_BODY_BYTES);
          return send(req, res, 202, { job: brainOrFail().createJob(body) }, cors);
        }
        if (method === 'GET') {
          const limit = Number(url.searchParams.get('limit') ?? 50);
          if (!Number.isFinite(limit) || limit < 1) throw new HttpError(400, 'bad_limit', 'limit must be a positive number');
          const kind = url.searchParams.get('kind');
          if (kind && !['research', 'watch-check', 'briefing'].includes(kind)) throw new HttpError(400, 'bad_kind', 'kind must be research, watch-check or briefing');
          return send(req, res, 200, { jobs: brainOrFail().listJobs({ limit: Math.min(limit, 200), kind }) }, cors);
        }
        notAllowed('GET, POST');
      }
      if (route.startsWith('/api/jobs/')) {
        const id = route.slice('/api/jobs/'.length);
        if (!JOB_ID.test(id)) throw new HttpError(404, 'not_found', 'no such job');
        if (method === 'GET') {
          const job = brainOrFail().getJob(id);
          if (!job) throw new HttpError(404, 'not_found', 'no such job');
          return send(req, res, 200, { job }, cors);
        }
        if (method === 'DELETE') {
          const r = brainOrFail().deleteJob(id);
          if (r.removed) return noContent(res, cors);
          return send(req, res, 200, { job: brainOrFail().getJob(id) }, cors);
        }
        notAllowed('GET, DELETE');
      }

      // ---- /api/watchers
      if (route === '/api/watchers') {
        if (method === 'POST') {
          take('watchers', access);
          const body = await readJson(req, BRAIN_BODY_BYTES);
          return send(req, res, 201, { watcher: brainOrFail().createWatcher(body) }, cors);
        }
        if (method === 'GET') return send(req, res, 200, { watchers: brainOrFail().listWatchers() }, cors);
        notAllowed('GET, POST');
      }
      if (route.startsWith('/api/watchers/')) {
        const rest = route.slice('/api/watchers/'.length);
        const [id, action, ...more] = rest.split('/');
        if (!WATCHER_ID.test(id) || more.length || (action !== undefined && action !== 'check')) throw new HttpError(404, 'not_found', 'no such watcher');
        if (action === 'check') {
          if (method !== 'POST') notAllowed('POST');
          take('check', access);
          return send(req, res, 202, brainOrFail().checkWatcherNow(id), cors);
        }
        if (method === 'DELETE') {
          brainOrFail().deleteWatcher(id);
          return noContent(res, cors);
        }
        notAllowed('DELETE');
      }

      // ---- /api/briefing
      if (route === '/api/briefing') {
        if (method !== 'GET') notAllowed('GET, HEAD');
        const b = brainOrFail().latestBriefing();
        if (!b) throw new HttpError(404, 'none_yet', 'there is no briefing yet: the first comes at the briefing time, or ask for one now');
        return send(req, res, 200, b, cors);
      }
      if (route === '/api/briefing/run') {
        if (method !== 'POST') notAllowed('POST');
        take('briefing', access);
        return send(req, res, 200, await brainOrFail().runBriefing(), cors);
      }

      // ---- /api/push (brain-io's module)
      if (route === '/api/push/subscribe' || route === '/api/push/test') {
        const push = getPush();
        if (!push) throw new HttpError(503, 'push_unavailable', 'notifications are not available on this home base yet');
        if (route === '/api/push/subscribe') {
          if (method === 'POST') {
            take('push', access);
            const body = await readJson(req, SMALL_BODY_BYTES);
            return send(req, res, 201, await push.subscribe({ subscription: body?.subscription, label: body?.label }), cors);
          }
          if (method === 'DELETE') {
            const body = await readJson(req, SMALL_BODY_BYTES);
            return send(req, res, 200, await push.unsubscribe({ endpoint: body?.endpoint }), cors);
          }
          notAllowed('POST, DELETE');
        }
        if (method !== 'POST') notAllowed('POST');
        take('push', access);
        let body;
        if (Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']) body = await readJson(req, SMALL_BODY_BYTES);
        return send(req, res, 200, await push.test(body), cors);
      }

      // ---- /api/sync (brain-io's module)
      if (route === '/api/sync' || route.startsWith('/api/sync/')) {
        const sync = getSync();
        if (!sync) throw new HttpError(503, 'sync_unavailable', 'sync is not available on this home base yet');
        if (route === '/api/sync') {
          if (method !== 'GET') notAllowed('GET, HEAD');
          return send(req, res, 200, sync.list(), cors);
        }
        const id = route.slice('/api/sync/'.length);
        if (!DEVICE_ID.test(id)) throw new HttpError(400, 'bad_device', 'the device id must be 8-64 characters: a-z, 0-9 and -');
        if (method === 'PUT') {
          take('sync', access);
          const out = await sync.put(id, req, { label: req.headers['x-jarvis-device-label'], encoding: req.headers['content-encoding'] });
          return send(req, res, 200, out, cors);
        }
        if (method === 'GET') {
          const got = await sync.get(id, { acceptEncoding: req.headers['accept-encoding'] });
          if (!got) throw new HttpError(404, 'not_found', 'no backup from that device yet');
          const headers = {
            ...cors,
            'Content-Type': got.contentType ?? 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            Vary: cors.Vary ? `${cors.Vary}, Accept-Encoding` : 'Accept-Encoding',
          };
          if (got.contentEncoding) headers['Content-Encoding'] = got.contentEncoding;
          if (Number.isFinite(got.bytes)) headers['Content-Length'] = String(got.bytes);
          res.writeHead(200, headers);
          if (req.method === 'HEAD') {
            got.stream.destroy?.();
            res.end();
            return undefined;
          }
          got.stream.on('error', (err) => {
            log(`sync download failed: ${err?.message ?? err}`);
            res.destroy();
          });
          got.stream.pipe(res);
          return undefined;
        }
        notAllowed('GET, PUT');
      }
      throw new HttpError(404, 'not_found', `no such endpoint: ${route}`);
    } catch (err) {
      rethrow(err);
    }
    return undefined;
  }

  return { handle };
}
