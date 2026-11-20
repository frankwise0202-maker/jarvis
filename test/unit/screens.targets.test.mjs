// Screens (v7): what "this" is (src/lib/screen-targets.js): the open viewer, else the newest card
// in the chat; the content kinds; links of an answer; the tool's url and id rules; snapshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerMarkdownOf, conversationLinks, linksOf, lookSnapshot, missionSnapshot, resolveScreenTarget, screenKindLabel, screenKindName } from '../../src/lib/screen-targets.js';

const spec = (title, n = 3) => ({ title, parts: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Part ${i}` })) });
const user = (id, text, extra = {}) => ({ id, role: 'user', text, ...extra });
const jarvis = (id, segments, extra = {}) => ({ id, role: 'jarvis', status: 'done', segments, missions: {}, ...extra });
const text = (t, req = 0) => ({ id: `t${Math.random()}`, kind: 'text', text: t, req });
const holoSeg = (id, title, extra = {}) => ({ id, kind: 'hologram', status: 'done', title, spec: spec(title), libraryId: `lib_${id.padEnd(10, '0').slice(0, 10)}`, ...extra });
const bpSeg = (id, title, extra = {}) => ({ id, kind: 'blueprint', status: 'done', title, spec: spec(title), libraryId: null, ...extra });
const mission = (id, status, extra = {}) => ({ id, wave: 1, title: 'EV SUVs compared', status, createdAt: 1, agents: [{ id: 'a1', codename: 'Atlas', status: status === 'running' ? 'searching' : 'done' }], ...extra });
const conv = (turns) => ({ id: 'c1', turns });

test('"this" is the open viewer first', () => {
  const c = conv([user('u1', 'Show me a Camry'), jarvis('j1', [text('Pulling it up.'), holoSeg('h1', 'Camry'), text('Here it is.')])]);
  const open = { kind: 'blueprint', ref: { libraryId: 'lib_aaaaaaaaaa' }, title: 'Alternator' };
  const t = resolveScreenTarget({ what: 'this', open, conv: c });
  assert.equal(t.kind, 'blueprint');
  assert.equal(t.ref.libraryId, 'lib_aaaaaaaaaa');
  assert.equal(t.fromViewer, true);
  // A named kind other than the open viewer's: the conversation decides.
  assert.equal(resolveScreenTarget({ what: 'hologram', open, conv: c }).kind, 'hologram');
  assert.equal(resolveScreenTarget({ what: 'blueprint', open, conv: c }).fromViewer, true);
});

test('"this" without a viewer: the newest card of the newest reply', () => {
  // A hologram card beats the sentence after it.
  let c = conv([user('u1', 'Show me a Camry'), jarvis('j1', [text('Pulling it up.'), holoSeg('h1', '2024 Camry'), text('Here it is.')])]);
  let t = resolveScreenTarget({ what: 'this', conv: c });
  assert.deepEqual([t.kind, t.title, t.ref.segmentId, t.ref.turnId, t.ref.conversationId], ['hologram', '2024 Camry', 'h1', 'j1', 'c1']);
  assert.equal(t.live, false);
  // A newer plain answer wins over an older hologram.
  c = conv([...c.turns, user('u2', 'What does it cost?'), jarvis('j2', [text('About $28,000.')])]);
  t = resolveScreenTarget({ what: 'this', conv: c });
  assert.deepEqual([t.kind, t.title, t.ref.turnId, t.ref.report], ['answer', 'What does it cost?', 'j2', false]);
  // A mission still running: Mission Control.
  c = conv([user('u3', 'Compare EV SUVs'), jarvis('j3', [text('Sending four agents.'), { id: 's1', kind: 'mission', missionId: 'm1' }], { status: 'running', missions: { m1: mission('m1', 'running') } })]);
  t = resolveScreenTarget({ what: 'this', conv: c });
  assert.deepEqual([t.kind, t.ref.missionId, t.live, t.title], ['mission', 'm1', true, 'EV SUVs compared']);
  // Once it is done and written up: the report.
  c.turns[1] = jarvis('j3', [text('Sending four agents.'), { id: 's1', kind: 'mission', missionId: 'm1' }, text('## Verdict\nThe Kia EV9.', 1)], { missions: { m1: mission('m1', 'done') } });
  t = resolveScreenTarget({ what: 'this', conv: c });
  assert.deepEqual([t.kind, t.ref.report, t.title], ['answer', true, 'Compare EV SUVs']);
  // A photo the owner sent, newer than every reply.
  c = conv([...c.turns, user('u4', '', { attachments: [{ id: 'x', kind: 'image', name: 'engine.jpg', thumb: 'data:image/jpeg;base64,AAAA' }] })]);
  t = resolveScreenTarget({ what: 'this', conv: c });
  assert.deepEqual([t.kind, t.ref.src, t.title], ['photo', 'data:image/jpeg;base64,AAAA', 'engine.jpg']);
});

test('a hologram still building is live; a failed one with no parts is skipped', () => {
  const c = conv([
    user('u1', 'a'),
    jarvis('j1', [holoSeg('h1', 'Old one')]),
    user('u2', 'b'),
    jarvis('j2', [holoSeg('h2', 'Broken', { status: 'error', spec: { title: 'Broken', parts: [] } }), text('That failed.')]),
    user('u3', 'c'),
    jarvis('j3', [holoSeg('h3', 'New one', { status: 'building', libraryId: null })], { status: 'running' }),
  ]);
  const t = resolveScreenTarget({ what: 'this', conv: c });
  assert.deepEqual([t.kind, t.ref.segmentId, t.live, t.ref.libraryId], ['hologram', 'h3', true, null]);
  c.turns.pop();
  c.turns.pop();
  const t2 = resolveScreenTarget({ what: 'hologram', conv: c });
  assert.equal(t2.ref.segmentId, 'h1', 'the newest hologram that has something to show');
  assert.equal(resolveScreenTarget({ what: 'this', conv: c }).kind, 'answer', '"this" = the newest reply: its text');
});

test('named kinds and nothing to show', () => {
  const c = conv([user('u1', 'Draw the alternator'), jarvis('j1', [bpSeg('b1', 'Alternator'), text('Done.')])]);
  assert.equal(resolveScreenTarget({ what: 'blueprint', conv: c }).ref.segmentId, 'b1');
  const none = resolveScreenTarget({ what: 'mission', conv: c });
  assert.equal(none.error, 'nothing');
  assert.match(none.message, /no mission in this conversation/i);
  assert.equal(resolveScreenTarget({ what: 'this', conv: conv([]) }).error, 'nothing');
  assert.equal(resolveScreenTarget({ what: 'this', conv: null }).error, 'nothing');
  assert.deepEqual(resolveScreenTarget({ what: 'camera', conv: null }).kind, 'camera');
});

test('the camera: Optics open makes it "this", and moving it (by name too) closes Optics there', () => {
  const c = conv([user('u1', 'Show me a Camry'), jarvis('j1', [holoSeg('h1', 'Camry')])]);
  const optics = { kind: 'camera', ref: {}, title: 'Optics', live: true };
  const t = resolveScreenTarget({ what: 'this', open: optics, conv: c });
  assert.deepEqual([t.kind, t.live, t.fromViewer], ['camera', true, true]);
  assert.equal(resolveScreenTarget({ what: 'camera', open: optics, conv: c }).fromViewer, true, '"the camera" while Optics is open');
  assert.equal(resolveScreenTarget({ what: 'camera', open: null, conv: c }).fromViewer, undefined, 'Optics closed: nothing to close in the app');
  const holoOpen = { kind: 'hologram', ref: { segmentId: 'h1' }, title: 'Camry' };
  assert.equal(resolveScreenTarget({ what: 'camera', open: holoOpen, conv: c }).fromViewer, undefined, 'another viewer stays open');
});

test('links: the newest answer with links; ordinals; the tool\'s url must be in the conversation', () => {
  const md = 'See [Kia EV9 review](https://www.example.com/ev9) and <https://cars.example.org/x>, plus https://news.example.net/a?b=1). Not [this](javascript:alert(1)) or [that](https://user:pw@evil.example/).';
  assert.deepEqual(linksOf(md).map((l) => l.url), ['https://www.example.com/ev9', 'https://cars.example.org/x', 'https://news.example.net/a?b=1']);
  assert.equal(linksOf(md)[0].title, 'Kia EV9 review');
  assert.equal(linksOf(md)[1].title, 'cars.example.org', 'bare links are titled by their host');
  const c = conv([user('u1', 'q'), jarvis('j1', [text(md)])]);
  assert.equal(resolveScreenTarget({ what: 'link', conv: c }).ref.url, 'https://www.example.com/ev9');
  assert.equal(resolveScreenTarget({ what: 'link', ordinal: 2, conv: c }).ref.url, 'https://cars.example.org/x');
  assert.equal(resolveScreenTarget({ what: 'link', ordinal: -1, conv: c }).ref.url, 'https://news.example.net/a?b=1');
  assert.equal(resolveScreenTarget({ what: 'link', ordinal: 7, conv: c }).error, 'no-link');
  assert.ok(conversationLinks(c).has('https://cars.example.org/x'));
  assert.equal(resolveScreenTarget({ what: 'link', url: 'https://cars.example.org/x', conv: c }).kind, 'link');
  assert.equal(resolveScreenTarget({ what: 'link', url: 'https://evil.example/phish', conv: c }).error, 'unknown-url', 'never a URL the conversation does not contain');
  assert.equal(resolveScreenTarget({ what: 'link', url: 'javascript:alert(1)', conv: c }).error, 'bad-url');
});

test('the tool\'s saved item id', () => {
  assert.deepEqual(resolveScreenTarget({ what: 'this', id: 'lib_ab12cd34ef' }), { kind: 'library', ref: { libraryId: 'lib_ab12cd34ef' }, title: '', live: false });
  assert.equal(resolveScreenTarget({ what: 'this', id: '../../etc' }).error, 'bad-id');
});

test('answer text: the final answer after the last action; snapshots stay small', () => {
  const turn = jarvis('j1', [text('Let me check.'), { kind: 'tool', id: 'x' }, text('The answer.', 1), text(' More.', 1)]);
  assert.equal(answerMarkdownOf(turn), 'The answer. More.');
  assert.equal(answerMarkdownOf(jarvis('j2', [text('Only text.')])), 'Only text.');
  assert.equal(answerMarkdownOf(jarvis('j3', [])), '');
  const big = jarvis('j4', [{ id: 's1', kind: 'mission', missionId: 'm1' }, { id: 's2', kind: 'mission', missionId: 'm2' }, text('x'.repeat(5000))], { status: 'running', missions: { m1: mission('m1', 'done'), m2: mission('m2', 'running', { wave: 2 }) }, costUsd: 0.12 });
  const snap = missionSnapshot(big, 'm2');
  assert.deepEqual(Object.keys(snap.missions), ['m2']);
  assert.equal(snap.segments.length, 1);
  assert.equal(snap.costUsd, 0.12);
  assert.ok(!JSON.stringify(snap).includes('xxxxxxxxxx'), 'no answer text in a mission snapshot');
  assert.equal(missionSnapshot(big, 'nope').missions.m2.id, 'm2', 'an unknown id falls back to the newest wave');
  assert.equal(missionSnapshot(jarvis('j5', []), null), null);
});

test('kind labels for the header', () => {
  assert.equal(screenKindLabel('mission'), 'MISSION CONTROL');
  assert.equal(screenKindLabel('answer', { report: true }), 'REPORT');
  assert.equal(screenKindLabel('answer'), 'ANSWER');
  assert.equal(screenKindLabel('camera'), 'OPTICS');
});

test('"it" after a move: what was just put on a screen, until something newer arrives', () => {
  const c = conv([user('u1', 'Show me a Camry', { createdAt: 100 }), jarvis('j1', [holoSeg('h1', 'Camry')], { createdAt: 101 }), user('u2', 'Price?', { createdAt: 200 }), jarvis('j2', [text('About $28,000.')], { createdAt: 201 })]);
  const moved = { target: { kind: 'hologram', ref: { libraryId: 'lib_h100000000', segmentId: 'h1' }, title: 'Camry', live: false }, at: 300 };
  const t = resolveScreenTarget({ what: 'this', recent: moved, conv: c });
  assert.deepEqual([t.kind, t.title, t.fromViewer], ['hologram', 'Camry', false]);
  // A newer message: the newest card again.
  c.turns.push(user('u3', 'And the EV9?', { createdAt: 400 }), jarvis('j3', [text('About $55,000.')], { createdAt: 401 }));
  assert.equal(resolveScreenTarget({ what: 'this', recent: moved, conv: c }).kind, 'answer');
  // An open viewer always wins; a named kind ignores it.
  assert.equal(resolveScreenTarget({ what: 'this', recent: { ...moved, at: 999 }, open: { kind: 'blueprint', ref: {}, title: 'x' }, conv: c }).kind, 'blueprint');
  assert.equal(resolveScreenTarget({ what: 'answer', recent: { ...moved, at: 999 }, conv: c }).ref.turnId, 'j3');
});

test('a Look on a screen: "this" while Optics shows a frozen Look is that Look (frame, labels, answer), from the conversation; the camera stays "the camera"', () => {
  const thumb = 'data:image/jpeg;base64,/9j/AAAA';
  const pins = (frameId, labels, status = 'done') => ({ id: `p_${frameId}`, kind: 'pins', status, frameId, labels, req: 0 });
  const c = conv([
    user('u1', 'What is on my desk?', { optics: { frameId: 'f1', width: 1280, height: 720, source: 'camera' }, attachments: [{ kind: 'image', thumb, width: 480, height: 270 }] }),
    jarvis('j1', [text("That's your desk, sir."), pins('f1', [{ text: 'Coffee mug', x: 498, y: 303 }, { text: 'Pothos', x: 886, y: 180 }]), text('The pothos wants light.')]),
    user('u2', "What's this part? (the pothos you pinned on frame f1, at 886, 180)"),
    jarvis('j2', [text('A pothos.'), pins('f1', [{ text: 'Pothos', x: 886, y: 180 }])]),
    user('u3', 'Can you see it now?'),
    jarvis('j3', [text('Let me take a look.'), { id: 'fr2', kind: 'frame', frameId: 'f2', width: 1280, height: 720, source: 'camera', thumb, reason: 'a fresh look' }, text("Here's what I see now."), pins('f2', [{ text: 'Notebook', x: 362, y: 493 }])], { status: 'running' }),
  ]);
  const open = { kind: 'look', ref: { conversationId: 'c1', frameId: 'f1' }, title: 'What is on my desk?' };
  const t = resolveScreenTarget({ what: 'this', open, conv: c });
  assert.deepEqual([t.kind, t.ref.frameId, t.fromViewer], ['look', 'f1', true]);
  assert.equal(resolveScreenTarget({ what: 'camera', open, conv: c }).kind, 'camera', '"the camera" is still the live camera');
  assert.equal(screenKindLabel('look'), 'LOOK');
  assert.equal(screenKindName('look'), 'the Look');
  const f1 = lookSnapshot(c, 'f1');
  assert.deepEqual({ ...f1.data, markdown: undefined }, { src: thumb, width: 1280, height: 720, frameId: 'f1', pins: [{ text: 'Pothos', x: 886, y: 180 }], question: 'What is on my desk?', markdown: undefined, status: 'done' }, 'the newest labels on f1 (the follow-up pinned it again)');
  assert.equal(f1.data.markdown, "That's your desk, sir.\n\nThe pothos wants light.", "the Look's own answer");
  assert.equal(f1.title, 'What is on my desk?');
  const f2 = lookSnapshot(c, 'f2');
  assert.deepEqual([f2.data.src, f2.data.question, f2.data.markdown, f2.data.status, f2.data.pins.length], [thumb, 'Can you see it now?', "Here's what I see now.", 'running', 1], 'a frame Jarvis took: the text after it; still running');
  assert.equal(lookSnapshot(c, 'f9'), null);
  assert.equal(lookSnapshot(c, 'javascript:alert(1)'), null);
  const noThumb = conv([user('u1', 'x', { optics: { frameId: 'f1', width: 10, height: 10 }, attachments: [{ kind: 'image', thumb: 'https://evil.example/x.png' }] })]);
  assert.equal(lookSnapshot(noThumb, 'f1'), null, 'only a kept data: picture');
});
