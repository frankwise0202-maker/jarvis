// node --test: the SVG sheet renderer (pure node tree), its DOM builder, and layout properties.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildBlueprintTree, renderBlueprint, toDom, treeToSvgString, THEMES } from '../../src/ui/blueprint/svg.js';
import { normalizeBlueprintSpec } from '../../src/lib/blueprint-spec.js';
import { textWidth } from '../../src/lib/blueprint-geom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = (name) => JSON.parse(readFileSync(path.join(ROOT, 'test', 'mock', 'fixtures', `${name}.json`), 'utf8'));
const SAMPLES = ['alternator-part', 'battery-cutaway', 'battery-process', 'camry-assembly'];
const OPTS = { date: '2026-11-19', idPrefix: 'tst' };

const TAGS = new Set(['svg', 'title', 'defs', 'clipPath', 'radialGradient', 'stop', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text']);
const ATTRS = new Set([
  'viewBox', 'width', 'height', 'class', 'role', 'font-family', 'data-bp-version', 'data-theme', 'id', 'cx', 'cy', 'r', 'offset', 'stop-color',
  'x', 'y', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'd', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'clip-path',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'paint-order', 'font-size', 'font-weight',
  'text-anchor', 'letter-spacing', 'data-n', 'data-cx', 'data-cy', 'data-y', 'data-h', 'data-view', 'data-step',
]);

function walk(node, fn, parents = []) {
  fn(node, parents);
  for (const child of node.children || []) walk(child, fn, [...parents, node]);
}

test('every sample renders a complete, finite sheet', () => {
  for (const name of SAMPLES) {
    const { tree, layout, warnings } = buildBlueprintTree(sample(name), OPTS);
    assert.deepEqual(warnings, []);
    assert.equal(tree.tag, 'svg');
    assert.ok(layout.width > 1000 && layout.height > 600, name);
    assert.equal(tree.attrs.viewBox, `0 0 ${Math.round(layout.width * 100) / 100} ${Math.round(layout.height * 100) / 100}`);
    const str = treeToSvgString(tree);
    assert.doesNotMatch(str, /NaN|undefined|Infinity|\[object/, name);
    for (const cls of ['bp-grid', 'bp-frame', 'bp-titleblock']) assert.ok(str.includes(`class="${cls}"`), `${name} ${cls}`);
    assert.ok(str.includes('JARVIS ENGINEERING') && str.includes('SCHEMATIC — VERIFY BEFORE USE') && str.includes('2026-11-19'));
  }
});

test('only allow-listed elements and attributes; no links, scripts, styles or foreignObject', () => {
  for (const name of SAMPLES) {
    const { tree } = buildBlueprintTree(sample(name), OPTS);
    walk(tree, (node) => {
      assert.ok(TAGS.has(node.tag), `${name}: tag ${node.tag}`);
      for (const key of Object.keys(node.attrs || {})) {
        assert.ok(ATTRS.has(key), `${name}: attribute ${key} on ${node.tag}`);
        const v = String(node.attrs[key]);
        assert.doesNotMatch(v, /javascript:|<|>|expression\(/i, `${name}: ${key}=${v.slice(0, 40)}`);
        if (/url\(/.test(v)) assert.match(v, /^url\(#tst-[a-z]\d+\)$/, `${name}: ${key}=${v}`);
      }
    });
  }
});

test('model text is only ever text content (escaped in markup)', () => {
  const evil = '<script>alert(1)</script> & "quotes"';
  const spec = {
    title: evil,
    subject: '<img src=x onerror=alert(1)>',
    sheet: 'part',
    views: [{ title: '<b>view</b>', at: [400, 300], shapes: [{ type: 'text', at: [0, 0], text: evil }, { type: 'circle', at: [0, 0], r: 40 }], callouts: [{ n: 1, at: [0, 0] }] }],
    parts: [{ n: 1, name: evil, material: '</text><script>', note: 'x' }],
    notes: [evil],
    sources: [{ title: evil, url: 'https://example.com/' }],
  };
  const { tree } = buildBlueprintTree(spec, OPTS);
  const str = treeToSvgString(tree);
  assert.doesNotMatch(str, /<script|<img|<b>|<\/text><script/);
  assert.match(str, /&lt;SCRIPT&gt;ALERT\(1\)&lt;\/SCRIPT&gt;|&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  let texts = 0;
  walk(tree, (node) => {
    if (node.text !== undefined && node.text.includes('<script>')) texts++;
  });
  assert.ok(texts >= 3);
});

test('clip-path references resolve and ids are unique', () => {
  for (const name of SAMPLES) {
    const { tree } = buildBlueprintTree(sample(name), OPTS);
    const ids = new Set();
    const refs = [];
    walk(tree, (node) => {
      if (node.attrs.id) {
        assert.ok(!ids.has(node.attrs.id), `${name}: duplicate id ${node.attrs.id}`);
        ids.add(node.attrs.id);
      }
      for (const v of Object.values(node.attrs)) {
        const m = /^url\(#(.+)\)$/.exec(String(v));
        if (m) refs.push(m[1]);
      }
    });
    for (const ref of refs) assert.ok(ids.has(ref), `${name}: missing #${ref}`);
  }
  // Two renders without a prefix never share ids.
  const a = buildBlueprintTree(sample('alternator-part')).tree;
  const b = buildBlueprintTree(sample('alternator-part')).tree;
  const first = (t) => {
    let id = null;
    walk(t, (n) => {
      if (!id && n.attrs.id) id = n.attrs.id;
    });
    return id;
  };
  assert.notEqual(first(a), first(b));
});

test('callout bubbles stay inside the canvas and never overlap', () => {
  for (const name of SAMPLES) {
    const spec = normalizeBlueprintSpec(sample(name)).spec;
    const { layout } = buildBlueprintTree(spec, { ...OPTS, normalized: true });
    const [W, H] = spec.canvas;
    const k = Math.min(2, Math.max(0.6, Math.max(W / 1000, H / 700)));
    const r = 11 * k;
    const fieldX = 30 * Math.max(1, W / 1000) + 16 * Math.max(1, W / 1000);
    for (const c of layout.callouts) {
      assert.ok(c.x - fieldX >= r && c.x - fieldX <= W - r + 0.5, `${name}: bubble ${c.n} x`);
    }
    for (let i = 0; i < layout.callouts.length; i++) {
      for (let j = i + 1; j < layout.callouts.length; j++) {
        const a = layout.callouts[i];
        const b = layout.callouts[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 2 * r - 0.01, `${name}: bubbles ${a.n} and ${b.n} overlap`);
      }
    }
  }
});

test('name labels of a cutaway do not overlap each other', () => {
  const { tree } = buildBlueprintTree(sample('battery-cutaway'), OPTS);
  const boxes = [];
  walk(tree, (node, parents) => {
    if (node.tag !== 'text' || node.attrs.class !== 'bp-name') return;
    const size = Number(node.attrs['font-size']);
    const w = textWidth(node.text, size);
    const x = Number(node.attrs.x);
    const y = Number(node.attrs.y) - size * 0.35;
    const x0 = node.attrs['text-anchor'] === 'end' ? x - w : x;
    boxes.push([x0, y - size * 0.55, x0 + w, y + size * 0.45, node.text]);
  });
  assert.equal(boxes.length, 10);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      assert.ok(!overlap, `${a[4]} / ${b[4]}`);
    }
  }
});

test('table and title-block text fits the sheet', () => {
  for (const name of SAMPLES) {
    const { tree, layout } = buildBlueprintTree(sample(name), OPTS);
    walk(tree, (node, parents) => {
      if (node.tag !== 'text') return;
      if (parents.some((p) => p.attrs.class === 'bp-field' || p.attrs.class === 'bp-steps' || (p.attrs.transform || '').includes('scale'))) return;
      const size = Number(node.attrs['font-size']);
      const w = textWidth(node.text, size, { bold: node.attrs['font-weight'] === 'bold', spacing: Number(node.attrs['letter-spacing'] || 0) });
      const x = Number(node.attrs.x);
      const x0 = node.attrs['text-anchor'] === 'middle' ? x - w / 2 : node.attrs['text-anchor'] === 'end' ? x - w : x;
      assert.ok(x0 >= 0 && x0 + w <= layout.width, `${name}: "${node.text}" leaves the sheet`);
    });
  }
});

test('process sheets lay out every step with arrows between them', () => {
  const { tree } = buildBlueprintTree(sample('battery-process'), OPTS);
  let steps = 0;
  let stepsGroup = null;
  walk(tree, (node) => {
    if (node.attrs.class === 'bp-step') steps++;
    if (node.attrs.class === 'bp-steps') stepsGroup = node;
  });
  assert.equal(steps, 12);
  const arrows = stepsGroup.children.filter((n) => n.tag === 'polygon').length;
  assert.equal(arrows, 11);
});

test('themes change the paper; unknown themes fall back to blueprint', () => {
  const paper = (theme) => buildBlueprintTree(sample('battery-cutaway'), { ...OPTS, theme }).tree.children.find((n) => n.attrs.class === 'bp-paper').attrs.fill;
  assert.equal(paper('blueprint'), THEMES.blueprint.paper);
  assert.equal(paper('paper'), THEMES.paper.paper);
  assert.equal(paper('hud'), THEMES.hud.paper);
  assert.equal(paper('__proto__'), THEMES.blueprint.paper);
});

test('drawing number is stable for a sheet and differs between sheets', () => {
  const dwg = (spec) => /JE-[0-9A-F]{4}-[A-Z]{2}/.exec(treeToSvgString(buildBlueprintTree(spec, OPTS).tree))[0];
  assert.equal(dwg(sample('alternator-part')), dwg(sample('alternator-part')));
  assert.notEqual(dwg(sample('alternator-part')), dwg(sample('battery-cutaway')));
  assert.match(dwg(sample('battery-process')), /-PR$/);
});

test('streaming previews and empty input still render a sheet', () => {
  const partial = buildBlueprintTree({ title: 'Altern', views: [{ at: [300, 300], shapes: [{ type: 'circle', at: [0, 0] }] }] }, { ...OPTS, partial: true });
  assert.equal(partial.tree.tag, 'svg');
  const empty = treeToSvgString(buildBlueprintTree(null, OPTS).tree);
  assert.match(empty, /Nothing to draw yet/);
});

// A minimal fake DOM: records the calls the renderer makes; innerHTML and friends throw.
function fakeDocument() {
  const calls = { createElementNS: 0, setAttribute: 0, textContent: 0, appendChild: 0 };
  class El {
    constructor(ns, tag) {
      this.ns = ns;
      this.tagName = tag;
      this.attributes = {};
      this.childNodes = [];
      this._text = '';
    }
    setAttribute(k, v) {
      calls.setAttribute++;
      assert.equal(typeof v, 'string');
      this.attributes[k] = v;
    }
    appendChild(c) {
      calls.appendChild++;
      this.childNodes.push(c);
      return c;
    }
    set textContent(v) {
      calls.textContent++;
      this._text = v;
    }
    get textContent() {
      return this._text;
    }
    set innerHTML(v) {
      throw new Error('innerHTML used');
    }
    insertAdjacentHTML() {
      throw new Error('insertAdjacentHTML used');
    }
  }
  return {
    calls,
    createElementNS(ns, tag) {
      calls.createElementNS++;
      assert.equal(ns, 'http://www.w3.org/2000/svg');
      return new El(ns, tag);
    },
    createElement() {
      throw new Error('HTML elements are not expected in an SVG sheet');
    },
  };
}

test('DOM is built only with createElementNS, setAttribute and textContent', () => {
  const doc = fakeDocument();
  const svg = renderBlueprint(sample('camry-assembly'), { ...OPTS, document: doc });
  assert.equal(svg.tagName, 'svg');
  assert.ok(doc.calls.createElementNS > 500);
  assert.ok(doc.calls.textContent > 100);
  assert.ok(svg.attributes['data-bp-version'] === '1');
  // toDom on a hand-made node keeps text as text.
  const el = toDom({ tag: 'text', attrs: { x: 1.234567 }, text: '<b>x</b>' }, doc);
  assert.equal(el.attributes.x, '1.23');
  assert.equal(el.textContent, '<b>x</b>');
});
