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
