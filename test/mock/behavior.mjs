// Scripted behavior of the mock Claude API: classifies a validated request (lead, worker, key test)
// and decides the response from [[directives]] in the latest user text plus the conversation so
// far. The lead's progress through a turn is derived from the request history itself (stateless);
// only directives that count attempts ([[overloaded]], [[ratelimit:K]], [[dropworkers]],
// [[droplead]]) keep state, in the `state` object owned by the mock instance. A Voice Mode turn
// (the spoken reply channel in <turn_context>) gets spoken-style replies, streamed at a realistic
// pace (plan.spoken). Holograms, blueprints and the saved library (lead tools version 4) are in
// visuals.mjs; every directive is documented in README.md.

import {
  SPOKEN_PREAMBLE, attachmentAnswer, attachmentTaskNote, attachmentsOf, defaultAnswer, directivesForAgent, fetchResultBlock,
  longAnswer, parseAgentReports, parseAssignment, parseDirectives, searchResults, spokenAnswer, spokenAttachmentAnswer,
  spokenLongAnswer, spokenMemoryAnswer, spokenSearchAnswer, spokenSynthesisAnswer, spokenXssAnswer, stripDirectives,
  synthesisAnswer, textBlocks, toolResultText, topicOfPrompt, topicOfTask, turnContextOf, userTextOf,
  valueFromSchema, workerReportSegments, xssAnswer,
} from './content.mjs';
import { canonicalJson, newServerToolUseId, newToolUseId, seededRandom, sha256Hex, truncate } from './util.mjs';
import {
  HOLOGRAM_SAMPLES, BLUEPRINT_SAMPLES, VISUAL_TOOL_NAMES, blueprintPlan, blueprintRequestOf, chooseBlueprintSample, hasTool,
  hologramPlan, openSavedPlan, savedIdsOf, turnContextText, visualFollowUpText,
} from './visuals.mjs';
import { OPTICS_TOOL_NAMES, cameraIsLive, isWatchRequest, lookThroughCameraPlan, opticsFollowUpPlan, opticsFrameOf, opticsLookPlan, watchAnswer } from './optics.mjs';

const sentenceCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function createBehaviorState() {
  return {
    overloaded: new Set(), // first lead request of a turn already answered with 529
    ratelimit: new Map(), // mission title -> worker requests rejected so far
    dropped: new Set(), // worker identities whose first attempt was already cut
    droppedLead: new Set(), // lead requests ([[droplead]]) whose first response was already cut
    containers: new Map(), // code-execution container id -> { expiresAt } (web tools' dynamic filtering)
    containerByToolUse: new Map(), // server_tool_use id -> the container it ran in
  };
}

/**
 * 'lead' | 'structured' | 'worker' | 'keytest' | 'other' (see the infra brief). 'structured' is a
 * request with output_config.format (e.g. the follow-up suggestions of SPEC §14.5).
 */
export function classifyRequest(body) {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (tools.some((t) => t && t.name === 'deploy_agents')) return 'lead';
  if (body.output_config && typeof body.output_config === 'object' && body.output_config.format) return 'structured';
  if (body.stream === true) return 'worker';
  return body.model === 'claude-haiku-5-5' ? 'keytest' : 'other';
}

const REFUSAL_DETAILS = Object.freeze({
  type: 'refusal',
  category: 'cyber',
  explanation: 'This request could enable cyber harm, such as malware or exploit development.',
  fallback_credit_token: null,
  fallback_has_prefill_claim: null,
  recommended_model: null,
});

