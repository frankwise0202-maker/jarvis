// v8.0 Live view, Track U's side: the words that start and stop it (src/lib/optics-commands.js),
// the voice rule with Optics closed, and the strict mock's live answers (test/mock/optics.mjs:
// routing by the system prompt's first words, the scripted scene, the cost per look, 429/529 with
// and without retry-after, a refusal, a reply cut short) and its validator (thinking off on Haiku 5.5).
// The live engine and the budget have their own tests (test/unit/live-*.test.mjs, Track E).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLiveViewRequest, matchOpticsCommand, voiceCameraRequest, voiceLiveViewRequest } from '../../src/lib/optics-commands.js';
import { createMockFetch } from '../mock/anthropic-mock.mjs';
import { LIVE_DEFAULT_SCENE, configureLive, isLiveRequest } from '../mock/optics.mjs';
import { costOf } from '../../src/engine/models.js';
import { KEY } from './engine.support.test.mjs';
import { fakeJpeg } from './optics.support.mjs';

const cmd = (text, opts) => matchOpticsCommand(text, opts);

test('"live view", "start live view", "turn on live view", "watch me", "keep watching" start the live view (typed or said, frozen or not)', () => {
  for (const words of ['Live view', 'live view.', 'Start live view', 'Start the live view', 'Turn on live view', 'Turn the live view on']) {
    for (const frozen of [false, true]) {
      assert.deepEqual(cmd(words, { frozen }), { action: 'liveview', on: true }, `${words} (frozen ${frozen})`);
    }
    assert.equal(isLiveViewRequest(words), true, words);
  }
  // "Watch me", "keep watching": the live view too, marked, because while Watch is on they mean "go on".
  for (const words of ['Jarvis, watch me.', 'Watch me', 'Keep watching', 'Can you keep watching?', 'Keep watching me, please']) {
    for (const frozen of [false, true]) {
      assert.deepEqual(cmd(words, { frozen }), { action: 'liveview', on: true, watching: true }, `${words} (frozen ${frozen})`);
    }
    assert.equal(isLiveViewRequest(words), true, words);
  }
});

test('words that name the live view are the live view\'s: "show me the live view", "back to the live view", "resume live view" start it (or go on with it); "go live", "back to the camera", "unfreeze" are the camera', () => {
  // RPUX-4: before, these were the camera's words: "This is the live view." and nothing started.
  for (const words of ['Show me the live view.', 'Show the live view', 'Resume live view.', 'Resume the live view', 'Go back to the live view', 'Back to live view', 'Back to the live view.', 'Continue the live view', 'Restart live view']) {
    for (const frozen of [false, true]) {
      assert.deepEqual(cmd(words, { frozen }), { action: 'liveview', on: true }, `${words} (frozen ${frozen})`);
    }
    assert.equal(isLiveViewRequest(words), true, words);
  }
  for (const words of ['Go live', 'Live', 'Back to the camera', 'Back to live', 'Show me the camera', 'Resume the camera', 'Unfreeze', 'Unfreeze it']) {
    assert.deepEqual(cmd(words, { frozen: true }), { action: 'live' }, words);
    assert.equal(isLiveViewRequest(words), false, words);
  }
  // v8.1 (E1, changed on purpose): "new picture" and "new look" take a new picture; never Live, never the live view.
  for (const words of ['New picture', 'New look']) {
    assert.deepEqual(cmd(words, { frozen: true }), { action: 'look', question: 'What am I looking at?', explicit: true, fresh: true }, words);
    assert.equal(isLiveViewRequest(words), false, words);
  }
});

test('"stop live view", "turn off live view", "that\'s enough" stop it; "stop watching" stays a watch command (it stops whichever is on)', () => {
  for (const words of ['Stop live view', 'Stop the live view.', 'Turn off live view', 'Turn the live view off', 'Live view off', "That's enough", 'that’s enough.', 'Jarvis, that is enough']) {
    assert.deepEqual(cmd(words), { action: 'liveview', on: false }, words);
    assert.equal(isLiveViewRequest(words), false, words);
  }
  assert.deepEqual(cmd('Stop watching'), { action: 'watch', on: false });
  assert.deepEqual(cmd('Watch this'), { action: 'watch', on: true }, 'Watch (change-triggered) keeps its words');
});

