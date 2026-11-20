// The hologram scene spec: the input of the client tool `show_hologram`.
//
//   normalizeHologramSpec(input, { partial, stable })  -> { spec, warnings, stats, ok }
//   stablePrefix(draft)                        -> the part of a streamed draft that is certainly complete
//   SHOW_HOLOGRAM_TOOL                         -> { name, description, input_schema, eager_input_streaming }
//                                                 (deeply frozen: it is frozen into conversations)
//   SHOW_HOLOGRAM_TOOL_V2                      -> version 2 (hull, panel, loft, soft boxes, smooth lathes,
//                                                 tapered tubes); frozen by lead tools V7, never mixed with V1
//   hullBox(shape) / isHalfOutline(points, i)  -> a hull's extents; is an outline half of a symmetric one
//   hologramToolResult(result, { libraryId })  -> { content, is_error } for the tool_result block
//   hologramSummary(spec)                      -> 'Hologram · <title> · 46 parts'
//   partBounds(part) / specBounds(spec)        -> approximate assembled bounds { min, max, size }
//
// Pure ES2022: no DOM, no three.js. Runs in the engine (live build while the input streams and
// validation of the final tool input), the UI (rendering) and Node tests.
//
// Coordinates: +y is up, +x is the object's front, +z its right side; units are given by `units`
// (labels only, nothing is converted). Every shape is positioned in the assembled state; `explode`
// moves a whole part in the exploded view.
//
// Realistic shapes (format v2, accepted in every spec so saved holograms reopen anywhere; only the
// V2 tool tells Claude about them): a `hull` is a solid carved from the object's blueprint views
// (side [x, y], top [x, z], front [z, y], or a revolve profile) with rounded edges, cuts and wheel
// arches; a `panel` is a part lying on an earlier part's hull (glass, doors, lights), drawn as an
// outline on one face of it; a `loft` is a smooth skin through cross-sections (fuselages, blades
// with twist). Boxes can be soft (`round` 0-1), lathes and extrudes `smooth`, tubes tapered (`r2`).
// The renderer meshes hulls and panels in a worker (src/ui/hologram/hull-*.js) and lofts at once
// (src/ui/hologram/smooth.js).
//
// Validation is strict but forgiving: unknown fields are ignored, an invalid shape or part is
// dropped with a warning (collected for the tool_result so Claude can learn from it), text is
// cleaned and truncated, ids are repaired and de-duplicated, numbers must be finite and inside the
// limits below. Text from the spec must only ever reach the page through textContent.

export const HOLOGRAM_LIMITS = Object.freeze({
  title: 80,
  subtitle: 120,
  notes: 6,
  note: 160,
  groups: 16,
  groupName: 40,
  parts: 80,
  partName: 40,
  info: 300,
  material: 80,
  aka: 4,
  akaText: 32,
  shapesPerPart: 24,
  shapes: 400,
  instances: 2000, // shapes after repeats, for the whole hologram
  repeat: 64,
  coord: 100000,
  size: 200000,
  profilePoints: 64,
  outlinePoints: 96,
  pathPoints: 64,
  // format v2
  hulls: 16, // hull shapes in one hologram (each is meshed in the worker)
  panels: 40, // panel shapes in one hologram
  viewPoints: 96, // hull side/top/front/revolve outlines and panel outlines
  cuts: 12, // per hull, wheel arches included
  arches: 8, // wheel openings of one hull or loft
  sections: 32, // loft cross-sections
  sectionPoints: 48, // points of a custom loft section outline
  warnings: 30,
});

/** The shape types of the first show_hologram tool (lead tools V4 to V6): the V1 schema enum. */
export const SHAPE_TYPES_V1 = Object.freeze(['box', 'cylinder', 'cone', 'sphere', 'torus', 'capsule', 'lathe', 'extrude', 'tube', 'line']);
/** Every shape type the validator and renderer accept: V1 plus the realistic shapes of format v2. */
export const SHAPE_TYPES = Object.freeze([...SHAPE_TYPES_V1, 'hull', 'panel', 'loft']);
/** Panel faces: which side of its hull a panel's outline is drawn on (and projected from). */
export const PANEL_FACES = Object.freeze(['right', 'left', 'sides', 'front', 'back', 'top', 'bottom']);
export const LOFT_AXES = Object.freeze(['x', 'y', 'z']);
// The two coordinates of a loft section, by loft axis (the plane across it, as an extrude outline).
const SECTION_KEYS = Object.freeze({ x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] });
const CUT_TYPES = ['box', 'cylinder', 'sphere'];
export const TONES = Object.freeze(['primary', 'secondary', 'accent', 'warning']);
export const UNITS = Object.freeze(['mm', 'cm', 'm', 'in']);
export const VIEWS = Object.freeze(['front', 'back', 'left', 'right', 'top', 'bottom', 'front-left', 'front-right', 'back-left', 'back-right']);
export const AXES = Object.freeze(['x', 'y', 'z', '-x', '-y', '-z']);
export const DEFAULT_VIEW = 'front-left';

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const L = HOLOGRAM_LIMITS;

const TYPE_ALIASES = {
  cube: 'box', block: 'box', cuboid: 'box', rect: 'box',
  cyl: 'cylinder', disc: 'cylinder', disk: 'cylinder', ring: 'cylinder', prism: 'cylinder',
  ball: 'sphere', ellipsoid: 'sphere',
  donut: 'torus', doughnut: 'torus',
  pill: 'capsule',
  revolve: 'lathe', revolution: 'lathe',
  extrusion: 'extrude', profile: 'extrude', plate: 'extrude',
  pipe: 'tube', hose: 'tube', cable: 'tube', wire: 'tube', sweep: 'tube',
  polyline: 'line', path: 'line',
  // format v2
  silhouette: 'hull', blueprint: 'hull', 'visual-hull': 'hull', visual_hull: 'hull', body: 'hull',
  decal: 'panel', patch: 'panel',
  sections: 'loft',
  superellipsoid: 'box', 'rounded-box': 'box', roundbox: 'box', pod: 'box', blob: 'box', squircle: 'box',
};
// Aliases that mean a soft box: `round` defaults to 0.5 for them.
const SOFT_BOX_ALIASES = new Set(['superellipsoid', 'rounded-box', 'roundbox', 'pod', 'blob', 'squircle']);
const PANEL_FACE_ALIASES = {
  side: 'sides', both: 'sides', 'both-sides': 'sides', 'left-right': 'sides', rear: 'back', above: 'top', under: 'bottom', below: 'bottom', underside: 'bottom',
  '+z': 'right', '-z': 'left', '+x': 'front', '-x': 'back', '+y': 'top', '-y': 'bottom',
};
const KEY_ALIASES = { position: 'at', pos: 'at', center: 'at', rotation: 'rot', rotate: 'rot', radius: 'r', height: 'h', length: 'h', points: null };
const UNIT_ALIASES = {
  mm: 'mm', millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm',
  cm: 'cm', centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm',
  m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  in: 'in', inch: 'in', inches: 'in', '"': 'in',
};
const VIEW_ALIASES = {
  iso: 'front-left', isometric: 'front-left', 'three-quarter': 'front-left', perspective: 'front-left', default: 'front-left',
  side: 'left', rear: 'back', above: 'top', plan: 'top', below: 'bottom', underside: 'bottom',
  'left-front': 'front-left', 'right-front': 'front-right', 'left-back': 'back-left', 'right-back': 'back-right',
  'rear-left': 'back-left', 'rear-right': 'back-right', 'left-rear': 'back-left', 'right-rear': 'back-right',
};

// ---------------------------------------------------------------------------------------------
// Small helpers

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Single-line text: control and bidi characters removed, whitespace collapsed, capped at max. */
export function cleanText(value, max) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  let s = String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) {
    let cut = max - 1;
    const code = s.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut--; // never split a surrogate pair
    s = s.slice(0, cut).trimEnd() + '…';
  }
  return s;
}

/** A spec id: lowercase a-z 0-9 - _, max 40, starting with a letter or digit; '' when impossible. */
export function normalizeId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  let s = String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  s = s.replace(/[\s./\\:]+/g, '-').replace(/[^a-z0-9_-]/g, '').replace(/-{2,}/g, '-').replace(/^[-_]+/, '');
  s = s.slice(0, 40).replace(/[-_]+$/, '');
  return ID_RE.test(s) ? s : '';
}

function uniqueId(base, used) {
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const id = base.slice(0, 40 - suffix.length).replace(/[-_]+$/, '') + suffix;
    if (!used.has(id)) return id;
  }
}

function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i.test(v)) return Number(v);
  return NaN;
}
const coord = (v) => {
  const n = num(v);
  return Math.abs(n) <= L.coord ? n : NaN;
};
const positive = (v) => {
  const n = num(v);
  return n > 0 && n <= L.size ? n : NaN;
};
const nonNegative = (v) => {
  const n = num(v);
  return n >= 0 && n <= L.size ? n : NaN;
};
const round = (n) => (Number.isInteger(n) ? n : Math.round(n * 1e4) / 1e4);

function vec3(v, check = coord) {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = v.map(check);
  return out.every(Number.isFinite) ? out.map(round) : null;
}

function points(v, dims, min, max, check = coord) {
  if (!Array.isArray(v) || v.length < min) return null;
  const out = [];
  for (const p of v.slice(0, max)) {
    if (!Array.isArray(p) || p.length < dims) return null;
    const q = p.slice(0, dims).map(check);
    if (!q.every(Number.isFinite)) return null;
    out.push(q.map(round));
  }
  return out;
}

function wrapDeg(d) {
  const w = d % 360;
  return round(w === 0 ? 0 : w); // -0 -> 0
}

function normAxis(v) {
  if (v === undefined || v === null || v === '') return { axis: null };
  const s = String(v).toLowerCase().replace(/\s+/g, '').replace(/^\+/, '').replace(/axis$/, '');
  return AXES.includes(s) ? { axis: s } : { axis: null, bad: true };
}

function normView(v) {
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (VIEWS.includes(s)) return s;
  return VIEW_ALIASES[s] || null;
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function extent2(pts) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [u, v] of pts) {
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  return Math.min(maxU - minU, maxV - minV);
}

