// The command router (v8.1, SPEC §30; src/lib/command-router.js): the skeleton (contract (b)), and
// the T3 harness over the corpora and the collision table (u-voice §4.4). Voice (Track 3) owns this
// file from Phase 0 on: the base corpora, the order, T1-T5.
//
// The harness reads test/unit/fixtures/voice-corpus.mjs and collisions.mjs (a section per builder)
// and, when it is there, voice's base corpora test/unit/fixtures/voice-corpus-base.mjs (named exports
// MUST, NOT and STATES, each optional). It registers today's matchers and every src/ui/commands
// module (with fake deps), then:
//   T1  every NOT sentence, in every state, reaches Claude, unless the collision table declares a winner
//   T2  every MUST row picks what it expects
//   T3  a sentence two matchers claim alone, in a state, is declared in the collision table, and
//       the router picks its declared winner; every declared row holds
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LAYERS, SURFACES, createRouter, emptyState, normalizeAction, alternativeAllowed, cleanReadings, registerTodayCommands } from '../../src/lib/command-router.js';
import { DEFAULT_SETTINGS } from '../../src/platform/settings.js';
import { SECTIONS as CORPUS_SECTIONS } from './fixtures/voice-corpus.mjs';
import { SECTIONS as COLLISION_SECTIONS } from './fixtures/collisions.mjs';
import { register as registerMacCommands } from '../../src/ui/commands/mac.js';
import { register as registerAudioCommands } from '../../src/ui/commands/audio.js';
import { register as registerTourCommands } from '../../src/ui/commands/tours.js';
import { register as registerVoiceCommands } from '../../src/ui/commands/voice.js';
import { register as registerChromeVoiceCommands } from '../../src/ui/commands/chrome-voice.js';
import { register as registerWindowCommands } from '../../src/ui/commands/windows.js';
import { register as registerOpticsCommands } from '../../src/ui/commands/optics.js';
import { register as registerChromeCommands } from '../../src/ui/commands/chrome.js';

// ================================================================================ the skeleton

const always = (action) => () => action;
const word = (w, action = { do: w }) => (text) => (text.toLowerCase() === w ? action : null);

test('contract (b): the layers and the surfaces', () => {
  assert.deepEqual([...LAYERS], ['standby', 'answer', 'stop', 'destination', 'top', 'app', 'media', 'camera']);
  assert.deepEqual([...SURFACES], ['voice', 'chat', 'hologram', 'optics']);
  assert.equal(Object.isFrozen(LAYERS), true);
});

test('register() checks its matcher; an id is registered once; the returned function removes it', () => {
  const r = createRouter({ order: { voice: [{ use: ['@app'] }] } });
  assert.throws(() => r.register({ id: 'Bad Id', layer: 'app', match: always({}) }), /id/);
  assert.throws(() => r.register({ id: 'x', layer: 'nowhere', match: always({}) }), /layer/);
  assert.throws(() => r.register({ id: 'x', layer: 'app' }), /match/);
  const off = r.register({ id: 'x', layer: 'app', match: word('go') });
  assert.throws(() => r.register({ id: 'x', layer: 'app', match: word('go') }), /already/);
  assert.equal(r.route(['go'], { surface: 'voice' }).id, 'x');
  off();
  assert.equal(r.has('x'), false);
  assert.equal(r.route(['go'], { surface: 'voice' }), null);
});

test("route(): a surface's passes in order, its ids by name and '@layer' for the rest of a layer", () => {
  const order = {
    voice: [{ use: ['first', '@top'] }, { use: ['@app', 'named'] }],
    chat: [{ use: ['@app'] }],
  };
  const r = createRouter({ order });
  r.register({ id: 'named', layer: 'app', match: always({ do: 'named' }) });
  r.register({ id: 'app-a', layer: 'app', match: always({ do: 'a' }) });
  r.register({ id: 'top-a', layer: 'top', surfaces: ['voice'], match: word('top') });
  r.register({ id: 'first', layer: 'media', match: word('first') });
  r.register({ id: 'app-b', layer: 'app', surfaces: ['chat'], match: always({ do: 'b' }) });
  // Named ids stay where the table names them; a layer's slot takes the others in registration order.
  assert.deepEqual(r.order('voice'), [['first', 'top-a'], ['app-a', 'named']]);
  // A table names ids for its own surface only: the chat's '@app' takes 'named' too.
  assert.deepEqual(r.order('chat'), [['named', 'app-a', 'app-b']]);
  assert.equal(r.route(['first'], { surface: 'voice' }).id, 'first');
  assert.equal(r.route(['top'], { surface: 'voice' }).id, 'top-a');
  assert.equal(r.route(['anything'], { surface: 'voice' }).id, 'app-a');
  // surfaces: a matcher listens only where it says ("top-a" is Voice Mode's).
  assert.equal(r.route(['top'], { surface: 'chat' }).id, 'named');
  // An unknown surface is Voice Mode's.
  assert.equal(r.route(['top'], { surface: 'elsewhere' }).id, 'top-a');
});

