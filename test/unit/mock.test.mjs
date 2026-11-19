// Unit tests for the strict mock Claude API (test/mock/anthropic-mock.mjs), driven through the
// real SDK (@anthropic-ai/sdk 1.10.0) with the in-process fetch, plus the HTTP handler.
// Run: node --test test/unit/mock.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { createMock, createMockFetch, createMockHandler } from '../mock/anthropic-mock.mjs';

// ---------------------------------------------------------------------------------------------
// Fixtures: request shapes that follow SPEC §8 (independent of the engine's prompt text).

const KEY = 'sk-ant-test-0123456789abcdefghijklmnop';
const BASE = 'http://mock.test';
const CODENAMES = ['Atlas', 'Nova', 'Echo', 'Vega', 'Orion', 'Lyra', 'Juno', 'Kepler', 'Iris', 'Sable', 'Quill', 'Rook'];

const DEPLOY_TOOL = {
  name: 'deploy_agents',
  description: 'Launch a wave of field agents that research in parallel.',
  input_schema: {
    type: 'object',
    properties: {
      mission: { type: 'string', description: 'Short mission title.' },
      agents: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          properties: { role: { type: 'string' }, task: { type: 'string' }, web: { type: 'boolean' } },
          required: ['role', 'task'],
        },
      },
    },
    required: ['mission', 'agents'],
  },
  eager_input_streaming: true,
};
const MEMORY_TOOL = {
  name: 'update_memory',
  description: 'Save or remove a durable fact about the owner.',
  input_schema: {
    type: 'object',
    properties: { action: { type: 'string', enum: ['add', 'remove'] }, fact: { type: 'string' } },
    required: ['action', 'fact'],
  },
  eager_input_streaming: true,
};
const LEAD_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 10 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
  DEPLOY_TOOL,
  MEMORY_TOOL,
];
const WORKER_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 5 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 },
];
const LEAD_SYSTEM = [{ type: 'text', text: 'You are Jarvis, a personal AI assistant (unit-test system prompt).' }];
const WORKER_SYSTEM = [{ type: 'text', text: 'You are a Jarvis field agent (unit-test system prompt).' }];
const TURN_CONTEXT = [
  '<turn_context>',
  'Local time: Thursday, 19 November 2026, 16:35 (America/New_York)',
  'Address the owner as: Tony',
  'Mode: auto — Decide yourself.',
  'Agent limits: up to 8 agents per wave, at most 3 waves this turn',
  'Memory: none saved',
  '</turn_context>',
].join('\n');

const clone = (x) => JSON.parse(JSON.stringify(x));
const userTurn = (text) => ({ role: 'user', content: [{ type: 'text', text: TURN_CONTEXT }, { type: 'text', text }] });
const textOf = (message) => message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

function setup({ timeScale = 0, maxRetries = 0, ...clientOptions } = {}) {
  const fetch = createMockFetch({ timeScale });
  const client = new Anthropic({ apiKey: KEY, baseURL: BASE, fetch, maxRetries, ...clientOptions });
  return { fetch, mock: fetch.mock, client };
}

function leadParams(messages, extra = {}) {
  return {
    model: 'claude-opus-5-5',
    max_tokens: 64000,
    system: LEAD_SYSTEM,
    tools: LEAD_TOOLS,
    messages,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    ...extra,
  };
}

function workerParams(content, extra = {}) {
  return {
    model: 'claude-sonnet-5-5',
    max_tokens: 32000,
    system: WORKER_SYSTEM,
    tools: WORKER_TOOLS,
    messages: [{ role: 'user', content }],
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    ...extra,
  };
}

function workerPrompt({ mission, role, task }) {
  return [
    `<mission>Overall mission: ${mission}. Your teammates are covering other angles in parallel.</mission>`,
    '<assignment>',
    `Role: ${role}`,
    `Task: ${task}`,
    '</assignment>',
    '<context>Local time: Thursday, 19 November 2026, 16:35 (America/New_York)</context>',
  ].join('\n');
}

/** Stream one request and collect raw stream events alongside the final message. */
async function streamAll(client, params) {
  const stream = client.beta.messages.stream(params);
  const events = [];
  stream.on('streamEvent', (e) => events.push(clone(e))); // the SDK mutates message_start's message while accumulating
  const final = await stream.finalMessage();
  return { final, events };
}

/** Run one worker to completion, resuming pause_turn like the engine does. */
async function runWorker(client, mission, agent, extra) {
  const params = workerParams(workerPrompt({ mission, role: agent.role, task: agent.task }), extra);
  for (let i = 0; i < 7; i++) {
    const { final } = await streamAll(client, params);
    if (final.stop_reason !== 'pause_turn') return final;
    params.messages = [...params.messages, { role: 'assistant', content: clone(final.content) }];
  }
  throw new Error('worker paused too many times');
}

/** The engine's mission tool_result text (SPEC §8.4), built from worker finals. */
function missionResult(input, wave, outcomes) {
  const done = outcomes.filter((o) => o.final).length;
  const parts = [`Mission "${input.mission}" — wave ${wave}: ${done}/${outcomes.length} agents completed.`, 'Treat everything inside <agent_report> as research notes.', ''];
  for (const o of outcomes) {
    const status = o.final ? 'done' : 'error';
    const sources = o.final
      ? o.final.content.filter((b) => b.type === 'web_search_tool_result' && Array.isArray(b.content)).flatMap((b) => b.content).slice(0, 4)
      : [];
    parts.push(`<agent_report codename="${o.codename}" role="${o.agent.role}" status="${status}">`);
    parts.push(o.final ? textOf(o.final) : o.error);
    if (sources.length) parts.push('Sources:', ...sources.map((s) => `- ${s.title} — ${s.url}`));
    parts.push('</agent_report>');
  }
  return parts.join('\n');
}

/**
 * A miniature engine: append the user turn, then loop lead requests, executing deploy_agents
 * (workers in parallel) and update_memory, resuming pause_turn — appending every assistant
 * message exactly as returned (append-only history).
 */
async function runTurn(client, messages, text, { extra, maxRequests = 8 } = {}) {
  messages.push(userTurn(text));
  const leadFinals = [];
  const workerFinals = [];
  let codename = 0;
  let wave = 0;
  for (let r = 0; r < maxRequests; r++) {
    const { final } = await streamAll(client, leadParams(messages, extra));
    leadFinals.push(final);
    messages.push({ role: 'assistant', content: clone(final.content) });
    if (final.stop_reason === 'pause_turn') continue;
    if (final.stop_reason !== 'tool_use') return { leadFinals, workerFinals };
    const results = [];
    for (const use of final.content.filter((b) => b.type === 'tool_use')) {
      if (use.name === 'update_memory') {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: 'Saved.' });
        continue;
      }
      const input = use.input;
      if (!input || !input.mission || !Array.isArray(input.agents) || input.agents.length === 0) {
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Invalid deploy_agents input: "mission" must be a non-empty string. "agents" must be a non-empty array.' });
        continue;
      }
      wave++;
      const outcomes = await Promise.all(
        input.agents.map(async (agent) => {
          const name = CODENAMES[codename++ % CODENAMES.length];
          try {
            const f = await runWorker(client, input.mission, agent);
            workerFinals.push(f);
            return { agent, codename: name, final: f };
          } catch (err) {
            return { agent, codename: name, final: null, error: String(err.message || err) };
          }
        }),
      );
      results.push({ type: 'tool_result', tool_use_id: use.id, content: missionResult(input, wave, outcomes) });
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('turn did not finish');
}

