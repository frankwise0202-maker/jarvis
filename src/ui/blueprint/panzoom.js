// Pan and zoom for one "stage" element (shared by the blueprint and photo viewers).
//
//   const pz = createPanZoom(stage, {
//     size: { width, height },          // content size in content units
//     apply(view, stageRect),           // draw: view = { scale, x, y } (content (0,0) -> stage px (x, y))
//     onTap({ target, clientX, clientY }),  // a short tap or click that did not pan
//     maxZoom: 12,                      // relative to the fitted scale
//     insets: () => ({ right: 64 }),    // px to keep clear when fitting (floating buttons)
//   });
//   pz.fit(animate) pz.zoomBy(factor, clientX?, clientY?, animate) pz.centerOn(x, y, scale?, animate)
//   pz.setSize({ width, height }) pz.view() pz.fitScale() pz.destroy()
//
// Input: one-finger or mouse drag pans; two-finger pinch zooms and pans; wheel (and trackpad
// pinch, which arrives as ctrl+wheel) zooms at the pointer; double-tap or double-click zooms in
// (again: back to fit); keyboard on the focused stage: + - 0 and arrow keys. Pointer Events only
// (iOS 13+, every current browser). The stage needs `touch-action: none` (set here).
// Animations respect prefers-reduced-motion. A ResizeObserver keeps the view sensible.

const TAP_MOVE = 8; // px
const TAP_TIME = 450; // ms
const DOUBLE_TAP_TIME = 320; // ms
const DOUBLE_TAP_DIST = 32; // px

