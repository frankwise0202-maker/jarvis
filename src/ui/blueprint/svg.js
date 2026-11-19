// Blueprint sheet renderer: a normalized draw_blueprint spec -> a complete engineering sheet as SVG.
//
//   renderBlueprint(spec, { theme, date, sheetNo, document }) -> SVGSVGElement
//   buildBlueprintTree(spec, opts) -> { tree, layout, spec, warnings }   (pure: no DOM)
//   treeToSvgString(tree) -> string                                      (pure: tests, Node export)
//   THEMES: { blueprint, paper, hud }
//
// The sheet: paper with a fine and major grid, a border with zone marks, the drawing field (the
// spec's canvas: views, hatching, dimensions, auto-placed callout bubbles, view captions), an
// optional process flow (numbered step cards with pictograms and arrows), and a right column with
// notes, sources, the parts list and the title block. Layout is computed here (text widths from
// Helvetica/Arial metrics), so the result is identical in the browser, in exports and in tests.
//
// Safety: the DOM is built only with createElementNS + setAttribute + textContent. Attribute
// values are numbers formatted here, fixed strings, theme colors or the validator's canonical
// path data; every piece of model text goes through textContent. No href, no foreignObject, no
// style attributes, no innerHTML. Element ids (clip paths, the paper gradient) carry a
// per-render prefix, so several sheets can share one document.

import { normalizeBlueprintSpec, STEP_BOX, viewContentBox } from '../../lib/blueprint-spec.js';
import {
  fmt,
  clamp,
  DEG,
  textWidth,
  wrapText,
  ellipsize,
  fitText,
  shapeBounds,
  shapeBoundsWithRepeats,
  shapesBounds,
  unionBox,
  padBox,
  translateBox,
  boxesOverlap,
  repeatTransforms,
  arcSamplePoints,
  hash32,
  textBox,
} from '../../lib/blueprint-geom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const BLUEPRINT_FONT = "Helvetica, Arial, 'Liberation Sans', 'Nimbus Sans', FreeSans, sans-serif";

export const THEMES = Object.freeze({
  blueprint: Object.freeze({
    paper: '#0f3c78',
    paperEdge: '#0a2c5c',
    gridMinor: 'rgba(168, 206, 255, 0.10)',
    gridMajor: 'rgba(168, 206, 255, 0.22)',
    ink: '#eef5ff',
    soft: 'rgba(238, 245, 255, 0.74)',
    faint: 'rgba(238, 245, 255, 0.45)',
    center: 'rgba(214, 232, 255, 0.82)',
    accent: '#ffd36e',
    tint: 'rgba(238, 245, 255, 0.14)',
    panel: '#0e376f',
    panelHead: 'rgba(238, 245, 255, 0.10)',
    halo: '#0f3c78',
  }),
  paper: Object.freeze({
    paper: '#fbfcfe',
    paperEdge: '#eef2f8',
    gridMinor: 'rgba(30, 90, 170, 0.07)',
    gridMajor: 'rgba(30, 90, 170, 0.15)',
    ink: '#13243d',
    soft: 'rgba(19, 36, 61, 0.74)',
    faint: 'rgba(19, 36, 61, 0.45)',
    center: 'rgba(19, 36, 61, 0.8)',
    accent: '#c2410c',
    tint: 'rgba(19, 36, 61, 0.09)',
    panel: '#ffffff',
    panelHead: 'rgba(19, 36, 61, 0.06)',
    halo: '#fbfcfe',
  }),
  hud: Object.freeze({
    paper: '#06101c',
    paperEdge: '#02070d',
    gridMinor: 'rgba(62, 224, 255, 0.06)',
    gridMajor: 'rgba(62, 224, 255, 0.13)',
    ink: '#c9f6ff',
    soft: 'rgba(201, 246, 255, 0.72)',
    faint: 'rgba(201, 246, 255, 0.42)',
    center: 'rgba(138, 243, 255, 0.8)',
    accent: '#3ee0ff',
    tint: 'rgba(62, 224, 255, 0.10)',
    panel: '#07131f',
    panelHead: 'rgba(62, 224, 255, 0.08)',
    halo: '#06101c',
  }),
});

const SHEET_NAMES = { part: 'PART DRAWING', cutaway: 'CUTAWAY VIEW', exploded: 'EXPLODED VIEW', process: 'PROCESS SHEET', assembly: 'ASSEMBLY DRAWING' };
const SHEET_CODES = { part: 'PD', cutaway: 'CA', exploded: 'EX', process: 'PR', assembly: 'AS' };

let renderCount = 0;

// ---------------------------------------------------------------------------------------------
// Public API

/** Render a draw_blueprint spec (raw or normalized) as an SVG element. */
export function renderBlueprint(input, opts = {}) {
  const { tree } = buildBlueprintTree(input, opts);
  const doc = opts.document || globalThis.document;
  if (!doc || typeof doc.createElementNS !== 'function') throw new TypeError('renderBlueprint needs a document');
  return toDom(tree, doc);
}

/**
 * The sheet as a tree of plain nodes { tag, attrs, text?, children? } plus layout facts:
 * { width, height, callouts: [{ n, x, y }], parts: [{ n, y, h }] }.
 * opts: theme ('blueprint' | 'paper' | 'hud'), date (Date | 'YYYY-MM-DD'), sheetNo ('1 / 1'),
 * normalized (skip validation), partial (streaming preview), idPrefix.
 */
