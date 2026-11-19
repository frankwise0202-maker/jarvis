// Holograms, blueprints and the saved library in the engine (lead tools version 4): live segments
// from the streamed tool input, the tool round (validate, save, tool_result), open_saved, the
// turn-context blocks, blueprintFor, Stop / cut streams, and byte-identical requests for older
// conversations. The real SDK talks to the scripted fake fetch of engine.support.test.mjs.
process.env.TZ = 'America/New_York'; // the pinned request bodies below include the local time

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { showedReply } from '../../src/engine/lead.js';
import { blueprintRequestText, hasVisualTools, visualExportLine } from '../../src/engine/index.js';
import {
  LEAD_SYSTEM_V1, LEAD_SYSTEM_V2, LEAD_SYSTEM_V3, SAVED_ITEMS_HEADING, leadToolsV1, leadToolsV2, leadToolsV3, leadToolsV4,
} from '../../src/engine/prompts.js';
import { normalizeHologramSpec } from '../../src/lib/hologram-spec.js';
import { normalizeBlueprintSpec } from '../../src/lib/blueprint-spec.js';
import { parsePartialJson } from '../../src/engine/util.js';
import { blk, createFakeLibrary, createHarness, runTurn, segmentsOf, trailingToolResults } from './engine.support.test.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../mock/fixtures/${name}.json`, import.meta.url), 'utf8'));
const FIXED_NOW = () => new Date('2026-11-19T21:35:00Z');
const hologramOf = (turn) => segmentsOf(turn, 'hologram');
const blueprintOf = (turn) => segmentsOf(turn, 'blueprint');
/** The <turn_context> of the newest owner message in a request body. */
const turnContextOf = (body) => body.messages.filter((m) => m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'text' && m.content[0].text.startsWith('<turn_context>')).at(-1).content[0].text;

/** The first request makes the tool call(s); every later one answers in a sentence. */
function toolThenAnswer(h, blocks, answer = 'There it is.') {
  return () => (h.api.requests.length === 1 ? { content: blocks, stop: 'tool_use' } : { content: [blk.text(answer)], stop: 'end_turn' });
}

