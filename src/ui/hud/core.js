// The Living Core (v2, "Presence"): JARVIS's heart and data rings. One drawing at every size:
// the 32px header orb ('mini'), the home screen's hero ('hero') and Mission Control / Voice Mode
// ('orbit', where the mission's agents circle the core as status-colored nodes).
//
//   const core = createCore(canvas, { size: 184, mode: 'hero' });   // 'hero' | 'mini' | 'orbit'
//   core.setState('thinking');           // idle listening thinking working speaking optics error offline standby
//   core.setLevel(0.4);                  // voice level 0..1 (all eight voice-band segments)
//   core.setBands(float32x8 | null);     // real voice bands 0..1 (mic analyser); null = synthetic
//   core.setTelemetry({ spend: 0.08, agents: [0, 8], mission: null });   // real data; null = unknown
//   core.setSensors({ mic: 'off' | 'ready' | 'live', optics: 'off' });
//   core.setAlert(2);                    // Needs-you items: an amber bead at 12 o'clock
//   core.cue('answer' | 'capture');      // alpha events: a core flare / one scanner pass
//   await core.boot();                   // 1.6 s assembly; resolves when done or skipped
//   core.setAgents(mission.agents); core.celebrate('ok'); core.destroy(); core.debugStats();
//
// The hero's rings, outside in (radius as a fraction of the core radius R; SPEC 2.4.13):
//   0.965  bezel: hairline + four brackets (~126 s a turn); the alert bead at 12 o'clock
//   0.90   telemetry: three fixed gauges of 36 ticks (SPEND · AGENTS · MISSION), a sweeping
//          highlight laps them (~16.5 s). Lit ticks are real data; unknown gauges stay dark.
//   0.79   data ring: segmented arcs (~39 s a turn, reversed while thinking) carrying packets,
//          short bright dashes that travel and drop to the voice band (6 thinking, 1 per agent)
//   0.70   scanner ring: dashes; the scanner sweeps only while thinking / working or on a capture
//   0.585  voice band: 8 thick segments, thickness × (1 + 1.6 × band); tightens to 0.56 listening
//   0.475  sensor ring: turns under two fixed beads, MIC (8 o'clock) and OPTICS (4 o'clock)
//   core   the heart: breathes every 5 s at rest, follows the voice while speaking
//
// Rendering: Canvas 2D only (the holograms own the single WebGL context), DPR-aware (at most 2×
// on phones, 3× elsewhere), backing store resized by a ResizeObserver. One shared
// requestAnimationFrame loop drives every awake core; each core caps itself at 30 fps on small or
// touch screens (and for the 32px mini orb) and 60 fps on desktop. A core sleeps while the page is
// hidden, while its canvas is off-screen, zero-sized, detached or covered (inside an `inert`
// subtree: a sheet or overlay is on top), and under prefers-reduced-motion (or the HUD's "Still"
// motion setting) it draws one static frame per change instead of animating. The header's mini
// orb rests on a static frame after 30 s in a resting state and wakes on any change.
//
// Hot path: the per-frame code allocates nothing. Colors are prebuilt strings, glows are sprites
// rendered once per color, tick directions come from precomputed tables, packets and bands live
// in preallocated typed arrays, and everything derived from data (gauge fractions, labels, node
// colors, readout text) is prepared in the setters. Nothing on the core is random: phases come
// from fixed tables or a hash of an agent's id.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MAX_DPR = 3;
// Phones and tablets: a 2× backing store keeps rings and glows crisp at under half the fill cost of
// 3× (Mission Control's orbit during a big swarm was the heaviest thing on a phone-class CPU).
const MAX_DPR_SMALL = 2;
// The header's mini orb rests on a static frame after this long without news in a resting state
// (idle / offline / error), and wakes on the next change. Saves battery while the app sits open.
const MINI_DOZE_MS = 30000;
// HUD motion "Reduced": hero and orbit cores rest too, after a short spell at rest.
const REDUCED_DOZE_MS = 4000;
const RESTING = new Set(['idle', 'offline', 'error', 'standby']);

export const CORE_STATES = Object.freeze(['idle', 'listening', 'thinking', 'working', 'speaking', 'optics', 'error', 'offline', 'standby']);
const STATES = CORE_STATES;

// Per-state targets. Every number eases toward its target, so state changes glide.
//   speed: ring spin multiplier · dir: data/scanner direction (-1 = reversed while thinking)
//   pulseHz/pulse: core breathing rate/depth · glow: halo strength · scan: sweeping scanner arc
//   voice: voice-band response (listening/speaking) · tight: voice band eases in to 0.56R
//   packets: data packets on the data ring (-1 = one per active agent) · cross: optics crosshair
//   dim: overall line brightness
const STATE_PARAMS = {
  idle: { color: 'accent', speed: 1, dir: 1, pulseHz: 0.2, pulse: 0.16, glow: 0.85, scan: 0, voice: 0, tight: 0, packets: 0, cross: 0, dim: 1 },
  listening: { color: 'accent2', speed: 1.35, dir: 1, pulseHz: 0.55, pulse: 0.2, glow: 1, scan: 0, voice: 1, tight: 1, packets: 0, cross: 0, dim: 1 },
  thinking: { color: 'violet', speed: 2.1, dir: -1, pulseHz: 0.7, pulse: 0.22, glow: 0.95, scan: 1, voice: 0, tight: 0, packets: 6, cross: 0, dim: 1 },
  working: { color: 'accent', speed: 2.5, dir: 1, pulseHz: 0.9, pulse: 0.24, glow: 1.05, scan: 0.85, voice: 0, tight: 0, packets: -1, cross: 0, dim: 1 },
  speaking: { color: 'accent2', speed: 1.5, dir: 1, pulseHz: 0.8, pulse: 0.2, glow: 1, scan: 0, voice: 1, tight: 0, packets: 0, cross: 0, dim: 1 },
  optics: { color: 'accent', speed: 0.8, dir: 1, pulseHz: 0.3, pulse: 0.12, glow: 0.9, scan: 0, voice: 0, tight: 0, packets: 0, cross: 1, dim: 1 },
  error: { color: 'err', speed: 0.45, dir: 1, pulseHz: 0.4, pulse: 0.3, glow: 0.9, scan: 0, voice: 0, tight: 0, packets: 0, cross: 0, dim: 0.9 },
  offline: { color: 'mute', speed: 0.2, dir: 1, pulseHz: 0.1, pulse: 0.06, glow: 0.35, scan: 0, voice: 0, tight: 0, packets: 0, cross: 0, dim: 0.55 },
  // Standby (the ambient screen on a charger): the rings barely turn and the heart breathes once
  // every 10 s, dimmed for an OLED screen in a dark room.
  standby: { color: 'accent', speed: 0.3, dir: 1, pulseHz: 0.1, pulse: 0.22, glow: 0.55, scan: 0, voice: 0, tight: 0, packets: 0, cross: 0, dim: 0.6 },
};
const PARAM_KEYS = ['speed', 'dir', 'pulseHz', 'pulse', 'glow', 'scan', 'voice', 'tight', 'cross', 'dim'];

