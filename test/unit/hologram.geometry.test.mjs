import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Hologram geometry (src/ui/hologram/geometry.js): every shape type builds finite triangles and
// edge lines with the right extents; the samples build in full.
import { buildShapeChunk, mergeChunks } from '../../src/ui/hologram/geometry.js';
import { normalizeHologramSpec, normalizeShape } from '../../src/lib/hologram-spec.js';

const shape = (raw) => {
  const res = normalizeShape(raw);
  assert.ok(res.shape, JSON.stringify(res));
  return res.shape;
};

function extent(arr) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], arr[i + k]);
    max[k] = Math.max(max[k], arr[i + k]);
  }
  return max.map((v, k) => v - min[k]);
}

const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

test('every shape type builds finite triangles and edge lines', () => {
  const all = [
    { type: 'box', size: [10, 20, 30] },
    { type: 'box', size: [10, 20, 30], r: 2 },
    { type: 'cylinder', r: 5, h: 10 },
    { type: 'cylinder', r: 5, r2: 2, h: 10, hole: 1 },
    { type: 'cylinder', r: 5, h: 2, sides: 6 },
    { type: 'cone', r: 4, h: 8 },
    { type: 'sphere', r: 3 },
    { type: 'sphere', size: [2, 4, 6] },
    { type: 'torus', r: 10, tube: 2 },
    { type: 'torus', r: 10, tube: 2, arc: 90 },
    { type: 'capsule', r: 2, h: 10 },
    { type: 'lathe', profile: [[0, 0], [5, 0], [5, 10], [2, 12]] },
    { type: 'extrude', outline: [[0, 0], [10, 0], [10, 5], [0, 5]], depth: 4 },
    { type: 'extrude', outline: [[0, 0], [10, 0], [10, 5], [0, 5]], depth: 4, bevel: 1 },
    { type: 'tube', path: [[0, 0, 0], [10, 5, 0], [20, 0, 5]], r: 1 },
  ];
  for (const raw of all) {
    const c = buildShapeChunk(shape(raw));
    assert.ok(c.vertexCount > 0, raw.type);
    assert.ok(c.indices.length > 0 && c.indices.length % 3 === 0);
    assert.ok(c.lineVertexCount > 0 && c.lineVertexCount % 2 === 0, `${raw.type} has edge lines`);
    for (const v of c.positions) assert.ok(Number.isFinite(v));
    for (const v of c.normals) assert.ok(Number.isFinite(v));
    for (const i of c.indices) assert.ok(i < c.vertexCount);
  }
  const line = buildShapeChunk(shape({ type: 'line', path: [[0, 0, 0], [1, 1, 1], [2, 0, 0]] }));
  assert.equal(line.vertexCount, 0);
  assert.equal(line.lineVertexCount, 4);
});

test('sizes and axes land where the spec says', () => {
  const box = buildShapeChunk(shape({ type: 'box', size: [10, 20, 30], at: [100, 0, 0] }));
  assert.deepEqual(extent(box.positions).map(Math.round), [10, 20, 30]);
  const cylY = buildShapeChunk(shape({ type: 'cylinder', r: 5, h: 40 }));
  const ey = extent(cylY.positions);
  assert.ok(near(ey[1], 40) && near(ey[0], 10, 0.1));
  const cylX = buildShapeChunk(shape({ type: 'cylinder', axis: 'x', r: 5, h: 40 }));
  assert.ok(near(extent(cylX.positions)[0], 40));
  const cylZ = buildShapeChunk(shape({ type: 'cylinder', axis: 'z', r: 5, h: 40 }));
  assert.ok(near(extent(cylZ.positions)[2], 40));
  // cone apex points along +axis; flipped with -axis
  const cone = buildShapeChunk(shape({ type: 'cone', axis: 'x', r: 5, h: 20 }));
  const coneFlip = buildShapeChunk(shape({ type: 'cone', axis: '-x', r: 5, h: 20 }));
  const maxX = (c) => Math.max(...Array.from(c.positions).filter((_, i) => i % 3 === 0));
  assert.ok(near(maxX(cone), 10) && near(maxX(coneFlip), 10));
  // torus lies in the plane perpendicular to its axis (default y)
  const torus = buildShapeChunk(shape({ type: 'torus', r: 10, tube: 1 }));
  const et = extent(torus.positions);
  assert.ok(near(et[0], 22) && near(et[1], 2) && near(et[2], 22));
  // extrude outline planes: z -> [x, y], y -> [x, z], x -> [z, y]
  const tri = [[0, 0], [10, 0], [0, 20]];
  assert.deepEqual(extent(buildShapeChunk(shape({ type: 'extrude', outline: tri, depth: 4 })).positions).map(Math.round), [10, 20, 4]);
  assert.deepEqual(extent(buildShapeChunk(shape({ type: 'extrude', axis: 'y', outline: tri, depth: 4 })).positions).map(Math.round), [10, 4, 20]);
  assert.deepEqual(extent(buildShapeChunk(shape({ type: 'extrude', axis: 'x', outline: tri, depth: 4 })).positions).map(Math.round), [4, 20, 10]);
  // bevelled extrusions keep their overall size
  assert.deepEqual(extent(buildShapeChunk(shape({ type: 'extrude', outline: [[0, 0], [100, 0], [100, 50], [0, 50]], depth: 40, bevel: 10 })).positions).map(Math.round), [100, 50, 40]);
  // capsule h is the total length
  assert.ok(near(extent(buildShapeChunk(shape({ type: 'capsule', r: 2, h: 10 })).positions)[1], 10));
});

