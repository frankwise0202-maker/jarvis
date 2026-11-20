// Deny by default: which steps Jarvis may take in a page without the owner's approval of that
// exact step. Pure functions (no chrome.* access); the executor asks them before every input.
//
//   read      looking (screenshot, zoom, read_page, find, get_page_text), scrolling (the scroll
//             member; arrow, Page Up/Down, Home and End keys pressed while nothing has the
//             focus, which Jarvis turns into scrolling without sending the key to the page),
//             moving the caret in a text field, moving the pointer, waiting, the tab list, a blank
//             new tab: never asks.
//   allow     plain navigation within sites the owner allowed: navigate to an address on an
//             allowed site whose decoded words don't say it acts, or one plain click on an
//             ordinary link to another page of the same site (http(s); no download, no new
//             window, no script link, no action words in its decoded address or its label, no
//             markup that makes it an action such as data-method or an add-to-cart class).
//   ask       everything else that can change a page or the owner's accounts: every other click,
//             typing, every other key (arrows on a focused control too), drags and mouse presses,
//             form_input, choosing options, ticking boxes, the page's own "Are you sure?"
//             questions, downloads, new windows, closing the owner's tabs, and opening an address
//             that says it acts. The owner approves that exact step in the side panel, once.
//   everyday  per site, the owner may let Jarvis skip asking for a short list of everyday steps
//             (off unless turned on in Settings): typing into a search box and submitting the
//             search, pages of results ("Next", "2", "Load more"), and filter and sort controls.
//             Anything the guard recognises as consequential (payments, sending, posting,
//             deleting, account or security changes, downloads, accepting terms), any link the
//             plain-link test turned down, a form that opens in another window or frame, and
//             anything that does not fit that list exactly, still asks.

import {
  FILE_LIKE, RISKY_FILE, SETTINGS_PATH,
  classifyAction, classifyComposerShortcut, classifyOption, classifyShortcutKey, classifySpaceKey, classifySubmitKey, classifyToggle,
  isButtonLike, isEditableFocus, isLink, isNonNavigatingLink, isToggle, normalizeLabel, secretKindOf,
} from './guard.js';
import { isClipboardChord, isModifierChord, isScrollChord } from './keys.js';
import { siteOf } from './sites.js';
import { classifyAddress } from './address.js';
import { inlineUntrusted } from './injection.js';

const lower = (v) => String(v ?? '').toLowerCase();

// A link whose wording says it does something. (Its address is read by classifyAddress: decoded,
// word by word, in the path and the query.)
const ACTION_WORDS = /\b(delete|remove|destroy|erase|clear|archive|trash|unsubscribe|cancel|confirm|approve|accept|decline|reject|sign out|log out|logout|buy|purchase|checkout|check out|order|pay|send|post|publish|share|install|download|vote|upvote|downvote|like|unlike|follow|unfollow|subscribe|transfer|withdraw|donate|bid|redeem|claim|book|reserve|apply|join|leave|block|ban|kick|report|flag|mute|unmute|mark as|empty|add|add to cart|add to bag|add to basket|save|update|restore|revoke|enable|disable|activate|deactivate|retweet|repost|rsvp|rate)\b/;
// Markup that turns a link into an action: Rails/Turbo links that send DELETE or POST and ask "Are
// you sure?", and shop themes' add-to-cart links (WooCommerce "add_to_cart_button").
const ACTION_CLASS = /(^|[\s_-])(add[_-]?to[_-]?cart|ajax[_-]add[_-]to[_-]cart|add[_-]?to[_-]?bag|buy[_-]?now|delete|remove|destroy)([\s_-]|$)/i;

/** A javascript: address that runs code (javascript:void(0) and friends do nothing: like "#"). */
function scriptHref(href) {
  const h = String(href ?? '').trim();
  if (!/^javascript:/i.test(h)) return false;
  const code = h.replace(/^javascript:/i, '').replace(/\s+/g, '');
  return !/^(void\(?0\)?;?|;|undefined;?|false;?|null;?|)$/i.test(code);
}

