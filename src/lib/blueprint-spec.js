// The draw_blueprint client tool: its description and input schema (written for Claude), and the
// strict validator/normalizer the app runs on every input before rendering or saving it.
// Pure: no DOM, no I/O. Safe to import from the engine (tool_result text) and the UI (renderer).
//
//   normalizeBlueprintSpec(input, { partial }) -> { spec, warnings }
//     spec: the normalized sheet (below) or null when nothing usable was given;
//     warnings: short, precise strings for the tool_result (empty when the input was clean).
//     partial: true while the tool input is still streaming (no warnings, no required fields).
//   blueprintStablePrefix(draft) -> the part of a streamed draft that is certainly complete
//     (feed it to normalizeBlueprintSpec(..., { partial: true }) for live previews)
//   blueprintToolResult({ spec, warnings }, { libraryId }) -> { content, is_error }   tool_result text
//   DRAW_BLUEPRINT_TOOL -> the tool definition { name, description, input_schema, eager_input_streaming }
//     (deeply frozen; drawBlueprintTool() returns a fresh mutable copy)
//
// Normalized spec (every number finite and rounded to 0.01, every string cleaned and capped):
//   { v: 1, title, subject, sheet, scale, canvas: [w, h], names, for?: { model, part? },
//     views: [{ title, scale, at: [x, y], shapes, callouts, dimensions }],
//     shapes, callouts: [{ n, at, label? }], dimensions: [{ from, to, text, offset, axis? }],
//     parts: [{ n, name, material, note, qty }], steps: [{ n, title, detail, phase, shapes }],
//     notes: [string], sources: [{ title, url }] }
//   shape = { type, style?, ...geometry, hatch?: { pattern, angle, spacing? }, repeat? }
//
// Coordinates: x right, y down (as in SVG). Angles: degrees clockwise from +x (as in SVG).

import { parsePathData, pathBounds, round2, shapesBounds, shapeBoundsWithRepeats, translateBox, unionBox, boxesOverlap } from './blueprint-geom.js';

export const BLUEPRINT_SPEC_VERSION = 1;
export const SHEET_KINDS = Object.freeze(['part', 'cutaway', 'exploded', 'process', 'assembly']);
export const LINE_STYLES = Object.freeze(['thick', 'thin', 'hidden', 'center', 'cut', 'fill', 'accent']);
export const SHAPE_TYPES = Object.freeze(['line', 'rect', 'circle', 'ellipse', 'arc', 'polyline', 'polygon', 'path', 'hatch', 'text', 'arrow', 'cutline']);
export const HATCH_PATTERNS = Object.freeze(['lines', 'cross', 'dots', 'solid']);
export const LOOK_DIRECTIONS = Object.freeze(['left', 'right', 'up', 'down']);
/** Every step pictogram is drawn in this local box (x 0..160, y 0..100). */
export const STEP_BOX = Object.freeze([160, 100]);
const HATCHABLE = new Set(['rect', 'circle', 'ellipse', 'polygon', 'path']);

export const LIMITS = Object.freeze({
  title: 80,
  subject: 80,
  scale: 12,
  canvasMin: Object.freeze([400, 300]),
  canvasMax: Object.freeze([2000, 2000]),
  canvasDefault: Object.freeze([1000, 700]),
  coord: 10000, // |x|, |y| of any point
  size: 10000, // radii, widths, heights
  views: 6,
  viewTitle: 40,
  shapesPerList: 400, // one view, the top level, or one step
  shapes: 800, // all lists together
  primitives: 4000, // after expanding repeats
  points: 200, // per polyline / polygon / hatch
  pathChars: 4000,
  pathNumbers: 1200,
  text: 120,
  textSize: Object.freeze([6, 60]),
  callouts: 80,
  calloutN: 999,
  parts: 60,
  partName: 60,
  partMaterial: 80,
  partNote: 120,
  qty: 9999,
  dimensions: 40,
  dimText: 24,
  dimOffset: 400,
  steps: 16,
  stepTitle: 60,
  stepDetail: 320,
  stepPhase: 24,
  stepShapes: 40,
  notes: 8,
  note: 200,
  sources: 12,
  sourceTitle: 120,
  url: 500,
  repeat: 120,
  warnings: 40,
});

// ---------------------------------------------------------------------------------------------
// Tool definition (frozen into new conversations by the engine; never edit a shipped version:
// add DRAW_BLUEPRINT_DESCRIPTION_V2 instead, SPEC §8.3).

export const DRAW_BLUEPRINT_DESCRIPTION = `Draw a 2D engineering blueprint sheet: blueprint paper with a grid, white linework, numbered callouts tied to a parts list, dimensions, notes, sources and a title block. The app renders it on the owner's screen (zoom, tap a callout, download SVG or PNG) and saves it in their library.

Call it only when the owner asks for a 2D drawing, blueprint or diagram: of an object, of one part of a hologram, or of how something is made ("process" sheet). Every sheet costs the owner money, so never draw one unprompted, and when the Saved list in <turn_context> already has it, call open_saved instead.

Work out the real geometry first (research when needed) and draw to one consistent scale so proportions are believable; fewer correct lines beat many vague ones. Follow the field descriptions for layout, line styles, hatching, callouts and dimensions.`;

const POINT = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: '[x, y]' };