export const SCRIPTED_ERRORS = {
  overloaded: () => ({ status: 529, type: 'overloaded_error', message: 'Overloaded', headers: { 'x-should-retry': 'true' } }),
  rateLimited: (retryAfter = 0) => ({
    status: 429,
    type: 'rate_limit_error',
    message: "This request would exceed your organization's rate limit of 50 requests per minute (model: claude-sonnet-5-5). Please reduce the prompt length or the maximum tokens requested, or try again later.",
    headers: {
      'retry-after': String(retryAfter),
      'x-should-retry': 'true',
      'anthropic-ratelimit-requests-limit': '50',
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-reset': new Date(Date.now() + 1000).toISOString(),
      'anthropic-ratelimit-output-tokens-limit': '400000',
    },
  }),
  /** Output tokens per minute are charged from max_tokens at the start, so a large max_tokens on a low tier always fails. */
  outputTokensPerMinute: (limit, model) => ({
    status: 429,
    type: 'rate_limit_error',
    message: `This request would exceed your organization's rate limit of ${limit} output tokens per minute (model: ${model}). For details, refer to: https://docs.claude.com/en/api/rate-limits. You can see the response headers for current usage. Please reduce the prompt length or the maximum tokens requested, or try again later.`,
    headers: {
      'retry-after': '1',
      'x-should-retry': 'true',
      'anthropic-ratelimit-output-tokens-limit': String(limit),
      'anthropic-ratelimit-output-tokens-remaining': '0',
      'anthropic-ratelimit-output-tokens-reset': new Date(Date.now() + 1000).toISOString(),
    },
  }),
  serverError: () => ({ status: 500, type: 'api_error', message: 'Internal server error', headers: { 'x-should-retry': 'true' } }),
};

const ANGLES = [
  { role: 'Market analyst', angle: 'the current landscape, the leading options and what changed this year' },
  { role: 'Technical researcher', angle: 'the underlying technology, specifications and how the options really differ' },
  { role: 'Price tracker', angle: 'current prices, deals and the total cost of ownership' },
  { role: 'Reviews scout', angle: 'expert reviews and owner feedback, including common complaints' },
  { role: 'Regulation specialist', angle: 'rules, standards, incentives and compliance issues' },
  { role: 'Trend forecaster', angle: 'where things are heading over the next two years' },
  { role: 'Risk assessor', angle: 'risks, known problems, recalls and failure modes' },
  { role: 'Data analyst', angle: 'hard numbers: statistics, benchmarks and comparisons' },
  { role: 'Local guide', angle: "availability and specifics for the owner's location" },
  { role: 'Historian', angle: 'how the situation developed and the key milestones' },
  { role: 'Skeptic', angle: 'claims that are disputed or poorly supported' },
  { role: 'Sustainability analyst', angle: 'environmental impact and efficiency' },
  { role: 'Safety reviewer', angle: 'safety ratings, incidents and independent test results' },
  { role: 'Support investigator', angle: 'warranty terms, service networks and after-sales support' },
  { role: 'Competitor watcher', angle: 'new entrants and upcoming alternatives worth waiting for' },
  { role: 'Finance specialist', angle: 'financing, leasing, resale value and depreciation' },
  { role: 'User experience tester', angle: 'day-to-day usability and real-world convenience' },
  { role: 'Supply chain analyst', angle: 'availability, lead times and supply constraints' },
  { role: 'Policy watcher', angle: 'government policy changes that could affect the decision' },
  { role: 'Community researcher', angle: 'what enthusiast communities and forums report' },
];

function thinkingDisplay(body) {
  const d = body.thinking?.display;
  return d === 'summarized' || d === 'updates' ? d : 'omitted';
}
const thinkingBlock = (body, text) => ({ type: 'thinking', thinking: thinkingDisplay(body) === 'omitted' ? '' : text, signature: '' });
const text = (t) => ({ type: 'text', text: t, citations: null });

/**
 * Plan the response for a validated request.
 * Returns { error } (a scripted API error: not a violation) or { plan }, where
 * plan = { blocks, stop_reason, stop_details, pace, cutAfter? }.
 */
export function planResponse({ body, kind, state, now }) {
  if (kind === 'lead') return planLead(body, state, now);
  if (kind === 'worker') return planWorker(body, state, now);
  if (kind === 'structured') {
    // Optics Watch: a realistic { worth_saying, line, summary } for the frame.
    if (isWatchRequest(body)) return { plan: { blocks: [text(watchAnswer(body))], stop_reason: 'end_turn', pace: 'quick' } };
    // Structured outputs: one text block whose text is JSON matching the schema.
    const schema = body.output_config.format.schema;
    return { plan: { blocks: [text(JSON.stringify(valueFromSchema(schema)))], stop_reason: 'end_turn', pace: 'quick' } };
  }
  // The key test (non-streaming Haiku "Reply with the single word: ready") and any other
  // non-streaming request without the lead's tools.
  const prompt = userTextOf(lastUserWithText(body.messages).message);
  if (kind === 'keytest' || /single word:\s*ready/i.test(prompt)) {
    return { plan: { blocks: [text('ready')], stop_reason: 'end_turn', pace: 'quick' } };
  }
  return { plan: { blocks: [text(defaultAnswer(prompt, { name: 'sir' }))], stop_reason: 'end_turn', pace: 'normal' } };
}

