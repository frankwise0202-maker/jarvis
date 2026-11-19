// node --test: draw_blueprint validator / normalizer, tool definition and tool_result text.
// Ported from the phase A prototype (blueprint-proto test/blueprint-spec.test.mjs); samples live in
// test/mock/fixtures/ (shared with the mock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  normalizeBlueprintSpec,
  blueprintToolResult,
  drawBlueprintTool,
  summarizeBlueprint,
  cleanText,
  safeHttpUrl,
  LIMITS,
  DRAW_BLUEPRINT_INPUT_SCHEMA,
} from '../../src/lib/blueprint-spec.js';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mock', 'fixtures');
const sample = (name) => JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
const SAMPLES = ['alternator-part', 'battery-cutaway', 'battery-process', 'camry-assembly'];

const minimal = (extra = {}) => ({
  title: 'Bracket',
  sheet: 'part',
  views: [{ title: 'Front view', at: [500, 350], shapes: [{ type: 'rect', at: [-50, -30], size: [100, 60] }], callouts: [{ n: 1, at: [0, 0] }] }],
  parts: [{ n: 1, name: 'Bracket', material: 'Steel' }],
  ...extra,
});

test('every sample is valid with zero warnings and stays within the budgets', () => {
  for (const name of SAMPLES) {
    const { spec, warnings } = normalizeBlueprintSpec(sample(name));
    assert.ok(spec, name);
    assert.deepEqual(warnings, [], `${name}: ${warnings.join(' | ')}`);
    const c = summarizeBlueprint(spec);
    assert.ok(c.shapes <= LIMITS.shapes && c.primitives <= LIMITS.primitives, name);
  }
});

test('normalizing twice gives the same spec (idempotent)', () => {
  for (const name of SAMPLES) {
    const once = normalizeBlueprintSpec(sample(name)).spec;
    const twice = normalizeBlueprintSpec(once);
    assert.deepEqual(twice.warnings, [], name);
    assert.deepEqual(twice.spec, once, name);
  }
});

test('non-objects and empty sheets are rejected with a reason', () => {
  for (const bad of [null, 42, 'draw it', [], undefined]) {
    const r = normalizeBlueprintSpec(bad);
    assert.equal(r.spec, null);
    assert.match(r.warnings[0], /JSON object/);
  }
  const empty = normalizeBlueprintSpec({ title: 'Nothing', sheet: 'part' });
  assert.equal(empty.spec, null);
  assert.match(empty.warnings[0], /Nothing to draw/);
});

test('defaults: title, sheet, scale, canvas, names by sheet kind', () => {
  const { spec, warnings } = normalizeBlueprintSpec({ shapes: [{ type: 'line', from: [0, 0], to: [10, 10] }] });
  assert.equal(spec.title, 'Blueprint');
  assert.equal(spec.sheet, 'part');
  assert.equal(spec.scale, 'NTS');
  assert.deepEqual(spec.canvas, [1000, 700]);
  assert.equal(spec.names, false);
  assert.ok(warnings.some((w) => /title: missing/.test(w)));
  assert.equal(normalizeBlueprintSpec(minimal({ sheet: 'cutaway' })).spec.names, true);
  assert.equal(normalizeBlueprintSpec(minimal({ sheet: 'cutaway', names: false })).spec.names, false);
  const odd = normalizeBlueprintSpec(minimal({ sheet: 'poster', canvas: [5000, 10] }));
  assert.equal(odd.spec.sheet, 'part');
  assert.deepEqual(odd.spec.canvas, [2000, 300]);
  assert.ok(odd.warnings.some((w) => /^sheet:/.test(w)));
  assert.ok(odd.warnings.some((w) => /^canvas:/.test(w)));
});

test('strings are cleaned: control and bidi characters removed, whitespace collapsed, capped', () => {
  assert.equal(cleanText('  Rotor‮\u0007 \n\t assembly​ ', 40), 'Rotor assembly');
  assert.equal(cleanText(12.5, 10), '12.5');
  assert.equal(cleanText({}, 10), '');
  const long = 'x'.repeat(200);
  const { spec, warnings } = normalizeBlueprintSpec(minimal({ title: long }));
  assert.equal(Array.from(spec.title).length, LIMITS.title);
  assert.ok(spec.title.endsWith('…'));
  assert.ok(warnings.some((w) => /title was cut to 80/.test(w)));
});

