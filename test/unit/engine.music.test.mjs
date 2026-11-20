// Apple Music in the engine: lead tools V6 (V5 + find_music) and the system prompt V5 (V4 + "# Music"),
// frozen for new conversations only; every older conversation (v7: V4 + V5, and before) sends exactly
// the requests it sent before (pinned with the v7.1 engine as released, 9c4ffda). The find_music round
// (the app searches, a music segment for the card, a compact link-free result), Stop, Resume, the
// strict mock's [[music]] directives, and the free local "play X" exchange (appendMusicTurn), which
// never reaches Claude.
process.env.TZ = 'America/New_York'; // the pinned request bodies include the local time

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createJarvis } from '../../src/engine/index.js';
import {
  CAMERA_AND_SCREENS_SECTION,
  LEAD_SYSTEM_LATEST,
  LEAD_SYSTEM_V1,
  LEAD_SYSTEM_V3,
  LEAD_SYSTEM_V4,
  LEAD_SYSTEM_V5,
  LEAD_SYSTEM_VERSIONS,
  MUSIC_SECTION,
  isKnownLeadSetup,
  leadToolVersions,
  leadToolsLatest,
  leadToolsV1,
  leadToolsV4,
  leadToolsV5,
  leadToolsV6,
  leadToolsV7,
} from '../../src/engine/prompts.js';
import { FIND_MUSIC_DESCRIPTION, appendMusicTurn, findMusicTool, musicSegment, validateFindMusicInput } from '../../src/engine/music.js';
import { parseItunesResults } from '../../src/lib/music.js';
import { DEFAULT_TEST_SETTINGS, KEY, blk, collect, createFakeApi, createFakeLibrary, createHarness, trailingToolResults } from './engine.support.test.mjs';
import { RECOMMENDATIONS, musicInputsOf, musicFollowUpText } from '../mock/music.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const FIXED_NOW = () => new Date('2026-11-19T21:35:00Z');
const ANCHOR = '\n\n# Writing the answer\n';
const SAMPLE = JSON.parse(readFileSync(new URL('./fixtures/itunes-back-in-black.json', import.meta.url), 'utf8'));
const ITEMS = parseItunesResults(SAMPLE);
const musicUse = (id, input) => ({ type: 'tool_use', id, name: 'find_music', input });

// ---------------------------------------------------------------------------------------------
// The versions