function lastUserWithText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && userTextOf(messages[i])) return { index: i, message: messages[i] };
  }
  return { index: -1, message: null };
}

// ---------------------------------------------------------------------------------------------
// Lead

function planLead(body, state, now) {
  // A Voice Mode turn (the spoken reply channel in the newest owner message's <turn_context>):
  // replies are written for the ear, and every lead response streams its text a few words at a
  // time at a model's real pace (anthropic-mock.mjs), so speech can start while it still arrives.
  const spoken = turnContextOf(lastUserWithText(body.messages).message).spoken;
  const decision = leadDecision(body, state, now, spoken);
  if (spoken && decision.plan) decision.plan.spoken = true;
  return decision;
}

function leadDecision(body, state, now, spoken) {
  const msgs = body.messages;
  const { index: u, message: userMsg } = lastUserWithText(msgs);
  const prompt = userTextOf(userMsg);
  const ctx = turnContextOf(userMsg);
  const d = parseDirectives(prompt);
  const after = msgs.slice(u + 1);
  const last = msgs[msgs.length - 1];
  const rng = seededRandom(`lead|${prompt}|${msgs.length}`);
  const pace = d.has('slow') ? 'slow-lead' : d.has('long') ? 'long' : 'normal';
  const files = attachmentsOf(userMsg); // photos and PDFs the owner attached to this message
  const env = { body, d, ctx, prompt, rng, pace, now, files, spoken };

  // [[otpm:N]]: an output-tokens-per-minute limit of N; a max_tokens above it is rejected (429).
  if (d.has('otpm') && body.max_tokens > d.int('otpm', 8000, 1, 10_000_000)) return { error: SCRIPTED_ERRORS.outputTokensPerMinute(d.int('otpm', 8000, 1, 10_000_000), body.model) };
  if (last.role === 'assistant') return { plan: leadResume(env, last) };
  const planned = planLeadTurn(env, { msgs, u, last, after, state });
  // [[droplead]] / [[droplead:N]]: the first response to each request is cut after N frames (a
  // dropped connection mid-stream); the same request succeeds when it is sent again (Resume).
  if (planned.plan && d.has('droplead')) {
    const key = sha256Hex(canonicalJson({ system: body.system, messages: msgs }));
    if (!state.droppedLead.has(key)) {
      state.droppedLead.add(key);
      planned.plan.cutAfter = d.int('droplead', 60, 4, 100000);
    }
  }
  return planned;
}

