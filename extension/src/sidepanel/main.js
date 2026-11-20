// The Jarvis side panel: first-run setup (a Chrome profile of its own, then the API key, model and
// budget), then a chat of task cards. Each card shows Jarvis's live step list with tiny
// thumbnails, any question for the owner (site permission, approvals, limits), the final answer,
// the cost and a Retry button. The service worker does the work; this page only renders its state
// and sends the owner's choices.

import { h, append, clear, replaceChildren, setText } from './dom.js';
import { icon, emblem } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { PROFILE_CONFIRM, PROFILE_TITLE, PROFILE_WHY, profileElsewhere, profileNote, profileSteps } from './profile.js';
import { FINAL_STATUSES, PORT_NAME } from '../shared/protocol.js';
import { createStore, maskKey, validateApiKey } from '../shared/storage.js';
import { DEFAULT_MODEL, MODELS, MODEL_IDS } from '../background/models.js';
import { MAX_BUDGET_USD, MAX_STEPS, MIN_BUDGET_USD, MIN_STEPS } from '../background/limits.js';
import { displayText, formatDuration, formatUsd, truncate } from '../shared/util.js';

const store = createStore(chrome);
const app = document.getElementById('app');
const IS_MAC = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const STOP_KEYS = IS_MAC ? '⌘⇧.' : 'Ctrl+Shift+.';

const ui = {
  view: 'loading',
  profileOk: false, // the owner confirmed this Chrome profile is just for Jarvis (jarvis.profile)
  hasKey: false,
  masked: '',
  settings: null,
  tasks: [],
  running: false,
  thumbs: new Map(), // taskId -> Map(stepId -> dataUrl)
  narration: new Map(),
  cards: new Map(), // taskId -> TaskCard
  port: null,
  windowId: undefined,
  sheet: null, // 'settings' | 'history' | null
  els: {},
  listening: false,
  recognition: null,
};

const EXAMPLES = [
  'Find a 4K monitor under $300 on Best Buy and add it to the cart',
  'Summarize this page in five bullet points',
  'Compare the prices of AirPods Pro on Amazon and Best Buy',
  'Open my calendar and tell me what’s on tomorrow',
];

const STATUS_TEXT = {
  running: 'Working',
  waiting: 'Needs you',
  paused: 'Paused',
  done: 'Done',
  stopped: 'Stopped',
  error: 'Error',
  interrupted: 'Interrupted',
};

// ---------------------------------------------------------------------------------------------
// Connection to the service worker

function connect() {
  const port = chrome.runtime.connect({ name: PORT_NAME });
  ui.port = port;
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    ui.port = null;
    setTimeout(connect, 500);
  });
  send({ type: 'hello', windowId: ui.windowId });
}

function send(msg) {
  try {
    ui.port?.postMessage(msg);
  } catch {
    /* reconnecting */
  }
}

// Keep the service worker awake while a task runs (its port messages count as activity).
setInterval(() => {
  if (ui.running) send({ type: 'ping' });
}, 20000);

function onMessage(msg) {
  switch (msg.type) {
    case 'snapshot':
      ui.tasks = msg.tasks || [];
      ui.running = !!msg.running || ui.tasks.some((t) => !FINAL_STATUSES.has(t.status));
      for (const card of ui.cards.values()) card.el.remove();
      ui.cards.clear();
      renderTasks();
      break;
    case 'task':
      upsertTask(msg.task);
      break;
    case 'thumb': {
      if (!ui.thumbs.has(msg.taskId)) ui.thumbs.set(msg.taskId, new Map());
      ui.thumbs.get(msg.taskId).set(msg.stepId, msg.dataUrl);
      ui.cards.get(msg.taskId)?.setThumb(msg.stepId, msg.dataUrl);
      break;
    }
    case 'thumbs': {
      const map = new Map(Object.entries(msg.thumbs || {}));
      ui.thumbs.set(msg.taskId, map);
      const card = ui.cards.get(msg.taskId);
      if (card) for (const [id, url] of map) card.setThumb(id, url);
      break;
    }
    case 'narration':
      ui.narration.set(msg.taskId, msg.text);
      ui.cards.get(msg.taskId)?.setNarration(msg.text);
      break;
    case 'error':
      toast(msg.message);
      break;
    default:
      break;
  }
}

function upsertTask(task) {
  const i = ui.tasks.findIndex((t) => t.id === task.id);
  if (i >= 0) ui.tasks[i] = task;
  else ui.tasks.push(task);
  ui.running = ui.tasks.some((t) => !FINAL_STATUSES.has(t.status));
  renderTasks();
}

// ---------------------------------------------------------------------------------------------
// Boot

async function boot() {
  try {
    ui.windowId = (await chrome.windows.getCurrent())?.id;
  } catch {
    ui.windowId = undefined;
  }
  const [key, settings, profile] = await Promise.all([store.getApiKey(), store.getSettings(), store.getProfile()]);
  ui.profileOk = !!profile;
  ui.hasKey = !!key;
  ui.masked = maskKey(key);
  ui.settings = settings;
  // The profile screen comes first, also when a key is already saved (by an older version).
  if (!ui.profileOk) renderProfileGate();
  else if (ui.hasKey) renderMain();
  else renderSetup();
  connect();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes['jarvis.settings']) {
      store.getSettings().then((s) => {
        ui.settings = s;
        updateHeader();
      });
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Esc closes what is open first (a picture, a sheet); only then does it stop Jarvis.
    const lightbox = app.querySelector('.lightbox');
    if (lightbox) {
      e.preventDefault();
      lightbox.remove();
    } else if (ui.sheet) {
      e.preventDefault();
      closeSheet();
    } else if (ui.running) {
      e.preventDefault();
      send({ type: 'stop' });
    }
  });
  setInterval(() => {
    for (const card of ui.cards.values()) card.tick();
  }, 1000);
}

// ---------------------------------------------------------------------------------------------
// First run: a Chrome profile of its own. The API key can't be saved before the owner ticks the
// box (the store refuses it too), and the confirmation is kept in chrome.storage.local.

