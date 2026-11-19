// Agent card (Mission Control): codename, role, status pill, live activity line and counters,
// plus expandable Task / Search log / Thinking / Report / Sources / Error sections.
//
//   const card = createAgentCard(agent, { expanded: false, getTrail: () => agentTrail(missionId, agentId) });
//   list.append(card.el); … card.update(agent);   // call again whenever the agent changes
//
// update() patches the existing DOM in place and never rebuilds it, so the expanded state, open
// sections, focus and scroll positions survive any number of updates. The expensive parts (the
// Markdown report, thinking text, search log and sources list) are only rendered while visible, and
// the report re-renders at most 4×/s while it streams.
//
// The search log is the agent's queries and page reads in order. `getTrail` (optional, from
// comms.js) supplies the order they were seen in and when; without it, or for steps from before
// the app was watching, queries are listed first and page reads after them, without times.

import { h, setText, safeUrl, clear } from '../dom.js';
import { icon } from '../icons.js';
import { renderMarkdown } from '../../lib/markdown.js';
import {
  elapsedMs,
  fmtCount,
  fmtDuration,
  fmtOffset,
  fmtUsd,
  hostname,
  isActiveStatus,
  isRetrying,
  modelShort,
  onSecond,
  plural,
  statusIcon,
  statusLabel,
  statusTone,
} from './format.js';

const REPORT_INTERVAL_MS = 250;
const THINKING_INTERVAL_MS = 300;
const MAX_SOURCES = 30;

let seq = 0;

const str = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

