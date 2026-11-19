// Attachments, per-turn swarm size, reply style and the V2 lead prompt (SPEC §15.1), through the
// real SDK against the scripted fake API (engine.support) and the strict mock Claude API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  ATTACHMENT_ONLY_TEXT,
  AttachmentInputError,
  ENGINE_ATTACHMENT_LIMITS,
  assertRequestFits,
  normalizeAttachments,
  sniffImageType,
} from '../../src/engine/attachments.js';
import { LEAD_SYSTEM_V1, LEAD_SYSTEM_V2, LENGTH_STYLES, TONE_STYLES, buildTurnContext, styleLine } from '../../src/engine/prompts.js';
import { createJarvis } from '../../src/engine/index.js';
import {
  DEFAULT_TEST_SETTINGS,
  KEY,
  blk,
  createHarness,
  createMemory,
  deployInput,
  isLeadBody,
  missionsOf,
  runTurn,
  segmentsOf,
  trailingToolResults,
  workerReply,
} from './engine.support.test.mjs';
import { SIGNATURES, makePdf, makePng } from '../mock/fixtures.mjs';

// ---------------------------------------------------------------------------------------------
// Fixtures: real file bytes (a decodable PNG, a minimal PDF) and the signatures of the other types.

const JPEG_HEAD = SIGNATURES.jpeg;
const PNG_B64 = makePng(48, 32).toString('base64');
const PDF_B64 = makePdf(2).toString('base64');
const THUMB = `data:image/jpeg;base64,${JPEG_HEAD.toString('base64')}`;

const image = (extra = {}) => ({ id: 'img-1', kind: 'image', name: 'Desk.png', mediaType: 'image/png', size: 900, data: PNG_B64, thumb: THUMB, width: 48, height: 32, ...extra });
const pdf = (extra = {}) => ({ id: 'pdf-1', kind: 'pdf', name: 'Report.pdf', mediaType: 'application/pdf', size: 600, data: PDF_B64, thumb: null, width: null, height: null, ...extra });
const answer = (text) => ({ content: [blk.thinking('Looking at it.'), blk.text(text)], stop: 'end_turn' });

// ---------------------------------------------------------------------------------------------

test('attachments: content blocks follow [turn_context, ...files, text]; shapes match the SDK types', async () => {
  const h = createHarness({ handler: () => answer('I can see them.') });
  const conv = h.jarvis.newConversation();
  const run = h.jarvis.startTurn(conv, { text: '  What do these show?  ', mode: 'auto', attachments: [image(), pdf()] });
  const turn = await run.done;
  assert.equal(turn.status, 'done');
  const content = h.api.requests[0].body.messages[0].content;
  assert.deepEqual(content.map((b) => b.type), ['text', 'image', 'document', 'text']);
  assert.match(content[0].text, /^<turn_context>\n/);
  // BetaImageBlockParam { type, source: BetaBase64ImageSource } and BetaRequestDocumentBlock { type, source: BetaBase64PDFSource, title }.
  assert.deepEqual(content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } });
  assert.deepEqual(content[2], { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: PDF_B64 }, title: 'Report.pdf' });
  assert.deepEqual(content[3], { type: 'text', text: 'What do these show?' });
  assert.ok(!/\s/.test(content[1].source.data) && !content[1].source.data.startsWith('data:'), 'raw base64, no prefix, no line breaks');
  assert.equal(conv.turns[0].text, 'What do these show?');
  assert.equal(conv.title, 'What do these show?');
});

test('attachments: the UserTurn keeps display metadata only (never base64), in persisted copies too', async () => {
  const h = createHarness({ handler: () => answer('Noted.') });
  const conv = h.jarvis.newConversation();
  await h.jarvis.startTurn(conv, { text: 'Look', attachments: [image(), pdf()] }).done;
  const expected = [
    { id: 'img-1', kind: 'image', name: 'Desk.png', mediaType: 'image/png', size: 900, thumb: THUMB, width: 48, height: 32 },
    { id: 'pdf-1', kind: 'pdf', name: 'Report.pdf', mediaType: 'application/pdf', size: 600, thumb: null, width: null, height: null },
  ];
  assert.deepEqual(conv.turns[0].attachments, expected);
  assert.ok(!JSON.stringify(conv.turns).includes(PNG_B64.slice(0, 40)), 'turns never hold the image data');
  assert.ok(!JSON.stringify(conv.turns).includes(PDF_B64.slice(0, 40)), 'turns never hold the PDF data');
  assert.ok(JSON.stringify(conv.apiMessages).includes(PNG_B64), 'the API history does (it is re-sent every request)');
  const saved = h.persisted.at(-1);
  assert.deepEqual(saved.turns[0].attachments, expected);
  assert.equal('attachments' in conv.turns[1], false, 'the Jarvis turn has no attachments');
});

