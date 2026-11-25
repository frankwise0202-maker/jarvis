// The home base's senses (opt-in beta): hearing (Whisper) and George's voice (Kokoro) for the phone, on the
// Alienware's own CPU. Nothing leaves this computer except the one-time model downloads from huggingface.co.
//
//   const senses = createSenses({ dataDir, modelsDir, log });
//   senses.info()                          → GET /api/senses
//   await senses.put(body)                 → PUT /api/senses: turns downloads and warm-ups on or off
//   await senses.hear(wavBuffer, { prompt, signal })       → { text, ms, model, seconds }
//   await senses.speak({ text, voice, speed }, { signal })  → { wav: Buffer, ms, seconds, sentences }
//   senses.start(); await senses.stop();
//
// Both are off until the owner turns them on (Jarvis > Settings > Home base > Hearing and voice). Settings live
// in <dataDir>/senses/settings-v1.json, models in ~/.cache/jarvis-core/models. An unused model leaves memory
// after 30 minutes (hearing) or 6 hours (George: about 1 GB, kept so the phone's first sentence never waits for
// a load). Each warm-up that loads George times one sentence and records how fast he is here; when the default
// fp32 model is slower than 0.8 x real time, the 8-bit one is tried and kept if it is faster (senses/speed.mjs).
// The speech libraries
// (@huggingface/transformers, kokoro-js) are only ever imported inside the engines' own processes
// (senses/worker.mjs); without core/node_modules the Core runs as before and reports deps.installed false.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJsonFile, isObj } from '../brain/util.mjs';
import { createSenseHost, SenseError } from './host.mjs';
import { HEAR_MODELS, DEFAULT_HEAR_MODEL, SPEAK_MODELS, DEFAULT_SPEAK_DTYPE, VOICES, DEFAULT_VOICE, sizeMb, totalBytes, onDisk, strayFiles, defaultModelsDir } from './models.mjs';
import { readHearingWav, encodeWav } from './wav.mjs';
import { splitSentences, cleanPrompt, cleanSpeech, SPEAK_MAX } from './text.mjs';
import { RTF_SWITCH, BENCH_TEXT, BENCH_VOICE, rtfOf, processorId, pickDtype, shouldTryQ8, prefersQ8, normalizeSpeedRecord, withMeasurement } from './speed.mjs';

export { SenseError } from './host.mjs';
export { defaultModelsDir } from './models.mjs';

const DEPENDENCIES = ['@huggingface/transformers', 'kokoro-js', 'onnxruntime-node'];
/** How long an unused model stays in memory (config.json "senses" or JARVIS_CORE_*_IDLE_MINUTES change it). */
export const HEAR_IDLE_MS = 30 * 60_000;
export const SPEAK_IDLE_MS = 6 * 3600_000;
const BENCH_TIMEOUT_MS = 60_000;
const SILENCE_PEAK = 0.003; // about -50 dBFS: far below any voice the phone's microphone picks up
const MODEL_ALIASES = { fast: 'base.en', accurate: 'small.en' };

/** Whether the speech libraries can be found (resolved, not loaded: loading happens in the engine processes). */
export function checkDeps(resolve = (s) => import.meta.resolve(s)) {
  const missing = [];
  for (const name of DEPENDENCIES) {
    try {
      resolve(name);
    } catch {
      missing.push(name);
    }
  }
  return { installed: missing.length === 0, missing };
}

export function defaultSensesSettings() {
  return { v: 1, hear: { enabled: false, model: DEFAULT_HEAR_MODEL }, speak: { enabled: false, voice: DEFAULT_VOICE } };
}

function normalize(raw) {
  const s = defaultSensesSettings();
  if (!isObj(raw)) return s;
  if (isObj(raw.hear)) {
    if (typeof raw.hear.enabled === 'boolean') s.hear.enabled = raw.hear.enabled;
    if (HEAR_MODELS[raw.hear.model]) s.hear.model = raw.hear.model;
  }
  if (isObj(raw.speak)) {
    if (typeof raw.speak.enabled === 'boolean') s.speak.enabled = raw.speak.enabled;
    if (VOICES.includes(raw.speak.voice)) s.speak.voice = raw.speak.voice;
  }
  return s;
}

