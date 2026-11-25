// Sync through the home base (v7.6, SPEC §24.7): the Jarvis Core's api/sync routes, with the §23.2
// rules of requestHomeBase (no credentials, no referrer, never cached, a timeout; failures as
// { ok: false, kind, status, code, message }).
//
//   listSyncDevices(base, opts)               GET api/sync -> { ok: true, devices } | failure
//   downloadSyncBackup(base, deviceId, opts)  GET api/sync/<deviceId> -> { ok: true, data } | failure
//   uploadSyncBackup(base, deviceId, json, { label, gzipped, ...opts })
//                                             PUT api/sync/<deviceId> -> { ok: true, bytes, storedAt, gzip } | failure
//   gzipText(text)   -> Promise<Blob | null>  (CompressionStream; null where the browser has none)
//   sha256Hex(text)  -> Promise<string>       (what tells an unchanged backup apart)
//
// The backup is this device's own export (src/platform/backup.js: never the API key; the Core also
// refuses anything shaped like one). It travels gzip-compressed where the browser can
// (Content-Encoding: gzip) and as plain JSON otherwise; the device's name goes in
// X-Jarvis-Device-Label (percent-encoded: a header carries ASCII only).

import { requestHomeBase } from './homebase.js';
import { syncDevicesView, validDeviceId, SYNC_MAX_BYTES, LABEL_MAX } from '../lib/sync.js';

const LIST_TIMEOUT_MS = 10000;
const TRANSFER_TIMEOUT_MS = 120000; // up to 50 MB over Tailscale (a phone on cellular included)
const MAX_DOWNLOAD_CHARS = SYNC_MAX_BYTES + 1024 * 1024;

/** GET api/sync: the devices with a backup on the home base, newest first. */
export async function listSyncDevices(base, opts = {}) {
  const r = await requestHomeBase(base, 'sync', { timeoutMs: LIST_TIMEOUT_MS, ...opts });
  if (!r.ok) return r;
  const view = syncDevicesView(r.data);
  return view ? { ok: true, devices: view.devices } : { ok: false, kind: 'notcore', status: 200 };
}

/** GET api/sync/<deviceId>: that device's latest backup (the parsed JSON object). */
export async function downloadSyncBackup(base, deviceId, opts = {}) {
  if (!validDeviceId(deviceId)) return { ok: false, kind: 'http', status: 400, code: 'bad_device' };
  const r = await requestHomeBase(base, `sync/${deviceId}`, { timeoutMs: TRANSFER_TIMEOUT_MS, maxChars: MAX_DOWNLOAD_CHARS, ...opts });
  if (!r.ok) return r;
  return { ok: true, data: r.data };
}

/**
 * PUT api/sync/<deviceId>: this device's backup. `gzipped` is the JSON compressed (gzipText), or
 * null to send it as it is.
 */
export async function uploadSyncBackup(base, deviceId, json, { label = '', gzipped = null, ...opts } = {}) {
  if (!validDeviceId(deviceId)) return { ok: false, kind: 'http', status: 400, code: 'bad_device' };
  if (typeof json !== 'string' || !json) return { ok: false, kind: 'http', status: 400, code: 'bad_backup' };
  const headers = { 'Content-Type': 'application/json' };
  const name = typeof label === 'string' ? [...label.trim()].slice(0, LABEL_MAX).join('') : '';
  if (name) headers['X-Jarvis-Device-Label'] = encodeURIComponent(name);
  const gzip = !!gzipped;
  if (gzip) headers['Content-Encoding'] = 'gzip';
  const r = await requestHomeBase(base, `sync/${deviceId}`, { method: 'PUT', rawBody: gzip ? gzipped : json, headers, timeoutMs: TRANSFER_TIMEOUT_MS, ...opts });
  if (!r.ok) return r;
  const storedAt = typeof r.data.storedAt === 'string' ? Date.parse(r.data.storedAt) : NaN;
  return { ok: true, bytes: typeof r.data.bytes === 'number' ? r.data.bytes : null, storedAt: Number.isFinite(storedAt) ? storedAt : null, gzip };
}

/** The text gzip-compressed (a Blob), or null where the browser can't (then it travels as it is). */
export async function gzipText(text) {
  if (typeof globalThis.CompressionStream !== 'function' || typeof Blob !== 'function' || typeof Response !== 'function') return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new globalThis.CompressionStream('gzip'));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}

/** SHA-256 of the text, in hex (a plain FNV-1a hash where WebCrypto is missing: it only tells changes apart). */
export async function sha256Hex(text) {
  const s = typeof text === 'string' ? text : '';
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle && typeof TextEncoder === 'function') {
    try {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      /* fall through */
    }
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv-${s.length}-${h.toString(16)}`;
}
