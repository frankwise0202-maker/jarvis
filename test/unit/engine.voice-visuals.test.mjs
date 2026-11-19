// Voice Mode × holograms in the engine and the mock (v6): a spoken turn in a conversation that can
// show holograms carries SPOKEN_VISUALS_NOTE right after the spoken reply channel; a chat turn, or
// a conversation from before holograms, never does. A spoken 2D request carries the channel, the
// note, the saved list and the "Blueprint request" block, in that order. The strict mock says the
// hologram lines the way Voice Mode wants them when the channel is present, and keeps its chat
// wording otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import {
  LEAD_SYSTEM_V2,
  LEAD_SYSTEM_V3,
  MODE_INSTRUCTIONS,
  SAVED_ITEMS_HEADING,
  SPOKEN_REPLY_CHANNEL,
  SPOKEN_VISUALS_NOTE,
  buildBlueprintRequestBlock,
  buildSavedItemsBlock,
  buildTurnContext,
  leadToolsV3,
  leadToolsV4,
} from '../../src/engine/prompts.js';
import { normalizeHologramSpec } from '../../src/lib/hologram-spec.js';
import { formatLocalTime } from '../../src/engine/util.js';
import { createMockFetch } from '../mock/anthropic-mock.mjs';
import { turnContextOf as mockContextOf } from '../mock/content.mjs';
import { blueprintRequestOf, loadFixture, savedIdsOf, spokenName, turnContextText } from '../mock/visuals.mjs';
import { blk, collect, createFakeLibrary, createHarness, segmentsOf } from './engine.support.test.mjs';

const FIXED = new Date('2026-11-19T21:35:00Z');
const FIXED_NOW = () => FIXED;
const fixture = (name) => JSON.parse(readFileSync(new URL(`../mock/fixtures/${name}.json`, import.meta.url), 'utf8'));
const count = (text, needle) => text.split(needle).length - 1;
const answer = (text) => ({ content: [blk.thinking('Considering it.'), blk.text(text)], stop: 'end_turn' });
const BASE = { localTime: 'Thursday, 19 November 2026, 16:35 (America/New_York)', mode: 'auto', maxAgents: 8, maxWaves: 3, memoryEnabled: true, memoryFacts: [] };
/** The turn context the engine builds under DEFAULT_TEST_SETTINGS at FIXED. */
const engineContext = (extra) =>
  buildTurnContext({ localTime: formatLocalTime(FIXED), userName: '', location: '', tone: 'butler', verbosity: 'balanced', mode: 'auto', maxAgents: 8, maxWaves: 3, memoryEnabled: true, memoryFacts: [], ...extra });
/** The first text block (the turn context) of the newest owner message in a request body. */
const contextOf = (body) => body.messages.filter((m) => m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'text' && m.content[0].text.startsWith('<turn_context>')).at(-1).content[0].text;

// ---------------------------------------------------------------------------------------------
// prompts.js

