// Fixture data for the dashboard's tests and its stand-in Core (mock-server.mjs), in the real Core's
// JSON shape (core/server/core.mjs: the snapshot, its compact SSE `tick`, events, history), for the
// Alienware Aurora R5 (i7-6700, 16 GB, GTX 970, 1 TB HDD). Deterministic: no randomness, gentle
// sine "noise" and hashed bursts from the simulated time. Scenarios follow the Core's simulator
// (core/server/sim/scenarios.mjs):
//   ok       all systems normal
//   warn     CPU running hot, disk / at 88 %, SMART reallocated sectors, a stuck file indexer
//   alert    CPU 93 °C, memory nearly full, disk 96 %, Claude API unreachable, ffmpeg pinning the CPU
//   nogpu    the NVIDIA driver is not installed (nvidia-smi missing); SMART needs permission
//   offline  the internet is down (the Core itself still answers; "Core offline" is the mock's `down`)

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

const wave = (t, period, phase = 0) => Math.sin((t / period) * Math.PI * 2 + phase);
const round1 = (v) => Math.round(v * 10) / 10;

/** A deterministic 0..1 value per integer (FNV-1a), for bursts that look random but repeat. */
const hash01 = (n) => {
  let x = 0x811c9dc5;
  const s = String(n);
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193);
  }
  return (x >>> 0) / 4294967296;
};

/** Network-like traffic: a quiet floor with the odd burst (a page load, a sync) lasting seconds. */
function traffic(s, floor, burst, salt) {
  const slot = Math.floor(s / 20);
  const h = hash01(slot * 7 + salt);
  const inSlot = s - slot * 20;
  const len = 3 + Math.floor(h * 12);
  const on = h > 0.62 && inSlot < len;
  const shape = on ? Math.sin((inSlot / len) * Math.PI) : 0;
  return floor * (1 + 0.25 * wave(s, 53, salt)) + burst * (0.3 + 0.7 * hash01(slot + salt * 13)) * shape;
}

export const SCENARIOS = ['ok', 'warn', 'alert', 'nogpu', 'offline'];

const BOOT_OFFSET_S = 3 * 86400 + 4 * 3600 + 12 * 60; // the computer has been up 3 d 4 h 12 min at the start
const CORE_OFFSET_S = BOOT_OFFSET_S - 25;
const DISK_TOTAL = 983.4e9;

function item(id, label, level, message, extra = {}) {
  return { available: true, value: null, unit: null, detail: null, id, label, message, level, since: null, ...extra };
}

