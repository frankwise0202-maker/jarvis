// Ported from the phase A prototype (holo-proto test/hologram-spec.test.mjs): the show_hologram spec
// validator, the streaming stable-prefix rule, the tool definition and tool_result text. Samples
// live in test/mock/fixtures/ (shared with the mock); the repo's own parsePartialJson is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HOLOGRAM_LIMITS as L,
  normalizeHologramSpec,
  normalizeShape,
  stablePrefix,
  SHOW_HOLOGRAM_TOOL,
  hologramToolResult,
  hologramSummary,
  cleanText,
  normalizeId,
} from '../../src/lib/hologram-spec.js';
import { parsePartialJson } from '../../src/engine/util.js';

const sample = (name) => readFileSync(new URL(`../mock/fixtures/${name}.json`, import.meta.url), 'utf8');
const box = (extra = {}) => ({ type: 'box', size: [1, 1, 1], ...extra });
const part = (i, extra = {}) => ({ id: `p${i}`, name: `Part ${i}`, info: 'x', shapes: [box()], ...extra });

// ---------------------------------------------------------------------------------------------
// Samples are the proof that the format is expressive enough: they must validate cleanly.

for (const [name, min, max] of [
  ['battery', 8, 20],
  ['alternator', 15, 40],
  ['camry', 35, 50],
]) {
  test(`sample ${name}: valid, zero warnings, believable part count`, () => {
    const raw = sample(name);
    const res = normalizeHologramSpec(JSON.parse(raw));
    assert.equal(res.ok, true);
    assert.deepEqual(res.warnings, []);
    assert.ok(res.stats.parts >= min && res.stats.parts <= max, `${res.stats.parts} parts`);
    assert.equal(res.stats.dropped, 0);
    const ids = res.spec.parts.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const p of res.spec.parts) {
      assert.ok(p.name && p.name.length <= 26, `short label: ${p.name}`);
      assert.ok(p.info.length > 20, `info for ${p.id}`);
      assert.ok(p.shapes.length >= 1);
    }
    // a JSON string is accepted too
    assert.equal(normalizeHologramSpec(raw).ok, true);
  });
}

test('camry: models the DC-DC converter instead of an alternator and says so', () => {
  const { spec } = normalizeHologramSpec(JSON.parse(sample('camry')));
  assert.ok(!spec.parts.some((p) => /^alternator$/i.test(p.name)));
  const dcdc = spec.parts.find((p) => p.id === 'dcdc-converter');
  assert.ok(dcdc);
  assert.match(dcdc.info, /no alternator/i);
  assert.ok(dcdc.aka.includes('alternator'));
});

// ---------------------------------------------------------------------------------------------
// Bad input

test('rejects non-objects and specs with nothing to show', () => {
  for (const bad of [null, undefined, 42, 'not json', [], [1, 2]]) {
    const res = normalizeHologramSpec(bad);
    assert.equal(res.ok, false);
    assert.ok(res.warnings.length > 0);
  }
  assert.equal(normalizeHologramSpec({ title: 'x' }).ok, false);
  assert.equal(normalizeHologramSpec({ title: 'x', parts: [] }).ok, false);
  assert.equal(normalizeHologramSpec({ title: 'x', parts: 'nope' }).ok, false);
  const allBad = normalizeHologramSpec({ title: 'x', parts: [{ id: 'a', name: 'A', shapes: [{ type: 'warp-drive' }] }] });
  assert.equal(allBad.ok, false);
  assert.match(allBad.warnings[0], /Nothing to show/);
});