test('spoken visuals note: says how holograms work in Voice Mode; safe in <turn_context> and for the mock', () => {
  assert.match(SPOKEN_VISUALS_NOTE, /^In Voice Mode a hologram opens full screen while you build it, and a blueprint once it is drawn;/);
  assert.match(SPOKEN_VISUALS_NOTE, /"expand it", "show the alternator", "isolate it" or "blueprint the alternator", which the app handles itself\./);
  assert.match(SPOKEN_VISUALS_NOTE, /Before show_hologram, say one short sentence \("Pulling up the Camry now\."\)\./);
  assert.match(SPOKEN_VISUALS_NOTE, /"Here's the Camry\. Say 'expand it' or tap any part\."/);
  assert.match(SPOKEN_VISUALS_NOTE, /After a blueprint, say that it is open on the screen\.$/);
  assert.ok(!SPOKEN_VISUALS_NOTE.includes('\n'), 'one line');
  assert.doesNotMatch(SPOKEN_VISUALS_NOTE, /<\/?\s*(turn_context|mission|assignment|context)\b/i);
  assert.doesNotMatch(SPOKEN_VISUALS_NOTE, /\[\[/);
  // The mock (and the engine's own readers) key on these phrases: the note never contains them.
  assert.doesNotMatch(SPOKEN_VISUALS_NOTE, /Blueprint request|Saved holograms and blueprints|Reply channel|^Mode:/m);
  assert.ok(SPOKEN_VISUALS_NOTE.length < 520, `short (${SPOKEN_VISUALS_NOTE.length} characters)`);
});

test('turn context: the note follows the spoken channel only when the turn is spoken and the conversation can show holograms', () => {
  const plain = buildTurnContext(BASE);
  for (const visuals of [true, false, undefined, 'true', 1]) {
    assert.equal(buildTurnContext({ ...BASE, visuals }), plain, `not spoken, visuals ${JSON.stringify(visuals)}: unchanged`);
  }
  const channelOnly = buildTurnContext({ ...BASE, spoken: true });
  for (const visuals of [false, undefined, 'true', 1, {}]) {
    assert.equal(buildTurnContext({ ...BASE, spoken: true, visuals }), channelOnly, `visuals ${JSON.stringify(visuals)}: the channel alone`);
  }
  assert.equal(count(channelOnly, SPOKEN_VISUALS_NOTE), 0);
  const both = buildTurnContext({ ...BASE, spoken: true, visuals: true });
  const lines = both.split('\n');
  const mode = lines.findIndex((l) => l.startsWith('Mode: auto — '));
  assert.equal(lines[mode + 1], SPOKEN_REPLY_CHANNEL.split('\n')[0]);
  const channelLines = SPOKEN_REPLY_CHANNEL.split('\n').length;
  assert.equal(lines[mode + 1 + channelLines], SPOKEN_VISUALS_NOTE, 'right after the channel');
  assert.equal(lines[mode + 2 + channelLines], 'Agent limits: up to 8 agents per wave, at most 3 waves this turn');
  assert.equal(both.replace(`${SPOKEN_VISUALS_NOTE}\n`, ''), channelOnly);
  assert.equal(count(both, SPOKEN_VISUALS_NOTE), 1);
  assert.equal(count(both, '</turn_context>'), 1);
  // The strict mock still reads the turn as spoken, in auto mode.
  const ctx = mockContextOf({ role: 'user', content: [{ type: 'text', text: both }, { type: 'text', text: 'Hi' }] });
  assert.equal(ctx.spoken, true);
  assert.equal(ctx.mode, 'auto');
  assert.equal(MODE_INSTRUCTIONS.auto.length > 0, true);
});

// ---------------------------------------------------------------------------------------------
// startTurn

test('startTurn({ spoken: true }) in a conversation that can show holograms: the channel, then the note; a chat turn has neither', async () => {
  const h = createHarness({ handler: () => answer('Here you are.'), now: FIXED_NOW });
  const conv = h.jarvis.newConversation();
  assert.deepEqual(conv.tools, leadToolsV4());
  const { turn } = await collect(h.jarvis.startTurn(conv, { text: 'Show me an AA battery', mode: 'auto', spoken: true }));
  assert.equal(turn.status, 'done');
  assert.equal(turn.spoken, true);
  const first = h.api.requests[0].body;
  assert.equal(contextOf(first), engineContext({ spoken: true, visuals: true }));
  assert.equal(count(contextOf(first), SPOKEN_VISUALS_NOTE), 1);
  assert.deepEqual(first.system, [{ type: 'text', text: LEAD_SYSTEM_V3 }], 'the frozen prompt is unchanged');
  assert.deepEqual(first.tools, leadToolsV4(), 'the frozen tools are unchanged');

  const { turn: chat } = await collect(h.jarvis.startTurn(conv, { text: 'And a D cell?', mode: 'auto' }));
  assert.equal('spoken' in chat, false);
  const next = h.api.requests[1].body;
  assert.equal(contextOf(next), engineContext({ spoken: false }));
  assert.equal(count(JSON.stringify(next), 'In Voice Mode a hologram opens'), 1, 'only the spoken turn carries the note');
});

test('startTurn({ spoken: true }) in a conversation from before holograms: the channel only, and its request is otherwise as before', async () => {
  const h = createHarness({ handler: () => answer('Paris.'), now: FIXED_NOW });
  const conv = h.jarvis.newConversation();
  conv.system = LEAD_SYSTEM_V2;
  conv.tools = leadToolsV3();
  const { turn } = await collect(h.jarvis.startTurn(conv, { text: 'What is the capital of France?', mode: 'auto', spoken: true }));
  assert.equal(turn.status, 'done');
  const body = h.api.requests[0].body;
  assert.equal(contextOf(body), engineContext({ spoken: true }));
  assert.equal(count(contextOf(body), SPOKEN_REPLY_CHANNEL), 1);
  assert.doesNotMatch(JSON.stringify(body), /In Voice Mode a hologram opens/);
  assert.deepEqual(body.tools, leadToolsV3());
});

test('a Voice Mode 2D request: spoken and blueprintFor together; channel and note after the Mode line, the saved list and the Blueprint request before </turn_context>', async () => {
  const library = createFakeLibrary();
  const spec = normalizeHologramSpec(fixture('battery')).spec;
  library.add({ id: 'lib_battery0001', kind: 'hologram', title: spec.title, subject: spec.subtitle, spec, stats: { parts: 9, shapes: 10 } });
  const sheet = fixture('battery-cutaway');
  let h;
  h = createHarness({
    library,
    now: FIXED_NOW,
    handler: () => (h.api.requests.length === 1 ? { content: [blk.text('Drawing the blueprint of the separator now.'), blk.blueprint('toolu_bp', sheet)], stop: 'tool_use' } : answer("The blueprint of the separator is ready; it's open on your screen.")),
  });
  const conv = h.jarvis.newConversation();
  const run = h.jarvis.startTurn(conv, { text: 'Blueprint: Separator (AA alkaline battery (LR6))', mode: 'quick', spoken: true, keepOnStop: true, blueprintFor: { model: 'lib_battery0001', part: 'separator' } });
  assert.equal(run.turn.spoken, true);
  assert.deepEqual(run.turn.blueprintFor, { model: 'lib_battery0001', part: 'separator' });
  const { turn } = await collect(run);
  assert.equal(turn.status, 'done');
  const ctx = contextOf(h.api.requests[0].body);
  const at = (needle) => {
    const i = ctx.indexOf(needle);
    assert.ok(i >= 0, `the turn context has ${JSON.stringify(needle.slice(0, 40))}`);
    return i;
  };
  const order = [at('Mode: quick — '), at(SPOKEN_REPLY_CHANNEL), at(SPOKEN_VISUALS_NOTE), at('Agent limits:'), at(SAVED_ITEMS_HEADING), at('Blueprint request (the owner asked for this 2D blueprint):'), at('</turn_context>')];
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in this order');
  assert.match(ctx, /- Target: part "Separator" \(id: separator\) of the saved hologram lib_battery0001, "AA alkaline battery \(LR6\)"/);
  for (const once of [SPOKEN_REPLY_CHANNEL, SPOKEN_VISUALS_NOTE, SAVED_ITEMS_HEADING]) assert.equal(count(ctx, once), 1);
  const [seg] = segmentsOf(turn, 'blueprint');
  assert.equal(seg.status, 'done');
  assert.deepEqual(seg.for, { model: 'lib_battery0001', part: 'separator' });
  const save = library.calls.find((c) => c[0] === 'save')[1];
  assert.deepEqual(save.parent, { model: 'lib_battery0001', part: 'separator' });
  assert.equal(save.partName, 'Separator');
  assert.equal(h.persisted.at(-1).turns.at(-1).spoken, true);
});

// ---------------------------------------------------------------------------------------------
// The mock (test/mock/visuals.mjs) on the spoken channel

const KEY = 'sk-ant-test-0123456789abcdefghijklmnop';
function mockClient() {
  const fetch = createMockFetch({ timeScale: 0 });
  return { client: new Anthropic({ apiKey: KEY, baseURL: 'http://mock.test', fetch, maxRetries: 0 }), mock: fetch.mock };
}
const params = (messages) => ({
  model: 'claude-opus-5-5',
  max_tokens: 16000,
  system: [{ type: 'text', text: LEAD_SYSTEM_V3 }],
  tools: leadToolsV4(),
  messages,
  thinking: { type: 'adaptive', display: 'summarized' },
  output_config: { effort: 'medium' },
  cache_control: { type: 'ephemeral' },
});
const owner = (text, { spoken, extra = [] } = {}) => ({
  role: 'user',
  content: [{ type: 'text', text: [buildTurnContext({ ...BASE, spoken, visuals: true }).replace('\n</turn_context>', ''), ...extra, '</turn_context>'].join('\n') }, { type: 'text', text }],
});
const textOf = (message) => message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
const resultFor = (use, content) => ({ role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, content }] });

