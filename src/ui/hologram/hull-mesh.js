// The "hull" shape: a smooth solid carved from blueprint views, the way 3D artists model a car from
// its side, top and front drawings. Each view is a 2D outline in real model coordinates; the solid
// is where all of them overlap (a visual hull), with rounded edges where the views meet (a smooth
// minimum of their signed distances, radius `r`). A `revolve` profile (a lathe-style
// [radius, along] outline turned around an axis) can stand in for the side and top views. Cuts
// (boxes, cylinders, spheres: wheel arches, a truck bed, vent windows) are taken out with the same
// rounding; the validator has already turned a hull's `arches` into z-cylinder cuts. And a "panel" is the part of a hull's surface inside an outline drawn on one of its
// faces (the windows, doors, hood and lights of a car body).
//
//   hullMesh(shape, { level: 'coarse' | 'fine', scale }) -> { positions, normals, indices, lines,
//                                                     lineWeights, terms, … } (or null)
//   panelMesh([{ mesh, shape }], panel)              -> { positions, normals, indices, lines } | null
//   hullKey(shape)                                   -> cache key of everything that shapes the mesh
//   smoothOutline(flat, step, closed)                -> gentle bends as curves, sharp turns kept
//
// Pipeline: exact 2D signed distances of each (smoothed) outline on a grid 2x finer than the
// voxels -> a voxel field = smooth min of the extruded views, the revolve and the negated cuts ->
// naive surface nets (one vertex per surface cell, quads across sign-changing edges) -> Laplacian
// relaxation, each round followed by a Newton step back onto the exact surface (analytic gradients
// of the bilinear distance grids and of the smooth min) -> normals from the field gradient (smooth
// shading, no terraces) -> feature lines where two views (or a cut) meet at an angle: hood and roof
// edges, the beltline, wheel-arch lips; plus faint contour rings across big hulls.
//
// Detail is uniform over a model: the cell size follows the whole model's size (`scale`), with a
// voxel cap, a triangle budget that grows with the hull's share of the model, and a minimum number
// of cells across thin hulls. 'coarse' takes a few tens of ms; 'fine' a few hundred at most.
//
// Pure ES2022: no DOM, no three.js. Runs in the hull worker (hull-worker.js), on the main thread
// (hull-service.js fallback) and in Node tests. Coordinates are the shape's own (before `at`,
// `rot`, `repeat`): side [x, y] seen from the right (+z), top [x, z] from above, front [z, y]
// from the front.

const BIG = 1e9;
const NV = 4; // view terms: 0 side, 1 top, 2 front, 3 revolve; cuts follow
const LEVELS = {
  // cell size as a fraction of the whole model's size (`scale`), voxel cap, relaxation rounds,
  // and the fewest cells across the hull's thinnest extent
  coarse: { div: 70, voxels: 30000, rounds: 1, across: 4, tris: 7000 },
  fine: { div: 150, voxels: 240000, rounds: 3, across: 9, tris: 30000 },
};

// ---------------------------------------------------------------------------------------------
// Small math helpers (3x3 row-major matrices, as in hologram-spec.js)

const RAD = Math.PI / 180;
const rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const rotY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotZ = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const AXIS_TURN = { y: IDENTITY, '-y': rotX(Math.PI), x: rotZ(-Math.PI / 2), '-x': rotZ(Math.PI / 2), z: rotX(Math.PI / 2), '-z': rotX(-Math.PI / 2) };

function mul3(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return out;
}
const transpose3 = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

// ---------------------------------------------------------------------------------------------
// Views

/** Is this [z-first or z-second] outline the right half of a symmetric one (z >= 0, reaching z = 0)? */
export function isHalfOutline(points, zIndex) {
  if (!Array.isArray(points) || points.length < 2) return false;
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const z = p[zIndex];
    if (z < min) min = z;
    if (z > max) max = z;
  }
  const tol = Math.max(1e-6, (max - min) * 0.002);
  return min >= -tol && Math.abs(min) <= tol && max > tol;
}

/** Flat closed polygon [u0, v0, u1, v1, …]; a half outline (z >= 0) is completed by its mirror image. */
function viewPolygon(points, zIndex, half) {
  const out = [];
  for (const p of points) out.push(p[0], p[1]);
  if (half) {
    let max = 0;
    for (const p of points) max = Math.max(max, Math.abs(p[zIndex]));
    const tol = max * 0.002 + 1e-9;
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (Math.abs(p[zIndex]) <= tol) continue; // on the centerline: already there
      out.push(zIndex === 0 ? -p[0] : p[0], zIndex === 1 ? -p[1] : p[1]);
    }
  }
  return Float64Array.from(out);
}

/**
 * A revolve profile [[radius, along], …] as a closed polygon in (along, radius): a profile that
 * starts or ends on the axis is a solid (mirrored across the axis, so the axis is inside it); one
 * that never touches it is a ring section (outside, then back along the inside: a hollow housing).
 */
function revolvePolygon(points) {
  const pts = points.map(([r, a]) => [a, Math.max(0, r)]);
  const rmax = Math.max(...pts.map((p) => p[1]));
  const onAxis = (p) => p[1] <= rmax * 0.002;
  return viewPolygon(pts, 1, onAxis(pts[0]) || onAxis(pts[pts.length - 1]));
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

function polyRange(poly) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    if (poly[i] < u0) u0 = poly[i];
    if (poly[i] > u1) u1 = poly[i];
    if (poly[i + 1] < v0) v0 = poly[i + 1];
    if (poly[i + 1] > v1) v1 = poly[i + 1];
  }
  return { u0, u1, v0, v1 };
}

const CORNER_COS = Math.cos((30 * Math.PI) / 180); // a turn sharper than this stays a corner

/**
 * A closed outline (flat [u, v, …]) with its gentle bends made smooth: each edge becomes a cubic
 * Hermite curve through its end points, sampled about every `step`; a point where the outline turns
 * by more than 30° stays a sharp corner. So a car's roofline written as a polyline reads as a
 * curve, while a truck bed's corner stays square.
 */
export function smoothOutline(poly, step, closed = true) {
  const n = poly.length / 2;
  if (n < 3 || !(step > 0)) return poly;
  const px = (i) => poly[(((i % n) + n) % n) * 2];
  const py = (i) => poly[(((i % n) + n) % n) * 2 + 1];
  const len = (i) => Math.hypot(px(i + 1) - px(i), py(i + 1) - py(i)); // edge i -> i+1
  const corner = new Uint8Array(n);
  const tx = new Float64Array(n);
  const ty = new Float64Array(n); // unit tangent at a smooth point
  if (!closed) {
    corner[0] = 1; // an open profile (a lathe's) keeps its end points as they are
    corner[n - 1] = 1;
  }
  // signed turn at each point; a turn sharper than 30° is a corner unless a neighbour turns the same
  // way (then the points sample an arc coarsely: a tyre's shoulder), and over 75° always is
  const turn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const l0 = len(i - 1), l1 = len(i);
    if (l0 < 1e-9 || l1 < 1e-9) continue;
    const ax = (px(i) - px(i - 1)) / l0, ay = (py(i) - py(i - 1)) / l0;
    const bx = (px(i + 1) - px(i)) / l1, by = (py(i + 1) - py(i)) / l1;
    turn[i] = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
  const sharp = Math.acos(CORNER_COS), always = (75 * Math.PI) / 180, arc = (12 * Math.PI) / 180;
  let ext = 0;
  {
    const r = polyRange(poly);
    ext = Math.max(r.u1 - r.u0, r.v1 - r.v0);
  }
  const sameWay = (i, j) => (closed || (j > 0 && j < n - 1)) && Math.sign(turn[((j % n) + n) % n]) === Math.sign(turn[i]) && Math.abs(turn[((j % n) + n) % n]) > arc && Math.abs(turn[((j % n) + n) % n]) < always;
  // a coarse arc has short edges; a polygon's corners (a window, an octagon) are joined by long ones
  const shortEdges = (i) => len(i - 1) < ext * 0.2 && len(i) < ext * 0.2;
  for (let i = 0; i < n; i++) {
    if (corner[i]) continue;
    const l0 = len(i - 1), l1 = len(i);
    if (l0 < 1e-9 || l1 < 1e-9) {
      corner[i] = 1;
      continue;
    }
    const t = Math.abs(turn[i]);
    if (t > always || (t > sharp && !(shortEdges(i) && (sameWay(i, i - 1) || sameWay(i, i + 1))))) {
      corner[i] = 1;
      continue;
    }
    const ax = (px(i) - px(i - 1)) / l0, ay = (py(i) - py(i - 1)) / l0;
    const bx = (px(i + 1) - px(i)) / l1, by = (py(i + 1) - py(i)) / l1;
    // tangent: the chord through the neighbours, weighted towards the shorter edge
    const cx = ax * l1 + bx * l0, cy = ay * l1 + by * l0;
    const cl = Math.hypot(cx, cy) || 1;
    tx[i] = cx / cl;
    ty[i] = cy / cl;
  }
  const out = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const x0 = px(i), y0 = py(i), x1 = px(i + 1), y1 = py(i + 1);
    const L = len(i);
    if (L < 1e-9) continue;
    const j = (i + 1) % n;
    const dx = (x1 - x0) / L, dy = (y1 - y0) / L;
    // tangents, scaled by the shorter edge at each end (a long edge next to a short one stays
    // nearly straight: no bulge beyond the drawn outline); a corner end runs straight along the edge
    const m0 = Math.min(L, len(i - 1) || L), m1 = Math.min(L, len(i + 1) || L);
    const t0x = corner[i] ? dx * L : tx[i] * m0, t0y = corner[i] ? dy * L : ty[i] * m0;
    const t1x = corner[j] ? dx * L : tx[j] * m1, t1y = corner[j] ? dy * L : ty[j] * m1;
    // samples: by curvature (about one per 6° the curve turns), never closer than `step`
    const turn = Math.acos(Math.max(-1, Math.min(1, (t0x * dx + t0y * dy) / (Math.hypot(t0x, t0y) || 1)))) + Math.acos(Math.max(-1, Math.min(1, (t1x * dx + t1y * dy) / (Math.hypot(t1x, t1y) || 1))));
    const steps = corner[i] && corner[j] ? 1 : Math.max(1, Math.min(24, Math.ceil(L / step), Math.ceil(turn / ((6 * Math.PI) / 180))));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push(h00 * x0 + h10 * t0x + h01 * x1 + h11 * t1x, h00 * y0 + h10 * t0y + h01 * y1 + h11 * t1y);
    }
  }
  if (!closed) out.push(px(n - 1), py(n - 1));
  return Float64Array.from(out);
}

