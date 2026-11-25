// The live machine. Everything the collector touches goes through this small interface, so tests and the
// fixture simulator can stand in for the real /proc, /sys, commands and network:
//
//   readText(path)            → string | null    synchronous; /proc and /sys pseudo files are in memory
//   listDir(path)             → string[]         synchronous; [] when missing
//   statfs(path)              → Promise<{ bsize, blocks, bfree, bavail } | null>
//   run(cmd, args, opts)      → Promise<{ ok, code, stdout, stderr, error }>   error: 'ENOENT' | 'TIMEOUT' | message
//   dnsLookup(host, opts)     → Promise<{ ok, ms, address, error }>
//   httpRequest(url, opts)    → Promise<{ ok, status, ms, headers, text, error }>   ok = some HTTP answer arrived
//   netAddrs()                → os.networkInterfaces()
//
// Nothing here blocks for long: commands, statfs, DNS and HTTP are asynchronous with timeouts, and the
// synchronous reads are only for kernel pseudo files.

import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import dns from 'node:dns';

export function createLiveIO({ root = '' } = {}) {
  const at = (p) => root + p;

  function run(cmd, args = [], { timeoutMs = 5000, maxBytes = 1 << 20 } = {}) {
    return new Promise((resolve) => {
      let child;
      try {
        child = execFile(
          cmd,
          args,
          {
            timeout: timeoutMs,
            killSignal: 'SIGKILL',
            maxBuffer: maxBytes,
            windowsHide: true,
            env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
          },
          (err, stdout, stderr) => {
            if (!err) return resolve({ ok: true, code: 0, stdout: String(stdout), stderr: String(stderr), error: null });
            let error = err.message;
            if (err.code === 'ENOENT') error = 'ENOENT';
            else if (err.killed || err.signal === 'SIGKILL') error = 'TIMEOUT';
            resolve({
              ok: false,
              code: typeof err.code === 'number' ? err.code : null,
              stdout: String(stdout ?? ''),
              stderr: String(stderr ?? ''),
              error,
            });
          },
        );
      } catch (err) {
        resolve({ ok: false, code: null, stdout: '', stderr: '', error: err?.code === 'ENOENT' ? 'ENOENT' : String(err?.message ?? err) });
        return;
      }
      child.on?.('error', () => {}); // reported through the callback
    });
  }

  async function dnsLookup(host, { timeoutMs = 3000 } = {}) {
    const resolver = new dns.promises.Resolver({ timeout: timeoutMs, tries: 1 });
    const started = performance.now();
    try {
      const addrs = await resolver.resolve4(host);
      return { ok: true, ms: performance.now() - started, address: addrs[0] ?? null, error: null };
    } catch (err) {
      return { ok: false, ms: performance.now() - started, address: null, error: err?.code || String(err?.message ?? err) };
    } finally {
      resolver.cancel();
    }
  }

  async function httpRequest(url, { method = 'HEAD', timeoutMs = 5000, headers = {}, maxBytes = 256 * 1024 } = {}) {
    const started = performance.now();
    try {
      const res = await fetch(url, { method, headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      const ms = performance.now() - started;
      const head = { etag: res.headers.get('etag'), 'last-modified': res.headers.get('last-modified') };
      let text = null;
      if (method !== 'HEAD' && res.status === 200 && res.body) {
        const reader = res.body.getReader();
        const chunks = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
        text = Buffer.concat(chunks).toString('utf8');
      } else {
        await res.body?.cancel();
      }
      return { ok: true, status: res.status, ms, headers: head, text, error: null };
    } catch (err) {
      const cause = err?.cause?.code || err?.name || err?.code;
      return { ok: false, status: null, ms: performance.now() - started, headers: {}, text: null, error: cause === 'TimeoutError' ? 'TIMEOUT' : String(cause || err?.message || err) };
    }
  }

  return {
    kind: 'live',
    readText(path) {
      try {
        return fs.readFileSync(at(path), 'utf8');
      } catch {
        return null;
      }
    },
    listDir(path) {
      try {
        return fs.readdirSync(at(path));
      } catch {
        return [];
      }
    },
    statfs(path) {
      const timeout = new Promise((resolve) => setTimeout(resolve, 3000, null).unref?.());
      const st = fs.promises.statfs(at(path)).then(
        (s) => ({ bsize: s.bsize, blocks: s.blocks, bfree: s.bfree, bavail: s.bavail }),
        () => null,
      );
      return Promise.race([st, timeout]);
    },
    run,
    dnsLookup,
    httpRequest,
    netAddrs: () => os.networkInterfaces(),
  };
}
