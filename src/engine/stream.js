// Shared request plumbing for lead and worker calls: parameter building, one streamed request,
// the optional-feature auto-disable retry, the rules for echoing assistant content back, and
// helpers for sources and usage. No DOM access here.

import { WEB_SEARCH_USD, costOf, supportsFallbacks } from './models.js';
import { hostnameOf, jsonCopy, singleLine } from './util.js';
import { isContainerError, isThinkingMismatch, outputTokensLimit, unsupportedFeature } from './client.js';

export const BETA_FALLBACK = 'server-side-fallback-2026-07-01';
export const BETA_COMPACT = 'compact-2026-01-12';
export const BETA_THINKING_BINDING = 'thinking-binding-controls-2026-08-01';
/** Never cap max_tokens below this when pacing for an output-tokens-per-minute limit. */
export const MIN_MAX_TOKENS = 1024;

/**
 * Request body per SPEC 8.2. Never sends temperature/top_p/top_k, budget_tokens, disabled thinking,
 * tool_choice or an assistant prefill. `betas` is omitted entirely when empty (an empty list would
 * still produce an empty anthropic-beta header).
 */
export function buildMessageParams({
  model,
  maxTokens,
  system,
  tools,
  messages,
  showThinking,
  effort,
  features,
  compaction = false,
  container = null,
  dropMismatchedThinking = false,
}) {
  const params = {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system }],
  };
  if (Array.isArray(tools) && tools.length) params.tools = tools;
  params.messages = messages;
  params.thinking = { type: 'adaptive', display: showThinking ? 'summarized' : 'omitted' };
  params.output_config = { effort };
  params.cache_control = { type: 'ephemeral' };
  // The code-execution container the web tools' dynamic filtering ran in: container-bound server
  // tools reject a follow-up that omits it. A request field outside system/tools/messages, so the
  // frozen-prefix (history) check is unaffected.
  if (typeof container === 'string' && container) params.container = container;
  const betas = [];
  if (features?.fallbacks && supportsFallbacks(model)) {
    params.fallbacks = 'default';
    betas.push(BETA_FALLBACK);
  }
  if (compaction && features?.compaction) {
    params.context_management = { edits: [{ type: 'compact_20260112' }] };
    betas.push(BETA_COMPACT);
  }
  if (dropMismatchedThinking) {
    // After a history-check failure: drop thinking blocks that fail the check instead of a 400.
    params.thinking.block_binding = { prefix_mismatch_behavior: 'drop_block' };
    betas.push(BETA_THINKING_BINDING);
  }
  if (betas.length) params.betas = betas;
  return params;
}

/**
 * Streams one request with client.beta.messages.stream(params, { signal }).
 * `onEvent(event, snapshot)` sees every raw stream event (errors in it are contained so a UI bug can
 * never break the request). Resolves with { message, rawInputs }: `message` is a plain-JSON deep copy
 * of finalMessage() (drops the SDK's non-enumerable fields) and `rawInputs` maps each tool block id
 * to the exact streamed input JSON text, for strict validation. `state.started` turns true on the
 * first stream event.
 */
export async function streamMessage({ client, params, signal, onEvent, state = {}, requestOptions }) {
  state.started = false;
  const rawByIndex = new Map();
  const idByIndex = new Map();
  // For a request cut short after it started: what it already cost (see accountPartialUsage).
  let startUsage = null;
  let startModel = null;
  let streamedChars = 0;
  const stream = client.beta.messages.stream(params, { signal, ...(requestOptions || {}) });
  stream.on('streamEvent', (event, snapshot) => {
    state.started = true;
    try {
      if (event.type === 'message_start') {
        startUsage = event.message?.usage || null;
        startModel = event.message?.model || null;
      } else if (event.type === 'content_block_delta') {
        const d = event.delta || {};
        streamedChars += String(d.text ?? '').length + String(d.thinking ?? '').length + String(d.partial_json ?? '').length;
      }
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block && typeof block.id === 'string' && (block.type === 'tool_use' || block.type === 'server_tool_use')) {
          idByIndex.set(event.index, block.id);
        }
      } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
        rawByIndex.set(event.index, (rawByIndex.get(event.index) ?? '') + (event.delta.partial_json ?? ''));
      }
      onEvent?.(event, snapshot);
    } catch (err) {
      console.error('[jarvis] stream event handler failed:', err);
    }
  });
  let final;
  try {
    final = await stream.finalMessage();
  } catch (err) {
    // Callers retry only failures that happened before any output (nothing was shown yet).
    if (err && typeof err === 'object') {
      try {
        err.jarvisStarted = !!state.started;
        if (startUsage) err.jarvisPartial = { model: startModel, usage: partialUsage(startUsage, streamedChars) };
      } catch {
        /* frozen error object */
      }
    }
    throw err;
  }
  const message = jsonCopy(final);
  if (!Array.isArray(message.content)) message.content = [];
  const rawInputs = new Map();
  for (const [index, raw] of rawByIndex) {
    const id = idByIndex.get(index);
    if (id) rawInputs.set(id, raw);
  }
  return { message, rawInputs };
}

