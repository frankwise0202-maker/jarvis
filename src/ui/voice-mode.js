// Voice Mode (SPEC 14.1): the full-screen, hands-free "talk to Jarvis" experience.
//
//   import { openVoiceMode } from './ui/voice-mode.js';
//   const voice = openVoiceMode({ getSettings, startTurn, createCore, stt, tts, markdownToPlainText, sounds, onClose });
//   voice.close();
//
// Call openVoiceMode() from a user gesture (click, tap or key press): it starts the microphone
// right away, and iOS only lets the microphone and speech synthesis start inside a gesture.
//
// The loop: listening -> thinking / working (live mission status) -> speaking (captions with the
// current sentence highlighted) -> listening again when settings.voiceContinuous (default true).
//
// Tap the core: listening = stop and send; thinking/working = stop the turn; speaking = stop
// speaking and listen; otherwise = start listening. Esc or Exit closes (and aborts a running turn).
//
// Optional extras beyond SPEC 14.1 (all safe to omit):
//   saveSettings(patch)   persists the Continuous toggle as settings.voiceContinuous
//   wakeLock              { keepAwake, allowSleep } (platform/wakelock.js) keeps the screen on
//   activeRun             a TurnRun already in progress: watch it here and speak its answer
//   mode                  'auto' | 'quick' | 'swarm', or a function returning one (default settings.mode)
//   container             where to mount the overlay (default document.body)
//
// All text reaches the page through dom.js helpers (textContent). Never innerHTML.

import { h, clear, setText, on } from './dom.js';
import { icon } from './icons.js';

const SILENT_TRIES_MAX = 2; // consecutive silent listens before we stop and wait for a tap
const SILENCE_MS = 12000; // our own no-speech watchdog (browsers usually give up after ~8 s)
const MAX_LISTEN_MS = 60000; // send whatever we have after a minute of talking
const STOP_GRACE_MS = 1500; // after a manual stop, wait this long for the final transcript
const RETRY_DELAY_MS = 450; // pause before listening again after a silent try
const REPLY_CHIME_MS = 260; // let the reply chime ring before the voice starts
const RELISTEN_DELAY_MS = 350; // after speaking, let the audio settle before the mic opens again
const CHARS_PER_SEC = 14.5; // typical speech rate at voiceRate 1.0 (caption timing estimate)
const MODES = ['auto', 'quick', 'swarm'];
const AGENT_FINISHED = new Set(['done', 'error', 'stopped', 'interrupted']);
const AGENT_ACTIVE = new Set(['starting', 'thinking', 'searching', 'reading', 'writing']);
const AGENT_WORDS = {
  queued: 'queued',
  starting: 'starting',
  thinking: 'thinking',
  searching: 'searching',
  reading: 'reading',
  writing: 'writing',
  done: 'reported',
  error: 'failed',
  stopped: 'stopped',
  interrupted: 'interrupted',
};

let current = null; // the open instance; there is only ever one

/**
 * Open the voice overlay (or focus it if it is already open).
 * @returns {{ close(): void, readonly state: string, el: HTMLElement }}
 */
export function openVoiceMode(options = {}) {
  if (current) {
    current.focus();
    return current.api;
  }
  current = createVoiceMode(options || {});
  return current.api;
}

/** True while the overlay is open (the app should skip its own auto-speak and reply sounds). */
export function isVoiceModeOpen() {
  return current !== null;
}

/**
 * The Markdown of a turn's final answer: the text written after the last tool call or mission
 * (so the "I'll deploy six agents…" preamble is not read out as the summary).
 */
export function finalAnswerMarkdown(turn) {
  const segs = Array.isArray(turn && turn.segments) ? turn.segments : [];
  const isText = (s) => s && s.kind === 'text' && typeof s.text === 'string' && s.text.trim() !== '';
  let cut = -1;
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const kind = segs[i] && segs[i].kind;
    if (kind === 'tool' || kind === 'mission') {
      cut = i;
      break;
    }
  }
  let tail = segs.slice(cut + 1).filter(isText);
  if (!tail.length) {
    const texts = segs.filter(isText);
    if (!texts.length) return '';
    const lastReq = Math.max(...texts.map(reqOf));
    tail = texts.filter((s) => reqOf(s) === lastReq);
  }
  let out = '';
  let prevReq = null;
  for (const s of tail) {
    if (prevReq !== null && reqOf(s) !== prevReq) out += '\n\n';
    out += s.text;
    prevReq = reqOf(s);
  }
  return out.trim();
}

/**
 * Split plain text into sentence ranges [{ start, end }] that tile the whole string (trailing
 * spaces and newlines stay with their sentence). Decimals, domains and common abbreviations
 * do not end a sentence.
 */
