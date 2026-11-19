// Comms feed for Mission Control: a terminal-style live log of what the swarm is doing, newest at
// the bottom, for every wave of the shown turn. Entries come from comms.js (observeMission() must
// have run for the turn's missions before update()).
//
//   const comms = createCommsLog({ variant: 'sheet' | 'panel' });   // collapsed on phones by default
//   parent.append(comms.el);
//   comms.update(turn);      // cheap when nothing changed; call after every render
//   comms.dispose();
//
// Behavior: smart auto-scroll (follows new lines while the owner is at the bottom; scrolling up
// pauses it and a "↓ N new" button jumps back), at most 300 lines, filter chips (All / one agent,
// wave lines always shown), collapsible with a one-line ticker of the latest line when collapsed.
// The log box has a fixed height, so lines arriving never move anything outside it.
// Accessibility: the visible log is role="log" with aria-live="off" (a swarm can write several
// lines a second); a separate polite status region announces finished and failed agents, at most
// every 8 seconds, while the log is open.

import { h, setText, raf } from '../dom.js';
import { icon } from '../icons.js';
import { getMissionLog } from './comms.js';
import { fmtClock, plural, statusLabel, statusTone } from './format.js';

const MAX_LINES = 300; // DOM lines kept across all waves of the turn
const STICK_PX = 28; // this close to the bottom counts as "at the bottom"
const ANNOUNCE_MS = 8000;
const LIVE = new Set(['planning', 'running']);

// The owner's last open/closed choice per variant, for the rest of the session (the sheet is
// rebuilt each time it opens).
const openPref = { sheet: null, panel: null };

let seq = 0;

const str = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