/** The Core's full snapshot (GET /api/status) at simulated time tMs for a scenario. */
export function makeStatus(scenario, tMs, startMs = tMs, seq = 1) {
  const s = tMs / 1000;
  const sc = SCENARIOS.includes(scenario) ? scenario : 'ok';
  const hot = sc === 'alert';
  const warm = sc === 'warn';
  const netDown = sc === 'offline';

  // CPU: eight threads; the warn scenario has a stuck indexer on thread 3, alert an encoder on all.
  const base = hot ? 86 : warm ? 22 : 7;
  const perThreadPct = [];
  for (let i = 0; i < 8; i++) {
    let v = base + 5 * wave(s, 23 + i * 3, i) + 3 * wave(s, 7 + i, i * 2);
    if (warm && i === 3) v = 99;
    if (hot) v = Math.max(v, 92 + 4 * wave(s, 11 + i, i));
    if (!hot && !warm && i === 0) v += 6; // the dashboard's own renderer
    perThreadPct.push(Math.max(0.4, Math.min(100, round1(v))));
  }
  const usagePct = round1(perThreadPct.reduce((a, b) => a + b, 0) / 8);
  const pkg = round1(hot ? 93 + 0.6 * wave(s, 40) : warm ? 84 + 0.8 * wave(s, 50) : 41 + 1.5 * wave(s, 90));

  // Memory and swap.
  const totalBytes = 16_326_844 * 1024; // MemTotal of a 16 GB kit
  const availableBytes = hot ? totalBytes * 0.04 : (warm ? 6.1 : 9.9) * GiB + 0.12 * GiB * wave(s, 300);
  const usedBytes = totalBytes - availableBytes;
  const swapTotal = 2 * GiB;
  const swapUsed = hot ? swapTotal * 0.72 : warm ? 0.21 * GiB : 0;

  const rootPct = hot ? 96.2 : warm ? 88.4 : 47.3;
  const rootUsed = (DISK_TOTAL * rootPct) / 100;

  const rx = netDown ? 0 : traffic(s, warm ? 900e3 : 22e3, warm ? 6.5e6 : 2.8e6, 1);
  const tx = netDown ? 0 : traffic(s, warm ? 120e3 : 6e3, warm ? 900e3 : 260e3, 2);

  const gpu =
    sc === 'nogpu'
      ? {
          status: 'not-installed',
          available: false,
          message: 'GPU driver not loaded',
          detail: 'nvidia-smi is not installed (no NVIDIA driver)',
          name: 'NVIDIA GeForce GTX 970',
          driver: null,
          utilPct: null,
          memUsedMB: null,
          memTotalMB: null,
          memPct: null,
          tempC: null,
          tempSource: null,
          powerW: null,
          powerLimitW: null,
          fanPct: null,
          clockMHz: null,
          count: 0,
          adapters: ['NVIDIA GeForce GTX 970', 'Intel HD Graphics 530'],
          errors: 0,
          checkedAt: tMs - 1000,
        }
      : (() => {
          const util = Math.max(0, Math.round((hot ? 97 : warm ? 18 : 3) + 2 * wave(s, 17)));
          const memUsedMB = Math.round((hot ? 3650 : warm ? 1120 : 412) + 8 * wave(s, 60));
          return {
            status: 'ok',
            available: true,
            message: null,
            detail: null,
            name: 'NVIDIA GeForce GTX 970',
            driver: '580.95.05',
            utilPct: util,
            memUsedMB,
            memTotalMB: 4096,
            memPct: round1((memUsedMB / 4096) * 100),
            tempC: Math.round(hot ? 79 : warm ? 52 : 39 + wave(s, 120)),
            tempSource: 'nvidia-smi',
            powerW: round1(hot ? 148 : warm ? 46 : 17.6 + wave(s, 33)),
            powerLimitW: 163,
            fanPct: hot ? 74 : warm ? 33 : 22,
            clockMHz: hot ? 1291 : warm ? 1050 : 135,
            count: 1,
            adapters: ['NVIDIA GeForce GTX 970', 'Intel HD Graphics 530'],
            errors: 0,
            checkedAt: tMs - 1000,
          };
        })();

  const checkedAt = Math.floor(tMs / 30000) * 30000;
  const services = {
    rev: Math.floor(tMs / 30000),
    internet: netDown
      ? { status: 'down', latencyMs: null, dnsMs: null, dnsOk: false, target: 'https://1.1.1.1/', checkedAt, detail: 'no DNS and no answer from the internet', failures: 18 }
      : { status: 'up', latencyMs: Math.round(18 + 3 * wave(s, 300)), dnsMs: 9, dnsOk: true, target: 'https://1.1.1.1/', checkedAt, detail: null, failures: 0 },
    api:
      netDown || hot
        ? { status: 'down', host: 'api.anthropic.com', latencyMs: null, httpStatus: null, checkedAt, detail: netDown ? 'no internet' : 'no answer from api.anthropic.com (timeout)', failures: 9 }
        : { status: 'up', host: 'api.anthropic.com', latencyMs: Math.round(94 + 9 * wave(s, 400)), httpStatus: 404, checkedAt, detail: null, failures: 0 },
    site: netDown
      ? { status: 'down', url: 'https://frankwise0202-maker.github.io/jarvis/sw.js', buildId: 'v7.4-cfff39d', latencyMs: null, httpStatus: null, checkedAt, detail: 'no internet', failures: 18 }
      : { status: 'up', url: 'https://frankwise0202-maker.github.io/jarvis/sw.js', buildId: 'v7.4-cfff39d', latencyMs: 61, httpStatus: 200, checkedAt, detail: null, failures: 0 },
    tailscale: {
      status: 'running',
      detail: null,
      backendState: 'Running',
      hostName: 'alienware',
      dnsName: 'alienware.tail4b2c1.ts.net',
      url: 'https://alienware.tail4b2c1.ts.net/',
      serve: { enabled: true },
      ips: ['100.101.12.7'],
      tailnet: 'owner@example.com',
      version: '1.90.4',
      peers: [
        { name: 'franks-iphone', hostName: 'Franks-iPhone', dnsName: 'franks-iphone.tail4b2c1.ts.net', os: 'iOS', kind: 'iPhone', online: !netDown, lastSeen: netDown ? tMs - 6 * 60000 : null, active: !netDown },
        { name: 'franks-macbook-pro', hostName: 'Franks-MacBook-Pro', dnsName: 'franks-macbook-pro.tail4b2c1.ts.net', os: 'macOS', kind: 'Mac', online: sc === 'ok' || sc === 'nogpu', lastSeen: tMs - 47 * 60000, active: false },
      ],
      online: netDown ? 0 : sc === 'ok' || sc === 'nogpu' ? 2 : 1,
      total: 2,
      failures: 0,
      checkedAt,
    },
  };

  const smart =
    sc === 'warn'
      ? { status: 'warning', detail: 'sda: 8 reallocated sectors', devices: [{ name: 'sda', model: 'ST1000DM003-1SB102', passed: true, reallocated: 8, pending: 0, uncorrectable: 0, powerOnHours: 31877, tempC: 36 }], checkedAt: startMs - 3 * 3600000 }
      : sc === 'nogpu'
        ? { status: 'not-checked', detail: 'smartctl needs permission (sudo) to read the disk', devices: [], checkedAt: startMs - 3 * 3600000 }
        : { status: 'ok', detail: null, devices: [{ name: 'sda', model: 'ST1000DM003-1SB102', passed: true, reallocated: 0, pending: 0, uncorrectable: 0, powerOnHours: 31877, tempC: 35 }], checkedAt: startMs - 3 * 3600000 };

  const since = (minAgo) => startMs - minAgo * 60000;
  const items = [
    item('cpu.temp', 'CPU temperature', hot ? 'alert' : warm ? 'warn' : 'ok', hot ? 'CPU overheating: 93 °C' : warm ? 'CPU running hot: 84 °C' : `CPU at ${Math.round(pkg)} °C`, { value: pkg, unit: '°C', since: hot ? since(34) : warm ? since(22) : null }),
    item('cpu.load', 'CPU load', 'ok', `CPU at ${Math.round(usagePct)}%`, { value: usagePct, unit: '%' }),
    item('cpu.process', 'Runaway process', hot || warm ? 'warn' : 'ok', hot ? 'ffmpeg has kept the CPU busy for 40 min' : warm ? 'tracker-miner-fs-3 has pinned a CPU thread for 22 min' : 'No runaway processes', { since: hot ? since(30) : warm ? since(17) : null }),
    item('gpu.driver', 'GPU driver', sc === 'nogpu' ? 'warn' : 'ok', sc === 'nogpu' ? 'GPU driver not loaded' : 'NVIDIA driver 580.95.05', { since: sc === 'nogpu' ? startMs - 3 * 86400000 : null }),
    item('gpu.temp', 'GPU temperature', 'ok', gpu.tempC !== null ? `GPU at ${gpu.tempC} °C` : 'GPU temperature unknown', { value: gpu.tempC, unit: '°C', available: gpu.tempC !== null }),
    item('memory', 'Memory', hot ? 'alert' : 'ok', hot ? 'Memory nearly full: 4% available' : `${Math.round((availableBytes / totalBytes) * 100)}% available`, { value: round1((availableBytes / totalBytes) * 100), unit: '%', since: hot ? since(36) : null }),
    item('swap', 'Swap', hot ? 'warn' : 'ok', hot ? 'Heavy swapping: 72% of swap in use' : 'Swap barely used'),
    item('disk:/', 'Disk /', hot ? 'alert' : warm ? 'warn' : 'ok', hot ? 'Disk / is 96% full' : warm ? 'Disk / is 88% full' : `Disk / is ${Math.round(rootPct)}% full`, { value: rootPct, unit: '%', since: hot ? since(90) : warm ? since(55) : null }),
    item('disk.health', 'Disk health', warm ? 'warn' : 'ok', warm ? 'Disk sda: 8 reallocated sectors' : sc === 'nogpu' ? 'Disk health not checked' : 'Disk healthy'),
    item('internet', 'Internet', netDown ? 'alert' : 'ok', netDown ? 'Internet down' : `Online (${services.internet.latencyMs} ms)`, { since: netDown ? since(9) : null }),
    item('api', 'Claude API', netDown || hot ? 'warn' : 'ok', netDown || hot ? "Claude API can't be reached" : `Claude API reachable (${services.api.latencyMs} ms)`, { since: netDown ? since(9) : hot ? since(25) : null }),
    item('site', 'Jarvis site', netDown ? 'warn' : 'ok', netDown ? "Jarvis site can't be reached" : 'Jarvis site live (build v7.4-cfff39d)'),
    item('tailscale', 'Tailscale', 'ok', 'Tailscale connected'),
  ];
  const counts = { ok: 0, warn: 0, alert: 0 };
  for (const it of items) counts[it.level] += 1;
  const level = counts.alert ? 'alert' : counts.warn ? 'warn' : 'ok';
  const bad = items.filter((i) => i.level !== 'ok').sort((a, b) => (a.level === 'alert' ? -1 : 0) - (b.level === 'alert' ? -1 : 0));
  let summary = 'All systems normal';
  if (bad.length) {
    const parts = [];
    if (counts.alert) parts.push(`${counts.alert} alert${counts.alert > 1 ? 's' : ''}`);
    if (counts.warn) parts.push(`${counts.warn} warning${counts.warn > 1 ? 's' : ''}`);
    summary = `${parts.join(', ')}: ${bad
      .slice(0, 2)
      .map((i) => i.message)
      .join('; ')}${bad.length > 2 ? ` and ${bad.length - 2} more` : ''}`;
  }

  const topCpu = hot
    ? [
        { pid: 3310, name: 'ffmpeg', label: 'ffmpeg', threadPct: 690, cpuPct: 86.3, memBytes: 2600 * MiB, memPct: 16.3 },
        { pid: 2050, name: 'chrome', label: 'Dashboard (Chrome)', threadPct: 21, cpuPct: 2.6, memBytes: 420 * MiB, memPct: 2.6 },
        { pid: 88, name: 'kswapd0', label: 'kswapd0', threadPct: 24, cpuPct: 3, memBytes: 0, memPct: 0 },
        { pid: 1188, name: 'gnome-shell', label: 'GNOME desktop', threadPct: 6.2, cpuPct: 0.8, memBytes: 388 * MiB, memPct: 2.4 },
        { pid: 702, name: 'node', label: 'Jarvis Core', threadPct: 1.1, cpuPct: 0.1, memBytes: 61 * MiB, memPct: 0.4 },
      ]
    : [
        ...(warm ? [{ pid: 1499, name: 'tracker-miner-f', label: 'File indexer', threadPct: 99, cpuPct: 12.4, memBytes: 141 * MiB, memPct: 0.9 }] : []),
        { pid: 2050, name: 'chrome', label: 'Dashboard (Chrome)', threadPct: round1(6.4 + 2 * wave(s, 12)), cpuPct: round1(0.8 + 0.25 * wave(s, 12)), memBytes: 420 * MiB, memPct: 2.6 },
        { pid: 1188, name: 'gnome-shell', label: 'GNOME desktop', threadPct: round1(2.1 + wave(s, 19)), cpuPct: round1(0.3 + 0.1 * wave(s, 19)), memBytes: 388 * MiB, memPct: 2.4 },
        { pid: 702, name: 'node', label: 'Jarvis Core', threadPct: 0.9, cpuPct: 0.1, memBytes: 61 * MiB, memPct: 0.4 },
        { pid: 1745, name: 'Xwayland', label: 'Xwayland', threadPct: 0.4, cpuPct: 0.1, memBytes: 92 * MiB, memPct: 0.6 },
        { pid: 412, name: 'pipewire', label: 'Sound server', threadPct: 0.2, cpuPct: 0, memBytes: 18 * MiB, memPct: 0.1 },
      ].slice(0, 5);
  const topMem = [
    ...(hot ? [{ pid: 3310, name: 'ffmpeg', label: 'ffmpeg', threadPct: 690, cpuPct: 86.3, memBytes: 2600 * MiB, memPct: 16.3 }] : []),
    { pid: 1771, name: 'firefox', label: 'Firefox', threadPct: 0.6, cpuPct: 0.1, memBytes: (hot ? 4300 : 1450) * MiB, memPct: 9.1 },
    { pid: 2050, name: 'chrome', label: 'Dashboard (Chrome)', threadPct: 6.4, cpuPct: 0.8, memBytes: 420 * MiB, memPct: 2.6 },
    { pid: 1188, name: 'gnome-shell', label: 'GNOME desktop', threadPct: 2.1, cpuPct: 0.3, memBytes: 388 * MiB, memPct: 2.4 },
    { pid: 1499, name: 'tracker-miner-f', label: 'File indexer', threadPct: 0.1, cpuPct: 0, memBytes: 141 * MiB, memPct: 0.9 },
    { pid: 702, name: 'node', label: 'Jarvis Core', threadPct: 0.9, cpuPct: 0.1, memBytes: 61 * MiB, memPct: 0.4 },
  ].slice(0, 5);

  const elapsed = Math.max(0, (tMs - startMs) / 1000);
  return {
    v: 1,
    t: tMs,
    seq,
    mode: 'fixture',
    scenario: sc,
    host: { hostname: 'alienware', os: 'Ubuntu 24.04.5 LTS', kernel: '6.8.0-49-generic', bootId: 'b6f0c3a8', bootTime: startMs - BOOT_OFFSET_S * 1000, uptimeSec: Math.floor(BOOT_OFFSET_S + elapsed) },
    core: { version: '1.0.0', startedAt: startMs - CORE_OFFSET_S * 1000, uptimeSec: Math.floor(CORE_OFFSET_S + elapsed), timeScale: 1 },
    cpu: {
      model: 'Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz',
      cores: 4,
      threads: 8,
      usagePct,
      userPct: round1(usagePct * 0.8),
      systemPct: round1(usagePct * 0.18),
      iowaitPct: 0.2,
      perThreadPct,
      freqMHz: Math.round(hot ? 3990 : warm ? 3700 : 1680 + 900 * Math.max(0, wave(s, 13))),
      freqMaxMHz: 4000,
      load: hot ? [7.9, 7.6, 6.8] : warm ? [1.9, 1.7, 1.5] : [0.42, 0.38, 0.31],
      temp: { available: true, packageC: pkg, coresC: [0, 1, 2, 3].map((i) => round1(pkg - 3 + i + wave(s, 20 + i))), maxC: pkg, highC: 84, critC: 100, source: 'coretemp' },
    },
    gpu,
    memory: {
      totalBytes,
      availableBytes,
      usedBytes,
      usedPct: round1((usedBytes / totalBytes) * 100),
      availablePct: round1((availableBytes / totalBytes) * 100),
      cachedBytes: 3.1 * GiB,
      buffersBytes: 0.2 * GiB,
      swap: { totalBytes: swapTotal, usedBytes: swapUsed, freeBytes: swapTotal - swapUsed, usedPct: round1((swapUsed / swapTotal) * 100) },
    },
    disks: {
      readBps: Math.max(0, Math.round((warm ? 2.4e6 : hot ? 38e6 : 0) + (sc === 'ok' ? 12e3 * Math.max(0, wave(s, 11)) : 0))),
      writeBps: Math.round((hot ? 61e6 : warm ? 18e6 : 96e3) * (1 + 0.4 * wave(s, 9))),
      devices: [{ name: 'sda', model: 'ST1000DM003-1SB102', sizeBytes: 1000204886016, rotational: true, readBps: 0, writeBps: 0, busyPct: hot ? 71 : 2 }],
      mounts: [{ mount: '/', device: '/dev/sda2', fs: 'ext4', disk: 'sda', totalBytes: DISK_TOTAL, usedBytes: rootUsed, freeBytes: DISK_TOTAL - rootUsed, usedPct: rootPct }],
      mountsCheckedAt: tMs - 4000,
      health: smart,
    },
    network: { interface: 'enp0s31f6', kind: 'ethernet', operstate: 'up', speedMbps: 1000, ipv4: '192.168.1.42', gateway: '192.168.1.1', rxBps: Math.max(0, Math.round(rx)), txBps: Math.max(0, Math.round(tx)), rxTotalBytes: 81e9, txTotalBytes: 9e9, tailscaleInterface: true },
    processes: { total: 312, running: hot ? 9 : 2, threads: 1290, topCpu, topMem },
    services,
    health: { level, summary, counts, rev: SCENARIOS.indexOf(sc) + 1, since: startMs - 40 * 60000, items },
  };
}

