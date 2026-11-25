// Home base (v7.5, SPEC §23): the Jarvis Core tile. One controller polls the Core's api/status every
// 30 s, only while a tile is on screen and the page is visible (no live stream: phones would keep a
// connection open for nothing); the tiles (the Presence home on phones, the desktop awareness rail)
// show what it last read. "Ask the home base" posts api/ask {q}: the Core's own rules answer, free
// (no Claude request).
//
//   const hb = createHomeBase({ getSettings, onSettingsChange });
//   hb.getState() -> { phase, url, view, message, checkedAt, lastOkAt }
//     phase: 'unset' | 'connecting' | 'online' | 'unreachable' | 'refused' | 'starting' | 'error'
//   hb.subscribe(fn) · hb.refresh() · hb.ask(q) -> Promise<{ ok, answer } | { ok: false, message }>
//   const tile = createHomeBaseTile(hb, { variant: 'home' | 'rail', onSetup });   tile.el
//   homeBaseGlance(state) -> { text, tone, tape } for the Systems glance row and the sensor tape
//
// All text reaches the page through dom.js helpers (textContent). Never innerHTML.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { getHomeBaseStatus, askHomeBase } from '../platform/homebase.js';
import { createPoller, homeBaseView, failureState, homeBaseName, POLL_MS, ASK_MAX_CHARS, UNSET_MESSAGE } from '../lib/homebase.js';

const PHASE_WORDS = {
  unset: 'NOT SET UP',
  connecting: 'CONNECTING',
  online: 'ONLINE',
  unreachable: 'OFFLINE',
  refused: 'REFUSED',
  starting: 'STARTING',
  error: 'ERROR',
};

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] home base:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

function pageHidden() {
  try {
    return document.visibilityState === 'hidden';
  } catch {
    return false;
  }
}