test('numbers must be finite and inside the limits', () => {
  const cases = [
    { type: 'box', size: [1, NaN, 1] },
    { type: 'box', size: [1, Infinity, 1] },
    { type: 'box', size: [1, 0, 1] },
    { type: 'box', size: [1, -2, 1] },
    { type: 'box', size: [1, 1] },
    { type: 'box', size: [1, 1, L.size + 1] },
    { type: 'box', size: [1, 1, 1], at: [0, L.coord + 1, 0] },
    { type: 'box', size: [1, 1, 1], at: [0, 'abc', 0] },
    { type: 'cylinder', r: 0, h: 1 },
    { type: 'cylinder', r: 1 },
    { type: 'sphere' },
    { type: 'torus', r: 5 },
    { type: 'lathe', profile: [[0, 0], [0, 5]] },
    { type: 'lathe', profile: [[1, 0]] },
    { type: 'extrude', outline: [[0, 0], [1, 1], [2, 2]], depth: 1 }, // no area
    { type: 'extrude', outline: [[0, 0], [1, 0], [1, 1]] }, // no depth
    { type: 'tube', path: [[0, 0, 0]], r: 1 },
    { type: 'line', path: [[0, 0, 0], [1, 1]] },
  ];
  for (const raw of cases) {
    const res = normalizeShape(raw);
    assert.ok(res.error, `should drop ${JSON.stringify(raw)}`);
  }
  const res = normalizeHologramSpec({ title: 't', parts: [{ id: 'a', name: 'A', shapes: [...cases, box()] }] });
  assert.equal(res.ok, true);
  assert.equal(res.spec.parts[0].shapes.length, 1);
  assert.equal(res.stats.dropped, cases.length);
  assert.ok(res.warnings.every((w) => /dropped/.test(w)));
});

test('numeric strings are accepted, rotations wrap, -0 is cleaned', () => {
  const { shape } = normalizeShape({ type: 'cylinder', r: '2', h: '3.5', rot: [370, -0, 720], at: [1, 2, 3] });
  assert.equal(shape.r, 2);
  assert.equal(shape.h, 3.5);
  assert.deepEqual(shape.rot, [10, 0, 0]);
  const { shape: s2 } = normalizeShape({ type: 'box', size: [1, 1, 1], rot: [0, 360, 0] });
  assert.equal(s2.rot, undefined);
});

test('unknown fields are ignored, aliases resolved', () => {
  const { shape } = normalizeShape({ type: 'cube', position: [1, 2, 3], size: [2, 2, 2], color: 'red', onclick: 'x' });
  assert.deepEqual(shape, { type: 'box', at: [1, 2, 3], size: [2, 2, 2] });
  const { shape: c } = normalizeShape({ type: 'cylinder', radius: 4, height: 9 });
  assert.equal(c.r, 4);
  assert.equal(c.h, 9);
  const { shape: l } = normalizeShape({ type: 'revolve', points: [[1, 0], [2, 3]] });
  assert.deepEqual(l.profile, [[1, 0], [2, 3]]);
});

test('soft problems keep the shape and warn', () => {
  const res = normalizeShape({ type: 'cylinder', r: 3, h: 2, hole: 5, sides: 2, axis: 'diagonal' });
  assert.ok(res.shape);
  assert.equal(res.shape.hole, undefined);
  assert.equal(res.shape.sides, undefined);
  assert.equal(res.shape.axis, undefined);
  assert.equal(res.notes.length, 3);
  const rep = normalizeShape({ type: 'box', size: [1, 1, 1], repeat: { count: 1 } });
  assert.ok(rep.shape && !rep.shape.repeat && /repeat ignored/.test(rep.notes[0]));
});

