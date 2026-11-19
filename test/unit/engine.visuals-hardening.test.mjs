// Adversarial tests for holograms, blueprints and the saved library in the engine: specs at the
// limits, parallel calls, Stop while the library hangs, interrupted rounds that mix agents and a
// hologram, deleted ids, concurrent conversations. Fake SSE harness and the strict mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJarvis } from '../../src/engine/index.js';
import { HOLOGRAM_LIMITS } from '../../src/lib/hologram-spec.js';
import { createMockFetch } from '../mock/anthropic-mock.mjs';
import {
  DEFAULT_TEST_SETTINGS, KEY, blk, createFakeLibrary, createHarness, createMemory, deferred, deployInput, runTurn, segmentsOf,
  trailingToolResults, workerReply,
} from './engine.support.test.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../mock/fixtures/${name}.json`, import.meta.url), 'utf8'));
const cards = (t) => t.segments.filter((s) => s.kind === 'hologram' || s.kind === 'blueprint');
const saves = (library) => library.calls.filter((c) => c[0] === 'save');

test('a hologram far beyond every limit: capped, warned (bounded), saved; the live build stays cheap', async () => {
  const parts = Array.from({ length: 95 }, (_, i) => ({
    id: `part-${i}`,
    name: `Part number ${i} with a very long label that will be cut`,
    info: 'I'.repeat(900),
    material: 'M'.repeat(300),
    tone: 'neon', // invalid on every part: far more warnings than the tool_result may carry
    explode: [0, i, 0],
    shapes: Array.from({ length: 6 }, (_, j) => ({ type: 'box', at: [i * 10, j * 10, 0], size: [5, 5, 5] })),
  }));
  const input = { title: 'T'.repeat(500), subtitle: 'S'.repeat(500), notes: Array.from({ length: 20 }, () => 'n'.repeat(500)), parts };
  const library = createFakeLibrary();
  let h;
  h = createHarness({ library, handler: () => (h.api.requests.length === 1 ? { content: [blk.hologram('toolu_big', input)], stop: 'tool_use' } : { content: [blk.text('ok')], stop: 'end_turn' }) });
  const updates = [];
  const started = Date.now();
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Show me everything', 'auto', {
    onRun: (run) => run.on('segment', (e) => {
      if (e.segment.kind === 'hologram') updates.push(e.segment.stats.parts);
    }),
  });
  assert.ok(Date.now() - started < 20000, 'a 100 kB input streams in reasonable time');
  assert.equal(turn.status, 'done');
  const [seg] = cards(turn);
  assert.equal(seg.status, 'done');
  assert.equal(seg.spec.title.length, HOLOGRAM_LIMITS.title);
  assert.equal(seg.spec.notes.length, HOLOGRAM_LIMITS.notes);
  assert.equal(seg.stats.shapes, HOLOGRAM_LIMITS.shapes);
  assert.equal(seg.stats.parts, 67, '400 shapes fill 66 parts and part of the 67th; the rest have none left');
  assert.ok(seg.spec.parts.every((p) => p.info.length <= HOLOGRAM_LIMITS.info && p.name.length <= HOLOGRAM_LIMITS.partName));
  assert.equal(seg.warnings.length, HOLOGRAM_LIMITS.warnings);
  assert.match(seg.warnings.at(-1), /^…and \d+ more\.$/);
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.equal(result.is_error, undefined);
  assert.ok(result.content.length < 8000, `the tool_result stays bounded (${result.content.length} characters)`);
  assert.equal(saves(library).length, 1);
  assert.equal(saves(library)[0][1].spec.parts.length, 67);
  // Live updates were throttled: a handful, not one per delta.
  assert.ok(updates.length >= 3 && updates.length < 400, `${updates.length} live updates`);
});