function planLeadTurn(env, { msgs, u, last, after, state }) {
  const { body, d, ctx, prompt, rng, pace, files, spoken } = env;
  const userMsg = msgs[u];
  const think = (t) => thinkingBlock(body, t);

  if (after.length === 0) {
    if (d.has('overloaded')) {
      const key = sha256Hex(canonicalJson({ system: body.system, messages: msgs }));
      if (!state.overloaded.has(key)) {
        state.overloaded.add(key);
        return { error: SCRIPTED_ERRORS.overloaded() };
      }
    }
    if (d.has('refuse')) {
      return {
        plan: {
          blocks: [thinkingBlock(body, 'This asks for help building malware. I should decline.'), text("I'm sorry, but I can't help with")],
          stop_reason: 'refusal',
          stop_details: { ...REFUSAL_DETAILS },
          pace,
        },
      };
    }
    if (d.has('pause')) {
      const query = `${topicOfPrompt(prompt)} latest`;
      return {
        plan: {
          blocks: [
            thinkingBlock(body, `The owner wants current information on "${topicOfPrompt(prompt)}". I'll search the web.`),
            text(spoken ? SPOKEN_PREAMBLE : 'Let me check the latest information on that.'),
            { type: 'server_tool_use', id: newServerToolUseId(), name: 'web_search', input: { query } },
          ],
          stop_reason: 'pause_turn',
          pace,
        },
      };
    }
    if (d.has('memory')) {
      return {
        plan: {
          blocks: [
            thinkingBlock(body, 'The owner stated a durable preference (metric units). I should save it to memory.'),
            text("I'll make a note of that."),
            { type: 'tool_use', id: newToolUseId(), name: 'update_memory', input: { action: 'add', fact: 'Prefers metric units' } },
          ],
          stop_reason: 'tool_use',
          pace,
        },
      };
    }
    if (d.has('badtool')) {
      return {
        plan: {
          blocks: [
            thinkingBlock(body, 'This needs several angles; I will deploy agents.'),
            text("I'll brief a team of agents on this."),
            { type: 'tool_use', id: newToolUseId(), name: 'deploy_agents', input: { mission: '', agents: [] } },
          ],
          stop_reason: 'tool_use',
          pace,
        },
      };
    }
    // A 2D request from the hologram viewer: one draw_blueprint call for that target.
    const request = hasTool(body, 'draw_blueprint') ? blueprintRequestOf(turnContextText(userMsg)) : null;
    if (request) {
      const sample = chooseBlueprintSample({ part: request.part, partName: request.partName, title: request.title, prompt: stripDirectives(prompt) });
      return { plan: blueprintPlan({ think, sample, forIds: request.model ? { model: request.model, part: request.part } : null, partName: request.partName, spoken }) };
    }
    if (d.has('swarm') || d.has('waves')) return { plan: deployPlan(env, { wave: 1, count: d.int('swarm', 3, 1, 20) }) };
    if (d.has('hologram') && hasTool(body, 'show_hologram')) return { plan: hologramPlan({ think, sample: hologramSample(d), spoken, slow: d.has('slowbuild') }) };
    if (d.has('blueprint') && hasTool(body, 'draw_blueprint')) {
      const named = d.arg('blueprint');
      const sample = BLUEPRINT_SAMPLES.includes(named) ? named : chooseBlueprintSample({ prompt: stripDirectives(prompt) });
      return { plan: blueprintPlan({ think, sample, forIds: null, spoken }) };
    }
    if (d.has('open-saved') && hasTool(body, 'open_saved')) return { plan: openSavedPlan({ think, ids: savedIdsOf(turnContextText(userMsg)) }) };
    // Optics (lead tools version 5): a Look's frame, or [[optics:look]] while the camera is live.
    const opticsFrame = opticsFrameOf(turnContextText(userMsg));
    if (opticsFrame && files.length) return { plan: opticsLookPlan({ think, frame: opticsFrame, d, pinsTool: hasTool(body, 'pin_labels') }) };
    if (d.arg('optics') === 'look' && hasTool(body, 'look_through_camera') && cameraIsLive(turnContextText(userMsg))) return { plan: lookThroughCameraPlan({ think }) };
    if (d.has('search')) return { plan: searchPlan(env) };
    if (d.has('xss')) {
      const answer = spoken ? textBlocks(spokenXssAnswer(ctx, d)) : [text(xssAnswer())];
      return { plan: { blocks: [thinkingBlock(body, 'The owner wants raw markup echoed back as text.'), ...answer], stop_reason: 'end_turn', pace } };
    }
    if (d.has('long')) {
      const answer = spoken ? textBlocks(spokenLongAnswer(prompt, ctx, d)) : [text(longAnswer(prompt, ctx))];
      return { plan: { blocks: [thinkingBlock(body, 'A thorough, well-structured guide is called for here.'), ...answer], stop_reason: 'end_turn', pace } };
    }
    if (files.length) {
      return {
        plan: {
          blocks: [
            thinkingBlock(body, `The owner shared ${files.length === 1 ? 'a file' : `${files.length} files`}. I'll look at ${files.length === 1 ? 'it' : 'them'} closely before answering.`),
            ...(spoken ? textBlocks(spokenAttachmentAnswer({ prompt, ctx, blocks: files, directives: d })) : [text(attachmentAnswer({ prompt, ctx, blocks: files }))]),
          ],
          stop_reason: 'end_turn',
          pace,
        },
      };
    }
    return {
      plan: {
        blocks: [
          thinkingBlock(body, `The owner asked: "${truncate(stripDirectives(prompt), 120)}". I can answer this directly and concisely.`),
          ...(spoken ? textBlocks(spokenAnswer(prompt, ctx, d)) : [text(defaultAnswer(prompt, ctx))]),
        ],
        stop_reason: 'end_turn',
        pace,
      },
    };
  }

  // A tool round just finished: `last` is the user message carrying the tool_result blocks.
  const results = new Map();
  for (const b of Array.isArray(last.content) ? last.content : []) if (b?.type === 'tool_result') results.set(b.tool_use_id, b);
  const uses = [];
  for (let i = msgs.length - 2; i >= 0 && msgs[i].role === 'assistant'; i--) {
    const blocks = Array.isArray(msgs[i].content) ? msgs[i].content : [];
    uses.unshift(...blocks.filter((b) => b?.type === 'tool_use'));
  }

  const opticsUse = [...uses].reverse().find((b) => OPTICS_TOOL_NAMES.includes(b.name));
  if (opticsUse && results.has(opticsUse.id)) {
    const result = results.get(opticsUse.id);
    return { plan: opticsFollowUpPlan({ think, use: opticsUse, result, resultText: toolResultText(result?.content), body }) };
  }
  const memoryUse = uses.find((b) => b.name === 'update_memory');
  const deployUse = uses.find((b) => b.name === 'deploy_agents');
  if (deployUse) {
    const result = results.get(deployUse.id);
    const deploys = deploysInTurn(after);
    const successful = deploys.filter((x) => x.result && !x.result.is_error);
    if (result?.is_error) {
      const reason = toolResultText(result.content);
      if (/wave limit|quick mode/i.test(reason) || deploys.length >= 4) return { plan: synthesisPlan(env, successful) };
      return { plan: deployPlan(env, { wave: successful.length + 1, count: d.int('swarm', 3, 1, 20), retry: true }) };
    }
    if (successful.length < d.int('waves', 1, 1, 4)) return { plan: deployPlan(env, { wave: successful.length + 1, count: 2, followUp: true }) };
    // A Blueprint mission: research first, then the hologram (the synthesis follows its result).
    if (d.has('hologram') && hasTool(body, 'show_hologram')) {
      return { plan: hologramPlan({ think, sample: hologramSample(d), intro: 'With the research in, here is the hologram, built from what the team found.', spoken }) };
    }
    return { plan: synthesisPlan(env, successful) };
  }
  const visualUse = uses.find((b) => VISUAL_TOOL_NAMES.includes(b.name));
  if (visualUse) {
    const result = results.get(visualUse.id);
    const partName = blueprintRequestOf(turnContextText(userMsg))?.partName || '';
    const line = visualFollowUpText(visualUse, result, toolResultText(result?.content), { spoken, partName });
    const research = deploysInTurn(after).filter((x) => x.result && !x.result.is_error);
    if (research.length && !result?.is_error) {
      // The mission's write-up: what the hologram shows first, then how it works and how it is made.
      const reports = research.flatMap((x) => parseAgentReports(x.result.content).reports);
      if (spoken) return { plan: { blocks: [think('The hologram is up; now the explanation, with sources.'), ...textBlocks([{ text: `${line} ` }, ...spokenSynthesisAnswer({ prompt, ctx, reports, directives: d })])], stop_reason: 'end_turn', pace } };
      return { plan: { blocks: [think('The hologram is up; now the explanation, with sources.'), text(`${line}\n\n${synthesisAnswer({ prompt, ctx, reports })}`)], stop_reason: 'end_turn', pace } };
    }
    return { plan: { blocks: [text(line)], stop_reason: 'end_turn', pace } };
  }
  if (memoryUse) {
    const result = results.get(memoryUse.id);
    if (spoken) {
      const failure = result?.is_error ? toolResultText(result.content) || 'The request failed.' : '';
      return { plan: { blocks: textBlocks(spokenMemoryAnswer({ ctx, failure, directives: d })), stop_reason: 'end_turn', pace } };
    }
    const msg = result?.is_error
      ? `I couldn't save that to memory: ${toolResultText(result.content) || 'the request failed'}.`
      : `Noted, ${ctx.name}: you prefer metric units, so I'll use kilometres, kilograms and degrees Celsius from now on.`;
    return { plan: { blocks: [text(msg)], stop_reason: 'end_turn', pace } };
  }
  return { plan: { blocks: [text('Done. Is there anything else you need?')], stop_reason: 'end_turn', pace } };
}

