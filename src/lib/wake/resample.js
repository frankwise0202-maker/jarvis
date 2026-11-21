// A streaming resampler for the Standby microphone: the AudioContext runs at the device's rate
// (48 kHz on a Mac or an iPhone, 44.1 kHz on some), the wake word and the clap detector want 16 kHz.
// Windowed-sinc low-pass interpolation (Blackman window, 8 zero crossings each side), with the
// kernel precomputed at 256 fractional phases; each phase is normalized to unity gain at DC. Pure,
// no allocation per sample; push() returns the new 16 kHz samples (a fresh Float32Array).
//
//   const rs = createResampler(48000, 16000);
//   const out = rs.push(input128);   // ~42–43 samples for 128 in at 48 kHz

export function createResampler(fromRate, toRate = 16000, { zeros = 8, phases = 256, cutoff = 0.92 } = {}) {
  const from = Number(fromRate);
  const to = Number(toRate);
  if (!(from > 0) || !(to > 0)) throw new RangeError('createResampler: rates must be positive');
  if (from === to) {
    return {
      ratio: 1,
      push: (input) => Float32Array.from(input),
      reset() {},
    };
  }
  const ratio = from / to; // input samples per output sample
  const fc = 0.5 * Math.min(1, to / from) * cutoff; // cutoff, cycles per input sample
  const half = Math.ceil(zeros / (2 * fc)); // kernel half-width, input samples
  const width = 2 * half; // taps j = 0..width-1 at offsets (j - half + 1) from floor(t)
  const table = new Float32Array((phases + 1) * width);
  for (let p = 0; p <= phases; p++) {
    const f = p / phases;
    let sum = 0;
    for (let j = 0; j < width; j++) {
      const d = j - half + 1 - f; // distance from the output instant, input samples
      const x = 2 * fc * d;
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const u = (d + half) / (2 * half); // 0..1 across the window
      const w = u <= 0 || u >= 1 ? 0 : 0.42 - 0.5 * Math.cos(2 * Math.PI * u) + 0.08 * Math.cos(4 * Math.PI * u);
      const v = 2 * fc * sinc * w;
      table[p * width + j] = v;
      sum += v;
    }
    if (sum !== 0) for (let j = 0; j < width; j++) table[p * width + j] /= sum;
  }

  // History: the input samples from absolute index `base` on. It starts with `half` zeros before
  // sample 0, so the first output (at t = 0) has its full window.
  let buf = new Float32Array(Math.max(4096, width * 4));
  let len = 0;
  let base = 0;
  let t = 0; // absolute input time of the next output sample

  function reset() {
    buf.fill(0);
    len = half;
    base = -half;
    t = 0;
  }
  reset();

  function append(input) {
    if (len + input.length > buf.length) {
      const next = new Float32Array(Math.max(buf.length * 2, len + input.length + 1024));
      next.set(buf.subarray(0, len));
      buf = next;
    }
    buf.set(input, len);
    len += input.length;
  }

  function push(input) {
    if (input && input.length) append(input);
    // How many outputs are ready: the newest needs samples up to floor(t) + half.
    const end = base + len; // absolute index one past the last sample
    let count = 0;
    for (let tt = t; Math.floor(tt) + half < end; tt += ratio) count++;
    const out = new Float32Array(count);
    for (let n = 0; n < count; n++) {
      const i0 = Math.floor(t);
      const f = t - i0;
      const p = Math.round(f * phases);
      const k = p * width;
      let acc = 0;
      let at = i0 - half + 1 - base;
      for (let j = 0; j < width; j++, at++) acc += buf[at] * table[k + j];
      out[n] = acc;
      t += ratio;
    }
    // Drop what no future output needs.
    const keepFrom = Math.floor(t) - half + 1 - base;
    if (keepFrom > 0) {
      buf.copyWithin(0, keepFrom, len);
      len -= keepFrom;
      base += keepFrom;
    }
    return out;
  }

  return { ratio, push, reset };
}
