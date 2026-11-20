import { test } from 'node:test';
import assert from 'node:assert/strict';
// Hull and panel shapes (format v2, realistic bodies): validation and normalization
// (src/lib/hologram-spec.js) with the integration's rules (r is the edge radius, wheel arches,
// forgiving half outlines, extent auto-fit, the panel coordinate check, the per-hologram caps);
// meshing (src/ui/hologram/hull-mesh.js: visual hull, revolve, cuts, mirror, smoothing, feature
// lines, panels) and the renderer chunk path (geometry.js, synchronous in Node). Ported from
// prototype B (holo-real-b) with r in place of its `round`.
import { normalizeHologramSpec, normalizeShape, partBounds, specBounds, stablePrefix, isHalfOutline, hullBox, HOLOGRAM_LIMITS as L } from '../../src/lib/hologram-spec.js';
import { parsePartialJson } from '../../src/engine/util.js';
import { hullField, hullKey, hullMesh, panelMesh, smoothOutline } from '../../src/ui/hologram/hull-mesh.js';
import { buildShapeChunk } from '../../src/ui/hologram/geometry.js';
import { quantizeScale } from '../../src/ui/hologram/hull-service.js';

// A small symmetric "car": side profile, right-half top and front outlines, one wheel-arch cut.
export const CAR = {
  type: 'hull',
  side: [[2000, 500], [1900, 800], [900, 900], [300, 1400], [-900, 1400], [-1500, 950], [-2000, 900], [-2050, 500], [-1900, 200], [1900, 200]],
  top: [[2000, 0], [1950, 600], [1700, 880], [-1800, 880], [-2050, 600], [-2050, 0]],
  front: [[0, 1400], [600, 1380], [780, 1000], [880, 900], [880, 300], [800, 200], [0, 200]],
  r: 60,
  cut: [{ type: 'cylinder', axis: 'z', at: [1300, 320, 880], r: 360, h: 600 }],
};

const norm = (raw) => {
  const res = normalizeShape(raw);
  assert.ok(res.shape, JSON.stringify(res));
  return res;
};
const part = (id, shapes, extra = {}) => ({ id, name: id, info: 'x', shapes, ...extra });

test('hull: normalized views, half outlines mark it mirrored, cuts normalized like shapes', () => {
  const { shape, notes } = norm(CAR);
  assert.deepEqual(notes, []);
  assert.equal(shape.type, 'hull');
  assert.equal(shape.mirror, true, 'a right-half top/front outline mirrors the hull');
  assert.equal(shape.r, 60);
  assert.equal(shape.round, undefined);
  assert.equal(shape.cut.length, 1);
  assert.equal(shape.cut[0].type, 'cylinder');
  assert.equal(shape.cut[0].axis, 'z');
  // aliases: "silhouette" is a hull, "fillet" is its r (silently)
  assert.equal(norm({ ...CAR, type: 'silhouette' }).shape.type, 'hull');
  const { r, ...noR } = CAR;
  assert.equal(r, 60);
  const fillet = norm({ ...noR, fillet: 25 });
  assert.equal(fillet.shape.r, 25);
  assert.deepEqual(fillet.notes, []);
  // bounds: the overlap of the views, mirrored across z = 0
  const b = partBounds({ shapes: [shape] });
  assert.deepEqual(b.min, [-2050, 200, -880]);
  assert.deepEqual(b.max, [2000, 1400, 880]);
  // a normalized hull validates again unchanged (saved holograms are re-validated)
  const again = normalizeShape(shape);
  assert.deepEqual(again.shape, shape);
  assert.deepEqual(again.notes, []);
});

test('hull: helpful errors and warnings for what Claude gets wrong', () => {
  assert.match(normalizeShape({ type: 'hull', side: CAR.side }).error, /at least two of side/);
  assert.match(normalizeShape({ type: 'hull', side: [[0, 0], [1, 1]], top: CAR.top }).error, /side must be/);
  assert.match(normalizeShape({ type: 'hull', side: [[0, 0], [1, 0], [2, 0]], top: CAR.top }).error, /no area/);
  // views that do not overlap at all: an error naming both extents
  const apart = normalizeShape({ type: 'hull', side: [[0, 0], [100, 0], [100, 100]], top: [[200, 0], [300, 0], [300, 50]] });
  assert.match(apart.error, /do not overlap: side spans x 0…100 but top spans 200…300/);
  // views that disagree a lot on an extent: shown, with a warning naming the extents
  const off = norm({ ...CAR, front: CAR.front.map(([z, y]) => [z, y < 400 ? 700 : y]) });
  assert.ok(off.notes.some((n) => /side spans y 200…1400 but front spans 700…1400: only the overlap is solid/.test(n)), off.notes.join('\n'));
  // only box, cylinder and sphere cut
  const badCut = norm({ ...CAR, cut: [{ type: 'torus', r: 5, tube: 1 }, { type: 'box', size: [100, 100, 100] }] });
  assert.equal(badCut.shape.cut.length, 1);
  assert.ok(badCut.notes.some((n) => /cut\[0\] dropped: only box, cylinder and sphere/.test(n)));
  // a hull is never a cut
  const nested = norm({ ...CAR, cut: [{ ...CAR }] });
  assert.ok(!nested.shape.cut);
  assert.ok(nested.notes.some((n) => /a hull cannot be a cut/.test(n)));
});

