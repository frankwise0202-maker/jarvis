// Pure geometry and text-metric helpers shared by the blueprint validator (src/lib/blueprint-spec.js)
// and the SVG renderer (src/ui/blueprint/). No DOM access: safe for the engine and for Node tests.
//
// Conventions (the same ones the draw_blueprint tool description gives Claude):
//   - x grows to the right, y grows DOWN (as in SVG);
//   - every angle is in degrees, clockwise from +x (90 points down), as in SVG.

// ---------------------------------------------------------------------------------------------
// Numbers

/** Round to 2 decimals, never -0. */
export function round2(n) {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

/** A number as short SVG attribute text: at most 2 decimals, no exponent, no -0. */
export function fmt(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  const r = round2(n);
  return String(r);
}

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n;
}

export const DEG = Math.PI / 180;

/** Rotate point [x, y] by `deg` (clockwise on screen) around [cx, cy]. */
export function rotatePoint(p, deg, c = [0, 0]) {
  if (!deg) return [p[0], p[1]];
  const a = deg * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
}

// ---------------------------------------------------------------------------------------------
// Bounding boxes: [minX, minY, maxX, maxY] or null

export function emptyBox() {
  return null;
}

export function boxOfPoints(points) {
  let box = null;
  for (const p of points) box = addPoint(box, p[0], p[1]);
  return box;
}

export function addPoint(box, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return box;
  if (!box) return [x, y, x, y];
  if (x < box[0]) box[0] = x;
  if (y < box[1]) box[1] = y;
  if (x > box[2]) box[2] = x;
  if (y > box[3]) box[3] = y;
  return box;
}

export function unionBox(a, b) {
  if (!a) return b ? b.slice() : null;
  if (!b) return a.slice();
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

export function padBox(box, dx, dy = dx) {
  return box ? [box[0] - dx, box[1] - dy, box[2] + dx, box[3] + dy] : null;
}

export function translateBox(box, dx, dy) {
  return box ? [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy] : null;
}

/** The box of `box` rotated by `deg` around `c` (box of the 4 rotated corners). */
export function rotateBox(box, deg, c) {
  if (!box || !deg) return box ? box.slice() : null;
  return boxOfPoints([
    rotatePoint([box[0], box[1]], deg, c),
    rotatePoint([box[2], box[1]], deg, c),
    rotatePoint([box[2], box[3]], deg, c),
    rotatePoint([box[0], box[3]], deg, c),
  ]);
}

export function boxesOverlap(a, b, gap = 0) {
  if (!a || !b) return false;
  return a[0] < b[2] + gap && b[0] < a[2] + gap && a[1] < b[3] + gap && b[1] < a[3] + gap;
}

export function boxWidth(b) {
  return b ? b[2] - b[0] : 0;
}

export function boxHeight(b) {
  return b ? b[3] - b[1] : 0;
}

// ---------------------------------------------------------------------------------------------
// Text metrics. Helvetica / Arial widths (1/1000 em) for ASCII 32..126: Liberation Sans (Linux),
// Helvetica (Apple) and Arial (Windows) share these metrics, so layout matches on every platform
// the renderer names in its font stack. Other characters use sensible defaults.

const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space .. /
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, // 0-9
  278, 278, 584, 584, 584, 556, 1015, // : ; < = > ? @
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, // A-Z
  278, 278, 278, 469, 556, 333, // [ \ ] ^ _ `
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, // a-z
  334, 260, 334, 584, // { | } ~
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];
const EXTRA = {
  '·': 278, '•': 350, '—': 1000, '–': 556, 'Ø': 778, 'ø': 611, '°': 400, '×': 584,
  '±': 584, 'µ': 556, 'μ': 556, '≈': 584, '≤': 549, '≥': 549, '’': 222, '‘': 222,
  '“': 333, '”': 333, '…': 1000, '→': 1000, '←': 1000, '²': 333, '³': 333, '½': 834,
  '¼': 834, '¾': 834, 'Δ': 612, 'Ω': 768, '⌀': 778, ' ': 278,
};

