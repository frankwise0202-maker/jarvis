// Stop and the owner's message (SPEC 16): a turn stopped before Jarvis showed any reply is withdrawn
// (its text and photos go back to the composer); once part of the reply is on screen, after a
// Resume, or in Voice Mode (keepOnStop), the message stays in the history together with the reply
// text the owner saw, so the next message keeps its context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJarvis } from '../../src/engine/index.js';
import { showedReply } from '../../src/engine/lead.js';
import { DEFAULT_TEST_SETTINGS, KEY, blk, collect, createHarness, createMemory, runTurn, segmentsOf } from './engine.support.test.mjs';

let createMockFetch = null;
try {
  ({ createMockFetch } = await import('../mock/anthropic-mock.mjs'));
} catch {
  createMockFetch = null;
}

const SLOW_ANSWER = 'This is a slow answer that will be stopped halfway through, long before it is finished.';
const roles = (messages) => messages.map((m) => m.role);
const shownText = (turn) => segmentsOf(turn, 'text').map((s) => s.text.trim()).filter(Boolean).join('\n\n');

test('Stop while the answer streams: the message stays, with the text the owner saw; the next request carries both', async () => {
  const h = createHarness({
    handler: (req) => (h.api.requests.length === 1
      ? { content: [blk.thinking('Think first.'), blk.text(SLOW_ANSWER)], stop: 'end_turn', delayMs: 30 }
      : { content: [blk.text('Shorter: it was stopped.')], stop: 'end_turn' }),
  });
  const conv = h.jarvis.newConversation();
  const { turn, events } = await runTurn(h.jarvis, conv, 'Slow please', 'auto', {
    onRun: (run) => run.on('segment', (e) => {
      if (e.segment.kind === 'text' && e.segment.text.length > 10) run.abort();
    }),
  });
  assert.equal(turn.status, 'stopped');
  assert.equal(turn.withdrawn, undefined, 'part of the reply was on screen: not withdrawn');
  assert.equal(events.filter((e) => e.type === 'turn').at(-1).turn.withdrawn, undefined);
  const partial = shownText(turn);
  assert.ok(partial.length > 10 && partial.length < SLOW_ANSWER.length, `a partial answer was shown (${partial.length} characters)`);
  // The history keeps the question and, as a text-only assistant message, what Jarvis had written.
  assert.deepEqual(roles(conv.apiMessages), ['user', 'assistant']);
  assert.deepEqual(conv.apiMessages[1], { role: 'assistant', content: [{ type: 'text', text: partial }] });
  assert.deepEqual(roles(h.persisted.at(-1).apiMessages), ['user', 'assistant']);
  assert.equal(conv.pending, null);
  assert.equal(h.jarvis.canResume(conv), false);

  const { turn: next } = await runTurn(h.jarvis, conv, 'Thanks, now make it much shorter');
  assert.equal(next.status, 'done');
  const body = h.api.requests.at(-1).body;
  assert.deepEqual(roles(body.messages), ['user', 'assistant', 'user']);
  assert.match(body.messages[0].content.at(-1).text, /Slow please/);
  assert.deepEqual(body.messages[1].content, [{ type: 'text', text: partial }]);
});

test('Stop while only thinking is shown: withdrawn (nothing of the reply was on screen)', async () => {
  const h = createHarness({ handler: () => ({ content: [blk.thinking('Let me think about this carefully before answering. '.repeat(4)), blk.text(SLOW_ANSWER)], stop: 'end_turn', delayMs: 30 }) });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Think hard', 'auto', {
    onRun: (run) => run.on('segment', (e) => {
      if (e.segment.kind === 'thinking') run.abort();
    }),
  });
  assert.equal(turn.status, 'stopped');
  assert.ok(segmentsOf(turn, 'thinking').length === 1 && segmentsOf(turn, 'text').length === 0);
  assert.equal(turn.withdrawn, true);
  assert.deepEqual(conv.apiMessages, []);
});

