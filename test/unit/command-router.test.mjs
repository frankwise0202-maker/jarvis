// The command router (v8.1, SPEC §30; src/lib/command-router.js): the skeleton (contract (b)), the
// final order (src/lib/command-order.js), and T1-T5 over the corpora and the collision table (u-voice
// §4.4). Voice (Track 3) owns this file: the base corpora, the order, T1-T5.
//
// The harness reads test/unit/fixtures/voice-corpus.mjs and collisions.mjs (a section per builder) and
// voice's base corpora test/unit/fixtures/voice-corpus-base.mjs. It registers today's matchers and every
// src/ui/commands module (with fake deps), as app.js does, in the final order, then:
//   T1  every NOT sentence, in every state, reaches Claude, unless the collision table declares a winner
//   T2  every must row picks what it expects (a section's: an id or id:do; the base's: a layer, from
//       its owner's matchers; a row whose owner has registered nothing yet waits, and says so)
//   T3  a sentence two matchers claim alone, in a state, is declared in the collision table, and
//       the router picks its declared winner; every declared row holds (a row whose winner isn't
//       registered yet waits)
//   T4  the same words pick the same matcher on every surface, but for the declared exceptions
//   T5  another reading counts only when the best one isn't a question, and only for a free, undoable,
//       unchecked action that touches neither the camera nor the microphone
//   and in a Chrome context no ordinary sentence and no Jarvis command becomes a Chrome task (H3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS, SURFACES, createRouter, emptyState, normalizeAction, alternativeAllowed, cleanReadings, registerTodayCommands, TODAY_ORDER, FINAL_ORDER, MAX_WORDS } from '../../src/lib/command-router.js';
import { ORDER } from '../../src/lib/command-order.js';
import { DEFAULT_SETTINGS } from '../../src/platform/settings.js';
import { SECTIONS as CORPUS_SECTIONS } from './fixtures/voice-corpus.mjs';
import { SECTIONS as COLLISION_SECTIONS } from './fixtures/collisions.mjs';
import * as BASE from './fixtures/voice-corpus-base.mjs';
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
  assert.deepEqual(hit.action, { do: 'new-chat', extra: 1, free: true, undo: true, check: false, camera: false, mic: false });
  assert.deepEqual(await r.run(hit, { surface: 'chat' }), { say: 'new-chat chat' });
  assert.equal(r.run(r.route(['mute'], { surface: 'chat' })), false, 'no run(): false');
  assert.equal(r.route(['mute'], { surface: 'chat' }).action.do, 'mute', 'do defaults to the id');
});

test('normalizeAction(), alternativeAllowed(), cleanReadings()', () => {
  // v8.1: the `mic` flag (the microphone off, Voice Mode away) joins the others; R7 refuses it too.
  assert.deepEqual(normalizeAction({ do: 'x', free: 0, camera: 'yes' }), { do: 'x', free: false, undo: true, check: false, camera: true, mic: false });
  assert.equal(alternativeAllowed({ do: 'x' }), true);
  for (const flag of [{ free: false }, { undo: false }, { check: true }, { camera: true }, { mic: true }]) assert.equal(alternativeAllowed({ do: 'x', ...flag }), false);
  assert.deepEqual(cleanReadings([' Play it ', 'play it', '', null, 'Stop']), ['Play it', 'Stop']);
});

test('emptyState(): every field of contract (b), for each surface', () => {
  const s = emptyState('chat');
  assert.equal(s.surface, 'chat');
  for (const key of ['speaking', 'check', 'questions', 'prompt', 'tour', 'hologram', 'blueprintOpen', 'optics', 'windows', 'reply', 'chrome', 'music', 'homebase', 'standby', 'hidden', 'phone']) assert.ok(key in s, key);
  assert.deepEqual(s.chrome, { linked: false, online: false, task: null, contextUntil: 0 });
  assert.notEqual(emptyState('chat').questions, s.questions, 'a fresh object each time');
});

// =============================================================================== the final order

