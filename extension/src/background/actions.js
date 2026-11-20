// Deny by default: which steps Jarvis may take in a page without the owner's approval of that
// exact step. Pure functions (no chrome.* access); the executor asks them before every input.
//
//   read      looking (screenshot, zoom, read_page, find, get_page_text), scrolling (the scroll
//             member, and bare scrolling keys anywhere but in lists, radios, sliders and other
//             controls those keys change), moving the pointer, waiting, the tab list, a blank new
//             tab: never asks.
//   allow     plain navigation within sites the owner allowed: navigate to an address on an
//             allowed site, or one plain click on an ordinary link to another page of the same
//             site (http(s); no download, no new window, no script link, no action words).
//   ask       everything else that can change a page or the owner's accounts: every other click,
//             typing, every other key, drags and mouse presses, form_input, choosing options,
//             ticking boxes, the page's own "Are you sure?" questions, downloads, new windows,
//             closing the owner's tabs. The owner approves that exact step in the side panel, once.
//   everyday  per site, the owner may let Jarvis skip asking for a short list of everyday steps
//             (off unless turned on in Settings): typing into a search box and submitting the
//             search, pages of results ("Next", "2", "Load more"), and filter and sort controls.
//             Anything the guard recognises as consequential (payments, sending, posting,
//             deleting, account or security changes, downloads, accepting terms), and anything
//             that does not fit that list exactly, still asks.

import {
  FILE_LIKE, RISKY_FILE, SETTINGS_PATH,
  classifyAction, classifyComposerShortcut, classifyOption, classifyShortcutKey, classifySpaceKey, classifySubmitKey, classifyToggle,
  isButtonLike, isEditableFocus, isLink, isNonNavigatingLink, isToggle, normalizeLabel, secretKindOf,
} from './guard.js';
import { isClipboardChord, isModifierChord, isScrollChord } from './keys.js';
import { siteOf } from './sites.js';

const lower = (v) => String(v ?? '').toLowerCase();

// A link whose address or wording says it does something (an old-style GET action link).
const ACTION_URL = /(^|[/?&=._-])(delete|remove|destroy|unsubscribe|cancel|confirm|approve|accept|decline|reject|logout|log-?out|sign-?out|signout|buy|purchase|checkout|order|pay|payment|transfer|withdraw|send|post|publish|share|install|download|vote|like|follow|subscribe|act|action|do|exec|execute|token|nonce|csrf)([/?&=._-]|$)/i;
const ACTION_WORDS = /\b(delete|remove|archive|trash|unsubscribe|cancel|confirm|approve|accept|decline|reject|sign out|log out|logout|buy|purchase|checkout|check out|order|pay|send|post|publish|share|install|download|vote|like|follow|subscribe|transfer|withdraw|book|reserve|apply|join|leave|block|report|mute|mark as|empty)\b/;

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
// Lists, menus, tabs and grids, where arrows move a selection (an app's own navigation): there
// those keys are steps like any other (they ask), not scrolling.
const NAV_ROLES = new Set(['option', 'menuitem', 'menuitemcheckbox', 'menu', 'menubar', 'tab', 'tablist', 'grid', 'gridcell', 'treegrid', 'tree', 'treeitem', 'row', 'scrollbar', 'switch', 'checkbox']);

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

/** A list, menu, tab or grid item: arrow keys move its selection (they don't scroll). */
function arrowsMoveSelection(d) {
  return !!d && typeof d === 'object' && NAV_ROLES.has(lower(d.role)) && lower(d.tag) !== 'input';
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
  return !!d.form.isSearch && lower(d.form.method || 'get') !== 'post' && !d.form.hasCardField && !d.form.hasPasswordField;
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
 * An ordinary link whose click only opens another page (a GET), for "allow": its destination, or
 * '' when the click may do more (a download, a new window, a script link, action words).
 */
export function plainLinkDestination(d, pageUrl) {
  if (!d || typeof d !== 'object') return '';
  const tag = lower(d.tag);
  if (tag !== 'a' && tag !== 'area') return '';
  if (lower(d.role) && lower(d.role) !== 'link') return '';
  if (d.download || d.targetBlank || isNonNavigatingLink(d)) return '';
  const dest = destinationOf(d, pageUrl);
  if (!dest) return '';
  const u = new URL(dest);
  if (RISKY_FILE.test(u.pathname) || FILE_LIKE.test(u.pathname)) return '';
  if (ACTION_URL.test(u.pathname) || ACTION_URL.test(u.search)) return '';
  if (ACTION_WORDS.test(normalizeLabel(`${d.text || ''} ${d.name || ''}`))) return '';
  return dest;
}

const ask = (extra = {}) => ({ verdict: 'ask', ...extra });
const allow = (why, extra = {}) => ({ verdict: 'allow', why, ...extra });
const refuse = (text) => ({ verdict: 'refuse', text });

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
    if (everyday && !link) {
      const why = isSearchField(d) ? 'a search box' : everydayTarget(d, pageUrl);
      if (why) return allow(why, { guard: null, dest, everyday: true });
    }
  }
  return ask({ guard: null, dest });
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
export function assessKey({ chord, focus = null, everyday = false, pageUrl = '' } = {}) {
  if (!chord) return refuse('Error: no key.');
  if (isClipboardChord(chord)) return refuse("Refused: Jarvis never pastes, copies or cuts with the owner's clipboard (it may hold a password, a code or other private data). Use type with the exact text instead.");
  if (isModifierChord(chord)) return allow('a modifier key alone');
  const k = chord.key.key;
  if (isScrollChord(chord)) {
    if (focus && arrowsChangeChoice(focus)) {
      return refuse(`Error: ${k} in ${focus.name ? `"${String(focus.name).slice(0, 60)}"` : 'this control'} would change what is chosen there, not scroll. To choose an option or a radio button use form_input, or click it (the owner is asked first when it matters); arrow keys and letters are not used there.`);
    }
    if (!focus || !arrowsMoveSelection(focus)) return allow('a scrolling key');
  }
  if (focus && arrowsChangeChoice(focus) && typeof chord.key.text === 'string' && k !== 'Enter' && k !== ' ' && !(chord.mods || []).some((m) => m === 'ctrl' || m === 'meta' || m === 'alt')) {
    return refuse(`Error: typing "${k}" in ${focus.name ? `"${String(focus.name).slice(0, 60)}"` : 'this control'} would jump to another option. To choose an option use form_input (the owner is asked first when it matters).`);
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
