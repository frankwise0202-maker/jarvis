// A fake Jarvis Core (the home base, v7.5) for the E2E suite (scenarios with `fakeCore: true`): the
// Core's API at https://alienware.tail4e5f6a.ts.net/ answered through context.route() with the
// real-format JSON captured from the Core's own fixture server (test/unit/fixtures/homebase/; the
// handoff's §3 status, §7 ask, §8 info), so nothing reaches the network and that origin is not a
// third-party request for the guard. Like the real Core it echoes an allowed Origin (the app's) in
// Access-Control-Allow-Origin.
//
// t.core (the newest context's): { mode, delayMs, requests: ['GET /api/status', …], asks: [q, …] }.
// Set t.core.mode to change what it answers next (t.core.delayMs: how long each answer takes):
//   'ok' | 'warn' | 'alert' | 'nogpu' | 'offline'   that scenario's status, info and answers
//   'unreachable'                                    no answer at all (Tailscale off on this device)
//   'down'                                           Tailscale serve's 502 while the Core is stopped or
//                                                    restarting: no CORS headers, so the page can't read it
//   'refused'                                        403 forbidden (the Core refuses a request without a
//                                                    Tailscale identity; readable: its access refusals carry
//                                                    CORS headers for the app, so the tile can say why)
//   'starting'                                       503 starting
//
// The brain (v7.6, Jarvis Core 1.1, SPEC §24): t.core.brain is the fake's state (see fakeBrain()):
// the key it was handed (t.core.brain.keys), the limits, the briefing settings, jobs, watchers, push
// subscriptions and spend. routeFakeCore(context, { brain: false }) is a 1.0 Core (404 not_found on
// every brain route); { brain: { key: true, briefing: true, capReached: 'daily', jobSteps: 2 } } seeds
// it. Jobs move on as the app polls: queued -> running at the first list, done after `jobSteps` more.
//
// Sync (v7.6, SPEC §24.7): api/sync like the Core's sync module (PUT a device's backup, gzip allowed;
// GET the list; GET a device's backup), kept in a store shared by every context of a scenario
// (`sync`, see fakeSyncStore(); the harness passes one per scenario as t.coreSync), so two browser
// contexts are two devices on one home base. A 1.0 Core ({ brain: false }) answers 404 there too.
// t.coreSync.mode: 'ok' | 'toolarge' (413 to every upload, as the Core says past 50 MB).
//
// Hearing and voice (v7.7, beta, SPEC §25): t.core.senses is the fake's api/senses, api/hear and
// api/speak (see fakeSenses()). routeFakeCore(context, { senses: false }) is a Core without them (404
// not_found); { senses: { hear: 'ready', speak: 'ready', hearText, hearDelayMs, speakDelayMs } } seeds
// it. api/hear answers a canned transcript (`hearText`, or `hearQueue` in order); api/speak a small
// 24 kHz WAV. hearMode / speakMode 'unreachable' drop those requests (as if Tailscale were off),
// 'error' answers 500. A part turned on with PUT downloads over `downloadSteps` reads of api/senses.

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'unit', 'fixtures', 'homebase');
export const CORE_HOST = 'alienware.tail4e5f6a.ts.net';
export const CORE_URL = `https://${CORE_HOST}/`;
export const CORE_ORIGIN = `https://${CORE_HOST}`;
export const CORE_SCENARIOS = ['ok', 'warn', 'alert', 'nogpu', 'offline'];

const read = (name) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
let cache = null;
/** The captured answers: { status: { ok: {...}, … }, info, ask: { ok: { 'How are you?': {...} } } }. */
export function coreFixtures() {
  if (!cache) {
    const status = {};
    for (const s of CORE_SCENARIOS) status[s] = read(`status-${s}.json`);
    cache = { status, info: read('info.json'), ask: read('ask.json') };
  }
  return cache;
}

