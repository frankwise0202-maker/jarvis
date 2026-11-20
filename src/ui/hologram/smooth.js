// Smooth hologram surfaces (pure math, no three.js): the skin of a `loft` through cross-sections,
// superellipsoids (`box` with `round`), centripetal Catmull-Rom profiles (`lathe` / `tube` with
// `smooth`), and their feature lines. Everything is returned as plain arrays in the shape's own
// frame; geometry.js turns them into BufferGeometry and applies rot, at and repeat.
//
// Loft frame: a loft runs along its axis (station s); every cross-section lies in the plane
// across it, with coordinates [u, v] taken like an extrude outline: axis x -> [z, y] (a car seen
// from the front), axis y -> [x, z] (a plan view), axis z -> [x, y] (a side view).
//
// Cross-sections are superellipses |u/a|^n + |v/b|^n = 1 with n = 2 / round (round 1 = ellipse,
// 0.5 = soft box, 0.2 = box with small rounded corners), optionally narrower at the top (`top`,
// a car's tumblehome) and twisted (`twist`, fan blades), or a custom polygon (`pts`). Every
// section is sampled at the same N parameter values, starting at the bottom and turning
// counterclockwise, so corresponding points line up (corner with corner); the skin interpolates
// each point along the axis with a monotone cubic (PCHIP), which never overshoots between
// sections: a car's widest section stays its widest, a roof never bulges above its sections.

export const LOFT_AXES = Object.freeze({
  // which of [x, y, z] the station s and the section coordinates u, v are
  x: [0, 2, 1],
  y: [1, 0, 2],
  z: [2, 0, 1],
});

const TAU = Math.PI * 2;
const MAX_N = 40; // the sharpest superellipse (round 0.05)
// Line brightness (the line shader's aW) of a loft's contour rings: fainter than its shoulder and
// crease lines, so a loft of many sections (or a row of blades) does not glow into a blur.
export const RING_WEIGHT = 0.55;

/** Superellipse exponent from `round` (0..1): 1 -> 2 (ellipse), 0.5 -> 4, 0 -> 40 (rectangle). */
export function exponentOf(round) {
  const r = Number.isFinite(round) ? Math.min(1, Math.max(0, round)) : 1;
  return Math.min(MAX_N, 2 / Math.max(r, 2 / MAX_N));
}

const spow = (x, e) => (x < 0 ? -Math.pow(-x, e) : Math.pow(x, e));

// ---------------------------------------------------------------------------------------------
// Monotone cubic interpolation (Fritsch–Carlson): smooth, and never beyond the given values.

/** Slopes for PCHIP through (xs[i], ys[i]); xs strictly increasing. */
export function pchipSlopes(xs, ys) {
  const n = xs.length;
  const d = new Float64Array(n);
  if (n < 2) return d;
  const h = new Float64Array(n - 1);
  const delta = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    delta[i] = (ys[i + 1] - ys[i]) / h[i];
  }
  if (n === 2) {
    d[0] = d[1] = delta[0];
    return d;
  }
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) d[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }
  // ends: three-point estimate, kept shape-preserving
  const end = (h0, h1, d0, d1) => {
    let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(s) !== Math.sign(d0)) s = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0;
    return s;
  };
  d[0] = end(h[0], h[1], delta[0], delta[1]);
  d[n - 1] = end(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
  return d;
}