function hudCore(cls = '') {
  return h(
    'div',
    { class: ['hud-core', cls] },
    h('span', { class: 'hud-core__ring hud-core__ring--1' }),
    h('span', { class: 'hud-core__ring hud-core__ring--2' }),
    h('span', { class: 'hud-core__ring hud-core__ring--3' }),
    h('span', { class: 'hud-core__orb' }),
  );
}

function renderProfileGate() {
  ui.view = 'profile';
  const check = h('input', { type: 'checkbox', attrs: { 'data-testid': 'profile-check' } });
  const next = h('button', { class: 'btn btn--primary btn--wide', type: 'button', disabled: true, attrs: { 'data-testid': 'profile-continue' } }, 'Continue', icon('chevron-right', { size: 16 }));
  const error = h('p', { class: 'field__error', attrs: { role: 'alert' } });
  check.addEventListener('change', () => {
    next.disabled = !check.checked;
    setText(error, '');
  });
  next.addEventListener('click', async () => {
    if (!check.checked) return;
    next.disabled = true;
    try {
      await store.confirmProfile();
      ui.profileOk = true;
      // A key saved before (by an older version, or in another window's panel) is kept.
      const key = await store.getApiKey();
      ui.hasKey = !!key;
      ui.masked = maskKey(key);
      if (ui.hasKey) renderMain();
      else renderSetup();
    } catch (err) {
      next.disabled = !check.checked;
      setText(error, `Jarvis couldn’t save that. Try again. (${err?.message || err})`);
    }
  });

  replaceChildren(
    app,
    h(
      'main',
      { class: 'setup setup--profile', attrs: { 'data-testid': 'profile-gate' } },
      h('div', { class: 'setup__hero' }, hudCore('hud-core--hero hud-core--small')),
      h('h1', { class: 'setup__title' }, h('span', { class: 'wordmark', text: 'JARVIS' }), h('span', { class: 'setup__for', text: 'for Chrome' })),
      h('h2', { class: 'profile__title', text: PROFILE_TITLE }),
      h('p', { class: 'setup__lead', attrs: { 'data-testid': 'profile-why' }, text: PROFILE_WHY }),
      h('section', { class: 'panel' }, h('div', { class: 'label' }, icon('shield', { size: 14 }), 'Set up the Jarvis profile'), profileSteps(), profileElsewhere()),
      h('label', { class: 'confirm', attrs: { 'data-testid': 'profile-confirm' } }, check, h('span', { text: PROFILE_CONFIRM })),
      error,
      next,
      ui.hasKey ? null : h('p', { class: 'hint hint--center', attrs: { 'data-testid': 'profile-next' }, text: 'Next: your Anthropic API key.' }),
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Setup

function modelPicker(selected, onPick, name = 'model') {
  return h(
    'div',
    { class: 'models', attrs: { role: 'radiogroup', 'aria-label': 'Model' } },
    MODEL_IDS.map((id) => {
      const m = MODELS[id];
      const input = h('input', { type: 'radio', name, value: id, checked: id === selected, on: { change: () => onPick(id) } });
      return h(
        'label',
        { class: 'model', dataset: { testid: `model-${id}` } },
        input,
        h(
          'span',
          { class: 'model__body' },
          h('span', { class: 'model__name' }, m.label, id === DEFAULT_MODEL ? h('span', { class: 'chip chip--accent', text: 'Default' }) : null),
          h('span', { class: 'model__blurb', text: m.blurb }),
          h('span', { class: 'model__price', text: `$${m.inPerM} in · $${m.outPerM} out per million tokens` }),
        ),
      );
    }),
  );
}

function renderSetup() {
  ui.view = 'setup';
  let model = ui.settings?.model || DEFAULT_MODEL;
  const keyInput = h('input', {
    class: 'field__input',
    type: 'password',
    placeholder: 'sk-ant-…',
    autocomplete: 'off',
    spellcheck: false,
    attrs: { 'aria-label': 'Anthropic API key', 'data-testid': 'setup-key' },
  });
  const show = h('button', { class: 'icon-btn', type: 'button', title: 'Show key', attrs: { 'aria-label': 'Show key' }, on: { click: () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    replaceChildren(show, icon(keyInput.type === 'password' ? 'eye' : 'eye-off'));
  } } }, icon('eye'));
  const error = h('p', { class: 'field__error', attrs: { role: 'alert' } });
  const budget = h('input', { class: 'field__input field__input--num', type: 'number', min: MIN_BUDGET_USD, max: MAX_BUDGET_USD, step: 0.25, value: (ui.settings?.budgetUsd ?? 1).toFixed(2), attrs: { 'aria-label': 'Budget per task in dollars', 'data-testid': 'setup-budget' } });
  const steps = h('input', { class: 'field__input field__input--num', type: 'number', min: MIN_STEPS, max: MAX_STEPS, step: 1, value: ui.settings?.maxSteps ?? 40, attrs: { 'aria-label': 'Maximum steps per task', 'data-testid': 'setup-steps' } });
  const save = h('button', { class: 'btn btn--primary btn--wide', type: 'button', attrs: { 'data-testid': 'setup-save' } }, icon('sparkle'), 'Start Jarvis');

  save.addEventListener('click', async () => {
    const check = validateApiKey(keyInput.value);
    if (!check.ok) {
      setText(error, check.error);
      keyInput.focus();
      return;
    }
    save.disabled = true;
    const res = await store.setApiKey(check.key);
    if (!res.ok) {
      save.disabled = false;
      // Only after the profile screen (another window's panel may have shown it first).
      if (res.needsProfile) {
        ui.profileOk = false;
        return renderProfileGate();
      }
      setText(error, res.error);
      return;
    }
    ui.settings = await store.setSettings({ model, budgetUsd: budget.value, maxSteps: steps.value });
    ui.hasKey = true;
    ui.masked = res.masked;
    keyInput.value = '';
    renderMain();
  });
  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save.click();
  });

  replaceChildren(
    app,
    h(
      'main',
      { class: 'setup', attrs: { 'data-testid': 'setup' } },
      h('div', { class: 'setup__hero' }, hudCore('hud-core--hero')),
      h('h1', { class: 'setup__title' }, h('span', { class: 'wordmark', text: 'JARVIS' }), h('span', { class: 'setup__for', text: 'for Chrome' })),
      h('p', { class: 'setup__lead', text: 'Your assistant, working in your own tabs. Tell Jarvis what you need; it clicks, types and reads pages for you, and asks before anything that matters.' }),
      profileNote(),
      h(
        'section',
        { class: 'panel' },
        h('div', { class: 'label' }, icon('key', { size: 14 }), 'Your Anthropic API key'),
        h('div', { class: 'field' }, keyInput, show),
        error,
        h('p', { class: 'hint' }, 'Create one at ', h('a', { href: 'https://console.anthropic.com/settings/keys', attrs: { target: '_blank', rel: 'noopener noreferrer' }, text: 'console.anthropic.com' }), '. It stays on this Mac and is only sent to api.anthropic.com.'),
      ),
      h('section', { class: 'panel' }, h('div', { class: 'label' }, icon('sparkle', { size: 14 }), 'Model'), modelPicker(model, (id) => (model = id), 'setup-model')),
      h(
        'section',
        { class: 'panel panel--row' },
        h('label', { class: 'mini-field' }, h('span', { class: 'label', text: 'Budget per task' }), h('span', { class: 'money' }, '$', budget)),
        h('label', { class: 'mini-field' }, h('span', { class: 'label', text: 'Max steps' }), steps),
      ),
      h('p', { class: 'hint' }, 'Jarvis asks before going past the budget or the step limit.'),
      save,
      safetyList(),
    ),
  );
  keyInput.focus();
}

