// Optics in the chat transcript (report §2.4.5):
//   createOpticsTurnCard(turn, { onOpen })  the owner's Look: the frame as a bracketed 16:9 card
//                                           with the caption "OPTICS · 21:47 · BACK"; tap reopens
//                                           the frozen frame with Jarvis's labels in Optics
//   createPinsSegmentView(sctx)             a pins segment: "PINNED · Coffee mug · AA battery …"
//   createFrameSegmentView(sctx)            a look_through_camera frame: "Jarvis looked · 21:48"
// All text is set with textContent (dom.js); thumbnails pass safeThumb() first.

import { h, setText } from '../dom.js';
import { icon } from '../icons.js';
import { safeThumb } from '../attachments.js';

const SOURCE = { rear: 'BACK', front: 'FRONT', camera: 'CAMERA', screen: 'SCREEN' };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const hhmm = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  try {
    return new Date(n).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
};

/** The caption under an Optics frame: "OPTICS · 21:47 · BACK". */
export function opticsCaption(optics, createdAt) {
  const o = isObj(optics) ? optics : {};
  return ['OPTICS', hhmm(o.capturedAt || createdAt), SOURCE[o.source] || 'CAMERA'].filter(Boolean).join(' · ');
}

export function createOpticsTurnCard(turn, { onOpen } = {}) {
  const meta = Array.isArray(turn.attachments) ? turn.attachments.find((a) => isObj(a) && a.kind !== 'pdf') : null;
  const src = safeThumb(meta && meta.thumb);
  const o = isObj(turn.optics) ? turn.optics : {};
  const w = Number(o.width) || Number(meta && meta.width) || 16;
  const hgt = Number(o.height) || Number(meta && meta.height) || 9;
  const btn = h(
    'button',
    {
      class: 'optics-turn-card',
      type: 'button',
      attrs: { 'data-testid': 'optics-turn', 'aria-label': `Open this Optics frame${o.frameId ? ` (${o.frameId})` : ''} with Jarvis’s labels` },
      style: { '--optics-ratio': String(Math.min(2.4, Math.max(0.5, w / hgt))) },
      on: { click: () => onOpen && onOpen(turn) },
    },
    src ? h('img', { src, alt: '', attrs: { decoding: 'async', draggable: 'false' } }) : h('span', { class: 'optics-turn-empty' }, icon('camera', { size: 22 })),
    h('span', { class: 'optics-turn-brackets', attrs: { 'aria-hidden': 'true' } }, h('i'), h('i'), h('i'), h('i')),
  );
  return h('figure', { class: 'optics-turn' }, btn, h('figcaption', { class: 'optics-turn-caption', text: opticsCaption(o, turn.createdAt) }));
}

export function createPinsSegmentView(sctx) {
  const label = h('span', { class: 'pins-seg-label' });
  const names = h('span', { class: 'pins-seg-names' });
  const viewBtn = h('button', { class: 'pins-seg-view', type: 'button', attrs: { 'data-testid': 'pins-view' }, on: { click: () => seg && sctx.openOptics && sctx.openOptics(seg) } }, h('span', { text: 'View' }));
  const el = h(
    'div',
    { class: 'seg seg-pins', attrs: { 'data-testid': 'segment-pins' } },
    h('span', { class: 'pins-seg-icon', attrs: { 'aria-hidden': 'true' } }, icon('pin', { size: 15 })),
    h('span', { class: 'pins-seg-text' }, label, names),
    viewBtn,
  );
  let seg = null;
  return {
    kind: 'pins',
    el,
    live: null,
    update(s) {
      seg = s;
      const labels = Array.isArray(s.labels) ? s.labels.filter((l) => isObj(l) && typeof l.text === 'string') : [];
      const status = s.status === 'live' ? 'live' : s.status === 'error' ? 'error' : 'done';
      el.dataset.status = status;
      setText(label, status === 'error' && !labels.length ? 'Labels not pinned' : status === 'live' ? `Pinning${s.frameId ? ` on ${s.frameId}` : ''}…` : `Pinned${s.frameId ? ` on ${s.frameId}` : ''}`);
      setText(names, labels.map((l) => l.text).join(' · '));
      viewBtn.hidden = !labels.length || typeof sctx.openOptics !== 'function';
      viewBtn.setAttribute('aria-label', `View the ${labels.length} pinned labels on the frame`);
      el.hidden = status === 'error' && !labels.length && !(Array.isArray(s.warnings) && s.warnings.length);
    },
  };
}

export function createFrameSegmentView() {
  const img = h('img', { alt: '', attrs: { decoding: 'async' } });
  const caption = h('span', { class: 'frame-seg-caption' });
  const el = h('div', { class: 'seg seg-frame', attrs: { 'data-testid': 'segment-frame' } }, h('span', { class: 'frame-seg-thumb' }, img), caption);
  return {
    kind: 'frame',
    el,
    live: null,
    update(s) {
      const src = safeThumb(s.thumb);
      if (src) img.src = src;
      img.hidden = !src;
      setText(caption, `Jarvis looked through the camera · ${s.frameId || ''}${s.reason ? ` · ${s.reason}` : ''}`);
    },
  };
}
