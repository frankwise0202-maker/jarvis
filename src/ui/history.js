// Conversation history: search, groups (Today / Yesterday / Previous 7 days / Older),
// open, delete (tap the trash, then tap again to confirm), and New chat. The same
// element is shown in the phone drawer and in the desktop sidebar.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { listProtocols } from './protocols.js';

const DAY = 86400000;
const CONFIRM_MS = 4000;

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupOf(updatedAt, now) {
  const today = startOfDay(now);
  if (updatedAt >= today) return 'Today';
  if (updatedAt >= today - DAY) return 'Yesterday';
  if (updatedAt >= today - 7 * DAY) return 'Previous 7 days';
  return 'Older';
}

const timeFmt = safeFormat({ hour: 'numeric', minute: '2-digit' });
const dayFmt = safeFormat({ weekday: 'short' });
const dateFmt = safeFormat({ day: 'numeric', month: 'short' });
const yearFmt = safeFormat({ day: 'numeric', month: 'short', year: 'numeric' });

function safeFormat(opts) {
  try {
    return new Intl.DateTimeFormat(undefined, opts);
  } catch {
    return { format: (d) => new Date(d).toLocaleString() };
  }
}

function whenLabel(t, group, now) {
  if (!t) return '';
  if (group === 'Today' || group === 'Yesterday') return timeFmt.format(t);
  if (group === 'Previous 7 days') return dayFmt.format(t);
  return new Date(t).getFullYear() === new Date(now).getFullYear() ? dateFmt.format(t) : yearFmt.format(t);
}

/**
 * @param {object} o
 * @param {(id: string) => void} o.onSelect
 * @param {() => void} o.onNew
 * @param {(id: string) => Promise<void>|void} o.onDelete
 * @param {(id: string) => boolean} [o.isRunning]
 * @param {() => void} [o.onCollapse]   desktop sidebar collapse
 * @param {() => void} [o.onLibrary]    opens the Blueprints library (saved holograms and blueprints)
 */
