// Themes (SPEC 14.3): accent palettes for the heads-up display.
//
//   applyTheme(getSettings().theme)          // at boot, and whenever settings.theme changes
//   const picker = createThemePicker({ value: settings.theme, onChange: (id) => saveSettings({ theme: id }) });
//   const c = readThemeColors();             // { accent, accent2, accentGlow, ok, warn, err, violet, bg, ... } for canvas
//   onThemeChange(({ colors }) => redraw(colors));   // window 'jarvis:themechange' (hud/core.js listens itself)
//
// The palettes live in src/styles/themes.css as overrides of accent-family tokens under
// :root[data-theme="…"]. The key colors below mirror that file (for the picker swatches,
// <meta name="theme-color"> and fallbacks before CSS loads); test/unit/themes.test.mjs
// keeps the two in sync and checks WCAG contrast. applyTheme never persists anything:
// the caller saves settings.theme.

import { h } from './dom.js';
import { icon } from './icons.js';

export const DEFAULT_THEME = 'arc';
export const THEME_EVENT = 'jarvis:themechange';

const theme = (id, name, blurb, colors) => Object.freeze({ id, name, blurb, swatch: colors.accent, ...colors });

/**
 * Available themes, in picker order. Each entry:
 * { id, name, blurb, swatch, accent, accent2, accent3, ink, glow, soft, line, bg }
 * (`swatch` is the accent; `bg` is also the <meta name="theme-color"> value).
 */
export const THEMES = Object.freeze([
  theme('arc', 'Arc Cyan', 'Reactor cyan, the classic heads-up glow', {
    accent: '#3ee0ff', accent2: '#8af3ff', accent3: '#1aa8d6', ink: '#00141b',
    glow: 'rgba(62, 224, 255, 0.38)', soft: 'rgba(62, 224, 255, 0.12)', line: 'rgba(78, 196, 255, 0.26)', bg: '#04070c',
  }),
  theme('ember', 'Ember', 'Forge-warm orange on a plum-black night', {
    accent: '#ff9757', accent2: '#ffcaa6', accent3: '#ec6a34', ink: '#1c0900',
    glow: 'rgba(255, 151, 87, 0.36)', soft: 'rgba(255, 151, 87, 0.12)', line: 'rgba(255, 152, 92, 0.26)', bg: '#08060a',
  }),
  theme('verdant', 'Verdant', 'Fresh leaf green, calm and alive', {
    accent: '#9ee866', accent2: '#d0f7b2', accent3: '#62bd38', ink: '#081400',
    glow: 'rgba(158, 232, 102, 0.34)', soft: 'rgba(158, 232, 102, 0.12)', line: 'rgba(158, 232, 102, 0.24)', bg: '#04080a',
  }),
  theme('aurora', 'Aurora', 'Orchid and magenta, the high edge of the northern lights', {
    accent: '#f48ce6', accent2: '#ffc9f3', accent3: '#c965e3', ink: '#1f0019',
    glow: 'rgba(244, 140, 230, 0.36)', soft: 'rgba(244, 140, 230, 0.12)', line: 'rgba(240, 146, 232, 0.27)', bg: '#07050e',
  }),
  theme('solar', 'Solar', 'Bright lemon gold, like noon on a visor', {
    accent: '#f7e35c', accent2: '#fdf3b0', accent3: '#d8a930', ink: '#171000',
    glow: 'rgba(250, 218, 92, 0.3)', soft: 'rgba(255, 208, 92, 0.1)', line: 'rgba(255, 214, 110, 0.24)', bg: '#07070a',
  }),
  theme('mono', 'Mono', 'Brushed titanium, quiet and precise', {
    accent: '#e6ebf0', accent2: '#ffffff', accent3: '#a3adb8', ink: '#0a0d10',
    glow: 'rgba(230, 235, 240, 0.26)', soft: 'rgba(230, 235, 240, 0.1)', line: 'rgba(208, 218, 230, 0.24)', bg: '#050608',
  }),
]);

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));

