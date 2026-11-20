import { test } from 'node:test';
import assert from 'node:assert/strict';
// Smooth shapes of format v2 (ported from prototype A, holo-real-a): the loft shape, box.round,
// lathe.smooth and tube.r2 in the validator (src/lib/hologram-spec.js).
import { normalizeShape, normalizeHologramSpec, partBounds, SHOW_HOLOGRAM_TOOL, SHOW_HOLOGRAM_TOOL_V2, showHologramToolV2, SHAPE_TYPES, stablePrefix } from '../../src/lib/hologram-spec.js';

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
