// Photo and PDF attachments ("Show Jarvis", SPEC §15.1).
//
//   processFile(file, { source })            -> Promise<Attachment>  (rejects with AttachmentError)
//   createAttachmentStrip(list, { size })    -> HTMLElement          (thumbnails + PDF chips for a message)
//   openAttachmentPreview(meta, { returnFocus })                     (the image preview lightbox)
//
// Attachment = { id, kind: 'image'|'pdf', name, mediaType, size, data /* base64, no prefix */,
//                thumb /* data:image/jpeg URL ≤ 160 px, images only */, width, height }
// Messages keep only the display metadata (never the base64 data):
//                { id, kind, name, mediaType, size, thumb, width, height }
//
// Photos are decoded (createImageBitmap, falling back to <img>), scaled down so the long edge is at
// most 1568 px, and re-encoded as JPEG through a canvas — which also drops EXIF metadata such as
// the location. A PNG is kept only when it has transparency and stays small. PDFs are sent as they
// are (base64), up to 20 MB. Everything happens on the device; no network requests.
// Pure helpers at the top have no DOM access, so they can be unit tested in Node.

import { h } from './dom.js';
import { icon } from './icons.js';

export const ATTACHMENT_LIMITS = Object.freeze({
  maxFiles: 5, // per message
  imageMaxEdge: 1568, // long edge sent to Claude (current models accept up to 2576 px at ~3x the image tokens)
  imageQuality: 0.85, // JPEG quality of the processed image
  imageRetryQuality: 0.7, // used once if the first encode is still too large
  imageMaxBase64: Math.round(3.7 * 1024 * 1024), // processed image, in base64 characters
  imageMaxInputBytes: 40 * 1024 * 1024, // original photo file
  keepPngMaxBase64: 1024 * 1024, // a transparent PNG stays PNG up to this size
  pdfMaxBytes: 20 * 1024 * 1024,
  messageMaxBase64: 30 * 1024 * 1024, // all attachments of one message (the API takes 32 MB per request)
  thumbMaxEdge: 160,
  thumbQuality: 0.72,
});

const IMAGE_EXT = /\.(jpe?g|jfif|pjpeg|png|gif|webp|avif|bmp|svg|heic|heif|tiff?)$/i;
const HEIC_EXT = /\.(heic|heif)$/i;
const HEIC_TYPE = /^image\/(heic|heif)(-sequence)?$/i;
const PDF_EXT = /\.pdf$/i;
const SAFE_THUMB = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
const MAX_THUMB_CHARS = 200 * 1024;

export class AttachmentError extends Error {
  /** code: 'unsupported' | 'too-large' | 'heic' | 'decode' | 'read' | 'empty' | 'limit' */
  constructor(code, message) {
    super(message);
    this.name = 'AttachmentError';
    this.code = code;
  }
}

/** 'image' | 'pdf' | null, from the MIME type, falling back to the file name (some pickers send no type). */
export function classifyFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '');
  if (type === 'application/pdf' || (!type && PDF_EXT.test(name)) || (type === 'application/octet-stream' && PDF_EXT.test(name))) return 'pdf';
  if (type.startsWith('image/')) return 'image';
  if ((!type || type === 'application/octet-stream') && IMAGE_EXT.test(name)) return 'image';
  return null;
}

export function isHeic(file) {
  return HEIC_TYPE.test(String(file?.type || '')) || HEIC_EXT.test(String(file?.name || ''));
}

/** "812 B", "48 KB", "2.4 MB" */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1000) return `${Math.round(n)} B`;
  if (n < 1000 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Scale (width, height) down so the long edge is at most `maxEdge`; never up. Integers ≥ 1. */
export function fitWithin(width, height, maxEdge) {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const hh = Math.max(1, Math.round(Number(height) || 1));
  const scale = Math.min(1, maxEdge / Math.max(w, hh));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(hh * scale)) };
}

/** Decoded byte length of a base64 string. */
export function base64ByteLength(b64) {
  const s = String(b64 || '');
  if (!s) return 0;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad);
}

