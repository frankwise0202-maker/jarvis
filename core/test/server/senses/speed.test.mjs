// Jarvis Core 1.2.2: George ready and fast for the phone. With the stub engine in the real engine processes:
// the idle times (hearing 30 minutes, George 6 hours, both configurable), PUT enabled:true again warming
// George, and the speed check at warm-up: George timed on a fixed sentence, the rtf recorded and shown in
// GET /api/senses, and the 8-bit model (q8) tried, downloaded and switched to when fp32 is slower than 0.8 x
// real time here and q8 is faster (kept across restarts, never with a fixed model).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRuntime } from '../../../server/runtime.mjs';
import { loadConfig, sensesConfig } from '../../../server/config.mjs';
import { HEAR_IDLE_MS, SPEAK_IDLE_MS } from '../../../server/senses/index.mjs';
import { SPEAK_MODELS, modelDir } from '../../../server/senses/models.mjs';
import { RTF_SWITCH, BENCH_TEXT, rtfOf, processorId, normalizeSpeedRecord, withMeasurement, pickDtype, prefersQ8, shouldTryQ8 } from '../../../server/senses/speed.mjs';
import { request, testConfig, tmpDir } from '../helpers.mjs';

const STUB = new URL('./stub-engine.mjs', import.meta.url).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CPU = 'Test CPU @ 3.40GHz x8';