test('the live view words never swallow other Optics words or questions', () => {
  assert.equal(cmd('Go back to the camera').action, 'live', 'back to the camera from a Look');
  assert.equal(cmd('Back to live').action, 'live');
  assert.equal(cmd('What am I looking at?').action, 'look');
  assert.equal(cmd('Close the camera').action, 'close');
  assert.equal(cmd('Keep going').action, 'more');
  assert.equal(cmd('Watch me fix this?').action, 'look', 'a question about "this" is a Look, not the live view');
  for (const words of ['Can you watch me cook tonight and remind me about the oven at 7?', 'I watched a live view of the launch', 'live view of the stadium', 'keep watching the stock price for me']) {
    assert.equal(isLiveViewRequest(words), false, words);
  }
});

test('Voice Mode with Optics closed: "live view" opens the camera by voice only on a computer where it is allowed; else it asks for the tap', () => {
  assert.equal(voiceLiveViewRequest('Live view', { cameraAllowed: 'granted', ios: false }), 'start');
  assert.equal(voiceLiveViewRequest('Watch me', { cameraAllowed: 'granted', ios: false }), 'start');
  assert.equal(voiceLiveViewRequest('Live view', { cameraAllowed: 'granted', ios: true }), 'need-tap', 'iPhone: a tap every time');
  assert.equal(voiceLiveViewRequest('Keep watching', { cameraAllowed: 'prompt', ios: false }), 'need-tap', 'not allowed yet: the tap');
  assert.equal(voiceLiveViewRequest('Live view', { cameraAllowed: 'denied' }), 'need-tap');
  assert.equal(voiceLiveViewRequest('What is the capital of France?', { cameraAllowed: 'granted' }), null);
  assert.equal(voiceCameraRequest('Live view', { cameraAllowed: 'granted' }), null, 'not a Look');
  assert.equal(voiceLiveViewRequest('Show me the live view', { cameraAllowed: 'granted', ios: false }), 'start', 'words that name it');
});

test('Voice Mode with a hologram or blueprint on screen: the live view words never turn the camera on (they are Jarvis\'s, as "what is this?" is)', () => {
  // RPUX-1: before, "keep watching" said over a hologram opened Optics over it and started looking.
  for (const words of ['Keep watching.', 'Watch me', 'Live view', 'Start the live view', 'Show me the live view']) {
    for (const ios of [false, true]) {
      assert.equal(voiceLiveViewRequest(words, { viewerOpen: true, cameraAllowed: 'granted', ios }), null, `${words} (ios ${ios})`);
    }
    assert.notEqual(voiceLiveViewRequest(words, { viewerOpen: false, cameraAllowed: 'granted' }), null, `${words}, no viewer`);
  }
  assert.equal(voiceCameraRequest('What am I looking at?', { viewerOpen: true, cameraAllowed: 'granted' }), null, 'the same rule as a Look');
});

// ---- the strict mock -------------------------------------------------------------------------

const LIVE_SYSTEM_STUB = 'You are Jarvis Live view: test prompt.';
const SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' }, worth_saying: { type: 'boolean' }, line: { type: 'string' } },
  required: ['summary', 'worth_saying', 'line'],
  additionalProperties: false,
};

function liveBody(overrides = {}) {
  return {
    model: 'claude-haiku-5-5',
    max_tokens: 300,
    system: LIVE_SYSTEM_STUB,
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fakeJpeg(640, 360).toString('base64') } }, { type: 'text', text: 'Scene so far: (none)' }] }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    ...overrides,
  };
}

async function post(fetch, body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, json: await res.json() };
}