export function buildBlueprintTree(input, opts = {}) {
  let spec = input;
  let warnings = [];
  if (!opts.normalized) ({ spec, warnings } = normalizeBlueprintSpec(input, { partial: !!opts.partial }));
  if (!spec) spec = emptySpec();
  const theme = Object.prototype.hasOwnProperty.call(THEMES, opts.theme) ? opts.theme : 'blueprint';
  const prefix = /^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(opts.idPrefix || '') ? opts.idPrefix : `bp${(++renderCount).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const c = createContext(spec, THEMES[theme], prefix, opts);
  const tree = drawSheet(c);
  tree.attrs['data-theme'] = theme;
  return { tree, layout: c.layout, spec, warnings };
}

/** Build DOM nodes for a tree (SVG namespace, setAttribute and textContent only). */
export function toDom(node, doc) {
  const el = doc.createElementNS(SVG_NS, node.tag);
  for (const key of Object.keys(node.attrs || {})) {
    const v = node.attrs[key];
    if (v === undefined || v === null || v === false) continue;
    el.setAttribute(key, typeof v === 'number' ? fmt(v) : String(v));
  }
  if (node.text !== undefined) el.textContent = node.text;
  if (node.children) for (const child of node.children) if (child) el.appendChild(toDom(child, doc));
  return el;
}

/** Serialize a tree to SVG markup (escaped). Used by tests and non-DOM exports. */
export function treeToSvgString(node) {
  const attrs = Object.keys(node.attrs || {})
    .filter((k) => node.attrs[k] !== undefined && node.attrs[k] !== null && node.attrs[k] !== false)
    .map((k) => ` ${k}="${escapeXml(typeof node.attrs[k] === 'number' ? fmt(node.attrs[k]) : String(node.attrs[k]))}"`)
    .join('');
  const xmlns = node.tag === 'svg' ? ` xmlns="${SVG_NS}"` : '';
  const inner = (node.text !== undefined ? escapeXml(node.text) : '') + (node.children || []).filter(Boolean).map(treeToSvgString).join('');
  return inner ? `<${node.tag}${xmlns}${attrs}>${inner}</${node.tag}>` : `<${node.tag}${xmlns}${attrs}/>`;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// ---------------------------------------------------------------------------------------------
// Context and node helpers

function node(tag, attrs = {}, children, text) {
  const out = { tag, attrs };
  if (children && children.length) out.children = children.filter(Boolean);
  if (text !== undefined) out.text = String(text);
  return out;
}

function g(attrs, children) {
  return node('g', attrs, children);
}

function emptySpec() {
  return { v: 1, title: 'Blueprint', subject: '', sheet: 'part', scale: 'NTS', canvas: [1000, 700], names: false, views: [], shapes: [], callouts: [], dimensions: [], parts: [], steps: [], notes: ['Nothing to draw yet.'], sources: [] };
}

function createContext(spec, T, prefix, opts) {
  const [W, H] = spec.canvas;
  return {
    spec,
    T,
    prefix,
    opts,
    k: clamp(Math.max(W / 1000, H / 700), 0.6, 2), // drawing weights and sizes
    kt: clamp(W / 1000, 1, 2), // sheet furniture (tables, frame, title block)
    ids: 0,
    defs: [],
    layout: { width: 0, height: 0, callouts: [], parts: [] },
  };
}

function nextId(c, kind) {
  c.ids += 1;
  return `${c.prefix}-${kind}${c.ids}`;
}

/** Text node. Text is vertically centred on y (baseline at y + 0.35 size). */
function label(c, x, y, str, { size = 12, anchor = 'start', bold = false, fill, spacing = 0, rot = 0, halo = false, opacity, cls } = {}) {
  const attrs = {
    x,
    y: y + size * 0.35,
    'font-size': size,
    fill: fill || c.T.ink,
  };
  if (anchor !== 'start') attrs['text-anchor'] = anchor;
  if (bold) attrs['font-weight'] = 'bold';
  if (spacing) attrs['letter-spacing'] = spacing;
  if (rot) attrs.transform = `rotate(${fmt(rot)} ${fmt(x)} ${fmt(y)})`;
  if (opacity !== undefined) attrs['fill-opacity'] = opacity;
  if (halo) {
    attrs.stroke = c.T.halo;
    attrs['stroke-width'] = Math.max(2.5, size * 0.28);
    attrs['stroke-linejoin'] = 'round';
    attrs['paint-order'] = 'stroke';
  }
  if (cls) attrs.class = cls;
  return node('text', attrs, null, str);
}

function strokeFor(c, style) {
  const { T, k } = c;
  const base = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  switch (style) {
    case 'thin':
      return { ...base, stroke: T.ink, 'stroke-width': 1.05 * k, 'stroke-opacity': 0.92 };
    case 'hidden':
      return { ...base, stroke: T.ink, 'stroke-width': 1.15 * k, 'stroke-dasharray': `${fmt(6 * k)} ${fmt(4 * k)}`, 'stroke-linecap': 'butt', 'stroke-opacity': 0.82 };
    case 'center':
      return { ...base, stroke: T.center, 'stroke-width': 0.85 * k, 'stroke-dasharray': `${fmt(20 * k)} ${fmt(4 * k)} ${fmt(3 * k)} ${fmt(4 * k)}`, 'stroke-linecap': 'butt' };
    case 'cut':
      return { ...base, stroke: T.accent, 'stroke-width': 1.3 * k, 'stroke-dasharray': `${fmt(22 * k)} ${fmt(5 * k)} ${fmt(4 * k)} ${fmt(5 * k)}`, 'stroke-linecap': 'butt' };
    case 'fill':
      return { ...base, stroke: T.ink, 'stroke-width': 1.05 * k, fill: T.tint };
    case 'accent':
      return { ...base, stroke: T.accent, 'stroke-width': 2.3 * k };
    case 'thick':
    default:
      return { ...base, stroke: T.ink, 'stroke-width': 2.1 * k };
  }
}

function pts(points) {
  return points.map((p) => `${fmt(p[0])},${fmt(p[1])}`).join(' ');
}

function arrowHead(c, tip, dir, { len, width, fill } = {}) {
  const L = len ?? 9 * c.k;
  const Wd = width ?? 3.4 * c.k;
  const m = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / m;
  const uy = dir[1] / m;
  const bx = tip[0] - ux * L;
  const by = tip[1] - uy * L;
  return node('polygon', { points: pts([tip, [bx - uy * Wd, by + ux * Wd], [bx + uy * Wd, by - ux * Wd]]), fill: fill || c.T.ink, stroke: 'none' });
}

// ---------------------------------------------------------------------------------------------
// Shapes

/** The geometry element of a closed or open shape (no paint), used for outlines and clip paths. */
function geometry(s) {
  switch (s.type) {
    case 'line':
      return node('line', { x1: s.from[0], y1: s.from[1], x2: s.to[0], y2: s.to[1] });
    case 'rect': {
      const a = { x: s.at[0], y: s.at[1], width: s.size[0], height: s.size[1] };
      if (s.r) {
        a.rx = s.r;
        a.ry = s.r;
      }
      if (s.rot) a.transform = `rotate(${fmt(s.rot)} ${fmt(s.at[0] + s.size[0] / 2)} ${fmt(s.at[1] + s.size[1] / 2)})`;
      return node('rect', a);
    }
    case 'circle':
      if (s.r2) return node('path', { d: ringPath(s.at, s.r, s.r2), 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' });
      return node('circle', { cx: s.at[0], cy: s.at[1], r: s.r });
    case 'ellipse': {
      const a = { cx: s.at[0], cy: s.at[1], rx: s.rx, ry: s.ry };
      if (s.rot) a.transform = `rotate(${fmt(s.rot)} ${fmt(s.at[0])} ${fmt(s.at[1])})`;
      return node('ellipse', a);
    }
    case 'arc':
      return node('path', { d: arcPath(s) });
    case 'polyline':
      return node('polyline', { points: pts(s.points) });
    case 'polygon':
    case 'hatch':
      return node('polygon', { points: pts(s.points) });
    case 'path':
      return node('path', { d: s.d });
    default:
      return null;
  }
}

function ringPath(at, r, r2) {
  const [x, y] = at;
  const circle = (rad) => `M${fmt(x - rad)} ${fmt(y)}a${fmt(rad)} ${fmt(rad)} 0 1 0 ${fmt(2 * rad)} 0a${fmt(rad)} ${fmt(rad)} 0 1 0 ${fmt(-2 * rad)} 0z`;
  return `${circle(r)}${circle(r2)}`;
}

function arcPath(s) {
  const sweep = s.to - s.from;
  if (sweep >= 360) {
    const r = s.r;
    return `M${fmt(s.at[0] - r)} ${fmt(s.at[1])}a${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(-2 * r)} 0`;
  }
  const a0 = s.from * DEG;
  const a1 = s.to * DEG;
  const x0 = s.at[0] + s.r * Math.cos(a0);
  const y0 = s.at[1] + s.r * Math.sin(a0);
  const x1 = s.at[0] + s.r * Math.cos(a1);
  const y1 = s.at[1] + s.r * Math.sin(a1);
  return `M${fmt(x0)} ${fmt(y0)}A${fmt(s.r)} ${fmt(s.r)} 0 ${sweep > 180 ? 1 : 0} 1 ${fmt(x1)} ${fmt(y1)}`;
}

/** Hatch fill for a box: parallel lines, crossed lines, dots or solid (path data or null). */
function hatchPath(box, hatch, k) {
  const sp = (hatch.spacing || (hatch.pattern === 'dots' ? 6.5 : 7)) * k;
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const R = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + sp;
  if (hatch.pattern === 'dots') {
    let d = '';
    const dy = sp * 0.866;
    let row = 0;
    for (let y = box[1] + dy / 2; y <= box[3]; y += dy, row++) {
      for (let x = box[0] + (row % 2 ? sp / 2 : 0) + sp / 4; x <= box[2]; x += sp) d += `M${fmt(x)} ${fmt(y)}h0`;
    }
    return d;
  }
  const family = (deg) => {
    const a = deg * DEG;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const n = Math.ceil(R / sp);
    let d = '';
    for (let i = -n; i <= n; i++) {
      const ox = cx - dy * i * sp;
      const oy = cy + dx * i * sp;
      d += `M${fmt(ox - dx * R)} ${fmt(oy - dy * R)}L${fmt(ox + dx * R)} ${fmt(oy + dy * R)}`;
    }
    return d;
  };
  if (hatch.pattern === 'cross') return family(hatch.angle) + family(hatch.angle + 90);
  return family(hatch.angle);
}

/** Nodes for one shape copy (no repeat): hatch (clipped) first, then the outline. */
function shapeNodes(c, s, clipId) {
  const { T, k } = c;
  const out = [];
  if (s.hatch && clipId) {
    const box = shapeBounds(s);
    if (box) {
      if (s.hatch.pattern === 'solid') {
        out.push(g({ 'clip-path': `url(#${clipId})` }, [node('rect', { x: box[0] - 1, y: box[1] - 1, width: box[2] - box[0] + 2, height: box[3] - box[1] + 2, fill: T.ink, 'fill-opacity': 0.88 })]));
      } else {
        const d = hatchPath(box, s.hatch, k);
        if (d) {
          const dots = s.hatch.pattern === 'dots';
          out.push(
            g({ 'clip-path': `url(#${clipId})` }, [
              node('path', dots ? { d, stroke: T.ink, 'stroke-width': 1.9 * k, 'stroke-linecap': 'round', fill: 'none', 'stroke-opacity': 0.7 } : { d, stroke: T.ink, 'stroke-width': 0.75 * k, fill: 'none', 'stroke-opacity': 0.68 }),
            ]),
          );
        }
      }
    }
  }
  switch (s.type) {
    case 'hatch':
      return out; // a hatch region has no outline
    case 'text': {
      const st = s.style;
      return [
        label(c, s.at[0], s.at[1], s.text, {
          size: s.size,
          anchor: s.anchor,
          bold: st === 'thick',
          fill: st === 'accent' ? T.accent : st === 'thin' || st === 'thick' ? T.ink : T.soft,
          rot: s.rot || 0,
          halo: true,
        }),
      ];
    }
    case 'arrow': {
      const paint = strokeFor(c, s.style);
      const dir = [s.to[0] - s.from[0], s.to[1] - s.from[1]];
      const len = Math.hypot(dir[0], dir[1]);
      const head = Math.min(10 * k, len / 3);
      const ux = dir[0] / len;
      const uy = dir[1] / len;
      const from = s.both ? [s.from[0] + ux * head * 0.8, s.from[1] + uy * head * 0.8] : s.from;
      const to = [s.to[0] - ux * head * 0.8, s.to[1] - uy * head * 0.8];
      const color = paint.stroke;
      out.push(node('line', { x1: from[0], y1: from[1], x2: to[0], y2: to[1], ...paint }));
      out.push(arrowHead(c, s.to, dir, { len: head, width: head * 0.38, fill: color }));
      if (s.both) out.push(arrowHead(c, s.from, [-dir[0], -dir[1]], { len: head, width: head * 0.38, fill: color }));
      return out;
    }
    case 'cutline':
      return cutlineNodes(c, s);
    default: {
      const geo = geometry(s);
      if (!geo) return out;
      Object.assign(geo.attrs, strokeFor(c, s.style));
      if (s.type === 'circle' && s.r2) {
        // A ring: outline both circles (the evenodd path strokes both).
        geo.attrs['fill-rule'] = 'evenodd';
      }
      out.push(geo);
      return out;
    }
  }
}