test('hull: revolve profiles (a lathe that can be cut) with their axis', () => {
  const { shape, notes } = norm({ type: 'hull', axis: 'x', revolve: [[24, 54], [24, 45], [62, 36], [67, 16], [64, 16], [59, 33], [20, 41], [20, 54]], r: 2.5 });
  assert.deepEqual(notes, []);
  assert.equal(shape.axis, 'x');
  const b = partBounds({ shapes: [shape] });
  assert.deepEqual(b.min, [16, -67, -67]);
  assert.deepEqual(b.max, [54, 67, 67]);
  assert.match(normalizeShape({ type: 'hull', revolve: [[0, 0], [0, 10]] }).error, /radius > 0/);
});

test('hull round: more than 1 is taken as r with a note; 1 or less is ignored with the note', () => {
  const { r, ...noR } = CAR;
  assert.ok(r);
  const big = norm({ ...noR, round: 60 });
  assert.equal(big.shape.r, 60);
  assert.equal(big.shape.round, undefined);
  assert.deepEqual(big.notes, ["round taken as r (60): a hull's edge radius is r; round is the 0–1 softness of boxes and loft sections"]);
  const small = norm({ ...noR, round: 0.5 });
  assert.equal(small.shape.r, undefined, 'the mesher uses its default edge radius');
  assert.equal(small.shape.round, undefined);
  assert.deepEqual(small.notes, ["round ignored (0.5): a hull's edge radius is r; round is the 0–1 softness of boxes and loft sections"]);
  // with r given, round never overrides it
  const both = norm({ ...CAR, round: 80 });
  assert.equal(both.shape.r, 60);
  assert.deepEqual(both.notes, ["round ignored (80): a hull's edge radius is r; round is the 0–1 softness of boxes and loft sections"]);
});

test('hull arches: mirrored z cylinders as deep as max(0.4 × zMax, 0.6 × r) that count towards the 12 cuts', () => {
  const { cut, ...noCut } = CAR;
  assert.ok(cut);
  const { shape, notes } = norm({ ...noCut, arches: [[1300, 320, 360], [-1300, 320, 360]] });
  assert.deepEqual(notes, []);
  // zMax = 880 (the top's half width): depth max(352, 216) = 352 each side of the body's side
  assert.deepEqual(shape.cut, [
    { type: 'cylinder', at: [1300, 320, 880], axis: 'z', r: 360, h: 704 },
    { type: 'cylinder', at: [-1300, 320, 880], axis: 'z', r: 360, h: 704 },
  ]);
  assert.equal(shape.arches, undefined, 'expanded: a normalized hull validates again unchanged');
  assert.deepEqual(normalizeShape(shape).shape, shape);
  // a big wheel on a narrow body: 0.6 × r is deeper
  const narrow = norm({ ...noCut, top: [[2000, 0], [1950, 200], [-2050, 200], [-2050, 0]], front: [[0, 1400], [200, 1400], [200, 200], [0, 200]], arches: [[1300, 320, 400]] });
  assert.equal(narrow.shape.cut[0].h, 480);
  assert.equal(narrow.shape.cut[0].at[2], 200);
  // they count towards the 12 cuts: 11 cuts leave room for one arch
  const many = norm({ ...noCut, cut: Array.from({ length: 11 }, (_, i) => ({ type: 'sphere', r: 20, at: [i * 100, 1000, 0] })), arches: [[1300, 320, 360], [-1300, 320, 360]] });
  assert.equal(many.shape.cut.length, L.cuts);
  assert.deepEqual(many.shape.cut.at(-1).at, [1300, 320, 880]);
  assert.ok(many.notes.some((n) => n === 'only 1 of the arches fit: a hull has at most 12 cuts, wheel arches included'), many.notes.join('\n'));
  // a full (not mirrored) body is cut on both of its sides
  const mirrorTop = (pts) => [...pts, ...pts.slice(1, -1).reverse().map(([x, z]) => [x, -z])];
  const full = norm({ type: 'hull', side: CAR.side, top: mirrorTop(CAR.top), arches: [[1300, 320, 360]] });
  assert.equal(full.shape.mirror, undefined);
  assert.deepEqual(full.shape.cut.map((c) => c.at), [[1300, 320, 880], [1300, 320, -880]]);
  // arches need a z extent: a top or front view
  const sideOnly = norm({ type: 'hull', axis: 'x', side: CAR.side, revolve: [[0, -2050], [700, -1500], [700, 1500], [0, 2000]], arches: [[1300, 320, 360]] });
  assert.ok(!sideOnly.shape.cut);
  assert.ok(sideOnly.notes.includes('arches ignored: needs a top or front view'), sideOnly.notes.join('\n'));
  assert.ok(norm({ ...CAR, arches: [[1, 2]] }).notes.some((n) => n.startsWith('arches ignored (a list of [x, y, r]')));
});