const SHAPE_SCHEMA = {
  type: 'object',
  description:
    'One drawing primitive. Fields by type: line/arrow/cutline: from, to. rect: at (top-left corner), size [w, h], r (corner radius), rot. circle: at (center), r, r2 (inner radius, makes a ring). ellipse: at, rx, ry, rot. arc: at, r, from and to (angles; drawn clockwise from "from" to "to"). polyline/polygon/hatch: points. path: d (only M L H V C S Q T A Z commands and numbers). text: at, text, size, anchor. Closed shapes (rect, circle, ellipse, polygon, path) may add "hatch".',
  properties: {
    type: { type: 'string', enum: SHAPE_TYPES.slice() },
    style: {
      type: 'string',
      enum: LINE_STYLES.slice(),
      description: 'thick = visible outlines (default; thin for text and arrows); thin = secondary edges, threads, small details; hidden = dashed hidden or internal edges; center = dash-dot axes, drawn through every axis of symmetry and every hole; cut = cutting planes; fill = light tint; accent = the feature the owner asked about.',
    },
    at: POINT,
    from: { description: 'line/arrow/cutline: start point [x, y]. arc: start angle in degrees.', anyOf: [POINT, { type: 'number' }] },
    to: { description: 'line/arrow/cutline: end point [x, y] (the arrowhead end). arc: end angle in degrees.', anyOf: [POINT, { type: 'number' }] },
    size: {
      description: 'rect: [width, height]. text: font size in canvas units (default 14; 11-16 reads well).',
      anyOf: [{ type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, { type: 'number' }],
    },
    r: { type: 'number', description: 'Radius (circle, arc) or corner radius (rect).' },
    r2: { type: 'number', description: 'circle: inner radius; the hatch then fills only the ring.' },
    rx: { type: 'number' },
    ry: { type: 'number' },
    rot: { type: 'number', description: 'Rotation in degrees (rect and ellipse about their center, text about "at").' },
    points: { type: 'array', items: POINT, description: 'Vertices, at most 200.' },
    d: { type: 'string', description: 'SVG path data, absolute or relative commands.' },
    text: { type: 'string', description: 'Short label, max 120 characters; uppercase reads best on a drawing. View captions are added from view titles: do not write them as text.' },
    anchor: { type: 'string', enum: ['start', 'middle', 'end'], description: 'Horizontal text alignment at "at" (text is centred vertically on "at").' },
    both: { type: 'boolean', description: 'arrow: heads at both ends.' },
    label: { type: 'string', description: 'cutline: the section letter, e.g. "A" (gives SECTION A-A).' },
    look: { type: 'string', enum: LOOK_DIRECTIONS.slice(), description: 'cutline: the viewing direction the arrows point to.' },
    hatch: {
      description: 'Section fill for a cut solid. Adjacent parts must differ: 45 or 135 (degrees) for neighbouring metals, "cross" for plastics, rubber or laminations, "dots" for powders, pastes, gels and windings, "solid" for thin walls and gaskets; or { angle, spacing, pattern }.',
      anyOf: [{ type: 'number' }, { type: 'string', enum: HATCH_PATTERNS.slice() }, { type: 'object', properties: { angle: { type: 'number' }, spacing: { type: 'number' }, pattern: { type: 'string', enum: HATCH_PATTERNS.slice() } } }],
    },
    angle: { type: 'number', description: 'hatch shape: line angle in degrees.' },
    pattern: { type: 'string', enum: HATCH_PATTERNS.slice(), description: 'hatch shape: pattern.' },
    repeat: {
      type: 'object',
      description: 'Copies of this shape, for fins, fan blades, bolt circles, teeth and coils: { count, around: [x, y], step: degrees } rotates copies about a point (step defaults to 360/count), or { count, along: [dx, dy] } shifts each copy. count includes the original (2..120).',
      properties: { count: { type: 'integer' }, around: POINT, step: { type: 'number' }, along: POINT },
      required: ['count'],
    },
  },
  required: ['type'],
};

const CALLOUT_SCHEMA = {
  type: 'object',
  description: 'A numbered bubble with a leader to a part. Number the parts 1..N in a sensible order (outside in, or assembly order), one parts row per number, the same number for the same part in every view.',
  properties: {
    n: { type: 'integer', description: 'Part number from the parts list.' },
    at: { ...POINT, description: 'The point on the part the leader touches: clearly inside the part.' },
    label: { ...POINT, description: 'Optional bubble position. Leave it out to let the app place bubbles neatly around the view.' },
  },
  required: ['n', 'at'],
};

const DIMENSION_SCHEMA = {
  type: 'object',
  description: 'Only the few dimensions that matter (overall size, key diameters, critical fits), placed outside the outline; never dimension to hidden lines.',
  properties: {
    from: POINT,
    to: POINT,
    text: { type: 'string', description: 'The value with units, e.g. "152 mm", "Ø128", "R12" (max 24 characters).' },
    offset: { type: 'number', description: 'Distance from the measured points to the dimension line: positive = above (horizontal) or right (vertical), negative = below or left. Default 30.' },
    axis: { type: 'string', enum: ['x', 'y'], description: 'Optional. "x" measures only the horizontal distance (horizontal dimension line), "y" only the vertical one, even when the points are at different heights; offset is then counted from the outermost point.' },
  },
  required: ['from', 'to', 'text'],
};

export const DRAW_BLUEPRINT_INPUT_SCHEMA = {
  type: 'object',
  $defs: { point: POINT, shape: SHAPE_SCHEMA, callout: CALLOUT_SCHEMA, dimension: DIMENSION_SCHEMA },
  properties: {
    title: { type: 'string', description: 'What is drawn, e.g. "Alternator" (max 80 characters).' },
    subject: { type: 'string', description: 'The object or model it belongs to, e.g. "2024 Toyota Camry Hybrid" (max 80).' },
    sheet: { type: 'string', enum: SHEET_KINDS.slice(), description: 'part (one component, views + section), cutaway (inside layers), exploded, assembly, or process (how it is made). Default part.' },
    scale: { type: 'string', description: 'Scale note for the title block, e.g. "1:2" or "NTS" (default NTS, max 12).' },
    canvas: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
      description: 'The drawing area [width, height], 400-2000 each (default [1000, 700]). x grows right, y grows down; every angle is in degrees clockwise from +x. The app adds the border, title block, parts list, notes and sources around it: never draw those. Keep everything, text included, inside the canvas.',
    },
    names: { type: 'boolean', description: 'Print each part name beside its callout bubble. Default true for cutaway and exploded sheets, false otherwise.' },
    for: {
      type: 'object',
      description: 'When the sheet is for one part of a saved hologram, copy the ids from the request: { model: "lib_...", part: "<part id>" }. Leave out otherwise.',
      properties: { model: { type: 'string' }, part: { type: 'string' } },
    },
    views: {
      type: 'array',
      maxItems: LIMITS.views,
      description: 'The views, each drawn in its own local coordinates around (0, 0) and placed on the canvas with "at". Part sheet: FRONT VIEW plus SECTION A-A (a cutline labelled A across the front view, hatched cut faces in the section), and a side or DETAIL view if it helps. Cutaway: one large section with every layer hatched or tinted differently. Exploded: parts spread along their assembly axis on a center line. Assembly: the parts in place. Leave about 70 units clear around each view for callouts and dimensions (about 200 beside a view whose callouts show part names) and keep views apart.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Caption printed under the view, e.g. "FRONT VIEW", "SECTION A-A", "DETAIL B" (max 40).' },
          scale: { type: 'string', description: 'Optional view scale for the caption, e.g. "1:2".' },
          at: { ...POINT, description: 'Canvas position of this view\'s local (0, 0).' },
          shapes: { type: 'array', items: { $ref: '#/$defs/shape' } },
          callouts: { type: 'array', items: { $ref: '#/$defs/callout' } },
          dimensions: { type: 'array', items: { $ref: '#/$defs/dimension' } },
        },
        required: ['at', 'shapes'],
      },
    },
    shapes: { type: 'array', items: { $ref: '#/$defs/shape' }, description: 'Shapes in canvas coordinates, outside any view (e.g. arrows between views).' },
    callouts: { type: 'array', items: { $ref: '#/$defs/callout' }, description: 'Callouts in canvas coordinates (view callouts go in the view).' },
    dimensions: { type: 'array', items: { $ref: '#/$defs/dimension' }, description: 'Dimensions in canvas coordinates (view dimensions go in the view).' },
    parts: {
      type: 'array',
      maxItems: LIMITS.parts,
      description: 'One row per callout number: name, material, a short note (function, standard or finish) and qty when more than one. On a process sheet: the materials and inputs.',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer' },
          name: { type: 'string', description: 'Max 60 characters.' },
          material: { type: 'string', description: 'Max 80 characters.' },
          note: { type: 'string', description: 'Function, standard or finish (max 120).' },
          qty: { type: 'integer' },
        },
        required: ['n', 'name'],
      },
    },
    steps: {
      type: 'array',
      maxItems: LIMITS.steps,
      description: 'Process sheets ("how it\'s made"): 6 to 12 steps in order, each a short title, a concrete detail (materials, temperatures, forces, times, machines) and an optional pictogram. The steps are laid out as a numbered flow under the canvas, which can hold an overview drawing (the product cut open, a plant flow) or no shapes at all.',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer' },
          title: { type: 'string', description: 'Short step name (max 60).' },
          detail: { type: 'string', description: 'What happens, with concrete numbers (max 320).' },
          phase: { type: 'string', description: 'Optional stage tag, e.g. "BODY SHOP" (max 24).' },
          shapes: { type: 'array', items: { $ref: '#/$defs/shape' }, description: 'Optional pictogram in a local 160 x 100 box (x 0..160, y 0..100), max 40 shapes.' },
        },
        required: ['title'],
      },
    },
    notes: { type: 'array', items: { type: 'string' }, maxItems: LIMITS.notes, description: 'Short assumptions and caveats, e.g. "Dimensions typical, not to scale" (max 8).' },
    sources: {
      type: 'array',
      maxItems: LIMITS.sources,
      description: 'The pages you used (http or https), shown as links beside the sheet.',
      items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string', description: 'http or https URL.' } }, required: ['url'] },
    },
  },
  required: ['title', 'sheet'],
};

