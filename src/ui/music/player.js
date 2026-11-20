// Apple Music previews: one shared player for every Music card (only one preview plays at a time).
// A preview is Apple's own 30-second clip (https://audio-ssl.itunes.apple.com/…, src/lib/music.js
// previewLink); the full song is played by the Music app (Open in Apple Music).
//
//   const player = createMusicPlayer({ canStart, onStart });
//   player.toggle(item)  -> Promise<{ ok: true } | { ok: false, reason: 'listening' | 'no-preview' | 'blocked' | 'error' }>
//   player.stop()        stop and rewind (a fade of 160 ms)
//   player.pauseForMic() pause because the microphone is about to listen (Voice Mode, dictation)
//   player.subscribe(fn) -> unsubscribe; fn({ id, playing, loading, time, duration, error })
//   player.state()
//
// canStart() -> true | false | 'listening': previews never start while the mic listens.
// onStart(): stop other sounds first, politely (Jarvis's own speech, other media).

import { previewLink } from '../../lib/music.js';

const FADE_MS = 160;

export function createMusicPlayer({ canStart = () => true, onStart = () => {}, createAudio } = {}) {
  let audio = null;
  let current = null; // { id, url }
  let loading = false;
  let error = null;
  let fadeTimer = 0;
  const listeners = new Set();

  function ensureAudio() {
    if (audio) return audio;
    audio = typeof createAudio === 'function' ? createAudio() : new Audio();
    audio.preload = 'none';
    try {
      audio.setAttribute('data-testid', 'music-audio');
    } catch {
      /* not an element */
    }
    for (const type of ['play', 'playing', 'pause', 'timeupdate', 'durationchange', 'loadedmetadata']) audio.addEventListener(type, emit);
    audio.addEventListener('waiting', () => {
      loading = true;
      emit();
    });
    audio.addEventListener('canplay', () => {
      loading = false;
      emit();
    });
    audio.addEventListener('ended', () => {
      loading = false;
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      emit();
    });
    audio.addEventListener('error', () => {
      if (!current) return;
      loading = false;
      error = 'error';
      emit();
    });
    return audio;
  }

  function state() {
    const a = audio;
    const playing = !!(a && current && !a.paused && !a.ended);
    const duration = a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 30;
    return { id: current ? current.id : null, playing, loading: playing && loading, time: a && current ? a.currentTime || 0 : 0, duration, error };
  }

  function emit() {
    const s = state();
    for (const fn of [...listeners]) {
      try {
        fn(s);
      } catch (err) {
        console.error('[music] a player listener failed:', err);
      }
    }
  }

  /** Pause other media on the page (Jarvis's natural voice and the previews of other tabs are not ours to touch). */
  function pauseOtherMedia() {
    if (typeof document === 'undefined') return;
    for (const el of document.querySelectorAll('audio, video')) {
      if (el === audio) continue;
      try {
        if (!el.paused) el.pause();
      } catch {
        /* ignore */
      }
    }
  }

  async function start(item) {
    const url = previewLink(item && item.previewUrl);
    if (!url) return { ok: false, reason: 'no-preview' };
    const allowed = safeCall(canStart, true);
    if (allowed !== true) return { ok: false, reason: allowed === 'listening' ? 'listening' : 'blocked' };
    safeCall(onStart);
    pauseOtherMedia();
    const a = ensureAudio();
    clearTimeout(fadeTimer);
    a.volume = 1;
    const id = `${item.type}:${item.id}`;
    if (!current || current.url !== url) {
      current = { id, url };
      error = null;
      a.src = url;
      try {
        a.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
    }
    loading = true;
    emit();
    try {
      await a.play();
      loading = false;
      emit();
      return { ok: true };
    } catch (err) {
      loading = false;
      if (err && err.name === 'AbortError') return { ok: false, reason: 'blocked' };
      error = err && err.name === 'NotAllowedError' ? 'blocked' : 'error';
      emit();
      return { ok: false, reason: error };
    }
  }

  function pause() {
    if (audio && !audio.paused) audio.pause();
    emit();
  }

  /** Stop with a short fade (polite: no click), rewound to the start. */
  function stop() {
    const a = audio;
    if (!a || a.paused) {
      emit();
      return;
    }
    clearTimeout(fadeTimer);
    const from = a.volume;
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / FADE_MS);
      try {
        a.volume = Math.max(0, from * (1 - k));
      } catch {
        /* ignore */
      }
      if (k < 1) {
        fadeTimer = setTimeout(step, 30);
        return;
      }
      a.pause();
      try {
        a.currentTime = 0;
        a.volume = 1;
      } catch {
        /* ignore */
      }
      emit();
    };
    step();
  }

  return {
    toggle(item) {
      const id = item ? `${item.type}:${item.id}` : null;
      if (id && current && current.id === id && audio && !audio.paused) {
        pause();
        return Promise.resolve({ ok: true, paused: true });
      }
      return start(item);
    },
    play: (item) => start(item),
    pause,
    stop,
    /** The mic is about to listen: a preview playing now would be heard as speech. */
    pauseForMic() {
      if (audio && !audio.paused) audio.pause();
      emit();
    },
    seek(fraction) {
      if (!audio || !current) return;
      const d = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      if (d) audio.currentTime = Math.max(0, Math.min(d, d * fraction));
      emit();
    },
    isPlaying: () => state().playing,
    state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function safeCall(fn, fallback) {
  try {
    return typeof fn === 'function' ? fn() : fallback;
  } catch {
    return fallback;
  }
}