test('Stop during a pause_turn continuation keeps the message and the text of both requests', async () => {
  const h = createHarness({
    handler: (req) => {
      const n = h.api.requests.length;
      if (n === 1) return { content: [blk.text('Let me check the latest figures.'), blk.search('srvtoolu_p1', 'figures 2026'), blk.searchResult('srvtoolu_p1', [['https://www.example.com/f', 'Figures']])], stop: 'pause_turn' };
      if (n === 2) return { content: [blk.text(SLOW_ANSWER)], stop: 'end_turn', delayMs: 30 };
      return { content: [blk.text('Next answer.')], stop: 'end_turn' };
    },
  });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Latest figures please', 'auto', {
    onRun: (run) => run.on('segment', (e) => {
      if (e.segment.kind === 'text' && e.segment.req === 1 && e.segment.text.length > 10) run.abort();
    }),
  });
  assert.equal(turn.status, 'stopped');
  assert.equal(turn.withdrawn, undefined);
  const texts = segmentsOf(turn, 'text');
  assert.deepEqual(texts.map((s) => s.req), [0, 1]);
  assert.deepEqual(roles(conv.apiMessages), ['user', 'assistant']);
  // Text only: the paused request's server tool blocks never reach the history.
  assert.deepEqual(conv.apiMessages[1].content, [{ type: 'text', text: shownText(turn) }]);
  assert.match(conv.apiMessages[1].content[0].text, /^Let me check the latest figures\.\n\nThis is a slow/);
  const { turn: next } = await runTurn(h.jarvis, conv, 'Go on');
  assert.equal(next.status, 'done');
  assert.deepEqual(roles(h.api.requests.at(-1).body.messages), ['user', 'assistant', 'user']);
});

test('Resume, then Stop before any reply: a resumed turn is never withdrawn', async () => {
  const h = createHarness({
    handler: (req) => {
      const n = h.api.requests.length;
      if (n === 1) return { content: [blk.thinking('Hmm'), blk.text('A partial answer that will be cut')], stop: 'end_turn', breakAfter: 9 };
      if (n === 2) return { content: [blk.thinking('Again.'), blk.text(SLOW_ANSWER)], stop: 'end_turn', delayMs: 30 };
      return { content: [blk.text('Next answer.')], stop: 'end_turn' };
    },
  });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Hello');
  assert.equal(turn.status, 'interrupted');
  const run = h.jarvis.resumeTurn(conv);
  run.abort(); // stopped before the resumed request showed anything
  const { turn: after } = await collect(run);
  assert.equal(after.status, 'stopped');
  assert.equal(after.withdrawn, undefined, 'the question stays in the history');
  assert.deepEqual(roles(conv.apiMessages), ['user']);
  const { turn: next } = await runTurn(h.jarvis, conv, 'Are you there?');
  assert.equal(next.status, 'done');
  const body = h.api.requests.at(-1).body;
  assert.deepEqual(roles(body.messages), ['user', 'user']); // the API merges consecutive user messages
  assert.match(body.messages[0].content.at(-1).text, /^Hello$/);
});

test('keepOnStop (Voice Mode): a turn stopped before any reply keeps its message; other turns are still withdrawn', async () => {
  const h = createHarness({ handler: () => ({ content: [blk.text('Answer.')], stop: 'end_turn', delayMs: 30 }) });
  const conv = h.jarvis.newConversation();
  const spoken = h.jarvis.startTurn(conv, { text: 'What is the weather in London?', mode: 'auto', keepOnStop: true });
  spoken.abort();
  const turn = await spoken.done;
  assert.equal(turn.status, 'stopped');
  assert.equal(turn.withdrawn, undefined);
  assert.deepEqual(roles(conv.apiMessages), ['user']);
  const typed = h.jarvis.startTurn(conv, { text: 'Actually, make it Paris', mode: 'auto' });
  typed.abort();
  const second = await typed.done;
  assert.equal(second.withdrawn, true);
  assert.deepEqual(roles(conv.apiMessages), ['user']);
});

