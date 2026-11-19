// Field agents: one worker request (plus pause_turn continuations) per attempt, run through the
// per-model limiter, with live status/activity/sources, engine-level rate-limit retries with
// adaptive capacity, and a report built from the final text. A failed agent never throws: it ends
// in 'error', 'stopped' or 'interrupted'. No DOM access here.

import { WORKER_SYSTEM_V1, buildWorkerPrompt, workerTools } from './prompts.js';
import {
  buildMessageParams,
  echoContent,
  mergeSources,
  readFetchResult,
  readSearchResult,
  requestWithFeatureFallback,
  sourceFromCitation,
} from './stream.js';
import { classifyError, isAbortError } from './client.js';
import { abortError, formatLocalTime, hostnameOf, parsePartialJson, sleep, truncate } from './util.js';

export const WORKER_MAX_TOKENS = 32000;
export const WORKER_MAX_ATTEMPTS = 3;
export const MAX_CONTINUATIONS = 6;
export const AGENT_EMIT_INTERVAL_MS = 100; // ≤ 10 agent events per second per agent
const MAX_SOURCES = 30;

/** Throttled `agent` emitter: at most one event per interval, immediate on status change. */
function createAgentEmitter(ctx, mission, agent) {
  let last = 0;
  let timer = null;
  let lastStatus = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    last = Date.now();
    lastStatus = agent.status;
    ctx.emit('agent', { turn: ctx.turn, mission, agent });
  };
  const emit = (force = false) => {
    if (force || agent.status !== lastStatus) return fire();
    const wait = last + AGENT_EMIT_INTERVAL_MS - Date.now();
    if (wait <= 0) return fire();
    if (!timer) timer = setTimeout(fire, wait);
  };
  emit.flush = fire;
  return emit;
}

function setState(agent, status, activity) {
  agent.status = status;
  agent.activity = activity;
}

function finishAgent(ctx, agent, status, activity, error = null) {
  agent.status = status;
  agent.activity = activity;
  agent.error = error;
  agent.endedAt = ctx.stamp();
}

/** Cited sources first, then fetched pages, then other search results; deduped by URL; max 30. */
function createSourceTracker() {
  const cited = [];
  const fetched = [];
  const candidates = [];
  return {
    cite(source) {
      if (source) cited.push(source);
    },
    fetched(source) {
      if (source) fetched.push(source);
    },
    candidates(list) {
      candidates.push(...list);
    },
    list: () => mergeSources([...cited, ...fetched, ...candidates], MAX_SOURCES),
  };
}

function finalToolInput(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return parsePartialJson(raw);
  }
}

