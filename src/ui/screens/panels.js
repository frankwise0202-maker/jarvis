// Screens (v7): the one panel a screen shows. Each kind renders into the HUD frame (frame.js):
//
//   const panel = createScreenPanel(kind, { win, compact, frame, deps })
//   frame.body.append(panel.el); panel.update(data); panel.getState(); panel.destroy()
//
//   hologram   data { spec, status: 'building'|'done'|'error', title }   the 3D renderer (hologram.js)
//              with a small control deck; in a floating panel whose WebGL fails, a snapshot that
//              is re-rendered as the model changes (deps.snapshot)
//   blueprint  data { spec, status }    full screen: the blueprint viewer (zoom, parts); compact: the
//              sheet itself, fitted
//   mission    data { turn, missionId } full screen: Mission Control; compact: a readout of the agents
//   answer     data { markdown, status, report }   the answer or research report (Markdown, live)
//   photo      data { src, title, credit }
//   link       data { url, title }      a web page can't live inside Jarvis: a card that opens it
//   camera     data {}                  the live camera (src/ui/optics/screen-camera.js): the camera
//              chosen last in Optics, LIVE while it runs, off when its window is hidden; it turns
//              on by itself only with ctx.autoStart (the owner just asked for it here)
//   look       data { src, width, height, pins, question, markdown, status }   a Look: the frozen
//              frame with its pinned labels (EDITH plates, as in Optics) and the answer
//
// `win` is the window the panel lives in (a floating panel is another window): frames, timers and
// window.open come from it. deps (all optional): loadHologram() -> the renderer module,
// loadBlueprint() -> the blueprint module, snapshot(spec, { width, height }) -> data URL.
// Text only through textContent and the safe Markdown renderer.

import { h, setText, clear } from '../dom.js';
import { icon } from '../icons.js';
import { renderMarkdown } from '../../lib/markdown.js';
import { createMissionControl } from '../hud/mission-control.js';
import { hostOf } from '../../lib/screen-targets.js';
import { createCameraScreenPanel } from '../optics/screen-camera.js';
import { fitTransform, frameToView, layoutPins } from '../../lib/optics.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v : '');
const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const registry = new Map();
/** A module can provide (or replace) the panel of a kind: factory(ctx) -> panel. */
export function registerScreenPanel(kind, factory) {
  if (typeof factory === 'function') registry.set(kind, factory);
  else registry.delete(kind);
}

const SAFE_PHOTO = /^(?:https:\/\/upload\.wikimedia\.org\/|data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$)/;
export function isSafePhotoSrc(src) {
  return typeof src === 'string' && src.length < 4_000_000 && SAFE_PHOTO.test(src);
}

export function isSafeLink(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password;
  } catch {
    return false;
  }
}

function deckButton(name, label, testid, onClick, { pressed, text } = {}) {
  return h(
    'button',
    { class: ['scr-tool', text && 'scr-tool--text'], type: 'button', attrs: { 'aria-label': label, title: label, 'data-testid': testid, 'aria-pressed': pressed === undefined ? null : String(pressed) }, on: { click: onClick } },
    icon(name, { size: 18 }),
    text ? h('span', { text }) : null,
  );
}

function message(textMain, textSub) {
  return h('div', { class: 'scr-msg', attrs: { role: 'status' } }, h('p', { class: 'scr-msg__main', text: textMain }), textSub ? h('p', { class: 'scr-msg__sub', text: textSub }) : null);
}

/** Coalesce updates to one per frame of `win` (the panel's own window); the first one draws at once. */
function perFrame(win, fn) {
  let id = 0;
  let pending = null;
  let drawn = false;
  const run = () => {
    id = 0;
    const d = pending;
    pending = null;
    if (d) {
      drawn = true;
      fn(d);
    }
  };
  const schedule = (d) => {
    pending = d;
    if (!drawn) return run();
    if (!id) id = win.requestAnimationFrame(run);
  };
  schedule.cancel = () => {
    if (id) win.cancelAnimationFrame(id);
    id = 0;
  };
  schedule.flush = () => {
    if (id) {
      win.cancelAnimationFrame(id);
      run();
    }
  };
  return schedule;
}

