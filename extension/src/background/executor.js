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
// Safety: deny by default (actions.js). Before every input it sends:
//   - site permission for the page the input lands on: checked again after the owner answers (a
//     page can move meanwhile), on every page read, and right before the input is dispatched;
//     every frame from another site at the point (nested ones too), and the site a link or form
//     goes to, need the owner's permission as well;
//   - the owner's approval of that exact step: every click (except one plain click on an ordinary
//     link to another page of the same site), typing, key (except scrolling keys), drag, mouse
//     press, form_input, closing the owner's own tab, a download, and the page's own confirm()
//     questions. The prompt names the element, its visible text, the item around it (a product's
//     name and price), what is selected, and what the guard (guard.js) recognises it would do.
//     A request_confirmation approval covers one click or key on exactly the element it named.
//     The owner's "everyday steps" setting for a site skips asking only for searching, pages of
//     results, filters and sorting, never for anything consequential;
//   - after an approval: the same element, with the same item and selection, or nothing happens;
//   - the page agent's activation check while the input is sent, the one choke point: any event
//     that is not the approved step (another element swapped in, a key landing elsewhere, a
//     select or radio changed by a key, a paste) is cancelled before the page sees it;
//   - hard refusals: typing into password, card-number or CVV fields (also inside closed shadow
//     roots, and anywhere in frames from other sites, which Jarvis cannot see into), the
//     clipboard (paste, copy, cut), keys that would change a select or radio, form_input on
//     buttons, reloading a page that is the result of a submitted form.

import { abortError, abortableSleep, isAbort, singleLine, truncate } from '../shared/util.js';
import { blockedReason, isActionableUrl, normalizeNavigateUrl, sanitizeUrl, siteOf } from './sites.js';
import { GUARD_CATEGORIES, RISKY_FILE, classifyAction, isEditableFocus, isToggle, pageKey, secretKindOf, secretRefusal, SECRET_NAMES } from './guard.js';
import { assessClick, assessFormInput, assessKey, assessType } from './actions.js';
import { coordinateError, frameFor, toCss, zoomPlan, THUMB_WIDTH } from './images.js';
import { chordEvents, chordLabel, clickModifiers, isClipboardChord, isEscapeChord, isPasteChord, isPrintableChord, parseKeys } from './keys.js';
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

const aOrAn = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

/** A chord's modifiers as the page agent sees them on the key event ("ctrl+shift"). */
const modsOf = (chord) => ['alt', 'ctrl', 'meta', 'shift'].filter((m) => chord.mods.includes(m)).join('+');

/** An <input> that is a button (its value is its label): form_input must not rename it. */
const isButtonInput = (d) => String(d?.tag || '').toLowerCase() === 'input' && ['submit', 'button', 'reset', 'image', 'hidden', 'file'].includes(String(d?.type || '').toLowerCase());

