// Transient notifications. Each toast is announced politely, can carry one action,
// pauses its timer while hovered or focused, and can be deduplicated by id (a repeated
// notice refreshes the existing toast instead of stacking a new one).
//
//   const toasts = createToasts();  document.body.append(toasts.el);
//   toasts.show('Copied', { level: 'success' });
//   toasts.show('Update ready', { action: { label: 'Reload', fn: apply }, timeout: 0 });

import { h, setText } from './dom.js';
import { icon } from './icons.js';

const LEVEL_ICON = { info: 'info', success: 'check', warn: 'alert', error: 'alert' };
const MAX_VISIBLE = 3;

export function createToasts() {
  const el = h('div', { class: 'toasts', attrs: { role: 'status', 'aria-live': 'polite', 'aria-relevant': 'additions text' } });
  const live = new Map(); // id -> controller

  /**
   * @param {string} message
   * @param {{ level?: 'info'|'success'|'warn'|'error', action?: { label: string, fn: () => void },
   *           timeout?: number, id?: string }} [opts]  timeout 0 = stays until dismissed
   */
  function show(message, opts = {}) {
    const level = LEVEL_ICON[opts.level] ? opts.level : 'info';
    const timeout = opts.timeout === undefined ? (opts.action ? 7000 : 4200) : opts.timeout;
    if (opts.id && live.has(opts.id)) {
      const existing = live.get(opts.id);
      existing.update(message, level);
      existing.restart(timeout);
      return existing;
    }

    let timer = 0;
    let remaining = timeout;
    let startedAt = 0;
    let gone = false;

    const iconWrap = h('span', { class: 'toast-icon' }, icon(LEVEL_ICON[level], { size: 18 }));
    const text = h('div', { class: 'toast-text', text: message });
    const actionBtn = opts.action
      ? h('button', {
          class: 'toast-action',
          type: 'button',
          text: opts.action.label,
          on: {
            click: () => {
              dismiss();
              try {
                opts.action.fn();
              } catch (err) {
                console.error('[jarvis] toast action failed:', err);
              }
            },
          },
        })
      : null;
    const closeBtn = h(
      'button',
      { class: 'toast-close', type: 'button', attrs: { 'aria-label': 'Dismiss notification' }, on: { click: () => dismiss() } },
      icon('close', { size: 16 }),
    );
    const node = h('div', { class: ['toast', `toast--${level}`], attrs: { 'data-testid': 'toast', 'data-level': level } }, iconWrap, text, actionBtn, closeBtn);

    const pause = () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = 0;
      remaining -= Date.now() - startedAt;
    };
    const resume = () => {
      if (gone || timer || !(remaining > 0)) return;
      startedAt = Date.now();
      timer = setTimeout(dismiss, Math.max(1200, remaining));
    };
    node.addEventListener('pointerenter', pause);
    node.addEventListener('pointerleave', resume);
    node.addEventListener('focusin', pause);
    node.addEventListener('focusout', resume);

    function dismiss() {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      if (opts.id) live.delete(opts.id);
      node.classList.add('is-leaving');
      setTimeout(() => node.remove(), 240);
    }

    const ctrl = {
      el: node,
      dismiss,
      update(msg, lvl) {
        setText(text, msg);
        if (lvl && lvl !== node.dataset.level) {
          node.dataset.level = lvl;
          node.className = `toast toast--${lvl}`;
          iconWrap.replaceChildren(icon(LEVEL_ICON[lvl] || 'info', { size: 18 }));
        }
      },
      restart(ms) {
        clearTimeout(timer);
        timer = 0;
        remaining = ms;
        resume();
      },
    };
    if (opts.id) live.set(opts.id, ctrl);

    el.appendChild(node);
    // Keep the stack short: drop the oldest beyond the limit.
    const nodes = Array.from(el.querySelectorAll('.toast:not(.is-leaving)'));
    if (nodes.length > MAX_VISIBLE) {
      for (const old of nodes.slice(0, nodes.length - MAX_VISIBLE)) {
        old.classList.add('is-leaving');
        setTimeout(() => old.remove(), 240);
        for (const [key, c] of live) if (c.el === old) live.delete(key);
      }
    }
    resume();
    return ctrl;
  }

  function clearAll() {
    live.clear();
    el.replaceChildren();
  }

  return { el, show, clear: clearAll };
}
