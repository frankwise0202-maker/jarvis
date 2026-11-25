// Pure parsers for the sources the collector reads: /proc, /sys text, nvidia-smi CSV, tailscale JSON,
// smartctl JSON and the Jarvis site's sw.js. Each takes text and returns plain data. None of them throws
// on odd input: they skip what they cannot read and return null or empty results, because the Core runs
// for weeks and a strange line must never stop the report.

import { isNum, lines, trimDot, parseGoTime } from '../util.mjs';

export const USER_HZ = 100; // /proc tick rate on x86-64 Linux (sysconf(_SC_CLK_TCK))
export const PAGE_SIZE = 4096; // x86-64 page size, used by /proc/[pid]/stat rss and statm
export const SECTOR_BYTES = 512; // /proc/diskstats always counts 512-byte sectors

const num = (s) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------------------------------
// /proc/stat

/**
 * /proc/stat → { cpu, threads: [{ id, user, nice, system, idle, iowait, irq, softirq, steal }], btime,
 * procsRunning, procsBlocked, ctxt, processes }. guest/guest_nice are left out: the kernel already counts
 * them inside user/nice.
 */
export function parseProcStat(text) {
  const out = { cpu: null, threads: [], btime: null, procsRunning: null, procsBlocked: null, ctxt: null, processes: null };
  for (const line of lines(text)) {
    if (line.startsWith('cpu')) {
      const parts = line.trim().split(/\s+/);
      const name = parts[0];
      const vals = parts.slice(1, 9).map(Number);
      if (vals.length < 4 || vals.some((n) => !Number.isFinite(n))) continue;
      const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = vals;
      const rec = { user, nice, system, idle, iowait, irq, softirq, steal };
      if (name === 'cpu') out.cpu = rec;
      else {
        const id = Number(name.slice(3));
        if (Number.isInteger(id) && id >= 0) out.threads.push({ id, ...rec });
      }
      continue;
    }
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const key = line.slice(0, sp);
    const value = num(line.slice(sp + 1).trim().split(/\s+/)[0]);
    if (key === 'btime') out.btime = value;
    else if (key === 'procs_running') out.procsRunning = value;
    else if (key === 'procs_blocked') out.procsBlocked = value;
    else if (key === 'ctxt') out.ctxt = value;
    else if (key === 'processes') out.processes = value;
  }
  out.threads.sort((a, b) => a.id - b.id);
  return out;
}

/** Totals of one cpu record, in ticks. */
export function cpuTimes(r) {
  const idle = r.idle + r.iowait;
  const total = r.user + r.nice + r.system + r.idle + r.iowait + r.irq + r.softirq + r.steal;
  return {
    total,
    idle,
    busy: total - idle,
    user: r.user + r.nice,
    system: r.system + r.irq + r.softirq,
    iowait: r.iowait,
    steal: r.steal,
  };
}

/**
 * Usage between two cpu records: { usagePct, userPct, systemPct, iowaitPct, stealPct }, or null when no
 * time passed or a counter went backwards (a CPU went offline and came back).
 */
export function cpuUsage(prev, cur) {
  if (!prev || !cur) return null;
  const a = cpuTimes(prev);
  const b = cpuTimes(cur);
  const dt = b.total - a.total;
  if (!(dt > 0)) return null;
  const d = (k) => b[k] - a[k];
  if (d('idle') < 0 || d('busy') < 0) return null;
  const p = (v) => Math.min(100, Math.max(0, (v / dt) * 100));
  return {
    usagePct: p(d('busy')),
    userPct: p(d('user')),
    systemPct: p(d('system')),
    iowaitPct: p(d('iowait')),
    stealPct: p(d('steal')),
  };
}

// ---------------------------------------------------------------------------------------------------
// /proc/loadavg, /proc/uptime, /proc/meminfo, /proc/cpuinfo

/** "0.42 0.51 0.47 2/1187 98321" → { load1, load5, load15, running, total }. */
export function parseLoadavg(text) {
  const parts = String(text ?? '').trim().split(/\s+/);
  if (parts.length < 3) return null;
  const [l1, l5, l15] = parts.slice(0, 3).map(num);
  if (![l1, l5, l15].every(isNum)) return null;
  const [running, total] = (parts[3] ?? '').split('/').map(num);
  return { load1: l1, load5: l5, load15: l15, running: running ?? null, total: total ?? null };
}

