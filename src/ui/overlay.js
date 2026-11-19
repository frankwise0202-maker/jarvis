// Full-screen overlays above the whole app: the hologram viewer, the blueprint viewer and the photo
// viewer. One stack for all of them (separate from sheet.js, whose sheets live inside the app):
//
//   const ov = openOverlay({ el, label, onEscape, initialFocus });  // mounts el on <body>
//   ov.close();  ov.isTop();  isOverlayOpen();  topOverlay()
//
// While an overlay is open everything else in <body> (the app with its sheets, a lower overlay) is
// inert, so a sheet opened before (the Blueprints library) waits underneath, untouched, and is
// usable again when the overlay closes. The top overlay gets Escape and a Tab focus trap, handled
// on window in the capture phase so sheet.js (listening on document) never acts on a sheet that is
// covered. Focus returns to the opener on close. Overlays may close in any order.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack = [];
let listening = false;

export function isOverlayOpen() {
  return stack.length > 0;
}

export function topOverlay() {
  return stack.length ? stack[stack.length - 1] : null;
}

function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => !el.closest('[inert]') && !el.closest('[hidden]') && el.getClientRects().length > 0);
}

function onKeyDown(e) {
  const top = topOverlay();
  if (!top) return;
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.stopPropagation(); // never reaches sheet.js or the app's shortcuts
    if (e.defaultPrevented) return; // a control inside the overlay used it (closing a panel first)
    e.preventDefault();
    if (top.onEscape) top.onEscape(e);
    return;
  }
  if (e.key === 'Tab') {
    e.stopPropagation();
    const items = focusables(top.el);
    if (!items.length) {
      e.preventDefault();
      top.el.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !top.el.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !top.el.contains(active))) {
      e.preventDefault();
      first.focus();
    }
    return;
  }
  // App shortcuts (new chat, focus the composer) act on the covered app: not while an overlay is up.
  const mod = e.metaKey || e.ctrlKey;
  if (mod && (e.key === 'k' || e.key === 'K')) {
    e.stopPropagation();
    e.preventDefault();
  }
}

/**
 * Mount `el` (a full-screen element; give it position: fixed) above everything.
 * opts: label (accessible name, when el has none), onEscape(e), initialFocus: () => element.
 */
export function openOverlay({ el, label, onEscape, initialFocus } = {}) {
  if (!el) throw new Error('openOverlay needs an element');
  if (!listening) {
    listening = true;
    window.addEventListener('keydown', onKeyDown, true);
  }
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  if (label && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', label);
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
  document.body.appendChild(el);

  const entry = { el, onEscape, inerted: [], closed: false };
  for (const child of Array.from(document.body.children)) {
    if (child === el || child.inert || child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'TEMPLATE') continue;
    child.inert = true;
    entry.inerted.push(child);
  }
  stack.push(entry);
  document.documentElement.classList.add('has-overlay');

  const target = (initialFocus && initialFocus()) || el;
  try {
    target.focus({ preventScroll: true });
  } catch {
    /* not focusable */
  }

  const api = {
    el,
    isTop: () => topOverlay() === entry,
    close() {
      if (entry.closed) return;
      entry.closed = true;
      const idx = stack.indexOf(entry);
      if (idx >= 0) stack.splice(idx, 1);
      // Closed out of order: the overlay above inherits what this one made inert, so the app
      // stays covered until the last overlay is gone.
      const above = idx >= 0 && idx < stack.length ? stack[idx] : null;
      for (const node of entry.inerted) {
        if (!node.isConnected) continue;
        if (above && node !== above.el) above.inerted.push(node);
        else node.inert = false;
      }
      entry.inerted = [];
      el.remove();
      if (!stack.length) document.documentElement.classList.remove('has-overlay');
      const top = topOverlay();
      const back = returnFocus && returnFocus.isConnected && !returnFocus.closest('[inert]') ? returnFocus : top ? top.el : null;
      if (back) {
        try {
          back.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    },
  };
  return api;
}
