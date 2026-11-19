// Themes (SPEC 14.3): palettes stay in sync between src/styles/themes.css and
// src/ui/themes.js, override only accent-family tokens (+ a subtle background tint), and
// keep WCAG AA contrast for text on every surface. Runs with `node --test test/unit/`.
//
// The DOM-facing parts (applyTheme, readThemeColors) run against a tiny fake document whose
// computed style is resolved from the real CSS files, so no browser is needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const TOKENS_CSS = read('../../src/styles/tokens.css');
const THEMES_CSS = read('../../src/styles/themes.css');

const { THEMES, DEFAULT_THEME, normalizeTheme, getTheme, applyTheme, readThemeColors, parseColor, withAlpha, currentTheme, onThemeChange } = await import(
  '../../src/ui/themes.js'
);

// ---- CSS parsing ------------------------------------------------------------------------

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function declarations(body) {
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function baseTokens() {
  const css = stripComments(TOKENS_CSS);
  const m = /:root\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, 'tokens.css has a :root block');
  return declarations(m[1]);
}

function themeBlocks() {
  const css = stripComments(THEMES_CSS);
  const blocks = {};
  for (const m of css.matchAll(/:root\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)) {
    assert.ok(!(m[1] in blocks), `theme "${m[1]}" is defined once`);
    blocks[m[1]] = declarations(m[2]);
  }
  return blocks;
}

const BASE = baseTokens();
const BLOCKS = themeBlocks();
const tokensFor = (id) => ({ ...BASE, ...(BLOCKS[id] || {}) });

// ---- color math (WCAG 2.x relative luminance / contrast, CIEDE2000) -------------------------