test('LEAD_SYSTEM_V5 is V4 plus the "Music" section before "# Writing the answer", nothing else (pinned)', () => {
  assert.equal(LEAD_SYSTEM_V5, LEAD_SYSTEM_V4.replace(ANCHOR, `\n\n${MUSIC_SECTION}${ANCHOR}`));
  assert.equal(LEAD_SYSTEM_V5.split(MUSIC_SECTION).length, 2, 'the section appears once');
  assert.ok(LEAD_SYSTEM_V5.indexOf(CAMERA_AND_SCREENS_SECTION) < LEAD_SYSTEM_V5.indexOf(MUSIC_SECTION), 'after "Camera and screens"');
  assert.ok(MUSIC_SECTION.startsWith('# Music\n- '));
  // What the owner asked for: concrete picks through find_music, never claiming to play, the owner taps Open in Apple Music, no playlists.
  for (const needle of ['find_music', 'Apple Music', '30-second preview', 'Open in Apple Music', 'recommendations', 'concrete songs or albums', 'never say that something is playing', 'playlists cannot be searched']) {
    assert.ok(MUSIC_SECTION.includes(needle), needle);
  }
  assert.doesNotMatch(LEAD_SYSTEM_V5, /\$\{|20\d\d-\d\d-\d\d/, 'static text: nothing interpolated, no dates');
  assert.ok(MUSIC_SECTION.length < 700, `kept short: it is cached with every request (${MUSIC_SECTION.length})`);
  assert.equal(sha(MUSIC_SECTION), '57a8fbef7a4ef4b378290ebf33ecb55bbd86af8f789dd0e8a50ff2585d672b7a');
  assert.equal(sha(LEAD_SYSTEM_V5), '31a77e44bcde6fff28cfe4dedfe14c757159ab8a22be65b0cac3eecb193f1692');
  // V1–V4 are untouched (the v6/v7 pins).
  assert.equal(sha(LEAD_SYSTEM_V4), '9f1288337652364612f37caf959f6ee1f890829e5d79b5a1f4f25a68fc051a20');
  assert.equal(sha(LEAD_SYSTEM_V3), '2e37e85dad970e69d2202205dd5d38353efd9ff769adaaeca0158c134dd07d06');
  assert.equal(sha(LEAD_SYSTEM_V1), '64cae163ccc3813d87162893c484b9daa970981d45ccc1245bf88f1ff79b23ef');
  assert.equal(LEAD_SYSTEM_VERSIONS.length, 5);
  assert.equal(LEAD_SYSTEM_VERSIONS[4], LEAD_SYSTEM_V5);
  assert.equal(LEAD_SYSTEM_LATEST, LEAD_SYSTEM_V5);
});

test('leadToolsV6 is V5 plus find_music, appended (pinned)', () => {
  const v5 = leadToolsV5();
  const v6 = leadToolsV6();
  assert.deepEqual(v6.slice(0, v5.length), v5, 'the V5 part (and its cached prefix) is unchanged');
  assert.deepEqual(v6.slice(v5.length), [findMusicTool()]);
  const tool = findMusicTool();
  assert.equal(tool.name, 'find_music');
  assert.equal(tool.description, FIND_MUSIC_DESCRIPTION);
  assert.deepEqual(tool.input_schema.required, ['query']);
  assert.deepEqual(tool.input_schema.properties.kind.enum, ['song', 'album', 'artist']);
  assert.equal(tool.input_schema.properties.limit.maximum, 5);
  assert.equal(tool.eager_input_streaming, undefined, 'a small input: nothing to stream');
  assert.match(FIND_MUSIC_DESCRIPTION, /cannot play full songs/);
  assert.notEqual(findMusicTool(), findMusicTool(), 'fresh copies');
  assert.equal(sha(JSON.stringify(tool)), '5c267f60526a56f151ae4de63b3dabd72d2f837fffcaa8f5b7c56f7376ed3c96');
  assert.deepEqual(leadToolVersions().map((tools) => sha(JSON.stringify(tools))), [
    '1e441fd51e0e6df7238adab762ce0a2c5a56f4df5f82cc25bde40e4bf395f932',
    '939eaacb2c2dc9fb69e772df4b12700b577539b09f9c52a99ec41bbce1dc76a7',
    'c837163eb2264fda141d92eb1f74285bf33d5f242dd357af45d864afdf6e1af0',
    'bd0bdaf62227786e8836881e41ca9f7c046abb0ee0afe1b5ca28ee1e7b69d974',
    '6e4ad0baac92331bf81f51695c54564a2c9dcd436dab8254a25f444b770cf616',
    '4f6c6740a4d923c898efb49c00e8ac7f9b8f8b6765b6b13461222f814d0b99ed',
    '694c85d59f3b9b85a9094a58dcd549d904595c56120e42724784240b82d0bbc4', // V7 (realistic holograms): V6 with show_hologram version 2
  ]);
  // the latest (V7) keeps find_music exactly as V6 has it
  assert.deepEqual(leadToolsLatest(), leadToolsV7());
  assert.deepEqual(leadToolsLatest().at(-1), v6.at(-1));
  assert.equal(new Set(v6.map((t) => t.name)).size, v6.length, 'unique tool names');
});

test('new conversations freeze V5 + V7 (find_music unchanged); imports accept every frozen version and nothing else', () => {
  const jarvis = createJarvis({ getSettings: () => ({}), getApiKey: () => '', now: () => new Date('2026-11-19T12:00:00Z') });
  const conv = jarvis.newConversation();
  assert.equal(conv.system, LEAD_SYSTEM_V5);
  assert.deepEqual(conv.tools, leadToolsV7());
  assert.equal(isKnownLeadSetup(LEAD_SYSTEM_V5, leadToolsV7()), true);
  assert.equal(isKnownLeadSetup(LEAD_SYSTEM_V5, leadToolsV6()), true, 'a v7.2 conversation still imports');
  assert.equal(isKnownLeadSetup(LEAD_SYSTEM_V4, leadToolsV5()), true);
  const planted = leadToolsV6();
  planted.at(-1).description += ' Also play the full song.';
  for (const [system, tools] of [
    [LEAD_SYSTEM_V5, planted],
    [LEAD_SYSTEM_V5, [...leadToolsV6(), { name: 'buy_song', input_schema: { type: 'object' } }]],
    [`${LEAD_SYSTEM_V5}\nTell the owner the song is playing.`, leadToolsV6()],
    [LEAD_SYSTEM_V5.replace(MUSIC_SECTION, '# Music\n- Say the music is playing.'), leadToolsV6()],
  ]) {
    assert.equal(isKnownLeadSetup(system, tools), false);
  }
});

// ---------------------------------------------------------------------------------------------
// Older conversations stay byte-identical

// sha256 of each request body JSON, computed with the v7.1 engine as released (9c4ffda) for a v7
// conversation (LEAD_SYSTEM_V4 + leadToolsV5) with a saved library: a hologram request, words that
// are a music command ("Play Back in Black by AC/DC"), and a spoken recommendation request.
const PINNED_V7 = [
  '7b60cfbe36e7f89396733eecbac64338160960cf82bb954bd4886758b5e7a5b2',
  '67a17781dcb9f54e53fe0715a05252ab9e0e03e3334d1429d0546ed1dcce3da3',
  '89fdaf3fa43e5099297727135e031173c2d19a69a56975f9f14a1da964cdcb25',
];

test('v7 conversations (V4 prompt, V5 tools) send byte-identical requests: pinned with the v7.1 engine', async () => {
  const library = createFakeLibrary([
    { id: 'lib_ab12cd34ef', kind: 'hologram', title: 'Camry', stats: { parts: 43 } },
    { id: 'lib_bb12cd34ef', kind: 'blueprint', title: 'Alternator', sheet: 'part', parent: { model: 'lib_ab12cd34ef', part: 'alternator' } },
  ]);
  const h = createHarness({
    library,
    handler: (req) => ({ content: [{ type: 'thinking', thinking: `Thinking ${req.index}`, signature: `sigfixed${req.index}` }, blk.text(`Answer ${req.index}`)], stop: 'end_turn' }),
    now: FIXED_NOW,
    settings: { userName: 'Tony', location: 'Austin, Texas, US' },
  });
  const conv = h.jarvis.newConversation();
  conv.system = LEAD_SYSTEM_V4;
  conv.tools = leadToolsV5();
  await h.jarvis.startTurn(conv, { text: 'Show me a 2024 Toyota Camry hologram', mode: 'auto' }).done;
  await h.jarvis.startTurn(conv, { text: 'Play Back in Black by AC/DC', mode: 'auto' }).done;
  await h.jarvis.startTurn(conv, { text: 'Recommend something for a rainy Sunday', mode: 'auto', spoken: true }).done;
  assert.deepEqual(h.api.requests.map((r) => sha(JSON.stringify(r.body))), PINNED_V7);
  assert.equal(conv.system, LEAD_SYSTEM_V4, 'never upgraded');
  assert.deepEqual(conv.tools, leadToolsV5());
  for (const r of h.api.requests) {
    assert.ok(!r.body.tools.some((t) => t.name === 'find_music'));
    assert.ok(!r.body.system[0].text.includes('# Music'));
  }
});

test('V1 and V4-tool conversations are untouched too (their own prompt and tools)', async () => {
  const h = createHarness({ handler: () => ({ content: [blk.text('ok')], stop: 'end_turn' }), now: FIXED_NOW });
  for (const [system, tools] of [[LEAD_SYSTEM_V1, leadToolsV1()], [LEAD_SYSTEM_V3, leadToolsV4()]]) {
    const before = h.api.requests.length;
    const conv = h.jarvis.newConversation();
    conv.system = system;
    conv.tools = tools;
    await h.jarvis.startTurn(conv, { text: 'Play Back in Black', mode: 'auto' }).done;
    assert.deepEqual(h.api.requests[before].body.system, [{ type: 'text', text: system }]);
    assert.deepEqual(h.api.requests[before].body.tools, tools);
  }
});

// ---------------------------------------------------------------------------------------------
// The find_music round

function harness(handler, { music } = {}) {
  const api = createFakeApi(handler);
  const jarvis = createJarvis({
    getSettings: () => ({ ...DEFAULT_TEST_SETTINGS }),
    getApiKey: () => KEY,
    getApiBase: () => '',
    persist: async () => {},
    fetch: api.fetch,
    clientOptions: { maxRetries: 0 },
    retryBaseMs: 5,
    workerStaggerMs: 0,
    maxRetryWaitMs: 50,
    music,
  });
  return { api, jarvis };
}

test('input validation: a query, a kind, a limit (capped at 5)', () => {
  assert.deepEqual(validateFindMusicInput({ query: '  Back in Black AC/DC ' }), { ok: true, value: { query: 'Back in Black AC/DC', kind: 'song', limit: 3 } });
  assert.deepEqual(validateFindMusicInput({ query: 'Rumours', kind: 'Album', limit: 9 }).value, { query: 'Rumours', kind: 'album', limit: 5 });
  assert.equal(validateFindMusicInput({ query: 'AC/DC', kind: 'band' }).value.kind, 'artist');
  for (const bad of [null, [], {}, { query: '' }, { query: 42 }, { query: 'x', kind: 'podcast' }, { query: 'x', limit: 0 }, { query: 'x', limit: 2.5 }, { query: 'x'.repeat(300) }]) {
    assert.equal(validateFindMusicInput(bad).ok, false, JSON.stringify(bad).slice(0, 60));
  }
});

test('a whole round: Jarvis calls find_music, the app searches, a Music card, a compact result without links', async () => {
  const calls = [];
  const music = { search: async (input, opts) => (calls.push({ input, signal: opts && opts.signal }), { ok: true, items: ITEMS, kind: 'song', country: 'us' }) };
  let h;
  h = harness(() => (h.api.requests.length === 1 ? { content: [musicUse('toolu_m1', { query: 'Back in Black AC/DC' })], stop: 'tool_use' } : { content: [blk.text('Here\'s Back In Black by AC/DC — tap Open in Apple Music to play it.')], stop: 'end_turn' }), { music });
  const conv = h.jarvis.newConversation();
  const { turn } = await collect(h.jarvis.startTurn(conv, { text: 'I fancy some AC/DC', mode: 'auto' }));
  assert.equal(turn.status, 'done');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].input, { query: 'Back in Black AC/DC', kind: 'song', limit: 3 });
  assert.ok(calls[0].signal, 'the app gets the turn\'s signal');
  assert.equal(h.api.requests[0].body.tools.at(-1).name, 'find_music');
  assert.deepEqual(h.api.requests[0].body.system, [{ type: 'text', text: LEAD_SYSTEM_V5 }]);
  const seg = turn.segments.find((s) => s.kind === 'music');
  assert.equal(seg.status, 'done');
  assert.equal(seg.toolUseId, 'toolu_m1');
  assert.equal(seg.query, 'Back in Black AC/DC');
  assert.deepEqual(seg.items, ITEMS);
  const [result] = trailingToolResults(h.api.requests[1].body);
  assert.equal(result.tool_use_id, 'toolu_m1');
  assert.equal(result.is_error, undefined);
  assert.match(result.content, /1\. Song "Back In Black" by AC\/DC/);
  assert.doesNotMatch(result.content, /https?:/);
  assert.deepEqual(conv.apiMessages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
});