test('axis, repeat and per-type fields are normalized', () => {
  const s = normalizeShape({ type: 'cylinder', axis: '+X', r: 1, h: 2, r2: 1 }).shape;
  assert.equal(s.axis, 'x');
  assert.equal(s.r2, undefined); // same as r
  assert.equal(normalizeShape({ type: 'cone', axis: 'y', r: 1, h: 1 }).shape.axis, undefined); // default
  assert.equal(normalizeShape({ type: 'extrude', axis: 'z', outline: [[0, 0], [1, 0], [0, 1]], depth: 1 }).shape.axis, undefined);
  const r1 = normalizeShape({ type: 'box', size: [1, 1, 1], repeat: { count: 500, around: 'Z' } }).shape.repeat;
  assert.deepEqual(r1, { count: L.repeat, around: 'z', step: 360 / L.repeat, start: 0 });
  const r2 = normalizeShape({ type: 'box', size: [1, 1, 1], repeat: { count: 3, along: [0, 5, 0] } }).shape.repeat;
  assert.deepEqual(r2, { count: 3, along: [0, 5, 0] });
  const r3 = normalizeShape({ type: 'box', size: [1, 1, 1], repeat: { count: 4, around: 'x', start: 45, center: [1, 2, 3] } }).shape.repeat;
  assert.deepEqual(r3, { count: 4, around: 'x', step: 90, start: 45, center: [1, 2, 3] });
  assert.equal(normalizeShape({ type: 'box', size: [2, 4, 6], r: 99 }).shape.r, 0.98); // clamped below half the smallest side
  assert.equal(normalizeShape({ type: 'capsule', r: 5, h: 4 }).shape.h, 10); // at least a sphere
  assert.deepEqual(normalizeShape({ type: 'lathe', profile: [[-1, 0], [2, 1]] }).shape.profile, [[0, 0], [2, 1]]);
});

// ---------------------------------------------------------------------------------------------
// Limits

test('caps parts, shapes per part, total shapes, instances, text and notes', () => {
  const many = normalizeHologramSpec({ title: 't', parts: Array.from({ length: 95 }, (_, i) => part(i)) });
  assert.equal(many.spec.parts.length, L.parts);
  assert.ok(many.warnings.some((w) => /only the first 80/.test(w)));

  const fat = normalizeHologramSpec({ title: 't', parts: [part(0, { shapes: Array.from({ length: 30 }, () => box()) })] });
  assert.equal(fat.spec.parts[0].shapes.length, L.shapesPerPart);

  const total = normalizeHologramSpec({ title: 't', parts: Array.from({ length: 20 }, (_, i) => part(i, { shapes: Array.from({ length: 24 }, () => box()) })) });
  assert.equal(total.stats.shapes, L.shapes);
  assert.ok(total.warnings.some((w) => /limited to 400 shapes/.test(w)));

  const inst = normalizeHologramSpec({
    title: 't',
    parts: Array.from({ length: 40 }, (_, i) => part(i, { shapes: [box({ repeat: { count: 64, along: [1, 0, 0] } })] })),
  });
  assert.ok(inst.stats.instances <= L.instances);
  assert.ok(inst.warnings.some((w) => /including copies/.test(w)));

  const long = normalizeHologramSpec({ title: 'T'.repeat(200), subtitle: 'S'.repeat(300), notes: Array.from({ length: 9 }, () => 'n'.repeat(400)), parts: [part(0, { name: 'N'.repeat(90), info: 'I'.repeat(900), material: 'M'.repeat(200) })] });
  assert.equal(long.spec.title.length, L.title);
  assert.ok(long.spec.title.endsWith('…'));
  assert.equal(long.spec.subtitle.length, L.subtitle);
  assert.equal(long.spec.notes.length, L.notes);
  assert.equal(long.spec.notes[0].length, L.note);
  assert.equal(long.spec.parts[0].name.length, L.partName);
  assert.equal(long.spec.parts[0].info.length, L.info);
  assert.equal(long.spec.parts[0].material.length, L.material);
});

test('warnings are capped for the tool_result', () => {
  const res = normalizeHologramSpec({ title: 't', parts: [part(0, { shapes: [box(), ...Array.from({ length: 23 }, () => ({ type: 'nope' }))] }), ...Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, name: 'x', shapes: [] }))] });
  assert.equal(res.warnings.length, L.warnings);
  assert.match(res.warnings.at(-1), /and \d+ more/);
});

// ---------------------------------------------------------------------------------------------
// Ids, names, groups, tones, text

