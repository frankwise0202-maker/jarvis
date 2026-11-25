// The home base brain: the key vault, spending and caps, background research jobs, watchers, the morning
// briefing and the notifications they send. One object for the HTTP routes (http/brain-routes.mjs) and
// the runtime; events 'job' | 'watcher' | 'briefing' | 'spend' for the SSE stream.
//
// Files (folders 700, files 600):
//   <secretsDir>/anthropic.key, anthropic.json          the key vault (~/.config/jarvis-core/secrets)
//   <dataDir>/brain/settings-v1.json, spend-v1.json,     settings, the spending ledger,
//                   jobs-v1.json, watchers-v1.json,      the job queue and its results, the watchers,
//                   briefing-v1.json                     the latest briefing
// With persistence off (fixture mode, tests without a data folder) everything stays in memory.

import path from 'node:path';
import { createVault, looksLikeKey } from './vault.mjs';
import { createSpend } from './spend.mjs';
import { defaultSettings, normalizeSettings, validateSettingsBody, applySettingsPatch } from './settings.mjs';
import { createClaude, BRAIN_MODELS, BrainError } from './claude.mjs';
import { createJobs, publicJob } from './jobs.mjs';
import { createWatchers, publicWatcher, WHAT_MAX } from './watchers.mjs';
import { createBriefings } from './briefing.mjs';
import { geocodeCity } from './weather.mjs';
import { PROFILES, runResearch, runWatchCheck, runBriefingCall } from './tasks.mjs';
import { createJsonFile, safeLog, oneLine, redact } from './util.mjs';
import { systemTimeZone, EVERY_MS } from './schedule.mjs';
import { VERSION } from '../version.mjs';
import { fmtDate, fmtClock } from '../format.mjs';

export const APP_URL = 'https://frankwise0202-maker.github.io/jarvis/';
export const PROMPT_MAX = 2000;
const TICK_MS = 30_000;