/** Why a link's markup makes it an action, or '' (data-method, data-confirm, an add-to-cart class, ping). */
function linkMarkupAction(d) {
  const method = lower(d?.linkMethod);
  if (method && method !== 'get') return `it sends a ${method.toUpperCase()} request`;
  if (d?.linkConfirm) return 'the page asks "Are you sure?" before it';
  if (ACTION_CLASS.test(String(d?.linkClass || ''))) return 'the page marks it as an action';
  if (d?.ping) return 'it reports the click to another address';
  return '';
}

const PAGINATION = /^(next|next page|previous|previous page|prev|page \d{1,4}|\d{1,4}|first|first page|last|last page|older|newer|older posts|newer posts|more results|show more results)$/;
const MORE = /^(show more|load more|see more|view more|more results|show more results|load more results)$/;
const PAGINATION_SYMBOLS = /^[‹›«»<>]{1,2}$/;
const FILTER_BUTTON = /^(apply|apply filters?|clear|clear all|clear filters?|reset|reset filters?|filter|filters|sort|show results|see results|update results|done)$/;
const SORT_FILTER_FIELD = /\b(sort|sort by|sorted by|order by|filter|filters|refine|show|per page|results per page|items per page|view|display|price|price range|brand|brands|category|categories|size|color|colour|rating|department|condition|distance|availability)\b/;

// Controls whose value arrow keys, Home/End, Page Up/Down and typed letters change (a select, a
// radio group, a slider, a number or date field): those keys are refused there (form_input or a
// click says exactly what is chosen, and asks).
const CHOICE_ROLES = new Set(['listbox', 'radio', 'radiogroup', 'menuitemradio', 'slider', 'spinbutton']);
const ARROW_INPUT_TYPES = new Set(['radio', 'checkbox', 'range', 'number', 'date', 'datetime-local', 'month', 'week', 'time', 'color']);

/** A control whose chosen value arrow keys and typed letters change (see CHOICE_ROLES). */
export function arrowsChangeChoice(d) {
  if (!d || typeof d !== 'object') return false;
  const tag = lower(d.tag);
  const role = lower(d.role);
  const type = lower(d.type || d.field?.type);
  if (tag === 'select') return true;
  if (tag === 'input' && ARROW_INPUT_TYPES.has(type)) return true;
  if (tag === 'textarea' || d.isContentEditable) return false;
  if (tag === 'input') return role === 'slider' || role === 'spinbutton';
  if (role === 'combobox') return true; // not a text input: a custom select
  return CHOICE_ROLES.has(role);
}

/** A field for searching the site (never a secret, never in a payment or sign-in form). */
export function isSearchField(d) {
  if (!d || typeof d !== 'object' || d.iframe) return false;
  if (secretKindOf(d) || d.readonly || d.disabled) return false;
  if (d.form && (d.form.hasCardField || d.form.hasPasswordField)) return false;
  const tag = lower(d.tag);
  const role = lower(d.role);
  const type = lower(d.type || d.field?.type);
  if (tag === 'input' && type === 'search') return true;
  if (role === 'searchbox') return true;
  const textLike = (tag === 'input' && (type === '' || type === 'text')) || (tag === 'input' && role === 'combobox');
  return textLike && !!(d.form?.isSearch || d.inSearch);
}

/** Submitting the search the field belongs to is plain navigation: a GET search form, or none. */
function searchSubmitIsPlain(d) {
  if (!d.form) return true;
  // (The default button's formmethod and formtarget count too: a search sent in another window or
  // frame, or by POST, is not plain navigation.)
  const s = formSubmission(d);
  return !!d.form.isSearch && lower(s?.method || d.form.method || 'get') !== 'post' && !targetElsewhere(s?.target) && !d.form.hasCardField && !d.form.hasPasswordField;
}

const labelOf = (d) => normalizeLabel(d?.name || d?.text || d?.value || '');
const rawLabel = (d) => String(d?.name || d?.text || d?.value || '').trim();