/** Copy of a raw shape with common key aliases resolved (position -> at, radius -> r, ...). */
function resolveAliases(raw, type) {
  const s = {};
  for (const key of Object.keys(raw)) {
    const alias = Object.prototype.hasOwnProperty.call(KEY_ALIASES, key) ? KEY_ALIASES[key] : undefined;
    if (alias === undefined) s[key] = raw[key];
    else if (alias === null) {
      // "points": the polygon/profile/path, whichever this type uses
      const target = type === 'lathe' ? 'profile' : type === 'extrude' || type === 'panel' ? 'outline' : type === 'tube' || type === 'line' ? 'path' : null;
      if (target && s[target] === undefined) s[target] = raw[key];
    } else if (s[alias] === undefined && raw[alias] === undefined) s[alias] = raw[key];
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Shapes

/**
 * Validate one shape. Returns { shape, notes: [soft problems] } or { error } (shape dropped).
 * The normalized shape always has: type, at; optional axis, rot, repeat; plus the type's fields.
 * ctx (optional, from normalizeHologramSpec): { hulls: Map(part id -> [its normalized hull shapes]),
 * partIds: Set(ids of the earlier parts) } so a panel can be checked against the hull it lies on;
 * { cut: true } while normalizing a hull's cuts.
 */
export function normalizeShape(raw, ctx = null) {
  if (!isObj(raw)) return { error: 'not an object' };
  let type = typeof raw.type === 'string' ? raw.type.toLowerCase().trim() : '';
  const softBox = SOFT_BOX_ALIASES.has(type);
  if (TYPE_ALIASES[type]) type = TYPE_ALIASES[type];
  if (!SHAPE_TYPES.includes(type)) return { error: type ? `unknown type "${cleanText(type, 20)}"` : 'missing type' };
  const s = resolveAliases(raw, type);
  const notes = [];
  const out = { type, at: [0, 0, 0] };

  if (s.at !== undefined) {
    const at = vec3(s.at);
    if (!at) return { error: 'at must be [x, y, z] (finite numbers within ±100000)' };
    out.at = at;
  }
  if (s.rot !== undefined && s.rot !== null) {
    const rot = vec3(s.rot, num);
    if (!rot) return { error: 'rot must be [x, y, z] in degrees' };
    const r = rot.map(wrapDeg);
    if (r.some((d) => d !== 0)) out.rot = r;
  }
  if (type === 'panel') {
    // a panel lies on its hull: it has no position of its own
    if (out.at.some((v) => v !== 0)) notes.push('at ignored (a panel lies on the hull it names)');
    if (out.rot) notes.push('rot ignored (a panel lies on the hull it names)');
    out.at = [0, 0, 0];
    delete out.rot;
  }
  // a loft runs along its own x, y or z; a hull's axis is the axis of its revolve profile
  if (type !== 'box' && type !== 'sphere' && type !== 'tube' && type !== 'line' && type !== 'loft' && type !== 'hull' && type !== 'panel') {
    const { axis, bad } = normAxis(s.axis);
    if (bad) notes.push(`axis "${cleanText(String(s.axis), 8)}" is not one of x, y, z, -x, -y, -z (used ${type === 'extrude' ? 'z' : 'y'})`);
    if (axis && axis !== (type === 'extrude' ? 'z' : 'y')) out.axis = axis;
  }

  const need = (cond, msg) => (cond ? null : msg);
  let error = null;
  switch (type) {
    case 'box': {
      const size = vec3(s.size, positive);
      error = need(size, 'box needs size [x, y, z] with every value > 0');
      if (error) break;
      out.size = size;
      // round (0-1): a superellipsoid (soft block); r then only matters without it
      const rnd = s.round !== undefined ? num(s.round) : softBox ? 0.5 : NaN;
      if (s.round !== undefined && !(rnd >= 0 && rnd <= 1)) notes.push('round ignored (must be 0–1: 1 = ellipsoid, 0.5 = soft box, 0.2 = slightly rounded box)');
      if (rnd > 0 && rnd <= 1) {
        out.round = round(rnd);
        if (s.r !== undefined) notes.push('r ignored (round is set)');
        break;
      }
      if (s.r !== undefined) {
        const r = nonNegative(s.r);
        if (Number.isFinite(r) && r > 0) out.r = round(Math.min(r, Math.min(...size) * 0.49));
        else if (!Number.isFinite(r)) notes.push('r ignored (corner radius must be a number ≥ 0)');
      }
      break;
    }
    case 'cylinder': {
      const r = positive(s.r);
      const h = positive(s.h);
      error = need(r > 0 && h > 0, 'cylinder needs r > 0 and h > 0');
      if (error) break;
      out.r = round(r);
      out.h = round(h);
      if (s.r2 !== undefined) {
        const r2 = nonNegative(s.r2);
        if (Number.isFinite(r2)) {
          if (r2 !== r) out.r2 = round(r2);
        } else notes.push('r2 ignored (must be a number ≥ 0)');
      }
      if (s.hole !== undefined) {
        const hole = nonNegative(s.hole);
        const outer = Math.min(r, out.r2 ?? r);
        if (Number.isFinite(hole) && hole > 0 && hole < outer) out.hole = round(hole);
        else if (Number.isFinite(hole) && hole >= outer) notes.push('hole ignored (must be smaller than r and r2)');
        else if (!Number.isFinite(hole)) notes.push('hole ignored (must be a number ≥ 0)');
      }
      if (s.sides !== undefined) {
        const sides = Math.round(num(s.sides));
        if (sides >= 3 && sides <= 64) out.sides = sides;
        else notes.push('sides ignored (must be 3–64)');
      }
      break;
    }
    case 'cone': {
      const r = positive(s.r);
      const h = positive(s.h);
      error = need(r > 0 && h > 0, 'cone needs r > 0 and h > 0');
      if (error) break;
      out.r = round(r);
      out.h = round(h);
      if (s.sides !== undefined) {
        const sides = Math.round(num(s.sides));
        if (sides >= 3 && sides <= 64) out.sides = sides;
        else notes.push('sides ignored (must be 3–64)');
      }
      break;
    }
    case 'sphere': {
      const size = s.size !== undefined ? vec3(s.size, positive) : null;
      const r = positive(s.r);
      error = need(size || r > 0, 'sphere needs r > 0 (or size [x, y, z] for an ellipsoid)');
      if (error) break;
      if (size) out.size = size;
      else out.r = round(r);
      break;
    }
    case 'torus': {
      const r = positive(s.r);
      const tube = positive(s.tube);
      error = need(r > 0 && tube > 0, 'torus needs r > 0 and tube > 0');
      if (error) break;
      out.r = round(r);
      out.tube = round(tube);
      if (s.arc !== undefined) {
        const arc = num(s.arc);
        if (arc > 0 && arc < 360) out.arc = round(arc);
        else if (!(arc >= 360)) notes.push('arc ignored (degrees, 1–360)');
      }
      break;
    }
    case 'capsule': {
      const r = positive(s.r);
      const h = positive(s.h);
      error = need(r > 0 && h > 0, 'capsule needs r > 0 and h > 0 (total length)');
      if (error) break;
      out.r = round(r);
      out.h = round(Math.max(h, 2 * r));
      break;
    }
    case 'lathe': {
      const profile = points(s.profile, 2, 2, L.profilePoints);
      error = need(profile, 'lathe needs profile [[radius, height], …] with at least 2 points');
      if (error) break;
      if (Array.isArray(s.profile) && s.profile.length > L.profilePoints) notes.push(`profile cut to ${L.profilePoints} points`);
      const fixed = profile.map(([r, y]) => [Math.max(0, r), y]);
      const span = fixed.reduce((m, p) => Math.max(m, p[0]), 0);
      error = need(span > 0, 'lathe profile needs a point with radius > 0');
      if (error) break;
      out.profile = fixed;
      if (s.smooth === true) out.smooth = true;
      break;
    }
    case 'extrude': {
      const outline = points(s.outline, 2, 3, L.outlinePoints);
      const depth = positive(s.depth);
      error = need(outline && depth > 0, 'extrude needs outline [[u, v], …] (3+ points) and depth > 0');
      if (error) break;
      if (Array.isArray(s.outline) && s.outline.length > L.outlinePoints) notes.push(`outline cut to ${L.outlinePoints} points`);
      error = need(Math.abs(polygonArea(outline)) > 1e-9, 'extrude outline has no area');
      if (error) break;
      out.outline = outline;
      out.depth = round(depth);
      if (s.smooth === true) out.smooth = true;
      if (s.bevel !== undefined) {
        const bevel = nonNegative(s.bevel);
        if (Number.isFinite(bevel) && bevel > 0) out.bevel = round(Math.min(bevel, depth * 0.45, extent2(outline) * 0.3));
        else if (!Number.isFinite(bevel)) notes.push('bevel ignored (must be a number ≥ 0)');
      }
      break;
    }
    case 'tube': {
      const path = points(s.path, 3, 2, L.pathPoints);
      const r = positive(s.r);
      error = need(path && r > 0, 'tube needs path [[x, y, z], …] (2+ points) and r > 0');
      if (error) break;
      out.path = path;
      out.r = round(r);
      if (s.r2 !== undefined) {
        // a taper: radius r at the start of the path, r2 at its end
        const r2 = positive(s.r2);
        if (Number.isFinite(r2)) {
          if (r2 !== r) out.r2 = round(r2);
        } else notes.push('r2 ignored (must be a number > 0)');
      }
      break;
    }
    case 'line': {
      const path = points(s.path, 3, 2, L.pathPoints);
      error = need(path, 'line needs path [[x, y, z], …] with at least 2 points');
      if (error) break;
      out.path = path;
      break;
    }
    case 'loft': {
      const res = normalizeLoft(s, notes);
      if (res.error) error = res.error;
      else Object.assign(out, res.loft);
      break;
    }
    case 'hull': {
      error = need(!(ctx && ctx.cut), 'a hull cannot be a cut');
      if (error) break;
      error = normalizeHull(s, out, notes);
      break;
    }
    case 'panel': {
      error = need(!(ctx && ctx.cut), 'a panel cannot be a cut');
      if (error) break;
      error = normalizePanel(s, out, notes, ctx);
      break;
    }
  }
  if (error) return { error };

  if (s.repeat !== undefined && s.repeat !== null && type === 'panel') notes.push('repeat ignored (a panel lies on its hull)');
  else if (s.repeat !== undefined && s.repeat !== null) {
    const rep = normalizeRepeat(s.repeat);
    if (rep.repeat) out.repeat = rep.repeat;
    else notes.push(`repeat ignored (${rep.error})`);
  }
  return { shape: out, notes };
}

// ---------------------------------------------------------------------------------------------
// Loft: a smooth skin through cross-sections (src/ui/hologram/smooth.js)

/**
 * A loft: a smooth skin through cross-sections along x, y or z. Each section is
 * { <axis>: station, <u>/<v>: its center (default 0), w, h (or d), round, top, twist } or a custom
 * outline { <axis>, pts: [[u, v], …] } (offset by the center when one is given). The normalized
 * loft mirrors its input (sections keep their axis-named keys), so it validates again unchanged.
 */
function normalizeLoft(s, notes) {
  let axis = 'x';
  if (s.axis !== undefined && s.axis !== null && s.axis !== '') {
    const a = String(s.axis).toLowerCase().replace(/\s+/g, '').replace(/^[+-]/, '').replace(/axis$/, '');
    if (LOFT_AXES.includes(a)) axis = a;
    else notes.push(`axis "${cleanText(String(s.axis), 8)}" is not x, y or z (used x)`);
  }
  const [uKey, vKey] = SECTION_KEYS[axis];
  if (!Array.isArray(s.sections) || s.sections.length < 2) return { error: `loft needs sections: 2 or more cross-sections, each { ${axis}: position along the loft, w, h }` };
  if (s.sections.length > L.sections) notes.push(`sections cut to ${L.sections}`);
  const list = [];
  for (const [i, raw] of s.sections.slice(0, L.sections).entries()) {
    const res = normalizeSection(raw, axis, uKey, vKey);
    if (res.error) {
      notes.push(`sections[${i}] dropped (${res.error})`);
      continue;
    }
    if (res.note) notes.push(`sections[${i}]: ${res.note}`);
    list.push(res.section);
  }
  if (list.length < 2) return { error: 'loft needs at least 2 valid sections' };
  // sections run along the axis: written front to back is fine (reversed); otherwise sorted
  const st = list.map((sec) => sec[axis]);
  const increasing = st.every((v, i) => i === 0 || v >= st[i - 1]);
  const decreasing = st.every((v, i) => i === 0 || v <= st[i - 1]);
  let reversed = false;
  if (!increasing && decreasing) {
    list.reverse();
    reversed = true;
  } else if (!increasing) {
    list.sort((a, b) => a[axis] - b[axis]);
    notes.push(`sections sorted by ${axis} (give them in order along the loft)`);
  }
  const span = list[list.length - 1][axis] - list[0][axis];
  if (!(span > 0)) return { error: `loft sections must be at different ${axis} positions` };
  const sections = [list[0]];
  for (const sec of list.slice(1)) {
    if (sec[axis] - sections[sections.length - 1][axis] <= span * 1e-6) {
      notes.push(`a section at ${axis} = ${sec[axis]} repeats a position; dropped`);
      continue;
    }
    sections.push(sec);
  }
  if (sections.length < 2) return { error: 'loft needs at least 2 sections at different positions' };
  const loft = { axis, sections };
  if (s.cap !== undefined && s.cap !== null) {
    const c = s.cap === true ? 'both' : s.cap === false ? 'none' : String(s.cap).toLowerCase().trim();
    const cap = { both: 'both', none: 'none', start: 'start', end: 'end', true: 'both', false: 'none' }[c];
    if (!cap) notes.push('cap ignored (true, false, "start" or "end")');
    // start and end are the first and last section as written; the normalized loft runs from
    // its lowest station, so a reversed list swaps them
    else if (cap !== 'both') loft.cap = reversed && cap === 'start' ? 'end' : reversed && cap === 'end' ? 'start' : cap;
  }
  if (s.arches !== undefined && s.arches !== null) {
    const arches = points(s.arches, 3, 1, L.arches);
    if (!arches || arches.some((a) => !(a[2] > 0))) notes.push(`arches ignored (a list of [${axis}, ${vKey}, radius] wheel-arch circles)`);
    else {
      if (s.arches.length > L.arches) notes.push(`arches cut to ${L.arches}`);
      loft.arches = arches;
    }
  }
  return { loft };
}

function normalizeSection(raw, axis, uKey, vKey) {
  if (!isObj(raw)) return { error: 'not an object' };
  const stRaw = raw[axis] !== undefined ? raw[axis] : raw.at !== undefined && !Array.isArray(raw.at) ? raw.at : raw.s;
  const station = coord(stRaw);
  if (!Number.isFinite(station)) return { error: `needs ${axis}: its position along the loft` };
  const sec = { [axis]: round(station) };
  const notes = [];
  // the two coordinates across: a number is the section's center, [min, max] its extent
  const span = {};
  for (const [key, sizeKey] of [
    [uKey, 'w'],
    [vKey, 'h'],
  ]) {
    const val = raw[key];
    if (val === undefined || val === null) continue;
    let center;
    if (Array.isArray(val)) {
      const a = coord(val[0]);
      const b = coord(val[1]);
      if (val.length !== 2 || !Number.isFinite(a) || !Number.isFinite(b) || a === b) return { error: `${key} must be a number (the center) or [min, max] (the extent)` };
      center = (a + b) / 2;
      span[sizeKey] = Math.abs(b - a);
    } else {
      center = coord(val);
      if (!Number.isFinite(center)) return { error: `${key} must be a number (the center) or [min, max] (the extent)` };
    }
    if (center !== 0) sec[key] = round(center);
  }
  if (raw.pts !== undefined || raw.points !== undefined || raw.outline !== undefined) {
    const pts = points(raw.pts ?? raw.points ?? raw.outline, 2, 3, L.sectionPoints);
    if (!pts) return { error: 'pts must be [[u, v], …] with 3 or more points' };
    if (Math.abs(polygonArea(pts)) <= 1e-9) return { error: 'pts outline has no area' };
    sec.pts = pts;
  } else {
    const d = positive(raw.d ?? raw.diameter);
    const rr = raw.r !== undefined ? positive(raw.r) : NaN;
    const size = (key, given) => {
      if (span[key] !== undefined) {
        if (Number.isFinite(given) && Math.abs(given - span[key]) > span[key] * 1e-3) notes.push(`${key} ignored (the ${key === 'w' ? uKey : vKey} range sets it)`);
        return span[key];
      }
      if (Number.isFinite(given)) return given;
      if (Number.isFinite(d)) return d;
      if (Number.isFinite(rr)) return 2 * rr;
      return NaN;
    };
    const w = size('w', positive(raw.w ?? raw.width));
    const h = size('h', positive(raw.h ?? raw.height));
    if (!(w > 0) || !(h > 0)) return { error: `needs its size: w and h (or d), or ${uKey} and ${vKey} as [min, max]` };
    sec.w = round(w);
    sec.h = round(h);
    if (raw.top !== undefined) {
      const top = positive(raw.top);
      if (Number.isFinite(top) && top <= 3 * w) {
        if (top !== w) sec.top = round(top);
      } else notes.push('top ignored (the width at the top, > 0 and at most 3 × w)');
    }
  }
  if (raw.round !== undefined) {
    const r = num(raw.round);
    if (r >= 0 && r <= 1) {
      if (r !== 1) sec.round = round(r);
    } else notes.push('round ignored (0–1: 1 = ellipse, 0.5 = soft box, 0.2 = box with small rounded corners)');
  }
  if (raw.twist !== undefined) {
    const t = num(raw.twist);
    if (Number.isFinite(t)) {
      const tw = wrapDeg(t);
      if (tw !== 0) sec.twist = tw;
    } else notes.push('twist ignored (degrees)');
  }
  return { section: sec, note: notes.join('; ') || null };
}

// ---------------------------------------------------------------------------------------------
// Hull: a solid carved from blueprint views (side [x, y], top [x, z], front [z, y], or a revolve
// profile); see src/ui/hologram/hull-mesh.js. A top or front outline drawn on one side of z = 0 is
// half of a left-right symmetric object and is mirrored.

const HULL_VIEWS = [
  // key, [u axis, v axis] in model coordinates, index of z in a point (-1: none)
  ['side', ['x', 'y'], -1],
  ['top', ['x', 'z'], 1],
  ['front', ['z', 'y'], 0],
];
// The view that sets each extent when two views disagree a little (the other one is stretched to
// it); a revolve profile sets the extent along its own axis.
const EXTENT_MASTERS = { x: ['side', 'top'], y: ['side', 'front'], z: ['top', 'front'] };
const HULL_ROUND_NOTE = "a hull's edge radius is r; round is the 0–1 softness of boxes and loft sections";
const AXIS_K = { x: 0, y: 1, z: 2 };

/**
 * 'right' when a top or front outline (z at zIndex) is the right half of a left-right symmetric
 * object: every z ≥ -0.5% of its z span and its nearest z within 10% of its farthest; 'left' for
 * the mirror image (every z ≤ 0); otherwise false.
 */
function halfSide(pts, zIndex) {
  if (!Array.isArray(pts) || pts.length < 2 || !(zIndex >= 0)) return false;
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    min = Math.min(min, p[zIndex]);
    max = Math.max(max, p[zIndex]);
  }
  const span = max - min;
  if (!(span > 0)) return false;
  const tol = span * 0.005;
  if (min >= -tol && max > 0 && min <= max * 0.1) return 'right';
  if (max <= tol && min < 0 && max >= min * 0.1) return 'left';
  return false;
}

/** Is this top [x, z] (zIndex 1) or front [z, y] (zIndex 0) outline half of a symmetric object? */
export function isHalfOutline(pts, zIndex) {
  return !!halfSide(pts, zIndex);
}

/**
 * A half outline the way the mesher reads it: the right half (a left half is flipped), its points
 * near the centerline on it (within 2% of the half width; the first and last point within 10%), and
 * starting or ending there. Returns { pts, changed }.
 */
function normalizeHalfOutline(pts, zIndex) {
  const side = halfSide(pts, zIndex);
  if (!side) return { pts, changed: false };
  let changed = side === 'left';
  const out = pts.map((p) => {
    const q = p.slice();
    if (side === 'left') q[zIndex] = -q[zIndex] || 0;
    return q;
  });
  let max = 0;
  for (const p of out) max = Math.max(max, p[zIndex]);
  const snap = (p) => {
    if (p[zIndex] !== 0) {
      p[zIndex] = 0;
      changed = true;
    }
  };
  out.forEach((p, i) => {
    if (p[zIndex] <= max * (i === 0 || i === out.length - 1 ? 0.1 : 0.02)) snap(p);
  });
  // a half outline reaches the centerline: when only points in between come near it, they do
  if (!out.some((p) => p[zIndex] === 0)) for (const p of out) if (p[zIndex] <= max * 0.1) snap(p);
  // the mirror image is joined along the centerline: the outline closes there (last point to first)
  const on = out.map((p) => p[zIndex] === 0);
  if (!(on[0] && on[on.length - 1])) {
    let k = on.indexOf(true);
    while (k + 1 < on.length && on[k + 1]) k++;
    if (k > 0) {
      out.push(...out.splice(0, k));
      changed = true;
    }
  }
  return { pts: out, changed };
}

/** The [lo, hi] range of one axis of a view's outline (z mirrored for a half outline). */
function viewRange(pts, index, zIndex) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    lo = Math.min(lo, p[index]);
    hi = Math.max(hi, p[index]);
  }
  if (index === zIndex && halfSide(pts, zIndex)) {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    return [-m, m];
  }
  return [lo, hi];
}

