// Blueprint viewer: the rendered sheet in a zoom/pan stage, a parts panel (tap a callout to find
// its row, tap a row to fly to its callout), and SVG/PNG export. Lazily loaded with svg.js (see
// open.js, the full-screen overlay around it).
//
//   const v = createBlueprintViewer({ spec, theme, date, sheetNo, onClose });
//   container.append(v.el);           // fills its container (give the container a height)
//   v.update(spec, { partial })       // re-render (streaming previews keep the zoom)
//   v.select(n)                       // highlight part n (null clears)
//   v.fit(); v.setTheme('paper'); v.destroy();
//   v.svg                             // the current SVGSVGElement
//
//   serializeSVG(svgOrSpec, opts) -> string            standalone SVG document text
//   downloadSVG(specOrSvg, { filename, theme, date }) -> filename
//   toPNG(svg, scale = 2) -> Promise<Blob>             via an <img> from a blob: URL (CSP img-src blob:)
//   downloadPNG(specOrSvg, { scale, filename }) -> Promise<filename>
//   thumbnail(svg, { width = 320, maxChars = 60000 }) -> Promise<data URL>  (PNG, JPEG if too big)
//   blueprintFileName(spec, ext, date) -> 'jarvis-blueprint-alternator-2026-11-19.svg'
//
// DOM is built with h() (createElement / createElementNS); text only through textContent; source
// links only through extLink (http/https, new tab, no referrer). No innerHTML anywhere.

import { h, clear, extLink } from '../dom.js';
import { icon } from '../icons.js';
import { normalizeBlueprintSpec } from '../../lib/blueprint-spec.js';
import { renderBlueprint } from './svg.js';
import { createPanZoom } from './panzoom.js';

// The lazy chunk's other entry points (thumbnails and downloads from the library and chat cards).
export { renderBlueprint };

const SVG_NS = 'http://www.w3.org/2000/svg';
const NARROW_PX = 760;
const SHEET_LABELS = { part: 'Part drawing', cutaway: 'Cutaway', exploded: 'Exploded view', process: 'Process sheet', assembly: 'Assembly drawing' };

