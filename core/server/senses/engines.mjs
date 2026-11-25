// The real speech engines: Whisper (hearing) through transformers.js and Kokoro (George's voice) through
// kokoro-js, both on onnxruntime-node's CPU backend. Loaded ONLY inside an engine process
// (senses/worker.mjs), so the Core's own process never imports the libraries, and a missing
// core/node_modules only ever fails here, as a plain error the Core reports.
//
//   const engine = await createEngine('hear', { repo, revision, dtype, cacheDir, onProgress });
//   await engine.run({ audio: Float32Array (16 kHz), prompt: 'words' })   → { text }
//   const engine = await createEngine('speak', { ... });
//   await engine.run({ text, voice: 'bm_george', speed: 1 }, { cancelled }) → { audio: Float32Array, sampleRate: 24000 }
//                                         (cancelled() true: stops before its next sentence, code 'cancelled')
//   await engine.dispose();
//
// Models come from huggingface.co at a pinned revision (senses/models.mjs) and are cached in cacheDir
// (~/.cache/jarvis-core/models): <cacheDir>/<repo>/<revision>/<file>.

const MAX_DECODER_POSITIONS = 448; // Whisper's text context

async function loadTransformers(cacheDir) {
  const T = await import('@huggingface/transformers');
  T.env.cacheDir = cacheDir;
  T.env.useFSCache = true;
  T.env.allowLocalModels = false; // never look in node_modules/…/models; the cache is the only local copy
  T.env.allowRemoteModels = true;
  return T;
}

function progressRelay(onProgress) {
  return (p) => {
    if (p?.status === 'progress' && typeof p.file === 'string') onProgress?.({ file: p.file, loaded: Number(p.loaded) || 0, total: Number(p.total) || 0 });
    else if (p?.status === 'done' && typeof p.file === 'string') onProgress?.({ file: p.file, done: true });
  };
}

function sessionOptions(threads) {
  return Number.isInteger(threads) && threads > 0 ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : undefined;
}

async function createHearEngine({ repo, revision, dtype, cacheDir, onProgress, threads }) {
  const T = await loadTransformers(cacheDir);
  const common = { revision, cache_dir: cacheDir, progress_callback: progressRelay(onProgress) };
  const [processor, model] = await Promise.all([
    T.AutoProcessor.from_pretrained(repo, common),
    T.WhisperForConditionalGeneration.from_pretrained(repo, { ...common, dtype, device: 'cpu', session_options: sessionOptions(threads) }),
  ]);
  const tokenizer = processor.tokenizer;
  const gc = model.generation_config;
  const sot = gc.decoder_start_token_id;
  const noTimestamps = gc.no_timestamps_token_id;
  const startOfPrev = tokenizer.model.tokens_to_ids.get('<|startofprev|>');

  /** The decoder's start: [<|startofprev|> prompt…] <|startoftranscript|> <|notimestamps|> (English-only model). */
  function initTokens(prompt) {
    const tail = [sot, noTimestamps].filter((t) => t != null);
    if (!prompt || startOfPrev == null) return tail;
    const ids = tokenizer.encode(` ${prompt.trim()}`, { add_special_tokens: false }).slice(-120);
    return ids.length ? [startOfPrev, ...ids, ...tail] : tail;
  }

  async function run({ audio, prompt = '' }) {
    const inputs = await processor(audio);
    const init = initTokens(prompt);
    const out = await model.generate({
      ...inputs,
      decoder_input_ids: init,
      max_new_tokens: Math.max(16, MAX_DECODER_POSITIONS - init.length - 4),
    });
    const all = Array.from(out.data ?? out[0]?.data ?? [], (v) => Number(v));
    const text = tokenizer.decode(all.slice(init.length), { skip_special_tokens: true }).trim();
    return { text };
  }

  return {
    run,
    async warmUp() {
      await run({ audio: new Float32Array(16000) });
    },
    async dispose() {
      await model.dispose?.();
    },
  };
}

async function createSpeakEngine({ repo, revision, dtype, cacheDir, onProgress, threads }) {
  const T = await loadTransformers(cacheDir);
  const { KokoroTTS } = await import('kokoro-js');
  const common = { revision, cache_dir: cacheDir, progress_callback: progressRelay(onProgress) };
  // KokoroTTS.from_pretrained cannot pin a revision, so the model and tokenizer are made here and handed
  // to its constructor (the same two objects from_pretrained would build). Voices ship inside kokoro-js.
  const [model, tokenizer] = await Promise.all([
    T.StyleTextToSpeech2Model.from_pretrained(repo, { ...common, dtype, device: 'cpu', session_options: sessionOptions(threads) }),
    T.AutoTokenizer.from_pretrained(repo, common),
  ]);
  const tts = new KokoroTTS(model, tokenizer);

  /**
   * One sentence at a time (Kokoro reads at most ~510 phonemes at once), joined with a short pause. A request
   * whose asker went away stops before its next sentence, so the phone's next reply doesn't wait for it.
   */
  async function run({ text, sentences, voice = 'bm_george', speed = 1 }, { cancelled = () => false } = {}) {
    const list = Array.isArray(sentences) && sentences.length ? sentences : [text];
    const parts = [];
    let rate = 24000;
    for (const s of list) {
      if (cancelled()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      const raw = await tts.generate(s, { voice, speed });
      rate = raw.sampling_rate;
      parts.push(raw.audio);
    }
    const gap = Math.round(rate * 0.12);
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0) + gap * (parts.length - 1));
    let at = 0;
    for (let i = 0; i < parts.length; i++) {
      out.set(parts[i], at);
      at += parts[i].length + gap;
    }
    return { audio: out, sampleRate: rate };
  }

  return {
    run,
    voices: Object.keys(tts.voices ?? {}),
    async warmUp() {
      await run({ text: 'Ready.', voice: 'bm_george', speed: 1 });
    },
    async dispose() {
      await model.dispose?.();
    },
  };
}

/** createEngine('hear' | 'speak', { repo, revision, dtype, cacheDir, onProgress, threads }) */
export async function createEngine(kind, options) {
  if (kind === 'hear') return createHearEngine(options);
  if (kind === 'speak') return createSpeakEngine(options);
  throw new Error(`unknown engine kind: ${kind}`);
}
