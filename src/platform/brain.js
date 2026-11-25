// The home base's brain over HTTP (v7.6, SPEC §24): Jarvis Core 1.1's routes for the key, the
// spending limits, research jobs, watchers, the morning briefing and push. Same rules as every home
// base request (src/platform/homebase.js requestHomeBase: credentials omitted, no referrer, never
// cached, a timeout; failures are { ok: false, kind, status?, code?, message? }). Every answer is
// checked by src/lib/brain.js before anything shows it.
//
//   getBrain(base)                       GET    api/brain            -> { ok, brain }
//   saveBrainSettings(base, patch)       PUT    api/brain/settings   -> { ok, brain }
//   sendBrainKey(base, key)              POST   api/brain/key        -> { ok, hint, verified }
//   removeBrainKey(base)                 DELETE api/brain/key        -> { ok }
//   startJob(base, { prompt, depth, title })  POST api/jobs         -> { ok, job }
//   listJobs(base) · getJob(base, id) · deleteJob(base, id)
//   addWatcher(base, { what, every }) · listWatchers(base) · deleteWatcher(base, id) · checkWatcher(base, id)
//   getBriefing(base) · runBriefing(base) · getSpendDays(base, days)
//   pushSubscribe(base, subscription, label) · pushUnsubscribe(base, endpoint) · pushTest(base)
//
// The key: sent once, in the body of POST api/brain/key, to the owner's own home base over Tailscale
// (https). It is never logged, never kept anywhere new and never part of a failure this returns.

import { requestHomeBase } from './homebase.js';
import { brainView, jobView, watcherView, briefingView, spendDaysView, JOB_PROMPT_MAX, WATCH_WHAT_MAX, WATCH_EVERY, JOB_DEPTHS } from '../lib/brain.js';

const KEY_TIMEOUT_MS = 20000; // the Core checks the key with Anthropic (a free GET /v1/models)
const BRIEFING_RUN_TIMEOUT_MS = 90000; // the full briefing is one Claude call with web search
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const idPath = (id) => encodeURIComponent(String(id || ''));
const notBrain = (status = 200) => ({ ok: false, kind: 'notcore', status });

/** GET api/brain: the brain's state (Jarvis Core 1.1). A 1.0 Core answers 404 (src/lib/brain.js: 'old'). */
export async function getBrain(base, opts = {}) {
  const r = await requestHomeBase(base, 'brain', opts);
  if (!r.ok) return r;
  const brain = brainView(r.data);
  return brain ? { ok: true, brain } : notBrain();
}

/** PUT api/brain/settings: any of { limits, briefing, owner }. Answers the whole brain. */
export async function saveBrainSettings(base, patch, opts = {}) {
  const r = await requestHomeBase(base, 'brain/settings', { method: 'PUT', body: isObj(patch) ? patch : {}, ...opts });
  if (!r.ok) return r;
  const brain = brainView(r.data);
  return brain ? { ok: true, brain } : notBrain();
}

/** POST api/brain/key {key}: hands this device's key to the home base. */
export async function sendBrainKey(base, key, opts = {}) {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) return { ok: false, kind: 'nokey' };
  const r = await requestHomeBase(base, 'brain/key', { method: 'POST', body: { key: k }, timeoutMs: KEY_TIMEOUT_MS, ...opts });
  if (!r.ok) return r;
  const d = r.data;
  if (d.ok !== true) return notBrain();
  const hint = typeof d.hint === 'string' && /^…?[A-Za-z0-9_-]{2,6}$/.test(d.hint.trim()) ? d.hint.trim() : '';
  return { ok: true, hint, verified: d.verified === true };
}

/** DELETE api/brain/key (204). */
export async function removeBrainKey(base, opts = {}) {
  const r = await requestHomeBase(base, 'brain/key', { method: 'DELETE', allowEmpty: true, ...opts });
  return r.ok ? { ok: true } : r;
}

/** POST api/jobs: background research. 202 { job }; 409 no_key; 402 spend_cap. */
export async function startJob(base, { prompt, depth = 'quick', title } = {}, opts = {}) {
  const p = typeof prompt === 'string' ? prompt.replace(/\s+/g, ' ').trim().slice(0, JOB_PROMPT_MAX) : '';
  if (!p) return { ok: false, kind: 'empty' };
  const body = { kind: 'research', prompt: p, depth: JOB_DEPTHS.includes(depth) ? depth : 'quick' };
  if (typeof title === 'string' && title.trim()) body.title = title.trim().slice(0, 120);
  const r = await requestHomeBase(base, 'jobs', { method: 'POST', body, ...opts });
  if (!r.ok) return r;
  const job = jobView(isObj(r.data) ? r.data.job : null);
  return job ? { ok: true, job } : notBrain();
}

/** GET api/jobs?limit=50: newest first, without results. */
export async function listJobs(base, { limit = 50 } = {}, opts = {}) {
  const r = await requestHomeBase(base, `jobs?limit=${Math.max(1, Math.min(50, Math.round(Number(limit) || 50)))}`, opts);
  if (!r.ok) return r;
  if (!Array.isArray(r.data.jobs)) return notBrain();
  return { ok: true, jobs: r.data.jobs.map(jobView).filter(Boolean) };
}