/** Freezes a JSON value and everything inside it (a frozen tool definition can never drift). */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
deepFreeze(DRAW_BLUEPRINT_INPUT_SCHEMA);

/**
 * The draw_blueprint tool definition, deeply frozen. It is frozen into conversations by the
 * engine's lead tools version 4 (SPEC §8.3): never edit it; a change needs a new tools version.
 */
export const DRAW_BLUEPRINT_TOOL = deepFreeze({
  name: 'draw_blueprint',
  description: DRAW_BLUEPRINT_DESCRIPTION,
  input_schema: DRAW_BLUEPRINT_INPUT_SCHEMA,
  eager_input_streaming: true,
});

/** The tool definition for the lead's tool list (a fresh deep copy). */
export function drawBlueprintTool() {
  return JSON.parse(JSON.stringify(DRAW_BLUEPRINT_TOOL));
}

// ---------------------------------------------------------------------------------------------
// Validation

// Control, format and bidi characters (built from code points so the source stays plain ASCII).
const CONTROL_RE = new RegExp(
  '[' +
    [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]]
      .map(([a, b]) => (a === b ? hex4(a) : `${hex4(a)}-${hex4(b)}`))
      .join('') +
    ']',
  'g',
);

function hex4(code) {
  return `\\u${code.toString(16).padStart(4, '0')}`;
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** One clean line: control/bidi characters removed, whitespace collapsed, cut to `max` code points. */
export function cleanText(value, max) {
  if (isNum(value)) value = String(value);
  if (typeof value !== 'string') return '';
  const s = value.replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim();
  const points = Array.from(s);
  if (points.length <= max) return s;
  return points.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
}

/** An absolute http(s) URL without credentials, as text, or null. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || s.length > LIMITS.url || /[\s\u0000-\u001F\u007F]/.test(s)) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password || !u.hostname) return null;
  return u.href;
}

function createContext(partial) {
  return { partial, warnings: [], extra: 0, shapes: 0, primitives: 0, budgetWarned: false };
}

function warn(ctx, path, message) {
  if (ctx.partial) return;
  if (ctx.warnings.length < LIMITS.warnings) ctx.warnings.push(path ? `${path}: ${message}` : message);
  else ctx.extra++;
}

function text(ctx, value, max, path, label) {
  const s = cleanText(value, max);
  if (!ctx.partial && typeof value === 'string' && Array.from(value.trim()).length > max) warn(ctx, path, `${label} was cut to ${max} characters`);
  return s;
}

function point(v) {
  let x;
  let y;
  if (Array.isArray(v) && v.length === 2) [x, y] = v;
  else if (isObj(v)) ({ x, y } = v);
  else return null;
  if (!isNum(x) || !isNum(y) || Math.abs(x) > LIMITS.coord || Math.abs(y) > LIMITS.coord) return null;
  return [round2(x), round2(y)];
}

function positive(v) {
  return isNum(v) && v > 0 && v <= LIMITS.size ? round2(v) : null;
}

function angle(v) {
  return isNum(v) && Math.abs(v) <= 100000 ? round2(v) : null;
}

function defaultLook(from, to) {
  return Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]) ? 'up' : 'left';
}

function normStyle(ctx, raw, fallback, path) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (LINE_STYLES.includes(s)) return s;
  warn(ctx, path, `unknown style "${cleanText(String(raw), 20)}" (used ${fallback})`);
  return fallback;
}

function normHatch(ctx, h, path) {
  let ang = 45;
  let spacing = null;
  let pattern = 'lines';
  if (isNum(h)) ang = h;
  else if (h === true) ang = 45;
  else if (typeof h === 'string') {
    const p = h.trim().toLowerCase();
    if (HATCH_PATTERNS.includes(p)) pattern = p;
    else if (/^-?\d+(\.\d+)?$/.test(p)) ang = Number(p);
    else warn(ctx, path, `unknown hatch "${cleanText(h, 20)}" (used 45)`);
  } else if (isObj(h)) {
    if (h.angle !== undefined) {
      if (isNum(h.angle)) ang = h.angle;
      else warn(ctx, path, 'hatch angle must be a number (used 45)');
    }
    if (h.spacing !== undefined) {
      if (isNum(h.spacing)) spacing = h.spacing;
      else warn(ctx, path, 'hatch spacing must be a number (ignored)');
    }
    if (h.pattern !== undefined) {
      const p = typeof h.pattern === 'string' ? h.pattern.trim().toLowerCase() : '';
      if (HATCH_PATTERNS.includes(p)) pattern = p;
      else warn(ctx, path, `unknown hatch pattern "${cleanText(String(h.pattern), 20)}" (used lines)`);
    }
  } else {
    warn(ctx, path, 'hatch must be an angle, a pattern name or an object (ignored)');
    return null;
  }
  const out = { pattern, angle: round2(((ang % 180) + 180) % 180) };
  if (spacing !== null) out.spacing = round2(Math.min(40, Math.max(2, spacing)));
  return out;
}

function normRepeat(ctx, r, path) {
  if (!isObj(r)) {
    warn(ctx, path, 'repeat must be an object (ignored)');
    return null;
  }
  if (!Number.isInteger(r.count) || r.count < 2 || r.count > LIMITS.repeat) {
    warn(ctx, path, `repeat.count must be a whole number from 2 to ${LIMITS.repeat} (ignored)`);
    return null;
  }
  if (r.along !== undefined) {
    const along = point(r.along);
    if (!along) {
      warn(ctx, path, 'repeat.along must be [dx, dy] (ignored)');
      return null;
    }
    return { count: r.count, along };
  }
  const around = r.around === undefined ? [0, 0] : point(r.around);
  if (!around) {
    warn(ctx, path, 'repeat.around must be [x, y] (ignored)');
    return null;
  }
  let step = 360 / r.count;
  if (r.step !== undefined) {
    if (isNum(r.step) && Math.abs(r.step) <= 360) step = r.step;
    else warn(ctx, path, 'repeat.step must be degrees between -360 and 360 (used 360/count)');
  }
  return { count: r.count, around, step: round2(step) };
}

function normPoints(raw, min) {
  if (!Array.isArray(raw) || raw.length < min || raw.length > LIMITS.points) return null;
  const out = [];
  for (const p of raw) {
    const q = point(p);
    if (!q) return null;
    out.push(q);
  }
  return out;
}

/** One shape, normalized; null (with a warning) when it cannot be drawn. */
function normShape(ctx, raw, path) {
  if (!isObj(raw)) {
    warn(ctx, path, 'not an object (dropped)');
    return null;
  }
  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!SHAPE_TYPES.includes(type)) {
    warn(ctx, path, type ? `unknown shape type "${cleanText(raw.type, 20)}" (dropped)` : 'missing "type" (dropped)');
    return null;
  }
  const drop = (why) => {
    warn(ctx, path, `${type} ${why} (dropped)`);
    return null;
  };
  const s = { type };
  switch (type) {
    case 'line':
    case 'arrow':
    case 'cutline': {
      s.from = point(raw.from);
      s.to = point(raw.to);
      if (!s.from || !s.to) return drop('needs "from" and "to" as [x, y]');
      if (s.from[0] === s.to[0] && s.from[1] === s.to[1]) return drop('has the same "from" and "to"');
      if (type === 'arrow' && raw.both === true) s.both = true;
      if (type === 'cutline') {
        const label = cleanText(raw.label, 3).toUpperCase();
        s.label = /^[A-Z0-9]{1,3}$/.test(label) ? label : 'A';
        if (raw.label !== undefined && s.label !== label) warn(ctx, path, 'cutline label must be 1-3 letters or digits (used "A")');
        const look = typeof raw.look === 'string' ? raw.look.trim().toLowerCase() : '';
        s.look = LOOK_DIRECTIONS.includes(look) ? look : defaultLook(s.from, s.to);
        if (raw.look !== undefined && !LOOK_DIRECTIONS.includes(look)) warn(ctx, path, `cutline look must be one of ${LOOK_DIRECTIONS.join(', ')}`);
      }
      break;
    }
    case 'rect': {
      s.at = point(raw.at);
      const size = Array.isArray(raw.size) && raw.size.length === 2 ? [positive(raw.size[0]), positive(raw.size[1])] : null;
      if (!s.at || !size || size[0] === null || size[1] === null) return drop('needs "at" [x, y] (top-left corner) and "size" [w, h] above 0');
      s.size = size;
      if (raw.r !== undefined) {
        if (isNum(raw.r) && raw.r >= 0) {
          const r = round2(Math.min(raw.r, size[0] / 2, size[1] / 2));
          if (r > 0) s.r = r;
        } else warn(ctx, path, 'rect r must be a number of at least 0 (ignored)');
      }
      break;
    }
    case 'circle': {
      s.at = point(raw.at);
      s.r = positive(raw.r);
      if (!s.at || s.r === null) return drop('needs "at" [x, y] (center) and "r" above 0');
      if (raw.r2 !== undefined) {
        const r2 = positive(raw.r2);
        if (r2 !== null && r2 < s.r) s.r2 = r2;
        else warn(ctx, path, 'circle r2 must be above 0 and smaller than r (ignored)');
      }
      break;
    }
    case 'ellipse': {
      s.at = point(raw.at);
      s.rx = positive(raw.rx);
      s.ry = positive(raw.ry);
      if (!s.at || s.rx === null || s.ry === null) return drop('needs "at" [x, y], "rx" and "ry" above 0');
      break;
    }
    case 'arc': {
      s.at = point(raw.at);
      s.r = positive(raw.r);
      const from = angle(raw.from);
      const to = angle(raw.to);
      if (!s.at || s.r === null || from === null || to === null) return drop('needs "at" [x, y], "r" above 0 and "from"/"to" angles in degrees');
      const start = round2(((from % 360) + 360) % 360);
      let sweep = (((to - from) % 360) + 360) % 360;
      if (sweep === 0) sweep = 360;
      s.from = start;
      s.to = round2(start + sweep);
      break;
    }
    case 'polyline':
    case 'polygon':
    case 'hatch': {
      const min = type === 'polyline' ? 2 : 3;
      s.points = normPoints(raw.points, min);
      if (!s.points) return drop(`needs "points": ${min} to ${LIMITS.points} [x, y] pairs`);
      break;
    }
    case 'path': {
      const parsed = parsePathData(raw.d, { maxChars: LIMITS.pathChars, maxNumbers: LIMITS.pathNumbers, maxAbs: LIMITS.coord });
      if (!parsed) return drop('"d" must start with M and use only M L H V C S Q T A Z commands and numbers (max 4000 characters)');
      s.d = parsed.d;
      const b = pathBounds(parsed.segments);
      s.bounds = b ? b.map(round2) : null;
      break;
    }
    case 'text': {
      s.at = point(raw.at);
      s.text = text(ctx, raw.text, LIMITS.text, path, 'text');
      if (!s.at || !s.text) return drop('needs "at" [x, y] and non-empty "text"');
      const size = raw.size === undefined ? 14 : isNum(raw.size) ? raw.size : null;
      if (size === null) warn(ctx, path, 'text size must be a number (used 14)');
      s.size = round2(Math.min(LIMITS.textSize[1], Math.max(LIMITS.textSize[0], size ?? 14)));
      const anchor = typeof raw.anchor === 'string' ? raw.anchor.trim().toLowerCase() : 'start';
      s.anchor = ['start', 'middle', 'end'].includes(anchor) ? anchor : 'start';
      break;
    }
    default:
      return null;
  }
  if ((type === 'rect' || type === 'ellipse' || type === 'text') && raw.rot !== undefined) {
    const rot = angle(raw.rot);
    if (rot === null) warn(ctx, path, 'rot must be a number of degrees (ignored)');
    else if (rot % 360 !== 0) s.rot = round2(rot % 360);
  }
  if (type !== 'hatch' && type !== 'cutline') {
    s.style = normStyle(ctx, raw.style, type === 'text' || type === 'arrow' ? 'thin' : 'thick', path);
  }
  if (type === 'hatch') {
    const spec = isObj(raw.hatch) ? raw.hatch : { angle: raw.angle, spacing: raw.spacing, pattern: raw.pattern };
    for (const k of Object.keys(spec)) if (spec[k] === undefined) delete spec[k];
    s.hatch = normHatch(ctx, spec, path) || { pattern: 'lines', angle: 45 };
  } else if (raw.hatch !== undefined && raw.hatch !== null && raw.hatch !== false) {
    if (HATCHABLE.has(type)) {
      const h = normHatch(ctx, raw.hatch, path);
      if (h) s.hatch = h;
    } else warn(ctx, path, `hatch only applies to closed shapes (rect, circle, ellipse, polygon, path), not ${type} (ignored)`);
  }
  if (raw.repeat !== undefined && raw.repeat !== null) {
    const rep = normRepeat(ctx, raw.repeat, path);
    if (rep) s.repeat = rep;
  }
  return s;
}

