// The Core dashboard's living core: the app's Living Core v2 (src/ui/hud/core.js, hero mode)
// copied and simplified for a 24/7 system report. The heart and rings follow the overall health
// (ok cyan, warn amber, alert red, offline grey); the telemetry ring becomes four quadrant gauges
// (CPU top-left, GPU top-right, RAM bottom-left, DISK bottom-right) whose ticks wear their own
// level, with a leader line out to each corner readout; the eight-segment band shows the eight CPU
// threads; packets on the data ring follow network traffic; the scanner makes one pass each time
// the Core refreshes its network checks.
//
// Two layouts, chosen by the stylesheet: on the kiosk the canvas fills the core stage and leader
// lines run out to the four corner readouts; in the remote view (a phone, a tablet, a small window)
// the canvas is a square, the readouts sit in a grid beside or under it and no leaders are drawn.
// The stylesheet says which with `--orb-layout: compact` on the canvas (read on every resize).
//
//   const orb = createOrb(canvas, { onLayout });
//   orb.setHealth('ok' | 'warn' | 'alert' | 'offline');
//   orb.setGauges({ cpu: { value: 0..1 | null, level }, gpu: …, ram: …, disk: … });
//   orb.setThreads([0..1, …]); orb.setTraffic(0..1); orb.setAlert(count); orb.cue('scan');
//   orb.setNight(true); orb.destroy(); orb.debugStats();
//
// Rings, outside in (fractions of the core radius R):
//   0.965 bezel: hairline + four brackets (slow turn); the alert bead at 12 o'clock
//   0.90  gauges: four arcs of 30 ticks, filling upward; lit ticks are real data, unknown stays dark
//   0.79  data ring: segmented arcs carrying packets (network traffic)
//   0.70  scanner ring: dashes; one sweep per network check
//   0.585 thread band: one thick segment per CPU thread, thickness × (1 + 1.6 × load)
//   0.475 sensor ring: three notches turning
//   0.34  the heart: a luminous ring around a dark disc (the state word sits on it, in the DOM)
//
// Hot path: nothing allocates per frame; colors are prebuilt strings, glows are sprites rendered
// once per color, tick directions come from tables, nothing is random. One requestAnimationFrame
// loop, capped at 30 fps (15 at night); under prefers-reduced-motion it draws one static frame
// per change. It sleeps while the page is hidden.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MAX_DPR = 2;

export const HEALTH_STATES = Object.freeze(['ok', 'warn', 'alert', 'offline']);

const STATE_PARAMS = {
  ok: { color: 'accent', speed: 0.75, pulseHz: 0.2, pulse: 0.16, glow: 0.85, dim: 1 },
  warn: { color: 'warn', speed: 0.85, pulseHz: 0.28, pulse: 0.2, glow: 0.9, dim: 1 },
  alert: { color: 'err', speed: 0.95, pulseHz: 0.45, pulse: 0.26, glow: 0.95, dim: 1 },
  offline: { color: 'mute', speed: 0.15, pulseHz: 0.1, pulse: 0.06, glow: 0.3, dim: 0.5 },
};
const PARAM_KEYS = ['speed', 'pulseHz', 'pulse', 'glow', 'dim'];

const TOKENS = {
  accent: ['--accent', '#3ee0ff'],
  accent2: ['--accent-2', '#8af3ff'],
  ok: ['--ok', '#3dffb0'],
  warn: ['--warn', '#ffc457'],
  err: ['--err', '#ff5c72'],
  mute: ['--text-4', '#7d9bb0'],
  text: ['--text', '#e1f6ff'],
  bg: ['--bg', '#04070c'],
};

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