/** "274712.81 2087111.06" → { uptimeSec, idleSec }. */
export function parseUptime(text) {
  const [u, i] = String(text ?? '').trim().split(/\s+/).map(num);
  return isNum(u) ? { uptimeSec: u, idleSec: isNum(i) ? i : null } : null;
}

const MEMINFO_KEYS = {
  MemTotal: 'totalBytes',
  MemFree: 'freeBytes',
  MemAvailable: 'availableBytes',
  Buffers: 'buffersBytes',
  Cached: 'cachedBytes',
  SReclaimable: 'sreclaimableBytes',
  Shmem: 'shmemBytes',
  SwapTotal: 'swapTotalBytes',
  SwapFree: 'swapFreeBytes',
  SwapCached: 'swapCachedBytes',
};

/** /proc/meminfo → byte counts for the keys the report uses (null when missing). */
export function parseMeminfo(text) {
  const out = Object.fromEntries(Object.values(MEMINFO_KEYS).map((k) => [k, null]));
  for (const line of lines(text)) {
    const m = /^([A-Za-z0-9_()]+):\s+(\d+)(?:\s+(kB))?/.exec(line);
    if (!m) continue;
    const key = MEMINFO_KEYS[m[1]];
    if (key) out[key] = Number(m[2]) * (m[3] ? 1024 : 1);
  }
  return out;
}

/**
 * Memory summary like GNOME's System Monitor: used = total - available. Older kernels without
 * MemAvailable fall back to free + buffers + cached.
 */
export function memorySummary(mi) {
  if (!mi || !isNum(mi.totalBytes) || mi.totalBytes <= 0) return null;
  let available = mi.availableBytes;
  if (!isNum(available)) available = (mi.freeBytes ?? 0) + (mi.buffersBytes ?? 0) + (mi.cachedBytes ?? 0);
  available = Math.min(available, mi.totalBytes);
  const used = mi.totalBytes - available;
  const swapTotal = mi.swapTotalBytes ?? 0;
  const swapUsed = swapTotal > 0 && isNum(mi.swapFreeBytes) ? Math.max(0, swapTotal - mi.swapFreeBytes) : 0;
  return {
    totalBytes: mi.totalBytes,
    availableBytes: available,
    usedBytes: used,
    usedPct: (used / mi.totalBytes) * 100,
    availablePct: (available / mi.totalBytes) * 100,
    cachedBytes: mi.cachedBytes,
    buffersBytes: mi.buffersBytes,
    swap: {
      totalBytes: swapTotal,
      usedBytes: swapUsed,
      freeBytes: swapTotal - swapUsed,
      usedPct: swapTotal > 0 ? (swapUsed / swapTotal) * 100 : null,
    },
  };
}

/** /proc/cpuinfo → { model, threads, cores, sockets, mhz: [per thread] }. */
export function parseCpuinfo(text) {
  const blocks = String(text ?? '').split(/\r?\n\s*\r?\n/);
  let model = null;
  let threads = 0;
  const coreKeys = new Set();
  const sockets = new Set();
  let cpuCores = null;
  const mhz = [];
  for (const block of blocks) {
    const fields = {};
    for (const line of lines(block)) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    if (!('processor' in fields)) continue;
    threads += 1;
    model ??= fields['model name'] || fields['Model'] || fields['cpu model'] || null;
    if (fields['physical id'] !== undefined) sockets.add(fields['physical id']);
    if (fields['core id'] !== undefined) coreKeys.add(`${fields['physical id'] ?? 0}:${fields['core id']}`);
    if (fields['cpu cores'] !== undefined) cpuCores ??= num(fields['cpu cores']);
    mhz.push(num(fields['cpu MHz']));
  }
  const socketCount = Math.max(1, sockets.size);
  const cores = coreKeys.size || (isNum(cpuCores) ? cpuCores * socketCount : threads) || null;
  return { model: model ? model.replace(/\s+/g, ' ') : null, threads: threads || null, cores, sockets: socketCount, mhz };
}

// ---------------------------------------------------------------------------------------------------
// Disks: /proc/diskstats and /proc/self/mounts

const WHOLE_DISK = /^((?:s|h|v|xv)d[a-z]+|nvme\d+n\d+|mmcblk\d+)$/;

/** True for a whole physical disk (sda, nvme0n1, vda, mmcblk0) rather than a partition, loop, ram or dm. */
export const isWholeDisk = (name) => WHOLE_DISK.test(name);

