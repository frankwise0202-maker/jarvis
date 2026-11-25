// node --test: the fixture simulator: determinism, each scenario's health, the pre-filled history, the clocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulator } from '../../server/sim/simulator.mjs';
import { SCENARIO_NAMES } from '../../server/sim/scenarios.mjs';
import { createScaledClock, createManualClock } from '../../server/clock.mjs';
import { parseProcStat, parseNvidiaSmi, parseTailscaleStatus, NVIDIA_ARGS } from '../../server/collector/parse.mjs';
import { fixtureCore, START } from './helpers.mjs';

const levels = (core) => Object.fromEntries(core.snapshot.health.items.filter((i) => i.level !== 'ok').map((i) => [i.id, i.level]));

test('deterministic: the same seed renders the same machine; another seed differs', () => {
  const render = (seed) => {
    const sim = createSimulator({ scenario: 'ok', startMs: START, seed });
    for (let t = START - 5000; t <= START; t += 1000) sim.advanceTo(t);
    return [sim.readText('/proc/stat'), sim.readText('/proc/net/dev'), sim.run('nvidia-smi', NVIDIA_ARGS).stdout].join('\n');
  };
  assert.equal(render(1), render(1));
  assert.notEqual(render(1), render(2));
});

test('rendered files are real formats the parsers read', () => {
  const sim = createSimulator({ scenario: 'ok', startMs: START });
  sim.advanceTo(START - 1000);
  sim.advanceTo(START);
  assert.equal(parseProcStat(sim.readText('/proc/stat')).threads.length, 8);
  assert.equal(parseNvidiaSmi(sim.run('nvidia-smi', NVIDIA_ARGS).stdout)[0].name, 'NVIDIA GeForce GTX 970');
  assert.equal(parseTailscaleStatus(sim.run('tailscale', ['status', '--json']).stdout).status, 'running');
  assert.equal(sim.readText('/proc/cpuinfo').match(/^processor/gm).length, 8); // served from the fixture tree
  assert.equal(sim.run('nvidia-smi', ['--bogus']).ok, false);
  assert.equal(sim.run('rm', ['-rf', '/']).error, 'ENOENT'); // nothing real is ever run
  assert.equal(sim.httpRequest('https://example.com/', {}).ok, false);
  assert.throws(() => createSimulator({ scenario: 'party' }));
});

test('each scenario settles into its intended health after warm-up', () => {
  assert.deepEqual(SCENARIO_NAMES, ['ok', 'warn', 'alert', 'nogpu', 'offline']);
  const ok = fixtureCore('ok').core;
  assert.equal(ok.snapshot.health.level, 'ok');
  assert.deepEqual(levels(ok), {});
  // the GPU incident 35 minutes ago left a warning and its recovery in the log
  const gpuEvents = ok.events.list({ limit: 20 }).filter((e) => e.rule === 'gpu.temp').map((e) => e.to);
  assert.deepEqual(gpuEvents, ['ok', 'warn']);

  const warn = fixtureCore('warn').core;
  assert.equal(warn.snapshot.health.level, 'warn');
  assert.deepEqual(levels(warn), { 'cpu.temp': 'warn', 'cpu.process': 'warn', 'disk:/': 'warn', 'disk.health': 'warn' });
  assert.ok(warn.snapshot.cpu.temp.packageC >= 82 && warn.snapshot.cpu.temp.packageC < 88);

  const alert = fixtureCore('alert').core;
  assert.equal(alert.snapshot.health.level, 'alert');
  assert.deepEqual(levels(alert), { 'cpu.temp': 'alert', 'cpu.process': 'warn', 'gpu.temp': 'warn', memory: 'alert', swap: 'warn', 'disk:/': 'alert', api: 'warn' });

  const nogpu = fixtureCore('nogpu').core;
  assert.deepEqual(levels(nogpu), { 'gpu.driver': 'warn' });
  assert.equal(nogpu.snapshot.gpu.tempSource, 'nouveau');
  assert.equal(nogpu.snapshot.disks.health.status, 'not-checked');

  const offline = fixtureCore('offline').core;
  assert.deepEqual(levels(offline), { internet: 'alert' });
  assert.equal(offline.snapshot.services.tailscale.online, 0);
});

test('pre-filled history: 7 days of minutes with a reboot gap, the last hour of seconds', () => {
  const { core, sim } = fixtureCore('ok');
  const sizes = core.history.sizes;
  assert.equal(sizes.fine, 3600);
  assert.ok(sizes.coarse > 10000, String(sizes.coarse));
  const week = core.history.query({ range: '7d', series: ['cpu'], now: START });
  const t = week.t;
  const gaps = t.slice(1).map((v, i) => v - t[i]).filter((d) => d > 60_000);
  assert.equal(gaps.length, 1); // the simulated reboot
  assert.ok(t.some((v) => v < sim.bootMs) && t.some((v) => v > sim.bootMs));
  assert.ok(week.series.cpu.filter((v) => v !== null).every((v) => v > 0 && v < 30));
  const evening = core.history.stats('ram', { from: START - 7 * 86_400_000, to: START });
  assert.ok(evening.max > evening.min);
});

test('clocks: scaled runs faster than real time; manual moves only when told', async () => {
  const c = createScaledClock({ startMs: 1000, scale: 100 });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(c.now() - 1000 >= 4000, String(c.now()));
  const m = createManualClock(5);
  m.advance(10);
  assert.equal(m.now(), 15);
  m.set(100);
  assert.equal(m.mono(), 100);
});

test('runFor simulates synchronously and keeps every bound', () => {
  const { core } = fixtureCore('ok', { warmupSec: 60 });
  const before = core.snapshot.seq;
  core.runFor(600);
  assert.equal(core.snapshot.seq, before + 600);
  assert.equal(core.snapshot.t, START + 600_000);
  assert.equal(core.history.sizes.fine, 661); // the warm-up includes its own first second
});