/**
 * Signed distance of a closed polygon (positive inside, even-odd rule) on the grid
 * u = u0 + (i0 + i)*d (i < nu), v = v0 + (j0 + j)*d (j < nv): a window of a bigger grid starts at
 * node (i0, j0) of it. Distances beyond `clamp` are clamped.
 */
function sdfGrid(poly, u0, nu, v0, nv, d, clamp, i0 = 0, j0 = 0) {
  const n = poly.length / 2;
  const out = new Float32Array(nu * nv);
  const cross = new Float64Array(n + 1);
  for (let j = 0; j < nv; j++) {
    const v = v0 + (j0 + j) * d;
    // even-odd crossings of the row
    let nc = 0;
    for (let e = 0; e < n; e++) {
      const au = poly[e * 2], av = poly[e * 2 + 1];
      const f = (e + 1) % n;
      const bu = poly[f * 2], bv = poly[f * 2 + 1];
      if (av > v !== bv > v) cross[nc++] = au + ((v - av) * (bu - au)) / (bv - av);
    }
    const xs = Array.from(cross.subarray(0, nc)).sort((a, b) => a - b);
    let ptr = 0;
    for (let i = 0; i < nu; i++) {
      const u = u0 + (i0 + i) * d;
      while (ptr < xs.length && xs[ptr] < u) ptr++;
      const inside = (ptr & 1) === 1;
      let best = clamp * clamp;
      for (let e = 0; e < n; e++) {
        const au = poly[e * 2], av = poly[e * 2 + 1];
        const f = (e + 1) % n;
        const bu = poly[f * 2], bv = poly[f * 2 + 1];
        // quick reject: the segment's box is farther than the best so far
        const du = u < Math.min(au, bu) ? Math.min(au, bu) - u : u > Math.max(au, bu) ? u - Math.max(au, bu) : 0;
        if (du * du >= best) continue;
        const dv = v < Math.min(av, bv) ? Math.min(av, bv) - v : v > Math.max(av, bv) ? v - Math.max(av, bv) : 0;
        if (du * du + dv * dv >= best) continue;
        const eu = bu - au, ev = bv - av;
        const len2 = eu * eu + ev * ev;
        let t = len2 > 0 ? ((u - au) * eu + (v - av) * ev) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const pu = au + t * eu - u, pv = av + t * ev - v;
        const dd = pu * pu + pv * pv;
        if (dd < best) best = dd;
      }
      const dist = Math.sqrt(best);
      out[i + nu * j] = inside ? dist : -dist;
    }
  }
  return out;
}

// Bilinear lookup of a 2D grid with its derivatives (in model units): value returned, du/dv kept.
// A window of a bigger grid (sdfGrid's i0, j0) keeps that grid's origin, so it reads exactly the same.
class Grid2 {
  constructor(data, u0, nu, v0, nv, d, i0 = 0, j0 = 0) {
    this.data = data;
    this.u0 = u0;
    this.v0 = v0;
    this.i0 = i0;
    this.j0 = j0;
    this.nu = nu;
    this.nv = nv;
    this.inv = 1 / d;
    this.du = 0;
    this.dv = 0;
  }
  at(u, v) {
    const inv = this.inv;
    let fu = (u - this.u0) * inv - this.i0;
    let fv = (v - this.v0) * inv - this.j0;
    const nu = this.nu;
    if (fu < 0) fu = 0;
    else if (fu > nu - 1.0001) fu = nu - 1.0001;
    if (fv < 0) fv = 0;
    else if (fv > this.nv - 1.0001) fv = this.nv - 1.0001;
    const i = fu | 0;
    const j = fv | 0;
    const tu = fu - i;
    const tv = fv - j;
    const o = i + nu * j;
    const g = this.data;
    const a = g[o], b = g[o + 1], c = g[o + nu], e = g[o + nu + 1];
    this.du = ((b - a) * (1 - tv) + (e - c) * tv) * inv;
    this.dv = ((c - a) * (1 - tu) + (e - b) * tu) * inv;
    return (a + (b - a) * tu) * (1 - tv) + (c + (e - c) * tu) * tv;
  }
}

// Polynomial smooth minimum: min(a, b) with the corner rounded over about k.
function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = k - Math.abs(a - b);
  if (h <= 0) return a < b ? a : b;
  return (a < b ? a : b) - (h * h) / (4 * k);
}

// ---------------------------------------------------------------------------------------------
// Cuts: boxes, cylinders and spheres taken out of the hull (inside-positive distance fields)

function cutInstances(cut) {
  // The cut's frame: axis turn, then rot, then at (as the renderer places shapes), then each repeat copy.
  let m = AXIS_TURN[cut.axis || 'y'] || IDENTITY;
  // boxes and spheres have no axis; a hull's axis belongs to its revolve profile, not its placement
  if (cut.type === 'box' || cut.type === 'sphere' || cut.type === 'hull') m = IDENTITY;
  if (Array.isArray(cut.rot)) m = mul3(mul3(mul3(rotX(cut.rot[0] * RAD), rotY(cut.rot[1] * RAD)), rotZ(cut.rot[2] * RAD)), m);
  const at = cut.at || [0, 0, 0];
  const copies = [];
  const rep = cut.repeat;
  const count = rep ? rep.count : 1;
  for (let i = 0; i < count; i++) {
    let rm = IDENTITY;
    let tr = [0, 0, 0];
    if (rep && rep.along) tr = [rep.along[0] * i, rep.along[1] * i, rep.along[2] * i];
    else if (rep) {
      const a = ((rep.start || 0) + rep.step * i) * RAD;
      rm = rep.around === 'x' ? rotX(a) : rep.around === 'z' ? rotZ(a) : rotY(a);
      const c = rep.center || [0, 0, 0];
      // p' = R (p - c) + c, with p = M q + at  ->  p' = R M q + R (at - c) + c
      const q = [at[0] - c[0], at[1] - c[1], at[2] - c[2]];
      tr = [rm[0] * q[0] + rm[1] * q[1] + rm[2] * q[2] + c[0] - at[0], rm[3] * q[0] + rm[4] * q[1] + rm[5] * q[2] + c[1] - at[1], rm[6] * q[0] + rm[7] * q[1] + rm[8] * q[2] + c[2] - at[2]];
    }
    const full = mul3(rm, m);
    const origin = [at[0] + tr[0], at[1] + tr[1], at[2] + tr[2]];
    copies.push({ inv: transpose3(full), origin, full });
  }
  return copies;
}

function cutLocal(cut) {
  // Returns { field(x, y, z) in the cut's own frame (inside-positive), half: local half extents }
  switch (cut.type) {
    case 'box': {
      const bx = cut.size[0] / 2, by = cut.size[1] / 2, bz = cut.size[2] / 2;
      const r = Math.min(cut.r || 0, bx, by, bz);
      return {
        half: [bx, by, bz],
        field(x, y, z) {
          const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r;
          const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
          const outside = Math.sqrt(ox * ox + oy * oy + oz * oz);
          const inside = Math.min(Math.max(qx, qy, qz), 0);
          return -(outside + inside - r);
        },
      };
    }
    case 'cylinder': {
      const r = Math.max(cut.r, cut.r2 ?? cut.r);
      const hh = cut.h / 2;
      return {
        half: [r, hh, r],
        field(x, y, z) {
          const dx = Math.sqrt(x * x + z * z) - r;
          const dy = Math.abs(y) - hh;
          const ox = dx > 0 ? dx : 0, oy = dy > 0 ? dy : 0;
          return -(Math.min(Math.max(dx, dy), 0) + Math.sqrt(ox * ox + oy * oy));
        },
      };
    }
    case 'sphere': {
      const rad = cut.size ? cut.size.map((v) => v / 2) : [cut.r, cut.r, cut.r];
      return {
        half: rad,
        field(x, y, z) {
          const k0 = Math.sqrt((x / rad[0]) ** 2 + (y / rad[1]) ** 2 + (z / rad[2]) ** 2);
          const k1 = Math.sqrt((x / (rad[0] * rad[0])) ** 2 + (y / (rad[1] * rad[1])) ** 2 + (z / (rad[2] * rad[2])) ** 2);
          return k1 > 0 ? -(k0 * (k0 - 1)) / k1 : Math.min(...rad);
        },
      };
    }
    default:
      return null;
  }
}

