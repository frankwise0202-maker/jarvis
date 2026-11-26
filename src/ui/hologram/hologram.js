// The 3D hologram renderer: a glowing, see-through, labeled model built from a show_hologram spec
// (src/lib/hologram-spec.js) with three.js. Lazy-loaded as its own chunk (it pulls in three);
// the viewer chrome around it is viewer.js.
//
//   const holo = createHologram(container, { onSelect, onState, labels: true, autoRotate: true });
//   holo.updateSpec(draft)            // while the tool input streams: parts materialize as they arrive
//   holo.setSpec(spec)                // final (or saved) spec; returns { spec, warnings, stats, ok }
//   holo.explode(1) / holo.explode(0) // animated exploded view (t in 0..1; second arg false = instant)
//   holo.select(id) / focus(id) / isolate(id | null) / setView('top') / resetView()
//   holo.setLabels(on) / autoRotate(on) / setInsets({ top, right, bottom, left })
//   holo.snapshot({ width, height })  // small PNG data URL for the saved library
//   await holo.settled(ms)            // every hull and panel shows its final mesh (before a snapshot)
//   holo.listParts() / getPart(id) / getState() / dispose()
//   Walkthroughs (SPEC §29.2): holo.setEmphasis({ glow, ghost, hide, others }) / labelsFor(ids) /
//   await holo.flyTo({ ids, frame, view | dir }) / holdAutoRotate(on), and holo.tourTarget(): the
//   one object a tour player drives (contract (e), see tourTarget below)
//
// Look: translucent additive fills with a fresnel rim, crisp edge lines, depth fade, a scan band
// and fine scan rows, a projector floor, tone colors; the selected part glows and the rest dims.
// In a walkthrough step the parts it is about glow and pulse, the case is a see-through ghost
// (edges kept, fill gone) and everything else steps back. Without an emphasis the look is as before.
// Labels are HTML (textContent only) with SVG leaders, decluttered by label-layout.js.
//
// Realistic shapes (format v2): lofts, soft boxes and smooth lathes are built at once (smooth.js);
// hull bodies and the panels on them are meshed in a worker (hull-service.js): a coarse mesh first,
// then the fine one, each swapped in without restarting the part's materialize sweep; the camera
// frames the model when its first geometry lands. Detail follows a triangle budget: smooth shapes
// get coarser after 300k and 600k triangles (and when small in the model), and past 600k new hulls
// and panels stay at their coarse mesh (detailFor in geometry.js). The model's size for both comes from the spec so far,
// rounded to half octaves, so a live build and a reopened hologram tessellate alike. Option
// hullWorker: the worker script URL, or null to mesh on the main thread.
//
// Cost control: renders on demand only (interaction, tweens, the materialize sweep, auto-rotate at
// up to 30 fps), sleeps while the page is hidden, the view is off-screen or covered by an inert
// overlay; DPR capped at 2. WebGL context loss pauses it with a notice and it recovers on restore
// (or the owner taps Restart). dispose() frees every geometry, material and the GL context.
// The container may live in another same-origin document (a Screens floating panel, Document
// Picture-in-Picture): elements, frames, visibility and observers then come from that document's
// window, so it keeps rendering while the app's own tab is hidden.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { normalizeHologramSpec, specBounds, DEFAULT_VIEW } from '../../lib/hologram-spec.js';
import { budgetLevel, buildShapeChunk, detailFor, hasDetailLevels, mergeChunks, sizeLevel } from './geometry.js';
import { hullJobsPending, hullStats, hullWorkerActive, onHullGeometry, quantizeScale, setHullWorkerUrl } from './hull-service.js';
import { layoutLabels } from './label-layout.js';
import { BG_FS, BG_VS, FILL_FS, FILL_VS, FLOOR_FS, FLOOR_VS, LINE_FS, LINE_VS } from './shaders.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEG = Math.PI / 180;
const BASE_FOV = 32; // degrees, vertical, for the visible canvas
const MAX_DPR = 2;
const REVEAL_S = 0.75; // materialize sweep per shape
const EXPLODE_MS = 950;
const CAMERA_MS = 750;
const AUTO_ROTATE_DEG_S = 7;
const AUTO_ROTATE_RESUME_MS = 7000;
const AUTO_ROTATE_MAX_MS = 120000; // idle auto-rotation stops after 2 minutes without interaction (battery)
const IDLE_FPS = 30;
const TAP_SLOP_MOUSE = 5;
const TAP_SLOP_TOUCH = 10;
const LABEL_AREA = 34000; // px² of view per label while assembled
const LABEL_AREA_EXPLODED = 15000; // ...and when fully exploded (a 1440×900 view fits ~50, a phone ~13)
const MIN_LABELS = 8;
const MAX_LABEL_COST = 300; // a label that would need a longer, model-covering leader is hidden instead
// Walkthroughs (setEmphasis): a ghost keeps its edges and loses most of its fill (fill = edges ×
// GHOST_FILL / GHOST_EDGES), parts the step is not about step back, and a glow stops pulsing
// after a while (frames are on demand again; the glow stays).
const GHOST_EDGES = 0.5;
const GHOST_FILL = 0.1;
const OTHERS_LEVEL = 0.15;
const PULSE_MAX_MS = 120000;
// flyTo 'access': the way the part comes out, turned up to this many degrees towards the model's
// own starting view: a low three-quarter view, never flat along an axis (a battery that comes out
// downwards is seen from about 25° below, in front).
const ACCESS_TURN = 65;
const POLE = 0.6; // degrees: the camera stops this far from straight up or down (as the top and bottom views)
// A case part by name (only for a hologram that marks no part tone "secondary"): one of these
// words, not followed by another word it describes ("Bottom cover", "Fan housing", "Palm rest (C
// cover)"; not "Case fan", "Lid switch" or "CAN bus").
const SHELL_NAME = /\b(?:cover|case|casing|housing|shell|lid|cowl|cowling|can|sleeve)s?\b(?!\s+[a-z])/i;

// Tone -> [r, g, b] (sRGB 0..1; shaders work directly in display space), fill and line strength.
const TONES = {
  primary: { color: [0.243, 0.878, 1.0], fill: 0.2, line: 0.6 },
  secondary: { color: [0.22, 0.58, 1.0], fill: 0.1, line: 0.4 },
  accent: { color: [0.62, 0.96, 1.0], fill: 0.26, line: 0.85 },
  warning: { color: [1.0, 0.69, 0.27], fill: 0.26, line: 0.8 },
};

// Camera presets: [azimuth theta (deg, 0 = from +z/right, 90 = from +x/front), polar phi (deg from +y)].
export const VIEW_ANGLES = {
  front: [90, 80],
  back: [-90, 80],
  right: [0, 80],
  left: [180, 80],
  top: [0, 0.6],
  bottom: [0, 179.4],
  'front-left': [135, 66],
  'front-right': [45, 66],
  'back-left': [-135, 66],
  'back-right': [-45, 66],
};

const NOOP = () => {};

// Per-part values eased frame by frame towards their goals: [current, goal].
const EASED = [
  ['vis', 'visGoal'],
  ['fillK', 'fillKGoal'],
  ['sel', 'selGoal'],
  ['hov', 'hovGoal'],
  ['pulse', 'pulseGoal'],
];

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function wrapAngle(a) {
  const TAU = Math.PI * 2;
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

function niceStep(x) {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/** The direction from the model towards a camera at azimuth theta and polar angle phi (radians). */
function dirOfAngles(theta, phi) {
  const sp = Math.sin(phi);
  return [sp * Math.sin(theta), Math.cos(phi), sp * Math.cos(theta)];
}

/**
 * Camera angles [theta, phi] (radians) for looking from direction `d` ([x, y, z] from the model
 * towards the camera, in the spec's axes: +x front, +y up, +z right), or null when `d` is no
 * direction. Never quite straight up or down; a direction straight up or down keeps azimuth `theta`.
 */
export function anglesOfDir(d, theta = 0) {
  if (!Array.isArray(d) || d.length !== 3 || !d.every((v) => Number.isFinite(v))) return null;
  const len = Math.hypot(d[0], d[1], d[2]);
  if (!(len > 1e-9)) return null;
  const phi = Math.min(180 - POLE, Math.max(POLE, Math.acos(Math.max(-1, Math.min(1, d[1] / len))) / DEG)) * DEG;
  return [Math.hypot(d[0], d[2]) > len * 1e-9 ? Math.atan2(d[0], d[2]) : theta, phi];
}

/**
 * Where to look from to see a part come out (flyTo 'access'): `out` is the way it moves when the
 * model explodes; the camera turns from there up to ACCESS_TURN° towards the model's own starting
 * view `view` (all the way when that view is closer), so a battery that comes out downwards is seen
 * from below and in front, and a keyboard that lifts off from the usual view. Null when `out` is no
 * direction.
 */
export function accessAngles(out, view = DEFAULT_VIEW) {
  const a = VIEW_ANGLES[view] || VIEW_ANGLES[DEFAULT_VIEW];
  let v = dirOfAngles(a[0] * DEG, a[1] * DEG);
  const len = Array.isArray(out) ? Math.hypot(out[0], out[1], out[2]) : 0;
  if (!(len > 1e-9)) return null;
  const n = [out[0] / len, out[1] / len, out[2] / len];
  let cos = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  if (cos < -0.999999) {
    // straight away from the view: turn through the top instead
    v = [v[0], v[1] + 0.25, v[2]];
    const l = Math.hypot(v[0], v[1], v[2]);
    v = v.map((x) => x / l);
    cos = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  }
  const w = Math.acos(Math.max(-1, Math.min(1, cos)));
  if (w < 1e-6) return anglesOfDir(n, a[0] * DEG);
  const turn = Math.min(w, ACCESS_TURN * DEG);
  const kn = Math.sin(w - turn) / Math.sin(w);
  const kv = Math.sin(turn) / Math.sin(w);
  return anglesOfDir([0, 1, 2].map((k) => n[k] * kn + v[k] * kv), a[0] * DEG);
}

/**
 * The case parts of a hologram (setEmphasis ghost 'shells'), as a Set of part ids: the parts toned
 * "secondary" (what show_hologram asks for housings, shells and body panels), or by name in a
 * hologram that marks none (SHELL_NAME, on the name or another name). The tone wins when there is
 * one: by name alone a truck's transfer case (a gearbox) would count.
 */
export function shellIdsOf(parts) {
  const list = Array.isArray(parts) ? parts.filter(Boolean) : [];
  const toned = list.some((p) => p.tone === 'secondary');
  const ids = new Set();
  for (const p of list) {
    const names = [p.name, ...(Array.isArray(p.aka) ? p.aka : [])];
    if (toned ? p.tone === 'secondary' : names.some((n) => SHELL_NAME.test(String(n || '')))) ids.add(p.id);
  }
  return ids;
}

function watchMedia(query, fn, win = window) {
  let mq = null;
  try {
    mq = win.matchMedia ? win.matchMedia(query) : null;
  } catch {
    mq = null;
  }
  if (!mq) return { matches: false, off: NOOP };
  const handler = () => fn(mq.matches);
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler);
  return {
    get matches() {
      return mq.matches;
    },
    off() {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else if (mq.removeListener) mq.removeListener(handler);
    },
  };
}

// One observer serves every live hologram: re-check "covered" whenever an `inert` attribute changes.
const coverListeners = new Set();
let coverObserver = null;
function watchCover(fn) {
  coverListeners.add(fn);
  if (!coverObserver && typeof MutationObserver === 'function') {
    try {
      coverObserver = new MutationObserver(() => {
        for (const l of Array.from(coverListeners)) l();
      });
      coverObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['inert'] });
    } catch {
      coverObserver = null;
    }
  }
  return () => {
    coverListeners.delete(fn);
    if (!coverListeners.size && coverObserver) {
      coverObserver.disconnect();
      coverObserver = null;
    }
  };
}

function el(tag, className, text, doc = document) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @param {HTMLElement} container  the hologram fills it (give it a size; it is position: relative)
 * @param {object} [options]
 *   onSelect(partId|null, part|null)  selection changed (tap, label tap or select()/focus())
 *   onState(state)                    any visible state changed (coalesced per microtask)
 *   labels (true), autoRotate (true unless reduced motion), reveal (true): materialize animation
 *   rotateAfterMs: start the idle auto-rotation this long after opening (default: at once)
 *   insets { top, right, bottom, left } px covered by the viewer's own toolbars
 *   maxDpr (2), antialias (true): MSAA; the pixel ratio also drops on its own (down to 1) when a
 *   device cannot keep about 21 fps while animating
 */
