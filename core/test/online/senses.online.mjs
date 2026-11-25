// The online round trip (npm run test:senses; not part of npm test): the real engines download real models
// from huggingface.co, George says a known sentence through POST /api/speak, that WAV goes back to
// POST /api/hear, and the words must come back. Prints the timings.
//
//   npm run test:senses                         whisper tiny.en + Kokoro q8 (the smallest: ~136 MB)
//   JARVIS_SENSES_TEST_MODELS=full npm run test:senses   what the home base uses: base.en + Kokoro fp32 (~406 MB)
//   JARVIS_CORE_MODELS_DIR=/path                where the models go (default: <tmp>/jarvis-core-senses-test-models,
//                                               kept between runs so only the first one downloads)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../../server/runtime.mjs';
import { parseWav, encodeWav, resample, HEAR_RATE } from '../../server/senses/wav.mjs';
import { request, testConfig } from '../server/helpers.mjs';

const FULL = process.env.JARVIS_SENSES_TEST_MODELS === 'full';
const HEAR_MODEL = FULL ? 'base.en' : 'tiny.en';
const SPEAK_DTYPE = FULL ? 'fp32' : 'q8';
const MODELS = process.env.JARVIS_CORE_MODELS_DIR ? path.resolve(process.env.JARVIS_CORE_MODELS_DIR) : path.join(os.tmpdir(), 'jarvis-core-senses-test-models');
const SENTENCE = 'Good morning, Frank. The home base can hear you clearly today.';
const PROMPT = 'Frank, home base, Jarvis, weather';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const words = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

function post(port, p, body, type) {
  return new Promise((resolve, reject) => {
    import('node:http').then(({ default: http }) => {
      const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'content-type': type, 'content-length': body.length }, agent: false }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end(body);
    }, reject);
  });
}

/** Nice values of every thread of a process (Linux; field 19 of /proc/<pid>/task/<tid>/stat), or null. */
function threadNice(pid = 'self') {
  try {
    return fs.readdirSync(`/proc/${pid}/task`).map((tid) => {
      const stat = fs.readFileSync(`/proc/${pid}/task/${tid}/stat`, 'utf8');
      return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[16]);
    });
  } catch {
    return null;
  }
}

