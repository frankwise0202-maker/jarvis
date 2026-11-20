// Unit tests for the mock's holograms, blueprints and saved-library behavior (test/mock/visuals.mjs
// and its hooks in behavior.mjs), driven through the real SDK with the in-process fetch.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createMockFetch } from '../mock/anthropic-mock.mjs';
import { HOLOGRAM_SAMPLES_V2, blueprintRequestOf, chooseBlueprintSample, loadFixture, savedIdsOf, turnContextText } from '../mock/visuals.mjs';
import { LEAD_SYSTEM_V3, leadToolsV3, leadToolsV4, leadToolsV7, buildBlueprintRequestBlock, buildSavedItemsBlock } from '../../src/engine/prompts.js';
import { normalizeHologramSpec } from '../../src/lib/hologram-spec.js';

const KEY = 'sk-ant-test-0123456789abcdefghijklmnop';
const CTX = (extra = '') => [
  '<turn_context>',
  'Local time: Thursday, 19 November 2026, 16:35 (America/New_York)',
  'Address the owner as: Tony',
  'Mode: auto — Decide yourself.',
  'Agent limits: up to 8 agents per wave, at most 3 waves this turn',
  'Memory: none saved',
  ...(extra ? [extra] : []),
  '</turn_context>',
].join('\n');
const user = (text, extra) => ({ role: 'user', content: [{ type: 'text', text: CTX(extra) }, { type: 'text', text }] });

function setup(timeScale = 0) {
  const fetch = createMockFetch({ timeScale });
  const client = new Anthropic({ apiKey: KEY, baseURL: 'http://mock.test', fetch, maxRetries: 0 });
  return { client, mock: fetch.mock };
}

const params = (messages, tools = leadToolsV4()) => ({
  model: 'claude-opus-5-5',
  max_tokens: 16000,
  system: [{ type: 'text', text: LEAD_SYSTEM_V3 }],
  tools,
  messages,
  thinking: { type: 'adaptive', display: 'summarized' },
  output_config: { effort: 'medium' },
  cache_control: { type: 'ephemeral' },
});

async function stream(client, body) {
  const events = [];
  const s = client.beta.messages.stream(body);
  s.on('streamEvent', (e) => events.push({ e, at: Date.now() }));
  const message = await s.finalMessage();
  return { message, events };
}

