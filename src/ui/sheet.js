// Accessible sheets: bottom sheet, full-screen sheet (centered dialog on desktop) and
// left drawer. One stack for the whole app: Esc and backdrop close the top sheet, the
// app shell and lower sheets are made inert, focus is trapped inside the top sheet and
// returned to the opener on close. Bottom sheets can be dragged down to dismiss; the
// drawer can be swiped left.
//
//   initSheets({ layer, shell })            once at boot
//   const s = createSheet({ kind: 'bottom', title: 'Mission Control', testid: 'x' });
//   s.body.append(content); s.open(); … s.close();

import { h, on } from './dom.js';
import { icon } from './icons.js';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

const stack = [];
let layerEl = null;
let shellEls = [];
let keyListening = false;
let uid = 0;

/** Tell the sheet manager where sheets live and which elements to make inert. */
export function initSheets({ layer, shell }) {
  layerEl = layer;
  shellEls = (Array.isArray(shell) ? shell : [shell]).filter(Boolean);
  if (!keyListening) {
    keyListening = true;
    document.addEventListener('keydown', onKeyDown, true);
  }
}

/** True while any sheet is open. */
export function anySheetOpen() {
  return stack.length > 0;
}

/** The top-most open sheet controller (or null). */
export function topSheet() {
  return stack.length ? stack[stack.length - 1] : null;
}

function onKeyDown(e) {
  const top = topSheet();
  if (!top) return;
  if (e.key === 'Escape' && !e.defaultPrevented) {
    if (top.dismissible) {
      e.preventDefault();
      e.stopPropagation();
      top.close('escape');
    }
    return;
  }
  if (e.key === 'Tab') trapFocus(e, top.panel);
}

function focusablesIn(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.closest('[inert]')) return false;
    if (el.hidden || el.closest('[hidden]')) return false;
    const r = el.getClientRects();
    return r.length > 0;
  });
}