function countWords(text) {
  const m = str(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

function activityFor(a, words) {
  const status = a.status;
  if (status === 'error') return (a.error && str(a.error.message)) || 'This agent failed.';
  if (status === 'stopped') return 'Stopped before finishing.';
  if (status === 'interrupted') return 'Connection lost — resume the turn to continue.';
  // The engine says why an agent waits: "Being briefed", "Lined up to start", "Waiting for a free
  // slot", "Rate limited — retrying in 12s" (counting down).
  if (status === 'queued') return str(a.activity).trim() || 'Waiting for a free slot…';
  if (status === 'done') return words > 0 ? `Report ready · ${fmtCount(words)} words` : 'Finished.';
  const activity = str(a.activity).trim();
  if (activity) return activity;
  if (status === 'starting') return 'Starting up…';
  if (status === 'thinking') return 'Planning the approach…';
  if (status === 'writing') return 'Writing report';
  return `${statusLabel(status, 'agent')}…`;
}

/** "/e/e3913.html" — the readable part of a URL after the host ('' for a bare host). */
function urlPath(url) {
  let parsed = null;
  try {
    parsed = new URL(str(url));
  } catch {
    return '';
  }
  let path = parsed.pathname || '';
  try {
    path = decodeURIComponent(path);
  } catch {
    /* keep it encoded */
  }
  path = path.replace(/\/+$/, '');
  if (parsed.search) path += parsed.search.length > 40 ? `${parsed.search.slice(0, 39)}…` : parsed.search;
  return path;
}

/**
 * The agent's steps in order: the observed trail first (dropping steps past the current lists),
 * then anything it does not cover — queries before page reads, without times.
 */
function trailSteps(a, trail) {
  const searches = Array.isArray(a.searches) ? a.searches : [];
  const fetches = Array.isArray(a.fetches) ? a.fetches : [];
  const steps = [];
  const hasS = new Uint8Array(searches.length);
  const hasF = new Uint8Array(fetches.length);
  if (Array.isArray(trail)) {
    for (const s of trail) {
      if (!s || !Number.isInteger(s.index) || s.index < 0) continue;
      if (s.kind === 'search' && s.index < searches.length && !hasS[s.index]) {
        hasS[s.index] = 1;
        steps.push({ kind: 'search', index: s.index, at: s.at || null });
      } else if (s.kind === 'read' && s.index < fetches.length && !hasF[s.index]) {
        hasF[s.index] = 1;
        steps.push({ kind: 'read', index: s.index, at: s.at || null });
      }
    }
  }
  const missing = [];
  for (let i = 0; i < searches.length; i++) if (!hasS[i]) missing.push({ kind: 'search', index: i, at: null });
  for (let i = 0; i < fetches.length; i++) if (!hasF[i]) missing.push({ kind: 'read', index: i, at: null });
  // Unseen steps happened before the observed ones (they were already there when we first looked).
  return missing.length ? missing.concat(steps) : steps;
}

function section(name, label, open) {
  const count = h('span', { class: 'hud-sec__count' });
  const summary = h(
    'summary',
    { class: 'hud-sec__summary' },
    h('span', { class: 'hud-sec__chev' }, icon('chevron-right', { size: 14 })),
    h('span', { class: 'hud-sec__label', text: label }),
    count,
  );
  const body = h('div', { class: 'hud-sec__body' });
  const details = h('details', { class: ['hud-sec', `hud-sec--${name}`], open }, summary, body);
  return { details, body, count };
}

/**
 * @param {object} agent  Agent (SPEC §6); may be partial while the mission is being planned
 * @param {{ expanded?: boolean, onToggle?: (expanded: boolean) => void }} [opts]
 */
export function createAgentCard(agent, opts = {}) {
  const id = `hud-agent-${++seq}`;
  let expanded = !!opts.expanded;
  const onToggle = typeof opts.onToggle === 'function' ? opts.onToggle : null;
  const getTrail = typeof opts.getTrail === 'function' ? opts.getTrail : null;
  let a = agent || {};

  // --- static structure ---------------------------------------------------------------------
  const initial = h('span', { class: 'hud-agent__initial' });
  const avatar = h('span', { class: 'hud-agent__avatar', attrs: { 'aria-hidden': 'true' } }, initial);
  const codename = h('span', { class: 'hud-agent__codename' });
  const retry = h('span', { class: 'hud-agent__badge hud-agent__badge--retry', hidden: true });
  const noWeb = h('span', { class: 'hud-agent__badge', text: 'No web', hidden: true });
  const role = h('span', { class: 'hud-agent__role' });
  const pillIcon = h('span', { class: 'hud-pill__icon' });
  const pillText = h('span', { class: 'hud-pill__text' });
  const pill = h('span', { class: 'hud-pill' }, pillIcon, pillText);
  const chev = h('span', { class: 'hud-agent__chev', attrs: { 'aria-hidden': 'true' } }, icon('chevron-down', { size: 16 }));
  const head = h(
    'button',
    {
      type: 'button',
      class: 'hud-agent__head',
      attrs: { 'aria-expanded': String(expanded), 'aria-controls': `${id}-body` },
    },
    avatar,
    h('span', { class: 'hud-agent__ident' }, h('span', { class: 'hud-agent__line1' }, codename, retry, noWeb), role),
    pill,
    chev,
  );

  const activityIcon = h('span', { class: 'hud-agent__activity-icon', attrs: { 'aria-hidden': 'true' } });
  const activityText = h('span', { class: 'hud-agent__activity-text' });
  const activity = h('p', { class: 'hud-agent__activity' }, activityIcon, activityText);

  const stat = (iconName, label) => {
    const value = h('span', { class: 'hud-agent__stat-value' });
    const el = h(
      'span',
      { class: 'hud-agent__stat', attrs: { title: label } },
      icon(iconName, { size: 13 }),
      h('span', { class: 'hud-sr', text: `${label}: ` }),
      value,
    );
    return { el, value };
  };
  const stSearches = stat('search', 'Searches');
  const stSources = stat('link', 'Sources');
  const stTime = stat('clock', 'Time');
  const stCost = stat('dollar', 'Cost estimate');
  const stats = h('p', { class: 'hud-agent__stats' }, stSearches.el, stSources.el, stTime.el, stCost.el);

  const secTask = section('task', 'Task', false);
  const taskText = h('p', { class: 'hud-agent__task' });
  const taskMeta = h('p', { class: 'hud-agent__meta' });
  secTask.body.append(taskText, taskMeta);

  const secTrail = section('trail', 'Search log', false);
  const trailList = h('ol', { class: 'hud-trail', attrs: { 'aria-label': 'Searches and pages read, in order' } });
  secTrail.body.append(trailList);

  const secThinking = section('thinking', 'Thinking', false);
  const thinkingText = h('div', { class: 'hud-agent__thinking' });
  secThinking.body.append(thinkingText);

  // Markdown via src/lib/markdown.js (its code-block Copy buttons handle their own clicks).
  const secReport = section('report', 'Report', true);
  const reportBox = h('div', { class: 'hud-md hud-agent__report' });
  secReport.body.append(reportBox);

  const secSources = section('sources', 'Sources', false);
  const sourcesList = h('ol', { class: 'hud-sources' });
  secSources.body.append(sourcesList);

  const errorIcon = h('span', { class: 'hud-agent__error-icon' }, icon('alert', { size: 16 }));
  const errorText = h('span', { class: 'hud-agent__error-text' });
  const errorBox = h('div', { class: 'hud-agent__error', hidden: true }, errorIcon, errorText);

  const body = h(
    'div',
    { class: 'hud-agent__body', id: `${id}-body`, hidden: !expanded },
    errorBox,
    secTask.details,
    secTrail.details,
    secThinking.details,
    secReport.details,
    secSources.details,
  );

  const el = h(
    'article',
    { class: ['hud-agent', expanded && 'is-expanded'], dataset: { testid: 'agent-card' } },
    head,
    activity,
    stats,
    body,
  );

  // Tapping anywhere on the summary area (not inside the expanded body) toggles the card.
  // Keyboard users get the same through the header button.
  el.addEventListener('click', (event) => {
    const t = event.target;
    if (!(t instanceof Element) || body.contains(t)) return;
    if (t.closest('a, input, select, textarea')) return;
    const sel = window.getSelection ? window.getSelection() : null;
    if (sel && !sel.isCollapsed && el.contains(sel.anchorNode) && t !== head && !head.contains(t)) return;
    setExpanded(!expanded, true);
  });

  for (const sec of [secTrail, secThinking, secReport, secSources]) {
    sec.details.addEventListener('toggle', () => refreshLazy(true));
  }

  // --- render state (what the DOM currently shows) ----------------------------------------
  const shown = {
    status: undefined,
    codename: undefined,
    role: undefined,
    activity: undefined,
    task: undefined,
    attempts: undefined,
    web: undefined,
    model: undefined,
    errorMsg: undefined,
    searches: undefined,
    sources: undefined,
    cost: undefined,
    time: undefined,
    reportText: null,
    reportStreaming: null,
    thinkingText: null,
    sourcesKey: null,
    trailKey: null,
    trailCount: undefined,
  };
  let wordsFor = null;
  let words = 0;
  let reportTimer = 0;
  let reportAt = 0;
  let thinkingTimer = 0;
  let thinkingAt = 0;
  let stopTick = null;
  let detachedTicks = 0;

  function setExpanded(value, fromUser) {
    const next = !!value;
    if (next === expanded) return;
    expanded = next;
    head.setAttribute('aria-expanded', String(expanded));
    body.hidden = !expanded;
    el.classList.toggle('is-expanded', expanded);
    if (expanded) refreshLazy(true);
    if (fromUser && onToggle) onToggle(expanded);
  }

  // --- live timer ---------------------------------------------------------------------------
  function timeText(now) {
    const ms = elapsedMs(a.startedAt, a.endedAt, now);
    return ms === null ? '—' : fmtDuration(ms);
  }

  function syncTimer() {
    const running = isActiveStatus(a.status) && a.startedAt && !a.endedAt;
    if (running && !stopTick) {
      detachedTicks = 0;
      stopTick = onSecond((now) => {
        if (!el.isConnected) {
          // Card removed without being disposed: stop ticking after a few seconds.
          if (++detachedTicks > 3) stopTimer();
          return;
        }
        detachedTicks = 0;
        const t = timeText(now);
        if (t !== shown.time) {
          shown.time = t;
          setText(stTime.value, t);
        }
      });
    } else if (!running && stopTick) {
      stopTimer();
    }
  }

  function stopTimer() {
    if (stopTick) stopTick();
    stopTick = null;
  }

  // --- lazy sections --------------------------------------------------------------------------
  function refreshLazy(immediate) {
    if (!expanded) return;
    if (secReport.details.open && !secReport.details.hidden) scheduleReport(immediate);
    if (secThinking.details.open && !secThinking.details.hidden) scheduleThinking(immediate);
    if (secSources.details.open && !secSources.details.hidden) renderSources();
    if (secTrail.details.open && !secTrail.details.hidden) renderTrail();
  }

  // Search log rows are keyed by step ("search:3" / "read:0"); a row is rebuilt only if its text
  // or time changed (a retry restarts the lists), and rows are only moved when the order changes.
  const trailRows = new Map();
  function readTrail() {
    if (!getTrail) return null;
    try {
      return getTrail();
    } catch {
      return null;
    }
  }

  function renderTrail() {
    const trail = readTrail();
    const searches = Array.isArray(a.searches) ? a.searches : [];
    const fetches = Array.isArray(a.fetches) ? a.fetches : [];
    const start = Number(a.startedAt) || 0;
    const key = `${searches.length}|${fetches.length}|${trail ? trail.length : -1}|${start}|${a.attempts}`;
    if (key === shown.trailKey) return;
    shown.trailKey = key;
    const steps = trailSteps(a, trail);
    const seen = new Set();
    let prev = null;
    for (const step of steps) {
      const rowKey = `${step.kind}:${step.index}`;
      seen.add(rowKey);
      const raw = str(step.kind === 'search' ? searches[step.index] : fetches[step.index]);
      const when = step.at && start ? fmtOffset(step.at - start) : '';
      let row = trailRows.get(rowKey);
      if (!row || row.raw !== raw || row.when !== when) {
        const li = trailRow(step.kind, raw, when);
        if (row) row.li.replaceWith(li);
        row = { li, raw, when };
        trailRows.set(rowKey, row);
      }
      const expected = prev ? prev.nextSibling : trailList.firstChild;
      if (row.li !== expected) trailList.insertBefore(row.li, expected);
      prev = row.li;
    }
    for (const [rowKey, row] of trailRows) {
      if (!seen.has(rowKey)) {
        row.li.remove();
        trailRows.delete(rowKey);
      }
    }
  }

  function trailRow(kind, raw, when) {
    const glyph = h('span', { class: 'hud-trail__icon', attrs: { 'aria-hidden': 'true' } }, icon(kind === 'search' ? 'search' : 'globe', { size: 13 }));
    const time = h('span', { class: 'hud-trail__time', text: when, attrs: when ? { title: 'Time since the agent started' } : null });
    let row;
    if (kind === 'search') {
      const text = h('span', { class: 'hud-trail__text' }, h('span', { class: 'hud-sr', text: 'Searched ' }), `“${raw.replace(/\s+/g, ' ').trim()}”`);
      row = h('div', { class: 'hud-trail__row' }, glyph, text, time);
    } else {
      // A page read: the whole row is the link (opens in a new tab; unsafe URLs stay plain text).
      const host = hostname(raw);
      const path = host ? urlPath(raw) : '';
      const text = h(
        'span',
        { class: 'hud-trail__text' },
        h('span', { class: 'hud-sr', text: 'Read ' }),
        h('span', { class: 'hud-trail__host', text: host || raw }),
        path ? h('span', { class: 'hud-trail__path', text: path }) : null,
      );
      const href = safeUrl(raw);
      row = href
        ? h('a', { class: 'hud-trail__row hud-trail__row--link', href, title: raw, attrs: { target: '_blank', rel: 'noopener noreferrer' } }, glyph, text, time)
        : h('div', { class: 'hud-trail__row' }, glyph, text, time);
    }
    return h('li', { class: 'hud-trail__step', dataset: { kind } }, row);
  }

  function scheduleReport(immediate) {
    const text = str(a.report);
    const streaming = a.status === 'writing';
    if (text === shown.reportText && streaming === shown.reportStreaming) return;
    if (reportTimer) return;
    const wait = immediate ? 0 : Math.max(0, reportAt + REPORT_INTERVAL_MS - Date.now());
    if (wait === 0) renderReport();
    else reportTimer = setTimeout(renderReport, wait);
  }

  function renderReport() {
    reportTimer = 0;
    if (!expanded || !secReport.details.open) return;
    const text = str(a.report);
    const streaming = a.status === 'writing';
    if (text === shown.reportText && streaming === shown.reportStreaming) return;
    reportAt = Date.now();
    let content;
    try {
      content = renderMarkdown(text, { streaming });
    } catch (err) {
      console.error('[hud] report render failed', err);
      content = h('p', { class: 'hud-agent__plain', text });
    }
    clear(reportBox);
    reportBox.append(content);
    shown.reportText = text;
    shown.reportStreaming = streaming;
  }

  function scheduleThinking(immediate) {
    if (str(a.thinking) === shown.thinkingText || thinkingTimer) return;
    const wait = immediate ? 0 : Math.max(0, thinkingAt + THINKING_INTERVAL_MS - Date.now());
    if (wait === 0) renderThinking();
    else thinkingTimer = setTimeout(renderThinking, wait);
  }

  function renderThinking() {
    thinkingTimer = 0;
    if (!expanded || !secThinking.details.open) return;
    const text = str(a.thinking);
    if (text === shown.thinkingText) return;
    thinkingAt = Date.now();
    setText(thinkingText, text);
    shown.thinkingText = text;
  }

  // Sources are keyed by URL: existing rows are kept and only reordered when the order changes.
  const sourceRows = new Map();
  function renderSources() {
    const list = Array.isArray(a.sources) ? a.sources.slice(0, MAX_SOURCES) : [];
    const key = list.map((s) => (s && s.url) || '').join('\n') + '|' + list.map((s) => (s && s.title) || '').join('\n');
    if (key === shown.sourcesKey) return;
    shown.sourcesKey = key;
    const seen = new Set();
    let prev = null;
    for (const src of list) {
      if (!src || typeof src.url !== 'string' || seen.has(src.url)) continue;
      seen.add(src.url);
      let row = sourceRows.get(src.url);
      const host = hostname(src.url);
      const title = str(src.title).trim() || host || src.url;
      const meta = [host, str(src.pageAge).trim()].filter(Boolean).join(' · ');
      if (!row || row.title !== title || row.meta !== meta) {
        // The whole row is the link (a comfortable tap target). URLs that are not http(s)/mailto
        // are shown as plain text, never as links.
        const href = safeUrl(src.url);
        const parts = [h('span', { class: 'hud-src__title', text: title }), meta ? h('span', { class: 'hud-src__meta', text: meta }) : null];
        const inner = href
          ? h('a', { class: 'hud-src__link', href, attrs: { target: '_blank', rel: 'noopener noreferrer' } }, parts)
          : h('span', { class: 'hud-src__link is-plain' }, parts);
        const li = h('li', { class: 'hud-src' }, inner);
        if (row) row.li.replaceWith(li);
        row = { li, title, meta };
        sourceRows.set(src.url, row);
      }
      const expected = prev ? prev.nextSibling : sourcesList.firstChild;
      if (row.li !== expected) sourcesList.insertBefore(row.li, expected);
      prev = row.li;
    }
    for (const [url, row] of sourceRows) {
      if (!seen.has(url)) {
        row.li.remove();
        sourceRows.delete(url);
      }
    }
  }

  // --- update -------------------------------------------------------------------------------
  function update(next) {
    if (next && typeof next === 'object') a = next;
    const status = str(a.status) || 'queued';
    // A queued agent counting down to a retry reads as "Retrying" in the warning tone
    // (data-status stays the engine's status).
    const retrying = isRetrying(a);
    const look = retrying ? 'retrying' : status;

    if (look !== shown.status) {
      shown.status = look;
      const tone = retrying ? 'warn' : statusTone(status);
      el.dataset.status = status;
      el.dataset.tone = tone;
      el.classList.toggle('is-retrying', retrying);
      pill.dataset.tone = tone;
      const glyph = retrying ? 'refresh' : statusIcon(status);
      clear(pillIcon).append(icon(glyph, { size: 13 }));
      setText(pillText, retrying ? 'Retrying' : statusLabel(status, 'agent'));
      clear(activityIcon).append(icon(glyph, { size: 14 }));
    }

    const name = str(a.codename) || 'Agent';
    if (name !== shown.codename) {
      shown.codename = name;
      el.dataset.codename = str(a.codename);
      setText(codename, name);
      setText(initial, name.charAt(0).toUpperCase());
    }
    if (a.id !== undefined && el.dataset.agentId !== str(a.id)) el.dataset.agentId = str(a.id);

    const roleText = str(a.role).trim() || 'Field agent';
    if (roleText !== shown.role) {
      shown.role = roleText;
      setText(role, roleText);
      head.title = roleText;
    }

    const attempts = Number(a.attempts) || 0;
    if (attempts !== shown.attempts) {
      shown.attempts = attempts;
      retry.hidden = attempts <= 1;
      setText(retry, `Retry ${Math.max(1, attempts - 1)}`);
    }
    if (a.web !== shown.web) {
      shown.web = a.web;
      noWeb.hidden = a.web !== false;
    }

    // Word count is only shown once the report is final, so count once per final text.
    const report = str(a.report);
    const wordsKey = status === 'done' ? report : null;
    if (wordsKey !== wordsFor) {
      wordsFor = wordsKey;
      words = wordsKey ? countWords(wordsKey) : 0;
    }
    const act = activityFor(a, words);
    if (act !== shown.activity) {
      shown.activity = act;
      setText(activityText, act);
      activity.title = act;
    }

    const searches = Array.isArray(a.searches) ? a.searches.length : Number(a.usage?.searches) || 0;
    if (searches !== shown.searches) {
      shown.searches = searches;
      setText(stSearches.value, fmtCount(searches));
    }
    const sourceCount = Array.isArray(a.sources) ? Math.min(a.sources.length, MAX_SOURCES) : 0;
    if (sourceCount !== shown.sources) {
      shown.sources = sourceCount;
      setText(stSources.value, fmtCount(sourceCount));
      setText(secSources.count, sourceCount ? fmtCount(sourceCount) : '');
    }
    const cost = fmtUsd(a.costUsd);
    if (cost !== shown.cost) {
      shown.cost = cost;
      setText(stCost.value, cost);
    }
    const time = timeText(Date.now());
    if (time !== shown.time) {
      shown.time = time;
      setText(stTime.value, time);
    }

    const task = str(a.task);
    if (task !== shown.task) {
      shown.task = task;
      setText(taskText, task || 'The task is still being written…');
    }
    const model = [a.model ? modelShort(a.model) : '', a.web === false ? 'no web access' : 'web search + reading'].filter(Boolean).join(' · ');
    if (model !== shown.model) {
      shown.model = model;
      setText(taskMeta, model);
    }

    const errorMsg = status === 'error' || a.error ? str(a.error && a.error.message) || (status === 'error' ? 'This agent failed.' : '') : '';
    if (errorMsg !== shown.errorMsg) {
      shown.errorMsg = errorMsg;
      errorBox.hidden = !errorMsg;
      const kind = a.error && a.error.kind ? ` (${str(a.error.kind).replace(/_/g, ' ')})` : '';
      setText(errorText, errorMsg ? errorMsg + kind : '');
    }

    const hasThinking = !!str(a.thinking);
    if (secThinking.details.hidden === hasThinking) secThinking.details.hidden = !hasThinking;
    if (secReport.details.hidden === !!report) secReport.details.hidden = !report;
    if (secSources.details.hidden === sourceCount > 0) secSources.details.hidden = sourceCount === 0;
    const nSearch = Array.isArray(a.searches) ? a.searches.length : 0;
    const nRead = Array.isArray(a.fetches) ? a.fetches.length : 0;
    const hasTrail = nSearch + nRead > 0;
    if (secTrail.details.hidden === hasTrail) secTrail.details.hidden = !hasTrail;
    const trailCount = [nSearch ? plural(nSearch, 'search', 'searches') : '', nRead ? plural(nRead, 'page') : ''].filter(Boolean).join(' · ');
    if (trailCount !== shown.trailCount) {
      shown.trailCount = trailCount;
      setText(secTrail.count, trailCount);
    }

    syncTimer();
    refreshLazy(false);
  }

  update(a);

  return {
    el,
    update,
    setExpanded: (v) => setExpanded(v, false),
    isExpanded: () => expanded,
    /** Stop timers (call when the card is discarded). */
    dispose() {
      stopTimer();
      if (reportTimer) clearTimeout(reportTimer);
      if (thinkingTimer) clearTimeout(thinkingTimer);
      reportTimer = 0;
      thinkingTimer = 0;
    },
  };
}
