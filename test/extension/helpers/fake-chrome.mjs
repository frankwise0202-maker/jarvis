// A fake chrome.* layer for unit tests: tabs, chrome.storage, and chrome.debugger with a small
// CDP implementation over fake pages. The page agent's operations (read_page, resolveTarget, …)
// are answered from a page model, so the real driver and executor run unchanged in Node.
//
//   const fb = createFakeBrowser();
//   const tab = fb.addTab({ url: 'https://shop.example/', title: 'Shop', page: { elements: [...] } });
//   fb.chrome  -> pass to Driver / createStore / Controller
//   fb.onCdpEvent = (tabId, method, params) => driver.onCdpEvent(tabId, method, params)
//
// Like the real page agent, the fake page checks input while the executor has it armed ('arm' /
// 'disarm'), deny by default: a click, a key or typed text runs only on the element (target id)
// and with the keys the executor approved for that step; anything else is stopped (the element's
// handler does not run) and reported at disarm.
// Elements can open dialogs (fb.dialog(tab, type, message) -> accepted?), pages can hold their
// load (routes[url].delayMs), ask before unload (page.beforeunload), and keep a focused field
// inside a closed shadow root (focus.shadow = { desc }), which only the debugger can see.

import { classifyAction } from '../../../extension/src/background/guard.js';

/** A minimal valid-looking PNG (signature + IHDR) of w x h, as base64. */
export function fakePng(w, h) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  buf[24] = 8;
  buf[25] = 6;
  return buf.toString('base64');
}

export function pngSize(b64) {
  const buf = Buffer.from(b64, 'base64');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** An encoder for the executor that works on fake PNG headers. */
export const fakeEncoder = {
  async decode(b64) {
    const { w, h } = pngSize(b64);
    return { width: w, height: h };
  },
  async encode(bmp, { w, h, crop }) {
    fakeEncoder.last = { from: [bmp.width, bmp.height], w, h, crop, masked: bmp.masked || [] };
    return fakePng(w, h);
  },
  async mask(bmp, rects) {
    return { ...bmp, masked: [...(bmp.masked || []), ...rects] };
  },
};

export function fakeStorageArea() {
  const data = {};
  return {
    data,
    async get(key) {
      if (key === null || key === undefined) return { ...data };
      const keys = Array.isArray(key) ? key : [key];
      const out = {};
      for (const k of keys) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v);
    },
    async remove(key) {
      for (const k of Array.isArray(key) ? key : [key]) delete data[k];
    },
  };
}

/**
 * Page model: { title, text, viewport: { w, h, dpr }, elements: [el] }
 * el: { role, name, x, y, w, h, desc (guard descriptor), focusable, value, onClick(page, fb), onEnter(page, fb) }
 */
function makePage(spec = {}) {
  return {
    title: spec.title ?? 'Page',
    text: spec.text ?? 'Hello',
    viewport: { w: 1280, h: 800, dpr: 1, ...(spec.viewport || {}) },
    elements: (spec.elements || []).map((e) => ({ focusable: /textbox|searchbox|combobox|button|link|option|switch|checkbox|radio/.test(e.role), value: '', ...e })),
    focus: null,
    body: { name: '', role: 'document', desc: { tag: 'body' } }, // what has the focus when nothing else does
    selection: spec.selection || null,
    refs: new Map(),
    nextRef: 1,
    dialogs: [],
    armed: null,
    beforeunload: !!spec.beforeunload,
  };
}

const descOf = (el) => (el ? { name: el.name, role: el.role, ...(el.desc || {}) } : null);
// As the page agent: an approval binds to the element's name and the item it belongs to.
const ctxOf = (el) => (el ? `${el.name} | ${el.ctx ?? ''}` : '');
const NO_SELECTION = { key: '0|', count: 0, names: [] };
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
const modsOf = (bits) => ['alt', 'ctrl', 'meta', 'shift'].filter((m, i) => bits & [1, 2, 4, 8][i]).join('+');
const arrowsChange = (el) => !!el && (el.desc?.tag === 'select' || /radio|listbox|option|slider|spinbutton|combobox|menuitemradio/.test(el.role || '') || el.desc?.type === 'radio');

