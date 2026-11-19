// Strict mock of the Claude Messages API for Jarvis tests.
//
//   createMock(options)        -> mock instance: { dispatch, requests, violations, reset, … }
//   createMockHandler(options) -> Node (req, res, next?) handler for POST /v1/messages + /__mock/*
//   createMockFetch(options)   -> in-process fetch(input, init) for unit tests (no sockets)
//
// Both transports share one implementation (`dispatch`), which validates every request like the
// real API (see validate.mjs) and answers with realistic JSON or SSE scripted by [[directives]]
// in the latest user text (see behavior.mjs and the infra brief).
//
// Options: { timeScale = env JARVIS_MOCK_TIME_SCALE ?? 1 (0 = no delays), now = () => new Date(),
//            verbose = false, mock (share an existing instance) }
// Control routes: GET /__mock/requests, GET /__mock/violations, POST /__mock/reset, GET /__mock/health

import { classifyRequest, createBehaviorState, planResponse } from './behavior.mjs';
import { parseDirectives, userTextOf } from './content.mjs';
import { signThinkingBlocks, validateBody, validateHeaders, mergeTurns } from './validate.mjs';
import { abortError, canonicalJson, chunkText, estimateTokens, isPlainObject, newMessageId, newRequestId, seededRandom, sha256Hex, sleep } from './util.mjs';

export { parseDirectives } from './content.mjs';

const MAX_BODY_BYTES = 32 * 1024 * 1024;
const RECORDED_HEADERS = [
  'anthropic-version', 'anthropic-beta', 'anthropic-dangerous-direct-browser-access', 'content-type', 'origin',
  'user-agent', 'x-stainless-retry-count', 'x-stainless-helper-method', 'x-stainless-timeout',
];
const CORS_HEADERS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };

/** True for the paths the mock serves (/v1/* and /__mock/*). */
export function isMockPath(pathname) {
  return pathname === '/v1' || pathname.startsWith('/v1/') || pathname === '/__mock' || pathname.startsWith('/__mock/');
}

export function createMock(options = {}) {
  const envScale = Number(process.env.JARVIS_MOCK_TIME_SCALE);
  const timeScale = Number.isFinite(options.timeScale) ? options.timeScale : Number.isFinite(envScale) ? envScale : 1;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const verbose = !!options.verbose;

  const mock = {
    timeScale,
    requests: [],
    violations: [],
    state: createBehaviorState(),
    cache: new Set(), // prompt-cache prefix hashes (usage simulation)
    seq: 0,
    reset() {
      this.requests.length = 0;
      this.violations.length = 0;
      this.state = createBehaviorState();
      this.cache.clear();
    },
    /** Violations not matched by `allowed` (predicates or { type, status, code, message: RegExp|string }). */
    unexpectedViolations(allowed = []) {
      return this.violations.filter((v) => !allowed.some((a) => matchesViolation(v, a)));
    },
    dispatch: (req) => dispatch(mock, req, { now, verbose }),
  };
  return mock;
}