/**
 * A friendly display name. Camera shots and pasted images arrive with generic names such as
 * "image.jpg"; those become "Photo" / "Pasted image".
 */
export function displayName(name, { source, kind } = {}) {
  const raw = String(name || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const generic = !raw || /^(image|photo|blob|file|untitled)(\s*\(\d+\))?(\.[a-z0-9]{1,5})?$/i.test(raw);
  if (!generic) return raw.length > 120 ? `${raw.slice(0, 119)}…` : raw;
  if (kind === 'pdf') return raw || 'Document.pdf';
  if (source === 'camera') return 'Photo';
  if (source === 'paste') return 'Pasted image';
  return raw || 'Image';
}

/** The display metadata of an attachment (what a message stores: never the base64 data). */
export function attachmentMeta(a) {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    mediaType: a.mediaType,
    size: a.size,
    thumb: a.thumb || null,
    width: a.width ?? null,
    height: a.height ?? null,
  };
}

/** "a photo", "2 photos and a PDF" (for labels and announcements). */
export function describeAttachments(list) {
  const items = Array.isArray(list) ? list : [];
  const images = items.filter((a) => a && a.kind === 'image').length;
  const pdfs = items.filter((a) => a && a.kind === 'pdf').length;
  const parts = [];
  if (images) parts.push(images === 1 ? 'a photo' : `${images} photos`);
  if (pdfs) parts.push(pdfs === 1 ? 'a PDF' : `${pdfs} PDFs`);
  return parts.join(' and ') || 'no files';
}

/** Only well-formed image data URLs may be used as <img src> (stored conversations can be imported). */
export function safeThumb(thumb) {
  return typeof thumb === 'string' && thumb.length <= MAX_THUMB_CHARS && SAFE_THUMB.test(thumb) ? thumb : null;
}