function trapFocus(e, panel) {
  const items = focusablesIn(panel);
  if (!items.length) {
    e.preventDefault();
    panel.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !panel.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

function syncInert() {
  const anyOpen = stack.length > 0;
  for (const el of shellEls) {
    if (anyOpen) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }
  stack.forEach((s, i) => {
    if (i < stack.length - 1) s.wrap.setAttribute('inert', '');
    else s.wrap.removeAttribute('inert');
  });
  document.documentElement.classList.toggle('has-sheet', anyOpen);
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Create a sheet (not yet open).
 * @param {object} o
 * @param {'bottom'|'full'|'left'} [o.kind]
 * @param {string} [o.title]        visible title (also the accessible name)
 * @param {string} [o.label]        accessible name when there is no visible title
 * @param {string} [o.testid]       data-testid on the dialog panel
 * @param {string} [o.closeTestid]  data-testid on the close button (default 'sheet-close')
 * @param {string} [o.className]    extra class on the panel
 * @param {boolean} [o.tall]        bottom sheet at 92% height (otherwise fits content)
 * @param {boolean} [o.dismissible] Esc / backdrop / drag close it (default true)
 * @param {boolean} [o.showClose]   show the header close button (default = dismissible)
 * @param {boolean} [o.header]      render the header row (default true)
 * @param {Node[]}  [o.headerExtra] nodes placed before the close button
 * @param {() => (HTMLElement|null)} [o.initialFocus]
 * @param {(reason: string) => void} [o.onClose]
 */
export function createSheet(o = {}) {
  const kind = o.kind || 'bottom';
  const dismissible = o.dismissible !== false;
  const showClose = o.showClose !== undefined ? o.showClose : dismissible;
  const titleId = `sheet-title-${++uid}`;
  let state = 'closed';
  let returnFocus = null;
  let closeTimer = 0;

  const titleEl = h('h2', { class: 'sheet-title', id: titleId, text: o.title || '' });
  const closeBtn = showClose
    ? h(
        'button',
        {
          class: 'icon-btn sheet-close',
          type: 'button',
          attrs: { 'aria-label': 'Close', 'data-testid': o.closeTestid || 'sheet-close' },
          on: { click: () => api.close('button') },
        },
        icon('close', { size: 20 }),
      )
    : null;
  const head =
    o.header === false
      ? null
      : h('header', { class: 'sheet-head' }, kind === 'bottom' ? h('div', { class: 'sheet-grab', attrs: { 'aria-hidden': 'true' } }) : null, h('div', { class: 'sheet-head-row' }, titleEl, h('div', { class: 'sheet-head-actions' }, o.headerExtra || null, closeBtn)));
  const body = h('div', { class: 'sheet-body' });
  const panel = h(
    'div',
    {
      class: ['sheet', `sheet--${kind}`, o.tall && 'sheet--tall', o.className],
      tabIndex: -1,
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': o.title && head ? titleId : null,
        'aria-label': !o.title || !head ? o.label || o.title || 'Dialog' : null,
        'data-testid': o.testid || null,
      },
    },
    head,
    body,
  );
  const backdrop = h('div', {
    class: 'sheet-backdrop',
    attrs: { 'aria-hidden': 'true' },
    on: {
      click: () => {
        if (dismissible) api.close('backdrop');
      },
    },
  });
  const wrap = h('div', { class: ['sheet-wrap', `sheet-wrap--${kind}`], dataset: { state: 'closed' } }, backdrop, panel);

  if (dismissible) setupDrag();

  const api = {
    el: panel,
    panel,
    body,
    head,
    wrap,
    titleEl,
    dismissible,
    get kind() {
      return kind;
    },
    isOpen: () => state === 'open' || state === 'opening',
    setTitle(text) {
      titleEl.textContent = text || '';
    },
    open() {
      if (state === 'open' || state === 'opening') return api;
      clearTimeout(closeTimer);
      if (!layerEl) layerEl = document.body;
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!wrap.isConnected) layerEl.appendChild(wrap);
      if (!stack.includes(api)) stack.push(api);
      syncInert();
      state = 'opening';
      wrap.dataset.state = 'opening';
      // Two frames so the closed styles are applied before transitioning to open.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (state !== 'opening') return;
          state = 'open';
          wrap.dataset.state = 'open';
        }),
      );
      const target = (o.initialFocus && o.initialFocus()) || null;
      try {
        (target || panel).focus({ preventScroll: true });
      } catch {
        /* element not focusable */
      }
      return api;
    },
    close(reason = 'program') {
      if (state === 'closed' || state === 'closing') return;
      state = 'closing';
      wrap.dataset.state = 'closing';
      wrap.style.removeProperty('--drag');
      const idx = stack.indexOf(api);
      if (idx >= 0) stack.splice(idx, 1);
      syncInert();
      const finish = () => {
        if (state !== 'closing') return;
        state = 'closed';
        wrap.dataset.state = 'closed';
        wrap.remove();
      };
      closeTimer = setTimeout(finish, reducedMotion() ? 0 : 320);
      // Return focus to the opener (or the top sheet) if it is still usable.
      const top = topSheet();
      const back = returnFocus && returnFocus.isConnected && !returnFocus.closest('[inert]') ? returnFocus : top ? top.panel : null;
      if (back) {
        try {
          back.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
      returnFocus = null;
      if (typeof o.onClose === 'function') {
        try {
          o.onClose(reason);
        } catch (err) {
          console.error('[jarvis] sheet onClose failed:', err);
        }
      }
    },
  };

  // ---- drag to dismiss ------------------------------------------------------------
  function setupDrag() {
    if (kind === 'full') return;
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let dragging = false;
    let decided = false;
    let pointerId = null;
    let delta = 0;

    const surface = kind === 'bottom' ? head : panel;
    if (!surface) return;

    // A drawer can be swiped closed from anywhere on it, rows included (the History list is
    // all buttons); a swipe that started on a button doesn't also click it (see end()).
    const noDrag = kind === 'left' ? 'input, select, textarea, [role="switch"]' : 'button, a, input, select, textarea, [role="switch"]';
    const swallowClick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };

    on(surface, 'pointerdown', (e) => {
      if (e.button !== 0 || state !== 'open') return;
      if (e.target.closest(noDrag)) return;
      startX = e.clientX;
      startY = e.clientY;
      startT = performance.now();
      dragging = false;
      decided = false;
      delta = 0;
      pointerId = e.pointerId;
    });
    on(surface, 'pointermove', (e) => {
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        decided = true;
        dragging = kind === 'bottom' ? Math.abs(dy) > Math.abs(dx) && dy > 0 : Math.abs(dx) > Math.abs(dy) && dx < 0;
        if (!dragging) {
          pointerId = null;
          return;
        }
        try {
          surface.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        wrap.classList.add('is-dragging');
      }
      if (!dragging) return;
      delta = kind === 'bottom' ? Math.max(0, dy) : Math.min(0, dx);
      wrap.style.setProperty('--drag', `${delta}px`);
    });
    const end = (e) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      if (!dragging) return;
      dragging = false;
      wrap.classList.remove('is-dragging');
      surface.addEventListener('click', swallowClick, true);
      setTimeout(() => surface.removeEventListener('click', swallowClick, true), 0);
      const dt = Math.max(1, performance.now() - startT);
      const size = kind === 'bottom' ? panel.getBoundingClientRect().height : panel.getBoundingClientRect().width;
      const fast = Math.abs(delta) / dt > 0.6;
      if (Math.abs(delta) > Math.min(140, size * 0.3) || (fast && Math.abs(delta) > 40)) {
        api.close('drag');
      } else {
        wrap.style.removeProperty('--drag');
      }
    };
    on(surface, 'pointerup', end);
    on(surface, 'pointercancel', end);
  }

  return api;
}
