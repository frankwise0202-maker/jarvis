import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
// The show_hologram tool, version 2 (format v2: hull, panel, loft, soft boxes, smooth lathes,
// tapered tubes). Version 1 stays byte-identical (frozen into older conversations); version 2 is a
// new frozen definition for lead tools V7, and everything its text names is accepted by the
// validator. The six v2 fixtures (test/mock/fixtures/v2/) validate without a single warning.
import {
  HOLOGRAM_INPUT_SCHEMA_V2,
  HOLOGRAM_LIMITS as L,
  SHAPE_TYPES,
  SHAPE_TYPES_V1,
  SHOW_HOLOGRAM_DESCRIPTION,
  SHOW_HOLOGRAM_DESCRIPTION_V2,
  SHOW_HOLOGRAM_TOOL,
  SHOW_HOLOGRAM_TOOL_V2,
  normalizeHologramSpec,
  showHologramTool,
  showHologramToolV2,
} from '../../src/lib/hologram-spec.js';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
export const V2_FIXTURES = Object.freeze(['camry', 'f150', 'alternator', 'turbofan', 'model3', 'cessna']);
export const v2Fixture = (name) => readFileSync(new URL(`../mock/fixtures/v2/${name}.json`, import.meta.url), 'utf8');

test('version 1 is byte-identical (pinned); its enum never learned the new types', () => {
  assert.equal(sha256(JSON.stringify(SHOW_HOLOGRAM_TOOL)), '8e754b8cbedb40de5e0649b6311dfb4d7f4b61796c5aa4a672f98bfe269144bf');
  assert.deepEqual(showHologramTool(), JSON.parse(JSON.stringify(SHOW_HOLOGRAM_TOOL)));
  const v1 = SHOW_HOLOGRAM_TOOL.input_schema.properties.parts.items.properties.shapes.items.properties;
  assert.deepEqual(v1.type.enum, [...SHAPE_TYPES_V1]);
  for (const key of ['hull', 'panel', 'loft']) assert.ok(!v1.type.enum.includes(key), key);
  for (const key of ['side', 'top', 'front', 'revolve', 'cut', 'arches', 'mirror', 'on', 'face', 'wrap', 'sections', 'cap', 'round', 'smooth']) assert.equal(v1[key], undefined, key);
});

test('version 2: deeply frozen, pinned, the V1 enum plus hull, panel and loft, within its size budget', () => {
  assert.equal(SHOW_HOLOGRAM_TOOL_V2.name, 'show_hologram', 'the same tool name: a conversation has one or the other');
  assert.equal(SHOW_HOLOGRAM_TOOL_V2.eager_input_streaming, true);
  assert.equal(SHOW_HOLOGRAM_TOOL_V2.input_schema, HOLOGRAM_INPUT_SCHEMA_V2);
  assert.ok(Object.isFrozen(SHOW_HOLOGRAM_TOOL_V2));
  assert.ok(Object.isFrozen(SHOW_HOLOGRAM_TOOL_V2.input_schema.properties.parts.items.properties.shapes.items.properties.sections.items.properties.twist));
  assert.throws(() => {
    'use strict';
    SHOW_HOLOGRAM_TOOL_V2.input_schema.properties.title.description = 'changed';
  }, TypeError);
  const copy = showHologramToolV2();
  assert.deepEqual(copy, JSON.parse(JSON.stringify(SHOW_HOLOGRAM_TOOL_V2)));
  copy.description = 'mine';
  assert.notEqual(showHologramToolV2().description, 'mine');
  const props = SHOW_HOLOGRAM_TOOL_V2.input_schema.properties.parts.items.properties.shapes.items.properties;
  assert.deepEqual(props.type.enum, [...SHAPE_TYPES_V1, 'hull', 'panel', 'loft']);
  assert.deepEqual(props.type.enum, [...SHAPE_TYPES]);
  assert.deepEqual(props.face.enum, ['right', 'left', 'sides', 'front', 'back', 'top', 'bottom']);
  // its four paragraphs: what it is, V1's "when to use it" verbatim, the shape routing, the order
  const paras = SHOW_HOLOGRAM_DESCRIPTION_V2.split('\n\n');
  assert.equal(paras.length, 4);
  assert.equal(paras[1], SHOW_HOLOGRAM_DESCRIPTION.split('\n\n')[1]);
  assert.match(paras[2], /^Make it look like the real thing, not like blocks/);
  for (const needle of ['hull:', 'panel parts', 'loft:', 'lathe with smooth', 'box with round']) assert.ok(paras[2].includes(needle), needle);
  assert.match(SHOW_HOLOGRAM_TOOL_V2.input_schema.properties.parts.items.properties.shapes.description, /at most 16 hulls and 40 panels/);
  assert.match(props.top.description, /\[\[2390, 0\], \[2250, 700\], \[1450, 918\], \[-1600, 920\], \[-2497, 0\]\]/);
  assert.match(props.front.description, /Every view must span the same length, height and width as the others/);
  // a budget guard: it is cached with the tools, but every request carries it
  const size = JSON.stringify(SHOW_HOLOGRAM_TOOL_V2).length;
  assert.ok(size < 20000, `${size} characters`);
  assert.equal(sha256(JSON.stringify(SHOW_HOLOGRAM_TOOL_V2)), V2_SHA);
});
const V2_SHA = 'e24cf1b5382a6e0a8af41fc5ac02b7e140df52b0eb0e6a0e33c7347b378ab740';

