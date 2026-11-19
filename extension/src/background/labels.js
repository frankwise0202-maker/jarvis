// Plain-English step labels for the side panel's step list ("Opened bestbuy.com", "Typed
// "monitor 4K" in Search", "Clicked "Add to cart""). Pure; `info` carries what the executor
// learned while running the call (the element's name, the page's URL).

import { shortUrl } from './sites.js';
import { singleLine, truncate } from '../shared/util.js';

const q = (s, max = 48) => `"${truncate(singleLine(s), max)}"`;

function targetName(info) {
  const name = singleLine(info?.target?.name || '');
  if (name) return q(name, 40);
  const role = info?.target?.role;
  if (role) return `a ${role}`;
  return null;
}

function where(input, info) {
  const t = input?.target;
  if (t && t.type === 'coordinate') return `(${t.x}, ${t.y})`;
  if (t && t.type === 'ref') return t.ref;
  return info?.where || 'the page';
}

/** The label for one browser member call. */
export function stepLabel(name, input = {}, info = {}) {
  const tn = targetName(info);
  switch (name) {
    case 'navigate': {
      const url = String(input.url || '').toLowerCase();
      if (url === 'back') return 'Went back';
      if (url === 'forward') return 'Went forward';
      if (url === 'reload') return 'Reloaded the page';
      return `Opened ${shortUrl(info.url || input.url)}`;
    }
    case 'screenshot':
      return 'Looked at the page';
    case 'zoom':
      return 'Zoomed in for a closer look';
    case 'left_click':
      return `Clicked ${tn || where(input, info)}`;
    case 'right_click':
      return `Right-clicked ${tn || where(input, info)}`;
    case 'middle_click':
      return `Middle-clicked ${tn || where(input, info)}`;
    case 'double_click':
      return `Double-clicked ${tn || where(input, info)}`;
    case 'triple_click':
      return `Triple-clicked ${tn || where(input, info)}`;
    case 'hover':
      return `Hovered over ${tn || where(input, info)}`;
    case 'left_click_drag':
      return `Dragged from (${input.from?.x}, ${input.from?.y}) to (${input.target?.x}, ${input.target?.y})`;
    case 'left_mouse_down':
      return `Pressed the mouse at (${input.target?.x}, ${input.target?.y})`;
    case 'left_mouse_up':
      return `Released the mouse at (${input.target?.x}, ${input.target?.y})`;
    case 'mouse_move':
      return `Moved the pointer to (${input.target?.x}, ${input.target?.y})`;
    case 'scroll':
      return `Scrolled ${input.scroll_direction || 'down'}`;
    case 'scroll_to':
      return `Scrolled to ${tn || input.target?.ref || 'an element'}`;
    case 'type': {
      const field = info.field ? ` in ${q(info.field, 32)}` : '';
      return info.secret ? `Did not type into ${info.secretWhat || 'a secret field'}` : `Typed ${q(input.text, 40)}${field}`;
    }
    case 'key':
      return `Pressed ${info.keyLabel || singleLine(input.text)}`;
    case 'hold_key':
      return `Held ${info.keyLabel || singleLine(input.text)} for ${input.duration}s`;
    case 'wait':
      return `Waited ${input.duration}s`;
    case 'read_page':
      return input.filter === 'interactive' ? 'Read the page’s buttons and fields' : 'Read the page structure';
    case 'find':
      return `Looked for ${q(input.query, 40)}`;
    case 'get_page_text':
      return 'Read the page text';
    case 'form_input': {
      if (info.secret) return `Did not fill ${info.secretWhat || 'a secret field'}`;
      const v = input.value;
      if (typeof v === 'boolean') return `${v ? 'Checked' : 'Unchecked'} ${tn || 'a box'}`;
      return `Set ${tn || 'a field'} to ${q(String(v), 32)}`;
    }
    case 'new_tab':
      return 'Opened a new tab';
    case 'list_tabs':
      return 'Checked the open tabs';
    case 'switch_tab':
      return `Switched to ${info.title ? q(info.title, 40) : input.tab_id}`;
    case 'close_tab':
      return `Closed ${info.title ? q(info.title, 40) : input.tab_id}`;
    case 'file_upload':
      return 'Tried to upload a file';
    case 'javascript_exec':
      return 'Tried to run a script';
    case 'read_console':
    case 'read_network':
      return 'Tried to read diagnostics';
    default:
      return `Used ${singleLine(name)}`;
  }
}

