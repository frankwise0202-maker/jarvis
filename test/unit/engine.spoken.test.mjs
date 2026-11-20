// The spoken reply channel (Voice Mode): startTurn({ spoken: true }) adds a block to that turn's
// <turn_context> (the frozen system prompt and tools never change) and marks the turn; without it,
// requests and turns are exactly as before. The strict mock detects the same block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  LEAD_SYSTEM_V1,
  LEAD_SYSTEM_V2,
  LEAD_SYSTEM_V3,
  LEAD_SYSTEM_V4,
  LEAD_SYSTEM_V5,
  MODE_INSTRUCTIONS,
  SPOKEN_REPLY_CHANNEL,
  WORKER_SYSTEM_V1,
  buildTurnContext,
  leadToolVersions,
  leadToolsLatest,
  leadToolsV5,
  leadToolsV6,
  leadToolsV7,
} from '../../src/engine/prompts.js';
import { formatLocalTime } from '../../src/engine/util.js';
import { turnContextOf } from '../mock/content.mjs';
import { makePng } from '../mock/fixtures.mjs';
import { blk, collect, createHarness } from './engine.support.test.mjs';

const FIXED = new Date('2026-11-19T21:35:00Z');
const FIXED_NOW = () => FIXED;
const answer = (text) => ({ content: [blk.thinking('Considering the question.'), blk.text(text)], stop: 'end_turn' });
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The channel exactly as the voice brief specifies it (every rule kept). */
const EXPECTED_CHANNEL = [
  "Reply channel: spoken. The owner is talking to you in Voice Mode and hears your reply read aloud by their device's voice; they may not be looking at the screen. Write for the ear:",
  '- Talk the way you would speak to them in person: natural sentences with contractions, in your usual character. No Markdown, headings, bullet points, tables, links, emoji or symbols; say "percent", "about", "to" and units in words.',
  '- Lead with the answer and keep it brief, usually one to four sentences. From a list, mention two or three items in a sentence and offer the rest.',
  '- Round numbers for listening ("just under two thousand") and say dates and times the way people say them.',
  "- Before you search, read pages or deploy agents, say one short sentence about what you're doing; it is spoken while you work.",
  '- If the answer needs more detail than is comfortable to listen to (research findings, comparisons, steps, sources), speak a short summary first, then write a line containing only --- and put the details below it in normal Markdown for the screen. Only the part above that line is read aloud, so mention that the details are on screen.',
].join('\n');

const BASE = { localTime: 'Thursday, 19 November 2026, 16:35 (America/New_York)', mode: 'auto', maxAgents: 8, maxWaves: 3, memoryEnabled: true, memoryFacts: [] };
const BASE_LINES = [
  '<turn_context>',
  'Local time: Thursday, 19 November 2026, 16:35 (America/New_York)',
  'Address the owner as: sir',
  'Style: butler tone (polished and courteous, like a trusted British butler, with a light, dry wit); balanced length (match the length to the request)',
  `Mode: auto — ${MODE_INSTRUCTIONS.auto}`,
  'Agent limits: up to 8 agents per wave, at most 3 waves this turn',
  'Memory: none saved',
  '</turn_context>',
];

/**
 * The turn context the engine builds under DEFAULT_TEST_SETTINGS at FIXED. New conversations can show
 * holograms (lead tools V4), so a spoken turn also carries the Voice Mode note on holograms
 * (engine.voice-visuals.test.mjs); `visuals` changes nothing unless the turn is spoken.
 */
const engineContext = (spoken) =>
  buildTurnContext({ localTime: formatLocalTime(FIXED), userName: '', location: '', tone: 'butler', verbosity: 'balanced', mode: 'auto', maxAgents: 8, maxWaves: 3, memoryEnabled: true, memoryFacts: [], spoken, visuals: true });

const count = (text, needle) => text.split(needle).length - 1;

// ---------------------------------------------------------------------------------------------
// prompts.js