test('ids are repaired, de-duplicated and derived from names', () => {
  assert.equal(normalizeId('Front Brake (L)'), 'front-brake-l');
  assert.equal(normalizeId('--Élan Vital!--'), 'elan-vital');
  assert.equal(normalizeId('***'), '');
  assert.equal(normalizeId('x'.repeat(60)).length, 40);
  const res = normalizeHologramSpec({
    title: 't',
    parts: [
      { id: 'Rotor', name: 'Rotor', shapes: [box()] },
      { id: 'rotor', name: 'Rotor 2', shapes: [box()] },
      { name: 'Slip rings', shapes: [box()] },
      { id: '!!!', shapes: [box()] },
    ],
  });
  assert.deepEqual(
    res.spec.parts.map((p) => p.id),
    ['rotor', 'rotor-2', 'slip-rings', 'part-4'],
  );
  assert.equal(res.spec.parts[3].name, 'Part 4');
  assert.ok(res.warnings.some((w) => /duplicate id "rotor"; renamed "rotor-2"/.test(w)));
});

test('groups, tones, explode and anchor are validated', () => {
  const res = normalizeHologramSpec({
    title: 't',
    groups: [{ id: 'Drive End', name: 'Drive end' }, { id: 'drive-end', name: 'dup' }, { name: '' }],
    parts: [
      part(0, { group: 'drive-end', tone: 'WARNING', explode: [0, 10, 0], anchor: [1, 2, 3] }),
      part(1, { group: 'missing', tone: 'neon', explode: [0, 'x', 0], anchor: 'top' }),
    ],
  });
  assert.deepEqual(res.spec.groups, [{ id: 'drive-end', name: 'Drive end' }]);
  const [a, b] = res.spec.parts;
  assert.equal(a.group, 'drive-end');
  assert.equal(a.tone, 'warning');
  assert.deepEqual(a.explode, [0, 10, 0]);
  assert.deepEqual(a.anchor, [1, 2, 3]);
  assert.equal(b.group, null);
  assert.equal(b.tone, 'primary');
  assert.equal(b.explode, null);
  assert.equal(b.anchor, null);
  assert.equal(res.warnings.length, 6);
});

test('text is cleaned but never interpreted (rendered with textContent)', () => {
  assert.equal(cleanText('  a\n\tb\u0000c\u202Ed\u2028e  ', 50), 'a b c d e');
  assert.equal(cleanText('<img src=x onerror=alert(1)>', 80), '<img src=x onerror=alert(1)>');
  assert.equal(cleanText({ toString: () => 'x' }, 10), '');
  const emoji = cleanText('😀'.repeat(50), 9);
  assert.ok(emoji.length <= 9);
  assert.ok(!/[\ud800-\udbff]…$/.test(emoji), 'never splits a surrogate pair');
  const res = normalizeHologramSpec({ title: '<b>Car</b>', parts: [part(0, { name: '<script>x</script>' })] });
  assert.equal(res.spec.title, '<b>Car</b>');
  assert.equal(res.spec.parts[0].name, '<script>x</script>');
});

test('units and view accept common spellings', () => {
  const res = normalizeHologramSpec({ title: 't', units: 'Millimetres', view: 'Rear Left', parts: [part(0)] });
  assert.equal(res.spec.units, 'mm');
  assert.equal(res.spec.view, 'back-left');
  const bad = normalizeHologramSpec({ title: 't', units: 'furlongs', view: 'sideways', parts: [part(0)] });
  assert.equal(bad.spec.units, 'mm');
  assert.equal(bad.spec.view, 'front-left');
  assert.equal(bad.warnings.length, 2);
});

// ---------------------------------------------------------------------------------------------
// Streaming: partial specs from a growing JSON prefix

