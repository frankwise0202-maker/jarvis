// node --test: parsers for /proc, /sys, nvidia-smi, tailscale, smartctl and sw.js, on real-format fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as P from '../../server/collector/parse.mjs';
import { ROOT, NEXT, fixture } from './helpers.mjs';

const root = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const next = (rel) => fs.readFileSync(path.join(NEXT, rel), 'utf8');

test('/proc/stat: totals, 8 threads, boot time; usage between two samples', () => {
  const a = P.parseProcStat(root('proc/stat'));
  const b = P.parseProcStat(next('proc/stat'));
  assert.equal(a.threads.length, 8);
  assert.deepEqual(a.threads.map((t) => t.id), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(a.btime, 1795896217);
  assert.equal(a.procsRunning, 2);
  // the cpu line is the sum of the per-thread lines
  assert.equal(a.cpu.user, a.threads.reduce((s, t) => s + t.user, 0));
  const u = P.cpuUsage(a.cpu, b.cpu);
  assert.ok(Math.abs(u.usagePct - 8.875) < 0.01, `usage ${u.usagePct}`); // 71 busy ticks of 800
  assert.ok(Math.abs(u.iowaitPct - 0.125) < 0.01);
  const t2 = P.cpuUsage(a.threads[2], b.threads[2]);
  assert.equal(Math.round(t2.usagePct), 17); // thread 2: 12 user + 4 system + 1 softirq of 100
  // no time passed, or a counter went backwards (CPU hot-unplug): no reading rather than a wrong one
  assert.equal(P.cpuUsage(a.cpu, a.cpu), null);
  assert.equal(P.cpuUsage(b.cpu, a.cpu), null);
  assert.equal(P.cpuUsage(null, a.cpu), null);
});

test('/proc/loadavg, /proc/uptime', () => {
  assert.deepEqual(P.parseLoadavg('0.42 0.51 0.47 2/1187 98321\n'), { load1: 0.42, load5: 0.51, load15: 0.47, running: 2, total: 1187 });
  assert.deepEqual(P.parseUptime('274712.81 2087111.06\n'), { uptimeSec: 274712.81, idleSec: 2087111.06 });
  assert.equal(P.parseLoadavg(''), null);
  assert.equal(P.parseUptime('garbage'), null);
});

test('/proc/meminfo: bytes and a GNOME-style summary; old kernels without MemAvailable', () => {
  const mi = P.parseMeminfo(root('proc/meminfo'));
  assert.equal(mi.totalBytes, 16303860 * 1024);
  assert.equal(mi.availableBytes, 10956212 * 1024);
  assert.equal(mi.swapTotalBytes, 4194300 * 1024);
  const m = P.memorySummary(mi);
  assert.equal(m.usedBytes, (16303860 - 10956212) * 1024);
  assert.ok(Math.abs(m.usedPct - 32.8) < 0.05);
  assert.equal(m.swap.usedPct, 0);
  const old = P.memorySummary(P.parseMeminfo('MemTotal: 1000 kB\nMemFree: 100 kB\nBuffers: 50 kB\nCached: 150 kB\n'));
  assert.equal(old.availableBytes, 300 * 1024);
  const noSwap = P.memorySummary(P.parseMeminfo('MemTotal: 1000 kB\nMemAvailable: 500 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n'));
  assert.equal(noSwap.swap.usedPct, null);
  assert.equal(P.memorySummary(P.parseMeminfo('')), null);
});

test('/proc/cpuinfo: model, 4 cores and 8 threads of the i7-6700', () => {
  const c = P.parseCpuinfo(root('proc/cpuinfo'));
  assert.equal(c.model, 'Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz');
  assert.equal(c.threads, 8);
  assert.equal(c.cores, 4);
  assert.equal(c.sockets, 1);
  assert.equal(c.mhz.length, 8);
  assert.equal(c.mhz[1], 3700.034);
});

test('/proc/diskstats: whole disks only, partitions mapped to their disk, older formats', () => {
  const rows = P.parseDiskstats(root('proc/diskstats'));
  assert.ok(rows.length >= 15);
  const whole = rows.filter((r) => P.isWholeDisk(r.name)).map((r) => r.name);
  assert.deepEqual(whole, ['sda']); // loops, partitions and the DVD drive are left out
  const sda = rows.find((r) => r.name === 'sda');
  assert.equal(sda.sectorsRead, 61234872);
  assert.equal(sda.msIo, 2812334);
  for (const [name, disk] of [['sda2', 'sda'], ['nvme0n1p2', 'nvme0n1'], ['mmcblk0p1', 'mmcblk0'], ['vda1', 'vda'], ['sda', 'sda'], ['dm-0', 'dm-0']]) assert.equal(P.parentDisk(name), disk);
  for (const n of ['nvme0n1', 'vda', 'mmcblk0', 'xvda']) assert.ok(P.isWholeDisk(n), n);
  for (const n of ['loop0', 'sda1', 'nvme0n1p1', 'sr0', 'dm-0', 'zram0', 'ram0']) assert.ok(!P.isWholeDisk(n), n);
  // kernel 4.x: 14 fields
  const old = P.parseDiskstats('   8       0 sda 1 2 3 4 5 6 7 8 9 10 11\n');
  assert.equal(old[0].msIo, 10);
});

test('mounts: real filesystems only, "/" first, bind mounts and octal escapes', () => {
  const mounts = P.parseMounts(root('proc/self/mounts'));
  const real = P.realMounts(mounts);
  assert.deepEqual(real.map((m) => m.mount), ['/', '/boot/efi']);
  assert.equal(real[0].device, '/dev/sda2');
  const extra = P.parseMounts('/dev/sdb1 /media/owner/Backup\\040Drive exfat rw 0 0\n/dev/sda2 /var/lib/docker/overlay ext4 rw 0 0\n/dev/sda2 /mnt/bind ext4 rw 0 0\n/dev/sda2 / ext4 rw 0 0\n');
  assert.equal(extra[0].mount, '/media/owner/Backup Drive');
  assert.deepEqual(P.realMounts(extra).map((m) => m.mount), ['/', '/media/owner/Backup Drive']);
});

test('statfs usage follows df: used / (used + available to users)', () => {
  const u = P.statfsUsage({ bsize: 4096, blocks: 1000, bfree: 300, bavail: 250 });
  assert.equal(u.totalBytes, 4096000);
  assert.equal(u.usedBytes, 700 * 4096);
  assert.equal(u.freeBytes, 250 * 4096);
  assert.ok(Math.abs(u.usedPct - (700 / 950) * 100) < 1e-9);
  assert.equal(P.statfsUsage(null), null);
  assert.equal(P.statfsUsage({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 }), null);
});

test('/proc/net/dev and the default route', () => {
  const devs = P.parseNetDev(root('proc/net/dev'));
  assert.deepEqual(devs.map((d) => d.iface), ['lo', 'enp3s0', 'wlp2s0', 'tailscale0']);
  const e = devs.find((d) => d.iface === 'enp3s0');
  assert.equal(e.rxBytes, 18442117320);
  assert.equal(e.txBytes, 2331877410);
  // big counters glued to the colon
  assert.equal(P.parseNetDev('  eth0:2970927    6230    0    0    0     0          0         0 52244687    6661    0    0    0     0       0          0')[0].rxBytes, 2970927);
  const route = P.parseDefaultRoute(root('proc/net/route'));
  assert.deepEqual(route, { iface: 'enp3s0', gateway: '192.168.1.1', metric: 100 });
  assert.equal(P.hexToIPv4('0101A8C0'), '192.168.1.1');
  assert.equal(P.hexToIPv4('nope'), null);
  assert.equal(P.parseDefaultRoute('Iface\tDestination\n'), null);
  assert.equal(P.ifaceKind('enp3s0'), 'ethernet');
  assert.equal(P.ifaceKind('wlp2s0'), 'wifi');
  assert.equal(P.ifaceKind('tailscale0'), 'vpn');
});

test('/proc/[pid]/stat: names with spaces and brackets, kernel threads; statm', () => {
  const s = P.parsePidStat(root('proc/1771/stat'));
  assert.equal(s.pid, 1771);
  assert.equal(s.comm, 'chrome');
  assert.equal(s.utime, 288112);
  assert.equal(s.stime, 52331);
  assert.equal(s.rssPages, 87040);
  assert.equal(s.kernelThread, false);
  assert.equal(P.parsePidStat(root('proc/37/stat')).kernelThread, true);
  const odd = P.parsePidStat('42 (Web Content (x)) S 1 42 42 0 -1 4194560 1 0 0 0 7 3 0 0 20 0 5 0 100 1000 25 0');
  assert.equal(odd.comm, 'Web Content (x)');
  assert.equal(odd.utime, 7);
  assert.equal(P.parsePidStat('garbage'), null);
  assert.equal(P.parsePidStat(null), null);
  assert.deepEqual(P.parsePidStatm('715 407 379 5 0 125 0'), { sizePages: 715, residentPages: 407, sharedPages: 379, textPages: 5, dataPages: 125 });
});

test('nvidia-smi: GTX 970 idle and busy, [N/A] fields, failures', () => {
  const [idle] = P.parseNvidiaSmi(fixture('nvidia-smi/gtx970-idle.csv'));
  assert.deepEqual(idle, { name: 'NVIDIA GeForce GTX 970', driver: '580.95.05', utilPct: 3, memUsedMB: 512, memTotalMB: 4096, memPct: 12.5, tempC: 41, powerW: 15.43, powerLimitW: 151, fanPct: 22, clockMHz: 135 });
  const [busy] = P.parseNvidiaSmi(fixture('nvidia-smi/gtx970-busy.csv'));
  assert.equal(busy.utilPct, 97);
  assert.equal(busy.tempC, 79);
  const [na] = P.parseNvidiaSmi(fixture('nvidia-smi/gtx970-na.csv'));
  assert.equal(na.powerW, null);
  assert.equal(na.fanPct, null);
  assert.equal(na.tempC, 40);
  assert.deepEqual(P.parseNvidiaSmi(fixture('nvidia-smi/driver-failed.txt')), []);
  assert.equal(P.parseNvidiaSmi('NVIDIA GeForce GTX 970, [Not Supported], 1, 2, 3, 4, 5, 6, 7, 8\n')[0].driver, null);
  assert.equal(P.classifyNvidiaFailure({ error: 'ENOENT' }).status, 'not-installed');
  assert.equal(P.classifyNvidiaFailure({ error: 'exit 9', stdout: fixture('nvidia-smi/driver-failed.txt') }).status, 'driver-not-loaded');
  assert.equal(P.classifyNvidiaFailure({ error: 'exit 6', stdout: fixture('nvidia-smi/no-devices.txt') }).status, 'no-device');
  assert.equal(P.classifyNvidiaFailure({ error: 'TIMEOUT' }).status, 'error');
  assert.equal(P.NVIDIA_ARGS[0], '--query-gpu=name,driver_version,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,fan.speed,clocks.sm');
});

test('tailscale status: running with an iPhone and a Mac, logged out, stopped, daemon down', () => {
  const ts = P.parseTailscaleStatus(fixture('tailscale/status-running.json'));
  assert.equal(ts.status, 'running');
  assert.equal(ts.dnsName, 'alienware.tail4e5f6a.ts.net');
  assert.equal(ts.url, 'https://alienware.tail4e5f6a.ts.net/');
  assert.deepEqual(ts.ips, ['100.101.102.103', 'fd7a:115c:a1e0::5f01:6667']);
  assert.equal(ts.version, '1.90.6');
  assert.equal(ts.total, 2);
  assert.equal(ts.online, 1);
  const [phone, mac] = ts.peers; // online first
  assert.deepEqual([phone.name, phone.kind, phone.online, phone.lastSeen], ['iphone-15', 'iPhone', true, null]); // iOS hides its host name
  assert.deepEqual([mac.name, mac.kind, mac.online], ['franks-macbook-air', 'Mac', false]);
  assert.equal(mac.lastSeen, Date.parse('2026-11-25T13:44:09Z'));
  const out = P.parseTailscaleStatus(fixture('tailscale/status-needslogin.json'));
  assert.equal(out.status, 'logged-out');
  assert.equal(out.url, null);
  assert.equal(out.total, 0);
  assert.equal(P.parseTailscaleStatus(fixture('tailscale/status-stopped.json')).status, 'stopped');
  assert.equal(P.parseTailscaleStatus('{not json').status, 'error');
  assert.equal(P.classifyTailscaleFailure({ error: 'exit 1', stderr: fixture('tailscale/daemon-not-running.txt') }).status, 'not-running');
  assert.equal(P.classifyTailscaleFailure({ error: 'ENOENT' }).status, 'not-installed');
  assert.deepEqual(P.parseTailscaleServe(fixture('tailscale/serve-status.json'), 8788), { configured: true, target: 'http://127.0.0.1:8788' });
  assert.equal(P.parseTailscaleServe(fixture('tailscale/serve-status.json'), 9000).configured, false);
  assert.equal(P.parseTailscaleServe(fixture('tailscale/serve-empty.json')).configured, false);
  assert.equal(P.parseTailscaleServe('nope').configured, null);
});

test('smartctl JSON: passed, worn, failing, permission denied', () => {
  const ok = P.parseSmartctl(fixture('smartctl/sda-passed.json'));
  assert.deepEqual([ok.passed, ok.model, ok.reallocated, ok.pending, ok.powerOnHours, ok.tempC], [true, 'ST1000DM003-1SB102', 0, 0, 42211, 34]);
  const worn = P.parseSmartctl(fixture('smartctl/sda-reallocated.json'));
  assert.deepEqual([worn.passed, worn.reallocated, worn.pending], [true, 8, 16]);
  const bad = P.parseSmartctl(fixture('smartctl/sda-failing.json'));
  assert.equal(bad.passed, false);
  const denied = P.parseSmartctl(fixture('smartctl/sda-permission-denied.json'));
  assert.equal(denied.passed, null);
  assert.equal(denied.permissionDenied, true);
  assert.equal(P.parseSmartctl('Permission denied').permissionDenied, true);
});

test('sw.js build id and os-release', () => {
  assert.equal(P.parseSwBuildId(fixture('site/sw.js')), '5f3c9e1a');
  assert.equal(P.parseSwBuildId("const CACHE = 'jarvis-__BUILD_ID__';"), null);
  assert.equal(P.parseSwBuildId(''), null);
  assert.deepEqual(P.parseOsRelease(root('etc/os-release')), { prettyName: 'Ubuntu 24.04.5 LTS', id: 'ubuntu', versionId: '24.04' });
});

test('no parser throws on garbage', () => {
  const junk = ['', '\0\0\0', 'cpu a b c', '::::', '{', '1 2 3', '\n\n\n', 'x'.repeat(5000), null, undefined, 42];
  for (const j of junk) {
    for (const fn of [P.parseProcStat, P.parseLoadavg, P.parseUptime, P.parseMeminfo, P.parseCpuinfo, P.parseDiskstats, P.parseMounts, P.parseNetDev, P.parseDefaultRoute, P.parsePidStat, P.parsePidStatm, P.parseNvidiaSmi, P.parseTailscaleStatus, P.parseSmartctl, P.parseSwBuildId, P.parseOsRelease]) {
      assert.doesNotThrow(() => fn(j), `${fn.name}(${String(j).slice(0, 20)})`);
    }
  }
});
