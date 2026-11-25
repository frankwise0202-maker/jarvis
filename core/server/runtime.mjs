// Wires a Core for live or fixture mode, the status assistant and the HTTP API together.
//
//   const rt = await createRuntime(config, { log });
//   await rt.start();    // listen on 127.0.0.1:<port> and start ticking
//   await rt.stop();     // stop ticking, save everything (clean shutdown), close the server

import { createCore } from './core.mjs';
import { createLiveIO } from './io/live.mjs';
import { createSimulator } from './sim/simulator.mjs';
import { SCENARIOS, SCENARIO_NAMES } from './sim/scenarios.mjs';
import { createRealClock, createScaledClock } from './clock.mjs';
import { createStore } from './store.mjs';
import { createApiServer } from './http/server.mjs';
import { ask as askAssistant, INTENTS } from './assistant/index.mjs';
import { VERSION, API_VERSION } from './version.mjs';

export async function createRuntime(config, { log = () => {}, io: ioOverride = null } = {}) {
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
          const t = Math.round(core.clock.now());
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

  const server = createApiServer({ getCore: () => core, config, ask, info, fixture, log });
  let running = false;

  return {
    get core() {
      return core;
    },
    server,
    config,
    async start({ port = config.port, host = config.host } = {}) {
      const address = await server.listen(port, host);
      core.start();
      running = true;
      return address;
    },
    async stop() {
      if (running) core.stop();
      running = false;
      await core.saveAll({ clean: true });
      await server.close();
    },
  };
}
