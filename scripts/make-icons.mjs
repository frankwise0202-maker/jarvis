#!/usr/bin/env node
// Renders the Jarvis emblem to the app icons (SPEC §9.4):
//   public/icons/icon-192.png, icon-512.png          rounded tile, transparent corners (purpose "any")
//   public/icons/icon-maskable-512.png               full-bleed background, emblem inside the 80% safe zone
//   public/icons/apple-touch-icon.png (180)          opaque, full-bleed (iOS rounds the corners)
//   public/icons/favicon-32.png, favicon.svg         simplified emblem for tab-sized display
//
// The emblem is original: concentric HUD rings with tick marks around a glowing cyan core
// carrying a subtle geometric "J". It is drawn in a 512×512 design space at three levels of
// detail, so small sizes get fewer, bolder strokes instead of blurry hairlines. Each PNG is
// rasterized at its exact pixel size by headless Chromium (Playwright, deviceScaleFactor 1).
//
// Usage: node scripts/make-icons.mjs [--out <dir>]

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'public', 'icons');

const C = 256; // centre of the design space
const BG = '#04070c';
const CYAN = '#3ee0ff';
const CYAN_LIGHT = '#8af3ff';
const CYAN_DEEP = '#1aa8d6';
const INK = '#03121b';

const r1 = (n) => Math.round(n * 100) / 100;

function polar(radius, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r1(C + radius * Math.cos(a)), r1(C + radius * Math.sin(a))];
}

/** SVG arc path along a circle from deg a to deg b (clockwise, degrees from 12 o'clock). */
function arc(radius, a, b) {
  const [x1, y1] = polar(radius, a);
  const [x2, y2] = polar(radius, b);
  const large = (b - a) % 360 > 180 ? 1 : 0;
  return `M${x1} ${y1}A${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

function ticks(radius, count, length, every, longLength, width, longWidth, opacity, longOpacity) {
  let short = '';
  let long = '';
  for (let i = 0; i < count; i++) {
    const deg = (360 / count) * i;
    const isLong = every > 0 && i % every === 0;
    const len = isLong ? longLength : length;
    const [x1, y1] = polar(radius, deg);
    const [x2, y2] = polar(radius - len, deg);
    const seg = `M${x1} ${y1}L${x2} ${y2}`;
    if (isLong) long += seg;
    else short += seg;
  }
  return (
    (short ? `<path d="${short}" stroke="${CYAN}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="butt"/>` : '') +
    (long ? `<path d="${long}" stroke="${CYAN_LIGHT}" stroke-width="${longWidth}" stroke-opacity="${longOpacity}" stroke-linecap="butt"/>` : '')
  );
}

/** Segmented ring: `n` arcs of `span` degrees, starting at `offset`. */
function segments(radius, n, span, offset, width, stroke, opacity) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = offset + (360 / n) * i;
    d += arc(radius, a, a + span);
  }
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="butt"/>`;
}

function markers(radius, size, opacity) {
  // Small inward-pointing chevrons at the four cardinal points.
  let d = '';
  for (const deg of [0, 90, 180, 270]) {
    const [tx, ty] = polar(radius - size, deg);
    const [lx, ly] = polar(radius + size * 0.2, deg - size * 0.32);
    const [rx, ry] = polar(radius + size * 0.2, deg + size * 0.32);
    d += `M${lx} ${ly}L${tx} ${ty}L${rx} ${ry}Z`;
  }
  return `<path d="${d}" fill="${CYAN_LIGHT}" fill-opacity="${opacity}"/>`;
}

/**
 * The stylized J: a slim stem with a round hook and a short cap, engraved into the core in a
 * deep teal ink (subtle at large sizes, bolder at favicon size where it has to carry the mark).
 */
function jMark(scale, width, opacity) {
  const k = (n) => r1(C + (n - C) * scale);
  const stemX = k(267);
  const top = k(218);
  const bend = k(264);
  const hookR = r1(21 * scale);
  return (
    `<path d="M${k(251)} ${top}H${k(283)}M${stemX} ${top}V${bend}A${hookR} ${hookR} 0 0 1 ${r1(stemX - 2 * hookR)} ${bend}" ` +
    `fill="none" stroke="${INK}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

