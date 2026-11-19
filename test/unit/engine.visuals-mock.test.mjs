// Integration: holograms, blueprints and the saved library against the strict mock Claude API
// (test/mock/anthropic-mock.mjs, in-process fetch). The mock validates every request like the real
// API (tool_use / tool_result pairing included, for the new tools too) and records violations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJarvis } from '../../src/engine/index.js';
import { blueprintRequestText } from '../../src/engine/visuals.js';
import { LEAD_SYSTEM_V2, leadToolsV3 } from '../../src/engine/prompts.js';
import { createMockFetch } from '../mock/anthropic-mock.mjs';
import { DEFAULT_TEST_SETTINGS, KEY, createFakeLibrary, createMemory, segmentsOf } from './engine.support.test.mjs';

function setup({ timeScale = 0.02, library = createFakeLibrary() } = {}) {
  const fetch = createMockFetch({ timeScale });
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

const turn = (jarvis, conv, text, extra = {}) => jarvis.startTurn(conv, { text, mode: 'auto', ...extra }).done;
const lastText = (t) => segmentsOf(t, 'text').map((s) => s.text).join('\n');
const cards = (t) => t.segments.filter((s) => s.kind === 'hologram' || s.kind === 'blueprint');

test('engine ↔ strict mock: hologram, reopen from the library, part and whole-object blueprints, all with valid histories', async () => {
  const { jarvis, mock, library } = setup();
  const conv = jarvis.newConversation();

  const t1 = await turn(jarvis, conv, 'Show me a 2024 Toyota Camry Hybrid [[hologram:camry]]');
  assert.equal(t1.status, 'done');
  const [holo] = cards(t1);
  assert.equal(holo.kind, 'hologram');
  assert.equal(holo.status, 'done');
  assert.equal(holo.stats.parts, 43);
  assert.match(holo.libraryId, /^lib_/);
  assert.match(lastText(t1), /There it is: “2024 Toyota Camry Hybrid \(XV70\)”, with 43 labeled parts\./);

  const t2 = await turn(jarvis, conv, 'Open my saved Camry again [[open-saved]]');
  const [opened] = cards(t2);
  assert.equal(opened.fromLibrary, true);
  assert.equal(opened.libraryId, holo.libraryId);
  assert.deepEqual(opened.spec, holo.spec);
  assert.match(lastText(t2), /I've reopened your saved hologram “2024 Toyota Camry Hybrid \(XV70\)”/);
  const t2ctx = mock.requests.filter((r) => r.kind === 'lead').at(-2).body.messages.at(-1).content[0].text;
  assert.match(t2ctx, new RegExp(`- ${holo.libraryId} · hologram · "2024 Toyota Camry Hybrid \\(XV70\\)" \\(43 parts\\)`));

  const t3 = await turn(jarvis, conv, blueprintRequestText(holo.spec, 'dcdc-converter'), { blueprintFor: { model: holo.libraryId, part: 'dcdc-converter' } });
  assert.equal(t3.status, 'done');
  const [part] = cards(t3);
  assert.equal(part.kind, 'blueprint');
  assert.equal(part.status, 'done');
  assert.equal(part.title, 'Alternator', 'a part gets the part sheet sample');
  assert.deepEqual(part.for, { model: holo.libraryId, part: 'dcdc-converter' });
  assert.match(part.libraryId, /^lib_/);
  assert.equal(conv.turns.at(-2).text, 'Blueprint: DC-DC converter (2024 Toyota Camry Hybrid (XV70))');

  const t4 = await turn(jarvis, conv, blueprintRequestText(holo.spec), { blueprintFor: { model: holo.libraryId, part: null } });
  const [whole] = cards(t4);
  assert.equal(whole.title, 'How a 2024 Toyota Camry Hybrid is built', 'the whole car gets its assembly sheet');
  assert.deepEqual(whole.for, { model: holo.libraryId, part: null });

  assert.equal((await turn(jarvis, conv, 'Thanks, that is all')).status, 'done');
  const saves = library.calls.filter((c) => c[0] === 'save').map((c) => [c[1].kind, c[1].parent]);
  assert.deepEqual(saves, [['hologram', null], ['blueprint', { model: holo.libraryId, part: 'dcdc-converter' }], ['blueprint', { model: holo.libraryId, part: null }]]);
  assert.deepEqual(mock.violations, []);
});

test('engine ↔ strict mock: Stop while a hologram streams, then a new turn; a hologram that cannot be shown', async () => {
  const { jarvis, mock, library } = setup({ timeScale: 0.4 });
  const conv = jarvis.newConversation();
  const run = jarvis.startTurn(conv, { text: 'Show me the alternator [[hologram:alternator]]', mode: 'auto' });
  run.on('segment', (e) => {
    if (e.segment.kind === 'hologram' && e.segment.stats.parts >= 3) run.abort();
  });
  const stopped = await run.done;
  assert.equal(stopped.status, 'stopped');
  const [card] = cards(stopped);
  assert.equal(card.status, 'error');
  assert.ok(card.spec.parts.length >= 3 && card.spec.parts.length < 19);
  assert.equal(library.calls.filter((c) => c[0] === 'save').length, 0);
  const after = await turn(jarvis, conv, 'Never mind. What is an alternator for?');
  assert.equal(after.status, 'done');

  const broken = await turn(jarvis, conv, 'Show me something impossible [[hologram:broken]]');
  assert.equal(broken.status, 'done');
  const [bad] = cards(broken);
  assert.equal(bad.status, 'error');
  assert.match(bad.warnings[0], /Nothing to show/);
  assert.match(lastText(broken), /I couldn't build that hologram/);
  assert.equal((await turn(jarvis, conv, 'OK')).status, 'done');
  assert.deepEqual(mock.violations, []);
});

test('engine ↔ strict mock: a lead stream cut mid-hologram is resumed and the hologram is saved once', async () => {
  const { jarvis, mock, library } = setup();
  const conv = jarvis.newConversation();
  const cut = await turn(jarvis, conv, 'Show me an AA battery [[hologram:battery]] [[droplead:120]]');
  assert.equal(cut.status, 'interrupted');
  assert.equal(cards(cut)[0].status, 'error');
  assert.equal(jarvis.canResume(conv), true);
  const resumed = await jarvis.resumeTurn(conv).done;
  assert.equal(resumed.status, 'done');
  const [card] = cards(resumed);
  assert.equal(card.status, 'done');
  assert.equal(card.stats.parts, 9);
  assert.equal(library.calls.filter((c) => c[0] === 'save').length, 1);
  assert.equal((await turn(jarvis, conv, 'Thanks')).status, 'done');
  assert.deepEqual(mock.violations, []);
});

test('engine ↔ strict mock: a Blueprint mission researches with agents first, then shows the hologram, then explains', async () => {
  const { jarvis, mock } = setup();
  const conv = jarvis.newConversation();
  const t = await jarvis.startTurn(conv, { text: 'Blueprint mission: an AA battery [[swarm:2]] [[hologram:battery]]', mode: 'swarm' }).done;
  assert.equal(t.status, 'done');
  const kinds = t.segments.map((s) => s.kind).filter((k) => k === 'mission' || k === 'hologram');
  assert.deepEqual(kinds, ['mission', 'hologram'], 'agents first, then the hologram');
  assert.equal(t.stats.waves, 1);
  assert.equal(cards(t)[0].status, 'done');
  assert.match(lastText(t), /There it is: “AA alkaline battery \(LR6\)”, with 9 labeled parts\.[\s\S]*Sources/);
  assert.deepEqual(mock.violations, []);
});

test('engine ↔ strict mock: an older conversation never gets the new tools, blocks or calls', async () => {
  const { jarvis, mock, library } = setup();
  library.add({ id: 'lib_ab12cd34ef', kind: 'hologram', title: 'Camry', stats: { parts: 43 } });
  const conv = jarvis.newConversation();
  conv.system = LEAD_SYSTEM_V2;
  conv.tools = leadToolsV3();
  const t = await turn(jarvis, conv, 'Show me a Camry [[hologram:camry]] [[open-saved]]');
  assert.equal(t.status, 'done');
  assert.equal(cards(t).length, 0);
  const body = mock.requests.find((r) => r.kind === 'lead').body;
  assert.deepEqual(body.tools.map((x) => x.name), ['web_search', 'web_fetch', 'deploy_agents', 'update_memory']);
  assert.doesNotMatch(body.messages.at(-1).content[0].text, /Saved holograms/);
  assert.deepEqual(mock.violations, []);
});

test('engine ↔ strict mock: a hologram far beyond every limit is capped and warned, and the conversation goes on', async () => {
  const { jarvis, mock, library } = setup();
  const conv = jarvis.newConversation();
  const t = await turn(jarvis, conv, 'Stress test [[hologram:huge]]');
  assert.equal(t.status, 'done');
  const [card] = cards(t);
  assert.equal(card.status, 'done');
  assert.equal(card.stats.shapes, 400);
  assert.equal(card.warnings.length, 30);
  assert.match(card.warnings.at(-1), /^…and \d+ more\.$/);
  const lead = mock.requests.filter((r) => r.kind === 'lead');
  const result = lead.at(-1).body.messages.at(-1).content[0];
  assert.ok(result.content.length < 8000, 'the tool_result stays bounded');
  assert.ok(JSON.stringify(lead.at(-1).body.messages[1]).length > 100000, 'the full input stays in the history');
  assert.equal(library.calls.filter((c) => c[0] === 'save').length, 1);
  assert.equal((await turn(jarvis, conv, 'And now something small [[hologram:battery]]')).status, 'done');
  assert.deepEqual(mock.violations, []);
});