/** The captured question closest to `q` (the Core's own intents, roughly). */
export function fixtureQuestion(q) {
  const s = String(q || '').toLowerCase();
  if (/status|report|summary/.test(s)) return 'home base status';
  if (/wrong|problem|warning|issue/.test(s)) return 'Anything wrong?';
  if (/gpu|graphics|nvidia|vram/.test(s)) return 'GPU temp?';
  if (/how (?:are|r) (?:you|u)|you good|how'?s the home ?base|how is the home ?base|home ?base/.test(s)) return 'How are you?';
  return 'what is the weather';
}

const BRAIN_FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'unit', 'fixtures', 'brain');
/** The captured-format briefing (test/unit/fixtures/brain/briefing.json), dated now. */
export function fakeBriefing(now = Date.now()) {
  const b = JSON.parse(readFileSync(path.join(BRAIN_FIXTURES, 'briefing.json'), 'utf8'));
  const d = new Date(now);
  b.generatedAt = d.toISOString();
  b.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return b;
}
// A real P-256 public key's shape (65 bytes, base64url): what the Core's VAPID key looks like.
export const FAKE_VAPID_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
export const FAKE_RESULT_MARKDOWN = [
  '## The short answer',
  '',
  'The **Breville Bambino Plus** is the best value under $500; the *Gaggia Classic Pro* suits tinkerers.',
  '',
  '- Heats in 3 seconds',
  '- Automatic milk frothing',
  '',
  '<img src=x onerror="window.__pwned=1"> <script>window.__pwned=2</script> [a trap](javascript:window.__pwned=3)',
  '',
  'Read more at [the review](https://review.example.com/espresso).',
].join('\n');

/** The brain's fake state (Jarvis Core 1.1). */
export function fakeBrain(seed = {}) {
  const now = Date.now();
  const b = {
    enabled: seed !== false,
    keys: [], // every key POST api/brain/key received (the test checks it is this device's key)
    key: seed && seed.key ? { hint: '…mnop', setAt: new Date(now - 86400000).toISOString(), verified: true } : null,
    limits: { dailyUsd: 5, monthlyUsd: 50 },
    spend: { todayUsd: seed && seed.capReached ? 5 : 0.42, monthUsd: 3.1, capReached: (seed && seed.capReached) || null },
    briefingSettings: { enabled: true, time: '07:00', units: 'F', location: null },
    briefing: seed && seed.briefing ? fakeBriefing(now - 5 * 60 * 1000) : null,
    owner: { name: 'Tony' },
    jobs: [],
    watchers: [],
    subs: [],
    pushTests: 0,
    settingsPuts: [],
    jobSteps: (seed && seed.jobSteps) || 2,
    seq: 0,
  };
  if (seed && seed.jobs) {
    for (const j of seed.jobs) b.jobs.push({ ...fakeJob(b, j.prompt || 'Best espresso machines under $500', j.depth || 'quick'), ...j });
  }
  return b;
}

