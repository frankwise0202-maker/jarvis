// Sync + backups: each device uploads the app's backup (its exportBackup() JSON, never the API key) and the
// Core keeps the latest per device plus one snapshot per day for the 14 most recent days. Other devices read
// the list and pull a device's latest backup to merge it in the app (the app adds what's missing and never
// deletes). Node built-ins only.
//
//   PUT /api/sync/<deviceId>   body = the backup JSON (Content-Encoding: gzip allowed), header
//                              X-Jarvis-Device-Label -> sync.put(id, req, { label, encoding })
//   GET /api/sync              -> sync.list()
//   GET /api/sync/<deviceId>   -> sync.get(id, { acceptEncoding })
//
// On disk (folders 700, files 600), under ~/.local/share/jarvis-core/sync/:
//
//   <deviceId>/latest.json.gz             the newest backup, gzip-compressed
//   <deviceId>/meta.json                  { id, label, updatedAt, bytes, storedBytes, sha256 }
//   <deviceId>/daily/YYYY-MM-DD.json.gz   the last backup of each local day (a hard link), newest 14 kept
//   <deviceId>/.upload-*.tmp              an upload in progress (removed if it fails; leftovers at start)
//
// An upload is streamed to a temporary file (never held in memory), checked on the way (size, gzip, that it is
// a Jarvis backup, that nothing shaped like an Anthropic API key is in it), fsynced, then renamed over
// latest.json.gz, so a power cut or a dropped connection never leaves half a backup and never touches the
// previous one. The deviceId is checked against /^[a-z0-9-]{8,64}$/ before it is ever used in a path.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const DEVICE_ID_RE = /^[a-z0-9-]{8,64}$/;
export const MAX_BYTES = 50 * 1024 * 1024;
export const KEEP_DAYS = 14;
const MAX_UPLOADS = 3; // at once, all devices together
const IDLE_MS = 60_000; // an upload that sends nothing for a minute is dropped
const MIN_FREE_BYTES = 1024 ** 3; // refuse uploads with less than 1 GB free on the drive
const KEY_LIKE = /sk-ant-[A-Za-z0-9_-]{20,}/i; // the app's own pattern (src/platform/backup.js)
const LABEL_MAX = 60;
const DAILY_RE = /^\d{4}-\d{2}-\d{2}\.json\.gz$/;

export class SyncError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
    this.expose = true;
  }
}

export const validDeviceId = (id) => typeof id === 'string' && DEVICE_ID_RE.test(id);

/** The device's name from the X-Jarvis-Device-Label header: percent-encoded UTF-8 is decoded, control characters dropped. */
export function cleanLabel(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw;
  if (/%[0-9a-fA-F]{2}/.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {
      // not percent-encoded after all
    }
  }
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return [...s].slice(0, LABEL_MAX).join('');
}

function localDay(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Does an Accept-Encoding header allow gzip? No header at all counts as yes (what every browser sends). */
export function acceptsGzip(header) {
  if (typeof header !== 'string') return true;
  let gz = null;
  let star = null;
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([\d.]+)\s*$/.exec(p);
      if (m) q = Number(m[1]);
    }
    if (name.trim() === 'gzip' || name.trim() === 'x-gzip') gz = Math.max(gz ?? 0, q);
    else if (name.trim() === '*') star = q;
  }
  if (gz !== null) return gz > 0;
  if (star !== null) return star > 0;
  return false;
}

const isWs = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09;

/** Counts bytes and stops the stream past `max`. */
function limiter(max, what) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (bytes > max) {
        cb(new SyncError(413, 'too_large', `the backup is larger than ${Math.round(max / 1024 / 1024)} MB${what}`, { Connection: 'close' }));
        return;
      }
      cb(null, chunk);
    },
  });
}

/** Looks at the decoded JSON on its way to disk: size, start, end, key-like text, SHA-256. */
function inspector() {
  let bytes = 0;
  let head = '';
  let last = 0;
  let carry = '';
  const hash = crypto.createHash('sha256');
  const t = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (head.length < 1024) head += chunk.toString('latin1', 0, Math.min(chunk.length, 1024 - head.length));
      const s = carry + chunk.toString('latin1'); // UTF-8 never hides ASCII inside multi-byte characters
      if (KEY_LIKE.test(s)) {
        cb(new SyncError(400, 'key_in_backup', 'the backup contains something shaped like an API key (sk-ant-…), so it was not stored'));
        return;
      }
      carry = s.slice(-64);
      for (let i = chunk.length - 1; i >= 0; i -= 1) {
        if (!isWs(chunk[i])) {
          last = chunk[i];
          break;
        }
      }
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  t.result = () => ({ bytes, head, last, sha256: hash.digest('hex') });
  return t;
}