function buildCuts(cuts, k, fold) {
  const out = [];
  for (const cut of Array.isArray(cuts) ? cuts : []) {
    const local = cutLocal(cut);
    if (!local) continue;
    for (const inst of cutInstances(cut)) {
      if (fold && inst.origin[2] < 0) {
        // a folded (symmetric) hull is evaluated at |z|: a cut given on the left side moves to the right
        const m = inst.full;
        inst.full = [m[0], m[1], m[2], m[3], m[4], m[5], -m[6], -m[7], -m[8]];
        inst.origin = [inst.origin[0], inst.origin[1], -inst.origin[2]];
        inst.inv = transpose3(inst.full);
      }
      // world box of this copy, grown by the rounding radius
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const q = [sx * local.half[0], sy * local.half[1], sz * local.half[2]];
        const m = inst.full;
        const p = [m[0] * q[0] + m[1] * q[1] + m[2] * q[2] + inst.origin[0], m[3] * q[0] + m[4] * q[1] + m[5] * q[2] + inst.origin[1], m[6] * q[0] + m[7] * q[1] + m[8] * q[2] + inst.origin[2]];
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a], p[a] - k);
          hi[a] = Math.max(hi[a], p[a] + k);
        }
      }
      const inv = inst.inv;
      const o = inst.origin;
      out.push({
        lo,
        hi,
        field(x, y, z) {
          const px = x - o[0], py = y - o[1], pz = z - o[2];
          return local.field(inv[0] * px + inv[1] * py + inv[2] * pz, inv[3] * px + inv[4] * py + inv[5] * pz, inv[6] * px + inv[7] * py + inv[8] * pz);
        },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The field

/** Everything that shapes the mesh (not at/rot/repeat, which only place it): the cache key. */
export function hullKey(shape) {
  return JSON.stringify([shape.side || null, shape.top || null, shape.front || null, shape.revolve || null, shape.revolve ? shape.axis || 'y' : null, shape.r ?? null, shape.mirror ? 1 : 0, shape.cut || null]);
}

/**
 * The distance field of a hull (positive inside):
 *   f(x, y, z)             value
 *   fg(x, y, z)            value, gradient in this.gx/gy/gz
 *   terms(x, y, z, v, d)   each term's value v[t] and unit gradient d[3t..3t+2]: 0 side, 1 top,
 *                          2 front, 3 revolve, 4+ cuts (negated: positive outside the cut)
 */
class HullField {
  constructor(shape, level, scale) {
    const L = LEVELS[level] || LEVELS.fine;
    const halfTop = !!(shape.top && isHalfOutline(shape.top, 1));
    const halfFront = !!(shape.front && isHalfOutline(shape.front, 0));
    const mirror = !!shape.mirror || halfTop || halfFront;
    const side = shape.side ? viewPolygon(shape.side, -1, false) : null;
    const top = shape.top ? viewPolygon(shape.top, 1, halfTop) : null;
    const front = shape.front ? viewPolygon(shape.front, 0, halfFront) : null;
    // revolve: a lathe-style profile turned around an axis (x, y or z; a minus sign flips it)
    const rev = Array.isArray(shape.revolve) && shape.revolve.length >= 2 ? revolvePolygon(shape.revolve) : null;
    const raxis = String(shape.axis || 'y');
    const rsign = raxis.startsWith('-') ? -1 : 1;
    const ri = AXIS_INDEX[raxis.replace('-', '')] ?? 1;

    // The solid's box: inside every view's range.
    let x0 = -BIG, x1 = BIG, y0 = -BIG, y1 = BIG, z0 = -BIG, z1 = BIG;
    if (rev) {
      const r = polyRange(rev); // u = along, v = ±radius
      const a0 = rsign > 0 ? r.u0 : -r.u1, a1 = rsign > 0 ? r.u1 : -r.u0;
      const lo = [-r.v1, -r.v1, -r.v1], hi = [r.v1, r.v1, r.v1];
      lo[ri] = a0;
      hi[ri] = a1;
      x0 = lo[0];
      x1 = hi[0];
      y0 = lo[1];
      y1 = hi[1];
      z0 = lo[2];
      z1 = hi[2];
    }
    if (side) {
      const r = polyRange(side);
      x0 = Math.max(x0, r.u0);
      x1 = Math.min(x1, r.u1);
      y0 = Math.max(y0, r.v0);
      y1 = Math.min(y1, r.v1);
    }
    if (top) {
      const r = polyRange(top);
      x0 = Math.max(x0, r.u0);
      x1 = Math.min(x1, r.u1);
      z0 = Math.max(z0, r.v0);
      z1 = Math.min(z1, r.v1);
    }
    if (front) {
      const r = polyRange(front);
      z0 = Math.max(z0, r.u0);
      z1 = Math.min(z1, r.u1);
      y0 = Math.max(y0, r.v0);
      y1 = Math.min(y1, r.v1);
    }
    this.ok = x1 > x0 && y1 > y0 && z1 > z0 && ![x0, x1, y0, y1, z0, z1].some((v) => Math.abs(v) >= BIG);
    if (!this.ok) return;
    // Mirrored: a symmetric solid (it reaches the centerplane) is folded (|z|); an off-center one
    // (a door mirror) is meshed once and duplicated on the other side.
    let fold = false;
    let dup = false;
    if (mirror) {
      if (z0 > (z1 - z0) * 0.02 || z1 < -(z1 - z0) * 0.02) dup = true;
      else {
        fold = true;
        const zm = Math.max(Math.abs(z0), Math.abs(z1));
        z0 = -zm;
        z1 = zm;
      }
    }
    const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0;
    const minExt = Math.min(ex, ey, ez);
    // edge radius r: given, or about 4% of the smallest extent; at most 45% of it
    const k = Math.max(0, Math.min(shape.r ?? minExt * 0.04, minExt * 0.45));
    // cell size: uniform detail over the whole model (scale = its size), at least `across` cells
    // over the thinnest extent, within the voxel cap
    const pad = 2;
    const ref = scale > 0 ? scale : Math.hypot(ex, ey, ez);
    let h = Math.min(ref / L.div, minExt / L.across);
    // triangle budget: a hull gets triangles by its size in the model (a long thin bumper must not
    // cost as much as the body); about 2 triangles per cell of its surface
    const rel = Math.min(1, Math.hypot(ex, ey, ez) / ref);
    const budget = L.tris * Math.max(0.08, Math.pow(rel, 1.5));
    const area = 2 * (ex * ey + ey * ez + ex * ez) * 0.75;
    h = Math.max(h, Math.sqrt((2 * area) / budget));
    const count = (hh) => (Math.ceil(ex / hh) + 2 * pad + 1) * (Math.ceil(ey / hh) + 2 * pad + 1) * (Math.ceil(ez / hh) + 2 * pad + 1);
    for (let guard = 0; guard < 60 && count(h) > L.voxels; guard++) h *= 1.06;
    const nx = Math.ceil(ex / h) + 2 * pad + 1;
    const ny = Math.ceil(ey / h) + 2 * pad + 1;
    const nz = Math.ceil(ez / h) + 2 * pad + 1;
    const gx = (x0 + x1) / 2 - ((nx - 1) * h) / 2;
    const gy = (y0 + y1) / 2 - ((ny - 1) * h) / 2;
    const gz = (z0 + z1) / 2 - ((nz - 1) * h) / 2;

    // 2D distance grids, twice as fine as the voxels (node 2i of a view grid = voxel node i), of
    // the outlines with their gentle bends smoothed
    const d2 = h / 2;
    const clamp = Math.max(4 * k, 8 * h);
    const mx = 2 * nx - 1, my = 2 * ny - 1, mz = 2 * nz - 1;
    const sm = (poly) => smoothOutline(poly, h * 0.75);
    this.S = side ? new Grid2(sdfGrid(sm(side), gx, mx, gy, my, d2, clamp), gx, mx, gy, my, d2) : null;
    this.T = top ? new Grid2(sdfGrid(sm(top), gx, mx, gz, mz, d2, clamp), gx, mx, gz, mz, d2) : null;
    this.F = front ? new Grid2(sdfGrid(sm(front), gz, mz, gy, my, d2, clamp), gz, mz, gy, my, d2) : null;
    this.R = null;
    if (rev) {
      // The profile's grid in (along, radius), cropped to what the voxel grid can reach (plus a
      // margin): a revolve much bigger than the other views (a unit mix-up) would otherwise need
      // (revolve size / cell)² nodes, seconds and hundreds of MB. The crop keeps the full grid's
      // nodes, so every point the mesher looks at gets the same value as without it.
      const r = polyRange(rev);
      const ru0 = r.u0 - 2 * h, ru = Math.ceil((r.u1 - r.u0 + 4 * h) / d2) + 1;
      const rv0 = -2 * h, rv = Math.ceil((r.v1 + 4 * h) / d2) + 1;
      const lo = [gx, gy, gz];
      const hi = [gx + (nx - 1) * h, gy + (ny - 1) * h, gz + (nz - 1) * h];
      const a = (ri + 1) % 3, b = (ri + 2) % 3;
      const along0 = rsign > 0 ? lo[ri] : -hi[ri], along1 = rsign > 0 ? hi[ri] : -lo[ri];
      const nearest = (l, u) => (l > 0 ? l : u < 0 ? -u : 0); // |the point of [l, u] nearest 0|
      const rad0 = Math.hypot(nearest(lo[a], hi[a]), nearest(lo[b], hi[b]));
      const rad1 = Math.hypot(Math.max(-lo[a], hi[a]), Math.max(-lo[b], hi[b]));
      const crop = (from, to, o, n) => {
        const s = Math.max(0, Math.min(n - 2, Math.floor((from - 2 * h - o) / d2)));
        return [s, Math.max(s + 1, Math.min(n - 1, Math.ceil((to + 2 * h - o) / d2)))];
      };
      const [i0, i1] = crop(along0, along1, ru0, ru);
      const [j0, j1] = crop(rad0, rad1, rv0, rv);
      const nu = i1 - i0 + 1, nv = j1 - j0 + 1;
      this.R = new Grid2(sdfGrid(sm(rev), ru0, nu, rv0, nv, d2, clamp, i0, j0), ru0, nu, rv0, nv, d2, i0, j0);
      this.ri = ri;
      this.rsign = rsign;
    }
    this.kc = k * 0.6; // cut edges: a little crisper than the body's
    this.cuts = buildCuts(shape.cut, Math.max(this.kc, h), fold);
    Object.assign(this, { L, k, h, fold, dup, mirror, nx, ny, nz, gx, gy, gz, mx, my, mz, pad });
    this.termCount = NV + this.cuts.length;
    this.box = { min: [x0, y0, z0], max: [x1, y1, z1] };
    this.gx_ = 0;
    this.gy_ = 0;
    this.gz_ = 0;
  }

  /** The revolve term at a point: value; this.ra (along) and radial unit in this.rx/ry/rz kept for the gradient. */
  rev(x, y, z) {
    const p = [x, y, z];
    const along = this.rsign * p[this.ri];
    const a = (this.ri + 1) % 3, b = (this.ri + 2) % 3;
    const rad = Math.hypot(p[a], p[b]);
    const v = this.R.at(along, rad);
    const g = [0, 0, 0];
    g[this.ri] = this.rsign * this.R.du;
    if (rad > 1e-9) {
      g[a] = (this.R.dv * p[a]) / rad;
      g[b] = (this.R.dv * p[b]) / rad;
    }
    this.rgx = g[0];
    this.rgy = g[1];
    this.rgz = g[2];
    return v;
  }

  f(x, y, z) {
    const zz = this.fold && z < 0 ? -z : z;
    const k = this.k;
    let v = this.S ? this.S.at(x, y) : BIG;
    if (this.T) v = smin(v, this.T.at(x, zz), k);
    if (this.F) v = smin(v, this.F.at(zz, y), k);
    if (this.R) v = v >= BIG ? this.rev(x, y, z) : smin(v, this.rev(x, y, z), k);
    for (let i = 0; i < this.cuts.length; i++) {
      const c = this.cuts[i];
      if (x < c.lo[0] || x > c.hi[0] || y < c.lo[1] || y > c.hi[1] || zz < c.lo[2] || zz > c.hi[2]) continue;
      v = smin(v, -c.field(x, y, zz), this.kc);
    }
    return v;
  }

  /** Value with its gradient (this.gx_, gy_, gz_): smooth-min weights over each term's gradient. */
  fg(x, y, z) {
    const neg = this.fold && z < 0;
    const zz = neg ? -z : z;
    const k = this.k;
    let v = BIG, gx = 0, gy = 0, gz = 0;
    const mix = (b, bx, by, bz, kk) => {
      // smooth min of (v, g) and (b, gb): weights from the polynomial smin's derivative
      const hh = kk - Math.abs(v - b);
      if (kk <= 0 || hh <= 0) {
        if (b < v) {
          v = b;
          gx = bx;
          gy = by;
          gz = bz;
        }
        return;
      }
      const w = hh / (2 * kk); // weight of the larger term
      const drop = (hh * hh) / (4 * kk);
      if (v <= b) {
        v -= drop;
        gx = (1 - w) * gx + w * bx;
        gy = (1 - w) * gy + w * by;
        gz = (1 - w) * gz + w * bz;
      } else {
        v = b - drop;
        gx = (1 - w) * bx + w * gx;
        gy = (1 - w) * by + w * gy;
        gz = (1 - w) * bz + w * gz;
      }
    };
    if (this.S) {
      v = this.S.at(x, y);
      gx = this.S.du;
      gy = this.S.dv;
    }
    if (this.T) {
      const t = this.T.at(x, zz);
      if (v >= BIG) {
        v = t;
        gx = this.T.du;
        gy = 0;
        gz = neg ? -this.T.dv : this.T.dv;
      } else mix(t, this.T.du, 0, neg ? -this.T.dv : this.T.dv, k);
    }
    if (this.F) {
      const t = this.F.at(zz, y);
      if (v >= BIG) {
        v = t;
        gx = 0;
        gy = this.F.dv;
        gz = neg ? -this.F.du : this.F.du;
      } else mix(t, 0, this.F.dv, neg ? -this.F.du : this.F.du, k);
    }
    if (this.R) {
      const t = this.rev(x, y, z);
      if (v >= BIG) {
        v = t;
        gx = this.rgx;
        gy = this.rgy;
        gz = this.rgz;
      } else mix(t, this.rgx, this.rgy, this.rgz, k);
    }
    const e = this.h * 0.25;
    for (let i = 0; i < this.cuts.length; i++) {
      const c = this.cuts[i];
      if (x < c.lo[0] || x > c.hi[0] || y < c.lo[1] || y > c.hi[1] || zz < c.lo[2] || zz > c.hi[2]) continue;
      const cv = -c.field(x, y, zz);
      const cx = -(c.field(x + e, y, zz) - c.field(x - e, y, zz)) / (2 * e);
      const cy = -(c.field(x, y + e, zz) - c.field(x, y - e, zz)) / (2 * e);
      let cz = -(c.field(x, y, zz + e) - c.field(x, y, zz - e)) / (2 * e);
      if (neg) cz = -cz;
      mix(cv, cx, cy, cz, this.kc);
    }
    this.gx_ = gx;
    this.gy_ = gy;
    this.gz_ = gz;
    return v;
  }

  /** Every term's value and unit gradient at a point (for feature lines and panels). */
  terms(x, y, z, vals, dirs) {
    const neg = this.fold && z < 0;
    const zz = neg ? -z : z;
    const put = (t, v, a, b, c) => {
      vals[t] = v;
      const l = Math.hypot(a, b, c) || 1;
      dirs[t * 3] = a / l;
      dirs[t * 3 + 1] = b / l;
      dirs[t * 3 + 2] = c / l;
    };
    if (this.S) put(0, this.S.at(x, y), this.S.du, this.S.dv, 0);
    else put(0, BIG, 0, 0, 0);
    if (this.T) {
      const t = this.T.at(x, zz);
      put(1, t, this.T.du, 0, neg ? -this.T.dv : this.T.dv);
    } else put(1, BIG, 0, 0, 0);
    if (this.F) {
      const t = this.F.at(zz, y);
      put(2, t, 0, this.F.dv, neg ? -this.F.du : this.F.du);
    } else put(2, BIG, 0, 0, 0);
    if (this.R) {
      const t = this.rev(x, y, z);
      put(3, t, this.rgx, this.rgy, this.rgz);
    } else put(3, BIG, 0, 0, 0);
    const e = this.h * 0.25;
    for (let i = 0; i < this.cuts.length; i++) {
      const c = this.cuts[i];
      const cx = -(c.field(x + e, y, zz) - c.field(x - e, y, zz));
      const cy = -(c.field(x, y + e, zz) - c.field(x, y - e, zz));
      let cz = -(c.field(x, y, zz + e) - c.field(x, y, zz - e));
      if (neg) cz = -cz;
      put(NV + i, -c.field(x, y, zz), cx, cy, cz);
    }
  }
}

/** The hull's distance field (or null when its views do not overlap). */
export function hullField(shape, { level = 'fine', scale = 0 } = {}) {
  const field = new HullField(shape, level, scale);
  return field.ok ? field : null;
}

// ---------------------------------------------------------------------------------------------
// Surface nets

// cell corners: bit 0 = +x, bit 1 = +y, bit 2 = +z; the 12 cell edges as corner pairs
const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3];
const EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];

