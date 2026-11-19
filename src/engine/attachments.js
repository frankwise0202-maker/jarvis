// Attachments in the engine (SPEC §15.1). The composer hands startTurn Attachment objects
//   { id, kind: 'image'|'pdf', name, mediaType, size, data /* base64, no prefix */, thumb, width, height }
// and this module
// - validates them strictly before anything is appended: conversation.apiMessages is append-only,
//   so a file the API rejects would otherwise be re-sent, and rejected, with every later request;
// - checks the image bytes against the declared type (a PNG labelled JPEG is relabelled, not sent wrong);
// - builds the content blocks of the new user message (base64 image / PDF document blocks);
// - builds the display metadata stored on the UserTurn (never the base64 data);
// - guards the whole request against the API's size and image-count limits.
// No DOM access here.

import { isPlainObject, singleLine, truncate, uid } from './util.js';

/** The user text block sent when a message has attachments but no text (SPEC §15.1). */
export const ATTACHMENT_ONLY_TEXT = 'Please look at the attached file(s).';
export const IMAGE_MEDIA_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
export const PDF_MEDIA_TYPE = 'application/pdf';

export const ENGINE_ATTACHMENT_LIMITS = Object.freeze({
  imageMaxBase64: 5 * 1024 * 1024, // the API's per-image limit
  requestMaxBytes: 30 * 1024 * 1024, // the API takes 32 MB per request; leave room for the turn's own replies
  imagesPerRequest: 100, // the API's per-request image limit (history included)
  nameMax: 120,
  titleMax: 200,
  thumbMax: 200 * 1024,
});

/** A problem with an attachment, worded for the owner (startTurn throws it before anything is sent). */
export class AttachmentInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AttachmentInputError';
  }
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const SAFE_THUMB = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
const quoted = (name) => `“${name}”`;

/** Decoded bytes of the start of a base64 string (enough for file signatures). */
function headBytes(data, byteCount) {
  const chars = Math.ceil(byteCount / 3) * 4;
  try {
    const bin = atob(data.slice(0, Math.min(data.length, chars)));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

/** The image type from its signature: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null. */
export function sniffImageType(data) {
  const b = headBytes(String(data || ''), 12);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** Whether base64 data starts like a PDF ("%PDF-" within the first kilobyte, as readers allow). */
export function looksLikePdf(data) {
  const b = headBytes(String(data || ''), 1024);
  for (let i = 0; i + 4 < b.length; i++) {
    if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46 && b[i + 4] === 0x2d) return true;
  }
  return false;
}

export function base64ByteLength(data) {
  const s = String(data || '');
  if (!s) return 0;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad);
}

/** Raw base64: a data: URL prefix and whitespace are tolerated and removed. '' when not base64. */
function cleanBase64(value) {
  if (typeof value !== 'string') return '';
  let s = value.trim();
  const comma = s.startsWith('data:') ? s.indexOf(',') : -1;
  if (comma >= 0) s = s.slice(comma + 1);
  s = s.replace(/\s+/g, '');
  return s && s.length % 4 === 0 && BASE64.test(s) ? s : '';
}

function positiveInt(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : null;
}

/**
 * Validates and normalizes the attachments passed to startTurn. Returns [] for undefined/null.
 * Throws AttachmentInputError (friendly message) for files Claude would reject, TypeError for misuse.
 */
export function normalizeAttachments(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new TypeError('startTurn: attachments must be an array');
  const L = ENGINE_ATTACHMENT_LIMITS;
  return list.map((a, i) => {
    if (!isPlainObject(a)) throw new TypeError(`startTurn: attachments[${i}] must be an object`);
    const declared = String(a.mediaType ?? '').trim().toLowerCase();
    const isPdf = a.kind === 'pdf' || declared === PDF_MEDIA_TYPE;
    const name = truncate(singleLine(a.name), L.nameMax) || (isPdf ? 'Document.pdf' : 'Image');
    const data = cleanBase64(a.data);
    if (!data) throw new AttachmentInputError(`${quoted(name)} has no readable data. Attach it again.`);

    let kind;
    let mediaType;
    if (isPdf) {
      if (!looksLikePdf(data)) throw new AttachmentInputError(`${quoted(name)} isn’t a valid PDF.`);
      kind = 'pdf';
      mediaType = PDF_MEDIA_TYPE;
    } else {
      const sniffed = sniffImageType(data);
      if (!sniffed) throw new AttachmentInputError(`${quoted(name)} can’t be sent: Claude reads JPEG, PNG, GIF and WebP images and PDF documents.`);
      if (data.length > L.imageMaxBase64) throw new AttachmentInputError(`${quoted(name)} is too large for Claude (images can be up to 5 MB). Try a smaller image.`);
      kind = 'image';
      mediaType = sniffed; // the bytes win over a wrong label
    }

    const size = Number.isFinite(Number(a.size)) && Number(a.size) >= 0 ? Math.round(Number(a.size)) : base64ByteLength(data);
    const thumb = kind === 'image' && typeof a.thumb === 'string' && a.thumb.length <= L.thumbMax && SAFE_THUMB.test(a.thumb) ? a.thumb : null;
    const id = typeof a.id === 'string' && /^[\w-]{1,64}$/.test(a.id) ? a.id : uid();
    return {
      id,
      kind,
      name,
      mediaType,
      size,
      data,
      thumb,
      width: kind === 'image' ? positiveInt(a.width) : null,
      height: kind === 'image' ? positiveInt(a.height) : null,
    };
  });
}

/** The API content block for a normalized attachment (shapes verified in the SDK's BetaImageBlockParam / BetaRequestDocumentBlock). */
export function attachmentBlock(a) {
  if (a.kind === 'pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: PDF_MEDIA_TYPE, data: a.data },
      title: truncate(a.name, ENGINE_ATTACHMENT_LIMITS.titleMax),
    };
  }
  return { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } };
}

