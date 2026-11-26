// The Standby microphone (page side): getUserMedia → an AudioContext → the Standby AudioWorklet
// (assets/wake-worklet.js: 16 kHz, the clap detector, frames for the "Hey Jarvis" worker), or a
// ScriptProcessor running the same code on the page where AudioWorklet is missing.
//
//   const cap = createStandbyCapture({ onClap, onState, processed, device, onRelease });
//                            processed (v7.7, hearing through the home base): ask the browser for its
//                            processed sound (echo cancellation, noise suppression, auto gain), as for a
//                            call; Standby's detectors keep the raw sound (the default)
//                            device (v8.1, Settings → Voice → Microphone and speaker): () -> { id, processing }
//                            | null, asked at each start: the microphone (deviceId exact; '' = the default)
//                            and its echo cancellation, noise suppression and auto gain; null = as before.
//                            A chosen microphone that isn't there (NotFoundError, OverconstrainedError) falls
//                            back to the default one (state info and cap.device say fellBack: true) instead
//                            of 'no-mic'
//                            onRelease({ id, label }) (v8.1): the microphone was let go (a Bluetooth one makes
//                            George wait a moment: the speakerphone switches back to its music mode)
//   cap.prepare()            inside a tap: create/resume the AudioContext (iOS starts audio only there)
//   await cap.start({ clap, sensitivity, word })  -> { ok: true } | { ok: false, reason }
//                            reason: 'unsupported' | 'denied' | 'no-mic' | 'busy' | 'error'
//   cap.wordPort()           a MessagePort that receives the 80 ms frames (give it to the worker);
//                            null when not listening
//   cap.configure({ clap, sensitivity, word })
//   cap.stop()               release the microphone (its tracks stop: the browser's mic indicator goes
//                            off); the AudioContext stays for the next start (no tap needed then)
//   cap.close()              everything
//   cap.state                'off' | 'starting' | 'live' | 'error'; cap.live: a track is live now
//   cap.device               v8.1: the live track's microphone { id, label, fellBack }, or null
//
// Nothing is recorded: the audio exists only as it flows through the detector and, with the wake
// word on, the worker's models. Echo cancellation, noise suppression and auto gain are asked off
// (raw sound is what both detectors were made for).

import { WAKE_WORKLET_PATH } from '../../lib/wake/catalog.js';
import { createWakeTap } from '../../lib/wake/tap.js';
import { audioConstraints } from '../../lib/audio-devices.js';

const RAW = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const PROCESSED = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