test('route(): readings come in turn within a pass (the first reading any matcher takes wins), passes in turn', () => {
  const r = createRouter({ order: { voice: [{ use: ['a', 'b'] }, { use: ['c'] }] } });
  r.register({ id: 'a', layer: 'app', match: word('alpha') });
  r.register({ id: 'b', layer: 'app', match: word('beta') });
  r.register({ id: 'c', layer: 'app', match: word('gamma') });
  // "beta" (best) is taken by b before "alpha" (an alternative) is asked of a.
  let hit = r.route(['beta', 'alpha'], { surface: 'voice' });
  assert.deepEqual([hit.id, hit.reading, hit.index], ['b', 'beta', 0]);
  hit = r.route(['nothing', 'alpha'], { surface: 'voice' });
  assert.deepEqual([hit.id, hit.reading, hit.index], ['a', 'alpha', 1]);
  // A later pass only when the earlier ones take nothing, whatever the reading.
  hit = r.route(['gamma', 'alpha'], { surface: 'voice' });
  assert.deepEqual([hit.id, hit.reading], ['a', 'alpha']);
  assert.equal(r.route(['nothing'], { surface: 'voice' }), null);
  assert.equal(r.route([], { surface: 'voice' }), null);
  assert.equal(r.route('gamma', { surface: 'voice' }).id, 'c', 'a single string is one reading');
});

test("route(): 'best', 'alternatives' and a pass's best-only ids; R7 for other readings", () => {
  const order = {
    voice: [
      { use: ['only-best'], readings: 'best' },
      { use: ['music', 'safe', 'paid'], best: ['music'] },
      { use: ['music'], readings: 'alternatives', anyReading: ['music'], when: 'bestNamesNoPart' },
    ],
  };
  const r = createRouter({ order });
  r.register({ id: 'only-best', layer: 'app', match: word('ob') });
  r.register({ id: 'music', layer: 'media', match: word('play', { do: 'music', undo: false }) });
  r.register({ id: 'safe', layer: 'app', match: word('safe') });
  r.register({ id: 'paid', layer: 'app', match: word('paid', { do: 'paid', free: false }) });
  assert.equal(r.route(['x', 'ob'], { surface: 'voice' }), null, "'best': the best reading only");
  assert.equal(r.route(['safe', 'play'], { surface: 'voice' }).id, 'safe');
  // Another reading: a free, undoable, unchecked, camera-free action only (R7)...
  assert.equal(r.route(['x', 'safe'], { surface: 'voice' }).id, 'safe');
  assert.equal(r.route(['x', 'paid'], { surface: 'voice' }), null);
  // ...unless the pass takes it from any reading (today's behaviour, kept in Phase 0).
  const music = r.route(['x', 'play'], { surface: 'voice' });
  assert.deepEqual([music.id, music.index, music.pos.pass], ['music', 1, 2]);
  assert.equal(r.route(['x', 'play'], { surface: 'voice', bestNamesPart: true }), null, "'bestNamesNoPart'");
});

test('route(): a matcher that throws is skipped; `after` goes on from a hit; the word cap spares carriers', () => {
  const r = createRouter({ order: { voice: [{ use: ['boom', 'one', 'two'] }] }, wordCap: 3 });
  r.register({ id: 'boom', layer: 'app', match: () => { throw new Error('boom'); } });
  r.register({ id: 'one', layer: 'app', match: always({ do: 'one' }) });
  r.register({ id: 'two', layer: 'app', carrier: true, match: always({ do: 'two' }) });
  const first = r.route(['a b'], { surface: 'voice' });
  assert.equal(first.id, 'one');
  assert.equal(r.route(['a b'], { surface: 'voice' }, { after: first }).id, 'two');
  // Four words: over the cap for "one", not for the carrier "two".
  const long = r.route(['a b c d'], { surface: 'voice' });
  assert.deepEqual([long.id, long.carrier], ['two', true]);
});

