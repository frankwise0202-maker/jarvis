// The live view's gate inside the engine (v8.1, E0): startTurn({ gate }) and lead.js's gateRequest,
// against the strict mock Claude API, in-process. While the live view is on, each lead request is
// kept short (4,000 tokens for the turn's first, 1,000 after), reserves its worst case in the live
// view's hour first and settles at its real cost; at the edge it is never sent and the turn ends with
// the gate's line; a request turned down before it was billed gives its room back; one stopped after
// it was sent keeps it. With the live view off, every request is exactly as before.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJarvis } from '../../src/engine/index.js';
import { DEPTHS } from '../../src/engine/models.js';
import { createMockFetch } from '../mock/anthropic-mock.mjs';
import { createLiveBudget } from '../../src/lib/live-view.js';
import { createLiveGate, createTurnGate } from '../../src/lib/live-gate.js';
import { DEFAULT_TEST_SETTINGS, KEY, createFakeLibrary, createMemory } from './engine.support.test.mjs';
import { opticsAttachment } from './optics.support.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

function setup() {
  const fetch = createMockFetch({ timeScale: 0.02 });
  const jarvis = createJarvis({
    getSettings: () => DEFAULT_TEST_SETTINGS,
    getApiKey: () => KEY,
    fetch,
    memory: createMemory(),
    library: createFakeLibrary(),
    persist: async (conv) => structuredClone(conv),
    clientOptions: { maxRetries: 0 },
    retryBaseMs: 20,
    workerStaggerMs: 5,
    maxRetryWaitMs: 200,
  });
  const storage = memoryStorage();
  const budget = createLiveBudget({ storage });
  const gate = createLiveGate({ budget, storage });
  const live = { on: true };
  // Every ticket's outcome, in order (the gate's own methods, spied on).
  const outcomes = [];
  const spied = {
    ...gate,
    settle: (id, usd) => (outcomes.push(['settle', usd]), gate.settle(id, usd)),
    release: (id) => (outcomes.push(['release']), gate.release(id)),
    keep: (id) => (outcomes.push(['keep']), gate.keep(id)),
  };
  const turnGate = createTurnGate({ gate: spied, isOn: () => live.on });
  return { jarvis, mock: fetch.mock, budget, gate, live, turnGate, outcomes };
}

const leads = (mock) => mock.requests.filter((r) => r.kind === 'lead');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const look = (jarvis, conv, text, gate) => jarvis.startTurn(conv, { text, mode: 'quick', attachments: [opticsAttachment(1280, 720)], optics: { source: 'camera', capturedAt: 1763500000000 }, gate });

test('a Look during the live view: its first request at most 4,000 tokens, the closing one 1,000; each reserved, then settled at its real cost', async () => {
  const { jarvis, mock, budget, gate, turnGate, outcomes } = setup();
  const conv = jarvis.newConversation();
  const turn = await look(jarvis, conv, 'What is on my desk?', turnGate).done;
  assert.equal(turn.status, 'done');
  const reqs = leads(mock);
  assert.equal(reqs.length, 2, 'the answer with its labels, then the closing sentence');
  assert.deepEqual(reqs.map((r) => r.body.max_tokens), [4000, 1000]);
  assert.deepEqual(outcomes.map((o) => o[0]), ['settle', 'settle']);
  assert.ok(turn.costUsd > 0);
  assert.ok(near(budget.spent(), turn.costUsd), `the hour counts exactly what the Look cost (${budget.spent()} vs ${turn.costUsd})`);
  assert.equal(gate.reserved(), 0, 'nothing held once it is answered');
  assert.deepEqual(mock.violations, []);
});

test('the live view off: no gate, the requests exactly as before, nothing counted in its hour', async () => {
  const { jarvis, mock, budget, live, turnGate, outcomes } = setup();
  live.on = false;
  const conv = jarvis.newConversation();
  const turn = await look(jarvis, conv, 'What is on my desk?', turnGate).done;
  assert.equal(turn.status, 'done');
  const normal = DEPTHS[DEFAULT_TEST_SETTINGS.depth || 'balanced'].visualLeadMaxTokens;
  assert.ok(leads(mock).every((r) => r.body.max_tokens === normal), `max_tokens as today (${leads(mock).map((r) => r.body.max_tokens)})`);
  assert.deepEqual(outcomes, []);
  assert.equal(budget.spent(), 0);
  // And without any gate at all: the same.
  const conv2 = jarvis.newConversation();
  await look(jarvis, conv2, 'What is on my desk?').done;
  assert.ok(leads(mock).every((r) => r.body.max_tokens === normal));
});

