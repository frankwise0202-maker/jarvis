// The one router's tests T1-T5 (v8.1 C1, u-voice §4.4), as functions over any router of contract (b)
// and any corpora, so test/unit/command-router.test.mjs runs them over every builder's matchers and
// every builder's sections. Plain Node, no app imports.
//
//   const h = routerHarness({ route, registrations, resolveState })
//     route(readings, state) -> { id, action, reading } | null   the router under test (null: Claude)
//     registrations          [{ id, layer, surfaces, carrier, match }] as registered (for T3's claims)
//     resolveState(s)        a state name or patch -> a full state (fixtures: stateFor / baseState)
//   h.claims(text, state)    the ids of every matcher that takes `text` on its own, in `state`
//   h.t1(sentences, states, allowed)   T1 no-steal: [{ text, state, id }] taken although ordinary
//   h.t2(rows, idsOf)                  T2 must-match: [{ row, got }] not taken as the row says
//   h.t3(sentences, states, table)     T3 collisions: { undeclared, wrong } (two matchers claim a
//                                      sentence the table doesn't name; a row's winner doesn't win)
//   h.t4(sentences, states, exceptions) T4 surface parity: [{ text, state, by }] where the surfaces differ
//   h.t5(rows)                         T5 alternatives: [{ row, got }]
//
// A matcher that throws is skipped, as the router skips it (C1 Degrades). R3's cap applies to
// matchers that aren't carriers.

import { overCap } from '../../src/lib/command-order.js';

const SURFACES = ['voice', 'chat', 'hologram', 'optics'];
const stateName = (s) => (typeof s === 'string' ? s : s && s.name ? s.name : 'state');
const winners = (w) => (Array.isArray(w) ? w : [w]);

export function routerHarness({ route, registrations = [], resolveState }) {
  const regs = registrations.filter((r) => r && typeof r.match === 'function');
  const resolve = (s) => resolveState(s);
  const idOf = (res) => (res && res.id) || null;
  const routeOne = (text, state) => {
    try {
      return route([text], state);
    } catch (err) {
      return { id: `THREW: ${err && err.message}` };
    }
  };

  function claims(text, state) {
    const out = [];
    for (const r of regs) {
      const surfaces = Array.isArray(r.surfaces) ? r.surfaces : SURFACES;
      if (!surfaces.includes(state.surface)) continue;
      if (overCap(text, !!r.carrier)) continue;
      let hit = null;
      try {
        hit = r.match(text, state);
      } catch {
        hit = null;
      }
      if (hit) out.push(r.id);
    }
    return out;
  }

  function allowedFor(allowed, text, name) {
    return (allowed || []).find((a) => a.text === text && (!a.states || a.states.includes(name)));
  }

  function t1(sentences, states, allowed = []) {
    const stolen = [];
    for (const name of states) {
      const state = resolve(name);
      for (const text of sentences) {
        const id = idOf(routeOne(text, state));
        if (!id) continue;
        const ok = allowedFor(allowed, text, name);
        if (ok && (!ok.by || ok.by === id || id.startsWith(`${ok.by}`))) continue;
        stolen.push({ text, state: name, id });
      }
    }
    return stolen;
  }

  /** rows: { text, state, layer, owner, does }; idsOf(row) -> the ids that may take it (any of them). */
  function t2(rows, idsOf) {
    const misses = [];
    for (const row of rows) {
      const got = routeOne(row.text, resolve(row.state));
      const want = idsOf(row);
      if (!got || !want.includes(got.id)) misses.push({ row, got: idOf(got) });
    }
    return misses;
  }

  function rowFor(table, text, name) {
    return table.find((r) => r.text === text && stateName(r.state) === name);
  }

  function t3(sentences, states, table = []) {
    const undeclared = [];
    const wrong = [];
    const seen = new Set();
    for (const name of states) {
      const state = resolve(name);
      for (const text of sentences) {
        const key = `${name}\u0000${text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ids = claims(text, state);
        if (ids.length < 2) continue;
        if (!rowFor(table, text, name)) undeclared.push({ text, state: name, claims: ids, routed: idOf(routeOne(text, state)) });
      }
    }
    for (const row of table) {
      const got = idOf(routeOne(row.text, resolve(row.state)));
      if (!winners(row.winner).includes(got)) wrong.push({ row: { text: row.text, state: stateName(row.state), winner: row.winner }, got });
    }
    return { undeclared, wrong };
  }

  /**
   * The same words give the same matcher on every surface (the chat box is the reference), except the
   * declared exceptions: { id, surfaces } names a matcher that acts only on those surfaces (camera
   * words and Voice Mode's controls: Voice Mode only).
   */
  function t4(sentences, states, exceptions = []) {
    const differ = [];
    const only = (id) => exceptions.find((e) => e.id === id);
    for (const name of states) {
      const base = resolve(name);
      for (const text of sentences) {
        const by = {};
        for (const surface of SURFACES) by[surface] = idOf(routeOne(text, { ...base, surface }));
        const ref = by.chat;
        const odd = SURFACES.filter((surface) => {
          if (by[surface] === ref) return false;
          const mine = only(by[surface]);
          if (mine && mine.surfaces.includes(surface)) return false; // acts only here, by design
          const theirs = only(ref);
          return !(theirs && !theirs.surfaces.includes(surface)); // the chat's matcher doesn't act here
        });
        if (odd.length) differ.push({ text, state: name, by });
      }
    }
    return differ;
  }

  /** rows: { best, alts, state, want: 'claude' | { layer?, id?, do? } }; layerOf(id) -> its layer. */
  function t5(rows, layerOf = () => null) {
    const out = [];
    for (const row of rows) {
      let got = null;
      try {
        got = route([row.best, ...row.alts], resolve(row.state));
      } catch (err) {
        got = { id: `THREW: ${err && err.message}` };
      }
      if (row.want === 'claude') {
        if (got) out.push({ row, got: idOf(got) });
        continue;
      }
      const okLayer = !row.want.layer || (got && layerOf(got.id) === row.want.layer);
      const okId = !row.want.id || (got && got.id === row.want.id);
      if (!got || !okLayer || !okId) out.push({ row, got: idOf(got) });
    }
    return out;
  }

  return { claims, t1, t2, t3, t4, t5 };
}
