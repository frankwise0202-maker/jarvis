// /api/senses, /api/hear and /api/speak through the real HTTP server and runtime (fixture mode), with the
// stub engine in the real worker threads: off by default, turning on downloads and warms up, hearing and
// speaking, every refusal, CORS, body limits, settings that survive a restart, a failed download, missing
// libraries, and a Core started without node_modules.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../../../server/runtime.mjs';
import { encodeWav, parseWav } from '../../../server/senses/wav.mjs';
import { request, testConfig, tmpDir } from '../helpers.mjs';

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const STUB = new URL('./stub-engine.mjs', import.meta.url).href;
const APP = 'https://frankwise0202-maker.github.io';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, { timeoutMs = 8000, what = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(100); // under the API's general limit of 20 requests a second
  }
}

async function startCore({ dataDir = null, modelsDir, options = {}, senses = {} } = {}) {
  const config = testConfig(['--fixture', 'ok', '--port', '0']);
  if (dataDir) {
    config.persist = true;
    config.dataDir = dataDir;
    config.secretsDir = path.join(dataDir, 'secrets');
  }
  config.senses = { engineUrl: STUB, engineOptions: options, modelsDir, startDelayMs: 0, depsCheck: () => ({ installed: true, missing: [] }), ...senses };
  const logs = [];
  const rt = await createRuntime(config, { log: (m) => logs.push(m) });
  const { port } = await rt.start({ port: 0 });
  const json = (method, p, body, headers = {}) => request(port, p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body) });
  const get = (p, headers = {}) => request(port, p, { headers });
  return { rt, port, json, get, logs };
}

/** POST a WAV to /api/hear; the body stays binary. */
function hear(port, wav, { query = '', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ default: http }) => {
      const req = http.request({ host: '127.0.0.1', port, path: `/api/hear${query}`, method: 'POST', headers: { 'content-type': 'audio/wav', 'content-length': wav.length, ...headers }, agent: false }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, json: parsed });
        });
      });
      req.on('error', reject);
      req.end(wav);
    }, reject);
  });
}

/** POST /api/speak; resolves with the raw body (a WAV) or the JSON error. */
function speak(port, body, headers = {}) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ default: http }) => {
      const data = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const req = http.request({ host: '127.0.0.1', port, path: '/api/speak', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length, ...headers }, agent: false }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let parsed = null;
          if (String(res.headers['content-type']).startsWith('application/json')) parsed = JSON.parse(buf.toString('utf8'));
          resolve({ status: res.statusCode, headers: res.headers, body: buf, json: parsed });
        });
      });
      req.on('error', reject);
      req.end(data);
    }, reject);
  });
}

const speech = (sec = 1) => encodeWav(Float32Array.from({ length: 16000 * sec }, (_, i) => 0.3 * Math.sin(i / 7)), 16000);

let core;
let models;
before(async () => {
  models = tmpDir('jarvis-senses-models-');
  core = await startCore({ modelsDir: models, options: { loadMs: 60 } });
});
after(async () => {
  await core.rt.stop();
  fs.rmSync(models, { recursive: true, force: true });
});

test('GET /api/senses: both senses off by default, with the brief\'s fields', async () => {
  const r = await core.get('/api/senses');
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  const { hear: h, speak: s, deps } = r.json;
  assert.deepEqual(deps, { installed: true });
  assert.deepEqual({ enabled: h.enabled, model: h.model, state: h.state, progress: h.progress, sizeMb: h.sizeMb, error: h.error }, { enabled: false, model: 'base.en', state: 'off', progress: 0, sizeMb: 80, error: null });
  assert.deepEqual({ enabled: s.enabled, voice: s.voice, state: s.state, progress: s.progress, sizeMb: s.sizeMb, error: s.error }, { enabled: false, voice: 'bm_george', state: 'off', progress: 0, sizeMb: 326, error: null });
  assert.equal(s.dtype, 'fp32');
  assert.equal(h.loaded, false);
  // nothing is downloaded or started while off
  assert.deepEqual(fs.readdirSync(models), []);
  assert.equal(core.rt.senses.hosts.hear.status().loaded, false);
});

test('while off, hearing and speaking say so (409) and nothing runs', async () => {
  const h = await hear(core.port, speech());
  assert.equal(h.status, 409);
  assert.equal(h.json.error, 'hear_off');
  assert.match(h.json.message, /Settings > Home base/);
  const s = await speak(core.port, { text: 'Hello.' });
  assert.equal(s.status, 409);
  assert.equal(s.json.error, 'speak_off');
});

