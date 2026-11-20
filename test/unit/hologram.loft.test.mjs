import { test } from 'node:test';
import assert from 'node:assert/strict';
// Smooth shapes of format v2 (ported from prototype A, holo-real-a): the loft shape, box.round,
// lathe.smooth and tube.r2 in the validator (src/lib/hologram-spec.js) and the geometry
// (src/ui/hologram/smooth.js, geometry.js), with the detail budget that keeps a spec at every limit
// drawable on a phone.
import { normalizeShape, normalizeHologramSpec, partBounds, specBounds, SHOW_HOLOGRAM_TOOL, SHOW_HOLOGRAM_TOOL_V2, showHologramToolV2, SHAPE_TYPES, stablePrefix } from '../../src/lib/hologram-spec.js';
import { buildShapeChunk, detailFor, TRIANGLE_BUDGET } from '../../src/ui/hologram/geometry.js';
import { pchipSlopes, sectionRing, smoothPolyline, triangulate, exponentOf, RING_WEIGHT } from '../../src/ui/hologram/smooth.js';
import { quantizeScale } from '../../src/ui/hologram/hull-service.js';

function extent(arr) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], arr[i + k]);
    max[k] = Math.max(max[k], arr[i + k]);
  }
  return { min, max, size: max.map((v, k) => v - min[k]) };
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const shape = (raw) => {
  const res = normalizeShape(raw);
  assert.ok(res.shape, JSON.stringify(res));
  return res;
};

export const BODY = {
  type: 'loft',
  axis: 'x',
  arches: [[1412, 334, 372], [-1412, 334, 372]],
  sections: [
    { x: 2390, y: [290, 650], w: 1360, round: 0.55 },
    { x: 2200, y: [185, 795], w: 1790, round: 0.3, top: 1660 },
    { x: 1412, y: [175, 905], w: 1840, round: 0.3, top: 1720 },
    { x: 0, y: [160, 995], w: 1840, round: 0.3, top: 1720 },
    { x: -1412, y: [170, 1010], w: 1840, round: 0.3, top: 1720 },
    { x: -2497, y: [420, 985], w: 1440, round: 0.55 },
  ],
};

// ---------------------------------------------------------------------------------------------
// Validator

test('loft: sections keep axis-named keys; [min, max] ranges become center and size', () => {
  const { shape: s, notes } = shape(BODY);
  assert.deepEqual(notes, []);
  assert.equal(s.axis, 'x');
  // written front to back: reversed to run from the lowest station
  assert.deepEqual(s.sections.map((sec) => sec.x), [-2497, -1412, 0, 1412, 2200, 2390]);
  assert.deepEqual(s.sections[2], { x: 0, y: 577.5, w: 1840, h: 835, top: 1720, round: 0.3 });
  assert.deepEqual(s.arches, [[1412, 334, 372], [-1412, 334, 372]]);
  // a normalized loft validates again unchanged (saved holograms are re-validated on load)
  const again = normalizeShape(s);
  assert.deepEqual(again.shape, s);
  assert.deepEqual(again.notes, []);
});

test('loft: axis y and z sections, d, r, twist, pts, z/x ranges', () => {
  const blade = shape({ type: 'loft', axis: 'y', sections: [{ y: 250, x: -60, w: 250, h: 34, twist: 25 }, { y: 772, x: -45, w: 340, h: 8, twist: 60 }] }).shape;
  assert.deepEqual(blade.sections[0], { y: 250, x: -60, w: 250, h: 34, twist: 25 });
  const lamp = shape({ type: 'loft', axis: 'z', sections: [{ z: 380, x: [2275, 2395], y: 690, h: 60 }, { z: 820, x: 2150, y: 725, d: 80 }] }).shape;
  assert.deepEqual(lamp.sections[0], { z: 380, x: 2335, y: 690, w: 120, h: 60 });
  assert.deepEqual(lamp.sections[1], { z: 820, x: 2150, y: 725, w: 80, h: 80 });
  const round = shape({ type: 'loft', sections: [{ x: 0, r: 5 }, { x: 10, pts: [[0, 0], [4, 0], [2, 3]] }] }).shape;
  assert.equal(round.axis, 'x');
  assert.deepEqual(round.sections[0], { x: 0, w: 10, h: 10 });
  assert.deepEqual(round.sections[1].pts, [[0, 0], [4, 0], [2, 3]]);
});