test('mock: a spoken [[hologram:battery]] says "Pulling up…" before the call and "Here\'s the … Say "expand it", or tap any part." after it; the chat wording is unchanged', async () => {
  const { client, mock } = mockClient();
  const first = [owner('[[hologram:battery]] Show me an AA battery', { spoken: true })];
  const a = await client.beta.messages.create(params(first));
  assert.equal(a.stop_reason, 'tool_use');
  assert.equal(textOf(a), 'Pulling up the AA alkaline battery now.');
  const use = a.content.find((b) => b.type === 'tool_use');
  assert.equal(use.name, 'show_hologram');
  assert.deepEqual(use.input, loadFixture('battery'));
  const b = await client.beta.messages.create(params([...first, { role: 'assistant', content: a.content }, resultFor(use, 'Hologram shown to the owner: "AA alkaline battery (LR6)" with 9 labeled parts (10 shapes).')]));
  assert.equal(b.stop_reason, 'end_turn');
  assert.equal(textOf(b), 'Here\'s the AA alkaline battery. Say "expand it", or tap any part.');

  const chat = [owner('[[hologram:battery]] Show me an AA battery', { spoken: false })];
  const c = await client.beta.messages.create(params(chat));
  assert.equal(textOf(c), 'Here is AA alkaline battery (LR6) as a hologram; it builds part by part.');
  const d = await client.beta.messages.create(params([...chat, { role: 'assistant', content: c.content }, resultFor(c.content.find((x) => x.type === 'tool_use'), 'Hologram shown.')]));
  assert.match(textOf(d), /^There it is: “AA alkaline battery \(LR6\)”, with 9 labeled parts\./);
  assert.deepEqual(mock.violations, []);
});