/** [[hologram:battery|alternator|camry|broken|huge]] (default camry). */
function hologramSample(d) {
  const named = d.arg('hologram').toLowerCase();
  return HOLOGRAM_SAMPLES.includes(named) || named === 'broken' || named === 'huge' ? named : 'camry';
}

/** deploy_agents tool uses in this turn, each with its tool_result (if answered). */
function deploysInTurn(after) {
  const out = [];
  after.forEach((m, i) => {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) return;
    for (const b of m.content) {
      if (b?.type !== 'tool_use' || b.name !== 'deploy_agents') continue;
      let result = null;
      for (let j = i + 1; j < after.length && !result; j++) {
        if (after[j].role !== 'user' || !Array.isArray(after[j].content)) continue;
        result = after[j].content.find((r) => r?.type === 'tool_result' && r.tool_use_id === b.id) || null;
      }
      out.push({ use: b, result });
    }
  });
  return out;
}

function deployPlan(env, { wave, count, retry = false, followUp = false }) {
  const { body, d, ctx, prompt, rng, pace, now, files = [], spoken = false } = env;
  const topic = topicOfPrompt(prompt);
  const today = ctx.localTime || now.toDateString();
  const fileNote = attachmentTaskNote(files); // agents cannot see attachments: describe them in the task
  const pool = rng.shuffle(ANGLES);
  const agents = [];
  for (let i = 0; i < count; i++) {
    const base = pool[i % pool.length];
    const role = i < pool.length ? base.role : `${base.role} ${Math.floor(i / pool.length) + 1}`;
    const extra = directivesForAgent(d, i, count);
    const task = `Research ${topic} with a focus on ${base.angle}. Deliver a concise Markdown report: key findings with a source link for each, then confidence and gaps. Today is ${today}.${fileNote ? ` ${fileNote}` : ''}${extra.length ? ` ${extra.join(' ')}` : ''}`;
    agents.push({ role, task, web: true });
  }
  const mission = truncate(followUp ? `Follow-up: ${topic}` : sentenceCase(topic), 56);
  const sentence = retry
    ? 'That briefing was malformed, so let me deploy the team properly.'
    : followUp
      ? `A couple of gaps remain, so I'm sending a follow-up wave of ${count} agents.`
      : spoken
        ? SPOKEN_PREAMBLE // spoken while the agents work
        : `I'll send ${count} agent${count === 1 ? '' : 's'} to investigate this from different angles.`;
  return {
    blocks: [
      thinkingBlock(body, `${followUp ? 'The first wave left gaps.' : 'This is broad research.'} I'll split it into ${count} distinct angles: ${agents.map((a) => a.role).join(', ')}.`),
      text(sentence),
      { type: 'tool_use', id: newToolUseId(), name: 'deploy_agents', input: { mission, agents } },
    ],
    stop_reason: 'tool_use',
    pace,
    jsonChunk: pace === 'slow-lead' ? 40 : 24,
  };
}