export function createFakeBrowser({ windowId = 1 } = {}) {
  const tabs = new Map();
  const calls = [];
  const listeners = { created: [], updated: [], removed: [], activated: [] };
  let nextTabId = 100;
  const fb = {
    tabs,
    calls,
    onCdpEvent: null,
    routes: {}, // url -> page spec for navigation ({ ...spec, delayMs, error })
    infobar: 0, // CSS px Chrome's "started debugging" bar takes from the viewport after the first attach
    activations: [], // { name, via } of every element handler that ran
    blocked: [], // { name, via } of activations the fake page agent stopped
    addTab({ url = 'about:blank', title = '', active = true, page, opener } = {}) {
      const id = nextTabId++;
      if (active) for (const t of tabs.values()) if (t.windowId === windowId) t.active = false;
      const tab = { id, windowId, url, title: page?.title ?? title, active, attached: false, doc: 1, page: makePage(page || { title }), history: [url], index: 0, openerTabId: opener };
      tabs.set(id, tab);
      for (const l of listeners.created) l(publicTab(tab));
      return tab;
    },
    emit(tab, method, params = {}, sessionId) {
      fb.onCdpEvent?.(tab.id, method, params, sessionId);
    },
    /** The page opens a JS dialog; resolves to whether the extension accepted it. */
    dialog(tab, type, message = '') {
      tab.dialogAnswer = undefined;
      fb.emit(tab, 'Page.javascriptDialogOpening', { type, message, url: tab.url });
      return tab.dialogAnswer === true;
    },
    /** Simulates a page navigation with the CDP events Chrome sends. */
    async navigateTab(tab, url, { title } = {}) {
      const spec = fb.routes[url] || { title: title || url };
      fb.emit(tab, 'Page.frameStartedLoading', { frameId: `F${tab.id}` });
      tab.url = url;
      tab.page = makePage(spec);
      tab.title = tab.page.title;
      tab.doc += 1;
      await Promise.resolve();
      fb.emit(tab, 'Page.frameNavigated', { frame: { id: `F${tab.id}`, url } });
      fb.emit(tab, 'Page.domContentEventFired', {});
      fb.emit(tab, 'Page.loadEventFired', {});
      fb.emit(tab, 'Page.frameStoppedLoading', { frameId: `F${tab.id}` });
      for (const l of listeners.updated) l(tab.id, { url, title: tab.title }, publicTab(tab));
    },
  };

  const publicTab = (t) => ({ id: t.id, windowId: t.windowId, url: t.url, title: t.title, active: t.active, openerTabId: t.openerTabId, lastAccessed: Date.now() });

  function elAt(page, x, y) {
    return page.elements.find((e) => x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) || null;
  }

  function refFor(page, el) {
    for (const [ref, e] of page.refs) if (e === el) return ref;
    const ref = `ref_${page.nextRef++}`;
    page.refs.set(ref, el);
    return ref;
  }

  const targetIds = new WeakMap();
  let nextTargetId = 1;
  function targetIdOf(el) {
    if (!targetIds.has(el)) targetIds.set(el, nextTargetId++);
    return targetIds.get(el);
  }

  /** The approved entry of the armed check for `el` (by target id), of one of `kinds`. */
  function entryFor(page, el, kinds) {
    const a = page.armed;
    if (!a || !el) return null;
    return (a.approved || []).find((p) => kinds.includes(p.kind || 'pointer') && p.targetId !== undefined && p.targetId === targetIdOf(el) && (p.ctx === undefined || p.ctx === null || p.ctx === ctxOf(el))) || null;
  }

  function block(page, el, via, why = 'not approved') {
    const c = el ? classifyAction(descOf(el)) : null;
    page.armed.blocked.push({ type: via, category: c?.category || 'change', label: c?.label || el?.name || 'the page', reason: c?.reason || why });
    fb.blocked.push({ name: el?.name || 'the page', via });
  }

  /** Whether the armed check lets key `key` (with CDP modifier bits) land on the focused element. */
  function keyAllowed(page, key, bits) {
    const a = page.armed;
    if (!a) return true;
    const f = page.focus || page.body;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(key)) return true;
    const p = entryFor(page, f, ['key']);
    if (p && (p.keys || []).some((k) => String(k.key).toLowerCase() === String(key).toLowerCase() && (k.mods || '') === modsOf(bits))) return true;
    if (a.scrollOnly && SCROLL_KEYS.has(key) && !(bits & 7) && !arrowsChange(page.focus)) return true;
    return false;
  }

  /** The fake page agent's activation check (see page/agent.js onActivation): deny by default. */
  function activate(page, el, via, run, { byKey = false } = {}) {
    const a = page.armed;
    if (a && !byKey) {
      const p = entryFor(page, el, ['pointer']);
      p && (p.used = (p.used || 0) + 1);
      if (!p || p.used > (p.clicks || 1)) {
        block(page, el, via, p ? 'already activated' : 'not approved');
        return;
      }
    }
    if (a) a.activations += 1;
    fb.activations.push({ name: el.name, via });
    return run();
  }

  function op(tab, name, args = {}) {
    const page = tab.page;
    const line = (e) => `${e.role} "${e.name}"${e.desc?.looksSecret && e.value ? ' value="[hidden]"' : e.value ? ` value="${e.value}"` : ''} [${refFor(page, e)}]`;
    switch (name) {
      case 'init':
        if (args.nextRef > page.nextRef) page.nextRef = args.nextRef;
        return { ok: true, nextRef: page.nextRef };
      case 'mode':
        tab.mode = args.mode;
        return { ok: true };
      case 'beat':
      case 'suppressEsc':
      case 'pass':
      case 'heal':
        return { ok: true };
      case 'shot':
        fb.shots = [...(fb.shots || []), args];
        if (args.on && page.fail?.shot) throw new Error('shot failed');
        return { ok: true, rects: args.on ? page.secretRects || [] : [] };
      case 'viewport':
        return { ...page.viewport, title: page.title, url: tab.url };
      case 'readPage':
        if (args.ref && !page.refs.has(args.ref)) return { error: `Error: ${args.ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
        return { text: `Page: ${page.title}\n${page.elements.map(line).join('\n')}`, nextRef: page.nextRef };
      case 'find': {
        const words = String(args.query).toLowerCase().split(/\s+/);
        const hits = page.elements.filter((e) => words.some((w) => e.name.toLowerCase().includes(w)));
        return { text: hits.length ? hits.map(line).join('\n') : 'No elements matched.', nextRef: page.nextRef };
      }
      case 'pageText':
        return { text: `Title: ${page.title}\n\n${page.text}` };
      case 'resolveTarget': {
        let el;
        const selection = page.selection || NO_SELECTION;
        if (args.ref !== undefined) {
          el = page.refs.get(args.ref);
          if (!el) return { error: `Error: ${args.ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
          return { x: el.x + el.w / 2, y: el.y + el.h / 2, desc: descOf(el), name: el.name, role: el.role, targetId: targetIdOf(el), ctx: ctxOf(el), item: el.ctx ?? '', selection };
        }
        el = elAt(page, args.x, args.y);
        return el ? { x: args.x, y: args.y, desc: descOf(el), name: el.name, role: el.role, targetId: targetIdOf(el), ctx: ctxOf(el), item: el.ctx ?? '', selection } : { desc: null, selection };
      }
      case 'hitCheck': {
        const el = elAt(page, args.x, args.y);
        return { same: !!el && targetIdOf(el) === args.targetId, desc: descOf(el), name: el?.name || '', ctx: ctxOf(el), targetId: el ? targetIdOf(el) : undefined };
      }
      case 'focusInfo': {
        const selection = page.selection || NO_SELECTION;
        return page.focus ? { desc: descOf(page.focus), name: page.focus.name, role: page.focus.role, targetId: targetIdOf(page.focus), ctx: ctxOf(page.focus), item: page.focus.ctx ?? '', selection } : { desc: null, targetId: targetIdOf(page.body), ctx: '', selection };
      }
      case 'linksTo': {
        const links = page.elements.filter((e) => e.desc?.href && e.desc.href === args.url).map((e) => ({ desc: descOf(e), targetId: targetIdOf(e), ctx: ctxOf(e), item: e.ctx ?? '' }));
        return { links };
      }
      case 'formInput': {
        const el = page.refs.get(args.ref);
        if (!el) return { error: `Error: ${args.ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
        if (el.desc?.looksSecret) return { error: 'secret' };
        if (el.desc?.options) {
          const opt = el.desc.options.find((o) => o.toLowerCase().includes(String(args.value).toLowerCase()));
          if (!opt) return { error: `Error: ${args.ref} has no option "${args.value}".` };
          el.value = opt;
          el.onChange?.(page, fb, tab, opt);
          return { text: `Selected "${opt}" in ${args.ref}.` };
        }
        if (typeof args.value === 'boolean') {
          if (!!el.desc?.checked !== args.value) {
            el.desc = { ...(el.desc || {}), checked: args.value };
            el.onChange?.(page, fb, tab, args.value);
          }
          return { text: `${args.value ? 'Checked' : 'Unchecked'} ${args.ref}.` };
        }
        el.value = String(args.value);
        return { text: `Set ${args.ref} to "${el.value}".` };
      }
      case 'previewOption': {
        const el = page.refs.get(args.ref);
        const opt = el?.desc?.options?.find((o) => o.toLowerCase().includes(String(args.value).toLowerCase()));
        return { option: opt ? { text: opt, value: opt, selected: el.value === opt } : null, selectName: el?.name || '' };
      }
      case 'arm': {
        const approved = (args.approved || []).map((p) => ({ ...p }));
        page.armed = { approved, scrollOnly: !!args.scrollOnly, activations: 0, blocked: [] };
        fb.armedLog = [...(fb.armedLog || []), args.approved || []];
        const known = new Set(page.elements.map(targetIdOf).concat([targetIdOf(page.body)]));
        return { ok: true, missing: approved.filter((p) => p.targetId !== undefined && !known.has(p.targetId)).length };
      }
      case 'disarm': {
        const a = page.armed;
        page.armed = null;
        if (page.rewritten) {
          page.rewritten = false;
          return { ok: true, blocked: a ? a.blocked : [], activations: a ? a.activations : 0, intact: false };
        }
        return { ok: true, blocked: a ? a.blocked : [], activations: a ? a.activations : 0, intact: true };
      }
      case 'scrollToRef': {
        const el = page.refs.get(args.ref);
        if (!el) return { error: `Error: ${args.ref} is stale or not found on the current page. Re-read the page to get fresh references.` };
        return { text: `Scrolled ${args.ref} into view.`, name: el.name, role: el.role };
      }
      default:
        return { error: `unknown op ${name}` };
    }
  }

  const OBJECTS = new Map(); // fake remote object ids -> what they stand for

  async function cdp(tab, method, params = {}, sessionId) {
    calls.push({ tabId: tab.id, method, params, sessionId });
    if (!tab.attached) throw new Error('Debugger is not attached to the tab with id: ' + tab.id);
    const page = tab.page;
    if (sessionId) {
      // A child frame's session (a frame from another site): its address, what is at a point in
      // it (a nested frame, or nothing Jarvis needs), and what has its focus.
      const child = (tab.childFrames || []).find((f) => f.sessionId === sessionId);
      if (!child) throw new Error('No session with given id');
      if (method === 'Runtime.evaluate' && params.expression === 'location.href') return { result: { type: 'string', value: child.url } };
      if (method === 'Runtime.evaluate' && params.expression === 'document.activeElement') {
        if (child.focusFrame) return { result: { type: 'object', objectId: `obj:childfocus:${child.focusFrame}` } };
        return { result: { type: 'object', objectId: 'obj:childbody' } };
      }
      if (method === 'Target.setAutoAttach' || method === 'Runtime.releaseObjectGroup') return {};
      if (method === 'DOM.getNodeForLocation') {
        const inner = (child.frames || []).find((f) => params.x >= f.x && params.x <= f.x + f.w && params.y >= f.y && params.y <= f.y + f.h);
        return inner ? { backendNodeId: `nested:${inner.frameId}` } : { backendNodeId: 7 };
      }
      if (method === 'DOM.describeNode') {
        const id = params.backendNodeId !== undefined ? String(params.backendNodeId) : String(params.objectId || '');
        const m = /^(?:nested|obj:childfocus):(.+)$/.exec(id);
        if (m) return { node: { nodeName: 'IFRAME', frameId: m[1], attributes: [] } };
        return { node: { nodeName: 'BUTTON' } };
      }
      if (method === 'DOM.getBoxModel') {
        const inner = (child.frames || []).find((f) => `nested:${f.frameId}` === String(params.backendNodeId));
        if (!inner) throw new Error('No node');
        return { model: { content: [inner.x, inner.y, inner.x + inner.w, inner.y, inner.x + inner.w, inner.y + inner.h, inner.x, inner.y + inner.h] } };
      }
      throw new Error(`fake CDP (child): ${method} not implemented`);
    }
    switch (method) {
      case 'Page.enable':
      case 'Runtime.addBinding':
      case 'Runtime.releaseObjectGroup':
      case 'Fetch.enable':
        return {};
      case 'DOM.getBoxModel': {
        const el = [...OBJECTS.values()].find((e) => e && 1000 + targetIdOf(e) === params.backendNodeId);
        if (!el) throw new Error('No node with given id found');
        return { model: { content: [el.x, el.y, el.x + el.w, el.y, el.x + el.w, el.y + el.h, el.x, el.y + el.h] } };
      }
      case 'Page.handleJavaScriptDialog':
        tab.dialogAnswer = !!params.accept;
        return {};
      case 'Page.addScriptToEvaluateOnNewDocument':
        tab.earlyScripts = [...(tab.earlyScripts || []), params];
        return { identifier: String(tab.earlyScripts.length) };
      case 'Target.setAutoAttach':
        tab.autoAttach = params;
        return {};
      case 'Page.getLayoutMetrics':
        // Only answered when a test simulates Chrome's debugging bar (fb.infobar): otherwise the
        // driver skips waiting for the viewport to settle (which takes up to 0.7 s).
        if (!fb.infobar) throw new Error('fake CDP: Page.getLayoutMetrics not implemented');
        return { cssLayoutViewport: { clientWidth: page.viewport.w, clientHeight: page.viewport.h, pageX: 0, pageY: 0 } };
      case 'DOM.getNodeForLocation': {
        const el = elAt(page, params.x, params.y);
        if (!el) return { backendNodeId: 1 };
        OBJECTS.set(`node:${targetIdOf(el)}`, el);
        return { backendNodeId: 1000 + targetIdOf(el), frameId: `F${tab.id}` };
      }
      case 'DOM.describeNode': {
        if (params.backendNodeId !== undefined) {
          const el = [...OBJECTS.values()].find((e) => e && 1000 + targetIdOf(e) === params.backendNodeId);
          if (el?.desc?.iframe) return { node: { nodeName: 'IFRAME', frameId: el.desc.frameId || 'FRAME1', attributes: ['src', el.desc.iframe.src || ''] } };
          return { node: { nodeName: String(el?.desc?.tag || 'div').toUpperCase() } };
        }
        const obj = OBJECTS.get(params.objectId);
        if (obj?.kind === 'focus' && page.focus?.shadow) return { node: { nodeName: String(page.focus.desc?.tag || 'x-box').toUpperCase(), shadowRoots: [{ shadowRootType: page.focus.shadow.mode || 'closed', backendNodeId: 9001 }] } };
        if (obj?.kind === 'focus' && page.focus?.desc?.iframe) return { node: { nodeName: 'IFRAME', frameId: page.focus.desc.frameId || 'FR1', attributes: ['src', page.focus.desc.iframe.src || ''] } };
        return { node: { nodeName: 'INPUT' } };
      }
      case 'DOM.resolveNode':
        if (params.backendNodeId === 9001) {
          OBJECTS.set('obj:root', { kind: 'root' });
          return { object: { objectId: 'obj:root' } };
        }
        throw new Error('No node with given id found');
      case 'Page.getFrameTree':
        return { frameTree: { frame: { id: `F${tab.id}`, url: tab.url } } };
      case 'Page.createIsolatedWorld':
        return { executionContextId: tab.doc * 1000 + tab.id };
      case 'Runtime.evaluate':
        if (params.expression === 'document.activeElement' && page.focus) {
          OBJECTS.set('obj:focus', { kind: 'focus' });
          return { result: { type: 'object', objectId: 'obj:focus' } };
        }
        return { result: { type: 'undefined' } };
      case 'Runtime.callFunctionOn': {
        if (params.objectId === 'obj:root') {
          if (page.fail?.pierce) throw new Error('pierce failed');
          OBJECTS.set('obj:inner', { kind: 'inner' });
          return { result: { type: 'object', objectId: 'obj:inner' } };
        }
        if (params.objectId === 'obj:inner') {
          const inner = page.focus?.shadow;
          return { result: { type: 'object', value: { desc: inner?.desc || null, name: inner?.desc?.name || '', role: inner?.desc?.role || '', href: tab.url } } };
        }
        if (params.executionContextId !== tab.doc * 1000 + tab.id) throw new Error('Cannot find context with specified id');
        const [opName, args] = params.arguments.map((a) => a.value);
        const value = op(tab, opName, args);
        if (value && typeof value === 'object') value.href = tab.url;
        return { result: { type: 'object', value } };
      }
      case 'Page.captureScreenshot': {
        const { w, h, dpr } = page.viewport;
        return { data: fakePng(Math.round(w * dpr), Math.round(h * dpr)) };
      }
      case 'Input.dispatchMouseEvent': {
        if (params.type === 'mouseMoved') {
          const el = elAt(page, params.x, params.y);
          if (el?.onHover) await el.onHover(page, fb, tab);
        }
        if (params.type === 'mousePressed' && params.button === 'left') {
          let el = elAt(page, params.x, params.y);
          // The armed check stops a press on anything not approved (the page never sees it).
          if (page.armed && el && !entryFor(page, el, ['pointer'])) {
            block(page, el, 'mousedown');
            tab.pressed = null;
            return {};
          }
          // A page that re-renders on mousedown (after every check Jarvis could make).
          if (el?.onPress) {
            await el.onPress(page, fb, tab);
            el = elAt(page, params.x, params.y);
          }
          if (el?.focusable) page.focus = el;
          tab.pressed = el;
        }
        if (params.type === 'mouseReleased' && params.button === 'left') {
          // A click goes to the element pressed and released on (as in Chrome).
          const el = elAt(page, params.x, params.y);
          if (el && el === tab.pressed) await activate(page, el, `click${params.clickCount}`, () => el.onClick?.(page, fb, tab));
          else if (el && page.armed && !entryFor(page, el, ['pointer'])) block(page, el, 'mouseup');
          tab.pressed = null;
        }
        return {};
      }
      case 'Input.insertText':
        if (page.armed && !entryFor(page, page.focus, ['type'])) {
          block(page, page.focus, 'beforeinput', 'text going somewhere not approved');
          return {};
        }
        if (page.focus) page.focus.value += params.text;
        return {};
      case 'Input.dispatchKeyEvent': {
        const f = page.focus;
        const buttonish = f && /button|link|switch|checkbox|radio|option/.test(f.role);
        const down = params.type === 'rawKeyDown' || params.type === 'keyDown';
        if (down && !keyAllowed(page, params.key, params.modifiers || 0)) {
          block(page, f, 'keydown', `the key ${params.key}`);
          page.blockedKey = params.key;
          return {};
        }
        if (params.type === 'keyUp' && page.blockedKey === params.key) {
          page.blockedKey = null;
          return {};
        }
        if (params.type === 'keyDown' && params.key === 'Enter' && !(params.modifiers & 8)) {
          if (buttonish) await activate(page, f, 'enter', () => f.onClick?.(page, fb, tab), { byKey: true });
          else if (f?.onEnter) await (f.submitsTo ? activate(page, { name: f.submitsTo, role: 'button', desc: { tag: 'button', isSubmit: true } }, 'submit', () => f.onEnter(page, fb, tab), { byKey: true }) : f.onEnter(page, fb, tab));
        }
        // Space presses a focused button (or flips a switch) when it is released, whatever modifiers are held.
        if (params.type === 'keyUp' && params.key === ' ' && buttonish) await activate(page, f, 'space', () => f.onClick?.(page, fb, tab), { byKey: true });
        if (down) await page.onKey?.(page, fb, tab, params);
        return {};
      }
      case 'Page.navigate': {
        const url = params.url;
        if (fb.routes[url]?.error) return { frameId: `F${tab.id}`, errorText: fb.routes[url].error };
        // An address that is a file: Chrome downloads it and the tab stays where it was.
        if (fb.routes[url]?.download) {
          fb.downloads = [...(fb.downloads || []), url];
          return { frameId: `F${tab.id}`, errorText: 'net::ERR_ABORTED', isDownload: true };
        }
        // "Leave site? Changes you made may not be saved."
        if (page.beforeunload && !fb.dialog(tab, 'beforeunload', '')) return { frameId: `F${tab.id}`, errorText: 'net::ERR_ABORTED' };
        tab.history = tab.history.slice(0, tab.index + 1).concat(url);
        tab.index = tab.history.length - 1;
        const delay = fb.routes[url]?.delayMs ?? 5;
        if (fb.routes[url]?.delayMs) fb.emit(tab, 'Page.frameStartedLoading', { frameId: `F${tab.id}` });
        setTimeout(() => fb.navigateTab(tab, url), delay);
        return { frameId: `F${tab.id}`, loaderId: `L${tab.doc + 1}` };
      }
      case 'Page.getNavigationHistory':
        return { currentIndex: tab.index, entries: tab.history.map((url, i) => ({ id: i, url, transitionType: (tab.transitions || [])[i] || 'typed' })) };
      case 'Page.navigateToHistoryEntry':
        tab.index = params.entryId;
        setTimeout(() => fb.navigateTab(tab, tab.history[tab.index]), 5);
        return {};
      case 'Page.reload':
        fb.reloads = (fb.reloads || 0) + 1;
        // After one reload Chrome reports a form result's entry as "reload".
        if (tab.transitions) tab.transitions[tab.index] = 'reload';
        setTimeout(() => fb.navigateTab(tab, tab.url), 5);
        return {};
      default:
        throw new Error(`fake CDP: ${method} not implemented`);
    }
  }

  fb.chrome = {
    runtime: { id: 'fake-extension-id' },
    debugger: {
      async attach({ tabId }) {
        const t = tabs.get(tabId);
        if (!t) throw new Error(`No tab with given id ${tabId}.`);
        if (/^chrome:/.test(t.url)) throw new Error('Cannot access a chrome:// URL');
        if (fb.attachDelayMs) await new Promise((r) => setTimeout(r, fb.attachDelayMs));
        t.attached = true;
        // Chrome's debugging bar appears a moment after the first session starts.
        const others = [...tabs.values()].some((o) => o !== t && o.attached);
        if (fb.infobar && !others && !fb.infobarShown) {
          fb.infobarShown = true;
          setTimeout(() => {
            for (const o of tabs.values()) o.page.viewport = { ...o.page.viewport, h: o.page.viewport.h - fb.infobar };
          }, fb.infobarDelayMs ?? 150);
        }
      },
      async detach({ tabId }) {
        const t = tabs.get(tabId);
        if (!t || !t.attached) throw new Error('Debugger is not attached');
        t.attached = false;
      },
      sendCommand({ tabId, sessionId }, method, params) {
        const t = tabs.get(tabId);
        if (!t) return Promise.reject(new Error(`No tab with given id ${tabId}.`));
        return cdp(t, method, params, sessionId);
      },
    },
    tabs: {
      async get(id) {
        const t = tabs.get(id);
        if (!t) throw new Error(`No tab with id: ${id}.`);
        return publicTab(t);
      },
      async query() {
        return [...tabs.values()].map(publicTab);
      },
      async create({ url = 'about:blank', active = true }) {
        return publicTab(fb.addTab({ url, active }));
      },
      async update(id, props) {
        const t = tabs.get(id);
        if (!t) throw new Error(`No tab with id: ${id}.`);
        if (props.active) {
          for (const o of tabs.values()) if (o.windowId === t.windowId) o.active = false;
          t.active = true;
          for (const l of listeners.activated) l({ tabId: id, windowId: t.windowId });
        }
        if (props.url) await fb.navigateTab(t, props.url);
        return publicTab(t);
      },
      async remove(id) {
        tabs.delete(id);
        for (const l of listeners.removed) l(id);
      },
      onCreated: { addListener: (fn) => listeners.created.push(fn) },
      onUpdated: { addListener: (fn) => listeners.updated.push(fn) },
      onRemoved: { addListener: (fn) => listeners.removed.push(fn) },
      onActivated: { addListener: (fn) => listeners.activated.push(fn) },
    },
    storage: { local: fakeStorageArea(), session: fakeStorageArea(), sync: fakeStorageArea() },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  };
  return fb;
}