const tokens = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/**
 * Usage of a response that was cut short (Stop, a dropped connection, a mid-stream error): the
 * input side is final from message_start; the output is estimated from the text streamed so far
 * (about 4 characters a token; the API reports it only at the end).
 */
function partialUsage(start, chars) {
  return {
    input_tokens: tokens(start.input_tokens),
    cache_creation_input_tokens: tokens(start.cache_creation_input_tokens),
    cache_read_input_tokens: tokens(start.cache_read_input_tokens),
    output_tokens: Math.max(tokens(start.output_tokens), Math.ceil(chars / 4)),
  };
}

/**
 * The API bills a request that was cut short for what it processed, so its estimate (attached to
 * the error by streamMessage as `jarvisPartial`) counts toward the turn, agent and spend - once.
 */
export function accountPartialUsage(ctx, err, model, target = null) {
  const partial = err && typeof err === 'object' ? err.jarvisPartial : null;
  if (!partial || partial.accounted) return;
  partial.accounted = true;
  ctx.accountUsage({ model: partial.model || model, usage: partial.usage }, model, target);
}

/**
 * streamMessage with recovery from a rejection that a changed request fixes, decided before any
 * output arrived. `makeParams(features)` builds the body from the current state each time, so a
 * retry sees the change:
 * - an optional feature the account lacks (server-side fallbacks, compaction): switched off via
 *   ctx.disableFeature (notice + deps.onFeatureUnsupported) — SPEC 8.2;
 * - a code-execution container the API no longer accepts: `opts.onContainerRejected()` forgets it;
 * - a thinking block that fails the history check: `opts.onThinkingMismatch()` turns on drop_block;
 * - an output-tokens-per-minute limit below max_tokens (429): `ctx.capMaxTokens(model, cap)`.
 * `opts.requestOptions` (e.g. { maxRetries }) go to the SDK call.
 */
export async function requestWithFeatureFallback(ctx, makeParams, onEvent, opts = {}) {
  for (let recoveries = 0; ; recoveries++) {
    const params = makeParams(ctx.features);
    const state = { started: false };
    try {
      return await streamMessage({ client: ctx.client, params, signal: ctx.signal, onEvent, state, requestOptions: opts.requestOptions });
    } catch (err) {
      // Each recovery changes the request (a flag off, a field gone or capped), so none can loop;
      // the counter is a backstop. A concurrent request may already have switched a flag off; it
      // still gets its one retry.
      if (!state.started && recoveries < 6) {
        const feature = unsupportedFeature(err, params);
        if (feature) {
          if (ctx.features[feature]) ctx.disableFeature(feature);
          continue;
        }
        if (params.container && isContainerError(err)) {
          opts.onContainerRejected?.();
          continue;
        }
        if (!params.thinking?.block_binding && opts.onThinkingMismatch && isThinkingMismatch(err)) {
          opts.onThinkingMismatch();
          continue;
        }
        const otpm = outputTokensLimit(err);
        if (otpm && typeof ctx.capMaxTokens === 'function') {
          const cap = Math.max(MIN_MAX_TOKENS, Math.floor(otpm * 0.9));
          if (params.max_tokens > cap) {
            ctx.capMaxTokens(params.model, cap, otpm);
            continue;
          }
        }
      }
      throw err;
    }
  }
}

const RESULT_HOLDER = (block) => block && typeof block.tool_use_id === 'string';

/**
 * The content to append as the assistant turn, from a response's `content`.
 * - Deep plain-JSON copy; every block type is kept unchanged (unknown types included).
 * - After a mid-output server-side fallback, the blocks before the final `fallback` block that the
 *   API requires us to leave out are dropped: thinking, redacted_thinking, tool_use, server_tool_use
 *   without its result, and unrecognized block types. Text, paired server-tool blocks, compaction and
 *   fallback blocks stay where they were.
 * - `dropUnpairedServerTools` removes server_tool_use blocks that have no result in this content.
 *   Used only for a terminal response (never for a paused one, whose trailing server_tool_use is
 *   completed by the continuation), so history never carries a dangling server tool call.
 */
export function echoContent(content, { dropUnpairedServerTools = false } = {}) {
  let blocks = Array.isArray(content) ? jsonCopy(content).filter((b) => b && typeof b === 'object') : [];
  let boundary = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
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
  if (dropUnpairedServerTools) {
    const resultIds = new Set(blocks.filter(RESULT_HOLDER).map((b) => b.tool_use_id));
    blocks = blocks.filter((b) => b.type !== 'server_tool_use' || resultIds.has(b.id));
  }
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Sources

export function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\/[^\s]+$/i.test(url);
}

