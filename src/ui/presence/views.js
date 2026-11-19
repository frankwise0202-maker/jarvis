// Presence views (SPEC 2.4.3 global frame, 2.4.4 home and desktop rail, 2.4.19 Full HUD): small
// DOM components that render what src/ui/presence/model.js computes. They hold no app state; the
// controller (presence.js) feeds them. Built with dom.js helpers only (text, never HTML).
//
//   createStateWord()                 the state word (mono capitals), typed in during the boot
//   createLivePills({ onStop })       privacy pills: MIC · OPTICS · WATCH 4:12 (tap to stop)
//   createTape({ onOpen })            the desktop sensor tape (each reading opens Systems)
//   createNeedsList({ onAction })     Needs-you cards (0–3, "+n more")
//   createQuickKeys({ keys, onKey })  Look · Talk · Brief me (· Screen on a Mac)
//   createReadouts()                  Full HUD: SPEND · AGENTS · MISSION chips around the hero core
//   createLegend()                    "What the rings mean", with the live numbers
//   createChronometer({ onSuggest })  the rail's idle live slot: time, date, suggested protocol
//   createSystemsGlance({ onOpen })   the rail's Systems glance

import { h, setText, clear } from '../dom.js';
import { icon } from '../icons.js';
import { money } from './model.js';

const TICK_TYPE_MS = 25; // the boot types the state word in, 25 ms per letter

// ---- state word ---------------------------------------------------------------------------------

export function createStateWord({ testid = 'state-word', className = 'state-word' } = {}) {
  const text = h('span', { class: `${className}__text` });
  const el = h('p', { class: className, attrs: { 'data-testid': testid }, dataset: { tone: 'ok' } }, h('span', { class: `${className}__dot`, attrs: { 'aria-hidden': 'true' } }), text);
  let word = '';
  let typing = 0;
  function stopTyping() {
    if (typing) clearInterval(typing);
    typing = 0;
  }
  return {
    el,
    set({ word: next, tone }) {
      el.dataset.tone = tone || 'ok';
      if (next === word && !typing) return;
      word = next || '';
      stopTyping();
      setText(text, word);
    },
    /** Type the current word in, one letter every 25 ms (the boot sequence). */
    type() {
      stopTyping();
      const full = word;
      let n = 0;
      setText(text, '');
      typing = setInterval(() => {
        n++;
        setText(text, full.slice(0, n));
        if (n >= full.length) stopTyping();
      }, TICK_TYPE_MS);
    },
    destroy: stopTyping,
  };
}

// ---- privacy pills (SPEC 2.4.3) -----------------------------------------------------------------

const PILL_TEXT = { mic: 'MIC', optics: 'OPTICS', watch: 'WATCH' };
const PILL_LABEL = {
  mic: 'Microphone is on. Turn it off',
  optics: 'Camera is on. Turn it off',
  watch: 'Watch is on. Turn it off',
};

/**
 * set({ mic: bool, optics: bool, watchLeft: '4:12' | null }). One pill per live capture; below
 * 360px several merge into one "LIVE ×2" (a tap stops them all). onStop(kind | 'all').
 */
export function createLivePills({ onStop } = {}) {
  const el = h('div', { class: 'live-pills', attrs: { role: 'group', 'aria-label': 'Live sensors' }, hidden: true });
  let last = '';
  let narrowMq = null;
  try {
    narrowMq = window.matchMedia('(max-width: 359px)');
  } catch {
    narrowMq = null;
  }
  let current = { mic: false, optics: false, watchLeft: null };
  function pill(kind, label, aria) {
    return h(
      'button',
      {
        class: 'hud-live',
        type: 'button',
        attrs: { 'data-testid': 'live-pill', 'data-kind': kind, 'aria-label': aria },
        on: { click: () => typeof onStop === 'function' && onStop(kind) },
      },
      h('span', { class: 'hud-live__dot', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'hud-live__text', text: label }),
    );
  }
  function render() {
    const kinds = [];
    if (current.mic) kinds.push('mic');
    if (current.optics) kinds.push('optics');
    if (current.watchLeft) kinds.push('watch');
    const narrow = !!(narrowMq && narrowMq.matches);
    const key = `${kinds.join(',')}|${current.watchLeft || ''}|${narrow}`;
    if (key === last) return;
    last = key;
    clear(el);
    el.hidden = kinds.length === 0;
    if (!kinds.length) return;
    if (narrow && kinds.length > 1) {
      el.append(pill('all', `LIVE ×${kinds.length}`, `${kinds.length} sensors are on. Turn them off`));
      return;
    }
    for (const kind of kinds) {
      const text = kind === 'watch' ? `${PILL_TEXT.watch} ${current.watchLeft}` : PILL_TEXT[kind];
      const aria = kind === 'watch' ? `Watch is on, ${current.watchLeft} left. Turn it off` : PILL_LABEL[kind];
      el.append(pill(kind, text, aria));
    }
  }
  const onNarrow = () => render();
  if (narrowMq) {
    if (narrowMq.addEventListener) narrowMq.addEventListener('change', onNarrow);
    else if (narrowMq.addListener) narrowMq.addListener(onNarrow);
  }
  return {
    el,
    set(next) {
      current = { mic: !!(next && next.mic), optics: !!(next && next.optics), watchLeft: (next && next.watchLeft) || null };
      render();
    },
    isLive: () => !el.hidden,
    destroy() {
      if (narrowMq) {
        if (narrowMq.removeEventListener) narrowMq.removeEventListener('change', onNarrow);
        else if (narrowMq.removeListener) narrowMq.removeListener(onNarrow);
      }
    },
  };
}

