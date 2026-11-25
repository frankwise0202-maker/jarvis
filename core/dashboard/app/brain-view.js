// The home base brain on screen: the HOME BASE strip (key, spend, watchers), the missions list, the
// remote viewers' "Morning briefing" panel, the tabs that share the kiosk layout's bottom-left place,
// and the kiosk's full-screen morning mode. Built once and updated in place; lists are rebuilt only
// when what they show changes (a new briefing, a job that moved on), never on every tick.

import { $, el, setData, setHidden, setText } from './dom.js';
import { fmtDegrees, fmtUsd, greetingFor, briefingLead, jobStatus, keyState, missionRows, spendState, watcherState, MISSION_ROWS } from './brain.js';
import { clockParts, fmtDate, fmtPct, keepUnits, num, SEP } from './format.js';

const KEY_LINE = 'Give the home base your key from Jarvis on your iPhone to unlock background research.';

/** A short time for a mission: "6:12 AM" today, "Tue 9:47 PM" this week, "Nov 14" before. */
const dtfCache = new Map();
function dtf(locale, o) {
  const k = `${locale}|${JSON.stringify(o)}`;
  let f = dtfCache.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, o);
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...o, timeZone: undefined });
    }
    dtfCache.set(k, f);
  }
  return f;
}
export function fmtWhen(ms, nowMs, locale, timeZone) {
  const t = num(ms);
  if (t === null) return '';
  const day = (x) => dtf('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(x));
  let o;
  if (day(t) === day(nowMs)) o = { hour: 'numeric', minute: '2-digit' };
  else if (Math.abs(nowMs - t) < 6 * 86400000) o = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
  else o = { month: 'short', day: 'numeric' };
  if (timeZone) o.timeZone = timeZone;
  return dtf(locale, o).format(new Date(t));
}

function meter(node, frac, level) {
  if (!node) return;
  setData(node, 'level', level);
  const f = frac === null || frac === undefined ? 0 : Math.max(0, Math.min(1, frac));
  const v = `scaleX(${f.toFixed(4)})`;
  const bar = node.firstElementChild;
  if (bar && bar.__tf !== v) {
    bar.__tf = v;
    bar.style.transform = v;
  }
}

function chip(node, level, word) {
  if (!node) return;
  setData(node, 'level', level);
  setText(node.lastElementChild, word);
}

/** Replace a list's items (rare: a new briefing). */
function fillList(list, items, make) {
  list.textContent = '';
  for (const it of items) list.append(make(it));
}

const levelOfStatus = (s) => (s === 'met' || s === 'done' ? 'ok' : s === 'failed' ? 'alert' : s === 'blocked' || s === 'paused' ? 'warn' : 'unknown');
const WORD_OF_STATUS = { met: 'MET', done: 'DONE', failed: 'FAILED', blocked: 'BLOCKED', paused: 'PAUSED', watching: 'WATCHING', cancelled: 'CANCELLED', running: 'RUNNING', queued: 'QUEUED' };

function doneItem(it) {
  const li = el('li', 'm-done-item');
  setData(li, 'level', levelOfStatus(it.status));
  const head = el('p', 'm-done-head');
  head.append(el('i', 'lv-icon'), el('span', 'm-done-word', WORD_OF_STATUS[it.status] || String(it.status).toUpperCase()), el('b', 'm-done-title', it.title));
  li.append(head);
  if (it.summary) li.append(el('span', 'm-done-sum', keepUnits(it.summary)));
  return li;
}

/** Research and watchers that finished overnight, one list (met watchers first: good news). */
function finishedItems(b) {
  const w = b.watchers.filter((x) => x.status === 'met' || x.summary).map((x) => ({ title: x.what, status: x.status, summary: x.summary }));
  w.sort((a, c) => (c.status === 'met' ? 1 : 0) - (a.status === 'met' ? 1 : 0));
  const j = b.jobs.map((x) => ({ title: x.title, status: x.status, summary: x.summary }));
  return [...w, ...j].slice(0, 5);
}

function weatherLine(w) {
  if (!w) return null;
  const now = [fmtDegrees(w.temp, w.units), w.summary].filter(Boolean).join(' ');
  const range = [w.high !== null ? `high ${fmtDegrees(w.high, w.units)}` : null, w.low !== null ? `low ${fmtDegrees(w.low, w.units)}` : null, w.rainPct !== null ? `${Math.round(w.rainPct)}% chance of rain` : null].filter(Boolean).join(', ');
  return { now, range };
}

export function createBrainView({ kiosk }) {
  const n = {
    root: document.documentElement,
    brain: $('p-brain'),
    brainSub: $('brain-sub'),
    key: $('bc-key'),
    keyWord: $('bc-key-word'),
    keyText: $('bc-key-text'),
    spend: $('bc-spend'),
    spendLabel: $('bc-spend-label'),
    today: $('bc-today'),
    todayMeter: $('bc-today-meter'),
    month: $('bc-month'),
    monthMeter: $('bc-month-meter'),
    watch: $('bc-watch'),
    watchCount: $('bc-watch-count'),
    watchText: $('bc-watch-text'),
    cap: $('bc-cap'),
    centreBottom: $('centre-bottom'),
    missions: $('p-missions'),
    missionsList: $('missions'),
    missionsEmpty: $('missions-empty'),
    missionsChip: $('missions-chip'),
    briefing: $('p-briefing'),
    procs: $('p-procs'),
    // the remote briefing panel
    briefSub: $('brief-sub'),
    briefGreeting: $('brief-greeting'),
    briefWeather: $('brief-weather'),
    briefLead: $('brief-lead'),
    briefNewsSec: $('brief-news-sec'),
    briefNews: $('brief-news'),
    briefHbSec: $('brief-hb-sec'),
    briefHb: $('brief-hb'),
    briefHbText: $('brief-hb-text'),
    briefHbNotes: $('brief-hb-notes'),
    briefDoneSec: $('brief-done-sec'),
    briefDone: $('brief-done'),
    briefNewSec: $('brief-new-sec'),
    briefNew: $('brief-new'),
    briefMusicSec: $('brief-music-sec'),
    briefMusic: $('brief-music'),
    briefKey: $('brief-key'),
    // morning mode
    morning: $('morning'),
    mState: $('m-state'),
    mStateWord: $('m-state-word'),
    mStateDetail: $('m-state-detail'),
    mVitals: { cpu: [$('m-cpu'), $('m-cpu-v')], gpu: [$('m-gpu'), $('m-gpu-v')], ram: [$('m-ram'), $('m-ram-v')], disk: [$('m-disk'), $('m-disk-v')] },
    mClockTime: $('m-clock-time'),
    mClockPeriod: $('m-clock-period'),
    mClockDate: $('m-clock-date'),
    mKicker: $('m-kicker'),
    mGreeting: $('m-greeting'),
    mLead: $('m-lead'),
    mWeather: $('m-weather'),
    mTemp: $('m-temp'),
    mTempUnit: $('m-temp-unit'),
    mWxNow: $('m-wx-now'),
    mWxRange: $('m-wx-range'),
    mWxPlace: $('m-wx-place'),
    mWxHint: $('m-wx-hint'),
    mCards: $('m-cards'),
    mHeadlines: $('m-headlines'),
    mHb: $('m-hb'),
    mHbText: $('m-hb-text'),
    mHbNotes: $('m-hb-notes'),
    mDoneLabel: $('m-h-done'),
    mDone: $('m-done'),
    mNewCard: $('m-new-card'),
    mWhatsNew: $('m-whatsnew'),
    mNewLabel: $('m-h-new'),
    mMusicLabel: $('m-h-music'),
    mMusic: $('m-music'),
    mWaiting: $('m-waiting'),
    mBigClock: $('m-big-clock'),
    mSummary: $('m-summary'),
    mWaitText: $('m-wait-text'),
    mKey: $('m-key'),
    mHealth: $('m-health'),
    mHealthText: $('m-health-text'),
  };

  // --- the missions list: fixed rows, updated in place ------------------------------------------
  const rows = [];
  for (let i = 0; i < MISSION_ROWS; i++) {
    // [icon] the title ........ its time
    //        DONE · the one-line summary
    const li = el('li', 'mission');
    const icon = el('i', 'lv-icon');
    const title = el('span', 'mission-title', '');
    const when = el('span', 'mission-when mono', '');
    const line = el('span', 'mission-line');
    const word = el('span', 'mission-word', '');
    const sum = el('span', 'mission-sum', '');
    line.append(word, sum);
    li.append(icon, title, when, line);
    li.hidden = true;
    n.missionsList.append(li);
    rows.push({ li, word, title, when, sum });
  }

  // --- tabs (kiosk layout): missions · briefing · processes share one place ---------------------
  const TAB_NAMES = { missions: 'MISSIONS', briefing: 'BRIEFING', procs: 'PROCESSES' };
  const tabPanels = { missions: n.missions, briefing: n.briefing, procs: n.procs };
  let tabAvail = ['procs'];
  let pickedTab = null;
  let pickedAt = 0;
  let front = 'procs';
  const PICK_KEEP_MS = 10 * 60 * 1000;
  function buildTabs() {
    for (const [name, panel] of Object.entries(tabPanels)) {
      const holder = panel.querySelector('.tabs');
      holder.textContent = '';
      if (tabAvail.length < 2) continue;
      for (const other of tabAvail) {
        if (other === name) continue;
        const b = el('button', 'tab', TAB_NAMES[other]);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', 'false');
        b.dataset.tab = other;
        b.addEventListener('click', () => {
          pickedTab = other;
          pickedAt = Date.now();
          showTab(other);
        });
        holder.append(b);
      }
    }
  }
  function showTab(name) {
    front = name;
    setData(n.centreBottom, 'tab', name);
    for (const [k, panel] of Object.entries(tabPanels)) panel.classList.toggle('is-front', k === name);
  }
  /** The tab in front: the viewer's pick for 10 minutes; else processes while the CPU or memory
   *  needs a look (they explain it), the briefing on a remote viewer when there is one, missions. */
  function chooseTab(vm) {
    if (pickedTab && tabAvail.includes(pickedTab) && Date.now() - pickedAt < PICK_KEEP_MS) return pickedTab;
    pickedTab = null;
    const busy = vm && (vm.levels.cpu !== 'ok' || vm.levels.mem !== 'ok');
    if (busy) return 'procs';
    if (tabAvail.includes('briefing')) return 'briefing';
    if (tabAvail.includes('missions')) return 'missions';
    return 'procs';
  }
  function setTabs(avail, vm) {
    const key = avail.join(',');
    if (key !== tabAvail.join(',')) {
      tabAvail = avail;
      buildTabs();
    }
    const want = chooseTab(vm);
    if (want !== front || !tabPanels[want].classList.contains('is-front')) showTab(want);
  }
  showTab('procs');

  // --- renderers -------------------------------------------------------------------------------
  let briefSig = null;
  let morningSig = null;

  function renderBrainPanel(brain, watchers) {
    const k = keyState(brain);
    const sp = spendState(brain);
    const wa = watcherState(brain, watchers);
    setData(n.key, 'level', k.level);
    setData(n.key, 'state', k.state);
    setData(n.brain, 'key', k.state);
    setText(n.keyWord, k.word);
    setText(n.keyText, k.text);
    setData(n.spend, 'level', sp.level);
    setText(n.today, sp.today.text ?? 'not available');
    setText(n.month, sp.month.text ?? 'not available');
    meter(n.todayMeter, sp.today.frac, sp.today.level);
    meter(n.monthMeter, sp.month.frac, sp.month.level);
    setText(n.spendLabel, sp.capReached ? `SPEND${SEP}${sp.capReached === 'monthly' ? 'MONTHLY' : 'DAILY'} CAP REACHED` : 'SPEND');
    setData(n.spendLabel, 'level', sp.capReached ? 'alert' : null);
    setText(n.cap, sp.capWords || '');
    setHidden(n.cap, !sp.capWords);
    setData(n.watch, 'level', wa.latestMet ? 'ok' : 'unknown');
    setText(n.watchCount, wa.active === null ? '—' : String(wa.active));
    const met = wa.latestMet ? `Met: ${wa.latestMet.what}` : wa.active ? 'none met yet' : 'none set';
    setText(n.watchText, `active${SEP}${met}`);
    const lv = sp.level === 'alert' || k.state === 'sdk' ? (sp.level === 'alert' ? 'alert' : 'warn') : sp.level === 'warn' ? 'warn' : 'ok';
    setData(n.brain, 'level', lv);
    setText(n.brainSub, brain.version ? `BRAIN${SEP}CORE ${brain.version}` : 'BRAIN');
  }

  function renderMissions(brain, jobs, ctx) {
    const list = missionRows(jobs);
    const k = keyState(brain);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const j = list[i];
      if (!j) {
        setHidden(r.li, true);
        continue;
      }
      setHidden(r.li, false);
      setData(r.li, 'level', j.level);
      setData(r.li, 'status', j.status);
      setText(r.word, j.word);
      setText(r.title, j.title);
      setText(r.when, j.status === 'running' ? 'now' : fmtWhen(j.when, ctx.now, ctx.locale, ctx.timeZone));
      const sum = j.status === 'failed' || j.status === 'blocked' ? j.error?.message || j.summary : j.summary;
      setText(r.sum, sum ? keepUnits(sum) : '');
      setHidden(r.sum, !sum);
    }
    setHidden(n.missionsList, !list.length);
    let empty = '';
    if (!list.length) {
      if (k.state === 'sdk') empty = 'Background research needs one more step on the home base: run jarvis-core update.';
      else if (k.state === 'none') empty = 'Add your key from Jarvis on your phone to start background research.';
      else empty = 'No missions yet. Ask Jarvis on your phone to research something in the background.';
    }
    setText(n.missionsEmpty, empty);
    setHidden(n.missionsEmpty, !empty);
    // The list follows the stream, so it counts; the brain's own counts only until a list arrives.
    // (Only research counts here: a watcher's check or the briefing's call is not a mission.)
    const known = Array.isArray(jobs) && jobs.length > 0;
    const research = known ? jobs.filter((j) => j.kind !== 'watch-check' && j.kind !== 'briefing') : [];
    const running = known ? research.filter((j) => j.status === 'running').length : brain.jobs.running;
    const queued = known ? research.filter((j) => j.status === 'queued').length : brain.jobs.queued;
    chip(n.missionsChip, running + queued > 0 ? 'ok' : 'unknown', running + queued > 0 ? `${running} RUNNING${queued ? `${SEP}${queued} QUEUED` : ''}` : 'IDLE');
    // A failed or blocked mission marks its own row; the panel itself stays calm (it is not the machine's health).
  }

  function renderBriefingPanel(b, brain, ctx) {
    const sig = b ? `${b.date}|${b.generatedAt}|${brain?.key.set}` : 'none';
    if (sig === briefSig) return;
    briefSig = sig;
    if (!b) return;
    const d = b.generatedAt ? new Date(b.generatedAt) : null;
    setText(n.briefSub, d ? `${fmtDate(d, ctx.locale, ctx.timeZone).toUpperCase()}${SEP}${b.kind === 'full' ? 'WRITTEN BY CLAUDE' : 'FREE BRIEFING'}` : b.date);
    setText(n.briefGreeting, b.greeting || greetingFor(brain?.owner.name));
    const wl = weatherLine(b.weather);
    setText(n.briefWeather, wl ? `${wl.now}${wl.range ? `${SEP}${wl.range}` : ''}` : brain && !brain.briefing.location ? 'No weather yet: open Jarvis on your iPhone once to set the location.' : 'No weather this morning.');
    setData(n.briefWeather, 'unknown', wl ? null : 'true');
    const lead = briefingLead(b);
    setText(n.briefLead, lead || '');
    setHidden(n.briefLead, !lead);
    fillList(n.briefNews, b.headlines, (h) => {
      const li = el('li', 'brief-hl');
      const t = h.url ? el('a', 'brief-hl-title', h.title) : el('span', 'brief-hl-title', h.title);
      if (h.url) {
        t.href = h.url;
        t.target = '_blank';
        t.rel = 'noopener noreferrer';
      }
      li.append(t);
      if (h.source) li.append(el('span', 'brief-hl-src', h.source));
      return li;
    });
    setHidden(n.briefNewsSec, !b.headlines.length);
    setHidden(n.briefHbSec, !b.homebase);
    if (b.homebase) {
      setData(n.briefHb, 'level', b.homebase.level);
      setText(n.briefHbText, keepUnits(b.homebase.summary || ''));
      fillList(n.briefHbNotes, b.homebase.notes, (t) => el('li', '', keepUnits(t)));
    }
    const done = finishedItems(b);
    fillList(n.briefDone, done, doneItem);
    setHidden(n.briefDoneSec, !done.length);
    fillList(n.briefNew, b.whatsNew, (x) => {
      const li = el('li', 'brief-new-item');
      li.append(el('b', '', x.title));
      if (x.detail) li.append(el('span', '', x.detail));
      return li;
    });
    setHidden(n.briefNewSec, !b.whatsNew.length);
    n.briefMusic.textContent = '';
    if (b.music) {
      n.briefMusic.append(el('span', '', b.music.suggestion));
      if (b.music.url) {
        const a = el('a', 'brief-music-link', 'Open in Apple Music');
        a.href = b.music.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        n.briefMusic.append(a);
      }
    }
    setHidden(n.briefMusicSec, !b.music);
    setHidden(n.briefKey, !(brain && !brain.key.set));
  }

  /**
   * Everything the brain shows in the system report. `state` = { brain, jobs, watchers, briefing };
   * brain null (an old Core, or not read yet): every piece of brain UI is hidden.
   */
  function render(state, vm, ctx) {
    const { brain } = state;
    const has = !!brain;
    setData(n.root, 'brain', has ? 'on' : null);
    setHidden(n.brain, !has);
    setHidden(n.missions, !has);
    const showBrief = has && !kiosk && !!state.briefing;
    setHidden(n.briefing, !showBrief);
    const avail = has ? (showBrief ? ['missions', 'briefing', 'procs'] : ['missions', 'procs']) : ['procs'];
    setTabs(avail, vm);
    if (!has) return;
    renderBrainPanel(brain, state.watchers);
    renderMissions(brain, state.jobs, ctx);
    if (showBrief) renderBriefingPanel(state.briefing, brain, ctx);
  }

  // --- morning mode ------------------------------------------------------------------------------

  function vital(key, value, level, unknown = 'N/A') {
    const [box, v] = n.mVitals[key];
    setData(box, 'level', level);
    setText(v, value ?? unknown);
    setData(v, 'unknown', value === null || value === undefined ? 'true' : null);
  }

  /**
   * The full-screen morning. `m` = { on, brain, briefing (today's or null), vm, ctx, sw (state word),
   * summary, ownerName }.
   */
  function renderMorning(m) {
    setHidden(n.morning, !m.on);
    setData(n.root, 'morning', m.on ? 'on' : null);
    // The cards are built when a briefing arrives, shown or not, so the morning screen appears at
    // once and its size never changes when it does (the long run measures exactly that).
    buildMorningContent(m.latest || null, m.brain || null);
    if (!m.on) return;
    const { vm, ctx, brain, briefing: b } = m;
    // The strip: the state word, the four vitals and the clock, so health stays in sight.
    setData(n.mState, 'level', m.sw.level);
    setText(n.mStateWord, m.sw.word);
    setText(n.mStateDetail, m.sw.detail);
    vital('cpu', fmtPct(vm.cpu.usage), vm.levels.cpu);
    vital('gpu', vm.gpu.state === 'ok' ? fmtPct(vm.gpu.util) : null, vm.gpu.state === 'ok' ? vm.levels.gpu : vm.levels.gpu === 'ok' ? 'unknown' : vm.levels.gpu, vm.gpu.state === 'nodriver' ? 'NO DRIVER' : 'N/A');
    vital('ram', fmtPct(vm.mem.usedPct), vm.levels.mem);
    vital('disk', m.diskPct !== null ? fmtPct(m.diskPct) : null, vm.levels.disk);
    const d = new Date(ctx.now);
    const cp = clockParts(d, ctx.locale, { timeZone: ctx.timeZone });
    setText(n.mClockTime, cp.time);
    setText(n.mClockPeriod, cp.period);
    const date = fmtDate(d, ctx.locale, ctx.timeZone);
    setText(n.mClockDate, date);
    setText(n.mBigClock, `${cp.time}${cp.period ? ` ${cp.period}` : ''}`);
    setText(n.mSummary, m.summary || '');
    // Something needs a look: the Core's own sentence, in its color, above the key line.
    const needsLook = m.sw.level === 'warn' || m.sw.level === 'alert' || m.sw.level === 'offline';
    setHidden(n.mHealth, !needsLook || !!(n.mWaiting && !b));
    setData(n.mHealth, 'level', m.sw.level === 'offline' ? 'offline' : m.sw.level);
    setText(n.mHealthText, needsLook ? `${m.summary || ''} Press any key for the system report.`.trim() : '');
    setText(n.mGreeting, greetingFor(m.ownerName));
    setText(n.mKicker, `${date.toUpperCase()}${b ? `${SEP}${b.kind === 'full' ? 'YOUR BRIEFING, WRITTEN BY CLAUDE' : 'YOUR BRIEFING'}` : ''}`);
    setHidden(n.mKey, !(brain && !brain.key.set));
    setData(n.morning, 'state', b ? 'briefing' : 'waiting');
    setHidden(n.mWaiting, !!b);
    setHidden(n.mCards, !b);
    setText(n.mWaitText, m.online ? 'Your briefing is on its way.' : 'Waiting for the Core to come back.');
    // Only today's briefing is shown: while waiting, the weather and the lead (yesterday's) stay
    // hidden with the cards (brain.css: .morning[data-state='waiting']).
  }

  /** The briefing's cards (headlines, the night, what finished, what's new, music), the weather and the lead. */
  function buildMorningContent(b, brain) {
    const sig = b ? `${b.date}|${b.generatedAt}|${brain?.briefing.location ? 1 : 0}|${brain?.key.set ? 1 : 0}` : 'none';
    if (sig === morningSig) return;
    morningSig = sig;
    if (!b) {
      setHidden(n.mWeather, true);
      setHidden(n.mWxHint, true);
      setHidden(n.mLead, true);
      return;
    }
    const lead = briefingLead(b);
    setText(n.mLead, lead || '');
    setHidden(n.mLead, !lead);
    const w = b.weather;
    setHidden(n.mWeather, !w);
    setHidden(n.mWxHint, !!w);
    if (w) {
      setText(n.mTemp, w.temp !== null ? String(Math.round(w.temp)) : '—');
      setText(n.mTempUnit, `°${w.units}`);
      setText(n.mWxNow, w.summary || '');
      const range = [w.high !== null ? `High ${fmtDegrees(w.high, w.units)}` : null, w.low !== null ? `Low ${fmtDegrees(w.low, w.units)}` : null, w.rainPct !== null ? `${Math.round(w.rainPct)}% rain` : null].filter(Boolean).join(SEP);
      setText(n.mWxRange, range);
      setText(n.mWxPlace, (w.label || '').toUpperCase());
    } else {
      setText(n.mWxHint, brain && !brain.briefing.location ? 'For the weather here, open Jarvis on your iPhone once and share its location.' : 'The weather could not be read this morning.');
    }
    fillList(n.mHeadlines, b.headlines, (h) => {
      const li = el('li', 'm-hl');
      li.append(el('span', 'm-hl-title', h.title));
      if (h.source) li.append(el('span', 'm-hl-src', h.source));
      return li;
    });
    if (!b.headlines.length) n.mHeadlines.append(el('li', 'm-hl m-hl-none', 'No headlines this morning (the news feeds did not answer).'));
    const hb = b.homebase;
    setData(n.mHb, 'level', hb ? hb.level : 'unknown');
    setText(n.mHbText, hb ? keepUnits(hb.summary || '') : 'The overnight report is not available.');
    fillList(n.mHbNotes, hb ? hb.notes.slice(0, 3) : [], (t) => el('li', '', keepUnits(t)));
    const done = finishedItems(b);
    fillList(n.mDone, done, doneItem);
    if (!done.length) n.mDone.append(el('li', 'm-done-none', brain && !brain.key.set ? 'Nothing ran overnight: background research needs your key.' : 'Nothing finished overnight.'));
    fillList(n.mWhatsNew, b.whatsNew.slice(0, 3), (x) => {
      const li = el('li', 'm-new');
      li.append(el('b', '', x.title));
      if (x.detail) li.append(el('span', '', x.detail));
      return li;
    });
    setHidden(n.mNewLabel, !b.whatsNew.length);
    setHidden(n.mWhatsNew, !b.whatsNew.length);
    setText(n.mMusic, b.music ? b.music.suggestion : '');
    setHidden(n.mMusicLabel, !b.music);
    setHidden(n.mMusic, !b.music);
    setHidden(n.mNewCard, !b.whatsNew.length && !b.music);
    setData(n.mCards, 'cols', !b.whatsNew.length && !b.music ? '2' : '3');
  }

  return { render, renderMorning, front: () => front, keyLine: KEY_LINE };
}