function normShapes(ctx, raw, path, cap = LIMITS.shapesPerList) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warn(ctx, path, 'must be an array (ignored)');
    return [];
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    if (out.length >= cap) {
      warn(ctx, path, `only the first ${cap} shapes are drawn`);
      break;
    }
    if (ctx.shapes >= LIMITS.shapes || ctx.primitives >= LIMITS.primitives) {
      if (!ctx.budgetWarned) warn(ctx, path, `the sheet is limited to ${LIMITS.shapes} shapes (${LIMITS.primitives} with repeats); the rest were dropped`);
      ctx.budgetWarned = true;
      break;
    }
    const s = normShape(ctx, raw[i], `${path}[${i}]`);
    if (!s) continue;
    const copies = s.repeat ? s.repeat.count : 1;
    if (ctx.primitives + copies > LIMITS.primitives) {
      delete s.repeat;
      warn(ctx, `${path}[${i}]`, 'repeat dropped: the sheet is out of shape budget');
    }
    ctx.shapes += 1;
    ctx.primitives += s.repeat ? s.repeat.count : 1;
    out.push(s);
  }
  return out;
}

function normCallouts(ctx, raw, path) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warn(ctx, path, 'must be an array (ignored)');
    return [];
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const p = `${path}[${i}]`;
    if (out.length >= LIMITS.callouts) {
      warn(ctx, path, `only the first ${LIMITS.callouts} callouts are drawn`);
      break;
    }
    if (!isObj(c)) {
      warn(ctx, p, 'not an object (dropped)');
      continue;
    }
    const at = point(c.at);
    if (!Number.isInteger(c.n) || c.n < 1 || c.n > LIMITS.calloutN || !at) {
      warn(ctx, p, `needs "n" (a part number 1-${LIMITS.calloutN}) and "at" [x, y] (dropped)`);
      continue;
    }
    const callout = { n: c.n, at };
    if (c.label !== undefined && c.label !== null) {
      const label = point(c.label);
      if (label) callout.label = label;
      else warn(ctx, p, 'label must be [x, y] (placed automatically)');
    }
    out.push(callout);
  }
  return out;
}

