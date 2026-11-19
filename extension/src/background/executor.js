// The browser toolset executor: runs Claude's `browser_toolset_20260801` member calls against the
// owner's tabs (through driver.js) and builds their tool results exactly as the browser use tool
// documentation specifies:
//
//   - dispatch on (toolset_name, name); a member that is disabled or unknown gets an error result;
//   - inputs are validated here (the API states bounds to Claude but does not enforce them);
//   - results carry only text, image and browser_state blocks; a successful tab-management result
//     (new_tab, list_tabs, switch_tab, close_tab) is exactly one browser_state block, new_tab's
//     with exactly one tab_opened entry matching the active tab; other successful results carry a
//     short acknowledgment (or the member's output) plus a browser_state block with the full tab
//     inventory; error results are `is_error: true` text with no browser_state;
//   - screenshots fit the API's image limits and define the viewport-pixel frame that click
//     coordinates are scaled back from; zoom crops at full resolution;
//   - page-derived text (page reads, dialog messages, option and element names) is wrapped as
//     untrusted content and scanned for prompt injection, and so are tab titles.
//
// Safety, before every input it sends:
//   - site permission for the page the input lands on: checked again after the owner answers (a
//     page can move meanwhile), on every page read, and right before the input is dispatched; a
//     frame from another site needs that site's permission too;
//   - the consequential-action guard (guard.js) for clicks, drags, mouse presses and releases,
//     Enter and Space (with any modifiers, also held), switches/checkboxes/radios and selects in
//     form_input, keyboard shortcuts outside text fields, and anything inside a frame Jarvis
//     cannot see into; one approval activates its element once (double/triple clicks and repeated
//     keys on such an element are refused);
//   - the page agent's activation check while the input is sent: an element the owner did not
//     approve that ends up receiving it (swapped in under the pointer, focused by the page) is not
//     activated;
//   - a hard refusal to type into password, card-number or CVV fields, also inside closed shadow
//     roots and frames from other sites (which Jarvis cannot see into, so it does not type there).

import { abortError, abortableSleep, isAbort, singleLine, truncate } from '../shared/util.js';
import { blockedReason, isActionableUrl, normalizeNavigateUrl, sanitizeUrl, siteOf } from './sites.js';
import { GUARD_CATEGORIES, classifyAction, classifyOption, classifyShortcutKey, classifySpaceKey, classifySubmitKey, classifyToggle, isEditableFocus, isToggle, normalizeLabel, secretKind, secretRefusal, SECRET_NAMES } from './guard.js';
import { coordinateError, frameFor, toCss, zoomPlan, THUMB_WIDTH } from './images.js';
import { chordEvents, chordLabel, clickModifiers, isEnterChord, isEscapeChord, isPrintableChord, isSpaceChord, parseKeys, shortcutInfo } from './keys.js';
import { detectInjection, wrapUntrusted } from './injection.js';
import { stepLabel } from './labels.js';
import { DriverError } from './driver.js';

export const TOOLSET_TYPE = 'browser_toolset_20260801';
export const TOOLSET_NAME = 'browser';
export const HALT_TEXT = 'Not executed: an earlier action in this turn failed.';

export const MEMBERS = Object.freeze([
  'navigate', 'screenshot', 'zoom',
  'left_click', 'right_click', 'middle_click', 'double_click', 'triple_click', 'hover', 'left_click_drag', 'left_mouse_down', 'left_mouse_up', 'mouse_move', 'scroll', 'scroll_to',
  'type', 'key', 'hold_key', 'wait',
  'read_page', 'find', 'get_page_text',
  'form_input', 'file_upload',
  'read_console', 'read_network', 'javascript_exec',
  'new_tab', 'list_tabs', 'switch_tab', 'close_tab',
]);
/** Off by default in the toolset; Jarvis leaves them off (they widen what a page could make Claude do). */
export const OPTIONAL_MEMBERS = Object.freeze(new Set(['javascript_exec', 'file_upload', 'read_console', 'read_network']));
export const ENABLED_MEMBERS = Object.freeze(new Set(MEMBERS.filter((m) => !OPTIONAL_MEMBERS.has(m))));
export const TAB_MANAGEMENT = Object.freeze(new Set(['new_tab', 'list_tabs', 'switch_tab', 'close_tab']));
const CLICKS = { left_click: 1, double_click: 2, triple_click: 3, right_click: 1, middle_click: 1 };
const BUTTON = { left_click: 'left', double_click: 'left', triple_click: 'left', right_click: 'right', middle_click: 'middle' };
const NO_THUMB = new Set(['read_page', 'find', 'get_page_text', 'wait', 'list_tabs', 'screenshot', 'zoom']);
// A press of the mouse the owner approved also covers its release on the same element.
const PRESS_APPROVAL_MS = 60 * 1000;

/** The tools[] entry for the toolset (optional members stay disabled by default). */
export function toolsetEntry() {
  return { type: TOOLSET_TYPE };
}

// ---------------------------------------------------------------------------------------------
// Results

export function memberResult(id, content, isError = false) {
  const block = { type: 'tool_result', tool_use_id: id, toolset_name: TOOLSET_NAME, content };
  if (isError) block.is_error = true;
  return block;
}

export function haltResult(id) {
  return memberResult(id, HALT_TEXT, true);
}

class CallError extends Error {}
const fail = (text) => {
  throw new CallError(String(text).startsWith('Error') || String(text).startsWith('Refused') || String(text).startsWith('Blocked') ? text : `Error: ${text}`);
};

// ---------------------------------------------------------------------------------------------
// Input validation

const CONTROL = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => typeof v === 'number' && Number.isFinite(v);

function checkTabId(v, required) {
  if (v === undefined || v === null) {
    if (required) fail('Error: tab_id is required.');
    return;
  }
  if (typeof v !== 'string' || !v || v.length > 4096 || CONTROL.test(v)) fail('Error: tab_id must be a tab id from the tab list, such as "tab-1".');
}

function checkCoordinate(t, field = 'target') {
  if (!isObj(t) || t.type !== 'coordinate' || !isInt(t.x) || !isInt(t.y)) fail(`Error: ${field} must be {"type": "coordinate", "x": <int>, "y": <int>} in viewport pixels.`);
}

function checkRef(t, field = 'target') {
  if (!isObj(t) || t.type !== 'ref' || typeof t.ref !== 'string' || !/^ref_\d+$/.test(t.ref)) fail(`Error: ${field} must be {"type": "ref", "ref": "ref_N"} from read_page or find.`);
}

function checkTarget(t) {
  if (isObj(t) && t.type === 'ref') return checkRef(t);
  return checkCoordinate(t);
}

function checkDuration(v, max = 30) {
  if (!isInt(v) || v < 0 || v > max) fail(`Error: duration must be a number of seconds from 0 to ${max}.`);
}