function matchesViolation(v, a) {
  if (typeof a === 'function') return !!a(v);
  if (!a) return false;
  if (a.type && a.type !== v.type) return false;
  if (a.status && a.status !== v.status) return false;
  if (a.code && a.code !== v.code) return false;
  if (a.kind && a.kind !== v.kind) return false;
  if (a.message) {
    const ok = a.message instanceof RegExp ? a.message.test(v.message) : String(v.message).includes(a.message);
    if (!ok) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Dispatch: request → response descriptor
//   { status, headers, json } | { status, headers, sse: { frames, delays, cutAfter, entry } }
//   | { status: 204, headers } | { drop: true }

async function dispatch(mock, { method = 'GET', url, headers = {}, bodyText = '', signal }, { now, verbose }) {
  const u = new URL(url, 'http://mock.local');
  const path = u.pathname;
  const h = lowerHeaders(headers);

  if (path === '/__mock' || path.startsWith('/__mock/')) return control(mock, method, path);

  const requestId = newRequestId();
  const baseHeaders = { 'request-id': requestId, ...CORS_HEADERS };
  if (method === 'OPTIONS') {
    // CORS preflight (only needed when the app and the mock are on different origins).
    return {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': h['access-control-request-headers'] || '*',
        'access-control-max-age': '600',
      },
    };
  }

  const entry = {
    id: ++mock.seq,
    time: now().toISOString(),
    method,
    path,
    headers: Object.fromEntries(RECORDED_HEADERS.filter((k) => h[k] !== undefined).map((k) => [k, h[k]])),
    auth: 'none',
    kind: null,
    directives: [],
    body: null,
    status: null,
    outcome: 'pending',
  };
  mock.requests.push(entry);

  const fail = (status, type, message, extra = {}) => {
    entry.status = status;
    entry.outcome = 'rejected';
    entry.error = { type, message };
    mock.violations.push({ id: mock.violations.length + 1, time: now().toISOString(), requestId: entry.id, method, path, status, type, message, code: extra.code || null, kind: entry.kind });
    if (verbose) console.warn(`[mock] violation ${status} ${type}: ${message}`);
    return { status, headers: { ...baseHeaders, 'content-type': 'application/json', 'x-should-retry': 'false' }, json: { type: 'error', error: { type, message }, request_id: requestId } };
  };

  if (path !== '/v1/messages') return fail(404, 'not_found_error', `Not Found: ${method} ${path}`);
  if (method !== 'POST') return fail(405, 'invalid_request_error', `Method Not Allowed: ${method} ${path}`);

  // Parse early only to label the request (lead / worker / key test) in the log and in
  // violations; header problems are still reported before body problems, like the real API.
  let body;
  let parseError = false;
  if (bodyText.length > MAX_BODY_BYTES) parseError = 'size';
  else {
    try {
      body = JSON.parse(bodyText);
    } catch {
      parseError = 'json';
    }
  }
  if (isPlainObject(body)) {
    entry.body = body;
    entry.stream = body.stream === true;
    entry.model = body.model;
    try {
      entry.kind = classifyRequest(body);
      if (Array.isArray(body.messages)) entry.directives = directivesOf(body, entry.kind);
    } catch {
      entry.kind = null;
    }
  } else {
    entry.body = parseError ? bodyText.slice(0, 2000) : body;
  }

  const hv = validateHeaders(h);
  entry.auth = hv.scheme;
  if (hv.error) return fail(hv.error.status, hv.error.type, hv.error.message);
  if (parseError === 'size') return fail(413, 'request_too_large', 'Request exceeds the maximum allowed number of bytes.');
  if (parseError) return fail(400, 'invalid_request_error', 'There was an error parsing the body of your request: invalid JSON.');

  const invalid = validateBody(body, hv.betas);
  if (invalid) return fail(invalid.status, invalid.type, invalid.message, { code: invalid.code });
  const kind = entry.kind;

  const decision = planResponse({ body, kind, state: mock.state, now: now() });
  if (decision.error) {
    const e = decision.error;
    entry.status = e.status;
    entry.outcome = 'scripted-error';
    entry.error = { type: e.type, message: e.message };
    return {
      status: e.status,
      headers: { ...baseHeaders, 'content-type': 'application/json', ...(e.headers || {}) },
      json: { type: 'error', error: { type: e.type, message: e.message }, request_id: requestId },
    };
  }

  const plan = decision.plan;
  signThinkingBlocks(body, plan.blocks);
  const usage = computeUsage(mock, body, plan.blocks);
  const message = {
    id: newMessageId(),
    type: 'message',
    role: 'assistant',
    model: body.model,
    content: plan.blocks,
    stop_reason: plan.stop_reason,
    stop_sequence: null,
    stop_details: plan.stop_details ?? null,
    usage,
    container: null,
    context_management: null,
  };
  entry.status = 200;
  entry.stopReason = plan.stop_reason;
  entry.response = { id: message.id, stop_reason: message.stop_reason, blocks: plan.blocks.map((b) => b.type) };

  if (body.stream !== true) {
    if (plan.cutAfter !== undefined) {
      entry.outcome = 'cut';
      return { drop: true };
    }
    entry.outcome = 'ok';
    return { status: 200, headers: { ...baseHeaders, 'content-type': 'application/json' }, json: message };
  }

  const rng = seededRandom(`${message.id}`);
  const frames = buildFrames(message, plan, rng);
  const delays = computeDelays(frames, plan.pace, rng, mock.timeScale);
  return {
    status: 200,
    headers: { ...baseHeaders, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' },
    sse: { frames: frames.map((f) => f.text), delays, cutAfter: plan.cutAfter, entry },
  };
}

function control(mock, method, path) {
  const json = (status, data) => ({ status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, json: data });
  if (path === '/__mock/requests' && method === 'GET') return json(200, mock.requests);
  if (path === '/__mock/violations' && method === 'GET') return json(200, mock.violations);
  if (path === '/__mock/health' && method === 'GET') return json(200, { ok: true, requests: mock.requests.length, violations: mock.violations.length });
  if (path === '/__mock/reset' && method === 'POST') {
    mock.reset();
    return json(200, { ok: true });
  }
  return json(404, { error: `Unknown mock control route: ${method} ${path}` });
}

/** Headers (fetch Headers, Map, entry list, or Node's plain header object) → lower-cased object. */
function lowerHeaders(headers) {
  const out = {};
  if (!headers) return out;
  const iterable = typeof headers[Symbol.iterator] === 'function';
  const entries = iterable ? (typeof headers.entries === 'function' ? headers.entries() : headers) : Object.entries(headers);
  for (const [k, v] of entries) {
    if (v === undefined) continue;
    out[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

function directivesOf(body, kind) {
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  if (kind === 'worker') return parseDirectives(userTextOf(msgs[0])).names;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = userTextOf(msgs[i]);
    if (t) return parseDirectives(t).names;
  }
  return [];
}

// ---------------------------------------------------------------------------------------------
// Usage, with a simple prompt-cache simulation (automatic caching via top-level cache_control or
// block breakpoints): the longest previously seen prefix is a cache read, the rest a cache write.

function computeUsage(mock, body, blocks) {
  const sysTokens = estimateTokens(body.system) + estimateTokens(body.tools);
  const msgTokens = body.messages.map((m) => estimateTokens(m));
  const total = sysTokens + msgTokens.reduce((a, b) => a + b, 0);
  let input = total;
  let cacheRead = 0;
  let cacheWrite = 0;
  if (usesCaching(body)) {
    // Rolling prefix hashes: h[0] = system + tools, h[k] = h[k-1] + messages[k-1].
    const hashes = [sha256Hex(canonicalJson({ system: body.system, tools: body.tools, model: body.model }))];
    body.messages.forEach((m, i) => hashes.push(sha256Hex(hashes[i] + canonicalJson(m))));
    let k = hashes.length - 1;
    while (k >= 0 && !mock.cache.has(hashes[k])) k--;
    if (k >= 0) cacheRead = sysTokens + msgTokens.slice(0, k).reduce((a, b) => a + b, 0);
    input = Math.min(total - cacheRead, 8);
    cacheWrite = Math.max(0, total - cacheRead - input);
    mock.cache.add(hashes[0]);
    mock.cache.add(hashes[hashes.length - 1]);
  }
  let output = 0;
  let searches = 0;
  let fetches = 0;
  for (const b of blocks) {
    if (b.type === 'thinking') output += estimateTokens(b.thinking) + 40; // + reasoning not shown
    else if (b.type === 'text') output += estimateTokens(b.text);
    else if (b.type === 'tool_use' || b.type === 'server_tool_use') output += estimateTokens(b.input) + 10;
    else if (b.type === 'web_search_tool_result') searches++;
    else if (b.type === 'web_fetch_tool_result') fetches++;
  }
  const hasServerTools = (body.tools || []).some((t) => typeof t?.type === 'string' && t.type !== 'custom');
  return {
    input_tokens: input,
    cache_creation_input_tokens: cacheWrite,
    cache_read_input_tokens: cacheRead,
    cache_creation: { ephemeral_5m_input_tokens: cacheWrite, ephemeral_1h_input_tokens: 0 },
    output_tokens: Math.max(1, output),
    server_tool_use: hasServerTools ? { web_search_requests: searches, web_fetch_requests: fetches } : null,
    service_tier: 'standard',
    inference_geo: 'global',
  };
}

function usesCaching(body) {
  if (isPlainObject(body.cache_control)) return true;
  const has = (b) => isPlainObject(b?.cache_control);
  if ((body.tools || []).some(has)) return true;
  if (Array.isArray(body.system) && body.system.some(has)) return true;
  return body.messages.some((m) => Array.isArray(m.content) && m.content.some(has));
}

// ---------------------------------------------------------------------------------------------
// SSE framing and pacing

const sseFrame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function buildFrames(message, plan, rng) {
  const frames = [];
  const push = (event, data, weight = 1) => frames.push({ text: sseFrame(event, data), weight });
  const slow = plan.pace === 'slow-lead';
  const textChunk = slow ? 28 : plan.pace === 'worker' || plan.pace === 'slow-worker' ? 40 : 10;
  const jsonChunk = plan.jsonChunk || (slow ? 40 : 24);
  const u = message.usage;

  push('message_start', {
    type: 'message_start',
    message: {
      ...message,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      usage: { ...u, output_tokens: 1, server_tool_use: null },
    },
  }, 4);
  push('ping', { type: 'ping' });

  message.content.forEach((block, index) => {
    const start = (content_block, weight = 1) => push('content_block_start', { type: 'content_block_start', index, content_block }, weight);
    const delta = (d) => push('content_block_delta', { type: 'content_block_delta', index, delta: d });
    const stop = () => push('content_block_stop', { type: 'content_block_stop', index });
    switch (block.type) {
      case 'thinking':
        start({ type: 'thinking', thinking: '', signature: '' });
        if (block.thinking) for (const c of chunkText(block.thinking, slow ? 40 : 24, rng)) delta({ type: 'thinking_delta', thinking: c });
        delta({ type: 'signature_delta', signature: block.signature });
        stop();
        break;
      case 'text':
        start({ type: 'text', text: '', citations: block.citations ? [] : null });
        for (const citation of block.citations || []) delta({ type: 'citations_delta', citation });
        for (const c of chunkText(block.text, textChunk, rng)) delta({ type: 'text_delta', text: c });
        stop();
        break;
      case 'server_tool_use':
      case 'tool_use': {
        start({ type: block.type, id: block.id, name: block.name, input: {} });
        const json = JSON.stringify(block.input);
        const parts = block.type === 'server_tool_use' ? ['', ...chunkText(json, Math.max(4, Math.ceil(json.length / 3)), rng)] : chunkText(json, jsonChunk, rng);
        for (const p of parts) delta({ type: 'input_json_delta', partial_json: p });
        stop();
        break;
      }
      case 'web_search_tool_result':
      case 'web_fetch_tool_result':
        start(block, 8); // results arrive complete, after the "search" latency
        stop();
        break;
      default:
        start(block);
        stop();
    }
  });

  push('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: message.stop_reason, stop_sequence: null, stop_details: message.stop_details, container: null },
    usage: {
      input_tokens: u.input_tokens,
      cache_creation_input_tokens: u.cache_creation_input_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens,
      output_tokens: u.output_tokens,
      server_tool_use: u.server_tool_use,
    },
    context_management: null,
  });
  push('message_stop', { type: 'message_stop' });
  return frames;
}

// Total stream durations (ms) per pace, before timeScale. "About 0.3–1.5 s per request unless
// [[slow]]"; [[slow]] is ~120 ms between lead events and ~6 s per worker.
const PACES = {
  quick: { total: [120, 300] },
  normal: { total: [300, 900] },
  long: { total: [900, 1500] },
  worker: { total: [700, 1500] },
  'slow-lead': { perFrame: 120 },
  'slow-worker': { total: [5600, 6400] },
};

function computeDelays(frames, pace, rng, timeScale) {
  if (!(timeScale > 0)) return frames.map(() => 0);
  const p = PACES[pace] || PACES.normal;
  if (p.perFrame) return frames.map((f) => p.perFrame * Math.min(f.weight, 3) * timeScale);
  const total = rng.int(p.total[0], p.total[1]) * timeScale;
  const weights = frames.reduce((a, f) => a + f.weight, 0);
  return frames.map((f) => (total * f.weight) / weights);
}

/**
 * Write SSE frames to a sink { write(str), cut(), end() } honoring the delays. Small delays are
 * accumulated so timers stay ≥ 8 ms. Resolves to 'ok' | 'cut' | 'aborted'.
 */
async function writeFrames(sse, sink, signal) {
  let owed = 0;
  try {
    for (let i = 0; i < sse.frames.length; i++) {
      owed += sse.delays[i];
      if (owed >= 8) {
        await sleep(owed, signal);
        owed = 0;
      }
      if (signal?.aborted) throw abortError();
      if (sse.cutAfter !== undefined && i >= sse.cutAfter) {
        sse.entry.outcome = 'cut';
        sink.cut();
        return 'cut';
      }
      sink.write(sse.frames[i]);
    }
    sse.entry.outcome = 'ok';
    sink.end();
    return 'ok';
  } catch (err) {
    sse.entry.outcome = 'aborted';
    sink.abort?.(err);
    return 'aborted';
  }
}

// ---------------------------------------------------------------------------------------------
// Node transport

export function createMockHandler(options = {}) {
  const mock = options.mock ?? createMock(options);
  async function handler(req, res, next) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!isMockPath(url.pathname)) {
      if (typeof next === 'function') return next();
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    let bodyText = '';
    try {
      bodyText = await readBody(req, MAX_BODY_BYTES + 1);
    } catch {
      res.destroy();
      return;
    }
    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) ac.abort();
    });
    const desc = await mock.dispatch({ method: req.method, url: req.url, headers: req.headers, bodyText, signal: ac.signal });
    if (desc.drop) {
      res.destroy();
      return;
    }
    res.writeHead(desc.status, desc.headers);
    if (desc.json !== undefined) {
      res.end(JSON.stringify(desc.json));
      return;
    }
    if (!desc.sse) {
      res.end();
      return;
    }
    res.socket?.setNoDelay?.(true);
    res.flushHeaders();
    await writeFrames(desc.sse, {
      write: (s) => res.write(s),
      // Drop the connection mid-stream: flush what was written, then close the socket without the
      // final chunk, so the client sees a truncated chunked response ("terminated" in Node,
      // ERR_INCOMPLETE_CHUNKED_ENCODING in Chromium).
      cut: () => {
        const socket = res.socket;
        if (!socket) return res.destroy();
        socket.end();
        setTimeout(() => socket.destroy(), 200).unref?.();
      },
      end: () => res.end(),
      abort: () => res.destroy(),
    }, ac.signal);
  }
  handler.mock = mock;
  return handler;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------------------------