class Grow {
  constructor(Type, n = 4096) {
    this.Type = Type;
    this.a = new Type(n);
    this.n = 0;
  }
  push3(a, b, c) {
    if (this.n + 3 > this.a.length) this.grow();
    this.a[this.n++] = a;
    this.a[this.n++] = b;
    this.a[this.n++] = c;
  }
  push4(a, b, c, d) {
    if (this.n + 4 > this.a.length) this.grow();
    this.a[this.n++] = a;
    this.a[this.n++] = b;
    this.a[this.n++] = c;
    this.a[this.n++] = d;
  }
  grow() {
    const b = new this.Type(this.a.length * 2);
    b.set(this.a);
    this.a = b;
  }
  done() {
    return this.a.slice(0, this.n);
  }
}

const COS_CREASE = Math.cos((24 * Math.PI) / 180); // two views must meet at more than this angle to draw a line
const RING_WEIGHT = 0.32; // contour rings: faint next to the feature lines

/**
 * Mesh a hull shape. 'coarse' is fast enough for the main thread; 'fine' is meant for the worker.
 * scale: the whole model's size (its bounding diagonal), so every hull of a model gets the same
 * detail. Returns plain typed arrays in the shape's own coordinates:
 *   { positions, normals, indices (Uint32Array), lines (segment pairs), terms (Uint8Array: the view
 *     or cut that shapes each vertex: 0 side, 1 top, 2 front, 3 revolve, 4+ cut), level, cell, grid,
 *     triangles, ms, box }
 * or null when the views do not overlap.
 */
