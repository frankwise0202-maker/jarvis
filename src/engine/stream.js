// Shared request plumbing for lead and worker calls: parameter building, one streamed request,
// the optional-feature auto-disable retry, the rules for echoing assistant content back, and
// helpers for sources and usage. No DOM access here.

import { costOf, supportsFallbacks } from './models.js';
import { hostnameOf, jsonCopy, singleLine } from './util.js';
import { unsupportedFeature } from './client.js';

export const BETA_FALLBACK = 'server-side-fallback-2026-07-01';
export const BETA_COMPACT = 'compact-2026-01-12';

/**
 * Request body per SPEC 8.2. Never sends temperature/top_p/top_k, budget_tokens, disabled thinking,
 * tool_choice or an assistant prefill. `betas` is omitted entirely when empty (an empty list would
 * still produce an empty anthropic-beta header).
 */
export function buildMessageParams({ model, maxTokens, system, tools, messages, showThinking, effort, features, compaction = false }) {
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
  const betas = [];
  if (features?.fallbacks && supportsFallbacks(model)) {
    params.fallbacks = 'default';
    betas.push(BETA_FALLBACK);
  }
  if (compaction && features?.compaction) {
    params.context_management = { edits: [{ type: 'compact_20260112' }] };
    betas.push(BETA_COMPACT);
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
export async function streamMessage({ client, params, signal, onEvent, state = {} }) {
  state.started = false;
  const rawByIndex = new Map();
  const idByIndex = new Map();
  const stream = client.beta.messages.stream(params, { signal });
  stream.on('streamEvent', (event, snapshot) => {
    state.started = true;
    try {
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
  const final = await stream.finalMessage();
  const message = jsonCopy(final);
  if (!Array.isArray(message.content)) message.content = [];
  const rawInputs = new Map();
  for (const [index, raw] of rawByIndex) {
    const id = idByIndex.get(index);
    if (id) rawInputs.set(id, raw);
  }
  return { message, rawInputs };
}

/**
 * streamMessage with the SPEC 8.2 feature auto-disable path: if the request fails with a 400 before
 * any output and the error names server-side fallbacks or compaction, `ctx.disableFeature(name)` is
 * called (notice + deps.onFeatureUnsupported) and the same request is sent once more without it.
 * `makeParams(features)` builds the body from the current feature flags.
 */
export async function requestWithFeatureFallback(ctx, makeParams, onEvent) {
  for (let attempt = 0; ; attempt++) {
    const params = makeParams(ctx.features);
    const state = { started: false };
    try {
      return await streamMessage({ client: ctx.client, params, signal: ctx.signal, onEvent, state });
    } catch (err) {
      // `params` carried the feature, so the retry (built from the now-off flag) cannot loop. A
      // concurrent request may already have switched the flag off; it still gets its one retry.
      const feature = !state.started && attempt < 2 ? unsupportedFeature(err, params) : null;
      if (feature) {
        if (ctx.features[feature]) ctx.disableFeature(feature);
        continue;
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
 * Per-response usage in the engine's shape. Server-side compaction work is reported only in
 * `usage.iterations` (not in the top-level fields), so it is added here.
 */
export function usageDelta(usage) {
  const out = {
    input: n(usage?.input_tokens),
    output: n(usage?.output_tokens),
    cacheWrite: n(usage?.cache_creation_input_tokens),
    cacheRead: n(usage?.cache_read_input_tokens),
    searches: n(usage?.server_tool_use?.web_search_requests),
    fetches: n(usage?.server_tool_use?.web_fetch_requests),
  };
  for (const it of compactionIterations(usage)) {
    out.input += n(it.input_tokens);
    out.output += n(it.output_tokens);
    out.cacheWrite += n(it.cache_creation_input_tokens);
    out.cacheRead += n(it.cache_read_input_tokens);
  }
  return out;
}

/** USD estimate for one response (costOf on the top-level usage plus any compaction iterations). */
export function responseCost(model, usage) {
  let cost = costOf(model, usage);
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
