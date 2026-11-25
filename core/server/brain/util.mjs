// Small helpers for the brain: redaction, ids, plain text, durable JSON files, fetch with a timeout.
// No dependencies.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Anything shaped like an Anthropic key ("sk-ant-api03-…", "sk-ant-admin01-…", "sk-ant-oat…") is never
// written to a log, a response, an error or an event. Applied to every string the brain lets out.
const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]{4,}/g;

/** The text with every key-shaped run replaced by "sk-ant-…". */
export function redact(value) {
  const s = typeof value === 'string' ? value : String(value ?? '');
  return s.replace(KEY_PATTERN, 'sk-ant-…');
}

/** A log function that never prints a key. */
export function safeLog(log) {
  return (msg) => {
    try {
      log(redact(msg));
    } catch {
      // logging never breaks the brain
    }
  };
}

/** "j_k3x9…": a prefix and 12 random base-36 characters. */
export function newId(prefix) {
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (const b of bytes) s += (b % 36).toString(36);
  return `${prefix}_${s}`;
}

export const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
export const fromIso = (s) => {
  const ms = typeof s === 'string' ? Date.parse(s) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Control and invisible formatting characters (bidi overrides, zero-width, line separators).
// eslint-disable-next-line no-control-regex
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]', 'g');

/** One line of plain text: control characters and runs of spaces folded, capped with "…", or ''. */
export function oneLine(value, max = 200) {
  if (typeof value !== 'string') return '';
  const s = value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Multi-line text: control characters removed (newlines and tabs kept), capped. */
export function cleanText(value, max = 60_000) {
  if (typeof value !== 'string') return '';
  const s = value.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** An http(s) URL without credentials, as a string, or null. */
export function httpUrl(value, max = 2000) {
  if (typeof value !== 'string' || !value || value.length > max) return null;
  try {
    const u = new URL(value.trim());
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

export const round2 = (v) => Math.round(v * 100) / 100;
/** USD for display and JSON: 4 decimals (a watcher check costs about a cent). */
export const usd = (v) => (Number.isFinite(v) ? Math.round(v * 10_000) / 10_000 : 0);

/**
 * A durable JSON document: data/<name>, written atomically (temporary file, fsync, rename) with mode 600
 * in a 700 folder. dir = null keeps it in memory only (fixture mode, tests). A file that cannot be read is
 * moved aside (<name>.corrupt-<time>) and load() returns null.
 */
export function createJsonFile({ dir, name, log = () => {} }) {
  const file = dir ? path.join(dir, name) : null;
  let memory = null;
  let chain = Promise.resolve();

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // not ours to fix
    }
  }

  function load() {
    if (!file) return memory === null ? null : structuredClone(memory);
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if (err?.code !== 'ENOENT') log(`could not read ${name}: ${err?.message ?? err}`);
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      const aside = `${file}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(file, aside);
      } catch {
        // nothing to move
      }
      log(`could not read ${name} (${err?.message ?? err}); moved it to ${path.basename(aside)} and started fresh`);
      return null;
    }
  }

  async function write(text) {
    ensureDir();
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
    const fh = await fsp.open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(text);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fsp.rename(tmp, file);
  }

  /** Save (serialised: two saves never overlap; the last one wins). */
  function save(value) {
    if (!file) {
      memory = structuredClone(value);
      return Promise.resolve();
    }
    const text = JSON.stringify(value);
    chain = chain.catch(() => {}).then(() => write(text));
    return chain.catch((err) => log(`saving ${name} failed: ${err?.message ?? err}`));
  }

  function saveSync(value) {
    if (!file) {
      memory = structuredClone(value);
      return;
    }
    ensureDir();
    const tmp = `${file}.tmp-${process.pid}-sync`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(value));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  }

  return {
    file,
    load,
    save,
    saveSync,
    flush: () => chain.catch(() => {}),
  };
}

/**
 * fetch with a timeout and a size cap. Resolves { ok, status, text } or { ok: false, error } and never
 * rejects. Only for public data (weather, headlines, geocoding): no credentials ever go through it.
 */
export async function fetchText(fetchFn, url, { timeoutMs = 8000, maxBytes = 1_000_000, headers = {}, signal } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const onAbort = () => ac.abort();
  signal?.addEventListener?.('abort', onAbort, { once: true });
  try {
    const res = await fetchFn(url, { headers: { 'User-Agent': 'jarvis-core', ...headers }, signal: ac.signal, redirect: 'follow' });
    const reader = res.body?.getReader?.();
    let text = '';
    if (reader) {
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          ac.abort();
          return { ok: false, status: res.status, error: 'too_large' };
        }
        chunks.push(value);
      }
      text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    } else {
      text = await res.text();
      if (text.length > maxBytes) return { ok: false, status: res.status, error: 'too_large' };
    }
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return { ok: false, error: ac.signal.aborted ? 'timeout' : String(err?.code ?? err?.name ?? 'network') };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

/** JSON.parse that returns null instead of throwing. */
export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