/** Width of `text` in user units at font size `size` (Helvetica/Arial metrics). */
export function textWidth(text, size, { bold = false, spacing = 0 } = {}) {
  if (!text) return 0;
  const table = bold ? BOLD : REGULAR;
  let units = 0;
  let count = 0;
  for (const ch of String(text)) {
    count++;
    const code = ch.codePointAt(0);
    if (code >= 32 && code <= 126) units += table[code - 32];
    else if (EXTRA[ch] !== undefined) units += EXTRA[ch];
    else if (code >= 0x2e80) units += 1000; // CJK and other full-width scripts
    else units += bold ? 611 : 580; // accented Latin, Greek, Cyrillic...
  }
  return (units / 1000) * size + Math.max(0, count - 1) * spacing;
}

/**
 * Greedy word wrap. Returns at most `maxLines` lines (default: unlimited); when text is cut, the
 * last line ends with an ellipsis. A word wider than the line is broken by characters.
 */
export function wrapText(text, maxWidth, size, { bold = false, spacing = 0, maxLines = Infinity } = {}) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  const opts = { bold, spacing };
  let line = '';
  const push = (s) => {
    lines.push(s);
  };
  for (let w = 0; w < words.length; w++) {
    let word = words[w];
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, opts) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      push(line);
      line = '';
    }
    // The word alone may still be too wide: break it.
    while (textWidth(word, size, opts) > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && textWidth(word.slice(0, cut), size, opts) > maxWidth) cut--;
      push(word.slice(0, cut));
      word = word.slice(cut);
    }
    line = word;
  }
  if (line) push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = ellipsize(`${kept[maxLines - 1]} ${lines[maxLines]}`, maxWidth, size, opts);
    return kept;
  }
  return lines;
}

/** Cut `text` so it fits `maxWidth`, ending with "…" when cut. */
export function ellipsize(text, maxWidth, size, opts = {}) {
  const s = String(text || '');
  if (textWidth(s, size, opts) <= maxWidth) return s;
  const points = Array.from(s);
  let n = points.length;
  while (n > 0 && textWidth(points.slice(0, n).join('').trimEnd() + '…', size, opts) > maxWidth) n--;
  return n > 0 ? points.slice(0, n).join('').trimEnd() + '…' : '…';
}

/**
 * The largest size in [minSize, size] at which `text` fits `maxWidth` in at most `maxLines`
 * lines. Returns { size, lines } (lines may be ellipsized at minSize).
 */
export function fitText(text, maxWidth, size, minSize, { bold = false, spacing = 0, maxLines = 1 } = {}) {
  for (let s = size; s >= minSize; s -= 0.5) {
    const sp = spacing * (s / size);
    const lines = wrapText(text, maxWidth, s, { bold, spacing: sp });
    if (lines.length <= maxLines) return { size: s, lines, spacing: sp };
  }
  const sp = spacing * (minSize / size);
  return { size: minSize, lines: wrapText(text, maxWidth, minSize, { bold, spacing: sp, maxLines }), spacing: sp };
}

// ---------------------------------------------------------------------------------------------
// SVG path data: strict parsing (only MLHVCSQTAZ in either case, numbers and separators),
// canonical re-serialization, and bounds.

const PATH_ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const PATH_ALLOWED = /^[MLHVCSQTAZmlhvcsqtaz0-9eE.,+\-\s]*$/;
const IS_CMD = /[MLHVCSQTAZmlhvcsqtaz]/;
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/**
 * Parse path data. Returns { segments: [[cmd, ...args]], d } (d = canonical text) or null when
 * the data is not strictly valid: any other character, a missing or extra argument, a
 * non-finite or out-of-range number, too much data, or not starting with a moveto.
 */