function cutlineNodes(c, s) {
  const { T, k } = c;
  const dx = s.to[0] - s.from[0];
  const dy = s.to[1] - s.from[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const look = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[s.look];
  const end = Math.min(16 * k, len / 4);
  const out = [
    node('line', { x1: s.from[0], y1: s.from[1], x2: s.to[0], y2: s.to[1], ...strokeFor(c, 'cut') }),
    node('line', { x1: s.from[0], y1: s.from[1], x2: s.from[0] + ux * end, y2: s.from[1] + uy * end, stroke: T.accent, 'stroke-width': 2.6 * k, 'stroke-linecap': 'butt' }),
    node('line', { x1: s.to[0], y1: s.to[1], x2: s.to[0] - ux * end, y2: s.to[1] - uy * end, stroke: T.accent, 'stroke-width': 2.6 * k, 'stroke-linecap': 'butt' }),
  ];
  for (const p of [s.from, s.to]) {
    const shaft = 20 * k;
    const tip = [p[0] + look[0] * shaft, p[1] + look[1] * shaft];
    out.push(node('line', { x1: p[0], y1: p[1], x2: tip[0] - look[0] * 6 * k, y2: tip[1] - look[1] * 6 * k, stroke: T.accent, 'stroke-width': 1.6 * k }));
    out.push(arrowHead(c, tip, look, { len: 9 * k, width: 3.8 * k, fill: T.accent }));
    // The letter sits beside the arrow, on the outer side of the line end.
    const outward = p === s.from ? [-ux, -uy] : [ux, uy];
    const lx = p[0] + look[0] * shaft * 0.55 + outward[0] * 13 * k;
    const ly = p[1] + look[1] * shaft * 0.55 + outward[1] * 13 * k;
    out.push(label(c, lx, ly, s.label, { size: 15 * k, anchor: 'middle', bold: true, fill: T.accent, halo: true }));
  }
  return out;
}

/** All nodes of a list of shapes (repeats expanded with transforms; hatch clip paths in defs). */
function shapeListNodes(c, shapes) {
  const out = [];
  for (const s of shapes) {
    let clipId = null;
    if (s.hatch) {
      const geo = geometry(s);
      if (geo) {
        clipId = nextId(c, 'h');
        if (geo.attrs['fill-rule']) geo.attrs['clip-rule'] = 'evenodd';
        c.defs.push(node('clipPath', { id: clipId }, [geo]));
      }
    }
    const nodes = shapeNodes(c, s, clipId);
    for (const t of repeatTransforms(s.repeat)) {
      if (!t) out.push(...nodes);
      else if (t.rotate !== undefined) out.push(g({ transform: `rotate(${fmt(t.rotate)} ${fmt(t.about[0])} ${fmt(t.about[1])})` }, cloneAll(nodes)));
      else out.push(g({ transform: `translate(${fmt(t.dx)} ${fmt(t.dy)})` }, cloneAll(nodes)));
    }
  }
  return out;
}

function cloneAll(nodes) {
  return nodes.map(cloneNode);
}

function cloneNode(n) {
  const out = { tag: n.tag, attrs: { ...n.attrs } };
  if (n.text !== undefined) out.text = n.text;
  if (n.children) out.children = n.children.map(cloneNode);
  return out;
}

/** Keep un-rotated, un-repeated text shapes of a view inside the canvas (shifts them). */
function clampTexts(shapes, offset, W, H) {
  return shapes.map((s) => {
    if (s.type !== 'text' || s.rot || s.repeat) return s;
    const box = translateBox(textBox(s.at, s.text, s.size, s.anchor, 0, s.style === 'thick'), offset[0], offset[1]);
    let dx = 0;
    let dy = 0;
    if (box[0] < 4) dx = 4 - box[0];
    else if (box[2] > W - 4) dx = W - 4 - box[2];
    if (box[1] < 2) dy = 2 - box[1];
    else if (box[3] > H - 2) dy = H - 2 - box[3];
    return dx || dy ? { ...s, at: [s.at[0] + dx, s.at[1] + dy] } : s;
  });
}

// ---------------------------------------------------------------------------------------------
// Dimensions

function dimensionGeometry(c, d) {
  const { k } = c;
  const o = d.offset;
  let q1;
  let q2;
  if (d.axis === 'x') {
    const yLine = o >= 0 ? Math.min(d.from[1], d.to[1]) - o : Math.max(d.from[1], d.to[1]) - o;
    q1 = [d.from[0], yLine];
    q2 = [d.to[0], yLine];
  } else if (d.axis === 'y') {
    const xLine = o >= 0 ? Math.max(d.from[0], d.to[0]) + o : Math.min(d.from[0], d.to[0]) + o;
    q1 = [xLine, d.from[1]];
    q2 = [xLine, d.to[1]];
  } else {
    const ddx = d.to[0] - d.from[0];
    const ddy = d.to[1] - d.from[1];
    const len = Math.hypot(ddx, ddy);
    let nx = ddy / len;
    let ny = -ddx / len;
    if (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }
    q1 = [d.from[0] + nx * o, d.from[1] + ny * o];
    q2 = [d.to[0] + nx * o, d.to[1] + ny * o];
  }
  const dx = q2[0] - q1[0];
  const dy = q2[1] - q1[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  let ang = Math.atan2(uy, ux) / DEG;
  if (ang > 90) ang -= 180;
  else if (ang <= -90) ang += 180;
  if (ang === 90) ang = -90;
  const size = 12 * k;
  const tw = textWidth(d.text, size);
  const upx = Math.sin(ang * DEG);
  const upy = -Math.cos(ang * DEG);
  const mid = [(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2];
  const tc = [mid[0] + upx * (size * 0.5 + 3 * k), mid[1] + upy * (size * 0.5 + 3 * k)];
  const box = unionBox(unionBox([Math.min(d.from[0], d.to[0], q1[0], q2[0]), Math.min(d.from[1], d.to[1], q1[1], q2[1]), Math.max(d.from[0], d.to[0], q1[0], q2[0]), Math.max(d.from[1], d.to[1], q1[1], q2[1])], null), textBox(tc, d.text, size, 'middle', ang));
  return { q1, q2, ux, uy, L, ang, size, tw, tc, box };
}

function dimensionNodes(c, d) {
  const { T, k } = c;
  const geo = dimensionGeometry(c, d);
  const { q1, q2, ux, uy, L, ang, size, tc } = geo;
  const thin = { stroke: T.ink, 'stroke-width': 0.85 * k, 'stroke-opacity': 0.9 };
  const out = [];
  const gap = 3 * k;
  const over = 5 * k;
  for (const [p, q] of [[d.from, q1], [d.to, q2]]) {
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const el = Math.hypot(ex, ey);
    if (el <= gap + 1) continue;
    out.push(node('line', { x1: p[0] + (ex / el) * gap, y1: p[1] + (ey / el) * gap, x2: q[0] + (ex / el) * over, y2: q[1] + (ey / el) * over, ...thin }));
  }
  const head = 9 * k;
  const inside = L >= head * 2 + 8 * k;
  if (inside) {
    out.push(node('line', { x1: q1[0], y1: q1[1], x2: q2[0], y2: q2[1], ...thin }));
    out.push(arrowHead(c, q1, [-ux, -uy], { len: head, width: 3.2 * k }));
    out.push(arrowHead(c, q2, [ux, uy], { len: head, width: 3.2 * k }));
  } else {
    // Short span: arrows outside, pointing in.
    const ext = head + 8 * k;
    out.push(node('line', { x1: q1[0] - ux * ext, y1: q1[1] - uy * ext, x2: q2[0] + ux * ext, y2: q2[1] + uy * ext, ...thin }));
    out.push(arrowHead(c, q1, [ux, uy], { len: head, width: 3.2 * k }));
    out.push(arrowHead(c, q2, [-ux, -uy], { len: head, width: 3.2 * k }));
  }
  out.push(label(c, tc[0], tc[1], d.text, { size, anchor: 'middle', rot: ang, halo: true, bold: false }));
  return g({ class: 'bp-dim' }, out);
}

// ---------------------------------------------------------------------------------------------
// Callouts: bubbles placed around each view (ring), or in label columns when names are shown.

function placeCallouts(c, groups, W, H) {
  const { k, spec } = c;
  const r = 11 * k;
  const nameSize = 12 * k;
  const names = spec.names;
  const partName = new Map(spec.parts.map((p) => [p.n, p.name]));
  const placed = [];
  const obstacles = groups.map((gr) => gr.box).filter(Boolean);

  for (const gr of groups) {
    const box = gr.box || [W / 2 - 1, H / 2 - 1, W / 2 + 1, H / 2 + 1];
    const auto = [];
    for (const co of gr.callouts) {
      const item = { n: co.n, at: co.at, explicit: !!co.label, x: 0, y: 0, name: names ? partName.get(co.n) || '' : '', side: 'right' };
      if (co.label) {
        item.x = co.label[0];
        item.y = co.label[1];
        item.side = co.label[0] < co.at[0] ? 'left' : 'right';
      } else auto.push(item);
      placed.push(item);
    }
    if (!auto.length) continue;
    if (names) placeColumns(auto, box, gr.content || box, gr.box, obstacles, W, H, r, nameSize, k);
    else placeRing(auto, box, gr.content || box, W, H, r, k);
  }
  // Explicit bubbles may still collide with others: push overlapping pairs apart.
  for (let iter = 0; iter < 30; iter++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = 2 * r + 3 * k;
        if (dist >= min) continue;
        const ux = dist ? dx / dist : 1;
        const uy = dist ? dy / dist : 0;
        const push = (min - dist) / 2 + 0.5;
        if (!a.explicit || b.explicit) {
          a.x -= ux * push;
          a.y -= uy * push;
        }
        if (!b.explicit || a.explicit) {
          b.x += ux * push;
          b.y += uy * push;
        }
        moved = true;
      }
    }
    for (const p of placed) {
      p.x = clamp(p.x, r + 3, W - r - 3);
      p.y = clamp(p.y, r + 3, H - r - 3);
    }
    if (!moved) break;
  }
  // Name text: on the side away from the anchor, flipped when it would leave the canvas.
  for (const p of placed) {
    if (!p.name) continue;
    const room = p.side === 'left' ? p.x - r - 6 * k - 4 : W - (p.x + r + 6 * k) - 4;
    const other = p.side === 'left' ? W - (p.x + r + 6 * k) - 4 : p.x - r - 6 * k - 4;
    const need = textWidth(p.name, nameSize);
    if (need > room && other > room) p.side = p.side === 'left' ? 'right' : 'left';
    const avail = p.side === 'left' ? p.x - r - 6 * k - 4 : W - (p.x + r + 6 * k) - 4;
    p.text = ellipsize(p.name, Math.max(20, avail), nameSize);
  }
  return placed;
}

/**
 * Bubbles around the view, spread so they never overlap. Wide views (a car, a process line) get
 * bubbles above and below each anchor; tall views get them beside it; others use a ring.
 */
function placeRing(items, box, content, W, H, r, k) {
  const minGap = 2 * r + 7 * k;
  const cw = Math.max(1, content[2] - content[0]);
  const ch = Math.max(1, content[3] - content[1]);
  const aspect = cw / ch;
  if (aspect >= 2 || aspect <= 0.5) return placeSides(items, box, content, W, H, r, k, aspect >= 2);
  for (let attempt = 0; attempt < 4; attempt++) {
    const pad = (30 + attempt * 18) * k + r;
    const ring = [clamp(box[0] - pad, r + 4, W - r - 4), clamp(box[1] - pad, r + 4, H - r - 4), clamp(box[2] + pad, r + 4, W - r - 4), clamp(box[3] + pad, r + 4, H - r - 4)];
    const rw = Math.max(1, ring[2] - ring[0]);
    const rh = Math.max(1, ring[3] - ring[1]);
    const P = 2 * (rw + rh);
    // Rays start at the centre of the drawing itself (not of its dimensions), so each bubble sits
    // straight out from its anchor.
    const cx = (content[0] + content[2]) / 2;
    const cy = (content[1] + content[3]) / 2;
    // Perimeter parameter, clockwise from the top-left corner.
    const toS = (x, y) => {
      let dx = x - cx;
      let dy = y - cy;
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = -1;
      // Where the ray from (cx, cy) through the anchor leaves the ring.
      const tx = dx > 0 ? (ring[2] - cx) / dx : dx < 0 ? (ring[0] - cx) / dx : Infinity;
      const ty = dy > 0 ? (ring[3] - cy) / dy : dy < 0 ? (ring[1] - cy) / dy : Infinity;
      const t = Math.max(0, Math.min(tx, ty));
      const px = clamp(cx + dx * t, ring[0], ring[2]);
      const py = clamp(cy + dy * t, ring[1], ring[3]);
      const eps = 1e-6;
      if (Math.abs(py - ring[1]) < eps + 1e-3 && px < ring[2]) return px - ring[0];
      if (Math.abs(px - ring[2]) < eps + 1e-3 && py < ring[3]) return rw + (py - ring[1]);
      if (Math.abs(py - ring[3]) < eps + 1e-3 && px > ring[0]) return rw + rh + (ring[2] - px);
      return 2 * rw + rh + (ring[3] - py);
    };
    const fromS = (s) => {
      s = ((s % P) + P) % P;
      if (s < rw) return [ring[0] + s, ring[1]];
      if (s < rw + rh) return [ring[2], ring[1] + (s - rw)];
      if (s < 2 * rw + rh) return [ring[2] - (s - rw - rh), ring[3]];
      return [ring[0], ring[3] - (s - 2 * rw - rh)];
    };
    const list = items.map((it) => ({ it, s: toS(it.at[0], it.at[1]) })).sort((a, b) => a.s - b.s);
    if (list.length * minGap > P && attempt < 3) continue;
    for (let iter = 0; iter < 200; iter++) {
      let worst = 0;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        const b = list[(i + 1) % list.length];
        if (list.length < 2) break;
        let gap = b.s - a.s;
        if (i === list.length - 1) gap += P;
        if (gap < minGap) {
          const push = (minGap - gap) / 2;
          a.s -= push;
          b.s += push;
          worst = Math.max(worst, minGap - gap);
        }
      }
      if (worst < 0.5) break;
    }
    for (const { it, s } of list) [it.x, it.y] = fromS(s);
    // Corners read badly: nudge bubbles off exact corners toward the anchor side.
    return;
  }
}

