// The blueprint viewer as a full-screen overlay (in the main bundle). The viewer component and the
// SVG sheet renderer (viewer.js, svg.js) are a lazily imported chunk, like the 3D renderer.
//
//   const v = openBlueprintViewer({ source, deps })
//     source: { segment, conversationId, turnId, run? }  a live or finished draw_blueprint segment
//           | { item }                                   a saved library item
//     deps:   { library: { get(id), setThumbnail(id, dataUrl) }, onClose() }
//   v.update(segment)   a newer copy of the followed segment (live drawing while the input streams)
//   v.close()  v.isOpen()
//   getBlueprintViewer()  the open blueprint viewer or null
//   loadBlueprintModule() the lazy chunk (viewer, renderer, exports, thumbnails)
//
// The sheet is redrawn about 4 times a second while Jarvis is still writing it, keeping the zoom.
// Once a finished sheet is saved without a thumbnail, one is made from the SVG (PNG, else JPEG,
// at most 60 KB) for the library and the chat card.

import { h, setText } from '../dom.js';
import { icon } from '../icons.js';
import { openOverlay } from '../overlay.js';

const LIVE_INTERVAL = 250;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

let modulePromise = null;
export function loadBlueprintModule() {
  if (!modulePromise) {
    modulePromise = import('./viewer.js').catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

let active = null;
export function getBlueprintViewer() {
  return active && active.isOpen() ? active : null;
}

function modelOf(source) {
  if (source && isObj(source.item)) {
    const it = source.item;
    return { spec: isObj(it.spec) ? it.spec : null, status: 'done', libraryId: typeof it.id === 'string' ? it.id : null, segmentId: typeof it.segmentId === 'string' ? it.segmentId : null, fromLibrary: true, title: typeof it.title === 'string' ? it.title : '' };
  }
  const seg = source && isObj(source.segment) ? source.segment : {};
  return {
    spec: isObj(seg.spec) ? seg.spec : null,
    status: seg.status === 'building' || seg.status === 'error' ? seg.status : 'done',
    libraryId: typeof seg.libraryId === 'string' ? seg.libraryId : null,
    segmentId: typeof seg.id === 'string' ? seg.id : null,
    fromLibrary: !!seg.fromLibrary,
    title: typeof seg.title === 'string' ? seg.title : '',
  };
}

/** Make and store a library thumbnail for a finished, saved blueprint that has none. */
export async function ensureBlueprintThumbnail({ id, spec, library, svg = null }) {
  if (!id || !library || typeof library.setThumbnail !== 'function') return null;
  const item = typeof library.get === 'function' ? await library.get(id) : null;
  if (!item || item.thumbnail || item.thumb) return null;
  const mod = await loadBlueprintModule();
  const sheet = svg || mod.renderBlueprint(spec || item.spec, {});
  const url = await mod.thumbnail(sheet, { width: 320, maxChars: 60000 });
  if (url) await library.setThumbnail(id, url);
  return url;
}

export function openBlueprintViewer({ source, deps = {} } = {}) {
  if (active) active.close();
  let model = modelOf(source);
  let viewer = null;
  let disposed = false;
  let thumbDone = false;
  const offs = [];

  const liveText = h('span', { text: 'Drawing…' });
  const live = h('div', { class: 'bpo__live', hidden: true, attrs: { role: 'status', 'data-testid': 'blueprint-live' } }, h('span', { class: 'bpo__live-dot', attrs: { 'aria-hidden': 'true' } }), liveText);
  const loadingText = h('span', { text: 'Preparing the drawing…' });
  const loading = h('div', { class: 'bpo__loading', attrs: { role: 'status' } }, h('span', { class: 'hv__loading-ring', attrs: { 'aria-hidden': 'true' } }), loadingText);
  const fallbackClose = h('button', { class: 'hv__iconbtn bpo__close', type: 'button', attrs: { 'aria-label': 'Close blueprint', 'data-testid': 'blueprint-close' }, on: { click: () => api.close() } }, icon('close', { size: 20 }));
  const host = h('div', { class: 'bpo__host' });
  const el = h('div', { class: 'bpo', attrs: { 'data-testid': 'blueprint-overlay', 'aria-label': 'Blueprint' } }, host, loading, fallbackClose, live);
  const overlay = openOverlay({ el, onEscape: () => api.close(), initialFocus: () => el.querySelector('[data-testid="blueprint-close"]') });

  function syncLive() {
    const building = model.status === 'building';
    live.hidden = !(building || model.status === 'error');
    live.dataset.state = model.status;
    const n = model.spec && Array.isArray(model.spec.parts) ? model.spec.parts.length : 0;
    setText(liveText, building ? `Drawing…${n ? ` · ${n} part${n === 1 ? '' : 's'}` : ''}` : model.status === 'error' ? 'Incomplete: the drawing stopped before it finished' : '');
    el.dataset.state = model.status;
    el.dataset.model = model.libraryId || '';
  }

  async function start() {
    let mod;
    try {
      mod = await loadBlueprintModule();
    } catch (err) {
      console.error('[jarvis] the blueprint viewer could not load:', err);
      setText(loadingText, 'The blueprint viewer couldn’t load. Check your connection and try again.');
      return;
    }
    if (disposed) return;
    viewer = mod.createBlueprintViewer({ spec: model.spec || {}, partial: model.status !== 'done', onClose: () => api.close() });
    host.append(viewer.el);
    loading.hidden = true;
    fallbackClose.remove(); // the viewer has its own close button
    syncLive();
    maybeThumbnail();
  }

  async function maybeThumbnail() {
    if (thumbDone || disposed || !viewer || model.status !== 'done' || !model.libraryId) return;
    thumbDone = true;
    try {
      await ensureBlueprintThumbnail({ id: model.libraryId, spec: viewer.spec, library: deps.library, svg: viewer.svg });
    } catch (err) {
      console.warn('[jarvis] blueprint thumbnail failed:', err && err.message);
    }
  }

  let timer = 0;
  let last = 0;
  let pending = null;
  function flush() {
    timer = 0;
    last = performance.now();
    const seg = pending;
    pending = null;
    if (!seg || disposed) return;
    model = { ...modelOf({ segment: seg }), fromLibrary: model.fromLibrary };
    if (viewer && model.spec) safe(() => viewer.update(model.spec, { partial: model.status !== 'done' }));
    syncLive();
    maybeThumbnail();
  }
  function onSegment(seg) {
    if (disposed || !isObj(seg) || seg.kind !== 'blueprint' || seg.id !== model.segmentId) return;
    pending = seg;
    const wait = LIVE_INTERVAL - (performance.now() - last);
    if (seg.status !== 'building' || wait <= 0) {
      clearTimeout(timer);
      flush();
    } else if (!timer) timer = setTimeout(flush, wait);
  }
  if (source && source.run && typeof source.run.on === 'function' && model.status === 'building') {
    safe(() => offs.push(source.run.on('segment', (evt) => onSegment(evt && evt.segment))));
    safe(() =>
      offs.push(
        source.run.on('end', (evt) => {
          const turn = evt && evt.turn;
          const seg = turn && Array.isArray(turn.segments) ? turn.segments.find((s) => isObj(s) && s.id === model.segmentId) : null;
          if (seg) onSegment(seg);
        }),
      ),
    );
  }

  const api = {
    el,
    get modelId() {
      return model.libraryId;
    },
    get segmentId() {
      return model.segmentId;
    },
    isOpen: () => !disposed,
    update: (seg) => onSegment(seg),
    close() {
      if (disposed) return;
      disposed = true;
      if (active === api) active = null;
      clearTimeout(timer);
      for (const off of offs) safe(() => typeof off === 'function' && off());
      if (viewer) safe(() => viewer.destroy());
      overlay.close();
      if (typeof deps.onClose === 'function') safe(() => deps.onClose());
    },
  };
  active = api;
  syncLive();
  start();
  return api;
}
