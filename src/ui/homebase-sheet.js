// The Home base sheet (v7.6, SPEC §24): what the Jarvis Core does in the background, in four tabs:
// Briefing (the latest morning briefing; make one now), Research (ask the home base to research
// something, quick or deep; live status while the sheet is open; open a result: its Markdown,
// rendered safely, and its sources; cancel), Watching (add, check now and remove watchers) and
// Spending (today and this month against the home base's own limits). Opened from the home base tile
// (the home and the rail), a deep link (?homebase=job:<id> | briefing | watch:<id>), a notification,
// the morning card and the chat.
//
//   const view = createHomeBaseView(brain, { tab, jobId, watchId, onSettings, toast });
//   view.el · view.show(tab, { jobId, watchId }) · view.destroy()
//
// States: not linked, the Core unreachable or down, a Core without the brain (1.0: "needs an update"),
// no key (free features only, with one "Give the home base your key"), over the limit. Polls only
// while open, only while something is running (every 3 s), never while the page is hidden.
// All text reaches the page through dom.js helpers (textContent); a result's Markdown goes through
// src/lib/markdown.js (no HTML, safe links only). Never innerHTML.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { renderMarkdown } from '../lib/markdown.js';
import { brainProblem, formatUsd, weatherLine, safeUrl, JOB_PROMPT_MAX, WATCH_WHAT_MAX, WATCH_EVERY } from '../lib/brain.js';

export const HOME_BASE_TABS = Object.freeze([
  { id: 'briefing', label: 'Briefing', icon: 'sparkle' },
  { id: 'research', label: 'Research', icon: 'search' },
  { id: 'watching', label: 'Watching', icon: 'eye' },
  { id: 'spending', label: 'Spending', icon: 'dollar' },
]);
const POLL_MS = 3000;
const CHECK_POLL_LIMIT_MS = 3 * 60 * 1000;
const EVERY_LABELS = { '6h': 'Every 6 hours', '12h': 'Every 12 hours', '24h': 'Once a day' };

function safe(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    try {
      console.warn('[jarvis] home base sheet:', err);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

function when(ms) {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    const today = new Date();
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return time;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
  } catch {
    return '';
  }
}

function pageHidden() {
  try {
    return document.visibilityState === 'hidden';
  } catch {
    return false;
  }
}

function outLink(url, text, cls) {
  const href = safeUrl(url);
  // Not a web address: its words, not looking like a link.
  if (!href) return h('span', { class: 'hbs-text', text });
  return h('a', { class: cls, href, text, attrs: { target: '_blank', rel: 'noopener noreferrer' } });
}

/** replaceChildren() without the empty parts (it would write "null"). */
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false && k !== ''));
}

/**
 * A remove button that asks once more: the first tap turns it into "Remove?" for 4 seconds, the
 * second removes (what the home base found is never lost to a stray tap).
 */
function removeButton({ testid, label, confirmText = 'Remove?', onConfirm }) {
  let armed = 0;
  const text = h('span', { class: 'hbs-remove__text', hidden: true, text: confirmText });
  const btn = h(
    'button',
    {
      class: 'icon-btn hbs-remove',
      type: 'button',
      attrs: { 'data-testid': testid, 'aria-label': label },
      on: {
        click: () => {
          if (armed) {
            clearTimeout(armed);
            armed = 0;
            onConfirm();
            return;
          }
          btn.dataset.confirm = 'true';
          text.hidden = false;
          btn.setAttribute('aria-label', `${confirmText} Tap again to confirm.`);
          armed = setTimeout(() => {
            armed = 0;
            btn.dataset.confirm = 'false';
            text.hidden = true;
            btn.setAttribute('aria-label', label);
          }, 4000);
        },
      },
    },
    icon('trash', { size: 16 }),
    text,
  );
  return btn;
}

function msg(el, text, tone = 'info') {
  el.hidden = !text;
  el.dataset.tone = tone;
  setText(el, text || '');
}

function bar(fraction, tone) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  return h('div', { class: 'hbs-bar', dataset: { tone }, attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'hbs-bar__fill', style: { width: `${Math.round(f * 100)}%` } }));
}

/**
 * The sheet's content. `brain` is the controller (src/ui/brain.js). onSettings(focus) opens Settings →
 * Home base (focus: 'key' | 'limits'). toast(msg, opts) for short confirmations.
 */
