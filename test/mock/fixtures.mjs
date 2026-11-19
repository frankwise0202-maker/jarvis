// Test files for attachments (SPEC §15.1): real, decodable PNGs, minimal PDFs and the signatures of
// the other image types. Shared by the engine and mock unit tests and the attachments E2E scenario.
// Node only (Buffer, zlib).

import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * A real RGBA PNG: a colour gradient with a lighter disc in the middle, so a resized copy is easy
 * to recognise in screenshots. `alpha: true` makes the corners transparent.
 */
export function makePng(width, height, { alpha = false } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const rows = [];
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.32;
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4); // filter byte 0 + pixels
    for (let x = 0; x < width; x++) {
      const inDisc = (x - cx) ** 2 + (y - cy) ** 2 < r * r;
      const red = inDisc ? 240 : Math.round(20 + (x * 60) / Math.max(1, width - 1));
      const green = inDisc ? 196 : Math.round(90 + (y * 120) / Math.max(1, height - 1));
      const blue = inDisc ? 87 : 200;
      const corner = alpha && (x < width * 0.2 || x > width * 0.8) && (y < height * 0.2 || y > height * 0.8);
      row.set([red, green, blue, corner ? 0 : 255], 1 + x * 4);
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A minimal PDF with `pages` empty pages (valid header, catalog, page tree and trailer). */
export function makePdf(pages = 1) {
  const kids = Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ');
  const pageObjs = Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj`).join('\n');
  return Buffer.from(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pages} >> endobj\n${pageObjs}\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
    'latin1',
  );
}

/** File signatures (enough for type sniffing, not decodable images). */
export const SIGNATURES = Object.freeze({
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]),
  gif: Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'),
  webp: Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x00\x00\x00\x00\x3f\x00\x00\x1f\x00\x00', 'latin1'),
});

/** API content blocks for the buffers above. */
export const imageBlock = (buf, mediaType = 'image/png') => ({ type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } });
export const pdfBlock = (buf, title) => ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') }, ...(title ? { title } : {}) });