test('repeat: rotated copies around an axis line, offset copies along a vector', () => {
  const one = buildShapeChunk(shape({ type: 'box', size: [2, 2, 2], at: [0, 10, 0] }));
  const ring = buildShapeChunk(shape({ type: 'box', size: [2, 2, 2], at: [0, 10, 0], repeat: { count: 4, around: 'x' } }));
  assert.equal(ring.vertexCount, one.vertexCount * 4);
  const e = extent(ring.positions);
  assert.ok(near(e[1], 22) && near(e[2], 22) && near(e[0], 2));
  const centered = buildShapeChunk(shape({ type: 'box', size: [2, 2, 2], at: [100, 10, 0], repeat: { count: 2, around: 'x', center: [100, 0, 0] } }));
  const xs = Array.from(centered.positions).filter((_, i) => i % 3 === 0);
  assert.ok(near(Math.min(...xs), 99) && near(Math.max(...xs), 101));
  const row = buildShapeChunk(shape({ type: 'box', size: [1, 1, 1], repeat: { count: 5, along: [0, 0, 3] } }));
  assert.ok(near(extent(row.positions)[2], 13));
});

test('merge: one geometry per part with arrival times and sweep heights, plus fitting support points', () => {
  const a = buildShapeChunk(shape({ type: 'box', size: [1, 1, 1] }));
  const b = buildShapeChunk(shape({ type: 'cylinder', r: 1, h: 4, at: [5, 0, 0] }));
  const merged = mergeChunks([a, b], [1.5, 2.5]);
  const born = merged.fill.getAttribute('aBorn').array;
  assert.equal(born[0], 1.5);
  assert.equal(born[born.length - 1], 2.5);
  const hAttr = merged.fill.getAttribute('aH').array;
  assert.ok(Math.min(...hAttr) >= 0 && Math.max(...hAttr) <= 1);
  assert.equal(merged.fill.getIndex().count, a.indices.length + b.indices.length);
  assert.equal(merged.lines.getAttribute('position').count, a.lineVertexCount + b.lineVertexCount);
  assert.deepEqual(merged.box.min, [-1, -2, -1].map((v, k) => (k === 0 ? -0.5 : v)));
  assert.equal(merged.support.length, 26 * 3);
  merged.fill.dispose();
  merged.lines.dispose();
  const empty = mergeChunks([], []);
  assert.equal(empty.fill, null);
  assert.equal(empty.box, null);
});

test('every sample shape builds (and the Camry stays within a phone-friendly budget)', () => {
  for (const name of ['battery', 'alternator', 'camry']) {
    const { spec } = normalizeHologramSpec(JSON.parse(readFileSync(new URL(`../mock/fixtures/${name}.json`, import.meta.url), 'utf8')));
    let tris = 0;
    let lines = 0;
    for (const p of spec.parts) {
      for (const s of p.shapes) {
        const c = buildShapeChunk(s);
        tris += c.indices.length / 3;
        lines += c.lineVertexCount / 2;
      }
    }
    assert.ok(tris < 250000, `${name}: ${tris} triangles`);
    assert.ok(lines < 150000, `${name}: ${lines} line segments`);
  }
});
