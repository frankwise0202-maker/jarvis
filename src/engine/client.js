// Anthropic SDK client factory and error classification. No DOM access here.
//
// Classification uses the SDK's typed error classes and HTTP status first. Two cases have no
// status: an `error` event in the middle of an SSE stream arrives as a plain APIError whose
// `type` names the problem (e.g. "overloaded_error"), and a connection that drops mid-stream
// surfaces as an AnthropicError wrapping the underlying TypeError ("terminated", "network error").

import Anthropic, {
  AnthropicError,
  APIError,
  APIUserAbortError,
  APIConnectionError,
  AuthenticationError,
  PermissionDeniedError,
  PaymentRequiredError,
  RateLimitError,
  BadRequestError,
  NotFoundError,
  ContentTooLargeError,
} from '@anthropic-ai/sdk';
import { MODELS } from './models.js';
import { singleLine, truncate } from './util.js';

export const CLIENT_DEFAULTS = Object.freeze({ maxRetries: 3, timeout: 10 * 60 * 1000 });

/**
 * new Anthropic({ apiKey, baseURL, dangerouslyAllowBrowser: true, maxRetries: 3, timeout: 10 min, fetch }).
 * `clientOptions` (optional, e.g. { maxRetries: 0 } in tests) is merged last.
 */
export function createClient({ apiKey, apiBase, fetch, clientOptions } = {}) {
  const options = {
    apiKey,
    baseURL: apiBase || undefined,
    dangerouslyAllowBrowser: true,
    maxRetries: CLIENT_DEFAULTS.maxRetries,
    timeout: CLIENT_DEFAULTS.timeout,
  };
  if (typeof fetch === 'function') options.fetch = fetch;
  return new Anthropic({ ...options, ...(clientOptions || {}) });
}

// 429 codes that mean "spend cap reached": retrying cannot help until the owner acts.
const SPEND_LIMIT_CODES = new Set(['enforced_spend_limit_reached', 'contract_spend_limit_reached']);

export const ERROR_MESSAGES = Object.freeze({
  auth: 'Your API key was rejected. Check it in Settings → API key.',
  permission: "Your API key isn't allowed to make this request. Check the key and its workspace at console.anthropic.com.",
  missingKey: 'Add your Anthropic API key in Settings → API key.',
  billing: 'Your Anthropic account is out of credits. Add credits at console.anthropic.com → Billing.',
  spendLimit: 'Your Anthropic account has reached its spend limit. Raise it at console.anthropic.com → Limits, or wait for it to reset.',
  rateLimit: 'Anthropic’s rate limit was reached. Wait a moment, then try again.',
  overloaded: 'Claude is overloaded right now. Try again in a moment.',
  server: 'Anthropic’s API had a temporary problem. Try again in a moment.',
  network: 'Connection lost. Check your internet connection, then try again.',
  context: 'This conversation is too long for the model. Start a new chat to continue.',
  aborted: 'Stopped.',
  toolJson: 'Claude produced a malformed tool call. Please try again.',
});

function info(kind, message, { status, retryable = false } = {}) {
  const out = { kind, message, retryable };
  if (typeof status === 'number') out.status = status;
  return out;
}

function modelLabel(model) {
  return MODELS[model]?.label || String(model || 'that model');
}

/** The API's own human-readable message for an APIError, without the "400 " status prefix. */
export function apiErrorDetail(err) {
  if (!err) return '';
  const fromBody = typeof err.apiMessage === 'string' && err.apiMessage
    ? err.apiMessage
    : typeof err.error?.error?.message === 'string'
      ? err.error.error.message
      : '';
  const raw = fromBody || String(err.message || '');
  return singleLine(raw.replace(/^\d{3}\s+/, ''));
}

export function isAbortError(err) {
  return err instanceof APIUserAbortError || err?.name === 'AbortError';
}

/** The SDK's error for streamed tool input that is not JSON at all (eager input streaming). */
export function isToolInputParseError(err) {
  return err instanceof AnthropicError && !(err instanceof APIError) && /Unable to parse tool parameter JSON/i.test(String(err.message));
}

