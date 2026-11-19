// The lead turn: stream Jarvis's requests into segments, run client tool rounds (deploy_agents,
// update_memory), follow stop reasons, and handle stop / interruption / resume (SPEC 8.4, 8.6).
//
// History rules (SPEC 8.3): conversation.apiMessages is append-only and only complete responses are
// appended. A pause_turn response is held in `ctx.paused` and sent as the trailing assistant
// message(s) of the continuation request; the whole chain is appended once the continuation
// completes, so an abandoned continuation never leaves a dangling server tool call in history.
// No DOM access here.

import {
  accountPartialUsage,
  buildMessageParams,
  echoContent,
  readFetchResult,
  readSearchResult,
  requestWithFeatureFallback,
  sourceFromCitation,
} from './stream.js';
import { ERROR_MESSAGES, classifyError, isAbortError, isToolInputParseError } from './client.js';
import {
  canPlanDeploy,
  dropMission,
  findMissionByToolUse,
  missionResultText,
  planMission,
  resumeMission,
  startDeploy,
  updatePlanning,
} from './mission.js';
import { invalidJsonResult, parseToolJson, validateMemoryInput } from './validate.js';
import { isAttachmentBlock } from './attachments.js';
import { PRICES } from './models.js';
import { countdown, retryDelayMs, retryLabel, shouldRetry } from './retry.js';
import { abortError, jsonCopy, parsePartialJson, sleep, uid } from './util.js';

/** Default lead max_tokens (balanced depth); each depth sets its own (models.js DEPTHS.leadMaxTokens). */
export const LEAD_MAX_TOKENS = 16000;
export const MAX_LEAD_REQUESTS = 12;
export const MAX_CONTINUATIONS = 6;
/** The SDK makes one quick retry; longer, visible waits are the engine's (retry.js). */
export const LEAD_SDK_MAX_RETRIES = 1;
const MAX_JSON_RETRIES = 2;
/** Waits shorter than this skip the on-screen countdown. */
const COUNTDOWN_MIN_MS = 1500;

export const STOPPED_BY_OWNER = 'Stopped by the owner.';
/**
 * A memory change still pending when a turn is resumed is never applied: Resume is one tap on a
 * checkpoint (possibly from an imported backup), not the owner asking for that change now.
 */
export const MEMORY_NOT_RESUMED = 'Memory changes are not applied when resuming; ask again.';

class RoundInterrupted extends Error {}

class Refused extends Error {
  constructor(info, req) {
    super(info.message);
    this.info = info;
    this.req = req;
  }
}

function refusalInfo(message) {
  const category = message?.stop_details?.category;
  return {
    kind: 'refusal',
    message: `Jarvis can't help with that request.${category ? ` (Category: ${category})` : ''}`,
    retryable: false,
  };
}

const modelName = (id) => PRICES[id]?.label || String(id || 'another model');

function finalToolInput(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return parsePartialJson(raw);
  }
}

// ---------------------------------------------------------------------------------------------
// Stream → segments