/** A valid theme id: `id` if known, else the default ('arc'). */
export function normalizeTheme(id) {
  return typeof id === 'string' && BY_ID.has(id) ? id : DEFAULT_THEME;
}

/** The theme entry for `id` (the default theme for unknown ids). */
export function getTheme(id) {
  return BY_ID.get(normalizeTheme(id));
}

// ---- applying -----------------------------------------------------------------------

let applied = null; // id applied by the last applyTheme() call
let fadeTimer = 0;
let colorCache = null; // { key, colors }

const doc = () => (typeof document !== 'undefined' ? document : null);

/** The theme currently on <html data-theme> (normalized). */
export function currentTheme() {
  const d = doc();
  return normalizeTheme(d && d.documentElement ? d.documentElement.getAttribute('data-theme') : applied);
}

/**
 * Apply a theme: sets <html data-theme>, updates every <meta name="theme-color"> (creating
 * one if missing), cross-fades colors (unless reduced motion), and dispatches
 * window 'jarvis:themechange' with detail { id, previous, colors } when the theme changed.
 * Persists nothing. Never throws. Returns the applied (normalized) id.
 */
export function applyTheme(id) {
  const next = normalizeTheme(id);
  const d = doc();
  if (!d || !d.documentElement) {
    applied = next;
    return next;
  }
  try {
    const root = d.documentElement;
    const previous = root.getAttribute('data-theme');
    const changed = previous !== next || applied !== next;
    if (previous !== next) {
      if (applied !== null && previous && BY_ID.has(previous)) fadeColors(root); // never at boot
      root.setAttribute('data-theme', next);
    }
    colorCache = null;
    setThemeColorMeta(d, getTheme(next).bg);
    applied = next;
    if (changed && typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      const detail = { id: next, previous: previous && BY_ID.has(previous) ? previous : null, colors: readThemeColors() };
      window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail }));
    }
  } catch (err) {
    warn('applyTheme failed', err);
  }
  return next;
}

/** Subscribe to theme changes: fn({ id, previous, colors }). Returns an unsubscribe function. */
export function onThemeChange(fn) {
  if (typeof window === 'undefined' || typeof fn !== 'function') return () => {};
  const handler = (e) => {
    try {
      fn(e.detail || { id: currentTheme(), previous: null, colors: readThemeColors() });
    } catch (err) {
      warn('theme listener failed', err);
    }
  };
  window.addEventListener(THEME_EVENT, handler);
  return () => window.removeEventListener(THEME_EVENT, handler);
}

function setThemeColorMeta(d, color) {
  if (!d.head) return;
  let metas = Array.from(d.head.querySelectorAll('meta[name="theme-color"]'));
  if (!metas.length) {
    const meta = d.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    d.head.appendChild(meta);
    metas = [meta];
  }
  for (const meta of metas) if (meta.getAttribute('content') !== color) meta.setAttribute('content', color);
}

function fadeColors(root) {
  clearTimeout(fadeTimer);
  if (prefersReducedMotion()) {
    root.removeAttribute('data-theme-fading'); // a fade still running from an earlier switch
    return;
  }
  root.setAttribute('data-theme-fading', '');
  fadeTimer = setTimeout(() => root.removeAttribute('data-theme-fading'), 560);
}

function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ---- colors for canvas code ------------------------------------------------------------

const COLOR_VARS = {
  accent: '--accent',
  accent2: '--accent-2',
  accent3: '--accent-3',
  accentGlow: '--accent-glow',
  accentSoft: '--accent-soft',
  ink: '--accent-ink',
  ok: '--ok',
  warn: '--warn',
  err: '--err',
  violet: '--violet',
  bg: '--bg',
  bg2: '--bg-2',
  bg3: '--bg-3',
  text: '--text',
  text2: '--text-2',
  text3: '--text-3',
  line: '--line',
  line2: '--line-2',
  line3: '--line-3',
};

