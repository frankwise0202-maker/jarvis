// The brain's Claude client: the official SDK (@anthropic-ai/sdk, imported lazily so the Core starts and
// serves the system report without core/node_modules), one streamed request at a time with
// finalMessage(), the server tools web_search_20260209 / web_fetch_20260209, adaptive thinking, pause_turn
// continuations, refusal and max_tokens handling, server-side refusal fallbacks, and the cost of every
// response from its usage. No local tools: web search and fetch only.
//
// Spending never runs past a cap or a job's budget by more than a rounding error:
//   - before each request (the first and every pause_turn continuation) its max_tokens is lowered to what
//     the room left (the smallest of the budget, today's and this month's cap) can pay for after its input,
//     and a request that could write fewer than MIN_REQUEST_TOKENS is not sent;
//   - during the stream a live estimate is checked on every event and every second, and the request is
//     stopped the moment it would cross ("finish with what it has"). Thinking streams no text on Opus /
//     Sonnet 5.5 (display "omitted") but is billed as output, so the estimate counts the time the model
//     spends writing at a generous OUTPUT_TOKENS_PER_SECOND (up to max_tokens), and every server-tool
//     round reading the whole conversation again, each result at its measured size (at least
//     SEARCH_RESULT_MIN_TOKENS for a search); while a tool runs, the round its result starts is counted
//     ahead (a search as SEARCH_EXPECTED_TOKENS, a page as up to its max_content_tokens).
//
// The key goes only to https://api.anthropic.com (or, for tests, a loopback address the caller names).

import { responseCost, tokenCost, priceOf, WEB_SEARCH_USD } from './prices.mjs';
import { redact, oneLine, httpUrl } from './util.mjs';

/** Every model the brain uses, in one place. */
export const BRAIN_MODELS = Object.freeze({
  deepResearch: 'claude-opus-5-5',
  quickResearch: 'claude-sonnet-5-5',
  watchCheck: 'claude-sonnet-5-5',
  briefing: 'claude-sonnet-5-5',
});

/** Models that take server-side refusal fallbacks (fallbacks: "default"). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
export const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

export const API_BASE = 'https://api.anthropic.com';

/** A base URL the key may be sent to: Anthropic's, or a loopback address (tests, a local mock). */
export function allowedBase(value) {
  if (value === undefined || value === null || value === '') return API_BASE;
  try {
    const u = new URL(String(value));
    if (u.protocol === 'https:' && u.hostname === 'api.anthropic.com' && !u.port && !u.username) return API_BASE;
    if (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && !u.username) return `${u.protocol}//${u.host}`;
  } catch {
    // fall through
  }
  return null;
}

export class BrainError extends Error {
  constructor(code, message, { retryable = false, status = null } = {}) {
    super(redact(message));
    this.code = code;
    this.retryable = retryable;
    if (status !== null) this.status = status;
  }
}

const SPEND_LIMIT_CODES = new Set(['enforced_spend_limit_reached', 'contract_spend_limit_reached']);
/** Never cap max_tokens below this when pacing for an output-tokens-per-minute limit. */
export const MIN_MAX_TOKENS = 1024;
/** A request whose room (budget, caps) pays for fewer output tokens than this is not sent. */
export const MIN_REQUEST_TOKENS = 2000;
/** The live estimate's writing speed (thinking streams no text but is billed): above what the models do. */
export const OUTPUT_TOKENS_PER_SECOND = 200;
/** A web search result's input tokens, at least (its snippets come encrypted); and what one is expected to add. */
export const SEARCH_RESULT_MIN_TOKENS = 2000;
export const SEARCH_EXPECTED_TOKENS = 4000;
const FETCH_MIN_TOKENS = 1000;
const FETCH_EXPECTED_MAX = 10_000;
const FETCH_DEFAULT_TOKENS = 25_000;

/** A request's input in tokens before it is sent: its JSON at 3 characters a token, plus what the API adds. */
export function estimateInputTokens(params) {
  let chars = 0;
  try {
    chars = JSON.stringify([params.system ?? null, params.messages ?? null, params.tools ?? null]).length;
  } catch {
    chars = 0;
  }
  return Math.ceil(chars / 3) + (params.tools?.length ? 2500 : 500);
}