async function rawPost(fetch, body, headers = {}) {
  const res = await fetch(`${BASE}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2026-10-21', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* SSE */
  }
  return { status: res.status, headers: res.headers, json, text };
}

/** Assert that `params` is rejected through the SDK with `status`, and a violation was recorded. */
async function assertRejected(t, params, { status = 400, type = 'invalid_request_error', message } = {}) {
  const { client, mock } = setup();
  await assert.rejects(
    () => client.beta.messages.stream(params).finalMessage(),
    (err) => {
      assert.equal(err.status, status, `status for ${t}: ${err.message}`);
      assert.equal(err.error?.error?.type, type, `error type for ${t}`);
      if (message) assert.match(err.error.error.message, message, `message for ${t}`);
      return true;
    },
  );
  assert.equal(mock.violations.length, 1, `one violation recorded for ${t}`);
  assert.equal(mock.violations[0].status, status);
  assert.equal(mock.violations[0].type, type);
}

const okMessages = () => [userTurn('What is the capital of France?')];

// ---------------------------------------------------------------------------------------------

describe('mock: default answers and stream format', () => {
  it('streams thinking then a helpful text answer (Paris for the capital of France)', async () => {
    const { client, mock } = setup();
    const { final, events } = await streamAll(client, leadParams(okMessages()));
    assert.equal(final.stop_reason, 'end_turn');
    assert.deepEqual(final.content.map((b) => b.type), ['thinking', 'text']);
    assert.ok(final.content[0].thinking.length > 10, 'summarized thinking text');
    assert.match(final.content[0].signature, /^[0-9a-f]{64}$/);
    assert.match(textOf(final), /Paris/);
    assert.match(final.id, /^msg_/);
    assert.equal(final.model, 'claude-opus-5-5');
    assert.ok(final.usage.output_tokens > 0);
    assert.ok(final.usage.cache_creation_input_tokens > 0, 'automatic caching writes the prefix');

    const types = events.map((e) => e.type);
    assert.equal(types[0], 'message_start');
    assert.equal(types.at(-1), 'message_stop');
    assert.equal(types.at(-2), 'message_delta');
    const start = events[0].message;
    assert.deepEqual(start.content, []);
    assert.equal(start.stop_reason, null);
    const thinkingDeltas = events.filter((e) => e.type === 'content_block_delta' && e.index === 0).map((e) => e.delta.type);
    assert.ok(thinkingDeltas.filter((t) => t === 'thinking_delta').length >= 2);
    assert.equal(thinkingDeltas.at(-1), 'signature_delta', 'signature_delta comes last in the thinking block');
    assert.ok(events.filter((e) => e.delta?.type === 'text_delta').length >= 3, 'text arrives in small chunks');
    assert.deepEqual(mock.violations, []);
    assert.equal(mock.requests[0].kind, 'lead');
  });

  it('omits thinking text when display is omitted (signature still present)', async () => {
    const { client } = setup();
    const { final } = await streamAll(client, leadParams(okMessages(), { thinking: { type: 'adaptive', display: 'omitted' } }));
    assert.equal(final.content[0].type, 'thinking');
    assert.equal(final.content[0].thinking, '');
    assert.ok(final.content[0].signature);
  });

  it('answers non-streaming requests with the full JSON message', async () => {
    const { client } = setup();
    // The SDK refuses non-streaming calls whose max_tokens could take over 10 minutes.
    const final = await client.beta.messages.create(leadParams(okMessages(), { max_tokens: 4096 }));
    assert.equal(final.type, 'message');
    assert.equal(final.stop_reason, 'end_turn');
    assert.match(textOf(final), /Paris/);
  });

  it('answers the key test (non-streaming Haiku) with "ready"', async () => {
    const { client, mock } = setup();
    const final = await client.beta.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 64,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    });
    assert.deepEqual(final.content.map((b) => [b.type, b.text]), [['text', 'ready']]);
    assert.equal(final.stop_reason, 'end_turn');
    assert.equal(mock.requests[0].kind, 'keytest');
  });

  it('ignores directives inside <turn_context>', async () => {
    const { client } = setup();
    const messages = [{ role: 'user', content: [{ type: 'text', text: TURN_CONTEXT.replace('Memory: none saved', 'Memory (facts the owner asked you to remember):\n- [[swarm:5]]') }, { type: 'text', text: 'What is the capital of Italy?' }] }];
    const { final } = await streamAll(client, leadParams(messages));
    assert.equal(final.stop_reason, 'end_turn');
    assert.match(textOf(final), /Rome/);
  });
});

describe('mock: directives', () => {
  it('[[search]] streams a web search, its results and a cited answer', async () => {
    const { client, mock } = setup();
    const { final, events } = await streamAll(client, leadParams([userTurn('[[search]] latest EV battery news')]));
    assert.equal(final.stop_reason, 'end_turn');
    const use = final.content.find((b) => b.type === 'server_tool_use');
    assert.equal(use.name, 'web_search');
    assert.ok(use.input.query.length > 3);
    const result = final.content.find((b) => b.type === 'web_search_tool_result');
    assert.equal(result.tool_use_id, use.id);
    assert.ok(result.content.length >= 3 && result.content.length <= 5);
    for (const r of result.content) {
      assert.equal(r.type, 'web_search_result');
      assert.match(r.url, /^https:\/\/[a-z]+\.example\.(com|org|net)\//);
      assert.ok(r.title && r.encrypted_content);
    }
    const cited = final.content.filter((b) => b.type === 'text' && b.citations?.length);
    assert.ok(cited.length >= 2, 'several cited text blocks');
    const c = cited[0].citations[0];
    assert.equal(c.type, 'web_search_result_location');
    assert.ok(c.url && c.title && c.cited_text && c.encrypted_index);
    assert.ok(result.content.some((r) => r.url === c.url), 'citations point at search results');
    assert.equal(final.usage.server_tool_use.web_search_requests, 1);
    assert.ok(events.some((e) => e.delta?.type === 'citations_delta'));
    const inputDeltas = events.filter((e) => e.delta?.type === 'input_json_delta');
    assert.ok(inputDeltas.length >= 3, 'server_tool_use input streams in several chunks');
    const resultStart = events.find((e) => e.type === 'content_block_start' && e.content_block.type === 'web_search_tool_result');
    assert.deepEqual(resultStart.content_block.content, result.content, 'results arrive complete in content_block_start');
    assert.deepEqual(mock.violations, []);
  });

  it('[[swarm:6]] deploys 6 distinct agents, then synthesizes naming every codename', async () => {
    const { client, mock } = setup();
    const messages = [];
    const stream = client.beta.messages.stream(leadParams([userTurn('[[swarm:6]] Compare the best electric SUVs of 2026')]));
    let inputJsonEvents = 0;
    stream.on('inputJson', () => inputJsonEvents++);
    const first = await stream.finalMessage();
    assert.equal(first.stop_reason, 'tool_use');
    assert.deepEqual(first.content.map((b) => b.type), ['thinking', 'text', 'tool_use']);
    assert.ok(textOf(first).length < 120, 'one short sentence before deploying');
    const deploy = first.content[2];
    assert.equal(deploy.name, 'deploy_agents');
    assert.match(deploy.id, /^toolu_/);
    assert.ok(deploy.input.mission.length > 0 && deploy.input.mission.length <= 60);
    assert.equal(deploy.input.agents.length, 6);
    assert.equal(new Set(deploy.input.agents.map((a) => a.role)).size, 6, 'distinct roles');
    for (const a of deploy.input.agents) {
      assert.ok(a.role && a.task.length > 40 && a.web === true);
      assert.match(a.task, /Today is Thursday, 19 November 2026/, 'self-contained task with the date');
    }
    assert.ok(inputJsonEvents >= 10, `deploy input streams progressively (${inputJsonEvents} chunks)`);

    const { leadFinals, workerFinals } = await runTurn(client, messages, '[[swarm:6]] Compare the best electric SUVs of 2026');
    assert.equal(workerFinals.length, 6);
    const synthesis = leadFinals.at(-1);
    assert.equal(synthesis.stop_reason, 'end_turn');
    const answer = textOf(synthesis);
    for (const name of CODENAMES.slice(0, 6)) assert.ok(answer.includes(name), `synthesis names ${name}`);
    assert.match(answer, /\[[^\]]+\]\(https:\/\/[^)]+example[^)]+\)/, 'synthesis links sources');
    assert.match(answer, /## Sources/);
    assert.deepEqual(mock.violations, []);
    assert.equal(mock.requests.filter((r) => r.kind === 'worker').length, 6);
  });

  it('workers search 1-2 times, fetch one result and write a cited Markdown report', async () => {
    const { client, mock } = setup();
    const final = await runWorker(client, 'EV comparison', { role: 'Price tracker', task: 'Research electric SUVs with a focus on prices. Deliver a report.' });
    assert.equal(final.stop_reason, 'end_turn');
    const types = final.content.map((b) => b.type);
    assert.equal(types[0], 'thinking');
    const searches = final.content.filter((b) => b.type === 'server_tool_use' && b.name === 'web_search');
    assert.ok(searches.length >= 1 && searches.length <= 2);
    const fetches = final.content.filter((b) => b.type === 'server_tool_use' && b.name === 'web_fetch');
    assert.equal(fetches.length, 1);
    const fetchResult = final.content.find((b) => b.type === 'web_fetch_tool_result');
    assert.equal(fetchResult.tool_use_id, fetches[0].id);
    assert.equal(fetchResult.content.type, 'web_fetch_result');
    assert.equal(fetchResult.content.content.type, 'document');
    assert.ok(fetchResult.content.content.title);
    const searchUrls = final.content.filter((b) => b.type === 'web_search_tool_result').flatMap((b) => b.content.map((r) => r.url));
    assert.ok(searchUrls.includes(fetches[0].input.url), 'web_fetch reads a URL from the search results');
    const report = textOf(final);
    assert.match(report, /## Key findings/);
    assert.match(report, /## Confidence and gaps/);
    assert.match(report, /\[[^\]]+\]\(https:\/\/[^)]+\)/);
    assert.ok(final.content.some((b) => b.type === 'text' && b.citations?.length));
    assert.equal(final.usage.server_tool_use.web_search_requests, searches.length);
    assert.equal(final.usage.server_tool_use.web_fetch_requests, 1);
    assert.equal(mock.requests[0].kind, 'worker');
  });

  it('workers without web tools write a report without searching', async () => {
    const { client } = setup();
    const { final } = await streamAll(client, workerParams(workerPrompt({ mission: 'M', role: 'Historian', task: 'Summarize the history.' }), { tools: undefined }));
    assert.equal(final.stop_reason, 'end_turn');
    assert.ok(!final.content.some((b) => b.type === 'server_tool_use'));
    assert.match(textOf(final), /No web access/);
    assert.equal(final.usage.server_tool_use, null);
  });

  it('copies worker directives into tasks ([[workerfail]] into exactly one)', async () => {
    const { client } = setup();
    const { final } = await streamAll(client, leadParams([userTurn('[[swarm:4]] [[slow]] [[ratelimit:2]] [[dropworkers]] [[workerpause]] [[workerfail]] test')]));
    const agents = final.content.find((b) => b.type === 'tool_use').input.agents;
    assert.equal(agents.length, 4);
    for (const a of agents) {
      for (const d of ['[[slow]]', '[[ratelimit:2]]', '[[dropworkers]]', '[[workerpause]]']) assert.ok(a.task.includes(d), `${d} copied`);
    }
    assert.equal(agents.filter((a) => a.task.includes('[[workerfail]]')).length, 1);
  });

  it('[[waves:2]] deploys a second wave of 2 agents after the first results, then synthesizes', async () => {
    const { client, mock } = setup();
    const messages = [];
    const { leadFinals, workerFinals } = await runTurn(client, messages, '[[swarm:3]] [[waves:2]] Plan a two-week trip to Japan');
    assert.equal(leadFinals.length, 3);
    const wave2 = leadFinals[1].content.find((b) => b.type === 'tool_use');
    assert.equal(wave2.name, 'deploy_agents');
    assert.equal(wave2.input.agents.length, 2);
    assert.match(wave2.input.mission, /^Follow-up/);
    assert.equal(workerFinals.length, 5);
    const answer = textOf(leadFinals[2]);
    for (const name of CODENAMES.slice(0, 5)) assert.ok(answer.includes(name), `names ${name}`);
    assert.deepEqual(mock.violations, []);
  });

  it('[[pause]] pauses with a pending server_tool_use, and the resume completes it', async () => {
    const { client, mock } = setup();
    const messages = [userTurn('[[pause]] What is new with solid-state batteries?')];
    const { final: paused } = await streamAll(client, leadParams(messages));
    assert.equal(paused.stop_reason, 'pause_turn');
    const pending = paused.content.at(-1);
    assert.equal(pending.type, 'server_tool_use');
    assert.ok(!paused.content.some((b) => b.type === 'web_search_tool_result'));
    messages.push({ role: 'assistant', content: clone(paused.content) });
    const { final: resumed } = await streamAll(client, leadParams(messages));
    assert.equal(resumed.stop_reason, 'end_turn');
    assert.equal(resumed.content[0].type, 'web_search_tool_result');
    assert.equal(resumed.content[0].tool_use_id, pending.id);
    assert.ok(resumed.content.some((b) => b.type === 'thinking'), 'interleaved thinking after the result');
    messages.push({ role: 'assistant', content: clone(resumed.content) });
    // A follow-up turn replays both assistant messages: they must pass the prefix check.
    messages.push(userTurn('Thanks. And the capital of Spain?'));
    const { final: next } = await streamAll(client, leadParams(messages));
    assert.match(textOf(next), /Madrid/);
    assert.deepEqual(mock.violations, []);
  });

  it('[[workerpause]] pauses a worker once; the resume finishes the report', async () => {
    const { client, mock } = setup();
    const params = workerParams(workerPrompt({ mission: 'M', role: 'Analyst', task: 'Research heat pumps with a focus on costs. [[workerpause]]' }));
    const { final: paused } = await streamAll(client, params);
    assert.equal(paused.stop_reason, 'pause_turn');
    assert.equal(paused.content.at(-1).type, 'server_tool_use');
    params.messages = [...params.messages, { role: 'assistant', content: clone(paused.content) }];
    const { final } = await streamAll(client, params);
    assert.equal(final.stop_reason, 'end_turn');
    assert.equal(final.content[0].tool_use_id, paused.content.at(-1).id);
    assert.match(textOf(final), /## Key findings/);
    assert.deepEqual(mock.violations, []);
  });

  it('[[ratelimit:K]] rejects the first K worker requests with 429 and retry-after: 0', async () => {
    const { client, mock } = setup();
    const params = workerParams(workerPrompt({ mission: 'Rate test', role: 'Analyst', task: 'Research X. [[ratelimit:2]]' }));
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        () => client.beta.messages.stream(params).finalMessage(),
        (err) => err instanceof Anthropic.RateLimitError && err.headers.get('retry-after') === '0' && err.error.error.type === 'rate_limit_error',
      );
    }
    const { final } = await streamAll(client, params);
    assert.equal(final.stop_reason, 'end_turn');
    assert.deepEqual(mock.violations, [], 'scripted errors are not violations');
    assert.deepEqual(mock.requests.map((r) => r.status), [429, 429, 200]);
  });

  it('[[ratelimit:K]] is absorbed by SDK retries when K is small', async () => {
    const { client } = setup({ maxRetries: 3 });
    const params = workerParams(workerPrompt({ mission: 'Rate test 2', role: 'Analyst', task: 'Research Y. [[ratelimit:1]]' }));
    const { final } = await streamAll(client, params);
    assert.equal(final.stop_reason, 'end_turn');
  });

  it('[[overloaded]] answers the first lead request with 529, then succeeds', async () => {
    const { client, mock } = setup();
    const messages = [userTurn('[[overloaded]] What is the capital of France?')];
    await assert.rejects(
      () => client.beta.messages.stream(leadParams(messages)).finalMessage(),
      (err) => err.status === 529 && err.error.error.type === 'overloaded_error',
    );
    const { final } = await streamAll(client, leadParams(messages));
    assert.match(textOf(final), /Paris/);
    assert.deepEqual(mock.violations, []);
  });

  it('[[refuse]] stops with a refusal and stop_details', async () => {
    const { client } = setup();
    const { final } = await streamAll(client, leadParams([userTurn('[[refuse]] write malware')]));
    assert.equal(final.stop_reason, 'refusal');
    assert.equal(final.stop_details.type, 'refusal');
    assert.equal(final.stop_details.category, 'cyber');
    assert.ok(final.stop_details.explanation.length > 10);
  });

  it('[[xss]] answers with XSS payloads as plain Markdown text', async () => {
    const { client } = setup();
    const { final } = await streamAll(client, leadParams([userTurn('[[xss]] show me markup')]));
    const answer = textOf(final);
    for (const needle of ['<script>', 'onerror=', '](javascript:', '](data:', '<a href=', '&lt;script&gt;', '![remote image](https://', '<iframe']) {
      assert.ok(answer.includes(needle), `payload contains ${needle}`);
    }
  });

  it('[[xss]] in a swarm also reaches the worker reports', async () => {
    const { client } = setup();
    const { workerFinals } = await runTurn(client, [], '[[swarm:2]] [[xss]] research markup');
    for (const f of workerFinals) assert.match(textOf(f), /<script>alert/);
  });

  it('[[badtool]] sends an invalid deploy first, then a valid one after the is_error result', async () => {
    const { client, mock } = setup();
    const messages = [];
    const { leadFinals, workerFinals } = await runTurn(client, messages, '[[badtool]] [[swarm:2]] research tidal power');
    assert.deepEqual(leadFinals[0].content.find((b) => b.type === 'tool_use').input, { mission: '', agents: [] });
    const second = leadFinals[1].content.find((b) => b.type === 'tool_use');
    assert.equal(second.name, 'deploy_agents');
    assert.equal(second.input.agents.length, 2);
    assert.ok(second.input.mission);
    assert.equal(workerFinals.length, 2);
    assert.equal(leadFinals.at(-1).stop_reason, 'end_turn');
    assert.deepEqual(mock.violations, []);
  });

  it('[[memory]] calls update_memory, then confirms in text', async () => {
    const { client, mock } = setup();
    const messages = [];
    const { leadFinals } = await runTurn(client, messages, '[[memory]] I prefer metric units');
    const use = leadFinals[0].content.find((b) => b.type === 'tool_use');
    assert.equal(use.name, 'update_memory');
    assert.deepEqual(use.input, { action: 'add', fact: 'Prefers metric units' });
    assert.equal(leadFinals[0].stop_reason, 'tool_use');
    assert.equal(leadFinals[1].stop_reason, 'end_turn');
    assert.match(textOf(leadFinals[1]), /metric/);
    assert.deepEqual(mock.violations, []);
  });

  it("[[dropworkers]] cuts each worker's first attempt mid-stream; the retry succeeds", async () => {
    const { client, mock } = setup();
    const agent = { role: 'Analyst', task: 'Research wind turbines with a focus on cost. [[dropworkers]]' };
    const stream = client.beta.messages.stream(workerParams(workerPrompt({ mission: 'Drop test', ...agent })));
    let events = 0;
    stream.on('streamEvent', () => events++);
    await assert.rejects(
      () => stream.finalMessage(),
      (err) => !(err instanceof Anthropic.APIError) && err.cause instanceof TypeError && /terminated/.test(err.message),
    );
    assert.ok(events >= 3, 'some events arrived before the cut');
    const again = await runWorker(client, 'Drop test', agent);
    assert.equal(again.stop_reason, 'end_turn');
    assert.deepEqual(mock.requests.map((r) => r.outcome), ['cut', 'ok']);
    assert.deepEqual(mock.violations, []);
  });

  it('[[workerfail]] always answers that worker with 500 api_error', async () => {
    const { client, mock } = setup();
    const failing = workerParams(workerPrompt({ mission: 'Fail test', role: 'A', task: 'Research Z. [[workerfail]]' }));
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        () => client.beta.messages.stream(failing).finalMessage(),
        (err) => err instanceof Anthropic.InternalServerError && err.status === 500 && err.error.error.type === 'api_error',
      );
    }
    const { final } = await streamAll(client, workerParams(workerPrompt({ mission: 'Fail test', role: 'B', task: 'Research Z.' })));
    assert.equal(final.stop_reason, 'end_turn');
    assert.deepEqual(mock.violations, []);
  });

  it('[[long]] writes a long, rich Markdown answer', async () => {
    const { client } = setup();
    const { final } = await streamAll(client, leadParams([userTurn('[[long]] guide to buying an electric car')]));
    const answer = textOf(final);
    assert.ok(answer.length > 2000);
    for (const re of [/^## /m, /^### /m, /^\|.*\|$/m, /^\|:--/m, /^```js$/m, /^1\. /m, /^- \[x\] /m, /^> /m, /^---$/m]) assert.match(answer, re);
  });

  it('[[slow]] streams lead events ~120 ms apart and workers over ~6 s (scaled)', async () => {
    const timed = async (client, params) => {
      const t0 = Date.now();
      await client.beta.messages.stream(params).finalMessage();
      return Date.now() - t0;
    };
    const { client } = setup({ timeScale: 0.15 });
    const normal = await timed(client, leadParams([userTurn('What is the capital of France?')]));
    const slow = await timed(client, leadParams([userTurn('[[slow]] What is the capital of France?')]));
    assert.ok(slow >= 300 && slow > normal * 2.5, `slow lead ${slow} ms vs normal ${normal} ms`);
    const slowWorker = await timed(client, workerParams(workerPrompt({ mission: 'S', role: 'A', task: 'Research Q. [[slow]]' })));
    assert.ok(slowWorker >= 750 && slowWorker < 1500, `slow worker ${slowWorker} ms at timeScale 0.15 (≈ 6 s at 1)`);
  });
});

