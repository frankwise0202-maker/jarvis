// Composer: mode selector (Auto / Quick / Swarm), auto-growing textarea, mic, and a
// Send button that becomes Stop while a turn runs. Enter sends on desktop
// (Shift+Enter = newline); on touch devices Enter inserts a newline and Ctrl/⌘+Enter sends.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { MODES } from '../engine/index.js';

const MODE_INFO = {
  auto: { icon: 'sparkle', hint: 'Jarvis decides: answer, search, or deploy agents' },
  quick: { icon: 'bolt', hint: 'Direct answer, no agents' },
  swarm: { icon: 'agents', hint: 'Deploy the full agent team' },
};
const PLACEHOLDER = {
  auto: 'Ask Jarvis anything…',
  quick: 'Ask a quick question…',
  swarm: 'Describe a research mission…',
};
const MAX_LINES = 6;

function modeLabel(id) {
  return (MODES && MODES[id]) || id.charAt(0).toUpperCase() + id.slice(1);
}

function isTouchKeyboard() {
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * @param {object} o
 * @param {(text: string, mode: string) => boolean} o.onSend   return true when accepted (input is cleared)
 * @param {() => void} o.onStop
 * @param {() => void} o.onMic
 * @param {(code: string) => void} [o.onHintAction]
 * @param {(mode: string) => void} [o.onModeChange]
 * @param {string} [o.mode]
 * @param {boolean} [o.micSupported]
 */
export function createComposer(o) {
  let mode = MODE_INFO[o.mode] ? o.mode : 'auto';
  let running = false;
  let listening = false;
  let blocked = null; // { code, message, actionLabel }

  const touch = isTouchKeyboard();

  // ---- mode switch ------------------------------------------------------------------
  const modeButtons = {};
  const modeSwitch = h(
    'div',
    { class: 'mode-switch', attrs: { role: 'group', 'aria-label': 'Mode' } },
    Object.keys(MODE_INFO).map((id) => {
      const btn = h(
        'button',
        {
          class: 'mode-btn',
          type: 'button',
          attrs: { 'data-testid': `mode-${id}`, 'aria-pressed': id === mode ? 'true' : 'false', title: MODE_INFO[id].hint, 'data-mode': id },
          on: { click: () => setMode(id, true) },
        },
        icon(MODE_INFO[id].icon, { size: 14, class: 'mode-icon' }),
        h('span', { text: modeLabel(id) }),
      );
      modeButtons[id] = btn;
      return btn;
    }),
  );

  // ---- input ------------------------------------------------------------------------
  const input = h('textarea', {
    class: 'composer-input',
    rows: 1,
    placeholder: PLACEHOLDER[mode],
    attrs: {
      'data-testid': 'composer-input',
      'aria-label': 'Message Jarvis',
      autocomplete: 'off',
      autocapitalize: 'sentences',
      spellcheck: 'true',
      enterkeyhint: touch ? 'enter' : 'send',
    },
    on: {
      input: () => {
        autoGrow();
        syncButtons();
      },
      keydown: onKeyDown,
    },
  });

  const micBtn = h(
    'button',
    {
      class: 'composer-btn composer-mic',
      type: 'button',
      hidden: !o.micSupported,
      attrs: { 'data-testid': 'composer-mic', 'aria-label': 'Speak to Jarvis', 'aria-pressed': 'false', title: 'Voice input' },
      on: { click: () => o.onMic() },
    },
    h('span', { class: 'mic-ring', attrs: { 'aria-hidden': 'true' } }),
    icon('mic', { size: 20 }),
  );
  const sendBtn = h(
    'button',
    {
      class: 'composer-btn composer-send',
      type: 'button',
      disabled: true,
      attrs: { 'data-testid': 'composer-send', 'aria-label': 'Send', title: touch ? 'Send' : 'Send (Enter)' },
      on: { click: () => submit() },
    },
    icon('send', { size: 20, strokeWidth: 2.1 }),
  );
  const stopBtn = h(
    'button',
    {
      class: 'composer-btn composer-stop',
      type: 'button',
      hidden: true,
      attrs: { 'data-testid': 'composer-stop', 'aria-label': 'Stop', title: 'Stop' },
      on: { click: () => o.onStop() },
    },
    h('span', { class: 'stop-ring', attrs: { 'aria-hidden': 'true' } }),
    icon('stop', { size: 16 }),
  );

  const meta = h('div', { class: 'composer-meta', attrs: { 'aria-hidden': 'true' } });

  // ---- blocked hint -----------------------------------------------------------------
  const hintIcon = h('span', { class: 'composer-hint-icon' });
  const hintText = h('span', { class: 'composer-hint-text' });
  const hintAction = h('button', {
    class: 'composer-hint-action',
    type: 'button',
    hidden: true,
    on: {
      click: () => {
        if (blocked && o.onHintAction) o.onHintAction(blocked.code);
      },
    },
  });
  const hint = h('div', { class: 'composer-hint', hidden: true, attrs: { role: 'note', 'data-testid': 'composer-hint' } }, hintIcon, hintText, hintAction);

  const box = h(
    'div',
    { class: 'composer-box' },
    input,
    // The mic only exists where speech recognition does (SPEC 13: "only if STT supported").
    h('div', { class: 'composer-bar' }, modeSwitch, meta, h('div', { class: 'composer-actions' }, o.micSupported ? micBtn : null, sendBtn, stopBtn)),
  );
  const el = h('div', { class: 'composer', dataset: { mode } }, h('div', { class: 'composer-inner' }, hint, box));

  // ---- behaviour --------------------------------------------------------------------
  function onKeyDown(e) {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    const modifier = e.metaKey || e.ctrlKey;
    if (modifier || (!touch && !e.shiftKey && !e.altKey)) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    if (running) return;
    const text = input.value.trim();
    if (!text || blocked) {
      if (blocked && o.onHintAction && text) flashHint();
      return;
    }
    const accepted = o.onSend(text, mode);
    if (accepted !== false) {
      input.value = '';
      autoGrow();
      syncButtons();
    }
  }

  function flashHint() {
    hint.classList.remove('is-flash');
    void hint.offsetWidth; // restart the animation
    hint.classList.add('is-flash');
  }

  let lineHeight = 0;
  function autoGrow() {
    input.style.height = 'auto';
    if (!lineHeight) {
      const cs = getComputedStyle(input);
      lineHeight = parseFloat(cs.lineHeight) || 24;
    }
    const cs = getComputedStyle(input);
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const max = lineHeight * MAX_LINES + pad;
    const next = Math.min(input.scrollHeight, max);
    input.style.height = `${Math.ceil(next)}px`;
    input.classList.toggle('is-scrolling', input.scrollHeight > max + 1);
  }

  function syncButtons() {
    const hasText = input.value.trim().length > 0;
    sendBtn.disabled = !hasText || !!blocked;
    sendBtn.hidden = running;
    stopBtn.hidden = !running;
    el.dataset.running = running ? 'true' : 'false';
  }

  function setMode(id, fromUser) {
    if (!MODE_INFO[id]) return;
    mode = id;
    el.dataset.mode = id;
    for (const key of Object.keys(modeButtons)) modeButtons[key].setAttribute('aria-pressed', key === id ? 'true' : 'false');
    if (!listening && !blocked) input.placeholder = PLACEHOLDER[id];
    if (fromUser && o.onModeChange) o.onModeChange(id);
  }

  syncButtons();

  return {
    el,
    input,
    setMode: (id) => setMode(id, false),
    getMode: () => mode,
    setRunning(value) {
      running = !!value;
      syncButtons();
    },
    /**
     * null to unblock, or { code, message, icon?, actionLabel?, hint? }. The reason is
     * shown as the placeholder and on the Send button; `hint: true` also shows a line
     * above the input (used when no banner explains it).
     */
    setBlocked(next) {
      blocked = next || null;
      hint.hidden = !(blocked && blocked.hint);
      if (blocked) {
        hintIcon.replaceChildren(icon(blocked.icon || 'info', { size: 16 }));
        setText(hintText, blocked.message);
        hintAction.hidden = !blocked.actionLabel;
        setText(hintAction, blocked.actionLabel || '');
        hint.dataset.code = blocked.code;
      }
      el.dataset.blocked = blocked ? blocked.code : '';
      if (!listening) input.placeholder = blocked ? blocked.placeholder || blocked.message : PLACEHOLDER[mode];
      sendBtn.title = blocked ? blocked.message : touch ? 'Send' : 'Send (Enter)';
      syncButtons();
    },
    setListening(value) {
      listening = !!value;
      micBtn.classList.toggle('is-listening', listening);
      micBtn.setAttribute('aria-pressed', listening ? 'true' : 'false');
      micBtn.setAttribute('aria-label', listening ? 'Stop listening' : 'Speak to Jarvis');
      input.placeholder = listening ? 'Listening…' : blocked ? blocked.placeholder || blocked.message : PLACEHOLDER[mode];
      el.classList.toggle('is-listening', listening);
    },
    setMicSupported(supported) {
      micBtn.hidden = !supported;
      const actions = sendBtn.parentNode;
      if (supported && !micBtn.isConnected && actions) actions.insertBefore(micBtn, sendBtn);
      else if (!supported && micBtn.isConnected) micBtn.remove();
    },
    setText(text) {
      input.value = text;
      autoGrow();
      syncButtons();
    },
    getText: () => input.value,
    setMeta(text) {
      setText(meta, text || '');
    },
    focus() {
      try {
        input.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    },
    blur() {
      input.blur();
    },
    refreshSize: autoGrow,
  };
}
