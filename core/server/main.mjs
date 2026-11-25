#!/usr/bin/env node
// jarvis-core: the home base's 24/7 system report. See config.mjs for options, or run with --help.
//
//   node core/server/main.mjs                    the live machine, on http://127.0.0.1:8788/
//   node core/server/main.mjs --fixture ok       a simulated Alienware (ok | warn | alert | nogpu | offline)
//   node core/server/main.mjs --once             print one full report as JSON and exit

import { loadConfig, USAGE } from './config.mjs';
import { createRuntime } from './runtime.mjs';
import { createCore } from './core.mjs';
import { createLiveIO } from './io/live.mjs';
import { createRealClock, createManualClock } from './clock.mjs';
import { createSimulator } from './sim/simulator.mjs';
import { VERSION } from './version.mjs';
import { setLocale } from './format.mjs';

const log = (msg) => process.stdout.write(`[jarvis-core] ${msg}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(config) {
  if (config.fixture) {
    const start = config.startMs ?? Date.now();
    const sim = createSimulator({ scenario: config.fixture, startMs: start, seed: config.seed });
    const core = createCore({ config, io: sim, clock: createManualClock(start), mode: 'fixture', sim });
    core.prefill({ warmupSec: 120 });
    return core.snapshot;
  }
  const core = createCore({ config, io: createLiveIO(), clock: createRealClock(), mode: 'live' });
  const started = Date.now();
  core.tick(Date.now(), performance.now(), { quiet: true });
  // Rates need a second sample, process CPU a second scan 2 s later; the GPU and the 30-second checks
  // answer asynchronously.
  const deadline = started + 9000;
  await sleep(1100);
  core.tick(Date.now(), performance.now(), { quiet: true });
  while (Date.now() < deadline && (core.snapshot.services.rev < 1 || Date.now() - started < config.intervals.processesMs + 100)) await sleep(100);
  core.tick(Date.now(), performance.now(), { quiet: true });
  return core.snapshot;
}

async function main() {
  const { config, warnings, errors, help, version, configFile } = loadConfig({ env: process.env, argv: process.argv.slice(2) });
  setLocale(config.locale);
  if (help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  for (const w of warnings) log(`warning: ${w}`);
  if (errors.length) {
    for (const e of errors) log(`error: ${e}`);
    return 2;
  }
  if (config.once) {
    process.stdout.write(`${JSON.stringify(await once(config), null, 2)}\n`);
    return 0;
  }

  const rt = await createRuntime(config, { log });
  let address;
  try {
    address = await rt.start();
  } catch (err) {
    if (err?.code === 'EADDRINUSE') {
      log(`port ${config.port} is already in use. Is Jarvis Core already running? (try: jarvis-core status)`);
      return 1;
    }
    throw err;
  }
  const where = `http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}/`;
  log(`Jarvis Core ${VERSION} is running at ${where} (${config.fixture ? `fixture "${config.fixture}"${config.timeScale !== 1 ? `, ${config.timeScale}x time` : ''}` : 'live'})`);
  if (config.persist) log(`saving history and events in ${config.dataDir}`);
  log(`settings file (optional): ${configFile}`);

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) {
      log(`${signal} again: exiting now`);
      process.exit(1);
    }
    stopping = true;
    log(`${signal}: saving and stopping`);
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    const started = Date.now();
    try {
      await rt.stop();
    } catch (err) {
      log(`stop failed: ${err?.message ?? err}`);
    }
    log(`stopped cleanly in ${Date.now() - started} ms`);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => log(`unhandled rejection (continuing): ${err?.stack ?? err}`));
  process.on('uncaughtException', (err) => {
    log(`fatal error: ${err?.stack ?? err}`);
    process.exit(1); // systemd restarts the service; the next start records an unexpected stop
  });
  return null;
}

main().then(
  (code) => {
    if (code !== null) process.exit(code);
  },
  (err) => {
    log(`could not start: ${err?.stack ?? err}`);
    process.exit(1);
  },
);