export function createHomeBaseView(brain, { tab = 'briefing', jobId = '', watchId = '', onSettings, toast } = {}) {
  let current = HOME_BASE_TABS.some((t) => t.id === tab) ? tab : 'briefing';
  let destroyed = false;
  let pollTimer = 0;
  let jobs = [];
  let jobsLoaded = false;
  let watchers = [];
  let watchersLoaded = false;
  let openJob = null; // the result on screen: { id, job }
  const checking = new Map(); // watcher id -> { since, lastCheckAt }
  let depth = 'quick';
  let focusWatch = watchId || '';
  const say = (text, opts) => safe(() => typeof toast === 'function' && toast(text, opts));
  const openSettings = (focus) => safe(() => typeof onSettings === 'function' && onSettings(focus));

  // ---- the banner (states) --------------------------------------------------------------------
  const bannerText = h('p', { class: 'hbs-banner__text', attrs: { 'data-testid': 'brain-banner-text' } });
  const bannerBtn = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'brain-banner-action' }, on: { click: () => bannerAction() } }, h('span'));
  const banner = h('div', { class: 'hbs-banner', hidden: true, attrs: { 'data-testid': 'brain-banner', role: 'status' } }, icon('info', { size: 16 }), h('div', { class: 'hbs-banner__body' }, bannerText, bannerBtn));
  let bannerKind = '';

  function bannerAction() {
    if (bannerKind === 'nokey' || bannerKind === 'badkey') openSettings('key');
    else if (bannerKind === 'cap') openSettings('limits');
    else if (bannerKind === 'unset') openSettings('url');
    else {
      brain.load({ force: true });
      refreshTab();
    }
  }

  function renderBanner() {
    const st = brain.getState();
    let kind = '';
    let text = '';
    let action = '';
    if (st.phase === 'unset') [kind, text, action] = ['unset', 'Link your home base first.', 'Set up'];
    else if (st.phase === 'failed' && st.problem) {
      kind = st.problem.state;
      text = st.problem.message;
      action = kind === 'old' ? '' : 'Try again';
    } else if (st.brain) {
      const b = st.brain;
      if (!b.key.set) [kind, text, action] = ['nokey', 'Research and watching need your Claude key on the home base. The briefing and the system report are free and work without it.', 'Give the home base your key'];
      else if (b.spend.capReached) {
        const limit = b.spend.capReached === 'monthly' ? `${formatUsd(b.limits.monthlyUsd)} a month` : `${formatUsd(b.limits.dailyUsd)} a day`;
        [kind, text, action] = ['cap', `The home base reached its spending limit (${limit}). It won’t start new research or checks until ${b.spend.capReached === 'monthly' ? 'next month' : 'tomorrow'}.`, 'Change the limits'];
      } else if (!b.sdk) [kind, text, action] = ['sdk', 'The home base can’t talk to Claude yet: its Claude software isn’t installed. On the Alienware, run jarvis-core update.', ''];
    }
    bannerKind = kind;
    banner.hidden = !kind;
    banner.dataset.state = kind;
    setText(bannerText, text);
    setText(bannerBtn.lastChild, action);
    bannerBtn.hidden = !action;
  }

  // ---- tabs ------------------------------------------------------------------------------------
  const tabButtons = {};
  const panels = {};
  const tablist = h(
    'div',
    { class: 'hbs-tabs', attrs: { role: 'tablist', 'aria-label': 'Home base' } },
    HOME_BASE_TABS.map((t) => {
      const b = h(
        'button',
        {
          class: 'hbs-tab',
          type: 'button',
          id: `hbs-tab-${t.id}`,
          attrs: { role: 'tab', 'aria-controls': `hbs-panel-${t.id}`, 'data-testid': `brain-tab-${t.id}` },
          on: { click: () => show(t.id), keydown: (e) => onTabKey(e, t.id) },
        },
        icon(t.icon, { size: 15 }),
        h('span', { text: t.label }),
      );
      tabButtons[t.id] = b;
      return b;
    }),
  );
  function onTabKey(e, id) {
    const ids = HOME_BASE_TABS.map((t) => t.id);
    const i = ids.indexOf(id);
    let next = null;
    if (e.key === 'ArrowRight') next = ids[(i + 1) % ids.length];
    else if (e.key === 'ArrowLeft') next = ids[(i + ids.length - 1) % ids.length];
    if (!next) return;
    e.preventDefault();
    show(next);
    safe(() => tabButtons[next].focus());
  }
  const panel = (id, ...children) => {
    const el = h('div', { class: 'hbs-panel', id: `hbs-panel-${id}`, hidden: true, attrs: { role: 'tabpanel', 'aria-labelledby': `hbs-tab-${id}`, 'data-testid': `brain-panel-${id}` } }, ...children);
    panels[id] = el;
    return el;
  };

  // ---- Briefing ---------------------------------------------------------------------------------
  const briefBody = h('div', { class: 'hbs-briefing', attrs: { 'data-testid': 'brain-briefing' } });
  const briefMsg = h('p', { class: 'hbs-msg', hidden: true, attrs: { 'data-testid': 'brain-briefing-msg', 'aria-live': 'polite' } });
  const briefRun = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'brain-briefing-run' }, on: { click: () => runBriefing() } }, icon('refresh', { size: 14 }), h('span', { text: 'Make a new one now' }));
  let briefBusy = false;

  function renderBriefing(v) {
    if (!v) {
      fill(briefBody);
      return;
    }
    const wx = weatherLine(v.weather);
    const section = (title, ...kids) => h('section', { class: 'hbs-bsec' }, h('h4', { class: 'hbs-bsec__title hud-label', text: title }), ...kids);
    const items = (list, fn) => h('ul', { class: 'hbs-list' }, list.map((x) => h('li', { class: 'hbs-list__item' }, ...fn(x))));
    fill(
      briefBody,
      h('h3', { class: 'hbs-greeting', text: v.greeting, attrs: { 'data-testid': 'brain-briefing-greeting' } }),
      wx ? h('p', { class: 'hbs-weather', attrs: { 'data-testid': 'brain-briefing-weather' } }, icon('globe', { size: 14 }), h('span', { text: `${v.weather.label ? `${v.weather.label}: ` : ''}${wx}${v.weather.summary ? `. ${v.weather.summary}` : ''}` })) : null,
      v.headlines.length ? section('Headlines', items(v.headlines, (x) => [outLink(x.url, x.title, 'hbs-link'), x.source ? h('span', { class: 'hbs-src', text: ` · ${x.source}` }) : null])) : null,
      v.homebase && (v.homebase.summary || v.homebase.notes.length)
        ? section('Overnight at the home base', v.homebase.summary ? h('p', { class: 'hbs-p', text: v.homebase.summary, dataset: { level: v.homebase.level } }) : null, v.homebase.notes.length ? items(v.homebase.notes, (n) => [n]) : null)
        : null,
      v.jobs.length ? section('Research', items(v.jobs, (j) => [h('strong', { text: j.title || 'Research' }), j.summary ? `: ${j.summary}` : ''])) : null,
      v.watchers.length ? section('Watching', items(v.watchers, (w) => [h('strong', { text: w.what }), w.summary ? `: ${w.summary}` : ''])) : null,
      v.whatsNew.length ? section('What’s new', items(v.whatsNew, (x) => [h('strong', { text: x.title }), x.detail ? `: ${x.detail}` : ''])) : null,
      v.music ? section('Music', h('p', { class: 'hbs-p' }, v.music.url ? outLink(v.music.url, v.music.suggestion || 'Open in Apple Music', 'hbs-link') : h('span', { text: v.music.suggestion }))) : null,
      h('p', { class: 'hbs-foot', text: `${v.generatedAt ? `Made ${when(v.generatedAt)}` : 'Made by your home base'} · ${v.kind === 'full' ? 'written with Claude' : 'free version (no Claude)'}` }),
    );
  }

  async function loadBriefing() {
    msg(briefMsg, briefBody.childElementCount ? '' : 'Loading the briefing…', 'busy');
    const r = await brain.call('getBriefing');
    if (destroyed) return;
    if (r && r.ok) {
      briefRun.hidden = false;
      msg(briefMsg, '');
      renderBriefing(r.briefing);
      safe(() => brain.dismissMorning(r.briefing));
      return;
    }
    const p = brainProblem(r);
    renderBriefing(null);
    showProblem(p);
  }

  /** A failure in the tab. A 1.0 Core can't make one either: no button, and the banner says it once. */
  function showProblem(p) {
    const old = p.state === 'old';
    briefRun.hidden = old;
    if (old) renderBanner();
    msg(briefMsg, old && bannerKind === 'old' ? '' : p.message, p.state === 'none' ? 'info' : 'warn');
  }

  async function runBriefing() {
    if (briefBusy) return;
    briefBusy = true;
    briefRun.disabled = true;
    msg(briefMsg, 'The home base is making your briefing… this can take a minute.', 'busy');
    const r = await brain.call('runBriefing');
    briefBusy = false;
    briefRun.disabled = false;
    if (destroyed) return;
    if (r && r.ok) {
      msg(briefMsg, '');
      renderBriefing(r.briefing);
      safe(() => brain.dismissMorning(r.briefing));
      brain.load({ force: true });
      return;
    }
    showProblem(brainProblem(r, { limits: limitsNow() }));
  }

  panel('briefing', briefMsg, briefBody, h('div', { class: 'hbs-actions' }, briefRun));

  // ---- Research ---------------------------------------------------------------------------------
  const rInput = h('textarea', {
    class: 'input hbs-textarea',
    rows: 3,
    maxLength: JOB_PROMPT_MAX,
    placeholder: 'Ask the home base to research…',
    attrs: { 'data-testid': 'brain-research-input', 'aria-label': 'What should the home base research?', autocapitalize: 'sentences', enterkeyhint: 'send' },
  });
  const depthBtn = (id, label, help) => {
    const radio = h('input', { type: 'radio', name: 'hbs-depth', value: id, checked: id === depth, attrs: { 'data-testid': `brain-depth-${id}` }, on: { change: () => (depth = id) } });
    return h('label', { class: 'hbs-depth' }, radio, h('span', { class: 'hbs-depth__text' }, h('strong', { text: label }), h('span', { class: 'hbs-depth__help', text: help })));
  };
  const rStart = h('button', { class: 'btn btn-primary', type: 'submit', attrs: { 'data-testid': 'brain-research-start' } }, icon('sparkle', { size: 15 }), h('span', { text: 'Start research' }));
  const rMsg = h('p', { class: 'hbs-msg', hidden: true, attrs: { 'data-testid': 'brain-research-msg', 'aria-live': 'polite' } });
  const rForm = h(
    'form',
    { class: 'hbs-form', attrs: { 'data-testid': 'brain-research-form' }, on: { submit: (e) => startResearch(e) } },
    rInput,
    h('div', { class: 'hbs-depths', attrs: { role: 'radiogroup', 'aria-label': 'How thorough' } }, depthBtn('quick', 'Quick', 'A few minutes, a few searches.'), depthBtn('deep', 'Deep', 'Reads more and thinks longer. Costs more.')),
    h('div', { class: 'hbs-actions' }, rStart),
    h('p', { class: 'hbs-note', text: 'Keeps going while your phone is locked. It stops at the home base’s daily spending limit and lets you know when it’s done.' }),
    rMsg,
  );
  const jobList = h('ul', { class: 'hbs-items', attrs: { 'data-testid': 'brain-jobs', 'aria-label': 'Research' } });
  const jobEmpty = h('p', { class: 'hbs-empty', hidden: true, attrs: { 'data-testid': 'brain-jobs-empty' }, text: 'Nothing yet. Ask the home base a question above.' });
  const resultEl = h('div', { class: 'hbs-result', hidden: true, attrs: { 'data-testid': 'brain-result' } });
  const researchList = h('div', { class: 'hbs-research-list' }, rForm, h('h4', { class: 'hbs-subtitle hud-label', text: 'Recent' }), jobEmpty, jobList);
  panel('research', researchList, resultEl);
  // Enter starts it (the iPhone keyboard's key says "send"); Shift+Enter is a new line.
  rInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    rForm.requestSubmit ? rForm.requestSubmit() : startResearch(e);
  });

  let starting = false;
  async function startResearch(e) {
    if (e) e.preventDefault();
    if (starting) return;
    const prompt = rInput.value.trim();
    if (!prompt) {
      msg(rMsg, 'Type what the home base should research first.', 'warn');
      safe(() => rInput.focus());
      return;
    }
    starting = true;
    rStart.disabled = true;
    msg(rMsg, 'Handing it to the home base…', 'busy');
    const r = await brain.call('startJob', { prompt, depth });
    starting = false;
    rStart.disabled = false;
    if (destroyed) return;
    if (r && r.ok) {
      rInput.value = '';
      msg(rMsg, `Started. The home base is on it${depth === 'deep' ? ' (deep research takes a while)' : ''}; it will let you know when it’s done.`, 'ok');
      jobs = [r.job, ...jobs.filter((j) => j.id !== r.job.id)];
      jobsLoaded = true;
      renderJobs();
      schedulePoll(true);
      brain.load({ force: true });
      return;
    }
    msg(rMsg, brainProblem(r, { limits: limitsNow() }).message, 'warn');
    if (r && r.kind === 'http' && (r.status === 409 || r.status === 402)) brain.load({ force: true });
  }

  function jobRow(j) {
    const meta = [];
    if (j.status === 'done' && j.finishedAt) meta.push(`finished ${when(j.finishedAt)}`);
    else if (j.status === 'running' && j.startedAt) meta.push(`started ${when(j.startedAt)}`);
    else if (j.createdAt) meta.push(`asked ${when(j.createdAt)}`);
    meta.push(j.depth === 'deep' ? 'deep' : 'quick');
    if (j.costUsd !== null && j.costUsd > 0) meta.push(formatUsd(j.costUsd));
    const actions = [];
    if (j.status === 'done') actions.push(h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'brain-job-open' }, on: { click: () => openResult(j.id) } }, h('span', { text: 'Open' })));
    if (j.active) actions.push(h('button', { class: 'btn btn-sm btn-danger-ghost', type: 'button', attrs: { 'data-testid': 'brain-job-cancel' }, on: { click: () => removeJob(j, true) } }, h('span', { text: 'Cancel' })));
    else actions.push(removeButton({ testid: 'brain-job-remove', label: `Remove “${j.title}” from the list`, onConfirm: () => removeJob(j, false) }));
    const detail = j.status === 'failed' || j.status === 'blocked' ? (j.error && j.error.message) || j.summary : j.summary;
    return h(
      'li',
      { class: 'hbs-item', dataset: { id: j.id, status: j.status }, attrs: { 'data-testid': 'brain-job' } },
      h('div', { class: 'hbs-item__main' }, h('div', { class: 'hbs-item__head' }, h('strong', { class: 'hbs-item__title', text: j.title }), h('span', { class: 'hbs-chip', dataset: { status: j.status }, attrs: { 'data-testid': 'brain-job-status' }, text: j.statusWord })), detail ? h('p', { class: 'hbs-item__text', text: detail }) : null, h('p', { class: 'hbs-item__meta', text: meta.join(' · ') })),
      h('div', { class: 'hbs-item__actions' }, ...actions),
    );
  }

  function renderJobs() {
    const list = jobs.filter((j) => j.kind === 'research');
    fill(jobList, ...list.map(jobRow));
    jobEmpty.hidden = !jobsLoaded || list.length > 0;
  }

  async function loadJobs() {
    const r = await brain.call('listJobs');
    if (destroyed) return false;
    if (r && r.ok) {
      jobs = r.jobs;
      jobsLoaded = true;
      renderJobs();
      return true;
    }
    if (!jobsLoaded) msg(rMsg, brainProblem(r).message, 'warn');
    return false;
  }

  async function removeJob(j, cancel) {
    const r = await brain.call('deleteJob', j.id);
    if (destroyed) return;
    if (r && r.ok) {
      say(cancel ? 'Research cancelled.' : 'Removed from the list.', { level: 'info' });
      if (cancel) jobs = jobs.map((x) => (x.id === j.id ? { ...x, status: 'cancelled', statusWord: 'Cancelled', active: false } : x));
      else jobs = jobs.filter((x) => x.id !== j.id);
      renderJobs();
      if (openJob && openJob.id === j.id) closeResult();
      loadJobs();
      return;
    }
    say(brainProblem(r).message, { level: 'warn' });
  }

  async function openResult(id) {
    openJob = { id, job: null };
    researchList.hidden = true;
    resultEl.hidden = false;
    fill(resultEl, h('p', { class: 'hbs-msg', dataset: { tone: 'busy' }, text: 'Opening the result…' }));
    const r = await brain.call('getJob', id);
    if (destroyed || !openJob || openJob.id !== id) return;
    if (!r || !r.ok) {
      const p = brainProblem(r);
      fill(resultEl, backBtn(), h('p', { class: 'hbs-msg', dataset: { tone: 'warn' }, attrs: { 'data-testid': 'brain-result-msg' }, text: r && r.kind === 'http' && r.status === 404 ? 'That research isn’t on the home base any more.' : p.message }));
      return;
    }
    openJob.job = r.job;
    renderResult(r.job);
    if (r.job.active) schedulePoll(true);
  }

  function backBtn() {
    return h('button', { class: 'btn btn-sm hbs-back', type: 'button', attrs: { 'data-testid': 'brain-result-back' }, on: { click: () => closeResult() } }, icon('chevron-left', { size: 14 }), h('span', { text: 'All research' }));
  }

  function renderResult(j) {
    const meta = [j.statusWord, j.depth === 'deep' ? 'deep' : 'quick'];
    if (j.finishedAt) meta.push(when(j.finishedAt));
    if (j.costUsd !== null && j.costUsd > 0) meta.push(formatUsd(j.costUsd));
    const body = h('div', { class: 'hbs-result__body prose', attrs: { 'data-testid': 'brain-result-body' } });
    if (j.result && j.result.markdown) body.appendChild(renderMarkdown(j.result.markdown));
    else body.appendChild(h('p', { class: 'hbs-p', text: j.active ? 'Still working on it. This page updates by itself.' : (j.error && j.error.message) || j.summary || 'No result.' }));
    const sources = j.result && j.result.sources.length ? h('section', { class: 'hbs-bsec' }, h('h4', { class: 'hbs-bsec__title hud-label', text: 'Sources' }), h('ol', { class: 'hbs-sources', attrs: { 'data-testid': 'brain-result-sources' } }, j.result.sources.map((s) => h('li', {}, outLink(s.url, s.title, 'hbs-link'))))) : null;
    fill(
      resultEl,
      backBtn(),
      h('h3', { class: 'hbs-result__title', text: j.title, attrs: { 'data-testid': 'brain-result-title' } }),
      h('p', { class: 'hbs-item__meta', text: meta.join(' · ') }),
      j.prompt && j.prompt !== j.title ? h('p', { class: 'hbs-prompt', text: `You asked: ${j.prompt}` }) : null,
      body,
      sources,
      j.active ? h('div', { class: 'hbs-actions' }, h('button', { class: 'btn btn-sm btn-danger-ghost', type: 'button', attrs: { 'data-testid': 'brain-result-cancel' }, on: { click: () => removeJob(j, true) } }, h('span', { text: 'Cancel' }))) : null,
    );
  }

  function closeResult() {
    openJob = null;
    resultEl.hidden = true;
    fill(resultEl);
    researchList.hidden = false;
  }

  // ---- Watching ---------------------------------------------------------------------------------
  const wInput = h('input', {
    class: 'input',
    type: 'text',
    maxLength: WATCH_WHAT_MAX,
    placeholder: 'e.g. the LG 27GP850 drops under $300',
    attrs: { 'data-testid': 'brain-watch-input', 'aria-label': 'What should the home base watch for?', autocapitalize: 'sentences', enterkeyhint: 'done' },
  });
  const wEvery = h(
    'select',
    { class: 'input hbs-select', attrs: { 'data-testid': 'brain-watch-every', 'aria-label': 'How often to check' } },
    WATCH_EVERY.map((e) => h('option', { value: e, text: EVERY_LABELS[e], selected: e === '24h' })),
  );
  const wAdd = h('button', { class: 'btn btn-primary', type: 'submit', attrs: { 'data-testid': 'brain-watch-add' } }, icon('eye', { size: 15 }), h('span', { text: 'Watch for it' }));
  const wMsg = h('p', { class: 'hbs-msg', hidden: true, attrs: { 'data-testid': 'brain-watch-msg', 'aria-live': 'polite' } });
  const wForm = h(
    'form',
    { class: 'hbs-form', attrs: { 'data-testid': 'brain-watch-form' }, on: { submit: (e) => addWatch(e) } },
    h('label', { class: 'hbs-label', text: 'Tell me when…' }),
    wInput,
    h('div', { class: 'hbs-row' }, wEvery, wAdd),
    h('p', { class: 'hbs-note', text: 'The home base checks the web for it and notifies you once, when it happens. Each check is one small Claude call.' }),
    wMsg,
  );
  const watchList = h('ul', { class: 'hbs-items', attrs: { 'data-testid': 'brain-watchers', 'aria-label': 'Watching' } });
  const watchEmpty = h('p', { class: 'hbs-empty', hidden: true, attrs: { 'data-testid': 'brain-watchers-empty' }, text: 'Nothing is being watched.' });
  panel('watching', wForm, h('h4', { class: 'hbs-subtitle hud-label', text: 'Watching now' }), watchEmpty, watchList);

  let adding = false;
  async function addWatch(e) {
    if (e) e.preventDefault();
    if (adding) return;
    const what = wInput.value.trim();
    if (!what) {
      msg(wMsg, 'Type what the home base should watch for first.', 'warn');
      safe(() => wInput.focus());
      return;
    }
    adding = true;
    wAdd.disabled = true;
    msg(wMsg, 'Telling the home base…', 'busy');
    const r = await brain.call('addWatcher', { what, every: wEvery.value });
    adding = false;
    wAdd.disabled = false;
    if (destroyed) return;
    if (r && r.ok) {
      wInput.value = '';
      msg(wMsg, `Watching. The home base checks ${EVERY_LABELS[r.watcher.every].toLowerCase()} and lets you know when it happens.`, 'ok');
      watchers = [r.watcher, ...watchers.filter((w) => w.id !== r.watcher.id)];
      watchersLoaded = true;
      renderWatchers();
      brain.load({ force: true });
      return;
    }
    msg(wMsg, brainProblem(r, { limits: limitsNow() }).message, 'warn');
  }

  function watcherRow(w) {
    const meta = [EVERY_LABELS[w.every]];
    if (w.lastCheckAt) meta.push(`checked ${when(w.lastCheckAt)}`);
    if (w.status === 'watching' && w.nextCheckAt) meta.push(`next ${when(w.nextCheckAt)}`);
    if (w.costUsd !== null && w.costUsd > 0) meta.push(formatUsd(w.costUsd));
    const pending = checking.has(w.id);
    const result = w.lastResult && w.lastResult.summary ? h('p', { class: 'hbs-item__text', text: w.lastResult.summary }) : null;
    const src = w.lastResult && w.lastResult.sources.length ? h('p', { class: 'hbs-item__meta' }, outLink(w.lastResult.sources[0].url, w.lastResult.sources[0].title, 'hbs-link')) : null;
    return h(
      'li',
      { class: ['hbs-item', focusWatch === w.id && 'is-focus'], dataset: { id: w.id, status: w.status }, attrs: { 'data-testid': 'brain-watcher' } },
      h('div', { class: 'hbs-item__main' }, h('div', { class: 'hbs-item__head' }, h('strong', { class: 'hbs-item__title', text: w.what }), h('span', { class: 'hbs-chip', dataset: { status: w.status }, attrs: { 'data-testid': 'brain-watcher-status' }, text: pending ? 'Checking…' : w.statusWord })), result, src, h('p', { class: 'hbs-item__meta', text: meta.join(' · ') })),
      h(
        'div',
        { class: 'hbs-item__actions' },
        w.status === 'watching' || w.status === 'blocked' ? h('button', { class: 'btn btn-sm', type: 'button', disabled: pending, attrs: { 'data-testid': 'brain-watcher-check' }, on: { click: () => checkNow(w) } }, h('span', { text: pending ? 'Checking…' : 'Check now' })) : null,
        removeButton({ testid: 'brain-watcher-remove', label: `Stop watching for “${w.what}”`, confirmText: 'Stop?', onConfirm: () => removeWatch(w) }),
      ),
    );
  }

  function renderWatchers() {
    fill(watchList, ...watchers.map(watcherRow));
    watchEmpty.hidden = !watchersLoaded || watchers.length > 0;
    if (focusWatch) {
      const row = watchList.querySelector(`[data-id="${CSS && CSS.escape ? CSS.escape(focusWatch) : focusWatch}"]`);
      if (row) safe(() => row.scrollIntoView({ block: 'nearest' }));
    }
  }

  async function loadWatchers() {
    const r = await brain.call('listWatchers');
    if (destroyed) return false;
    if (r && r.ok) {
      watchers = r.watchers;
      watchersLoaded = true;
      for (const [id, c] of [...checking]) {
        const w = watchers.find((x) => x.id === id);
        if (!w || w.lastCheckAt !== c.lastCheckAt || Date.now() - c.since > CHECK_POLL_LIMIT_MS) checking.delete(id);
      }
      renderWatchers();
      return true;
    }
    if (!watchersLoaded) msg(wMsg, brainProblem(r).message, 'warn');
    return false;
  }

  async function checkNow(w) {
    checking.set(w.id, { since: Date.now(), lastCheckAt: w.lastCheckAt });
    renderWatchers();
    const r = await brain.call('checkWatcher', w.id);
    if (destroyed) return;
    if (!r || !r.ok) {
      checking.delete(w.id);
      renderWatchers();
      say(brainProblem(r, { limits: limitsNow() }).message, { level: 'warn' });
      return;
    }
    if (r.watcher && r.watcher.lastCheckAt && r.watcher.lastCheckAt !== w.lastCheckAt) {
      checking.delete(w.id);
      watchers = watchers.map((x) => (x.id === w.id ? r.watcher : x));
      renderWatchers();
      return;
    }
    schedulePoll(true);
  }

  async function removeWatch(w) {
    const r = await brain.call('deleteWatcher', w.id);
    if (destroyed) return;
    if (r && r.ok) {
      watchers = watchers.filter((x) => x.id !== w.id);
      checking.delete(w.id);
      renderWatchers();
      say('Stopped watching.', { level: 'info' });
      brain.load({ force: true });
      return;
    }
    say(brainProblem(r).message, { level: 'warn' });
  }

  // ---- Spending ---------------------------------------------------------------------------------
  const spendToday = h('div', { class: 'hbs-spend', attrs: { 'data-testid': 'brain-spend-today' } });
  const spendMonth = h('div', { class: 'hbs-spend', attrs: { 'data-testid': 'brain-spend-month' } });
  const spendDays = h('ul', { class: 'hbs-days', attrs: { 'data-testid': 'brain-spend-days', 'aria-label': 'The last 30 days' } });
  const spendMsg = h('p', { class: 'hbs-msg', hidden: true, attrs: { 'data-testid': 'brain-spend-msg' } });
  const spendLimits = h('button', { class: 'btn btn-sm', type: 'button', attrs: { 'data-testid': 'brain-spend-limits' }, on: { click: () => openSettings('limits') } }, icon('settings', { size: 14 }), h('span', { text: 'Change the limits' }));
  panel(
    'spending',
    spendToday,
    spendMonth,
    h('p', { class: 'hbs-note', text: 'Only what the home base spends on its own (research, watching, the briefing). Jarvis’s answers on this device are in Settings → API key & spending.' }),
    h('div', { class: 'hbs-actions' }, spendLimits),
    h('h4', { class: 'hbs-subtitle hud-label', text: 'The last 30 days' }),
    spendMsg,
    spendDays,
  );

  function limitsNow() {
    const st = brain.getState();
    return st.brain ? st.brain.limits : null;
  }

  function renderSpend() {
    const st = brain.getState();
    const b = st.brain;
    const block = (el, label, used, limit, reached) => {
      const frac = limit ? (used || 0) / limit : 0;
      fill(
        el,
        h('div', { class: 'hbs-spend__head' }, h('span', { class: 'hud-label', text: label }), h('span', { class: 'hbs-spend__figure' }, h('strong', { text: formatUsd(used) }), h('span', { class: 'hbs-spend__of', text: limit !== null ? ` of ${formatUsd(limit)}` : '' }))),
        bar(frac, reached ? 'err' : frac >= 0.8 ? 'warn' : 'ok'),
      );
      el.dataset.reached = reached ? 'true' : 'false';
    };
    if (!b) {
      spendToday.replaceChildren();
      spendMonth.replaceChildren();
      return;
    }
    block(spendToday, 'Today', b.spend.todayUsd, b.limits.dailyUsd, b.spend.capReached === 'daily');
    block(spendMonth, 'This month', b.spend.monthUsd, b.limits.monthlyUsd, b.spend.capReached === 'monthly');
  }

  async function loadSpend() {
    const r = await brain.call('getSpendDays', 30);
    if (destroyed) return;
    if (!r || !r.ok) {
      msg(spendMsg, brainProblem(r).message, 'warn');
      return;
    }
    const days = r.days.filter((d) => d.usd > 0);
    msg(spendMsg, days.length ? '' : 'Nothing spent in the last 30 days.', 'info');
    const max = Math.max(0.01, ...days.map((d) => d.usd));
    fill(
      spendDays,
      ...days.map((d) => {
        let label = d.day;
        try {
          label = new Date(`${d.day}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
        } catch {
          /* keep the ISO day */
        }
        return h('li', { class: 'hbs-day' }, h('span', { class: 'hbs-day__label', text: label }), bar(d.usd / max, 'ok'), h('span', { class: 'hbs-day__usd', text: formatUsd(d.usd) }));
      }),
    );
  }

  // ---- polling (only while open, visible and something is running) ----------------------------------
  function needsPoll() {
    if (current === 'research') return jobs.some((j) => j.active) || !!(openJob && openJob.job && openJob.job.active);
    if (current === 'watching') return checking.size > 0;
    return false;
  }

  function schedulePoll(force = false) {
    clearTimeout(pollTimer);
    pollTimer = 0;
    if (destroyed || (!force && !needsPoll())) return;
    pollTimer = setTimeout(pollOnce, POLL_MS);
  }

  async function pollOnce() {
    pollTimer = 0;
    if (destroyed) return;
    if (pageHidden()) {
      schedulePoll(true);
      return;
    }
    if (current === 'research') {
      await loadJobs();
      if (openJob && openJob.job && openJob.job.active) {
        const r = await brain.call('getJob', openJob.id);
        if (!destroyed && openJob && r && r.ok) {
          openJob.job = r.job;
          renderResult(r.job);
        }
      }
    } else if (current === 'watching') await loadWatchers();
    schedulePoll();
  }

  const onVisibility = () => {
    if (!pageHidden() && needsPoll() && !pollTimer) schedulePoll(true);
  };
  safe(() => document.addEventListener('visibilitychange', onVisibility));

  // ---- show a tab ---------------------------------------------------------------------------------
  function refreshTab() {
    if (current === 'briefing') loadBriefing();
    else if (current === 'research') loadJobs().then(() => schedulePoll());
    else if (current === 'watching') loadWatchers().then(() => schedulePoll());
    else if (current === 'spending') {
      renderSpend();
      loadSpend();
    }
  }

  function show(id, { jobId: jid = '', watchId: wid = '' } = {}) {
    if (!panels[id]) return;
    current = id;
    for (const t of HOME_BASE_TABS) {
      const on = t.id === id;
      panels[t.id].hidden = !on;
      tabButtons[t.id].setAttribute('aria-selected', on ? 'true' : 'false');
      tabButtons[t.id].tabIndex = on ? 0 : -1;
      tabButtons[t.id].classList.toggle('is-on', on);
    }
    if (wid) focusWatch = wid;
    if (id === 'research' && jid) openResult(jid);
    else if (id === 'research' && openJob) closeResult();
    refreshTab();
  }

  const el = h('div', { class: 'hbs', attrs: { 'data-testid': 'brain-view' } }, banner, tablist, h('div', { class: 'hbs-panels' }, ...HOME_BASE_TABS.map((t) => panels[t.id])));

  const off = brain.subscribe(() => {
    renderBanner();
    if (current === 'spending') renderSpend();
  });
  renderBanner();
  brain.load({ force: true }).then(() => {
    if (!destroyed) {
      renderBanner();
      if (current === 'spending') renderSpend();
    }
  });
  show(current, { jobId, watchId });

  return {
    el,
    show,
    current: () => current,
    destroy() {
      destroyed = true;
      clearTimeout(pollTimer);
      safe(() => document.removeEventListener('visibilitychange', onVisibility));
      if (typeof off === 'function') off();
    },
  };
}
