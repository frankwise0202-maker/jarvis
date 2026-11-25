// Unit tests for app/model.js (the adapter from the Core's JSON to the panels).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyTick,
  historyPoints,
  level,
  mergeSnapshot,
  meterLevel,
  normalize,
  parseEvents,
  peerLabel,
  readInfo,
  shortCpuName,
  smartStatus,
  sortPeers,
  stateWord,
  subsystemOf,
} from '../app/model.js';
import { compactOf, makeEvents, makeHistory, makeStatus } from './fixtures.mjs';

const T = Date.parse('2026-11-25T21:47:00Z');

test('the Core snapshot normalizes with real numbers in the right units', () => {
  const vm = normalize(makeStatus('ok', T), { version: '1.0.0' });
  assert.equal(vm.host.name, 'alienware');
  assert.equal(vm.uptimeS, 3 * 86400 + 4 * 3600 + 12 * 60);
  assert.equal(vm.cpu.threads, 8);
  assert.equal(vm.cpu.perThread.length, 8);
  assert.ok(vm.cpu.usage > 0 && vm.cpu.usage < 30);
  assert.equal(typeof vm.cpu.temp, 'number');
  assert.equal(vm.cpu.tempCores.length, 4);
  assert.deepEqual(vm.cpu.load, [0.42, 0.38, 0.31]);
  assert.ok(vm.mem.usedPct > 30 && vm.mem.usedPct < 45);
  assert.equal(vm.mem.swapTotal, 2 * 1024 ** 3);
  assert.equal(vm.gpu.state, 'ok');
  assert.equal(vm.gpu.memTotal, 4096 * 1024 * 1024, 'VRAM MiB become bytes');
  assert.equal(vm.gpu.powerLimit, 163);
  assert.equal(vm.disks.length, 1);
  assert.equal(vm.disks[0].mount, '/');
  assert.equal(vm.drive.model, 'ST1000DM003-1SB102');
  assert.equal(vm.drive.rotational, true);
  assert.equal(vm.io.writeBps > 0, true);
  assert.equal(vm.diskHealth.status, 'passed');
  assert.equal(vm.net.iface, 'enp0s31f6');
  assert.equal(vm.net.kind, 'ethernet');
  assert.equal(vm.internet.ok, true);
  assert.equal(vm.api.ok, true);
  assert.equal(vm.site.build, 'v7.4-cfff39d');
  assert.equal(vm.tailscale.status, 'running');
  assert.equal(vm.tailscale.peers.length, 2);
  assert.equal(vm.tailscale.peers[0].kind, 'iPhone');
  assert.equal(vm.tailscale.online, 2);
  assert.equal(vm.procs.byCpu[0].name, 'Dashboard (Chrome)', 'the Core\'s friendly label wins');
  assert.equal(vm.core.version, '1.0.0');
  assert.equal(vm.health.level, 'ok');
  assert.equal(vm.health.summary, 'All systems normal');
  assert.deepEqual(Object.values(vm.levels).filter((l) => l !== 'ok'), []);
});

test('a compact tick merged into the last status keeps services and health items', () => {
  const full = makeStatus('warn', T);
  const tick = compactOf(makeStatus('warn', T + 1000));
  assert.equal(tick.services, undefined);
  assert.equal(tick.health.items, undefined);
  const vm = normalize(mergeSnapshot(full, tick));
  assert.equal(vm.t, T + 1000);
  assert.equal(vm.internet.ok, true, 'services kept from the full status');
  assert.ok(vm.health.items.length > 5, 'health items kept from the full status');
  assert.equal(vm.health.level, 'warn');
  // A tick alone (before any full status) still draws, with counts for the state word.
  const alone = normalize(tick);
  assert.equal(alone.health.items.length, 0);
  assert.equal(stateWord(alone, true).detail, '4 WARNINGS');
});