test('at 97¢ the Look is refused: nothing is sent, the turn says why and leaves no message behind; after "stop live view" the same question is answered', async () => {
  const { jarvis, mock, budget, gate, live, turnGate } = setup();
  const conv = jarvis.newConversation();
  // An earlier question in this chat (the live view off then).
  live.on = false;
  await jarvis.startTurn(conv, { text: 'What is the capital of France?', mode: 'quick', gate: turnGate }).done;
  live.on = true;
  budget.add(0.97);
  const before = conv.apiMessages.length;
  const sent = leads(mock).length;
  const refused = await jarvis.startTurn(conv, { text: 'What is this?', mode: 'quick', gate: turnGate }).done;
  assert.equal(refused.status, 'error');
  assert.equal(refused.error.kind, 'live_cap');
  assert.match(refused.error.message, /^That would take the live view past its dollar this hour\. It can go on at .+, or say 'stop live view' and ask again\.$/);
  assert.equal(leads(mock).length, sent, 'no request was sent');
  assert.equal(conv.apiMessages.length, before, 'the refused message left the history');
  assert.ok(refused.segments.some((s) => s.kind === 'error' && s.error.kind === 'live_cap'), 'the transcript says why');
  assert.equal(gate.reserved(), 0);
  assert.ok(near(budget.spent(), 0.97), 'nothing more counted');
  // "Stop live view", and ask again: answered, once.
  live.on = false;
  const again = await jarvis.startTurn(conv, { text: 'What is this?', mode: 'quick', gate: turnGate }).done;
  assert.equal(again.status, 'done');
  assert.equal(leads(mock).length, sent + 1);
  const users = conv.apiMessages.filter((m) => m.role === 'user' && JSON.stringify(m.content).includes('What is this?'));
  assert.equal(users.length, 1, 'the question is in the history once');
  assert.deepEqual(mock.violations, []);
});

test('a request turned down before it was billed (a 529) gives its room back; the retry reserves again and is settled', async () => {
  const { jarvis, budget, gate, turnGate, outcomes } = setup();
  const conv = jarvis.newConversation();
  const turn = await jarvis.startTurn(conv, { text: 'Quick one [[overloaded]]', mode: 'quick', gate: turnGate }).done;
  assert.equal(turn.status, 'done');
  assert.deepEqual(outcomes.map((o) => o[0]), ['release', 'settle']);
  assert.ok(near(budget.spent(), turn.costUsd));
  assert.equal(gate.reserved(), 0);
});

test('a request stopped after it was sent keeps its reservation (it may have been billed)', async () => {
  const { jarvis, budget, gate, turnGate, outcomes } = setup();
  const conv = jarvis.newConversation();
  const run = jarvis.startTurn(conv, { text: 'Tell me a long story [[slow]] [[long]]', mode: 'quick', gate: turnGate });
  await new Promise((resolve) => {
    const off = run.on('segment', (e) => {
      if (e.segment.kind === 'text' && e.segment.text && e.segment.text.length > 20) {
        off();
        resolve();
      }
    });
  });
  const held = gate.reserved();
  assert.ok(held > 0, 'held while it streams');
  run.abort();
  const turn = await run.done;
  assert.equal(turn.status, 'stopped');
  assert.deepEqual(outcomes.map((o) => o[0]), ['keep']);
  assert.ok(near(budget.spent(), held), `the whole reservation counts (${budget.spent()} vs ${held})`);
  assert.equal(gate.reserved(), 0);
});

test('the hour filled during a turn: a later request is refused, the turn ends with the line and its history stays valid', async () => {
  const { jarvis, mock, budget, gate, turnGate } = setup();
  let calls = 0;
  const filling = {
    maxTokens: turnGate.maxTokens,
    reserve: async (args) => {
      calls += 1;
      if (calls === 2) budget.add(0.99); // another window's live view, meanwhile
      return turnGate.reserve(args);
    },
  };
  const conv = jarvis.newConversation();
  const turn = await look(jarvis, conv, 'What is on my desk?', filling).done;
  assert.equal(turn.status, 'error');
  assert.equal(turn.error.kind, 'live_cap');
  assert.equal(leads(mock).length, 1, 'the closing request was never sent');
  assert.ok(turn.costUsd > 0 && near(budget.spent(), 0.99 + turn.costUsd), 'the first request counted at its real cost');
  assert.equal(gate.reserved(), 0);
  // The labels' tool round is in the history: a next question still makes a valid request.
  const next = await jarvis.startTurn(conv, { text: 'Thanks' }).done;
  assert.equal(next.status, 'done');
  assert.deepEqual(mock.violations, []);
});

test('a web-search answer reserves its searches (1¢ each that it may make) and its pause continuation is kept short', async () => {
  const { jarvis, mock, budget, turnGate, outcomes } = setup();
  const conv = jarvis.newConversation();
  const turn = await jarvis.startTurn(conv, { text: 'Research this with a web search [[search]] [[pause]]', mode: 'quick', gate: turnGate }).done;
  assert.equal(turn.status, 'done');
  const reqs = leads(mock);
  assert.ok(reqs.length >= 2, `a paused turn goes on in a second request (${reqs.length})`);
  assert.equal(reqs[0].body.max_tokens, 4000);
  assert.ok(reqs.slice(1).every((r) => r.body.max_tokens === 1000));
  assert.ok(outcomes.every((o) => o[0] === 'settle'));
  assert.ok(near(budget.spent(), turn.costUsd));
});