function defs(id) {
  return `<defs>
  <radialGradient id="${id}bg" cx="50%" cy="46%" r="70%">
    <stop offset="0" stop-color="#0d2233"/>
    <stop offset="0.55" stop-color="#071019"/>
    <stop offset="1" stop-color="${BG}"/>
  </radialGradient>
  <radialGradient id="${id}halo" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="${CYAN}" stop-opacity="0.55"/>
    <stop offset="0.45" stop-color="${CYAN}" stop-opacity="0.22"/>
    <stop offset="1" stop-color="${CYAN}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="${id}core" cx="46%" cy="42%" r="62%">
    <stop offset="0" stop-color="#f4ffff"/>
    <stop offset="0.38" stop-color="#bff8ff"/>
    <stop offset="0.78" stop-color="${CYAN}"/>
    <stop offset="1" stop-color="${CYAN_DEEP}"/>
  </radialGradient>
  <linearGradient id="${id}ring" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${CYAN_LIGHT}"/>
    <stop offset="1" stop-color="${CYAN}"/>
  </linearGradient>
  <linearGradient id="${id}sweep" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${CYAN}" stop-opacity="0"/>
    <stop offset="1" stop-color="${CYAN}" stop-opacity="0.16"/>
  </linearGradient>
  <filter id="${id}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
</defs>`;
}

/**
 * Emblem markup in design space, scaled by `scale` around the centre.
 * detail: 'full' (512 px), 'medium' (~180-192 px), 'small' (favicons).
 */
function emblem(id, detail, scale) {
  const g = [];
  if (detail === 'small') {
    g.push(`<circle cx="${C}" cy="${C}" r="150" fill="url(#${id}halo)"/>`);
    g.push(segments(186, 4, 66, 12, 34, `url(#${id}ring)`, 1));
    g.push(`<circle cx="${C}" cy="${C}" r="132" fill="none" stroke="${CYAN}" stroke-width="12" stroke-opacity="0.45"/>`);
    g.push(`<circle cx="${C}" cy="${C}" r="90" fill="url(#${id}core)"/>`);
    g.push(jMark(1.5, 26, 0.88));
  } else {
    const m = detail === 'medium';
    // Faint radar sweep behind everything (a wedge fading in towards 2 o'clock).
    const [sx, sy] = polar(196, 58);
    const [ex, ey] = polar(196, 0);
    g.push(`<path d="M${C} ${C}L${ex} ${ey}A196 196 0 0 1 ${sx} ${sy}Z" fill="url(#${id}sweep)"/>`);
    g.push(`<circle cx="${C}" cy="${C}" r="128" fill="url(#${id}halo)"/>`);
    g.push(`<circle cx="${C}" cy="${C}" r="80" fill="${CYAN}" fill-opacity="0.5" filter="url(#${id}blur)"/>`);
    // Outer instrument ring with tick marks.
    g.push(m ? ticks(212, 36, 13, 3, 24, 5, 7, 0.55, 0.95) : ticks(212, 72, 10, 6, 22, 3, 5, 0.5, 0.95));
    g.push(`<circle cx="${C}" cy="${C}" r="${m ? 194 : 196}" fill="none" stroke="${CYAN}" stroke-width="${m ? 3.5 : 2}" stroke-opacity="0.38"/>`);
    // Main segmented ring with chevrons in its gaps.
    g.push(segments(172, 4, 64, 13, m ? 16 : 13, `url(#${id}ring)`, 0.96));
    g.push(markers(m ? 151 : 153, m ? 16 : 13, 0.9));
    // Inner dashed ring and counter-rotating arcs.
    g.push(`<circle cx="${C}" cy="${C}" r="136" fill="none" stroke="${CYAN}" stroke-width="${m ? 5 : 4}" stroke-opacity="0.42" stroke-dasharray="${m ? '3 11' : '2 8'}"/>`);
    g.push(segments(114, 2, 118, 300, m ? 7 : 5, CYAN_LIGHT, 0.7));
    // Core: a thin bright ring, the glowing orb, a rim and the engraved J.
    g.push(`<circle cx="${C}" cy="${C}" r="90" fill="none" stroke="${CYAN_LIGHT}" stroke-width="${m ? 3 : 2}" stroke-opacity="0.5"/>`);
    g.push(`<circle cx="${C}" cy="${C}" r="74" fill="url(#${id}core)"/>`);
    g.push(`<circle cx="${C}" cy="${C}" r="74" fill="none" stroke="#e8feff" stroke-width="${m ? 3 : 2}" stroke-opacity="0.7"/>`);
    g.push(jMark(1.12, m ? 12 : 9.5, m ? 0.78 : 0.72));
  }
  const t = scale === 1 ? '' : ` transform="translate(${r1(C - C * scale)} ${r1(C - C * scale)}) scale(${scale})"`;
  return `<g${t}>${g.join('')}</g>`;
}

/**
 * A complete icon SVG.
 * shape: 'tile' (rounded square, transparent corners) | 'full' (full-bleed square)
 */
