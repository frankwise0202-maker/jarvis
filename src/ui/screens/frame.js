// Screens (v7): the HUD frame around one panel, in the Presence style (calm, not noisy).
//
//   const frame = createScreenFrame({ win, label: 'SCREEN 2', kind: 'hologram', title, where,
//                                     compact, onBack, onClose, onFullscreen })
//   host.append(frame.el); frame.body.append(panel.el); frame.deck.append(controls)
//   frame.setTitle(t)  frame.setKind(kind, { report })  frame.setDetail('43 PARTS')
//   frame.setStatus(word, tone)  frame.scan()  frame.setState('loading' | 'ready' | 'missing' | 'error')
//   frame.destroy()
//
// What makes it a JARVIS screen: corner brackets and a thin glowing edge (in the theme's accent), a
// faint 24px grid behind the content, a header "SCREEN 2 · HOLOGRAM · 43 PARTS" over "2024 CAMRY
// HYBRID" with a small core glyph and a clock (hours and minutes, so nothing ticks), and a 300ms
// assemble on open (brackets draw in, then the content fades up 4px) with one scanline. Under reduced
// motion all of it is static. Nothing loops while idle; the glyph breathes only while the content is
// live (a build, a stream, agents).
//
// `win` is the window the frame lives in (a floating Picture-in-Picture panel is another window):
// its timers drive the clock, so they keep running while the app's own tab is hidden. All text is
// set with textContent (dom.js h()).

import { h, setText } from '../dom.js';
import { icon } from '../icons.js';
import { screenKindLabel } from '../../lib/screen-targets.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The small core glyph: two arcs around a ring and a dot (decorative). */
export function coreGlyph(size = 18) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'scr-glyph');
  const arc = (d, cls) => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    return p;
  };
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', '12');
  ring.setAttribute('cy', '12');
  ring.setAttribute('r', '6.4');
  ring.setAttribute('class', 'scr-glyph__ring');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '12');
  dot.setAttribute('cy', '12');
  dot.setAttribute('r', '2.6');
  dot.setAttribute('class', 'scr-glyph__dot');
  svg.append(arc('M3.6 9.2A9 9 0 0 1 10.2 3.2', 'scr-glyph__arc'), arc('M20.4 14.8A9 9 0 0 1 13.8 20.8', 'scr-glyph__arc'), arc('M14.6 3.4A9 9 0 0 1 20.6 9.4', 'scr-glyph__arc scr-glyph__arc--dim'), ring, dot);
  return svg;
}

/** "Bring back": an arrow that turns back (the shared icon set has none). */
function backIcon(size = 18) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon icon-back');
  for (const d of ['M9.5 14.5L4.5 9.5l5-5', 'M4.5 9.5h9.5a5.5 5.5 0 0 1 0 11H11']) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