function synthesisPlan(env, deploys) {
  const { body, ctx, d, prompt, pace, spoken = false } = env;
  const reports = deploys.flatMap((x) => parseAgentReports(x.result.content).reports);
  return {
    blocks: [
      thinkingBlock(body, `Synthesizing ${reports.length} agent reports into one answer, reconciling where they differ.`),
      ...(spoken ? textBlocks(spokenSynthesisAnswer({ prompt, ctx, reports, directives: d })) : [text(synthesisAnswer({ prompt, ctx, reports }))]),
    ],
    stop_reason: 'end_turn',
    pace,
  };
}

function citedAnswerSegments(topic, hits) {
  const segs = [{ text: `Here is what the latest sources say about ${topic}.\n\n` }];
  hits.slice(0, 3).forEach((hit, i) => {
    segs.push({ text: '- ' });
    segs.push({ text: hit.snippet, cite: hit });
    segs.push({ text: ` ([${hit.result.title.split(' | ')[0]}](${hit.result.url}))${i < Math.min(3, hits.length) - 1 ? '\n' : ''}` });
  });
  segs.push({ text: '\n\n## Sources\n\n' + hits.map((h) => `- [${h.result.title.split(' | ')[0]}](${h.result.url})`).join('\n') });
  return segs;
}

function searchPlan(env) {
  const { body, ctx, d, prompt, rng, pace, spoken = false } = env;
  const topic = topicOfPrompt(prompt);
  const query = `${topic} 2026`;
  const id = newServerToolUseId();
  const hits = searchResults(query, rng, 'lead');
  return {
    blocks: [
      thinkingBlock(body, `This needs current information. I'll search for "${query}".`),
      ...(spoken ? [text(SPOKEN_PREAMBLE)] : []), // spoken while the search runs
      { type: 'server_tool_use', id, name: 'web_search', input: { query } },
      { type: 'web_search_tool_result', tool_use_id: id, content: hits.map((h) => h.result) },
      ...textBlocks(spoken ? spokenSearchAnswer(topic, hits, ctx, d) : citedAnswerSegments(topic, hits)),
    ],
    stop_reason: 'end_turn',
    pace,
  };
}