export function iconSvg({ size = 512, detail = 'full', shape = 'tile', scale = 1, id = 'j' } = {}) {
  const bg =
    shape === 'full'
      ? `<rect width="512" height="512" fill="url(#${id}bg)"/>`
      : `<rect x="8" y="8" width="496" height="496" rx="112" fill="url(#${id}bg)"/>` +
        `<rect x="9.5" y="9.5" width="493" height="493" rx="110.5" fill="none" stroke="${CYAN}" stroke-opacity="0.22" stroke-width="3"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">` +
    defs(id) +
    bg +
    emblem(id, detail, scale) +
    `</svg>`
  );
}

export const ICONS = [
  { file: 'icon-512.png', size: 512, detail: 'full', shape: 'tile', scale: 0.93 },
  { file: 'icon-192.png', size: 192, detail: 'medium', shape: 'tile', scale: 0.93 },
  // Maskable: the outermost ring (r ≈ 218 incl. ticks) × 0.8 ≈ 174 px < 204.8 px safe radius.
  { file: 'icon-maskable-512.png', size: 512, detail: 'full', shape: 'full', scale: 0.8 },
  { file: 'apple-touch-icon.png', size: 180, detail: 'medium', shape: 'full', scale: 0.86 },
  { file: 'favicon-32.png', size: 32, detail: 'small', shape: 'tile', scale: 1.08 },
];

async function loadChromium() {
  try {
    const mod = await import('playwright');
    return (mod.chromium ? mod : mod.default).chromium;
  } catch {
    return createRequire(import.meta.url)('playwright').chromium;
  }
}

// ---- lossless PNG optimization ----------------------------------------------------------
// Chromium encodes screenshots for speed. The glows are smooth gradients, which compress far
// better with a per-row filter choice and maximum deflate effort (roughly half the bytes).
// Pixels are unchanged; only 8-bit RGB/RGBA non-interlaced PNGs (what Chromium writes) are touched.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function predict(type, a, b, c) {
  return type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : type === 4 ? paeth(a, b, c) : 0;
}

export async function optimizePng(buf) {
  const zlib = await import('node:zlib');
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return buf;
  const chunks = [];
  for (let pos = 8; pos + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(pos);
    chunks.push({ type: buf.toString('latin1', pos + 4, pos + 8), data: buf.subarray(pos + 8, pos + 8 + len) });
    pos += 12 + len;
  }
  const ihdr = chunks[0] && chunks[0].type === 'IHDR' ? chunks[0].data : null;
  if (!ihdr || ihdr[8] !== 8 || ihdr[12] !== 0 || (ihdr[9] !== 6 && ihdr[9] !== 2)) return buf;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bpp = ihdr[9] === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  if (raw.length !== (stride + 1) * height) return buf;
  // Unfilter.
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y ? px[row - stride + x] : 0;
      const c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      px[row + x] = (raw[src + x] + predict(type, a, b, c)) & 255;
    }
  }
  // Refilter: per row, the filter with the smallest sum of absolute residuals.
  const out = Buffer.alloc((stride + 1) * height);
  const trial = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    let bestType = 0;
    let bestScore = Infinity;
    for (let type = 0; type < 5; type++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? px[row + x - bpp] : 0;
        const b = y ? px[row - stride + x] : 0;
        const c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
        const v = (px[row + x] - predict(type, a, b, c)) & 255;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
    out[y * (stride + 1)] = bestType;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y ? px[row - stride + x] : 0;
      const c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      trial[x] = (px[row + x] - predict(bestType, a, b, c)) & 255;
    }
    trial.copy(out, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(out, { level: 9, memLevel: 9 });
  const parts = [PNG_SIGNATURE];
  let wroteData = false;
  for (const c of chunks) {
    if (c.type === 'IDAT') {
      if (!wroteData) parts.push(pngChunk('IDAT', idat));
      wroteData = true;
    } else if (!['tEXt', 'zTXt', 'iTXt', 'tIME'].includes(c.type)) parts.push(pngChunk(c.type, c.data));
  }
  const result = Buffer.concat(parts);
  return result.length < buf.length ? result : buf;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const icon of ICONS) {
      const svg = iconSvg(icon);
      await page.setViewportSize({ width: icon.size, height: icon.size });
      await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`);
      const png = await page.screenshot({ omitBackground: icon.shape !== 'full', clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
      const small = await optimizePng(png);
      await fs.writeFile(path.join(OUT, icon.file), small);
      console.log(`wrote ${path.relative(ROOT, path.join(OUT, icon.file))} (${icon.size}×${icon.size}, ${Math.round(small.length / 1024)} KB)`);
    }
  } finally {
    await browser.close();
  }
  const favicon = iconSvg({ size: 32, detail: 'small', shape: 'tile', scale: 1.08 }).replace(' width="32" height="32"', '');
  await fs.writeFile(path.join(OUT, 'favicon.svg'), favicon + '\n');
  console.log(`wrote ${path.relative(ROOT, path.join(OUT, 'favicon.svg'))}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
