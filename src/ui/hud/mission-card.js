// Inline mission card for the chat transcript: "MISSION · WAVE n", title, status with a live
// elapsed timer, a stacked progress bar (done / failed / stopped) and a chip per agent showing its
// status (icon + color + screen-reader text), codename and role. Tapping the card opens Mission
// Control through onOpen(missionId, mission).
//
//   const card = createMissionCard(mission, { onOpen: (id) => openMissionControl(id) });
//   transcript.append(card.el); … card.update(mission);   // after every mission/agent event
//
// update() patches the DOM in place: chips are keyed by agent id and never rebuilt, so there is
// no flicker however often it is called.

import { h, setText, clear } from '../dom.js';
import { icon } from '../icons.js';
import { elapsedMs, fmtDuration, isActiveStatus, onSecond, plural, statusIcon, statusLabel, statusTone } from './format.js';

const MAX_CHIPS = 20;
const COMPACT_AFTER = 8; // more agents than this → single-line chips

const str = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

function agentKey(agent, index) {
  return agent && agent.id !== undefined && agent.id !== null ? String(agent.id) : `#${index}`;
}

function createChip() {
  const iconBox = h('span', { class: 'hud-chip__icon', attrs: { 'aria-hidden': 'true' } });
  const code = h('span', { class: 'hud-chip__code' });
  const role = h('span', { class: 'hud-chip__role' });
  const sr = h('span', { class: 'hud-sr' });
  const li = h('li', { class: 'hud-chip', dataset: { testid: 'agent-chip' } }, iconBox, h('span', { class: 'hud-chip__text' }, code, role), sr);
  li.addEventListener('animationend', () => li.classList.remove('is-entering'));
  return { li, iconBox, code, role, sr, status: undefined, codename: undefined, roleText: undefined, isNew: true };
}

function updateChip(chip, agent) {
  const status = str(agent.status) || 'queued';
  const codename = str(agent.codename);
  const roleText = str(agent.role).trim();
  if (status !== chip.status) {
    chip.status = status;
    chip.li.dataset.status = status;
    chip.li.dataset.tone = statusTone(status);
    // Active agents share a spinning ring; finished/waiting ones get a distinct glyph.
    const glyph = isActiveStatus(status) ? 'spinner' : statusIcon(status);
    clear(chip.iconBox).append(icon(glyph, { size: 14, strokeWidth: 2 }));
    setText(chip.sr, ` — ${statusLabel(status, 'agent')}`);
  }
  if (codename !== chip.codename) {
    chip.codename = codename;
    chip.li.dataset.codename = codename;
    setText(chip.code, codename || 'Agent');
  }
  if (roleText !== chip.roleText) {
    chip.roleText = roleText;
    setText(chip.role, roleText || '…');
  }
  const tip = `${codename || 'Agent'} — ${roleText || 'role pending'} — ${statusLabel(status, 'agent')}`;
  if (chip.li.title !== tip) chip.li.title = tip;
}

/**
 * @param {object} mission  Mission (SPEC §6)
 * @param {{ onOpen?: (missionId: string, mission: object) => void }} [opts]
 */
