// The key vault: the owner's Claude API key, handed over once by the Jarvis app.
//
//   ~/.config/jarvis-core/secrets/anthropic.key    the key alone (folder 700, file 600)
//   ~/.config/jarvis-core/secrets/anthropic.json   { setAt, verified } (no key in it)
//
// The key is never logged, never returned (only a hint: "…Ab3D") and only ever sent to api.anthropic.com
// by the Claude client. dir = null keeps it in memory only (fixture mode, tests).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY_FORMAT = /^sk-ant-[A-Za-z0-9_-]{16,250}$/;

/** True for a string shaped like an Anthropic API key. */
export const looksLikeKey = (key) => typeof key === 'string' && KEY_FORMAT.test(key);

/** "…Ab3D": the last four characters. */
export const keyHint = (key) => (typeof key === 'string' && key.length >= 8 ? `…${key.slice(-4)}` : null);

export function createVault({ dir = null, log = () => {}, now = () => Date.now() } = {}) {
  const keyFile = dir ? path.join(dir, 'anthropic.key') : null;
  const metaFile = dir ? path.join(dir, 'anthropic.json') : null;
  let cache; // undefined: not read yet; null: no key
  let meta = null;

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // not ours to fix
    }
  }

  function writePrivate(file, text) {
    ensureDir();
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeFileSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // rename kept the 600 mode
    }
  }

  function read() {
    if (cache !== undefined) return cache;
    if (!keyFile) {
      cache = null;
      return cache;
    }
    try {
      const text = fs.readFileSync(keyFile, 'utf8').trim();
      cache = looksLikeKey(text) ? text : null;
      if (!cache && text) log('the saved API key file does not hold a key (ignored)');
      // A key file other users could read is tightened at once.
      try {
        const st = fs.statSync(keyFile);
        if ((st.mode & 0o077) !== 0) fs.chmodSync(keyFile, 0o600);
      } catch {
        // best effort
      }
    } catch (err) {
      if (err?.code !== 'ENOENT') log(`could not read the saved API key file (${err?.code ?? 'error'})`);
      cache = null;
    }
    try {
      meta = cache ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : null;
    } catch {
      meta = null;
    }
    if (cache && !meta) {
      let setAt = null;
      try {
        setAt = new Date(fs.statSync(keyFile).mtimeMs).toISOString();
      } catch {
        // unknown
      }
      meta = { setAt, verified: false };
    }
    return cache;
  }

  return {
    /** The key itself, for the Claude client only. */
    get: () => read(),
    /** { set, hint, setAt, verified } - never the key. */
    status() {
      const key = read();
      if (!key) return { set: false, hint: null, setAt: null, verified: false };
      return { set: true, hint: keyHint(key), setAt: meta?.setAt ?? null, verified: meta?.verified === true };
    },
    set(key, { verified = false } = {}) {
      if (!looksLikeKey(key)) throw new Error('not an API key');
      const m = { setAt: new Date(now()).toISOString(), verified: verified === true };
      if (keyFile) {
        writePrivate(keyFile, `${key}\n`);
        writePrivate(metaFile, JSON.stringify(m));
      }
      cache = key;
      meta = m;
      return this.status();
    },
    markVerified(verified) {
      if (!read()) return;
      meta = { ...(meta ?? {}), verified: verified === true };
      if (metaFile) {
        try {
          writePrivate(metaFile, JSON.stringify(meta));
        } catch (err) {
          log(`could not save the key's status (${err?.code ?? 'error'})`);
        }
      }
    },
    remove() {
      if (keyFile) {
        for (const f of [keyFile, metaFile]) {
          try {
            fs.rmSync(f, { force: true });
          } catch (err) {
            log(`could not remove ${path.basename(f)} (${err?.code ?? 'error'})`);
          }
        }
      }
      cache = null;
      meta = null;
    },
    dir,
  };
}
