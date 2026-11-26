// The T1-T5 harness (test/unit/router-harness.mjs) on a tiny router of contract (b), so the tests of
// the real router can trust it: it finds steals, misses, undeclared collisions, wrong winners, surface
// differences and alternatives taken against R7. Plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routerHarness } from './router-harness.mjs';
import { sortRegistrations, readingsToTry, alternativeOk, overCap } from '../../src/lib/command-order.js';

/** A minimal router of contract (b), in the declared order, with R3 and R7. */
function tinyRouter(regs) {
  return {
    route(readings, state) {
      const list = readingsToTry(readings);
      for (const r of sortRegistrations(regs)) {
        if (Array.isArray(r.surfaces) && !r.surfaces.includes(state.surface)) continue;
        for (const [i, text] of list.entries()) {
          if (overCap(text, !!r.carrier)) continue;
          let action = null;
          try {
            action = r.match(text, state);
          } catch {
            action = null;
          }
          if (action && (i === 0 || alternativeOk(action))) return { id: r.id, action, reading: text };
        }
      }
      return null;
    },
  };
}

const exact = (...words) => (t) => (words.includes(String(t).toLowerCase()) ? { do: 'x' } : null);
const REGS = [
  { id: 'stop', layer: 'stop', match: (t, s) => (/^stop$/i.test(t) && !s.hologram ? { do: 'stop' } : null) },
  { id: 'hologram', layer: 'top', match: (t, s) => (s.hologram && /^(stop|explode it)$/i.test(t) ? { do: 'h' } : null) },
  { id: 'app', layer: 'app', match: exact('new chat', 'open settings') },
  { id: 'camera', layer: 'camera', surfaces: ['voice'], match: (t) => (/^what is this$/i.test(t) ? { do: 'look', camera: true, free: false } : null) },
  { id: 'greedy', layer: 'media', match: exact('explode it', 'tell me a joke') },
];
const STATES = { V0: { surface: 'voice' }, VH: { surface: 'voice', hologram: { open: true } } };
const h = routerHarness({ route: tinyRouter(REGS).route, registrations: REGS, resolveState: (s) => (typeof s === 'string' ? STATES[s] : { surface: 'voice', ...s }) });

test('T1 finds an ordinary sentence taken, and lets a declared take through', () => {
  assert.deepEqual(h.t1(['tell me a joke', 'what time is it'], ['V0']), [{ text: 'tell me a joke', state: 'V0', id: 'greedy' }]);
  assert.deepEqual(h.t1(['tell me a joke'], ['V0'], [{ text: 'tell me a joke', states: ['V0'], by: 'greedy' }]), []);
});

test('T2 finds a phrase the wrong matcher (or nothing) takes', () => {
  const rows = [{ text: 'new chat', state: 'V0', owner: 'voice' }, { text: 'open history', state: 'V0', owner: 'voice' }];
  const misses = h.t2(rows, () => ['app']);
  assert.deepEqual(misses.map((m) => [m.row.text, m.got]), [['open history', null]]);
});

test('T3: a sentence two matchers claim must be declared, and its winner must win', () => {
  assert.deepEqual(h.claims('explode it', STATES.VH), ['hologram', 'greedy']);
  const none = h.t3(['explode it', 'new chat'], ['VH'], []);
  assert.deepEqual(none.undeclared.map((u) => [u.text, u.state, u.claims, u.routed]), [['explode it', 'VH', ['hologram', 'greedy'], 'hologram']]);
  const ok = h.t3(['explode it'], ['VH'], [{ text: 'explode it', state: 'VH', winner: 'hologram' }]);
  assert.deepEqual(ok, { undeclared: [], wrong: [] });
  const bad = h.t3([], [], [{ text: 'stop', state: 'VH', winner: 'stop' }, { text: 'stop', state: 'V0', winner: ['stop', 'x'] }]);
  assert.deepEqual(bad.wrong, [{ row: { text: 'stop', state: 'VH', winner: 'stop' }, got: 'hologram' }]);
});

test('T4: the surfaces agree, except a matcher declared for some surfaces only', () => {
  assert.deepEqual(h.t4(['new chat'], ['V0']), []);
  const d = h.t4(['what is this'], ['V0']);
  assert.equal(d.length, 1, 'camera words act in Voice Mode only: declared, or it is a difference');
  assert.deepEqual(h.t4(['what is this'], ['V0'], [{ id: 'camera', surfaces: ['voice'] }]), []);
});

test('T5: alternatives only for free, undoable, unchecked actions without the camera', () => {
  const rows = [
    { best: 'new jacket', alts: ['new chat'], state: 'V0', want: { layer: 'app' } },
    { best: 'what is his', alts: ['what is this'], state: 'V0', want: 'claude' },
    { best: 'what time is it', alts: ['new chat'], state: 'V0', want: 'claude' },
  ];
  assert.deepEqual(h.t5(rows, (id) => REGS.find((r) => r.id === id)?.layer), []);
  assert.equal(h.t5([{ best: 'new jacket', alts: ['new chat'], state: 'V0', want: 'claude' }]).length, 1);
});
