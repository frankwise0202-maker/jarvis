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
//   holo.listParts() / getPart(id) / getState() / dispose()
//
// Look: translucent additive fills with a fresnel rim, crisp edge lines, depth fade, a scan band
// and fine scan rows, a projector floor, tone colors; the selected part glows and the rest dims.
// Labels are HTML (textContent only) with SVG leaders, decluttered by label-layout.js.
//
// Cost control: renders on demand only (interaction, tweens, the materialize sweep, auto-rotate at
// up to 30 fps), sleeps while the page is hidden, the view is off-screen or covered by an inert
// overlay; DPR capped at 2. WebGL context loss pauses it with a notice and it recovers on restore
// (or the owner taps Restart). dispose() frees every geometry, material and the GL context.

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
import { normalizeHologramSpec, DEFAULT_VIEW } from '../../lib/hologram-spec.js';
import { buildShapeChunk, mergeChunks } from './geometry.js';
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

function watchMedia(query, fn) {
  let mq = null;
  try {
    mq = window.matchMedia ? window.matchMedia(query) : null;
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

function el(tag, className, text) {
  const node = document.createElement(tag);
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

  // ---------------------------------------------------------------------------------------------
  // DOM

  const root = el('div', 'holo');
  const canvas = el('canvas', 'holo__canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Hologram');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'holo__leaders');
  svg.setAttribute('aria-hidden', 'true');
  const labelsEl = el('div', 'holo__labels');
  labelsEl.setAttribute('aria-hidden', 'true');
  const notice = el('div', 'holo__notice');
  notice.hidden = true;
  const noticeText = el('p', 'holo__notice-text');
  const noticeBtn = el('button', 'holo__notice-btn', 'Restart 3D view');
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
    requestRender();
    emit();
  });
  let labelsOn = o.labels !== false;
  // Reduced motion: no automatic rotation (even if the app asks for it at creation); an explicit
  // request from the owner later ("spin it", the Rotate button) is honored.
  let autoRotateOn = o.autoRotate !== false && !reducedMq.matches;
  let rotateRequested = false;

  // Orbit camera: target + spherical (radius, theta azimuth from +z towards +x, phi polar from +y).
  const orbit = { target: new Vector3(), radius: 10, theta: 135 * DEG, phi: 66 * DEG };
  let viewName = DEFAULT_VIEW;
  let camTween = null; // { from, to, start, dur }
  let fitMode = 'auto'; // 'auto': follows the model's bounds; 'user': the owner moved the camera; 'part': focused on a part
  let focusKey = null;
  const inertia = { theta: 0, phi: 0 };
  // rotateAfterMs: idle auto-rotation starts that long after opening (the spec's own view first)
  let lastInteraction = o.rotateAfterMs > 0 ? performance.now() - AUTO_ROTATE_RESUME_MS + o.rotateAfterMs : -Infinity; // ms
  let rotateSince = performance.now(); // auto-rotation (re)started: opened, or asked to rotate
  let modelRadius = 1;

  let explodeT = 0;
  let explodeGoal = 0;
  let explodeAnim = null; // { from, to, start, dur }

  let cameraTouched = false; // the owner rotated, zoomed, panned or picked a view
  let appliedSpecView = null;
  let selectedKey = null;
  let hoverKey = null;
  let isolatedKey = null;
  let labelsHidden = 0;
  const prevSlots = new Map();

  const t0 = performance.now();
  const clock = () => (performance.now() - t0) / 1000;
  const counters = { frames: 0, shapesBuilt: 0, shapesRebuilt: 0, partsCreated: 0, labelMs: 0 };
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
      vis: 1,
      visGoal: 1,
      sel: 0,
      selGoal: 0,
      hov: 0,
      hovGoal: 0,
      label: null,
    };
    model.add(group);
    records.set(part.key, rec);
    counters.partsCreated++;
    createLabel(rec);
    return rec;
  }

  function setShapes(rec, shapes, bornAt, stagger) {
    const sigs = shapes.map((s) => JSON.stringify(s));
    let same = 0;
    while (same < rec.chunks.length && same < sigs.length && rec.chunks[same].sig === sigs[same]) same++;
    if (same === rec.chunks.length && same === sigs.length) return false;
    // keep the unchanged prefix (and its arrival times), build only the new shapes
    counters.shapesRebuilt += rec.chunks.length - same; // shapes replaced (never expected while streaming)
    rec.chunks.length = same;
    rec.born.length = same;
    for (let j = same; j < shapes.length; j++) {
      rec.chunks.push({ sig: sigs[j], chunk: buildShapeChunk(shapes[j]) });
      counters.shapesBuilt++;
      const b = bornAt + stagger * (j - same);
      rec.born.push(b);
      if (b > lastBorn) lastBorn = b;
    }
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
    return true;
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
        if (setShapes(rec, part.shapes, cursor, stagger)) changed = true;
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

  /** { min, max } of visible parts at explode t (onlyKey: one part). */
  function boundsAt(t, visibleOnly = true, onlyKey = null) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const off = new Vector3();
    for (const rec of records.values()) {
      if (!rec.box) continue;
      if (onlyKey && rec.key !== onlyKey) continue;
      if (visibleOnly && !onlyKey && isolatedKey && rec.key !== isolatedKey) continue;
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
   * Exact fit for one camera direction (theta, phi): the corners of every visible part's box are
   * projected, the target is centered on their extent and the distance is the smallest one that
   * keeps every corner inside the visible region (perspective included).
   */
  function fitView(theta, phi, t = explodeT, onlyKey = null, H = height, region = visibleRegion()) {
    const sp = Math.sin(phi);
    const back = new Vector3(sp * Math.sin(theta), Math.cos(phi), sp * Math.cos(theta)); // towards the camera
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), back);
    if (right.lengthSq() < 1e-8) right.set(Math.cos(theta), 0, -Math.sin(theta));
    right.normalize();
    const up = new Vector3().crossVectors(back, right).normalize();
    const pts = [];
    const off = new Vector3();
    for (const rec of records.values()) {
      if (!rec.box) continue;
      if (onlyKey ? rec.key !== onlyKey : isolatedKey && rec.key !== isolatedKey) continue;
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

  /** Where the camera should be: exact fit for the current view, or rotation-safe while auto-rotating. */
  function currentFitGoal(kind = autoRotating() ? 'orbit' : 'view', theta = orbit.theta, phi = orbit.phi) {
    const onlyKey = fitMode === 'part' && focusKey && records.has(focusKey) ? focusKey : null;
    let f;
    if (kind === 'orbit') {
      const b = onlyKey ? boundsAt(explodeT, true, onlyKey) : boundsAt(explodeT, true);
      f = b ? fitOrbit(b, phi) : null;
    } else f = fitView(theta, phi, explodeT, onlyKey);
    if (f && onlyKey) partFit(f);
    return f;
  }

  function snapFit() {
    const f = currentFitGoal();
    if (!f) return;
    orbit.target.copy(f.target);
    orbit.radius = f.radius;
    camTween = null;
    modelRadius = Math.max(modelRadius, f.rxz);
  }

  function refit(animate) {
    const f = currentFitGoal();
    if (!f) return;
    tweenCamera({ target: f.target, radius: f.radius }, animate);
  }

  /** Animate the camera to `to` ({ target?, radius?, theta?, phi? }); fields left out are not touched. */
  function tweenCamera(to, animate = true) {
    if (!animate || reducedMq.matches) {
      if (to.target) orbit.target.copy(to.target);
      if (to.radius !== undefined) orbit.radius = to.radius;
      if (to.theta !== undefined) orbit.theta = to.theta;
      if (to.phi !== undefined) orbit.phi = to.phi;
      camTween = null;
      requestRender();
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
      dur: CAMERA_MS,
    };
    requestRender();
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
    const ratio = Math.max(1, Math.min(o.maxDpr || MAX_DPR, Math.max(1, window.devicePixelRatio || 1)) * dprScale);
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
    const box = el('div', 'holo-label');
    box.dataset.key = rec.key;
    const text = el('span', 'holo-label__text');
    box.append(text);
    labelsEl.append(box);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'holo-leader');
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', 'holo-anchor');
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
      const visible = labelsOn && L.name && rec.box && revealed && rec.vis > 0.3 && (!isolatedKey || rec.key === isolatedKey);
      if (!visible) continue;
      anchorOf(rec, v).project(cam);
      if (v.z > 1 || v.z < -1) continue;
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      // on-screen size as priority
      const pxPerUnit = height / (2 * Math.max(1e-6, cam.position.distanceTo(anchorOf(rec, new Vector3()))) * Math.tan((BASE_FOV * DEG) / 2));
      live.push({ id: rec.key, x, y, w: L.w, h: L.h, priority: rec.size * pxPerUnit + (rec.key === hoverKey ? 1e6 : 0), pinned: rec.key === selectedKey });
    }
    const center = Number.isFinite(mx0) ? { x: (mx0 + mx1) / 2, y: (my0 + my1) / 2 } : { x: width / 2, y: height / 2 };
    const candidates = live.length;
    // Label budget: assembled, a compact model only gets labels for its biggest parts (about one
    // per LABEL_AREA px² of view); exploded, every part may be labeled if there is room. The
    // selected and hovered parts are always included.
    const area = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
    const perLabel = LABEL_AREA + (LABEL_AREA_EXPLODED - LABEL_AREA) * explodeT;
    const budget = isolatedKey ? Infinity : Math.round(Math.max(MIN_LABELS, area / perLabel));
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
      const state = rec.key === selectedKey ? 'sel' : rec.key === hoverKey ? 'hov' : '';
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
    floor.visible = floorEnabled;
  }

  // ---------------------------------------------------------------------------------------------
  // Selection, isolation, visibility goals

  function updateVisGoals() {
    for (const rec of records.values()) {
      let vis = 1;
      if (isolatedKey && rec.key !== isolatedKey) vis = 0;
      else if (selectedKey && rec.key !== selectedKey && !isolatedKey) vis = 0.38;
      rec.visGoal = vis;
      rec.selGoal = rec.key === selectedKey ? 1 : 0;
      rec.hovGoal = rec.key === hoverKey && rec.key !== selectedKey ? 1 : 0;
    }
    floorMat.uniforms.uVis.value = 1;
    requestRender();
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
    if (awake && !rafId && !disposed) rafId = requestAnimationFrame(frame);
  }

  function autoRotating() {
    if (!autoRotateOn || (reducedMq.matches && !rotateRequested) || gesture || selectedKey || camTween || !records.size) return false;
    const now = performance.now();
    const idle = now - Math.max(lastInteraction, rotateSince);
    return now - lastInteraction > AUTO_ROTATE_RESUME_MS && idle < AUTO_ROTATE_MAX_MS;
  }

  function stepAnimations(dt, nowMs) {
    let busy = false;
    const now = clock();
    shared.uTime.value = now;

    // camera tween
    if (camTween) {
      const t = Math.min(1, (nowMs - camTween.start) / camTween.dur);
      const e = easeInOut(t);
      const f = camTween.from;
      const g = camTween.to;
      if (g.target) orbit.target.lerpVectors(f.target, g.target, e);
      if (g.radius !== undefined) orbit.radius = f.radius + (g.radius - f.radius) * e;
      if (g.theta !== undefined) orbit.theta = f.theta + (g.theta - f.theta) * e;
      if (g.phi !== undefined) orbit.phi = f.phi + (g.phi - f.phi) * e;
      if (t >= 1) camTween = null;
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
      if (fitMode === 'auto' || fitMode === 'part') {
        const f = currentFitGoal();
        if (f && !camTween) {
          const k = t >= 1 ? 1 : Math.min(1, dt * 8);
          orbit.target.lerp(f.target, k);
          orbit.radius += (f.radius - orbit.radius) * k;
        }
      }
      if (t >= 1) explodeAnim = null;
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
    // per-part easing (visibility, selection, hover)
    const k = reducedMq.matches ? 1 : Math.min(1, dt * 9);
    const off = new Vector3();
    for (const rec of records.values()) {
      offsetOf(rec, explodeT, off);
      if (!rec.group.position.equals(off)) rec.group.position.copy(off);
      for (const [cur, goal] of [
        ['vis', 'visGoal'],
        ['sel', 'selGoal'],
        ['hov', 'hovGoal'],
      ]) {
        const d = rec[goal] - rec[cur];
        if (Math.abs(d) > 0.003) {
          rec[cur] += d * k;
          busy = true;
        } else rec[cur] = rec[goal];
      }
      rec.mats.fill.uniforms.uVis.value = rec.vis;
      rec.mats.line.uniforms.uVis.value = rec.vis;
      rec.mats.fill.uniforms.uSel.value = rec.sel;
      rec.mats.line.uniforms.uSel.value = rec.sel;
      rec.mats.fill.uniforms.uHover.value = rec.hov;
      rec.mats.line.uniforms.uHover.value = rec.hov;
      rec.group.visible = rec.vis > 0.01;
    }
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
  function frame(nowMs) {
    rafId = 0;
    if (!awake || disposed || contextLost) return;
    const continuous = autoRotating();
    const busyBefore = camTween || explodeAnim || gesture || needsRender;
    if (!busyBefore && continuous && lastFrame && nowMs - lastFrame < 1000 / IDLE_FPS - 2) {
      rafId = requestAnimationFrame(frame);
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
    if (busy || needsRender || autoRotating()) rafId = requestAnimationFrame(frame);
    else lastFrame = 0;
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
    const should = !disposed && !contextLost && !document.hidden && inView && width > 0 && height > 0 && root.isConnected && !root.closest('[inert]');
    if (should === awake) return;
    awake = should;
    if (awake) {
      lastFrame = 0;
      requestRender();
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => measure());
    ro.observe(root);
  }
  const onWindowResize = () => measure();
  window.addEventListener('resize', onWindowResize);
  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(
      (entries) => {
        inView = entries[entries.length - 1].isIntersecting;
        updateAwake();
      },
      { rootMargin: '32px' },
    );
    io.observe(root);
  }
  const onVisibility = () => updateAwake();
  document.addEventListener('visibilitychange', onVisibility);
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
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Public API

  function focusKeyFn(key) {
    if (!key) {
      focusKey = null;
      fitMode = 'auto';
      refit(true);
      return;
    }
    selectKey(key);
    focusKey = key;
    fitMode = 'part';
    const f = currentFitGoal('view');
    if (f) tweenCamera({ target: f.target, radius: f.radius });
    emit();
  }

  function resetView() {
    focusKey = null;
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
    explode(t = 1, animate = true) {
      const goal = Math.min(1, Math.max(0, Number(t) || 0));
      explodeGoal = goal;
      if (fitMode === 'user') fitMode = 'auto';
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
      } else {
        explodeAnim = { from: explodeT, to: goal, start: performance.now(), dur: EXPLODE_MS * Math.max(0.35, Math.abs(goal - explodeT)) };
      }
      requestRender();
      emit();
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
      isolatedKey = key;
      if (key) {
        selectKey(key);
        focusKey = key;
        fitMode = 'part';
      } else {
        focusKey = null;
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
        lastInteraction = -Infinity;
        rotateSince = performance.now();
      }
      requestRender();
      emit();
    },
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
    listParts() {
      return Array.from(records.values()).map(publicPart);
    },
    getPart(id) {
      const key = keyOfId(id);
      return key ? publicPart(records.get(key)) : null;
    },
    getState,
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
        frameMs: frameTimes.slice(-30),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(restoreTimer);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onVisibility);
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

  measure();
  updateAwake();
  emit();
  return api;
}

function noopController(root) {
  const nothing = () => null;
  return {
    updateSpec: nothing,
    setSpec: nothing,
    explode: NOOP,
    setLabels: NOOP,
    select: () => false,
    focus: () => false,
    isolate: () => false,
    setView: () => false,
    autoRotate: NOOP,
    resetView: NOOP,
    zoom: NOOP,
    setInsets: NOOP,
    snapshot: nothing,
    listParts: () => [],
    getPart: nothing,
    getState: () => ({ ready: false, error: 'webgl' }),
    resize: NOOP,
    debugBench: nothing,
    debugInfo: nothing,
    dispose() {
      root.remove();
    },
  };
}
