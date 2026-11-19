// Shared fixtures for the engine unit tests: a scripted fake `fetch` that answers the real SDK with
// real Server-Sent-Event Responses (ReadableStream bodies) shaped like the Claude API's stream, and
// records every request body and header. The file name matches the engine's test glob; it only
// registers its own self-checks when node --test runs it directly (not when imported).
//
// A handler receives each recorded request and returns a reply descriptor:
//   { content: [blocks], stop: 'end_turn', usage?, model?, stopDetails?, container?, delayMs?, breakAfter?, gate? }
//   { error: { status, type, message, headers?, details? } }       → JSON error response
//   { sseError: { type, message }, content?: [blocks] }              → stream that fails mid-way
// Non-streaming requests (testApiKey) get the same content as a JSON message.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createJarvis } from '../../src/engine/index.js';
import { WORKER_SYSTEM_V1 } from '../../src/engine/prompts.js';

export const KEY = 'sk-ant-test-0123456789abcdefghijklmnop';

export const DEFAULT_TEST_SETTINGS = Object.freeze({
  userName: '',
  leadModel: 'claude-opus-5-5',
  workerModel: 'claude-sonnet-5-5',
  depth: 'balanced',
  mode: 'auto',
  maxAgents: 8,
  maxParallel: 4,
  maxWaves: 3,
  showThinking: true,
  speakReplies: 'off',
  voiceURI: '',
  voiceRate: 1.0,
  listenLang: 'en-US',
  location: '',
  memoryEnabled: true,
  spendWarnUsd: 20,
  onboarded: true,
  features: { fallbacks: true, compaction: true },
});

// ---------------------------------------------------------------------------------------------
// Block helpers (complete blocks, as they appear in a final message)

let sigCounter = 0;
export const blk = {
  thinking: (text) => ({ type: 'thinking', thinking: text, signature: `sig_${++sigCounter}` }),
  text: (text, citations) => (citations ? { type: 'text', text, citations } : { type: 'text', text }),
  cite: (url, title) => ({ type: 'web_search_result_location', url, title, cited_text: 'cited words', encrypted_index: 'ei' }),
  search: (id, query) => ({ type: 'server_tool_use', id, name: 'web_search', input: { query } }),
  searchResult: (id, results) => ({
    type: 'web_search_tool_result',
    tool_use_id: id,
    content: results.map(([url, title, pageAge = null]) => ({ type: 'web_search_result', url, title, page_age: pageAge, encrypted_content: 'enc' })),
  }),
  searchError: (id, code) => ({ type: 'web_search_tool_result', tool_use_id: id, content: { type: 'web_search_tool_result_error', error_code: code } }),
  fetch: (id, url) => ({ type: 'server_tool_use', id, name: 'web_fetch', input: { url } }),
  fetchResult: (id, url, title) => ({
    type: 'web_fetch_tool_result',
    tool_use_id: id,
    content: {
      type: 'web_fetch_result',
      url,
      retrieved_at: '2026-11-19T10:00:00Z',
      content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'page text' }, title, citations: null },
    },
  }),
  deploy: (id, input, rawJson) => ({ type: 'tool_use', id, name: 'deploy_agents', input, ...(rawJson ? { rawJson } : {}) }),
  memory: (id, action, fact) => ({ type: 'tool_use', id, name: 'update_memory', input: { action, fact } }),
  hologram: (id, input, rawJson) => ({ type: 'tool_use', id, name: 'show_hologram', input, ...(rawJson ? { rawJson } : {}) }),
  blueprint: (id, input, rawJson) => ({ type: 'tool_use', id, name: 'draw_blueprint', input, ...(rawJson ? { rawJson } : {}) }),
  openSaved: (id, libraryId) => ({ type: 'tool_use', id, name: 'open_saved', input: { id: libraryId } }),
};

