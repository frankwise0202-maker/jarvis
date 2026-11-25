// Transcript: renders a conversation as user bubbles and Jarvis turn blocks, and keeps
// them in sync with live TurnRun events. Events only mark things dirty; one
// requestAnimationFrame pass reconciles the affected turns, segments and missions.
// Streaming Markdown is re-rendered at most ~8×/s per text segment. Auto-scroll sticks
// to the bottom only while the user is there; otherwise a "New activity" pill appears.

import { h, setText, raf, extLink, safeUrl } from './dom.js';
import { icon } from './icons.js';
import { renderMarkdown, markdownToPlainText } from '../lib/markdown.js';
import { createMissionCard } from './hud/mission-card.js';
import { createCore } from './hud/core.js';
import { fmtDuration, fmtUsd, hostname } from './hud/format.js';
import { createProtocolGrid, createProtocolBubble } from './protocols.js';
import { createAttachmentStrip } from './attachments.js';
import { createFrameSegmentView, createOpticsTurnCard, createPinsSegmentView } from './optics/chat-views.js';
import { createMusicCardView } from './music/card.js';
import { createVoiceTag } from './voice-tag.js';
import { loadHologramRenderer } from './hologram/viewer.js';
import { loadBlueprintModule } from './blueprint/open.js';
import { MODELS } from '../engine/index.js';

const MD_INTERVAL = 125; // ms between Markdown re-renders while streaming (~8/s)
const STICK_PX = 56; // distance from the bottom that still counts as "at the bottom"
const MAX_CHIPS = 5;

// ---- small helpers ----------------------------------------------------------------

// Conversations come from storage, and a stored record can be damaged or (via an old backup)
// malformed: rendering reads every field through these, so a bad field shows as empty instead
// of breaking the transcript.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const missionsOf = (turn) => (isObj(turn.missions) ? turn.missions : {});
/** table[key] for the table's own keys only ("constructor" is not an error kind). */
const lookup = (table, key) => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined);
const turnsOf = (conv) => (conv && Array.isArray(conv.turns) ? conv.turns.filter(isObj) : []);

function safeHost(url) {
  if (typeof url !== 'string') return '';
  try {
    return hostname(url) || '';
  } catch {
    return '';
  }
}

function duration(ms) {
  const v = Math.max(0, Number(ms) || 0);
  if (v < 1000) return '<1s'; // a sub-second turn is not "0s"
  try {
    return fmtDuration(v);
  } catch {
    return `${Math.round(v / 1000)}s`;
  }
}

function usd(v) {
  try {
    return fmtUsd(Number(v) || 0);
  } catch {
    return `≈ $${(Number(v) || 0).toFixed(2)}`;
  }
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function md(text, streaming) {
  try {
    return renderMarkdown(text || '', { streaming });
  } catch (err) {
    console.error('[jarvis] renderMarkdown failed:', err);
    return h('p', { text: text || '' });
  }
}

export function plainText(markdown) {
  try {
    return markdownToPlainText(markdown || '');
  } catch {
    return markdown || '';
  }
}

/** Short label for a source chip: the page title without a trailing site name, else the host. */
function chipLabel(item) {
  let t = String(item.title || '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.{3,})\s+[—–|·-]\s+[^—–|·]{2,40}$/);
  if (m) t = m[1].trim();
  return t || item.host || item.href;
}

/**
 * Give prose columns of rendered Markdown tables room to breathe: a column whose longest cell
 * is long text gets a wider minimum (up to ~16em, about two lines for a short note) instead of
 * being squeezed into a tall, narrow strip; short columns (numbers, names) stay compact. The
 * table's wrapper scrolls sideways when the total is wider than the column.
 */
function sizeTables(root) {
  for (const table of root.querySelectorAll('table.md-table')) {
    const rows = table.rows;
    if (!rows || !rows.length) continue;
    const first = rows[0].cells;
    const longest = new Array(first.length).fill(0);
    for (const row of rows) {
      for (let i = 0; i < row.cells.length && i < longest.length; i++) longest[i] = Math.max(longest[i], (row.cells[i].textContent || '').trim().length);
    }
    longest.forEach((chars, i) => {
      const em = Math.min(16, Math.round(chars * 0.48 * 2) / 2);
      if (em > 7.5 && first[i]) first[i].style.minWidth = `${em}em`;
    });
  }
}

/** Put a blinking caret at the end of the last text block of a rendered Markdown body. */
function appendCaret(body) {
  const caret = h('span', { class: 'caret', attrs: { 'aria-hidden': 'true' } });
  let t = body.lastElementChild;
  while (t && /^(UL|OL|BLOCKQUOTE)$/.test(t.tagName) && t.lastElementChild) t = t.lastElementChild;
  while (t && t.tagName === 'LI' && t.lastElementChild && /^(UL|OL|P)$/.test(t.lastElementChild.tagName)) {
    t = t.lastElementChild;
    while (t && /^(UL|OL)$/.test(t.tagName) && t.lastElementChild) t = t.lastElementChild;
  }
  if (t && /^(P|LI|H[1-6])$/.test(t.tagName)) t.appendChild(caret);
  else body.appendChild(caret);
}

const TOOL_ERRORS = {
  max_uses_exceeded: 'search limit reached',
  too_many_requests: 'rate limited',
  url_not_accessible: 'page not accessible',
  url_not_allowed: 'site not allowed',
  unsupported_content_type: 'unsupported content',
  query_too_long: 'query too long',
  invalid_input: 'invalid input',
  invalid_tool_input: 'invalid input',
  unavailable: 'unavailable',
};

// Codes the engine uses when it settles a tool row because the turn ended early.
const CUT_CODES = { stopped: 'stopped', interrupted: 'interrupted', incomplete: 'cut short' };

const ERROR_TITLES = {
  auth: 'API key rejected',
  billing: 'Out of credits',
  rate_limit: 'Rate limit reached',
  overloaded: 'Claude is overloaded',
  network: 'Connection lost',
  bad_request: 'Request failed',
  not_found: 'Model unavailable',
  refusal: 'Request declined',
  aborted: 'Stopped',
  server: 'Anthropic server error',
  context: 'Conversation too long',
  unknown: 'Something went wrong',
};

// ---- suggestions ------------------------------------------------------------------

const SUGGESTION_POOL = {
  quick: [
    'Explain how noise-cancelling headphones work, simply',
    'What’s a sensible size for an emergency fund?',
    'Give me a 10-minute stretch routine for desk work',
    'How long should I rest a steak, and why?',
  ],
  research: [
    'What’s new in solid-state EV batteries this year?',
    'What are the best-reviewed robot vacuums right now?',
    'Summarize this week’s biggest science news',
    'Which phones get the longest software support today?',
  ],
  swarm: [
    'Compare the best family electric SUVs: range, price, safety and reliability',
    'Find the best places in Europe to retire: cost, healthcare, climate and visas',
    'Build a buyer’s guide for a first home espresso machine',
    'Heat pump or gas furnace for a cold climate? Cost, comfort and incentives',
  ],
  plan: [
    'Plan a relaxed 3-day weekend in Lisbon with great food',
    'Plan a week of healthy dinners for two, with a shopping list',
    'Plan a beginner 8-week training schedule for a 10K',
    'Plan a cozy dinner party for six on a weeknight',
  ],
};
const SUGGESTION_META = {
  quick: { mode: 'quick', tag: 'Quick', icon: 'bolt' },
  research: { mode: 'auto', tag: 'Research', icon: 'search' },
  swarm: { mode: 'swarm', tag: 'Swarm', icon: 'agents' },
  plan: { mode: 'auto', tag: 'Plan', icon: 'pin' },
};

function pickSuggestions(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date - start) / 86400000);
  return Object.keys(SUGGESTION_POOL).map((key, i) => {
    const list = SUGGESTION_POOL[key];
    return { ...SUGGESTION_META[key], text: list[(day + i) % list.length] };
  });
}

