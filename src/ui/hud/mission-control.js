// Mission Control: the orbit core (agents circling Jarvis), a wave selector for multi-wave turns,
// summary counters (agents done/total, searches, sources, cost, elapsed), the Comms feed (a live
// terminal log of the swarm, see comms-log.js) and the agent card list, sorted active → queued →
// done → stopped/failed. A finished mission shows a summary strip ("Mission complete · 8/8 agents ·
// 23 searches · 41 sources · 1m 12s"); when it finishes while on screen, the orbit core bursts and
// the strip sweeps in (not under reduced motion).
//
//   const mc = createMissionControl({ container, variant: 'sheet' | 'panel' });
//   mc.show(turn, missionId?);   // display a turn (a given mission, else its latest one)
//   mc.update(turn, mission?);   // after engine events; coalesced (at most 10 renders/s)
//   mc.clear();                  // idle core, nothing selected
//
// Selection rules: show() without a missionId (or with the turn's latest mission) follows the newest
// wave and newer turns as they deploy agents; picking an older wave pins it until show() is called
// again. Re-sorting moves as few cards as possible, keeps focus, and compensates the scroll position
// so what the owner is reading does not jump.

import { h, setText, clear, raf } from '../dom.js';
import { icon } from '../icons.js';
import { createCore } from './core.js';
import { createAgentCard } from './agent-card.js';
import { createCommsLog } from './comms-log.js';
import { agentTrail, missionTotals, observeMission } from './comms.js';
import {
  elapsedMs,
  fmtCount,
  fmtDuration,
  fmtUsd,
  isActiveStatus,
  onSecond,
  plural,
  statusIcon,
  statusLabel,
  statusTone,
} from './format.js';

const GROUPS = ['Active', 'Queued', 'Done', 'Stopped / failed'];
// update() renders at most this often (trailing): agent events can arrive every frame while a
// big swarm streams, and status text does not need 60 Hz. The orbit animates on its own. With
// many agents in flight the interval stretches (25ms per unfinished agent, at most 600ms): a big
// swarm on a phone-class CPU otherwise spends most of its time re-rendering Mission Control.
const MIN_RENDER_MS = 100;
const MS_PER_LIVE_AGENT = 25;
const MAX_RENDER_MS = 600;
const CELEBRATE_MS = 2400;
const SUMMARY_LEAD = { done: 'Mission complete', partial: 'Mission complete', stopped: 'Mission stopped', interrupted: 'Mission interrupted' };
const SUMMARY_ICON = { done: 'check', partial: 'check', stopped: 'stop', interrupted: 'pause' };
const AGENT_FINAL = new Set(['done', 'error', 'stopped', 'interrupted']);

const str = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function groupOf(status) {
  if (isActiveStatus(status)) return 0;
  if (status === 'done') return 2;
  if (status === 'error' || status === 'stopped' || status === 'interrupted') return 3;
  return 1;
}