const STATE_TEXT = {
  idle: 'standing by',
  listening: 'listening',
  thinking: 'thinking',
  working: 'agents working',
  speaking: 'speaking',
  optics: 'optics live',
  error: 'error',
  offline: 'offline',
  standby: 'standby',
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

/** A stable 0..1 phase for an agent id (FNV-1a): the same agent always wobbles the same way. */
export function phaseOf(id) {
  const s = String(id);
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193);
  }
  return (x >>> 0) / 4294967296;
}

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
  live: ['--live', '#ff5c72'],
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
// HUD motion setting (SPEC 2.4.12): 'full' animates (the system's reduced-motion still wins),
// 'reduced' lets hero and orbit cores rest on a static frame when Jarvis is at rest, 'still'
// draws static frames only. Every live core follows a change at once.

let motionPref = 'full';
const motionListeners = new Set();

/** Set the HUD motion preference for every core: 'full' | 'reduced' | 'still'. */
export function setCoreMotion(value) {
  const next = value === 'still' || value === 'reduced' ? value : 'full';
  if (next === motionPref) return;
  motionPref = next;
  for (const fn of Array.from(motionListeners)) fn();
}

export function getCoreMotion() {
  return motionPref;
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

// Telemetry gauges: three fixed arcs of 108° (36 ticks of 3°) with 12° gaps centered on 12, 4 and
// 8 o'clock (the 12 o'clock gap leaves room for the alert bead). Each fills clockwise from its
// start: AGENTS from 12 to 4 o'clock, MISSION from 4 to 8, SPEND from 8 to 12. Fixed, so each
// gauge always sits in the same place beside its label; the sweeping highlight keeps it alive.
export const GAUGES = Object.freeze(['spend', 'agents', 'mission']);
const GAUGE_START_DEG = { agents: -84, mission: 36, spend: 156 };
const gaugeCache = new Map();
function gaugeTable(perGauge) {
  let t = gaugeCache.get(perGauge);
  if (!t) {
    const n = perGauge * 3;
    t = { per: perGauge, cos: new Float32Array(n), sin: new Float32Array(n) };
    const cell = 108 / perGauge;
    GAUGES.forEach((name, g) => {
      for (let j = 0; j < perGauge; j++) {
        const a = (GAUGE_START_DEG[name] + (j + 0.5) * cell) * DEG;
        t.cos[g * perGauge + j] = Math.cos(a);
        t.sin[g * perGauge + j] = Math.sin(a);
      }
    });
    gaugeCache.set(perGauge, t);
  }
  return t;
}

const HERO_SEG = arcSet(0, 84, 98, 38, 150, 128, 292, 52);
const HERO_SEG_N = HERO_SEG.length / 2;
const HERO_THICK = evenArcs(8, 35);
const HERO_BRACKETS = arcSet(-5, 10, 85, 10, 175, 10, 265, 10);
const MINI_SEG = arcSet(0, 96, 120, 96, 240, 96);
const ORBIT_SEG = arcSet(0, 64, 76, 96, 186, 28, 228, 118);
const ORBIT_BRACKETS = arcSet(-3, 6, 87, 6, 177, 6, 267, 6);
// Voice band: 8 segments; band i is segment i, counted clockwise from 12 o'clock.
const BANDS = 8;
// Fixed sensor beads (canvas angles): MIC at 8 o'clock, OPTICS at 4 o'clock.
export const SENSORS = Object.freeze(['mic', 'optics']);
const SENSOR_ANGLE = new Float32Array([150 * DEG, 30 * DEG]);
const SENSOR_CODE = { off: 0, ready: 1, live: 2 };
// Packets ride the data ring: at most 12, re-seeded at golden-angle steps (no randomness).
const MAX_PACKETS = 12;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const PACKET_S = 2.8; // one life (travel, then drop to the voice band) at ring speed ×1
// Boot: the rings assemble outward, 90 ms apart, each growing to full length in 450 ms.
const BOOT_S = 1.6;
const BOOT_LAYER = { heart: 0, sensor: 0.15, voice: 0.24, scanner: 0.33, data: 0.42, ticks: 0.51, bezel: 0.6 };
const BOOT_GROW = 0.45;

// ---------------------------------------------------------------------------------------------
// Drawing primitives (no allocation)

function strokeCircle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
}

/** A circle drawn from 12 o'clock clockwise to `frac` of a turn (boot reveal); 1 = full. */
function strokeCirclePart(ctx, cx, cy, r, frac) {
  if (frac >= 1) {
    strokeCircle(ctx, cx, cy, r);
    return;
  }
  if (frac <= 0) return;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
  ctx.stroke();
}

