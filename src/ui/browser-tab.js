// "Pull this up in Chrome" (v8.1, G1 and the app side of G3): opening a web page by voice, free.
//
//   openInBrowserTab(url, { win })  a normal Chrome tab: window.open('about:blank', '_blank') with no
//       features, then opener = null and location.replace(url), as a link window does
//       (screens/controller.js openLink): the page never gets a handle on Jarvis. -> the tab or null
//   const tabs = createBrowserTabs(deps)
//   tabs.pullUp(action, { thisTarget, links, source }) -> Promise<outcome>   (action: matchChromeCommand's)
//   tabs.closeTab() -> outcome       "close that tab": the last tab opened by voice
//   tabs.dismiss()                   the card on screen, if any
//
// The order (contract (d) of the v8.1 design): the address (chrome-commands.js planChromeOpen),
// http(s) only with no user name or password; then, when Jarvis for Chrome is linked and online and
// the owner didn't say "in my Chrome", the Jarvis window (app.chromeLink.open, which applies the
// extension's own address rules and asks there for an address that acts); otherwise a page here:
//   - an address that looks like it does something ("?add-to-cart=42", the extension's own
//     classifyAddress) opens only from a click on a card: "It looks like it adds to a cart. Open it?"
//   - with Optics, a walkthrough or the live view on screen, beside Jarvis in a window placed with a
//     strip of him in view (a tab in front would hide him, and hidden stops the camera and the tour)
//   - else a tab; a blocked pop-up shows the one-tap "Open in Chrome" button (and, while Jarvis is
//     hidden, he says to allow pop-ups once).
// From a Jarvis tab (not the installed app) a new tab covers Jarvis; when he can't listen while
// covered, he says once that "open it in a window" keeps him in view (the page is then "it").
//
// deps (all optional):
//   chromeLink()        the Chrome link (contract (f)): { state() -> { linked, online }, open(url, { rect, focus }) }
//   screens             the Screens controller: openPage(url, opts), noteRecent(target), besideRect()
//   onScreen()          Optics, a walkthrough or the live view is on screen (the page goes beside Jarvis)
//   hidden()            Jarvis's window is hidden right now
//   standalone()        Jarvis runs as the installed app (its new tabs go to a normal Chrome window)
//   listensHidden()     Voice Mode keeps listening while Jarvis is covered (on a Mac, v8.1)
//   toast(text, opts)   a line for typed commands
//   win                 the window (tests)

import { h } from './dom.js';
import { icon } from './icons.js';
import { addressAction, chromeLine, planChromeOpen } from '../lib/chrome-commands.js';
import { hostOf } from '../lib/screen-targets.js';

const PROMPT_MS = 60000;
const PREFS_KEY = 'jarvis.chromeTabs.v1';
const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function loadPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return isObj(v) ? v : {};
  } catch {
    return {};
  }
}
function savePrefs(patch) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* private mode */
  }
}

/** A normal tab for `url`, the page without a handle on Jarvis. The tab, or null (blocked). */
export function openInBrowserTab(url, { win = window } = {}) {
  const w = safe(() => win.open('about:blank', '_blank'), null);
  if (!w) return null;
  safe(() => {
    w.opener = null;
  });
  safe(() => {
    w.location.replace(url);
  });
  return w;
}

