// node --test: the collector on the Alienware fixture tree (two samples 1 s apart), and the pollers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollector } from '../../server/collector/collector.mjs';
import { createPollers, humanError } from '../../server/collector/pollers.mjs';
import { ROOT, NEXT, rootedIO, fixture, testConfig } from './helpers.mjs';

function twoSamples(opts = {}) {
  const io = rootedIO(opts.io);
  const c = createCollector({ io, selfPid: 1630, ...opts.collector });
  const a = c.sample(1_000_000, 0);
  c.pollMounts(1_000_000);
  io.setRoots([NEXT, ROOT]);
  const b = c.sample(1_001_000, 1000);
  return { a, b, io, c };
}

test('first sample has no rates yet; the second has them', () => {
  const { a, b } = twoSamples({ collector: { processIntervalMs: 1000 } });
  assert.equal(a.cpu.usagePct, null);
  assert.deepEqual(a.cpu.perThreadPct, new Array(8).fill(null));
  assert.equal(a.network.rxBps, null);
  assert.equal(a.disks.readBps, null);
  assert.equal(b.cpu.usagePct, 8.9);
  assert.deepEqual(b.cpu.perThreadPct, [12, 8, 17, 7, 9, 5, 8, 5]); // iowait counts as idle
  assert.equal(b.cpu.iowaitPct, 0.1);
});

test('CPU: model, topology, frequency, load and coretemp sensors', () => {
  const { b } = twoSamples();
  assert.equal(b.cpu.model, 'Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz');
  assert.equal(b.cpu.cores, 4);
  assert.equal(b.cpu.threads, 8);
  assert.equal(b.cpu.freqMHz, 1778); // average of the 8 scaling_cur_freq values
  assert.equal(b.cpu.freqMaxMHz, 4000);
  assert.deepEqual(b.cpu.load, [0.42, 0.51, 0.47]);
  assert.deepEqual(b.cpu.temp, { available: true, packageC: 45, coresC: [43, 44, 42, 45], maxC: 45, highC: 84, critC: 100, source: 'coretemp' });
});

test('memory, disks, network and host facts', () => {
  const { b } = twoSamples();
  assert.equal(b.memory.usedPct, 32.8);
  assert.equal(b.memory.totalBytes, 16303860 * 1024);
  assert.equal(b.disks.readBps, 96 * 512);
  assert.equal(b.disks.writeBps, 1184 * 512);
  assert.deepEqual(b.disks.devices.map((d) => [d.name, d.model, d.sizeBytes, d.rotational]), [['sda', 'ST1000DM003-1SB1', 1000204886016, true]]);
  assert.equal(b.disks.devices[0].busyPct, 1.8);
  assert.deepEqual(b.disks.mounts.map((m) => [m.mount, m.fs, m.disk]), [['/', 'ext4', 'sda'], ['/boot/efi', 'vfat', 'sda']]);
  assert.equal(b.disks.mounts[0].usedPct, 49.5); // df: used / (used + available)
  assert.deepEqual([b.network.interface, b.network.kind, b.network.operstate, b.network.speedMbps, b.network.gateway], ['enp3s0', 'ethernet', 'up', 1000, '192.168.1.1']);
  assert.equal(b.network.rxBps, 1284331);
  assert.equal(b.network.txBps, 48212);
  assert.equal(b.network.tailscaleInterface, true);
  assert.deepEqual([b.host.hostname, b.host.os, b.host.kernel, b.host.bootTime, b.host.uptimeSec], ['alienware', 'Ubuntu 24.04.5 LTS', '6.14.0-37-generic', 1795896217000, 274713]);
  assert.deepEqual(b.gpuHints.pci.map((g) => g.name).sort(), ['Intel HD Graphics 530', 'NVIDIA GeForce GTX 970']);
});