// In-process fetch transport (unit tests)

export function createMockFetch(options = {}) {
  const mock = options.mock ?? createMock(options);
  const encoder = new TextEncoder();
  async function mockFetch(input, init = {}) {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const url = isRequest ? input.url : String(input);
    const method = (init.method || (isRequest ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init.headers || (isRequest ? input.headers : undefined));
    let bodyText = '';
    const rawBody = init.body !== undefined ? init.body : isRequest ? await input.clone().text() : undefined;
    if (typeof rawBody === 'string') bodyText = rawBody;
    else if (rawBody instanceof Uint8Array || rawBody instanceof ArrayBuffer) bodyText = new TextDecoder().decode(rawBody);
    else if (rawBody != null) bodyText = await new Response(rawBody).text();
    const signal = init.signal || (isRequest ? input.signal : undefined);
    if (signal?.aborted) throw abortError();

    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const desc = await mock.dispatch({ method, url, headers, bodyText, signal: ac.signal });
    if (desc.drop) {
      signal?.removeEventListener('abort', onAbort);
      throw new TypeError('fetch failed', { cause: new Error('other side closed') });
    }
    let body = null;
    if (desc.json !== undefined) {
      body = JSON.stringify(desc.json);
      signal?.removeEventListener('abort', onAbort);
    } else if (desc.sse) {
      let settled = false;
      body = new ReadableStream({
        start(controller) {
          const finish = (fn) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            try {
              fn();
            } catch {
              /* stream already closed */
            }
          };
          writeFrames(desc.sse, {
            write: (s) => !settled && controller.enqueue(encoder.encode(s)),
            // Like undici when the server drops the socket mid-body. Error the stream only once the
            // consumer has read what was already "sent" (erroring discards queued chunks).
            cut: () => {
              const fail = () => finish(() => controller.error(new TypeError('terminated', { cause: new Error('other side closed') })));
              const whenDrained = () => (settled ? undefined : controller.desiredSize > 0 ? fail() : setTimeout(whenDrained, 2));
              setTimeout(whenDrained, 0);
            },
            end: () => finish(() => controller.close()),
            abort: (err) => finish(() => controller.error(err?.name === 'AbortError' ? err : abortError())),
          }, ac.signal);
        },
        cancel() {
          ac.abort();
        },
      });
    }
    return new Response(body, { status: desc.status, headers: desc.headers });
  }
  mockFetch.mock = mock;
  return mockFetch;
}

/** Merged conversation turns (exported for tests that inspect request histories). */
export { mergeTurns };