test('forgiving half outlines: a left half is flipped, near-centerline points snap, a full outline is not mirrored', () => {
  assert.equal(isHalfOutline(CAR.top, 1), true);
  // a left half (z ≤ 0): flipped to the right half and mirrored, with a note
  const left = norm({ ...CAR, top: CAR.top.map(([x, z]) => [x, -z]) });
  assert.deepEqual(left.shape.top, CAR.top);
  assert.equal(left.shape.mirror, true);
  assert.deepEqual(left.notes, ['top: taken as a half outline and mirrored']);
  // a right half starting and ending 3% of its width off the centerline: snapped onto it
  const loose = norm({ ...CAR, top: CAR.top.map(([x, z]) => [x, z === 0 ? 26 : z]) });
  assert.deepEqual(loose.shape.top, CAR.top);
  assert.deepEqual(loose.notes, ['top: taken as a half outline and mirrored']);
  // a point within 2% of the centerline between others snaps too; one at 5% stays where it is
  const mid = norm({ ...CAR, top: [[2000, 0], [1950, 600], [1700, 880], [-1800, 880], [-2050, 600], [-2050, 15], [-2040, 0]] });
  assert.deepEqual(mid.shape.top.slice(-2), [[-2050, 0], [-2040, 0]]);
  assert.deepEqual(mid.notes, ['top: taken as a half outline and mirrored']);
  const kept = norm({ ...CAR, front: [[0, 1400], [600, 1380], [780, 1000], [880, 900], [880, 300], [800, 200], [44, 200], [0, 200]] });
  assert.deepEqual(kept.shape.front.at(-2), [44, 200]);
  assert.deepEqual(kept.notes, []);
  // written starting on the side, the outline is turned to close along the centerline
  const turned = norm({ ...CAR, top: [[1950, 600], [1700, 880], [-1800, 880], [-2050, 600], [-2050, 0], [2000, 0]] });
  assert.deepEqual(turned.shape.top, CAR.top);
  assert.equal(turned.shape.mirror, true);
  assert.deepEqual(turned.notes, ['top: taken as a half outline and mirrored']);
  // an exact right half: no note
  assert.deepEqual(norm(CAR).notes, []);
  // a full outline is not a half: not mirrored, z spans both sides as written
  const fullTop = [...CAR.top, ...CAR.top.slice(1, -1).reverse().map(([x, z]) => [x, -z])];
  const fullFront = [...CAR.front, ...CAR.front.slice(1, -1).reverse().map(([z, y]) => [-z, y])];
  const full = norm({ type: 'hull', side: CAR.side, top: fullTop, front: fullFront, r: 60 });
  assert.equal(isHalfOutline(fullTop, 1), false);
  assert.equal(full.shape.mirror, undefined);
  assert.deepEqual(full.shape.top, fullTop);
  assert.deepEqual(full.notes, []);
  assert.deepEqual(hullBox(full.shape).z, [-880, 880]);
  // an off-centre outline (a seat 100…600 from the centerline) is not a half either
  assert.equal(isHalfOutline([[0, 100], [500, 100], [500, 600], [0, 600]], 1), false);
});

test('extent auto-fit: a small disagreement is stretched to the master view, a large one keeps the warning', () => {
  // the top stops 3% short of the side's nose: stretched along x to the side's range
  const short = CAR.top.map(([x, z]) => [x === 2000 ? 1877 : x === 1950 ? 1830 : x, z]);
  const fit = norm({ ...CAR, top: short });
  assert.deepEqual(fit.notes, ['top x stretched to the side\'s -2050…2000 (was -2050…1877)']);
  assert.deepEqual(hullBox(fit.shape).x, [-2050, 2000]);
  assert.equal(fit.shape.top[0][0], 2000);
  // the front 2% wider than the top: z stretched to the top's (both halves stay halves)
  const wide = norm({ ...CAR, front: CAR.front.map(([z, y]) => [z * 1.02, y]) });
  assert.deepEqual(wide.notes, ['front z stretched to the top\'s -880…880 (was -897.6…897.6)']);
  assert.equal(Math.max(...wide.shape.front.map((p) => p[0])), 880);
  assert.equal(wide.shape.front[0][0], 0);
  // 15% short: kept as written, with the warning
  const far = CAR.top.map(([x, z]) => [x === 2000 ? 1385 : x === 1950 ? 1340 : x === 1700 ? 1300 : x, z]);
  const warned = norm({ ...CAR, top: far });
  assert.deepEqual(warned.notes, ['side spans x -2050…2000 but top spans -2050…1385: only the overlap is solid']);
  assert.deepEqual(hullBox(warned.shape).x, [-2050, 1385]);
  // a stretched hull validates again unchanged
  assert.deepEqual(normalizeShape(fit.shape).shape, fit.shape);
  assert.deepEqual(normalizeShape(fit.shape).notes, []);
  // disjoint views are an error
  assert.match(normalizeShape({ ...CAR, top: CAR.top.map(([x, z]) => [x + 5000, z]) }).error, /hull views do not overlap: side spans x -2050…2000 but top spans 2950…7000/);
});

test('panel: lies on an earlier part with a hull; face, mirror, wrap; unknown hosts are dropped with a reason', () => {
  const spec = {
    title: 'Car',
    parts: [
      part('body', [CAR]),
      part('glass', [{ type: 'panel', on: 'body', face: 'sides', outline: [[850, 950], [300, 1350], [-850, 1350], [-1400, 980]] }]),
      part('lights', [{ type: 'panel', on: 'body', view: 'front', mirror: true, outline: [[400, 750], [800, 750], [800, 850], [400, 850]] }]),
      part('early', [{ type: 'panel', on: 'late', face: 'top', outline: [[0, 0], [10, 0], [10, 10]] }]),
      part('late', [CAR]),
    ],
  };
  const r = normalizeHologramSpec(spec);
  assert.ok(r.ok);
  const [body, glass, lights, late] = r.spec.parts;
  assert.equal(body.shapes[0].type, 'hull');
  assert.equal(glass.shapes[0].face, 'sides');
  assert.deepEqual(glass.shapes[0].span, [-880, 880], 'a sides panel spans the hull across');
  assert.equal(lights.shapes[0].face, 'front', '"view" is accepted for the face');
  assert.equal(lights.shapes[0].mirror, true);
  assert.deepEqual(lights.shapes[0].span, [2000, 2000], "a front panel sits on the hull's front");
  assert.equal(late.id, 'late');
  assert.ok(r.warnings.some((w) => /panel on "late": no earlier part with that id has a hull/.test(w)), r.warnings.join('\n'));
  // bounds of a panel: its outline on its face
  const gb = partBounds(glass);
  assert.deepEqual(gb.min, [-1400, 950, -880]);
  assert.deepEqual(gb.max, [850, 1350, 880]);
  assert.match(normalizeShape({ type: 'panel', on: 'body', face: 'diagonal', outline: [[0, 0], [1, 0], [1, 1]] }).error, /face: one of right, left, sides/);
  assert.match(normalizeShape({ type: 'panel', face: 'top', outline: [[0, 0], [1, 0], [1, 1]] }).error, /needs on/);
  // a panel has no at, rot or repeat of its own
  const placed = normalizeShape({ type: 'panel', on: 'body', face: 'top', outline: [[0, 0], [10, 0], [10, 10]], at: [5, 0, 0], rot: [0, 90, 0], repeat: { count: 3, along: [10, 0, 0] } });
  assert.deepEqual(placed.shape.at, [0, 0, 0]);
  assert.equal(placed.shape.rot, undefined);
  assert.equal(placed.shape.repeat, undefined);
  assert.deepEqual(placed.notes, ['at ignored (a panel lies on the hull it names)', 'rot ignored (a panel lies on the hull it names)', 'repeat ignored (a panel lies on its hull)']);
  // a normalized spec validates again unchanged (spans included)
  const again = normalizeHologramSpec(r.spec);
  assert.deepEqual(again.spec.parts.map((p) => p.shapes), r.spec.parts.map((p) => p.shapes));
});