/** "sda2" → "sda", "nvme0n1p2" → "nvme0n1", "mmcblk0p1" → "mmcblk0"; anything else is returned as is. */
export function parentDisk(name) {
  let m = /^(nvme\d+n\d+|mmcblk\d+)p\d+$/.exec(name);
  if (m) return m[1];
  m = /^((?:s|h|v|xv)d[a-z]+)\d+$/.exec(name);
  return m ? m[1] : name;
}

/** /proc/diskstats → [{ name, major, minor, readsCompleted, sectorsRead, writesCompleted, sectorsWritten, msIo, ... }]. */
export function parseDiskstats(text) {
  const out = [];
  for (const line of lines(text)) {
    const p = line.trim().split(/\s+/);
    if (p.length < 14) continue;
    const f = p.slice(3).map(Number);
    if (f.slice(0, 11).some((n) => !Number.isFinite(n))) continue;
    out.push({
      major: Number(p[0]),
      minor: Number(p[1]),
      name: p[2],
      readsCompleted: f[0],
      sectorsRead: f[2],
      msReading: f[3],
      writesCompleted: f[4],
      sectorsWritten: f[6],
      msWriting: f[7],
      inFlight: f[8],
      msIo: f[9],
      weightedMs: f[10],
    });
  }
  return out;
}

/** Decode the octal escapes the kernel uses in mount paths ("\040" is a space). */
export const unescapeMount = (s) => s.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));

/** /proc/self/mounts → [{ device, mount, fs, options }]. */
export function parseMounts(text) {
  const out = [];
  for (const line of lines(text)) {
    const p = line.split(' ');
    if (p.length < 4) continue;
    out.push({ device: unescapeMount(p[0]), mount: unescapeMount(p[1]), fs: p[2], options: p[3].split(',') });
  }
  return out;
}

const REAL_FS = new Set(['ext2', 'ext3', 'ext4', 'xfs', 'btrfs', 'f2fs', 'vfat', 'exfat', 'ntfs', 'ntfs3', 'fuseblk', 'zfs', 'jfs', 'reiserfs', 'hfsplus', 'bcachefs']);
const SKIP_MOUNT = /^\/(?:snap|var\/snap|var\/lib\/docker|var\/lib\/containers|proc|sys|dev)(?:\/|$)/;

/** A mounted real filesystem worth reporting (not snaps, loops, tmpfs, overlays or system pseudo mounts). */
export function isRealMount(m) {
  if (!m || !REAL_FS.has(m.fs)) return false;
  if (m.fs !== 'zfs' && !m.device.startsWith('/dev/')) return false;
  if (/^\/dev\/loop\d+$/.test(m.device)) return false;
  if (SKIP_MOUNT.test(m.mount)) return false;
  if (m.mount.startsWith('/run/') && !m.mount.startsWith('/run/media/')) return false;
  return true;
}

/** Real mounts, one per device (bind mounts dropped), "/" first then by path. */
export function realMounts(mounts) {
  const byDevice = new Map();
  for (const m of mounts) {
    if (!isRealMount(m)) continue;
    const prev = byDevice.get(m.device);
    if (!prev || m.mount.length < prev.mount.length) byDevice.set(m.device, m);
  }
  return [...byDevice.values()].sort((a, b) => (a.mount === '/' ? -1 : b.mount === '/' ? 1 : a.mount.localeCompare(b.mount)));
}

/**
 * fs.statfs result → usage like `df`: used = blocks - bfree, free = bavail (what a normal user can still
 * write), usedPct = used / (used + bavail).
 */
export function statfsUsage(st) {
  if (!st || !isNum(st.blocks) || !isNum(st.bsize) || st.blocks <= 0) return null;
  const total = st.blocks * st.bsize;
  const used = (st.blocks - st.bfree) * st.bsize;
  const free = st.bavail * st.bsize;
  const denom = used + free;
  return { totalBytes: total, usedBytes: used, freeBytes: free, usedPct: denom > 0 ? (used / denom) * 100 : null };
}

// ---------------------------------------------------------------------------------------------------
// Network: /proc/net/dev and /proc/net/route

/** /proc/net/dev → [{ iface, rxBytes, rxPackets, rxErrs, rxDrop, txBytes, txPackets, txErrs, txDrop }]. */
export function parseNetDev(text) {
  const out = [];
  for (const line of lines(text)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const iface = line.slice(0, i).trim();
    if (!iface || iface.includes('|')) continue;
    const f = line.slice(i + 1).trim().split(/\s+/).map(Number);
    if (f.length < 16 || f.some((n) => !Number.isFinite(n))) continue;
    out.push({
      iface,
      rxBytes: f[0],
      rxPackets: f[1],
      rxErrs: f[2],
      rxDrop: f[3],
      txBytes: f[8],
      txPackets: f[9],
      txErrs: f[10],
      txDrop: f[11],
    });
  }
  return out;
}

