// Engine-level retries. The SDK makes at most one quick retry of its own (the lead) or none
// (workers), so waiting for a rate limit is visible to the owner instead of a silent stall:
// waits follow the API's retry-after (capped), else grow with each attempt, plus a little jitter
// so agents rejected together do not all come back at the same moment. No DOM access here.

import { retryAfterMs } from './client.js';
import { sleep } from './util.js';

/** Attempts per error kind, the first try included. */
export const RETRY_ATTEMPTS = Object.freeze({ rate_limit: 5, overloaded: 5, server: 3, network: 3 });

/**
 * Whether a failed attempt should be tried again: rate limits, overload and transient server
 * errors (also mid-stream), and connection failures before any output (a connection lost
 * mid-stream is an interruption the owner resumes). `attempts` counts the attempts made so far.
 */
export function shouldRetry(err, info, attempts) {
  const max = RETRY_ATTEMPTS[info?.kind];
  if (!max || attempts >= max) return false;
  if (info.kind === 'network' && err?.jarvisStarted) return false;
  return true;
}

/** Wait before the next attempt: retry-after (capped at maxWaitMs), else baseMs × attempts; plus up to 2 s of jitter. */
export function retryDelayMs(err, attempts, { baseMs, maxWaitMs, random = Math.random }) {
  const asked = retryAfterMs(err);
  const wait = asked !== null ? Math.min(maxWaitMs, asked) : baseMs * Math.max(1, attempts);
  const jitter = random() * Math.min(2000, baseMs * 0.4);
  return Math.max(0, Math.round(wait + jitter));
}

/** Short words for the owner: what happened, before "— retrying in Ns". */
export function retryLabel(kind) {
  if (kind === 'rate_limit') return 'Rate limited';
  if (kind === 'overloaded') return 'Claude is busy';
  if (kind === 'network') return 'Connection dropped';
  return 'Anthropic’s API had a hiccup';
}

/**
 * Sleeps `ms` (rejects with an AbortError when `signal` aborts), calling onTick(secondsLeft)
 * whenever the whole number of seconds left changes, for a live countdown (… 3, 2, 1).
 */
export async function countdown(ms, signal, onTick) {
  const end = Date.now() + Math.max(0, ms);
  for (;;) {
    const left = end - Date.now();
    if (left <= 0) return;
    const seconds = Math.ceil(left / 1000);
    onTick?.(seconds);
    // Wake when the number shown changes: at the next whole second before the end.
    await sleep(Math.max(1, left - (seconds - 1) * 1000), signal);
  }
}