/** Maps one lead response stream onto segments of request `req`. */
function createLeadView(ctx, req) {
  const blocks = new Map();
  const planning = new Map(); // tool_use id → planning mission created by this request
  const showThinking = ctx.settings.showThinking;

  function appendThinking(st, text) {
    if (!showThinking || !text) return;
    if (!st.seg) {
      st.seg = { id: uid(), kind: 'thinking', text: '', req, startedAt: st.startedAt, endedAt: null };
      ctx.addSegment(st.seg);
    }
    st.seg.text += text;
    ctx.touchSegment(st.seg);
  }

  function textSegment(st) {
    if (!st.seg) {
      st.seg = { id: uid(), kind: 'text', text: '', req, citations: [] };
      ctx.addSegment(st.seg);
    }
    return st.seg;
  }

  function appendText(st, text) {
    if (!text) return;
    const seg = textSegment(st);
    seg.text += text;
    ctx.touchSegment(seg);
  }

  function addCitation(st, citation) {
    const source = sourceFromCitation(citation);
    if (!source) return;
    const seg = textSegment(st);
    if (seg.citations.some((c) => c.url === source.url)) return;
    seg.citations.push(source);
    ctx.touchSegment(seg);
  }

  function applyToolInput(seg, input) {
    if (!input || typeof input !== 'object') return false;
    if (seg.tool === 'web_search' && typeof input.query === 'string' && input.query !== seg.query) {
      seg.query = input.query;
      return true;
    }
    if (seg.tool === 'web_fetch' && typeof input.url === 'string' && input.url !== seg.url) {
      seg.url = input.url;
      return true;
    }
    return false;
  }

  function startToolSegment(block) {
    const seg = {
      id: uid(),
      kind: 'tool',
      tool: block.name,
      query: '',
      url: '',
      status: 'running',
      results: [],
      errorCode: null,
      req,
      toolUseId: block.id,
    };
    applyToolInput(seg, block.input);
    ctx.toolSegments.set(block.id, seg);
    ctx.addSegment(seg);
    return seg;
  }

  function applyResult(block) {
    const seg = ctx.toolSegments.get(block.tool_use_id);
    if (!seg) return;
    if (block.type === 'web_search_tool_result') {
      const r = readSearchResult(block);
      seg.status = r.ok ? 'done' : 'error';
      seg.results = r.ok ? r.sources : [];
      seg.errorCode = r.ok ? null : r.errorCode;
    } else {
      const r = readFetchResult(block);
      seg.status = r.ok ? 'done' : 'error';
      seg.results = r.ok && r.source ? [r.source] : [];
      seg.errorCode = r.ok ? null : r.errorCode;
      if (r.ok && r.source && !seg.url) seg.url = r.source.url;
    }
    ctx.touchSegment(seg);
  }

  function onEvent(event, snapshot) {
    switch (event.type) {
      case 'content_block_start': {
        const b = event.content_block || {};
        const st = { type: b.type, raw: '', startedAt: ctx.stamp(), seg: null, mission: null };
        blocks.set(event.index, st);
        if (b.type === 'thinking') {
          appendThinking(st, b.thinking);
        } else if (b.type === 'text') {
          // Text is split into several blocks around citations: keep one segment for the run.
          const prev = blocks.get(event.index - 1);
          if (prev && prev.type === 'text' && prev.seg) st.seg = prev.seg;
          appendText(st, b.text);
          for (const c of b.citations || []) addCitation(st, c);
        } else if (b.type === 'server_tool_use') {
          if (b.name === 'web_search' || b.name === 'web_fetch') st.seg = startToolSegment(b);
        } else if (b.type === 'web_search_tool_result' || b.type === 'web_fetch_tool_result') {
          applyResult(b);
        } else if (b.type === 'tool_use') {
          if (b.name === 'deploy_agents' && canPlanDeploy(ctx)) {
            st.mission = planMission(ctx, b.id, req);
            planning.set(b.id, st.mission);
          }
        } else if (b.type === 'fallback') {
          ctx.addSegment({
            id: uid(),
            kind: 'notice',
            level: 'info',
            text: `${modelName(b.from?.model)} declined part of this request, so ${modelName(b.to?.model)} finished the reply.`,
            req,
          });
        }
        break;
      }
      case 'content_block_delta': {
        const st = blocks.get(event.index);
        if (!st) break;
        const d = event.delta || {};
        if (d.type === 'thinking_delta') appendThinking(st, d.thinking);
        else if (d.type === 'text_delta') appendText(st, d.text);
        else if (d.type === 'citations_delta') addCitation(st, d.citation);
        else if (d.type === 'input_json_delta') {
          st.raw += d.partial_json || '';
          if (st.seg?.kind === 'tool') {
            if (applyToolInput(st.seg, parsePartialJson(st.raw))) ctx.touchSegment(st.seg);
          } else if (st.mission) {
            updatePlanning(ctx, st.mission, st.raw);
          }
        }
        break;
      }
      case 'content_block_stop': {
        const st = blocks.get(event.index);
        if (!st) break;
        if (st.type === 'thinking' && st.seg) {
          st.seg.endedAt = ctx.stamp();
          ctx.touchSegment(st.seg);
        } else if (st.seg?.kind === 'tool') {
          if (applyToolInput(st.seg, finalToolInput(st.raw))) ctx.touchSegment(st.seg);
        } else if (st.mission) {
          updatePlanning(ctx, st.mission, st.raw);
        }
        const block = snapshot?.content?.[event.index];
        if (block && (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result')) applyResult(block);
        break;
      }
      default:
        break;
    }
  }

  /** Final pass over the complete content (idempotent). */
  function finalize(content) {
    for (const st of blocks.values()) {
      if (st.type === 'thinking' && st.seg && !st.seg.endedAt) {
        st.seg.endedAt = ctx.stamp();
        ctx.touchSegment(st.seg);
      }
    }
    for (const block of content) {
      if (block.type === 'server_tool_use') {
        const seg = ctx.toolSegments.get(block.id);
        if (seg && applyToolInput(seg, block.input)) ctx.touchSegment(seg);
      } else if (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result') {
        applyResult(block);
      }
    }
  }

  return { onEvent, finalize, planning };
}

/** Drops everything a failed attempt of request `req` (or later) showed, before a retry/resume. */
function discardRequest(ctx, req) {
  const removed = ctx.removeSegments((s) => typeof s.req === 'number' && s.req >= req);
  for (const seg of removed) {
    if (seg.kind === 'mission') {
      const mission = ctx.turn.missions[seg.missionId];
      if (mission && !mission.startedAt) delete ctx.turn.missions[seg.missionId];
    } else if (seg.kind === 'tool' && seg.toolUseId) {
      ctx.toolSegments.delete(seg.toolUseId);
    }
  }
}

function leadParams(ctx, features) {
  return buildMessageParams({
    model: ctx.leadModel,
    maxTokens: ctx.maxTokensFor(ctx.leadModel, ctx.depth.leadMaxTokens || LEAD_MAX_TOKENS),
    system: ctx.conv.system,
    tools: ctx.conv.tools,
    messages: [...ctx.conv.apiMessages, ...ctx.paused],
    showThinking: ctx.settings.showThinking,
    effort: ctx.depth.leadEffort,
    features,
    compaction: true,
    container: ctx.leadContainer(),
    dropMismatchedThinking: ctx.conv.dropMismatchedThinking === true,
  });
}

/**
 * Waits before a retry. Long waits show a live countdown in the turn (a notice segment that is
 * removed when the wait ends), so a rate limit never looks like a silent stall.
 */
async function waitToRetry(ctx, req, ms, label) {
  if (ms < COUNTDOWN_MIN_MS) return sleep(ms, ctx.signal);
  const seg = ctx.addSegment({ id: uid(), kind: 'notice', level: 'warn', text: '', req, transient: true });
  try {
    await countdown(ms, ctx.signal, (s) => {
      const text = `${label} — retrying in ${s}s`;
      if (seg.text !== text) {
        seg.text = text;
        ctx.touchSegment(seg);
      }
    });
  } finally {
    ctx.removeSegments((x) => x === seg);
  }
}

/**
 * One lead request (index `req`), retried in place for a malformed tool-input stream and, with
 * visible waits, for rate limits, overload, transient server errors (also mid-stream) and
 * connection failures before any output (retry.js). The SDK itself retries at most once.
 */
async function leadRequest(ctx, req) {
  let jsonRetries = 0;
  let attempts = 0;
  for (;;) {
    const view = createLeadView(ctx, req);
    try {
      const result = await requestWithFeatureFallback(ctx, (features) => leadParams(ctx, features), view.onEvent, {
        requestOptions: { maxRetries: ctx.sdkRetries(LEAD_SDK_MAX_RETRIES) },
        onContainerRejected: () => {
          ctx.conv.container = null;
        },
        onThinkingMismatch: () => {
          ctx.conv.dropMismatchedThinking = true; // keep sending drop_block for this conversation
        },
      });
      view.finalize(result.message.content);
      ctx.adoptContainer(result.message.container);
      return { ...result, planning: view.planning };
    } catch (err) {
      accountPartialUsage(ctx, err, ctx.leadModel, null);
      if (ctx.stopped || isAbortError(err)) throw err;
      if (isToolInputParseError(err) && jsonRetries < MAX_JSON_RETRIES) {
        jsonRetries += 1;
        discardRequest(ctx, req);
        continue;
      }
      const info = classifyError(err, { model: ctx.leadModel });
      attempts += 1;
      if (!shouldRetry(err, info, attempts)) throw err;
      discardRequest(ctx, req);
      const waitMs = retryDelayMs(err, attempts, { baseMs: ctx.retryBaseMs, maxWaitMs: ctx.maxRetryWaitMs });
      if (info.kind === 'rate_limit' && attempts >= 2) ctx.lowLimitsNotice();
      const label = retryLabel(info.kind);
      ctx.notice('warn', `${label} — retrying in ${Math.max(1, Math.round(waitMs / 1000))}s`);
      await waitToRetry(ctx, req, waitMs, label);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// History and tool rounds

function setCheckpoint(ctx, pending) {
  ctx.conv.pending = { turnId: ctx.turn.id, ...pending };
  ctx.persistSoon();
}

/** Appends the held pause_turn chain plus this message's content to apiMessages. */
function commitAssistant(ctx, content) {
  const messages = content.length ? [...ctx.paused, { role: 'assistant', content }] : [];
  ctx.paused = [];
  if (messages.length) ctx.conv.apiMessages.push(...messages);
  ctx.conv.updatedAt = ctx.stamp();
}

function toolResultBlock(id, result) {
  const block = { type: 'tool_result', tool_use_id: id, content: String(result?.content ?? '') };
  if (result?.is_error) block.is_error = true;
  return block;
}

export const STOPPED_BEFORE_ALL_FINISHED = 'Stopped by the owner before all agents finished.';

/**
 * Results for a tool round the owner cut short (Stop, or a new message instead of Resume): a
 * deploy_agents call whose mission has at least one finished agent gets the mission report
 * (missionResultText, which also lists the stopped agents) after STOPPED_BEFORE_ALL_FINISHED, as a
 * normal result, so the finished agents' work is not thrown away. Calls that already have a
 * result keep it; the rest are left for toolResultMessage's fallback error. Returns a new map.
 */
export function stoppedRoundResults(turn, toolUses, results, { limit } = {}) {
  const out = { ...(results || {}) };
  for (const tu of toolUses || []) {
    if (!tu || out[tu.id] || tu.name !== 'deploy_agents') continue;
    const mission = findMissionByToolUse(turn, tu.id);
    if (!mission || !mission.startedAt || !(mission.agents || []).some((a) => a.status === 'done')) continue;
    const requested = Array.isArray(tu.input?.agents) ? tu.input.agents.length : mission.agents.length;
    out[tu.id] = { content: `${STOPPED_BEFORE_ALL_FINISHED}\n${missionResultText(mission, { requested, limit })}` };
  }
  return out;
}

/** ONE user message holding a tool_result per tool_use, in tool_use order. */
export function toolResultMessage(toolUses, results, fallbackText = STOPPED_BY_OWNER) {
  return {
    role: 'user',
    content: toolUses.map((tu) => toolResultBlock(tu.id, results?.[tu.id] ?? { content: fallbackText, is_error: true })),
  };
}

function closeRound(ctx, fallbackText) {
  const round = ctx.round;
  if (!round) return;
  ctx.round = null;
  ctx.conv.apiMessages.push(toolResultMessage(round.toolUses, round.results, fallbackText));
  ctx.conv.updatedAt = ctx.stamp();
}

/** Answers tool_use blocks that must not run (e.g. cut off at max_tokens) so history stays valid. */
function answerUnrun(ctx, blocks, text) {
  const results = {};
  for (const b of blocks) results[b.id] = { content: text, is_error: true };
  ctx.conv.apiMessages.push(toolResultMessage(blocks, results));
}

async function applyMemory(ctx, toolUse, req) {
  if (!ctx.settings.memoryEnabled) return { content: 'Memory is turned off in Settings.', is_error: true };
  const check = validateMemoryInput(toolUse.input);
  if (!check.ok) return { content: check.error, is_error: true };
  const memory = ctx.deps.memory;
  const { action, fact } = check.value;
  try {
    if (action === 'add') {
      if (typeof memory?.add !== 'function') return { content: 'Memory is unavailable right now.', is_error: true };
      await memory.add(fact);
      ctx.addSegment({ id: uid(), kind: 'memory', action: 'add', fact, req });
      return { content: 'Saved.' };
    }
    if (typeof memory?.remove !== 'function') return { content: 'Memory is unavailable right now.', is_error: true };
    const removed = await memory.remove(fact);
    if (!removed) return { content: 'No matching memory found.' };
    ctx.addSegment({ id: uid(), kind: 'memory', action: 'remove', fact, req });
    return { content: 'Removed.' };
  } catch (err) {
    return { content: `Memory could not be updated: ${String(err?.message || err)}`, is_error: true };
  }
}

function missionDone(ctx, round, toolUse, mission) {
  if (mission.status === 'done' || mission.status === 'partial') {
    const requested = Array.isArray(toolUse.input?.agents) ? toolUse.input.agents.length : mission.agents.length;
    round.results[toolUse.id] = {
      content: missionResultText(mission, { requested, limit: ctx.settings.maxAgents }),
    };
    ctx.persistSoon();
  }
}

/**
 * Waits for the round's missions, then appends the tool_result message. A mission without a result
 * at this point was interrupted (its agents lost the connection): the round stays pending.
 */
async function finishRound(ctx, round, missionRuns) {
  await Promise.all(missionRuns);
  if (ctx.stopped) throw abortError();
  if (round.toolUses.some((tu) => !round.results[tu.id])) throw new RoundInterrupted('agents were interrupted');
  ctx.round = null;
  ctx.conv.apiMessages.push(toolResultMessage(round.toolUses, round.results));
  ctx.conv.updatedAt = ctx.stamp();
  setCheckpoint(ctx, { toolUses: [], req: ctx.req });
}

/** Executes every client tool_use of the last assistant message (missions run concurrently). */
async function runToolRound(ctx, blocks, rawInputs, planning) {
  const req = ctx.req - 1; // the request that asked for these tools
  const parsed = blocks.map((b) => {
    const raw = rawInputs.get(b.id);
    const check = raw === undefined ? { ok: true, value: b.input } : parseToolJson(raw);
    return { id: b.id, name: b.name, input: check.ok ? (check.value ?? {}) : (b.input ?? {}), badJson: check.ok ? null : raw };
  });
  const round = {
    toolUses: parsed.map(({ id, name, input }) => ({ id, name, input })),
    results: {},
    missionIds: [],
  };
  ctx.round = round;
  setCheckpoint(ctx, { toolUses: round.toolUses, results: round.results, missionIds: round.missionIds, req: ctx.req });

  const missionRuns = [];
  for (const tu of parsed) {
    if (tu.badJson !== null) {
      dropMission(ctx, planning.get(tu.id));
      round.results[tu.id] = invalidJsonResult(tu.badJson);
    } else if (tu.name === 'deploy_agents') {
      const outcome = startDeploy(ctx, tu, { planned: planning.get(tu.id) || findMissionByToolUse(ctx.turn, tu.id), req });
      if (outcome.result) {
        round.results[tu.id] = outcome.result;
      } else {
        round.missionIds.push(outcome.mission.id);
        missionRuns.push(outcome.done.then(() => missionDone(ctx, round, tu, outcome.mission)));
      }
    } else if (tu.name === 'update_memory') {
      round.results[tu.id] = await applyMemory(ctx, tu, req);
    } else {
      round.results[tu.id] = { content: `Unknown tool "${tu.name}". Use only the tools you were given.`, is_error: true };
    }
  }
  ctx.persistSoon();
  await finishRound(ctx, round, missionRuns);
}

/** Resumes the tool round saved in conversation.pending: re-runs unfinished agents only. */
async function resumeToolRound(ctx, pending) {
  const round = {
    toolUses: pending.toolUses.map(({ id, name, input }) => ({ id, name, input })),
    results: { ...(pending.results || {}) },
    missionIds: [...(pending.missionIds || [])],
  };
  ctx.round = round;
  setCheckpoint(ctx, { toolUses: round.toolUses, results: round.results, missionIds: round.missionIds, req: ctx.req });
  const missionRuns = [];
  for (const tu of round.toolUses) {
    if (round.results[tu.id]) continue;
    if (tu.name === 'deploy_agents') {
      const mission = findMissionByToolUse(ctx.turn, tu.id);
      if (!mission || !mission.startedAt) {
        round.results[tu.id] = { content: 'This mission could not be resumed. Deploy it again if it is still needed.', is_error: true };
        continue;
      }
      if (!round.missionIds.includes(mission.id)) round.missionIds.push(mission.id);
      missionRuns.push(resumeMission(ctx, mission).then(() => missionDone(ctx, round, tu, mission)));
    } else if (tu.name === 'update_memory') {
      round.results[tu.id] = { content: MEMORY_NOT_RESUMED, is_error: true };
    } else {
      round.results[tu.id] = { content: `Unknown tool "${tu.name}". Use only the tools you were given.`, is_error: true };
    }
  }
  await finishRound(ctx, round, missionRuns);
}

// ---------------------------------------------------------------------------------------------
// The loop

async function leadLoop(ctx) {
  for (;;) {
    if (ctx.stopped) throw abortError();
    if (ctx.req >= MAX_LEAD_REQUESTS) {
      ctx.addSegment({ id: uid(), kind: 'notice', level: 'warn', text: 'Jarvis reached its limit of steps for one reply.', req: ctx.req - 1 });
      return;
    }
    const req = ctx.req;
    ctx.currentReq = req;
    setCheckpoint(ctx, { toolUses: [], req, ...(ctx.paused.length ? { paused: jsonCopy(ctx.paused) } : {}) });
    const { message, rawInputs, planning } = await leadRequest(ctx, req);
    ctx.req = req + 1;
    ctx.accountUsage(message, ctx.leadModel, null);
    ctx.emitTurn();
    const stop = message.stop_reason;

    if (stop === 'pause_turn' || stop === 'compaction') {
      ctx.continuations += 1;
      if (ctx.continuations <= MAX_CONTINUATIONS) {
        const content = echoContent(message.content);
        if (content.length) ctx.paused.push({ role: 'assistant', content });
        continue;
      }
      ctx.continuations = 0;
      commitAssistant(ctx, echoContent(message.content, { dropUnpairedServerTools: true }));
      ctx.addSegment({ id: uid(), kind: 'notice', level: 'info', text: 'Jarvis paused a long research step here. Ask it to carry on if you need more.', req });
      return;
    }
    ctx.continuations = 0;

    if (stop === 'refusal') {
      // Partial output of a refused response is discarded, never appended (nor its paused chain).
      ctx.paused = [];
      for (const mission of planning.values()) dropMission(ctx, mission);
      throw new Refused(refusalInfo(message), req);
    }

    const content = echoContent(message.content, { dropUnpairedServerTools: true });
    const toolUses = content.filter((b) => b.type === 'tool_use');
    // A deploy_agents call that is not part of the appended turn (e.g. left out after a fallback) never runs.
    for (const [id, mission] of planning) if (!toolUses.some((b) => b.id === id)) dropMission(ctx, mission);
    commitAssistant(ctx, content);

    if (stop === 'tool_use' && toolUses.length) {
      await runToolRound(ctx, toolUses, rawInputs, planning);
      continue;
    }
    if (toolUses.length) {
      // Never run a tool call cut off by a limit; answer it so the history stays valid.
      for (const b of toolUses) dropMission(ctx, planning.get(b.id));
      answerUnrun(ctx, toolUses, 'Not run: the reply ended before this tool call was complete.');
    }
    if (stop === 'max_tokens') {
      ctx.addSegment({ id: uid(), kind: 'notice', level: 'warn', text: 'The reply hit the length limit.', req });
    } else if (stop === 'model_context_window_exceeded') {
      ctx.addSegment({ id: uid(), kind: 'notice', level: 'warn', text: ERROR_MESSAGES.context, req });
    }
    return;
  }
}

function interruptTurn(ctx, info) {
  if (!ctx.round) {
    const req = typeof ctx.currentReq === 'number' ? ctx.currentReq : ctx.req;
    setCheckpoint(ctx, { toolUses: [], req, ...(ctx.paused.length ? { paused: jsonCopy(ctx.paused) } : {}) });
  }
  return ctx.finish('interrupted', info);
}

function stopTurn(ctx) {
  if (ctx.round) {
    // The round's missions have settled by now (finishRound waits for every agent to stop).
    ctx.round.results = stoppedRoundResults(ctx.turn, ctx.round.toolUses, ctx.round.results, { limit: ctx.settings.maxAgents });
    closeRound(ctx, STOPPED_BY_OWNER);
  }
  ctx.paused = [];
  withdrawUnanswered(ctx);
  return ctx.finish('stopped', null);
}

/**
 * A turn stopped before Jarvis appended anything to the history (e.g. Send tapped twice, the
 * second tap landing on Stop) is withdrawn: its user message is the last one and nothing was built
 * on it, so removing it edits no earlier prefix (as in withdrawRejectedAttachments). Otherwise the
 * message - with any photos - would stay in the history, and sending it again would carry it twice.
 * `turn.withdrawn = true` (emitted with the final 'turn' event) tells the UI to put the text and
 * attachments back into the composer; the UserTurn and the JarvisTurn stay in conversation.turns.
 */
function withdrawUnanswered(ctx) {
  const start = ctx.turn.apiStart;
  const messages = ctx.conv.apiMessages;
  if (!Number.isInteger(start) || start < 0 || messages.length !== start + 1 || messages[start]?.role !== 'user') return;
  messages.pop();
  ctx.turn.withdrawn = true;
  ctx.conv.updatedAt = ctx.stamp();
}

/**
 * A photo or PDF that Claude rejects (400, or 413 too large, on the turn's first request) would
 * otherwise stay in the append-only history and make every later request fail too. The user
 * message carrying it is then the last message and nothing was built on it (no assistant content,
 * no thinking block is bound to it), so it is withdrawn from apiMessages; the transcript keeps it,
 * with this error. Returns the ErrorInfo to report.
 */
function withdrawRejectedAttachments(ctx, info) {
  if (ctx.req !== 0 || (info.kind !== 'bad_request' && info.kind !== 'context')) return info;
  const messages = ctx.conv.apiMessages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || !Array.isArray(last.content) || !last.content.some(isAttachmentBlock)) return info;
  messages.pop();
  ctx.conv.updatedAt = ctx.stamp();
  const several = last.content.filter(isAttachmentBlock).length > 1;
  const files = several ? 'the attached files' : 'the attached file';
  if (info.kind === 'context') {
    return { ...info, message: `${several ? 'The attached files are' : 'The attached file is'} too large for Claude to read here, so this message was left out of the conversation. Try ${several ? 'fewer or smaller files' : 'a smaller file'}.` };
  }
  const detail = String(info.message || '').replace(/^Claude rejected the request:\s*/, '').trim();
  return {
    ...info,
    message: `Claude couldn’t accept ${files}, so this message was left out of the conversation. Try ${several ? 'different files' : 'a different file'}.${detail ? ` (${detail})` : ''}`,
  };
}

/**
 * A refused turn leaves the history: everything it appended (the owner's message, assistant
 * messages and tool results) is removed, so the refused request is never re-sent and cannot make
 * later turns fail. Removing a trailing run of messages edits no earlier prefix, so the history
 * check still passes. The transcript keeps the turn with its error.
 */
function removeTurnFromHistory(ctx) {
  const start = ctx.turn.apiStart;
  const messages = ctx.conv.apiMessages;
  ctx.round = null;
  ctx.paused = [];
  if (!Number.isInteger(start) || start < 0 || start > messages.length) return;
  messages.length = start;
  ctx.conv.updatedAt = ctx.stamp();
}

function failTurn(ctx, info, req) {
  if (ctx.round) closeRound(ctx, `Not completed: ${info.message}`);
  ctx.paused = [];
  ctx.addSegment({ id: uid(), kind: 'error', error: info, req: typeof req === 'number' ? req : ctx.req });
  return ctx.finish('error', info);
}

/** Runs (or resumes) the lead turn to completion. Never rejects. */
export async function runLeadTurn(ctx, { resume = false } = {}) {
  try {
    if (!ctx.apiKey) {
      const info = { kind: 'auth', message: ERROR_MESSAGES.missingKey, retryable: false };
      return failTurn(ctx, info, ctx.req);
    }
    if (ctx.clientError || !ctx.client) {
      console.error('[jarvis] could not create the API client:', ctx.clientError);
      return failTurn(ctx, classifyError(ctx.clientError, { model: ctx.leadModel }), ctx.req);
    }
    if (resume) {
      const pending = ctx.conv.pending || {};
      if (Array.isArray(pending.toolUses) && pending.toolUses.length) {
        await resumeToolRound(ctx, pending);
      } else {
        // Drop what the cut request showed; re-issue it from the current history.
        discardRequest(ctx, ctx.req);
        ctx.paused = Array.isArray(pending.paused) ? jsonCopy(pending.paused) : [];
        ctx.continuations = ctx.paused.length;
      }
    }
    await leadLoop(ctx);
    return ctx.finish('done', null);
  } catch (err) {
    try {
      if (ctx.stopped || isAbortError(err)) return stopTurn(ctx);
      if (err instanceof RoundInterrupted) {
        return interruptTurn(ctx, { kind: 'network', message: ERROR_MESSAGES.network, retryable: true });
      }
      if (err instanceof Refused) {
        removeTurnFromHistory(ctx);
        return failTurn(ctx, err.info, err.req);
      }
      const info = classifyError(err, { model: ctx.leadModel });
      if (info.kind === 'network') return interruptTurn(ctx, info);
      if (info.kind === 'unknown') console.error('[jarvis] lead request failed:', err);
      return failTurn(ctx, withdrawRejectedAttachments(ctx, info), ctx.currentReq);
    } catch (fatal) {
      console.error('[jarvis] could not finish the turn cleanly:', fatal);
      return ctx.finish('error', { kind: 'unknown', message: 'Something went wrong.', retryable: false });
    }
  }
}
