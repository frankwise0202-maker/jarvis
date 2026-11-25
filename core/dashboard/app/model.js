// The dashboard's view model: one adapter from the Core's JSON (GET /api/status, the SSE `tick`
// and `status` frames, /api/info, /api/events, /api/history) to the plain shape the panels draw.
// It reads the Core's own field names first (core/server/core.mjs: cpu.usagePct, memory.usedPct,
// disks.mounts, gpu.utilPct, services.internet.status, …) and a few aliases, and keeps every
// unknown value as null so the panels can say "not checked" or "driver not loaded"; nothing is
// invented. Pure (no DOM): unit tested in Node.

import { num, clamp } from './format.js';

export const LEVELS = Object.freeze(['ok', 'warn', 'alert']);
const RANK = { ok: 0, warn: 1, alert: 2 };

/** 'ok' | 'warn' | 'alert' from the many ways a level can be written; unknown → fallback. */
export function level(v, fallback = 'ok') {
  const s = String(v ?? '').toLowerCase();
  if (s === 'ok' || s === 'good' || s === 'normal' || s === 'nominal' || s === 'info') return 'ok';
  if (s === 'warn' || s === 'warning' || s === 'caution' || s === 'degraded') return 'warn';
  if (s === 'alert' || s === 'error' || s === 'critical' || s === 'crit' || s === 'danger' || s === 'fail' || s === 'failed') return 'alert';
  return fallback;
}

