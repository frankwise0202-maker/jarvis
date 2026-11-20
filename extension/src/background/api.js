// The Claude API, through the official SDK (@anthropic-ai/sdk, the same version as the app).
//
// The SDK runs in the MV3 service worker as-is: it only needs fetch, streams and AbortSignal.
// `dangerouslyAllowBrowser` is set because the request comes from the owner's own browser with
// the owner's own key (the SDK then sends the anthropic-dangerous-direct-browser-access header the
// API requires for browser-origin calls). The key is read from chrome.storage.local per task and
// goes only to the API base URL, which is api.anthropic.com in release builds.
//
// Requests stream, use adaptive thinking, prompt caching (top-level cache_control plus a
// breakpoint at the end of the frozen system prompt), server-side refusal fallbacks and
// progress-update thinking on the models that support them. pause_turn and refusals are handled
// by the agent loop (agent.js).

import Anthropic, {
  APIError,
  APIUserAbortError,
  APIConnectionError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  BadRequestError,
  NotFoundError,
} from '@anthropic-ai/sdk';
import { MODELS } from './models.js';
import { jsonCopy, singleLine, truncate } from '../shared/util.js';

export const BETA_FALLBACK = 'server-side-fallback-2026-07-01';
export const BETA_UPDATES = 'thinking-display-updates-2026-08-18';
// Room for a long answer after adaptive thinking (requests stream, so a large cap is fine; only
// what is generated is billed). A reply that still hits it is continued in a new user turn.
export const MAX_TOKENS = 32000;
export const MIN_MAX_TOKENS = 2048;

export function createClient({ apiKey, baseURL, fetch } = {}) {
  return new Anthropic({
    apiKey,
    baseURL: baseURL || undefined,
    dangerouslyAllowBrowser: true,
    // The agent loop retries itself (honouring retry-after) and shows the owner each wait; the
    // SDK's own retries would wait silently.
    maxRetries: 0,
    timeout: 10 * 60 * 1000,
    ...(typeof fetch === 'function' ? { fetch } : {}),
  });
}

/**
 * The request body. `features` turns optional betas on (each is switched off for the rest of the
 * session if the account rejects it). Never sends temperature/top_p/top_k, budget_tokens,
 * disabled thinking, forced tool_choice or an assistant prefill.
 */
export function buildParams({ model, system, tools, messages, features = {}, maxTokens = MAX_TOKENS }) {
  const m = MODELS[model] || MODELS['claude-sonnet-5-5'];
  const updates = features.updates !== false && m.progressUpdates;
  const params = {
    model,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools,
    messages,
    thinking: { type: 'adaptive', display: updates ? 'updates' : 'omitted' },
    output_config: { effort: m.effort },
    cache_control: { type: 'ephemeral' },
  };
  const betas = [];
  if (updates) betas.push(BETA_UPDATES);
  if (features.fallbacks !== false && m.fallbacks) {
    params.fallbacks = 'default';
    betas.push(BETA_FALLBACK);
  }
  if (betas.length) params.betas = betas;
  return params;
}

/**
 * Streams one request. `onEvent(event)` sees every raw stream event. Resolves with a plain-JSON
 * copy of the final message. On failure the error carries `jarvisStarted` (whether any event
 * arrived) and `jarvisUsage` (the input side from message_start, to bill a cut-short request).
 */