test('showedReply: text, search rows, missions and memory count; thinking, notices and blank text do not', () => {
  const t = (...segments) => ({ segments });
  assert.equal(showedReply(t()), false);
  assert.equal(showedReply(t({ kind: 'thinking', text: 'Planning' }, { kind: 'notice', text: 'Busy - retrying in 8s', transient: true }, { kind: 'notice', text: 'A fallback model finished the reply.' })), false);
  assert.equal(showedReply(t({ kind: 'text', text: '  \n' })), false);
  assert.equal(showedReply(t({ kind: 'text', text: 'Paris' })), true);
  assert.equal(showedReply(t({ kind: 'tool', tool: 'web_search', status: 'running' })), true);
  assert.equal(showedReply(t({ kind: 'mission', missionId: 'm1' })), true);
  assert.equal(showedReply(t({ kind: 'memory', fact: 'Likes jazz' })), true);
  assert.equal(showedReply(null), false);
  assert.equal(showedReply({ segments: [null, 'x'] }), false);
});

test('engine ↔ strict mock: Stop mid-answer, then follow-ups: the history stays valid (no violations)', { skip: typeof createMockFetch !== 'function' ? 'test/mock/anthropic-mock.mjs is not available' : false }, async () => {
  const fetch = createMockFetch({ timeScale: 0.05 });
  const jarvis = createJarvis({
    getSettings: () => DEFAULT_TEST_SETTINGS,
    getApiKey: () => KEY,
    fetch,
    memory: createMemory(),
    persist: async (conv) => structuredClone(conv),
    clientOptions: { maxRetries: 0 },
    retryBaseMs: 20,
    workerStaggerMs: 5,
    maxRetryWaitMs: 200,
  });
  const conv = jarvis.newConversation();
  assert.equal((await jarvis.startTurn(conv, { text: 'What is the capital of France?' }).done).status, 'done');
  const run = jarvis.startTurn(conv, { text: 'Explain the history of the Roman Empire in detail [[long]] [[slow]]' });
  run.on('segment', (e) => {
    if (e.segment.kind === 'text' && e.segment.text.length > 120) run.abort();
  });
  const stopped = await run.done;
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.withdrawn, undefined);
  assert.equal((await jarvis.startTurn(conv, { text: 'Summarize what you just told me in one sentence' }).done).status, 'done');
  assert.equal((await jarvis.startTurn(conv, { text: 'Latest news please [[search]]' }).done).status, 'done');
  const leads = fetch.mock.requests.filter((r) => r.kind === 'lead');
  const last = leads.at(-2).body.messages; // the request right after the Stop
  assert.deepEqual(roles(last), ['user', 'assistant', 'user', 'assistant', 'user']);
  assert.match(last[3].content[0].text, /\S/);
  assert.deepEqual(last[3].content.map((b) => b.type), ['text']);
  assert.deepEqual(fetch.mock.violations, []);
});

test('engine ↔ strict mock: Stop during a pause_turn continuation, then a follow-up: valid history (no violations)', { skip: typeof createMockFetch !== 'function' ? 'test/mock/anthropic-mock.mjs is not available' : false }, async () => {
  const fetch = createMockFetch({ timeScale: 0.05 });
  const jarvis = createJarvis({
    getSettings: () => DEFAULT_TEST_SETTINGS,
    getApiKey: () => KEY,
    fetch,
    memory: createMemory(),
    persist: async (conv) => structuredClone(conv),
    clientOptions: { maxRetries: 0 },
    retryBaseMs: 20,
    workerStaggerMs: 5,
    maxRetryWaitMs: 200,
  });
  const conv = jarvis.newConversation();
  const run = jarvis.startTurn(conv, { text: 'Long research on tidal power [[pause]] [[slow]]' });
  run.on('segment', (e) => {
    if (e.segment.kind === 'text' && e.segment.req === 1 && e.segment.text.length > 20) run.abort();
  });
  const stopped = await run.done;
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.withdrawn, undefined);
  assert.ok(stopped.segments.some((s) => s.kind === 'text' && s.req === 1), 'stopped while the continuation was answering');
  assert.deepEqual(roles(conv.apiMessages), ['user', 'assistant']);
  assert.deepEqual(conv.apiMessages[1].content.map((b) => b.type), ['text']);
  assert.equal((await jarvis.startTurn(conv, { text: 'Just the headline, please' }).done).status, 'done');
  const last = fetch.mock.requests.filter((r) => r.kind === 'lead').at(-1).body.messages;
  assert.deepEqual(roles(last), ['user', 'assistant', 'user']);
  assert.deepEqual(fetch.mock.violations, []);
});