/** Small static tool icons the shared icon set lacks (built with createElementNS). */
function toolIcon(name) {
  const paths = {
    minus: ['M6 12h12'],
    plus: ['M12 6v12', 'M6 12h12'],
    fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  }[name];
  if (!paths) return icon(name, { size: 20 });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon-${name}`);
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

function numberBadge(n) {
  return h('span', { class: 'bpv__num', attrs: { 'aria-hidden': 'true' } }, String(n));
}

/**
 * The viewer. opts: spec (raw or normalized), theme, date, sheetNo, onClose, partial.
 */
export function createBlueprintViewer(opts = {}) {
  let spec = null;
  let svg = null;
  let theme = opts.theme || 'blueprint';
  let selected = null;
  let drawing = !!opts.partial; // the sheet is still being written (live preview)
  let narrow = false;
  let panelOpen = true; // wide: always shown; narrow: the drawer starts open
  const sheetSize = { width: 1, height: 1 };

  const kicker = h('div', { class: 'bpv__kicker' });
  const title = h('div', { class: 'bpv__title' });
  const subtitle = h('div', { class: 'bpv__subtitle' });
  const toolBtn = (name, label, testid, onClick, text) =>
    h(
      'button',
      { class: ['bpv__btn', text && 'bpv__btn--text'], type: 'button', attrs: { 'aria-label': label, title: label, 'data-testid': testid }, on: { click: onClick } },
      toolIcon(name),
      text ? h('span', { class: 'bpv__btn-text' }, text) : null,
    );

  const bar = h(
    'header',
    { class: 'bpv__bar' },
    h('div', { class: 'bpv__titles' }, kicker, title, subtitle),
    h(
      'div',
      { class: 'bpv__tools' },
      toolBtn('download', 'Download SVG', 'blueprint-download-svg', () => downloadSVG(svg, { filename: blueprintFileName(spec, 'svg', opts.date) }), 'SVG'),
      toolBtn('download', 'Download PNG', 'blueprint-download-png', () => downloadPNG(svg, { filename: blueprintFileName(spec, 'png', opts.date) }), 'PNG'),
      opts.onClose ? toolBtn('close', 'Close blueprint', 'blueprint-close', () => opts.onClose()) : null,
    ),
  );

  const zoomLabel = h('div', { class: 'bpv__zoom-label', attrs: { 'aria-hidden': 'true' } }, '');
  const zoomControls = h(
    'div',
    { class: 'bpv__zoom' },
    toolBtn('plus', 'Zoom in', 'blueprint-zoom-in', () => panzoom.zoomBy(1.6)),
    toolBtn('minus', 'Zoom out', 'blueprint-zoom-out', () => panzoom.zoomBy(1 / 1.6)),
    toolBtn('fit', 'Fit to screen', 'blueprint-fit', () => panzoom.fit(true)),
  );
  // The chip appears where a finger just tapped a bubble: ignore the click that the same touch
  // produces a moment later (it would land on the new chip and open the list by itself).
  let chipShownAt = 0;
  const chip = h('button', {
    class: 'bpv__chip',
    type: 'button',
    hidden: true,
    attrs: { 'data-testid': 'blueprint-chip' },
    on: {
      click: () => {
        if (performance.now() - chipShownAt > 450) setPanel(true);
      },
    },
  });
  const stage = h('div', {
    class: 'bpv__stage',
    attrs: { 'data-testid': 'blueprint-stage', 'aria-label': 'Blueprint drawing. Drag to move, pinch or scroll to zoom, tap a numbered bubble to find the part.', role: 'group' },
  });
  const overlay = h('div', { class: 'bpv__overlay' }, zoomLabel, zoomControls, chip);

  const panelToggle = h(
    'button',
    { class: 'bpv__panel-toggle', type: 'button', attrs: { 'aria-expanded': 'true', 'data-testid': 'blueprint-parts-toggle' }, on: { click: () => setPanel(!panelOpen) } },
    h('span', { class: 'bpv__grip', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'bpv__panel-toggle-text' }, 'Parts'),
  );
  const panelBody = h('div', { class: 'bpv__panel-body' });
  const panel = h('aside', { class: 'bpv__panel', attrs: { 'data-testid': 'blueprint-panel', 'aria-label': 'Parts, notes and sources' } }, panelToggle, panelBody);

  const el = h(
    'div',
    { class: 'bpv bpv--panel-open', attrs: { 'data-testid': 'blueprint-viewer', 'data-layout': 'wide' } },
    bar,
    h('div', { class: 'bpv__body' }, h('div', { class: 'bpv__stage-wrap' }, stage, overlay), panel),
  );

  const panzoom = createPanZoom(stage, {
    size: sheetSize,
    // Keep the fitted sheet clear of the floating zoom buttons (a column at the right).
    insets: () => (narrow ? { bottom: 28 } : { right: 60 }),
    apply(view, rect) {
      if (!svg) return;
      svg.setAttribute('viewBox', `${fmt(-view.x / view.scale)} ${fmt(-view.y / view.scale)} ${fmt(rect.width / view.scale)} ${fmt(rect.height / view.scale)}`);
      const pct = Math.round((view.scale / panzoom.fitScale()) * 100);
      zoomLabel.textContent = `${pct}%`;
    },
    onTap({ target }) {
      const hit = target && target.closest ? target.closest('[data-n]') : null;
      if (hit && svg && svg.contains(hit)) select(Number(hit.getAttribute('data-n')), { from: 'sheet' });
      else select(null);
    },
  });

  // Layout follows the viewer's own width (it may sit in a sheet, a panel or full screen).
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => setNarrow(el.getBoundingClientRect().width < NARROW_PX));
    ro.observe(el);
  }

  function setNarrow(value) {
    if (value === narrow) return;
    narrow = value;
    el.setAttribute('data-layout', narrow ? 'narrow' : 'wide');
    // Phones open with the list under the sheet overview (the free space a landscape sheet
    // leaves on a portrait screen); the handle hides it for a full-height drawing.
    setPanel(true);
  }

  function setPanel(open) {
    panelOpen = !!open;
    el.classList.toggle('bpv--panel-open', panelOpen);
    panelToggle.setAttribute('aria-expanded', String(panelOpen));
    updateChip();
    if (panelOpen && selected !== null) scrollRow(selected);
  }

  function render(input, { partial = false } = {}) {
    drawing = !!partial;
    const result = typeof input === 'object' && input && input.v === 1 && Array.isArray(input.views) ? { spec: input } : normalizeBlueprintSpec(input, { partial });
    if (!result.spec) return false;
    spec = result.spec;
    const next = renderBlueprint(spec, { theme, date: opts.date, sheetNo: opts.sheetNo, normalized: true });
    const [, , w, hgt] = next.getAttribute('viewBox').split(/\s+/).map(Number);
    next.setAttribute('data-sheet-width', String(w));
    next.setAttribute('data-sheet-height', String(hgt));
    next.removeAttribute('width');
    next.removeAttribute('height');
    next.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    next.classList.add('bpv__sheet');
    if (svg) svg.replaceWith(next);
    else stage.appendChild(next);
    svg = next;
    const grew = Math.abs(sheetSize.width - w) > 1 || Math.abs(sheetSize.height - hgt) > 1;
    sheetSize.width = w;
    sheetSize.height = hgt;
    panzoom.setSize(sheetSize, { refit: grew && panzoom.isFitted() });
    renderTitles();
    renderPanel();
    if (selected !== null) markSelected(selected);
    return true;
  }

  function renderTitles() {
    kicker.textContent = `Blueprint · ${SHEET_LABELS[spec.sheet] || 'Drawing'}`;
    title.textContent = spec.title;
    subtitle.textContent = spec.subject || '';
    subtitle.hidden = !spec.subject;
    const n = spec.parts.length;
    panelToggle.lastChild.textContent = spec.sheet === 'process' ? `Steps and materials${n ? ` (${n})` : ''}` : `Parts list${n ? ` (${n})` : ''}`;
  }

  function renderPanel() {
    clear(panelBody);
    const partsSection = () => {
      if (spec.parts.length) {
        panelBody.append(
          h(
            'section',
            { class: 'bpv__section' },
            h('h3', { class: 'bpv__h' }, spec.sheet === 'process' ? 'Materials and inputs' : 'Parts list'),
            h(
              'ol',
              { class: 'bpv__parts' },
              spec.parts.map((p) =>
                h(
                  'li',
                  null,
                  h(
                    'button',
                    { class: 'bpv__part', type: 'button', attrs: { 'data-n': p.n, 'data-testid': 'blueprint-part', 'aria-pressed': 'false' }, on: { click: () => select(p.n, { from: 'panel' }) } },
                    numberBadge(p.n),
                    h(
                      'span',
                      { class: 'bpv__part-text' },
                      h('span', { class: 'bpv__part-name' }, p.name, p.qty ? h('span', { class: 'bpv__qty' }, ` ×${p.qty}`) : null),
                      p.material ? h('span', { class: 'bpv__part-mat' }, p.material) : null,
                      p.note ? h('span', { class: 'bpv__part-note' }, p.note) : null,
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }
    };
    const stepsSection = () => {
      if (spec.steps.length) {
        panelBody.append(
          h(
            'section',
            { class: 'bpv__section' },
            h('h3', { class: 'bpv__h' }, 'Process steps'),
            h(
              'ol',
              { class: 'bpv__steps' },
              spec.steps.map((s) =>
                h(
                  'li',
                  { class: 'bpv__step' },
                  numberBadge(s.n),
                  h('span', { class: 'bpv__part-text' }, s.phase ? h('span', { class: 'bpv__phase' }, s.phase) : null, h('span', { class: 'bpv__part-name' }, s.title), s.detail ? h('span', { class: 'bpv__part-note' }, s.detail) : null),
                ),
              ),
            ),
          ),
        );
      }
    };
    // A process sheet is about its steps: they come first.
    if (spec.sheet === 'process') {
      stepsSection();
      partsSection();
    } else {
      partsSection();
      stepsSection();
    }
    if (spec.notes.length) {
      panelBody.append(h('section', { class: 'bpv__section' }, h('h3', { class: 'bpv__h' }, 'Notes'), h('ol', { class: 'bpv__notes' }, spec.notes.map((n) => h('li', null, n)))));
    }
    if (!panelBody.firstChild) {
      panelBody.append(h('p', { class: 'bpv__empty' }, drawing ? 'The parts list appears here as Jarvis draws.' : 'This sheet has no parts list.'));
    }
    if (spec.sources.length) {
      panelBody.append(
        h(
          'section',
          { class: 'bpv__section' },
          h('h3', { class: 'bpv__h' }, 'Sources'),
          h('ul', { class: 'bpv__sources' }, spec.sources.map((s) => h('li', null, extLink(s.url, s.title, { class: 'bpv__link' })))),
        ),
      );
    }
  }

  function markSelected(n) {
    if (!svg) return;
    for (const node of svg.querySelectorAll('.bp-callout.is-active, .bp-part-row.is-active')) node.classList.remove('is-active');
    for (const node of panelBody.querySelectorAll('.bpv__part[aria-pressed="true"]')) node.setAttribute('aria-pressed', 'false');
    if (n === null) return;
    for (const node of svg.querySelectorAll(`.bp-callout[data-n="${n}"], .bp-part-row[data-n="${n}"]`)) node.classList.add('is-active');
    const row = panelBody.querySelector(`.bpv__part[data-n="${n}"]`);
    if (row) row.setAttribute('aria-pressed', 'true');
  }

  function scrollRow(n) {
    const row = panelBody.querySelector(`.bpv__part[data-n="${n}"]`);
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function updateChip() {
    const part = selected !== null && spec ? spec.parts.find((p) => p.n === selected) : null;
    const show = !!part && narrow && !panelOpen;
    if (show && chip.hidden) chipShownAt = performance.now();
    chip.hidden = !show;
    if (!part) return;
    clear(chip);
    chip.append(numberBadge(part.n), h('span', { class: 'bpv__chip-text' }, h('span', { class: 'bpv__part-name' }, part.name), part.material ? h('span', { class: 'bpv__part-mat' }, part.material) : null));
    chip.setAttribute('aria-label', `Part ${part.n}: ${part.name}. Show in the parts list.`);
  }

  /** Highlight part n everywhere; from the panel, fly to its callout. */
  function select(n, { from = 'api' } = {}) {
    selected = Number.isInteger(n) ? n : null;
    markSelected(selected);
    updateChip();
    if (selected === null) return;
    if (from === 'sheet' && panelOpen) scrollRow(selected);
    if (from === 'panel' && svg) {
      const bubble = svg.querySelector(`.bp-callout[data-n="${selected}"]`);
      if (bubble) {
        const x = Number(bubble.getAttribute('data-cx'));
        const y = Number(bubble.getAttribute('data-cy'));
        const fitS = panzoom.fitScale();
        const scale = Math.max(panzoom.view().scale, Math.min(fitS * 3, Math.max(fitS * 1.6, 1.25)));
        if (narrow) setPanel(false);
        panzoom.centerOn(x, y, scale, true);
      }
    }
  }

  render(opts.spec || {}, { partial: !!opts.partial });

  return {
    el,
    get svg() {
      return svg;
    },
    get spec() {
      return spec;
    },
    update: (next, o) => render(next, o),
    select: (n) => select(n),
    fit: () => panzoom.fit(true),
    zoomBy: (f) => panzoom.zoomBy(f),
    centerOn: (x, y, scale) => panzoom.centerOn(x, y, scale, false),
    setTheme(next) {
      theme = next;
      if (spec) render(spec);
    },
    destroy() {
      panzoom.destroy();
      if (ro) ro.disconnect();
      el.remove();
    },
  };
}

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

// ---------------------------------------------------------------------------------------------
// Export

/** The sheet as a standalone SVG document string (viewer state removed, real size restored). */
export function serializeSVG(svgOrSpec, opts = {}) {
  const svg = svgOrSpec && svgOrSpec.nodeType === 1 ? svgOrSpec : renderBlueprint(svgOrSpec, { theme: opts.theme, date: opts.date });
  const clone = svg.cloneNode(true);
  const w = Number(svg.getAttribute('data-sheet-width')) || Number(svg.getAttribute('width')) || Number((svg.getAttribute('viewBox') || '').split(/\s+/)[2]) || 1000;
  const hgt = Number(svg.getAttribute('data-sheet-height')) || Number(svg.getAttribute('height')) || Number((svg.getAttribute('viewBox') || '').split(/\s+/)[3]) || 700;
  clone.setAttribute('viewBox', `0 0 ${fmt(w)} ${fmt(hgt)}`);
  clone.setAttribute('width', fmt(w));
  clone.setAttribute('height', fmt(hgt));
  clone.removeAttribute('preserveAspectRatio');
  clone.removeAttribute('style');
  clone.classList.remove('bpv__sheet');
  for (const node of clone.querySelectorAll('.is-active')) node.classList.remove('is-active');
  clone.setAttribute('xmlns', SVG_NS);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** Suggested file name: jarvis-blueprint-<title>-<date>.<ext> */
export function blueprintFileName(spec, ext = 'svg', date = new Date()) {
  const slug =
    String((spec && spec.title) || 'blueprint')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'blueprint';
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `jarvis-blueprint-${slug}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iOS Safari reads the URL after click() returns: keep it alive for a while.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return filename;
}