// ---- answer / report ---------------------------------------------------------------------------

function answerPanel({ win, frame, compact }) {
  const prose = h('div', { class: 'prose scr-answer__prose' });
  const waiting = h('p', { class: 'scr-answer__waiting', hidden: true, text: 'Jarvis is writing…' });
  const col = h('div', { class: 'scr-answer__col' }, waiting, prose);
  const el = h('div', { class: ['scr-answer', compact && 'scr-answer--compact'], attrs: { tabindex: '0', role: 'region', 'aria-label': 'Answer', 'data-testid': 'screen-answer' } }, col);
  let last = null;
  let lastStatus = '';
  const render = perFrame(win, (d) => {
    const md = txt(d.markdown);
    const status = txt(d.status) || 'done';
    const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (md !== last || status !== lastStatus) {
      prose.replaceChildren(renderMarkdown(md, { streaming: status === 'running' }));
      last = md;
    }
    waiting.hidden = !!md || status !== 'running';
    const tones = { running: ['WRITING', 'live'], error: ['ERROR', 'error'], stopped: ['STOPPED', 'warn'], interrupted: ['INTERRUPTED', 'warn'] };
    const [word, tone] = tones[status] || ['', 'idle'];
    frame.setStatus(word, tone);
    if (status !== lastStatus && lastStatus === 'running' && status === 'done') frame.scan();
    lastStatus = status;
    el.dataset.status = status;
    if (stick && status === 'running') el.scrollTop = el.scrollHeight;
  });
  return {
    el,
    update: (d) => render(isObj(d) ? d : {}),
    getState: () => ({ status: lastStatus, scroll: el.scrollTop }),
    destroy: () => render.cancel(),
  };
}

// ---- mission -----------------------------------------------------------------------------------

const AGENT_ACTIVE = new Set(['starting', 'thinking', 'searching', 'reading', 'writing']);
const AGENT_WORD = { queued: 'Queued', starting: 'Starting', thinking: 'Thinking', searching: 'Searching', reading: 'Reading', writing: 'Writing', done: 'Reported', error: 'Failed', stopped: 'Stopped', interrupted: 'Interrupted' };

function missionWord(mission, turn) {
  const agents = Array.isArray(mission && mission.agents) ? mission.agents : [];
  const active = agents.filter((a) => AGENT_ACTIVE.has(a && a.status)).length;
  const done = agents.filter((a) => a && a.status === 'done').length;
  if (mission && mission.status === 'planning') return ['PLANNING', 'live'];
  if (mission && mission.status === 'running') return [active ? `WORKING · ${active} AGENT${active === 1 ? '' : 'S'}` : 'WORKING', 'live'];
  if (mission && (mission.status === 'done' || mission.status === 'partial')) return [`COMPLETE · ${done}/${agents.length}`, 'done'];
  if (mission && mission.status === 'stopped') return ['STOPPED', 'warn'];
  if (mission && mission.status === 'interrupted') return ['INTERRUPTED', 'warn'];
  if (turn && turn.status === 'error') return ['ERROR', 'error'];
  return ['', 'idle'];
}