function readPalette() {
  let cs = null;
  try {
    cs = getComputedStyle(document.documentElement);
  } catch {
    cs = null;
  }
  const pal = {};
  for (const key of Object.keys(TOKENS)) {
    const [name, fallback] = TOKENS[key];
    const rgb = (cs && parseColor(cs.getPropertyValue(name))) || parseColor(fallback);
    pal[key] = { key, rgb, css: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` };
  }
  return pal;
}

// Glow sprites: radial gradients rendered once per color, cached on the color object.
function getSprite(color, kind) {
  const slot = kind === 'hot' ? 'hotSprite' : 'softSprite';
  if (color[slot] !== undefined) return color[slot];
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
      const rgba = (a, white = 0) => `rgba(${Math.round(R + (255 - R) * white)}, ${Math.round(G + (255 - G) * white)}, ${Math.round(B + (255 - B) * white)}, ${a})`;
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

function arcSet(...deg) {
  const a = new Float32Array(deg.length);
  for (let i = 0; i < deg.length; i++) a[i] = deg[i] * DEG;
  return a;
}

const HERO_SEG = arcSet(0, 84, 98, 38, 150, 128, 292, 52);
const BRACKETS = arcSet(-5, 10, 85, 10, 175, 10, 265, 10);

// Quadrant gauges: 72° arcs with 18° gaps at 12, 3, 6 and 9 o'clock, each filling upward
// (top gauges from 9 / 3 o'clock toward 12; bottom gauges from 6 o'clock toward 9 / 3).
export const GAUGES = Object.freeze(['cpu', 'gpu', 'ram', 'disk']);
const TICKS = 30;
const SPAN = 72;
// [start angle (deg, canvas: 0 = 3 o'clock, clockwise), direction] for each gauge's first tick.
const GAUGE_GEOM = {
  cpu: [189, 1], // 9 o'clock → 12, clockwise
  gpu: [-9, -1], // 3 o'clock → 12, counter-clockwise
  ram: [99, 1], // 6 o'clock → 9, clockwise
  disk: [81, -1], // 6 o'clock → 3, counter-clockwise
};
// The leader leaves each gauge at its middle (the quadrant's diagonal).
const GAUGE_MID = { cpu: 225, gpu: -45, ram: 135, disk: 45 };
const gaugeCos = new Float32Array(TICKS * 4);
const gaugeSin = new Float32Array(TICKS * 4);
GAUGES.forEach((name, g) => {
  const [start, dir] = GAUGE_GEOM[name];
  const cell = SPAN / TICKS;
  for (let j = 0; j < TICKS; j++) {
    const a = (start + dir * (j + 0.5) * cell) * DEG;
    gaugeCos[g * TICKS + j] = Math.cos(a);
    gaugeSin[g * TICKS + j] = Math.sin(a);
  }
});

const MAX_THREADS = 16;
const MAX_PACKETS = 10;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const PACKET_S = 2.8;
const LEVEL_COLOR = { ok: 'accent', warn: 'warn', alert: 'err' };

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

function blit(ctx, img, x, y, r, alpha) {
  if (!img || alpha <= 0.004 || r <= 0.5) return;
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

const NOOP = Object.freeze({
  setHealth() {},
  setGauges() {},
  setThreads() {},
  setTraffic() {},
  setAlert() {},
  setNight() {},
  cue() {},
  layout: () => null,
  destroy() {},
  debugStats: () => null,
});

/**
 * @param {HTMLCanvasElement} canvas  fills the core stage (the readouts sit in its corners)
 * @param {{ onLayout?: (g: {w:number,h:number,cx:number,cy:number,R:number,anchors:object}) => void, readoutWidth?: number }} [opts]
 */
export function createOrb(canvas, opts = {}) {
  let ctx = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return NOOP;

  let pal = readPalette();
  let state = 'offline';
  let target = STATE_PARAMS.offline;
  const cur = { ...STATE_PARAMS.offline };
  let colorFrom = pal.mute;
  let colorTo = pal.mute;
  let colorMix = 1;
  let lineCss = colorTo.css;
  let lineR = -1;
  let lineG = -1;
  let lineB = -1;

  let clock = 0;
  const rot = new Float64Array(6);
  let pulsePhase = 0;
  let highlight = 0;
  let scanAt = -10;
  let jitterAt = -10;
  let alertCount = 0;
  let alertAt = -10;
  let night = false;

  // Gauges: target / eased fractions, known flags, level codes (0 ok, 1 warn, 2 alert).
  const gTarget = new Float32Array(4);
  const gCur = new Float32Array(4);
  const gKnown = new Uint8Array(4);
  const gLevel = new Uint8Array(4);
  const LEVEL_CODE = { ok: 0, warn: 1, alert: 2 };
  const CODE_KEY = ['accent', 'warn', 'err'];

  // Threads.
  let threadCount = 8;
  const thTarget = new Float32Array(MAX_THREADS);
  const thCur = new Float32Array(MAX_THREADS);
  let threadsKnown = false;

  // Packets ∝ traffic.
  let traffic = 0;
  const pkAng = new Float32Array(MAX_PACKETS);
  const pkLife = new Float32Array(MAX_PACKETS);
  const pkOn = new Float32Array(MAX_PACKETS);
  let pkSeq = MAX_PACKETS;
  for (let i = 0; i < MAX_PACKETS; i++) {
    pkAng[i] = (i * GOLDEN) % TAU;
    pkLife[i] = i / MAX_PACKETS;
  }

  // Geometry (CSS px).
  let compact = false; // the remote view's square canvas: the whole core, no leaders
  let width = 0;
  let height = 0;
  let dpr = 1;
  let gcx = 0;
  let gcy = 0;
  let gR = 0;
  const anchors = { cpu: { x: 0, y: 0, ex: 0, ey: 0, hx: 0 }, gpu: { x: 0, y: 0, ex: 0, ey: 0, hx: 0 }, ram: { x: 0, y: 0, ex: 0, ey: 0, hx: 0 }, disk: { x: 0, y: 0, ex: 0, ey: 0, hx: 0 } };

  let destroyed = false;
  let awake = false;
  let rafId = 0;
  let lastFrame = 0;
  let fps = 30;
  let staticDraws = 0;
  let frames = 0;
  let spentMs = 0;

  const reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const onReduced = () => {
    updateAwake();
    if (isStatic()) drawStatic();
  };
  if (reducedMq && reducedMq.addEventListener) reducedMq.addEventListener('change', onReduced);

  function isStatic() {
    return !destroyed && !!(reducedMq && reducedMq.matches);
  }

  // --- layout ---------------------------------------------------------------------------------
  function computeGeometry() {
    if (compact) {
      // The whole core in the square: the bezel at 0.965 R, the alert bead's glow just outside it.
      gR = Math.max(20, (Math.min(width, height) / 2) * 0.95);
      gcx = width / 2;
      gcy = height / 2;
      for (const name of GAUGES) {
        const A = anchors[name];
        const a = GAUGE_MID[name] * DEG;
        A.x = A.ex = A.hx = gcx + Math.cos(a) * gR * 0.93;
        A.y = A.ey = gcy + Math.sin(a) * gR * 0.93;
      }
      return;
    }
    const readoutW = opts.readoutWidth || 150;
    const lead = Math.max(24, Math.min(56, width * 0.04));
    const byHeight = (height / 2) * 0.96;
    // The corner readouts need readoutW + the leader beside the elbow at 0.764 R.
    const byWidth = (width / 2 - readoutW - lead - 10) / 0.764;
    gR = Math.max(40, Math.min(byHeight, byWidth));
    gcx = width / 2;
    gcy = height / 2;
    const d = 0.7071;
    for (const name of GAUGES) {
      const a = GAUGE_MID[name] * DEG;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const A = anchors[name];
      A.x = gcx + c * gR * 0.93; // leader start, just outside the gauge
      A.y = gcy + s * gR * 0.93;
      A.ex = gcx + Math.sign(c) * d * gR * 1.08; // elbow
      A.ey = gcy + Math.sign(s) * d * gR * 1.08;
      A.hx = A.ex + Math.sign(c) * lead; // end of the horizontal run (the readout starts here)
    }
  }

  function readCompact() {
    try {
      return getComputedStyle(canvas).getPropertyValue('--orb-layout').trim() === 'compact';
    } catch {
      return false;
    }
  }

  function measure() {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const ratio = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    const bw = Math.max(0, Math.round(w * ratio));
    const bh = Math.max(0, Math.round(h * ratio));
    const layout = readCompact();
    const changed = Math.abs(w - width) > 0.01 || Math.abs(h - height) > 0.01 || ratio !== dpr || layout !== compact;
    compact = layout;
    width = w;
    height = h;
    dpr = ratio;
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    if (changed && width > 1 && height > 1) {
      computeGeometry();
      if (opts.onLayout) opts.onLayout({ w: width, h: height, cx: gcx, cy: gcy, R: gR, anchors });
    }
    updateAwake();
    if (width > 1 && height > 1) drawFrame(0); // resizing clears the canvas: never a blank frame
  }

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => measure());
    ro.observe(canvas);
  } else {
    window.addEventListener('resize', measure);
  }
  const onVisibility = () => updateAwake();
  document.addEventListener('visibilitychange', onVisibility);

  function updateAwake() {
    const should = !destroyed && !isStatic() && !document.hidden && width > 1 && height > 1 && canvas.isConnected;
    if (should === awake) return;
    awake = should;
    if (awake) {
      lastFrame = 0;
      rafId = requestAnimationFrame(frame);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function frame(now) {
    rafId = 0;
    if (!awake) return;
    rafId = requestAnimationFrame(frame);
    const minInterval = 1000 / fps;
    if (lastFrame !== 0 && now - lastFrame < minInterval - 2) return;
    const dt = lastFrame === 0 ? 1 / fps : Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const t0 = performance.now();
    drawFrame(dt);
    spentMs += performance.now() - t0;
    frames++;
  }

  // --- stepping -------------------------------------------------------------------------------
  function step(dt) {
    clock += dt;
    const k = 1 - Math.exp(-dt / 0.6);
    for (let i = 0; i < PARAM_KEYS.length; i++) {
      const key = PARAM_KEYS[i];
      cur[key] += (target[key] - cur[key]) * k;
    }
    if (colorMix < 1) colorMix = Math.min(1, colorMix + dt / 0.8);
    updateLineColor();
    const sp = cur.speed * (night ? 0.5 : 1);
    rot[0] += dt * 0.05 * sp; // bezel brackets
    rot[1] += dt * 0.16 * sp; // data ring
    rot[2] -= dt * 0.09 * sp; // scanner dashes
    rot[3] -= dt * 0.12 * sp; // thread band
    rot[4] += dt * 0.3 * sp; // sensor notches
    pulsePhase += dt * cur.pulseHz * TAU;
    highlight += dt * 0.3 * sp;
    const kg = 1 - Math.exp(-dt / 0.5);
    for (let g = 0; g < 4; g++) gCur[g] += ((gKnown[g] ? gTarget[g] : 0) - gCur[g]) * kg;
    const kt = 1 - Math.exp(-dt / 0.35);
    for (let i = 0; i < threadCount; i++) thCur[i] += (thTarget[i] - thCur[i]) * kt;
    stepPackets(dt, sp);
  }

  function packetWant() {
    if (state === 'offline') return 0;
    return Math.round(traffic * MAX_PACKETS);
  }

  function stepPackets(dt, sp) {
    const want = packetWant();
    const kf = 1 - Math.exp(-dt / 0.4);
    const rate = (0.55 + 0.45 * sp) / PACKET_S;
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
    for (let g = 0; g < 4; g++) gCur[g] = gKnown[g] ? gTarget[g] : 0;
    for (let i = 0; i < threadCount; i++) thCur[i] = thTarget[i];
    const want = packetWant();
    for (let i = 0; i < MAX_PACKETS; i++) pkOn[i] = i < want ? 1 : 0;
    scanAt = -10;
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

  function stateGlow(kind, x, y, r, alpha) {
    if (colorMix < 1) {
      const m = easeOutCubic(colorMix);
      blit(ctx, getSprite(colorFrom, kind), x, y, r, alpha * (1 - m));
      blit(ctx, getSprite(colorTo, kind), x, y, r, alpha * m);
    } else {
      blit(ctx, getSprite(colorTo, kind), x, y, r, alpha);
    }
  }

  // --- drawing --------------------------------------------------------------------------------
  function drawFrame(dt) {
    if (width <= 1 || height <= 1) return;
    if (dt > 0) step(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    if (gR < 20) return;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = lineCss;
    ctx.fillStyle = lineCss;
    drawCore(gcx, gcy, gR);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStatic() {
    if (destroyed || width <= 1 || height <= 1) return;
    snapAll();
    drawFrame(0);
    staticDraws++;
  }

  function drawCore(cx, cy, R) {
    const dim = cur.dim * (night ? 0.8 : 1);
    const amp = cur.pulse * (0.5 + 0.5 * Math.sin(pulsePhase));
    const thin = Math.max(1, R * 0.006);

    // Bezel.
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.16 * dim;
    strokeCircle(ctx, cx, cy, R * 0.965);
    ctx.lineWidth = Math.max(1.5, R * 0.013);
    ctx.globalAlpha = 0.7 * dim;
    strokeArcs(ctx, cx, cy, R * 0.965, rot[0], BRACKETS);

    drawGauges(cx, cy, R * 0.9, R, thin, dim);
    drawLeaders(R, dim);

    // Data ring.
    ctx.strokeStyle = lineCss;
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.12 * dim;
    strokeCircle(ctx, cx, cy, R * 0.79);
    ctx.lineWidth = Math.max(1.25, R * 0.012);
    ctx.globalAlpha = 0.75 * dim;
    const jit = clock - jitterAt < 0.4 ? 1 - (clock - jitterAt) / 0.4 : 0;
    if (jit > 0) {
      for (let i = 0; i < HERO_SEG.length; i += 2) {
        const off = 1.5 * jit * Math.sin(clock * 97 + i * 1.2);
        const a0 = rot[1] + HERO_SEG[i];
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.79 + off, a0, a0 + HERO_SEG[i + 1]);
        ctx.stroke();
      }
    } else {
      strokeArcs(ctx, cx, cy, R * 0.79, rot[1], HERO_SEG);
    }
    drawPackets(cx, cy, R * 0.79, R * 0.6, R, dim);

    // Scanner ring + one sweep per network check.
    ctx.strokeStyle = lineCss;
    ctx.lineWidth = Math.max(1, R * 0.01);
    ctx.globalAlpha = 0.32 * dim;
    strokeDashes(ctx, cx, cy, R * 0.7, rot[2], 72, 2.2 * DEG);
    const sc = clock - scanAt < 1.2 ? (clock - scanAt) / 1.2 : -1;
    if (sc >= 0) drawScanner(cx, cy, R * 0.7, Math.max(1.5, R * 0.018), 0.9 * (1 - sc * 0.5) * dim, -Math.PI / 2 + easeOutCubic(sc) * TAU);

    drawThreads(cx, cy, R * 0.585, R * 0.032, dim);

    // Sensor ring: three notches turning.
    ctx.strokeStyle = lineCss;
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.4 * dim;
    strokeCircle(ctx, cx, cy, R * 0.475);
    const notch = Math.max(2, R * 0.03);
    ctx.lineWidth = Math.max(1, R * 0.009);
    ctx.globalAlpha = 0.55 * dim;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = rot[4] + (i * TAU) / 3;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.moveTo(cx + c * (R * 0.475 - notch), cy + s * (R * 0.475 - notch));
      ctx.lineTo(cx + c * (R * 0.475 + notch), cy + s * (R * 0.475 + notch));
    }
    ctx.stroke();

    // The heart: a luminous ring around a dark disc that carries the state word.
    const rc = R * 0.34;
    ctx.globalCompositeOperation = 'lighter';
    stateGlow('soft', cx, cy, R * 0.62 * (1 + 0.08 * amp), cur.glow * (0.42 + 0.4 * amp) * dim);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = pal.bg.css;
    ctx.beginPath();
    ctx.arc(cx, cy, rc, 0, TAU);
    ctx.fill();
    ctx.fillStyle = lineCss;
    ctx.strokeStyle = lineCss;
    ctx.lineWidth = Math.max(1.5, R * 0.012);
    ctx.globalAlpha = (0.62 + 0.38 * amp) * dim;
    strokeCircle(ctx, cx, cy, rc);
    ctx.lineWidth = thin;
    ctx.globalAlpha = 0.22 * dim;
    strokeCircle(ctx, cx, cy, rc * 0.88);

    if (alertCount > 0) drawAlertBead(cx, cy - R * 0.965, R);
  }

  function gaugeColor(g) {
    return pal[CODE_KEY[gLevel[g]]] || pal.accent;
  }

  // Four quadrant gauges: unlit ticks .2, lit .85 in the gauge's own level; unknown stays dark.
  function drawGauges(cx, cy, r, R, thin, dim) {
    const len = r * 0.045;
    const major = r * 0.085;
    const offline = state === 'offline';
    ctx.lineWidth = Math.max(thin, R * 0.007);
    // Unlit (and unknown) ticks, in the line color.
    ctx.strokeStyle = lineCss;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      let any = false;
      for (let g = 0; g < 4; g++) {
        const known = gKnown[g] === 1 && !offline;
        if ((pass === 0) === known) continue; // pass 0: unknown gauges, pass 1: unlit ticks of known
        const lit = known ? gCur[g] * TICKS : 0;
        for (let j = 0; j < TICKS; j++) {
          if (known && j < lit - 0.5) continue;
          const k = g * TICKS + j;
          const l = j === 0 || j === TICKS - 1 ? major : len;
          ctx.moveTo(cx + gaugeCos[k] * r, cy + gaugeSin[k] * r);
          ctx.lineTo(cx + gaugeCos[k] * (r - l), cy + gaugeSin[k] * (r - l));
          any = true;
        }
      }
      if (!any) continue;
      ctx.globalAlpha = (pass === 0 ? 0.1 : 0.2) * dim;
      ctx.stroke();
    }
    if (offline) return;
    // Lit ticks, per gauge in its level color.
    for (let g = 0; g < 4; g++) {
      if (!gKnown[g]) continue;
      const lit = gCur[g] * TICKS;
      if (lit < 0.5) continue;
      ctx.beginPath();
      for (let j = 0; j < TICKS && j < lit - 0.5; j++) {
        const k = g * TICKS + j;
        const l = j === 0 || j === TICKS - 1 ? major : len * 1.25;
        ctx.moveTo(cx + gaugeCos[k] * r, cy + gaugeSin[k] * r);
        ctx.lineTo(cx + gaugeCos[k] * (r - l), cy + gaugeSin[k] * (r - l));
      }
      ctx.strokeStyle = gaugeColor(g).css;
      ctx.globalAlpha = 0.9 * dim;
      ctx.stroke();
    }
    // A sweeping highlight laps the four gauges (~21 s a lap).
    const sc = Math.cos(highlight);
    const ss = Math.sin(highlight);
    ctx.strokeStyle = pal.text.css;
    ctx.globalAlpha = 0.35 * dim;
    ctx.beginPath();
    for (let k = 0; k < TICKS * 4; k++) {
      if (gaugeCos[k] * sc + gaugeSin[k] * ss < 0.95) continue;
      ctx.moveTo(cx + gaugeCos[k] * r, cy + gaugeSin[k] * r);
      ctx.lineTo(cx + gaugeCos[k] * (r - len), cy + gaugeSin[k] * (r - len));
    }
    ctx.stroke();
    ctx.strokeStyle = lineCss;
  }

  // Leader lines from each gauge to its corner readout: a dot on the gauge, a diagonal run, an
  // elbow and a short horizontal run (the HUD leader of the app's building blocks).
  function drawLeaders(R, dim) {
    if (compact) return; // the remote view's readouts sit in a grid beside the core
    const offline = state === 'offline';
    ctx.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const A = anchors[GAUGES[g]];
      const color = offline || !gKnown[g] ? pal.mute : gaugeColor(g);
      ctx.strokeStyle = color.css;
      ctx.globalAlpha = (offline ? 0.25 : 0.55) * dim;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(A.ex, A.ey);
      ctx.lineTo(A.hx, A.ey);
      ctx.stroke();
      ctx.fillStyle = color.css;
      ctx.globalAlpha = (offline ? 0.35 : 0.9) * dim;
      ctx.beginPath();
      ctx.arc(A.x, A.y, Math.max(2, R * 0.008), 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = lineCss;
    ctx.fillStyle = lineCss;
  }

  function drawScanner(cx, cy, r, lw, alpha, angle) {
    const steps = 12;
    const seg = (80 * DEG) / steps;
    ctx.lineWidth = lw;
    ctx.strokeStyle = lineCss;
    for (let i = 0; i < steps; i++) {
      const f = 1 - i / steps;
      ctx.globalAlpha = alpha * f * f;
      ctx.beginPath();
      ctx.arc(cx, cy, r, angle - (i + 1) * seg, angle - i * seg + 0.004);
      ctx.stroke();
    }
  }

  function drawPackets(cx, cy, r, rIn, R, dim) {
    let any = false;
    for (let i = 0; i < MAX_PACKETS; i++) if (pkOn[i] > 0.01) any = true;
    if (!any) return;
    ctx.lineWidth = Math.max(1.6, R * 0.02);
    ctx.lineCap = 'round';
    ctx.strokeStyle = pal.text.css;
    ctx.globalCompositeOperation = 'lighter';
    const dash = 6 * DEG;
    const travel = 0.72;
    const span = 64 * DEG;
    for (let i = 0; i < MAX_PACKETS; i++) {
      const on = pkOn[i];
      if (on <= 0.01) continue;
      const life = pkLife[i];
      if (life < travel) {
        const a = pkAng[i] + rot[1] + span * (life / travel);
        const fade = life < 0.08 ? life / 0.08 : 1;
        ctx.globalAlpha = 0.8 * on * fade * dim;
        ctx.beginPath();
        ctx.arc(cx, cy, r, a, a + dash);
        ctx.stroke();
      } else {
        const p = (life - travel) / (1 - travel);
        const a = pkAng[i] + rot[1] + span + dash * 0.5;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const head = r - (r - rIn) * easeOutCubic(p);
        const tail = Math.min(r, head + R * 0.05);
        ctx.globalAlpha = 0.8 * on * (1 - p) * dim;
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

  // One thick segment per CPU thread: thickness and brightness follow its load.
  function drawThreads(cx, cy, r, base, dim) {
    const n = threadCount;
    const cell = TAU / n;
    const len = cell * 0.78;
    ctx.strokeStyle = lineCss;
    for (let i = 0; i < n; i++) {
      const b = threadsKnown && state !== 'offline' ? thCur[i] : 0;
      const a0 = rot[3] + i * cell - Math.PI / 2;
      ctx.lineWidth = base * (1 + 1.1 * b);
      ctx.globalAlpha = (0.16 + 0.5 * b) * dim;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a0 + len);
      ctx.stroke();
    }
  }

  function drawAlertBead(x, y, R) {
    const since = clock - alertAt;
    const r = Math.max(2.4, R * 0.022);
    const color = state === 'alert' ? pal.err : pal.warn;
    if (since >= 0 && since < 1.2) {
      const p = (since % 0.6) / 0.6;
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, getSprite(color, 'soft'), x, y, r * (3 + 5 * p), (1 - p) * 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalCompositeOperation = 'lighter';
    blit(ctx, getSprite(color, 'soft'), x, y, r * 3.2, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color.css;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = lineCss;
  }

  function changed() {
    if (isStatic()) drawStatic();
  }

  // --- public API -----------------------------------------------------------------------------
  function setHealth(next) {
    if (destroyed) return;
    const s = HEALTH_STATES.includes(next) ? next : 'ok';
    if (s === state) return;
    state = s;
    target = STATE_PARAMS[s];
    const nextColor = pal[target.color] || pal.accent;
    if (nextColor !== colorTo) {
      colorFrom = colorMix < 0.5 ? colorFrom : colorTo;
      colorTo = nextColor;
      colorMix = 0;
    }
    if (s === 'alert') jitterAt = clock;
    changed();
  }

  /** { cpu: { value: 0..1 | null, level }, … }; a missing key leaves that gauge as it is. */
  function setGauges(g) {
    if (destroyed || !g) return;
    let any = false;
    GAUGES.forEach((name, i) => {
      if (!(name in g)) return;
      const v = g[name] || {};
      const n = Number(v.value);
      const known = v.value !== null && v.value !== undefined && Number.isFinite(n) ? 1 : 0;
      const frac = known ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0;
      const lv = LEVEL_CODE[v.level] ?? 0;
      if (known !== gKnown[i] || Math.abs(frac - gTarget[i]) > 1e-4 || lv !== gLevel[i]) any = true;
      gKnown[i] = known;
      gTarget[i] = frac;
      gLevel[i] = lv;
    });
    if (any) changed();
  }

  /** Per-thread loads 0..1 (up to 16 threads; null = unknown). */
  function setThreads(list) {
    if (destroyed) return;
    if (!list || typeof list.length !== 'number' || list.length === 0) {
      if (threadsKnown) {
        threadsKnown = false;
        changed();
      }
      return;
    }
    const n = Math.min(MAX_THREADS, list.length);
    threadCount = n;
    threadsKnown = true;
    for (let i = 0; i < n; i++) {
      const v = Number(list[i]);
      thTarget[i] = Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0;
    }
    changed();
  }

  /** Network traffic 0..1 (the packets on the data ring). */
  function setTraffic(v) {
    if (destroyed) return;
    const n = Number(v);
    const next = Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0;
    if (Math.abs(next - traffic) < 1e-3) return;
    traffic = next;
    changed();
  }

  function setAlert(count) {
    if (destroyed) return;
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n === alertCount) return;
    if (n > alertCount && !isStatic()) alertAt = clock;
    alertCount = n;
    changed();
  }

  function setNight(on) {
    if (destroyed) return;
    night = !!on;
    fps = night ? 15 : 30;
    changed();
  }

  function cue(name) {
    if (destroyed || isStatic()) return;
    if (name === 'scan') scanAt = clock;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    awake = false;
    if (ro) ro.disconnect();
    else window.removeEventListener('resize', measure);
    document.removeEventListener('visibilitychange', onVisibility);
    if (reducedMq && reducedMq.removeEventListener) reducedMq.removeEventListener('change', onReduced);
  }

  function debugStats() {
    return { state, awake, fps, frames, avgFrameMs: frames ? spentMs / frames : 0, staticDraws, R: gR, width, height, night };
  }

  measure();
  setHealth('offline');

  return {
    setHealth,
    setGauges,
    setThreads,
    setTraffic,
    setAlert,
    setNight,
    cue,
    layout: () => ({ w: width, h: height, cx: gcx, cy: gcy, R: gR, anchors }),
    destroy,
    debugStats,
    refreshPalette() {
      pal = readPalette();
      colorTo = pal[target.color] || pal.accent;
      colorFrom = colorTo;
      colorMix = 1;
      changed();
    },
  };
}