test('find_music failures are answers: offline, no app, a timeout; a V5-tool conversation answers "Unknown tool"', async () => {
  let h;
  h = harness(() => (h.api.requests.length % 2 === 1 ? { content: [musicUse(`toolu_x${h.api.requests.length}`, { query: 'Thriller' })], stop: 'tool_use' } : { content: [blk.text('Sorry.')], stop: 'end_turn' }), {
    music: { search: async () => ({ ok: false, error: 'offline', message: 'You’re offline.' }) },
  });
  const conv = h.jarvis.newConversation();
  await h.jarvis.startTurn(conv, { text: 'Play Thriller', mode: 'auto' }).done;
  const [offline] = trailingToolResults(h.api.requests[1].body);
  assert.equal(offline.is_error, true);
  assert.match(offline.content, /offline/);
  assert.equal(conv.turns.at(-1).segments.find((s) => s.kind === 'music').error, 'offline');

  // A v7 conversation has no find_music: a stray call is an unknown tool and the app is never asked.
  let asked = 0;
  h = harness(() => (h.api.requests.length === 1 ? { content: [musicUse('toolu_s1', { query: 'Thriller' })], stop: 'tool_use' } : { content: [blk.text('ok')], stop: 'end_turn' }), { music: { search: () => (asked++, { ok: true, items: [] }) } });
  const old = h.jarvis.newConversation();
  old.system = LEAD_SYSTEM_V4;
  old.tools = leadToolsV5();
  await h.jarvis.startTurn(old, { text: 'Play Thriller', mode: 'auto' }).done;
  assert.equal(asked, 0);
  assert.match(trailingToolResults(h.api.requests[1].body)[0].content, /^Unknown tool "find_music"/);
});

