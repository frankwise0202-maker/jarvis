// The browser driver: Jarvis's hands in the owner's real Chrome tabs, through chrome.debugger
// (the Chrome DevTools Protocol) and chrome.tabs. It knows nothing about Claude's tool contract;
// executor.js maps member calls onto it.
//
//   - Tab registry: the tabs this conversation works with get tool ids "tab-1", "tab-2", ...
//     (never reused while the conversation lasts); browser_state reports only these tabs.
//   - Debugger sessions are attached lazily per tab and released all at once (stop, take over,
//     end of task). The "chrome" object is injected so unit tests can pass a fake CDP/tabs layer.
//   - The page agent (extension/src/page/agent.js) runs in an isolated world in each document,
//     injected at document start (Page.addScriptToEvaluateOnNewDocument) so its Esc and activation
//     listeners come before the page's own; its Stop button and Esc reach us through the
//     `__jarvisBar` binding (Runtime.bindingCalled) without enabling the Runtime domain (which
//     pages can detect).
//   - Frames from other sites run in their own processes: Target auto-attach gives a session per
//     frame, used only to learn which site a frame really shows.

import { abortError, sleep, untilAborted, withTimeout } from '../shared/util.js';
import { sanitizeTitle, sanitizeUrl } from './sites.js';

export const WORLD = 'jarvis-control';
export const BINDING = '__jarvisBar';
const CALL_PAGE = 'function (op, args) { return globalThis.__jarvis ? globalThis.__jarvis.call(op, args) : { error: "__agent_missing__" }; }';
const CDP_TIMEOUT_MS = 15000;
const HEARTBEAT_MS = 1000;

const CONTEXT_GONE = /Cannot find context|Execution context was destroyed|context with specified id|Inspected target navigated|No frame with given id|Frame with the given id was not found/i;

/** Navigation stopped by the page's "Leave site?" (beforeunload) check: the owner's unsaved work stays. */
function unsavedChanges(t) {
  return `Error: ${t.toolId} has unsaved changes (the page asked before leaving), so Jarvis kept it open and did not navigate. Don't navigate this tab away: use new_tab for this task, or ask the owner to save or discard their work first.`;
}

export class DriverError extends Error {
  constructor(message, { code } = {}) {
    super(message);
    this.code = code;
  }
}

export class Driver {
  /**
   * @param {object} opts
   * @param {object} opts.chrome        chrome-like API: debugger, tabs, windows
   * @param {string} opts.pageSource    the page agent script (an IIFE)
   * @param {(info) => void} [opts.onStopRequest]   Stop/Esc pressed in a page
   * @param {(toolId, dialog) => boolean} [opts.onDialog]  accept a JS dialog?
   * @param {(toolId, reason) => void} [opts.onDetach]     a debugger session ended unexpectedly
   */
  constructor({ chrome, pageSource = '', onStopRequest = () => {}, onDialog = () => true, onDetach = () => {} }) {
    this.chrome = chrome;
    this.pageSource = pageSource;
    this.onStopRequest = onStopRequest;
    this.onDialog = onDialog;
    this.onDetachCb = onDetach;
    this.tabs = new Map(); // toolId -> TabState
    this.byChrome = new Map(); // chrome tab id -> toolId
    this.nextNum = 1;
    this.activeToolId = null;
    this.windowId = null;
    this.changes = []; // tab_opened state changes not yet reported
    this.dialogs = []; // dialogs handled since the last report
    this.mode = 'hidden';
    this.detaching = new Set();
    this.heartbeat = 0;
    this.suppressEscUntil = 0; // Jarvis itself is pressing Escape until then
    this.onTamper = () => {}; // the page keeps hiding or covering the control bar
    // Debugger sessions may only be (re)attached while a task is acting: after Stop or Take over
    // an action still in flight fails instead of quietly taking control again.
    this.allowAttach = false;
  }

  /** Allows debugger sessions (a task starts or resumes acting). */
  enable() {
    this.allowAttach = true;
  }

  // -------------------------------------------------------------------------------------------
  // Registry