export function createHologram(container, options = {}) {
  const o = {
    onSelect: NOOP,
    onState: NOOP,
    labels: true,
    autoRotate: undefined,
    reveal: true,
    insets: null,
    maxDpr: MAX_DPR,
    ...options,
  };
  if (o.hullWorker !== undefined) setHullWorkerUrl(o.hullWorker);

  // ---------------------------------------------------------------------------------------------
  // DOM (in the container's document: another window's when the hologram floats in a panel)

  const doc = (container && container.ownerDocument) || document;
  const win = doc.defaultView || window;
  const foreign = win !== window; // a time base of its own: frames are timed with this window's clock
  const mk = (tag, className, text) => el(tag, className, text, doc);
  const root = mk('div', 'holo');
  // `let`: after a context loss the browser never restores, "Restart 3D view" needs a fresh canvas
  // (a canvas whose context is lost can't give a new one).
  let canvas = mk('canvas', 'holo__canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Hologram');
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'holo__leaders');
  svg.setAttribute('aria-hidden', 'true');
  const labelsEl = mk('div', 'holo__labels');
  labelsEl.setAttribute('aria-hidden', 'true');
  const notice = mk('div', 'holo__notice');
  notice.hidden = true;
  const noticeText = mk('p', 'holo__notice-text');
  const noticeBtn = mk('button', 'holo__notice-btn', 'Restart 3D view');
  noticeBtn.type = 'button';
  noticeBtn.hidden = true;
  notice.append(noticeText, noticeBtn);
  root.append(canvas, svg, labelsEl, notice);
  container.append(root);

  // ---------------------------------------------------------------------------------------------
  // Renderer

  let renderer = null;
  function makeRenderer() {
    const r = new WebGLRenderer({ canvas, antialias: o.antialias !== false, alpha: false, depth: false, stencil: false, powerPreference: 'default', preserveDrawingBuffer: false });
    r.setClearColor(0x02060b, 1);
    r.autoClear = true;
    return r;
  }
  try {
    renderer = makeRenderer();
  } catch {
    renderer = null;
  }
  if (!renderer) {
    noticeText.textContent = 'This device could not start the 3D view.';
    notice.hidden = false;
    queueMicrotask(() => o.onState({ ready: false, error: 'webgl' }));
    return noopController(root);
  }

  const scene = new Scene();
  const cam = new PerspectiveCamera(BASE_FOV, 1, 1, 1e6);
  const model = new Group();
  scene.add(model);

  const shared = {
    uTime: { value: 0 },
    uReveal: { value: REVEAL_S },
    uFade: { value: new Vector2(1, 2) },
    uScanY: { value: 0 },
    uScanW: { value: 1 },
    uFlicker: { value: 1 },
    uRows: { value: 1 }, // fine scan rows (off for thumbnails: they compress badly)
  };

  // Background: one full-screen triangle.
  const bgGeo = new BufferGeometry();
  bgGeo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const bgMat = new ShaderMaterial({
    uniforms: { uRes: { value: new Vector2(1, 1) }, uCenter: { value: new Vector2(0.5, 0.5) } },
    vertexShader: BG_VS,
    fragmentShader: BG_FS,
    depthTest: false,
    depthWrite: false,
  });
  const bg = new Mesh(bgGeo, bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  // Projector floor.
  const floorGeo = new PlaneGeometry(1, 1);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new ShaderMaterial({
    uniforms: {
      uCell: { value: 1 },
      uR: { value: 1 },
      uColor: { value: new Vector3(0.24, 0.82, 1.0) },
      uTime: shared.uTime,
      uVis: { value: 0 },
      uGrid: { value: 1 },
      uFade: shared.uFade,
      uCenterW: { value: new Vector3() },
    },
    vertexShader: FLOOR_VS,
    fragmentShader: FLOOR_FS,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  let floorEnabled = true;
  const floor = new Mesh(floorGeo, floorMat);
  floor.frustumCulled = false;
  floor.renderOrder = -5;
  floor.visible = false;
  scene.add(floor);

  // ---------------------------------------------------------------------------------------------
  // State

  const records = new Map(); // key -> part record (see createRecord)
  let spec = null; // latest normalized spec
  let building = false;
  let finalSeen = false;
  let disposed = false;
  let contextLost = false;
  let width = 0;
  let height = 0;
  let dpr = 1;
  // Adaptive resolution: a device that cannot keep ~21 fps while animating gets a lower pixel
  // ratio (in 0.25 steps, never below 1). Measured from requestAnimationFrame pacing, which
  // includes GPU time, unlike timing renderer.render().
  let dprScale = 1;
  let paceSum = 0;
  let paceCount = 0;
  let insets = { top: 0, right: 0, bottom: 0, left: 0, ...(o.insets || {}) };

  const reducedMq = watchMedia('(prefers-reduced-motion: reduce)', () => {
    if (reducedMq.matches && !rotateRequested) autoRotateOn = false;
    updateVisGoals(); // a walkthrough's glow pulses only without reduced motion
    requestRender();
    emit();
  }, win);
  let labelsOn = o.labels !== false;
  // Reduced motion: no automatic rotation (even if the app asks for it at creation); an explicit
  // request from the owner later ("spin it", the Rotate button) is honored.
  let autoRotateOn = o.autoRotate !== false && !reducedMq.matches;
  let rotateRequested = false;

  // Orbit camera: target + spherical (radius, theta azimuth from +z towards +x, phi polar from +y).
  const orbit = { target: new Vector3(), radius: 10, theta: 135 * DEG, phi: 66 * DEG };
  let viewName = DEFAULT_VIEW;
  // { from, to, start, dur, track?, done? }: a flight (flyTo) or a move made while an explode is
  // under way has track() (its framing, frame by frame: the parts still move); a flight has done(how).
  let camTween = null;
  let fitMode = 'auto'; // 'auto': follows the model's bounds; 'user': the owner moved the camera; 'part': focused on parts
  let focusKeys = null; // fit mode 'part': the parts framed (a Set of keys)
  const inertia = { theta: 0, phi: 0 };
  // rotateAfterMs: idle auto-rotation starts that long after opening (the spec's own view first)
  let lastInteraction = o.rotateAfterMs > 0 ? performance.now() - AUTO_ROTATE_RESUME_MS + o.rotateAfterMs : -Infinity; // ms
  let rotateSince = performance.now(); // auto-rotation (re)started: opened, or asked to rotate
  let modelRadius = 1;

  let explodeT = 0;
  let explodeGoal = 0;
  let explodeAnim = null; // { from, to, start, dur, done: [resolve] }

  let cameraTouched = false; // the owner rotated, zoomed, panned or picked a view
  let appliedSpecView = null;
  let selectedKey = null;
  let hoverKey = null;
  let isolatedKey = null;
  let labelsHidden = 0;
  const prevSlots = new Map();
  // Walkthroughs: the step's emphasis (setEmphasis: Sets of part ids or keys; ghost 'shells' =
  // every case part), the parts whose labels may show (labelsFor), auto-rotation held off, and
  // whether a glowing part pulses (frames keep coming at the idle rate while it does).
  let emphasis = null; // { glow, ghost, shells, hide, others, since, pulse }
  let labelOnly = null;
  let rotateHeld = false;
  let pulseLive = false;

  const t0 = performance.now();
  const clock = () => (performance.now() - t0) / 1000;
  const counters = { frames: 0, shapesBuilt: 0, shapesRebuilt: 0, partsCreated: 0, labelMs: 0, hullUpgrades: 0, hullRescaled: 0, detailRebuilt: 0 };
  let lastBorn = -Infinity;

  // ---------------------------------------------------------------------------------------------
  // Parts

  function toneOf(tone) {
    return TONES[tone] || TONES.primary;
  }

  function makeMaterials(tone) {
    const t = toneOf(tone);
    const common = () => ({
      uColor: { value: new Vector3(...t.color) },
      uVis: { value: 1 },
      uSel: { value: 0 },
      uHover: { value: 0 },
      uPulse: { value: 0 },
      uTime: shared.uTime,
      uReveal: shared.uReveal,
      uFade: shared.uFade,
      uScanY: shared.uScanY,
      uScanW: shared.uScanW,
      uFlicker: shared.uFlicker,
      uRows: shared.uRows,
    });
    const base = { transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending };
    const fill = new ShaderMaterial({ ...base, side: DoubleSide, uniforms: { ...common(), uAlpha: { value: t.fill } }, vertexShader: FILL_VS, fragmentShader: FILL_FS });
    const line = new ShaderMaterial({ ...base, uniforms: { ...common(), uAlpha: { value: t.line } }, vertexShader: LINE_VS, fragmentShader: LINE_FS });
    return { fill, line };
  }

  function createRecord(part) {
    const group = new Group();
    group.name = part.id;
    const mats = makeMaterials(part.tone);
    const rec = {
      key: part.key,
      part,
      group,
      mats,
      fill: null,
      lines: null,
      chunks: [], // [{ sig, chunk }]
      born: [],
      box: null, // model-space { min: [], max: [] }
      center: new Vector3(),
      size: 0,
      autoOffset: new Vector3(),
      vis: 1, // edges (and the whole part)
      visGoal: 1,
      fillK: 1, // the fill's share of vis (a walkthrough's ghost keeps its edges, not its fill)
      fillKGoal: 1,
      sel: 0,
      selGoal: 0,
      hov: 0,
      hovGoal: 0,
      pulse: 0,
      pulseGoal: 0,
      label: null,
    };
    model.add(group);
    records.set(part.key, rec);
    counters.partsCreated++;
    createLabel(rec);
    return rec;
  }

  // The model's size: the diagonal of the spec so far, rounded to half octaves (so a model that grows
  // a little keeps it). A hull or panel is meshed at the size of the update that built it (every
  // hull of a model gets the same detail: the mesher's cells follow it) and small smooth details
  // are judged against it. When the finished spec is bigger than the first parts were (a truck's
  // cab, then its bed), finishPass() re-meshes what was built at a smaller size, so a live build
  // ends exactly like the same hologram reopened.
  function modelScale() {
    const b = spec ? specBounds(spec) : null;
    return b ? quantizeScale(Math.hypot(b.size[0], b.size[1], b.size[2])) : 0;
  }
  function hostsOf(partId) {
    for (const rec of records.values()) if (rec.part.id === partId) return rec.part.shapes.filter((sh) => sh.type === 'hull');
    return [];
  }
  /** The build context of one shape (see buildShapeChunk). */
  function shapeCtx(level, hullMode, scale) {
    return { level: level || 0, hullMode: hullMode || null, scale: scale || 0, hosts: hostsOf };
  }

  /** Triangles built so far (hulls and panels at the mesh they show now). */
  function builtTriangles() {
    let n = 0;
    for (const r of records.values()) for (const c of r.chunks) n += c.chunk.indices.length / 3;
    return n;
  }

  function setShapes(rec, shapes, bornAt, stagger, sizing) {
    const sigs = shapes.map((s) => JSON.stringify(s));
    let same = 0;
    while (same < rec.chunks.length && same < sigs.length && rec.chunks[same].sig === sigs[same]) same++;
    if (same === rec.chunks.length && same === sigs.length) return false;
    // keep the unchanged prefix (and its arrival times), build only the new shapes
    counters.shapesRebuilt += rec.chunks.length - same; // shapes replaced (never expected while streaming)
    rec.chunks.length = same;
    rec.born.length = same;
    const scale = sizing.size();
    for (let j = same; j < shapes.length; j++) {
      // the detail budget (geometry.js): coarser smooth shapes as triangles add up and for small
      // details, coarse-only hulls and panels past 600k
      const built = builtTriangles();
      const { level, hullMode } = detailFor(shapes[j], built, scale);
      const chunk = buildShapeChunk(shapes[j], shapeCtx(level, hullMode, scale));
      rec.chunks.push({ sig: sigs[j], chunk, lod: level, lodBudget: budgetLevel(built), scale, wait: null });
      counters.shapesBuilt++;
      const b = bornAt + stagger * (j - same);
      rec.born.push(b);
      if (b > lastBorn) lastBorn = b;
    }
    remerge(rec);
    return true;
  }

  // Meshes that land close together (the worker finishes many small panels in a row) are applied
  // in one pass: one merge per part, one camera refit.
  const landed = new Set();
  let landTimer = 0;
  function onHullLanded(key) {
    if (disposed) return;
    landed.add(key);
    if (!landTimer) landTimer = win.setTimeout(flushLanded, 30);
  }
  function flushLanded() {
    landTimer = 0;
    const keys = new Set(landed);
    landed.clear();
    onHullMesh(keys);
  }

  /** Hull or panel meshes got better (coarse, then fine): rebuild the chunks that use them. */
  function onHullMesh(keys) {
    if (disposed) return;
    const wasPending = asyncPending();
    let changed = false;
    let hadGeometry = false;
    for (const rec of records.values()) if (rec.box) hadGeometry = true;
    const now = clock();
    const animate = o.reveal !== false && !reducedMq.matches;
    for (const rec of records.values()) {
      let recChanged = false;
      rec.chunks.forEach((c, j) => {
        const shape = rec.part.shapes[j];
        if (!shape) return;
        if (c.wait && keys.has(c.wait.key)) {
          // re-meshed at the finished model's size: swapped in once it is there (no sweep replay)
          const next = buildShapeChunk(shape, shapeCtx(c.lod, c.wait.mode, c.wait.scale));
          if (next.level !== c.wait.level) return;
          const had = c.chunk.vertexCount || c.chunk.lineVertexCount;
          const has = next.vertexCount || next.lineVertexCount;
          if (had && !has) {
            c.wait = null; // the new mesh failed: keep the one that shows
            return;
          }
          if (!had && has) {
            rec.born[j] = animate ? now : -1e4;
            if (rec.born[j] > lastBorn) lastBorn = rec.born[j];
          }
          c.chunk = next;
          c.scale = c.wait.scale;
          c.wait = null;
          counters.hullRescaled++;
          recChanged = true;
          return;
        }
        if (!c.chunk.asyncKey || !keys.has(c.chunk.asyncKey) || c.chunk.done) return;
        const wasEmpty = !c.chunk.vertexCount && !c.chunk.lineVertexCount;
        const next = buildShapeChunk(shape, shapeCtx(c.lod, c.chunk.hullMode, c.scale));
        if (next.level === c.chunk.level && next.done === c.chunk.done) return;
        c.chunk = next;
        counters.hullUpgrades++;
        if (wasEmpty && (next.vertexCount || next.lineVertexCount)) {
          // first mesh of this shape: it materializes now (a later, finer one does not replay it)
          rec.born[j] = animate ? now : -1e4;
          if (rec.born[j] > lastBorn) lastBorn = rec.born[j];
        }
        recChanged = true;
      });
      if (recChanged) {
        remerge(rec);
        changed = true;
      }
    }
    if (changed) {
      computeAutoOffsets();
      updateFloor();
      // the first geometry of the model (it was all hulls, still meshing): frame it at once; a part
      // focused before its mesh landed is framed again now
      if (!hadGeometry && records.size && fitMode !== 'user') snapFit();
      else if (records.size && (fitMode === 'auto' || fitMode === 'part')) refit(true);
      requestRender();
      emit();
    } else if (wasPending && !asyncPending()) emit();
    if (!asyncPending()) resolveSettled();
  }
  const offHull = onHullGeometry(onHullLanded);

  /** Hulls and panels of this model: how many, still waiting, and with nothing to show (debug). */
  function asyncSummary() {
    const out = { hulls: 0, panels: 0, pending: 0, empty: 0, coarse: 0 };
    for (const rec of records.values()) {
      rec.chunks.forEach((c, j) => {
        if (!c.chunk.asyncKey) return;
        const type = rec.part.shapes[j] && rec.part.shapes[j].type;
        if (type === 'hull') out.hulls++;
        else out.panels++;
        if (!c.chunk.done) out.pending++;
        if (!c.chunk.vertexCount && !c.chunk.lineVertexCount) out.empty++;
        if (c.chunk.level === 'coarse') out.coarse++;
      });
    }
    return out;
  }

  /** Whether any hull or panel of this model still waits for its final mesh. */
  function asyncPending() {
    for (const rec of records.values()) for (const c of rec.chunks) if ((c.chunk.asyncKey && !c.chunk.done) || c.wait) return true;
    return false;
  }

  /**
   * The finished spec (a live build's last update): what was built while the model looked smaller
   * than it is gets the detail the same hologram has when reopened. Hulls and panels meshed at a
   * smaller size are meshed again at the final one (only the mesh they show now: fine, or coarse
   * past the budget), the old mesh showing until the new one lands; smooth shapes whose size class
   * changed are rebuilt at once.
   */
  function finishPass(scale) {
    if (!(scale > 0)) return;
    for (const rec of records.values()) {
      let recChanged = false;
      rec.chunks.forEach((c, j) => {
        const shape = rec.part.shapes[j];
        if (!shape) return;
        if (c.chunk.asyncKey) {
          if (c.scale === scale || (c.wait && c.wait.scale === scale)) return;
          const mode = c.chunk.hullMode === 'coarse' ? 'coarse' : 'fine';
          const next = buildShapeChunk(shape, shapeCtx(c.lod, mode, scale));
          if (next.level === mode && next.done) {
            c.chunk = next;
            c.scale = scale;
            c.wait = null;
            counters.hullRescaled++;
            recChanged = true;
          } else c.wait = { key: next.asyncKey, scale, mode, level: mode };
          return;
        }
        if (!hasDetailLevels(shape)) return;
        const level = Math.max(c.lodBudget || 0, sizeLevel(shape, scale));
        if (level === c.lod) return;
        c.chunk = buildShapeChunk(shape, shapeCtx(level, null, scale));
        c.lod = level;
        c.scale = scale;
        counters.detailRebuilt++;
        recChanged = true;
      });
      if (recChanged) remerge(rec);
    }
  }
  let settleWaiters = [];
  function resolveSettled() {
    const list = settleWaiters;
    settleWaiters = [];
    for (const fn of list) fn(true);
  }

  function remerge(rec) {
    const merged = mergeChunks(
      rec.chunks.map((c) => c.chunk),
      rec.born,
    );
    if (merged.fill) {
      if (rec.fill) {
        rec.fill.geometry.dispose();
        rec.fill.geometry = merged.fill;
      } else {
        rec.fill = new Mesh(merged.fill, rec.mats.fill);
        rec.fill.userData.rec = rec;
        rec.fill.frustumCulled = false;
        rec.group.add(rec.fill);
      }
    } else if (rec.fill) {
      rec.fill.geometry.dispose();
      rec.group.remove(rec.fill);
      rec.fill = null;
    }
    if (merged.lines) {
      if (rec.lines) {
        rec.lines.geometry.dispose();
        rec.lines.geometry = merged.lines;
      } else {
        rec.lines = new LineSegments(merged.lines, rec.mats.line);
        rec.lines.frustumCulled = false;
        rec.group.add(rec.lines);
      }
    } else if (rec.lines) {
      rec.lines.geometry.dispose();
      rec.group.remove(rec.lines);
      rec.lines = null;
    }
    rec.box = merged.box;
    rec.support = merged.support;
    if (rec.box) {
      const { min, max } = rec.box;
      rec.center.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      rec.size = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
    }
  }

  function disposeRecord(rec) {
    if (rec.fill) rec.fill.geometry.dispose();
    if (rec.lines) rec.lines.geometry.dispose();
    rec.mats.fill.dispose();
    rec.mats.line.dispose();
    model.remove(rec.group);
    if (rec.label) {
      rec.label.el.remove();
      rec.label.line.remove();
      rec.label.dot.remove();
    }
    prevSlots.delete(rec.key);
  }

  function setTone(rec, tone) {
    const t = toneOf(tone);
    rec.mats.fill.uniforms.uColor.value.set(...t.color);
    rec.mats.line.uniforms.uColor.value.set(...t.color);
    rec.mats.fill.uniforms.uAlpha.value = t.fill;
    rec.mats.line.uniforms.uAlpha.value = t.line;
  }

  function anchorOf(rec, out) {
    const a = rec.part.anchor;
    if (a) out.set(a[0], a[1], a[2]);
    else out.copy(rec.center);
    return out.add(rec.group.position);
  }

  // ---------------------------------------------------------------------------------------------
  // Spec application (diffed by part key: nothing already shown is rebuilt or flickers)

  function apply(next, { final }) {
    const firstParts = records.size === 0;
    spec = next;
    canvas.setAttribute('aria-label', next.title ? `Hologram of ${next.title}, ${next.parts.length} parts` : 'Hologram');
    const now = clock();
    const animate = o.reveal !== false && !reducedMq.matches;
    const seen = new Set();
    // A whole spec at once (saved or final without streaming) materializes part by part.
    const totalNew = next.parts.reduce((n, p) => n + (records.has(p.key) ? 0 : p.shapes.length), 0);
    const stagger = animate && totalNew > 1 && !building ? Math.min(0.045, 1.6 / totalNew) : 0;
    let cursor = animate ? now : -1e4;
    let changed = false;
    // the model's size for small details: worked out once per update, only when a shape is built
    let size = null;
    const sizing = { size: () => (size === null ? (size = modelScale()) : size) };
    for (const part of next.parts) {
      seen.add(part.key);
      let rec = records.get(part.key);
      if (!rec) {
        rec = createRecord(part);
        changed = true;
      } else {
        if (rec.part.tone !== part.tone) setTone(rec, part.tone);
        rec.part = part;
        rec.group.name = part.id;
      }
      updateLabelText(rec);
      if (part.shapes.length) {
        const before = rec.chunks.length;
        if (setShapes(rec, part.shapes, cursor, stagger, sizing)) changed = true;
        if (stagger) cursor += stagger * Math.max(0, part.shapes.length - before);
      }
    }
    if (final) {
      for (const [key, rec] of Array.from(records)) {
        if (!seen.has(key)) {
          disposeRecord(rec);
          records.delete(key);
          changed = true;
        }
      }
      finishPass(sizing.size());
      if (selectedKey && !records.has(selectedKey)) selectedKey = null;
      if (isolatedKey && !records.has(isolatedKey)) isolatedKey = null;
    }
    // The spec's starting view applies until the owner moves the camera (the view normally
    // streams before the parts; if it comes later it still applies, but never overrides them).
    const specView = next.view || DEFAULT_VIEW;
    if (firstParts && records.size) {
      setViewAngles(specView);
      appliedSpecView = specView;
      fitMode = 'auto';
    } else if (records.size && !cameraTouched && specView !== appliedSpecView) {
      appliedSpecView = specView;
      setView(specView, true, false);
    }
    computeAutoOffsets();
    updateFloor();
    if (changed && records.size) {
      if (firstParts) snapFit();
      else if (fitMode === 'auto') refit(true);
    }
    updateVisGoals();
    requestRender();
    emit();
    // the parts still meshing may have gone (a final spec without them): nothing left to wait for
    if (settleWaiters.length && !asyncPending()) resolveSettled();
  }

  function computeAutoOffsets() {
    // Parts without an explode offset move away from the model's center in the exploded view.
    const b = assembledBounds();
    if (!b) return;
    const c = new Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    const R = Math.max(1e-6, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2);
    for (const rec of records.values()) {
      if (rec.part.explode || !rec.box) {
        rec.autoOffset.set(0, 0, 0);
        continue;
      }
      const d = rec.center.clone().sub(c);
      const len = d.length();
      if (len < R * 0.05) rec.autoOffset.set(0, 0, 0);
      else rec.autoOffset.copy(d.multiplyScalar((R * 0.5) / len));
    }
  }

  function offsetOf(rec, t, out) {
    const e = rec.part.explode;
    if (e) return out.set(e[0] * t, e[1] * t, e[2] * t);
    return out.copy(rec.autoOffset).multiplyScalar(t);
  }

  // ---------------------------------------------------------------------------------------------
  // Bounds and camera fitting

  function assembledBounds() {
    return boundsAt(0, false);
  }

  /**
   * Whether a part counts when the camera frames the model: one of `only` (a key, or a Set of
   * keys) when given, else a part that shows (not isolated away, not hidden by a walkthrough step).
   */
  function framed(rec, only) {
    if (only) return typeof only === 'string' ? rec.key === only : only.has(rec.key);
    if (isolatedKey && rec.key !== isolatedKey) return false;
    return !emphasis || rec.visGoal > 0;
  }

  /** { min, max } of the shown parts at explode t (only: just these parts, a key or a Set of keys). */
  function boundsAt(t, visibleOnly = true, only = null) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const off = new Vector3();
    for (const rec of records.values()) {
      if (!rec.box) continue;
      if ((only || visibleOnly) && !framed(rec, only)) continue;
      offsetOf(rec, t, off);
      for (let k = 0; k < 3; k++) {
        const o2 = k === 0 ? off.x : k === 1 ? off.y : off.z;
        if (rec.box.min[k] + o2 < min[k]) min[k] = rec.box.min[k] + o2;
        if (rec.box.max[k] + o2 > max[k]) max[k] = rec.box.max[k] + o2;
      }
    }
    return Number.isFinite(min[0]) ? { min, max } : null;
  }

  function visibleRegion(W = width, H = height, ins = insets) {
    const left = Math.min(ins.left || 0, W * 0.45);
    const right = Math.min(ins.right || 0, W * 0.45);
    // toolbars and a part card may cover a lot of a phone screen: keep at least a third visible
    const top = Math.min(ins.top || 0, H * 0.4);
    const bottom = Math.min(ins.bottom || 0, Math.max(0, H * 0.66 - top));
    return { left, right, top, bottom, w: Math.max(1, W - left - right), h: Math.max(1, H - top - bottom) };
  }

  /**
   * Rotation-safe fit (used while auto-rotating): frames bounds b from polar angle phi so that no
   * azimuth pushes anything out of the visible region (the footprint is treated as a disc).
   */
  function fitOrbit(b, phi, H = height, region = visibleRegion()) {
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const hx = (b.max[0] - b.min[0]) / 2;
    const hy = (b.max[1] - b.min[1]) / 2;
    const hz = (b.max[2] - b.min[2]) / 2;
    const rxz = Math.max(1e-6, Math.hypot(hx, hz));
    const tan = Math.tan((BASE_FOV * DEG) / 2);
    const margin = 0.9;
    const dH = (rxz * H) / (tan * region.w * margin);
    const ext = hy * Math.sin(phi) + rxz * Math.abs(Math.cos(phi));
    const dV = (ext * H) / (tan * region.h * margin);
    const radius = Math.max(dH, dV) + rxz * 0.3;
    return { target: new Vector3(cx, cy, cz), radius, rxz };
  }

  /**
   * Exact fit for one camera direction (theta, phi): the corners of every visible part's box (or
   * of `only`'s: a key or a Set of keys) are projected, the target is centered on their extent and
   * the distance is the smallest one that keeps every corner inside the visible region (perspective
   * included).
   */
  function fitView(theta, phi, t = explodeT, only = null, H = height, region = visibleRegion()) {
    const sp = Math.sin(phi);
    const back = new Vector3(sp * Math.sin(theta), Math.cos(phi), sp * Math.cos(theta)); // towards the camera
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), back);
    if (right.lengthSq() < 1e-8) right.set(Math.cos(theta), 0, -Math.sin(theta));
    right.normalize();
    const up = new Vector3().crossVectors(back, right).normalize();
    const pts = [];
    const off = new Vector3();
    for (const rec of records.values()) {
      if (!rec.box || !framed(rec, only)) continue;
      offsetOf(rec, t, off);
      const sup = rec.support;
      if (sup) for (let i = 0; i < sup.length; i += 3) pts.push(new Vector3(sup[i] + off.x, sup[i + 1] + off.y, sup[i + 2] + off.z));
      else {
        const { min, max } = rec.box;
        for (let i = 0; i < 8; i++) pts.push(new Vector3(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]).add(off));
      }
    }
    if (!pts.length) return null;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of pts) {
      const u = p.dot(right);
      const v = p.dot(up);
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const uc = (u0 + u1) / 2;
    const vc = (v0 + v1) / 2;
    // target: on the plane through the points' mean depth, at the extent's center
    let wMean = 0;
    for (const p of pts) wMean += p.dot(back);
    wMean /= pts.length;
    const target = right.clone().multiplyScalar(uc).addScaledVector(up, vc).addScaledVector(back, wMean);
    const k = H / (2 * Math.tan((BASE_FOV * DEG) / 2));
    const margin = 0.88;
    const halfW = (region.w / 2) * margin;
    const halfH = (region.h / 2) * margin;
    let radius = 0;
    let rxz = 0;
    for (const p of pts) {
      const d = p.clone().sub(target);
      const u = Math.abs(d.dot(right));
      const v = Math.abs(d.dot(up));
      const w = d.dot(back);
      radius = Math.max(radius, w + (u * k) / halfW, w + (v * k) / halfH);
      rxz = Math.max(rxz, Math.hypot(d.x, d.z));
    }
    return { target, radius: Math.max(radius, 1e-6), rxz: Math.max(rxz, 1e-6) };
  }

  function partFit(f) {
    f.radius = Math.max(f.radius * 1.25, modelRadius * 0.3);
    return f;
  }

  /** The focused parts that exist (fit mode 'part'): a Set of keys, or null. */
  function focusedKeys() {
    if (fitMode !== 'part' || !focusKeys) return null;
    let all = true;
    for (const key of focusKeys) if (!records.has(key)) all = false;
    if (all) return focusKeys;
    const keys = new Set(Array.from(focusKeys).filter((key) => records.has(key)));
    return keys.size ? keys : null;
  }

  /** Where the camera should be: exact fit for the current view, or rotation-safe while auto-rotating. */
  function currentFitGoal(kind = autoRotating() ? 'orbit' : 'view', theta = orbit.theta, phi = orbit.phi) {
    const only = focusedKeys();
    let f;
    if (kind === 'orbit') {
      const b = boundsAt(explodeT, true, only);
      f = b ? fitOrbit(b, phi) : null;
    } else f = fitView(theta, phi, explodeT, only);
    if (f && only) partFit(f);
    return f;
  }

  function snapFit() {
    if (tracking()) return; // the move under way frames the model itself, frame by frame
    const f = currentFitGoal();
    if (!f) return;
    orbit.target.copy(f.target);
    orbit.radius = f.radius;
    camTween = null;
    modelRadius = Math.max(modelRadius, f.rxz);
  }

  function refit(animate) {
    if (tracking()) return; // the move under way frames the model itself, frame by frame
    // a view change still under way keeps turning to its angles, framed for where it ends
    const to = camTween && camTween.to ? camTween.to : null;
    const theta = to && to.theta !== undefined ? to.theta : orbit.theta;
    const phi = to && to.phi !== undefined ? to.phi : orbit.phi;
    const f = currentFitGoal(autoRotating() ? 'orbit' : 'view', theta, phi);
    if (!f) return;
    const goal = { target: f.target, radius: f.radius };
    if (to && to.theta !== undefined) goal.theta = to.theta;
    if (to && to.phi !== undefined) goal.phi = to.phi;
    tweenCamera(goal, animate);
  }

  /**
   * Animate the camera to `to` ({ target?, radius?, theta?, phi? }); fields left out are not touched.
   * A flight ({ track, done }, flyTo) follows the parts while they move (track() gives its framing,
   * frame by frame) and calls done(how) once: 'arrived', or why it stopped. It replaces the move
   * under way.
   */
  function tweenCamera(to, animate = true, flight = null, dur = CAMERA_MS) {
    stopFlight('replaced');
    if (!animate || reducedMq.matches) {
      if (to.target) orbit.target.copy(to.target);
      if (to.radius !== undefined) orbit.radius = to.radius;
      if (to.theta !== undefined) orbit.theta = to.theta;
      if (to.phi !== undefined) orbit.phi = to.phi;
      camTween = null;
      requestRender();
      if (flight) flight.done('arrived');
      return;
    }
    const from = { target: orbit.target.clone(), radius: orbit.radius, theta: orbit.theta, phi: orbit.phi };
    camTween = {
      from,
      to: {
        target: to.target ? to.target.clone() : null,
        radius: to.radius,
        theta: to.theta === undefined ? undefined : from.theta + wrapAngle(to.theta - from.theta),
        phi: to.phi,
      },
      start: performance.now(),
      dur,
      track: flight ? flight.track : null,
      done: flight ? flight.done : null,
    };
    requestRender();
  }

  /** Whether the camera move under way frames the parts itself, frame by frame (a flight, or a move during an explode). */
  function tracking() {
    return !!(camTween && camTween.track);
  }

  /** The flight under way, if any, stops: how = 'touch' (the owner took the camera) or 'replaced'. */
  function stopFlight(how) {
    const done = camTween && camTween.done;
    if (!done) return;
    camTween.done = null;
    camTween.track = null;
    done(how);
    emit();
  }

  /**
   * An explode moves the parts: a camera move under way aims at where they are, frame by frame
   * (it would aim at where they were, and the explode's framing would chase after it).
   */
  function trackParts() {
    if (!camTween || camTween.track || !(fitMode === 'auto' || fitMode === 'part')) return;
    const { theta, phi } = camTween.to;
    camTween.track = () => currentFitGoal('view', theta === undefined ? orbit.theta : theta, phi === undefined ? orbit.phi : phi);
  }

  function setViewAngles(name) {
    const a = VIEW_ANGLES[name] || VIEW_ANGLES[DEFAULT_VIEW];
    viewName = VIEW_ANGLES[name] ? name : DEFAULT_VIEW;
    orbit.theta = a[0] * DEG;
    orbit.phi = a[1] * DEG;
  }

  function setView(name, animate = true, byOwner = true) {
    if (!VIEW_ANGLES[name]) return false;
    if (byOwner) cameraTouched = true;
    viewName = name;
    const [theta, phi] = VIEW_ANGLES[name];
    const goalPhi = phi * DEG;
    let goal = { theta: theta * DEG, phi: goalPhi };
    if (fitMode === 'user') fitMode = 'auto';
    const f = currentFitGoal('view', goal.theta, goalPhi);
    if (f) goal = { ...goal, target: f.target, radius: f.radius };
    pauseAutoRotate();
    tweenCamera(goal, animate);
    emit();
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Projection, sizing, DPR

  function updateProjection() {
    if (!width || !height) return;
    const r = visibleRegion();
    const cx = r.left + r.w / 2;
    const cy = r.top + r.h / 2;
    const dx = cx - width / 2;
    const dy = cy - height / 2;
    const fullW = width + 2 * Math.abs(dx);
    const fullH = height + 2 * Math.abs(dy);
    const offX = fullW / 2 - cx;
    const offY = fullH / 2 - cy;
    cam.aspect = fullW / fullH;
    cam.fov = (2 * Math.atan(Math.tan((BASE_FOV * DEG) / 2) * (fullH / height))) / DEG;
    cam.setViewOffset(fullW, fullH, offX, offY, width, height);
    cam.updateProjectionMatrix();
    bgMat.uniforms.uRes.value.set(width * dpr, height * dpr);
    bgMat.uniforms.uCenter.value.set(cx * dpr, (height - cy) * dpr);
  }

  function measure() {
    if (disposed) return;
    const rect = root.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const ratio = Math.max(1, Math.min(o.maxDpr || MAX_DPR, Math.max(1, win.devicePixelRatio || 1)) * dprScale);
    if (w === width && h === height && ratio === dpr) return;
    width = w;
    height = h;
    dpr = ratio;
    if (w > 0 && h > 0 && renderer) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      updateProjection();
      if (records.size && fitMode === 'auto') snapFit();
    }
    updateAwake();
    requestRender();
  }

  // ---------------------------------------------------------------------------------------------
  // Labels

  function createLabel(rec) {
    const box = mk('div', 'holo-label');
    box.dataset.key = rec.key;
    const text = mk('span', 'holo-label__text');
    box.append(text);
    labelsEl.append(box);
    const line = doc.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'holo-leader');
    line.setAttribute('data-key', rec.key);
    const dot = doc.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', 'holo-anchor');
    dot.setAttribute('data-key', rec.key); // (tests: where a labeled part's anchor is on screen)
    dot.setAttribute('r', '2.2');
    svg.append(line, dot);
    rec.label = { el: box, text, line, dot, w: 0, h: 0, name: null, shown: false, state: '' };
  }

  function updateLabelText(rec) {
    const name = rec.part.name || '';
    if (rec.label.name === name) return;
    rec.label.name = name;
    rec.label.text.textContent = name;
    rec.label.w = 0; // re-measure
  }

  function layoutAllLabels() {
    const live = [];
    const v = new Vector3();
    const region = visibleRegion();
    const bounds = { left: region.left + 4, top: region.top + 4, right: width - region.right - 4, bottom: height - region.bottom - 4 };
    // measure (reads first, then writes)
    for (const rec of records.values()) {
      const L = rec.label;
      if (L.name && L.w === 0) {
        L.w = Math.ceil(L.el.offsetWidth);
        L.h = Math.ceil(L.el.offsetHeight);
      }
    }
    // screen boxes of the visible parts (labels prefer not to cover them) and of the whole model
    const avoid = [];
    const off = new Vector3();
    let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
    for (const rec of records.values()) {
      if (!rec.box || rec.vis < 0.3 || (isolatedKey && rec.key !== isolatedKey)) continue;
      offsetOf(rec, explodeT, off);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? rec.box.max[0] : rec.box.min[0], i & 2 ? rec.box.max[1] : rec.box.min[1], i & 4 ? rec.box.max[2] : rec.box.min[2]).add(off).project(cam);
        const sx = (v.x * 0.5 + 0.5) * width;
        const sy = (-v.y * 0.5 + 0.5) * height;
        if (sx < x0) x0 = sx;
        if (sx > x1) x1 = sx;
        if (sy < y0) y0 = sy;
        if (sy > y1) y1 = sy;
      }
      if (x0 < mx0) mx0 = x0;
      if (y0 < my0) my0 = y0;
      if (x1 > mx1) mx1 = x1;
      if (y1 > my1) my1 = y1;
      // big shells (body panels, housings) would leave no room at all: only smaller parts count
      if ((x1 - x0) * (y1 - y0) < width * height * 0.12) avoid.push([x0, y0, x1, y1]);
    }
    const now = clock();
    for (const rec of records.values()) {
      const L = rec.label;
      const revealed = rec.born.length && now >= rec.born[0] + REVEAL_S * 0.4;
      const visible = labelsOn && L.name && rec.box && revealed && rec.vis > 0.3 && (!isolatedKey || rec.key === isolatedKey) && labelAllowed(rec);
      if (!visible) continue;
      anchorOf(rec, v).project(cam);
      if (v.z > 1 || v.z < -1) continue;
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      // on-screen size as priority
      const pxPerUnit = height / (2 * Math.max(1e-6, cam.position.distanceTo(anchorOf(rec, new Vector3()))) * Math.tan((BASE_FOV * DEG) / 2));
      live.push({ id: rec.key, x, y, w: L.w, h: L.h, priority: rec.size * pxPerUnit + (rec.key === hoverKey ? 1e6 : 0), pinned: rec.key === selectedKey || roleOf(rec) === 'glow' });
    }
    const center = Number.isFinite(mx0) ? { x: (mx0 + mx1) / 2, y: (my0 + my1) / 2 } : { x: width / 2, y: height / 2 };
    const candidates = live.length;
    // Only parts whose anchor is inside the visible region compete for the budget (layoutLabels
    // skips the others anyway): zoomed in, big off-screen parts would otherwise use up the slots,
    // and zooming in would hide labels instead of revealing the parts in view.
    let kept = 0;
    for (const it of live) {
      if (it.pinned || (it.x >= bounds.left - 1 && it.x <= bounds.right + 1 && it.y >= bounds.top - 1 && it.y <= bounds.bottom + 1)) live[kept++] = it;
    }
    live.length = kept;
    // Label budget: assembled, a compact model only gets labels for its biggest parts (about one
    // per LABEL_AREA px² of view); exploded, every part may be labeled if there is room. The
    // selected and hovered parts are always included (and a walkthrough step's glowing parts);
    // labelsFor's few parts all are.
    const area = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
    const perLabel = LABEL_AREA + (LABEL_AREA_EXPLODED - LABEL_AREA) * explodeT;
    const budget = isolatedKey || labelOnly ? Infinity : Math.round(Math.max(MIN_LABELS, area / perLabel));
    if (live.length > budget) {
      live.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.priority - a.priority);
      live.length = budget;
    }
    // compact (assembled) models get callout-style labels outside; exploded ones keep them close
    const coverCost = 80 + 130 * (1 - explodeT);
    const placed = layoutLabels(live, bounds, { center, previous: prevSlots, avoid, maxCost: MAX_LABEL_COST, coverCost });
    const byId = new Map(live.map((it) => [it.id, it]));
    labelsHidden = candidates - placed.size;
    for (const rec of records.values()) {
      const L = rec.label;
      const p = placed.get(rec.key);
      if (!p) {
        if (L.shown) {
          L.shown = false;
          L.el.classList.remove('is-shown');
          L.line.style.display = 'none';
          L.dot.style.display = 'none';
        }
        prevSlots.delete(rec.key);
        continue;
      }
      prevSlots.set(rec.key, p.slot);
      const item = byId.get(rec.key);
      L.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      if (!L.shown) {
        L.shown = true;
        L.el.classList.add('is-shown');
        L.line.style.display = '';
        L.dot.style.display = '';
      }
      const state = rec.key === selectedKey || roleOf(rec) === 'glow' ? 'sel' : rec.key === hoverKey ? 'hov' : '';
      if (state !== L.state) {
        L.state = state;
        L.el.classList.toggle('is-selected', state === 'sel');
        L.el.classList.toggle('is-hover', state === 'hov');
        L.line.classList.toggle('is-selected', state === 'sel');
        L.dot.classList.toggle('is-selected', state === 'sel');
      }
      L.line.setAttribute('x1', item.x.toFixed(1));
      L.line.setAttribute('y1', item.y.toFixed(1));
      L.line.setAttribute('x2', p.lx.toFixed(1));
      L.line.setAttribute('y2', p.ly.toFixed(1));
      L.dot.setAttribute('cx', item.x.toFixed(1));
      L.dot.setAttribute('cy', item.y.toFixed(1));
    }
  }

  function hideAllLabels() {
    for (const rec of records.values()) {
      const L = rec.label;
      if (!L.shown) continue;
      L.shown = false;
      L.el.classList.remove('is-shown');
      L.line.style.display = 'none';
      L.dot.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Floor

  function updateFloor() {
    const b = boundsAt(explodeT, true);
    if (!b) {
      floor.visible = false;
      return;
    }
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    const rxz = Math.hypot(b.max[0] - b.min[0], b.max[2] - b.min[2]) / 2;
    const a = assembledBounds() || b;
    const rxz0 = Math.hypot(a.max[0] - a.min[0], a.max[2] - a.min[2]) / 2;
    const R = Math.max(rxz0 * 1.12, rxz * 0.7);
    const y = b.min[1] - Math.max(rxz, b.max[1] - b.min[1]) * 0.03;
    floor.position.set(cx, y, cz);
    floor.scale.set(R * 3.2, 1, R * 3.2);
    floorMat.uniforms.uR.value = R;
    floorMat.uniforms.uCell.value = niceStep(R / 5);
    floorMat.uniforms.uCenterW.value.set(cx, y, cz);
    // a walkthrough's view from below: the floor would hang between the camera and the model
    const under = emphasis ? Math.min(1, Math.max(0, (y - cam.position.y) / (rxz0 * 0.3 + 1e-6))) : 0;
    floorMat.uniforms.uVis.value = 1 - under;
    floor.visible = floorEnabled && under < 1;
  }

  // ---------------------------------------------------------------------------------------------
  // Selection, isolation, visibility goals

  function updateVisGoals() {
    const pulse = !!emphasis && emphasis.pulse && !reducedMq.matches;
    for (const rec of records.values()) {
      const role = roleOf(rec);
      let vis = 1;
      let fillK = 1;
      if (isolatedKey && rec.key !== isolatedKey) vis = 0;
      else if (role === 'hide') vis = 0;
      else if (role === 'glow' || (role && rec.key === selectedKey)) vis = 1;
      else if (role === 'ghost') {
        vis = GHOST_EDGES;
        fillK = GHOST_FILL / GHOST_EDGES;
      } else if (role) vis = emphasis.others;
      else if (selectedKey && rec.key !== selectedKey && !isolatedKey) vis = 0.38;
      rec.visGoal = vis;
      rec.fillKGoal = fillK;
      rec.selGoal = rec.key === selectedKey || role === 'glow' ? 1 : 0;
      rec.pulseGoal = pulse && role === 'glow' ? 1 : 0;
      rec.hovGoal = rec.key === hoverKey && rec.key !== selectedKey ? 1 : 0;
    }
    requestRender();
  }

  /** A part's role in the walkthrough step: null without one, else 'hide', 'glow', 'ghost' or 'other' (in that order). */
  function roleOf(rec) {
    if (!emphasis) return null;
    const named = (set) => set.has(rec.part.id) || set.has(rec.key);
    if (named(emphasis.hide)) return 'hide';
    if (named(emphasis.glow)) return 'glow';
    if (named(emphasis.ghost) || (emphasis.shells && shellIds().has(rec.part.id))) return 'ghost';
    return 'other';
  }

  let shellCache = null;
  /** The hologram's case parts (shellIdsOf), worked out once per spec. */
  function shellIds() {
    if (!shellCache || shellCache.spec !== spec) shellCache = { spec, ids: shellIdsOf(spec ? spec.parts : []) };
    return shellCache.ids;
  }

  /** labelsFor: whether this part's label may show (the selected part's always may). */
  function labelAllowed(rec) {
    return !labelOnly || labelOnly.has(rec.part.id) || labelOnly.has(rec.key) || rec.key === selectedKey;
  }

  /** Part ids (or keys) as a Set of strings: one id, a list, or nothing. */
  function idSet(v) {
    return new Set((v === undefined || v === null ? [] : [].concat(v)).map((x) => String(x)));
  }

  /**
   * A walkthrough step's look, part by part; null (or nothing named) is the usual look again. Part
   * ids or keys; unknown ones are ignored, and parts that arrive later (a live build) take theirs.
   *   glow    the parts the step is about: full strength, brighter, pulsing (a steady glow with
   *           reduced motion, and after 2 minutes); several at once
   *   ghost   see-through: edges at about half, fill at about a tenth; 'shells' = the case parts
   *           (shellIdsOf), alone or in a list with ids (['shells', 'keyboard'])
   *   hide    not shown, not framed, not tappable
   *   others  every other part's level: 0.15 by default; 0 shows only the parts named
   * A part named twice: hide, then glow, then ghost. A selected part glows too; isolate() still wins.
   */
  function setEmphasis(next) {
    let e = null;
    if (next && typeof next === 'object') {
      const ghost = idSet(next.ghost);
      const level = Number(next.others);
      e = {
        glow: idSet(next.glow),
        ghost,
        shells: ghost.has('shells'),
        hide: idSet(next.hide),
        others: next.others === undefined || next.others === null || !Number.isFinite(level) ? OTHERS_LEVEL : Math.min(1, Math.max(0, level)),
        since: performance.now(),
        pulse: true,
      };
      if (!e.glow.size && !e.ghost.size && !e.hide.size && (next.others === undefined || next.others === null)) e = null;
    }
    emphasis = e;
    updateVisGoals();
    emit();
  }

  function keyOfId(id) {
    if (id === null || id === undefined) return null;
    for (const rec of records.values()) if (rec.part.id === id || rec.key === id) return rec.key;
    return undefined;
  }

  function publicPart(rec) {
    if (!rec) return null;
    const p = rec.part;
    const g = spec && p.group ? spec.groups.find((x) => x.id === p.group) : null;
    return { id: p.id, name: p.name, group: p.group, groupName: g ? g.name : '', tone: p.tone, info: p.info, material: p.material, aka: p.aka.slice() };
  }

  function selectKey(key, { notify = true } = {}) {
    if (key === selectedKey) return;
    selectedKey = key;
    if (key) pauseAutoRotate();
    updateVisGoals();
    if (notify) o.onSelect(key ? records.get(key).part.id : null, key ? publicPart(records.get(key)) : null);
    emit();
  }

  // ---------------------------------------------------------------------------------------------
  // Picking

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let lastTap = null;

  function worldBox(rec) {
    const off = rec.group.position;
    return { min: [rec.box.min[0] + off.x, rec.box.min[1] + off.y, rec.box.min[2] + off.z], max: [rec.box.max[0] + off.x, rec.box.max[1] + off.y, rec.box.max[2] + off.z] };
  }
  const volume = (b) => Math.max(1e-9, (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]));

  function pickAt(px, py) {
    if (!width || !height) return null;
    ndc.set((px / width) * 2 - 1, -(py / height) * 2 + 1);
    raycaster.setFromCamera(ndc, cam);
    const meshes = [];
    for (const rec of records.values()) if (rec.fill && rec.group.visible && rec.visGoal > 0.05) meshes.push(rec.fill);
    const hits = raycaster.intersectObjects(meshes, false);
    const list = [];
    for (const h of hits) {
      const rec = h.object.userData.rec;
      if (rec && !list.includes(rec)) list.push(rec);
    }
    if (!list.length) return null;
    // See-through model: prefer a part inside the nearest one (the engine inside the body shell).
    let pick = list[0];
    for (let k = 1; k < list.length; k++) {
      const inner = list[k];
      const pb = worldBox(pick);
      const ib = worldBox(inner);
      const c = [(ib.min[0] + ib.max[0]) / 2, (ib.min[1] + ib.max[1]) / 2, (ib.min[2] + ib.max[2]) / 2];
      const inside = c.every((v, i) => v >= pb.min[i] && v <= pb.max[i]);
      if (inside && volume(ib) < volume(pb) * 0.6) pick = inner;
    }
    // Tapping the same spot again walks through the stack under the finger.
    const now = performance.now();
    if (lastTap && Math.hypot(lastTap.x - px, lastTap.y - py) < 14 && now - lastTap.t < 5000 && selectedKey) {
      const cur = list.findIndex((r) => r.key === selectedKey);
      if (cur >= 0) pick = list[(cur + 1) % list.length];
    }
    lastTap = { x: px, y: py, t: now };
    return pick;
  }

  // ---------------------------------------------------------------------------------------------
  // Pointer input: drag rotates, right/shift-drag or two fingers pan, pinch/wheel zoom, tap selects

  const pointers = new Map();
  let gesture = null; // { mode, moved, startX, startY, startT, pinchDist, midX, midY, touch }

  function localXY(e) {
    const r = root.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function markInteraction() {
    lastInteraction = performance.now();
  }

  function pauseAutoRotate() {
    lastInteraction = performance.now();
  }

  function onPointerDown(e) {
    if (disposed || contextLost) return;
    if (e.target && e.target.closest && e.target.closest('.holo__notice')) return;
    const [x, y] = localXY(e);
    pointers.set(e.pointerId, { x, y });
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    inertia.theta = 0;
    inertia.phi = 0;
    stopFlight('touch');
    camTween = null;
    markInteraction();
    if (pointers.size === 1) {
      gesture = {
        mode: e.button === 2 || e.shiftKey || e.ctrlKey ? 'pan' : 'rotate',
        moved: false,
        startX: x,
        startY: y,
        startT: performance.now(),
        touch: e.pointerType !== 'mouse',
        target: e.target,
        lastT: performance.now(),
      };
    } else if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      gesture = { mode: 'pinch', moved: true, pinchDist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, touch: true };
    }
    requestRender();
  }

  function onPointerMove(e) {
    if (disposed) return;
    const p = pointers.get(e.pointerId);
    const [x, y] = localXY(e);
    if (!p) {
      if (e.pointerType === 'mouse' && !contextLost) scheduleHover(x, y);
      return;
    }
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (!gesture) return;
    if (gesture.mode === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = Array.from(pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (gesture.pinchDist > 0 && dist > 0) zoomBy(gesture.pinchDist / dist);
      panBy(midX - gesture.midX, midY - gesture.midY);
      gesture.pinchDist = dist;
      gesture.midX = midX;
      gesture.midY = midY;
      markInteraction();
      requestRender();
      return;
    }
    if (!gesture.moved) {
      const slop = gesture.touch ? TAP_SLOP_TOUCH : TAP_SLOP_MOUSE;
      if (Math.hypot(x - gesture.startX, y - gesture.startY) < slop) return;
      gesture.moved = true;
      cameraTouched = true;
    }
    const now = performance.now();
    const dtS = Math.max(0.001, (now - gesture.lastT) / 1000);
    gesture.lastT = now;
    if (gesture.mode === 'pan') panBy(dx, dy);
    else {
      const k = Math.PI / Math.max(320, Math.min(width, height)) * 1.15;
      orbit.theta -= dx * k;
      orbit.phi = Math.min(Math.PI - 0.01, Math.max(0.01, orbit.phi - dy * k));
      inertia.theta = (-dx * k) / dtS;
      inertia.phi = (-dy * k) / dtS;
      viewName = '';
    }
    markInteraction();
    requestRender();
  }

  function onPointerUp(e) {
    if (disposed) return;
    const had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    try {
      root.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!had || !gesture) return;
    if (gesture.mode === 'pinch') {
      if (pointers.size === 1) {
        const [rest] = Array.from(pointers.values());
        gesture = { mode: 'rotate', moved: true, startX: rest.x, startY: rest.y, startT: performance.now(), touch: true, lastT: performance.now() };
      } else gesture = null;
      inertia.theta = 0;
      inertia.phi = 0;
      return;
    }
    const g = gesture;
    gesture = null;
    if (!g.moved && e.type === 'pointerup' && performance.now() - g.startT < 900) {
      const [x, y] = localXY(e);
      const labelEl = g.target && g.target.closest ? g.target.closest('.holo-label') : null;
      if (labelEl && records.has(labelEl.dataset.key)) selectKey(labelEl.dataset.key);
      else {
        const rec = pickAt(x, y);
        selectKey(rec ? rec.key : null);
      }
      inertia.theta = 0;
      inertia.phi = 0;
    } else if (g.mode !== 'rotate' || performance.now() - g.lastT > 80) {
      inertia.theta = 0;
      inertia.phi = 0;
    }
    requestRender();
  }

  function onWheel(e) {
    if (disposed || contextLost) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    zoomBy(Math.exp(e.deltaY * unit * 0.0012));
    markInteraction();
    requestRender();
  }

  function zoomBy(factor) {
    cameraTouched = true;
    const f = Math.min(4, Math.max(0.25, factor));
    const fit = currentFitGoal('orbit');
    const maxR = (fit ? fit.radius : orbit.radius) * 3;
    const minR = Math.max(modelRadius * 0.06, 1e-3);
    orbit.radius = Math.min(maxR, Math.max(minR, orbit.radius * f));
    fitMode = 'user';
    stopFlight('touch');
    camTween = null;
  }

  function panBy(dx, dy) {
    if (!dx && !dy) return;
    cameraTouched = true;
    const unitsPerPx = (2 * orbit.radius * Math.tan((BASE_FOV * DEG) / 2)) / Math.max(1, height);
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    orbit.target.addScaledVector(right, -dx * unitsPerPx).addScaledVector(up, dy * unitsPerPx);
    fitMode = 'user';
    stopFlight('touch');
    camTween = null;
  }

  let hoverPending = null;
  function scheduleHover(x, y) {
    if (gesture) return;
    hoverPending = [x, y];
    requestRender();
  }

  function applyHover() {
    if (!hoverPending) return;
    const [x, y] = hoverPending;
    hoverPending = null;
    if (!width || !height) return;
    ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    raycaster.setFromCamera(ndc, cam);
    const meshes = [];
    for (const rec of records.values()) if (rec.fill && rec.visGoal > 0.05) meshes.push(rec.fill);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    const key = hit ? hit.object.userData.rec.key : null;
    if (key !== hoverKey) {
      hoverKey = key;
      root.classList.toggle('is-pointing', !!key);
      updateVisGoals();
    }
  }

  function onPointerLeave() {
    if (hoverKey) {
      hoverKey = null;
      root.classList.remove('is-pointing');
      updateVisGoals();
    }
  }

  function onDblClick(e) {
    if (disposed || contextLost) return;
    const [x, y] = localXY(e);
    const rec = pickAt(x, y);
    if (rec) focusKeyFn(rec.key);
    else resetView();
  }

  const preventMenu = (e) => e.preventDefault();
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('pointerleave', onPointerLeave);
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('contextmenu', preventMenu);
  root.addEventListener('dblclick', onDblClick);

  // ---------------------------------------------------------------------------------------------
  // Animation loop (on demand)

  let rafId = 0;
  let needsRender = true;
  let lastFrame = 0;
  let awake = false;
  let inView = true;

  function requestRender() {
    needsRender = true;
    if (awake && !rafId && !disposed) rafId = win.requestAnimationFrame(frame);
  }

  function autoRotating() {
    if (!autoRotateOn || rotateHeld || (reducedMq.matches && !rotateRequested) || gesture || selectedKey || camTween || !records.size) return false;
    const now = performance.now();
    const idle = now - Math.max(lastInteraction, rotateSince);
    return now - lastInteraction > AUTO_ROTATE_RESUME_MS && idle < AUTO_ROTATE_MAX_MS;
  }

  // The loop sleeps when nothing moves; idle rotation that is due later (the opening delay, or
  // the resume delay after the owner's last touch) wakes it then. Touch has no hover renders.
  let rotateWake = 0;
  function scheduleRotateWake() {
    win.clearTimeout(rotateWake);
    rotateWake = 0;
    if (disposed || !autoRotateOn || rotateHeld || (reducedMq.matches && !rotateRequested)) return;
    const due = lastInteraction + AUTO_ROTATE_RESUME_MS - performance.now();
    if (!(due > 0) || !Number.isFinite(due)) return; // due now: whatever blocks it requests a render when it ends
    rotateWake = win.setTimeout(() => {
      rotateWake = 0;
      requestRender();
    }, Math.ceil(due) + 20);
  }

  function stepAnimations(dt, nowMs) {
    let busy = false;
    const now = clock();
    shared.uTime.value = now;

    // camera tween (a flight, or a move made while an explode is under way, aims at where the parts are now)
    if (camTween) {
      const t = Math.min(1, (nowMs - camTween.start) / camTween.dur);
      const e = easeInOut(t);
      const f = camTween.from;
      const g = camTween.to;
      const fit = camTween.track ? camTween.track() : null;
      if (fit) {
        g.target = fit.target;
        g.radius = fit.radius;
      }
      if (g.target) orbit.target.lerpVectors(f.target, g.target, e);
      if (g.radius !== undefined) orbit.radius = f.radius + (g.radius - f.radius) * e;
      if (g.theta !== undefined) orbit.theta = f.theta + (g.theta - f.theta) * e;
      if (g.phi !== undefined) orbit.phi = f.phi + (g.phi - f.phi) * e;
      if (t >= 1) {
        const done = camTween.done;
        camTween = null;
        if (done) {
          done('arrived');
          emit();
        }
      }
      busy = true;
    }
    // inertia
    if (!gesture && (Math.abs(inertia.theta) > 1e-3 || Math.abs(inertia.phi) > 1e-3)) {
      orbit.theta += inertia.theta * dt;
      orbit.phi = Math.min(Math.PI - 0.01, Math.max(0.01, orbit.phi + inertia.phi * dt));
      const decay = Math.exp(-dt * 4.5);
      inertia.theta *= decay;
      inertia.phi *= decay;
      busy = true;
    }
    // explode
    if (explodeAnim) {
      const t = Math.min(1, (nowMs - explodeAnim.start) / explodeAnim.dur);
      explodeT = explodeAnim.from + (explodeAnim.to - explodeAnim.from) * easeInOut(t);
      if (!camTween && (fitMode === 'auto' || fitMode === 'part')) {
        const f = currentFitGoal();
        if (f) {
          const k = t >= 1 ? 1 : Math.min(1, dt * 8);
          orbit.target.lerp(f.target, k);
          orbit.radius += (f.radius - orbit.radius) * k;
        }
      }
      if (t >= 1) {
        const done = explodeAnim.done;
        explodeAnim = null;
        for (const fn of done) fn('arrived');
      }
      busy = true;
    } else if ((fitMode === 'auto' || fitMode === 'part') && !camTween && !gesture && autoRotating()) {
      // while idling in auto-rotation, ease out to the rotation-safe framing (no part leaves the view)
      const f = currentFitGoal('orbit');
      if (f && (Math.abs(f.radius - orbit.radius) > f.radius * 0.003 || f.target.distanceTo(orbit.target) > f.radius * 0.003)) {
        orbit.target.lerp(f.target, Math.min(1, dt * 1.5));
        orbit.radius += (f.radius - orbit.radius) * Math.min(1, dt * 1.5);
        busy = true;
      }
    }
    // auto-rotate
    if (autoRotating()) {
      orbit.theta += AUTO_ROTATE_DEG_S * DEG * dt;
      busy = true;
    }
    // a walkthrough's glow pulses for a while, then stays steady (and frames are on demand again)
    if (emphasis && emphasis.pulse && performance.now() - emphasis.since > PULSE_MAX_MS) {
      emphasis.pulse = false;
      updateVisGoals();
    }
    // per-part easing (visibility, a ghost's fill, selection, hover, pulse)
    const k = reducedMq.matches ? 1 : Math.min(1, dt * 9);
    const off = new Vector3();
    let pulses = false;
    for (const rec of records.values()) {
      offsetOf(rec, explodeT, off);
      if (!rec.group.position.equals(off)) rec.group.position.copy(off);
      for (const [cur, goal] of EASED) {
        const d = rec[goal] - rec[cur];
        if (Math.abs(d) > 0.003) {
          rec[cur] += d * k;
          busy = true;
        } else rec[cur] = rec[goal];
      }
      rec.mats.fill.uniforms.uVis.value = rec.vis * rec.fillK;
      rec.mats.line.uniforms.uVis.value = rec.vis;
      rec.mats.fill.uniforms.uSel.value = rec.sel;
      rec.mats.line.uniforms.uSel.value = rec.sel;
      rec.mats.fill.uniforms.uHover.value = rec.hov;
      rec.mats.line.uniforms.uHover.value = rec.hov;
      rec.mats.fill.uniforms.uPulse.value = rec.pulse;
      rec.mats.line.uniforms.uPulse.value = rec.pulse;
      rec.group.visible = rec.vis > 0.01;
      if (rec.pulse > 0 && rec.group.visible) pulses = true;
    }
    pulseLive = pulses;
    // materialize sweep still running?
    if (now < lastBorn + REVEAL_S + 0.05) busy = true;
    // ambient: scan band and a faint flicker (only while frames are being drawn anyway)
    const b = boundsAt(explodeT, true);
    if (b) {
      const hgt = Math.max(1e-6, b.max[1] - b.min[1]);
      const period = 5.5;
      const ph = (now % period) / period;
      shared.uScanY.value = b.min[1] - hgt * 0.2 + ph * hgt * 1.4;
      shared.uScanW.value = hgt * 0.035;
      modelRadius = Math.max(1e-6, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2);
    }
    shared.uFlicker.value = reducedMq.matches ? 1 : 0.985 + 0.015 * Math.sin(now * 23.0) * Math.sin(now * 7.3);
    return busy;
  }

  function applyCamera() {
    const sp = Math.sin(orbit.phi);
    cam.position.set(
      orbit.target.x + orbit.radius * sp * Math.sin(orbit.theta),
      orbit.target.y + orbit.radius * Math.cos(orbit.phi),
      orbit.target.z + orbit.radius * sp * Math.cos(orbit.theta),
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(orbit.target);
    const R = Math.max(modelRadius, 1e-6);
    cam.near = Math.max(orbit.radius * 0.01, orbit.radius - R * 6);
    cam.far = orbit.radius + R * 8;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    shared.uFade.value.set(orbit.radius - R * 0.9, orbit.radius + R * 1.1);
  }

  let frameTimes = [];
  function frame(ts) {
    rafId = 0;
    // Another window's frame timestamps count from that window's time origin: use this one's clock.
    const nowMs = foreign ? performance.now() : ts;
    if (!awake || disposed || contextLost) return;
    const continuous = autoRotating() || pulseLive; // idle animation: at most IDLE_FPS
    const busyBefore = camTween || explodeAnim || gesture || needsRender;
    if (!busyBefore && continuous && lastFrame && nowMs - lastFrame < 1000 / IDLE_FPS - 2) {
      rafId = win.requestAnimationFrame(frame);
      return;
    }
    const dt = lastFrame ? Math.min(0.1, (nowMs - lastFrame) / 1000) : 1 / 60;
    if (lastFrame && (camTween || explodeAnim || gesture || continuous)) {
      paceSum += nowMs - lastFrame;
      if (++paceCount >= 30) {
        const avg = paceSum / paceCount;
        paceSum = 0;
        paceCount = 0;
        if (avg > 48 && dpr > 1.01) {
          dprScale = Math.max(0.25, dprScale - 0.25);
          measure();
        }
      }
    }
    lastFrame = nowMs;
    needsRender = false;
    const busy = stepAnimations(dt, nowMs);
    applyHover();
    renderNow();
    if (busy || needsRender || autoRotating() || pulseLive) rafId = win.requestAnimationFrame(frame);
    else {
      lastFrame = 0;
      scheduleRotateWake();
    }
  }

  function renderNow() {
    if (!renderer || !width || !height) return;
    const t = performance.now();
    applyCamera();
    updateFloor();
    renderer.render(scene, cam);
    counters.frames++;
    const tl = performance.now();
    if (labelsOn) layoutAllLabels();
    else hideAllLabels();
    counters.labelMs += performance.now() - tl;
    const ms = performance.now() - t;
    frameTimes.push(ms);
    if (frameTimes.length > 120) frameTimes = frameTimes.slice(-60);
  }

  function updateAwake() {
    const should = !disposed && !contextLost && !doc.hidden && inView && width > 0 && height > 0 && root.isConnected && !root.closest('[inert]');
    if (should === awake) return;
    awake = should;
    if (awake) {
      lastFrame = 0;
      requestRender();
    } else if (rafId) {
      win.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  let ro = null;
  const RO = typeof win.ResizeObserver === 'function' ? win.ResizeObserver : typeof ResizeObserver === 'function' ? ResizeObserver : null;
  if (RO) {
    ro = new RO(() => measure());
    ro.observe(root);
  }
  const onWindowResize = () => measure();
  win.addEventListener('resize', onWindowResize);
  let io = null;
  const IO = typeof win.IntersectionObserver === 'function' ? win.IntersectionObserver : typeof IntersectionObserver === 'function' ? IntersectionObserver : null;
  if (IO) {
    io = new IO(
      (entries) => {
        inView = entries[entries.length - 1].isIntersecting;
        updateAwake();
      },
      { rootMargin: '32px' },
    );
    io.observe(root);
  }
  const onVisibility = () => updateAwake();
  doc.addEventListener('visibilitychange', onVisibility);
  const unwatchCover = watchCover(() => updateAwake());

  // ---------------------------------------------------------------------------------------------
  // WebGL context loss

  let restoreTimer = 0;
  function onContextLost(e) {
    e.preventDefault();
    if (disposed) return;
    contextLost = true;
    noticeText.textContent = 'The 3D view was paused by the device. Restoring…';
    noticeBtn.hidden = true;
    notice.hidden = false;
    updateAwake();
    emit();
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      if (contextLost && !disposed) {
        noticeText.textContent = 'The 3D view was paused by the device.';
        noticeBtn.hidden = false;
      }
    }, 2500);
  }
  function onContextRestored() {
    if (disposed) return;
    contextLost = false;
    clearTimeout(restoreTimer);
    notice.hidden = true;
    noticeBtn.hidden = true;
    updateAwake();
    requestRender();
    emit();
  }
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);
  noticeBtn.addEventListener('click', () => restart());

  function restart() {
    // A fresh renderer on the same scene: three re-uploads geometry and recompiles on first render.
    try {
      renderer.dispose();
    } catch {
      /* lost context */
    }
    // On a fresh canvas: the old one's context stays lost when the browser never restores it.
    const fresh = mk('canvas', 'holo__canvas');
    fresh.setAttribute('role', 'img');
    fresh.setAttribute('aria-label', canvas.getAttribute('aria-label') || 'Hologram');
    canvas.removeEventListener('webglcontextlost', onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
    fresh.addEventListener('webglcontextlost', onContextLost, false);
    fresh.addEventListener('webglcontextrestored', onContextRestored, false);
    canvas.replaceWith(fresh);
    canvas = fresh;
    try {
      renderer = makeRenderer();
    } catch {
      noticeText.textContent = 'The 3D view could not restart. Close and reopen the hologram.';
      return;
    }
    width = 0;
    height = 0;
    contextLost = false;
    notice.hidden = true;
    measure();
    requestRender();
    emit();
  }

  // ---------------------------------------------------------------------------------------------
  // State reporting

  let emitQueued = false;
  function emit() {
    if (emitQueued || disposed) return;
    emitQueued = true;
    queueMicrotask(() => {
      emitQueued = false;
      if (!disposed) o.onState(getState());
    });
  }

  function getState() {
    const b = assembledBounds();
    return {
      ready: records.size > 0,
      building,
      title: spec ? spec.title : '',
      subtitle: spec ? spec.subtitle : '',
      parts: records.size,
      units: spec ? spec.units : 'mm',
      gridCell: floor.visible ? floorMat.uniforms.uCell.value : null,
      size: b ? [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] : null,
      exploded: explodeGoal,
      labels: labelsOn,
      labelsHidden,
      autoRotate: autoRotateOn,
      view: viewName,
      selected: selectedKey ? records.get(selectedKey).part.id : null,
      isolated: isolatedKey ? records.get(isolatedKey).part.id : null,
      contextLost,
      // hull bodies and panels still being meshed (and where: 'worker' or 'main' thread)
      meshing: asyncPending(),
      mesher: hullWorkerActive() ? 'worker' : 'main',
      // walkthroughs: the step's emphasis (ids as given), the labels allowed, a flight under way,
      // idle rotation held off
      emphasis: emphasis ? { glow: Array.from(emphasis.glow), ghost: Array.from(emphasis.ghost), hide: Array.from(emphasis.hide), others: emphasis.others } : null,
      labelsFor: labelOnly ? Array.from(labelOnly) : null,
      flying: !!(camTween && camTween.done),
      rotateHeld,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Public API

  function focusKeyFn(key) {
    stopFlight('replaced');
    if (!key) {
      focusKeys = null;
      fitMode = 'auto';
      refit(true);
      return;
    }
    selectKey(key);
    focusKeys = new Set([key]);
    fitMode = 'part';
    if (explodeAnim) {
      // exploding: no tween of its own (it would aim at where the part was); the explode frames
      // the part as it moves, and a move under way aims at it frame by frame
      trackParts();
      requestRender();
      emit();
      return;
    }
    const f = currentFitGoal('view');
    if (f) tweenCamera({ target: f.target, radius: f.radius });
    emit();
  }

  /**
   * flyTo: the camera's target, distance and direction in one move, framing `ids` (frame 'parts')
   * or every shown part (frame 'all'), from a view, a direction or the side the first part comes
   * out of ('access'). Resolves 'arrived', 'touch' (the owner took the camera) or 'replaced'.
   */
  function flyTo({ ids = null, frame, view = null, dir = null, ms = CAMERA_MS } = {}) {
    if (disposed) return Promise.resolve('replaced');
    if (gesture) return Promise.resolve('touch'); // the owner is moving the camera
    const keys = [];
    for (const id of idSet(ids)) {
      const key = keyOfId(id);
      if (key && !keys.includes(key)) keys.push(key);
    }
    const parts = frame !== 'all' && keys.length > 0;
    let angles = null;
    if (view === 'access' || dir === 'access') {
      const rec = keys.length ? records.get(keys[0]) : null;
      const out = rec ? offsetOf(rec, 1, new Vector3()) : null;
      angles = out ? accessAngles([out.x, out.y, out.z], (spec && spec.view) || DEFAULT_VIEW) : null;
      if (angles) viewName = '';
    } else if (typeof view === 'string' && VIEW_ANGLES[view]) {
      angles = [VIEW_ANGLES[view][0] * DEG, VIEW_ANGLES[view][1] * DEG];
      viewName = view;
    } else if (dir) {
      angles = anglesOfDir(dir, orbit.theta);
      if (angles) viewName = '';
    }
    if (angles) cameraTouched = true; // the spec's own view no longer applies by itself
    focusKeys = parts ? new Set(keys) : null;
    fitMode = parts ? 'part' : 'auto';
    inertia.theta = 0;
    inertia.phi = 0;
    pauseAutoRotate();
    const theta = angles ? angles[0] : orbit.theta;
    const phi = angles ? angles[1] : orbit.phi;
    const track = () => currentFitGoal('view', theta, phi);
    const f = track();
    if (!f) {
      emit();
      return Promise.resolve('arrived'); // nothing to frame yet
    }
    // with an explode under way the flight lasts until it ends, so it arrives where the parts stop
    const exploding = explodeAnim ? explodeAnim.start + explodeAnim.dur - performance.now() : 0;
    const dur = Math.max(Number(ms) || 0, exploding);
    return new Promise((resolve) => {
      const goal = angles ? { target: f.target, radius: f.radius, theta, phi } : { target: f.target, radius: f.radius };
      tweenCamera(goal, dur > 0 && awake, { track, done: resolve }, dur);
      emit();
    });
  }

  function resetView() {
    focusKeys = null;
    fitMode = 'auto';
    inertia.theta = 0;
    inertia.phi = 0;
    setView((spec && spec.view) || DEFAULT_VIEW, true);
  }

  const api = {
    /**
     * Live build: call with each new partial-JSON snapshot of the streaming tool input. With
     * { normalized: true } the draft is already a normalized spec (the engine's live segment,
     * cut to its stable prefix) and is shown as it is.
     */
    updateSpec(draft, { final = false, normalized = false } = {}) {
      if (disposed) return null;
      const res = normalized && draft && Array.isArray(draft.parts) ? { spec: draft, warnings: [], stats: null, ok: true } : normalizeHologramSpec(draft, { partial: !final });
      if (!res.spec) return res;
      if (!final) building = true;
      else {
        building = false;
        finalSeen = true;
      }
      apply(res.spec, { final });
      return res;
    },
    /** A complete spec (finished tool input or a saved hologram). Returns the validation result. */
    setSpec(input) {
      if (disposed) return null;
      const res = normalizeHologramSpec(input);
      if (!res.ok) return res;
      if (!building) {
        // a different (saved) model: start from its own view again
        cameraTouched = false;
        appliedSpecView = null;
      }
      building = false;
      apply(res.spec, { final: true });
      finalSeen = true;
      return res;
    },
    /**
     * Exploded view (t 0 assembled … 1 apart; animate false: at once). Resolves 'arrived' when the
     * parts stop moving, or 'replaced' when another explode takes over (a move-finished signal).
     */
    explode(t = 1, animate = true) {
      if (disposed) return Promise.resolve('replaced');
      const goal = Math.min(1, Math.max(0, Number(t) || 0));
      explodeGoal = goal;
      if (fitMode === 'user') fitMode = 'auto';
      if (explodeAnim) for (const fn of explodeAnim.done) fn('replaced');
      let arrived;
      if (!animate || reducedMq.matches) {
        explodeAnim = null;
        explodeT = goal;
        if (fitMode === 'auto' || fitMode === 'part') {
          const f = currentFitGoal('view');
          if (f) {
            orbit.target.copy(f.target);
            orbit.radius = f.radius;
          }
        }
        arrived = Promise.resolve('arrived');
      } else {
        const done = [];
        explodeAnim = { from: explodeT, to: goal, start: performance.now(), dur: EXPLODE_MS * Math.max(0.35, Math.abs(goal - explodeT)), done };
        arrived = new Promise((resolve) => done.push(resolve));
        trackParts(); // a camera move under way aims at where the parts go
      }
      requestRender();
      emit();
      return arrived;
    },
    setLabels(on) {
      labelsOn = !!on;
      requestRender();
      emit();
    },
    select(id) {
      const key = keyOfId(id);
      if (key === undefined) return false;
      selectKey(key, { notify: true });
      requestRender();
      return true;
    },
    focus(id) {
      const key = keyOfId(id);
      if (key === undefined) return false;
      focusKeyFn(key);
      return true;
    },
    isolate(id) {
      const key = keyOfId(id);
      if (key === undefined) return false;
      stopFlight('replaced');
      isolatedKey = key;
      if (key) {
        selectKey(key);
        focusKeys = new Set([key]);
        fitMode = 'part';
      } else {
        focusKeys = null;
        fitMode = 'auto';
      }
      updateVisGoals();
      refit(true);
      emit();
      return true;
    },
    setView(name) {
      return setView(name, true);
    },
    autoRotate(on) {
      autoRotateOn = !!on;
      rotateRequested = autoRotateOn;
      if (autoRotateOn) {
        rotateHeld = false; // the owner asked for it ("spin it"): it spins, a walkthrough or not
        lastInteraction = -Infinity;
        rotateSince = performance.now();
      }
      requestRender();
      emit();
    },
    /**
     * A walkthrough holds the idle auto-rotation off (on), and gives it back (off): it starts again
     * after the usual quiet time, if it was on. The setting itself (getState().autoRotate) is kept.
     */
    holdAutoRotate(on) {
      rotateHeld = !!on;
      if (!rotateHeld) {
        lastInteraction = performance.now();
        scheduleRotateWake();
      }
      requestRender();
      emit();
    },
    setEmphasis,
    /**
     * Only these parts' labels may show (ids or keys; the selected part's always may); null: any.
     * setLabels(on) still switches labels on and off.
     */
    labelsFor(ids) {
      labelOnly = ids === undefined || ids === null ? null : idSet(ids);
      requestRender();
      emit();
    },
    /**
     * Move the camera's target, distance and direction in one tween, and resolve when it is there.
     *   ids    part ids (or keys) to frame; the first is the main part ('access'); unknown ids are ignored
     *   frame  'parts' (default with ids): just those parts, framed close; 'all': every shown part
     *          (parts a step hides are left out)
     *   view   a view name ('front', 'front-left', … as setView) or 'access': from the side the main
     *          part comes out of (its explode direction, leaned towards the model's own view: a
     *          battery that comes out downwards is seen from below and in front)
     *   dir    [x, y, z]: from that side (from the model towards the camera, the spec's axes:
     *          +x front, +y up, +z right); 'access' as view. Neither: the direction stays.
     *   ms     the move's length (750 by default); with an explode under way it lasts until the
     *          explode ends. Reduced motion, or a hidden view: a cut.
     * The framing follows parts that still move. Resolves 'arrived'; 'touch' when the owner takes
     * the camera first (a press, drag, pinch or wheel on the model, or a zoom); 'replaced' when
     * another camera move (a newer flyTo, focus, isolate, a view, reset) takes over, or on dispose.
     */
    flyTo,
    resetView,
    zoom(factor) {
      zoomBy(factor);
      markInteraction();
      requestRender();
    },
    setInsets(next) {
      insets = { top: 0, right: 0, bottom: 0, left: 0, ...next };
      updateProjection();
      if (fitMode !== 'user') refit(true);
      requestRender();
    },
    /**
     * Small thumbnail (data URL) of the current model for the saved library: 256×192 PNG by default
     * (about 25-60 kB); pass { type: 'image/jpeg' } for a smaller one. Labels are not included.
     * view: a camera preset name ('front-left', …) instead of the current camera direction.
     */
    snapshot({ width: w = 256, height: h = 192, type = 'image/png', quality = 0.85, view = null } = {}) {
      if (!renderer || contextLost || !records.size) return null;
      w = Math.max(16, Math.round(w));
      h = Math.max(16, Math.round(h));
      const preset = view && VIEW_ANGLES[view] ? VIEW_ANGLES[view] : null;
      const theta = preset ? preset[0] * DEG : orbit.theta;
      const phi = preset ? preset[1] * DEG : orbit.phi;
      const rt = new WebGLRenderTarget(w, h, { samples: 4 });
      const c2 = new PerspectiveCamera(BASE_FOV, w / h, 1, 1e6);
      const f = fitView(theta, phi, explodeT, isolatedKey, h, { left: 0, right: 0, top: 0, bottom: 0, w: w * 0.96, h: h * 0.96 });
      if (!f) {
        rt.dispose();
        return null;
      }
      const sp = Math.sin(phi);
      c2.position.set(f.target.x + f.radius * sp * Math.sin(theta), f.target.y + f.radius * Math.cos(phi), f.target.z + f.radius * sp * Math.cos(theta));
      c2.lookAt(f.target);
      c2.near = Math.max(f.radius * 0.01, f.radius - modelRadius * 6);
      c2.far = f.radius + modelRadius * 8;
      c2.updateProjectionMatrix();
      const saved = {
        time: shared.uTime.value,
        res: bgMat.uniforms.uRes.value.clone(),
        center: bgMat.uniforms.uCenter.value.clone(),
        fade: shared.uFade.value.clone(),
        flicker: shared.uFlicker.value,
        scanY: shared.uScanY.value,
      };
      shared.uTime.value = 1e5;
      shared.uFlicker.value = 1;
      shared.uRows.value = 0;
      shared.uScanY.value = -1e9; // no scan band
      floorMat.uniforms.uGrid.value = 0;
      shared.uFade.value.set(f.radius - modelRadius * 0.9, f.radius + modelRadius * 1.1);
      bgMat.uniforms.uRes.value.set(w, h);
      bgMat.uniforms.uCenter.value.set(w / 2, h / 2);
      const pixels = new Uint8Array(w * h * 4);
      try {
        renderer.setRenderTarget(rt);
        renderer.render(scene, c2);
        renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
      } finally {
        renderer.setRenderTarget(null);
        rt.dispose();
        shared.uTime.value = saved.time;
        shared.uFlicker.value = saved.flicker;
        shared.uRows.value = 1;
        shared.uScanY.value = saved.scanY;
        floorMat.uniforms.uGrid.value = 1;
        shared.uFade.value.copy(saved.fade);
        bgMat.uniforms.uRes.value.copy(saved.res);
        bgMat.uniforms.uCenter.value.copy(saved.center);
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      ctx.putImageData(img, 0, 0);
      requestRender();
      return type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL(type, quality);
    },
    /**
     * Resolves (true) once every hull and panel shows its final mesh, or (false) after timeoutMs:
     * a snapshot taken then shows the finished model.
     */
    settled(timeoutMs = 5000) {
      if (disposed || !asyncPending()) return Promise.resolve(!disposed);
      return new Promise((resolve) => {
        let done = false;
        const finish = (v) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(v);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        settleWaiters.push(finish);
      });
    },
    listParts() {
      return Array.from(records.values()).map(publicPart);
    },
    getPart(id) {
      const key = keyOfId(id);
      return key ? publicPart(records.get(key)) : null;
    },
    getState,
    /** The walkthrough's renderer target (contract (e)): see `target` below. The same object every time. */
    tourTarget: () => target,
    resize: measure,
    /** Debug/benchmark: renders n frames synchronously (forcing GPU completion), returns ms per frame. */
    debugBench(n = 30) {
      if (!renderer || !width) return null;
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const t = performance.now();
      for (let i = 0; i < n; i++) {
        orbit.theta += 0.01;
        applyCamera();
        renderer.render(scene, cam);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      const ms = (performance.now() - t) / n;
      const info = renderer.info;
      return { msPerFrame: ms, drawCalls: info.render.calls, triangles: info.render.triangles, lines: info.render.lines, geometries: info.memory.geometries, programs: info.programs ? info.programs.length : null, width, height, dpr };
    },
    /** Debug: switch layers on/off to see what a frame costs ({ fills, lines, floor, background, doubleSided }). */
    debugToggle({ fills = true, lines = true, floor: showFloor = true, background = true, doubleSided = true } = {}) {
      for (const rec of records.values()) {
        if (rec.fill) rec.fill.visible = fills;
        if (rec.lines) rec.lines.visible = lines;
        const side = doubleSided ? DoubleSide : FrontSide;
        if (rec.mats.fill.side !== side) {
          rec.mats.fill.side = side;
          rec.mats.fill.needsUpdate = true;
        }
      }
      floorEnabled = showFloor;
      bg.visible = background;
      requestRender();
    },
    /** Debug/tests: the camera (degrees), a move under way, rotation, and each part's look (now and goal). */
    debugState() {
      const deg = (r) => Math.round((wrapAngle(r) / DEG) * 100) / 100;
      const idOf = (key) => (records.has(key) ? records.get(key).part.id : key);
      const fit = currentFitGoal('view');
      return {
        camera: { theta: deg(orbit.theta), phi: deg(orbit.phi), radius: orbit.radius, target: orbit.target.toArray(), fitMode, focus: focusKeys ? Array.from(focusKeys).map(idOf) : null, view: viewName },
        fit: fit ? { radius: fit.radius, target: fit.target.toArray() } : null,
        moving: !!camTween,
        flying: !!(camTween && camTween.done),
        tracking: tracking(),
        exploding: !!explodeAnim,
        explodeT,
        rotating: autoRotating(),
        rotateHeld,
        pulseLive,
        awake,
        parts: Array.from(records.values()).map((rec) => ({
          id: rec.part.id,
          role: roleOf(rec),
          vis: rec.vis,
          visGoal: rec.visGoal,
          fill: rec.fillK,
          fillGoal: rec.fillKGoal,
          sel: rec.sel,
          selGoal: rec.selGoal,
          pulse: rec.pulse,
          pulseGoal: rec.pulseGoal,
          label: rec.label.shown,
        })),
      };
    },
    debugInfo() {
      const info = renderer ? renderer.info : null;
      return {
        records: records.size,
        geometries: info ? info.memory.geometries : null,
        textures: info ? info.memory.textures : null,
        programs: info && info.programs ? info.programs.length : null,
        awake,
        dpr,
        ...counters,
        triangles: builtTriangles(),
        meshes: asyncSummary(),
        hullJobs: hullJobsPending(),
        hullPending: asyncPending(),
        hullStats: hullStats(),
        frameMs: frameTimes.slice(-30),
      };
    },
    dispose() {
      if (disposed) return;
      stopFlight('replaced');
      if (explodeAnim) for (const fn of explodeAnim.done) fn('replaced');
      explodeAnim = null;
      disposed = true;
      offHull();
      win.clearTimeout(landTimer);
      resolveSettled();
      if (rafId) win.cancelAnimationFrame(rafId);
      clearTimeout(restoreTimer);
      win.clearTimeout(rotateWake);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      win.removeEventListener('resize', onWindowResize);
      doc.removeEventListener('visibilitychange', onVisibility);
      unwatchCover();
      reducedMq.off();
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerUp);
      root.removeEventListener('pointerleave', onPointerLeave);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('contextmenu', preventMenu);
      root.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('webglcontextlost', onContextLost, false);
      canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
      for (const rec of records.values()) disposeRecord(rec);
      records.clear();
      bgGeo.dispose();
      bgMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      try {
        renderer.dispose();
        renderer.forceContextLoss();
      } catch {
        /* already lost */
      }
      renderer = null;
      root.remove();
    },
  };

  /**
   * The renderer target of a walkthrough (contract (e), SPEC §29.2): the one object a tour player
   * drives. It never touches the viewer's DOM, and every renderer gives one (the viewer's, a
   * Screens panel's): holo.tourTarget().
   *   setEmphasis({ glow, ghost, hide, others } | null)  a step's look, part by part (setEmphasis)
   *   flyTo({ ids, frame, view | dir, ms }) → Promise<'arrived' | 'touch' | 'replaced'>  (flyTo)
   *   explode(t, animate = true) → Promise<'arrived' | 'replaced'>  when the parts stop moving
   *   focus(id | null), select(id | null) → false for an unknown id (as the viewer's commands;
   *     select shows the viewer's part card)
   *   setLabels(on): true (every part's label), false (none) or [ids] (only those parts')
   *   settled(ms) → Promise<boolean>  every mesh is final: start a tour after it
   *   holdAutoRotate(on)  idle rotation off for the tour (true), given back after (false)
   *   parts() → [{ id, name, group, groupName, tone, info, material, aka, shell }]
   *   getState() → the renderer's state (exploded, selected, emphasis, labelsFor, flying, rotateHeld, …)
   */
  const target = Object.freeze({
    setEmphasis: (next) => setEmphasis(next),
    flyTo: (opts) => flyTo(opts),
    explode: (t, animate) => api.explode(t, animate),
    focus: (id) => api.focus(id),
    select: (id) => api.select(id),
    setLabels(on) {
      api.labelsFor(Array.isArray(on) ? on : null);
      api.setLabels(Array.isArray(on) || !!on);
    },
    settled: (ms) => api.settled(ms),
    holdAutoRotate: (on) => api.holdAutoRotate(on),
    parts: () => Array.from(records.values()).map((rec) => ({ ...publicPart(rec), shell: shellIds().has(rec.part.id) })),
    getState: () => getState(),
  });

  measure();
  updateAwake();
  emit();
  return api;
}

function noopController(root) {
  const nothing = () => null;
  const arrived = () => Promise.resolve('arrived'); // nothing moves without WebGL
  const target = Object.freeze({
    setEmphasis: NOOP,
    flyTo: arrived,
    explode: arrived,
    focus: () => false,
    select: () => false,
    setLabels: NOOP,
    settled: () => Promise.resolve(false),
    holdAutoRotate: NOOP,
    parts: () => [],
    getState: () => ({ ready: false, error: 'webgl' }),
  });
  return {
    updateSpec: nothing,
    setSpec: nothing,
    explode: arrived,
    setLabels: NOOP,
    select: () => false,
    focus: () => false,
    isolate: () => false,
    setView: () => false,
    autoRotate: NOOP,
    holdAutoRotate: NOOP,
    setEmphasis: NOOP,
    labelsFor: NOOP,
    flyTo: arrived,
    resetView: NOOP,
    zoom: NOOP,
    setInsets: NOOP,
    snapshot: nothing,
    settled: () => Promise.resolve(false),
    listParts: () => [],
    getPart: nothing,
    getState: () => ({ ready: false, error: 'webgl' }),
    tourTarget: () => target,
    resize: NOOP,
    debugBench: nothing,
    debugState: nothing,
    debugInfo: nothing,
    dispose() {
      root.remove();
    },
  };
}