export function parsePathData(d, { maxChars = 4000, maxNumbers = 1200, maxAbs = 10000 } = {}) {
  if (typeof d !== 'string') return null;
  const s = d.trim();
  if (!s || s.length > maxChars || !PATH_ALLOWED.test(s)) return null;
  const n = s.length;
  let i = 0;
  let numbers = 0;
  const segments = [];
  const skip = () => {
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 44 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  };
  const readNumber = () => {
    skip();
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(s);
    if (!m) return null;
    i = NUMBER.lastIndex;
    const v = Number(m[0]);
    return Number.isFinite(v) && Math.abs(v) <= maxAbs ? v : null;
  };
  const readFlag = () => {
    skip();
    const c = s[i];
    if (c === '0' || c === '1') {
      i++;
      return c === '1' ? 1 : 0;
    }
    return null;
  };
  skip();
  while (i < n) {
    const c = s[i];
    if (!IS_CMD.test(c)) return null;
    i++;
    const up = c.toUpperCase();
    if (!segments.length && up !== 'M') return null;
    if (up === 'Z') {
      segments.push([c]);
      skip();
      continue;
    }
    const argc = PATH_ARGS[up];
    let groups = 0;
    for (;;) {
      skip();
      if (i >= n || IS_CMD.test(s[i])) break;
      const args = [];
      for (let k = 0; k < argc; k++) {
        const v = up === 'A' && (k === 3 || k === 4) ? readFlag() : readNumber();
        if (v === null) return null;
        args.push(v);
      }
      if (up === 'A' && (args[0] < 0 || args[1] < 0)) return null;
      numbers += argc;
      if (numbers > maxNumbers) return null;
      // Extra coordinate pairs after a moveto are implicit linetos.
      const cmd = groups > 0 && up === 'M' ? (c === 'M' ? 'L' : 'l') : c;
      segments.push([cmd, ...args]);
      groups++;
    }
    if (!groups) return null;
  }
  if (!segments.length) return null;
  return { segments, d: serializePath(segments) };
}

export function serializePath(segments) {
  return segments.map((seg) => [seg[0], ...seg.slice(1).map(fmt)].join(' ')).join(' ');
}

/** Absolute bounds of parsed path segments (curves include their control points). */
export function pathBounds(segments) {
  let box = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const add = (px, py) => {
    box = addPoint(box, px, py);
  };
  for (const seg of segments) {
    const cmd = seg[0];
    const rel = cmd === cmd.toLowerCase();
    const a = seg.slice(1);
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + a[0];
        y = oy + a[1];
        sx = x;
        sy = y;
        add(x, y);
        break;
      case 'L':
      case 'T':
        x = ox + a[0];
        y = oy + a[1];
        add(x, y);
        break;
      case 'H':
        x = (rel ? x : 0) + a[0];
        add(x, y);
        break;
      case 'V':
        y = (rel ? y : 0) + a[0];
        add(x, y);
        break;
      case 'C':
        add(ox + a[0], oy + a[1]);
        add(ox + a[2], oy + a[3]);
        x = ox + a[4];
        y = oy + a[5];
        add(x, y);
        break;
      case 'S':
      case 'Q':
        add(ox + a[0], oy + a[1]);
        x = ox + a[2];
        y = oy + a[3];
        add(x, y);
        break;
      case 'A': {
        const x2 = ox + a[5];
        const y2 = oy + a[6];
        for (const p of arcPoints(x, y, a[0], a[1], a[2], a[3], a[4], x2, y2, 24)) add(p[0], p[1]);
        x = x2;
        y = y2;
        break;
      }
      case 'Z':
        x = sx;
        y = sy;
        break;
      default:
        break;
    }
  }
  return box;
}

/**
 * Points along an SVG elliptical arc (endpoint parameterization, SVG 1.1 F.6.5), including both
 * ends. Degenerate radii give the straight segment.
 */
export function arcPoints(x1, y1, rx, ry, phiDeg, large, sweep, x2, y2, samples = 16) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if ((x1 === x2 && y1 === y2) || !rx || !ry) return [[x1, y1], [x2, y2]];
  const phi = phiDeg * DEG;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = den ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(clamp(dot / len, -1, 1));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const pts = [];
  for (let k = 0; k <= samples; k++) {
    const t = t1 + (dt * k) / samples;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    pts.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return pts;
}

// ---------------------------------------------------------------------------------------------
// Shapes (normalized, see blueprint-spec.js): local bounds and repeat transforms.