test('panel: an outline mostly outside its hull in the face plane gets a coordinate warning', () => {
  // a headlight written as [x, y] (a side view) on the front face, whose plane is [z, y]
  const r = normalizeHologramSpec({
    title: 'Car',
    parts: [part('body', [CAR]), part('headlights', [{ type: 'panel', on: 'body', face: 'front', mirror: true, outline: [[1700, 650], [1950, 650], [1950, 780], [1700, 780]] }])],
  });
  assert.deepEqual(r.warnings, [
    'parts[1] "headlights" shapes[0] (panel): panel outline lies outside the front view of body (z 1700…1950, y 650…780; the hull spans z -880…880, y 200…1400): check its coordinates.',
  ]);
  assert.equal(r.spec.parts.length, 2, 'kept: the warning tells Claude what to fix');
  // the same lamp in [z, y]: no warning; a sides panel reads "side view"
  const ok = normalizeHologramSpec({ title: 'Car', parts: [part('body', [CAR]), part('headlights', [{ type: 'panel', on: 'body', face: 'front', mirror: true, outline: [[500, 650], [800, 650], [800, 780], [500, 780]] }])] });
  assert.deepEqual(ok.warnings, []);
  const side = normalizeHologramSpec({ title: 'Car', parts: [part('body', [CAR]), part('door', [{ type: 'panel', on: 'body', face: 'sides', outline: [[300, 50], [700, 50], [700, 150], [300, 150]] }])] });
  assert.match(side.warnings[0], /panel outline lies outside the side view of body \(x 300…700, y 50…150; the hull spans x -2050…2000, y 200…1400\): check its coordinates/);
});

test('panel: a host part without a hull drops it ("panels lie on hulls only")', () => {
  const r = normalizeHologramSpec({
    title: 'Plane',
    parts: [
      part('fuselage', [{ type: 'loft', sections: [{ x: 0, d: 1000 }, { x: 5000, d: 800 }] }]),
      part('windows', [{ type: 'panel', on: 'fuselage', face: 'sides', outline: [[1000, 0], [2000, 0], [2000, 200]] }]),
    ],
  });
  assert.equal(r.spec.parts.length, 1);
  assert.deepEqual(r.warnings, ['parts[1] "windows" shapes[0] (panel): dropped: panel on "fuselage": that part has no hull (panels lie on hulls only).', 'parts[1] "windows": dropped: no valid shapes.']);
});

test('caps: the 17th hull and the 41st panel of a hologram are dropped with warnings', () => {
  const box = (i) => ({ type: 'hull', side: [[0, 0], [100, 0], [100, 50], [0, 50]], top: [[0, 0], [100, 0], [100, 40], [0, 40]], at: [i * 200, 0, 0] });
  const hulls = Array.from({ length: L.hulls + 1 }, (_, i) => part(`h${i}`, [box(i)]));
  const panels = Array.from({ length: L.panels + 1 }, (_, i) => part(`p${i}`, [{ type: 'panel', on: 'h0', face: 'top', outline: [[10, 0], [90, 0], [90, 30]] }]));
  const r = normalizeHologramSpec({ title: 'Lots', parts: [...hulls, ...panels] });
  assert.equal(L.hulls, 16);
  assert.equal(L.panels, 40);
  const count = (type) => r.spec.parts.reduce((n, p) => n + p.shapes.filter((s) => s.type === type).length, 0);
  assert.equal(count('hull'), 16);
  assert.equal(count('panel'), 40);
  assert.ok(r.warnings.includes('parts[16] "h16" shapes[0] (hull): dropped: more than 16 hulls in one hologram.'), r.warnings.join('\n'));
  assert.ok(r.warnings.includes('parts[57] "p40" shapes[0] (panel): dropped: more than 40 panels in one hologram.'), r.warnings.join('\n'));
  assert.equal(r.stats.dropped, 4, 'two shapes and their two parts');
});

test('lathe and extrude accept smooth: true; nothing else changes for old shapes', () => {
  assert.equal(norm({ type: 'lathe', profile: [[0, 0], [5, 2], [6, 8], [0, 10]], smooth: true }).shape.smooth, true);
  assert.equal(norm({ type: 'extrude', outline: [[0, 0], [5, 2], [6, 8]], depth: 2, smooth: true }).shape.smooth, true);
  assert.equal(norm({ type: 'lathe', profile: [[0, 0], [5, 2], [6, 8], [0, 10]] }).shape.smooth, undefined);
});