function makeSource(url, title, pageAge) {
  const source = { url, title: singleLine(title) || hostnameOf(url) };
  if (typeof pageAge === 'string' && pageAge.trim()) source.pageAge = pageAge.trim();
  return source;
}

/** A Source from a text citation (web_search_result_location carries url + title), else null. */
export function sourceFromCitation(citation) {
  if (!citation || typeof citation !== 'object') return null;
  let url = '';
  if (typeof citation.url === 'string') url = citation.url;
  else if (citation.type === 'search_result_location' && typeof citation.source === 'string') url = citation.source;
  if (!isHttpUrl(url)) return null;
  return makeSource(url, citation.title || citation.document_title || '');
}

/** web_search_tool_result → { ok: true, sources } | { ok: false, errorCode } */
export function readSearchResult(block) {
  const content = block?.content;
  if (Array.isArray(content)) {
    const sources = [];
    for (const item of content) {
      if (item && item.type === 'web_search_result' && isHttpUrl(item.url)) sources.push(makeSource(item.url, item.title, item.page_age));
    }
    return { ok: true, sources: mergeSources(sources) };
  }
  return { ok: false, errorCode: String(content?.error_code || 'unavailable') };
}

/** web_fetch_tool_result → { ok: true, source } | { ok: false, errorCode } */
export function readFetchResult(block) {
  const content = block?.content;
  if (content && content.type === 'web_fetch_result') {
    const url = isHttpUrl(content.url) ? content.url : '';
    if (!url) return { ok: true, source: null };
    return { ok: true, source: makeSource(url, content.content?.title || '') };
  }
  return { ok: false, errorCode: String(content?.error_code || 'unavailable') };
}

/** Dedupe by URL keeping the first occurrence (and filling in a missing page age); optional cap. */
export function mergeSources(list, max = Infinity) {
  const out = [];
  const byUrl = new Map();
  for (const s of list) {
    if (!s || !isHttpUrl(s.url)) continue;
    const seen = byUrl.get(s.url);
    if (seen) {
      if (!seen.pageAge && s.pageAge) seen.pageAge = s.pageAge;
      continue;
    }
    if (out.length >= max) continue;
    const copy = { url: s.url, title: s.title || hostnameOf(s.url) };
    if (s.pageAge) copy.pageAge = s.pageAge;
    byUrl.set(s.url, copy);
    out.push(copy);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Usage and cost

const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

function compactionIterations(usage) {
  return Array.isArray(usage?.iterations) ? usage.iterations.filter((it) => it && it.type === 'compaction') : [];
}

/**
 * After a server-side refusal fallback, `usage.iterations` is the per-attempt source of truth and
 * the top-level usage covers only the attempt that produced the message. Returns the sampling
 * attempts ('message' and 'fallback_message' entries) in that case, else null.
 */
function fallbackAttempts(usage) {
  const its = Array.isArray(usage?.iterations) ? usage.iterations : [];
  if (!its.some((it) => it && it.type === 'fallback_message')) return null;
  return its.filter((it) => it && (it.type === 'message' || it.type === 'fallback_message'));
}

/**
 * Per-response usage in the engine's shape. Server-side compaction work is reported only in
 * `usage.iterations` (not in the top-level fields), so it is added here; after a refusal fallback
 * every attempt's tokens are summed from the iterations.
 */
export function usageDelta(usage) {
  const attempts = fallbackAttempts(usage) || [usage];
  const out = {
    input: 0,
    output: 0,
    cacheWrite: 0,
    cacheRead: 0,
    searches: n(usage?.server_tool_use?.web_search_requests),
    fetches: n(usage?.server_tool_use?.web_fetch_requests),
  };
  for (const it of [...attempts, ...compactionIterations(usage)]) {
    out.input += n(it?.input_tokens);
    out.output += n(it?.output_tokens);
    out.cacheWrite += n(it?.cache_creation_input_tokens);
    out.cacheRead += n(it?.cache_read_input_tokens);
  }
  return out;
}

/**
 * USD estimate for one response: the top-level usage at the model that produced it, plus any
 * compaction iterations. After a refusal fallback each attempt is priced at its own model (a
 * 'message' attempt without a model ran on `requestedModel`), plus the web searches.
 */
export function responseCost(model, usage, requestedModel = model) {
  const attempts = fallbackAttempts(usage);
  let cost = 0;
  if (attempts) {
    for (const it of attempts) cost += costOf(it.model || (it.type === 'fallback_message' ? model : requestedModel), it);
    cost += n(usage?.server_tool_use?.web_search_requests) * WEB_SEARCH_USD;
  } else {
    cost = costOf(model, usage);
  }
  for (const it of compactionIterations(usage)) cost += costOf(model, it);
  return cost;
}

export function addUsage(target, delta) {
  for (const key of ['input', 'output', 'cacheWrite', 'cacheRead', 'searches', 'fetches']) {
    target[key] = n(target[key]) + n(delta[key]);
  }
  return target;
}

export function emptyUsage() {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 0 };
}