/** Each view's range on each axis: { x: [[view, [lo, hi]], …], y, z }, the revolve's included. */
function hullRanges(shape) {
  const ranges = { x: [], y: [], z: [] };
  for (const [key, axes, zi] of HULL_VIEWS) {
    const pts = shape[key];
    if (!Array.isArray(pts) || !pts.length) continue;
    axes.forEach((axis, i) => ranges[axis].push([key, viewRange(pts, i, zi)]));
  }
  if (Array.isArray(shape.revolve) && shape.revolve.length >= 2) {
    const ax = String(shape.axis || 'y');
    const letter = ax.replace('-', '');
    const rmax = Math.max(...shape.revolve.map((p) => p[0]));
    let [a0, a1] = viewRange(shape.revolve, 1, -1);
    if (ax.startsWith('-')) [a0, a1] = [-a1, -a0];
    for (const axis of ['x', 'y', 'z']) ranges[axis].push(['revolve', axis === letter ? [a0, a1] : [-rmax, rmax]]);
  }
  return ranges;
}

/** The box a hull's views can enclose: { x: [lo, hi], y, z, ranges } or null when they do not overlap. */
export function hullBox(shape) {
  const ranges = hullRanges(shape);
  const box = { ranges };
  for (const axis of ['x', 'y', 'z']) {
    if (!ranges[axis].length) return null;
    const lo = Math.max(...ranges[axis].map((r) => r[1][0]));
    const hi = Math.min(...ranges[axis].map((r) => r[1][1]));
    if (!(hi > lo)) return null;
    box[axis] = [lo, hi];
  }
  if (shape.mirror && !(box.z[0] < 0 && box.z[1] > 0)) {
    // an off-center mirrored hull (a pair of door mirrors) stands on both sides
    const m = Math.max(Math.abs(box.z[0]), Math.abs(box.z[1]));
    box.z = [-m, m];
  }
  return box;
}

const fmtRange = (r) => `${round(r[0])}…${round(r[1])}`;

/** Why a hull's views enclose nothing: the first pair of views that do not overlap. */
function overlapError(out) {
  const ranges = hullRanges(out);
  for (const axis of ['x', 'y', 'z']) {
    const rs = ranges[axis];
    for (let a = 0; a < rs.length; a++) {
      for (let b = a + 1; b < rs.length; b++) {
        const [ka, ra] = rs[a];
        const [kb, rb] = rs[b];
        if (!(Math.min(ra[1], rb[1]) > Math.max(ra[0], rb[0]))) {
          return `hull views do not overlap: ${ka} spans ${axis} ${fmtRange(ra)} but ${kb} spans ${fmtRange(rb)} (all views use the same model coordinates)`;
        }
      }
    }
  }
  return 'hull views do not overlap (all views use the same model coordinates)';
}

/**
 * Views that disagree a little on an extent (at most 10% of the span at either end) are stretched
 * to the master view's range; a bigger disagreement keeps the overlap only, with a warning.
 */