function clockText(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function createScreenFrame(opts = {}) {
  const win = opts.win || window;
  const compact = !!opts.compact;
  let kind = opts.kind || 'answer';
  let report = !!opts.report;
  let destroyed = false;

  const whereText = h('span', { class: 'scr__where', text: opts.label || 'SCREEN' });
  const kindText = h('span', { class: 'scr__kind', text: screenKindLabel(kind, { report }) });
  // A third, optional part ("43 PARTS"): kept in the header so nothing sits on the content. Empty
  // and hidden when unused, so the eyebrow's text is just "SCREEN 2 · BLUEPRINT". It travels with
  // its "·" (the tail): in a header too narrow for it the whole tail drops out of the line (CSS), so
  // no "·" is left dangling; the kind then shortens with an ellipsis.
  const detailSep = h('span', { class: 'scr__sep', hidden: true, attrs: { 'aria-hidden': 'true' } });
  const detailText = h('span', { class: 'scr__detail', hidden: true, attrs: { 'data-testid': 'screen-detail' } });
  const lead = h('span', { class: 'scr__lead' }, whereText, h('span', { class: 'scr__sep', attrs: { 'aria-hidden': 'true' }, text: '·' }), kindText);
  const tail = h('span', { class: 'scr__tail', hidden: true }, detailSep, detailText);
  const eyebrow = h('p', { class: 'scr__eyebrow' }, lead, tail);
  const title = h('h1', { class: 'scr__title', attrs: { 'data-testid': 'screen-title' } });
  const statusDot = h('span', { class: 'scr__status-dot', attrs: { 'aria-hidden': 'true' } });
  const statusText = h('span', { class: 'scr__status-text' });
  const status = h('p', { class: 'scr__status', hidden: true, attrs: { 'data-testid': 'screen-status', role: 'status' } }, statusDot, statusText);
  const clock = h('time', { class: 'scr__clock', attrs: { 'data-testid': 'screen-clock' } });
  const btn = (name, label, testid, fn, text) =>
    fn
      ? h(
          'button',
          { class: ['scr__btn', text && 'scr__btn--text'], type: 'button', attrs: { 'aria-label': label, title: label, 'data-testid': testid }, on: { click: () => fn() } },
          name === 'back' ? backIcon(18) : icon(name, { size: 18 }),
          text ? h('span', { text }) : null,
        )
      : null;
  const fullBtn = btn('fit', 'Full screen', 'screen-fullscreen', opts.onFullscreen);
  const backBtn = btn('back', 'Bring it back to the main window', 'screen-back', opts.onBack, compact ? null : 'Bring back');
  const closeBtn = btn('close', 'Close this screen', 'screen-close', opts.onClose);
  const actions = h('div', { class: 'scr__actions' }, fullBtn, backBtn, closeBtn);

  const head = h(
    'header',
    { class: 'scr__head', attrs: { 'data-testid': 'screen-header' } },
    h('span', { class: 'scr__core' }, coreGlyph(compact ? 16 : 20)),
    h('div', { class: 'scr__titles' }, eyebrow, title),
    h('div', { class: 'scr__meta' }, status, clock),
    actions,
  );
  const body = h('div', { class: 'scr__body', attrs: { 'data-testid': 'screen-panel' } });
  const deck = h('footer', { class: 'scr__deck', hidden: true });
  const el = h(
    'div',
    {
      class: ['scr', compact && 'scr--compact'],
      attrs: { 'data-testid': 'screen', 'data-kind': kind, 'data-where': opts.where || 'other', 'data-state': 'loading', 'data-compact': compact ? 'true' : 'false' },
    },
    h('div', { class: 'scr__bg', attrs: { 'aria-hidden': 'true' } }),
    h('div', { class: 'scr__edge', attrs: { 'aria-hidden': 'true' } }, h('i', { class: 'scr__corner scr__corner--tl' }), h('i', { class: 'scr__corner scr__corner--tr' }), h('i', { class: 'scr__corner scr__corner--bl' }), h('i', { class: 'scr__corner scr__corner--br' })),
    head,
    body,
    deck,
    h('div', { class: 'scr__scan', attrs: { 'aria-hidden': 'true' } }),
  );

  // Clock: once a minute, on the minute (this window's timers).
  let clockTimer = 0;
  function tick() {
    if (destroyed) return;
    const now = new Date();
    setText(clock, clockText(now));
    clock.dateTime = now.toISOString();
    clockTimer = win.setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
  }
  tick();

  // The assemble on open (CSS): .scr--boot for 600ms, then nothing moves.
  let bootTimer = 0;
  function scan() {
    if (destroyed) return;
    el.classList.remove('scr--scan');
    void el.offsetWidth; // restart the one-shot animation
    el.classList.add('scr--scan');
    win.clearTimeout(bootTimer);
    bootTimer = win.setTimeout(() => el.classList.remove('scr--boot', 'scr--scan'), 900);
  }
  el.classList.add('scr--boot');
  scan();

  function syncTitleAttr() {
    const t = title.textContent || '';
    el.setAttribute('aria-label', `${whereText.textContent} · ${kindText.textContent}${t ? ` · ${t}` : ''}`);
    try {
      const doc = el.ownerDocument;
      if (doc && opts.setDocumentTitle !== false) doc.title = `Jarvis · ${kindText.textContent.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}${t ? ` · ${t}` : ''}`;
    } catch {
      /* no document title */
    }
  }

  const api = {
    el,
    head,
    body,
    deck,
    setTitle(t) {
      setText(title, String(t || '').trim());
      title.title = title.textContent;
      syncTitleAttr();
    },
    setKind(next, o = {}) {
      kind = next || kind;
      report = !!o.report;
      el.dataset.kind = kind;
      setText(kindText, screenKindLabel(kind, { report }));
      syncTitleAttr();
    },
    setLabel(text) {
      setText(whereText, text || 'SCREEN');
      syncTitleAttr();
    },
    /** The header's third part after the kind, like '43 PARTS', or '' for none. */
    setDetail(text) {
      const d = String(text || '');
      tail.hidden = !d;
      detailSep.hidden = !d;
      detailText.hidden = !d;
      setText(detailSep, d ? '·' : '');
      setText(detailText, d);
    },
    /** A state word like 'WORKING · 3 AGENTS' (tone: live | done | warn | error | idle), or '' to hide. */
    setStatus(word, tone = 'idle') {
      const w = String(word || '');
      status.hidden = !w;
      setText(statusText, w);
      status.dataset.tone = tone;
      el.dataset.live = tone === 'live' ? 'true' : 'false';
    },
    setState(state) {
      el.dataset.state = state;
    },
    showDeck(on) {
      deck.hidden = !on;
    },
    scan,
    destroy() {
      destroyed = true;
      win.clearTimeout(clockTimer);
      win.clearTimeout(bootTimer);
      el.remove();
    },
  };
  api.setTitle(opts.title || '');
  return api;
}