test('streaming: a half-written view never renders; a panel waits until its own object closes', () => {
  const spec = {
    title: 'Car',
    parts: [
      part('body', [CAR]),
      part('glass', [{ type: 'panel', on: 'body', face: 'sides', outline: [[850, 950], [300, 1350], [-850, 1350], [-1400, 980]] }]),
      part('wheel', [{ type: 'lathe', smooth: true, axis: 'z', at: [1300, 320, 800], profile: [[200, -100], [320, -110], [330, 0], [320, 110], [200, 100]] }]),
    ],
  };
  const json = JSON.stringify(spec);
  const final = normalizeHologramSpec(spec).spec;
  let sawHull = -1;
  let sawPanel = -1;
  for (let i = 1; i <= json.length; i++) {
    const draft = parsePartialJson(json.slice(0, i));
    if (!draft) continue;
    const live = normalizeHologramSpec(draft, { partial: true });
    for (const p of live.spec.parts) {
      for (const s of p.shapes) {
        // never a hull with part of a view (or a panel with part of its outline)
        if (s.type === 'hull') {
          assert.deepEqual(s, final.parts[0].shapes[0], `at ${i}`);
          if (sawHull < 0) sawHull = i;
        }
        if (s.type === 'panel') {
          assert.deepEqual(s, final.parts[1].shapes[0], `at ${i}`);
          assert.equal(live.spec.parts[0].shapes.length, 1, 'its host hull is there');
          if (sawPanel < 0) sawPanel = i;
        }
      }
    }
  }
  // each shows once its part is no longer the one being written (the next part has started)
  assert.ok(sawHull > json.indexOf('{"id":"glass"'), `hull at ${sawHull}`);
  assert.ok(sawPanel > json.indexOf('{"id":"wheel"'), `panel at ${sawPanel}`);
  // the stable prefix holds back the last shape of the last part (still being written)
  const cut = stablePrefix({ title: 'Car', parts: [{ id: 'body', shapes: [CAR, { type: 'hull', side: [[0, 0], [1, 0]] }] }] });
  assert.equal(cut.parts[0].shapes.length, 1);
});

// ---------------------------------------------------------------------------------------------
// Meshing

function bounds(arr) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], arr[i + k]);
    hi[k] = Math.max(hi[k], arr[i + k]);
  }
  return { lo, hi };
}

test('hullMesh: a closed, smooth, symmetric solid inside the views, with feature lines and faint rings', () => {
  const { shape } = norm(CAR);
  const m = hullMesh(shape, { level: 'fine' });
  assert.ok(m.triangles > 2000 && m.triangles < 60000, `triangles ${m.triangles}`);
  assert.ok(m.positions.every(Number.isFinite) && m.normals.every(Number.isFinite));
  const { lo, hi } = bounds(m.positions);
  // inside the views (within a cell), and close to them
  assert.ok(lo[0] > -2050 - m.cell && hi[0] < 2000 + m.cell, `x ${lo[0]}…${hi[0]}`);
  assert.ok(lo[1] > 200 - m.cell && hi[1] < 1400 + m.cell, `y ${lo[1]}…${hi[1]}`);
  assert.ok(hi[0] > 2000 - 3 * m.cell && hi[1] > 1400 - 3 * m.cell);
  // symmetric: as wide on the left as on the right
  assert.ok(Math.abs(lo[2] + hi[2]) < m.cell, `z ${lo[2]}…${hi[2]}`);
  // unit normals pointing out of the solid (away from the centre line)
  let outward = 0;
  for (let i = 0; i < m.normals.length; i += 3) {
    const l = Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]);
    assert.ok(Math.abs(l - 1) < 1e-3);
    if (m.normals[i + 2] * m.positions[i + 2] >= 0 || Math.abs(m.positions[i + 2]) < 300) outward++;
  }
  assert.ok(outward / (m.normals.length / 3) > 0.97);
  // closed: every edge is shared by exactly two triangles
  const edges = new Map();
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = m.indices[t + e];
      const b = m.indices[t + ((e + 1) % 3)];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert.ok([...edges.values()].every((n) => n === 2), 'a closed surface');
  // every index valid; feature lines and contour rings come as segment pairs with weights
  const nv = m.positions.length / 3;
  assert.ok(m.indices.every((i) => i < nv));
  assert.equal(m.lines.length % 6, 0);
  assert.equal(m.lineWeights.length, m.lines.length / 3);
  assert.ok(m.lineWeights.some((w) => w === 1) && m.lineWeights.some((w) => w < 1));
  // the arch cut opened the side above the axle: no surface point inside it near the body side
  for (let i = 0; i < m.positions.length; i += 3) {
    const [x, y, z] = [m.positions[i], m.positions[i + 1], m.positions[i + 2]];
    if (Math.abs(z) > 700) assert.ok(Math.hypot(x - 1300, y - 320) > 360 - 2 * m.cell, `point ${x},${y},${z} inside the arch`);
  }
  // terms: which view shapes each vertex (4+ = the cut)
  assert.ok(m.terms.some((t) => t >= 4), 'the arch walls belong to the cut');
});