test('stablePrefix keeps only certainly-complete values', () => {
  assert.deepEqual(stablePrefix({ title: 'Cam' }), {});
  assert.deepEqual(stablePrefix({ title: 'Camry', units: 'm' }), { title: 'Camry' });
  const draft = {
    title: 'T',
    parts: [
      { id: 'a', name: 'A', shapes: [{ type: 'box', size: [1, 1, 1] }] },
      { id: 'b', name: 'Bo', shapes: [{ type: 'box', size: [1, 1, 1] }, { type: 'box', size: [1, 1] }] },
    ],
  };
  const s = stablePrefix(draft);
  assert.deepEqual(s.parts[0], draft.parts[0]);
  assert.deepEqual(s.parts[1], { __streaming: true, id: 'b', name: 'Bo', shapes: [{ type: 'box', size: [1, 1, 1] }] });
  // the last part's last key (here: name still streaming) is dropped
  assert.deepEqual(stablePrefix({ parts: [{ id: 'c', name: 'Cath' }] }).parts[0], { __streaming: true, id: 'c' });
  // later top-level keys make parts final
  assert.equal(stablePrefix({ parts: [{ id: 'x' }], notes: ['a', 'b'] }).parts[0].__streaming, undefined);
  assert.deepEqual(stablePrefix({ parts: [], notes: ['a', 'b'] }).notes, ['a']);
});

test('partial mode never warns, keeps pending parts and flags the streaming one', () => {
  const res = normalizeHologramSpec({ title: 'T', parts: [{ id: 'a', name: 'A', shapes: [] }, { id: 'b', name: 'B', shapes: [{ type: 'bogus' }, box()] }] }, { partial: true });
  assert.equal(res.ok, true);
  assert.deepEqual(res.warnings, []);
  assert.equal(res.spec.parts.length, 2);
  assert.equal(res.spec.parts[0].shapes.length, 0);
  assert.equal(res.spec.parts[1].streaming, true);
  assert.equal(normalizeHologramSpec({}, { partial: true }).ok, true);
});

for (const name of ['battery', 'alternator', 'camry']) {
  test(`streaming ${name}: monotonic, finished parts and shapes never change, ends equal to the final spec`, () => {
    const raw = JSON.stringify(JSON.parse(sample(name)));
    const final = normalizeHologramSpec(JSON.parse(raw));
    const seen = new Map(); // key -> { id, shapes: [json] }
    let lastParts = 0;
    let lastShapes = 0;
    const step = Math.max(7, Math.floor(raw.length / 900));
    for (let n = 1; n <= raw.length; n += step) {
      const draft = parsePartialJson(raw.slice(0, n));
      if (draft === undefined) continue;
      const res = normalizeHologramSpec(draft, { partial: true });
      assert.equal(res.ok, true);
      assert.deepEqual(res.warnings, []);
      const parts = res.spec.parts;
      assert.ok(parts.length >= lastParts, 'parts never disappear');
      lastParts = parts.length;
      let shapes = 0;
      for (const p of parts) {
        shapes += p.shapes.length;
        const json = p.shapes.map((s) => JSON.stringify(s));
        const prev = seen.get(p.key);
        if (prev) {
          assert.ok(json.length >= prev.shapes.length, `${p.key}: shapes never disappear`);
          for (let i = 0; i < prev.shapes.length; i++) assert.equal(json[i], prev.shapes[i], `${p.key}: shape ${i} never changes once shown`);
        }
        seen.set(p.key, { shapes: json });
        // a shape shown while streaming is exactly the final one
        const f = final.spec.parts.find((q) => q.key === p.key);
        for (let i = 0; i < json.length; i++) assert.equal(json[i], JSON.stringify(f.shapes[i]));
      }
      assert.ok(shapes >= lastShapes);
      lastShapes = shapes;
      const streamingCount = parts.filter((p) => p.streaming).length;
      assert.ok(streamingCount <= 1);
      if (streamingCount) assert.equal(parts.at(-1).streaming, true);
    }
    const end = normalizeHologramSpec(parsePartialJson(raw), { partial: false });
    assert.deepEqual(end.spec, final.spec);
  });
}