/** The SSE `tick` form: every section but `services`, and health without its items (core.compact). */
export function compactOf(snap) {
  const { services, health, ...rest } = snap;
  void services;
  return { ...rest, health: { level: health.level, summary: health.summary, counts: health.counts, rev: health.rev, since: health.since } };
}

/** Event-log entries (oldest first), in the Core's shape: { id, t, level, kind, rule, message }. */
export function makeEvents(scenario, nowMs) {
  const m = 60000;
  let id = 100;
  const ev = (minAgo, level, rule, message) => ({ id: ++id, t: nowMs - minAgo * m, level, kind: level === 'info' ? 'core' : 'health', rule, message });
  const list = [
    ev(3 * 1440 + 252, 'info', 'machine.boot', 'The computer started at 5:35 PM'),
    ev(3 * 1440 + 251, 'info', 'core.start', 'Jarvis Core started (version 1.0.0)'),
    ev(26 * 60, 'alert', 'internet', 'Internet down'),
    ev(26 * 60 - 4, 'ok', 'internet', 'Internet back after 4 minutes'),
    ev(5 * 60, 'info', 'tailscale.peer', "Frank's iPhone joined the tailnet"),
    ev(52, 'info', 'site', 'Jarvis site updated to build v7.4-cfff39d'),
  ];
  if (scenario === 'warn') {
    list.push(ev(55, 'warn', 'disk:/', 'Disk / is 88% full'));
    list.push(ev(22, 'warn', 'cpu.temp', 'CPU running hot: 84 °C'));
    list.push(ev(17, 'warn', 'cpu.process', 'tracker-miner-fs-3 has pinned a CPU thread for 5 min'));
  }
  if (scenario === 'alert') {
    list.push(ev(90, 'alert', 'disk:/', 'Disk / is 96% full'));
    list.push(ev(36, 'alert', 'memory', 'Memory nearly full: 4% available'));
    list.push(ev(34, 'alert', 'cpu.temp', 'CPU overheating: 93 °C'));
    list.push(ev(30, 'warn', 'cpu.process', 'ffmpeg has kept the CPU busy for 10 min'));
    list.push(ev(25, 'warn', 'api', "Claude API can't be reached"));
  }
  if (scenario === 'nogpu') list.push(ev(3 * 1440 + 250, 'warn', 'gpu.driver', 'GPU driver not loaded'));
  if (scenario === 'offline') {
    list.push(ev(9, 'alert', 'internet', 'Internet down'));
    list.push(ev(9, 'warn', 'api', "Claude API can't be reached"));
  }
  return list.sort((a, b) => a.t - b.t || a.id - b.id);
}