export function createMissionCard(mission, opts = {}) {
  const onOpen = typeof opts.onOpen === 'function' ? opts.onOpen : null;
  let m = mission || {};

  const label = h('span', { class: 'hud-mission__label' });
  const pillIcon = h('span', { class: 'hud-pill__icon' });
  const pillText = h('span', { class: 'hud-pill__text' });
  const pill = h('span', { class: 'hud-pill' }, pillIcon, pillText);
  const timer = h('span', { class: 'hud-mission__timer', attrs: { title: 'Elapsed time' } });
  const title = h('p', { class: 'hud-mission__title' });

  const barOk = h('span', { class: 'hud-progress__seg hud-progress__seg--ok' });
  const barErr = h('span', { class: 'hud-progress__seg hud-progress__seg--err' });
  const barWarn = h('span', { class: 'hud-progress__seg hud-progress__seg--warn' });
  const bar = h(
    'span',
    { class: 'hud-progress', attrs: { role: 'progressbar', 'aria-label': 'Agents finished', 'aria-valuemin': '0' } },
    barOk,
    barErr,
    barWarn,
  );
  const progressText = h('span', { class: 'hud-mission__progress-text' });

  const chips = h('ul', { class: 'hud-chips', attrs: { 'aria-label': 'Agents' } });
  const more = h('li', { class: 'hud-chip hud-chip--more', hidden: true });
  const placeholder = h('p', { class: 'hud-mission__placeholder', text: 'Assembling the team…' });

  const meta = h('span', { class: 'hud-mission__meta' });
  const openBtn = h(
    'button',
    {
      type: 'button',
      class: 'hud-mission__open',
      dataset: { testid: 'open-mission' },
      on: {
        click: (event) => {
          event.stopPropagation();
          if (onOpen) onOpen(m.id, m);
        },
      },
    },
    h('span', { text: 'Mission Control' }),
    icon('chevron-right', { size: 16 }),
  );

  // A tap anywhere on the card opens Mission Control (keyboard and screen-reader users get the
  // same through the button). Every part of the card stays directly hit-testable.
  const el = h(
    'article',
    {
      class: 'hud-mission',
      dataset: { testid: 'mission-card' },
      on: {
        click: (event) => {
          if (!onOpen || event.defaultPrevented) return;
          const t = event.target;
          if (t instanceof Element && t.closest('a, input, select, textarea')) return;
          const sel = window.getSelection ? window.getSelection() : null;
          if (sel && !sel.isCollapsed && el.contains(sel.anchorNode)) return; // finishing a text selection
          onOpen(m.id, m);
        },
      },
    },
    h('div', { class: 'hud-mission__top' }, h('span', { class: 'hud-mission__glyph', attrs: { 'aria-hidden': 'true' } }, icon('target', { size: 14 })), label, h('span', { class: 'hud-mission__spacer' }), pill, timer),
    title,
    h('div', { class: 'hud-mission__progress' }, bar, progressText),
    placeholder,
    chips,
    h('div', { class: 'hud-mission__foot' }, meta, openBtn),
  );

  const chipById = new Map();
  const shown = {
    status: undefined,
    label: undefined,
    title: undefined,
    time: undefined,
    progress: undefined,
    ok: undefined,
    err: undefined,
    warn: undefined,
    meta: undefined,
    density: undefined,
  };
  let stopTick = null;
  let detachedTicks = 0;
  let rendered = false; // chips that arrive after the first render animate in

  function timeText(now) {
    const ms = elapsedMs(m.startedAt || m.createdAt, m.endedAt, now);
    return ms === null ? '—' : fmtDuration(ms);
  }

  function setTime(now) {
    const t = timeText(now);
    if (t !== shown.time) {
      shown.time = t;
      setText(timer, t);
    }
  }

  function syncTimer() {
    const running = (m.status === 'running' || m.status === 'planning') && !m.endedAt;
    if (running && !stopTick) {
      detachedTicks = 0;
      stopTick = onSecond((now) => {
        if (!el.isConnected) {
          if (++detachedTicks > 3) stopTimer(); // removed without notice; update() restarts it
          return;
        }
        detachedTicks = 0;
        setTime(now);
      });
    } else if (!running && stopTick) {
      stopTimer();
    }
  }

  function stopTimer() {
    if (stopTick) stopTick();
    stopTick = null;
  }

  function update(next) {
    if (next && typeof next === 'object') m = next;
    const status = str(m.status) || 'planning';
    const agents = Array.isArray(m.agents) ? m.agents : [];

    if (status !== shown.status) {
      shown.status = status;
      const tone = statusTone(status);
      el.dataset.status = status;
      el.dataset.tone = tone;
      pill.dataset.tone = tone;
      clear(pillIcon).append(icon(statusIcon(status), { size: 13 }));
      setText(pillText, statusLabel(status, 'mission'));
    }
    if (m.id !== undefined && el.dataset.missionId !== str(m.id)) el.dataset.missionId = str(m.id);

    const labelText = `Mission · Wave ${Number(m.wave) > 0 ? Number(m.wave) : 1}`;
    if (labelText !== shown.label) {
      shown.label = labelText;
      setText(label, labelText);
    }
    const titleText = str(m.title).trim();
    if (titleText !== shown.title) {
      shown.title = titleText;
      setText(title, titleText || (status === 'planning' ? 'Planning the mission…' : 'Mission'));
      title.classList.toggle('is-pending', !titleText);
      el.setAttribute('aria-label', `Mission: ${titleText || 'planning'}`);
      openBtn.setAttribute('aria-label', `Open Mission Control${titleText ? ` for ${titleText}` : ''}`);
    }
    setTime(Date.now());
    syncTimer();

    // Counts, searches and unique sources.
    let done = 0;
    let failed = 0;
    let halted = 0;
    let searches = 0;
    const urls = new Set();
    for (const a of agents) {
      if (!a) continue;
      if (a.status === 'done') done++;
      else if (a.status === 'error') failed++;
      else if (a.status === 'stopped' || a.status === 'interrupted') halted++;
      if (Array.isArray(a.searches)) searches += a.searches.length;
      if (Array.isArray(a.sources)) for (const s of a.sources) if (s && s.url) urls.add(s.url);
    }
    const total = agents.length;
    const pct = (n) => (total ? `${((n / total) * 100).toFixed(2)}%` : '0%');
    if (pct(done) !== shown.ok) barOk.style.width = shown.ok = pct(done);
    if (pct(failed) !== shown.err) barErr.style.width = shown.err = pct(failed);
    if (pct(halted) !== shown.warn) barWarn.style.width = shown.warn = pct(halted);
    // While the team is still being planned the placeholder says so; no count line yet.
    let progress = total ? `${done}/${total} done` : status === 'planning' ? '' : 'No agents';
    if (failed) progress += ` · ${failed} failed`;
    if (halted) progress += ` · ${halted} stopped`;
    if (progress !== shown.progress) {
      shown.progress = progress;
      setText(progressText, progress);
      progressText.hidden = !progress;
      bar.setAttribute('aria-valuemax', String(Math.max(total, 1)));
      bar.setAttribute('aria-valuenow', String(done + failed + halted));
      bar.setAttribute('aria-valuetext', progress);
    }
    bar.classList.toggle('is-indeterminate', isActiveStatus(status) && done + failed + halted === 0);

    const metaText = searches || urls.size ? `${plural(searches, 'search', 'searches')} · ${plural(urls.size, 'source')}` : status === 'planning' ? 'Briefing agents' : 'No searches yet';
    if (metaText !== shown.meta) {
      shown.meta = metaText;
      setText(meta, metaText);
    }

    // Chips (keyed by agent id, appended in order; never rebuilt).
    const density = total > COMPACT_AFTER ? 'compact' : 'comfy';
    if (density !== shown.density) {
      shown.density = density;
      el.dataset.density = density;
    }
    const noPlaceholder = total > 0 || status !== 'planning';
    if (placeholder.hidden !== noPlaceholder) placeholder.hidden = noPlaceholder;
    const seen = new Set();
    let prev = null;
    const limit = Math.min(total, MAX_CHIPS);
    for (let i = 0; i < limit; i++) {
      const agent = agents[i];
      if (!agent) continue;
      const key = agentKey(agent, i);
      seen.add(key);
      let chip = chipById.get(key);
      if (!chip) {
        chip = createChip();
        chipById.set(key, chip);
      }
      updateChip(chip, agent);
      const expected = prev ? prev.nextSibling : chips.firstChild;
      if (chip.li !== expected) chips.insertBefore(chip.li, expected);
      if (chip.isNew) {
        chip.isNew = false;
        if (rendered && el.isConnected) chip.li.classList.add('is-entering');
      }
      prev = chip.li;
    }
    for (const [key, chip] of chipById) {
      if (!seen.has(key)) {
        chip.li.remove();
        chipById.delete(key);
      }
    }
    const extra = total - limit;
    if (more.hidden !== extra <= 0) more.hidden = extra <= 0;
    if (extra > 0) {
      setText(more, `+${extra} more`);
      chips.append(more);
    } else if (more.parentNode) {
      more.remove();
    }
    rendered = true;
  }

  update(m);

  return {
    el,
    update,
    /** Stop the live timer (call when the card is discarded). */
    dispose: stopTimer,
  };
}
