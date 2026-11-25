// node --test: health rules and hysteresis, the event log, and the store (persistence and restart detection).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHealth, thresholdLevel, transitionMessage } from '../../server/health.mjs';
import { createEventLog } from '../../server/events.mjs';
import { createStore } from '../../server/store.mjs';
import { createCore } from '../../server/core.mjs';
import { createManualClock } from '../../server/clock.mjs';
import { rootedIO, testConfig, tmpDir, START } from './helpers.mjs';

/** A minimal healthy snapshot; override parts with `over`. */
function snap(over = {}) {
  const base = {
    cpu: { usagePct: 10, temp: { packageC: 45 } },
    gpu: { status: 'ok', tempC: 41, driver: '580.95.05' },
    memory: { availablePct: 60, swap: { totalBytes: 4e9, usedPct: 0 } },
    disks: { mounts: [{ mount: '/', usedPct: 47, freeBytes: 500e9 }], health: { status: 'ok' } },
    processes: { topCpu: [] },
    services: {
      internet: { status: 'up', latencyMs: 20, failures: 0 },
      api: { status: 'up', latencyMs: 80, failures: 0 },
      site: { status: 'up', buildId: '5f3c9e1a', failures: 0 },
      tailscale: { status: 'running', online: 1, total: 2, failures: 0 },
    },
  };
  const merged = structuredClone(base);
  for (const [k, v] of Object.entries(over)) merged[k] = typeof v === 'object' && v && !Array.isArray(v) ? { ...merged[k], ...v } : v;
  return merged;
}
const item = (h, id) => h.items.find((i) => i.id === id);

test('thresholdLevel: rises at thresholds, falls only past the margin', () => {
  const cfg = { warn: 80, alert: 90, margin: 5 };
  assert.equal(thresholdLevel(79, 'ok', cfg), 'ok');
  assert.equal(thresholdLevel(80, 'ok', cfg), 'warn');
  assert.equal(thresholdLevel(90, 'ok', cfg), 'alert');
  assert.equal(thresholdLevel(78, 'warn', cfg), 'warn'); // inside the margin
  assert.equal(thresholdLevel(74, 'warn', cfg), 'ok');
  assert.equal(thresholdLevel(86, 'alert', cfg), 'alert');
  assert.equal(thresholdLevel(84, 'alert', cfg), 'warn');
  assert.equal(thresholdLevel(77, 'alert', cfg), 'warn'); // below warn but within its margin
  assert.equal(thresholdLevel(70, 'alert', cfg), 'ok');
  const below = { warn: 10, alert: 5, margin: 2, dir: 'below' };
  assert.equal(thresholdLevel(9, 'ok', below), 'warn');
  assert.equal(thresholdLevel(4, 'ok', below), 'alert');
  assert.equal(thresholdLevel(11, 'warn', below), 'warn');
  assert.equal(thresholdLevel(13, 'warn', below), 'ok');
});

test('CPU temperature: raise after 10 s, no flapping around 80 °C, clear after 30 s below 75 °C', () => {
  const h = createHealth();
  let t = 0;
  const at = (c) => h.evaluate(snap({ cpu: { usagePct: 10, temp: { packageC: c } } }), (t += 1000));
  // over the threshold at +0 s ... +9 s: not yet; at +10 s (the 11th one-second sample): warn
  for (let i = 0; i < 10; i += 1) assert.equal(item(at(82).health, 'cpu.temp').level, 'ok');
  const r = at(82);
  assert.equal(item(r.health, 'cpu.temp').level, 'warn');
  assert.deepEqual(r.transitions.map((x) => [x.id, x.from, x.to, x.message]), [['cpu.temp', 'ok', 'warn', 'CPU running hot: 82 °C']]);
  // hovering 77-81 for minutes never clears or re-raises
  for (let i = 0; i < 300; i += 1) assert.equal(at(i % 2 ? 77 : 81).transitions.length, 0);
  // below 75 °C from +0 s to +29 s: still warn; at +30 s: ok
  for (let i = 0; i < 30; i += 1) assert.equal(item(at(70).health, 'cpu.temp').level, 'warn');
  const back = at(70);
  assert.equal(back.transitions[0].to, 'ok');
  assert.equal(transitionMessage(back.transitions[0]), 'CPU temperature back to normal (70 °C)');
});

test('a brief spike shorter than the raise delay never warns', () => {
  const h = createHealth();
  let t = 0;
  for (let i = 0; i < 5; i += 1) h.evaluate(snap({ cpu: { usagePct: 10, temp: { packageC: 95 } } }), (t += 1000));
  const r = h.evaluate(snap(), (t += 1000));
  assert.equal(item(r.health, 'cpu.temp').level, 'ok');
  assert.equal(r.health.level, 'ok');
});