/** Fails the stream when nothing arrives for `ms`. */
function idleGuard(ms) {
  let timer = null;
  const t = new Transform({
    transform(chunk, _enc, cb) {
      arm();
      cb(null, chunk);
    },
    flush(cb) {
      clearTimeout(timer);
      cb();
    },
    destroy(err, cb) {
      clearTimeout(timer);
      cb(err);
    },
  });
  function arm() {
    clearTimeout(timer);
    timer = setTimeout(() => t.destroy(new SyncError(400, 'incomplete', 'the upload stopped sending data')), ms);
    timer.unref?.();
  }
  arm();
  return t;
}

async function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fh = await fsp.open(tmp, 'w', 0o600);
  try {
    await fh.writeFile(JSON.stringify(obj));
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, file);
}

/**
 * createSync({ dir, log, now, maxBytes, keepDays, minFreeBytes, idleMs }) -> { put, list, get, dir }
 * Synchronous: the folder is created and the device index loaded right away.
 */
export function createSync({ dir, log = () => {}, now = () => Date.now(), maxBytes = MAX_BYTES, keepDays = KEEP_DAYS, minFreeBytes = MIN_FREE_BYTES, idleMs = IDLE_MS } = {}) {
  if (!dir) throw new Error('createSync: dir is required');
  const index = new Map(); // id -> meta
  const uploading = new Set();

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // not ours to change
  }
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() || !validDeviceId(ent.name)) continue;
    const devDir = path.join(dir, ent.name);
    for (const f of fs.readdirSync(devDir)) {
      if (f.startsWith('.upload-') || f.includes('.tmp-')) fs.rmSync(path.join(devDir, f), { force: true }); // an upload cut off by a restart
    }
    const latest = path.join(devDir, 'latest.json.gz');
    if (!fs.existsSync(latest)) continue;
    let meta = null;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(devDir, 'meta.json'), 'utf8'));
    } catch {
      meta = null;
    }
    const st = fs.statSync(latest);
    if (!meta || meta.id !== ent.name) {
      meta = { id: ent.name, label: null, updatedAt: new Date(st.mtimeMs).toISOString(), bytes: null, storedBytes: st.size, sha256: null };
      log(`sync: rebuilt the description of ${ent.name}'s backup from the file`);
    }
    index.set(ent.name, meta);
  }

  function checkId(deviceId) {
    if (!validDeviceId(deviceId)) throw new SyncError(400, 'bad_device', 'the device id must be 8 to 64 characters: a-z, 0-9 and -');
  }

  function freeBytes() {
    try {
      const s = fs.statfsSync(dir);
      return Number(s.bavail) * Number(s.bsize);
    } catch {
      return Infinity;
    }
  }

  async function snapshot(devDir, latest, day) {
    const dailyDir = path.join(devDir, 'daily');
    await fsp.mkdir(dailyDir, { recursive: true, mode: 0o700 });
    const target = path.join(dailyDir, `${day}.json.gz`);
    const tmp = path.join(dailyDir, `.link-${crypto.randomBytes(6).toString('hex')}`);
    try {
      await fsp.link(latest, tmp);
    } catch {
      await fsp.copyFile(latest, tmp); // a file system without hard links
      await fsp.chmod(tmp, 0o600);
    }
    await fsp.rename(tmp, target);
    const days = (await fsp.readdir(dailyDir)).filter((f) => DAILY_RE.test(f)).sort().reverse();
    for (const old of days.slice(keepDays)) await fsp.rm(path.join(dailyDir, old), { force: true });
  }

  /** Stream one upload to disk. Resolves { ok, bytes, storedAt }; throws SyncError. */
  async function put(deviceId, req, { label, encoding } = {}) {
    checkId(deviceId);
    const enc = String(encoding ?? '').trim().toLowerCase();
    if (enc && enc !== 'identity' && enc !== 'gzip' && enc !== 'x-gzip') {
      req.resume?.();
      throw new SyncError(415, 'unsupported_encoding', 'send the backup as JSON, optionally with Content-Encoding: gzip');
    }
    const declared = Number(req.headers?.['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume?.();
      throw new SyncError(413, 'too_large', `the backup is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`, { Connection: 'close' });
    }
    if (uploading.has(deviceId)) {
      req.resume?.();
      throw new SyncError(409, 'busy', 'an upload from this device is already in progress');
    }
    if (uploading.size >= MAX_UPLOADS) {
      req.resume?.();
      throw new SyncError(503, 'busy', 'other devices are uploading; try again in a minute', { 'Retry-After': '30' });
    }
    if (freeBytes() < minFreeBytes) {
      req.resume?.();
      throw new SyncError(507, 'disk_full', "the home base's drive is nearly full, so the backup was not stored");
    }
    uploading.add(deviceId);
    const devDir = path.join(dir, deviceId);
    const tmp = path.join(devDir, `.upload-${crypto.randomBytes(6).toString('hex')}.tmp`);
    try {
      await fsp.mkdir(devDir, { recursive: true, mode: 0o700 });
      const check = inspector();
      // The request is piped in rather than made part of the pipeline: when the upload is refused half way
      // (too large, a key in it, bad gzip) the rest is drained instead of the connection being torn down, so
      // the app still gets the reason as JSON.
      const stages = [idleGuard(idleMs), limiter(maxBytes, '')];
      if (enc === 'gzip' || enc === 'x-gzip') stages.push(zlib.createGunzip(), limiter(maxBytes, ' once unpacked'));
      stages.push(check, zlib.createGzip({ level: 6 }), fs.createWriteStream(tmp, { flags: 'wx', mode: 0o600, flush: true }));
      const done = pipeline(stages);
      const abort = () => stages[0].destroy(new SyncError(400, 'incomplete', 'the upload was cut off before it finished'));
      const onClose = () => {
        if (req.complete === false && !req.readableEnded) abort();
      };
      req.on('aborted', abort);
      req.on('error', abort);
      req.on('close', onClose);
      req.pipe(stages[0]);
      try {
        await done;
      } catch (err) {
        req.unpipe?.(stages[0]);
        if (!req.destroyed) req.resume?.();
        if (err instanceof SyncError) throw err;
        if (err?.code === 'Z_DATA_ERROR' || err?.code === 'Z_BUF_ERROR' || err?.errno === zlib.constants.Z_DATA_ERROR) {
          throw new SyncError(400, 'bad_gzip', 'the upload says it is gzip but could not be unpacked');
        }
        if (err?.code === 'ERR_STREAM_PREMATURE_CLOSE' || err?.code === 'ECONNRESET' || err?.message === 'aborted') {
          throw new SyncError(400, 'incomplete', 'the upload was cut off before it finished');
        }
        if (err?.code === 'ENOSPC') throw new SyncError(507, 'disk_full', "the home base's drive is full, so the backup was not stored");
        throw err;
      } finally {
        req.off?.('aborted', abort);
        req.off?.('error', abort);
        req.off?.('close', onClose);
      }
      const r = check.result();
      if (r.bytes === 0 || !/^\s*\{/.test(r.head) || !/"app"\s*:\s*"jarvis"/.test(r.head) || r.last !== 0x7d) {
        throw new SyncError(400, 'bad_backup', "that isn't a Jarvis backup (the app's backup file, as JSON)");
      }
      const latest = path.join(devDir, 'latest.json.gz');
      await fsp.rename(tmp, latest);
      const storedBytes = (await fsp.stat(latest)).size;
      const t = now();
      const prev = index.get(deviceId);
      const meta = {
        id: deviceId,
        label: cleanLabel(label) ?? prev?.label ?? null,
        updatedAt: new Date(t).toISOString(),
        bytes: r.bytes,
        storedBytes,
        sha256: r.sha256,
      };
      try {
        await snapshot(devDir, latest, localDay(t));
      } catch (err) {
        log(`sync: could not keep today's snapshot for ${deviceId}: ${err?.message ?? err}`);
      }
      await writeJsonAtomic(path.join(devDir, 'meta.json'), meta);
      index.set(deviceId, meta);
      return { ok: true, bytes: r.bytes, storedAt: meta.updatedAt };
    } finally {
      uploading.delete(deviceId);
      await fsp.rm(tmp, { force: true }).catch(() => {});
    }
  }

  /** Every device with a stored backup, newest first. */
  function list() {
    const devices = [...index.values()]
      .map((m) => ({ id: m.id, label: m.label ?? 'Device', updatedAt: m.updatedAt, bytes: m.bytes }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return { devices };
  }

  /**
   * A device's latest backup: null when there is none, else { stream, bytes, contentType, contentEncoding }.
   * The stored gzip as is (bytes = its exact size), or unpacked when acceptEncoding says gzip is not welcome
   * (then bytes is null: send it chunked). The file is opened here, so a PUT replacing it meanwhile never mixes.
   */
  async function get(deviceId, { acceptEncoding } = {}) {
    checkId(deviceId);
    if (!index.has(deviceId)) return null;
    let fh;
    try {
      fh = await fsp.open(path.join(dir, deviceId, 'latest.json.gz'), 'r');
    } catch (err) {
      if (err?.code === 'ENOENT') return null;
      throw err;
    }
    const gzipOk = acceptsGzip(acceptEncoding);
    const { size } = await fh.stat();
    const file = fh.createReadStream({ autoClose: true });
    const contentType = 'application/json; charset=utf-8';
    if (gzipOk) return { stream: file, bytes: size, contentType, contentEncoding: 'gzip' };
    const gunzip = zlib.createGunzip();
    file.on('error', (err) => gunzip.destroy(err));
    gunzip.on('close', () => file.destroy());
    return { stream: file.pipe(gunzip), bytes: null, contentType, contentEncoding: null };
  }

  return { dir, put, list, get };
}