// ---- sensor tape (SPEC 2.4.3, desktop) ---------------------------------------------------------

/**
 * set([{ id, label, value, unknown?, title? }]); each reading is a button: onOpen(id). With
 * interactive: false (the phone's 24px tape row, too short for 44px targets) readings are text.
 */
export function createTape({ onOpen, testid = 'sensor-tape', interactive = true } = {}) {
  const el = h('div', { class: 'hud-tape', attrs: { 'data-testid': testid, role: 'group', 'aria-label': 'Sensors' } });
  const items = new Map();
  let order = '';
  return {
    el,
    set(readings) {
      const list = Array.isArray(readings) ? readings : [];
      const ids = list.map((r) => r.id).join('|');
      if (ids !== order) {
        order = ids;
        clear(el);
        items.clear();
        for (const r of list) {
          const label = h('span', { class: 'hud-tape__label' });
          const value = h('span', { class: 'hud-tape__value' });
          const btn = interactive
            ? h('button', { class: 'hud-tape__item', type: 'button', dataset: { id: r.id }, on: { click: () => typeof onOpen === 'function' && onOpen(r.id) } }, label, value)
            : h('span', { class: 'hud-tape__item', dataset: { id: r.id } }, label, value);
          items.set(r.id, { btn, label, value });
          el.append(btn);
        }
      }
      for (const r of list) {
        const it = items.get(r.id);
        setText(it.label, r.label || '');
        it.label.hidden = !r.label;
        setText(it.value, r.value || '—');
        it.btn.dataset.unknown = r.unknown ? 'true' : 'false';
        if (interactive) it.btn.setAttribute('aria-label', r.title || `${r.label ? `${r.label} ` : ''}${r.value || 'unknown'}`);
      }
    },
  };
}

// ---- Needs-you (SPEC 2.4.4 item 6) ---------------------------------------------------------------

/**
 * set(items) with items from deriveNeeds(): at most `max` cards, then a "+n more" link.
 * onAction(item), onMore().
 */
export function createNeedsList({ onAction, onMore, max = 3, testid = 'needs-you', label = 'Needs you', heading = false } = {}) {
  const list = h('div', { class: 'needs-list', attrs: { role: 'list' } });
  const more = h('button', { class: 'needs-more', type: 'button', hidden: true, attrs: { 'data-testid': 'needs-more' }, on: { click: () => typeof onMore === 'function' && onMore() } });
  const head = heading ? h('h3', { class: 'rail-head hud-label' }, h('span', { text: label }), h('span', { class: 'rail-head__count' })) : null;
  const el = h('section', { class: 'needs', attrs: { 'data-testid': testid, 'aria-label': label }, hidden: true }, head, list, more);
  let sig = '';
  function card(item, i) {
    const action = h(
      'button',
      {
        class: 'needs-card__action',
        type: 'button',
        text: item.action,
        attrs: { 'data-testid': 'needs-action', 'aria-label': `${item.action}: ${item.title}` },
        on: { click: () => typeof onAction === 'function' && onAction(item) },
      },
    );
    return h(
      'div',
      { class: 'needs-card hud-frame', attrs: { role: 'listitem', 'data-testid': 'needs-card', 'data-kind': item.kind }, dataset: { tone: item.tone }, style: { '--i': i } },
      h('span', { class: 'needs-card__bar', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'needs-card__icon', attrs: { 'aria-hidden': 'true' } }, icon(item.icon || 'info', { size: 20 })),
      h('div', { class: 'needs-card__body' }, h('p', { class: 'needs-card__title', text: item.title }), item.detail ? h('p', { class: 'needs-card__detail', text: item.detail }) : null),
      action,
    );
  }
  return {
    el,
    set(items) {
      const all = Array.isArray(items) ? items : [];
      const next = all.map((i) => `${i.id}|${i.title}|${i.detail}`).join('\n');
      if (next === sig) return;
      const grew = all.length > 0 && all.some((i) => !sig.includes(`${i.id}|`));
      sig = next;
      clear(list);
      all.slice(0, max).forEach((item, i) => list.append(card(item, i)));
      const extra = all.length - max;
      more.hidden = extra <= 0;
      setText(more, extra > 0 ? `+${extra} more` : '');
      if (head) setText(head.lastChild, all.length ? String(all.length) : '');
      el.hidden = all.length === 0;
      if (grew) {
        el.classList.remove('is-arriving');
        void el.offsetWidth; // restart the slide-in
        el.classList.add('is-arriving');
      }
    },
  };
}