test('hullMesh: the edge radius is r (clamped to 45% of the smallest extent); arches cut like B\'s cuts', () => {
  const { cut, ...noCut } = CAR;
  assert.ok(cut);
  const sharp = hullField(norm({ ...noCut, r: 0 }).shape);
  const soft = hullField(norm({ ...noCut, r: 120 }).shape);
  const huge = hullField(norm({ ...noCut, r: 5000 }).shape);
  assert.equal(sharp.k, 0);
  assert.equal(soft.k, 120);
  assert.equal(huge.k, 1200 * 0.45, 'clamped to 45% of the smallest extent (the 1200 mm height)');
  const def = hullField(norm(noCut.r ? { ...noCut, r: undefined } : noCut).shape);
  assert.equal(def.k, 1200 * 0.04, 'default: 4% of the smallest extent');
  // a car with arches: the wheel openings are cut on both sides
  const m = hullMesh(norm({ ...noCut, arches: [[1300, 320, 360], [-1300, 320, 360]] }).shape, { level: 'coarse' });
  for (let i = 0; i < m.positions.length; i += 3) {
    const [x, y, z] = [m.positions[i], m.positions[i + 1], m.positions[i + 2]];
    if (Math.abs(z) > 750) for (const ax of [1300, -1300]) assert.ok(Math.hypot(x - ax, y - 320) > 360 - 2 * m.cell, `point ${x},${y},${z} inside an arch`);
  }
});

test('hullMesh: deterministic, coarse is a fraction of fine, and cache keys ignore placement', () => {
  const { shape } = norm(CAR);
  const a = hullMesh(shape, { level: 'coarse' });
  const b = hullMesh(shape, { level: 'coarse' });
  assert.deepEqual(Array.from(a.positions.slice(0, 300)), Array.from(b.positions.slice(0, 300)));
  const f = hullMesh(shape, { level: 'fine' });
  assert.ok(a.triangles * 3 < f.triangles, `coarse ${a.triangles} vs fine ${f.triangles}`);
  assert.equal(hullKey(shape), hullKey({ ...shape, at: [100, 0, 0], rot: [0, 90, 0] }));
  assert.notEqual(hullKey(shape), hullKey({ ...shape, r: 10 }));
});

test('hullMesh: an off-center mirrored hull is meshed once and twinned; revolve makes a round, hollow solid', () => {
  const mirror = norm({
    type: 'hull',
    mirror: true,
    side: [[1150, 1012], [1142, 1082], [1092, 1132], [950, 1142], [900, 1100], [902, 1022], [960, 992]],
    top: [[1140, 845], [1150, 952], [1112, 1062], [1022, 1102], [922, 1086], [900, 952], [932, 846]],
    front: [[845, 1000], [1000, 992], [1092, 1002], [1102, 1062], [1092, 1132], [1000, 1142], [845, 1120]],
  });
  assert.deepEqual(mirror.notes, []);
  const m = hullMesh(mirror.shape, { level: 'fine' });
  const { lo, hi } = bounds(m.positions);
  assert.ok(lo[2] < -1050 && hi[2] > 1050 && lo[2] > -1120 && hi[2] < 1120, `z ${lo[2]}…${hi[2]}`);
  let middle = 0;
  for (let i = 2; i < m.positions.length; i += 3) if (Math.abs(m.positions[i]) < 700) middle++;
  assert.equal(middle, 0, 'nothing between the pair');

  const housing = norm({ type: 'hull', axis: 'x', revolve: [[24, 54], [24, 45], [62, 36], [67, 26], [67, 16], [64, 16], [64, 25], [59, 33], [20, 41], [20, 54]], r: 2 }).shape;
  const h = hullMesh(housing, { level: 'fine', scale: 220 });
  let minR = Infinity;
  let maxR = 0;
  for (let i = 0; i < h.positions.length; i += 3) {
    const r = Math.hypot(h.positions[i + 1], h.positions[i + 2]);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
  }
  assert.ok(maxR < 67 + h.cell && maxR > 64, `outer radius ${maxR}`);
  assert.ok(minR > 18, `hollow: nothing near the axis (${minR})`);
});

test('hullMesh: a revolve far bigger than the other views (a unit mix-up) costs only its overlap (RV73-E1)', () => {
  // A solid revolve 20x and 200x the size of the side and top views, near the axis and out at its
  // rim: only the overlap is solid (the validator says so), and the revolve's distance grid covers
  // just what the voxel grid can reach, like the view grids. It used to cover the whole profile:
  // (revolve size / cell)² nodes, 5–20 s and 0.5–2 GB in the worker for one part.
  const hull = (R, x0, x1) => ({ type: 'hull', revolve: [[0, 0], [R, 0], [R, R], [0, R]], side: [[x0, 0], [x1, 0], [x1, 100], [x0, 100]], top: [[x0, -50], [x1, -50], [x1, 50], [x0, 50]] });
  const scaleOf = (spec) => quantizeScale(Math.hypot(...specBounds(spec).size));
  for (const [R, x0, x1] of [[2000, -50, 50], [2000, 1900, 2050], [20000, -50, 50], [20000, 19900, 20050]]) {
    const res = normalizeHologramSpec({ title: 'Test', parts: [part('housing', [hull(R, x0, x1)])] });
    assert.ok(res.ok);
    assert.ok(res.warnings.some((w) => /only the overlap is solid/.test(w)), res.warnings.join('\n'));
    const shape = res.spec.parts[0].shapes[0];
    const scale = scaleOf(res.spec);
    for (const level of ['coarse', 'fine']) {
      const F = hullField(shape, { level, scale });
      const views = Math.max(F.mx * F.my, F.mx * F.mz, F.mz * F.my);
      assert.ok(F.R.nu * F.R.nv <= 2 * views, `R=${R} x ${x0}…${x1} ${level}: revolve grid ${F.R.nu}×${F.R.nv} vs view grids ≤ ${views} nodes`);
    }
  }
  // the same mesh as a revolve of the views' own size: nothing the mesher looks at changed
  const small = normalizeHologramSpec({ title: 'Test', parts: [part('housing', [hull(200, -50, 50)])] });
  const big = normalizeHologramSpec({ title: 'Test', parts: [part('housing', [hull(20000, -50, 50)])] });
  const scale = scaleOf(small.spec);
  assert.equal(scaleOf(big.spec), scale);
  for (const level of ['coarse', 'fine']) {
    const a = hullMesh(small.spec.parts[0].shapes[0], { level, scale });
    const b = hullMesh(big.spec.parts[0].shapes[0], { level, scale });
    assert.ok(a.triangles > 1000, `${level}: ${a.triangles} triangles`);
    assert.deepEqual(Array.from(b.positions), Array.from(a.positions));
    assert.deepEqual(Array.from(b.indices), Array.from(a.indices));
  }
});