const VERBS = { left_click: 'Click', right_click: 'Right-click', middle_click: 'Middle-click (opens it in a new tab)', double_click: 'Double-click', triple_click: 'Triple-click' };

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

  /** The owner's "everyday steps" setting for the site Jarvis acts on (off unless they turned it on). */
  everyday(ctx) {
    try {
      return !!(ctx?.site && this.policy.everyday?.(ctx.site));
    } catch {
      return false;
    }
  }

  /** Whether a tab's page may be described to Claude (its site is allowed in this task). */
  revealed(url) {
    if (!/^https?:/i.test(String(url || ''))) return true;
    if (typeof this.policy.isAllowed !== 'function') return true;
    try {
      return !!this.policy.isAllowed(siteOf(url));
    } catch {
      return false;
    }
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
    const tabs = this.driver.inventory({ reveal: (url) => this.revealed(url) });
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
        const verdict = d.asked ? (d.accepted ? 'the owner answered OK' : 'the owner answered Cancel') : d.accepted ? 'Jarvis accepted it' : d.type === 'beforeunload' ? 'Jarvis stayed on the page' : 'Jarvis dismissed it';
        const advice = !d.accepted && d.type === 'confirm' ? (d.asked ? " Don't try it again or find another way; tell the owner and finish." : ' If the owner wants what it asks, call request_confirmation describing exactly that action, then do it again.') : '';
        const msg = truncate(singleLine(d.message), 300);
        return `The page showed ${aOrAn(d.type)} dialog (${verdict}).${advice}${msg ? ` Its text:\n${this.wrap(t, msg, 'dialog')}` : ''}`;
      })
      .join('\n');
  }

  ack(text) {
    const notes = [this.dialogNotes(), this.downloadNotes()].filter(Boolean).join('\n');
    return [{ type: 'text', text: notes ? `${text}\n${notes}` : text }, this.browserState()];
  }

  /** Downloads started since the last result, and what the owner decided. */
  downloadNotes() {
    try {
      const list = this.policy.drainDownloads?.() || [];
      return list.map((d) => `A download started: "${truncate(singleLine(d.name), 80)}" from ${d.site || 'the page'} (${d.verdict === 'approved' ? 'the owner approved it; Chrome saved it to the Downloads folder' : d.verdict === 'pending' ? 'the owner has not answered yet' : 'the owner declined it; nothing was saved'}).`).join('\n');
    } catch {
      return '';
    }
  }

  // -------------------------------------------------------------------------------------------

  async tabOp(name, input, info, ctx) {
    const d = this.driver;
    if (name === 'new_tab') {
      const t = await d.newTab({ windowId: d.active()?.windowId });
      // Exactly one browser_state with exactly one tab_opened matching the active tab. Page-opened
      // tabs not yet reported stay queued for the next result.
      const tabs = d.inventory({ reveal: (url) => this.revealed(url) });
      this.scanTitles(tabs);
      return [{ type: 'browser_state', tabs, state_changes: [{ type: 'tab_opened', tab_id: t.toolId }] }];
    }
    if (name === 'list_tabs') {
      for (const t of d.openTabs()) await d.refresh(t);
      return [this.browserState()];
    }
    const t = d.get(input.tab_id);
    if (!t) fail(`Error: there is no open tab "${input.tab_id}". Call list_tabs to see the open tabs.`);
    const shown = this.revealed(t.url);
    info.title = shown ? t.title : siteOf(t.url) || t.toolId;
    if (name === 'switch_tab') {
      await d.activate(t);
      // A tab on a site the owner has not allowed: no picture of it (and no debugger session).
      if (shown) await this.thumbnail(t, ctx);
      return [this.browserState()];
    }
    // close_tab: a tab Jarvis opened closes; the owner's own tabs only with their OK.
    if (!t.openedByJarvis) {
      const site = /^https?:/i.test(t.url || '') ? siteOf(t.url) : '';
      await this.approve(t, { kind: 'tab', verb: 'Close', detail: `${t.toolId}, your own tab${site ? ` on ${site}` : ''}`, label: `${t.toolId}`, site }, { ...ctx, site });
    }
    const r = await d.closeTab(t, { signal: ctx.signal });
    if (r?.error) fail(r.error);
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
      let download = null;
      if (n.history) {
        if (n.history === 'reload') {
          await d.refresh(t);
          asked = t.url;
          await this.allowSite(t.url, ctx);
          await d.activate(t);
          // A page that is the result of a submitted form (an order, a payment, a message): a
          // reload sends the form again (Chrome would warn a person; the debugger's reload doesn't).
          if (await d.isFormResult(t)) fail('Error: this page is the result of a form that was submitted (an order, a payment, a message or similar). Reloading it would send the form again and repeat that action, so Jarvis did not reload. Look at the page as it is, or navigate to an address instead.');
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
        // An address the owner declined to open (a link they cancelled) stays closed.
        if (this.policy.isDeclinedHref?.(n.url)) fail(`Blocked: the owner declined a step that opens this address (${truncate(sanitizeUrl(n.url), 120)}). It was not done. Don't try it again or find another way; tell the owner and finish.`);
        await this.allowSite(n.url, ctx);
        await d.activate(t);
        await this.navigateCheck(t, n.url, ctx);
        const r = await d.navigate(t, n.url, { signal });
        if (r.download) download = await this.downloadOutcome(n.url, ctx);
        else if (r.blocked) fail(`Error: Jarvis stopped ${truncate(sanitizeUrl(n.url), 120)} from opening: it went to a site the owner has not allowed. Nothing was done there.`);
        else if (r.error) fail(r.error);
      }
      await d.refresh(t);
      info.url = download ? n.url : t.url;
      t.frame = null;
      if (download) return this.ack(download);
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
        // Scrolling changes nothing: the check stops anything else the wheel might do (a number
        // field under the pointer that would change its value).
        await this.sendMouse(t, ctx, [
          { type: 'mouseMoved', x: p.x, y: p.y, button: 'none', buttons: 0 },
          { type: 'mouseWheel', x: p.x, y: p.y, deltaX: dir === 'left' ? -delta : dir === 'right' ? delta : 0, deltaY: dir === 'up' ? -delta : dir === 'down' ? delta : 0 },
        ], { scrollOnly: true });
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

  /** A capture, decoded, with other sites' payment or sign-in boxes painted over. */
  async captureBitmap(t, { hideOverlay, quality } = {}) {
    const shot = await this.driver.capture(t, { hideOverlay, ...(quality ? { quality } : {}) });
    let bmp = await this.encoder.decode(shot.data, 'image/jpeg');
    if (shot.masks?.length) {
      if (typeof this.encoder.mask !== 'function') throw new DriverError("Error: Jarvis could not hide this page's private fields for a picture, so it took none.");
      const vp = t.frame?.cssW ? t.frame.cssW : null;
      const k = vp ? bmp.width / vp : t.frame?.dpr || 1;
      bmp = await this.encoder.mask(bmp, shot.masks.map((r) => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k })));
    }
    return bmp;
  }

  async screenshot(t, ctx) {
    const vp0 = await this.pageOp(t, 'viewport', {}, ctx).catch((err) => {
      if (err instanceof CallError) throw err;
      return null;
    }); // makes sure the control bar can be hidden
    if (vp0?.w) t.frame = t.frame || { ...frameFor(vp0.w, vp0.h), cssW: vp0.w, cssH: vp0.h, dpr: vp0.dpr || 1 };
    this.steady(t, ctx);
    const bmp = await this.captureBitmap(t, { hideOverlay: true });
    this.steady(t, ctx); // the picture is of the page the owner allowed
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
    const bmp = await this.captureBitmap(t, { hideOverlay: true });
    this.steady(t, ctx);
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
   * covered, hitDesc, hitId, ctx, selection }). Refs are scrolled into view first; coordinates are
   * checked against the screenshot frame. `hitDesc` is what a click there really reaches when it
   * is another element than the ref's (a covering element, a button inside it); `ctx` is the item
   * that element belongs to, `selection` what is selected on the page.
   */
  async point(t, target, info, { scroll = true, describe = true } = {}, ctx = {}) {
    if (target.type === 'ref') {
      const r = await this.pageOp(t, 'resolveTarget', { ref: target.ref, scroll }, ctx);
      if (!r || r.error) fail(r?.error || `Error: ${target.ref} is stale or not found on the current page. Re-read the page to get fresh references.`);
      info.target = { name: r.name, role: r.role };
      this.progress(info);
      ctx.doc = t.docSeq;
      return { x: r.x, y: r.y, desc: r.desc, covered: r.covered, targetId: r.targetId, hitDesc: r.hitDesc, hitId: r.hitId, ctx: r.ctx || '', item: r.item || '', selection: r.selection || null };
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
    return { x: css.x, y: css.y, desc: r?.desc || null, targetId: r?.targetId, ctx: r?.ctx || '', item: r?.item || '', selection: r?.selection || null };
  }

  /** What a click at `p` reaches: the element, or what covers it (or sits inside it at that point). */
  reach(p) {
    return p.hitDesc ? { desc: p.hitDesc, targetId: p.hitId, ctx: p.ctx || '', item: p.item || '' } : { desc: p.desc, targetId: p.targetId, ctx: p.ctx || '', item: p.item || '' };
  }

  /**
   * A custom element whose inside is a closed shadow root: what a click at `p` really reaches in
   * there, for the owner's prompt (the page agent only sees the host).
   */
  async pierced(t, p, desc) {
    if (!desc || !String(desc.tag || '').includes('-') || p.x === undefined) return desc;
    try {
      const r = await this.driver.pierceAt(t, p.x, p.y);
      if (r?.desc && r.desc.tag !== desc.tag) return { ...r.desc, inClosedShadow: true };
    } catch {
      /* keep what the page agent saw */
    }
    return desc;
  }

  /** The site a link or form sends the click to needs the owner's permission too (before the request). */
  async checkDestination(dest, ctx) {
    if (!dest) return;
    if (this.policy.isDeclinedHref?.(dest)) fail(`Blocked: the owner declined a step that opens this address (${truncate(sanitizeUrl(dest), 120)}). It was not done. Don't try it again or find another way; tell the owner and finish.`);
    if (/^https?:/i.test(dest) && siteOf(dest) !== ctx.site) await this.allowSite(dest, ctx);
  }

  /**
   * A point over a frame from another site: every site in the chain of frames there (frames nested
   * in frames too) needs permission, the step names the innermost one, and the owner approves it.
   */
  async frameStep(t, p, r, verb, ctx) {
    let chain;
    try {
      chain = await this.driver.frameChainAt(t, p.x, p.y);
    } catch {
      chain = { error: 'failed' };
    }
    if (!Array.isArray(chain) || !chain.length) fail("Error: Jarvis can't tell which site the box at that point comes from, so it did nothing there. Look at the page again, or open that site in its own tab.");
    for (const f of chain) if (f.site !== ctx.site) await this.allowSite(f.url, ctx);
    const inner = chain[chain.length - 1];
    const outer = chain.length > 1 ? chain[0] : null;
    const where = `${inner.site}${outer && outer.site !== inner.site ? `, inside a box from ${outer.site}` : ''}`;
    const guard = classifyAction(r.desc) || { category: 'frame', label: `a box from ${where}`, reason: `acting inside a box embedded from ${inner.site}, which Jarvis cannot see into` };
    return { kind: 'click', verb, desc: r.desc, label: `a box from ${where}`, targetId: r.targetId, ctx: r.ctx, item: r.item, selection: p.selection, guard, frameChain: chain, site: inner.site, doc: t.docSeq };
  }

  /**
   * The owner's approval for one step, or the refusal (thrown). `step`: { kind, verb, desc, label?,
   * targetId?, ctx? (what the approval binds to: its name and item), item? (the item, shown),
   * selection?, guard? (what it would do), detail?, dest?, site?,
   * bindable? (a request_confirmation approval of exactly this element may cover it) }.
   */
  async approve(t, step, ctx) {
    const c = this.stepFacts(t, step, ctx);
    const refusal = await this.policy.confirmGuard(c, ctx);
    if (refusal) fail(refusal);
    if (step.dest && step.guard?.category === 'download') this.policy.allowDownload?.({ url: step.dest, site: c.site, toolId: t.toolId });
    return c;
  }

  /** What the owner is shown about a step, and what an approval of it binds to. */
  stepFacts(t, step, ctx) {
    const g = step.guard || null;
    const d = step.desc || null;
    const site = step.site || ctx.site || siteOf(t.url);
    const own = d?.name || d?.text || d?.value || '';
    // A key or text goes to the focused element: that is what the owner is shown (what the guard
    // recognises it would do, a form's "Place order", goes in the reason).
    const focused = step.kind === 'key' || step.kind === 'type';
    const label = step.label || (focused ? own || g?.label : g?.label || own) || '';
    const via = focused && g?.label && own && singleLine(g.label) !== singleLine(own) ? ` ("${truncate(singleLine(g.label), 60)}")` : '';
    // What the element shows and what the page labels it, when they differ (a text field's text is
    // its content, not a label).
    const editable = !!d && (isEditableFocus(d) || d.isContentEditable);
    const other = !editable && d?.name && d?.text && singleLine(d.name) !== singleLine(d.text) ? (singleLine(label) === singleLine(d.text) ? d.name : d.text) : '';
    const c = {
      category: g?.category || 'change',
      consequential: !!g,
      label: truncate(singleLine(label), 80),
      plain: !!step.plain,
      alias: g?.alias || other || '',
      reason: g ? `${g.reason || GUARD_CATEGORIES[g.category] || ''}${via}` : '',
      verb: step.verb,
      role: d ? describeRole(d) : '',
      item: step.item && step.item !== label ? truncate(singleLine(step.item), 160) : '',
      selection: step.selection && step.selection.count ? { count: step.selection.count, names: step.selection.names || [] } : null,
      detail: step.detail || '',
      dest: step.dest || '',
      unlabelled: !label ? d?.unlabelled || 'an element with no label' : '',
      hidden: !!d?.inClosedShadow,
      url: t.url,
      site,
      toolId: t.toolId,
      bind: step.bindable && step.targetId !== undefined && step.targetId !== null ? { doc: step.doc ?? t.docSeq, targetId: step.targetId, ctx: step.ctx || '', selection: step.selection?.key || '' } : null,
      element: step.targetId !== undefined && step.targetId !== null ? `${t.toolId}|${step.doc ?? t.docSeq}|${step.targetId}` : '',
    };
    return c;
  }

  /**
   * request_confirmation's target: the element in the active tab it names, described for the
   * owner, and what an approval binds to (that element in this document, the item around it,
   * what is selected). Returns the step's facts, or { error } (nothing is asked then).
   */
  async describeTarget(target, ctx = {}) {
    try {
      if (!isObj(target)) fail('Error: request_confirmation needs "target": the element the action will use, as {"type": "ref", "ref": "ref_N"} or {"type": "coordinate", "x": <int>, "y": <int>}.');
      checkTarget(target);
      const t = this.tab({});
      const c = { ...ctx };
      await this.ensureSite(t, c);
      const p = await this.point(t, target, {}, { scroll: true }, c);
      const r = this.reach(p);
      if (!r.desc || r.targetId === undefined || r.targetId === null) fail('Error: there is no element at that target. Look at the page again and name the element the action will use.');
      if (r.desc.tag === 'jarvis-control-overlay') fail("Error: Jarvis's own control bar is at that point. Name the element with a ref from read_page or find.");
      const desc = await this.pierced(t, p, r.desc);
      const step = { kind: 'confirm', verb: 'Act on', desc, targetId: r.targetId, ctx: r.ctx, item: r.item, selection: p.selection, guard: isForeignFrame(desc) ? { category: 'frame', label: 'a box from another site', reason: 'acting inside a box embedded from another site, which Jarvis cannot see into' } : classifyAction(desc), bindable: true, doc: t.docSeq };
      return this.stepFacts(t, step, c);
    } catch (err) {
      if (ctx.signal?.aborted) throw abortError();
      return { error: err instanceof CallError || err instanceof DriverError ? err.message : `Error: ${singleLine(err?.message || err).replace(/^Error:\s*/, '')}` };
    }
  }

  /**
   * After an approval the page may have changed while the owner was deciding: resolve the target
   * again and refuse unless it is the same element, in the same document, with the same item and
   * selection (and, for a frame from another site, the same frames showing the same pages).
   */
  async recheck(t, target, info, step, ctx) {
    if (step.doc !== undefined && t.docSeq !== step.doc) fail('Error: the page changed while the owner was deciding, so Jarvis did not act. Look at the page again before you act.');
    const again = await this.point(t, target, info, { scroll: false }, ctx);
    const r = this.reach(again);
    if (step.frameChain) await this.sameFrames(t, again, step);
    else if (String(r.targetId) !== String(step.targetId) || (r.ctx || '') !== (step.ctx || '') || (again.selection?.key || '') !== (step.selection?.key || '')) {
      fail('Error: the page changed while the owner was deciding (the element, the item it belongs to, or what is selected), so Jarvis did not act. Look at the page again before you act.');
    }
    return again;
  }

  /** The frames at the point are still the ones the owner approved (none moved to another page). */
  async sameFrames(t, p, step) {
    let chain;
    try {
      chain = await this.driver.frameChainAt(t, p.x, p.y);
    } catch {
      chain = null;
    }
    const same = Array.isArray(chain) && chain.length === step.frameChain.length && chain.every((f, i) => f.frameId === step.frameChain[i].frameId && f.site === step.frameChain[i].site && f.navSeq === step.frameChain[i].navSeq && f.sessionId === step.frameChain[i].sessionId);
    if (!same) fail('Error: the page changed while the owner was deciding (a box from another site moved or loaded another page), so Jarvis did not act. Look at the page again before you act.');
  }

  /**
   * Sends mouse events with the page agent's activation check armed: only the `approved` elements
   * receive them (anything else consequential or not is stopped). With `expect`, after the first
   * event (the pointer arriving) the element under the pointer must still be the one approved.
   */
  async sendMouse(t, ctx, events, { approved = [], expect = null, step = null, scrollOnly = false } = {}) {
    const d = this.driver;
    this.steady(t, ctx);
    const armed = await this.pageOp(t, 'arm', { approved, scrollOnly }, ctx);
    let res = null;
    await d.passthrough(t, true);
    try {
      if (armed?.missing) fail('Error: the page changed before Jarvis could act (the element is gone), so Jarvis did nothing. Look at the page again before you act.');
      const [first, ...rest] = events;
      await d.mouse(t, [first]);
      if (expect) await this.hoverCheck(t, expect, step, ctx);
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

  /** The pointer reached the target: if the page put another element (or another item) there, stop. */
  async hoverCheck(t, expect, step, ctx) {
    if (step?.frameChain) {
      await this.sameFrames(t, expect, step);
      return;
    }
    if (expect.targetId === undefined) return;
    const r = await this.pageOp(t, 'hitCheck', { x: expect.x, y: expect.y, targetId: expect.targetId }, ctx);
    if (!r) return;
    const changedItem = r.same && step && typeof step.ctx === 'string' && (r.ctx || '') !== step.ctx;
    if (r.same && !changedItem) return;
    const now = r.desc ? classifyAction(r.desc) : null;
    const what = truncate(singleLine(now?.label || r.name || r.desc?.unlabelled || 'another element'), 60);
    const why = now ? ` (${now.reason || GUARD_CATEGORIES[now.category]})` : '';
    this.policy.onBlocked?.(changedItem ? `Jarvis did not click: the item “${what}” belongs to changed when the pointer reached it.` : `Jarvis did not click: the page swapped in “${what}” under the pointer.`);
    fail(changedItem
      ? `Error: when the pointer reached it, the item that element belongs to had changed, so Jarvis did not press. Nothing was done. Look at the page again before you act.`
      : `Error: when the pointer reached it, the page put "${what}"${why} under the pointer, so Jarvis did not press. Nothing was done. Look at the page again before you act.`);
  }

  /** The page agent stopped input the owner did not approve (or could not check it): report it. */
  checkActivations(res) {
    if (res && res.intact === false) {
      this.policy.onBlocked?.('The page rewrote itself while Jarvis was acting, so Jarvis could not check what its input did.');
      fail('Error: the page rewrote itself (document.open) while Jarvis was pressing, so Jarvis cannot tell what that input did. Look at the page again before you act, and tell the owner if something may have happened.');
    }
    if (!res?.blocked?.length) return;
    const b = res.blocked[0];
    const label = truncate(singleLine(b.label), 60);
    const why = b.reason || GUARD_CATEGORIES[b.category] || 'not what the owner approved';
    this.policy.onBlocked?.(`Jarvis stopped input from reaching “${label}”: ${why}.`);
    fail(`Error: the input reached "${label}" (${why}), which is not what Jarvis checked${res.activations ? ' after the approved step went through once' : ''}, so Jarvis stopped it before it took effect.${res.activations ? '' : ' Nothing was done.'} Look at the page again before you act.`);
  }

  async click(name, t, input, info, ctx) {
    const d = this.driver;
    let p = await this.point(t, input.target, info, {}, ctx);
    const modifiers = clickModifiers(input.modifiers);
    const count = CLICKS[name];
    const button = BUTTON[name];
    const r = this.reach(p);
    if (r.desc?.tag === 'jarvis-control-overlay') fail("Error: Jarvis's own control bar is at that point. Scroll the page, or use a ref from read_page or find.");
    let step = null;
    if (isForeignFrame(r.desc)) {
      step = await this.frameStep(t, p, r, VERBS[name], ctx);
      if (count > 1) fail(`Error: ${name} would act more than once inside a box from ${step.site}, which Jarvis cannot see into. Use a single left_click; the owner is asked first.`);
      await this.approve(t, step, ctx);
    } else {
      const desc = await this.pierced(t, p, r.desc);
      const v = assessClick({ desc, button, count, modifiers, pageUrl: t.url, everyday: this.everyday(ctx) });
      if (v.guard && count > 1 && !isTextField(desc)) {
        fail(`Error: ${name} would activate "${truncate(singleLine(v.guard.label), 60)}" (${v.guard.reason || GUARD_CATEGORIES[v.guard.category]}) more than once. Use a single left_click; the owner is asked first.`);
      }
      await this.checkDestination(v.dest, ctx);
      if (v.verdict === 'ask') {
        step = { kind: 'click', verb: VERBS[name], desc, targetId: r.targetId, ctx: r.ctx, item: r.item, selection: p.selection, guard: v.guard, dest: v.dest && siteOf(v.dest) !== ctx.site ? v.dest : '', detail: modifiers ? `with ${input.modifiers} held` : '', bindable: name === 'left_click' && !modifiers, doc: t.docSeq };
        await this.approve(t, step, ctx);
      } else if (this.policy.isDeclinedElement?.(`${t.toolId}|${t.docSeq}|${r.targetId}`)) {
        fail('Blocked: the owner declined this step earlier in this task. It was not done. Don\'t try it again or find another way; tell the owner and finish.');
      }
    }
    if (step) p = await this.recheck(t, input.target, info, step, ctx);
    const target = this.reach(p);
    const approved = [{ targetId: target.targetId, ctx: step ? step.ctx : undefined, kind: 'pointer', clicks: count }];
    const buttons = button === 'left' ? 1 : button === 'right' ? 2 : 4;
    const before = d.marks(t);
    const { x, y } = p;
    const expect = { x, y, targetId: target.targetId };
    const firstClass = classifyAction(target.desc);
    for (let i = 1; i <= count; i++) {
      const events = i === 1 ? [{ type: 'mouseMoved', x, y, button: 'none', buttons: 0, modifiers }] : [];
      events.push({ type: 'mousePressed', x, y, button, buttons, clickCount: i, modifiers }, { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: i, modifiers });
      if (i > 1) {
        // Between clicks the page may have turned the element into something else ("Continue"
        // becoming "Place order"): the owner approved what it was, so look again first.
        const r2 = await this.pageOp(t, 'hitCheck', { x, y, targetId: target.targetId }, ctx);
        const now = r2?.desc ? classifyAction(r2.desc) : null;
        const changed = !r2?.same || (step && (r2.ctx || '') !== (step.ctx || '')) || (now && (!firstClass || now.category !== firstClass.category || now.label !== firstClass.label));
        if (changed && !isTextField(r2?.desc)) {
          const what = truncate(singleLine(now?.label || r2?.name || 'something else'), 60);
          fail(`Error: Jarvis stopped after ${i - 1} of ${count} clicks: the element there is now "${what}"${now ? ` (${now.reason || GUARD_CATEGORIES[now.category]})` : ''}. Look at the page again before you act.`);
        }
      }
      await this.sendMouse(t, ctx, events, { approved: i === 1 ? approved : approved.map((a) => ({ ...a, clicks: 1 })), expect: i === 1 ? expect : null, step });
    }
    await d.settleAfter(t, before, { signal: ctx.signal });
    await d.refresh(t);
    await this.afterInput(t, ctx);
    await this.thumbnail(t, ctx);
    const verb = { left_click: 'Clicked', right_click: 'Right-clicked', middle_click: 'Middle-clicked', double_click: 'Double-clicked', triple_click: 'Triple-clicked' }[name];
    const what = input.target.type === 'ref' ? `element ${input.target.ref}` : `at (${input.target.x}, ${input.target.y})`;
    const covered = p.covered ? ` Note: the click landed on another element that covers that one:\n${this.wrap(t, truncate(singleLine(p.covered), 100), 'element_name')}` : '';
    return this.ack(`${verb} ${what}.${covered}`);
  }

  /**
   * After input that may have taken the tab elsewhere: a page on another site needs that site's
   * permission before anything about it (title, address, picture) is reported.
   */
  async afterInput(t, ctx) {
    if (/^https?:/i.test(t.url || '') && ctx.site && siteOf(t.url) !== ctx.site) await this.allowSite(t.url, ctx);
  }

  async drag(t, input, info, ctx) {
    const d = this.driver;
    const from = await this.point(t, input.from, info, {}, ctx);
    const to = await this.point(t, input.target, info, { scroll: false }, ctx);
    const rf = this.reach(from);
    const rt = this.reach(to);
    for (const r of [rf, rt]) if (r.desc?.tag === 'jarvis-control-overlay') fail("Error: Jarvis's own control bar is at that point. Scroll the page first.");
    // A drag always asks: it presses, moves and releases (it can click, move things, or drop them).
    let step;
    if (isForeignFrame(rf.desc) || isForeignFrame(rt.desc)) {
      const end = isForeignFrame(rf.desc) ? [from, rf] : [to, rt];
      step = await this.frameStep(t, end[0], end[1], 'Drag in', ctx);
    } else {
      const guard = classifyAction(rf.desc) || classifyAction(rt.desc);
      const labelOf = (r) => truncate(singleLine(r.desc?.name || r.desc?.text || r.desc?.unlabelled || 'the page'), 40);
      step = { kind: 'drag', verb: 'Drag', desc: rf.desc, targetId: rf.targetId, ctx: rf.ctx, item: rf.item, selection: from.selection, guard, detail: `from "${labelOf(rf)}" to "${labelOf(rt)}"`, label: labelOf(rf), doc: t.docSeq };
    }
    await this.approve(t, step, ctx);
    if (step.frameChain) await this.sameFrames(t, isForeignFrame(rf.desc) ? from : to, step);
    else {
      await this.recheck(t, input.from, info, step, ctx);
      const toAgain = this.reach(await this.point(t, input.target, info, { scroll: false }, ctx));
      if (String(toAgain.targetId) !== String(rt.targetId) || toAgain.ctx !== rt.ctx) fail('Error: the page changed while the owner was deciding, so Jarvis did not drag. Look at the page again before you act.');
    }
    const approved = [
      { targetId: rf.targetId, ctx: rf.ctx, kind: 'pointer', clicks: 1 },
      { targetId: rt.targetId, ctx: rt.ctx, kind: 'pointer', clicks: 1 },
    ];
    const before = d.marks(t);
    const events = [{ type: 'mouseMoved', x: from.x, y: from.y, button: 'none', buttons: 0 }, { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 }];
    for (let i = 1; i <= 8; i++) events.push({ type: 'mouseMoved', x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8, button: 'left', buttons: 1 });
    events.push({ type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
    await this.sendMouse(t, ctx, events, { approved, expect: { x: from.x, y: from.y, targetId: rf.targetId }, step });
    await d.settleAfter(t, before, { signal: ctx.signal });
    await d.refresh(t);
    await this.afterInput(t, ctx);
    await this.thumbnail(t, ctx);
    return this.ack(`Dragged from (${input.from.x}, ${input.from.y}) to (${input.target.x}, ${input.target.y}).`);
  }

  async mouseButton(name, t, input, info, ctx) {
    const d = this.driver;
    const down = name === 'left_mouse_down';
    let p = await this.point(t, input.target, info, {}, ctx);
    const r = this.reach(p);
    if (r.desc?.tag === 'jarvis-control-overlay') fail("Error: Jarvis's own control bar is at that point. Scroll the page first.");
    // Pressing alone fires pointerdown and mousedown, which some sites act on: it asks. The release
    // on the same element is covered by the owner's approval of the press.
    const press = this.pressed;
    const covered = !down && press && press.toolId === t.toolId && press.doc === t.docSeq && String(press.targetId) === String(r.targetId) && press.ctx === r.ctx && Date.now() - press.at < PRESS_APPROVAL_MS;
    let step = null;
    if (!covered) {
      step = isForeignFrame(r.desc)
        ? await this.frameStep(t, p, r, down ? 'Press the mouse on' : 'Release the mouse on', ctx)
        : { kind: 'click', verb: down ? 'Press the mouse on' : 'Release the mouse on', desc: r.desc, targetId: r.targetId, ctx: r.ctx, item: r.item, selection: p.selection, guard: classifyAction(r.desc), doc: t.docSeq };
      await this.approve(t, step, ctx);
      p = await this.recheck(t, input.target, info, step, ctx);
    }
    const target = this.reach(p);
    const approved = [{ targetId: target.targetId, ctx: step ? step.ctx : press?.ctx, kind: 'pointer', clicks: 1 }];
    const before = d.marks(t);
    await this.sendMouse(
      t,
      ctx,
      [
        { type: 'mouseMoved', x: p.x, y: p.y, button: down ? 'none' : 'left', buttons: down ? 0 : 1 },
        { type: down ? 'mousePressed' : 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: down ? 1 : 0, clickCount: 1 },
      ],
      { approved, expect: { x: p.x, y: p.y, targetId: target.targetId }, step },
    );
    this.pressed = down ? { toolId: t.toolId, doc: t.docSeq, targetId: target.targetId, ctx: target.ctx, at: Date.now() } : null;
    await d.settleAfter(t, before, { signal: ctx.signal });
    await d.refresh(t);
    await this.afterInput(t, ctx);
    await this.thumbnail(t, ctx);
    return this.ack(down ? `Pressed the left button at (${input.target.x}, ${input.target.y}).` : `Released the left button at (${input.target.x}, ${input.target.y}).`);
  }

  /**
   * The element with the keyboard focus, described for the guard, looking inside closed shadow
   * roots (through the debugger) when the page agent only sees their host: { desc (null: the page
   * itself has the focus), targetId (the element the page's key events reach), ctx, selection }.
   * desc.unknown: focus is somewhere Jarvis cannot identify.
   */
  async focus(t, ctx) {
    const f = await this.pageOp(t, 'focusInfo', {}, ctx);
    const out = { desc: f?.desc || null, targetId: f?.targetId, ctx: f?.ctx || '', item: f?.item || '', selection: f?.selection || null };
    const desc = out.desc;
    if (!desc || desc.iframe || isFieldLike(desc)) return out;
    let deep = null;
    try {
      deep = await this.driver.pierceFocus(t);
    } catch {
      deep = { failed: true };
    }
    if (deep?.pierced) {
      if (typeof deep.href === 'string' && ctx?.site !== undefined && siteOf(deep.href) !== ctx.site) this.moved(t, deep.href);
      out.desc = deep.desc ? { ...deep.desc, inClosedShadow: true } : { tag: desc.tag, unknown: true };
      return out;
    }
    // A custom element whose inside Jarvis could not check might hold a field.
    if (deep?.failed && String(desc.tag || '').includes('-')) out.desc = { ...desc, unknown: true };
    return out;
  }

  secretOf(desc) {
    return secretKindOf(desc);
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
    const f = await this.focus(t, ctx);
    const desc = f.desc;
    if (!desc) fail('Error: nothing on the page has keyboard focus. Click a text field first, then type.');
    info.field = desc.name || desc.field?.label || desc.field?.placeholder || '';
    this.progress(info);
    this.checkTypingInto(desc, info, ctx);
    const v = assessType({ focus: desc, text, everyday: this.everyday(ctx) });
    const multiline = !!(desc.multiline || desc.isContentEditable);
    const parts = String(text).split(/\r?\n/);
    if (v.verdict === 'ask') {
      const shown = truncate(singleLine(text), 200);
      const step = { kind: 'type', verb: `Type "${shown}"${v.submits ? ' and press Enter' : ''} into`, desc, targetId: f.targetId, ctx: f.ctx, item: f.item, selection: f.selection, guard: v.guard, doc: t.docSeq };
      await this.approve(t, step, ctx);
      // The focus may have moved while the owner was deciding.
      const again = await this.focus(t, ctx);
      if (String(again.targetId) !== String(f.targetId) || (again.ctx || '') !== (f.ctx || '') || t.docSeq !== step.doc) fail('Error: the page changed while the owner was deciding (the keyboard focus moved), so Jarvis did not type. Look at the page again before you act.');
    }
    const breaks = parts.length - 1;
    const enter = { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' };
    const approved = [{ targetId: f.targetId, ctx: f.ctx, kind: 'type' }];
    if (breaks) approved.push({ targetId: f.targetId, kind: 'key', keys: [{ key: 'Enter', mods: multiline ? 'shift' : '' }], presses: breaks });
    const before = d.marks(t);
    this.steady(t, ctx);
    const armed = await this.pageOp(t, 'arm', { approved, ms: 30000 + text.length * 20 }, ctx);
    let res = null;
    try {
      if (armed?.missing) fail('Error: the page changed before Jarvis could type (the field is gone), so Jarvis did nothing. Look at the page again before you act.');
      for (let i = 0; i < parts.length; i++) {
        if (ctx.signal?.aborted) throw abortError();
        if (parts[i]) {
          this.steady(t, ctx);
          await d.insertText(t, parts[i]);
        }
        if (i < parts.length - 1) {
          // A line break inside a message is Shift+Enter, which never sends; in a one-line field
          // it is Enter (the owner approved "and press Enter").
          const ev = chordEvents({ mods: multiline ? ['shift'] : [], key: enter });
          this.steady(t, ctx);
          await d.keyEvents(t, [...ev.down, ...ev.press, ...ev.up]);
        }
      }
    } finally {
      res = await d.page(t, 'disarm', {}).catch(() => null);
    }
    this.checkActivations(res);
    await d.settleAfter(t, before, { signal: ctx.signal, quietMs: 200 });
    await d.refresh(t);
    await this.afterInput(t, ctx);
    await this.thumbnail(t, ctx);
    return this.ack(`Typed "${truncate(singleLine(text), 120)}".`);
  }

  /** Sends key events with the page agent's activation check armed (see sendMouse). */
  async sendKeys(t, ctx, events, { approved = [], scrollOnly = false, ms } = {}) {
    const d = this.driver;
    this.steady(t, ctx);
    const armed = await this.pageOp(t, 'arm', { approved, scrollOnly, ...(ms ? { ms } : {}) }, ctx);
    let res = null;
    try {
      if (armed?.missing) fail('Error: the page changed before Jarvis could press the key (the element is gone), so Jarvis did nothing. Look at the page again before you act.');
      await d.keyEvents(t, events);
    } finally {
      res = await d.page(t, 'disarm', {}).catch(() => null);
    }
    this.checkActivations(res);
  }

  /**
   * What pressing `chord` (`repeat` times) may do with the current focus, deny by default: the
   * clipboard is refused, keys into a frame from another site need that site and the owner's OK,
   * scrolling keys need nothing (where they scroll), typed characters never go into a secret
   * field, keys that would change a select or radio are refused, and every other key asks the
   * owner. Returns { approved, scrollOnly, frame } for sending it.
   */
  async keyCheck(t, chord, info, ctx, { repeat = 1, hold = false } = {}) {
    const label = chordLabel(chord);
    if (isClipboardChord(chord)) {
      info.secret = isPasteChord(chord);
      fail(isPasteChord(chord)
        ? "Refused: Jarvis never pastes from the clipboard (it may hold the owner's password, a code or other private data, and the page would get it). Use type with the exact text instead, or ask the owner to paste it themselves."
        : "Refused: Jarvis never copies or cuts to the owner's clipboard (it would replace what they copied, and a page can change what lands there). Read text with get_page_text instead.");
    }
    const f = await this.focus(t, ctx);
    const focus = f.desc;
    if (isForeignFrame(focus)) return this.frameKeyCheck(t, chord, focus, info, ctx, { repeat });
    if (focus?.unknown && !/^(Arrow|Page|Home|End|Shift|Control|Alt|Meta)/.test(chord.key.key)) {
      if (isPrintableChord(chord)) this.checkTypingInto(focus, info, ctx);
      fail(`Error: Jarvis can't see what has the keyboard focus (part of the page Jarvis cannot read), so it did not press ${label}. Click the element you mean instead.`);
    }
    if (isPrintableChord(chord)) {
      const kind = this.secretOf(focus);
      if (kind) this.refuseSecret(kind, info, ctx);
    }
    const v = assessKey({ chord, focus, everyday: this.everyday(ctx), pageUrl: t.url });
    if (v.verdict === 'refuse') fail(v.text);
    const keys = [{ key: chord.key.key, mods: modsOf(chord) }];
    const focusClass = focus ? classifyAction(focus) : null;
    if (v.verdict === 'allow') {
      if (v.why === 'a scrolling key' || v.why === 'a modifier key alone') return { approved: [], scrollOnly: true };
      return { approved: [{ targetId: f.targetId, kind: 'key', keys, presses: repeat, hold }], focusClass };
    }
    if (v.guard && repeat > 1) {
      fail(`Error: pressing ${label} ${repeat} times would activate "${truncate(singleLine(v.guard.label), 60)}" (${v.guard.reason || GUARD_CATEGORIES[v.guard.category]}) more than once. Press it once; the owner is asked first.`);
    }
    const where = focus ? (isEditableFocus(focus) ? 'in' : 'on') : 'on';
    const step = { kind: 'key', verb: `Press ${label}${repeat > 1 ? ` ${repeat} times` : ''}${hold ? ' and hold it' : ''} ${where}`, desc: focus, label: focus ? '' : 'the page', plain: !focus, targetId: f.targetId, ctx: f.ctx, item: f.item, selection: f.selection, guard: v.guard, bindable: true, doc: t.docSeq };
    await this.approve(t, step, ctx);
    // The focus may have moved while the owner was deciding.
    const again = await this.focus(t, ctx);
    if (String(again.targetId) !== String(f.targetId) || (again.ctx || '') !== (f.ctx || '') || t.docSeq !== step.doc) fail('Error: the page changed while the owner was deciding (the keyboard focus moved), so Jarvis did not press the key. Look at the page again before you act.');
    return { approved: [{ targetId: f.targetId, ctx: f.ctx, kind: 'key', keys, presses: repeat, hold }], focusClass };
  }

  /**
   * A key with the focus in a frame from another site: every site in the frames that hold the
   * focus needs permission (a denied one: refused), the key asks the owner naming the innermost
   * site, and the frames must not have moved meanwhile. Typing there is refused.
   */
  async frameKeyCheck(t, chord, focus, info, ctx, { repeat = 1 } = {}) {
    let chain;
    try {
      chain = await this.driver.focusedFrameChain(t);
    } catch {
      chain = { error: 'failed' };
    }
    if (!Array.isArray(chain) || !chain.length) fail("Refused: Jarvis can't tell which site the box with the keyboard focus comes from, so it pressed nothing. Click the element you mean instead.");
    for (const fr of chain) if (fr.site !== ctx.site) await this.allowSite(fr.url, ctx);
    const editing = /^[azy]$/i.test(chord.key.key) && chord.mods.some((m) => m === 'ctrl' || m === 'meta');
    if (isPrintableChord(chord) || editing) this.checkTypingInto(focus, info, ctx);
    const inner = chain[chain.length - 1];
    const outer = chain.length > 1 ? chain[0] : null;
    const where = `${inner.site}${outer && outer.site !== inner.site ? `, inside a box from ${outer.site}` : ''}`;
    const label = chordLabel(chord);
    const step = { kind: 'key', verb: `Press ${label}${repeat > 1 ? ` ${repeat} times` : ''} in`, desc: focus, label: `a box from ${where}`, guard: { category: 'frame', label: `a box from ${where}`, reason: `a key pressed inside a box embedded from ${inner.site}, which Jarvis cannot see into` }, site: inner.site, doc: t.docSeq };
    await this.approve(t, step, ctx);
    let again;
    try {
      again = await this.driver.focusedFrameChain(t);
    } catch {
      again = null;
    }
    const same = Array.isArray(again) && again.length === chain.length && again.every((fr, i) => fr.frameId === chain[i].frameId && fr.site === chain[i].site && fr.navSeq === chain[i].navSeq);
    if (!same) fail('Error: the page changed while the owner was deciding (the box with the focus moved or loaded another page), so Jarvis did not press the key. Look at the page again before you act.');
    return { approved: [], frame: true };
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
      // Every chord goes out with the activation check armed: only the approved key on the
      // approved element (or a scrolling key where it scrolls) reaches the page.
      const first = check.approved[0];
      const label0 = check.focusClass;
      for (let i = 0; i < repeat; i++) {
        if (i > 0 && first) {
          // Each press can land on something new (the page moved the focus, or changed the element).
          const now = await this.focus(t, ctx);
          const c = now.desc ? classifyAction(now.desc) : null;
          if (String(now.targetId) !== String(first.targetId) || (typeof first.ctx === 'string' && (now.ctx || '') !== first.ctx) || (c && (!label0 || c.label !== label0.label || c.category !== label0.category))) {
            fail(`Error: Jarvis stopped after ${i} of ${repeat} presses: ${chordLabel(chord)} would now reach ${c ? `"${truncate(singleLine(c.label), 60)}" (${c.reason || GUARD_CATEGORIES[c.category]})` : 'another element'}. Look at the page again before you act.`);
          }
        }
        const approved = check.approved.map((a) => ({ ...a, presses: 1 }));
        await this.sendKeys(t, ctx, [...ev.down, ev.keyDown, ev.keyUp, ...ev.up], { approved, scrollOnly: !!check.scrollOnly });
      }
    }
    await d.settleAfter(t, before, { signal: ctx.signal });
    await d.refresh(t);
    await this.afterInput(t, ctx);
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
    const check = await this.keyCheck(t, chord, info, ctx, { hold: true });
    if (isEscapeChord(chord)) {
      d.suppressEsc(input.duration * 1000 + 800);
      await d.page(t, 'suppressEsc', { ms: input.duration * 1000 + 800 }).catch(() => {});
    }
    const ev = chordEvents(chord);
    this.steady(t, ctx);
    const armed = await this.pageOp(t, 'arm', { approved: check.approved, scrollOnly: !!check.scrollOnly, ms: input.duration * 1000 + 5000 }, ctx);
    let res = null;
    try {
      if (armed?.missing) fail('Error: the page changed before Jarvis could press the key (the element is gone), so Jarvis did nothing. Look at the page again before you act.');
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
    await this.afterInput(t, ctx);
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
    // A button's value is its label: form_input would rename it ("Place order" -> "Search").
    if (isButtonInput(r.desc)) {
      const type = String(r.desc.type).toLowerCase();
      fail(type === 'hidden' || type === 'file' ? `Error: ${ref} is a ${type} input, not a form field Jarvis sets.` : `Error: ${ref} is a button, not a form field. Click it instead.`);
    }
    const kind = this.secretOf(r.desc);
    if (kind) this.refuseSecret(kind, info, ctx);
    let value = input.value;
    let step = null;
    const doc = t.docSeq;
    if (isToggle(r.desc)) {
      // "true", 1, "on" … tick it, just as true does; the page agent gets the boolean.
      const want = value === true || value === 1 || /^(true|1|on|yes|checked)$/i.test(String(value).trim());
      value = want;
      const radio = String(r.desc.role).toLowerCase() === 'radio' || String(r.desc.type).toLowerCase() === 'radio';
      const changes = radio ? want && !r.desc.checked : want !== !!r.desc.checked;
      if (changes) {
        const v = assessFormInput({ desc: r.desc, willCheck: want, everyday: this.everyday(ctx), pageUrl: t.url });
        if (v.verdict === 'ask') step = { kind: 'form', verb: want ? 'Turn on' : 'Turn off', desc: r.desc, targetId: r.targetId, ctx: r.ctx, item: r.item, selection: r.selection, guard: v.guard, doc };
      }
    } else if (String(r.desc?.tag || '').toLowerCase() === 'select') {
      // A dropdown's change handler may act at once ("Actions: Delete all messages").
      const pv = await this.pageOp(t, 'previewOption', { ref, value }, ctx);
      if (pv?.option && !pv.option.selected) {
        const v = assessFormInput({ desc: { ...r.desc, name: pv.selectName || r.desc.name }, option: pv.option, everyday: this.everyday(ctx), pageUrl: t.url });
        if (v.verdict === 'ask') step = { kind: 'form', verb: `Choose "${truncate(singleLine(pv.option.text), 60)}" in`, desc: r.desc, targetId: r.targetId, ctx: r.ctx, item: r.item, selection: r.selection, guard: v.guard, option: pv.option.text, doc };
      }
    } else {
      const v = assessFormInput({ desc: r.desc, everyday: this.everyday(ctx), pageUrl: t.url });
      if (v.verdict === 'ask') step = { kind: 'form', verb: `Set`, detail: `to "${truncate(singleLine(String(value)), 120)}"`, desc: r.desc, targetId: r.targetId, ctx: r.ctx, item: r.item, selection: r.selection, guard: v.guard, doc };
    }
    if (step) {
      await this.approve(t, step, ctx);
      const again = await resolve();
      if (String(again.targetId) !== String(step.targetId) || (again.ctx || '') !== (step.ctx || '') || t.docSeq !== doc) fail('Error: the page changed while the owner was deciding, so Jarvis did not change it. Look at the page again before you act.');
      if (step.option) {
        const pv = await this.pageOp(t, 'previewOption', { ref, value }, ctx);
        if (!pv?.option || pv.option.text !== step.option) fail('Error: the page changed while the owner was deciding, so Jarvis did not choose it. Look at the page again before you act.');
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

  /**
   * navigate to an address: one the owner declined, a link or form on this page that the guard
   * recognises as consequential (navigating to its address does what clicking it does), or a
   * file to download, asks first.
   */
  async navigateCheck(t, url, ctx) {
    const site = siteOf(url);
    let links = null;
    // (An address on the page itself: links to it are this page's own script links, which a load
    // of the address does not run.)
    if (/^https?:/i.test(t.url || '') && siteOf(t.url) === site && pageKey(t.url) !== pageKey(url)) {
      links = await this.driver.page(t, 'linksTo', { url }).catch(() => null);
    }
    for (const l of links?.links || []) {
      const g = classifyAction(l.desc);
      if (!g) continue;
      await this.approve(t, { kind: 'navigate', verb: 'Open the address of', desc: l.desc, targetId: l.targetId, ctx: l.ctx, item: l.item, guard: g, dest: url, site, doc: t.docSeq }, { ...ctx, site });
      return;
    }
    let path = '';
    try {
      path = new URL(url).pathname;
    } catch {
      path = '';
    }
    if (RISKY_FILE.test(path)) {
      const name = decodeURIComponent(path.split('/').pop() || 'a file');
      await this.approve(t, { kind: 'navigate', verb: 'Download', label: name, detail: `from ${site}`, guard: { category: 'download', label: name, reason: 'downloading a file (an app or installer)' }, dest: url, site }, { ...ctx, site });
    }
  }

  /** navigate opened a file: Chrome downloads it, held until the owner decides (see the downloads gate). */
  async downloadOutcome(url, ctx) {
    const name = (() => {
      try {
        return decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || 'a file';
      } catch {
        return 'a file';
      }
    })();
    let verdict = null;
    try {
      verdict = await this.policy.awaitDownload?.(url, { signal: ctx.signal });
    } catch (err) {
      if (isAbort(err)) throw err;
      verdict = null;
    }
    if (verdict === 'approved') return `That address is a file download ("${truncate(singleLine(name), 80)}"). The owner approved it; Chrome saved it to the Downloads folder. The tab stayed on its page.`;
    if (verdict === 'declined') fail(`Blocked: that address is a file download ("${truncate(singleLine(name), 80)}") and the owner declined it, so nothing was saved. Don't try it again or find another way; tell the owner and finish.`);
    fail(`Error: that address is a file download ("${truncate(singleLine(name), 80)}"), not a page. Jarvis did not save it.`);
    return '';
  }

  /** Page-derived text as an untrusted, injection-checked result. */
  untrusted(t, text, kind) {
    return this.ack(this.wrap(t, text, kind));
  }

  // -------------------------------------------------------------------------------------------
  // Thumbnails for the side panel's step list (never sent to the API)

  async thumbnail(t, ctx) {
    if (!ctx.stepId || !this.hooks.onThumb || !isActionableUrl(t.url) || !this.revealed(t.url)) return;
    try {
      const bmp = await this.captureBitmap(t, { hideOverlay: false, quality: 55 });
      await this.thumbFrom(bmp, ctx);
    } catch {
      /* thumbnails are best effort (and never unmasked) */
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

/** "a button", "a link", "a text box": what kind of element the owner is asked about. */
function describeRole(d) {
  const role = String(d?.role || '').toLowerCase();
  const tag = String(d?.tag || '').toLowerCase();
  if (d?.iframe) return 'a box from another site';
  if (role === 'button' || tag === 'button' || (tag === 'input' && /^(submit|button|reset|image)$/i.test(d?.type || ''))) return 'a button';
  if (role === 'link' || tag === 'a') return 'a link';
  if (role === 'checkbox' || role === 'switch') return role === 'switch' ? 'a switch' : 'a checkbox';
  if (role === 'radio') return 'a radio button';
  if (tag === 'select' || role === 'combobox' || role === 'listbox') return 'a list of options';
  if (role === 'searchbox' || (tag === 'input' && String(d?.type || '').toLowerCase() === 'search')) return 'a search box';
  if (role === 'textbox' || tag === 'textarea' || tag === 'input' || d?.isContentEditable) return 'a text box';
  if (role === 'option' || role === 'menuitem' || role === 'tab') return `a ${role === 'menuitem' ? 'menu item' : role}`;
  return '';
}

export { NO_THUMB };
