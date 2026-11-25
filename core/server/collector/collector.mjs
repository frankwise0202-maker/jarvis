// The collector: reads the Linux sources once per tick and turns counters into the live report sections.
//
//   sample(t, mono) → { host, cpu, memory, disks, network, processes, gpuHints }
//
// t is the sample's wall time (epoch ms) and mono a monotonic clock in ms used for rates, so a clock
// change never produces a bogus speed. Rates and usage need two samples: the first sample reports them
// as null. The process table is scanned at most every `processIntervalMs` (default 2 s) because it reads
// one small file per process; everything else is read every tick. Static facts (CPU model, sensors,
// disk models, PCI GPUs) are refreshed every 10 minutes. Mount usage comes from pollMounts(), which the
// core runs every 10 s because statfs is asynchronous.

import * as P from './parse.mjs';
import { isNum, round, pct, settle } from '../util.mjs';

const STATIC_REFRESH_MS = 10 * 60 * 1000;

const FRIENDLY = {
  'gnome-shell': 'GNOME Shell',
  Xwayland: 'Xwayland',
  Xorg: 'Xorg',
  chrome: 'Chrome',
  'google-chrome': 'Chrome',
  chromium: 'Chromium',
  firefox: 'Firefox',
  tailscaled: 'Tailscale',
  'tracker-miner-f': 'GNOME file indexer',
  'systemd-journal': 'System journal',
  systemd: 'systemd',
  snapd: 'Snap daemon',
  pipewire: 'PipeWire (audio)',
  wireplumber: 'WirePlumber (audio)',
  'gnome-terminal-': 'Terminal',
  NetworkManager: 'NetworkManager',
  kswapd0: 'Memory swapper (kswapd0)',
  nautilus: 'Files',
  code: 'VS Code',
  steam: 'Steam',
  ffmpeg: 'ffmpeg',
  python3: 'Python',
  node: 'Node.js',
  'nvidia-smi': 'nvidia-smi',
};

const PCI_NAMES = {
  '0x10de:0x13c2': 'NVIDIA GeForce GTX 970',
  '0x10de:0x13c0': 'NVIDIA GeForce GTX 980',
  '0x10de:0x1401': 'NVIDIA GeForce GTX 960',
  '0x8086:0x1912': 'Intel HD Graphics 530',
};
const PCI_VENDORS = { '0x10de': 'NVIDIA', '0x8086': 'Intel', '0x1002': 'AMD' };

const num = (s) => {
  const n = Number(String(s ?? '').trim());
  return Number.isFinite(n) && String(s ?? '').trim() !== '' ? n : null;
};