test('the final order (C1): one table for every surface, the layers in order, R3 and R7 on', () => {
  for (const surface of SURFACES) assert.equal(FINAL_ORDER[surface], FINAL_ORDER.voice, `${surface}: the same passes (R1)`);
  const r = createRouter();
  r.register({ id: 'w1', layer: 'app', match: word('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen') });
  r.register({ id: 'w2', layer: 'media', carrier: true, match: (t) => (/^play /.test(t) ? { do: 'music' } : null) });
  const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen';
  assert.equal(r.route([long], { surface: 'voice' }), null, `R3: more than ${MAX_WORDS} words is no command`);
  assert.equal(r.route([`play ${long}`], { surface: 'voice' }).id, 'w2', 'a carrier keeps its long words');
  // R7: the best reading is a question: no other reading is tried at all.
  r.register({ id: 'w3', layer: 'app', match: word('new chat') });
  assert.equal(r.route(['new jacket', 'new chat'], { surface: 'voice' }).id, 'w3');
  assert.equal(r.route(["what's a new jacket", 'new chat'], { surface: 'voice' }), null);
  // TODAY_ORDER keeps Phase 0's routing: no cap, no question rule.
  const t = createRouter({ order: TODAY_ORDER });
  t.register({ id: 'w3', layer: 'app', match: word('new chat') });
  assert.equal(t.route(["what's a new jacket", 'new chat'], { surface: 'chat' }).id, 'w3');
});

test("the final order, as the app has it: today's matchers and every module's, layer by layer", () => {
  const { router } = appRouter();
  const flat = router.order('voice').flat();
  const pos = (id) => flat.indexOf(id);
  // (1) Standby, (2) the answers, (3) stop, (4) Screens, (5) the viewers, (6) the app, (7) media, (8) camera.
  for (const [a, b] of [['standby', 'prompt'], ['prompt', 'question'], ['question', 'stop'], ['stop', 'screens'], ['screens', 'blueprint'], ['blueprint', 'hologram'], ['hologram', 'optics'], ['optics', 'voice-controls'], ['voice-controls', 'app'], ['app', 'music'], ['music', 'homebase'], ['homebase', 'brain'], ['brain', 'camera']]) {
    assert.ok(pos(a) >= 0 && pos(a) < pos(b), `${a} before ${b} (${flat.join(', ')})`);
  }
  // The declared ids each layer asks first (src/lib/command-order.js).
  assert.deepEqual([...ORDER.destination], ['chrome-task', 'chrome-open', 'windows', 'screens', 'screen-look'], 'D1: a Chrome task before opening a page');
  // The chat, a hologram's field and Optics' field: the same order, each with its own matchers.
  assert.deepEqual(router.order('chat').flat().filter((id) => !['music'].includes(id)).slice(0, 3), ['standby', 'stop', 'screens']);
});

// =============================================================================== the harness (T1-T5)

export const HARNESS_STATES = BASE.HARNESS_STATES;