test('nothing is invented: missing values stay null', () => {
  const vm = normalize({});
  assert.equal(vm.cpu.usage, null);
  assert.equal(vm.cpu.temp, null);
  assert.deepEqual(vm.cpu.perThread, []);
  assert.equal(vm.mem.usedPct, null);
  assert.equal(vm.gpu.state, 'unknown');
  assert.deepEqual(vm.disks, []);
  assert.equal(vm.drive, null);
  assert.equal(vm.diskHealth.status, 'not-checked');
  assert.equal(vm.internet.ok, null);
  assert.equal(vm.tailscale.status, null);
  assert.equal(vm.health.level, 'ok');
  // Odd values do not turn into numbers either.
  const odd = normalize({ cpu: { usagePct: 'N/A', temp: { available: false, packageC: 50 }, perThreadPct: [null, 'x', 50] }, memory: { totalBytes: 'lots' } });
  assert.equal(odd.cpu.usage, null);
  assert.equal(odd.cpu.temp, null, 'a sensor the Core calls unavailable is not read');
  assert.deepEqual(odd.cpu.perThread, [null, null, 50]);
  assert.equal(odd.mem.total, null);
  // Services the Core has not checked yet.
  const unchecked = normalize({ services: { internet: { status: 'unknown', detail: 'not checked yet' } } });
  assert.equal(unchecked.internet.ok, null);
});

test('the GPU: a missing driver is its own state, other failures are reading errors', () => {
  const nogpu = normalize(makeStatus('nogpu', T)).gpu;
  assert.equal(nogpu.state, 'nodriver');
  assert.equal(nogpu.name, 'NVIDIA GeForce GTX 970', 'the card is still named (from PCI)');
  for (const status of ['not-installed', 'driver-not-loaded', 'no-device']) assert.equal(normalize({ gpu: { status, available: false } }).gpu.state, 'nodriver', status);
  assert.equal(normalize({ gpu: { status: 'pending', available: false } }).gpu.state, 'pending');
  assert.equal(normalize({ gpu: { status: 'error', available: false, detail: 'nvidia-smi did not answer in time' } }).gpu.state, 'error');
  assert.deepEqual(normalize({ gpu: { status: 'driver-not-loaded', available: false, tempC: 41, tempSource: 'nouveau' } }).gpu.fallbackTemp, { temp: 41, source: 'nouveau' });
  assert.equal(normalize({ gpu: { available: false } }).gpu.state, 'nodriver');
  assert.equal(normalize({ gpu: { available: false, reason: 'NVIDIA-SMI has failed because it couldn’t communicate with the NVIDIA driver' } }).gpu.state, 'nodriver');
  assert.equal(normalize({ gpu: { available: false, reason: 'timed out after 1500 ms' } }).gpu.state, 'error');
  const ok = normalize({ gpu: { status: 'ok', available: true, utilPct: '41', tempC: '62', memUsedMB: 1024, memTotalMB: 4096 } }).gpu;
  assert.equal(ok.state, 'ok');
  assert.equal(ok.util, 41);
  assert.equal(ok.temp, 62);
  assert.equal(ok.memPct, 25);
});

test('health items set the level of their subsystem; the worst wins overall', () => {
  const vm = normalize(makeStatus('alert', T));
  assert.equal(vm.health.level, 'alert');
  assert.equal(vm.levels.cpu, 'alert');
  assert.equal(vm.levels.disk, 'alert');
  assert.equal(vm.levels.mem, 'alert');
  assert.equal(vm.levels.api, 'warn');
  assert.equal(vm.levels.net, 'ok');
  assert.equal(vm.levels.gpu, 'ok');
  assert.equal(normalize(makeStatus('offline', T)).levels.net, 'alert');
  // Each item's own level, for the value it is about (the CPU temperature, the root filesystem).
  assert.equal(vm.itemLevels['cpu.temp'], 'alert');
  assert.equal(vm.itemLevels['disk:/'], 'alert');
  assert.equal(vm.itemLevels.memory, 'alert');
  assert.equal(vm.itemLevels['cpu.load'], 'ok');
  assert.equal(normalize(makeStatus('warn', T)).itemLevels['disk.health'], 'warn');
  // An item can raise the overall level even when the Core's own level lags.
  const lag = normalize({ health: { level: 'ok', items: [{ id: 'disk:/', level: 'warn', title: 'x' }] } });
  assert.equal(lag.health.level, 'warn');
  assert.equal(subsystemOf('cpu.temp'), 'cpu');
  assert.equal(subsystemOf('swap.heavy'), 'mem');
  assert.equal(subsystemOf('smart:/dev/sda'), 'disk');
  assert.equal(subsystemOf('internet'), 'net');
  assert.equal(subsystemOf('tailscale.loggedout'), 'tailscale');
  assert.equal(subsystemOf('weird'), 'other');
});

