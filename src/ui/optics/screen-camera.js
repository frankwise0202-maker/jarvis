// Screens × Optics (v7): the live camera on a screen. "Put the camera on my other screen", "float the
// camera" (or "this" while Optics is open) shows what the camera sees in the screen's HUD frame: on
// another monitor, in a floating panel beside the owner's work, or in its own window. It is a view:
// Look, Watch and the pinned labels stay in Optics on the main screen.
//
//   createCameraScreenPanel({ win, frame, compact, deps }) -> { el, update, getState, destroy }
//   deps.onCameraState(state): the camera's state as it changes (live | starting | paused | off |
//   error), so the main window's OPTICS indicator says LIVE only while it runs
//   (src/ui/screens/panels.js uses it for the 'camera' kind, in a screen window and in the floating
//   panel alike; phones show Optics itself instead.)
//
// The camera is the one the owner chose last in Optics on this device (settings opticsCameraId /
// opticsCameraLabel), else the default one; a camera that faces the owner is previewed mirrored, as in
// Optics. Optics' privacy rules hold here too: the camera runs only while the panel's window is
// visible (a floating panel is a window of its own, shown while the app's tab may be hidden), the
// frame's status says LIVE in the live color while it runs, "Camera off" stops it, and closing the
// screen releases it. On a computer it comes back by itself when the window is shown again.
//
// Test hooks: [data-testid="screen-camera"] data-state (starting | live | paused | off | error) and
// data-mirrored; the deck's screen-camera-toggle; the card's screen-camera-start.

import { h, setText } from '../dom.js';
import { icon } from '../icons.js';
import { cameraPlatform, createCamera } from '../../platform/camera.js';
import { getSettings } from '../../platform/settings.js';

/** The camera the owner chose last in Optics on this device, or null (the default camera). */
function rememberedCamera() {
  try {
    const s = getSettings();
    return s.opticsCameraId || s.opticsCameraLabel ? { id: s.opticsCameraId || '', label: s.opticsCameraLabel || '' } : null;
  } catch {
    return null;
  }
}

/** The camera's name for the header, as Optics shows it: "LOGITECH WEBCAM", "MACBOOK CAMERA", "BACK". */
function cameraWord(camera) {
  const cam = camera.current;
  if (cam && cam.name && (cam.known || !camera.phone)) return cam.name.toUpperCase();
  return camera.facing === 'front' ? 'FRONT' : camera.facing === 'rear' ? 'BACK' : 'CAMERA';
}