// ---- quick keys (SPEC 2.4.4 item 7) ---------------------------------------------------------------

/** keys: [{ id, label, icon, title }]. onKey(id, event). Each key: data-testid="quick-key-<id>". */
export function createQuickKeys({ keys, onKey } = {}) {
  const el = h('div', { class: 'quick-keys', attrs: { role: 'group', 'aria-label': 'Quick keys' } });
  for (const k of keys || []) {
    el.append(
      h(
        'button',
        {
          class: 'hud-key quick-key',
          type: 'button',
          attrs: { 'data-testid': `quick-key-${k.id}`, title: k.title || k.label },
          on: { click: (e) => typeof onKey === 'function' && onKey(k.id, e) },
        },
        icon(k.icon, { size: 20 }),
        h('span', { class: 'quick-key__label', text: k.label }),
      ),
    );
  }
  el.style.setProperty('--keys', String((keys || []).length || 1));
  return { el };
}

// ---- Full HUD readout chips around the hero core (SPEC 2.4.19) -------------------------------------

export function createReadouts() {
  const mk = (id) => {
    const value = h('span', { class: 'hud-readout__value' });
    const label = h('span', { class: 'hud-readout__label' });
    const el = h('span', { class: ['hud-readout', 'core-readout', `core-readout--${id}`], dataset: { gauge: id } }, label, value);
    return { el, label, value };
  };
  const chips = { spend: mk('spend'), agents: mk('agents'), mission: mk('mission') };
  const el = h('div', { class: 'core-readouts', attrs: { 'aria-hidden': 'true', 'data-testid': 'core-readouts' } }, chips.spend.el, chips.agents.el, chips.mission.el);
  return {
    el,
    /** labels from telemetryOf(): { spend: 'SPEND 8%', agents: 'AGENTS 0/8', mission: 'MISSION —' }. */
    set(labels, { spendOver = false } = {}) {
      for (const id of Object.keys(chips)) {
        const [name, ...rest] = String((labels && labels[id]) || '').split(' ');
        setText(chips[id].label, name || id.toUpperCase());
        setText(chips[id].value, rest.join(' ') || '—');
        chips[id].el.dataset.unknown = rest.join(' ') === '—' ? 'true' : 'false';
      }
      chips.spend.el.dataset.over = spendOver ? 'true' : 'false';
    },
  };
}

// ---- legend popover (SPEC 2.4.4 item 2: long-press the hero core) --------------------------------------

/**
 * "What the rings mean", with the live numbers. open(anchor, rows) where rows are
 * [{ term, text }]; closes on Escape, a tap outside, or the Close button.
 */
