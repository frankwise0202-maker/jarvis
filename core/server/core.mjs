// The Core: one tick per second wires the collector, the slower pollers, the health rules, the event log
// and the history together, and keeps the latest full snapshot (GET /api/status) and its compact form
// (the SSE "tick"). Listeners: on('tick' | 'status' | 'event', fn).
//
//   tick      every tick: the snapshot (the SSE hub sends its compact form)
//   status    when health items or service checks changed, and at least every 30 s: the full snapshot
//   event     a new event-log entry
//
// The same code runs on the live machine (real clock, ticks aligned to wall-clock seconds) and in fixture
// mode (the simulator's virtual machine, optionally faster than real time).

import { createCollector } from './collector/collector.mjs';
import { createPollers } from './collector/pollers.mjs';
import { createHistory } from './history.mjs';
import { createHealth, transitionMessage } from './health.mjs';
import { createEventLog } from './events.mjs';
import { VERSION, API_VERSION } from './version.mjs';
import { isNum, round } from './util.mjs';
import { fmtClock } from './format.mjs';

const GPU_MISSING = new Set(['not-installed', 'driver-not-loaded', 'no-device']);

export function createCore({ config, io, clock, store = null, log = () => {}, mode = 'live', sim = null }) {
  const collector = createCollector({ io, processIntervalMs: config.intervals.processesMs, selfPid: sim ? sim.selfPid : process.pid });
  // Poll results that arrive inside a tick (the simulator answers synchronously) carry that tick's time;
  // results that arrive later (the live machine) carry the clock's time when they land.
  let tickT = null;
  const pollers = createPollers({ io, config, collector, now: () => Math.round(tickT ?? clock.now()), log });
  const history = createHistory();
  const health = createHealth({ thresholds: config.thresholds, gpuMissingLevel: config.gpuMissingLevel });
  const events = createEventLog({ max: config.limits.eventsMax });
  const listeners = { tick: new Set(), status: new Set(), event: new Set() };
  const emit = (name, payload) => {
    for (const fn of listeners[name]) {
      try {
        fn(payload);
      } catch (err) {
        log(`listener for ${name} failed: ${err?.stack ?? err}`);
      }
    }
  };
  events.on((ev) => emit('event', ev));

  const startedAt = sim ? sim.bootMs + 25_000 : clock.now();
  let snapshot = null;
  let seq = 0;
  let lastHealthRev = -1;
  let lastServicesRev = -1;
  let lastStatusAt = -Infinity;
  let lastTickT = null;
  let lastHistorySave = null;
  let lastEventsSave = null;
  let saving = false;
  let timer = null;
  let running = false;
  const stats = { ticks: 0, lastTickMs: 0, maxTickMs: 0, saves: 0, saveErrors: 0, lastSaveBytes: 0 };

  // ------------------------------------------------------------------------------------------------ snapshot

  function gpuSection(g, hints, t) {
    const nvidia = hints?.pci?.find((p) => p.vendor === 'NVIDIA') ?? null;
    const adapters = (hints?.pci ?? []).map((p) => p.name);
    const first = g.gpus?.[0];
    if (g.status === 'ok' && first) {
      return {
        status: 'ok',
        available: true,
        message: null,
        detail: null,
        name: first.name,
        driver: first.driver,
        utilPct: first.utilPct,
        memUsedMB: first.memUsedMB,
        memTotalMB: first.memTotalMB,
        memPct: round(first.memPct, 1),
        tempC: first.tempC,
        tempSource: isNum(first.tempC) ? 'nvidia-smi' : null,
        powerW: round(first.powerW, 1),
        powerLimitW: round(first.powerLimitW, 1),
        fanPct: first.fanPct,
        clockMHz: first.clockMHz,
        count: g.gpus.length,
        adapters,
        errors: 0,
        checkedAt: g.checkedAt,
      };
    }
    const fallback = hints?.tempFallback ?? null;
    return {
      status: g.status,
      available: false,
      message: g.status === 'pending' ? 'Checking the graphics card' : GPU_MISSING.has(g.status) ? 'GPU driver not loaded' : 'GPU not answering',
      detail: g.detail ?? null,
      name: nvidia?.name ?? null,
      driver: null,
      utilPct: null,
      memUsedMB: null,
      memTotalMB: null,
      memPct: null,
      tempC: fallback?.tempC ?? null,
      tempSource: fallback?.source ?? null,
      powerW: null,
      powerLimitW: null,
      fanPct: null,
      clockMHz: null,
      count: 0,
      adapters,
      errors: g.errors ?? 0,
      checkedAt: g.checkedAt,
    };
  }

  function servicesSection(sv) {
    const strip = ({ etag, ...rest }) => rest;
    const ts = sv.tailscale ?? {};
    return {
      rev: sv.rev,
      internet: { ...sv.internet },
      api: { ...sv.api },
      site: strip(sv.site),
      tailscale: {
        status: ts.status ?? 'unknown',
        detail: ts.detail ?? null,
        backendState: ts.backendState ?? null,
        hostName: ts.hostName ?? null,
        dnsName: ts.dnsName ?? null,
        url: ts.url ?? null,
        serve: ts.serve ?? null,
        ips: ts.ips ?? [],
        tailnet: ts.tailnet ?? null,
        version: ts.version ?? null,
        peers: ts.peers ?? [],
        online: ts.online ?? 0,
        total: ts.total ?? 0,
        failures: ts.failures ?? 0,
        checkedAt: ts.checkedAt ?? null,
      },
    };
  }

  function seriesOf(s, t) {
    const fresh = (svc) => (svc?.status === 'up' && isNum(svc.checkedAt) && t - svc.checkedAt < 90_000 ? svc.latencyMs : null);
    const root = s.disks?.mounts?.find((m) => m.mount === '/') ?? s.disks?.mounts?.[0];
    return {
      cpu: s.cpu?.usagePct,
      cpuTemp: s.cpu?.temp?.packageC ?? s.cpu?.temp?.maxC,
      load1: s.cpu?.load?.[0],
      gpu: s.gpu?.utilPct,
      gpuTemp: s.gpu?.tempC,
      gpuMem: s.gpu?.memPct,
      gpuPower: s.gpu?.powerW,
      ram: s.memory?.usedPct,
      swap: s.memory?.swap?.usedPct,
      disk: root?.usedPct,
      diskRead: s.disks?.readBps,
      diskWrite: s.disks?.writeBps,
      netRx: s.network?.rxBps,
      netTx: s.network?.txBps,
      internetMs: fresh(s.services?.internet),
      apiMs: fresh(s.services?.api),
    };
  }

  // ------------------------------------------------------------------------------------------------ tick

  /** Run one tick at time t (epoch ms). quiet: do not emit 'tick' (catch-up batches, warm-up). */
  function tick(t, mono = t, { quiet = false } = {}) {
    const started = performance.now();
    tickT = t;
    if (io.advanceTo) io.advanceTo(t);
    try {
      pollers.tick(mono, { disks: snapshot?.disks?.devices?.map((d) => d.name) ?? [] });
    } finally {
      tickT = null;
    }
    const s = collector.sample(t, mono);
    seq += 1;
    const snap = {
      v: API_VERSION,
      t,
      seq,
      mode,
      scenario: sim?.scenario ?? null,
      host: s.host,
      core: {
        version: VERSION,
        startedAt,
        uptimeSec: Math.max(0, Math.floor((t - startedAt) / 1000)),
        timeScale: clock.scale ?? 1,
      },
      cpu: s.cpu,
      gpu: gpuSection(pollers.state.gpu, s.gpuHints, t),
      memory: s.memory,
      disks: { ...s.disks, health: { ...pollers.state.smart, devices: [...pollers.state.smart.devices] } },
      network: s.network,
      processes: s.processes,
      services: servicesSection(pollers.state.services),
      health: null,
    };
    const { health: h, transitions } = health.evaluate(snap, t);
    snap.health = h;
    snapshot = snap;
    lastTickT = t;
    for (const tr of transitions) {
      events.add({ t, level: tr.to, kind: 'health', rule: tr.id, from: tr.from, to: tr.to, message: transitionMessage(tr) });
    }
    history.push(t, seriesOf(snap, t));
    stats.ticks += 1;
    stats.lastTickMs = performance.now() - started;
    if (stats.lastTickMs > stats.maxTickMs) stats.maxTickMs = stats.lastTickMs;

    if (!quiet) emit('tick', snap);
    const sr = snap.services.rev;
    if (h.rev !== lastHealthRev || sr !== lastServicesRev || t - lastStatusAt >= config.intervals.statusEveryMs) {
      lastHealthRev = h.rev;
      lastServicesRev = sr;
      lastStatusAt = t;
      if (!quiet) emit('status', snap);
    }
    maybeSave(t);
    return snap;
  }

  // ------------------------------------------------------------------------------------------------ persistence

  function stateRecord(clean) {
    return {
      v: 1,
      version: VERSION,
      bootId: snapshot?.host?.bootId ?? io.readText('/proc/sys/kernel/random/boot_id')?.trim() ?? null,
      bootTime: snapshot?.host?.bootTime ?? null,
      startedAt,
      lastSeen: lastTickT ?? clock.now(),
      cleanShutdown: clean,
    };
  }

  function maybeSave(t) {
    if (!store || saving) return;
    if (lastHistorySave === null) lastHistorySave = t;
    if (lastEventsSave === null) lastEventsSave = t;
    if (t - lastHistorySave >= config.intervals.saveMs) {
      lastHistorySave = t;
      lastEventsSave = t;
      void saveAll({ clean: false });
    } else if (events.dirty && t - lastEventsSave >= config.intervals.eventsSaveDelayMs) {
      lastEventsSave = t;
      store.saveEvents(events.serialize()).catch((err) => log(`saving events failed: ${err?.message ?? err}`));
    }
  }

  /** Save history, events and state. clean=true marks a deliberate stop. */
  async function saveAll({ clean = false } = {}) {
    if (!store) return;
    saving = true;
    try {
      const bytes = await store.saveHistory(history.serialize());
      await store.saveEvents(events.serialize());
      await store.saveState(stateRecord(clean));
      stats.saves += 1;
      stats.lastSaveBytes = bytes;
    } catch (err) {
      stats.saveErrors += 1;
      log(`saving failed: ${err?.message ?? err}`);
    } finally {
      saving = false;
    }
  }

  /** Load saved history and events, and log how the Core and the computer last stopped. */
  function restore() {
    const t = clock.now();
    if (store) {
      const h = store.loadHistory();
      if (h.ok) {
        try {
          const r = history.restore(h.value, t);
          log(`history restored: ${r.fine} seconds and ${r.coarse} minutes`);
        } catch (err) {
          store.discard('history', err);
        }
      } else if (h.corrupt) events.add({ t, level: 'warn', rule: 'core.history', message: 'Saved history could not be read; starting a fresh history' });
      const e = store.loadEvents();
      if (e.ok) {
        try {
          events.restore(e.value);
        } catch (err) {
          store.discard('events', err);
        }
      }
    }
    const prev = store?.loadState();
    const bootId = io.readText('/proc/sys/kernel/random/boot_id')?.trim() ?? null;
    const statLine = /^btime (\d+)/m.exec(io.readText('/proc/stat') ?? '');
    const bootTime = statLine ? Number(statLine[1]) * 1000 : null;
    if (prev?.ok && prev.value?.v === 1) {
      const p = prev.value;
      if (p.bootId && bootId && p.bootId !== bootId) {
        events.add({
          t: bootTime ?? t,
          level: p.cleanShutdown ? 'info' : 'warn',
          rule: 'machine.boot',
          message: p.cleanShutdown ? `The computer restarted${bootTime ? ` at ${fmtClock(bootTime)}` : ''}` : `The computer restarted unexpectedly${bootTime ? ` at ${fmtClock(bootTime)}` : ''} (power cut or crash?)`,
        });
      } else if (p.cleanShutdown === false) {
        events.add({ t, level: 'warn', rule: 'core.crash', message: 'Jarvis Core restarted after an unexpected stop' });
      }
      events.add({ t, level: 'info', rule: 'core.start', message: `Jarvis Core started (version ${VERSION})` });
    } else {
      events.add({ t, level: 'info', rule: 'core.start', message: store ? `Jarvis Core started for the first time (version ${VERSION})` : `Jarvis Core started (version ${VERSION})` });
    }
    if (store) store.saveState({ ...stateRecord(false), bootId, bootTime }).catch((err) => log(`saving state failed: ${err?.message ?? err}`));
  }

  // ------------------------------------------------------------------------------------------------ fixture pre-fill

  /**
   * Fixture mode: 7 days of minute history from the simulator's model, the boot and start events, then
   * the last `warmupSec` seconds through the real pipeline (collector, health, events), quietly.
   */
  function prefill({ warmupSec = 3600 } = {}) {
    if (!sim) return;
    const t0 = sim.startMs;
    const warmStart = t0 - warmupSec * 1000;
    for (let m = Math.floor((t0 - 7 * 86400_000) / 60_000) * 60_000; m < warmStart - 60_000; m += 60_000) {
      const a = sim.seriesAt(m + 10_000);
      const b = sim.seriesAt(m + 30_000);
      const c = sim.seriesAt(m + 50_000);
      if (!a || !b || !c) continue; // the simulated reboot
      const avg = {};
      const max = {};
      for (const k of Object.keys(b)) {
        const vals = [a[k], b[k], c[k]].filter(isNum);
        avg[k] = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
        max[k] = vals.length ? Math.max(...vals) : null;
      }
      history.pushMinute(m, avg, max);
    }
    events.add({ t: sim.bootMs, level: 'info', rule: 'machine.boot', message: `The computer started at ${fmtClock(sim.bootMs)}` });
    events.add({ t: startedAt, level: 'info', rule: 'core.start', message: `Jarvis Core started (version ${VERSION})` });
    for (let t = warmStart; t <= t0; t += 1000) tick(t, t, { quiet: true });
  }

  // ------------------------------------------------------------------------------------------------ loop

  function start() {
    if (running) return;
    running = true;
    if (clock.kind === 'real') {
      const loop = () => {
        if (!running) return;
        tick(clock.now(), clock.mono());
        timer = setTimeout(loop, 1000 - (Date.now() % 1000) + 3);
      };
      if (!snapshot) tick(clock.now(), clock.mono(), { quiet: true });
      timer = setTimeout(loop, 1000 - (Date.now() % 1000) + 3);
      return;
    }
    // Scaled (fixture) time: catch up one simulated second at a time, emitting only the latest tick.
    let cursor = lastTickT ?? Math.floor(clock.now() / 1000) * 1000 - 1000;
    const realStep = Math.max(20, Math.min(1000, 1000 / (clock.scale || 1)));
    const maxBatch = 2000;
    const step = () => {
      if (!running) return;
      const target = clock.now();
      if (target - cursor > maxBatch * 2 * 1000) cursor = target - maxBatch * 1000; // too far behind: skip ahead
      let n = 0;
      while (cursor + 1000 <= target && n < maxBatch) {
        cursor += 1000;
        n += 1;
        const last = cursor + 1000 > target || n === maxBatch;
        tick(cursor, cursor, { quiet: !last });
      }
      timer = setTimeout(step, realStep);
    };
    timer = setTimeout(step, realStep);
  }

  function stop() {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  /** Simulate `seconds` of ticks right now, synchronously (manual/fixture clocks; tests). */
  function runFor(seconds, { quiet = true } = {}) {
    let t = lastTickT ?? clock.now();
    for (let i = 0; i < seconds; i += 1) {
      t += 1000;
      clock.set?.(t);
      tick(t, t, { quiet });
    }
    return snapshot;
  }

  return {
    tick,
    runFor,
    start,
    stop,
    prefill,
    restore,
    saveAll,
    get snapshot() {
      return snapshot;
    },
    /** The SSE form: every section but `services`, and health without its items. */
    compact(snap = snapshot) {
      if (!snap) return null;
      const { services, health: h, ...rest } = snap;
      return { ...rest, health: { level: h.level, summary: h.summary, counts: h.counts, rev: h.rev, since: h.since } };
    },
    history,
    events,
    pollers,
    get startedAt() {
      return startedAt;
    },
    get stats() {
      return { ...stats, events: events.size, history: history.sizes };
    },
    on(name, fn) {
      listeners[name].add(fn);
      return () => listeners[name].delete(fn);
    },
    mode,
    sim,
    clock,
    config,
  };
}