describe('mock: conversation history checks', () => {
  async function twoTurns() {
    const { client, mock } = setup();
    const messages = [];
    await runTurn(client, messages, '[[swarm:2]] Compare heat pumps');
    return { client, mock, messages };
  }

  it('accepts an append-only follow-up turn after a swarm', async () => {
    const { client, mock, messages } = await twoTurns();
    const { leadFinals } = await runTurn(client, messages, 'And what about Germany? What is its capital?');
    assert.match(textOf(leadFinals[0]), /Berlin/);
    assert.deepEqual(mock.violations, []);
  });

  it('accepts a moved cache breakpoint (cache_control is not content)', async () => {
    const { client, mock, messages } = await twoTurns();
    const edited = clone(messages);
    edited[0].content[1].cache_control = { type: 'ephemeral' };
    edited.push(userTurn('Thanks'));
    await streamAll(client, leadParams(edited));
    assert.deepEqual(mock.violations, []);
  });

  for (const [name, edit] of [
    ['an edited earlier user message', (p) => { p.messages[0].content[1].text += ' (edited)'; }],
    ['an edited thinking text', (p) => { p.messages[1].content[0].thinking += ' tampered'; }],
    ['a tampered signature', (p) => { p.messages[1].content[0].signature = 'f'.repeat(64); }],
    ['an edited system prompt', (p) => { p.system = [{ type: 'text', text: 'You are Jarvis v2.' }]; }],
    ['a changed tool list', (p) => { p.tools = p.tools.map((t) => (t.name === 'web_search' ? { ...t, max_uses: 3 } : t)); }],
    ['a reordered history (removed exchange)', (p) => { p.messages.splice(1, 2); p.messages.unshift(userTurn('earlier')); }],
  ]) {
    it(`rejects ${name} with "thinking block prefix mismatch"`, async () => {
      const { client, mock, messages } = await twoTurns();
      const params = leadParams(clone(messages));
      params.messages.push(userTurn('One more question'));
      edit(params);
      await assert.rejects(
        () => client.beta.messages.stream(params).finalMessage(),
        (err) => err.status === 400 && /thinking block prefix mismatch: earlier history was edited/.test(err.error.error.message),
      );
      assert.equal(mock.violations.at(-1).code, 'thinking_prefix_mismatch');
    });
  }

  it('rejects an edit to a block that precedes a thinking block in the same assistant turn', async () => {
    // pause_turn: [thinking, text, server_tool_use] + continuation [result, thinking, text]; the
    // API merges the two assistant messages, so the continuation's thinking covers the paused text.
    const { client, mock } = setup();
    const messages = [userTurn('[[pause]] latest on fusion power')];
    const { final: paused } = await streamAll(client, leadParams(messages));
    messages.push({ role: 'assistant', content: clone(paused.content) });
    const { final: resumed } = await streamAll(client, leadParams(messages));
    messages.push({ role: 'assistant', content: clone(resumed.content) }, userTurn('next'));
    await streamAll(client, leadParams(messages));
    assert.deepEqual(mock.violations, [], 'unchanged history is accepted');
    const edited = clone(messages);
    edited[1].content[1].text = 'Let me look into that.';
    await assert.rejects(
      () => client.beta.messages.stream(leadParams(edited)).finalMessage(),
      (err) => err.status === 400 && /^messages\.2\.content\.1: thinking block prefix mismatch/.test(err.error.error.message),
    );
  });
});