/** GET api/jobs/<id>: one job, with its result. */
export async function getJob(base, id, opts = {}) {
  const r = await requestHomeBase(base, `jobs/${idPath(id)}`, opts);
  if (!r.ok) return r;
  const job = jobView(isObj(r.data.job) ? r.data.job : r.data);
  return job ? { ok: true, job } : notBrain();
}

/** DELETE api/jobs/<id>: cancels a queued or running job, or removes a finished one from the list. */
export async function deleteJob(base, id, opts = {}) {
  const r = await requestHomeBase(base, `jobs/${idPath(id)}`, { method: 'DELETE', allowEmpty: true, ...opts });
  if (!r.ok) return r;
  const job = r.data ? jobView(isObj(r.data.job) ? r.data.job : r.data) : null;
  return { ok: true, job };
}

/** POST api/watchers {what, every}: 201 { watcher }. */
export async function addWatcher(base, { what, every = '24h' } = {}, opts = {}) {
  const w = typeof what === 'string' ? what.replace(/\s+/g, ' ').trim().slice(0, WATCH_WHAT_MAX) : '';
  if (!w) return { ok: false, kind: 'empty' };
  const r = await requestHomeBase(base, 'watchers', { method: 'POST', body: { what: w, every: WATCH_EVERY.includes(every) ? every : '24h' }, ...opts });
  if (!r.ok) return r;
  const watcher = watcherView(isObj(r.data) ? r.data.watcher : null);
  return watcher ? { ok: true, watcher } : notBrain();
}

/** GET api/watchers. */
export async function listWatchers(base, opts = {}) {
  const r = await requestHomeBase(base, 'watchers', opts);
  if (!r.ok) return r;
  if (!Array.isArray(r.data.watchers)) return notBrain();
  return { ok: true, watchers: r.data.watchers.map(watcherView).filter(Boolean) };
}

/** DELETE api/watchers/<id>. */
export async function deleteWatcher(base, id, opts = {}) {
  const r = await requestHomeBase(base, `watchers/${idPath(id)}`, { method: 'DELETE', allowEmpty: true, ...opts });
  return r.ok ? { ok: true } : r;
}

/** POST api/watchers/<id>/check: check now. Answers the watcher (or its check job). */
export async function checkWatcher(base, id, opts = {}) {
  const r = await requestHomeBase(base, `watchers/${idPath(id)}/check`, { method: 'POST', body: {}, allowEmpty: true, ...opts });
  if (!r.ok) return r;
  const d = isObj(r.data) ? r.data : {};
  return { ok: true, watcher: watcherView(isObj(d.watcher) ? d.watcher : d), job: jobView(d.job) };
}

/** GET api/briefing: the latest briefing (404 none_yet before the first). */
export async function getBriefing(base, opts = {}) {
  const r = await requestHomeBase(base, 'briefing', opts);
  if (!r.ok) return r;
  const briefing = briefingView(isObj(r.data.briefing) ? r.data.briefing : r.data);
  return briefing ? { ok: true, briefing } : notBrain();
}

/** POST api/briefing/run: makes one now and answers it. */
export async function runBriefing(base, opts = {}) {
  const r = await requestHomeBase(base, 'briefing/run', { method: 'POST', body: {}, timeoutMs: BRIEFING_RUN_TIMEOUT_MS, ...opts });
  if (!r.ok) return r;
  const briefing = briefingView(isObj(r.data.briefing) ? r.data.briefing : r.data);
  return briefing ? { ok: true, briefing } : notBrain();
}

/** GET api/spend?days=30. */
export async function getSpendDays(base, days = 30, opts = {}) {
  const r = await requestHomeBase(base, `spend?days=${Math.max(1, Math.min(62, Math.round(Number(days) || 30)))}`, opts);
  if (!r.ok) return r;
  return { ok: true, ...spendDaysView(r.data) };
}

/** POST api/push/subscribe { subscription: { endpoint, keys: { p256dh, auth } }, label }: 201 { id }. */
export async function pushSubscribe(base, subscription, label, opts = {}) {
  const s = isObj(subscription) ? subscription : {};
  const keys = isObj(s.keys) ? s.keys : {};
  if (typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return { ok: false, kind: 'badsub' };
  const body = { subscription: { endpoint: s.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, label: String(label || 'Browser').slice(0, 40) };
  const r = await requestHomeBase(base, 'push/subscribe', { method: 'POST', body, ...opts });
  if (!r.ok) return r;
  return { ok: true, id: typeof r.data.id === 'string' ? r.data.id.slice(0, 80) : '' };
}

/** DELETE api/push/subscribe { endpoint }. */
export async function pushUnsubscribe(base, endpoint, opts = {}) {
  if (typeof endpoint !== 'string' || !endpoint) return { ok: false, kind: 'badsub' };
  const r = await requestHomeBase(base, 'push/subscribe', { method: 'DELETE', body: { endpoint }, allowEmpty: true, ...opts });
  return r.ok ? { ok: true } : r;
}

/** POST api/push/test: { sent, failed }. */
export async function pushTest(base, opts = {}) {
  const r = await requestHomeBase(base, 'push/test', { method: 'POST', body: {}, ...opts });
  if (!r.ok) return r;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
  return { ok: true, sent: n(r.data.sent), failed: n(r.data.failed) };
}