export function hullMesh(shape, { level = 'fine', scale = 0 } = {}) {
  const t0 = now();
  const F = hullField(shape, { level, scale });
  if (!F) return null;
  const { nx, ny, nz, gx, gy, gz, h, mx, mz, k, kc, cuts, fold, dup } = F;
  const SV = F.S && F.S.data;
  const TV_ = F.T && F.T.data;
  const FV = F.F && F.F.data;

  // 1. voxel field (the view grids at their even nodes: no interpolation)
  const nxy = nx * ny;
  const vals = new Float32Array(nxy * nz);
  for (let kz = 0; kz < nz; kz++) {
    const z = gz + kz * h;
    let iz = 2 * kz;
    if (fold && z < 0) iz = Math.round((-z - gz) / (h / 2)); // folded: |z| on the view grid
    if (iz > mz - 1) iz = mz - 1;
    for (let jy = 0; jy < ny; jy++) {
      const row = nx * jy + nxy * kz;
      const sRow = 2 * jy * mx;
      const fv = FV ? FV[iz + mz * 2 * jy] : BIG;
      const tRow = mx * iz;
      for (let ix = 0; ix < nx; ix++) {
        let v = SV ? SV[2 * ix + sRow] : BIG;
        if (TV_) v = smin(v, TV_[2 * ix + tRow], k);
        if (FV) v = smin(v, fv, k);
        if (F.R) {
          const r = F.rev(gx + ix * h, gy + jy * h, z);
          v = v >= BIG ? r : smin(v, r, k);
        }
        vals[row + ix] = v;
      }
    }
  }
  for (const c of cuts) {
    const ranges = fold ? [[c.lo[2], c.hi[2]], [-c.hi[2], -c.lo[2]]] : [[c.lo[2], c.hi[2]]];
    const i0 = Math.max(0, Math.floor((c.lo[0] - gx) / h)), i1 = Math.min(nx - 1, Math.ceil((c.hi[0] - gx) / h));
    const j0 = Math.max(0, Math.floor((c.lo[1] - gy) / h)), j1 = Math.min(ny - 1, Math.ceil((c.hi[1] - gy) / h));
    const done = new Set(); // the two folded ranges may overlap near z = 0: each slice once
    for (const [lo, hi] of ranges) {
      const k0 = Math.max(0, Math.floor((lo - gz) / h)), k1 = Math.min(nz - 1, Math.ceil((hi - gz) / h));
      for (let kz = k0; kz <= k1; kz++) {
        if (done.has(kz)) continue;
        done.add(kz);
        const z = gz + kz * h;
        const zz = fold && z < 0 ? -z : z;
        for (let jy = j0; jy <= j1; jy++) {
          const y = gy + jy * h;
          const row = nx * jy + nxy * kz;
          for (let ix = i0; ix <= i1; ix++) vals[row + ix] = smin(vals[row + ix], -c.field(gx + ix * h, y, zz), kc);
        }
      }
    }
  }

  // 2. one vertex per cell that the surface crosses (the average of its edge crossings)
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos = new Grow(Float64Array, 1 << 15);
  const OFF = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const cv = new Float64Array(8);
  let vCount = 0;
  for (let kz = 0; kz < cz; kz++) {
    for (let jy = 0; jy < cy; jy++) {
      const base = nx * jy + nxy * kz;
      for (let ix = 0; ix < cx; ix++) {
        const o = base + ix;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = vals[o + OFF[c]];
          cv[c] = v;
          if (v > 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EA[e], b = EB[e];
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const t = cv[a] / (cv[a] - cv[b]);
          const ax = a & 1, ay = (a >> 1) & 1, az = a >> 2;
          sx += ax + ((b & 1) - ax) * t;
          sy += ay + (((b >> 1) & 1) - ay) * t;
          sz += az + ((b >> 2) - az) * t;
          n++;
        }
        cellVert[ix + cx * (jy + cy * kz)] = vCount++;
        pos.push3(gx + (ix + sx / n) * h, gy + (jy + sy / n) * h, gz + (kz + sz / n) * h);
      }
    }
  }

  // 3. a quad across every sign-changing grid edge (joining the 4 cells around it), wound outwards
  const quads = new Grow(Int32Array, 1 << 15);
  const cxy = cx * cy;
  for (let kz = 1; kz < nz - 1; kz++) {
    for (let jy = 1; jy < ny - 1; jy++) {
      for (let ix = 1; ix < nx - 1; ix++) {
        const o = ix + nx * jy + nxy * kz;
        const inA = vals[o] > 0;
        const c0 = ix + cx * jy + cxy * kz; // cell (ix, jy, kz)
        if (inA !== vals[o + 1] > 0) {
          // x edge: cells (ix, jy-1..jy, kz-1..kz)
          const a = cellVert[c0 - cx - cxy], b = cellVert[c0 - cxy], c = cellVert[c0], d = cellVert[c0 - cx];
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) inA ? quads.push4(a, b, c, d) : quads.push4(a, d, c, b);
        }
        if (inA !== vals[o + nx] > 0) {
          // y edge: cells (ix-1..ix, jy, kz-1..kz)
          const a = cellVert[c0 - 1 - cxy], b = cellVert[c0 - 1], c = cellVert[c0], d = cellVert[c0 - cxy];
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) inA ? quads.push4(a, b, c, d) : quads.push4(a, d, c, b);
        }
        if (inA !== vals[o + nxy] > 0) {
          // z edge: cells (ix-1..ix, jy-1..jy, kz)
          const a = cellVert[c0 - 1 - cx], b = cellVert[c0 - cx], c = cellVert[c0], d = cellVert[c0 - 1];
          if (a >= 0 && b >= 0 && c >= 0 && d >= 0) inA ? quads.push4(a, b, c, d) : quads.push4(a, d, c, b);
        }
      }
    }
  }
  const Q = quads.done();
  const P = pos.done();
  const nv = vCount;

  // 4. relax: Laplacian smoothing, then a Newton step back onto the exact surface
  const project = (i) => {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const v = F.fg(x, y, z);
    const a = F.gx_, b = F.gy_, c = F.gz_;
    const g2 = a * a + b * b + c * c;
    if (g2 < 1e-12) return;
    let s = v / g2;
    const step = Math.abs(s) * Math.sqrt(g2);
    if (step > h) s *= h / step; // never more than a cell in one step
    P[i * 3] = x - s * a;
    P[i * 3 + 1] = y - s * b;
    P[i * 3 + 2] = z - s * c;
  };
  const sum = new Float64Array(nv * 3);
  const cnt = new Uint16Array(nv);
  for (let round = 0; round < F.L.rounds; round++) {
    sum.fill(0);
    cnt.fill(0);
    for (let q = 0; q < Q.length; q += 4) {
      for (let e = 0; e < 4; e++) {
        const a = Q[q + e] * 3;
        const b = Q[q + ((e + 1) & 3)] * 3;
        sum[a] += P[b];
        sum[a + 1] += P[b + 1];
        sum[a + 2] += P[b + 2];
        sum[b] += P[a];
        sum[b + 1] += P[a + 1];
        sum[b + 2] += P[a + 2];
        cnt[a / 3]++;
        cnt[b / 3]++;
      }
    }
    for (let i = 0; i < nv; i++) {
      const c = cnt[i];
      if (!c) continue;
      for (let a = 0; a < 3; a++) P[i * 3 + a] += 0.5 * (sum[i * 3 + a] / c - P[i * 3 + a]);
    }
    for (let i = 0; i < nv; i++) project(i);
  }
  if (!F.L.rounds) for (let i = 0; i < nv; i++) project(i);

  // 5. normals from the field gradient (outwards = towards decreasing f)
  const normals = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    F.fg(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const a = -F.gx_, b = -F.gy_, c = -F.gz_;
    const len = Math.hypot(a, b, c) || 1;
    normals[i * 3] = a / len;
    normals[i * 3 + 1] = b / len;
    normals[i * 3 + 2] = c / len;
  }

  // 6. triangles: each quad split along its shorter diagonal
  const indices = new Uint32Array((Q.length / 4) * 6);
  let ti = 0;
  for (let q = 0; q < Q.length; q += 4) {
    const a = Q[q], b = Q[q + 1], c = Q[q + 2], d = Q[q + 3];
    const ac = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const bd = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (ac <= bd) {
      indices[ti++] = a;
      indices[ti++] = b;
      indices[ti++] = c;
      indices[ti++] = a;
      indices[ti++] = c;
      indices[ti++] = d;
    } else {
      indices[ti++] = a;
      indices[ti++] = b;
      indices[ti++] = d;
      indices[ti++] = b;
      indices[ti++] = c;
      indices[ti++] = d;
    }
  }

  // 7. which view or cut shapes each vertex, and the feature lines where they meet
  const nt = F.termCount;
  const TVal = new Float32Array(nv * nt);
  const TDir = new Float32Array(nv * nt * 3);
  const vtmp = new Float64Array(nt);
  const dtmp = new Float64Array(nt * 3);
  const terms = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) {
    F.terms(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], vtmp, dtmp);
    let best = 0;
    for (let t = 0; t < nt; t++) {
      TVal[i * nt + t] = vtmp[t];
      if (vtmp[t] < vtmp[best]) best = t;
    }
    TDir.set(dtmp, i * nt * 3);
    terms[i] = Math.min(best, 255);
  }
  let lines = featureLines(P, indices, TVal, TDir, nt, Math.max(k, 1.5 * h), Math.max(kc, 1.5 * h));
  // contour rings across x (stations), spaced by the whole model's size, drawn faint (lineWeights):
  // they show a big body's curvature the way a hologram's scan lines would; small hulls get none
  // A solid of revolution rings along its own axis, with bright rings at its profile's sharp corners
  // and at its highlight (an inlet lip, a spinner's widest point).
  const ax = F.R ? F.ri : 0;
  const span = Math.max(F.box.max[ax] - F.box.min[ax], 1e-9);
  const ref = scale > 0 ? scale : span * 1.2;
  let rings = new Float32Array(0);
  if (span > ref * (F.R ? 0.15 : 0.3)) rings = sectionLines(P, indices, ax, evenStations(F.box.min[ax], F.box.max[ax], ref / 13));
  let edgeRings = new Float32Array(0);
  if (F.R && Array.isArray(shape.revolve)) edgeRings = sectionLines(P, indices, ax, profileStations(shape.revolve, F.rsign, h));
  const lineWeights = new Float32Array((lines.length + edgeRings.length + rings.length) / 3);
  lineWeights.fill(1, 0, (lines.length + edgeRings.length) / 3);
  lineWeights.fill(RING_WEIGHT, (lines.length + edgeRings.length) / 3);
  lines = concat(concat(lines, edgeRings), rings);

  let out = { positions: Float32Array.from(P), normals, indices, lines, lineWeights, terms };
  const box = { min: F.box.min.slice(), max: F.box.max.slice() };
  if (dup) {
    out = mirrorTwin(out);
    const zm = Math.max(Math.abs(box.min[2]), Math.abs(box.max[2]));
    box.min[2] = -zm;
    box.max[2] = zm;
  }
  return { ...out, level, cell: h, grid: [nx, ny, nz], triangles: out.indices.length / 3, ms: now() - t0, box };
}

