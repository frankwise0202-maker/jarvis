// What a Claude call costs. The same price table as the Jarvis app (src/engine/models.js, kept in step by
// hand: the Core is installed without the app's folders), USD per million tokens, and web search at $10
// per 1,000 searches (web fetch has no fee beyond its tokens).

export const PRICES = Object.freeze({
  'claude-opus-5-5': Object.freeze({ label: 'Claude Opus 5.5', inPerM: 4.0, outPerM: 20.0, cacheReadPerM: 0.2, cacheWrite5mPerM: 5.0 }),
  'claude-sonnet-5-5': Object.freeze({ label: 'Claude Sonnet 5.5', inPerM: 2.0, outPerM: 10.0, cacheReadPerM: 0.1, cacheWrite5mPerM: 2.5 }),
  'claude-haiku-5-5': Object.freeze({ label: 'Claude Haiku 5.5', inPerM: 0.1, outPerM: 0.5, cacheReadPerM: 0.01, cacheWrite5mPerM: 0.125 }),
  // Models a server-side refusal fallback may hand a reply to.
  'claude-opus-5': Object.freeze({ label: 'Claude Opus 5', inPerM: 5.0, outPerM: 25.0, cacheReadPerM: 0.5, cacheWrite5mPerM: 6.25 }),
  'claude-opus-4-8': Object.freeze({ label: 'Claude Opus 4.8', inPerM: 5.0, outPerM: 25.0, cacheReadPerM: 0.5, cacheWrite5mPerM: 6.25 }),
  'claude-sonnet-5': Object.freeze({ label: 'Claude Sonnet 5', inPerM: 2.0, outPerM: 10.0, cacheReadPerM: 0.2, cacheWrite5mPerM: 2.5 }),
});

export const WEB_SEARCH_USD = 0.01;

/** Price card for a model id; an unknown model is priced as Claude Opus 5.5 (the dearest current one). */
export const priceOf = (model) => PRICES[model] || PRICES['claude-opus-5-5'];

const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Tokens only: uncached input, output, 5-minute cache writes and cache reads. */
export function tokenCost(model, u) {
  if (!u || typeof u !== 'object') return 0;
  const p = priceOf(model);
  return (n(u.input_tokens) * p.inPerM + n(u.output_tokens) * p.outPerM + n(u.cache_creation_input_tokens) * p.cacheWrite5mPerM + n(u.cache_read_input_tokens) * p.cacheReadPerM) / 1e6;
}

/**
 * USD for one response's `usage`. After a server-side refusal fallback `usage.iterations` carries every
 * attempt (each priced at its own model; a 'message' attempt without a model ran on `requestedModel`);
 * compaction work is only reported in the iterations. Web searches are added once.
 */
export function responseCost(model, usage, requestedModel = model) {
  if (!usage || typeof usage !== 'object') return 0;
  const its = Array.isArray(usage.iterations) ? usage.iterations.filter((it) => it && typeof it === 'object') : [];
  const attempts = its.some((it) => it.type === 'fallback_message') ? its.filter((it) => it.type === 'message' || it.type === 'fallback_message') : null;
  let cost = 0;
  if (attempts) {
    for (const it of attempts) cost += tokenCost(it.model || (it.type === 'fallback_message' ? model : requestedModel), it);
  } else {
    cost += tokenCost(model, usage);
  }
  for (const it of its) if (it.type === 'compaction') cost += tokenCost(model, it);
  cost += n(usage.server_tool_use?.web_search_requests) * WEB_SEARCH_USD;
  return cost;
}
