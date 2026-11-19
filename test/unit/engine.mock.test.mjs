// Integration: the engine against infra's strict mock Claude API (test/mock/anthropic-mock.mjs,
// in-process fetch). The mock validates every request like the real API, including its
// history-editing (thinking-signature) check, and records violations. Skipped if the mock module
// is not available.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJarvis } from '../../src/engine/index.js';
import { DEFAULT_TEST_SETTINGS, KEY, createMemory } from './engine.support.test.mjs';

let createMockFetch = null;
try {
  ({ createMockFetch } = await import('../mock/anthropic-mock.mjs'));
} catch {
  createMockFetch = null;
}
const skip = typeof createMockFetch !== 'function' ? 'test/mock/anthropic-mock.mjs is not available' : false;

function setup() {
  const fetch = createMockFetch({ timeScale: 0.02 });
  const memory = createMemory();
  const jarvis = createJarvis({
    getSettings: () => DEFAULT_TEST_SETTINGS,
    getApiKey: () => KEY,
    fetch,
    memory,
    persist: async (conv) => structuredClone(conv),
    clientOptions: { maxRetries: 0 },
    retryBaseMs: 20,
    workerStaggerMs: 5,
    maxRetryWaitMs: 200,
  });
  return { jarvis, mock: fetch.mock, memory };
}

async function turn(jarvis, conv, text, mode = 'auto') {
  return jarvis.startTurn(conv, { text, mode }).done;
}

const statuses = (t) => Object.values(t.missions).map((m) => [m.status, m.agents.map((a) => a.status)]);

test('engine ↔ strict mock: answers, search, swarm, waves, memory and pauses with valid histories', { skip }, async () => {
  const { jarvis, mock, memory } = setup();
  const conv = jarvis.newConversation();
  assert.equal((await turn(jarvis, conv, 'What is the capital of France?')).status, 'done');
  const search = await turn(jarvis, conv, 'Latest news please [[search]]');
  assert.equal(search.status, 'done');
  assert.ok(search.segments.some((s) => s.kind === 'tool' && s.status === 'done' && s.results.length > 0));
  const swarm = await turn(jarvis, conv, 'Compare the options [[swarm:5]]', 'swarm');
  assert.equal(swarm.status, 'done');
  assert.deepEqual(statuses(swarm), [['done', ['done', 'done', 'done', 'done', 'done']]]);
  const waves = await turn(jarvis, conv, 'Go deeper [[swarm:2]] [[waves:2]]', 'swarm');
  assert.equal(waves.status, 'done');
  assert.equal(waves.stats.waves, 2);
  assert.equal((await turn(jarvis, conv, 'Remember this [[memory]]')).status, 'done');
  assert.equal(memory.items.length, 1);
  assert.equal((await turn(jarvis, conv, 'Long research [[pause]]')).status, 'done');
  assert.equal((await turn(jarvis, conv, 'Agents that pause [[swarm:2]] [[workerpause]]', 'swarm')).status, 'done');
  assert.equal((await turn(jarvis, conv, 'Plain follow-up')).status, 'done');
  assert.deepEqual(mock.violations, []);
});

test('engine ↔ strict mock: rate limits, failing worker, bad tool input, refusal', { skip }, async () => {
  const { jarvis, mock } = setup();
  const conv = jarvis.newConversation();
  const throttled = await turn(jarvis, conv, 'Busy period [[swarm:4]] [[ratelimit:4]]', 'swarm');
  assert.equal(throttled.status, 'done');
  assert.deepEqual(statuses(throttled), [['done', ['done', 'done', 'done', 'done']]]);
  const failing = await turn(jarvis, conv, 'One will fail [[swarm:3]] [[workerfail]]', 'swarm');
  assert.equal(failing.status, 'done');
  assert.equal(Object.values(failing.missions)[0].status, 'partial');
  assert.equal((await turn(jarvis, conv, 'Bad tool first [[badtool]]', 'swarm')).status, 'done');
  const refused = await turn(jarvis, conv, 'Not allowed [[refuse]]');
  assert.equal(refused.status, 'error');
  assert.equal(refused.error.kind, 'refusal');
  assert.equal((await turn(jarvis, conv, 'Something harmless')).status, 'done');
  assert.deepEqual(mock.violations, []);
});

