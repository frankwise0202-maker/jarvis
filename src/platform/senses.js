// Hearing and voice through the home base over HTTP (v7.7, beta, SPEC §25): Jarvis Core's
// api/senses, api/hear and api/speak. Same rules as every home base request (src/platform/homebase.js
// requestHomeBase: credentials omitted, no referrer, never cached, a timeout; failures are { ok:
// false, kind, status?, code?, message? }). Nothing goes anywhere but the owner's own home base.
//
//   getSenses(base)                          GET  api/senses  -> { ok, senses } (src/lib/senses.js sensesView)
//   putSenses(base, { hear, speak })         PUT  api/senses  -> { ok, senses }
//   hearWav(base, wav, { prompt, timeoutMs }) POST api/hear (audio/wav, ?prompt=) -> { ok, text, ms, model }
//   speakText(base, { text, voice, speed })  POST api/speak   -> { ok, pcm, sampleRate, ms }
//
// hear and speak never ping to tell 'down' from 'unreachable' (probe: false): either way the device's
// own recognizer or voice takes over at once. A hear slower than its timeout (4 s) is { kind:
// 'timeout' }.

import { requestHomeBase } from './homebase.js';
import { sensesView, hearText, decodeWav, HEAR_TIMEOUT_MS, HEAR_PROMPT_MAX, SPEAK_MAX_CHARS } from '../lib/senses.js';
import { cleanLine } from '../lib/homebase.js';

const SENSES_TIMEOUT_MS = 8000;
const SPEAK_TIMEOUT_MS = 12000;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const notSenses = (status = 200) => ({ ok: false, kind: 'notcore', status });
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function timedOut(r) {
  return r && r.kind === 'unreachable' && r.timedOut === true ? { ok: false, kind: 'timeout' } : r;
}

/** GET api/senses: what the home base hears and says with, and whether it's ready. */
export async function getSenses(base, opts = {}) {
  const r = await requestHomeBase(base, 'senses', { timeoutMs: SENSES_TIMEOUT_MS, ...opts });
  if (!r.ok) return r;
  const senses = sensesView(r.data);
  return senses ? { ok: true, senses } : notSenses();
}

/** PUT api/senses: { hear: { enabled, model }, speak: { enabled } } (either part). Answers the whole state. */
export async function putSenses(base, patch, opts = {}) {
  const p = isObj(patch) ? patch : {};
  const body = {};
  if (isObj(p.hear)) {
    body.hear = {};
    if (typeof p.hear.enabled === 'boolean') body.hear.enabled = p.hear.enabled;
    if (typeof p.hear.model === 'string' && /^[a-z0-9][a-z0-9.-]{0,23}$/.test(p.hear.model)) body.hear.model = p.hear.model;
  }
  if (isObj(p.speak)) {
    body.speak = {};
    if (typeof p.speak.enabled === 'boolean') body.speak.enabled = p.speak.enabled;
  }
  const r = await requestHomeBase(base, 'senses', { method: 'PUT', body, timeoutMs: SENSES_TIMEOUT_MS, ...opts });
  if (!r.ok) return r;
  const senses = sensesView(r.data);
  return senses ? { ok: true, senses } : notSenses();
}

/**
 * POST api/hear: a WAV (16 kHz mono PCM16, ≤ 30 s) and up to 200 characters of context words. { ok:
 * true, text ('' = no words), ms (the Core's time), model, tookMs (here, the whole round trip) }.
 */
export async function hearWav(base, wav, { prompt = '', timeoutMs = HEAR_TIMEOUT_MS, ...opts } = {}) {
  const p = cleanLine(typeof prompt === 'string' ? prompt : '', HEAR_PROMPT_MAX + 1).slice(0, HEAR_PROMPT_MAX);
  const path = p ? `hear?prompt=${encodeURIComponent(p)}` : 'hear';
  const t0 = now();
  const r = timedOut(await requestHomeBase(base, path, { method: 'POST', rawBody: wav, headers: { 'Content-Type': 'audio/wav' }, timeoutMs, probe: false, ...opts }));
  if (!r.ok) return r;
  const d = r.data;
  if (typeof d.text !== 'string') return notSenses();
  const ms = typeof d.ms === 'number' && Number.isFinite(d.ms) ? Math.max(0, Math.round(d.ms)) : null;
  return { ok: true, text: hearText(d), ms, model: cleanLine(d.model, 40), tookMs: Math.round(now() - t0) };
}

/** POST api/speak: one sentence (or a few) in George's voice, made on the home base. 24 kHz mono floats. */
export async function speakText(base, { text, voice = 'bm_george', speed = 1 } = {}, { timeoutMs = SPEAK_TIMEOUT_MS, ...opts } = {}) {
  const t = typeof text === 'string' ? text.trim().slice(0, SPEAK_MAX_CHARS) : '';
  if (!t) return { ok: false, kind: 'empty' };
  const sp = typeof speed === 'number' && Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : 1;
  const v = typeof voice === 'string' && /^[a-z]{2}_[a-z]{2,20}$/.test(voice) ? voice : 'bm_george';
  const t0 = now();
  const r = timedOut(await requestHomeBase(base, 'speak', { method: 'POST', body: { text: t, voice: v, speed: sp }, timeoutMs, binary: true, probe: false, ...opts }));
  if (!r.ok) return r;
  if (!r.bytes) return notSenses();
  const wav = decodeWav(r.bytes);
  if (!wav || !wav.pcm.length) return { ok: false, kind: 'notcore', status: 200, code: 'bad_audio' };
  return { ok: true, pcm: wav.pcm, sampleRate: wav.sampleRate, ms: Math.round(now() - t0) };
}
