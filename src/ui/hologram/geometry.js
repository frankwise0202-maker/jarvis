// Geometry for hologram shapes: each normalized shape (see hologram-spec.js) becomes a "chunk" of
// triangles (fill) and line segments (edges), already transformed into model space, repeats
// included. A part's chunks are merged into one indexed BufferGeometry for the translucent fill
// and one for the glowing edge lines, so a part costs two draw calls whatever its shape count.
//
// Edge lines come from EdgesGeometry (crease angle EDGE_ANGLE) for faceted shapes; smooth shapes
// get a few hand-made feature lines instead (sphere equator and meridian, torus rims, capsule
// seams, tube centerlines, rounded-box and bevelled-extrude outlines), because a smooth glowing
// blob without any lines reads poorly as a hologram.
//
// Smooth surfaces (format v2, smooth.js, built at once): a loft is a skin through its cross-sections
// with smooth vertex normals, its section outlines as faint contour rings, shoulder lines along it
// and crease lines where it really folds (wheel arches); a box with `round` is a superellipsoid with
// its three outlines; a lathe with `smooth` follows a Catmull-Rom curve through its profile; a tube
// with r2 tapers. Shapes copied by a large repeat (fan blades) are built coarser and crowded copies
// draw two strokes each, so a ring of 40 blades stays cheap. ctx.level (0, 1, 2) builds them
// coarser still for a hologram that is already heavy, or a detail that is small in the model.
//
// Hulls and panels (realistic bodies) come from hull-service.js, meshed off the main thread: their
// chunks carry asyncKey/level and are built again when a better mesh lands (coarse, then fine).
// Their lines are the creases where blueprint views meet, panel outlines and faint contour rings.
//
// Per-vertex attributes added at merge time:
//   aBorn  seconds (hologram clock) when the shape arrived: drives the materialize sweep
//   aH     0..1 height of the vertex inside its shape: the sweep goes bottom to top
//   aW     (lines) brightness weight: 1, or less for contour rings (hulls 0.32, lofts 0.55)

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  EdgesGeometry,
  Euler,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix3,
  Matrix4,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loftSkin, smoothPolyline, superellipsoid } from './smooth.js';
import { hullGeometry, panelGeometry } from './hull-service.js';
import { smoothOutline } from './hull-mesh.js';
import { partBounds } from '../../lib/hologram-spec.js';

const EDGE_ANGLE = 32; // degrees between faces before an edge line is drawn
const DEG = Math.PI / 180;
const ROUND_SEGMENTS = 32;
const LATHE_SEGMENTS = 40;
const SMOOTH_LATHE_SEGMENTS = 48;
const SECTION_KEYS = { x: ['z', 'y'], y: ['x', 'z'], z: ['x', 'y'] };

// ---------------------------------------------------------------------------------------------
// Detail budget (one rule for the live build and a reopened hologram)

/**
 * Triangles already built before later shapes get coarser: smooth shapes (lofts, soft boxes, smooth
 * lathes) at level 1 and then 2, and past the second, hulls and panels at their coarse mesh only. A
 * typical vehicle is 130-160k; a spec at every limit stays around a million or less.
 */
export const TRIANGLE_BUDGET = Object.freeze([300000, 600000]);
/** Smooth shapes smaller than these fractions of the model's size are built coarser (level 1, 2). */
export const SMALL_DETAIL = Object.freeze([0.12, 0.04]);

/** The detail level (0-2) the triangles built so far allow. */
export function budgetLevel(built) {
  return built >= TRIANGLE_BUDGET[1] ? 2 : built >= TRIANGLE_BUDGET[0] ? 1 : 0;
}

/** The detail level (0-2) of a shape by its size in the model: small details need less. */
export function sizeLevel(shape, modelSize) {
  if (!(modelSize > 0) || !shape || shape.type === 'hull' || shape.type === 'panel') return 0;
  const b = partBounds({ shapes: [shape] });
  const size = b ? Math.hypot(b.size[0], b.size[1], b.size[2]) : 0;
  return size < modelSize * SMALL_DETAIL[1] ? 2 : size < modelSize * SMALL_DETAIL[0] ? 1 : 0;
}

