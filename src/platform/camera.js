// The live camera for Optics (getUserMedia), and the single-frame screen look (getDisplayMedia).
//
//   cameraSupported() / screenLookSupported() -> boolean
//   cameraPermission() -> Promise<'granted'|'denied'|'prompt'|'unknown'>
//   createCamera({ video, onState }) -> camera
//     camera.start({ facing }) -> Promise<{ ok, error?: CameraError }>   call from a tap (iOS)
//     camera.flip() -> Promise<{ ok, error? }>      stops the old track first, then the other camera
//     camera.capture({ maxEdge, quality, previewEdge }) -> Promise<Frame>   the full, uncropped frame
//     camera.grabLuma(out) -> Uint8Array|null       a 64 px grayscale thumbnail for Watch
//     camera.stop(reason) / camera.destroy()
//     camera.state: 'off'|'starting'|'live'|'paused'|'error'   camera.facing: 'rear'|'front'|'camera'
//     camera.canFlip, camera.size { width, height }, camera.mirrored (front camera preview)
//   captureScreenFrame({ maxEdge, quality }) -> Promise<Frame>   asks, grabs one frame, stops at once
//   Frame = { data /* base64 JPEG */, mediaType, width, height, preview /* data:image/jpeg ≤ 480 px */,
//             canvas /* the full frame, for the frozen view */, source, capturedAt }
//
// Privacy rules (SPEC Optics): the camera runs only while Optics is open; it is released at once
// when the page is hidden or unloaded (visibilitychange, pagehide, freeze), and when a track ends
// (iOS stops capture for calls, Siri and the app switcher). It never restarts by itself on iOS:
// the owner taps to resume (a Home Screen app may ask for permission again after a relaunch).
// Frames are drawn through a canvas, so they carry no EXIF or location data.

import { fitLongEdge, lumaOf, OPTICS_LIMITS, WATCH_DEFAULTS } from '../lib/optics.js';
import { isIOS, isStandalone, parseUserAgent } from './env.js';

export class CameraError extends Error {
  /** code: 'denied' | 'no-camera' | 'busy' | 'insecure' | 'unsupported' | 'overconstrained' | 'aborted' | 'other' */
  constructor(code, message) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
  }
}

const MESSAGES = {
  denied: 'Camera access is blocked for Jarvis.',
  'no-camera': 'No camera was found on this device.',
  busy: 'The camera is in use by another app. Close it (a video call, the Camera app), then try again.',
  insecure: 'The camera needs a secure (https) connection.',
  unsupported: "This browser can't use the camera here.",
  overconstrained: 'That camera is not available.',
  aborted: 'The camera was stopped.',
  other: "The camera couldn't start. Try again.",
};

function md() {
  try {
    return globalThis.navigator && globalThis.navigator.mediaDevices ? globalThis.navigator.mediaDevices : null;
  } catch {
    return null;
  }
}

export function cameraSupported() {
  const m = md();
  return !!(m && typeof m.getUserMedia === 'function') && globalThis.isSecureContext !== false;
}

/** "Look at my screen": desktop browsers only (iOS has getDisplayMedia only from Safari on iOS 27). */
export function screenLookSupported() {
  const m = md();
  return !!(m && typeof m.getDisplayMedia === 'function') && !isIOS() && globalThis.isSecureContext !== false;
}

