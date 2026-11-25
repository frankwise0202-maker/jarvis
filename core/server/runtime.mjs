// Wires a Core for live or fixture mode, the status assistant, the home base brain (research, watchers,
// the morning briefing), push, sync and the HTTP API together.
//
//   const rt = await createRuntime(config, { log });
//   await rt.start();    // listen on 127.0.0.1:<port> and start ticking
//   await rt.stop();     // stop ticking, save everything (clean shutdown), close the server
//
// The brain's dependencies (@anthropic-ai/sdk, web-push) are imported lazily, and push and sync are
// optional modules: without core/node_modules the Core still starts and serves the system report.

import { createCore } from './core.mjs';
import { createLiveIO } from './io/live.mjs';
import { createSimulator } from './sim/simulator.mjs';
import { SCENARIOS, SCENARIO_NAMES } from './sim/scenarios.mjs';
import { createRealClock, createScaledClock } from './clock.mjs';
import { createStore } from './store.mjs';
import { createApiServer } from './http/server.mjs';
import { ask as askAssistant, INTENTS } from './assistant/index.mjs';
import { VERSION, API_VERSION } from './version.mjs';
import { getLocale } from './format.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createBrain } from './brain/index.mjs';
import { createFixtureFetch } from './brain/fixture-fetch.mjs';

/** An optional module's factory, or null when it is missing or fails to load (never fatal). */
async function optionalFactory(spec, name, log) {
  try {
    const mod = await import(spec);
    return typeof mod[name] === 'function' ? mod[name] : null;
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') log(`${spec} could not be loaded: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Events written by `jarvis-core autoupdate-tick` (one JSON object per line in <dataDir>/update-events.jsonl):
 * added to the event log once, then the file is removed.
 */
export function importUpdateEvents(file, events, log = () => {}) {
  let text;
  try {
    if (!fs.statSync(file).isFile()) return 0;
    text = fs.readFileSync(file, 'utf8');
    fs.rmSync(file, { force: true });
  } catch {
    return 0;
  }
  let n = 0;
  for (const line of text.split('\n').slice(-200)) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!e || typeof e.message !== 'string' || !['info', 'warn'].includes(e.level) || !['core.update', 'core.rollback'].includes(e.rule)) continue;
    events.add({ t: Number.isFinite(e.t) ? e.t : Date.now(), level: e.level, kind: 'system', rule: e.rule, message: e.message.slice(0, 300) });
    n += 1;
  }
  if (n) log(`added ${n} update event${n === 1 ? '' : 's'} to the event log`);
  return n;
}