/** Download the sheet as SVG. Accepts the viewer's SVG element or a spec. */
export function downloadSVG(specOrSvg, opts = {}) {
  const text = serializeSVG(specOrSvg, opts);
  const name = opts.filename || blueprintFileName(specOrSvg && specOrSvg.nodeType === 1 ? null : specOrSvg, 'svg', opts.date);
  return saveBlob(new Blob([text], { type: 'image/svg+xml' }), name);
}

/** Load serialized SVG text into an <img> through a blob: URL. */
function loadSvgImage(text) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    const img = new Image();
    const done = (fn, value) => {
      URL.revokeObjectURL(url);
      fn(value);
    };
    img.onload = () => done(resolve, img);
    img.onerror = () => done(reject, new Error('The blueprint image could not be prepared.'));
    img.src = url;
  });
}

function sheetSizeOf(svg) {
  const w = Number(svg.getAttribute('data-sheet-width')) || Number(svg.getAttribute('width')) || 1000;
  const hgt = Number(svg.getAttribute('data-sheet-height')) || Number(svg.getAttribute('height')) || 700;
  return { w, h: hgt };
}

/** Draw the sheet to a canvas of at most maxPixels (iOS caps canvas area near 16.7 MP). */
async function rasterize(svg, scale, { maxPixels = 16000000, maxSide = 8192 } = {}) {
  const { w, h: hgt } = sheetSizeOf(svg);
  let s = Math.max(0.05, scale);
  s = Math.min(s, Math.sqrt(maxPixels / (w * hgt)), maxSide / w, maxSide / hgt);
  const img = await loadSvgImage(serializeSVG(svg));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * s));
  canvas.height = Math.max(1, Math.round(hgt * s));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The sheet as a PNG Blob at `scale` times its size (clamped for big sheets). */