const PROGRESSIVE = {
  Opened: 'Opening', Went: 'Going', Reloaded: 'Reloading', Looked: 'Looking', Zoomed: 'Zooming', Clicked: 'Clicking',
  'Right-clicked': 'Right-clicking', 'Middle-clicked': 'Middle-clicking', 'Double-clicked': 'Double-clicking', 'Triple-clicked': 'Triple-clicking',
  Hovered: 'Hovering', Dragged: 'Dragging', Pressed: 'Pressing', Released: 'Releasing', Moved: 'Moving', Scrolled: 'Scrolling', Typed: 'Typing',
  Held: 'Holding', Waited: 'Waiting', Read: 'Reading', Set: 'Setting', Checked: 'Checking', Unchecked: 'Unchecking', Switched: 'Switching',
  Closed: 'Closing', Used: 'Using', Tried: 'Trying',
};

/** "Clicked "Add to cart"" -> "Clicking "Add to cart"…" (the label while the step runs). */
export function progressive(label) {
  const s = String(label || '');
  const m = /^(\S+)(.*)$/.exec(s);
  if (!m) return s;
  const word = PROGRESSIVE[m[1]];
  return word ? `${word}${m[2]}…` : `${s}…`;
}

/** The short line the owner sees under a step that failed (the full text goes to Claude). */
export function ownerDetail(errorText) {
  const t = singleLine(errorText).replace(/^Error:\s*/, '');
  // Blocked and refused steps (and denied sites) get their own notice in the step list.
  if (/^(Blocked|Refused):/.test(t) || /did not allow Jarvis to work on/.test(t)) return '';
  if (/is stale or not found|not visible on the page/.test(t)) return 'The page changed; Jarvis looks again.';
  if (/^Navigation refused/.test(t)) return 'That page is off limits to Jarvis.';
  // Keep what happened; drop the sentences that are advice for Claude.
  const kept = t
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/^(Don't|Do not|Tell|Re-read|Call|Use|Look|Navigate|Click|Ask|Try|Coordinates are|Join)\b/.test(sentence));
  return truncate(kept.join(' ') || t, 160);
}

const BASE = {
  Opened: 'open', Went: 'go', Reloaded: 'reload', Looked: 'look', Zoomed: 'zoom', Clicked: 'click', 'Right-clicked': 'right-click',
  'Middle-clicked': 'middle-click', 'Double-clicked': 'double-click', 'Triple-clicked': 'triple-click', Hovered: 'hover', Dragged: 'drag',
  Pressed: 'press', Released: 'release', Moved: 'move', Scrolled: 'scroll', Typed: 'type', Held: 'hold', Waited: 'wait', Read: 'read',
  Set: 'set', Checked: 'check', Unchecked: 'uncheck', Switched: 'switch to', Closed: 'close', Used: 'use', Tried: 'try',
};

/** The label of a step that did not happen: "Did not click "Buy now"" / "Could not open x.com". */
export function notDone(label, { blocked = false } = {}) {
  const s = String(label || '');
  const m = /^(\S+)(.*)$/.exec(s);
  if (!m || !BASE[m[1]]) return s;
  const rest = m[1] === 'Switched' ? m[2].replace(/^ to/, '') : m[2];
  return `${blocked ? 'Did not' : 'Could not'} ${BASE[m[1]]}${rest}`;
}