const bad = (code, message) => new SenseError(400, code, message);

/** Check a PUT /api/senses body: { hear?: { enabled?, model? }, speak?: { enabled?, voice? } }. Unknown keys are refused. */
export function validateSensesBody(body) {
  if (!isObj(body)) throw bad('bad_settings', 'send {"hear": {"enabled": true, "model": "base.en"}, "speak": {"enabled": true}}');
  const patch = {};
  for (const key of Object.keys(body)) if (key !== 'hear' && key !== 'speak') throw bad('bad_settings', `unknown setting: ${key} (hear, speak)`);
  if (body.hear !== undefined) {
    if (!isObj(body.hear)) throw bad('bad_settings', 'hear must be an object: {"enabled": true, "model": "base.en"}');
    patch.hear = {};
    for (const key of Object.keys(body.hear)) if (key !== 'enabled' && key !== 'model') throw bad('bad_settings', `unknown setting: hear.${key} (enabled, model)`);
    if (body.hear.enabled !== undefined) {
      if (typeof body.hear.enabled !== 'boolean') throw bad('bad_settings', 'hear.enabled must be true or false');
      patch.hear.enabled = body.hear.enabled;
    }
    if (body.hear.model !== undefined) {
      const m = MODEL_ALIASES[body.hear.model] ?? body.hear.model;
      if (!HEAR_MODELS[m]) throw bad('bad_model', `hear.model must be one of ${Object.keys(HEAR_MODELS).join(', ')} (or fast, accurate)`);
      patch.hear.model = m;
    }
  }
  if (body.speak !== undefined) {
    if (!isObj(body.speak)) throw bad('bad_settings', 'speak must be an object: {"enabled": true}');
    patch.speak = {};
    for (const key of Object.keys(body.speak)) if (key !== 'enabled' && key !== 'voice') throw bad('bad_settings', `unknown setting: speak.${key} (enabled, voice)`);
    if (body.speak.enabled !== undefined) {
      if (typeof body.speak.enabled !== 'boolean') throw bad('bad_settings', 'speak.enabled must be true or false');
      patch.speak.enabled = body.speak.enabled;
    }
    if (body.speak.voice !== undefined) {
      if (!VOICES.includes(body.speak.voice)) throw bad('bad_voice', `speak.voice must be one of Kokoro's voices, e.g. ${DEFAULT_VOICE}`);
      patch.speak.voice = body.speak.voice;
    }
  }
  return patch;
}

/** The engine threads: at most 4 (the i7-6700's physical cores), never all of a smaller machine's. */
function defaultThreads() {
  const n = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(4, n >= 8 ? 4 : n));
}