test('smoothOutline: gentle bends become curves through the points, sharp corners stay', () => {
  const square = Float64Array.from([0, 0, 100, 0, 100, 100, 0, 100]);
  assert.deepEqual(Array.from(smoothOutline(square, 10)), Array.from(square), 'a square stays a square');
  const oct = [];
  for (let i = 0; i < 8; i++) oct.push(Math.cos((i * Math.PI) / 4) * 100, Math.sin((i * Math.PI) / 4) * 100);
  assert.equal(smoothOutline(Float64Array.from(oct), 5).length, 16, 'an octagon (long edges) keeps its corners');
  const throughAll = (pts, out) => {
    for (let i = 0; i < pts.length; i += 2) {
      let found = false;
      for (let j = 0; j < out.length; j += 2) if (Math.hypot(out[j] - pts[i], out[j + 1] - pts[i + 1]) < 1e-6) found = true;
      assert.ok(found, `passes through point ${i / 2}`);
    }
  };
  const maxTurn = (out, from, to) => {
    let max = 0;
    for (let i = from + 1; i < to - 1; i++) {
      const ax = out[i * 2] - out[i * 2 - 2], ay = out[i * 2 + 1] - out[i * 2 - 1];
      const bx = out[i * 2 + 2] - out[i * 2], by = out[i * 2 + 3] - out[i * 2 + 1];
      max = Math.max(max, Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)));
    }
    return (max * 180) / Math.PI;
  };
  // a roofline drawn with 13 points: a smooth curve (no turn over 8° between samples) through them
  const roof = [];
  for (let i = 0; i <= 12; i++) roof.push(-1000 + i * (2000 / 12), 1000 + Math.sin((i / 12) * Math.PI) * 300);
  roof.push(1000, 0, -1000, 0);
  const smooth = smoothOutline(Float64Array.from(roof), 20);
  throughAll(roof, smooth);
  let top = 0;
  while (top < smooth.length / 2 && smooth[top * 2] < 1000 - 1e-6) top++;
  assert.ok(maxTurn(smooth, 0, top) <= 8, `smooth roofline (max turn ${maxTurn(smooth, 0, top).toFixed(1)}°)`);
  // a tyre profile drawn coarsely (40° turns on short edges) is a sampled arc: resampled, through its points
  const tyre = [[240, -128], [352, -138], [390, -131], [404, -112], [409, -60], [410, 0], [409, 60], [404, 112], [390, 131], [352, 138], [240, 128]];
  const flat = Float64Array.from(tyre.flat());
  const t = smoothOutline(flat, 5, false);
  assert.ok(t.length / 2 > tyre.length * 2, `tyre resampled (${t.length / 2} points)`);
  throughAll(flat, t);
  // a window drawn as a trapezoid keeps its straight edges: nothing above its roof edge
  const win = smoothOutline(Float64Array.from([850, 950, 300, 1350, -850, 1350, -1400, 980]), 20);
  for (let i = 1; i < win.length; i += 2) assert.ok(win[i] <= 1350 + 1e-6);
});

test('panelMesh: the hull surface inside the outline, facing its face, clipped, lifted and outlined', () => {
  const { shape } = norm(CAR);
  const m = hullMesh(shape, { level: 'fine' });
  const outline = [[850, 950], [300, 1350], [-850, 1350], [-1400, 980]];
  const p = panelMesh([{ mesh: m, shape }], { face: 'sides', outline });
  assert.ok(p.triangles > 100);
  const { lo, hi } = bounds(p.positions);
  // inside the outline, give or take the lift off the surface (about 0.35% of the hull's size)
  const tol = 25;
  assert.ok(lo[0] >= -1400 - tol && hi[0] <= 850 + tol && lo[1] >= 950 - tol && hi[1] <= 1350 + tol, `inside the outline: ${lo} ${hi}`);
  // both sides, lying on the surface (normals facing ±z)
  assert.ok(lo[2] < -500 && hi[2] > 500);
  let facing = 0;
  for (let i = 2; i < p.normals.length; i += 3) if (Math.abs(p.normals[i]) > 0.1) facing++;
  assert.ok(facing / (p.normals.length / 3) > 0.97, 'the glass faces sideways');
  assert.ok(p.lines.length > 0 && p.lines.length % 6 === 0);
  // a mirrored front panel: on the front face, both sides
  const lights = panelMesh([{ mesh: m, shape }], { face: 'front', mirror: true, outline: [[400, 550], [800, 550], [800, 750], [400, 750]] });
  const lb = bounds(lights.positions);
  assert.ok(lb.lo[0] > 1700, 'on the front');
  assert.ok(lb.lo[2] < -400 && lb.hi[2] > 400, 'mirrored');
  // nothing faces a face with no surface inside the outline
  assert.equal(panelMesh([{ mesh: m, shape }], { face: 'top', outline: [[5000, 0], [5100, 0], [5100, 100]] }), null);
});