test('loft: cap follows the order the sections were written in; bad values are notes, not errors', () => {
  const front = shape({ type: 'loft', cap: 'start', sections: [{ x: 10, d: 2 }, { x: 0, d: 2 }] }).shape;
  assert.equal(front.cap, 'end', 'written high to low: the first written is the last after sorting');
  assert.equal(shape({ type: 'loft', cap: 'start', sections: [{ x: 0, d: 2 }, { x: 10, d: 2 }] }).shape.cap, 'start');
  assert.equal(shape({ type: 'loft', cap: false, sections: [{ x: 0, d: 2 }, { x: 10, d: 2 }] }).shape.cap, 'none');
  assert.equal(shape({ type: 'loft', cap: true, sections: [{ x: 0, d: 2 }, { x: 10, d: 2 }] }).shape.cap, undefined);
  const { shape: s, notes } = normalizeShape({
    type: 'loft',
    axis: 'q',
    cap: 'sometimes',
    arches: [[1, 2]],
    sections: [{ x: 0, d: 2, round: 3, top: 100, twist: 'a lot' }, { x: 5, d: 2 }, { x: 2, d: 2 }, { x: 5, d: 3 }, { x: 'far', d: 2 }, { x: 9 }],
  });
  assert.ok(s);
  assert.equal(s.axis, 'x');
  assert.deepEqual(s.sections.map((sec) => sec.x), [0, 2, 5]);
  const text = notes.join(' | ');
  for (const bit of ['axis "q"', 'cap ignored', 'arches ignored', 'round ignored', 'top ignored', 'twist ignored', 'sections sorted', 'repeats a position', 'sections[4] dropped', 'sections[5] dropped']) {
    assert.ok(text.includes(bit), `${bit} in ${text}`);
  }
});

test('loft: errors when it cannot be drawn', () => {
  assert.match(normalizeShape({ type: 'loft', sections: [{ x: 0, d: 1 }] }).error, /2 or more/);
  assert.match(normalizeShape({ type: 'loft' }).error, /sections/);
  assert.match(normalizeShape({ type: 'loft', sections: [{ x: 0, d: 1 }, { y: 4, d: 1 }] }).error, /at least 2 valid/);
  assert.match(normalizeShape({ type: 'loft', sections: [{ x: 0, d: 1 }, { x: 0, d: 2 }] }).error, /different x/);
  assert.match(normalizeShape({ type: 'loft', sections: [{ x: 0, w: 1 }, { x: 1, w: 1 }] }).error, /valid sections/);
  // too many sections: cut, with a note
  const many = normalizeShape({ type: 'loft', sections: Array.from({ length: 40 }, (_, i) => ({ x: i, d: 1 })) });
  assert.equal(many.shape.sections.length, 32);
  assert.ok(many.notes.some((n) => n.includes('cut to 32')));
});

test('type aliases: "sections" is a loft; "hull" is a hull (not a loft) and "skin" is no type at all', () => {
  assert.equal(shape({ type: 'sections', sections: [{ x: 0, d: 1 }, { x: 1, d: 1 }] }).shape.type, 'loft');
  // a hull needs its views: the loft-style input is not quietly lofted
  assert.match(normalizeShape({ type: 'hull', sections: [{ x: 0, d: 1 }, { x: 1, d: 1 }] }).error, /hull needs at least two of side/);
  assert.equal(normalizeShape({ type: 'skin', sections: [{ x: 0, d: 1 }, { x: 1, d: 1 }] }).error, 'unknown type "skin"');
});

test('box.round, soft-box aliases, tube.r2, lathe.smooth', () => {
  assert.deepEqual(shape({ type: 'box', size: [1, 2, 3], round: 0.4 }).shape, { type: 'box', at: [0, 0, 0], size: [1, 2, 3], round: 0.4 });
  assert.equal(shape({ type: 'superellipsoid', size: [1, 2, 3] }).shape.round, 0.5);
  assert.equal(shape({ type: 'pod', size: [1, 2, 3], round: 0.8 }).shape.round, 0.8);
  const both = shape({ type: 'box', size: [1, 2, 3], round: 0.4, r: 0.2 });
  assert.equal(both.shape.r, undefined);
  assert.ok(both.notes[0].includes('r ignored'));
  assert.ok(shape({ type: 'box', size: [1, 2, 3], round: 2 }).notes[0].includes('round ignored'));
  assert.equal(shape({ type: 'tube', path: [[0, 0, 0], [1, 0, 0]], r: 2, r2: 1 }).shape.r2, 1);
  assert.equal(shape({ type: 'tube', path: [[0, 0, 0], [1, 0, 0]], r: 2, r2: 2 }).shape.r2, undefined);
  assert.equal(shape({ type: 'sweep', path: [[0, 0, 0], [1, 0, 0]], r: 2 }).shape.type, 'tube');
  assert.equal(shape({ type: 'lathe', profile: [[1, 0], [2, 1]], smooth: true }).shape.smooth, true);
  assert.equal(shape({ type: 'lathe', profile: [[1, 0], [2, 1]], smooth: 'yes' }).shape.smooth, undefined);
});