export function createHistory(o) {
  let items = [];
  let activeId = null;
  let query = '';
  let confirming = null; // { id, timer }
  let persistent = true;
  let persistReason = null;
  let searchTimer = 0;

  const collapseBtn = h(
    'button',
    { class: 'icon-btn history-collapse', type: 'button', attrs: { 'aria-label': 'Hide history', title: 'Hide history' }, on: { click: () => o.onCollapse && o.onCollapse() } },
    icon('chevron-left', { size: 20 }),
  );
  const newBtn = h(
    'button',
    { class: 'btn new-chat', type: 'button', attrs: { 'data-testid': 'new-chat', title: 'New chat (Ctrl/⌘ K)' }, on: { click: () => o.onNew() } },
    icon('add-square', { size: 18 }),
    h('span', { text: 'New chat' }),
  );
  const search = h('input', {
    class: 'input history-search-input',
    type: 'search',
    placeholder: 'Search conversations',
    attrs: { 'aria-label': 'Search conversations', autocomplete: 'off', spellcheck: 'false', 'data-testid': 'history-search' },
    on: {
      input: () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          query = search.value.trim().toLowerCase();
          render();
        }, 120);
      },
      keydown: (e) => {
        if (e.key === 'Escape' && search.value) {
          e.preventDefault();
          e.stopPropagation();
          search.value = '';
          query = '';
          render();
        }
      },
    },
  });
  const list = h('div', { class: 'history-list' });
  const foot = h('div', { class: 'history-foot' });
  const libraryCount = h('span', { class: 'history-library-count' });
  const libraryBtn = o.onLibrary
    ? h(
        'button',
        { class: 'history-library', type: 'button', attrs: { 'data-testid': 'history-library', title: 'Saved holograms and blueprints' }, on: { click: () => o.onLibrary() } },
        icon('blueprint', { size: 18 }),
        h('span', { text: 'Blueprints' }),
        libraryCount,
      )
    : null;

  const el = h(
    'div',
    { class: 'history', attrs: { 'data-testid': 'history-drawer', role: 'navigation', 'aria-label': 'Conversation history' } },
    h('div', { class: 'history-head' }, h('span', { class: 'label-caps history-title', text: 'History' }), collapseBtn),
    h('div', { class: 'history-tools' }, newBtn, h('label', { class: 'history-search' }, icon('search', { size: 16, class: 'history-search-icon' }), search), libraryBtn),
    list,
    foot,
  );

  function cancelConfirm() {
    if (!confirming) return;
    clearTimeout(confirming.timer);
    const row = list.querySelector(`[data-id="${cssEscape(confirming.id)}"]`);
    confirming = null;
    if (row) setRowConfirm(row, false);
  }

  function setRowConfirm(row, on) {
    row.classList.toggle('is-confirming', on);
    const del = row.querySelector('.history-del');
    if (!del) return;
    del.setAttribute('aria-label', on ? 'Confirm delete' : 'Delete conversation');
    del.replaceChildren(on ? h('span', { class: 'history-del-text', text: 'Delete' }) : icon('trash', { size: 17 }));
  }

  async function onDeleteClick(id, row) {
    if (confirming && confirming.id === id) {
      clearTimeout(confirming.timer);
      confirming = null;
      row.classList.add('is-removing');
      try {
        await o.onDelete(id);
      } catch (err) {
        console.error('[jarvis] delete failed:', err);
        row.classList.remove('is-removing');
        setRowConfirm(row, false);
      }
      return;
    }
    cancelConfirm();
    confirming = { id, timer: setTimeout(cancelConfirm, CONFIRM_MS) };
    setRowConfirm(row, true);
  }

  function renderRow(item, group, now) {
    const running = o.isRunning ? !!o.isRunning(item.id) : false;
    const row = h(
      'div',
      {
        class: ['history-item', item.id === activeId && 'is-active', running && 'is-running'],
        attrs: { 'data-testid': 'history-item', 'data-id': item.id, role: 'listitem' },
      },
      h(
        'button',
        {
          class: 'history-open',
          type: 'button',
          attrs: { 'aria-current': item.id === activeId ? 'true' : null },
          on: { click: () => o.onSelect(item.id) },
        },
        h('span', { class: 'history-row1' }, running ? h('span', { class: 'history-live', attrs: { title: 'Working' } }) : null, h('span', { class: 'history-item-title', text: item.title || 'New conversation' }), h('span', { class: 'history-when', text: whenLabel(item.updatedAt, group, now) })),
        item.preview ? h('span', { class: 'history-preview', text: previewText(item.preview, protocolNames) }) : null,
      ),
      h(
        'button',
        {
          class: 'history-del',
          type: 'button',
          attrs: { 'data-testid': 'history-delete', 'aria-label': 'Delete conversation', title: 'Delete' },
          on: {
            click: (e) => {
              e.stopPropagation();
              onDeleteClick(item.id, row);
            },
          },
        },
        icon('trash', { size: 17 }),
      ),
    );
    return row;
  }

  let protocolNames = [];
  function render() {
    cancelConfirm();
    const now = Date.now();
    try {
      protocolNames = listProtocols().map((p) => p.name);
    } catch {
      protocolNames = [];
    }
    const filtered = query ? items.filter((it) => `${it.title || ''}\n${it.preview || ''}`.toLowerCase().includes(query)) : items;
    const groups = new Map();
    for (const it of filtered) {
      const g = groupOf(it.updatedAt || it.createdAt || 0, now);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    }
    const sections = [];
    for (const name of ['Today', 'Yesterday', 'Previous 7 days', 'Older']) {
      const rows = groups.get(name);
      if (!rows || !rows.length) continue;
      sections.push(
        h(
          'section',
          { class: 'history-group', attrs: { 'aria-label': name } },
          h('h3', { class: 'label-caps history-group-title', text: name }),
          h('div', { attrs: { role: 'list' } }, rows.map((it) => renderRow(it, name, now))),
        ),
      );
    }
    if (!sections.length) {
      sections.push(
        h(
          'div',
          { class: 'history-empty' },
          icon(query ? 'search' : 'history', { size: 22 }),
          h('p', { text: query ? 'No conversations match your search.' : 'No conversations yet.' }),
          query ? null : h('p', { class: 'history-empty-sub', text: 'Your chats are saved on this device.' }),
        ),
      );
    }
    list.replaceChildren(...sections);
    const n = items.length;
    setText(
      foot,
      persistent
        ? n
          ? `${n} conversation${n === 1 ? '' : 's'} · stored on this device`
          : 'Stored on this device only'
        : persistReason === 'quota'
          ? 'Out of storage: new conversations aren’t being saved. Free up space or export a backup.'
          : 'History can’t be saved in this browser mode (private browsing?).',
    );
    foot.classList.toggle('is-warn', !persistent);
  }

  render();

  return {
    el,
    /** Replace the list: [{ id, title, createdAt, updatedAt, preview, turnCount }] */
    setItems(next) {
      items = Array.isArray(next) ? next.slice() : [];
      render();
    },
    setActive(id) {
      if (activeId === id) return;
      activeId = id || null;
      for (const row of list.querySelectorAll('.history-item')) {
        const on = row.dataset.id === activeId;
        row.classList.toggle('is-active', on);
        const btn = row.querySelector('.history-open');
        if (btn) {
          if (on) btn.setAttribute('aria-current', 'true');
          else btn.removeAttribute('aria-current');
        }
      }
    },
    /** reason (when not persistent): 'quota' (the device is full) or 'unavailable'. */
    setPersistent(value, reason = null) {
      persistent = value !== false;
      persistReason = persistent ? null : reason;
      render();
    },
    /** Re-render live markers (running conversations). */
    refresh: render,
    focusSearch() {
      try {
        search.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    },
    setCollapsible(value) {
      collapseBtn.hidden = !value;
    },
    /** How many holograms and blueprints are saved (shown on the Blueprints row). */
    setLibraryCount(n) {
      const count = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
      setText(libraryCount, count ? String(count) : '');
      if (libraryBtn) libraryBtn.setAttribute('aria-label', count ? `Blueprints: ${count} saved` : 'Blueprints');
    },
  };
}

function cssEscape(s) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
  return String(s).replace(/["\\]/g, '\\$&');
}

/**
 * A protocol run is sent as "<headline>\n\nProtocol: <name>\n<brief>" (SPEC §14.2), which the
 * one-line preview turns into a run-on of the whole brief: show "Protocol · <headline>" instead.
 */
function previewText(preview, names) {
  const text = String(preview || '');
  const cut = text.indexOf(' Protocol: ');
  if (cut <= 0 || cut > 90) return text;
  const rest = text.slice(cut + ' Protocol: '.length);
  return names.some((n) => n && (rest === n || rest.startsWith(`${n} `))) ? `Protocol · ${text.slice(0, cut)}` : text;
}