// Token values shared by every theme (tokens.css), used when CSS is not available yet.
const BASE_FALLBACK = {
  ok: '#3dffb0',
  warn: '#ffc457',
  err: '#ff5c72',
  violet: '#a796ff',
  bg2: '#070d15',
  bg3: '#0a1420',
  text: '#e1f6ff',
  text2: '#abc8d9',
  text3: '#8ca8bc',
  line: 'rgba(78, 196, 255, 0.14)',
  line3: 'rgba(98, 220, 255, 0.46)',
};

function fallbackColors(t) {
  return { ...BASE_FALLBACK, accent: t.accent, accent2: t.accent2, accent3: t.accent3, accentGlow: t.glow, accentSoft: t.soft, ink: t.ink, bg: t.bg, line2: t.line };
}

/**
 * Resolved theme colors from the computed CSS custom properties on <html>, for canvas code:
 * { id, accent, accent2, accent3, accentGlow, accentSoft, ink, ok, warn, err, violet,
 *   bg, bg2, bg3, text, text2, text3, line, line2, line3, rgb: { <same keys>: [r, g, b, a] } }.
 * Opaque colors are '#rrggbb', translucent ones 'rgba(r, g, b, a)'. Cached per theme; falls
 * back to the theme's built-in values when the stylesheet is not loaded. Never throws.
 */
export function readThemeColors() {
  const id = currentTheme();
  const d = doc();
  let cs = null;
  try {
    if (d && d.documentElement && typeof getComputedStyle === 'function') cs = getComputedStyle(d.documentElement);
  } catch {
    cs = null;
  }
  const probe = cs ? readVar(cs, '--accent') : '';
  const key = `${id}|${probe}`;
  if (colorCache && colorCache.key === key) return cloneColors(colorCache.colors);

  const fallback = fallbackColors(getTheme(id));
  const out = { id, rgb: {} };
  for (const name of Object.keys(COLOR_VARS)) {
    const raw = cs ? readVar(cs, COLOR_VARS[name]) : '';
    const rgba = (raw && (parseColor(raw) || parseWithCanvas(raw))) || parseColor(fallback[name]);
    out.rgb[name] = rgba;
    out[name] = formatColor(rgba);
  }
  // Only cache once the stylesheet is in effect (otherwise a later read must see the CSS).
  if (probe) colorCache = { key, colors: out };
  return cloneColors(out);
}

function cloneColors(c) {
  const rgb = {};
  for (const k of Object.keys(c.rgb)) rgb[k] = c.rgb[k].slice();
  return { ...c, rgb };
}

function readVar(cs, name) {
  try {
    return String(cs.getPropertyValue(name) || '').trim();
  } catch {
    return '';
  }
}

/**
 * `color` with its alpha replaced by `alpha` (multiplied when `multiply` is true), as an
 * rgba() string. Accepts '#rgb', '#rrggbb', '#rrggbbaa', rgb()/rgba() or an [r, g, b, a] array.
 */
export function withAlpha(color, alpha, multiply = false) {
  const c = Array.isArray(color) ? color : parseColor(color) || parseWithCanvas(color) || [0, 0, 0, 1];
  const a = clamp01(multiply ? (c[3] ?? 1) * alpha : alpha);
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${round3(a)})`;
}

/** Parse '#rgb', '#rgba', '#rrggbb', '#rrggbbaa', 'rgb(…)' or 'rgba(…)' to [r, g, b, a]; null otherwise. */
export function parseColor(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,4})$/.exec(s);
  if (m) {
    const p = Array.from(m[1], (ch) => parseInt(ch + ch, 16));
    return [p[0], p[1], p[2], p.length === 4 ? round3(p[3] / 255) : 1];
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) {
    const n = m[1];
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), m[2] ? round3(parseInt(m[2], 16) / 255) : 1];
  }
  m = /^rgba?\(\s*([^)]*)\)$/.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const ch = parts.slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
    let a = parts.length === 4 ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1;
    if (ch.some((v) => !Number.isFinite(v)) || !Number.isFinite(a)) return null;
    a = clamp01(a);
    return [...ch.map((v) => Math.round(Math.min(255, Math.max(0, v)))), round3(a)];
  }
  return null;
}

let probeCtx = null;
// Any other CSS color syntax (named colors, hsl(), color-mix() …): let canvas normalize it.
function parseWithCanvas(value) {
  const d = doc();
  if (!d || typeof value !== 'string' || !value) return null;
  try {
    if (!probeCtx) probeCtx = d.createElement('canvas').getContext('2d');
    if (!probeCtx) return null;
    probeCtx.fillStyle = '#010203';
    probeCtx.fillStyle = value;
    const normalized = String(probeCtx.fillStyle);
    if (normalized === '#010203' && value.trim().toLowerCase() !== '#010203') return null; // rejected
    return parseColor(normalized);
  } catch {
    return null;
  }
}

function formatColor(c) {
  if (c[3] >= 1) return '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${round3(c[3])})`;
}

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round3 = (n) => Math.round(n * 1000) / 1000;

