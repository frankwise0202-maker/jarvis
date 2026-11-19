// Reference photos UI: a strip of Wikimedia Commons results and a full-screen photo viewer with
// zoom/pan and credits. The search itself is in src/platform/photos.js.
//
//   createPhotoStrip({ search, onOpen, limit }) -> { el, search(query), destroy() }
//   createPhotoViewer({ photos, index, onClose }) -> { el, show(i), destroy() }
//
// Only https://upload.wikimedia.org images are shown (the search drops everything else); credits
// are plain text; the only links are the Commons page and the license (http/https, new tab).

import { h, clear, extLink } from './dom.js';
import { icon } from './icons.js';
import { createPanZoom } from './blueprint/panzoom.js';
import { searchPhotos, PHOTO_MESSAGES } from '../platform/photos.js';

// ---------------------------------------------------------------------------------------------
// UI: a strip of results and a full-screen viewer

/** An <img> whose referrer policy (and lazy loading) are set before its src starts the fetch. */
function img(src, alt, extra = {}) {
  const el = h('img', { alt, attrs: { referrerpolicy: 'no-referrer', decoding: 'async', ...extra } });
  if (src) el.src = src;
  return el;
}

/** Result grid. onOpen(photos, index) opens the viewer. */
export function createPhotoStrip({ search = searchPhotos, onOpen, limit = 12, searchOptions = {} } = {}) {
  let controller = null;
  let lastQuery = '';
  const count = h('span', null, '');
  const list = h('ul', { class: 'ph-strip__list', attrs: { 'data-testid': 'photo-strip-list' } });
  const status = h('div', { class: 'ph-strip__status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const el = h(
    'section',
    { class: 'ph-strip', attrs: { 'data-testid': 'photo-strip', 'aria-label': 'Reference photos from Wikimedia Commons' } },
    h('div', { class: 'ph-strip__head' }, h('span', null, 'Reference photos · Wikimedia Commons'), count),
    status,
    list,
    h('div', { class: 'ph-strip__privacy' }, 'Free photos from Wikimedia Commons. Your search words are sent to Wikimedia.'),
  );

  function setStatus(text, retry) {
    clear(status);
    status.hidden = !text;
    if (!text) return;
    status.append(text);
    if (retry) {
      status.append(' ', h('button', { type: 'button', class: 'ph-btn', style: { minWidth: '0', height: '32px', padding: '0 10px' }, on: { click: () => run(lastQuery) } }, 'Try again'));
    }
  }

  async function run(query) {
    lastQuery = query;
    if (controller) controller.abort();
    controller = new AbortController();
    const mine = controller;
    clear(list);
    count.textContent = '';
    setStatus('Searching Wikimedia Commons…');
    let photos;
    try {
      photos = await search(query, { limit, signal: mine.signal, ...searchOptions });
    } catch (err) {
      if (mine.signal.aborted) return [];
      setStatus(err && err.message ? err.message : PHOTO_MESSAGES.offline, true);
      return [];
    }
    if (mine.signal.aborted) return [];
    if (!photos.length) {
      setStatus('No free photos found for that. Try a simpler name, like "alternator".');
      return [];
    }
    setStatus('');
    count.textContent = `${photos.length} found`;
    photos.forEach((p, i) => {
      list.append(
        h(
          'li',
          null,
          h(
            'button',
            {
              class: 'ph-thumb',
              type: 'button',
              attrs: { 'data-testid': 'photo-thumb', 'aria-label': `${p.title}, photo by ${p.author}. Open.` },
              on: { click: () => onOpen && onOpen(photos, i) },
            },
            img(p.thumbUrl, '', { loading: 'lazy' }),
            h('span', { class: 'ph-thumb__credit' }, `${p.author}${p.license ? ` · ${p.license}` : ''}`),
          ),
        ),
      );
    });
    return photos;
  }

  return {
    el,
    search: run,
    destroy() {
      if (controller) controller.abort();
      el.remove();
    },
  };
}

/** Full-screen photo viewer with zoom/pan, credits and the Commons page link. */
export function createPhotoViewer({ photos = [], index = 0, onClose } = {}) {
  let current = -1;
  let pz = null;
  let loader = null;
  const kicker = h('div', { class: 'ph-viewer__kicker' });
  const title = h('div', { class: 'ph-viewer__title' });
  const picture = img('', '');
  picture.draggable = false;
  const stage = h('div', { class: 'ph-viewer__stage', attrs: { 'data-testid': 'photo-stage', 'aria-label': 'Photo. Drag to move, pinch or scroll to zoom.', role: 'group' } }, picture);
  const prev = h('button', { class: 'ph-btn ph-viewer__nav ph-viewer__nav--prev', type: 'button', attrs: { 'aria-label': 'Previous photo', 'data-testid': 'photo-prev' }, on: { click: () => show(current - 1) } }, icon('chevron-left'));
  const next = h('button', { class: 'ph-btn ph-viewer__nav ph-viewer__nav--next', type: 'button', attrs: { 'aria-label': 'Next photo', 'data-testid': 'photo-next' }, on: { click: () => show(current + 1) } }, icon('chevron-right'));
  const credit = h('div', { class: 'ph-viewer__credit', attrs: { 'data-testid': 'photo-credit' } });
  const sourceSlot = h('span', { style: { display: 'contents' } });
  const el = h(
    'div',
    { class: 'ph-viewer', attrs: { 'data-testid': 'photo-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reference photo' } },
    h(
      'header',
      { class: 'ph-viewer__bar' },
      h('div', { class: 'ph-viewer__titles' }, kicker, title),
      h(
        'div',
        { class: 'ph-viewer__tools' },
        sourceSlot,
        h('button', { class: 'ph-btn', type: 'button', attrs: { 'aria-label': 'Close photo', 'data-testid': 'photo-close' }, on: { click: () => onClose && onClose() } }, icon('close')),
      ),
    ),
    h('div', { class: 'ph-viewer__body' }, stage, prev, next),
    credit,
  );
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && onClose) onClose();
    else if (e.key === 'ArrowLeft' && pz && pz.isFitted()) show(current - 1);
    else if (e.key === 'ArrowRight' && pz && pz.isFitted()) show(current + 1);
  });

  function show(i) {
    if (!photos.length) return;
    current = (i + photos.length) % photos.length;
    const p = photos[current];
    kicker.textContent = `Reference photo · ${current + 1} of ${photos.length}`;
    title.textContent = p.title;
    prev.hidden = next.hidden = photos.length < 2;
    // Lay the picture out at a bounded size; the zoom transform does the rest.
    const k = Math.min(1, 2048 / Math.max(p.width, p.height));
    const w = Math.round(p.width * k);
    const hgt = Math.round(p.height * k);
    picture.style.width = `${w}px`;
    picture.style.height = `${hgt}px`;
    picture.alt = p.description || p.title;
    picture.src = p.thumbUrl;
    if (loader) loader.onload = null;
    if (p.fullUrl && p.fullUrl !== p.thumbUrl) {
      loader = new Image();
      loader.referrerPolicy = 'no-referrer';
      const want = current;
      loader.onload = () => {
        if (want === current) picture.src = p.fullUrl;
      };
      loader.src = p.fullUrl;
    }
    clear(sourceSlot);
    sourceSlot.append(extLink(p.pageUrl, 'Source', { class: 'ph-btn bpv__btn--text', attrs: { 'data-testid': 'photo-source', 'aria-label': 'Open the photo page on Wikimedia Commons' } }));
    clear(credit);
    const license = p.licenseUrl ? extLink(p.licenseUrl, p.license || 'License') : p.license ? h('span', null, p.license) : null;
    credit.append(
      h('div', null, h('strong', null, 'Photo: '), p.author, license ? ' · ' : '', license, ' · Wikimedia Commons'),
      p.description ? h('div', { class: 'ph-viewer__desc' }, p.description) : null,
    );
    if (!pz) {
      pz = createPanZoom(stage, {
        size: { width: w, height: hgt },
        maxZoom: 8,
        apply(view) {
          picture.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
        },
      });
    } else pz.setSize({ width: w, height: hgt }, { refit: true });
  }

  show(index);
  return {
    el,
    show,
    destroy() {
      if (pz) pz.destroy();
      if (loader) loader.onload = null;
      el.remove();
    },
  };
}