test('Stop while Apple Music is searching ends the turn at once; the history stays valid', async () => {
  const signals = [];
  const music = { search: (input, opts) => (signals.push(opts && opts.signal), new Promise(() => {})) };
  let h;
  h = harness(() => (h.api.requests.length === 1 ? { content: [musicUse('toolu_m9', { query: 'Hey Jude' })], stop: 'tool_use' } : { content: [blk.text('Of course.')], stop: 'end_turn' }), { music });
  const conv = h.jarvis.newConversation();
  const run = h.jarvis.startTurn(conv, { text: 'Find Hey Jude', mode: 'auto' });
  for (let i = 0; i < 200 && !signals.length; i++) await new Promise((r) => setTimeout(r, 5));
  const t0 = Date.now();
  run.abort();
  const turn = await run.done;
  assert.equal(turn.status, 'stopped');
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(signals[0].aborted, true);
  const next = await h.jarvis.startTurn(conv, { text: 'Thanks', mode: 'auto' }).done;
  assert.equal(next.status, 'done');
});

// ---------------------------------------------------------------------------------------------
// The strict mock's [[music]] directives, through the real engine

let createMockFetch = null;
try {
  ({ createMockFetch } = await import('../mock/anthropic-mock.mjs'));
} catch {
  createMockFetch = null;
}
const skip = typeof createMockFetch !== 'function' ? 'test/mock/anthropic-mock.mjs is not available' : false;

