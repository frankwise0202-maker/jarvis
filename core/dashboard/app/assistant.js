// The status assistant panel: a typed question box (the Alienware has no microphone), suggestion
// chips and a short transcript. Questions go to the Core's local, rule-based assistant
// (POST api/ask → { answer, facts, intent, suggestions }; the answer is shown, the facts are
// machine values for later voice use); it only knows how the machine is doing. The
// transcript keeps the last few exchanges (bounded DOM) and clears itself after a quiet spell, so
// the kiosk never shows an old conversation to whoever walks by.
//
// Typing anywhere on the page starts a question (the first key lands in the box), so the owner
// can walk up and just type. Voice can plug in later through `ask(text)`.

import { $, el, setText } from './dom.js';
import { keepUnits } from './format.js';

export const MAX_MESSAGES = 12; // 6 exchanges
const QUIET_CLEAR_MS = 15 * 60 * 1000;
const ASK_TIMEOUT_MS = 8000;
const BLUR_IDLE_MS = 60 * 1000;

export function createAssistant({ endpoint = 'api/ask', isOnline, fetchImpl } = {}) {
  const list = $('transcript');
  const form = $('ask-form');
  const input = $('ask-input');
  const send = $('ask-send');
  const chips = $('ask-chips');
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  let busy = false;
  let lastActivity = Date.now();
  let hello = null;

  function showHello() {
    if (hello || list.children.length) return;
    hello = el('li', 'ask-hello', 'Ask me how the system is doing: temperatures, the graphics card, disk space, the network.');
    list.append(hello);
  }
  showHello();

  function trim() {
    if (hello && list.children.length > 1) {
      hello.remove();
      hello = null;
    }
    while (list.children.length > MAX_MESSAGES) list.firstElementChild.remove();
  }

  function addYou(text) {
    const li = el('li', 'msg msg-you', text);
    list.append(li);
    trim();
    return li;
  }

  function addCore(text, cls = '') {
    const li = el('li', `msg msg-core ${cls}`.trim());
    const body = el('div', 'msg-body');
    body.append(el('p', 'msg-text', keepUnits(text)));
    li.append(body);
    list.append(li);
    trim();
    return li;
  }

  async function ask(raw) {
    const q = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!q || busy) return;
    busy = true;
    send.disabled = true;
    lastActivity = Date.now();
    addYou(q);
    const pending = addCore('…', 'is-pending');
    if (isOnline && !isOnline()) {
      finish(pending, "I can't reach the Core right now, so I can't check. The screen will update as soon as it's back.", 'is-error');
      return;
    }
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), ASK_TIMEOUT_MS);
    try {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
        signal: ctrl ? ctrl.signal : undefined,
        cache: 'no-store',
      });
      if (res.status === 429) {
        finish(pending, 'One moment, please: too many questions at once. Try again in a few seconds.', 'is-error');
        return;
      }
      if (!res.ok) {
        finish(pending, `The Core couldn't answer that (error ${res.status}).`, 'is-error');
        return;
      }
      const data = await res.json();
      const answer = typeof data?.answer === 'string' && data.answer.trim() ? data.answer.trim() : null;
      finish(pending, answer || "I don't have an answer for that.", answer ? '' : 'is-error');
    } catch {
      finish(pending, "I can't reach the Core right now, so I can't check.", 'is-error');
    } finally {
      clearTimeout(timer);
    }
  }

  function finish(li, text, cls) {
    li.classList.remove('is-pending');
    if (cls) li.classList.add(cls);
    setText(li.querySelector('.msg-text'), keepUnits(text));
    busy = false;
    send.disabled = false;
    lastActivity = Date.now();
  }

  /**
   * Empty the question box. Chrome keeps one undo step for every typed question, each holding the
   * text node that was typed into, for as long as the page lives (up to 1000 steps): a box that is
   * only ever emptied by `value = ''` makes the page grow by a node per question. Undoing the
   * typing instead moves those steps to the redo list, which the next typed key throws away, so
   * the box keeps no history. The box is the page's only editable field, so every undo step is its
   * own; if undo is unavailable the box is simply emptied as before.
   */
  function clearBox() {
    for (let i = 0; i < 50; i++) {
      let undone = false;
      try {
        undone = document.execCommand('undo');
      } catch {
        undone = false;
      }
      if (!undone) break;
    }
    input.value = '';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    clearBox();
    ask(v);
  });

  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.ask-chip');
    if (!b) return;
    ask(b.dataset.q || b.textContent);
  });

  // Type anywhere: the first printable key focuses the box and lands in it.
  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.closest?.('input, textarea, select, [contenteditable="true"]') || t === input)) return;
    if (e.key === 'Escape') return;
    if (e.key && e.key.length === 1) {
      input.focus();
      // The keydown happens before focus moves; add the character ourselves.
      input.value += e.key;
      e.preventDefault();
      lastActivity = Date.now();
    }
  }
  window.addEventListener('keydown', onKey);

  input.addEventListener('keydown', (e) => {
    lastActivity = Date.now();
    if (e.key === 'Escape') {
      clearBox();
      input.blur();
    }
  });

  /** Once a second from main: blur an idle box (no caret blinking all night) and clear old talk. */
  function tick(now) {
    if (document.activeElement === input && !input.value && now - lastActivity > BLUR_IDLE_MS) input.blur();
    if (list.children.length && !hello && now - lastActivity > QUIET_CLEAR_MS && !busy) {
      list.textContent = '';
      showHello();
    }
  }

  return { ask, tick, messageCount: () => list.querySelectorAll('.msg').length };
}