test('spoken channel: the exact Voice Mode text, safe inside <turn_context>', () => {
  assert.equal(SPOKEN_REPLY_CHANNEL, EXPECTED_CHANNEL);
  // The strict mock and Voice Mode key on these.
  assert.match(SPOKEN_REPLY_CHANNEL, /^Reply channel: spoken\. /);
  assert.match(SPOKEN_REPLY_CHANNEL, /write a line containing only --- and put the details below it/);
  // It can neither close nor open one of our blocks, and carries no mock directive.
  assert.doesNotMatch(SPOKEN_REPLY_CHANNEL, /<\/?\s*(turn_context|mission|assignment|context)\b/i);
  assert.doesNotMatch(SPOKEN_REPLY_CHANNEL, /\[\[/);
});

test('turn context: the spoken channel follows the Mode line only when spoken is true', () => {
  const plain = buildTurnContext(BASE);
  assert.equal(plain, BASE_LINES.join('\n')); // unchanged from before the channel existed
  for (const spoken of [undefined, false, null, 0, '', 'true', 'yes', 1, {}, []]) {
    assert.equal(buildTurnContext({ ...BASE, spoken }), plain, `spoken: ${JSON.stringify(spoken)}`);
  }

  const spoken = buildTurnContext({ ...BASE, spoken: true });
  assert.equal(spoken, [...BASE_LINES.slice(0, 5), EXPECTED_CHANNEL, ...BASE_LINES.slice(5)].join('\n'));
  assert.equal(count(spoken, SPOKEN_REPLY_CHANNEL), 1);
  assert.equal(count(spoken, '</turn_context>'), 1);

  // Right after the Mode line with every optional line present, too.
  const full = buildTurnContext({ ...BASE, userName: 'Tony', location: 'Austin, Texas, US', mode: 'swarm', memoryFacts: ['Prefers metric units'], tone: 'friendly', verbosity: 'detailed', spoken: true });
  const lines = full.split('\n');
  const mode = lines.findIndex((l) => l.startsWith('Mode: swarm — '));
  assert.equal(lines[mode + 1], EXPECTED_CHANNEL.split('\n')[0]);
  assert.match(full, /Only the part above that line is read aloud, so mention that the details are on screen\.\nAgent limits: up to 8 agents per wave/);
  assert.equal(full.replace(`${SPOKEN_REPLY_CHANNEL}\n`, ''), buildTurnContext({ ...BASE, userName: 'Tony', location: 'Austin, Texas, US', mode: 'swarm', memoryFacts: ['Prefers metric units'], tone: 'friendly', verbosity: 'detailed' }));
});

test('turn context: the strict mock reads the channel from the engine text, and only from it', () => {
  const message = (text) => ({ role: 'user', content: [{ type: 'text', text }, { type: 'text', text: 'Hello' }] });
  assert.equal(turnContextOf(message(buildTurnContext({ ...BASE, spoken: true }))).spoken, true);
  assert.equal(turnContextOf(message(buildTurnContext(BASE))).spoken, false);
  // A saved note that quotes the line is a "- …" memory line, not the channel.
  assert.equal(turnContextOf(message(buildTurnContext({ ...BASE, memoryFacts: ['Reply channel: spoken'] }))).spoken, false);
  assert.equal(turnContextOf(message(buildTurnContext({ ...BASE, memoryFacts: ['Reply channel: spoken'], spoken: true }))).mode, 'auto');
});

test('frozen prompts and tools are untouched by the spoken channel', () => {
  // Conversations freeze these (thinking blocks are bound to the exact prefix): they never change.
  assert.equal(sha256(LEAD_SYSTEM_V1), '64cae163ccc3813d87162893c484b9daa970981d45ccc1245bf88f1ff79b23ef');
  assert.equal(sha256(LEAD_SYSTEM_V2), '264ac70a8bd41f548d536db778df0b4e315b0785455bfeb93f55181b3ef68bc0');
  // v6: holograms added the V3 prompt and V4 tools (pinned the same way in engine.visuals.test.mjs).
  assert.equal(sha256(LEAD_SYSTEM_V3), '2e37e85dad970e69d2202205dd5d38353efd9ff769adaaeca0158c134dd07d06');
  // v7: the V4 prompt (Camera and screens) and V5 tools (Optics, open_screen); see engine.v7.test.mjs.
  assert.equal(sha256(LEAD_SYSTEM_V4), '9f1288337652364612f37caf959f6ee1f890829e5d79b5a1f4f25a68fc051a20');
  assert.equal(sha256(WORKER_SYSTEM_V1), 'c9b4f5ad7323cf9c2a76dbffe9269cd75f8b76cb283095161a8659db90f279b1');
  assert.deepEqual(leadToolVersions().map((tools) => sha256(JSON.stringify(tools))), [
    '1e441fd51e0e6df7238adab762ce0a2c5a56f4df5f82cc25bde40e4bf395f932',
    '939eaacb2c2dc9fb69e772df4b12700b577539b09f9c52a99ec41bbce1dc76a7',
    'c837163eb2264fda141d92eb1f74285bf33d5f242dd357af45d864afdf6e1af0',
    'bd0bdaf62227786e8836881e41ca9f7c046abb0ee0afe1b5ca28ee1e7b69d974',
    '6e4ad0baac92331bf81f51695c54564a2c9dcd436dab8254a25f444b770cf616',
    // Apple Music: the V6 tools (find_music); the V5 prompt (Music); see engine.music.test.mjs.
    '4f6c6740a4d923c898efb49c00e8ac7f9b8f8b6765b6b13461222f814d0b99ed',
    // Realistic holograms: the V7 tools (V6 with show_hologram version 2); see engine.holograms-v7.test.mjs.
    '694c85d59f3b9b85a9094a58dcd549d904595c56120e42724784240b82d0bbc4',
  ]);
  assert.equal(sha256(LEAD_SYSTEM_V5), '31a77e44bcde6fff28cfe4dedfe14c757159ab8a22be65b0cac3eecb193f1692');
  assert.deepEqual(leadToolsLatest(), leadToolsV7());
  assert.equal(leadToolsV6().length, leadToolsV7().length);
  const frozen = [LEAD_SYSTEM_V1, LEAD_SYSTEM_V2, LEAD_SYSTEM_V3, LEAD_SYSTEM_V4, LEAD_SYSTEM_V5, WORKER_SYSTEM_V1, ...leadToolVersions().map((t) => JSON.stringify(t))];
  for (const text of frozen) assert.ok(!text.includes('Reply channel'), 'the channel lives only in <turn_context>');
});

// ---------------------------------------------------------------------------------------------
// startTurn

test('startTurn({ spoken: true }): the channel is in the new user message\'s first text block; the turn is marked spoken', async () => {
  const h = createHarness({ handler: () => answer('The capital of France is Paris.'), now: FIXED_NOW });
  const conv = h.jarvis.newConversation();
  const run = h.jarvis.startTurn(conv, { text: '  What is the capital of France?  ', mode: 'auto', spoken: true });
  assert.equal(run.turn.spoken, true); // set before the first event
  const { turn } = await collect(run);
  assert.equal(turn.status, 'done');
  assert.equal(turn.spoken, true);

  const { body } = h.api.requests[0];
  assert.deepEqual(body.messages, [
    { role: 'user', content: [{ type: 'text', text: engineContext(true) }, { type: 'text', text: 'What is the capital of France?' }] },
  ]);
  const context = body.messages[0].content[0].text;
  assert.equal(count(context, SPOKEN_REPLY_CHANNEL), 1);
  assert.match(context, new RegExp(`^Mode: auto — .+\\n${EXPECTED_CHANNEL.split('\n')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  // The conversation's frozen prefix is the same as for any other turn (new conversations: the
  // V4 prompt and V5 tools since v7; V5 and V6 since Apple Music; V5 and V7 since realistic holograms).
  assert.deepEqual(body.system, [{ type: 'text', text: LEAD_SYSTEM_V5 }]);
  assert.deepEqual(body.tools, leadToolsV7());
  assert.equal(conv.system, LEAD_SYSTEM_V5);
  // Persisted with the turn (exports and the UI can tell a spoken reply).
  assert.equal(h.persisted.at(-1).turns.at(-1).spoken, true);
  assert.equal('spoken' in conv.turns[0], false, 'the owner\'s UserTurn is unchanged');

  // A chat turn afterwards is written for the screen again; the spoken message stays as it was.
  const before = structuredClone(conv.apiMessages);
  const { turn: chat } = await collect(h.jarvis.startTurn(conv, { text: 'And Germany?', mode: 'auto' }));
  assert.equal(chat.status, 'done');
  assert.equal('spoken' in chat, false);
  const next = h.api.requests[1].body.messages;
  assert.deepEqual(next.slice(0, before.length), before, 'history is append-only');
  assert.deepEqual(next.at(-1), { role: 'user', content: [{ type: 'text', text: engineContext(false) }, { type: 'text', text: 'And Germany?' }] });
  assert.equal(count(JSON.stringify(next), 'Reply channel: spoken'), 1, 'only the spoken turn carries the channel');
});

test('startTurn without spoken (or with anything but true): the request and the turn are exactly as before', async () => {
  const runOnce = async (input) => {
    const h = createHarness({ handler: () => answer('Paris.'), now: FIXED_NOW });
    const conv = h.jarvis.newConversation();
    const { turn } = await collect(h.jarvis.startTurn(conv, { text: 'What is the capital of France?', mode: 'auto', ...input }));
    return { body: h.api.requests[0].body, turn, saved: h.persisted.at(-1) };
  };
  const baseline = await runOnce({});
  assert.deepEqual(baseline.body.messages[0].content[0], { type: 'text', text: engineContext(false) });
  assert.equal(engineContext(false), engineContext(undefined));
  assert.equal('spoken' in baseline.turn, false);
  assert.equal('spoken' in baseline.saved.turns.at(-1), false);
  for (const spoken of [false, undefined, null, 'true', 'yes', 1]) {
    const other = await runOnce({ spoken });
    assert.equal(JSON.stringify(other.body), JSON.stringify(baseline.body), `byte-identical request for spoken: ${JSON.stringify(spoken)}`);
    assert.equal('spoken' in other.turn, false, `no spoken mark for spoken: ${JSON.stringify(spoken)}`);
    assert.deepEqual(Object.keys(other.turn), Object.keys(baseline.turn));
  }
});

test('startTurn({ spoken: true }) with a photo: turn context first, then the photo, then the text', async () => {
  const h = createHarness({ handler: () => answer('A gradient with a disc.'), now: FIXED_NOW });
  const conv = h.jarvis.newConversation();
  const data = makePng(48, 32).toString('base64');
  const photo = { id: 'img-1', kind: 'image', name: 'Desk.png', mediaType: 'image/png', size: 900, data, thumb: null, width: 48, height: 32 };
  const { turn } = await collect(h.jarvis.startTurn(conv, { text: 'What is this?', attachments: [photo], spoken: true }));
  assert.equal(turn.status, 'done');
  assert.equal(turn.spoken, true);
  const content = h.api.requests[0].body.messages[0].content;
  assert.deepEqual(content.map((b) => b.type), ['text', 'image', 'text']);
  assert.equal(content[0].text, engineContext(true));
  assert.equal(content[2].text, 'What is this?');
});

test('an interrupted spoken turn resumes as spoken, with the channel sent once', async () => {
  let calls = 0;
  const cut = { content: [blk.thinking('Hmm'), blk.text('The capital of France is')], stop: 'end_turn', breakAfter: 6 }; // the connection drops
  const h = createHarness({ handler: () => (++calls === 1 ? cut : answer('Paris.')), now: FIXED_NOW });
  const conv = h.jarvis.newConversation();
  const { turn } = await collect(h.jarvis.startTurn(conv, { text: 'What is the capital of France?', spoken: true, keepOnStop: true }));
  assert.equal(turn.status, 'interrupted');
  assert.equal(turn.spoken, true);
  assert.equal(h.jarvis.canResume(conv), true);
  const { turn: resumed } = await collect(h.jarvis.resumeTurn(conv));
  assert.equal(resumed, turn);
  assert.equal(resumed.status, 'done');
  assert.equal(resumed.spoken, true);
  const { body } = h.api.requests.at(-1);
  assert.equal(body.messages[0].content[0].text, engineContext(true));
  assert.equal(count(JSON.stringify(body), 'Reply channel: spoken'), 1);
});