function missionFull({ frame }) {
  const host = h('div', { class: 'scr-mission', attrs: { 'data-testid': 'screen-mission' } });
  let mc = null;
  let shown = null;
  try {
    mc = createMissionControl({ container: host, variant: 'panel' });
    if (mc.el && mc.el.parentNode !== host) host.appendChild(mc.el);
  } catch (err) {
    console.error('[jarvis] Mission Control on a screen failed:', err);
    host.append(message('Mission Control couldn’t start here.'));
  }
  return {
    el: host,
    update(d) {
      if (!isObj(d) || !isObj(d.turn)) return;
      const turn = d.turn;
      const missions = isObj(turn.missions) ? turn.missions : {};
      const mission = missions[d.missionId] || Object.values(missions).pop() || null;
      if (mc) {
        if (shown !== turn.id) {
          safe(() => mc.show(turn, mission ? mission.id : undefined));
          shown = turn.id;
        } else safe(() => mc.update(turn, mission || undefined));
      }
      const [word, tone] = missionWord(mission, turn);
      frame.setStatus(word, tone);
      host.dataset.status = mission ? txt(mission.status) : '';
      host.dataset.agents = mission && Array.isArray(mission.agents) ? String(mission.agents.length) : '0';
      host.dataset.done = mission && Array.isArray(mission.agents) ? String(mission.agents.filter((a) => a && a.status === 'done').length) : '0';
    },
    getState: () => ({}),
    destroy: () => safe(() => mc && mc.destroy && mc.destroy()),
  };
}

/** A compact readout for a floating panel: progress, then one row per agent. */
function missionCompact({ win, frame }) {
  const bar = h('span', { class: 'scr-mini__bar-fill' });
  const progress = h('div', { class: 'scr-mini__bar', attrs: { role: 'progressbar', 'aria-label': 'Agents reported', 'aria-valuemin': '0' } }, bar);
  const counts = h('p', { class: 'scr-mini__counts' });
  const list = h('ul', { class: 'scr-mini__list' });
  const el = h('div', { class: 'scr-mini', attrs: { 'data-testid': 'screen-mission' } }, h('div', { class: 'scr-mini__top' }, counts, progress), list);
  const render = perFrame(win, (d) => {
    const turn = d.turn;
    const missions = isObj(turn.missions) ? turn.missions : {};
    const mission = missions[d.missionId] || Object.values(missions).pop() || null;
    const agents = mission && Array.isArray(mission.agents) ? mission.agents.filter(isObj) : [];
    const done = agents.filter((a) => a.status === 'done').length;
    const failed = agents.filter((a) => a.status === 'error' || a.status === 'stopped' || a.status === 'interrupted').length;
    const searches = agents.reduce((n, a) => n + (Array.isArray(a.searches) ? a.searches.length : 0), 0);
    setText(counts, `${done}/${agents.length} REPORTED${failed ? ` · ${failed} FAILED` : ''} · ${searches} SEARCH${searches === 1 ? '' : 'ES'}`);
    progress.setAttribute('aria-valuemax', String(agents.length || 1));
    progress.setAttribute('aria-valuenow', String(done));
    bar.style.width = `${agents.length ? Math.round((100 * (done + failed)) / agents.length) : 0}%`;
    const rows = agents
      .slice()
      .sort((a, b) => Number(AGENT_ACTIVE.has(b.status)) - Number(AGENT_ACTIVE.has(a.status)))
      .slice(0, 12)
      .map((a) =>
        h(
          'li',
          { class: 'scr-mini__row', dataset: { status: txt(a.status) } },
          h('span', { class: 'scr-mini__dot', attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'scr-mini__name', text: txt(a.codename) || 'Agent' }),
          h('span', { class: 'scr-mini__act', text: txt(a.activity) || txt(a.role) || '' }),
          h('span', { class: 'scr-mini__state', text: AGENT_WORD[a.status] || '' }),
        ),
      );
    list.replaceChildren(...rows);
    const [word, tone] = missionWord(mission, turn);
    frame.setStatus(word, tone);
    el.dataset.status = mission ? txt(mission.status) : '';
    el.dataset.agents = String(agents.length);
    el.dataset.done = String(done);
  });
  return {
    el,
    update: (d) => {
      if (isObj(d) && isObj(d.turn)) render(d);
    },
    getState: () => ({}),
    destroy: () => render.cancel(),
  };
}

// ---- hologram ----------------------------------------------------------------------------------

