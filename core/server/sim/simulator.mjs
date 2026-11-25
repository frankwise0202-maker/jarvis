// The fixture simulator: a virtual Alienware Aurora R5 that answers the same IO interface as the live
// machine (see io/live.mjs), synchronously. It renders /proc/stat, /proc/meminfo, /proc/diskstats,
// /proc/net/dev, /proc/[pid]/stat, hwmon and cpufreq files, nvidia-smi CSV, `tailscale status --json`,
// smartctl JSON, statfs results and the network checks from scenario-driven functions of time, and serves
// every other file (cpuinfo, mounts, os-release, PCI ids...) from the real-format fixture tree in
// core/fixtures/alienware/root. So fixture mode runs the very same collector, health rules and API as the
// live machine.
//
// Everything is a deterministic function of the simulated time and the seed: no state but the
// cumulative counters, which advanceTo(t) integrates. seriesAt(t) gives the history values directly
// (used to pre-fill 7 days of history without simulating every second).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from './scenarios.mjs';
import { NVIDIA_ARGS } from '../collector/parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.resolve(HERE, '../../fixtures');
const ROOT = path.join(FIXTURES_DIR, 'alienware/root');

const THREADS = 8;
const HZ = 100;
const GiB = 1024 ** 3;
const MEM_TOTAL_KB = 16303860;
const SWAP_TOTAL_KB = 4194300;
const ROOT_BLOCKS = 240046080; // 4 KiB blocks: a 983 GB ext4 root on the 1 TB disk
const ROOT_RESERVED = Math.round(ROOT_BLOCKS * 0.05);

// ---------------------------------------------------------------------------------------------------
// Deterministic noise

function hash32(a, b, c) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1] with features about `periodMs` apart. */
function vnoise(seed, t, periodMs, k) {
  const x = t / periodMs;
  const i = Math.floor(x);
  const f = x - i;
  const a = hash32(i, k, seed);
  const b = hash32(i + 1, k, seed);
  const s = f * f * (3 - 2 * f);
  return (a + (b - a) * s) * 2 - 1;
}

