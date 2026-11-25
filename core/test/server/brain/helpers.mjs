// Shared helpers for the brain's tests: a brain wired to the fake Claude API, the fixture fetch, a manual
// clock and a recording push service.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBrain } from '../../../server/brain/index.mjs';
import { createFixtureFetch } from '../../../server/brain/fixture-fetch.mjs';
import { createManualClock } from '../../../server/clock.mjs';
import { setLocale } from '../../../server/format.mjs';

setLocale('en-US');

export const TZ = 'America/New_York';
/** 2026-11-25 07:00 in New York (EST, UTC-5). */
export const MORNING = Date.parse('2026-11-25T12:00:00Z');
export const KEY = 'sk-ant-api03-TESTKEY_0123456789abcdefghijklmnopqrstuvwxyzAb3D';

export function tmp(prefix = 'jarvis-brain-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function fakePush() {
  const sent = [];
  return {
    sent,
    info: () => ({ vapidPublicKey: 'BTESTVAPIDPUBLICKEY', devices: [{ id: 'p_test', label: 'iPhone', addedAt: '2026-11-25T00:00:00.000Z' }] }),
    async notify(n) {
      sent.push(n);
      return { sent: 1, failed: 0 };
    },
  };
}

export function makeBrain({ fake = null, clock = createManualClock(MORNING), dataDir = null, secretsDir = null, push = fakePush(), core = null, whatsNewFile = null, fetchFn = createFixtureFetch(), importSdk, logs = [], rand = () => 0.5 } = {}) {
  const brain = createBrain({
    config: { ownerName: 'Frank' },
    getCore: () => core,
    now: () => clock.now(),
    log: (m) => logs.push(m),
    timeZone: TZ,
    fetch: fetchFn,
    push,
    dataDir,
    secretsDir,
    claudeBase: fake ? fake.url : 'http://127.0.0.1:9',
    importSdk,
    whatsNewFile,
    rand,
    tickMs: 3600_000,
  });
  return { brain, clock, push, logs, fetchFn };
}

/** Wait until fn() is truthy (polling), or fail after timeoutMs. */
export async function until(fn, { timeoutMs = 5000, stepMs = 10, what = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

/** Every file under dir, recursively. */
export function filesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}