/** The most a web fetch can put into the context (its max_content_tokens). */
function fetchTokensOf(tools) {
  const t = (Array.isArray(tools) ? tools : []).find((x) => typeof x?.type === 'string' && x.type.startsWith('web_fetch'));
  const n = Number(t?.max_content_tokens);
  return Number.isFinite(n) && n > 0 ? n : FETCH_DEFAULT_TOKENS;
}

/** Input tokens a server tool's result adds to the context: its size (4 characters a token; encrypted snippets count high), with a floor. */
function resultTokensOf(block) {
  let size = 0;
  try {
    size = JSON.stringify(block).length / 4;
  } catch {
    size = 0;
  }
  const c = block?.content;
  const failed = c && typeof c === 'object' && !Array.isArray(c) && (typeof c.error_code === 'string' || /error/.test(String(c.type ?? '')));
  if (failed) return size;
  if (block.type === 'web_search_tool_result') return Math.max(SEARCH_RESULT_MIN_TOKENS, size);
  // A page's text is capped at max_content_tokens by the API, but a PDF is not: its measured size counts.
  if (block.type === 'web_fetch_tool_result') return Math.max(FETCH_MIN_TOKENS, size);
  return size;
}

/** What a result of this server tool is expected to add, before it arrives. */
const expectedResultTokens = (name, fetchTokens) => (name === 'web_search' ? SEARCH_EXPECTED_TOKENS : name === 'web_fetch' ? Math.min(fetchTokens, FETCH_EXPECTED_MAX) : 1000);