/** Continue a paused lead response: run the pending server tool, then answer. */
function leadResume(env, last) {
  const { body, ctx, d, prompt, rng, pace, now, spoken = false } = env;
  const pendingUse = last.content[last.content.length - 1];
  const topic = topicOfPrompt(prompt);
  const blocks = [];
  let hits;
  if (pendingUse.name === 'web_fetch') {
    hits = [{ result: { type: 'web_search_result', url: String(pendingUse.input?.url || 'https://www.example.com/'), title: 'Fetched page', encrypted_content: '', page_age: null }, snippet: `Details about ${topic}.` }];
    blocks.push(fetchResultBlock(pendingUse.id, hits[0], now));
  } else {
    hits = searchResults(String(pendingUse.input?.query || topic), rng, 'lead');
    blocks.push({ type: 'web_search_tool_result', tool_use_id: pendingUse.id, content: hits.map((h) => h.result) });
  }
  blocks.push(thinkingBlock(body, 'The search results are in; they agree on the main points.'));
  blocks.push(...textBlocks(spoken ? spokenSearchAnswer(topic, hits, ctx, d) : citedAnswerSegments(topic, hits)));
  return { blocks, stop_reason: 'end_turn', pace };
}

// ---------------------------------------------------------------------------------------------
// Workers