test('panelMesh: a panel lies within its lift of the host surface', () => {
  const { shape } = norm(CAR);
  const m = hullMesh(shape, { level: 'fine' });
  const field = hullField(shape, { level: 'fine' });
  const diag = Math.hypot(4050, 1200, 1760);
  for (const [face, outline, lift] of [
    ['sides', [[850, 950], [300, 1350], [-850, 1350], [-1400, 980]], undefined],
    ['top', [[1800, 0], [1800, 500], [1000, 600], [1000, 0]], 6],
  ]) {
    const p = panelMesh([{ mesh: m, shape }], { face, outline, lift });
    const want = lift ?? diag * 0.0035;
    const off = [];
    // the field is a signed distance near the surface (positive inside): a panel vertex sits at -lift
    for (let i = 0; i < p.positions.length; i += 3) off.push(Math.abs(field.f(p.positions[i], p.positions[i + 1], p.positions[i + 2]) + want));
    off.sort((a, b) => a - b);
    const median = off[Math.floor(off.length / 2)];
    const p95 = off[Math.floor(off.length * 0.95)];
    assert.ok(median < m.cell * 0.25, `${face}: median ${median.toFixed(2)} off (cell ${m.cell.toFixed(1)})`);
    assert.ok(p95 < m.cell * 0.75, `${face}: 95% within ${p95.toFixed(2)} (cell ${m.cell.toFixed(1)})`);
  }
});

test('renderer chunks: hulls and panels build synchronously in Node with their async keys; the coarse cap', () => {
  const r = normalizeHologramSpec({
    title: 'Car',
    parts: [
      { id: 'body', name: 'Body', info: 'x', shapes: [{ ...CAR, at: [0, 10, 0] }] },
      { id: 'glass', name: 'Windows', info: 'x', shapes: [{ type: 'panel', on: 'body', face: 'right', outline: [[850, 950], [300, 1350], [-850, 1350], [-1400, 980]] }] },
    ],
  });
  const [body, glass] = r.spec.parts;
  const ctx = { scale: 5000, hosts: (id) => (id === 'body' ? body.shapes : []) };
  const hull = buildShapeChunk(body.shapes[0], ctx);
  assert.ok(hull.vertexCount > 1000 && hull.lineVertexCount > 0);
  assert.equal(hull.level, 'fine');
  assert.equal(hull.done, true);
  assert.match(hull.asyncKey, /^h:/);
  assert.equal(hull.lineWeights.length, hull.lineVertexCount);
  assert.ok(hull.minY >= 200 + 10 - 50, 'placed by at');
  const panel = buildShapeChunk(glass.shapes[0], ctx);
  assert.ok(panel.vertexCount > 100);
  assert.match(panel.asyncKey, /^p:/);
  // the panel follows the hull's placement (at: y + 10)
  let minY = Infinity;
  for (let i = 1; i < panel.positions.length; i += 3) minY = Math.min(minY, panel.positions[i]);
  assert.ok(minY > 950 - 30 + 10 - 25);
  // a heavy hologram asks for the coarse mesh only: done once it is there
  const capped = buildShapeChunk({ ...body.shapes[0], r: 59 }, { ...ctx, hullMode: 'coarse' });
  assert.equal(capped.level, 'coarse');
  assert.equal(capped.done, true);
  assert.equal(capped.hullMode, 'coarse');
  assert.ok(capped.indices.length * 2 < hull.indices.length);
});

test('16 worst-case hulls stay under 0.55M triangles at their fine budget', () => {
  // 96-point views and 12 cuts each repeated 4 times: about the most one hull can ask for
  const side = [];
  for (let i = 0; i < 96; i++) {
    const a = (2 * Math.PI * i) / 96;
    side.push([Math.round(2400 * Math.cos(a)), Math.round(700 + 650 * Math.sin(a) + 40 * Math.sin(9 * a))]);
  }
  const top = [];
  for (let i = 0; i < 96; i++) {
    const a = (Math.PI * i) / 95;
    top.push([Math.round(2400 * Math.cos(a)), Math.round(900 * Math.sin(a) + 30 * Math.sin(7 * a) * Math.sin(a))]);
  }
  const front = [];
  for (let i = 0; i < 96; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 95;
    front.push([Math.round(900 * Math.cos(a)), Math.round(700 + 650 * Math.sin(a))]);
  }
  const cut = Array.from({ length: 12 }, (_, i) => ({ type: 'cylinder', axis: 'z', at: [-2000 + i * 360, 200, 900], r: 150, h: 300, repeat: { count: 4, along: [0, 100, 0] } }));
  const res = normalizeHologramSpec({ title: 'Worst', parts: [{ id: 'b', name: 'B', info: 'x', shapes: [{ type: 'hull', side, top, front, r: 60, cut }] }] });
  assert.ok(res.ok);
  const shape = res.spec.parts[0].shapes[0];
  assert.equal(shape.cut.length, 12);
  // one hull the size of the whole model gets the full fine budget (30k), the worst case
  const scale = quantizeScale(Math.hypot(...specBounds(res.spec).size));
  const fine = hullMesh(shape, { level: 'fine', scale });
  const coarse = hullMesh(shape, { level: 'coarse', scale });
  assert.ok(fine.triangles <= 34000, `fine ${fine.triangles}`);
  assert.ok(coarse.triangles * 3 < fine.triangles, `coarse ${coarse.triangles}`);
  assert.ok(16 * fine.triangles < 550000, `16 × ${fine.triangles}`);
});
