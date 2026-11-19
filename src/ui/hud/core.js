// The animated HUD core: concentric segmented rings, tick marks and a glowing core whose color,
// pulse and spin reflect Jarvis's state. In 'orbit' mode the mission's agents circle the core as
// status-colored nodes with live links, and the center reads out how many have finished.
//
//   const core = createCore(canvas, { size: 220, mode: 'hero' });   // 'hero' | 'mini' | 'orbit'
//   core.setState('thinking'); core.setAgents(mission.agents); core.setLevel(0.4); core.destroy();
//   core.celebrate();   // mission-complete burst (orbit/hero; skipped under reduced motion)
//
// Rendering: Canvas 2D, DPR-aware (at most 2× on phones, 3× elsewhere), backing store resized by a
// ResizeObserver. One shared requestAnimationFrame loop drives every awake core; each core caps
// itself at 30fps on small or touch screens (and for the 32px mini orb) and 60fps on desktop. A
// core sleeps while the page is hidden, while its canvas is off-screen, zero-sized, detached or
// covered (inside an `inert` subtree: a sheet or overlay is on top), and under
// prefers-reduced-motion it draws one static frame per change instead of animating. The header's
// mini orb also rests on a static frame after 30s in a resting state and wakes on any change.
//
// Hot path: the per-frame code allocates nothing. Colors are prebuilt strings, glows are sprites
// rendered once per color, tick directions come from precomputed tables, and everything derived
// from agents (labels, colors, counts, readout text) is prepared in setAgents().

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MAX_DPR = 3;
// Phones and tablets: a 2× backing store keeps rings and glows crisp at under half the fill cost of
// 3× (Mission Control's orbit during a big swarm was the heaviest thing on a phone-class CPU).
const MAX_DPR_SMALL = 2;
// The header's mini orb rests on a static frame after this long without news in a resting state
// (idle / offline / error), and wakes on the next change. Saves battery while the app sits open.
const MINI_DOZE_MS = 30000;
const RESTING = new Set(['idle', 'offline', 'error']);

const STATES = ['idle', 'listening', 'thinking', 'working', 'speaking', 'error', 'offline'];

// Per-state targets. Every number eases toward its target, so state changes glide.
//   speed: ring spin multiplier · pulseHz/pulse: core breathing rate/depth · glow: halo strength
//   scan: sweeping scanner arc · bars: level bars (voice) · dim: overall line brightness
const STATE_PARAMS = {
  idle: { color: 'accent', speed: 1, pulseHz: 0.2, pulse: 0.16, glow: 0.85, scan: 0, bars: 0, dim: 1 },
  listening: { color: 'accent2', speed: 1.35, pulseHz: 0.55, pulse: 0.2, glow: 1, scan: 0, bars: 1, dim: 1 },
  thinking: { color: 'violet', speed: 2.1, pulseHz: 0.7, pulse: 0.22, glow: 0.95, scan: 1, bars: 0, dim: 1 },
  working: { color: 'accent', speed: 2.5, pulseHz: 0.9, pulse: 0.24, glow: 1.05, scan: 0.85, bars: 0, dim: 1 },
  speaking: { color: 'accent2', speed: 1.5, pulseHz: 0.8, pulse: 0.2, glow: 1, scan: 0, bars: 1, dim: 1 },
  error: { color: 'err', speed: 0.45, pulseHz: 0.4, pulse: 0.3, glow: 0.9, scan: 0, bars: 0, dim: 0.9 },
  offline: { color: 'mute', speed: 0.2, pulseHz: 0.1, pulse: 0.06, glow: 0.35, scan: 0, bars: 0, dim: 0.55 },
};

const STATE_TEXT = {
  idle: 'standing by',
  listening: 'listening',
  thinking: 'thinking',
  working: 'agents working',
  speaking: 'speaking',
  error: 'error',
  offline: 'offline',
};

// Agent status → palette key, and how the node behaves.
const NODE_COLOR = {
  queued: 'mute',
  starting: 'accent',
  thinking: 'violet',
  searching: 'accent',
  reading: 'accent',
  writing: 'accent2',
  done: 'ok',
  error: 'err',
  stopped: 'warn',
  interrupted: 'warn',
};
const K_WAITING = 0; // queued / unknown
const K_ACTIVE = 1; // starting … writing
const K_DONE = 2;
const K_FAILED = 3; // error
const K_HALTED = 4; // stopped / interrupted
const NODE_KIND = {
  queued: K_WAITING,
  starting: K_ACTIVE,
  thinking: K_ACTIVE,
  searching: K_ACTIVE,
  reading: K_ACTIVE,
  writing: K_ACTIVE,
  done: K_DONE,
  error: K_FAILED,
  stopped: K_HALTED,
  interrupted: K_HALTED,
};
// Speed (cycles/s) of the data pulse that travels along an active agent's link.
const LINK_RATE = { starting: 0.45, thinking: 0.5, searching: 0.95, reading: 0.75, writing: 1.15 };

// ---------------------------------------------------------------------------------------------
// Palette (read from tokens.css custom properties; fallbacks mirror the tokens)

const TOKENS = {
  accent: ['--accent', '#3ee0ff'],
  accent2: ['--accent-2', '#8af3ff'],
  accent3: ['--accent-3', '#1aa8d6'],
  violet: ['--violet', '#a796ff'],
  ok: ['--ok', '#3dffb0'],
  warn: ['--warn', '#ffc457'],
  err: ['--err', '#ff5c72'],
  mute: ['--text-4', '#4f6a7c'],
  text3: ['--text-3', '#7393a8'],
  text: ['--text', '#e1f6ff'],
  bg: ['--bg', '#04070c'],
};
let paletteCache = null;

function parseColor(value) {
  const s = String(value || '').trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
  return null;
}