/** Maps one worker response stream onto the agent's status, activity, thinking, report and sources. */
function createAgentView(agent, emit, tracker) {
  const blocks = new Map();
  const syncSources = () => {
    agent.sources = tracker.list();
  };

  function toolActivity(st, isFinal) {
    const input = isFinal ? finalToolInput(st.raw) : parsePartialJson(st.raw);
    if (st.name === 'web_search') {
      const query = typeof input?.query === 'string' ? input.query.trim() : '';
      if (query) agent.activity = `Searching “${truncate(query, 90)}”`;
      if (isFinal && query && !st.recorded) {
        st.recorded = true;
        agent.searches.push(query);
      }
    } else if (st.name === 'web_fetch') {
      const url = typeof input?.url === 'string' ? input.url.trim() : '';
      if (url) agent.activity = `Reading ${hostnameOf(url)}`;
      if (isFinal && url && !st.recorded) {
        st.recorded = true;
        agent.fetches.push(url);
      }
    }
  }

  function applyResult(block) {
    if (block.type === 'web_search_tool_result') {
      const r = readSearchResult(block);
      if (r.ok) tracker.candidates(r.sources);
      else agent.activity = `Search unavailable (${r.errorCode})`;
    } else if (block.type === 'web_fetch_tool_result') {
      const r = readFetchResult(block);
      if (r.ok) tracker.fetched(r.source);
      else agent.activity = `Couldn’t read that page (${r.errorCode})`;
    }
    syncSources();
  }

  return {
    onEvent(event, snapshot) {
      if (event.type === 'content_block_start') {
        const b = event.content_block || {};
        const st = { type: b.type, name: b.name, raw: '', recorded: false };
        blocks.set(event.index, st);
        switch (b.type) {
          case 'thinking':
            setState(agent, 'thinking', 'Thinking');
            if (b.thinking) agent.thinking += b.thinking;
            break;
          case 'text': {
            const prev = blocks.get(event.index - 1);
            if (agent.report && !(prev && prev.type === 'text')) agent.report += '\n\n';
            setState(agent, 'writing', 'Writing report');
            if (b.text) agent.report += b.text;
            for (const c of b.citations || []) tracker.cite(sourceFromCitation(c));
            syncSources();
            break;
          }
          case 'server_tool_use':
            if (b.name === 'web_search') setState(agent, 'searching', 'Searching');
            else if (b.name === 'web_fetch') setState(agent, 'reading', 'Reading a page');
            break;
          case 'web_search_tool_result':
          case 'web_fetch_tool_result':
            applyResult(b);
            break;
          default:
            return;
        }
        emit();
      } else if (event.type === 'content_block_delta') {
        const st = blocks.get(event.index);
        const d = event.delta || {};
        switch (d.type) {
          case 'thinking_delta':
            if (!d.thinking) return;
            agent.thinking += d.thinking;
            break;
          case 'text_delta':
            if (!d.text) return;
            agent.report += d.text;
            break;
          case 'citations_delta':
            tracker.cite(sourceFromCitation(d.citation));
            syncSources();
            break;
          case 'input_json_delta':
            if (!st || st.type !== 'server_tool_use') return;
            st.raw += d.partial_json || '';
            toolActivity(st, false);
            break;
          default:
            return;
        }
        emit();
      } else if (event.type === 'content_block_stop') {
        const st = blocks.get(event.index);
        const block = snapshot?.content?.[event.index];
        if (st?.type === 'server_tool_use') {
          toolActivity(st, true);
          emit();
        } else if (block && (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result')) {
          applyResult(block);
          emit();
        }
      }
    },
    /** Final pass over the complete content (idempotent): results and citations. */
    finalize(content) {
      for (const block of content) {
        if (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result') applyResult(block);
        else if (block.type === 'text') for (const c of block.citations || []) tracker.cite(sourceFromCitation(c));
      }
      syncSources();
    },
  };
}

/**
 * Report = the text of the agent's final assistant message(s). Consecutive text blocks (split around
 * citations) are joined seamlessly; runs separated by tool calls are separate paragraphs. If a later
 * run starts the Markdown report (a heading), short remarks written before it are left out.
 */
export function composeReport(contents) {
  const runs = [];
  let current = null;
  for (const content of contents) {
    for (const block of content) {
      if (block?.type === 'text') {
        if (!current) runs.push((current = []));
        current.push(typeof block.text === 'string' ? block.text : '');
      } else {
        current = null;
      }
    }
  }
  const texts = runs.map((r) => r.join('').trim()).filter(Boolean);
  const start = texts.findIndex((t) => /^#{1,6}\s/m.test(t));
  return (start > 0 ? texts.slice(start) : texts).join('\n\n');
}

function refusalInfo(message) {
  const category = message?.stop_details?.category;
  return {
    kind: 'refusal',
    message: `Jarvis can't help with that request.${category ? ` (Category: ${category})` : ''}`,
    retryable: false,
  };
}

/** One attempt from scratch. Resolves when the agent finished (done or refused); rejects on errors. */
async function runAttempt(ctx, mission, agent, emit) {
  agent.attempts += 1;
  agent.report = '';
  agent.thinking = '';
  agent.sources = [];
  agent.searches = [];
  agent.fetches = [];
  agent.error = null;
  agent.endedAt = null;
  if (!agent.startedAt) agent.startedAt = ctx.stamp();
  setState(agent, 'starting', 'Starting');
  emit(true);

  const prompt = buildWorkerPrompt({
    missionTitle: mission.title,
    role: agent.role,
    task: agent.task,
    web: agent.web,
    localTime: formatLocalTime(ctx.now()),
    location: ctx.settings.location,
  });
  const messages = [{ role: 'user', content: [{ type: 'text', text: prompt }] }];
  const tools = agent.web ? workerTools(ctx.depthKey) : undefined;
  const tracker = createSourceTracker();
  const contents = [];
  let continuations = 0;

  for (;;) {
    const view = createAgentView(agent, emit, tracker);
    const { message } = await requestWithFeatureFallback(
      ctx,
      (features) => buildMessageParams({
        model: agent.model,
        maxTokens: WORKER_MAX_TOKENS,
        system: WORKER_SYSTEM_V1,
        tools,
        messages: [...messages],
        showThinking: ctx.settings.showThinking,
        effort: ctx.depth.workerEffort,
        features,
      }),
      view.onEvent,
    );
    ctx.accountUsage(message, agent.model, { mission, agent });
    const content = echoContent(message.content);
    view.finalize(content);
    contents.push(content);
    const stop = message.stop_reason;
    if (stop === 'refusal') {
      const info = refusalInfo(message);
      finishAgent(ctx, agent, 'error', info.message, info);
      return;
    }
    if ((stop === 'pause_turn' || stop === 'compaction') && continuations < MAX_CONTINUATIONS) {
      continuations += 1;
      if (content.length) messages.push({ role: 'assistant', content });
      continue;
    }
    break;
  }

  agent.sources = tracker.list();
  const report = composeReport(contents);
  if (!report) {
    const info = { kind: 'unknown', message: 'The agent finished without writing a report.', retryable: false };
    finishAgent(ctx, agent, 'error', info.message, info);
    return;
  }
  agent.report = report;
  finishAgent(ctx, agent, 'done', 'Report ready');
}

/** Runs one agent to a final status. Never rejects. */
export async function runAgent(ctx, mission, agent) {
  const emit = createAgentEmitter(ctx, mission, agent);
  const limiter = ctx.limiterFor(agent.model);
  try {
    for (;;) {
      if (ctx.signal.aborted) throw abortError();
      if (limiter.active >= limiter.capacity || limiter.waiting > 0) setState(agent, 'queued', 'Waiting for a free slot');
      emit(true);
      const release = await limiter.acquire(ctx.signal);
      let failure = null;
      try {
        await runAttempt(ctx, mission, agent, emit);
      } catch (err) {
        failure = err;
      } finally {
        release();
      }
      if (!failure) return;
      if (ctx.signal.aborted || isAbortError(failure)) throw failure;

      const info = classifyError(failure, { model: agent.model });
      if (info.kind === 'network') {
        finishAgent(ctx, agent, 'interrupted', 'Connection lost — waiting to resume', info);
        return;
      }
      if ((info.kind === 'rate_limit' || info.kind === 'overloaded') && agent.attempts < WORKER_MAX_ATTEMPTS) {
        const capacity = limiter.reduce();
        const what = info.kind === 'rate_limit' ? 'Rate limit reached' : 'Claude is overloaded';
        ctx.missionNotice(mission, `${what} — slowing to ${capacity} agent${capacity === 1 ? '' : 's'} at once`);
        const waitMs = Math.max(0, ctx.retryBaseMs * agent.attempts);
        setState(agent, 'queued', `${info.kind === 'rate_limit' ? 'Rate limited' : 'Busy'} — retrying in ${Math.max(1, Math.round(waitMs / 1000))}s`);
        emit(true);
        await sleep(waitMs, ctx.signal);
        continue;
      }
      finishAgent(ctx, agent, 'error', info.message, info);
      return;
    }
  } catch (err) {
    if (ctx.signal.aborted || isAbortError(err)) {
      finishAgent(ctx, agent, 'stopped', 'Stopped', null);
    } else {
      console.error('[jarvis] agent failed unexpectedly:', err);
      const info = classifyError(err, { model: agent.model });
      finishAgent(ctx, agent, 'error', info.message, info);
    }
  } finally {
    emit.flush();
  }
}