/** Whether a shape's geometry depends on its detail level (the smooth shapes built at once). */
export function hasDetailLevels(shape) {
  return !!shape && (shape.type === 'loft' || (shape.type === 'box' && shape.round > 0) || (shape.type === 'lathe' && !!shape.smooth));
}

/**
 * The detail of the next shape of a hologram from the triangles built so far and the model's size
 * (its diagonal): { level (0-2: smooth shapes), hullMode ('coarse': hulls and panels stay at their
 * coarse mesh, past the second budget step; null: coarse, then fine) }.
 */
export function detailFor(shape, built, modelSize) {
  return { level: Math.max(budgetLevel(built), sizeLevel(shape, modelSize)), hullMode: built >= TRIANGLE_BUDGET[1] ? 'coarse' : null };
}

// ---------------------------------------------------------------------------------------------
// Orientation: round shapes are built along +y, extrusions along +z; `axis` turns them.

const AXIS_ROTATION = {
  y: null,
  '-y': new Matrix4().makeRotationX(Math.PI),
  x: new Matrix4().makeRotationZ(-Math.PI / 2),
  '-x': new Matrix4().makeRotationZ(Math.PI / 2),
  z: new Matrix4().makeRotationX(Math.PI / 2),
  '-z': new Matrix4().makeRotationX(-Math.PI / 2),
};
// Extrude: z = outline [x, y]; y = outline [x, z]; x = outline [z, y] (sign ignored: centered).
const EXTRUDE_ROTATION = {
  z: null,
  y: new Matrix4().makeRotationX(Math.PI / 2),
  x: new Matrix4().makeRotationY(-Math.PI / 2),
};

function shapeMatrix(shape) {
  const m = new Matrix4();
  if (shape.type === 'loft' || shape.type === 'hull') {
    // built in place (a loft along its own axis; a hull's axis is its revolve's, already in its mesh)
  } else if (shape.type === 'extrude') {
    const r = EXTRUDE_ROTATION[(shape.axis || 'z').replace('-', '')];
    if (r) m.copy(r);
  } else if (shape.axis && AXIS_ROTATION[shape.axis]) {
    m.copy(AXIS_ROTATION[shape.axis]);
  }
  if (shape.rot) {
    const e = new Matrix4().makeRotationFromEuler(new Euler(shape.rot[0] * DEG, shape.rot[1] * DEG, shape.rot[2] * DEG, 'XYZ'));
    m.premultiply(e);
  }
  const at = shape.at || [0, 0, 0];
  m.premultiply(new Matrix4().makeTranslation(at[0], at[1], at[2]));
  return m;
}