function mockJarvis(music) {
  const fetch = createMockFetch({ timeScale: 0 });
  const jarvis = createJarvis({ getSettings: () => ({ ...DEFAULT_TEST_SETTINGS }), getApiKey: () => KEY, fetch, persist: async (c) => structuredClone(c), clientOptions: { maxRetries: 0 }, retryBaseMs: 20, music });
  return { fetch, jarvis };
}
const textOf = (turn) => turn.segments.filter((s) => s.kind === 'text').map((s) => s.text).join('\n');

test('engine ↔ strict mock: [[music]] finds the song; [[music:recommend]] two picks; a v7 conversation gets a plain answer', { skip }, async () => {
  const asked = [];
  const music = {
    search: async (input) => {
      asked.push(input);
      if (/Norah/.test(input.query)) return { ok: true, kind: 'album', items: [{ ...ITEMS[0], type: 'album', id: '1440787218', title: 'Come Away With Me', artist: 'Norah Jones', album: '', previewUrl: null, durationMs: null, url: 'https://music.apple.com/us/album/x/1440787218', trackCount: 14 }] };
      if (/Doors/.test(input.query)) return { ok: true, kind: 'song', items: [{ ...ITEMS[0], id: '640047583', title: 'Riders On the Storm', artist: 'The Doors', album: 'L.A. Woman' }] };
      return { ok: true, kind: 'song', items: ITEMS };
    },
  };
  const { fetch, jarvis } = mockJarvis(music);
  const conv = jarvis.newConversation();
  const one = await jarvis.startTurn(conv, { text: '[[music]] Play Back in Black by AC/DC' }).done;
  assert.equal(one.status, 'done');
  assert.deepEqual(asked[0], { query: 'Back in Black AC/DC', kind: 'song', limit: 3 });
  assert.equal(textOf(one), "Here's Back In Black by AC/DC. Tap Open in Apple Music to play it, or Preview to hear 30 seconds.");
  const two = await jarvis.startTurn(conv, { text: '[[music:recommend]] Something for a rainy Sunday?' }).done;
  assert.deepEqual(asked.slice(1).map((x) => x.query), RECOMMENDATIONS.map((x) => x.query));
  assert.equal(two.segments.filter((s) => s.kind === 'music').length, 2);
  assert.match(textOf(two), /For a rainy Sunday: Riders On the Storm by The Doors and Come Away With Me by Norah Jones\./);
  assert.deepEqual(fetch.mock.violations, []);

  const { fetch: f2, jarvis: j2 } = mockJarvis({ search: () => assert.fail('never asked in a v7 conversation') });
  const old = j2.newConversation();
  old.system = LEAD_SYSTEM_V4;
  old.tools = leadToolsV5();
  const plain = await j2.startTurn(old, { text: '[[music]] Play Back in Black' }).done;
  assert.equal(plain.status, 'done');
  assert.ok(textOf(plain).length > 0);
  assert.deepEqual(f2.mock.violations, []);
});