test('numbers must be finite and in range; points are rounded', () => {
  const { spec, warnings } = normalizeBlueprintSpec(
    minimal({
      shapes: [
        { type: 'line', from: [0.123456, 1.987654], to: [10, 10] },
        { type: 'line', from: [NaN, 0], to: [1, 1] },
        { type: 'line', from: [0, 0], to: [Infinity, 1] },
        { type: 'line', from: [0, 0], to: [1e9, 1] },
        { type: 'line', from: ['1', '2'], to: [3, 4] },
        { type: 'line', from: [0, 0, 0], to: [3, 4] },
        { type: 'circle', at: [0, 0], r: -5 },
        { type: 'circle', at: [0, 0], r: 0 },
        { type: 'rect', at: [0, 0], size: [10, 0] },
      ],
    }),
  );
  assert.equal(spec.shapes.length, 1);
  assert.deepEqual(spec.shapes[0].from, [0.12, 1.99]);
  assert.equal(warnings.filter((w) => /^shapes\[\d\]: .*\(dropped\)/.test(w)).length, 8);
});

test('path data: only MLHVCSQTAZ and numbers; canonical output; bounded', () => {
  const ok = normalizeBlueprintSpec(minimal({ shapes: [{ type: 'path', d: 'M10,10 l20-5h5v5 C 1 2 3 4 5 6 s1 1 2 2 Q0 0 1 1 t2 2 a5 5 0 0110 10 z' }] }));
  assert.deepEqual(ok.warnings, []);
  const d = ok.spec.shapes[0].d;
  assert.match(d, /^[MLHVCSQTAZmlhvcsqtaz0-9. -]+$/);
  assert.match(d, /a 5 5 0 0 1 10 10/);
  assert.ok(Array.isArray(ok.spec.shapes[0].bounds));
  const bad = [
    'M 0 0 L 10 10 <script>',
    'javascript:alert(1)',
    'M 0 0 url(#x)',
    'L 10 10', // must start with a moveto
    'M 0 0 L 10', // missing argument
    'M 0 0 A 5 5 0 2 1 10 10', // bad arc flag
    'M 0 0 E 5',
    `M ${'1 '.repeat(3000)}`,
    'M 0 0 L 1e400 0',
    '',
    42,
  ];
  for (const d2 of bad) {
    const r = normalizeBlueprintSpec(minimal({ shapes: [{ type: 'path', d: d2 }] }));
    assert.equal(r.spec.shapes.length, 0, String(d2).slice(0, 30));
    assert.ok(r.warnings.some((w) => /path "d" must/.test(w)));
  }
});

test('hatch: angle, pattern names and objects; only closed shapes', () => {
  const { spec, warnings } = normalizeBlueprintSpec(
    minimal({
      shapes: [
        { type: 'rect', at: [0, 0], size: [10, 10], hatch: 135 },
        { type: 'circle', at: [0, 0], r: 10, r2: 5, hatch: 'dots' },
        { type: 'polygon', points: [[0, 0], [10, 0], [5, 5]], hatch: { angle: -45, spacing: 99, pattern: 'cross' } },
        { type: 'hatch', points: [[0, 0], [10, 0], [5, 5]], angle: 30 },
        { type: 'line', from: [0, 0], to: [1, 1], hatch: 45 },
      ],
    }),
  );
  assert.deepEqual(spec.shapes[0].hatch, { pattern: 'lines', angle: 135 });
  assert.deepEqual(spec.shapes[1].hatch, { pattern: 'dots', angle: 45 });
  assert.equal(spec.shapes[1].r2, 5);
  assert.deepEqual(spec.shapes[2].hatch, { pattern: 'cross', angle: 135, spacing: 40 });
  assert.deepEqual(spec.shapes[3].hatch, { pattern: 'lines', angle: 30 });
  assert.equal(spec.shapes[4].hatch, undefined);
  assert.ok(warnings.some((w) => /hatch only applies to closed shapes/.test(w)));
});