function clockTime(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * The controller. `client` (tests) replaces the network: { status(base), ask(base, q) }.
 */
export function createHomeBase({ getSettings, onSettingsChange, client = null, intervalMs = POLL_MS, now = () => Date.now() } = {}) {
  const api = client || { status: (base) => getHomeBaseStatus(base), ask: (base, q) => askHomeBase(base, q) };
  const listeners = new Set();
  const views = new Map(); // id -> { shown: bool, el }
  let url = currentUrl();
  let state = fresh(url);
  let poller = null;
  let destroyed = false;

  function currentUrl() {
    const s = safe(() => getSettings(), null);
    return s && typeof s.homeBaseUrl === 'string' ? s.homeBaseUrl : '';
  }

  function fresh(u) {
    return u ? { phase: 'connecting', url: u, view: null, message: 'Checking the home base…', checkedAt: 0, lastOkAt: 0 } : { phase: 'unset', url: '', view: null, message: UNSET_MESSAGE, checkedAt: 0, lastOkAt: 0 };
  }

  function emit() {
    for (const fn of [...listeners]) safe(() => fn(state));
  }

  function set(patch) {
    state = { ...state, ...patch };
    emit();
  }

  /** A tile is on screen: in the document, laid out (not display: none) and intersecting. */
  function anyShown() {
    for (const v of views.values()) {
      if (v.shown && v.el && v.el.isConnected && safe(() => v.el.getClientRects().length > 0, false)) return true;
    }
    return false;
  }

  function sync() {
    if (!poller) return;
    poller.setActive(!destroyed && !!url && !pageHidden() && anyShown());
  }

  async function poll() {
    const base = url;
    if (!base || destroyed) return;
    if (!anyShown() || pageHidden()) {
      sync();
      return;
    }
    const r = await api.status(base);
    if (base !== url || destroyed) return; // the address changed meanwhile
    const t = now();
    if (r && r.ok) {
      const view = homeBaseView(r.data);
      if (view) set({ phase: 'online', view, message: '', checkedAt: t, lastOkAt: t });
      else set({ phase: 'error', view: null, message: failureState({ kind: 'notcore' }).message, checkedAt: t });
      return;
    }
    if (!r || r.kind === 'aborted') return;
    // Asked to slow down: keep the last reading; the next poll comes in 30 s anyway.
    if (r.kind === 'rate' && state.view) return;
    const f = failureState(r);
    set({ phase: f.phase, view: null, message: f.message, checkedAt: t });
  }

  function restart() {
    if (poller) poller.destroy();
    poller = createPoller({ run: poll, intervalMs, now });
    sync();
  }
  restart();

  const offSettings = typeof onSettingsChange === 'function'
    ? safe(() =>
        onSettingsChange(() => {
          const next = currentUrl();
          if (next === url) return;
          url = next;
          state = fresh(url);
          emit();
          restart();
        }),
      )
    : null;
  const onVisibility = () => sync();
  try {
    document.addEventListener('visibilitychange', onVisibility);
  } catch {
    /* no document (tests) */
  }

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** A tile reports whether it is on screen (IntersectionObserver). */
    setViewShown(id, el, shown) {
      views.set(id, { el, shown: !!shown });
      sync();
    },
    forgetView(id) {
      views.delete(id);
      sync();
    },
    /** Check now ("Try again"; the first sight of a tile). */
    refresh() {
      sync();
      if (poller) poller.poke();
    },
    /**
     * Ask the home base (free: the Core's own rules answer). { ok: true, answer, suggestions } or
     * { ok: false, kind, message }. A good answer while the tile shows a failure re-checks the tile.
     */
    async ask(question) {
      const base = url;
      if (!base) return { ok: false, kind: 'unset', message: 'Link your home base first: Settings → Home base.' };
      const r = await api.ask(base, question);
      if (r && r.ok) {
        if (state.phase !== 'online' && poller) poller.poke();
        return r;
      }
      if (r && r.kind === 'empty') return { ok: false, kind: 'empty', message: 'Type a question first.' };
      const f = failureState(r);
      return { ok: false, kind: (r && r.kind) || 'error', message: f.message };
    },
    name: () => homeBaseName(url),
    destroy() {
      destroyed = true;
      if (poller) poller.destroy();
      if (typeof offSettings === 'function') safe(offSettings);
      try {
        document.removeEventListener('visibilitychange', onVisibility);
      } catch {
        /* ignore */
      }
      listeners.clear();
    },
  };
}

/**
 * The Systems glance's "Jarvis Core" row and the sensor tape's CORE reading, from the state:
 * { text, tone, tape, unknown }.
 */
export function homeBaseGlance(state) {
  const s = state || { phase: 'unset' };
  if (s.phase === 'online' && s.view) {
    const tone = s.view.level === 'ok' ? 'ok' : s.view.level === 'warn' || s.view.level === 'alert' ? 'warn' : '';
    return { text: `${s.view.word} · online`, tone, tape: s.view.word, unknown: false, title: `Jarvis Core: ${s.view.summary || s.view.word}` };
  }
  if (s.phase === 'unset') return { text: 'Not set up', tone: 'muted', tape: '—', unknown: true, title: 'Jarvis Core: not set up (Settings → Home base)' };
  if (s.phase === 'connecting') return { text: 'Checking…', tone: 'muted', tape: '…', unknown: true, title: 'Jarvis Core: checking' };
  if (s.phase === 'unreachable') return { text: 'Offline', tone: 'warn', tape: 'OFFLINE', unknown: false, title: `Jarvis Core: ${s.message}` };
  return { text: PHASE_WORDS[s.phase] ? PHASE_WORDS[s.phase].toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'Unknown', tone: 'warn', tape: PHASE_WORDS[s.phase] || '—', unknown: false, title: `Jarvis Core: ${s.message || ''}` };
}

let tileSeq = 0;

/**
 * A Home base tile. variant 'home' (the Presence home: phones and narrow windows; the ask box opens
 * with a tap) or 'rail' (the desktop awareness rail: the ask box is always there). onSetup() opens
 * Settings → Home base.
 */