function hologramPanel({ win, frame, compact, deps }) {
  const stage = h('div', { class: 'scr-holo__stage' });
  const snap = h('img', { class: 'scr-holo__snap', hidden: true, alt: '', attrs: { 'data-testid': 'screen-hologram-snapshot' } });
  const partName = h('p', { class: 'scr-holo__part-name' });
  const partInfo = h('p', { class: 'scr-holo__part-info' });
  const plate = h('div', { class: 'scr-holo__plate', hidden: true, attrs: { 'data-testid': 'screen-hologram-part', role: 'status' } }, partName, compact ? null : partInfo);
  // The part count lives in the header ("SCREEN 2 · HOLOGRAM · 43 PARTS"): a readout on the stage
  // collided with the labels the renderer places there, worst in a floating panel.
  const el = h('div', { class: 'scr-holo', attrs: { 'data-testid': 'screen-hologram', 'data-gl': 'loading', 'data-parts': '0', 'data-state': 'loading', 'data-exploded': '0' } }, stage, snap, plate);
  let holo = null;
  let ready = false;
  let model = { spec: null, status: 'loading' };
  let applied = false;
  let disposed = false;
  let state = { parts: 0, exploded: 0, labels: true, autoRotate: true };
  let snapTimer = 0;
  let snapping = false;

  const seg = (label, testid, action, pressed) => h('button', { class: 'scr-seg__btn', type: 'button', attrs: { 'aria-pressed': String(pressed), 'data-testid': testid }, text: label, on: { click: () => act(action) } });
  const bAssembled = seg('Assembled', 'screen-hologram-assemble', 'collapse', true);
  const bExploded = seg('Exploded', 'screen-hologram-explode', 'explode', false);
  const tLabels = deckButton('tag', 'Labels', 'screen-hologram-labels', () => act(state.labels ? 'labels-off' : 'labels-on'), { pressed: true, text: compact ? null : 'Labels' });
  const tRotate = deckButton('refresh', 'Rotate', 'screen-hologram-rotate', () => act(state.autoRotate ? 'stop' : 'rotate'), { pressed: true, text: compact ? null : 'Rotate' });
  const tReset = deckButton('reset-view', 'Reset view', 'screen-hologram-reset', () => act('reset'), { text: compact ? null : 'Reset' });
  frame.deck.append(h('div', { class: 'scr-seg', attrs: { role: 'group', 'aria-label': 'Assembly' } }, bAssembled, bExploded), h('div', { class: 'scr-tools' }, tLabels, tRotate, tReset));
  frame.showDeck(true);

  function act(action) {
    if (!holo || !ready) return;
    if (action === 'explode') holo.explode(1);
    else if (action === 'collapse') holo.explode(0);
    else if (action === 'labels-on') holo.setLabels(true);
    else if (action === 'labels-off') holo.setLabels(false);
    else if (action === 'rotate') holo.autoRotate(true);
    else if (action === 'stop') holo.autoRotate(false);
    else if (action === 'reset') holo.resetView();
  }

  function syncChrome() {
    const parts = state.parts || (model.spec && Array.isArray(model.spec.parts) ? model.spec.parts.length : 0);
    el.dataset.parts = String(parts);
    el.dataset.state = model.status === 'building' ? 'building' : model.status === 'error' ? 'incomplete' : model.spec ? 'ready' : 'loading';
    el.dataset.exploded = state.exploded > 0.5 ? '1' : '0';
    bAssembled.setAttribute('aria-pressed', String(state.exploded <= 0.5));
    bExploded.setAttribute('aria-pressed', String(state.exploded > 0.5));
    tLabels.setAttribute('aria-pressed', String(!!state.labels));
    tRotate.setAttribute('aria-pressed', String(!!state.autoRotate));
    const still = el.dataset.gl === 'snapshot' ? ' · SNAPSHOT' : '';
    frame.setDetail(parts ? `${parts} PART${parts === 1 ? '' : 'S'}${still}` : '');
    // The chip carries the state only; the count is in the header beside it.
    if (model.status === 'building') frame.setStatus('BUILDING', 'live');
    else if (model.status === 'error') frame.setStatus('INCOMPLETE', 'warn');
    else frame.setStatus('', 'idle');
  }

  function applyModel() {
    if (!holo || !ready || !model.spec) return;
    if (model.status === 'building') holo.updateSpec(model.spec, { normalized: true });
    else if (!applied) {
      const res = holo.setSpec(model.spec);
      if (res && !res.ok) holo.updateSpec(model.spec, { normalized: true, final: true });
    } else holo.updateSpec(model.spec, { normalized: true, final: true });
    applied = true;
  }

  // A floating panel whose WebGL fails: a snapshot rendered by the app, again when the model changes.
  function scheduleSnapshot() {
    if (disposed || !deps || typeof deps.snapshot !== 'function' || !model.spec) return;
    win.clearTimeout(snapTimer);
    snapTimer = win.setTimeout(async () => {
      if (snapping) return scheduleSnapshot();
      snapping = true;
      try {
        const rect = el.getBoundingClientRect();
        const url = await deps.snapshot(model.spec, { width: Math.max(320, Math.round(rect.width)), height: Math.max(240, Math.round(rect.height)) });
        if (!disposed && url) {
          snap.src = url;
          snap.hidden = false;
          snap.alt = `Hologram: ${txt(model.spec.title) || 'model'}`;
          el.dataset.gl = 'snapshot';
          frame.showDeck(false); // a picture: nothing to explode or rotate here
          syncChrome();
        }
      } catch (err) {
        console.warn('[jarvis] hologram snapshot failed:', err && err.message);
      } finally {
        snapping = false;
      }
    }, model.status === 'building' ? 900 : 120);
  }

  async function start() {
    let mod = null;
    try {
      mod = deps && typeof deps.loadHologram === 'function' ? await deps.loadHologram() : null;
    } catch (err) {
      console.error('[jarvis] the 3D view could not load:', err);
    }
    if (disposed) return;
    if (!mod) {
      el.dataset.gl = 'error';
      stage.append(message('The 3D view couldn’t load.', 'Check the connection, then close this screen and try again.'));
      return;
    }
    holo = mod.createHologram(stage, {
      onState: (s) => {
        state = { ...state, ...s };
        syncChrome();
      },
      onSelect: (id, part) => {
        plate.hidden = !part;
        if (part) {
          setText(partName, txt(part.name));
          setText(partInfo, txt(part.info));
        }
        el.dataset.selected = id || '';
      },
      labels: true,
      autoRotate: true,
      rotateAfterMs: 2500,
    });
    const st = holo.getState();
    if (st && st.error === 'webgl') {
      el.dataset.gl = 'none';
      if (deps && typeof deps.snapshot === 'function') scheduleSnapshot();
      return;
    }
    ready = true;
    el.dataset.gl = 'ready';
    applyModel();
    syncChrome();
  }
  start();

  return {
    el,
    update(d) {
      if (!isObj(d) || !isObj(d.spec)) return;
      const wasBuilding = model.status === 'building';
      model = { spec: d.spec, status: d.status === 'building' || d.status === 'error' ? d.status : 'done' };
      if (wasBuilding && model.status === 'done') frame.scan();
      if (ready) applyModel();
      else if (el.dataset.gl === 'none' || el.dataset.gl === 'snapshot') scheduleSnapshot();
      syncChrome();
    },
    getState: () => ({ exploded: state.exploded, labels: state.labels, selected: el.dataset.selected || null, view: state.view || '' }),
    holo: () => holo,
    destroy() {
      disposed = true;
      win.clearTimeout(snapTimer);
      if (holo) safe(() => holo.dispose());
      holo = null;
    },
  };
}