test('memory (a "below" rule), swap, disks per mount', () => {
  const h = createHealth();
  let t = 0;
  let r;
  for (let i = 0; i < 16; i += 1) r = h.evaluate(snap({ memory: { availablePct: 4, swap: { totalBytes: 4e9, usedPct: 85 } } }), (t += 1000));
  assert.equal(item(r.health, 'memory').level, 'alert');
  assert.equal(item(r.health, 'memory').message, 'Memory nearly full: 4% available');
  assert.equal(item(r.health, 'swap').level, 'ok'); // swap needs 60 s
  for (let i = 0; i < 60; i += 1) r = h.evaluate(snap({ memory: { availablePct: 4, swap: { totalBytes: 4e9, usedPct: 85 } } }), (t += 1000));
  assert.equal(item(r.health, 'swap').level, 'alert');
  const d = h.evaluate(snap({ disks: { mounts: [{ mount: '/', usedPct: 96, freeBytes: 35e9 }, { mount: '/media/backup', usedPct: 88, freeBytes: 120e9 }], health: { status: 'ok' } } }), (t += 1000));
  assert.equal(item(d.health, 'disk:/').level, 'alert');
  assert.equal(item(d.health, 'disk:/').message, 'Main drive 96% full (35 GB free)');
  assert.equal(item(d.health, 'disk:/media/backup').level, 'warn');
  assert.equal(item(createHealth().evaluate(snap({ memory: { availablePct: 50, swap: { totalBytes: 0, usedPct: null } } }), 0).health, 'swap').message, 'No swap');
});

test('checks: internet needs two failed checks; API and site are unknown while the internet is down', () => {
  const h = createHealth();
  const down1 = { internet: { status: 'down', failures: 1 }, api: { status: 'down', failures: 1 }, site: { status: 'down', failures: 1 }, tailscale: { status: 'running', online: 0, total: 2, failures: 0 } };
  let r = h.evaluate(snap({ services: down1 }), 1000);
  assert.equal(item(r.health, 'internet').level, 'ok');
  assert.equal(item(r.health, 'internet').message, 'Not answering, checking again');
  r = h.evaluate(snap({ services: { ...down1, internet: { status: 'down', failures: 2 }, api: { status: 'down', failures: 2 } } }), 2000);
  assert.equal(item(r.health, 'internet').level, 'alert');
  assert.equal(item(r.health, 'api').level, 'ok');
  assert.equal(item(r.health, 'api').message, 'Unknown while the internet is down');
  assert.equal(r.health.summary, '1 alert: Internet down');
  r = h.evaluate(snap(), 3000);
  assert.equal(item(r.health, 'internet').level, 'ok');
  assert.equal(r.transitions[0].to, 'ok');
  // the API alone failing twice while the internet is up
  const h2 = createHealth();
  r = h2.evaluate(snap({ services: { ...snap().services, api: { status: 'down', failures: 2, detail: 'not answering' } } }), 0);
  assert.equal(item(r.health, 'api').level, 'warn');
  assert.equal(item(r.health, 'api').message, 'Claude API unreachable');
});

test('Tailscale: logged out warns after two checks; not installed is fine but unavailable', () => {
  const h = createHealth();
  const ts = (status, failures) => snap({ services: { ...snap().services, tailscale: { status, failures } } });
  assert.equal(item(h.evaluate(ts('logged-out', 1), 0).health, 'tailscale').level, 'ok');
  assert.equal(item(h.evaluate(ts('logged-out', 2), 1).health, 'tailscale').level, 'warn');
  assert.equal(item(h.evaluate(ts('logged-out', 2), 2).health, 'tailscale').message, 'Tailscale logged out');
  const n = item(createHealth().evaluate(ts('not-installed', 0), 0).health, 'tailscale');
  assert.deepEqual([n.level, n.available, n.message], ['ok', false, 'Not installed']);
});

test('GPU driver missing warns (configurable), errors only after three in a row', () => {
  const h = createHealth();
  const r = h.evaluate(snap({ gpu: { status: 'not-installed', detail: 'nvidia-smi is not installed (no NVIDIA driver)', tempC: null } }), 0);
  assert.equal(item(r.health, 'gpu.driver').level, 'warn');
  assert.equal(item(r.health, 'gpu.driver').message, 'GPU driver not loaded');
  assert.equal(item(r.health, 'gpu.temp').available, false);
  assert.equal(item(createHealth({ gpuMissingLevel: 'ok' }).evaluate(snap({ gpu: { status: 'not-installed' } }), 0).health, 'gpu.driver').level, 'ok');
  const e = createHealth();
  assert.equal(item(e.evaluate(snap({ gpu: { status: 'error', errors: 2 } }), 0).health, 'gpu.driver').level, 'ok');
  assert.equal(item(e.evaluate(snap({ gpu: { status: 'error', errors: 3 } }), 1).health, 'gpu.driver').level, 'warn');
  assert.equal(item(createHealth().evaluate(snap({ gpu: { status: 'pending' } }), 0).health, 'gpu.driver').available, false);
});

