// WAV in and out, and a resampler. Pure functions, no dependencies.
//
//   parseWav(buf)                        → { sampleRate, channels, bitsPerSample, format, samples: Float32Array (channel 0 … interleaved) }
//   readHearingWav(buf, { maxSec })      → { ok: true, audio: Float32Array (16 kHz mono), seconds } | { ok: false, code, message }
//   encodeWav(float32, sampleRate)       → Buffer: 16-bit PCM, mono
//   resample(float32, fromRate, toRate)  → Float32Array (windowed-sinc low-pass when going down)

export const HEAR_RATE = 16000;

const fail = (code, message) => ({ ok: false, code, message });

/** The RIFF/WAVE structure; throws an Error with a plain message when it is not one. */
export function parseWav(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf ?? []);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file (no RIFF/WAVE header)');
  let fmt = null;
  let data = null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const start = off + 8;
    // A recorder that streams may leave the size at 0 or 0xFFFFFFFF: take what is there.
    if (id === 'data' && (size === 0 || start + size > buf.length)) size = buf.length - start;
    if (start + size > buf.length) break;
    if (id === 'fmt ' && size >= 16) {
      let format = buf.readUInt16LE(start);
      if (format === 0xfffe && size >= 40) format = buf.readUInt16LE(start + 24); // WAVE_FORMAT_EXTENSIBLE: the sub-format
      fmt = { format, channels: buf.readUInt16LE(start + 2), sampleRate: buf.readUInt32LE(start + 4), bitsPerSample: buf.readUInt16LE(start + 14) };
    } else if (id === 'data') {
      data = buf.subarray(start, start + size);
      break;
    }
    off = start + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt) throw new Error('the WAV file has no format chunk');
  if (!data) throw new Error('the WAV file has no audio data');
  let samples;
  if (fmt.format === 1 && fmt.bitsPerSample === 16) {
    const n = Math.floor(data.length / 2);
    samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  } else if (fmt.format === 3 && fmt.bitsPerSample === 32) {
    const n = Math.floor(data.length / 4);
    samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = data.readFloatLE(i * 4);
  } else {
    samples = null; // a format the Core does not read (8-bit, 24-bit, compressed)
  }
  return { ...fmt, samples };
}

/**
 * A request body for POST /api/hear: a WAV, 16 kHz, mono, 16-bit PCM, at most maxSec seconds.
 * Never throws: bad audio is a 400 with a message that says what to send.
 */
export function readHearingWav(buf, { maxSec = 30, minSec = 0.1 } = {}) {
  let w;
  try {
    w = parseWav(buf);
  } catch (err) {
    return fail('bad_audio', `${err.message}: send a WAV, 16 kHz, mono, 16-bit PCM`);
  }
  if (w.format !== 1 || w.bitsPerSample !== 16 || !w.samples) return fail('bad_audio', 'the audio must be 16-bit PCM (WAV format 1)');
  if (w.channels !== 1) return fail('bad_audio', `the audio must be mono (this one has ${w.channels} channels)`);
  if (w.sampleRate !== HEAR_RATE) return fail('bad_audio', `the audio must be 16 kHz (this one is ${w.sampleRate} Hz)`);
  const seconds = w.samples.length / HEAR_RATE;
  if (seconds > maxSec + 0.05) return fail('audio_too_long', `the audio can be up to ${maxSec} seconds (this one is ${seconds.toFixed(1)} s)`);
  if (seconds < minSec) return fail('audio_too_short', 'the audio is empty or too short to hold a word');
  return { ok: true, audio: w.samples, seconds };
}

/** 16-bit PCM mono WAV, the most widely playable kind (Safari, Chrome, every audio element). */
export function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0));
    buf.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), 44 + i * 2);
  }
  return buf;
}

/** Resample with a Blackman-windowed sinc (low-passed below the lower Nyquist rate, so nothing aliases). */
export function resample(samples, fromRate, toRate, { halfTaps = 16 } = {}) {
  if (fromRate === toRate) return Float32Array.from(samples);
  const ratio = toRate / fromRate;
  const outLen = Math.floor(samples.length * ratio);
  const out = new Float32Array(outLen);
  const cutoff = Math.min(1, ratio); // as a fraction of the input's Nyquist frequency
  const width = Math.ceil(halfTaps / cutoff);
  for (let i = 0; i < outLen; i++) {
    const center = i / ratio;
    const first = Math.ceil(center - width);
    const last = Math.floor(center + width);
    let acc = 0;
    let norm = 0;
    for (let j = first; j <= last; j++) {
      if (j < 0 || j >= samples.length) continue;
      const x = j - center;
      const t = x / width; // -1 … 1 across the window
      const win = 0.42 + 0.5 * Math.cos(Math.PI * t) + 0.08 * Math.cos(2 * Math.PI * t);
      const arg = Math.PI * x * cutoff;
      const sinc = arg === 0 ? 1 : Math.sin(arg) / arg;
      const w = sinc * win;
      acc += samples[j] * w;
      norm += w;
    }
    out[i] = norm ? acc / norm : 0;
  }
  return out;
}