/** An error the routes turn into { error: code, message } with this HTTP status. */
export class BrainHttpError extends Error {
  constructor(status, code, message, headers = {}) {
    super(redact(message));
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

const capWords = (cap, limits) =>
  cap === 'monthly'
    ? `The home base reached this month's spending limit ($${limits.monthlyUsd}). Raise it in Jarvis, Settings, Home base, or wait for next month.`
    : `The home base reached today's spending limit ($${limits.dailyUsd}). Raise it in Jarvis, Settings, Home base, or wait until tomorrow.`;

/**
 * createBrain({ config, getCore, now, log, timeZone, fetch, push, dataDir, secretsDir, claudeBase,
 *               importSdk, whatsNewFile, rand, tickMs, defaultLocation, claudeTuning })
 */
export function createBrain({
  config = {},
  getCore = () => null,
  now = () => Date.now(),
  log: rawLog = () => {},
  timeZone = systemTimeZone(),
  fetch: fetchFn = globalThis.fetch,
  push = null,
  dataDir = null,
  secretsDir = null,
  claudeBase = undefined,
  importSdk = undefined,
  whatsNewFile = null,
  rand = Math.random,
  tickMs = TICK_MS,
  defaultLocation = null,
  claudeTuning = {},
} = {}) {
  const log = safeLog(rawLog);
  const brainDir = dataDir ? path.join(dataDir, 'brain') : null;
  const file = (name) => createJsonFile({ dir: brainDir, name, log });
  const listeners = { job: new Set(), watcher: new Set(), briefing: new Set(), spend: new Set() };
  const emit = (name, payload) => {
    for (const fn of listeners[name]) {
      try {
        fn(payload);
      } catch (err) {
        log(`brain listener for ${name} failed: ${err?.message ?? err}`);
      }
    }
  };

  // ---- settings
  const settingsFile = file('settings-v1.json');
  const defaults = defaultSettings({ ownerName: config.ownerName ?? 'Frank', units: 'F' });
  if (defaultLocation) defaults.briefing.location = { ...defaultLocation };
  let settings = normalizeSettings(settingsFile.load(), defaults);
  const getSettings = () => settings;
  const syncOwner = () => {
    if (config && settings.owner?.name) config.ownerName = settings.owner.name;
  };
  syncOwner();

  // ---- key vault, Claude, spending
  const vault = createVault({ dir: secretsDir, log, now });
  // claudeTuning (tests only): { outputTokensPerSecond, checkEveryMs } of the live cost estimate.
  const claude = createClaude({ getKey: () => vault.get(), baseURL: claudeBase, importSdk, log, ...claudeTuning });
  const spend = createSpend({ file: file('spend-v1.json'), timeZone, now, limits: () => settings.limits, log });
  let lastSpendEmit = 0;
  let spendTimer = null;
  function emitSpend() {
    const t = Date.now();
    const fire = () => {
      spendTimer = null;
      lastSpendEmit = Date.now();
      emit('spend', spend.summary());
    };
    if (t - lastSpendEmit >= 1000) fire();
    else if (!spendTimer) {
      spendTimer = setTimeout(fire, 1000 - (t - lastSpendEmit));
      spendTimer.unref?.();
    }
  }

  const localTime = () => `${fmtDate(now(), timeZone)}, ${fmtClock(now(), timeZone)}`;

  // ---- notifications (brain-io's push service; never fatal)
  async function notify({ title, body, url, tag }) {
    if (!push || typeof push.notify !== 'function') return { sent: 0, failed: 0 };
    try {
      const r = await push.notify({ title: oneLine(title, 80), body: oneLine(body, 240), url, tag });
      return r ?? { sent: 0, failed: 0 };
    } catch (err) {
      log(`push notification failed: ${err?.message ?? err}`);
      return { sent: 0, failed: 0 };
    }
  }

  // ---- jobs
  let watchers = null;
  const runners = {
    research: (job, ctx) => runResearch({ claude, job, ctx, name: settings.owner.name, localTime: localTime(), timeZone, location: settings.briefing.location }),
    'watch-check': async (job, ctx) => {
      const w = watchers.get(job.watcherId);
      if (!w) return { status: 'cancelled', summary: 'The watcher was removed.' };
      try {
        const check = await runWatchCheck({ claude, watcher: w, ctx, name: settings.owner.name, localTime: localTime(), timeZone });
        const { newlyMet } = watchers.recordResult(w.id, { ...check, costUsd: job.costUsd });
        if (newlyMet) {
          notify({ title: `Watcher: ${oneLine(w.what, 70)}`, body: check.summary, url: `${APP_URL}?homebase=watch:${w.id}`, tag: `watch:${w.id}` });
        }
        return { summary: `${check.met ? 'Met' : 'Not yet'}: ${check.summary}`, result: { markdown: `**${check.met ? 'Met.' : 'Not yet.'}** ${check.summary}`, sources: check.sources } };
      } catch (err) {
        const code = err?.code;
        watchers.recordSkip(w.id, { status: code === 'spend_cap' ? 'blocked' : code === 'no_key' || code === 'sdk_missing' || code === 'bad_key' ? 'paused' : 'watching', costUsd: job.costUsd, note: err?.message });
        throw err;
      }
    },
    briefing: async (job, ctx, extra) => {
      if (!extra?.facts) throw new BrainError('stale', 'This briefing was interrupted by a restart.');
      const out = await runBriefingCall({ claude, facts: extra.facts, ctx, name: settings.owner.name, timeZone });
      return { summary: 'Morning briefing written', result: { markdown: out.markdown, sources: out.headlines.map((h) => ({ title: h.title, url: h.url })) }, output: out };
    },
  };

  function gate(job) {
    if (!vault.get()) return { status: 'failed', code: 'no_key', message: 'The home base has no Claude API key.' };
    if (!claude.sdkInstalled()) return { status: 'failed', code: 'sdk_missing', message: 'The Claude SDK is not installed on the home base (run: jarvis-core update).' };
    const cap = spend.capReached();
    if (cap) return { status: 'blocked', code: 'spend_cap', message: capWords(cap, settings.limits) };
    return null;
  }

  const jobs = createJobs({
    file: file('jobs-v1.json'),
    now,
    log,
    runners,
    gate,
    budgetFor: (job) => (job.kind === 'research' ? PROFILES[job.depth === 'deep' ? 'deep' : 'quick'].budgetUsd : job.kind === 'watch-check' ? PROFILES.watch.budgetUsd : PROFILES.briefing.budgetUsd),
    charge: (v, job, opts) => {
      if (v <= 0 && opts?.partial) return;
      spend.add(v, { calls: 1, briefing: job.kind === 'briefing' });
      emitSpend();
    },
    capCheck: (extra) => spend.capReached(extra),
    capRoom: (extra) => spend.headroom(extra),
    onChange: (j) => emit('job', j),
    onFinish: (job) => {
      if (job.kind === 'research' && ['done', 'failed', 'blocked'].includes(job.status)) {
        const ok = job.status === 'done';
        notify({
          title: ok ? 'Research ready' : 'Research stopped',
          body: ok ? `${job.title}: ${job.summary}` : `${job.title}: ${job.error?.message ?? job.summary}`,
          url: `${APP_URL}?homebase=job:${job.id}`,
          tag: `job:${job.id}`,
        });
      }
      if (job.kind === 'watch-check' && !job.startedAt && job.watcherId) {
        // Refused before it ran (no key, a cap): the watcher says why and waits for its next time.
        watchers.recordSkip(job.watcherId, { status: job.error?.code === 'spend_cap' ? 'blocked' : 'paused', note: job.error?.message });
      }
    },
  });

  const isCheckPending = (wid) => jobs.all().some((j) => j.kind === 'watch-check' && j.watcherId === wid && (j.status === 'queued' || j.status === 'running'));

  watchers = createWatchers({
    file: file('watchers-v1.json'),
    now,
    rand,
    log,
    onChange: (w) => emit('watcher', w),
    isCheckPending,
    enqueueCheck(w) {
      if (!vault.get() || !claude.sdkInstalled()) {
        watchers.recordSkip(w.id, { status: 'paused', note: 'No Claude API key on the home base.' });
        return false;
      }
      if (spend.capReached()) {
        watchers.recordSkip(w.id, { status: 'blocked', note: capWords(spend.capReached(), settings.limits) });
        return false;
      }
      try {
        jobs.create({ kind: 'watch-check', prompt: w.what, title: `Check: ${w.what}`, watcherId: w.id });
        return true;
      } catch {
        return false;
      }
    },
  });

  // ---- briefing
  // Right after a start (the machine booted at 08:00, an update at 06:59) the scheduled briefing waits for
  // the Core's first readings and the network: until the internet check is up (15 s at the least), or 2
  // minutes at most. A simulated home base (fixture mode) has no network to wait for.
  function briefingReady() {
    if (config?.fixture) return true;
    const core = getCore();
    const startedAt = core?.startedAt;
    if (!core || !Number.isFinite(startedAt)) return true;
    const up = now() - startedAt;
    if (up >= 120_000) return true;
    return up >= 15_000 && core.snapshot?.services?.internet?.status === 'up';
  }

  const briefings = createBriefings({
    file: file('briefing-v1.json'),
    now,
    timeZone,
    getSettings,
    fetchFn,
    getCore,
    jobs,
    watchers,
    spend,
    fullAvailable: () => Boolean(vault.get()) && claude.sdkInstalled(),
    whatsNewFile,
    ready: briefingReady,
    log,
    onReady(b, { scheduled }) {
      emit('briefing', compactBriefing(b));
      if (scheduled) {
        const w = b.weather ? ` ${b.weather.now.summary}, ${b.weather.now.temp ?? '–'}°${b.weather.units}.` : '';
        const top = b.headlines[0] ? ` ${b.headlines[0].title}` : '';
        notify({ title: b.greeting, body: `Your briefing is ready.${w}${top}`, url: `${APP_URL}?homebase=briefing`, tag: 'briefing' });
      }
    },
  });

  const compactBriefing = (b) => ({ date: b.date, generatedAt: b.generatedAt, kind: b.kind, greeting: b.greeting });

  // ---- the brain object (GET /api/brain)
  function info() {
    let pushInfo = { vapidPublicKey: null, devices: [] };
    try {
      if (push && typeof push.info === 'function') pushInfo = push.info() ?? pushInfo;
    } catch (err) {
      log(`push info failed: ${err?.message ?? err}`);
    }
    const counts = jobs.counts();
    return {
      version: VERSION,
      key: vault.status(),
      sdk: { installed: claude.sdkInstalled() },
      limits: { ...settings.limits },
      spend: spend.summary(),
      push: pushInfo,
      briefing: briefings.info(),
      jobs: counts,
      watchers: { active: watchers.activeCount() },
      owner: { name: settings.owner.name },
      models: { ...BRAIN_MODELS },
    };
  }

  // ---- settings
  async function putSettings(body) {
    const v = validateSettingsBody(body);
    if (!v.ok) throw new BrainHttpError(v.status, v.code, v.message);
    const patch = v.patch;
    if (v.city) {
      const geo = await geocodeCity(fetchFn, v.city);
      if (geo === null) throw new BrainHttpError(400, 'city_not_found', `I couldn't find a place called "${v.city}". Try "City, State" or use this iPhone's location.`);
      if (geo.error) throw new BrainHttpError(503, 'geocoding_unavailable', 'The place could not be looked up right now (no internet?). Try again later or use this iPhone\'s location.');
      patch.briefing = { ...(patch.briefing ?? {}), location: geo };
    }
    const before = settings;
    settings = applySettingsPatch(settings, patch);
    await settingsFile.save(settings);
    syncOwner();
    if (patch.briefing && (patch.briefing.time !== undefined || patch.briefing.enabled !== undefined)) briefings.reschedule();
    if (patch.limits && (before.limits.dailyUsd !== settings.limits.dailyUsd || before.limits.monthlyUsd !== settings.limits.monthlyUsd)) emitSpend();
    return info();
  }

  // ---- key
  async function setKey(body) {
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!looksLikeKey(key)) throw new BrainHttpError(400, 'bad_key', 'That is not a Claude API key (it starts with sk-ant-).');
    const verdict = await claude.verifyKey(key);
    if (verdict === 'invalid') throw new BrainHttpError(400, 'bad_key', 'Anthropic rejected this API key. Check it in Jarvis, Settings, API key.');
    const status = vault.set(key, { verified: verdict === 'valid' });
    log(`a Claude API key was saved (${status.hint}, ${status.verified ? 'verified' : 'not verified yet: offline'})`);
    watchers.resume();
    jobs.pump();
    return { ok: true, hint: status.hint, verified: status.verified };
  }

  function deleteKey() {
    vault.remove();
    // Nothing keeps using a key the owner took back.
    jobs.failRunning('no_key', 'Stopped: the API key was removed from the home base.');
    log('the Claude API key was removed');
  }

  // ---- jobs (routes)
  function createJob(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BrainHttpError(400, 'bad_job', 'send {"kind": "research", "prompt": "…", "depth": "quick"}');
    const kind = body.kind ?? 'research';
    if (kind !== 'research') throw new BrainHttpError(400, 'bad_kind', 'kind must be "research"');
    // Anything shaped like a key is never stored or returned, even inside a question.
    const prompt = typeof body.prompt === 'string' ? redact(body.prompt.replace(/\r\n?/g, '\n').trim()) : '';
    if (!prompt) throw new BrainHttpError(400, 'bad_prompt', 'prompt must be the question to research');
    if (prompt.length > PROMPT_MAX) throw new BrainHttpError(400, 'prompt_too_long', `prompts can be up to ${PROMPT_MAX} characters`);
    const depth = body.depth ?? 'quick';
    if (depth !== 'quick' && depth !== 'deep') throw new BrainHttpError(400, 'bad_depth', 'depth must be "quick" or "deep"');
    if (body.title !== undefined && typeof body.title !== 'string') throw new BrainHttpError(400, 'bad_title', 'title must be text');
    if (!vault.get()) throw new BrainHttpError(409, 'no_key', 'The home base has no Claude API key yet. Give it your key in Jarvis, Settings, Home base.');
    if (!claude.sdkInstalled()) throw new BrainHttpError(503, 'sdk_missing', 'The Claude SDK is not installed on the home base (run: jarvis-core update).');
    const cap = spend.capReached();
    if (cap) throw new BrainHttpError(402, 'spend_cap', capWords(cap, settings.limits));
    try {
      return publicJob(jobs.create({ kind, prompt, title: typeof body.title === 'string' ? redact(body.title) : undefined, depth }), { withResult: true });
    } catch (err) {
      if (err?.code === 'queue_full') throw new BrainHttpError(429, 'queue_full', err.message, { 'Retry-After': '600' });
      throw err;
    }
  }

  function deleteJob(id) {
    const r = jobs.cancelOrRemove(id);
    if (!r.found) throw new BrainHttpError(404, 'not_found', 'no such job');
    return r;
  }

  // ---- watchers (routes)
  function createWatcher(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BrainHttpError(400, 'bad_watcher', 'send {"what": "…", "every": "24h"}');
    const what = typeof body.what === 'string' ? redact(oneLine(body.what, 10_000)) : '';
    if (!what) throw new BrainHttpError(400, 'bad_what', 'what must say what to watch for');
    if (what.length > WHAT_MAX) throw new BrainHttpError(400, 'what_too_long', `what can be up to ${WHAT_MAX} characters`);
    const every = body.every ?? '24h';
    if (!EVERY_MS[every]) throw new BrainHttpError(400, 'bad_every', 'every must be "6h", "12h" or "24h"');
    if (!vault.get()) throw new BrainHttpError(409, 'no_key', 'The home base has no Claude API key yet. Give it your key in Jarvis, Settings, Home base.');
    try {
      return publicWatcher(watchers.create({ what, every }));
    } catch (err) {
      if (err?.code === 'too_many_watchers') throw new BrainHttpError(409, 'too_many_watchers', err.message);
      throw err;
    }
  }

  function deleteWatcher(id) {
    if (!watchers.get(id)) throw new BrainHttpError(404, 'not_found', 'no such watcher');
    for (const j of jobs.all()) if (j.kind === 'watch-check' && j.watcherId === id && (j.status === 'queued' || j.status === 'running')) jobs.cancelOrRemove(j.id);
    watchers.remove(id);
  }

  function checkWatcherNow(id) {
    const w = watchers.get(id);
    if (!w) throw new BrainHttpError(404, 'not_found', 'no such watcher');
    if (isCheckPending(id)) throw new BrainHttpError(409, 'check_pending', 'a check of this watcher is already on its way');
    if (!vault.get()) throw new BrainHttpError(409, 'no_key', 'The home base has no Claude API key yet.');
    const cap = spend.capReached();
    if (cap) throw new BrainHttpError(402, 'spend_cap', capWords(cap, settings.limits));
    try {
      const job = jobs.create({ kind: 'watch-check', prompt: w.what, title: `Check: ${w.what}`, watcherId: w.id });
      return { watcher: publicWatcher(w), job: publicJob(job) };
    } catch (err) {
      if (err?.code === 'queue_full') throw new BrainHttpError(429, 'queue_full', err.message, { 'Retry-After': '600' });
      throw err;
    }
  }

  // ---- the clock: watchers, the briefing, blocked watchers after a cap clears
  let timer = null;
  let lastSpendDay = spend.summary().day;
  function tick() {
    try {
      const s = spend.summary();
      if (s.day !== lastSpendDay) {
        lastSpendDay = s.day;
        emit('spend', s);
      }
      if (!s.capReached) watchers.unblock();
      watchers.tick();
      briefings.tick();
      jobs.pump();
    } catch (err) {
      log(`brain tick failed: ${err?.stack ?? err}`);
    }
  }

  return {
    info,
    putSettings,
    setKey,
    deleteKey,
    spendReport: (days) => spend.report(days),
    createJob,
    listJobs: ({ limit, kind } = {}) => jobs.list({ limit, kind }).map((j) => publicJob(j)),
    getJob: (id) => {
      const j = jobs.get(id);
      return j ? publicJob(j, { withResult: true }) : null;
    },
    deleteJob,
    createWatcher,
    listWatchers: () => watchers.list().map(publicWatcher),
    deleteWatcher,
    checkWatcherNow,
    latestBriefing: () => briefings.latest(),
    runBriefing: () => briefings.generate({ scheduled: false }),
    tick,
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, tickMs);
      timer.unref?.();
      jobs.pump();
      claude.loadSdk().then((sdk) => {
        if (!sdk) log('the Claude SDK is not installed: research, watchers and the full briefing are off until it is (jarvis-core update)');
      });
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      const runningJobs = jobs.running;
      jobs.stop();
      // Give aborted requests a moment to report what they cost.
      if (runningJobs.length) await new Promise((r) => setTimeout(r, 300));
      jobs.flushSync();
      watchers.flushSync();
      spend.flush();
      await settingsFile.flush();
    },
    on(name, fn) {
      listeners[name].add(fn);
      return () => listeners[name].delete(fn);
    },
    // for tests and the runtime
    vault,
    claude,
    spend,
    jobs,
    watchers,
    briefings,
    get settings() {
      return settings;
    },
    timeZone,
  };
}
