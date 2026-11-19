// The conversation sent to the Claude API: append-only (thinking blocks are bound to the exact
// conversation prefix they were produced after, so nothing already sent is ever edited, removed
// or reordered). Pure, no chrome.* access.
//
// Every appended message is deep-copied and deep-frozen, so an accidental in-place edit throws
// instead of silently invalidating every later thinking block, and assertAppendOnly() checks the
// rule before each request against fingerprints of what earlier requests sent.

import { jsonCopy } from '../shared/util.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/** FNV-1a 32-bit hash of a string (fingerprints only, not security). */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export class HistoryError extends Error {}

export class Conversation {
  constructor({ id, messages = [] } = {}) {
    this.id = id;
    this.messages = [];
    this.fingerprints = [];
    this.sentLength = 0;
    for (const m of messages) this.append(m);
  }

  get length() {
    return this.messages.length;
  }

  /** Appends one message ({ role, content }) as a frozen deep copy. */
  append(message) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) throw new HistoryError('A message needs role "user" or "assistant".');
    const copy = deepFreeze(jsonCopy({ role: message.role, content: message.content }));
    this.messages.push(copy);
    this.fingerprints.push(hash32(JSON.stringify(copy)));
    return copy;
  }

  last() {
    return this.messages[this.messages.length - 1] || null;
  }

  /**
   * Checks that every message an earlier request sent is still here, unchanged and in place,
   * then records the current length as sent. Throws HistoryError otherwise.
   */
  assertAppendOnly() {
    if (this.messages.length < this.sentLength) throw new HistoryError('The conversation lost messages that were already sent.');
    for (let i = 0; i < this.sentLength; i++) {
      if (hash32(JSON.stringify(this.messages[i])) !== this.fingerprints[i]) throw new HistoryError(`Message ${i} changed after it was sent.`);
    }
    this.sentLength = this.messages.length;
  }

  /** The messages for a request, with optional trailing (not yet committed) messages. */
  forRequest(trailing = []) {
    return trailing.length ? [...this.messages, ...trailing] : this.messages;
  }

  toJSON() {
    return { id: this.id, messages: this.messages };
  }
}

/** True when `after` starts with every message of `before`, unchanged (deep equality). */
export function isAppendOnly(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after) || after.length < before.length) return false;
  for (let i = 0; i < before.length; i++) if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) return false;
  return true;
}

/**
 * The content to append as the assistant turn, from a response's `content` (a deep copy; every
 * block, thinking included, is kept unchanged). After a server-side refusal fallback the blocks
 * before the last `fallback` block that the API requires us to leave out are dropped: thinking,
 * redacted_thinking, tool_use and unknown block types; text, fallback and compaction blocks stay.
 */
export function echoContent(content) {
  let blocks = Array.isArray(content) ? jsonCopy(content).filter((b) => b && typeof b === 'object') : [];
  let boundary = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === 'fallback') {
      boundary = i;
      break;
    }
  }
  if (boundary > 0) {
    const kept = blocks.slice(0, boundary).filter((b) => b.type === 'text' || b.type === 'fallback' || b.type === 'compaction');
    blocks = [...kept, ...blocks.slice(boundary)];
  }
  return blocks;
}