export async function toPNG(svg, scale = 2, opts = {}) {
  const canvas = await rasterize(svg, scale, opts);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be created.'))), 'image/png');
  });
}

/** Download the sheet as PNG (2x by default). */
export async function downloadPNG(specOrSvg, opts = {}) {
  const svg = specOrSvg && specOrSvg.nodeType === 1 ? specOrSvg : renderBlueprint(specOrSvg, { theme: opts.theme, date: opts.date });
  const blob = await toPNG(svg, opts.scale || 2);
  return saveBlob(blob, opts.filename || blueprintFileName(specOrSvg && specOrSvg.nodeType === 1 ? null : specOrSvg, 'png', opts.date));
}

/**
 * A small preview for the saved library: a PNG data URL `width` px wide; JPEG when the PNG would
 * be longer than maxChars, then smaller sizes until it fits.
 */
export async function thumbnail(svg, { width = 320, maxChars = 60000 } = {}) {
  const { w } = sheetSizeOf(svg);
  // At thumbnail size the grid is noise that PNG cannot compress: leave it (and the paper
  // vignette) out.
  const lite = svg.cloneNode(true);
  const grid = lite.querySelector('.bp-grid');
  if (grid) grid.remove();
  const vignette = lite.querySelector('.bp-paper + rect');
  if (vignette) vignette.remove();
  let target = width;
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = await rasterize(lite, target / w);
    const png = canvas.toDataURL('image/png');
    if (png.length <= maxChars) return png;
    const jpeg = canvas.toDataURL('image/jpeg', 0.8);
    if (jpeg.length <= maxChars) return jpeg;
    target = Math.round(target * 0.8);
  }
  return null;
}