const color = (value) => {
  const c = parseColor(value);
  assert.ok(c, `parseable color: ${value}`);
  return c;
};
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const channel = (v) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
const contrast = (a, b) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function lab(c) {
  const [r, g, b] = [channel(c[0]), channel(c[1]), channel(c[2])];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE2000(c1, c2) {
  const [L1, a1, b1] = lab(c1);
  const [L2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = ((Math.atan2(b1, a1p) / rad) + 360) % 360;
  const h2p = ((Math.atan2(b2, a2p) / rad) + 360) % 360;
  let dhp = h2p - h1p;
  if (C1p * C2p === 0) dhp = 0;
  else if (dhp > 180) dhp -= 360;
  else if (dhp < -180) dhp += 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360;
    hbp /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** Opaque backgrounds text can sit on: the bg shades and each surface composited over --bg. */
function surfacesFor(id) {
  const t = tokensFor(id);
  const bg = color(t['--bg']);
  return {
    bg,
    'bg-2': color(t['--bg-2']),
    'bg-3': color(t['--bg-3']),
    surface: over(color(t['--surface']), bg),
    'surface-2': over(color(t['--surface-2']), bg),
    'surface-3': over(color(t['--surface-3']), bg),
    'surface-solid': color(t['--surface-solid']),
  };
}

// ---- registry ------------------------------------------------------------------------------

test('THEMES lists at least the six required themes, arc first and default', () => {
  const ids = THEMES.map((t) => t.id);
  for (const id of ['arc', 'ember', 'verdant', 'aurora', 'solar', 'mono']) assert.ok(ids.includes(id), `has ${id}`);
  assert.equal(ids[0], 'arc');
  assert.equal(DEFAULT_THEME, 'arc');
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(getTheme('arc').name, 'Arc Cyan');
  for (const t of THEMES) {
    assert.ok(typeof t.name === 'string' && t.name.length > 0 && t.name.length <= 12, `${t.id} has a short name`);
    assert.ok(typeof t.blurb === 'string' && t.blurb.length > 0, `${t.id} has a blurb`);
    assert.equal(t.swatch, t.accent, `${t.id} swatch is its accent`);
    assert.ok(Object.isFrozen(t), `${t.id} is frozen`);
  }
});

test('normalizeTheme / getTheme fall back to arc for unknown values', () => {
  assert.equal(normalizeTheme('ember'), 'ember');
  for (const bad of [undefined, null, '', 'neon', 42, {}, 'ARC', 'constructor', '__proto__']) assert.equal(normalizeTheme(bad), 'arc');
  assert.equal(getTheme('nope').id, 'arc');
});

test('every theme has exactly one CSS block and every CSS block has a theme', () => {
  assert.deepEqual(Object.keys(BLOCKS).sort(), THEMES.map((t) => t.id).sort());
  assert.deepEqual(BLOCKS.arc, {}, 'arc uses the default tokens unchanged');
});

const ALLOWED = new Set(['--accent', '--accent-2', '--accent-3', '--accent-ink', '--accent-soft', '--accent-glow', '--line', '--line-2', '--line-3', '--bg', '--bg-2', '--bg-3']);

test('themes override only accent-family tokens and the background shades', () => {
  for (const [id, decls] of Object.entries(BLOCKS)) {
    for (const name of Object.keys(decls)) {
      assert.ok(ALLOWED.has(name), `${id} must not override ${name}`);
      assert.ok(name in BASE, `${id} overrides an existing token (${name})`);
      color(decls[name]);
    }
    if (id !== 'arc') for (const name of ['--accent', '--accent-2', '--accent-3', '--accent-ink', '--accent-soft', '--accent-glow', '--bg']) assert.ok(name in decls, `${id} sets ${name}`);
  }
});

test('themes.js mirrors themes.css (swatches, theme-color and canvas fallbacks)', () => {
  const pairs = { accent: '--accent', accent2: '--accent-2', accent3: '--accent-3', ink: '--accent-ink', glow: '--accent-glow', soft: '--accent-soft', line: '--line-2', bg: '--bg' };
  for (const t of THEMES) {
    const tokens = tokensFor(t.id);
    for (const [key, token] of Object.entries(pairs)) assert.deepEqual(color(t[key]), color(tokens[token]), `${t.id}.${key} === ${token}`);
  }
});

// ---- contrast ------------------------------------------------------------------------------

const TEXT_TOKENS = ['--text', '--text-2', '--text-3', '--accent', '--accent-2', '--accent-3', '--ok', '--warn', '--err', '--violet'];

test('WCAG AA (4.5:1) for text tokens on every surface, in every theme', () => {
  const failures = [];
  for (const { id } of THEMES) {
    const t = tokensFor(id);
    for (const [surfaceName, surface] of Object.entries(surfacesFor(id))) {
      for (const token of TEXT_TOKENS) {
        const ratio = contrast(over(color(t[token]), surface), surface);
        if (ratio < 4.5) failures.push(`${id}: ${token} on ${surfaceName} = ${ratio.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('WCAG AA for ink on accent fills and accent text on accent-soft chips', () => {
  for (const { id } of THEMES) {
    const t = tokensFor(id);
    const ink = color(t['--accent-ink']);
    for (const fill of ['--accent', '--accent-2', '--accent-3']) {
      const ratio = contrast(ink, color(t[fill]));
      assert.ok(ratio >= 4.5, `${id}: --accent-ink on ${fill} = ${ratio.toFixed(2)}`);
    }
    for (const [surfaceName, surface] of Object.entries(surfacesFor(id))) {
      const chip = over(color(t['--accent-soft']), surface);
      for (const fg of ['--accent', '--accent-2', '--text']) {
        const ratio = contrast(color(t[fg]), chip);
        assert.ok(ratio >= 4.5, `${id}: ${fg} on accent-soft over ${surfaceName} = ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('non-text contrast (3:1): focus ring accent and strong hairlines against the background', () => {
  for (const { id } of THEMES) {
    const t = tokensFor(id);
    const bg = color(t['--bg']);
    assert.ok(contrast(color(t['--accent']), bg) >= 3, `${id}: --accent (focus ring) vs --bg`);
    const line3 = contrast(over(color(t['--line-3']), bg), bg);
    assert.ok(line3 >= 3, `${id}: --line-3 vs --bg = ${line3.toFixed(2)}`);
  }
});

test('the accent stays distinguishable from every status color (CIEDE2000 >= 10)', () => {
  for (const { id } of THEMES) {
    const t = tokensFor(id);
    for (const status of ['--ok', '--warn', '--err', '--violet']) {
      const dE = deltaE2000(color(t['--accent']), color(t[status]));
      assert.ok(dE >= 10, `${id}: accent vs ${status} dE2000 = ${dE.toFixed(1)}`);
    }
  }
});

test('background tints are subtle (CIEDE2000 <= 5, or 3.5 for --bg, and contrast <= 1.1 vs the default)', () => {
  for (const { id } of THEMES) {
    const t = tokensFor(id);
    for (const token of ['--bg', '--bg-2', '--bg-3']) {
      const a = color(t[token]);
      const b = color(BASE[token]);
      const limit = token === '--bg' ? 3.5 : 5;
      assert.ok(deltaE2000(a, b) <= limit, `${id}: ${token} tint dE2000 = ${deltaE2000(a, b).toFixed(1)}`);
      assert.ok(contrast(a, b) <= 1.1, `${id}: ${token} luminance shift`);
    }
  }
});

// ---- color helpers -------------------------------------------------------------------------

test('parseColor handles hex, rgb() and rgba() and rejects junk', () => {
  assert.deepEqual(parseColor('#3ee0ff'), [62, 224, 255, 1]);
  assert.deepEqual(parseColor('#FFF'), [255, 255, 255, 1]);
  assert.deepEqual(parseColor('#00000080'), [0, 0, 0, 0.502]);
  assert.deepEqual(parseColor('rgba(62, 224, 255, 0.38)'), [62, 224, 255, 0.38]);
  assert.deepEqual(parseColor(' rgb(1 2 3 / 50%) '), [1, 2, 3, 0.5]);
  assert.deepEqual(parseColor('rgb(300, -4, 12)'), [255, 0, 12, 1]);
  for (const bad of ['', 'cyan', '#12', 'rgb(1,2)', 'rgb(a,b,c)', null, 7]) assert.equal(parseColor(bad), null, String(bad));
});

test('withAlpha builds rgba() strings for canvas code', () => {
  assert.equal(withAlpha('#3ee0ff', 0.5), 'rgba(62, 224, 255, 0.5)');
  assert.equal(withAlpha('rgba(62, 224, 255, 0.4)', 0.5, true), 'rgba(62, 224, 255, 0.2)');
  assert.equal(withAlpha([1, 2, 3, 1], 2), 'rgba(1, 2, 3, 1)');
});

// ---- DOM-facing behavior (fake document) -------------------------------------------------------

test('without a DOM, applyTheme and readThemeColors degrade gracefully', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(applyTheme('ember'), 'ember');
  assert.equal(applyTheme('bogus'), 'arc');
  const c = readThemeColors();
  for (const key of ['accent', 'accent2', 'accentGlow', 'ok', 'warn', 'err', 'violet', 'bg']) assert.ok(parseColor(c[key]), `fallback ${key}`);
  assert.equal(c.accent, '#3ee0ff');
  assert.deepEqual(c.rgb.accent, [62, 224, 255, 1]);
});

function installFakeDom() {
  const attrs = new Map();
  const metas = [];
  const makeMeta = () => {
    const a = new Map();
    return { getAttribute: (n) => (a.has(n) ? a.get(n) : null), setAttribute: (n, v) => a.set(n, String(v)) };
  };
  const root = {
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => attrs.set(n, String(v)),
    removeAttribute: (n) => attrs.delete(n),
    hasAttribute: (n) => attrs.has(n),
  };
  const head = {
    querySelectorAll: (sel) => (sel === 'meta[name="theme-color"]' ? metas.filter((m) => m.getAttribute('name') === 'theme-color') : []),
    appendChild: (el) => metas.push(el),
  };
  globalThis.document = { documentElement: root, head, createElement: (tag) => (tag === 'meta' ? makeMeta() : {}) };
  globalThis.window = new EventTarget();
  globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => ` ${tokensFor(root.getAttribute('data-theme') || 'arc')[name] || ''}` });
  return { root, metas };
}

test('applyTheme sets data-theme, theme-color and dispatches jarvis:themechange once per change', () => {
  const { root, metas } = installFakeDom();
  try {
    const events = [];
    const off = onThemeChange((detail) => events.push(detail));
    assert.equal(applyTheme('aurora'), 'aurora');
    assert.equal(root.getAttribute('data-theme'), 'aurora');
    assert.equal(currentTheme(), 'aurora');
    assert.equal(metas.length, 1, 'creates the theme-color meta when missing');
    assert.equal(metas[0].getAttribute('content'), getTheme('aurora').bg);
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'aurora');
    assert.equal(events[0].colors.accent, '#f48ce6');

    applyTheme('aurora');
    assert.equal(events.length, 1, 'no event when nothing changed');

    assert.equal(applyTheme('nonsense'), 'arc');
    assert.equal(root.getAttribute('data-theme'), 'arc');
    assert.equal(metas[0].getAttribute('content'), '#04070c');
    assert.equal(events.length, 2);
    assert.equal(events[1].previous, 'aurora');
    off();
    applyTheme('mono');
    assert.equal(events.length, 2, 'unsubscribed');
  } finally {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.getComputedStyle;
  }
});

test('readThemeColors resolves the computed CSS variables of the active theme', () => {
  const { root } = installFakeDom();
  try {
    for (const t of THEMES) {
      applyTheme(t.id);
      const c = readThemeColors();
      const tokens = tokensFor(t.id);
      assert.equal(c.id, t.id);
      assert.deepEqual(c.rgb.accent, color(tokens['--accent']));
      assert.deepEqual(c.rgb.accentGlow, color(tokens['--accent-glow']));
      assert.deepEqual(c.rgb.bg, color(tokens['--bg']));
      assert.deepEqual(c.rgb.ok, color(BASE['--ok']));
      assert.equal(c.violet, '#a796ff');
      c.rgb.accent[0] = -1; // callers get copies, never the cache
      assert.notEqual(readThemeColors().rgb.accent[0], -1);
    }
    root.setAttribute('data-theme', 'ember'); // changed behind applyTheme's back: the cache follows the attribute
    assert.equal(readThemeColors().accent, '#ff9757');
  } finally {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.getComputedStyle;
  }
});