// ---- picker -------------------------------------------------------------------------

/**
 * Theme picker: swatch circles with names, as an ARIA radio group (roving tabindex;
 * arrow keys / Home / End move and select; Space / Enter / click select).
 * onChange(id) fires only for selections the owner makes, not for setValue().
 * Returns { el, setValue(id) }. data-testid: 'theme-picker'; each option 'theme-swatch' with data-id.
 */
export function createThemePicker({ value, onChange, label = 'Theme' } = {}) {
  let selected = normalizeTheme(value);

  const options = THEMES.map((t) =>
    h(
      'button',
      {
        type: 'button',
        class: 'amb-theme-option',
        title: t.blurb,
        attrs: { role: 'radio', 'aria-checked': 'false', 'data-testid': 'theme-swatch', 'data-id': t.id },
        style: {
          '--sw-accent': t.accent,
          '--sw-accent-2': t.accent2,
          '--sw-accent-3': t.accent3,
          '--sw-ink': t.ink,
          '--sw-glow': t.glow,
          '--sw-soft': t.soft,
          '--sw-line': t.line,
          '--sw-bg': t.bg,
        },
        on: { click: () => choose(t.id, false) },
      },
      h('span', { class: 'amb-theme-swatch', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'amb-theme-check' }, icon('check', { size: 12, strokeWidth: 2.6 }))),
      h('span', { class: 'amb-theme-name', text: t.name }),
    ),
  );

  // The outer element is a size container so the grid can pick 3 or 6 columns (themes.css).
  const el = h(
    'div',
    { class: 'amb-theme-picker', attrs: { role: 'radiogroup', 'aria-label': label, 'data-testid': 'theme-picker' }, on: { keydown: onKey } },
    h('div', { class: 'amb-theme-grid' }, options),
  );

  function render() {
    for (const opt of options) {
      const on = opt.getAttribute('data-id') === selected;
      opt.setAttribute('aria-checked', on ? 'true' : 'false');
      opt.tabIndex = on ? 0 : -1;
    }
  }

  function choose(id, moveFocus) {
    const next = normalizeTheme(id);
    const changed = next !== selected;
    selected = next;
    render();
    if (moveFocus) {
      const opt = options.find((o) => o.getAttribute('data-id') === next);
      if (opt && typeof opt.focus === 'function') opt.focus();
    }
    if (changed && typeof onChange === 'function') {
      try {
        onChange(next);
      } catch (err) {
        warn('theme picker onChange failed', err);
      }
    }
  }

  function onKey(e) {
    const i = THEMES.findIndex((t) => t.id === selected);
    let j = -1;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        j = (i + 1) % THEMES.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        j = (i - 1 + THEMES.length) % THEMES.length;
        break;
      case 'Home':
        j = 0;
        break;
      case 'End':
        j = THEMES.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    choose(THEMES[j].id, true);
  }

  render();
  return {
    el,
    setValue(id) {
      selected = normalizeTheme(id);
      render();
    },
  };
}

function warn(message, err) {
  try {
    console.warn(`[jarvis] ${message}:`, err);
  } catch {
    /* ignore */
  }
}