// ---- chat ------------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {(turnId: string) => boolean} o.isTurnActive
 * @param {() => boolean} o.canResume
 * @param {() => void} o.onResume
 * @param {(turn: object) => void} o.onRetry
 * @param {(turn: object) => void} o.onCopy
 * @param {(turn: object) => void} o.onSpeak
 * @param {(turnId: string) => boolean} o.isSpeaking
 * @param {(turn: object, missionId?: string) => void} o.onOpenMission
 * @param {(section: string) => void} o.onOpenSettings
 * @param {() => void} o.onNewChat
 * @param {(text: string, mode: string) => void} o.onSuggestion
 * @param {(text: string, mode: string, protocol: object) => boolean} [o.onProtocol]  runs a protocol (SPEC §14.2)
 * @param {(turn: object) => void} [o.onShare]          opens Share & export for a reply (SPEC §14.4)
 * @param {(turn: object, seg: object) => void} [o.onOpenHologram]  opens the hologram viewer for a hologram card
 * @param {(turn: object, seg: object) => void} [o.onOpenBlueprint]  opens the blueprint viewer for a blueprint card
 * @param {{ get, ensure, onChange }} [o.thumbs]        saved-library thumbnails for the cards (src/ui/thumbs.js)
 * @param {(fact: string) => boolean|null} [o.isRemembered]  is a remembered fact still saved (null = unknown)
 * @param {(fact: string) => boolean} [o.onForgetMemory]  undo a remembered fact (shows an Undo button)
 * @param {object} [o.musicPlayer]  Apple Music: the shared preview player of the Music cards (src/ui/music/player.js)
 * @param {boolean} [o.isMac]       Apple Music: a Mac also gets "Open in Music app" (music://)
 * @param {(msg: string) => void} [o.notify]  a short note (a toast), e.g. why a preview did not start
 * @param {() => object} [o.getSettings]
 * @param {{ play: Function, haptic: Function }} [o.sounds]   optional feedback (SPEC §14.3)
 * @param {() => { title: string, subtitle: string, meta: string }} o.getGreeting
 * @param {boolean} o.ttsSupported
 */
export function createChat(o) {
  let conv = null;
  const turnViews = new Map(); // turnId -> view
  const dirty = new Map(); // turnId -> { full, segs:Set, missions:Set }
  let stick = true;
  let lastProgrammatic = 0;
  let heroCore = null;
  let coreState = 'idle';
  let ticker = 0;

  const transcript = h('div', { class: 'transcript' });
  const emptyHost = h('div', { class: 'empty-host' });
  const content = h('div', { class: 'chat-content' }, emptyHost, transcript);
  const scroller = h('section', { class: 'chat-scroll', attrs: { 'aria-label': 'Conversation' } }, content);
  const pill = h(
    'button',
    {
      class: 'activity-pill',
      type: 'button',
      hidden: true,
      attrs: { 'data-testid': 'new-activity' },
      on: { click: () => scrollToBottom(true) },
    },
    icon('arrow-down', { size: 16 }),
    h('span', { text: 'New activity' }),
  );
  const el = h('div', { class: 'chat-wrap' }, scroller, pill);

  // ---- scrolling ------------------------------------------------------------------
  const distance = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

  scroller.addEventListener(
    'scroll',
    () => {
      const d = distance();
      if (d <= STICK_PX) {
        stick = true;
        pill.hidden = true;
      } else if (performance.now() - lastProgrammatic > 80) {
        stick = false;
      }
    },
    { passive: true },
  );
  // An upward wheel/touch gesture always releases the stick, even mid-stream.
  scroller.addEventListener(
    'wheel',
    (e) => {
      if (e.deltaY < 0 && distance() > 2) stick = false;
    },
    { passive: true },
  );

  function scrollToBottom(smooth = false) {
    stick = true;
    pill.hidden = true;
    lastProgrammatic = performance.now();
    const top = scroller.scrollHeight;
    if (smooth && !reducedMotion()) scroller.scrollTo({ top, behavior: 'smooth' });
    else scroller.scrollTop = top;
  }

  // Growth caused by run events (streaming, agents) is "new activity"; growth from the
  // owner expanding a section of a finished turn is not.
  let lastEventAt = -Infinity;
  function onGrow() {
    if (!conv || !conv.turns || !conv.turns.length) return; // the empty state stays at the top
    if (stick) {
      lastProgrammatic = performance.now();
      scroller.scrollTop = scroller.scrollHeight;
    } else if (performance.now() - lastEventAt < 1500) {
      pill.hidden = false;
    }
  }

  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => onGrow());
    ro.observe(content);
    // The visible area changed (rotation, keyboard, banners): re-fit the empty-state hero.
    const roScroller = new ResizeObserver(() => {
      fitHero();
      keepFocusInView();
    });
    roScroller.observe(scroller);
  }

  // The on-screen keyboard shrinks the scroller (iOS): keep a focused field in it (a protocol's
  // input row) visible instead of leaving it under the keyboard.
  function keepFocusInView() {
    const a = document.activeElement;
    if (!a || !scroller.contains(a) || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
    const r = a.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (r.bottom <= box.bottom - 8 && r.top >= box.top) return;
    try {
      a.scrollIntoView({ block: 'center', behavior: 'auto' });
    } catch {
      /* ignore */
    }
  }

  // ---- empty state ----------------------------------------------------------------
  // Layout: the "fold" (hero core, greeting, suggestions) fills the first screen, and the
  // Protocols grid follows below it, its heading peeking in at the bottom as a cue to scroll.
  let emptyEl = null;
  let greetEls = null; // { title, sub, meta }
  let protocolGrid = null;
  function mountProtocols() {
    if (typeof o.onProtocol !== 'function') return null;
    try {
      protocolGrid = createProtocolGrid({
        getSettings: o.getSettings,
        onRun: (text, mode, p) => o.onProtocol(text, mode, p),
        sounds: o.sounds || null,
        // Presence home (SPEC 2.4.4 item 9): one horizontally scrolling row of 152×92 cards.
        layout: o.home ? 'row' : 'grid',
      });
      return h('div', { class: 'empty-protocols' }, protocolGrid.el);
    } catch (err) {
      console.error('[jarvis] protocol grid failed:', err);
      protocolGrid = null;
      return null;
    }
  }
  // ---- Presence home (SPEC 2.4.4) ----------------------------------------------------------------
  // From the top: the hero core (tap: Voice Mode; long-press: what the rings mean), the state
  // word, the greeting, the situation line, Needs-you, the quick keys, the starter prompts (first
  // three conversations only), then the protocols row. o.home (src/ui/presence/presence.js) owns
  // the live pieces; this places them and runs the hero core.
  function renderPresenceHome() {
    const home = o.home;
    const g = o.getGreeting();
    const canvas = h('canvas', { class: 'hero-core-canvas', attrs: { 'data-testid': 'hero-core', 'aria-hidden': 'true' } });
    const starters = typeof o.showStarters === 'function' ? !!o.showStarters() : true;
    const suggestions = starters
      ? pickSuggestions().map((s) =>
          h(
            'button',
            {
              class: ['suggestion', `suggestion--${s.mode}`],
              type: 'button',
              attrs: { 'data-testid': 'suggestion', 'data-mode': s.mode },
              on: { click: () => o.onSuggestion(s.text, s.mode) },
            },
            h('span', { class: 'suggestion-icon' }, icon(s.icon, { size: 18 })),
            h('span', { class: 'suggestion-body' }, h('span', { class: 'suggestion-tag', text: s.tag }), h('span', { class: 'suggestion-text', text: s.text })),
            icon('chevron-right', { size: 16, class: 'suggestion-go' }),
          ),
        )
      : [];
    greetEls = {
      title: h('h1', { class: 'greeting', text: g.title }),
      // The capability line is onboarding: it shows with the starter prompts only.
      sub: h('p', { class: 'greeting-sub', text: g.subtitle, hidden: !starters }),
      meta: h('p', { class: 'greeting-meta', text: '', hidden: true }),
    };
    const reticle = h('div', { class: 'hero-reticle', attrs: { 'aria-hidden': 'true' } });
    let core;
    if (typeof o.onVoice === 'function') {
      core = h(
        'button',
        {
          class: 'hero-core hero-core--talk',
          type: 'button',
          attrs: { 'aria-label': 'Talk to Jarvis (voice mode). Long-press for what the rings mean', title: 'Talk to Jarvis · long-press: what the rings mean', 'data-testid': 'hero-talk', 'aria-haspopup': 'dialog' },
        },
        canvas,
        reticle,
      );
      home.bindHero(core, () => o.onVoice());
    } else {
      core = h('div', { class: 'hero-core' }, canvas, reticle);
    }
    const fold = h(
      'div',
      { class: 'empty-fold presence-fold' },
      home.morningEl || null,
      h('div', { class: 'hero' }, core, home.readoutsEl, home.legendEl),
      home.stateWordEl,
      greetEls.title,
      home.situationEl,
      greetEls.sub,
      greetEls.meta,
      home.needsEl,
      home.keysEl,
      home.homeBaseEl || null,
      suggestions.length ? h('div', { class: 'suggestions suggestions--starters', attrs: { role: 'list', 'aria-label': 'Suggestions' } }, suggestions.map((b) => h('div', { class: 'suggestion-item', attrs: { role: 'listitem' } }, b))) : null,
    );
    const protocols = mountProtocols();
    emptyEl = h('div', { class: ['empty-state', 'presence-home', protocols && 'has-protocols'], attrs: { 'data-testid': 'empty-state' } }, fold, protocols);
    emptyHost.appendChild(emptyEl);
    sizeHero(true);
    try {
      heroCore = createCore(canvas, { mode: 'hero' });
      heroCore.setState(coreState);
    } catch (err) {
      console.error('[jarvis] hero core failed:', err);
      heroCore = null;
    }
    home.attachCore(heroCore);
  }

  // Discrete hero sizes (SPEC 2.4.4): 232 on desktop; 184 / 148 / 120 on phones by height.
  let sizeKey = '';
  function sizeHero(force) {
    if (!emptyEl || !o.home) return;
    const core = emptyEl.querySelector('.hero-core');
    if (!core) return;
    const active = document.activeElement;
    if (!force && active && emptyEl.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
    const size = o.home.heroSize();
    const key = String(size);
    if (!force && key === sizeKey) return;
    sizeKey = key;
    const hero = core.parentElement;
    if (hero) hero.style.setProperty('--hero-size', `${size}px`);
    emptyEl.dataset.hero = String(size);
    if (force) scroller.scrollTop = 0;
  }

  function renderEmpty() {
    destroyEmpty();
    if (o.home) {
      renderPresenceHome();
      return;
    }
    const g = o.getGreeting();
    const canvas = h('canvas', { class: 'hero-core-canvas', attrs: { 'data-testid': 'hero-core', 'aria-hidden': 'true' } });
    const suggestions = pickSuggestions().map((s) =>
      h(
        'button',
        {
          class: ['suggestion', `suggestion--${s.mode}`],
          type: 'button',
          attrs: { 'data-testid': 'suggestion', 'data-mode': s.mode },
          on: { click: () => o.onSuggestion(s.text, s.mode) },
        },
        h('span', { class: 'suggestion-icon' }, icon(s.icon, { size: 18 })),
        h('span', { class: 'suggestion-body' }, h('span', { class: 'suggestion-tag', text: s.tag }), h('span', { class: 'suggestion-text', text: s.text })),
        icon('chevron-right', { size: 16, class: 'suggestion-go' }),
      ),
    );
    greetEls = {
      title: h('h1', { class: 'greeting', text: g.title }),
      sub: h('p', { class: 'greeting-sub', text: g.subtitle }),
      meta: h('p', { class: 'greeting-meta', text: g.meta || '', hidden: !g.meta }),
    };
    const reticle = h('div', { class: 'hero-reticle', attrs: { 'aria-hidden': 'true' } });
    // With Voice Mode available, the core itself is the way in: tap it to talk to Jarvis.
    const core =
      typeof o.onVoice === 'function'
        ? h(
            'button',
            { class: 'hero-core hero-core--talk', type: 'button', attrs: { 'aria-label': 'Talk to Jarvis (voice mode)', title: 'Talk to Jarvis', 'data-testid': 'hero-talk' }, on: { click: () => o.onVoice() } },
            canvas,
            reticle,
          )
        : h('div', { class: 'hero-core' }, canvas, reticle);
    const fold = h(
      'div',
      { class: 'empty-fold' },
      h('div', { class: 'hero' }, core),
      greetEls.title,
      greetEls.sub,
      greetEls.meta,
      h('div', { class: 'suggestions', attrs: { role: 'list', 'aria-label': 'Suggestions' } }, suggestions.map((b) => h('div', { class: 'suggestion-item', attrs: { role: 'listitem' } }, b))),
    );
    const protocols = mountProtocols();
    emptyEl = h('div', { class: ['empty-state', protocols && 'has-protocols'], attrs: { 'data-testid': 'empty-state' } }, fold, protocols);
    emptyHost.appendChild(emptyEl);
    try {
      heroCore = createCore(canvas, { size: 220, mode: 'hero' });
      heroCore.setState(coreState);
    } catch (err) {
      console.error('[jarvis] hero core failed:', err);
      heroCore = null;
    }
    fitHero(true);
  }

  /** Update the greeting in place (time of day, name, model): keeps the core and the grid. */
  function updateGreeting() {
    if (!emptyEl || !greetEls) return;
    const g = o.getGreeting();
    setText(greetEls.title, g.title);
    setText(greetEls.sub, g.subtitle);
    if (o.home) return; // the Presence home has no meta line (the rail's Systems glance shows the model)
    setText(greetEls.meta, g.meta || '');
    greetEls.meta.hidden = !g.meta;
  }

  // Size the hero core so the fold fits the visible area (with the Protocols heading peeking
  // in below it): measure the fold with the hero at full size, shrink the hero by the
  // overflow, hide it below 88px. Without protocols the whole empty state must fit.
  const HERO_MAX = 220;
  const HERO_MIN = 88;
  const HERO_COMFY = 132; // below this, a one-column phone drops a suggestion to keep the core
  let fitKey = '';
  function fitHero(force) {
    if (!emptyEl) return;
    if (o.home) {
      sizeHero(force);
      return;
    }
    const core = emptyEl.querySelector('.hero-core');
    const hero = emptyEl.querySelector('.hero');
    const fold = emptyEl.querySelector('.empty-fold');
    if (!core || !hero || !fold) return;
    const key = `${scroller.clientWidth}x${scroller.clientHeight}`;
    if (!force && key === fitKey) return;
    // While the owner types in the empty state (a protocol's input row), the on-screen
    // keyboard shrinks the view: keep everything still rather than refit under their finger.
    const active = document.activeElement;
    if (!force && active && emptyEl.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
    fitKey = key;
    const more = emptyEl.classList.contains('has-protocols');
    // Leave the Protocols heading and the top of its tiles visible under the fold.
    const peek = Math.round(Math.min(76, Math.max(52, scroller.clientHeight * 0.115)));
    hero.hidden = false;
    fold.style.minHeight = '';
    emptyEl.classList.remove('is-tight');
    core.style.setProperty('--hero-size', `${HERO_MAX}px`);
    let overflow = 0;
    let avail = 0;
    const measure = () => {
      if (more) {
        const top = fold.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        avail = Math.floor(scroller.clientHeight - top - peek);
        overflow = Math.max(0, fold.offsetHeight - avail);
      } else {
        overflow = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      }
    };
    measure();
    if (more && HERO_MAX - overflow < HERO_COMFY && oneColumn()) {
      emptyEl.classList.add('is-tight'); // the grid below covers research anyway
      measure();
    }
    const size = Math.floor(HERO_MAX - overflow);
    if (size < HERO_MIN) {
      core.style.setProperty('--hero-size', `${HERO_MIN}px`);
      hero.hidden = more ? fold.offsetHeight > avail : scroller.scrollHeight > scroller.clientHeight;
    } else {
      core.style.setProperty('--hero-size', `${size}px`);
    }
    // Center the fold in the first screen; the grid starts just below it.
    if (more && avail > 0) fold.style.minHeight = `${avail}px`;
    if (force) scroller.scrollTop = 0;
  }

  function destroyEmpty() {
    if (heroCore) {
      if (o.home) o.home.attachCore(null);
      try {
        heroCore.destroy();
      } catch {
        /* ignore */
      }
      heroCore = null;
    }
    if (protocolGrid) {
      try {
        protocolGrid.destroy();
      } catch {
        /* ignore */
      }
      protocolGrid = null;
    }
    if (emptyEl) emptyEl.remove();
    emptyEl = null;
    greetEls = null;
  }
  function updateEmpty() {
    const empty = !conv || !conv.turns || conv.turns.length === 0;
    el.classList.toggle('is-empty', empty); // before rendering: it changes the paddings fitHero measures
    if (empty && !emptyEl) renderEmpty();
    else if (!empty && emptyEl) destroyEmpty();
  }

  // ---- dirty tracking ---------------------------------------------------------------
  const schedule = raf(flush);
  function mark(turnId, kind, id) {
    if (!turnId) return;
    let d = dirty.get(turnId);
    if (!d) dirty.set(turnId, (d = { full: false, segs: new Set(), missions: new Set() }));
    if (kind === 'seg') d.segs.add(id);
    else if (kind === 'mission') d.missions.add(id);
    else d.full = true;
    schedule();
  }

  function flush() {
    if (!conv) return;
    syncTurns();
    for (const [turnId, d] of dirty) {
      const view = turnViews.get(turnId);
      // One turn that can't render must never stop the others (or the live one) from updating.
      if (view && view.reconcile) reconcileSafely(view, d);
    }
    dirty.clear();
    updateEmpty();
    updateTicker();
  }

  function reconcileSafely(view, d) {
    try {
      view.reconcile(d);
    } catch (err) {
      console.error('[jarvis] turn render failed:', err);
    }
  }

  function createTurnView(turn) {
    try {
      return turn.role === 'user' ? createUserTurnView(turn, o) : createJarvisTurnView(turn, ctx);
    } catch (err) {
      console.error('[jarvis] turn view failed:', err);
      return createBrokenTurnView(turn);
    }
  }

  // ---- turns ------------------------------------------------------------------------
  function syncTurns() {
    const turns = Array.isArray(conv && conv.turns) ? conv.turns : [];
    const seen = new Set();
    let prev = null;
    for (const turn of turns) {
      if (!isObj(turn) || !turn.id || seen.has(turn.id)) continue;
      seen.add(turn.id);
      let view = turnViews.get(turn.id);
      if (!view) {
        view = createTurnView(turn);
        turnViews.set(turn.id, view);
        if (view.reconcile) reconcileSafely(view, { full: true, segs: new Set(), missions: new Set() });
      }
      const expected = prev ? prev.nextSibling : transcript.firstChild;
      if (view.el !== expected) transcript.insertBefore(view.el, expected);
      prev = view.el;
    }
    for (const [id, view] of turnViews) {
      if (!seen.has(id)) {
        view.el.remove();
        if (view.destroy) view.destroy();
        turnViews.delete(id);
      }
    }
  }

  function updateTicker() {
    let anyLive = false;
    for (const view of turnViews.values()) if (view.isLive && view.isLive()) anyLive = true;
    if (anyLive && !ticker) {
      ticker = setInterval(() => {
        for (const view of turnViews.values()) if (view.tick) view.tick();
      }, 1000);
    } else if (!anyLive && ticker) {
      clearInterval(ticker);
      ticker = 0;
    }
  }

  const ctx = {
    isActive: (turnId) => {
      try {
        return !!o.isTurnActive(turnId);
      } catch {
        return false;
      }
    },
    canResume: () => {
      try {
        return !!o.canResume();
      } catch {
        return false;
      }
    },
    /** The open conversation is being run by another window (no Resume here). */
    runningElsewhere: () => {
      try {
        return typeof o.runningElsewhere === 'function' && !!o.runningElsewhere();
      } catch {
        return false;
      }
    },
    isLastTurn: (turnId) => {
      const turns = Array.isArray(conv && conv.turns) ? conv.turns : [];
      const last = turns[turns.length - 1];
      return isObj(last) && last.id === turnId;
    },
    isSpeaking: (turnId) => {
      try {
        return !!o.isSpeaking(turnId);
      } catch {
        return false;
      }
    },
    // v7.8: the voice reading a reply aloud: { engine, label } or null.
    speakingVoice: (turnId) => {
      try {
        return typeof o.speakingVoice === 'function' ? o.speakingVoice(turnId) || null : null;
      } catch {
        return null;
      }
    },
    ttsSupported: !!o.ttsSupported,
    o,
  };

  // ---- public API -------------------------------------------------------------------
  return {
    el,
    scroller,
    /** Show a conversation (or null for a fresh empty chat). */
    setConversation(next) {
      schedule.cancel();
      dirty.clear();
      for (const view of turnViews.values()) {
        view.el.remove();
        if (view.destroy) view.destroy();
      }
      turnViews.clear();
      conv = next || null;
      syncTurns();
      updateEmpty();
      updateTicker();
      if (conv && conv.turns && conv.turns.length) scrollToBottom(false);
      else {
        stick = true;
        pill.hidden = true;
        scroller.scrollTop = 0;
      }
    },
    getConversation: () => conv,
    /** Reconcile the turn list now (after startTurn/resumeTurn appended turns). */
    sync() {
      if (!conv) return;
      for (const turn of turnsOf(conv)) mark(turn.id, 'full');
      schedule.flush();
    },
    /** A TurnRun event for the current conversation. */
    handleEvent(evt) {
      if (!conv || !evt) return;
      lastEventAt = performance.now();
      const turnId = evt.turn && evt.turn.id;
      switch (evt.type) {
        case 'segment':
          if (evt.segment) mark(turnId, 'seg', evt.segment.id);
          break;
        case 'mission':
        case 'agent':
          if (evt.mission) mark(turnId, 'mission', evt.mission.id);
          break;
        case 'turn':
        case 'end':
        case 'usage':
        case 'segment-removed':
          mark(turnId, 'full');
          break;
        default:
          break;
      }
    },
    /** Re-evaluate everything for one turn (or all) on the next frame. */
    refresh(turnId) {
      if (!conv) return;
      if (turnId) mark(turnId, 'full');
      else for (const turn of turnsOf(conv)) mark(turn.id, 'full');
    },
    /** Update speaking indicators on footers. */
    refreshSpeaking() {
      for (const view of turnViews.values()) if (view.syncSpeak) view.syncSpeak();
    },
    /** Memory changed (undo, Settings, another tab): update the "Remembered" chips. */
    refreshMemory() {
      for (const view of turnViews.values()) if (view.refreshMemory) view.refreshMemory();
    },
    scrollToBottom,
    setCoreState(state) {
      coreState = state;
      if (heroCore) {
        try {
          heroCore.setState(state);
        } catch {
          /* ignore */
        }
      }
    },
    setCoreLevel(level) {
      if (heroCore) {
        try {
          heroCore.setLevel(level);
        } catch {
          /* ignore */
        }
      }
    },
    /** Refresh the greeting (name, time of day or model changed). */
    refreshEmpty() {
      updateGreeting();
    },
    /** Rebuild the home screen (the starter prompts' onboarding window changed). */
    rebuildEmpty() {
      if (emptyEl) renderEmpty();
    },
    /** The empty state's element (the Presence boot sequence animates it), or null. */
    emptyElement: () => emptyEl,
    /** The hero core, while the home screen shows. */
    heroCore: () => heroCore,
    isEmpty: () => !conv || !conv.turns || conv.turns.length === 0,
    /** Place follow-up chips (SPEC §14.5) under a turn. Returns false if the turn isn't shown. */
    showFollowups(turnId, chipsEl) {
      const view = turnViews.get(turnId);
      if (!view || !chipsEl) return false;
      view.el.appendChild(chipsEl);
      return true;
    },
  };
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Suggestions stack in one column (phones); matches the breakpoint in chat.css. */
function oneColumn() {
  try {
    return window.matchMedia('(max-width: 639px)').matches;
  } catch {
    return true;
  }
}

/** The Jarvis label row's mark (SPEC 2.4.5): a static 14px core, two arcs and a dot. */
function coreGlyph() {
  return h(
    'svg',
    { class: 'turn-glyph', viewBox: '0 0 14 14', width: '14', height: '14', 'aria-hidden': 'true', focusable: 'false' },
    h('path', { class: 'turn-glyph__arc', d: 'M2.5 4.2A5.4 5.4 0 0 1 11.8 4.4' }),
    h('path', { class: 'turn-glyph__arc', d: 'M11.5 9.8A5.4 5.4 0 0 1 2.2 9.6' }),
    h('circle', { class: 'turn-glyph__dot', cx: '7', cy: '7', r: '2.1' }),
  );
}

// ---- user turn ----------------------------------------------------------------------

/** Stand-in for a stored turn too damaged to render (keeps the rest of the transcript usable). */
function createBrokenTurnView(turn) {
  const user = isObj(turn) && turn.role === 'user';
  const el = h(
    'div',
    { class: ['turn', user ? 'turn--user' : 'turn--jarvis', 'turn--broken'], attrs: { 'data-testid': user ? 'turn-user' : 'turn-jarvis', 'data-status': user ? null : 'error' } },
    h('p', { class: 'turn-broken-text', text: user ? txt(turn.text) || 'This message couldn’t be displayed.' : 'This reply couldn’t be displayed.' }),
  );
  return { el, kind: user ? 'user' : 'jarvis' };
}

function createUserTurnView(turn, o = {}) {
  // An Optics Look shows its frame card instead of the mode tag and the attachment strip.
  const optics = isObj(turn.optics) && Array.isArray(turn.attachments) && turn.attachments.length;
  const tag = !optics && (turn.mode === 'swarm' || turn.mode === 'quick') ? h('span', { class: ['turn-mode', `turn-mode--${turn.mode}`], text: turn.mode === 'swarm' ? 'Swarm' : 'Quick' }) : null;
  // Photos and PDFs sent with the message (SPEC §15.1: metadata and thumbnails only).
  let strip = null;
  if (optics) {
    try {
      strip = h('div', { class: 'turn-attachments' }, createOpticsTurnCard(turn, { onOpen: (t) => typeof o.onOpenOptics === 'function' && o.onOpenOptics(t, null) }));
    } catch (err) {
      console.error('[jarvis] optics card failed:', err);
      strip = null;
    }
  } else if (Array.isArray(turn.attachments) && turn.attachments.length) {
    try {
      strip = h('div', { class: 'turn-attachments' }, createAttachmentStrip(turn.attachments, { size: 'md' }));
    } catch (err) {
      console.error('[jarvis] attachment strip failed:', err);
      strip = null;
    }
  }
  const text = typeof turn.text === 'string' ? turn.text : '';
  // A protocol run shows its headline with the full brief tucked behind a disclosure.
  let protocol = null;
  try {
    protocol = text ? createProtocolBubble(text) : null;
  } catch {
    protocol = null;
  }
  const bubble = text.trim() || !strip ? h('div', { class: ['bubble', protocol && 'bubble--protocol'] }, protocol || text) : null;
  const el = h('div', { class: 'turn turn--user', attrs: { 'data-testid': 'turn-user' } }, tag, strip, bubble);
  return { el, kind: 'user' };
}

// ---- Jarvis turn ----------------------------------------------------------------------

function createJarvisTurnView(turn, ctx) {
  const o = ctx.o;
  const segViews = new Map();
  const segsEl = h('div', { class: 'segments' });
  // A local Apple Music reply ("play X", free) used no model.
  const modelShort = turn.local ? '' : (MODELS && MODELS[turn.leadModel] && MODELS[turn.leadModel].short) || '';

  const head = h(
    'div',
    { class: 'turn-head' },
    coreGlyph(),
    h('span', { class: 'turn-name', text: 'Jarvis' }),
    modelShort ? h('span', { class: 'turn-model', text: modelShort }) : null,
  );

  // Pending row: visible while the turn runs and nothing else shows activity.
  const pendingLabel = h('span', { class: 'pending-label', text: 'Thinking…' });
  const pendingTime = h('span', { class: 'pending-time' });
  const pending = h(
    'div',
    { class: 'turn-pending', hidden: true, attrs: { 'aria-hidden': 'true' } },
    h('span', { class: 'pending-bars' }, h('i'), h('i'), h('i'), h('i')),
    pendingLabel,
    pendingTime,
  );

  // Footer
  const footerNotice = h('div', { class: 'turn-notices' });
  const copyBtn = h(
    'button',
    { class: 'foot-btn', type: 'button', attrs: { 'data-testid': 'turn-copy', 'aria-label': 'Copy reply' }, on: { click: () => doCopy() } },
    icon('copy', { size: 16 }),
    h('span', { text: 'Copy' }),
  );
  const speakLabel = h('span', { text: 'Speak' });
  const speakIcon = h('span', { class: 'foot-icon' }, icon('speaker', { size: 16 }));
  const speakBtn = ctx.ttsSupported
    ? h('button', { class: 'foot-btn', type: 'button', attrs: { 'data-testid': 'turn-speak', 'aria-label': 'Read reply aloud' }, on: { click: () => o.onSpeak(turn) } }, speakIcon, speakLabel)
    : null;
  const missionBtn = h(
    'button',
    { class: 'foot-btn', type: 'button', hidden: true, attrs: { 'data-testid': 'turn-mission', 'aria-label': 'Open Mission Control' }, on: { click: () => o.onOpenMission(turn, lastMissionId()) } },
    icon('target', { size: 16 }),
    h('span', { text: 'Mission' }),
  );
  const shareBtn =
    typeof o.onShare === 'function'
      ? h(
          'button',
          { class: 'foot-btn', type: 'button', hidden: true, attrs: { 'data-testid': 'turn-share', 'aria-label': 'Share or export reply' }, on: { click: () => o.onShare(turn) } },
          icon('share', { size: 16 }),
          h('span', { text: 'Share' }),
        )
      : null;
  const stats = h('div', { class: 'turn-stats', attrs: { 'data-testid': 'turn-stats' } });
  // v7.8: while it is read aloud, the voice reading it ("George · home base", "iPhone voice"…).
  const speakVoice = speakBtn ? createVoiceTag({ testid: 'turn-speak-voice' }) : null;
  const actions = h('div', { class: 'turn-actions' }, copyBtn, speakBtn, speakVoice ? speakVoice.el : null, missionBtn, shareBtn);
  const footer = h('div', { class: 'turn-footer', hidden: true }, footerNotice, h('div', { class: 'turn-foot-row' }, actions, stats));

  const el = h('article', { class: 'turn turn--jarvis', attrs: { 'data-testid': 'turn-jarvis', 'data-status': txt(turn.status) || 'running', 'data-turn-id': txt(turn.id), 'aria-label': 'Jarvis reply' } }, head, segsEl, pending, footer);

  let copyTimer = 0;
  function doCopy() {
    o.onCopy(turn);
    copyBtn.classList.add('is-done');
    copyBtn.replaceChildren(icon('check', { size: 16 }), h('span', { text: 'Copied' }));
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyBtn.classList.remove('is-done');
      copyBtn.replaceChildren(icon('copy', { size: 16 }), h('span', { text: 'Copy' }));
    }, 1600);
  }

  function lastMissionId() {
    const missions = missionsOf(turn);
    const ids = Object.keys(missions).filter((id) => isObj(missions[id]));
    if (!ids.length) return undefined;
    // Prefer the mission of the last mission segment (display order), else the newest.
    const segs = (Array.isArray(turn.segments) ? turn.segments : []).filter((s) => isObj(s) && s.kind === 'mission' && isObj(missions[s.missionId]));
    if (segs.length) return segs[segs.length - 1].missionId;
    return ids.sort((a, b) => count(missions[a].createdAt) - count(missions[b].createdAt)).pop();
  }

  const isRunning = () => turn.status === 'running' && ctx.isActive(turn.id);
  const isStale = () => turn.status === 'running' && !ctx.isActive(turn.id);

  function segCtx() {
    return {
      openMission: (missionId) => o.onOpenMission(turn, missionId),
      openSettings: (section) => o.onOpenSettings(section),
      newChat: () => o.onNewChat(),
      retry: () => o.onRetry(turn),
      turnStatus: () => turn.status,
      // Memory chips (SPEC §6 memory segments): is the fact still saved, and undoing it.
      isRemembered: (fact) => {
        try {
          return typeof o.isRemembered === 'function' ? o.isRemembered(fact) : null;
        } catch {
          return null;
        }
      },
      canForget: () => typeof o.onForgetMemory === 'function',
      forgetMemory: (fact) => {
        try {
          return typeof o.onForgetMemory === 'function' ? !!o.onForgetMemory(fact) : false;
        } catch (err) {
          console.error('[jarvis] forgetting a memory failed:', err);
          return false;
        }
      },
      // Hologram and blueprint cards: open the viewer; thumbnails from the saved library.
      openVisual: (seg) => {
        const fn = seg && seg.kind === 'blueprint' ? o.onOpenBlueprint : o.onOpenHologram;
        if (typeof fn === 'function') fn(turn, seg);
      },
      canOpenVisual: () => typeof o.onOpenHologram === 'function',
      thumbs: o.thumbs || null,
      // Optics: reopen the frozen frame with this turn's pinned labels.
      openOptics: typeof o.onOpenOptics === 'function' ? (seg) => o.onOpenOptics(turn, seg) : null,
      // View only where the picture is kept (a Look, or a frame Jarvis took with its preview).
      canReviewOptics: typeof o.canReviewOptics === 'function' ? (seg) => o.canReviewOptics(turn, seg) : null,
      // Apple Music cards: the shared preview player, the Mac's Music app link, short notes.
      musicPlayer: o.musicPlayer || null,
      isMac: !!o.isMac,
      notify: typeof o.notify === 'function' ? o.notify : null,
    };
  }

  function reconcile(d) {
    const segs = (Array.isArray(turn.segments) ? turn.segments : []).filter(isObj);
    const running = isRunning();
    const lastIdx = segs.length - 1;
    const seen = new Set();
    let prev = null;
    segs.forEach((seg, i) => {
      if (!seg || !seg.id) return;
      seen.add(seg.id);
      let view = segViews.get(seg.id);
      let fresh = false;
      if (!view || view.kind !== seg.kind) {
        if (view) {
          view.el.remove();
          view.destroy && view.destroy();
        }
        view = createSegmentView(seg, segCtx());
        segViews.set(seg.id, view);
        fresh = true;
      }
      const live = running && i === lastIdx;
      const touched = fresh || d.full || d.segs.has(seg.id) || (seg.kind === 'mission' && d.missions.has(seg.missionId)) || view.live !== live;
      if (touched) {
        view.live = live;
        try {
          view.update(seg, { live, running, turn });
        } catch (err) {
          console.error('[jarvis] segment render failed:', err);
        }
      }
      const expected = prev ? prev.nextSibling : segsEl.firstChild;
      if (view.el !== expected) segsEl.insertBefore(view.el, expected);
      prev = view.el;
    });
    for (const [id, view] of segViews) {
      if (!seen.has(id)) {
        view.el.remove();
        view.destroy && view.destroy();
        segViews.delete(id);
      }
    }
    el.dataset.status = txt(turn.status) || 'running';
    el.classList.toggle('is-running', running);
    el.classList.toggle('is-stale', isStale());
    updatePending(segs, running);
    if (d.full || !running) updateFooter(segs, running);
  }

  function updatePending(segs, running) {
    if (!running) {
      pending.hidden = true;
      return;
    }
    const last = segs[segs.length - 1];
    let label = '';
    if (!last) label = 'Thinking…';
    else if (last.kind === 'mission') {
      const m = missionsOf(turn)[last.missionId];
      if (isObj(m) && !['planning', 'running'].includes(m.status)) label = 'Synthesizing reports…';
    } else if (last.kind === 'tool' && last.status !== 'running') label = 'Thinking…';
    else if (last.kind === 'memory' || last.kind === 'notice') label = 'Thinking…';
    else if ((last.kind === 'hologram' || last.kind === 'blueprint') && last.status !== 'building') label = 'Thinking…';
    else if (last.kind === 'thinking' && last.endedAt) label = 'Writing…';
    else if (last.kind === 'error') label = 'Retrying…';
    pending.hidden = !label;
    if (label) setText(pendingLabel, label);
    tick();
  }

  function tick() {
    if (pending.hidden) return;
    const started = count(turn.createdAt) || Date.now();
    setText(pendingTime, duration(Date.now() - started));
  }

  let noticeKey = '';
  function updateFooter(segs, running) {
    const finished = !running;
    footer.hidden = !finished;
    if (!finished) return;

    const status = turn.status;
    const hasErrorSeg = segs.some((s) => s.kind === 'error');
    const showError = status === 'error' && !!turn.error && !hasErrorSeg;
    const elsewhere = (status === 'interrupted' || status === 'running') && ctx.isLastTurn(turn.id) && ctx.runningElsewhere();
    const showResume = !elsewhere && (status === 'interrupted' || isStale()) && ctx.isLastTurn(turn.id);
    const canResume = showResume && ctx.canResume();
    // Rebuild the notices only when what they show changes (keeps focus on Resume).
    const key = [showError && `${turn.error.kind}|${turn.error.message}`, showResume, canResume, elsewhere].join('|');
    if (key !== noticeKey) {
      noticeKey = key;
      footerNotice.replaceChildren();
      if (showError) footerNotice.appendChild(createErrorView({ id: 'turn-error', kind: 'error', error: turn.error }, segCtx(), true).el);
      if (elsewhere) {
        footerNotice.appendChild(
          h(
            'div',
            { class: 'resume-card', attrs: { role: 'status', 'data-testid': 'running-elsewhere' } },
            h('span', { class: 'resume-icon' }, icon('layers', { size: 18 })),
            h('div', { class: 'resume-text' }, h('strong', { text: 'Running in another window' }), h('span', { text: 'Jarvis is still working on this reply in another window or tab. It shows here when it’s done.' })),
          ),
        );
      }
    }
    if (showResume && !footerNotice.querySelector('.resume-card')) {
      footerNotice.appendChild(
        h(
          'div',
          { class: 'resume-card', attrs: { role: 'group', 'aria-label': 'Interrupted reply' } },
          h('span', { class: 'resume-icon' }, icon('wifi-off', { size: 18 })),
          h(
            'div',
            { class: 'resume-text' },
            h('strong', { text: 'Interrupted' }),
            h('span', { text: canResume ? 'The connection dropped before Jarvis finished. Completed work is kept.' : 'This reply was cut off before it finished.' }),
          ),
          canResume
            ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', attrs: { 'data-testid': 'resume-button' }, on: { click: () => o.onResume() } }, icon('refresh', { size: 16 }), h('span', { text: 'Resume' }))
            : h('button', { class: 'btn btn-sm', type: 'button', on: { click: () => o.onRetry(turn) } }, icon('refresh', { size: 16 }), h('span', { text: 'Try again' })),
        ),
      );
    }
    footerNotice.hidden = !footerNotice.firstChild;

    const hasText = segs.some((s) => s.kind === 'text' && txt(s.text).trim());
    copyBtn.hidden = !hasText;
    if (speakBtn) speakBtn.hidden = !hasText;
    missionBtn.hidden = !Object.values(missionsOf(turn)).some(isObj);
    if (shareBtn) shareBtn.hidden = !hasText && missionBtn.hidden;
    syncSpeak();

    if (turn.local === 'homebase') {
      setText(stats, 'Free · Home base');
      stats.title = 'Answered by your home base (the Jarvis Core): no Claude request, no cost';
      return;
    }
    if (turn.local) {
      setText(stats, 'Free · Apple Music');
      stats.title = 'Searched Apple Music on this device: no Claude request, no cost';
      return;
    }
    const st = isObj(turn.stats) ? turn.stats : {};
    const parts = [];
    if (status === 'stopped') parts.push('Stopped');
    if (count(st.agents)) parts.push(plural(st.agents, 'agent', 'agents'));
    if (count(st.searches)) parts.push(plural(st.searches, 'search', 'searches'));
    if (count(st.sources)) parts.push(plural(st.sources, 'source', 'sources'));
    const dur = count(st.durationMs) || (count(turn.endedAt) && count(turn.createdAt) ? Math.max(0, turn.endedAt - turn.createdAt) : 0);
    if (dur) parts.push(duration(dur));
    parts.push(usd(turn.costUsd || 0));
    setText(stats, parts.join(' · '));
    stats.title = 'Cost is an estimate from token counts';
  }

  function syncSpeak() {
    if (!speakBtn) return;
    const speaking = ctx.isSpeaking(turn.id);
    speakBtn.classList.toggle('is-active', speaking);
    setText(speakLabel, speaking ? 'Stop' : 'Speak');
    speakBtn.setAttribute('aria-label', speaking ? 'Stop reading' : 'Read reply aloud');
    speakIcon.replaceChildren(icon(speaking ? 'speaker-off' : 'speaker', { size: 16 }));
    if (speakVoice) {
      const v = speaking ? ctx.speakingVoice(turn.id) : null;
      speakVoice.set(v && v.engine, v && v.label);
    }
  }

  /** Re-check the memory chips (memory changed: a fact was undone or edited in Settings). */
  function refreshMemory() {
    for (const view of segViews.values()) {
      if (view.kind === 'memory' && view.refresh) {
        try {
          view.refresh();
        } catch (err) {
          console.error('[jarvis] memory chip failed:', err);
        }
      }
    }
  }

  return {
    el,
    kind: 'jarvis',
    reconcile,
    syncSpeak,
    tick,
    refreshMemory,
    isLive: () => isRunning(),
    destroy() {
      clearTimeout(copyTimer);
      for (const view of segViews.values()) view.destroy && view.destroy();
      segViews.clear();
    },
  };
}

// ---- segments -----------------------------------------------------------------------

function createSegmentView(seg, sctx) {
  switch (seg.kind) {
    case 'thinking':
      return createThinkingView();
    case 'text':
      return createTextView();
    case 'tool':
      return createToolView();
    case 'mission':
      return createMissionView(sctx);
    case 'memory':
      return createMemoryView(sctx);
    case 'notice':
      return createNoticeView();
    case 'error':
      return createErrorView(seg, sctx, false);
    case 'hologram':
    case 'blueprint':
      return createVisualCardView(seg.kind, sctx);
    case 'pins':
      return createPinsSegmentView(sctx);
    case 'frame':
      return createFrameSegmentView(sctx);
    case 'music':
      return createMusicCardView({ player: sctx.musicPlayer, isMac: sctx.isMac, notify: sctx.notify });
    default:
      return { kind: seg.kind, el: h('div', { class: 'seg seg-unknown', hidden: true }), update() {} };
  }
}

function createThinkingView() {
  let open = false;
  let seg = null;
  let live = false;
  let renderedText = null;
  let renderedLive = null;
  let lastAt = 0;
  let timer = 0;

  const label = h('span', { class: 'think-label', text: 'Thinking…' });
  const chevron = h('span', { class: 'think-chevron' }, icon('chevron-down', { size: 16 }));
  const toggle = h(
    'button',
    { class: 'think-toggle', type: 'button', attrs: { 'aria-expanded': 'false' }, on: { click: () => setOpen(!open) } },
    h('span', { class: 'think-icon' }, icon('sparkle', { size: 16 })),
    label,
    chevron,
  );
  const body = h('div', { class: 'think-body prose prose--dim', hidden: true });
  const el = h('div', { class: 'seg seg-thinking', attrs: { 'data-testid': 'segment-thinking' } }, toggle, body);

  function setOpen(v) {
    open = v;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.hidden = !open;
    el.classList.toggle('is-open', open);
    if (open) renderBody(true);
  }

  function renderBody(force) {
    if (!open || !seg) return;
    const text = txt(seg.text);
    if (!force && text === renderedText && live === renderedLive) return;
    const wait = MD_INTERVAL - (performance.now() - lastAt);
    if (!force && live && wait > 0) {
      if (!timer) timer = setTimeout(() => {
        timer = 0;
        renderBody(true);
      }, wait);
      return;
    }
    clearTimeout(timer);
    timer = 0;
    lastAt = performance.now();
    renderedText = text;
    renderedLive = live;
    body.replaceChildren(md(text, live));
  }

  return {
    kind: 'thinking',
    el,
    live: null,
    update(s, { running }) {
      seg = s;
      live = !!running && !s.endedAt;
      el.dataset.active = live ? 'true' : 'false';
      if (live) setText(label, 'Thinking…');
      else if (count(s.endedAt) && count(s.startedAt)) setText(label, `Thought for ${duration(Math.max(1000, s.endedAt - s.startedAt))}`);
      else setText(label, 'Thought briefly');
      const hasText = !!txt(s.text).trim();
      toggle.disabled = !hasText;
      chevron.hidden = !hasText;
      renderBody(false);
    },
    destroy() {
      clearTimeout(timer);
    },
  };
}

function createTextView() {
  let seg = null;
  let streaming = false;
  let renderedText = null;
  let renderedStreaming = null;
  let lastAt = 0;
  let timer = 0;
  let showAll = false;
  let sourcesKey = '';

  const body = h('div', { class: 'prose' });
  const sources = h('div', { class: 'seg-sources', hidden: true });
  const el = h('div', { class: 'seg seg-text', attrs: { 'data-testid': 'segment-text' } }, body, sources);

  function render() {
    clearTimeout(timer);
    timer = 0;
    lastAt = performance.now();
    const text = seg ? txt(seg.text) : '';
    body.replaceChildren(md(text, streaming));
    sizeTables(body);
    if (streaming) appendCaret(body);
    renderedText = text;
    renderedStreaming = streaming;
  }

  function renderSources(list) {
    const seen = new Set();
    const items = [];
    for (const src of Array.isArray(list) ? list : []) {
      const href = isObj(src) && safeUrl(src.url);
      if (!href || seen.has(href)) continue;
      seen.add(href);
      items.push({ href, title: txt(src.title).trim(), host: safeHost(href) });
    }
    const key = `${showAll}|${items.map((i) => i.href).join('|')}`;
    if (key === sourcesKey) return;
    sourcesKey = key;
    sources.hidden = items.length === 0;
    if (!items.length) {
      sources.replaceChildren();
      return;
    }
    const visible = showAll ? items : items.slice(0, MAX_CHIPS);
    const chips = visible.map((item, i) => {
      const a = extLink(item.href, item.host || item.href, { class: 'src-chip', title: [item.title, item.host].filter(Boolean).join(' — ') || item.href });
      a.replaceChildren(h('span', { class: 'src-num', text: String(i + 1) }), h('span', { class: 'src-text', text: chipLabel(item) }));
      return a;
    });
    const more =
      items.length > MAX_CHIPS
        ? h('button', {
            class: 'src-more',
            type: 'button',
            text: showAll ? 'Show less' : `+${items.length - MAX_CHIPS} more`,
            attrs: { 'aria-expanded': showAll ? 'true' : 'false' },
            on: {
              click: () => {
                showAll = !showAll;
                renderSources(seg && seg.citations);
              },
            },
          })
        : null;
    // (Native replaceChildren() would render a null `more` as the text "null".)
    sources.replaceChildren(...[h('span', { class: 'src-label', text: 'Sources' }), ...chips, more].filter(Boolean));
  }

  return {
    kind: 'text',
    el,
    live: null,
    update(s, { live }) {
      seg = s;
      streaming = !!live;
      el.dataset.streaming = streaming ? 'true' : 'false';
      const text = txt(s.text);
      if (text !== renderedText || streaming !== renderedStreaming) {
        const wait = MD_INTERVAL - (performance.now() - lastAt);
        if (!streaming || renderedText === null || wait <= 0) render();
        else if (!timer) timer = setTimeout(render, wait);
      }
      renderSources(s.citations);
    },
    destroy() {
      clearTimeout(timer);
    },
  };
}

function createToolView() {
  let open = false;
  let resultsKey = '';
  const iconWrap = h('span', { class: 'tool-icon' });
  const label = h('span', { class: 'tool-label' });
  const metaEl = h('span', { class: 'tool-meta' });
  const chevron = h('span', { class: 'tool-chevron', hidden: true }, icon('chevron-down', { size: 16 }));
  const row = h('button', { class: 'tool-row', type: 'button', attrs: { 'aria-expanded': 'false' }, on: { click: () => setOpen(!open) } }, iconWrap, h('span', { class: 'tool-text' }, label, metaEl), chevron);
  const list = h('ul', { class: 'tool-results', hidden: true });
  const el = h('div', { class: 'seg seg-tool', attrs: { 'data-testid': 'segment-tool' } }, row, list);
  let lastIcon = '';
  let hasResults = false;

  function setOpen(v) {
    if (!hasResults) v = false;
    open = v;
    row.setAttribute('aria-expanded', open ? 'true' : 'false');
    list.hidden = !open;
    el.classList.toggle('is-open', open);
  }

  return {
    kind: 'tool',
    el,
    live: null,
    update(s) {
      const tool = s.tool === 'web_fetch' ? 'web_fetch' : 'web_search';
      const status = s.status || 'running';
      el.dataset.tool = tool;
      el.dataset.status = status;
      el.setAttribute('data-tool', tool);
      el.setAttribute('data-status', status);
      const iconName = status === 'running' ? 'spinner' : status === 'error' ? 'alert' : tool === 'web_fetch' ? 'globe' : 'search';
      if (iconName !== lastIcon) {
        lastIcon = iconName;
        iconWrap.replaceChildren(icon(iconName, { size: 15 }));
      }
      const results = Array.isArray(s.results) ? s.results.filter(isObj) : [];
      const query = txt(s.query).trim();
      const host = safeHost(s.url);
      const code = txt(s.errorCode);
      let text = '';
      let meta = '';
      const cut = lookup(CUT_CODES, code) || '';
      if (status === 'error' && cut) el.dataset.cut = code;
      if (tool === 'web_search') {
        if (status === 'running') text = query ? `Searching “${query}”` : 'Searching the web…';
        else if (status === 'error' && cut) text = query ? `Search ${cut}: “${query}”` : `Search ${cut}`;
        else if (status === 'error') {
          text = query ? `Search failed: “${query}”` : 'Search failed';
          meta = code ? lookup(TOOL_ERRORS, code) || code.replace(/_/g, ' ') : '';
        } else {
          text = query ? `Searched “${query}”` : 'Searched the web';
          meta = plural(results.length, 'result', 'results');
        }
      } else {
        const doc = results.length ? txt(results[0].title).trim() : '';
        if (status === 'running') text = host ? `Reading ${host}` : 'Reading a page…';
        else if (status === 'error' && cut) text = host ? `Reading ${host} ${cut}` : `Reading ${cut}`;
        else if (status === 'error') {
          text = host ? `Couldn’t read ${host}` : 'Couldn’t read the page';
          meta = code ? lookup(TOOL_ERRORS, code) || code.replace(/_/g, ' ') : '';
        } else {
          text = `Read ${doc || host || 'a page'}`;
          meta = doc && host ? host : '';
        }
      }
      setText(label, text);
      setText(metaEl, meta);
      metaEl.hidden = !meta;
      row.title = text;

      hasResults = results.length > 0 && status !== 'running';
      chevron.hidden = !hasResults;
      row.disabled = !hasResults;
      const key = results.map((r) => txt(r.url)).join('|');
      if (key !== resultsKey) {
        resultsKey = key;
        const items = [];
        for (const r of results) {
          const href = safeUrl(r.url);
          if (!href) continue;
          const a = extLink(href, txt(r.title).trim() || safeHost(href) || href, { class: 'result-link' });
          items.push(h('li', { class: 'result' }, a, h('span', { class: 'result-host', text: [safeHost(href), txt(r.pageAge)].filter(Boolean).join(' · ') })));
        }
        list.replaceChildren(...items);
      }
      if (!hasResults && open) setOpen(false);
    },
  };
}

// A big swarm sends agent events many times a second; the inline card is redrawn at most this
// often (a mission starting or ending is shown at once, and the last change always lands).
const MISSION_INTERVAL = 200;

function createMissionView(sctx) {
  let card = null;
  let fallback = null;
  let missionId = null;
  let latest = null;
  let shownStatus = null;
  let lastAt = 0;
  let timer = 0;
  const el = h('div', { class: 'seg seg-mission', attrs: { 'data-testid': 'segment-mission' } });

  function draw() {
    clearTimeout(timer);
    timer = 0;
    lastAt = performance.now();
    if (!latest) return;
    shownStatus = latest.status;
    try {
      if (card) card.update(latest);
      else if (fallback) fallback.update(latest);
    } catch (err) {
      console.error('[jarvis] mission card update failed:', err);
    }
  }

  return {
    kind: 'mission',
    el,
    live: null,
    update(s, { turn }) {
      missionId = s.missionId;
      const mission = missionsOf(turn)[s.missionId];
      if (!isObj(mission)) return;
      latest = mission;
      if (card || fallback) {
        const wait = MISSION_INTERVAL - (performance.now() - lastAt);
        if (mission.status !== shownStatus || wait <= 0) draw();
        else if (!timer) timer = setTimeout(draw, wait);
        return;
      }
      lastAt = performance.now();
      shownStatus = mission.status;
      try {
        card = createMissionCard(mission, { onOpen: () => sctx.openMission(missionId) });
        el.replaceChildren(card.el);
        return;
      } catch (err) {
        console.error('[jarvis] mission card failed:', err);
        fallback = createFallbackMissionCard(() => sctx.openMission(missionId));
        el.replaceChildren(fallback.el);
      }
      fallback.update(mission);
    },
    destroy() {
      clearTimeout(timer);
    },
  };
}

/** Minimal mission card used only if the HUD card cannot be created. */
function createFallbackMissionCard(onOpen) {
  const title = h('div', { class: 'fallback-mission-title' });
  const meta = h('div', { class: 'fallback-mission-meta' });
  const chips = h('div', { class: 'fallback-mission-chips' });
  const el = h('button', { class: 'fallback-mission', type: 'button', attrs: { 'data-testid': 'mission-card' }, on: { click: onOpen } }, title, meta, chips);
  return {
    el,
    update(m) {
      el.setAttribute('data-status', txt(m.status) || 'planning');
      el.setAttribute('data-mission-id', txt(m.id));
      setText(title, txt(m.title) || 'Mission');
      const agents = Array.isArray(m.agents) ? m.agents.filter(isObj) : [];
      const done = agents.filter((a) => a.status === 'done').length;
      setText(meta, `Mission · wave ${count(m.wave) || 1} · ${done}/${agents.length} done`);
      chips.replaceChildren(
        ...agents.map((a) => h('span', { class: 'fallback-chip', attrs: { 'data-testid': 'agent-chip', 'data-status': txt(a.status) || 'queued', 'data-codename': txt(a.codename) }, text: `${txt(a.codename) || 'Agent'} · ${txt(a.status)}` })),
      );
    },
  };
}

// ---- hologram and blueprint cards ------------------------------------------------------------

const SHEET_LABELS = { part: 'Part drawing', cutaway: 'Cutaway', exploded: 'Exploded view', process: 'Process sheet', assembly: 'Assembly drawing' };

/**
 * A card for a `hologram` or `blueprint` segment: live "Hologram · building" with "12 parts…" while
 * the tool input streams (Open follows the live build; the viewer chunk is warmed up), then a
 * thumbnail from the saved library (made now when it has none), the title, the part count and
 * Open. "Saved" when it was reopened from the library (open_saved); an error state when it stopped
 * before it finished or could not be built (Open still shows what was built, if anything).
 */
function createVisualCardView(kind, sctx) {
  const isBp = kind === 'blueprint';
  const word = isBp ? 'Blueprint' : 'Hologram';
  const glyph = h('span', { class: 'vcard-glyph', attrs: { 'aria-hidden': 'true' } }, icon(isBp ? 'blueprint' : 'hologram', { size: 30, strokeWidth: 1.4 }));
  const thumb = h('div', { class: 'vcard-thumb' }, h('span', { class: 'vcard-scan', attrs: { 'aria-hidden': 'true' } }), glyph);
  const kicker = h('span', { class: 'vcard-kicker-text' });
  const saved = h('span', { class: 'vcard-badge', hidden: true, text: 'Saved' });
  const title = h('div', { class: 'vcard-title' });
  const sub = h('div', { class: 'vcard-sub' });
  const meta = h('div', { class: 'vcard-meta' });
  const openBtn = h(
    'button',
    { class: 'btn btn-sm vcard-open', type: 'button', attrs: { 'data-testid': isBp ? 'blueprint-open' : 'hologram-open' }, on: { click: () => seg && sctx.openVisual(seg) } },
    icon(isBp ? 'blueprint' : 'hologram', { size: 16 }),
    h('span', { text: 'Open' }),
  );
  const body = h(
    'div',
    { class: 'vcard-body' },
    h('div', { class: 'vcard-kicker' }, h('span', { class: 'vcard-dot', attrs: { 'aria-hidden': 'true' } }), kicker, saved),
    title,
    sub,
    h('div', { class: 'vcard-foot' }, meta, openBtn),
  );
  const card = h('div', { class: ['vcard', `vcard--${kind}`] }, thumb, body);
  const el = h('div', { class: ['seg', 'seg-visual'], attrs: { 'data-testid': isBp ? 'blueprint-card' : 'hologram-card' } }, card);
  let seg = null;
  let thumbFor = null; // the library id whose thumbnail is shown (or being fetched)
  let off = null;
  let warmed = false;

  function showThumb(url) {
    if (!url) return;
    let img = thumb.querySelector('img');
    if (!img) {
      img = h('img', { alt: '', attrs: { decoding: 'async' } });
      thumb.appendChild(img);
    }
    if (img.getAttribute('src') !== url) img.src = url;
    thumb.classList.add('has-img');
  }

  function loadThumb(id, make) {
    const t = sctx.thumbs;
    if (!t || !id) return;
    const want = id;
    (make ? t.ensure(id) : t.get(id)).then(
      (url) => {
        if (seg && seg.libraryId === want) showThumb(url);
      },
      () => {},
    );
  }

  function render() {
    if (!seg) return;
    const status = seg.status === 'building' || seg.status === 'error' ? seg.status : 'done';
    const spec = isObj(seg.spec) ? seg.spec : {};
    const stats = isObj(seg.stats) ? seg.stats : {};
    // A card that stopped early counts only what can be shown (parts that have shapes).
    const specParts = Array.isArray(spec.parts) ? spec.parts.filter((p) => isObj(p) && (isBp || (Array.isArray(p.shapes) && p.shapes.length))) : [];
    const parts = status === 'error' ? specParts.length : count(stats.parts) || specParts.length;
    const steps = isBp && Array.isArray(spec.steps) ? spec.steps.length : 0;
    el.dataset.status = status;
    el.dataset.libraryId = txt(seg.libraryId);
    card.dataset.status = status;
    const sheet = isBp ? SHEET_LABELS[txt(seg.sheet) || txt(spec.sheet)] || '' : '';
    if (status === 'building') setText(kicker, `${word} · ${isBp ? 'drawing' : 'building'}`);
    else if (status === 'error') setText(kicker, `${word} · incomplete`);
    else setText(kicker, isBp ? `Blueprint${sheet ? ` · ${sheet}` : ''}` : 'Hologram');
    saved.hidden = !seg.fromLibrary;
    setText(title, txt(seg.title) || txt(spec.title) || (status === 'building' ? (isBp ? 'Drawing…' : 'Building…') : word));
    const subtitle = isBp ? txt(seg.subject) || txt(spec.subject) : txt(seg.subtitle) || txt(spec.subtitle);
    setText(sub, subtitle);
    sub.hidden = !subtitle;
    let line = '';
    if (status === 'error') line = parts || steps ? `Stopped at ${steps ? plural(steps, 'step', 'steps') : plural(parts, 'part', 'parts')}` : 'Couldn’t be built';
    else if (steps) line = plural(steps, 'step', 'steps');
    else if (parts || status === 'building') line = plural(parts, 'part', 'parts');
    setText(meta, status === 'building' ? (parts || steps ? `${line}…` : 'Starting…') : line);
    openBtn.hidden = !sctx.canOpenVisual() || (status === 'error' && !parts && !steps);
    openBtn.setAttribute('aria-label', `Open ${isBp ? 'blueprint' : 'hologram'}${title.textContent ? `: ${title.textContent}` : ''}`);
    // Warm the viewer chunk while the tool input streams, so Open is instant.
    if (status === 'building' && !warmed) {
      warmed = true;
      (isBp ? loadBlueprintModule() : loadHologramRenderer()).catch(() => {});
    }
    // Thumbnail: the saved one, or one made now for a finished saved item.
    const id = txt(seg.libraryId);
    if (id && status === 'done' && thumbFor !== id) {
      thumbFor = id;
      loadThumb(id, true);
      if (!off && sctx.thumbs && typeof sctx.thumbs.onChange === 'function') {
        off = sctx.thumbs.onChange((changed) => {
          if (seg && seg.libraryId && (!changed || changed === seg.libraryId)) loadThumb(seg.libraryId, false);
        });
      }
    }
  }

  return {
    kind,
    el,
    live: null,
    update(s) {
      seg = s;
      render();
    },
    destroy() {
      if (typeof off === 'function') off();
      off = null;
    },
  };
}

/**
 * "Remembered: <fact>" chip. A fact Jarvis saved can be undone right here (one tap removes it
 * from memory), in case it was saved by mistake or because a web page asked for it. A saved
 * fact that is no longer in memory (undone, or removed in Settings) shows as "Forgotten".
 */
function createMemoryView(sctx) {
  let seg = null;
  const label = h('span', { class: 'memory-label' });
  const fact = h('span', { class: 'memory-fact' });
  const undoBtn = h('button', { class: 'memory-undo', type: 'button', hidden: true, attrs: { 'data-testid': 'memory-undo' }, on: { click: () => undo() } }, h('span', { text: 'Undo' }));
  const manageBtn = h('button', { class: 'memory-manage', type: 'button', text: 'Manage', attrs: { 'aria-label': 'Manage memory in Settings' }, on: { click: () => sctx.openSettings('memory') } });
  const el = h(
    'div',
    { class: 'seg seg-memory', attrs: { 'data-testid': 'segment-memory' } },
    h('span', { class: 'memory-icon' }, icon('memory', { size: 15 })),
    h('span', { class: 'memory-text' }, label, fact),
    h('span', { class: 'memory-actions' }, undoBtn, manageBtn),
  );

  function render() {
    if (!seg) return;
    const text = txt(seg.fact).trim();
    const removed = seg.action === 'remove';
    const state = removed ? 'removed' : text && sctx.isRemembered(text) === false ? 'forgotten' : 'remembered';
    el.dataset.action = removed ? 'remove' : 'add';
    el.dataset.state = state;
    setText(label, state === 'removed' ? 'Forgot' : state === 'forgotten' ? 'Forgotten' : 'Remembered');
    setText(fact, text);
    undoBtn.hidden = !(state === 'remembered' && text && sctx.canForget());
    undoBtn.setAttribute('aria-label', `Undo: forget “${text}”`);
  }

  function undo() {
    const text = txt(seg && seg.fact).trim();
    if (!text) return;
    sctx.forgetMemory(text);
    render();
    try {
      manageBtn.focus({ preventScroll: true }); // the Undo button just went away
    } catch {
      /* ignore */
    }
  }

  return {
    kind: 'memory',
    el,
    live: null,
    update(s) {
      seg = s;
      render();
    },
    refresh: render,
  };
}

function createNoticeView() {
  const iconWrap = h('span', { class: 'notice-icon' });
  const text = h('span', { class: 'notice-text' });
  const el = h('div', { class: 'seg seg-notice', attrs: { 'data-testid': 'segment-notice', role: 'note' } }, iconWrap, text);
  let level = '';
  return {
    kind: 'notice',
    el,
    live: null,
    update(s) {
      const lv = s.level === 'warn' ? 'warn' : 'info';
      if (lv !== level) {
        level = lv;
        el.dataset.level = lv;
        iconWrap.replaceChildren(icon(lv === 'warn' ? 'alert' : 'info', { size: 15 }));
      }
      setText(text, txt(s.text));
      el.hidden = !txt(s.text).trim(); // nothing to say (a damaged record): no empty box
    },
  };
}

function createErrorView(seg, sctx, isTurnLevel) {
  const titleEl = h('strong', { class: 'error-title' });
  const msg = h('p', { class: 'error-msg' });
  const actions = h('div', { class: 'error-actions' });
  const el = h(
    'div',
    { class: ['seg', 'seg-error', isTurnLevel && 'seg-error--turn'], attrs: { 'data-testid': 'segment-error', role: 'alert' } },
    h('span', { class: 'error-icon' }, icon('alert', { size: 18 })),
    h('div', { class: 'error-body' }, titleEl, msg, actions),
  );
  let lastKey = '';

  function action(label, iconName, fn, extra = {}) {
    return h('button', { class: ['btn', 'btn-sm', extra.primary && 'btn-primary'], type: 'button', on: { click: fn }, attrs: extra.attrs }, iconName ? icon(iconName, { size: 15 }) : null, h('span', { text: label }));
  }

  function render(s) {
    const err = isObj(s) && isObj(s.error) ? s.error : {};
    const kind = lookup(ERROR_TITLES, err.kind) ? err.kind : 'unknown';
    const status = sctx.turnStatus();
    const message = txt(err.message);
    const key = `${kind}|${message}|${status}`;
    if (key === lastKey) return;
    lastKey = key;
    el.dataset.kind = kind;
    setText(titleEl, ERROR_TITLES[kind]);
    setText(msg, message || 'Jarvis hit an unexpected problem.');
    const btns = [];
    switch (kind) {
      case 'auth':
        btns.push(action('Open API key settings', 'key', () => sctx.openSettings('apikey'), { primary: true }));
        break;
      case 'billing':
        btns.push(extLink('https://console.anthropic.com/settings/billing', 'Add credits', { class: 'btn btn-sm btn-primary' }));
        break;
      case 'not_found':
        btns.push(action('Choose a model', 'chip', () => sctx.openSettings('ai'), { primary: true }));
        break;
      case 'context':
        btns.push(action('Start a new chat', 'add-square', () => sctx.newChat(), { primary: true }));
        break;
      case 'rate_limit':
      case 'overloaded':
      case 'server':
      case 'unknown':
        if (status !== 'running' && status !== 'interrupted') btns.push(action('Try again', 'refresh', () => sctx.retry(), { primary: true }));
        break;
      case 'network':
        if (status !== 'running' && status !== 'interrupted') btns.push(action('Try again', 'refresh', () => sctx.retry(), { primary: true }));
        break;
      default:
        break;
    }
    actions.replaceChildren(...btns);
    actions.hidden = btns.length === 0;
  }

  render(seg);
  return {
    kind: 'error',
    el,
    live: null,
    update(s) {
      render(s);
    },
  };
}
