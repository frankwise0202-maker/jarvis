// Shared helpers for the Core server tests.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRootedIO } from '../../server/io/rooted.mjs';
import { createSimulator } from '../../server/sim/simulator.mjs';
import { createCore } from '../../server/core.mjs';
import { createManualClock } from '../../server/clock.mjs';
import { loadConfig } from '../../server/config.mjs';
import { setLocale } from '../../server/format.mjs';

// The server's times follow the system's locale; the tests pin en-GB ("14:32", "Wednesday 25 November")
// so they read the same on any machine. The assistant tests check en-US against the dashboard as well.
setLocale('en-GB');

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.resolve(HERE, '../../fixtures');
export const ROOT = path.join(FIXTURES, 'alienware/root');
export const NEXT = path.join(FIXTURES, 'alienware/next');
export const fixture = (rel) => fs.readFileSync(path.join(FIXTURES, rel), 'utf8');

/** 2026-11-25 14:32:00 UTC, the simulated "now" used across the tests. */
export const START = Date.parse('2026-11-25T14:32:00Z');

/** statfs answers matching the fixture mounts (a 983 GB root at 47 %, the EFI partition). */
export const STATFS = {
  '/': { bsize: 4096, blocks: 240046080, bfree: 127200000, bavail: 115197696 },
  '/boot/efi': { bsize: 4096, blocks: 130812, bfree: 122881, bavail: 122881 },
};

export function rootedIO(extra = {}) {
  return createRootedIO({ roots: [ROOT], statfs: STATFS, ...extra });
}

/** A config for tests: no persistence, defaults otherwise. */
export function testConfig(argv = [], env = {}) {
  const { config, errors } = loadConfig({ env, argv, readFile: () => { const e = new Error('none'); e.code = 'ENOENT'; throw e; } });
  if (errors.length) throw new Error(errors.join('; '));
  config.persist = false;
  return config;
}

/** A fixture-mode core with its history pre-filled and the last hour warmed up (manual clock). */
export function fixtureCore(scenario = 'ok', { start = START, warmupSec = 3600, config: over = {} } = {}) {
  const config = Object.assign(testConfig(['--fixture', scenario]), over);
  const sim = createSimulator({ scenario, startMs: start });
  const clock = createManualClock(start);
  const core = createCore({ config, io: sim, clock, mode: 'fixture', sim });
  core.prefill({ warmupSec });
  return { core, sim, clock, config };
}

/** The status assistant's context for a core. */
export const askCtx = (core, owner = 'Frank') => ({ s: core.snapshot, history: core.history, events: core.events, now: core.snapshot.t, owner, tz: 'UTC' });

export function tmpDir(prefix = 'jarvis-core-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A plain HTTP request: resolves { status, headers, body, json }. */
export function request(port, pathName, { method = 'GET', headers = {}, body = null, host = null } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    if (host) h.Host = host;
    if (body !== null && h['content-length'] === undefined) h['content-length'] = Buffer.byteLength(body);
    const req = http.request({ host: '127.0.0.1', port, path: pathName, method, headers: h, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // not JSON
        }
        resolve({ status: res.statusCode, headers: res.headers, body: text, json });
      });
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

/**
 * Open an SSE stream and collect frames: resolves { frames, close } once `until(frames)` is true or the
 * timeout passes. Each frame is { event, id, data } with data parsed as JSON when possible.
 */
export function readSse(port, { headers = {}, until = () => false, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const frames = [];
    let buf = '';
    let done = false;
    let status = null;
    const req = http.request({ host: '127.0.0.1', port, path: '/api/stream', headers, agent: false }, (res) => {
      status = res.statusCode;
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const f = { event: null, id: null, data: null, retry: null, comment: false };
          for (const line of raw.split('\n')) {
            if (line.startsWith(':')) f.comment = true;
            else if (line.startsWith('event: ')) f.event = line.slice(7);
            else if (line.startsWith('id: ')) f.id = line.slice(4);
            else if (line.startsWith('retry: ')) f.retry = Number(line.slice(7));
            else if (line.startsWith('data: ')) {
              try {
                f.data = JSON.parse(line.slice(6));
              } catch {
                f.data = line.slice(6);
              }
            }
          }
          frames.push(f);
          if (!done && until(frames)) finish();
        }
      });
      res.on('end', () => finish());
    });
    const timer = setTimeout(() => finish(), timeoutMs);
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      req.destroy();
      resolve({ frames, status });
    }
    req.on('error', (err) => (done ? null : reject(err)));
    req.end();
  });
}