function missionsOf(turn) {
  const ms = turn && turn.missions && typeof turn.missions === 'object' ? Object.values(turn.missions) : [];
  return ms
    .filter((m) => m && typeof m === 'object' && m.id !== undefined)
    .sort((a, b) => (Number(a.wave) || 0) - (Number(b.wave) || 0) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
}

function coreStateFor(mission, turn) {
  if (turn && turn.status === 'error') return 'error';
  if (!mission) return 'idle';
  if (mission.status === 'planning') return 'thinking';
  if (mission.status === 'running') return 'working';
  return 'idle';
}

// Longest increasing subsequence (indices into `seq`), used to move the fewest DOM nodes.
function lisIndices(seq) {
  const tails = [];
  const prev = new Array(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < seq[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out = new Set();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.add(i);
  return out;
}

/** Ancestors of `node` (innermost first) whose overflow-y lets them scroll. */
function scrollCandidates(node) {
  const out = [];
  for (let n = node; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') out.push(n);
  }
  return out;
}

// Re-sorting the agent list happens in phases so layout is read before any DOM write:
//   stableNodes (pure) → captureAnchor (reads) → card updates + moveChildren (writes) → restoreAnchor.

function isInOrder(parent, desired) {
  let node = parent.firstChild;
  for (const d of desired) {
    if (node !== d) return false;
    node = node.nextSibling;
  }
  return !node;
}

/** The children of `parent` that can stay where they are when reordering to `desired` (LIS). */
function stableNodes(parent, desired) {
  const index = new Map();
  desired.forEach((d, i) => index.set(d, i));
  const current = [];
  for (let c = parent.firstChild; c; c = c.nextSibling) if (index.has(c)) current.push(c);
  const keep = lisIndices(current.map((c) => index.get(c)));
  const stay = new Set();
  current.forEach((c, i) => {
    if (keep.has(i)) stay.add(c);
  });
  return stay;
}

/**
 * Read phase: the first of `nodes` (in document order) still visible at the top of the view, and
 * where it sits, if its scroll container (the innermost scrolled one among `scrollers`, else the
 * document) is scrolled at all. Pinning that node keeps whatever the owner is looking at in place:
 * a node above the change measures no movement, so nothing scrolls.
 */
function captureAnchor(nodes, scrollers) {
  let scroller = null;
  for (const c of scrollers) {
    if (c.scrollTop > 0) {
      scroller = c;
      break;
    }
  }
  if (!scroller && !(window.scrollY > 0)) return null;
  const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
  for (const c of nodes) {
    if (!c || c.hidden || !c.isConnected) continue;
    const r = c.getBoundingClientRect();
    if (!r.height) continue;
    if (r.bottom > viewTop + 1) return { node: c, top: r.top, scroller };
  }
  return null;
}

/** Write phase: put `parent`'s children in `desired` order with as few moves as possible. */
function moveChildren(parent, desired) {
  if (isInOrder(parent, desired)) return;
  const stay = stableNodes(parent, desired);
  const focused = document.activeElement;
  let next = null;
  let refocus = false;
  for (let i = desired.length - 1; i >= 0; i--) {
    const d = desired[i];
    if (!stay.has(d) || d.parentNode !== parent) {
      if (focused && d.contains(focused)) refocus = true;
      parent.insertBefore(d, next);
    }
    next = d;
  }
  if (refocus && focused && typeof focused.focus === 'function' && document.activeElement !== focused) {
    focused.focus({ preventScroll: true });
  }
}

/** Scroll by however far the anchor moved, so the content under the owner's eyes stays put. */
function restoreAnchor(anchor) {
  if (!anchor || !anchor.node.isConnected || anchor.node.hidden) return;
  const r = anchor.node.getBoundingClientRect();
  if (!r.height && !r.width) return; // no longer rendered: nothing sensible to hold on to
  const delta = r.top - anchor.top;
  if (Math.abs(delta) <= 0.5) return;
  if (anchor.scroller) anchor.scroller.scrollTop += delta;
  else window.scrollBy(0, delta);
}

/**
 * @param {{ container?: Element, variant?: 'sheet'|'panel', commsOpen?: boolean }} [opts]
 *   commsOpen: whether the comms log starts open (the HUD density) when the owner hasn't opened
 *   or closed it this session; omitted: open in the desktop panel, collapsed in the sheet
 */
export function createMissionControl(opts = {}) {
  const variant = opts.variant === 'sheet' ? 'sheet' : 'panel';

  // --- structure ----------------------------------------------------------------------------
  const canvas = h('canvas', { class: 'hud-mc__orbit' });
  const core = createCore(canvas, { mode: 'orbit' });

  const kicker = h('span', { class: 'hud-mc__kicker' });
  const pillIcon = h('span', { class: 'hud-pill__icon' });
  const pillText = h('span', { class: 'hud-pill__text' });
  const pill = h('span', { class: 'hud-pill' }, pillIcon, pillText);
  const title = h('h2', { class: 'hud-mc__title' });
  const subtitle = h('p', { class: 'hud-mc__subtitle' });
  const summaryIcon = h('span', { class: 'hud-mc__summary-icon', attrs: { 'aria-hidden': 'true' } });
  const summaryLead = h('span', { class: 'hud-mc__summary-lead' });
  const summaryText = h('span', { class: 'hud-mc__summary-text' });
  const summary = h(
    'p',
    { class: 'hud-mc__summary', dataset: { testid: 'mission-summary' }, hidden: true },
    h('span', { class: 'hud-mc__summary-head' }, summaryIcon, summaryLead, h('span', { class: 'hud-sr', text: ' · ' })),
    summaryText,
  );
  // HUD density (SPEC 2.4.19): Calm starts the comms log collapsed, Full open (undefined: as before).
  const comms = createCommsLog({ variant, defaultOpen: typeof opts.commsOpen === 'boolean' ? opts.commsOpen : undefined, onToggle: () => fitCommsSoon() });

  const waves = h('div', { class: 'hud-mc__waves', attrs: { role: 'group', 'aria-label': 'Mission waves' }, hidden: true });

  const tile = (name, label, iconName) => {
    const value = h('dd', { class: 'hud-mc__stat-value' });
    const el = h(
      'div',
      { class: ['hud-mc__stat', `hud-mc__stat--${name}`] },
      h('dt', { class: 'hud-mc__stat-label' }, icon(iconName, { size: 12 }), h('span', { text: label })),
      value,
    );
    return { el, value };
  };
  const tAgents = tile('agents', 'Agents', 'agents');
  const tSearches = tile('searches', 'Searches', 'search');
  const tSources = tile('sources', 'Sources', 'link');
  const tCost = tile('cost', 'Cost', 'dollar');
  const tTime = tile('time', 'Elapsed', 'clock');
  const stats = h('dl', { class: 'hud-mc__stats' }, tAgents.el, tSearches.el, tSources.el, tCost.el, tTime.el);

  const idle = h(
    'div',
    { class: 'hud-mc__idle', hidden: true },
    h('p', { class: 'hud-mc__idle-title', text: 'Standing by' }),
    h('p', { class: 'hud-mc__idle-text', text: 'When Jarvis deploys a team of agents, you can watch every one of them work here.' }),
  );

  const groupHeads = GROUPS.map((label) => {
    const count = h('span', { class: 'hud-mc__group-count' });
    const head = h('p', { class: 'hud-mc__group', hidden: true }, h('span', { text: label }), count);
    return { head, count };
  });
  const headNodes = new Set(groupHeads.map((gh) => gh.head)); // never scroll anchors (they hide)
  const list = h('div', { class: 'hud-mc__list', attrs: { role: 'group', 'aria-label': 'Agents' } });

  const kickerRow = h('div', { class: 'hud-mc__kicker-row' }, kicker, h('span', { class: 'hud-mc__spacer' }), pill);
  const header = h('header', { class: 'hud-mc__header' }, kickerRow, title, subtitle, summary);
  const orbitWrap = h('div', { class: 'hud-mc__orbit-wrap' }, canvas);
  const top = h('div', { class: 'hud-mc__top' }, orbitWrap, header, waves, stats, idle);
  const commsWrap = h('div', { class: 'hud-mc__comms', hidden: true }, comms.el);
  const listWrap = h('div', { class: 'hud-mc__list-wrap' }, list);
  const el = h(
    'div',
    { class: ['hud-mc', `hud-mc--${variant}`], dataset: { testid: 'mission-control' }, attrs: { role: 'region', 'aria-label': 'Mission Control' } },
    top,
    commsWrap,
    listWrap,
  );
  if (opts.container && typeof opts.container.append === 'function') opts.container.append(el);

  // --- state --------------------------------------------------------------------------------
  let turn = null;
  let selectedId = null;
  let pinned = false;
  const cards = new Map(); // agent id → { card, group }
  const expandedIds = new Set();
  const waveButtons = new Map(); // mission id → { btn, count, dot, key }
  let cardsFor = null; // mission id the cards belong to
  let orderSig = ''; // "key:group|…" of the order currently in the DOM
  let candidates = null; // cached scroll-container candidates for the list
  let candidatesKey = '';
  let candidatesHost = null;
  let stopTick = null;
  let destroyed = false;
  const shown = { kicker: undefined, title: undefined, subtitle: undefined, status: undefined, idle: undefined, coreState: undefined, summary: undefined };
  const seenStatus = new Map(); // mission id → status at the previous render (to spot "just finished")
  let celebrateTimer = 0;

  // Desktop panel: the Comms screen takes the room left below the orbit, header and counters, so
  // its newest lines are on screen without scrolling the panel (132–320px; the rest scrolls). The
  // panel and that top block are observed; resizing the screen changes neither, so no RO loop.
  const COMMS_MIN = 132;
  const COMMS_MAX = 320;
  const fitCommsSoon = raf(fitComms);
  let fitObserver = null;
  if (variant === 'panel' && typeof ResizeObserver === 'function') {
    fitObserver = new ResizeObserver(() => fitComms());
    fitObserver.observe(el);
    fitObserver.observe(top);
  }
  function fitComms() {
    if (destroyed || !fitObserver || commsWrap.hidden || !comms.isOpen() || !el.isConnected) return;
    const view = el.clientHeight;
    if (view < 200) return;
    const topInContent = comms.screenTop() - el.getBoundingClientRect().top + el.scrollTop;
    const room = view - topInContent - 20; // screen margin + a little air above the panel's edge
    comms.setScreenHeight(Math.max(COMMS_MIN, Math.min(COMMS_MAX, Math.floor(room))));
  }
  const renderNextFrame = raf(render);
  let renderTimer = 0;
  let lastRenderAt = 0;
  let liveAgents = 0; // unfinished agents in the shown turn at the last render (sets the pace)

  function renderInterval() {
    return Math.min(MAX_RENDER_MS, Math.max(MIN_RENDER_MS, MS_PER_LIVE_AGENT * liveAgents));
  }

  function scheduleRender() {
    if (renderTimer) return;
    const wait = lastRenderAt + renderInterval() - Date.now();
    if (wait > 0) {
      renderTimer = setTimeout(() => {
        renderTimer = 0;
        renderNextFrame();
      }, wait);
    } else {
      renderNextFrame();
    }
  }

  function cancelScheduledRender() {
    renderNextFrame.cancel();
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = 0;
  }

  function selectedMission() {
    if (!turn || !selectedId || !turn.missions) return null;
    return turn.missions[selectedId] || null;
  }

  function latestId(t) {
    const ms = missionsOf(t);
    return ms.length ? ms[ms.length - 1].id : null;
  }

  // --- rendering ----------------------------------------------------------------------------
  function render() {
    if (destroyed) return;
    cancelScheduledRender();
    lastRenderAt = Date.now();
    const mission = selectedMission();
    const justFinished = observeTurn(mission);
    // 2. Read phase, before any write: when the agent order changes or the summary strip is about
    // to appear above the list, note where the content under the owner's eyes is, then put it
    // back after all writes (Safari has no native scroll anchoring; Chrome's is measured away).
    const planned = planCards(mission);
    const sameMission = (mission ? String(mission.id) : null) === cardsFor;
    const summaryComing = !!mission && summary.hidden && !!SUMMARY_LEAD[str(mission.status)];
    const anchor =
      sameMission && list.isConnected && (planned.sig !== orderSig || summaryComing)
        ? captureAnchor(anchorNodes(planned), getScrollCandidates())
        : null;
    renderHeader(mission);
    renderWaves();
    renderStats(mission);
    renderComms(mission);
    renderCards(mission, planned);
    restoreAnchor(anchor);
    const state = coreStateFor(mission, turn);
    if (state !== shown.coreState) {
      shown.coreState = state;
      core.setState(state);
    }
    core.setAgents(mission && Array.isArray(mission.agents) ? mission.agents : []);
    syncTimer(mission);
    if (justFinished) celebrate();
  }

  // Feed the comms log with every wave of the turn and note status changes. True when the shown
  // mission went from working to done/partial since the previous render (seen live, not restored).
  function observeTurn(mission) {
    let justFinished = false;
    let live = 0;
    if (seenStatus.size > 64) seenStatus.clear(); // long sessions: only recent missions matter
    for (const m of missionsOf(turn)) {
      try {
        observeMission(m);
      } catch (err) {
        console.error('[hud] comms update failed', err);
      }
      if (Array.isArray(m.agents)) for (const a of m.agents) if (a && !AGENT_FINAL.has(a.status)) live++;
      const id = String(m.id);
      const status = str(m.status);
      const before = seenStatus.get(id);
      if (before === status) continue;
      seenStatus.set(id, status);
      if (m === mission && (before === 'running' || before === 'planning') && (status === 'done' || status === 'partial')) justFinished = true;
    }
    liveAgents = live;
    return justFinished;
  }

  function celebrate() {
    if (!el.isConnected || prefersReducedMotion()) return;
    core.celebrate('ok');
    el.classList.add('is-celebrating');
    if (celebrateTimer) clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => {
      celebrateTimer = 0;
      el.classList.remove('is-celebrating');
    }, CELEBRATE_MS);
  }

  function renderComms(mission) {
    const hide = !mission;
    if (commsWrap.hidden !== hide) {
      commsWrap.hidden = hide;
      if (!hide) fitCommsSoon();
    }
    if (hide) return;
    try {
      comms.update(turn);
    } catch (err) {
      console.error('[hud] comms render failed', err);
    }
  }

  // "Mission complete · 8/8 agents · 23 searches · 41 sources · 1m 12s" once a mission has ended.
  function renderSummary(mission, status) {
    const lead = SUMMARY_LEAD[status];
    if (!lead) {
      if (!summary.hidden) summary.hidden = true;
      shown.summary = '';
      return;
    }
    const t = missionTotals(mission);
    const parts = [`${t.done}/${t.total} agents`];
    if (t.failed) parts.push(`${t.failed} failed`);
    if (t.stopped) parts.push(`${t.stopped} stopped`);
    if (t.interrupted) parts.push(`${t.interrupted} interrupted`);
    parts.push(plural(t.searches, 'search', 'searches'), plural(t.sources, 'source'));
    if (t.durationMs !== null) parts.push(fmtDuration(t.durationMs));
    const key = `${status}|${parts.join('|')}`;
    if (key === shown.summary) return;
    shown.summary = key;
    summary.dataset.tone = status === 'done' || status === 'partial' ? 'ok' : 'warn';
    summary.dataset.status = status;
    clear(summaryIcon).append(icon(SUMMARY_ICON[status], { size: 14, strokeWidth: 2 }));
    setText(summaryLead, lead);
    // Segments never break inside; on narrow screens the line wraps between them.
    const segs = [];
    parts.forEach((p, i) => {
      if (i) segs.push(' ');
      segs.push(h('span', { class: 'hud-mc__summary-seg', text: i < parts.length - 1 ? `${p} ·` : p }));
    });
    clear(summaryText).append(...segs);
    if (summary.hidden) summary.hidden = false;
  }

  function renderHeader(mission) {
    const isIdle = !mission;
    if (isIdle !== shown.idle) {
      shown.idle = isIdle;
      el.classList.toggle('is-idle', isIdle);
      idle.hidden = !isIdle;
      header.hidden = isIdle;
    }
    const noStats = !mission && !(turn && turn.stats);
    if (stats.hidden !== noStats) stats.hidden = noStats;
    if (!mission) return;
    const kick = `Mission · Wave ${Number(mission.wave) > 0 ? Number(mission.wave) : 1}`;
    if (kick !== shown.kicker) {
      shown.kicker = kick;
      setText(kicker, kick);
    }
    const status = str(mission.status) || 'planning';
    if (status !== shown.status) {
      shown.status = status;
      const tone = statusTone(status);
      el.dataset.status = status;
      pill.dataset.tone = tone;
      clear(pillIcon).append(icon(statusIcon(status), { size: 13 }));
      setText(pillText, statusLabel(status, 'mission'));
    }
    const t = str(mission.title).trim() || (status === 'planning' ? 'Planning the mission…' : 'Mission');
    if (t !== shown.title) {
      shown.title = t;
      setText(title, t);
    }
    const agents = Array.isArray(mission.agents) ? mission.agents : [];
    const models = new Set(agents.map((a) => a && a.model).filter(Boolean));
    let sub = plural(agents.length, 'agent');
    if (models.size === 1) sub += ` · ${modelLabel([...models][0])}`;
    if (turn && turn.depth) sub += ` · ${str(turn.depth).charAt(0).toUpperCase()}${str(turn.depth).slice(1)} depth`;
    if (sub !== shown.subtitle) {
      shown.subtitle = sub;
      setText(subtitle, sub);
    }
    renderSummary(mission, status);
  }

  function modelLabel(id) {
    const m = /^claude-([a-z]+)-(\d+)-(\d+)/i.exec(String(id));
    return m ? `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : String(id);
  }

  function renderWaves() {
    const ms = missionsOf(turn);
    const multi = ms.length > 1;
    if (waves.hidden === multi) waves.hidden = !multi;
    const seen = new Set();
    let prev = null;
    if (multi) {
      for (const m of ms) {
        const id = String(m.id);
        seen.add(id);
        let w = waveButtons.get(id);
        if (!w) {
          const count = h('span', { class: 'hud-mc__wave-count' });
          const dot = h('span', { class: 'hud-mc__wave-dot', attrs: { 'aria-hidden': 'true' } });
          const label = h('span', { class: 'hud-mc__wave-label' });
          const btn = h('button', { type: 'button', class: 'hud-mc__wave', on: { click: () => select(id) } }, dot, label, count);
          w = { btn, count, dot, label, key: '' };
          waveButtons.set(id, w);
        }
        const agents = Array.isArray(m.agents) ? m.agents : [];
        const done = agents.filter((a) => a && a.status === 'done').length;
        const key = `${m.wave}|${m.status}|${done}|${agents.length}|${id === selectedId}`;
        if (key !== w.key) {
          w.key = key;
          setText(w.label, `Wave ${Number(m.wave) > 0 ? Number(m.wave) : 1}`);
          setText(w.count, `${done}/${agents.length}`);
          w.btn.dataset.tone = statusTone(m.status);
          w.btn.setAttribute('aria-pressed', String(id === selectedId));
          w.btn.setAttribute(
            'aria-label',
            `Wave ${m.wave}: ${str(m.title) || 'mission'}, ${statusLabel(m.status, 'mission')}, ${done} of ${agents.length} agents done`,
          );
        }
        const expected = prev ? prev.nextSibling : waves.firstChild;
        if (w.btn !== expected) waves.insertBefore(w.btn, expected);
        prev = w.btn;
      }
    }
    for (const [id, w] of waveButtons) {
      if (!seen.has(id)) {
        w.btn.remove();
        waveButtons.delete(id);
      }
    }
  }

  function setTile(t, text) {
    if (t.value.textContent !== text) t.value.textContent = text;
  }

  function renderStats(mission) {
    if (!mission) {
      // Idle: show the last shown turn's totals, if any.
      const s = turn && turn.stats;
      if (s) {
        setTile(tAgents, fmtCount(s.agents || 0));
        setTile(tSearches, fmtCount(s.searches || 0));
        setTile(tSources, fmtCount(s.sources || 0));
        setTile(tCost, fmtUsd(turn.costUsd));
        setTile(tTime, s.durationMs ? fmtDuration(s.durationMs) : turnElapsed());
      }
      return;
    }
    const agents = Array.isArray(mission.agents) ? mission.agents : [];
    let done = 0;
    let searches = 0;
    let cost = 0;
    const urls = new Set();
    for (const a of agents) {
      if (!a) continue;
      if (a.status === 'done') done++;
      if (Array.isArray(a.searches)) searches += a.searches.length;
      if (Array.isArray(a.sources)) for (const s of a.sources) if (s && s.url) urls.add(s.url);
      const c = Number(a.costUsd);
      if (Number.isFinite(c) && c > 0) cost += c;
    }
    setTile(tAgents, `${done}/${agents.length}`);
    setTile(tSearches, fmtCount(searches));
    setTile(tSources, fmtCount(urls.size));
    setTile(tCost, fmtUsd(cost));
    setTile(tTime, missionElapsed(mission, Date.now()));
  }

  function turnElapsed() {
    const ms = turn ? elapsedMs(turn.createdAt, turn.endedAt) : null;
    return ms === null ? '—' : fmtDuration(ms);
  }

  function missionElapsed(mission, now) {
    const ms = elapsedMs(mission.createdAt || mission.startedAt, mission.endedAt, now); // planning included: never jumps back
    return ms === null ? '—' : fmtDuration(ms);
  }

  function syncTimer(mission) {
    const running = !!mission && (mission.status === 'running' || mission.status === 'planning') && !mission.endedAt;
    if (running && !stopTick) {
      stopTick = onSecond((now) => {
        const m = selectedMission();
        if (m) setTile(tTime, missionElapsed(m, now));
      });
    } else if (!running && stopTick) {
      stopTick();
      stopTick = null;
    }
  }

  function disposeCards() {
    for (const { card } of cards.values()) {
      card.dispose();
      card.el.remove();
    }
    cards.clear();
    orderSig = '';
  }

  // Overflow styles only change with the layout (e.g. a short-window media query), so the
  // candidate scroll containers are looked up again only when the viewport size changes.
  function getScrollCandidates() {
    if (!list.isConnected) return [];
    const key = `${window.innerWidth}x${window.innerHeight}`;
    if (!candidates || key !== candidatesKey || candidatesHost !== el.parentElement || !candidates.every((c) => c.isConnected && c.contains(list))) {
      candidates = scrollCandidates(list);
      candidatesKey = key;
      candidatesHost = el.parentElement;
    }
    return candidates;
  }

  // Group headers and cards in display order (cards that do not exist yet are skipped).
  function desiredOrder(plan) {
    const out = [];
    for (let g = 0; g < GROUPS.length; g++) {
      out.push(groupHeads[g].head);
      for (const p of plan) {
        if (p.group !== g) continue;
        const entry = cards.get(p.key);
        if (entry) out.push(entry.card.el);
      }
    }
    return out;
  }

  // Scroll-anchor candidates in document order: the blocks above the list, then the cards that
  // keep their place in a re-sort (moving cards and group headers, which hide when their group
  // empties, would make poor anchors).
  function anchorNodes(planned) {
    const out = [orbitWrap, kickerRow, title, subtitle, waves, stats, commsWrap];
    const stay = stableNodes(list, desiredOrder(planned.plan));
    for (let c = list.firstChild; c; c = c.nextSibling) if (stay.has(c) && !headNodes.has(c)) out.push(c);
    return out;
  }

  // 1. Plan (no DOM access): key and sort group of every agent.
  function planCards(mission) {
    const agents = mission && Array.isArray(mission.agents) ? mission.agents : [];
    const plan = [];
    const keys = new Set();
    agents.forEach((a, i) => {
      if (!a || typeof a !== 'object') return;
      const key = a.id !== undefined && a.id !== null ? String(a.id) : `#${i}`;
      if (keys.has(key)) return;
      keys.add(key);
      plan.push({ key, agent: a, group: groupOf(a.status) });
    });
    return { plan, keys, sig: plan.map((p) => `${p.key}:${p.group}`).join('|') };
  }

  // 3. Write: update or create cards, drop vanished ones, group headers, order. (Step 2, reading
  // the scroll anchor before any write, happens in render().)
  function renderCards(mission, planned) {
    const missionId = mission ? String(mission.id) : null;
    if (missionId !== cardsFor) {
      disposeCards();
      cardsFor = missionId;
    }
    const { plan, keys, sig } = planned;
    const reorder = sig !== orderSig;
    for (const p of plan) {
      const entry = cards.get(p.key);
      if (entry) {
        entry.card.update(p.agent);
        entry.group = p.group;
      } else {
        const key = p.key;
        const card = createAgentCard(p.agent, {
          expanded: expandedIds.has(key),
          onToggle: (open) => (open ? expandedIds.add(key) : expandedIds.delete(key)),
          getTrail: () => agentTrail(missionId, key),
        });
        cards.set(key, { card, group: p.group });
      }
    }
    for (const [key, entry] of cards) {
      if (!keys.has(key)) {
        entry.card.dispose();
        entry.card.el.remove();
        cards.delete(key);
      }
    }
    const counts = [0, 0, 0, 0];
    for (const p of plan) counts[p.group]++;
    groupHeads.forEach((gh, g) => {
      if (gh.head.hidden !== !counts[g]) gh.head.hidden = !counts[g];
      setText(gh.count, counts[g] ? String(counts[g]) : '');
    });
    if (reorder) {
      moveChildren(list, desiredOrder(plan));
      orderSig = sig;
    }
  }

  // --- public API ---------------------------------------------------------------------------
  function select(missionId) {
    if (!turn || !turn.missions || !turn.missions[missionId]) return;
    selectedId = String(missionId);
    pinned = selectedId !== String(latestId(turn));
    render();
  }

  function show(nextTurn, missionId) {
    if (destroyed) return;
    if (!nextTurn || typeof nextTurn !== 'object') {
      clearView();
      return;
    }
    turn = nextTurn;
    const latest = latestId(turn);
    const wanted = missionId !== undefined && missionId !== null && turn.missions && turn.missions[missionId] ? String(missionId) : null;
    selectedId = wanted || (latest !== null ? String(latest) : null);
    pinned = !!wanted && wanted !== String(latest);
    render();
  }

  function update(nextTurn, mission) {
    if (destroyed || !nextTurn || typeof nextTurn !== 'object') return;
    if (!turn || nextTurn.id !== turn.id) {
      // Another turn: follow it once it deploys agents, unless the owner pinned a mission.
      const latest = latestId(nextTurn);
      if (turn && (pinned || latest === null)) return;
      turn = nextTurn;
      selectedId = latest !== null ? String(latest) : null;
      pinned = false;
    } else {
      turn = nextTurn;
      const latest = latestId(turn);
      if (!pinned && latest !== null) selectedId = String(latest);
      else if (mission && mission.id !== undefined && !selectedId) selectedId = String(mission.id);
    }
    scheduleRender();
  }

  function clearView() {
    turn = null;
    selectedId = null;
    pinned = false;
    render();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelScheduledRender();
    if (stopTick) stopTick();
    stopTick = null;
    if (celebrateTimer) clearTimeout(celebrateTimer);
    celebrateTimer = 0;
    fitCommsSoon.cancel();
    if (fitObserver) fitObserver.disconnect();
    fitObserver = null;
    disposeCards();
    comms.dispose();
    core.destroy();
    el.remove();
  }

  render();

  return {
    el,
    show,
    update,
    clear: clearView,
    destroy,
    /** The mission currently displayed (null when idle). */
    get missionId() {
      return selectedId;
    },
    /** The orbit core (for debugging / performance checks). */
    core,
  };
}
