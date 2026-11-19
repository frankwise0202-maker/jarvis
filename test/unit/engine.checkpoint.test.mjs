// Resume and the saved checkpoint (conversation.pending): a checkpoint saved a moment before its tool
// round finished can sit next to a history that already holds the round's results (e.g. the app
// was killed right after the save). Resume must then re-issue the next request, never answer the
// round a second time (a duplicate tool_result is a 400 on every later request).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blk, collect, createHarness, runTurn } from './engine.support.test.mjs';

const roles = (messages) => messages.map((m) => m.role);

test('Resume with a checkpoint older than the history: the finished tool round is not answered twice', async () => {
  const input = { action: 'add', fact: 'Prefers metric units' };
  const h = createHarness({
    handler: () => {
      const n = h.api.requests.length;
      if (n === 1) return { content: [blk.text('I will note that.'), blk.memory('toolu_mem', input.action, input.fact)], stop: 'tool_use' };
      if (n === 2) return { content: [blk.text('Noted, you prefer metric units.')], stop: 'end_turn', breakAfter: 5 }; // the connection drops
      return { content: [blk.text('Noted: metric units from now on.')], stop: 'end_turn' };
    },
  });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Remember that I prefer metric units');
  assert.equal(turn.status, 'interrupted');
  assert.deepEqual(roles(conv.apiMessages), ['user', 'assistant', 'user']);
  // What a save taken while the round was finishing stored: the round's own checkpoint, next to a
  // history that already ends with its tool_result.
  conv.pending = { turnId: turn.id, toolUses: [{ id: 'toolu_mem', name: 'update_memory', input }], results: {}, missionIds: [], req: 1 };
  assert.equal(h.jarvis.canResume(conv), true);

  const { turn: after } = await collect(h.jarvis.resumeTurn(conv));
  assert.equal(after.status, 'done');
  const body = h.api.requests.at(-1).body;
  assert.deepEqual(roles(body.messages), ['user', 'assistant', 'user']);
  const results = body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === 'tool_result');
  assert.equal(results.length, 1, 'one tool_result for the one tool_use');
  assert.equal(results[0].content, 'Saved.');
  assert.deepEqual(roles(conv.apiMessages), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(conv.pending, null);
  assert.equal(after.segments.filter((s) => s.kind === 'text').map((s) => s.text).join(' | '), 'I will note that. | Noted: metric units from now on.');
});

test('a retry countdown saved mid-wait does not stay in the transcript when the turn is settled on the next launch', async () => {
  // First launch: Claude is busy (529, retry-after 8 s); the turn is saved while the countdown shows.
  const busy = createHarness({
    maxRetryWaitMs: 60000,
    handler: () => ({ error: { status: 529, type: 'overloaded_error', message: 'Overloaded', headers: { 'retry-after': '8' } } }),
  });
  const conv = busy.jarvis.newConversation();
  const run = busy.jarvis.startTurn(conv, { text: 'Hello?' });
  const mid = await new Promise((resolve) => {
    const check = setInterval(() => {
      const snap = busy.persisted.findLast((c) => c.turns.at(-1)?.segments.some((s) => s.transient));
      if (snap) {
        clearInterval(check);
        resolve(snap);
      }
    }, 20);
  });
  run.abort(); // (the first launch is gone; only its saved snapshot matters)
  await run.done;
  assert.equal(mid.turns.at(-1).status, 'running');
  assert.match(mid.turns.at(-1).segments.find((s) => s.transient).text, /retrying in \d+s/);

  // Next launch: the snapshot is loaded and the owner sends a new message instead of resuming.
  const next = createHarness({ handler: () => ({ content: [blk.text('Hello again.')], stop: 'end_turn' }) });
  const loaded = structuredClone(mid);
  assert.equal(next.jarvis.canResume(loaded), true); // settled as interrupted on load
  assert.equal(loaded.turns.at(-1).segments.some((s) => s.transient), false, 'no stale countdown next to Resume');
  const { turn } = await runTurn(next.jarvis, loaded, 'Are you there?');
  assert.equal(turn.status, 'done');
  const old = loaded.turns.at(-3);
  assert.equal(old.status, 'stopped');
  assert.equal(old.segments.some((s) => s.transient || /retrying in/.test(s.text || '')), false);
});
