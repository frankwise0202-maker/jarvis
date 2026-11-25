// Token buckets per client key ("local", "tailscale:<login>"). Bounded: idle, full buckets are forgotten.

export function createRateLimiter({ capacity, refillPerSec, maxKeys = 500, now = () => Date.now() }) {
  const buckets = new Map();

  function prune(t) {
    for (const [k, b] of buckets) {
      const level = Math.min(capacity, b.tokens + ((t - b.at) / 1000) * refillPerSec);
      if (level >= capacity) buckets.delete(k);
    }
    while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value);
  }

  /** Take one token: { ok, retryAfterSec, remaining }. */
  function take(key, cost = 1) {
    const t = now();
    let b = buckets.get(key);
    if (!b) {
      if (buckets.size >= maxKeys) prune(t);
      b = { tokens: capacity, at: t };
      buckets.set(key, b);
    } else {
      b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 1000) * refillPerSec);
      b.at = t;
    }
    if (b.tokens >= cost) {
      b.tokens -= cost;
      return { ok: true, retryAfterSec: 0, remaining: Math.floor(b.tokens) };
    }
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cost - b.tokens) / refillPerSec)), remaining: 0 };
  }

  return {
    take,
    get size() {
      return buckets.size;
    },
  };
}