/** Little-endian hex from /proc/net/route ("0101A8C0") → "192.168.1.1". */
export function hexToIPv4(hex) {
  if (!/^[0-9A-Fa-f]{8}$/.test(hex ?? '')) return null;
  const n = parseInt(hex, 16);
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255].join('.');
}

/** /proc/net/route → the default route with the lowest metric: { iface, gateway, metric }, or null. */
export function parseDefaultRoute(text) {
  let best = null;
  for (const line of lines(text).slice(1)) {
    const p = line.trim().split(/\s+/);
    if (p.length < 8) continue;
    const [iface, dest, gw, flagsHex, , , metric, mask] = p;
    const flags = parseInt(flagsHex, 16);
    if (dest !== '00000000' || mask !== '00000000' || !(flags & 1)) continue;
    const m = Number(metric);
    if (!best || m < best.metric) best = { iface, gateway: hexToIPv4(gw), metric: m };
  }
  return best;
}

/** Interface kind from its predictable name: "ethernet", "wifi", "mobile", "vpn" or null. */
export function ifaceKind(name) {
  if (/^(en|eth)/.test(name)) return 'ethernet';
  if (/^(wl|wlan)/.test(name)) return 'wifi';
  if (/^ww/.test(name)) return 'mobile';
  if (/^(tailscale|tun|tap|wg)/.test(name)) return 'vpn';
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Processes: /proc/[pid]/stat and statm

const PF_KTHREAD = 0x00200000;

/**
 * /proc/[pid]/stat → { pid, comm, state, ppid, kernelThread, utime, stime, numThreads, starttime,
 * vsizeBytes, rssPages }. The command name may hold spaces and parentheses, so the line is split at
 * the last ")".
 */
export function parsePidStat(text) {
  if (typeof text !== 'string') return null;
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close < open) return null;
  const pid = Number(text.slice(0, open).trim());
  const comm = text.slice(open + 1, close);
  const f = text.slice(close + 2).trim().split(/\s+/);
  if (!Number.isInteger(pid) || f.length < 22) return null;
  const flags = Number(f[6]);
  const out = {
    pid,
    comm,
    state: f[0],
    ppid: Number(f[1]),
    kernelThread: Number.isFinite(flags) ? (flags & PF_KTHREAD) !== 0 : false,
    utime: Number(f[11]),
    stime: Number(f[12]),
    numThreads: Number(f[17]),
    starttime: Number(f[19]),
    vsizeBytes: Number(f[20]),
    rssPages: Number(f[21]),
  };
  if (![out.utime, out.stime, out.starttime, out.rssPages].every(Number.isFinite)) return null;
  return out;
}

/** /proc/[pid]/statm → page counts { sizePages, residentPages, sharedPages, textPages, dataPages }. */
export function parsePidStatm(text) {
  const p = String(text ?? '').trim().split(/\s+/).map(Number);
  if (p.length < 6 || p.slice(0, 6).some((n) => !Number.isFinite(n))) return null;
  return { sizePages: p[0], residentPages: p[1], sharedPages: p[2], textPages: p[3], dataPages: p[5] };
}

// ---------------------------------------------------------------------------------------------------
// nvidia-smi

export const NVIDIA_FIELDS = [
  'name',
  'driver_version',
  'utilization.gpu',
  'memory.used',
  'memory.total',
  'temperature.gpu',
  'power.draw',
  'power.limit',
  'fan.speed',
  'clocks.sm',
];
export const NVIDIA_ARGS = [`--query-gpu=${NVIDIA_FIELDS.join(',')}`, '--format=csv,noheader,nounits'];

