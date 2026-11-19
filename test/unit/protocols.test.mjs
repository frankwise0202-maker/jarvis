// Protocols & briefings (SPEC 14.2): built-in prompt builders and custom-protocol storage.
// Runs in plain Node (`node --test test/unit/`): the module touches the DOM only when a grid or
// editor is created, so prompts and storage are tested here with a fake localStorage. The grid
// and editor UI are exercised in Chromium by the feature's preview harness.
//
// Each storage test imports a fresh module instance (a distinct ?query URL), so the module's
// in-memory fallback state never leaks between tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICON_NAMES } from '../../src/ui/icons.js';

const MODULE_URL = new URL('../../src/ui/protocols.js', import.meta.url).href;
let instance = 0;
const freshModule = () => import(`${MODULE_URL}?instance=${++instance}`);
const { PROTOCOLS, parseProtocolPrompt } = await import(MODULE_URL);

const KEY = 'jarvis.protocols.v1';
const NOW = new Date(2026, 10, 19, 8, 15); // Thursday 19 November 2026, 08:15 local time
const SETTINGS = Object.freeze({ userName: 'Tony', location: 'Austin, Texas, US', maxAgents: 8, maxWaves: 3 });
const INPUTS = Object.freeze({
  'deep-research': 'solid-state batteries',
  blueprint: 'a 2024 Toyota Camry Hybrid',
  'compare-decide': 'Kindle Paperwhite vs Kobo Clara',
  'trip-planner': 'Lisbon, 12–16 March, two people',
  'fact-check': 'The Great Wall is visible from space',
  'explain-simply': 'quantum entanglement',
  'news-sweep': 'the AI chip race',
  'gift-finder': 'my dad, 65, loves jazz, under $150',
});
const BUILT_IN_IDS = ['morning-briefing', 'deep-research', 'blueprint', 'compare-decide', 'trip-planner', 'fact-check', 'explain-simply', 'news-sweep', 'gift-finder'];

// ---- fake storage ------------------------------------------------------------------------

function fakeStorage({ failWrites = false } = {}) {
  const map = new Map();
  return {
    map,
    failWrites,
    get length() {
      return map.size;
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      if (this.failWrites) {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

/** Install `value` as globalThis.localStorage (or a getter that throws, like Safari with blocked site data). */
function installStorage(value, { throwOnAccess = false } = {}) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      if (throwOnAccess) {
        const err = new Error('The operation is insecure.');
        err.name = 'SecurityError';
        throw err;
      }
      return value;
    },
  });
}

const quietWarnings = (t) => t.mock.method(console, 'warn', () => {});

// ---- built-in protocols -------------------------------------------------------------------

test('there are nine well-formed built-in protocols with unique ids', () => {
  assert.deepEqual(PROTOCOLS.map((p) => p.id), BUILT_IN_IDS);
  assert.ok(Object.isFrozen(PROTOCOLS));
  for (const p of PROTOCOLS) {
    assert.ok(Object.isFrozen(p), `${p.id} frozen`);
    assert.equal(typeof p.name, 'string');
    assert.ok(p.name.length > 0 && p.name.length <= 24, `${p.id} name length`);
    assert.ok(ICON_NAMES.includes(p.icon), `${p.id} icon "${p.icon}" exists in icons.js`);
    assert.ok(p.blurb.length > 0 && p.blurb.length <= 46, `${p.id} blurb fits a phone tile (${p.blurb.length})`);
    assert.ok(['auto', 'quick', 'swarm'].includes(p.mode), `${p.id} mode`);
    assert.equal(typeof p.needsInput, 'boolean');
    assert.equal(typeof p.buildPrompt, 'function');
    assert.equal(p.custom, false);
    if (p.needsInput) {
      assert.ok(p.inputLabel, `${p.id} inputLabel`);
      assert.ok(p.inputPlaceholder && p.inputPlaceholder.length <= 24, `${p.id} placeholder fits a 320px input`);
      assert.ok(p.inputOptional || p.inputHint, `${p.id} has a hint for empty input`);
    }
  }
});

