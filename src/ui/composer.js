// Composer: mode selector (Auto / Quick / Swarm) with a per-message team size in swarm mode, an
// auto-growing textarea, photo and PDF attachments ("Show Jarvis": picker, camera on phones, paste,
// drag and drop), the mic, and a Send button that becomes Stop while a turn runs. Enter sends on
// desktop (Shift+Enter = newline); on touch devices Enter inserts a newline and Ctrl/⌘+Enter sends.
//
// Layout: [attachment previews] / [textarea | attach, camera, mic] / [modes, team size | send].
// The attachment and voice tools sit in the text row so the bottom bar keeps room for the team
// size control even on a 320 px phone, with nothing moving when the mode changes.

import '../styles/composer-extras.css';
import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { MODES } from '../engine/index.js';
import { getSettings as platformGetSettings, onSettingsChange } from '../platform/settings.js';
import { ATTACHMENT_LIMITS, AttachmentError, attachmentMeta, describeAttachments, formatBytes, processFile, safeThumb } from './attachments.js';
import { containsApiKey } from './share.js';

const MODE_INFO = {
  auto: { icon: 'sparkle', hint: 'Jarvis decides: answer, search, or deploy agents' },
  quick: { icon: 'bolt', hint: 'Direct answer, no agents' },
  swarm: { icon: 'agents', hint: 'Deploy the full agent team' },
};
// Placeholders, longest first: the longest that fits the text row on one line is shown.
const PLACEHOLDER = {
  auto: ['Ask Jarvis anything…', 'Ask Jarvis…'],
  quick: ['Ask a quick question…', 'Quick question…'],
  swarm: ['Describe a research mission…', 'Describe the mission…', 'Your mission…'],
  one: ['Ask about it, or just send…', 'Ask about it…'],
  many: ['Ask about them, or just send…', 'Ask about them…'],
};
const BLOCKED_SHORT = { nokey: 'Add your API key to start', offline: 'You’re offline' };
const MAX_LINES = 6;

/**
 * Team sizes offered in swarm mode (SPEC §15: swarm-size-<n>), plus the owner's own default
 * (Settings → AI → agents per wave) when it isn't one of them: the control starts there.
 */
export const SWARM_SIZES = Object.freeze([3, 6, 10, 15, 20]);

/** The sizes offered for a given default: SWARM_SIZES plus the default, ascending. */
export function swarmSizesFor(defaultSize) {
  return [...new Set([...SWARM_SIZES, defaultTeamSize(defaultSize)])].sort((a, b) => a - b);
}

/** settings.maxAgents as a team size (1–20; 8 when unusable). */
export function defaultTeamSize(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(20, n) : 8;
}

/** `value` snapped to the nearest of `sizes` (halfway rounds up: swarm means the full team). */
export function snapSwarmSize(value, sizes = SWARM_SIZES) {
  const n = Number(value);
  if (!Number.isFinite(n)) return sizes.includes(10) ? 10 : sizes[sizes.length - 1];
  let best = sizes[0];
  for (const size of sizes) if (Math.abs(size - n) <= Math.abs(best - n)) best = size;
  return best;
}

function swarmSizeInfo(n, defaultSize) {
  const what =
    n <= 3
      ? 'Focused — a small team for a narrow question.'
      : n <= 6
        ? 'Balanced — several angles at a moderate cost.'
        : n <= 10
          ? 'Broad — wide coverage for big comparisons.'
          : n <= 15
            ? 'Extensive — deep coverage at a noticeably higher cost.'
            : 'Maximum — exhaustive research at the highest cost.';
  return n === defaultSize ? `Your default (Settings → AI). ${what}` : what;
}

const ATTACH_TITLE = 'Attach photos or PDFs — photos are resized and their location data removed';

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