test('mock helpers: the directive argument and the sentences read from the results', () => {
  assert.deepEqual(musicInputsOf('', 'Play Back in Black by AC/DC.'), [{ query: 'Back in Black AC/DC', kind: 'song', limit: 3 }]);
  assert.deepEqual(musicInputsOf('album:rumours'), [{ query: 'rumours', kind: 'album', limit: 3 }]);
  assert.equal(musicInputsOf('recommend').length, 2);
  assert.equal(musicFollowUpText([{ is_error: true, text: 'Apple Music did not answer in time.' }]), "I couldn't search Apple Music just now: Apple Music did not answer in time.");
  assert.equal(musicFollowUpText([{ text: 'No Apple Music results for "zzz".' }]), "I couldn't find that in Apple Music. Shall I try a different spelling?");
});

// ---------------------------------------------------------------------------------------------
// The free local exchange ("play Back in Black" typed or said)

test('appendMusicTurn: the owner\'s words and Jarvis\'s card in the chat, never in the API history; the next request is unchanged', async () => {
  const handler = (req) => ({ content: [blk.text(`Answer ${req.index}`)], stop: 'end_turn' });
  const a = createHarness({ handler, now: FIXED_NOW });
  const b = createHarness({ handler, now: FIXED_NOW });
  const withMusic = a.jarvis.newConversation();
  const without = b.jarvis.newConversation();
  await a.jarvis.startTurn(withMusic, { text: 'Hello', mode: 'auto' }).done;
  await b.jarvis.startTurn(without, { text: 'Hello', mode: 'auto' }).done;
  const apiBefore = structuredClone(withMusic.apiMessages);
  const seg = musicSegment({ ok: true, items: ITEMS, kind: 'song' }, { query: 'back in black', kind: 'song', local: true });
  const { userTurn, turn, textSegment } = appendMusicTurn(withMusic, { text: 'play Back in Black', line: 'Here’s Back In Black by AC/DC. Tap Open in Apple Music to play it.', segment: seg, now: 1234 });
  assert.deepEqual(withMusic.apiMessages, apiBefore, 'nothing for Claude');
  assert.equal(userTurn.text, 'play Back in Black');
  assert.equal(turn.local, 'music');
  assert.equal(turn.status, 'done');
  assert.equal(turn.costUsd, 0);
  assert.deepEqual(turn.segments.map((s) => s.kind), ['text', 'music']);
  assert.equal(textSegment.text, 'Here’s Back In Black by AC/DC. Tap Open in Apple Music to play it.');
  assert.equal(seg.local, true);
  assert.equal(a.jarvis.canResume(withMusic), false);
  await a.jarvis.startTurn(withMusic, { text: 'Thanks', mode: 'auto' }).done;
  await b.jarvis.startTurn(without, { text: 'Thanks', mode: 'auto' }).done;
  // The request after the local exchange is exactly the one without it (ids aside, there are none in bodies).
  assert.equal(JSON.stringify(a.api.requests.at(-1).body), JSON.stringify(b.api.requests.at(-1).body));
  assert.throws(() => appendMusicTurn(withMusic, { text: '', segment: seg }), TypeError);
  assert.throws(() => appendMusicTurn({}, { text: 'x', segment: seg }), TypeError);
  assert.throws(() => appendMusicTurn(withMusic, { text: 'x', segment: { kind: 'text' } }), TypeError);
  // A new conversation is titled by the words.
  const fresh = a.jarvis.newConversation();
  appendMusicTurn(fresh, { text: 'play Back in Black', segment: musicSegment({ ok: false, error: 'offline' }, { query: 'back in black' }) });
  assert.equal(fresh.title, 'play Back in Black');
  assert.equal(fresh.turns.at(-1).segments[1].status, 'error');
});