test('runaway process: one process at a full thread for 5 minutes; multi-threaded wording; clears', () => {
  const h = createHealth();
  const proc = (threadPct, pid = 1499, label = 'GNOME file indexer') => snap({ processes: { topCpu: [{ pid, label, threadPct }] } });
  let r;
  for (let s = 0; s < 299; s += 1) r = h.evaluate(proc(99), s * 1000);
  assert.equal(item(r.health, 'cpu.process').level, 'ok');
  r = h.evaluate(proc(99), 300_000);
  assert.equal(item(r.health, 'cpu.process').level, 'warn');
  assert.equal(item(r.health, 'cpu.process').message, 'GNOME file indexer has kept a CPU thread busy for 5 minutes');
  // 70 % is between clear (60) and raise (90): it stays
  r = h.evaluate(proc(70), 301_000);
  assert.equal(item(r.health, 'cpu.process').level, 'warn');
  for (let s = 302; s < 333; s += 1) r = h.evaluate(proc(5), s * 1000);
  assert.equal(item(r.health, 'cpu.process').level, 'ok');
  const m = createHealth();
  for (let s = 0; s <= 300; s += 1) r = m.evaluate(proc(690, 3310, 'ffmpeg'), s * 1000);
  assert.equal(item(r.health, 'cpu.process').message, 'ffmpeg has been using about 7 CPU threads for 5 minutes');
});

test('disk health from SMART; overall level, counts, summary, rev only on change', () => {
  const h = createHealth();
  const r1 = h.evaluate(snap(), 0);
  assert.equal(r1.health.level, 'ok');
  assert.equal(r1.health.summary, 'All systems normal');
  assert.equal(r1.health.counts.ok, r1.health.items.length);
  assert.deepEqual(r1.health.items.map((i) => i.id), ['cpu.temp', 'cpu.load', 'cpu.process', 'gpu.driver', 'gpu.temp', 'memory', 'swap', 'disk:/', 'disk.health', 'internet', 'api', 'site', 'tailscale']);
  assert.deepEqual(Object.keys(r1.health.items[0]), ['id', 'label', 'level', 'available', 'value', 'unit', 'message', 'detail', 'since']);
  const rev = r1.health.rev;
  assert.equal(h.evaluate(snap(), 1000).health.rev, rev);
  const r2 = h.evaluate(snap({ disks: { mounts: [{ mount: '/', usedPct: 47, freeBytes: 500e9 }], health: { status: 'failing', detail: 'sda failed its SMART health check' } } }), 2000);
  assert.equal(r2.health.level, 'alert');
  assert.equal(r2.health.rev, rev + 1);
  assert.equal(r2.health.since, 2000);
  assert.equal(item(r2.health, 'disk.health').message, 'Disk failing: sda failed its SMART health check');
  const many = createHealth().evaluate(snap({ disks: { mounts: [{ mount: '/', usedPct: 99, freeBytes: 1e9 }], health: { status: 'warning', detail: 'sda: 8 reallocated sectors' } }, gpu: { status: 'not-installed' }, memory: { availablePct: 60, swap: { totalBytes: 0 } } }), 0).health;
  assert.equal(many.summary, '1 alert, 2 warnings: Main drive 99% full (1 GB free); GPU driver not loaded and 1 more');
});

test('unknown values hold their level for a minute, then reset', () => {
  const h = createHealth();
  let t = 0;
  for (let i = 0; i < 12; i += 1) h.evaluate(snap({ cpu: { usagePct: 10, temp: { packageC: 85 } } }), (t += 1000));
  let r = h.evaluate(snap({ cpu: { usagePct: 10, temp: { packageC: null } } }), (t += 1000));
  assert.equal(item(r.health, 'cpu.temp').level, 'warn');
  assert.equal(item(r.health, 'cpu.temp').available, false);
  for (let i = 0; i < 60; i += 1) r = h.evaluate(snap({ cpu: { usagePct: 10, temp: { packageC: null } } }), (t += 1000));
  assert.equal(item(r.health, 'cpu.temp').level, 'ok');
});

// ------------------------------------------------------------------------------------------------- events