test('mock: a live look is recognised by its prompt\'s first words and answered { summary, worth_saying, line } with usage (default scene: the battery on the third look)', async () => {
  const fetch = createMockFetch({ timeScale: 0 });
  assert.equal(isLiveRequest(liveBody()), true);
  assert.equal(isLiveRequest(liveBody({ system: 'You are Jarvis Watch: …' })), false);
  const answers = [];
  for (let i = 0; i < 5; i++) {
    const r = await post(fetch, liveBody());
    assert.equal(r.status, 200);
    assert.equal(r.json.stop_reason, 'end_turn');
    assert.ok(r.json.usage.input_tokens > 0 && r.json.usage.output_tokens > 0);
    answers.push(JSON.parse(r.json.content[0].text));
  }
  assert.deepEqual(Object.keys(answers[0]).sort(), ['line', 'summary', 'worth_saying']);
  assert.equal(answers[2].worth_saying, true);
  assert.equal(answers[2].line, LIVE_DEFAULT_SCENE[2].line);
  assert.equal(answers[4].summary, LIVE_DEFAULT_SCENE[3].summary, 'the last answer repeats');
  assert.deepEqual(fetch.mock.violations, []);
  assert.equal(fetch.mock.requests[0].kind, 'structured');
});

test('mock: a scripted scene, a cost per look, 429 with and without retry-after, 529, a refusal and a reply cut short', async () => {
  const fetch = createMockFetch({ timeScale: 0 });
  configureLive(fetch.mock, {
    scene: [{ summary: 'One.', worth_saying: false, line: '' }, { summary: 'Two.', worth_saying: true, line: 'Careful.' }],
    costUsd: 0.02,
    errors: { 2: { status: 429, retryAfter: 3 }, 3: { status: 429 }, 4: { status: 529 }, 6: 'refusal', 7: 'cut' },
  });
  const a = await post(fetch, liveBody());
  assert.equal(JSON.parse(a.json.content[0].text).summary, 'One.');
  const cost = costOf('claude-haiku-5-5', a.json.usage);
  assert.ok(Math.abs(cost - 0.02) < 0.0005, `about 2¢ a look (${cost})`);
  const b = await post(fetch, liveBody());
  assert.equal(b.status, 429);
  assert.equal(b.headers.get('retry-after'), '3');
  assert.equal(b.json.error.type, 'rate_limit_error');
  const c = await post(fetch, liveBody());
  assert.equal(c.status, 429);
  assert.equal(c.headers.get('retry-after'), null, 'a 429 without retry-after');
  const d = await post(fetch, liveBody());
  assert.equal(d.status, 529);
  assert.equal(d.json.error.type, 'overloaded_error');
  const e = await post(fetch, liveBody());
  assert.deepEqual(JSON.parse(e.json.content[0].text), { summary: 'Two.', worth_saying: true, line: 'Careful.' }, 'the scene goes on after the errors');
  const f = await post(fetch, liveBody());
  assert.equal(f.json.stop_reason, 'refusal');
  const g = await post(fetch, liveBody());
  assert.equal(g.json.stop_reason, 'max_tokens');
  assert.throws(() => JSON.parse(g.json.content[0].text), 'cut short: not JSON');
  assert.deepEqual(fetch.mock.violations, [], 'scripted errors are not violations');
});

test('mock: a slow reply waits, and a look given up meanwhile is dropped', async () => {
  const fetch = createMockFetch({ timeScale: 0 });
  configureLive(fetch.mock, { delayMs: 120 });
  const t0 = Date.now();
  const r = await post(fetch, liveBody());
  assert.equal(r.status, 200);
  assert.ok(Date.now() - t0 >= 110, 'the reply waited');
  const ac = new AbortController();
  const pending = fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: ac.signal,
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(liveBody()),
  });
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(pending);
});

test('mock validator: thinking off is accepted on Haiku 5.5 at effort high or below, and refused elsewhere', async () => {
  const fetch = createMockFetch({ timeScale: 0 });
  for (const effort of ['low', 'medium', 'high']) {
    const r = await post(fetch, liveBody({ output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } } }));
    assert.equal(r.status, 200, `effort ${effort}`);
  }
  const max = await post(fetch, liveBody({ output_config: { effort: 'max', format: { type: 'json_schema', schema: SCHEMA } } }));
  assert.equal(max.status, 400);
  const extra = await post(fetch, liveBody({ thinking: { type: 'disabled', budget_tokens: 10 } }));
  assert.equal(extra.status, 400);
  const opus = await post(fetch, liveBody({ model: 'claude-opus-5-5' }));
  assert.equal(opus.status, 400);
  assert.match(opus.json.error.message, /thinking\.type\.disabled/);
});