test('PUT /api/senses refuses what it does not understand', async () => {
  const cases = [
    [{ hear: { enabled: 'yes' } }, 400, 'bad_settings'],
    [{ hear: { model: 'large' } }, 400, 'bad_model'],
    [{ speak: { voice: 'robot' } }, 400, 'bad_voice'],
    [{ volume: 11 }, 400, 'bad_settings'],
    ['{not json', 400, 'bad_json'],
  ];
  for (const [body, status, code] of cases) {
    const r = await core.json('PUT', '/api/senses', body);
    assert.equal(r.status, status, JSON.stringify(body));
    assert.equal(r.json.error, code);
  }
  const plain = await request(core.port, '/api/senses', { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(plain.status, 415);
  const big = await core.json('PUT', '/api/senses', JSON.stringify({ hear: { enabled: false }, pad: 'x'.repeat(5000) }));
  assert.equal(big.status, 413, 'PUT /api/senses keeps the 4 KB limit');
  assert.equal((await core.json('POST', '/api/senses', {})).status, 405);
  assert.equal((await core.json('DELETE', '/api/senses')).status, 405);
  assert.equal((await core.get('/api/senses')).json.hear.enabled, false, 'nothing changed');
});

test('turning both on downloads and warms up in the background: downloading → ready, with progress', async () => {
  const r = await core.json('PUT', '/api/senses', { hear: { enabled: true, model: 'base.en' }, speak: { enabled: true } });
  assert.equal(r.status, 200);
  assert.equal(r.json.hear.enabled, true);
  assert.equal(r.json.hear.state, 'downloading');
  assert.equal(r.json.speak.state, 'downloading');
  assert.ok(r.json.hear.progress >= 0 && r.json.hear.progress < 1);
  const ready = await until(async () => {
    const s = (await core.get('/api/senses')).json;
    return s.hear.state === 'ready' && s.speak.state === 'ready' && s.hear.loaded && s.speak.loaded ? s : null;
  }, { what: 'both ready' });
  assert.equal(ready.hear.progress, 1);
  assert.equal(ready.hear.downloaded, true);
  assert.ok(fs.existsSync(path.join(models, 'onnx-community/whisper-base.en')));
  assert.ok(fs.existsSync(path.join(models, 'onnx-community/Kokoro-82M-v1.0-ONNX')));
  assert.ok(core.logs.some((l) => /hearing: downloading onnx-community\/whisper-base\.en \(q8, about 80 MB\)/.test(l)), core.logs.join('\n'));
  assert.ok(core.logs.some((l) => /voice: ready/.test(l)));
});

test('POST /api/hear: a WAV in, {text, ms, model} out; the prompt reaches Whisper, capped at 200 characters', async () => {
  const r = await hear(core.port, speech(2), { query: `?prompt=${encodeURIComponent('Frank, home base, Jarvis')}` });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.text, 'hello from the stub (32000 samples; prompt: Frank, home base, Jarvis)');
  assert.equal(r.json.model, 'base.en');
  assert.ok(Number.isInteger(r.json.ms) && r.json.ms >= 0);
  assert.equal(r.json.seconds, 2);
  const long = await hear(core.port, speech(), { query: `?prompt=${encodeURIComponent('word '.repeat(100))}` });
  assert.equal(long.status, 200);
  const prompt = long.json.text.split('prompt: ')[1].replace(/\)$/, '');
  assert.ok(prompt.length <= 200, `prompt ${prompt.length}`);
  assert.equal((await core.get('/api/senses')).json.hear.lastMs >= 0, true);
});

test('POST /api/hear: silence comes back as no words, without running Whisper (which would invent "Thank you.")', async () => {
  const before = core.rt.senses.hosts.hear.status();
  const r = await hear(core.port, encodeWav(Float32Array.from({ length: 32000 }, (_, i) => (i % 2 ? 0.001 : -0.001)), 16000));
  assert.equal(r.status, 200);
  assert.equal(r.json.text, '');
  assert.equal(r.json.seconds, 2);
  assert.equal(core.rt.senses.hosts.hear.status().busy, false);
  assert.equal(before.loaded, core.rt.senses.hosts.hear.status().loaded);
});

