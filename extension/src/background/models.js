// Models Jarvis for Chrome can use, their prices and request settings. Prices are USD per million
// tokens (Claude API list prices); every cost shown is an estimate.

export const MODELS = Object.freeze({
  'claude-sonnet-5-5': Object.freeze({
    label: 'Claude Sonnet 5.5',
    short: 'Sonnet 5.5',
    blurb: 'Recommended: quick, capable and affordable for browser tasks.',
    inPerM: 2.0,
    outPerM: 10.0,
    cacheReadPerM: 0.1,
    cacheWrite5mPerM: 2.5,
    effort: 'medium',
    fallbacks: true, // server-side refusal fallback ('default')
    progressUpdates: true, // thinking.display "updates"
  }),
  'claude-opus-5-5': Object.freeze({
    label: 'Claude Opus 5.5',
    short: 'Opus 5.5',
    blurb: 'Most capable; about twice the cost.',
    inPerM: 4.0,
    outPerM: 20.0,
    cacheReadPerM: 0.2,
    cacheWrite5mPerM: 5.0,
    effort: 'medium',
    fallbacks: true,
    progressUpdates: true,
  }),
  'claude-haiku-5-5': Object.freeze({
    label: 'Claude Haiku 5.5',
    short: 'Haiku 5.5',
    blurb: 'Fastest and cheapest; best for simple tasks.',
    inPerM: 0.1,
    outPerM: 0.5,
    cacheReadPerM: 0.01,
    cacheWrite5mPerM: 0.125,
    effort: 'medium',
    fallbacks: false,
    progressUpdates: false,
  }),
});

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const MODEL_IDS = Object.freeze(Object.keys(MODELS));

/** Models a server-side refusal fallback may hand a reply to (priced, never selectable). */
const FALLBACK_PRICES = Object.freeze({
  'claude-sonnet-5': { inPerM: 2.0, outPerM: 10.0, cacheReadPerM: 0.2, cacheWrite5mPerM: 2.5 },
  'claude-opus-5': { inPerM: 5.0, outPerM: 25.0, cacheReadPerM: 0.5, cacheWrite5mPerM: 6.25 },
  'claude-opus-4-8': { inPerM: 5.0, outPerM: 25.0, cacheReadPerM: 0.5, cacheWrite5mPerM: 6.25 },
});

export function priceOf(model) {
  return MODELS[model] || FALLBACK_PRICES[model] || MODELS[DEFAULT_MODEL];
}

export function isModel(id) {
  return Object.prototype.hasOwnProperty.call(MODELS, id);
}

const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** USD estimate for one usage object (input, output, 5-minute cache writes, cache reads). */
export function costOf(model, usage) {
  if (!usage || typeof usage !== 'object') return 0;
  const p = priceOf(model);
  return (
    (n(usage.input_tokens) * p.inPerM +
      n(usage.output_tokens) * p.outPerM +
      n(usage.cache_creation_input_tokens) * p.cacheWrite5mPerM +
      n(usage.cache_read_input_tokens) * p.cacheReadPerM) /
    1e6
  );
}

/**
 * USD estimate for one response. After a server-side refusal fallback, usage.iterations holds
 * each attempt (priced at its own model); otherwise the top-level usage is the whole bill.
 */
export function responseCost(model, usage, requestedModel = model) {
  const its = Array.isArray(usage?.iterations) ? usage.iterations : [];
  if (its.some((it) => it && it.type === 'fallback_message')) {
    let cost = 0;
    for (const it of its) {
      if (!it || (it.type !== 'message' && it.type !== 'fallback_message')) continue;
      cost += costOf(it.model || (it.type === 'fallback_message' ? model : requestedModel), it);
    }
    return cost;
  }
  return costOf(model, usage);
}

/** Token totals for display: { input, output, cacheRead, cacheWrite }. */
export function addUsage(target, usage) {
  target.input = n(target.input) + n(usage?.input_tokens);
  target.output = n(target.output) + n(usage?.output_tokens);
  target.cacheRead = n(target.cacheRead) + n(usage?.cache_read_input_tokens);
  target.cacheWrite = n(target.cacheWrite) + n(usage?.cache_creation_input_tokens);
  return target;
}