/** The camera permission without asking (the Permissions API; Safari answers 'unknown'). */
export async function cameraPermission() {
  try {
    const p = await globalThis.navigator.permissions.query({ name: 'camera' });
    return p && ['granted', 'denied', 'prompt'].includes(p.state) ? p.state : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** A getUserMedia / getDisplayMedia failure as a CameraError. */
export function classifyCameraError(err) {
  if (err instanceof CameraError) return err;
  const name = err && err.name;
  const code =
    name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied'
      : name === 'SecurityError' ? (globalThis.isSecureContext === false ? 'insecure' : 'denied')
        : name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'no-camera'
          : name === 'NotReadableError' || name === 'TrackStartError' ? 'busy'
            : name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError' ? 'overconstrained'
              : name === 'AbortError' ? 'aborted'
                : name === 'TypeError' ? 'unsupported'
                  : 'other';
  return new CameraError(code, MESSAGES[code]);
}

/**
 * How to allow the camera again on this platform (shown on the "camera is blocked" card).
 * Steps for menus we could not check on a device are worded generally. Returns { title, steps }.
 */
export function deniedHelp(ua = globalThis.navigator?.userAgent || '', { standalone = isStandalone(), touchPoints = globalThis.navigator?.maxTouchPoints || 0 } = {}) {
  const { os, browser } = parseUserAgent(ua, touchPoints);
  if (os === 'ios' && standalone) {
    return { title: 'Allow the camera for Jarvis', steps: ['Open Settings › Apps › Safari › Camera and choose Ask or Allow.', 'Close Jarvis from the app switcher and open it again.', 'Tap Look, then tap Allow when iOS asks.'] };
  }
  if (os === 'ios') {
    return { title: 'Allow the camera in Safari', steps: ['Tap aA (or the page menu) in the address bar.', 'Choose Website Settings › Camera › Allow.', 'Tap Try again.'] };
  }
  if (os === 'android') {
    return { title: 'Allow the camera in your browser', steps: ['Tap the icon at the left of the address bar.', 'Open Permissions › Camera and choose Allow.', 'Tap Try again.'] };
  }
  if (browser === 'safari') {
    return { title: 'Allow the camera in Safari', steps: ['Choose Safari › Settings for This Website.', 'Set Camera to Allow.', 'Click Try again.'] };
  }
  return {
    title: 'Allow the camera in your browser',
    steps: ['Click the camera or site-settings icon at the left of the address bar and allow the camera.', os === 'mac' ? 'If it is still blocked: System Settings › Privacy & Security › Camera, and turn your browser on.' : 'If it is still blocked, check your system camera privacy settings.', 'Click Try again.'],
  };
}

// ---------------------------------------------------------------------------------------------
// Encoding helpers

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function context2d(canvas, opts) {
  const ctx = canvas.getContext('2d', opts);
  if (!ctx) throw new CameraError('other', MESSAGES.other);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/** Frees a canvas's backing store at once (iOS caps total canvas memory). */
export function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function toBase64Jpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    const fallback = () => {
      try {
        const url = canvas.toDataURL('image/jpeg', quality);
        resolve(url.slice(url.indexOf(',') + 1));
      } catch (err) {
        reject(err);
      }
    };
    if (typeof canvas.toBlob !== 'function') return fallback();
    canvas.toBlob((blob) => {
      if (!blob) return fallback();
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || '');
        resolve(url.slice(url.indexOf(',') + 1).replace(/\s+/g, ''));
      };
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(blob);
    }, 'image/jpeg', quality);
  });
}

function previewOf(canvas, edge, quality) {
  const size = fitLongEdge(canvas.width, canvas.height, edge);
  const out = newCanvas(size.width, size.height);
  context2d(out).drawImage(canvas, 0, 0, size.width, size.height);
  let url = '';
  try {
    url = out.toDataURL('image/jpeg', quality);
  } catch {
    url = '';
  }
  releaseCanvas(out);
  return url;
}

/** Draws `source` (a playing video) at its long edge ≤ maxEdge and encodes the frame. */
async function frameFrom(source, srcW, srcH, { maxEdge, quality, previewEdge = OPTICS_LIMITS.previewMaxEdge, previewQuality = OPTICS_LIMITS.previewQuality, origin }) {
  if (!srcW || !srcH) throw new CameraError('other', 'The camera has no picture yet.');
  const { width, height } = fitLongEdge(srcW, srcH, maxEdge);
  const canvas = newCanvas(width, height);
  context2d(canvas).drawImage(source, 0, 0, width, height);
  const data = await toBase64Jpeg(canvas, quality);
  const preview = previewOf(canvas, previewEdge, previewQuality);
  return { data, mediaType: 'image/jpeg', width, height, preview, canvas, source: origin, capturedAt: Date.now() };
}

// ---------------------------------------------------------------------------------------------
// The live camera

const FACING_MODE = { rear: 'environment', front: 'user' };
const facingOf = (mode) => (mode === 'user' ? 'front' : mode === 'environment' ? 'rear' : null);

/**
 * @param {{ video: HTMLVideoElement, onState?: (state: string, info: object) => void }} o
 */