/** Wide views: each bubble straight above or below its anchor (tall views: beside it). */
function placeSides(items, box, content, W, H, r, k, wide) {
  const pad = 30 * k + r;
  const minGap = 2 * r + 7 * k;
  const cx = (content[0] + content[2]) / 2;
  const cy = (content[1] + content[3]) / 2;
  const hw = (content[2] - content[0]) / 2;
  const hh = (content[3] - content[1]) / 2;
  const edge = {
    top: clamp(box[1] - pad, r + 4, H - r - 4),
    bottom: clamp(box[3] + pad, r + 4, H - r - 4),
    left: clamp(box[0] - pad, r + 4, W - r - 4),
    right: clamp(box[2] + pad, r + 4, W - r - 4),
  };
  const sides = { top: [], bottom: [], left: [], right: [] };
  for (const it of items) {
    const u = (it.at[0] - cx) / hw;
    const v = (it.at[1] - cy) / hh;
    let side;
    if (wide) side = Math.abs(u) > 0.94 ? (u < 0 ? 'left' : 'right') : v < 0 ? 'top' : 'bottom';
    else side = Math.abs(v) > 0.94 ? (v < 0 ? 'top' : 'bottom') : u < 0 ? 'left' : 'right';
    sides[side].push(it);
  }
  for (const side of Object.keys(sides)) {
    const list = sides[side];
    if (!list.length) continue;
    const horizontal = side === 'top' || side === 'bottom';
    const lo = horizontal ? Math.max(r + 4, box[0] - pad) : Math.max(r + 4, box[1] - pad);
    const hi = horizontal ? Math.min(W - r - 4, box[2] + pad) : Math.min(H - r - 4, box[3] + pad);
    list.sort((a, b) => (horizontal ? a.at[0] - b.at[0] : a.at[1] - b.at[1]));
    const pos = list.map((it) => clamp(horizontal ? it.at[0] : it.at[1], lo, hi));
    spread1d(pos, minGap, lo, hi);
    list.forEach((it, i) => {
      if (horizontal) {
        it.x = pos[i];
        it.y = edge[side];
      } else {
        it.x = edge[side];
        it.y = pos[i];
      }
    });
  }
}

/** Spread sorted positions so neighbours are at least `gap` apart, within [lo, hi]. */
function spread1d(pos, gap, lo, hi) {
  for (let iter = 0; iter < 100; iter++) {
    let moved = false;
    for (let i = 1; i < pos.length; i++) {
      const d = pos[i] - pos[i - 1];
      if (d < gap - 0.01) {
        const push = (gap - d) / 2;
        pos[i - 1] -= push;
        pos[i] += push;
        moved = true;
      }
    }
    for (let i = 0; i < pos.length; i++) pos[i] = clamp(pos[i], lo, hi);
    if (!moved) break;
  }
}

/** Name labels in a column on each side of the view, ordered by anchor height. */
function placeColumns(items, box, content, ownBox, obstacles, W, H, r, size, k) {
  const pad = 30 * k + r;
  const cx = (content[0] + content[2]) / 2;
  // Free width beside the view: up to the canvas edge or the nearest other view at that height.
  const roomFor = (side) => {
    let limit = side === 'left' ? 0 : W;
    for (const o of obstacles) {
      if (o === ownBox || o[3] < box[1] || o[1] > box[3]) continue;
      if (side === 'left' && o[2] <= box[0]) limit = Math.max(limit, o[2] + 16 * k);
      if (side === 'right' && o[0] >= box[2]) limit = Math.min(limit, o[0] - 16 * k);
    }
    return side === 'left' ? box[0] - limit : limit - box[2];
  };
  const widest = (list) => list.reduce((m, it) => Math.max(m, textWidth(it.name, size)), 0);
  for (const it of items) it.side = it.at[0] < cx ? 'left' : 'right';
  const need = (side) => pad + r + 6 * k + widest(items.filter((it) => it.side === side)) + 6;
  for (const side of ['left', 'right']) {
    const other = side === 'left' ? 'right' : 'left';
    if (items.some((it) => it.side === side) && roomFor(side) < need(side) && roomFor(other) > roomFor(side)) {
      for (const it of items) if (it.side === side) it.side = other;
    }
  }
  const lineGap = Math.max(2 * r + 6 * k, size * 1.9);
  for (const side of ['left', 'right']) {
    const col = items.filter((it) => it.side === side).sort((a, b) => a.at[1] - b.at[1]);
    if (!col.length) continue;
    const x = side === 'left' ? Math.max(r + 4, box[0] - pad) : Math.min(W - r - 4, box[2] + pad);
    const ys = col.map((it) => clamp(it.at[1], r + 4, H - r - 4));
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + lineGap);
    const maxY = H - r - 4;
    if (ys[ys.length - 1] > maxY) {
      ys[ys.length - 1] = maxY;
      for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - lineGap);
    }
    col.forEach((it, i) => {
      it.x = x;
      it.y = ys[i];
    });
  }
}

