// The page agent: runs inside the controlled tab, in an isolated world the service worker creates
// through the debugger (like a content script: it shares the page's DOM but none of its
// JavaScript, and the page cannot see or call it). It provides
//   - the visible control: a thin glowing border and a top bar "Jarvis is in control · Stop"
//     (Stop and the Esc key call the `__jarvisBar` binding, which reaches the service worker);
//   - page reading for the browser toolset: read_page (accessibility-style tree with refs), find,
//     get_page_text (rendered text only: most ways of hiding text from the reader are filtered);
//   - targets: resolving a ref or a viewport point to a click point plus a description of the
//     element for the safety guard, the focused field, and form_input;
//   - the activation check, the one choke point for Jarvis's input: while Jarvis sends a click, a
//     key or text, every trusted pointer, key, text and form-change event is checked against the
//     single step the owner approved (that exact element, with the same item around it); anything
//     else is cancelled before the page sees it (deny by default).
// Bundled into an IIFE string at build time. The service worker injects it at document start in
// its isolated world (so its Esc and activation listeners come before the page's own), evaluates
// it again on the current document, and then calls globalThis.__jarvis.call(op, args).

import { classifyAction, needsContext, pageKey, secretKind, secretKindOf } from '../background/guard.js';
import { addressKey } from '../background/address.js';