function isEditable(el) {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** Files of a DataTransfer (paste or drop), or [] when it carries none. */
function filesOf(dt) {
  if (!dt) return [];
  const out = [];
  if (dt.items && dt.items.length) {
    for (const item of dt.items) {
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  if (!out.length && dt.files && dt.files.length) out.push(...dt.files);
  return out;
}

const carriesFiles = (dt) => !!dt && Array.from(dt.types || []).includes('Files');

/**
 * @param {object} o
 * @param {(text: string, mode: string, extras: { attachments: object[], maxAgents?: number }) => boolean} o.onSend
 *        return true when accepted (the input and attachments are then cleared); false keeps them
 * @param {() => void} o.onStop
 * @param {() => void} o.onMic
 * @param {(code: string) => void} [o.onHintAction]
 * @param {(mode: string) => void} [o.onModeChange]
 * @param {() => object} [o.getSettings]   defaults to the platform settings (maxAgents → team size)
 * @param {string} [o.mode]
 * @param {boolean} [o.micSupported]
 */
export function createComposer(o) {
  let mode = MODE_INFO[o.mode] ? o.mode : 'auto';
  let running = false;
  let listening = false;
  let blocked = null; // { code, message, actionLabel }

  const touch = isTouchKeyboard();
  const readSettings = () => {
    try {
      return (typeof o.getSettings === 'function' ? o.getSettings() : platformGetSettings()) || {};
    } catch {
      return {};
    }
  };

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

  // ---- team size (swarm mode) ---------------------------------------------------------
  let defaultMax = defaultTeamSize(readSettings().maxAgents);
  let sizes = swarmSizesFor(defaultMax);
  let swarmSize = defaultMax;
  const popId = `swarm-pop-${Math.random().toString(36).slice(2, 9)}`;
  const chipCount = h('span', { class: 'swarm-chip-count' });
  const chip = h(
    'button',
    {
      class: 'swarm-chip',
      type: 'button',
      attrs: { 'data-testid': 'swarm-size', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': popId },
      on: { click: () => (popOpen ? closePop(true) : openPop()) },
    },
    icon('agents', { size: 16, class: 'swarm-chip-icon' }),
    chipCount,
    h('span', { class: 'swarm-chip-label', text: 'agents' }),
    icon('chevron-up', { size: 14, class: 'swarm-chip-caret' }),
  );
  let sizeButtons = [];
  const popCaption = h('p', { class: 'swarm-pop-caption', attrs: { 'aria-live': 'polite' } });
  const popRow = h('div', { class: 'swarm-pop-row', on: { keydown: onPopKey, mouseleave: () => setText(popCaption, swarmSizeInfo(swarmSize, defaultMax)) } });
  const pop = h(
    'div',
    { class: 'swarm-pop', id: popId, hidden: true, attrs: { role: 'group', 'aria-label': 'Agents per wave for this message' } },
    h('div', { class: 'swarm-pop-title' }, h('span', { text: 'Agents per wave' }), h('span', { class: 'swarm-pop-sub', text: 'this message' })),
    popRow,
    popCaption,
  );

  function renderSizeButtons() {
    sizeButtons = sizes.map((n) =>
      h(
        'button',
        {
          class: ['swarm-opt', n === defaultMax && 'is-default'],
          type: 'button',
          attrs: { 'data-testid': `swarm-size-${n}`, 'aria-pressed': 'false', 'aria-label': `${n} agents${n === defaultMax ? ' (your default)' : ''}`, 'data-value': String(n) },
          on: {
            click: () => {
              setSwarmSize(n);
              closePop(true);
            },
            focus: () => setText(popCaption, swarmSizeInfo(n, defaultMax)),
            mouseenter: () => setText(popCaption, swarmSizeInfo(n, defaultMax)),
          },
        },
        String(n),
      ),
    );
    popRow.dataset.count = String(sizes.length);
    popRow.replaceChildren(...sizeButtons);
  }
  renderSizeButtons();
  const swarmWrap = h('div', { class: 'swarm-size', hidden: mode !== 'swarm' }, chip, pop);
  let popOpen = false;

  function setSwarmSize(n) {
    swarmSize = sizes.includes(n) ? n : snapSwarmSize(n, sizes);
    setText(chipCount, String(swarmSize));
    chip.dataset.value = String(swarmSize);
    chip.setAttribute('aria-label', `Agents per wave: ${swarmSize}. Change`);
    chip.title = `Up to ${swarmSize} agents per wave for this message`;
    for (const b of sizeButtons) b.setAttribute('aria-pressed', b.dataset.value === String(swarmSize) ? 'true' : 'false');
    setText(popCaption, swarmSizeInfo(swarmSize, defaultMax));
  }

  function openPop() {
    if (popOpen) return;
    popOpen = true;
    pop.hidden = false;
    chip.setAttribute('aria-expanded', 'true');
    swarmWrap.classList.add('is-open');
    setText(popCaption, swarmSizeInfo(swarmSize, defaultMax));
    const current = sizeButtons.find((b) => b.dataset.value === String(swarmSize)) || sizeButtons[0];
    try {
      current.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onPopEscape, true);
  }

  function closePop(returnFocus) {
    if (!popOpen) return;
    popOpen = false;
    pop.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
    swarmWrap.classList.remove('is-open');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onPopEscape, true);
    if (returnFocus) {
      try {
        chip.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  }

  function onOutside(e) {
    if (!swarmWrap.contains(e.target)) closePop(false);
  }

  function onPopEscape(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // Esc closes the popover only, not a sheet behind it
      closePop(true);
    }
  }

  function onPopKey(e) {
    const i = sizeButtons.indexOf(document.activeElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(sizeButtons.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = sizeButtons.length - 1;
    if (next >= 0) {
      e.preventDefault();
      sizeButtons[next].focus();
    }
  }

  setSwarmSize(swarmSize);

  // ---- input ------------------------------------------------------------------------
  const input = h('textarea', {
    class: 'composer-input',
    rows: 1,
    placeholder: PLACEHOLDER[mode][0],
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
        if (!keyGuard.hidden) keyGuard.hidden = true; // an edit answers the question
      },
      keydown: onKeyDown,
      paste: onPaste,
    },
  });

  // ---- tools: attach, camera, mic ------------------------------------------------------
  const fileInput = h('input', {
    class: 'composer-file-input',
    type: 'file',
    multiple: true,
    accept: 'image/*,application/pdf',
    tabIndex: -1,
    attrs: { 'data-testid': 'attach-input', 'aria-hidden': 'true' },
    on: { change: () => takeFromInput(fileInput, 'picker') },
  });
  const cameraInput = h('input', {
    class: 'composer-file-input',
    type: 'file',
    accept: 'image/*',
    tabIndex: -1,
    attrs: { capture: 'environment', 'data-testid': 'camera-input', 'aria-hidden': 'true' },
    on: { change: () => takeFromInput(cameraInput, 'camera') },
  });
  const attachBtn = h(
    'button',
    {
      class: 'composer-btn composer-tool composer-attach',
      type: 'button',
      attrs: { 'data-testid': 'composer-attach', 'aria-label': 'Attach photos or PDFs', title: ATTACH_TITLE },
      on: { click: () => openPicker(fileInput) },
    },
    icon('paperclip', { size: 20 }),
  );
  const cameraBtn = touch
    ? h(
        'button',
        {
          class: 'composer-btn composer-tool composer-camera',
          type: 'button',
          attrs: { 'data-testid': 'composer-camera', 'aria-label': 'Take a photo', title: 'Take a photo — location data is removed before sending' },
          on: { click: () => openPicker(cameraInput) },
        },
        icon('camera', { size: 20 }),
      )
    : null;
  const micBtn = h(
    'button',
    {
      class: 'composer-btn composer-tool composer-mic',
      type: 'button',
      hidden: !o.micSupported,
      attrs: { 'data-testid': 'composer-mic', 'aria-label': 'Speak to Jarvis', 'aria-pressed': 'false', title: 'Voice input' },
      on: { click: () => o.onMic() },
    },
    h('span', { class: 'mic-ring', attrs: { 'aria-hidden': 'true' } }),
    icon('mic', { size: 20 }),
  );
  // The mic only exists where speech recognition does (SPEC 13: "only if STT supported").
  const tools = h('div', { class: 'composer-tools' }, attachBtn, cameraBtn, o.micSupported ? micBtn : null);

  // ---- send / stop -------------------------------------------------------------------
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
  // Send and Stop share one spot, so a quick second tap on Send (a double-click, a repeated key)
  // would land on Stop and cancel the message it just sent. Stop therefore ignores activation for
  // a moment after it appears (and key auto-repeat always).
  const STOP_ARM_MS = 700;
  let stopArmedAt = 0;
  let armTimer = 0;
  let focusStopWhenArmed = false;
  const stopArmed = () => performance.now() >= stopArmedAt;
  const stopBtn = h(
    'button',
    {
      class: 'composer-btn composer-stop',
      type: 'button',
      hidden: true,
      attrs: { 'data-testid': 'composer-stop', 'aria-label': 'Stop', title: 'Stop' },
      on: {
        click: () => {
          if (stopArmed()) o.onStop();
        },
        keydown: (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && (e.repeat || !stopArmed())) e.preventDefault();
        },
        keyup: (e) => {
          if (e.key === ' ' && !stopArmed()) e.preventDefault();
        },
      },
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

  // ---- attachment notices (inline, friendly) -------------------------------------------
  const noticeIcon = h('span', { class: 'composer-notice-icon', attrs: { 'aria-hidden': 'true' } });
  const noticeText = h('span', { class: 'composer-notice-text' });
  const noticeClose = h(
    'button',
    { class: 'composer-notice-close', type: 'button', attrs: { 'aria-label': 'Dismiss' }, on: { click: () => hideNotice() } },
    icon('close', { size: 14 }),
  );
  const notice = h('div', { class: 'composer-notice', hidden: true, attrs: { role: 'alert', 'data-testid': 'attachment-error' } }, noticeIcon, noticeText, noticeClose);
  let noticeTimer = 0;

  function showNotice(message, level = 'warn') {
    clearTimeout(noticeTimer);
    noticeIcon.replaceChildren(icon(level === 'info' ? 'info' : 'alert', { size: 16 }));
    setText(noticeText, message);
    notice.dataset.level = level;
    notice.hidden = false;
    noticeTimer = setTimeout(hideNotice, 8000);
  }

  function hideNotice() {
    clearTimeout(noticeTimer);
    notice.hidden = true;
  }

  // ---- API key guard ------------------------------------------------------------------
  // A key pasted into a message by mistake would go to Claude and stay in this chat's history
  // (and keep the chat out of backups), so ask first. "Send anyway" applies to that exact text.
  let keyOkText = null;
  const keyGuardRemove = h(
    'button',
    { class: 'btn btn-sm btn-primary', type: 'button', attrs: { 'data-testid': 'key-warning-remove' }, on: { click: () => removeKeyFromText() } },
    h('span', { text: 'Remove key' }),
  );
  const keyGuardSend = h(
    'button',
    { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'key-warning-send' }, on: { click: () => sendAnyway() } },
    h('span', { text: 'Send anyway' }),
  );
  const keyGuard = h(
    'div',
    { class: 'composer-keyguard', hidden: true, attrs: { role: 'alert', 'data-testid': 'key-warning' } },
    h('span', { class: 'composer-keyguard-icon', attrs: { 'aria-hidden': 'true' } }, icon('key', { size: 16 })),
    h(
      'div',
      { class: 'composer-keyguard-body' },
      h('p', { class: 'composer-keyguard-text', text: 'That looks like an API key. Send it to Claude anyway? It would also be saved in this chat.' }),
      h('div', { class: 'composer-keyguard-actions' }, keyGuardRemove, keyGuardSend),
    ),
  );

  function askAboutKey() {
    keyGuard.hidden = false;
    try {
      keyGuardRemove.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  function removeKeyFromText() {
    input.value = input.value
      .replace(/sk-ant-[A-Za-z0-9_-]{20,}/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    keyGuard.hidden = true;
    autoGrow();
    syncButtons();
    focusInput();
    announce('Key removed from your message.');
  }

  function sendAnyway() {
    keyOkText = input.value.trim();
    keyGuard.hidden = true;
    if (!submit()) focusInput();
  }

  // ---- attachment previews -------------------------------------------------------------
  const filesRow = h('div', { class: 'composer-files', hidden: true, attrs: { role: 'list', 'aria-label': 'Attachments' } });
  const live = h('div', { class: 'composer-sr', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const dropZone = h('div', { class: 'composer-drop', attrs: { 'aria-hidden': 'true' } }, icon('paperclip', { size: 20 }), h('span', { text: 'Drop photos or PDFs to attach' }));

  /** @type {Array<{ id: string, status: 'processing'|'ready', kind: string, name: string, attachment: object|null, el: HTMLElement, removeBtn: HTMLElement }>} */
  const items = [];
  let seq = 0;

  function announce(text) {
    setText(live, '');
    requestAnimationFrame(() => setText(live, text));
  }

  function chipFor(item) {
    const removeBtn = h(
      'button',
      {
        class: 'composer-file-remove',
        type: 'button',
        attrs: { 'data-testid': 'attachment-remove', 'aria-label': `Remove ${item.name}` },
        on: { click: () => removeItem(item.id, true) },
      },
      icon('close', { size: 12, strokeWidth: 2.4 }),
    );
    const el = h('div', {
      class: ['composer-file', `composer-file--${item.kind}`, 'is-processing'],
      attrs: { role: 'listitem', 'data-testid': 'attachment-chip', 'data-kind': item.kind, 'data-status': 'processing', 'aria-busy': 'true', 'aria-label': `${item.kind === 'pdf' ? 'PDF' : 'Photo'}: ${item.name}, preparing` },
    });
    item.removeBtn = removeBtn;
    item.el = el;
    renderChip(item);
    return el;
  }

  function renderChip(item) {
    const { el } = item;
    const a = item.attachment;
    let body;
    if (item.kind === 'pdf') {
      body = h(
        'div',
        { class: 'composer-file-doc' },
        h('span', { class: 'composer-file-doc-icon' }, icon('file', { size: 18 }), h('span', { class: 'composer-file-badge', text: 'PDF' })),
        h(
          'span',
          { class: 'composer-file-doc-text' },
          h('span', { class: 'composer-file-name', text: item.name }),
          h('span', { class: 'composer-file-size', text: a ? formatBytes(a.size) : 'Reading…' }),
        ),
      );
    } else {
      const src = a ? safeThumb(a.thumb) : null;
      body = h('div', { class: 'composer-file-img' }, src ? h('img', { src, alt: '', attrs: { draggable: 'false' } }) : icon(a ? 'image' : 'spinner', { size: 20, class: a ? '' : 'composer-file-spin' }));
    }
    el.replaceChildren(body, item.removeBtn);
    el.classList.toggle('is-processing', item.status === 'processing');
    el.dataset.status = item.status;
    if (item.status === 'ready') {
      el.removeAttribute('aria-busy');
      const size = a ? formatBytes(a.size) : '';
      el.setAttribute('aria-label', `${item.kind === 'pdf' ? 'PDF' : 'Photo'}: ${item.name}${size ? `, ${size}` : ''}`);
      el.title = item.kind === 'pdf' ? `${item.name} · ${size}` : `${item.name}${a && a.width ? ` · ${a.width}×${a.height}` : ''} · ${size}`;
    }
  }

  function readyAttachments() {
    return items.filter((i) => i.status === 'ready' && i.attachment).map((i) => i.attachment);
  }

  function totalBase64() {
    return readyAttachments().reduce((sum, a) => sum + String(a.data || '').length, 0);
  }

  function addFiles(fileList, source = 'picker') {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return 0;
    const room = ATTACHMENT_LIMITS.maxFiles - items.length;
    if (room <= 0) {
      showNotice(`You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files per message. Remove one to add another.`, 'info');
      return 0;
    }
    const accepted = files.slice(0, room);
    if (files.length > room) {
      showNotice(`You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files per message, so only the first ${room === 1 ? 'one was' : `${room} were`} added.`, 'info');
    } else {
      hideNotice();
    }
    for (const file of accepted) {
      const item = { id: `f${++seq}`, status: 'processing', kind: guessKind(file), name: String(file.name || (source === 'paste' ? 'Pasted image' : 'File')), attachment: null, el: null, removeBtn: null };
      items.push(item);
      filesRow.append(chipFor(item));
      processFile(file, { source })
        .then((attachment) => {
          if (!items.includes(item)) return; // removed while it was being prepared
          if (totalBase64() + attachment.data.length > ATTACHMENT_LIMITS.messageMaxBase64) {
            throw new AttachmentError('limit', `“${attachment.name}” would make this message too large to send. Attachments in one message can add up to about ${formatBytes((ATTACHMENT_LIMITS.messageMaxBase64 * 3) / 4)}.`);
          }
          item.attachment = attachment;
          item.name = attachment.name;
          item.kind = attachment.kind;
          item.status = 'ready';
          item.removeBtn.setAttribute('aria-label', `Remove ${attachment.name}`);
          renderChip(item);
          announce(`${attachment.kind === 'pdf' ? 'PDF' : 'Photo'} attached: ${attachment.name}`);
          syncAll();
        })
        .catch((err) => {
          if (!items.includes(item)) return;
          removeItem(item.id, false);
          showNotice(err instanceof AttachmentError ? err.message : `“${item.name}” couldn’t be attached.`);
          if (!(err instanceof AttachmentError)) console.error('[jarvis] attachment failed:', err);
        });
    }
    syncAll();
    return accepted.length;
  }

  function guessKind(file) {
    const type = String(file.type || '');
    return type === 'application/pdf' || /\.pdf$/i.test(String(file.name || '')) ? 'pdf' : 'image';
  }

  function removeItem(id, fromUser) {
    const index = items.findIndex((i) => i.id === id);
    if (index < 0) return;
    const [item] = items.splice(index, 1);
    item.el.remove();
    if (fromUser) {
      announce(`Removed ${item.name}`);
      const next = items[index] || items[index - 1];
      try {
        (next ? next.removeBtn : input).focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
    syncAll();
  }

  function clearAttachments() {
    for (const item of items.splice(0)) item.el.remove();
    syncAll();
  }

  /**
   * Put a message that never reached Jarvis back in the box: its text (unless the owner has
   * typed something new meanwhile) and its prepared attachments.
   */
  function restoreMessage(text, attachments) {
    if (typeof text === 'string' && text && !input.value.trim()) input.value = text;
    for (const attachment of Array.isArray(attachments) ? attachments : []) {
      if (!attachment || typeof attachment !== 'object' || items.length >= ATTACHMENT_LIMITS.maxFiles) continue;
      if (items.some((i) => i.attachment && i.attachment.id === attachment.id)) continue;
      const item = { id: `f${++seq}`, status: 'ready', kind: attachment.kind === 'pdf' ? 'pdf' : 'image', name: String(attachment.name || 'File'), attachment, el: null, removeBtn: null };
      items.push(item);
      filesRow.append(chipFor(item));
      item.removeBtn.setAttribute('aria-label', `Remove ${item.name}`);
      renderChip(item);
    }
    autoGrow();
    syncAll();
  }

  function takeFromInput(el, source) {
    const files = Array.from(el.files || []);
    el.value = ''; // picking the same file again must fire `change`
    addFiles(files, source);
  }

  function openPicker(el) {
    try {
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.click();
    } catch {
      el.click();
    }
  }

  function onPaste(e) {
    const files = filesOf(e.clipboardData);
    if (!files.length) return; // plain text pastes as usual
    e.preventDefault();
    addFiles(files, 'paste');
  }

  // Paste with nothing focused (desktop): attach the images to the composer.
  document.addEventListener('paste', (e) => {
    if (e.defaultPrevented || isEditable(e.target) || isEditable(document.activeElement)) return;
    if (e.target && e.target.closest && e.target.closest('dialog, [role="dialog"], [aria-modal="true"]')) return;
    const files = filesOf(e.clipboardData);
    if (!files.length || !el.isConnected) return;
    e.preventDefault();
    addFiles(files, 'paste');
    focusInput();
  });

  // Drag and drop: onto the composer, or anywhere in the chat; never inside a sheet or onto a file input.
  let dragDepth = 0;
  const dropArea = () => el.closest('main') || el;
  const dropAllowed = (target) => {
    if (!target || !target.closest) return false;
    if (target.closest('dialog, [role="dialog"], [aria-modal="true"]')) return false;
    if (target.matches && target.matches('input[type="file"]')) return false;
    return dropArea().contains(target);
  };
  const setDropping = (on) => el.classList.toggle('is-dropping', !!on);
  document.addEventListener('dragenter', (e) => {
    if (!carriesFiles(e.dataTransfer)) return;
    dragDepth += 1;
    setDropping(dropAllowed(e.target));
  });
  document.addEventListener('dragover', (e) => {
    if (!carriesFiles(e.dataTransfer)) return;
    const ok = dropAllowed(e.target);
    setDropping(ok);
    if (ok) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    } else if (!(e.target && e.target.matches && e.target.matches('input[type="file"]'))) {
      e.preventDefault(); // no drop target here: never let the browser navigate to the file
      e.dataTransfer.dropEffect = 'none';
    }
  });
  document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) setDropping(false);
  });
  document.addEventListener('drop', (e) => {
    dragDepth = 0;
    setDropping(false);
    if (!carriesFiles(e.dataTransfer)) return;
    if (e.target && e.target.matches && e.target.matches('input[type="file"]')) return;
    e.preventDefault();
    if (!dropAllowed(e.target)) return;
    addFiles(filesOf(e.dataTransfer), 'drop');
    focusInput();
  });
  document.addEventListener('dragend', () => {
    dragDepth = 0;
    setDropping(false);
  });

  // ---- assembly -----------------------------------------------------------------------
  const box = h(
    'div',
    { class: 'composer-box' },
    filesRow,
    h('div', { class: 'composer-field' }, input, tools),
    h('div', { class: 'composer-bar' }, modeSwitch, swarmWrap, meta, h('div', { class: 'composer-actions' }, sendBtn, stopBtn)),
    dropZone,
    fileInput,
    cameraInput,
  );
  const el = h('div', { class: 'composer', dataset: { mode } }, h('div', { class: 'composer-inner' }, notice, keyGuard, hint, box), live);

  // ---- behaviour --------------------------------------------------------------------
  function onKeyDown(e) {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    const modifier = e.metaKey || e.ctrlKey;
    if (modifier || (!touch && !e.shiftKey && !e.altKey)) {
      e.preventDefault();
      submit();
    }
  }

  function pendingCount() {
    return items.filter((i) => i.status === 'processing').length;
  }

  /** Sends the text and the ready attachments. Returns true when the app accepted the message. */
  function submit() {
    if (running) return false;
    const text = input.value.trim();
    const attachments = readyAttachments();
    if (!text && !attachments.length) return false;
    if (blocked) {
      if (o.onHintAction) flashHint();
      return false;
    }
    if (pendingCount()) {
      showNotice('One moment — still preparing your attachment.', 'info');
      return false;
    }
    if (containsApiKey(text) && text !== keyOkText) {
      askAboutKey();
      return false;
    }
    const extras = { attachments };
    if (mode === 'swarm') extras.maxAgents = swarmSize;
    closePop(false);
    const accepted = o.onSend(text, mode, extras);
    if (accepted !== false) {
      input.value = '';
      keyOkText = null;
      keyGuard.hidden = true;
      clearAttachments();
      hideNotice();
      autoGrow();
      syncButtons();
    }
    return accepted !== false;
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
    // Up to 6 lines, but never more than about a fifth of what is visible (the on-screen
    // keyboard can leave 180 px in landscape): the conversation must stay in view.
    const vv = window.visualViewport;
    const visible = vv && vv.height > 0 ? vv.height : window.innerHeight;
    const max = Math.min(lineHeight * MAX_LINES + pad, Math.max(lineHeight * 2 + pad, Math.floor(visible * 0.22)));
    const next = Math.min(input.scrollHeight, max);
    input.style.height = `${Math.ceil(next)}px`;
    input.classList.toggle('is-scrolling', input.scrollHeight > max + 1);
  }

  function placeholderOptions() {
    if (listening) return ['Listening…'];
    if (blocked) return [blocked.placeholder || blocked.message, BLOCKED_SHORT[blocked.code]].filter(Boolean);
    if (items.length) return items.length === 1 ? PLACEHOLDER.one : PLACEHOLDER.many;
    return PLACEHOLDER[mode];
  }

  // The longest option that fits on one line (a wrapped placeholder would be cut off, and growing
  // the box for it would make the layout jump when the mode changes).
  let measureCtx = null;
  function placeholderText() {
    const options = placeholderOptions();
    if (options.length < 2 || !input.isConnected) return options[0];
    try {
      const cs = getComputedStyle(input);
      const room = input.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 2;
      if (!(room > 0)) return options[0];
      measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
      if (!measureCtx) return options[0];
      measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return options.find((text) => measureCtx.measureText(text).width <= room) || options[options.length - 1];
    } catch {
      return options[0];
    }
  }

  function syncPlaceholder() {
    const text = placeholderText();
    if (input.placeholder !== text) input.placeholder = text;
  }

  function syncButtons() {
    // Send turns into Stop while a turn runs and back afterwards. Hiding the focused button
    // would drop keyboard and VoiceOver focus to the page, so it moves to the button that
    // takes its place (Stop), or back to the message box when Stop goes away.
    const active = document.activeElement;
    const hasText = input.value.trim().length > 0;
    const ready = items.length - pendingCount();
    sendBtn.disabled = !!blocked || pendingCount() > 0 || (!hasText && ready === 0);
    sendBtn.title = blocked ? blocked.message : pendingCount() ? 'Preparing attachments…' : touch ? 'Send' : 'Send (Enter)';
    sendBtn.hidden = running;
    stopBtn.hidden = !running;
    el.dataset.running = running ? 'true' : 'false';
    if (running && active === sendBtn) {
      if (stopArmed()) focusButton(stopBtn);
      else focusStopWhenArmed = true; // a second key press must not land on Stop
    } else if (!running && active === stopBtn) focusInput();
  }

  function armStop() {
    stopArmedAt = performance.now() + STOP_ARM_MS;
    stopBtn.classList.add('is-arming');
    clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      stopBtn.classList.remove('is-arming');
      const active = document.activeElement;
      if (focusStopWhenArmed && running && (!active || active === document.body)) focusButton(stopBtn);
      focusStopWhenArmed = false;
    }, STOP_ARM_MS);
  }

  function disarmStop() {
    clearTimeout(armTimer);
    stopBtn.classList.remove('is-arming');
    focusStopWhenArmed = false;
  }

  function focusButton(btn) {
    try {
      btn.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  function syncAll() {
    filesRow.hidden = items.length === 0;
    el.dataset.attachments = String(items.length);
    attachBtn.disabled = false;
    attachBtn.setAttribute('aria-label', items.length ? `Attach photos or PDFs (${items.length} of ${ATTACHMENT_LIMITS.maxFiles} attached)` : 'Attach photos or PDFs');
    syncPlaceholder();
    syncButtons();
  }

  function setMode(id, fromUser) {
    if (!MODE_INFO[id]) return;
    mode = id;
    el.dataset.mode = id;
    for (const key of Object.keys(modeButtons)) modeButtons[key].setAttribute('aria-pressed', key === id ? 'true' : 'false');
    swarmWrap.hidden = id !== 'swarm';
    if (id !== 'swarm') closePop(false);
    syncPlaceholder();
    if (fromUser && o.onModeChange) o.onModeChange(id);
  }

  function focusInput() {
    try {
      input.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  // The default team size follows Settings → AI → agents per wave.
  try {
    onSettingsChange((s) => {
      const next = defaultTeamSize(s && s.maxAgents);
      if (next !== defaultMax) {
        defaultMax = next;
        sizes = swarmSizesFor(next);
        renderSizeButtons();
        setSwarmSize(next);
      }
    });
  } catch {
    /* settings unavailable: keep the initial size */
  }

  // The keyboard opening or closing (or a rotation) changes how tall the message box may grow.
  if (window.visualViewport) {
    let lastVisible = 0;
    window.visualViewport.addEventListener('resize', () => {
      const visible = Math.round(window.visualViewport.height);
      if (visible === lastVisible) return;
      lastVisible = visible;
      autoGrow();
    });
  }

  // Re-fit the placeholder when the text row changes width (rotation, sidebar, attachments).
  if (typeof ResizeObserver === 'function') {
    let lastWidth = 0;
    new ResizeObserver(() => {
      const w = input.clientWidth;
      if (w && w !== lastWidth) {
        lastWidth = w;
        syncPlaceholder();
      }
    }).observe(input);
  }

  syncAll();

  return {
    el,
    input,
    setMode: (id) => setMode(id, false),
    getMode: () => mode,
    setRunning(value) {
      const next = !!value;
      if (next && !running) armStop();
      else if (!next) disarmStop();
      running = next;
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
      syncPlaceholder();
      syncButtons();
    },
    setListening(value) {
      listening = !!value;
      micBtn.classList.toggle('is-listening', listening);
      micBtn.setAttribute('aria-pressed', listening ? 'true' : 'false');
      micBtn.setAttribute('aria-label', listening ? 'Stop listening' : 'Speak to Jarvis');
      syncPlaceholder();
      el.classList.toggle('is-listening', listening);
    },
    setMicSupported(supported) {
      micBtn.hidden = !supported;
      if (supported && !micBtn.isConnected) tools.append(micBtn);
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
    focus: focusInput,
    blur() {
      input.blur();
    },
    refreshSize: autoGrow,

    // ---- attachments & team size (SPEC §15.1) ----
    /** Sends what is in the composer (text, attachments, team size), like the Send button. */
    submit,
    /** Adds files (File objects) as attachments; returns how many were accepted for processing. */
    addFiles: (files) => addFiles(files, 'picker'),
    /** The ready attachments (full objects, with base64 data). */
    getAttachments: () => readyAttachments(),
    /** Display metadata of the ready attachments (no data). */
    getAttachmentMeta: () => readyAttachments().map(attachmentMeta),
    clearAttachments,
    restoreMessage,
    /** What onSend's third argument would be right now. */
    getExtras: () => (mode === 'swarm' ? { attachments: readyAttachments(), maxAgents: swarmSize } : { attachments: readyAttachments() }),
    getSwarmSize: () => swarmSize,
    setSwarmSize: (n) => setSwarmSize(snapSwarmSize(n, sizes)),
    describeAttachments: () => describeAttachments(readyAttachments()),
  };
}