/** Value at x of the PCHIP through (xs, ys) with slopes d; `i` is the interval (xs[i] <= x <= xs[i+1]). */
function hermite(xs, ys, d, i, x) {
  const h = xs[i + 1] - xs[i];
  const t = (x - xs[i]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * d[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * d[i + 1];
}

// ---------------------------------------------------------------------------------------------
// Polygons

function polygonArea2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * A closed polygon resampled to N points, evenly by arc length, counterclockwise, starting where
 * the outline crosses straight below its box center (so it lines up with superellipse sections).
 * Returns [u0, v0, u1, v1, ...] relative to `center`.
 */
export function resampleClosed(pts, N, center = [0, 0]) {
  let poly = pts.map((p) => [p[0] - center[0], p[1] - center[1]]);
  if (polygonArea2(poly) < 0) poly = poly.reverse();
  let minU = Infinity, maxU = -Infinity;
  for (const p of poly) {
    minU = Math.min(minU, p[0]);
    maxU = Math.max(maxU, p[0]);
  }
  const cu = (minU + maxU) / 2;
  // start: the lowest crossing of the vertical line u = cu
  let start = 0;
  let startT = 0;
  let bestV = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a[0] - cu) * (b[0] - cu) > 0 || a[0] === b[0]) continue;
    const t = (cu - a[0]) / (b[0] - a[0]);
    const v = a[1] + t * (b[1] - a[1]);
    if (v < bestV) {
      bestV = v;
      start = i;
      startT = t;
    }
  }
  // the closed walk S -> P[start+1] -> ... -> P[start] -> S, with S on the edge after P[start]
  const a0 = poly[start];
  const b0 = poly[(start + 1) % poly.length];
  const S = [a0[0] + startT * (b0[0] - a0[0]), a0[1] + startT * (b0[1] - a0[1])];
  const ring = [S];
  for (let k = 1; k <= poly.length; k++) ring.push(poly[(start + k) % poly.length]);
  ring.push(S);
  // cumulative lengths
  const len = [0];
  for (let i = 1; i < ring.length; i++) len.push(len[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
  const total = len[len.length - 1] || 1;
  const out = new Float64Array(2 * N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const target = (k / N) * total;
    while (j < len.length - 2 && len[j + 1] < target) j++;
    const seg = len[j + 1] - len[j] || 1;
    const t = Math.min(1, Math.max(0, (target - len[j]) / seg));
    out[2 * k] = ring[j][0] + t * (ring[j + 1][0] - ring[j][0]);
    out[2 * k + 1] = ring[j][1] + t * (ring[j + 1][1] - ring[j][1]);
  }
  return out;
}

/** The N points [u, v, ...] of one normalized loft section (absolute u, v in the section plane). */
export function sectionRing(sec, N) {
  const out = new Float64Array(2 * N);
  const hw = sec.w / 2;
  const hh = sec.h / 2;
  const custom = sec.pts ? resampleClosed(sec.pts, N, [0, 0]) : null;
  const e = 2 / exponentOf(sec.round);
  const topK = sec.top !== undefined && sec.w > 0 ? sec.top / sec.w : 1;
  const tw = ((sec.twist || 0) * Math.PI) / 180;
  const ct = Math.cos(tw);
  const st = Math.sin(tw);
  for (let k = 0; k < N; k++) {
    let u;
    let v;
    if (custom) {
      u = custom[2 * k];
      v = custom[2 * k + 1];
    } else {
      const th = -Math.PI / 2 + (TAU * k) / N;
      u = hw * spow(Math.cos(th), e);
      v = hh * spow(Math.sin(th), e);
    }
    if (topK !== 1 && v > 0) u *= 1 + (topK - 1) * Math.min(1, v / Math.max(hh, 1e-9));
    if (tw) {
      const ru = u * ct - v * st;
      v = u * st + v * ct;
      u = ru;
    }
    out[2 * k] = (sec.c ? sec.c[0] : 0) + u;
    out[2 * k + 1] = (sec.c ? sec.c[1] : 0) + v;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Loft

/**
 * Station samples: every section, each gap split by its share of `target` rings (two at least,
 * unless the sections alone are already that many), arches refined with `archSteps` rings across.
 * Sorted, unique.
 */
function stationSamples(stations, target, arches, archSteps = 12) {
  const s0 = stations[0];
  const s1 = stations[stations.length - 1];
  const span = s1 - s0;
  const minK = 2 * (stations.length - 1) <= target ? 2 : 1;
  const out = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    const k = Math.max(minK, Math.min(24, Math.round(((b - a) / span) * target)));
    for (let j = 0; j < k; j++) out.push(a + ((b - a) * j) / k);
  }
  out.push(s1);
  for (const [as, , ar] of arches) {
    const steps = archSteps;
    for (let j = 0; j <= steps; j++) out.push(as + ar * Math.cos((Math.PI * j) / steps));
    const eps = Math.max(ar * 0.004, span * 1e-5);
    out.push(as - ar - eps, as + ar + eps);
  }
  const sorted = out.filter((s) => s >= s0 && s <= s1).sort((a, b) => a - b);
  const uniq = [];
  const tol = span * 1e-6;
  for (const s of sorted) if (!uniq.length || s - uniq[uniq.length - 1] > tol) uniq.push(s);
  return uniq;
}

/**
 * The skin of a normalized loft: { positions: Float32Array (x, y, z), indices, lines: number[],
 * lineWeights (one per line vertex: RING_WEIGHT for contour rings, 1 for shoulders and creases),
 * rings, ringSize } in the loft's own frame (stations along its axis, before rot/at).
 * opts.N points around (default 48), opts.M samples along (default 56, split by length),
 * opts.ribs: draw the outline of every given section (default true).
 */
export function loftSkin(shape, opts = {}) {
  const N = opts.N || 40;
  const M = opts.M || 40;
  const map = LOFT_AXES[shape.axis || 'x'] || LOFT_AXES.x;
  const secs = shape.sections;
  const S = secs.length;
  const stations = secs.map((s) => s.s);
  const rings = secs.map((sec) => sectionRing(sec, N));
  // per point: PCHIP slopes for u and v along the stations
  const us = new Float64Array(S);
  const vs = new Float64Array(S);
  const slopes = [];
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < S; i++) {
      us[i] = rings[i][2 * k];
      vs[i] = rings[i][2 * k + 1];
    }
    slopes.push([pchipSlopes(stations, us), pchipSlopes(stations, vs), Float64Array.from(us), Float64Array.from(vs)]);
  }
  const arches = shape.arches || [];
  const samples = stationSamples(stations, M, arches, opts.archSteps || 12);
  const R = samples.length;
  const pos = new Float32Array(R * N * 3);
  const uv = new Float64Array(R * N * 2); // section-plane coordinates, for feature lines
  let iv = 0;
  for (let r = 0; r < R; r++) {
    const s = samples[r];
    let seg = 0;
    while (seg < S - 2 && s > stations[seg + 1]) seg++;
    let archV = -Infinity;
    for (const [as, av, ar] of arches) {
      const dx = s - as;
      if (Math.abs(dx) <= ar) archV = Math.max(archV, av + Math.sqrt(Math.max(0, ar * ar - dx * dx)));
    }
    for (let k = 0; k < N; k++) {
      const [du, dv, u0, v0] = slopes[k];
      const u = hermite(stations, u0, du, seg, s);
      let v = hermite(stations, v0, dv, seg, s);
      if (v < archV) v = archV;
      const p = [0, 0, 0];
      p[map[0]] = s;
      p[map[1]] = u;
      p[map[2]] = v;
      pos[iv * 3] = p[0];
      pos[iv * 3 + 1] = p[1];
      pos[iv * 3 + 2] = p[2];
      uv[iv * 2] = u;
      uv[iv * 2 + 1] = v;
      iv++;
    }
  }
  // skin: quads between consecutive rings, wrapping around
  const tris = [];
  for (let r = 0; r < R - 1; r++) {
    for (let k = 0; k < N; k++) {
      const a = r * N + k;
      const b = r * N + ((k + 1) % N);
      const c = (r + 1) * N + k;
      const d = (r + 1) * N + ((k + 1) % N);
      tris.push(a, b, d, a, d, c);
    }
  }
  const lines = [];
  const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const ringLine = (r) => {
    for (let k = 0; k < N; k++) lines.push(...P(r * N + k), ...P(r * N + ((k + 1) % N)));
  };
  // ribs: the outline at the given sections (they read as the hologram's contour rings), thinned
  // so they never crowd (at least 3% of the length apart; the two ends always)
  if (opts.ribs !== false && !opts.edges) {
    const span = stations[S - 1] - stations[0];
    const gap = span * (opts.ribGap || 0.03);
    let last = -Infinity;
    stations.forEach((s, i) => {
      const end = i === 0 || i === S - 1;
      if (!end && (s - last < gap || stations[S - 1] - s < gap)) return;
      let best = 0;
      for (let r = 1; r < R; r++) if (Math.abs(samples[r] - s) < Math.abs(samples[best] - s)) best = r;
      ringLine(best);
      last = s;
    });
  } else {
    ringLine(0);
    ringLine(R - 1);
  }
  const ringVertices = lines.length / 3;
  // longitudinal feature lines: along the shoulders (the points at 45°, 135°, 225°, 315°), or for
  // a repeated loft (blades) its two edges across (0° and 180°: leading and trailing edge)
  for (const f of opts.edges ? [0.25, 0.75] : [0.125, 0.375, 0.625, 0.875]) {
    const k = Math.round(f * N) % N;
    for (let r = 0; r < R - 1; r++) lines.push(...P(r * N + k), ...P((r + 1) * N + k));
  }
  // creases (arch cut-outs, boxy corners): grid edges where neighbouring quads meet at > 35°
  creaseLines(pos, R, N, lines, Math.cos((35 * Math.PI) / 180));
  // caps
  const capMode = shape.cap === undefined ? 'both' : shape.cap;
  const capStart = capMode === 'both' || capMode === 'start';
  const capEnd = capMode === 'both' || capMode === 'end';
  const extraPos = [];
  const capTris = [];
  let next = R * N;
  for (const [use, r] of [
    [capStart, 0],
    [capEnd, R - 1],
  ]) {
    if (!use) continue;
    const ring2 = [];
    for (let k = 0; k < N; k++) ring2.push([uv[(r * N + k) * 2], uv[(r * N + k) * 2 + 1]]);
    const triangles = triangulate(ring2);
    const base = next;
    for (let k = 0; k < N; k++) {
      extraPos.push(...P(r * N + k));
      next++;
    }
    for (const t of triangles) capTris.push(base + t[0], base + t[1], base + t[2]);
  }
  const positions = new Float32Array(pos.length + extraPos.length);
  positions.set(pos, 0);
  positions.set(extraPos, pos.length);
  const indices = new Uint32Array(tris.length + capTris.length);
  indices.set(tris, 0);
  indices.set(capTris, tris.length);
  const lineWeights = new Float32Array(lines.length / 3).fill(1);
  lineWeights.fill(RING_WEIGHT, 0, ringVertices);
  return { positions, indices, lines, lineWeights, skinVertices: R * N, rings: R, ringSize: N };
}

