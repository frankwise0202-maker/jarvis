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

export const DEPTHS = Object.freeze({
  fast: Object.freeze({ label: 'Fast', leadEffort: 'low', workerEffort: 'low', workerSearches: 3, workerFetches: 2 }),
  balanced: Object.freeze({ label: 'Balanced', leadEffort: 'medium', workerEffort: 'medium', workerSearches: 5, workerFetches: 3 }),
  deep: Object.freeze({ label: 'Deep', leadEffort: 'high', workerEffort: 'high', workerSearches: 8, workerFetches: 5 }),
});

export const MODES = Object.freeze({ auto: 'Auto', quick: 'Quick', swarm: 'Swarm' });

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Price card for a model id; unknown models are priced as Claude Opus 5.5. */
export function priceOf(model) {
  return MODELS[model] || MODELS[DEFAULT_LEAD_MODEL];
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