  /** Registers a Chrome tab (if new) and returns its tool id. */
  register(tab, { opened = false } = {}) {
    const existing = this.byChrome.get(tab.id);
    if (existing) {
      const t = this.tabs.get(existing);
      if (tab.url !== undefined) t.url = tab.url || t.url;
      if (tab.title !== undefined) t.title = tab.title || '';
      return existing;
    }
    const toolId = `tab-${this.nextNum++}`;
    this.tabs.set(toolId, {
      toolId,
      chromeId: tab.id,
      windowId: tab.windowId,
      url: tab.pendingUrl || tab.url || 'about:blank',
      title: tab.title || '',
      attached: false,
      ctx: null,
      docSeq: 0,
      ctxDoc: -1,
      nextRef: 1,
      frameId: null,
      navSeq: 0,
      loadSeq: 0,
      domSeq: 0,
      loading: false,
      frame: null, // the latest screenshot frame { w, h, scale, cssW, cssH, dpr }
      waiters: new Set(),
      frames: new Map(), // out-of-process child frames: targetId (= frameId) -> { sessionId, url }
      dialogArm: null, // a confirm() the owner's approval covers (see armDialog)
      unloadBlocked: false, // the page asked before leaving (beforeunload) and Jarvis said no
    });
    this.byChrome.set(tab.id, toolId);
    if (opened) this.changes.push({ type: 'tab_opened', tab_id: toolId });
    return toolId;
  }

  /** Re-creates a registry entry saved before a service-worker restart. */
  restoreTab({ toolId, chromeId, url, title, nextRef }) {
    const id = this.register({ id: chromeId, url, title });
    const t = this.tabs.get(id);
    this.tabs.delete(id);
    t.toolId = toolId;
    t.nextRef = nextRef || 1;
    this.tabs.set(toolId, t);
    this.byChrome.set(chromeId, toolId);
    const n = Number(String(toolId).replace(/^tab-/, ''));
    if (Number.isFinite(n)) this.nextNum = Math.max(this.nextNum, n + 1);
  }

  get(toolId) {
    const t = this.tabs.get(String(toolId));
    return t && !t.closed ? t : null;
  }

  /** The tab a call without tab_id acts on. */
  active() {
    const t = this.activeToolId ? this.get(this.activeToolId) : null;
    if (t) return t;
    const open = [...this.tabs.values()].filter((x) => !x.closed);
    return open[open.length - 1] || null;
  }

  openTabs() {
    return [...this.tabs.values()].filter((t) => !t.closed);
  }

  /** browser_state `tabs`: the full inventory, exactly one active entry when not empty. */
  inventory() {
    const open = this.openTabs();
    let active = this.active();
    if (!active && open.length) active = open[0];
    return open.map((t) => ({
      tab_id: t.toolId,
      title: sanitizeTitle(t.title),
      url: sanitizeUrl(t.url || 'about:blank'),
      ...(active && t.toolId === active.toolId ? { active: true } : {}),
    }));
  }

  /** Takes the state changes (tabs opened by the page) that happened since the last call. */
  drainChanges() {
    const open = new Set(this.openTabs().map((t) => t.toolId));
    const out = this.changes.filter((c) => c.type !== 'tab_opened' || open.has(c.tab_id));
    this.changes = [];
    return out;
  }