test('every field the V2 text names is accepted by the validator (zero warnings)', () => {
  const half = (pts) => pts; // right halves: mirrored by the validator
  const spec = {
    title: 'Kitchen sink',
    subtitle: 'Every v2 field',
    units: 'mm',
    view: 'front-right',
    groups: [{ id: 'body', name: 'Body' }],
    notes: ['A test spec.'],
    parts: [
      {
        id: 'body',
        name: 'Body',
        aka: ['shell'],
        group: 'body',
        tone: 'secondary',
        info: 'A hull with arches and a cut.',
        material: 'Steel',
        explode: [0, 500, 0],
        anchor: [0, 1200, 0],
        shapes: [
          {
            type: 'hull',
            at: [0, 0, 0],
            side: [[2000, 500], [1900, 800], [900, 900], [300, 1400], [-900, 1400], [-1500, 950], [-2000, 900], [-2050, 500], [-1900, 200], [1900, 200]],
            top: half([[2000, 0], [1950, 600], [1700, 880], [-1800, 880], [-2050, 600], [-2050, 0]]),
            front: half([[0, 1400], [600, 1380], [780, 1000], [880, 900], [880, 300], [800, 200], [0, 200]]),
            mirror: true,
            r: 60,
            arches: [[1300, 320, 360], [-1300, 320, 360]],
            cut: [{ type: 'box', at: [-1500, 1000, 0], size: [400, 200, 100], r: 10, repeat: { count: 2, along: [300, 0, 0] } }],
          },
        ],
      },
      { id: 'glass', name: 'Glass', info: 'Side glass.', shapes: [{ type: 'panel', on: 'body', face: 'sides', wrap: true, outline: [[850, 950], [300, 1350], [-850, 1350], [-1400, 980]] }] },
      { id: 'lights', name: 'Headlights', info: 'A pair.', shapes: [{ type: 'panel', on: 'body', face: 'front', mirror: true, outline: [[400, 650], [800, 650], [800, 780], [400, 780]] }] },
      { id: 'housing', name: 'Housing', info: 'A cut revolve.', shapes: [{ type: 'hull', axis: 'x', revolve: [[24, 54], [24, 45], [62, 36], [67, 16], [64, 16], [59, 33], [20, 41], [20, 54]], r: 2, cut: [{ type: 'cylinder', axis: 'x', at: [30, 50, 0], r: 4, h: 40 }] }] },
      {
        id: 'fuselage',
        name: 'Fuselage',
        info: 'A loft.',
        shapes: [
          {
            type: 'loft',
            axis: 'x',
            cap: 'end',
            arches: [[1000, 300, 250]],
            sections: [
              { x: 0, y: [200, 900], w: 800, round: 0.4, top: 600, twist: 2 },
              { x: 1500, z: 0, y: 600, d: 700 },
              { x: 3000, y: 600, h: 400, w: 300 },
              { x: 3500, y: 600, pts: [[-100, -100], [100, -100], [0, 120]] },
            ],
          },
        ],
      },
      { id: 'blades', name: 'Blades', info: 'Twisted.', shapes: [{ type: 'loft', axis: 'y', sections: [{ y: 100, x: 0, z: 0, w: 120, h: 20, twist: 20 }, { y: 400, x: 0, w: 160, h: 6, twist: 55 }], repeat: { count: 12, around: 'x', step: 30, start: 0, center: [0, 0, 0] } }] },
      {
        id: 'misc',
        name: 'Misc',
        info: 'The V1 primitives with their v2 options.',
        shapes: [
          { type: 'box', size: [100, 50, 80], round: 0.4 },
          { type: 'box', size: [100, 50, 80], r: 5, rot: [0, 30, 0] },
          { type: 'cylinder', r: 20, r2: 15, h: 40, hole: 5, sides: 6, axis: 'x' },
          { type: 'cone', r: 10, h: 20, sides: 8 },
          { type: 'sphere', size: [10, 20, 30] },
          { type: 'torus', r: 30, tube: 4, arc: 90 },
          { type: 'capsule', r: 5, h: 30 },
          { type: 'lathe', smooth: true, axis: 'z', profile: [[0, 0], [20, 0], [24, 10], [20, 20], [0, 20]] },
          { type: 'extrude', smooth: true, outline: [[0, 0], [40, 0], [44, 10], [40, 20], [0, 20]], depth: 6, bevel: 1 },
          { type: 'tube', r: 4, r2: 2, path: [[0, 0, 0], [100, 50, 0], [200, 0, 0]] },
          { type: 'line', path: [[0, 0, 0], [0, 100, 0]] },
        ],
      },
    ],
  };
  const res = normalizeHologramSpec(spec);
  assert.deepEqual(res.warnings, []);
  assert.equal(res.stats.dropped, 0);
  // the spec above uses every shape field and every section field the V2 schema names
  const schemaShape = SHOW_HOLOGRAM_TOOL_V2.input_schema.properties.parts.items.properties.shapes.items.properties;
  const schemaSection = schemaShape.sections.items.properties;
  const usedShape = new Set(spec.parts.flatMap((p) => p.shapes.flatMap((s) => Object.keys(s))));
  const usedSection = new Set(spec.parts.flatMap((p) => p.shapes.flatMap((s) => (s.sections || []).flatMap((sec) => Object.keys(sec)))));
  for (const key of Object.keys(schemaShape)) assert.ok(usedShape.has(key), `shape field ${key} is exercised`);
  for (const key of Object.keys(schemaSection)) assert.ok(usedSection.has(key), `section field ${key} is exercised`);
  for (const key of Object.keys(SHOW_HOLOGRAM_TOOL_V2.input_schema.properties.parts.items.properties)) assert.ok(Object.keys(spec.parts[0]).includes(key), `part field ${key}`);
  for (const key of Object.keys(SHOW_HOLOGRAM_TOOL_V2.input_schema.properties)) assert.ok(key in spec, `top-level field ${key}`);
  // and the normalized shapes keep what they were given (arches on a hull become its cuts)
  const shapes = res.spec.parts.flatMap((p) => p.shapes);
  const kept = new Set(shapes.flatMap((s) => Object.keys(s)));
  for (const key of Object.keys(schemaShape)) assert.ok(kept.has(key), `normalized shapes keep ${key}`);
  const body = shapes[0];
  assert.equal(body.cut.length, 3, 'the box cut (repeated) and the two arches');
  assert.equal(body.arches, undefined);
});