/** deploy_agents input with `n` agents whose tasks name themselves (task "Task k ..."). */
export function deployInput(n, title = 'Test mission', extra = '') {
  return {
    mission: title,
    agents: Array.from({ length: n }, (_, i) => ({ role: `Analyst ${i + 1}`, task: `Task ${i + 1}: research angle ${i + 1}.${extra}`, web: true })),
  };
}

/** A typical worker answer: one search, results, a cited report. */
export function workerReply(label = 'Agent', { url = `https://www.example.com/${encodeURIComponent(label)}` } = {}) {
  return {
    content: [
      blk.thinking(`Planning ${label}`),
      blk.search(`srvtoolu_${label}_1`, `${label} query`),
      blk.searchResult(`srvtoolu_${label}_1`, [[url, `${label} source`, '2 days ago'], ['https://www.example.com/other', 'Other']]),
      blk.text('## Key findings\n- '),
      blk.text(`Finding from ${label}`, [blk.cite(url, `${label} source`)]),
      blk.text('.\n\n## Confidence and gaps\n- High.'),
    ],
    stop: 'end_turn',
    usage: { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
  };
}

// ---------------------------------------------------------------------------------------------
// SSE encoding

function chunks(str, size = 9) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out.length ? out : [''];
}

function blockEvents(block, index) {
  const events = [];
  const start = (content_block) => events.push({ type: 'content_block_start', index, content_block });
  const delta = (d) => events.push({ type: 'content_block_delta', index, delta: d });
  switch (block.type) {
    case 'thinking':
      start({ type: 'thinking', thinking: '', signature: '' });
      for (const c of chunks(block.thinking)) if (c) delta({ type: 'thinking_delta', thinking: c });
      delta({ type: 'signature_delta', signature: block.signature || 'sig' });
      break;
    case 'text':
      start({ type: 'text', text: '' });
      for (const citation of block.citations || []) delta({ type: 'citations_delta', citation });
      for (const c of chunks(block.text)) if (c) delta({ type: 'text_delta', text: c });
      break;
    case 'tool_use':
    case 'server_tool_use': {
      const { rawJson, input, ...rest } = block;
      start({ ...rest, input: {} });
      const raw = rawJson ?? JSON.stringify(input ?? {});
      for (const c of chunks(raw, 7)) if (c) delta({ type: 'input_json_delta', partial_json: c });
      break;
    }
    default:
      start(block); // server tool results, fallback, redacted_thinking, … arrive complete
  }
  events.push({ type: 'content_block_stop', index });
  return events;
}

let msgCounter = 0;
export function messageEvents(reply, model) {
  const content = reply.content || [];
  const searches = content.filter((b) => b.type === 'server_tool_use' && b.name === 'web_search').length;
  const fetches = content.filter((b) => b.type === 'server_tool_use' && b.name === 'web_fetch').length;
  const usage = {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    ...(searches || fetches ? { server_tool_use: { web_search_requests: searches, web_fetch_requests: fetches } } : {}),
    ...(reply.usage || {}),
  };
  const events = [
    {
      type: 'message_start',
      message: {
        id: `msg_${++msgCounter}`,
        type: 'message',
        role: 'assistant',
        model: reply.model || model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: 1,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
        },
      },
    },
    { type: 'ping' },
  ];
  content.forEach((block, i) => events.push(...blockEvents(block, i)));
  const deltaUsage = { output_tokens: usage.output_tokens };
  if (usage.server_tool_use) deltaUsage.server_tool_use = usage.server_tool_use;
  if (usage.iterations) deltaUsage.iterations = usage.iterations;
  events.push({
    type: 'message_delta',
    // `container` (code-execution container of the web tools) arrives on message_delta, as from the API.
    delta: { stop_reason: reply.stop || 'end_turn', stop_sequence: null, stop_details: reply.stopDetails ?? null, ...(reply.container ? { container: reply.container } : {}) },
    usage: deltaUsage,
  });
  events.push({ type: 'message_stop' });
  return events;
}