export async function streamMessage({ client, params, signal, onEvent }) {
  let started = false;
  let startUsage = null;
  let startModel = null;
  let chars = 0;
  const stream = client.beta.messages.stream(params, { signal });
  stream.on('streamEvent', (event) => {
    started = true;
    try {
      if (event.type === 'message_start') {
        startUsage = event.message?.usage || null;
        startModel = event.message?.model || null;
      } else if (event.type === 'content_block_delta') {
        const d = event.delta || {};
        chars += String(d.text ?? '').length + String(d.thinking ?? '').length + String(d.partial_json ?? '').length;
      }
      onEvent?.(event);
    } catch (err) {
      console.error('[jarvis] stream handler failed:', err?.message || err);
    }
  });
  try {
    const final = await stream.finalMessage();
    const message = jsonCopy(final);
    if (!Array.isArray(message.content)) message.content = [];
    return message;
  } catch (err) {
    if (err && typeof err === 'object') {
      try {
        err.jarvisStarted = started;
        if (startUsage) {
          err.jarvisUsage = { model: startModel, usage: { ...startUsage, output_tokens: Math.max(Number(startUsage.output_tokens) || 0, Math.ceil(chars / 4)) } };
        }
      } catch {
        /* frozen error */
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Errors

export function apiErrorDetail(err) {
  if (!err) return '';
  const fromBody = typeof err.error?.error?.message === 'string' ? err.error.error.message : '';
  return singleLine((fromBody || String(err.message || '')).replace(/^\d{3}\s+/, ''));
}

export function isAbortError(err) {
  return err instanceof APIUserAbortError || err?.name === 'AbortError';
}

const NETWORK = /terminated|network|socket|fetch failed|failed to fetch|load failed|connection|premature|stream ended/i;

/** { kind, message, retryable } for anything the API call threw. */
export function classifyError(err) {
  if (isAbortError(err)) return { kind: 'aborted', message: 'Stopped.', retryable: false };
  if (err instanceof APIConnectionError) return { kind: 'network', message: 'Connection lost. Check your internet connection, then press Retry.', retryable: true };
  if (err instanceof APIError) {
    const status = err.status;
    const type = err.error?.error?.type;
    const detail = apiErrorDetail(err);
    if (err instanceof AuthenticationError || status === 401) return { kind: 'auth', message: 'Your API key was rejected. Check it in Settings → API key.', retryable: false };
    if (err instanceof PermissionDeniedError || status === 403) return { kind: 'auth', message: "Your API key isn't allowed to make this request. Check the key at console.anthropic.com.", retryable: false };
    if (status === 402 || type === 'billing_error' || /credit balance/i.test(detail)) return { kind: 'billing', message: 'Your Anthropic account is out of credits. Add credits at console.anthropic.com → Billing.', retryable: false };
    if (err instanceof RateLimitError || status === 429) {
      if (/spend limit/i.test(detail)) return { kind: 'billing', message: 'Your Anthropic account has reached its spend limit. Raise it at console.anthropic.com → Limits.', retryable: false };
      return { kind: 'rate_limit', message: 'Anthropic’s rate limit was reached. Wait a moment, then press Retry.', retryable: true };
    }
    if (status === 529 || type === 'overloaded_error') return { kind: 'overloaded', message: 'Claude is overloaded right now. Try again in a moment.', retryable: true };
    if (err instanceof NotFoundError || status === 404) return { kind: 'not_found', message: "This API key can't use the selected model. Pick another model in Settings.", retryable: false };
    if (err instanceof BadRequestError || status === 400) {
      if (/prompt is too long|context window/i.test(detail)) return { kind: 'context', message: 'This conversation is too long. Start a new chat to continue.', retryable: false };
      return { kind: 'bad_request', message: `Claude rejected the request: ${truncate(detail || 'invalid request', 240)}`, retryable: false };
    }
    if ((status !== undefined && status >= 500) || type === 'api_error') return { kind: 'server', message: 'Anthropic’s API had a temporary problem. Press Retry in a moment.', retryable: true };
    return { kind: 'unknown', message: `Something went wrong: ${truncate(detail || 'unexpected API error', 240)}`, retryable: false };
  }
  if (NETWORK.test(String(err?.message || ''))) return { kind: 'network', message: 'Connection lost. Check your internet connection, then press Retry.', retryable: true };
  return { kind: 'unknown', message: `Something went wrong: ${truncate(singleLine(err?.message ?? err) || 'unknown error', 240)}`, retryable: false };
}

/**
 * Which optional feature a 400 rejects ('fallbacks' | 'updates'), from the error's shape: an
 * unknown anthropic-beta value naming the feature's beta, or a validation error on its field.
 */
export function unsupportedFeature(err, params) {
  if (!(err instanceof APIError) || err.status !== 400) return null;
  const detail = apiErrorDetail(err);
  const beta = /Unexpected value\(s\)\s+`([^`]+)`\s+for the\s+`anthropic-beta`\s+header/i.exec(detail);
  if (beta) {
    const values = beta[1].split(',').map((v) => v.trim());
    if (params?.fallbacks !== undefined && values.some((v) => v.startsWith('server-side-fallback-'))) return 'fallbacks';
    if (params?.thinking?.display === 'updates' && values.some((v) => v.startsWith('thinking-display-updates-'))) return 'updates';
    return null;
  }
  if (params?.fallbacks !== undefined && /^`?fallbacks`?(?:[.:\s[]|$)/i.test(detail)) return 'fallbacks';
  if (params?.thinking?.display === 'updates' && /thinking\.display|display/i.test(detail) && /thinking/i.test(detail)) return 'updates';
  return null;
}

/** The output-tokens-per-minute limit a 429 names, or null. */
export function outputTokensLimit(err) {
  if (!(err instanceof APIError) || err.status !== 429) return null;
  const m = /([\d,]+)\s+output tokens per minute/i.exec(apiErrorDetail(err));
  const limit = m ? Number(m[1].replace(/,/g, '')) : null;
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

/**
 * The output cap a 400 names when max_tokens is above what the model allows ("max_tokens: 64000 >
 * 32000, which is the maximum allowed number of output tokens for …"), or null.
 */
export function maxTokensLimit(err) {
  if (!(err instanceof APIError) || err.status !== 400) return null;
  const m = /max_tokens:\s*([\d,]+)\s*>\s*([\d,]+)/i.exec(apiErrorDetail(err));
  const limit = m ? Number(m[2].replace(/,/g, '')) : null;
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

/** A 400 from preserved thinking's history check (a replayed thinking block no longer matches). */
export function isThinkingMismatch(err) {
  if (!(err instanceof APIError) || err.status !== 400) return false;
  return /bound to a different conversation|thinking block prefix mismatch|prefix_mismatch_behavior|invalid `?signature`? in `?thinking`? block/i.test(apiErrorDetail(err));
}