async function until(fn, { timeoutMs = 10_000, what = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(60);
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function startCore(t, { dataDir = null, options = {}, senses = {} } = {}) {
  const modelsDir = senses.modelsDir ?? tmpDir('jarvis-speed-models-');
  const config = testConfig(['--fixture', 'ok', '--port', '0']);
  if (dataDir) {
    config.persist = true;
    config.dataDir = dataDir;
    config.secretsDir = path.join(dataDir, 'secrets');
  }
  config.senses = { engineUrl: STUB, engineOptions: options, modelsDir, startDelayMs: 0, quietMs: 20, trialQuietMs: 300, cpu: CPU, depsCheck: () => ({ installed: true, missing: [] }), ...senses };
  const logs = [];
  const rt = await createRuntime(config, { log: (m) => logs.push(m) });
  const { port } = await rt.start({ port: 0 });
  const put = (body) => request(port, '/api/senses', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const info = async () => (await request(port, '/api/senses')).json;
  const speak = (text = 'Good evening, Frank.') => request(port, '/api/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await rt.stop();
  };
  t.after(async () => {
    await stop();
    if (!senses.modelsDir) fs.rmSync(modelsDir, { recursive: true, force: true });
  });
  return { rt, port, put, info, speak, logs, modelsDir, stop };
}

const q8File = (modelsDir) => path.join(modelDir(modelsDir, SPEAK_MODELS.q8), 'onnx/model_quantized.onnx');
/** Wait for the speed check after a warm-up to finish (George loaded, timed, nothing being measured). */
const checked = (c, what = 'the speed check') => until(async () => {
  const s = (await c.info()).speak;
  return s.loaded && s.rtf !== null && !s.measuring ? s : null;
}, { what });

test('speed helpers: the rtf, the processor, the record, which model to load and when to try q8', () => {
  assert.equal(rtfOf({ ms: 1500, samples: 24000 * 5, sampleRate: 24000 }), 0.3);
  assert.equal(rtfOf({ ms: 0, samples: 0, sampleRate: 24000 }), null);
  assert.equal(rtfOf({ ms: NaN, samples: 10, sampleRate: 24000 }), null);
  assert.equal(processorId({ cpus: () => [{ model: '  Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz ' }], availableParallelism: () => 8 }), 'Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz x8');
  assert.equal(processorId({ cpus: () => [], availableParallelism: () => 4 }), 'unknown processor x4');
  assert.match(processorId(), / x\d+$/);
  assert.ok(BENCH_TEXT.length > 60 && BENCH_TEXT.length < 120 && !/[.!?]\s/.test(BENCH_TEXT), 'one sentence of everyday length');

  assert.equal(normalizeSpeedRecord(null), null);
  assert.equal(normalizeSpeedRecord({ v: 2, cpu: 'x' }), null);
  assert.deepEqual(normalizeSpeedRecord({ v: 1, cpu: 'x', dtype: 'fp16', measured: { fp32: { rtf: 0.456, at: 't' }, q8: { rtf: -1 }, fp16: { rtf: 1 } } }), { v: 1, cpu: 'x', measured: { fp32: { rtf: 0.46, at: 't' } } });
  const r = withMeasurement(withMeasurement(null, 'cpu A', 'fp32', 1.234, 'a'), 'cpu A', 'q8', 0.5, 'b');
  assert.deepEqual(r, { v: 1, cpu: 'cpu A', measured: { fp32: { rtf: 1.23, at: 'a' }, q8: { rtf: 0.5, at: 'b' } } });
  assert.deepEqual(withMeasurement({ ...r, dtype: 'q8' }, 'cpu B', 'fp32', 0.4, 'c'), { v: 1, cpu: 'cpu B', measured: { fp32: { rtf: 0.4, at: 'c' } } }, 'another processor starts afresh');

  assert.equal(pickDtype({ configured: 'fp32', auto: true, record: { ...r, dtype: 'q8' }, cpu: 'cpu A' }), 'q8');
  assert.equal(pickDtype({ configured: 'fp32', auto: true, record: { ...r, dtype: 'q8' }, cpu: 'cpu B' }), 'fp32', 'measured on another processor');
  assert.equal(pickDtype({ configured: 'fp32', auto: false, record: { ...r, dtype: 'q8' }, cpu: 'cpu A' }), 'fp32', 'a fixed model');
  assert.equal(pickDtype({ configured: 'fp32', auto: true, record: r, cpu: 'cpu A' }), 'fp32', 'no verdict yet');

  assert.equal(RTF_SWITCH, 0.8);
  assert.equal(prefersQ8(1, 0.9), true);
  assert.equal(prefersQ8(1, 0.97), false, 'a tie keeps fp32');
  assert.equal(shouldTryQ8({ dtype: 'fp32', rtf: 0.8, cpu: 'c' }), false, 'not above 0.8');
  assert.equal(shouldTryQ8({ dtype: 'fp32', rtf: 0.81, cpu: 'c' }), true);
  assert.equal(shouldTryQ8({ dtype: 'q8', rtf: 1.5, cpu: 'c' }), false, 'already on q8');
  assert.equal(shouldTryQ8({ auto: false, dtype: 'fp32', rtf: 1.5, cpu: 'c' }), false, 'a fixed model');
  const slowQ8 = { v: 1, cpu: 'c', measured: { q8: { rtf: 1.4 } } };
  assert.equal(shouldTryQ8({ dtype: 'fp32', rtf: 1.0, record: slowQ8, cpu: 'c' }), false, 'q8 already measured slower here');
  assert.equal(shouldTryQ8({ dtype: 'fp32', rtf: 1.6, record: slowQ8, cpu: 'c' }), true, 'fp32 got slower than q8 was');
  assert.equal(shouldTryQ8({ dtype: 'fp32', rtf: 1.0, record: slowQ8, cpu: 'other' }), true, 'measured on another processor');
});

test('config: the idle times and George\'s model from config.json "senses" or the environment; bad values are reported', () => {
  assert.equal(HEAR_IDLE_MS, 30 * 60_000);
  assert.equal(SPEAK_IDLE_MS, 6 * 3600_000);
  const w = [];
  assert.deepEqual(sensesConfig(undefined, {}, w), {});
  assert.deepEqual(sensesConfig({ hearIdleMinutes: 45, speakIdleMinutes: 0, speakDtype: 'Q8' }, {}, w), { hearIdleMs: 45 * 60_000, speakIdleMs: 0, speakDtype: 'q8' });
  assert.deepEqual(w, []);
  assert.deepEqual(sensesConfig({ speakIdleMinutes: 10 }, { JARVIS_CORE_SPEAK_IDLE_MINUTES: '720', JARVIS_CORE_HEAR_IDLE_MINUTES: '15' }), { speakIdleMs: 720 * 60_000, hearIdleMs: 15 * 60_000 }, 'the environment wins');
  assert.deepEqual(sensesConfig({ speakDtype: 'q8' }, { JARVIS_CORE_SPEAK_DTYPE: 'auto' }), {}, 'auto in the environment');
  const bad = [];
  assert.deepEqual(sensesConfig({ speakIdleMinutes: 90, hearIdleMinutes: -1, pitch: 2 }, { JARVIS_CORE_SPEAK_IDLE_MINUTES: 'never', JARVIS_CORE_SPEAK_DTYPE: 'fp16' }, bad), { speakIdleMs: 90 * 60_000 }, 'a bad environment value falls back to the file');
  assert.equal(bad.length, 4, bad.join('\n'));
  assert.ok(bad.some((m) => /senses\.pitch/.test(m)) && bad.some((m) => /JARVIS_CORE_SPEAK_DTYPE "fp16"/.test(m)) && bad.some((m) => /senses\.hearIdleMinutes "-1"/.test(m)));
  const notObject = [];
  assert.deepEqual(sensesConfig(30, {}, notObject), {});
  assert.match(notObject[0], /"senses" should be an object/);
  const { config, warnings } = loadConfig({ env: { JARVIS_CORE_SPEAK_DTYPE: 'fp32' }, argv: [], readFile: () => JSON.stringify({ senses: { speakIdleMinutes: 120, engineUrl: 'file:///x.mjs' } }) });
  assert.deepEqual(config.senses, { speakIdleMs: 120 * 60_000, speakDtype: 'fp32' }, 'only the three settings pass, never an engine');
  assert.deepEqual(warnings, ['config file key "senses.engineUrl" is not supported (ignored)']);
});

test('idle times: hearing lets its model go after 30 minutes, George after 6 hours; set them apart, 0 keeps a model', async (t) => {
  const d = await startCore(t);
  const s = await d.info();
  assert.equal(s.hear.idleMinutes, 30);
  assert.equal(s.speak.idleMinutes, 360);
  await d.stop();

  const c = await startCore(t, { senses: { hearIdleMs: 60_000, speakIdleMs: 700, speedCheck: false } });
  assert.equal((await c.put({ hear: { enabled: true, model: 'tiny.en' }, speak: { enabled: true } })).status, 200);
  await until(async () => {
    const v = await c.info();
    return v.hear.loaded && v.speak.loaded;
  }, { what: 'both loaded' });
  await until(async () => !(await c.info()).speak.loaded, { what: 'George let go after his idle time' });
  const v = await c.info();
  assert.equal(v.hear.loaded, true, 'hearing keeps its own, longer idle time');
  assert.equal(v.speak.state, 'ready', 'still on and on disk');
  assert.ok(c.logs.some((l) => /voice: unloading the model/.test(l)));
  assert.ok(!c.logs.some((l) => /hearing: unloading the model/.test(l)));

  const keep = await startCore(t, { senses: { speakIdleMs: 0, speedCheck: false } });
  await keep.put({ speak: { enabled: true } });
  await until(async () => (await keep.info()).speak.loaded, { what: 'loaded' });
  assert.equal((await keep.info()).speak.idleMinutes, 0);
  await sleep(500);
  assert.equal((await keep.info()).speak.loaded, true, '0: stays in memory');
});

test('PUT speak enabled:true again warms George: it loads him after the idle unload and restarts a loaded engine\'s idle time', async (t) => {
  const c = await startCore(t, { senses: { speakIdleMs: 1500, speedCheck: false } });
  const host = () => c.rt.senses.hosts.speak;
  await c.put({ speak: { enabled: true } });
  await until(() => host().status().loaded, { what: 'loaded' });
  await until(() => !host().status().loaded && !host().status().loading, { timeoutMs: 6000, what: 'the idle unload' });
  const again = await c.put({ speak: { enabled: true } });
  assert.equal(again.status, 200);
  assert.equal(again.json.speak.state, 'ready', 'on disk: ready while it loads, never "downloading"');
  await until(() => host().status().loaded, { what: 'loaded again by the warm-up' });
  // Loaded: each PUT starts the idle time again (every 0.5 s for 2.5 s with an idle time of 1.5 s).
  const pid = host().status().pid;
  for (let i = 0; i < 5; i++) {
    await sleep(500);
    assert.equal((await c.put({ speak: { enabled: true } })).status, 200);
  }
  assert.equal(host().status().loaded, true);
  assert.equal(host().status().pid, pid, 'the same engine: never reloaded');
  assert.equal((await c.speak()).status, 200);
});

test('a sentence that loads George again after the idle unload (the app\'s own warm-up) times him too', async (t) => {
  const c = await startCore(t, { options: { rtf: { fp32: 0.3 } }, senses: { speakIdleMs: 1200 } });
  await c.put({ speak: { enabled: true } });
  await checked(c);
  await until(async () => !(await c.info()).speak.loaded, { what: 'the idle unload' });
  assert.equal((await c.speak('Ready.')).status, 200);
  await until(() => c.logs.filter((l) => /George speaks at/.test(l)).length === 2, { what: 'the second timing' });
  assert.equal((await c.speak()).status, 200, 'loaded: no timing for an ordinary sentence');
  await sleep(300);
  assert.equal(c.logs.filter((l) => /George speaks at/.test(l)).length, 2);
});

test('the warm-up times George: a fast fp32 stays, its rtf is shown and recorded, and nothing more is downloaded', async (t) => {
  const c = await startCore(t, { options: { rtf: { fp32: 0.3, q8: 0.2 } } });
  const on = await c.put({ speak: { enabled: true } });
  assert.equal(on.json.speak.rtf, null, 'not measured yet');
  assert.equal(on.json.speak.autoDtype, true);
  const s = await checked(c);
  assert.equal(s.dtype, 'fp32');
  assert.ok(s.rtf >= 0.28 && s.rtf < 0.6, `rtf ${s.rtf}`);
  assert.deepEqual(Object.keys(s.measured), ['fp32']);
  assert.equal(s.measured.fp32, s.rtf);
  assert.equal(fs.existsSync(q8File(c.modelsDir)), false, 'q8 was not needed');
  assert.ok(c.logs.some((l) => /voice: George speaks at 0\.\d+x real time on this computer \(fp32/.test(l)), c.logs.join('\n'));
  assert.ok(!c.logs.some((l) => /trying Kokoro's 8-bit/.test(l)));
  assert.equal(c.rt.senses.speed.cpu, CPU);
  assert.equal(c.rt.senses.speed.dtype, undefined, 'no verdict needed');
  assert.equal((await c.speak()).status, 200);
});

test('fp32 slower than 0.8 x real time and q8 faster: the Core downloads q8, times it, switches, says so, and keeps it after a restart', async (t) => {
  const dataDir = tmpDir('jarvis-speed-data-');
  const modelsDir = tmpDir('jarvis-speed-models-');
  t.after(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(modelsDir, { recursive: true, force: true });
  });
  const options = { rtf: { fp32: 1.2, q8: 0.4 } };
  const c = await startCore(t, { dataDir, options, senses: { modelsDir } });
  await c.put({ speak: { enabled: true } });
  await until(async () => (await c.info()).speak.loaded, { what: 'fp32 loaded' });
  const fp32Pid = c.rt.senses.hosts.speak.status().pid;
  // The phone keeps asking while George is timed and the 8-bit model is tried: every request is answered.
  const answers = [];
  for (let i = 0; i < 6; i++) {
    answers.push((await c.speak(`Sentence ${i + 1}.`)).status);
    await sleep(120);
  }
  const s = await until(async () => {
    const v = (await c.info()).speak;
    return v.dtype === 'q8' && !v.measuring ? v : null;
  }, { timeoutMs: 15_000, what: 'the switch to q8' });
  assert.deepEqual(answers, [200, 200, 200, 200, 200, 200]);
  assert.ok(s.measured.fp32 > 0.8, `fp32 ${s.measured.fp32}`);
  assert.ok(s.measured.q8 < 0.8, `q8 ${s.measured.q8}`);
  assert.equal(s.rtf, s.measured.q8, 'rtf: the model in use');
  assert.equal(s.sizeMb, 92);
  assert.equal(s.downloaded, true);
  assert.equal(s.state, 'ready');
  assert.equal(s.loaded, true);
  assert.ok(fs.existsSync(q8File(modelsDir)), 'q8 was downloaded');
  const out = await c.rt.senses.hosts.speak.run({ sentences: ['Hello.'], voice: 'bm_george', speed: 1 });
  assert.equal(out.output.dtype, 'q8', 'the 8-bit engine speaks now');
  assert.notEqual(out.output.pid, fp32Pid);
  await until(() => !alive(fp32Pid), { what: 'the fp32 engine ended (its memory back)' });
  assert.equal((await c.speak()).status, 200);
  assert.ok(c.logs.some((l) => /trying Kokoro's 8-bit model \(downloading onnx-community\/Kokoro-82M-v1\.0-ONNX q8, about 92 MB\)/.test(l)), c.logs.join('\n'));
  assert.ok(c.logs.some((l) => /voice: switched to Kokoro's 8-bit model \(q8\)/.test(l)), c.logs.join('\n'));
  await c.stop();
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'senses', 'speed-v1.json'), 'utf8'));
  assert.equal(saved.cpu, CPU);
  assert.equal(saved.dtype, 'q8');
  assert.equal(saved.measured.q8.rtf, s.measured.q8);
  assert.equal(fs.statSync(path.join(dataDir, 'senses', 'speed-v1.json')).mode & 0o777, 0o600);

  // After a restart the Core loads q8 straight away (no fp32 first) and times it again.
  const b = await startCore(t, { dataDir, options, senses: { modelsDir } });
  assert.equal((await b.info()).speak.dtype, 'q8');
  const again = await checked(b, 'q8 warm and timed after the restart');
  assert.equal(again.dtype, 'q8');
  assert.ok(!b.logs.some((l) => /trying Kokoro's 8-bit/.test(l)));
  assert.ok(b.logs.some((l) => /voice: ready \(onnx-community\/Kokoro-82M-v1\.0-ONNX q8/.test(l)), b.logs.join('\n'));
  await b.stop();

  // Another processor (the data folder moved to a new computer) starts from fp32 again.
  const other = await startCore(t, { dataDir, options, senses: { modelsDir, cpu: 'Another CPU x4' } });
  assert.equal((await other.info()).speak.dtype, 'fp32');
  assert.equal((await other.info()).speak.rtf, null);
});

test('fp32 slow but q8 slower: George stays on fp32, both are recorded, and q8 is not tried again', async (t) => {
  const c = await startCore(t, { options: { rtf: { fp32: 1.0, q8: 1.6 } } });
  await c.put({ speak: { enabled: true } });
  const s = await until(async () => {
    const v = (await c.info()).speak;
    return v.measured.q8 && !v.measuring ? v : null;
  }, { timeoutMs: 15_000, what: 'both timed' });
  assert.equal(s.dtype, 'fp32');
  assert.ok(s.measured.q8 > s.measured.fp32);
  assert.equal(s.rtf, s.measured.fp32);
  assert.equal(c.rt.senses.speed.dtype, 'fp32');
  assert.ok(c.logs.some((l) => /keeping fp32: the 8-bit model is not faster on this computer/.test(l)), c.logs.join('\n'));
  // Off and on again: a fresh warm-up times fp32 again but leaves q8 alone.
  await c.put({ speak: { enabled: false } });
  await c.put({ speak: { enabled: true } });
  await until(async () => c.logs.filter((l) => /George speaks at/.test(l)).length >= 2 && !(await c.info()).speak.measuring, { what: 'the second check' });
  assert.equal(c.logs.filter((l) => /trying Kokoro's 8-bit/.test(l)).length, 1);
  assert.equal((await c.info()).speak.dtype, 'fp32');
});

test('a model fixed by the owner (JARVIS_CORE_SPEAK_DTYPE) is timed but never switched', async (t) => {
  const c = await startCore(t, { options: { rtf: { fp32: 1.2, q8: 0.3 } }, senses: { speakDtype: 'fp32' } });
  const on = await c.put({ speak: { enabled: true } });
  assert.equal(on.json.speak.autoDtype, false);
  const s = await checked(c);
  assert.equal(s.dtype, 'fp32');
  assert.ok(s.rtf > 0.8);
  assert.deepEqual(Object.keys(s.measured), ['fp32']);
  await sleep(300);
  assert.ok(!c.logs.some((l) => /trying Kokoro's 8-bit/.test(l)));
  assert.equal(fs.existsSync(q8File(c.modelsDir)), false);
});

test('the 8-bit model failing to download keeps fp32 without an error; turning George off mid-trial stops the trial', async (t) => {
  const c = await startCore(t, { options: { rtf: { fp32: 1.2, q8: 0.3 }, failLoadFor: { q8: 'fetch failed' } } });
  await c.put({ speak: { enabled: true } });
  await until(() => c.logs.some((l) => /the 8-bit model could not be loaded/.test(l)), { timeoutMs: 15_000, what: 'the failed trial' });
  const s = (await c.info()).speak;
  assert.equal(s.dtype, 'fp32');
  assert.equal(s.state, 'ready');
  assert.equal(s.error, null);
  assert.equal((await c.speak()).status, 200);

  const d = await startCore(t, { options: { rtf: { fp32: 1.2, q8: 0.3 }, loadMs: 1200 } });
  await d.put({ speak: { enabled: true } });
  await until(() => d.logs.some((l) => /trying Kokoro's 8-bit/.test(l)), { timeoutMs: 15_000, what: 'the trial' });
  const off = await d.put({ speak: { enabled: false } });
  assert.equal(off.json.speak.state, 'off');
  await until(async () => !(await d.info()).speak.measuring, { what: 'the check to end' });
  await sleep(1500); // past the trial engine's load
  const v = (await d.info()).speak;
  assert.equal(v.dtype, 'fp32', 'no switch after the owner turned George off');
  assert.ok(!d.logs.some((l) => /switched to/.test(l)));
});

test('the q8 trial (a second engine loading beside George) waits until the phone has been quiet for a while', async (t) => {
  const c = await startCore(t, { options: { rtf: { fp32: 1.2, q8: 0.4 } }, senses: { trialQuietMs: 900 } });
  await c.put({ speak: { enabled: true } });
  await until(() => c.logs.some((l) => /George speaks at/.test(l)), { what: 'fp32 timed' });
  // A conversation: a sentence every 0.4 s for 3 s. The trial must not start meanwhile.
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    assert.equal((await c.speak()).status, 200);
    assert.equal((await c.info()).speak.measuring, false, 'waiting for a quiet spell is not measuring');
    await sleep(400);
  }
  assert.ok(!c.logs.some((l) => /trying Kokoro's 8-bit/.test(l)), 'no trial while the phone is talking');
  await until(() => c.logs.some((l) => /trying Kokoro's 8-bit/.test(l)), { what: 'the trial after the quiet spell' });
  await until(async () => (await c.info()).speak.dtype === 'q8', { timeoutMs: 15_000, what: 'the switch' });
});