test('level words and the state word', () => {
  assert.equal(level('warning'), 'warn');
  assert.equal(level('CRITICAL'), 'alert');
  assert.equal(level('nominal'), 'ok');
  assert.equal(level('?', 'warn'), 'warn');
  assert.deepEqual(stateWord(normalize(makeStatus('ok', T)), true), { word: 'NOMINAL', detail: 'ALL SYSTEMS', level: 'ok' });
  assert.deepEqual(stateWord(normalize(makeStatus('warn', T)), true), { word: 'CAUTION', detail: '4 WARNINGS', level: 'warn' });
  assert.equal(stateWord(normalize(makeStatus('alert', T)), true).word, 'ALERT');
  assert.equal(stateWord(normalize(makeStatus('ok', T)), false).word, 'OFFLINE');
});

test('meter colors follow the brief thresholds', () => {
  assert.equal(meterLevel('disk', 84.9), 'ok');
  assert.equal(meterLevel('disk', 85), 'warn');
  assert.equal(meterLevel('disk', 95), 'alert');
  assert.equal(meterLevel('memAvail', 9), 'warn');
  assert.equal(meterLevel('cpuTemp', 90), 'alert');
  assert.equal(meterLevel('gpuTemp', 88), 'alert');
  assert.equal(meterLevel('gpuTemp', null), 'ok');
});

test('stream snapshots merge into the last full status', () => {
  const base = { cpu: { usage: 10, model: 'i7' }, procs: { byCpu: [1, 2] }, health: { level: 'ok', items: [] } };
  const next = mergeSnapshot(base, { cpu: { usage: 55 }, health: { level: 'warn', items: [{ id: 'cpu.temp', level: 'warn', title: 'hot' }] } });
  assert.equal(next.cpu.usage, 55);
  assert.equal(next.cpu.model, 'i7', 'fields the snapshot leaves out are kept');
  assert.deepEqual(next.procs.byCpu, [1, 2]);
  assert.equal(next.health.items.length, 1, 'arrays replace, never concatenate');
  assert.equal(base.cpu.usage, 10, 'the inputs are not changed');
  assert.equal(mergeSnapshot(null, { a: 1 }).a, 1);
});

test('SMART words', () => {
  assert.equal(smartStatus('PASSED'), 'passed');
  assert.equal(smartStatus('ok'), 'passed');
  assert.equal(smartStatus('warning'), 'warning');
  assert.equal(smartStatus('failing'), 'failed');
  assert.equal(normalize(makeStatus('warn', T)).diskHealth.status, 'warning');
  assert.equal(normalize(makeStatus('nogpu', T)).diskHealth.status, 'not-checked');
  assert.match(normalize(makeStatus('nogpu', T)).diskHealth.detail, /permission/);
  assert.equal(smartStatus('not checked'), 'not-checked');
  assert.equal(smartStatus(''), 'not-checked');
  assert.equal(smartStatus('FAILED!'), 'failed');
  assert.equal(smartStatus(true), 'passed');
  assert.equal(smartStatus('weird'), 'unknown');
  assert.equal(normalize({ disks: { health: { devices: [{ name: 'sda', passed: true }, { name: 'sdb', passed: false }] } } }).diskHealth.status, 'failed');
});

test('events in any reasonable shape', () => {
  const list = parseEvents({ events: makeEvents('warn', T) });
  assert.ok(list.length >= 6);
  assert.ok(list.every((e) => e.title && typeof e.t === 'number' && ['ok', 'warn', 'alert'].includes(e.level)));
  assert.deepEqual(
    [...new Set(list.map((e) => e.word))].sort(),
    ['ALERT', 'INFO', 'OK', 'WARN'],
    'info, recovered, warning and alert entries keep their own words',
  );
  assert.equal(typeof list[0].id, 'string');
  assert.equal(parseEvents([{ ts: '2026-11-25T21:00:00Z', severity: 'critical', message: 'Disk full' }])[0].level, 'alert');
  assert.equal(parseEvents({ title: 'one pushed event', level: 'warn', t: T }).length, 1);
  assert.deepEqual(parseEvents(null), []);
  assert.deepEqual(parseEvents([{ level: 'warn' }]), [], 'an event without words is dropped');
});