test('bounds of a loft follow its sections (used for blueprint sizes)', () => {
  const b = partBounds({ shapes: [shape(BODY).shape] });
  assert.deepEqual(b.min, [-2497, 160, -920]);
  assert.deepEqual(b.max, [2390, 1010, 920]);
});

test('the V1 tool is unchanged (frozen into conversations); V2 adds loft and its fields', () => {
  const t1 = SHOW_HOLOGRAM_TOOL.input_schema.properties.parts.items.properties.shapes.items.properties;
  assert.ok(!t1.type.enum.includes('loft'));
  assert.equal(t1.sections, undefined);
  assert.ok(SHAPE_TYPES.includes('loft'));
  const t2 = SHOW_HOLOGRAM_TOOL_V2.input_schema.properties.parts.items.properties.shapes.items.properties;
  assert.ok(t2.type.enum.includes('loft'));
  for (const key of ['sections', 'cap', 'arches', 'round', 'smooth', 'r2']) assert.ok(t2[key], key);
  assert.ok(Object.isFrozen(t2.sections.items.properties.x));
  assert.equal(SHOW_HOLOGRAM_TOOL_V2.name, 'show_hologram');
  assert.equal(SHOW_HOLOGRAM_TOOL_V2.eager_input_streaming, true);
  const copy = showHologramToolV2();
  copy.name = 'x';
  assert.equal(SHOW_HOLOGRAM_TOOL_V2.name, 'show_hologram');
});