test('repeat: rotate copies about a point or shift them; counts are capped', () => {
  const { spec, warnings } = normalizeBlueprintSpec(
    minimal({
      shapes: [
        { type: 'line', from: [0, -50], to: [0, -60], repeat: { count: 24 } },
        { type: 'circle', at: [0, 0], r: 2, repeat: { count: 4, along: [10, 0] } },
        { type: 'circle', at: [0, 0], r: 2, repeat: { count: 500 } },
      ],
    }),
  );
  assert.deepEqual(spec.shapes[0].repeat, { count: 24, around: [0, 0], step: 15 });
  assert.deepEqual(spec.shapes[1].repeat, { count: 4, along: [10, 0] });
  assert.equal(spec.shapes[2].repeat, undefined);
  assert.ok(warnings.some((w) => /repeat.count must be/.test(w)));
});

test('shape budget: lists and the whole sheet are capped', () => {
  const many = Array.from({ length: 450 }, (_, i) => ({ type: 'line', from: [i, 0], to: [i, 10] }));
  const one = normalizeBlueprintSpec(minimal({ shapes: many }));
  assert.equal(one.spec.shapes.length, LIMITS.shapesPerList);
  assert.ok(one.warnings.some((w) => /only the first 400 shapes/.test(w)));
  const views = Array.from({ length: 3 }, (_, v) => ({ at: [100 + v * 300, 300], shapes: many.slice(0, 350) }));
  const all = normalizeBlueprintSpec({ title: 'x', views });
  const total = all.spec.views.reduce((n, v) => n + v.shapes.length, 0);
  assert.equal(total, LIMITS.shapes);
  const repeats = Array.from({ length: 50 }, () => ({ type: 'line', from: [0, 0], to: [1, 1], repeat: { count: 100 } }));
  const prim = normalizeBlueprintSpec({ title: 'x', shapes: repeats });
  assert.ok(summarizeBlueprint(prim.spec).primitives <= LIMITS.primitives);
});

test('callouts, parts and cross-checks', () => {
  const { spec, warnings } = normalizeBlueprintSpec(
    minimal({
      views: [{ at: [500, 350], shapes: [{ type: 'rect', at: [-50, -30], size: [100, 60] }], callouts: [{ n: 1, at: [0, 0] }, { n: 3, at: [10, 10], label: [100, 100] }, { n: 0, at: [1, 1] }, { n: 2 }] }],
      parts: [{ n: 2, name: 'Pin', qty: 4 }, { n: 1, name: 'Bracket' }, { n: 1, name: 'Duplicate' }, { n: 4, name: '' }, { n: 5, name: 'Nut', qty: 0 }],
    }),
  );
  assert.deepEqual(spec.parts.map((p) => p.n), [1, 2, 5]);
  assert.equal(spec.parts[1].qty, 4);
  assert.equal(spec.parts[2].qty, undefined);
  assert.equal(spec.views[0].callouts.length, 2);
  assert.deepEqual(spec.views[0].callouts[1].label, [100, 100]);
  assert.ok(warnings.some((w) => /no parts row for callout 3/.test(w)));
  assert.ok(warnings.some((w) => /no callout points to parts 2, 5/.test(w)));
  assert.ok(warnings.some((w) => /duplicate part number 1/.test(w)));
});

test('dimensions: text required, offsets bounded, axis x/y', () => {
  const { spec, warnings } = normalizeBlueprintSpec(
    minimal({
      dimensions: [
        { from: [0, 0], to: [100, 0], text: '100 mm' },
        { from: [0, 0], to: [100, 40], text: '100', axis: 'x', offset: -20 },
        { from: [0, 0], to: [100, 0], text: '50', axis: 'y' },
        { from: [0, 0], to: [0, 0], text: 'zero' },
        { from: [0, 0], to: [10, 0] },
        { from: [0, 0], to: [10, 0], text: 'x', offset: 9999 },
      ],
    }),
  );
  assert.equal(spec.dimensions.length, 3);
  assert.equal(spec.dimensions[0].offset, 30);
  assert.equal(spec.dimensions[1].axis, 'x');
  assert.equal(spec.dimensions[2].offset, 30);
  assert.ok(warnings.some((w) => /axis "y" dimension measures nothing/.test(w)));
  assert.ok(warnings.some((w) => /offset must be a number within/.test(w)));
});

