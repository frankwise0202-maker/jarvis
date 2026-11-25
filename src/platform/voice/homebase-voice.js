// George's voice from the home base (v7.7, beta, SPEC §25): Jarvis Core's POST api/speak (Kokoro on
// the owner's Alienware) behind the natural voice's engine interface (engine-client.js), so a reply
// is spoken by natural-stream.js through the same audio path (audio-out.js) as the on-device voice:
// whole sentences, queued ahead, gapless on the audio clock.
//
//   const engine = createHomeBaseVoiceEngine({ senses });
//   engine.synth(text, { voice, speed, first }) -> { id, promise }   promise -> { pcm, sampleRate, synthMs }
//   engine.cancel(ids) · engine.noteTiming(synthMs, audioSeconds) · engine.status() · engine.subscribe(fn)
//
// One request at a time (the home base makes one voice at a time); the stream asks for the next
// sentences while one plays. A request that fails (the home base unreachable, too slow, an error)
// is rejected with code 'not-ready': the stream hands the rest to the on-device George when it is
// on and ready, else to the built-in voice (voice-router.js), and the home base rests for a minute
// (senses.noteFailure). Slower than real time over 3 s of audio: 'slow', the same handoff.
//
// Each request's time limit follows its text (speakTimeoutFor): 6 s for a short sentence, else
// 2 s plus 1.5 × the audio the text makes, so only a home base clearly slower than its own audio
// misses it (a chunk of 222 characters is 17 s of George, made in 11 s at a real-time factor of
// 0.64). The first chunk of a reply, which the owner waits for in silence, gets 2 s plus 1 × its
// audio. The chunks stay short enough to come back quickly (status() asks the stream for a first
// chunk of at most 80 characters and later ones of at most 180, HOMEBASE_CHUNKS): the first words
// come sooner, and a home base that stops answering is noticed sooner.

const MIN_TIMEOUT_MS = 6000; // a short sentence: as before
const TIMEOUT_SLACK_MS = 2000; // the network and the Core's own work …
const TIMEOUT_PER_AUDIO = 1.5; // … plus 1.5 × the audio the text makes (1 × for a reply's first chunk)
const MAX_TIMEOUT_MS = 45000;
const CHARS_PER_SECOND = 13; // George at speed 1 (measured: 197 characters = 15.1 s, 258 = 21.1 s)
export const HOMEBASE_CHUNKS = Object.freeze({ firstChunk: 80, maxChunk: 180 });
// v7.8: the first words sooner. The first chunk is cut at the first clause or sentence end 40-60
// characters in (natural-stream.js, speech-text.js takeFirstClause), and the chunks after it grow from
// 48 characters by the measured speed (0.7 × real time assumed until measured: an i7's George plus the
// network), so the next one is made while the previous one plays, in whole clauses.
export const HOMEBASE_FIRST = Object.freeze({ firstCut: Object.freeze({ min: 40, max: 60 }), minChunk: 48, assumedRtf: 0.7 });
const RTF_WINDOW = 6;
const MIN_AUDIO_FOR_VERDICT = 3; // seconds
const SLOW_RTF = 1.0;

const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const fail = (code, message) => Object.assign(new Error(message), { code });

/**
 * The time limit of one api/speak request: 6 s, or 2 s + 1.5 × the audio of a longer text (at most
 * 45 s); a reply's first chunk (`first`: nothing plays yet) 2 s + 1 × its audio.
 */
export function speakTimeoutFor(text, speed = 1, { first = false } = {}) {
  const n = typeof text === 'string' ? text.length : 0;
  const sp = typeof speed === 'number' && Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : 1;
  const audioMs = (1000 * n) / (CHARS_PER_SECOND * sp);
  return Math.round(Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, TIMEOUT_SLACK_MS + (first ? 1 : TIMEOUT_PER_AUDIO) * audioMs)));
}

export function createHomeBaseVoiceEngine({ senses, timeoutFor = speakTimeoutFor, now = perfNow } = {}) {
  let st = { state: 'ready', rtf: null, underruns: 0, device: 'homebase', ...HOMEBASE_CHUNKS, ...HOMEBASE_FIRST };
  const listeners = new Set();
  const queue = [];
  let busy = null; // { id, ctl }
  let nextId = 1;
  const timings = [];

  function set(patch) {
    st = { ...st, ...patch };
    for (const fn of Array.from(listeners)) {
      try {
        fn(st);
      } catch (err) {
        console.error('[jarvis] home base voice listener failed:', err);
      }
    }
  }

  function synth(text, { voice = 'bm_george', speed = 1, first = false } = {}) {
    const id = nextId++;
    const promise = new Promise((resolve, reject) => {
      queue.push({ id, text, voice, speed, first: first === true, resolve, reject });
      run();
    });
    return { id, promise };
  }

  async function run() {
    if (busy || !queue.length) return;
    const job = queue.shift();
    const ctl = new AbortController();
    busy = { id: job.id, ctl };
    const t0 = now();
    let r;
    try {
      r = await senses.speak({ text: job.text, voice: job.voice, speed: job.speed }, { signal: ctl.signal, timeoutMs: timeoutFor(job.text, job.speed, { first: job.first }) });
    } catch {
      r = { ok: false, kind: 'error' };
    }
    if (busy && busy.id === job.id) busy = null;
    if (r && r.ok) job.resolve({ pcm: r.pcm, sampleRate: r.sampleRate, synthMs: now() - t0 });
    else if (r && r.kind === 'aborted') job.reject(fail('cancelled', 'Cancelled.'));
    else {
      // Nothing more from the home base for this reply: the queued sentences go to the fallback too.
      job.reject(fail('not-ready', 'The home base’s voice is not available.'));
      for (const q of queue.splice(0)) q.reject(fail('not-ready', 'The home base’s voice is not available.'));
    }
    run();
  }

  function cancel(ids) {
    const all = ids === 'all';
    const list = new Set(Array.isArray(ids) ? ids : []);
    for (let i = queue.length - 1; i >= 0; i--) {
      if (all || list.has(queue[i].id)) {
        const [job] = queue.splice(i, 1);
        job.reject(fail('cancelled', 'Cancelled.'));
      }
    }
    if (busy && (all || list.has(busy.id))) {
      try {
        busy.ctl.abort();
      } catch {
        /* ignore */
      }
    }
  }

  /** Real-time factor over the last few sentences (the network included). */
  function noteTiming(synthMs, audioSeconds, { underrun = false } = {}) {
    if (!(audioSeconds > 0) || !(synthMs >= 0)) return;
    timings.push({ synthMs, audioMs: audioSeconds * 1000 });
    if (timings.length > RTF_WINDOW) timings.shift();
    const audioMs = timings.reduce((n, t) => n + t.audioMs, 0);
    const rtf = timings.reduce((n, t) => n + t.synthMs, 0) / audioMs;
    const slow = audioMs >= MIN_AUDIO_FOR_VERDICT * 1000 && rtf > SLOW_RTF;
    set({ rtf: Math.round(rtf * 1000) / 1000, underruns: st.underruns + (underrun ? 1 : 0), state: slow ? 'slow' : 'ready' });
    if (slow) {
      // This reply hands over; the next ones use this device's voice for a minute, then try again.
      try {
        senses.noteFailure('speak', 'slow');
      } catch {
        /* ignore */
      }
      timings.length = 0;
      setTimeout(() => {
        if (st.state === 'slow') set({ state: 'ready', rtf: null });
      }, 0);
    }
  }

  return {
    synth,
    cancel,
    noteTiming,
    status: () => st,
    ready: () => st.state === 'ready',
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