function onSettingsOrPaymentForm(d, pageUrl) {
  return SETTINGS_PATH.test(String(pageUrl || d?.pageUrl || '')) || !!d?.form?.hasCardField || !!d?.form?.hasPasswordField;
}

/** A results-page control: pagination, "Load more", or a filter or sort control. */
function everydayTarget(d, pageUrl) {
  if (!d || typeof d !== 'object' || d.iframe) return null;
  if (onSettingsOrPaymentForm(d, pageUrl)) return null;
  const label = labelOf(d);
  const clickable = isButtonLike(d) || isLink(d);
  if (clickable && d.inPagination && (PAGINATION.test(label) || PAGINATION_SYMBOLS.test(rawLabel(d)))) return 'a page of results';
  if (clickable && MORE.test(label)) return 'more results';
  if (d.inFilters) {
    if (isToggle(d)) return 'a filter';
    if (clickable && FILTER_BUTTON.test(label)) return 'a filter';
  }
  if (lower(d.tag) === 'select' && (d.inFilters || SORT_FILTER_FIELD.test(normalizeLabel(`${d.name || ''} ${d.field?.name || ''} ${d.field?.id || ''} ${d.field?.label || ''}`)))) return 'a sort or filter choice';
  if (isToggle(d) && SORT_FILTER_FIELD.test(normalizeLabel(d.groupLabel || ''))) return 'a sort or filter choice';
  return null;
}