function getPalette() {
  if (paletteCache) return paletteCache;
  let cs = null;
  try {
    cs = getComputedStyle(document.documentElement);
  } catch {
    cs = null;
  }
  let fromTokens = false;
  const pal = {};
  for (const key of Object.keys(TOKENS)) {
    const [name, fallback] = TOKENS[key];
    let rgb = cs ? parseColor(cs.getPropertyValue(name)) : null;
    if (rgb) fromTokens = true;
    else rgb = parseColor(fallback);
    pal[key] = { key, rgb, css: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` };
  }
  pal.fontMono = (cs && cs.getPropertyValue('--font-mono').trim()) || 'ui-monospace, Menlo, Consolas, monospace';
  if (fromTokens) paletteCache = pal; // stylesheet not applied yet? read again next time
  return pal;
}

// Themes (SPEC 14.3) swap the accent tokens at runtime via <html data-theme> and announce it with
// a window 'jarvis:themechange' event. Either signal re-reads the palette for every live core.
const paletteListeners = new Set();
let themeWatching = false;
let themeQueued = false;

function onThemeSignal() {
  if (themeQueued) return;
  themeQueued = true;
  Promise.resolve().then(() => {
    themeQueued = false;
    const before = paletteCache;
    paletteCache = null;
    const next = getPalette();
    if (before && next.accent.css === before.accent.css && next.bg.css === before.bg.css && next.ok.css === before.ok.css) {
      paletteCache = before; // nothing visible changed: keep the old palette (and its sprites)
      return;
    }
    for (const fn of Array.from(paletteListeners)) fn();
  });
}

// Covered cores sleep: sheets (Settings, History, Mission Control, …), Voice Mode and other
// overlays make everything behind them `inert`, and a canvas inside an inert subtree cannot be
// seen properly or used, so it stops animating (its last frame stays). One observer serves every
// live core: it re-checks them whenever any element's `inert` attribute changes.
const coverListeners = new Set();
let coverObserver = null;

function watchCover(fn) {
  coverListeners.add(fn);
  if (!coverObserver && typeof MutationObserver === 'function') {
    try {
      coverObserver = new MutationObserver(() => {
        for (const listener of Array.from(coverListeners)) listener();
      });
      coverObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['inert'] });
    } catch {
      coverObserver = null; // cores then simply keep animating when covered
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

function watchTheme() {
  if (themeWatching) return;
  themeWatching = true;
  try {
    if (typeof MutationObserver === 'function') {
      new MutationObserver(onThemeSignal).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    window.addEventListener('jarvis:themechange', onThemeSignal);
  } catch {
    /* theme changes then apply to cores created afterwards */
  }
}

// ---------------------------------------------------------------------------------------------
// Glow sprites: radial gradients rendered once per color, then blitted with drawImage. They are
// cached on the palette color object itself so the per-frame lookup is a property read.

function getSprite(color, kind) {
  const slot = kind === 'hot' ? 'hotSprite' : 'softSprite';
  const cached = color[slot];
  if (cached !== undefined) return cached;
  let sprite = null;
  try {
    const size = kind === 'hot' ? 256 : 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (g) {
      const r = size / 2;
      const [R, G, B] = color.rgb;
      const rgba = (a, white = 0) =>
        `rgba(${Math.round(R + (255 - R) * white)}, ${Math.round(G + (255 - G) * white)}, ${Math.round(B + (255 - B) * white)}, ${a})`;
      const grad = g.createRadialGradient(r, r, 0, r, r, r);
      if (kind === 'hot') {
        grad.addColorStop(0, rgba(1, 0.9));
        grad.addColorStop(0.14, rgba(1, 0.55));
        grad.addColorStop(0.32, rgba(0.62, 0.08));
        grad.addColorStop(0.62, rgba(0.16));
        grad.addColorStop(1, rgba(0));
      } else {
        grad.addColorStop(0, rgba(0.55, 0.1));
        grad.addColorStop(0.28, rgba(0.26));
        grad.addColorStop(0.62, rgba(0.07));
        grad.addColorStop(1, rgba(0));
      }
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      sprite = c;
    }
  } catch {
    sprite = null;
  }
  color[slot] = sprite;
  return sprite;
}

// ---------------------------------------------------------------------------------------------
// Geometry tables (angles in radians; arc sets are [start, length] pairs)

function arcSet(...deg) {
  const a = new Float32Array(deg.length);
  for (let i = 0; i < deg.length; i++) a[i] = deg[i] * DEG;
  return a;
}

function evenArcs(count, lengthDeg, offsetDeg = 0) {
  const pairs = [];
  for (let i = 0; i < count; i++) pairs.push(offsetDeg + (i * 360) / count, lengthDeg);
  return arcSet(...pairs);
}

const tickCache = new Map();
function tickTable(count) {
  let t = tickCache.get(count);
  if (!t) {
    t = { count, cos: new Float32Array(count), sin: new Float32Array(count) };
    for (let i = 0; i < count; i++) {
      t.cos[i] = Math.cos((i / count) * TAU);
      t.sin[i] = Math.sin((i / count) * TAU);
    }
    tickCache.set(count, t);
  }
  return t;
}

const HERO_SEG = arcSet(0, 84, 98, 38, 150, 128, 292, 52);
const HERO_THICK = evenArcs(8, 35);
const HERO_THICK_HI = arcSet(0, 35, 180, 35);
const HERO_BRACKETS = arcSet(-5, 10, 85, 10, 175, 10, 265, 10);
const MINI_SEG = arcSet(0, 96, 120, 96, 240, 96);
const ORBIT_SEG = arcSet(0, 64, 76, 96, 186, 28, 228, 118);
const ORBIT_BRACKETS = arcSet(-3, 6, 87, 6, 177, 6, 267, 6);

// ---------------------------------------------------------------------------------------------
// Drawing primitives (no allocation)

function strokeCircle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
}

function strokeArcs(ctx, cx, cy, r, rot, set) {
  ctx.beginPath();
  for (let i = 0; i < set.length; i += 2) {
    const a0 = rot + set[i];
    ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ctx.arc(cx, cy, r, a0, a0 + set[i + 1]);
  }
  ctx.stroke();
}

function strokeDashes(ctx, cx, cy, r, rot, count, dash) {
  const step = TAU / count;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a0 = rot + i * step;
    ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ctx.arc(cx, cy, r, a0, a0 + dash);
  }
  ctx.stroke();
}

// Radial ticks pointing inward from radius r. With sector (secMin > -2) only ticks whose direction
// lies within the sector around (secCos, secSin) are drawn — used for a sweeping highlight.
function strokeTicks(ctx, cx, cy, r, rot, table, len, majorEvery, majorLen, secCos, secSin, secMin) {
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const n = table.count;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const c = table.cos[i] * cr - table.sin[i] * sr;
    const s = table.sin[i] * cr + table.cos[i] * sr;
    if (secMin > -2 && c * secCos + s * secSin < secMin) continue;
    const l = majorEvery > 0 && i % majorEvery === 0 ? majorLen : len;
    ctx.moveTo(cx + c * r, cy + s * r);
    ctx.lineTo(cx + c * (r - l), cy + s * (r - l));
  }
  ctx.stroke();
}

function blit(ctx, img, x, y, r, alpha) {
  if (!img || alpha <= 0.004 || r <= 0.5) return;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

const pad2 = (n) => (n < 10 ? '0' : '') + n;

// ---------------------------------------------------------------------------------------------
// Shared animation loop. Iterates backwards so a core may unregister itself mid-loop.

const live = [];
let loopId = 0;

function loop(now) {
  loopId = 0;
  for (let i = live.length - 1; i >= 0; i--) live[i](now);
  if (live.length && !loopId) loopId = requestAnimationFrame(loop);
}

function addLive(fn) {
  if (live.indexOf(fn) < 0) live.push(fn);
  if (!loopId) loopId = requestAnimationFrame(loop);
}

function removeLive(fn) {
  const i = live.indexOf(fn);
  if (i >= 0) live.splice(i, 1);
  if (!live.length && loopId) {
    cancelAnimationFrame(loopId);
    loopId = 0;
  }
}

function watchMedia(query, fn) {
  let mq = null;
  try {
    mq = window.matchMedia ? window.matchMedia(query) : null;
  } catch {
    mq = null;
  }
  if (!mq) return { matches: false, off() {} };
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

const NOOP_CORE = Object.freeze({ setState() {}, setAgents() {}, setLevel() {}, celebrate() {}, destroy() {}, debugStats: () => null });

// Mission-complete burst: a flash at the core, two rings racing outward and the agent nodes
// lighting up as the first ring passes them.
const BURST_S = 1.7;
const BURST_STALE_MS = 2500; // a burst that could not be shown in time (core asleep) is dropped

// ---------------------------------------------------------------------------------------------

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ size?: number, mode?: 'hero'|'mini'|'orbit' }} [opts]
 *   size: preferred CSS size in px (applied through a zero-specificity rule, so the caller's
 *   own CSS wins); without it the canvas fills its container's width as a square.
 */
export function createCore(canvas, opts = {}) {
  const mode = opts.mode === 'mini' || opts.mode === 'orbit' ? opts.mode : 'hero';
  let ctx = null;
  try {
    ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  } catch {
    ctx = null;
  }
  if (!ctx) return NOOP_CORE;

  canvas.classList.add('hud-core', `hud-core--${mode}`);
  if (Number.isFinite(opts.size) && opts.size > 0) canvas.style.setProperty('--hud-core-size', `${opts.size}px`);
  const ownsLabel = !canvas.hasAttribute('aria-label') && canvas.getAttribute('aria-hidden') !== 'true';
  if (ownsLabel && !canvas.hasAttribute('role')) canvas.setAttribute('role', 'img');

  let pal = getPalette();
  watchTheme();

  // --- animated state -------------------------------------------------------------------------
  let state = 'idle';
  let target = STATE_PARAMS.idle;
  const cur = { speed: 1, pulseHz: 0.2, pulse: 0.16, glow: 0.85, scan: 0, bars: 0, dim: 1 };
  let colorFrom = pal.accent;
  let colorTo = pal.accent;
  let colorMix = 1;
  let lineCss = colorTo.css; // current (possibly blended) line color
  let lineR = -1;
  let lineG = -1;
  let lineB = -1;

  let clock = 0; // animation seconds (advances only while drawing)
  const rot = new Float64Array(8); // ring rotations
  let pulsePhase = 0;
  let scanAngle = -Math.PI / 2;
  let highlight = 0;
  let orbitRot = 0;
  let level = 0;
  let levelTarget = 0;
  let burstColor = null; // palette color while a completion burst plays
  let burstAt = 0; // animation clock when it started
  let burstWall = 0; // performance.now() when it was requested
  let burstRing = -1; // radius of the leading burst ring this frame (-1: none)

  const BAR_COUNT = 56;
  const barFreq = new Float32Array(BAR_COUNT);
  const barPhase = new Float32Array(BAR_COUNT);
  const barLevel = new Float32Array(BAR_COUNT);
  for (let i = 0; i < BAR_COUNT; i++) {
    barFreq[i] = 1.6 + ((i * 7919) % 97) / 97 * 3.4;
    barPhase[i] = ((i * 104729) % 1000) / 1000 * TAU;
  }

  // --- agents -----------------------------------------------------------------------------
  const nodes = []; // records in agents[] order
  const nodeById = new Map();
  let gen = 0;
  let total = 0;
  let doneCount = 0;
  let failCount = 0;
  let haltCount = 0;
  let activeCount = 0;
  let doneFrac = 0; // eased progress fractions for the progress ring
  let failFrac = 0;
  let haltFrac = 0;
  let readout = '';
  let readoutSub = '';

  // --- canvas metrics ---------------------------------------------------------------------
  let width = 0; // CSS px
  let height = 0;
  let dpr = 1;
  let labelFont = '';
  let readoutFont = '';
  let subFont = '';

  // --- lifecycle --------------------------------------------------------------------------
  let destroyed = false;
  let awake = false;
  let inView = true;
  let lastFrame = 0;
  let fps = 60;
  let minInterval = 1000 / 60;

  const statBuf = new Float32Array(240);
  let statCount = 0;
  let statFrames = 0;
  let statSince = 0;

  const reducedMq = watchMedia('(prefers-reduced-motion: reduce)', () => {
    updateAwake();
    if (reducedMq.matches) drawStatic();
  });
  const smallMq = watchMedia('(max-width: 899px), (pointer: coarse)', () => {
    updateFps();
    measure(); // the resolution cap depends on it too
  });
  updateFps();

  function updateFps() {
    fps = mode === 'mini' || smallMq.matches ? 30 : 60;
    minInterval = 1000 / fps;
  }

  // --- sizing -----------------------------------------------------------------------------
  let dprWatch = null;
  function watchDpr() {
    if (dprWatch) dprWatch.off();
    dprWatch = watchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`, () => {
      measure();
      watchDpr();
    });
  }

  function measure(entry) {
    if (destroyed) return;
    let w = 0;
    let h = 0;
    if (entry && entry.contentRect) {
      w = entry.contentRect.width;
      h = entry.contentRect.height;
    } else {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
    }
    const ratio = Math.min(smallMq.matches ? MAX_DPR_SMALL : MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    const bw = Math.max(0, Math.round(w * ratio));
    const bh = Math.max(0, Math.round(h * ratio));
    const changed = Math.abs(w - width) > 0.01 || Math.abs(h - height) > 0.01 || ratio !== dpr;
    width = w;
    height = h;
    dpr = ratio;
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    if (changed) computeFonts();
    updateAwake();
    // Resizing clears the canvas: repaint now so there is never a blank frame.
    if (width > 1 && height > 1) {
      if (awake) drawFrame(0);
      else if (isStatic()) drawStatic();
    }
  }

  function computeFonts() {
    const R = Math.min(width, height) / 2;
    labelFont = `600 ${Math.max(8, Math.min(11, R * 0.056)).toFixed(1)}px ${pal.fontMono}`;
    fitKey = '';
    fitReadout();
  }

  // Size the orbit's center readout to its disc. The font is monospace, so the width only depends
  // on the character count: measure again only when the length, size or "complete" flag changes.
  let fitKey = '';
  function fitReadout() {
    if (mode !== 'orbit' || !readout || width <= 1) return;
    const R = Math.min(width, height) / 2 - 1;
    const key = `${readout.length}|${doneCount === total}|${R}`;
    if (key === fitKey) return;
    fitKey = key;
    const font = pal.fontMono;
    const rc = R * 0.205;
    let size = Math.max(9, R * 0.125);
    ctx.font = `600 ${size}px ${font}`;
    const w = ctx.measureText(readout).width;
    if (w > rc * 1.6) size *= (rc * 1.6) / w;
    readoutFont = `600 ${size.toFixed(1)}px ${font}`;
    const sub = Math.max(5.5, Math.min(9, R * 0.042));
    const full = doneCount === total ? 'COMPLETE' : 'AGENTS DONE';
    ctx.font = `600 ${sub}px ${font}`;
    readoutSub = ctx.measureText(full).width <= rc * 1.5 ? full : 'DONE';
    subFont = `600 ${sub.toFixed(1)}px ${font}`;
  }

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver((entries) => measure(entries[entries.length - 1]));
    ro.observe(canvas);
  } else {
    window.addEventListener('resize', onWindowResize);
  }
  function onWindowResize() {
    measure();
  }

  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(
      (entries) => {
        inView = entries[entries.length - 1].isIntersecting;
        updateAwake();
      },
      { rootMargin: '48px' },
    );
    io.observe(canvas);
  }

  const onVisibility = () => updateAwake();
  document.addEventListener('visibilitychange', onVisibility);
  const unwatchCover = watchCover(() => updateAwake());

  // Dozing (mini orb only, see MINI_DOZE_MS): no animation loop, one static frame per change.
  const dozeMs = Number.isFinite(opts.idleSleepMs) ? Math.max(0, opts.idleSleepMs) : mode === 'mini' ? MINI_DOZE_MS : 0;
  let dozing = false;
  let dozeTimer = 0;

  function scheduleDoze() {
    if (dozeTimer) clearTimeout(dozeTimer);
    dozeTimer = 0;
    if (!dozeMs || destroyed || !RESTING.has(state)) return;
    dozeTimer = setTimeout(() => {
      dozeTimer = 0;
      if (destroyed || !RESTING.has(state)) return;
      dozing = true;
      updateAwake();
      drawStatic();
    }, dozeMs);
  }

  // Something visible changed: wake up if dozing, and restart the countdown to the next doze.
  function noteNews() {
    if (dozing) {
      dozing = false;
      updateAwake();
    }
    scheduleDoze();
  }

  function isStatic() {
    return !destroyed && (reducedMq.matches || dozing);
  }

  function updateAwake() {
    const should =
      !destroyed &&
      !dozing &&
      !reducedMq.matches &&
      !document.hidden &&
      inView &&
      width > 1 &&
      height > 1 &&
      canvas.isConnected &&
      !canvas.closest('[inert]'); // covered by a sheet or an overlay
    if (should === awake) return;
    awake = should;
    if (awake) {
      lastFrame = 0;
      // A burst requested while asleep is only worth showing if it is still fresh.
      if (burstColor && performance.now() - burstWall > BURST_STALE_MS) burstColor = null;
      addLive(frame);
    } else {
      removeLive(frame);
    }
  }

  // --- per-frame update -------------------------------------------------------------------
  function frame(now) {
    if (!awake) return;
    if (lastFrame !== 0 && now - lastFrame < minInterval - 2) return;
    const dt = lastFrame === 0 ? 1 / fps : Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!canvas.isConnected) {
      updateAwake();
      return;
    }
    const t0 = performance.now();
    drawFrame(dt);
    const spent = performance.now() - t0;
    statBuf[statCount % statBuf.length] = spent;
    statCount++;
    statFrames++;
    if (statSince === 0) statSince = now;
  }

  function ease(curValue, targetValue, k) {
    return curValue + (targetValue - curValue) * k;
  }

  function step(dt) {
    clock += dt;
    const k = 1 - Math.exp(-dt / 0.35);
    cur.speed = ease(cur.speed, target.speed, k);
    cur.pulseHz = ease(cur.pulseHz, target.pulseHz, k);
    cur.pulse = ease(cur.pulse, target.pulse, k);
    cur.glow = ease(cur.glow, target.glow, k);
    cur.scan = ease(cur.scan, target.scan, k);
    cur.bars = ease(cur.bars, target.bars, k);
    cur.dim = ease(cur.dim, target.dim, k);

    if (colorMix < 1) colorMix = Math.min(1, colorMix + dt / 0.45);
    updateLineColor();

    const sp = cur.speed;
    rot[0] += dt * 0.05 * sp;
    rot[1] -= dt * 0.035 * sp;
    rot[2] += dt * 0.16 * sp;
    rot[3] -= dt * 0.09 * sp;
    rot[4] -= dt * 0.21 * sp;
    rot[5] += dt * 0.42 * sp;
    rot[6] += dt * 0.7 * sp; // mini ring
    pulsePhase += dt * cur.pulseHz * TAU;
    scanAngle += dt * (1.1 + 0.55 * sp);
    highlight += dt * 0.38 * sp;
    orbitRot += dt * 0.03 * (0.6 + 0.4 * sp);

    const kl = 1 - Math.exp(-dt / (levelTarget > level ? 0.05 : 0.25));
    level += (levelTarget - level) * kl;

    if (cur.bars > 0.01) {
      // Voice bars: real input level when provided, otherwise a gentle synthetic murmur.
      const base = Math.max(level, 0.18 + 0.12 * Math.sin(clock * 1.7));
      for (let i = 0; i < BAR_COUNT; i++) {
        const osc = 0.5 + 0.5 * Math.sin(clock * barFreq[i] + barPhase[i]);
        barLevel[i] = base * (0.35 + 0.65 * osc);
      }
    }

    const kp = 1 - Math.exp(-dt / 0.4);
    const t = total || 1;
    doneFrac = ease(doneFrac, doneCount / t, kp);
    failFrac = ease(failFrac, failCount / t, kp);
    haltFrac = ease(haltFrac, haltCount / t, kp);

    const ka = 1 - Math.exp(-dt * 3.5);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.spawn < 1) n.spawn = Math.min(1, n.spawn + dt / 0.6);
      n.angle += angleDelta(n.angle, n.targetAngle) * ka;
    }
  }

  function snapAll() {
    cur.speed = target.speed;
    cur.pulseHz = target.pulseHz;
    cur.pulse = target.pulse;
    cur.glow = target.glow;
    cur.scan = target.scan;
    cur.bars = target.bars;
    cur.dim = target.dim;
    colorMix = 1;
    updateLineColor();
    const t = total || 1;
    doneFrac = doneCount / t;
    failFrac = failCount / t;
    haltFrac = haltCount / t;
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].spawn = 1;
      nodes[i].angle = nodes[i].targetAngle;
      nodes[i].changedAt = -10; // no frozen bursts or call-outs in a static frame
    }
    for (let i = 0; i < BAR_COUNT; i++) barLevel[i] = 0.25 + 0.2 * Math.sin(barPhase[i]);
    burstColor = null;
  }

  function updateLineColor() {
    let r = colorTo.rgb[0];
    let g = colorTo.rgb[1];
    let b = colorTo.rgb[2];
    if (colorMix < 1) {
      const m = easeOutCubic(colorMix);
      r = Math.round(colorFrom.rgb[0] + (r - colorFrom.rgb[0]) * m);
      g = Math.round(colorFrom.rgb[1] + (g - colorFrom.rgb[1]) * m);
      b = Math.round(colorFrom.rgb[2] + (b - colorFrom.rgb[2]) * m);
    }
    if (r !== lineR || g !== lineG || b !== lineB) {
      lineR = r;
      lineG = g;
      lineB = b;
      lineCss = r === colorTo.rgb[0] && g === colorTo.rgb[1] && b === colorTo.rgb[2] ? colorTo.css : `rgb(${r}, ${g}, ${b})`;
    }
  }

  // Glow in the state color; cross-fades sprites while the color transitions.
  function stateGlow(kind, x, y, r, alpha) {
    if (colorMix < 1) {
      const m = easeOutCubic(colorMix);
      blit(ctx, getSprite(colorFrom, kind), x, y, r, alpha * (1 - m));
      blit(ctx, getSprite(colorTo, kind), x, y, r, alpha * m);
    } else {
      blit(ctx, getSprite(colorTo, kind), x, y, r, alpha);
    }
  }

  // --- drawing ----------------------------------------------------------------------------
  function drawFrame(dt) {
    if (width <= 1 || height <= 1) return;
    if (dt > 0) step(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const R = Math.min(width, height) / 2 - 1;
    if (R < 4) return;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = lineCss;
    ctx.fillStyle = lineCss;
    if (mode === 'mini') drawMini(cx, cy, R);
    else if (mode === 'orbit') drawOrbit(cx, cy, R);
    else drawHero(cx, cy, R);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStatic() {
    if (destroyed || width <= 1 || height <= 1) return;
    snapAll();
    drawFrame(0);
  }

  function corePulse() {
    return cur.pulse * (0.5 + 0.5 * Math.sin(pulsePhase)) + level * 0.45;
  }

  function drawMini(cx, cy, R) {
    const dim = cur.dim;
    const amp = corePulse();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5 * dim;
    strokeTicks(ctx, cx, cy, R * 0.97, rot[1] * 2, tickTable(24), R * 0.13, 6, R * 0.22, 0, 0, -3);
    ctx.lineWidth = Math.max(1.4, R * 0.12);
    ctx.globalAlpha = 0.92 * dim;
    strokeArcs(ctx, cx, cy, R * 0.68, rot[6], MINI_SEG);
    ctx.globalCompositeOperation = 'lighter';
    stateGlow('soft', cx, cy, R * (0.9 + 0.08 * amp), cur.glow * (0.5 + 0.4 * amp) * dim);
    stateGlow('hot', cx, cy, R * (0.5 + 0.1 * amp), (0.8 + 0.2 * amp) * dim);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawHero(cx, cy, R) {
    const dim = cur.dim;
    const amp = corePulse();
    const thin = Math.max(1, R * 0.007);

    // Bezel: hairline circle and four brackets.
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.14 * dim;
    strokeCircle(ctx, cx, cy, R * 0.965);
    ctx.lineWidth = Math.max(1.5, R * 0.016);
    ctx.globalAlpha = 0.7 * dim;
    strokeArcs(ctx, cx, cy, R * 0.965, rot[0], HERO_BRACKETS);

    // Tick ring with a sweeping highlight sector.
    const ticks = tickTable(R > 80 ? 120 : 72);
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.22 * dim;
    strokeTicks(ctx, cx, cy, R * 0.9, rot[1], ticks, R * 0.022, 10, R * 0.055, 0, 0, -3);
    ctx.globalAlpha = 0.75 * dim;
    strokeTicks(ctx, cx, cy, R * 0.9, rot[1], ticks, R * 0.022, 10, R * 0.055, Math.cos(highlight), Math.sin(highlight), 0.93);

    // Segmented ring over a faint full circle.
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.12 * dim;
    strokeCircle(ctx, cx, cy, R * 0.79);
    ctx.lineWidth = Math.max(1.25, R * 0.014);
    ctx.globalAlpha = 0.82 * dim;
    strokeArcs(ctx, cx, cy, R * 0.79, rot[2], HERO_SEG);

    // Dashed ring and the scanner that sweeps along it while thinking/working.
    ctx.lineWidth = Math.max(1, R * 0.012);
    ctx.globalAlpha = 0.36 * dim;
    strokeDashes(ctx, cx, cy, R * 0.7, rot[3], R > 80 ? 72 : 48, 2.2 * DEG);
    if (cur.scan > 0.01) drawScanner(cx, cy, R * 0.7, Math.max(1.5, R * 0.02), 0.95 * cur.scan * dim);

    // Thick segmented band, two brighter segments.
    ctx.lineWidth = R * 0.045;
    ctx.globalAlpha = 0.17 * dim;
    strokeArcs(ctx, cx, cy, R * 0.585, rot[4], HERO_THICK);
    ctx.globalAlpha = 0.55 * dim;
    strokeArcs(ctx, cx, cy, R * 0.585, rot[4], HERO_THICK_HI);

    // Inner ring with three satellites.
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.45 * dim;
    strokeCircle(ctx, cx, cy, R * 0.475);
    ctx.globalAlpha = 0.9 * dim;
    const sat = Math.max(1.4, R * 0.014);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = rot[5] + (i * TAU) / 3;
      const x = cx + Math.cos(a) * R * 0.475;
      const y = cy + Math.sin(a) * R * 0.475;
      ctx.moveTo(x + sat, y);
      ctx.arc(x, y, sat, 0, TAU);
    }
    ctx.fill();

    if (cur.bars > 0.01) drawBars(cx, cy, R * 0.34, R * 0.1, cur.bars * dim);
    if (total > 0) drawProgress(cx, cy, R * 0.965, Math.max(1.5, R * 0.016), dim, false);
    burstRing = burstColor ? burstRadius(R * 0.3, R * 0.98) : -1;
    if (nodes.length) drawNodes(cx, cy, R, R * 0.79, false);
    if (burstColor) drawBurst(cx, cy, R, R * 0.3, Math.max(1.5, R * 0.016));

    // The core itself.
    ctx.globalCompositeOperation = 'lighter';
    stateGlow('soft', cx, cy, R * 0.64 * (1 + 0.1 * amp), cur.glow * (0.5 + 0.45 * amp) * dim);
    stateGlow('hot', cx, cy, R * 0.36 * (1 + 0.22 * amp), (0.85 + 0.15 * amp) * dim);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = Math.max(1, R * 0.01);
    ctx.globalAlpha = (0.4 + 0.35 * amp) * dim;
    strokeCircle(ctx, cx, cy, R * 0.215 * (1 + 0.05 * amp));
  }

  function drawOrbit(cx, cy, R) {
    const dim = cur.dim;
    const amp = corePulse();
    const thin = Math.max(1, R * 0.006);
    const orbitR = R * 0.7;

    // Outer bezel with fine ticks.
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.1 * dim;
    strokeCircle(ctx, cx, cy, R * 0.985);
    ctx.globalAlpha = 0.2 * dim;
    strokeTicks(ctx, cx, cy, R * 0.985, rot[1], tickTable(90), R * 0.016, 15, R * 0.04, 0, 0, -3);
    ctx.lineWidth = Math.max(1.5, R * 0.014);
    ctx.globalAlpha = 0.6 * dim;
    strokeArcs(ctx, cx, cy, R * 0.985, rot[0], ORBIT_BRACKETS);

    // Orbit track the agents ride on.
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.22 * dim;
    strokeDashes(ctx, cx, cy, orbitR, orbitRot, 96, 1.5 * DEG);

    // Inner instrument rings.
    ctx.lineWidth = Math.max(1.2, R * 0.011);
    ctx.globalAlpha = 0.6 * dim;
    strokeArcs(ctx, cx, cy, R * 0.505, rot[2], ORBIT_SEG);
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.09 * dim;
    strokeCircle(ctx, cx, cy, R * 0.505);
    ctx.globalAlpha = 0.28 * dim;
    strokeTicks(ctx, cx, cy, R * 0.44, rot[3], tickTable(72), R * 0.02, 6, R * 0.04, 0, 0, -3);
    if (cur.scan > 0.01) drawScanner(cx, cy, R * 0.585, Math.max(1.5, R * 0.016), 0.75 * cur.scan * dim);

    // Mission progress ring (done / failed / stopped) around the core.
    drawProgress(cx, cy, R * 0.345, Math.max(2, R * 0.022), dim, true);

    burstRing = burstColor ? burstRadius(R * 0.345, R * 0.98) : -1;
    if (nodes.length) drawNodes(cx, cy, R, orbitR, true);
    if (burstColor) drawBurst(cx, cy, R, R * 0.345, Math.max(2, R * 0.022));

    // Core: a luminous ring around a dark readout when there are agents; a hot core otherwise.
    ctx.globalCompositeOperation = 'lighter';
    stateGlow('soft', cx, cy, R * 0.44 * (1 + 0.08 * amp), cur.glow * (0.45 + 0.4 * amp) * dim);
    if (!readout) stateGlow('hot', cx, cy, R * 0.25 * (1 + 0.2 * amp), (0.85 + 0.15 * amp) * dim);
    ctx.globalCompositeOperation = 'source-over';
    if (readout) {
      const rc = R * 0.205;
      ctx.globalAlpha = 0.86;
      ctx.fillStyle = pal.bg.css;
      ctx.beginPath();
      ctx.arc(cx, cy, rc, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = lineCss;
      ctx.lineWidth = Math.max(1.5, R * 0.014);
      ctx.globalAlpha = (0.65 + 0.35 * amp) * dim;
      strokeCircle(ctx, cx, cy, rc);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = readoutFont;
      ctx.fillStyle = doneCount === total ? pal.ok.css : pal.text.css;
      ctx.globalAlpha = 0.95;
      ctx.fillText(readout, cx, cy - R * 0.022);
      ctx.font = subFont;
      ctx.fillStyle = lineCss;
      ctx.globalAlpha = 0.75 * dim;
      ctx.fillText(readoutSub, cx, cy + R * 0.085);
    }
  }

  // Radius of the leading burst ring (eases from r0 to r1), or -1 once the burst is over.
  function burstRadius(r0, r1) {
    const since = clock - burstAt;
    if (since < 0 || since >= BURST_S) {
      burstColor = null;
      return -1;
    }
    return r0 + (r1 - r0) * easeOutCubic(since / BURST_S);
  }

  function drawBurst(cx, cy, R, r0, lw) {
    const since = clock - burstAt;
    if (since < 0 || since >= BURST_S) {
      burstColor = null;
      return;
    }
    const c = burstColor;
    const p = since / BURST_S;
    ctx.globalCompositeOperation = 'lighter';
    // Flash at the core.
    const f = Math.min(1, since / 0.75);
    blit(ctx, getSprite(c, 'soft'), cx, cy, R * (0.3 + 0.38 * easeOutCubic(f)), (1 - f) * (1 - f) * 0.95);
    blit(ctx, getSprite(c, 'hot'), cx, cy, R * 0.3, (1 - f) * (1 - f) * 0.55);
    // The progress ring swells and glows.
    ctx.strokeStyle = c.css;
    ctx.lineWidth = lw * (1 + 1.6 * (1 - p));
    ctx.globalAlpha = (1 - p) * 0.7;
    strokeCircle(ctx, cx, cy, r0);
    // Two rings racing outward.
    for (let k = 0; k < 2; k++) {
      const q = (since - k * 0.22) / (BURST_S - 0.22);
      if (q <= 0 || q >= 1) continue;
      const r = r0 + (R * 0.98 - r0) * easeOutCubic(q);
      ctx.lineWidth = Math.max(1, lw * 1.4 * (1 - q) + 0.5);
      ctx.globalAlpha = (1 - q) * (1 - q) * (k === 0 ? 0.95 : 0.5);
      strokeCircle(ctx, cx, cy, r);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = lineCss;
  }

  function drawScanner(cx, cy, r, lw, alpha) {
    const steps = 12;
    const seg = (80 * DEG) / steps;
    ctx.lineWidth = lw;
    ctx.strokeStyle = lineCss;
    for (let i = 0; i < steps; i++) {
      const f = 1 - i / steps;
      ctx.globalAlpha = alpha * f * f;
      ctx.beginPath();
      ctx.arc(cx, cy, r, scanAngle - (i + 1) * seg, scanAngle - i * seg + 0.004);
      ctx.stroke();
    }
  }

  function drawBars(cx, cy, r0, maxLen, alpha) {
    const step = TAU / BAR_COUNT;
    ctx.lineWidth = Math.max(1.2, r0 * 0.035);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.8 * alpha;
    ctx.beginPath();
    for (let i = 0; i < BAR_COUNT; i++) {
      const a = rot[5] * 0.25 + i * step;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const len = 1.5 + barLevel[i] * maxLen;
      ctx.moveTo(cx + c * r0, cy + s * r0);
      ctx.lineTo(cx + c * (r0 + len), cy + s * (r0 + len));
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawProgress(cx, cy, r, lw, dim, withTrack) {
    const start = -Math.PI / 2;
    ctx.lineWidth = lw;
    if (withTrack) {
      ctx.strokeStyle = lineCss;
      ctx.globalAlpha = 0.12 * dim;
      strokeCircle(ctx, cx, cy, r);
    }
    let a = start;
    a = progressArc(cx, cy, r, a, doneFrac, pal.ok.css, 0.95);
    a = progressArc(cx, cy, r, a, failFrac, pal.err.css, 0.9);
    progressArc(cx, cy, r, a, haltFrac, pal.warn.css, 0.8);
    ctx.strokeStyle = lineCss;
  }

  function progressArc(cx, cy, r, from, frac, color, alpha) {
    if (frac <= 0.002) return from;
    const to = from + frac * TAU;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, from, to);
    ctx.stroke();
    return to;
  }

  function drawNodes(cx, cy, R, orbitR, withLabels) {
    const count = nodes.length;
    const nr = Math.max(2.5, Math.min(6, R * 0.03));
    const coreEdge = R * (mode === 'orbit' ? 0.23 : 0.3);
    const spacing = (TAU * orbitR) / Math.max(1, count);
    const labelAll = withLabels && (count <= 10 || spacing >= 46);

    // Positions (stored on the records; no allocation).
    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      const a = n.angle + orbitRot;
      const wobble = Math.sin(clock * 0.9 + n.phase * TAU) * R * 0.006;
      n.cos = Math.cos(a);
      n.sin = Math.sin(a);
      n.x = cx + n.cos * (orbitR + wobble);
      n.y = cy + n.sin * (orbitR + wobble);
    }

    // Links and the data pulses that run along them toward the core.
    ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      if (n.kind !== K_ACTIVE) continue;
      const x0 = cx + n.cos * coreEdge;
      const y0 = cy + n.sin * coreEdge;
      const x1 = n.x - n.cos * (nr + 3);
      const y1 = n.y - n.sin * (nr + 3);
      ctx.strokeStyle = n.color.css;
      ctx.globalAlpha = 0.26 * n.spawn;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      if (n.kind !== K_ACTIVE) continue;
      const f = (clock * n.rate + n.phase) % 1;
      const x = n.x + (cx + n.cos * coreEdge - n.x) * f;
      const y = n.y + (cy + n.sin * coreEdge - n.y) * f;
      blit(ctx, getSprite(n.color, 'hot'), x, y, nr * 2.2, Math.sin(Math.PI * f) * 0.95 * n.spawn);
    }

    // Halos.
    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      let a = 0;
      if (n.kind === K_ACTIVE) a = 0.5 + 0.25 * Math.sin(clock * 3 + n.phase * TAU);
      else if (n.kind === K_DONE) a = 0.55;
      else if (n.kind === K_FAILED) a = 0.55;
      else if (n.kind === K_HALTED) a = 0.25;
      if (a > 0) blit(ctx, getSprite(n.color, 'soft'), n.x, n.y, nr * 4.2, a * n.spawn);
      // Completion / failure burst: a ring that expands for ~1.1s after the change.
      const since = clock - n.changedAt;
      if ((n.kind === K_DONE || n.kind === K_FAILED) && since >= 0 && since < 1.1) {
        const p = since / 1.1;
        blit(ctx, getSprite(n.color, 'soft'), n.x, n.y, nr * (4 + 6 * p), (1 - p) * 0.9);
      }
      // Mission-complete burst: finished nodes light up as the leading ring sweeps past them.
      if (burstRing > 0 && n.kind === K_DONE) {
        const d = Math.abs(burstRing - orbitR) / (R * 0.09);
        if (d < 1) blit(ctx, getSprite(n.color, 'soft'), n.x, n.y, nr * 5.5, (1 - d) * 0.95 * n.spawn);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // Node bodies and status ornaments.
    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      const s = easeOutCubic(n.spawn);
      const r = nr * (0.4 + 0.6 * s);
      ctx.strokeStyle = n.color.css;
      ctx.fillStyle = n.color.css;
      if (n.kind === K_WAITING) {
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.75 * s;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 0.8, 0, TAU);
        ctx.stroke();
        continue;
      }
      if (n.kind === K_HALTED) {
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.85 * s;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 0.4, 0, TAU);
        ctx.fill();
        continue;
      }
      if (n.kind === K_ACTIVE && n.status === 'starting') {
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = (0.55 + 0.45 * Math.abs(Math.sin(clock * 4 + n.phase * TAU))) * s;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, TAU);
        ctx.stroke();
        continue;
      }
      const grow = n.status === 'writing' ? 1 + 0.16 * Math.sin(clock * 6 + n.phase * TAU) : 1;
      ctx.globalAlpha = s;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * grow, 0, TAU);
      ctx.fill();
      // Bright center pip.
      ctx.fillStyle = pal.text.css;
      ctx.globalAlpha = (n.kind === K_ACTIVE ? 0.85 : 0.6) * s;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 0.38, 0, TAU);
      ctx.fill();
      if (n.status === 'searching') {
        // Sonar ping.
        const k = (clock / 1.3 + n.phase) % 1;
        ctx.lineWidth = 1;
        ctx.globalAlpha = (1 - k) * 0.7 * s;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 1 + k * r * 3, 0, TAU);
        ctx.stroke();
      } else if (n.status === 'reading') {
        // Orbiting read head.
        const a = clock * 4.2 + n.phase * TAU;
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.9 * s;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3, a, a + 1.9);
        ctx.stroke();
      } else if (n.status === 'thinking') {
        const a = -clock * 2.4 + n.phase * TAU;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7 * s;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 2.5, a, a + 1.2);
        ctx.moveTo(n.x + Math.cos(a + Math.PI) * (r + 2.5), n.y + Math.sin(a + Math.PI) * (r + 2.5));
        ctx.arc(n.x, n.y, r + 2.5, a + Math.PI, a + Math.PI + 1.2);
        ctx.stroke();
      }
    }

    if (!withLabels) return;
    // Labels: all of them when there is room, otherwise only the agents doing something now,
    // failures, and a short call-out right after an agent changes state.
    ctx.font = labelFont;
    const gap = nr + 7;
    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      const since = clock - n.changedAt;
      let a;
      if (n.kind === K_ACTIVE) a = 0.95;
      else if (n.kind === K_FAILED) a = 0.9;
      else if (labelAll) a = n.kind === K_DONE ? 0.7 : n.kind === K_HALTED ? 0.65 : 0.5;
      else a = since >= 0 && since < 2.5 ? 0.85 * (1 - since / 2.5) : 0;
      a *= n.spawn;
      if (a <= 0.02) continue;
      const lx = n.x + n.cos * gap;
      const ly = n.y + n.sin * gap;
      if (n.cos > 0.38) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
      } else if (n.cos < -0.38) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = n.sin < 0 ? 'bottom' : 'top';
      }
      ctx.fillStyle = n.kind === K_WAITING ? pal.text3.css : n.color.css;
      ctx.globalAlpha = a;
      ctx.fillText(n.label, lx, ly);
    }
  }

  // Theme change: cross-fade the state color into the new palette, recolor nodes, re-measure text.
  function refreshPalette() {
    if (destroyed) return;
    const next = getPalette();
    if (next === pal) return;
    const prevColor = colorMix < 0.5 ? colorFrom : colorTo;
    pal = next;
    colorFrom = prevColor;
    colorTo = pal[target.color] || pal.accent;
    colorMix = 0;
    for (const n of nodes) n.color = pal[NODE_COLOR[n.status] || 'mute'];
    computeFonts();
    if (isStatic()) drawStatic();
  }
  paletteListeners.add(refreshPalette);

  // --- public API ---------------------------------------------------------------------------
  function setAria() {
    if (!ownsLabel) return;
    let label;
    if (mode === 'orbit' && total > 0) label = `Mission orbit: ${doneCount} of ${total} agents done, ${activeCount} working`;
    else label = `Jarvis core: ${STATE_TEXT[state] || state}`;
    if (canvas.getAttribute('aria-label') !== label) canvas.setAttribute('aria-label', label);
  }

  function setState(next) {
    if (destroyed) return;
    const s = STATES.includes(next) ? next : 'idle';
    if (s === state) return;
    state = s;
    target = STATE_PARAMS[s];
    const nextColor = pal[target.color] || pal.accent;
    if (nextColor !== colorTo) {
      // Restart the blend from whichever end is visually closer.
      colorFrom = colorMix < 0.5 ? colorFrom : colorTo;
      colorTo = nextColor;
      colorMix = 0;
    }
    setAria();
    noteNews();
    if (isStatic()) drawStatic();
  }

  function setLevel(value) {
    if (destroyed) return;
    const v = Number(value);
    levelTarget = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    if (dozing && levelTarget > 0.02) noteNews(); // a voice level means something is happening
  }

  /**
   * Mission-complete moment: a flash, rings racing outward and the finished agents lighting up
   * (~1.7s, tone 'ok' or 'warn'). Nothing under reduced motion; dropped if the core is asleep
   * for more than a moment (it never plays late).
   */
  function celebrate(tone) {
    if (destroyed || reducedMq.matches) return;
    noteNews();
    burstColor = tone === 'warn' ? pal.warn : pal.ok;
    burstAt = clock;
    burstWall = performance.now();
  }

  function setAgents(agents) {
    if (destroyed) return;
    const list = Array.isArray(agents) ? agents : [];
    gen++;
    nodes.length = 0;
    total = 0;
    doneCount = 0;
    failCount = 0;
    haltCount = 0;
    activeCount = 0;
    const count = Math.min(list.length, 24);
    let changed = false;
    for (let i = 0; i < count; i++) {
      const a = list[i];
      if (!a || typeof a !== 'object') continue;
      const id = a.id != null ? String(a.id) : `#${i}`;
      let n = nodeById.get(id);
      if (!n) {
        changed = true;
        n = {
          id,
          label: '',
          codename: null,
          status: null,
          kind: K_WAITING,
          color: pal.mute,
          rate: 0.6,
          spawn: isStatic() ? 1 : 0,
          angle: 0,
          targetAngle: 0,
          phase: Math.random(),
          changedAt: -10,
          gen: 0,
          x: 0,
          y: 0,
          cos: 0,
          sin: 1,
        };
        nodeById.set(id, n);
      }
      n.gen = gen;
      const codename = typeof a.codename === 'string' ? a.codename : '';
      if (codename !== n.codename) {
        n.codename = codename;
        n.label = codename.toUpperCase();
      }
      const status = typeof a.status === 'string' ? a.status : 'queued';
      if (status !== n.status) {
        changed = true;
        if (n.status !== null) n.changedAt = clock;
        n.status = status;
        n.kind = NODE_KIND[status] ?? K_WAITING;
        n.color = pal[NODE_COLOR[status] || 'mute'];
        n.rate = LINK_RATE[status] || 0.6;
      }
      nodes.push(n);
      total++;
      if (n.kind === K_DONE) doneCount++;
      else if (n.kind === K_FAILED) failCount++;
      else if (n.kind === K_HALTED) haltCount++;
      else if (n.kind === K_ACTIVE) activeCount++;
    }
    for (const [id, n] of nodeById) {
      if (n.gen === gen) continue;
      nodeById.delete(id);
      changed = true;
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.targetAngle = -Math.PI / 2 + (i * TAU) / nodes.length;
      if (n.spawn === 0) n.angle = n.targetAngle; // new nodes appear in their slot
    }
    if (total > 0) {
      readout = total >= 10 ? `${pad2(doneCount)}/${pad2(total)}` : `${doneCount}/${total}`;
      fitReadout();
    } else {
      readout = '';
      readoutSub = '';
    }
    setAria();
    if (changed) noteNews();
    if (isStatic()) drawStatic();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (dozeTimer) clearTimeout(dozeTimer);
    dozeTimer = 0;
    paletteListeners.delete(refreshPalette);
    updateAwake();
    removeLive(frame);
    if (ro) ro.disconnect();
    else window.removeEventListener('resize', onWindowResize);
    if (io) io.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    unwatchCover();
    reducedMq.off();
    smallMq.off();
    if (dprWatch) dprWatch.off();
    nodes.length = 0;
    nodeById.clear();
  }

  /** Debug/perf: draw-time statistics over the last 240 animated frames ({ reset: true } restarts). */
  function debugStats(options) {
    if (options && options.reset) {
      statCount = 0;
      statFrames = 0;
      statSince = 0;
      return null;
    }
    const n = Math.min(statCount, statBuf.length);
    if (!n) return { frames: 0, avgMs: 0, p95Ms: 0, maxMs: 0, fps: 0, awake, dozing, mode, agents: total, backing: [canvas.width, canvas.height] };
    const arr = Array.from(statBuf.subarray(0, n)).sort((a, b) => a - b);
    const sum = arr.reduce((s, v) => s + v, 0);
    const elapsed = (performance.now() - statSince) / 1000;
    return {
      frames: statCount,
      avgMs: sum / n,
      p95Ms: arr[Math.min(n - 1, Math.floor(n * 0.95))],
      maxMs: arr[n - 1],
      fps: elapsed > 0 ? statFrames / elapsed : 0,
      fpsCap: fps,
      awake,
      dozing,
      mode,
      agents: total,
      bursting: !!burstColor,
      backing: [canvas.width, canvas.height],
    };
  }

  watchDpr();
  setAria();
  measure();
  scheduleDoze();

  return { setState, setAgents, setLevel, celebrate, destroy, debugStats };
}