test('steps are ordered, renumbered and capped; pictograms validated', () => {
  const { spec, warnings } = normalizeBlueprintSpec({
    title: 'Process',
    sheet: 'process',
    steps: [
      { n: 3, title: 'Third', shapes: [{ type: 'circle', at: [80, 50], r: 20 }] },
      { n: 1, title: 'First', detail: 'Mix', phase: 'mix' },
      { n: 1, title: 'Also first' },
      { title: '' },
      { n: 2, title: 'Second', shapes: [{ type: 'rect', at: [0, 0], size: [400, 10] }] },
    ],
  });
  assert.deepEqual(spec.steps.map((s) => [s.n, s.title]), [[1, 'First'], [2, 'Also first'], [3, 'Second'], [4, 'Third']]);
  assert.equal(spec.steps[0].phase, 'MIX');
  assert.ok(warnings.some((w) => /duplicate step number 1/.test(w)));
  assert.ok(warnings.some((w) => /needs a "title"/.test(w)));
  assert.ok(warnings.some((w) => /outside the 160 x 100 pictogram box/.test(w)));
});

test('sources: only http(s) URLs without credentials', () => {
  assert.equal(safeHttpUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.org', 'https://user:pw@x.org', '//x.org', 'https://x.org/a b', `https://x.org/${'a'.repeat(600)}`, 42]) {
    assert.equal(safeHttpUrl(bad), null, String(bad).slice(0, 30));
  }
  const { spec, warnings } = normalizeBlueprintSpec(minimal({ sources: [{ title: 'Ok', url: 'https://example.com' }, { url: 'javascript:alert(1)' }, { url: 'http://example.org/x' }, { title: 'Dup', url: 'https://example.com' }] }));
  assert.deepEqual(spec.sources, [{ title: 'Ok', url: 'https://example.com/' }, { title: 'example.org', url: 'http://example.org/x' }]);
  assert.ok(warnings.some((w) => /sources\[1\]: needs an http or https/.test(w)));
});

test('content outside the canvas and overlapping views are reported', () => {
  const { warnings } = normalizeBlueprintSpec({
    title: 'x',
    views: [
      { title: 'A', at: [950, 350], shapes: [{ type: 'circle', at: [0, 0], r: 100 }] },
      { title: 'B', at: [900, 350], shapes: [{ type: 'circle', at: [0, 0], r: 100 }] },
    ],
  });
  assert.ok(warnings.some((w) => /views\[0\]: reaches x 850..1050/.test(w)));
  assert.ok(warnings.some((w) => /views\[0\] and views\[1\] overlap/.test(w)));
});

test('partial (streaming) input: no warnings, incomplete items dropped quietly', () => {
  const { spec, warnings } = normalizeBlueprintSpec({ title: 'Alt', views: [{ at: [300, 300], shapes: [{ type: 'circle', at: [0, 0], r: 50 }, { type: 'line', from: [0, 0] }] }] }, { partial: true });
  assert.deepEqual(warnings, []);
  assert.equal(spec.views[0].shapes.length, 1);
  const start = normalizeBlueprintSpec({}, { partial: true });
  assert.ok(start.spec);
  assert.equal(start.spec.title, '');
});

test('unknown fields are ignored; unknown shape types are dropped with a warning', () => {
  const { spec, warnings } = normalizeBlueprintSpec(minimal({ extra: { anything: 1 }, shapes: [{ type: 'spline', points: [] }, { type: 'line', from: [0, 0], to: [1, 1], color: 'red', onclick: 'x' }] }));
  assert.equal(spec.extra, undefined);
  assert.deepEqual(Object.keys(spec.shapes[0]).sort(), ['from', 'style', 'to', 'type']);
  assert.ok(warnings.some((w) => /unknown shape type "spline"/.test(w)));
});

test('warnings are capped', () => {
  const shapes = Array.from({ length: 120 }, () => ({ type: 'nope' }));
  const { warnings } = normalizeBlueprintSpec(minimal({ shapes }));
  assert.ok(warnings.length <= LIMITS.warnings + 1);
  assert.match(warnings[warnings.length - 1], /more warnings/);
});