function creaseLines(pos, R, N, out, cosMax) {
  // quad normal from its diagonals; degenerate (collapsed) quads have none and never make lines
  const normals = new Float64Array((R - 1) * N * 3);
  const ok = new Uint8Array((R - 1) * N);
  for (let r = 0; r < R - 1; r++) {
    for (let k = 0; k < N; k++) {
      const a = (r * N + k) * 3;
      const b = (r * N + ((k + 1) % N)) * 3;
      const c = ((r + 1) * N + k) * 3;
      const d = ((r + 1) * N + ((k + 1) % N)) * 3;
      const e1 = [pos[d] - pos[a], pos[d + 1] - pos[a + 1], pos[d + 2] - pos[a + 2]];
      const e2 = [pos[c] - pos[b], pos[c + 1] - pos[b + 1], pos[c + 2] - pos[b + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(n[0], n[1], n[2]);
      const q = r * N + k;
      const scale = Math.hypot(...e1) * Math.hypot(...e2);
      if (l > 1e-9 * Math.max(scale, 1e-12) && l > 0) {
        normals[q * 3] = n[0] / l;
        normals[q * 3 + 1] = n[1] / l;
        normals[q * 3 + 2] = n[2] / l;
        ok[q] = 1;
      }
    }
  }
  const dot = (p, q) => normals[p * 3] * normals[q * 3] + normals[p * 3 + 1] * normals[q * 3 + 1] + normals[p * 3 + 2] * normals[q * 3 + 2];
  const seg = (i, j) => out.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]);
  for (let r = 0; r < R - 1; r++) {
    for (let k = 0; k < N; k++) {
      const q = r * N + k;
      if (!ok[q]) continue;
      // edge shared with the next quad around (k+1): the longitudinal edge at point k+1
      const qa = r * N + ((k + 1) % N);
      if (ok[qa] && dot(q, qa) < cosMax) seg(r * N + ((k + 1) % N), (r + 1) * N + ((k + 1) % N));
      // edge shared with the next quad along (r+1): the ring edge between points k and k+1
      if (r < R - 2) {
        const qb = (r + 1) * N + k;
        if (ok[qb] && dot(q, qb) < cosMax) seg((r + 1) * N + k, (r + 1) * N + ((k + 1) % N));
      }
    }
  }
}