function fitExtents(out, notes) {
  const ranges = hullRanges(out);
  const revolveAxis = out.revolve ? String(out.axis || 'y').replace('-', '') : null;
  for (const axis of ['x', 'y', 'z']) {
    const rs = ranges[axis];
    if (rs.length < 2) continue;
    const masterKey = axis === revolveAxis ? 'revolve' : EXTENT_MASTERS[axis].find((k) => rs.some((r) => r[0] === k));
    const master = rs.find((r) => r[0] === masterKey);
    if (!master) continue;
    const [m0, m1] = master[1];
    for (const [key, [e0, e1]] of rs) {
      if (key === masterKey) continue;
      const span = Math.max(m1 - m0, e1 - e0);
      const d0 = Math.abs(e0 - m0);
      const d1 = Math.abs(e1 - m1);
      if (d0 > span * 0.1 || d1 > span * 0.1) {
        notes.push(`${masterKey} spans ${axis} ${fmtRange(master[1])} but ${key} spans ${fmtRange([e0, e1])}: only the overlap is solid`);
      } else if ((d0 > span * 0.002 || d1 > span * 0.002) && key !== 'revolve') {
        // (a revolve cannot be stretched one way only: a small mismatch just keeps the overlap)
        const [, axes, zi] = HULL_VIEWS.find((v) => v[0] === key);
        const i = axes.indexOf(axis);
        const half = i === zi && halfSide(out[key], zi);
        const k = half ? Math.max(Math.abs(m0), Math.abs(m1)) / e1 : (m1 - m0) / (e1 - e0);
        out[key] = out[key].map((p) => {
          const q = p.slice();
          q[i] = round(half ? p[i] * k : m0 + (p[i] - e0) * k);
          return q;
        });
        notes.push(`${key} ${axis} stretched to the ${masterKey}'s ${fmtRange(master[1])} (was ${fmtRange([e0, e1])})`);
      }
    }
  }
}

/** Where wheel arches cut a hull: its +z side (mirrored when the hull is), or both of its sides. */
function archSides(out, box) {
  const [z0, z1] = box.z;
  if (out.mirror) return [z1];
  if (z0 < 0 && z1 > 0) return [z1, z0];
  return [z1 > 0 ? z1 : z0];
}

const REVOLVE_NO_AREA = 'hull revolve outline has no area: start or end it on the axis (radius 0) for a solid, or give the wall: out along the outer radius and back along the inner one, e.g. [[300, 0], [300, 400], [260, 400], [260, 0]]';

/**
 * Whether a revolve profile [[radius, along], …] encloses anything, closed the way the mesher closes
 * it (revolvePolygon in hull-mesh.js): through the axis when it starts or ends there (a solid), as
 * written otherwise (a hollow section). A two-point "drum" [[300, 0], [300, 400]] is just a line.
 */
function revolveHasArea(profile) {
  const pts = profile.map(([r, a]) => [a, r]);
  const rmax = Math.max(...pts.map((p) => p[1]));
  const onAxis = (p) => p[1] <= rmax * 0.002;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const solid = onAxis(first) || onAxis(last);
  const poly = solid ? [...(onAxis(first) ? [] : [[first[0], 0]]), ...pts, ...(onAxis(last) ? [] : [[last[0], 0]])] : pts;
  const along = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const ext = Math.max(along, rmax);
  return Math.abs(polygonArea(poly)) > ext * ext * 1e-6;
}

function normalizeHull(s, out, notes) {
  let given = 0;
  for (const [key, axes, zi] of HULL_VIEWS) {
    if (s[key] === undefined || s[key] === null) continue;
    const pts = points(s[key], 2, 3, L.viewPoints);
    if (!pts) return `hull ${key} must be [[${axes[0]}, ${axes[1]}], …] with at least 3 points`;
    if (Array.isArray(s[key]) && s[key].length > L.viewPoints) notes.push(`${key} cut to ${L.viewPoints} points`);
    if (!(Math.abs(polygonArea(pts)) > 1e-9)) return `hull ${key} outline has no area`;
    if (zi >= 0) {
      const half = normalizeHalfOutline(pts, zi);
      if (half.changed) notes.push(`${key}: taken as a half outline and mirrored`);
      out[key] = half.pts;
    } else out[key] = pts;
    given++;
  }
  if (s.revolve !== undefined && s.revolve !== null) {
    // a lathe-style profile [[radius, along], …] turned around `axis` (a solid of revolution)
    const pts = points(s.revolve, 2, 2, L.viewPoints);
    if (!pts) return 'hull revolve must be [[radius, along], …] with at least 2 points';
    const fixed = pts.map(([r, a]) => [Math.max(0, r), a]);
    if (!fixed.some((p) => p[0] > 0)) return 'hull revolve needs a point with radius > 0';
    if (!revolveHasArea(fixed)) return REVOLVE_NO_AREA;
    if (Array.isArray(s.revolve) && s.revolve.length > L.viewPoints) notes.push(`revolve cut to ${L.viewPoints} points`);
    out.revolve = fixed;
    const { axis, bad } = normAxis(s.axis);
    if (bad) notes.push(`axis "${cleanText(String(s.axis), 8)}" is not one of x, y, z, -x, -y, -z (used y)`);
    if (axis && axis !== 'y') out.axis = axis;
    given += 2;
  }
  if (given < 2) return 'hull needs at least two of side [[x, y], …], top [[x, z], …] and front [[z, y], …] (or a revolve profile)';
  const half = (out.top && isHalfOutline(out.top, 1)) || (out.front && isHalfOutline(out.front, 0));
  if (s.mirror === true || half) out.mirror = true;
  else if (s.mirror !== undefined && s.mirror !== false) notes.push('mirror ignored (true or false)');
  if (!hullBox(out)) return overlapError(out);
  fitExtents(out, notes);
  const box = hullBox(out);
  if (!box) return overlapError(out);

  // the edge radius where the views meet: r (fillet); round is the 0-1 softness of other shapes
  let r = s.r !== undefined && s.r !== null ? s.r : s.fillet;
  if (s.round !== undefined && s.round !== null) {
    const v = num(s.round);
    const shown = Number.isFinite(v) ? round(v) : `"${cleanText(String(s.round), 12)}"`;
    if (v > 1 && (r === undefined || r === null)) {
      r = v;
      notes.push(`round taken as r (${shown}): ${HULL_ROUND_NOTE}`);
    } else notes.push(`round ignored (${shown}): ${HULL_ROUND_NOTE}`);
  }
  if (r !== undefined && r !== null) {
    const v = nonNegative(r);
    if (Number.isFinite(v)) out.r = round(v);
    else notes.push('r ignored (the edge radius in model units, a number ≥ 0)');
  }

  const cuts = [];
  if (s.cut !== undefined && s.cut !== null) {
    const list = Array.isArray(s.cut) ? s.cut : isObj(s.cut) ? [s.cut] : null;
    if (!list) notes.push('cut ignored (an array of box, cylinder or sphere shapes)');
    else {
      if (list.length > L.cuts) notes.push(`only the first ${L.cuts} cuts are used`);
      list.slice(0, L.cuts).forEach((c, i) => {
        const res = normalizeShape(c, { cut: true });
        if (res.error) notes.push(`cut[${i}] dropped: ${res.error}`);
        else if (!CUT_TYPES.includes(res.shape.type)) notes.push(`cut[${i}] dropped: only box, cylinder and sphere can cut a hull`);
        else {
          for (const n of res.notes) notes.push(`cut[${i}]: ${n}`);
          cuts.push(res.shape);
        }
      });
    }
  }
  // wheel arches: z cylinders through the body's side (the mirror image cuts the other side),
  // as deep as the wheel well; they count towards the cuts
  if (s.arches !== undefined && s.arches !== null) {
    const arches = points(s.arches, 3, 1, L.arches);
    if (!out.top && !out.front) notes.push('arches ignored: needs a top or front view');
    else if (!arches || arches.some((a) => !(a[2] > 0))) notes.push('arches ignored (a list of [x, y, r] wheel openings: the wheel center and the opening radius)');
    else {
      if (s.arches.length > L.arches) notes.push(`arches cut to ${L.arches}`);
      const sides = archSides(out, box);
      const fit = Math.min(arches.length, Math.floor((L.cuts - cuts.length) / sides.length));
      if (fit < arches.length) notes.push(`only ${fit} of the arches fit: a hull has at most ${L.cuts} cuts, wheel arches included`);
      for (const [x, y, ar] of arches.slice(0, Math.max(0, fit))) {
        for (const z of sides) {
          const res = normalizeShape({ type: 'cylinder', axis: 'z', at: [x, y, z], r: ar, h: 2 * Math.max(0.4 * Math.abs(z), 0.6 * ar) }, { cut: true });
          if (res.shape) cuts.push(res.shape);
        }
      }
    }
  }
  if (cuts.length) out.cut = cuts;
  return null;
}

// Panel: the part of a hull's surface inside an outline drawn on one of its faces (a window, a
// door, a headlight on a car body). face -> the outline's plane and the axis across it.
const PANEL_PLANES = { right: ['x', 'y'], left: ['x', 'y'], sides: ['x', 'y'], front: ['z', 'y'], back: ['z', 'y'], top: ['x', 'z'], bottom: ['x', 'z'] };
const PANEL_DEPTH_AXIS = { right: 'z', left: 'z', sides: 'z', front: 'x', back: 'x', top: 'y', bottom: 'y' };

function normalizePanel(s, out, notes, ctx) {
  const on = normalizeId(s.on);
  if (!on) return 'panel needs on: the id of an earlier part that has a hull';
  const hulls = ctx && ctx.hulls ? ctx.hulls.get(on) : undefined;
  if (ctx && ctx.hulls && !hulls) {
    if (ctx.partIds && ctx.partIds.has(on)) return `panel on "${on}": that part has no hull (panels lie on hulls only)`;
    return `panel on "${on}": no earlier part with that id has a hull`;
  }
  out.on = on;
  const rawFace = s.face !== undefined ? s.face : s.view; // "view" is accepted for the face
  let face = typeof rawFace === 'string' ? rawFace.toLowerCase().trim().replace(/[\s_]+/g, '-') : '';
  if (PANEL_FACE_ALIASES[face]) face = PANEL_FACE_ALIASES[face];
  if (!PANEL_FACES.includes(face)) return `panel needs face: one of ${PANEL_FACES.join(', ')}`;
  out.face = face;
  const plane = PANEL_PLANES[face];
  const outline = points(s.outline, 2, 3, L.viewPoints);
  if (!outline) return `panel needs outline [[${plane[0]}, ${plane[1]}], …] with at least 3 points`;
  if (Array.isArray(s.outline) && s.outline.length > L.viewPoints) notes.push(`outline cut to ${L.viewPoints} points`);
  if (!(Math.abs(polygonArea(outline)) > 1e-9)) return 'panel outline has no area';
  out.outline = outline;
  if (s.mirror === true) {
    if (face === 'sides' || face === 'left' || face === 'right') notes.push('mirror ignored (use face "sides" for both sides)');
    else out.mirror = true;
  }
  if (s.wrap === true) out.wrap = true;
  if (s.lift !== undefined && s.lift !== null) {
    const lift = nonNegative(s.lift);
    if (Number.isFinite(lift)) out.lift = round(lift);
    else notes.push('lift ignored (a number ≥ 0)');
  }
  const b = hulls && hulls.length ? boundsOfShapes(hulls) : null;
  if (b) {
    // the face the panel lies on, across its plane (for bounds and labels)
    const k = AXIS_K[PANEL_DEPTH_AXIS[face]];
    if (face === 'right' || face === 'front' || face === 'top') out.span = [b.max[k], b.max[k]];
    else if (face === 'left' || face === 'back' || face === 'bottom') out.span = [b.min[k], b.min[k]];
    else out.span = [b.min[k], b.max[k]];
    // an outline mostly outside the hull in its plane was written in another face's coordinates
    const iu = AXIS_K[plane[0]];
    const iv = AXIS_K[plane[1]];
    const us = outline.map((p) => p[0]);
    const vs = outline.map((p) => p[1]);
    const u = [Math.min(...us), Math.max(...us)];
    const v = [Math.min(...vs), Math.max(...vs)];
    const ou = Math.max(0, Math.min(u[1], b.max[iu]) - Math.max(u[0], b.min[iu]));
    const ov = Math.max(0, Math.min(v[1], b.max[iv]) - Math.max(v[0], b.min[iv]));
    if (ou * ov < (u[1] - u[0]) * (v[1] - v[0]) * 0.5) {
      notes.push(
        `panel outline lies outside the ${face === 'sides' ? 'side' : face} view of ${on} (${plane[0]} ${fmtRange(u)}, ${plane[1]} ${fmtRange(v)}; the hull spans ${plane[0]} ${fmtRange([b.min[iu], b.max[iu]])}, ${plane[1]} ${fmtRange([b.min[iv], b.max[iv]])}): check its coordinates`,
      );
    }
  }
  return null;
}

