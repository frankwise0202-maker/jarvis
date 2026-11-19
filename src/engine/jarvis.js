// createJarvis(deps): the engine's public object (SPEC 7). Owns conversations' mutation while a
// turn runs, the per-run context (events, throttled persistence, usage accounting), the shared
// per-model concurrency limiters, and the start / resume / stop lifecycle. No DOM access here.

import { createEmitter } from './emitter.js';
import { createLimiter } from './limiter.js';
import { ERROR_MESSAGES, classifyError, createClient } from './client.js';
import { DEFAULT_LEAD_MODEL, DEFAULT_WORKER_MODEL, DEPTHS, MODELS, MODES, bucketOf } from './models.js';
import { DEFAULT_TONE, DEFAULT_VERBOSITY, LEAD_SYSTEM_LATEST, LENGTH_STYLES, TONE_STYLES, buildTurnContext, leadToolsLatest } from './prompts.js';
import { STOPPED_BY_OWNER, runLeadTurn, stoppedRoundResults, toolResultMessage } from './lead.js';
import { WORKER_MAX_TOKENS } from './worker.js';
import { addUsage, emptyUsage, responseCost, usageDelta } from './stream.js';
import { LIBRARY_TIMEOUT_MS, LIVE_INTERVAL_MS, cleanBlueprintFor, hasVisualTools, isVisualSegment, prepareVisualTurn } from './visuals.js';
import {
  ATTACHMENT_ONLY_TEXT,
  assertRequestFits,
  attachmentBlock,
  attachmentMeta,
  attachmentsTitle,
  normalizeAttachments,
} from './attachments.js';
import { clampInt, formatLocalTime, singleLine, truncate, uid } from './util.js';

const PERSIST_INTERVAL_MS = 1000;
const DEFAULT_RETRY_BASE_MS = 5000;
const DEFAULT_MAX_RETRY_WAIT_MS = 60000;
const DEFAULT_WORKER_STAGGER_MS = 700;
const TEST_MODEL = 'claude-haiku-5-5';
/** Containers are reused only while comfortably before their expiry. */
const CONTAINER_MARGIN_MS = 60 * 1000;
const CONTAINER_DEFAULT_TTL_MS = 30 * 60 * 1000;

export const LOW_LIMITS_NOTICE = 'Your Anthropic account has low rate limits (common for new accounts) — Jarvis is pacing itself. Limits rise automatically as you use the API (Console → Limits).';

/**
 * The lead model to run. Claude Haiku 5.5 is not listed for the lead's dynamic-filtering web tools,
 * so a stored Haiku lead runs on Claude Sonnet 5.5 (Settings no longer offers Haiku for the lead).
 */
export function leadModelFor(model) {
  return MODELS[model]?.bucket === 'haiku' || /haiku/i.test(String(model || '')) ? 'claude-sonnet-5-5' : model;
}

/** The settings fields the engine reads, validated (SPEC 5 ranges); bad values fall back to defaults. */
export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const str = (v) => (typeof v === 'string' ? v : '');
  return {
    userName: str(s.userName),
    leadModel: leadModelFor(str(s.leadModel).trim() || DEFAULT_LEAD_MODEL),
    workerModel: str(s.workerModel).trim() || DEFAULT_WORKER_MODEL,
    depth: DEPTHS[s.depth] ? s.depth : 'balanced',
    mode: MODES[s.mode] ? s.mode : 'auto',
    maxAgents: clampInt(s.maxAgents, 1, 20, 8),
    maxParallel: clampInt(s.maxParallel, 1, 10, 4),
    maxWaves: clampInt(s.maxWaves, 1, 4, 3),
    showThinking: s.showThinking !== false,
    location: str(s.location),
    memoryEnabled: s.memoryEnabled !== false,
    tone: typeof s.tone === 'string' && Object.prototype.hasOwnProperty.call(TONE_STYLES, s.tone) ? s.tone : DEFAULT_TONE,
    verbosity: typeof s.verbosity === 'string' && Object.prototype.hasOwnProperty.call(LENGTH_STYLES, s.verbosity) ? s.verbosity : DEFAULT_VERBOSITY,
    features: {
      fallbacks: s.features?.fallbacks !== false,
      compaction: s.features?.compaction !== false,
    },
  };
}