function newId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    /* insecure context */
  }
  return `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const quoted = (name) => `“${name}”`;

// ---------------------------------------------------------------------------------------------
// Processing (browser only)

/**
 * Read one picked, pasted or dropped file into an Attachment.
 * @param {File} file
 * @param {{ source?: 'picker'|'camera'|'paste'|'drop' }} [opts]
 */
export async function processFile(file, { source = 'picker' } = {}) {
  if (!file || typeof file.size !== 'number') throw new AttachmentError('read', 'That file could not be read.');
  const kind = classifyFile(file);
  const name = displayName(file.name, { source, kind });
  if (!kind) {
    throw new AttachmentError('unsupported', `${quoted(name)} isn’t a photo or a PDF. Jarvis can look at images (JPEG, PNG, WebP, GIF, HEIC) and PDF documents.`);
  }
  if (!file.size) throw new AttachmentError('empty', `${quoted(name)} is empty.`);
  return kind === 'pdf' ? processPdf(file, name) : processImage(file, name);
}

async function processPdf(file, name) {
  const limit = ATTACHMENT_LIMITS.pdfMaxBytes;
  if (file.size > limit) {
    throw new AttachmentError('too-large', `${quoted(name)} is ${formatBytes(file.size)}. PDFs can be up to ${formatBytes(limit)}.`);
  }
  let head;
  try {
    head = new Uint8Array(await readArrayBuffer(file.slice(0, 1024)));
  } catch {
    throw new AttachmentError('read', `${quoted(name)} could not be read.`);
  }
  if (!startsWithPdfMagic(head)) throw new AttachmentError('unsupported', `${quoted(name)} doesn’t look like a valid PDF.`);
  let data;
  try {
    data = await readBase64(file);
  } catch {
    throw new AttachmentError('read', `${quoted(name)} could not be read.`);
  }
  return { id: newId(), kind: 'pdf', name, mediaType: 'application/pdf', size: file.size, data, thumb: null, width: null, height: null };
}

function startsWithPdfMagic(bytes) {
  // "%PDF-" may follow a few bytes of junk (PDF readers allow it within the first 1 KB).
  for (let i = 0; i + 4 < bytes.length; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) return true;
  }
  return false;
}

async function processImage(file, name) {
  const L = ATTACHMENT_LIMITS;
  if (file.size > L.imageMaxInputBytes) {
    throw new AttachmentError('too-large', `${quoted(name)} is ${formatBytes(file.size)}. Photos can be up to ${formatBytes(L.imageMaxInputBytes)}.`);
  }
  let decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    if (isHeic(file)) {
      throw new AttachmentError('heic', `${quoted(name)} is a HEIC photo this browser can’t open. Share it as a JPEG, or set iPhone Settings → Camera → Formats to “Most Compatible”.`);
    }
    throw new AttachmentError('decode', `${quoted(name)} couldn’t be opened as an image.`);
  }
  try {
    const target = fitWithin(decoded.width, decoded.height, L.imageMaxEdge);
    const canvas = drawScaled(decoded, target.width, target.height);
    const mayHaveAlpha = !/^image\/(jpe?g|pjpeg)$/i.test(file.type || '') && !/\.(jpe?g|jfif)$/i.test(file.name || '');
    const alpha = mayHaveAlpha ? scanAlpha(canvas) : null;

    let mediaType = 'image/jpeg';
    let data = null;
    if (alpha && alpha.transparent) {
      const png = await encode(canvas, 'image/png');
      if (png.type === 'image/png' && png.data.length <= L.keepPngMaxBase64) {
        mediaType = 'image/png';
        data = png.data;
      }
    }
    const matte = alpha && alpha.transparent ? (alpha.light ? '#1c2026' : '#ffffff') : null;
    if (!data) {
      const flat = matte ? flatten(canvas, matte) : canvas;
      let jpeg = await encode(flat, 'image/jpeg', L.imageQuality);
      if (jpeg.data.length > L.imageMaxBase64) jpeg = await encode(flat, 'image/jpeg', L.imageRetryQuality);
      if (jpeg.type !== 'image/jpeg' && jpeg.type !== 'image/png') throw new Error('unexpected encoder output');
      mediaType = jpeg.type;
      data = jpeg.data;
      if (flat !== canvas) release(flat);
    }
    if (data.length > L.imageMaxBase64) {
      throw new AttachmentError('too-large', `${quoted(name)} is still too large after resizing (${formatBytes(base64ByteLength(data))}). Try a smaller image.`);
    }
    const thumb = makeThumb(canvas, matte || '#0b1622');
    release(canvas);
    return { id: newId(), kind: 'image', name, mediaType, size: base64ByteLength(data), data, thumb, width: target.width, height: target.height };
  } catch (err) {
    if (err instanceof AttachmentError) throw err;
    throw new AttachmentError('decode', `${quoted(name)} couldn’t be processed as an image.`);
  } finally {
    decoded.release();
  }
}

/** createImageBitmap honours EXIF orientation with imageOrientation 'from-image'; <img> does by default. */
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (bitmap.width && bitmap.height) return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
      bitmap.close?.();
    } catch {
      /* unsupported option or format: try <img> */
    }
  }
  const url = URL.createObjectURL(file); // the CSP allows blob: images
  const img = new Image();
  img.decoding = 'async';
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('image failed to load'));
      img.src = url;
    });
    if (typeof img.decode === 'function') await img.decode().catch(() => {});
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw new Error('image has no size');
    return { source: img, width, height, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/** Frees a canvas's backing store right away (iOS caps the total canvas memory). */
function release(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Draws `src` at width × height. Large reductions go in halving steps, which keeps fine detail
 * and text crisp where a single high-quality step would alias (notably in Safari).
 */
function drawScaled(decoded, width, height) {
  let src = decoded.source;
  let sw = decoded.width;
  let sh = decoded.height;
  let temp = null;
  while (sw / 2 >= width * 1.25 && (sw / 2) * (sh / 2) <= 16e6) {
    const next = newCanvas(Math.round(sw / 2), Math.round(sh / 2));
    context2d(next).drawImage(src, 0, 0, next.width, next.height);
    if (temp) release(temp);
    temp = next;
    src = next;
    sw = next.width;
    sh = next.height;
  }
  const canvas = newCanvas(width, height);
  context2d(canvas).drawImage(src, 0, 0, width, height);
  if (temp) release(temp);
  return canvas;
}

/** Whether any pixel is transparent, and whether the visible content is mostly light (for the matte). */
function scanAlpha(canvas) {
  const { data } = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
  let transparent = false;
  let lum = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 255) transparent = true;
    if (a > 0 && (i & 63) === 0) {
      // Sample every 16th pixel for the brightness estimate.
      const w = a / 255;
      lum += w * (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      weight += w;
    }
  }
  return { transparent, light: weight > 0 && lum / weight / 255 > 0.72 };
}

/** The canvas composited onto a solid colour (JPEG has no alpha: transparent pixels would turn black). */
function flatten(canvas, color) {
  const out = newCanvas(canvas.width, canvas.height);
  const ctx = context2d(out);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/** Encodes a canvas; resolves { type, data } with data as base64 without the data: prefix. */
function encode(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    const done = (blob) => {
      if (!blob) return reject(new Error('encode failed'));
      readBase64(blob).then((data) => resolve({ type: blob.type || type, data }), reject);
    };
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(done, type, quality);
    } else {
      try {
        const url = canvas.toDataURL(type, quality);
        const comma = url.indexOf(',');
        resolve({ type: url.slice(5, url.indexOf(';')) || type, data: url.slice(comma + 1) });
      } catch (err) {
        reject(err);
      }
    }
  });
}

function makeThumb(canvas, background) {
  const L = ATTACHMENT_LIMITS;
  const size = fitWithin(canvas.width, canvas.height, L.thumbMaxEdge);
  let src = canvas;
  let temp = null;
  while (src.width / 2 >= size.width * 1.25) {
    const next = newCanvas(Math.round(src.width / 2), Math.round(src.height / 2));
    context2d(next).drawImage(src, 0, 0, next.width, next.height);
    if (temp) release(temp);
    temp = next;
    src = next;
  }
  const out = newCanvas(size.width, size.height);
  const ctx = context2d(out);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(src, 0, 0, size.width, size.height);
  if (temp) release(temp);
  let url = '';
  try {
    url = out.toDataURL('image/jpeg', L.thumbQuality);
  } catch {
    url = '';
  }
  release(out);
  return safeThumb(url);
}

function readArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Base64 of a Blob (no data: prefix, no line breaks). */
function readBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      const comma = url.indexOf(',');
      if (comma < 0) return reject(new Error('read failed'));
      resolve(url.slice(comma + 1).replace(/\s+/g, ''));
    };
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------------------------
// Message strip and preview

/**
 * Thumbnails and PDF chips for a message (each item carries data-testid="attachment-thumb").
 * Tapping a photo opens a preview of its stored thumbnail.
 * @param {Array} attachments  Attachment metadata (base64 is never needed here)
 * @param {{ size?: 'sm'|'md' }} [opts]
 */
export function createAttachmentStrip(attachments, { size = 'md' } = {}) {
  const items = (Array.isArray(attachments) ? attachments : []).filter((a) => a && typeof a === 'object');
  const images = items.filter((a) => a.kind !== 'pdf');
  const single = size === 'md' && items.length === 1 && images.length === 1;
  const el = h('div', {
    class: ['att-strip', `att-strip--${size === 'sm' ? 'sm' : 'md'}`, single && 'att-strip--single'],
    attrs: { role: 'list', 'aria-label': `Attached: ${describeAttachments(items)}` },
  });
  for (const a of items) {
    const item = h('div', { class: 'att-item', attrs: { role: 'listitem' } });
    item.append(a.kind === 'pdf' ? pdfChip(a) : imageThumb(a, single));
    el.append(item);
  }
  return el;
}

function imageThumb(a, single) {
  const name = String(a.name || 'Image');
  const src = safeThumb(a.thumb);
  const ratio = Number(a.width) > 0 && Number(a.height) > 0 ? Number(a.width) / Number(a.height) : 1;
  const btn = h(
    'button',
    {
      class: ['att-thumb', !src && 'att-thumb--empty'],
      type: 'button',
      attrs: { 'data-testid': 'attachment-thumb', 'data-kind': 'image', 'aria-label': `Preview ${name}`, title: name },
      style: single ? { '--att-ratio': String(Math.min(2.4, Math.max(0.42, ratio))) } : undefined,
    },
    src ? h('img', { src, alt: '', attrs: { decoding: 'async', draggable: 'false' } }) : icon('image', { size: 22 }),
  );
  btn.addEventListener('click', () => openAttachmentPreview(a, { returnFocus: btn }));
  return btn;
}

function pdfChip(a) {
  const name = String(a.name || 'Document.pdf');
  const size = formatBytes(a.size);
  return h(
    'div',
    {
      class: 'att-file',
      attrs: { 'data-testid': 'attachment-thumb', 'data-kind': 'pdf', title: name, 'aria-label': `PDF: ${name}${size ? `, ${size}` : ''}` },
    },
    h('span', { class: 'att-file-icon', attrs: { 'aria-hidden': 'true' } }, icon('file', { size: 18 }), h('span', { class: 'att-file-badge', text: 'PDF' })),
    h('span', { class: 'att-file-text', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'att-file-name', text: name }), h('span', { class: 'att-file-size', text: size || 'PDF' })),
  );
}

let openPreview = null;

/**
 * Opens an accessible preview of a photo's stored thumbnail (Jarvis keeps only a small preview of
 * each photo; the full image went to Claude with the message). Escape, the close button and a
 * tap outside the image close it; focus returns to `returnFocus`.
 */
export function openAttachmentPreview(meta, { returnFocus } = {}) {
  if (openPreview) openPreview.close();
  const src = safeThumb(meta?.thumb);
  const name = String(meta?.name || 'Image');
  const details = [
    'Preview',
    Number(meta?.width) > 0 && Number(meta?.height) > 0 ? `${meta.width} × ${meta.height} sent` : '',
    formatBytes(meta?.size),
  ].filter(Boolean).join(' · ');

  const titleId = `att-preview-${newId()}`;
  const closeBtn = h(
    'button',
    { class: 'att-preview-close', type: 'button', attrs: { 'aria-label': 'Close preview', 'data-testid': 'attachment-preview-close' } },
    icon('close', { size: 20 }),
  );
  const figure = h(
    'figure',
    { class: 'att-preview-figure' },
    src
      ? h('img', { class: 'att-preview-img', src, alt: `Preview of ${name}`, attrs: { draggable: 'false' } })
      : h('div', { class: 'att-preview-missing' }, icon('image', { size: 32 }), h('span', { text: 'No preview available' })),
    h(
      'figcaption',
      { class: 'att-preview-caption' },
      h('span', { class: 'att-preview-name', id: titleId, text: name }),
      h('span', { class: 'att-preview-meta', text: details }),
      h('span', { class: 'att-preview-note', text: 'Jarvis keeps a small preview on this device; the full image was sent with your message.' }),
    ),
    closeBtn,
  );
  const dialog = h(
    'dialog',
    { class: 'att-preview', attrs: { 'aria-labelledby': titleId, 'data-testid': 'attachment-preview' } },
    h('div', { class: 'att-preview-panel' }, figure),
  );

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openPreview = null;
    try {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
    } catch {
      /* already closed */
    }
    dialog.remove();
    document.removeEventListener('keydown', onKey, true);
    if (returnFocus && returnFocus.isConnected) {
      try {
        returnFocus.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // the close button is the only focusable control
      closeBtn.focus();
    }
  };
  closeBtn.addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.classList?.contains('att-preview-panel')) close();
  });
  document.addEventListener('keydown', onKey, true);

  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') {
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute('open', '');
      dialog.classList.add('att-preview--fallback');
    }
  } else {
    dialog.setAttribute('open', '');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.classList.add('att-preview--fallback');
  }
  closeBtn.focus({ preventScroll: true });
  openPreview = { close };
  return { close };
}