function normalizeRepeat(raw) {
  if (!isObj(raw)) return { error: 'must be an object' };
  const count = Math.round(num(raw.count));
  if (!(count >= 2)) return { error: 'count must be 2 or more' };
  const capped = Math.min(count, L.repeat);
  if (raw.along !== undefined) {
    const along = vec3(raw.along);
    if (!along || along.every((v) => v === 0)) return { error: 'along must be a non-zero [dx, dy, dz]' };
    return { repeat: { count: capped, along } };
  }
  const { axis } = normAxis(raw.around);
  if (!axis) return { error: 'needs around: "x" | "y" | "z" (rotated copies) or along: [dx, dy, dz] (offset copies)' };
  let step = raw.step === undefined ? 360 / capped : num(raw.step);
  if (!Number.isFinite(step) || step === 0 || Math.abs(step) > 360) return { error: 'step must be degrees between copies' };
  const start = raw.start === undefined ? 0 : num(raw.start);
  if (!Number.isFinite(start)) return { error: 'start must be degrees' };
  let center = [0, 0, 0];
  if (raw.center !== undefined) {
    center = vec3(raw.center);
    if (!center) return { error: 'center must be [x, y, z]' };
  }
  const rep = { count: capped, around: axis.replace('-', ''), step: round(step), start: wrapDeg(start) };
  if (center.some((v) => v !== 0)) rep.center = center;
  return { repeat: rep };
}

// ---------------------------------------------------------------------------------------------
// Streaming: the stable prefix of a partially parsed draft

/**
 * A tolerant partial-JSON parser returns the input streamed so far, but values on its rightmost
 * path may be cut short: the last key of an object, the last element of an array (a string or a
 * number still being written, an object missing its later keys). Everything else is final.
 *
 * Returns a copy of a streamed `show_hologram` draft that keeps only certainly-complete values:
 * the last top-level key is dropped unless it is `parts` (then the last part is kept without its
 * own last key, and with only its complete shapes) or `groups`/`notes` (their last entry is
 * dropped). Shapes are never shown half-written, so a shape never changes once it is drawn.
 */
export function stablePrefix(draft) {
  if (!isObj(draft)) return {};
  const keys = Object.keys(draft);
  const lastKey = keys[keys.length - 1];
  const out = {};
  for (const key of keys) {
    const value = draft[key];
    if (key !== lastKey) {
      out[key] = value;
    } else if (key === 'parts' && Array.isArray(value)) {
      out.parts = value.slice(0, -1);
      const last = value[value.length - 1];
      if (isObj(last)) out.parts.push(stablePart(last));
    } else if ((key === 'groups' || key === 'notes') && Array.isArray(value)) {
      out[key] = value.slice(0, -1);
    }
  }
  return out;
}