test('attachments only: the engine adds the default text; the title comes from the file names', async () => {
  const h = createHarness({ handler: () => answer('A desk.') });
  const conv = h.jarvis.newConversation();
  const turn = await h.jarvis.startTurn(conv, { text: '   ', attachments: [image({ name: 'Photo' })] }).done;
  assert.equal(turn.status, 'done');
  const content = h.api.requests[0].body.messages[0].content;
  assert.deepEqual(content.map((b) => b.type), ['text', 'image', 'text']);
  assert.equal(content[2].text, ATTACHMENT_ONLY_TEXT);
  assert.equal(ATTACHMENT_ONLY_TEXT, 'Please look at the attached file(s).');
  assert.equal(conv.turns[0].text, '', 'the bubble shows what the owner typed: nothing');
  assert.equal(conv.title, 'Photo');

  const conv2 = h.jarvis.newConversation();
  await h.jarvis.startTurn(conv2, { attachments: [image({ name: 'Photo' }), pdf()] }).done;
  assert.equal(conv2.title, 'Photo + 1 more');
  assert.throws(() => h.jarvis.startTurn(h.jarvis.newConversation(), { text: '  ', attachments: [] }), /text is required/);
});

test('attachments: invalid files are rejected before anything is appended; labels follow the bytes', () => {
  const h = createHarness({ handler: () => answer('ok') });
  const conv = h.jarvis.newConversation();
  const reject = (attachments, pattern) => {
    assert.throws(() => h.jarvis.startTurn(conv, { text: 'Look', attachments }), pattern);
    assert.deepEqual(conv.apiMessages, []);
    assert.deepEqual(conv.turns, []);
  };
  reject([image({ data: '' })], (e) => e instanceof AttachmentInputError && /“Desk\.png” has no readable data/.test(e.message));
  reject([image({ data: 'not base64!' })], AttachmentInputError);
  reject([image({ data: Buffer.from('GIF? no, plain text').toString('base64') })], /Claude reads JPEG, PNG, GIF and WebP images and PDF documents/);
  reject([pdf({ data: PNG_B64 })], /isn’t a valid PDF/);
  reject([image({ data: 'A'.repeat(ENGINE_ATTACHMENT_LIMITS.imageMaxBase64 - 64) + PNG_B64.slice(0, 64) })], AttachmentInputError);
  assert.throws(() => h.jarvis.startTurn(conv, { text: 'x', attachments: 'nope' }), TypeError);
  assert.throws(() => h.jarvis.startTurn(conv, { text: 'x', attachments: [null] }), TypeError);

  // Lenient where it is safe: a data: URL prefix and whitespace are removed, a PNG labelled JPEG is
  // relabelled, an unsafe thumb is dropped, bad dimensions become null.
  const [fixed] = normalizeAttachments([image({ mediaType: 'image/jpeg', data: `data:image/png;base64,${PNG_B64.slice(0, 20)}\n${PNG_B64.slice(20)}`, thumb: 'javascript:alert(1)', width: -3, height: 'x' })]);
  assert.equal(fixed.mediaType, 'image/png');
  assert.equal(fixed.data, PNG_B64);
  assert.equal(fixed.thumb, null);
  assert.equal(fixed.width, null);
  assert.equal(fixed.height, null);
  const [unnamed] = normalizeAttachments([{ kind: 'pdf', data: PDF_B64 }]);
  assert.equal(unnamed.name, 'Document.pdf');
  assert.equal(unnamed.mediaType, 'application/pdf');
  assert.equal(unnamed.size, makePdf(2).length);
  assert.match(unnamed.id, /\S/);
  assert.equal(sniffImageType(JPEG_HEAD.toString('base64')), 'image/jpeg');
  assert.equal(sniffImageType(SIGNATURES.gif.toString('base64')), 'image/gif');
  assert.equal(sniffImageType(SIGNATURES.webp.toString('base64')), 'image/webp');
});