/** Ear-clipping triangulation of a simple polygon [[u, v], ...] (any winding): index triples. */
export function triangulate(poly) {
  const n = poly.length;
  if (n < 3) return [];
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const area = polygonArea2(poly);
  const sign = area >= 0 ? 1 : -1;
  const cross = (a, b, c) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  const inside = (p, a, b, c) => {
    const d1 = cross(a, b, p) * sign;
    const d2 = cross(b, c, p) * sign;
    const d3 = cross(c, a, p) * sign;
    return d1 > 0 && d2 > 0 && d3 > 0;
  };
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length];
      const b = idx[i];
      const c = idx[(i + 1) % idx.length];
      const cr = cross(a, b, c) * sign;
      if (cr < 0) continue; // reflex
      if (cr === 0) {
        // collinear or repeated point: drop it without a triangle
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      let ear = true;
      for (const p of idx) {
        if (p === a || p === b || p === c) continue;
        if (inside(p, a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push([a, b, c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // not simple: give up on the rest (a fan below)
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  else if (idx.length > 3) for (let i = 1; i < idx.length - 1; i++) out.push([idx[0], idx[i], idx[i + 1]]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Superellipsoid: a box with `round` (soft cabs, tanks, housings, seats)

/**
 * { positions, indices, lines } of a superellipsoid filling `size` [x, y, z] with exponent from
 * `round`, centered on the origin. Lines: the three principal outlines.
 */
export function superellipsoid(size, round, opts = {}) {
  const U = opts.around || 32;
  const V = opts.rows || 16;
  const e = 2 / exponentOf(round);
  const [a, b, c] = size.map((s) => s / 2);
  const pos = new Float32Array((V + 1) * U * 3);
  let i = 0;
  for (let r = 0; r <= V; r++) {
    const phi = -Math.PI / 2 + (Math.PI * r) / V;
    const cp = spow(Math.cos(phi), e);
    const sp = spow(Math.sin(phi), e);
    for (let k = 0; k < U; k++) {
      const th = (TAU * k) / U;
      pos[i++] = a * cp * spow(Math.cos(th), e);
      pos[i++] = b * sp;
      pos[i++] = c * cp * spow(Math.sin(th), e);
    }
  }
  const tris = [];
  for (let r = 0; r < V; r++) {
    for (let k = 0; k < U; k++) {
      const p = r * U + k;
      const q = r * U + ((k + 1) % U);
      const s = (r + 1) * U + k;
      const t = (r + 1) * U + ((k + 1) % U);
      if (r > 0) tris.push(p, q, t);
      if (r < V - 1) tris.push(p, t, s);
    }
  }
  const lines = [];
  const P = (idx) => [pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2]];
  const eq = V / 2;
  for (let k = 0; k < U; k++) lines.push(...P(eq * U + k), ...P(eq * U + ((k + 1) % U)));
  for (const k0 of [0, U / 4, U / 2, (3 * U) / 4]) {
    for (let r = 0; r < V; r++) lines.push(...P(r * U + k0), ...P((r + 1) * U + k0));
  }
  return { positions: pos, indices: Uint32Array.from(tris), lines };
}

// ---------------------------------------------------------------------------------------------
// Smooth open curves (lathe profiles): centripetal Catmull-Rom, corners kept

/**
 * Points of a smooth curve through `pts` ([[a, b], ...], open): centripetal Catmull-Rom with
 * `per` samples per span. A point where the outline turns by more than `cornerDeg` stays a sharp
 * corner (the curve is split there), so a stepped shaft keeps its steps and a lip stays round
 * when it is given with a few points. Returns { points, corners: indices of corners in points }.
 */
export function smoothPolyline(pts, per = 8, cornerDeg = 70) {
  const n = pts.length;
  if (n < 3) return { points: pts.map((p) => p.slice()), corners: [0, n - 1] };
  const cosMax = Math.cos((cornerDeg * Math.PI) / 180);
  const isCorner = (i) => {
    if (i === 0 || i === n - 1) return true;
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const d1 = [b[0] - a[0], b[1] - a[1]];
    const d2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(d1[0], d1[1]);
    const l2 = Math.hypot(d2[0], d2[1]);
    if (l1 < 1e-12 || l2 < 1e-12) return true;
    return (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2) < cosMax;
  };
  const out = [pts[0].slice()];
  const corners = [0];
  const given = [0];
  let runStart = 0;
  for (let i = 1; i < n; i++) {
    if (!isCorner(i)) continue;
    const run = pts.slice(runStart, i + 1);
    const curve = catmullRun(run, per, given, out.length - 1);
    for (let j = 1; j < curve.length; j++) out.push(curve[j]);
    corners.push(out.length - 1);
    runStart = i;
  }
  return { points: out, corners, given };
}

/** Turn in degrees between directions a->b and b->c. */
function turnDeg(a, b, c) {
  const d1 = [b[0] - a[0], b[1] - a[1]];
  const d2 = [c[0] - b[0], c[1] - b[1]];
  const l = Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1]);
  if (l < 1e-18) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (d1[0] * d2[0] + d1[1] * d2[1]) / l))) * 180) / Math.PI;
}