/** GET /api/history: `seconds` of 1 s points ending at nowMs, in the Core's columnar layout. */
export function makeHistory(scenario, nowMs, seconds = 900) {
  const out = { range: '15m', agg: 'avg', resolutionSec: 1, from: nowMs - seconds * 1000, to: nowMs, count: seconds, t: [], series: { cpu: [], gpu: [], ram: [], netRx: [], netTx: [] }, units: { cpu: '%', gpu: '%', ram: '%', netRx: 'B/s', netTx: 'B/s' } };
  for (let i = seconds - 1; i >= 0; i--) {
    const t = nowMs - i * 1000;
    const st = makeStatus(scenario, t, nowMs);
    out.t.push(t);
    out.series.cpu.push(st.cpu.usagePct);
    out.series.gpu.push(st.gpu.available ? st.gpu.utilPct : null);
    out.series.ram.push(st.memory.usedPct);
    out.series.netRx.push(st.network.rxBps);
    out.series.netTx.push(st.network.txBps);
  }
  return out;
}

/** Canned answers for the stand-in (the real assistant is the Core's: core/server/assistant/). */
export function mockAnswer(q, status) {
  const s = String(q || '').toLowerCase();
  const st = status;
  const bad = st.health.items.filter((i) => i.level !== 'ok');
  const freeGB = Math.round(st.disks.mounts[0].freeBytes / 1e9);
  if (/how are you|you good|how.*doing/.test(s)) {
    if (!bad.length) return { intent: 'how_are_you', answer: `All systems normal, Frank. CPU at ${Math.round(st.cpu.usagePct)} percent, ${st.gpu.available ? `graphics card at ${st.gpu.tempC} °C, ` : ''}${freeGB} GB free on the disk.`, facts: { CPU: `${Math.round(st.cpu.usagePct)}%`, Disk: `${freeGB} GB free` }, suggestions: ['Anything wrong?'] };
    return { intent: 'how_are_you', answer: `Not my best, Frank. ${bad[0].message}.`, facts: [{ label: 'Issues', value: String(bad.length) }], suggestions: ['Anything wrong?'] };
  }
  if (/wrong|problem|warn|issue/.test(s)) {
    if (!bad.length) return { intent: 'problems', answer: 'Nothing is wrong, Frank. Everything is within normal limits.', facts: null };
    return { intent: 'problems', answer: `${bad.map((i) => i.message).join('. ')}.`, facts: null };
  }
  if (/gpu|graphics/.test(s)) {
    if (!st.gpu.available) return { intent: 'gpu', answer: "I can't read the graphics card, Frank: the NVIDIA driver isn't loaded.", facts: null };
    return { intent: 'gpu', answer: `The GTX 970 is at ${st.gpu.tempC} °C and ${st.gpu.utilPct} percent busy, using ${(st.gpu.memUsedMB / 1024).toFixed(1)} of 4 GB of video memory.`, facts: { Temp: `${st.gpu.tempC} °C`, Load: `${st.gpu.utilPct}%` } };
  }
  if (/status|report|summary/.test(s)) return { intent: 'status', answer: `${st.health.summary}.`, facts: null };
  if (/thank|bye/.test(s)) return { intent: 'thanks', answer: 'You’re welcome, Frank.', facts: null };
  return { intent: 'unknown', answer: 'I only know how this machine is doing. Try "How are you?" or "Anything wrong?"', facts: null };
}