/** A state by name: emptyState(surface) with the named fields over it. */
function stateOf(states, name) {
  const over = typeof name === 'string' ? states[name] : name;
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
// The builder each module belongs to (a corpus row's owner).
const OWNER_MODULE = { voice: 'voice', optics: 'optics', windows: 'windows', tours: 'tours', 'chrome-voice': 'chrome-voice', 'mac-hf': 'mac', 'mac-dev': 'audio', 'chrome-relay': 'chrome' };

/** The app's router: today's matchers, then every module's (as app.js registers them); byModule: their ids. */
function appRouter() {
  const r = createRouter();
  registerTodayCommands(r);
  const byModule = {};
  for (const [name, fn] of Object.entries(MODULES)) {
    const ids = [];
    fn({ ...r, register: (entry) => (ids.push(entry && entry.id), r.register(entry)) }, fakeDeps());
    byModule[name] = ids;
  }
  return { router: r, byModule };
}

/** Everything the harness reads: the states, the corpora, the collision table. */
function corpora() {
  const states = { ...BASE.HARNESS_STATES, ...BASE.STATES };
  const must = [];
  const not = [...BASE.NOT];
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
    if (!e.carrier && cleanReadings([words])[0] && String(words).trim().split(/\s+/).length > MAX_WORDS) continue;
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
const winnersOf = (row) => (Array.isArray(row.winner) ? row.winner : [row.winner ?? null]);

/**
 * T3: every collision is declared, and every declared row holds. Returns the problems found; `waiting`
 * (when given) collects the rows whose winner isn't registered yet (its builder isn't merged).
 */
export function checkCollisions(router, { sentences, states, table, waiting = null, waitingFor = () => false }) {
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
    const want = winnersOf(row);
    if (waiting && (!want.some((id) => id === null || router.has(id)) || waitingFor(row))) {
      waiting.push(`"${row.words}" in ${row.state} → ${want.join(' or ')}`);
      continue;
    }
    const got = pick(router, row.words, stateOf(states, row.state));
    if (!want.includes(got)) problems.push(`wrong winner: "${row.words}" in ${row.state} goes to ${got}, declared ${want.join(' or ')}`);
  }
  return problems;
}

/** T2: every must row picks what it expects ('id', 'id:do' or null); `waiting` collects rows whose id isn't registered. */
export function checkMust(router, { must, states, waiting = null }) {
  const problems = [];
  for (const [words, stateName, expected] of must) {
    if (!states[stateName]) {
      problems.push(`"${words}": unknown state ${stateName}`);
      continue;
    }
    const id = expected ? String(expected).split(':')[0] : null;
    if (waiting && id && !router.has(id)) {
      waiting.push(`"${words}" in ${stateName} → ${expected}`);
      continue;
    }
    const hit = router.route([words], stateOf(states, stateName));
    const got = hit ? (String(expected || '').includes(':') ? `${hit.id}:${hit.action.do}` : hit.id) : null;
    if (got !== (expected ?? null)) problems.push(`"${words}" in ${stateName}: ${got}, expected ${expected}`);
  }
  return problems;
}

/** T2 for the base corpus: the layer (and the owner's matcher, or the id) each phrase must go to. */
function checkMustBase(router, byModule, { rows, states, waiting }) {
  const problems = [];
  const layerOf = new Map(router.entries().map((e) => [e.id, e.layer]));
  for (const row of rows) {
    const module = OWNER_MODULE[row.owner];
    const ready = row.owner === 'today' || (module && byModule[module] && byModule[module].length);
    if (!ready || (row.id && !router.has(row.id))) {
      waiting.push(`"${row.words}" in ${row.state} → ${row.owner} (${row.does})`);
      continue;
    }
    const hit = router.route([row.words], stateOf(states, row.state));
    if (!hit && row.should) {
      waiting.push(`"${row.words}" in ${row.state} → ${row.owner}, a SHOULD item (${row.does})`);
      continue;
    }
    const mine = row.owner === 'today' || !module || (byModule[module] || []).includes(hit && hit.id);
    const ok = hit && (row.id ? hit.id === row.id : layerOf.get(hit.id) === row.layer && mine);
    if (!ok) problems.push(`"${row.words}" in ${row.state}: ${hit ? `${hit.id} (${layerOf.get(hit.id)})` : 'Claude'}, expected ${row.id || `${row.owner}'s, in ${row.layer}`}`);
  }
  return problems;
}

/**
 * T1: every ordinary sentence reaches Claude in every state, unless the table declares a winner.
 * `waitingFor(words, state)`: a fix another builder makes is not merged yet (the take waits).
 */
export function checkNot(router, { not, states, table, waitingFor = () => false, waiting = null }) {
  const problems = [];
  for (const stateName of Object.keys(states)) {
    const st = stateOf(states, stateName);
    for (const words of not) {
      const got = pick(router, words, st);
      if (got === null) continue;
      const row = declared(table, words, stateName);
      if (row && winnersOf(row).includes(got)) continue;
      if (waitingFor(words, stateName)) {
        if (waiting) waiting.push(`"${words}" in ${stateName} (a fix to come)`);
        continue;
      }
      problems.push(`stolen: "${words}" in ${stateName} goes to ${got}`);
    }
  }
  return problems;
}

/**
 * T4: the same words pick the same matcher on the surfaces where the state can be (Voice Mode and the
 * chat with nothing open; Voice Mode and a hologram's field with a hologram; Voice Mode and Optics'
 * field with Optics), but for the declared exceptions (a matcher that acts only on some surfaces).
 */
export function checkParity(router, { sentences, states, exceptions }) {
  const problems = [];
  const only = new Map(exceptions.map((e) => [e.id, e.surfaces]));
  const pairs = [
    ['V0', 'chat'],
    ['VW', 'chat'],
    ['VH', 'hologram'],
    ['VL', 'optics'],
  ];
  for (const [name, surface] of pairs) {
    const spoken = stateOf(states, name);
    // Optics' field typed is the Look's question by design: its microphone is the surface to compare.
    const there = { ...spoken, surface, via: surface === 'optics' ? 'voice' : 'typed', voiceOpen: surface === 'chat' ? false : spoken.voiceOpen };
    for (const words of sentences) {
      const a = pick(router, words, spoken);
      const b = pick(router, words, there);
      if (a === b) continue;
      const excused = (id, s) => id !== null && only.has(id) && !only.get(id).includes(s);
      if (excused(a, surface) || excused(b, 'voice')) continue;
      problems.push(`"${words}" in ${name}: Voice Mode ${a}, ${surface} ${b}`);
    }
  }
  return problems;
}

/** T5: the alternatives rows ({ best, alts, state, want: 'claude' | { id }, by? }). */
function checkAlternatives(router, { rows, states, waiting, waitingFor = () => false }) {
  const problems = [];
  for (const row of rows) {
    if ((row.want !== 'claude' && row.want.id && !router.has(row.want.id)) || waitingFor(row)) {
      waiting.push(`${row.best} / ${row.alts.join(' / ')} → ${row.want.id}`);
      continue;
    }
    const hit = router.route([row.best, ...row.alts], stateOf(states, row.state));
    const got = hit ? hit.id : 'claude';
    const want = row.want === 'claude' ? 'claude' : row.want.id;
    if (got !== want) problems.push(`"${row.best}" (or ${row.alts.map((a) => `"${a}"`).join(', ')}) in ${row.state}: ${got}, expected ${want}`);
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
  // A row whose winner isn't registered waits (its builder isn't merged yet) instead of failing.
  const waiting = [];
  assert.deepEqual(checkCollisions(r, { sentences: [], states, table: [{ words: 'go', state: 'V0', winner: 'not-yet' }], waiting }), []);
  assert.deepEqual(waiting, ['"go" in V0 → not-yet']);
  // T4: a matcher declared for some surfaces only may differ there; anything else is a difference.
  const p = createRouter({ order: { voice: [{ use: ['@app'] }], chat: [{ use: ['@app'] }], hologram: [{ use: ['@app'] }], optics: [{ use: ['@app'] }] } });
  p.register({ id: 'everywhere', layer: 'app', match: word('new chat') });
  p.register({ id: 'voice-only', layer: 'app', surfaces: ['voice'], match: word('be quiet') });
  const ps = { V0: { surface: 'voice' }, VW: { surface: 'voice' }, VH: { surface: 'voice' }, VL: { surface: 'voice' } };
  assert.deepEqual(checkParity(p, { sentences: ['new chat'], states: ps, exceptions: [] }), []);
  assert.equal(checkParity(p, { sentences: ['be quiet'], states: ps, exceptions: [] }).length, 4);
  assert.deepEqual(checkParity(p, { sentences: ['be quiet'], states: ps, exceptions: [{ id: 'voice-only', surfaces: ['voice'] }] }), []);
});

test('T1-T3 over every section of the corpora and the collision table (today\'s matchers and every module)', (t) => {
  const { router, byModule } = appRouter();
  const { states, must, not, table } = corpora();
  // Every module registered (each may still have nothing in it).
  for (const id of ['standby', 'question', 'screens', 'music', 'hologram', 'optics', 'camera', 'stop', 'voice-controls', 'app']) assert.ok(router.has(id), id);
  const sentences = [...new Set([...must.map((row) => row[0]), ...BASE.MUST_BASE.map((row) => row.words), ...not, ...table.map((row) => row.words)])];
  const waiting = [];
  assert.deepEqual(checkMust(router, { must, states, waiting }), [], 'T2 must-match (the sections)');
  assert.deepEqual(checkMustBase(router, byModule, { rows: BASE.MUST_BASE, states, waiting }), [], 'T2 must-match (the base corpus)');
  const fixPending = (words, stateName) => BASE.WAITING_FIXES.some((f) => f.words === words && f.states.includes(stateName) && !(byModule[OWNER_MODULE[f.by]] || []).length);
  assert.deepEqual(checkNot(router, { not, states, table, waitingFor: fixPending, waiting }), [], 'T1 no-steal');
  const builderPending = (row) => !!row.by && !(byModule[OWNER_MODULE[row.by]] || []).length;
  assert.deepEqual(checkCollisions(router, { sentences, states, table, waiting, waitingFor: builderPending }), [], 'T3 collisions');
  if (waiting.length) t.diagnostic(`waiting for their builders' matchers (${waiting.length}): ${waiting.join('; ')}`);
});

test('T4 surface parity, T5 alternatives, and no Chrome task from an ordinary sentence or a Jarvis command (H3)', (t) => {
  const { router, byModule } = appRouter();
  const { states, must, not, table } = corpora();
  const sentences = [...new Set([...must.map((row) => row[0]), ...BASE.MUST_BASE.map((row) => row.words), ...not, ...table.map((row) => row.words)])];
  assert.deepEqual(checkParity(router, { sentences, states, exceptions: BASE.PARITY_EXCEPTIONS }), [], 'T4 surface parity');
  const waiting = [];
  const builderPending = (row) => !!row.by && !(byModule[OWNER_MODULE[row.by]] || []).length;
  assert.deepEqual(checkAlternatives(router, { rows: BASE.ALTERNATIVES, states, waiting, waitingFor: builderPending }), [], 'T5 alternatives');
  const tasks = [];
  for (const name of ['CC', 'CCL']) {
    for (const words of [...BASE.CHROME_CONTEXT_NOT, ...not]) if (pick(router, words, stateOf(states, name)) === 'chrome-task') tasks.push(`${name}: "${words}"`);
  }
  assert.deepEqual(tasks, [], 'never a Chrome task');
  if (waiting.length) t.diagnostic(`waiting: ${waiting.join('; ')}`);
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