test('streaming: a loft is drawn only once its sections are complete', () => {
  const draft = { title: 'Car', parts: [{ id: 'body', name: 'Body', info: 'x', shapes: [{ type: 'loft', sections: [{ x: 0, d: 1 }, { x: 5, d: 1 }] }, { type: 'loft', sections: [{ x: 0, d: 1 }] }] }] };
  const stable = stablePrefix(draft);
  assert.equal(stable.parts[0].shapes.length, 1, 'the last shape (still being written) is held back');
  const res = normalizeHologramSpec(draft, { partial: true });
  assert.equal(res.spec.parts[0].shapes.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Geometry

test('pchip never overshoots between sections; smooth curves pass through their points', () => {
  const xs = [0, 1, 2, 3, 4];
  const ys = [0, 10, 10.5, 2, 0];
  const d = pchipSlopes(xs, ys);
  for (const v of d) assert.ok(Number.isFinite(v));
  // a flat-topped bump stays within its values: slopes at the local max are 0 or shape-preserving
  assert.equal(Math.sign(d[1]) >= 0, true);
  const { points, corners, given } = smoothPolyline([[0, 0], [10, 1], [12, 6], [10, 11], [0, 12], [0, 20], [5, 20]], 8);
  for (const i of given) assert.ok(points[i]);
  assert.deepEqual(points[0], [0, 0]);
  assert.deepEqual(points[points.length - 1], [5, 20]);
  // the 90° turns at [0, 20] stay corners
  assert.ok(corners.some((i) => points[i][0] === 0 && points[i][1] === 20));
  assert.ok(points.length > 7);
});

test('section rings: superellipse extents, top narrows the upper half, twist turns it', () => {
  const N = 40;
  const ring = sectionRing({ w: 100, h: 50, round: 1, c: [10, 20] }, N);
  const us = [];
  const vs = [];
  for (let k = 0; k < N; k++) {
    us.push(ring[2 * k]);
    vs.push(ring[2 * k + 1]);
  }
  assert.ok(near(Math.min(...us), -40, 1e-6) && near(Math.max(...us), 60, 1e-6));
  assert.ok(near(Math.min(...vs), -5, 1e-6) && near(Math.max(...vs), 45, 1e-6));
  assert.ok(near(ring[0], 10, 1e-9) && near(ring[1], -5, 1e-9), 'starts at the bottom center');
  const tapered = sectionRing({ w: 100, h: 100, round: 0.2, top: 50 }, N);
  const upper = [];
  for (let k = 0; k < N; k++) if (tapered[2 * k + 1] > 45) upper.push(Math.abs(tapered[2 * k]));
  assert.ok(Math.max(...upper) < 30, 'the top is about half as wide');
  const twisted = sectionRing({ w: 100, h: 2, round: 1, twist: 90 }, N);
  const tu = [];
  for (let k = 0; k < N; k++) tu.push(twisted[2 * k]);
  assert.ok(Math.max(...tu) < 1.5, 'a flat blade turned by 90° stands up');
  assert.equal(exponentOf(1), 2);
  assert.equal(exponentOf(0.5), 4);
  assert.equal(exponentOf(0), 40);
});

test('triangulate: convex and concave outlines', () => {
  assert.equal(triangulate([[0, 0], [1, 0], [1, 1], [0, 1]]).length, 2);
  const c = triangulate([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]]);
  assert.equal(c.length, 3);
});

test('loft geometry: finite, never bulging past its sections, wheel arches cleared, caps optional', () => {
  const s = shape(BODY).shape;
  const c = buildShapeChunk(s);
  assert.ok(c.vertexCount > 0 && c.indices.length % 3 === 0);
  for (const v of c.positions) assert.ok(Number.isFinite(v));
  for (const v of c.normals) assert.ok(Number.isFinite(v));
  for (const i of c.indices) assert.ok(i < c.vertexCount);
  assert.ok(c.lineVertexCount > 0 && c.lineVertexCount % 2 === 0);
  const e = extent(c.positions);
  // never wider than the widest section, never outside the first and last station
  assert.ok(e.max[2] <= 920 + 1e-3 && e.min[2] >= -920 - 1e-3, `z ${e.min[2]}..${e.max[2]}`);
  assert.ok(near(e.min[0], -2497, 1e-3) && near(e.max[0], 2390, 1e-3));
  assert.ok(e.max[1] <= 1010 + 1e-3);
  // nothing of the body inside the front wheel's arch circle
  for (let i = 0; i < c.positions.length; i += 3) {
    const [x, y] = [c.positions[i], c.positions[i + 1]];
    if (Math.abs(x - 1412) < 360 && y < 334) continue; // below the wheel center: the arch is open there
    assert.ok(Math.hypot(x - 1412, y - 334) >= 372 - 1, `vertex in the arch at ${x}, ${y}`);
  }
  const open = buildShapeChunk({ ...s, cap: 'none' });
  assert.ok(open.indices.length < c.indices.length);
  const half = buildShapeChunk({ ...s, cap: 'start' });
  assert.ok(open.indices.length < half.indices.length && half.indices.length < c.indices.length);
});

test('loft lines: contour rings are faint (aW 0.55), shoulder and crease lines full strength', () => {
  const c = buildShapeChunk(shape(BODY).shape);
  assert.equal(RING_WEIGHT, 0.55);
  assert.equal(c.lineWeights.length, c.lineVertexCount);
  const rings = c.lineWeights.filter((w) => Math.abs(w - RING_WEIGHT) < 1e-6).length; // (stored as float32)
  const strong = c.lineWeights.filter((w) => w === 1).length;
  assert.equal(rings + strong, c.lineVertexCount);
  assert.ok(rings > 0 && strong > 0, `${rings} ring and ${strong} shoulder/crease line vertices`);
  // repeated: the weights repeat with every copy
  const blades = buildShapeChunk(shape({ type: 'loft', axis: 'y', sections: [{ y: 0, w: 50, h: 5 }, { y: 200, w: 60, h: 3 }], repeat: { count: 3, around: 'x' } }).shape);
  assert.equal(blades.lineWeights.length, blades.lineVertexCount);
  // shapes without weights have none (the merge fills 1)
  assert.equal(buildShapeChunk(shape({ type: 'box', size: [1, 1, 1] }).shape).lineWeights, undefined);
});

test('superellipsoid, smooth lathe and tapered tube keep their sizes', () => {
  const box = buildShapeChunk(shape({ type: 'box', size: [10, 20, 30], round: 0.4, at: [100, 0, 0] }).shape);
  const eb = extent(box.positions);
  assert.ok(eb.size.every((v, k) => near(v, [10, 20, 30][k], 1e-3)));
  assert.ok(box.lineVertexCount > 0);
  for (const v of box.normals) assert.ok(Number.isFinite(v));
  const lathe = buildShapeChunk(shape({ type: 'lathe', smooth: true, profile: [[0, 0], [5, 0], [6, 3], [5, 8], [2, 12]] }).shape);
  const el = extent(lathe.positions);
  assert.ok(near(el.size[1], 12, 1e-3) && el.size[0] >= 12 - 1e-3 && el.size[0] <= 13);
  const tube = buildShapeChunk(shape({ type: 'tube', r: 4, r2: 1, path: [[0, 0, 0], [100, 0, 0]] }).shape);
  const pos = tube.positions;
  let startR = 0;
  let endR = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const r = Math.hypot(pos[i + 1], pos[i + 2]);
    if (pos[i] < 1) startR = Math.max(startR, r);
    if (pos[i] > 99) endR = Math.max(endR, r);
  }
  assert.ok(near(startR, 4, 0.05) && near(endR, 1, 0.05), `${startR} -> ${endR}`);
});

test('detail: big repeats and heavy holograms build coarser; crowded copies get two strokes each', () => {
  const one = buildShapeChunk(shape(BODY).shape);
  const l1 = buildShapeChunk(shape(BODY).shape, { level: 1 });
  const l2 = buildShapeChunk(shape(BODY).shape, { level: 2 });
  assert.ok(l1.indices.length < one.indices.length * 0.6 && l2.indices.length < l1.indices.length * 0.6);
  const blade = { type: 'loft', axis: 'y', sections: [{ y: 250, w: 250, h: 34, twist: 25 }, { y: 772, w: 340, h: 8, twist: 60 }] };
  const single = buildShapeChunk(shape(blade).shape);
  const fan = buildShapeChunk(shape({ ...blade, repeat: { count: 24, around: 'x' } }).shape);
  assert.ok(fan.indices.length / 24 < single.indices.length / 2, 'a fan of 24 blades is built coarser per blade');
  const vanes = buildShapeChunk(shape({ type: 'box', size: [30, 100, 5], repeat: { count: 40, around: 'x' } }).shape);
  assert.equal(vanes.lineVertexCount, 40 * 4, 'two strokes per vane, not twelve edges');
});

test('the detail budget: levels by triangles built and by size in the model; hulls coarse-only past 600k', () => {
  const body = shape(BODY).shape;
  assert.deepEqual(TRIANGLE_BUDGET, [300000, 600000]);
  assert.deepEqual(detailFor(body, 0, 5793), { level: 0, hullMode: null });
  assert.deepEqual(detailFor(body, 300000, 5793), { level: 1, hullMode: null });
  assert.deepEqual(detailFor(body, 600000, 5793), { level: 2, hullMode: 'coarse' });
  // small details: under 12% of the model's size level 1, under 4% level 2
  const bolt = shape({ type: 'cylinder', r: 10, h: 40 }).shape;
  const lamp = shape({ type: 'box', size: [300, 200, 200], round: 0.5 }).shape;
  assert.equal(detailFor(bolt, 0, 5793).level, 2);
  assert.equal(detailFor(lamp, 0, 5793).level, 1);
  // hulls and panels are never judged by size (their detail follows the model's scale)
  const hull = { type: 'hull', side: [[0, 0], [10, 0], [10, 10]], top: [[0, 0], [10, 0], [10, 5]] };
  assert.deepEqual(detailFor(hull, 0, 5793), { level: 0, hullMode: null });
  assert.equal(detailFor(hull, 700000, 5793).hullMode, 'coarse');
});

test('a spec at every limit (400 lofts of 32 sections) stays under a million triangles', () => {
  const loft = (p, k) => ({ type: 'loft', axis: 'x', arches: [[p * 100 + 50, 300, 200]], sections: Array.from({ length: 32 }, (_, i) => ({ x: p * 100 + i * 10, y: [100 + k * 50, 900 + k * 50 + (i % 3) * 20], w: 800 + (i % 5) * 40, round: 0.3 + (i % 4) * 0.1, top: 600, twist: i % 7 })) });
  const spec = { title: 'Stress', parts: Array.from({ length: 80 }, (_, p) => ({ id: `p${p}`, name: `Part ${p}`, info: 'x', shapes: Array.from({ length: 5 }, (_, k) => loft(p, k)) })) };
  const res = normalizeHologramSpec(spec);
  assert.equal(res.stats.shapes, 400);
  assert.deepEqual(res.warnings, []);
  const scale = quantizeScale(Math.hypot(...specBounds(res.spec).size));
  let built = 0;
  for (const p of res.spec.parts) for (const s of p.shapes) built += buildShapeChunk(s, detailFor(s, built, scale)).indices.length / 3;
  assert.ok(built < 1000000, `${built} triangles`);
  assert.ok(built > TRIANGLE_BUDGET[1], 'it does reach the second budget step');
});