test('the hit: its action with every flag filled in, and run() through the entry', async () => {
  const r = createRouter({ order: { chat: [{ use: ['@app'] }] } });
  r.register({ id: 'new-chat', layer: 'app', match: word('new chat', { do: 'new-chat', extra: 1 }), run: (action, ctx) => ({ say: `${action.do} ${ctx.surface}` }) });
  r.register({ id: 'mute', layer: 'app', match: word('mute') });
  const hit = r.route(['New chat'], { surface: 'chat' });
  assert.deepEqual(hit.action, { do: 'new-chat', extra: 1, free: true, undo: true, check: false, camera: false });
  assert.deepEqual(await r.run(hit, { surface: 'chat' }), { say: 'new-chat chat' });
  assert.equal(r.run(r.route(['mute'], { surface: 'chat' })), false, 'no run(): false');
  assert.equal(r.route(['mute'], { surface: 'chat' }).action.do, 'mute', 'do defaults to the id');
});

test('normalizeAction(), alternativeAllowed(), cleanReadings()', () => {
  assert.deepEqual(normalizeAction({ do: 'x', free: 0, camera: 'yes' }), { do: 'x', free: false, undo: true, check: false, camera: true });
  assert.equal(alternativeAllowed({ do: 'x' }), true);
  for (const flag of [{ free: false }, { undo: false }, { check: true }, { camera: true }]) assert.equal(alternativeAllowed({ do: 'x', ...flag }), false);
  assert.deepEqual(cleanReadings([' Play it ', 'play it', '', null, 'Stop']), ['Play it', 'Stop']);
});

test('emptyState(): every field of contract (b), for each surface', () => {
  const s = emptyState('chat');
  assert.equal(s.surface, 'chat');
  for (const key of ['speaking', 'check', 'questions', 'prompt', 'tour', 'hologram', 'blueprintOpen', 'optics', 'windows', 'reply', 'chrome', 'music', 'homebase', 'standby', 'hidden', 'phone']) assert.ok(key in s, key);
  assert.deepEqual(s.chrome, { linked: false, online: false, task: null, contextUntil: 0 });
  assert.notEqual(emptyState('chat').questions, s.questions, 'a fresh object each time');
});

// =============================================================================== the T3 harness

const PARTS = [
  { id: 'battery', name: 'Battery', aka: [] },
  { id: 'fan', name: 'Fan', aka: ['cooling fan'] },
  { id: 'keyboard', name: 'Keyboard', aka: [] },
  { id: 'display', name: 'Display lid', aka: ['screen', 'display'] },
  { id: 'webcam', name: 'Webcam', aka: ['camera'] },
  { id: 'hinges', name: 'Hinges', aka: [] },
  { id: 'bottom-cover', name: 'Bottom cover', aka: [] },
];
const LIVE = { open: true, mode: 'live', liveView: false, card: null, cameraAllowed: 'granted', sceneChanged: null };
const VOICE_BASE = { standby: { available: true, open: false }, homebase: { available: true, linked: true }, camera: { supported: true, allowed: 'granted', ios: false }, voiceOpen: true };

/** The harness's own states (a section may add its own in voice-corpus.mjs). */
export const HARNESS_STATES = {
  V0: { surface: 'voice', ...VOICE_BASE },
  S: { surface: 'voice', ...VOICE_BASE, speaking: true },
  VH: { surface: 'voice', ...VOICE_BASE, hologram: { open: true, inWindow: false, parts: PARTS, selected: null } },
  VL: { surface: 'voice', ...VOICE_BASE, optics: LIVE },
  VF: { surface: 'voice', ...VOICE_BASE, optics: { ...LIVE, mode: 'frozen' } },
  VW: { surface: 'voice', ...VOICE_BASE, windows: [{ id: 'w1', kind: 'camera', label: 'Camera', focused: false }] },
  C0: { surface: 'chat', via: 'typed', standby: { available: true, open: false }, homebase: { available: true, linked: true } },
  H0: { surface: 'hologram', via: 'typed', hologram: { open: true, inWindow: false, parts: PARTS, selected: null } },
  OT: { surface: 'optics', via: 'typed', optics: LIVE },
  OV: { surface: 'optics', via: 'voice', optics: LIVE },
};