test('streaming: a number cut short at the end of the buffer is never used', () => {
  // "h": 12 of 120 must not reach the renderer
  const draft = parsePartialJson('{"title":"T","parts":[{"id":"a","name":"A","shapes":[{"type":"cylinder","r":5,"h":12');
  const res = normalizeHologramSpec(draft, { partial: true });
  assert.equal(res.spec.parts[0].shapes.length, 0);
  // still the last element: not yet shown, even though it looks complete
  const comma = parsePartialJson('{"title":"T","parts":[{"id":"a","name":"A","shapes":[{"type":"cylinder","r":5,"h":120},');
  assert.equal(normalizeHologramSpec(comma, { partial: true }).spec.parts[0].shapes.length, 0);
  // once the next shape starts, the first one is final
  const next = parsePartialJson('{"title":"T","parts":[{"id":"a","name":"A","shapes":[{"type":"cylinder","r":5,"h":120},{"type":"bo');
  assert.equal(normalizeHologramSpec(next, { partial: true }).spec.parts[0].shapes[0].h, 120);
});

// ---------------------------------------------------------------------------------------------
// Tool definition and result

test('show_hologram tool definition is complete and serializable', () => {
  const t = JSON.parse(JSON.stringify(SHOW_HOLOGRAM_TOOL));
  assert.equal(t.name, 'show_hologram');
  assert.equal(t.eager_input_streaming, true);
  assert.ok(t.description.length > 200 && t.description.length < 1500);
  assert.deepEqual(t.input_schema.required, ['title', 'parts']);
  // every property carries a description (they are written for Claude), except trivial repeat fields
  const missing = [];
  const walk = (schema, path) => {
    if (schema.properties) {
      for (const [k, v] of Object.entries(schema.properties)) {
        if (!v.description && !path.endsWith('repeat')) missing.push(`${path}.${k}`);
        walk(v, `${path}.${k}`);
      }
    }
    if (schema.items) walk(schema.items, `${path}[]`);
  };
  walk(t.input_schema, 'input');
  assert.deepEqual(missing.filter((m) => !/groups\[\]\.(id|name)$/.test(m) || false), []);
  assert.ok(JSON.stringify(t).length < 11000, 'tool definition stays compact');
});

test('tool result text', () => {
  const ok = normalizeHologramSpec({ title: 'Widget', parts: [part(0), part(1, { shapes: [box(), { type: 'nope' }] })] });
  const r = hologramToolResult(ok);
  assert.equal(r.is_error, false);
  assert.match(r.content, /"Widget" with 2 labeled parts/);
  assert.match(r.content, /1 problem/);
  const bad = hologramToolResult(normalizeHologramSpec({ title: 'x' }));
  assert.equal(bad.is_error, true);
  assert.match(bad.content, /call show_hologram again/);
  assert.equal(hologramSummary(ok.spec), 'Hologram · Widget · 2 parts');
});

// ---------------------------------------------------------------------------------------------
// Phase B additions: re-checking a live spec, library sentences, the frozen tool, bounds.

test('stable: false re-normalizes a live (already normalized) spec without cutting it again', () => {
  const raw = JSON.stringify(JSON.parse(sample('alternator')));
  for (const n of [Math.floor(raw.length * 0.3), Math.floor(raw.length * 0.7), raw.length]) {
    const live = normalizeHologramSpec(parsePartialJson(raw.slice(0, n)), { partial: true }).spec;
    const again = normalizeHologramSpec(live, { partial: true, stable: false });
    assert.equal(again.ok, true);
    assert.deepEqual(again.spec.parts.map((p) => [p.key, p.id, p.shapes.length]), live.parts.map((p) => [p.key, p.id, p.shapes.length]));
    // the default (stable) cut would drop the last shape of a finished last part
    const cut = normalizeHologramSpec(live, { partial: true });
    const last = live.parts.at(-1);
    if (last && !last.streaming && last.shapes.length) assert.equal(cut.spec.parts.at(-1).shapes.length, last.shapes.length - 1);
  }
});

