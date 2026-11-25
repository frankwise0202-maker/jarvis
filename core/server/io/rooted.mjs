// A synchronous stand-in for the live IO that reads a fixture directory tree laid out like the real
// filesystem (proc/stat, sys/class/hwmon/...). Several roots can be stacked: the first one that has a
// file wins, and directory listings are merged. Commands, statfs and the network are answered from
// plain handler functions or tables. Used by the tests; everything answers synchronously.

import fs from 'node:fs';
import path from 'node:path';

export function createRootedIO({ roots, commands = {}, statfs = {}, dns = null, http = null, netAddrs = {} } = {}) {
  let stack = [...roots];
  const read = (p) => {
    for (const root of stack) {
      try {
        return fs.readFileSync(path.join(root, p), 'utf8');
      } catch {
        // next root
      }
    }
    return null;
  };
  return {
    kind: 'rooted',
    /** Replace the root stack (e.g. put the "next" sample on top). */
    setRoots(next) {
      stack = [...next];
    },
    readText: read,
    listDir(p) {
      const names = new Set();
      for (const root of stack) {
        try {
          for (const n of fs.readdirSync(path.join(root, p))) names.add(n);
        } catch {
          // missing here
        }
      }
      return [...names];
    },
    statfs(p) {
      const v = typeof statfs === 'function' ? statfs(p) : statfs[p];
      return v ?? null;
    },
    run(cmd, args = []) {
      const key = [cmd, ...args].join(' ');
      for (const [prefix, handler] of Object.entries(commands)) {
        if (key === prefix || key.startsWith(`${prefix} `)) return typeof handler === 'function' ? handler(args) : handler;
      }
      return { ok: false, code: null, stdout: '', stderr: '', error: 'ENOENT' };
    },
    dnsLookup(host) {
      return dns ? dns(host) : { ok: false, ms: 0, address: null, error: 'ENOTFOUND' };
    },
    httpRequest(url, opts = {}) {
      return http ? http(url, opts) : { ok: false, status: null, ms: 0, headers: {}, text: null, error: 'ECONNREFUSED' };
    },
    netAddrs: () => netAddrs,
  };
}