(() => {
  const VERSION = 6;
  if (globalThis.__jarvis && globalThis.__jarvis.version === VERSION) {
    // Evaluated again on a document the page rewrote with document.open(): the agent's state
    // survived, its listeners did not. Put them back.
    globalThis.__jarvis.heal?.();
    return;
  }

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
    mountedOn: null, // the <html> element the overlay was mounted in (a rewritten document gets a new one)
    hiddenBeats: [], // the last heartbeats: whether the bar was hidden or covered when each began
    sawHidden: false, // the fast check saw the bar hidden or covered since the last heartbeat
    sampler: 0,
    pass: false, // Jarvis's own clicks pass through the bar right now
    targets: new Map(), // target id -> WeakRef(Element): elements Jarvis pointed at
    targetIds: new WeakMap(), // Element -> its target id (one id per element for this document)
    nextTarget: 1,
    armed: null, // the activation check while Jarvis sends input (see arm())
    childWindows: new WeakSet(), // same-site frames without an agent of their own, checked from here
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

  // The host's own styles, set through the CSSOM (a page's Content-Security-Policy can forbid
  // style attributes and <style> elements, but not this).
  const HOST_STYLE = [['all', 'initial'], ['position', 'fixed'], ['inset', '0'], ['z-index', '2147483647'], ['pointer-events', 'none'], ['display', 'block']];
  function setHostStyles(h) {
    h.style.cssText = '';
    for (const [prop, value] of HOST_STYLE) h.style.setProperty(prop, value, 'important');
  }
  const hostStyled = (h) => HOST_STYLE.every(([prop, value]) => prop === 'all' || (h.style.getPropertyValue(prop) === value && h.style.getPropertyPriority(prop) === 'important'));

  // The host is a plain <div> in the HTML namespace: a page can define a custom element of any
  // hyphenated name (its definition would run, and could forbid or take the shadow root Jarvis
  // needs), but never redefine a built-in element. It carries a fixed marker attribute, so the
  // service worker can tell Jarvis's own closed shadow root from the page's.
  const HOST_MARK = 'data-jarvis-control';

  function buildOverlay() {
    const host = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    host.setAttribute(HOST_MARK, '');
    setHostStyles(host);
    // In the top layer, above the page's own modal dialogs (raised again on every heartbeat).
    try {
      host.popover = 'manual';
    } catch {
      /* no popover support: the z-index still applies */
    }
    const shadow = host.attachShadow({ mode: 'closed' });
    // A constructed style sheet: unlike a <style> element, a page's CSP (style-src) does not block it.
    let adopted = false;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(OVERLAY_CSS);
      shadow.adoptedStyleSheets = [sheet];
      adopted = true;
    } catch {
      adopted = false;
    }
    const root = document.createElement('div');
    root.className = 'root';
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
    if (adopted) shadow.append(root);
    else {
      const style = document.createElement('style');
      style.textContent = OVERLAY_CSS;
      shadow.append(style, root);
    }
    state.host = host;
    state.root = root;
    state.bar = bar;
    state.label = label;
    state.root.classList.toggle('pass', state.pass);
    // Count (never fight) a page hiding the host: `inert`, `hidden`, styles.
    try {
      new MutationObserver(() => {
        if (state.mode !== 'hidden' && state.host === host) state.sawHidden = true;
      }).observe(host, { attributes: true });
    } catch {
      /* ignore */
    }
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
    if (host.inert || host.closest?.('[inert]')) return false;
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

  /** The overlay's own styles did not apply (a strict page CSP in a Chrome without constructed sheets). */
  function stylesBlocked() {
    try {
      return !!state.bar && state.bar.isConnected && getComputedStyle(state.bar).position !== 'fixed';
    } catch {
      return false;
    }
  }

  /**
   * Shows the bar (building it if needed). Never throws: returns false when it cannot be shown at
   * all (the document is not one it can be drawn in), which the heartbeat reports at once.
   */
  function mountOverlay() {
    try {
      mountOverlayOnce();
      state.barFailed = false;
      return true;
    } catch {
      state.barFailed = true;
      return false;
    }
  }

  function mountOverlayOnce() {
    if (state.mode === 'hidden') return;
    // A host that left the document (the page rebuilt <html>, or rewrote itself with
    // document.open(), which also erases the listeners of the old host's Stop button) is replaced
    // by a new one.
    if (!state.host || !state.host.isConnected) buildOverlay();
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
    if (parent && state.mountedOn !== parent) {
      // Pages that rebuild <html>'s children must not remove the control bar. (Attributes a page
      // sets on the host are put back on the next heartbeat, not here: a page observer fighting
      // this one could otherwise loop forever.)
      state.observer?.disconnect();
      state.observer = new MutationObserver(() => {
        if (state.mode !== 'hidden' && state.host && !state.host.isConnected) mountOverlay();
      });
      state.observer.observe(parent, { childList: true });
      state.mountedOn = parent;
    }
    // A host the document cannot draw (an SVG or XML document, where an HTML element outside a
    // foreignObject is not rendered) shows nothing: that is a bar that cannot be shown. (A document
    // still too early to have an <html> element gets it when it does: the heartbeat puts it there.)
    if (!document.documentElement) return;
    if (!state.host.isConnected || !(state.host instanceof HTMLElement) || !(document.documentElement instanceof HTMLElement)) throw new Error('no bar');
  }

  function restoreHost() {
    const host = state.host;
    for (const a of [...host.attributes]) {
      if (a.name === 'style' || a.name === 'popover' || a.name === 'data-test-stop' || a.name === HOST_MARK) continue;
      host.removeAttribute(a.name);
    }
    if (!host.hasAttribute(HOST_MARK)) host.setAttribute(HOST_MARK, '');
    if (!hostStyled(host)) setHostStyles(host);
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
      state.mountedOn = null;
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
    clearInterval(state.sampler);
    state.sampler = 0;
    state.hiddenBeats = [];
    state.sawHidden = false;
  }

  /** Returns false when the bar could not be shown (see mountOverlay). */
  function setMode(mode) {
    if (mode === 'hidden') {
      unmountOverlay();
      return true;
    }
    state.mode = mode === 'waiting' ? 'waiting' : 'acting';
    state.lastBeat = Date.now();
    startTimers();
    return mountOverlay();
  }

  function startTimers() {
    if (!state.watchdog) {
      // If the service worker stops sending heartbeats (it was stopped, the debugger was detached
      // from Chrome's own "cancel" button), the bar removes itself instead of lingering.
      state.watchdog = setInterval(() => {
        if (state.mode !== 'hidden' && Date.now() - state.lastBeat > 4000) unmountOverlay();
      }, 1000);
    }
    if (!state.sampler) {
      // Between heartbeats, look more often: a page that covers the bar again right after each
      // repair is still seen (and reported) here.
      state.sampler = setInterval(() => {
        if (state.mode === 'hidden' || state.shot || state.pass) return;
        if (!overlayVisible()) state.sawHidden = true;
      }, 250);
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

  // -------------------------------------------------------------------------------------------
  // Element helpers

  // Elements that show another page inside this one (a nested browsing context): an iframe, a
  // frame, an <object> or <embed> showing a page, a fenced frame. One showing another site's page
  // is a box Jarvis cannot see into or check: it is never treated as part of the element around it.
  const FRAME_HOSTS = new Set(['iframe', 'frame', 'object', 'embed', 'fencedframe', 'portal']);
  const FRAME_SELECTOR = 'iframe, frame, object, embed, fencedframe, portal';
  const isFrameHost = (el) => !!el && el.nodeType === 1 && FRAME_HOSTS.has(el.localName);
  /** A frame host that shows a page (an <object> showing a picture does not; an <embed> always counts). */
  const showsPage = (el) => isFrameHost(el) && (el.localName !== 'object' || !!frameDoc(el) || !!el.contentWindow);

  /** The document a frame host shows, when this page may read it (same origin); null otherwise. */
  function frameDoc(el) {
    if (!isFrameHost(el)) return null;
    try {
      if (el.localName === 'embed') return typeof el.getSVGDocument === 'function' ? el.getSVGDocument() || null : null;
      return el.contentDocument || null;
    } catch {
      return null;
    }
  }

  /** The window a frame host shows, when this page may reach into it (same origin); null otherwise. */
  function frameWin(el) {
    const doc = frameDoc(el);
    return doc ? doc.defaultView || null : null;
  }

  /** Whether `el` (or an open shadow root inside it) holds an element that shows another page. */
  function holdsFrame(el, depth = 0) {
    if (!el || el.nodeType !== 1 || depth > 4) return false;
    try {
      if (el.querySelector(FRAME_SELECTOR)) return true;
      let n = 0;
      for (const d of el.querySelectorAll('*')) {
        if (++n > 400) break;
        if (d.shadowRoot && d !== state.host && (d.shadowRoot.querySelector(FRAME_SELECTOR) || [...d.shadowRoot.children].some((c) => holdsFrame(c, depth + 1)))) return true;
      }
      if (el.shadowRoot && el !== state.host && el.shadowRoot.querySelector(FRAME_SELECTOR)) return true;
    } catch {
      return true; // can't tell: assume it does (fail closed)
    }
    return false;
  }

  /**
   * Where a link, an area or a form opens, as Chromium decides: the element's own target (a
   * submit button's formtarget first), else the document's first <base target>; an empty value
   * falls through. Compared as is (Chromium opens "_self " in a new window, named "_self ").
   */
  function effectiveTarget(el, submitter = null) {
    if (!el || el.nodeType !== 1) return '';
    let t = '';
    if (submitter && submitter.hasAttribute?.('formtarget') && submitter.getAttribute('formtarget') !== '') t = submitter.getAttribute('formtarget');
    else if (el.hasAttribute?.('target') && el.getAttribute('target') !== '') t = el.getAttribute('target');
    if (!t) {
      try {
        const base = (el.ownerDocument || document).querySelector('base[target]');
        t = base ? base.getAttribute('target') || '' : '';
      } catch {
        t = '';
      }
    }
    // (A name with a line break or a tab and "<" in it opens a new window in Chromium.)
    if (/[\t\n\r]/.test(t) && t.includes('<')) t = '_blank';
    return String(t).slice(0, 120);
  }

  /** A link or form target other than this tab's page: a new window or a named frame. */
  const elsewhere = (target) => {
    const t = String(target || '').toLowerCase();
    return t !== '' && t !== '_self' && t !== '_top' && t !== '_parent';
  };

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
      case 'frame':
      case 'fencedframe':
      case 'portal':
        return 'iframe';
      case 'object':
      case 'embed':
        // A box showing another page (an <object> or <embed> with a document in it).
        return showsPage(el) ? 'iframe' : null;
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
        // Words drawn in the picture (<text>, <tspan>): a button made of SVG shows its label so.
        for (const tx of e.querySelectorAll('text')) out += ` ${tx.textContent} `;
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
    if (isFrameHost(el)) return cut(el.title || el.getAttribute('name') || '');
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
  /** The quick check (type, autocomplete, common words); secretField() is the full rule. */
  function looksSecret(el) {
    if (el.localName !== 'input' && el.localName !== 'textarea') return false;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (SECRET_TYPES.has(type) || /current-password|new-password|one-time-code|cc-number|cc-csc/.test(ac)) return true;
    const words = `${el.name || ''} ${el.id || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${labelFor(el)}`.toLowerCase();
    return /\b(cvv|cvc|csc|security code|card ?number|cc-?num|password|passcode)\b/.test(words);
  }

  /**
   * The kind of secret an element holds ('password', 'card', 'cvv', 'id') or null: the same rule
   * the service worker uses before typing (guard.js secretKindOf), here for reading values back
   * (read_page, find, get_page_text) and for screenshots (shot).
   */
  function secretField(el) {
    if (!el || el.nodeType !== 1) return null;
    const tag = el.localName;
    const role = roleOf(el);
    const field = tag === 'input' || tag === 'textarea' || tag === 'select' ? fieldInfo(el) : null;
    const editable = !!el.isContentEditable && el.getAttribute('contenteditable') !== null;
    if (!field && !editable && role !== 'textbox' && role !== 'searchbox' && role !== 'combobox' && role !== 'spinbutton') return null;
    try {
      return secretKindOf({ tag, role: role || '', field, looksSecret: tag === 'input' || tag === 'textarea' ? looksSecret(el) : false, isContentEditable: editable, name: nameOf(el, role) });
    } catch {
      return 'password';
    }
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
      if (value) parts.push(secretField(el) ? 'value="[hidden]"' : `value="${cut(value, 80).replace(/"/g, "'")}"`);
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

  /** Children of an element including its open shadow root and a same-origin frame's document. */
  function* childrenOf(el) {
    if (el.shadowRoot && el !== state.host) yield* el.shadowRoot.children;
    if (isFrameHost(el)) {
      const doc = frameDoc(el);
      const root = doc ? doc.body || doc.documentElement : null;
      if (root) yield root;
      // (What a frame shows is its page; an <object> that shows none shows its fallback content.)
      if (showsPage(el)) return;
    }
    if (el.localName === 'slot') {
      for (const n of el.assignedElements({ flatten: true })) yield n;
      return;
    }
    yield* el.children;
  }

  /**
   * The addresses this page links to (its links, in open shadow roots and frames of this origin
   * too): what Jarvis saw on a page it read. Opening one of them by its address carries nothing
   * Claude made up (see the service worker's cross-site check).
   */
  function pageLinks(max = 400) {
    const out = new Set();
    const visit = (root, depth) => {
      if (depth > 4 || out.size >= max) return;
      let n = 0;
      for (const el of root.querySelectorAll('a[href], area[href], *')) {
        if (++n > 20000 || out.size >= max) break;
        if (el.localName === 'a' || el.localName === 'area') {
          const href = typeof el.href === 'string' ? el.href : '';
          if (/^https?:/i.test(href)) out.add(href);
        }
        if (el.shadowRoot && el !== state.host) visit(el.shadowRoot, depth + 1);
        if (isFrameHost(el)) {
          const doc = frameDoc(el);
          if (doc) visit(doc, depth + 1);
        }
      }
    };
    try {
      visit(document, 0);
    } catch {
      /* best effort */
    }
    return [...out];
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
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template' || tag === 'head' || el === state.host) return;
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
    return { text: `${header}\n${text}`, nextRef: state.nextRef, links: pageLinks() };
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
        if (el === state.host) continue;
        consider(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 20);
    if (!top.length) return { text: `No elements matched "${cut(query, 80)}". Try read_page, or a different description.`, nextRef: state.nextRef };
    return { text: top.map((s) => line(s.el, s.role, s.name, 0)).join('\n'), nextRef: state.nextRef, links: pageLinks() };
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
      // The text of a rich-text field that holds a secret (a contenteditable "Password") is a value.
      if ((el.isContentEditable && el.getAttribute('contenteditable') !== null) || roleOf(el) === 'textbox') {
        if (secretField(el)) return;
      }
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
      if (isFrameHost(el)) {
        const doc = frameDoc(el);
        if (doc?.body) walk(doc.body, ALL, op, null);
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
    return { text: `Title: ${cut(document.title, 150)}${scope}\n\n${text || '(no visible text)'}`, links: pageLinks() };
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
      if (isFrameHost(el)) {
        // A frame of this origin: what is under the point inside it. Any other (another site's
        // page, which Jarvis cannot see into) is itself what the point reaches.
        const doc = frameDoc(el);
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
      }
      break;
    }
    return el;
  }

  const ACTIONABLE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [contenteditable=""], [contenteditable="true"], [onclick]';

  /**
   * The element a click on `el` activates: its link, button, field or control. An element that
   * shows another page (a frame) is never mapped to the element around it: a click there goes into
   * that page, not to the link or button that holds the frame.
   */
  function actionableAncestor(el) {
    if (isFrameHost(el)) return el;
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
    const frames = [...form.querySelectorAll(FRAME_SELECTOR)].some((f) => /stripe|braintree|adyen|card|payment|cvv|cvc|hosted-field|securefield/i.test(`${f.src || f.data || ''} ${f.getAttribute('name') || ''} ${f.title} ${f.id}`));
    let actionUrl = '';
    try {
      actionUrl = typeof form.action === 'string' ? form.action : new URL(action || location.href, location.href).href;
    } catch {
      actionUrl = '';
    }
    // The default button (Enter in a field submits through it): the form's first submit button,
    // wherever it sits (form="id" included). Its formaction, formmethod and formtarget win.
    const def = defaultButton(form);
    const own = (b, attr) => (b && b.hasAttribute(attr) ? b.getAttribute(attr) || '' : '');
    let submitAction = '';
    try {
      submitAction = def && def.hasAttribute('formaction') ? def.formAction : '';
    } catch {
      submitAction = '';
    }
    return {
      isSearch: !!searchy,
      hasPasswordField: infos.some((i) => i.type === 'password'),
      hasCardField: cardish || frames,
      hasMessageField: fields.some((f) => f.localName === 'textarea'),
      submitLabel: submit ? nameOf(submit) || 'Submit' : def ? nameOf(def) || 'Submit' : '',
      text: cut(form.innerText || '', 300),
      action: cut(action, 120),
      actionUrl: cut(actionUrl, 600),
      method: (form.getAttribute('method') || 'get').toLowerCase(),
      // Where it opens: its own target, else the page's <base target> (as Chromium decides; not
      // trimmed: "_self " is a new window).
      target: effectiveTarget(form),
      submitAction: cut(submitAction, 600),
      submitMethod: own(def, 'formmethod').toLowerCase(),
      submitTarget: String(own(def, 'formtarget')).slice(0, 120),
    };
  }

  /** A form's default button: its first submit button in tree order (form-associated ones too). */
  function defaultButton(form) {
    try {
      for (const e of form.elements) {
        if (e.localName === 'button' && String(e.type || 'submit').toLowerCase() === 'submit') return e;
        if (e.localName === 'input' && /^(submit|image)$/i.test(String(e.type || ''))) return e;
      }
    } catch {
      /* not a form */
    }
    return null;
  }

  const SENDISH = /\b(send|post|publish|submit|reply|comment|tweet|share|respond)\b/i;
  const BUTTONS = 'button, [role="button"], input[type="submit"], input[type="button"]';

  function buttonLabel(b) {
    return cut(nameOf(b) || b.getAttribute('title') || b.getAttribute('data-tooltip') || '', 60);
  }

  /**
   * The buttons of the composer around a text field, send-like ones first ("Send", "Post"): the
   * field's form, dialog or section as a whole (however deep the field sits), else the nearest
   * ancestor that has a send-like button.
   */
  function nearbyButtons(el) {
    const send = [];
    const other = new Set();
    let seen = 0;
    const collect = (root) => {
      for (const b of root.querySelectorAll(BUTTONS)) {
        if (++seen > 300) break;
        const n = buttonLabel(b);
        if (!n) continue;
        if (SENDISH.test(n)) {
          if (!send.includes(n)) send.push(n);
        } else other.add(n);
      }
    };
    const scope = closestAcross(el, 'form, dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="region"], section, article');
    if (scope) collect(scope);
    for (let node = el.parentElement || el.getRootNode()?.host || null; !send.length && node && seen <= 300; node = node.parentElement || node.getRootNode()?.host || null) {
      if (node === scope) continue;
      collect(node);
      if (node === document.body) break;
    }
    return [...send, ...[...other].slice(0, Math.max(0, 40 - send.length))];
  }

  /** The heading, legend or label of the section, fieldset or dialog around an element. */
  function headingFor(el) {
    let node = el.parentElement || el.getRootNode()?.host || null;
    for (let i = 0; i < 10 && node && node !== document.body && node !== document.documentElement; i++) {
      const labelled = node.getAttribute('aria-labelledby') ? byIds(node, 'aria-labelledby') : '';
      if (labelled) return cut(labelled, 120);
      const role = node.getAttribute('role') || '';
      if (node.getAttribute('aria-label') && (/^(region|group|dialog|alertdialog|form|radiogroup)$/.test(role) || /^(section|fieldset|dialog|form)$/.test(node.localName))) return cut(node.getAttribute('aria-label'), 120);
      const legend = node.querySelector(':scope > legend');
      if (legend) return cut(legend.textContent, 120);
      const h = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > header > h1, :scope > header > h2, :scope > header > h3, :scope > b, :scope > strong');
      if (h && h !== el && !h.contains(el)) return cut(h.textContent, 120);
      node = node.parentElement || node.getRootNode()?.host || null;
    }
    return '';
  }

  /** What a radio, checkbox or switch belongs to: its fieldset's legend or its group's name. */
  function groupLabelOf(el) {
    const fs = closestAcross(el, 'fieldset');
    const lg = fs?.querySelector(':scope > legend');
    if (lg) return cut(lg.textContent, 120);
    const g = closestAcross(el, '[role="radiogroup"], [role="group"]');
    if (g) return cut((g.getAttribute('aria-labelledby') ? byIds(g, 'aria-labelledby') : '') || g.getAttribute('aria-label') || '', 120);
    return '';
  }

  const PAGINATION_BOX = 'nav, [role="navigation"], [aria-label*="pagination" i], [aria-label*="pages" i], [class*="pagination" i], [class*="pager" i], [class*="paging" i]';
  const FILTER_BOX = '[aria-label*="filter" i], [aria-label*="refine" i], [aria-label*="facet" i], [id*="filter" i], [class*="filter" i], [class*="facet" i], [class*="refine" i], [data-testid*="filter" i]';

  function inFilters(el) {
    if (closestAcross(el, FILTER_BOX)) return true;
    return /\b(filter|filters|refine|narrow|facets?|sort by|show only)\b/i.test(groupLabelOf(el));
  }

  // Clock-like tokens ("Ends in 04:59") change every second: they are not part of what an item is.
  const CLOCK = /\b\d{1,2}:\d{2}(:\d{2})?\b/g;
  const ITEM_BOX = 'li, tr, [role="row"], [role="listitem"], [role="article"], article, [role="gridcell"], [role="option"], [role="treeitem"], fieldset, form, dialog, [role="dialog"], [role="alertdialog"]';

  /**
   * The item an element belongs to, as text: its row, list item, card, form or dialog (a product's
   * name and price, a message's sender and subject). An approval is bound to it: if it changes
   * while the owner decides (a carousel, a re-sorted list), Jarvis asks again.
   */
  function itemContext(el) {
    if (!el || el.nodeType !== 1) return '';
    const own = collapse(visibleText(el, 300));
    // Text of the item beyond its controls: a row of buttons ("Add to cart  Buy now") is not an item.
    const ownText = (node, text) => {
      let controls = 0;
      let n = 0;
      for (const c of node.querySelectorAll('button, a[href], [role="button"], [role="link"], input, select, textarea')) {
        if (++n > 60) break;
        controls += collapse(c.innerText ?? c.value ?? '').length;
      }
      return text.length - controls;
    };
    let fallback = '';
    let node = el.parentElement || el.getRootNode()?.host || null;
    for (let i = 0; i < 8 && node && node !== document.body && node !== document.documentElement; i++) {
      const text = collapse(node.innerText ?? node.textContent ?? '');
      if (text.length > 4000) break;
      if (text.length >= own.length + 3 && ownText(node, text) >= 3 && node.matches?.(ITEM_BOX)) return cut(text.replace(CLOCK, ''), 300);
      if (!fallback && text.length >= own.length + 8 && ownText(node, text) >= 8) fallback = text;
      node = node.parentElement || node.getRootNode()?.host || null;
    }
    return cut((fallback || own).replace(CLOCK, ''), 300);
  }

  /**
   * What an approval of `el` is bound to: its name (what it says it does, aria-label included) and
   * the item it belongs to. Either changing (a relabelled button, a rotated product) is another step.
   */
  function ctxOf(el) {
    if (!el || el.nodeType !== 1) return '';
    // A key pressed with nothing focused goes to the page itself: not bound to its text.
    if (el === el.ownerDocument?.body || el === el.ownerDocument?.documentElement) return '';
    return cut(`${nameOf(el)} | ${itemContext(el)}`, 420);
  }

  const SELECTED = 'input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"], [role="menuitemcheckbox"][aria-checked="true"], [role="row"][aria-selected="true"], [role="option"][aria-selected="true"], [role="gridcell"][aria-selected="true"], [role="treeitem"][aria-selected="true"], [role="listitem"][aria-selected="true"], tr[aria-selected="true"], li[aria-selected="true"]';
  const LISTISH = 'li, tr, [role="row"], [role="option"], [role="listitem"], [role="treeitem"], [role="gridcell"], [role="grid"], [role="listbox"], table, ul, ol';
  // Boxes from other sites big enough to hold a list (payment fields are not lists).
  const BLIND_FRAME_MIN = { w: 100, h: 60 };
  const PAYMENT_BOX = /stripe|braintree|adyen|checkout\.com|paypal|applepay|apple-pay|googlepay|google-pay|pay\.google|shop-pay|klarna|affirm|afterpay|card|payment|cvv|cvc|securefield|secure-field|hosted-field|hostedfield|recurly|squareup|spreedly|3ds|captcha|recaptcha|hcaptcha|turnstile/i;

  /**
   * What is selected on the page now (ticked boxes, selected rows), everywhere read_page looks:
   * the page, its open shadow roots (web components) and its frames of this site. A toolbar's
   * "Delete" or "Archive" acts on these. `key` changes whenever the selection does; `names` are
   * the selected list items, for the owner's prompt. `unknown`: part of the page could hold a
   * selection Jarvis cannot read (a box from another site); the service worker adds closed shadow
   * roots, which only the debugger sees. An approval is never bound to an unknown selection.
   */
  function selectionSnapshot() {
    const all = [];
    const listed = [];
    const blind = [];
    const visit = (root, depth) => {
      if (depth > 8 || all.length >= 200) return;
      for (const c of root.querySelectorAll(SELECTED)) {
        if (all.length >= 200) break;
        const row = c.closest('li, tr, [role="row"], [role="option"], [role="listitem"], [role="treeitem"]');
        const name = cut(nameOf(c) || collapse(row?.innerText || ''), 50);
        all.push(name);
        if (c.closest(LISTISH)) listed.push(name);
      }
      let n = 0;
      for (const el of root.querySelectorAll('*')) {
        if (++n > 20000) break;
        if (el.shadowRoot && el !== state.host) visit(el.shadowRoot, depth + 1);
        if (!showsPage(el)) continue;
        const doc = frameDoc(el);
        if (doc) {
          if (doc.documentElement) visit(doc, depth + 1);
          continue;
        }
        // A frame from another site (or origin): nothing in it can be read from here.
        const r = el.getBoundingClientRect();
        if (r.width < BLIND_FRAME_MIN.w || r.height < BLIND_FRAME_MIN.h || !visible(el)) continue;
        if (PAYMENT_BOX.test(`${el.src || el.data || ''} ${el.getAttribute('name') || ''} ${el.title || ''} ${el.id || ''}`)) continue;
        blind.push('a box from another site');
      }
    };
    visit(document, 0);
    const key = `${all.length}|${all.join('|')}`;
    return { key: blind.length ? `?${key}` : key, count: listed.length, names: listed.slice(0, 4), unknown: blind.length > 0 };
  }

  /** What the guard needs to know about an element. */
  function describe(el) {
    if (!el) return null;
    // Jarvis's own control bar (its host, or an element inside its closed shadow root).
    if (state.host && (el === state.host || el.getRootNode?.()?.host === state.host)) return { tag: el.localName, role: '', name: "Jarvis's control bar", text: '', jarvisBar: true };
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
      readonly: !!el.readOnly || el.getAttribute('aria-readonly') === 'true',
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      // Where a link opens: its own target, else the page's <base target> (a new window Jarvis
      // cannot hold is never a plain link).
      targetBlank: (tag === 'a' || tag === 'area') && elsewhere(effectiveTarget(el)),
      target: tag === 'a' || tag === 'area' ? effectiveTarget(el) : '',
      formAction: (tag === 'button' || tag === 'input') && typeof el.formAction === 'string' && el.hasAttribute('formaction') ? el.formAction : '',
      formMethod: (tag === 'button' || tag === 'input') && el.hasAttribute('formmethod') ? (el.getAttribute('formmethod') || '').toLowerCase() : '',
      // (A submit button's own formtarget; an empty one falls back to the form's, then <base>'s.)
      formTarget: (tag === 'button' || tag === 'input') && el.hasAttribute('formtarget') && el.getAttribute('formtarget') !== '' ? String(el.getAttribute('formtarget')).slice(0, 120) : '',
      // Another page shown inside it (a frame): a click there goes into that page, not to this element.
      containsFrame: !isFrameHost(el) && holdsFrame(el),
      // Markup that makes a link an action (Rails/Turbo data-method and data-confirm, a shop theme's
      // add-to-cart class, a ping to another address).
      linkMethod: tag === 'a' || tag === 'area' ? (el.getAttribute('data-method') || el.getAttribute('data-turbo-method') || '').toLowerCase().slice(0, 12) : '',
      linkConfirm: (tag === 'a' || tag === 'area') && (el.hasAttribute('data-confirm') || el.hasAttribute('data-turbo-confirm')),
      linkClass: tag === 'a' || tag === 'area' ? String(typeof el.className === 'string' ? el.className : el.getAttribute('class') || '').slice(0, 200) : '',
      ping: (tag === 'a' || tag === 'area') && !!el.getAttribute('ping'),
      inPagination: !!closestAcross(el, PAGINATION_BOX),
      inFilters: inFilters(el),
      inSearch: !!closestAcross(el, '[role="search"], search'),
      headingText: '',
      groupLabel: toggle ? groupLabelOf(el) : '',
      unlabelled: '',
    };
    // A generic "Continue", or a bare verb like "Turn off", takes its meaning from the section
    // around it (an order-review page's "Payment: Visa ending 4242 · Total $279.99", a heading
    // "2-Step Verification"); read only then (innerText costs a layout).
    if (needsContext(d.name) || needsContext(d.text) || (d.isSubmit && !d.name && !d.text)) {
      d.contextText = cut((closestAcross(el, 'section, article, main, [role="main"]') || document.body)?.innerText || '', 400);
      d.headingText = headingFor(el);
    }
    if (!d.name && !d.text && (tag === 'canvas' || tag === 'svg' || tag === 'img' || tag === 'video' || tag === 'div' || tag === 'span')) {
      d.unlabelled = tag === 'canvas' ? 'a drawing (canvas) with no label' : tag === 'img' || tag === 'svg' ? 'a picture with no label' : `an unlabelled ${tag}`;
    }
    if (showsPage(el)) {
      // A box showing a page: an iframe, a frame, an <object> or <embed> with a page in it.
      d.iframe = { src: String(el.src || el.data || el.getAttribute('src') || el.getAttribute('data') || ''), name: el.getAttribute('name') || '', title: el.title || '', id: el.id || '', tag };
      // One from another site (or origin): Jarvis cannot see (or check) anything inside it.
      d.crossOrigin = !frameDoc(el);
    }
    if (d.field && d.multiline) d.field.multiline = true;
    if (role === 'textbox' || role === 'searchbox' || tag === 'textarea' || (tag === 'input' && /^(|text|search|email|url|tel)$/.test(type)) || el.isContentEditable) d.nearbyButtons = nearbyButtons(el);
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
      // (A frame at the point, unless it is the element itself, is what the click would reach:
      // another page, not this element.)
      if (hit && hit !== el && isFrameHost(hit)) continue;
      if (hit && (hit === el || el.contains(hit) || hit.contains?.(el) || (hit.getRootNode()?.host && el.contains(hit.getRootNode().host)))) return { x, y };
    }
    const what = first.hit ? (isFrameHost(first.hit) ? `a box from another page "${nameOf(first.hit)}"` : `${roleOf(first.hit) || first.hit.localName} "${nameOf(first.hit)}"`) : 'another element';
    return { x: first.x, y: first.y, covered: what };
  }

  /**
   * A point for Jarvis's pointer that the page cannot read anything into: the click point of the
   * element at (x, y) (its middle, or the first spot of it not covered), not the exact spot Claude
   * named. Coordinates a page sees on its pointer events otherwise carry whatever Claude put in them.
   */
  function snapPoint({ x, y, actionable = false } = {}) {
    const hit = deepElementFromPoint(Number(x), Number(y));
    if (!hit) return { x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2), none: true };
    const el = actionable ? actionableAncestor(hit) : hit;
    const p = clickPoint(el, { scroll: false });
    if (p.error) return { x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2), none: true };
    return { x: Math.round(p.x), y: Math.round(p.y), targetId: rememberTarget(el), covered: !!p.covered };
  }

  /** The element's target id: the same id every time for the same element, for this document. */
  function rememberTarget(el) {
    let id = state.targetIds.get(el);
    if (!id) {
      id = state.nextTarget++;
      state.targetIds.set(el, id);
    }
    state.targets.delete(id);
    state.targets.set(id, new WeakRef(el));
    if (state.targets.size > 256) state.targets.delete(state.targets.keys().next().value);
    return id;
  }

  function targetEl(id) {
    const el = state.targets.get(Number(id))?.deref();
    return el && el.isConnected ? el : null;
  }

  /**
   * A ref or a viewport point -> the click point, the element (desc, targetId), what a click there
   * really reaches (hitDesc, hitId: the actionable element at the point, when it is another one,
   * e.g. a covering element or a button inside the ref), the item it belongs to (ctx) and what is
   * selected on the page (selection).
   */
  function resolveTarget({ ref, x, y, scroll = true, wantPoint = true } = {}) {
    if (ref !== undefined) {
      const el = lookup(ref);
      if (!el) return { error: `Error: ${ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
      if (!visible(el)) return { error: `Error: ${ref} is not visible on the page right now. Scroll, or re-read the page.` };
      const point = wantPoint ? clickPoint(el, { scroll }) : null;
      if (point?.error) return { error: `Error: ${ref} ${point.error}.` };
      // What a click at that point really reaches: the actionable element there.
      const hit = point ? deepElementFromPoint(point.x, point.y) : null;
      const reach = (point && hit ? actionableAncestor(hit) : el) || el;
      return { x: point?.x, y: point?.y, covered: point?.covered, desc: describe(el), name: nameOf(el), role: roleOf(el) || el.localName, targetId: rememberTarget(el), hitId: reach !== el ? rememberTarget(reach) : undefined, hitDesc: reach !== el ? describe(reach) : undefined, ctx: ctxOf(reach), item: itemContext(reach), selection: selectionSnapshot() };
    }
    const hit = deepElementFromPoint(Number(x), Number(y));
    if (!hit) return { desc: null, selection: selectionSnapshot() };
    const el = actionableAncestor(hit);
    return { x: Number(x), y: Number(y), desc: describe(el), name: nameOf(el), role: roleOf(el) || el.localName, targetId: rememberTarget(el), ctx: ctxOf(el), item: itemContext(el), selection: selectionSnapshot() };
  }

  /**
   * After the pointer moved to (x, y), or between two clicks: the element there now (hover can
   * swap it, a click can relabel it), whether it is still `targetId`, and its item now.
   */
  function hitCheck({ x, y, targetId } = {}) {
    const hit = deepElementFromPoint(Number(x), Number(y));
    const el = hit ? actionableAncestor(hit) : null;
    const want = targetEl(targetId);
    return { same: !!(el && want && el === want), desc: el ? describe(el) : null, name: el ? nameOf(el) : '', ctx: el ? ctxOf(el) : '', targetId: el ? rememberTarget(el) : undefined, selection: selectionSnapshot() };
  }

  /** Facts about an element Jarvis pointed at before (it may have left the page). */
  function targetFacts({ targetId } = {}) {
    const el = targetEl(targetId);
    if (!el) return { gone: true };
    return { gone: false, ctx: ctxOf(el), item: itemContext(el), selection: selectionSnapshot(), desc: describe(el) };
  }

  function deepActive() {
    let el = document.activeElement;
    for (let i = 0; i < 20 && el; i++) {
      if (el.shadowRoot?.activeElement) {
        el = el.shadowRoot.activeElement;
        continue;
      }
      if (isFrameHost(el)) {
        // Inside a frame of this origin: what has the focus there. A frame from another site that
        // has the focus is itself the answer (Jarvis cannot see into it).
        const doc = frameDoc(el);
        const inner = doc ? doc.activeElement : null;
        if (inner && inner !== doc.body) {
          el = inner;
          continue;
        }
      }
      break;
    }
    return el;
  }

  /** The element with the keyboard focus (the page itself when nothing has it). */
  function focusInfo() {
    const el = deepActive();
    if (!el || el === document.body || el === document.documentElement) {
      const page = (el && el.ownerDocument?.body) || document.body || document.documentElement;
      return { desc: null, targetId: page ? rememberTarget(page) : undefined, ctx: '', selection: selectionSnapshot() };
    }
    return { desc: describe(el), name: nameOf(el), role: roleOf(el) || el.localName, targetId: rememberTarget(el), ctx: ctxOf(el), item: itemContext(el), selection: selectionSnapshot() };
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

  // Inputs form_input may set. Buttons (submit, button, reset, image), hidden and file inputs are
  // not fields: setting a button's value would rename it ("Place order" -> "Search").
  const SETTABLE_INPUTS = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number', 'date', 'datetime-local', 'month', 'week', 'time', 'range', 'color', 'checkbox', 'radio']);

  function formInput({ ref, value } = {}) {
    const el = lookup(ref);
    if (!el) return { error: `Error: ${ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
    if (looksSecret(el) || secretField(el)) return { error: 'secret' };
    const tag = el.localName;
    const role = roleOf(el);
    const type = (el.getAttribute('type') || '').toLowerCase();
    const itype = tag === 'input' ? String(el.type || 'text').toLowerCase() : '';
    if (tag === 'input' && !SETTABLE_INPUTS.has(itype)) return { error: `Error: ${ref} is ${itype === 'hidden' || itype === 'file' ? `a ${itype} input` : 'a button'}, not a form field. ${itype === 'hidden' || itype === 'file' ? 'Jarvis does not set it.' : 'Click it instead.'}` };
    if (el.disabled) return { error: `Error: ${ref} is disabled.` };
    if (tag === 'select') {
      const opts = [...el.options];
      const opt = pickOption(el, value);
      // (The option texts are page content: the service worker marks them so and scans them.)
      if (!opt) return { error: `Error: ${ref} has no option "${cut(String(value), 60)}".`, options: opts.slice(0, 15).map((o) => cut(o.textContent, 40)) };
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

  /** Links and forms on this page that open `url` (navigating to it does what clicking them does). */
  function linksTo({ url } = {}) {
    const key = pageKey(url);
    const links = [];
    if (!key) return { links };
    for (const a of document.querySelectorAll('a[href], area[href]')) {
      if (links.length >= 5) break;
      if (pageKey(a.href) === key) links.push({ desc: describe(a), targetId: rememberTarget(a), ctx: ctxOf(a), item: itemContext(a) });
    }
    for (const f of document.forms) {
      if (links.length >= 8) break;
      if (pageKey(f.action) !== key) continue;
      const submit = f.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      if (submit) links.push({ desc: describe(submit), targetId: rememberTarget(submit), ctx: ctxOf(submit), item: itemContext(submit) });
    }
    return { links };
  }

  /** Whether `el` scrolls along `axis` ('x' or 'y') by itself (overflow auto/scroll with room to move). */
  function scrollsAlong(el, axis) {
    if (!el || el.nodeType !== 1) return false;
    const cs = getComputedStyle(el);
    const overflow = axis === 'y' ? cs.overflowY : cs.overflowX;
    if (!/(auto|scroll|overlay)/.test(overflow)) return false;
    return axis === 'y' ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1;
  }

  /**
   * Scrolls as a scrolling key would (arrows 40 px, Page Up/Down a screenful, Home/End to the
   * ends), without sending the key to the page: pages bind these keys to actions (a like on a
   * swipe app, nudging a selected object). Scrolls the box under the middle of the viewport that
   * can move that way, else the page.
   */
  function scrollKey({ key, repeat = 1 } = {}) {
    const n = Math.max(1, Math.min(100, Number(repeat) || 1));
    const page = Math.max(innerHeight * 0.875, innerHeight - 40);
    const steps = { ArrowDown: [0, 40], ArrowUp: [0, -40], ArrowRight: [40, 0], ArrowLeft: [-40, 0], PageDown: [0, page], PageUp: [0, -page] };
    const axis = key === 'ArrowLeft' || key === 'ArrowRight' ? 'x' : 'y';
    let target = null;
    for (let el = deepElementFromPoint(innerWidth / 2, innerHeight / 2), i = 0; el && i < 40; i++) {
      if (el === document.body || el === document.documentElement) break;
      if (scrollsAlong(el, axis)) {
        target = el;
        break;
      }
      el = el.parentElement || el.getRootNode()?.host || null;
    }
    const scroller = target || document.scrollingElement || document.documentElement;
    const before = target ? [target.scrollLeft, target.scrollTop] : [scrollX, scrollY];
    if (key === 'Home' || key === 'End') {
      const top = key === 'Home' ? 0 : scroller.scrollHeight;
      if (target) target.scrollTo({ top, behavior: 'instant' });
      else window.scrollTo({ top, behavior: 'instant' });
    } else {
      const [dx, dy] = steps[key] || [0, 0];
      if (target) target.scrollBy({ left: dx * n, top: dy * n, behavior: 'instant' });
      else window.scrollBy({ left: dx * n, top: dy * n, behavior: 'instant' });
    }
    const after = target ? [target.scrollLeft, target.scrollTop] : [scrollX, scrollY];
    return { ok: true, moved: after[0] !== before[0] || after[1] !== before[1], x: Math.round(after[0]), y: Math.round(after[1]), inBox: !!target };
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
  // The activation check: the one choke point for Jarvis's input, deny by default. The service
  // worker gets the owner's approval for one step (or finds that step needs none: a plain link, a
  // scrolling key) and then arms this check with exactly that step: the element (by identity), the
  // item around it, and what may happen to it (pointer presses and how many clicks, which keys,
  // text). While armed, every trusted pointer, mouse, click, key, text-input and form-change event
  // that is not part of that step is cancelled before the page sees it: a different element
  // swapped in under the pointer, a page that moves the focus before a key lands, a select or radio
  // changed by a key, a paste. The service worker hears what was stopped (disarm) and fails the
  // step. Frames of this site hand their events to this check; frames from other sites are opaque
  // (every step into one is asked as such).

  const POINTER_EVENTS = new Set(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu', 'drop']);
  const KEY_EVENTS = new Set(['keydown', 'keypress', 'keyup']);
  const FORM_EVENTS = new Set(['input', 'change']);
  const ACTIVATION_EVENTS = [...POINTER_EVENTS, ...KEY_EVENTS, 'beforeinput', ...FORM_EVENTS, 'submit'];
  const EDITABLE_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number', 'password', 'date', 'datetime-local', 'month', 'week', 'time']);
  const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph', 'Fn', 'OS']);
  const ARROW_INPUTS = new Set(['radio', 'checkbox', 'range', 'number', 'date', 'datetime-local', 'month', 'week', 'time', 'color']);

  function isTextEl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const tag = el.localName;
    if (tag === 'textarea') return true;
    return tag === 'input' && EDITABLE_TYPES.has(String(el.type || 'text').toLowerCase()) && !ARROW_INPUTS.has(String(el.type || '').toLowerCase());
  }

  const keyMods = (e) => ['alt', 'ctrl', 'meta', 'shift'].filter((m) => e[`${m}Key`]).join('+');

  /** What the owner's step said about an element the input reached instead (for the report). */
  function blockedInfo(el, why) {
    let c = null;
    let label = '';
    try {
      const d = el ? describe(el) : null;
      c = d ? classifyAction(d) : null;
      label = c?.label || (d ? d.name || d.text || d.unlabelled || '' : '') || (el ? roleOf(el) || el.localName : 'the page');
    } catch {
      label = el?.localName || 'the page';
    }
    return { category: c?.category || 'change', label: cut(label, 80), alias: c?.alias || '', reason: c ? `${c.reason || ''}${why ? `; ${why}` : ''}` : why || 'not the step the owner approved' };
  }

  function stopEvent(a, e, info) {
    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation();
    if (!a.blocked.some((b) => b.label === info.label && b.reason === info.reason)) a.blocked.push({ type: e.type, ...info });
  }

  /** The approved entry for `el`, if its item is still the one the owner saw. */
  function approvedFor(a, el, kinds) {
    for (const p of a.approved) {
      if (!p.el || !kinds.includes(p.kind)) continue;
      // (A rich-text field's events can come from inside it; nothing else stands in for an element.)
      if (p.el !== el && !(p.kind !== 'pointer' && p.el.isContentEditable && p.el.contains?.(el))) continue;
      if (typeof p.ctx === 'string') {
        if (p.ctxNow === undefined) p.ctxNow = ctxOf(p.el);
        if (p.ctxNow !== p.ctx) return { changed: true };
      }
      return { entry: p };
    }
    return null;
  }

  /**
   * Why opening `url` in `target` is not what Jarvis checked before the step (the address the
   * owner's site permission and approval covered), or ''. A page can change a link's href or a
   * form's action and target right before it is used.
   */
  function destMismatch(p, url, target) {
    if (!p.dest) return '';
    const key = addressKey(url);
    if (!key || key !== p.dest.key) return 'its address changed after Jarvis checked it';
    if (elsewhere(target) && !elsewhere(p.dest.target)) return 'it would now open in another window or frame';
    return '';
  }

  function checkSubmit(a, e) {
    const form = e.target;
    if (!form || form.localName !== 'form') return true;
    const submitter = e.submitter || null;
    const own = (attr, prop, fallback) => (submitter && submitter.hasAttribute?.(attr) ? submitter[prop] : fallback);
    const url = own('formaction', 'formAction', form.action);
    // (The button's formtarget, the form's target, then the page's <base target>: where it really opens.)
    const target = effectiveTarget(form, submitter);
    const pinned = a.approved.find((p) => p.dest && p.dest.via === 'form');
    if (pinned) {
      const why = destMismatch(pinned, url, target);
      return why ? blockedInfo(submitter || form, `sending the form: ${why}`) : true;
    }
    // A submission the step was not checked for: never into another window or frame (the
    // service worker checks this tab's own loads, not those).
    if (elsewhere(target)) return blockedInfo(submitter || form, 'it would send a form into another window or frame, which Jarvis did not check');
    return true;
  }

  function checkPointer(a, e, first) {
    if (!first) return true;
    const el = actionableAncestor(first);
    // A click on a label clicks its control right after: one activation, not two.
    if (e.type === 'click' && a.labelClick && a.labelClick === el && Date.now() - a.labelAt < 1000) {
      a.labelClick = null;
      return true;
    }
    // The click an approved Enter or Space causes: on the focused button, link or box itself, or
    // on its form's default button (Enter in a field submits the form through it).
    const ka = a.keyActivation;
    if (ka && Date.now() < ka.until && (e.type === 'click' || POINTER_EVENTS.has(e.type)) && (el === ka.el || (ka.submit && el === ka.submit))) {
      if (e.type === 'click') {
        a.keyActivation = null;
        a.activations += 1;
      }
      return true;
    }
    const hit = approvedFor(a, el, ['pointer']);
    if (!hit) return blockedInfo(el, 'not what the owner approved');
    if (hit.changed) return blockedInfo(el, 'the item it belongs to changed');
    const p = hit.entry;
    // The press reached the approved element (Jarvis checks afterwards that it did: input that
    // lands in a box from another site never shows up here).
    p.seen = (p.seen || 0) + 1;
    a.seen += 1;
    if ((e.type === 'click' || e.type === 'auxclick') && p.dest && p.dest.via === 'link') {
      // The link must still go where Jarvis checked (the page may have swapped its href or target,
      // or added a <base target> meanwhile).
      const link = closestAcross(first, 'a[href], area[href]');
      if (link) {
        const why = destMismatch(p, link.href, effectiveTarget(link));
        if (why) return blockedInfo(el, why);
      }
    }
    if (e.type === 'click' || e.type === 'auxclick' || e.type === 'contextmenu') {
      p.used = (p.used || 0) + (e.type === 'contextmenu' ? 0 : 1);
      if (p.used > (p.clicks || 1)) return blockedInfo(el, 'it was already activated once');
      if (e.type !== 'contextmenu') a.activations += 1;
      if (first !== el && first.closest?.('label')?.control === el) {
        a.labelClick = el;
        a.labelAt = Date.now();
      }
    }
    return true;
  }

  function checkKey(a, e, first) {
    if (MODIFIER_KEYS.has(e.key)) return true;
    const code = e.code || e.key;
    if (e.type !== 'keydown') {
      // A page can act on keyup or keypress too: those of a stopped key are stopped as well.
      return a.blockedCodes.has(code) ? blockedInfo(first, `the key ${e.key}`) : true;
    }
    const target = first || document.body;
    const mods = keyMods(e);
    // With nothing focused, a key goes to <body> (or <html>): "the page" either way.
    const pageLevel = (el) => !el || el === el.ownerDocument?.body || el === el.ownerDocument?.documentElement;
    for (const p of a.approved) {
      if (p.kind !== 'key' || !p.el) continue;
      const same = p.el === target || (p.el.isContentEditable && p.el.contains?.(target)) || (pageLevel(p.el) && pageLevel(target) && p.el.ownerDocument === target.ownerDocument);
      if (!same) continue;
      if (!p.keys.some((k) => String(k.key).toLowerCase() === String(e.key).toLowerCase() && (k.mods || '') === mods)) continue;
      if (typeof p.ctx === 'string') {
        if (p.ctxNow === undefined) p.ctxNow = ctxOf(p.el);
        if (p.ctxNow !== p.ctx) break;
      }
      if (!e.repeat) {
        p.used = (p.used || 0) + 1;
        if (p.used > (p.presses || 1)) break;
        // The last approved key of a typing step has landed: what the page does with the focus
        // after it (a search page moving it to the results) is not a move away from the field.
        if (p.used >= (p.presses || 1) && a.kbd && (p.el === a.kbd || p.el.contains?.(a.kbd))) a.kbdDone = true;
      } else if (!p.hold) break;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        const form = target.form || null;
        let submit = null;
        try {
          submit = form ? form.querySelector('button[type="submit"], input[type="submit"], input[type="image"], button:not([type])') : null;
        } catch {
          submit = null;
        }
        a.keyActivation = { el: target, submit, until: Date.now() + 1500 };
      }
      return true;
    }
    // (Jarvis scrolls without key events: a scrolling key is a key like any other here.)
    a.blockedCodes.add(code);
    return blockedInfo(target === document.body ? null : target, `the key ${e.key}${mods ? ` with ${mods}` : ''} there was not approved`);
  }

  function checkInput(a, e, first) {
    // Never a paste or a drop: the clipboard is the owner's.
    if (/^insertFrom(Paste|PasteAsQuotation|Drop|Yank)$/.test(e.inputType || '')) return blockedInfo(first, 'pasting from the clipboard');
    const hit = first ? approvedFor(a, first, ['type', 'key']) : null;
    if (hit?.entry) {
      if (hit.entry.kind === 'type') a.textSeen += 1;
      return true;
    }
    return blockedInfo(first, hit?.changed ? 'the item it belongs to changed' : 'text going somewhere the owner did not approve');
  }

  function checkChange(a, e, first) {
    if (!first || isTextEl(first)) return true; // text: checked at beforeinput
    if (approvedFor(a, first, ['pointer', 'key', 'type', 'change'])?.entry) return true;
    // A select, radio, checkbox or slider changed by input nobody approved: put it back before the
    // page's own handlers see the change.
    restoreValue(a, first);
    return blockedInfo(first, 'changing it was not approved');
  }

  /** Values of the page's choice controls when the check was armed (to undo an unapproved change). */
  function snapshotControls() {
    const values = new Map();
    let n = 0;
    for (const c of document.querySelectorAll('select, input[type="checkbox"], input[type="radio"], input[type="range"], input[type="number"]')) {
      if (++n > 600) break;
      values.set(c, c.localName === 'select' ? c.value : c.type === 'checkbox' || c.type === 'radio' ? c.checked : c.value);
    }
    return values;
  }

  function restoreValue(a, el) {
    try {
      if (el.localName === 'input' && el.type === 'radio') {
        const group = el.name ? [...(el.form || el.ownerDocument).querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)] : [el];
        for (const r of group) if (a.values.has(r)) r.checked = a.values.get(r);
        return;
      }
      if (!a.values.has(el)) return;
      const v = a.values.get(el);
      if (el.localName === 'input' && el.type === 'checkbox') el.checked = v;
      else el.value = v;
    } catch {
      /* best effort: the step fails either way */
    }
  }

  function onActivation(e) {
    if (e.__jarvisChecked) return; // the same event, seen again from a frame's listener
    if (IN_FRAME && !state.armed) {
      // A frame of this site: the top frame's agent holds the check (Jarvis arms that one).
      try {
        const top = window.top.__jarvis;
        if (top && top !== globalThis.__jarvis && typeof top.activation === 'function') top.activation(e);
      } catch {
        /* a frame from another site: no access to the top frame */
      }
      return;
    }
    const a = state.armed;
    if (!a || !e.isTrusted) return;
    if (Date.now() > a.until) {
      state.armed = null;
      return;
    }
    try {
      e.__jarvisChecked = true;
    } catch {
      /* ignore */
    }
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    if (state.host && path.includes(state.host)) return; // Jarvis's own bar
    const first = path.find((n) => n && n.nodeType === 1) || (e.target && e.target.nodeType === 1 ? e.target : null);
    let verdict;
    if (POINTER_EVENTS.has(e.type)) verdict = checkPointer(a, e, first);
    else if (KEY_EVENTS.has(e.type)) verdict = checkKey(a, e, first);
    else if (e.type === 'beforeinput') verdict = checkInput(a, e, first);
    else if (FORM_EVENTS.has(e.type)) verdict = checkChange(a, e, first);
    else if (e.type === 'submit') verdict = checkSubmit(a, e);
    else verdict = true;
    if (verdict !== true) stopEvent(a, e, verdict);
  }

  /**
   * While Jarvis types (a `type` step), the keyboard focus stays on the field the owner's step is
   * for: a page that moves it away (to another element, or into a box from another site, where
   * the next line and its Enter would land unchecked) has the move undone at once (focusing the
   * field again during the blur cancels the page's own focus change), and the step reports it.
   * Once the step's last approved key has landed, what the page does with the focus is its own.
   */
  function onFocusLeave(e) {
    if (e.__jarvisChecked) return;
    if (IN_FRAME && !state.armed) {
      // A field in a frame of this site: the top frame's agent holds the step.
      try {
        const top = window.top.__jarvis;
        if (top && top !== globalThis.__jarvis && typeof top.focusLeave === 'function') top.focusLeave(e);
      } catch {
        /* a frame from another site */
      }
      return;
    }
    const a = state.armed;
    if (!a || !a.kbd || a.kbdDone || Date.now() > a.until) return;
    try {
      e.__jarvisChecked = true;
    } catch {
      /* ignore */
    }
    const from = (typeof e.composedPath === 'function' && e.composedPath()[0]) || e.target;
    if (from !== a.kbd && !(from && from.nodeType === 1 && from.contains?.(a.kbd))) return;
    // The window itself lost the focus (the owner clicked the side panel): not a move.
    if (activeIn(a.kbd)) return;
    if (!a.focusMoved) a.focusMoved = { at: Date.now() };
    if (a.relocking || a.relocks > 20) return;
    a.relocking = true;
    a.relocks += 1;
    try {
      a.kbd.focus({ preventScroll: true });
    } catch {
      /* the step fails either way */
    } finally {
      a.relocking = false;
    }
  }

  /** Whether `el` still has the keyboard focus (through shadow roots and frames of this origin). */
  function activeIn(el) {
    return !!el && deepActive() === el;
  }

  /** (Re)registers every listener of the agent: document.open() erases them all, the realm survives. */
  function ensureListeners() {
    for (const target of [window, document]) {
      target.addEventListener('keydown', onEsc, true);
      target.addEventListener('keyup', onEsc, true);
    }
    for (const type of ACTIVATION_EVENTS) window.addEventListener(type, onActivation, true);
    window.addEventListener('blur', onFocusLeave, true);
  }
  ensureListeners();

  /** Same-site frames that have no agent of their own (made by script, never loaded): check them from here. */
  function watchChildFrames(doc = document, depth = 0) {
    if (depth > 4) return;
    let n = 0;
    for (const f of doc.querySelectorAll(FRAME_SELECTOR)) {
      if (++n > 30) break;
      const w = frameWin(f); // (another site's frame: none)
      if (!w) continue;
      try {
        if (!w.__jarvis && !state.childWindows.has(w)) {
          for (const type of ACTIVATION_EVENTS) w.addEventListener(type, onActivation, true);
          w.addEventListener('blur', onFocusLeave, true);
          state.childWindows.add(w);
        }
        watchChildFrames(w.document, depth + 1);
      } catch {
        /* the frame went away */
      }
    }
  }

  // A listener only this agent knows about: if it is gone when the input is over, the page
  // rewrote itself (document.open()) meanwhile and erased the check's listeners too.
  const SENTINEL = `jarvis-check-${Math.random().toString(36).slice(2)}`;

  /**
   * Arms the check for the step Jarvis is about to send. `approved`: [{ targetId, ctx?, kind:
   * 'pointer' | 'key' | 'type' | 'change', clicks?, keys?: [{ key, mods }], presses?, hold? }] (the
   * owner's step, or a step that needs no approval such as a plain link; `dest`: where a link or
   * form of it may go, { url, target, via }); `scrollOnly`: the scroll member's wheel, which no
   * key or click may ride along with. Everything else is stopped.
   */
  function arm({ approved = [], scrollOnly = false, ms = 15000 } = {}) {
    ensureListeners();
    watchChildFrames();
    const list = (Array.isArray(approved) ? approved : []).map((p) => ({
      el: p.targetId !== undefined && p.targetId !== null ? targetEl(p.targetId) : null,
      ctx: typeof p.ctx === 'string' ? p.ctx : undefined,
      kind: ['pointer', 'key', 'type', 'change'].includes(p.kind) ? p.kind : 'pointer',
      clicks: Math.max(1, Math.min(3, Number(p.clicks) || 1)),
      keys: Array.isArray(p.keys) ? p.keys.map((k) => ({ key: String(k.key || ''), mods: String(k.mods || '') })) : [],
      presses: Math.max(1, Math.min(100, Number(p.presses) || 1)),
      hold: !!p.hold,
      // Where the step opens, as Jarvis checked it (a link's address, a form's action and target).
      dest: p.dest && typeof p.dest.url === 'string' ? { key: addressKey(p.dest.url), target: String(p.dest.target || ''), via: p.dest.via === 'form' ? 'form' : 'link' } : null,
    }));
    const missing = list.filter((p) => !p.el).length;
    const token = { hit: false };
    const sentinel = () => {
      token.hit = true;
    };
    // A typing step keeps the keyboard focus on its field (see onFocusLeave).
    const pageLevel = (el) => !el || el === el.ownerDocument?.body || el === el.ownerDocument?.documentElement;
    const kbd = list.find((p) => p.kind === 'type' && p.el && !pageLevel(p.el))?.el || null;
    state.armed = {
      approved: list,
      scrollOnly: !!scrollOnly,
      activations: 0,
      seen: 0, // pointer events that reached an approved element (a press that went elsewhere has none)
      textSeen: 0, // text inputs that reached the approved field
      kbd,
      kbdDone: false,
      focusMoved: null,
      relocks: 0,
      blocked: [],
      blockedCodes: new Set(),
      values: snapshotControls(),
      until: Date.now() + Math.max(500, Math.min(120000, Number(ms) || 15000)),
      sentinel,
      token,
      keyActivation: null,
    };
    window.addEventListener(SENTINEL, sentinel, true);
    return { ok: true, missing };
  }

  /**
   * The armed step so far, between the parts of a typing step: whether the page tried to move the
   * focus away from the field, and whether the field has it now.
   */
  function armedState() {
    const a = state.armed;
    if (!a) return { armed: false };
    return { armed: true, focusMoved: !!a.focusMoved, onField: a.kbd ? activeIn(a.kbd) : null, blocked: a.blocked.length, textSeen: a.textSeen };
  }

  /**
   * Ends the check: what it stopped, how many approved activations went through, whether its
   * listeners were still there at the end (`intact` false: the page rewrote itself with
   * document.open() during the input, which erases them, so nothing after that was checked), what
   * reached the approved elements (`seen`: pointer events; `textSeen`, `keysUsed`: text and keys),
   * and whether the page moved the focus off a field being typed into. `none`: nothing was armed in
   * this document (the step loaded another page before this answer, so it cannot say).
   */
  function disarm() {
    const a = state.armed;
    state.armed = null;
    if (!a) return { ok: true, none: true, blocked: [], activations: 0, intact: true };
    try {
      window.dispatchEvent(new Event(SENTINEL));
    } catch {
      /* ignore */
    }
    window.removeEventListener(SENTINEL, a.sentinel, true);
    ensureListeners();
    return {
      ok: true,
      blocked: a.blocked,
      activations: a.activations,
      intact: a.token.hit,
      seen: a.seen,
      textSeen: a.textSeen,
      keysUsed: a.approved.filter((p) => p.kind === 'key').map((p) => p.used || 0),
      focusMoved: !!a.focusMoved,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Screenshots: the control bar hidden, and private fields masked

  const masked = new Map(); // element -> [-webkit-text-security value, priority] before masking

  /**
   * Masks every field that holds a secret (passwords, card numbers, security codes, ID numbers,
   * card expiry) with dots for a screenshot, in the page, its open shadow roots and its frames of
   * this site. Frames from other sites that look like payment or sign-in boxes cannot be reached:
   * their rectangles are returned, and the service worker paints over them.
   */
  function maskSecrets() {
    const rects = [];
    const visit = (root, offset, depth) => {
      if (depth > 6) return;
      let n = 0;
      for (const el of root.querySelectorAll(`input, textarea, [contenteditable], [role="textbox"], ${FRAME_SELECTOR}`)) {
        if (++n > 2000) break;
        if (isFrameHost(el)) {
          if (!showsPage(el)) continue;
          const doc = frameDoc(el);
          const r = el.getBoundingClientRect();
          if (doc) {
            visit(doc, { x: offset.x + r.left + el.clientLeft, y: offset.y + r.top + el.clientTop }, depth + 1);
            continue;
          }
          // Another site's payment or sign-in box (an iframe, or an <object>/<embed> showing one).
          if (secretKind({ iframe: { src: String(el.src || el.data || ''), name: el.getAttribute('name') || '', title: el.title || '', id: el.id || '' } })) {
            rects.push({ x: offset.x + r.left, y: offset.y + r.top, w: r.width, h: r.height });
          }
          continue;
        }
        const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
        if (!secretField(el) && !/\bcc-(exp|exp-month|exp-year|name)\b/.test(ac)) continue;
        if (!masked.has(el)) masked.set(el, [el.style.getPropertyValue('-webkit-text-security'), el.style.getPropertyPriority('-webkit-text-security')]);
        el.style.setProperty('-webkit-text-security', 'disc', 'important');
      }
      for (const host of root.querySelectorAll('*')) if (host.shadowRoot) visit(host.shadowRoot, offset, depth + 1);
    };
    visit(document, { x: 0, y: 0 }, 0);
    return rects.filter((r) => r.w > 0 && r.h > 0 && r.x + r.w > 0 && r.y + r.h > 0 && r.x < innerWidth && r.y < innerHeight);
  }

  function unmaskSecrets() {
    for (const [el, [value, priority]] of masked) {
      try {
        if (value) el.style.setProperty('-webkit-text-security', value, priority);
        else el.style.removeProperty('-webkit-text-security');
      } catch {
        /* the element went away */
      }
    }
    masked.clear();
  }

  const OPS = {
    init({ nextRef, mode } = {}) {
      if (Number.isFinite(nextRef) && nextRef > state.nextRef) state.nextRef = nextRef;
      const shown = mode ? setMode(mode) : true;
      return { ok: true, nextRef: state.nextRef, version: VERSION, noBar: !shown };
    },
    mode: ({ mode }) => ({ ok: true, noBar: !setMode(mode) }),
    /** Whether the bar is shown (it is put back first if it can be): before Jarvis sends input. */
    barState() {
      if (state.mode === 'hidden') return { ok: true, noBar: false };
      let shown = !state.barFailed && !!state.host && state.host.isConnected;
      if (!shown) shown = mountOverlay();
      return { ok: true, noBar: !shown };
    },
    beat() {
      state.lastBeat = Date.now();
      const stop = state.pendingStop;
      let tampered = false;
      let unstyled = false;
      let noBar = false;
      if (state.mode !== 'hidden' && !state.shot) {
        // The page hid, moved or covered the bar (now, or at any check since the last beat): put
        // it back, and tell the service worker when that keeps happening. What counts is the bar's
        // state before the repair: a page that covers it again right after each repair is caught.
        let wasVisible = false;
        try {
          wasVisible = !state.pass && overlayVisible();
        } catch {
          wasVisible = false;
        }
        const sampled = state.sawHidden;
        state.sawHidden = false;
        // (Recorded before the repair: a repair that fails still counts as hidden.)
        state.hiddenBeats.push(!state.pass && (!wasVisible || sampled));
        if (state.hiddenBeats.length > 6) state.hiddenBeats.shift();
        if (!wasVisible && !state.pass) {
          let repaired = false;
          try {
            if (!state.host || !state.host.isConnected) repaired = mountOverlay();
            else {
              restoreHost();
              repaired = true;
            }
            raiseOverlay();
          } catch {
            repaired = false;
          }
          // The bar cannot be built or put back at all: the owner is told at once (not after
          // three beats), and Jarvis holds its input on this page until they say so.
          if (!repaired || state.barFailed) noBar = true;
        }
        unstyled = stylesBlocked();
        if (unstyled) state.hiddenBeats[state.hiddenBeats.length - 1] = false;
        tampered = state.hiddenBeats.filter(Boolean).length >= 3;
      }
      // (Cleared only now: a beat that fails on the way keeps a Stop pressed on the page for the next.)
      if (state.pendingStop === stop) state.pendingStop = null;
      return { ok: true, stop, tampered, unstyled, noBar };
    },
    /** The page rewrote itself (document.open()): listeners and the bar come back at once. */
    heal() {
      ensureListeners();
      if (state.mode !== 'hidden') mountOverlay();
      return { ok: true };
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
    /**
     * Before (on) and after (off) every capture: private fields masked, and the control bar hidden
     * when `bar` (screenshots for Claude; the step thumbnails keep it). Resolves once a frame with
     * that has been rendered (or after 80 ms in a hidden tab), with the rectangles of other
     * sites' payment or sign-in boxes, which the service worker paints over.
     */
    shot: ({ on, bar = true }) => {
      if (!on) {
        state.shot = false;
        state.root?.classList.remove('shot');
        unmaskSecrets();
        return { ok: true };
      }
      const rects = maskSecrets();
      if (bar && state.host && state.host.isConnected && state.root) {
        state.shot = true;
        state.root.classList.add('shot');
      }
      return new Promise((resolve) => {
        const done = () => resolve({ ok: true, rects, viewport: { w: innerWidth, h: innerHeight } });
        const timer = setTimeout(done, 80);
        requestAnimationFrame(() => requestAnimationFrame(() => (clearTimeout(timer), done())));
      });
    },
    pass: ({ on }) => {
      state.pass = !!on;
      if (state.root) state.root.classList.toggle('pass', !!on);
      return { ok: true };
    },
    readPage,
    find,
    pageText,
    resolveTarget,
    hitCheck,
    targetFacts,
    focusInfo,
    formInput,
    previewOption,
    linksTo,
    scrollToRef,
    scrollKey,
    viewport,
    snapPoint,
    arm,
    armedState,
    disarm,
  };

  globalThis.__jarvis = {
    version: VERSION,
    /** The activation check, for the agents of this site's frames (see onActivation). */
    activation: onActivation,
    /** The typing step's focus lock, for the agents of this site's frames (see onFocusLeave). */
    focusLeave: onFocusLeave,
    heal: () => OPS.heal(),
    call(op, args) {
      ensureListeners();
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
    /**
     * Describes an element handle the service worker found inside a closed shadow root (the focused
     * element, or the one at a point: `actionable` describes what a click there activates).
     */
    describeEl(el, { actionable = false } = {}) {
      if (!el || el.nodeType !== 1) return { desc: null, href: location.href };
      const target = actionable ? actionableAncestor(el) : el;
      return { desc: describe(target), name: nameOf(target), role: roleOf(target) || target.localName, ctx: ctxOf(target), item: itemContext(target), href: location.href };
    },
  };
})();
