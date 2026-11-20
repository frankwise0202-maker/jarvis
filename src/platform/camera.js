// The live camera for Optics (getUserMedia), and the single-frame screen look (getDisplayMedia).
//
//   cameraSupported() / screenLookSupported() -> boolean
//   cameraPermission() -> Promise<'granted'|'denied'|'prompt'|'unknown'>
//   createCamera({ video, onState, onDevices, onSwitch, preferred, allowAutoSwitch }) -> camera
//     camera.start({ facing?, deviceId?, label? }) -> Promise<{ ok, error?: CameraError }>   call from
//                                                   a tap (iOS); with no arguments: the remembered
//                                                   camera (preferred()), else the default
//     camera.flip() -> Promise<{ ok, error? }>      stops the old track first, then the other camera
//                                                   (front ↔ back on a phone, the next one on a computer)
//     camera.select(deviceId) -> Promise<{ ok, error? }>   the camera picked in the list
//     camera.cameras / camera.current               every camera (src/lib/cameras.js), the one in use
//     hot-plug (devicechange): the list refreshes (onDevices); the camera in use unplugged falls back
//                                                   to the remembered or built-in one, and the
//                                                   remembered one plugged in is switched to (onSwitch)
//     camera.capture({ maxEdge, quality, previewEdge }) -> Promise<Frame>   the full, uncropped frame
//     camera.grabLuma(out) -> Uint8Array|null       a 64 px grayscale thumbnail for Watch
//     camera.stop(reason) / camera.destroy()
//     camera.state: 'off'|'starting'|'live'|'paused'|'error'   camera.facing: 'rear'|'front'|'camera'
//     camera.canFlip, camera.size { width, height }, camera.mirrored (the preview of a camera that
//     faces the owner: a phone's front camera or a computer's webcam; captured frames never are)
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
import { isPhoneOs, listCameras, pickCamera, hotplugPlan } from '../lib/cameras.js';
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
const MISSING = ['overconstrained', 'no-camera'];

function platformOs() {
  try {
    return parseUserAgent(globalThis.navigator?.userAgent || '', globalThis.navigator?.maxTouchPoints || 0).os;
  } catch {
    return 'other';
  }
}

/**
 * @param {object} o
 * @param {HTMLVideoElement} o.video
 * @param {(state: string, info: object) => void} [o.onState]   'starting' | 'live' | 'paused' | 'error' | 'off'
 * @param {(cameras: object[]) => void} [o.onDevices]          the camera list changed (the picker)
 * @param {(e: { why: 'unplugged'|'plugged', from, to }) => void} [o.onSwitch]
 *                                         the camera changed by itself: the one in use was
 *                                         unplugged (falls back to the remembered or built-in
 *                                         camera), or the remembered camera was plugged in
 * @param {() => ({ id, label }|null)} [o.preferred]  the owner's remembered camera (local settings)
 * @param {() => boolean} [o.allowAutoSwitch]  false while switching would get in the way (Watch)
 * @param {string} [o.os]                  parseUserAgent's os (tests); phones flip front/back
 */
