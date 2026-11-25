// The senses' HTTP routes (core/server/senses): hearing and George's voice for the phone, opt-in beta.
// Same access rules, CORS, errors ({ error, message }) and general rate limit as the rest of the API
// (server.mjs runs those first). Body limits: 2 MB for POST /api/hear (a WAV), 4 KB for the rest.
//
//   GET  /api/senses                     → { hear: {enabled, model, state, progress, sizeMb, error, …}, speak: {…}, deps: {installed} }
//   PUT  /api/senses {hear?: {enabled?, model?}, speak?: {enabled?, voice?}}  → the same object (starts or stops downloads)
//   POST /api/hear?prompt=…  body: WAV 16 kHz mono 16-bit, ≤ 30 s, ≤ 2 MB  → { text, ms, model, seconds }
//   POST /api/speak {text ≤ 1000, voice: "bm_george", speed: 1}           → audio/wav (24 kHz mono 16-bit)

import { createRateLimiter } from './ratelimit.mjs';

export const HEAR_BODY_BYTES = 2 * 1024 * 1024;
export const SENSES_SMALL_BODY_BYTES = 4 * 1024;
export const SENSES_ROUTES = Object.freeze(['/api/senses', '/api/hear', '/api/speak']);

const WAV_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'application/octet-stream']);
const EXPOSED = 'X-Jarvis-Ms, X-Jarvis-Seconds, X-Jarvis-Sentences';

export function isSensesRoute(route) {
  return SENSES_ROUTES.includes(route);
}

const perHour = (n) => createRateLimiter({ capacity: n, refillPerSec: n / 3600 });

/** The raw bytes of a request body, at most `limit` (413 beyond it). */
function readRaw(req, limit, HttpError) {
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
        resolve(Buffer.concat(chunks));
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

/** An AbortSignal that fires when the asker hangs up before the answer is sent. */
function clientGone(req, res) {
  const ac = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) ac.abort();
  };
  res.once('close', onClose);
  return ac.signal;
}

/**
 * createSensesRoutes({ getSenses, readBody, sendJson, HttpError, log })
 *   → async handle(req, res, { route, method, url, access, cors }) (only call it when isSensesRoute(route))
 */
export function createSensesRoutes({ getSenses, readBody, sendJson, HttpError, log = () => {} }) {
  const limits = { settings: perHour(60) };

  const take = (name, access) => {
    const r = limits[name].take(access.key);
    if (!r.ok) throw new HttpError(429, 'rate_limited', 'too many requests of this kind; try again later', { 'Retry-After': String(r.retryAfterSec) });
  };

  async function readJson(req) {
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') throw new HttpError(415, 'unsupported_type', 'send JSON: Content-Type: application/json');
    const text = await readBody(req, SENSES_SMALL_BODY_BYTES);
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, 'bad_json', 'the body is not valid JSON');
    }
  }

  function rethrow(err) {
    if (err instanceof HttpError) throw err;
    if (err && Number.isInteger(err.status) && typeof err.code === 'string') throw new HttpError(err.status, err.code, String(err.message ?? err.code), err.headers ?? {});
    throw err;
  }

  const notAllowed = (allow) => {
    throw new HttpError(405, 'method_not_allowed', 'this method is not supported here', { Allow: `${allow}, OPTIONS` });
  };

  function sensesOrFail() {
    const s = getSenses();
    if (!s) throw new HttpError(503, 'senses_unavailable', 'hearing and voice are not available on this home base');
    return s;
  }

  async function handle(req, res, { route, method, url, access, cors }) {
    try {
      if (route === '/api/senses') {
        if (method === 'GET') return sendJson(req, res, 200, sensesOrFail().info(), cors);
        if (method === 'PUT') {
          take('settings', access);
          const body = await readJson(req);
          return sendJson(req, res, 200, await sensesOrFail().put(body), cors);
        }
        notAllowed('GET, HEAD, PUT');
      }

      if (route === '/api/hear') {
        if (method !== 'POST') notAllowed('POST');
        const senses = sensesOrFail();
        const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (!WAV_TYPES.has(type)) throw new HttpError(415, 'unsupported_type', 'send the audio as a WAV: Content-Type: audio/wav (16 kHz, mono, 16-bit PCM)');
        const prompt = url.searchParams.get('prompt') ?? '';
        const signal = clientGone(req, res);
        const body = await readRaw(req, HEAR_BODY_BYTES, HttpError);
        const out = await senses.hear(body, { prompt, signal });
        return sendJson(req, res, 200, out, cors);
      }

      if (route === '/api/speak') {
        if (method !== 'POST') notAllowed('POST');
        const senses = sensesOrFail();
        const body = await readJson(req);
        const signal = clientGone(req, res);
        const out = await senses.speak(body, { signal });
        if (res.destroyed) return undefined; // the asker went away; nothing to send
        res.writeHead(200, {
          ...cors,
          'Content-Type': 'audio/wav',
          'Content-Length': String(out.wav.length),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Jarvis-Ms': String(out.ms),
          'X-Jarvis-Seconds': String(out.seconds),
          'X-Jarvis-Sentences': String(out.sentences),
          ...(cors['Access-Control-Allow-Origin'] ? { 'Access-Control-Expose-Headers': EXPOSED } : {}),
        });
        res.end(out.wav);
        return undefined;
      }

      throw new HttpError(404, 'not_found', `no such endpoint: ${route}`);
    } catch (err) {
      if (err?.code === 'cancelled') log(`${route}: the asker went away before the answer`);
      rethrow(err);
    }
    return undefined;
  }

  return { handle };
}