export function createBrowserTabs(deps = {}) {
  const win = deps.win || window;
  const call = (name, fallback, ...args) => (typeof deps[name] === 'function' ? safe(() => deps[name](...args), fallback) : fallback);
  let card = null; // { el, timer }
  let tabs = []; // [{ win, url }] opened by voice, newest last
  let saidFallback = false; // "I can't reach Jarvis for Chrome": said once an outage
  const prefs = loadPrefs();

  function dismiss() {
    if (!card) return;
    const c = card;
    card = null;
    clearTimeout(c.timer);
    c.el.remove();
  }

  function showCard({ testid, label, title, text, address, actions }) {
    dismiss();
    const close = h('button', { class: 'scr-prompt__close', type: 'button', attrs: { 'aria-label': 'Dismiss', 'data-testid': `${testid}-dismiss` }, on: { click: () => dismiss() } }, icon('close', { size: 18 }));
    const el = h(
      'section',
      { class: 'scr-prompt', attrs: { 'data-testid': testid, role: 'dialog', 'aria-label': title } },
      close,
      h('p', { class: 'scr-prompt__label', text: label }),
      h('h2', { class: 'scr-prompt__title', text: title }),
      address ? h('p', { class: 'scr-prompt__address', text: address, attrs: { 'data-testid': `${testid}-address` } }) : null,
      text ? h('p', { class: 'scr-prompt__text', text }) : null,
      h('div', { class: 'scr-prompt__actions' }, actions),
    );
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismiss();
      }
    });
    win.document.body.appendChild(el);
    card = { el, timer: setTimeout(() => card && card.el === el && dismiss(), PROMPT_MS) };
    return el;
  }

  const button = (testid, text, iconName, onClick, primary = true) =>
    h('button', { class: ['scr-btn', primary && 'scr-btn--primary'], type: 'button', attrs: { 'data-testid': testid }, on: { click: onClick } }, iconName ? icon(iconName, { size: 18 }) : null, h('span', { text }));

  /** A tab, kept for "close that tab"; "it" is now that page ("open it in a window"). */
  function tabFor(plan) {
    const w = openInBrowserTab(plan.url, { win });
    if (!w) return null;
    tabs = tabs.filter((t) => !safe(() => t.win.closed, true)).concat({ win: w, url: plan.url });
    if (deps.screens && typeof deps.screens.noteRecent === 'function') safe(() => deps.screens.noteRecent({ kind: 'link', ref: { url: plan.url, title: plan.title || hostOf(plan.url) }, title: plan.title || hostOf(plan.url) }));
    return w;
  }

  /** The one-tap "Open in Chrome" button: a blocked pop-up opens from the owner's click. */
  function tapCard(plan, open) {
    showCard({
      testid: 'chrome-tap',
      label: 'Chrome · one tap',
      title: 'Open in Chrome',
      address: plan.kind === 'search' ? '' : plan.url,
      text: plan.kind === 'search' ? `Google: ${plan.words}` : 'The browser needs one tap before Jarvis can open a page.',
      actions: [
        button('chrome-tap-button', 'Open in Chrome', 'external', () => {
          dismiss();
          Promise.resolve(open(true)).catch((err) => console.error('[jarvis] opening the page failed:', err));
        }),
      ],
    });
  }

  /** A page here: beside Jarvis (a placed window) or a tab. gesture: inside the owner's click. */
  async function openHere(plan, { rect, gesture = false, fellBack = false, source = 'voice' }) {
    const base = { kind: plan.kind, words: plan.words, url: plan.url, note: plan.note || '', fellBack, hidden: !!call('hidden', false) };
    if (rect && deps.screens && typeof deps.screens.openPage === 'function') {
      const o = await deps.screens.openPage(plan.url, { title: plan.title || '', rect, button: 'Open in Chrome' }, { source, gesture });
      if (o && o.status === 'opened') return { ...base, status: 'opened', via: 'window', beside: true };
      if (o && o.status === 'needs_tap') return { ...base, status: 'needs_tap', via: 'window' };
      return { ...base, status: 'error', say: (o && o.message) || 'That page couldn’t open.' };
    }
    const w = tabFor(plan);
    if (!w) {
      tapCard(plan, async () => {
        const again = tabFor(plan);
        if (!again) call('toast', null, 'Chrome blocked the page. Allow pop-ups for Jarvis, then try again.', { level: 'warn', id: 'chrome-tab' });
      });
      return { ...base, status: 'needs_tap', via: 'tab' };
    }
    // Said from a Jarvis tab, the new tab covers him: when he can't listen covered, say once how to keep him in view.
    let note = base.note;
    if (source === 'voice' && !gesture && !call('standalone', false) && !call('listensHidden', false) && !prefs.windowTipSaid) {
      prefs.windowTipSaid = true;
      savePrefs({ windowTipSaid: true });
      note = `${note ? `${note} ` : ''}Say “open it in a window” to keep me in view.`;
    }
    return { ...base, note, status: 'opened', via: 'tab' };
  }

  /**
   * The Chrome link (contract (f)) when it can take the page: linked, online, and not "in my Chrome".
   * `down`: linked but not online (the Jarvis window closed): a page here, said once.
   */
  function linkFor(where) {
    if (where === 'mine') return { link: null, down: false };
    const link = call('chromeLink', null);
    if (!link || typeof link.open !== 'function' || typeof link.state !== 'function') return { link: null, down: false };
    const st = safe(() => link.state(), null);
    if (st && st.linked && st.online) return { link, down: false };
    return { link: null, down: !!(st && st.linked) };
  }

  async function besideRect() {
    if (!call('onScreen', false)) return null;
    const s = deps.screens;
    if (!s || typeof s.besideRect !== 'function') return null;
    return Promise.resolve(safe(() => s.besideRect(), null)).catch(() => null);
  }

  /**
   * "Pull this up in Chrome", "open the second link", "google USB-C chargers", "open YouTube".
   * ctx: { thisTarget (resolveThis()), links (the newest reply's), source, gesture }.
   * -> Promise<outcome> with `line`: what Jarvis says (chromeLine).
   */
  async function pullUp(action, ctx = {}) {
    const done = (o) => ({ ...o, line: chromeLine(o) });
    const a = isObj(action) ? action : {};
    const plan = planChromeOpen(a.target, { thisTarget: ctx.thisTarget || null, links: ctx.links || [] });
    if (plan.error) return done({ status: 'nothing', say: plan.say, error: plan.error });
    const rect = await besideRect();
    let fellBack = false;
    const { link, down } = linkFor(a.where);
    if (link) {
      let res;
      try {
        res = await link.open(plan.url, { rect, focus: !rect });
      } catch {
        res = { ok: false, reason: 'offline' };
      }
      const reason = res && res.ok ? 'ok' : (res && res.reason) || 'offline';
      const refused = reason === 'blocked' || reason === 'refused' || reason === 'bad';
      if (reason === 'ok' || reason === 'needs-click' || refused) saidFallback = false; // it answered: a later outage is said again
      if (reason === 'ok') return done({ status: 'opened', via: 'jarvis', beside: !!rect, kind: plan.kind, words: plan.words, url: plan.url, note: plan.note || '' });
      if (reason === 'needs-click') return done({ status: 'needs_click', via: 'jarvis', url: plan.url });
      if (refused) return done({ status: 'error', url: plan.url, why: (res && typeof res.why === 'string' && res.why) || '' });
    }
    if (link || down) {
      // Offline, unlinked, the Jarvis window closed: a page here, and Jarvis says so once an outage.
      fellBack = !saidFallback;
      saidFallback = true;
    }
    // An address that acts (a cart, an order, an unsubscribe…) opens only from a click.
    const acts = plan.kind === 'search' ? null : addressAction(plan.url);
    if (acts) {
      showCard({
        testid: 'chrome-act',
        label: 'Chrome · check the address',
        title: `It looks like it ${acts.does}. Open it?`,
        address: plan.url,
        text: 'Jarvis opens addresses that do something only when you click.',
        actions: [
          button('chrome-act-open', 'Open', 'external', () => {
            dismiss();
            openHere(plan, { rect, gesture: true, source: 'click' })
              .then((o) => o.status !== 'opened' && o.status !== 'needs_tap' && call('toast', null, chromeLine(o), { level: 'warn', id: 'chrome-tab' }))
              .catch((err) => console.error('[jarvis] opening the page failed:', err));
          }),
          button('chrome-act-cancel', 'Not now', null, () => dismiss(), false),
        ],
      });
      return done({ status: 'needs_click', via: rect ? 'window' : 'tab', does: acts.does, url: plan.url, fellBack });
    }
    return done(await openHere(plan, { rect, gesture: !!ctx.gesture, fellBack, source: ctx.source || 'voice' }));
  }

  /** "Close that tab": the newest tab opened by voice that is still open. */
  function closeTab() {
    tabs = tabs.filter((t) => !safe(() => t.win.closed, true));
    const t = tabs.pop();
    if (!t) return { status: 'closed', count: 0, line: chromeLine({ status: 'closed', count: 0 }) };
    safe(() => t.win.close());
    return { status: 'closed', count: 1, line: chromeLine({ status: 'closed', count: 1 }) };
  }

  return { pullUp, closeTab, dismiss, openTabs: () => tabs.filter((t) => !safe(() => t.win.closed, true)).length };
}