describe('mock: holograms, blueprints and the saved library', () => {
  it('[[hologram:battery]] streams show_hologram with the sample in small deltas, then answers after the result', async () => {
    const { client, mock } = setup(0.1);
    const first = [user('Show me an AA battery [[hologram:battery]]')];
    const started = Date.now();
    const { message, events } = await stream(client, params(first));
    assert.equal(message.stop_reason, 'tool_use');
    const use = message.content.find((b) => b.type === 'tool_use');
    assert.equal(use.name, 'show_hologram');
    assert.deepEqual(use.input, loadFixture('battery'));
    const deltas = events.filter(({ e }) => e.type === 'content_block_delta' && e.delta.type === 'input_json_delta');
    assert.ok(deltas.length >= 100, `${deltas.length} input deltas`);
    assert.ok(Math.max(...deltas.map(({ e }) => e.delta.partial_json.length)) <= 40, 'small chunks');
    assert.ok(deltas.at(-1).at - deltas[0].at >= 150, 'spread over time (a visible live build)');
    assert.ok(Date.now() - started < 3000);

    const next = await stream(client, params([...first, { role: 'assistant', content: message.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, content: 'Hologram shown to the owner: "AA alkaline battery (LR6)" with 9 labeled parts (10 shapes).' }] }]));
    assert.equal(next.message.stop_reason, 'end_turn');
    assert.match(next.message.content.map((b) => b.text || '').join(''), /There it is: “AA alkaline battery \(LR6\)”, with 9 labeled parts\./);
    assert.deepEqual(mock.violations, []);
  });

  it('[[hologram:v2/camry]] streams show_hologram (version 2) with the format v2 sample; every v2 sample validates cleanly', async () => {
    const { client, mock } = setup(0.05);
    const { message, events } = await stream(client, params([user('Show me a 2024 Camry, less boxy please [[hologram:v2/camry]]')], leadToolsV7()));
    assert.equal(message.stop_reason, 'tool_use');
    const use = message.content.find((b) => b.type === 'tool_use');
    assert.equal(use.name, 'show_hologram');
    assert.deepEqual(use.input, loadFixture('v2/camry'));
    assert.ok(use.input.parts[0].shapes[0].type === 'hull' && use.input.parts.some((p) => p.shapes.some((sh) => sh.type === 'panel')));
    const deltas = events.filter(({ e }) => e.type === 'content_block_delta' && e.delta.type === 'input_json_delta');
    assert.ok(deltas.length >= 300, `${deltas.length} input deltas: a visible live build`);
    assert.deepEqual(mock.violations, []);
    assert.deepEqual(HOLOGRAM_SAMPLES_V2, ['v2/camry', 'v2/f150', 'v2/alternator', 'v2/turbofan', 'v2/model3', 'v2/cessna']);
    for (const name of HOLOGRAM_SAMPLES_V2) assert.deepEqual(normalizeHologramSpec(loadFixture(name)).warnings, [], name);
    // an unknown sample name falls back to the default (the V1 Camry)
    const other = await stream(client, params([user('Show me something [[hologram:v2/nothing]]')], leadToolsV7()));
    assert.deepEqual(other.message.content.find((b) => b.type === 'tool_use').input, loadFixture('camry'));
  });

  it('only tools the request defines are called; a missing tool_result for the new tools is a violation', async () => {
    const { client, mock } = setup();
    const old = await stream(client, params([user('Show me a Camry [[hologram:camry]] [[open-saved]]')], leadToolsV3()));
    assert.equal(old.message.stop_reason, 'end_turn');
    assert.ok(!old.message.content.some((b) => b.type === 'tool_use'));
    const first = [user('Show me a Camry [[hologram:camry]]')];
    const { message } = await stream(client, params(first));
    // Answering the call with a plain user message instead of its tool_result is rejected.
    await assert.rejects(() => client.beta.messages.create(params([...first, { role: 'assistant', content: message.content }, user('ignore that')])), /tool_result/);
    assert.equal(mock.violations.length, 1);
    assert.match(mock.violations[0].message, /tool_use` ids were found without `tool_result` blocks/);
  });

  it('a Blueprint request in the turn context streams draw_blueprint with the matching sample and the requested `for`', async () => {
    const { client, mock } = setup();
    const block = buildBlueprintRequestBlock({ model: 'lib_ab12cd34ef', part: 'dcdc-converter', hologram: { title: '2024 Toyota Camry Hybrid (XV70)', units: 'mm', parts: [] }, partInfo: { name: 'DC-DC converter', info: 'Replaces the alternator.', material: 'Aluminium', group: 'Hybrid', size: [170, 70, 200] } });
    const saved = buildSavedItemsBlock([{ id: 'lib_ab12cd34ef', kind: 'hologram', title: '2024 Toyota Camry Hybrid (XV70)', stats: { parts: 43 } }]);
    const { message } = await stream(client, params([user('Blueprint: DC-DC converter (2024 Toyota Camry Hybrid (XV70))', `${saved}\n${block}`)]));
    const use = message.content.find((b) => b.type === 'tool_use');
    assert.equal(use.name, 'draw_blueprint');
    assert.deepEqual(use.input, { ...loadFixture('alternator-part'), for: { model: 'lib_ab12cd34ef', part: 'dcdc-converter' } });
    assert.match(message.content.find((b) => b.type === 'text').text, /Drawing the 2D blueprint of DC-DC converter now\./);

    const whole = buildBlueprintRequestBlock({ model: 'lib_ab12cd34ef', part: null, hologram: { title: '2024 Toyota Camry Hybrid (XV70)', units: 'mm', parts: [] } });
    const w = await stream(client, params([user('Blueprint: 2024 Toyota Camry Hybrid (XV70)', whole)]));
    assert.deepEqual(w.message.content.find((b) => b.type === 'tool_use').input, { ...loadFixture('camry-assembly'), for: { model: 'lib_ab12cd34ef' } });
    assert.deepEqual(mock.violations, []);
  });

  it('[[open-saved]] opens the first saved id ([[blueprint:x]] draws a named sample)', async () => {
    const { client } = setup();
    const saved = buildSavedItemsBlock([{ id: 'lib_first00001', kind: 'hologram', title: 'A', stats: { parts: 1 } }, { id: 'lib_second0001', kind: 'blueprint', title: 'B', sheet: 'part' }]);
    const a = await stream(client, params([user('Open it [[open-saved]]', saved)]));
    assert.deepEqual(a.message.content.find((b) => b.type === 'tool_use').input, { id: 'lib_first00001' });
    const b = await stream(client, params([user('Open it [[open-saved]]')]));
    assert.deepEqual(b.message.content.find((x) => x.type === 'tool_use').input, { id: 'lib_0000000000' });
    const c = await stream(client, params([user('Draw it [[blueprint:battery-process]]')]));
    assert.deepEqual(c.message.content.find((x) => x.type === 'tool_use').input, loadFixture('battery-process'));
  });

  it('[[droplead:N]] cuts the first response to a request once', async () => {
    const { client, mock } = setup();
    const body = params([user('Show me [[hologram:battery]] [[droplead:40]]')]);
    await assert.rejects(() => stream(client, body));
    const { message } = await stream(client, body);
    assert.equal(message.stop_reason, 'tool_use');
    assert.deepEqual(mock.requests.map((r) => r.outcome), ['cut', 'ok']);
  });

  it('helpers: turn-context parsing and sample choice', () => {
    const ctx = turnContextText(user('x', `${buildSavedItemsBlock([{ id: 'lib_aaaaaaaaaa', kind: 'hologram', title: 'T', stats: { parts: 2 } }])}\n${buildBlueprintRequestBlock({ model: 'lib_aaaaaaaaaa', part: 'zinc-anode', hologram: { title: 'AA alkaline battery (LR6)', units: 'mm', parts: [] }, partInfo: { name: 'Zinc anode gel' } })}`));
    assert.deepEqual(savedIdsOf(ctx), ['lib_aaaaaaaaaa']);
    assert.deepEqual(blueprintRequestOf(ctx), { model: 'lib_aaaaaaaaaa', part: 'zinc-anode', partName: 'Zinc anode gel', title: 'AA alkaline battery (LR6)' });
    assert.equal(blueprintRequestOf('Memory: none saved'), null);
    assert.equal(chooseBlueprintSample({ part: 'zinc-anode', partName: 'Zinc anode gel', title: 'AA alkaline battery (LR6)' }), 'battery-cutaway');
    assert.equal(chooseBlueprintSample({ part: 'hv-battery', partName: 'Hybrid battery', title: '2024 Toyota Camry Hybrid' }), 'alternator-part');
    assert.equal(chooseBlueprintSample({ part: 'rotor', partName: 'Rotor', title: 'Car alternator' }), 'alternator-part');
    assert.equal(chooseBlueprintSample({ title: 'AA alkaline battery (LR6)' }), 'battery-cutaway');
    assert.equal(chooseBlueprintSample({ title: 'AA alkaline battery (LR6)', prompt: 'how is it made?' }), 'battery-process');
    assert.equal(chooseBlueprintSample({ title: '2024 Toyota Camry Hybrid' }), 'camry-assembly');
    assert.equal(chooseBlueprintSample({ title: 'Car alternator' }), 'alternator-part');
  });
});