function stablePart(part) {
  const keys = Object.keys(part);
  const lastKey = keys[keys.length - 1];
  const out = { __streaming: true };
  for (const key of keys) {
    if (key !== lastKey) out[key] = part[key];
    else if ((key === 'shapes' || key === 'aka') && Array.isArray(part[key])) out[key] = part[key].slice(0, -1);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The whole spec

/**
 * Validate and normalize a `show_hologram` input.
 *
 * input: the parsed object (or a JSON string).
 * partial: true while the input is still streaming. The draft is first cut to its stable prefix;
 *   missing title/parts are not errors, warnings are not collected, a part with no shapes yet is
 *   kept (shapes: []) and the part still being written carries `streaming: true`.
 * stable: false skips the stable-prefix cut in partial mode. Use it to re-check a spec that is
 *   already normalized (e.g. a segment's live spec): cutting it again would drop the last shape of
 *   its last part.
 *
 * Returns { spec, warnings: string[], stats: { parts, shapes, instances, dropped }, ok }.
 * ok is false (with spec null or without parts) when nothing can be shown; warnings say why.
 *
 * Normalized spec:
 *   { title, subtitle, units, view, notes: [], groups: [{ id, name }],
 *     parts: [{ key, index, id, name, aka: [], group, tone, info, material, explode, anchor, shapes, streaming? }] }
 *   key = 'p<index>' where index is the part's position in the input array: stable while streaming
 *   and when invalid parts are dropped, so a renderer can diff by key.
 */
export function normalizeHologramSpec(input, { partial = false, stable = true } = {}) {
  const warnings = [];
  let dropped = 0;
  const warn = (msg) => {
    if (!partial) warnings.push(msg);
  };
  let src = input;
  if (typeof src === 'string') {
    try {
      src = JSON.parse(src);
    } catch {
      return { spec: null, warnings: ['The input is not valid JSON.'], stats: emptyStats(), ok: false };
    }
  }
  if (!isObj(src)) {
    return { spec: null, warnings: partial ? [] : ['The input must be an object with title and parts.'], stats: emptyStats(), ok: partial };
  }
  if (partial && stable !== false) src = stablePrefix(src);

  const spec = { title: '', subtitle: '', units: 'mm', view: DEFAULT_VIEW, notes: [], groups: [], parts: [] };

  spec.title = cleanText(src.title, L.title);
  if (!spec.title) {
    if (src.title !== undefined || !partial) warn('title: missing; shown as "Hologram".');
    spec.title = partial ? '' : 'Hologram';
  }
  spec.subtitle = cleanText(src.subtitle, L.subtitle);

  if (src.units !== undefined) {
    const u = UNIT_ALIASES[String(src.units).toLowerCase().trim()];
    if (u) spec.units = u;
    else warn(`units: "${cleanText(String(src.units), 12)}" is not one of mm, cm, m, in; used mm.`);
  }
  if (src.view !== undefined) {
    const v = normView(src.view);
    if (v) spec.view = v;
    else warn(`view: "${cleanText(String(src.view), 20)}" is not a known view; used ${DEFAULT_VIEW}.`);
  }

  // Groups
  const groupIds = new Set();
  if (src.groups !== undefined) {
    if (!Array.isArray(src.groups)) warn('groups: must be an array; ignored.');
    else {
      if (src.groups.length > L.groups) warn(`groups: only the first ${L.groups} are used.`);
      for (const [i, g] of src.groups.slice(0, L.groups).entries()) {
        if (!isObj(g)) {
          warn(`groups[${i}]: not an object; dropped.`);
          continue;
        }
        let id = normalizeId(g.id) || normalizeId(g.name);
        if (!id) {
          warn(`groups[${i}]: needs an id; dropped.`);
          continue;
        }
        if (groupIds.has(id)) {
          warn(`groups[${i}]: duplicate id "${id}"; dropped.`);
          continue;
        }
        groupIds.add(id);
        spec.groups.push({ id, name: cleanText(g.name, L.groupName) || id });
      }
    }
  }

  // Parts
  const used = new Set();
  const hulls = new Map(); // part id -> its hull shapes (a later panel lies on one of them)
  const ctx = { hulls, partIds: used };
  let shapeCount = 0;
  let instanceCount = 0;
  let hullCount = 0;
  let panelCount = 0;
  let shapeCapWarned = false;
  let instanceCapWarned = false;
  const rawParts = src.parts;
  if (rawParts !== undefined && !Array.isArray(rawParts)) warn('parts: must be an array.');
  const list = Array.isArray(rawParts) ? rawParts : [];
  if (list.length > L.parts) warn(`parts: ${list.length} given; only the first ${L.parts} are shown.`);

  for (let index = 0; index < Math.min(list.length, L.parts); index++) {
    const raw = list[index];
    const streaming = partial && isObj(raw) && raw.__streaming === true;
    if (!isObj(raw)) {
      warn(`parts[${index}]: not an object; dropped.`);
      dropped++;
      continue;
    }
    const rawName = cleanText(raw.name, L.partName);
    const label = rawName ? `parts[${index}] "${rawName}"` : `parts[${index}]`;

    let id = normalizeId(raw.id);
    if (!id) {
      id = normalizeId(rawName) || `part-${index + 1}`;
      if (raw.id !== undefined || !partial) warn(`${label}: id ${raw.id === undefined ? 'missing' : `"${cleanText(String(raw.id), 40)}" invalid`}; using "${id}".`);
    }
    if (used.has(id)) {
      const next = uniqueId(id, used);
      warn(`${label}: duplicate id "${id}"; renamed "${next}".`);
      id = next;
    }

    let name = rawName;
    if (!name && !(streaming && raw.name === undefined)) {
      name = titleFromId(id);
      warn(`${label}: name missing; labeled "${name}".`);
    }

    let group = null;
    if (raw.group !== undefined && raw.group !== null && raw.group !== '') {
      const gid = normalizeId(raw.group);
      if (gid && groupIds.has(gid)) group = gid;
      else warn(`${label}: group "${cleanText(String(raw.group), 40)}" is not in groups; ignored.`);
    }

    let tone = 'primary';
    if (raw.tone !== undefined) {
      const t = String(raw.tone).toLowerCase().trim();
      if (TONES.includes(t)) tone = t;
      else warn(`${label}: tone "${cleanText(String(raw.tone), 16)}" is not one of ${TONES.join(', ')}; used primary.`);
    }

    let explode = null;
    if (raw.explode !== undefined && raw.explode !== null) {
      explode = vec3(raw.explode);
      if (!explode) warn(`${label}: explode must be [dx, dy, dz] numbers; ignored.`);
    }

    let anchor = null;
    if (raw.anchor !== undefined && raw.anchor !== null) {
      anchor = vec3(raw.anchor);
      if (!anchor) warn(`${label}: anchor must be [x, y, z] numbers; ignored.`);
    }

    const aka = [];
    if (Array.isArray(raw.aka)) {
      for (const a of raw.aka.slice(0, L.aka)) {
        const t = cleanText(a, L.akaText);
        if (t && !aka.includes(t)) aka.push(t);
      }
    }

    const shapes = [];
    const rawShapes = raw.shapes;
    if (rawShapes !== undefined && !Array.isArray(rawShapes)) warn(`${label}: shapes must be an array.`);
    const shapeList = Array.isArray(rawShapes) ? rawShapes : [];
    if (shapeList.length > L.shapesPerPart) warn(`${label}: ${shapeList.length} shapes; only the first ${L.shapesPerPart} are used.`);
    for (let j = 0; j < Math.min(shapeList.length, L.shapesPerPart); j++) {
      if (shapeCount >= L.shapes) {
        if (!shapeCapWarned) warn(`shapes: the hologram is limited to ${L.shapes} shapes; later shapes were dropped.`);
        shapeCapWarned = true;
        dropped++;
        break;
      }
      const { shape, notes, error } = normalizeShape(shapeList[j], ctx);
      const where = `${label} shapes[${j}]${shape || isObj(shapeList[j]) ? ` (${(shape && shape.type) || cleanText(String(shapeList[j].type ?? '?'), 12)})` : ''}`;
      if (error) {
        warn(`${where}: dropped: ${error}.`);
        dropped++;
        continue;
      }
      // hulls are meshed in a worker and panels on them: a hologram has a budget of each
      if ((shape.type === 'hull' && hullCount >= L.hulls) || (shape.type === 'panel' && panelCount >= L.panels)) {
        warn(`${where}: dropped: more than ${shape.type === 'hull' ? `${L.hulls} hulls` : `${L.panels} panels`} in one hologram.`);
        dropped++;
        continue;
      }
      if (shape.type === 'hull') hullCount++;
      if (shape.type === 'panel') panelCount++;
      for (const n of notes) warn(`${where}: ${n}.`);
      let copies = shape.repeat ? shape.repeat.count : 1;
      if (instanceCount + copies > L.instances) {
        const room = L.instances - instanceCount;
        if (!instanceCapWarned) warn(`repeat: the hologram is limited to ${L.instances} shapes including copies; some copies were dropped.`);
        instanceCapWarned = true;
        if (room < 1) {
          dropped++;
          continue;
        }
        if (shape.repeat) {
          if (room >= 2) shape.repeat.count = room;
          else delete shape.repeat;
        }
        copies = shape.repeat ? shape.repeat.count : 1;
      }
      shapeCount++;
      instanceCount += copies;
      shapes.push(shape);
    }

    if (!shapes.length && !partial) {
      warn(`${label}: dropped: no valid shapes.`);
      dropped++;
      continue;
    }
    used.add(id);
    const partHulls = shapes.filter((sh) => sh.type === 'hull');
    if (partHulls.length) hulls.set(id, partHulls);
    const part = {
      key: `p${index}`,
      index,
      id,
      name,
      aka,
      group,
      tone,
      info: cleanText(raw.info, L.info),
      material: cleanText(raw.material, L.material),
      explode,
      anchor,
      shapes,
    };
    if (streaming) part.streaming = true;
    spec.parts.push(part);
  }

  if (src.notes !== undefined) {
    if (!Array.isArray(src.notes)) warn('notes: must be an array of strings; ignored.');
    else {
      for (const n of src.notes.slice(0, L.notes)) {
        const t = cleanText(n, L.note);
        if (t) spec.notes.push(t);
      }
      if (src.notes.length > L.notes) warn(`notes: only the first ${L.notes} are shown.`);
    }
  }

  const ok = partial || spec.parts.length > 0;
  if (!ok) warnings.unshift('Nothing to show: add at least one part with a valid shape.');
  return {
    spec,
    warnings: capWarnings(warnings),
    stats: { parts: spec.parts.length, shapes: shapeCount, instances: instanceCount, dropped },
    ok,
  };
}

function emptyStats() {
  return { parts: 0, shapes: 0, instances: 0, dropped: 0 };
}

function capWarnings(list) {
  if (list.length <= L.warnings) return list;
  return [...list.slice(0, L.warnings - 1), `…and ${list.length - (L.warnings - 1)} more.`];
}

function titleFromId(id) {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return cleanText(words.charAt(0).toUpperCase() + words.slice(1), L.partName) || 'Part';
}

// ---------------------------------------------------------------------------------------------
// Chat card / tool result helpers

/** 'Hologram · 2024 Toyota Camry Hybrid · 46 parts' */
export function hologramSummary(spec) {
  if (!spec) return 'Hologram';
  const n = spec.parts ? spec.parts.length : 0;
  return `Hologram · ${spec.title || 'Untitled'} · ${n} part${n === 1 ? '' : 's'}`;
}

/** The library sentence of a tool_result: where the item was saved, or that it was not. */
export function librarySentence(libraryId) {
  return typeof libraryId === 'string' && /^lib_[a-z0-9]{6,16}$/.test(libraryId)
    ? `Saved to the owner's library as ${libraryId} (reopen it later with open_saved).`
    : "It could not be saved to the owner's library this time.";
}

/**
 * The tool_result for a finished show_hologram call. `opts.libraryId` (when given): 'lib_…' once
 * the hologram was saved to the owner's library, or null when it could not be saved.
 */
export function hologramToolResult(result, opts) {
  if (!result || !result.ok || !result.spec) {
    const why = result && result.warnings && result.warnings.length ? result.warnings.join('\n') : 'The input could not be read.';
    return { is_error: true, content: `The hologram could not be shown.\n${why}\nFix the input and call show_hologram again.` };
  }
  const { spec, warnings, stats } = result;
  const saved = opts && typeof opts === 'object' && 'libraryId' in opts ? ` ${librarySentence(opts.libraryId)}` : '';
  const lines = [`Hologram shown to the owner: "${spec.title}" with ${stats.parts} labeled part${stats.parts === 1 ? '' : 's'} (${stats.shapes} shapes). The owner can rotate it, expand it, tap parts, and ask for a 2D blueprint of a part, which is built only when they ask.${saved}`];
  if (warnings.length) {
    lines.push(`${warnings.length} problem${warnings.length === 1 ? '' : 's'} (the rest was shown):`);
    for (const w of warnings) lines.push(`- ${w}`);
  }
  return { is_error: false, content: lines.join('\n') };
}

// ---------------------------------------------------------------------------------------------
// The tool definition (frozen into new conversations by the engine's next tools version)

const v3 = (description) => ({ type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description });

export const SHOW_HOLOGRAM_DESCRIPTION = [
  'Show the owner an interactive 3D hologram of a physical object, built from simple shapes with every part labeled. The owner can rotate and zoom it, expand it into an exploded view, tap a part to read about it, and ask for a 2D blueprint later (only built when they ask).',
  'Use it when the owner asks to see, show, pull up or understand how something physical is built or works, including when they ask for a diagram or blueprint of it: the hologram is the answer, and a 2D sheet comes only if they ask for one after seeing it. Model the specific object (the exact make, model, version or size when given), with real dimensions and real part positions: research them first when you are not sure.',
  'The parts appear one by one while you write the input, so write the large recognizable structure first (a car body and wheels, a battery can) and smaller or inner parts after, and write each part\'s fields in the order listed (shapes last). Then say in a sentence or two what the owner is looking at; the labels and part cards carry the details.',
].join('\n\n');

export const HOLOGRAM_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'What the hologram shows, specific, e.g. "2024 Toyota Camry Hybrid (XV70)" or "AA alkaline battery (LR6)". Max 80 characters.' },
    subtitle: { type: 'string', description: 'One line of key facts, e.g. "Front-wheel drive · 2.5 L hybrid · 4,885 mm long". Max 120 characters.' },
    units: { type: 'string', enum: [...UNITS], description: 'Unit of every coordinate and size (labels only). mm (default) suits most objects.' },
    view: {
      type: 'string',
      enum: [...VIEWS],
      description: 'Starting camera view. front looks at the +x face. Default front-left (three-quarter view).',
    },
    groups: {
      type: 'array',
      maxItems: L.groups,
      description: 'Optional part groups shown on part cards, e.g. engine, body, interior.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Lowercase id: a-z, 0-9, - and _.' },
          name: { type: 'string', description: 'Group name, max 40 characters.' },
        },
        required: ['id', 'name'],
      },
    },
    parts: {
      type: 'array',
      minItems: 1,
      maxItems: L.parts,
      description:
        'The components, each a real, separately nameable part. Aim for 8–20 parts for a simple object, 20–40 for a machine, 35–60 for a vehicle or building (max 80). Coordinates: +y is up, +x is the object\'s front (a car\'s nose, an alternator\'s pulley end), +z is its right side. Put the object on y = 0 or centered on the origin. Use real dimensions and keep parts where they really are relative to each other: believable proportions matter more than detail.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique lowercase id: a-z, 0-9, - and _ (max 40), e.g. "brake-fl".' },
          name: { type: 'string', description: 'The label on the hologram: short and specific, ideally under 24 characters (max 40), e.g. "Rotor" or "Brake disc (FL)". Every part is labeled.' },
          aka: { type: 'array', items: { type: 'string' }, maxItems: L.aka, description: 'Optional other names the owner might say, e.g. ["alternator"] on a DC-DC converter that replaces one.' },
          group: { type: 'string', description: 'Optional group id.' },
          tone: {
            type: 'string',
            enum: [...TONES],
            description: 'primary for most parts; secondary for housings, shells and body panels (drawn fainter so inner parts show through); accent for the parts that matter most to the question; warning for high voltage, heat, pressure or other hazards.',
          },
          info: { type: 'string', description: 'One or two accurate sentences: what the part does and anything notable (max 300 characters). Say when something is different from what the owner may expect (e.g. a hybrid has no alternator).' },
          material: { type: 'string', description: 'Main materials, max 80 characters.' },
          explode: v3(
            'Offset [dx, dy, dz] of the whole part in the exploded view, in model units, along its natural removal direction (a lid lifts up, a wheel moves outward, a shaft slides out along its axis). Give every part except the central or base one an offset, move neighbours apart so no two parts overlap when exploded, and keep the exploded model within about 2–3 times the assembled size.',
          ),
          anchor: v3('Optional point the label\'s leader line points at (assembled state). Default: the center of the part; set it for shells and large parts whose center is inside other parts.'),
          shapes: {
            type: 'array',
            minItems: 1,
            maxItems: L.shapesPerPart,
            description: `1–${L.shapesPerPart} primitives (max ${L.shapes} in the whole hologram), positioned in the assembled state. A few accurate shapes beat many sloppy ones; use repeat for evenly spaced copies (fins, bolts, spokes, cells).`,
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: [...SHAPE_TYPES_V1],
                  description:
                    'box: size, optional r (rounded corners). cylinder: r, h, optional r2 (radius at the +axis end), hole (inner radius: rings, cans, bearings), sides (6 = hex nut). cone: r, h, apex towards +axis. sphere: r, or size for an ellipsoid. torus: r (axis to tube center), tube (tube radius), optional arc. capsule: r, h (total length). lathe: profile revolved around the axis (cans, pulleys, tyres, bottles, stepped shafts). extrude: outline polygon pushed depth along the axis, optional bevel (car body side profiles, brackets, plates, blades). tube: path with radius r (hoses, cables, pipes). line: path drawn as a thin glowing line (seams, wires).',
                },
                at: v3('Center of the shape; for lathe, extrude, tube and line the origin of their profile, outline or path coordinates. Default [0, 0, 0].'),
                axis: {
                  type: 'string',
                  enum: [...AXES],
                  description:
                    'Main axis of cylinder, cone, capsule, torus and lathe (default y). A minus sign flips it (cone apex, lathe profile direction). For extrude it is the push direction: z (default) takes the outline as [x, y] (a side profile), y as [x, z] (a plan outline), x as [z, y] (a front outline).',
                },
                rot: v3('Optional extra rotation [rx, ry, rz] in degrees, applied after axis (tilts, slopes).'),
                size: v3('box: [x, y, z] extents. sphere: [x, y, z] diameters of an ellipsoid.'),
                r: { type: 'number', description: 'Radius (cylinder, cone, sphere, capsule, tube), torus ring radius, or box corner radius.' },
                r2: { type: 'number', description: 'cylinder: radius at the +axis end (tapers).' },
                h: { type: 'number', description: 'Length along the axis (cylinder, cone, capsule).' },
                hole: { type: 'number', description: 'cylinder: inner radius, making a ring or tube.' },
                sides: { type: 'integer', minimum: 3, maximum: 64, description: 'cylinder or cone: number of flat sides (6 = hex nut, 4 = square post). Default round.' },
                tube: { type: 'number', description: 'torus: radius of the tube.' },
                arc: { type: 'number', description: 'torus: degrees of the ring to draw (e.g. 90 for a pipe bend). Default 360.' },
                profile: {
                  type: 'array',
                  items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                  description: `lathe: up to ${L.profilePoints} [radius, height] points along the axis, in order; revolved 360°. Walk the outline once (outside, then back down the inside for hollow parts).`,
                },
                outline: {
                  type: 'array',
                  items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                  description: `extrude: closed polygon of up to ${L.outlinePoints} points (do not repeat the first point), in the plane chosen by axis.`,
                },
                depth: { type: 'number', description: 'extrude: thickness along the axis, centered on at.' },
                bevel: { type: 'number', description: 'extrude: rounding of the edges (e.g. 100 on a car body).' },
                path: {
                  type: 'array',
                  items: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
                  description: `tube or line: up to ${L.pathPoints} [x, y, z] points; tubes are smoothed through them.`,
                },
                repeat: {
                  type: 'object',
                  description:
                    'Evenly spaced copies of this shape (max 64). Rotated: { count, around: "x"|"y"|"z", step (degrees, default 360/count), start (degrees, default 0), center ([x, y, z] on the rotation axis, default [0, 0, 0]) }. Offset: { count, along: [dx, dy, dz] } (each copy moved by that vector).',
                  properties: {
                    count: { type: 'integer', minimum: 2, maximum: L.repeat },
                    around: { type: 'string', enum: ['x', 'y', 'z'] },
                    step: { type: 'number' },
                    start: { type: 'number' },
                    center: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
                    along: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
                  },
                  required: ['count'],
                },
              },
              required: ['type'],
            },
          },
        },
        required: ['id', 'name', 'info', 'shapes'],
      },
    },
    notes: { type: 'array', items: { type: 'string' }, maxItems: L.notes, description: 'Up to 6 short notes shown with the hologram: simplifications, assumptions, the trim modeled.' },
  },
  required: ['title', 'parts'],
};