test('engine ↔ strict mock: Voice Mode turns get spoken replies; chat turns after them are valid and written for the screen', { skip }, async () => {
  const { jarvis, mock } = setup();
  const conv = jarvis.newConversation();
  const BREAK = '\n\n---\n\n';
  const PREAMBLE = 'Let me check the latest on that.';
  const spoken = (text, mode = 'auto') => jarvis.startTurn(conv, { text, mode, spoken: true, keepOnStop: true }).done;
  const texts = (t) => t.segments.filter((s) => s.kind === 'text').map((s) => s.text);
  const kinds = (t) => t.segments.map((s) => s.kind).filter((k) => k !== 'thinking');
  /** The reply's last text segment: plain spoken sentences, the --- line, then "## Details" and two points. */
  const assertSpoken = (t, label) => {
    assert.equal(t.status, 'done', label);
    assert.equal(t.spoken, true, label);
    const answer = texts(t).at(-1);
    const [said, details] = answer.split(BREAK);
    assert.doesNotMatch(said, /[*#`|[\]]|https?:|\n/, `${label}: the spoken part is plain prose`);
    assert.match(details ?? '', /^## Details\n\n- [^\n]+\n- [^\n]+$/, `${label}: details for the screen`);
    return { said, details };
  };

  const capital = await spoken('What is the capital of France?');
  assert.match(assertSpoken(capital, 'capital').said, /^The capital of France is Paris\. /);
  assert.deepEqual(kinds(capital), ['text']);

  const search = await spoken('Latest EV battery news [[search]]');
  assertSpoken(search, 'search');
  assert.deepEqual(kinds(search), ['text', 'tool', 'text']); // the preamble is said before the search runs
  assert.equal(texts(search)[0], PREAMBLE);
  assert.ok(search.segments.find((s) => s.kind === 'tool').results.length >= 3);
  assert.ok(search.segments.filter((s) => s.kind === 'text').at(-1).citations.length >= 1, 'cited points for the screen');

  const swarm = await spoken('Research tidal power [[swarm:2]]', 'swarm');
  const synthesis = assertSpoken(swarm, 'swarm');
  assert.deepEqual(kinds(swarm), ['text', 'mission', 'text']);
  assert.equal(texts(swarm)[0], PREAMBLE);
  assert.deepEqual(statuses(swarm), [['done', ['done', 'done']]]);
  for (const agent of Object.values(swarm.missions)[0].agents) assert.ok(synthesis.details.includes(`**${agent.codename}**`), agent.codename);

  assertSpoken(await spoken('Long research [[pause]]'), 'pause');
  const remember = await spoken('Remember this [[memory]]');
  assertSpoken(remember, 'memory');
  assert.equal(texts(remember)[0], "I'll make a note of that.");

  // The next chat turn: no channel in its context, a reply for the screen, a valid history.
  const chat = await turn(jarvis, conv, 'And what about Germany? What is its capital?');
  assert.equal(chat.status, 'done');
  assert.equal('spoken' in chat, false);
  assert.match(texts(chat).join('\n'), /^The capital of Germany is Berlin\.\n\n\*\*Berlin\*\*/);
  assert.ok(!texts(chat).join('\n').includes(BREAK));
  const leads = mock.requests.filter((r) => r.kind === 'lead');
  const newestContext = (r) => r.body.messages.findLast((m) => m.role === 'user' && m.content.some((b) => b.type === 'text' && b.text.startsWith('<turn_context>'))).content[0].text;
  assert.ok(leads.slice(0, -1).every((r) => /^Reply channel: spoken\. /m.test(newestContext(r))));
  assert.doesNotMatch(newestContext(leads.at(-1)), /Reply channel/);
  assert.deepEqual(mock.violations, []);
});

test('engine ↔ strict mock: dropped workers resume; Stop mid-swarm keeps the history valid', { skip }, async () => {
  const { jarvis, mock } = setup();
  const conv = jarvis.newConversation();
  const cut = await turn(jarvis, conv, 'Fragile network [[swarm:3]] [[dropworkers]]', 'swarm');
  assert.equal(cut.status, 'interrupted');
  assert.equal(jarvis.canResume(conv), true);
  const resumed = await jarvis.resumeTurn(conv).done;
  assert.equal(resumed.status, 'done');
  assert.deepEqual(statuses(resumed), [['done', ['done', 'done', 'done']]]);
  assert.equal((await turn(jarvis, conv, 'And a follow-up')).status, 'done');

  const conv2 = jarvis.newConversation();
  const run = jarvis.startTurn(conv2, { text: 'Slow team [[swarm:3]] [[slow]]', mode: 'swarm' });
  run.on('agent', (e) => {
    if (e.agent.status === 'searching' || e.agent.status === 'thinking') run.abort();
  });
  assert.equal((await run.done).status, 'stopped');
  assert.equal((await turn(jarvis, conv2, 'After the stop')).status, 'done');
  assert.deepEqual(mock.violations, []);
});