test("the app's warm-up (a short silence when Voice Mode opens) loads Whisper again after the idle unload, and restarts a loaded one's idle time", async () => {
  const dir = tmpDir('jarvis-senses-models-');
  const c = await startCore({ modelsDir: dir, options: { loadMs: 60 }, senses: { idleMs: 1500 } });
  const host = c.rt.senses.hosts.hear;
  const warmUp = () => hear(c.port, encodeWav(new Float32Array(Math.round(16000 * 0.4)), 16000)); // what src/ui/senses.js sends
  try {
    assert.equal((await c.json('PUT', '/api/senses', { hear: { enabled: true } })).status, 200);
    await until(() => host.status().loaded, { what: 'hearing loaded' });
    await until(() => !host.status().loaded && !host.status().loading, { what: 'the idle unload' });
    assert.equal((await c.get('/api/senses')).json.hear.state, 'ready');
    const w = await warmUp();
    assert.equal(w.status, 200);
    assert.equal(w.json.text, '');
    await until(() => host.status().loaded, { what: 'loaded again by the warm-up' });
    // Loaded and idle: each warm-up starts the idle time again (here every 0.5 s for 2.5 s, idle time 1.5 s).
    const pid = host.status().pid;
    for (let i = 0; i < 5; i++) {
      await sleep(500);
      assert.equal((await warmUp()).status, 200);
    }
    assert.equal(host.status().loaded, true);
    assert.equal(host.status().pid, pid);
  } finally {
    await c.rt.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/hear refuses wrong audio, wrong types and bodies over 2 MB', async () => {
  const wrongRate = await hear(core.port, encodeWav(new Float32Array(44100), 44100));
  assert.equal(wrongRate.status, 400);
  assert.equal(wrongRate.json.error, 'bad_audio');
  assert.match(wrongRate.json.message, /16 kHz/);
  const tooLong = await hear(core.port, encodeWav(new Float32Array(16000 * 31), 16000));
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.json.error, 'audio_too_long');
  const garbage = await hear(core.port, Buffer.from('this is not a wav at all'));
  assert.equal(garbage.json.error, 'bad_audio');
  const type = await hear(core.port, speech(), { headers: { 'content-type': 'audio/mpeg' } });
  assert.equal(type.status, 415);
  const octet = await hear(core.port, speech(), { headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(octet.status, 200, 'application/octet-stream is accepted too');
  const huge = await hear(core.port, Buffer.alloc(2 * 1024 * 1024 + 1));
  assert.equal(huge.status, 413);
  assert.equal(huge.json.error, 'too_large');
  const get = await core.get('/api/hear');
  assert.equal(get.status, 405);
  assert.match(get.headers.allow, /POST/);
});

test('POST /api/speak: audio/wav, 24 kHz mono 16-bit, split by sentence, with timing headers', async () => {
  const r = await speak(core.port, { text: 'Good morning, Frank. It is 41 degrees. Shall I read the news?', voice: 'bm_george', speed: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'audio/wav');
  assert.equal(r.headers['x-jarvis-sentences'], '3');
  assert.ok(Number(r.headers['x-jarvis-ms']) >= 0);
  assert.equal(Number(r.headers['content-length']), r.body.length);
  const w = parseWav(r.body);
  assert.deepEqual([w.format, w.channels, w.sampleRate, w.bitsPerSample], [1, 1, 24000, 16]);
  assert.equal(w.samples.length, 18000); // the stub: 0.25 s a sentence
  assert.equal(Number(r.headers['x-jarvis-seconds']), 0.75);
  const defaults = await speak(core.port, { text: 'Just this.' });
  assert.equal(defaults.status, 200, 'voice and speed are optional');
});

test('POST /api/speak refuses empty, too long, unknown voice, odd speed and extra fields; 4 KB body limit', async () => {
  const cases = [
    [{ text: '' }, 'bad_text'],
    [{ text: '   ' }, 'bad_text'],
    [{ text: 42 }, 'bad_text'],
    [{}, 'bad_text'],
    [{ text: 'x'.repeat(1001) }, 'text_too_long'],
    [{ text: 'Hi.', voice: 'hal9000' }, 'bad_voice'],
    [{ text: 'Hi.', speed: 3 }, 'bad_speed'],
    [{ text: 'Hi.', speed: '1' }, 'bad_speed'],
    [{ text: 'Hi.', pitch: 2 }, 'bad_request'],
    [{ text: '...' }, 'bad_text'],
  ];
  for (const [body, code] of cases) {
    const r = await speak(core.port, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.json.error, code, JSON.stringify(body));
  }
  assert.equal((await speak(core.port, '{"text": "x"')).json.error, 'bad_json');
  const big = await speak(core.port, JSON.stringify({ text: 'Hi.', pad: 'x'.repeat(5000) }));
  assert.equal(big.status, 413);
  assert.equal((await speak(core.port, { text: 'Hi.' }, { 'content-type': 'text/plain' })).status, 415);
});

test('CORS and access: the Jarvis app may call all three (and read the timing headers); other pages may not', async () => {
  const pre = await request(core.port, '/api/hear?prompt=x', { method: 'OPTIONS', headers: { origin: APP, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], APP);
  assert.match(pre.headers['access-control-allow-headers'], /Content-Type/);
  const s = await speak(core.port, { text: 'Hello.' }, { origin: APP });
  assert.equal(s.status, 200);
  assert.equal(s.headers['access-control-allow-origin'], APP);
  assert.match(s.headers['access-control-expose-headers'], /X-Jarvis-Ms/);
  const h = await hear(core.port, speech(), { headers: { origin: APP } });
  assert.equal(h.headers['access-control-allow-origin'], APP);
  const g = await core.get('/api/senses', { origin: APP });
  assert.equal(g.headers['access-control-allow-origin'], APP);
  const evil = await speak(core.port, { text: 'Hello.' }, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers['access-control-allow-origin'], undefined);
  const funnel = await request(core.port, '/api/senses', { headers: { 'tailscale-funnel-request': '?1' } });
  assert.equal(funnel.status, 403, 'public Funnel traffic is refused like everywhere else');
  const rebinding = await request(core.port, '/api/senses', { host: 'attacker.example' });
  assert.equal(rebinding.status, 403);
});

test('switching hearing to Accurate downloads small.en; turning voice off lets its model go', async () => {
  const r = await core.json('PUT', '/api/senses', { hear: { model: 'accurate' }, speak: { enabled: false } });
  assert.equal(r.json.hear.model, 'small.en');
  assert.equal(r.json.hear.sizeMb, 252);
  assert.equal(r.json.speak.state, 'off');
  assert.equal(r.json.speak.loaded, false);
  assert.equal(r.json.speak.downloaded, true, 'its files stay for next time');
  await until(async () => (await core.get('/api/senses')).json.hear.state === 'ready', { what: 'small.en ready' });
  const h = await hear(core.port, speech());
  assert.equal(h.json.model, 'small.en');
  // turning it back on is instant: already downloaded, state ready while it warms up
  const on = await core.json('PUT', '/api/senses', { speak: { enabled: true } });
  assert.equal(on.json.speak.state, 'ready');
  assert.equal((await speak(core.port, { text: 'Back again.' })).status, 200, 'the first request waits for the warm-up');
});

test('settings survive a restart and what is on warms up again; a download that fails says so and retries', async () => {
  const dataDir = tmpDir('jarvis-senses-data-');
  const models2 = tmpDir('jarvis-senses-models-');
  try {
    const a = await startCore({ dataDir, modelsDir: models2 });
    await a.json('PUT', '/api/senses', { hear: { enabled: true, model: 'tiny.en' } });
    await until(async () => (await a.get('/api/senses')).json.hear.state === 'ready', { what: 'tiny ready' });
    await a.rt.stop();
    const file = path.join(dataDir, 'senses', 'settings-v1.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { v: 1, hear: { enabled: true, model: 'tiny.en' }, speak: { enabled: false, voice: 'bm_george' } });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);

    const b = await startCore({ dataDir, modelsDir: models2 });
    try {
      const s = (await b.get('/api/senses')).json;
      assert.equal(s.hear.enabled, true);
      assert.equal(s.hear.model, 'tiny.en');
      assert.equal(s.hear.state, 'ready');
      await until(() => b.rt.senses.hosts.hear.status().loaded, { what: 'warm again after the restart' });
      assert.equal((await hear(b.port, speech())).status, 200);
    } finally {
      await b.rt.stop();
    }

    // a download that cannot finish (offline): state error with a plain message; PUT again retries
    const c = await startCore({ dataDir, modelsDir: tmpDir('jarvis-senses-models-'), options: { failLoad: 'fetch failed' } });
    try {
      const s = await until(async () => {
        const v = (await c.get('/api/senses')).json;
        return v.hear.state === 'error' ? v : null;
      }, { what: 'download error' });
      assert.equal(s.hear.errorCode, 'download_failed');
      assert.match(s.hear.error, /could not download the model/);
      const h = await hear(c.port, speech());
      assert.equal(h.status, 503);
      assert.equal(h.json.error, 'hear_unavailable');
      const again = await c.json('PUT', '/api/senses', { hear: { enabled: true } });
      assert.equal(again.json.hear.state, 'downloading', 'retrying');
      assert.equal(again.json.hear.error, null);
    } finally {
      await c.rt.stop();
    }
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(models2, { recursive: true, force: true });
  }
});

test('a model file cut short (a power cut mid-download) is fetched again, never loaded broken', async () => {
  const m = tmpDir('jarvis-senses-models-');
  const dir = path.join(m, 'onnx-community/whisper-tiny.en/794207fec2761281fe63a23a94b7e9f53a4efbc1/onnx');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'encoder_model_quantized.onnx'), Buffer.alloc(1000));
  const c = await startCore({ modelsDir: m });
  try {
    const r = await c.json('PUT', '/api/senses', { hear: { enabled: true, model: 'tiny.en' } });
    assert.equal(r.json.hear.state, 'downloading');
    await until(async () => (await c.get('/api/senses')).json.hear.state === 'ready', { what: 'ready' });
    assert.equal(fs.statSync(path.join(dir, 'encoder_model_quantized.onnx')).size, 10124993);
  } finally {
    await c.rt.stop();
    fs.rmSync(m, { recursive: true, force: true });
  }
});

test('while downloading, a request is told to wait (503 not_ready with Retry-After)', async () => {
  const m = tmpDir('jarvis-senses-models-');
  const c = await startCore({ modelsDir: m, options: { loadMs: 1500 } });
  try {
    await c.json('PUT', '/api/senses', { hear: { enabled: true, model: 'tiny.en' } });
    const h = await hear(c.port, speech());
    assert.equal(h.status, 503);
    assert.equal(h.json.error, 'not_ready');
    assert.match(h.json.message, /still downloading \(\d+ %\)/);
    assert.equal(h.headers['retry-after'], '10');
  } finally {
    await c.rt.stop();
    fs.rmSync(m, { recursive: true, force: true });
  }
});

test('without the speech libraries: deps.installed false, turning on shows why, requests get 503 deps_missing', async () => {
  const m = tmpDir('jarvis-senses-models-');
  const c = await startCore({ modelsDir: m, senses: { depsCheck: () => ({ installed: false, missing: ['kokoro-js'] }) } });
  try {
    const s = (await c.get('/api/senses')).json;
    assert.deepEqual(s.deps, { installed: false, missing: ['kokoro-js'] });
    const on = await c.json('PUT', '/api/senses', { hear: { enabled: true }, speak: { enabled: true } });
    assert.equal(on.status, 200);
    assert.equal(on.json.hear.state, 'error');
    assert.equal(on.json.hear.errorCode, 'deps_missing');
    assert.match(on.json.speak.error, /jarvis-core update/);
    assert.equal((await hear(c.port, speech())).json.error, 'deps_missing');
    assert.equal((await speak(c.port, { text: 'Hi.' })).json.error, 'deps_missing');
    assert.deepEqual(fs.readdirSync(m), [], 'nothing was downloaded');
  } finally {
    await c.rt.stop();
    fs.rmSync(m, { recursive: true, force: true });
  }
});

test('zero-dependency start: a Core without node_modules serves everything and reports the senses as not installed', async () => {
  const dir = tmpDir('jarvis-core-nodeps-senses-');
  fs.cpSync(path.join(CORE, 'server'), path.join(dir, 'server'), { recursive: true });
  fs.cpSync(path.join(CORE, 'fixtures'), path.join(dir, 'fixtures'), { recursive: true });
  fs.copyFileSync(path.join(CORE, 'package.json'), path.join(dir, 'package.json'));
  assert.equal(fs.existsSync(path.join(dir, 'node_modules')), false);
  const env = { ...process.env, JARVIS_CORE_CONFIG: path.join(dir, 'none.json'), JARVIS_CORE_MODELS_DIR: path.join(dir, 'models'), NODE_PATH: '' };
  const child = spawn(process.execPath, [path.join(dir, 'server/main.mjs'), '--fixture', 'ok', '--port', '0'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (out += c));
  try {
    const m = await until(() => /running at http:\/\/127\.0\.0\.1:(\d+)\//.exec(out), { timeoutMs: 10_000, what: `the Core to start: ${out}` });
    const p = Number(m[1]);
    assert.equal((await request(p, '/api/status')).status, 200);
    assert.equal((await request(p, '/api/brain')).status, 200);
    const s = (await request(p, '/api/senses')).json;
    assert.equal(s.deps.installed, false);
    assert.deepEqual(s.deps.missing, ['@huggingface/transformers', 'kokoro-js', 'onnxruntime-node']);
    assert.equal(s.hear.state, 'off');
    const on = await request(p, '/api/senses', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hear: { enabled: true } }) });
    assert.equal(on.status, 200);
    assert.equal(on.json.hear.errorCode, 'deps_missing');
    assert.equal((await hear(p, speech())).json.error, 'deps_missing');
    assert.ok(!fs.existsSync(path.join(dir, 'models')), 'no download was attempted');
    assert.ok(!/could not be loaded|ERR_MODULE_NOT_FOUND/.test(out), out);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