/** Freezes a JSON value and everything inside it (a frozen tool definition can never drift). */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * The show_hologram tool definition, deeply frozen. It is frozen into conversations by the engine's
 * lead tools version 4 (SPEC §8.3): never edit it; a change needs a new tools version.
 */
export const SHOW_HOLOGRAM_TOOL = deepFreeze({
  name: 'show_hologram',
  description: SHOW_HOLOGRAM_DESCRIPTION,
  input_schema: HOLOGRAM_INPUT_SCHEMA,
  eager_input_streaming: true,
});

/** A fresh, mutable deep copy of the tool definition (for a tools list). */
export function showHologramTool() {
  return JSON.parse(JSON.stringify(SHOW_HOLOGRAM_TOOL));
}

// ---------------------------------------------------------------------------------------------
// Version 2 of the tool (frozen by lead tools V7; version 1 above never changes): realistic shapes.
// The same input as version 1 (every V1 spec is a valid V2 spec) plus hull (a body carved from its
// side, top and front views, with arches and cuts) and panel (a part lying on a hull), loft (a skin
// through cross-sections, with twist), soft boxes, smooth lathes and extrudes, and tapered tubes.
// Same name, so a conversation has one or the other, never both. Built from the V1 schema.

const V2L = { hulls: L.hulls, panels: L.panels, viewPoints: L.viewPoints, cuts: L.cuts, arches: L.arches, sections: L.sections, sectionPoints: L.sectionPoints };
const pts2 = (description) => ({ type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, description });
const coordOrRange = (a) => ({
  anyOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }],
  description: `The section's ${a}: its station when the loft runs along ${a}; otherwise its center, or [min, max] to give its extent directly (then w or h is not needed).`,
});

export const SHOW_HOLOGRAM_DESCRIPTION_V2 = [
  'Show the owner an interactive 3D hologram of a physical object with every part labeled. The owner can rotate and zoom it, expand it into an exploded view, tap a part to read about it, and ask for a 2D blueprint later (only built when they ask).',
  SHOW_HOLOGRAM_DESCRIPTION.split('\n\n')[1],
  'Make it look like the real thing, not like blocks: give each part the shape it is really made with. hull: a body you would draw in side, top and front views (car, truck and van bodies, cabs, appliance and device cases, seats, dashboards, castings and housings); the windows, doors, hood, lids, lights, grilles and bumpers on it are panel parts. loft: a form made by its cross-sections along its length (fuselages, boat hulls, wings, fan and propeller blades with twist, handles, oval bottles, organic forms). lathe with smooth: turned and spun parts (tyres, wheels, pulleys, spinners, nacelles, domes, nozzles). box with round: soft blocks (cushions, tanks, battery packs, pods). Keep plain boxes, cylinders, tubes and the other primitives for parts that really have those shapes: shafts, pipes, brackets, fasteners and small inner parts.',
  "The parts appear one by one while you write the input, so write the large recognizable structure first (a car's body hull, then the panels on it and the wheels; an engine's nacelle and fan) and smaller or inner parts after, and write each part's fields in the order listed (shapes last). Then say in a sentence or two what the owner is looking at; the labels and part cards carry the details.",
].join('\n\n');

function schemaV2() {
  const s = JSON.parse(JSON.stringify(HOLOGRAM_INPUT_SCHEMA));
  const parts = s.properties.parts;
  parts.description =
    "The components, each a real, separately nameable part. Aim for 8–20 parts for a simple object, 20–40 for a machine, 35–60 for a vehicle or building (max 80). Coordinates: +y is up, +x is the object's front (a car's nose, an engine's intake), +z is its right side. Put the object on y = 0 or centered on the origin. Use real dimensions and keep parts where they really are relative to each other: believable proportions matter more than detail. A car or truck: one body part with a hull (side, top and front outlines, r about 60, arches at the wheels), then panel parts on it (windows, doors, hood, trunk lid or tailgate, bumpers, grille, lights), then wheels as smooth lathes, then the inner parts. An engine, motor or turbine: smooth lathes for casings, cowls and spinner, and each blade row written once with repeat around the shaft (a loft with twist for fan and propeller blades).";
  const props = parts.items.properties;
  props.explode = v3('Offset [dx, dy, dz] of the whole part in the exploded view, in model units, along its natural removal direction (a lid or hood lifts up, a door or wheel moves outward, a shaft slides out along its axis; an engine, motor or gearbox comes apart along its shaft, module by module, with its casings lifted off). Give every part except the central or base one an offset, move neighbours apart so no two parts overlap when exploded, and keep the exploded model within about 2–3 times the assembled size.');
  props.anchor = v3("Optional point the label's leader line points at (assembled state). Default: the center of the part. Set it for shells and large parts whose center is inside other parts, and for parts made of a left and a right piece (headlights, mirrors, brakes), whose center lies between them.");
  const shapes = props.shapes;
  shapes.description = `1–${L.shapesPerPart} shapes (max ${L.shapes} in the whole hologram, of which at most ${V2L.hulls} hulls and ${V2L.panels} panels), positioned in the assembled state. A few accurate shapes beat many sloppy ones; use repeat for evenly spaced copies (blades, fins, bolts, spokes, cells).`;
  const p = shapes.items.properties;
  p.type = {
    type: 'string',
    enum: [...SHAPE_TYPES],
    description:
      'hull: a smooth solid carved from blueprint views (side, top, front, or a revolve profile), its edges rounded by r; cut and arches take material out. panel: a part lying on an earlier part\'s hull (on, face, outline). loft: a smooth skin through cross-sections (sections; optional cap, arches). box: size; round (0–1) makes it a soft block, r only rounds its edges. cylinder: r, h, optional r2 (radius at the +axis end), hole (inner radius: rings, cans, bearings), sides (6 = hex nut). cone: r, h, apex towards +axis. sphere: r, or size for an ellipsoid. torus: r (axis to tube center), tube (tube radius), optional arc. capsule: r, h (total length). lathe: profile revolved around the axis; smooth: true curves it. extrude: outline pushed depth along the axis, optional bevel and smooth (plates, brackets, gears). tube: path with radius r, optional r2 at its end (hoses, cables, exhausts). line: path drawn as a thin glowing line (seams, panel gaps, wires).',
  };
  p.at = v3('Center of the shape; for lathe, extrude, tube and line the origin of their profile, outline or path coordinates; for hull and loft an offset added to their outlines and sections (normally left out: write those in model coordinates); a panel has none. Default [0, 0, 0].');
  p.axis = {
    type: 'string',
    enum: [...AXES],
    description:
      'cylinder, cone, capsule, torus and lathe: their main axis (default y); a minus sign flips it (cone apex, lathe profile direction). extrude: the push direction: z (default) takes the outline as [x, y] (a side profile), y as [x, z] (a plan outline), x as [z, y] (a front outline). loft: the direction it runs, x (default), y or z. hull: the axis of its revolve profile (default y).',
  };
  p.r = { type: 'number', description: "Radius (cylinder, cone, sphere, capsule, tube), torus ring radius, box edge radius, or a hull's edge radius where its views meet (about 60 on a car body, 2–3 on a 150 mm housing)." };
  p.r2 = { type: 'number', description: 'cylinder: radius at the +axis end. tube: radius at the end of its path (tapers).' };
  p.round = { type: 'number', minimum: 0, maximum: 1, description: 'box: how soft the block is: 1 = ellipsoid, 0.6 = cushion, 0.4 = soft box (tanks, housings), 0.2 = slightly rounded, 0 = sharp.' };
  p.smooth = { type: 'boolean', description: 'lathe or extrude: true curves the profile or outline smoothly through its points; sharp turns stay corners, so steps, grooves and chamfers keep their edges.' };
  p.outline.description = `extrude: closed polygon of up to ${L.outlinePoints} points (do not repeat the first point), in the plane chosen by axis. panel: its outline on the face, in model coordinates: [[x, y], …] on right, left or sides; [[z, y], …] on front or back; [[x, z], …] on top or bottom.`;
  p.bevel.description = 'extrude: rounding of the edges (e.g. 3 on a 60 mm bracket).';
  Object.assign(p, {
    side: pts2(`hull: closed outline of the whole object seen from its right side, [[x, y], …] (up to ${V2L.viewPoints} points), e.g. a car's bumper, hood, windshield, roof, rear window, trunk, tail and underside (leave the wheel openings to arches). Put a point at every corner and enough points along curves: gentle bends become smooth curves, sharp turns stay corners.`),
    top: pts2('hull: outline seen from above, [[x, z], …] (+z is the right side). For a left-right symmetric object give only the right half, from the centerline (z = 0) round to the centerline, e.g. a sedan [[2390, 0], [2250, 700], [1450, 918], [-1600, 920], [-2497, 0]]; it is mirrored.'),
    front: pts2('hull: outline seen from the front, [[z, y], …]: the widest cross-section, e.g. a car body with its greenhouse tapering in to the roof (no mirrors or wheels). Right half only (z ≥ 0, starting and ending on z = 0) for a symmetric object. Every view must span the same length, height and width as the others: the solid is only where all of them overlap.'),
    revolve: pts2('hull: instead of side and top, a profile [[radius, along], …] turned around axis like a lathe, for round housings and covers that need cuts (vent windows, bores, slots). Start or end it on the axis for a solid; a profile that never touches the axis is hollow. Without cuts, use a smooth lathe instead.'),
    cut: { type: 'array', maxItems: V2L.cuts, items: { type: 'object' }, description: `hull: up to ${V2L.cuts} box, cylinder or sphere shapes (their usual fields, repeat allowed) taken out of the solid with rounded edges: a truck bed (box), vent slots (box with repeat), a bore (cylinder). A symmetric hull mirrors its cuts.` },
    arches: { type: 'array', maxItems: V2L.arches, items: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, description: 'hull, or loft along x: wheel openings [[x, y, r], …]: the wheel center x and height y (its tyre radius above the ground) and r = tyre radius + about 40. Both sides are cut.' },
    mirror: { type: 'boolean', description: 'hull: true adds its mirror image across z = 0 (one hull for a pair of door mirrors or seats); automatic for a hull whose top or front is a right half. panel: true also draws the outline mirrored across z = 0 (a pair of headlights) on front, back, top or bottom.' },
    on: { type: 'string', description: "panel: id of an earlier part that has a hull (normally the body): the panel follows that hull's surface and moves with its own part's explode offset." },
    face: { type: 'string', enum: [...PANEL_FACES], description: 'panel: the face of that hull the outline is drawn on: right or left ([[x, y], …]), sides (both sides at once), front or back ([[z, y], …]), top or bottom ([[x, z], …]). Doors and side windows on sides, right or left; windshield, rear window, hood and trunk lid on top; headlights and grille on front; taillights on back.' },
    wrap: { type: 'boolean', description: 'panel: true takes all of the surface inside the outline whichever way it faces, e.g. a bumper drawn on the sides that wraps round the corners.' },
    sections: {
      type: 'array',
      minItems: 2,
      maxItems: V2L.sections,
      description: `loft: 2–${V2L.sections} cross-sections in order along the loft (either direction). axis x (default; fuselages, boat hulls, nacelles): each section is { x, y, z, w, h }: x its station, y and z its center (default 0), w its width along z, h its height along y. axis y (blades, posts, bottles standing up): { y, x, z, w, h }: w along x, h along z. axis z (wings, cross beams, lamps): { z, x, y, w, h }: w along x, h along y. A center can be [min, max] instead, giving the extent directly (then w or h is not needed), e.g. "y": [180, 840]. Each section is a superellipse: round 1 (default) = ellipse, 0.5 = soft box, 0.2 = box with rounded corners, 0 = rectangle. The skin passes smoothly through every section and never bulges beyond them, so add a section wherever the shape changes. Typical: 6–14 sections for a fuselage or boat hull, 3–5 for a blade.`,
      items: {
        type: 'object',
        properties: {
          x: coordOrRange('x'),
          y: coordOrRange('y'),
          z: coordOrRange('z'),
          w: { type: 'number', description: 'Width (along z for axis x, along x for axes y and z).' },
          h: { type: 'number', description: 'Height (along y for axes x and z, along z for axis y).' },
          d: { type: 'number', description: 'Diameter: sets w and h of a round section.' },
          round: { type: 'number', minimum: 0, maximum: 1, description: 'Squareness: 1 = ellipse (default), 0.5 = soft box, 0.2 = rounded box, 0 = rectangle.' },
          top: { type: 'number', description: 'Optional width at the top of the section: narrower than w for a cabin leaning in, wider for a boat hull flaring out.' },
          twist: { type: 'number', description: 'Optional rotation in degrees about the loft axis (blades and propellers: more at the tip than at the root).' },
          pts: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, description: `Optional custom outline instead of w and h: up to ${V2L.sectionPoints} [u, v] points in the section's plane (u, v as w, h), offset by its center.` },
        },
      },
    },
    cap: { anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['start', 'end'] }], description: 'loft: close both ends (true, default), neither (false: a duct or shell), or only the first ("start") or last ("end") section as written.' },
  });
  return s;
}