function repeatMatrices(repeat) {
  if (!repeat) return [new Matrix4()];
  const out = [];
  for (let i = 0; i < repeat.count; i++) {
    if (repeat.along) {
      out.push(new Matrix4().makeTranslation(repeat.along[0] * i, repeat.along[1] * i, repeat.along[2] * i));
      continue;
    }
    const angle = (repeat.start + repeat.step * i) * DEG;
    const rot =
      repeat.around === 'x' ? new Matrix4().makeRotationX(angle) : repeat.around === 'z' ? new Matrix4().makeRotationZ(angle) : new Matrix4().makeRotationY(angle);
    const c = repeat.center || [0, 0, 0];
    const m = new Matrix4().makeTranslation(c[0], c[1], c[2]).multiply(rot).multiply(new Matrix4().makeTranslation(-c[0], -c[1], -c[2]));
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Feature lines for smooth shapes

function circle(out, radius, y, segments = 64, plane = 'xz', arc = Math.PI * 2) {
  const closed = arc >= Math.PI * 2 - 1e-6;
  const steps = closed ? segments : Math.max(2, Math.round((segments * arc) / (Math.PI * 2)));
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * arc;
    const a1 = ((i + 1) / steps) * arc;
    if (plane === 'xz') out.push(Math.cos(a0) * radius, y, Math.sin(a0) * radius, Math.cos(a1) * radius, y, Math.sin(a1) * radius);
    else out.push(Math.cos(a0) * radius, Math.sin(a0) * radius, y, Math.cos(a1) * radius, Math.sin(a1) * radius, y);
  }
  return out;
}

function polylineSegments(out, pts) {
  for (let i = 0; i < pts.length - 1; i++) out.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
  return out;
}

function edgesOf(geometry) {
  const e = new EdgesGeometry(geometry, EDGE_ANGLE);
  const arr = Array.from(e.getAttribute('position').array);
  e.dispose();
  return arr;
}

/** Many copies (blade rows, vanes, fins): their full outlines would glow into one bright blur. */
function crowded(shape) {
  return !!shape.repeat && shape.repeat.count > 12;
}

/**
 * Two strokes along a box's longest side, at either end of its middle side: a blade's leading
 * and trailing edges. Used instead of all twelve edges when the box is repeated many times.
 */
function bladeLines(size) {
  const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
  const [long, mid] = order;
  const out = [];
  for (const sgn of [-1, 1]) {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    a[long] = -size[long] / 2;
    b[long] = size[long] / 2;
    a[mid] = b[mid] = (sgn * size[mid]) / 2;
    out.push(...a, ...b);
  }
  return out;
}

/** A lathe profile or extrude outline with `smooth` (B's rule): gentle bends become curves. */
function smoothPoints(points, closed) {
  let lo = Infinity;
  let hi = -Infinity;
  const flat = new Float64Array(points.length * 2);
  points.forEach(([u, v], i) => {
    flat[i * 2] = u;
    flat[i * 2 + 1] = v;
    lo = Math.min(lo, u, v);
    hi = Math.max(hi, u, v);
  });
  const out = smoothOutline(flat, (hi - lo) / 60 || 1, closed);
  const pts = [];
  for (let i = 0; i < out.length; i += 2) pts.push([out[i], out[i + 1]]);
  return pts;
}

function roundedBoxLines(size, r) {
  // The 12 box edges, drawn along the middle of each rounded edge (gaps at the corners).
  const [w, h, d] = size.map((v) => v / 2);
  const k = r * (1 - Math.SQRT1_2); // inset of the 45° point of a rounded edge
  const out = [];
  const xs = [-(w - k), w - k];
  const ys = [-(h - k), h - k];
  const zs = [-(d - k), d - k];
  for (const y of ys) for (const z of zs) out.push(-(w - r), y, z, w - r, y, z);
  for (const x of xs) for (const z of zs) out.push(x, -(h - r), z, x, h - r, z);
  for (const x of xs) for (const y of ys) out.push(x, y, -(d - r), x, y, d - r);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Base geometry (local orientation) + its line segments

/** An indexed geometry from plain arrays, with smooth (averaged) vertex normals. */
function indexedGeometry(positions, indices) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions instanceof Float32Array ? positions : new Float32Array(positions), 3));
  g.setIndex(new BufferAttribute(indices instanceof Uint32Array ? indices : Uint32Array.from(indices), 1));
  g.computeVertexNormals();
  return g;
}

/** A hull or panel mesh (plain arrays from hull-mesh.js) as a BufferGeometry with its lines. */
function meshGeometry(mesh) {
  const lines = mesh && mesh.lines ? Array.from(mesh.lines) : [];
  const lineWeights = mesh && mesh.lineWeights && mesh.lineWeights.length === lines.length / 3 ? mesh.lineWeights : null;
  if (!mesh || !mesh.positions || !mesh.positions.length) return { geometry: null, lines, lineWeights };
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  g.setIndex(new BufferAttribute(mesh.indices, 1));
  return { geometry: g, lines, lineWeights };
}