test('event log: newest first, bounded, since, level filter, persistence', () => {
  const log = createEventLog({ max: 5 });
  const seen = [];
  log.on((ev) => seen.push(ev.id));
  for (let i = 0; i < 8; i += 1) log.add({ t: 1000 + i, level: i % 2 ? 'warn' : 'ok', kind: 'health', rule: 'cpu.temp', message: `m${i}` });
  assert.equal(log.size, 5);
  assert.deepEqual(log.list({ limit: 3 }).map((e) => e.message), ['m7', 'm6', 'm5']);
  assert.deepEqual(log.list({ sinceId: 6 }).map((e) => e.id), [8, 7]);
  assert.deepEqual(log.list({ level: 'warn' }).map((e) => e.id), [8, 6, 4]);
  assert.deepEqual(log.between(1005, 1006).map((e) => e.id), [6, 7]);
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(log.add({ level: 'bogus', message: 'x'.repeat(500) }).level, 'info');
  assert.equal(log.latest.message.length, 300);
  const copy = createEventLog({ max: 5 });
  copy.restore(JSON.parse(JSON.stringify(log.serialize())));
  assert.equal(copy.size, 5);
  assert.equal(copy.add({ message: 'next' }).id, 10);
  assert.throws(() => copy.restore({ v: 1 }));
  assert.equal(createEventLog().restore({ v: 1, events: [{ id: 'x' }, null, { id: 3, t: 5, message: 'ok' }] }), 1);
});

// ------------------------------------------------------------------------------------------------- store

test('store: atomic save and load of history, events and state; corrupt files moved aside', async () => {
  const dir = tmpDir();
  const logs = [];
  const store = createStore({ dir: path.join(dir, 'data'), log: (m) => logs.push(m) });
  assert.equal(store.loadHistory().missing, true);
  await store.saveHistory({ v: 1, hello: 'world' });
  await store.saveEvents({ v: 1, nextId: 2, events: [] });
  await Promise.all([store.saveState({ v: 1, a: 1 }), store.saveState({ v: 1, a: 2 })]); // serialised, last wins
  await store.flush();
  assert.deepEqual(store.loadHistory().value, { v: 1, hello: 'world' });
  assert.deepEqual(store.loadState().value, { v: 1, a: 2 });
  const files = fs.readdirSync(path.join(dir, 'data')).sort();
  assert.deepEqual(files, ['events-v1.json', 'history-v1.json.gz', 'state-v1.json']); // no temporary files left
  assert.equal(fs.statSync(path.join(dir, 'data')).mode & 0o777, 0o700);
  fs.writeFileSync(store.files.events, '{ half a file');
  const bad = store.loadEvents();
  assert.equal(bad.corrupt, true);
  assert.ok(fs.existsSync(bad.aside));
  assert.match(logs[0], /moved it to events-v1\.json\.corrupt-/);
  store.saveAllSync({ events: { v: 1, nextId: 1, events: [] } });
  assert.equal(store.loadEvents().ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('restart detection: first run, clean restart, crash, machine reboot; history survives restarts', async () => {
  const dir = tmpDir();
  const config = testConfig();
  config.persist = true;
  const mk = (bootId) => {
    const base = rootedIO();
    const io = { ...base, readText: (p) => (p === '/proc/sys/kernel/random/boot_id' ? `${bootId}\n` : base.readText(p)) };
    const store = createStore({ dir });
    return createCore({ config, io, clock: createManualClock(START), store, mode: 'live' });
  };
  const rules = (core) => core.events.list({ limit: 20 }).map((e) => `${e.rule}:${e.level}`).filter((r) => /^(core|machine)\./.test(r));
  let core = mk('boot-a');
  core.restore();
  assert.match(core.events.latest.message, /started for the first time/);
  core.runFor(5);
  await core.saveAll({ clean: true });
  core = mk('boot-a');
  core.restore();
  assert.deepEqual(rules(core).slice(0, 2), ['core.start:info', 'core.start:info']);
  assert.ok(core.history.sizes.fine >= 5);
  await core.saveAll({ clean: false }); // as if killed: the periodic save says "not clean"
  core = mk('boot-a');
  core.restore();
  assert.deepEqual(rules(core).slice(0, 2), ['core.start:info', 'core.crash:warn']);
  await core.saveAll({ clean: true });
  core = mk('boot-b');
  core.restore();
  assert.ok(rules(core).includes('machine.boot:info'));
  assert.match(core.events.list({ limit: 5 }).find((e) => e.rule === 'machine.boot').message, /^The computer restarted at \d\d:\d\d$/);
  fs.rmSync(dir, { recursive: true, force: true });
});
