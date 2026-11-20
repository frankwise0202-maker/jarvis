// Screenshot sizing and coordinate scaling for the browser toolset.
//
// The toolset declares no display size: Claude infers the viewport from the screenshots we return
// and answers in those screenshots' pixels ("viewport pixels"). The API rejects (does not shrink)
// a toolset image over the model's limits: 2,576 px on the long edge and 4,784 visual tokens
// (ceil(w/28) x ceil(h/28)) on every model that supports the toolset, and each side at most
// 3,000 px once a request holds more than 20 images. We also cap screenshots well below that to
// keep each one cheap (the docs suggest 1280x800 or 1366x768 for web apps):
//   frame = the CSS viewport scaled down (never up) to a long edge of 1,366 px and 1,800 tokens.
// On a Retina Mac the capture is 2x CSS pixels; the frame is computed in CSS pixels, so Claude's
// coordinates map back with css = frame / scale.

export const API_MAX_LONG_EDGE = 2576;
export const API_MAX_TOKENS = 4784;
export const MANY_IMAGES_MAX_SIDE = 3000;
export const FRAME_MAX_LONG_EDGE = 1366;
export const FRAME_MAX_TOKENS = 1800;
export const THUMB_WIDTH = 240;

/** Visual tokens the API counts for an image of w x h pixels. */
export function visualTokens(w, h) {
  return Math.ceil(w / 28) * Math.ceil(h / 28);
}

/** True when an image of w x h pixels is within the API's toolset image limits. */
export function withinApiLimits(w, h, { manyImages = false } = {}) {
  if (!(w > 0 && h > 0)) return false;
  if (Math.max(w, h) > API_MAX_LONG_EDGE) return false;
  if (visualTokens(w, h) > API_MAX_TOKENS) return false;
  if (manyImages && Math.max(w, h) > MANY_IMAGES_MAX_SIDE) return false;
  return true;
}

/**
 * The screenshot frame for a CSS viewport of cssW x cssH: { w, h, scale } with w = round(cssW *
 * scale). scale <= 1; the frame fits FRAME_MAX_LONG_EDGE and FRAME_MAX_TOKENS (and so the API).
 */
export function frameFor(cssW, cssH, { maxLong = FRAME_MAX_LONG_EDGE, maxTokens = FRAME_MAX_TOKENS } = {}) {
  const W = Math.max(1, Math.round(cssW));
  const H = Math.max(1, Math.round(cssH));
  let scale = Math.min(1, maxLong / Math.max(W, H));
  // Shrink until the token count fits (tokens grow ~ with area, so start from the area ratio).
  const fit = (s) => visualTokens(Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s))) <= maxTokens;
  if (!fit(scale)) {
    scale = Math.min(scale, Math.sqrt((maxTokens * 28 * 28) / (W * H)));
    while (!fit(scale) && scale > 0.05) scale *= 0.98;
  }
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  // sx / sy: the exact per-axis ratios after rounding the frame to whole pixels.
  return { w, h, scale, sx: w / W, sy: h / H };
}

/** Viewport-pixel (frame) coordinates to CSS pixels for CDP input. */
export function toCss(frame, x, y) {
  return { x: x / (frame?.sx || frame?.scale || 1), y: y / (frame?.sy || frame?.scale || 1) };
}

/** CSS pixels to frame (viewport-pixel) coordinates. */
export function toFrame(frame, x, y) {
  return { x: Math.round(x * (frame?.sx || frame?.scale || 1)), y: Math.round(y * (frame?.sy || frame?.scale || 1)) };
}

/**
 * Validates a frame-pixel coordinate. Returns null when it is inside the frame, else the error
 * text for Claude.
 */
export function coordinateError(frame, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'Error: coordinates must be numbers (viewport pixels).';
  if (!frame) return null;
  if (x < 0 || y < 0 || x >= frame.w || y >= frame.h) {
    return `Error: (${x}, ${y}) is outside the viewport. Coordinates are viewport pixels from the top left of the latest screenshot, which is ${frame.w}x${frame.h}.`;
  }
  return null;
}

/**
 * The `zoom` member: region [x0, y0, x1, y1] in frame pixels -> the crop in device pixels of a
 * capture taken at `dpr` device pixels per CSS pixel, and the output size (the crop scaled to fit
 * the frame, aspect ratio kept, within the API limits). Returns { crop, out } or { error }.
 */
export function zoomPlan(frame, region, dpr = 1) {
  if (!Array.isArray(region) || region.length !== 4 || !region.every((n) => Number.isFinite(n))) {
    return { error: 'Error: zoom needs region [x0, y0, x1, y1] in viewport pixels.' };
  }
  let [x0, y0, x1, y1] = region.map(Number);
  if (x1 <= x0 || y1 <= y0) return { error: 'Error: zoom region must have x1 > x0 and y1 > y0.' };
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(frame.w, x1);
  y1 = Math.min(frame.h, y1);
  if (x1 - x0 < 1 || y1 - y0 < 1) return { error: `Error: zoom region is outside the viewport (${frame.w}x${frame.h}).` };
  const k = dpr / (frame.scale || 1); // frame px -> device px
  const crop = { x: Math.floor(x0 * k), y: Math.floor(y0 * k), w: Math.max(1, Math.round((x1 - x0) * k)), h: Math.max(1, Math.round((y1 - y0) * k)) };
  // Fit the crop into the frame size, then make sure the API accepts it.
  let s = Math.min(frame.w / crop.w, frame.h / crop.h);
  let out = { w: Math.max(1, Math.round(crop.w * s)), h: Math.max(1, Math.round(crop.h * s)) };
  while (!withinApiLimits(out.w, out.h, { manyImages: true })) {
    s *= 0.95;
    out = { w: Math.max(1, Math.round(crop.w * s)), h: Math.max(1, Math.round(crop.h * s)) };
  }
  return { crop, out };
}

// ---------------------------------------------------------------------------------------------
// Encoding (OffscreenCanvas; service worker only)

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) s += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  return btoa(s);
}

/** Decodes a base64 PNG/JPEG into an ImageBitmap. */
export async function decodeImage(base64, mediaType = 'image/png') {
  return createImageBitmap(new Blob([base64ToBytes(base64)], { type: mediaType }));
}

/**
 * Draws `bitmap` (optionally a crop of it) at w x h and encodes it. Returns base64 data.
 * crop: { x, y, w, h } in the bitmap's pixels.
 */
export async function encodeImage(bitmap, { w, h, crop = null, type = 'image/jpeg', quality = 0.8 }) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (crop) ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  else ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type, quality });
  return blobToBase64(blob);
}

/** Pixel size of a base64 PNG or JPEG without decoding it (used by tests and checks). */
export function imageSize(base64) {
  const bytes = base64ToBytes(String(base64).slice(0, 65536));
  // PNG: IHDR width/height at bytes 16..23.
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dv = new DataView(bytes.buffer);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  // JPEG: walk the markers to the first SOFn.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}