export function createCamera({ video, onState, onDevices, onSwitch, preferred, allowAutoSwitch, os } = {}) {
  if (!video) throw new TypeError('createCamera needs a <video>');
  // iOS: inline playback (no full-screen takeover) and muted autoplay.
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;

  const osName = os || platformOs();
  const phone = isPhoneOs(osName);
  let stream = null;
  let state = 'off';
  let facing = phone ? 'rear' : 'camera';
  let deviceId = '';
  let cameras = []; // listCameras(): every videoinput, described, in picker order
  // The list the hot-plug plan compares with: set when a camera goes live and by each devicechange
  // refresh, never by other listings (the picker opening, Flip). A listing in flight while a camera
  // is plugged in already holds it; were it the baseline, the plug-in would go unnoticed.
  let known = [];
  let current = null; // the described camera in use
  let starting = null;
  let chain = Promise.resolve(); // device changes run one at a time
  let destroyed = false;
  let refreshTimer = 0;
  let lumaCanvas = null;
  let lumaCtx = null;
  let lumaBuf = null;
  const listeners = [];

  const call = (fn, ...args) => {
    try {
      return typeof fn === 'function' ? fn(...args) : undefined;
    } catch (err) {
      console.error('[jarvis] camera callback failed:', err);
      return undefined;
    }
  };
  const emit = (next, info = {}) => {
    state = next;
    call(onState, next, { facing, camera: current, ...info });
  };
  const serial = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
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
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn);
    listeners.push(() => target.removeEventListener(type, fn));
  };
  listen(document, 'visibilitychange', onHidden);
  listen(window, 'pagehide', onPageHide);
  listen(document, 'freeze', onPageHide);
  // Hot-plug: a camera plugged in or out (bursts of events: refresh once they settle).
  listen(md(), 'devicechange', () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => serial(() => refresh()), 250);
  });

  function pause(reason) {
    stopTracks();
    emit('paused', { reason });
  }

  /** The camera list (labels once the owner has allowed the camera), described for the picker. */
  async function listDevices() {
    let raw = [];
    try {
      raw = (await md().enumerateDevices()).filter((d) => d && d.kind === 'videoinput');
    } catch {
      raw = [];
    }
    const plain = raw.map((d) => {
      let hint = null;
      try {
        const caps = typeof d.getCapabilities === 'function' ? d.getCapabilities() : null;
        hint = caps && Array.isArray(caps.facingMode) && caps.facingMode.length ? caps.facingMode[0] : null;
      } catch {
        hint = null;
      }
      return { kind: 'videoinput', deviceId: d.deviceId || '', groupId: d.groupId || '', label: d.label || '', facing: hint };
    });
    cameras = listCameras(plain, { os: osName });
    current = cameras.find((c) => c.id && c.id === deviceId) || current;
    return cameras;
  }

  function notifyDevices() {
    call(onDevices, cameras.slice());
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
    track.addEventListener('ended', () => {
      if (stream === s) serial(() => trackEnded(s));
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
    current = null;
    await listDevices();
    known = cameras;
    current = cameras.find((c) => c.id && c.id === deviceId) || null;
    // Phones say which way a camera faces; a computer's webcam faces the owner but says nothing.
    facing = facingOf(settings.facingMode) || (current && current.facing) || (phone ? wanted || 'rear' : 'camera');
    notifyDevices();
    emit('live', { width: video.videoWidth, height: video.videoHeight });
  }

  async function start({ facing: wanted, deviceId: wantId = '', label: wantLabel = '' } = {}) {
    if (!cameraSupported()) {
      const error = new CameraError(globalThis.isSecureContext === false ? 'insecure' : 'unsupported', MESSAGES.unsupported);
      emit('error', { error });
      return { ok: false, error };
    }
    if (starting) return starting;
    if (stream) return { ok: true };
    emit('starting');
    starting = serial(async () => {
      try {
        const remembered = wantId || wantLabel ? { id: wantId, label: wantLabel } : call(preferred) || null;
        let s = null;
        // 1. The camera chosen last, by its id (ids stay the same for this site once it was allowed).
        if (remembered && remembered.id && !wanted) {
          try {
            s = await open({ deviceId: { exact: remembered.id } });
          } catch (err) {
            if (!MISSING.includes(classifyCameraError(err).code)) throw err;
            s = null;
          }
        }
        // 2. Else the phone's back camera (or the side asked for), or the computer's default camera.
        if (!s) {
          const mode = FACING_MODE[wanted || (phone ? 'rear' : '')];
          try {
            s = await open(mode ? { facingMode: { ideal: mode } } : {});
          } catch (err) {
            if (classifyCameraError(err).code !== 'overconstrained') throw err;
            s = await open({}); // any camera at all
          }
        }
        await attach(s, wanted || null);
        // 3. Its id changed (site data cleared, another browser) but its name did not: switch to it.
        if (remembered && !wanted && (remembered.id || remembered.label)) {
          const pick = pickCamera(cameras, remembered, { os: osName });
          if (pick && pick.by === 'label' && pick.camera.id && pick.camera.id !== deviceId) await switchTo(pick.camera.id);
        }
        return { ok: true };
      } catch (err) {
        const error = classifyCameraError(err);
        stopTracks();
        emit('error', { error });
        return { ok: false, error };
      }
    }).finally(() => {
      starting = null;
    });
    return starting;
  }

  /** Stops the camera in use, then opens `id` (iOS cannot run two cameras); puts the old one back on failure. */
  async function switchTo(id, { wanted = null } = {}) {
    const previousId = deviceId;
    stopTracks();
    emit('starting', { switching: true });
    try {
      await attach(await open({ deviceId: { exact: id } }), wanted);
      return { ok: true };
    } catch (err) {
      const error = classifyCameraError(err);
      try {
        const back = previousId && previousId !== id && cameras.some((c) => c.id === previousId) ? { deviceId: { exact: previousId } } : {};
        await attach(await open(back), facing);
      } catch {
        emit('error', { error });
      }
      return { ok: false, error };
    }
  }

  /** The camera the owner picked in the list. When the camera is off or paused, it starts with that one. */
  function select(id) {
    if (!id) return Promise.resolve({ ok: false, error: new CameraError('overconstrained', MESSAGES.overconstrained) });
    if (!stream) return start({ deviceId: id });
    if (id === deviceId) return Promise.resolve({ ok: true });
    return serial(() => switchTo(id));
  }

  /**
   * The camera in use stopped. Unplugged (it left the list): fall back to the remembered camera if
   * it is there, else the built-in one, and say so. Taken by the system (iOS: a call, Siri, the app
   * switcher): pause until the owner taps.
   */
  async function trackEnded(s) {
    if (stream !== s || destroyed) return;
    const gone = current;
    const goneId = deviceId;
    const after = await listDevices();
    notifyDevices();
    if (stream !== s || destroyed) return;
    const pick = goneId && !after.some((c) => c.id === goneId) ? pickCamera(after.filter((c) => c.id !== goneId), call(preferred), { os: osName }) : null;
    if (!pick) {
      pause('ended');
      return;
    }
    const res = await switchTo(pick.camera.id);
    if (res.ok) call(onSwitch, { why: 'unplugged', from: gone, to: current });
    else pause('ended');
  }

  /** After a devicechange: refresh the list; follow the hot-plug plan while the camera is on. */
  async function refresh() {
    if (destroyed) return;
    const before = known;
    const after = await listDevices();
    known = after;
    notifyDevices();
    if (!stream || destroyed || state !== 'live') return;
    const plan = hotplugPlan({ before, after, currentId: deviceId, remembered: call(preferred) || null, os: osName });
    if (plan.action === 'fallback' && plan.to) {
      const res = await switchTo(plan.to.id);
      if (res.ok) call(onSwitch, { why: 'unplugged', from: plan.gone, to: current });
    } else if (plan.action === 'switch' && plan.to && call(allowAutoSwitch) !== false) {
      const from = current;
      const res = await switchTo(plan.to.id);
      if (res.ok) call(onSwitch, { why: 'plugged', from, to: current });
    }
  }

  /** The other camera: front ↔ back on a phone; the next camera in the list on a computer. */
  async function flip() {
    if (!stream) return { ok: false, error: new CameraError('aborted', MESSAGES.aborted) };
    if ((cameras.length || (await listDevices()).length) < 2) return { ok: false, error: new CameraError('overconstrained', 'This device has only one camera.') };
    return serial(async () => {
      if (!phone) {
        const i = cameras.findIndex((c) => c.id === deviceId);
        const next = cameras[(i + 1) % cameras.length];
        if (!next || next.id === deviceId) return { ok: false, error: new CameraError('overconstrained', 'This device has only one camera.') };
        return switchTo(next.id);
      }
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
          if (!MISSING.includes(classifyCameraError(err).code)) throw err;
        }
        if (!s) {
          // No facing information (some Android browsers, test rigs): a camera on the other side by
          // its name, else the next one in the list.
          const side = cameras.filter((c) => c.id && c.id !== previousId && (c.facing === want || !c.facing));
          const next = side.find((c) => c.facing === want) || side[0];
          if (!next) throw new CameraError('overconstrained', 'This device has only one camera.');
          s = await open({ deviceId: { exact: next.id } });
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
    });
  }

  async function capture({ maxEdge = OPTICS_LIMITS.lookMaxEdge, quality = OPTICS_LIMITS.jpegQuality, previewEdge } = {}) {
    if (!stream || state !== 'live') throw new CameraError('aborted', MESSAGES.aborted);
    // Drawn from the video itself, never from the (mirrored) preview: the frame is what the camera
    // sees, so text in it reads the right way round and left is left.
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
    select,
    capture,
    grabLuma,
    setLowPower,
    /** Lists the cameras again (the picker opening): resolves to the list. */
    refreshDevices: () => listDevices().then((list) => (notifyDevices(), list)),
    stop(reason = 'closed') {
      const was = !!stream;
      stopTracks();
      if (was || state !== 'off') emit('off', { reason });
    },
    destroy() {
      destroyed = true;
      clearTimeout(refreshTimer);
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
    /** 'rear' | 'front' on phones; 'camera' for a computer's webcam (no facing reported). */
    get facing() {
      return facing;
    },
    /**
     * The preview is shown mirrored, like a mirror, for a camera that faces the owner: a phone's
     * front camera, or a computer's webcam. Captured frames are never mirrored.
     */
    get mirrored() {
      return facing === 'front' || (!phone && facing === 'camera');
    },
    get canFlip() {
      return cameras.length >= 2;
    },
    /** Every camera this device has (described: { id, name, detail, facing, kind, label }), picker order. */
    get cameras() {
      return cameras.slice();
    },
    /** The camera in use (described), or null. */
    get current() {
      return current;
    },
    get deviceId() {
      return deviceId;
    },
    get phone() {
      return phone;
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
