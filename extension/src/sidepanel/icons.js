// Inline SVG icons for the side panel (the app's 24x24 stroke set, src/ui/icons.js, plus a few
// for browser control). Built with DOM APIs only.

const SVG_NS = 'http://www.w3.org/2000/svg';
const P = (d, extra) => ['path', { d, ...extra }];
const C = (cx, cy, r, extra) => ['circle', { cx, cy, r, ...extra }];
const R = (x, y, width, height, rx, extra) => ['rect', { x, y, width, height, rx, ...extra }];

const ICONS = {
  send: [P('M12 19V5'), P('M5.5 11.5L12 5l6.5 6.5')],
  stop: [R(7, 7, 10, 10, 2, { fill: true })],
  mic: [R(9, 3, 6, 11, 3), P('M5.5 11a6.5 6.5 0 0 0 13 0'), P('M12 17.5V21'), P('M8.5 21h7')],
  settings: [P('M4 6h9'), P('M17 6h3'), C(15, 6, 2), P('M4 12h3'), P('M11 12h9'), C(9, 12, 2), P('M4 18h11'), P('M19 18h1'), C(17, 18, 2)],
  history: [P('M4.5 12a7.5 7.5 0 1 0 2.2-5.3'), P('M4 4.5V8h3.5'), P('M12 8v4.2l2.8 1.8')],
  close: [P('M6.5 6.5l11 11'), P('M17.5 6.5l-11 11')],
  globe: [C(12, 12, 8.5), P('M3.5 12h17'), P('M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5'), P('M12 3.5C9.4 6.1 8.4 8.9 8.4 12s1 5.9 3.6 8.5')],
  external: [P('M14 4.5h5.5V10'), P('M19.5 4.5L11 13'), P('M18 13.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h5')],
  check: [P('M5 12.5l4.5 4.5L19 7.5')],
  alert: [P('M12 4.2l8.6 15H3.4z'), P('M12 10v4'), P('M12 16.9v.2')],
  info: [C(12, 12, 8.5), P('M12 11v5'), P('M12 7.9v.2')],
  copy: [R(9, 9, 11, 11, 2), P('M15 6V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H6')],
  'chevron-left': [P('M14.5 6.5L9 12l5.5 5.5')],
  'chevron-right': [P('M9.5 6.5L15 12l-5.5 5.5')],
  trash: [P('M4.5 7h15'), P('M9.5 7V4.5h5V7'), P('M6.5 7l.9 12.5h9.2l.9-12.5'), P('M10.2 11v5'), P('M13.8 11v5')],
  key: [C(8, 15, 3.8), P('M10.8 12.2L19 4'), P('M15.5 7.5l2.5 2.5'), P('M13.2 9.8l1.8 1.8')],
  refresh: [P('M19.5 12a7.5 7.5 0 1 1-2.2-5.3'), P('M19.5 4v4.5H15')],
  sparkle: [P('M12 3.5l1.9 5.2 5.1 1.9-5.1 1.9L12 17.7l-1.9-5.2L5 10.6l5.1-1.9z'), P('M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z')],
  'add-square': [R(4, 4, 16, 16, 3.5), P('M12 8.5v7'), P('M8.5 12h7')],
  lock: [R(5, 10.5, 14, 10, 2), P('M8 10.5V7.5a4 4 0 0 1 8 0v3')],
  play: [P('M8 5.5v13l10.5-6.5z', { fill: true })],
  dollar: [P('M12 3v18'), P('M16.3 7.6c-.6-1.5-2.2-2.4-4.3-2.4-2.5 0-4.3 1.3-4.3 3.2 0 4.4 8.8 2.4 8.8 6.8 0 2-1.9 3.4-4.5 3.4-2.3 0-4.1-1-4.7-2.6')],
  eye: [P('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'), C(12, 12, 3)],
  'eye-off': [P('M3.5 3.5l17 17'), P('M9.9 5.8A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4'), P('M6.6 7.7A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.5 9.5 0 0 0 4.2-1'), P('M10 10a3 3 0 0 0 4 4')],
  shield: [P('M12 3.5l7 2.6v5.2c0 4.5-3 8-7 9.2-4-1.2-7-4.7-7-9.2V6.1z'), P('M9 12l2.2 2.2L15.5 10')],
  'shield-alert': [P('M12 3.5l7 2.6v5.2c0 4.5-3 8-7 9.2-4-1.2-7-4.7-7-9.2V6.1z'), P('M12 8.5v4.5'), P('M12 15.9v.2')],
  hand: [P('M8 12V6.5a1.5 1.5 0 0 1 3 0V11'), P('M11 10.5v-6a1.5 1.5 0 0 1 3 0v6'), P('M14 10.5v-4a1.5 1.5 0 0 1 3 0v6'), P('M17 12.5v-2a1.5 1.5 0 0 1 3 0v3.5a7 7 0 0 1-7 7h-1a6 6 0 0 1-4.9-2.6L4.4 14a1.6 1.6 0 0 1 2.4-2.1L8 13.2')],
  cursor: [P('M5.5 3.5l13 7-5.6 1.6-2.4 5.4z'), P('M13 12.2l5 5')],
  keyboard: [R(3, 6.5, 18, 11, 2), P('M7 10h.01'), P('M10.5 10h.01'), P('M14 10h.01'), P('M17.5 10h.01'), P('M8 14h8')],
  page: [P('M7 3.5h6.4l5.1 5.1V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z'), P('M13.4 3.5v5.1h5.1'), P('M8.6 12.6h6.8'), P('M8.6 16.1h4.6')],
  tab: [R(3.5, 6, 17, 13, 2), P('M3.5 10h17'), P('M8 6v4')],
  camera: [P('M4.6 7.4h2.9l1.5-2.2h6l1.5 2.2h2.9a1.6 1.6 0 0 1 1.6 1.6v9.4a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 18.4V9a1.6 1.6 0 0 1 1.6-1.6z'), C(12, 13.4, 3.4)],
  search: [C(11, 11, 6.2), P('M20 20l-4.6-4.6')],
  scroll: [P('M12 4v16'), P('M8 8l4-4 4 4'), P('M8 16l4 4 4-4')],
  'incognito': [P('M4 11h16'), P('M6.5 11l1.5-5.5h8l1.5 5.5'), C(8, 16, 2.5), C(16, 16, 2.5), P('M10.5 16h3')],
};