export function createLegend({ onClose } = {}) {
  const list = h('dl', { class: 'core-legend__list' });
  const close = h('button', { class: 'icon-btn core-legend__close', type: 'button', attrs: { 'aria-label': 'Close', 'data-testid': 'core-legend-close' } }, icon('close', { size: 18 }));
  const title = h('p', { class: 'core-legend__title hud-label', text: 'What the rings mean' });
  const el = h('div', { class: 'core-legend hud-frame', attrs: { role: 'dialog', 'aria-label': 'What the rings mean', 'data-testid': 'core-legend' }, hidden: true }, h('div', { class: 'core-legend__head' }, title, close), list);
  let returnFocus = null;
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hide();
    }
  };
  const onDown = (e) => {
    if (!el.contains(e.target)) hide({ focus: false });
  };
  function hide({ focus = true } = {}) {
    if (el.hidden) return;
    el.hidden = true;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    if (focus && returnFocus && returnFocus.isConnected) {
      try {
        returnFocus.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
    returnFocus = null;
    if (typeof onClose === 'function') onClose();
  }
  close.addEventListener('click', () => hide());
  return {
    el,
    isOpen: () => !el.hidden,
    set(rows) {
      clear(list);
      for (const r of rows || []) list.append(h('div', { class: 'core-legend__row' }, h('dt', { text: r.term }), h('dd', { text: r.text })));
    },
    open(rows, from) {
      this.set(rows);
      returnFocus = from || document.activeElement;
      el.hidden = false;
      document.addEventListener('keydown', onKey, true);
      // The long-press that opened it must not close it on release.
      setTimeout(() => {
        if (!el.hidden) document.addEventListener('pointerdown', onDown, true);
      }, 0);
      try {
        close.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    },
    close: () => hide(),
  };
}

// ---- chronometer: the rail's idle live slot (SPEC 2.4.4 desktop) -----------------------------------------

/** set({ clock: chronometer(), suggestion: { label, part } | null }). onSuggest(suggestion). */
export function createChronometer({ onSuggest } = {}) {
  const digits = h('span', { class: 'chrono__digits' });
  const period = h('span', { class: 'chrono__period' });
  const date = h('p', { class: 'chrono__date' });
  const suggestText = h('span', { class: 'chrono__suggest-text' });
  let suggestion = null;
  const suggest = h(
    'button',
    { class: 'chrono__suggest', type: 'button', hidden: true, attrs: { 'data-testid': 'rail-suggestion' }, on: { click: () => suggestion && typeof onSuggest === 'function' && onSuggest(suggestion) } },
    h('span', { class: 'chrono__suggest-label', text: 'Suggested:' }),
    suggestText,
    icon('chevron-right', { size: 14 }),
  );
  const time = h('p', { class: 'chrono__time' }, digits, period);
  const el = h('div', { class: 'chrono', attrs: { 'data-testid': 'rail-chronometer' } }, time, date, suggest);
  return {
    el,
    set({ clock, suggestion: next }) {
      if (clock) {
        setText(digits, clock.digits);
        setText(period, clock.period || '');
        period.hidden = !clock.period;
        setText(date, clock.date);
        time.setAttribute('aria-label', `${clock.digits}${clock.period ? ` ${clock.period}` : ''}`);
      }
      suggestion = next || null;
      suggest.hidden = !suggestion;
      setText(suggestText, suggestion ? suggestion.label : '');
    },
  };
}

// ---- Systems glance (SPEC 2.4.4 desktop rail panel 3) -----------------------------------------------------

/**
 * set({ network, core, mic, optics, model, spend: { today, month, alert, frac, over } }).
 * Every row is a real reading; a click opens the Systems sheet: onOpen().
 */
export function createSystemsGlance({ onOpen } = {}) {
  const rows = {};
  const row = (id, label) => {
    const value = h('span', { class: 'glance__value' });
    const el = h('div', { class: 'glance__row', dataset: { id } }, h('span', { class: 'glance__label', text: label }), value);
    rows[id] = { el, value };
    return el;
  };
  const barFill = h('span', { class: 'glance__bar-fill' });
  const bar = h('span', { class: 'glance__bar', attrs: { 'aria-hidden': 'true' } }, barFill);
  const btn = h(
    'button',
    { class: 'glance', type: 'button', attrs: { 'aria-label': 'Systems: open the dashboard' }, on: { click: () => typeof onOpen === 'function' && onOpen() } },
    row('network', 'Network'),
    row('core', 'Jarvis Core'),
    row('mic', 'Mic'),
    row('optics', 'Optics'),
    row('model', 'Model'),
    row('spend', 'Spend'),
    bar,
  );
  const el = h('section', { class: 'rail-systems', attrs: { 'data-testid': 'rail-systems', 'aria-label': 'Systems' } }, h('h3', { class: 'rail-head hud-label' }, h('span', { text: 'Systems' }), icon('chevron-right', { size: 14 })), btn);
  return {
    el,
    set(s) {
      const put = (id, text, tone = '') => {
        setText(rows[id].value, text);
        rows[id].el.dataset.tone = tone;
      };
      put('network', s.network ? 'Online' : 'Offline', s.network ? 'ok' : 'warn');
      put('core', s.core || 'Not paired', s.core ? '' : 'muted');
      put('mic', s.mic, s.mic === 'live' ? 'live' : s.mic === 'off' ? 'muted' : '');
      put('optics', s.optics, s.optics === 'live' ? 'live' : s.optics === 'off' ? 'muted' : '');
      put('model', s.model || '—');
      const sp = s.spend || {};
      put('spend', sp.known ? `${money(sp.today)} today · ${money(sp.month)} month` : '—', sp.over ? 'warn' : sp.known ? '' : 'muted');
      bar.hidden = !(sp.known && sp.alert > 0);
      barFill.style.width = `${Math.round(Math.max(0, Math.min(1, sp.frac || 0)) * 100)}%`;
      bar.dataset.over = sp.over ? 'true' : 'false';
      btn.setAttribute('aria-label', `Systems: ${s.network ? 'online' : 'offline'}, mic ${s.mic}, optics ${s.optics}, ${s.model || ''}, ${sp.known ? `${money(sp.today)} today` : 'spend unknown'}. Open the dashboard`);
    },
  };
}