/**
 * Level of detail for smooth shapes: coarser when a repeat makes many copies, and coarser again
 * at level 1 or 2 (chosen by the renderer: a hologram that is already heavy, or a detail that is
 * small in the model), so even a spec at every limit stays drawable on a phone.
 */
function detail(shape, level = 0) {
  const copies = shape.repeat ? shape.repeat.count : 1;
  // a loft of a few sections (a door skin, a lamp, a blade) needs fewer rings along it
  const along = shape.type === 'loft' ? Math.min(40, 8 + 6 * shape.sections.length) : 40;
  let d;
  if (copies > 16) d = { N: 16, M: Math.min(along, 12), around: 16, rows: 8, lathe: 24 };
  else if (copies > 4) d = { N: 24, M: Math.min(along, 20), around: 20, rows: 10, lathe: 32 };
  else d = { N: 40, M: along, around: 32, rows: 16, lathe: SMOOTH_LATHE_SEGMENTS };
  d.archSteps = 12;
  d.ribGap = 0.03;
  if (level > 0) {
    const k = level >= 2 ? 0.34 : 0.6;
    const even = (v, min) => Math.max(min, 4 * Math.round((v * k) / 4));
    d = {
      N: even(d.N, 12),
      M: Math.max(6, Math.round(d.M * k)),
      around: even(d.around, 12),
      rows: Math.max(6, 2 * Math.round((d.rows * k) / 2)),
      lathe: even(d.lathe, 16),
      archSteps: level >= 2 ? 6 : 8,
      ribGap: level >= 2 ? 0.2 : 0.1,
    };
  }
  return d;
}

/** A normalized loft in the form smooth.js reads: sections { s, c: [u, v], w, h, round, top, twist, pts }. */
function loftInput(shape) {
  const axis = shape.axis || 'x';
  const [uKey, vKey] = SECTION_KEYS[axis];
  return {
    axis,
    cap: shape.cap,
    arches: shape.arches,
    sections: shape.sections.map((sec) => ({
      s: sec[axis],
      c: [sec[uKey] || 0, sec[vKey] || 0],
      w: sec.w,
      h: sec.h,
      round: sec.round ?? 1,
      top: sec.top,
      twist: sec.twist,
      pts: sec.pts,
    })),
  };
}