function normDimensions(ctx, raw, path) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warn(ctx, path, 'must be an array (ignored)');
    return [];
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i];
    const p = `${path}[${i}]`;
    if (out.length >= LIMITS.dimensions) {
      warn(ctx, path, `only the first ${LIMITS.dimensions} dimensions are drawn`);
      break;
    }
    if (!isObj(d)) {
      warn(ctx, p, 'not an object (dropped)');
      continue;
    }
    const from = point(d.from);
    const to = point(d.to);
    const label = text(ctx, d.text, LIMITS.dimText, p, 'text');
    if (!from || !to || !label) {
      warn(ctx, p, 'needs "from", "to" and "text" (dropped)');
      continue;
    }
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 1) {
      warn(ctx, p, '"from" and "to" are the same point (dropped)');
      continue;
    }
    let axis = null;
    if (d.axis !== undefined && d.axis !== null) {
      const a = typeof d.axis === 'string' ? d.axis.trim().toLowerCase() : '';
      if (a === 'x' || a === 'y') axis = a;
      else warn(ctx, p, 'axis must be "x" or "y" (ignored)');
    }
    if (axis && Math.abs(axis === 'x' ? to[0] - from[0] : to[1] - from[1]) < 1) {
      warn(ctx, p, `the points are at the same ${axis === 'x' ? 'x' : 'y'}, so an axis "${axis}" dimension measures nothing (dropped)`);
      continue;
    }
    let offset = 30;
    if (d.offset !== undefined) {
      if (isNum(d.offset) && Math.abs(d.offset) <= LIMITS.dimOffset) offset = round2(d.offset);
      else warn(ctx, p, `offset must be a number within ±${LIMITS.dimOffset} (used 30)`);
    }
    const dim = { from, to, text: label, offset };
    if (axis) dim.axis = axis;
    out.push(dim);
  }
  return out;
}