export function createHomeBaseTile(hb, { variant = 'home', onSetup } = {}) {
  const id = `hb-${variant}-${++tileSeq}`;
  const compactAsk = variant !== 'rail';
  const statusText = h('span', { class: 'hb-status__text' });
  const status = h('span', { class: 'hb-status', attrs: { 'data-testid': 'homebase-status' } }, h('span', { class: 'hb-status__dot', attrs: { 'aria-hidden': 'true' } }), statusText);
  const head = h('div', { class: 'hb-head' }, h('h3', { class: 'hb-title hud-label' }, icon('server', { size: 14 }), h('span', { text: 'Home base' })), status);

  const word = h('span', { class: 'hb-word', attrs: { 'data-testid': 'homebase-level' } });
  const summary = h('span', { class: 'hb-summary', attrs: { 'data-testid': 'homebase-summary' } });
  const health = h('p', { class: 'hb-health' }, word, summary);

  const cells = {};
  const cell = (key, label) => {
    const value = h('dd', { class: 'hb-stat__value', attrs: { 'data-testid': `homebase-${key}` } });
    const el = h('div', { class: 'hb-stat', dataset: { key } }, h('dt', { class: 'hb-stat__label', text: label }), value);
    cells[key] = { el, value, label };
    return el;
  };
  const stats = h('dl', { class: 'hb-stats', attrs: { 'data-testid': 'homebase-stats' } }, cell('cpu', 'CPU'), cell('gpu', 'GPU'), cell('ram', 'RAM'), cell('disk', 'Disk free'));

  const message = h('p', { class: 'hb-message', attrs: { 'data-testid': 'homebase-message' } });
  const setupBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'homebase-setup' }, on: { click: () => typeof onSetup === 'function' && onSetup() } }, icon('settings', { size: 14 }), h('span', { text: 'Set up' }));
  const retryBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'homebase-retry' }, on: { click: () => hb.refresh() } }, icon('refresh', { size: 14 }), h('span', { text: 'Try again' }));
  const actions = h('div', { class: 'hb-actions' }, retryBtn, setupBtn);
  const foot = h('p', { class: 'hb-foot', attrs: { 'data-testid': 'homebase-foot' } });

  // Ask the home base.
  const input = h('input', {
    class: 'input hb-ask__input',
    type: 'text',
    maxLength: ASK_MAX_CHARS,
    placeholder: 'How are you?',
    attrs: { 'data-testid': 'homebase-ask-input', 'aria-label': 'Ask the home base', autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'send', spellcheck: 'false' },
  });
  const send = h('button', { class: 'btn btn-sm hb-ask__send', type: 'submit', attrs: { 'data-testid': 'homebase-ask-send' } }, h('span', { text: 'Ask' }));
  const answer = h('p', { class: 'hb-answer', hidden: true, attrs: { 'data-testid': 'homebase-answer', 'aria-live': 'polite' } });
  const note = h('p', { class: 'hb-ask__note', text: 'Free: your home base answers, not Claude.' });
  const form = h('form', { class: 'hb-ask__form', attrs: { 'data-testid': 'homebase-ask-form' }, on: { submit: (e) => onAsk(e) } }, input, send);
  const askBody = h('div', { class: 'hb-ask__body', hidden: compactAsk }, form, answer, note);
  const toggle = compactAsk
    ? h(
        'button',
        { class: 'hb-ask__toggle', type: 'button', attrs: { 'data-testid': 'homebase-ask-toggle', 'aria-expanded': 'false' }, on: { click: () => setOpen(askBody.hidden) } },
        icon('wave', { size: 14 }),
        h('span', { text: 'Ask the home base' }),
        icon('chevron-down', { size: 14, class: 'hb-ask__chev' }),
      )
    : null;
  const ask = h('div', { class: 'hb-ask', attrs: { 'data-testid': 'homebase-ask' } }, toggle, askBody);

  const el = h(
    'section',
    { class: ['hb-tile', `hb-tile--${variant}`, variant === 'rail' && 'rail-panel'], attrs: { 'data-testid': 'homebase-tile', 'data-variant': variant, 'aria-label': 'Home base' } },
    head,
    health,
    stats,
    message,
    actions,
    ask,
    foot,
  );

  let asking = false;
  function setOpen(open) {
    askBody.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    el.classList.toggle('is-asking', !!open);
    if (open) safe(() => input.focus({ preventScroll: true }));
  }

  async function onAsk(e) {
    e.preventDefault();
    if (asking) return;
    const q = input.value.trim();
    if (!q) {
      safe(() => input.focus());
      return;
    }
    asking = true;
    send.disabled = true;
    answer.hidden = false;
    answer.dataset.tone = 'busy';
    setText(answer, 'Asking the home base…');
    let r;
    try {
      r = await hb.ask(q);
    } catch {
      r = { ok: false, message: 'Something went wrong asking the home base.' };
    }
    asking = false;
    send.disabled = false;
    answer.dataset.tone = r && r.ok ? 'ok' : 'err';
    setText(answer, r && r.ok ? r.answer : (r && r.message) || 'No answer.');
    if (r && r.ok) input.value = '';
  }

  function render(s) {
    const phase = s.phase;
    el.dataset.phase = phase;
    el.dataset.level = s.view ? s.view.level : '';
    setText(statusText, PHASE_WORDS[phase] || phase.toUpperCase());
    status.dataset.tone = phase === 'online' ? 'ok' : phase === 'unset' || phase === 'connecting' ? 'muted' : 'warn';

    const online = phase === 'online' && s.view;
    health.hidden = !online;
    stats.hidden = !online;
    if (online) {
      const v = s.view;
      setText(word, v.word);
      word.dataset.level = v.level;
      setText(summary, v.summary || '');
      for (const key of Object.keys(cells)) {
        const c = cells[key];
        const val = v[key];
        setText(c.value, val === null || val === undefined || val === '' ? '—' : val);
        c.el.dataset.unknown = val ? 'false' : 'true';
        c.el.setAttribute('aria-label', `${c.label}: ${val || 'not reported'}`);
      }
      // The GPU without its driver: words, not a number.
      cells.gpu.el.dataset.words = v.gpu && !/\d/.test(v.gpu) ? 'true' : 'false';
    }
    message.hidden = online;
    setText(message, online ? '' : s.message || '');
    message.dataset.tone = phase === 'unset' || phase === 'connecting' ? 'muted' : 'warn';
    setupBtn.hidden = !(phase === 'unset' || phase === 'refused' || (phase === 'error' && /isn’t a Jarvis Core/.test(s.message || '')));
    retryBtn.hidden = !(phase === 'unreachable' || phase === 'refused' || phase === 'starting' || phase === 'error');
    actions.hidden = setupBtn.hidden && retryBtn.hidden;
    ask.hidden = phase === 'unset';

    const name = s.view && s.view.host ? s.view.host : hb.name();
    let footText = '';
    if (online) footText = `${name ? `${name} · ` : ''}checked ${clockTime(s.checkedAt)}`;
    else if (phase !== 'unset' && s.lastOkAt) footText = `${name ? `${name} · ` : ''}last reached ${clockTime(s.lastOkAt)}`;
    else if (phase !== 'unset' && name) footText = name;
    setText(foot, footText);
    foot.hidden = !footText;
  }

  const off = hb.subscribe(render);
  render(hb.getState());

  // On screen? (display: none — the other layout's tile — and detached tiles never intersect.)
  let io = null;
  try {
    io = new IntersectionObserver((entries) => {
      for (const entry of entries) hb.setViewShown(id, el, entry.isIntersecting);
    });
    io.observe(el);
  } catch {
    hb.setViewShown(id, el, true); // no IntersectionObserver: count it as shown while attached
  }

  return {
    el,
    open: () => setOpen(true),
    destroy() {
      if (io) io.disconnect();
      hb.forgetView(id);
      if (typeof off === 'function') off();
    },
  };
}