test('the six v2 fixtures validate with zero warnings and re-validate unchanged', () => {
  const counts = { camry: [43, 7, 16], f150: [39, 9, 13], alternator: [19, 6, 0], turbofan: [20, 0, 0], model3: [14, 1, 9], cessna: [10, 0, 0] };
  for (const name of V2_FIXTURES) {
    const text = v2Fixture(name);
    const res = normalizeHologramSpec(text);
    assert.ok(res.ok, name);
    assert.deepEqual(res.warnings, [], `${name}: ${res.warnings.join('\n')}`);
    assert.equal(res.stats.dropped, 0, name);
    const of = (type) => res.spec.parts.reduce((n, p) => n + p.shapes.filter((s) => s.type === type).length, 0);
    assert.deepEqual([res.stats.parts, of('hull'), of('panel')], counts[name], name);
    assert.ok(of('hull') <= L.hulls && of('panel') <= L.panels);
    // about the size of today's specs (the plan's budget: within ±5% of the V1 versions)
    assert.ok(JSON.stringify(JSON.parse(text)).length < 26000, `${name} stays affordable to write`);
    const again = normalizeHologramSpec(res.spec);
    assert.deepEqual(again.warnings, [], name);
    assert.deepEqual(again.spec, res.spec, `${name}: a saved spec reopens exactly`);
  }
  // the realistic shapes are what make them realistic
  const types = (name) => new Set(normalizeHologramSpec(v2Fixture(name)).spec.parts.flatMap((p) => p.shapes.map((s) => s.type)));
  assert.ok(types('camry').has('hull') && types('camry').has('panel'));
  assert.ok(types('turbofan').has('loft') && !types('turbofan').has('hull'));
  assert.ok(types('cessna').has('loft'));
});