export function splitSentences(text) {
  const s = String(text ?? '');
  const out = [];
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    let end = -1;
    if (c === '\n') {
      end = i + 1;
    } else if (c === '.' || c === '!' || c === '?' || c === '…') {
      let j = i + 1;
      while (j < s.length && /[.!?…"'”’)\]]/.test(s[j])) j += 1;
      if (j < s.length && !/\s/.test(s[j])) continue; // "3.5", "example.com"
      if (c === '.' && ABBREVIATION.test(s.slice(Math.max(start, i - 8), i + 1))) continue;
      end = j;
    }
    if (end < 0) continue;
    while (end < s.length && /\s/.test(s[end])) end += 1;
    if (s.slice(start, end).trim()) {
      out.push({ start, end });
      start = end;
    }
    i = end - 1;
  }
  if (start < s.length) {
    if (s.slice(start).trim() || !out.length) out.push({ start, end: s.length });
    else out[out.length - 1].end = s.length;
  }
  return out;
}

const ABBREVIATION = /(?:^|[\s(“"'])(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|inc|ltd|co|corp|approx|no|fig|e\.g|i\.e|a\.m|p\.m|u\.s|u\.k|[a-z])\.$/i;

function reqOf(segment) {
  return Number.isFinite(segment && segment.req) ? segment.req : 0;
}

// =================================================================================================

function createVoiceMode(opts) {
  const {
    getSettings,
    startTurn,
    createCore,
    stt,
    tts,
    markdownToPlainText,
    sounds,
    onClose,
    saveSettings,
    wakeLock,
    activeRun,
    mode,
    container,
  } = opts;

  const mount = container && typeof container.appendChild === 'function' ? container : document.body;
  const reducedMotion = prefersReducedMotion();
  const prevFocus = document.activeElement;

  const S = {
    state: 'idle',
    closed: false,
    sttOk: probe(() => typeof stt.startListening === 'function' && (typeof stt.sttSupported !== 'function' || !!stt.sttSupported())),
    ttsOk: probe(() => typeof tts.speak === 'function' && (typeof tts.ttsSupported !== 'function' || !!tts.ttsSupported())),
    sttBlocked: false,
    micWorked: false, // a listen session ran normally at least once (so a later refusal means "needs a tap")
    typing: false,
    continuous: readContinuous(),
    listen: null, // { gesture, text, stopRequested, handle, timers, heard }
    run: null, // { run, offs, lastAgent } | { pending: true }
    speech: null, // { token, kind, text, handle, timers, ... }
    speechToken: 0,
    answer: null, // { md, summary, full }
    showFull: false,
    karaoke: null, // { spans, els, cursor }
    userEl: null,
    silentTries: 0,
    retryTimer: 0,
    idleReason: 'ready',
    statusIcon: '',
    coreAgentSig: '',
    unlocked: false,
    announced: '',
  };
  let runFrame = 0; // pending requestAnimationFrame for run rendering
  let levelFrame = 0; // audio-level animation loop
  let levelValue = 0;
  let levelTarget = 0;
  let levelSent = -1;
  let levelLast = 0;

  // ------------------------------------------------------------------------------------- DOM

  const live = h('div', { class: 'vm-sr', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });

  const contSwitch = h(
    'button',
    {
      class: 'vm-switch',
      type: 'button',
      title: 'Listen again automatically after each reply',
      attrs: { role: 'switch', 'aria-checked': String(S.continuous), 'data-testid': 'voice-continuous' },
      on: { click: toggleContinuous },
    },
    h('span', { class: 'vm-switch-label', text: 'Continuous' }),
    h('span', { class: 'vm-switch-track', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'vm-switch-thumb' })),
  );

  const brand = h(
    'div',
    { class: 'vm-brand' },
    h('span', { class: 'vm-brand-dot', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'vm-brand-name', text: 'Jarvis' }),
    h('span', { class: 'vm-brand-tag', text: 'Voice' }),
  );

  const coreCanvas = h('canvas', { class: 'vm-core-canvas', attrs: { 'aria-hidden': 'true' } });
  const coreBtn = h(
    'button',
    { class: 'vm-core', type: 'button', attrs: { 'data-testid': 'voice-core', 'aria-label': 'Talk to Jarvis' }, on: { click: onCoreTap } },
    h('span', { class: 'vm-core-halo', attrs: { 'aria-hidden': 'true' } }),
    coreCanvas,
  );

  const statusIconEl = h('span', { class: 'vm-status-icon', attrs: { 'aria-hidden': 'true' } });
  const statusText = h('span', { class: 'vm-status-text', attrs: { 'data-testid': 'voice-status' } });
  const statusEl = h('div', { class: 'vm-status' }, statusIconEl, statusText);

  const captions = h('div', { class: 'vm-captions', attrs: { 'data-testid': 'voice-captions', 'data-kind': 'hint' } });
  const capSub = h('p', { class: 'vm-cap-sub', hidden: true });

  const mWave = h('span', { class: 'vm-mission-wave' });
  const mTitle = h('span', { class: 'vm-mission-title' });
  const mCount = h('span', { class: 'vm-mission-count' });
  const mFill = h('span', { class: 'vm-mission-fill' });
  const mAgents = h('ul', { class: 'vm-agents', attrs: { role: 'list' } });
  const mActivity = h('p', { class: 'vm-activity', attrs: { 'data-testid': 'voice-activity' } });
  const missionEl = h(
    'section',
    { class: 'vm-mission', hidden: true, attrs: { 'data-testid': 'voice-mission', 'aria-label': 'Mission progress' } },
    h('div', { class: 'vm-mission-head' }, mWave, mTitle, mCount),
    h('div', { class: 'vm-mission-rule', attrs: { 'aria-hidden': 'true' } }, mFill),
    mAgents,
    mActivity,
  );
  const agentChips = new Map(); // agent id -> { li, name }

  const pillIcon = h('span', { class: 'vm-pill-icon', attrs: { 'aria-hidden': 'true' } });
  const pillLabel = h('span', { class: 'vm-pill-label' });
  const readFull = h('button', { class: 'vm-pill', type: 'button', hidden: true, attrs: { 'data-testid': 'voice-read-full' }, on: { click: onReadFull } }, pillIcon, pillLabel);

  const input = h('input', {
    class: 'vm-input',
    type: 'text',
    placeholder: 'Ask Jarvis anything…',
    attrs: {
      'aria-label': 'Message Jarvis',
      'data-testid': 'voice-input',
      autocomplete: 'off',
      autocapitalize: 'sentences',
      spellcheck: 'true',
      enterkeyhint: 'send',
      maxlength: '4000',
    },
  });
  const sendBtn = h('button', { class: 'vm-send', type: 'submit', attrs: { 'aria-label': 'Send', 'data-testid': 'voice-send' } }, icon('send', { size: 20 }));
  const form = h('form', { class: 'vm-form', hidden: true, attrs: { 'data-testid': 'voice-type-form', autocomplete: 'off' }, on: { submit: onSubmit } }, input, sendBtn);

  const typeBtn = dockButton('vm-dock-type', 'voice-type-toggle', 'edit', 'Type', toggleTyping);
  const mainBtn = dockButton('vm-dock-main', 'voice-mic', 'mic', 'Talk', onPrimary);
  const exitBtn = dockButton('vm-dock-exit', 'voice-close', 'close', 'Exit', () => close());
  exitBtn.btn.setAttribute('aria-label', 'Exit voice mode');
  typeBtn.btn.setAttribute('aria-label', 'Type instead');

  const hints = h(
    'p',
    { class: 'vm-hints', attrs: { 'aria-hidden': 'true' } },
    h('kbd', { text: 'Space' }),
    h('span', { text: 'talk' }),
    h('span', { class: 'vm-hints-sep', text: '·' }),
    h('kbd', { text: 'Esc' }),
    h('span', { text: 'exit' }),
  );

  const root = h(
    'div',
    {
      class: 'vm',
      tabIndex: -1,
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Voice mode',
        'data-testid': 'voice-mode',
        'data-state': 'idle',
        'data-stt': S.sttOk ? 'ok' : 'unsupported',
        'data-typing': 'false',
      },
    },
    h('div', { class: 'vm-aura', attrs: { 'aria-hidden': 'true' } }),
    h('div', { class: 'vm-top' }, brand, contSwitch),
    h('div', { class: 'vm-stage' }, coreBtn, statusEl, captions, capSub, missionEl, readFull),
    h('div', { class: 'vm-bottom' }, form, h('div', { class: 'vm-dock' }, typeBtn.btn, mainBtn.btn, exitBtn.btn), hints),
    live,
  );

  // ----------------------------------------------------------------------------------- mount

  mount.appendChild(root);
  document.documentElement.classList.add('vm-open');
  const inerted = [];
  if (mount === document.body) {
    for (const el of Array.from(document.body.children)) {
      if (el === root || el.inert || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      el.inert = true;
      inerted.push(el);
    }
  }

  let core = null;
  try {
    if (typeof createCore === 'function') {
      core = createCore(coreCanvas, { size: Math.round(coreBtn.offsetWidth) || 280, mode: 'orbit' }) || null;
    }
  } catch (err) {
    console.warn('[voice] core unavailable, using the CSS core', err);
    core = null;
  }
  if (!core || typeof core.setState !== 'function') {
    coreBtn.classList.add('vm-core--css');
    core = cssCore(coreBtn);
  }

  const offs = [
    on(document, 'keydown', onKeydown, true),
    on(document, 'visibilitychange', onVisibility),
    on(window, 'online', onConnectivity),
    on(window, 'offline', onConnectivity),
  ];

  unlockSpeech(); // inside the opening gesture (iOS)
  keepAwake();

  const api = {
    close: () => close(),
    get state() {
      return S.state;
    },
    el: root,
  };
  const instance = { api, focus: () => focusDefault() };

  if (activeRun && typeof activeRun.on === 'function' && activeRun.turn && activeRun.turn.status === 'running') {
    S.run = { pending: true };
    setVoiceState('thinking');
    setStatus('Thinking…', 'sparkle');
    const asked = userTextFor(activeRun);
    if (asked) showCaption('quote', `“${asked}”`);
    else showCaption('hint', 'Working on it.');
    attachRun(activeRun, S.run);
  } else if (S.sttOk) {
    startListening({ gesture: true });
  } else {
    S.typing = true;
    goIdle('unsupported');
  }
  focusDefault();

  return instance;

  // ================================================================================ controls

  function dockButton(cls, testid, iconName, label, onClick) {
    const ic = h('span', { class: 'vm-dock-ic', attrs: { 'aria-hidden': 'true' } }, icon(iconName, { size: 22 }));
    const lb = h('span', { class: 'vm-dock-label', text: label });
    const btn = h('button', { class: ['vm-dock-btn', cls], type: 'button', attrs: { 'data-testid': testid }, on: { click: onClick } }, ic, lb);
    return { btn, ic, lb, name: iconName };
  }

  function setDockIcon(item, name) {
    if (item.name === name) return;
    item.name = name;
    clear(item.ic).appendChild(icon(name, { size: 22 }));
  }

  function renderControls() {
    if (S.closed) return;
    let ic = 'mic';
    let label = 'Talk';
    let aria = 'Start listening';
    let coreAria = 'Talk to Jarvis';
    if (S.listen) {
      const words = !!S.listen.text;
      ic = words ? 'send' : 'stop';
      label = words ? 'Send' : 'Stop';
      aria = words ? 'Stop listening and send' : 'Stop listening';
      coreAria = words ? 'Stop listening and send' : 'Stop listening';
    } else if (S.run) {
      ic = 'stop';
      label = 'Stop';
      aria = 'Stop Jarvis';
      coreAria = 'Stop Jarvis';
    } else if (S.speech) {
      ic = 'stop';
      label = 'Stop';
      aria = 'Stop speaking';
      coreAria = 'Stop speaking and listen';
    } else if (!S.sttOk) {
      ic = 'edit';
      label = 'Type';
      aria = 'Type a message';
      coreAria = 'Type a message';
    }
    setDockIcon(mainBtn, ic);
    setText(mainBtn.lb, label);
    mainBtn.btn.setAttribute('aria-label', aria);
    mainBtn.btn.dataset.action = label.toLowerCase();
    coreBtn.setAttribute('aria-label', coreAria);

    typeBtn.btn.hidden = !S.sttOk;
    typeBtn.btn.setAttribute('aria-expanded', String(S.typing));
    typeBtn.btn.classList.toggle('is-on', S.typing);
    form.hidden = !S.typing;
    root.dataset.typing = String(S.typing);
    sendBtn.disabled = !!S.run;
    renderReadFull();
  }

  function renderReadFull() {
    const A = S.answer;
    const more = !!A && !!A.full && A.full.length > A.summary.length + 24;
    const readingFull = !!S.speech && S.speech.kind === 'full';
    const busy = !!S.run || (!!S.listen && !!S.listen.text);
    const show = more && !busy && !S.closed;
    readFull.hidden = !show;
    if (!show) return;
    let label = 'Read full answer';
    let ic = 'speaker';
    if (readingFull) {
      label = 'Stop reading';
      ic = 'stop';
    } else if (!S.ttsOk) {
      label = S.showFull ? 'Show summary' : 'Show full answer';
      ic = S.showFull ? 'chevron-up' : 'chevron-down';
    }
    setText(pillLabel, label);
    if (pillIcon.dataset.icon !== ic) {
      pillIcon.dataset.icon = ic;
      clear(pillIcon).appendChild(icon(ic, { size: 16 }));
    }
  }

  function onCoreTap() {
    if (S.closed) return;
    haptic('light');
    unlockSpeech();
    clearRetry();
    if (S.listen) return requestSend(S.listen, false);
    if (S.run) return abortRun();
    if (S.speech && S.speech.kind !== 'apology') {
      cancelSpeech();
      return startListening({ gesture: true, keepAnswer: true });
    }
    cancelSpeech();
    if (S.sttOk) return startListening({ gesture: true, keepAnswer: !!S.answer });
    S.typing = true;
    renderControls();
    focusInput();
  }

  function onPrimary() {
    if (S.closed) return;
    unlockSpeech();
    clearRetry();
    if (S.listen) return requestSend(S.listen, false);
    if (S.run) return abortRun();
    if (S.speech) {
      const reply = S.speech.kind !== 'apology';
      cancelSpeech();
      if (reply) goIdle('answered');
      else afterApology();
      return;
    }
    if (S.sttOk) return startListening({ gesture: true, keepAnswer: !!S.answer });
    S.typing = true;
    renderControls();
    focusInput();
  }

  function onReadFull() {
    const A = S.answer;
    if (!A || S.closed) return;
    unlockSpeech();
    clearRetry();
    if (S.speech && S.speech.kind === 'full') {
      cancelSpeech();
      finishKaraoke();
      goIdle('answered');
      return;
    }
    if (!S.ttsOk) {
      S.showFull = !S.showFull;
      renderSpoken(S.showFull ? A.full : A.summary, 'answer');
      finishKaraoke();
      renderReadFull();
      return;
    }
    stopListening();
    speak(A.full, 'full');
  }

  function toggleContinuous() {
    S.continuous = !S.continuous;
    contSwitch.setAttribute('aria-checked', String(S.continuous));
    try {
      if (typeof saveSettings === 'function') saveSettings({ voiceContinuous: S.continuous });
    } catch (err) {
      console.warn('[voice] could not save voiceContinuous', err);
    }
    announce(S.continuous ? 'Continuous conversation on' : 'Continuous conversation off');
  }

  function toggleTyping() {
    if (S.closed) return;
    S.typing = !S.typing;
    if (S.typing) {
      if (S.listen) {
        stopListening();
        goIdle('ready');
      }
      renderControls();
      focusInput();
    } else {
      renderControls();
      try {
        coreBtn.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    if (S.closed) return;
    const text = input.value.trim();
    if (!text) {
      focusInput();
      return;
    }
    if (S.run) return;
    unlockSpeech();
    input.value = '';
    send(text);
  }

  function onKeydown(event) {
    if (S.closed) return;
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      trapTab(event);
      return;
    }
    if ((event.key === ' ' || event.code === 'Space') && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey && !isInteractive(event.target)) {
      event.preventDefault();
      onCoreTap();
    }
  }

  function trapTab(event) {
    const items = Array.from(root.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.disabled && el.getClientRects().length > 0 && !el.closest('[hidden]'),
    );
    if (!items.length) {
      event.preventDefault();
      root.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !root.contains(active) || active === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !root.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function focusDefault() {
    try {
      if (S.typing) input.focus({ preventScroll: true });
      else coreBtn.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  function focusInput() {
    try {
      input.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  // ============================================================================ state + status

  function setVoiceState(next) {
    S.state = next;
    root.dataset.state = next;
    try {
      core.setState(next);
    } catch (err) {
      console.warn('[voice] core.setState failed', err);
    }
    renderControls();
    updateLevelLoop();
    if (next === 'listening' || next === 'speaking') keepAwake();
  }

  function setStatus(text, ic) {
    if (statusText.textContent !== text) {
      statusText.textContent = text;
      if (!reducedMotion && typeof statusEl.animate === 'function') {
        try {
          statusEl.animate([{ opacity: 0.35, transform: 'translateY(2px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
        } catch {
          /* ignore */
        }
      }
    }
    if (ic && ic !== S.statusIcon) {
      S.statusIcon = ic;
      clear(statusIconEl).appendChild(icon(ic, { size: 14, strokeWidth: 2 }));
    }
  }

  function announce(message) {
    if (!message || message === S.announced) return;
    S.announced = message;
    setText(live, message);
  }

  function goIdle(reason = 'ready') {
    if (S.closed) return;
    S.idleReason = reason;
    const offline = !isOnline();
    setVoiceState(offline ? 'offline' : 'idle');
    const name = ownerName();
    const tapHint = S.sttOk ? 'Tap the core to talk.' : 'Type below to continue.';
    switch (reason) {
      case 'answered':
        setStatus('Ready', 'dot');
        if (S.answer && !S.karaoke) {
          renderSpoken(S.answer.summary, 'answer');
          finishKaraoke();
        }
        setSub(S.sttOk && !S.typing ? 'Tap the core to reply.' : '');
        break;
      case 'stopped':
        setStatus('Stopped', 'stop');
        showCaption('hint', 'Stopped.', tapHint);
        announce('Stopped');
        break;
      case 'paused':
        setStatus('Paused', 'pause');
        showCaption('hint', 'Paused while you were away.', S.sttOk ? 'Tap the core to pick up where we left off.' : '');
        announce('Paused');
        break;
      case 'silent':
        setStatus('Ready', 'dot');
        showCaption('hint', `Still here whenever you need me, ${name}.`, tapHint);
        announce('Stopped listening');
        break;
      case 'unsupported':
        setStatus('Type to talk', 'edit');
        showCaption('hint', 'Voice input isn’t available in this browser.', `Type below — your keyboard’s dictation key works too.${S.ttsOk ? ' I’ll answer out loud.' : ''}`);
        announce('Voice input is not available. Type your message instead.');
        break;
      default:
        setStatus(S.sttOk ? 'Ready' : 'Type to talk', S.sttOk ? 'dot' : 'edit');
        if (reason !== 'keep') showCaption('hint', S.sttOk ? 'Tap the core to talk.' : 'Type your request below.');
        announce('Ready');
    }
    if (offline) {
      setStatus('Offline', 'wifi-off');
      announce('Offline');
    }
    renderControls();
  }

  function onConnectivity() {
    if (S.closed) return;
    if (!S.listen && !S.run && !S.speech && (S.state === 'idle' || S.state === 'offline')) goIdle(S.idleReason === 'offline-kept' ? 'keep' : S.idleReason);
  }

  function onVisibility() {
    if (S.closed) return;
    if (document.hidden) {
      clearRetry();
      if (S.listen) {
        stopListening();
        goIdle('paused');
      }
    }
    updateLevelLoop();
  }

  // ================================================================================ captions

  function showCaption(kind, text, sub = '') {
    S.karaoke = null;
    S.userEl = null;
    clear(captions);
    captions.dataset.kind = kind;
    delete captions.dataset.done;
    delete captions.dataset.tone;
    setCaptionLength(kind === 'error' && text && text.length > 150 ? 'medium' : 'short');
    if (text) captions.appendChild(h('p', { class: `vm-cap vm-cap--${kind}`, text }));
    captions.scrollTop = 0;
    setSub(sub);
  }

  /** 'short' | 'medium' | 'long': sets the caption type size, and the core shrinks to make room. */
  function setCaptionLength(length) {
    captions.dataset.length = length;
    root.dataset.caplen = length;
  }

  function setSub(sub) {
    setText(capSub, sub || '');
    capSub.hidden = !sub;
  }

  function showUserWords(text) {
    if (captions.dataset.kind !== 'user' || !S.userEl) {
      showCaption('user', '');
      S.userEl = h('p', { class: 'vm-cap vm-cap--user' });
      captions.appendChild(S.userEl);
    }
    setText(S.userEl, text);
    setCaptionLength(text.length > 90 ? 'medium' : 'short');
    captions.scrollTop = captions.scrollHeight;
  }

  function showContext() {
    if (S.karaoke && (captions.dataset.kind === 'jarvis' || captions.dataset.kind === 'context')) {
      captions.dataset.kind = 'context';
      setSub('');
      return;
    }
    if (S.answer) {
      renderSpoken(S.answer.summary, 'answer');
      captions.dataset.kind = 'context';
      return;
    }
    showCaption('hint', greeting());
  }

  function greeting() {
    return `Go ahead, ${ownerName()}. I’m listening.`;
  }

  function renderSpoken(text, tone) {
    const spans = splitSentences(text);
    showCaption('jarvis', '');
    captions.dataset.tone = tone;
    setCaptionLength(text.length > 300 || /\n/.test(text) ? 'long' : text.length > 130 ? 'medium' : 'short');
    const els = spans.map((sp) => h('span', { class: 'vm-s is-future', text: text.slice(sp.start, sp.end) }));
    captions.appendChild(h('p', { class: 'vm-cap vm-cap--jarvis' }, els));
    S.karaoke = { spans, els, cursor: -1 };
  }

  function setKaraoke(index) {
    const K = S.karaoke;
    if (!K || !K.els.length) return;
    const i = Math.max(0, Math.min(K.els.length - 1, index));
    if (i === K.cursor) return;
    K.cursor = i;
    K.els.forEach((el, k) => {
      el.className = `vm-s ${k < i ? 'is-past' : k === i ? 'is-current' : 'is-future'}`;
    });
    scrollCaptionTo(K.els[i]);
  }

  function setKaraokeChar(charIndex) {
    const K = S.karaoke;
    if (!K || !K.spans.length) return;
    let idx = 0;
    for (let k = 0; k < K.spans.length; k += 1) {
      if (K.spans[k].start <= charIndex) idx = k;
      else break;
    }
    setKaraoke(idx);
  }

  function finishKaraoke() {
    if (!S.karaoke) return;
    captions.dataset.done = 'true';
    for (const el of S.karaoke.els) el.className = 'vm-s';
  }

  function scrollCaptionTo(el) {
    if (!el || captions.scrollHeight <= captions.clientHeight + 2) return;
    const top = Math.max(0, el.offsetTop - captions.clientHeight * 0.3);
    try {
      captions.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
    } catch {
      captions.scrollTop = top;
    }
  }

  // =============================================================================== listening

  function startListening({ gesture = false, retry = false, keepAnswer = false } = {}) {
    if (S.closed || S.run) return;
    clearRetry();
    if (!S.sttOk) {
      S.typing = true;
      goIdle('unsupported');
      focusInput();
      return;
    }
    cancelSpeech();
    stopListening();
    if (gesture) {
      S.silentTries = 0;
      S.typing = false;
      unlockSpeech();
    }
    const L = { gesture, text: '', stopRequested: false, handle: null, timers: [], heard: false };
    S.listen = L;
    syncCoreAgents(null);
    setVoiceState('listening');
    setStatus(retry ? 'Listening again…' : 'Listening…', 'mic');
    if (retry) showCaption('hint', 'I didn’t catch anything — take your time.', 'Still listening.');
    else if (keepAnswer && S.answer) showContext();
    else showCaption('hint', greeting());
    announce(retry ? 'Listening again' : 'Listening');
    play('listen-start');

    let handle = null;
    try {
      handle = stt.startListening({
        lang: getS().listenLang || 'en-US',
        onPartial: (value) => onPartial(L, value),
        onFinal: (value) => onFinal(L, value),
        onEnd: () => finishListening(L, 'end'),
        onError: (err) => onListenError(L, err),
      });
    } catch (err) {
      onListenError(L, { code: 'other', message: errorText(err) });
      return;
    }
    L.handle = handle || null;
    if (S.listen !== L) {
      abortHandle(L.handle);
      return;
    }
    L.timers.push(
      setTimeout(() => {
        if (S.listen === L && !L.text) finishListening(L, 'silence');
      }, SILENCE_MS),
      setTimeout(() => requestSend(L, true), MAX_LISTEN_MS),
    );
  }

  function onPartial(L, value) {
    if (S.listen !== L) return;
    const text = toText(value).trim();
    if (!text) return;
    L.heard = true;
    S.micWorked = true;
    const firstWords = !L.text;
    L.text = text;
    showUserWords(text);
    bumpLevel(0.5 + ((text.length * 7) % 10) / 30);
    if (firstWords) renderControls();
  }

  function onFinal(L, value) {
    if (S.listen !== L) return;
    const text = toText(value).trim();
    if (text) L.text = text;
    finishListening(L, 'final');
  }

  /** Tap while listening: stop and send what was heard (or just stop when nothing was). */
  function requestSend(L, auto) {
    if (S.listen !== L) return;
    if (!L.text && !auto) {
      finishListening(L, 'cancel');
      return;
    }
    if (L.stopRequested) return;
    L.stopRequested = true;
    stopHandle(L.handle);
    setStatus('Got it', 'check');
    // Give the recognizer a moment to deliver its final transcript, then send what we have.
    L.timers.push(setTimeout(() => finishListening(L, 'stop'), STOP_GRACE_MS));
  }

  function finishListening(L, reason) {
    if (S.listen !== L) return;
    S.listen = null;
    clearTimers(L.timers);
    if (reason !== 'end' && reason !== 'final') abortHandle(L.handle);
    if (S.closed) return;
    if (reason === 'end' || reason === 'final') S.micWorked = true;
    const text = (L.text || '').trim();
    if (reason === 'cancel') {
      play('listen-stop');
      goIdle('ready');
      return;
    }
    if (text) {
      S.silentTries = 0;
      play('listen-stop');
      send(text);
      return;
    }
    if (L.stopRequested) {
      goIdle('ready');
      return;
    }
    if (document.hidden) {
      goIdle('paused');
      return;
    }
    S.silentTries += 1;
    if (S.silentTries < SILENT_TRIES_MAX) {
      setStatus('Listening again…', 'mic');
      S.retryTimer = setTimeout(() => {
        S.retryTimer = 0;
        if (!S.closed && !S.listen && !S.run && !S.speech) startListening({ retry: true });
      }, RETRY_DELAY_MS);
      renderControls();
      return;
    }
    S.silentTries = 0;
    play('listen-stop');
    goIdle('silent');
  }

  function onListenError(L, err) {
    if (S.listen !== L) return;
    const code = (err && err.code) || 'other';
    if (code === 'no-speech') {
      S.micWorked = true;
      finishListening(L, 'silence');
      return;
    }
    if (code === 'aborted') {
      finishListening(L, L.stopRequested ? 'stop' : 'end');
      return;
    }
    S.listen = null;
    clearTimers(L.timers);
    abortHandle(L.handle);
    if (S.closed) return;
    // The platform's messages are already short and actionable (e.g. iPhone: turn on Dictation).
    const detail = err && typeof err.message === 'string' ? clip(singleLine(err.message), 160) : '';
    if (code === 'not-allowed') {
      if (!L.gesture && S.micWorked) {
        // The browser wants a fresh tap before it opens the microphone again (iOS).
        goIdle('needs-tap');
        return;
      }
      S.sttBlocked = true;
      root.dataset.stt = 'blocked';
      voiceInputError('Microphone blocked', 'I can’t hear you — the microphone is blocked.', `${detail || 'Allow the microphone for this site in your browser settings.'} Or type below.`);
      return;
    }
    if (code === 'network') {
      voiceInputError('Voice input offline', 'Speech recognition couldn’t reach its service.', 'Check your connection, or type below.');
      return;
    }
    if (code === 'unsupported') {
      // At runtime this usually means the listening language is not available here.
      voiceInputError('Voice input unavailable', 'I can’t listen in this language here.', `${detail || 'Change the listening language in Settings.'} Or type below.`);
      return;
    }
    voiceInputError('Voice input error', 'Voice input stopped unexpectedly.', `${detail && !/try again/i.test(detail) ? `${detail} ` : ''}Tap the core to try again, or type below.`);
  }

  function voiceInputError(title, text, sub) {
    S.typing = true;
    setVoiceState('error');
    setStatus(title, 'alert');
    showCaption('error', text, sub);
    announce(`${title}. ${text}`);
    play('error');
    haptic('error');
    renderControls();
  }

  /** Cancel listening without sending anything. */
  function stopListening() {
    const L = S.listen;
    if (!L) return;
    S.listen = null;
    clearTimers(L.timers);
    abortHandle(L.handle);
  }

  /** stop(): finish and deliver what was heard. */
  function stopHandle(handle) {
    try {
      if (handle && typeof handle.stop === 'function') handle.stop();
    } catch {
      /* already stopped */
    }
  }

  /** abort() (platform extension): cancel without delivering; falls back to stop(). */
  function abortHandle(handle) {
    try {
      if (handle && typeof handle.abort === 'function') handle.abort();
      else if (handle && typeof handle.stop === 'function') handle.stop();
    } catch {
      /* already stopped */
    }
  }

  function clearRetry() {
    if (S.retryTimer) clearTimeout(S.retryTimer);
    S.retryTimer = 0;
  }

  // ================================================================================== a turn

  function send(text) {
    const words = String(text || '').trim();
    if (!words || S.closed || S.run) return;
    clearRetry();
    cancelSpeech();
    stopListening();
    S.answer = null;
    S.showFull = false;
    S.silentTries = 0;
    syncCoreAgents(null);
    if (!isOnline()) {
      // Keep their words so nothing is lost.
      S.typing = true;
      input.value = words;
      setVoiceState('offline');
      setStatus('Offline', 'wifi-off');
      showCaption('error', 'You’re offline, so I can’t answer just yet.', 'Your request is in the box below — send it once you’re back online.');
      S.idleReason = 'offline-kept';
      announce('Offline. Your request was kept.');
      renderControls();
      return;
    }
    const pending = { pending: true };
    S.run = pending;
    setVoiceState('thinking');
    setStatus('Thinking…', 'sparkle');
    showCaption('quote', `“${words}”`);
    announce('Jarvis is thinking');
    let result;
    try {
      if (typeof startTurn !== 'function') throw new Error('Voice mode is not connected to Jarvis yet.');
      result = startTurn(words, { mode: resolveMode() });
    } catch (err) {
      S.run = null;
      sendFailed(err);
      return;
    }
    if (result && typeof result.then === 'function' && typeof result.on !== 'function') {
      result.then(
        (run) => {
          if (S.closed || S.run !== pending) {
            abortQuietly(run);
            return;
          }
          attachRun(run, pending);
        },
        (err) => {
          if (S.closed || S.run !== pending) return;
          S.run = null;
          sendFailed(err);
        },
      );
      return;
    }
    attachRun(result, pending);
  }

  function attachRun(run, pending) {
    if (S.closed) {
      abortQuietly(run);
      return;
    }
    if (S.run !== pending) {
      abortQuietly(run);
      return;
    }
    if (!run || typeof run.on !== 'function') {
      S.run = null;
      sendFailed(new Error('Jarvis couldn’t start that request.'));
      return;
    }
    const R = { run, offs: [], lastAgent: null, announcedMission: '' };
    S.run = R;
    const onEvent = (event, type) => {
      if (S.run !== R) return;
      const kind = type || (event && event.type);
      if (kind === 'agent' && event && event.agent) {
        const a = event.agent;
        if (a.activity && AGENT_ACTIVE.has(a.status)) R.lastAgent = a;
      }
      if (kind === 'end') {
        finishRun(R, (event && event.turn) || run.turn);
        return;
      }
      scheduleRunRender();
    };
    try {
      R.offs.push(run.on('*', onEvent));
    } catch (err) {
      console.warn('[voice] could not subscribe to the turn', err);
    }
    Promise.resolve(run.done).then(
      (turn) => finishRun(R, turn || run.turn),
      () => finishRun(R, run.turn),
    );
    renderControls();
    scheduleRunRender();
  }

  function scheduleRunRender() {
    if (!runFrame) runFrame = requestAnimationFrame(renderRun);
  }
  function cancelRunRender() {
    if (runFrame) cancelAnimationFrame(runFrame);
    runFrame = 0;
  }

  function renderRun() {
    runFrame = 0;
    const R = S.run;
    if (!R || !R.run || S.closed) return;
    const turn = R.run.turn;
    if (!turn) return;
    const missions = Object.values(turn.missions || {}).filter(Boolean);
    const latest = latestMission(missions);
    const active = latest && (latest.status === 'planning' || latest.status === 'running') ? latest : null;
    const next = active ? 'working' : 'thinking';
    if (S.state !== next) setVoiceState(next);
    const st = runStatus(turn, missions, active);
    setStatus(st.text, st.icon);
    if (active && R.announcedMission !== active.id) {
      R.announcedMission = active.id;
      announce('Agents deployed');
    }
    renderMission(latest, active, R);
    syncCoreAgents(latest);
  }

  function runStatus(turn, missions, active) {
    if (active) {
      const agents = Array.isArray(active.agents) ? active.agents : [];
      const n = agents.length;
      const wave = active.wave > 1 ? `Wave ${active.wave} · ` : '';
      if (active.status === 'planning') {
        return { text: n ? `${wave}Deploying ${n} agent${n === 1 ? '' : 's'}…` : `${wave}Planning a mission…`, icon: 'agents' };
      }
      const finished = agents.filter((a) => AGENT_FINISHED.has(a.status)).length;
      if (!finished) return { text: `${wave}${n} agent${n === 1 ? '' : 's'} in the field`, icon: 'agents' };
      return { text: `${wave}${finished}/${n} agents reporting`, icon: 'agents' };
    }
    const segs = Array.isArray(turn.segments) ? turn.segments : [];
    const seg = segs[segs.length - 1];
    const hadMission = missions.length > 0;
    if (seg && seg.kind === 'tool' && seg.status === 'running') {
      if (seg.tool === 'web_fetch') {
        const host = hostOf(seg.url);
        return { text: host ? `Reading ${host}` : 'Reading a page…', icon: 'globe' };
      }
      return { text: seg.query ? `Searching “${clip(singleLine(seg.query), 40)}”` : 'Searching the web…', icon: 'search' };
    }
    if (seg && seg.kind === 'text' && seg.text) return { text: hadMission ? 'Writing your briefing…' : 'Composing the answer…', icon: 'edit' };
    if (seg && seg.kind === 'memory') return { text: 'Updating memory…', icon: 'memory' };
    if (hadMission) return { text: 'Synthesizing the findings…', icon: 'layers' };
    return { text: 'Thinking…', icon: 'sparkle' };
  }

  function renderMission(latest, active, R) {
    const agents = latest && Array.isArray(latest.agents) ? latest.agents : [];
    const show = agents.length > 0;
    missionEl.hidden = !show;
    if (!show) {
      for (const chip of agentChips.values()) chip.li.remove();
      agentChips.clear();
      return;
    }
    const finished = agents.filter((a) => AGENT_FINISHED.has(a.status)).length;
    setText(mWave, `Wave ${latest.wave || 1}`);
    setText(mTitle, latest.title || 'Mission');
    setText(mCount, `${finished}/${agents.length}`);
    mFill.style.setProperty('--p', String(agents.length ? finished / agents.length : 0));
    missionEl.dataset.status = latest.status || '';
    missionEl.dataset.compact = agents.length > 8 ? 'true' : 'false';
    missionEl.setAttribute('aria-label', `Mission: ${finished} of ${agents.length} agents reported`);

    const seen = new Set();
    agents.forEach((a, index) => {
      const id = a.id || `${a.codename}-${index}`;
      seen.add(id);
      let chip = agentChips.get(id);
      if (!chip) {
        const dot = h('span', { class: 'vm-agent-dot', attrs: { 'aria-hidden': 'true' } });
        const name = h('span', { class: 'vm-agent-name' });
        const li = h('li', { class: 'vm-agent', attrs: { 'data-testid': 'voice-agent' } }, dot, name);
        chip = { li, name, key: '' };
        agentChips.set(id, chip);
      }
      if (mAgents.children[index] !== chip.li) mAgents.insertBefore(chip.li, mAgents.children[index] || null);
      const codename = a.codename || `Agent ${index + 1}`;
      const status = a.status || 'queued';
      const key = `${codename}|${status}|${a.role || ''}`;
      if (chip.key !== key) {
        chip.key = key;
        chip.li.dataset.status = status;
        chip.li.dataset.codename = codename;
        chip.li.dataset.tone = agentTone(status);
        setText(chip.name, codename);
        const word = AGENT_WORDS[status] || status;
        chip.li.title = a.role ? `${codename} — ${a.role} (${word})` : `${codename} (${word})`;
        chip.li.setAttribute('aria-label', `${codename}: ${word}`);
      }
    });
    for (const [id, chip] of agentChips) {
      if (!seen.has(id)) {
        chip.li.remove();
        agentChips.delete(id);
      }
    }

    let line = '';
    const a = R.lastAgent;
    if (active && a && AGENT_ACTIVE.has(a.status) && a.activity) line = `${a.codename} · ${singleLine(a.activity)}`;
    else if (!active && finished === agents.length) line = 'All agents have reported.';
    setText(mActivity, line);
    mActivity.hidden = !line;
  }

  function syncCoreAgents(mission) {
    const agents = mission && Array.isArray(mission.agents) ? mission.agents : [];
    const sig = agents.map((a) => `${a.id}:${a.status}`).join('|');
    if (sig === S.coreAgentSig) return;
    S.coreAgentSig = sig;
    try {
      if (typeof core.setAgents === 'function') core.setAgents(agents);
    } catch (err) {
      console.warn('[voice] core.setAgents failed', err);
    }
  }

  function finishRun(R, turn) {
    if (S.run !== R) return;
    S.run = null;
    for (const off of R.offs) callQuietly(off);
    cancelRunRender();
    missionEl.hidden = true;
    if (S.closed) return;
    const status = turn && turn.status;
    if (status === 'done') deliverAnswer(turn);
    else if (status === 'error') deliverError(turn);
    else if (status === 'interrupted') deliverInterrupted();
    else if (status === 'stopped') {
      syncCoreAgents(null);
      goIdle('stopped');
    } else {
      syncCoreAgents(null);
      goIdle('ready');
    }
  }

  function abortRun() {
    const R = S.run;
    if (!R) return;
    S.run = null;
    if (R.offs) for (const off of R.offs) callQuietly(off);
    cancelRunRender();
    if (R.run) abortQuietly(R.run);
    missionEl.hidden = true;
    syncCoreAgents(null);
    haptic('light');
    goIdle('stopped');
  }

  function deliverAnswer(turn) {
    syncCoreAgents(null); // the mission is over: the core turns to the voice
    const md = finalAnswerMarkdown(turn);
    const full = fullDisplayText(md);
    let summary = speechText(md, 'summary');
    if (!summary) summary = clip(full, 400);
    if (!summary) summary = `Done, ${ownerName()}. The details are in the chat.`;
    S.answer = { md, summary, full: full || summary };
    S.showFull = false;
    play('reply-done');
    haptic('success');
    announce('Answer ready');
    if (S.ttsOk) {
      speak(summary, 'summary', sounds ? REPLY_CHIME_MS : 0);
    } else {
      renderSpoken(summary, 'answer');
      finishKaraoke();
      goIdle('answered');
    }
  }

  function deliverError(turn) {
    const err = turnError(turn);
    const name = ownerName();
    if (err && err.kind === 'refusal') {
      fail('Can’t help with that', `I’m afraid I can’t help with that one, ${name}.`);
      return;
    }
    const message = clip(singleLine((err && err.message) || 'Something went wrong on my end.'), 220);
    fail('Something went wrong', `My apologies, ${name}. ${message}`);
  }

  function deliverInterrupted() {
    const text = `The connection dropped before I could finish, ${ownerName()}. Our progress is saved — resume it from the chat once you’re back online.`;
    fail('Connection lost', text, isOnline() ? 'error' : 'offline', 'wifi-off');
  }

  function sendFailed(err) {
    fail('Couldn’t send', `My apologies, ${ownerName()}. ${clip(singleLine(errorText(err) || 'I couldn’t start that request.'), 220)}`);
  }

  /** Show (and say) a short apology, then wait for a tap. */
  function fail(title, text, state = 'error', ic = 'alert') {
    syncCoreAgents(null);
    setVoiceState(state);
    setStatus(title, ic);
    announce(`${title}. ${text}`);
    play('error');
    haptic('error');
    if (S.ttsOk) {
      speak(text, 'apology');
    } else {
      renderSpoken(text, 'error');
      finishKaraoke();
      afterApology();
    }
  }

  function afterApology() {
    if (S.closed) return;
    setStatus(S.state === 'offline' ? 'Offline' : 'Tap the core to try again', S.state === 'offline' ? 'wifi-off' : 'refresh');
    setSub(S.sttOk ? '' : 'Type below to try again.');
    renderControls();
  }

  // ================================================================================ speaking

  /**
   * Speak `display` (shown as captions, may contain paragraph breaks). The engine gets the
   * whitespace-collapsed form; boundary indices are mapped back to the displayed text.
   */
  function speak(display, kind, delay = 0) {
    cancelSpeech();
    const { spoken, map } = spokenForm(display);
    const sp = {
      token: ++S.speechToken,
      kind,
      text: spoken,
      map,
      handle: null,
      timers: [],
      started: false,
      boundary: false,
      startedAt: Date.now(),
      prevIndex: -1,
      relBase: 0,
      chunkBases: new Map(),
      searchFrom: 0,
      quietPolls: 0,
    };
    S.speech = sp;
    if (kind === 'summary' || kind === 'full') {
      setVoiceState('speaking');
      setStatus(kind === 'full' ? 'Reading the full answer' : 'Speaking', 'speaker');
      announce('Jarvis is speaking');
    }
    renderSpoken(display, kind === 'apology' ? 'error' : 'answer');
    setKaraoke(0);
    renderControls();

    const begin = () => {
      if (sp.token !== S.speechToken || S.closed) return;
      const s = getS();
      try {
        sp.handle =
          tts.speak(speakable(spoken), {
            voiceURI: typeof s.voiceURI === 'string' ? s.voiceURI : '',
            rate: speechRate(),
            onStart: () => onSpeechStart(sp),
            onEnd: (info) => onSpeechEnd(sp, info),
            onBoundary: (event) => onSpeechBoundary(sp, event),
          }) || null;
      } catch (err) {
        console.warn('[voice] speech failed', err);
        speechDone(sp);
        return;
      }
      sp.startedAt = Date.now();
      startEstimator(sp);
      startSpeechWatchdog(sp);
    };
    if (delay > 0) sp.timers.push(setTimeout(begin, delay));
    else begin();
  }

  function onSpeechStart(sp) {
    if (sp.token !== S.speechToken || sp.started) return;
    sp.started = true;
    sp.startedAt = Date.now(); // the estimator counts from the first sound, not from the request
  }

  function onSpeechEnd(sp, info) {
    if (sp.token !== S.speechToken) return;
    // Someone else took over the speaker: do not open the microphone on top of them.
    if (info && info.reason === 'interrupted') sp.interrupted = true;
    // Engines that speak in chunks may report each chunk's end: finish only when nothing is left.
    sp.timers.push(
      setTimeout(() => {
        if (sp.token !== S.speechToken) return;
        let still = false;
        try {
          still = !sp.interrupted && typeof tts.isSpeaking === 'function' && !!tts.isSpeaking();
        } catch {
          still = false;
        }
        if (!still) speechDone(sp);
      }, 140),
    );
  }

  function onSpeechBoundary(sp, event) {
    if (sp.token !== S.speechToken || !event) return;
    if (event.name && event.name !== 'word' && event.name !== 'sentence') return;
    const ci = Number(event.charIndex);
    if (!Number.isFinite(ci) || ci < 0) return;
    if (!sp.started) onSpeechStart(sp);
    sp.boundary = true;
    setKaraokeChar(displayIndex(sp, globalCharIndex(sp, event, ci)));
    bumpLevel(0.55 + Math.random() * 0.35);
  }

  function displayIndex(sp, spokenIndex) {
    if (!sp.map.length) return spokenIndex;
    return sp.map[Math.max(0, Math.min(sp.map.length - 1, spokenIndex))];
  }

  /** Map a boundary event (possibly relative to one queued chunk) to an index in the full text. */
  function globalCharIndex(sp, event, ci) {
    if (Number.isFinite(event.offset)) return event.offset + ci;
    const utter = event.utterance && typeof event.utterance.text === 'string' ? event.utterance.text : '';
    const chunk = utter || (typeof event.chunk === 'string' ? event.chunk : '') || (typeof event.chunkText === 'string' ? event.chunkText : '');
    if (chunk) {
      if (chunk.length >= sp.text.length - 1) return ci;
      let base = sp.chunkBases.get(chunk);
      if (base === undefined) {
        const lead = chunk.length - chunk.trimStart().length;
        const probeText = chunk.trim().slice(0, 24);
        let at = probeText ? sp.text.indexOf(probeText, sp.searchFrom) : -1;
        if (at < 0 && probeText) at = sp.text.indexOf(probeText);
        base = at >= 0 ? at - lead : -1;
        if (at >= 0) sp.searchFrom = at + 1;
        sp.chunkBases.set(chunk, base);
      }
      if (base >= 0) return base + ci;
    }
    // Unknown framing: indices restart at each chunk; chunks start on sentence boundaries.
    if (ci < sp.prevIndex) {
      const passed = sp.relBase + sp.prevIndex;
      const next = splitSentences(sp.text).find((s) => s.start > passed);
      sp.relBase = next ? next.start : passed + 1;
    }
    sp.prevIndex = ci;
    return sp.relBase + ci;
  }

  /** Voices without word events: move the highlight by elapsed time instead. */
  function startEstimator(sp) {
    const timer = setInterval(() => {
      if (sp.token !== S.speechToken || sp.boundary) {
        clearInterval(timer);
        return;
      }
      if (!sp.started && Date.now() - sp.startedAt < 1500) return;
      const ci = Math.floor(((Date.now() - sp.startedAt) / 1000) * CHARS_PER_SEC * speechRate());
      setKaraokeChar(displayIndex(sp, Math.min(ci, sp.text.length - 1)));
    }, 250);
    sp.timers.push(timer);
  }

  function startSpeechWatchdog(sp) {
    const expected = (sp.text.length / (CHARS_PER_SEC * speechRate())) * 1000;
    sp.timers.push(setTimeout(() => speechDone(sp), expected * 2 + 6000));
    if (typeof tts.isSpeaking !== 'function') return;
    const poll = setInterval(() => {
      if (sp.token !== S.speechToken) {
        clearInterval(poll);
        return;
      }
      let speaking = true;
      try {
        speaking = !!tts.isSpeaking();
      } catch {
        speaking = true;
      }
      const age = Date.now() - sp.startedAt;
      if (!speaking && (sp.started || age > 4000)) {
        sp.quietPolls += 1;
        if (sp.quietPolls >= 2) speechDone(sp);
      } else {
        sp.quietPolls = 0;
      }
    }, 800);
    sp.timers.push(poll);
  }

  function speechDone(sp) {
    if (sp.token !== S.speechToken) return;
    S.speechToken += 1;
    S.speech = null;
    clearTimers(sp.timers);
    if (S.closed) return;
    finishKaraoke();
    if (sp.kind === 'apology') {
      afterApology();
      return;
    }
    if (S.continuous && S.sttOk && !S.typing && !S.sttBlocked && !sp.interrupted && !document.hidden) {
      // Hands-free: listen again once the speaker has gone quiet.
      setStatus('Your turn', 'mic');
      S.retryTimer = setTimeout(() => {
        S.retryTimer = 0;
        if (!S.closed && !S.listen && !S.run && !S.speech && !document.hidden) startListening({ keepAnswer: true });
        else if (!S.closed && !S.listen && !S.run && !S.speech) goIdle('answered');
      }, RELISTEN_DELAY_MS);
      renderControls();
      return;
    }
    goIdle('answered');
  }

  function cancelSpeech() {
    const sp = S.speech;
    if (!sp) return;
    S.speechToken += 1;
    S.speech = null;
    clearTimers(sp.timers);
    try {
      if (sp.handle && typeof sp.handle.cancel === 'function') sp.handle.cancel();
    } catch {
      /* ignore */
    }
    try {
      if (tts && typeof tts.stopSpeaking === 'function') tts.stopSpeaking();
    } catch {
      /* ignore */
    }
  }

  function speechText(md, kind) {
    if (!md) return '';
    try {
      if (tts && typeof tts.toSpeech === 'function') {
        const out = tts.toSpeech(md, kind);
        if (typeof out === 'string' && out.trim()) return out.trim();
      }
    } catch (err) {
      console.warn('[voice] toSpeech failed', err);
    }
    let plain = md;
    try {
      if (typeof markdownToPlainText === 'function') plain = String(markdownToPlainText(md) || '');
    } catch {
      plain = md;
    }
    plain = plain.trim();
    if (kind === 'summary') {
      const first = plain.split(/\n\s*\n/).find((p) => p.trim()) || '';
      return clip(singleLine(first), 400);
    }
    return plain;
  }

  /** The full answer for reading along: one block per paragraph (spoken as one stream). */
  function fullDisplayText(md) {
    let text = '';
    try {
      if (md && typeof markdownToPlainText === 'function') text = String(markdownToPlainText(md, { speech: true }) || '');
    } catch {
      text = '';
    }
    if (!text.trim()) text = speechText(md, 'full');
    return text
      .split(/\n+/)
      .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  function speechRate() {
    const r = Number(getS().voiceRate);
    return Number.isFinite(r) && r > 0 ? Math.min(2, Math.max(0.5, r)) : 1;
  }

  function unlockSpeech() {
    if (S.unlocked || !S.ttsOk) return;
    S.unlocked = true;
    try {
      if (typeof tts.unlockSpeech === 'function') tts.unlockSpeech();
    } catch {
      /* ignore */
    }
  }

  // =================================================================================== level

  function bumpLevel(v) {
    levelTarget = Math.max(levelTarget, Math.min(1, v));
  }

  function updateLevelLoop() {
    const want = !reducedMotion && !document.hidden && !S.closed && (S.state === 'listening' || S.state === 'speaking');
    if (want && !levelFrame) {
      levelLast = 0;
      levelFrame = requestAnimationFrame(levelTick);
    } else if (!want && levelFrame) {
      cancelAnimationFrame(levelFrame);
      levelFrame = 0;
      levelValue = 0;
      levelTarget = 0;
      pushLevel(0);
    }
  }

  function levelTick(ts) {
    levelFrame = 0;
    const dt = levelLast ? Math.min(100, ts - levelLast) : 16;
    levelLast = ts;
    if (S.speech && S.speech.started && !S.speech.boundary) {
      // No word events from this voice: a soft synthetic envelope keeps the core "talking".
      const t = ts / 1000;
      bumpLevel(0.3 + 0.28 * Math.abs(Math.sin(t * 5.3) * Math.sin(t * 1.7 + 0.6)));
    }
    levelTarget *= Math.exp(-dt / 240);
    levelValue += (levelTarget - levelValue) * (1 - Math.exp(-dt / 70));
    pushLevel(levelValue);
    levelFrame = requestAnimationFrame(levelTick);
  }

  function pushLevel(v) {
    const rounded = Math.round(v * 100) / 100;
    if (rounded === levelSent) return;
    levelSent = rounded;
    coreBtn.style.setProperty('--vm-level', String(rounded));
    try {
      if (typeof core.setLevel === 'function') core.setLevel(rounded);
    } catch {
      /* ignore */
    }
  }

  // =============================================================================== lifecycle

  function close() {
    if (S.closed) return;
    S.closed = true;
    if (current === instance) current = null;
    clearRetry();
    stopListening();
    cancelSpeech();
    if (S.run) {
      const R = S.run;
      S.run = null;
      if (R.offs) for (const off of R.offs) callQuietly(off);
      if (R.run) abortQuietly(R.run); // leaving voice mode hangs up: stop the turn
    }
    cancelRunRender();
    if (levelFrame) cancelAnimationFrame(levelFrame);
    levelFrame = 0;
    for (const off of offs) callQuietly(off);
    try {
      if (typeof core.destroy === 'function') core.destroy();
    } catch {
      /* ignore */
    }
    for (const el of inerted) el.inert = false;
    document.documentElement.classList.remove('vm-open');
    try {
      if (wakeLock && typeof wakeLock.allowSleep === 'function') wakeLock.allowSleep();
    } catch {
      /* ignore */
    }
    root.classList.add('is-leaving');
    root.setAttribute('aria-hidden', 'true');
    if (reducedMotion) root.remove();
    else setTimeout(() => root.remove(), 240);
    try {
      if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    try {
      if (typeof onClose === 'function') onClose();
    } catch (err) {
      console.error('[voice] onClose failed', err);
    }
  }

  // ================================================================================= helpers

  function getS() {
    try {
      const s = typeof getSettings === 'function' ? getSettings() : null;
      return s && typeof s === 'object' ? s : {};
    } catch {
      return {};
    }
  }

  function readContinuous() {
    const v = getS().voiceContinuous;
    return typeof v === 'boolean' ? v : true;
  }

  function ownerName() {
    const n = getS().userName;
    return typeof n === 'string' && n.trim() ? n.trim() : 'sir';
  }

  function resolveMode() {
    let m = mode;
    if (typeof m === 'function') {
      try {
        m = m();
      } catch {
        m = '';
      }
    }
    if (!MODES.includes(m)) m = getS().mode;
    return MODES.includes(m) ? m : 'auto';
  }

  function play(name) {
    try {
      if (sounds && typeof sounds.play === 'function') sounds.play(name);
    } catch {
      /* sounds are decoration */
    }
  }

  function haptic(kind) {
    try {
      if (sounds && typeof sounds.haptic === 'function') sounds.haptic(kind);
    } catch {
      /* ignore */
    }
  }

  function keepAwake() {
    try {
      if (wakeLock && typeof wakeLock.keepAwake === 'function') wakeLock.keepAwake();
    } catch {
      /* ignore */
    }
  }

  function probe(fn) {
    try {
      return !!fn();
    } catch {
      return false;
    }
  }
}

// ==================================================================================== helpers

function cssCore(el) {
  return {
    setState(state) {
      el.dataset.core = state;
    },
    setAgents() {},
    setLevel() {},
    destroy() {},
  };
}

function latestMission(missions) {
  let best = null;
  for (const m of missions) {
    if (!best) best = m;
    else if ((m.wave || 0) > (best.wave || 0) || ((m.wave || 0) === (best.wave || 0) && (m.createdAt || 0) >= (best.createdAt || 0))) best = m;
  }
  return best;
}

function agentTone(status) {
  if (status === 'done') return 'ok';
  if (status === 'error') return 'err';
  if (status === 'stopped' || status === 'interrupted') return 'warn';
  if (status === 'starting' || status === 'thinking') return 'think';
  if (AGENT_ACTIVE.has(status)) return 'active';
  return 'idle';
}

function turnError(turn) {
  if (turn && turn.error) return turn.error;
  const segs = Array.isArray(turn && turn.segments) ? turn.segments : [];
  for (let i = segs.length - 1; i >= 0; i -= 1) if (segs[i] && segs[i].kind === 'error' && segs[i].error) return segs[i].error;
  return null;
}

function userTextFor(run) {
  const turns = run && run.conversation && Array.isArray(run.conversation.turns) ? run.conversation.turns : [];
  const i = turns.indexOf(run.turn);
  for (let k = (i < 0 ? turns.length : i) - 1; k >= 0; k -= 1) if (turns[k] && turns[k].role === 'user') return clip(singleLine(turns[k].text), 160);
  return '';
}

/**
 * Collapse whitespace the way the speech engine does and keep, for every spoken character,
 * its index in the displayed text (so boundary events can highlight the right sentence).
 */
function spokenForm(display) {
  const src = String(display ?? '');
  const map = [];
  let spoken = '';
  let i = 0;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      let j = i;
      while (j < src.length && /\s/.test(src[j])) j += 1;
      if (j >= src.length) break;
      spoken += ' ';
      map.push(i);
      i = j;
    } else {
      spoken += src[i];
      map.push(i);
      i += 1;
    }
  }
  return { spoken, map };
}

/** "→" reads as "right arrow" on some voices; swap it for a pause (same length keeps caption offsets). */
function speakable(text) {
  return String(text).replace(/→/g, ',');
}

function toText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return String(value.text ?? value.transcript ?? '');
  return '';
}

function errorText(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return String(err.message || '');
}

function singleLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function clip(s, max) {
  const str = String(s ?? '');
  if (str.length <= max) return str;
  const cut = str.slice(0, Math.max(0, max - 1));
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function isInteractive(el) {
  return !!(el && typeof el.closest === 'function' && el.closest('input, textarea, select, button, a[href], [role="switch"], [contenteditable="true"]'));
}

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function clearTimers(list) {
  for (const t of list) {
    clearTimeout(t);
    clearInterval(t);
  }
  list.length = 0;
}

function callQuietly(fn) {
  try {
    if (typeof fn === 'function') fn();
  } catch {
    /* ignore */
  }
}

function abortQuietly(run) {
  try {
    if (run && typeof run.abort === 'function') run.abort();
  } catch {
    /* ignore */
  }
}