export function worst(a, b) {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Read a nested value by trying several dotted paths; the first non-null wins. */
export function pick(obj, ...paths) {
  for (const p of paths) {
    let v = obj;
    for (const key of p.split('.')) {
      if (v === null || v === undefined) break;
      v = v[key];
    }
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** A 0–100 percentage, or null. */
function pct(v) {
  const n = num(v);
  return n === null ? null : clamp(n, 0, 100);
}

function timeMs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? (v < 1e12 ? v * 1000 : v) : null; // seconds or ms
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function str(v) {
  if (v === null || v === undefined || typeof v === 'object') return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** A short CPU name: "Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz" → "Intel Core i7-6700". */
export function shortCpuName(model) {
  const s = str(model);
  if (!s) return null;
  return s
    .replace(/\((?:R|TM|tm|r)\)/g, '')
    .replace(/\bCPU\b/g, '')
    .replace(/@.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "NVIDIA GeForce GTX 970" stays; "GeForce GTX 970/PCIe/SSE2" → "GeForce GTX 970". */
export function shortGpuName(name) {
  const s = str(name);
  if (!s) return null;
  return s.split('/')[0].trim();
}

// ---- sections ------------------------------------------------------------------------------

function normCpu(raw) {
  const c = pick(raw, 'cpu') || {};
  const perRaw = pick(c, 'perThreadPct', 'perThread');
  const perThread = Array.isArray(perRaw) ? perRaw.map((v) => pct(v)) : [];
  const t = c.temp && typeof c.temp === 'object' && !Array.isArray(c.temp) ? c.temp : null;
  const tempKnown = t ? t.available !== false : false;
  const coresRaw = t ? pick(t, 'coresC', 'cores') : null;
  const load = pick(c, 'load', 'loadavg');
  return {
    model: str(pick(c, 'model', 'name')),
    cores: num(pick(c, 'cores')),
    threads: num(pick(c, 'threads')) ?? (perThread.length || null),
    usage: pct(pick(c, 'usagePct', 'usage')),
    perThread,
    load: Array.isArray(load) ? load.map(num) : null,
    freqMHz: num(pick(c, 'freqMHz')),
    freqMaxMHz: num(pick(c, 'freqMaxMHz')),
    temp: tempKnown ? num(pick(t, 'packageC', 'maxC', 'package')) : num(typeof c.temp === 'number' ? c.temp : null),
    tempCores: Array.isArray(coresRaw) ? coresRaw.map(num).filter((x) => x !== null) : [],
  };
}

function normMem(raw) {
  const m = pick(raw, 'memory', 'mem') || {};
  const total = num(pick(m, 'totalBytes', 'total'));
  const available = num(pick(m, 'availableBytes', 'available'));
  let used = num(pick(m, 'usedBytes', 'used'));
  if (used === null && total !== null && available !== null) used = total - available;
  let usedPct = pct(pick(m, 'usedPct'));
  if (usedPct === null && total && used !== null) usedPct = (used / total) * 100;
  let availPct = pct(pick(m, 'availablePct'));
  if (availPct === null && total && available !== null) availPct = (available / total) * 100;
  const sw = m.swap && typeof m.swap === 'object' ? m.swap : {};
  const swapTotal = num(pick(sw, 'totalBytes', 'total')) ?? num(pick(m, 'swapTotal'));
  const swapUsed = num(pick(sw, 'usedBytes', 'used')) ?? num(pick(m, 'swapUsed'));
  let swapPct = pct(pick(sw, 'usedPct'));
  if (swapPct === null && swapTotal && swapUsed !== null) swapPct = (swapUsed / swapTotal) * 100;
  return { total, used, available, usedPct, availPct, swapTotal, swapUsed, swapPct };
}

function normDisks(raw) {
  const list = pick(raw, 'disks.mounts', 'filesystems') ?? (Array.isArray(raw.disks) ? raw.disks : undefined);
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const d of list) {
    if (!d || typeof d !== 'object') continue;
    const total = num(pick(d, 'totalBytes', 'total'));
    const free = num(pick(d, 'freeBytes', 'free'));
    let used = num(pick(d, 'usedBytes', 'used'));
    if (used === null && total !== null && free !== null) used = total - free;
    let usedPct = pct(pick(d, 'usedPct'));
    if (usedPct === null && total && used !== null) usedPct = (used / total) * 100;
    out.push({
      mount: str(pick(d, 'mount', 'mountpoint')) || '?',
      fs: str(pick(d, 'fs', 'fstype')),
      device: str(pick(d, 'device')),
      disk: str(pick(d, 'disk')),
      total,
      used,
      free: free ?? (total !== null && used !== null ? total - used : null),
      usedPct,
    });
  }
  // The system disk first, then by mount point.
  out.sort((a, b) => (a.mount === '/' ? -1 : b.mount === '/' ? 1 : a.mount.localeCompare(b.mount)));
  return out;
}

/** The physical drive behind / (model, size, spinning or not) for the storage panel. */
function normDrive(raw, disks) {
  const devs = pick(raw, 'disks.devices');
  if (!Array.isArray(devs) || !devs.length) return null;
  const rootDisk = disks.find((d) => d.mount === '/')?.disk;
  const d = devs.find((x) => x && x.name === rootDisk) || devs[0];
  if (!d || typeof d !== 'object') return null;
  return { name: str(d.name), model: str(d.model), size: num(d.sizeBytes), rotational: typeof d.rotational === 'boolean' ? d.rotational : null };
}

/** SMART words → 'passed' | 'warning' | 'failed' | 'not-checked' | 'unknown'. */
export function smartStatus(v) {
  if (v === true) return 'passed';
  if (v === false) return 'failed';
  const s = String(v ?? '')
    .toLowerCase()
    .trim();
  if (!s) return 'not-checked';
  if (s.includes('not checked') || s === 'not-checked' || s === 'unchecked' || s === 'unavailable' || s === 'n/a' || s === 'none') return 'not-checked';
  if (s.includes('pass') || s === 'ok' || s === 'good' || s === 'healthy') return 'passed';
  if (s === 'warning' || s === 'warn' || s === 'worn') return 'warning';
  if (s.includes('fail') || s === 'bad' || s.includes('critical')) return 'failed';
  return 'unknown';
}

function normDiskHealth(raw) {
  const h = pick(raw, 'disks.health', 'diskHealth', 'smart');
  if (h === undefined) return { status: 'not-checked', detail: null, model: null, device: null };
  if (typeof h !== 'object') return { status: smartStatus(h), detail: str(h), model: null, device: null };
  const devices = Array.isArray(h) ? h : Array.isArray(h.devices) ? h.devices : [];
  let status = h.status !== undefined && !Array.isArray(h) ? smartStatus(h.status) : 'not-checked';
  if (status === 'not-checked' && devices.length) {
    // No overall word: the worst device decides.
    const order = { failed: 3, warning: 2, unknown: 1, passed: 0, 'not-checked': -1 };
    for (const d of devices) {
      const s = smartStatus(pick(d, 'status', 'passed'));
      if (order[s] > order[status]) status = s;
    }
  }
  const first = devices.find((d) => d && typeof d === 'object') || {};
  return { status, detail: str(pick(h, 'detail')), model: str(first.model), device: str(first.name ?? first.device) };
}

function normNet(raw) {
  const n = pick(raw, 'network', 'net') || {};
  return {
    iface: str(pick(n, 'interface', 'iface')),
    kind: str(pick(n, 'kind')),
    speedMbps: num(pick(n, 'speedMbps')),
    rxBps: num(pick(n, 'rxBps')),
    txBps: num(pick(n, 'txBps')),
  };
}

const GPU_MISSING = new Set(['not-installed', 'driver-not-loaded', 'no-device', 'missing', 'nodriver']);

/**
 * GPU: { state: 'ok' | 'pending' | 'nodriver' | 'error' | 'unknown', … }. A missing driver is its own
 * state (the common case on a fresh Ubuntu), not an error.
 */
function normGpu(raw) {
  const g = pick(raw, 'gpu');
  if (!g || typeof g !== 'object') return { state: 'unknown', message: null, detail: null, name: null, fallbackTemp: null };
  const status = str(g.status)?.toLowerCase() ?? null;
  const reason = str(pick(g, 'detail', 'reason', 'error'));
  const name = shortGpuName(pick(g, 'name'));
  if (g.available === false || (status && status !== 'ok')) {
    let state = 'error';
    if (status === 'pending') state = 'pending';
    else if (GPU_MISSING.has(status)) state = 'nodriver';
    else if (!status && (!reason || /driver|nvidia-smi|not (found|loaded|installed)|missing|enoent|no devices/i.test(reason))) state = 'nodriver';
    const ft = num(pick(g, 'tempC'));
    return { state, message: str(g.message), detail: reason, name, fallbackTemp: ft !== null ? { temp: ft, source: str(g.tempSource) } : null };
  }
  const MiB = 1024 * 1024;
  const usedMiB = num(pick(g, 'memUsedMB', 'memUsedMiB'));
  const totalMiB = num(pick(g, 'memTotalMB', 'memTotalMiB'));
  const memUsed = usedMiB !== null ? usedMiB * MiB : num(pick(g, 'memUsed'));
  const memTotal = totalMiB !== null ? totalMiB * MiB : num(pick(g, 'memTotal'));
  let memPct = pct(pick(g, 'memPct'));
  if (memPct === null && memTotal) memPct = ((memUsed ?? 0) / memTotal) * 100;
  return {
    state: 'ok',
    message: null,
    detail: null,
    name,
    driver: str(pick(g, 'driver')),
    util: pct(pick(g, 'utilPct', 'util')),
    memUsed,
    memTotal,
    memPct,
    temp: num(pick(g, 'tempC', 'temp')),
    power: num(pick(g, 'powerW', 'power')),
    powerLimit: num(pick(g, 'powerLimitW', 'powerLimit')),
    fan: pct(pick(g, 'fanPct', 'fan')),
    clock: num(pick(g, 'clockMHz', 'clock')),
    fallbackTemp: null,
  };
}

function normProcList(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 5).map((p) => ({
    pid: num(pick(p, 'pid')),
    name: str(pick(p, 'label', 'name', 'comm')) || '?',
    cpu: num(pick(p, 'cpuPct', 'cpu')),
    threadPct: num(pick(p, 'threadPct')),
    mem: num(pick(p, 'memBytes', 'mem')),
  }));
}

function normProcs(raw) {
  const p = pick(raw, 'processes', 'procs') || {};
  return { byCpu: normProcList(pick(p, 'topCpu', 'byCpu')), byMem: normProcList(pick(p, 'topMem', 'byMem')), total: num(p.total) };
}

/** A service check: status 'up' | 'down' | 'unknown' → ok true | false | null. */
function normCheck(c) {
  if (!c || typeof c !== 'object') return { ok: null, latencyMs: null, checkedAt: null, detail: null };
  const st = String(c.status ?? '').toLowerCase();
  let ok = st === 'up' || st === 'ok' ? true : st === 'down' || st === 'error' ? false : null;
  if (ok === null && typeof c.ok === 'boolean') ok = c.ok;
  return { ok, latencyMs: num(c.latencyMs), checkedAt: timeMs(c.checkedAt), detail: str(c.detail) };
}

function normTailscale(raw) {
  const t = pick(raw, 'services.tailscale', 'tailscale');
  if (!t || typeof t !== 'object') return { status: null, dnsName: null, url: null, peers: [], online: null, total: null, checkedAt: null, detail: null };
  const peers = [];
  for (const p of Array.isArray(t.peers) ? t.peers : []) {
    if (!p || typeof p !== 'object') continue;
    peers.push({
      name: str(pick(p, 'name', 'hostName', 'dnsName')) || 'device',
      os: str(p.os),
      kind: str(p.kind),
      online: p.online === true,
      lastSeen: timeMs(p.lastSeen),
      self: p.self === true,
    });
  }
  const status = str(t.status) ?? str(t.state);
  return {
    status: status ? status.toLowerCase() : null,
    dnsName: str(pick(t, 'dnsName'))?.replace(/\.$/, '') ?? null,
    url: str(t.url),
    peers,
    online: num(t.online) ?? peers.filter((p) => p.online && !p.self).length,
    total: num(t.total) ?? peers.filter((p) => !p.self).length,
    checkedAt: timeMs(t.checkedAt),
    detail: str(t.detail),
  };
}

function normHealth(raw) {
  const h = pick(raw, 'health') || {};
  const items = [];
  for (const it of Array.isArray(h.items) ? h.items : []) {
    if (!it || typeof it !== 'object') continue;
    items.push({
      id: str(pick(it, 'id')) || '',
      level: level(pick(it, 'level'), 'warn'),
      label: str(it.label),
      title: str(pick(it, 'message', 'title', 'text')) || str(it.label) || '',
      detail: str(it.detail),
      since: timeMs(it.since),
    });
  }
  let lv = level(pick(h, 'level'), 'ok');
  for (const it of items) lv = worst(lv, it.level);
  const counts = h.counts && typeof h.counts === 'object' ? { warn: num(h.counts.warn) ?? 0, alert: num(h.counts.alert) ?? 0 } : null;
  return { level: lv, summary: str(h.summary), items, counts };
}

/** The subsystem a health item is about, from its id: "cpu.temp" → "cpu", "disk:/" → "disk". */
export function subsystemOf(id) {
  const s = String(id || '').toLowerCase();
  if (/^(cpu|proc)/.test(s)) return 'cpu';
  if (/^gpu/.test(s)) return 'gpu';
  if (/^(mem|ram|swap)/.test(s)) return 'mem';
  if (/^(disk|storage|fs|smart|mount)/.test(s)) return 'disk';
  if (/^(net|internet|dns|latency)/.test(s)) return 'net';
  if (/^(api|claude|anthropic)/.test(s)) return 'api';
  if (/^(site|web|pages)/.test(s)) return 'site';
  if (/^(tailscale|ts)/.test(s)) return 'tailscale';
  return 'other';
}

/** Local thresholds (the brief's health rules) for meter colors only; health words come from the Core. */
export function meterLevel(kind, value) {
  const v = num(value);
  if (v === null) return 'ok';
  switch (kind) {
    case 'disk':
      return v >= 95 ? 'alert' : v >= 85 ? 'warn' : 'ok';
    case 'memAvail':
      return v < 5 ? 'alert' : v < 10 ? 'warn' : 'ok';
    case 'cpuTemp':
      return v >= 90 ? 'alert' : v >= 80 ? 'warn' : 'ok';
    case 'gpuTemp':
      return v >= 88 ? 'alert' : v >= 80 ? 'warn' : 'ok';
    case 'swap':
      return v >= 80 ? 'alert' : v >= 50 ? 'warn' : 'ok';
    default:
      return 'ok';
  }
}

/**
 * The dashboard's settings and the Core's identity from GET /api/info: version, mode, the Core's
 * time zone, and kiosk settings (`night` {enabled, start, end} → nightDim, `urls.app` → jarvisUrl).
 */
export function readInfo(info) {
  const i = info && typeof info === 'object' ? info : {};
  const extra = pick(i, 'dashboard', 'config', 'settings');
  const config = extra && typeof extra === 'object' ? { ...extra } : {};
  const night = i.night;
  if (night && typeof night === 'object' && config.nightDim === undefined) {
    config.nightDim = night.enabled === false ? 'off' : { start: night.start, end: night.end };
  }
  const app = str(pick(i, 'urls.app'));
  if (app && config.jarvisUrl === undefined) config.jarvisUrl = app;
  return {
    version: str(pick(i, 'version', 'core.version')),
    url: str(pick(i, 'urls.tailscale', 'tailscale.url', 'tailscaleUrl')),
    config,
    mode: str(i.mode),
    timeZone: str(i.timeZone),
    ownerName: str(i.ownerName),
  };
}

/**
 * Apply a stream `tick` to the last full status, as the Core's stream contract says: every section
 * the tick carries replaces the old one wholesale, except `health`, whose items (absent from ticks)
 * are kept until the next full `status` frame; `services` (absent from ticks) are kept as they are.
 */
export function applyTick(base, tick) {
  if (!tick || typeof tick !== 'object' || Array.isArray(tick)) return base;
  const b = base && typeof base === 'object' ? base : {};
  const out = { ...b, ...tick };
  if (tick.health && typeof tick.health === 'object') {
    const items = b.health && Array.isArray(b.health.items) ? b.health.items : undefined;
    out.health = items && !Array.isArray(tick.health.items) ? { ...tick.health, items } : tick.health;
  }
  return out;
}

/**
 * The full view model from a status object (the /api/status body, or the merge of a status and
 * stream ticks). `info` is the /api/info body.
 */
export function normalize(raw, info = null) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const inf = readInfo(info);
  const health = normHealth(r);
  const disks = normDisks(r);
  const services = pick(r, 'services') || {};
  const site = normCheck(pick(services, 'site') ?? pick(r, 'checks.site'));
  site.build = str(pick(services, 'site.buildId', 'site.build') ?? pick(r, 'checks.site.build'));
  const vm = {
    t: timeMs(pick(r, 't')),
    mode: str(r.mode),
    host: {
      name: str(pick(r, 'host.hostname', 'host.name')),
      os: str(pick(r, 'host.os')),
      kernel: str(pick(r, 'host.kernel')),
    },
    uptimeS: num(pick(r, 'host.uptimeSec', 'uptimeS')),
    health,
    cpu: normCpu(r),
    mem: normMem(r),
    disks,
    drive: normDrive(r, disks),
    io: { readBps: num(pick(r, 'disks.readBps', 'io.readBps')), writeBps: num(pick(r, 'disks.writeBps', 'io.writeBps')) },
    diskHealth: normDiskHealth(r),
    net: normNet(r),
    gpu: normGpu(r),
    procs: normProcs(r),
    internet: normCheck(pick(services, 'internet') ?? pick(r, 'checks.internet')),
    api: normCheck(pick(services, 'api') ?? pick(r, 'checks.api')),
    site,
    tailscale: normTailscale(r),
    core: {
      version: str(pick(r, 'core.version')) || inf.version,
      uptimeS: num(pick(r, 'core.uptimeSec')),
      timeScale: num(pick(r, 'core.timeScale')),
      url: inf.url,
    },
  };
  // Per-subsystem levels from the Core's health items (the gauges and panel chips use them).
  const sub = { cpu: 'ok', gpu: 'ok', mem: 'ok', disk: 'ok', net: 'ok', api: 'ok', site: 'ok', tailscale: 'ok', other: 'ok' };
  const byId = {}; // item id → level ('cpu.temp', 'memory', 'disk:/', 'disk.health', …), for the values they are about
  for (const it of health.items) {
    const k = subsystemOf(it.id);
    sub[k] = worst(sub[k], it.level);
    if (it.id) byId[it.id] = worst(byId[it.id] || 'ok', it.level);
  }
  vm.levels = sub;
  vm.itemLevels = byId;
  return vm;
}

/**
 * Merge a compact stream snapshot into the last full status (objects merge key by key, arrays and
 * values replace). Returns a new object; the inputs are not changed.
 */
export function mergeSnapshot(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : patch;
  if (!base || typeof base !== 'object' || Array.isArray(base)) base = {};
  const out = { ...base };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergeSnapshot(base[k], v) : v;
  }
  return out;
}

/** The overall state word and its detail for the top bar and the core. */
export function stateWord(vm, online) {
  if (!online) return { word: 'OFFLINE', detail: 'NO SIGNAL', level: 'offline' };
  const items = vm.health.items;
  const counted = vm.health.counts;
  const warn = items.length ? items.filter((i) => i.level === 'warn').length : counted?.warn ?? 0;
  const alert = items.length ? items.filter((i) => i.level === 'alert').length : counted?.alert ?? 0;
  if (vm.health.level === 'alert') return { word: 'ALERT', detail: alert === 1 ? '1 ALERT' : alert ? `${alert} ALERTS` : 'ATTENTION', level: 'alert' };
  if (vm.health.level === 'warn') return { word: 'CAUTION', detail: warn === 1 ? '1 WARNING' : warn ? `${warn} WARNINGS` : 'CHECK', level: 'warn' };
  return { word: 'NOMINAL', detail: 'ALL SYSTEMS', level: 'ok' };
}

/** A tailnet device's short name: "franks-iphone.tail4b2c1.ts.net." → "franks-iphone". */
export function peerLabel(p) {
  const name = String(p.name || '?').replace(/\.$/, '').split('.')[0];
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
}

/** Peers sorted: this machine first, then online, then by name. */
export function sortPeers(peers) {
  return [...peers].sort((a, b) => (b.self === true) - (a.self === true) || (b.online === true) - (a.online === true) || String(a.name).localeCompare(String(b.name)));
}

/**
 * Events from GET api/events ({ events: [...] } or an array) or one pushed SSE event, normalized:
 * { id, t, level: 'ok' | 'warn' | 'alert', word: 'INFO' | 'OK' | 'WARN' | 'ALERT', title, detail }.
 */
export function parseEvents(body) {
  let list = [];
  if (Array.isArray(body)) list = body;
  else if (body && typeof body === 'object') {
    if (Array.isArray(body.events)) list = body.events;
    else if (Array.isArray(body.items)) list = body.items;
    else if (body.message || body.title || body.text) list = [body];
  }
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const title = str(pick(e, 'message', 'title', 'text', 'summary'));
    if (!title) continue;
    const raw = String(pick(e, 'level', 'severity') ?? '').toLowerCase();
    const lv = level(raw, 'ok');
    out.push({
      id: e.id === undefined || e.id === null ? null : String(e.id),
      t: timeMs(pick(e, 't', 'ts', 'time', 'at')),
      level: lv,
      word: raw === 'info' || raw === '' ? 'INFO' : lv === 'alert' ? 'ALERT' : lv === 'warn' ? 'WARN' : 'OK',
      title,
      detail: str(pick(e, 'detail')),
    });
  }
  return out;
}

/**
 * Points [[t ms, value], …] (oldest first) for one series of GET api/history, whatever the layout:
 *   { t: [...], series: { cpu: [...] } }           (the Core's: shared timestamps, one column per series)
 *   { series: { cpu: [[t, v], …] } }               { series: { cpu: [{ t, v }, …] } }
 *   { series: { cpu: { t0, step, values } } }      { t0, step, series: { cpu: [v, …] } }
 *   { t: [...], cpu: [...] }                       { points: [{ t, cpu, … }] }
 * Names: the dashboard asks for cpu, gpu, ram, netRx, netTx (aliases mem, rx, tx accepted).
 */
export function historyPoints(body, name) {
  if (!body || typeof body !== 'object') return [];
  const ALIASES = { cpu: ['cpu'], gpu: ['gpu'], ram: ['ram', 'mem'], mem: ['ram', 'mem'], netRx: ['netRx', 'rx'], rx: ['netRx', 'rx'], netTx: ['netTx', 'tx'], tx: ['netTx', 'tx'] };
  const names = ALIASES[name] || [name];
  const series = body.series && typeof body.series === 'object' ? body.series : null;
  const ts = Array.isArray(body.t) ? body.t : null;
  const out = [];
  const pushPoint = (t, v) => {
    const tm = timeMs(t);
    if (tm === null) return;
    out.push([tm, v === null || v === undefined ? null : num(v)]);
  };
  const fromSeries = (s) => {
    if (Array.isArray(s)) {
      const t0 = timeMs(pick(body, 't0', 'start'));
      const step = num(pick(body, 'step', 'stepMs'));
      for (let i = 0; i < s.length; i++) {
        const p = s[i];
        if (Array.isArray(p)) pushPoint(p[0], p[1]);
        else if (p && typeof p === 'object') pushPoint(pick(p, 't', 'ts', 'time'), pick(p, 'v', 'value', 'avg'));
        else if (ts) pushPoint(ts[i], p);
        else if (t0 !== null && step) pushPoint(t0 + i * step, p);
      }
    } else if (s && typeof s === 'object' && Array.isArray(s.values)) {
      const st = timeMs(pick(s, 't0', 'start'));
      const sp = num(pick(s, 'step', 'stepMs'));
      if (st !== null && sp) for (let i = 0; i < s.values.length; i++) pushPoint(st + i * sp, s.values[i]);
    }
  };
  if (series) {
    for (const n of names) {
      if (series[n] !== undefined) {
        fromSeries(series[n]);
        break;
      }
    }
  } else if (Array.isArray(body.points)) {
    for (const p of body.points) {
      if (!p || typeof p !== 'object') continue;
      for (const n of names) {
        if (p[n] !== undefined) {
          pushPoint(pick(p, 't', 'ts', 'time'), p[n]);
          break;
        }
      }
    }
  } else if (ts) {
    for (const n of names) {
      if (Array.isArray(body[n])) {
        for (let i = 0; i < ts.length; i++) pushPoint(ts[i], body[n][i]);
        break;
      }
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}
