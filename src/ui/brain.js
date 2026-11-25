// The home base's brain in the app (v7.6, SPEC §24): one controller for what Jarvis Core 1.1 does in
// the background (the key, limits, research, watchers, the morning briefing, push), and the morning
// card on the home screen. Nothing here polls on its own: GET api/brain is read when the app starts
// (for the morning card), when it comes back to the front after a while, and when Settings or the
// Home base sheet opens; the sheet polls its jobs only while it is open.
//
//   const brain = createBrain({ getSettings, onSettingsChange, client?, storage?, now? });
//   brain.getState() -> { url, phase: 'unset' | 'idle' | 'loading' | 'ready' | 'failed', brain, problem, loadedAt }
//   brain.subscribe(fn) · brain.load({ force }) -> Promise<state> · brain.base()
//   brain.call(name, ...args) -> the client's answer for the linked home base ({ ok: false, kind: 'unset' } when none)
//   brain.setBrain(view)      the brain object a call answered (PUT api/brain/settings)
//   brain.morning()           -> the briefing view the morning card shows, or null
//   brain.checkMorning()      GET api/brain (+ api/briefing when there is a new one)
//   brain.dismissMorning()    the card goes; this briefing is not offered again
//   brain.latestBriefing({ fresh }) -> Promise<{ ok, briefing } | failure>: "brief me" (a fresh one when the last is old)
//   createMorningCard(brain, { onOpen }) -> { el, destroy }
//
// All text reaches the page through dom.js helpers (textContent). Never innerHTML.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import * as realClient from '../platform/brain.js';
import { brainProblem, shouldShowMorning, isFreshBriefing, weatherLine, safeUrl } from '../lib/brain.js';

const SEEN_KEY = 'jarvis.ui.homebaseBriefingSeen';
const LOAD_MIN_MS = 15000; // a load within this of the last one reuses it (unless forced)
const MORNING_RECHECK_MS = 10 * 60 * 1000; // back at the front after this long: look for a new briefing

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] home base brain:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

function localStore() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function createBrain({ getSettings, onSettingsChange, client = realClient, storage = localStore(), now = () => Date.now() } = {}) {
  const listeners = new Set();
  let url = currentUrl();
  let state = fresh(url);
  let loading = null;
  let morning = null;
  let morningCheck = null;
  let lastMorningCheck = 0;
  let destroyed = false;

  function currentUrl() {
    const s = safe(() => getSettings(), null);
    return s && typeof s.homeBaseUrl === 'string' ? s.homeBaseUrl : '';
  }

  function fresh(u) {
    return { url: u, phase: u ? 'idle' : 'unset', brain: null, problem: null, loadedAt: 0 };
  }

  function emit() {
    for (const fn of [...listeners]) safe(() => fn(state));
  }

  function set(patch) {
    state = { ...state, ...patch };
    emit();
  }

  function seenAt() {
    const v = storage ? Number(safe(() => storage.getItem(SEEN_KEY), 0)) : 0;
    return Number.isFinite(v) ? v : 0;
  }

  function markSeen(at) {
    if (!storage || !at) return;
    safe(() => storage.setItem(SEEN_KEY, String(at)));
  }

  async function load({ force = false } = {}) {
    const base = url;
    if (!base || destroyed) return state;
    if (loading) return loading;
    if (!force && state.phase === 'ready' && now() - state.loadedAt < LOAD_MIN_MS) return state;
    set({ phase: state.brain ? state.phase : 'loading' });
    loading = (async () => {
      let r;
      try {
        r = await client.getBrain(base);
      } catch {
        r = { ok: false, kind: 'error' };
      }
      loading = null;
      if (base !== url || destroyed) return state;
      if (r && r.ok) set({ phase: 'ready', brain: r.brain, problem: null, loadedAt: now() });
      else set({ phase: 'failed', problem: brainProblem(r), loadedAt: now() });
      return state;
    })();
    return loading;
  }

  async function call(name, ...args) {
    const base = url;
    if (!base) return { ok: false, kind: 'unset' };
    const fn = client[name];
    if (typeof fn !== 'function') return { ok: false, kind: 'error' };
    try {
      return await fn(base, ...args);
    } catch {
      return { ok: false, kind: 'error' };
    }
  }

  async function checkMorning() {
    if (!url || destroyed) return null;
    if (morningCheck) return morningCheck;
    lastMorningCheck = now();
    morningCheck = (async () => {
      const base = url;
      const st = await load({ force: true });
      if (base !== url || st.phase !== 'ready' || !st.brain) return morning;
      const last = st.brain.briefing.lastAt;
      const seen = seenAt();
      if (!last || last <= seen || (morning && morning.generatedAt >= last)) return morning;
      const r = await call('getBriefing');
      if (base !== url || !r || !r.ok) return morning;
      if (shouldShowMorning(r.briefing, seen, now())) {
        morning = r.briefing;
        emit();
      }
      return morning;
    })().finally(() => {
      morningCheck = null;
    });
    return morningCheck;
  }

  const offSettings =
    typeof onSettingsChange === 'function'
      ? safe(() =>
          onSettingsChange(() => {
            const next = currentUrl();
            if (next === url) return;
            url = next;
            state = fresh(url);
            morning = null;
            emit();
          }),
        )
      : null;

  const onVisible = () => {
    safe(() => {
      if (document.visibilityState === 'visible' && url && now() - lastMorningCheck > MORNING_RECHECK_MS) checkMorning();
    });
  };
  safe(() => document.addEventListener('visibilitychange', onVisible));

  return {
    getState: () => state,
    base: () => url,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    load,
    call,
    /** A call answered the whole brain (PUT api/brain/settings): show it. */
    setBrain(view) {
      if (view) set({ phase: 'ready', brain: view, problem: null, loadedAt: now() });
    },
    /** Something changed on the home base (a key sent, a job started): read the brain again. */
    refresh: () => load({ force: true }),
    morning: () => morning,
    checkMorning,
    /** The briefing was opened, read out or dismissed: the card goes and this briefing isn't offered again. */
    dismissMorning(view = morning) {
      const at = view && view.generatedAt ? view.generatedAt : 0;
      if (at) markSeen(Math.max(at, seenAt()));
      if (morning && (!at || morning.generatedAt <= at)) {
        morning = null;
        emit();
      }
    },
    /**
     * "Brief me": the latest briefing when it is recent (FRESH_BRIEFING_MS), otherwise the home base
     * makes one now (free without a key; with one, the Core keeps it within its own daily cap).
     */
    async latestBriefing({ fresh: wantFresh = true } = {}) {
      if (!url) return { ok: false, kind: 'unset' };
      const r = await call('getBriefing');
      if (r && r.ok && (!wantFresh || isFreshBriefing(r.briefing, now()))) return r;
      if (r && !r.ok && !(r.kind === 'http' && r.status === 404 && r.code === 'none_yet')) return r;
      const made = await call('runBriefing');
      if (made && made.ok) return made;
      return r && r.ok ? r : made;
    },
    destroy() {
      destroyed = true;
      if (typeof offSettings === 'function') safe(offSettings);
      safe(() => document.removeEventListener('visibilitychange', onVisible));
      listeners.clear();
    },
  };
}