/** Arc set at radius r, each arc grown to `grow` of its length (1 = full). */
function strokeArcs(ctx, cx, cy, r, rot, set, grow = 1) {
  if (grow <= 0) return;
  ctx.beginPath();
  for (let i = 0; i < set.length; i += 2) {
    const a0 = rot + set[i];
    ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ctx.arc(cx, cy, r, a0, a0 + set[i + 1] * (grow < 1 ? grow : 1));
  }
  ctx.stroke();
}

function strokeDashes(ctx, cx, cy, r, rot, count, dash, shown = 1) {
  const step = TAU / count;
  const n = shown >= 1 ? count : Math.floor(count * shown);
  if (n <= 0) return;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
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

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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

const resolved = Promise.resolve(false);
const NOOP_CORE = Object.freeze({
  setState() {},
  setAgents() {},
  setLevel() {},
  setBands() {},
  setTelemetry() {},
  setSensors() {},
  setAlert() {},
  cue() {},
  boot: () => resolved,
  skipBoot() {},
  celebrate() {},
  destroy() {},
  debugStats: () => null,
});

// Mission-complete burst: a flash at the core, two rings racing outward and the agent nodes
// lighting up as the first ring passes them.
const BURST_S = 1.7;
const BURST_STALE_MS = 2500; // a burst that could not be shown in time (core asleep) is dropped

// ---------------------------------------------------------------------------------------------

/** Gauge fraction from telemetry input: a number (fraction), [value, max], or null (unknown). */
export function gaugeFraction(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    const a = Number(v[0]);
    const b = Number(v[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
    return Math.max(0, a / b);
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ size?: number, mode?: 'hero'|'mini'|'orbit', idleSleepMs?: number }} [opts]
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
  const cur = { speed: 1, dir: 1, pulseHz: 0.2, pulse: 0.16, glow: 0.85, scan: 0, voice: 0, tight: 0, cross: 0, dim: 1 };
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
  let levelAt = -10; // clock when the level was last set above zero
  let burstColor = null; // palette color while a completion burst plays
  let burstAt = 0; // animation clock when it started
  let burstWall = 0; // performance.now() when it was requested
  let burstRing = -1; // radius of the leading burst ring this frame (-1: none)

  // Voice band: displayed values (eased), targets, and the optional external source.
  const bandCur = new Float32Array(BANDS);
  const bandTarget = new Float32Array(BANDS);
  const bandExt = new Float32Array(BANDS);
  let hasExt = false;
  let ripple = 0; // rotating phase that spreads a single level over the eight segments

  // Telemetry gauges (spend, agents, mission): target and eased lit fractions.
  const gTarget = new Float32Array(3);
  const gCur = new Float32Array(3);
  const gKnown = new Uint8Array(3);
  const gOver = new Uint8Array(3);
  let agentsActive = 0;

  // Sensors and the alert bead.
  const sensor = new Uint8Array(2); // SENSOR_CODE per SENSORS entry
  let alertCount = 0;
  let alertAt = -10;

  // Packets on the data ring.
  const pkAng = new Float32Array(MAX_PACKETS);
  const pkLife = new Float32Array(MAX_PACKETS);
  const pkOn = new Float32Array(MAX_PACKETS);
  let pkSeq = MAX_PACKETS;
  for (let i = 0; i < MAX_PACKETS; i++) {
    pkAng[i] = (i * GOLDEN) % TAU;
    pkLife[i] = i / MAX_PACKETS;
  }

  // One-shot alpha events and the error jitter.
  let flareAt = -10; // cue('answer')
  let captureAt = -10; // cue('capture'): one scanner pass
  let jitterAt = -10; // entering the error state

  // Boot sequence.
  let bootAt = -1; // clock at boot start (-1: not booting)
  let bootResolve = null;
  let bootTimer = 0;

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
  let staticDraws = 0; // static frames drawn (reduced motion / dozing)

  const reducedMq = watchMedia('(prefers-reduced-motion: reduce)', () => onMotionChange());
  const smallMq = watchMedia('(max-width: 899px), (pointer: coarse)', () => {
    updateFps();
    measure(); // the resolution cap depends on it too
  });
  updateFps();
  motionListeners.add(onMotionChange);

  function stillMotion() {
    return reducedMq.matches || motionPref === 'still';
  }

  function onMotionChange() {
    if (destroyed) return;
    if (stillMotion()) skipBoot();
    updateDozeMs();
    scheduleDoze();
    if (!stillMotion() && dozing && !dozeMs) dozing = false;
    updateAwake();
    if (isStatic()) drawStatic();
  }

  function updateFps() {
    fps = mode === 'mini' || smallMq.matches ? 30 : 60;
    // opts.maxFps: a slower cap for a core that barely moves (Standby: 15 fps saves the battery).
    if (Number.isFinite(opts.maxFps) && opts.maxFps >= 5) fps = Math.min(fps, opts.maxFps);
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

  // Dozing: no animation loop, one static frame per change. The mini orb dozes after 30 s at
  // rest; with HUD motion "Reduced" every core does, after a few seconds.
  let dozeMs = 0;
  let dozing = false;
  let dozeTimer = 0;
  function updateDozeMs() {
    if (Number.isFinite(opts.idleSleepMs)) dozeMs = Math.max(0, opts.idleSleepMs);
    else if (mode === 'mini') dozeMs = MINI_DOZE_MS;
    else dozeMs = motionPref === 'reduced' ? REDUCED_DOZE_MS : 0;
  }
  updateDozeMs();

  function scheduleDoze() {
    if (dozeTimer) clearTimeout(dozeTimer);
    dozeTimer = 0;
    if (!dozeMs || destroyed || !RESTING.has(state)) return;
    dozeTimer = setTimeout(() => {
      dozeTimer = 0;
      if (destroyed || !RESTING.has(state) || bootAt >= 0) return;
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
    return !destroyed && (stillMotion() || dozing);
  }

  function updateAwake() {
    const should =
      !destroyed &&
      !dozing &&
      !stillMotion() &&
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
    for (let i = 0; i < PARAM_KEYS.length; i++) {
      const key = PARAM_KEYS[i];
      cur[key] = ease(cur[key], target[key], key === 'tight' ? 1 - Math.exp(-dt / 0.22) : k);
    }

    if (colorMix < 1) colorMix = Math.min(1, colorMix + dt / 0.45);
    updateLineColor();

    const sp = cur.speed;
    const dir = cur.dir;
    rot[0] += dt * 0.05 * sp; // bezel brackets, ~126 s a turn
    rot[1] -= dt * 0.035 * sp; // orbit/mini ticks, ~180 s a turn
    rot[2] += dt * 0.16 * sp * dir; // data ring, ~39 s a turn (reversed while thinking)
    rot[3] -= dt * 0.09 * sp * dir; // scanner dashes
    rot[4] -= dt * 0.21 * sp; // voice band, ~30 s a turn
    rot[5] += dt * 0.42 * sp; // sensor ring, ~15 s a turn
    rot[6] += dt * 0.7 * sp; // mini ring
    pulsePhase += dt * cur.pulseHz * TAU;
    scanAngle += dt * (1.1 + 0.55 * sp) * (dir < 0 ? -1 : 1);
    highlight += dt * 0.38 * sp; // telemetry sweep, ~16.5 s a lap
    orbitRot += dt * 0.03 * (0.6 + 0.4 * sp);

    const kl = 1 - Math.exp(-dt / (levelTarget > level ? 0.05 : 0.25));
    level += (levelTarget - level) * kl;

    stepBands(dt);
    stepGauges(dt);
    if (mode === 'hero') stepPackets(dt);

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

    if (bootAt >= 0 && clock - bootAt >= BOOT_S) endBoot();
  }

  // Voice band targets: the external bands (mic analyser) when set; otherwise the voice level
  // spread over the eight segments by a rotating phase so the band ripples clockwise; with no
  // level at all while listening or speaking, the "auto" murmur (a gentle synthetic level).
  function stepBands(dt) {
    ripple += dt * 2.6;
    const v = cur.voice;
    if (hasExt) {
      for (let i = 0; i < BANDS; i++) bandTarget[i] = bandExt[i] * v;
    } else {
      let lv = level;
      if (lv < 0.02 && clock - levelAt > 0.6) lv = 0.16 + 0.1 * Math.sin(clock * 1.7) + 0.05 * Math.sin(clock * 4.3);
      for (let i = 0; i < BANDS; i++) {
        const w = 0.5 + 0.5 * Math.sin(ripple - i * (TAU / BANDS));
        bandTarget[i] = lv * (0.45 + 0.55 * w) * v;
      }
    }
    // 50 ms rise, 250 ms fall.
    const up = 1 - Math.exp(-dt / 0.05);
    const down = 1 - Math.exp(-dt / 0.25);
    for (let i = 0; i < BANDS; i++) {
      const tgt = bandTarget[i];
      bandCur[i] += (tgt - bandCur[i]) * (tgt > bandCur[i] ? up : down);
    }
  }

  function stepGauges(dt) {
    const kg = 1 - Math.exp(-dt / 0.4);
    for (let g = 0; g < 3; g++) gCur[g] = ease(gCur[g], gKnown[g] ? gTarget[g] : 0, kg);
  }

  function packetWant() {
    if (target.packets < 0) return agentsActive > MAX_PACKETS ? MAX_PACKETS : agentsActive;
    return target.packets;
  }

  function stepPackets(dt) {
    const want = packetWant();
    const kf = 1 - Math.exp(-dt / 0.3);
    const rate = (0.55 + 0.45 * cur.speed) / PACKET_S;
    for (let i = 0; i < MAX_PACKETS; i++) {
      const on = i < want ? 1 : 0;
      pkOn[i] += (on - pkOn[i]) * kf;
      if (pkOn[i] < 0.004 && !on) {
        pkOn[i] = 0;
        continue;
      }
      pkLife[i] += dt * rate;
      if (pkLife[i] >= 1) {
        pkLife[i] -= 1;
        pkAng[i] = (pkSeq++ * GOLDEN) % TAU;
      }
    }
  }

  function snapAll() {
    for (let i = 0; i < PARAM_KEYS.length; i++) cur[PARAM_KEYS[i]] = target[PARAM_KEYS[i]];
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
    for (let g = 0; g < 3; g++) gCur[g] = gKnown[g] ? gTarget[g] : 0;
    // A static voice band shows the real bands, or a calm fixed shape while voice is active.
    for (let i = 0; i < BANDS; i++) bandCur[i] = hasExt ? bandExt[i] * target.voice : target.voice * (0.22 + 0.12 * Math.cos(i * 0.9));
    const want = packetWant();
    for (let i = 0; i < MAX_PACKETS; i++) pkOn[i] = i < want ? 1 : 0;
    burstColor = null;
    flareAt = -10;
    captureAt = -10;
    jitterAt = -10;
    alertAt = -10;
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
    staticDraws++;
  }

  function corePulse() {
    return cur.pulse * (0.5 + 0.5 * Math.sin(pulsePhase)) + level * 0.45;
  }

  /** Boot reveal 0..1 for a layer (1 when not booting). */
  function reveal(layer) {
    if (bootAt < 0) return 1;
    return clamp01((clock - bootAt - layer) / BOOT_GROW);
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
    const booting = bootAt >= 0;
    const flare = clock - flareAt < 0.3 ? 1 - (clock - flareAt) / 0.3 : 0;

    // Bezel: hairline circle and four brackets; the alert bead at 12 o'clock.
    const rvBezel = reveal(BOOT_LAYER.bezel);
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.14 * dim;
    strokeCirclePart(ctx, cx, cy, R * 0.965, rvBezel);
    ctx.lineWidth = Math.max(1.5, R * 0.016);
    ctx.globalAlpha = 0.7 * dim * rvBezel;
    strokeArcs(ctx, cx, cy, R * 0.965, rot[0], HERO_BRACKETS, rvBezel);

    // Telemetry gauges and their sweeping highlight.
    drawGauges(cx, cy, R * 0.9, thin, dim, reveal(BOOT_LAYER.ticks), booting);

    // Data ring: faint full circle, segmented arcs (with the error jitter) and packets.
    const rvData = reveal(BOOT_LAYER.data);
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.12 * dim;
    strokeCirclePart(ctx, cx, cy, R * 0.79, rvData);
    ctx.lineWidth = Math.max(1.25, R * 0.014);
    ctx.globalAlpha = 0.82 * dim * rvData;
    const jit = clock - jitterAt < 0.4 ? 1 - (clock - jitterAt) / 0.4 : 0;
    if (jit > 0) drawJitteredSegments(cx, cy, R * 0.79, jit);
    else strokeArcs(ctx, cx, cy, R * 0.79, rot[2], HERO_SEG, rvData);
    drawPackets(cx, cy, R * 0.79, R * (0.585 - 0.025 * cur.tight), R, dim * rvData);

    // Scanner ring: dashes, plus the scanner while thinking / working or on a capture.
    const rvScan = reveal(BOOT_LAYER.scanner);
    ctx.lineWidth = Math.max(1, R * 0.012);
    ctx.globalAlpha = 0.36 * dim;
    strokeDashes(ctx, cx, cy, R * 0.7, rot[3], R > 80 ? 72 : 48, 2.2 * DEG, rvScan);
    const cap = clock - captureAt < 0.6 ? (clock - captureAt) / 0.6 : -1;
    if (cur.scan > 0.01) drawScanner(cx, cy, R * 0.7, Math.max(1.5, R * 0.02), 0.95 * cur.scan * dim, scanAngle);
    if (cap >= 0) drawScanner(cx, cy, R * 0.7, Math.max(1.5, R * 0.02), 0.95 * (1 - cap * 0.4) * dim, -Math.PI / 2 + cap * TAU);

    // Voice band.
    drawVoiceBand(cx, cy, R * (0.585 - 0.025 * cur.tight), R * 0.045, dim, reveal(BOOT_LAYER.voice), flare, rot[4]);

    // Sensor ring: turns under the two fixed beads.
    drawSensors(cx, cy, R * 0.475, R, thin, dim, reveal(BOOT_LAYER.sensor));

    if (total > 0) drawProgress(cx, cy, R * 0.965, Math.max(1.5, R * 0.016), dim, false);
    burstRing = burstColor ? burstRadius(R * 0.3, R * 0.98) : -1;
    if (nodes.length) drawNodes(cx, cy, R, R * 0.79, false);
    if (burstColor) drawBurst(cx, cy, R, R * 0.3, Math.max(1.5, R * 0.016));

    // The heart.
    const light = booting ? clamp01((clock - bootAt) / 0.3) : 1;
    ctx.globalCompositeOperation = 'lighter';
    stateGlow('soft', cx, cy, R * 0.64 * (1 + 0.1 * amp + 0.12 * flare), (cur.glow * (0.5 + 0.45 * amp) + 0.35 * flare) * dim * light);
    stateGlow('hot', cx, cy, R * 0.36 * (1 + 0.22 * amp + 0.15 * flare), (0.85 + 0.15 * amp) * dim * light);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = Math.max(1, R * 0.01);
    ctx.globalAlpha = (0.4 + 0.35 * amp) * dim * light;
    strokeCircle(ctx, cx, cy, R * 0.215 * (1 + 0.05 * amp));

    // Optics crosshair: four ticks at 0.2R.
    if (cur.cross > 0.01) {
      ctx.lineWidth = Math.max(1, R * 0.012);
      ctx.globalAlpha = 0.85 * cur.cross * dim;
      ctx.strokeStyle = pal.text.css;
      const r0 = R * 0.2;
      const r1 = R * 0.13;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r0);
      ctx.lineTo(cx, cy - r1);
      ctx.moveTo(cx, cy + r0);
      ctx.lineTo(cx, cy + r1);
      ctx.moveTo(cx - r0, cy);
      ctx.lineTo(cx - r1, cy);
      ctx.moveTo(cx + r0, cy);
      ctx.lineTo(cx + r1, cy);
      ctx.stroke();
      ctx.strokeStyle = lineCss;
    }

    if (alertCount > 0) drawAlertBead(cx, cy - R * 0.965, R, rvBezel);
  }

  // The three telemetry gauges: unlit ticks .2, lit ticks .75 (amber when spend is over the
  // alert), an unknown gauge stays dark with no lit ticks. The highlight sweeps over all three.
  function drawGauges(cx, cy, r, thin, dim, rv, booting) {
    const per = r > 36 ? 36 : 18;
    const table = gaugeTable(per);
    const len = r * 0.042;
    const major = r * 0.08;
    const shownTicks = rv >= 1 ? per : Math.floor(per * rv);
    if (shownTicks <= 0) return;
    ctx.lineWidth = thin;
    for (let pass = 0; pass < 5; pass++) {
      // 0: unknown gauges · 1: unlit ticks · 2: lit ticks (state color) · 3: lit, spend over the
      // alert (warn) · 4: lit mission progress (ok, like the orbit's progress ring)
      let any = false;
      ctx.beginPath();
      for (let g = 0; g < 3; g++) {
        const known = gKnown[g] === 1;
        if ((pass === 0) === known) continue;
        const lit = known ? gCur[g] * per : 0;
        const tone = gOver[g] === 1 ? 3 : g === 2 ? 4 : 2;
        if (pass >= 2 && pass !== tone) continue;
        for (let j = 0; j < shownTicks; j++) {
          const isLit = known && j < lit - 0.5;
          if (pass === 1 && isLit) continue;
          if (pass >= 2 && !isLit) continue;
          const k = g * per + j;
          const c = table.cos[k];
          const s = table.sin[k];
          const l = j === 0 || j === per - 1 ? major : len;
          ctx.moveTo(cx + c * r, cy + s * r);
          ctx.lineTo(cx + c * (r - l), cy + s * (r - l));
          any = true;
        }
      }
      if (!any) continue;
      if (pass === 0) ctx.globalAlpha = 0.09 * dim;
      else if (pass === 1) ctx.globalAlpha = 0.2 * dim;
      else ctx.globalAlpha = 0.85 * dim;
      if (pass === 3) ctx.strokeStyle = pal.warn.css;
      else if (pass === 4) ctx.strokeStyle = pal.ok.css;
      ctx.stroke();
      if (pass >= 3) ctx.strokeStyle = lineCss;
    }
    // Sweep: one fast lap during boot (600–1200 ms), else ~16.5 s a lap.
    let sweep = highlight;
    if (booting) {
      const t = (clock - bootAt - 0.6) / 0.6;
      if (t < 0 || t > 1) return;
      sweep = -Math.PI / 2 + t * TAU;
    }
    const sc = Math.cos(sweep);
    const ss = Math.sin(sweep);
    ctx.globalAlpha = 0.5 * dim;
    ctx.beginPath();
    for (let k = 0; k < per * 3; k++) {
      if ((k % per) >= shownTicks) continue;
      const c = table.cos[k];
      const s = table.sin[k];
      if (c * sc + s * ss < 0.93) continue;
      ctx.moveTo(cx + c * r, cy + s * r);
      ctx.lineTo(cx + c * (r - len), cy + s * (r - len));
    }
    ctx.stroke();
  }

  // "Ultron jitter" (entering the error state): the data ring's segments shift by up to 1.5 px
  // for 400 ms, then settle. Deterministic offsets per segment.
  function drawJitteredSegments(cx, cy, r, amount) {
    for (let i = 0; i < HERO_SEG_N; i++) {
      const off = 1.5 * amount * Math.sin(clock * 97 + i * 2.39);
      const a0 = rot[2] + HERO_SEG[i * 2];
      ctx.beginPath();
      ctx.arc(cx, cy, r + off, a0, a0 + HERO_SEG[i * 2 + 1]);
      ctx.stroke();
    }
  }

  // Packets: short bright dashes (6°) that travel along the data ring, then drop to the voice band.
  function drawPackets(cx, cy, r, rIn, R, dim) {
    if (pkOn[0] <= 0.01 && packetWant() === 0) {
      let any = false;
      for (let i = 1; i < MAX_PACKETS; i++) if (pkOn[i] > 0.01) any = true;
      if (!any) return;
    }
    ctx.lineWidth = Math.max(1.6, R * 0.024);
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.text.css;
    ctx.globalCompositeOperation = 'lighter';
    const dash = 6 * DEG;
    const travel = 0.72;
    const span = 64 * DEG * cur.dir;
    for (let i = 0; i < MAX_PACKETS; i++) {
      const on = pkOn[i];
      if (on <= 0.01) continue;
      const life = pkLife[i];
      if (life < travel) {
        const a = pkAng[i] + rot[2] + span * (life / travel);
        const fade = life < 0.08 ? life / 0.08 : 1;
        ctx.globalAlpha = 0.9 * on * fade * dim;
        ctx.beginPath();
        ctx.arc(cx, cy, r, a, a + dash);
        ctx.stroke();
      } else {
        const p = (life - travel) / (1 - travel);
        const a = pkAng[i] + rot[2] + span + dash * 0.5;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const head = r - (r - rIn) * easeOutCubic(p);
        const tail = Math.min(r, head + R * 0.05);
        ctx.globalAlpha = 0.9 * on * (1 - p) * dim;
        ctx.beginPath();
        ctx.moveTo(cx + c * tail, cy + s * tail);
        ctx.lineTo(cx + c * head, cy + s * head);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt';
    ctx.strokeStyle = lineCss;
  }

  // Voice band: 8 thick segments. Thickness = base × (1 + 1.6 × band); brightness follows too.
  function drawVoiceBand(cx, cy, r, base, dim, rv, flare, rotation) {
    if (rv <= 0) return;
    const seg = HERO_THICK;
    for (let i = 0; i < BANDS; i++) {
      const b = bandCur[i];
      const a0 = rotation + seg[i * 2] - Math.PI / 2;
      ctx.lineWidth = base * (1 + 1.6 * b);
      const hi = i === 0 || i === 4 ? 0.38 : 0; // two brighter segments at rest, as before
      ctx.globalAlpha = (0.17 + hi + 0.55 * b + 0.25 * flare) * dim;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a0 + seg[i * 2 + 1] * (rv < 1 ? rv : 1));
      ctx.stroke();
    }
  }

  // Sensor ring: a hairline that turns (three notches show the turn) under two fixed beads.
  // Off: hollow, .3 · ready: small, accent · live: --live, breathing at 1 Hz.
  function drawSensors(cx, cy, r, R, thin, dim, rv) {
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.45 * dim;
    strokeCirclePart(ctx, cx, cy, r, rv);
    if (rv < 1) return;
    // Three notches across the ring show it turning (dots would read as sensor beads).
    const notch = Math.max(2, R * 0.032);
    ctx.lineWidth = Math.max(1, R * 0.01);
    ctx.globalAlpha = 0.55 * dim;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = rot[5] + (i * TAU) / 3;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.moveTo(cx + c * (r - notch), cy + s * (r - notch));
      ctx.lineTo(cx + c * (r + notch), cy + s * (r + notch));
    }
    ctx.stroke();
    const breath = 0.5 + 0.5 * Math.sin(clock * TAU);
    for (let i = 0; i < 2; i++) {
      const code = sensor[i];
      const x = cx + Math.cos(SENSOR_ANGLE[i]) * r;
      const y = cy + Math.sin(SENSOR_ANGLE[i]) * r;
      if (code === 0) {
        ctx.lineWidth = Math.max(1, R * 0.008);
        ctx.globalAlpha = 0.3 * dim;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, R * 0.022), 0, TAU);
        ctx.stroke();
      } else if (code === 1) {
        ctx.fillStyle = pal.accent.css;
        ctx.globalAlpha = 0.9 * dim;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.6, R * 0.016), 0, TAU);
        ctx.fill();
        ctx.fillStyle = lineCss;
      } else {
        const br = isStatic() ? 1 : breath;
        ctx.globalCompositeOperation = 'lighter';
        blit(ctx, getSprite(pal.live, 'soft'), x, y, Math.max(6, R * 0.08), (0.45 + 0.4 * br) * dim);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = pal.live.css;
        ctx.globalAlpha = (0.75 + 0.25 * br) * dim;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2.2, R * 0.026) * (0.9 + 0.15 * br), 0, TAU);
        ctx.fill();
        ctx.fillStyle = lineCss;
      }
    }
  }

  // Needs-you: an amber bead at 12 o'clock on the bezel; two 600 ms pulses when an item arrives.
  function drawAlertBead(x, y, R, rv) {
    if (rv < 1) return;
    const since = clock - alertAt;
    const r = Math.max(2.4, R * 0.028);
    if (since >= 0 && since < 1.2) {
      const p = (since % 0.6) / 0.6;
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, getSprite(pal.warn, 'soft'), x, y, r * (3 + 5 * p), (1 - p) * 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalCompositeOperation = 'lighter';
    blit(ctx, getSprite(pal.warn, 'soft'), x, y, r * 3.2, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pal.warn.css;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = lineCss;
  }

  function drawOrbit(cx, cy, R) {
    const dim = cur.dim;
    const amp = corePulse();
    const thin = Math.max(1, R * 0.006);
    const orbitR = R * 0.7;
    // The boot (v7.4: Voice Mode woken from Standby): the rings assemble outward like the hero's.
    const rvBezel = reveal(BOOT_LAYER.bezel);
    const rvTicks = reveal(BOOT_LAYER.ticks);
    const rvData = reveal(BOOT_LAYER.data);
    const rvScan = reveal(BOOT_LAYER.scanner);

    // Outer bezel with fine ticks.
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.1 * dim;
    strokeCirclePart(ctx, cx, cy, R * 0.985, rvBezel);
    ctx.globalAlpha = 0.2 * dim * rvTicks;
    strokeTicks(ctx, cx, cy, R * 0.985, rot[1], tickTable(90), R * 0.016, 15, R * 0.04, 0, 0, -3);
    ctx.lineWidth = Math.max(1.5, R * 0.014);
    ctx.globalAlpha = 0.6 * dim * rvBezel;
    strokeArcs(ctx, cx, cy, R * 0.985, rot[0], ORBIT_BRACKETS, rvBezel);

    // Orbit track the agents ride on.
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.22 * dim;
    strokeDashes(ctx, cx, cy, orbitR, orbitRot, 96, 1.5 * DEG, rvData);

    // Inner instrument rings.
    ctx.lineWidth = Math.max(1.2, R * 0.011);
    ctx.globalAlpha = 0.6 * dim * rvScan;
    strokeArcs(ctx, cx, cy, R * 0.505, rot[2], ORBIT_SEG, rvScan);
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.09 * dim * rvScan;
    strokeCircle(ctx, cx, cy, R * 0.505);
    ctx.globalAlpha = 0.28 * dim * rvScan;
    strokeTicks(ctx, cx, cy, R * 0.44, rot[3], tickTable(72), R * 0.02, 6, R * 0.04, 0, 0, -3);
    if (cur.scan > 0.01) drawScanner(cx, cy, R * 0.585, Math.max(1.5, R * 0.016), 0.75 * cur.scan * dim, scanAngle);

    // The voice band rides the scanner track while Jarvis listens or speaks (Voice Mode).
    if (cur.voice > 0.01) drawVoiceBand(cx, cy, R * (0.585 - 0.02 * cur.tight), R * 0.03, dim * cur.voice, 1, 0, rot[4]);

    // Mission progress ring (done / failed / stopped) around the core.
    drawProgress(cx, cy, R * 0.345, Math.max(2, R * 0.022), dim, true);

    burstRing = burstColor ? burstRadius(R * 0.345, R * 0.98) : -1;
    if (nodes.length) drawNodes(cx, cy, R, orbitR, true);
    if (burstColor) drawBurst(cx, cy, R, R * 0.345, Math.max(2, R * 0.022));

    // Core: a luminous ring around a dark readout when there are agents; a hot core otherwise.
    const light = bootAt >= 0 ? clamp01((clock - bootAt) / 0.3) : 1;
    ctx.globalCompositeOperation = 'lighter';
    stateGlow('soft', cx, cy, R * 0.44 * (1 + 0.08 * amp), cur.glow * (0.45 + 0.4 * amp) * dim * light);
    if (!readout) stateGlow('hot', cx, cy, R * 0.25 * (1 + 0.2 * amp), (0.85 + 0.15 * amp) * dim * light);
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

  function drawScanner(cx, cy, r, lw, alpha, angle) {
    const steps = 12;
    const seg = (80 * DEG) / steps;
    const back = cur.dir < 0 ? -1 : 1; // the trail follows the sweep direction
    ctx.lineWidth = lw;
    ctx.strokeStyle = lineCss;
    for (let i = 0; i < steps; i++) {
      const f = 1 - i / steps;
      ctx.globalAlpha = alpha * f * f;
      ctx.beginPath();
      if (back > 0) ctx.arc(cx, cy, r, angle - (i + 1) * seg, angle - i * seg + 0.004);
      else ctx.arc(cx, cy, r, angle + i * seg - 0.004, angle + (i + 1) * seg);
      ctx.stroke();
    }
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
    ctx.strokeStyle = lineCss;
    ctx.fillStyle = lineCss;

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
    ctx.fillStyle = lineCss;
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

  // --- boot ---------------------------------------------------------------------------------
  function endBoot() {
    if (bootTimer) clearTimeout(bootTimer);
    bootTimer = 0;
    const wasBooting = bootAt >= 0;
    bootAt = -1;
    const done = bootResolve;
    bootResolve = null;
    if (done) done(wasBooting);
    if (wasBooting && isStatic()) drawStatic();
    scheduleDoze();
  }

  /**
   * The 1.6 s boot: the heart lights, the rings assemble outward and the sweep runs one fast
   * lap. Resolves true when it played to the end, false when skipped (skipBoot, reduced motion
   * or "Still", the mini orb). Never plays late: a core asleep at the time just resolves. The orbit
   * core (Voice Mode) boots too since v7.4: Jarvis woken from Standby.
   */
  function boot() {
    if (destroyed || mode === 'mini' || stillMotion()) return Promise.resolve(false);
    if (bootResolve) return Promise.resolve(false); // already booting: the first caller waits
    noteNews();
    bootAt = clock;
    const p = new Promise((resolve) => {
      bootResolve = resolve;
    });
    // The clock only advances while drawing: a hidden page or a covered core ends the boot on time.
    bootTimer = setTimeout(() => endBoot(), BOOT_S * 1000 + 250);
    return p;
  }

  function skipBoot() {
    if (bootAt < 0) return;
    const done = bootResolve;
    bootResolve = null;
    if (bootTimer) clearTimeout(bootTimer);
    bootTimer = 0;
    bootAt = -1;
    if (done) done(false);
    if (isStatic()) drawStatic();
  }

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
    if (s === 'error') jitterAt = clock;
    setAria();
    noteNews();
    if (isStatic()) drawStatic();
  }

  function setLevel(value) {
    if (destroyed) return;
    const v = Number(value);
    levelTarget = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    if (levelTarget > 0.02) {
      levelAt = clock;
      if (dozing) noteNews(); // a voice level means something is happening
    }
  }

  /** Real voice bands (8 values 0..1, e.g. from the mic analyser), or null for synthetic bands. */
  function setBands(bands) {
    if (destroyed) return;
    if (!bands || typeof bands.length !== 'number' || bands.length < BANDS) {
      hasExt = false;
      return;
    }
    hasExt = true;
    for (let i = 0; i < BANDS; i++) {
      const v = Number(bands[i]);
      bandExt[i] = Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0;
    }
    // Up to 30 updates a second: a static core (reduced motion, "Still") keeps its calm frame.
    if (dozing) noteNews();
  }

  /**
   * Real telemetry for the three gauges. Each value is a fraction, [value, max], or null when the
   * value is unknown (the gauge then stays dark): { spend, agents, mission }. spend above 1 (the
   * month's estimate past the owner's alert) lights the gauge amber.
   */
  function setTelemetry(t) {
    if (destroyed || !t || typeof t !== 'object') return;
    let changed = false;
    GAUGES.forEach((name, g) => {
      if (!(name in t)) return;
      const f = gaugeFraction(t[name]);
      const known = f === null ? 0 : 1;
      const frac = f === null ? 0 : f > 1 ? 1 : f;
      const over = f !== null && name === 'spend' && f > 1 ? 1 : 0;
      if (known !== gKnown[g] || Math.abs(frac - gTarget[g]) > 1e-4 || over !== gOver[g]) changed = true;
      gKnown[g] = known;
      gTarget[g] = frac;
      gOver[g] = over;
    });
    if ('agents' in t) {
      const a = t.agents;
      const n = Array.isArray(a) ? Number(a[0]) : 0;
      const next = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      if (next !== agentsActive) changed = true;
      agentsActive = next;
    }
    if (changed) {
      noteNews();
      if (isStatic()) drawStatic();
    }
  }

  /** Sensor beads: { mic, optics } each 'off' | 'ready' | 'live'. */
  function setSensors(s) {
    if (destroyed || !s || typeof s !== 'object') return;
    let changed = false;
    SENSORS.forEach((name, i) => {
      if (!(name in s)) return;
      const code = SENSOR_CODE[s[name]] ?? 0;
      if (code !== sensor[i]) changed = true;
      sensor[i] = code;
    });
    if (changed) {
      noteNews();
      if (isStatic()) drawStatic();
    }
  }

  /** Needs-you count: an amber bead at 12 o'clock while above 0; two pulses when it grows. */
  function setAlert(count) {
    if (destroyed) return;
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n === alertCount) return;
    if (n > alertCount && !isStatic()) alertAt = clock;
    alertCount = n;
    noteNews();
    if (isStatic()) drawStatic();
  }

  /** Alpha events: 'answer' (one flare of the heart, the voice band brightens) or 'capture'. */
  function cue(name) {
    if (destroyed || isStatic()) return;
    if (name === 'answer') flareAt = clock;
    else if (name === 'capture') captureAt = clock;
    else return;
    noteNews();
  }

  /**
   * Mission-complete moment: a flash, rings racing outward and the finished agents lighting up
   * (~1.7s, tone 'ok' or 'warn'). Nothing under reduced motion; dropped if the core is asleep
   * for more than a moment (it never plays late).
   */
  function celebrate(tone) {
    if (destroyed || stillMotion()) return;
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
          phase: phaseOf(id),
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
    skipBoot();
    destroyed = true;
    if (dozeTimer) clearTimeout(dozeTimer);
    dozeTimer = 0;
    paletteListeners.delete(refreshPalette);
    motionListeners.delete(onMotionChange);
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
      staticDraws = 0;
      return null;
    }
    const base = {
      awake,
      dozing,
      mode,
      state,
      agents: total,
      booting: bootAt >= 0,
      staticDraws,
      backing: [canvas.width, canvas.height],
    };
    const n = Math.min(statCount, statBuf.length);
    if (!n) return { frames: 0, avgMs: 0, p95Ms: 0, maxMs: 0, fps: 0, fpsCap: fps, ...base };
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
      bursting: !!burstColor,
      ...base,
    };
  }

  watchDpr();
  setAria();
  measure();
  scheduleDoze();

  return { setState, setAgents, setLevel, setBands, setTelemetry, setSensors, setAlert, cue, boot, skipBoot, celebrate, destroy, debugStats };
}