function normCanvas(ctx, raw) {
  const def = LIMITS.canvasDefault.slice();
  if (raw === undefined || raw === null) return def;
  if (!Array.isArray(raw) || raw.length !== 2 || !isNum(raw[0]) || !isNum(raw[1])) {
    warn(ctx, 'canvas', 'must be [width, height] (used 1000 x 700)');
    return def;
  }
  const w = round2(Math.min(LIMITS.canvasMax[0], Math.max(LIMITS.canvasMin[0], raw[0])));
  const h = round2(Math.min(LIMITS.canvasMax[1], Math.max(LIMITS.canvasMin[1], raw[1])));
  if (w !== raw[0] || h !== raw[1]) warn(ctx, 'canvas', `kept within 400-2000 (now ${w} x ${h})`);
  return [w, h];
}

// ---------------------------------------------------------------------------------------------
// Streaming: the stable prefix of a partially parsed draft

const LIST_KEYS = new Set(['shapes', 'callouts', 'dimensions', 'parts', 'notes', 'sources']);
const NESTED_LIST_KEYS = new Set(['views', 'steps']);

function stableItem(item) {
  // The last view or step may still be streaming: keep its complete keys, and of its last key only
  // the complete entries of a list (its last entry may be cut short).
  const keys = Object.keys(item);
  const lastKey = keys[keys.length - 1];
  const out = {};
  for (const key of keys) {
    if (key !== lastKey) out[key] = item[key];
    else if (LIST_KEYS.has(key) && Array.isArray(item[key])) out[key] = item[key].slice(0, -1);
  }
  return out;
}

/**
 * A tolerant partial-JSON parser returns the input streamed so far, but the values on its rightmost
 * path may be cut short: the last key of an object, the last element of an array (a string or a
 * number still being written - "12" of "120" - or an object missing its later keys). Returns a
 * copy of a streamed draw_blueprint draft that keeps only certainly-complete values: the last
 * top-level key is dropped unless it is a list (then its last entry is dropped), and the last view
 * or step keeps its complete keys and the complete entries of its last list. Normalize the result
 * with { partial: true } for a live preview; never feed an already-normalized spec through it.
 */
export function blueprintStablePrefix(draft) {
  if (!isObj(draft)) return {};
  const keys = Object.keys(draft);
  const lastKey = keys[keys.length - 1];
  const out = {};
  for (const key of keys) {
    const value = draft[key];
    if (key !== lastKey) out[key] = value;
    else if (Array.isArray(value) && LIST_KEYS.has(key)) out[key] = value.slice(0, -1);
    else if (Array.isArray(value) && NESTED_LIST_KEYS.has(key)) {
      out[key] = value.slice(0, -1);
      const last = value[value.length - 1];
      if (isObj(last)) out[key].push(stableItem(last));
    }
  }
  return out;
}

/**
 * Validate and normalize a draw_blueprint input. Never throws. Returns { spec, warnings };
 * spec is null when the input is not an object or has nothing to draw.
 */
export function normalizeBlueprintSpec(input, { partial = false } = {}) {
  const ctx = createContext(partial);
  if (!isObj(input)) {
    return { spec: null, warnings: ['The blueprint input must be a JSON object.'] };
  }
  let title = text(ctx, input.title, LIMITS.title, 'title', 'title');
  if (!title) {
    if (!partial) warn(ctx, 'title', 'missing (used "Blueprint")');
    title = partial ? '' : 'Blueprint';
  }
  const subject = text(ctx, input.subject, LIMITS.subject, 'subject', 'subject');
  let sheet = typeof input.sheet === 'string' ? input.sheet.trim().toLowerCase() : '';
  if (!SHEET_KINDS.includes(sheet)) {
    if (input.sheet !== undefined && !partial) warn(ctx, 'sheet', `must be one of ${SHEET_KINDS.join(', ')} (used part)`);
    sheet = 'part';
  }
  const scale = text(ctx, input.scale, LIMITS.scale, 'scale', 'scale') || 'NTS';
  const canvas = normCanvas(ctx, input.canvas);
  let names = sheet === 'cutaway' || sheet === 'exploded';
  if (input.names !== undefined) {
    if (typeof input.names === 'boolean') names = input.names;
    else warn(ctx, 'names', 'must be true or false (ignored)');
  }

  const views = [];
  if (input.views !== undefined && input.views !== null) {
    if (!Array.isArray(input.views)) warn(ctx, 'views', 'must be an array (ignored)');
    else {
      for (let i = 0; i < input.views.length; i++) {
        const v = input.views[i];
        const p = `views[${i}]`;
        if (views.length >= LIMITS.views) {
          warn(ctx, 'views', `only the first ${LIMITS.views} views are drawn`);
          break;
        }
        if (!isObj(v)) {
          warn(ctx, p, 'not an object (dropped)');
          continue;
        }
        let at = point(v.at);
        if (!at) {
          if (!partial) warn(ctx, p, '"at" must be [x, y] on the canvas (used the canvas center)');
          at = [round2(canvas[0] / 2), round2(canvas[1] / 2)];
        }
        views.push({
          title: text(ctx, v.title, LIMITS.viewTitle, p, 'title').toUpperCase(),
          scale: text(ctx, v.scale, LIMITS.scale, p, 'scale'),
          at,
          shapes: normShapes(ctx, v.shapes, `${p}.shapes`),
          callouts: normCallouts(ctx, v.callouts, `${p}.callouts`),
          dimensions: normDimensions(ctx, v.dimensions, `${p}.dimensions`),
        });
      }
    }
  }
  const shapes = normShapes(ctx, input.shapes, 'shapes');
  const callouts = normCallouts(ctx, input.callouts, 'callouts');
  const dimensions = normDimensions(ctx, input.dimensions, 'dimensions');
  const parts = normParts(ctx, input.parts);
  const steps = normSteps(ctx, input.steps);
  const notes = normNotes(ctx, input.notes);
  const sources = normSources(ctx, input.sources);

  const spec = { v: BLUEPRINT_SPEC_VERSION, title, subject, sheet, scale, canvas, names, views, shapes, callouts, dimensions, parts, steps, notes, sources };
  // Link to a saved hologram part (the app checks that it exists before using it).
  if (input.for !== undefined && input.for !== null) {
    const f = isObj(input.for) ? input.for : {};
    const model = typeof f.model === 'string' ? f.model.trim() : '';
    const part = typeof f.part === 'string' ? f.part.trim() : '';
    if (/^lib_[a-z0-9]{6,16}$/.test(model) && (part === '' || /^[a-z0-9][a-z0-9_-]{0,39}$/.test(part))) spec.for = part ? { model, part } : { model };
    else if (!partial) warn(ctx, 'for', 'must be { model: "lib_...", part: "<part id>" } from the request (ignored)');
  }

  const drawable = shapes.length || views.some((v) => v.shapes.length) || steps.length || parts.length;
  if (!drawable && !partial) {
    return { spec: null, warnings: ['Nothing to draw: give at least one view with shapes, process steps or a parts list.', ...ctx.warnings] };
  }
  if (!partial) crossCheck(ctx, spec);
  const warnings = ctx.warnings.slice();
  if (ctx.extra) warnings.push(`...and ${ctx.extra} more warnings`);
  return { spec, warnings };
}