test('processes: CPU from two scans, friendly labels, kernel threads not in the memory list', () => {
  const { a, b } = twoSamples({ collector: { processIntervalMs: 1000 } });
  assert.deepEqual(a.processes.topCpu, []); // needs two scans
  assert.equal(b.processes.total, 18);
  const top = b.processes.topCpu;
  assert.deepEqual(top.map((p) => [p.pid, p.label, p.threadPct]), [
    [1771, 'Dashboard (Chrome)', 22],
    [1188, 'GNOME Shell', 12],
    [1745, 'Dashboard (Chrome GPU)', 9],
    [1702, 'Dashboard (Chrome)', 5],
    [1243, 'Xwayland', 4],
  ]);
  assert.equal(top[0].cpuPct, 2.8); // 22 % of one thread on an 8-thread CPU
  assert.equal(b.processes.topMem[0].label, 'GNOME Shell');
  assert.equal(b.processes.topMem[0].memBytes, 107520 * 4096);
  assert.ok(b.processes.topMem.every((p) => !['kthreadd', 'kswapd0'].includes(p.name)));
  const node = createCollector({ io: rootedIO(), selfPid: 1630, topN: 10 });
  node.sample(0, 0);
  const s2 = node.sample(2000, 2000);
  assert.ok(s2.processes.topMem.some((p) => p.pid === 1630 && p.label === 'Jarvis Core'));
});

test('the process table is scanned at most every processIntervalMs', () => {
  const io = rootedIO();
  let reads = 0;
  const counting = { ...io, readText: (p) => ((/^\/proc\/\d+\/stat$/.test(p) && (reads += 1)), io.readText(p)) };
  const c = createCollector({ io: counting, processIntervalMs: 2000 });
  c.sample(0, 0);
  const afterFirst = reads;
  c.sample(1000, 1000);
  assert.equal(reads, afterFirst);
  c.sample(2000, 2000);
  assert.equal(reads, afterFirst * 2);
});

test('missing sensors and cpufreq are reported as unavailable, never invented', () => {
  const io = rootedIO();
  const bare = { ...io, readText: (p) => (p.startsWith('/sys/') ? null : io.readText(p)), listDir: (p) => (p.startsWith('/sys/') ? [] : io.listDir(p)) };
  const c = createCollector({ io: bare });
  const s = c.sample(0, 0);
  assert.equal(s.cpu.temp.available, false);
  assert.equal(s.cpu.temp.packageC, null);
  assert.equal(s.cpu.freqMHz, Math.round((800.012 + 3700.034 + 799.987 + 1213.431 + 800.002 + 3699.871 + 800.091 + 2408.843) / 8)); // /proc/cpuinfo fallback
  assert.equal(s.network.speedMbps, null);
  assert.deepEqual(s.gpuHints.pci, []);
  assert.equal(s.disks.devices[0].model, null);
});

// ------------------------------------------------------------------------------------------------- pollers

function pollerHarness({ run, http, dns, config: over = {} } = {}) {
  const config = Object.assign(testConfig(), over);
  const calls = [];
  let now = 5_000_000;
  const io = {
    run: (cmd, args, opts) => {
      calls.push([cmd, ...args].join(' '));
      return run ? run(cmd, args, opts) : { ok: false, error: 'ENOENT', stdout: '', stderr: '' };
    },
    httpRequest: (url, opts) => {
      calls.push(`${opts.method} ${url}${opts.headers?.['If-None-Match'] ? ` if-none-match ${opts.headers['If-None-Match']}` : ''}`);
      return http ? http(url, opts) : { ok: false, error: 'ECONNREFUSED', ms: 1 };
    },
    dnsLookup: (host) => (dns ? dns(host) : { ok: true, ms: 7, address: '1.1.1.1' }),
  };
  const collector = { pollMounts: () => [] };
  const p = createPollers({ io, config, collector, now: () => now });
  return { p, calls, setNow: (v) => (now = v), config };
}