function mentionsContextLimit(detail) {
  // "context_management" (a request parameter) must not count as a context-length problem.
  const text = String(detail || '').replace(/context_management/gi, '');
  return /prompt is too long/i.test(text) || /\bcontext\b/i.test(text);
}

const NETWORK_PATTERN = /terminated|network|socket|fetch failed|failed to fetch|load failed|econn|enotfound|eai_again|stream ended without|request ended without|premature|aborted by the peer|connection/i;

/**
 * Maps any thrown value to ErrorInfo { kind, message, status?, retryable }.
 * kind: auth | billing | rate_limit | overloaded | network | bad_request | not_found | refusal |
 *       aborted | server | context | unknown
 */
export function classifyError(err, { model } = {}) {
  if (!err) return info('unknown', 'Something went wrong.');
  if (isAbortError(err)) return info('aborted', ERROR_MESSAGES.aborted);
  if (err instanceof APIConnectionError) return info('network', ERROR_MESSAGES.network, { retryable: true });

  if (err instanceof APIError) {
    const status = typeof err.status === 'number' ? err.status : undefined;
    const type = typeof err.type === 'string' ? err.type : err.error?.error?.type;
    const detail = apiErrorDetail(err);
    const opts = { status };

    if (err instanceof AuthenticationError || status === 401 || type === 'authentication_error') {
      return info('auth', ERROR_MESSAGES.auth, opts);
    }
    if (err instanceof PermissionDeniedError || status === 403 || type === 'permission_error') {
      return info('auth', ERROR_MESSAGES.permission, opts);
    }
    if (err instanceof PaymentRequiredError || status === 402 || type === 'billing_error') {
      return info('billing', ERROR_MESSAGES.billing, opts);
    }
    if (err instanceof RateLimitError || status === 429 || type === 'rate_limit_error') {
      if (SPEND_LIMIT_CODES.has(err.errorCode)) return info('billing', ERROR_MESSAGES.spendLimit, opts);
      return info('rate_limit', ERROR_MESSAGES.rateLimit, { ...opts, retryable: true });
    }
    if (status === 529 || type === 'overloaded_error') {
      return info('overloaded', ERROR_MESSAGES.overloaded, { ...opts, retryable: true });
    }
    if (err instanceof NotFoundError || status === 404 || type === 'not_found_error') {
      const message = model
        ? `This API key can’t use ${modelLabel(model)}. Pick another model in Settings → AI.`
        : 'That model isn’t available to this API key. Pick another model in Settings → AI.';
      return info('not_found', message, opts);
    }
    if (err instanceof BadRequestError || status === 400 || type === 'invalid_request_error') {
      if (/credit balance/i.test(detail)) return info('billing', ERROR_MESSAGES.billing, opts);
      if (mentionsContextLimit(detail)) return info('context', ERROR_MESSAGES.context, opts);
      return info('bad_request', `Claude rejected the request: ${truncate(detail || 'invalid request', 240)}`, opts);
    }
    if (err instanceof ContentTooLargeError || status === 413 || type === 'request_too_large') {
      return info('context', ERROR_MESSAGES.context, opts);
    }
    if ((status !== undefined && status >= 500) || status === 408 || status === 409 || type === 'api_error' || type === 'timeout_error') {
      return info('server', ERROR_MESSAGES.server, { ...opts, retryable: true });
    }
    return info('unknown', `Something went wrong: ${truncate(detail || 'unexpected API error', 240)}`, opts);
  }

  if (isToolInputParseError(err)) return info('unknown', ERROR_MESSAGES.toolJson, { retryable: true });

  if (err instanceof AnthropicError) {
    // A body stream that dies mid-way is wrapped by the SDK with the original error as `cause`.
    if (err.cause || NETWORK_PATTERN.test(String(err.message))) return info('network', ERROR_MESSAGES.network, { retryable: true });
    return info('unknown', `Something went wrong: ${truncate(singleLine(err.message) || 'unknown error', 240)}`);
  }

  if (err instanceof TypeError && NETWORK_PATTERN.test(String(err.message))) {
    return info('network', ERROR_MESSAGES.network, { retryable: true });
  }
  return info('unknown', `Something went wrong: ${truncate(singleLine(err?.message ?? err) || 'unknown error', 240)}`);
}