function normParts(ctx, raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warn(ctx, 'parts', 'must be an array (ignored)');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    const path = `parts[${i}]`;
    if (out.length >= LIMITS.parts) {
      warn(ctx, 'parts', `only the first ${LIMITS.parts} parts are listed`);
      break;
    }
    if (!isObj(p)) {
      warn(ctx, path, 'not an object (dropped)');
      continue;
    }
    const name = text(ctx, p.name, LIMITS.partName, path, 'name');
    if (!Number.isInteger(p.n) || p.n < 1 || p.n > LIMITS.calloutN || !name) {
      warn(ctx, path, `needs "n" (1-${LIMITS.calloutN}) and "name" (dropped)`);
      continue;
    }
    if (seen.has(p.n)) {
      warn(ctx, path, `duplicate part number ${p.n} (dropped)`);
      continue;
    }
    seen.add(p.n);
    const part = { n: p.n, name, material: text(ctx, p.material, LIMITS.partMaterial, path, 'material'), note: text(ctx, p.note, LIMITS.partNote, path, 'note') };
    if (p.qty !== undefined && p.qty !== null) {
      if (Number.isInteger(p.qty) && p.qty >= 1 && p.qty <= LIMITS.qty) part.qty = p.qty;
      else warn(ctx, path, `qty must be a whole number 1-${LIMITS.qty} (ignored)`);
    }
    out.push(part);
  }
  return out.sort((a, b) => a.n - b.n);
}

function normSteps(ctx, raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warn(ctx, 'steps', 'must be an array (ignored)');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    const path = `steps[${i}]`;
    if (out.length >= LIMITS.steps) {
      warn(ctx, 'steps', `only the first ${LIMITS.steps} steps are drawn`);
      break;
    }
    if (!isObj(s)) {
      warn(ctx, path, 'not an object (dropped)');
      continue;
    }
    const title = text(ctx, s.title, LIMITS.stepTitle, path, 'title');
    if (!title) {
      warn(ctx, path, 'needs a "title" (dropped)');
      continue;
    }
    let order = i + 1;
    if (s.n !== undefined) {
      if (Number.isInteger(s.n) && s.n >= 1 && s.n <= 999) order = s.n;
      else warn(ctx, path, 'n must be a whole number (used its position)');
    }
    if (seen.has(order)) warn(ctx, path, `duplicate step number ${order} (steps are renumbered in order)`);
    seen.add(order);
    out.push({
      order,
      index: i,
      title,
      detail: text(ctx, s.detail, LIMITS.stepDetail, path, 'detail'),
      phase: text(ctx, s.phase, LIMITS.stepPhase, path, 'phase').toUpperCase(),
      shapes: normShapes(ctx, s.shapes, `${path}.shapes`, LIMITS.stepShapes),
    });
  }
  out.sort((a, b) => a.order - b.order || a.index - b.index);
  return out.map((s, i) => ({ n: i + 1, title: s.title, detail: s.detail, phase: s.phase, shapes: s.shapes }));
}

function normNotes(ctx, raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warn(ctx, 'notes', 'must be an array of strings (ignored)');
    return [];
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    if (out.length >= LIMITS.notes) {
      warn(ctx, 'notes', `only the first ${LIMITS.notes} notes are shown`);
      break;
    }
    const n = text(ctx, raw[i], LIMITS.note, `notes[${i}]`, 'note');
    if (n) out.push(n);
    else warn(ctx, `notes[${i}]`, 'empty or not text (dropped)');
  }
  return out;
}

function normSources(ctx, raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warn(ctx, 'sources', 'must be an array (ignored)');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    const path = `sources[${i}]`;
    if (out.length >= LIMITS.sources) {
      warn(ctx, 'sources', `only the first ${LIMITS.sources} sources are listed`);
      break;
    }
    const url = safeHttpUrl(isObj(s) ? s.url : s);
    if (!url) {
      warn(ctx, path, 'needs an http or https "url" (dropped)');
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    let title = isObj(s) ? text(ctx, s.title, LIMITS.sourceTitle, path, 'title') : '';
    if (!title) title = new URL(url).hostname;
    out.push({ title, url });
  }
  return out;
}

/** Content box of a view (canvas coordinates) or of the top-level shapes. */
export function viewContentBox(view) {
  const box = shapesBounds(view.shapes);
  return box ? translateBox(box, view.at[0], view.at[1]) : null;
}