/** Records a deep copy of every hologram / blueprint segment event. */
function snapshotter(kinds = ['hologram', 'blueprint']) {
  const snaps = [];
  return {
    snaps,
    onRun: (run) => run.on('segment', (e) => {
      if (kinds.includes(e.segment.kind)) snaps.push(structuredClone(e.segment));
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// show_hologram

test('show_hologram: the card builds live from the streamed input, then is validated, saved and answered', async () => {
  const input = fixture('battery');
  const library = createFakeLibrary();
  let h;
  h = createHarness({
    library,
    liveIntervalMs: 0,
    now: FIXED_NOW,
    // About 1 ms between stream events, so live updates do not depend on how loaded the machine is.
    handler: () => (h.api.requests.length === 1 ? { content: [blk.text('Here is the AA cell.'), blk.hologram('toolu_h1', input)], stop: 'tool_use', delayMs: 1 } : { content: [blk.text('There it is.')], stop: 'end_turn' }),
  });
  const conv = h.jarvis.newConversation();
  const spy = snapshotter();
  const { turn } = await runTurn(h.jarvis, conv, 'Show me an AA battery', 'auto', { onRun: spy.onRun });

  assert.equal(turn.status, 'done');
  const [seg] = hologramOf(turn);
  const final = normalizeHologramSpec(input);
  assert.deepEqual(Object.keys(seg).sort(), ['fromLibrary', 'id', 'kind', 'libraryId', 'req', 'spec', 'stats', 'status', 'subtitle', 'title', 'toolUseId', 'warnings']);
  assert.equal(seg.status, 'done');
  assert.equal(seg.req, 0);
  assert.equal(seg.toolUseId, 'toolu_h1');
  assert.equal(seg.title, 'AA alkaline battery (LR6)');
  assert.equal(seg.subtitle, final.spec.subtitle);
  assert.deepEqual(seg.spec, final.spec);
  assert.deepEqual(seg.stats, { parts: 9, shapes: 10 });
  assert.deepEqual(seg.warnings, []);
  assert.equal(seg.libraryId, 'lib_0000000001');
  assert.equal(seg.fromLibrary, false);
  assert.equal(showedReply(turn), true);

  // Live: created at the block's start (empty, building), then growing; shown shapes never change.
  const live = spy.snaps.filter((s) => s.id === seg.id);
  assert.equal(live[0].status, 'building');
  assert.equal(live[0].spec.parts.length, 0);
  assert.ok(live.length >= 8, `${live.length} live updates`);
  let parts = 0;
  for (const snap of live.slice(0, -1)) {
    assert.equal(snap.status, 'building');
    assert.ok(snap.spec.parts.length >= parts, 'parts never disappear');
    parts = snap.spec.parts.length;
    assert.equal(snap.stats.parts, snap.spec.parts.length);
    for (const p of snap.spec.parts) {
      const done = final.spec.parts.find((q) => q.key === p.key);
      assert.deepEqual(p.shapes, done.shapes.slice(0, p.shapes.length), `${p.key}: only final shapes are shown`);
    }
  }
  assert.ok(new Set(live.map((s) => s.stats.parts)).size >= 5, 'the part count grows visibly');
  assert.equal(live.at(-1).status, 'done');

  // Saved once, with the turn's cost so far; the tool_result says where.
  const saves = library.calls.filter((c) => c[0] === 'save');
  assert.equal(saves.length, 1);
  const record = saves[0][1];
  assert.deepEqual(Object.keys(record).sort(), ['conversationId', 'costUsd', 'kind', 'parent', 'partName', 'segmentId', 'spec', 'stats', 'subject', 'title', 'turnId']);
  assert.equal(record.kind, 'hologram');
  assert.equal(record.title, 'AA alkaline battery (LR6)');
  assert.equal(record.subject, final.spec.subtitle);
  assert.deepEqual(record.spec, final.spec);
  assert.deepEqual(record.stats, { parts: 9, shapes: 10 });
  assert.equal(record.conversationId, conv.id);
  assert.equal(record.turnId, turn.id);
  assert.equal(record.segmentId, seg.id);
  assert.equal(record.parent, null);
  assert.equal(record.partName, null);
  assert.ok(record.costUsd > 0);
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.equal(result.tool_use_id, 'toolu_h1');
  assert.equal(result.is_error, undefined);
  assert.match(result.content, /^Hologram shown to the owner: "AA alkaline battery \(LR6\)" with 9 labeled parts \(10 shapes\)\./);
  assert.match(result.content, /Saved to the owner's library as lib_0000000001 \(reopen it later with open_saved\)\./);
  // History: the assistant message exactly as streamed, then the tool_result.
  assert.deepEqual(conv.apiMessages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.deepEqual(conv.apiMessages[1].content.at(-1).input, input);
  // Persisted with the card.
  assert.equal(h.persisted.at(-1).turns.at(-1).segments.find((s) => s.kind === 'hologram').libraryId, 'lib_0000000001');

  // The next turn's context lists it.
  await runTurn(h.jarvis, conv, 'Thanks');
  const ctx = turnContextOf(h.api.requests[2].body);
  assert.match(ctx, new RegExp(`${SAVED_ITEMS_HEADING.replace(/[()]/g, '\\$&')}\\n- lib_0000000001 · hologram · "AA alkaline battery \\(LR6\\)" \\(9 parts\\)\\n</turn_context>$`));
});

test('show_hologram: an input with problems is still shown and saved; the tool_result lists the problems', async () => {
  const input = fixture('battery');
  input.parts[0].shapes.push({ type: 'warp-drive' });
  input.parts[1].tone = 'neon';
  const library = createFakeLibrary();
  let h;
  h = createHarness({ library, handler: (req) => toolThenAnswer(h, [blk.hologram('toolu_h2', input)])(req) });
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Show me the battery');
  const [seg] = hologramOf(turn);
  assert.equal(seg.status, 'done');
  assert.equal(seg.warnings.length, 2);
  assert.match(seg.warnings.join('\n'), /unknown type "warp-drive"/);
  assert.equal(seg.libraryId, 'lib_0000000001');
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.equal(result.is_error, undefined);
  assert.match(result.content, /2 problems \(the rest was shown\):\n- .*warp-drive[\s\S]*neon/);
});

test('show_hologram: an input with nothing to show is an error card and an is_error tool_result; nothing is saved', async () => {
  const library = createFakeLibrary();
  let h;
  const bad = { title: 'Nothing', parts: [{ id: 'x', name: 'X', info: 'i', shapes: [{ type: 'warp' }, { type: 'box', size: [0, 1, 1] }] }] };
  h = createHarness({ library, handler: (req) => toolThenAnswer(h, [blk.hologram('toolu_bad', bad)], 'I could not build it.')(req) });
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Show me nothing');
  assert.equal(turn.status, 'done');
  const [seg] = hologramOf(turn);
  assert.equal(seg.status, 'error');
  assert.equal(seg.libraryId, null);
  assert.match(seg.warnings[0], /Nothing to show/);
  assert.ok(seg.warnings.some((w) => /unknown type "warp"/.test(w)));
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.equal(result.is_error, true);
  assert.match(result.content, /^The hologram could not be shown\.\nNothing to show[\s\S]*Fix the input and call show_hologram again\.$/);
  assert.equal(library.calls.filter((c) => c[0] === 'save').length, 0);
  assert.equal(visualExportLine(seg), '[Hologram: Nothing · not finished]');
});

test('show_hologram: invalid JSON input is an error card and the prescribed INVALID_JSON result', async () => {
  let h;
  // Truncated input the SDK's tolerant parser accepts: strictly invalid, so never shown as done.
  const raw = '{"title":"Broken","parts":[{"id":"a","name":"A","shapes":[{"type":"box","size":[1,1,1]}]}';
  h = createHarness({ library: createFakeLibrary(), handler: (req) => toolThenAnswer(h, [blk.hologram('toolu_json', {}, raw)])(req) });
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Show it');
  const [seg] = hologramOf(turn);
  assert.equal(seg.status, 'error');
  assert.deepEqual(seg.warnings, ['The input was not valid JSON.']);
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.equal(result.is_error, true);
  assert.deepEqual(JSON.parse(result.content), { INVALID_JSON: raw });
});

test('show_hologram: no library, a failing save and a save that never answers are all survivable', async () => {
  for (const variant of ['none', 'fail', 'hang']) {
    const library = variant === 'none' ? undefined : createFakeLibrary();
    if (library) library[variant] = 'save';
    let h;
    h = createHarness({ library, libraryTimeoutMs: 40, handler: (req) => toolThenAnswer(h, [blk.hologram('toolu_s', fixture('battery'))])(req) });
    const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Show me the battery');
    assert.equal(turn.status, 'done', variant);
    const [seg] = hologramOf(turn);
    assert.equal(seg.status, 'done', variant);
    assert.equal(seg.libraryId, null, variant);
    const [result] = trailingToolResults(h.api.requests[1].body);
    assert.equal(result.is_error, undefined, variant);
    if (variant === 'none') assert.doesNotMatch(result.content, /library/, 'nothing is said about a library the app does not have');
    else assert.match(result.content, /It could not be saved to the owner's library this time\./, variant);
  }
});

test('Stop while a hologram streams: the card keeps what was built as an error, nothing is saved, the message stays', async () => {
  const library = createFakeLibrary();
  let h;
  h = createHarness({
    library,
    liveIntervalMs: 0,
    handler: () => (h.api.requests.length === 1
      ? { content: [blk.text('Building the Camry now.'), blk.hologram('toolu_stop', fixture('camry'))], stop: 'tool_use', delayMs: 1 }
      : { content: [blk.text('Next answer.')], stop: 'end_turn' }),
  });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Show me the Camry', 'auto', {
    onRun: (run) => run.on('segment', (e) => {
      if (e.segment.kind === 'hologram' && e.segment.stats.parts >= 4) run.abort();
    }),
  });
  assert.equal(turn.status, 'stopped');
  const [seg] = hologramOf(turn);
  assert.equal(seg.status, 'error');
  assert.ok(seg.spec.parts.length >= 4 && seg.spec.parts.length < 43, `${seg.spec.parts.length} parts were built`);
  assert.equal(seg.libraryId, null);
  assert.equal(library.calls.filter((c) => c[0] === 'save').length, 0);
  assert.equal(turn.withdrawn, undefined, 'the card was on screen: the message is kept');
  assert.deepEqual(conv.apiMessages.map((m) => m.role), ['user', 'assistant']);
  assert.deepEqual(conv.apiMessages[1].content, [{ type: 'text', text: 'Building the Camry now.' }]);
  assert.equal(conv.pending, null);
  // A new turn after the Stop starts from a valid history.
  const next = await runTurn(h.jarvis, conv, 'Never mind, what time is it?');
  assert.equal(next.turn.status, 'done');
  assert.deepEqual(h.api.requests.at(-1).body.messages.map((m) => m.role), ['user', 'assistant', 'user']);
});

test('Stop while only the hologram card shows (no text yet): still kept (the card counts as a reply)', async () => {
  let h;
  h = createHarness({
    liveIntervalMs: 0,
    handler: () => ({ content: [blk.hologram('toolu_only', fixture('camry'))], stop: 'tool_use', delayMs: 1 }),
  });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Show me the Camry', 'auto', {
    onRun: (run) => run.on('segment', (e) => {
      if (e.segment.kind === 'hologram' && e.segment.stats.parts >= 2) run.abort();
    }),
  });
  assert.equal(turn.status, 'stopped');
  assert.equal(turn.withdrawn, undefined);
  assert.deepEqual(conv.apiMessages.map((m) => m.role), ['user'], 'nothing was appended for the cut stream');
});

test('a stream cut mid-input: the card turns error, the turn can resume, the hologram is rebuilt and saved once', async () => {
  const library = createFakeLibrary();
  let h;
  let leads = 0;
  h = createHarness({
    library,
    liveIntervalMs: 0,
    handler: () => {
      leads += 1;
      if (leads === 1) return { content: [blk.text('Building.'), blk.hologram('toolu_cut', fixture('battery'))], stop: 'tool_use', breakAfter: 300 };
      // (No delays: the card must still show everything that arrived before the cut.)
      if (leads === 2) return { content: [blk.text('Building again.'), blk.hologram('toolu_cut2', fixture('battery'))], stop: 'tool_use' };
      return { content: [blk.text('Done.')], stop: 'end_turn' };
    },
  });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Show me the battery');
  assert.equal(turn.status, 'interrupted');
  const [cut] = hologramOf(turn);
  assert.equal(cut.status, 'error');
  // Everything that arrived is shown: the stable prefix of the input streamed before the cut.
  // 300 events reach the client: 6 before the tool input (message_start, ping, the text block's
  // 3 events, the tool block's start), then 294 input deltas of 7 characters.
  const sent = JSON.stringify(fixture('battery')).slice(0, 7 * (300 - 6));
  const expected = normalizeHologramSpec(parsePartialJson(sent), { partial: true }).spec;
  assert.ok(expected.parts.length >= 1);
  assert.deepEqual(cut.spec, expected, 'the card shows exactly what arrived (the throttle held nothing back)');
  assert.equal(h.jarvis.canResume(conv), true);
  const events = [];
  const run = h.jarvis.resumeTurn(conv);
  run.on('*', (e) => events.push(e));
  const resumed = await run.done;
  assert.equal(resumed.status, 'done');
  assert.ok(events.some((e) => e.type === 'segment-removed' && e.segmentId === cut.id), 'the cut card is removed before the retry');
  const cards = hologramOf(resumed);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].status, 'done');
  assert.equal(cards[0].toolUseId, 'toolu_cut2');
  assert.equal(library.calls.filter((c) => c[0] === 'save').length, 1);
});

test('a tool call cut off by max_tokens never runs: the card turns error and the call is answered', async () => {
  let h;
  h = createHarness({
    library: createFakeLibrary(),
    handler: () => (h.api.requests.length === 1
      ? { content: [blk.text('Building.'), blk.hologram('toolu_max', fixture('battery'))], stop: 'max_tokens' }
      : { content: [blk.text('ok')], stop: 'end_turn' }),
  });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Show me');
  assert.equal(turn.status, 'done');
  const [seg] = hologramOf(turn);
  assert.equal(seg.status, 'error');
  assert.deepEqual(seg.warnings, ['The reply ended before this was complete.']);
  assert.equal(seg.libraryId, null);
  assert.deepEqual(conv.apiMessages.at(-1).content, [{ type: 'tool_result', tool_use_id: 'toolu_max', content: 'Not run: the reply ended before this tool call was complete.', is_error: true }]);
  assert.ok(segmentsOf(turn, 'notice').some((s) => /length limit/.test(s.text)));
});

test('a refused reply: the half-built card turns error and the turn leaves the history', async () => {
  let h;
  h = createHarness({
    handler: () => ({ content: [blk.hologram('toolu_ref', fixture('battery'))], stop: 'refusal', stopDetails: { type: 'refusal', category: 'cyber' } }),
  });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Show me');
  assert.equal(turn.status, 'error');
  assert.equal(turn.error.kind, 'refusal');
  assert.equal(hologramOf(turn)[0].status, 'error');
  assert.deepEqual(conv.apiMessages, []);
});

test('older conversations: a show_hologram call they cannot have is answered "Unknown tool" and shows nothing', async () => {
  let h;
  h = createHarness({ library: createFakeLibrary(), handler: (req) => toolThenAnswer(h, [blk.hologram('toolu_old', fixture('battery'))])(req) });
  const conv = h.jarvis.newConversation();
  conv.system = LEAD_SYSTEM_V2;
  conv.tools = leadToolsV3();
  const { turn } = await runTurn(h.jarvis, conv, 'Show me');
  assert.equal(hologramOf(turn).length, 0);
  assert.equal(showedReply(turn), true, 'only because of the text answer');
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.deepEqual(result, { type: 'tool_result', tool_use_id: 'toolu_old', content: 'Unknown tool "show_hologram". Use only the tools you were given.', is_error: true });
});

// ---------------------------------------------------------------------------------------------
// draw_blueprint and blueprintFor

function camryLibrary() {
  const library = createFakeLibrary();
  const spec = normalizeHologramSpec(fixture('camry')).spec;
  library.add({ id: 'lib_camry00001', kind: 'hologram', title: spec.title, subject: spec.subtitle, spec, stats: { parts: 43, shapes: 127 } });
  return { library, spec };
}

test('blueprintFor: the turn context carries the Blueprint request; the sheet is linked to that part and saved', async () => {
  const { library } = camryLibrary();
  const sheet = fixture('alternator-part');
  let h;
  h = createHarness({ library, now: FIXED_NOW, handler: (req) => toolThenAnswer(h, [blk.text('Drawing it.'), blk.blueprint('toolu_bp', { ...sheet, for: { model: 'lib_camry00001', part: 'wrong-part' } })])(req) });
  const conv = h.jarvis.newConversation();
  const spy = snapshotter();
  const { turn } = await runTurn(h.jarvis, conv, 'Blueprint: DC-DC converter (2024 Toyota Camry Hybrid (XV70))', 'auto', {
    blueprintFor: { model: 'lib_camry00001', part: 'dcdc-converter' },
    onRun: spy.onRun,
  });
  assert.equal(turn.status, 'done');
  assert.deepEqual(turn.blueprintFor, { model: 'lib_camry00001', part: 'dcdc-converter' });
  const ctx = turnContextOf(h.api.requests[0].body);
  assert.match(ctx, /\nBlueprint request \(the owner asked for this 2D blueprint\):\n- Target: part "DC-DC converter" \(id: dcdc-converter\) of the saved hologram lib_camry00001, "2024 Toyota Camry Hybrid \(XV70\)"\n/);
  assert.match(ctx, /\n- Part details: group: [^;\n]+; material: [^;\n]+; size: about 170 × 70 × 200 mm \(length × height × width\)\n/);
  assert.match(ctx, /\n- About the part: .*alternator/i);
  assert.match(ctx, /\n- Call draw_blueprint exactly once for this target, with "for": \{"model":"lib_camry00001","part":"dcdc-converter"\}\. Do not rebuild the hologram\. Research specifics only if needed \(one or two quick searches\)\.\n<\/turn_context>$/);
  assert.match(ctx, /Saved holograms and blueprints \(reopen with open_saved instead of rebuilding\):\n- lib_camry00001 · hologram · "2024 Toyota Camry Hybrid \(XV70\)" \(43 parts\)\n/);
  // The owner's own text is unchanged, after the turn context.
  assert.equal(h.api.requests[0].body.messages.at(-1).content[1].text, 'Blueprint: DC-DC converter (2024 Toyota Camry Hybrid (XV70))');

  const [seg] = blueprintOf(turn);
  assert.deepEqual(Object.keys(seg).sort(), ['for', 'fromLibrary', 'id', 'kind', 'libraryId', 'req', 'sheet', 'spec', 'stats', 'status', 'subject', 'title', 'toolUseId', 'warnings']);
  assert.equal(seg.status, 'done');
  assert.equal(seg.title, 'Alternator');
  assert.equal(seg.sheet, 'part');
  assert.deepEqual(seg.for, { model: 'lib_camry00001', part: 'dcdc-converter' }, 'the turn\'s own request wins over the spec\'s claim');
  assert.deepEqual(seg.spec.for, { model: 'lib_camry00001', part: 'dcdc-converter' });
  assert.equal(seg.stats.parts, 18);
  assert.equal(seg.libraryId, 'lib_0000000001');
  assert.ok(spy.snaps.length >= 2 && spy.snaps[0].status === 'building');
  const save = library.calls.find((c) => c[0] === 'save')[1];
  assert.equal(save.kind, 'blueprint');
  assert.deepEqual(save.parent, { model: 'lib_camry00001', part: 'dcdc-converter' });
  assert.equal(save.partName, 'DC-DC converter');
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.match(result.content, /^Blueprint drawn: "Alternator" \(part sheet, 2 views, \d+ shapes, 21 callouts, 18 parts, 4 dimensions\)\. The owner can see it now\. Saved to the owner's library as lib_0000000001/);
  assert.equal(visualExportLine(seg), '[Blueprint: Alternator · part sheet · 18 parts]');
});

test('blueprintFor the whole object, an existing blueprint, and a hologram that is gone', async () => {
  const { library, spec } = camryLibrary();
  library.add({ id: 'lib_oldsheet01', kind: 'blueprint', title: 'Old', spec: normalizeBlueprintSpec(fixture('camry-assembly')).spec, parent: { model: 'lib_camry00001', part: null } });
  let h;
  h = createHarness({ library, handler: (req) => toolThenAnswer(h, [blk.blueprint('toolu_whole', fixture('camry-assembly'))])(req) });
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, blueprintRequestText(spec), 'auto', { blueprintFor: { model: 'lib_camry00001', part: null } });
  const ctx = turnContextOf(h.api.requests[0].body);
  assert.match(ctx, /- Target: the whole object, the saved hologram lib_camry00001, "2024 Toyota Camry Hybrid \(XV70\)"\n- Object details: Front-wheel drive [^\n]*; 43 parts; about [\d,]+ × [\d,]+ × [\d,]+ mm \(length × height × width\)\n- A blueprint of this target is already saved as lib_oldsheet01; the owner asked for a new one\.\n- Call draw_blueprint exactly once for this target, with "for": \{"model":"lib_camry00001"\}\./);
  assert.match(ctx, /- lib_oldsheet01 · blueprint · "Old" \(part sheet, for lib_camry00001\)/);
  const [seg] = blueprintOf(turn);
  assert.deepEqual(seg.for, { model: 'lib_camry00001', part: null });
  assert.deepEqual(seg.spec.for, { model: 'lib_camry00001' });
  assert.deepEqual(library.calls.find((c) => c[0] === 'save')[1].parent, { model: 'lib_camry00001', part: null });

  // The hologram was deleted meanwhile: the request still goes out, saying so.
  const gone = createFakeLibrary();
  let h2;
  h2 = createHarness({ library: gone, handler: (req) => toolThenAnswer(h2, [blk.blueprint('toolu_gone', fixture('alternator-part'))])(req) });
  const { turn: t2 } = await runTurn(h2.jarvis, h2.jarvis.newConversation(), 'Blueprint: Alternator', 'auto', { blueprintFor: { model: 'lib_deleted001', part: 'alternator' } });
  const ctx2 = turnContextOf(h2.api.requests[0].body);
  assert.match(ctx2, /- Target: part "alternator" of the saved hologram lib_deleted001, which could not be loaded \(draw it from the conversation and what you know\)\n/);
  assert.equal(t2.status, 'done');
  assert.deepEqual(blueprintOf(t2)[0].for, { model: 'lib_deleted001', part: 'alternator' }, 'the owner asked for that part: the link stays');
});

test('a spec "for" claim without a request links only to a hologram and part that exist', async () => {
  const { library } = camryLibrary();
  const cases = [
    [{ model: 'lib_camry00001', part: 'dcdc-converter' }, { model: 'lib_camry00001', part: 'dcdc-converter' }],
    [{ model: 'lib_camry00001', part: 'flux-capacitor' }, null],
    [{ model: 'lib_nothere0001', part: 'alternator' }, null],
    [{ model: 'lib_camry00001' }, { model: 'lib_camry00001', part: null }],
  ];
  for (const [claim, expected] of cases) {
    let h;
    h = createHarness({ library, handler: (req) => toolThenAnswer(h, [blk.blueprint('toolu_claim', { ...fixture('alternator-part'), for: claim })])(req) });
    const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Draw the alternator blueprint');
    const [seg] = blueprintOf(turn);
    assert.deepEqual(seg.for, expected, JSON.stringify(claim));
    assert.deepEqual(seg.spec.for, expected ? (expected.part ? expected : { model: expected.model }) : undefined);
  }
});

test('draw_blueprint: an empty sheet is an error card with an is_error result; nothing saved', async () => {
  const library = createFakeLibrary();
  let h;
  h = createHarness({ library, handler: (req) => toolThenAnswer(h, [blk.blueprint('toolu_empty', { title: 'Nothing', sheet: 'part' })])(req) });
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Draw nothing');
  const [seg] = blueprintOf(turn);
  assert.equal(seg.status, 'error');
  assert.match(seg.warnings[0], /Nothing to draw/);
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.equal(result.is_error, true);
  assert.match(result.content, /^The blueprint could not be drawn\. Nothing to draw/);
  assert.equal(library.calls.filter((c) => c[0] === 'save').length, 0);
});

test('startTurn: blueprintFor is validated, needs a conversation with the version 4 tools, and is kept on the turn', () => {
  const h = createHarness({ handler: () => ({ content: [blk.text('ok')], stop: 'end_turn' }) });
  const conv = h.jarvis.newConversation();
  for (const bad of [{ model: 'x' }, { model: 'lib_ab12cd34ef', part: 'Bad Part' }, 'lib_ab12cd34ef', { part: 'a' }, { model: 'lib_ab12cd34ef', part: 7 }]) {
    assert.throws(() => h.jarvis.startTurn(conv, { text: 'Blueprint', blueprintFor: bad }), TypeError, JSON.stringify(bad));
  }
  assert.deepEqual(conv.apiMessages, [], 'nothing was appended');
  const old = h.jarvis.newConversation();
  old.system = LEAD_SYSTEM_V2;
  old.tools = leadToolsV3();
  assert.throws(() => h.jarvis.startTurn(old, { text: 'Blueprint', blueprintFor: { model: 'lib_ab12cd34ef', part: null } }), /started before Jarvis could draw blueprints/);
  assert.deepEqual(old.apiMessages, []);
  assert.equal(hasVisualTools(conv), true);
  assert.equal(hasVisualTools(old), false);
  const run = h.jarvis.startTurn(conv, { text: 'Blueprint', blueprintFor: { model: 'lib_ab12cd34ef', part: '' } });
  assert.deepEqual(run.turn.blueprintFor, { model: 'lib_ab12cd34ef', part: null });
  return run.done;
});

// ---------------------------------------------------------------------------------------------
// open_saved and the saved-items block

test('open_saved: a saved item opens as a card from the library; unknown, malformed and damaged ids are errors', async () => {
  const { library, spec } = camryLibrary();
  const sheet = normalizeBlueprintSpec(fixture('battery-process')).spec;
  library.add({ id: 'lib_process001', kind: 'blueprint', title: sheet.title, spec: sheet, parent: null });
  library.add({ id: 'lib_damaged001', kind: 'hologram', title: 'Damaged', spec: { title: 'x', parts: [] } });
  const uses = [blk.openSaved('toolu_o1', 'lib_camry00001'), blk.openSaved('toolu_o2', 'lib_process001'), blk.openSaved('toolu_o3', 'lib_missing001'), blk.openSaved('toolu_o4', '../../etc'), blk.openSaved('toolu_o5', 'lib_damaged001')];
  let h;
  h = createHarness({ library, handler: (req) => toolThenAnswer(h, uses)(req) });
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Open my saved Camry');
  const cards = turn.segments.filter((s) => s.kind === 'hologram' || s.kind === 'blueprint');
  assert.equal(cards.length, 2);
  const [holo, bp] = cards;
  assert.equal(holo.kind, 'hologram');
  assert.equal(holo.fromLibrary, true);
  assert.equal(holo.status, 'done');
  assert.equal(holo.libraryId, 'lib_camry00001');
  assert.equal(holo.toolUseId, 'toolu_o1');
  assert.deepEqual(holo.spec, spec);
  assert.deepEqual(holo.stats, { parts: 43, shapes: 127 });
  assert.equal(bp.kind, 'blueprint');
  assert.equal(bp.fromLibrary, true);
  assert.equal(bp.sheet, 'process');
  assert.equal(bp.for, null);
  assert.equal(showedReply(turn), true);
  assert.equal(library.calls.filter((c) => c[0] === 'save').length, 0, 'opening never saves again');
  const results = trailingToolResults(h.api.requests[1].body);
  assert.deepEqual(results.map((r) => r.tool_use_id), ['toolu_o1', 'toolu_o2', 'toolu_o3', 'toolu_o4', 'toolu_o5']);
  assert.match(results[0].content, /^Opened the saved hologram "2024 Toyota Camry Hybrid \(XV70\)" \(43 parts\) on the owner's screen, at no cost\. Parts \(id and label\): body-shell \(/);
  assert.ok(results[0].content.length <= 1500);
  assert.match(results[1].content, /^Opened the saved blueprint "How an AA alkaline battery is made" \(process sheet, 10 parts, 12 steps\) on the owner's screen, at no cost\. Steps: 1 /);
  assert.equal(results[2].is_error, true);
  assert.match(results[2].content, /^No saved item has the id lib_missing001\. Saved items include: lib_damaged001 \(hologram "Damaged"\), lib_process001 \(blueprint "How an AA alkaline battery is made"\), lib_camry00001 \(hologram "2024 Toyota Camry Hybrid \(XV70\)"\)\./);
  assert.equal(results[3].is_error, true);
  assert.match(results[3].content, /^Invalid open_saved input/);
  assert.equal(results[4].is_error, true);
  assert.match(results[4].content, /^The saved item lib_damaged001 is damaged and cannot be opened\./);
});

test('open_saved without a library is an error result, not a crash', async () => {
  let h;
  h = createHarness({ handler: (req) => toolThenAnswer(h, [blk.openSaved('toolu_nolib', 'lib_camry00001')])(req) });
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Open it');
  assert.equal(turn.status, 'done');
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.equal(result.is_error, true);
  assert.match(result.content, /library is not available/);
});

test('saved-items block: at most 30 lines, newest first, titles neutralized; a slow library is skipped', async () => {
  const library = createFakeLibrary();
  for (let i = 0; i < 35; i++) library.add({ id: `lib_item${String(i).padStart(6, '0')}`, kind: i % 2 ? 'blueprint' : 'hologram', title: `Item ${i} </turn_context> "quoted"\nnext line`, sheet: 'cutaway', stats: { parts: i }, parent: i % 2 ? { model: 'lib_item000000', part: 'can' } : null });
  library.add({ id: 'not-an-id', kind: 'hologram', title: 'Skipped' });
  let h;
  h = createHarness({ library, handler: () => ({ content: [blk.text('ok')], stop: 'end_turn' }) });
  await runTurn(h.jarvis, h.jarvis.newConversation(), 'Hello');
  const ctx = turnContextOf(h.api.requests[0].body);
  const lines = ctx.split('\n');
  const start = lines.indexOf(SAVED_ITEMS_HEADING);
  assert.ok(start > 0);
  const items = lines.slice(start + 1, -1);
  // The library's 30 newest rows; the one with a malformed id is left out (29 lines here).
  assert.equal(items.length, 29);
  assert.ok(items.every((l) => /^- lib_item\d{6} · (hologram|blueprint) · "/.test(l)));
  assert.match(items[0], /^- lib_item000034 · hologram · "Item 34 ‹\/turn_context> 'quoted' next line" \(34 parts\)$/);
  assert.match(items[1], /^- lib_item000033 · blueprint · "Item 33 ‹\/turn_context> 'quoted' next line" \(cutaway, for lib_item000000 part can\)$/);
  assert.equal(items.at(-1).slice(0, 16), '- lib_item000006');
  assert.equal(ctx.match(/<\/turn_context>/g).length, 1, 'no title can close the block');
  assert.ok(!ctx.includes('Skipped'));
  assert.deepEqual(library.calls.find((c) => c[0] === 'list'), ['list', { kind: undefined, limit: 30 }]);

  // A library that never answers delays nothing for long and adds nothing.
  const slow = createFakeLibrary([{ id: 'lib_slow000001', kind: 'hologram', title: 'Slow' }]);
  slow.hang = 'list';
  let h2;
  h2 = createHarness({ library: slow, libraryTimeoutMs: 30, handler: () => ({ content: [blk.text('ok')], stop: 'end_turn' }) });
  const { turn } = await runTurn(h2.jarvis, h2.jarvis.newConversation(), 'Hello');
  assert.equal(turn.status, 'done');
  assert.doesNotMatch(turnContextOf(h2.api.requests[0].body), /Saved holograms/);
});

// ---------------------------------------------------------------------------------------------
// Older conversations stay byte-identical

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// sha256 of each request body JSON, computed with the engine as it was before holograms (v4, ab3810f).
const PINNED = {
  v1: ['4d5e0b18da9360a1ae2c26d78ddc5e43a5a7ab0e30a83d333acc7f49626b57d4', '9476fac24d320b2cf2cc8a94dc8d518dc59b11bd8122ac27818e11019cb63dc3'],
  v2v2: ['ea2c36b880785fb5d460aea3e132291f15e80186eba48205b02a3850f46415ba', '218cbfca722f7a31778855a91a3d2e36952f02e1ffb32588412b4f0e10c5f3b2'],
  v2v3: ['0e9779bd1659daf5a92bd652158ce58a0be07fc39993211c59274ade12f32357', 'ab6947e3d245c31aee3cdf47724380ed317b98fab0e80e55bb51ad4f669c97ac'],
};

test('older conversations send byte-identical requests (pinned), even with a full saved library', async () => {
  const library = createFakeLibrary([
    { id: 'lib_ab12cd34ef', kind: 'hologram', title: 'Camry', stats: { parts: 43 } },
    { id: 'lib_bb12cd34ef', kind: 'blueprint', title: 'Alternator', sheet: 'part', parent: { model: 'lib_ab12cd34ef', part: 'alternator' } },
  ]);
  for (const [label, system, tools] of [['v1', LEAD_SYSTEM_V1, leadToolsV1()], ['v2v2', LEAD_SYSTEM_V2, leadToolsV2()], ['v2v3', LEAD_SYSTEM_V2, leadToolsV3()]]) {
    const h = createHarness({
      library,
      handler: (req) => ({ content: [{ type: 'thinking', thinking: `Thinking ${req.index}`, signature: `sigfixed${req.index}` }, { type: 'text', text: `Answer ${req.index}` }], stop: 'end_turn' }),
      now: FIXED_NOW,
      settings: { userName: 'Tony', location: 'Austin, Texas, US' },
    });
    const conv = h.jarvis.newConversation();
    conv.system = system;
    conv.tools = tools;
    await h.jarvis.startTurn(conv, { text: 'Show me a 2024 Toyota Camry hologram', mode: 'auto' }).done;
    await h.jarvis.startTurn(conv, { text: 'And the alternator blueprint please', mode: 'auto' }).done;
    assert.deepEqual(h.api.requests.map((r) => sha(JSON.stringify(r.body))), PINNED[label], label);
    for (const r of h.api.requests) assert.doesNotMatch(turnContextOf(r.body), /Saved holograms|Blueprint request/);
  }
  // The shipped versions themselves (sha256 of their JSON / text) never change.
  assert.equal(sha(LEAD_SYSTEM_V1), '64cae163ccc3813d87162893c484b9daa970981d45ccc1245bf88f1ff79b23ef');
  assert.equal(sha(LEAD_SYSTEM_V2), '264ac70a8bd41f548d536db778df0b4e315b0785455bfeb93f55181b3ef68bc0');
  assert.equal(sha(JSON.stringify(leadToolsV1())), '1e441fd51e0e6df7238adab762ce0a2c5a56f4df5f82cc25bde40e4bf395f932');
  assert.equal(sha(JSON.stringify(leadToolsV2())), '939eaacb2c2dc9fb69e772df4b12700b577539b09f9c52a99ec41bbce1dc76a7');
  assert.equal(sha(JSON.stringify(leadToolsV3())), 'c837163eb2264fda141d92eb1f74285bf33d5f242dd357af45d864afdf6e1af0');
});

test('new conversations freeze V3 + V4; the V3 section is V2 plus the holograms section, nothing else', () => {
  const h = createHarness({ handler: () => null });
  const conv = h.jarvis.newConversation();
  assert.equal(conv.system, LEAD_SYSTEM_V3);
  assert.deepEqual(conv.tools, leadToolsV4());
  const section = LEAD_SYSTEM_V3.slice(LEAD_SYSTEM_V3.indexOf('# Holograms and blueprints'), LEAD_SYSTEM_V3.indexOf('\n\n# Writing the answer'));
  assert.equal(LEAD_SYSTEM_V3.replace(`${section}\n\n`, ''), LEAD_SYSTEM_V2);
  for (const needle of ['hologram always comes first', 'only when the owner asks', 'research it first', 'deploy agents first', 'label every part', 'open_saved', '"Blueprint request"', 'exactly once', 'one or two sentences']) {
    assert.ok(section.includes(needle), needle);
  }
  assert.ok(section.length < 1500, `the section stays tight (${section.length} characters)`);
  const tools = leadToolsV4();
  assert.equal(tools.length, 7);
  assert.deepEqual(tools.find((t) => t.name === 'open_saved'), {
    name: 'open_saved',
    description: tools.find((t) => t.name === 'open_saved').description,
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'The id of a saved item from <turn_context>, e.g. "lib_ab12cd34ef".' } }, required: ['id'] },
    eager_input_streaming: true,
  });
  assert.match(tools.find((t) => t.name === 'open_saved').description, /^Reopen a saved hologram or blueprint from the owner's library instead of rebuilding it\./);
  // Pinned so a shipped version can never drift: changing a prompt or a tool definition (the
  // hologram and blueprint tools included) needs a new version, never an edit (SPEC §8.3).
  assert.equal(sha(LEAD_SYSTEM_V3), '2bef0a8ae60c28271f8c79f375859ed088f962f1c5381c4ad3365d5755c3a98a');
  assert.equal(sha(JSON.stringify(leadToolsV4())), '2e55ba18c5d9c982e2937f5c79b43b91a3f9384bf1c6d4d54ca8c32a270f1ce8');
});

// ---------------------------------------------------------------------------------------------
// Helpers for the UI

test('visualExportLine and blueprintRequestText', () => {
  const spec = normalizeHologramSpec(fixture('camry')).spec;
  assert.equal(visualExportLine({ kind: 'hologram', status: 'done', title: '2024 Toyota Camry Hybrid', stats: { parts: 43 } }), '[Hologram: 2024 Toyota Camry Hybrid · 43 parts]');
  assert.equal(visualExportLine({ kind: 'hologram', status: 'done', title: 'One', stats: { parts: 1 } }), '[Hologram: One · 1 part]');
  assert.equal(visualExportLine({ kind: 'hologram', status: 'building', title: '', spec: { title: '' } }), '[Hologram: Untitled · building]');
  assert.equal(visualExportLine({ kind: 'hologram', status: 'done', title: 'A [b]\nc', stats: { parts: 2 } }), '[Hologram: A (b) c · 2 parts]');
  assert.equal(visualExportLine({ kind: 'blueprint', status: 'done', title: 'How it is made', sheet: 'process', stats: { steps: 12, parts: 10 } }), '[Blueprint: How it is made · process sheet · 12 steps]');
  assert.equal(visualExportLine({ kind: 'blueprint', status: 'error', title: 'Alt', sheet: 'part' }), '[Blueprint: Alt · part sheet · not finished]');
  assert.equal(visualExportLine({ kind: 'text', text: 'x' }), '');
  assert.equal(visualExportLine(null), '');
  assert.equal(blueprintRequestText(spec, 'dcdc-converter'), 'Blueprint: DC-DC converter (2024 Toyota Camry Hybrid (XV70))');
  assert.equal(blueprintRequestText(spec), 'Blueprint: 2024 Toyota Camry Hybrid (XV70)');
  assert.equal(blueprintRequestText(spec, 'no-such-part'), 'Blueprint: 2024 Toyota Camry Hybrid (XV70)');
});
