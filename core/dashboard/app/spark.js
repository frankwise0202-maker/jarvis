// Sparklines for the 24/7 screen: a time-indexed ring buffer (one slot per second, gaps stay
// gaps) and a canvas renderer that is created once and redrawn in place. Single series each (the
// panel's caption names it), a 2 px line, a faint area wash, an end dot with a surface ring and
// hairline guides. Nothing here grows: the ring is a preallocated Float32Array and the canvas is
// reused for the life of the page.

/** A ring of `capacity` one-second slots; missing seconds are NaN (drawn as gaps). */
export class TimeRing {
  constructor(capacity, stepMs = 1000) {
    this.capacity = capacity;
    this.stepMs = stepMs;
    this.buf = new Float32Array(capacity).fill(NaN);
    this.head = 0; // index of the next write
    this.size = 0;
    this.lastSlot = null; // the time slot (t / stepMs) of the newest value
  }

  clear() {
    this.buf.fill(NaN);
    this.head = 0;
    this.size = 0;
    this.lastSlot = null;
  }

  /** Append the value for time `t` (ms). Skipped seconds become gaps; older or equal slots overwrite the newest. */
  push(t, value) {
    const v = value === null || value === undefined || !Number.isFinite(Number(value)) ? NaN : Number(value);
    const slot = Math.floor(t / this.stepMs);
    if (this.lastSlot !== null) {
      const gap = slot - this.lastSlot;
      if (gap <= 0) {
        // Same second again (or a clock step backwards): replace the newest value.
        if (this.size > 0) this.buf[(this.head - 1 + this.capacity) % this.capacity] = v;
        if (gap < 0) this.lastSlot = slot;
        return;
      }
      const fill = Math.min(gap - 1, this.capacity);
      for (let i = 0; i < fill; i++) this.write(NaN);
    }
    this.write(v);
    this.lastSlot = slot;
  }

  write(v) {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  /** The i-th value from the oldest kept (0 … size-1). */
  at(i) {
    const start = (this.head - this.size + this.capacity) % this.capacity;
    return this.buf[(start + i) % this.capacity];
  }

  latest() {
    return this.size ? this.buf[(this.head - 1 + this.capacity) % this.capacity] : NaN;
  }

  /** Largest finite value among the newest `n` (all by default); NaN when none. */
  max(n = this.size) {
    let m = NaN;
    const count = Math.min(n, this.size);
    for (let i = this.size - count; i < this.size; i++) {
      const v = this.at(i);
      if (v === v && !(v <= m)) m = v; // finite and larger (NaN-safe)
    }
    return m;
  }

  /** Bring the ring up to time `t` with gaps (no value arrived, e.g. while offline). */
  advanceTo(t) {
    const slot = Math.floor(t / this.stepMs);
    if (this.lastSlot === null || slot <= this.lastSlot) return;
    const fill = Math.min(slot - this.lastSlot, this.capacity);
    for (let i = 0; i < fill; i++) this.write(NaN);
    this.lastSlot = slot;
  }
}

const MAX_DPR = 2;

/**
 * A sparkline on a canvas. `opts.scale` is 'pct' (0–100 fixed) or { floor } (auto, at least floor).
 * `opts.color` is a CSS custom property name for the line (default --accent).
 */
export function createSpark(canvas, ring, opts = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { draw() {}, destroy() {} };
  let width = 0;
  let height = 0;
  let dpr = 1;
  let colors = null;
  let dirty = true;
  let level = 'ok';

  function readColors() {
    const cs = getComputedStyle(canvas);
    const get = (name, fb) => cs.getPropertyValue(name).trim() || fb;
    colors = {
      line: get(opts.color || '--accent', '#3ee0ff'),
      warn: get('--warn', '#ffc457'),
      alert: get('--err', '#ff5c72'),
      wash: get('--spark-wash', 'rgba(62, 224, 255, 0.10)'),
      grid: get('--spark-grid', 'rgba(78, 196, 255, 0.14)'),
      surface: get('--spark-surface', '#070d15'),
    };
  }

  function measure() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
    width = rect.width;
    height = rect.height;
    dpr = ratio;
    const bw = Math.max(0, Math.round(width * ratio));
    const bh = Math.max(0, Math.round(height * ratio));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    dirty = true;
    draw();
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
  if (ro) ro.observe(canvas);

  function yMax() {
    if (opts.scale === 'pct') return 100;
    const floor = (opts.scale && opts.scale.floor) || 1;
    const m = ring.max();
    return Math.max(floor, m === m ? m * 1.15 : floor);
  }

  function draw() {
    if (!colors) readColors();
    if (width <= 2 || height <= 2) return;
    dirty = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const padTop = 6;
    const padBottom = 2;
    const padRight = 7; // room for the end dot
    const h = height - padTop - padBottom;
    const w = width - padRight;
    const base = padTop + h;
    // Guides: the baseline and the top of the scale, hairline and solid.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(base) + 0.5);
    ctx.lineTo(w, Math.round(base) + 0.5);
    ctx.moveTo(0, padTop + 0.5);
    ctx.lineTo(w, padTop + 0.5);
    ctx.stroke();

    const n = ring.capacity;
    const max = yMax();
    const dx = w / (n - 1);
    const offset = n - ring.size; // the newest value sits at the right edge
    const lineColor = level === 'alert' ? colors.alert : level === 'warn' ? colors.warn : colors.line;

    // Area wash, then the line, segment by segment (gaps break both).
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      let open = false;
      let startX = 0;
      let lastX = 0;
      for (let i = 0; i < ring.size; i++) {
        const v = ring.at(i);
        const x = (offset + i) * dx;
        if (v !== v) {
          if (open && pass === 0) {
            ctx.lineTo(lastX, base);
            ctx.lineTo(startX, base);
            ctx.closePath();
          }
          open = false;
          continue;
        }
        const y = base - (Math.min(v, max) / max) * h;
        if (!open) {
          if (pass === 0) {
            ctx.moveTo(x, base);
            ctx.lineTo(x, y);
          } else ctx.moveTo(x, y);
          open = true;
          startX = x;
        } else ctx.lineTo(x, y);
        lastX = x;
      }
      if (open && pass === 0) {
        ctx.lineTo(lastX, base);
        ctx.lineTo(startX, base);
        ctx.closePath();
      }
      if (pass === 0) {
        ctx.fillStyle = colors.wash;
        ctx.fill();
      } else {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
    // End dot (r 4) with a 2 px surface ring, on the newest value when it is known.
    const last = ring.latest();
    if (last === last && ring.size) {
      const x = (n - 1) * dx;
      const y = base - (Math.min(last, max) / max) * h;
      ctx.fillStyle = colors.surface;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    draw,
    markDirty() {
      dirty = true;
    },
    get dirty() {
      return dirty;
    },
    setLevel(lv) {
      if (lv === level) return;
      level = lv;
      dirty = true;
    },
    refreshColors() {
      colors = null;
      dirty = true;
    },
    destroy() {
      if (ro) ro.disconnect();
    },
  };
}
