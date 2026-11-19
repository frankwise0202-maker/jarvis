// Model catalogue, prices, depth presets and cost estimation.
// Prices are USD per million tokens. All costs shown in the UI are estimates.

export const MODELS = Object.freeze({
  'claude-opus-5-5': Object.freeze({ label: 'Claude Opus 5.5', short: 'Opus 5.5', inPerM: 4.0, outPerM: 20.0, cacheReadPerM: 0.2, cacheWrite5mPerM: 5.0, fallbacks: true, bucket: 'opus' }),
  'claude-sonnet-5-5': Object.freeze({ label: 'Claude Sonnet 5.5', short: 'Sonnet 5.5', inPerM: 2.0, outPerM: 10.0, cacheReadPerM: 0.1, cacheWrite5mPerM: 2.5, fallbacks: true, bucket: 'sonnet' }),
  'claude-haiku-5-5': Object.freeze({ label: 'Claude Haiku 5.5', short: 'Haiku 5.5', inPerM: 0.1, outPerM: 0.5, cacheReadPerM: 0.01, cacheWrite5mPerM: 0.125, fallbacks: false, bucket: 'haiku' }),
});

export const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches; web fetch has no extra fee
export const DEFAULT_LEAD_MODEL = 'claude-opus-5-5';
export const DEFAULT_WORKER_MODEL = 'claude-sonnet-5-5';

// max_tokens per depth. Output-tokens-per-minute rate limits are charged from max_tokens when a
// request starts, so a huge cap can make every request of a new (low-tier) account fail with 429.
// These leave ample room for adaptive thinking plus the answer; a max_tokens stop is handled.
// visualLeadMaxTokens: the lead's budget in conversations that can show holograms (lead tools
// version 4). A vehicle hologram alone is about 11–17K output tokens (the show_hologram schema asks
// for 35–60 parts, at most 80), and adaptive thinking shares the budget. max_tokens is not billed,
// and an output-tokens-per-minute 429 still caps it for the session (stream.js).
export const DEPTHS = Object.freeze({
  fast: Object.freeze({ label: 'Fast', leadEffort: 'low', workerEffort: 'low', workerSearches: 3, workerFetches: 2, leadMaxTokens: 12000, visualLeadMaxTokens: 32000, workerMaxTokens: 8000 }),
  balanced: Object.freeze({ label: 'Balanced', leadEffort: 'medium', workerEffort: 'medium', workerSearches: 5, workerFetches: 3, leadMaxTokens: 16000, visualLeadMaxTokens: 32000, workerMaxTokens: 12000 }),
  deep: Object.freeze({ label: 'Deep', leadEffort: 'high', workerEffort: 'high', workerSearches: 8, workerFetches: 5, leadMaxTokens: 32000, visualLeadMaxTokens: 48000, workerMaxTokens: 16000 }),
});

export const MODES = Object.freeze({ auto: 'Auto', quick: 'Quick', swarm: 'Swarm' });

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Prices of every model that can bill a response: the selectable MODELS plus the models a
 * server-side refusal fallback may hand a reply to (never offered in Settings).
 */
export const PRICES = Object.freeze({
  ...MODELS,
  'claude-opus-5': Object.freeze({ label: 'Claude Opus 5', inPerM: 5.0, outPerM: 25.0, cacheReadPerM: 0.5, cacheWrite5mPerM: 6.25 }),
  'claude-opus-4-8': Object.freeze({ label: 'Claude Opus 4.8', inPerM: 5.0, outPerM: 25.0, cacheReadPerM: 0.5, cacheWrite5mPerM: 6.25 }),
  'claude-sonnet-5': Object.freeze({ label: 'Claude Sonnet 5', inPerM: 2.0, outPerM: 10.0, cacheReadPerM: 0.2, cacheWrite5mPerM: 2.5 }),
});

/** Price card for a model id; unknown models are priced as Claude Opus 5.5. */
export function priceOf(model) {
  return PRICES[model] || MODELS[DEFAULT_LEAD_MODEL];
}

/** True when the model accepts server-side refusal fallbacks (`fallbacks: 'default'`). */
export function supportsFallbacks(model) {
  return MODELS[model]?.fallbacks === true;
}

/** Rate-limit bucket used to share one concurrency limiter between requests to the same model family. */
export function bucketOf(model) {
  return MODELS[model]?.bucket || String(model || 'default');
}

/**
 * USD estimate for one response's `usage`: uncached input, output, 5-minute cache writes,
 * cache reads, plus web searches. Haiku's long-prompt price tier is ignored (estimate only).
 */
export function costOf(model, usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const p = priceOf(model);
  const tokens =
    num(usage.input_tokens) * p.inPerM +
    num(usage.output_tokens) * p.outPerM +
    num(usage.cache_creation_input_tokens) * p.cacheWrite5mPerM +
    num(usage.cache_read_input_tokens) * p.cacheReadPerM;
  return tokens / 1e6 + num(usage.server_tool_use?.web_search_requests) * WEB_SEARCH_USD;
}

/**
 * The approximate cost of one 2D blueprint (shown before the owner builds one): about 6K output
 * tokens with thinking, 4K new input, and about 45K tokens of conversation so far (tools, the
 * hologram's spec). That prefix is a cheap cache read only while the prompt cache is warm (5
 * minutes after the conversation's last request); after that it is written to the cache again.
 */
export function blueprintCostUsd(model, { warm = true } = {}) {
  const p = priceOf(model);
  return (6000 * p.outPerM + 45000 * (warm ? p.cacheReadPerM : p.cacheWrite5mPerM) + 4000 * p.inPerM) / 1e6;
}

/** "≈ $0.15": to the cent below 10 cents, else to the nearest 5 cents. */
export function costLabel(usd) {
  const v = Number.isFinite(usd) && usd > 0 ? usd : 0;
  const shown = v < 0.1 ? v.toFixed(2) : (Math.round(v * 20) / 20).toFixed(2);
  return '≈ $' + shown;
}