test('tool definition: name, eager streaming, $defs schema, description guidance', () => {
  const tool = drawBlueprintTool();
  assert.equal(tool.name, 'draw_blueprint');
  assert.equal(tool.eager_input_streaming, true);
  assert.deepEqual(tool.input_schema.required, ['title', 'sheet']);
  assert.ok(tool.input_schema.$defs.shape.properties.type.enum.includes('cutline'));
  assert.equal(tool.input_schema.properties.views.items.properties.shapes.items.$ref, '#/$defs/shape');
  // A short description (what, when, cost); the drawing guidance lives on the fields.
  assert.ok(tool.description.length < 1200, `description is ${tool.description.length} chars`);
  for (const phrase of ['open_saved', 'only when the owner asks', 'process']) assert.ok(tool.description.includes(phrase), phrase);
  const schemaText = JSON.stringify(tool.input_schema);
  for (const phrase of ['SECTION A-A', 'Adjacent parts must differ', 'one parts row per number', 'inside the canvas', 'Process sheets', 'bolt circles', 'never dimension to hidden lines', 'axis']) assert.ok(schemaText.includes(phrase), phrase);
  // A fresh deep copy each call (conversations freeze it).
  tool.input_schema.properties.title.description = 'changed';
  assert.notEqual(drawBlueprintTool().input_schema.properties.title.description, 'changed');
  assert.ok(JSON.stringify(DRAW_BLUEPRINT_INPUT_SCHEMA).length < 12000); // about 3K tokens, cached with the prefix
});

test('tool_result text: summary, warnings, errors', () => {
  const ok = blueprintToolResult(normalizeBlueprintSpec(sample('alternator-part')));
  assert.equal(ok.is_error, false);
  assert.match(ok.content, /^Blueprint drawn and saved: "Alternator" \(part sheet, 2 views, \d+ shapes, 21 callouts, 18 parts, 4 dimensions\)/);
  const warned = blueprintToolResult(normalizeBlueprintSpec(minimal({ shapes: [{ type: 'blob' }] })));
  assert.match(warned.content, /corrected some input[\s\S]*unknown shape type "blob"/);
  const bad = blueprintToolResult(normalizeBlueprintSpec('nope'));
  assert.equal(bad.is_error, true);
  assert.match(bad.content, /could not be drawn/);
});

test('"for" links a sheet to a saved hologram part; bad ids are ignored', () => {
  const ok = normalizeBlueprintSpec(minimal({ for: { model: 'lib_7k2p9q1x', part: 'alternator' } }));
  assert.deepEqual(ok.spec.for, { model: 'lib_7k2p9q1x', part: 'alternator' });
  assert.deepEqual(ok.warnings, []);
  for (const bad of [{ model: 'x' }, { model: 'lib_7k2p9q1x', part: 'Alternator!' }, 'lib_7k2p9q1x', { model: 'lib_<script>' }]) {
    const r = normalizeBlueprintSpec(minimal({ for: bad }));
    assert.equal(r.spec.for, undefined);
    assert.ok(r.warnings.some((w) => /^for:/.test(w)));
  }
});

// ---------------------------------------------------------------------------------------------
// Phase B additions: the frozen tool constant, library sentences, the streaming stable prefix.

import { DRAW_BLUEPRINT_TOOL, blueprintStablePrefix, sheetLabel } from '../../src/lib/blueprint-spec.js';
import { parsePartialJson } from '../../src/engine/util.js';

test('DRAW_BLUEPRINT_TOOL is deeply frozen and equal to drawBlueprintTool()', () => {
  assert.ok(Object.isFrozen(DRAW_BLUEPRINT_TOOL));
  assert.ok(Object.isFrozen(DRAW_BLUEPRINT_TOOL.input_schema.$defs.shape.properties.hatch));
  assert.deepEqual(drawBlueprintTool(), JSON.parse(JSON.stringify(DRAW_BLUEPRINT_TOOL)));
  assert.throws(() => {
    DRAW_BLUEPRINT_TOOL.input_schema.required.push('x');
  }, TypeError);
});