/** A CSV value with "[N/A]", "[Not Supported]" or "N/A" meaning not available. */
const smiNum = (s) => {
  const t = String(s ?? '').trim();
  if (!t || /^\[.*\]$/.test(t) || /^n\/?a$/i.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

/** nvidia-smi --query-gpu CSV (noheader, nounits) → one record per GPU. */
export function parseNvidiaSmi(text) {
  const out = [];
  for (const line of lines(text)) {
    if (!line.trim()) continue;
    const c = line.split(',').map((s) => s.trim());
    if (c.length < NVIDIA_FIELDS.length) continue;
    const memUsed = smiNum(c[3]);
    const memTotal = smiNum(c[4]);
    out.push({
      name: c[0] || null,
      driver: smiNum(c[1]) === null && !/\d/.test(c[1]) ? null : c[1],
      utilPct: smiNum(c[2]),
      memUsedMB: memUsed,
      memTotalMB: memTotal,
      memPct: isNum(memUsed) && isNum(memTotal) && memTotal > 0 ? (memUsed / memTotal) * 100 : null,
      tempC: smiNum(c[5]),
      powerW: smiNum(c[6]),
      powerLimitW: smiNum(c[7]),
      fanPct: smiNum(c[8]),
      clockMHz: smiNum(c[9]),
    });
  }
  return out;
}

/**
 * Why nvidia-smi gave no reading, from its run result ({ error, code, stdout, stderr }):
 * { status: 'not-installed' | 'driver-not-loaded' | 'no-device' | 'error', detail }.
 */
export function classifyNvidiaFailure(r) {
  const text = `${r?.stdout ?? ''}\n${r?.stderr ?? ''}`;
  if (r?.error === 'ENOENT') return { status: 'not-installed', detail: 'nvidia-smi is not installed (no NVIDIA driver)' };
  if (r?.error === 'TIMEOUT') return { status: 'error', detail: 'nvidia-smi did not answer in time' };
  if (/couldn't communicate with the NVIDIA driver|NVIDIA driver is not loaded|driver.*not loaded/i.test(text)) {
    return { status: 'driver-not-loaded', detail: 'nvidia-smi cannot talk to the NVIDIA driver' };
  }
  if (/No devices were found/i.test(text)) return { status: 'no-device', detail: 'nvidia-smi found no NVIDIA GPU' };
  return { status: 'error', detail: (text.trim().split(/\r?\n/)[0] || 'nvidia-smi failed').slice(0, 160) };
}

// ---------------------------------------------------------------------------------------------------
// Tailscale

const BACKEND = {
  Running: 'running',
  NeedsLogin: 'logged-out',
  NeedsMachineAuth: 'needs-approval',
  Stopped: 'stopped',
  Starting: 'starting',
  NoState: 'starting',
};

function deviceKind(os, name) {
  const o = String(os ?? '').toLowerCase();
  if (o === 'ios') return /ipad/i.test(name ?? '') ? 'iPad' : 'iPhone';
  if (o === 'macos') return 'Mac';
  if (o === 'windows') return 'Windows PC';
  if (o === 'android') return 'Android phone';
  if (o === 'tvos') return 'Apple TV';
  if (o === 'linux') return 'Linux computer';
  return 'device';
}

const firstLabel = (dns) => (dns ? dns.split('.')[0] : null);

/**
 * `tailscale status --json` → { status, backendState, hostName, dnsName, url, ips, tailnet,
 * magicDnsSuffix, version, peers: [{ name, hostName, dnsName, os, kind, online, lastSeen, active }],
 * online, total }. Peers are sorted online first, then by name.
 */
export function parseTailscaleStatus(text) {
  let j;
  try {
    j = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return { status: 'error', detail: 'tailscale status was not valid JSON' };
  }
  if (!j || typeof j !== 'object') return { status: 'error', detail: 'tailscale status was empty' };
  const backendState = typeof j.BackendState === 'string' ? j.BackendState : null;
  const self = j.Self && typeof j.Self === 'object' ? j.Self : {};
  const dnsName = trimDot(self.DNSName) || null;
  const peers = Object.values(j.Peer && typeof j.Peer === 'object' ? j.Peer : {})
    .filter((p) => p && typeof p === 'object')
    .map((p) => {
      const dns = trimDot(p.DNSName);
      const name = firstLabel(dns) || p.HostName || 'device';
      return {
        name,
        hostName: p.HostName ?? null,
        dnsName: dns,
        os: p.OS ?? null,
        kind: deviceKind(p.OS, `${name} ${p.HostName ?? ''}`),
        online: p.Online === true,
        lastSeen: parseGoTime(p.LastSeen),
        active: p.Active === true,
      };
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return {
    status: BACKEND[backendState] ?? 'unknown',
    backendState,
    hostName: self.HostName ?? null,
    dnsName,
    url: backendState === 'Running' && dnsName ? `https://${dnsName}/` : null,
    ips: Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs.filter((s) => typeof s === 'string') : [],
    tailnet: j.CurrentTailnet?.Name ?? null,
    magicDnsSuffix: j.CurrentTailnet?.MagicDNSSuffix ?? j.MagicDNSSuffix ?? null,
    version: typeof j.Version === 'string' ? j.Version.split('-')[0] : null,
    peers,
    online: peers.filter((p) => p.online).length,
    total: peers.length,
  };
}

/** Why `tailscale status` failed, from its run result. */
export function classifyTailscaleFailure(r) {
  const text = `${r?.stdout ?? ''}\n${r?.stderr ?? ''}`;
  if (r?.error === 'ENOENT') return { status: 'not-installed', detail: 'Tailscale is not installed' };
  if (r?.error === 'TIMEOUT') return { status: 'error', detail: 'tailscale did not answer in time' };
  if (/failed to connect to local tailscale|tailscaled.*not running|doesn't appear to be running/i.test(text)) {
    return { status: 'not-running', detail: 'the Tailscale service (tailscaled) is not running' };
  }
  return { status: 'error', detail: (text.trim().split(/\r?\n/)[0] || 'tailscale status failed').slice(0, 160) };
}

/**
 * `tailscale serve status --json` → { configured, target }: configured is true when some HTTPS handler
 * proxies to this port on localhost.
 */
export function parseTailscaleServe(text, port = 8788) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { configured: null, target: null };
  }
  const web = j && typeof j === 'object' && j.Web && typeof j.Web === 'object' ? j.Web : {};
  for (const site of Object.values(web)) {
    for (const h of Object.values(site?.Handlers ?? {})) {
      const proxy = typeof h?.Proxy === 'string' ? h.Proxy : '';
      if (new RegExp(`^(?:https?://)?(?:127\\.0\\.0\\.1|localhost|\\[::1\\])?:?${port}/?$`).test(proxy)) {
        return { configured: true, target: proxy };
      }
    }
  }
  return { configured: false, target: null };
}

// ---------------------------------------------------------------------------------------------------
// smartctl -j -H -A

const SMART_ATTR = { 5: 'reallocated', 197: 'pending', 198: 'uncorrectable' };

/**
 * smartctl JSON → { device, model, passed, reallocated, pending, uncorrectable, powerOnHours, tempC,
 * exitStatus, permissionDenied, detail }. passed is null when the health check did not run.
 */
export function parseSmartctl(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { passed: null, permissionDenied: /permission denied/i.test(String(text)), detail: 'unreadable smartctl output' };
  }
  const messages = (j?.smartctl?.messages ?? []).map((m) => String(m?.string ?? '')).filter(Boolean);
  const exitStatus = Number.isInteger(j?.smartctl?.exit_status) ? j.smartctl.exit_status : null;
  const out = {
    device: j?.device?.name ?? null,
    model: j?.model_name ?? j?.model_family ?? null,
    passed: typeof j?.smart_status?.passed === 'boolean' ? j.smart_status.passed : null,
    reallocated: null,
    pending: null,
    uncorrectable: null,
    powerOnHours: isNum(j?.power_on_time?.hours) ? j.power_on_time.hours : null,
    tempC: isNum(j?.temperature?.current) ? j.temperature.current : null,
    exitStatus,
    permissionDenied: messages.some((m) => /permission denied|operation not permitted/i.test(m)) || (exitStatus !== null && (exitStatus & 2) !== 0 && j?.smart_status === undefined),
    detail: messages[0] ?? null,
  };
  for (const row of j?.ata_smart_attributes?.table ?? []) {
    const key = SMART_ATTR[row?.id];
    if (key && isNum(row?.raw?.value)) out[key] = row.raw.value;
  }
  if (j?.nvme_smart_health_information_log) {
    const n = j.nvme_smart_health_information_log;
    if (isNum(n.media_errors)) out.uncorrectable = n.media_errors;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// The Jarvis site's service worker and /etc/os-release

/** sw.js text → its build id ("const CACHE = 'jarvis-5f3c9e1a'"), or null. */
export function parseSwBuildId(text) {
  const s = String(text ?? '');
  const m = /const\s+CACHE\s*=\s*['"`]jarvis-([A-Za-z0-9._-]{4,64})['"`]/.exec(s) || /['"`]jarvis-([0-9a-f]{8,64})['"`]/.exec(s);
  if (!m || m[1] === '__BUILD_ID__') return null;
  return m[1];
}

/** /etc/os-release → { prettyName, id, versionId }. */
export function parseOsRelease(text) {
  const out = {};
  for (const line of lines(text)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return { prettyName: out.PRETTY_NAME ?? null, id: out.ID ?? null, versionId: out.VERSION_ID ?? null };
}