export function createCollector({ io, processIntervalMs = 2000, selfPid = null, topN = 5 } = {}) {
  let statics = null;
  let staticsMono = -Infinity;
  let prevStat = null;
  let prevStatMono = null;
  let prevDisk = new Map();
  let prevDiskMono = null;
  let prevNet = null;
  let prevNetMono = null;
  let procPrev = new Map();
  let procPrevMono = null;
  let procLast = null;
  let procLastMono = -Infinity;
  let mounts = [];
  let mountsAt = null;

  // ------------------------------------------------------------------------------------------------
  // Static facts

  function discoverHwmon() {
    const cpu = [];
    let gpu = null;
    for (const entry of io.listDir('/sys/class/hwmon')) {
      const dir = `/sys/class/hwmon/${entry}`;
      let base = dir;
      let name = io.readText(`${dir}/name`)?.trim();
      if (!name) {
        name = io.readText(`${dir}/device/name`)?.trim();
        base = `${dir}/device`;
      }
      if (!name) continue;
      if (['coretemp', 'k10temp', 'zenpower', 'cpu_thermal'].includes(name)) {
        for (const f of io.listDir(base)) {
          const m = /^temp(\d+)_input$/.exec(f);
          if (!m) continue;
          const n = m[1];
          const label = io.readText(`${base}/temp${n}_label`)?.trim() || `temp${n}`;
          const core = /^Core\s+(\d+)$/i.exec(label);
          const kind = core ? 'core' : /^(Package id|Tctl|Tdie|Physical id)/i.test(label) || name === 'cpu_thermal' ? 'package' : 'other';
          cpu.push({
            input: `${base}/${f}`,
            label,
            kind,
            index: core ? Number(core[1]) : null,
            highC: isNum(num(io.readText(`${base}/temp${n}_max`))) ? num(io.readText(`${base}/temp${n}_max`)) / 1000 : null,
            critC: isNum(num(io.readText(`${base}/temp${n}_crit`))) ? num(io.readText(`${base}/temp${n}_crit`)) / 1000 : null,
            driver: name,
          });
        }
      } else if (['nouveau', 'amdgpu', 'radeon'].includes(name) && !gpu) {
        const input = io.listDir(base).includes('temp1_input') ? `${base}/temp1_input` : null;
        if (input) gpu = { input, driver: name };
      }
    }
    cpu.sort((a, b) => (a.kind === b.kind ? (a.index ?? 0) - (b.index ?? 0) : a.kind === 'package' ? -1 : 1));
    return { cpu, gpu };
  }

  function discoverPciGpus() {
    const out = [];
    for (const dev of io.listDir('/sys/bus/pci/devices')) {
      const base = `/sys/bus/pci/devices/${dev}`;
      const cls = io.readText(`${base}/class`)?.trim() ?? '';
      if (!/^0x03/.test(cls)) continue; // display controllers
      const vendor = io.readText(`${base}/vendor`)?.trim() ?? '';
      const device = io.readText(`${base}/device`)?.trim() ?? '';
      out.push({
        slot: dev,
        vendor: PCI_VENDORS[vendor] ?? vendor,
        device,
        name: PCI_NAMES[`${vendor}:${device}`] ?? `${PCI_VENDORS[vendor] ?? 'Unknown'} GPU (${device})`,
      });
    }
    return out;
  }

  function loadStatics() {
    const ci = P.parseCpuinfo(io.readText('/proc/cpuinfo'));
    const osr = P.parseOsRelease(io.readText('/etc/os-release') ?? io.readText('/usr/lib/os-release'));
    const freqPaths = [];
    let freqMaxMHz = null;
    for (let i = 0; i < (ci.threads ?? 0); i += 1) {
      const base = `/sys/devices/system/cpu/cpu${i}/cpufreq`;
      if (io.readText(`${base}/scaling_cur_freq`) !== null) freqPaths.push(`${base}/scaling_cur_freq`);
      const max = num(io.readText(`${base}/cpuinfo_max_freq`));
      if (isNum(max)) freqMaxMHz = Math.max(freqMaxMHz ?? 0, max / 1000);
    }
    const ciMhz = ci.mhz.filter(isNum);
    return {
      cpuModel: ci.model,
      cores: ci.cores,
      threads: ci.threads,
      freqPaths,
      freqMaxMHz,
      cpuinfoMHz: ciMhz.length ? ciMhz.reduce((a, b) => a + b, 0) / ciMhz.length : null,
      hostname: io.readText('/proc/sys/kernel/hostname')?.trim() || null,
      kernel: io.readText('/proc/sys/kernel/osrelease')?.trim() || null,
      bootId: io.readText('/proc/sys/kernel/random/boot_id')?.trim() || null,
      os: osr.prettyName,
      hwmon: discoverHwmon(),
      pciGpus: discoverPciGpus(),
      diskInfo: new Map(),
    };
  }

  function diskInfo(name) {
    let info = statics.diskInfo.get(name);
    if (!info) {
      const sectors = num(io.readText(`/sys/block/${name}/size`));
      const rot = num(io.readText(`/sys/block/${name}/queue/rotational`));
      info = {
        model: io.readText(`/sys/block/${name}/device/model`)?.trim() || null,
        sizeBytes: isNum(sectors) ? sectors * P.SECTOR_BYTES : null,
        rotational: rot === null ? null : rot === 1,
      };
      statics.diskInfo.set(name, info);
    }
    return info;
  }

  // ------------------------------------------------------------------------------------------------
  // Sections

  function sampleCpu(mono, stat) {
    let usage = null;
    let perThreadPct = [];
    if (stat.cpu && prevStat?.cpu && mono > prevStatMono) {
      usage = P.cpuUsage(prevStat.cpu, stat.cpu);
      const prevById = new Map(prevStat.threads.map((r) => [r.id, r]));
      perThreadPct = stat.threads.map((r) => round(P.cpuUsage(prevById.get(r.id), r)?.usagePct ?? null, 1));
    } else {
      perThreadPct = stat.threads.map(() => null);
    }
    if (stat.cpu) {
      prevStat = stat;
      prevStatMono = mono;
    }

    // Frequency: average of the per-thread current frequencies (kHz), or /proc/cpuinfo's figure.
    let freqMHz = null;
    if (statics.freqPaths.length) {
      const vals = statics.freqPaths.map((p) => num(io.readText(p))).filter(isNum);
      if (vals.length) freqMHz = vals.reduce((a, b) => a + b, 0) / vals.length / 1000;
    } else if (isNum(statics.cpuinfoMHz)) freqMHz = statics.cpuinfoMHz;

    const temps = statics.hwmon.cpu.map((s) => ({ ...s, c: num(io.readText(s.input)) }));
    const readable = temps.filter((s) => isNum(s.c)).map((s) => ({ ...s, c: s.c / 1000 }));
    const pkg = readable.filter((s) => s.kind === 'package');
    const cores = readable.filter((s) => s.kind === 'core');
    const all = readable.map((s) => s.c);
    const packageC = pkg.length ? Math.max(...pkg.map((s) => s.c)) : cores.length ? Math.max(...cores.map((s) => s.c)) : null;
    const loadavg = P.parseLoadavg(io.readText('/proc/loadavg'));

    return {
      model: statics.cpuModel,
      cores: statics.cores,
      threads: statics.threads ?? (stat.threads.length || null),
      usagePct: round(usage?.usagePct ?? null, 1),
      userPct: round(usage?.userPct ?? null, 1),
      systemPct: round(usage?.systemPct ?? null, 1),
      iowaitPct: round(usage?.iowaitPct ?? null, 1),
      perThreadPct,
      freqMHz: round(freqMHz, 0),
      freqMaxMHz: round(statics.freqMaxMHz, 0),
      load: loadavg ? [loadavg.load1, loadavg.load5, loadavg.load15] : null,
      temp: {
        available: all.length > 0,
        packageC: round(packageC, 1),
        coresC: cores.map((s) => round(s.c, 1)),
        maxC: all.length ? round(Math.max(...all), 1) : null,
        highC: pkg[0]?.highC ?? cores[0]?.highC ?? null,
        critC: pkg[0]?.critC ?? cores[0]?.critC ?? null,
        source: readable[0]?.driver ?? null,
      },
    };
  }

  function sampleDisks(mono) {
    const rows = P.parseDiskstats(io.readText('/proc/diskstats')).filter((d) => P.isWholeDisk(d.name));
    const dt = prevDiskMono === null ? 0 : (mono - prevDiskMono) / 1000;
    const next = new Map();
    let readBps = null;
    let writeBps = null;
    const devices = rows.map((d) => {
      next.set(d.name, d);
      const p = prevDisk.get(d.name);
      let r = null;
      let w = null;
      let busy = null;
      if (p && dt > 0) {
        const dr = d.sectorsRead - p.sectorsRead;
        const dw = d.sectorsWritten - p.sectorsWritten;
        const dio = d.msIo - p.msIo;
        if (dr >= 0) r = (dr * P.SECTOR_BYTES) / dt;
        if (dw >= 0) w = (dw * P.SECTOR_BYTES) / dt;
        if (dio >= 0) busy = Math.min(100, (dio / (dt * 1000)) * 100);
      }
      if (isNum(r)) readBps = (readBps ?? 0) + r;
      if (isNum(w)) writeBps = (writeBps ?? 0) + w;
      const info = diskInfo(d.name);
      return {
        name: d.name,
        model: info.model,
        sizeBytes: info.sizeBytes,
        rotational: info.rotational,
        readBps: round(r, 0),
        writeBps: round(w, 0),
        busyPct: round(busy, 1),
      };
    });
    prevDisk = next;
    prevDiskMono = mono;
    return { readBps: round(readBps, 0), writeBps: round(writeBps, 0), devices, mounts, mountsCheckedAt: mountsAt };
  }

  function sampleNetwork(mono) {
    const devs = P.parseNetDev(io.readText('/proc/net/dev'));
    const route = P.parseDefaultRoute(io.readText('/proc/net/route'));
    let iface = route && devs.some((d) => d.iface === route.iface) ? route.iface : null;
    if (!iface) {
      const candidates = devs.filter((d) => d.iface !== 'lo' && P.ifaceKind(d.iface) !== 'vpn');
      const up = candidates.filter((d) => io.readText(`/sys/class/net/${d.iface}/operstate`)?.trim() === 'up');
      const pool = up.length ? up : candidates;
      pool.sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes));
      iface = pool[0]?.iface ?? null;
    }
    const cur = devs.find((d) => d.iface === iface) ?? null;
    let rxBps = null;
    let txBps = null;
    if (cur && prevNet && prevNet.iface === cur.iface && mono > prevNetMono) {
      const dt = (mono - prevNetMono) / 1000;
      const drx = cur.rxBytes - prevNet.rxBytes;
      const dtx = cur.txBytes - prevNet.txBytes;
      if (drx >= 0) rxBps = drx / dt;
      if (dtx >= 0) txBps = dtx / dt;
    }
    prevNet = cur;
    prevNetMono = mono;
    const speed = iface ? num(io.readText(`/sys/class/net/${iface}/speed`)) : null;
    const addrs = iface ? io.netAddrs?.()?.[iface] : null;
    return {
      interface: iface,
      kind: iface ? P.ifaceKind(iface) : null,
      operstate: iface ? io.readText(`/sys/class/net/${iface}/operstate`)?.trim() || null : null,
      speedMbps: isNum(speed) && speed > 0 ? speed : null,
      ipv4: Array.isArray(addrs) ? addrs.find((a) => a.family === 'IPv4' || a.family === 4)?.address ?? null : null,
      gateway: route?.gateway ?? null,
      rxBps: round(rxBps, 0),
      txBps: round(txBps, 0),
      rxTotalBytes: cur?.rxBytes ?? null,
      txTotalBytes: cur?.txBytes ?? null,
      tailscaleInterface: devs.some((d) => d.iface.startsWith('tailscale')),
    };
  }

  function labelFor(st) {
    const raw = io.readText(`/proc/${st.pid}/cmdline`);
    const cmdline = raw ? raw.replace(/\0/g, ' ').trim() : '';
    if ((selfPid !== null && st.pid === selfPid) || (st.comm === 'node' && /jarvis-core|core\/server\/main\.mjs/.test(cmdline))) return 'Jarvis Core';
    if (/^(chrome|google-chrome|chromium)/.test(st.comm) && /jarvis-core/.test(cmdline)) {
      const type = /--type=([a-z-]+)/.exec(cmdline)?.[1];
      if (type === 'gpu-process') return 'Dashboard (Chrome GPU)';
      if (type && type !== 'renderer') return 'Dashboard (Chrome helper)';
      return 'Dashboard (Chrome)';
    }
    if (st.comm.startsWith('kworker/')) return 'Kernel worker';
    return FRIENDLY[st.comm] ?? st.comm;
  }

  function scanProcesses(mono, threads, memTotal) {
    const rows = [];
    let running = 0;
    for (const name of io.listDir('/proc')) {
      const c = name.charCodeAt(0);
      if (c < 48 || c > 57) continue;
      const st = P.parsePidStat(io.readText(`/proc/${name}/stat`));
      if (!st) continue;
      if (st.state === 'R') running += 1;
      rows.push(st);
    }
    const dt = procPrevMono === null ? 0 : (mono - procPrevMono) / 1000;
    const next = new Map();
    const withCpu = [];
    for (const st of rows) {
      const ticks = st.utime + st.stime;
      const prev = procPrev.get(st.pid);
      let threadPct = null;
      if (dt > 0 && prev && prev.starttime === st.starttime && ticks >= prev.ticks) {
        threadPct = ((ticks - prev.ticks) / (dt * P.USER_HZ)) * 100;
      }
      next.set(st.pid, { ticks, starttime: st.starttime });
      withCpu.push({ st, threadPct });
    }
    procPrev = next;
    procPrevMono = mono;

    const shape = ({ st, threadPct }) => {
      const memBytes = st.kernelThread ? 0 : st.rssPages * P.PAGE_SIZE;
      return {
        pid: st.pid,
        name: st.comm,
        label: labelFor(st),
        threadPct: round(threadPct, 1),
        cpuPct: isNum(threadPct) && threads ? round(threadPct / threads, 1) : null,
        memBytes,
        memPct: round(pct(memBytes, memTotal), 1),
      };
    };
    const topCpu = withCpu
      .filter((r) => isNum(r.threadPct))
      .sort((a, b) => b.threadPct - a.threadPct || a.st.pid - b.st.pid)
      .slice(0, topN)
      .map(shape);
    const topMem = withCpu
      .filter((r) => !r.st.kernelThread && r.st.rssPages > 0)
      .sort((a, b) => b.st.rssPages - a.st.rssPages || a.st.pid - b.st.pid)
      .slice(0, topN)
      .map(shape);
    return { total: rows.length, running, topCpu, topMem };
  }

  // ------------------------------------------------------------------------------------------------

  function sample(t, mono = t) {
    if (!statics || mono - staticsMono >= STATIC_REFRESH_MS) {
      const keep = statics?.diskInfo;
      statics = loadStatics();
      if (keep && statics) statics.diskInfo = keep;
      staticsMono = mono;
    }
    const stat = P.parseProcStat(io.readText('/proc/stat'));
    const cpu = sampleCpu(mono, stat);
    const memory = P.memorySummary(P.parseMeminfo(io.readText('/proc/meminfo')));
    const uptime = P.parseUptime(io.readText('/proc/uptime'));
    const loadavg = P.parseLoadavg(io.readText('/proc/loadavg'));

    if (mono - procLastMono >= processIntervalMs - 1 || !procLast) {
      procLast = scanProcesses(mono, cpu.threads, memory?.totalBytes ?? null);
      procLastMono = mono;
    }

    const bootTime = isNum(stat.btime) ? stat.btime * 1000 : isNum(uptime?.uptimeSec) ? t - uptime.uptimeSec * 1000 : null;
    let gpuTempFallback = null;
    if (statics.hwmon.gpu) {
      const v = num(io.readText(statics.hwmon.gpu.input));
      if (isNum(v)) gpuTempFallback = { tempC: round(v / 1000, 1), source: statics.hwmon.gpu.driver };
    }

    return {
      host: {
        hostname: statics.hostname,
        os: statics.os,
        kernel: statics.kernel,
        bootId: statics.bootId,
        bootTime,
        uptimeSec: isNum(uptime?.uptimeSec) ? Math.floor(uptime.uptimeSec) : null,
      },
      cpu,
      memory: memory
        ? {
            ...memory,
            usedPct: round(memory.usedPct, 1),
            availablePct: round(memory.availablePct, 1),
            swap: { ...memory.swap, usedPct: round(memory.swap.usedPct, 1) },
          }
        : null,
      disks: sampleDisks(mono),
      network: sampleNetwork(mono),
      processes: {
        total: procLast.total,
        running: procLast.running,
        threads: loadavg?.total ?? null,
        topCpu: procLast.topCpu,
        topMem: procLast.topMem,
      },
      gpuHints: { pci: statics.pciGpus, tempFallback: gpuTempFallback },
    };
  }

  /**
   * statfs every real mount. Returns a promise on the live machine (or a plain value from the simulator);
   * the result lands in the next sample's disks.mounts.
   */
  function pollMounts(t) {
    const list = P.realMounts(P.parseMounts(io.readText('/proc/self/mounts') ?? io.readText('/proc/mounts')));
    const results = new Array(list.length).fill(null);
    let pending = list.length;
    const finish = () => {
      mounts = list
        .map((m, i) => {
          const u = P.statfsUsage(results[i]);
          if (!u) return null;
          const devName = m.device.replace(/^\/dev\//, '');
          return {
            mount: m.mount,
            device: m.device,
            fs: m.fs,
            disk: P.parentDisk(devName),
            totalBytes: u.totalBytes,
            usedBytes: u.usedBytes,
            freeBytes: u.freeBytes,
            usedPct: round(u.usedPct, 1),
          };
        })
        .filter(Boolean);
      mountsAt = t;
      return mounts;
    };
    if (!pending) return finish();
    let async = false;
    let resolveAll;
    const done = new Promise((r) => {
      resolveAll = r;
    });
    list.forEach((m, i) => {
      const wentAsync = settle(io.statfs(m.mount), (v) => {
        results[i] = v ?? null;
        pending -= 1;
        if (pending === 0 && async) resolveAll(finish());
      });
      if (wentAsync) async = true;
    });
    if (!async) return finish();
    if (pending === 0) resolveAll(finish());
    return done;
  }

  return {
    sample,
    pollMounts,
    get statics() {
      return statics;
    },
  };
}