/** A state by name: emptyState(surface) with the named fields over it. */
function stateOf(states, name) {
  const over = states[name];
  if (!over) throw new Error(`no state named ${JSON.stringify(name)}`);
  return { ...emptyState(over.surface || 'voice'), ...over };
}

/** Fake deps for the registration modules: the shared ones, and a no-op for anything else. */
function fakeDeps() {
  const known = {
    getSettings: () => DEFAULT_SETTINGS,
    saveSettings: () => DEFAULT_SETTINGS,
    toast: () => {},
    voice: () => null,
    routerState: (surface, local) => ({ ...emptyState(surface), ...(local || {}) }),
    phone: false,
    demo: false,
  };
  return new Proxy(known, { get: (target, key) => (key in target ? target[key] : () => null) });
}

const MODULES = { mac: registerMacCommands, audio: registerAudioCommands, tours: registerTourCommands, voice: registerVoiceCommands, 'chrome-voice': registerChromeVoiceCommands, windows: registerWindowCommands, optics: registerOpticsCommands, chrome: registerChromeCommands };

/** The app's router: today's matchers, then every module's (as app.js registers them). */
function appRouter() {
  const r = createRouter();
  registerTodayCommands(r);
  for (const fn of Object.values(MODULES)) fn(r, fakeDeps());
  return r;
}

/** voice's base corpora (the u-voice probes), when the file is there. */
async function baseCorpus() {
  const url = new URL('./fixtures/voice-corpus-base.mjs', import.meta.url);
  if (!existsSync(url)) return { MUST: [], NOT: [], STATES: {} };
  const m = await import(url.href);
  return { MUST: m.MUST || [], NOT: m.NOT || [], STATES: m.STATES || {} };
}

/** Everything the harness reads: the states, the corpora, the collision table. */
async function corpora() {
  const base = await baseCorpus();
  const states = { ...HARNESS_STATES, ...base.STATES };
  const must = [...base.MUST];
  const not = [...base.NOT];
  for (const [owner, section] of Object.entries(CORPUS_SECTIONS)) {
    for (const [name, st] of Object.entries(section.states || {})) {
      if (states[name] && states[name] !== st) throw new Error(`${owner}: the state "${name}" exists already`);
      states[name] = st;
    }
    must.push(...(section.must || []));
    not.push(...(section.not || []));
  }
  const table = [];
  for (const section of Object.values(COLLISION_SECTIONS)) table.push(...(section.rows || []));
  return { states, must, not, table };
}

/** The matchers (on the state's surface) that claim `words` alone in `state`. */
export function claimantsOf(router, words, state) {
  const out = [];
  for (const e of router.entries()) {
    if (!e.surfaces.includes(state.surface)) continue;
    let action = null;
    try {
      action = e.match(words, state, { readings: [words], index: 0, surface: state.surface });
    } catch {
      action = null;
    }
    if (action && typeof action === 'object') out.push(e.id);
  }
  return out;
}

const pick = (router, words, state) => {
  const hit = router.route([words], state);
  return hit ? hit.id : null;
};
const sameWords = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const declared = (table, words, stateName) => table.find((row) => sameWords(row.words, words) && row.state === stateName);

/** T3: every collision is declared, and every declared row holds. Returns the problems found. */
export function checkCollisions(router, { sentences, states, table }) {
  const problems = [];
  for (const stateName of Object.keys(states)) {
    const st = stateOf(states, stateName);
    for (const words of sentences) {
      const claim = claimantsOf(router, words, st);
      if (claim.length < 2) continue;
      const row = declared(table, words, stateName);
      if (!row) problems.push(`undeclared: "${words}" in ${stateName} is claimed by ${claim.join(', ')}`);
    }
  }
  for (const row of table) {
    if (!states[row.state]) {
      problems.push(`the collision row "${row.words}" names an unknown state ${row.state}`);
      continue;
    }
    const got = pick(router, row.words, stateOf(states, row.state));
    if (got !== (row.winner ?? null)) problems.push(`wrong winner: "${row.words}" in ${row.state} goes to ${got}, declared ${row.winner}`);
  }
  return problems;
}