test('mock: a spoken Blueprint request says it is drawing that part, then that the blueprint "is ready; it\'s open on your screen"', async () => {
  const { client, mock } = mockClient();
  const saved = buildSavedItemsBlock([{ id: 'lib_battery0001', kind: 'hologram', title: 'AA alkaline battery (LR6)', stats: { parts: 9 } }]);
  const request = buildBlueprintRequestBlock({ model: 'lib_battery0001', part: 'separator', hologram: { title: 'AA alkaline battery (LR6)', units: 'mm', parts: [] }, partInfo: { name: 'Separator', info: 'Keeps the zinc and the cathode apart.', material: 'Non-woven cellulose', group: 'Electrochemistry', size: [9, 42, 9] } });
  const first = [owner('Blueprint: Separator (AA alkaline battery (LR6))', { spoken: true, extra: [saved, request] })];
  assert.deepEqual(savedIdsOf(turnContextText(first[0])), ['lib_battery0001']);
  assert.equal(blueprintRequestOf(turnContextText(first[0])).partName, 'Separator');
  const a = await client.beta.messages.create(params(first));
  assert.equal(textOf(a), 'Drawing the blueprint of the separator now.');
  const use = a.content.find((b) => b.type === 'tool_use');
  assert.equal(use.name, 'draw_blueprint');
  assert.deepEqual(use.input.for, { model: 'lib_battery0001', part: 'separator' });
  const b = await client.beta.messages.create(params([...first, { role: 'assistant', content: a.content }, resultFor(use, 'Blueprint drawn: "AA alkaline cell (LR6)" (cutaway sheet). The owner can see it now.')]));
  assert.equal(textOf(b), "The blueprint of the separator is ready; it's open on your screen. Tap a numbered callout to see that part.");
  assert.deepEqual(mock.violations, []);
});

test('mock: spokenName says a title or part the way it sounds after a verb', () => {
  assert.equal(spokenName('AA alkaline battery (LR6)'), 'the AA alkaline battery');
  assert.equal(spokenName('Car alternator (12 V, 150 A claw-pole)'), 'the car alternator');
  assert.equal(spokenName('2024 Toyota Camry Hybrid (XV70)'), 'the 2024 Toyota Camry Hybrid');
  assert.equal(spokenName('DC-DC converter'), 'the DC-DC converter');
  assert.equal(spokenName('Steel can (+)'), 'the steel can');
  assert.equal(spokenName('The rotor'), 'the rotor');
  assert.equal(spokenName(''), 'it');
});