function safetyList() {
  const items = [
    ['shield', 'Asks you before every step that changes something, and always before buying, sending, posting, deleting or changing settings.'],
    ['lock', 'Never types your passwords or card numbers. You sign in yourself.'],
    ['globe', 'Asks before it works on a new site.'],
    ['hand', `Stop any time: the bar on the page, Esc, ${STOP_KEYS}, or here.`],
  ];
  return h(
    'ul',
    { class: 'safety' },
    items.map(([ic, text]) => h('li', null, icon(ic, { size: 16 }), h('span', { text }))),
  );
}

// ---------------------------------------------------------------------------------------------
// Main view

function renderMain() {
  ui.view = 'main';
  const els = (ui.els = {});
  els.status = h('span', { class: 'brand__status', attrs: { 'data-testid': 'header-status' } });
  els.header = h(
    'header',
    { class: 'top' },
    h('div', { class: 'brand' }, emblem({ size: 30, live: true }), h('div', { class: 'brand__text' }, h('span', { class: 'wordmark', text: 'JARVIS' }), h('span', { class: 'brand__sub' }, h('span', { class: 'dot' }), els.status))),
    h(
      'div',
      { class: 'top__actions' },
      h('button', { class: 'icon-btn', type: 'button', title: 'New chat', attrs: { 'aria-label': 'New chat', 'data-testid': 'new-chat' }, on: { click: newChat } }, icon('add-square')),
      h('button', { class: 'icon-btn', type: 'button', title: 'History', attrs: { 'aria-label': 'History', 'data-testid': 'open-history' }, on: { click: () => openSheet('history') } }, icon('history')),
      h('button', { class: 'icon-btn', type: 'button', title: 'Settings', attrs: { 'aria-label': 'Settings', 'data-testid': 'open-settings' }, on: { click: () => openSheet('settings') } }, icon('settings')),
    ),
  );
  els.list = h('div', { class: 'turns', attrs: { 'data-testid': 'turns', 'aria-live': 'polite' } });
  els.empty = emptyState();
  els.scroll = h('div', { class: 'scroll' }, els.empty, els.list);
  els.dockText = h('span', { class: 'dock__text' });
  els.takeover = h('button', { class: 'btn btn--ghost', type: 'button', attrs: { 'data-testid': 'takeover' }, on: { click: () => send({ type: 'takeover' }) } }, icon('hand', { size: 16 }), 'Take over');
  els.resume = h('button', { class: 'btn btn--primary', type: 'button', attrs: { 'data-testid': 'resume' }, on: { click: () => send({ type: 'resume' }) } }, icon('play', { size: 14 }), 'Continue');
  els.stop = h('button', { class: 'btn btn--danger', type: 'button', attrs: { 'data-testid': 'stop', 'aria-keyshortcuts': 'Escape' }, on: { click: () => send({ type: 'stop' }) } }, icon('stop', { size: 14 }), 'Stop');
  els.dock = h('div', { class: 'dock', hidden: true, attrs: { 'data-testid': 'dock' } }, h('span', { class: 'dock__pulse' }), els.dockText, h('div', { class: 'dock__actions' }, els.takeover, els.resume, els.stop));

  els.input = h('textarea', {
    class: 'composer__input',
    rows: 1,
    placeholder: 'Ask Jarvis to do something in your browser…',
    attrs: { 'aria-label': 'Task for Jarvis', 'data-testid': 'composer' },
    on: {
      input: autosize,
      keydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          submit();
        }
      },
    },
  });
  els.mic = h('button', { class: 'icon-btn composer__mic', type: 'button', title: 'Dictate', attrs: { 'aria-label': 'Dictate a task', 'data-testid': 'mic' }, on: { click: toggleDictation } }, icon('mic'));
  els.send = h('button', { class: 'send-btn', type: 'button', title: 'Send', attrs: { 'aria-label': 'Send', 'data-testid': 'send' }, on: { click: submit } }, icon('send'));
  els.composer = h('div', { class: 'composer' }, els.input, h('div', { class: 'composer__row' }, h('span', { class: 'composer__meta', attrs: { 'data-testid': 'composer-meta' } }), h('div', { class: 'composer__btns' }, els.mic, els.send)));
  els.toast = h('div', { class: 'toast', attrs: { role: 'status' }, hidden: true });
  els.sheet = h('div', { class: 'sheet', hidden: true });
  replaceChildren(app, h('div', { class: 'shell' }, els.header, els.scroll, h('footer', { class: 'bottom' }, els.dock, els.composer), els.sheet, els.toast));
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) els.mic.hidden = true;
  updateHeader();
  renderTasks();
  els.input.focus();
}

