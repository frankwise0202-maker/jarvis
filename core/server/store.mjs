// Persistence under ~/.local/share/jarvis-core (or $JARVIS_CORE_DATA_DIR):
//
//   history-v1.json.gz   both history rings (typed arrays, base64), every 5 minutes and on shutdown
//   events-v1.json       the event log, shortly after it changes and on shutdown
//   state-v1.json        boot id, start time and whether the last stop was clean (restart detection)
//
// Writes are atomic (temporary file, fsync, rename), so a power cut never leaves half a file. A file that
// cannot be read is moved aside (*.corrupt-<time>) and the Core starts fresh instead of crashing.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);

/** The default data directory: $XDG_DATA_HOME/jarvis-core or ~/.local/share/jarvis-core. */
export function defaultDataDir(env = process.env) {
  const base = env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'jarvis-core');
}

export function createStore({ dir, log = () => {} }) {
  const files = {
    history: path.join(dir, 'history-v1.json.gz'),
    events: path.join(dir, 'events-v1.json'),
    state: path.join(dir, 'state-v1.json'),
  };
  let ready = false;
  const writing = new Map(); // file → promise, so two saves of one file never overlap

  function ensureDir() {
    if (ready) return;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    ready = true;
  }

  async function writeAtomic(file, data) {
    ensureDir();
    const tmp = `${file}.tmp-${process.pid}`;
    const fh = await fsp.open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(data);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fsp.rename(tmp, file);
  }

  function serialWrite(file, data) {
    const prev = writing.get(file) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(() => writeAtomic(file, data));
    writing.set(file, next);
    next.finally(() => {
      if (writing.get(file) === next) writing.delete(file);
    }).catch(() => {});
    return next;
  }

  function writeAtomicSync(file, data) {
    ensureDir();
    const tmp = `${file}.tmp-${process.pid}`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  }

  function moveAside(file, err) {
    const aside = `${file}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(file, aside);
      log(`could not read ${path.basename(file)} (${err?.message ?? err}); moved it to ${path.basename(aside)} and started fresh`);
    } catch {
      // nothing to move
    }
    return aside;
  }

  /** Read one file: { ok, value } | { ok: false, missing } | { ok: false, corrupt, aside }. */
  function readJson(file, { gz = false } = {}) {
    let raw;
    try {
      raw = fs.readFileSync(file);
    } catch (err) {
      return { ok: false, missing: err?.code === 'ENOENT', error: err };
    }
    try {
      const text = gz ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
      return { ok: true, value: JSON.parse(text) };
    } catch (err) {
      return { ok: false, corrupt: true, aside: moveAside(file, err), error: err };
    }
  }

  return {
    dir,
    files,
    loadHistory: () => readJson(files.history, { gz: true }),
    loadEvents: () => readJson(files.events),
    loadState: () => readJson(files.state),
    /** Moves a file that parsed but could not be restored. */
    discard: (which, err) => moveAside(files[which], err),
    async saveHistory(obj) {
      const buf = await gzip(Buffer.from(JSON.stringify(obj)), { level: 6 });
      await serialWrite(files.history, buf);
      return buf.byteLength;
    },
    saveEvents: (obj) => serialWrite(files.events, JSON.stringify(obj)),
    saveState: (obj) => serialWrite(files.state, JSON.stringify(obj)),
    /** Synchronous save of everything (last resort on an exit path that cannot wait). */
    saveAllSync({ history, events, state }) {
      if (history) writeAtomicSync(files.history, zlib.gzipSync(Buffer.from(JSON.stringify(history)), { level: 1 }));
      if (events) writeAtomicSync(files.events, JSON.stringify(events));
      if (state) writeAtomicSync(files.state, JSON.stringify(state));
    },
    /** Resolves when every pending write has finished. */
    async flush() {
      await Promise.allSettled([...writing.values()]);
    },
  };
}