// ---- blueprint ---------------------------------------------------------------------------------

function blueprintPanel({ win, frame, compact, deps }) {
  const el = h('div', { class: ['scr-bp', compact && 'scr-bp--compact'], attrs: { 'data-testid': 'screen-blueprint', 'data-state': 'loading' } });
  let mod = null;
  let viewer = null;
  let model = null;
  let disposed = false;
  let timer = 0;
  let last = 0;

  function word() {
    const n = model && model.spec && Array.isArray(model.spec.parts) ? model.spec.parts.length : 0;
    if (!model) return;
    if (model.status === 'building') frame.setStatus(`DRAWING${n ? ` · ${n} PARTS` : ''}`, 'live');
    else if (model.status === 'error') frame.setStatus('INCOMPLETE', 'warn');
    else frame.setStatus('', 'idle');
    el.dataset.state = model.status === 'building' ? 'building' : model.status === 'error' ? 'incomplete' : 'ready';
  }

  function draw() {
    timer = 0;
    last = win.performance ? win.performance.now() : Date.now();
    if (disposed || !mod || !model || !model.spec) return;
    const partial = model.status !== 'done';
    if (compact) {
      let svg = null;
      try {
        svg = mod.renderBlueprint(model.spec, {});
      } catch (err) {
        console.warn('[jarvis] blueprint render failed:', err && err.message);
      }
      if (svg) {
        svg.classList.add('scr-bp__sheet');
        el.replaceChildren(svg);
      }
    } else if (!viewer) {
      viewer = mod.createBlueprintViewer({ spec: model.spec, partial });
      el.replaceChildren(viewer.el);
    } else safe(() => viewer.update(model.spec, { partial }));
    word();
  }

  function schedule() {
    if (!mod) return;
    const now = win.performance ? win.performance.now() : Date.now();
    const wait = 300 - (now - last);
    if (model && model.status !== 'building') {
      win.clearTimeout(timer);
      draw();
    } else if (!timer) timer = win.setTimeout(draw, Math.max(0, wait));
  }

  (async () => {
    try {
      mod = deps && typeof deps.loadBlueprint === 'function' ? await deps.loadBlueprint() : null;
    } catch (err) {
      console.error('[jarvis] the blueprint viewer could not load:', err);
    }
    if (disposed) return;
    if (!mod) {
      el.replaceChildren(message('The blueprint couldn’t load.', 'Check the connection, then try again.'));
      el.dataset.state = 'error';
      return;
    }
    schedule();
  })();

  return {
    el,
    update(d) {
      if (!isObj(d) || !isObj(d.spec)) return;
      const was = model && model.status;
      model = { spec: d.spec, status: d.status === 'building' || d.status === 'error' ? d.status : 'done' };
      if (was === 'building' && model.status === 'done') frame.scan();
      word();
      schedule();
    },
    getState: () => ({}),
    destroy() {
      disposed = true;
      win.clearTimeout(timer);
      if (viewer) safe(() => viewer.destroy());
    },
  };
}