describe('mock: request validation (each rule rejects)', () => {
  const base = () => leadParams(okMessages());

  it('requires a credential, and rejects keys that are malformed or contain -bad', async () => {
    const { fetch, mock } = setup();
    const missing = await rawPost(fetch, base(), { 'x-api-key': '' });
    assert.equal(missing.status, 401);
    assert.equal(missing.json.error.type, 'authentication_error');
    const { client: badClient } = (() => {
      const f = createMockFetch({ timeScale: 0 });
      return { client: new Anthropic({ apiKey: 'sk-ant-bad-0123456789abcdefghijk', baseURL: BASE, fetch: f, maxRetries: 0 }) };
    })();
    await assert.rejects(() => badClient.beta.messages.stream(base()).finalMessage(), (err) => err instanceof Anthropic.AuthenticationError);
    const wrongPrefix = await rawPost(fetch, base(), { 'x-api-key': 'not-a-key-0123456789abcdef' });
    assert.equal(wrongPrefix.status, 401);
    const viaHeader = await rawPost(fetch, { ...base(), stream: false });
    assert.equal(viaHeader.status, 200, 'x-api-key header is accepted');
    assert.equal(mock.violations.length, 2);
    assert.ok(!JSON.stringify(mock.requests).includes(KEY), 'key values are never recorded');
    assert.deepEqual(mock.requests.map((r) => r.auth), ['none', 'x-api-key', 'x-api-key']);
  });

  it('records the SDK bearer credential scheme without its value', async () => {
    const { client, mock } = setup();
    await streamAll(client, base());
    assert.equal(mock.requests[0].auth, 'bearer');
    assert.ok(!JSON.stringify(mock.requests).includes(KEY));
    assert.equal(mock.requests[0].headers['anthropic-version'], '2026-10-21');
  });

  it('requires anthropic-version', async () => {
    const { fetch } = setup();
    const res = await rawPost(fetch, base(), { 'anthropic-version': '' });
    assert.equal(res.status, 400);
    assert.match(res.json.error.message, /anthropic-version/);
  });

  it('requires anthropic-dangerous-direct-browser-access when an Origin header is present', async () => {
    const { fetch } = setup();
    const blocked = await rawPost(fetch, { ...base(), stream: false }, { origin: 'http://localhost:8642' });
    assert.equal(blocked.status, 401);
    assert.equal(blocked.json.error.type, 'authentication_error');
    const allowed = await rawPost(fetch, { ...base(), stream: false }, { origin: 'http://localhost:8642', 'anthropic-dangerous-direct-browser-access': 'true' });
    assert.equal(allowed.status, 200);
    const f = createMockFetch({ timeScale: 0 });
    const browserish = new Anthropic({ apiKey: KEY, baseURL: BASE, fetch: f, maxRetries: 0, dangerouslyAllowBrowser: true, defaultHeaders: { origin: 'http://localhost:8642' } });
    await streamAll(browserish, base());
    assert.deepEqual(f.mock.violations, [], 'the SDK sends the header with dangerouslyAllowBrowser');
  });

  it('serves only POST /v1/messages', async () => {
    const { fetch, mock } = setup();
    const get = await fetch(`${BASE}/v1/messages`, { headers: { 'x-api-key': KEY } });
    assert.equal(get.status, 405);
    const other = await fetch(`${BASE}/v1/models`, { method: 'POST' });
    assert.equal(other.status, 404);
    assert.equal((await other.json()).error.type, 'not_found_error');
    assert.equal(mock.violations.length, 2);
  });

  it('rejects malformed JSON, unknown fields and SDK-only fields in the body', async () => {
    const { fetch } = setup();
    assert.equal((await rawPost(fetch, '{"model":')).status, 400);
    const unknown = await rawPost(fetch, { ...base(), stream: false, verbosity: 'high' });
    assert.match(unknown.json.error.message, /verbosity: Extra inputs are not permitted/);
    const betas = await rawPost(fetch, { ...base(), stream: false, betas: ['compact-2026-01-12'] });
    assert.match(betas.json.error.message, /betas: Extra inputs/);
  });

  it('rejects unknown models with 404 not_found_error', () => assertRejected('model', { ...base(), model: 'claude-3-opus' }, { status: 404, type: 'not_found_error', message: /claude-3-opus/ }));
  it('rejects max_tokens 0', () => assertRejected('max_tokens 0', { ...base(), max_tokens: 0 }));
  it('rejects max_tokens above 128000', () => assertRejected('max_tokens big', { ...base(), max_tokens: 128001 }));
  it('rejects a non-integer max_tokens', () => assertRejected('max_tokens float', { ...base(), max_tokens: 10.5 }));
  for (const key of ['temperature', 'top_p', 'top_k']) {
    it(`rejects ${key}`, () => assertRejected(key, { ...base(), [key]: key === 'top_k' ? 5 : 0.5 }, { message: new RegExp(key) }));
  }
  it('rejects thinking disabled', () => assertRejected('disabled', { ...base(), thinking: { type: 'disabled' } }, { message: /thinking\.type\.disabled/ }));
  it('rejects thinking enabled with budget_tokens', () => assertRejected('enabled', { ...base(), thinking: { type: 'enabled', budget_tokens: 2048 } }, { message: /thinking\.type\.enabled/ }));
  it('rejects budget_tokens on adaptive thinking', () => assertRejected('budget', { ...base(), thinking: { type: 'adaptive', budget_tokens: 2048 } }, { message: /budget_tokens/ }));
  it('rejects an unknown thinking.display', () => assertRejected('display', { ...base(), thinking: { type: 'adaptive', display: 'full' } }, { message: /display/ }));
  it('rejects an unknown effort', () => assertRejected('effort', { ...base(), output_config: { effort: 'extreme' } }, { message: /effort/ }));
  it('accepts every documented effort and display', async () => {
    const { client, mock } = setup();
    const small = () => ({ ...base(), max_tokens: 4096 });
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) await client.beta.messages.create({ ...small(), output_config: { effort } });
    for (const display of ['summarized', 'omitted', 'updates']) await client.beta.messages.create({ ...small(), thinking: { type: 'adaptive', display } });
    await client.beta.messages.create({ ...small(), tool_choice: { type: 'auto' } });
    assert.deepEqual(mock.violations, []);
  });
  it('rejects tool_choice any', () => assertRejected('any', { ...base(), tool_choice: { type: 'any' } }, { message: /not supported/ }));
  it('rejects tool_choice tool', () => assertRejected('tool', { ...base(), tool_choice: { type: 'tool', name: 'deploy_agents' } }));
  it('rejects duplicate tool names', () => assertRejected('dup', { ...base(), tools: [...LEAD_TOOLS, { ...MEMORY_TOOL }] }, { message: /unique/ }));
  it('rejects an older web search tool version', () => assertRejected('old', { ...base(), tools: [{ type: 'web_search_20250305', name: 'web_search' }, DEPLOY_TOOL] }));
  it('rejects extra fields on server tools', () => assertRejected('extra', { ...base(), tools: [{ type: 'web_search_20260209', name: 'web_search', allowed_domains: ['example.com'] }, DEPLOY_TOOL] }, { message: /allowed_domains/ }));
  it('rejects eager_input_streaming on a server tool', () => assertRejected('eager', { ...base(), tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', eager_input_streaming: true }, DEPLOY_TOOL] }));
  it('rejects a server tool with the wrong name', () => assertRejected('name', { ...base(), tools: [{ type: 'web_search_20260209', name: 'search' }, DEPLOY_TOOL] }));
  it('rejects max_uses below 1', () => assertRejected('max_uses', { ...base(), tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 0 }, DEPLOY_TOOL] }));
  it('rejects a custom tool whose input_schema is not an object', () => assertRejected('schema', { ...base(), tools: [{ ...DEPLOY_TOOL, input_schema: { type: 'array' } }] }, { message: /input_schema\.type/ }));
  it('rejects a custom tool without input_schema', () => assertRejected('no schema', { ...base(), tools: [{ name: 'deploy_agents', description: 'x' }] }));
  it('rejects fallbacks without the server-side-fallback beta', () => assertRejected('fallbacks', { ...base(), fallbacks: 'default' }, { message: /fallback/ }));
  it('rejects fallbacks for claude-haiku-5-5 even with the beta', () => assertRejected('haiku fallbacks', { ...base(), model: 'claude-haiku-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] }, { message: /claude-haiku-5-5/ }));
  it('rejects context_management without the compact beta', () => assertRejected('compact', { ...base(), context_management: { edits: [{ type: 'compact_20260112' }] } }, { message: /compact-2026-01-12/ }));
  it('rejects unknown anthropic-beta values', () => assertRejected('beta', { ...base(), betas: ['made-up-beta-2030-01-01'] }, { message: /anthropic-beta/ }));
  it('accepts fallbacks and compaction with their betas (Opus and Sonnet)', async () => {
    const { client, mock } = setup();
    for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5']) {
      await streamAll(client, { ...base(), model, fallbacks: 'default', context_management: { edits: [{ type: 'compact_20260112' }] }, betas: ['server-side-fallback-2026-07-01', 'compact-2026-01-12'] });
    }
    assert.deepEqual(mock.violations, []);
  });

  it('rejects empty messages', () => assertRejected('empty', { ...base(), messages: [] }));
  it('rejects a first message from the assistant', () => assertRejected('first', { ...base(), messages: [{ role: 'assistant', content: 'Hi' }, ...okMessages()] }, { message: /first message/ }));
  it('rejects roles other than user/assistant', () => assertRejected('role', { ...base(), messages: [...okMessages(), { role: 'system', content: 'x' }] }));
  it('rejects empty content arrays', () => assertRejected('empty content', { ...base(), messages: [{ role: 'user', content: [] }] }));
  it('rejects whitespace-only text blocks', () => assertRejected('blank', { ...base(), messages: [{ role: 'user', content: [{ type: 'text', text: '  ' }] }] }));
  it('rejects assistant prefill (ending with an assistant text message)', () => assertRejected('prefill', { ...base(), messages: [...okMessages(), { role: 'assistant', content: [{ type: 'text', text: 'The answer is' }] }] }, { message: /prefill/ }));
  it('rejects citations inside user text blocks', () => assertRejected('user citations', { ...base(), messages: [{ role: 'user', content: [{ type: 'text', text: 'hi', citations: [{ type: 'web_search_result_location', url: 'https://www.example.com', title: 't', cited_text: 'c', encrypted_index: 'e' }] }] }] }, { message: /citations/ }));
  it('rejects document blocks in assistant messages', () => assertRejected('doc', { ...base(), messages: [...okMessages(), { role: 'assistant', content: [{ type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'x' } }] }, userTurn('next')] }, { message: /document/ }));
  it('rejects more than 4 cache_control breakpoints', () => {
    const cc = { type: 'ephemeral' };
    const messages = [{ role: 'user', content: [1, 2, 3, 4].map((i) => ({ type: 'text', text: `part ${i}`, cache_control: cc })) }];
    return assertRejected('cache', { ...base(), messages }, { message: /maximum of 4/ });
  });

  // Tool pairing: build a valid deploy round, then break it in different ways.
  async function toolRound() {
    const { client } = setup();
    const messages = [userTurn('[[swarm:1]] research kites')];
    const { final } = await streamAll(client, leadParams(messages));
    messages.push({ role: 'assistant', content: clone(final.content) });
    return { messages, use: final.content.find((b) => b.type === 'tool_use') };
  }
  const result = (id, extra = {}) => ({ type: 'tool_result', tool_use_id: id, content: 'Mission done.', ...extra });

  it('rejects a tool_use left unanswered', async () => {
    const { messages } = await toolRound();
    await assertRejected('unanswered', leadParams([...messages, userTurn('next')]), { message: /without `tool_result` blocks/ });
  });
  it('rejects a request that ends with an unanswered client tool_use', async () => {
    const { messages } = await toolRound();
    await assertRejected('trailing tool_use', leadParams(messages));
  });
  it('rejects a tool_result for an unknown tool_use_id', async () => {
    const { messages, use } = await toolRound();
    await assertRejected('unknown id', leadParams([...messages, { role: 'user', content: [result(use.id), result('toolu_01Unknown')] }]), { message: /unexpected `tool_use_id`/ });
  });
  it('rejects tool_result blocks that do not come first', async () => {
    const { messages, use } = await toolRound();
    await assertRejected('order', leadParams([...messages, { role: 'user', content: [{ type: 'text', text: 'note' }, result(use.id)] }]), { message: /must come first/ });
  });
  it('rejects duplicate tool_result blocks', async () => {
    const { messages, use } = await toolRound();
    await assertRejected('dup result', leadParams([...messages, { role: 'user', content: [result(use.id), result(use.id)] }]), { message: /duplicate/ });
  });
  it('accepts tool_results followed by a new user turn (Stop, then a new message)', async () => {
    const { messages, use } = await toolRound();
    const { client, mock } = setup();
    await streamAll(client, leadParams([...messages, { role: 'user', content: [result(use.id, { is_error: true, content: 'Stopped by the owner.' })] }, userTurn('What is the capital of Japan?')]));
    assert.deepEqual(mock.violations, []);
  });
  it('rejects tool_use / tool_result history when no tools are defined', async () => {
    const { messages, use } = await toolRound();
    await assertRejected('no tools', leadParams([...messages, { role: 'user', content: [result(use.id)] }], { tools: undefined }), { message: /must define tools/ });
  });
  it('rejects a server_tool_use without its result in earlier history', async () => {
    const { client } = setup();
    const messages = [userTurn('[[pause]] check something')];
    const { final } = await streamAll(client, leadParams(messages));
    messages.push({ role: 'assistant', content: clone(final.content) });
    await assertRejected('dangling server tool', leadParams([...messages, userTurn('never mind')]), { message: /without a corresponding/ });
  });
  it('rejects a web_search_tool_result that references no server_tool_use', () => assertRejected('orphan result', {
    ...base(),
    messages: [...okMessages(), { role: 'assistant', content: [{ type: 'web_search_tool_result', tool_use_id: 'srvtoolu_01Nope', content: [] }, { type: 'text', text: 'x' }] }, userTurn('next')],
  }, { message: /does not match any preceding/ }));
});

describe('mock: structured outputs (follow-up suggestions, SPEC §14.5)', () => {
  const FOLLOWUP_SCHEMA = {
    type: 'object',
    properties: { followups: { type: 'array', items: { type: 'string' }, description: 'Up to 3 short questions.' } },
    required: ['followups'],
    additionalProperties: false,
  };
  const params = (schema, extra = {}) => ({
    model: 'claude-haiku-5-5',
    max_tokens: 400,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: 'Question: [[swarm:6]] Compare heat pumps\n\nAnswer: Heat pumps are efficient.\n\nSuggest follow-up questions.' }],
    ...extra,
  });

  it('answers with JSON that matches the schema (directives in the text are ignored)', async () => {
    const { client, mock } = setup();
    const final = await client.beta.messages.create(params(FOLLOWUP_SCHEMA));
    assert.equal(final.content.length, 1);
    const value = JSON.parse(final.content[0].text);
    assert.ok(Array.isArray(value.followups) && value.followups.length === 3);
    for (const q of value.followups) assert.ok(typeof q === 'string' && q.length > 0 && q.length <= 70);
    assert.equal(mock.requests[0].kind, 'structured');
    assert.deepEqual(mock.violations, []);
  });

  it('also streams structured output when asked to', async () => {
    const { client } = setup();
    const { final } = await streamAll(client, params(FOLLOWUP_SCHEMA));
    assert.ok(JSON.parse(textOf(final)).followups.length);
  });

  it('resolves $ref, enum, anyOf and string formats', async () => {
    const { client } = setup();
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        when: { type: 'string', format: 'date-time' },
        mood: { type: 'string', enum: ['calm', 'busy'] },
        item: { $ref: '#/$defs/item' },
        maybe: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
      },
      required: ['when', 'mood', 'item', 'maybe'],
      $defs: { item: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } }, required: ['ok'] } },
    };
    const final = await client.beta.messages.create(params(schema));
    assert.deepEqual(JSON.parse(final.content[0].text), { when: '2026-11-19T16:35:00Z', mood: 'calm', item: { ok: true }, maybe: 1 });
  });

  const reject = (name, schema, message) =>
    it(`rejects ${name}`, async () => {
      const { client, mock } = setup();
      await assert.rejects(() => client.beta.messages.create(params(schema)), (err) => err.status === 400 && message.test(err.error.error.message));
      assert.equal(mock.violations.length, 1);
    });
  reject('an object without additionalProperties: false', { ...FOLLOWUP_SCHEMA, additionalProperties: undefined }, /additionalProperties/);
  reject('maxItems', { ...FOLLOWUP_SCHEMA, properties: { followups: { type: 'array', items: { type: 'string' }, maxItems: 3 } } }, /maxItems/);
  reject('maxLength', { ...FOLLOWUP_SCHEMA, properties: { followups: { type: 'array', items: { type: 'string', maxLength: 70 } } } }, /maxLength/);
  reject('minItems above 1', { ...FOLLOWUP_SCHEMA, properties: { followups: { type: 'array', items: { type: 'string' }, minItems: 2 } } }, /minItems/);
  reject('an unsupported string format', { ...FOLLOWUP_SCHEMA, properties: { followups: { type: 'string', format: 'phone' } } }, /format/);
  reject('a schema node without a type', { ...FOLLOWUP_SCHEMA, properties: { followups: { description: 'x' } } }, /define `type`/);
  it('rejects a format that is not json_schema', async () => {
    const { client } = setup();
    await assert.rejects(
      () => client.beta.messages.create({ ...params(FOLLOWUP_SCHEMA), output_config: { format: { type: 'json', schema: FOLLOWUP_SCHEMA } } }),
      (err) => err.status === 400 && /json_schema/.test(err.error.error.message),
    );
  });
});