export function createCamera({ video, onState } = {}) {
  if (!video) throw new TypeError('createCamera needs a <video>');
  // iOS: inline playback (no full-screen takeover) and muted autoplay.
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;

  let stream = null;
  let state = 'off';
  let facing = 'rear';
  let deviceId = '';
  let devices = [];
  let starting = null;
  let lumaCanvas = null;
  let lumaCtx = null;
  let lumaBuf = null;
  const listeners = [];

  const emit = (next, info = {}) => {
    state = next;
    try {
      onState && onState(next, { facing, ...info });
    } catch (err) {
      console.error('[jarvis] camera onState failed:', err);
    }
  };

  function stopTracks() {
    if (stream) {
      for (const t of stream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    stream = null;
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.srcObject = null;
  }

  // Auto-off: never capture in the background (released well within 500 ms of hiding).
  const onHidden = () => {
    if (stream && document.visibilityState === 'hidden') pause('hidden');
  };
  const onPageHide = () => {
    if (stream) pause('hidden');
  };
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn);
    listeners.push(() => target.removeEventListener(type, fn));
  };
  listen(document, 'visibilitychange', onHidden);
  listen(window, 'pagehide', onPageHide);
  listen(document, 'freeze', onPageHide);

  function pause(reason) {
    stopTracks();
    emit('paused', { reason });
  }

  async function listDevices() {
    try {
      devices = (await md().enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch {
      devices = [];
    }
    return devices;
  }

  async function open(constraints) {
    // resizeMode 'none' (ideal): the camera's own frame, never a browser crop toward 1280×720 (a crop
    // would hide part of the scene; Safari ignores it and rotates frames to the screen itself).
    const s = await md().getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, resizeMode: { ideal: 'none' }, ...constraints }, audio: false });
    const track = s.getVideoTracks()[0];
    if (!track) {
      s.getTracks().forEach((t) => t.stop());
      throw new CameraError('no-camera', MESSAGES['no-camera']);
    }
    return s;
  }

  async function attach(s, wanted) {
    stream = s;
    const track = s.getVideoTracks()[0];
    const settings = track.getSettings ? track.getSettings() : {};
    deviceId = settings.deviceId || '';
    facing = facingOf(settings.facingMode) || wanted || 'camera';
    track.addEventListener('ended', () => {
      if (stream === s) pause('ended');
    });
    track.addEventListener('mute', () => {
      if (stream === s) emit('live', { interrupted: true });
    });
    track.addEventListener('unmute', () => {
      if (stream === s) emit('live', { interrupted: false });
    });
    video.srcObject = s;
    try {
      await video.play();
    } catch {
      /* autoplay with muted+playsinline normally works; the frames still arrive */
    }
    if (!video.videoWidth) {
      await new Promise((resolve) => {
        const done = () => {
          video.removeEventListener('loadedmetadata', done);
          resolve();
        };
        video.addEventListener('loadedmetadata', done);
        setTimeout(done, 1500);
      });
    }
    await listDevices();
    emit('live', { width: video.videoWidth, height: video.videoHeight });
  }

  async function start({ facing: wanted = facing } = {}) {
    if (!cameraSupported()) {
      const error = new CameraError(globalThis.isSecureContext === false ? 'insecure' : 'unsupported', MESSAGES.unsupported);
      emit('error', { error });
      return { ok: false, error };
    }
    if (starting) return starting;
    if (stream) return { ok: true };
    emit('starting');
    starting = (async () => {
      try {
        const mode = FACING_MODE[wanted];
        let s;
        try {
          s = await open(mode ? { facingMode: { ideal: mode } } : {});
        } catch (err) {
          if (classifyCameraError(err).code !== 'overconstrained') throw err;
          s = await open({}); // any camera at all
        }
        await attach(s, wanted === 'camera' ? null : wanted);
        return { ok: true };
      } catch (err) {
        const error = classifyCameraError(err);
        stopTracks();
        emit('error', { error });
        return { ok: false, error };
      } finally {
        starting = null;
      }
    })();
    return starting;
  }

  /** The other camera: facingMode first (phones), then the next device (desktops, test rigs). */
  async function flip() {
    if (!stream) return { ok: false, error: new CameraError('aborted', MESSAGES.aborted) };
    if ((devices.length || (await listDevices()).length) < 2) return { ok: false, error: new CameraError('overconstrained', 'This device has only one camera.') };
    const want = facing === 'front' ? 'rear' : 'front';
    const previousId = deviceId;
    stopTracks(); // iOS cannot open a second camera while one is running
    emit('starting', { flipping: true });
    try {
      let s = null;
      try {
        s = await open({ facingMode: { exact: FACING_MODE[want] } });
        const got = s.getVideoTracks()[0]?.getSettings?.().deviceId;
        if (got && got === previousId) {
          s.getTracks().forEach((t) => t.stop());
          s = null;
        }
      } catch (err) {
        if (!['overconstrained', 'no-camera'].includes(classifyCameraError(err).code)) throw err;
      }
      if (!s) {
        const others = devices.filter((d) => d.deviceId && d.deviceId !== previousId);
        const next = others[0];
        if (!next) throw new CameraError('overconstrained', 'This device has only one camera.');
        s = await open({ deviceId: { exact: next.deviceId } });
      }
      await attach(s, want);
      return { ok: true };
    } catch (err) {
      const error = classifyCameraError(err);
      // Put the previous camera back.
      try {
        await attach(await open(previousId ? { deviceId: { exact: previousId } } : {}), facing);
      } catch {
        emit('error', { error });
      }
      return { ok: false, error };
    }
  }

  async function capture({ maxEdge = OPTICS_LIMITS.lookMaxEdge, quality = OPTICS_LIMITS.jpegQuality, previewEdge } = {}) {
    if (!stream || state !== 'live') throw new CameraError('aborted', MESSAGES.aborted);
    return frameFrom(video, video.videoWidth, video.videoHeight, { maxEdge, quality, previewEdge, origin: facing });
  }

  /** A small grayscale thumbnail of the current frame (Watch), reusing one canvas and buffer. */
  function grabLuma(maxEdge = WATCH_DEFAULTS.thumbW) {
    if (!stream || state !== 'live' || !video.videoWidth) return null;
    const { width, height } = fitLongEdge(video.videoWidth, video.videoHeight, maxEdge);
    if (!lumaCanvas) lumaCanvas = newCanvas(width, height);
    if (lumaCanvas.width !== width || lumaCanvas.height !== height) {
      lumaCanvas.width = width;
      lumaCanvas.height = height;
      lumaCtx = null;
    }
    if (!lumaCtx) lumaCtx = context2d(lumaCanvas, { willReadFrequently: true });
    lumaCtx.drawImage(video, 0, 0, width, height);
    const px = lumaCtx.getImageData(0, 0, width, height).data;
    if (!lumaBuf || lumaBuf.length !== width * height) lumaBuf = new Uint8Array(width * height);
    return lumaOf(px, lumaBuf);
  }

  /** Watch runs at a lower frame rate to save battery (best effort; restored when it ends). */
  async function setLowPower(on) {
    const track = stream && stream.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function') return;
    try {
      await track.applyConstraints({ frameRate: on ? { ideal: 15, max: 15 } : { ideal: 30, max: 30 } });
    } catch {
      /* not every camera can change its rate */
    }
  }

  return {
    start,
    flip,
    capture,
    grabLuma,
    setLowPower,
    stop(reason = 'closed') {
      const was = !!stream;
      stopTracks();
      if (was || state !== 'off') emit('off', { reason });
    },
    destroy() {
      stopTracks();
      for (const off of listeners.splice(0)) off();
      releaseCanvas(lumaCanvas);
      lumaCanvas = null;
      state = 'off';
    },
    get state() {
      return state;
    },
    get live() {
      return !!stream && state === 'live';
    },
    get facing() {
      return facing;
    },
    get mirrored() {
      return facing === 'front';
    },
    get canFlip() {
      return devices.length >= 2;
    },
    get size() {
      return { width: video.videoWidth || 0, height: video.videoHeight || 0 };
    },
    get trackCount() {
      return stream ? stream.getTracks().filter((t) => t.readyState === 'live').length : 0;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// "Look at my screen" (desktop): ask, grab one frame, stop the capture at once.

export async function captureScreenFrame({ maxEdge = OPTICS_LIMITS.screenMaxEdge, quality = 0.85 } = {}) {
  if (!screenLookSupported()) throw new CameraError('unsupported', "Screen looks need Chrome, Edge, Firefox or Safari on a computer.");
  let stream;
  try {
    stream = await md().getDisplayMedia({ video: { frameRate: { ideal: 5, max: 10 } }, audio: false });
  } catch (err) {
    const e = classifyCameraError(err);
    if (e.code === 'denied') throw new CameraError('denied', 'Screen sharing was cancelled or blocked.');
    throw e;
  }
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  try {
    video.srcObject = stream;
    await video.play().catch(() => {});
    await new Promise((resolve) => {
      const ready = () => (video.videoWidth ? resolve() : setTimeout(ready, 50));
      if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(() => resolve());
      ready();
      setTimeout(resolve, 3000);
    });
    return await frameFrom(video, video.videoWidth, video.videoHeight, { maxEdge, quality, origin: 'screen' });
  } finally {
    for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
  }
}

/** Platform facts for the integration note and tests (no side effects). */
export function cameraPlatform(ua = globalThis.navigator?.userAgent || '') {
  const { os, browser } = parseUserAgent(ua, globalThis.navigator?.maxTouchPoints || 0);
  return { os, browser, standalone: isStandalone(), autoResume: os !== 'ios' };
}