  drainDialogs() {
    const out = this.dialogs;
    this.dialogs = [];
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // Chrome tab events (wired by the service worker)

  onTabCreated(tab) {
    if (tab.openerTabId !== undefined && this.byChrome.has(tab.openerTabId)) {
      const id = this.register(tab, { opened: true });
      if (tab.active) this.activeToolId = id;
    }
  }

  onTabUpdated(tabId, info, tab) {
    const id = this.byChrome.get(tabId);
    if (!id) return;
    const t = this.tabs.get(id);
    if (tab?.url !== undefined || info.url) t.url = info.url || tab.url || t.url;
    if (info.title !== undefined || tab?.title !== undefined) t.title = info.title ?? tab.title ?? t.title;
  }

  onTabActivated({ tabId }) {
    const id = this.byChrome.get(tabId);
    if (id && this.get(id)) this.activeToolId = id;
  }

  onTabRemoved(tabId) {
    const id = this.byChrome.get(tabId);
    if (!id) return;
    const t = this.tabs.get(id);
    t.closed = true;
    t.attached = false;
    this.byChrome.delete(tabId);
    if (this.activeToolId === id) {
      const rest = this.openTabs();
      this.activeToolId = rest.length ? rest[rest.length - 1].toolId : null;
    }
    for (const w of t.waiters) w.reject(new DriverError(`Error: ${id} was closed.`));
  }

  // -------------------------------------------------------------------------------------------
  // CDP plumbing

  async cdp(t, method, params = {}, { timeoutMs = CDP_TIMEOUT_MS } = {}) {
    if (!t || t.closed) throw new DriverError('Error: that tab is closed.');
    if (!t.attached) await this.attach(t); // refused after Stop / Take over (see allowAttach)
    try {
      return await withTimeout(this.chrome.debugger.sendCommand({ tabId: t.chromeId }, method, params), timeoutMs, `Error: the page did not respond to ${method} within ${Math.round(timeoutMs / 1000)} s.`);
    } catch (err) {
      const msg = String(err?.message || err);
      if (/not attached|Detached while handling|No tab with given id|Debugger is not attached/i.test(msg)) t.attached = false;
      throw err;
    }
  }

  async attach(t) {
    if (t.attached) return;
    if (!this.allowAttach) throw new DriverError('Error: Jarvis is not in control of the browser right now.', { code: 'released' });
    if (t.attaching) return t.attaching;
    const send = (method, params = {}) => this.chrome.debugger.sendCommand({ tabId: t.chromeId }, method, params);
    // Chrome shows its "started debugging this browser" bar when the first session starts; it
    // makes the page shorter a moment later.
    const firstSession = !this.openTabs().some((o) => o !== t && (o.attached || o.attaching));
    t.attaching = (async () => {
      try {
        await this.chrome.debugger.attach({ tabId: t.chromeId }, '1.3');
      } catch (err) {
        const msg = String(err?.message || err);
        if (!/already attached/i.test(msg)) {
          throw new DriverError(`Error: Jarvis could not take control of this tab (${msg.replace(/^Error:\s*/, '')}).`, { code: 'attach' });
        }
      }
      // Stop or Take over while Chrome was attaching: let go at once instead of acting.
      if (!this.allowAttach) {
        await this.detachTab(t);
        throw new DriverError('Error: Jarvis is not in control of the browser right now.', { code: 'released' });
      }
      t.attached = true;
      t.ctx = null;
      t.ctxDoc = -1;
      t.frames = new Map();
      const before = firstSession ? await this.viewportHeight(t) : 0;
      await send('Page.enable', {});
      try {
        await send('Runtime.addBinding', { name: BINDING, executionContextName: WORLD });
      } catch {
        /* older Chrome: bindings are added per context in world() */
      }
      // The page agent runs at the start of every later document, before the page's scripts.
      if (this.pageSource) await send('Page.addScriptToEvaluateOnNewDocument', { source: this.pageSource, worldName: WORLD }).catch(() => {});
      // A session per frame from another site (to know which site it shows).
      await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{ type: 'iframe', exclude: false }, { exclude: true }] }).catch(() => send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }).catch(() => {}));
      if (firstSession && before) await this.settleViewport(t, before);
      if (!this.allowAttach || !t.attached) {
        await this.detachTab(t);
        throw new DriverError('Error: Jarvis is not in control of the browser right now.', { code: 'released' });
      }
      this.startHeartbeat();
    })();
    try {
      await t.attaching;
    } finally {
      t.attaching = null;
    }
  }

  async detachTab(t) {
    this.detaching.add(t.chromeId);
    t.attached = false;
    t.ctx = null;
    try {
      await this.chrome.debugger.detach({ tabId: t.chromeId });
    } catch {
      /* already gone */
    } finally {
      this.detaching.delete(t.chromeId);
    }
  }

  async viewportHeight(t) {
    try {
      const m = await this.chrome.debugger.sendCommand({ tabId: t.chromeId }, 'Page.getLayoutMetrics', {});
      return Math.round((m.cssLayoutViewport || m.layoutViewport)?.clientHeight || 0);
    } catch {
      return 0;
    }
  }

  /** Waits (up to ~0.7 s) for Chrome's debugging bar to resize the page, so every screenshot has one size. */
  async settleViewport(t, before, { maxMs = 700, stepMs = 100 } = {}) {
    for (let waited = 0; waited < maxMs; waited += stepMs) {
      await sleep(stepMs);
      if (!this.allowAttach) return;
      const h = await this.viewportHeight(t);
      if (h && h !== before) {
        await sleep(stepMs);
        t.frame = null;
        return;
      }
    }
  }

  /** CDP events for any tab (wired from chrome.debugger.onEvent; `sessionId` set for child frames). */
  onCdpEvent(tabId, method, params = {}, sessionId = undefined) {
    const id = this.byChrome.get(tabId);
    const t = id ? this.tabs.get(id) : null;
    if (method === 'Runtime.bindingCalled' && params.name === BINDING) {
      let payload = {};
      try {
        payload = JSON.parse(params.payload);
      } catch {
        /* ignore */
      }
      if (payload.type !== 'stop') return;
      if (this.mode === 'hidden' && payload.via === 'esc') return; // Esc while Jarvis is not acting
      if (payload.via === 'esc' && Date.now() < this.suppressEscUntil) return; // Jarvis's own Escape
      this.onStopRequest({ via: payload.via || 'page', toolId: id });
      return;
    }
    if (!t) return;
    if (method === 'Target.attachedToTarget' && params.targetInfo?.type === 'iframe') {
      t.frames.set(params.targetInfo.targetId, { sessionId: params.sessionId, url: params.targetInfo.url || '' });
      return;
    }
    if (method === 'Target.detachedFromTarget') {
      for (const [k, f] of t.frames) if (f.sessionId === params.sessionId) t.frames.delete(k);
      return;
    }
    if (method === 'Target.targetInfoChanged' && t.frames.has(params.targetInfo?.targetId)) {
      t.frames.get(params.targetInfo.targetId).url = params.targetInfo.url || '';
      return;
    }
    if (sessionId) return; // other events from a child frame's session
    const mainFrame = (frameId) => !t.frameId || frameId === t.frameId;
    switch (method) {
      case 'Page.frameStartedLoading':
        if (mainFrame(params.frameId)) {
          t.loading = true;
          t.navSeq++;
        }
        break;
      case 'Page.frameRequestedNavigation':
        // Only a navigation of this tab (a link opening in a new tab leaves this page as it is).
        if (mainFrame(params.frameId) && (!params.disposition || params.disposition === 'currentTab')) t.navSeq++;
        break;
      case 'Page.frameNavigated':
        if (!params.frame?.parentId) {
          t.frameId = params.frame.id;
          t.docSeq++;
          t.ctx = null;
          // Chrome's own error page (chrome-error://) stands for the address it could not load.
          if (params.frame.unreachableUrl) t.url = params.frame.unreachableUrl;
          else if (params.frame.url) t.url = params.frame.url + (params.frame.urlFragment || '');
          // Put the control bar back on the new document right away.
          if (this.mode !== 'hidden') this.page(t, 'mode', { mode: this.mode }).catch(() => {});
        }
        break;
      case 'Page.navigatedWithinDocument':
        if (mainFrame(params.frameId) && params.url) t.url = params.url;
        break;
      case 'Page.domContentEventFired':
        t.domSeq++;
        break;
      case 'Page.loadEventFired':
        t.loadSeq++;
        t.loading = false;
        break;
      case 'Page.frameStoppedLoading':
        if (mainFrame(params.frameId)) t.loading = false;
        break;
      case 'Page.javascriptDialogOpening': {
        const dialog = { type: params.type, message: String(params.message || '').slice(0, 300), url: params.url };
        let accept = false;
        try {
          accept = !!this.onDialog(id, dialog);
        } catch {
          accept = false;
        }
        // "Leave site? Changes you made may not be saved": Jarvis stays (the owner's unsaved work).
        if (params.type === 'beforeunload' && !accept) t.unloadBlocked = true;
        this.dialogs.push({ ...dialog, accepted: accept, toolId: id });
        this.chrome.debugger.sendCommand({ tabId }, 'Page.handleJavaScriptDialog', { accept }).catch(() => {});
        break;
      }
      default:
        break;
    }
    for (const w of [...t.waiters]) w.check();
  }

  /** chrome.debugger.onDetach: Chrome ended a session (tab closed, or the owner pressed Cancel). */
  onDetached(tabId, reason) {
    const id = this.byChrome.get(tabId);
    const t = id ? this.tabs.get(id) : null;
    if (t) {
      t.attached = false;
      t.ctx = null;
    }
    if (this.detaching.has(tabId)) return;
    if (t) this.onDetachCb(id, reason);
  }

  waitFor(t, pred, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
      const w = {
        check: () => {
          if (pred()) finish(resolve, true);
        },
        reject: (e) => finish(reject, e),
      };
      const timer = setTimeout(() => finish(resolve, false), timeoutMs);
      const onAbort = () => finish(reject, abortError());
      function finish(fn, v) {
        clearTimeout(timer);
        t.waiters.delete(w);
        signal?.removeEventListener('abort', onAbort);
        fn(v);
      }
      if (signal?.aborted) return finish(reject, abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
      t.waiters.add(w);
      w.check();
    });
  }

  // -------------------------------------------------------------------------------------------
  // The page agent

  async world(t) {
    if (t.ctx && t.ctxDoc === t.docSeq) return t.ctx;
    if (!t.attached) await this.attach(t);
    const { frameTree } = await this.cdp(t, 'Page.getFrameTree');
    t.frameId = frameTree.frame.id;
    if (frameTree.frame.unreachableUrl) t.url = frameTree.frame.unreachableUrl;
    else if (frameTree.frame.url) t.url = frameTree.frame.url + (frameTree.frame.urlFragment || '');
    const doc = t.docSeq;
    const { executionContextId } = await this.cdp(t, 'Page.createIsolatedWorld', { frameId: t.frameId, worldName: WORLD });
    try {
      await this.cdp(t, 'Runtime.addBinding', { name: BINDING, executionContextId });
    } catch {
      /* already there */
    }
    const evald = await this.cdp(t, 'Runtime.evaluate', { expression: this.pageSource, contextId: executionContextId, returnByValue: true });
    if (evald?.exceptionDetails) throw new DriverError(`Error: the page agent failed to start (${evald.exceptionDetails.exception?.description || evald.exceptionDetails.text}).`);
    t.ctx = executionContextId;
    t.ctxDoc = doc;
    const init = await this.callIn(t, executionContextId, 'init', { nextRef: t.nextRef, mode: this.mode });
    if (init && Number.isFinite(init.nextRef)) t.nextRef = Math.max(t.nextRef, init.nextRef);
    // Frames already on the page (same site) get the agent too, so Esc pressed while typing in one
    // still stops Jarvis. Later frames get it at document start.
    this.injectChildFrames(t, frameTree).catch(() => {});
    return executionContextId;
  }

  async injectChildFrames(t, frameTree) {
    const queue = [...(frameTree.childFrames || [])];
    for (let i = 0; i < queue.length && i < 20; i++) {
      const node = queue[i];
      queue.push(...(node.childFrames || []));
      try {
        const { executionContextId } = await this.cdp(t, 'Page.createIsolatedWorld', { frameId: node.frame.id, worldName: WORLD });
        await this.cdp(t, 'Runtime.evaluate', { expression: this.pageSource, contextId: executionContextId, returnByValue: true });
      } catch {
        /* the frame went away */
      }
    }
  }

  async callIn(t, ctx, op, args) {
    const res = await this.cdp(t, 'Runtime.callFunctionOn', {
      functionDeclaration: CALL_PAGE,
      executionContextId: ctx,
      arguments: [{ value: op }, { value: args || {} }],
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.exceptionDetails) throw new DriverError(`Error: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'page script failed'}`);
    return res?.result?.value;
  }

  /** Calls the page agent's `op` in the tab's current document (re-creating the world after navigation). */
  async page(t, op, args) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ctx = await this.world(t);
        const value = await this.callIn(t, ctx, op, args);
        if (value && value.error === '__agent_missing__') {
          t.ctx = null;
          continue;
        }
        if (value && Number.isFinite(value.nextRef)) t.nextRef = Math.max(t.nextRef, value.nextRef);
        return value;
      } catch (err) {
        if (CONTEXT_GONE.test(String(err?.message || err)) && attempt < 2) {
          t.ctx = null;
          t.docSeq++;
          await sleep(150);
          continue;
        }
        throw err;
      }
    }
    throw new DriverError('Error: the page kept changing; try again.');
  }

  // -------------------------------------------------------------------------------------------
  // Control bar

  /** 'acting' | 'waiting' | 'hidden' on every attached tab. */
  async setMode(mode) {
    this.mode = mode;
    const tabs = this.openTabs().filter((t) => t.attached);
    await Promise.all(tabs.map((t) => withTimeout(this.page(t, 'mode', { mode }), 1500, 'mode timeout').catch(() => {})));
  }

  startHeartbeat() {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      if (this.mode === 'hidden') return;
      for (const t of this.openTabs()) {
        if (!t.attached || !t.ctx) continue;
        this.callIn(t, t.ctx, 'beat', {})
          .then((r) => {
            if (r && r.stop) this.onStopRequest({ via: r.stop, toolId: t.toolId });
            if (r && r.tampered) this.onTamper(t.toolId);
          })
          .catch(() => {});
      }
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.(); // (Node, in tests) never keeps the process alive
  }

  stopHeartbeat() {
    clearInterval(this.heartbeat);
    this.heartbeat = 0;
  }

  /**
   * Releases every debugger session at once: removes the control bar (best effort, bounded to
   * ~150 ms) and detaches. Used by Stop, Take over and the end of a task.
   */
  async releaseAll() {
    this.allowAttach = false;
    this.mode = 'hidden';
    this.stopHeartbeat();
    const tabs = this.openTabs().filter((t) => t.attached || t.attaching);
    await Promise.all(
      tabs.map(async (t) => {
        if (!t.attached && t.attaching) {
          // Chrome is still attaching: attach() lets go itself when it finishes (allowAttach is off).
          await t.attaching.catch(() => {});
        }
        if (t.ctx) await withTimeout(this.callIn(t, t.ctx, 'mode', { mode: 'hidden' }), 150, 'hide timeout').catch(() => {});
        if (t.attached) await this.detachTab(t);
        t.dialogArm = null;
        // Whatever was waiting for a page load ends here. A Stop has already ended it with an
        // AbortError; on Take over it is not a Stop: the task pauses.
        for (const w of [...t.waiters]) w.reject(new DriverError('Error: Jarvis let go of the browser before the page finished loading.', { code: 'released' }));
      }),
    );
  }

  /** Jarvis is about to press Escape itself: the page's Esc-to-stop ignores it for `ms`. */
  suppressEsc(ms) {
    this.suppressEscUntil = Math.max(this.suppressEscUntil, Date.now() + ms);
  }

  // -------------------------------------------------------------------------------------------
  // Dialogs the owner's approval covers

  /** A confirm() opened by the approved action in this call may be accepted (see Controller.dialogPolicy). */
  armDialog(t, { category, site, ms = 10000 }) {
    t.dialogArm = { category, site, until: Date.now() + ms, uses: 1 };
  }

  disarmDialog(t) {
    if (t) t.dialogArm = null;
  }

  /** Forget every tab (a new conversation starts its tab ids again at tab-1). */
  reset() {
    this.tabs.clear();
    this.byChrome.clear();
    this.nextNum = 1;
    this.activeToolId = null;
    this.changes = [];
    this.dialogs = [];
  }

  // -------------------------------------------------------------------------------------------
  // Tabs

  async refresh(t) {
    try {
      const tab = await this.chrome.tabs.get(t.chromeId);
      t.url = tab.pendingUrl || tab.url || t.url;
      t.title = tab.title ?? t.title;
      t.windowId = tab.windowId;
      return tab;
    } catch {
      this.onTabRemoved(t.chromeId);
      return null;
    }
  }

  /** Reads the URL of the document the tab shows now from its live main frame. */
  async syncUrl(t) {
    const { frameTree } = await this.cdp(t, 'Page.getFrameTree');
    const f = frameTree?.frame;
    if (f?.unreachableUrl) t.url = f.unreachableUrl;
    else if (f?.url) t.url = f.url + (f.urlFragment || '');
    return t.url;
  }

  /** Makes the tab the active tab of its window (so it renders and the owner sees it). */
  async activate(t) {
    const tab = await this.refresh(t);
    if (!tab) throw new DriverError(`Error: ${t.toolId} was closed.`);
    if (!tab.active) await this.chrome.tabs.update(t.chromeId, { active: true });
    this.activeToolId = t.toolId;
  }

  async newTab({ windowId } = {}) {
    const tab = await this.chrome.tabs.create({ url: 'about:blank', active: true, ...(windowId ?? this.windowId ? { windowId: windowId ?? this.windowId } : {}) });
    const id = this.register({ ...tab, url: 'about:blank' });
    // new_tab reports its own tab_opened; never report this tab a second time.
    this.changes = this.changes.filter((c) => c.tab_id !== id);
    this.activeToolId = id;
    return this.get(id);
  }

  async closeTab(t) {
    if (t.attached) {
      this.detaching.add(t.chromeId);
      try {
        await this.chrome.debugger.detach({ tabId: t.chromeId });
      } catch {
        /* ignore */
      } finally {
        this.detaching.delete(t.chromeId);
      }
    }
    await this.chrome.tabs.remove(t.chromeId);
    this.onTabRemoved(t.chromeId);
    const next = this.active();
    if (next) {
      try {
        await this.chrome.tabs.update(next.chromeId, { active: true });
      } catch {
        /* ignore */
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Navigation

  /** Waits until the document has loaded enough to act on (DOMContentLoaded), or timeout. */
  async settleAfter(t, before, { signal, timeoutMs = 10000, quietMs = 250 } = {}) {
    await untilAborted(sleep(120), signal);
    if (t.navSeq > before.navSeq || t.loading) {
      const ok = await this.waitFor(t, () => t.domSeq > before.domSeq || t.loadSeq > before.loadSeq || (!t.loading && t.docSeq > before.docSeq), timeoutMs, signal);
      await untilAborted(sleep(ok ? 300 : 0), signal);
      return { navigated: true, loaded: ok };
    }
    await untilAborted(sleep(Math.max(0, quietMs - 120)), signal);
    return { navigated: false, loaded: true };
  }

  marks(t) {
    return { navSeq: t.navSeq, domSeq: t.domSeq, loadSeq: t.loadSeq, docSeq: t.docSeq };
  }

  async navigate(t, url, { signal, timeoutMs = 25000 } = {}) {
    const before = this.marks(t);
    t.unloadBlocked = false;
    const res = await untilAborted(this.cdp(t, 'Page.navigate', { url, transitionType: 'typed' }), signal);
    if (t.unloadBlocked) return { error: unsavedChanges(t) };
    if (res?.errorText) {
      const reason = String(res.errorText).replace(/^net::/, '');
      return { error: `Error: Navigation to ${url} failed (${reason}). The page may be unavailable.` };
    }
    if (!res?.loaderId) return { sameDocument: true };
    const ok = await this.waitFor(t, () => t.domSeq > before.domSeq || t.loadSeq > before.loadSeq, timeoutMs, signal);
    if (!ok) return { error: `Error: Navigation to ${url} timed out after ${Math.round(timeoutMs / 1000)} seconds. The page may be unavailable.` };
    await untilAborted(sleep(300), signal);
    return {};
  }

  /** The history entry "back" or "forward" would open ({ id, url }), or null. */
  async historyEntry(t, which) {
    const { currentIndex, entries } = await this.cdp(t, 'Page.getNavigationHistory', {});
    return entries[currentIndex + (which === 'back' ? -1 : 1)] || null;
  }

  /** Goes back/forward to `entry` (from historyEntry, already checked) or reloads. */
  async historyGo(t, which, { signal, entry = null } = {}) {
    const before = this.marks(t);
    t.unloadBlocked = false;
    if (which === 'reload') {
      await this.cdp(t, 'Page.reload', {});
    } else {
      const target = entry || (await this.historyEntry(t, which));
      if (!target) return { error: `Error: there is no page to go ${which} to.` };
      await this.cdp(t, 'Page.navigateToHistoryEntry', { entryId: target.id });
    }
    await this.waitFor(t, () => t.unloadBlocked || t.domSeq > before.domSeq || t.loadSeq > before.loadSeq || t.docSeq > before.docSeq, 15000, signal);
    if (t.unloadBlocked) return { error: unsavedChanges(t) };
    await untilAborted(sleep(300), signal);
    return {};
  }

  // -------------------------------------------------------------------------------------------
  // What the page agent cannot see: frames from other sites, closed shadow roots

  /**
   * The frame from another site at viewport point (x, y), if that is what is there:
   * { frameId, url } with url the page the frame really shows ('' when unknown).
   */
  async frameAt(t, x, y) {
    const hit = await this.cdp(t, 'DOM.getNodeForLocation', { x: Math.round(x), y: Math.round(y), includeUserAgentShadowDOM: false });
    if (!hit?.backendNodeId) return null;
    const { node } = await this.cdp(t, 'DOM.describeNode', { backendNodeId: hit.backendNodeId });
    if (!node || !/^i?frame$/i.test(node.nodeName || '') || node.contentDocument || !node.frameId) return null;
    const attrs = {};
    for (let i = 0; i + 1 < (node.attributes || []).length; i += 2) attrs[node.attributes[i]] = node.attributes[i + 1];
    return { frameId: node.frameId, url: await this.frameUrl(t, node.frameId), src: attrs.src || '' };
  }

  /** The URL a child frame from another site shows now (asked in its own session), or ''. */
  async frameUrl(t, frameId) {
    const f = t.frames.get(frameId);
    if (!f) return '';
    try {
      const r = await withTimeout(this.chrome.debugger.sendCommand({ tabId: t.chromeId, sessionId: f.sessionId }, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true }), 3000, 'frame timeout');
      const href = r?.result?.value;
      if (typeof href === 'string' && href) f.url = href;
    } catch {
      /* keep what Chrome reported when it attached */
    }
    return f.url || '';
  }

  /**
   * The element with the keyboard focus, looking inside closed shadow roots (which the page agent
   * cannot open), described like the page agent's focusInfo. null when focus is not in one.
   */
  async pierceFocus(t) {
    const ctx = await this.world(t);
    const objectGroup = 'jarvis-focus';
    try {
      const ae = await this.cdp(t, 'Runtime.evaluate', { expression: 'document.activeElement', contextId: ctx, objectGroup });
      let objectId = ae?.result?.objectId;
      let pierced = false;
      for (let depth = 0; objectId && depth < 8; depth++) {
        const { node } = await this.cdp(t, 'DOM.describeNode', { objectId, depth: 1, pierce: true });
        const root = (node?.shadowRoots || []).find((r) => r.shadowRootType === 'closed' || r.shadowRootType === 'open');
        if (!root) break;
        const ro = await this.cdp(t, 'DOM.resolveNode', { backendNodeId: root.backendNodeId, executionContextId: ctx, objectGroup });
        const inner = await this.cdp(t, 'Runtime.callFunctionOn', { objectId: ro.object.objectId, functionDeclaration: 'function () { return this.activeElement; }', objectGroup });
        if (!inner?.result?.objectId) break;
        objectId = inner.result.objectId;
        if (root.shadowRootType === 'closed') pierced = true;
      }
      if (!pierced) return { pierced: false };
      const r = await this.cdp(t, 'Runtime.callFunctionOn', { objectId, functionDeclaration: 'function () { return globalThis.__jarvis ? globalThis.__jarvis.describeEl(this) : null; }', returnByValue: true });
      return { pierced: true, ...(r?.result?.value || { desc: null }) };
    } finally {
      // The handles were only needed for this look.
      this.cdp(t, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => {});
    }
  }

  // -------------------------------------------------------------------------------------------
  // Capture and input

  /** A screenshot of the viewport as captured (device pixels), with the control bar hidden. */
  async capture(t, { hideOverlay = true, format = 'jpeg', quality = 85 } = {}) {
    const hide = hideOverlay && this.mode !== 'hidden' && t.ctx;
    if (hide) await this.callIn(t, t.ctx, 'shot', { on: true }).catch(() => {});
    try {
      const shot = await this.cdp(t, 'Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality } : {}), captureBeyondViewport: false, fromSurface: true });
      return shot.data;
    } finally {
      if (hide) await this.callIn(t, t.ctx, 'shot', { on: false }).catch(() => {});
    }
  }

  async mouse(t, events) {
    for (const e of events) await this.cdp(t, 'Input.dispatchMouseEvent', { pointerType: 'mouse', ...e });
  }

  async keyEvents(t, events) {
    for (const e of events) await this.cdp(t, 'Input.dispatchKeyEvent', e);
  }

  async insertText(t, text) {
    await this.cdp(t, 'Input.insertText', { text });
  }

  /** Lets synthesized mouse events pass through the control bar while Jarvis clicks. */
  async passthrough(t, on) {
    if (this.mode === 'hidden' || !t.ctx) return;
    await this.callIn(t, t.ctx, 'pass', { on }).catch(() => {});
  }
}