function catmullRun(run, per, given = null, offset = 0) {
  if (run.length === 2) {
    if (given) given.push(offset + 1);
    return [run[0].slice(), run[1].slice()];
  }
  // phantom end points continue the end segments straight
  const ext = [[2 * run[0][0] - run[1][0], 2 * run[0][1] - run[1][1]], ...run, [2 * run[run.length - 1][0] - run[run.length - 2][0], 2 * run[run.length - 1][1] - run[run.length - 2][1]]];
  const out = [run[0].slice()];
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i - 1];
    const p1 = ext[i];
    const p2 = ext[i + 1];
    const p3 = ext[i + 2];
    // samples by how much the curve turns over this span (about one per 9°), at most `per`
    const turn = (turnDeg(p0, p1, p2) + turnDeg(p1, p2, p3)) / 2;
    const steps = Math.max(1, Math.min(per, Math.ceil(turn / 9)));
    const dt = (a, b) => Math.max(1e-9, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
    const t0 = 0;
    const t1 = t0 + dt(p0, p1);
    const t2 = t1 + dt(p1, p2);
    const t3 = t2 + dt(p2, p3);
    for (let j = 1; j <= steps; j++) {
      const t = t1 + ((t2 - t1) * j) / steps;
      const lerp = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = lerp(p0, p1, t0, t1);
      const A2 = lerp(p1, p2, t1, t2);
      const A3 = lerp(p2, p3, t2, t3);
      const B1 = lerp(A1, A2, t0, t2);
      const B2 = lerp(A2, A3, t1, t3);
      out.push(lerp(B1, B2, t1, t2));
    }
    if (given) given.push(offset + out.length - 1); // the curve passes through each given point
  }
  return out;
}