/** The address a click on this element opens (a link's href, a submit button's form action), or ''. */
export function destinationOf(d, pageUrl) {
  if (!d || typeof d !== 'object') return '';
  let raw = '';
  if (isLink(d) && !isNonNavigatingLink(d)) raw = d.href;
  else if (d.isSubmit && d.form) raw = d.formAction || d.form.actionUrl || '';
  if (!raw) return '';
  try {
    const u = new URL(String(raw), pageUrl || d.pageUrl || undefined);
    return /^https?:$/.test(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

/**
 * Whether opening `url` itself (navigate, a page load) looks like more than reading a page: an
 * address whose words say it acts (classifyAddress), an installer or a file. Returns
 * { category, word, reason, file? } or null. The same address rules as a plain link's.
 */
export function addressAction(url) {
  let path = '';
  try {
    path = new URL(String(url)).pathname;
  } catch {
    return null;
  }
  if (RISKY_FILE.test(path)) return { category: 'download', word: path.split('/').pop() || 'a file', reason: 'downloading a file (an app or installer)', file: true };
  const a = classifyAddress(url);
  if (a) return { category: a.category, word: a.word, reason: a.category === 'change' ? `its address says it does something ("${a.word}")` : `its address says "${a.word}"` };
  if (FILE_LIKE.test(path)) return { category: 'change', word: path.split('/').pop() || 'a file', reason: 'opening a file (it may download)', file: true };
  return null;
}

/**
 * An ordinary link whose click only opens another page (a GET), for "allow": its destination, or
 * '' when the click may do more (a download, a new window, a script link, a file, an address or
 * wording that says it acts, markup that makes it an action).
 */
export function plainLinkDestination(d, pageUrl) {
  if (!d || typeof d !== 'object') return '';
  const tag = lower(d.tag);
  if (tag !== 'a' && tag !== 'area') return '';
  if (lower(d.role) && lower(d.role) !== 'link') return '';
  if (d.download || d.targetBlank || isNonNavigatingLink(d)) return '';
  if (linkMarkupAction(d)) return '';
  const dest = destinationOf(d, pageUrl);
  if (!dest) return '';
  if (addressAction(dest)) return '';
  if (ACTION_WORDS.test(normalizeLabel(`${d.text || ''} ${d.name || ''}`))) return '';
  return dest;
}

/**
 * A link the "everyday steps" switch may judge by its label ("Next", "Load more"): never one whose
 * address or markup failed the plain-link test (an action address, a download, a new window, code
 * in a javascript: address, an action marked up). A link that goes nowhere ("#", javascript:void(0))
 * is run by the page's script, like a button.
 */
function everydayLinkOk(d) {
  if (!isLink(d)) return true;
  if (d.download || d.targetBlank || scriptHref(d.href) || linkMarkupAction(d)) return false;
  return isNonNavigatingLink(d);
}

const ask = (extra = {}) => ({ verdict: 'ask', ...extra });
const allow = (why, extra = {}) => ({ verdict: 'allow', why, ...extra });
const refuse = (text, extra = {}) => ({ verdict: 'refuse', text, ...extra });

/** A page label inside Jarvis's own sentence: marked as page content (the executor scans `quoted`). */
const pageLabel = (name) => inlineUntrusted(String(name).slice(0, 60)).text;

/** A text field, where arrows, Home/End and Page Up/Down only move the caret. */
function isCaretField(d) {
  return !!d && isEditableFocus(d) && lower(d.tag) !== 'select' && !arrowsChangeChoice(d);
}

/**
 * A click (or a press) on element `d`: { verdict: 'allow' | 'ask', why?, guard (what the guard
 * recognises, or null), dest (the address it opens, if any) }.
 * `button`: 'left' | 'right' | 'middle'; `count`: 1-3; `modifiers`: CDP bits; `toggle`: the
 * guard's classification for a switch/checkbox/radio (the caller knows which way it goes).
 */
export function assessClick({ desc, button = 'left', count = 1, modifiers = 0, pageUrl = '', everyday = false, guard = undefined } = {}) {
  const d = desc || null;
  const g = guard === undefined ? classifyAction(d) : guard;
  const dest = destinationOf(d, pageUrl);
  if (g) return ask({ guard: g, dest });
  const plain = button === 'left' && count === 1 && !modifiers;
  if (plain) {
    const link = plainLinkDestination(d, pageUrl);
    if (link && siteOf(link) === siteOf(pageUrl)) return allow('a link to a page on this site', { guard: null, dest: link });
    // Everyday steps go by a control's label: never for a link the plain-link test turned down.
    if (everyday && !link && everydayLinkOk(d) && !submitsElsewhere(d)) {
      const why = isSearchField(d) ? 'a search box' : everydayTarget(d, pageUrl);
      if (why) return allow(why, { guard: null, dest, everyday: true });
    }
  }
  return ask({ guard: null, dest });
}

/** A submit button whose form opens in a new window or a frame (Jarvis cannot follow that load). */
function submitsElsewhere(d) {
  return !!(d?.isSubmit && d.form && targetElsewhere(d.formTarget || d.form.target));
}

/** A link or form target other than this tab's own page: a new window or a named frame. */
export function targetElsewhere(target) {
  const t = lower(target).trim();
  return !!t && t !== '_self' && t !== '_top' && t !== '_parent';
}

/**
 * What submitting the form `focus` (a field, or a submit button) belongs to would open:
 * { url, method, target } from its default (or that) button's formaction/formmethod/formtarget and
 * the form's action, method and target; null when it has no form.
 */
export function formSubmission(focus, pageUrl = '') {
  const f = focus?.form;
  if (!f || typeof f !== 'object') return null;
  const own = focus.isSubmit ? { action: focus.formAction, method: focus.formMethod, target: focus.formTarget } : { action: f.submitAction, method: f.submitMethod, target: f.submitTarget };
  const raw = own.action || f.actionUrl || f.action || pageUrl || focus.pageUrl || '';
  let url = '';
  try {
    const u = new URL(String(raw), pageUrl || focus.pageUrl || undefined);
    url = /^https?:$/.test(u.protocol) ? u.href : '';
  } catch {
    url = '';
  }
  return { url, method: lower(own.method || f.method || 'get') || 'get', target: String(own.target || f.target || '') };
}

/**
 * Where a key would send the browser: Enter on a link opens its address; Enter or Space on a
 * submit button, and Enter in a form's field (or a line break typed into a one-line field),
 * submit its form. { url, method, target, via: 'link' | 'form' } or null.
 */
export function keyDestination(chord, focus, pageUrl = '') {
  if (!chord || !focus || typeof focus !== 'object') return null;
  const k = chord.key?.key;
  if (k !== 'Enter' && k !== ' ') return null;
  if (isLink(focus) && !isNonNavigatingLink(focus)) {
    if (k !== 'Enter') return null;
    const url = destinationOf(focus, pageUrl);
    return url ? { url, method: 'get', target: focus.targetBlank ? '_blank' : '', via: 'link' } : null;
  }
  // (Enter or Space on an ordinary button runs the page's script for it, like a click: no form.)
  if (!focus.isSubmit && isButtonLike(focus)) return null;
  if (focus.isSubmit || (k === 'Enter' && focus.form && !focus.multiline && !focus.isContentEditable && lower(focus.tag) !== 'textarea')) {
    const s = formSubmission(focus, pageUrl);
    return s && s.url ? { ...s, via: 'form' } : null;
  }
  return null;
}

/** Whether a key is part of typing into a search box (letters, deleting, moving, select all, Escape). */
function searchEditingChord(chord) {
  const k = chord.key?.key || '';
  const mods = chord.mods || [];
  const cmd = mods.includes('ctrl') || mods.includes('meta');
  if (mods.includes('alt')) return false;
  if (!cmd) return (typeof chord.key?.text === 'string' && k !== 'Enter') || ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape'].includes(k);
  return /^[az]$/i.test(k) || ['Backspace', 'ArrowLeft', 'ArrowRight'].includes(k);
}

/**
 * A key chord pressed with `focus` (the page agent's description of the focused element, or
 * null for the page itself): { verdict: 'allow' | 'ask' | 'refuse', why?, guard?, text? }.
 * Clipboard chords are refused before this (the executor), and so are keys into secret fields.
 */
export function assessKey({ chord, focus = null, everyday = false } = {}) {
  if (!chord) return refuse('Error: no key.');
  if (isClipboardChord(chord)) return refuse("Refused: Jarvis never pastes, copies or cuts with the owner's clipboard (it may hold a password, a code or other private data). Use type with the exact text instead.");
  if (isModifierChord(chord)) return allow('a modifier key alone');
  const k = chord.key.key;
  const quoted = focus?.name ? [String(focus.name)] : [];
  const where = focus?.name ? pageLabel(focus.name) : 'this control';
  if (isScrollChord(chord)) {
    if (focus && arrowsChangeChoice(focus)) {
      return refuse(`Error: ${k} in ${where} would change what is chosen there, not scroll. To choose an option or a radio button use form_input, or click it (the owner is asked first when it matters); arrow keys and letters are not used there.`, { quoted });
    }
    // In a text field these keys only move the caret.
    if (focus && isCaretField(focus)) return allow('moving the caret');
    // With nothing focused Jarvis scrolls the page itself: no key reaches the page (pages bind
    // arrow keys to actions: a like on a swipe app, nudging the selected object in an editor).
    if (!focus) return allow('a scrolling key', { scroll: true });
    // On anything else (a button, a link, a list, a canvas, a game) it is a step like any other key.
  }
  if (focus && arrowsChangeChoice(focus) && typeof chord.key.text === 'string' && k !== 'Enter' && k !== ' ' && !(chord.mods || []).some((m) => m === 'ctrl' || m === 'meta' || m === 'alt')) {
    return refuse(`Error: typing "${k}" in ${where} would jump to another option. To choose an option use form_input (the owner is asked first when it matters).`, { quoted });
  }
  const modified = (chord.mods || []).includes('ctrl') || (chord.mods || []).includes('meta');
  const commandLike = (chord.mods || []).some((m) => m === 'ctrl' || m === 'meta' || m === 'alt');
  let guard = null;
  if (k === 'Enter') guard = classifySubmitKey(focus, { modified });
  else if (k === ' ') guard = classifySpaceKey(focus);
  else if (focus && isEditableFocus(focus)) {
    // In a text field, a Ctrl/Cmd/Alt chord that is not plain editing is a shortcut: a composer's
    // send (Alt+S, Cmd+Shift+Enter…) or whatever else the page binds to it.
    if (commandLike && !editingChord(chord)) guard = classifyComposerShortcut(shortcut(chord), focus) || shortcutGuard(chord, focus);
  } else {
    guard = classifyShortcutKey(shortcut(chord), focus);
    if (!guard && commandLike && !pageSafeChord(chord)) guard = shortcutGuard(chord, focus);
  }
  if (guard) return ask({ guard });
  if (everyday && focus && isSearchField(focus)) {
    if (k === 'Enter' && !(chord.mods || []).length && searchSubmitIsPlain(focus)) return allow('submitting a search', { everyday: true });
    if (searchEditingChord(chord)) return allow('typing in a search box', { everyday: true });
  }
  return ask({ guard: null });
}

/** Editing chords in a text field: select all, undo, redo, word-wise moves and deletes, formatting. */
function editingChord(chord) {
  const k = chord.key?.key || '';
  const mods = chord.mods || [];
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete'].includes(k)) return true;
  const cmd = mods.includes('ctrl') || mods.includes('meta');
  return cmd && !mods.includes('alt') && /^[azybiu]$/i.test(k);
}

/** Chords outside text fields that only select, find or move (they ask as ordinary steps). */
function pageSafeChord(chord) {
  const k = chord.key?.key || '';
  const mods = chord.mods || [];
  const cmd = mods.includes('ctrl') || mods.includes('meta');
  return cmd && !mods.includes('alt') && /^[af]$/i.test(k);
}

function shortcutGuard(chord, focus) {
  const keyName = chord.key?.key === ' ' ? 'Space' : String(chord.key?.key || '');
  const label = `${(chord.mods || []).map((m) => ({ meta: 'Cmd', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' })[m] || m).join('+')}+${keyName.length === 1 ? keyName.toUpperCase() : keyName}`;
  return { category: 'shortcut', label: focus?.name ? String(focus.name).slice(0, 80) : label, reason: `a keyboard shortcut (${label}), which can send, delete or change things on the page` };
}

function shortcut(chord) {
  return { key: chord.key.key, mods: [...(chord.mods || [])], printable: typeof chord.key.text === 'string' && chord.key.text !== '\r' && !chord.key.isModifier && !(chord.mods || []).some((m) => m === 'ctrl' || m === 'meta' || m === 'alt') };
}

/** `type` into the focused element: { verdict, why?, guard? (what a line break would submit) }. */
export function assessType({ focus, text = '', everyday = false } = {}) {
  const lines = String(text).split(/\r?\n/);
  const multiline = !!(focus?.multiline || focus?.isContentEditable);
  // A line break in a one-line field presses Enter there: what would that submit?
  const guard = lines.length > 1 && !multiline ? classifySubmitKey(focus) : null;
  if (guard) return ask({ guard, submits: true });
  if (everyday && isSearchField(focus)) {
    const breaks = lines.length - 1;
    const onlyFinal = breaks === 0 || (breaks === 1 && lines[1] === '');
    if (onlyFinal && (breaks === 0 || searchSubmitIsPlain(focus))) return allow(breaks ? 'searching' : 'typing in a search box', { everyday: true });
  }
  return ask({ guard: null, submits: lines.length > 1 && !multiline });
}

/**
 * form_input on element `d`: { verdict, why?, guard? }. `option` is the select option it would
 * choose ({ text }), `willCheck` the new state of a switch/checkbox/radio.
 */
export function assessFormInput({ desc, option = null, willCheck = undefined, everyday = false, pageUrl = '' } = {}) {
  const d = desc || null;
  let guard = null;
  if (isToggle(d)) guard = classifyToggle(d, { willCheck: willCheck === undefined ? true : willCheck });
  else if (lower(d?.tag) === 'select' && option) guard = classifyOption({ name: d.name }, option.text);
  if (guard) return ask({ guard });
  if (everyday) {
    if (isSearchField(d)) return allow('a search box', { everyday: true });
    if (isToggle(d) || lower(d?.tag) === 'select') {
      const why = everydayTarget(d, pageUrl);
      if (why) return allow(why, { everyday: true });
    }
  }
  return ask({ guard: null });
}