export function createStandbyCapture({ scope = globalThis, workletUrl = WAKE_WORKLET_PATH, onClap = () => {}, onState = () => {}, processed = false, device = null, onRelease = null } = {}) {
  let ctx = null;
  let moduleReady = null; // Promise of addModule (per context)
  let stream = null;
  let source = null;
  let node = null; // AudioWorkletNode or ScriptProcessorNode
  let sink = null; // a silent GainNode to the destination (keeps the graph pulled)
  let tap = null; // the ScriptProcessor fallback's tap (page thread)
  let channel = null; // MessageChannel: port1 → the worklet, port2 → the worker
  let cfg = { clap: true, sensitivity: 'normal', word: false };
  let state = 'off';
  let gen = 0; // a start that is overtaken by stop() is undone
  let fellBack = false; // v8.1: the chosen microphone wasn't there: the default one listens

  /** v8.1: the microphone asked for (Settings → Voice → Microphone and speaker), or null: as before. */
  function wanted() {
    if (typeof device !== 'function') return null;
    try {
      const w = device();
      return w && typeof w === 'object' ? w : null;
    } catch {
      return null;
    }
  }

  function audioRequest(want) {
    if (!want) return { ...(processed ? PROCESSED : RAW), channelCount: { ideal: 1 } };
    return audioConstraints(want.id ? { id: want.id } : null, want.processing || (processed ? PROCESSED : RAW));
  }

  const Ctor = () => scope.AudioContext || scope.webkitAudioContext || null;

  function setState(next, info = {}) {
    state = next;
    try {
      onState({ state: next, ...info });
    } catch (err) {
      console.error('[jarvis] standby capture listener failed:', err);
    }
  }

  function supported() {
    try {
      return !!(scope.navigator && scope.navigator.mediaDevices && typeof scope.navigator.mediaDevices.getUserMedia === 'function' && Ctor());
    } catch {
      return false;
    }
  }

  /** In a tap: the AudioContext exists and runs (iOS lets audio start only inside a gesture). */
  function prepare() {
    const C = Ctor();
    if (!C) return false;
    try {
      if (!ctx || ctx.state === 'closed') {
        ctx = new C({ latencyHint: 'playback' });
        moduleReady = null;
      }
      const p = ctx.resume && ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  async function start(next = {}) {
    cfg = { ...cfg, ...pick(next) };
    if (!supported()) {
      setState('error', { reason: 'unsupported' });
      return { ok: false, reason: 'unsupported' };
    }
    stop({ quiet: true });
    const my = ++gen;
    setState('starting');
    if (!ctx || ctx.state === 'closed') prepare();
    let media;
    const audio = audioRequest(wanted());
    fellBack = false;
    try {
      media = await scope.navigator.mediaDevices.getUserMedia({ audio, video: false });
    } catch (err) {
      let failure = err;
      let name = String((err && err.name) || '');
      if (my === gen && audio.deviceId && (name === 'NotFoundError' || name === 'OverconstrainedError')) {
        // v8.1: the chosen microphone isn't there (unplugged, turned off): the default one listens meanwhile.
        const { deviceId, ...rest } = audio;
        try {
          media = await scope.navigator.mediaDevices.getUserMedia({ audio: rest, video: false });
          fellBack = true;
          failure = null;
        } catch (err2) {
          failure = err2;
          name = String((err2 && err2.name) || '');
        }
      }
      if (failure) {
        if (my !== gen) return { ok: false, reason: 'stopped' };
        const reason = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no-mic' : name === 'NotReadableError' || name === 'AbortError' ? 'busy' : 'error';
        setState('error', { reason });
        return { ok: false, reason };
      }
    }
    if (my !== gen) {
      stopTracks(media);
      return { ok: false, reason: 'stopped' };
    }
    stream = media;
    try {
      if (ctx.state !== 'running') {
        const p = ctx.resume && ctx.resume();
        if (p && typeof p.then === 'function') await Promise.race([p.catch(() => {}), wait(800)]);
      }
      source = ctx.createMediaStreamSource(stream);
      sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(ctx.destination);
      channel = typeof scope.MessageChannel === 'function' ? new scope.MessageChannel() : null;
      if (ctx.audioWorklet && typeof scope.AudioWorkletNode === 'function') {
        if (!moduleReady) moduleReady = ctx.audioWorklet.addModule(new URL(workletUrl, scope.location ? scope.location.href : undefined).href);
        await moduleReady;
        if (my !== gen) return { ok: false, reason: 'stopped' };
        node = new scope.AudioWorkletNode(ctx, 'jarvis-wake', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 1,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
          processorOptions: { clap: cfg.clap, sensitivity: cfg.sensitivity, word: cfg.word },
        });
        node.port.onmessage = (e) => {
          const msg = e.data || {};
          if (msg.type === 'clap') fireClap(msg);
        };
        if (channel) node.port.postMessage({ type: 'word-port' }, [channel.port1]);
      } else {
        // No AudioWorklet (old browsers): the same signal path on the page.
        node = ctx.createScriptProcessor(2048, 1, 1);
        tap = createWakeTap({
          inputRate: ctx.sampleRate,
          clap: cfg.clap,
          sensitivity: cfg.sensitivity,
          word: cfg.word,
          onClap: (ev) => fireClap(ev),
          onFrame: (frame) => {
            if (channel) channel.port1.postMessage({ type: 'frame', samples: frame }, [frame.buffer]);
          },
        });
        node.onaudioprocess = (e) => tap.push(e.inputBuffer.getChannelData(0));
      }
      source.connect(node);
      node.connect(sink);
    } catch (err) {
      console.warn('[jarvis] standby listener failed:', err);
      if (my === gen) {
        stop({ quiet: true });
        setState('error', { reason: 'error' });
      }
      return { ok: false, reason: 'error' };
    }
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (stream && stream.getAudioTracks().includes(track) && state === 'live') {
          stop({ quiet: true });
          setState('off', { reason: 'ended' });
        }
      });
    }
    setState('live', fellBack ? { fellBack: true } : {});
    return fellBack ? { ok: true, fellBack: true } : { ok: true };
  }

  function fireClap(ev) {
    if (state !== 'live') return;
    try {
      onClap({ gapMs: ev.gapMs, levels: ev.levels });
    } catch (err) {
      console.error('[jarvis] clap handler failed:', err);
    }
  }

  function pick(o) {
    const out = {};
    if (typeof o.clap === 'boolean') out.clap = o.clap;
    if (typeof o.sensitivity === 'string') out.sensitivity = o.sensitivity;
    if (typeof o.word === 'boolean') out.word = o.word;
    return out;
  }

  function configure(next = {}) {
    cfg = { ...cfg, ...pick(next) };
    if (node && node.port) node.port.postMessage({ type: 'config', clap: cfg.clap, sensitivity: cfg.sensitivity, word: cfg.word });
    if (tap) tap.configure(cfg);
  }

  /** The worker's end of the frames channel (once per start; null when not listening). */
  function wordPort() {
    if (!channel) return null;
    const p = channel.port2;
    channel = { port1: channel.port1, port2: null };
    return p;
  }

  function stopTracks(s) {
    try {
      for (const t of s.getTracks()) t.stop();
    } catch {
      /* gone */
    }
  }

  function stop({ quiet = false } = {}) {
    gen++;
    if (node) {
      try {
        if (node.port) node.port.postMessage({ type: 'stop' });
      } catch {
        /* gone */
      }
      try {
        node.disconnect();
      } catch {
        /* not connected */
      }
      if (node.onaudioprocess) node.onaudioprocess = null;
    }
    if (source) {
      try {
        source.disconnect();
      } catch {
        /* not connected */
      }
    }
    if (sink) {
      try {
        sink.disconnect();
      } catch {
        /* not connected */
      }
    }
    if (channel) {
      try {
        if (channel.port1) channel.port1.close();
        if (channel.port2) channel.port2.close();
      } catch {
        /* closed */
      }
    }
    let released = null;
    if (stream) {
      released = trackInfo(stream);
      stopTracks(stream);
    }
    node = source = sink = tap = channel = stream = null;
    if (released && typeof onRelease === 'function') {
      try {
        onRelease(released);
      } catch {
        /* decoration */
      }
    }
    const was = state;
    state = 'off';
    if (!quiet && was !== 'off') setState('off');
  }

  /** v8.1: the live track's microphone: { id, label, fellBack }. */
  function trackInfo(s) {
    try {
      const t = s && s.getAudioTracks()[0];
      if (!t) return null;
      let id = '';
      try {
        id = String((t.getSettings && t.getSettings().deviceId) || '');
      } catch {
        id = '';
      }
      return { id, label: String(t.label || ''), fellBack };
    } catch {
      return null;
    }
  }

  function close() {
    stop();
    if (ctx) {
      try {
        const p = ctx.close();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* closed */
      }
    }
    ctx = null;
    moduleReady = null;
  }

  return {
    supported,
    prepare,
    start,
    configure,
    wordPort,
    stop,
    close,
    get state() {
      return state;
    },
    get live() {
      return !!stream && stream.getAudioTracks().some((t) => t.readyState === 'live');
    },
    get device() {
      return stream ? trackInfo(stream) : null;
    },
    get context() {
      return ctx;
    },
  };
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