/** What the UserTurn keeps for display: everything except the base64 data. */
export function attachmentMeta(a) {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    mediaType: a.mediaType,
    size: a.size,
    thumb: a.thumb ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
  };
}

/** A conversation title for a first message that has files but no text. */
export function attachmentsTitle(list) {
  if (!list.length) return '';
  return list.length === 1 ? list[0].name : `${list[0].name} + ${list.length - 1} more`;
}

export function isAttachmentBlock(block) {
  return !!block && (block.type === 'image' || block.type === 'document') && block.source?.type === 'base64';
}

/** Rough byte size of a block as JSON (base64 sources counted by length, without stringifying them). */
function blockBytes(block) {
  if (isAttachmentBlock(block)) return String(block.source.data || '').length + 160 + String(block.title || '').length;
  try {
    return JSON.stringify(block)?.length ?? 0;
  } catch {
    return 0;
  }
}

function messageBytes(message) {
  if (!message) return 0;
  if (typeof message.content === 'string') return message.content.length + 40;
  return (Array.isArray(message.content) ? message.content : []).reduce((sum, b) => sum + blockBytes(b), 40);
}

const countImages = (message) => (Array.isArray(message?.content) ? message.content.filter((b) => b?.type === 'image').length : 0);

/**
 * Throws AttachmentInputError when sending `next` after `history` would exceed what one request may
 * carry (every request re-sends the whole history, attachments included).
 */
export function assertRequestFits(history, next, { system = '', tools = [] } = {}) {
  const L = ENGINE_ATTACHMENT_LIMITS;
  let bytes = String(system || '').length + blockBytes({ tools });
  let images = 0;
  for (const m of [...history, next]) {
    bytes += messageBytes(m);
    images += countImages(m);
  }
  if (images > L.imagesPerRequest) {
    throw new AttachmentInputError(`This conversation would hold ${images} images, and Claude accepts up to ${L.imagesPerRequest} per request. Start a new chat to share more photos.`);
  }
  if (bytes > L.requestMaxBytes) {
    const mb = Math.round(bytes / (1024 * 1024));
    throw new AttachmentInputError(`These files are too large to send with this conversation (about ${mb} MB; one request can carry about 30 MB). Start a new chat, or attach fewer or smaller files.`);
  }
}