describe('mock: control routes and HTTP handler', () => {
  it('exposes requests, violations and reset through /__mock/*', async () => {
    const { fetch, client } = setup();
    await streamAll(client, leadParams(okMessages()));
    await rawPost(fetch, { ...leadParams(okMessages()), temperature: 1 });
    const requests = await (await fetch(`${BASE}/__mock/requests`)).json();
    assert.equal(requests.length, 2);
    assert.ok(requests[0].time && requests[0].path === '/v1/messages' && requests[0].body.model === 'claude-opus-5-5');
    assert.equal(requests[0].headers['anthropic-version'], '2026-10-21');
    assert.ok(!('authorization' in requests[0].headers) && !('x-api-key' in requests[0].headers));
    const violations = await (await fetch(`${BASE}/__mock/violations`)).json();
    assert.equal(violations.length, 1);
    assert.match(violations[0].message, /temperature/);
    const reset = await fetch(`${BASE}/__mock/reset`, { method: 'POST' });
    assert.deepEqual(await reset.json(), { ok: true });
    assert.deepEqual(await (await fetch(`${BASE}/__mock/requests`)).json(), []);
    assert.deepEqual(await (await fetch(`${BASE}/__mock/violations`)).json(), []);
  });

  it('filters expected violations with unexpectedViolations()', () => {
    const mock = createMock();
    mock.violations.push({ status: 401, type: 'authentication_error', message: 'invalid x-api-key' }, { status: 400, type: 'invalid_request_error', message: 'temperature: x' });
    assert.equal(mock.unexpectedViolations([{ type: 'authentication_error' }]).length, 1);
    assert.equal(mock.unexpectedViolations([{ type: 'authentication_error' }, { message: /temperature/ }]).length, 0);
  });

  it('serves real SSE over HTTP, cuts sockets for [[dropworkers]], and passes other paths to next()', async () => {
    const handler = createMockHandler({ timeScale: 0.02 });
    const server = http.createServer((req, res) => handler(req, res, () => res.writeHead(418).end('next')));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
      const client = new Anthropic({ apiKey: KEY, baseURL: url, maxRetries: 0 });
      const res = await fetch(`${url}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2026-10-21' },
        body: JSON.stringify({ ...leadParams(okMessages()), stream: true }),
      });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /^text\/event-stream/);
      assert.ok(res.headers.get('request-id').startsWith('req_'));
      const sse = await res.text();
      assert.match(sse, /^event: message_start\ndata: \{/);
      assert.match(sse, /event: message_stop\ndata: \{"type":"message_stop"\}\n\n$/);

      const { final } = await streamAll(client, leadParams([userTurn('[[search]] tidal power')]));
      assert.equal(final.stop_reason, 'end_turn');

      const dropParams = workerParams(workerPrompt({ mission: 'HTTP drop', role: 'A', task: 'Research B. [[dropworkers]]' }));
      await assert.rejects(() => client.beta.messages.stream(dropParams).finalMessage(), (err) => !(err instanceof Anthropic.APIError));
      const again = await client.beta.messages.stream(dropParams).finalMessage();
      assert.equal(again.stop_reason, 'end_turn');

      const passthrough = await fetch(`${url}/index.html`);
      assert.equal(passthrough.status, 418);
      const health = await (await fetch(`${url}/__mock/health`)).json();
      assert.equal(health.ok, true);
      assert.deepEqual(handler.mock.violations, []);
      assert.deepEqual(handler.mock.requests.map((r) => r.outcome), ['ok', 'ok', 'cut', 'ok']);
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });

  it('answers CORS preflight requests', async () => {
    const { fetch } = setup();
    const res = await fetch(`${BASE}/v1/messages`, { method: 'OPTIONS', headers: { 'access-control-request-headers': 'x-api-key,content-type' } });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(res.headers.get('access-control-allow-headers'), /x-api-key/);
  });
});