function missionsOf(turn) {
  const ms = turn && turn.missions && typeof turn.missions === 'object' ? Object.values(turn.missions) : [];
  return ms
    .filter((m) => m && typeof m === 'object' && m.id !== undefined && m.id !== null)
    .sort((a, b) => (Number(a.wave) || 0) - (Number(b.wave) || 0) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
}

function titleCase(who) {
  const s = str(who);
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

/**
 * @param {{ variant?: 'sheet'|'panel', open?: boolean }} [opts]
 */
export function createCommsLog(opts = {}) {
  const variant = opts.variant === 'sheet' ? 'sheet' : 'panel';
  const id = `hud-comms-${++seq}`;
  let open = typeof opts.open === 'boolean' ? opts.open : openPref[variant] ?? variant === 'panel';

  // --- structure ------------------------------------------------------------------------------
  const live = h(
    'span',
    { class: 'hud-comms__live', hidden: true },
    h('span', { class: 'hud-comms__live-dot', attrs: { 'aria-hidden': 'true' } }),
    h('span', { text: 'Live' }),
  );
  const tickTime = h('span', { class: 'hud-comms__time' });
  const tickWho = h('span', { class: 'hud-comms__who' });
  const tickMsg = h('span', { class: 'hud-comms__msg' });
  const ticker = h('span', { class: 'hud-comms__ticker', attrs: { 'aria-hidden': 'true' } }, tickTime, ' ', tickWho, ' ', tickMsg);
  const count = h('span', { class: 'hud-comms__count' });
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'hud-comms__toggle',
      dataset: { testid: 'comms-toggle' },
      attrs: { 'aria-expanded': String(open), 'aria-controls': `${id}-body` },
      on: { click: () => setOpen(!open, true) },
    },
    h('span', { class: 'hud-comms__prompt', attrs: { 'aria-hidden': 'true' }, text: '>_' }),
    h('span', { class: 'hud-comms__title', text: 'Comms' }),
    live,
    ticker,
    count,
    h('span', { class: 'hud-comms__chev', attrs: { 'aria-hidden': 'true' } }, icon('chevron-down', { size: 16 })),
  );

  const allChip = makeChip(null);
  const filters = h('div', { class: 'hud-comms__filters', attrs: { role: 'group', 'aria-label': 'Show comms from' } }, allChip.btn);
  const empty = h('p', { class: 'hud-comms__empty', text: 'Awaiting first transmission…' });
  const log = h('div', {
    class: 'hud-comms__log',
    attrs: { role: 'log', 'aria-live': 'off', 'aria-label': 'Swarm comms', tabindex: '0' },
  }, empty);
  const jumpText = h('span');
  const jump = h(
    'button',
    { type: 'button', class: 'hud-comms__jump', hidden: true, on: { click: () => jumpToLatest(true) } },
    h('span', { class: 'hud-comms__jump-pill' }, icon('arrow-down', { size: 13 }), jumpText),
  );
  const screen = h('div', { class: 'hud-comms__screen' }, log, jump);
  const body = h('div', { class: 'hud-comms__body', id: `${id}-body`, hidden: !open }, filters, screen);
  const announcer = h('p', { class: 'hud-sr', attrs: { role: 'status', 'aria-live': 'polite' } });
  const el = h(
    'section',
    { class: ['hud-comms', `hud-comms--${variant}`], dataset: { testid: 'comms-log', open: String(open) }, attrs: { 'aria-label': 'Comms' } },
    toggle,
    body,
    announcer,
  );

  // --- state ----------------------------------------------------------------------------------
  let turnId; // turn currently shown (undefined = nothing yet)
  let lastSeq = 0; // newest entry rendered
  let lineCount = 0;
  let visibleCount = 0; // lines that pass the filter
  let primed = false; // first batch rendered (later live lines get the "just printed" glow)
  let filter = null; // agent key or null (all)
  let atBottom = true;
  let jumpUntil = 0; // a smooth "jump to latest" is in flight until this time
  let unseen = 0; // lines added while scrolled up
  let whoCh = 0;
  let disposed = false;
  const chips = new Map(); // agent key → chip
  const fresh = [];
  const shown = { live: undefined, count: undefined, tick: 0 };
  let announceQueue = [];
  let announceTimer = 0;
  let lastAnnounceAt = 0;

  const scrollSoon = raf(() => {
    if (disposed || !open || !atBottom) return;
    log.scrollTop = log.scrollHeight;
  });

  log.addEventListener(
    'scroll',
    () => {
      const bottom = log.scrollHeight - log.scrollTop - log.clientHeight <= STICK_PX;
      // While a smooth jump to the newest line runs, its intermediate positions are not the owner
      // scrolling away: keep following until it lands (or gives up).
      if (jumpUntil) {
        if (!bottom && Date.now() < jumpUntil) return;
        jumpUntil = 0;
      }
      if (bottom === atBottom) return;
      atBottom = bottom;
      if (bottom) unseen = 0;
      syncJump();
    },
    { passive: true },
  );

  // Roving focus between the filter chips: one tab stop, arrow keys move.
  filters.addEventListener('keydown', (event) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const list = Array.from(filters.querySelectorAll('.hud-comms__chip'));
    const at = list.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    let next = at;
    if (event.key === 'ArrowRight') next = Math.min(list.length - 1, at + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, at - 1);
    else if (event.key === 'Home') next = 0;
    else next = list.length - 1;
    list[next].focus();
  });

  function makeChip(key) {
    const dot = h('span', { class: 'hud-comms__chip-dot', attrs: { 'aria-hidden': 'true' } });
    const label = h('span', { class: 'hud-comms__chip-label', text: key === null ? 'All' : '' });
    const sr = h('span', { class: 'hud-sr' });
    const btn = h(
      'button',
      {
        type: 'button',
        class: ['hud-comms__chip', key === null && 'hud-comms__chip--all'],
        attrs: { 'aria-pressed': key === null ? 'true' : 'false', tabindex: key === null ? '0' : '-1' },
        on: { click: () => setFilter(key) },
      },
      h('span', { class: 'hud-comms__chip-face' }, key === null ? null : dot, label, sr),
    );
    return { btn, dot, label, sr, key, name: undefined, status: undefined };
  }

  // --- lines ----------------------------------------------------------------------------------
  function makeLine(e) {
    const line = h(
      'div',
      { class: 'hud-comms__line', dataset: { testid: 'comms-line', tone: e.tone, kind: e.kind, agent: e.agent || '' } },
      h('span', { class: ['hud-comms__time', !e.at && 'is-unknown'], text: e.at ? fmtClock(e.at) : '--:--:--' }),
      ' ',
      h('span', { class: 'hud-comms__who', text: e.who }),
      ' ',
      h('span', { class: 'hud-comms__msg', text: e.text }),
    );
    if (e.detail) line.title = e.detail;
    if (primed && !e.replay) line.classList.add('is-new'); // a brief "just printed" glow
    if (filter !== null && e.agent && e.agent !== filter) line.hidden = true;
    return line;
  }

  function appendEntries(list) {
    const start = list.length > MAX_LINES ? list.length - MAX_LINES : 0;
    const frag = document.createDocumentFragment();
    let visibleAdded = 0;
    for (let i = start; i < list.length; i++) {
      const line = makeLine(list[i]);
      if (!line.hidden) visibleAdded++;
      frag.appendChild(line);
      lineCount++;
    }
    primed = true;
    visibleCount += visibleAdded;
    if (empty.parentNode) empty.remove();
    log.appendChild(frag);
    trim();
    if (open && atBottom) scrollSoon();
    else if (!atBottom && visibleAdded) {
      unseen += visibleAdded;
      syncJump();
    }
  }

  // Drop the oldest lines past the cap; if the owner is reading further up, keep their place.
  function trim() {
    let excess = lineCount - MAX_LINES;
    if (excess <= 0) return;
    const keepPlace = open && !atBottom;
    let removedHeight = 0;
    while (excess > 0 && log.firstChild) {
      const first = log.firstChild;
      if (!first.hidden) {
        visibleCount--;
        if (keepPlace) removedHeight += first.offsetHeight;
      }
      first.remove();
      lineCount--;
      excess--;
    }
    if (keepPlace && removedHeight) log.scrollTop = Math.max(0, log.scrollTop - removedHeight);
  }

  function clearLines() {
    while (log.firstChild) log.firstChild.remove();
    log.appendChild(empty);
    lineCount = 0;
    visibleCount = 0;
    lastSeq = 0;
    unseen = 0;
    atBottom = true;
    primed = false;
    syncJump();
  }

  function syncJump() {
    const showJump = open && !atBottom && unseen > 0;
    if (jump.hidden === showJump) jump.hidden = !showJump;
    if (showJump) setText(jumpText, `${unseen > 99 ? '99+' : unseen} new`);
  }

  function jumpToLatest(smooth) {
    atBottom = true;
    unseen = 0;
    syncJump();
    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
    if (smooth && !reduced && typeof log.scrollTo === 'function') {
      jumpUntil = Date.now() + 1200;
      log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    } else {
      log.scrollTop = log.scrollHeight;
    }
  }

  // --- filters --------------------------------------------------------------------------------
  function setFilter(key) {
    filter = key;
    allChip.btn.setAttribute('aria-pressed', String(key === null));
    allChip.btn.tabIndex = key === null ? 0 : -1;
    for (const chip of chips.values()) {
      const on = chip.key === key;
      chip.btn.setAttribute('aria-pressed', String(on));
      chip.btn.tabIndex = on ? 0 : -1;
    }
    el.dataset.filtered = String(key !== null);
    visibleCount = 0;
    for (let n = log.firstChild; n; n = n.nextSibling) {
      if (n === empty) continue;
      const agent = n.dataset.agent;
      const hide = key !== null && !!agent && agent !== key;
      if (n.hidden !== hide) n.hidden = hide;
      if (!hide) visibleCount++;
    }
    syncCount();
    jumpToLatest(false);
  }

  function syncChips(missions) {
    const seen = new Set();
    let prev = allChip.btn;
    let longest = 6; // "WAVE 1"
    for (const m of missions) {
      const agents = Array.isArray(m.agents) ? m.agents : [];
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a || typeof a !== 'object') continue;
        const key = a.id !== undefined && a.id !== null ? String(a.id) : `#${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let chip = chips.get(key);
        if (!chip) {
          chip = makeChip(key);
          chips.set(key, chip);
        }
        const name = str(a.codename).trim() || 'Agent';
        if (name.length > longest) longest = name.length;
        if (name !== chip.name) {
          chip.name = name;
          setText(chip.label, name);
          chip.btn.dataset.agent = key;
        }
        const status = str(a.status) || 'queued';
        if (status !== chip.status) {
          chip.status = status;
          chip.btn.dataset.tone = status === 'thinking' ? 'think' : statusTone(status);
          setText(chip.sr, `, ${statusLabel(status, 'agent')}`);
        }
        if (prev.nextSibling !== chip.btn) filters.insertBefore(chip.btn, prev.nextSibling);
        prev = chip.btn;
      }
    }
    for (const [key, chip] of chips) {
      if (seen.has(key)) continue;
      chip.btn.remove();
      chips.delete(key);
      if (filter === key) setFilter(null);
    }
    const ch = Math.min(9, longest);
    if (ch !== whoCh) {
      whoCh = ch;
      el.style.setProperty('--hud-who-ch', `${ch}ch`);
    }
  }

  // --- header ---------------------------------------------------------------------------------
  function syncCount() {
    let text = '';
    if (lineCount) text = filter === null ? plural(lineCount, 'line') : `${visibleCount} of ${lineCount}`;
    if (text !== shown.count) {
      shown.count = text;
      setText(count, text);
    }
  }

  function syncHead(anyLive, latest) {
    if (anyLive !== shown.live) {
      shown.live = anyLive;
      live.hidden = !anyLive;
      el.dataset.live = String(anyLive);
    }
    if (latest && latest.seq !== shown.tick) {
      shown.tick = latest.seq;
      setText(tickTime, latest.at ? fmtClock(latest.at) : '');
      setText(tickWho, latest.who);
      setText(tickMsg, latest.text);
      ticker.dataset.tone = latest.tone;
    } else if (!latest && shown.tick !== 0) {
      shown.tick = 0;
      setText(tickTime, '');
      setText(tickWho, '');
      setText(tickMsg, '');
    }
    syncCount();
  }

  // --- announcements --------------------------------------------------------------------------
  function queueAnnouncements(list) {
    for (const e of list) {
      if (e.replay || (e.kind !== 'done' && e.kind !== 'fail')) continue;
      announceQueue.push(`${titleCase(e.who)}: ${e.text}.`);
    }
    if (!announceQueue.length || announceTimer) return;
    const wait = Math.max(600, lastAnnounceAt + ANNOUNCE_MS - Date.now());
    announceTimer = setTimeout(flushAnnouncements, wait);
  }

  function flushAnnouncements() {
    announceTimer = 0;
    const items = announceQueue;
    announceQueue = [];
    if (disposed || !open || !el.isConnected || document.hidden || !items.length) return;
    lastAnnounceAt = Date.now();
    const head = items.slice(0, 3).join(' ');
    setText(announcer, items.length > 3 ? `${head} And ${items.length - 3} more.` : head);
  }

  // --- public -----------------------------------------------------------------------------------
  function setOpen(value, fromUser) {
    const next = !!value;
    if (next === open) return;
    open = next;
    if (fromUser) openPref[variant] = open;
    el.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    if (open) {
      atBottom = true;
      unseen = 0;
      syncJump();
      scrollSoon();
    } else {
      syncJump();
    }
  }

  function update(turn) {
    if (disposed) return;
    const nextId = turn && typeof turn === 'object' ? str(turn.id) || '(turn)' : null;
    if (nextId !== turnId) {
      turnId = nextId;
      clearLines();
      for (const chip of chips.values()) chip.btn.remove();
      chips.clear();
      if (filter !== null) setFilter(null);
    }
    const missions = missionsOf(turn);
    let anyLive = false;
    let latest = null;
    fresh.length = 0;
    for (const m of missions) {
      if (LIVE.has(m.status)) anyLive = true;
      const logData = getMissionLog(m.id);
      if (!logData) continue;
      const entries = logData.entries;
      const last = entries[entries.length - 1];
      if (last && (!latest || last.seq > latest.seq)) latest = last;
      let i = entries.length;
      while (i > 0 && entries[i - 1].seq > lastSeq) i--;
      for (; i < entries.length; i++) fresh.push(entries[i]);
    }
    syncChips(missions);
    if (fresh.length) {
      if (missions.length > 1) fresh.sort((a, b) => a.seq - b.seq);
      lastSeq = fresh[fresh.length - 1].seq;
      appendEntries(fresh);
      queueAnnouncements(fresh);
      fresh.length = 0;
    }
    syncHead(anyLive, latest);
  }

  function dispose() {
    disposed = true;
    scrollSoon.cancel();
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = 0;
    announceQueue = [];
  }

  return {
    el,
    update,
    setOpen: (v) => setOpen(v, false),
    isOpen: () => open,
    dispose,
  };
}