/** 0..1 bursts: slots of `slotMs`; a slot bursts with probability p, for `lenFrac` of the slot. */
function burst(seed, t, slotMs, p, lenFrac, k) {
  const i = Math.floor(t / slotMs);
  if (hash32(i, k + 7919, seed) >= p) return 0;
  const f = (t - i * slotMs) / slotMs;
  if (f > lenFrac) return 0;
  return Math.sin((Math.PI * f) / lenFrac) ** 0.5;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** 0 before start, ramping linearly to 1 over rampSec. */
const ramp = (t, startMs, rampSec) => clamp((t - startMs) / (rampSec * 1000), 0, 1);

// ---------------------------------------------------------------------------------------------------
// The process table

const CHROME_PROFILE = '--user-data-dir=/home/owner/.config/jarvis-core/chrome-profile';
const BASE_PROCS = [
  { pid: 1, comm: 'systemd', ppid: 0, threads: 1, base: 0.05, amp: 0.05, rssMB: 13, cmd: '/sbin/init splash' },
  { pid: 2, comm: 'kthreadd', ppid: 0, kthread: true, threads: 1, base: 0, amp: 0, rssMB: 0, cmd: '' },
  { pid: 37, comm: 'kworker/u16:2-events_unbound', ppid: 2, kthread: true, threads: 1, base: 0.3, amp: 0.3, rssMB: 0, cmd: '' },
  { pid: 88, comm: 'kswapd0', ppid: 2, kthread: true, threads: 1, base: 0, amp: 0, rssMB: 0, cmd: '' },
  { pid: 412, comm: 'systemd-journal', ppid: 1, threads: 1, base: 0.1, amp: 0.1, rssMB: 31, cmd: '/usr/lib/systemd/systemd-journald' },
  { pid: 689, comm: 'NetworkManager', ppid: 1, threads: 4, base: 0.05, amp: 0.05, rssMB: 22, cmd: '/usr/sbin/NetworkManager --no-daemon' },
  { pid: 702, comm: 'tailscaled', ppid: 1, threads: 14, base: 0.3, amp: 0.3, rssMB: 44, cmd: '/usr/sbin/tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock --port=41641' },
  { pid: 1188, comm: 'gnome-shell', ppid: 1101, threads: 24, base: 3.5, amp: 2.5, rssMB: 420, cmd: '/usr/bin/gnome-shell' },
  { pid: 1243, comm: 'Xwayland', ppid: 1188, threads: 9, base: 0.8, amp: 0.6, rssMB: 110, cmd: '/usr/bin/Xwayland :0 -rootless -noreset' },
  { pid: 1302, comm: 'pipewire', ppid: 1101, threads: 3, base: 0.2, amp: 0.1, rssMB: 18, cmd: '/usr/bin/pipewire' },
  { pid: 1311, comm: 'wireplumber', ppid: 1101, threads: 5, base: 0.1, amp: 0.1, rssMB: 25, cmd: '/usr/bin/wireplumber' },
  { pid: 1499, comm: 'tracker-miner-f', ppid: 1101, threads: 5, base: 0, amp: 0.3, bursty: true, rssMB: 60, cmd: '/usr/libexec/tracker-miner-fs-3' },
  { pid: 1630, comm: 'node', ppid: 1101, threads: 11, base: 1.2, amp: 0.6, rssMB: 85, cmd: 'node /home/owner/jarvis-core-app/core/server/main.mjs' },
  { pid: 1702, comm: 'chrome', ppid: 1101, threads: 31, base: 3.0, amp: 1.0, rssMB: 260, cmd: `/opt/google/chrome/chrome --kiosk ${CHROME_PROFILE} --app=http://localhost:8788/` },
  { pid: 1745, comm: 'chrome', ppid: 1702, threads: 12, base: 8.0, amp: 3.0, rssMB: 180, cmd: `/opt/google/chrome/chrome --type=gpu-process ${CHROME_PROFILE}` },
  { pid: 1771, comm: 'chrome', ppid: 1702, threads: 19, base: 16.0, amp: 5.0, rssMB: 340, cmd: `/opt/google/chrome/chrome --type=renderer ${CHROME_PROFILE} --lang=en-US` },
  { pid: 2050, comm: 'gnome-terminal-', ppid: 1101, threads: 5, base: 0, amp: 0.1, rssMB: 70, cmd: '/usr/libexec/gnome-terminal-server' },
  { pid: 2101, comm: 'snapd', ppid: 1, threads: 17, base: 0, amp: 0.2, bursty: true, rssMB: 40, cmd: '/usr/lib/snapd/snapd' },
];

// ---------------------------------------------------------------------------------------------------

export function createSimulator({ scenario = 'ok', startMs = Date.now(), seed = 1, port = 8788 } = {}) {
  const sc = SCENARIOS[scenario];
  if (!sc) throw new Error(`unknown fixture scenario "${scenario}"`);
  const t0 = startMs;
  const at = (sec) => t0 + sec * 1000;
  const bootMs = t0 - (3 * 86400 + 4 * 3600 + 12 * 60) * 1000;

  // Scenario overrides change a process's usage (procUsage) and memory, never when it started.
  const procDefs = [...BASE_PROCS, ...sc.extraProcs.map((p) => ({ base: 0, amp: 0, ...p }))].map((p) => ({
    ...p,
    ...(sc.procs[p.pid]?.rssMB !== undefined ? { rssMB: sc.procs[p.pid].rssMB } : {}),
    startedAt: p.start !== undefined ? at(p.start) : bootMs + (p.pid < 1000 ? 4000 : 25000),
  }));

  // --------------------------------------------------------------------------- the model at time t

  const evening = (t) => {
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    return h >= 17 && h < 23.5 ? 1 : 0;
  };

  function procUsage(p, t, history = false) {
    // Before the simulated boot the machine ran an earlier session: for history, base processes count.
    if (t < p.startedAt && !(history && p.start === undefined && t < bootMs)) return null;
    const over = sc.procs[p.pid];
    if (p.threadPct !== undefined && (p.start === undefined || t >= at(p.start))) {
      return p.threadPct * (0.97 + 0.03 * vnoise(seed, t, 7000, p.pid));
    }
    if (over?.threadPct !== undefined && t >= at(over.start ?? -1e9)) {
      return over.threadPct * (0.97 + 0.03 * vnoise(seed, t, 7000, p.pid));
    }
    let u = p.base + p.amp * (0.6 * vnoise(seed, t, 9000, p.pid) + 0.4 * vnoise(seed, t, 170000, p.pid + 101));
    if (p.bursty) u += 35 * burst(seed, t, 600_000, 0.18, 0.15, p.pid);
    if (p.comm === 'gnome-shell' || p.pid === 1771) u *= 1 + 0.6 * evening(t);
    return Math.max(0, u);
  }

  function gpuHot(t) {
    const inc = sc.incidents.find((i) => i.kind === 'gpu-hot');
    if (!inc) return 0;
    const s = at(inc.start);
    const e = s + inc.dur * 1000;
    if (t < s || t > e) return 0;
    return Math.sin((Math.PI * (t - s)) / (e - s)) ** 0.6;
  }

  function model(t, history = false) {
    const procs = procDefs.map((p) => ({ p, u: procUsage(p, t, history) })).filter((x) => x.u !== null);
    // Spread the busy time over the 8 threads: big users fill the least-loaded thread first.
    const threads = new Array(THREADS).fill(0);
    let small = 0.6 + 0.3 * vnoise(seed, t, 5000, 3); // kernel and everything not listed (percent of one thread)
    for (const { u } of procs) {
      if (u >= 40) {
        let rest = u;
        while (rest > 0.01) {
          let i = 0;
          for (let k = 1; k < THREADS; k += 1) if (threads[k] < threads[i]) i = k;
          const put = Math.min(100 - threads[i], rest);
          if (put <= 0.01) break;
          threads[i] += put;
          rest -= put;
        }
      } else small += u;
    }
    const weights = threads.map((_, i) => 1 + 0.6 * vnoise(seed, t, 3000, 50 + i));
    const wsum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < THREADS; i += 1) threads[i] = clamp(threads[i] + (small * weights[i]) / wsum, 0, 100);
    const cpuPct = threads.reduce((a, b) => a + b, 0) / THREADS;

    // CPU temperature: a slow, smoothed load term so it lags like a real heatsink.
    const slowLoad = procs.reduce((a, { p, u }) => a + (p.base > 0 && u < 40 ? p.base : u), 0) / THREADS + 1.5;
    let cpuTemp = sc.cpuTempBase + sc.cpuTempPerPct * slowLoad + 1.2 * vnoise(seed, t, 40000, 7);
    if (sc.cpuHot) cpuTemp += sc.cpuHot.offset * ramp(t, at(sc.cpuHot.start), sc.cpuHot.rampSec);
    const coreTemps = [0, 1, 2, 3].map((i) => cpuTemp - 1.5 - 1.2 * Math.abs(vnoise(seed, t, 20000, 60 + i)) + (threads[i] + threads[i + 4]) * 0.02);

    // GPU (GTX 970)
    let gpu = null;
    if (sc.gpu === 'ok') {
      const hot = gpuHot(t);
      const heavy = sc.gpuLoad && t >= at(sc.gpuLoad.start) ? 1 : 0;
      const util = heavy ? sc.gpuLoad.util + 2 * vnoise(seed, t, 4000, 80) : hot > 0.05 ? 92 + 6 * hot : clamp(3 + 2 * vnoise(seed, t, 6000, 81) + 3 * evening(t), 0, 100);
      const memMB = heavy ? sc.gpuLoad.memMB : hot > 0.05 ? 2950 : 470 + 30 * vnoise(seed, t, 60000, 82) + 300 * evening(t);
      const temp = heavy ? 85 + 1.2 * vnoise(seed, t, 30000, 83) : 40 + util * 0.04 + 39 * hot + 0.6 * vnoise(seed, t, 30000, 84);
      gpu = {
        util: clamp(util, 0, 100),
        memMB,
        temp,
        power: util > 50 ? 128 + 18 * (util / 100) + 3 * vnoise(seed, t, 5000, 85) : 14 + util * 0.4 + 0.8 * vnoise(seed, t, 5000, 86),
        fan: temp > 60 ? clamp(22 + (temp - 60) * 2.2, 22, 100) : 22,
        clock: util > 20 ? 1316 : util > 8 ? 1114 : 135,
      };
    }

    // Memory
    let usedKB = sc.memUsedGiB * 1048576 + 90000 * vnoise(seed, t, 120000, 90) + 700000 * evening(t);
    let swapKB = 0;
    let cachedKB = 4712604 + 200000 * vnoise(seed, t, 300000, 91);
    let buffersKB = 412884;
    if (sc.memPressure && t >= at(sc.memPressure.start)) {
      const r = ramp(t, at(sc.memPressure.start), 120);
      const target = MEM_TOTAL_KB * (1 - sc.memPressure.availablePct / 100);
      usedKB = usedKB + (target - usedKB) * r + 30000 * vnoise(seed, t, 20000, 92);
      swapKB = SWAP_TOTAL_KB * (sc.memPressure.swapPct / 100) * r;
      cachedKB = cachedKB * (1 - r) + 260000 * r;
      buffersKB = buffersKB * (1 - r) + 30000 * r;
    }
    const availKB = MEM_TOTAL_KB - usedKB;

    // Disk (HDD) and network
    const diskBurst = burst(seed, t, 420_000, 0.35, 0.1, 95);
    const readBps = 18000 + 9000 * (1 + vnoise(seed, t, 8000, 96)) + 34e6 * diskBurst;
    const writeBps = 140000 + 90000 * (1 + vnoise(seed, t, 6000, 97)) + 9e6 * burst(seed, t, 300_000, 0.3, 0.12, 98);
    const busyPct = clamp(0.4 + ((readBps + writeBps) / 120e6) * 100, 0, 100);
    const offline = sc.internet === 'down' && t >= at(sc.offlineSince ?? -3600);
    const netBurst = burst(seed, t, 300_000, 0.4, 0.1, 99);
    const rxBps = offline ? 300 + 200 * vnoise(seed, t, 5000, 100) : 22000 + 15000 * vnoise(seed, t, 5000, 101) + 4.5e6 * netBurst + 1.2e6 * evening(t) * burst(seed, t, 90_000, 0.5, 0.4, 102);
    const txBps = offline ? 150 + 80 * vnoise(seed, t, 5000, 103) : 6000 + 3000 * vnoise(seed, t, 5000, 104) + 280000 * netBurst;

    const weekFrac = (t0 - t) / (7 * 86400 * 1000);
    const rootPct = sc.rootUsedPct - sc.rootGrowthPctPerWeek * Math.max(0, weekFrac);

    return {
      procs,
      threads,
      cpuPct,
      iowaitPct: 0.1 + busyPct * 0.01,
      cpuTemp,
      coreTemps,
      gpu,
      mem: { usedKB, availKB, cachedKB, buffersKB, swapKB },
      disk: { readBps, writeBps, busyPct },
      net: { rxBps: Math.max(0, rxBps), txBps: Math.max(0, txBps), offline },
      rootPct,
      load1: procs.reduce((a, { u }) => a + u, 0) / 100 + 0.12,
    };
  }

  // --------------------------------------------------------------------------- cumulative counters

  const uptimeAt = (t) => (t - bootMs) / 1000;
  let last = null; // time of the last advance
  let cur = null; // model at `last`
  const cpuC = Array.from({ length: THREADS }, (_, i) => {
    const total = uptimeAt(t0 - 3600_000) * HZ;
    const busy = total * (0.05 + i * 0.002);
    return { user: busy * 0.72, nice: busy * 0.003, system: busy * 0.24, idle: total - busy - total * 0.0012, iowait: total * 0.0012, irq: 0, softirq: busy * 0.02, steal: 0 };
  });
  const procC = new Map(procDefs.map((p) => [p.pid, { utime: (p.base || 0.02) * 60 * HZ * 0.75 * 40, stime: (p.base || 0.02) * 60 * HZ * 0.25 * 40 }]));
  const diskC = { sectorsRead: 61234872, sectorsWritten: 98442016, reads: 412331, writes: 1203775, msIo: 2812334, msRead: 3212445, msWrite: 9775120, weighted: 13104553 };
  const netC = { rx: 18442117320, tx: 2331877410, rxp: 13442117, txp: 5233102, lo: 112331004, lop: 402211, tsRx: 31224555, tsTx: 9221004 };

  function advanceTo(t) {
    if (last === null) {
      last = t;
      cur = model(t);
      return;
    }
    const dt = (t - last) / 1000;
    if (!(dt > 0)) return;
    const m = dt <= 2 ? cur : model((t + last) / 2);
    for (let i = 0; i < THREADS; i += 1) {
      const total = dt * HZ;
      const busy = (m.threads[i] / 100) * total;
      const iow = Math.min(total - busy, (m.iowaitPct / 100) * total);
      const c = cpuC[i];
      c.user += busy * 0.72;
      c.system += busy * 0.25;
      c.softirq += busy * 0.03;
      c.iowait += iow;
      c.idle += Math.max(0, total - busy - iow);
    }
    for (const { p, u } of m.procs) {
      const c = procC.get(p.pid);
      const ticks = (u / 100) * dt * HZ;
      c.utime += ticks * 0.8;
      c.stime += ticks * 0.2;
    }
    diskC.sectorsRead += (m.disk.readBps * dt) / 512;
    diskC.sectorsWritten += (m.disk.writeBps * dt) / 512;
    diskC.reads += (m.disk.readBps * dt) / 65536;
    diskC.writes += (m.disk.writeBps * dt) / 32768;
    diskC.msIo += (m.disk.busyPct / 100) * dt * 1000;
    diskC.msRead += (m.disk.readBps * dt) / 4e6;
    diskC.msWrite += (m.disk.writeBps * dt) / 3e6;
    diskC.weighted += (m.disk.busyPct / 100) * dt * 1300;
    netC.rx += m.net.rxBps * dt;
    netC.tx += m.net.txBps * dt;
    netC.rxp += (m.net.rxBps * dt) / 1100;
    netC.txp += (m.net.txBps * dt) / 400;
    netC.lo += 1800 * dt;
    netC.lop += 4 * dt;
    if (!m.net.offline) {
      netC.tsRx += 900 * dt;
      netC.tsTx += 600 * dt;
    }
    last = t;
    cur = model(t);
  }

  const now = () => (last ?? t0);

  // --------------------------------------------------------------------------- rendered files

  const fl = Math.floor;
  const fixture = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), 'utf8');
    } catch {
      return null;
    }
  };
  const fixtureCache = new Map();
  const cachedFixture = (rel) => {
    if (!fixtureCache.has(rel)) fixtureCache.set(rel, fixture(rel));
    return fixtureCache.get(rel);
  };

  function renderStat() {
    const row = (name, c) => `${name} ${[c.user, c.nice, c.system, c.idle, c.iowait, c.irq, c.softirq, c.steal].map(fl).join(' ')} 0 0`;
    const sum = cpuC.reduce((a, c) => {
      for (const k of Object.keys(c)) a[k] = (a[k] ?? 0) + fl(c[k]);
      return a;
    }, {});
    return [
      row('cpu ', sum),
      ...cpuC.map((c, i) => row(`cpu${i}`, c)),
      `ctxt ${fl(1220334118 + uptimeAt(now()) * 4200)}`,
      `btime ${fl(bootMs / 1000)}`,
      `processes ${412233 + fl(uptimeAt(now()) / 60)}`,
      `procs_running ${1 + fl((cur?.cpuPct ?? 5) / 25)}`,
      'procs_blocked 0',
      '',
    ].join('\n');
  }

  function renderMeminfo() {
    const m = cur.mem;
    const freeKB = Math.max(60000, m.availKB - m.cachedKB - m.buffersKB);
    const kb = (v) => `${String(fl(v)).padStart(8)} kB`;
    return [
      `MemTotal:       ${kb(MEM_TOTAL_KB)}`,
      `MemFree:        ${kb(freeKB)}`,
      `MemAvailable:   ${kb(m.availKB)}`,
      `Buffers:        ${kb(m.buffersKB)}`,
      `Cached:         ${kb(m.cachedKB)}`,
      `SwapCached:     ${kb(m.swapKB * 0.04)}`,
      `SwapTotal:      ${kb(SWAP_TOTAL_KB)}`,
      `SwapFree:       ${kb(SWAP_TOTAL_KB - m.swapKB)}`,
      `Shmem:          ${kb(402113)}`,
      `SReclaimable:   ${kb(289120)}`,
      '',
    ].join('\n');
  }

  function renderDiskstats() {
    const d = diskC;
    const f = (v) => fl(v);
    const sda = [f(d.reads), 98112, f(d.sectorsRead), f(d.msRead), f(d.writes), 801223, f(d.sectorsWritten), f(d.msWrite), 0, f(d.msIo), f(d.weighted), 0, 0, 0, 0, 98212, 1203344];
    const sda1 = [2331, 12, 98112, 1203, 4, 0, 12, 3, 0, 1122, 1206, 0, 0, 0, 0, 0, 0];
    const sda2 = sda.map((v, i) => (i >= 15 ? 0 : Math.max(0, v - sda1[i])));
    const line = (maj, min, name, vals) => `${String(maj).padStart(4)} ${String(min).padStart(7)} ${name} ${vals.join(' ')}`;
    const loops = Array.from({ length: 12 }, (_, i) => line(7, i, `loop${i}`, [412 + i * 37, 0, 9821 + i * 811, 112 + i, 0, 0, 0, 0, 0, 220 + i * 3, 112 + i, 0, 0, 0, 0, 0, 0]));
    return [...loops, line(8, 0, 'sda', sda), line(8, 1, 'sda1', sda1), line(8, 2, 'sda2', sda2), line(11, 0, 'sr0', [21, 0, 172, 51, 0, 0, 0, 0, 0, 77, 51, 0, 0, 0, 0, 0, 0]), ''].join('\n');
  }

  function renderNetDev() {
    const n = netC;
    const r = (iface, rx, rxp, tx, txp) => `${iface.padStart(6)}: ${fl(rx)} ${fl(rxp)}    0    0    0     0          0         0 ${fl(tx)} ${fl(txp)}    0    0    0     0       0          0`;
    return [
      'Inter-|   Receive                                                |  Transmit',
      ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
      r('lo', n.lo, n.lop, n.lo, n.lop),
      r('enp3s0', n.rx, n.rxp, n.tx, n.txp),
      r('wlp2s0', 0, 0, 0, 0),
      ...(sc.tailscale === 'not-installed' ? [] : [r('tailscale0', n.tsRx, n.tsRx / 900, n.tsTx, n.tsTx / 700)]),
      '',
    ].join('\n');
  }

  function renderPidStat(p) {
    const c = procC.get(p.pid);
    const u = cur.procs.find((x) => x.p === p)?.u ?? 0;
    const state = u > 50 ? 'R' : p.comm.startsWith('kworker') ? 'I' : 'S';
    const flags = p.kthread ? 2129984 : 4194560;
    const rssMB = p.rssMB ?? 0;
    const pages = fl((rssMB * 1048576) / 4096);
    const vsize = p.kthread ? 0 : fl(rssMB * 1048576 * 6 + 2e8);
    const start = fl(((p.startedAt - bootMs) / 1000) * HZ);
    return `${p.pid} (${p.comm}) ${state} ${p.ppid ?? 1} ${p.pid} ${p.pid} 0 -1 ${flags} 112233 0 12 0 ${fl(c.utime)} ${fl(c.stime)} 0 0 20 0 ${p.threads ?? 1} 0 ${start} ${vsize} ${pages} 18446744073709551615 1 1 0 0 0 0 0 4096 81923 0 0 0 17 3 0 0 0 0 0 0 0 0 0 0 0 0 0\n`;
  }

  const hwmonDirs = () => ['hwmon0', 'hwmon1', 'hwmon2', ...(sc.gpu === 'missing' ? ['hwmon3'] : [])];

  function readText(p) {
    if (cur === null) advanceTo(now());
    switch (p) {
      case '/proc/stat':
        return renderStat();
      case '/proc/meminfo':
        return renderMeminfo();
      case '/proc/diskstats':
        return renderDiskstats();
      case '/proc/net/dev':
        return renderNetDev();
      case '/proc/uptime': {
        const up = uptimeAt(now());
        return `${up.toFixed(2)} ${(up * THREADS * 0.93).toFixed(2)}\n`;
      }
      case '/proc/loadavg': {
        const l = cur.load1;
        return `${l.toFixed(2)} ${(l * 0.92 + 0.05).toFixed(2)} ${(l * 0.85 + 0.08).toFixed(2)} ${1 + fl(cur.cpuPct / 25)}/1187 ${98321 + fl(uptimeAt(now()) / 30)}\n`;
      }
      case '/sys/class/hwmon/hwmon1/temp1_input':
        return `${fl((41 + cur.cpuPct * 0.05) * 1000)}\n`;
      case '/sys/class/hwmon/hwmon3/name':
        return sc.gpu === 'missing' ? 'nouveau\n' : null;
      case '/sys/class/hwmon/hwmon3/temp1_input':
        return sc.gpu === 'missing' ? `${fl((37 + 0.6 * vnoise(seed, now(), 30000, 120)) * 1000)}\n` : null;
      default:
        break;
    }
    let m = /^\/sys\/class\/hwmon\/hwmon2\/temp(\d)_input$/.exec(p);
    if (m) {
      const i = Number(m[1]);
      const v = i === 1 ? cur.cpuTemp : cur.coreTemps[i - 2];
      return v === undefined ? null : `${fl(v) * 1000}\n`;
    }
    m = /^\/sys\/devices\/system\/cpu\/cpu(\d+)\/cpufreq\/scaling_cur_freq$/.exec(p);
    if (m) {
      const i = Number(m[1]);
      if (i >= THREADS) return null;
      const u = cur.threads[i];
      return `${fl(800000 + (u / 100) * 3100000 + 40000 * Math.abs(vnoise(seed, now(), 2000, 130 + i)))}\n`;
    }
    m = /^\/proc\/(\d+)\/(stat|statm|cmdline)$/.exec(p);
    if (m) {
      const proc = procDefs.find((x) => x.pid === Number(m[1]));
      if (!proc || now() < proc.startedAt) return null;
      if (m[2] === 'stat') return renderPidStat(proc);
      if (m[2] === 'cmdline') return proc.cmd ? `${proc.cmd.split(' ').join('\0')}\0` : '';
      const pages = fl(((proc.rssMB ?? 0) * 1048576) / 4096);
      return `${fl(pages * 6 + 48828)} ${pages} ${fl(pages * 0.3)} ${Math.max(1, fl(pages * 0.02))} 0 ${fl(pages * 0.6)} 0\n`;
    }
    return cachedFixture(p.replace(/^\//, ''));
  }

  function listDir(p) {
    if (p === '/proc') return [...procDefs.filter((x) => now() >= x.startedAt).map((x) => String(x.pid)), 'self', 'stat', 'meminfo', 'sys', 'net'];
    if (p === '/sys/class/hwmon') return hwmonDirs();
    if (p === '/sys/class/hwmon/hwmon3') return sc.gpu === 'missing' ? ['name', 'temp1_input'] : [];
    try {
      return fs.readdirSync(path.join(ROOT, p));
    } catch {
      return [];
    }
  }

  function statfs(p) {
    if (p === '/') {
      const used = fl((cur.rootPct / 100) * (ROOT_BLOCKS - ROOT_RESERVED));
      const bavail = fl((used * (100 - cur.rootPct)) / cur.rootPct);
      return { bsize: 4096, blocks: ROOT_BLOCKS, bfree: ROOT_BLOCKS - used, bavail: Math.min(bavail, ROOT_BLOCKS - used) };
    }
    if (p === '/boot/efi') return { bsize: 4096, blocks: 130812, bfree: 122881, bavail: 122881 };
    return null;
  }

  // --------------------------------------------------------------------------- commands and network

  const json = (rel) => cachedFixture(`../../${rel}`) ?? fs.readFileSync(path.join(FIXTURES_DIR, rel), 'utf8');
  const goTime = (ms) => new Date(ms).toISOString();

  function tailscaleStatus() {
    if (sc.tailscale === 'not-installed') return { ok: false, code: null, stdout: '', stderr: '', error: 'ENOENT' };
    if (sc.tailscale === 'logged-out') return { ok: true, code: 0, stdout: json('tailscale/status-needslogin.json'), stderr: '', error: null };
    const j = JSON.parse(json('tailscale/status-running.json'));
    const peers = Object.values(j.Peer);
    const setPeer = (peer, spec) => {
      if (spec === 'online') {
        peer.Online = true;
        peer.Active = true;
        peer.LastSeen = '0001-01-01T00:00:00Z';
      } else {
        peer.Online = false;
        peer.Active = false;
        peer.LastSeen = goTime(now() - spec.offlineSinceSec * 1000);
      }
    };
    setPeer(peers.find((x) => x.OS === 'iOS'), sc.peers.iphone);
    setPeer(peers.find((x) => x.OS === 'macOS'), sc.peers.mac);
    if (cur.net.offline) j.Health = ['not connected to the Tailscale coordination server'];
    return { ok: true, code: 0, stdout: JSON.stringify(j), stderr: '', error: null };
  }

  function smartctl(args) {
    if (!args.includes('/dev/sda')) return { ok: false, code: 2, stdout: '{}', stderr: '', error: 'exit 2' };
    const file = { passed: 'sda-passed.json', reallocated: 'sda-reallocated.json', failing: 'sda-failing.json', denied: 'sda-permission-denied.json' }[sc.smart];
    const text = json(`smartctl/${file}`);
    const exit = JSON.parse(text).smartctl.exit_status;
    return { ok: exit === 0, code: exit, stdout: text, stderr: '', error: exit === 0 ? null : `exit ${exit}` };
  }

  function run(cmd, args = []) {
    if (cmd === 'nvidia-smi') {
      if (sc.gpu === 'missing') return { ok: false, code: null, stdout: '', stderr: '', error: 'ENOENT' };
      if (args.join(' ') !== NVIDIA_ARGS.join(' ')) return { ok: false, code: 2, stdout: '', stderr: 'unexpected arguments', error: 'exit 2' };
      const g = cur.gpu;
      const f1 = (v) => v.toFixed(2);
      return { ok: true, code: 0, stdout: `NVIDIA GeForce GTX 970, 580.95.05, ${Math.round(g.util)}, ${Math.round(g.memMB)}, 4096, ${Math.round(g.temp)}, ${f1(g.power)}, 151.00, ${Math.round(g.fan)}, ${g.clock}\n`, stderr: '', error: null };
    }
    if (cmd === 'tailscale' && args[0] === 'status') return tailscaleStatus();
    if (cmd === 'tailscale' && args[0] === 'serve') {
      // `tailscale serve --bg <port>` proxies to whatever port this Core listens on.
      return { ok: true, code: 0, stdout: json('tailscale/serve-status.json').replace('http://127.0.0.1:8788', `http://127.0.0.1:${port}`), stderr: '', error: null };
    }
    if (cmd === 'smartctl') return smartctl(args);
    if (cmd === 'sudo') return { ok: false, code: 1, stdout: '', stderr: 'sudo: a password is required\n', error: 'exit 1' };
    return { ok: false, code: null, stdout: '', stderr: '', error: 'ENOENT' };
  }

  const jitter = (k, lo, hi) => lo + (hi - lo) * (0.5 + 0.5 * vnoise(seed, now(), 45000, k));
  const apiDown = () => sc.api === 'down' && (sc.internet === 'down' ? cur.net.offline : now() >= at(sc.apiDownSince ?? -25 * 60));
  const siteDown = () => sc.site === 'down' && cur.net.offline;

  function dnsLookup() {
    if (cur.net.offline) return { ok: false, ms: 3000, address: null, error: 'ETIMEOUT' };
    return { ok: true, ms: jitter(140, 5, 14), address: '1.1.1.1', error: null };
  }

  function httpRequest(url, { method = 'HEAD', headers = {} } = {}) {
    const fail = (error, ms) => ({ ok: false, status: null, ms, headers: {}, text: null, error });
    if (cur.net.offline) return fail('ENETUNREACH', 2);
    if (url.startsWith('https://1.1.1.1') || url.startsWith('https://8.8.8.8')) return { ok: true, status: 301, ms: jitter(141, 16, 27), headers: {}, text: null, error: null };
    if (url.includes('api.anthropic.com')) {
      if (apiDown()) return fail('TIMEOUT', 6000);
      return { ok: true, status: 404, ms: jitter(142, 64, 96), headers: {}, text: null, error: null };
    }
    if (url.endsWith('/sw.js')) {
      if (siteDown()) return fail('ENETUNREACH', 2);
      const etag = '"6741f0a2-2b1c"';
      if (headers['If-None-Match'] === etag) return { ok: true, status: 304, ms: jitter(143, 28, 55), headers: { etag }, text: null, error: null };
      return { ok: true, status: 200, ms: jitter(144, 35, 70), headers: { etag }, text: method === 'GET' ? json('site/sw.js') : null, error: null };
    }
    return fail('ENOTFOUND', 5);
  }

  /** History values straight from the model (for pre-filling days of history quickly). */
  function seriesAt(t) {
    // The reboot itself leaves a short gap, as it would on the real machine.
    if (t >= bootMs - 90_000 && t < bootMs + 60_000) return null;
    const m = model(t, true);
    const memPct = (m.mem.usedKB / MEM_TOTAL_KB) * 100;
    const offline = m.net.offline;
    const apiUp = !(sc.api === 'down' && (sc.internet === 'down' ? offline : t >= at(sc.apiDownSince ?? -25 * 60)));
    return {
      cpu: m.cpuPct,
      cpuTemp: Math.round(m.cpuTemp),
      load1: m.load1,
      gpu: m.gpu ? m.gpu.util : null,
      gpuTemp: m.gpu ? Math.round(m.gpu.temp) : sc.gpu === 'missing' ? 37 : null,
      gpuMem: m.gpu ? (m.gpu.memMB / 4096) * 100 : null,
      gpuPower: m.gpu ? m.gpu.power : null,
      ram: memPct,
      swap: (m.mem.swapKB / SWAP_TOTAL_KB) * 100,
      disk: m.rootPct,
      diskRead: m.disk.readBps,
      diskWrite: m.disk.writeBps,
      netRx: m.net.rxBps,
      netTx: m.net.txBps,
      internetMs: offline ? null : 21 + 4 * vnoise(seed, t, 45000, 141),
      apiMs: offline || !apiUp ? null : 80 + 12 * vnoise(seed, t, 45000, 142),
    };
  }

  return {
    kind: 'sim',
    scenario,
    label: sc.label,
    startMs: t0,
    bootMs,
    selfPid: 1630,
    advanceTo,
    now,
    seriesAt,
    readText,
    listDir,
    statfs,
    run,
    dnsLookup,
    httpRequest,
    netAddrs: () => ({ enp3s0: [{ address: '192.168.1.42', family: 'IPv4', internal: false }], lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }),
  };
}