test('tool result: library sentence when saved, a plain note when not, the original text without opts', () => {
  const ok = normalizeHologramSpec({ title: 'Widget', parts: [part(0)] });
  assert.match(hologramToolResult(ok, { libraryId: 'lib_ab12cd34ef' }).content, /Saved to the owner's library as lib_ab12cd34ef \(reopen it later with open_saved\)\./);
  assert.match(hologramToolResult(ok, { libraryId: null }).content, /could not be saved to the owner's library/);
  assert.match(hologramToolResult(ok, { libraryId: 'lib_<script>' }).content, /could not be saved/);
  assert.doesNotMatch(hologramToolResult(ok).content, /library/);
  const bad = hologramToolResult(normalizeHologramSpec({ title: 'x' }), { libraryId: 'lib_ab12cd34ef' });
  assert.equal(bad.is_error, true);
  assert.doesNotMatch(bad.content, /lib_/);
});

test('the tool definition is deeply frozen; showHologramTool() is an equal, mutable copy', async () => {
  const { showHologramTool } = await import('../../src/lib/hologram-spec.js');
  assert.ok(Object.isFrozen(SHOW_HOLOGRAM_TOOL));
  assert.ok(Object.isFrozen(SHOW_HOLOGRAM_TOOL.input_schema.properties.parts.items.properties.shapes.items));
  assert.throws(() => {
    'use strict';
    SHOW_HOLOGRAM_TOOL.input_schema.properties.title.description = 'changed';
  }, TypeError);
  const copy = showHologramTool();
  assert.deepEqual(copy, JSON.parse(JSON.stringify(SHOW_HOLOGRAM_TOOL)));
  copy.description = 'mine';
  assert.notEqual(showHologramTool().description, 'mine');
});

test('partBounds / specBounds follow the renderer placement (axis, rot, at, repeat)', async () => {
  const { partBounds, specBounds } = await import('../../src/lib/hologram-spec.js');
  const near = (a, b, eps = 0.05) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
  const P = (shapes) => ({ shapes: shapes.map((s) => normalizeShape(s).shape) });
  // a cylinder along x: its height runs along x
  assert.ok(near(partBounds(P([{ type: 'cylinder', axis: 'x', r: 10, h: 100, at: [50, 0, 0] }])).size, [100, 20, 20]));
  // rot [0, 0, 90] turns a tall box onto its side
  assert.ok(near(partBounds(P([{ type: 'box', size: [10, 100, 20], rot: [0, 0, 90] }])).size, [100, 10, 20]));
  // an extrude along y takes its outline as [x, z]
  assert.ok(near(partBounds(P([{ type: 'extrude', axis: 'y', outline: [[0, 0], [40, 0], [40, 30]], depth: 6 }])).size, [40, 6, 30]));
  // eight bolts around y on a 50 mm circle
  const ring = partBounds(P([{ type: 'cylinder', r: 2, h: 10, at: [50, 0, 0], repeat: { count: 8, around: 'y' } }]));
  assert.ok(near(ring.min, [-52, -5, -52], 0.5) && near(ring.max, [52, 5, 52], 0.5), JSON.stringify(ring));
  // linear copies
  assert.ok(near(partBounds(P([{ type: 'sphere', r: 1, repeat: { count: 3, along: [10, 0, 0] } }])).size, [22, 2, 2]));
  // tubes pad their path by the radius; lines do not
  assert.ok(near(partBounds(P([{ type: 'tube', path: [[0, 0, 0], [100, 0, 0]], r: 5 }])).size, [110, 10, 10]));
  assert.ok(near(partBounds(P([{ type: 'line', path: [[0, 0, 0], [0, 30, 40]] }])).size, [0, 30, 40]));
  assert.equal(partBounds({ shapes: [] }), null);
  assert.equal(partBounds(null), null);
  // the AA cell is about 14.2 mm across and 50.3 mm tall
  const aa = normalizeHologramSpec(JSON.parse(sample('battery'))).spec;
  const size = specBounds(aa).size;
  assert.ok(Math.abs(size[0] - 14.2) < 0.5 && Math.abs(size[1] - 50.3) < 0.5, JSON.stringify(size));
  assert.equal(specBounds({ parts: [] }), null);
});