function emptyState() {
  return h(
    'div',
    { class: 'empty', attrs: { 'data-testid': 'empty' } },
    hudCore(),
    h('h2', { class: 'empty__title', text: 'What should I do in your browser?' }),
    h('p', { class: 'empty__lead', text: 'I work in your tabs while you watch, and I ask before anything that matters.' }),
    h(
      'div',
      { class: 'examples' },
      EXAMPLES.map((text) =>
        h('button', { class: 'example', type: 'button', on: { click: () => {
          ui.els.input.value = text;
          autosize();
          ui.els.input.focus();
        } } }, icon('sparkle', { size: 14 }), h('span', { text })),
      ),
    ),
    h('p', { class: 'empty__keys', text: `Stop any time: Esc on the page or ${STOP_KEYS}` }),
  );
}

function autosize() {
  const el = ui.els.input;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(160, el.scrollHeight)}px`;
}

function submit() {
  const text = ui.els.input.value.trim();
  if (!text || ui.running) return;
  if (ui.listening) stopDictation();
  send({ type: 'start', text, windowId: ui.windowId });
  ui.els.input.value = '';
  autosize();
}

function newChat() {
  if (ui.running) return;
  send({ type: 'clear-chat' });
}

function updateHeader() {
  const els = ui.els;
  if (!els.status) return;
  const running = ui.tasks.find((t) => !FINAL_STATUSES.has(t.status));
  const model = MODELS[ui.settings?.model]?.short || 'Sonnet 5.5';
  let text = `Online · ${model}`;
  let tone = 'ok';
  if (running) {
    text = running.status === 'waiting' ? 'Waiting for you' : running.status === 'paused' ? 'Paused · you’re in control' : 'Working…';
    tone = running.status === 'running' ? 'active' : 'warn';
  }
  setText(els.status, text);
  els.header.dataset.tone = tone;
  // Dock and composer
  els.dock.hidden = !running;
  if (running) {
    els.takeover.hidden = running.status === 'paused';
    els.resume.hidden = running.status !== 'paused';
    setText(els.dockText, running.status === 'paused' ? 'You’re in control' : running.status === 'waiting' ? 'Needs your answer' : 'Jarvis is in control');
    els.dock.dataset.status = running.status;
  }
  els.input.disabled = !!running;
  els.input.placeholder = running ? 'Jarvis is working…' : ui.tasks.length ? 'Ask a follow-up, or give Jarvis a new task…' : 'Ask Jarvis to do something in your browser…';
  els.send.disabled = !!running;
  const s = ui.settings;
  if (s) setText(els.composer.querySelector('.composer__meta'), `${model} · ${formatUsd(s.budgetUsd)} budget · ${s.maxSteps} steps${s.incognito ? ' · no history' : ''}`);
}

function renderTasks() {
  if (ui.view !== 'main') return;
  const els = ui.els;
  els.empty.hidden = ui.tasks.length > 0;
  for (const task of ui.tasks) {
    let card = ui.cards.get(task.id);
    if (!card) {
      card = new TaskCard(task);
      ui.cards.set(task.id, card);
      els.list.appendChild(card.el);
      const thumbs = ui.thumbs.get(task.id);
      if (thumbs) for (const [id, url] of thumbs) card.setThumb(id, url);
    }
    card.update(task);
  }
  for (const [id, card] of ui.cards) {
    if (!ui.tasks.some((t) => t.id === id)) {
      card.el.remove();
      ui.cards.delete(id);
    }
  }
  updateHeader();
  scrollToEnd();
}

let stickToEnd = true;
function scrollToEnd() {
  const sc = ui.els.scroll;
  if (!sc) return;
  if (!sc.dataset.bound) {
    sc.dataset.bound = '1';
    sc.addEventListener('scroll', () => {
      stickToEnd = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
    });
  }
  if (stickToEnd) requestAnimationFrame(() => (sc.scrollTop = sc.scrollHeight));
}

// ---------------------------------------------------------------------------------------------
// Task card

const STEP_ICON = { action: 'cursor', note: 'chevron-right', warning: 'shield-alert', notice: 'info', ask: 'shield' };
const TOOL_ICON = {
  navigate: 'globe', screenshot: 'camera', zoom: 'search', read_page: 'page', get_page_text: 'page', find: 'search', type: 'keyboard', key: 'keyboard', hold_key: 'keyboard',
  scroll: 'scroll', scroll_to: 'scroll', new_tab: 'tab', switch_tab: 'tab', close_tab: 'tab', list_tabs: 'tab', wait: 'refresh', form_input: 'keyboard',
};

class TaskCard {
  constructor(task) {
    this.id = task.id;
    this.steps = new Map();
    this.el = h('article', { class: 'turn', attrs: { 'data-testid': 'task-card' } });
    this.divider = h('div', { class: 'divider', hidden: true }, h('span', { text: 'Fresh start' }));
    this.bubble = h('div', { class: 'bubble', attrs: { 'data-testid': 'task-text' } });
    this.pill = h('span', { class: 'pill', attrs: { 'data-testid': 'task-status' } });
    this.timer = h('span', { class: 'card__timer' });
    this.costEl = h('span', { class: 'card__cost', attrs: { 'data-testid': 'task-cost' } });
    this.stepList = h('ol', { class: 'steps', attrs: { 'data-testid': 'steps' } });
    this.live = h('div', { class: 'live', hidden: true }, h('span', { class: 'live__dot' }), h('span', { class: 'live__text' }));
    this.promptBox = h('div', { class: 'prompt-slot' });
    this.answer = h('div', { class: 'answer', hidden: true, attrs: { 'data-testid': 'answer' } });
    this.errorBox = h('div', { class: 'card__error', hidden: true, attrs: { role: 'alert', 'data-testid': 'task-error' } });
    this.injections = h('div', { class: 'injections', hidden: true, attrs: { 'data-testid': 'injection-warning' } });
    this.notices = h('ul', { class: 'card__notices', hidden: true, attrs: { 'data-testid': 'task-notices' } });
    this.retryBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', attrs: { 'data-testid': 'retry' }, on: { click: () => send({ type: 'retry', taskId: this.id, windowId: ui.windowId }) } }, icon('refresh', { size: 14 }), 'Retry');
    this.resumedNote = h('div', { class: 'divider divider--resume', hidden: true }, h('span', { text: 'Retry: carrying on' }));
    this.copyBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => this.copy() } }, icon('copy', { size: 14 }), 'Copy');
    this.footMeta = h('span', { class: 'card__meta', attrs: { 'data-testid': 'task-meta' } });
    this.foot = h('div', { class: 'card__foot', hidden: true }, this.footMeta, h('div', { class: 'card__btns' }, this.copyBtn, this.retryBtn));
    this.card = h(
      'section',
      { class: 'card' },
      h('div', { class: 'card__top' }, h('span', { class: 'card__label' }, icon('sparkle', { size: 12 }), 'Task'), this.pill, h('span', { class: 'card__spacer' }), this.costEl, this.timer),
      this.stepList,
      this.live,
      this.injections,
      this.promptBox,
      this.errorBox,
      this.answer,
      this.notices,
      this.foot,
    );
    append(this.el, this.divider, this.resumedNote, h('div', { class: 'bubble-row' }, this.bubble), this.card);
  }

  update(task) {
    this.task = task;
    this.el.dataset.status = task.status;
    this.divider.hidden = !task.contextReset;
    this.resumedNote.hidden = !task.resumed;
    // After a temporary error Retry carries on; otherwise it runs the task again from the start.
    const resumable = task.status === 'error' && ['rate_limit', 'overloaded', 'server', 'network'].includes(task.errorKind);
    this.retryBtn.title = resumable ? 'Carry on where Jarvis stopped' : 'Run this task again from the start';
    setText(this.bubble, displayText(task.text));
    setText(this.pill, STATUS_TEXT[task.status] || task.status);
    this.pill.dataset.tone = { running: 'active', waiting: 'warn', paused: 'warn', done: 'ok', stopped: 'warn', error: 'err', interrupted: 'warn' }[task.status];
    setText(this.costEl, task.cost > 0 ? `≈ ${formatUsd(task.cost)}` : '');
    this.tick();
    this.renderSteps(task);
    const final = FINAL_STATUSES.has(task.status);
    this.live.hidden = final || task.status !== 'running' || !(task.narration || ui.narration.get(task.id));
    if (!this.live.hidden) setText(this.live.querySelector('.live__text'), task.narration || ui.narration.get(task.id));
    this.renderPrompt(task.prompt);
    this.renderInjections(task.injections || []);
    const notices = Array.isArray(task.notices) ? task.notices : [];
    this.notices.hidden = !notices.length;
    if (this.notices.dataset.sig !== notices.join('\n')) {
      this.notices.dataset.sig = notices.join('\n');
      replaceChildren(this.notices, notices.map((n) => h('li', null, icon('info', { size: 14 }), h('span', { text: n }))));
    }
    this.errorBox.hidden = !task.error;
    if (task.error) replaceChildren(this.errorBox, icon(task.status === 'stopped' ? 'info' : 'alert', { size: 16 }), h('span', { text: task.error }));
    else if (task.status === 'stopped' && !task.answer) {
      this.errorBox.hidden = false;
      replaceChildren(this.errorBox, icon('info', { size: 16 }), h('span', { text: 'Stopped. Jarvis released your browser.' }));
    }
    this.answer.hidden = !task.answer;
    if (task.answer && this.answer.dataset.text !== task.answer) {
      this.answer.dataset.text = task.answer;
      replaceChildren(this.answer, renderMarkdown(task.answer));
    }
    this.foot.hidden = !final;
    if (final) {
      const actions = task.steps.filter((s) => s.kind === 'action').length;
      const dur = task.endedAt && task.startedAt ? formatDuration(task.endedAt - task.startedAt) : '';
      setText(this.footMeta, [`≈ ${formatUsd(task.cost)}`, `${actions} step${actions === 1 ? '' : 's'}`, dur, MODELS[task.model]?.short].filter(Boolean).join(' · '));
      this.copyBtn.hidden = !task.answer;
    }
  }

  tick() {
    const t = this.task;
    if (!t) return;
    const end = t.endedAt || Date.now();
    setText(this.timer, formatDuration(end - t.startedAt));
  }

  renderSteps(task) {
    const seen = new Set();
    for (const s of task.steps) {
      seen.add(s.id);
      const sig = `${s.kind}|${s.status}|${s.label}|${s.detail || ''}|${s.level || ''}`;
      let row = this.steps.get(s.id);
      if (!row) {
        row = this.buildStep(s);
        this.steps.set(s.id, row);
        this.stepList.appendChild(row.el);
        const thumb = ui.thumbs.get(task.id)?.get(s.id);
        if (thumb) this.setThumb(s.id, thumb);
      }
      if (row.sig !== sig) {
        row.sig = sig;
        row.el.dataset.status = s.status;
        row.el.dataset.kind = s.kind;
        if (s.level) row.el.dataset.level = s.level;
        setText(row.label, s.label);
        row.detail.hidden = !s.detail;
        setText(row.detail, s.detail || '');
        replaceChildren(row.state, stateIcon(s));
        if (s.kind === 'action' && s.tool && TOOL_ICON[s.tool] && !row.hasThumb) replaceChildren(row.thumb, icon(TOOL_ICON[s.tool], { size: 14 }));
      }
    }
    for (const [id, row] of this.steps) {
      if (!seen.has(id)) {
        row.el.remove();
        this.steps.delete(id);
      }
    }
  }

  buildStep(s) {
    const thumb = h('span', { class: 'step__thumb' }, icon(s.kind === 'action' ? TOOL_ICON[s.tool] || 'cursor' : STEP_ICON[s.kind] || 'info', { size: 14 }));
    const label = h('span', { class: 'step__label' });
    const detail = h('span', { class: 'step__detail', hidden: true });
    const state = h('span', { class: 'step__state' });
    const el = h('li', { class: 'step', attrs: { 'data-testid': 'step' } }, thumb, h('span', { class: 'step__body' }, label, detail), state);
    return { el, thumb, label, detail, state, sig: '' };
  }

  setThumb(stepId, url) {
    const row = this.steps.get(stepId);
    if (!row) return;
    row.hasThumb = true;
    const img = h('img', { src: url, alt: '', attrs: { 'data-testid': 'step-thumb' }, decoding: 'async' });
    replaceChildren(row.thumb, img);
    row.thumb.classList.add('has-img');
    row.thumb.onclick = () => showImage(url);
  }

  setNarration(text) {
    if (!this.task || FINAL_STATUSES.has(this.task.status)) return;
    this.live.hidden = !text || this.task.status !== 'running';
    setText(this.live.querySelector('.live__text'), text);
  }

  renderPrompt(prompt) {
    const key = prompt ? prompt.id : '';
    if (this.promptBox.dataset.key === key) return;
    this.promptBox.dataset.key = key;
    clear(this.promptBox);
    if (!prompt) return;
    const ic = { site: 'globe', confirm: 'shield', budget: 'dollar', steps: 'refresh' }[prompt.kind] || 'info';
    const choices = h(
      'div',
      { class: 'prompt__choices' },
      (prompt.choices || []).map((c) =>
        h('button', { class: `btn btn--${c.tone === 'primary' ? 'primary' : c.tone === 'danger' ? 'danger' : 'ghost'}`, type: 'button', attrs: { 'data-testid': 'prompt-choice', 'data-choice': c.id }, on: { click: (e) => {
          for (const b of e.currentTarget.parentElement.querySelectorAll('button')) b.disabled = true;
          send({ type: 'decide', promptId: prompt.id, choice: c.id });
        } } }, c.label),
      ),
    );
    const kindChip = prompt.detail ? h('span', { class: 'chip chip--kind', attrs: { 'data-testid': 'prompt-category' }, text: prompt.detail.charAt(0).toUpperCase() + prompt.detail.slice(1) }) : null;
    const sourceChip = prompt.source === 'guard'
      ? h('span', { class: `chip${prompt.consequential ? ' chip--warn' : ''}`, text: prompt.consequential ? 'Stopped by the safety check' : 'Jarvis asks before each step' })
      : h('span', { class: 'chip', text: 'Jarvis asked first' });
    const meta = prompt.kind === 'confirm' ? h('div', { class: 'prompt__meta' }, prompt.site ? h('span', { class: 'chip', text: prompt.site }) : null, kindChip, sourceChip) : null;
    append(
      this.promptBox,
      h(
        'div',
        { class: 'prompt', attrs: { 'data-testid': 'prompt', 'data-kind': prompt.kind, 'data-prompt-id': prompt.id, 'data-source': prompt.source || '', 'data-consequential': prompt.kind === 'confirm' ? String(!!prompt.consequential) : '', role: 'alertdialog', 'aria-label': prompt.title } },
        h('div', { class: 'prompt__head' }, h('span', { class: 'prompt__icon' }, icon(ic, { size: 18 })), h('span', { class: 'prompt__title', text: prompt.title })),
        h('p', { class: 'prompt__body', attrs: { 'data-testid': 'prompt-body' } }, promptBody(prompt)),
        prompt.facts ? h('p', { class: 'prompt__facts', attrs: { 'data-testid': 'prompt-facts' }, text: displayText(prompt.facts) }) : null,
        meta,
        choices,
      ),
    );
    const first = this.promptBox.querySelector('.btn--primary');
    if (first && document.activeElement === document.body) first.focus();
    scrollToEnd();
  }

  renderInjections(list) {
    this.injections.hidden = !list.length;
    if (!list.length) return;
    replaceChildren(
      this.injections,
      h('div', { class: 'injections__head' }, icon('shield-alert', { size: 16 }), h('strong', { text: 'Jarvis ignored instructions hidden in a page' })),
      h('p', { class: 'injections__lead', text: 'A page tried to give Jarvis orders. Page text is never treated as your instructions.' }),
      h('ul', null, list.map((i) => h('li', null, h('q', { text: truncate(i.quote, 180) }), i.site ? h('span', { class: 'injections__site', text: ` — ${i.site}` }) : null))),
    );
  }

  copy() {
    const t = this.task;
    if (!t?.answer) return;
    navigator.clipboard.writeText(t.answer).then(() => toast('Answer copied'), () => toast('Could not copy'));
  }
}

/**
 * A prompt's body as nodes: an address it shows (prompt.address, already made fully visible by the
 * service worker) goes on its own line, in a monospace block, whole; the rest is plain text.
 */
function promptBody(prompt) {
  const body = displayText(prompt.body);
  const address = displayText(prompt.address || '');
  const at = address ? body.indexOf(address) : -1;
  if (at < 0) return [body];
  return [body.slice(0, at), h('code', { class: 'prompt__address', attrs: { 'data-testid': 'prompt-address' }, text: address }), body.slice(at + address.length)];
}

function stateIcon(s) {
  if (s.status === 'running') return h('span', { class: 'spinner', attrs: { 'aria-label': 'In progress' } });
  if (s.status === 'done') return s.kind === 'action' || s.kind === 'ask' ? icon('check', { size: 14, title: 'Done' }) : null;
  if (s.status === 'error') return icon('alert', { size: 14, title: 'Failed' });
  if (s.status === 'blocked') return icon('shield', { size: 14, title: 'Blocked' });
  if (s.status === 'skipped') return icon('close', { size: 14, title: 'Skipped' });
  return null;
}

function showImage(url) {
  const overlay = h('div', { class: 'lightbox', on: { click: () => overlay.remove() } }, h('img', { src: url, alt: 'Step screenshot' }));
  app.appendChild(overlay);
}

let toastTimer = 0;
function toast(text) {
  const el = ui.els.toast;
  if (!el) return;
  setText(el, text);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

// ---------------------------------------------------------------------------------------------
// Dictation (Web Speech API, where Chrome allows it in the side panel)

function toggleDictation() {
  if (ui.listening) return stopDictation();
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return toast('Dictation is not available in this browser.');
  const rec = new Rec();
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  const base = ui.els.input.value ? `${ui.els.input.value.trim()} ` : '';
  rec.onresult = (e) => {
    let text = '';
    for (const r of e.results) text += r[0].transcript;
    ui.els.input.value = base + text;
    autosize();
  };
  rec.onerror = (e) => {
    stopDictation();
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      toast('Allow the microphone in the tab that just opened, then try again.');
      chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') });
    } else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Dictation stopped. Try again.');
  };
  rec.onend = () => stopDictation();
  ui.recognition = rec;
  ui.listening = true;
  ui.els.mic.classList.add('is-on');
  try {
    rec.start();
  } catch {
    stopDictation();
  }
}

function stopDictation() {
  ui.listening = false;
  ui.els.mic?.classList.remove('is-on');
  try {
    ui.recognition?.stop();
  } catch {
    /* ignore */
  }
  ui.recognition = null;
}

// ---------------------------------------------------------------------------------------------
// Sheets: Settings and History

function openSheet(name) {
  ui.sheet = name;
  const sheet = ui.els.sheet;
  sheet.hidden = false;
  sheet.dataset.view = name;
  if (name === 'settings') renderSettings();
  else renderHistory();
}

function closeSheet() {
  ui.sheet = null;
  ui.els.sheet.hidden = true;
  clear(ui.els.sheet);
  updateHeader();
}

function sheetHead(title, onBack = closeSheet) {
  return h('div', { class: 'sheet__head' }, h('button', { class: 'icon-btn', type: 'button', attrs: { 'aria-label': 'Back', 'data-testid': 'sheet-back' }, on: { click: onBack } }, icon('chevron-left')), h('h2', { class: 'sheet__title', text: title }));
}

async function renderSettings() {
  const s = await store.getSettings();
  const sites = await store.getSites();
  const everyday = await store.getEveryday();
  const sheet = ui.els.sheet;
  const save = async (patch) => {
    ui.settings = await store.setSettings(patch);
    toast('Saved');
  };
  const keyRow = h('div', { class: 'key-row' }, h('code', { class: 'key-row__masked', text: ui.masked || 'No key' }));
  const replace = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => {
    const input = h('input', { class: 'field__input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', attrs: { 'aria-label': 'New API key' } });
    const err = h('p', { class: 'field__error' });
    const ok = h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Save key', on: { click: async () => {
      const res = await store.setApiKey(input.value);
      if (!res.ok) return setText(err, res.error);
      ui.masked = res.masked;
      ui.hasKey = true;
      toast('Key saved');
      renderSettings();
    } } });
    replaceChildren(keyRow, h('div', { class: 'field' }, input), ok, err);
    input.focus();
  } } }, 'Replace');
  const remove = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: async () => {
    if (ui.running) return toast('Stop the running task first.');
    await store.clearApiKey();
    ui.hasKey = false;
    ui.masked = '';
    closeSheet();
    renderSetup();
  } } }, icon('trash', { size: 14 }), 'Remove');
  const budget = h('input', { class: 'field__input field__input--num', type: 'number', min: MIN_BUDGET_USD, max: MAX_BUDGET_USD, step: 0.25, value: s.budgetUsd.toFixed(2), attrs: { 'aria-label': 'Budget per task in dollars', 'data-testid': 'settings-budget' }, on: { change: async (e) => {
    await save({ budgetUsd: e.target.value });
    e.target.value = ui.settings.budgetUsd.toFixed(2);
  } } });
  const steps = h('input', { class: 'field__input field__input--num', type: 'number', min: MIN_STEPS, max: MAX_STEPS, step: 1, value: s.maxSteps, attrs: { 'aria-label': 'Maximum steps per task', 'data-testid': 'settings-steps' }, on: { change: async (e) => {
    await save({ maxSteps: e.target.value });
    e.target.value = ui.settings.maxSteps;
  } } });
  const incognito = h('input', { type: 'checkbox', checked: s.incognito, attrs: { 'data-testid': 'settings-incognito' }, on: { change: (e) => save({ incognito: e.target.checked }) } });
  const siteList = [...new Set([...Object.keys(sites), ...Object.keys(everyday)])].sort();
  const siteRow = (site) => {
    const toggle = h('input', { type: 'checkbox', checked: everyday[site] === true, attrs: { 'data-testid': 'everyday-toggle', 'data-site': site, 'aria-label': `Let Jarvis act on ${site} without asking for everyday steps` }, on: { change: async (e) => {
      await store.setEveryday(site, e.target.checked);
      toast(e.target.checked ? `Everyday steps on ${site} won’t ask` : `Jarvis asks before every step on ${site}`);
    } } });
    return h(
      'li',
      { class: 'site-row' },
      h('div', { class: 'site-row__head' }, h('span', { class: 'site-row__name', text: site }), sites[site] === 'always' ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Remove', on: { click: async () => {
        await store.forgetSite(site);
        renderSettings();
      } } }) : null),
      h('label', { class: 'toggle toggle--small' }, toggle, h('span', { class: 'toggle__ui' }), h('span', null, h('span', { text: `Let Jarvis act on ${site} without asking for everyday steps` }), h('span', { class: 'sub', text: 'Searching, pages of results, filters and sorting. Buying, sending, posting, deleting, account changes, downloads and anything unclear always ask.' }))),
    );
  };
  replaceChildren(
    sheet,
    sheetHead('Settings'),
    h(
      'div',
      { class: 'sheet__body' },
      profileNote(),
      h('section', { class: 'panel' }, h('div', { class: 'label' }, icon('key', { size: 14 }), 'API key'), keyRow, h('div', { class: 'row-btns' }, replace, remove), h('p', { class: 'hint', text: 'Stored only on this computer (Chrome’s extension storage). Sent only to api.anthropic.com, never synced or logged.' })),
      h('section', { class: 'panel' }, h('div', { class: 'label' }, icon('sparkle', { size: 14 }), 'Model'), modelPicker(s.model, (id) => save({ model: id }), 'settings-model')),
      h(
        'section',
        { class: 'panel' },
        h('div', { class: 'label' }, icon('dollar', { size: 14 }), 'Limits per task'),
        h('div', { class: 'panel--row' }, h('label', { class: 'mini-field' }, h('span', { class: 'sub', text: 'Budget' }), h('span', { class: 'money' }, '$', budget)), h('label', { class: 'mini-field' }, h('span', { class: 'sub', text: 'Max steps' }), steps)),
        h('p', { class: 'hint', text: 'Jarvis asks before it goes past either limit.' }),
      ),
      h('section', { class: 'panel' }, h('label', { class: 'toggle' }, incognito, h('span', { class: 'toggle__ui' }), h('span', null, h('strong', { text: 'Incognito: no history' }), h('span', { class: 'sub', text: 'Don’t keep finished tasks on this computer.' })))),
      h(
        'section',
        { class: 'panel' },
        h('div', { class: 'label' }, icon('globe', { size: 14 }), 'Sites Jarvis may always use'),
        h('p', { class: 'hint', text: 'Jarvis asks you before every step that changes something on a page. For a site you trust you can let everyday steps go without asking.' }),
        siteList.length
          ? h('ul', { class: 'sites', attrs: { 'data-testid': 'allowed-sites' } }, siteList.map(siteRow))
          : h('p', { class: 'hint', text: 'None yet. Jarvis asks the first time it works on a site.' }),
      ),
      h(
        'section',
        { class: 'panel' },
        h('div', { class: 'label' }, icon('keyboard', { size: 14 }), 'Shortcuts'),
        h('dl', { class: 'keys' }, h('dt', { text: 'Stop Jarvis' }), h('dd', { text: `Esc on the page · ${STOP_KEYS}` }), h('dt', { text: 'Open Jarvis' }), h('dd', { text: IS_MAC ? '⌥⇧J' : 'Alt+Shift+J' })),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }) } }, 'Change shortcuts', icon('external', { size: 14 })),
      ),
      h('section', { class: 'panel' }, h('div', { class: 'label' }, icon('shield', { size: 14 }), 'Privacy'), h('p', { class: 'hint', text: 'Screenshots and page text go only to the Claude API to do your task. Task history stays in this browser and you can clear it any time. Dictation uses Chrome’s speech service.' })),
      h('p', { class: 'version', text: `Jarvis for Chrome ${chrome.runtime.getManifest().version}` }),
    ),
  );
}

async function renderHistory(detailId = null) {
  const list = await store.getHistory();
  const sheet = ui.els.sheet;
  const settings = await store.getSettings();
  if (detailId) {
    const t = list.find((x) => x.id === detailId);
    if (!t) return renderHistory();
    replaceChildren(
      sheet,
      sheetHead('Task', () => renderHistory()),
      h(
        'div',
        { class: 'sheet__body' },
        h('div', { class: 'bubble-row' }, h('div', { class: 'bubble', text: t.text })),
        h(
          'section',
          { class: 'card' },
          h('div', { class: 'card__top' }, h('span', { class: 'pill', dataset: { tone: t.status === 'done' ? 'ok' : t.status === 'error' ? 'err' : 'warn' }, text: STATUS_TEXT[t.status] || t.status }), h('span', { class: 'card__spacer' }), h('span', { class: 'card__cost', text: `≈ ${formatUsd(t.cost)}` })),
          h(
            'ol',
            { class: 'steps' },
            (t.steps || []).map((s) =>
              h('li', { class: 'step', dataset: { kind: s.kind, status: s.status } }, h('span', { class: ['step__thumb', s.thumb && 'has-img'] }, s.thumb ? h('img', { src: s.thumb, alt: '', on: { click: () => showImage(s.thumb) } }) : icon(STEP_ICON[s.kind] || 'cursor', { size: 14 })), h('span', { class: 'step__body' }, h('span', { class: 'step__label', text: s.label })), h('span', { class: 'step__state' }, stateIcon(s))),
            ),
          ),
          t.error ? h('div', { class: 'card__error' }, icon('alert', { size: 16 }), h('span', { text: t.error })) : null,
          t.answer ? h('div', { class: 'answer' }, renderMarkdown(t.answer)) : null,
        ),
      ),
    );
    return;
  }
  const clearBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', attrs: { 'data-testid': 'clear-history' }, on: { click: () => {
    replaceChildren(clearBtn.parentElement, h('span', { class: 'sub', text: 'Delete all task history?' }), h('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Delete', attrs: { 'data-testid': 'confirm-clear-history' }, on: { click: async () => {
      await store.clearHistory();
      toast('History cleared');
      renderHistory();
    } } }), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Cancel', on: { click: () => renderHistory() } }));
  } } }, icon('trash', { size: 14 }), 'Clear history');
  replaceChildren(
    sheet,
    sheetHead('History'),
    h(
      'div',
      { class: 'sheet__body' },
      settings.incognito ? h('p', { class: 'note' }, icon('incognito', { size: 16 }), 'Incognito is on: new tasks are not kept.') : null,
      list.length
        ? h(
            'ul',
            { class: 'history', attrs: { 'data-testid': 'history-list' } },
            list.map((t) =>
              h(
                'li',
                null,
                h(
                  'button',
                  { class: 'history__item', type: 'button', on: { click: () => renderHistory(t.id) } },
                  h('span', { class: 'history__dot', dataset: { status: t.status } }),
                  h('span', { class: 'history__text' }, h('span', { class: 'history__title', text: truncate(t.text, 90) }), h('span', { class: 'history__meta', text: `${new Date(t.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${STATUS_TEXT[t.status] || t.status} · ≈ ${formatUsd(t.cost)}` })),
                  icon('chevron-right', { size: 16 }),
                ),
              ),
            ),
          )
        : h('div', { class: 'history__empty' }, icon('history', { size: 22 }), h('p', { text: 'No tasks yet.' }), h('p', { class: 'sub', text: 'Finished tasks are kept on this computer until you clear them.' })),
      list.length ? h('div', { class: 'row-btns' }, clearBtn) : null,
    ),
  );
}

boot().catch((err) => {
  replaceChildren(app, h('p', { class: 'fatal', text: `Jarvis could not start: ${err?.message || err}` }));
});