const lastJarvisTurn = (conv) => {
  for (let i = (conv?.turns?.length ?? 0) - 1; i >= 0; i--) if (conv.turns[i]?.role === 'jarvis') return conv.turns[i];
  return null;
};

const FINAL_AGENT = new Set(['done', 'error']);

/**
 * Settles everything still marked as in progress when a turn ends: running tool rows, open thinking,
 * planning/running missions and their unfinished agents. `status` is the turn's final status.
 */
function settleUnfinished(turn, status, ts, notify = null) {
  const code = status === 'interrupted' ? 'interrupted' : status === 'stopped' ? 'stopped' : 'incomplete';
  // A live countdown ("retrying in 8s") saved just before the app was closed is over by now. (A
  // live run always removes its own; this clears one left in a saved turn.)
  if (Array.isArray(turn.segments)) {
    for (let i = turn.segments.length - 1; i >= 0; i--) if (turn.segments[i]?.transient === true) turn.segments.splice(i, 1);
  }
  for (const seg of turn.segments || []) {
    if (seg.kind === 'tool' && seg.status === 'running') {
      seg.status = 'error';
      seg.errorCode = code;
      notify?.segment(seg);
    } else if (seg.kind === 'thinking' && !seg.endedAt) {
      seg.endedAt = ts;
      notify?.segment(seg);
    } else if (isVisualSegment(seg) && seg.status === 'building') {
      // A hologram or blueprint whose input never finished keeps what was built, and is not saved.
      seg.status = 'error';
      notify?.segment(seg);
    }
  }
  const target = status === 'interrupted' ? 'interrupted' : 'stopped';
  for (const mission of Object.values(turn.missions || {})) {
    const open = mission.status === 'planning' || mission.status === 'running' || (target === 'stopped' && mission.status === 'interrupted');
    if (!open) continue;
    mission.status = target;
    if (!mission.endedAt) mission.endedAt = ts;
    for (const agent of mission.agents || []) {
      if (FINAL_AGENT.has(agent.status) || agent.status === target) continue;
      agent.status = target;
      agent.activity = target === 'interrupted' ? 'Connection lost — waiting to resume' : 'Stopped';
      if (!agent.endedAt) agent.endedAt = ts;
      notify?.agent(mission, agent);
    }
    notify?.mission(mission);
  }
}