export function finalMessageJson(reply, model) {
  return {
    id: `msg_${++msgCounter}`,
    type: 'message',
    role: 'assistant',
    model: reply.model || model,
    content: reply.content || [],
    stop_reason: reply.stop || 'end_turn',
    stop_sequence: null,
    stop_details: reply.stopDetails ?? null,
    container: reply.container ?? null,
    usage: { input_tokens: 10, output_tokens: 3, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...(reply.usage || {}) },
  };
}

const encoder = new TextEncoder();
const encodeEvent = (e) => encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (!ms) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

/**
 * A text/event-stream Response. `breakAfter` errors the body like a dropped connection after that
 * many events; aborting `signal` errors it with an AbortError, as fetch does.
 */
export function sseResponse(events, { delayMs = 0, breakAfter, signal, onClose } = {}) {
  let i = 0;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    onClose?.();
  };
  const body = new ReadableStream({
    async pull(controller) {
      try {
        if (delayMs && i > 0) await wait(delayMs, signal);
        if (signal?.aborted) {
          controller.error(new DOMException('This operation was aborted', 'AbortError'));
          return close();
        }
        if (breakAfter !== undefined && i >= breakAfter) {
          controller.error(new TypeError('terminated'));
          return close();
        }
        if (i >= events.length) {
          controller.close();
          return close();
        }
        controller.enqueue(encodeEvent(events[i++]));
      } catch (err) {
        controller.error(err);
        close();
      }
    },
    cancel() {
      close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': `req_${i}` } });
}

export function errorResponse({ status, type, message, headers = {}, details } = {}) {
  const error = { type, message };
  if (details) error.details = details;
  return new Response(JSON.stringify({ type: 'error', error, request_id: 'req_err' }), {
    status,
    headers: { 'content-type': 'application/json', 'request-id': 'req_err', ...headers },
  });
}

// ---------------------------------------------------------------------------------------------
// Request inspection

export const isWorkerBody = (body) => Array.isArray(body?.system) && body.system[0]?.text === WORKER_SYSTEM_V1;
export const isLeadBody = (body) => !!body?.tools?.some((t) => t.name === 'deploy_agents');

/** The owner's text of the latest user message that carries text (skips <turn_context>). */
export function ownerText(body) {
  for (let i = (body?.messages?.length ?? 0) - 1; i >= 0; i--) {
    const m = body.messages[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    const texts = m.content.filter((b) => b.type === 'text' && !b.text.startsWith('<turn_context>')).map((b) => b.text);
    if (texts.length) return texts.join('\n');
  }
  return '';
}

/** tool_result blocks of the final user message, or [] if it holds none. */
export function trailingToolResults(body) {
  const last = body?.messages?.[body.messages.length - 1];
  if (!last || last.role !== 'user' || !Array.isArray(last.content)) return [];
  return last.content.filter((b) => b.type === 'tool_result');
}

/** "Task k" of a worker request (from the assignment text), or 0. */
export function workerTaskNo(body) {
  const text = body?.messages?.[0]?.content?.[0]?.text || '';
  const m = /Task: Task (\d+)/.exec(text);
  return m ? Number(m[1]) : 0;
}

export function workerPromptText(body) {
  return body?.messages?.[0]?.content?.[0]?.text || '';
}

// ---------------------------------------------------------------------------------------------
// Fake API

export function createFakeApi(handler) {
  const requests = [];
  const stats = { activeWorkers: 0, peakWorkers: 0, active: 0 };

  async function fetch(url, init = {}) {
    const headers = {};
    new Headers(init.headers || {}).forEach((value, key) => {
      headers[key] = value;
    });
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    const kind = !body?.stream ? 'nonstream' : isWorkerBody(body) ? 'worker' : isLeadBody(body) ? 'lead' : 'other';
    const req = { index: requests.length, url: String(url), method: init.method, headers, body, kind, at: Date.now() };
    requests.push(req);
    if (init.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError');

    const isWorker = kind === 'worker';
    if (isWorker) {
      stats.activeWorkers += 1;
      stats.peakWorkers = Math.max(stats.peakWorkers, stats.activeWorkers);
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (isWorker) stats.activeWorkers -= 1;
    };

    let reply;
    try {
      reply = await handler(req, api);
    } catch (err) {
      release();
      throw err;
    }
    if (reply?.gate) await reply.gate;
    if (reply?.networkError) {
      release();
      throw new TypeError('fetch failed');
    }
    if (!reply || reply.error) {
      release();
      return errorResponse(reply?.error || { status: 500, type: 'api_error', message: 'No scripted reply' });
    }
    const model = body?.model || 'claude-opus-5-5';
    if (kind === 'nonstream') {
      release();
      return new Response(JSON.stringify(finalMessageJson(reply, model)), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    let events = messageEvents(reply, model);
    if (reply.sseError) {
      const upTo = 2 + (reply.content?.length ? blockEvents(reply.content[0], 0).length : 0);
      events = [...events.slice(0, upTo), { type: 'error', error: { type: reply.sseError.type, message: reply.sseError.message } }];
    }
    return sseResponse(events, { delayMs: reply.delayMs ?? 0, breakAfter: reply.breakAfter, signal: init.signal, onClose: release });
  }

  const api = {
    fetch,
    requests,
    stats,
    byKind: (kind) => requests.filter((r) => r.kind === kind),
    reset() {
      requests.length = 0;
      stats.peakWorkers = 0;
    },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------
// Harness

export function createMemory(initial = []) {
  const items = initial.map((text, i) => ({ id: `m${i}`, text, createdAt: 0 }));
  return {
    items,
    list: () => items.map((m) => ({ ...m })),
    add(text) {
      if (!items.some((m) => m.text.toLowerCase() === text.toLowerCase())) items.push({ id: `m${items.length}`, text, createdAt: 0 });
      return true;
    },
    remove(text) {
      const i = items.findIndex((m) => m.text.toLowerCase() === String(text).toLowerCase());
      if (i < 0) return false;
      items.splice(i, 1);
      return true;
    },
  };
}

/**
 * An in-memory saved library with the engine's dependency shape ({ save, get, list,
 * findPartBlueprint }) and library.js's semantics: ids 'lib_' + 10 base36, newest first, one item
 * per segment. `calls` records every call; `fail` / `hang` make the next calls reject / never answer.
 */
export function createFakeLibrary(initial = []) {
  const items = [];
  const calls = [];
  let seq = 0;
  const lib = {
    items,
    calls,
    fail: null, // e.g. 'save': that call rejects
    hang: null, // e.g. 'get': that call never answers
    add(item) {
      const full = { createdAt: 1000 + items.length, parent: null, stats: {}, ...item };
      items.unshift(full);
      return full;
    },
    save(record) {
      calls.push(['save', structuredClone(record)]);
      if (lib.hang === 'save') return new Promise(() => {});
      if (lib.fail === 'save') return Promise.reject(new Error('disk full'));
      const existing = items.find((i) => record.segmentId && i.segmentId === record.segmentId);
      if (existing) return Promise.resolve({ id: existing.id });
      const id = `lib_${String(++seq).padStart(10, '0')}`;
      items.unshift({ ...structuredClone(record), id, createdAt: Date.now() + seq, sheet: record.kind === 'blueprint' ? record.spec.sheet : null });
      return Promise.resolve({ id, persisted: true });
    },
    get(id) {
      calls.push(['get', id]);
      if (lib.hang === 'get') return new Promise(() => {});
      if (lib.fail === 'get') return Promise.reject(new Error('unavailable'));
      const item = items.find((i) => i.id === id);
      return Promise.resolve(item ? structuredClone(item) : null);
    },
    list({ kind, limit } = {}) {
      calls.push(['list', { kind, limit }]);
      if (lib.hang === 'list') return new Promise(() => {});
      if (lib.fail === 'list') return Promise.reject(new Error('unavailable'));
      const rows = items.filter((i) => !kind || i.kind === kind).map(({ spec, ...row }) => structuredClone(row));
      return Promise.resolve(Number.isInteger(limit) ? rows.slice(0, limit) : rows);
    },
    findPartBlueprint(model, part) {
      calls.push(['findPartBlueprint', model, part]);
      const hit = items.find((i) => i.kind === 'blueprint' && i.parent && i.parent.model === model && (i.parent.part ?? null) === (part ?? null));
      if (!hit) return Promise.resolve(null);
      const { spec, ...row } = hit;
      return Promise.resolve(structuredClone(row));
    },
  };
  for (const item of initial) lib.add(item);
  return lib;
}

export function createHarness({
  handler,
  settings = {},
  memory = createMemory(),
  library,
  liveIntervalMs,
  libraryTimeoutMs,
  now,
  retryBaseMs = 5,
  clientOptions = { maxRetries: 0 },
  onFeatureUnsupported,
  apiKey = KEY,
  workerStaggerMs = 0, // production staggers agents 700 ms apart; tests that check it opt in
  maxRetryWaitMs = 50, // cap retry-after waits so rate-limit tests stay fast
} = {}) {
  const api = createFakeApi(handler);
  const persisted = [];
  const spend = [];
  const featureCalls = [];
  let current = { ...DEFAULT_TEST_SETTINGS, ...settings, features: { ...DEFAULT_TEST_SETTINGS.features, ...(settings.features || {}) } };
  const jarvis = createJarvis({
    getSettings: () => current,
    getApiKey: () => apiKey,
    getApiBase: () => '',
    memory,
    library,
    liveIntervalMs,
    libraryTimeoutMs,
    persist: async (conv) => {
      persisted.push(structuredClone(conv)); // also proves the conversation is structured-clone safe
    },
    onSpend: (usd) => spend.push(usd),
    fetch: api.fetch,
    now,
    clientOptions,
    retryBaseMs,
    workerStaggerMs,
    maxRetryWaitMs,
    onFeatureUnsupported: (name) => {
      featureCalls.push(name);
      onFeatureUnsupported?.(name);
    },
  });
  return {
    jarvis,
    api,
    persisted,
    spend,
    memory,
    featureCalls,
    get settings() {
      return current;
    },
    setSettings(patch) {
      current = { ...current, ...patch };
    },
  };
}

/** Starts a turn, records every event ('*'), and resolves with { turn, events, run } at the end. */
export async function runTurn(jarvis, conv, text, mode = 'auto', { onRun, ...input } = {}) {
  const run = jarvis.startTurn(conv, { text, mode, ...input });
  return collect(run, onRun);
}

export async function collect(run, onRun) {
  const events = [];
  run.on('*', (e) => events.push(e));
  onRun?.(run, events);
  const turn = await run.done;
  return { turn, events, run };
}

export const segmentsOf = (turn, kind) => turn.segments.filter((s) => s.kind === kind);
export const missionsOf = (turn) => Object.values(turn.missions);
export const textOf = (turn) => segmentsOf(turn, 'text').map((s) => s.text).join('\n');

export function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// ---------------------------------------------------------------------------------------------
// Self-checks of the fixtures (only when this file is run directly by the test runner).

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  test('fixture: message events are a well-formed stream', () => {
    const events = messageEvents({ content: [blk.thinking('hi'), blk.text('Hello', [blk.cite('https://a.example/x', 'A')])], stop: 'end_turn' }, 'm');
    assert.equal(events[0].type, 'message_start');
    assert.equal(events.at(-1).type, 'message_stop');
    assert.equal(events.at(-2).delta.stop_reason, 'end_turn');
    const starts = events.filter((e) => e.type === 'content_block_start').map((e) => e.index);
    assert.deepEqual(starts, [0, 1]);
  });
}
