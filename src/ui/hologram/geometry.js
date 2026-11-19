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
// Per-vertex attributes added at merge time:
//   aBorn  seconds (hologram clock) when the shape arrived: drives the materialize sweep
//   aH     0..1 height of the vertex inside its shape: the sweep goes bottom to top

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

const EDGE_ANGLE = 32; // degrees between faces before an edge line is drawn
const DEG = Math.PI / 180;
const ROUND_SEGMENTS = 32;
const LATHE_SEGMENTS = 40;

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
  if (shape.type === 'extrude') {
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

function base(shape) {
  switch (shape.type) {
    case 'box': {
      const [x, y, z] = shape.size;
      if (shape.r > 0) {
        const g = new RoundedBoxGeometry(x, y, z, 3, shape.r);
        return { geometry: g, lines: roundedBoxLines(shape.size, shape.r) };
      }
      const g = new BoxGeometry(x, y, z);
      return { geometry: g, lines: edgesOf(g) };
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
      const pts = shape.profile.map(([r, y]) => new Vector2(r, y));
      const g = new LatheGeometry(pts, LATHE_SEGMENTS);
      return { geometry: g, lines: edgesOf(g) };
    }
    case 'extrude': {
      const s = new Shape(shape.outline.map(([u, v]) => new Vector2(u, v)));
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
          const ring = shape.outline.map(([u, v]) => new Vector3(u, v, z));
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
      const g = new TubeGeometry(curve, segs, shape.r, 10, false);
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
 */
export function buildShapeChunk(shape) {
  const { geometry, lines } = base(shape);
  const local = shapeMatrix(shape);
  const copies = repeatMatrices(shape.repeat);
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
  return { positions, normals, indices, lines: linePos, vertexCount: vCount * copies.length, lineVertexCount: lCount * copies.length, minY, maxY };
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
    let lo = 0;
    chunks.forEach((c, k) => {
      pos.set(c.lines, lo * 3);
      const span = c.maxY - c.minY || 1;
      for (let i = 0; i < c.lineVertexCount; i++) {
        bornAttr[lo + i] = born[k];
        hAttr[lo + i] = (c.lines[i * 3 + 1] - c.minY) / span;
      }
      grow(c.lines);
      lo += c.lineVertexCount;
    });
    lines = new BufferGeometry();
    lines.setAttribute('position', new BufferAttribute(pos, 3));
    lines.setAttribute('aBorn', new BufferAttribute(bornAttr, 1));
    lines.setAttribute('aH', new BufferAttribute(hAttr, 1));
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