function calloutNodes(c, p) {
  const { T, k } = c;
  const r = 11 * k;
  const dx = p.at[0] - p.x;
  const dy = p.at[1] - p.y;
  const dist = Math.hypot(dx, dy);
  const out = [];
  if (dist > r + 2) {
    const sx = p.x + (dx / dist) * r;
    const sy = p.y + (dy / dist) * r;
    out.push(node('line', { x1: sx, y1: sy, x2: p.at[0], y2: p.at[1], stroke: T.ink, 'stroke-width': 0.95 * k, class: 'bp-leader' }));
    out.push(node('circle', { cx: p.at[0], cy: p.at[1], r: 2.3 * k, fill: T.ink, class: 'bp-dot' }));
  }
  out.push(node('circle', { cx: p.x, cy: p.y, r, fill: T.paper, stroke: T.ink, 'stroke-width': 1.3 * k, class: 'bp-bubble' }));
  out.push(label(c, p.x, p.y, String(p.n), { size: (p.n > 99 ? 9.5 : 11.5) * k, anchor: 'middle', bold: true, cls: 'bp-num' }));
  if (p.text) {
    const tx = p.side === 'left' ? p.x - r - 6 * k : p.x + r + 6 * k;
    out.push(label(c, tx, p.y, p.text, { size: 12 * k, anchor: p.side === 'left' ? 'end' : 'start', halo: true, cls: 'bp-name' }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Drawing field

function drawField(c, fieldX, fieldY) {
  const { spec, T, k } = c;
  const [W, H] = spec.canvas;
  const clipId = nextId(c, 'f');
  c.defs.push(node('clipPath', { id: clipId }, [node('rect', { x: 0, y: 0, width: W, height: H })]));

  const groups = [];
  const viewNodes = [];
  spec.views.forEach((v, i) => {
    const shapes = clampTexts(v.shapes, v.at, W, H);
    const content = viewContentBox({ ...v, shapes });
    const dims = v.dimensions.map((d) => ({ ...d, from: [d.from[0] + v.at[0], d.from[1] + v.at[1]], to: [d.to[0] + v.at[0], d.to[1] + v.at[1]] }));
    let box = content;
    for (const d of dims) box = unionBox(box, dimensionGeometry(c, d).box);
    groups.push({
      view: i,
      content,
      box,
      dims,
      callouts: v.callouts.map((co) => ({ n: co.n, at: [co.at[0] + v.at[0], co.at[1] + v.at[1]], label: co.label ? [co.label[0] + v.at[0], co.label[1] + v.at[1]] : null })),
    });
    viewNodes.push(g({ class: 'bp-view', 'data-view': i, transform: `translate(${fmt(v.at[0])} ${fmt(v.at[1])})` }, shapeListNodes(c, shapes)));
  });
  const topShapes = clampTexts(spec.shapes, [0, 0], W, H);
  const topContent = shapesBounds(topShapes);
  let topBox = topContent;
  for (const d of spec.dimensions) topBox = unionBox(topBox, dimensionGeometry(c, d).box);
  if (spec.callouts.length || spec.dimensions.length || topShapes.length) {
    groups.push({ view: -1, content: topContent, box: topBox || [0, 0, W, H], dims: spec.dimensions, callouts: spec.callouts });
  }
  const placed = placeCallouts(c, groups, W, H);
  const dimNodes = groups.flatMap((gr) => gr.dims.map((d) => dimensionNodes(c, d)));

  // View captions: under each view (below its bubbles and dimensions), else above it; the
  // position that collides least with other views and the canvas edge wins.
  const r = 11 * k;
  const extOf = (gr) => {
    let ext = gr.box;
    for (const p of placed) {
      if (gr.callouts.some((co) => co.at[0] === p.at[0] && co.at[1] === p.at[1] && co.n === p.n)) ext = unionBox(ext, [p.x - r, p.y - r, p.x + r, p.y + r]);
    }
    return ext;
  };
  const exts = groups.map((gr) => ({ gr, ext: extOf(gr) }));
  const captions = [];
  const taken = [];
  spec.views.forEach((v, i) => {
    if (!v.title) return;
    const own = exts.find((x) => x.gr.view === i);
    if (!own || !own.gr.content) return;
    const ext = own.ext;
    const cx = clamp((own.gr.content[0] + own.gr.content[2]) / 2, 60 * k, W - 60 * k);
    const titleSize = 13.5 * k;
    const lineH = v.scale ? 34 * k : 20 * k;
    const tw = textWidth(v.title, titleSize, { bold: true, spacing: 1.2 * k });
    const halfW = Math.max(tw, 60 * k) / 2;
    const candidates = [ext[3] + 12 * k, ext[1] - 12 * k - lineH, ext[3] + 4 * k, H - 2 - lineH];
    let best = null;
    for (const top of candidates) {
      const cb = [cx - halfW, top, cx + halfW, top + lineH];
      let cost = Math.max(0, cb[3] - (H - 2)) * 10 + Math.max(0, 2 - cb[1]) * 10;
      for (const o of exts) if (o !== own && o.ext && boxesOverlap(cb, o.ext)) cost += 1000;
      for (const t of taken) if (boxesOverlap(cb, t)) cost += 1000;
      if (!best || cost < best.cost - 0.01) best = { top, cost, cb };
    }
    const top = clamp(best.top, 2, H - 2 - lineH);
    taken.push([cx - halfW, top, cx + halfW, top + lineH]);
    captions.push(
      g({ class: 'bp-caption' }, [
        label(c, cx, top + titleSize * 0.6, v.title, { size: titleSize, anchor: 'middle', bold: true, spacing: 1.2 * k, halo: true }),
        node('line', { x1: cx - tw / 2, y1: top + titleSize * 1.25, x2: cx + tw / 2, y2: top + titleSize * 1.25, stroke: c.T.ink, 'stroke-width': 1.1 * k }),
        v.scale ? label(c, cx, top + titleSize * 1.25 + 10 * k, `SCALE ${v.scale}`, { size: 10.5 * k, anchor: 'middle', fill: T.soft, spacing: 0.8 * k, halo: true }) : null,
      ]),
    );
  });

  const calloutGroups = placed.map((p) => {
    c.layout.callouts.push({ n: p.n, x: fieldX + p.x, y: fieldY + p.y, ax: fieldX + p.at[0], ay: fieldY + p.at[1] });
    return g({ class: 'bp-callout', 'data-n': p.n, 'data-cx': fieldX + p.x, 'data-cy': fieldY + p.y }, calloutNodes(c, p));
  });

  return g({ class: 'bp-field', transform: `translate(${fmt(fieldX)} ${fmt(fieldY)})` }, [
    g({ 'clip-path': `url(#${clipId})` }, [...viewNodes, g({ class: 'bp-shapes' }, shapeListNodes(c, topShapes)), ...dimNodes, ...captions]),
    g({ class: 'bp-callouts' }, calloutGroups),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Process flow (step cards)

function layoutSteps(c, width) {
  const { spec, kt } = c;
  const gap = 34 * kt;
  const heading = 30 * kt;
  const cols = clamp(Math.floor((width + gap) / (250 * kt + gap)), 1, 4);
  const cardW = (width - gap * (cols - 1)) / cols;
  const pad = 12 * kt;
  const titleSize = 12.5 * kt;
  const titleLH = 15 * kt;
  const detailSize = 11 * kt;
  const detailLH = 14 * kt;
  const cards = spec.steps.map((s) => {
    const titleW = cardW - pad * 2 - 30 * kt;
    const titleLines = wrapText(s.title.toUpperCase(), titleW, titleSize, { bold: true, spacing: 0.4 * kt, maxLines: 2 });
    const headerH = (s.phase ? 14 * kt : 0) + Math.max(26 * kt, titleLines.length * titleLH + 4 * kt);
    const hasIcon = s.shapes.length > 0;
    let iconW = 0;
    let iconH = 0;
    let textW = cardW - pad * 2;
    let side = false;
    if (hasIcon) {
      iconW = Math.min(150 * kt, cardW * 0.46);
      iconH = (iconW * STEP_BOX[1]) / STEP_BOX[0];
      if (cardW - pad * 2 - iconW - 12 * kt >= 120 * kt) {
        side = true;
        textW = cardW - pad * 2 - iconW - 12 * kt;
      } else {
        iconW = Math.min(cardW - pad * 2, 170 * kt);
        iconH = (iconW * STEP_BOX[1]) / STEP_BOX[0];
      }
    }
    const lines = s.detail ? wrapText(s.detail, textW, detailSize, { maxLines: 12 }) : [];
    const textH = lines.length * detailLH;
    const bodyH = hasIcon ? (side ? Math.max(iconH, textH) : iconH + (lines.length ? 8 * kt + textH : 0)) : textH;
    return { s, titleLines, headerH, hasIcon, iconW, iconH, side, textW, lines, h: pad + headerH + 6 * kt + bodyH + pad };
  });
  const rows = [];
  for (let i = 0; i < cards.length; i += cols) rows.push(cards.slice(i, i + cols));
  const rowH = rows.map((row) => Math.max(...row.map((cd) => cd.h)));
  const height = heading + rowH.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);
  return {
    height,
    draw(x0, y0) {
      const { T } = c;
      const out = [];
      out.push(label(c, x0, y0 + 9 * kt, `PROCESS FLOW · ${spec.steps.length} STEPS`, { size: 12.5 * kt, bold: true, spacing: 1.6 * kt }));
      out.push(node('line', { x1: x0, y1: y0 + 21 * kt, x2: x0 + width, y2: y0 + 21 * kt, stroke: T.ink, 'stroke-width': 1.1 * kt, 'stroke-opacity': 0.8 }));
      const pos = [];
      let y = y0 + heading;
      rows.forEach((row, r) => {
        row.forEach((cd, i) => {
          const col = r % 2 === 0 ? i : cols - 1 - i;
          pos.push({ cd, x: x0 + col * (cardW + gap), y, h: rowH[r], row: r });
        });
        y += rowH[r] + gap;
      });
      // Flow arrows (serpentine: rows alternate direction).
      for (let i = 0; i + 1 < pos.length; i++) {
        const a = pos[i];
        const b = pos[i + 1];
        if (a.row === b.row) {
          const leftToRight = b.x > a.x;
          const yy = a.y + Math.min(a.h, b.h) / 2;
          const xa = leftToRight ? a.x + cardW + 5 * kt : a.x - 5 * kt;
          const xb = leftToRight ? b.x - 5 * kt : b.x + cardW + 5 * kt;
          out.push(node('line', { x1: xa, y1: yy, x2: xb - (leftToRight ? 8 : -8) * kt, y2: yy, stroke: T.ink, 'stroke-width': 1.6 * kt }));
          out.push(arrowHead(c, [xb, yy], [leftToRight ? 1 : -1, 0], { len: 10 * kt, width: 4 * kt }));
        } else {
          const xx = a.x + cardW / 2;
          const ya = a.y + a.h + 5 * kt;
          const yb = b.y - 5 * kt;
          out.push(node('line', { x1: xx, y1: ya, x2: xx, y2: yb - 8 * kt, stroke: T.ink, 'stroke-width': 1.6 * kt }));
          out.push(arrowHead(c, [xx, yb], [0, 1], { len: 10 * kt, width: 4 * kt }));
        }
      }
      for (const p of pos) out.push(stepCard(c, p.cd, p.x, p.y, cardW, p.h));
      return g({ class: 'bp-steps' }, out);
    },
  };
}

function stepCard(c, cd, x, y, w, h) {
  const { T, kt } = c;
  const pad = 12 * kt;
  const out = [node('rect', { x, y, width: w, height: h, rx: 4 * kt, fill: T.panel, 'fill-opacity': 0.92, stroke: T.ink, 'stroke-width': 1.1 * kt, 'stroke-opacity': 0.85 })];
  const bx = x + pad + 12 * kt;
  let ty = y + pad;
  if (cd.s.phase) {
    out.push(label(c, x + pad + 30 * kt, ty + 4 * kt, cd.s.phase, { size: 9.5 * kt, bold: true, fill: T.accent, spacing: 1.2 * kt }));
    ty += 14 * kt;
  }
  const by = ty + 12 * kt;
  out.push(node('circle', { cx: bx, cy: by, r: 12 * kt, fill: T.ink }));
  out.push(label(c, bx, by, String(cd.s.n), { size: 12 * kt, anchor: 'middle', bold: true, fill: T.paper }));
  cd.titleLines.forEach((line, i) => {
    out.push(label(c, x + pad + 30 * kt, ty + 7.5 * kt + i * 15 * kt, line, { size: 12.5 * kt, bold: true, spacing: 0.4 * kt }));
  });
  let bodyY = y + pad + cd.headerH + 6 * kt;
  let textX = x + pad;
  if (cd.hasIcon) {
    const ix = cd.side ? x + pad : x + (w - cd.iconW) / 2;
    const scale = cd.iconW / STEP_BOX[0];
    const clipId = nextId(c, 's');
    c.defs.push(node('clipPath', { id: clipId }, [node('rect', { x: -4, y: -4, width: STEP_BOX[0] + 8, height: STEP_BOX[1] + 8 })]));
    out.push(node('rect', { x: ix, y: bodyY, width: cd.iconW, height: cd.iconH, fill: 'none', stroke: T.ink, 'stroke-width': 0.6 * kt, 'stroke-opacity': 0.35, 'stroke-dasharray': `${fmt(3 * kt)} ${fmt(3 * kt)}` }));
    // Pictograms are drawn at their own scale: weights follow the icon, not the sheet.
    const iconCtx = { ...c, k: (0.85 / scale) * kt };
    out.push(g({ transform: `translate(${fmt(ix)} ${fmt(bodyY)}) scale(${fmt(scale)})` }, [g({ 'clip-path': `url(#${clipId})` }, shapeListNodes(iconCtx, cd.s.shapes))]));
    c.ids = iconCtx.ids;
    if (cd.side) textX = ix + cd.iconW + 12 * kt;
    else bodyY += cd.iconH + 8 * kt;
  }
  cd.lines.forEach((line, i) => {
    out.push(label(c, textX, bodyY + 7 * kt + i * 14 * kt, line, { size: 11 * kt, fill: T.ink, opacity: 0.9 }));
  });
  return g({ class: 'bp-step', 'data-step': cd.s.n }, out);
}

// ---------------------------------------------------------------------------------------------
// Right column blocks: notes, sources, parts list, title block. Each returns { h, draw(x, y) }.

function headerBar(c, x, y, w, text) {
  const { T, kt } = c;
  return [
    node('rect', { x, y, width: w, height: 22 * kt, fill: T.panelHead }),
    label(c, x + 8 * kt, y + 11 * kt, text, { size: 11 * kt, bold: true, spacing: 1.6 * kt }),
    node('line', { x1: x, y1: y + 22 * kt, x2: x + w, y2: y + 22 * kt, stroke: T.ink, 'stroke-width': 0.9 * kt, 'stroke-opacity': 0.7 }),
  ];
}

function boxFrame(c, x, y, w, h) {
  const { T, kt } = c;
  return node('rect', { x, y, width: w, height: h, fill: T.panel, 'fill-opacity': 0.94, stroke: T.ink, 'stroke-width': 1.2 * kt });
}

function listBlock(c, w, heading, items) {
  const { kt, T } = c;
  const size = 11 * kt;
  const lh = 14 * kt;
  const indent = 24 * kt;
  const laid = items.map((it) => {
    const lines = wrapText(it.text, w - indent - 10 * kt, size, { maxLines: it.maxLines || 4 });
    const sub = it.sub ? [ellipsize(it.sub, w - indent - 10 * kt, 10 * kt)] : [];
    return { lines, sub, h: (lines.length + sub.length) * lh + 5 * kt };
  });
  const h = 22 * kt + 8 * kt + laid.reduce((a, b) => a + b.h, 0) + 4 * kt;
  return {
    h,
    draw(x, y) {
      const out = [boxFrame(c, x, y, w, h), ...headerBar(c, x, y, w, heading)];
      let yy = y + 22 * kt + 8 * kt;
      laid.forEach((it, i) => {
        out.push(label(c, x + 8 * kt, yy + lh / 2, `${i + 1}.`, { size, bold: true }));
        it.lines.forEach((line, j) => out.push(label(c, x + indent, yy + lh / 2 + j * lh, line, { size })));
        it.sub.forEach((line, j) => out.push(label(c, x + indent, yy + lh / 2 + (it.lines.length + j) * lh, line, { size: 10 * kt, fill: T.soft })));
        yy += it.h;
      });
      return g({ class: `bp-${heading.toLowerCase().split(' ')[0]}` }, out);
    },
  };
}

const LEGEND_LINES = [
  ['thick', 'Visible outline'],
  ['thin', 'Detail edge'],
  ['hidden', 'Hidden or internal part'],
  ['center', 'Centre line, axis'],
  ['cut', 'Cutting plane'],
  ['accent', 'Highlighted feature'],
  ['fill', 'Tinted area'],
];
const LEGEND_HATCH = [
  ['lines', 'Section: cut solid'],
  ['cross', 'Section: crossed hatch'],
  ['dots', 'Section: powder, gel, winding'],
  ['solid', 'Section: thin wall'],
];

/** What the drawing uses (line styles, hatch patterns, callouts, dimensions), for the legend. */
function legendEntries(spec) {
  const styles = new Set();
  const hatches = new Set();
  const shapes = [...spec.shapes, ...spec.views.flatMap((v) => v.shapes)];
  for (const s of shapes) {
    if (s.type === 'cutline') styles.add('cut');
    else if (s.type !== 'text' && s.type !== 'hatch' && s.style) styles.add(s.style);
    if (s.hatch) hatches.add(s.hatch.pattern);
  }
  const out = [];
  for (const [style, text] of LEGEND_LINES) if (styles.has(style)) out.push({ kind: 'line', style, text });
  for (const [pattern, text] of LEGEND_HATCH) if (hatches.has(pattern)) out.push({ kind: 'hatch', pattern, text });
  const hasCallouts = spec.callouts.length || spec.views.some((v) => v.callouts.length);
  const hasDims = spec.dimensions.length || spec.views.some((v) => v.dimensions.length);
  if (hasCallouts) out.push({ kind: 'bubble', text: 'Part number (parts list)' });
  if (hasDims) out.push({ kind: 'dim', text: 'Dimension' });
  return out;
}

function legendBlock(c, w) {
  const { kt, T } = c;
  const entries = legendEntries(c.spec);
  if (entries.length < 2) return null;
  const rowH = 21 * kt;
  const rows = Math.ceil(entries.length / 2);
  const h = 22 * kt + 8 * kt + rows * rowH + 4 * kt;
  return {
    h,
    draw(x, y) {
      const out = [boxFrame(c, x, y, w, h), ...headerBar(c, x, y, w, 'LEGEND')];
      const colW = w / 2;
      entries.forEach((e, i) => {
        const ex = x + (i % 2) * colW + 10 * kt;
        const ey = y + 22 * kt + 8 * kt + Math.floor(i / 2) * rowH + rowH / 2;
        const sw = 34 * kt;
        if (e.kind === 'line') {
          const paint = strokeFor({ ...c, k: kt }, e.style);
          if (e.style === 'fill') out.push(node('rect', { x: ex, y: ey - 6 * kt, width: sw, height: 12 * kt, ...paint }));
          else out.push(node('line', { x1: ex, y1: ey, x2: ex + sw, y2: ey, ...paint }));
        } else if (e.kind === 'hatch') {
          const clipId = nextId(c, 'l');
          const box = [ex, ey - 7 * kt, ex + sw, ey + 7 * kt];
          c.defs.push(node('clipPath', { id: clipId }, [node('rect', { x: box[0], y: box[1], width: sw, height: 14 * kt })]));
          const hatch = { pattern: e.pattern, angle: 45 };
          if (e.pattern === 'solid') out.push(node('rect', { x: box[0], y: box[1], width: sw, height: 14 * kt, fill: T.ink, 'fill-opacity': 0.88 }));
          else out.push(g({ 'clip-path': `url(#${clipId})` }, [node('path', e.pattern === 'dots' ? { d: hatchPath(box, hatch, kt), stroke: T.ink, 'stroke-width': 1.9 * kt, 'stroke-linecap': 'round', fill: 'none', 'stroke-opacity': 0.7 } : { d: hatchPath(box, hatch, kt), stroke: T.ink, 'stroke-width': 0.75 * kt, fill: 'none', 'stroke-opacity': 0.68 })]));
          out.push(node('rect', { x: box[0], y: box[1], width: sw, height: 14 * kt, fill: 'none', stroke: T.ink, 'stroke-width': 1 * kt }));
        } else if (e.kind === 'bubble') {
          out.push(node('circle', { cx: ex + sw / 2, cy: ey, r: 8.5 * kt, fill: T.paper, stroke: T.ink, 'stroke-width': 1.1 * kt }));
          out.push(label(c, ex + sw / 2, ey, '7', { size: 9.5 * kt, anchor: 'middle', bold: true }));
        } else if (e.kind === 'dim') {
          out.push(node('line', { x1: ex + 4 * kt, y1: ey, x2: ex + sw - 4 * kt, y2: ey, stroke: T.ink, 'stroke-width': 0.85 * kt }));
          out.push(arrowHead({ ...c, k: kt }, [ex, ey], [-1, 0], { len: 7 * kt, width: 2.6 * kt }));
          out.push(arrowHead({ ...c, k: kt }, [ex + sw, ey], [1, 0], { len: 7 * kt, width: 2.6 * kt }));
        }
        out.push(label(c, ex + sw + 8 * kt, ey, ellipsize(e.text, colW - sw - 24 * kt, 10.5 * kt), { size: 10.5 * kt }));
      });
      return g({ class: 'bp-legend' }, out);
    },
  };
}

function notesBlock(c, w) {
  return listBlock(c, w, 'NOTES', c.spec.notes.map((n) => ({ text: n })));
}

function sourcesBlock(c, w) {
  return listBlock(
    c,
    w,
    'SOURCES',
    c.spec.sources.map((s) => ({ text: s.title, sub: hostOf(s.url), maxLines: 2 })),
  );
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function partsTable(c, w) {
  const { spec, kt, T } = c;
  const size = 11 * kt;
  const lh = 13.5 * kt;
  const hasQty = spec.parts.some((p) => p.qty);
  const colNo = 34 * kt;
  const colQty = hasQty ? 34 * kt : 0;
  const rest = w - colNo - colQty;
  const colName = Math.round(rest * 0.42);
  const colMat = rest - colName;
  const rows = spec.parts.map((p) => {
    const name = wrapText(p.name, colName - 12 * kt, size, { bold: true, maxLines: 3 });
    const mat = p.material ? wrapText(p.material, colMat - 12 * kt, size, { maxLines: 3 }) : [];
    const note = p.note ? wrapText(p.note, colMat - 12 * kt, 10 * kt, { maxLines: 3 }) : [];
    const h = Math.max(name.length, mat.length + note.length, 1) * lh + 9 * kt;
    return { p, name, mat, note, h };
  });
  const headH = 22 * kt + 18 * kt;
  const h = headH + rows.reduce((a, b) => a + b.h, 0);
  const title = spec.sheet === 'process' ? 'MATERIALS & INPUTS' : 'PARTS LIST';
  return {
    h,
    draw(x, y) {
      const out = [boxFrame(c, x, y, w, h), ...headerBar(c, x, y, w, title)];
      const hy = y + 22 * kt;
      const cols = [x + colNo, x + colNo + colName, ...(hasQty ? [x + w - colQty] : [])];
      out.push(label(c, x + colNo / 2, hy + 9 * kt, 'NO.', { size: 9 * kt, anchor: 'middle', fill: T.soft, spacing: 0.8 * kt }));
      out.push(label(c, x + colNo + 6 * kt, hy + 9 * kt, spec.sheet === 'process' ? 'MATERIAL / INPUT' : 'PART', { size: 9 * kt, fill: T.soft, spacing: 0.8 * kt }));
      out.push(label(c, x + colNo + colName + 6 * kt, hy + 9 * kt, spec.sheet === 'process' ? 'SPECIFICATION / USE' : 'MATERIAL / NOTE', { size: 9 * kt, fill: T.soft, spacing: 0.8 * kt }));
      if (hasQty) out.push(label(c, x + w - colQty / 2, hy + 9 * kt, 'QTY', { size: 9 * kt, anchor: 'middle', fill: T.soft, spacing: 0.8 * kt }));
      out.push(node('line', { x1: x, y1: hy + 18 * kt, x2: x + w, y2: hy + 18 * kt, stroke: T.ink, 'stroke-width': 0.7 * kt, 'stroke-opacity': 0.6 }));
      let yy = y + headH;
      const rowNodes = [];
      for (const r of rows) {
        const parts = [node('rect', { x, y: yy, width: w, height: r.h, fill: 'transparent', class: 'bp-row-bg' })];
        const cy = yy + 4.5 * kt + lh / 2;
        parts.push(node('circle', { cx: x + colNo / 2, cy, r: 9 * kt, fill: 'none', stroke: T.ink, 'stroke-width': 1 * kt, class: 'bp-row-bubble' }));
        parts.push(label(c, x + colNo / 2, cy, String(r.p.n), { size: (r.p.n > 99 ? 8 : 10) * kt, anchor: 'middle', bold: true }));
        r.name.forEach((line, i) => parts.push(label(c, x + colNo + 6 * kt, cy + i * lh, line, { size, bold: true })));
        r.mat.forEach((line, i) => parts.push(label(c, x + colNo + colName + 6 * kt, cy + i * lh, line, { size })));
        r.note.forEach((line, i) => parts.push(label(c, x + colNo + colName + 6 * kt, cy + (r.mat.length + i) * lh, line, { size: 10 * kt, fill: T.soft })));
        if (hasQty && r.p.qty) parts.push(label(c, x + w - colQty / 2, cy, String(r.p.qty), { size, anchor: 'middle' }));
        parts.push(node('line', { x1: x, y1: yy + r.h, x2: x + w, y2: yy + r.h, stroke: T.ink, 'stroke-width': 0.5 * kt, 'stroke-opacity': 0.4 }));
        c.layout.parts.push({ n: r.p.n, y: yy, h: r.h });
        rowNodes.push(g({ class: 'bp-part-row', 'data-n': r.p.n, 'data-y': yy, 'data-h': r.h }, parts));
        yy += r.h;
      }
      for (const cx of cols) out.push(node('line', { x1: cx, y1: hy, x2: cx, y2: y + h, stroke: T.ink, 'stroke-width': 0.6 * kt, 'stroke-opacity': 0.55 }));
      return g({ class: 'bp-parts' }, [...out, ...rowNodes]);
    },
  };
}

function titleBlock(c, w) {
  const { spec, kt, T, opts } = c;
  const titleFit = fitText(spec.title.toUpperCase(), w - 20 * kt, 21 * kt, 13 * kt, { bold: true, spacing: 0.6 * kt, maxLines: 2 });
  const titleH = 18 * kt + titleFit.lines.length * titleFit.size * 1.12 + 8 * kt;
  const subjectLines = spec.subject ? wrapText(spec.subject, w - 20 * kt, 12.5 * kt, { maxLines: 2 }) : [];
  const subjectH = subjectLines.length ? 16 * kt + subjectLines.length * 15 * kt + 6 * kt : 0;
  const rows = [34 * kt, titleH, subjectH, 36 * kt, 22 * kt];
  const h = rows.reduce((a, b) => a + b, 0);
  const date = formatDate(opts.date);
  const dwg = `JE-${hash32(`${spec.title}|${spec.subject}|${spec.sheet}`).slice(0, 4)}-${SHEET_CODES[spec.sheet]}`;
  return {
    h,
    draw(x, y) {
      const out = [node('rect', { x, y, width: w, height: h, fill: T.panel, stroke: T.ink, 'stroke-width': 1.8 * kt })];
      const hline = (yy, op = 0.8) => node('line', { x1: x, y1: yy, x2: x + w, y2: yy, stroke: T.ink, 'stroke-width': 0.9 * kt, 'stroke-opacity': op });
      const vline = (xx, y1, y2) => node('line', { x1: xx, y1, x2: xx, y2, stroke: T.ink, 'stroke-width': 0.9 * kt, 'stroke-opacity': 0.8 });
      const tiny = (xx, yy, text) => label(c, xx, yy, text, { size: 8.5 * kt, fill: T.soft, spacing: 1 * kt });
      let yy = y;
      // Row 1: maker + sheet kind
      const kindW = 128 * kt;
      out.push(logoMark(c, x + 18 * kt, yy + rows[0] / 2, 9 * kt));
      out.push(label(c, x + 34 * kt, yy + rows[0] / 2, 'JARVIS ENGINEERING', { size: 12.5 * kt, bold: true, spacing: 2.2 * kt }));
      out.push(vline(x + w - kindW, yy, yy + rows[0]));
      out.push(label(c, x + w - kindW / 2, yy + rows[0] / 2, SHEET_NAMES[spec.sheet], { size: 10.5 * kt, bold: true, anchor: 'middle', spacing: 1.2 * kt, fill: T.accent }));
      yy += rows[0];
      out.push(hline(yy));
      // Row 2: title
      out.push(tiny(x + 10 * kt, yy + 10 * kt, 'TITLE'));
      titleFit.lines.forEach((line, i) => out.push(label(c, x + 10 * kt, yy + 18 * kt + titleFit.size * 0.62 + i * titleFit.size * 1.12, line, { size: titleFit.size, bold: true, spacing: titleFit.spacing })));
      yy += rows[1];
      // Row 3: subject
      if (subjectH) {
        out.push(hline(yy, 0.5));
        out.push(tiny(x + 10 * kt, yy + 10 * kt, 'SUBJECT'));
        subjectLines.forEach((line, i) => out.push(label(c, x + 10 * kt, yy + 16 * kt + 7.5 * kt + i * 15 * kt, line, { size: 12.5 * kt })));
        yy += rows[2];
      }
      out.push(hline(yy));
      // Row 4: scale | date | sheet | dwg no
      const cells = [
        ['SCALE', spec.scale, 0.2],
        ['DATE', date, 0.27],
        ['SHEET', opts.sheetNo || '1 / 1', 0.18],
        ['DWG NO.', dwg, 0.35],
      ];
      let cx = x;
      cells.forEach(([name, value, frac], i) => {
        const cw = w * frac;
        if (i) out.push(vline(cx, yy, yy + rows[3]));
        out.push(tiny(cx + 8 * kt, yy + 10 * kt, name));
        out.push(label(c, cx + 8 * kt, yy + 25 * kt, ellipsize(String(value), cw - 14 * kt, 11.5 * kt, { bold: true }), { size: 11.5 * kt, bold: true }));
        cx += cw;
      });
      yy += rows[3];
      out.push(hline(yy));
      // Row 5: the warning strip
      out.push(node('rect', { x, y: yy, width: w, height: rows[4], fill: T.accent, 'fill-opacity': 0.14 }));
      out.push(label(c, x + w / 2, yy + rows[4] / 2, 'SCHEMATIC — VERIFY BEFORE USE', { size: 10.5 * kt, bold: true, anchor: 'middle', spacing: 1.6 * kt, fill: T.accent }));
      return g({ class: 'bp-titleblock' }, out);
    },
  };
}

function logoMark(c, x, y, r) {
  const { T, kt } = c;
  return g({ class: 'bp-logo' }, [
    node('circle', { cx: x, cy: y, r, fill: 'none', stroke: T.ink, 'stroke-width': 1.4 * kt }),
    node('circle', { cx: x, cy: y, r: r * 0.45, fill: T.accent }),
    node('path', { d: `M${fmt(x - r * 1.35)} ${fmt(y)}H${fmt(x - r * 0.7)}M${fmt(x + r * 0.7)} ${fmt(y)}H${fmt(x + r * 1.35)}M${fmt(x)} ${fmt(y - r * 1.35)}V${fmt(y - r * 0.7)}M${fmt(x)} ${fmt(y + r * 0.7)}V${fmt(y + r * 1.35)}`, stroke: T.ink, 'stroke-width': 1.2 * kt }),
  ]);
}

function formatDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date && !Number.isNaN(value.getTime()) ? value : typeof value === 'number' && Number.isFinite(value) ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------------------------
// Sheet: paper, grid, frame, field, steps and the column.

function drawSheet(c) {
  const { spec, T, kt } = c;
  const [W, H] = spec.canvas;
  const EDGE = 8 * kt;
  const FRAME = 30 * kt;
  const PAD = 16 * kt;
  const GAP = 26 * kt;
  const COLW = 400 * kt;
  const hasDrawing = spec.shapes.length > 0 || spec.callouts.length > 0 || spec.dimensions.length > 0 || spec.views.some((v) => v.shapes.length || v.callouts.length || v.dimensions.length);
  const fieldX = FRAME + PAD;
  const fieldY = FRAME + PAD;
  const colX = fieldX + W + GAP;

  const steps = spec.steps.length ? layoutSteps(c, W) : null;
  const canvasH = hasDrawing || !steps ? H : 0;
  const leftBase = canvasH + (steps ? (canvasH ? GAP : 0) + steps.height : 0);

  const title = titleBlock(c, COLW);
  const parts = spec.parts.length ? partsTable(c, COLW) : null;
  const notesR = spec.notes.length ? notesBlock(c, COLW) : null;
  const sourcesR = spec.sources.length ? sourcesBlock(c, COLW) : null;
  const gapR = 14 * kt;
  const sum = (blocks) => blocks.filter(Boolean).reduce((a, b, i) => a + b.h + (i ? gapR : 0), 0);
  const rightAll = sum([notesR, sourcesR, parts, title]);

  // Balance: notes and sources may move under the drawing (side by side when both move). Every
  // combination is tried; the shortest sheet wins, ties keep blocks in the column.
  let best = null;
  for (const moveNotes of notesR ? [false, true] : [false]) {
    for (const moveSources of sourcesR ? [false, true] : [false]) {
      const moved = [moveNotes && 'notes', moveSources && 'sources'].filter(Boolean);
      const halfW = moved.length === 2 ? (W - GAP) / 2 : W;
      const ln = moveNotes ? notesBlock(c, halfW) : null;
      const ls = moveSources ? sourcesBlock(c, halfW) : null;
      const extraH = Math.max(ln ? ln.h : 0, ls ? ls.h : 0);
      const left = leftBase + (moved.length ? GAP + extraH : 0);
      const right = sum([moveNotes ? null : notesR, moveSources ? null : sourcesR, parts, title]);
      const height = Math.max(left, right);
      if (!best || height < best.height - 0.5) best = { height, left, right, ln, ls, halfW, moveNotes, moveSources, extraH };
    }
  }
  const leftH = best.left;
  const rightH = best.right;
  const contentH = Math.max(leftH, rightH);
  const width = colX + COLW + PAD + FRAME;
  const height = FRAME + PAD + contentH + PAD + FRAME;
  c.layout.width = width;
  c.layout.height = height;

  const children = [];
  // Paper with a soft vignette.
  const vig = nextId(c, 'v');
  c.defs.push(
    node('radialGradient', { id: vig, cx: '50%', cy: '45%', r: '75%' }, [node('stop', { offset: '0', 'stop-color': T.paper }), node('stop', { offset: '1', 'stop-color': T.paperEdge })]),
  );
  children.push(node('rect', { x: 0, y: 0, width, height, fill: T.paper, class: 'bp-paper' }));
  children.push(node('rect', { x: 0, y: 0, width, height, fill: `url(#${vig})` }));
  children.push(gridNodes(c, FRAME, FRAME, width - FRAME, height - FRAME, fieldX, fieldY));
  children.push(frameNodes(c, width, height, EDGE, FRAME));

  if (canvasH) children.push(drawField(c, fieldX, fieldY));
  if (steps) {
    const sy = fieldY + (canvasH ? canvasH + GAP : 0);
    if (canvasH) children.push(node('line', { x1: fieldX, y1: sy - GAP / 2, x2: fieldX + W, y2: sy - GAP / 2, stroke: T.ink, 'stroke-width': 0.8 * kt, 'stroke-opacity': 0.35 }));
    children.push(steps.draw(fieldX, sy));
  }
  // Column separator.
  children.push(node('line', { x1: colX - GAP / 2, y1: FRAME, x2: colX - GAP / 2, y2: height - FRAME, stroke: T.ink, 'stroke-width': 1 * kt, 'stroke-opacity': 0.5 }));

  const col = [];
  let top = fieldY;
  for (const [b, moved] of [[notesR, best.moveNotes], [sourcesR, best.moveSources]]) {
    if (!b || moved) continue;
    col.push(b.draw(colX, top));
    top += b.h + gapR;
  }
  // A legend of the line styles and hatches used, when the column has room for it.
  const legend = legendBlock(c, COLW);
  if (legend && contentH - rightH >= legend.h + gapR) {
    col.push(legend.draw(colX, top));
    top += legend.h + gapR;
  }
  const below = fieldY + leftBase + GAP;
  if (best.ln) col.push(best.ln.draw(fieldX, below));
  if (best.ls) col.push(best.ls.draw(fieldX + (best.ln ? best.halfW + GAP : 0), below));
  const titleY = fieldY + contentH - title.h;
  col.push(title.draw(colX, titleY));
  if (parts) col.push(parts.draw(colX, titleY - gapR - parts.h));
  children.push(...col);

  const desc = [spec.title, spec.subject].filter(Boolean).join(' — ');
  return node(
    'svg',
    {
      viewBox: `0 0 ${fmt(width)} ${fmt(height)}`,
      width,
      height,
      class: 'bp-sheet',
      role: 'img',
      'font-family': BLUEPRINT_FONT,
      'data-bp-version': 1,
    },
    [node('title', {}, null, `Blueprint: ${desc}`), node('defs', {}, c.defs), ...children],
  );
}

function gridNodes(c, x0, y0, x1, y1, ox, oy) {
  const { T, kt } = c;
  const step = 10 * kt;
  let minor = '';
  let major = '';
  const startX = ox - Math.floor((ox - x0) / step) * step;
  const startY = oy - Math.floor((oy - y0) / step) * step;
  for (let x = startX, i = Math.round((startX - ox) / step); x <= x1 + 0.01; x += step, i++) {
    (i % 5 === 0 ? (major += `M${fmt(x)} ${fmt(y0)}V${fmt(y1)}`) : (minor += `M${fmt(x)} ${fmt(y0)}V${fmt(y1)}`));
  }
  for (let y = startY, i = Math.round((startY - oy) / step); y <= y1 + 0.01; y += step, i++) {
    (i % 5 === 0 ? (major += `M${fmt(x0)} ${fmt(y)}H${fmt(x1)}`) : (minor += `M${fmt(x0)} ${fmt(y)}H${fmt(x1)}`));
  }
  return g({ class: 'bp-grid' }, [node('path', { d: minor, stroke: T.gridMinor, 'stroke-width': 0.6 * kt, fill: 'none' }), node('path', { d: major, stroke: T.gridMajor, 'stroke-width': 0.9 * kt, fill: 'none' })]);
}

function frameNodes(c, width, height, edge, frame) {
  const { T, kt } = c;
  const out = [
    node('rect', { x: edge, y: edge, width: width - 2 * edge, height: height - 2 * edge, fill: 'none', stroke: T.ink, 'stroke-width': 0.9 * kt, 'stroke-opacity': 0.75 }),
    node('rect', { x: frame, y: frame, width: width - 2 * frame, height: height - 2 * frame, fill: 'none', stroke: T.ink, 'stroke-width': 2.2 * kt }),
  ];
  const innerW = width - 2 * frame;
  const innerH = height - 2 * frame;
  const cols = Math.max(4, Math.round(innerW / (170 * kt)));
  const rows = Math.max(3, Math.round(innerH / (170 * kt)));
  const mid = (edge + frame) / 2;
  let ticks = '';
  for (let i = 0; i <= cols; i++) {
    const x = frame + (innerW * i) / cols;
    if (i > 0 && i < cols) ticks += `M${fmt(x)} ${fmt(edge)}V${fmt(frame)}M${fmt(x)} ${fmt(height - frame)}V${fmt(height - edge)}`;
    if (i < cols) {
      const cx = frame + (innerW * (i + 0.5)) / cols;
      out.push(label(c, cx, mid, String(i + 1), { size: 10 * kt, anchor: 'middle', fill: T.soft }));
      out.push(label(c, cx, height - mid, String(i + 1), { size: 10 * kt, anchor: 'middle', fill: T.soft }));
    }
  }
  for (let j = 0; j <= rows; j++) {
    const y = frame + (innerH * j) / rows;
    if (j > 0 && j < rows) ticks += `M${fmt(edge)} ${fmt(y)}H${fmt(frame)}M${fmt(width - frame)} ${fmt(y)}H${fmt(width - edge)}`;
    if (j < rows) {
      const cy = frame + (innerH * (j + 0.5)) / rows;
      const letter = String.fromCharCode(65 + (j % 26));
      out.push(label(c, mid, cy, letter, { size: 10 * kt, anchor: 'middle', fill: T.soft }));
      out.push(label(c, width - mid, cy, letter, { size: 10 * kt, anchor: 'middle', fill: T.soft }));
    }
  }
  // Centering marks at the middle of each side.
  ticks += `M${fmt(width / 2)} ${fmt(edge - 4 * kt)}V${fmt(frame + 8 * kt)}M${fmt(width / 2)} ${fmt(height - frame - 8 * kt)}V${fmt(height - edge + 4 * kt)}`;
  ticks += `M${fmt(edge - 4 * kt)} ${fmt(height / 2)}H${fmt(frame + 8 * kt)}M${fmt(width - frame - 8 * kt)} ${fmt(height / 2)}H${fmt(width - edge + 4 * kt)}`;
  out.push(node('path', { d: ticks, stroke: T.ink, 'stroke-width': 0.9 * kt, 'stroke-opacity': 0.75, fill: 'none' }));
  return g({ class: 'bp-frame' }, out);
}

// Exposed for tests.
export const __test = { placeRing, placeColumns, dimensionGeometry, hatchPath, layoutSteps };
export { padBox, boxesOverlap, shapeBoundsWithRepeats };