test('attachments: a request that would be too large, or hold too many images, is refused up front', () => {
  const big = { role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'A'.repeat(20 * 1024 * 1024) } }] };
  const more = { role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'A'.repeat(12 * 1024 * 1024) } }] };
  assert.doesNotThrow(() => assertRequestFits([], big));
  assert.throws(() => assertRequestFits([big], more), (e) => e instanceof AttachmentInputError && /too large to send with this conversation \(about 32 MB/.test(e.message));
  const photos = (n) => ({ role: 'user', content: Array.from({ length: n }, () => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } })) });
  assert.doesNotThrow(() => assertRequestFits([photos(60)], photos(40)));
  assert.throws(() => assertRequestFits([photos(60)], photos(41)), /would hold 101 images, and Claude accepts up to 100/);

  // Through startTurn: nothing is appended when the conversation cannot take the files.
  const h = createHarness({ handler: () => answer('ok') });
  const conv = h.jarvis.newConversation();
  conv.apiMessages.push(photos(99), { role: 'assistant', content: [{ type: 'text', text: 'Seen.' }] });
  assert.throws(() => h.jarvis.startTurn(conv, { text: 'Two more', attachments: [image(), image({ id: 'img-2' })] }), /101 images/);
  assert.equal(conv.apiMessages.length, 2);
});

// ---------------------------------------------------------------------------------------------

function swarmHandler({ deployAgents = 5, onLead } = {}) {
  return (req) => {
    if (isLeadBody(req.body)) {
      onLead?.(req);
      const results = trailingToolResults(req.body);
      if (results.length) return answer(`Synthesis: ${results[0].content.split('\n')[0]}`);
      return { content: [blk.text('Deploying.'), blk.deploy('toolu_d1', deployInput(deployAgents))], stop: 'tool_use' };
    }
    return workerReply('Agent');
  };
}

test('maxAgents: the per-turn override shows in turn_context and clamps deploy_agents, for that turn only', async () => {
  const h = createHarness({ handler: swarmHandler({ deployAgents: 5 }) });
  const conv = h.jarvis.newConversation();
  const { turn } = await (async () => ({ turn: await h.jarvis.startTurn(conv, { text: 'Compare heat pumps', mode: 'swarm', maxAgents: 3 }).done }))();
  assert.equal(turn.status, 'done');
  assert.equal(turn.maxAgents, 3);
  const leads = h.api.byKind('lead');
  assert.match(leads[0].body.messages[0].content[0].text, /^Agent limits: up to 3 agents per wave, at most 3 waves this turn$/m);
  const [mission] = missionsOf(turn);
  assert.equal(mission.agents.length, 3, 'only the first 3 of 5 agents run');
  assert.deepEqual(mission.agents.map((a) => a.status), ['done', 'done', 'done']);
  assert.match(trailingToolResults(leads[1].body)[0].content, /you asked for 5 agents; only the first 3 were launched \(the limit is 3 agents per wave\)/);

  // The next turn is back on settings.maxAgents (8).
  h.api.reset();
  const next = await h.jarvis.startTurn(conv, { text: 'Again, full team', mode: 'swarm' }).done;
  assert.equal('maxAgents' in next, false);
  assert.match(h.api.byKind('lead')[0].body.messages.at(-1).content[0].text, /^Agent limits: up to 8 agents per wave/m);
  assert.equal(missionsOf(next)[0].agents.length, 5);
});

test('maxAgents: clamped to 1–20; junk is ignored; numeric strings work', async () => {
  const limits = [];
  const h = createHarness({ handler: (req) => {
    limits.push(/Agent limits: up to (\d+) agents/.exec(req.body.messages.at(-1).content[0].text)?.[1]);
    return answer('ok');
  } });
  const conv = h.jarvis.newConversation();
  for (const maxAgents of [50, 0, -4, 'abc', '4', 6.6, null, undefined, NaN, Infinity]) {
    await h.jarvis.startTurn(conv, { text: `Limit ${String(maxAgents)}`, mode: 'swarm', maxAgents }).done;
  }
  assert.deepEqual(limits, ['20', '1', '1', '8', '4', '7', '8', '8', '8', '8']);
});