function crossCheck(ctx, spec) {
  const partNumbers = new Set(spec.parts.map((p) => p.n));
  const called = new Set();
  const allCallouts = [...spec.callouts.map((c) => ({ c, path: 'callouts' })), ...spec.views.flatMap((v, i) => v.callouts.map((c) => ({ c, path: `views[${i}].callouts` })))];
  const missing = new Set();
  for (const { c } of allCallouts) {
    called.add(c.n);
    if (!partNumbers.has(c.n)) missing.add(c.n);
  }
  if (missing.size) warn(ctx, 'callouts', `no parts row for callout${missing.size > 1 ? 's' : ''} ${Array.from(missing).sort((a, b) => a - b).join(', ')}`);
  if (spec.sheet !== 'process' && spec.parts.length) {
    const uncalled = spec.parts.filter((p) => !called.has(p.n)).map((p) => p.n);
    if (uncalled.length) warn(ctx, 'parts', `no callout points to part${uncalled.length > 1 ? 's' : ''} ${uncalled.join(', ')}`);
  }
  if (spec.sheet === 'process' && !spec.steps.length) warn(ctx, 'steps', 'a process sheet needs steps');

  const [w, h] = spec.canvas;
  const tol = 4;
  const outside = (box) => box && (box[0] < -tol || box[1] < -tol || box[2] > w + tol || box[3] > h + tol);
  const describe = (box) => `x ${Math.round(box[0])}..${Math.round(box[2])}, y ${Math.round(box[1])}..${Math.round(box[3])}`;
  const boxes = [];
  spec.views.forEach((v, i) => {
    const box = viewContentBox(v);
    if (!box) return;
    boxes.push({ box, i });
    if (outside(box)) warn(ctx, `views[${i}]`, `reaches ${describe(box)}, outside the ${w} x ${h} canvas: it is clipped (move "at" or shrink the view)`);
  });
  const top = shapesBounds(spec.shapes);
  if (outside(top)) warn(ctx, 'shapes', `reach ${describe(top)}, outside the ${w} x ${h} canvas: they are clipped`);
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      if (boxesOverlap(boxes[a].box, boxes[b].box, -2)) warn(ctx, 'views', `views[${boxes[a].i}] and views[${boxes[b].i}] overlap; move them apart`);
    }
  }
  spec.steps.forEach((s, i) => {
    const box = shapesBounds(s.shapes);
    if (box && (box[0] < -6 || box[1] < -6 || box[2] > STEP_BOX[0] + 6 || box[3] > STEP_BOX[1] + 6)) {
      warn(ctx, `steps[${i}].shapes`, `reach ${describe(box)}, outside the 160 x 100 pictogram box: they are clipped`);
    }
  });
}

/** Counts for summaries and the library: { views, shapes, primitives, callouts, parts, dimensions, steps }. */
export function summarizeBlueprint(spec) {
  const lists = [spec.shapes, ...spec.views.map((v) => v.shapes), ...spec.steps.map((s) => s.shapes)];
  let shapes = 0;
  let primitives = 0;
  for (const list of lists) {
    shapes += list.length;
    for (const s of list) primitives += s.repeat ? s.repeat.count : 1;
  }
  return {
    views: spec.views.length,
    shapes,
    primitives,
    callouts: spec.callouts.length + spec.views.reduce((n, v) => n + v.callouts.length, 0),
    parts: spec.parts.length,
    dimensions: spec.dimensions.length + spec.views.reduce((n, v) => n + v.dimensions.length, 0),
    steps: spec.steps.length,
  };
}

const SHEET_LABELS = { part: 'part sheet', cutaway: 'cutaway', exploded: 'exploded view', process: 'process sheet', assembly: 'assembly drawing' };

/**
 * The tool_result for a draw_blueprint call: { content: string, is_error: boolean }.
 * Kept short: it stays in the conversation history.
 * `opts.libraryId` (when given): 'lib_…' once the sheet was saved to the owner's library, or null
 * when it could not be saved; the text then says which. Without opts the text keeps the original
 * wording ("drawn and saved").
 */
export function blueprintToolResult({ spec, warnings = [] } = {}, opts) {
  if (!spec) {
    return {
      content: `The blueprint could not be drawn. ${warnings.slice(0, 12).join(' ')} Fix the input and call draw_blueprint again.`.trim(),
      is_error: true,
    };
  }
  const c = summarizeBlueprint(spec);
  const bits = [];
  if (c.views) bits.push(`${c.views} view${c.views === 1 ? '' : 's'}`);
  bits.push(`${c.shapes} shapes`);
  if (c.callouts) bits.push(`${c.callouts} callouts`);
  if (c.parts) bits.push(`${c.parts} parts`);
  if (c.dimensions) bits.push(`${c.dimensions} dimensions`);
  if (c.steps) bits.push(`${c.steps} steps`);
  const library = opts && typeof opts === 'object' && 'libraryId' in opts;
  let content = library
    ? `Blueprint drawn: "${spec.title}" (${SHEET_LABELS[spec.sheet]}, ${bits.join(', ')}). The owner can see it now. ${savedSentence(opts.libraryId)}`
    : `Blueprint drawn and saved: "${spec.title}" (${SHEET_LABELS[spec.sheet]}, ${bits.join(', ')}). The owner can see it now.`;
  if (warnings.length) {
    const shown = warnings.slice(0, 12);
    content += `\nThe app corrected some input (the sheet is drawn as corrected; avoid these next time):\n${shown.map((w) => `- ${w}`).join('\n')}`;
    if (warnings.length > shown.length) content += `\n- ...and ${warnings.length - shown.length} more`;
  }
  return { content, is_error: false };
}

/** The library sentence of a tool_result: where the item was saved, or that it was not. */
export function savedSentence(libraryId) {
  return typeof libraryId === 'string' && /^lib_[a-z0-9]{6,16}$/.test(libraryId)
    ? `Saved to the owner's library as ${libraryId} (reopen it later with open_saved).`
    : 'It could not be saved to the owner\'s library this time.';
}

/** The sheet kind as words, e.g. 'part sheet', 'cutaway', 'process sheet'. */
export function sheetLabel(sheet) {
  return SHEET_LABELS[sheet] || SHEET_LABELS.part;
}

// Re-exported for the renderer and tests.
export { shapeBoundsWithRepeats, unionBox };