test('several cards in one response (parallel calls): each built, saved and answered in order', async () => {
  const library = createFakeLibrary();
  let h;
  h = createHarness({
    library,
    handler: () => (h.api.requests.length === 1
      ? { content: [blk.text('Both, side by side.'), blk.hologram('toolu_p1', fixture('battery')), blk.hologram('toolu_p2', fixture('alternator')), blk.blueprint('toolu_p3', fixture('battery-cutaway'))], stop: 'tool_use' }
      : { content: [blk.text('There they are.')], stop: 'end_turn' }),
  });
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Show me a battery and an alternator, and the battery cutaway');
  const all = cards(turn);
  assert.deepEqual(all.map((c) => [c.kind, c.toolUseId, c.status]), [['hologram', 'toolu_p1', 'done'], ['hologram', 'toolu_p2', 'done'], ['blueprint', 'toolu_p3', 'done']]);
  assert.equal(new Set(all.map((c) => c.libraryId)).size, 3);
  assert.deepEqual(saves(library).map((c) => c[1].kind), ['hologram', 'hologram', 'blueprint']);
  const results = trailingToolResults(h.api.requests[1].body);
  assert.deepEqual(results.map((r) => r.tool_use_id), ['toolu_p1', 'toolu_p2', 'toolu_p3']);
  assert.ok(results.every((r) => !r.is_error && /Saved to the owner's library as lib_/.test(r.content)));
});

test('Stop while the library hangs on a save: the turn stops at once and the history stays valid', async () => {
  const saving = deferred();
  const library = createFakeLibrary();
  library.save = (record) => {
    library.calls.push(['save', record]);
    saving.resolve();
    return new Promise(() => {}); // never answers
  };
  let h;
  h = createHarness({ library, libraryTimeoutMs: 60000, handler: () => (h.api.requests.length === 1 ? { content: [blk.text('Here.'), blk.hologram('toolu_hang', fixture('battery'))], stop: 'tool_use' } : { content: [blk.text('ok')], stop: 'end_turn' }) });
  const conv = h.jarvis.newConversation();
  const run = h.jarvis.startTurn(conv, { text: 'Show me the battery', mode: 'auto' });
  await saving.promise;
  const stoppedAt = Date.now();
  run.abort();
  const turn = await run.done;
  assert.ok(Date.now() - stoppedAt < 1000, 'Stop never waits for the library');
  assert.equal(turn.status, 'stopped');
  const [seg] = cards(turn);
  assert.equal(seg.status, 'done', 'the hologram was complete and shown');
  assert.equal(seg.libraryId, null);
  assert.deepEqual(conv.apiMessages.map((m) => m.role), ['user', 'assistant', 'user']);
  const [result] = conv.apiMessages[2].content;
  assert.equal(result.tool_use_id, 'toolu_hang');
  assert.match(result.content, /^Hologram shown to the owner[\s\S]*could not be saved/);
  const next = await runTurn(h.jarvis, conv, 'Thanks');
  assert.equal(next.turn.status, 'done');
});

test('a round with agents and a hologram, interrupted: resume re-runs only the agents; the hologram is saved once', async () => {
  const library = createFakeLibrary();
  let workerCalls = 0;
  let leadCalls = 0;
  const h = createHarness({
    library,
    handler: (req) => {
      if (req.kind === 'worker') {
        workerCalls += 1;
        return workerCalls === 1 ? { ...workerReply('A'), breakAfter: 5 } : workerReply('A');
      }
      leadCalls += 1;
      if (leadCalls === 1) return { content: [blk.text('Researching and showing it.'), blk.deploy('toolu_d', deployInput(1)), blk.hologram('toolu_h', fixture('battery'))], stop: 'tool_use' };
      return { content: [blk.text('Here is what the agent found.')], stop: 'end_turn' };
    },
  });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Research and show the AA battery', 'swarm');
  assert.equal(turn.status, 'interrupted');
  assert.equal(cards(turn)[0].status, 'done');
  assert.ok(conv.pending.results.toolu_h, 'the hologram result is in the checkpoint');
  const resumed = await h.jarvis.resumeTurn(conv).done;
  assert.equal(resumed.status, 'done');
  assert.equal(saves(library).length, 1, 'never saved twice');
  const results = trailingToolResults(h.api.requests.filter((r) => r.kind === 'lead').at(-1).body);
  assert.deepEqual(results.map((r) => r.tool_use_id), ['toolu_d', 'toolu_h']);
  assert.match(results[1].content, /Saved to the owner's library as lib_0000000001/);
});

test('a new message instead of Resume keeps the finished hologram\'s result in the history', async () => {
  const library = createFakeLibrary();
  let workerCalls = 0;
  let leadCalls = 0;
  const h = createHarness({
    library,
    handler: (req) => {
      if (req.kind === 'worker') {
        workerCalls += 1;
        return { ...workerReply('A'), breakAfter: 5 };
      }
      leadCalls += 1;
      if (leadCalls === 1) return { content: [blk.deploy('toolu_d2', deployInput(1)), blk.hologram('toolu_h2', fixture('battery'))], stop: 'tool_use' };
      return { content: [blk.text('ok')], stop: 'end_turn' };
    },
  });
  const conv = h.jarvis.newConversation();
  assert.equal((await runTurn(h.jarvis, conv, 'Research and show', 'swarm')).turn.status, 'interrupted');
  await runTurn(h.jarvis, conv, 'Forget the research');
  const closing = conv.apiMessages.find((m) => m.role === 'user' && m.content.some((b) => b.type === 'tool_result' && b.tool_use_id === 'toolu_h2'));
  const holo = closing.content.find((b) => b.tool_use_id === 'toolu_h2');
  assert.equal(holo.is_error, undefined);
  assert.match(holo.content, /^Hologram shown to the owner/);
  assert.equal(closing.content.find((b) => b.tool_use_id === 'toolu_d2').is_error, true);
});

test('a Blueprint request whose library never answers: the turn starts after the timeout, saying so', async () => {
  const library = createFakeLibrary();
  library.hang = 'get';
  let h;
  h = createHarness({ library, libraryTimeoutMs: 60, handler: () => (h.api.requests.length === 1 ? { content: [blk.blueprint('toolu_t', fixture('alternator-part'))], stop: 'tool_use' } : { content: [blk.text('ok')], stop: 'end_turn' }) });
  const started = Date.now();
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Blueprint: Alternator', 'auto', { blueprintFor: { model: 'lib_ab12cd34ef', part: 'alternator' } });
  assert.ok(Date.now() - started < 5000);
  assert.equal(turn.status, 'done');
  const ctx = h.api.requests[0].body.messages.at(-1).content[0].text;
  assert.match(ctx, /which could not be loaded/);
  assert.deepEqual(cards(turn)[0].for, { model: 'lib_ab12cd34ef', part: 'alternator' });
});

// ---- the strict mock ----------------------------------------------------------------------

function mockSetup(library = createFakeLibrary()) {
  const fetch = createMockFetch({ timeScale: 0.02 });
  const jarvis = createJarvis({
    getSettings: () => DEFAULT_TEST_SETTINGS,
    getApiKey: () => KEY,
    fetch,
    memory: createMemory(),
    library,
    persist: async (conv) => structuredClone(conv),
    clientOptions: { maxRetries: 0 },
    retryBaseMs: 20,
    workerStaggerMs: 5,
    maxRetryWaitMs: 200,
  });
  return { jarvis, mock: fetch.mock, library };
}

test('strict mock: open_saved for an item deleted after the list was built is an error the model hears', async () => {
  const library = createFakeLibrary([{ id: 'lib_gone000001', kind: 'hologram', title: 'Deleted Camry', stats: { parts: 43 } }]);
  library.get = (id) => {
    library.calls.push(['get', id]);
    return Promise.resolve(null); // deleted in another window meanwhile
  };
  const { jarvis, mock } = mockSetup(library);
  const conv = jarvis.newConversation();
  const t = await jarvis.startTurn(conv, { text: 'Open my Camry [[open-saved]]', mode: 'auto' }).done;
  assert.equal(t.status, 'done');
  assert.equal(cards(t).length, 0);
  assert.match(segmentsOf(t, 'text').map((s) => s.text).join(''), /couldn’t find that in your saved library/);
  const lead = mock.requests.filter((r) => r.kind === 'lead');
  const result = lead.at(-1).body.messages.at(-1).content[0];
  assert.equal(result.is_error, true);
  assert.match(result.content, /^No saved item has the id lib_gone000001\./);
  assert.deepEqual(mock.violations, []);
});

test('strict mock: two conversations building holograms at the same time save two items', async () => {
  const { jarvis, mock, library } = mockSetup();
  const a = jarvis.newConversation();
  const b = jarvis.newConversation();
  const [ta, tb] = await Promise.all([
    jarvis.startTurn(a, { text: 'Battery please [[hologram:battery]]', mode: 'auto' }).done,
    jarvis.startTurn(b, { text: 'Alternator please [[hologram:alternator]]', mode: 'auto' }).done,
  ]);
  assert.equal(ta.status, 'done');
  assert.equal(tb.status, 'done');
  const ids = [cards(ta)[0].libraryId, cards(tb)[0].libraryId];
  assert.ok(ids.every((id) => /^lib_/.test(id)) && ids[0] !== ids[1]);
  assert.deepEqual(saves(library).map((c) => c[1].conversationId).sort(), [a.id, b.id].sort());
  assert.deepEqual(mock.violations, []);
});

test('a library that answers garbage (or throws synchronously) never breaks a turn', async () => {
  const weird = {
    list: () => [null, 7, 'x', { id: 'lib_ok00000001', kind: 'hologram', title: { toString: () => 'evil' }, stats: { parts: 'many' } }, { id: 'lib_ok00000002', kind: 'blueprint', title: 'Sheet', parent: 'lib_x', sheet: '<b>' }],
    get: () => {
      throw new Error('sync throw');
    },
    findPartBlueprint: () => ({ id: 42 }),
    save: () => ({ id: 'not a library id' }),
  };
  let h;
  h = createHarness({ library: weird, handler: () => (h.api.requests.length === 1 ? { content: [blk.blueprint('toolu_w', fixture('alternator-part')), blk.openSaved('toolu_w2', 'lib_ok00000001')], stop: 'tool_use' } : { content: [blk.text('ok')], stop: 'end_turn' }) });
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Blueprint: Alternator', 'auto', { blueprintFor: { model: 'lib_ok00000001', part: 'alternator' } });
  assert.equal(turn.status, 'done');
  const ctx = h.api.requests[0].body.messages.at(-1).content[0].text;
  assert.match(ctx, /- lib_ok00000001 · hologram · "Untitled"\n- lib_ok00000002 · blueprint · "Sheet" \(part sheet\)\n/);
  assert.match(ctx, /which could not be loaded/);
  const [bp] = cards(turn);
  assert.equal(bp.status, 'done');
  assert.equal(bp.libraryId, null, 'an invalid id from the library is not trusted');
  const results = trailingToolResults(h.api.requests[1].body);
  assert.match(results[0].content, /could not be saved/);
  assert.equal(results[1].is_error, true);
});