export function validateInput(name, input) {
  if (!isObj(input)) fail('Error: the call input must be an object.');
  checkTabId(input.tab_id, name === 'switch_tab' || name === 'close_tab');
  switch (name) {
    case 'navigate':
      if (typeof input.url !== 'string' || !input.url.trim()) fail('Error: navigate needs a url (or "back", "forward", "reload").');
      break;
    case 'zoom':
      if (!Array.isArray(input.region) || input.region.length !== 4 || !input.region.every(isInt)) fail('Error: zoom needs region [x0, y0, x1, y1] in viewport pixels.');
      break;
    case 'left_click':
    case 'right_click':
    case 'middle_click':
    case 'double_click':
    case 'triple_click':
      checkTarget(input.target);
      if (input.modifiers !== undefined && typeof input.modifiers !== 'string') fail('Error: modifiers must be a string such as "shift" or "ctrl+shift".');
      break;
    case 'hover':
      checkTarget(input.target);
      break;
    case 'left_click_drag':
      checkCoordinate(input.from, 'from');
      checkCoordinate(input.target);
      break;
    case 'left_mouse_down':
    case 'left_mouse_up':
    case 'mouse_move':
      checkCoordinate(input.target);
      break;
    case 'scroll':
      checkCoordinate(input.target);
      if (!['up', 'down', 'left', 'right'].includes(input.scroll_direction)) fail('Error: scroll_direction must be "up", "down", "left" or "right".');
      if (input.scroll_amount !== undefined && (!isInt(input.scroll_amount) || input.scroll_amount < 1 || input.scroll_amount > 10)) fail('Error: scroll_amount must be 1 to 10 scroll-wheel notches.');
      break;
    case 'scroll_to':
      checkRef(input.target);
      break;
    case 'type':
      if (typeof input.text !== 'string') fail('Error: type needs text.');
      break;
    case 'key':
      if (typeof input.text !== 'string' || !input.text.trim()) fail('Error: key needs text such as "Enter" or "ctrl+a".');
      if (input.repeat !== undefined && (!isInt(input.repeat) || input.repeat < 1 || input.repeat > 100)) fail('Error: repeat must be 1 to 100.');
      break;
    case 'hold_key':
      if (typeof input.text !== 'string' || !input.text.trim()) fail('Error: hold_key needs text.');
      checkDuration(input.duration);
      break;
    case 'wait':
      checkDuration(input.duration);
      break;
    case 'read_page':
      if (input.filter !== undefined && input.filter !== 'interactive' && input.filter !== 'all') fail('Error: filter must be "interactive" or "all" (or omitted).');
      if (input.depth !== undefined && (!isInt(input.depth) || input.depth < 1)) fail('Error: depth must be a whole number of at least 1.');
      if (input.ref !== undefined && (typeof input.ref !== 'string' || !/^ref_\d+$/.test(input.ref))) fail('Error: ref must be an element reference such as "ref_12".');
      break;
    case 'find':
      if (typeof input.query !== 'string' || !input.query.trim()) fail('Error: find needs a query such as "search field".');
      break;
    case 'form_input':
      checkRef(input.target);
      if (!['string', 'number', 'boolean'].includes(typeof input.value)) fail('Error: value must be a string, number or boolean.');
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Element helpers

/** A text field, where a double or triple click only selects text. */
function isTextField(desc) {
  return isEditableFocus(desc) && String(desc?.tag || '').toLowerCase() !== 'select';
}

/** An element the page agent described as a field (no need to look for a closed shadow root). */
function isFieldLike(desc) {
  const tag = String(desc?.tag || '').toLowerCase();
  const role = String(desc?.role || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!desc?.isContentEditable || role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton';
}

/** A frame from another site: Jarvis cannot see or check anything inside it. */
const isForeignFrame = (desc) => !!(desc && desc.iframe && desc.crossOrigin);

const sameClass = (a, b) => !!a && !!b && a.category === b.category && normalizeLabel(a.label) === normalizeLabel(b.label);

const aOrAn = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

// ---------------------------------------------------------------------------------------------

export class Executor {
  /**
   * @param {object} deps
   * @param {import('./driver.js').Driver} deps.driver
   * @param {{ decode(b64, type): Promise<{width,height}>, encode(bmp, opts): Promise<string> }} deps.encoder
   * @param {object} deps.policy  { checkSite(url, ctx) -> Promise<string|null>, confirmGuard(c, ctx) -> Promise<string|null>,
   *                                onSecret(kind, ctx), onBlocked?(text) }
   * @param {object} [deps.hooks] { onInjection({ toolId, url, quotes }), onThumb(stepId, dataUrl) }
   */
  constructor({ driver, encoder, policy, hooks = {} }) {
    this.driver = driver;
    this.encoder = encoder;
    this.policy = policy;
    this.hooks = hooks;
    this.progress = () => {};
    this.seenTitles = new Set(); // (tab, title) pairs already scanned for prompt injection
    this.pressed = null; // an approved left_mouse_down whose release is covered
  }

  /**
   * Runs one member call. Returns { result, ok, label, info }. Throws only an AbortError (Stop).
   * `ctx`: { signal, stepId }.
   */
  async run(block, ctx = {}) {
    const name = String(block?.name || '');
    const input = block?.input ?? {};
    const info = {};
    this.progress = (i) => {
      try {
        ctx.onProgress?.(stepLabel(name, input, i));
      } catch {
        /* display only */
      }
    };
    try {
      if (!ENABLED_MEMBERS.has(name)) {
        return this.error(block, MEMBERS.includes(name) ? `Error: ${name} is not enabled in this environment.` : `Error: ${singleLine(name).slice(0, 60) || 'that tool'} is not a browser tool.`, info);
      }
      validateInput(name, input);
      const content = TAB_MANAGEMENT.has(name) ? await this.tabOp(name, input, info, ctx) : await this.member(name, input, info, ctx);
      if (ctx.signal?.aborted) throw abortError();
      return { result: memberResult(block.id, content), ok: true, label: stepLabel(name, input, info), info };
    } catch (err) {
      // Stop is the run's signal; anything else (Take over letting go of a page load, an
      // interrupted wait) is this call failing.
      if (ctx.signal?.aborted) throw abortError();
      const text = err instanceof CallError || err instanceof DriverError ? err.message : isAbort(err) ? 'Error: the action was interrupted before it finished.' : `Error: ${singleLine(err?.message || err).replace(/^Error:\s*/, '')}`;
      return this.error(block, text, info, name, input);
    } finally {
      // A confirm() dialog the owner's approval covered can only follow this very call.
      if (ctx.tab) this.driver.disarmDialog(ctx.tab);
    }
  }

  error(block, text, info, name = block?.name, input = block?.input) {
    let t = text.startsWith('Error') || text.startsWith('Refused') || text.startsWith('Blocked') ? text : `Error: ${text}`;
    // Dialogs the page showed during this call belong to this result (not a later one).
    const notes = this.dialogNotes();
    if (notes) t = `${t}\n${notes}`;
    t = truncate(t, 4000);
    return { result: memberResult(block.id, t, true), ok: false, label: stepLabel(name, input || {}, info), info, error: t };
  }

  browserState({ changes = true } = {}) {
    const tabs = this.driver.inventory();
    this.scanTitles(tabs);
    const block = { type: 'browser_state', tabs };
    if (changes) {
      const sc = this.driver.drainChanges();
      if (sc.length) block.state_changes = sc;
    }
    return block;
  }

  /** Tab titles are page text too: a title that addresses an AI is reported to the owner (once). */
  scanTitles(tabs) {
    for (const tab of tabs) {
      const key = `${tab.tab_id}|${tab.title}`;
      if (this.seenTitles.has(key)) continue;
      this.seenTitles.add(key);
      const quotes = detectInjection(tab.title);
      if (quotes.length) this.hooks.onInjection?.({ toolId: tab.tab_id, url: tab.url, quotes });
    }
  }

  tab(input) {
    const t = input.tab_id ? this.driver.get(input.tab_id) : this.driver.active();
    if (!t) fail(input.tab_id ? `Error: there is no open tab "${input.tab_id}". Call list_tabs to see the open tabs.` : 'Error: there is no open tab. Call new_tab (or navigate, which opens one).');
    return t;
  }

  /** Page-derived text for a result: wrapped as untrusted content, scanned, and reported to the owner. */
  wrap(t, text, kind) {
    const { text: wrapped, injections } = wrapUntrusted(text, { tabId: t?.toolId || '', url: sanitizeUrl(t?.url || ''), kind });
    if (injections.length) this.hooks.onInjection?.({ toolId: t?.toolId || '', url: t?.url || '', quotes: injections });
    return wrapped;
  }

  /** The dialogs the page opened during the call, for its result (their text is page content). */
  dialogNotes() {
    const list = this.driver.drainDialogs();
    return list
      .map((d) => {
        const t = d.toolId ? this.driver.get(d.toolId) : null;
        const verdict = d.accepted ? 'Jarvis accepted it' : d.type === 'beforeunload' ? 'Jarvis stayed on the page' : 'Jarvis dismissed it';
        const advice = !d.accepted && d.type === 'confirm' ? ' If the owner wants what it asks, call request_confirmation describing exactly that action, then do it again.' : '';
        const msg = truncate(singleLine(d.message), 300);
        return `The page showed ${aOrAn(d.type)} dialog (${verdict}).${advice}${msg ? ` Its text:\n${this.wrap(t, msg, 'dialog')}` : ''}`;
      })
      .join('\n');
  }

  ack(text) {
    const notes = this.dialogNotes();
    return [{ type: 'text', text: notes ? `${text}\n${notes}` : text }, this.browserState()];
  }

  // -------------------------------------------------------------------------------------------

  async tabOp(name, input, info, ctx) {
    const d = this.driver;
    if (name === 'new_tab') {
      const t = await d.newTab({ windowId: d.active()?.windowId });
      // Exactly one browser_state with exactly one tab_opened matching the active tab. Page-opened
      // tabs not yet reported stay queued for the next result.
      const tabs = d.inventory();
      this.scanTitles(tabs);
      return [{ type: 'browser_state', tabs, state_changes: [{ type: 'tab_opened', tab_id: t.toolId }] }];
    }
    if (name === 'list_tabs') {
      for (const t of d.openTabs()) await d.refresh(t);
      return [this.browserState()];
    }
    const t = d.get(input.tab_id);
    if (!t) fail(`Error: there is no open tab "${input.tab_id}". Call list_tabs to see the open tabs.`);
    info.title = t.title;
    if (name === 'switch_tab') {
      await d.activate(t);
      await this.thumbnail(t, ctx);
      return [this.browserState()];
    }
    // close_tab
    await d.closeTab(t);
    return [this.browserState()];
  }

  /** Site permission (and the URL policy) for acting on `url`; throws the refusal. */
  async allowSite(url, ctx) {
    const reason = blockedReason(url);
    if (reason) fail(`Error: Jarvis can't act on this page: ${reason}. Navigate the tab to a website first.`);
    if (!/^https?:/i.test(String(url))) return; // a blank tab
    const refusal = await this.policy.checkSite(url, ctx);
    if (refusal) fail(refusal);
  }

  /**
   * Before acting on the tab's page: its site is allowed, and it is still the page Jarvis acts on
   * once the owner has answered (a page can move to another site while a prompt waits). Records
   * the site and document in ctx; later page reads and inputs check them.
   */
  async ensureSite(t, ctx) {
    const d = this.driver;
    for (let i = 0; i < 3; i++) {
      await d.refresh(t);
      const url = t.url;
      await this.allowSite(url, ctx);
      await d.activate(t);
      await d.syncUrl(t);
      if (siteOf(t.url) === siteOf(url) && !blockedReason(t.url)) {
        ctx.site = siteOf(t.url);
        ctx.doc = t.docSeq;
        ctx.tab = t;
        return;
      }
    }
    fail('Error: the page kept moving to other sites while Jarvis waited, so Jarvis did nothing. Look at the page again.');
  }

  moved(t, href) {
    fail(`Error: the tab moved to ${siteOf(href) || 'another page'} while Jarvis was working, so Jarvis did nothing there. Look at the page again before you act.`);
  }

  /** A page agent call whose answer must come from the allowed site (the tab may have moved). */
  async pageOp(t, op, args, ctx) {
    const v = await this.driver.page(t, op, args);
    // (Chrome's own error page, chrome-error://, stands for the address it could not load.)
    if (ctx?.site !== undefined && v && typeof v === 'object' && typeof v.href === 'string' && !/^chrome-error:/i.test(v.href) && siteOf(v.href) !== ctx.site) this.moved(t, v.href);
    return v;
  }

  /** Right before input: still the allowed site, and the same document the target was found in. */
  steady(t, ctx) {
    if (ctx?.site !== undefined && siteOf(t.url) !== ctx.site) this.moved(t, t.url);
    if (ctx?.doc !== undefined && t.docSeq !== ctx.doc) fail('Error: the page changed before Jarvis could act, so Jarvis did nothing. Look at the page again before you act.');
  }

  async ensureFrame(t, ctx) {
    if (t.frame) return t.frame;
    const vp = await this.pageOp(t, 'viewport', {}, ctx);
    const f = frameFor(vp.w, vp.h);
    t.frame = { ...f, cssW: vp.w, cssH: vp.h, dpr: vp.dpr || 1 };
    return t.frame;
  }

  async member(name, input, info, ctx) {
    const d = this.driver;
    const signal = ctx.signal;

    if (name === 'navigate') {
      const n = normalizeNavigateUrl(input.url);
      if (n.error) fail(n.error);
      let t = input.tab_id || d.active() ? this.tab(input) : null;
      if (!t) {
        if (n.history) fail('Error: there is no open tab to go back or forward in. Call new_tab, or navigate to a URL.');
        // No tab yet (the owner started from a New Tab page): open one for the task.
        await this.allowSite(n.url, ctx);
        t = await d.newTab({ windowId: d.windowId });
        d.changes.push({ type: 'tab_opened', tab_id: t.toolId });
      }
      ctx.tab = t;
      let asked = n.url;
      if (n.history) {
        if (n.history === 'reload') {
          await d.refresh(t);
          asked = t.url;
          await this.allowSite(t.url, ctx);
          await d.activate(t);
          const r = await d.historyGo(t, 'reload', { signal });
          if (r.error) fail(r.error);
        } else {
          // Back and forward go to a page of the history: that page's site is what needs permission.
          await d.activate(t);
          const entry = await d.historyEntry(t, n.history);
          if (!entry) fail(`Error: there is no page to go ${n.history} to.`);
          asked = entry.url;
          await this.allowSite(entry.url, ctx);
          const r = await d.historyGo(t, n.history, { signal, entry });
          if (r.error) fail(r.error);
        }
      } else {
        info.url = n.url;
        await this.allowSite(n.url, ctx);
        await d.activate(t);
        const r = await d.navigate(t, n.url, { signal });
        if (r.error) fail(r.error);
      }
      await d.refresh(t);
      info.url = t.url;
      t.frame = null;
      // A redirect to another site needs that site's permission before anything about it is reported.
      if (asked && siteOf(t.url) !== siteOf(asked)) await this.allowSite(t.url, ctx);
      await this.thumbnail(t, ctx);
      return this.ack(`Navigated to ${sanitizeUrl(t.url)}.`);
    }

    if (name === 'wait') {
      await abortableSleep(input.duration * 1000, signal);
      return this.ack(`Waited ${input.duration} second${input.duration === 1 ? '' : 's'}.`);
    }

    // Every other member acts on the tab's current page.
    const t = this.tab(input);
    await this.ensureSite(t, ctx);

    switch (name) {
      case 'screenshot':
        return this.screenshot(t, ctx);
      case 'zoom':
        return this.zoom(t, input.region, ctx);
      case 'left_click':
      case 'right_click':
      case 'middle_click':
      case 'double_click':
      case 'triple_click':
        return this.click(name, t, input, info, ctx);
      case 'hover':
      case 'mouse_move': {
        const p = await this.point(t, input.target, info, { scroll: name === 'hover' }, ctx);
        this.steady(t, ctx);
        await d.mouse(t, [{ type: 'mouseMoved', x: p.x, y: p.y, button: 'none', buttons: 0 }]);
        await d.settleAfter(t, d.marks(t), { signal, quietMs: 200 });
        await this.thumbnail(t, ctx);
        return this.ack(input.target.type === 'ref' ? `Hovered over ${input.target.ref}.` : `Moved the pointer to (${input.target.x}, ${input.target.y}).`);
      }
      case 'left_click_drag':
        return this.drag(t, input, info, ctx);
      case 'left_mouse_down':
      case 'left_mouse_up':
        return this.mouseButton(name, t, input, info, ctx);
      case 'scroll': {
        const p = await this.point(t, input.target, info, { describe: false }, ctx);
        const amount = input.scroll_amount ?? 3;
        const delta = 100 * amount;
        const dir = input.scroll_direction;
        const before = d.marks(t);
        this.steady(t, ctx);
        await d.mouse(t, [
          { type: 'mouseMoved', x: p.x, y: p.y, button: 'none', buttons: 0 },
          { type: 'mouseWheel', x: p.x, y: p.y, deltaX: dir === 'left' ? -delta : dir === 'right' ? delta : 0, deltaY: dir === 'up' ? -delta : dir === 'down' ? delta : 0 },
        ]);
        await d.settleAfter(t, before, { signal, quietMs: 350 });
        await this.thumbnail(t, ctx);
        return this.ack(`Scrolled ${dir} ${amount} notch${amount === 1 ? '' : 'es'} at (${input.target.x}, ${input.target.y}).`);
      }
      case 'scroll_to': {
        const r = await this.pageOp(t, 'scrollToRef', { ref: input.target.ref }, ctx);
        if (r?.error) fail(r.error);
        info.target = { name: r.name, role: r.role };
        await abortableSleep(200, signal);
        await this.thumbnail(t, ctx);
        return this.ack(`Scrolled ${input.target.ref} into view.`);
      }
      case 'type':
        return this.type(t, input.text, info, ctx);
      case 'key':
        return this.key(t, input, info, ctx);
      case 'hold_key':
        return this.holdKey(t, input, info, ctx);
      case 'read_page': {
        const r = await this.pageOp(t, 'readPage', { filter: input.filter, depth: input.depth, ref: input.ref }, ctx);
        if (r?.error) fail(r.error);
        return this.untrusted(t, r.text, 'accessibility_tree');
      }
      case 'find': {
        const r = await this.pageOp(t, 'find', { query: input.query }, ctx);
        if (r?.error) fail(r.error);
        return this.untrusted(t, r.text, 'find_results');
      }
      case 'get_page_text': {
        const r = await this.pageOp(t, 'pageText', {}, ctx);
        if (r?.error) fail(r.error);
        return this.untrusted(t, r.text, 'page_text');
      }
      case 'form_input':
        return this.formInput(t, input, info, ctx);
      default:
        fail(`Error: ${name} is not enabled in this environment.`);
    }
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // Members

  async screenshot(t, ctx) {
    const d = this.driver;
    await this.pageOp(t, 'viewport', {}, ctx).catch((err) => {
      if (err instanceof CallError) throw err;
    }); // makes sure the control bar can be hidden
    this.steady(t, ctx);
    const data = await d.capture(t, { hideOverlay: true });
    this.steady(t, ctx); // the picture is of the page the owner allowed
    const bmp = await this.encoder.decode(data, 'image/jpeg');
    const vp = await this.pageOp(t, 'viewport', {}, ctx).catch((err) => {
      if (err instanceof CallError) throw err;
      return null;
    });
    const dpr = vp?.dpr || t.frame?.dpr || 1;
    const cssW = bmp.width / dpr;
    const cssH = bmp.height / dpr;
    const f = frameFor(cssW, cssH);
    t.frame = { ...f, cssW, cssH, dpr };
    const image = await this.encoder.encode(bmp, { w: f.w, h: f.h, type: 'image/jpeg', quality: 0.8 });
    await this.thumbFrom(bmp, ctx);
    return [
      { type: 'text', text: `Screenshot of ${t.toolId} (${f.w}x${f.h} viewport pixels).` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
      this.browserState(),
    ];
  }

  async zoom(t, region, ctx) {
    const frame = await this.ensureFrame(t, ctx);
    this.steady(t, ctx);
    const data = await this.driver.capture(t, { hideOverlay: true });
    this.steady(t, ctx);
    const bmp = await this.encoder.decode(data, 'image/jpeg');
    const dpr = bmp.width / frame.cssW;
    const plan = zoomPlan(frame, region, dpr);
    if (plan.error) fail(plan.error);
    const image = await this.encoder.encode(bmp, { w: plan.out.w, h: plan.out.h, crop: plan.crop, type: 'image/jpeg', quality: 0.9 });
    await this.thumbFrom(bmp, ctx, plan.crop);
    return [
      { type: 'text', text: `Zoomed into [${region.join(', ')}] (${plan.out.w}x${plan.out.h}); coordinates stay in full-viewport pixels.` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
    ];
  }

  /**
   * Resolves a target to a CSS-pixel point plus the element under it ({ x, y, desc, targetId,
   * covered, hitDesc, hitId }). Refs are scrolled into view first; coordinates are checked against
   * the screenshot frame. `hitDesc` is what a click there really reaches when another element
   * covers the ref's element.
   */
  async point(t, target, info, { scroll = true, describe = true } = {}, ctx = {}) {
    if (target.type === 'ref') {
      const r = await this.pageOp(t, 'resolveTarget', { ref: target.ref, scroll }, ctx);
      if (!r || r.error) fail(r?.error || `Error: ${target.ref} is stale or not found on the current page. Re-read the page to get fresh references.`);
      info.target = { name: r.name, role: r.role };
      this.progress(info);
      ctx.doc = t.docSeq;
      return { x: r.x, y: r.y, desc: r.desc, covered: r.covered, targetId: r.targetId, hitDesc: r.hitDesc, hitId: r.hitId };
    }
    const frame = await this.ensureFrame(t, ctx);
    const err = coordinateError(frame, target.x, target.y);
    if (err) fail(err);
    const css = toCss(frame, target.x, target.y);
    if (!describe) return { x: css.x, y: css.y, desc: null };
    const r = await this.pageOp(t, 'resolveTarget', { x: css.x, y: css.y }, ctx);
    if (r?.name || r?.role) info.target = { name: r.name, role: r.role };
    this.progress(info);
    ctx.doc = t.docSeq;
    return { x: css.x, y: css.y, desc: r?.desc || null, targetId: r?.targetId };
  }

  /** What a click at `p` reaches: the element, or what covers it. */
  reach(p) {
    return p.hitDesc ? { desc: p.hitDesc, targetId: p.hitId } : { desc: p.desc, targetId: p.targetId };
  }

  /**
   * What activating the element at point `p` would do: the guard's classification, or for a frame
   * from another site (whose site must be allowed too) an activation Jarvis cannot see into.
   */
  async classifyAt(t, p, ctx) {
    const { desc } = this.reach(p);
    if (desc?.tag === 'jarvis-control-overlay') fail("Error: Jarvis's own control bar is at that point. Scroll the page, or use a ref from read_page or find.");
    if (isForeignFrame(desc)) return this.frameGuard(t, p, desc, ctx);
    return classifyAction(desc);
  }

  /** A point over a frame from another site: that site needs permission, and the owner's OK. */
  async frameGuard(t, p, desc, ctx) {
    let url = '';
    try {
      url = (await this.driver.frameAt(t, p.x, p.y))?.url || '';
    } catch {
      url = '';
    }
    if (!/^https?:/i.test(url)) url = /^https?:/i.test(desc.iframe?.src || '') ? desc.iframe.src : '';
    const site = url ? siteOf(url) : '';
    if (site && site !== ctx.site) await this.allowSite(url, ctx);
    const pay = classifyAction(desc);
    if (pay) return pay;
    const from = site || 'another site';
    return { category: 'frame', label: `a box from ${from}`, reason: `acting inside a box embedded from ${from}, which Jarvis cannot see into`, frameSrc: desc.iframe?.src || '' };
  }

  /** The consequential-action guard for activating `desc`; throws the refusal. Returns the approved classification. */
  async guardElement(t, desc, verb, ctx, classification = classifyAction(desc)) {
    if (!classification) return null;
    const refusal = await this.policy.confirmGuard({ ...classification, verb, url: t.url, site: siteOf(t.url), toolId: t.toolId }, ctx);
    if (refusal) fail(refusal);
    // A confirm() dialog this approved action opens may be accepted (only during this call).
    this.driver.armDialog(t, { category: classification.category, site: siteOf(t.url) });
    return classification;
  }

  /**
   * After an approval the page may have changed while the owner was deciding: resolve the target
   * again and refuse if it is no longer the element that was approved.
   */
  async recheck(t, target, info, approved, ctx) {
    const again = await this.point(t, target, info, { scroll: false }, ctx);
    const { desc } = this.reach(again);
    let now;
    if (approved.category === 'frame') now = isForeignFrame(desc) && (desc.iframe?.src || '') === (approved.frameSrc || '') ? approved : null;
    else now = classifyAction(desc);
    if (!sameClass(now, approved)) fail('Error: the page changed while the owner was deciding, so Jarvis did not click. Look at the page again before you act.');
    return again;
  }

  /**
   * Sends mouse events with the page agent's activation check armed: `approved` elements are
   * activated once, any other consequential element that receives the input is not. With
   * `expect`, after the first event (the pointer arriving) the element under the pointer must
   * still be the one Jarvis checked.
   */
  async sendMouse(t, ctx, events, { approved = [], expect = null } = {}) {
    const d = this.driver;
    this.steady(t, ctx);
    await this.pageOp(t, 'arm', { approved }, ctx);
    let res = null;
    await d.passthrough(t, true);
    try {
      const [first, ...rest] = events;
      await d.mouse(t, [first]);
      if (expect) await this.hoverCheck(t, expect, approved, ctx);
      if (rest.length) {
        this.steady(t, ctx);
        await d.mouse(t, rest);
      }
    } finally {
      await d.passthrough(t, false);
      res = await d.page(t, 'disarm', {}).catch(() => null);
    }
    this.checkActivations(res);
    return res;
  }

  /** The pointer reached the target: if hover put something consequential there instead, stop. */
  async hoverCheck(t, expect, approved, ctx) {
    if (expect.targetId === undefined) return;
    const r = await this.pageOp(t, 'hitCheck', { x: expect.x, y: expect.y, targetId: expect.targetId }, ctx);
    if (!r) return;
    const c = r.desc ? classifyAction(r.desc) : null;
    if (!c || approved.some((a) => sameClass(a, c))) return;
    const text = `Error: when the pointer reached it, the page put "${truncate(singleLine(c.label), 60)}" (${c.reason || GUARD_CATEGORIES[c.category]}) under the pointer, so Jarvis did not press. Nothing was done. Look at the page again before you act.`;
    this.policy.onBlocked?.(`Jarvis did not click: the page swapped in “${truncate(singleLine(c.label), 60)}” under the pointer.`);
    fail(text);
  }

  /** The page agent stopped an activation the owner did not approve: report it. */
  checkActivations(res) {
    if (!res?.blocked?.length) return;
    const b = res.blocked[0];
    const label = truncate(singleLine(b.label), 60);
    const why = b.reason || GUARD_CATEGORIES[b.category] || 'a consequential action';
    this.policy.onBlocked?.(`Jarvis stopped the page from activating “${label}”: ${why}, not approved.`);
    fail(`Error: the input reached "${label}" (${why}), which is not what Jarvis checked${res.activations ? ' after the approved action went through once' : ''}, so Jarvis stopped it before it took effect.${res.activations ? '' : ' Nothing was done.'} Look at the page again before you act; ask the owner with request_confirmation if that is what the task needs.`);
  }

  async click(name, t, input, info, ctx) {
    const d = this.driver;
    const p = await this.point(t, input.target, info, {}, ctx);
    const modifiers = clickModifiers(input.modifiers);
    const count = CLICKS[name];
    const button = BUTTON[name];
    let target = p;
    const approved = [];
    if (name === 'right_click') {
      // A right click opens a context menu: never consequential (the page check lets it through).
      const raw = classifyAction(this.reach(p).desc);
      if (raw) approved.push({ targetId: this.reach(p).targetId, category: raw.category, label: raw.label });
    } else {
      let c = await this.classifyAt(t, p, ctx);
      // Middle-click opens links in a new tab; only downloads (and frames) are consequential there.
      if (c && name === 'middle_click' && c.category !== 'download' && c.category !== 'frame') {
        approved.push({ targetId: this.reach(p).targetId, category: c.category, label: c.label });
        c = null;
      }
      if (c) {
        const { desc } = this.reach(p);
        if (count > 1 && !isTextField(desc)) {
          fail(`Error: ${name} would activate "${truncate(singleLine(c.label), 60)}" (${c.reason || GUARD_CATEGORIES[c.category]}) more than once. Use a single left_click; the owner is asked first.`);
        }
        await this.guardElement(t, desc, 'Click', ctx, c);
        target = await this.recheck(t, input.target, info, c, ctx);
        approved.push({ targetId: this.reach(target).targetId, category: c.category, label: c.label });
      }
    }
    const buttons = button === 'left' ? 1 : button === 'right' ? 2 : 4;
    const before = d.marks(t);
    const { x, y } = target;
    const expect = { x, y, targetId: this.reach(target).targetId };
    for (let i = 1; i <= count; i++) {
      const events = i === 1 ? [{ type: 'mouseMoved', x, y, button: 'none', buttons: 0, modifiers }] : [];
      events.push({ type: 'mousePressed', x, y, button, buttons, clickCount: i, modifiers }, { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: i, modifiers });
      if (i > 1) {
        // Between clicks the page may have turned the element into something else ("Continue"
        // becoming "Place order"): look again before the next press. (A consequential element
        // never gets here: multi-clicks on one are refused above.)
        const r = await this.pageOp(t, 'hitCheck', { x, y, targetId: expect.targetId }, ctx);
        const c = r?.desc ? classifyAction(r.desc) : null;
        if (c && !isTextField(r.desc)) {
          fail(`Error: Jarvis stopped after ${i - 1} of ${count} clicks: the element there is now "${truncate(singleLine(c.label), 60)}" (${c.reason || GUARD_CATEGORIES[c.category]}). Look at the page again before you act.`);
        }
      }
      await this.sendMouse(t, ctx, events, { approved, expect: i === 1 ? expect : null });
    }
    await d.settleAfter(t, before, { signal: ctx.signal });
    await d.refresh(t);
    await this.thumbnail(t, ctx);
    const verb = { left_click: 'Clicked', right_click: 'Right-clicked', middle_click: 'Middle-clicked', double_click: 'Double-clicked', triple_click: 'Triple-clicked' }[name];
    const what = input.target.type === 'ref' ? `element ${input.target.ref}` : `at (${input.target.x}, ${input.target.y})`;
    const covered = p.covered ? ` Note: the click landed on another element that covers that one:\n${this.wrap(t, truncate(singleLine(p.covered), 100), 'element_name')}` : '';
    return this.ack(`${verb} ${what}.${covered}`);
  }

  async drag(t, input, info, ctx) {
    const d = this.driver;
    const from = await this.point(t, input.from, info, {}, ctx);
    const to = await this.point(t, input.target, info, { scroll: false }, ctx);
    // A drag that starts and ends on one button clicks it: both ends go through the guard.
    const approved = [];
    const guarded = [];
    for (const [p, target] of [[from, input.from], [to, input.target]]) {
      const c = await this.classifyAt(t, p, ctx);
      if (!c || approved.some((a) => sameClass(a, c))) continue;
      await this.guardElement(t, this.reach(p).desc, 'Drag on', ctx, c);
      approved.push({ targetId: this.reach(p).targetId, category: c.category, label: c.label });
      guarded.push([target, c]);
    }
    for (const [target, c] of guarded) await this.recheck(t, target, info, c, ctx);
    const before = d.marks(t);
    const events = [{ type: 'mouseMoved', x: from.x, y: from.y, button: 'none', buttons: 0 }, { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 }];
    for (let i = 1; i <= 8; i++) events.push({ type: 'mouseMoved', x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8, button: 'left', buttons: 1 });
    events.push({ type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
    await this.sendMouse(t, ctx, events, { approved, expect: { x: from.x, y: from.y, targetId: this.reach(from).targetId } });
    await d.settleAfter(t, before, { signal: ctx.signal });
    await this.thumbnail(t, ctx);
    return this.ack(`Dragged from (${input.from.x}, ${input.from.y}) to (${input.target.x}, ${input.target.y}).`);
  }

  async mouseButton(name, t, input, info, ctx) {
    const d = this.driver;
    const down = name === 'left_mouse_down';
    let p = await this.point(t, input.target, info, {}, ctx);
    const c = await this.classifyAt(t, p, ctx);
    const approved = [];
    if (c) {
      // Pressing alone fires pointerdown and mousedown, which some sites act on. The release on
      // the same element is covered by the owner's approval of the press.
      const press = this.pressed;
      const covered = !down && press && press.toolId === t.toolId && press.doc === t.docSeq && sameClass(press, c) && Date.now() - press.at < PRESS_APPROVAL_MS;
      if (!covered) {
        await this.guardElement(t, this.reach(p).desc, down ? 'Press the mouse on' : 'Click', ctx, c);
        p = await this.recheck(t, input.target, info, c, ctx);
      } else this.driver.armDialog(t, { category: c.category, site: siteOf(t.url) });
      approved.push({ targetId: this.reach(p).targetId, category: c.category, label: c.label });
    }
    const before = d.marks(t);
    await this.sendMouse(
      t,
      ctx,
      [
        { type: 'mouseMoved', x: p.x, y: p.y, button: down ? 'none' : 'left', buttons: down ? 0 : 1 },
        { type: down ? 'mousePressed' : 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: down ? 1 : 0, clickCount: 1 },
      ],
      { approved, expect: { x: p.x, y: p.y, targetId: this.reach(p).targetId } },
    );
    this.pressed = down && c ? { toolId: t.toolId, doc: t.docSeq, category: c.category, label: c.label, at: Date.now() } : null;
    await d.settleAfter(t, before, { signal: ctx.signal });
    await this.thumbnail(t, ctx);
    return this.ack(down ? `Pressed the left button at (${input.target.x}, ${input.target.y}).` : `Released the left button at (${input.target.x}, ${input.target.y}).`);
  }

  /**
   * The element with the keyboard focus, described for the guard, looking inside closed shadow
   * roots (through the debugger) when the page agent only sees their host. null: nothing focused.
   * `unknown`: focus is somewhere Jarvis cannot identify.
   */
  async focus(t, ctx) {
    const f = await this.pageOp(t, 'focusInfo', {}, ctx);
    const desc = f?.desc || null;
    if (!desc || desc.iframe || isFieldLike(desc)) return desc;
    let deep = null;
    try {
      deep = await this.driver.pierceFocus(t);
    } catch {
      deep = { failed: true };
    }
    if (deep?.pierced) {
      if (typeof deep.href === 'string' && ctx?.site !== undefined && siteOf(deep.href) !== ctx.site) this.moved(t, deep.href);
      return deep.desc ? { ...deep.desc, inClosedShadow: true } : { tag: desc.tag, unknown: true };
    }
    // A custom element whose inside Jarvis could not check might hold a field.
    if (deep?.failed && String(desc.tag || '').includes('-')) return { ...desc, unknown: true };
    return desc;
  }

  secretOf(desc) {
    if (!desc) return null;
    if (desc.iframe) return secretKind({ iframe: desc.iframe });
    const kind = desc.field ? secretKind(desc.field) : null;
    if (kind) return kind;
    if (desc.looksSecret) return 'password';
    if (desc.isContentEditable || desc.role === 'textbox') return secretKind({ label: desc.name, ariaLabel: desc.name });
    return null;
  }

  refuseSecret(kind, info, ctx) {
    info.secret = true;
    info.secretWhat = SECRET_NAMES[kind];
    this.policy.onSecret?.(kind, ctx);
    fail(secretRefusal(kind));
  }

  /** Text is about to go to the focused element: never a secret field, never a place Jarvis cannot see. */
  checkTypingInto(desc, info, ctx) {
    const kind = this.secretOf(desc);
    if (kind) this.refuseSecret(kind, info, ctx);
    if (isForeignFrame(desc)) {
      fail('Refused: the keyboard focus is inside a box embedded from another site, which Jarvis cannot see into, so Jarvis did not type there (it could be a password or card field). Ask the owner to type this part themselves, or open that site in its own tab.');
    }
    if (desc?.unknown) {
      fail("Refused: Jarvis can't see which field has the keyboard focus (it is inside a part of the page Jarvis cannot read), so it did not type. Ask the owner to type this part themselves.");
    }
  }

  async type(t, text, info, ctx) {
    const d = this.driver;
    const desc = await this.focus(t, ctx);
    if (!desc) fail('Error: nothing on the page has keyboard focus. Click a text field first, then type.');
    info.field = desc.name || desc.field?.label || desc.field?.placeholder || '';
    this.progress(info);
    this.checkTypingInto(desc, info, ctx);
    const multiline = !!(desc.multiline || desc.isContentEditable);
    const parts = String(text).split(/\r?\n/);
    const before = d.marks(t);
    for (let i = 0; i < parts.length; i++) {
      if (ctx.signal?.aborted) throw abortError();
      if (parts[i]) {
        this.steady(t, ctx);
        await d.insertText(t, parts[i]);
      }
      if (i < parts.length - 1) {
        if (multiline) {
          // A line break inside a message: Shift+Enter, which never sends.
          const ev = chordEvents({ mods: ['shift'], key: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' } });
          this.steady(t, ctx);
          await d.keyEvents(t, [...ev.down, ...ev.press, ...ev.up]);
        } else {
          const c = classifySubmitKey(desc);
          if (c) await this.guardElement(t, desc, 'Press Enter to submit', ctx, c);
          const { press } = chordEvents({ mods: [], key: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' } });
          await this.sendKeys(t, ctx, press, { approved: c ? [{ category: c.category, label: c.label }] : [] });
        }
      }
    }
    await d.settleAfter(t, before, { signal: ctx.signal, quietMs: 200 });
    await d.refresh(t);
    await this.thumbnail(t, ctx);
    return this.ack(`Typed "${truncate(singleLine(text), 120)}".`);
  }

  /** Sends key events with the page agent's activation check armed (see sendMouse). */
  async sendKeys(t, ctx, events, { approved = [] } = {}) {
    const d = this.driver;
    this.steady(t, ctx);
    await this.pageOp(t, 'arm', { approved }, ctx);
    let res = null;
    try {
      await d.keyEvents(t, events);
    } finally {
      res = await d.page(t, 'disarm', {}).catch(() => null);
    }
    this.checkActivations(res);
  }

  /**
   * What pressing `chord` (`repeat` times) does with the current focus, through the guard:
   * Enter/Space activate the focused element (a button, link, switch, or the form's submit);
   * typed characters must not go into a secret field; Delete, Backspace and single-key shortcuts
   * outside a text field may delete or archive. Returns { approved, activation, focus }.
   */
  async keyCheck(t, chord, info, ctx, { repeat = 1 } = {}) {
    const focus = await this.focus(t, ctx);
    const label = chordLabel(chord);
    const activation = isEnterChord(chord) || isSpaceChord(chord);
    const once = (c) => {
      if (repeat > 1) fail(`Error: pressing ${label} ${repeat} times would activate "${truncate(singleLine(c.label), 60)}" (${c.reason || GUARD_CATEGORIES[c.category]}) more than once. Press it once; the owner is asked first.`);
    };
    if (isForeignFrame(focus)) {
      if (isPrintableChord(chord)) this.checkTypingInto(focus, info, ctx);
      if (activation || chord.key.key === 'Delete' || chord.key.key === 'Backspace') {
        const c = classifyAction(focus) || { category: 'frame', label: 'a box from another site', reason: 'a key pressed inside a box embedded from another site, which Jarvis cannot see into' };
        once(c);
        await this.guardElement(t, focus, `Press ${label} in`, ctx, c);
        return { approved: [{ category: c.category, label: c.label }], activation, focus };
      }
      return { approved: [], activation, focus };
    }
    if (focus?.unknown) {
      if (isPrintableChord(chord)) this.checkTypingInto(focus, info, ctx);
      if (activation) fail(`Error: Jarvis can't see what has the keyboard focus (part of the page Jarvis cannot read), so it did not press ${label}. Click the element you mean instead.`);
    }
    if (activation) {
      const modified = chord.mods.includes('ctrl') || chord.mods.includes('meta');
      const c = isEnterChord(chord) ? classifySubmitKey(focus, { modified }) : classifySpaceKey(focus);
      if (!c) return { approved: [], activation, focus };
      once(c);
      await this.guardElement(t, focus, `Press ${isEnterChord(chord) ? 'Enter' : 'Space'} on`, ctx, c);
      // The focus may have moved while the owner was deciding.
      const again = await this.focus(t, ctx);
      const now = isEnterChord(chord) ? classifySubmitKey(again, { modified }) : classifySpaceKey(again);
      if (!sameClass(now, c)) fail('Error: the page changed while the owner was deciding, so Jarvis did not press the key. Look at the page again before you act.');
      return { approved: [{ category: c.category, label: c.label }], activation, focus };
    }
    if (isPrintableChord(chord)) {
      const kind = this.secretOf(focus);
      if (kind) this.refuseSecret(kind, info, ctx);
    }
    const sc = classifyShortcutKey(shortcutInfo(chord), focus);
    if (sc) {
      once(sc);
      await this.guardElement(t, focus, `Press ${label} on`, ctx, sc);
    }
    return { approved: [], activation, focus };
  }

  async key(t, input, info, ctx) {
    const d = this.driver;
    let chords;
    try {
      chords = parseKeys(input.text);
    } catch (err) {
      fail(err.message);
    }
    info.keyLabel = chords.map(chordLabel).join(' ');
    const repeat = input.repeat ?? 1;
    const before = d.marks(t);
    for (const chord of chords) {
      const check = await this.keyCheck(t, chord, info, ctx, { repeat });
      if (isEscapeChord(chord)) {
        d.suppressEsc(800 + 100 * repeat);
        await d.page(t, 'suppressEsc', { ms: 800 + 100 * repeat }).catch(() => {});
      }
      const ev = chordEvents(chord);
      this.steady(t, ctx);
      await d.keyEvents(t, ev.down);
      try {
        for (let i = 0; i < repeat; i++) {
          if (!check.activation) {
            this.steady(t, ctx);
            await d.keyEvents(t, [ev.keyDown, ev.keyUp]);
            continue;
          }
          if (i > 0) {
            // Each Enter or Space can land on something new (the page moved the focus).
            const now = await this.focus(t, ctx);
            const c = isEnterChord(chord) ? classifySubmitKey(now) : classifySpaceKey(now);
            if (c) fail(`Error: Jarvis stopped after ${i} of ${repeat} presses: ${chordLabel(chord)} would now activate "${truncate(singleLine(c.label), 60)}" (${c.reason || GUARD_CATEGORIES[c.category]}). Look at the page again before you act.`);
          }
          await this.sendKeys(t, ctx, [ev.keyDown, ev.keyUp], { approved: check.approved });
        }
      } finally {
        await d.keyEvents(t, ev.up).catch(() => {});
      }
    }
    await d.settleAfter(t, before, { signal: ctx.signal });
    await d.refresh(t);
    await this.thumbnail(t, ctx);
    return this.ack(`Pressed ${info.keyLabel}${repeat > 1 ? ` ${repeat} times` : ''}.`);
  }

  async holdKey(t, input, info, ctx) {
    const d = this.driver;
    let chords;
    try {
      chords = parseKeys(input.text);
    } catch (err) {
      fail(err.message);
    }
    if (chords.length !== 1) fail('Error: hold_key takes one key or chord, such as "shift" or "ArrowDown".');
    const chord = chords[0];
    info.keyLabel = chordLabel(chord);
    // Holding Enter or Space and letting go activates the focused element just like a press.
    const check = await this.keyCheck(t, chord, info, ctx);
    if (isEscapeChord(chord)) {
      d.suppressEsc(input.duration * 1000 + 800);
      await d.page(t, 'suppressEsc', { ms: input.duration * 1000 + 800 }).catch(() => {});
    }
    const ev = chordEvents(chord);
    this.steady(t, ctx);
    await this.pageOp(t, 'arm', { approved: check.approved, ms: input.duration * 1000 + 5000 }, ctx);
    let res = null;
    try {
      await d.keyEvents(t, [...ev.down, { ...ev.keyDown, autoRepeat: false }]);
      try {
        await abortableSleep(input.duration * 1000, ctx.signal);
      } finally {
        await d.keyEvents(t, [ev.keyUp, ...ev.up]).catch(() => {});
      }
    } finally {
      res = await d.page(t, 'disarm', {}).catch(() => null);
    }
    this.checkActivations(res);
    await this.thumbnail(t, ctx);
    return this.ack(`Held ${info.keyLabel} for ${input.duration} second${input.duration === 1 ? '' : 's'}.`);
  }

  async formInput(t, input, info, ctx) {
    const ref = input.target.ref;
    const resolve = async () => {
      const r = await this.pageOp(t, 'resolveTarget', { ref, wantPoint: false }, ctx);
      if (!r || r.error) fail(r?.error || 'Error: element not found.');
      return r;
    };
    const r = await resolve();
    info.target = { name: r.name, role: r.role };
    const kind = this.secretOf(r.desc);
    if (kind) this.refuseSecret(kind, info, ctx);
    let value = input.value;
    if (isToggle(r.desc)) {
      // "true", 1, "on" … tick it, just as true does; the page agent gets the boolean.
      const want = value === true || value === 1 || /^(true|1|on|yes|checked)$/i.test(String(value).trim());
      value = want;
      const radio = String(r.desc.role).toLowerCase() === 'radio' || String(r.desc.type).toLowerCase() === 'radio';
      const changes = radio ? want && !r.desc.checked : want !== !!r.desc.checked;
      if (changes) {
        const c = classifyToggle(r.desc, { willCheck: want });
        if (c) {
          await this.guardElement(t, r.desc, want ? 'Turn on' : 'Turn off', ctx, c);
          const again = await resolve();
          if (!sameClass(classifyToggle(again.desc, { willCheck: want }), c)) fail('Error: the page changed while the owner was deciding, so Jarvis did not change it. Look at the page again before you act.');
        }
      }
    } else if (String(r.desc?.tag || '').toLowerCase() === 'select') {
      // A dropdown's change handler may act at once ("Actions: Delete all messages").
      const preview = async () => this.pageOp(t, 'previewOption', { ref, value }, ctx);
      const pv = await preview();
      if (pv?.option && !pv.option.selected) {
        const c = classifyOption({ name: pv.selectName || r.desc.name }, pv.option.text);
        if (c) {
          await this.guardElement(t, r.desc, 'Choose', ctx, c);
          const again = await preview();
          if (!again?.option || again.option.text !== pv.option.text) fail('Error: the page changed while the owner was deciding, so Jarvis did not choose it. Look at the page again before you act.');
        }
      }
    }
    this.steady(t, ctx);
    const res = await this.pageOp(t, 'formInput', { ref, value }, ctx);
    if (res?.error === 'secret') this.refuseSecret('password', info, ctx);
    if (res?.error) fail(res.error);
    await abortableSleep(150, ctx.signal);
    await this.thumbnail(t, ctx);
    const what = res.text || `Set ${ref}.`;
    // Option texts and typed values come from the page: keep them inside the untrusted wrapper.
    if (/^Selected /.test(what)) return this.ack(`Selected an option in ${ref}:\n${this.wrap(t, what.replace(/ in ref_\d+\.$/, ''), 'option')}`);
    return this.ack(what);
  }

  /** Page-derived text as an untrusted, injection-checked result. */
  untrusted(t, text, kind) {
    return this.ack(this.wrap(t, text, kind));
  }

  // -------------------------------------------------------------------------------------------
  // Thumbnails for the side panel's step list (never sent to the API)

  async thumbnail(t, ctx) {
    if (!ctx.stepId || !this.hooks.onThumb || !isActionableUrl(t.url)) return;
    try {
      const data = await this.driver.capture(t, { hideOverlay: false, quality: 55 });
      const bmp = await this.encoder.decode(data, 'image/jpeg');
      await this.thumbFrom(bmp, ctx);
    } catch {
      /* thumbnails are best effort */
    }
  }

  async thumbFrom(bmp, ctx, crop = null) {
    if (!ctx.stepId || !this.hooks.onThumb) return;
    try {
      const srcW = crop ? crop.w : bmp.width;
      const srcH = crop ? crop.h : bmp.height;
      const w = Math.min(THUMB_WIDTH, srcW);
      const h = Math.max(1, Math.round((w * srcH) / srcW));
      const b64 = await this.encoder.encode(bmp, { w, h, crop, type: 'image/jpeg', quality: 0.6 });
      this.hooks.onThumb(ctx.stepId, `data:image/jpeg;base64,${b64}`);
    } catch {
      /* best effort */
    }
  }
}

export { NO_THUMB };