test('modes follow SPEC 14.2', () => {
  const modes = Object.fromEntries(PROTOCOLS.map((p) => [p.id, p.mode]));
  assert.deepEqual(modes, {
    'morning-briefing': 'swarm',
    'deep-research': 'swarm',
    blueprint: 'swarm',
    'compare-decide': 'swarm',
    'trip-planner': 'swarm',
    'fact-check': 'auto',
    'explain-simply': 'quick',
    'news-sweep': 'swarm',
    'gift-finder': 'swarm',
  });
  assert.equal(PROTOCOLS.find((p) => p.id === 'morning-briefing').needsInput, false);
  for (const id of BUILT_IN_IDS.slice(1)) assert.equal(PROTOCOLS.find((p) => p.id === id).needsInput, true, id);
});

for (const p of PROTOCOLS) {
  test(`buildPrompt: ${p.name}`, () => {
    const input = INPUTS[p.id] || '';
    const text = p.buildPrompt({ input, settings: SETTINGS, now: NOW });
    assert.equal(typeof text, 'string');
    assert.ok(text.trim().length > 200, 'substantial, non-empty brief');
    if (p.needsInput) assert.ok(text.includes(input), 'includes the owner input');
    assert.ok(text.includes(SETTINGS.location), 'includes the location when it is set');
    assert.doesNotMatch(text, /undefined|null|NaN|\[object/, 'no leaked placeholders');

    // Shape: a headline (becomes the conversation title), a blank line, then "Protocol: <name>".
    const parsed = parseProtocolPrompt(text);
    assert.ok(parsed, 'parseable protocol prompt');
    assert.equal(parsed.name, p.name);
    assert.ok(parsed.headline.length <= 80 && !parsed.headline.includes('\n'), 'one-line headline');
    if (p.needsInput) assert.ok(parsed.headline.includes(input), 'headline names the input');

    // Output format: the first paragraph is a spoken summary (SPEC 8.7).
    assert.match(text, /First paragraph: [^\n]*(read well aloud|listen to)/);
    assert.match(text, /First paragraph: [^\n]*no links/i);
    assert.match(text, /Format:/);

    // Team guidance: swarm protocols say how many agents and which angles.
    if (p.mode === 'swarm') {
      assert.match(text, /deploy (up to )?\d+ field agents?/);
      assert.match(text, /\n1\. .+\n2\. .+/, 'numbered angles');
    }
    if (p.mode === 'quick') assert.match(text, /no agents/);
    if (p.mode === 'auto') assert.match(text, /deploy up to \d+ field agents?/);
  });
}

test('buildPrompt never asks for more agents than the owner allows', () => {
  for (const maxAgents of [1, 2, 3, 5, 8, 20]) {
    for (const p of PROTOCOLS) {
      const text = p.buildPrompt({ input: INPUTS[p.id] || '', settings: { ...SETTINGS, maxAgents }, now: NOW });
      for (const m of text.matchAll(/deploy (?:up to )?(\d+) field agents?/g)) {
        assert.ok(Number(m[1]) <= maxAgents, `${p.id}: asked for ${m[1]} with a limit of ${maxAgents}`);
      }
      if (p.mode === 'swarm' && maxAgents < 5 && p.id !== 'compare-decide') {
        assert.match(text, /per-wave limit/, `${p.id} explains the limit`);
      }
    }
  }
});

test('buildPrompt tolerates missing settings and odd `now` values (SPEC 14: defaults for missing keys)', () => {
  for (const p of PROTOCOLS) {
    for (const settings of [undefined, null, {}, { maxAgents: 'lots', maxWaves: -3, location: 42, userName: ['x'] }]) {
      for (const now of [undefined, Date.now(), 'not a date', NOW]) {
        const text = p.buildPrompt({ input: INPUTS[p.id] || '', settings, now });
        assert.ok(text.length > 200, `${p.id} still builds`);
        assert.doesNotMatch(text, /undefined|null|NaN|\[object|Invalid Date/, `${p.id} no leaks`);
      }
    }
  }
  // Called with no argument at all.
  assert.ok(PROTOCOLS[0].buildPrompt().length > 200);
});

test('required input: an empty or blank input builds nothing; News Sweep falls back to today', () => {
  for (const p of PROTOCOLS.filter((x) => x.needsInput && !x.inputOptional)) {
    assert.equal(p.buildPrompt({ input: '', settings: SETTINGS, now: NOW }), '', p.id);
    assert.equal(p.buildPrompt({ input: '   \n ', settings: SETTINGS, now: NOW }), '', p.id);
  }
  const news = PROTOCOLS.find((p) => p.id === 'news-sweep');
  assert.equal(news.inputOptional, true);
  for (const input of ['', 'today', 'Today.']) {
    const text = news.buildPrompt({ input, settings: SETTINGS, now: NOW });
    assert.ok(text.startsWith("News sweep: today's top stories"), JSON.stringify(input));
    assert.match(text, /Local and national — the top stories for Austin, Texas, US/);
  }
});

test('input is cleaned: one line, length-capped, outer quotes removed', () => {
  const fact = PROTOCOLS.find((p) => p.id === 'fact-check');
  const text = fact.buildPrompt({ input: '  "Bats are\nblind"  ', settings: SETTINGS, now: NOW });
  assert.ok(text.startsWith('Fact check: “Bats are blind”\n'));
  const deep = PROTOCOLS.find((p) => p.id === 'deep-research');
  const long = deep.buildPrompt({ input: 'x'.repeat(5000), settings: SETTINGS, now: NOW });
  assert.ok(!long.includes('x'.repeat(601)) && long.includes('x'.repeat(600)), 'input capped at 600 characters');
});

test('Morning Briefing: location, name, weather and time of day', () => {
  const mb = PROTOCOLS.find((p) => p.id === 'morning-briefing');
  const withLoc = mb.buildPrompt({ settings: SETTINGS, now: NOW });
  assert.ok(withLoc.startsWith('Morning briefing — Thursday 19 November\n'));
  assert.match(withLoc, /Weather — today's forecast for Austin, Texas, US/);
  assert.match(withLoc, /Open with "Good morning, Tony\."/);
  assert.match(withLoc, /World — /);
  assert.match(withLoc, /Technology — /);
  assert.match(withLoc, /Markets — /);
  assert.match(withLoc, /One fascinating thing — /);
  assert.match(withLoc, /remembered facts/, 'uses memory / interests');
  assert.match(withLoc, /butler/);
  assert.doesNotMatch(withLoc, /Settings → Location/);

  const noLoc = mb.buildPrompt({ settings: { ...SETTINGS, location: '', userName: '' }, now: NOW });
  assert.doesNotMatch(noLoc, /Weather —/, 'no weather agent without a location');
  assert.match(noLoc, /national and world news only/);
  assert.match(noLoc, /local weather needs my location, which I can add in Settings → Location/);
  assert.match(noLoc, /Open with "Good morning, sir\."/);

  const afternoon = mb.buildPrompt({ settings: SETTINGS, now: new Date(2026, 10, 19, 13, 30) });
  assert.ok(afternoon.startsWith('Afternoon briefing — Thursday 19 November'));
  const evening = mb.buildPrompt({ settings: SETTINGS, now: new Date(2026, 10, 19, 20, 5) });
  assert.ok(evening.startsWith('Evening briefing — Thursday 19 November'));
  assert.match(evening, /Good evening, Tony\./);
  assert.match(evening, /how markets closed today/);
});

test('follow-up waves are only suggested when the wave limit allows one', () => {
  const deep = PROTOCOLS.find((p) => p.id === 'deep-research');
  assert.match(deep.buildPrompt({ input: 'x', settings: { ...SETTINGS, maxWaves: 2 }, now: NOW }), /follow-up wave/);
  assert.doesNotMatch(deep.buildPrompt({ input: 'x', settings: { ...SETTINGS, maxWaves: 1 }, now: NOW }), /follow-up wave/);
});

test('parseProtocolPrompt ignores ordinary messages', () => {
  assert.equal(parseProtocolPrompt('What is the weather?'), null);
  assert.equal(parseProtocolPrompt('Line one\n\nLine two'), null);
  assert.equal(parseProtocolPrompt(undefined), null);
});

// ---- custom protocols: storage ------------------------------------------------------------

test('custom protocols: save, list, update, delete (localStorage jarvis.protocols.v1)', async () => {
  const store = fakeStorage();
  installStorage(store);
  const m = await freshModule();
  assert.equal(m.listProtocols().length, BUILT_IN_IDS.length);

  const saved = m.saveCustomProtocol({ name: '  Lakers   Update ', prompt: 'Latest Lakers news, injuries and the next game.', mode: 'swarm', icon: 'target' });
  assert.equal(saved.ok, true);
  assert.equal(saved.persisted, true);
  assert.match(saved.protocol.id, /^custom-/);
  assert.equal(saved.protocol.name, 'Lakers Update');
  assert.equal(saved.protocol.custom, true);
  assert.equal(saved.protocol.needsInput, false);

  const stored = JSON.parse(store.getItem(KEY));
  assert.equal(stored.length, 1);
  assert.deepEqual(Object.keys(stored[0]).sort(), ['createdAt', 'icon', 'id', 'mode', 'name', 'prompt', 'updatedAt']);
  assert.equal(stored[0].mode, 'swarm');
  assert.equal(stored[0].icon, 'target');

  const all = m.listProtocols();
  assert.equal(all.length, BUILT_IN_IDS.length + 1);
  assert.equal(all[BUILT_IN_IDS.length].id, saved.protocol.id, 'custom protocols come after the built-ins');
  assert.equal(m.getProtocol(saved.protocol.id).name, 'Lakers Update');
  assert.equal(m.getProtocol('morning-briefing').name, 'Morning Briefing');
  assert.equal(m.getProtocol('nope'), null);

  const before = stored[0].createdAt;
  const updated = m.saveCustomProtocol({ id: saved.protocol.id, name: 'Lakers Daily', prompt: 'Lakers: last result and {input}.', mode: 'quick', icon: 'globe' });
  assert.equal(updated.ok, true);
  assert.equal(updated.protocol.id, saved.protocol.id);
  const stored2 = JSON.parse(store.getItem(KEY));
  assert.equal(stored2.length, 1, 'updated in place');
  assert.equal(stored2[0].createdAt, before);
  assert.ok(stored2[0].updatedAt >= before);
  assert.equal(stored2[0].name, 'Lakers Daily');
  assert.equal(m.getProtocol(saved.protocol.id).needsInput, true, '{input} makes it ask for input');

  assert.equal(m.deleteCustomProtocol(saved.protocol.id), true);
  assert.equal(m.deleteCustomProtocol(saved.protocol.id), false);
  assert.equal(m.deleteCustomProtocol('morning-briefing'), false, 'built-ins cannot be deleted');
  assert.deepEqual(JSON.parse(store.getItem(KEY)), []);
  assert.equal(m.listProtocols().length, BUILT_IN_IDS.length);
});

test('custom protocols: validation', async () => {
  installStorage(fakeStorage());
  const m = await freshModule();
  const prompt = 'A perfectly reasonable mission brief.';
  assert.deepEqual(m.saveCustomProtocol({ name: '', prompt }).errors, { name: 'Give your protocol a name.' });
  assert.ok(m.saveCustomProtocol({ name: 'n'.repeat(41), prompt }).errors.name);
  assert.ok(m.saveCustomProtocol({ name: 'Ok', prompt: '' }).errors.prompt);
  assert.ok(m.saveCustomProtocol({ name: 'Ok', prompt: 'too short' }).errors.prompt);
  assert.ok(m.saveCustomProtocol({ name: 'Ok', prompt: 'p'.repeat(4001) }).errors.prompt);
  assert.equal(m.saveCustomProtocol({ name: 'n'.repeat(40), prompt: 'p'.repeat(4000) }).ok, true);
  assert.equal(m.saveCustomProtocol({}).ok, false);
  assert.equal(m.saveCustomProtocol(null).ok, false);

  const v = m.validateCustomProtocol({ name: 'X', prompt, mode: 'turbo', icon: 'not-an-icon' });
  assert.equal(v.ok, true);
  assert.equal(v.value.mode, 'auto', 'unknown mode falls back to auto');
  assert.equal(v.value.icon, 'bolt', 'unknown icon falls back to bolt');

  assert.equal(m.saveCustomProtocol({ name: 'Market Wrap', prompt }).ok, true);
  const dup = m.saveCustomProtocol({ name: 'market wrap', prompt });
  assert.equal(dup.ok, false);
  assert.match(dup.errors.name, /already have/);
});

test('custom protocols: at most 24, and ids never collide with built-ins', async () => {
  installStorage(fakeStorage());
  const m = await freshModule();
  const first = m.saveCustomProtocol({ id: 'morning-briefing', name: 'Mine', prompt: 'My own morning thing, please.' });
  assert.equal(first.ok, true);
  assert.notEqual(first.protocol.id, 'morning-briefing');
  for (let i = 2; i <= 24; i++) assert.equal(m.saveCustomProtocol({ name: `P${i}`, prompt: 'A perfectly reasonable mission brief.' }).ok, true, `#${i}`);
  const over = m.saveCustomProtocol({ name: 'P25', prompt: 'A perfectly reasonable mission brief.' });
  assert.equal(over.ok, false);
  assert.match(over.errors.form, /up to 24/);
  assert.equal(m.listProtocols().length, BUILT_IN_IDS.length + 24);
  const ids = m.listProtocols().map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
});

test('custom protocols: corrupt or hostile stored data is ignored', async () => {
  const store = fakeStorage();
  installStorage(store);
  store.setItem(KEY, '{not json');
  let m = await freshModule();
  assert.equal(m.listProtocols().length, BUILT_IN_IDS.length);

  store.setItem(
    KEY,
    JSON.stringify([
      { id: 'custom-1', name: 'Good', prompt: 'A perfectly reasonable mission brief.', mode: 'swarm', icon: 'pin', createdAt: 5, updatedAt: 6 },
      { id: 'custom-1', name: 'Duplicate id', prompt: 'A perfectly reasonable mission brief.' },
      { id: 'deep-research', name: 'Shadows a built-in', prompt: 'A perfectly reasonable mission brief.' },
      { id: 'custom-2', name: '', prompt: 'No name' },
      { id: 'custom-3', name: 'No prompt' },
      { id: 'custom-4', name: 'Weird fields', prompt: 'A perfectly reasonable mission brief.', mode: 'nuclear', icon: '<svg onload=alert(1)>' },
      'a string',
      null,
    ]),
  );
  m = await freshModule();
  const custom = m.listProtocols().filter((p) => p.custom);
  assert.deepEqual(custom.map((p) => p.id), ['custom-1', 'custom-4']);
  assert.equal(custom[1].mode, 'auto');
  assert.equal(custom[1].icon, 'bolt');

  store.setItem(KEY, JSON.stringify({ not: 'an array' }));
  m = await freshModule();
  assert.equal(m.listProtocols().length, BUILT_IN_IDS.length);
});

test('custom protocols: in-memory fallback when storage is full or blocked', async (t) => {
  quietWarnings(t);
  // Writes fail (quota / Safari private mode): the change lasts for the session.
  const store = fakeStorage({ failWrites: true });
  installStorage(store);
  let m = await freshModule();
  const res = m.saveCustomProtocol({ name: 'Ephemeral', prompt: 'A perfectly reasonable mission brief.' });
  assert.equal(res.ok, true);
  assert.equal(res.persisted, false);
  assert.ok(m.listProtocols().some((p) => p.name === 'Ephemeral'), 'kept in memory');
  assert.equal(store.getItem(KEY), null);
  // Once storage works again, the next write persists everything kept so far.
  store.failWrites = false;
  const res2 = m.saveCustomProtocol({ name: 'Second', prompt: 'A perfectly reasonable mission brief.' });
  assert.equal(res2.persisted, true);
  assert.deepEqual(JSON.parse(store.getItem(KEY)).map((x) => x.name), ['Ephemeral', 'Second']);

  // Accessing localStorage throws (blocked site data): still fully usable in memory.
  installStorage(null, { throwOnAccess: true });
  m = await freshModule();
  assert.equal(m.listProtocols().length, BUILT_IN_IDS.length);
  const res3 = m.saveCustomProtocol({ name: 'Blocked', prompt: 'A perfectly reasonable mission brief.' });
  assert.equal(res3.ok, true);
  assert.equal(res3.persisted, false);
  assert.ok(m.getProtocol(res3.protocol.id));
  assert.equal(m.deleteCustomProtocol(res3.protocol.id), true);
  assert.equal(m.listProtocols().length, BUILT_IN_IDS.length);

  // No localStorage at all.
  installStorage(undefined);
  m = await freshModule();
  assert.equal(m.saveCustomProtocol({ name: 'Nothing', prompt: 'A perfectly reasonable mission brief.' }).ok, true);
  assert.equal(m.listProtocols().length, BUILT_IN_IDS.length + 1);
});

test('custom protocols: change notifications', async () => {
  installStorage(fakeStorage());
  const m = await freshModule();
  let calls = 0;
  const off = m.onProtocolsChange(() => calls++);
  const { protocol } = m.saveCustomProtocol({ name: 'Notify', prompt: 'A perfectly reasonable mission brief.' });
  assert.equal(calls, 1);
  m.deleteCustomProtocol(protocol.id);
  assert.equal(calls, 2);
  m.deleteCustomProtocol(protocol.id); // nothing removed: no event
  assert.equal(calls, 2);
  off();
  m.saveCustomProtocol({ name: 'Quiet', prompt: 'A perfectly reasonable mission brief.' });
  assert.equal(calls, 2);
  assert.equal(typeof m.onProtocolsChange('not a function'), 'function');
});

test('custom protocols: buildPrompt substitutes {input} literally', async () => {
  installStorage(fakeStorage());
  const m = await freshModule();
  const plain = m.saveCustomProtocol({ name: 'Market Wrap', prompt: 'Give me a weekly market wrap with a table of moves.', mode: 'swarm' }).protocol;
  const text = plain.buildPrompt({ input: 'ignored', settings: SETTINGS, now: NOW });
  assert.equal(text, 'Market Wrap\n\nProtocol: Market Wrap\nGive me a weekly market wrap with a table of moves.');
  assert.deepEqual(parseProtocolPrompt(text), { headline: 'Market Wrap', name: 'Market Wrap', brief: 'Give me a weekly market wrap with a table of moves.' });

  const asks = m.saveCustomProtocol({ name: 'Dinner Ideas', prompt: 'Three dinners using {input}. Keep it under { INPUT } budget.', mode: 'auto' }).protocol;
  assert.equal(asks.needsInput, true);
  assert.ok(asks.inputLabel && asks.inputPlaceholder && asks.inputHint);
  assert.equal(asks.buildPrompt({ input: '  ' }), '', 'empty input builds nothing');
  // `$&` and `$1` must not be treated as replacement patterns.
  const out = asks.buildPrompt({ input: 'leeks & $& $1 $$', settings: SETTINGS, now: NOW });
  assert.equal(out, 'Dinner Ideas: leeks & $& $1 $$\n\nProtocol: Dinner Ideas\nThree dinners using leeks & $& $1 $$. Keep it under leeks & $& $1 $$ budget.');
});
