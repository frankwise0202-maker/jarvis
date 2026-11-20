// "Scan → schematic" for Optics' Hologram of this (report §2.4.9, the Mark 45 scene): the frozen
// frame's edges, found with a Sobel filter on a small grayscale copy, drawn as thin cyan lines over
// the darkened frame while Jarvis builds the hologram. One pass, about 5 ms for 320 × 180.
//
//   sobelEdges(gray, width, height) -> Float32Array   edge strength 0..1 per pixel (pure)
//   edgeThreshold(edges, keep)      -> number          the strength above which `keep` (0..1) of the pixels lie (pure)
//   drawSchematic(canvas, source, { width, height, color, maxEdge }) -> { width, height, ms }
//                                    source: the frozen canvas or <img>; canvas: the overlay to draw on

/** Sobel gradient magnitude of a grayscale image (0..255 per pixel), scaled to 0..1. Borders are 0. */
export function sobelEdges(gray, width, height) {
  const w = Math.max(0, width | 0);
  const h = Math.max(0, height | 0);
  const out = new Float32Array(w * h);
  if (w < 3 || h < 3 || !gray || gray.length < w * h) return out;
  const max = 4 * 255 * Math.SQRT2; // the strongest possible response (a hard black/white step)
  for (let y = 1; y < h - 1; y++) {
    const r0 = (y - 1) * w;
    const r1 = y * w;
    const r2 = (y + 1) * w;
    for (let x = 1; x < w - 1; x++) {
      const a = gray[r0 + x - 1];
      const b = gray[r0 + x];
      const c = gray[r0 + x + 1];
      const d = gray[r1 + x - 1];
      const f = gray[r1 + x + 1];
      const g = gray[r2 + x - 1];
      const hh = gray[r2 + x];
      const i = gray[r2 + x + 1];
      const gx = c + 2 * f + i - a - 2 * d - g;
      const gy = g + 2 * hh + i - a - 2 * b - c;
      out[r1 + x] = Math.min(1, Math.hypot(gx, gy) / max);
    }
  }
  return out;
}

/** The edge strength above which the strongest `keep` share of pixels lie (a 64-bucket histogram). */
export function edgeThreshold(edges, keep = 0.12) {
  if (!edges || !edges.length) return 1;
  const buckets = new Uint32Array(64);
  for (let i = 0; i < edges.length; i++) buckets[Math.min(63, (edges[i] * 64) | 0)]++;
  let want = Math.max(1, Math.round(edges.length * Math.min(1, Math.max(0, keep))));
  for (let b = 63; b >= 0; b--) {
    want -= buckets[b];
    if (want <= 0) return Math.max(0.04, b / 64);
  }
  return 0.04;
}

/**
 * Draws the schematic of `source` onto `canvas` (sized to a ≤ maxEdge copy of the frame; CSS fits
 * it over the frozen frame). Returns { width, height, ms }, or null when the source can't be read.
 */
export function drawSchematic(canvas, source, { width, height, color = '#5ee7ff', maxEdge = 360 } = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const sw = Math.max(1, Number(width) || source?.width || source?.naturalWidth || 1);
  const sh = Math.max(1, Number(height) || source?.height || source?.naturalHeight || 1);
  const s = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(3, Math.round(sw * s));
  const h = Math.max(3, Math.round(sh * s));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  let px;
  try {
    ctx.drawImage(source, 0, 0, w, h);
    px = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null; // not loaded yet, or a tainted image
  }
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) gray[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
  // A 3 × 3 box blur first: fine texture (wood grain, sensor noise) stays out of the drawing.
  const edges = sobelEdges(boxBlur(gray, w, h), w, h);
  const cut = edgeThreshold(edges, 0.09);
  const [r, g, b] = hexRgb(color);
  // The darkened frame, then the edges on top (stronger edges brighter).
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let j = 0, i = 0; j < edges.length; j++, i += 4) {
    const e = edges[j];
    if (e >= cut) {
      const a = Math.min(1, 0.55 + (e - cut) * 2.2);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = Math.round(255 * a);
    } else {
      // The photo, faint and blue-black underneath, so the outline reads like a drawing.
      const v = gray[j] * 0.16;
      d[i] = Math.round(v * 0.35);
      d[i + 1] = Math.round(v * 0.75);
      d[i + 2] = Math.round(v + 10);
      d[i + 3] = 235;
    }
  }
  ctx.putImageData(img, 0, 0);
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return { width: w, height: h, ms };
}

/** A 3 × 3 box blur of a grayscale image (edges clamped). */
export function boxBlur(gray, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += gray[yy * w + xx];
          n += 1;
        }
      }
      out[y * w + x] = Math.round(sum / n);
    }
  }
  return out;
}

function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  const v = m ? parseInt(m[1], 16) : 0x5ee7ff;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