function base(shape, ctx) {
  const level = ctx.level || 0;
  switch (shape.type) {
    case 'hull': {
      // a solid carved from blueprint views, meshed off the main thread (coarse first, then fine)
      const res = hullGeometry(shape, ctx.scale || 0, ctx.hullMode || null);
      return { ...meshGeometry(res.mesh), asyncKey: res.key, level: res.mesh ? res.level : null, done: res.done };
    }
    case 'panel': {
      // part of another part's hull surface (already in model space)
      const hosts = ctx.hosts ? ctx.hosts(shape.on) : [];
      const res = panelGeometry(shape, hosts, ctx.scale || 0, ctx.hullMode || null);
      return { ...meshGeometry(res.mesh), asyncKey: res.key, level: res.mesh ? res.level : null, done: res.done };
    }
    case 'loft': {
      const lod = detail(shape, level);
      const many = !!shape.repeat && shape.repeat.count > 6;
      const skin = loftSkin(loftInput(shape), { N: lod.N, M: lod.M, archSteps: lod.archSteps, ribGap: lod.ribGap, ribs: !many, edges: many });
      return { geometry: indexedGeometry(skin.positions, skin.indices), lines: skin.lines, lineWeights: skin.lineWeights };
    }
    case 'box': {
      const [x, y, z] = shape.size;
      if (shape.round > 0) {
        const lod = detail(shape, level);
        const se = superellipsoid(shape.size, shape.round, { around: lod.around, rows: lod.rows });
        return { geometry: indexedGeometry(se.positions, se.indices), lines: crowded(shape) ? bladeLines(shape.size) : se.lines };
      }
      if (shape.r > 0) {
        const g = new RoundedBoxGeometry(x, y, z, 3, shape.r);
        return { geometry: g, lines: roundedBoxLines(shape.size, shape.r) };
      }
      const g = new BoxGeometry(x, y, z);
      return { geometry: g, lines: crowded(shape) ? bladeLines(shape.size) : edgesOf(g) };
    }
    case 'cylinder': {
      const sides = shape.sides || ROUND_SEGMENTS;
      const r1 = shape.r;
      const r2 = shape.r2 ?? shape.r;
      const h = shape.h;
      if (shape.hole > 0) {
        const pts = [
          new Vector2(shape.hole, -h / 2),
          new Vector2(r1, -h / 2),
          new Vector2(r2, h / 2),
          new Vector2(shape.hole, h / 2),
          new Vector2(shape.hole, -h / 2),
        ];
        const g = new LatheGeometry(pts, sides);
        return { geometry: g, lines: edgesOf(g) };
      }
      const g = new CylinderGeometry(r2, r1, h, sides, 1, false);
      return { geometry: g, lines: edgesOf(g) };
    }
    case 'cone': {
      const g = new CylinderGeometry(0, shape.r, shape.h, shape.sides || ROUND_SEGMENTS, 1, false);
      return { geometry: g, lines: edgesOf(g) };
    }
    case 'sphere': {
      const g = new SphereGeometry(1, ROUND_SEGMENTS, 16);
      const s = shape.size ? shape.size.map((v) => v / 2) : [shape.r, shape.r, shape.r];
      g.scale(s[0], s[1], s[2]);
      const lines = [];
      // equator (xz) and one meridian (xy), scaled like the sphere
      for (let i = 0; i < 64; i++) {
        const a0 = (i / 64) * Math.PI * 2;
        const a1 = ((i + 1) / 64) * Math.PI * 2;
        lines.push(Math.cos(a0) * s[0], 0, Math.sin(a0) * s[2], Math.cos(a1) * s[0], 0, Math.sin(a1) * s[2]);
        lines.push(Math.cos(a0) * s[0], Math.sin(a0) * s[1], 0, Math.cos(a1) * s[0], Math.sin(a1) * s[1], 0);
      }
      return { geometry: g, lines };
    }
    case 'torus': {
      const arc = (shape.arc || 360) * DEG;
      const g = new TorusGeometry(shape.r, shape.tube, 12, 48, arc);
      g.rotateX(-Math.PI / 2); // three builds it in the xy plane; ours lies in xz (axis y)
      const lines = [];
      // outer and inner rims, in the same plane (TorusGeometry starts at +x and turns towards -z after the rotation)
      const rim = (radius) => {
        const steps = Math.max(8, Math.round(64 * (arc / (Math.PI * 2))));
        for (let i = 0; i < steps; i++) {
          const a0 = (i / steps) * arc;
          const a1 = ((i + 1) / steps) * arc;
          lines.push(Math.cos(a0) * radius, 0, -Math.sin(a0) * radius, Math.cos(a1) * radius, 0, -Math.sin(a1) * radius);
        }
      };
      rim(shape.r + shape.tube);
      rim(Math.max(0, shape.r - shape.tube));
      return { geometry: g, lines };
    }
    case 'capsule': {
      const mid = Math.max(0, shape.h - 2 * shape.r);
      const g = new CapsuleGeometry(shape.r, mid, 6, 20, 1);
      const lines = [];
      circle(lines, shape.r, mid / 2, 40);
      circle(lines, shape.r, -mid / 2, 40);
      return { geometry: g, lines };
    }
    case 'lathe': {
      if (shape.smooth) {
        const lod = detail(shape, level);
        const { points, corners, given } = smoothPolyline(shape.profile, 8);
        const g = new LatheGeometry(points.map(([r, y]) => new Vector2(Math.max(0, r), y)), lod.lathe);
        // contour rings: at the profile's corners and ends, and at the given points in between
        // (thinned so rings never crowd: at least 4% of the profile's length apart)
        const lines = [];
        let along = 0;
        const at = [0];
        for (let i = 1; i < points.length; i++) at.push((along += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])));
        let last = -Infinity;
        for (const i of Array.from(new Set([...corners, ...given])).sort((a, b) => a - b)) {
          const [r, y] = points[i];
          if (r <= 1e-9) continue;
          if (at[i] - last < along * 0.04 && !corners.includes(i)) continue;
          circle(lines, r, y, 64);
          last = at[i];
        }
        return { geometry: g, lines };
      }
      const pts = shape.profile.map(([r, y]) => new Vector2(r, y));
      const g = new LatheGeometry(pts, LATHE_SEGMENTS);
      return { geometry: g, lines: edgesOf(g) };
    }
    case 'extrude': {
      const outline = shape.smooth ? smoothPoints(shape.outline, true) : shape.outline;
      const s = new Shape(outline.map(([u, v]) => new Vector2(u, v)));
      const bevel = shape.bevel || 0;
      const core = Math.max(shape.depth - 2 * bevel, shape.depth * 0.1);
      const g = new ExtrudeGeometry(s, {
        depth: core,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelOffset: -bevel,
        bevelSegments: 3,
        curveSegments: 4,
      });
      g.translate(0, 0, -core / 2);
      let lines;
      if (bevel > 0) {
        lines = edgesOf(g);
        for (const z of [-core / 2, core / 2]) {
          const ring = outline.map(([u, v]) => new Vector3(u, v, z));
          ring.push(ring[0].clone());
          polylineSegments(lines, ring);
        }
      } else {
        lines = edgesOf(g);
      }
      return { geometry: g, lines };
    }
    case 'tube': {
      const pts = shape.path.map(([x, y, z]) => new Vector3(x, y, z));
      const curve = new CatmullRomCurve3(pts, false, 'centripetal');
      const segs = Math.min(160, Math.max(12, pts.length * 10));
      const radial = shape.r2 !== undefined ? 12 : 10;
      const g = new TubeGeometry(curve, segs, shape.r, radial, false);
      if (shape.r2 !== undefined && shape.r2 !== shape.r) {
        // taper: scale each ring around its point on the path, r at the start to r2 at the end
        const pos = g.getAttribute('position');
        const c = new Vector3();
        const v = new Vector3();
        for (let i = 0; i <= segs; i++) {
          curve.getPointAt(i / segs, c);
          const f = (shape.r + ((shape.r2 - shape.r) * i) / segs) / shape.r;
          for (let j = 0; j <= radial; j++) {
            const idx = i * (radial + 1) + j;
            v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(f).add(c);
            pos.setXYZ(idx, v.x, v.y, v.z);
          }
        }
        g.computeVertexNormals();
      }
      return { geometry: g, lines: polylineSegments([], curve.getPoints(segs)) };
    }
    case 'line': {
      const pts = shape.path.map(([x, y, z]) => new Vector3(x, y, z));
      return { geometry: null, lines: polylineSegments([], pts) };
    }
    default:
      return { geometry: null, lines: [] };
  }
}