test('maxAgents: the override survives an interruption and resume', async () => {
  let leadCalls = 0;
  const base = swarmHandler({ deployAgents: 6 });
  const h = createHarness({
    handler: (req) => {
      if (isLeadBody(req.body) && ++leadCalls === 1) return { networkError: true };
      return base(req);
    },
  });
  const conv = h.jarvis.newConversation();
  const first = await h.jarvis.startTurn(conv, { text: 'Research it', mode: 'swarm', maxAgents: 2 }).done;
  assert.equal(first.status, 'interrupted');
  assert.equal(h.jarvis.canResume(conv), true);
  const resumed = await h.jarvis.resumeTurn(conv).done;
  assert.equal(resumed.status, 'done');
  assert.equal(missionsOf(resumed)[0].agents.length, 2, 'the resumed turn still runs at most 2 agents');
});

// ---------------------------------------------------------------------------------------------

test('style line: tone and verbosity from settings, with butler/balanced fallbacks', async () => {
  const h = createHarness({ handler: () => answer('ok') });
  const conv = h.jarvis.newConversation();
  const contextOf = (i) => h.api.requests[i].body.messages.at(-1).content[0].text;
  await runTurn(h.jarvis, conv, 'Default style');
  assert.match(contextOf(0), /^Style: butler tone \(polished and courteous, like a trusted British butler, with a light, dry wit\); balanced length \(match the length to the request\)$/m);
  h.setSettings({ tone: 'friendly', verbosity: 'concise' });
  await runTurn(h.jarvis, conv, 'Friendly and short');
  assert.match(contextOf(1), /^Style: friendly tone \(warm, relaxed and conversational, like a knowledgeable friend\); concise length \(the shortest complete answer: lead with it and skip extras unless asked\)$/m);
  h.setSettings({ tone: 'pirate', verbosity: 42 });
  await runTurn(h.jarvis, conv, 'Unknown values');
  assert.match(contextOf(2), /^Style: butler tone \(.+\); balanced length \(.+\)$/m);
  // Placement: after who the owner is, before how to work.
  const lines = contextOf(1).split('\n');
  assert.ok(lines.findIndex((l) => l.startsWith('Address the owner as')) < lines.findIndex((l) => l.startsWith('Style:')));
  assert.ok(lines.findIndex((l) => l.startsWith('Style:')) < lines.findIndex((l) => l.startsWith('Mode:')));
  for (const tone of Object.keys(TONE_STYLES)) {
    for (const verbosity of Object.keys(LENGTH_STYLES)) {
      const line = styleLine(tone, verbosity);
      assert.ok(!line.includes('\n') && line.length < 260, `${tone}/${verbosity} is one crisp line`);
      assert.match(buildTurnContext({ localTime: 'T', mode: 'auto', maxAgents: 8, maxWaves: 3, memoryEnabled: true, memoryFacts: [], tone, verbosity }), new RegExp(`^Style: ${tone} tone .+; ${verbosity} length `, 'm'));
    }
  }
});