/** Approximate box of a text shape (anchor + size + rotation). */
export function textBox(at, text, size, anchor = 'start', rot = 0, bold = false) {
  const w = textWidth(text, size, { bold });
  const x0 = anchor === 'middle' ? at[0] - w / 2 : anchor === 'end' ? at[0] - w : at[0];
  // Text is vertically centred on `at` (the renderer puts the baseline at y + 0.35 size).
  const box = [x0, at[1] - size * 0.55, x0 + w, at[1] + size * 0.45];
  return rot ? rotateBox(box, rot, at) : box;
}

/** Bounds of one normalized shape, without its repeat copies. */
export function shapeBounds(s) {
  switch (s.type) {
    case 'line':
    case 'arrow':
    case 'cutline':
      return boxOfPoints([s.from, s.to]);
    case 'rect': {
      const box = [s.at[0], s.at[1], s.at[0] + s.size[0], s.at[1] + s.size[1]];
      return s.rot ? rotateBox(box, s.rot, [s.at[0] + s.size[0] / 2, s.at[1] + s.size[1] / 2]) : box;
    }
    case 'circle':
      return [s.at[0] - s.r, s.at[1] - s.r, s.at[0] + s.r, s.at[1] + s.r];
    case 'ellipse': {
      if (!s.rot) return [s.at[0] - s.rx, s.at[1] - s.ry, s.at[0] + s.rx, s.at[1] + s.ry];
      const a = s.rot * DEG;
      const hw = Math.sqrt((s.rx * Math.cos(a)) ** 2 + (s.ry * Math.sin(a)) ** 2);
      const hh = Math.sqrt((s.rx * Math.sin(a)) ** 2 + (s.ry * Math.cos(a)) ** 2);
      return [s.at[0] - hw, s.at[1] - hh, s.at[0] + hw, s.at[1] + hh];
    }
    case 'arc':
      return boxOfPoints(arcSamplePoints(s, 32));
    case 'polyline':
    case 'polygon':
    case 'hatch':
      return boxOfPoints(s.points);
    case 'path':
      return s.bounds ? s.bounds.slice() : null;
    case 'text':
      return textBox(s.at, s.text, s.size, s.anchor, s.rot, s.style === 'thick');
    default:
      return null;
  }
}

export function arcSamplePoints(s, samples = 24) {
  let sweep = s.to - s.from;
  if (sweep <= 0) sweep += 360;
  if (sweep > 360) sweep = 360;
  const pts = [];
  for (let k = 0; k <= samples; k++) {
    const a = (s.from + (sweep * k) / samples) * DEG;
    pts.push([s.at[0] + s.r * Math.cos(a), s.at[1] + s.r * Math.sin(a)]);
  }
  return pts;
}

/**
 * The copies a repeat makes, as transforms: [{ rotate: deg, about: [x, y] } | { dx, dy }],
 * the original (identity) first. No repeat: one identity transform.
 */
export function repeatTransforms(repeat) {
  if (!repeat) return [null];
  const out = [];
  for (let k = 0; k < repeat.count; k++) {
    if (repeat.along) out.push(k ? { dx: repeat.along[0] * k, dy: repeat.along[1] * k } : null);
    else out.push(k ? { rotate: repeat.step * k, about: repeat.around } : null);
  }
  return out;
}

/** Box of a shape including all its repeat copies. */
export function shapeBoundsWithRepeats(s) {
  const base = shapeBounds(s);
  if (!base || !s.repeat) return base;
  let box = null;
  for (const t of repeatTransforms(s.repeat)) {
    if (!t) box = unionBox(box, base);
    else if (t.rotate !== undefined) box = unionBox(box, rotateBox(base, t.rotate, t.about));
    else box = unionBox(box, translateBox(base, t.dx, t.dy));
  }
  return box;
}

/** Box of a list of shapes (with repeats). */
export function shapesBounds(shapes) {
  let box = null;
  for (const s of shapes) box = unionBox(box, shapeBoundsWithRepeats(s));
  return box;
}

/** A short stable hash (FNV-1a, 32-bit) as uppercase hex, for drawing numbers. */
export function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