test('GPU: nvidia-smi parsed, never two at once, backs off when the driver is missing', async () => {
  let resolveRun;
  const h = pollerHarness({ run: (cmd) => (cmd === 'nvidia-smi' ? new Promise((r) => (resolveRun = r)) : { ok: false, error: 'ENOENT' }) });
  h.p.tick(0);
  h.p.tick(2000); // still waiting: no second nvidia-smi
  assert.equal(h.calls.filter((c) => c.startsWith('nvidia-smi')).length, 1);
  assert.equal(h.p.state.gpu.status, 'pending');
  resolveRun({ ok: true, stdout: fixture('nvidia-smi/gtx970-idle.csv'), stderr: '' });
  await new Promise((r) => setImmediate(r));
  assert.equal(h.p.state.gpu.status, 'ok');
  assert.equal(h.p.state.gpu.gpus[0].tempC, 41);

  const missing = pollerHarness();
  missing.p.tick(0);
  assert.equal(missing.p.state.gpu.status, 'not-installed');
  missing.p.tick(30_000);
  assert.equal(missing.calls.filter((c) => c.startsWith('nvidia-smi')).length, 1); // backs off 60 s
  missing.p.tick(60_000);
  assert.equal(missing.calls.filter((c) => c.startsWith('nvidia-smi')).length, 2);
  assert.equal(missing.p.state.gpu.errors, 2);

  const failed = pollerHarness({ run: (cmd) => (cmd === 'nvidia-smi' ? { ok: false, code: 9, error: 'exit 9', stdout: fixture('nvidia-smi/driver-failed.txt'), stderr: '' } : { ok: false, error: 'ENOENT' }) });
  failed.p.tick(0);
  assert.equal(failed.p.state.gpu.status, 'driver-not-loaded');
});

const okHttp = (url, opts) => {
  if (url.endsWith('/sw.js')) return opts.headers?.['If-None-Match'] === '"e1"' ? { ok: true, status: 304, ms: 40, headers: { etag: '"e1"' } } : { ok: true, status: 200, ms: 50, headers: { etag: '"e1"' }, text: fixture('site/sw.js') };
  if (url.includes('anthropic')) return { ok: true, status: 404, ms: 80 };
  return { ok: true, status: 301, ms: 20 };
};

test('services: internet, Claude API, site build (conditional GET), Tailscale and serve', () => {
  const h = pollerHarness({
    http: okHttp,
    run: (cmd, args) => {
      if (cmd === 'tailscale' && args[0] === 'status') return { ok: true, stdout: fixture('tailscale/status-running.json') };
      if (cmd === 'tailscale' && args[0] === 'serve') return { ok: true, stdout: fixture('tailscale/serve-status.json') };
      return { ok: false, error: 'ENOENT' };
    },
  });
  h.p.tick(0);
  const sv = h.p.state.services;
  assert.equal(sv.rev, 1);
  assert.deepEqual([sv.internet.status, sv.internet.latencyMs, sv.internet.dnsMs], ['up', 20, 7]);
  assert.deepEqual([sv.api.status, sv.api.latencyMs, sv.api.httpStatus], ['up', 80, 404]);
  assert.deepEqual([sv.site.status, sv.site.buildId], ['up', '5f3c9e1a']);
  assert.deepEqual([sv.tailscale.status, sv.tailscale.online, sv.tailscale.serve], ['running', 1, true]);
  assert.ok(h.calls.includes('HEAD https://1.1.1.1/'));
  assert.ok(h.calls.includes('HEAD https://api.anthropic.com/'));
  h.p.tick(10_000);
  assert.equal(sv.rev, 1); // every 30 s
  h.p.tick(30_000);
  assert.equal(sv.rev, 2);
  assert.ok(h.calls.some((c) => c.includes('sw.js if-none-match "e1"')));
  assert.equal(sv.site.buildId, '5f3c9e1a'); // kept on 304
  assert.equal(h.calls.filter((c) => c.startsWith('tailscale serve')).length, 1); // every 5 minutes
});