// ---- photo, link (the camera: src/ui/optics/screen-camera.js) --------------------------------------

function photoPanel({ frame }) {
  const img = h('img', { class: 'scr-photo__img', alt: '', attrs: { referrerpolicy: 'no-referrer', decoding: 'async', 'data-testid': 'screen-photo-img' } });
  const credit = h('p', { class: 'scr-photo__credit' });
  const el = h('figure', { class: 'scr-photo', attrs: { 'data-testid': 'screen-photo' } }, h('div', { class: 'scr-photo__stage' }, img), h('figcaption', null, credit));
  return {
    el,
    update(d) {
      if (!isObj(d)) return;
      if (isSafePhotoSrc(d.src)) {
        if (img.getAttribute('src') !== d.src) img.src = d.src;
        img.alt = txt(d.title) || 'Photo';
        el.dataset.state = 'ready';
      } else {
        el.dataset.state = 'missing';
        img.removeAttribute('src');
      }
      setText(credit, txt(d.credit));
      credit.hidden = !credit.textContent;
      frame.setStatus('', 'idle');
    },
    getState: () => ({}),
    destroy() {},
  };
}

function linkPanel({ win, frame, compact }) {
  const host = h('p', { class: 'scr-link__host' });
  const title = h('h2', { class: 'scr-link__title' });
  const url = h('p', { class: 'scr-link__url' });
  let current = '';
  const openBtn = h(
    'button',
    {
      class: 'scr-btn scr-btn--primary',
      type: 'button',
      attrs: { 'data-testid': 'screen-link-open' },
      on: {
        click: () => {
          if (!isSafeLink(current)) return;
          safe(() => win.open(current, '_blank', 'noopener,noreferrer'));
        },
      },
    },
    icon('external', { size: 18 }),
    h('span', { text: 'Open page' }),
  );
  const copyLabel = h('span', { text: 'Copy link' });
  const copyBtn = h(
    'button',
    {
      class: 'scr-btn',
      type: 'button',
      attrs: { 'data-testid': 'screen-link-copy' },
      on: {
        click: async () => {
          let ok = false;
          try {
            await win.navigator.clipboard.writeText(current);
            ok = true;
          } catch {
            ok = false;
          }
          setText(copyLabel, ok ? 'Copied' : 'Select the link to copy it');
          win.setTimeout(() => setText(copyLabel, 'Copy link'), 1600);
        },
      },
    },
    icon('copy', { size: 18 }),
    copyLabel,
  );
  const el = h(
    'div',
    { class: ['scr-link', compact && 'scr-link--compact'], attrs: { 'data-testid': 'screen-link' } },
    h('div', { class: 'scr-link__card' }, h('span', { class: 'scr-link__icon', attrs: { 'aria-hidden': 'true' } }, icon('globe', { size: 28 })), host, title, url, h('div', { class: 'scr-link__actions' }, openBtn, copyBtn)),
  );
  return {
    el,
    update(d) {
      if (!isObj(d) || !isSafeLink(d.url)) {
        el.dataset.state = 'missing';
        return;
      }
      current = d.url;
      setText(host, hostOf(d.url).toUpperCase());
      setText(title, txt(d.title) || hostOf(d.url));
      setText(url, d.url);
      el.dataset.state = 'ready';
      frame.setStatus('', 'idle');
    },
    getState: () => ({}),
    destroy() {},
  };
}