/**
 * Which optional request feature a 400 rejects, if any: 'fallbacks' or 'compaction'. Decided from
 * the error's shape, never from a word appearing anywhere in the message (a message can quote the
 * owner's text): an unknown `anthropic-beta` value naming the feature's beta, or a validation error
 * on the feature's own request field ("fallbacks: …", "context_management.edits.0: …"). Only
 * meaningful for errors raised before any output was streamed.
 */
export function unsupportedFeature(err, params) {
  if (!(err instanceof APIError) || !(err instanceof BadRequestError || err.status === 400)) return null;
  const detail = apiErrorDetail(err);
  const beta = /Unexpected value\(s\)\s+`([^`]+)`\s+for the\s+`anthropic-beta`\s+header/i.exec(detail);
  if (beta) {
    const values = beta[1].split(',').map((v) => v.trim());
    if (params?.fallbacks !== undefined && values.some((v) => /^server-side-fallback-/i.test(v))) return 'fallbacks';
    if (params?.context_management !== undefined && values.some((v) => /^compact-/i.test(v))) return 'compaction';
    return null;
  }
  if (params?.fallbacks !== undefined && /^`?fallbacks`?(?:[.:\s\[]|$)/i.test(detail)) return 'fallbacks';
  if (params?.context_management !== undefined && /^`?context_management`?(?:[.:\s\[]|$)/i.test(detail)) return 'compaction';
  return null;
}

const isBadRequest = (err) => err instanceof APIError && (err instanceof BadRequestError || err.status === 400);

/** A 400 about the code-execution `container` (unknown or expired): drop it and try again. */
export function isContainerError(err) {
  return isBadRequest(err) && /\bcontainer\b/i.test(apiErrorDetail(err));
}

/** A 400 from the history check: a replayed thinking block no longer matches its conversation. */
export function isThinkingMismatch(err) {
  if (!isBadRequest(err)) return false;
  const detail = apiErrorDetail(err);
  return /invalid `?signature`? in `?thinking`? block|bound to a different conversation|prefix_mismatch_behavior|thinking block prefix mismatch/i.test(detail);
}

function headerOf(err, name) {
  try {
    const h = err?.headers;
    if (!h) return null;
    if (typeof h.get === 'function') return h.get(name);
    return h[name] ?? h[name.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}

/**
 * The account's output-tokens-per-minute limit when a 429 says it is the limit that was hit:
 * from "… N output tokens per minute …" in the message, or the
 * anthropic-ratelimit-output-tokens-limit header (CORS exposes every header). Else null.
 */
export function outputTokensLimit(err) {
  if (!(err instanceof APIError) || !(err instanceof RateLimitError || err.status === 429)) return null;
  const detail = apiErrorDetail(err);
  const m = /([\d,]+)\s+output tokens per minute/i.exec(detail);
  if (m) {
    const limit = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(limit) && limit > 0 ? limit : null;
  }
  if (!/output tokens/i.test(detail)) return null;
  const header = Number(headerOf(err, 'anthropic-ratelimit-output-tokens-limit'));
  return Number.isFinite(header) && header > 0 ? header : null;
}

/** How long the API asked us to wait (retry-after-ms / retry-after seconds or HTTP date), in ms, or null. */
export function retryAfterMs(err, now = Date.now()) {
  const ms = Number(headerOf(err, 'retry-after-ms'));
  if (Number.isFinite(ms) && ms >= 0 && headerOf(err, 'retry-after-ms') !== null) return ms;
  const raw = headerOf(err, 'retry-after');
  if (raw === null || raw === undefined || raw === '') return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(String(raw));
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