test('internet: falls back to 8.8.8.8, counts failures, and trusts other sites that answered', () => {
  const down = pollerHarness({ http: () => ({ ok: false, error: 'ENETUNREACH', ms: 2 }), dns: () => ({ ok: false, ms: 3000, error: 'ETIMEOUT' }) });
  down.p.tick(0);
  down.p.tick(30_000);
  const i = down.p.state.services.internet;
  assert.equal(i.status, 'down');
  assert.equal(i.failures, 2);
  assert.equal(i.detail, 'no DNS and no answer from the internet');
  assert.ok(down.calls.includes('HEAD https://8.8.8.8/'));
  assert.equal(down.p.state.services.api.detail, 'no network route');

  // 1.1.1.1 blocked or intercepted, but the API answered in the same round
  const blocked = pollerHarness({ http: (url, opts) => (url.includes('1.1.1.1') || url.includes('8.8.8.8') ? { ok: false, error: 'ERR_TLS_CERT_ALTNAME_INVALID', ms: 5 } : okHttp(url, opts)) });
  blocked.p.tick(0);
  const b = blocked.p.state.services.internet;
  assert.deepEqual([b.status, b.latencyMs, b.failures], ['up', 50, 0]);
  assert.match(b.detail, /did not answer \(a security certificate problem\), but other sites did/);
  assert.equal(humanError('TIMEOUT'), 'not answering');
});

test('Tailscale: not installed backs off to 5 minutes; logged-out counts failures', () => {
  const h = pollerHarness({ http: okHttp });
  h.p.tick(0);
  assert.equal(h.p.state.services.tailscale.status, 'not-installed');
  h.p.tick(30_000);
  h.p.tick(60_000);
  assert.equal(h.calls.filter((c) => c.startsWith('tailscale')).length, 1);
  h.p.tick(300_000);
  assert.equal(h.calls.filter((c) => c.startsWith('tailscale')).length, 2);

  const out = pollerHarness({ http: okHttp, run: (cmd) => (cmd === 'tailscale' ? { ok: true, stdout: fixture('tailscale/status-needslogin.json') } : { ok: false, error: 'ENOENT' }) });
  out.p.tick(0);
  out.p.tick(30_000);
  assert.deepEqual([out.p.state.services.tailscale.status, out.p.state.services.tailscale.failures], ['logged-out', 2]);
});

test('SMART: passed; denied then sudo -n refused → not checked (and asked again only after 24 h)', () => {
  const ok = pollerHarness({ run: (cmd) => (cmd === 'smartctl' ? { ok: true, stdout: fixture('smartctl/sda-passed.json') } : { ok: false, error: 'ENOENT' }) });
  ok.p.tick(0, { disks: ['sda'] });
  assert.equal(ok.p.state.smart.status, 'ok');
  assert.equal(ok.p.state.smart.devices[0].powerOnHours, 42211);

  const denied = pollerHarness({
    run: (cmd) => {
      if (cmd === 'smartctl') return { ok: false, code: 2, error: 'exit 2', stdout: fixture('smartctl/sda-permission-denied.json') };
      if (cmd === 'sudo') return { ok: false, code: 1, error: 'exit 1', stdout: '', stderr: 'sudo: a password is required\n' };
      return { ok: false, error: 'ENOENT' };
    },
  });
  denied.p.tick(0, { disks: ['sda'] });
  assert.equal(denied.p.state.smart.status, 'not-checked');
  assert.match(denied.p.state.smart.detail, /needs permission/);
  assert.ok(denied.calls.includes('sudo -n smartctl -j -H -A -i /dev/sda'));
  denied.p.tick(23 * 3600_000, { disks: ['sda'] });
  assert.equal(denied.calls.filter((c) => c.startsWith('smartctl')).length, 1);

  const worn = pollerHarness({ run: (cmd) => (cmd === 'smartctl' ? { ok: true, stdout: fixture('smartctl/sda-reallocated.json') } : { ok: false, error: 'ENOENT' }) });
  worn.p.tick(0, { disks: ['sda'] });
  assert.equal(worn.p.state.smart.status, 'warning');
  assert.equal(worn.p.state.smart.detail, 'sda: 8 reallocated sectors, 16 pending sectors');

  const none = pollerHarness();
  none.p.tick(0, { disks: ['sda'] });
  assert.equal(none.p.state.smart.detail, 'smartctl is not installed');
});