// ---------------------------------------------------------------------------------------------

/**
 * Build one shape: { positions, normals, indices, lines, vertexCount, lineVertexCount, minY, maxY }
 * in model space with every repeat copy included. Plain typed arrays, so chunks can be cached and
 * merged without three.js objects.
 * ctx (all optional):
 *   level      0, 1 or 2: coarser smooth shapes (lofts, soft boxes, smooth lathes) for a hologram
 *              that is already heavy or a detail that is small in the model (hologram.js)
 *   scale      the model's size (the detail of hull meshes: the same for every hull of a model)
 *   hosts(id)  the hull shapes of that part (a panel's host)
 *   hullMode   hulls and panels: null (coarse, then fine), 'coarse' (coarse only: a heavy
 *              hologram) or 'fine' (fine only: re-meshing at a new scale while the old mesh shows)
 * Hull and panel chunks also carry asyncKey, level ('coarse' | 'fine' | null while nothing is
 * meshed yet), done and hullMode: hull-service.js tells the renderer when a better mesh is ready,
 * and the chunk is built again with the same ctx.
 */
export function buildShapeChunk(shape, ctx = {}) {
  const { geometry, lines, lineWeights, asyncKey, level, done } = base(shape, ctx || {});
  const local = shape.type === 'panel' ? new Matrix4() : shapeMatrix(shape);
  const copies = shape.type === 'panel' ? [new Matrix4()] : repeatMatrices(shape.repeat);
  let g = geometry;
  let posAttr = null;
  let normAttr = null;
  let index = null;
  if (g) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    posAttr = g.getAttribute('position');
    normAttr = g.getAttribute('normal');
    index = g.getIndex();
  }
  const vCount = posAttr ? posAttr.count : 0;
  const iCount = index ? index.count : vCount;
  const lCount = lines.length / 3;
  const positions = new Float32Array(vCount * 3 * copies.length);
  const normals = new Float32Array(vCount * 3 * copies.length);
  const indices = new Uint32Array(iCount * copies.length);
  const linePos = new Float32Array(lCount * 3 * copies.length);
  const v = new Vector3();
  const n = new Vector3();
  const nm = new Matrix3();
  const m = new Matrix4();
  let minY = Infinity;
  let maxY = -Infinity;
  copies.forEach((copy, c) => {
    m.multiplyMatrices(copy, local);
    nm.getNormalMatrix(m);
    const vo = c * vCount;
    for (let i = 0; i < vCount; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(m);
      positions[(vo + i) * 3] = v.x;
      positions[(vo + i) * 3 + 1] = v.y;
      positions[(vo + i) * 3 + 2] = v.z;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      n.fromBufferAttribute(normAttr, i).applyMatrix3(nm).normalize();
      normals[(vo + i) * 3] = n.x;
      normals[(vo + i) * 3 + 1] = n.y;
      normals[(vo + i) * 3 + 2] = n.z;
    }
    const io = c * iCount;
    for (let i = 0; i < iCount; i++) indices[io + i] = vo + (index ? index.getX(i) : i);
    const lo = c * lCount;
    for (let i = 0; i < lCount; i++) {
      v.set(lines[i * 3], lines[i * 3 + 1], lines[i * 3 + 2]).applyMatrix4(m);
      linePos[(lo + i) * 3] = v.x;
      linePos[(lo + i) * 3 + 1] = v.y;
      linePos[(lo + i) * 3 + 2] = v.z;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  });
  if (g) g.dispose();
  if (!Number.isFinite(minY)) {
    minY = 0;
    maxY = 0;
  }
  const chunk = { positions, normals, indices, lines: linePos, vertexCount: vCount * copies.length, lineVertexCount: lCount * copies.length, minY, maxY };
  if (lineWeights && lineWeights.length === lCount) {
    // per line vertex brightness (contour rings are faint), repeated for every copy
    const w = new Float32Array(lCount * copies.length);
    for (let c = 0; c < copies.length; c++) w.set(lineWeights, c * lCount);
    chunk.lineWeights = w;
  }
  if (asyncKey) {
    chunk.asyncKey = asyncKey;
    chunk.level = level;
    chunk.done = !!done;
    if (ctx && ctx.hullMode) chunk.hullMode = ctx.hullMode;
  }
  return chunk;
}