export async function createRuntime(config, { log = () => {}, io: ioOverride = null, brain: brainOverride = null } = {}) {
  let core = null;
  let scenario = config.fixture;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function buildCore(name, startMs) {
    const store = config.persist ? createStore({ dir: config.dataDir, log }) : null;
    if (config.fixture) {
      const sim = createSimulator({ scenario: name, startMs, seed: config.seed, port: config.port || 8788 });
      const clock = createScaledClock({ startMs, scale: config.timeScale });
      const c = createCore({ config, io: sim, clock, store, log, mode: 'fixture', sim });
      c.prefill();
      return c;
    }
    const c = createCore({ config, io: ioOverride ?? createLiveIO(), clock: createRealClock(), store, log, mode: 'live' });
    c.restore();
    return c;
  }

  core = buildCore(scenario, config.startMs ?? Date.now());

  const ask = (q, { core: c }) =>
    askAssistant(q, { s: c.snapshot, history: c.history, events: c.events, now: c.snapshot?.t ?? c.clock.now(), owner: config.ownerName, tz: timeZone });

  function info(access) {
    const s = core.snapshot;
    const ts = s?.services?.tailscale ?? {};
    return {
      name: 'jarvis-core',
      version: VERSION,
      api: API_VERSION,
      mode: core.mode,
      scenario: core.sim?.scenario ?? null,
      scenarioLabel: core.sim ? SCENARIOS[core.sim.scenario].label : null,
      timeScale: core.clock.scale ?? 1,
      now: s?.t ?? core.clock.now(),
      timeZone,
      locale: getLocale(),
      hostname: s?.host?.hostname ?? null,
      startedAt: core.startedAt,
      uptimeSec: s?.core?.uptimeSec ?? null,
      machine: { bootTime: s?.host?.bootTime ?? null, uptimeSec: s?.host?.uptimeSec ?? null },
      tailscale: { status: ts.status ?? 'unknown', dnsName: ts.dnsName ?? null, url: ts.url ?? null, serve: ts.serve ?? null },
      urls: { local: `http://localhost:${server.server.address()?.port ?? config.port}/`, tailscale: ts.serve ? ts.url : null, app: config.siteUrl },
      ownerName: config.ownerName,
      night: { ...config.night },
      assistant: { intents: INTENTS, questionMaxChars: config.limits.questionChars, askPerMinute: config.limits.askPerMinute },
      you: { via: access.via, login: access.login, name: access.name },
      stats: { ...core.stats, sseClients: server.sse.size, requests: server.counters.requests, refused: server.counters.refused },
    };
  }

  const fixture = config.fixture
    ? {
        get: () => ({ scenario: core.sim.scenario, label: SCENARIOS[core.sim.scenario].label, scenarios: SCENARIO_NAMES, timeScale: core.clock.scale, now: core.snapshot?.t ?? null }),
        set(name) {
          if (!SCENARIO_NAMES.includes(name)) return { ok: false, error: `scenario must be one of ${SCENARIO_NAMES.join(', ')}` };
          const t = Math.floor(core.clock.now() / 1000) * 1000;
          const wasRunning = running;
          core.stop();
          core = buildCore(name, t);
          scenario = name;
          if (wasRunning) core.start();
          log(`fixture scenario switched to ${name}`);
          return { ok: true };
        },
      }
    : null;

  // ---- the brain, push and sync
  const dataDir = config.persist ? config.dataDir : null;
  const createPush = await optionalFactory('./push/index.mjs', 'createPush', log);
  const createSync = await optionalFactory('./sync/index.mjs', 'createSync', log);
  let push = null;
  let sync = null;
  try {
    push = createPush ? createPush({ dir: dataDir ? path.join(dataDir, 'push') : null, log }) : null;
  } catch (err) {
    log(`notifications are off: ${err?.message ?? err}`);
  }
  try {
    sync = createSync && dataDir ? createSync({ dir: path.join(dataDir, 'sync'), log }) : null;
  } catch (err) {
    log(`sync is off: ${err?.message ?? err}`);
  }
  const brain = brainOverride ?? createBrain({
    config,
    getCore: () => core,
    now: () => core.clock.now(),
    log,
    timeZone,
    push,
    dataDir,
    secretsDir: config.persist ? config.secretsDir : null,
    claudeBase: config.claudeBase ?? undefined,
    whatsNewFile: config.whatsNewFile,
    // A simulated home base reads its weather and headlines from core/fixtures/brain (no internet), for a
    // made-up location (0, 0) unless one is set.
    ...(config.fixture ? { fetch: createFixtureFetch(), defaultLocation: { label: 'Your location', lat: 0, lon: 0 } } : {}),
  });

  const server = createApiServer({ getCore: () => core, config, ask, info, fixture, log, getBrain: () => brain, getPush: () => push, getSync: () => sync });
  let running = false;
  let updateTimer = null;
  const updateEventsFile = dataDir && !config.fixture ? path.join(dataDir, 'update-events.jsonl') : null;

  return {
    get core() {
      return core;
    },
    server,
    config,
    brain,
    push,
    sync,
    async start({ port = config.port, host = config.host } = {}) {
      const address = await server.listen(port, host);
      core.start();
      running = true;
      brain.start();
      if (updateEventsFile) {
        importUpdateEvents(updateEventsFile, core.events, log);
        updateTimer = setInterval(() => importUpdateEvents(updateEventsFile, core.events, log), 60_000);
        updateTimer.unref?.();
      }
      return address;
    },
    async stop() {
      if (running) core.stop();
      running = false;
      if (updateTimer) clearInterval(updateTimer);
      updateTimer = null;
      try {
        await brain.stop();
      } catch (err) {
        log(`stopping the brain failed: ${err?.message ?? err}`);
      }
      await core.saveAll({ clean: true });
      await server.close();
    },
  };
}