function headerOf(err, name) {
  try {
    const h = err?.headers;
    if (!h) return null;
    if (typeof h.get === 'function') return h.get(name);
    return h[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * The account's output-tokens-per-minute limit from a 429 ("… N output tokens per minute …", or the
 * anthropic-ratelimit-output-tokens-limit header). OTPM is charged from max_tokens when a request starts,
 * so on a low-tier account a large max_tokens fails every time until it is capped. Null when not said.
 */
export function outputTokensLimit(err) {
  if (err?.status !== 429) return null;
  const m = /([\d,]+)\s+output tokens per minute/i.exec(apiDetail(err));
  const limit = m ? Number(m[1].replace(/,/g, '')) : Number(headerOf(err, 'anthropic-ratelimit-output-tokens-limit'));
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

function apiDetail(err) {
  const body = typeof err?.error?.error?.message === 'string' ? err.error.error.message : '';
  return oneLine(redact(body || String(err?.message ?? '')).replace(/^\d{3}\s+/, ''), 240);
}

/** Any thrown value → BrainError (never carries the key). */
export function classifyError(err, sdk) {
  if (err instanceof BrainError) return err;
  const S = sdk ?? {};
  const is = (name) => typeof S[name] === 'function' && err instanceof S[name];
  if (is('APIUserAbortError') || err?.name === 'AbortError') return new BrainError('cancelled', 'Stopped.');
  if (is('APIConnectionError')) return new BrainError('network', 'Could not reach the Claude API (no connection or it timed out).', { retryable: true });
  const status = typeof err?.status === 'number' ? err.status : null;
  const type = err?.type ?? err?.error?.error?.type ?? null;
  if (status === 401 || status === 403 || type === 'authentication_error' || type === 'permission_error') return new BrainError('bad_key', 'Anthropic rejected the home base\'s API key. Give the home base your key again from Jarvis.', { status });
  if (status === 402 || type === 'billing_error' || /credit balance/i.test(apiDetail(err))) return new BrainError('billing', 'Your Anthropic account is out of credits (console.anthropic.com, Billing).', { status });
  if (status === 429 || type === 'rate_limit_error') {
    if (SPEND_LIMIT_CODES.has(err?.errorCode) || SPEND_LIMIT_CODES.has(err?.error?.error?.code)) return new BrainError('billing', 'Your Anthropic account reached its own spend limit (console.anthropic.com, Limits).', { status });
    return new BrainError('rate_limit', 'Anthropic\'s rate limit was reached; try again in a while.', { retryable: true, status });
  }
  if (status === 529 || type === 'overloaded_error') return new BrainError('overloaded', 'Claude is overloaded right now; try again in a while.', { retryable: true, status });
  if (status === 404 || type === 'not_found_error') return new BrainError('model_unavailable', 'This API key cannot use the model the home base asked for.', { status });
  if (status === 400 || type === 'invalid_request_error') return new BrainError('bad_request', `Claude rejected the request: ${apiDetail(err) || 'invalid request'}`, { status });
  if ((status !== null && status >= 500) || status === 408 || type === 'api_error' || type === 'timeout_error') return new BrainError('server', 'Anthropic\'s API had a temporary problem; try again in a while.', { retryable: true, status });
  if (is('AnthropicError') && (err?.cause || /terminated|network|socket|fetch failed|econn|enotfound|eai_again|premature|connection/i.test(String(err?.message)))) {
    return new BrainError('network', 'The connection to the Claude API dropped.', { retryable: true });
  }
  return new BrainError('internal', `Something went wrong: ${oneLine(redact(String(err?.message ?? err)), 200) || 'unknown error'}`);
}

/** Which optional feature a 400 rejects (an unknown beta, or a validation error on its own field). */
function rejectsFallbacks(err, params) {
  if (params.fallbacks === undefined) return false;
  const status = typeof err?.status === 'number' ? err.status : null;
  if (status !== 400) return false;
  const detail = apiDetail(err);
  const beta = /Unexpected value\(s\)\s+`([^`]+)`\s+for the\s+`anthropic-beta`\s+header/i.exec(detail);
  if (beta) return beta[1].split(',').some((v) => /^server-side-fallback-/i.test(v.trim()));
  return /^`?fallbacks`?(?:[.:\s[]|$)/i.test(detail);
}

const RESULT_HOLDER = (b) => b && typeof b.tool_use_id === 'string';

/**
 * The content to send back as the assistant turn of a pause_turn continuation: a plain copy of every
 * block; after a mid-output refusal fallback, the blocks before the last `fallback` block that the API
 * wants left out are dropped (thinking, client tool calls, unpaired server tool calls, unknown types).
 */
export function echoContent(content) {
  let blocks = Array.isArray(content) ? JSON.parse(JSON.stringify(content)).filter((b) => b && typeof b === 'object') : [];
  let boundary = -1;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    if (blocks[i].type === 'fallback') {
      boundary = i;
      break;
    }
  }
  if (boundary > 0) {
    const before = blocks.slice(0, boundary);
    const useIds = new Set(before.filter((b) => b.type === 'server_tool_use').map((b) => b.id));
    const resultIds = new Set(before.filter(RESULT_HOLDER).map((b) => b.tool_use_id));
    const kept = before.filter((b) => {
      if (b.type === 'text' || b.type === 'fallback' || b.type === 'compaction') return true;
      if (b.type === 'server_tool_use') return resultIds.has(b.id);
      if (RESULT_HOLDER(b) && b.type !== 'tool_result') return useIds.has(b.tool_use_id);
      return false;
    });
    blocks = [...kept, ...blocks.slice(boundary)];
  }
  return blocks;
}

/**
 * Web search + web fetch, the only tools the brain ever gives Claude (the same shapes as the app's field
 * agents: src/engine/prompts.js workerTools). The owner's local time and zone go in the prompt instead.
 */
export function webTools({ searches = 5, fetches = 3, fetchMaxContentTokens = 12000 } = {}) {
  const search = { type: 'web_search_20260209', name: 'web_search', max_uses: searches };
  const tools = [search];
  if (fetches > 0) tools.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: fetches, max_content_tokens: fetchMaxContentTokens });
  return tools;
}

// ------------------------------------------------------------------------------------------- sources

function sourceOf(url, title) {
  const u = httpUrl(url);
  if (!u) return null;
  let host = '';
  try {
    host = new URL(u).hostname.replace(/^www\./, '');
  } catch {
    // keep ''
  }
  return { title: oneLine(typeof title === 'string' ? title : '', 160) || host || u, url: u };
}

/** Sources from the responses: cited pages first, then fetched pages, then search results. */
export function collectSources(contents, max = 20) {
  const cited = [];
  const fetched = [];
  const found = [];
  for (const content of contents) {
    for (const b of content) {
      if (b?.type === 'text' && Array.isArray(b.citations)) {
        for (const c of b.citations) {
          const s = sourceOf(c?.url ?? (c?.type === 'search_result_location' ? c?.source : null), c?.title ?? c?.document_title);
          if (s) cited.push(s);
        }
      } else if (b?.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_result') {
        const s = sourceOf(b.content.url, b.content.content?.title);
        if (s) fetched.push(s);
      } else if (b?.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content) if (r?.type === 'web_search_result') {
          const s = sourceOf(r.url, r.title);
          if (s) found.push(s);
        }
      }
    }
  }
  const out = [];
  const seen = new Set();
  for (const s of [...cited, ...fetched, ...(cited.length + fetched.length ? [] : found)]) {
    if (seen.has(s.url) || out.length >= max) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out;
}

/** Runs of text (a server tool block ends a run), across every response. */
export function textRuns(contents) {
  const runs = [];
  let cur = null;
  for (const content of contents) {
    for (const b of content) {
      if (b?.type === 'text' && typeof b.text === 'string') {
        if (!cur) {
          cur = [];
          runs.push(cur);
        }
        cur.push(b.text);
      } else if (b?.type && b.type !== 'thinking' && b.type !== 'redacted_thinking') {
        cur = null;
      }
    }
  }
  return runs.map((r) => r.join('').trim()).filter(Boolean);
}

// ------------------------------------------------------------------------------------------- the client

/**
 * createClaude({ getKey, baseURL, importSdk, log, outputTokensPerSecond, checkEveryMs, onKeyCheck }) →
 *   onKeyCheck(works, key): a request with that key was accepted (true) or Anthropic rejected it (false)
 *   sdkInstalled()                      (best guess without importing it)
 *   await loadSdk()                     the module or null
 *   await verifyKey(key)                'valid' | 'invalid' | 'unknown' (offline, no SDK)
 *   await run(request, ctx)             one conversation: a request plus its pause_turn continuations
 */
export function createClaude({
  getKey,
  baseURL = API_BASE,
  importSdk = () => import('@anthropic-ai/sdk'),
  log = () => {},
  clientOptions = {},
  outputTokensPerSecond = OUTPUT_TOKENS_PER_SECOND,
  checkEveryMs = 1000,
  onKeyCheck = () => {},
} = {}) {
  const base = allowedBase(baseURL);
  if (!base) throw new Error('the Claude API base must be https://api.anthropic.com or a loopback address');
  let sdkPromise = null;
  let sdkState = null; // null unknown, true / false after the first import
  let fallbacksOk = true;
  const maxTokensCap = new Map(); // model → a cap learnt from an output-tokens-per-minute 429
  const inputOverhead = new Map(); // model → input tokens the API adds beyond our estimate (learnt from message_start)
  const inputTokensFor = (params) => estimateInputTokens(params) + (inputOverhead.get(params.model) ?? 0);

  function sdkInstalled() {
    if (sdkState !== null) return sdkState;
    try {
      import.meta.resolve('@anthropic-ai/sdk');
      return true;
    } catch {
      return false;
    }
  }

  function loadSdk() {
    sdkPromise ??= Promise.resolve()
      .then(() => importSdk())
      .then((mod) => {
        sdkState = true;
        return mod;
      })
      .catch(() => {
        sdkState = false;
        sdkPromise = null; // a later npm install is picked up on the next try
        return null;
      });
    return sdkPromise;
  }

  async function makeClient(key, extra = {}) {
    const sdk = await loadSdk();
    if (!sdk) throw new BrainError('sdk_missing', 'The Claude SDK is not installed on the home base (run: jarvis-core update).');
    const Anthropic = sdk.default ?? sdk.Anthropic;
    const client = new Anthropic({ apiKey: key, baseURL: base, maxRetries: 2, timeout: 10 * 60_000, logLevel: 'off', ...clientOptions, ...extra });
    return { sdk, client };
  }

  /** A free check of a key: GET /v1/models. */
  async function verifyKey(key) {
    let sdk = null;
    try {
      const made = await makeClient(key, { maxRetries: 0, timeout: 10_000 });
      sdk = made.sdk;
      await made.client.models.list({ limit: 1 });
      return 'valid';
    } catch (err) {
      if (err instanceof BrainError && err.code === 'sdk_missing') return 'unknown';
      const e = classifyError(err, sdk);
      if (e.code === 'bad_key') return 'invalid';
      log(`the API key could not be checked now (${e.code}); it is kept and checked on first use`);
      return 'unknown';
    }
  }

  /**
   * One conversation. request: { model, system, user, tools, maxTokens, effort, maxContinuations }.
   * ctx: { signal, charge(usd, { partial }), check(estimateUsd) -> null | stop reason,
   *        room(estimateUsd) -> null | { usd, reason } (what is left under the budget and the caps) }.
   * Resolves { stopReason, stopped, contents, messages, costUsd, refusal, truncated }; rejects with a
   * BrainError (code 'cancelled' when ctx.signal aborted).
   */
  async function run(request, ctx) {
    const key = getKey();
    if (!key) throw new BrainError('no_key', 'Give the home base your Claude API key first (Jarvis, Settings, Home base).');
    const { sdk, client } = await makeClient(key);
    const model = request.model;
    const messages = [{ role: 'user', content: [{ type: 'text', text: request.user }] }];
    const contents = [];
    const finals = [];
    let costUsd = 0;
    let container = null;
    let continuations = 0;
    let resends = 0;
    const maxContinuations = request.maxContinuations ?? 4;

    for (;;) {
      if (ctx.signal?.aborted) throw new BrainError('cancelled', 'Stopped.');
      const params = {
        model,
        max_tokens: Math.min(request.maxTokens ?? 16000, maxTokensCap.get(model) ?? Infinity),
        system: [{ type: 'text', text: request.system }],
        messages: [...messages],
        thinking: { type: 'adaptive' },
        output_config: { effort: request.effort ?? 'medium' },
      };
      if (request.tools?.length) params.tools = request.tools;
      // Research continues after pause_turn with the same, growing prefix: let the API cache it.
      if (request.cache) params.cache_control = { type: 'ephemeral' };
      if (container) params.container = container;
      if (fallbacksOk && FALLBACK_MODELS.has(model)) {
        params.fallbacks = 'default';
        params.betas = [BETA_FALLBACK];
      }
      // The request may cost at most the room left under the budget and the caps: its input, then what
      // max_tokens lets it write (thinking included). Too little room for a useful answer: not sent.
      let limitedBy = null;
      let fitted = null;
      const room = typeof ctx.room === 'function' ? ctx.room(costUsd) : null;
      if (room && Number.isFinite(room.usd)) {
        const price = priceOf(model);
        const inputTokens = inputTokensFor(params);
        const fit = Math.floor(((room.usd - (inputTokens * price.inPerM) / 1e6) * 1e6) / price.outPerM);
        if (!(fit >= MIN_REQUEST_TOKENS)) {
          return { stopReason: null, stopped: room.reason, contents, messages: finals, costUsd, refusal: null, truncated: false };
        }
        if (fit < params.max_tokens) {
          params.max_tokens = fit;
          limitedBy = room.reason;
        }
        if (resends < 2) fitted = { usd: room.usd, inputTokens };
      }
      let once;
      try {
        once = await streamOnce({ sdk, client, params, ctx, spentSoFar: costUsd, fitted, key });
      } catch (err) {
        if (err?.code === 'bad_key') noteKey(false, key);
        throw err;
      }
      if (once.resendWithInput) {
        // The input was far larger than estimated, so max_tokens did not fit: stopped before it wrote
        // anything, and sent again with what the input really is.
        costUsd += once.costUsd;
        resends += 1;
        inputOverhead.set(model, Math.max(inputOverhead.get(model) ?? 0, once.resendWithInput - fitted.inputTokens));
        log(`a request to ${model} had ${once.resendWithInput} input tokens, more than estimated; sending it again with a max_tokens that fits the spending limits`);
        continue;
      }
      if (once.retryWithoutFallbacks) {
        fallbacksOk = false;
        log('this API key does not take server-side fallbacks; continuing without them');
        continue;
      }
      if (once.capMaxTokens) {
        maxTokensCap.set(model, once.capMaxTokens);
        log(`this API key allows ${once.otpm} output tokens a minute on ${model}; asking for at most ${once.capMaxTokens}`);
        continue;
      }
      costUsd += once.costUsd;
      const message = once.message;
      if (message?.container && typeof message.container.id === 'string') container = message.container.id;
      const content = echoContent(message?.content ?? []);
      contents.push(content);
      if (message) finals.push(message);
      if (once.stopped) return { stopReason: message?.stop_reason ?? null, stopped: once.stopped, contents, messages: finals, costUsd, refusal: null, truncated: false };
      const stop = message.stop_reason;
      if (stop === 'refusal') {
        return { stopReason: stop, stopped: null, contents, messages: finals, costUsd, refusal: { category: message.stop_details?.category ?? null }, truncated: false };
      }
      if (stop === 'pause_turn' || stop === 'compaction') {
        const reason = ctx.check?.(costUsd);
        if (reason) return { stopReason: stop, stopped: reason, contents, messages: finals, costUsd, refusal: null, truncated: false };
        if (continuations >= maxContinuations) return { stopReason: stop, stopped: 'continuations', contents, messages: finals, costUsd, refusal: null, truncated: false };
        continuations += 1;
        if (content.length) messages.push({ role: 'assistant', content });
        continue;
      }
      // Cut short by a max_tokens lowered to fit the room: it stopped at the cap or the budget.
      if (stop === 'max_tokens' && limitedBy) return { stopReason: stop, stopped: limitedBy, contents, messages: finals, costUsd, refusal: null, truncated: false };
      return { stopReason: stop, stopped: null, contents, messages: finals, costUsd, refusal: null, truncated: stop === 'max_tokens' };
    }
  }

  /**
   * One streamed request. Charges its cost (or, for a request cut short, the estimate of what it spent)
   * through ctx. The live estimate (see the top of this file) is checked on every event and every
   * `checkEveryMs`; the check also counts the round a running server tool will start (its result read
   * with everything before it), so a request stops before that round rather than after it.
   */
  function noteKey(works, key) {
    try {
      onKeyCheck(works, key);
    } catch {
      // never breaks a request
    }
  }

  async function streamOnce({ sdk, client, params, ctx, spentSoFar, fitted = null, key = null }) {
    const model = params.model;
    const price = priceOf(model);
    const inUsd = price.inPerM / 1e6;
    const outUsd = price.outPerM / 1e6;
    const fetchTokens = fetchTokensOf(params.tools);
    let prompt = null; // the first round's input from message_start (uncached, cache writes, cache reads)
    let chars = 0;
    let searches = 0;
    let resultTokens = 0;
    let rereadUsd = 0; // every later round reads the prompt, what was written and the results again
    let pendingTokens = 0; // a server tool is running: its result, about to be read
    let writingMs = 0;
    let writingSince = null; // the model is writing (or thinking) since then; null while a tool runs
    const open = new Map(); // block index → { type, name }
    let started = false;
    let stopped = null;
    let resend = 0;
    let sinceCheck = 0;
    const stream = client.beta.messages.stream(params, { signal: ctx.signal });
    const promptUsd = () => tokenCost(model, prompt);
    const writtenTokens = () => {
      const seconds = (writingMs + (writingSince === null ? 0 : Date.now() - writingSince)) / 1000;
      return Math.max(chars / 4, Math.min(params.max_tokens, seconds * outputTokensPerSecond));
    };
    /** What the request has cost so far, on the high side. */
    const spent = () => promptUsd() + rereadUsd + writtenTokens() * outUsd + searches * WEB_SEARCH_USD;
    /** …and what it is committed to: the round a running server tool starts. */
    const committed = () => spent() + (pendingTokens > 0 ? promptUsd() + (writtenTokens() + resultTokens + pendingTokens) * inUsd : 0);
    const check = () => {
      if (stopped || resend || !started) return;
      const reason = ctx.check?.(spentSoFar + committed());
      if (reason) {
        stopped = reason;
        stream.abort();
      }
    };
    const timer = setInterval(() => {
      try {
        check();
      } catch {
        // an accounting slip never breaks the request
      }
    }, checkEveryMs);
    timer.unref?.();
    stream.on('streamEvent', (event) => {
      started = true;
      try {
        if (event.type === 'message_start') {
          const u = event.message?.usage ?? null;
          prompt = u ? { input_tokens: u.input_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens, cache_read_input_tokens: u.cache_read_input_tokens } : null;
          writingSince = Date.now();
          noteKey(true, key); // the API accepted the key
          const tokens = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((sum, k) => sum + (Number.isFinite(u?.[k]) && u[k] > 0 ? u[k] : 0), 0);
          if (fitted && !stopped && tokens > fitted.inputTokens && promptUsd() + params.max_tokens * outUsd > fitted.usd + 0.002) {
            resend = tokens;
            stream.abort();
            return;
          }
          check();
        } else if (event.type === 'content_block_start') {
          const b = event.content_block ?? {};
          const type = typeof b.type === 'string' ? b.type : '';
          open.set(event.index, { type, name: b.name });
          if (type.endsWith('_tool_result')) {
            // A server tool answered: the next round reads everything so far again, the result included.
            pendingTokens = 0;
            resultTokens += resultTokensOf(b);
            rereadUsd += promptUsd() + (writtenTokens() + resultTokens) * inUsd;
          } else if (type === 'server_tool_use' && b.name === 'web_search') searches += 1;
          if (writingSince === null) writingSince = Date.now();
          check();
        } else if (event.type === 'content_block_delta') {
          const d = event.delta ?? {};
          const k = String(d.text ?? '').length + String(d.thinking ?? '').length + String(d.partial_json ?? '').length;
          chars += k;
          sinceCheck += k;
          if (sinceCheck > 400) {
            sinceCheck = 0;
            check();
          }
        } else if (event.type === 'content_block_stop') {
          const b = open.get(event.index);
          open.delete(event.index);
          if (b?.type === 'server_tool_use') {
            // The tool runs on Anthropic's side: no writing meanwhile, and its result will be read.
            if (writingSince !== null) writingMs += Date.now() - writingSince;
            writingSince = null;
            pendingTokens += expectedResultTokens(b.name, fetchTokens);
            check();
          }
        }
      } catch {
        // an accounting slip never breaks the request
      }
    });
    try {
      const final = await stream.finalMessage();
      const message = JSON.parse(JSON.stringify(final));
      const cost = responseCost(message.model || model, message.usage, model);
      ctx.charge?.(cost, { partial: false });
      return { message, costUsd: cost, stopped: null };
    } catch (err) {
      const partialCost = started ? spent() : 0;
      if (resend) {
        if (partialCost > 0) ctx.charge?.(partialCost, { partial: true });
        if (ctx.signal?.aborted) throw new BrainError('cancelled', 'Stopped.');
        return { resendWithInput: resend, costUsd: partialCost };
      }
      if (stopped) {
        ctx.charge?.(partialCost, { partial: true });
        let snapshot = null;
        try {
          snapshot = stream.currentMessage ? JSON.parse(JSON.stringify(stream.currentMessage)) : null;
        } catch {
          snapshot = null;
        }
        return { message: snapshot, costUsd: partialCost, stopped };
      }
      if (!started && rejectsFallbacks(err, params)) return { retryWithoutFallbacks: true, costUsd: 0 };
      const otpm = !started ? outputTokensLimit(err) : null;
      if (otpm) {
        const cap = Math.max(MIN_MAX_TOKENS, Math.floor(otpm * 0.9));
        if (params.max_tokens > cap) return { capMaxTokens: cap, otpm, costUsd: 0 };
      }
      if (partialCost > 0) ctx.charge?.(partialCost, { partial: true });
      if (ctx.signal?.aborted) throw new BrainError('cancelled', 'Stopped.');
      throw classifyError(err, sdk);
    } finally {
      clearInterval(timer);
    }
  }

  return { sdkInstalled, loadSdk, verifyKey, run, base };
}

/** The tool_use input of a named client tool in the last response, or null. */
export function toolInput(result, name) {
  for (let i = result.contents.length - 1; i >= 0; i -= 1) {
    for (const b of result.contents[i]) if (b?.type === 'tool_use' && b.name === name && b.input && typeof b.input === 'object') return b.input;
  }
  return null;
}

/** The last {...} JSON object in a text, or null. */
export function lastJsonObject(text) {
  if (typeof text !== 'string') return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  let candidate = null;
  while ((m = fence.exec(text))) candidate = m[1];
  const tries = candidate ? [candidate] : [];
  const start = text.lastIndexOf('{');
  if (start >= 0) {
    // Widen to the first "{" that parses through the end.
    for (let i = text.indexOf('{'); i >= 0 && i <= start; i = text.indexOf('{', i + 1)) tries.push(text.slice(i, text.lastIndexOf('}') + 1));
  }
  for (const t of tries) {
    try {
      const v = JSON.parse(t.trim());
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch {
      // next
    }
  }
  return null;
}