export function createPanZoom(stage, opts = {}) {
  let size = { width: Math.max(1, opts.size?.width || 1), height: Math.max(1, opts.size?.height || 1) };
  const apply = typeof opts.apply === 'function' ? opts.apply : () => {};
  const onTap = typeof opts.onTap === 'function' ? opts.onTap : null;
  const maxZoom = opts.maxZoom || 12;
  const padding = opts.padding ?? 12;
  // Space to keep clear when fitting (e.g. floating buttons): { top, right, bottom, left } px.
  const insets = () => {
    const i = typeof opts.insets === 'function' ? opts.insets() || {} : {};
    return { top: padding + (i.top || 0), right: padding + (i.right || 0), bottom: padding + (i.bottom || 0), left: padding + (i.left || 0) };
  };
  let rect = { width: 1, height: 1, left: 0, top: 0 };
  let view = { scale: 1, x: 0, y: 0 };
  let fitted = true; // still showing the fitted view (resizes refit)
  let frame = 0;
  let anim = 0;
  const pointers = new Map();
  let gesture = null;
  let lastTap = null;
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  stage.style.touchAction = 'none';
  if (!stage.hasAttribute('tabindex')) stage.setAttribute('tabindex', '0');

  function measure() {
    const r = stage.getBoundingClientRect();
    rect = { width: Math.max(1, r.width), height: Math.max(1, r.height), left: r.left, top: r.top };
  }

  function fitScale() {
    const i = insets();
    return Math.max(1e-4, Math.min((rect.width - i.left - i.right) / size.width, (rect.height - i.top - i.bottom) / size.height));
  }

  function limits() {
    const f = fitScale();
    return { min: f * 0.85, max: Math.max(f * maxZoom, 4) };
  }

  /** Keep the content on screen: centred when smaller than the stage, else edges within reach. */
  function clampView(v) {
    const { min, max } = limits();
    const scale = Math.min(max, Math.max(min, v.scale));
    const w = size.width * scale;
    const h = size.height * scale;
    const i = insets();
    const slack = 48;
    let x = v.x;
    let y = v.y;
    // Smaller than the free area: centre it there. Larger: keep its edges within reach.
    if (w + i.left + i.right <= rect.width + 0.5) x = i.left + (rect.width - i.left - i.right - w) / 2;
    else x = Math.min(slack, Math.max(rect.width - w - slack, x));
    if (h + i.top + i.bottom <= rect.height + 0.5) y = i.top + (rect.height - i.top - i.bottom - h) / 2;
    else y = Math.min(slack, Math.max(rect.height - h - slack, y));
    return { scale, x, y };
  }

  function render() {
    frame = 0;
    apply({ ...view }, rect);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function set(v, { animate = false } = {}) {
    const target = clampView(v);
    cancelAnimationFrame(anim);
    anim = 0;
    if (!animate || reduced()) {
      view = target;
      schedule();
      return;
    }
    const from = { ...view };
    const start = performance.now();
    const dur = 260;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - (1 - t) ** 3;
      // Interpolate the scale geometrically so zooming feels even.
      const scale = from.scale * (target.scale / from.scale) ** e;
      view = { scale, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
      apply({ ...view }, rect);
      anim = t < 1 ? requestAnimationFrame(step) : 0;
    };
    anim = requestAnimationFrame(step);
  }

  function fit(animate = false) {
    measure();
    const s = fitScale();
    const i = insets();
    fitted = true;
    set({ scale: s, x: i.left + (rect.width - i.left - i.right - size.width * s) / 2, y: i.top + (rect.height - i.top - i.bottom - size.height * s) / 2 }, { animate });
  }

  /** Zoom by `factor` keeping the content point under (sx, sy) (stage px) fixed. */
  function zoomAtStage(factor, sx, sy, animate) {
    const { min, max } = limits();
    const scale = Math.min(max, Math.max(min, view.scale * factor));
    const px = (sx - view.x) / view.scale;
    const py = (sy - view.y) / view.scale;
    fitted = false;
    set({ scale, x: sx - px * scale, y: sy - py * scale }, { animate });
  }

  function zoomBy(factor, clientX, clientY, animate = true) {
    measure();
    const sx = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    const sy = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    zoomAtStage(factor, sx, sy, animate);
  }

  /** Centre content point (x, y) at `scale` (default: the current scale). */
  function centerOn(x, y, scale = view.scale, animate = true) {
    measure();
    fitted = false;
    set({ scale, x: rect.width / 2 - x * scale, y: rect.height / 2 - y * scale }, { animate });
  }

  // ---- pointers -------------------------------------------------------------------------------

  function local(e) {
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startPinch() {
    const [a, b] = Array.from(pointers.values());
    gesture = {
      kind: 'pinch',
      view: { ...view },
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      moved: true,
    };
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    measure();
    cancelAnimationFrame(anim);
    anim = 0;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      const p = local(e);
      gesture = { kind: 'pan', start: p, view: { ...view }, moved: false, time: performance.now(), target: e.target, clientX: e.clientX, clientY: e.clientY };
    } else if (pointers.size === 2) startPinch();
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, local(e));
    if (gesture.kind === 'pan' && pointers.size === 1) {
      const p = local(e);
      const dx = p.x - gesture.start.x;
      const dy = p.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) < TAP_MOVE) return;
      gesture.moved = true;
      fitted = false;
      view = clampView({ scale: gesture.view.scale, x: gesture.view.x + dx, y: gesture.view.y + dy });
      schedule();
    } else if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const { min, max } = limits();
      const scale = Math.min(max, Math.max(min, gesture.view.scale * (dist / gesture.dist)));
      const px = (gesture.mid.x - gesture.view.x) / gesture.view.scale;
      const py = (gesture.mid.y - gesture.view.y) / gesture.view.scale;
      fitted = false;
      view = clampView({ scale, x: mid.x - px * scale, y: mid.y - py * scale });
      schedule();
    }
  }

  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const g = gesture;
    if (pointers.size === 1) {
      // Pinch ended with one finger still down: continue as a pan from here (no jump).
      const [p] = Array.from(pointers.values());
      gesture = { kind: 'pan', start: p, view: { ...view }, moved: true, time: 0, target: null };
      return;
    }
    if (pointers.size > 0) return;
    gesture = null;
    if (!g || g.kind !== 'pan' || g.moved || e.type === 'pointercancel') return;
    if (performance.now() - g.time > TAP_TIME) return;
    const now = performance.now();
    const p = local(e);
    if (lastTap && now - lastTap.time < DOUBLE_TAP_TIME && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < DOUBLE_TAP_DIST) {
      lastTap = null;
      if (view.scale > fitScale() * 2.2) fit(true);
      else zoomAtStage(2.5, p.x, p.y, true);
      return;
    }
    lastTap = { time: now, x: p.x, y: p.y };
    if (onTap) onTap({ target: g.target, clientX: g.clientX, clientY: g.clientY });
  }

  function onWheel(e) {
    e.preventDefault();
    measure();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= rect.height;
    const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0018));
    const p = local(e);
    zoomAtStage(factor, p.x, p.y, false);
  }

  function onKey(e) {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const step = 60;
    let handled = true;
    if (e.key === '+' || e.key === '=') zoomBy(1.4);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.4);
    else if (e.key === '0') fit(true);
    else if (e.key === 'ArrowLeft') set({ ...view, x: view.x + step }, { animate: true });
    else if (e.key === 'ArrowRight') set({ ...view, x: view.x - step }, { animate: true });
    else if (e.key === 'ArrowUp') set({ ...view, y: view.y + step }, { animate: true });
    else if (e.key === 'ArrowDown') set({ ...view, y: view.y - step }, { animate: true });
    else handled = false;
    if (handled) {
      fitted = false;
      e.preventDefault();
    }
  }

  // Safari fires its own gesture events for pinches; the pointer handlers above do the work.
  const stopGesture = (e) => e.preventDefault();

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('keydown', onKey);
  stage.addEventListener('gesturestart', stopGesture);
  stage.addEventListener('gesturechange', stopGesture);

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => {
      const before = { ...rect };
      measure();
      if (fitted) fit(false);
      else {
        // Keep the same content point in the middle of the stage.
        const cx = (before.width / 2 - view.x) / view.scale;
        const cy = (before.height / 2 - view.y) / view.scale;
        set({ scale: view.scale, x: rect.width / 2 - cx * view.scale, y: rect.height / 2 - cy * view.scale });
      }
    });
    ro.observe(stage);
  }
  measure();
  fit(false);

  return {
    fit,
    zoomBy,
    centerOn,
    fitScale: () => {
      measure();
      return fitScale();
    },
    view: () => ({ ...view }),
    isFitted: () => fitted,
    setSize(next, { refit = false } = {}) {
      size = { width: Math.max(1, next.width), height: Math.max(1, next.height) };
      if (refit || fitted) fit(false);
      else set(view);
    },
    destroy() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(anim);
      if (ro) ro.disconnect();
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('keydown', onKey);
      stage.removeEventListener('gesturestart', stopGesture);
      stage.removeEventListener('gesturechange', stopGesture);
    },
  };
}