function concat(a, b) {
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** Evenly spaced stations between lo and hi, centered, none within a third of a spacing of the ends. */
function evenStations(lo, hi, spacing) {
  const out = [];
  const count = Math.max(1, Math.floor((hi - lo) / spacing));
  const first = lo + (hi - lo - (count - 1) * spacing) / 2;
  for (let c = 0; c < count; c++) {
    const at = first + c * spacing;
    if (at > lo + spacing * 0.35 && at < hi - spacing * 0.35) out.push(at);
  }
  return out;
}

/** Stations of a revolve profile's sharp corners and of its highlight (largest radius), in model coordinates. */
function profileStations(profile, sign, h) {
  const out = [];
  const n = profile.length;
  let best = 0;
  for (let i = 0; i < n; i++) {
    if (profile[i][0] > profile[best][0]) best = i;
    if (i === 0 || i === n - 1) continue;
    const [r0, a0] = profile[i - 1], [r1, a1] = profile[i], [r2, a2] = profile[i + 1];
    const ux = a1 - a0, uy = r1 - r0, vx = a2 - a1, vy = r2 - r1;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) continue;
    // a corner whose two edges both run across the axis (a step, not a cylinder's end)
    if ((ux * vx + uy * vy) / (lu * lv) < Math.cos((35 * Math.PI) / 180)) out.push(a1);
  }
  out.push(profile[best][1]);
  // inset a little from flat ends (a section exactly at an end face would trace it twice)
  const lo = Math.min(...profile.map((p) => p[1])), hi = Math.max(...profile.map((p) => p[1]));
  return [...new Set(out.map((a) => Math.min(hi - h * 0.6, Math.max(lo + h * 0.6, a)) * sign))];
}

/** Cross-sections of the mesh at the given stations along an axis (0 x, 1 y, 2 z). */
function sectionLines(P, indices, axis, stations) {
  const out = new Grow(Float32Array, 1 << 12);
  const d = new Float64Array(3);
  const pts = new Float64Array(6);
  for (const at of stations) {
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t], b = indices[t + 1], e = indices[t + 2];
      d[0] = P[a * 3 + axis] - at;
      d[1] = P[b * 3 + axis] - at;
      d[2] = P[e * 3 + axis] - at;
      if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] <= 0 && d[1] <= 0 && d[2] <= 0)) continue;
      let n = 0;
      const V = [a, b, e];
      for (let k = 0; k < 3 && n < 2; k++) {
        const i = V[k], j = V[(k + 1) % 3];
        const di = d[k], dj = d[(k + 1) % 3];
        if (di > 0 === dj > 0) continue;
        const s = di / (di - dj);
        pts[n * 3] = P[i * 3] + (P[j * 3] - P[i * 3]) * s;
        pts[n * 3 + 1] = P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * s;
        pts[n * 3 + 2] = P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * s;
        n++;
      }
      if (n === 2) {
        out.push3(pts[0], pts[1], pts[2]);
        out.push3(pts[3], pts[4], pts[5]);
      }
    }
  }
  return out.done();
}

/** The mesh plus its mirror image across z = 0 (wound the other way): a pair of door mirrors. */
function mirrorTwin({ positions, normals, indices, lines, lineWeights, terms }) {
  const n = positions.length / 3;
  const p2 = new Float32Array(positions.length * 2);
  const n2 = new Float32Array(positions.length * 2);
  p2.set(positions);
  n2.set(normals);
  for (let i = 0; i < n; i++) {
    p2[(n + i) * 3] = positions[i * 3];
    p2[(n + i) * 3 + 1] = positions[i * 3 + 1];
    p2[(n + i) * 3 + 2] = -positions[i * 3 + 2];
    n2[(n + i) * 3] = normals[i * 3];
    n2[(n + i) * 3 + 1] = normals[i * 3 + 1];
    n2[(n + i) * 3 + 2] = -normals[i * 3 + 2];
  }
  const i2 = new Uint32Array(indices.length * 2);
  i2.set(indices);
  for (let t = 0; t < indices.length; t += 3) {
    i2[indices.length + t] = indices[t] + n;
    i2[indices.length + t + 1] = indices[t + 2] + n;
    i2[indices.length + t + 2] = indices[t + 1] + n;
  }
  const l2 = new Float32Array(lines.length * 2);
  l2.set(lines);
  for (let i = 0; i < lines.length; i += 3) {
    l2[lines.length + i] = lines[i];
    l2[lines.length + i + 1] = lines[i + 1];
    l2[lines.length + i + 2] = -lines[i + 2];
  }
  const t2 = new Uint8Array(terms.length * 2);
  t2.set(terms);
  t2.set(terms, terms.length);
  const w2 = new Float32Array(lineWeights.length * 2);
  w2.set(lineWeights);
  w2.set(lineWeights, lineWeights.length);
  return { positions: p2, normals: n2, indices: i2, lines: l2, lineWeights: w2, terms: t2 };
}

/**
 * Lines along the creases where two views meet (hood edges, roof rails, the beltline) and along
 * cut edges (wheel-arch lips): the zero set of (term u - term v) on the mesh, where both terms
 * shape the surface (within the rounding band), no third term is closer to the surface, and the
 * two surfaces meet at an angle (two views that agree on a face, like a car's nose seen from the
 * side and from above, make no line).
 */
