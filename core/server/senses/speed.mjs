// How quickly George speaks on this computer, and which build of Kokoro makes him.
//
// At each warm-up that loads the voice engine, the Core times one fixed sentence (BENCH_TEXT) and records
// its real-time factor (rtf: seconds of work per second of speech; 0.5 is twice as fast as George talks).
// When the default fp32 model is slower than RTF_SWITCH, the Core also tries Kokoro's 8-bit build (q8, a
// 92 MB download, once) on the same sentence and keeps it when it is faster here (by at least 5 %: fp32
// sounds a touch cleaner, so a tie keeps it). The verdict is kept in <data>/senses/speed-v1.json for this
// processor, so after a restart the Core loads the faster model straight away; another processor (the
// data folder copied to a new computer) measures afresh.
//
//   rtfOf({ ms, samples, sampleRate })              → 0.31 (null when there is nothing to divide by)
//   processorId()                                    → 'Intel(R) Core(TM) i7-6700 CPU @ 3.40GHz x8'
//   pickDtype({ configured, auto, record, cpu })     → the dtype to load: 'fp32' | 'q8'
//   shouldTryQ8({ auto, dtype, rtf, record, cpu })   → whether to measure the 8-bit model now
//   prefersQ8(fp32Rtf, q8Rtf)                        → whether the 8-bit model wins
//   normalizeSpeedRecord(raw)                        → { v: 1, cpu, dtype?, measured: { fp32?, q8? } } | null
//   withMeasurement(record, cpu, dtype, rtf, at)     → a new record with this measurement

import os from 'node:os';

/** Slower than this with fp32 (seconds of work per second of speech): see whether q8 is faster here. */
export const RTF_SWITCH = 0.8;
/** q8 must take at most this share of fp32's time to be chosen. */
export const Q8_MARGIN = 0.95;
/** The fixed sentence: one sentence of everyday length (about 5.5 s of George), so no pause is timed. */
export const BENCH_TEXT = 'The home base is running smoothly this evening, and George is ready to speak for you.';
export const BENCH_VOICE = 'bm_george';

const DTYPES = new Set(['fp32', 'q8']);
const round2 = (v) => Math.round(v * 100) / 100;

export function rtfOf({ ms, samples, sampleRate } = {}) {
  if (!(Number.isFinite(ms) && ms >= 0 && samples > 0 && sampleRate > 0)) return null;
  return Math.max(0.01, round2(ms / 1000 / (samples / sampleRate)));
}

/** The processor this Core runs on, as the speed record names it (the model and the threads it offers). */
export function processorId(osApi = os) {
  let model = '';
  try {
    model = String(osApi.cpus()?.[0]?.model ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    model = '';
  }
  let n = 0;
  try {
    n = typeof osApi.availableParallelism === 'function' ? osApi.availableParallelism() : osApi.cpus().length;
  } catch {
    n = 0;
  }
  return `${model || 'unknown processor'} x${n || '?'}`.slice(0, 160);
}

function cleanMeasure(m) {
  if (!m || typeof m !== 'object' || !Number.isFinite(m.rtf) || m.rtf <= 0 || m.rtf > 100) return null;
  return { rtf: round2(m.rtf), at: typeof m.at === 'string' ? m.at.slice(0, 40) : null };
}

/** A speed record read from disk, checked; null when it is missing or unusable. */
export function normalizeSpeedRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1 || typeof raw.cpu !== 'string') return null;
  const out = { v: 1, cpu: raw.cpu.slice(0, 160), measured: {} };
  if (DTYPES.has(raw.dtype)) out.dtype = raw.dtype;
  for (const d of DTYPES) {
    const m = cleanMeasure(raw.measured?.[d]);
    if (m) out.measured[d] = m;
  }
  return out;
}

/** The record with one more measurement (a record for another processor starts afresh). */
export function withMeasurement(record, cpu, dtype, rtf, at = new Date().toISOString()) {
  const base = record && record.cpu === cpu ? structuredClone(record) : { v: 1, cpu, measured: {} };
  base.measured[dtype] = { rtf: round2(rtf), at };
  return base;
}

/** The voice model to load: the measured verdict for this processor when picking is automatic. */
export function pickDtype({ configured = 'fp32', auto = true, record = null, cpu } = {}) {
  if (!auto) return configured;
  if (record && record.cpu === cpu && DTYPES.has(record.dtype)) return record.dtype;
  return configured;
}

export function prefersQ8(fp32Rtf, q8Rtf) {
  return Number.isFinite(fp32Rtf) && Number.isFinite(q8Rtf) && q8Rtf <= fp32Rtf * Q8_MARGIN;
}

/**
 * Whether to try the 8-bit model after timing `dtype` at `rtf`: only when picking is automatic, fp32 is
 * loaded and slower than `threshold`, and q8 has not already been measured slower than that here.
 */
export function shouldTryQ8({ auto = true, dtype, rtf, record = null, cpu, threshold = RTF_SWITCH } = {}) {
  if (!auto || dtype !== 'fp32' || !Number.isFinite(rtf) || rtf <= threshold) return false;
  const known = record && record.cpu === cpu ? record.measured?.q8 : null;
  return !(known && !prefersQ8(rtf, known.rtf));
}
