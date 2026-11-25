// The engine host: a real engine process (server/senses/worker.mjs) running the stub engine. Covers loading
// with progress, one request at a time with a queue of 3, deadlines, crashes (a native abort included: the
// Core survives), cancelling, the idle unload and the low CPU priority of every engine thread.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSenseHost } from '../../../server/senses/host.mjs';
import { HEAR_MODELS, SPEAK_MODELS } from '../../../server/senses/models.mjs';

const STUB = new URL('./stub-engine.mjs', import.meta.url).href;
const OWN_NICE = os.getPriority(0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, { timeoutMs = 5000, what = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

function makeHost(t, { kind = 'hear', model = HEAR_MODELS['tiny.en'], options = {}, ...rest } = {}) {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-senses-host-'));
  const logs = [];
  const progress = [];
  let current = model;
  const host = createSenseHost({ kind, getModel: () => current, cacheDir, engineUrl: STUB, engineOptions: options, log: (m) => logs.push(m), onProgress: (p) => progress.push(p), ...rest });
  t.after(async () => {
    await host.stop();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });
  return { host, logs, progress, cacheDir, setModel: (m) => (current = m) };
}

const audio = (sec = 1) => new Float32Array(16000 * sec);

test('load downloads into the cache with progress, warms up, runs in a process whose every thread is at nice 10', async (t) => {
  const { host, progress, cacheDir } = makeHost(t, { options: { loadMs: 40 } });
  assert.equal(host.status().loaded, false);
  const r = await host.load();
  assert.ok(Number.isFinite(r.ms));
  const st = host.status();
  assert.equal(st.loaded, true);
  assert.equal(st.loading, false);
  assert.deepEqual(st.progress, { loaded: st.progress.total, total: 10124993 + 30718858 + 2197 + 1646 + 339 + 2405679 + 282662 });
  assert.ok(progress.length >= 1, 'progress reported');
  assert.ok(progress.every((p) => p.loaded <= p.total));
  assert.ok(fs.existsSync(path.join(cacheDir, 'onnx-community/whisper-tiny.en', HEAR_MODELS['tiny.en'].revision, 'onnx/encoder_model_quantized.onnx')));
  if (process.platform === 'linux') assert.equal(st.nice, Math.max(10, OWN_NICE), 'the engine runs at nice 10');
  const out = await host.run({ audio: audio(1), prompt: 'Frank' });
  assert.equal(out.output.text, 'hello from the stub (16000 samples; prompt: Frank)');
  if (process.platform === 'linux') {
    const own = os.getPriority(0); // 0 normally; 10 when the tests themselves run under nice -n 10
    assert.ok(out.output.threadNice.length >= 4, 'the engine process has its threads');
    assert.ok(out.output.threadNice.every((n) => n === Math.max(10, own)), `every engine thread at nice 10: ${out.output.threadNice}`);
    assert.equal(OWN_NICE, own, 'the Core itself keeps its priority');
  }
  assert.ok(out.ms >= 0 && out.waitedMs >= 0);
  // loading again is free
  assert.deepEqual(await host.load(), { ms: 0, warmMs: 0 });
});

test('one request at a time, at most 3 waiting: the 5th is refused as busy, the rest finish in order', async (t) => {
  const { host } = makeHost(t, { options: { delayMs: 80 } });
  await host.load();
  const order = [];
  const runs = [1, 2, 3, 4].map((n) => host.run({ audio: audio(n) }).then((r) => order.push(n) && r));
  await until(() => host.status().busy && host.status().queued === 3, { what: '1 running + 3 queued' });
  await assert.rejects(host.run({ audio: audio(5) }), (e) => e.status === 503 && e.code === 'busy' && e.headers['Retry-After'] === '2');
  const results = await Promise.all(runs);
  assert.deepEqual(order, [1, 2, 3, 4]);
  assert.match(results[3].output.text, /64000 samples/);
  assert.ok(results[3].waitedMs >= 150, `the 4th waited for the others (${results[3].waitedMs} ms)`);
});

test('a request past its deadline gets 504 at the deadline and the engine is let go (the next request starts a fresh one)', async (t) => {
  const { host, logs } = makeHost(t, { options: { hangMs: 2000 } });
  await host.load();
  const t0 = Date.now();
  await assert.rejects(host.run({ audio: audio() }, { timeoutMs: 150 }), (e) => e.status === 504 && e.code === 'timeout');
  assert.ok(Date.now() - t0 < 1500, 'answered at the deadline, not when the engine finished');
  assert.equal(host.status().loaded, false);
  assert.ok(logs.some((l) => /deadline/.test(l)));
});

test('a deadline also covers the queue: a request that waits too long is dropped before it runs', async (t) => {
  const { host } = makeHost(t, { options: { delayMs: 300 }, queueWaitMs: 100 });
  await host.load();
  const first = host.run({ audio: audio() });
  await assert.rejects(host.run({ audio: audio() }), (e) => e.code === 'busy' && /too long/.test(e.message));
  await first;
});

test('an engine that crashes fails its request and the next request starts a fresh one', async (t) => {
  const { host, logs } = makeHost(t, { options: { crashOnRun: true } });
  await host.load();
  await assert.rejects(host.run({ audio: audio() }), (e) => e.status === 503 && e.code === 'engine_stopped');
  assert.ok(logs.some((l) => /engine process ended \(code 3\)/.test(l)), logs.join('\n'));
  assert.equal(host.status().loaded, false);
  await assert.rejects(host.run({ audio: audio() }), (e) => e.code === 'engine_stopped'); // the stub crashes every time
  await host.load(); // and loading again works
  assert.equal(host.status().loaded, true);
});

test('a native crash inside the engine (SIGABRT) only ends the engine process; the Core carries on', async (t) => {
  const { host, logs } = makeHost(t, { options: { abortOnRun: true } });
  await host.load();
  await assert.rejects(host.run({ audio: audio() }), (e) => e.status === 503 && e.code === 'engine_stopped');
  assert.ok(logs.some((l) => /engine process ended \(signal SIGABRT\)/.test(l)), logs.join('\n'));
  assert.match(host.status().lastError, /SIGABRT/);
  assert.equal(host.status().loaded, false);
  await host.load();
  assert.equal(host.status().loaded, true, 'a fresh engine starts');
});

test('a failed load reports the reason and leaves no engine behind', async (t) => {
  const { host } = makeHost(t, { options: { failLoad: 'Protobuf parsing failed' } });
  await assert.rejects(host.load(), (e) => e.status === 500 && e.code === 'engine_failed' && /Protobuf/.test(e.message));
  const st = host.status();
  assert.equal(st.loaded, false);
  assert.equal(st.loading, false);
  assert.match(st.lastError, /Protobuf/);
});

test('a load that takes too long times out', async (t) => {
  const { host } = makeHost(t, { options: { loadMs: 3000 }, loadTimeoutMs: 100 });
  await assert.rejects(host.load(), (e) => e.status === 504 && e.code === 'load_timeout');
});

test('cancelling a queued request (the phone gave up) removes it without running it', async (t) => {
  const { host } = makeHost(t, { options: { delayMs: 150 } });
  await host.load();
  const first = host.run({ audio: audio() });
  const ac = new AbortController();
  const second = host.run({ audio: audio(2) }, { signal: ac.signal });
  await until(() => host.status().queued === 1, { what: 'queued' });
  ac.abort();
  await assert.rejects(second, (e) => e.code === 'cancelled');
  assert.equal(host.status().queued, 0);
  await first;
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(host.run({ audio: audio() }, { signal: pre.signal }), (e) => e.code === 'cancelled');
});

test('after the idle time the model is let go; the next request loads it again', async (t) => {
  const { host, logs } = makeHost(t, { idleMs: 120 });
  await host.load();
  await host.run({ audio: audio() });
  assert.equal(host.status().loaded, true);
  await until(() => !host.status().loaded, { what: 'idle unload', timeoutMs: 3000 });
  assert.ok(logs.some((l) => /unloading the model/.test(l)));
  const r = await host.run({ audio: audio() });
  assert.match(r.output.text, /16000 samples/);
  assert.equal(host.status().loaded, true);
});

test('changing the model replaces the engine; unload rejects what waits; stop ends everything', async (t) => {
  const { host, setModel, cacheDir } = makeHost(t, { options: { delayMs: 100 } });
  await host.load();
  setModel(HEAR_MODELS['base.en']);
  await host.load();
  assert.ok(fs.existsSync(path.join(cacheDir, 'onnx-community/whisper-base.en')));
  const running = host.run({ audio: audio() });
  const waiting = host.run({ audio: audio() });
  await until(() => host.status().queued === 1, { what: 'queued' });
  host.unload('turned off');
  await assert.rejects(waiting, (e) => e.code === 'engine_stopped' && /turned off/.test(e.message));
  await assert.rejects(running, (e) => e.code === 'engine_stopped');
  await host.stop();
  await assert.rejects(host.run({ audio: audio() }), (e) => e.code === 'stopped');
  await assert.rejects(host.load(), (e) => e.code === 'stopped');
});

test('the voice engine returns its audio across the process boundary as a Float32Array', async (t) => {
  const { host } = makeHost(t, { kind: 'speak', model: SPEAK_MODELS.q8 });
  const r = await host.run({ sentences: ['Hello there.', 'How are you?'], voice: 'bm_george', speed: 1 });
  assert.ok(r.output.audio instanceof Float32Array);
  assert.equal(r.output.audio.length, 12000);
  assert.equal(r.output.sampleRate, 24000);
});