// ---- the morning card ---------------------------------------------------------------------------

function clockTime(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** A link the Core sent (a headline), opened in a new tab; plain text when it isn't a web address. */
function outLink(url, text, cls) {
  const href = safeUrl(url);
  if (!href) return h('span', { class: cls, text });
  return h('a', { class: cls, href, text, attrs: { target: '_blank', rel: 'noopener noreferrer' } });
}

/**
 * The morning card (the top of the home screen, after a new briefing): the greeting, the weather,
 * three headlines and the overnight report; "Read the briefing" opens the Home base sheet there,
 * × dismisses it (this briefing isn't offered again).
 */
export function createMorningCard(brain, { onOpen } = {}) {
  const kicker = h('p', { class: 'mc-kicker hud-label' });
  const title = h('h3', { class: 'mc-title', attrs: { 'data-testid': 'morning-greeting' } });
  const weather = h('p', { class: 'mc-weather', attrs: { 'data-testid': 'morning-weather' } });
  const news = h('ul', { class: 'mc-news', attrs: { 'data-testid': 'morning-headlines', 'aria-label': 'Headlines' } });
  const overnight = h('p', { class: 'mc-overnight', attrs: { 'data-testid': 'morning-overnight' } });
  const extra = h('p', { class: 'mc-extra', attrs: { 'data-testid': 'morning-extra' } });
  const close = h(
    'button',
    { class: 'icon-btn mc-close', type: 'button', attrs: { 'aria-label': 'Dismiss the morning briefing', 'data-testid': 'morning-dismiss' }, on: { click: () => brain.dismissMorning() } },
    icon('close', { size: 18 }),
  );
  const open = h(
    'button',
    {
      class: 'btn btn-sm btn-primary mc-open',
      type: 'button',
      attrs: { 'data-testid': 'morning-open' },
      on: {
        click: () => {
          const view = brain.morning();
          if (typeof onOpen === 'function') safe(() => onOpen(view));
          brain.dismissMorning(view);
        },
      },
    },
    icon('sparkle', { size: 14 }),
    h('span', { text: 'Read the briefing' }),
  );
  const el = h(
    'section',
    { class: 'morning-card hud-frame', hidden: true, attrs: { 'data-testid': 'morning-card', 'aria-label': 'Morning briefing' } },
    h('div', { class: 'mc-head' }, kicker, close),
    title,
    weather,
    news,
    overnight,
    extra,
    h('div', { class: 'mc-actions' }, open),
  );

  function render() {
    const v = brain.morning();
    el.hidden = !v;
    if (!v) return;
    setText(kicker, `Morning briefing${v.generatedAt ? ` · ${clockTime(v.generatedAt)}` : ''}`);
    setText(title, v.greeting);
    const wx = weatherLine(v.weather);
    setText(weather, wx ? `${v.weather.label ? `${v.weather.label}: ` : ''}${wx}` : '');
    weather.hidden = !wx;
    news.replaceChildren(...v.headlines.slice(0, 3).map((x) => h('li', { class: 'mc-news__item' }, outLink(x.url, x.title, 'mc-news__link'), x.source ? h('span', { class: 'mc-news__src', text: ` · ${x.source}` }) : null)));
    news.hidden = !v.headlines.length;
    const hb = v.homebase && v.homebase.summary ? `Overnight: ${v.homebase.summary}` : '';
    setText(overnight, hb);
    overnight.hidden = !hb;
    overnight.dataset.level = v.homebase ? v.homebase.level : '';
    const done = v.jobs.filter((j) => j.status === 'done').length;
    const met = v.watchers.filter((w) => w.status === 'met').length;
    const bits = [];
    if (done) bits.push(done === 1 ? 'One piece of research finished' : `${done} pieces of research finished`);
    if (met) bits.push(met === 1 ? 'one thing you’re watching happened' : `${met} things you’re watching happened`);
    const line = bits.length ? `${bits.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()) : '';
    setText(extra, line);
    extra.hidden = !line;
  }

  const off = brain.subscribe(render);
  render();
  return {
    el,
    destroy() {
      if (typeof off === 'function') off();
    },
  };
}