test('history points from every layout', () => {
  const cols = makeHistory('ok', T, 5);
  const pts = historyPoints(cols, 'cpu');
  assert.equal(pts.length, 5);
  assert.equal(pts[4][0], T);
  assert.equal(historyPoints(cols, 'ram').length, 5, 'the Core\'s names: ram, netRx, netTx');
  assert.equal(historyPoints(cols, 'netRx').length, 5);
  assert.equal(historyPoints(cols, 'mem').length, 5, 'aliases still work');
  assert.equal(historyPoints({ series: { cpu: [[T - 1000, 5], [T, 6]] } }, 'cpu')[1][1], 6);
  assert.equal(historyPoints({ series: { ram: [{ t: T, v: 40 }] } }, 'ram')[0][1], 40);
  assert.equal(historyPoints({ series: { netRx: { t0: T - 2000, step: 1000, values: [1, 2, 3] } } }, 'netRx')[2][0], T);
  assert.equal(historyPoints({ t: [T - 1000, T], cpu: [1, 2] }, 'cpu').length, 2);
  assert.equal(historyPoints({ points: [{ t: T, netTx: 9 }] }, 'netTx')[0][1], 9);
  assert.equal(historyPoints({ series: { cpu: [[T, null]] } }, 'cpu')[0][1], null, 'gaps stay gaps');
  assert.deepEqual(historyPoints({}, 'cpu'), []);
  assert.deepEqual(historyPoints('nope', 'cpu'), []);
});

test('names: CPU model, tailnet peers', () => {
  assert.equal(shortCpuName('Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz'), 'Intel Core i7-6700');
  assert.equal(peerLabel({ name: 'franks-iphone.tail4b2c1.ts.net.' }), 'franks-iphone');
  const sorted = sortPeers([
    { name: 'b', online: false },
    { name: 'a', online: true },
    { name: 'me', online: true, self: true },
  ]);
  assert.deepEqual(sorted.map((p) => p.name), ['me', 'a', 'b']);
});

test('a stream tick replaces sections wholesale but keeps health items and services', () => {
  const base = makeStatus('warn', T);
  const tick = compactOf(makeStatus('ok', T + 1000));
  const next = applyTick(base, tick);
  assert.equal(next.t, T + 1000);
  assert.equal(next.cpu, tick.cpu, 'a section is replaced, not merged');
  assert.deepEqual(next.services, base.services);
  assert.equal(next.health.level, 'ok');
  assert.equal(next.health.items, base.health.items, 'items wait for the next full status');
  assert.equal(applyTick(base, null), base);
  assert.deepEqual(applyTick(null, { t: 1, health: { level: 'ok' } }), { t: 1, health: { level: 'ok' } });
});

test('the Core\'s /api/info gives the version, time zone and kiosk settings', () => {
  const info = {
    version: '1.0.0',
    mode: 'fixture',
    timeZone: 'America/Chicago',
    ownerName: 'Frank',
    night: { enabled: true, start: '22:30', end: '06:30' },
    urls: { local: 'http://localhost:8788/', tailscale: 'https://alienware.tail4e5f6a.ts.net/', app: 'https://frankwise0202-maker.github.io/jarvis/' },
  };
  const r = readInfo(info);
  assert.equal(r.version, '1.0.0');
  assert.equal(r.timeZone, 'America/Chicago');
  assert.equal(r.url, 'https://alienware.tail4e5f6a.ts.net/');
  assert.deepEqual(r.config.nightDim, { start: '22:30', end: '06:30' });
  assert.equal(r.config.jarvisUrl, 'https://frankwise0202-maker.github.io/jarvis/');
  assert.equal(readInfo({ night: { enabled: false } }).config.nightDim, 'off');
  assert.deepEqual(readInfo(null).config, {});
});