function planWorker(body, state, now) {
  const msgs = body.messages;
  const first = msgs[0];
  const raw = userTextOf(first);
  const a = parseAssignment(raw);
  const d = parseDirectives(raw);
  const identity = sha256Hex(`${a.mission}|${a.structured ? a.assignment : raw}`);
  const scope = a.mission || raw.slice(0, 200);
  const rng = seededRandom(`worker|${identity}|${msgs.length}`);
  const pace = d.has('slow') ? 'slow-worker' : 'worker';

  if (d.has('workerfail')) return { error: SCRIPTED_ERRORS.serverError() };
  if (d.has('otpm') && body.max_tokens > d.int('otpm', 8000, 1, 10_000_000)) return { error: SCRIPTED_ERRORS.outputTokensPerMinute(d.int('otpm', 8000, 1, 10_000_000), body.model) };
  if (d.has('ratelimit')) {
    // [[ratelimit:K]] rejects the mission's first K worker requests; [[ratelimit:K:S]] asks for retry-after S seconds.
    const limit = d.int('ratelimit', 1, 0, 10000);
    const retryAfter = Math.min(60, Math.max(0, Number(d.arg('ratelimit').split(':')[1]) || 0));
    const seen = state.ratelimit.get(scope) || 0;
    if (seen < limit) {
      state.ratelimit.set(scope, seen + 1);
      return { error: SCRIPTED_ERRORS.rateLimited(retryAfter) };
    }
  }

  const tools = Array.isArray(body.tools) ? body.tools : [];
  const searchTool = tools.find((t) => t.name === 'web_search');
  const fetchTool = tools.find((t) => t.name === 'web_fetch');
  const { topic, angle } = topicOfTask(a.task || raw);
  const role = a.role || 'Field agent';
  const xss = d.has('xss');

  let cutAfter;
  if (d.has('dropworkers') && msgs.length === 1 && !state.dropped.has(identity)) {
    state.dropped.add(identity);
    cutAfter = 6; // message_start, ping, thinking start, a delta or two… then the socket dies
  }

  const think = thinkingBlock(body, `My assignment: ${truncate(stripDirectives(a.task || raw), 160)} I'll run targeted searches, read the most authoritative page, then write the report.`);
  const last = msgs[msgs.length - 1];

  if (last.role === 'assistant') {
    // pause_turn resume: answer the pending search, then finish the research.
    const pendingUse = last.content[last.content.length - 1];
    const hits = searchResults(String(pendingUse.input?.query || topic), rng, role);
    const blocks = [{ type: 'web_search_tool_result', tool_use_id: pendingUse.id, content: hits.map((h) => h.result) }];
    let fetched = null;
    if (fetchTool) {
      fetched = hits[0];
      const id = newServerToolUseId();
      blocks.push({ type: 'server_tool_use', id, name: 'web_fetch', input: { url: fetched.result.url } });
      blocks.push(fetchResultBlock(id, fetched, now));
    }
    blocks.push(...textBlocks(workerReportSegments({ topic, angle, role, hits, fetched, rng, xss, web: true })));
    return { plan: { blocks, stop_reason: 'end_turn', pace, cutAfter } };
  }

  if (d.has('workerrefuse')) {
    return { plan: { blocks: [think, text("I can't help with")], stop_reason: 'refusal', stop_details: { ...REFUSAL_DETAILS }, pace, cutAfter } };
  }

  const blocks = [think];
  if (!searchTool) {
    blocks.push(...textBlocks(workerReportSegments({ topic, angle, role, hits: [], fetched: null, rng, xss, web: false })));
    return { plan: { blocks, stop_reason: 'end_turn', pace, cutAfter } };
  }

  const maxSearches = Math.max(1, Math.min(2, searchTool.max_uses ?? 2));
  const queries = [`${topic} ${angle.split(/[,:]/)[0]}`.slice(0, 120), `${topic} 2026 ${role}`.slice(0, 120)].slice(0, rng.chance(0.5) ? maxSearches : 1);
  const firstId = newServerToolUseId();
  blocks.push({ type: 'server_tool_use', id: firstId, name: 'web_search', input: { query: queries[0] } });
  if (d.has('workerpause')) return { plan: { blocks, stop_reason: 'pause_turn', pace, cutAfter } };

  const hits = [];
  queries.forEach((q, i) => {
    const id = i === 0 ? firstId : newServerToolUseId();
    if (i > 0) blocks.push({ type: 'server_tool_use', id, name: 'web_search', input: { query: q } });
    const found = searchResults(q, rng, `${role}-${i}`);
    hits.push(...found);
    blocks.push({ type: 'web_search_tool_result', tool_use_id: id, content: found.map((h) => h.result) });
  });
  let fetched = null;
  if (fetchTool && (fetchTool.max_uses ?? 1) >= 1) {
    fetched = hits[0];
    const id = newServerToolUseId();
    blocks.push({ type: 'server_tool_use', id, name: 'web_fetch', input: { url: fetched.result.url } });
    blocks.push(fetchResultBlock(id, fetched, now));
  }
  blocks.push(...textBlocks(workerReportSegments({ topic, angle, role, hits, fetched, rng, xss, web: true })));
  return { plan: { blocks, stop_reason: 'end_turn', pace, cutAfter } };
}
