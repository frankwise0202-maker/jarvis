// A fake microphone for the Standby scenarios (an init script: page.addInitScript(installFakeMic,
// options)). navigator.mediaDevices.getUserMedia returns a real MediaStream fed by an AudioContext
// in the page, so the app's real capture path (its AudioWorklet, resampler, clap detector and the
// "Hey Jarvis" worker) hears exactly what the test plays:
//
//   window.__fakeMic.play(samples, rate = 16000)   Promise, resolved when the sound has played
//   window.__fakeMic.gets / .live / .stops / .log  getUserMedia calls, live tracks now, tracks stopped
//   window.__fakeMic.standby                       live tracks asked for raw sound (echoCancellation
//                                                  false): the Standby listener's (Voice Mode's mic
//                                                  bands on a computer ask for processed sound)
//   window.__fakeMic.constraints                   the last getUserMedia constraints
//   window.__fakeMic.overlaps                      speech recognition started while the Standby capture
//                                                  was live (must stay 0: "never two captures at once")
//   options: { deny: true } refuses permission; { wakeLock: true } records screen wake locks in
//   window.__fakeMic.locks (request/release counts) with a stand-in navigator.wakeLock.
export function installFakeMic(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const mic = { gets: 0, live: 0, standby: 0, stops: 0, log: [], constraints: null, overlaps: 0, locks: { requests: 0, releases: 0, held: 0 } };
  window.__fakeMic = mic;
  let ctx = null;
  let dest = null;
  const ensure = () => {
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: 48000 });
      dest = ctx.createMediaStreamDestination();
      // A whisper of noise, like a real room: the detector's floor has something to track.
      const noise = ctx.createBuffer(1, 48000, 48000);
      const d = noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < d.length; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        d[i] = ((seed / 4294967296) * 2 - 1) * 0.0008;
      }
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.connect(dest);
      src.start();
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return ctx;
  };
  const md = navigator.mediaDevices || {};
  md.getUserMedia = async (constraints) => {
    mic.gets += 1;
    mic.constraints = constraints || null;
    mic.log.push(['get', Math.round(performance.now())]);
    if (opts.deny) throw new DOMException('Permission denied', 'NotAllowedError');
    ensure();
    const raw = !!(constraints && constraints.audio && constraints.audio.echoCancellation === false);
    const stream = new MediaStream(dest.stream.getAudioTracks().map((t) => t.clone()));
    for (const track of stream.getAudioTracks()) {
      mic.live += 1;
      if (raw) mic.standby += 1;
      const stop = track.stop.bind(track);
      track.stop = () => {
        if (track.readyState === 'live') {
          mic.live -= 1;
          if (raw) mic.standby -= 1;
          mic.stops += 1;
          mic.log.push(['stop', Math.round(performance.now())]);
        }
        stop();
      };
    }
    return stream;
  };
  if (!navigator.mediaDevices) {
    try {
      Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
    } catch {
      /* ignore */
    }
  }
  mic.play = (samples, rate = 16000) => {
    ensure();
    const data = samples instanceof Float32Array ? samples : Float32Array.from(samples);
    const buf = ctx.createBuffer(1, data.length, rate);
    buf.getChannelData(0).set(data);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    return new Promise((resolve) => {
      src.onended = () => resolve(true);
      src.start();
    });
  };
  // "Never two captures at once": speech recognition must find the Standby microphone released.
  const patchRecognition = () => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R || !R.prototype || R.prototype.__micPatched) return;
    const start = R.prototype.start;
    R.prototype.start = function patchedStart(...args) {
      if (mic.standby > 0) mic.overlaps += 1;
      return start.apply(this, args);
    };
    R.prototype.__micPatched = true;
  };
  patchRecognition();
  document.addEventListener('DOMContentLoaded', patchRecognition);
  if (opts.wakeLock) {
    const wl = {
      request: async () => {
        mic.locks.requests += 1;
        mic.locks.held += 1;
        const listeners = new Set();
        const sentinel = {
          released: false,
          release: async () => {
            if (sentinel.released) return;
            sentinel.released = true;
            mic.locks.releases += 1;
            mic.locks.held -= 1;
            for (const fn of listeners) fn();
          },
          addEventListener: (type, fn) => {
            if (type === 'release') listeners.add(fn);
          },
          removeEventListener: (type, fn) => listeners.delete(fn),
        };
        return sentinel;
      },
    };
    try {
      Object.defineProperty(navigator, 'wakeLock', { value: wl, configurable: true });
    } catch {
      /* ignore */
    }
  }
}