// ---- look (Screens × Optics: "put this on my other screen" while a Look is on screen) ----------------

const LOOK_SRC = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

function lookPanel({ win, frame, compact }) {
  const doc = win.document;
  const img = h('img', { class: 'scr-look__img', alt: '', attrs: { decoding: 'async', 'data-testid': 'screen-look-img' } });
  const leaders = h('svg', { class: 'scr-look__leaders', attrs: { 'aria-hidden': 'true' } });
  const pinsLayer = h('div', { class: 'scr-look__pins', attrs: { 'aria-hidden': 'true' } }, leaders);
  const stage = h('div', { class: 'scr-look__stage' }, img, pinsLayer);
  const question = h('p', { class: 'scr-look__q' });
  const prose = h('div', { class: 'prose scr-look__prose' });
  const names = h('p', { class: 'scr-look__names', attrs: { 'data-testid': 'screen-look-labels' } });
  const text = h('div', { class: 'scr-look__answer', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Answer' } }, question, names, prose);
  const el = h('div', { class: ['scr-look', compact && 'scr-look--compact'], attrs: { 'data-testid': 'screen-look' } }, stage, text);
  let data = null;
  let lastMd = null;
  let measureCtx = null;
  const measure = (t) => {
    try {
      if (!measureCtx) measureCtx = doc.createElement('canvas').getContext('2d');
      measureCtx.font = '500 13px system-ui, sans-serif';
      return Math.ceil(measureCtx.measureText(t).width) + 1;
    } catch {
      return t.length * 8;
    }
  };
  const layout = perFrame(win, () => {
    for (const n of Array.from(pinsLayer.children)) if (n !== leaders) n.remove();
    leaders.replaceChildren();
    if (!data || !data.pins.length) return;
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const t = fitTransform(data.width, data.height, { x: 0, y: 0, w: box.width, h: box.height }, 'contain');
    leaders.setAttribute('viewBox', `0 0 ${Math.max(1, box.width)} ${Math.max(1, box.height)}`);
    leaders.setAttribute('width', String(box.width));
    leaders.setAttribute('height', String(box.height));
    const pins = data.pins.map((p) => ({ text: p.text, ...frameToView(t, p.x, p.y) }));
    const safe = { x: 4, y: 4, w: Math.max(1, box.width - 8), h: Math.max(1, box.height - 8) };
    for (const l of layoutPins(pins, { safe, measure, plateH: 26, padX: 9, gap: 22, maxPlateW: Math.min(220, safe.w) })) {
      if (l.leader) leaders.append(h('line', { x1: l.leader.x1, y1: l.leader.y1, x2: l.leader.x2, y2: l.leader.y2 }));
      pinsLayer.append(
        h('span', { class: 'scr-look__dot', style: { left: `${l.ax}px`, top: `${l.ay}px` } }),
        h('span', { class: 'scr-look__plate', text: l.text, attrs: { 'data-testid': 'screen-look-pin' }, style: { left: `${l.plate.x}px`, top: `${l.plate.y}px`, width: `${l.plate.w}px` } }),
      );
    }
  });
  let ro = null;
  try {
    if (typeof win.ResizeObserver === 'function') {
      ro = new win.ResizeObserver(() => layout(1));
      ro.observe(stage);
    }
  } catch {
    ro = null;
  }
  img.addEventListener('load', () => layout(1));
  return {
    el,
    update(d) {
      if (!isObj(d) || !LOOK_SRC.test(txt(d.src)) || !(d.width > 0) || !(d.height > 0)) {
        el.dataset.state = 'missing';
        return;
      }
      data = { src: d.src, width: d.width, height: d.height, pins: Array.isArray(d.pins) ? d.pins.filter((p) => isObj(p) && typeof p.text === 'string') : [] };
      if (img.getAttribute('src') !== d.src) img.src = d.src;
      img.alt = txt(d.question) || 'The frame Jarvis looked at';
      setText(question, txt(d.question));
      setText(names, data.pins.map((p) => p.text).join(' · '));
      names.hidden = !data.pins.length;
      const status = txt(d.status) || 'done';
      const md = txt(d.markdown);
      if (md !== lastMd) {
        prose.replaceChildren(renderMarkdown(md, { streaming: status === 'running' }));
        lastMd = md;
      }
      el.dataset.state = 'ready';
      el.dataset.status = status;
      el.dataset.pins = String(data.pins.length);
      frame.setStatus(status === 'running' ? 'ANALYZING' : status === 'error' ? 'NO ANSWER' : data.pins.length ? `${data.pins.length} LABELS` : '', status === 'running' ? 'live' : status === 'error' ? 'warn' : 'idle');
      layout(1);
    },
    getState: () => ({ pins: data ? data.pins.length : 0 }),
    destroy() {
      layout.cancel();
      if (ro) ro.disconnect();
    },
  };
}

/** The panel for `kind` (see the header). ctx: { win, frame, compact, deps, autoStart }. */
export function createScreenPanel(kind, ctx) {
  const c = { win: window, compact: false, deps: {}, ...ctx };
  if (registry.has(kind)) {
    try {
      const p = registry.get(kind)(c);
      if (p && p.el) return p;
    } catch (err) {
      console.error(`[jarvis] the ${kind} screen panel failed:`, err);
    }
  }
  switch (kind) {
    case 'answer':
      return answerPanel(c);
    case 'mission':
      return c.compact ? missionCompact(c) : missionFull(c);
    case 'hologram':
      return hologramPanel(c);
    case 'blueprint':
      return blueprintPanel(c);
    case 'photo':
      return photoPanel(c);
    case 'link':
      return linkPanel(c);
    case 'camera':
      return createCameraScreenPanel(c);
    case 'look':
      return lookPanel(c);
    default: {
      const el = message('Nothing to show here.');
      return { el, update() {}, getState: () => ({}), destroy() {} };
    }
  }
}

export { clear };