/**
 * Merge chunks into { fill: BufferGeometry|null, lines: BufferGeometry|null, box: {min, max} }.
 * born[i] is the arrival time of chunk i (hologram clock, seconds).
 */
export function mergeChunks(chunks, born) {
  let vTotal = 0;
  let iTotal = 0;
  let lTotal = 0;
  for (const c of chunks) {
    vTotal += c.vertexCount;
    iTotal += c.indices.length;
    lTotal += c.lineVertexCount;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const grow = (arr) => {
    for (let i = 0; i < arr.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const val = arr[i + k];
        if (val < min[k]) min[k] = val;
        if (val > max[k]) max[k] = val;
      }
    }
  };

  let fill = null;
  if (vTotal > 0) {
    const pos = new Float32Array(vTotal * 3);
    const nor = new Float32Array(vTotal * 3);
    const bornAttr = new Float32Array(vTotal);
    const hAttr = new Float32Array(vTotal);
    const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
    let vo = 0;
    let io = 0;
    chunks.forEach((c, k) => {
      pos.set(c.positions, vo * 3);
      nor.set(c.normals, vo * 3);
      const span = c.maxY - c.minY || 1;
      for (let i = 0; i < c.vertexCount; i++) {
        bornAttr[vo + i] = born[k];
        hAttr[vo + i] = (c.positions[i * 3 + 1] - c.minY) / span;
      }
      for (let i = 0; i < c.indices.length; i++) idx[io + i] = c.indices[i] + vo;
      grow(c.positions);
      vo += c.vertexCount;
      io += c.indices.length;
    });
    fill = new BufferGeometry();
    fill.setAttribute('position', new BufferAttribute(pos, 3));
    fill.setAttribute('normal', new BufferAttribute(nor, 3));
    fill.setAttribute('aBorn', new BufferAttribute(bornAttr, 1));
    fill.setAttribute('aH', new BufferAttribute(hAttr, 1));
    fill.setIndex(new BufferAttribute(idx, 1));
    fill.computeBoundingSphere();
    fill.computeBoundingBox();
  }

  let lines = null;
  if (lTotal > 0) {
    const pos = new Float32Array(lTotal * 3);
    const bornAttr = new Float32Array(lTotal);
    const hAttr = new Float32Array(lTotal);
    const wAttr = new Float32Array(lTotal).fill(1);
    let lo = 0;
    chunks.forEach((c, k) => {
      pos.set(c.lines, lo * 3);
      const span = c.maxY - c.minY || 1;
      for (let i = 0; i < c.lineVertexCount; i++) {
        bornAttr[lo + i] = born[k];
        hAttr[lo + i] = (c.lines[i * 3 + 1] - c.minY) / span;
      }
      if (c.lineWeights) wAttr.set(c.lineWeights, lo);
      grow(c.lines);
      lo += c.lineVertexCount;
    });
    lines = new BufferGeometry();
    lines.setAttribute('position', new BufferAttribute(pos, 3));
    lines.setAttribute('aBorn', new BufferAttribute(bornAttr, 1));
    lines.setAttribute('aH', new BufferAttribute(hAttr, 1));
    lines.setAttribute('aW', new BufferAttribute(wAttr, 1));
    lines.computeBoundingSphere();
  }

  const box = Number.isFinite(min[0]) ? { min, max } : null;
  return { fill, lines, box, support: supportPoints(chunks) };
}

// 26 directions (faces, edges and corners of a cube): the extreme vertex of a part along each one
// is kept, so camera fitting works on the real silhouette instead of loose box corners.
const DIRS = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) DIRS.push([x, y, z]);

function supportPoints(chunks) {
  const best = new Float64Array(DIRS.length).fill(-Infinity);
  const out = new Float32Array(DIRS.length * 3);
  const visit = (arr) => {
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i];
      const y = arr[i + 1];
      const z = arr[i + 2];
      for (let d = 0; d < DIRS.length; d++) {
        const dir = DIRS[d];
        const v = x * dir[0] + y * dir[1] + z * dir[2];
        if (v > best[d]) {
          best[d] = v;
          out[d * 3] = x;
          out[d * 3 + 1] = y;
          out[d * 3 + 2] = z;
        }
      }
    }
  };
  for (const c of chunks) {
    visit(c.positions);
    visit(c.lines);
  }
  return Number.isFinite(best[0]) ? out : null;
}
