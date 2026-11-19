// Inline SVG icon set (original, 24x24, stroke-based). Built with DOM APIs only.
//
//   import { icon } from './icons.js';
//   button.append(icon('send'));
//   icon('alert', { size: 16, title: 'Error' })   // titled icons are announced; others are aria-hidden
//
// Each icon is a list of [tag, attrs] shapes. Shapes with `fill: true` are filled
// with currentColor instead of stroked.

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
  clock: [C(12, 12, 8.5), P('M12 7.5V12l3 2')],
  plus: [P('M12 5v14'), P('M5 12h14')],
  close: [P('M6.5 6.5l11 11'), P('M17.5 6.5l-11 11')],
  search: [C(11, 11, 6.2), P('M20 20l-4.6-4.6')],
  globe: [C(12, 12, 8.5), P('M3.5 12h17'), P('M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5'), P('M12 3.5C9.4 6.1 8.4 8.9 8.4 12s1 5.9 3.6 8.5')],
  link: [P('M10.2 13.8a3.8 3.8 0 0 0 5.4 0l3-3a3.8 3.8 0 0 0-5.4-5.4l-1.1 1.1'), P('M13.8 10.2a3.8 3.8 0 0 0-5.4 0l-3 3a3.8 3.8 0 0 0 5.4 5.4l1.1-1.1')],
  external: [P('M14 4.5h5.5V10'), P('M19.5 4.5L11 13'), P('M18 13.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h5')],
  check: [P('M5 12.5l4.5 4.5L19 7.5')],
  alert: [P('M12 4.2l8.6 15H3.4z'), P('M12 10v4'), P('M12 16.9v.2')],
  info: [C(12, 12, 8.5), P('M12 11v5'), P('M12 7.9v.2')],
  copy: [R(9, 9, 11, 11, 2), P('M15 6V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H6')],
  speaker: [P('M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z'), P('M15.5 9.2a4 4 0 0 1 0 5.6'), P('M18 6.8a7.5 7.5 0 0 1 0 10.4')],
  'speaker-off': [P('M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z'), P('M16 9.5l5 5'), P('M21 9.5l-5 5')],
  'chevron-down': [P('M6.5 9.5L12 15l5.5-5.5')],
  'chevron-up': [P('M6.5 14.5L12 9l5.5 5.5')],
  'chevron-right': [P('M9.5 6.5L15 12l-5.5 5.5')],
  'chevron-left': [P('M14.5 6.5L9 12l5.5 5.5')],
  'arrow-down': [P('M12 5v14'), P('M6.5 13.5L12 19l5.5-5.5')],
  trash: [P('M4.5 7h15'), P('M9.5 7V4.5h5V7'), P('M6.5 7l.9 12.5h9.2l.9-12.5'), P('M10.2 11v5'), P('M13.8 11v5')],
  key: [C(8, 15, 3.8), P('M10.8 12.2L19 4'), P('M15.5 7.5l2.5 2.5'), P('M13.2 9.8l1.8 1.8')],
  download: [P('M12 4v11'), P('M7 10.5l5 5 5-5'), P('M5 20h14')],
  upload: [P('M12 20V9'), P('M7 13.5l5-5 5 5'), P('M5 4h14')],
  bulb: [P('M9.2 17.5h5.6'), P('M10 20.5h4'), P('M12 3.5a5.8 5.8 0 0 0-3.6 10.4c.6.5 1 1.3 1 2.1v.5h5.2V16c0-.8.4-1.6 1-2.1A5.8 5.8 0 0 0 12 3.5z')],
  bolt: [P('M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12z')],
  agents: [C(12, 8, 3), C(5.5, 10, 2.2), C(18.5, 10, 2.2), P('M7.2 20a4.8 4.8 0 0 1 9.6 0'), P('M2.5 19a3.3 3.3 0 0 1 4.6-3'), P('M21.5 19a3.3 3.3 0 0 0-4.6-3')],
  target: [C(12, 12, 8.5), C(12, 12, 4.5), C(12, 12, 1, { fill: true })],
  refresh: [P('M19.5 12a7.5 7.5 0 1 1-2.2-5.3'), P('M19.5 4v4.5H15')],
  menu: [P('M4 7h16'), P('M4 12h16'), P('M4 17h16')],
  sparkle: [P('M12 3.5l1.9 5.2 5.1 1.9-5.1 1.9L12 17.7l-1.9-5.2L5 10.6l5.1-1.9z'), P('M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z')],
  pin: [P('M12 20.5s-6-5.4-6-10.5a6 6 0 0 1 12 0c0 5.1-6 10.5-6 10.5z'), C(12, 10, 2.2)],
  memory: [P('M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1z')],
  phone: [R(7, 2.5, 10, 19, 2.2), P('M11 18h2')],
  laptop: [R(5, 5, 14, 10, 1.5), P('M3 18.5h18')],
  share: [P('M12 3.5v11'), P('M8.5 7L12 3.5 15.5 7'), P('M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7a1.5 1.5 0 0 0-1.5-1.5H16')],
  'add-square': [R(4, 4, 16, 16, 3.5), P('M12 8.5v7'), P('M8.5 12h7')],
  more: [C(6, 12, 1.4, { fill: true }), C(12, 12, 1.4, { fill: true }), C(18, 12, 1.4, { fill: true })],
  dot: [C(12, 12, 4, { fill: true })],
  spinner: [P('M12 3.5a8.5 8.5 0 1 0 8.5 8.5')],
  'wifi-off': [P('M2.5 8.8a14 14 0 0 1 19 0'), P('M5.5 12.2a9.6 9.6 0 0 1 13 0'), P('M8.8 15.6a5 5 0 0 1 6.4 0'), P('M12 19.2v.2'), P('M3.5 3.5l17 17')],
  lock: [R(5, 10.5, 14, 10, 2), P('M8 10.5V7.5a4 4 0 0 1 8 0v3')],
  edit: [P('M4 20h4L19 9l-4-4L4 16z'), P('M13 7l4 4')],
  play: [P('M8 5.5v13l10.5-6.5z', { fill: true })],
  pause: [R(7, 5.5, 3.5, 13, 1, { fill: true }), R(13.5, 5.5, 3.5, 13, 1, { fill: true })],
  chip: [R(6.5, 6.5, 11, 11, 2), P('M9.5 2.5v4'), P('M14.5 2.5v4'), P('M9.5 17.5v4'), P('M14.5 17.5v4'), P('M2.5 9.5h4'), P('M2.5 14.5h4'), P('M17.5 9.5h4'), P('M17.5 14.5h4')],
  dollar: [P('M12 3v18'), P('M16.3 7.6c-.6-1.5-2.2-2.4-4.3-2.4-2.5 0-4.3 1.3-4.3 3.2 0 4.4 8.8 2.4 8.8 6.8 0 2-1.9 3.4-4.5 3.4-2.3 0-4.1-1-4.7-2.6')],
  user: [C(12, 8.5, 3.8), P('M4.5 20a7.5 7.5 0 0 1 15 0')],
  eye: [P('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'), C(12, 12, 3)],
  'eye-off': [P('M4 4l16 16'), P('M10 6a10 10 0 0 1 2-.2c6 0 9.5 6.2 9.5 6.2a16 16 0 0 1-2.6 3.3'), P('M14.1 14.2A3 3 0 0 1 9.8 9.9'), P('M6.6 7.7A15.6 15.6 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9.6 9.6 0 0 0 4.2-1')],
  wave: [P('M3 12h2'), P('M7 8v8'), P('M11 5v14'), P('M15 8v8'), P('M19 10.5v3'), P('M21 12h0')],
  layers: [P('M12 4l8.5 4.5L12 13 3.5 8.5z'), P('M3.5 12.5L12 17l8.5-4.5'), P('M3.5 16.5L12 21l8.5-4.5')],
  logo: [C(12, 12, 9), C(12, 12, 5.5), P('M12 3v2.5'), P('M12 18.5V21'), P('M3 12h2.5'), P('M18.5 12H21'), C(12, 12, 2, { fill: true })],
  // Attachments (wave B)
  paperclip: [P('M19.4 11.3l-7.7 7.7a4.7 4.7 0 0 1-6.6-6.6l8.2-8.2a3.1 3.1 0 0 1 4.4 4.4l-8.1 8.1a1.55 1.55 0 0 1-2.2-2.2l7.4-7.4')],
  camera: [P('M4.6 7.4h2.9l1.5-2.2h6l1.5 2.2h2.9a1.6 1.6 0 0 1 1.6 1.6v9.4a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 18.4V9a1.6 1.6 0 0 1 1.6-1.6z'), C(12, 13.4, 3.4)],
  file: [P('M7 3.5h6.4l5.1 5.1V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z'), P('M13.4 3.5v5.1h5.1'), P('M8.6 12.6h6.8'), P('M8.6 16.1h4.6')],
  image: [R(3.5, 4.5, 17, 15, 2.2), C(15.4, 9.2, 1.7), P('M3.5 16.6l4.7-4.7a1.5 1.5 0 0 1 2.1 0l5.6 5.6'), P('M13.9 15.1l1.5-1.5a1.5 1.5 0 0 1 2.1 0l3 3')],
  // Holograms and blueprints
  hologram: [P('M12 3.5l6.5 3.7v7.4L12 18.3l-6.5-3.7V7.2z'), P('M12 10.9l6.5-3.7'), P('M12 10.9v7.4'), P('M12 10.9L5.5 7.2'), P('M4 20.5h16'), P('M8 18.6l-1.8 1.9'), P('M16 18.6l1.8 1.9')],
  blueprint: [R(4, 4.5, 16, 15, 1.5), P('M4 9.5h16'), P('M9 9.5v10'), P('M12.5 13h4'), P('M12.5 16h3')],
  explode: [P('M4 9V4h5'), P('M20 9V4h-5'), P('M4 15v5h5'), P('M20 15v5h-5'), P('M9 9L4.5 4.5'), P('M15 9l4.5-4.5'), P('M9 15l-4.5 4.5'), P('M15 15l4.5 4.5')],
  tag: [P('M4 7.5h9l4 4.5-4 4.5H4z'), C(8, 12, 0.9, { fill: true })],
  cube: [P('M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z'), P('M12 12l7.5-4.3'), P('M12 12v8.5'), P('M12 12L4.5 7.7')],
  list: [P('M9 6.5h11'), P('M9 12h11'), P('M9 17.5h11'), C(4.8, 6.5, 0.9, { fill: true }), C(4.8, 12, 0.9, { fill: true }), C(4.8, 17.5, 0.9, { fill: true })],
  focus: [P('M4 9V4h5'), P('M20 9V4h-5'), P('M4 15v5h5'), P('M20 15v5h-5'), P('M12 9.5v5'), P('M9.5 12h5')],
  isolate: [C(12, 12, 8.5, { 'stroke-dasharray': '2.6 2.4' }), C(12, 12, 3.2)],
  'reset-view': [P('M12 4.5a7.5 7.5 0 1 1-7.5 7.5'), P('M4.5 4.5v4h4'), C(12, 12, 1.6, { fill: true })],
  minus: [P('M6 12h12')],
  fit: [P('M4 9V4h5'), P('M20 9V4h-5'), P('M4 15v5h5'), P('M20 15v5h-5')],
};

/** All available icon names. */
export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

/**
 * Create an <svg> icon.
 * @param {string} name   one of ICON_NAMES (unknown names render the 'dot' icon)
 * @param {{ size?: number, title?: string, class?: string, strokeWidth?: number }} [opts]
 * @returns {SVGSVGElement}
 */
export function icon(name, opts = {}) {
  const { size = 20, title, strokeWidth = 1.75 } = opts;
  const shapes = ICONS[name] || ICONS.dot;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', ['icon', `icon-${name}`, opts.class].filter(Boolean).join(' '));
  svg.setAttribute('focusable', 'false');
  if (title) {
    svg.setAttribute('role', 'img');
    const t = document.createElementNS(SVG_NS, 'title');
    t.textContent = title;
    svg.appendChild(t);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const [tag, attrs] of shapes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const key of Object.keys(attrs)) {
      if (key === 'fill') continue;
      el.setAttribute(key, String(attrs[key]));
    }
    if (attrs.fill) {
      el.setAttribute('fill', 'currentColor');
      el.setAttribute('stroke', 'none');
    }
    svg.appendChild(el);
  }
  return svg;
}
