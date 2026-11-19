// The page agent: runs inside the controlled tab, in an isolated world the service worker creates
// through the debugger (like a content script: it shares the page's DOM but none of its
// JavaScript, and the page cannot see or call it). It provides
//   - the visible control: a thin glowing border and a top bar "Jarvis is in control · Stop"
//     (Stop and the Esc key call the `__jarvisBar` binding, which reaches the service worker);
//   - page reading for the browser toolset: read_page (accessibility-style tree with refs), find,
//     get_page_text (rendered text only: most ways of hiding text from the reader are filtered);
//   - targets: resolving a ref or a viewport point to a click point plus a description of the
//     element for the safety guard, the focused field, and form_input;
//   - the activation check: while Jarvis sends a click or a key, the element that really receives
//     it is classified again (with the same guard rules as the service worker, bundled from
//     background/guard.js); a consequential element the owner did not approve is not activated.
// Bundled into an IIFE string at build time. The service worker injects it at document start in
// its isolated world (so its Esc and activation listeners come before the page's own), evaluates
// it again on the current document, and then calls globalThis.__jarvis.call(op, args).

import { classifyAction, isGenericLabel, normalizeLabel } from '../background/guard.js';

(() => {
  const VERSION = 4;
  if (globalThis.__jarvis && globalThis.__jarvis.version === VERSION) return;

  const BINDING = '__jarvisBar';
  const MAX_TEXT = 50000;
  const MAX_NAME = 100;

  const state = {
    refs: new Map(), // 'ref_12' -> WeakRef(Element)
    byEl: new WeakMap(), // Element -> 'ref_12'
    nextRef: 1,
    mode: 'hidden', // 'acting' | 'waiting' | 'hidden'
    host: null,
    bar: null,
    label: null,
    lastBeat: Date.now(),
    suppressEscUntil: 0,
    escDownAt: 0,
    shot: false,
    pendingStop: null,
    observer: null,
    watchdog: 0,
    root: null, // the overlay's inner wrapper (its state lives in the closed shadow root, not on the host)
    tamper: 0, // heartbeats in a row on which the bar was hidden or covered
    targets: new Map(), // target id -> WeakRef(Element): what resolveTarget pointed at
    nextTarget: 1,
    armed: null, // the activation check while Jarvis sends input (see arm())
  };

  // -------------------------------------------------------------------------------------------
  // Control overlay

  // The host lives in the page's DOM, so the page could restyle it. These rules sit in the closed
  // shadow root: as :host !important rules they win over the page's CSS, even !important, and over
  // inline styles the page's scripts set on the host.
  const OVERLAY_CSS = `
    :host { all: initial !important; display: block !important; visibility: visible !important; opacity: 1 !important;
      position: fixed !important; inset: 0 !important; width: auto !important; height: auto !important; margin: 0 !important;
      padding: 0 !important; border: 0 !important; background: transparent !important; overflow: visible !important;
      z-index: 2147483647 !important; pointer-events: none !important; transform: none !important; filter: none !important;
      clip-path: none !important; mask: none !important; contain: none !important; content-visibility: visible !important; }
    :host::backdrop { display: none !important; background: transparent !important; }
    .root { position: fixed; inset: 0; pointer-events: none; }
    .root.shot { visibility: hidden; }
    .frame { position: fixed; inset: 0; pointer-events: none; border-radius: 0;
      box-shadow: inset 0 0 0 2px rgba(62,224,255,0.9), inset 0 0 22px 3px rgba(62,224,255,0.42);
      animation: glow 2.4s ease-in-out infinite; }
    @keyframes glow { 50% { box-shadow: inset 0 0 0 2px rgba(138,243,255,0.95), inset 0 0 30px 5px rgba(62,224,255,0.55); } }
    .bar { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); pointer-events: auto;
      display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 6px 0 14px; box-sizing: border-box;
      border-radius: 999px; background: rgba(5,11,18,0.94); color: #e1f6ff;
      box-shadow: 0 0 0 1px rgba(98,220,255,0.55), 0 0 24px rgba(62,224,255,0.35), 0 10px 30px rgba(0,0,0,0.45);
      font: 600 13px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      letter-spacing: 0.01em; white-space: nowrap; user-select: none; -webkit-user-select: none; }
    .core { width: 10px; height: 10px; border-radius: 50%; flex: none;
      background: radial-gradient(circle at 40% 38%, #f4ffff 0, #8af3ff 38%, #3ee0ff 70%, #1aa8d6 100%);
      box-shadow: 0 0 0 2px rgba(62,224,255,0.25), 0 0 12px rgba(62,224,255,0.9); animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 50% { box-shadow: 0 0 0 4px rgba(62,224,255,0.12), 0 0 16px rgba(62,224,255,1); } }
    .name { color: #8af3ff; font: 700 11px/1 ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; letter-spacing: 0.22em; }
    .sep { color: rgba(171,200,217,0.7); }
    .stop { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 12px;
      border-radius: 999px; background: rgba(255,92,114,0.16); color: #ffd5db; box-shadow: inset 0 0 0 1px rgba(255,92,114,0.6);
      font: 700 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif; }
    .stop:hover { background: rgba(255,92,114,0.3); color: #fff; }
    .stop:focus-visible { outline: 2px solid #3ee0ff; outline-offset: 2px; }
    .sq { width: 8px; height: 8px; border-radius: 2px; background: #ff5c72; }
    .key { color: rgba(171,200,217,0.85); font: 600 10px/1 ui-monospace, "SF Mono", Menlo, monospace; padding: 3px 5px; border-radius: 4px;
      box-shadow: inset 0 0 0 1px rgba(171,200,217,0.35); }
    .root.waiting .core { background: radial-gradient(circle at 40% 38%, #fff7e6 0, #ffd98a 45%, #ffc457 100%);
      box-shadow: 0 0 0 2px rgba(255,196,87,0.25), 0 0 12px rgba(255,196,87,0.9); }
    .root.waiting .frame { box-shadow: inset 0 0 0 2px rgba(255,196,87,0.85), inset 0 0 22px 3px rgba(255,196,87,0.35); animation: none; }
    .root.pass .bar { pointer-events: none; }
    .root.shot .bar, .root.shot .frame { visibility: hidden; }
    @media (prefers-reduced-motion: reduce) { .frame, .core { animation: none; } }
  `;

  function buildOverlay() {
    const host = document.createElement('jarvis-control-overlay');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: block;';
    // In the top layer, above the page's own modal dialogs (raised again on every heartbeat).
    try {
      host.popover = 'manual';
    } catch {
      /* no popover support: the z-index still applies */
    }
    const shadow = host.attachShadow({ mode: 'closed' });
    const root = document.createElement('div');
    root.className = 'root';
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    const frame = document.createElement('div');
    frame.className = 'frame';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    const core = document.createElement('span');
    core.className = 'core';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = 'JARVIS';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'is in control';
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '·';
    const stop = document.createElement('button');
    stop.className = 'stop';
    stop.type = 'button';
    stop.setAttribute('aria-label', 'Stop Jarvis');
    const sq = document.createElement('span');
    sq.className = 'sq';
    stop.append(sq, document.createTextNode('Stop'));
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = 'esc';
    key.title = 'Press Esc to stop';
    stop.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      requestStop('bar');
    });
    // Keep page handlers from seeing (or swallowing) interactions with the bar.
    for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'dblclick']) {
      bar.addEventListener(type, (e) => e.stopPropagation());
    }
    bar.append(core, name, label, sep, stop, key);
    root.append(frame, bar);
    shadow.append(style, root);
    state.host = host;
    state.root = root;
    state.bar = bar;
    state.label = label;
    return host;
  }

  /** Puts the overlay at the top of the top layer (above dialogs the page opened since). */
  function raiseOverlay() {
    const host = state.host;
    if (!host || !host.isConnected || typeof host.showPopover !== 'function') return;
    try {
      if (host.matches(':popover-open')) host.hidePopover();
      host.showPopover();
    } catch {
      /* not allowed right now (e.g. the document is not fully active) */
    }
  }

  /**
   * Whether the owner can actually see the bar and the border: the host is connected, rendered,
   * full-size, and the first thing at the bar's position. A page cannot see inside the closed
   * shadow root, but it can try to hide or cover the host.
   */
  function overlayVisible() {
    const host = state.host;
    if (!host || !host.isConnected || !state.bar) return false;
    if (typeof host.checkVisibility === 'function' && !host.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const hr = host.getBoundingClientRect();
    const vw = document.documentElement?.clientWidth || innerWidth;
    const vh = document.documentElement?.clientHeight || innerHeight;
    if (hr.width < vw - 2 || hr.height < vh - 2) return false;
    const r = state.bar.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) return false;
    const top = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
    return top === host;
  }

  function mountOverlay() {
    if (state.mode === 'hidden') return;
    if (!state.host) buildOverlay();
    state.root.classList.toggle('waiting', state.mode === 'waiting');
    state.label.textContent = state.mode === 'waiting' ? 'is waiting for you' : 'is in control';
    const parent = document.documentElement || document.body;
    if (parent && state.host.parentNode !== parent) {
      parent.appendChild(state.host);
      raiseOverlay();
    } else if (state.host.isConnected && !state.host.matches?.(':popover-open')) raiseOverlay();
    /* global __DEV__ */
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // Development builds only: where the (closed shadow DOM) Stop button is, for the tests.
      requestAnimationFrame(() => {
        const r = state.bar?.querySelector('.stop')?.getBoundingClientRect();
        if (r && state.host) state.host.dataset.testStop = JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      });
    }
    if (!state.observer && parent) {
      // Pages that rebuild <html>'s children must not remove the control bar. (Attributes a page
      // sets on the host are put back on the next heartbeat, not here: a page observer fighting
      // this one could otherwise loop forever.)
      state.observer = new MutationObserver(() => {
        if (state.mode !== 'hidden' && state.host && !state.host.isConnected) mountOverlay();
      });
      state.observer.observe(parent, { childList: true });
    }
  }

  function restoreHost() {
    const host = state.host;
    const want = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: block;';
    for (const a of [...host.attributes]) {
      if (a.name === 'style' || a.name === 'popover' || (a.name === 'data-test-stop')) continue;
      host.removeAttribute(a.name);
    }
    if (host.getAttribute('style') !== want) host.setAttribute('style', want);
    if (host.getAttribute('popover') !== 'manual') {
      try {
        host.popover = 'manual';
      } catch {
        /* ignore */
      }
    }
    if (!host.matches?.(':popover-open')) raiseOverlay();
  }

  function unmountOverlay() {
    state.mode = 'hidden';
    state.armed = null;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.host) {
      try {
        if (state.host.matches?.(':popover-open')) state.host.hidePopover();
      } catch {
        /* ignore */
      }
      state.host.remove();
    }
    clearInterval(state.watchdog);
    state.watchdog = 0;
  }

  function setMode(mode) {
    if (mode === 'hidden') {
      unmountOverlay();
      return;
    }
    state.mode = mode === 'waiting' ? 'waiting' : 'acting';
    state.lastBeat = Date.now();
    mountOverlay();
    if (!state.watchdog) {
      // If the service worker stops sending heartbeats (it was stopped, the debugger was detached
      // from Chrome's own "cancel" button), the bar removes itself instead of lingering.
      state.watchdog = setInterval(() => {
        if (state.mode !== 'hidden' && Date.now() - state.lastBeat > 4000) unmountOverlay();
      }, 1000);
    }
  }

  // Agents in frames inside the page only listen for Esc (the service worker ignores it while
  // Jarvis is not acting); the control bar and everything else is the top frame's.
  const IN_FRAME = (() => {
    try {
      return window !== window.top;
    } catch {
      return true;
    }
  })();

  function requestStop(via) {
    if (IN_FRAME) {
      // A frame inside the page (same site): the top frame's agent decides (Jarvis acting, not
      // its own Escape) and calls the service worker.
      try {
        const top = window.top.__jarvis;
        if (top && top !== globalThis.__jarvis && typeof top.call === 'function') {
          top.call('frameStop', { via });
          return;
        }
      } catch {
        /* a frame from another site: no access to the top frame */
      }
    }
    if (state.mode === 'hidden') return;
    const payload = JSON.stringify({ type: 'stop', via });
    try {
      if (typeof globalThis[BINDING] === 'function') {
        globalThis[BINDING](payload);
        return;
      }
    } catch {
      /* fall through: the service worker reads the flag on its next call */
    }
    state.pendingStop = via;
  }

  // Esc on the page stops Jarvis. Listening on window and document, for keydown and keyup, in the
  // capture phase; injected at document start, these run before any listener the page adds.
  const onEsc = (e) => {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (state.mode === 'hidden' && !IN_FRAME) return;
    if (Date.now() < state.suppressEscUntil) return; // an Escape Jarvis itself is pressing
    if (e.type === 'keyup' && state.escDownAt && Date.now() - state.escDownAt < 3000) return; // already handled on keydown
    if (e.type === 'keydown') state.escDownAt = Date.now();
    requestStop('esc');
  };
  for (const target of [window, document]) {
    target.addEventListener('keydown', onEsc, true);
    target.addEventListener('keyup', onEsc, true);
  }

  // -------------------------------------------------------------------------------------------
  // Element helpers

  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
    'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'treeitem', 'listbox', 'gridcell',
  ]);
  const LANDMARK_ROLES = new Set(['main', 'navigation', 'banner', 'contentinfo', 'complementary', 'search', 'form', 'region', 'dialog', 'alertdialog']);

  function inputRole(el) {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    switch (type) {
      case 'button':
      case 'submit':
      case 'reset':
      case 'image':
        return 'button';
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio';
      case 'range':
        return 'slider';
      case 'number':
        return 'spinbutton';
      case 'search':
        return 'searchbox';
      case 'hidden':
        return null;
      default:
        return el.hasAttribute('list') ? 'combobox' : 'textbox';
    }
  }

  function roleOf(el) {
    const explicit = (el.getAttribute('role') || '').trim().split(/\s+/)[0].toLowerCase();
    if (explicit && explicit !== 'presentation' && explicit !== 'none' && explicit !== 'generic') return explicit;
    const tag = el.localName;
    switch (tag) {
      case 'a':
      case 'area':
        return el.hasAttribute('href') ? 'link' : null;
      case 'button':
      case 'summary':
        return 'button';
      case 'input':
        return inputRole(el);
      case 'select':
        return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
      case 'textarea':
        return 'textbox';
      case 'option':
        return 'option';
      case 'img':
        return el.getAttribute('alt') === '' ? null : 'img';
      case 'svg':
        return el.querySelector(':scope > title') ? 'img' : null;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return 'heading';
      case 'nav':
        return 'navigation';
      case 'main':
        return 'main';
      case 'header':
        return el.closest('article, aside, main, nav, section') ? null : 'banner';
      case 'footer':
        return el.closest('article, aside, main, nav, section') ? null : 'contentinfo';
      case 'aside':
        return 'complementary';
      case 'form':
        return 'form';
      case 'search':
        return 'search';
      case 'section':
        return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ? 'region' : null;
      case 'dialog':
        return 'dialog';
      case 'ul':
      case 'ol':
        return 'list';
      case 'li':
        return 'listitem';
      case 'table':
        return 'table';
      case 'tr':
        return 'row';
      case 'th':
        return 'columnheader';
      case 'td':
        return 'cell';
      case 'label':
        return 'label';
      case 'iframe':
        return 'iframe';
      case 'video':
        return 'video';
      case 'p':
        return 'paragraph';
      default:
        if (el.isContentEditable && el.getAttribute('contenteditable') !== null) return 'textbox';
        return null;
    }
  }

  function isInteractive(el, role = roleOf(el)) {
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    if (el.isContentEditable && el.getAttribute('contenteditable') !== null) return true;
    const tabindex = el.getAttribute('tabindex');
    if (tabindex !== null && Number(tabindex) >= 0 && el.localName !== 'div' && el.localName !== 'span') return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('jsaction')) return true;
    return false;
  }

  const collapse = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const cut = (s, max = MAX_NAME) => {
    const t = collapse(s);
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };

  function visible(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
    } else {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility !== 'visible' || Number(cs.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) {
      // display: contents and zero-size wrappers can still hold visible children.
      return getComputedStyle(el).display === 'contents';
    }
    return true;
  }

  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }

  /** Text an element renders (not hidden descendants), for names. */
  function visibleText(el, max = 400) {
    let out = '';
    const walk = (node) => {
      if (out.length > max) return;
      if (node.nodeType === 3) {
        out += node.data;
        return;
      }
      if (node.nodeType !== 1) return;
      const e = node;
      if (e.localName === 'script' || e.localName === 'style' || e.localName === 'noscript' || e.localName === 'template') return;
      if (e !== el && e.getAttribute('aria-hidden') === 'true') return;
      if (e.localName === 'img' && e.alt) {
        out += ` ${e.alt} `;
        return;
      }
      if (e.localName === 'svg') {
        const t = e.querySelector('title');
        if (t) out += ` ${t.textContent} `;
        return;
      }
      if (e !== el && typeof e.checkVisibility === 'function' && !e.checkVisibility({ checkVisibilityCSS: true })) return;
      // Text in separate blocks ("Quick" over "How long…") must not run together.
      const block = e !== el && !/^(inline|contents)$/.test(getComputedStyle(e).display);
      if (block) out += ' ';
      for (const c of e.childNodes) walk(c);
      if (e.shadowRoot) for (const c of e.shadowRoot.childNodes) walk(c);
      if (block) out += ' ';
    };
    walk(el);
    return collapse(out).slice(0, max);
  }

  function byIds(el, attr) {
    const ids = (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
    const root = el.getRootNode();
    return ids
      .map((id) => (root.getElementById ? root.getElementById(id) : document.getElementById(id)))
      .filter(Boolean)
      .map((n) => visibleText(n, 200) || collapse(n.textContent))
      .join(' ');
  }

  function labelFor(el) {
    const out = [];
    if (el.id) {
      try {
        const root = el.getRootNode();
        const lab = (root.querySelector ? root : document).querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab) out.push(visibleText(lab, 200));
      } catch {
        /* invalid id */
      }
    }
    const wrap = el.closest('label');
    if (wrap) {
      const clone = wrap.cloneNode(true);
      for (const c of clone.querySelectorAll('input, select, textarea')) c.remove();
      out.push(collapse(clone.textContent));
    }
    return collapse(out.join(' '));
  }

  /** A simplified accessible name. */
  function nameOf(el, role = roleOf(el)) {
    const labelledby = el.getAttribute('aria-labelledby') ? byIds(el, 'aria-labelledby') : '';
    if (labelledby) return cut(labelledby);
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return cut(aria);
    const tag = el.localName;
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (tag === 'input' && ['submit', 'button', 'reset'].includes(type)) return cut(el.value || el.getAttribute('value') || (type === 'submit' ? 'Submit' : ''));
      if (tag === 'input' && type === 'image') return cut(el.alt || el.title || 'Submit');
      return cut(labelFor(el) || el.title || el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '');
    }
    if (tag === 'img' || tag === 'area') return cut(el.getAttribute('alt') || el.title || '');
    if (tag === 'fieldset') {
      const lg = el.querySelector(':scope > legend');
      if (lg) return cut(lg.textContent);
    }
    if (tag === 'table') {
      const cap = el.querySelector(':scope > caption');
      if (cap) return cut(cap.textContent);
    }
    if (tag === 'iframe') return cut(el.title || el.name || '');
    // Interactive elements without a role (an <a> with no href, a div with a click handler) are
    // named by their text too, like buttons.
    if ((role && (INTERACTIVE_ROLES.has(role) || role === 'heading' || role === 'option' || role === 'cell' || role === 'columnheader' || role === 'listitem' || role === 'label' || role === 'paragraph')) || (!role && isInteractive(el, role))) {
      const t = visibleText(el, MAX_NAME + 20);
      if (t) return cut(t);
    }
    return cut(el.title || '');
  }

  function refFor(el) {
    let ref = state.byEl.get(el);
    if (ref && state.refs.get(ref)?.deref() === el) return ref;
    ref = `ref_${state.nextRef++}`;
    state.refs.set(ref, new WeakRef(el));
    state.byEl.set(el, ref);
    return ref;
  }

  function lookup(ref) {
    const el = state.refs.get(String(ref))?.deref();
    return el && el.isConnected ? el : null;
  }

  const SECRET_TYPES = new Set(['password']);
  function looksSecret(el) {
    if (el.localName !== 'input' && el.localName !== 'textarea') return false;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (SECRET_TYPES.has(type) || /current-password|new-password|one-time-code|cc-number|cc-csc/.test(ac)) return true;
    const words = `${el.name || ''} ${el.id || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${labelFor(el)}`.toLowerCase();
    return /\b(cvv|cvc|csc|security code|card ?number|cc-?num|password|passcode)\b/.test(words);
  }

  function states(el, role) {
    const parts = [];
    const tag = el.localName;
    if (role === 'heading') parts.push(`level=${el.getAttribute('aria-level') || tag.slice(1) || 2}`);
    if (role === 'checkbox' || role === 'radio' || role === 'switch' || role === 'menuitemcheckbox' || role === 'menuitemradio') {
      const checked = tag === 'input' ? el.checked : el.getAttribute('aria-checked') === 'true';
      parts.push(checked ? 'checked' : 'unchecked');
    }
    if (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton' || role === 'slider') {
      let value = '';
      if (tag === 'select') value = el.selectedOptions?.[0]?.textContent || '';
      else if (tag === 'input' || tag === 'textarea') value = el.value;
      else if (el.isContentEditable) value = el.textContent;
      if (value) parts.push(looksSecret(el) ? 'value="[hidden]"' : `value="${cut(value, 80).replace(/"/g, "'")}"`);
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type !== 'text' && type !== 'search') parts.push(`type=${type}`);
      }
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') parts.push('disabled');
    if (el.required || el.getAttribute('aria-required') === 'true') parts.push('required');
    const exp = el.getAttribute('aria-expanded');
    if (exp === 'true' || exp === 'false') parts.push(`expanded=${exp}`);
    if (el.getAttribute('aria-selected') === 'true' || (tag === 'option' && el.selected)) parts.push('selected');
    const pressed = el.getAttribute('aria-pressed');
    if (pressed === 'true') parts.push('pressed');
    if (role === 'link') {
      const href = el.getAttribute('href') || '';
      if (href && !/^javascript:/i.test(href)) {
        let shown = href;
        try {
          const u = new URL(href, location.href);
          shown = u.origin === location.origin ? `${u.pathname}${u.search}` : u.href;
        } catch {
          /* keep raw */
        }
        parts.push(`href="${cut(shown, 90).replace(/"/g, "'")}"`);
      }
    }
    return parts.length ? ` ${parts.join(' ')}` : '';
  }

  function line(el, role, name, depth) {
    const ref = refFor(el);
    const n = name ? ` "${name.replace(/"/g, "'")}"` : '';
    return `${'  '.repeat(depth)}${role}${n}${states(el, role)} [${ref}]`;
  }

  /** Children of an element including its open shadow root and same-origin iframe document. */
  function* childrenOf(el) {
    if (el.shadowRoot) yield* el.shadowRoot.children;
    if (el.localName === 'iframe') {
      try {
        const doc = el.contentDocument;
        if (doc && doc.body) {
          yield doc.body;
          return;
        }
      } catch {
        /* cross-origin */
      }
    }
    if (el.localName === 'slot') {
      for (const n of el.assignedElements({ flatten: true })) yield n;
      return;
    }
    yield* el.children;
  }

  // -------------------------------------------------------------------------------------------
  // read_page

  function readPage({ filter, depth = 15, ref } = {}) {
    const maxDepth = Math.max(1, Number(depth) || 15);
    const interactiveOnly = filter === 'interactive';
    const includeOffscreen = filter === 'all';
    let root = document.body || document.documentElement;
    if (ref) {
      root = lookup(ref);
      if (!root) return { error: `Error: ${ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
    }
    const lines = [];
    let chars = 0;
    let truncated = false;
    const push = (s) => {
      if (truncated) return;
      if (chars + s.length + 1 > MAX_TEXT) {
        truncated = true;
        return;
      }
      lines.push(s);
      chars += s.length + 1;
    };

    const visit = (el, d) => {
      if (truncated || !el || el.nodeType !== 1) return;
      const tag = el.localName;
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template' || tag === 'head' || tag === 'jarvis-control-overlay') return;
      if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('inert')) return;
      if (!visible(el)) return;
      const role = roleOf(el);
      const interactive = isInteractive(el, role);
      let emitted = false;
      if (interactive || (!interactiveOnly && role && role !== 'listitem' && role !== 'list' && role !== 'row' && role !== 'label' && role !== 'paragraph')) {
        if (includeOffscreen || inViewport(el) || LANDMARK_ROLES.has(role)) {
          const name = nameOf(el, role);
          const effectiveRole = role || (interactive ? 'generic' : null);
          if (effectiveRole && (interactive || name || LANDMARK_ROLES.has(role) || role === 'table' || role === 'img' || role === 'iframe')) {
            if (d <= maxDepth) push(line(el, effectiveRole, name, interactiveOnly ? 0 : d));
            emitted = true;
          }
        }
      }
      if (!interactiveOnly && !emitted && (role === 'paragraph' || role === 'listitem' || role === 'label' || role === 'cell' || !role)) {
        // Plain text directly inside this element (not inside interactive children).
        let own = '';
        for (const c of el.childNodes) if (c.nodeType === 3) own += c.data;
        own = collapse(own);
        if (own.length > 1 && (includeOffscreen || inViewport(el)) && d <= maxDepth) {
          push(`${'  '.repeat(d)}text "${cut(own, 300).replace(/"/g, "'")}"`);
        }
      }
      if (interactive && role !== 'combobox' && role !== 'listbox' && tag !== 'select') {
        // Interactive elements' own subtree is summarised by their name.
        if (role === 'link' || role === 'button' || role === 'textbox' || role === 'searchbox' || role === 'checkbox' || role === 'radio' || role === 'option' || role === 'menuitem' || role === 'tab' || role === 'switch') return;
      }
      if (tag === 'select') {
        let i = 0;
        for (const opt of el.options) {
          if (i++ >= 30) {
            push(`${'  '.repeat(d + 1)}… ${el.options.length - 30} more options`);
            break;
          }
          if (d + 1 <= maxDepth && !interactiveOnly) push(line(opt, 'option', cut(opt.textContent), d + 1));
        }
        return;
      }
      for (const child of childrenOf(el)) visit(child, emitted && !interactiveOnly ? d + 1 : d);
    };

    visit(root, 0);
    let text = lines.join('\n');
    if (!text) text = interactiveOnly ? '(no interactive elements in view; scroll, or use filter "all")' : '(nothing visible in this part of the page)';
    if (truncated) text += `\n[Output capped at ${MAX_TEXT.toLocaleString('en-US')} characters. Narrow the read with a smaller depth or the ref of a container.]`;
    const header = `Page: ${cut(document.title, 120)}\nViewport: ${innerWidth}x${innerHeight} CSS px, scrolled to (${Math.round(scrollX)}, ${Math.round(scrollY)}) of ${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`;
    return { text: `${header}\n${text}`, nextRef: state.nextRef };
  }

  // -------------------------------------------------------------------------------------------
  // find

  const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'on', 'in', 'for', 'and', 'or', 'with', 'this', 'that', 'page', 'element', 'elements']);
  const ROLE_HINTS = {
    button: ['button'], buttons: ['button'], link: ['link'], links: ['link'],
    field: ['textbox', 'searchbox', 'combobox', 'spinbutton'], box: ['textbox', 'searchbox', 'combobox', 'checkbox'], input: ['textbox', 'searchbox', 'combobox', 'spinbutton'],
    textbox: ['textbox', 'searchbox'], search: ['searchbox', 'textbox'], checkbox: ['checkbox'], radio: ['radio'], dropdown: ['combobox', 'listbox'],
    select: ['combobox', 'listbox'], menu: ['menuitem', 'combobox'], tab: ['tab'], image: ['img'], picture: ['img'], photo: ['img'], heading: ['heading'], title: ['heading'],
  };

  function find({ query } = {}) {
    const words = collapse(query).toLowerCase().split(/[^a-z0-9$€£]+/).filter((w) => w && !STOP.has(w));
    if (!words.length) return { error: 'Error: find needs a description, e.g. "search field" or "add to cart button".' };
    const roleWanted = new Set(words.flatMap((w) => ROLE_HINTS[w] || []));
    const content = words.filter((w) => !ROLE_HINTS[w]);
    const phrase = content.join(' ');
    const scored = [];
    const consider = (el) => {
      const role = roleOf(el);
      const interactive = isInteractive(el, role);
      if (!interactive && role !== 'heading' && role !== 'img') return;
      if (!visible(el)) return;
      const name = nameOf(el, role).toLowerCase();
      const extra = `${el.getAttribute('placeholder') || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
      const attrs = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''} ${el.getAttribute('name') || ''} ${el.getAttribute('data-testid') || ''}`.toLowerCase().replace(/[-_]/g, ' ');
      let score = 0;
      for (const w of content) {
        if (new RegExp(`\\b${w.replace(/[$€£]/g, '\\$&')}`).test(name)) score += 3;
        else if (name.includes(w)) score += 2;
        if (extra.includes(w)) score += 2;
        if (attrs.includes(w)) score += 1;
      }
      // A description with words must match some of them; the role alone is not a match.
      if (content.length && score === 0) return;
      if (phrase && name.includes(phrase)) score += 4;
      if (roleWanted.size) score += roleWanted.has(role) ? 3 : -1;
      if (!content.length && roleWanted.has(role)) score += 1;
      if (score <= 0) return;
      if (inViewport(el)) score += 0.5;
      scored.push({ el, role: role || 'generic', name: nameOf(el, role), score });
    };
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.localName === 'jarvis-control-overlay') continue;
        consider(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 20);
    if (!top.length) return { text: `No elements matched "${cut(query, 80)}". Try read_page, or a different description.`, nextRef: state.nextRef };
    return { text: top.map((s) => line(s.el, s.role, s.name, 0)).join('\n'), nextRef: state.nextRef };
  }

  // -------------------------------------------------------------------------------------------
  // get_page_text: rendered text only. Text a reader cannot see is left out: display:none,
  // visibility hidden, (nearly) transparent, off-screen, clipped away by a zero-size or
  // overflow-hidden box or clip/clip-path, tiny fonts, and text the same colour as what is behind
  // it. This filters the common ways pages hide text meant for an AI; whatever is read is still
  // treated as untrusted page content.

  const BLOCK = /^(block|flex|grid|list-item|table|table-row|table-cell|flow-root|table-caption)$/;

  function parseColor(c) {
    const m = /rgba?\(([^)]+)\)/.exec(String(c || ''));
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function luminance({ r, g, b }) {
    const ch = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  }

  /**
   * The solid colour behind an element whose parent has `parentBg` behind it: its own background
   * when that is opaque, else the parent's; null (unknown) under an image, a gradient or a
   * translucent layer, or for positioned boxes, which may be drawn over something else.
   */
  function backgroundOf(cs, parentBg) {
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a >= 0.9) return bg;
    if (bg && bg.a > 0.05) return null;
    if (cs.position === 'absolute' || cs.position === 'fixed') return null;
    return parentBg;
  }

  /** Text drawn in (nearly) the colour behind it cannot be seen. */
  function invisibleInk(cs, bg) {
    const fg = parseColor(cs.color);
    if (!fg) return false;
    if (fg.a < 0.1) return true;
    if (cs.webkitTextStroke && parseFloat(cs.webkitTextStrokeWidth) > 0) return false;
    if (cs.textShadow && cs.textShadow !== 'none') return false;
    if (!bg) return false;
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return ratio < 1.25;
  }

  const intersect = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  const emptyRect = (r) => r.right - r.left < 1 || r.bottom - r.top < 1;

  function pageText() {
    const main = document.querySelector('main, [role="main"], article') || document.body || document.documentElement;
    const parts = [];
    let chars = 0;
    let truncated = false;
    const emit = (s) => {
      if (truncated || !s) return;
      if (chars + s.length > MAX_TEXT) {
        parts.push(s.slice(0, Math.max(0, MAX_TEXT - chars)));
        truncated = true;
        return;
      }
      parts.push(s);
      chars += s.length;
    };
    const docW = Math.max(document.documentElement.scrollWidth, innerWidth);
    const docH = Math.max(document.documentElement.scrollHeight, innerHeight);
    // `clip`: the part of the document (in document coordinates) the ancestors with overflow
    // hidden let through; `opacity`: the ancestors' opacity multiplied together.
    const ALL = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    const walk = (el, clipIn, opacity, parentBg) => {
      if (truncated) return;
      const tag = el.localName;
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template' || el === state.host || tag === 'svg') return;
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return; // values are not page text
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return;
      const op = opacity * (Number(cs.opacity) || 0);
      if (op < 0.1) return;
      if (parseFloat(cs.fontSize) < 6) return;
      const color = cs.color.replace(/\s/g, '');
      if (color === 'transparent' || /rgba\(\d+,\d+,\d+,0(\.0+)?\)/.test(color)) return;
      // Fixed and absolutely positioned boxes may be drawn outside their ancestors' clip.
      const clip = cs.position === 'fixed' || cs.position === 'absolute' ? ALL : clipIn;
      const bg = backgroundOf(cs, parentBg);
      const r = el.getBoundingClientRect();
      const box = { left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY };
      if (r.width > 0 && (box.right <= 0 || box.bottom <= 0 || box.left >= docW || box.top >= docH)) return;
      if (cs.position === 'absolute' && r.width <= 2 && r.height <= 2) return;
      if (cs.clipPath && /inset\(\s*(50%|100%)/.test(cs.clipPath)) return;
      if (/^rect\(/.test(cs.clip || '') && cs.position !== 'static') {
        const n = (cs.clip.match(/-?[\d.]+px/g) || []).map(parseFloat);
        if (n.length === 4 && (n[1] - n[3] < 1 || n[2] - n[0] < 1)) return; // clip: rect(0 0 0 0)
      }
      // A box displayed but drawn somewhere its overflow-hidden ancestors cut away.
      if (r.width > 0 && r.height > 0 && emptyRect(intersect(clip, box)) && cs.display !== 'contents') return;
      let inner = clip;
      if (/hidden|clip/.test(`${cs.overflowX} ${cs.overflowY}`) && cs.display !== 'contents' && cs.display !== 'inline') {
        inner = intersect(clip, box);
        if (emptyRect(inner)) return; // a zero-size box with overflow hidden shows nothing
      }
      const block = BLOCK.test(cs.display) || tag === 'br';
      if (block) emit('\n');
      if (tag === 'br') return;
      let ink = null; // whether this element's own text can be seen (computed once, when needed)
      for (const c of el.childNodes) {
        if (c.nodeType === 3) {
          const t = c.data.replace(/\s+/g, ' ');
          if (!t.trim()) continue;
          if (ink === null) ink = !invisibleInk(cs, bg);
          if (ink) emit(t);
        } else if (c.nodeType === 1) walk(c, inner, op, bg);
      }
      if (el.shadowRoot) for (const c of el.shadowRoot.children) walk(c, inner, op, bg);
      if (tag === 'iframe') {
        try {
          if (el.contentDocument?.body) walk(el.contentDocument.body, ALL, op, null);
        } catch {
          /* cross-origin */
        }
      }
      if (block) emit('\n');
    };
    // What is behind `main`: the nearest opaque background above it (the canvas is white).
    let startBg = { r: 255, g: 255, b: 255, a: 1 };
    const chain = [];
    for (let n = main.parentElement; n; n = n.parentElement) chain.unshift(n);
    for (const n of chain) startBg = backgroundOf(getComputedStyle(n), startBg);
    walk(main, ALL, 1, startBg);
    let text = parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (truncated) text += `\n[Text capped at ${MAX_TEXT.toLocaleString('en-US')} characters.]`;
    const scope = main === document.body || main === document.documentElement ? '' : ' (main content)';
    return { text: `Title: ${cut(document.title, 150)}${scope}\n\n${text || '(no visible text)'}` };
  }

  // -------------------------------------------------------------------------------------------
  // Targets and the guard's descriptions

  /** The topmost element at (x, y) in `root`, looking through Jarvis's own control overlay. */
  function topAt(root, x, y) {
    const list = typeof root.elementsFromPoint === 'function' ? root.elementsFromPoint(x, y) : [root.elementFromPoint(x, y)];
    return list.find((e) => e && e !== state.host) || null;
  }

  function deepElementFromPoint(x, y) {
    // The control bar sits above the page but lets Jarvis's clicks through: what is under it is
    // what a click there reaches.
    let el = topAt(document, x, y);
    let ox = 0;
    let oy = 0;
    for (let i = 0; i < 20 && el; i++) {
      if (el.shadowRoot) {
        const inner = topAt(el.shadowRoot, x - ox, y - oy);
        if (inner && inner !== el) {
          el = inner;
          continue;
        }
      }
      if (el.localName === 'iframe') {
        try {
          const doc = el.contentDocument;
          if (doc) {
            const r = el.getBoundingClientRect();
            ox += r.left + el.clientLeft;
            oy += r.top + el.clientTop;
            const inner = topAt(doc, x - ox, y - oy);
            if (inner) {
              el = inner;
              continue;
            }
          }
        } catch {
          /* cross-origin frame: the frame itself is the target */
        }
      }
      break;
    }
    return el;
  }

  const ACTIONABLE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [contenteditable=""], [contenteditable="true"], [onclick]';

  function actionableAncestor(el) {
    let node = el;
    for (let i = 0; i < 12 && node; i++) {
      if (node.nodeType === 1 && node.matches?.(ACTIONABLE)) {
        // A label activates its control.
        if (node.localName === 'label' && node.control) return node.control;
        return node;
      }
      node = node.parentElement || node.getRootNode()?.host || null;
    }
    return el;
  }

  function closestAcross(el, selector) {
    let node = el;
    while (node) {
      const hit = node.closest?.(selector);
      if (hit) return hit;
      node = node.getRootNode()?.host || null;
    }
    return null;
  }

  function fieldInfo(f) {
    return {
      tag: f.localName,
      type: (f.getAttribute('type') || (f.localName === 'input' ? 'text' : '')).toLowerCase(),
      autocomplete: f.getAttribute('autocomplete') || '',
      name: f.getAttribute('name') || '',
      id: f.id || '',
      placeholder: f.getAttribute('placeholder') || '',
      ariaLabel: f.getAttribute('aria-label') || '',
      title: f.title || '',
      label: cut(labelFor(f), 80),
      inputMode: f.getAttribute('inputmode') || '',
      dataHint: `${f.getAttribute('data-elements-stable-field-name') || ''} ${f.getAttribute('data-encrypted-name') || ''}`.trim(),
    };
  }

  function formSummary(form) {
    if (!form) return null;
    const fields = [...form.querySelectorAll('input, textarea, select')].filter((f) => (f.getAttribute('type') || '').toLowerCase() !== 'hidden');
    const infos = fields.slice(0, 40).map(fieldInfo);
    const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    const roleSearch = form.getAttribute('role') === 'search' || !!form.closest('[role="search"], search');
    const action = form.getAttribute('action') || '';
    const searchy = roleSearch || /search|query|\bq\b|find/i.test(`${action} ${form.id} ${form.className}`) || (infos.length <= 2 && infos.some((i) => i.type === 'search' || /^(q|query|search|s|k|keyword|keywords|st)$/i.test(i.name)));
    const cardish = infos.some((i) => /cc-number|cc-csc/.test(i.autocomplete) || /\b(card ?number|cvv|cvc|security code)\b/i.test(`${i.name} ${i.id} ${i.placeholder} ${i.label} ${i.ariaLabel}`));
    const frames = [...form.querySelectorAll('iframe')].some((f) => /stripe|braintree|adyen|card|payment|cvv|cvc|hosted-field|securefield/i.test(`${f.src} ${f.name} ${f.title} ${f.id}`));
    return {
      isSearch: !!searchy,
      hasPasswordField: infos.some((i) => i.type === 'password'),
      hasCardField: cardish || frames,
      hasMessageField: fields.some((f) => f.localName === 'textarea'),
      submitLabel: submit ? nameOf(submit) || 'Submit' : '',
      text: cut(form.innerText || '', 300),
      action: cut(action, 120),
    };
  }

  function nearbyButtons(el) {
    // Buttons near a composer: walk up a few levels and collect button labels.
    let node = el;
    const labels = new Set();
    for (let i = 0; i < 6 && node && labels.size < 12; i++) {
      node = node.parentElement || node.getRootNode()?.host || null;
      if (!node) break;
      for (const b of node.querySelectorAll('button, [role="button"], input[type="submit"]')) {
        const n = nameOf(b);
        if (n) labels.add(n);
        if (labels.size >= 12) break;
      }
    }
    return [...labels];
  }

  /** What the guard needs to know about an element. */
  function describe(el) {
    if (!el) return null;
    const role = roleOf(el);
    const tag = el.localName;
    const form = el.form || closestAcross(el, 'form');
    const dialog = closestAcross(el, 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]');
    const composer = closestAcross(el, 'form, [role="dialog"], dialog, [role="region"], section, article') || el.parentElement;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const toggle = role === 'checkbox' || role === 'switch' || role === 'radio' || role === 'menuitemcheckbox' || role === 'menuitemradio' || (tag === 'input' && (type === 'checkbox' || type === 'radio'));
    const d = {
      tag,
      role: role || '',
      type,
      name: nameOf(el, role),
      text: cut(visibleText(el, 120), 120),
      value: tag === 'input' && ['submit', 'button'].includes(type) ? cut(el.value, 80) : '',
      href: el.href && typeof el.href === 'string' ? el.href : el.getAttribute?.('href') || '',
      download: el.hasAttribute?.('download') ? el.getAttribute('download') || true : false,
      isSubmit: (tag === 'button' && (type === 'submit' || (!type && !!form))) || (tag === 'input' && (type === 'submit' || type === 'image')),
      isCheckbox: role === 'checkbox' || role === 'switch',
      isToggle: toggle,
      checked: tag === 'input' ? !!el.checked : el.getAttribute('aria-checked') === 'true',
      isContentEditable: !!el.isContentEditable,
      multiline: tag === 'textarea' || (el.isContentEditable && el.getAttribute('aria-multiline') !== 'false'),
      enterSends: !!el.isContentEditable || (role === 'textbox' && tag !== 'textarea' && tag !== 'input'),
      form: formSummary(form),
      dialogText: dialog ? cut(dialog.innerText || '', 300) : '',
      contextText: '',
      nearTextbox: !!(composer && composer.querySelector && composer.querySelector('textarea, [contenteditable=""], [contenteditable="true"], [role="textbox"]')),
      pageUrl: location.href,
      field: tag === 'input' || tag === 'textarea' || tag === 'select' ? fieldInfo(el) : null,
      looksSecret: looksSecret(el),
    };
    // A generic "Continue" takes its meaning from the section around it (an order-review page's
    // "Payment: Visa ending 4242 · Total $279.99"); read only then (innerText costs a layout).
    if (isGenericLabel(d.name) || isGenericLabel(d.text) || (d.isSubmit && !d.name && !d.text)) {
      d.contextText = cut((closestAcross(el, 'section, article, main, [role="main"]') || document.body)?.innerText || '', 400);
    }
    if (tag === 'iframe' || tag === 'frame') {
      d.iframe = { src: el.src || '', name: el.name || '', title: el.title || '', id: el.id || '' };
      // A frame from another site: Jarvis cannot see (or check) anything inside it.
      let readable = false;
      try {
        readable = !!el.contentDocument;
      } catch {
        readable = false;
      }
      d.crossOrigin = !readable;
    }
    if (d.field && d.multiline) d.field.multiline = true;
    if (role === 'textbox' || tag === 'textarea' || el.isContentEditable) d.nearbyButtons = nearbyButtons(el);
    return d;
  }

  /** Finds a point inside `el` that hits it (or a descendant), scrolling it into view first. */
  /** Where `el`'s frame sits in the top-level viewport (0, 0 for the top document; same-site frames only). */
  function frameOffset(el) {
    let x = 0;
    let y = 0;
    let win = el.ownerDocument?.defaultView;
    for (let i = 0; i < 10 && win && win !== window; i++) {
      let fe = null;
      try {
        fe = win.frameElement;
      } catch {
        fe = null;
      }
      if (!fe) break;
      const r = fe.getBoundingClientRect();
      x += r.left + fe.clientLeft;
      y += r.top + fe.clientTop;
      win = fe.ownerDocument?.defaultView;
    }
    return { x, y };
  }

  /** `el`'s box in top-level viewport coordinates (an element inside a same-site iframe included). */
  function viewportRect(el) {
    const r = el.getBoundingClientRect();
    const o = frameOffset(el);
    return { left: r.left + o.x, top: r.top + o.y, right: r.right + o.x, bottom: r.bottom + o.y, width: r.width, height: r.height };
  }

  function clickPoint(el, { scroll = true } = {}) {
    let r = viewportRect(el);
    const fully = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    if (scroll && !fully) {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      r = viewportRect(el);
    }
    if (r.width < 1 || r.height < 1) return { error: 'has no size on screen (it may be hidden)' };
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const right = Math.min(innerWidth - 1, r.right);
    const bottom = Math.min(innerHeight - 1, r.bottom);
    if (right <= left || bottom <= top) return { error: 'is outside the visible part of the page' };
    const candidates = [
      [0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7], [0.2, 0.2], [0.8, 0.8], [0.2, 0.8], [0.8, 0.2],
    ];
    let first = null;
    for (const [fx, fy] of candidates) {
      const x = left + (right - left) * fx;
      const y = top + (bottom - top) * fy;
      const hit = deepElementFromPoint(x, y);
      if (!first) first = { x, y, hit };
      if (hit && (hit === el || el.contains(hit) || hit.contains?.(el) || (hit.getRootNode()?.host && el.contains(hit.getRootNode().host)))) return { x, y };
    }
    return { x: first.x, y: first.y, covered: first.hit ? `${roleOf(first.hit) || first.hit.localName} "${nameOf(first.hit)}"` : 'another element' };
  }

  function rememberTarget(el) {
    const id = state.nextTarget++;
    state.targets.set(id, new WeakRef(el));
    if (state.targets.size > 64) state.targets.delete(state.targets.keys().next().value);
    return id;
  }

  function targetEl(id) {
    const el = state.targets.get(Number(id))?.deref();
    return el && el.isConnected ? el : null;
  }

  function resolveTarget({ ref, x, y, scroll = true, wantPoint = true } = {}) {
    if (ref !== undefined) {
      const el = lookup(ref);
      if (!el) return { error: `Error: ${ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
      if (!visible(el)) return { error: `Error: ${ref} is not visible on the page right now. Scroll, or re-read the page.` };
      const point = wantPoint ? clickPoint(el, { scroll }) : null;
      if (point?.error) return { error: `Error: ${ref} ${point.error}.` };
      // What a click at that point really reaches (another element may cover this one).
      const reach = point && point.covered ? actionableAncestor(deepElementFromPoint(point.x, point.y) || el) : el;
      return { x: point?.x, y: point?.y, covered: point?.covered, desc: describe(el), name: nameOf(el), role: roleOf(el) || el.localName, targetId: rememberTarget(el), hitId: reach !== el ? rememberTarget(reach) : undefined, hitDesc: reach !== el ? describe(reach) : undefined };
    }
    const hit = deepElementFromPoint(Number(x), Number(y));
    if (!hit) return { desc: null };
    const el = actionableAncestor(hit);
    return { x: Number(x), y: Number(y), desc: describe(el), name: nameOf(el), role: roleOf(el) || el.localName, targetId: rememberTarget(el) };
  }

  /**
   * After the pointer moved to (x, y), or between two clicks: the element there now (hover can
   * swap it, a click can relabel it), and whether it is still `targetId`.
   */
  function hitCheck({ x, y, targetId } = {}) {
    const hit = deepElementFromPoint(Number(x), Number(y));
    const el = hit ? actionableAncestor(hit) : null;
    const want = targetEl(targetId);
    return { same: !!(el && want && el === want), desc: el ? describe(el) : null, name: el ? nameOf(el) : '' };
  }

  function deepActive() {
    let el = document.activeElement;
    for (let i = 0; i < 20 && el; i++) {
      if (el.shadowRoot?.activeElement) {
        el = el.shadowRoot.activeElement;
        continue;
      }
      if (el.localName === 'iframe') {
        try {
          const inner = el.contentDocument?.activeElement;
          if (inner && inner !== el.contentDocument.body) {
            el = inner;
            continue;
          }
        } catch {
          return el; // cross-origin frame has the focus
        }
      }
      break;
    }
    return el;
  }

  function focusInfo() {
    const el = deepActive();
    if (!el || el === document.body || el === document.documentElement) return { desc: null };
    return { desc: describe(el), name: nameOf(el), role: roleOf(el) || el.localName };
  }

  function setNativeValue(el, value) {
    const proto = el.localName === 'textarea' ? HTMLTextAreaElement.prototype : el.localName === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function fire(el, type) {
    el.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
  }

  /** The option of a select that form_input would choose for `value` (by value, text, or part of the text). */
  function pickOption(el, value) {
    const want = String(value).trim().toLowerCase();
    const opts = [...el.options];
    return opts.find((o) => o.value.toLowerCase() === want) || opts.find((o) => collapse(o.textContent).toLowerCase() === want) || (want ? opts.find((o) => collapse(o.textContent).toLowerCase().includes(want)) : null) || null;
  }

  /** What choosing `value` in the select `ref` would pick, without changing anything (for the guard). */
  function previewOption({ ref, value } = {}) {
    const el = lookup(ref);
    if (!el || el.localName !== 'select') return { option: null };
    const opt = pickOption(el, value);
    return { option: opt ? { text: cut(opt.textContent, 80), value: opt.value, selected: opt.selected } : null, selectName: nameOf(el) };
  }

  function formInput({ ref, value } = {}) {
    const el = lookup(ref);
    if (!el) return { error: `Error: ${ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
    if (looksSecret(el)) return { error: 'secret' };
    const tag = el.localName;
    const role = roleOf(el);
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (el.disabled) return { error: `Error: ${ref} is disabled.` };
    if (tag === 'select') {
      const opts = [...el.options];
      const opt = pickOption(el, value);
      if (!opt) return { error: `Error: ${ref} has no option "${cut(String(value), 60)}". Options: ${opts.slice(0, 15).map((o) => `"${cut(o.textContent, 40)}"`).join(', ')}.` };
      el.focus();
      setNativeValue(el, opt.value);
      fire(el, 'input');
      fire(el, 'change');
      return { text: `Selected "${cut(opt.textContent, 60)}" in ${ref}.` };
    }
    if (role === 'checkbox' || role === 'radio' || role === 'switch' || role === 'menuitemcheckbox' || role === 'menuitemradio' || type === 'checkbox' || type === 'radio') {
      // The service worker sends a boolean (it normalised "true", 1, "on" … and checked it with the guard).
      const want = value === true || /^(true|1|on|yes|checked)$/i.test(String(value).trim());
      const now = tag === 'input' ? el.checked : el.getAttribute('aria-checked') === 'true';
      if (now !== want) el.click();
      return { text: `${want ? 'Checked' : 'Unchecked'} ${ref}.` };
    }
    if (tag === 'input' || tag === 'textarea') {
      el.focus();
      setNativeValue(el, String(value));
      fire(el, 'input');
      fire(el, 'change');
      return { text: `Set ${ref} to "${cut(String(value), 60)}".` };
    }
    if (el.isContentEditable) {
      el.focus();
      const sel = getSelection();
      sel.selectAllChildren(el);
      document.execCommand('insertText', false, String(value));
      return { text: `Set ${ref} to "${cut(String(value), 60)}".` };
    }
    return { error: `Error: ${ref} is a ${role || tag}, not a form field. Click it instead.` };
  }

  function scrollToRef({ ref } = {}) {
    const el = lookup(ref);
    if (!el) return { error: `Error: ${ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    return { text: `Scrolled ${ref} into view.`, name: nameOf(el), role: roleOf(el) || el.localName };
  }

  function viewport() {
    return {
      w: innerWidth,
      h: innerHeight,
      dpr: devicePixelRatio || 1,
      sx: Math.round(scrollX),
      sy: Math.round(scrollY),
      title: document.title,
      url: location.href,
      ready: document.readyState,
    };
  }


  // -------------------------------------------------------------------------------------------
  // The activation check. The service worker classifies the element under the pointer (or with
  // the focus) before it sends input, and asks the owner first when that looks consequential. The
  // page can still change between that check and the moment the input arrives (a different element
  // swapped in on hover, a label that turns "Continue" into "Place order" after the first of two
  // clicks), and some inputs activate an element without a click Jarvis aimed (Space or Enter on a
  // focused button, a drag that starts and ends on one button). So while Jarvis sends input, every
  // trusted pointer/mouse event, click and Enter/Space key is checked against the element that
  // really receives it: one the owner did not approve is not activated (the event is cancelled
  // before the page sees it), and an approved element is activated once.

  const ACTIVATION_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'auxclick', 'dblclick', 'keydown'];
  const EDITABLE_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number', 'password', 'date', 'datetime-local', 'month', 'week', 'time']);

  function isEditableEl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const tag = el.localName;
    if (tag === 'textarea' || tag === 'select') return true;
    return tag === 'input' && EDITABLE_TYPES.has((el.getAttribute('type') || '').toLowerCase());
  }

  function onActivation(e) {
    const a = state.armed;
    if (!a || !e.isTrusted) return;
    if (Date.now() > a.until) {
      state.armed = null;
      return;
    }
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const first = path.find((n) => n && n.nodeType === 1) || (e.target && e.target.nodeType === 1 ? e.target : null);
    if (!first || first === state.host) return;
    if (e.type === 'keydown' && isEditableEl(first)) return; // typing; Enter in a form is checked when it clicks the submit button
    const el = actionableAncestor(first);
    if (!el || el === state.host) return;
    // A click on a label clicks its control right after: one activation, not two.
    if (e.type === 'click' && a.labelClick && a.labelClick === el && Date.now() - a.labelAt < 1000) {
      a.labelClick = null;
      return;
    }
    let c = null;
    let d = null;
    try {
      d = describe(el);
      c = classifyAction(d);
    } catch {
      c = null;
    }
    if (!c) return;
    // The approved element, or one of the same kind with the same wording (any of its labels).
    const names = new Set([c.label, d.text, d.name, d.value].map(normalizeLabel).filter(Boolean));
    const approved = !a.used && a.approved.some((p) => (p.el && p.el === el) || (p.category === c.category && names.has(normalizeLabel(p.label))));
    if (approved) {
      if (e.type === 'click' || e.type === 'auxclick') {
        a.used = true;
        a.activations += 1;
        if (first !== el && first.closest?.('label')?.control === el) {
          a.labelClick = el;
          a.labelAt = Date.now();
        }
      }
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!a.blocked.some((b) => b.category === c.category && b.label === c.label)) a.blocked.push({ type: e.type, category: c.category, label: c.label, alias: c.alias || '', reason: c.reason || '' });
  }
  for (const type of ACTIVATION_EVENTS) window.addEventListener(type, onActivation, true);

  /**
   * Arms the check for the input Jarvis is about to send. `approved`: [{ targetId?, category, label }]
   * the owner approved (activated once, as a whole); everything else consequential is blocked.
   */
  function arm({ approved = [], ms = 15000 } = {}) {
    state.armed = {
      approved: (Array.isArray(approved) ? approved : []).map((p) => ({ el: p.targetId !== undefined ? targetEl(p.targetId) : null, category: String(p.category || ''), label: String(p.label || '') })),
      used: false,
      activations: 0,
      blocked: [],
      until: Date.now() + Math.max(500, Math.min(60000, Number(ms) || 15000)),
    };
    return { ok: true };
  }

  function disarm() {
    const a = state.armed;
    state.armed = null;
    return { ok: true, blocked: a ? a.blocked : [], activations: a ? a.activations : 0 };
  }

  const OPS = {
    init({ nextRef, mode } = {}) {
      if (Number.isFinite(nextRef) && nextRef > state.nextRef) state.nextRef = nextRef;
      if (mode) setMode(mode);
      return { ok: true, nextRef: state.nextRef, version: VERSION };
    },
    mode: ({ mode }) => (setMode(mode), { ok: true }),
    beat() {
      state.lastBeat = Date.now();
      const stop = state.pendingStop;
      state.pendingStop = null;
      let tampered = false;
      if (state.mode !== 'hidden' && !state.shot) {
        // The page hid, moved or covered the bar: put it back, and tell the service worker when
        // that keeps happening.
        if (!overlayVisible()) {
          if (state.host && !state.host.isConnected) mountOverlay();
          else if (state.host) restoreHost();
          raiseOverlay();
          state.tamper = overlayVisible() ? 0 : state.tamper + 1;
        } else state.tamper = 0;
        tampered = state.tamper >= 2;
      }
      return { ok: true, stop, tampered };
    },
    suppressEsc({ ms = 600 } = {}) {
      state.suppressEscUntil = Date.now() + ms;
      return { ok: true };
    },
    /** Esc pressed inside a frame of this page (see requestStop). */
    frameStop({ via = 'esc' } = {}) {
      if (via === 'esc' && Date.now() < state.suppressEscUntil) return { ok: true };
      requestStop(via);
      return { ok: true };
    },
    shot: ({ on }) => {
      state.shot = !!on;
      if (!state.host || !state.host.isConnected || !state.root) return { ok: true };
      state.root.classList.toggle('shot', !!on);
      // Resolve once a frame without the bar has been rendered (or after 80 ms in a hidden tab,
      // where frames are not produced), so the screenshot never contains the control bar.
      return new Promise((resolve) => {
        const done = () => resolve({ ok: true });
        const timer = setTimeout(done, 80);
        requestAnimationFrame(() => requestAnimationFrame(() => (clearTimeout(timer), done())));
      });
    },
    pass: ({ on }) => {
      if (state.root) state.root.classList.toggle('pass', !!on);
      return { ok: true };
    },
    readPage,
    find,
    pageText,
    resolveTarget,
    hitCheck,
    focusInfo,
    formInput,
    previewOption,
    scrollToRef,
    viewport,
    arm,
    disarm,
  };

  globalThis.__jarvis = {
    version: VERSION,
    call(op, args) {
      const fn = OPS[op];
      if (!fn) return { error: `unknown op ${op}` };
      try {
        const out = fn(args || {});
        // Every answer names the page it came from: the service worker discards answers from a
        // page on another site than the one the owner allowed (the tab may have moved meanwhile).
        if (out && typeof out === 'object' && typeof out.then !== 'function') out.href = location.href;
        return out;
      } catch (err) {
        return { error: `Error: ${String(err && err.message ? err.message : err)}`, href: location.href };
      }
    },
    /** Describes an element handle (the service worker passes the focused element of a closed shadow root). */
    describeEl(el) {
      return el && el.nodeType === 1 ? { desc: describe(el), name: nameOf(el), role: roleOf(el) || el.localName, href: location.href } : { desc: null, href: location.href };
    },
  };
})();
