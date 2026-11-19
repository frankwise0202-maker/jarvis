// The Blueprints library: every saved hologram and blueprint, reopened for free.
//
//   const view = createLibraryView({ lib, thumbs, onOpen, toast })
//     lib:    { list({ kind, limit }), get(id), remove(id), onChange(cb) }   (src/platform/library.js)
//     thumbs: createThumbs(lib) (thumbnails, made on demand for items that have none)
//     onOpen(item)   open a full item (with its spec) in the hologram or blueprint viewer
//   view.el, view.refresh(), view.destroy()
//
// Each item: thumbnail, kind, title, what it shows (parts or steps), when it was saved, and Open,
// Download (blueprints as SVG, holograms as a PNG picture) and Delete (tap again to confirm).
// Titles are saved model text: shown with textContent only.

import { h, setText, clear } from './dom.js';
import { icon } from './icons.js';
import { thumbnailOf } from './thumbs.js';
import { renderHologramImage } from './hologram/viewer.js';
import { loadBlueprintModule } from './blueprint/open.js';

const CONFIRM_MS = 4000;
const LIMIT = 500;
const SHEET_LABELS = { part: 'Part drawing', cutaway: 'Cutaway', exploded: 'Exploded view', process: 'Process sheet', assembly: 'Assembly drawing' };
const FILTERS = [
  ['all', 'All'],
  ['hologram', 'Holograms'],
  ['blueprint', 'Blueprints'],
];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const dateFmt = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return { format: (d) => new Date(d).toDateString() };
  }
})();

