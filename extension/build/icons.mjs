// Jarvis emblem icons for the extension (16, 32, 48 and 128 px), rendered at build time in plain
// Node: no browser, no image libraries. The emblem follows the app's (scripts/make-icons.mjs):
// a dark rounded tile, a segmented HUD ring with tick marks, a glowing cyan core and the engraved
// "J", in the 512 x 512 design space, drawn as shapes with supersampled anti-aliasing and encoded
// as PNG with zlib. Small sizes use fewer, bolder strokes.

import { deflateSync } from 'node:zlib';

const C = 256;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = [hex('#0d2233'), hex('#071019'), hex('#04070c')];
const CYAN = hex('#3ee0ff');
const CYAN_LIGHT = hex('#8af3ff');
const CYAN_DEEP = hex('#1aa8d6');
const INK = hex('#03121b');
const WHITE = hex('#f4ffff');
const PALE = hex('#bff8ff');
const RIM = hex('#e8feff');

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function gradient(stops, t) {
  t = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return mix(c0, c1, (t - t0) / (t1 - t0 || 1));
    }
  }
  return stops[stops.length - 1][1];
}

function roundedRectInside(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Angle in degrees clockwise from 12 o'clock. */
function angleOf(x, y) {
  const a = (Math.atan2(y - C, x - C) * 180) / Math.PI + 90;
  return (a + 360) % 360;
}

function inSpan(angle, start, span) {
  const d = (angle - start + 360) % 360;
  return d <= span;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Layers of the emblem for one detail level, as functions (x, y) -> [r, g, b, a] | null. */
function emblem(detail, scale) {
  const S = (v) => v * scale; // radii scale with the emblem
  const P = (v) => C + (v - C) * scale; // positions scale around the centre
  const layers = [];
  const small = detail === 'small';

  // Halo behind the core.
  const haloR = S(small ? 150 : 132);
  layers.push((x, y) => {
    const d = Math.hypot(x - C, y - C);
    if (d >= haloR) return null;
    const a = 0.55 * (1 - d / haloR) ** 1.6;
    return [...CYAN, a];
  });

  if (!small) {
    // Outer tick ring.
    const r0 = S(212);
    layers.push((x, y) => {
      const d = Math.hypot(x - C, y - C);
      if (d > r0 || d < r0 - S(26)) return null;
      const a = angleOf(x, y);
      const step = 10; // 36 ticks
      const i = Math.round(a / step);
      const off = Math.abs(a - i * step) * (Math.PI / 180) * d; // arc distance to the tick line
      const long = i % 3 === 0;
      const len = S(long ? 24 : 13);
      const w = S(long ? 7 : 5) / 2;
      if (off > w || d < r0 - len) return null;
      return long ? [...CYAN_LIGHT, 0.95] : [...CYAN, 0.6];
    });
    // Thin outer ring.
    layers.push((x, y) => (Math.abs(Math.hypot(x - C, y - C) - S(194)) <= S(1.75) ? [...CYAN, 0.38] : null));
  }

  // Main segmented ring: four arcs with gaps.
  const ringR = S(small ? 186 : 172);
  const ringW = S(small ? 34 : 16) / 2;
  const span = small ? 66 : 64;
  const offset = small ? 12 : 13;
  layers.push((x, y) => {
    const d = Math.hypot(x - C, y - C);
    if (Math.abs(d - ringR) > ringW) return null;
    const a = angleOf(x, y);
    for (let i = 0; i < 4; i++) if (inSpan(a, offset + 90 * i, span)) return [...mix(CYAN_LIGHT, CYAN, clamp01((x + y) / 1024)), 0.96];
    return null;
  });

  // Inner ring.
  const innerR = S(small ? 132 : 136);
  const innerW = S(small ? 12 : 5) / 2;
  layers.push((x, y) => {
    const d = Math.hypot(x - C, y - C);
    if (Math.abs(d - innerR) > innerW) return null;
    if (!small) {
      // dashed
      const a = angleOf(x, y);
      if ((a * innerR * Math.PI) / 180 % S(14) > S(4)) return null;
    }
    return [...CYAN, small ? 0.45 : 0.5];
  });

  // Core orb.
  const coreR = S(small ? 90 : 74);
  const fx = C - coreR * 0.08;
  const fy = C - coreR * 0.16;
  layers.push((x, y) => {
    if (Math.hypot(x - C, y - C) > coreR) return null;
    const t = Math.hypot(x - fx, y - fy) / (coreR * 1.24);
    return [...gradient([[0, WHITE], [0.38, PALE], [0.78, CYAN], [1, CYAN_DEEP]], t), 1];
  });
  if (!small) layers.push((x, y) => (Math.abs(Math.hypot(x - C, y - C) - coreR) <= S(1.5) ? [...RIM, 0.7] : null));

  // The engraved J: a cap, a stem and a round hook.
  const js = small ? 1.5 * scale : 1.12 * scale;
  const k = (v) => C + (v - C) * js;
  const stemX = k(267);
  const top = k(218);
  const bend = k(264);
  const hookR = 21 * js;
  const half = (small ? 26 : 12) * scale * 0.5;
  const hookCx = stemX - hookR;
  layers.push((x, y) => {
    let d = distToSegment(x, y, k(251), top, k(283), top);
    d = Math.min(d, distToSegment(x, y, stemX, top, stemX, bend));
    // Lower half-circle from (stemX, bend) to (stemX - 2r, bend).
    if (y >= bend) d = Math.min(d, Math.abs(Math.hypot(x - hookCx, y - bend) - hookR));
    else d = Math.min(d, Math.hypot(x - (stemX - 2 * hookR), y - bend));
    if (d > half) return null;
    return [...INK, small ? 0.88 : 0.78];
  });

  void P;
  return layers;
}

function over(dst, src) {
  const a = src[3];
  const outA = a + dst[3] * (1 - a);
  if (outA <= 0) return [0, 0, 0, 0];
  return [(src[0] * a + dst[0] * dst[3] * (1 - a)) / outA, (src[1] * a + dst[1] * dst[3] * (1 - a)) / outA, (src[2] * a + dst[2] * dst[3] * (1 - a)) / outA, outA];
}

/** RGBA pixels (Uint8Array) of the icon at `size` px. */
export function renderIcon(size) {
  const detail = size >= 96 ? 'medium' : 'small';
  const scale = detail === 'small' ? 1.08 : 0.93;
  const layers = emblem(detail, scale);
  const ss = size <= 48 ? 5 : 3;
  const radius = size <= 16 ? 96 : 112;
  const inset = size <= 32 ? 0 : 8;
  const px = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((pxi + (sx + 0.5) / ss) * 512) / size;
          const y = ((py + (sy + 0.5) / ss) * 512) / size;
          let c = [0, 0, 0, 0];
          if (roundedRectInside(x, y, inset, inset, 512 - inset, 512 - inset, radius)) {
            const t = Math.hypot(x - C, y - 0.46 * 512) / (0.7 * 512);
            c = [...gradient([[0, BG[0]], [0.55, BG[1]], [1, BG[2]]], t), 1];
            // Hairline edge.
            if (!roundedRectInside(x, y, inset + 4, inset + 4, 512 - inset - 4, 512 - inset - 4, radius - 4)) c = over(c, [...CYAN, 0.22]);
            for (const layer of layers) {
              const l = layer(x, y);
              if (l) c = over(c, l);
            }
          }
          // Accumulate premultiplied.
          acc = [acc[0] + c[0] * c[3], acc[1] + c[1] * c[3], acc[2] + c[2] * c[3], acc[3] + c[3]];
        }
      }
      const n = ss * ss;
      const a = acc[3] / n;
      const i = (py * size + pxi) * 4;
      px[i] = a > 0 ? Math.round(acc[0] / acc[3]) : 0;
      px[i + 1] = a > 0 ? Math.round(acc[1] / acc[3]) : 0;
      px[i + 2] = a > 0 ? Math.round(acc[2] / acc[3]) : 0;
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}

// ---- PNG encoding ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export const ICON_SIZES = Object.freeze([16, 32, 48, 128]);

/** { size: pngBuffer } for every icon size. */
export function makeIcons(sizes = ICON_SIZES) {
  const out = {};
  for (const size of sizes) out[size] = encodePng(renderIcon(size), size, size);
  return out;
}