test('system prompt: new conversations freeze V2; a conversation created with V1 keeps it', async () => {
  const h = createHarness({ handler: () => answer('ok') });
  const fresh = h.jarvis.newConversation();
  assert.equal(fresh.system, LEAD_SYSTEM_V2);
  await runTurn(h.jarvis, fresh, 'Hello');
  assert.deepEqual(h.api.requests[0].body.system, [{ type: 'text', text: LEAD_SYSTEM_V2 }]);

  const old = h.jarvis.newConversation();
  old.system = LEAD_SYSTEM_V1; // as saved by version 1 of the app
  await runTurn(h.jarvis, old, 'Hello again');
  await runTurn(h.jarvis, old, 'And a photo', 'auto');
  await h.jarvis.startTurn(old, { text: 'With a file', attachments: [image()] }).done;
  for (const r of h.api.requests.slice(1)) assert.deepEqual(r.body.system, [{ type: 'text', text: LEAD_SYSTEM_V1 }]);
  assert.equal(old.system, LEAD_SYSTEM_V1);

  // V2 = V1's guidance plus attachments and style.
  for (const heading of ['# Character', '# <turn_context>', '# Choosing how to work', '# Deploying agents', '# Writing the answer', '# Memory', '# Safety and honesty']) {
    assert.ok(LEAD_SYSTEM_V1.includes(heading) && LEAD_SYSTEM_V2.includes(heading), heading);
  }
  assert.match(LEAD_SYSTEM_V2, /# Photos and documents/);
  assert.match(LEAD_SYSTEM_V2, /Agents cannot see the photos or documents the owner attached/);
  assert.match(LEAD_SYSTEM_V2, /Please look at the attached file\(s\)\./);
  assert.match(LEAD_SYSTEM_V2, /# Style\nThe Style line in <turn_context>/);
  assert.doesNotMatch(LEAD_SYSTEM_V1, /attach|Style line/i, 'V1 is unchanged');
});

test('history stays append-only across a turn with attachments; the files are re-sent byte for byte', async () => {
  const h = createHarness({ handler: () => answer('ok') });
  const conv = h.jarvis.newConversation();
  await h.jarvis.startTurn(conv, { text: 'Here is my desk', attachments: [image(), pdf()] }).done;
  const afterTurn1 = structuredClone(conv.apiMessages);
  await runTurn(h.jarvis, conv, 'What colour is it?');
  await h.jarvis.startTurn(conv, { attachments: [image({ id: 'img-2', name: 'Second.png' })] }).done;
  const [r1, r2, r3] = h.api.requests.map((r) => r.body);
  assert.deepEqual(r2.messages.slice(0, afterTurn1.length), afterTurn1);
  assert.equal(r2.messages.length, afterTurn1.length + 1);
  assert.deepEqual(r3.messages.slice(0, r2.messages.length), r2.messages, 'each request extends the previous one');
  assert.equal(r3.messages.length, r2.messages.length + 2);
  assert.deepEqual(r2.system, r1.system);
  assert.deepEqual(r2.tools, r1.tools);
  assert.equal(r3.messages[0].content[1].source.data, PNG_B64);
  assert.deepEqual(r3.messages.at(-1).content.map((b) => b.type), ['text', 'image', 'text']);
});

test('a file Claude rejects is withdrawn from the history, so the conversation keeps working', async () => {
  let calls = 0;
  const h = createHarness({
    handler: () => {
      calls += 1;
      if (calls === 1) return { error: { status: 400, type: 'invalid_request_error', message: 'messages.0.content.1.image.source.base64: Image does not match the provided media type image/png' } };
      if (calls === 3) return { error: { status: 400, type: 'invalid_request_error', message: 'messages: something else is wrong' } };
      return answer('Fine now.');
    },
  });
  const conv = h.jarvis.newConversation();
  const failed = await h.jarvis.startTurn(conv, { text: 'What is this?', attachments: [image()] }).done;
  assert.equal(failed.status, 'error');
  assert.equal(failed.error.kind, 'bad_request');
  assert.match(failed.error.message, /^Claude couldn’t accept the attached file, so this message was left out of the conversation\. Try a different file\. \(messages\.0\.content\.1\.image/);
  assert.deepEqual(conv.apiMessages, [], 'the rejected message was withdrawn');
  assert.equal(conv.turns.length, 2, 'the transcript still shows it');
  assert.equal(conv.turns[0].attachments.length, 1);
  assert.equal(segmentsOf(failed, 'error').length, 1);

  const next = await runTurn(h.jarvis, conv, 'Never mind, hello');
  assert.equal(next.turn.status, 'done');
  assert.equal(h.api.requests[1].body.messages.length, 1);
  assert.ok(!JSON.stringify(h.api.requests[1].body).includes(PNG_B64), 'the rejected image is never sent again');

  // A text-only message that fails keeps v1 behaviour (it stays in the history).
  const textFail = await runTurn(h.jarvis, conv, 'Plain text that fails');
  assert.equal(textFail.turn.status, 'error');
  assert.equal(conv.apiMessages.at(-1).role, 'user');
  assert.equal(conv.apiMessages.at(-1).content.at(-1).text, 'Plain text that fails');
});

test('a file that is too large for the model (413) is withdrawn with a clear message', async () => {
  let calls = 0;
  const h = createHarness({
    handler: () => (++calls === 1 ? { error: { status: 413, type: 'request_too_large', message: 'Request exceeds the maximum allowed number of bytes.' } } : answer('ok')),
  });
  const conv = h.jarvis.newConversation();
  const turn = await h.jarvis.startTurn(conv, { attachments: [pdf(), pdf({ id: 'pdf-2' })] }).done;
  assert.equal(turn.status, 'error');
  assert.equal(turn.error.kind, 'context');
  assert.equal(turn.error.message, 'The attached files are too large for Claude to read here, so this message was left out of the conversation. Try fewer or smaller files.');
  assert.deepEqual(conv.apiMessages, []);
});

// ---------------------------------------------------------------------------------------------

let createMockFetch = null;
try {
  ({ createMockFetch } = await import('../mock/anthropic-mock.mjs'));
} catch {
  createMockFetch = null;
}
const skip = typeof createMockFetch !== 'function' ? 'test/mock/anthropic-mock.mjs is not available' : false;

test('engine ↔ strict mock: photos and PDFs are accepted, acknowledged and replayed; swarm size applies', { skip }, async () => {
  const fetch = createMockFetch({ timeScale: 0.02 });
  const jarvis = createJarvis({
    getSettings: () => ({ ...DEFAULT_TEST_SETTINGS, tone: 'professional', verbosity: 'detailed' }),
    getApiKey: () => KEY,
    fetch,
    memory: createMemory(),
    persist: async (conv) => structuredClone(conv),
    clientOptions: { maxRetries: 0 },
    retryBaseMs: 20,
  });
  const conv = jarvis.newConversation();
  const textOf = (t) => segmentsOf(t, 'text').map((s) => s.text).join('\n');

  const seen = await jarvis.startTurn(conv, { text: 'What is on my desk?', attachments: [image()] }).done;
  assert.equal(seen.status, 'done');
  assert.match(textOf(seen), /^I can see the image you shared, sir\./);
  assert.match(textOf(seen), /PNG picture, 48 × 32 pixels/);

  const read = await jarvis.startTurn(conv, { attachments: [pdf()] }).done;
  assert.equal(read.status, 'done');
  assert.match(textOf(read), /^I've read the PDF you shared, sir: “Report\.pdf”\./);
  assert.match(textOf(read), /a PDF of 2 pages/);

  const swarm = await jarvis.startTurn(conv, { text: 'Find me this desk online [[swarm:5]]', mode: 'swarm', maxAgents: 3, attachments: [image({ id: 'img-3' })] }).done;
  assert.equal(swarm.status, 'done');
  assert.equal(missionsOf(swarm)[0].agents.length, 3);
  assert.ok(missionsOf(swarm)[0].agents.every((a) => /Context: the owner shared a PNG photo \(48×32\)/.test(a.task)), 'tasks describe the photo agents cannot see');

  assert.equal((await jarvis.startTurn(conv, { text: 'Thanks, and a plain follow-up' }).done).status, 'done');
  const leads = fetch.mock.requests.filter((r) => r.kind === 'lead');
  const last = leads.at(-1).body;
  assert.equal(last.system[0].text, LEAD_SYSTEM_V2);
  assert.equal(last.messages.filter((m) => m.role === 'user' && m.content.some((b) => b.type === 'image')).length, 2, 'both photos are replayed');
  assert.match(last.messages.at(-1).content[0].text, /^Style: professional tone .+; detailed length /m);
  assert.deepEqual(fetch.mock.violations, []);
  // Usage counts the photo by its pixels, not by its base64 length.
  const first = leads[0];
  assert.ok(first.body.messages[0].content[1].source.data.length > 1000);
});

test('engine sources contain no literal invisible Unicode characters (use escapes)', () => {
  const dir = new URL('../../src/engine/', import.meta.url);
  const invisible = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(new URL(name, dir), 'utf8');
    const line = text.split('\n').findIndex((l) => invisible.test(l));
    assert.equal(line, -1, `${name}:${line + 1} has a literal invisible character`);
  }
});