test(`George speaks, Whisper hears it back (whisper ${HEAR_MODEL}, Kokoro ${SPEAK_DTYPE}, real models from huggingface.co)`, { timeout: 30 * 60_000 }, async (t) => {
  fs.mkdirSync(MODELS, { recursive: true });
  const config = testConfig(['--fixture', 'ok', '--port', '0']);
  const logs = [];
  config.senses = { modelsDir: MODELS, speakDtype: SPEAK_DTYPE, startDelayMs: 0 };
  const rt = await createRuntime(config, { log: (m) => logs.push(m) });
  const { port } = await rt.start({ port: 0 });
  const timings = { container: `${os.cpus()[0]?.model ?? 'cpu'} x${os.availableParallelism?.() ?? os.cpus().length}`, hearModel: HEAR_MODEL, speakDtype: SPEAK_DTYPE };
  try {
    const before = (await request(port, '/api/senses')).json;
    assert.equal(before.deps.installed, true, 'run npm ci in core/ first');

    // 1. Turn both on: download (first run) + load + warm-up, in the background.
    const t0 = Date.now();
    const put = await request(port, '/api/senses', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hear: { enabled: true, model: HEAR_MODEL }, speak: { enabled: true } }) });
    assert.equal(put.status, 200);
    timings.alreadyDownloaded = { hear: put.json.hear.downloaded, speak: put.json.speak.downloaded };
    const progress = [];
    let ready = null;
    const readyAt = {};
    while (Date.now() - t0 < 25 * 60_000) {
      const s = (await request(port, '/api/senses')).json;
      for (const k of ['hear', 'speak']) if (s[k].state === 'ready' && s[k].loaded && !readyAt[k]) readyAt[k] = Date.now() - t0;
      progress.push(`${s.hear.state}:${s.hear.progress}/${s.speak.state}:${s.speak.progress}`);
      assert.notEqual(s.hear.state, 'error', s.hear.error);
      assert.notEqual(s.speak.state, 'error', s.speak.error);
      if (readyAt.hear && readyAt.speak) {
        ready = s;
        break;
      }
      await sleep(500);
    }
    assert.ok(ready, `both senses ready (last: ${progress.at(-1)})`);
    timings.readyMs = readyAt;
    timings.progressSamples = [...new Set(progress)].slice(0, 12);
    timings.loads = { hear: rt.senses.hosts.hear.status(), speak: rt.senses.hosts.speak.status() };
    for (const k of ['hear', 'speak']) timings.loads[k] = { loadMs: timings.loads[k].loadMs, warmMs: timings.loads[k].warmMs, nice: timings.loads[k].nice };

    // 2. George says the sentence.
    const s1 = await post(port, '/api/speak', Buffer.from(JSON.stringify({ text: SENTENCE, voice: 'bm_george', speed: 1 })), 'application/json');
    assert.equal(s1.status, 200, s1.body.toString().slice(0, 300));
    assert.equal(s1.headers['content-type'], 'audio/wav');
    const wav = parseWav(s1.body);
    assert.deepEqual([wav.format, wav.channels, wav.sampleRate, wav.bitsPerSample], [1, 1, 24000, 16]);
    const seconds = wav.samples.length / wav.sampleRate;
    assert.ok(seconds > 2 && seconds < 10, `${seconds} s of speech`);
    let peak = 0;
    for (const v of wav.samples) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak > 0.05, `audible (peak ${peak})`);
    timings.speak = { ms: Number(s1.headers['x-jarvis-ms']), audioSec: Math.round(seconds * 100) / 100, sentences: Number(s1.headers['x-jarvis-sentences']), rtf: Math.round((Number(s1.headers['x-jarvis-ms']) / 1000 / seconds) * 100) / 100 };
    if (process.platform === 'linux') {
      const core = threadNice();
      const hearThreads = threadNice(rt.senses.hosts.hear.status().pid);
      const speakThreads = threadNice(rt.senses.hosts.speak.status().pid);
      timings.threads = { core: core.length, coreAtNice0: core.filter((n) => n === 0).length, hearEngine: hearThreads, speakEngine: speakThreads };
      assert.ok(core.every((n) => n === 0), `the Core itself keeps its priority (${core})`);
      for (const list of [hearThreads, speakThreads]) {
        assert.ok(list && list.length >= 4, 'an engine process with its onnxruntime threads');
        assert.ok(list.every((n) => n === 10), `every engine thread at nice 10 (${list})`);
      }
    }

    // A second, longer request: two sentences in one WAV (split by sentence, one at a time).
    const s2 = await post(port, '/api/speak', Buffer.from(JSON.stringify({ text: 'It is forty one degrees outside. Shall I read the headlines?', voice: 'bm_george' })), 'application/json');
    assert.equal(s2.status, 200);
    assert.equal(s2.headers['x-jarvis-sentences'], '2');
    timings.speak2 = { ms: Number(s2.headers['x-jarvis-ms']), audioSec: Number(s2.headers['x-jarvis-seconds']) };

    // 3. Whisper hears it: 24 kHz → 16 kHz mono 16-bit, as the phone sends.
    const sixteen = encodeWav(resample(wav.samples, wav.sampleRate, HEAR_RATE), HEAR_RATE);
    const h1 = await post(port, '/api/hear', sixteen, 'audio/wav');
    assert.equal(h1.status, 200, h1.body.toString());
    const heard = JSON.parse(h1.body.toString());
    t.diagnostic(`heard: ${JSON.stringify(heard)}`);
    const want = words(SENTENCE);
    const got = new Set(words(heard.text));
    const hits = want.filter((w) => got.has(w));
    assert.ok(hits.length / want.length >= 0.8, `heard "${heard.text}" for "${SENTENCE}" (${hits.length}/${want.length} words)`);
    for (const key of ['morning', 'frank', 'home', 'base', 'hear', 'clearly', 'today']) assert.ok(got.has(key), `"${key}" in "${heard.text}"`);
    assert.equal(heard.model, HEAR_MODEL);
    timings.hear = { ms: heard.ms, audioSec: heard.seconds, text: heard.text, wordsMatched: `${hits.length}/${want.length}` };

    // With context words, as the app sends them.
    const h2 = await post(port, `/api/hear?prompt=${encodeURIComponent(PROMPT)}`, sixteen, 'audio/wav');
    assert.equal(h2.status, 200);
    const heard2 = JSON.parse(h2.body.toString());
    const got2 = new Set(words(heard2.text));
    assert.ok(want.filter((w) => got2.has(w)).length / want.length >= 0.8, `with a prompt: "${heard2.text}"`);
    assert.ok(!words(heard2.text).includes('weather'), 'the prompt is context, not part of the answer');
    timings.hearWithPrompt = { ms: heard2.ms, text: heard2.text };
  } finally {
    await rt.stop();
    const line = `SENSES_TIMINGS ${JSON.stringify(timings)}`;
    t.diagnostic(line);
    console.log(line);
    if (process.env.JARVIS_SENSES_TIMINGS_FILE) fs.appendFileSync(process.env.JARVIS_SENSES_TIMINGS_FILE, `${line}\n`);
    for (const l of logs.filter((x) => /hearing|voice/.test(x))) t.diagnostic(l);
  }
});