function fakeJob(b, prompt, depth) {
  const id = `j_${(++b.seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { id, kind: 'research', title: prompt.slice(0, 80), prompt, depth, status: 'queued', createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, costUsd: 0, summary: '', error: null, polls: 0, result: null };
}

function brainObject(b) {
  const last = b.briefing ? b.briefing.generatedAt : null;
  return {
    version: '1.1.0',
    key: b.key ? { set: true, hint: b.key.hint, setAt: b.key.setAt, verified: b.key.verified } : { set: false, hint: null, setAt: null, verified: null },
    sdk: { installed: true },
    limits: { ...b.limits },
    spend: { day: new Date().toISOString().slice(0, 10), todayUsd: b.spend.todayUsd, month: new Date().toISOString().slice(0, 7), monthUsd: b.spend.monthUsd, capReached: b.spend.capReached },
    push: { vapidPublicKey: FAKE_VAPID_KEY, devices: b.subs.map((x) => ({ id: x.id, label: x.label, addedAt: x.addedAt })) },
    briefing: { ...b.briefingSettings, lastAt: last, nextAt: new Date(Date.now() + 20 * 3600000).toISOString() },
    jobs: { running: b.jobs.filter((j) => j.status === 'running').length, queued: b.jobs.filter((j) => j.status === 'queued').length },
    watchers: { active: b.watchers.filter((w) => w.status === 'watching').length },
    owner: { ...b.owner },
  };
}

const publicJob = (j, withResult) => {
  const { polls, result, ...rest } = j;
  return withResult ? { ...rest, result } : rest;
};

/** One poll of the job list: jobs move on (queued -> running -> done with a result). */
function advanceJobs(b) {
  for (const j of b.jobs) {
    if (j.status === 'queued') {
      j.status = 'running';
      j.startedAt = new Date().toISOString();
    } else if (j.status === 'running' && ++j.polls >= b.jobSteps) {
      j.status = 'done';
      j.finishedAt = new Date().toISOString();
      j.costUsd = j.depth === 'deep' ? 0.84 : 0.12;
      j.summary = 'The Breville Bambino Plus is the best value; the Gaggia Classic Pro suits tinkerers.';
      j.result = { markdown: FAKE_RESULT_MARKDOWN, sources: [{ title: 'Espresso review', url: 'https://review.example.com/espresso' }, { title: 'A trap', url: 'javascript:alert(1)' }, { title: 'Coffee forum', url: 'https://forum.example.org/t/1' }] };
      b.spend.todayUsd = Math.round((b.spend.todayUsd + j.costUsd) * 100) / 100;
    }
  }
}

/** The brain's routes (api/brain, jobs, watchers, briefing, spend, push). Answers, or null (not one of them). */
function brainRoute(b, req, url, json) {
  const p = url.pathname;
  const m = req.method();
  const isBrainPath = /^\/api\/(?:brain|jobs|watchers|briefing|spend|push)(?:\/|$)/.test(p);
  if (!isBrainPath) return null;
  if (!b.enabled) return json(404, { error: 'not_found', message: `no such endpoint: ${p}` });
  let body = {};
  if (m === 'POST' || m === 'PUT' || m === 'DELETE') {
    try {
      body = JSON.parse(req.postData() || '{}') || {};
    } catch {
      return json(400, { error: 'bad_json', message: 'the body is not valid JSON' });
    }
  }
  const needKey = () => (b.key ? null : json(409, { error: 'no_key', message: 'no Claude key on the home base' }));
  const overCap = () => (b.spend.capReached ? json(402, { error: 'spend_cap', message: `the ${b.spend.capReached} limit is reached` }) : null);
  if (p === '/api/brain' && m === 'GET') return json(200, brainObject(b));
  if (p === '/api/brain/settings' && m === 'PUT') {
    b.settingsPuts.push(body);
    if (body.limits) {
      const d = Number(body.limits.dailyUsd ?? b.limits.dailyUsd);
      const mo = Number(body.limits.monthlyUsd ?? b.limits.monthlyUsd);
      if (!(d >= 0 && d <= 50) || !(mo >= 0 && mo <= 500)) return json(400, { error: 'bad_limits', message: 'dailyUsd 0-50, monthlyUsd 0-500' });
      b.limits = { dailyUsd: d, monthlyUsd: mo };
      b.spend.capReached = b.spend.todayUsd >= d ? 'daily' : null;
    }
    if (body.briefing) {
      const br = body.briefing;
      if (typeof br.enabled === 'boolean') b.briefingSettings.enabled = br.enabled;
      if (typeof br.time === 'string') b.briefingSettings.time = br.time;
      if (br.units === 'F' || br.units === 'C') b.briefingSettings.units = br.units;
      if (br.location === null) b.briefingSettings.location = null;
      else if (br.location && typeof br.location.city === 'string') {
        if (/nowhere/i.test(br.location.city)) return json(400, { error: 'city_not_found', message: `I couldn't find a place called "${br.location.city}". Try "City, State" or use this iPhone's location.` });
        b.briefingSettings.location = { label: br.location.city, lat: 39.8, lon: -89.64 };
      } else if (br.location) b.briefingSettings.location = { label: br.location.label || 'Your location', lat: Math.round(br.location.lat * 100) / 100, lon: Math.round(br.location.lon * 100) / 100 };
    }
    return json(200, brainObject(b));
  }
  if (p === '/api/brain/key' && m === 'POST') {
    b.keys.push(body.key);
    if (typeof body.key !== 'string' || !body.key.startsWith('sk-ant-')) return json(400, { error: 'bad_key', message: 'Anthropic did not accept the key' });
    b.key = { hint: `…${body.key.slice(-4)}`, setAt: new Date().toISOString(), verified: true };
    return json(200, { ok: true, hint: b.key.hint, verified: true });
  }
  if (p === '/api/brain/key' && m === 'DELETE') {
    b.key = null;
    return { status: 204 };
  }
  if (p === '/api/jobs' && m === 'POST') {
    const stop = needKey() || overCap();
    if (stop) return stop;
    const job = fakeJob(b, String(body.prompt || '').slice(0, 2000), body.depth === 'deep' ? 'deep' : 'quick');
    b.jobs.unshift(job);
    return json(202, { job: publicJob(job, false) });
  }
  if (p === '/api/jobs' && m === 'GET') {
    advanceJobs(b);
    return json(200, { jobs: b.jobs.map((j) => publicJob(j, false)) });
  }
  const jm = /^\/api\/jobs\/([^/]+)$/.exec(p);
  if (jm) {
    const job = b.jobs.find((j) => j.id === decodeURIComponent(jm[1]));
    if (!job) return json(404, { error: 'not_found', message: 'no such job' });
    if (m === 'GET') return json(200, { job: publicJob(job, true) });
    if (m === 'DELETE') {
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'cancelled';
        job.finishedAt = new Date().toISOString();
        return json(200, { job: publicJob(job, false) });
      }
      b.jobs = b.jobs.filter((j) => j !== job);
      return { status: 204 };
    }
  }
  if (p === '/api/watchers' && m === 'POST') {
    const stop = needKey() || overCap();
    if (stop) return stop;
    const w = { id: `w_${(++b.seq).toString(36)}`, what: String(body.what || '').slice(0, 300), every: ['6h', '12h', '24h'].includes(body.every) ? body.every : '24h', status: 'watching', createdAt: new Date().toISOString(), lastCheckAt: null, nextCheckAt: new Date(Date.now() + 6 * 3600000).toISOString(), lastResult: null, costUsd: 0, pending: false };
    b.watchers.unshift(w);
    const { pending, ...out } = w;
    return json(201, { watcher: out });
  }
  if (p === '/api/watchers' && m === 'GET') {
    for (const w of b.watchers) {
      if (!w.pending) continue;
      w.pending = false;
      w.lastCheckAt = new Date().toISOString();
      w.lastResult = { met: false, summary: 'Still $329 at the usual stores.', sources: [{ title: 'Price tracker', url: 'https://prices.example.com/lg-27gp850' }] };
      w.costUsd = Math.round((w.costUsd + 0.02) * 100) / 100;
    }
    return json(200, { watchers: b.watchers.map(({ pending, ...w }) => w) });
  }
  const wm = /^\/api\/watchers\/([^/]+?)(\/check)?$/.exec(p);
  if (wm) {
    const w = b.watchers.find((x) => x.id === decodeURIComponent(wm[1]));
    if (!w) return json(404, { error: 'not_found', message: 'no such watcher' });
    if (wm[2] && m === 'POST') {
      const stop = needKey() || overCap();
      if (stop) return stop;
      w.pending = true;
      const { pending, ...out } = w;
      return json(202, { watcher: out });
    }
    if (!wm[2] && m === 'DELETE') {
      b.watchers = b.watchers.filter((x) => x !== w);
      return { status: 204 };
    }
  }
  if (p === '/api/briefing' && m === 'GET') return b.briefing ? json(200, b.briefing) : json(404, { error: 'none_yet', message: 'no briefing yet' });
  if (p === '/api/briefing/run' && m === 'POST') {
    b.briefing = fakeBriefing(Date.now());
    return json(200, b.briefing);
  }
  if (p === '/api/spend' && m === 'GET') {
    const today = new Date();
    const day = (n) => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
    return json(200, { days: [{ day: day(0), usd: b.spend.todayUsd, calls: 3 }, { day: day(1), usd: 1.25, calls: 9 }, { day: day(2), usd: 0, calls: 0 }, { day: day(3), usd: 0.6, calls: 4 }], month: { month: today.toISOString().slice(0, 7), usd: b.spend.monthUsd }, limits: { ...b.limits } });
  }
  if (p === '/api/push/subscribe' && m === 'POST') {
    const sub = body.subscription || {};
    if (typeof sub.endpoint !== 'string' || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') return json(400, { error: 'bad_subscription', message: 'endpoint and keys are required' });
    b.subs = b.subs.filter((x) => x.endpoint !== sub.endpoint);
    const rec = { id: `p_${(++b.seq).toString(36)}`, label: String(body.label || 'Browser'), addedAt: new Date().toISOString(), endpoint: sub.endpoint, keys: sub.keys };
    b.subs.push(rec);
    return json(201, { id: rec.id });
  }
  if (p === '/api/push/subscribe' && m === 'DELETE') {
    b.subs = b.subs.filter((x) => x.endpoint !== body.endpoint);
    return { status: 204 };
  }
  if (p === '/api/push/test' && m === 'POST') {
    b.pushTests += 1;
    return json(200, { sent: b.subs.length, failed: 0 });
  }
  return json(405, { error: 'method_not_allowed', message: `${m} ${p}` });
}

// ---- hearing and voice (v7.7) ------------------------------------------------------------------------

/** The senses' fake state: parts 'off' | 'ready' | 'downloading' (seeded), what it heard and said. */
export function fakeSenses(seed = {}) {
  const sd = seed && typeof seed === 'object' ? seed : {};
  const part = (state, extra) => ({ enabled: state === 'ready' || state === 'downloading', state: state === 'ready' || state === 'downloading' ? state : 'off', progress: state === 'ready' ? 1 : 0, error: null, ...extra });
  return {
    enabled: seed !== false,
    hear: part(sd.hear || 'off', { model: sd.model || 'base.en', sizeMb: 80 }),
    speak: part(sd.speak || 'off', { voice: 'bm_george', sizeMb: 92 }),
    deps: { installed: sd.deps !== false },
    hearText: sd.hearText || 'What is the capital of France?',
    hearQueue: Array.isArray(sd.hearQueue) ? sd.hearQueue.slice() : [],
    hearDelayMs: sd.hearDelayMs || 0,
    speakDelayMs: sd.speakDelayMs || 0,
    hearMode: sd.hearMode || 'ok',
    speakMode: sd.speakMode || 'ok',
    downloadSteps: sd.downloadSteps || 2,
    steps: { hear: 0, speak: 0 },
    hears: [], // { bytes, prompt, wav: true|false }
    speaks: [], // { text, voice, speed }
    puts: [],
    gets: 0,
  };
}

function sensesObject(x) {
  const pick = (p) => ({ ...p });
  return { hear: pick(x.hear), speak: pick(x.speak), deps: { ...x.deps } };
}

/** A small 24 kHz mono PCM16 WAV: a soft tone about as long as the text would take to say. */
export function fakeSpeechWav(text) {
  const seconds = Math.min(6, Math.max(0.3, String(text || '').length * 0.05));
  const rate = 24000;
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * 180 * i) / rate) * Math.min(1, i / 600, (n - i) / 600)), 44 + i * 2);
  return buf;
}

/** api/senses, api/hear, api/speak. Answers (a Promise), or null (not one of them). */
function sensesRoute(x, route, req, url, json) {
  const p = url.pathname;
  if (!/^\/api\/(?:senses|hear|speak)$/.test(p)) return null;
  if (!x.enabled) return json(404, { error: 'not_found', message: `no such endpoint: ${p}` });
  const m = req.method();
  const later = (ms, fn) => (ms ? new Promise((r) => setTimeout(r, ms)).then(fn) : fn());
  if (p === '/api/senses') {
    if (m === 'GET') {
      x.gets += 1;
      for (const k of ['hear', 'speak']) {
        const part = x[k];
        if (part.enabled && part.state === 'downloading') {
          x.steps[k] += 1;
          part.progress = Math.min(1, Math.round((x.steps[k] / x.downloadSteps) * 100) / 100);
          if (x.steps[k] >= x.downloadSteps) {
            part.state = 'ready';
            part.progress = 1;
          }
        }
      }
      return json(200, sensesObject(x));
    }
    if (m === 'PUT') {
      let body = {};
      try {
        body = JSON.parse(req.postData() || '{}') || {};
      } catch {
        return json(400, { error: 'bad_json', message: 'the body is not valid JSON' });
      }
      x.puts.push(body);
      for (const k of ['hear', 'speak']) {
        const b = body[k];
        if (!b || typeof b !== 'object') continue;
        const part = x[k];
        const newModel = k === 'hear' && typeof b.model === 'string' && b.model !== part.model;
        if (newModel) part.model = b.model;
        if (b.enabled === false) {
          part.enabled = false;
          part.state = 'off';
          part.progress = 0;
        } else if (b.enabled === true && (!part.enabled || newModel)) {
          part.enabled = true;
          part.state = 'downloading';
          part.progress = 0;
          x.steps[k] = 0;
        }
      }
      return json(200, sensesObject(x));
    }
    return json(405, { error: 'method_not_allowed', message: 'GET, PUT' });
  }
  if (m !== 'POST') return json(405, { error: 'method_not_allowed', message: 'POST' });
  if (p === '/api/hear') {
    if (x.hearMode === 'unreachable') return route.abort('internetdisconnected');
    if (x.hearMode === 'error') return json(500, { error: 'internal', message: 'whisper failed' });
    const bytes = req.postDataBuffer() || Buffer.alloc(0);
    const type = String(req.headers()['content-type'] || '');
    const wav = bytes.length >= 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
    x.hears.push({ bytes: bytes.length, prompt: url.searchParams.get('prompt') || '', wav, type, rate: wav ? bytes.readUInt32LE(24) : 0, seconds: wav ? (bytes.length - 44) / 2 / bytes.readUInt32LE(24) : 0 });
    // Debugging the VAD: JARVIS_E2E_HEAR_DUMP=/some/prefix keeps each WAV heard as <prefix>-<n>.wav.
    if (process.env.JARVIS_E2E_HEAR_DUMP) writeFileSync(`${process.env.JARVIS_E2E_HEAR_DUMP}-${x.hears.length}.wav`, bytes);
    if (!/audio\/wav/.test(type) || !wav) return json(400, { error: 'bad_audio', message: 'send a WAV (16 kHz mono PCM16)' });
    if (bytes.length > 2 * 1024 * 1024) return json(413, { error: 'too_large', message: 'at most 2 MB' });
    if (!x.hear.enabled || x.hear.state !== 'ready') return json(409, { error: 'not_ready', message: 'hearing is not ready on the home base' });
    // Under half a second (the app's warm-up: 0.4 s of silence) is no words, as Whisper hears silence.
    const short = (bytes.length - 44) / 2 / bytes.readUInt32LE(24) < 0.5;
    const text = short ? '' : x.hearQueue.length ? x.hearQueue.shift() : x.hearText;
    return later(x.hearDelayMs, () => json(200, { text, ms: 420, model: `whisper-${x.hear.model}` }));
  }
  // /api/speak
  if (x.speakMode === 'unreachable') return route.abort('internetdisconnected');
  if (x.speakMode === 'error') return json(500, { error: 'internal', message: 'kokoro failed' });
  let body = {};
  try {
    body = JSON.parse(req.postData() || '{}') || {};
  } catch {
    return json(400, { error: 'bad_json', message: 'the body is not valid JSON' });
  }
  x.speaks.push({ text: String(body.text || ''), voice: body.voice, speed: body.speed });
  if (!x.speak.enabled || x.speak.state !== 'ready') return json(409, { error: 'not_ready', message: 'the voice is not ready on the home base' });
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000) return json(400, { error: 'bad_text', message: 'text: 1 to 1000 characters' });
  const cors = req.headers().origin ? { 'access-control-allow-origin': req.headers().origin, vary: 'Origin' } : {};
  return later(x.speakDelayMs, () => route.fulfill({ status: 200, contentType: 'audio/wav', headers: { ...cors, 'cache-control': 'no-store' }, body: fakeSpeechWav(body.text) }));
}

/** One home base's sync storage: { devices: Map(id -> { id, label, updatedAt, bytes, text, encoding }), puts, gets, mode }. */
export function fakeSyncStore() {
  return { devices: new Map(), puts: [], gets: [], lists: 0, mode: 'ok', clock: 0 };
}

const KEY_LIKE = /sk-ant-[A-Za-z0-9_-]{20,}/i;

/** api/sync (Jarvis Core 1.1's sync module). Answers, or null (not one of its routes). */
function syncRoute(store, b, req, url, json, raw) {
  const p = url.pathname;
  if (!/^\/api\/sync(?:\/|$)/.test(p)) return null;
  if (!b.enabled) return json(404, { error: 'not_found', message: `no such endpoint: ${p}` });
  const m = req.method();
  if (p === '/api/sync') {
    if (m !== 'GET') return json(405, { error: 'method_not_allowed', message: 'GET, HEAD' });
    store.lists += 1;
    const devices = [...store.devices.values()].map(({ id, label, updatedAt, bytes }) => ({ id, label, updatedAt, bytes })).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    return json(200, { devices });
  }
  const id = p.slice('/api/sync/'.length);
  if (!/^[a-z0-9-]{8,64}$/.test(id)) return json(400, { error: 'bad_device', message: 'the device id must be 8-64 characters: a-z, 0-9 and -' });
  if (m === 'PUT') {
    const headers = req.headers();
    const encoding = String(headers['content-encoding'] || 'identity').toLowerCase();
    if (store.mode === 'toolarge') return json(413, { error: 'too_large', message: 'the backup is larger than 50 MB' });
    let buf = req.postDataBuffer() || Buffer.alloc(0);
    try {
      if (encoding === 'gzip') buf = gunzipSync(buf);
    } catch {
      return json(400, { error: 'bad_gzip', message: 'the upload says it is gzip but could not be unpacked' });
    }
    const text = buf.toString('utf8');
    if (KEY_LIKE.test(text)) return json(400, { error: 'key_in_backup', message: 'the backup contains something shaped like an API key (sk-ant-…), so it was not stored' });
    if (!/^\s*\{/.test(text) || !/"app"\s*:\s*"jarvis"/.test(text.slice(0, 1024))) return json(400, { error: 'bad_backup', message: "that isn't a Jarvis backup" });
    let label = headers['x-jarvis-device-label'] || '';
    try {
      label = decodeURIComponent(label);
    } catch {
      /* as it is */
    }
    const prev = store.devices.get(id);
    // Strictly increasing times, even for two uploads in one millisecond.
    store.clock = Math.max(Date.now(), store.clock + 1);
    const updatedAt = new Date(store.clock).toISOString();
    store.devices.set(id, { id, label: label || (prev && prev.label) || 'Device', updatedAt, bytes: buf.length, text, encoding });
    store.puts.push({ id, label, encoding, bytes: buf.length });
    return json(200, { ok: true, bytes: buf.length, storedAt: updatedAt });
  }
  if (m === 'GET') {
    store.gets.push(id);
    const d = store.devices.get(id);
    if (!d) return json(404, { error: 'not_found', message: 'no backup from that device yet' });
    return raw(200, d.text);
  }
  return json(405, { error: 'method_not_allowed', message: 'GET, PUT' });
}

export async function routeFakeCore(context, { mode = 'ok', delayMs = 0, brain = {}, sync = fakeSyncStore(), senses = {} } = {}) {
  const fx = coreFixtures();
  const state = { mode, delayMs, requests: [], asks: [], brain: fakeBrain(brain), sync, senses: fakeSenses(senses) };
  await context.route(`${CORE_ORIGIN}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    state.requests.push(`${req.method()} ${url.pathname}`);
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    if (state.mode === 'unreachable') return route.abort('internetdisconnected');
    const origin = req.headers().origin;
    // Tailscale serve with the Core stopped: 502 and an empty body, without CORS headers. (Playwright
    // adds Access-Control-Allow-Origin to a fulfilled CORS request that has none, so another origin
    // stands in for "none": the page can't read it either way; the no-cors ping gets an opaque answer.)
    if (state.mode === 'down') return route.fulfill({ status: 502, headers: { 'access-control-allow-origin': 'https://login.tailscale.com', 'cache-control': 'no-store' }, body: '' });
    const cors = origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    const json = (status, body, extra = {}) =>
      route.fulfill({ status, contentType: 'application/json; charset=utf-8', headers: { ...cors, 'cache-control': 'no-store', ...extra }, body: JSON.stringify(body) });
    if (state.mode === 'refused') return json(403, { error: 'forbidden', message: 'requests from other devices must come through Tailscale serve' });
    if (state.mode === 'starting') return json(503, { error: 'starting', message: 'the Core is starting, try again in a second' }, { 'retry-after': '1' });
    const scenario = CORE_SCENARIOS.includes(state.mode) ? state.mode : 'ok';
    const raw = (status, text) => route.fulfill({ status, contentType: 'application/json; charset=utf-8', headers: { ...cors, 'cache-control': 'no-store' }, body: text });
    const syncAnswer = syncRoute(state.sync, state.brain, req, url, json, raw);
    if (syncAnswer) return syncAnswer;
    const sensesAnswer = sensesRoute(state.senses, route, req, url, json);
    if (sensesAnswer) return sensesAnswer;
    const brainAnswer = brainRoute(state.brain, req, url, json);
    if (brainAnswer) {
      if (brainAnswer.status === 204) return route.fulfill({ status: 204, headers: { ...cors, 'cache-control': 'no-store' }, body: '' });
      return brainAnswer;
    }
    switch (url.pathname) {
      case '/api/status':
        return json(200, fx.status[scenario]);
      case '/api/info':
        return json(200, { ...fx.info, scenario });
      case '/api/ping':
        return json(200, { ok: true, t: fx.status[scenario].t, level: fx.status[scenario].health.level });
      case '/api/ask': {
        if (req.method() !== 'POST') return json(405, { error: 'method_not_allowed', message: 'use POST with {"q": "..."}' });
        let q = '';
        try {
          q = JSON.parse(req.postData() || '{}').q;
        } catch {
          return json(400, { error: 'bad_json', message: 'the body is not valid JSON' });
        }
        if (typeof q !== 'string' || !q.trim()) return json(400, { error: 'empty_question', message: 'the question is empty' });
        state.asks.push(q);
        return json(200, fx.ask[scenario][fixtureQuestion(q)]);
      }
      default:
        return json(404, { error: 'not_found', message: `no such endpoint: ${url.pathname}` });
    }
  });
  return state;
}
