// The hologram scene spec: the input of the client tool `show_hologram`.
//
//   normalizeHologramSpec(input, { partial, stable })  -> { spec, warnings, stats, ok }
//   stablePrefix(draft)                        -> the part of a streamed draft that is certainly complete
//   SHOW_HOLOGRAM_TOOL                         -> { name, description, input_schema, eager_input_streaming }
//                                                 (deeply frozen: it is frozen into conversations)
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
  warnings: 30,
});

export const SHAPE_TYPES = Object.freeze(['box', 'cylinder', 'cone', 'sphere', 'torus', 'capsule', 'lathe', 'extrude', 'tube', 'line']);
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
  pipe: 'tube', hose: 'tube', cable: 'tube', wire: 'tube',
  polyline: 'line', path: 'line',
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
      const target = type === 'lathe' ? 'profile' : type === 'extrude' ? 'outline' : type === 'tube' || type === 'line' ? 'path' : null;
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
 */
export function normalizeShape(raw) {
  if (!isObj(raw)) return { error: 'not an object' };
  let type = typeof raw.type === 'string' ? raw.type.toLowerCase().trim() : '';
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
  if (type !== 'box' && type !== 'sphere' && type !== 'tube' && type !== 'line') {
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
      break;
    }
    case 'line': {
      const path = points(s.path, 3, 2, L.pathPoints);
      error = need(path, 'line needs path [[x, y, z], …] with at least 2 points');
      if (error) break;
      out.path = path;
      break;
    }
  }
  if (error) return { error };

  if (s.repeat !== undefined && s.repeat !== null) {
    const rep = normalizeRepeat(s.repeat);
    if (rep.repeat) out.repeat = rep.repeat;
    else notes.push(`repeat ignored (${rep.error})`);
  }
  return { shape: out, notes };
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
  let shapeCount = 0;
  let instanceCount = 0;
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
      const { shape, notes, error } = normalizeShape(shapeList[j]);
      const where = `${label} shapes[${j}]${shape || isObj(shapeList[j]) ? ` (${(shape && shape.type) || cleanText(String(shapeList[j].type ?? '?'), 12)})` : ''}`;
      if (error) {
        warn(`${where}: dropped: ${error}.`);
        dropped++;
        continue;
      }
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
  'Use it when the owner asks to see, show, pull up or understand how something physical is built or works, or asks for a diagram or blueprint of an object (the hologram always comes first). Model the specific object (the exact make, model, version or size when given), with real dimensions and real part positions: research them first when you are not sure.',
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
                  enum: [...SHAPE_TYPES],
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
      return ofPoints(s.path, s.r);
    case 'line':
      return ofPoints(s.path);
    default:
      return null;
  }
}

function shapeTurn(s) {
  let m = s.type === 'extrude' ? EXTRUDE_TURN[(s.axis || 'z').replace('-', '')] || IDENTITY : AXIS_TURN[s.axis || 'y'] || IDENTITY;
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
