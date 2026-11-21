// openWakeWord's streaming pipeline (v0.5.1), the "Hey Jarvis" wake word, independent of the
// inference engine: the worker runs it with ONNX Runtime Web, the tests with the same runtime in
// Node. A faithful port of openwakeword/utils.py AudioFeatures (streaming) and model.py predict():
//
//   16 kHz mono, 1280-sample (80 ms) frames, int16 scale (±32768)
//   melspectrogram.onnx  on the frame plus the 480 samples before it (window 512, hop 160 → 8 new
//                        mel frames of 32 bins; 5 on the very first frame), then x / 10 + 2 (the
//                        transform that matches Google's speech_embedding)
//   embedding_model.onnx on the last 76 mel frames [1, 76, 32, 1] → one 96-number embedding per frame
//                        (the mel buffer starts as 76 frames of ones, as in openWakeWord)
//   hey_jarvis_v0.1.onnx on the last 16 embeddings [1, 16, 96] → a score 0..1 per frame
//
// One difference, on purpose: openWakeWord seeds its embedding buffer with the embeddings of 4 s of
// random noise and zeroes its first 5 scores; here no score is reported (0) until 16 real
// embeddings exist (1.28 s after the microphone starts). From then on the scores are the same
// numbers (test/unit/wake.oww.test.mjs compares them with a Python reference of the original).
//
// Detection: `threshold` (0.5, openWakeWord's default) for `patience` frames in a row, then nothing
// for `refractoryMs`.
//
//   const p = createWakePipeline({ melspec, embed, classify });
//     melspec(Float32Array samples) -> Promise<Float32Array>   the model's raw output, frames × 32
//     embed(Float32Array 76 × 32)   -> Promise<Float32Array>   96 numbers
//     classify(Float32Array 16 × 96) -> Promise<number>        the score
//   await p.push(frame)   // Float32Array of 1280 samples in -1..1 (or int16 scale with { int16: true })
//     -> { score, detected, ready }
//   p.reset()

export const OWW = Object.freeze({
  sampleRate: 16000,
  frame: 1280, // 80 ms
  context: 480, // 160 × 3: samples before the frame the melspectrogram needs for its 8 new frames
  melBins: 32,
  melWindow: 76,
  embedding: 96,
  features: 16, // hey_jarvis_v0.1's input: 16 embeddings (1.28 s)
});

export function createWakePipeline({ melspec, embed, classify, threshold = 0.5, patience = 2, refractoryMs = 2000, features = OWW.features, int16 = false } = {}) {
  if (typeof melspec !== 'function' || typeof embed !== 'function' || typeof classify !== 'function') throw new TypeError('createWakePipeline needs melspec, embed and classify');
  const { frame, context, melBins, melWindow, embedding } = OWW;
  const raw = new Float32Array(frame + context); // the last 1760 samples (int16 scale)
  let rawFill = 0;
  const mel = new Float32Array(melWindow * melBins); // the last 76 mel frames
  const feats = new Float32Array(features * embedding); // the last `features` embeddings
  let featFill = 0;
  let above = 0;
  let quietUntil = -Infinity; // frame index before which no detection is reported (refractory)
  let frames = 0;
  const refractoryFrames = Math.max(0, Math.round(refractoryMs / ((frame / OWW.sampleRate) * 1000)));
  let busy = false;

  function reset() {
    rawFill = 0;
    raw.fill(0);
    mel.fill(1); // openWakeWord: np.ones((76, 32))
    feats.fill(0);
    featFill = 0;
    above = 0;
    quietUntil = -Infinity;
    frames = 0;
  }
  reset();

  async function push(input) {
    if (!input || input.length !== frame) throw new RangeError(`a wake-word frame is ${frame} samples`);
    if (busy) throw new Error('push() called before the previous frame finished');
    busy = true;
    try {
      // 1. The raw buffer: the frame plus up to 480 samples before it (int16 scale).
      const scale = int16 ? 1 : 32767;
      const keep = Math.min(rawFill, context);
      raw.copyWithin(0, rawFill - keep, rawFill);
      for (let i = 0; i < frame; i++) {
        const v = input[i] * scale;
        raw[keep + i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
      }
      rawFill = keep + frame;
      // 2. The melspectrogram of those samples: 5 frames the first time, 8 after.
      const spec = await melspec(raw.subarray(0, rawFill));
      const n = Math.floor(spec.length / melBins);
      if (n > 0) {
        const take = Math.min(n, melWindow);
        mel.copyWithin(0, take * melBins);
        const dst = (melWindow - take) * melBins;
        const src = (n - take) * melBins;
        for (let i = 0; i < take * melBins; i++) mel[dst + i] = spec[src + i] / 10 + 2;
      }
      // 3. One embedding of the last 76 mel frames.
      const emb = await embed(mel);
      if (!emb || emb.length < embedding) throw new Error('the embedding model returned too little');
      feats.copyWithin(0, embedding);
      feats.set(emb.subarray ? emb.subarray(0, embedding) : Array.from(emb).slice(0, embedding), (features - 1) * embedding);
      if (featFill < features) featFill += 1;
      frames += 1;
      // 4. The score, once 16 real embeddings exist.
      if (featFill < features) return { score: 0, detected: false, ready: false };
      const raw01 = Number(await classify(feats));
      const score = Number.isFinite(raw01) ? Math.min(1, Math.max(0, raw01)) : 0;
      above = score >= threshold ? above + 1 : 0;
      let detected = false;
      if (above >= patience && frames >= quietUntil) {
        detected = true;
        quietUntil = frames + refractoryFrames;
        above = 0;
      }
      return { score, detected, ready: true };
    } finally {
      busy = false;
    }
  }

  return {
    push,
    reset,
    get frames() {
      return frames;
    },
  };
}

/**
 * Collect any number of samples into 1280-sample frames (the AudioWorklet hands out 128 at a time,
 * at 16 kHz after resampling). onFrame(Float32Array) gets a fresh array each time (transferable).
 */
export function createFramer(size = OWW.frame, onFrame = () => {}) {
  let buf = new Float32Array(size);
  let fill = 0;
  return {
    push(samples) {
      let i = 0;
      while (i < samples.length) {
        const n = Math.min(size - fill, samples.length - i);
        buf.set(samples.subarray ? samples.subarray(i, i + n) : Array.from(samples).slice(i, i + n), fill);
        fill += n;
        i += n;
        if (fill === size) {
          const out = buf;
          buf = new Float32Array(size);
          fill = 0;
          onFrame(out);
        }
      }
    },
    reset() {
      fill = 0;
    },
  };
}