function featureLines(P, indices, TVal, TDir, nt, band, cutBand) {
  const out = new Grow(Float32Array, 1 << 12);
  const pu = [];
  const pv = [];
  for (let u = 0; u < Math.min(NV, nt); u++) for (let v = u + 1; v < Math.min(NV, nt); v++) {
    pu.push(u);
    pv.push(v);
  }
  for (let c = NV; c < nt; c++) {
    pu.push(-1); // the body: whichever view is nearest the surface
    pv.push(c);
  }
  const bodyTerm = (i) => {
    const o = i * nt;
    let b = 0;
    for (let t = 1; t < NV; t++) if (TVal[o + t] < TVal[o + b]) b = t;
    return b;
  };
  // vertices where two or more terms are near the surface: lines can only pass near them
  const nv = TVal.length / nt;
  const near = new Uint8Array(nv);
  const wide = Math.max(band, cutBand) * 2;
  for (let i = 0; i < nv; i++) {
    let c = 0;
    for (let t = 0; t < nt; t++) if (Math.abs(TVal[i * nt + t]) < wide) c++;
    near[i] = c >= 2 ? 1 : 0;
  }
  const tris = [];
  for (let t = 0; t < indices.length; t += 3) if (near[indices[t]] || near[indices[t + 1]] || near[indices[t + 2]]) tris.push(t);
  const cross = new Float64Array(6);
  for (let pi = 0; pi < pu.length; pi++) {
    const v = pv[pi];
    const lim = v >= NV ? cutBand : band;
    for (let ti = 0; ti < tris.length; ti++) {
      const t = tris[ti];
      let found = 0;
      for (let e = 0; e < 3; e++) {
        const a = indices[t + e];
        const b = indices[t + (e === 2 ? 0 : e + 1)];
        const ua = pu[pi] < 0 ? bodyTerm(a) : pu[pi];
        const ub = pu[pi] < 0 ? bodyTerm(b) : pu[pi];
        const ga = TVal[a * nt + ua] - TVal[a * nt + v];
        const gb = TVal[b * nt + ub] - TVal[b * nt + v];
        if (ga > 0 === gb > 0 || ga === gb) continue;
        const s = ga / (ga - gb);
        const fu = TVal[a * nt + ua] + (TVal[b * nt + ub] - TVal[a * nt + ua]) * s;
        if (Math.abs(fu) > lim) continue;
        // the two surfaces must meet at an angle
        const da = a * nt * 3, db = b * nt * 3;
        let dot = 0;
        for (let q = 0; q < 3; q++) {
          const nu = TDir[da + ua * 3 + q] + (TDir[db + ub * 3 + q] - TDir[da + ua * 3 + q]) * s;
          const nvv = TDir[da + v * 3 + q] + (TDir[db + v * 3 + q] - TDir[da + v * 3 + q]) * s;
          dot += nu * nvv;
        }
        if (dot > COS_CREASE) continue;
        // no other term nearer the surface
        let blocked = false;
        for (let w = 0; w < nt && !blocked; w++) {
          if (w === ua || w === ub || w === v || (pu[pi] < 0 && w < NV)) continue;
          const fw = TVal[a * nt + w] + (TVal[b * nt + w] - TVal[a * nt + w]) * s;
          if (fw < fu - lim * 0.25) blocked = true;
        }
        if (blocked) continue;
        if (found < 2) {
          cross[found * 3] = P[a * 3] + (P[b * 3] - P[a * 3]) * s;
          cross[found * 3 + 1] = P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * s;
          cross[found * 3 + 2] = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * s;
        }
        found++;
      }
      if (found === 2) {
        out.push3(cross[0], cross[1], cross[2]);
        out.push3(cross[3], cross[4], cross[5]);
      }
    }
  }
  return out.done();
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------------------------
// Panels: the part of a hull's surface inside an outline drawn on one of its views

// view -> [u index, v index] of model coordinates, and the direction the outline faces
const PANEL_SETUP = {
  right: { u: 0, v: 1, dirs: [[0, 0, 1]] },
  left: { u: 0, v: 1, dirs: [[0, 0, -1]] },
  sides: { u: 0, v: 1, dirs: [[0, 0, 1], [0, 0, -1]] },
  front: { u: 2, v: 1, dirs: [[1, 0, 0]] },
  back: { u: 2, v: 1, dirs: [[-1, 0, 0]] },
  top: { u: 0, v: 2, dirs: [[0, 1, 0]] },
  bottom: { u: 0, v: 2, dirs: [[0, -1, 0]] },
};

/** Model-space copies of a shape: [{ m (3x3 row-major), t }] (axis turn, rot, at, repeat). */
export function shapeInstances(shape) {
  return cutInstances(shape).map((c) => ({ m: c.full, t: c.origin }));
}

function pointInPoly(poly, u, v) {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ui = poly[i * 2], vi = poly[i * 2 + 1], uj = poly[j * 2], vj = poly[j * 2 + 1];
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

function segmentsCross(a0, a1, b0, b1, c0, c1, d0, d1) {
  const o = (p0, p1, q0, q1, r0, r1) => (q0 - p0) * (r1 - p1) - (q1 - p1) * (r0 - p0);
  const d1_ = o(a0, a1, b0, b1, c0, c1), d2_ = o(a0, a1, b0, b1, d0, d1);
  const d3_ = o(c0, c1, d0, d1, a0, a1), d4_ = o(c0, c1, d0, d1, b0, b1);
  return d1_ > 0 !== d2_ > 0 && d3_ > 0 !== d4_ > 0;
}

/** Clip a (possibly concave) polygon by a convex triangle (Sutherland-Hodgman): flat [u, v, …]. */
function clipByTriangle(poly, tri) {
  let pts = Array.from(poly);
  const area = (tri[2] - tri[0]) * (tri[5] - tri[1]) - (tri[4] - tri[0]) * (tri[3] - tri[1]);
  const s = area > 0 ? 1 : -1;
  for (let e = 0; e < 3 && pts.length; e++) {
    const ax = tri[e * 2], ay = tri[e * 2 + 1];
    const bx = tri[((e + 1) % 3) * 2], by = tri[((e + 1) % 3) * 2 + 1];
    const side = (x, y) => s * ((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    const next = [];
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const px = pts[i * 2], py = pts[i * 2 + 1];
      const qx = pts[((i + 1) % n) * 2], qy = pts[((i + 1) % n) * 2 + 1];
      const sp = side(px, py), sq = side(qx, qy);
      if (sp >= 0) next.push(px, py);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        next.push(px + (qx - px) * t, py + (qy - py) * t);
      }
    }
    pts = next;
  }
  return pts;
}

/** Ear-clipping triangulation of a small simple polygon (flat [u, v, …]) -> index triples. */
function earClip(pts) {
  const n = pts.length / 2;
  if (n < 3) return [];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  const ccw = area > 0;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const out = [];
  const cross = (a, b, c) => (pts[b * 2] - pts[a * 2]) * (pts[c * 2 + 1] - pts[a * 2 + 1]) - (pts[b * 2 + 1] - pts[a * 2 + 1]) * (pts[c * 2] - pts[a * 2]);
  let guard = 0;
  while (idx.length > 3 && guard++ < 500) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      const cr = cross(a, b, c);
      if (ccw ? cr <= 1e-12 : cr >= -1e-12) continue; // reflex or flat
      let contains = false;
      for (const p of idx) {
        if (p === a || p === b || p === c) continue;
        const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
        if (ccw ? d1 > 0 && d2 > 0 && d3 > 0 : d1 < 0 && d2 < 0 && d3 < 0) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      out.push(a, b, c);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // degenerate leftovers: fan the rest
      for (let i = 1; i < idx.length - 1; i++) out.push(idx[0], idx[i], idx[i + 1]);
      return out;
    }
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}

/**
 * The part of one or more hull meshes inside a panel's outline, facing the panel's view, lifted a
 * little off the surface; plus the outline traced on the surface as lines.
 *   hulls: [{ mesh (from hullMesh), shape (the normalized hull: its at, rot, repeat place it) }]
 *   panel: normalized panel { face, outline, mirror?, wrap?, lift? }
 * Returns { positions, normals, indices, lines } in model coordinates, or null when nothing faces it.
 */
// Model-space copies of host meshes, kept per mesh (several panels lie on the same body).
const placed = new WeakMap();

function placeHosts(hulls) {
  const parts = [];
  for (const { mesh, shape } of hulls) {
    if (!mesh || !mesh.positions || !mesh.positions.length) continue;
    const key = JSON.stringify([shape.at || null, shape.rot || null, shape.repeat || null]);
    let byKey = placed.get(mesh);
    if (!byKey) placed.set(mesh, (byKey = new Map()));
    let host = byKey.get(key);
    if (!host) {
      const insts = shapeInstances(shape);
      const nv = mesh.positions.length / 3;
      const P = new Float32Array(nv * 3 * insts.length);
      const N = new Float32Array(nv * 3 * insts.length);
      const TM = new Uint8Array(nv * insts.length);
      const I = new Uint32Array(mesh.indices.length * insts.length);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      insts.forEach((inst, c) => {
        const m = inst.m, t = inst.t;
        const pos = mesh.positions, nor = mesh.normals;
        for (let i = 0; i < nv; i++) {
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          const o = (c * nv + i) * 3;
          P[o] = m[0] * x + m[1] * y + m[2] * z + t[0];
          P[o + 1] = m[3] * x + m[4] * y + m[5] * z + t[1];
          P[o + 2] = m[6] * x + m[7] * y + m[8] * z + t[2];
          for (let a = 0; a < 3; a++) {
            if (P[o + a] < lo[a]) lo[a] = P[o + a];
            if (P[o + a] > hi[a]) hi[a] = P[o + a];
          }
          const a = nor[i * 3], b = nor[i * 3 + 1], cc = nor[i * 3 + 2];
          N[o] = m[0] * a + m[1] * b + m[2] * cc;
          N[o + 1] = m[3] * a + m[4] * b + m[5] * cc;
          N[o + 2] = m[6] * a + m[7] * b + m[8] * cc;
        }
        TM.set(mesh.terms, c * nv);
        for (let i = 0; i < mesh.indices.length; i++) I[c * mesh.indices.length + i] = mesh.indices[i] + c * nv;
      });
      host = { P, N, TM, I, lo, hi, cell: mesh.cell || Infinity };
      byKey.set(key, host);
    }
    parts.push(host);
  }
  if (parts.length === 1) return parts[0];
  if (!parts.length) return null;
  // several hulls: concatenate
  const nv = parts.reduce((n, h) => n + h.P.length / 3, 0);
  const ni = parts.reduce((n, h) => n + h.I.length, 0);
  const out = { P: new Float32Array(nv * 3), N: new Float32Array(nv * 3), TM: new Uint8Array(nv), I: new Uint32Array(ni), lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], cell: Infinity };
  let vo = 0, io = 0;
  for (const h of parts) {
    out.P.set(h.P, vo * 3);
    out.N.set(h.N, vo * 3);
    out.TM.set(h.TM, vo);
    for (let i = 0; i < h.I.length; i++) out.I[io + i] = h.I[i] + vo;
    for (let a = 0; a < 3; a++) {
      out.lo[a] = Math.min(out.lo[a], h.lo[a]);
      out.hi[a] = Math.max(out.hi[a], h.hi[a]);
    }
    out.cell = Math.min(out.cell, h.cell);
    vo += h.P.length / 3;
    io += h.I.length;
  }
  return out;
}

export function panelMesh(hulls, panel) {
  const setup = PANEL_SETUP[panel.face];
  if (!setup || !Array.isArray(panel.outline) || panel.outline.length < 3) return null;
  const host = placeHosts(hulls);
  if (!host) return null;
  const { P, N, TM, I, lo, hi, cell } = host;
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const lift = panel.lift ?? Math.max(diag * 0.0035, (Number.isFinite(cell) ? cell : 0) * 0.15);
  const step = Number.isFinite(cell) ? cell * 0.5 : diag / 300;

  const outP = new Grow(Float32Array, 1 << 12);
  const outN = new Grow(Float32Array, 1 << 12);
  const lines = new Grow(Float32Array, 1 << 10);
  const { u: iu, v: iv } = setup;
  const passes = [];
  // a wrapped panel takes every face inside the outline, whichever way it faces: one pass
  const dirs = panel.wrap ? setup.dirs.slice(0, 1) : setup.dirs;
  for (const dir of dirs) passes.push({ dir, flip: false });
  if (panel.mirror && (panel.face === 'front' || panel.face === 'back' || panel.face === 'top' || panel.face === 'bottom')) {
    for (const dir of dirs) passes.push({ dir, flip: true });
  }
  const flat = new Float64Array(panel.outline.length * 2);
  panel.outline.forEach((p, i) => {
    flat[i * 2] = p[0];
    flat[i * 2 + 1] = p[1];
  });
  const outline = smoothOutline(flat, Math.max(step, diag / 400));
  const nv = P.length / 3;
  const inside = new Int8Array(nv);
  const bary = (px, py, ax, ay, bx, by, cx, cy) => {
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-12) return null;
    const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
    const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
    return [w0, w1, 1 - w0 - w1];
  };
  const emit = (ta, tb, tc, w) => {
    // a point inside triangle (ta, tb, tc) at barycentric w, lifted along the interpolated normal
    let nx = 0, ny = 0, nz = 0, px = 0, py = 0, pz = 0;
    const T = [ta, tb, tc];
    for (let k = 0; k < 3; k++) {
      const o = T[k] * 3;
      px += P[o] * w[k];
      py += P[o + 1] * w[k];
      pz += P[o + 2] * w[k];
      nx += N[o] * w[k];
      ny += N[o + 1] * w[k];
      nz += N[o + 2] * w[k];
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    outP.push3(px + nx * lift, py + ny * lift, pz + nz * lift);
    outN.push3(nx, ny, nz);
  };

  for (const pass of passes) {
    const poly = Float64Array.from(outline);
    if (pass.flip) for (let i = 0; i < poly.length; i += 2) {
      if (iu === 2) poly[i] = -poly[i];
      if (iv === 2) poly[i + 1] = -poly[i + 1];
    }
    const pr = polyRange(poly);
    const dir = pass.dir;
    inside.fill(-1);
    // the outline's edges in a bucket grid: a triangle only tests the edges near it
    const EG = 32;
    const ebw = (pr.u1 - pr.u0) / EG || 1, ebh = (pr.v1 - pr.v0) / EG || 1;
    const ne = poly.length / 2;
    const eBuckets = new Array(EG * EG);
    for (let e = 0; e < ne; e++) {
      const p0 = poly[e * 2], p1 = poly[e * 2 + 1], q0 = poly[((e + 1) % ne) * 2], q1 = poly[((e + 1) % ne) * 2 + 1];
      const i0 = Math.max(0, Math.floor((Math.min(p0, q0) - pr.u0) / ebw)), i1 = Math.min(EG - 1, Math.floor((Math.max(p0, q0) - pr.u0) / ebw));
      const j0 = Math.max(0, Math.floor((Math.min(p1, q1) - pr.v0) / ebh)), j1 = Math.min(EG - 1, Math.floor((Math.max(p1, q1) - pr.v0) / ebh));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (eBuckets[i + j * EG] || (eBuckets[i + j * EG] = [])).push(e);
    }
    const stamp = new Int32Array(ne).fill(-1);
    const isIn = (i) => {
      if (inside[i] < 0) inside[i] = pointInPoly(poly, P[i * 3 + iu], P[i * 3 + iv]) ? 1 : 0;
      return inside[i] === 1;
    };
    const cand = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const ua = P[a * 3 + iu], ub = P[b * 3 + iu], uc = P[c * 3 + iu];
      const va = P[a * 3 + iv], vb = P[b * 3 + iv], vc = P[c * 3 + iv];
      if (Math.max(ua, ub, uc) < pr.u0 || Math.min(ua, ub, uc) > pr.u1 || Math.max(va, vb, vc) < pr.v0 || Math.min(va, vb, vc) > pr.v1) continue;
      if (!panel.wrap) {
        const f = (N[a * 3] + N[b * 3] + N[c * 3]) * dir[0] + (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) * dir[1] + (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]) * dir[2];
        if (f <= 0.45) continue; // facing away, or nearly edge-on (average n·dir under 0.15)
        if (TM[a] >= NV || TM[b] >= NV || TM[c] >= NV) continue; // a cut's wall (inside a wheel arch)
      }
      cand.push(t);
      const ins = (isIn(a) ? 1 : 0) + (isIn(b) ? 1 : 0) + (isIn(c) ? 1 : 0);
      // does the outline cross this triangle? (only the edges in the buckets it overlaps)
      let crosses = false;
      const n = ne;
      const tu0 = Math.min(ua, ub, uc), tu1 = Math.max(ua, ub, uc), tv0 = Math.min(va, vb, vc), tv1 = Math.max(va, vb, vc);
      const bi0 = Math.max(0, Math.floor((tu0 - pr.u0) / ebw)), bi1 = Math.min(EG - 1, Math.floor((tu1 - pr.u0) / ebw));
      const bj0 = Math.max(0, Math.floor((tv0 - pr.v0) / ebh)), bj1 = Math.min(EG - 1, Math.floor((tv1 - pr.v0) / ebh));
      for (let bi = bi0; bi <= bi1 && !crosses; bi++) for (let bj = bj0; bj <= bj1 && !crosses; bj++) {
        const list = eBuckets[bi + bj * EG];
        if (!list) continue;
        for (let li = 0; li < list.length && !crosses; li++) {
          const e = list[li];
          if (stamp[e] === t) continue;
          stamp[e] = t;
          const p0 = poly[e * 2], p1 = poly[e * 2 + 1];
          const q0 = poly[((e + 1) % n) * 2], q1 = poly[((e + 1) % n) * 2 + 1];
          if (Math.max(p0, q0) < tu0 || Math.min(p0, q0) > tu1 || Math.max(p1, q1) < tv0 || Math.min(p1, q1) > tv1) continue;
          crosses = segmentsCross(p0, p1, q0, q1, ua, va, ub, vb) || segmentsCross(p0, p1, q0, q1, ub, vb, uc, vc) || segmentsCross(p0, p1, q0, q1, uc, vc, ua, va);
        }
      }
      if (!crosses && ins === 3) {
        emit(a, b, c, [1, 0, 0]);
        emit(a, b, c, [0, 1, 0]);
        emit(a, b, c, [0, 0, 1]);
        continue;
      }
      if (!crosses && ins === 0) {
        // the whole outline may sit inside one big triangle
        if (!(pointInTri(poly[0], poly[1], ua, va, ub, vb, uc, vc))) continue;
      }
      const piece = clipByTriangle(poly, [ua, va, ub, vb, uc, vc]);
      if (piece.length < 6) continue;
      const tris = earClip(piece);
      for (let k = 0; k < tris.length; k += 3) {
        for (let q = 0; q < 3; q++) {
          const pi = tris[k + q];
          const w = bary(piece[pi * 2], piece[pi * 2 + 1], ua, va, ub, vb, uc, vc);
          emit(a, b, c, w || [1 / 3, 1 / 3, 1 / 3]);
        }
      }
    }

    // the outline on the surface: sample it, find each sample's triangle (bucket grid), lift it
    const G = 48;
    const bw = (pr.u1 - pr.u0) / G || 1, bh = (pr.v1 - pr.v0) / G || 1;
    const buckets = new Map();
    for (const t of cand) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const us = [P[a * 3 + iu], P[b * 3 + iu], P[c * 3 + iu]], vs = [P[a * 3 + iv], P[b * 3 + iv], P[c * 3 + iv]];
      const i0 = Math.max(0, Math.floor((Math.min(...us) - pr.u0) / bw)), i1 = Math.min(G - 1, Math.floor((Math.max(...us) - pr.u0) / bw));
      const j0 = Math.max(0, Math.floor((Math.min(...vs) - pr.v0) / bh)), j1 = Math.min(G - 1, Math.floor((Math.max(...vs) - pr.v0) / bh));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const key = i + j * G;
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(t);
      }
    }
    const locate = (u, v) => {
      const i = Math.min(G - 1, Math.max(0, Math.floor((u - pr.u0) / bw)));
      const j = Math.min(G - 1, Math.max(0, Math.floor((v - pr.v0) / bh)));
      const list = buckets.get(i + j * G);
      if (!list) return null;
      for (const t of list) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        const w = bary(u, v, P[a * 3 + iu], P[a * 3 + iv], P[b * 3 + iu], P[b * 3 + iv], P[c * 3 + iu], P[c * 3 + iv]);
        if (w && w[0] >= -1e-6 && w[1] >= -1e-6 && w[2] >= -1e-6) {
          let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
          const T = [a, b, c];
          for (let k = 0; k < 3; k++) {
            px += P[T[k] * 3] * w[k];
            py += P[T[k] * 3 + 1] * w[k];
            pz += P[T[k] * 3 + 2] * w[k];
            nx += N[T[k] * 3] * w[k];
            ny += N[T[k] * 3 + 1] * w[k];
            nz += N[T[k] * 3 + 2] * w[k];
          }
          const l = Math.hypot(nx, ny, nz) || 1;
          const up = lift * 1.15;
          return [px + (nx / l) * up, py + (ny / l) * up, pz + (nz / l) * up];
        }
      }
      return null;
    };
    const n = poly.length / 2;
    let prev = null;
    let first = null;
    for (let e = 0; e < n; e++) {
      const p0 = poly[e * 2], p1 = poly[e * 2 + 1];
      const q0 = poly[((e + 1) % n) * 2], q1 = poly[((e + 1) % n) * 2 + 1];
      const len = Math.hypot(q0 - p0, q1 - p1);
      const steps = Math.max(1, Math.ceil(len / step));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const pt = locate(p0 + (q0 - p0) * t, p1 + (q1 - p1) * t);
        if (pt && prev) {
          lines.push3(prev[0], prev[1], prev[2]);
          lines.push3(pt[0], pt[1], pt[2]);
        }
        if (e === 0 && s === 0) first = pt;
        prev = pt;
      }
    }
    if (prev && first) {
      lines.push3(prev[0], prev[1], prev[2]);
      lines.push3(first[0], first[1], first[2]);
    }
  }
  const positions = outP.done();
  if (!positions.length && !lines.n) return null;
  const indices = new Uint32Array(positions.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions, normals: outN.done(), indices, lines: lines.done(), triangles: indices.length / 3 };
}

function pointInTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