/** An <svg> icon. Titled icons are announced; others are aria-hidden. */
export function icon(name, { size = 18, title = '', cls = '' } = {}) {
  const shapes = ICONS[name] || ICONS.info;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon icon-${name}${cls ? ` ${cls}` : ''}`);
  if (title) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title);
  } else svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of shapes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'fill') {
        el.setAttribute('fill', 'currentColor');
        el.setAttribute('stroke', 'none');
      } else el.setAttribute(k, String(v));
    }
    svg.appendChild(el);
  }
  return svg;
}

/** The Jarvis emblem (rings + glowing core), for the header and empty states. */
export function emblem({ size = 32, live = false } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `emblem${live ? ' is-live' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
    return el;
  };
  const defs = add('defs', {});
  const grad = document.createElementNS(SVG_NS, 'radialGradient');
  grad.setAttribute('id', `core${size}`);
  grad.setAttribute('cx', '45%');
  grad.setAttribute('cy', '40%');
  grad.setAttribute('r', '65%');
  for (const [off, color] of [['0', '#f4ffff'], ['0.4', '#bff8ff'], ['0.8', '#3ee0ff'], ['1', '#1aa8d6']]) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', off);
    stop.setAttribute('stop-color', color);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
  add('circle', { cx: 32, cy: 32, r: 28, fill: 'none', stroke: '#3ee0ff', 'stroke-opacity': 0.35, 'stroke-width': 1.2, 'stroke-dasharray': '2 3', class: 'emblem__ticks' });
  add('path', { d: 'M32 9 A23 23 0 0 1 52.6 21.6 M55 32 A23 23 0 0 1 42.4 52.6 M32 55 A23 23 0 0 1 11.4 42.4 M9 32 A23 23 0 0 1 21.6 11.4', fill: 'none', stroke: '#8af3ff', 'stroke-width': 3.2, 'stroke-linecap': 'butt', class: 'emblem__ring' });
  add('circle', { cx: 32, cy: 32, r: 16, fill: 'none', stroke: '#3ee0ff', 'stroke-opacity': 0.55, 'stroke-width': 1.4 });
  add('circle', { cx: 32, cy: 32, r: 11, fill: `url(#core${size})`, class: 'emblem__core' });
  return svg;
}