function slug(text) {
  return (
    String(text || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'hologram'
  );
}

function saveDataUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** What a row says under its title: "43 parts · 19 Nov 2026". */
function metaLine(item) {
  const st = isObj(item.stats) ? item.stats : {};
  const bits = [];
  if (item.kind === 'blueprint') {
    const steps = num(st.steps);
    const parts = num(st.parts) || num(st.callouts);
    if (steps) bits.push(`${steps} step${steps === 1 ? '' : 's'}`);
    else if (parts) bits.push(`${parts} part${parts === 1 ? '' : 's'}`);
  } else {
    const parts = num(st.parts);
    if (parts) bits.push(`${parts} part${parts === 1 ? '' : 's'}`);
  }
  const at = num(item.createdAt) || num(item.updatedAt);
  if (at) bits.push(dateFmt.format(at));
  return bits.join(' · ');
}

function kindLabel(item) {
  if (item.kind === 'blueprint') {
    const sheet = txt(item.sheet) || (isObj(item.spec) ? txt(item.spec.sheet) : '');
    return `Blueprint${SHEET_LABELS[sheet] ? ` · ${SHEET_LABELS[sheet]}` : ''}`;
  }
  return 'Hologram';
}

/** Download a saved item: a blueprint as SVG, a hologram as a PNG picture. */
export async function downloadLibraryItem(full) {
  if (!isObj(full) || !isObj(full.spec)) throw new Error('This item has nothing to download.');
  if (full.kind === 'blueprint') {
    const mod = await loadBlueprintModule();
    return mod.downloadSVG(full.spec, {});
  }
  const url = await renderHologramImage(full.spec, { width: 1600, height: 1200, type: 'image/png' });
  if (!url) throw new Error('This device can’t render the hologram as a picture.');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `jarvis-hologram-${slug(full.title || full.spec.title)}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.png`;
  saveDataUrl(url, name);
  return name;
}

export function createLibraryView({ lib, thumbs, onOpen, toast } = {}) {
  let items = [];
  let filter = 'all';
  let confirming = null; // { id, timer }
  let loaded = false;
  let destroyed = false;
  const say = (msg, opts) => {
    try {
      if (toast) toast(msg, opts);
    } catch {
      /* ignore */
    }
  };

  const filterBtns = FILTERS.map(([id, label]) =>
    h('button', {
      class: 'lib-filter',
      type: 'button',
      text: label,
      attrs: { 'aria-pressed': String(id === filter), 'data-testid': `library-filter-${id}` },
      on: {
        click: () => {
          filter = id;
          for (const b of filterBtns) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
          render();
        },
      },
      dataset: { filter: id },
    }),
  );
  const list = h('div', { class: 'lib-list', attrs: { role: 'list' } });
  const foot = h('p', { class: 'lib-foot' });
  const el = h(
    'div',
    { class: 'lib' },
    h('p', { class: 'lib-intro', text: 'Holograms and blueprints Jarvis made for you, saved on this device. Reopening one is free.' }),
    h('div', { class: 'lib-filters', attrs: { role: 'group', 'aria-label': 'Show' } }, filterBtns),
    list,
    foot,
  );

  function cancelConfirm() {
    if (!confirming) return;
    clearTimeout(confirming.timer);
    const row = list.querySelector(`[data-id="${CSS && CSS.escape ? CSS.escape(confirming.id) : confirming.id}"]`);
    confirming = null;
    if (row) setConfirm(row, false);
  }

  function setConfirm(row, on) {
    row.classList.toggle('is-confirming', on);
    const del = row.querySelector('.lib-del');
    if (!del) return;
    del.setAttribute('aria-label', on ? 'Confirm delete' : 'Delete');
    del.replaceChildren(on ? h('span', { class: 'lib-del-text', text: 'Delete' }) : icon('trash', { size: 18 }));
  }

  async function onDelete(item, row) {
    if (confirming && confirming.id === item.id) {
      clearTimeout(confirming.timer);
      confirming = null;
      row.classList.add('is-removing');
      try {
        await lib.remove(item.id);
        items = items.filter((x) => x.id !== item.id);
        render();
        say('Deleted from your library.', { level: 'success', id: 'library' });
      } catch (err) {
        console.error('[jarvis] library delete failed:', err);
        row.classList.remove('is-removing');
        setConfirm(row, false);
        say('That item couldn’t be deleted.', { level: 'warn', id: 'library' });
      }
      return;
    }
    cancelConfirm();
    confirming = { id: item.id, timer: setTimeout(cancelConfirm, CONFIRM_MS) };
    setConfirm(row, true);
  }

  async function full(item) {
    const it = await lib.get(item.id);
    if (!it || !isObj(it.spec)) throw new Error('This item couldn’t be read. It may have been deleted.');
    return it;
  }

  async function open(item, btn) {
    if (btn) btn.disabled = true;
    try {
      const it = await full(item);
      if (onOpen) onOpen(it);
    } catch (err) {
      say((err && err.message) || 'That item couldn’t be opened.', { level: 'warn', id: 'library' });
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function download(item, btn) {
    if (btn) btn.disabled = true;
    try {
      await downloadLibraryItem(await full(item));
    } catch (err) {
      say((err && err.message) || 'The download failed.', { level: 'warn', id: 'library' });
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function thumbNode(item) {
    const box = h('div', { class: ['lib-thumb', `lib-thumb--${item.kind === 'blueprint' ? 'blueprint' : 'hologram'}`] }, h('span', { class: 'lib-thumb-glyph', attrs: { 'aria-hidden': 'true' } }, icon(item.kind === 'blueprint' ? 'blueprint' : 'hologram', { size: 26 })));
    const show = (url) => {
      if (!url || destroyed) return;
      const img = h('img', { alt: '', attrs: { decoding: 'async' } });
      img.src = url;
      box.replaceChildren(img);
      box.classList.add('has-img');
    };
    const inline = thumbnailOf(item);
    if (inline) show(inline);
    else if (thumbs) thumbs.ensure(item.id).then(show, () => {});
    return box;
  }

  function renderRow(item) {
    const isBp = item.kind === 'blueprint';
    const partOf = isObj(item.parent) && txt(item.partName) ? item.partName : '';
    const openBtn = h('button', { class: 'btn btn-primary btn-sm lib-open', type: 'button', attrs: { 'data-testid': 'library-open', 'aria-label': `Open ${txt(item.title) || 'item'}` } }, icon(isBp ? 'blueprint' : 'hologram', { size: 16 }), h('span', { text: 'Open' }));
    const dlBtn = h('button', { class: 'icon-btn lib-dl', type: 'button', attrs: { 'data-testid': 'library-download', 'aria-label': isBp ? 'Download as SVG' : 'Download as a PNG picture', title: isBp ? 'Download SVG' : 'Download PNG' } }, icon('download', { size: 18 }));
    const row = h(
      'article',
      { class: ['lib-item', `lib-item--${isBp ? 'blueprint' : 'hologram'}`], attrs: { role: 'listitem', 'data-testid': 'library-item', 'data-id': item.id, 'data-kind': isBp ? 'blueprint' : 'hologram' } },
      thumbNode(item),
      h(
        'div',
        { class: 'lib-body' },
        h('p', { class: 'lib-kind', text: kindLabel(item) }),
        h('h3', { class: 'lib-title', text: txt(item.title) || (isBp ? 'Blueprint' : 'Hologram') }),
        txt(item.subject) && txt(item.subject) !== txt(item.title) ? h('p', { class: 'lib-subject', text: txt(item.subject) }) : null,
        partOf ? h('p', { class: 'lib-subject', text: `Part · ${partOf}` }) : null,
        h('p', { class: 'lib-meta', text: metaLine(item) }),
      ),
      h('div', { class: 'lib-actions' }, openBtn, dlBtn, h('button', { class: 'icon-btn lib-del', type: 'button', attrs: { 'data-testid': 'library-delete', 'aria-label': 'Delete', title: 'Delete' } }, icon('trash', { size: 18 }))),
    );
    openBtn.addEventListener('click', () => open(item, openBtn));
    dlBtn.addEventListener('click', () => download(item, dlBtn));
    row.querySelector('.lib-del').addEventListener('click', () => onDelete(item, row));
    return row;
  }

  function render() {
    if (destroyed) return;
    cancelConfirm();
    const shown = filter === 'all' ? items : items.filter((it) => it.kind === filter);
    clear(list);
    if (!loaded) {
      list.append(h('p', { class: 'lib-empty', text: 'Loading…' }));
    } else if (!shown.length) {
      list.append(
        h(
          'div',
          { class: 'lib-empty', attrs: { 'data-testid': 'library-empty' } },
          icon('hologram', { size: 28 }),
          h('p', { class: 'lib-empty-title', text: items.length ? 'Nothing of this kind yet.' : 'Nothing saved yet.' }),
          h('p', { text: 'Ask Jarvis to show you something (“Show me how an alternator works”) or run the Blueprint protocol. Every hologram and blueprint is saved here.' }),
        ),
      );
    } else {
      for (const it of shown) list.append(renderRow(it));
    }
    const holos = items.filter((it) => it.kind === 'hologram').length;
    const bps = items.length - holos;
    setText(foot, loaded ? `${holos} hologram${holos === 1 ? '' : 's'} · ${bps} blueprint${bps === 1 ? '' : 's'} · stored on this device` : '');
  }

  async function refresh() {
    if (!lib || typeof lib.list !== 'function') {
      loaded = true;
      items = [];
      render();
      return;
    }
    try {
      const rows = await lib.list({ limit: LIMIT });
      items = (Array.isArray(rows) ? rows : []).filter((r) => isObj(r) && typeof r.id === 'string' && (r.kind === 'hologram' || r.kind === 'blueprint'));
    } catch (err) {
      console.error('[jarvis] listing the library failed:', err);
      items = [];
    }
    loaded = true;
    render();
  }

  /** A new thumbnail: swap that row's picture only (a full re-render would cancel a pending Delete). */
  function refreshThumb(id) {
    const row = Array.from(list.querySelectorAll('.lib-item')).find((r) => r.dataset.id === id);
    if (!row || !thumbs) return;
    thumbs.get(id).then((url) => {
      const box = row.querySelector('.lib-thumb');
      if (!url || !box || destroyed) return;
      const img = h('img', { alt: '', attrs: { decoding: 'async' } });
      img.src = url;
      box.replaceChildren(img);
      box.classList.add('has-img');
    }, () => {});
  }

  let off = null;
  if (lib && typeof lib.onChange === 'function') {
    try {
      off = lib.onChange((change) => {
        if (change && change.type === 'thumbnail' && typeof change.id === 'string') refreshThumb(change.id);
        else refresh();
      });
    } catch {
      off = null;
    }
  }

  render();
  refresh();

  return {
    el,
    refresh,
    destroy() {
      destroyed = true;
      cancelConfirm();
      if (typeof off === 'function') off();
    },
  };
}