/** T2: every must row picks what it expects ('id', 'id:do' or null). */
export function checkMust(router, { must, states }) {
  const problems = [];
  for (const [words, stateName, expected] of must) {
    if (!states[stateName]) {
      problems.push(`"${words}": unknown state ${stateName}`);
      continue;
    }
    const hit = router.route([words], stateOf(states, stateName));
    const got = hit ? (String(expected || '').includes(':') ? `${hit.id}:${hit.action.do}` : hit.id) : null;
    if (got !== (expected ?? null)) problems.push(`"${words}" in ${stateName}: ${got}, expected ${expected}`);
  }
  return problems;
}

/** T1: every ordinary sentence reaches Claude in every state, unless the table declares a winner. */
export function checkNot(router, { not, states, table }) {
  const problems = [];
  for (const stateName of Object.keys(states)) {
    const st = stateOf(states, stateName);
    for (const words of not) {
      const got = pick(router, words, st);
      if (got === null) continue;
      const row = declared(table, words, stateName);
      if (!row || row.winner !== got) problems.push(`stolen: "${words}" in ${stateName} goes to ${got}`);
    }
  }
  return problems;
}

test('the harness finds an undeclared collision, a wrong winner and a stolen sentence (a toy router)', () => {
  const r = createRouter({ order: { voice: [{ use: ['@stop', '@top'] }] } });
  r.register({ id: 'stop-all', layer: 'stop', match: word('stop') });
  r.register({ id: 'tour-pause', layer: 'top', match: word('stop') });
  const states = { V0: { surface: 'voice' } };
  assert.deepEqual(checkCollisions(r, { sentences: ['stop'], states, table: [] }), ['undeclared: "stop" in V0 is claimed by stop-all, tour-pause']);
  assert.deepEqual(checkCollisions(r, { sentences: ['stop'], states, table: [{ words: 'stop', state: 'V0', winner: 'stop-all' }] }), []);
  assert.deepEqual(checkCollisions(r, { sentences: ['stop'], states, table: [{ words: 'Stop', state: 'V0', winner: 'tour-pause' }] }), ['wrong winner: "Stop" in V0 goes to stop-all, declared tour-pause']);
  assert.deepEqual(checkMust(r, { must: [['stop', 'V0', 'stop-all'], ['go', 'V0', null], ['stop', 'V0', 'stop-all:stop']], states }), []);
  assert.deepEqual(checkMust(r, { must: [['go', 'V0', 'stop-all']], states }), ['"go" in V0: null, expected stop-all']);
  assert.deepEqual(checkNot(r, { not: ['stop', 'tell me a joke'], states, table: [] }), ['stolen: "stop" in V0 goes to stop-all']);
});

test('T1-T3 over every section of the corpora and the collision table (today\'s matchers and every module)', async () => {
  const router = appRouter();
  const { states, must, not, table } = await corpora();
  // Every module registered (each may still have nothing in it).
  for (const id of ['standby', 'question', 'screens', 'music', 'hologram', 'optics', 'camera']) assert.ok(router.has(id), id);
  const sentences = [...new Set([...must.map((row) => row[0]), ...not, ...table.map((row) => row.words)])];
  assert.deepEqual(checkMust(router, { must, states }), [], 'T2 must-match');
  assert.deepEqual(checkNot(router, { not, states, table }), [], 'T1 no-steal');
  assert.deepEqual(checkCollisions(router, { sentences, states, table }), [], 'T3 collisions');
});

test('every section of the fixtures has its arrays (one per builder)', () => {
  const builders = ['mac-dev', 'mac-hf', 'tours', 'voice', 'chrome-voice', 'windows', 'optics', 'chrome-relay', 'chrome-ext'];
  assert.deepEqual(Object.keys(CORPUS_SECTIONS), builders);
  assert.deepEqual(Object.keys(COLLISION_SECTIONS), builders);
  for (const section of Object.values(CORPUS_SECTIONS)) {
    assert.ok(Array.isArray(section.must) && Array.isArray(section.not) && section.states && typeof section.states === 'object');
    for (const row of section.must) assert.ok(Array.isArray(row) && row.length === 3 && typeof row[0] === 'string', JSON.stringify(row));
  }
  for (const section of Object.values(COLLISION_SECTIONS)) {
    for (const row of section.rows) assert.ok(typeof row.words === 'string' && typeof row.state === 'string' && 'winner' in row, JSON.stringify(row));
  }
});