export function createSenses({
  dataDir = null,
  modelsDir = defaultModelsDir(),
  log = () => {},
  speakDtype, // 'fp32' or 'q8' fixes George's model; undefined (the default): fp32, or q8 where it measured faster
  autoDtype = !SPEAK_MODELS[speakDtype],
  engineUrl, // tests: a stub engine module
  engineOptions = {},
  nice = 10,
  threads = defaultThreads(),
  idleMs, // tests: one idle time for both senses
  hearIdleMs = idleMs ?? HEAR_IDLE_MS,
  speakIdleMs = idleMs ?? SPEAK_IDLE_MS,
  startDelayMs = 20_000,
  hearTimeoutMs = 45_000,
  speakTimeoutMs = (chars) => 30_000 + 150 * chars,
  queueMax = 3,
  speedCheck = true, // time George at each warm-up that loads him (and try q8 when fp32 is slow)
  rtfSwitch = RTF_SWITCH,
  quietMs = 1000, // the speed check waits until the voice engine has had nothing to do for this long …
  trialQuietMs = 30_000, // … and the q8 trial (a second engine loading beside George) until the phone has been quiet
  cpu = processorId(),
  depsCheck = () => checkDeps(),
  fsApi = fs,
} = {}) {
  const sensesDir = dataDir ? path.join(dataDir, 'senses') : null;
  const settingsFile = createJsonFile({ dir: sensesDir, name: 'settings-v1.json', log });
  let settings = normalize(settingsFile.load());
  // How fast George is here, per model, and the model picked for this processor (senses/speed.mjs).
  const speedFile = createJsonFile({ dir: sensesDir, name: 'speed-v1.json', log });
  let speedRecord = normalizeSpeedRecord(speedFile.load());
  const configuredDtype = SPEAK_MODELS[speakDtype] ? speakDtype : DEFAULT_SPEAK_DTYPE;
  let speakModel = SPEAK_MODELS[pickDtype({ configured: configuredDtype, auto: autoDtype, record: speedRecord, cpu })];
  // The speed check after a warm-up: running (from the warm-up until it ends, quiet spells included), active (timing
  // George or loading the 8-bit model right now: GET /api/senses speak.measuring), the q8 engine it tries.
  const check = { running: false, active: 0, trial: null, next: null };
  const sense = {
    hear: { error: null, firstDownload: false, lastMs: null, gen: 0 },
    speak: { error: null, firstDownload: false, lastMs: null, gen: 0 },
  };
  let deps = depsCheck();
  let depsCheckedAt = Date.now();
  let startTimer = null;
  let stopped = false;

  const modelFor = (name) => (name === 'hear' ? HEAR_MODELS[settings.hear.model] : speakModel);

  const common = { cacheDir: modelsDir, engineUrl, engineOptions, nice, threads, queueMax, log };
  const hosts = {
    hear: createSenseHost({ ...common, idleMs: hearIdleMs, kind: 'hear', getModel: () => modelFor('hear') }),
    speak: createSenseHost({ ...common, idleMs: speakIdleMs, kind: 'speak', getModel: () => modelFor('speak') }),
  };

  function currentDeps() {
    if (Date.now() - depsCheckedAt > 60_000) {
      deps = depsCheck();
      depsCheckedAt = Date.now();
    }
    return deps;
  }

  const DEPS_MESSAGE = 'the speech libraries are not installed on the home base yet; run: jarvis-core update';

  function stateOf(name) {
    const s = settings[name];
    const model = modelFor(name);
    const disk = onDisk(fsApi, modelsDir, model);
    const st = hosts[name].status();
    const total = totalBytes(model);
    let state;
    let error = null;
    let errorCode = null;
    if (!s.enabled) state = 'off';
    else if (!currentDeps().installed) {
      state = 'error';
      error = DEPS_MESSAGE;
      errorCode = 'deps_missing';
    } else if (sense[name].error) {
      state = 'error';
      error = sense[name].error.message;
      errorCode = sense[name].error.code;
    } else if (!disk.complete || (st.loading && sense[name].firstDownload)) state = 'downloading';
    else state = 'ready';
    let progress;
    if (state === 'ready') progress = 1;
    else if (state === 'downloading' && st.loading && st.progress.total) progress = Math.min(disk.complete ? 1 : 0.99, st.progress.loaded / st.progress.total);
    else progress = total ? disk.bytes / total : 0;
    const out = {
      enabled: s.enabled,
      ...(name === 'hear' ? { model: s.model } : { voice: s.voice }),
      state,
      progress: Math.round(progress * 100) / 100,
      sizeMb: sizeMb(model),
      error,
      errorCode,
      downloaded: disk.complete,
      loaded: st.loaded,
      busy: st.busy,
      queued: st.queued,
      lastMs: sense[name].lastMs,
      idleMinutes: Math.round((st.idleMs / 60_000) * 100) / 100, // unused this long, the model leaves memory (0: never)
    };
    if (name === 'speak') {
      const mine = speedRecord && speedRecord.cpu === cpu ? speedRecord.measured : {};
      out.dtype = model.dtype;
      out.rtf = mine[model.dtype]?.rtf ?? null; // seconds of work per second of George, measured on this computer
      out.measured = Object.fromEntries(Object.entries(mine).map(([d, m]) => [d, m.rtf]));
      out.measuring = check.active > 0;
      out.autoDtype = autoDtype;
    }
    return out;
  }

  function info() {
    const d = currentDeps();
    return { hear: stateOf('hear'), speak: stateOf('speak'), deps: { installed: d.installed, ...(d.missing.length ? { missing: d.missing } : {}) } };
  }

  /** Remove a model's files that are on disk at the wrong size (a download cut short): fetched again, never loaded. */
  function clearStray(model) {
    for (const f of strayFiles(fsApi, modelsDir, model)) {
      try {
        fsApi.rmSync(f, { force: true });
      } catch {
        // the load reports it
      }
    }
  }

  /** Download (when needed), load and warm up one sense in the background. */
  function warm(name) {
    if (stopped || !settings[name].enabled) return;
    if (!currentDeps().installed) return;
    const model = modelFor(name);
    sense[name].error = null;
    clearStray(model);
    const complete = onDisk(fsApi, modelsDir, model).complete;
    const gen = ++sense[name].gen; // a later warm-up (another model, off and on) owns the state from then on
    sense[name].firstDownload = !complete;
    if (!complete) log(`${name === 'hear' ? 'hearing' : 'voice'}: downloading ${model.repo} (${model.dtype}, about ${sizeMb(model)} MB) into ${modelsDir}`);
    const started = Date.now();
    hosts[name].load().then(
      (r) => {
        if (gen !== sense[name].gen) return;
        sense[name].firstDownload = false;
        log(`${name === 'hear' ? 'hearing' : 'voice'}: ready (${model.repo} ${model.dtype}; ${Date.now() - started} ms, load ${r?.ms ?? 0} ms, warm-up ${r?.warmMs ?? 0} ms)`);
        if (name === 'speak' && (r?.ms || r?.warmMs)) checkSpeed(gen); // a fresh engine: time George here
      },
      (err) => {
        if (gen !== sense[name].gen) return;
        sense[name].firstDownload = false;
        if (!settings[name].enabled || err?.code === 'engine_stopped' || err?.code === 'stopped') return; // turned off or changed meanwhile
        const offline = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network/i.test(String(err?.message ?? ''));
        sense[name].error = offline
          ? { code: 'download_failed', message: 'could not download the model (is the home base online?); turn it off and on again to retry' }
          : { code: err?.code === 'load_timeout' ? 'load_timeout' : 'load_failed', message: `the model could not be loaded: ${String(err?.message ?? err).slice(0, 200)}` };
        log(`${name === 'hear' ? 'hearing' : 'voice'}: ${sense[name].error.message}`);
      },
    );
  }

  /** A request is coming (the app's warm-up): load a model the idle timer let go, or restart its idle time. */
  function keepWarm(name) {
    const st = hosts[name].status();
    if (st.loaded) hosts[name].touch();
    else if (!st.loading) warm(name);
  }

  function reconcile(name, changed) {
    if (!settings[name].enabled) {
      sense[name].gen += 1;
      if (name === 'speak') stopTrial();
      hosts[name].unload('turned off');
      sense[name].error = null;
      sense[name].firstDownload = false;
      return;
    }
    const st = hosts[name].status();
    if (changed || sense[name].error || (!st.loaded && !st.loading)) warm(name);
    else if (st.loaded) hosts[name].touch(); // already warm (the app warming up): its idle time starts again
  }

  // ── How fast George is here (senses/speed.mjs) ──────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.());

  const idle = (host) => {
    const st = host.status();
    return !st.busy && !st.queued && !st.loading;
  };

  /**
   * Resolve true once every engine in `getHosts()` has had nothing to do (no request running, waiting or
   * loading) for `quiet` ms, so a measurement never makes the phone wait and nothing else skews it; false
   * when it went stale or took too long.
   */
  async function whenIdle(getHosts, stale, quiet = quietMs, maxWaitMs = 10 * 60_000) {
    const t0 = Date.now();
    let idleSince = null;
    for (;;) {
      if (stale()) return false;
      if (getHosts().every(idle)) {
        idleSince ??= Date.now();
        if (Date.now() - idleSince >= quiet) return true;
      } else idleSince = null;
      if (Date.now() - t0 > maxWaitMs) return false;
      await sleep(Math.max(10, Math.min(200, quiet || 10)));
    }
  }

  /** Time the fixed sentence once on a loaded engine: its real-time factor, or null when it could not run. */
  async function timeOnce(host, stale) {
    if (!(await whenIdle(() => [hosts.hear, hosts.speak, host], stale)) || !host.status().loaded) return null;
    check.active += 1;
    try {
      const r = await host.run({ sentences: [BENCH_TEXT], voice: BENCH_VOICE, speed: 1 }, { timeoutMs: BENCH_TIMEOUT_MS });
      return rtfOf({ ms: r.ms, samples: r.output?.audio?.length, sampleRate: r.output?.sampleRate });
    } finally {
      check.active -= 1;
    }
  }

  /** Twice when the first one is slow (another program may have been busy for a moment): the faster counts. */
  async function timeEngine(host, stale) {
    const first = await timeOnce(host, stale);
    if (first === null || first <= rtfSwitch || stale()) return first;
    const second = await timeOnce(host, stale);
    return second === null ? first : Math.min(first, second);
  }

  function record(dtype, rtf) {
    speedRecord = withMeasurement(speedRecord, cpu, dtype, rtf);
    speedFile.save(speedRecord);
  }

  /** The model picked for this processor: loaded straight away after a restart. */
  function decide(dtype) {
    speedRecord = { ...(speedRecord?.cpu === cpu ? structuredClone(speedRecord) : { v: 1, cpu, measured: {} }), dtype };
    speedFile.save(speedRecord);
  }

  function stopTrial() {
    const t = check.trial;
    check.trial = null;
    if (t) t.stop().catch(() => {});
  }

  /** After a warm-up that loaded George: time him, and when fp32 is slow here, see whether q8 is faster. */
  async function checkSpeed(gen) {
    if (!speedCheck) return;
    if (check.running) {
      check.next = gen; // a newer warm-up while an older check winds down: it runs next
      return;
    }
    const stale = () => stopped || gen !== sense.speak.gen || !settings.speak.enabled;
    check.running = true;
    check.next = null;
    try {
      const dtype = speakModel.dtype;
      const rtf = await timeEngine(hosts.speak, stale);
      if (rtf === null || stale()) return;
      record(dtype, rtf);
      log(`voice: George speaks at ${rtf}x real time on this computer (${dtype}; under 1 is faster than he talks)`);
      if (!shouldTryQ8({ auto: autoDtype, dtype, rtf, record: speedRecord, cpu, threshold: rtfSwitch })) return;
      await tryQ8(rtf, stale);
    } catch (err) {
      if (!stale()) log(`voice: timing George failed: ${String(err?.message ?? err).slice(0, 200)}`);
    } finally {
      stopTrial();
      check.running = false;
      const next = check.next;
      check.next = null;
      if (next !== null && next === sense.speak.gen && !stopped) checkSpeed(next);
    }
  }

  /** fp32 is slower than rtfSwitch here: load the 8-bit model beside it (downloading it once), time it, keep the faster. */
  async function tryQ8(fp32Rtf, stale) {
    const q8 = SPEAK_MODELS.q8;
    // Loading a second engine takes the processor for a few seconds: not while the phone is talking to George.
    if (!(await whenIdle(() => [hosts.hear, hosts.speak], stale, trialQuietMs, 6 * 3600_000))) return;
    clearStray(q8);
    const download = !onDisk(fsApi, modelsDir, q8).complete;
    log(`voice: slower than ${rtfSwitch}x real time with fp32; trying Kokoro's 8-bit model${download ? ` (downloading ${q8.repo} q8, about ${sizeMb(q8)} MB)` : ''}`);
    const trial = createSenseHost({ ...common, idleMs: speakIdleMs, kind: 'speak', getModel: () => q8 });
    check.trial = trial;
    check.active += 1;
    try {
      await trial.load();
    } catch (err) {
      if (!stale()) log(`voice: the 8-bit model could not be loaded (${String(err?.message ?? err).slice(0, 200)}); keeping fp32`);
      return;
    } finally {
      check.active -= 1;
    }
    if (stale() || check.trial !== trial) return;
    const q8Rtf = await timeEngine(trial, stale);
    if (q8Rtf === null || stale()) return;
    record('q8', q8Rtf);
    if (!prefersQ8(fp32Rtf, q8Rtf)) {
      decide('fp32');
      log(`voice: keeping fp32: the 8-bit model is not faster on this computer (${q8Rtf}x against ${fp32Rtf}x real time)`);
      return;
    }
    // Hand George over once the fp32 engine is idle (a sentence in progress finishes first). From the check on,
    // nothing runs in between: a request that comes later goes to the 8-bit engine.
    do {
      if (!(await whenIdle(() => [hosts.speak], stale, 0))) return;
    } while (!idle(hosts.speak));
    const old = hosts.speak;
    hosts.speak = trial;
    check.trial = null;
    speakModel = q8;
    decide('q8');
    old.stop().catch(() => {});
    log(`voice: switched to Kokoro's 8-bit model (q8): ${q8Rtf}x real time against ${fp32Rtf}x for fp32; it stays George's model on this computer`);
  }

  async function put(body) {
    const patch = validateSensesBody(body);
    const before = structuredClone(settings);
    if (patch.hear) Object.assign(settings.hear, patch.hear);
    if (patch.speak) Object.assign(settings.speak, patch.speak);
    await settingsFile.save(settings);
    if (patch.hear) reconcile('hear', before.hear.model !== settings.hear.model);
    if (patch.speak) reconcile('speak', false);
    return info();
  }

  function ensureUsable(name) {
    const st = stateOf(name);
    const label = name === 'hear' ? 'Hearing through the home base' : "George's voice from the home base";
    if (!st.enabled) throw new SenseError(409, `${name}_off`, `${label} is off; turn it on in Jarvis > Settings > Home base`);
    if (st.errorCode === 'deps_missing') throw new SenseError(503, 'deps_missing', DEPS_MESSAGE);
    if (st.state === 'error') throw new SenseError(503, `${name}_unavailable`, st.error);
    if (st.state === 'downloading') throw new SenseError(503, 'not_ready', `the model is still downloading (${Math.round(st.progress * 100)} %)`, { 'Retry-After': '10' });
  }

  async function hear(buf, { prompt = '', signal } = {}) {
    ensureUsable('hear');
    const wav = readHearingWav(buf, { maxSec: 30 });
    if (!wav.ok) throw new SenseError(400, wav.code, wav.message);
    const started = Date.now();
    // Silence (below -50 dBFS throughout): nothing to hear. Whisper would make up "Thank you." or "you".
    let peak = 0;
    for (let i = 0; i < wav.audio.length; i++) peak = Math.max(peak, Math.abs(wav.audio[i]));
    if (peak < SILENCE_PEAK) {
      // Nothing to hear. But a short silence is also how the app warms hearing up when Voice Mode opens: have
      // Whisper loaded (the idle timer lets it go) and its idle time restarted, so the words that follow
      // meet a warm engine.
      keepWarm('hear');
      return { text: '', ms: Date.now() - started, model: settings.hear.model, seconds: Math.round(wav.seconds * 100) / 100 };
    }
    const r = await hosts.hear.run({ audio: wav.audio, prompt: cleanPrompt(prompt) }, { timeoutMs: hearTimeoutMs, signal });
    const ms = Date.now() - started;
    sense.hear.lastMs = ms;
    return { text: typeof r.output?.text === 'string' ? r.output.text.trim() : '', ms, model: settings.hear.model, seconds: Math.round(wav.seconds * 100) / 100 };
  }

  /** Validate a POST /api/speak body; returns { text, voice, speed, sentences }. */
  function speechRequest(body) {
    if (!isObj(body)) throw bad('bad_text', 'send {"text": "…", "voice": "bm_george", "speed": 1}');
    for (const key of Object.keys(body)) if (!['text', 'voice', 'speed'].includes(key)) throw bad('bad_request', `unknown field: ${key} (text, voice, speed)`);
    if (typeof body.text !== 'string') throw bad('bad_text', 'text must be a string');
    const text = cleanSpeech(body.text);
    if (!text) throw bad('bad_text', 'the text is empty');
    if (text.length > SPEAK_MAX) throw bad('text_too_long', `the text can be up to ${SPEAK_MAX} characters (split it by sentence)`);
    const voice = body.voice === undefined ? settings.speak.voice : body.voice;
    if (!VOICES.includes(voice)) throw bad('bad_voice', `voice must be one of Kokoro's voices, e.g. ${DEFAULT_VOICE}`);
    const speed = body.speed === undefined ? 1 : body.speed;
    if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.5 || speed > 2) throw bad('bad_speed', 'speed must be a number from 0.5 to 2');
    const sentences = splitSentences(text);
    if (!sentences.length) throw bad('bad_text', 'the text has nothing to say');
    return { text, voice, speed, sentences };
  }

  async function speak(body, { signal } = {}) {
    const req = speechRequest(body);
    ensureUsable('speak');
    const started = Date.now();
    const before = hosts.speak.status();
    const r = await hosts.speak.run({ sentences: req.sentences, voice: req.voice, speed: req.speed }, { timeoutMs: speakTimeoutMs(req.text.length), signal });
    // This request loaded George (the app's warm-up after the idle unload, say): time him too, as a warm-up does.
    if (!before.loaded && !before.loading && hosts.speak.status().loaded) checkSpeed(sense.speak.gen);
    const audio = r.output?.audio;
    const rate = r.output?.sampleRate ?? 24000;
    if (!(audio instanceof Float32Array) || !audio.length) throw new SenseError(500, 'engine_failed', 'the voice engine returned no audio');
    const wav = encodeWav(audio, rate);
    const ms = Date.now() - started;
    sense.speak.lastMs = ms;
    return { wav, ms, seconds: Math.round((audio.length / rate) * 100) / 100, sentences: req.sentences.length, sampleRate: rate };
  }

  return {
    info,
    put,
    hear,
    speak,
    speechRequest,
    hosts,
    get settings() {
      return structuredClone(settings);
    },
    /** Resume what is turned on (a download cut short, the warm-up) a little after the Core starts. */
    start() {
      if (startTimer || stopped) return;
      startTimer = setTimeout(() => {
        for (const name of ['hear', 'speak']) if (settings[name].enabled) warm(name);
      }, startDelayMs);
      startTimer.unref?.();
    },
    /** How fast George is on this computer: { cpu, dtype?, measured: { fp32?: {rtf, at}, q8?: {rtf, at} } } or null. */
    get speed() {
      return speedRecord ? structuredClone(speedRecord) : null;
    },
    async stop() {
      stopped = true;
      if (startTimer) clearTimeout(startTimer);
      const trial = check.trial;
      check.trial = null;
      await Promise.all([hosts.hear.stop(), hosts.speak.stop(), trial?.stop()]);
      await Promise.all([settingsFile.flush(), speedFile.flush()]);
    },
  };
}