/** Live stats from the turn's data (SPEC 6 `stats`). */
function computeStats(turn, durationMs) {
  const urls = new Set();
  let agents = 0;
  let observedSearches = 0;
  let waves = 0;
  for (const mission of Object.values(turn.missions || {})) {
    if (!mission.startedAt) continue;
    waves += 1;
    for (const agent of mission.agents || []) {
      agents += 1;
      observedSearches += agent.searches?.length || 0;
      for (const s of agent.sources || []) urls.add(s.url);
    }
  }
  for (const seg of turn.segments || []) {
    if (seg.kind === 'tool') {
      if (seg.tool === 'web_search' && seg.status !== 'running') observedSearches += 1;
      for (const r of seg.results || []) urls.add(r.url);
    } else if (seg.kind === 'text') {
      for (const c of seg.citations || []) urls.add(c.url);
    }
  }
  return {
    agents,
    searches: Math.max(turn.usage?.searches || 0, observedSearches),
    sources: urls.size,
    waves,
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}

function lastAssistantAsks(conv, toolUses) {
  const last = conv.apiMessages[conv.apiMessages.length - 1];
  if (!last || last.role !== 'assistant' || !Array.isArray(last.content)) return false;
  const ids = new Set(last.content.filter((b) => b?.type === 'tool_use').map((b) => b.id));
  return toolUses.length > 0 && toolUses.every((tu) => ids.has(tu.id));
}

/** Safety net: history must never end with an assistant tool_use that has no tool_result. */
function answerDanglingToolUses(conv) {
  const last = conv.apiMessages[conv.apiMessages.length - 1];
  if (!last || last.role !== 'assistant' || !Array.isArray(last.content)) return;
  const toolUses = last.content.filter((b) => b?.type === 'tool_use' && typeof b.id === 'string');
  if (toolUses.length) conv.apiMessages.push(toolResultMessage(toolUses, {}, STOPPED_BY_OWNER));
}

export function createJarvis(deps = {}) {
  if (typeof deps.getSettings !== 'function') throw new TypeError('createJarvis: deps.getSettings is required');
  if (typeof deps.getApiKey !== 'function') throw new TypeError('createJarvis: deps.getApiKey is required');
  const d = {
    getSettings: deps.getSettings,
    getApiKey: deps.getApiKey,
    getApiBase: typeof deps.getApiBase === 'function' ? deps.getApiBase : () => '',
    memory: deps.memory && typeof deps.memory === 'object' ? deps.memory : null,
    // The saved library (holograms and blueprints): { save, get, list, findPartBlueprint }, see visuals.js.
    library: deps.library && typeof deps.library === 'object' ? deps.library : null,
    libraryTimeoutMs: Number.isFinite(deps.libraryTimeoutMs) && deps.libraryTimeoutMs > 0 ? deps.libraryTimeoutMs : LIBRARY_TIMEOUT_MS,
    // How often a live hologram / blueprint segment is updated while its input streams (tests).
    liveIntervalMs: Number.isFinite(deps.liveIntervalMs) && deps.liveIntervalMs >= 0 ? deps.liveIntervalMs : LIVE_INTERVAL_MS,
    persist: typeof deps.persist === 'function' ? deps.persist : null,
    onSpend: typeof deps.onSpend === 'function' ? deps.onSpend : null,
    fetch: typeof deps.fetch === 'function' ? deps.fetch : undefined,
    now: typeof deps.now === 'function' ? deps.now : () => new Date(),
    clientOptions: deps.clientOptions && typeof deps.clientOptions === 'object' ? deps.clientOptions : undefined,
    retryBaseMs: Number.isFinite(deps.retryBaseMs) && deps.retryBaseMs >= 0 ? deps.retryBaseMs : DEFAULT_RETRY_BASE_MS,
    onFeatureUnsupported: typeof deps.onFeatureUnsupported === 'function' ? deps.onFeatureUnsupported : null,
    // Longest wait a retry-after header may impose, and the delay between agents' first requests.
    maxRetryWaitMs: Number.isFinite(deps.maxRetryWaitMs) && deps.maxRetryWaitMs >= 0 ? deps.maxRetryWaitMs : DEFAULT_MAX_RETRY_WAIT_MS,
    workerStaggerMs: Number.isFinite(deps.workerStaggerMs) && deps.workerStaggerMs >= 0 ? deps.workerStaggerMs : DEFAULT_WORKER_STAGGER_MS,
  };

  const runs = new Map(); // conversation id → run context
  const limiters = new Map(); // model bucket → limiter (shared by every run: rate limits are per key)
  const maxTokenCaps = new Map(); // model → max_tokens cap learned from an output-tokens-per-minute 429
  const otpmLimits = new Map(); // model bucket → that output-tokens-per-minute limit
  let lowLimitsNoticed = false;

  const nowDate = () => {
    const value = d.now();
    return value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date();
  };
  const stamp = () => nowDate().getTime();

  function readSettings() {
    try {
      return normalizeSettings(d.getSettings());
    } catch (err) {
      console.error('[jarvis] getSettings failed:', err);
      return normalizeSettings(null);
    }
  }

  function apiBase() {
    try {
      const base = d.getApiBase();
      return typeof base === 'string' ? base : '';
    } catch {
      return '';
    }
  }

  function memoryFacts() {
    try {
      const list = d.memory?.list?.();
      if (!Array.isArray(list)) return [];
      return list.map((m) => (typeof m === 'string' ? m : m?.text)).filter((t) => typeof t === 'string' && t.trim());
    } catch (err) {
      console.error('[jarvis] memory.list failed:', err);
      return [];
    }
  }

  /** A turn persisted as 'running' with no live run here was cut off (tab killed or suspended). */
  function repairStale(conv) {
    if (!conv || runs.has(conv.id)) return;
    const turn = lastJarvisTurn(conv);
    if (!turn || turn.status !== 'running') return;
    const ts = stamp();
    settleUnfinished(turn, 'interrupted', ts);
    turn.status = 'interrupted';
    turn.endedAt = turn.endedAt || ts;
    turn.error = turn.error || { kind: 'network', message: 'Jarvis was interrupted before it finished.', retryable: true };
    if (!conv.pending || conv.pending.turnId !== turn.id) {
      answerDanglingToolUses(conv);
      const reqs = (turn.segments || []).map((s) => s.req).filter((r) => typeof r === 'number');
      conv.pending = { turnId: turn.id, toolUses: [], req: reqs.length ? Math.max(...reqs) + 1 : 0 };
    }
  }

  /**
   * Before a new turn: close an interrupted tool round as stopped so history stays valid (SPEC 8.6).
   * Agents that finished before the interruption keep their reports (stoppedRoundResults).
   */
  function abandonPending(conv) {
    repairStale(conv);
    const pending = conv.pending;
    if (!pending) return;
    conv.pending = null;
    const turn = (conv.turns || []).find((t) => t.id === pending.turnId);
    if (turn && (turn.status === 'interrupted' || turn.status === 'running')) {
      settleUnfinished(turn, 'stopped', stamp());
      turn.status = 'stopped';
      turn.endedAt = turn.endedAt || stamp();
    }
    if (Array.isArray(pending.toolUses) && pending.toolUses.length && lastAssistantAsks(conv, pending.toolUses)) {
      const results = turn ? stoppedRoundResults(turn, pending.toolUses, pending.results) : pending.results;
      conv.apiMessages.push(toolResultMessage(pending.toolUses, results, STOPPED_BY_OWNER));
    }
  }

  function createPersister(conv) {
    let last = 0;
    let timer = null;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      last = Date.now();
      if (!d.persist) return;
      try {
        Promise.resolve(d.persist(conv)).catch((err) => console.error('[jarvis] persist failed:', err));
      } catch (err) {
        console.error('[jarvis] persist failed:', err);
      }
    };
    const schedule = () => {
      if (!d.persist || timer) return;
      const wait = last + PERSIST_INTERVAL_MS - Date.now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    };
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    return { schedule, flush, cancel };
  }

  function createContext(conv, turn, settings, emitter, { req }) {
    const controller = new AbortController();
    const persister = createPersister(conv);
    const apiKey = (() => {
      try {
        return String(d.getApiKey() ?? '').trim();
      } catch {
        return '';
      }
    })();
    let client = null;
    let clientError = null;
    if (apiKey) {
      try {
        client = createClient({ apiKey, apiBase: apiBase(), fetch: d.fetch, clientOptions: d.clientOptions });
      } catch (err) {
        clientError = err; // reported as the turn's error instead of throwing from startTurn
      }
    }
    const depthKey = DEPTHS[turn.depth] ? turn.depth : settings.depth;
    const syncedBuckets = new Set();
    const noticedMissions = new Set();
    const toolSegments = new Map();
    for (const seg of turn.segments || []) if (seg.kind === 'tool' && seg.toolUseId) toolSegments.set(seg.toolUseId, seg);
    const visualSegments = new Map(); // tool_use id → hologram / blueprint segment
    for (const seg of turn.segments || []) if (isVisualSegment(seg) && seg.toolUseId) visualSegments.set(seg.toolUseId, seg);

    const ctx = {
      deps: d,
      conv,
      turn,
      settings,
      mode: MODES[turn.mode] ? turn.mode : settings.mode,
      leadModel: leadModelFor(turn.leadModel || settings.leadModel),
      workerModel: turn.workerModel || settings.workerModel,
      depthKey,
      depth: DEPTHS[depthKey],
      features: { ...settings.features },
      apiKey,
      client,
      clientError,
      controller,
      signal: controller.signal,
      retryBaseMs: d.retryBaseMs,
      maxRetryWaitMs: d.maxRetryWaitMs,
      workerStaggerMs: d.workerStaggerMs,
      stopped: false,
      done: false,
      req,
      currentReq: req,
      paused: [],
      continuations: 0,
      round: null,
      toolSegments,
      visualSegments,
      libraryTimeoutMs: d.libraryTimeoutMs,
      liveIntervalMs: d.liveIntervalMs,
      libraryCostCounted: 0,
      runStartedAt: Date.now(),
      durationBase: Number(turn.stats?.durationMs) || 0,
      now: nowDate,
      stamp,
    };

    ctx.emit = (type, payload) => {
      if (ctx.done) return;
      emitter.emit(type, payload);
      persister.schedule();
    };
    ctx.persistSoon = () => {
      if (!ctx.done) persister.schedule();
    };
    ctx.notice = (level, message) => {
      if (!ctx.done) emitter.emit('notice', { level, message });
    };
    ctx.missionNotice = (mission, message) => {
      if (noticedMissions.has(mission.id)) return;
      noticedMissions.add(mission.id);
      ctx.notice('warn', message);
    };
    ctx.refreshStats = () => {
      turn.stats = computeStats(turn, ctx.durationBase + (Date.now() - ctx.runStartedAt));
    };
    ctx.emitTurn = () => {
      ctx.refreshStats();
      ctx.emit('turn', { turn });
    };
    ctx.addSegment = (segment) => {
      turn.segments.push(segment);
      ctx.emit('segment', { turn, segment });
      return segment;
    };
    ctx.touchSegment = (segment) => ctx.emit('segment', { turn, segment });
    ctx.removeSegments = (predicate) => {
      const removed = [];
      for (let i = turn.segments.length - 1; i >= 0; i--) {
        if (predicate(turn.segments[i])) removed.unshift(...turn.segments.splice(i, 1));
      }
      for (const seg of removed) ctx.emit('segment-removed', { turn, segmentId: seg.id });
      return removed;
    };
    /**
     * How many agent requests of `model` may run at once: settings.maxParallel, or fewer once an
     * output-tokens-per-minute limit is known - the API charges each request's max_tokens against
     * it up front, so more at once than the limit covers would only collect 429s.
     */
    ctx.parallelFor = (model) => {
      const otpm = otpmLimits.get(bucketOf(model));
      if (!otpm) return settings.maxParallel;
      const perRequest = ctx.maxTokensFor(model, ctx.depth.workerMaxTokens || WORKER_MAX_TOKENS);
      return Math.max(1, Math.min(settings.maxParallel, Math.floor(otpm / perRequest)));
    };
    ctx.limiterFor = (model) => {
      const bucket = bucketOf(model);
      let limiter = limiters.get(bucket);
      if (!limiter) {
        limiter = createLimiter(ctx.parallelFor(model));
        limiters.set(bucket, limiter);
      } else if (!syncedBuckets.has(bucket) && limiter.isIdle()) {
        // A new run starts from the current setting; adaptive slow-downs persist within a run.
        limiter.setCapacity(ctx.parallelFor(model));
      }
      syncedBuckets.add(bucket);
      return limiter;
    };
    ctx.accountUsage = (message, model, target) => {
      const used = message?.model || model;
      const delta = usageDelta(message?.usage);
      const cost = responseCost(used, message?.usage, model);
      addUsage(turn.usage, delta);
      turn.costUsd = (Number(turn.costUsd) || 0) + cost;
      if (target?.agent) {
        addUsage(target.agent.usage, delta);
        target.agent.costUsd = (Number(target.agent.costUsd) || 0) + cost;
      }
      if (cost > 0 && d.onSpend) {
        try {
          d.onSpend(cost);
        } catch (err) {
          console.error('[jarvis] onSpend failed:', err);
        }
      }
      ctx.emit('usage', { turn });
    };
    ctx.disableFeature = (name) => {
      if (!ctx.features[name]) return;
      ctx.features[name] = false;
      if (d.onFeatureUnsupported) {
        try {
          d.onFeatureUnsupported(name);
        } catch (err) {
          console.error('[jarvis] onFeatureUnsupported failed:', err);
        }
      }
      ctx.notice('info', name === 'fallbacks'
        ? 'Server-side fallback isn’t available for this API key, so Jarvis switched it off.'
        : 'Automatic conversation compaction isn’t available for this API key, so Jarvis switched it off.');
    };
    /** SDK retries for one call: the engine's choice (lead 1, workers 0), never above an explicit client setting. */
    ctx.sdkRetries = (n) => {
      const configured = d.clientOptions?.maxRetries;
      return Number.isFinite(configured) && configured >= 0 ? Math.min(n, configured) : n;
    };
    /** max_tokens for `model`, within any cap learned from the account's rate limits this session. */
    ctx.maxTokensFor = (model, base) => Math.min(base, maxTokenCaps.get(model) ?? Infinity);
    /**
     * An output-tokens-per-minute 429 (limit `otpm`): cap max_tokens for `model` for the rest of the
     * session, and from now on admit only as many of its agents at once as the limit covers (agents
     * already running are not interrupted).
     */
    ctx.capMaxTokens = (model, cap, otpm) => {
      const current = maxTokenCaps.get(model) ?? Infinity;
      if (cap < current) maxTokenCaps.set(model, cap);
      if (Number.isFinite(otpm) && otpm > 0) {
        const bucket = bucketOf(model);
        if (!(otpmLimits.get(bucket) <= otpm)) otpmLimits.set(bucket, otpm);
        const limiter = limiters.get(bucket);
        const ceiling = ctx.parallelFor(model);
        if (limiter && limiter.capacity > ceiling) limiter.setCapacity(ceiling);
      }
      ctx.lowLimitsNotice();
    };
    /** One clear explanation per session when the account's rate limits make Jarvis slow down. */
    ctx.lowLimitsNotice = () => {
      if (lowLimitsNoticed) return;
      lowLimitsNoticed = true;
      ctx.notice('warn', LOW_LIMITS_NOTICE);
    };
    /** The code-execution container of this conversation's web tools, while it is still alive. */
    ctx.leadContainer = () => {
      const c = conv.container;
      if (!c || typeof c.id !== 'string' || !c.id) return null;
      if (Number.isFinite(c.expiresAt) && c.expiresAt - CONTAINER_MARGIN_MS <= Date.now()) {
        conv.container = null;
        return null;
      }
      return c.id;
    };
    /** Remember the container a lead response ran in (message.container { id, expires_at }). */
    ctx.adoptContainer = (container) => {
      if (!container || typeof container.id !== 'string' || !container.id) return;
      const expires = Date.parse(container.expires_at);
      conv.container = { id: container.id, expiresAt: Number.isFinite(expires) ? expires : Date.now() + CONTAINER_DEFAULT_TTL_MS };
    };
    ctx.stop = () => {
      if (ctx.done || ctx.stopped) return;
      ctx.stopped = true;
      controller.abort();
    };
    ctx.finish = (status, error) => {
      if (ctx.done) return turn;
      const ts = stamp();
      settleUnfinished(turn, status, ts, {
        segment: (segment) => ctx.emit('segment', { turn, segment }),
        mission: (mission) => ctx.emit('mission', { turn, mission }),
        agent: (mission, agent) => ctx.emit('agent', { turn, mission, agent }),
      });
      turn.status = status;
      turn.error = error || null;
      turn.endedAt = ts;
      if (status !== 'interrupted') conv.pending = null;
      ctx.paused = [];
      ctx.refreshStats();
      conv.updatedAt = ts;
      ctx.done = true;
      persister.flush(); // always at turn end and at interruption
      // Nothing may outlive the turn (only reachable after an unexpected error mid-round).
      if (!controller.signal.aborted) controller.abort();
      if (runs.get(conv.id) === ctx) runs.delete(conv.id);
      emitter.emit('turn', { turn });
      emitter.emit('end', { turn });
      return turn;
    };
    return ctx;
  }

  /** A run's settings with the turn's own overrides applied (SPEC §15.1: maxAgents for that turn only). */
  function turnSettings(settings, turn) {
    const max = Number(turn?.maxAgents);
    return Number.isInteger(max) && max >= 1 && max <= 20 ? { ...settings, maxAgents: max } : settings;
  }

  function launch(conv, turn, settings, { resume, req, keepOnStop = false }) {
    const emitter = createEmitter();
    const ctx = createContext(conv, turn, turnSettings(settings, turn), emitter, { req });
    ctx.keepOnStop = keepOnStop === true; // Stop keeps the message even before any reply (lead.js)
    runs.set(conv.id, ctx);
    let resolveDone;
    const done = new Promise((resolve) => {
      resolveDone = resolve;
    });
    // Start on a microtask so the caller can subscribe with run.on() before the first event.
    Promise.resolve()
      .then(async () => {
        ctx.emitTurn();
        // Version 4 conversations: the saved-items and "Blueprint request" blocks are added to the
        // turn context before its first request (the library is asynchronous). Never on resume:
        // that message may already have been sent.
        if (!resume) await prepareVisualTurn(ctx);
        return runLeadTurn(ctx, { resume });
      })
      .catch((err) => {
        console.error('[jarvis] turn crashed:', err);
        try {
          ctx.finish('error', classifyError(err, { model: ctx.leadModel }));
        } catch (finishErr) {
          console.error('[jarvis] could not finish the turn:', finishErr);
        }
      })
      .then(() => {
        if (runs.get(conv.id) === ctx) runs.delete(conv.id);
        resolveDone(turn);
      });
    return {
      conversation: conv,
      turn,
      on: (type, fn) => emitter.on(type, fn),
      abort: () => ctx.stop(),
      done,
    };
  }

  function assertConversation(conv, fn) {
    if (!conv || typeof conv !== 'object' || !Array.isArray(conv.turns) || !Array.isArray(conv.apiMessages)) {
      throw new TypeError(`${fn}: not a conversation`);
    }
  }

  function canResume(conv) {
    if (!conv || typeof conv !== 'object' || runs.has(conv.id)) return false;
    repairStale(conv);
    const turn = lastJarvisTurn(conv);
    return !!(turn && turn.status === 'interrupted' && conv.pending && conv.pending.turnId === turn.id);
  }

  return {
    newConversation() {
      const ts = stamp();
      return {
        id: uid(),
        v: 1,
        title: '',
        createdAt: ts,
        updatedAt: ts,
        system: LEAD_SYSTEM_LATEST, // older conversations keep the prompt and tools they were created with
        tools: leadToolsLatest(), // V3: update_memory acts only on the owner's own words
        apiMessages: [],
        turns: [],
        pending: null,
      };
    },

    /**
     * Starts a turn. `attachments` (SPEC §15.1) become image / PDF document blocks between the
     * turn context and the text; a message may be attachments only. `maxAgents` (1–20) overrides
     * settings.maxAgents for this turn only. `keepOnStop: true` (Voice Mode, where nothing can be
     * handed back to a message box) keeps the message in the history even when the turn is stopped
     * before any reply. `spoken: true` (Voice Mode, where the reply is read aloud) adds the spoken
     * reply channel to this turn's <turn_context> and marks the turn `spoken: true`; without it the
     * request is exactly as before. `blueprintFor: { model: 'lib_…', part: '<part id>'|null }` asks
     * for the 2D blueprint of one part (or, with part null, the whole object) of a saved hologram:
     * the turn context gets a "Blueprint request" block and the blueprint is linked to that part
     * (only in conversations with the version 4 tools). Throws (before anything is appended) when
     * the input is invalid, e.g. an attachment Claude would reject; the error message is worded for
     * the owner.
     */
    startTurn(conv, { text, mode, attachments, maxAgents, keepOnStop, spoken, blueprintFor } = {}) {
      assertConversation(conv, 'startTurn');
      const body = typeof text === 'string' ? text.trim() : '';
      const files = normalizeAttachments(attachments);
      if (!body && !files.length) throw new TypeError('startTurn: text is required');
      if (runs.has(conv.id)) throw new Error('A turn is already running for this conversation.');
      const target = blueprintFor === undefined || blueprintFor === null ? null : cleanBlueprintFor(blueprintFor);
      if (blueprintFor !== undefined && blueprintFor !== null && !target) throw new TypeError('startTurn: blueprintFor must be { model: "lib_…", part: "<part id>" | null }');
      if (target && !hasVisualTools(conv, 'draw_blueprint')) {
        throw new Error('This conversation was started before Jarvis could draw blueprints. Start a new conversation and ask again.');
      }
      const override = maxAgents === undefined || maxAgents === null || maxAgents === '' ? null : clampInt(maxAgents, 1, 20, null);
      const content = [...files.map(attachmentBlock), { type: 'text', text: body || ATTACHMENT_ONLY_TEXT }];
      if (files.length) assertRequestFits(conv.apiMessages, { role: 'user', content }, { system: conv.system, tools: conv.tools });
      abandonPending(conv);
      answerDanglingToolUses(conv);

      const settings = turnSettings(readSettings(), { maxAgents: override });
      const turnMode = MODES[mode] ? mode : settings.mode;
      const ts = stamp();
      const isFirst = !conv.turns.some((t) => t?.role === 'user');
      const userTurn = { id: uid(), role: 'user', text: body, mode: turnMode, createdAt: ts };
      if (files.length) userTurn.attachments = files.map(attachmentMeta);
      const turn = {
        id: uid(),
        role: 'jarvis',
        createdAt: ts,
        endedAt: null,
        status: 'running',
        mode: turnMode,
        leadModel: settings.leadModel,
        workerModel: settings.workerModel,
        depth: settings.depth,
        segments: [],
        missions: {},
        usage: emptyUsage(),
        costUsd: 0,
        stats: { agents: 0, searches: 0, sources: 0, waves: 0, durationMs: 0 },
        error: null,
      };
      if (override !== null) turn.maxAgents = override; // survives a resume (launch applies it)
      if (spoken === true) turn.spoken = true; // a Voice Mode reply, written for the ear (UI and exports can tell)
      if (target) turn.blueprintFor = target; // the 2D request this turn answers (links the saved blueprint)
      if (isFirst || !conv.title) conv.title = truncate(singleLine(body || attachmentsTitle(files)), 60);
      conv.turns.push(userTurn, turn);
      const turnContext = buildTurnContext({
        localTime: formatLocalTime(nowDate()),
        userName: settings.userName,
        location: settings.location,
        tone: settings.tone,
        verbosity: settings.verbosity,
        mode: turnMode,
        maxAgents: settings.maxAgents,
        maxWaves: settings.maxWaves,
        memoryEnabled: settings.memoryEnabled,
        memoryFacts: settings.memoryEnabled ? memoryFacts() : [],
        spoken: spoken === true,
      });
      // Where this turn's messages start: a refused turn is removed from the history from here on.
      turn.apiStart = conv.apiMessages.length;
      // SPEC §15.1 order: turn context, attachments, then the owner's text (or the default text).
      conv.apiMessages.push({ role: 'user', content: [{ type: 'text', text: turnContext }, ...content] });
      conv.updatedAt = ts;
      conv.pending = { turnId: turn.id, toolUses: [], req: 0 };
      return launch(conv, turn, settings, { resume: false, req: 0, keepOnStop: keepOnStop === true });
    },

    canResume,

    resumeTurn(conv) {
      if (!canResume(conv)) return null;
      const turn = lastJarvisTurn(conv);
      const settings = readSettings();
      const req = Number.isInteger(conv.pending.req) && conv.pending.req >= 0 ? conv.pending.req : 0;
      turn.status = 'running';
      turn.error = null;
      turn.endedAt = null;
      conv.updatedAt = stamp();
      return launch(conv, turn, settings, { resume: true, req });
    },

    async testApiKey(key) {
      const apiKey = typeof key === 'string' ? key.trim() : '';
      if (!apiKey) return { ok: false, error: { kind: 'auth', message: ERROR_MESSAGES.missingKey, retryable: false } };
      try {
        const client = createClient({ apiKey, apiBase: apiBase(), fetch: d.fetch, clientOptions: d.clientOptions });
        await client.beta.messages.create(
          {
            model: TEST_MODEL,
            max_tokens: 64,
            output_config: { effort: 'low' },
            messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
          },
          { maxRetries: 1, timeout: 30 * 1000 },
        );
        return { ok: true };
      } catch (err) {
        return { ok: false, error: classifyError(err, { model: TEST_MODEL }) };
      }
    },

    isBusy() {
      return runs.size > 0;
    },
  };
}