test('tool_result with a library id says where it was saved; without one, that it was not', () => {
  const r = normalizeBlueprintSpec(sample('battery-cutaway'));
  const saved = blueprintToolResult(r, { libraryId: 'lib_ab12cd34ef' });
  assert.equal(saved.is_error, false);
  assert.match(saved.content, /^Blueprint drawn: "AA alkaline cell \(LR6\)" \(cutaway, /);
  assert.match(saved.content, /Saved to the owner's library as lib_ab12cd34ef \(reopen it later with open_saved\)\./);
  assert.match(blueprintToolResult(r, { libraryId: null }).content, /could not be saved to the owner's library/);
  assert.equal(sheetLabel('process'), 'process sheet');
  assert.equal(sheetLabel('nope'), 'part sheet');
});

test('blueprintStablePrefix: only certainly-complete values reach a live preview', () => {
  assert.deepEqual(blueprintStablePrefix({ title: 'Alt' }), {});
  assert.deepEqual(blueprintStablePrefix({ title: 'Alternator', sheet: 'pa' }), { title: 'Alternator' });
  assert.deepEqual(blueprintStablePrefix({ title: 'A', notes: ['one', 'tw'] }), { title: 'A', notes: ['one'] });
  const draft = { title: 'A', views: [{ title: 'FRONT', at: [1, 2], shapes: [{ type: 'circle', at: [0, 0], r: 5 }] }, { title: 'SIDE', at: [3, 4], shapes: [{ type: 'line', from: [0, 0], to: [1, 1] }, { type: 'circle', at: [0, 0], r: 1 }] }] };
  const s = blueprintStablePrefix(draft);
  assert.deepEqual(s.views[0], draft.views[0]);
  assert.deepEqual(s.views[1], { title: 'SIDE', at: [3, 4], shapes: [{ type: 'line', from: [0, 0], to: [1, 1] }] });
  // a number still streaming at the end of the buffer is never used ("12" of "120")
  const cut = parsePartialJson('{"title":"T","views":[{"at":[300,300],"shapes":[{"type":"circle","at":[0,0],"r":12');
  assert.equal(normalizeBlueprintSpec(blueprintStablePrefix(cut), { partial: true }).spec.views[0].shapes.length, 0);
  assert.deepEqual(blueprintStablePrefix(null), {});
  assert.deepEqual(blueprintStablePrefix([1, 2]), {});
});

for (const name of SAMPLES) {
  test(`streaming ${name}: shapes never change once shown, counts never shrink, the end equals the final spec`, () => {
    const raw = JSON.stringify(sample(name));
    const final = normalizeBlueprintSpec(sample(name)).spec;
    const locate = (spec) => {
      const out = new Map();
      spec.shapes.forEach((s, j) => out.set(`top.${j}`, JSON.stringify(s)));
      spec.views.forEach((v, i) => v.shapes.forEach((s, j) => out.set(`v${i}.${j}`, JSON.stringify(s))));
      spec.steps.forEach((t, i) => t.shapes.forEach((s, j) => out.set(`t${i}.${j}`, JSON.stringify(s))));
      return out;
    };
    const finalShapes = locate(final);
    const seen = new Map();
    let lastCount = 0;
    const step = Math.max(11, Math.floor(raw.length / 700));
    for (let n = 1; n <= raw.length; n += step) {
      const draft = parsePartialJson(raw.slice(0, n));
      if (draft === undefined) continue;
      const { spec, warnings } = normalizeBlueprintSpec(blueprintStablePrefix(draft), { partial: true });
      assert.ok(spec);
      assert.deepEqual(warnings, []);
      const shapes = locate(spec);
      assert.ok(shapes.size >= lastCount, 'shapes never disappear');
      lastCount = shapes.size;
      for (const [where, json] of shapes) {
        if (seen.has(where)) assert.equal(json, seen.get(where), `${where} never changes once shown`);
        seen.set(where, json);
        assert.equal(json, finalShapes.get(where), `${where} is exactly the final shape`);
      }
    }
    assert.deepEqual(normalizeBlueprintSpec(parsePartialJson(raw)).spec, final);
  });
}
