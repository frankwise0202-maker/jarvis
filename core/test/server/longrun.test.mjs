// node --test: a long run. 24 simulated hours (accelerated) through the whole pipeline: collector, pollers,
// health, events, history, persistence every 5 minutes, an SSE hub with a client receiving every tick, and
// questions to the assistant every simulated hour. The heap after garbage collection must not grow, and
// every buffer must stay within its bound.
//
// JARVIS_CORE_LONGRUN_HOURS=N changes the simulated span (default 24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createSimulator } from '../../server/sim/simulator.mjs';
import { createCore } from '../../server/core.mjs';
import { createManualClock } from '../../server/clock.mjs';
import { createStore } from '../../server/store.mjs';
import { createSseHub } from '../../server/http/sse.mjs';
import { ask } from '../../server/assistant/index.mjs';
import { testConfig, tmpDir, askCtx, START } from './helpers.mjs';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const heap = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};

const HOURS = Number(process.env.JARVIS_CORE_LONGRUN_HOURS) || 24;

test(`${HOURS} simulated hours: no memory growth, bounded buffers, steady saves`, { timeout: 15 * 60_000 }, async () => {
  const dir = tmpDir();
  const config = testConfig(['--fixture', 'ok']);
  config.persist = true;
  const sim = createSimulator({ scenario: 'ok', startMs: START });
  const clock = createManualClock(START);
  const store = createStore({ dir });
  const core = createCore({ config, io: sim, clock, store, mode: 'fixture', sim });
  core.prefill({ warmupSec: 600 });

  // the server's wiring: compact JSON of every tick to every client
  const hub = createSseHub({ maxClients: 4 });
  const req = new EventEmitter();
  req.socket = { setTimeout() {}, setNoDelay() {} };
  const res = new EventEmitter();
  let bytes = 0;
  let frames = 0;
  Object.assign(res, { writeHead() {}, write: (c) => ((bytes += c.length), (frames += 1), true), end() {}, destroy() {} });
  hub.add(req, res);
  core.on('tick', () => hub.broadcast('tick', () => JSON.stringify(core.compact())));
  core.on('status', (s) => hub.broadcast('status', () => JSON.stringify(s)));
  core.on('event', (ev) => hub.broadcast('event', () => JSON.stringify(ev), ev.id));

  const chunk = 300; // 5 simulated minutes, then let the saves run
  const total = HOURS * 3600;
  const samples = [];
  const started = performance.now();
  let answered = 0;
  for (let done = 0; done < total; done += chunk) {
    core.runFor(chunk, { quiet: false });
    await core.pendingSave; // the periodic save started in this chunk
    await store.flush();
    if (done % 3600 === 0) {
      const r = ask('How are you?', askCtx(core));
      assert.match(r.answer, /^All systems normal|^Mostly fine/);
      answered += 1;
    }
    if (done === 2 * 3600 || done + chunk >= total) samples.push({ at: done + chunk, heap: heap() });
  }
  const secs = (performance.now() - started) / 1000;
  const [early, late] = samples;
  const growthMB = (late.heap - early.heap) / 1048576;
  const s = core.stats;
  // eslint-disable-next-line no-console
  console.log(`# ${HOURS} h simulated in ${secs.toFixed(1)} s: ${s.ticks} ticks, ${frames} SSE frames (${(bytes / 1048576).toFixed(0)} MB), ${s.saves} saves, heap ${(early.heap / 1048576).toFixed(1)} → ${(late.heap / 1048576).toFixed(1)} MB (${growthMB >= 0 ? '+' : ''}${growthMB.toFixed(2)} MB), max tick ${s.maxTickMs.toFixed(1)} ms`);

  assert.ok(growthMB < 6, `heap grew ${growthMB.toFixed(2)} MB between hour 2 and hour ${HOURS}`);
  assert.equal(core.history.sizes.fine, 3600);
  assert.ok(core.history.sizes.coarse <= 10080);
  assert.ok(core.events.size <= config.limits.eventsMax);
  assert.ok(s.saves >= Math.floor((HOURS * 60) / 5) - 2, `saves ${s.saves}`);
  assert.equal(s.saveErrors, 0);
  assert.ok(answered >= HOURS);
  assert.ok(frames >= total);
  assert.equal(hub.size, 1);
  // the saved files exist, are bounded, and nothing temporary was left behind
  const files = fs.readdirSync(dir).sort();
  assert.deepEqual(files, ['events-v1.json', 'history-v1.json.gz', 'state-v1.json']);
  assert.ok(fs.statSync(`${dir}/history-v1.json.gz`).size < 3 * 1048576);
  // after a crash, a restart restores everything up to the last periodic save (at most 5 minutes old)
  const restart = () => {
    const c = createCore({ config, io: createSimulator({ scenario: 'ok', startMs: clock.now() }), clock, store: createStore({ dir }), mode: 'live' });
    c.restore();
    return c;
  };
  assert.ok(restart().history.sizes.fine >= 3600 - 300);
  // after a clean stop (SIGTERM saves first), nothing is lost
  await core.saveAll({ clean: true });
  const again = restart();
  assert.equal(again.history.sizes.fine, 3600);
  assert.ok(again.history.sizes.coarse >= Math.min(10080, HOURS * 60) - 5);
  fs.rmSync(dir, { recursive: true, force: true });
});