export function createCameraScreenPanel({ win = window, frame, compact = false, deps = {} } = {}) {
  const report = deps && typeof deps.onCameraState === 'function' ? deps.onCameraState : null;
  const video = h('video', { class: 'scr-camera__video', attrs: { 'data-testid': 'screen-camera-video', 'aria-hidden': 'true' } });
  const cardTitle = h('p', { class: 'scr-msg__main' });
  const cardText = h('p', { class: 'scr-msg__sub' });
  const startLabel = h('span', { text: 'Turn on camera' });
  const startBtn = h('button', { class: 'scr-btn scr-btn--primary', type: 'button', attrs: { 'data-testid': 'screen-camera-start' }, on: { click: () => start() } }, icon('camera', { size: 18 }), startLabel);
  const card = h('div', { class: 'scr-msg scr-camera__card', attrs: { role: 'status' } }, cardTitle, cardText, h('div', { class: 'scr-camera__actions' }, startBtn));
  const el = h(
    'div',
    { class: ['scr-camera', compact && 'scr-camera--compact'], attrs: { 'data-testid': 'screen-camera', 'data-state': 'starting', 'data-mirrored': 'false' } },
    h('div', { class: 'scr-camera__stage' }, video),
    card,
  );
  const toggleText = h('span', { text: 'Camera off' });
  // Live: "Camera off" (an eye struck through); off: "Camera on" (the camera). Icon only when compact.
  const offIcon = h('span', { class: 'scr-camera__icon' }, icon('eye-off', { size: 18 }));
  const onIcon = h('span', { class: 'scr-camera__icon', hidden: true }, icon('camera', { size: 18 }));
  const toggle = h(
    'button',
    { class: ['scr-tool', !compact && 'scr-tool--text'], type: 'button', attrs: { 'data-testid': 'screen-camera-toggle' }, on: { click: () => (camera.live || camera.state === 'starting' ? stop() : start()) } },
    offIcon,
    onIcon,
    compact ? null : toggleText,
  );
  frame.deck.append(h('div', { class: 'scr-tools' }, toggle));
  frame.showDeck(true);

  let destroyed = false;
  let resumeOnVisible = false;
  const camera = createCamera({
    video,
    win,
    preferred: rememberedCamera,
    // Nothing is under way here (no Look, no Watch): a camera plugged in is followed at once.
    allowAutoSwitch: () => true,
    onState: (state, info) => render(state, info || {}),
    onSwitch: () => render(camera.state, {}),
  });

  function showCard(title, text, button) {
    card.hidden = false;
    setText(cardTitle, title);
    setText(cardText, text || '');
    cardText.hidden = !text;
    startBtn.hidden = !button;
    if (button) setText(startLabel, button);
  }

  function render(state, info) {
    if (destroyed) return;
    el.dataset.state = state;
    if (report) {
      try {
        report(state);
      } catch {
        /* the indicator is optional */
      }
    }
    el.dataset.mirrored = camera.mirrored ? 'true' : 'false';
    const on = state === 'live' || state === 'starting';
    setText(toggleText, on ? 'Camera off' : 'Camera on');
    offIcon.hidden = !on;
    onIcon.hidden = on;
    toggle.setAttribute('aria-label', on ? 'Turn the camera off' : 'Turn the camera on');
    toggle.title = on ? 'Turn the camera off' : 'Turn the camera on';
    if (state === 'live') {
      card.hidden = true;
      frame.setStatus('LIVE', 'rec');
      frame.setDetail(cameraWord(camera));
      frame.setState('ready');
      return;
    }
    frame.setDetail('');
    if (state === 'starting') {
      frame.setStatus('STARTING', 'idle');
      showCard('Starting the camera…', '', '');
    } else if (state === 'paused') {
      frame.setStatus('PAUSED', 'idle');
      resumeOnVisible = info.reason === 'hidden' && cameraPlatform().autoResume;
      showCard('Camera paused', info.reason === 'ended' ? 'The camera was interrupted (another app or a call).' : 'Jarvis turns the camera off whenever this window is hidden.', 'Resume camera');
    } else if (state === 'error') {
      frame.setStatus('NO CAMERA', 'warn');
      const message = info.error && info.error.message ? info.error.message : 'The camera couldn’t start.';
      showCard(message, info.error && info.error.code === 'denied' ? 'Allow the camera for Jarvis in your browser, then try again.' : '', 'Try again');
    } else {
      frame.setStatus('OFF', 'idle');
      showCard('Camera off', 'Nothing is captured while it is off.', 'Turn on camera');
    }
    frame.setState('ready');
  }

  // Shown again (a computer): the camera comes back by itself, as in Optics. iPhone waits for a tap.
  const doc = win.document;

  // A camera that arrives after Camera off, closing, or its window being hidden (getUserMedia can
  // take a moment) is released by createCamera itself (paused 'hidden' in the last case).
  function start() {
    if (destroyed) return;
    resumeOnVisible = false;
    camera.start().catch(() => {});
  }

  function stop() {
    if (destroyed) return;
    resumeOnVisible = false;
    camera.stop('owner');
  }

  const onVisible = () => {
    if (!destroyed && resumeOnVisible && doc.visibilityState === 'visible') start();
  };
  doc.addEventListener('visibilitychange', onVisible);

  render('starting', {});
  start();

  return {
    el,
    update() {},
    getState: () => ({ camera: camera.state }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      doc.removeEventListener('visibilitychange', onVisible);
      try {
        camera.destroy();
      } catch {
        /* already released */
      }
    },
  };
}
