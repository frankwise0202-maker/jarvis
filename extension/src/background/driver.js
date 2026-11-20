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
//     frame (frames nested in those too), used to learn which site each frame really shows and
//     which frame is at a point or has the keyboard focus.
//   - While Jarvis acts, the tab's own page loads go through Fetch interception: a page that tries
//     to load a site the owner denied (a link, a script, a redirect) is stopped before the request
//     leaves, and a site not asked about yet is asked first (see onNavigationRequest).

import { abortError, sleep, untilAborted, withTimeout } from '../shared/util.js';
import { sanitizeTitle, sanitizeUrl, siteOf } from './sites.js';

export const WORLD = 'jarvis-control';
export const BINDING = '__jarvisBar';
const CALL_PAGE = 'function (op, args) { return globalThis.__jarvis ? globalThis.__jarvis.call(op, args) : { error: "__agent_missing__" }; }';
const CDP_TIMEOUT_MS = 15000;
const HEARTBEAT_MS = 1000;

const FRAME_FILTER = [{ type: 'iframe', exclude: false }, { exclude: true }];

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
   * @param {(toolId, dialog) => boolean | Promise<boolean>} [opts.onDialog]  accept a JS dialog?
   *        (a promise holds the dialog open until the owner answers)
   * @param {(toolId, reason) => void} [opts.onDetach]     a debugger session ended unexpectedly
   * @param {(toolId, url) => Promise<boolean>} [opts.onNavigationRequest]  may the tab load this page?
   */
  constructor({ chrome, pageSource = '', onStopRequest = () => {}, onDialog = () => true, onDetach = () => {}, onNavigationRequest = null }) {
    this.chrome = chrome;
    this.pageSource = pageSource;
    this.onStopRequest = onStopRequest;
    this.onDialog = onDialog;
    this.onDetachCb = onDetach;
    this.onNavigationRequest = onNavigationRequest;
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
    this.onUnstyled = () => {}; // the control bar's styles could not be applied on a page
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
      dialogPending: 0, // JS dialogs held open while the owner decides
      unloadBlocked: false, // the page asked before leaving (beforeunload) and Jarvis said no
      docOpenSeq: 0, // times the page rewrote its document with document.open()
      postEntries: new Set(), // history entry ids that are the result of a submitted form
      openedByJarvis: false, // a tab Jarvis (or a page it works in) opened, not the owner's own
    });
    this.byChrome.set(tab.id, toolId);
    if (opened) {
      this.changes.push({ type: 'tab_opened', tab_id: toolId });
      this.tabs.get(toolId).openedByJarvis = true;
    }
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

  /**
   * browser_state `tabs`: the full inventory, exactly one active entry when not empty. `reveal(url)`
   * says whether a page's title and full address may be reported: a tab on a site the owner has
   * not allowed (yet) is listed with a placeholder title and only its origin.
   */
  inventory({ reveal = null } = {}) {
    const open = this.openTabs();
    let active = this.active();
    if (!active && open.length) active = open[0];
    return open.map((t) => {
      const url = t.url || 'about:blank';
      let hidden = false;
      if (reveal && /^https?:/i.test(url)) {
        try {
          hidden = !reveal(url);
        } catch {
          hidden = true;
        }
      }
      let origin = '';
      if (hidden) {
        try {
          origin = `${new URL(url).origin}/`;
        } catch {
          origin = 'about:blank';
        }
      }
      return {
        tab_id: t.toolId,
        title: hidden ? 'Site not allowed yet' : sanitizeTitle(t.title),
        url: hidden ? sanitizeUrl(origin) : sanitizeUrl(url),
        ...(active && t.toolId === active.toolId ? { active: true } : {}),
      };
    });
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
      const sent = this.chrome.debugger.sendCommand({ tabId: t.chromeId }, method, params);
      // Input that opened a dialog the owner is still deciding about waits for that answer.
      if (/^Input\./.test(method)) return await this.whileDialogs(t, sent, timeoutMs, method);
      return await withTimeout(sent, timeoutMs, `Error: the page did not respond to ${method} within ${Math.round(timeoutMs / 1000)} s.`);
    } catch (err) {
      const msg = String(err?.message || err);
      if (/not attached|Detached while handling|No tab with given id|Debugger is not attached/i.test(msg)) t.attached = false;
      throw err;
    }
  }

  /** Waits for a command, without timing out while one of the tab's dialogs waits for the owner. */
  whileDialogs(t, sent, timeoutMs, method) {
    return new Promise((resolve, reject) => {
      let timer = 0;
      const wait = () => {
        timer = setTimeout(() => {
          if (t.dialogPending > 0) wait();
          else reject(new DriverError(`Error: the page did not respond to ${method} within ${Math.round(timeoutMs / 1000)} s.`));
        }, timeoutMs);
        timer.unref?.();
      };
      wait();
      sent.then(
        (v) => (clearTimeout(timer), resolve(v)),
        (e) => (clearTimeout(timer), reject(e)),
      );
    });
  }

  /** A command in a child frame's session (a frame from another site). */
  async inSession(t, sessionId, method, params = {}, { timeoutMs = 5000 } = {}) {
    if (!sessionId) return this.cdp(t, method, params);
    return withTimeout(this.chrome.debugger.sendCommand({ tabId: t.chromeId, sessionId }, method, params), timeoutMs, `Error: a frame did not respond to ${method}.`);
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
      await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: FRAME_FILTER }).catch(() => send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }).catch(() => {}));
      // The tab's own page loads, checked before they leave (see onNavigationRequest).
      if (this.onNavigationRequest) {
        try {
          const { frameTree } = await send('Page.getFrameTree', {});
          if (frameTree?.frame?.id) t.frameId = frameTree.frame.id;
          await send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }] });
        } catch {
          /* no Fetch domain: the executor's own checks still apply */
        }
      }
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
      const old = t.frames.get(params.targetInfo.targetId);
      t.frames.set(params.targetInfo.targetId, { sessionId: params.sessionId, url: params.targetInfo.url || '', parent: sessionId || null, navSeq: (old?.navSeq || 0) + 1 });
      // Frames nested inside this one get their own sessions too.
      try {
        Promise.resolve(this.chrome.debugger.sendCommand({ tabId, sessionId: params.sessionId }, 'Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: FRAME_FILTER })).catch(() => {});
      } catch {
        /* ignore */
      }
      return;
    }
    if (method === 'Target.detachedFromTarget') {
      for (const [k, f] of t.frames) if (f.sessionId === params.sessionId) t.frames.delete(k);
      return;
    }
    if (method === 'Target.targetInfoChanged' && t.frames.has(params.targetInfo?.targetId)) {
      const f = t.frames.get(params.targetInfo.targetId);
      if ((params.targetInfo.url || '') !== f.url) f.navSeq += 1;
      f.url = params.targetInfo.url || '';
      return;
    }
    if (method === 'Fetch.requestPaused' && !sessionId) {
      this.onRequestPaused(t, tabId, params);
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
          // Remember entries that are the result of a submitted form (reloading one sends it again).
          this.recordHistory(t).catch(() => {});
        }
        break;
      case 'Page.documentOpened':
        // document.open() erased the page agent's listeners (Esc, Stop, the activation check):
        // put them back at once.
        if (!params.frame?.parentId) {
          t.docOpenSeq += 1;
          if (t.ctx && t.ctxDoc === t.docSeq) this.callIn(t, t.ctx, 'heal', {}).catch(() => {});
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
        let decision = false;
        try {
          decision = this.onDialog(id, dialog);
        } catch {
          decision = false;
        }
        const answer = (accept, asked = false) => {
          // "Leave site? Changes you made may not be saved": Jarvis stays (the owner's unsaved work).
          if (params.type === 'beforeunload' && !accept) t.unloadBlocked = true;
          this.dialogs.push({ ...dialog, accepted: accept, toolId: id, asked });
          Promise.resolve(this.chrome.debugger.sendCommand({ tabId }, 'Page.handleJavaScriptDialog', { accept })).catch(() => {});
        };
        if (decision && typeof decision.then === 'function') {
          // The owner decides (the page waits): input that opened it keeps waiting meanwhile.
          t.dialogPending += 1;
          const settle = (accept) => {
            t.dialogPending = Math.max(0, t.dialogPending - 1);
            answer(accept, true);
            for (const w of [...t.waiters]) w.check();
          };
          decision.then((v) => settle(!!v), () => settle(false));
          break;
        }
        answer(!!decision);
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
            if (r && r.unstyled) this.onUnstyled(t.toolId);
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
  // Page loads while Jarvis acts (Fetch interception of the tab's own documents)

  /** A paused document request: the main frame's loads are checked, everything else continues. */
  onRequestPaused(t, tabId, params) {
    const send = (method, extra = {}) => Promise.resolve(this.chrome.debugger.sendCommand({ tabId }, method, { requestId: params.requestId, ...extra })).catch(() => {});
    const url = String(params.request?.url || '');
    const main = !params.frameId || !t.frameId || params.frameId === t.frameId;
    if (!main || !this.onNavigationRequest || !/^https?:/i.test(url)) {
      send('Fetch.continueRequest');
      return;
    }
    let decision;
    try {
      decision = Promise.resolve(this.onNavigationRequest(t.toolId, url));
    } catch {
      decision = Promise.resolve(false);
    }
    decision.then(
      (ok) => (ok ? send('Fetch.continueRequest') : send('Fetch.failRequest', { errorReason: 'BlockedByClient' })),
      () => send('Fetch.failRequest', { errorReason: 'BlockedByClient' }),
    );
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
    this.tabs.get(id).openedByJarvis = true;
    return this.get(id);
  }

  /**
   * Closes a tab. A page that asks before closing ("Leave site?") keeps it open: Jarvis's dialog
   * policy says Stay, and the call returns an error instead of waiting (chrome.tabs.remove never
   * settles while such a tab stays open).
   */
  async closeTab(t, { signal, timeoutMs = 3000 } = {}) {
    t.unloadBlocked = false;
    // With a debugger session, the page's "Leave site?" comes to Jarvis (which stays) instead of
    // blocking the page behind a dialog.
    if (!t.attached && this.allowAttach) {
      try {
        await this.attach(t);
      } catch {
        /* the tab cannot be controlled: Chrome asks the owner itself */
      }
    }
    this.detaching.add(t.chromeId); // the session ends with the tab: not an unexpected detach
    let removing;
    try {
      removing = Promise.resolve(this.chrome.tabs.remove(t.chromeId));
    } catch (err) {
      this.detaching.delete(t.chromeId);
      throw err;
    }
    removing.catch(() => {});
    let gone = false;
    try {
      gone = await untilAborted(
        Promise.race([
          removing.then(() => true, () => false),
          this.waitFor(t, () => t.closed || t.unloadBlocked, timeoutMs).then(() => t.closed, () => t.closed),
          sleep(timeoutMs).then(() => false),
        ]),
        signal,
      );
    } finally {
      this.detaching.delete(t.chromeId);
    }
    if (!gone && !t.closed) {
      const still = await this.refresh(t);
      if (still) {
        if (t.attached) await this.detachTab(t);
        return { error: `Error: ${t.toolId} has unsaved changes (the page asked before closing), so Jarvis kept it open. Leave it open, or ask the owner to save or discard their work and close it.` };
      }
    }
    this.onTabRemoved(t.chromeId);
    const next = this.active();
    if (next) {
      try {
        await this.chrome.tabs.update(next.chromeId, { active: true });
      } catch {
        /* ignore */
      }
    }
    return {};
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
    // The address is a file: Chrome downloads it instead of showing a page (see the downloads gate).
    if (res?.isDownload) return { download: true };
    if (res?.errorText === 'net::ERR_BLOCKED_BY_CLIENT') return { blocked: true };
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

  /** Notes which history entries are the result of a submitted form (transitionType form_submit). */
  async recordHistory(t) {
    const h = await this.cdp(t, 'Page.getNavigationHistory', {});
    for (const e of h?.entries || []) if (e.transitionType === 'form_submit') t.postEntries.add(e.id);
    return h;
  }

  /**
   * Whether the page shown now is the result of a submitted form (an order, a payment, a sent
   * message): reloading it would send the form again. Entries are remembered by id while they
   * still say form_submit (after one reload Chrome reports them as "reload").
   */
  async isFormResult(t) {
    const h = await this.recordHistory(t);
    const cur = h?.entries?.[h.currentIndex];
    return !!cur && t.postEntries.has(cur.id);
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

  /**
   * A screenshot of the viewport as captured (device pixels): { data, masks }. The page agent
   * masks every private field first (passwords, card numbers, security codes) and, with
   * `hideOverlay`, hides the control bar; `masks` are viewport rectangles (CSS px) of other sites'
   * payment or sign-in boxes, which the caller paints over. If the page agent cannot mask the page,
   * there is no picture (fail closed).
   */
  async capture(t, { hideOverlay = true, format = 'jpeg', quality = 85 } = {}) {
    const ctx = await this.world(t);
    let prep = null;
    try {
      prep = await withTimeout(this.callIn(t, ctx, 'shot', { on: true, bar: hideOverlay && this.mode !== 'hidden' }), 3000, 'shot timeout');
    } catch {
      prep = null;
    }
    if (!prep || !prep.ok) {
      this.callIn(t, ctx, 'shot', { on: false }).catch(() => {});
      throw new DriverError("Error: Jarvis could not hide this page's private fields for a picture, so it took none. Read the page with read_page or get_page_text instead.");
    }
    try {
      const shot = await this.cdp(t, 'Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality } : {}), captureBeyondViewport: false, fromSurface: true });
      return { data: shot.data, masks: Array.isArray(prep.rects) ? prep.rects : [] };
    } finally {
      await this.callIn(t, ctx, 'shot', { on: false }).catch(() => {});
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

  /**
   * The chain of frames from other sites at viewport point (x, y), outermost first, each with the
   * page it really shows: [{ frameId, sessionId, url, navSeq }]. [] when the point is not in such
   * a frame; { error } when a frame there cannot be identified (Jarvis then does nothing).
   */
  async frameChainAt(t, x, y) {
    const chain = [];
    let session = null;
    let px = x;
    let py = y;
    for (let hop = 0; hop < 6; hop++) {
      const hit = await this.inSession(t, session, 'DOM.getNodeForLocation', { x: Math.round(px), y: Math.round(py), includeUserAgentShadowDOM: false });
      if (!hit?.backendNodeId) return chain;
      const { node } = await this.inSession(t, session, 'DOM.describeNode', { backendNodeId: hit.backendNodeId });
      if (!node || !/^i?frame$/i.test(node.nodeName || '') || node.contentDocument || !node.frameId) return chain;
      const f = t.frames.get(node.frameId);
      if (!f) return { error: 'unknown frame' };
      const url = await this.frameUrl(t, node.frameId);
      if (!/^https?:/i.test(url)) return { error: 'unknown frame address' };
      const box = await this.inSession(t, session, 'DOM.getBoxModel', { backendNodeId: hit.backendNodeId }).catch(() => null);
      const q = box?.model?.content;
      if (!Array.isArray(q) || q.length < 8) return { error: 'frame box' };
      // A rotated or skewed frame: the point cannot be followed into it.
      if (Math.abs(q[1] - q[3]) > 0.5 || Math.abs(q[0] - q[6]) > 0.5) return { error: 'transformed frame' };
      chain.push({ frameId: node.frameId, sessionId: f.sessionId, url, site: siteOf(url), navSeq: f.navSeq || 0 });
      px -= q[0];
      py -= q[1];
      session = f.sessionId;
    }
    return chain;
  }

  /**
   * The chain of frames from other sites that hold the keyboard focus, outermost first (as
   * frameChainAt). [] when the focus is not in one; { error } when it cannot be followed.
   */
  async focusedFrameChain(t) {
    const ctx = await this.world(t);
    const objectGroup = 'jarvis-frame-focus';
    const chain = [];
    try {
      let session = null;
      for (let hop = 0; hop < 6; hop++) {
        const ae = session
          ? await this.inSession(t, session, 'Runtime.evaluate', { expression: 'document.activeElement', objectGroup })
          : await this.cdp(t, 'Runtime.evaluate', { expression: 'document.activeElement', contextId: ctx, objectGroup });
        const objectId = ae?.result?.objectId;
        if (!objectId) return chain;
        const { node } = await this.inSession(t, session, 'DOM.describeNode', { objectId });
        if (!node || !/^i?frame$/i.test(node.nodeName || '') || node.contentDocument || !node.frameId) return chain;
        const f = t.frames.get(node.frameId);
        if (!f) return { error: 'unknown frame' };
        const url = await this.frameUrl(t, node.frameId);
        if (!/^https?:/i.test(url)) return { error: 'unknown frame address' };
        chain.push({ frameId: node.frameId, sessionId: f.sessionId, url, site: siteOf(url), navSeq: f.navSeq || 0 });
        session = f.sessionId;
      }
      return chain;
    } finally {
      this.cdp(t, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => {});
    }
  }

  /**
   * The element at viewport point (x, y) inside closed shadow roots (which the page agent cannot
   * open), described like resolveTarget's desc, or null.
   */
  async pierceAt(t, x, y) {
    const ctx = await this.world(t);
    const objectGroup = 'jarvis-pierce';
    try {
      // (Elements with pointer-events: none, Jarvis's own overlay among them, are not hit.)
      const hit = await this.cdp(t, 'DOM.getNodeForLocation', { x: Math.round(x), y: Math.round(y), includeUserAgentShadowDOM: false });
      if (!hit?.backendNodeId) return null;
      const { node } = await this.cdp(t, 'DOM.describeNode', { backendNodeId: hit.backendNodeId });
      if (/^jarvis-control-overlay$/i.test(node?.nodeName || '')) return null;
      if (!hit?.backendNodeId) return null;
      const { object } = await this.cdp(t, 'DOM.resolveNode', { backendNodeId: hit.backendNodeId, executionContextId: ctx, objectGroup });
      if (!object?.objectId) return null;
      const r = await this.cdp(t, 'Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function () { return globalThis.__jarvis ? globalThis.__jarvis.describeEl(this, { actionable: true }) : null; }', returnByValue: true });
      return r?.result?.value || null;
    } finally {
      this.cdp(t, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => {});
    }
  }

  /** Lets synthesized mouse events pass through the control bar while Jarvis clicks. */
  async passthrough(t, on) {
    if (this.mode === 'hidden' || !t.ctx) return;
    await this.callIn(t, t.ctx, 'pass', { on }).catch(() => {});
  }
}