export const HOLOGRAM_INPUT_SCHEMA_V2 = schemaV2();

/**
 * The show_hologram tool definition, version 2 (realistic shapes), deeply frozen like version 1.
 * Frozen into new conversations by lead tools V7 (src/engine/prompts.js): never edit it.
 */
export const SHOW_HOLOGRAM_TOOL_V2 = deepFreeze({
  name: 'show_hologram',
  description: SHOW_HOLOGRAM_DESCRIPTION_V2,
  input_schema: HOLOGRAM_INPUT_SCHEMA_V2,
  eager_input_streaming: true,
});

/** A fresh, mutable deep copy of the version 2 tool definition (for a tools list). */
export function showHologramToolV2() {
  return JSON.parse(JSON.stringify(SHOW_HOLOGRAM_TOOL_V2));
}

// ---------------------------------------------------------------------------------------------
// Approximate bounds (assembled state), from the normalized shapes: used to describe a part's size
// in words (e.g. the engine's "Blueprint request" block). Mirrors the renderer's placement: round
// shapes along +y and extrusions along +z before `axis`, then `rot` (Euler XYZ, degrees), then `at`,
// then each repeat copy. Each shape's local box is transformed corner by corner, so rotated round
// shapes are slightly overestimated; that is fine for "about 150 x 140 x 140 mm".

const RAD = Math.PI / 180;
const rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const rotY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotZ = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const AXIS_TURN = { y: IDENTITY, '-y': rotX(Math.PI), x: rotZ(-Math.PI / 2), '-x': rotZ(Math.PI / 2), z: rotX(Math.PI / 2), '-z': rotX(-Math.PI / 2) };
const EXTRUDE_TURN = { z: IDENTITY, y: rotX(Math.PI / 2), x: rotY(-Math.PI / 2) };

function mul3(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return out;
}
const apply3 = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];

/** The shape's box in its own frame (before axis, rot and at): [[minX, minY, minZ], [maxX, maxY, maxZ]]. */
function localBox(s) {
  const sym = (x, y, z) => [[-x, -y, -z], [x, y, z]];
  const ofPoints = (pts, pad = 0) => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k] - pad);
      hi[k] = Math.max(hi[k], p[k] + pad);
    }
    return [lo, hi];
  };
  switch (s.type) {
    case 'box':
      return sym(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2);
    case 'cylinder': {
      const r = Math.max(s.r, s.r2 ?? s.r);
      return sym(r, s.h / 2, r);
    }
    case 'cone':
    case 'capsule':
      return sym(s.r, s.h / 2, s.r);
    case 'sphere':
      return s.size ? sym(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2) : sym(s.r, s.r, s.r);
    case 'torus':
      return sym(s.r + s.tube, s.tube, s.r + s.tube);
    case 'lathe': {
      const r = Math.max(...s.profile.map((p) => p[0]));
      const ys = s.profile.map((p) => p[1]);
      return [[-r, Math.min(...ys), -r], [r, Math.max(...ys), r]];
    }
    case 'extrude': {
      const us = s.outline.map((p) => p[0]);
      const vs = s.outline.map((p) => p[1]);
      return [[Math.min(...us), Math.min(...vs), -s.depth / 2], [Math.max(...us), Math.max(...vs), s.depth / 2]];
    }
    case 'tube':
      return ofPoints(s.path, Math.max(s.r, s.r2 ?? s.r));
    case 'line':
      return ofPoints(s.path);
    case 'loft':
      return loftBox(s);
    case 'hull': {
      const b = hullBox(s);
      return b ? [[b.x[0], b.y[0], b.z[0]], [b.x[1], b.y[1], b.z[1]]] : null;
    }
    case 'panel': {
      // the outline's extent in its plane; across it, the face of the hull it lies on (span)
      const plane = PANEL_PLANES[s.face] || ['x', 'y'];
      const depth = PANEL_DEPTH_AXIS[s.face] || 'z';
      const lo = { x: 0, y: 0, z: 0 };
      const hi = { x: 0, y: 0, z: 0 };
      plane.forEach((axis, i) => {
        lo[axis] = Math.min(...s.outline.map((p) => p[i]));
        hi[axis] = Math.max(...s.outline.map((p) => p[i]));
        if (axis === 'z' && s.mirror) {
          const m = Math.max(Math.abs(lo.z), Math.abs(hi.z));
          lo.z = -m;
          hi.z = m;
        }
      });
      if (Array.isArray(s.span)) {
        lo[depth] = s.span[0];
        hi[depth] = s.span[1];
      }
      return [[lo.x, lo.y, lo.z], [hi.x, hi.y, hi.z]];
    }
    default:
      return null;
  }
}

/** A loft's box: each section's extent across the axis (twisted sections by their circle). */
function loftBox(s) {
  const axis = s.axis || 'x';
  const [uKey, vKey] = SECTION_KEYS[axis];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const put = (k, a, b) => {
    lo[k] = Math.min(lo[k], a);
    hi[k] = Math.max(hi[k], b);
  };
  for (const sec of s.sections) {
    const cu = sec[uKey] || 0;
    const cv = sec[vKey] || 0;
    let u0, u1, v0, v1;
    if (sec.pts) {
      const us = sec.pts.map((p) => p[0]);
      const vs = sec.pts.map((p) => p[1]);
      [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    } else {
      const hw = Math.max(sec.w, sec.top ?? 0) / 2;
      [u0, u1, v0, v1] = [-hw, hw, -sec.h / 2, sec.h / 2];
    }
    if (sec.twist) {
      const rr = Math.max(Math.hypot(u0, v0), Math.hypot(u0, v1), Math.hypot(u1, v0), Math.hypot(u1, v1));
      [u0, u1, v0, v1] = [-rr, rr, -rr, rr];
    }
    put(AXIS_K[axis], sec[axis], sec[axis]);
    put(AXIS_K[uKey], cu + u0, cu + u1);
    put(AXIS_K[vKey], cv + v0, cv + v1);
  }
  return [lo, hi];
}

function shapeTurn(s) {
  // lofts, hulls and panels are built in place (a hull's axis belongs to its revolve profile)
  let m = s.type === 'loft' || s.type === 'hull' || s.type === 'panel' ? IDENTITY : s.type === 'extrude' ? EXTRUDE_TURN[(s.axis || 'z').replace('-', '')] || IDENTITY : AXIS_TURN[s.axis || 'y'] || IDENTITY;
  if (Array.isArray(s.rot)) m = mul3(mul3(mul3(rotX(s.rot[0] * RAD), rotY(s.rot[1] * RAD)), rotZ(s.rot[2] * RAD)), m);
  return m;
}

/** The repeat copies as point transforms (the original first). */
function copiesOf(repeat) {
  if (!repeat) return [(p) => p];
  const out = [];
  for (let i = 0; i < repeat.count; i++) {
    if (repeat.along) {
      out.push((p) => [p[0] + repeat.along[0] * i, p[1] + repeat.along[1] * i, p[2] + repeat.along[2] * i]);
      continue;
    }
    const a = ((repeat.start || 0) + repeat.step * i) * RAD;
    const r = repeat.around === 'x' ? rotX(a) : repeat.around === 'z' ? rotZ(a) : rotY(a);
    const c = repeat.center || [0, 0, 0];
    out.push((p) => {
      const q = apply3(r, [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
      return [q[0] + c[0], q[1] + c[1], q[2] + c[2]];
    });
  }
  return out;
}

function boundsOfShapes(shapes) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const s of Array.isArray(shapes) ? shapes : []) {
    const box = s && localBox(s);
    if (!box) continue;
    const m = shapeTurn(s);
    const at = s.at || [0, 0, 0];
    const corners = [];
    for (const x of [box[0][0], box[1][0]]) for (const y of [box[0][1], box[1][1]]) for (const z of [box[0][2], box[1][2]]) {
      const p = apply3(m, [x, y, z]);
      corners.push([p[0] + at[0], p[1] + at[1], p[2] + at[2]]);
    }
    for (const copy of copiesOf(s.repeat)) {
      for (const corner of corners) {
        const p = copy(corner);
        for (let k = 0; k < 3; k++) {
          if (p[k] < lo[k]) lo[k] = p[k];
          if (p[k] > hi[k]) hi[k] = p[k];
        }
      }
    }
  }
  if (!lo.every(Number.isFinite)) return null;
  const r = (v) => Math.round(v * 100) / 100 || 0;
  return { min: lo.map(r), max: hi.map(r), size: hi.map((v, k) => r(v - lo[k])) };
}

/** Approximate bounds of a normalized part in the assembled state: { min, max, size } or null. */
export function partBounds(part) {
  return part && typeof part === 'object' ? boundsOfShapes(part.shapes) : null;
}

/** Approximate bounds of a whole normalized hologram spec: { min, max, size } or null. */
export function specBounds(spec) {
  const parts = spec && Array.isArray(spec.parts) ? spec.parts : [];
  return boundsOfShapes(parts.flatMap((p) => (p && Array.isArray(p.shapes) ? p.shapes : [])));
}
