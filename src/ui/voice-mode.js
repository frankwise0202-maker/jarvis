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
// current sentence and word highlighted) -> listening again when settings.voiceContinuous
// (default true) and the speech ended normally.
//
// The reply is spoken while it streams (tts.createSpeechStream): its text segments, cut at the
// first thematic break (---), converted for the ear, complete sentences only and never one twice,
// about 1,500 characters at most ("The rest is on screen."). See voice-stream.js. What the lead
// says before a search or a mission ("Let me check the latest on that.") is spoken while it works.
// When nothing was spoken by the end of the turn, the answer's summary is spoken after a chime.
//
// Tap the core: listening = stop and send; thinking/working = stop the turn; speaking = stop
// speaking and listen. While Jarvis is still saying the reply itself (before the --- line or the
// end of what is spoken) that tap stops the turn too, and it stays in the chat as far as it got;
// once the spoken part is complete (Jarvis is saying its last sentences, or is quiet while the
// details below the line are written) it only stops the voice and listens: the details keep
// being written in the chat, and a question asked meanwhile is sent once they are done. The dock
// button then reads "Stop" while Jarvis speaks (the voice only) and "Stop writing" while he
// writes (that stops the turn). Otherwise = start listening. Esc or Exit closes; a running turn
// carries on in the chat (Stop, or a tap on the core, is how to stop it). When Jarvis had already
// begun saying the answer, the chat does not read it aloud again (voiceModeSpoke).
//
// Holograms and blueprints (SPEC §14.1, §16, v6): a Voice Mode reply that calls show_hologram
// opens the hologram viewer over Voice Mode as soon as it starts building (the live build is
// visible), and one that calls draw_blueprint opens the blueprint viewer once it is drawn; the
// reply is still spoken. While a viewer is open, listening carries on hands-free (Continuous) and
// each thing heard goes to the viewer's local command matcher first: a matched command acts at
// once and Jarvis says a short acknowledgement ("Expanding.", "Here's the separator."); "blueprint
// the <part>" opens a saved sheet or starts the paid build as a Voice Mode turn; anything else is a
// Voice Mode turn in the same conversation, spoken and captioned in the viewer. The viewer's mic
// button acts like the core. Closing the viewer shows Voice Mode again.
//
// Optional extras beyond SPEC 14.1 (all safe to omit):
//   saveSettings(patch)   persists the Continuous toggle as settings.voiceContinuous
//   wakeLock              { keepAwake, allowSleep } (platform/wakelock.js) keeps the screen on
//   activeRun             a TurnRun already in progress: watch it here and speak its answer
//   mode                  'auto' | 'quick' | 'swarm', or a function returning one (default settings.mode)
//   container             where to mount the overlay (default document.body)
//   visuals               the hologram and blueprint viewers (app.js):
//                           open(run, segment)  show a hologram or blueprint of a Voice Mode reply
//                           isOpen()            a viewer covers Voice Mode
//                           command(text, { signal, spoken, later })
//                                               words heard while one is open: { handled: false }
//                                               or { handled: true, command, done? } (done: the
//                                               outcome of "blueprint the <part>", a Promise of
//                                               { opened } | { run } | { held } | { confirm } |
//                                               { error }); signal: Stop aborts it; later: said
//                                               while the reply that builds it streams (a 2D
//                                               request then waits: { handled: false, later })
//                           sync(info)          { state, label, listening, heard, busy, canListen }
//                                               for the viewer's mic button
//                           note(text)          a caption in the viewer ("I'll take that once …")
//                           spoken()            a reply or acknowledgement has been said (the
//                                               viewer's caption of it can leave)
//   screens               Screens (v7, app.js): command(text) -> null (not a screen command) or
//                           { handled: true, done: Promise<{ ack }> }. Checked first for every
//                           thing heard ("put it on my other screen", "float it", "bring it back"):
//                           it acts at once (free: no turn) and Jarvis says the short ack.
// The returned api also has ask(text, { mode, blueprintFor, signal }) -> { run } | { held } |
// { error } (words typed in a viewer over Voice Mode, or a 2D request: sent as a Voice Mode turn;
// one whose signal was aborted by Stop never starts), tap() (the core's tap), viewerTap() (the
// viewer's mic button: the core's tap, except that while a hologram of the reply builds it listens
// for a command), stop() (the viewer's "Stop building") and note(text) (a line under the caption).
//
// All text reaches the page through dom.js helpers (textContent). Never innerHTML.

import { h, clear, setText, on } from './dom.js';
import { icon } from './icons.js';
import { createSpokenFeed, splitSentences } from './voice-stream.js';
import { commandAck, savedBlueprintAck, blueprintQuestion, confirmReply } from './voice-visuals.js';

export { splitSentences };

const SILENT_TRIES_MAX = 2; // consecutive silent listens before we stop and wait for a tap
const SILENCE_MS = 12000; // our own no-speech watchdog (browsers usually give up after ~8 s)
const MAX_LISTEN_MS = 60000; // send whatever we have after a minute of talking
const STOP_GRACE_MS = 1500; // after a manual stop, wait this long for the final transcript
const RETRY_DELAY_MS = 450; // pause before listening again after a silent try
const REPLY_CHIME_MS = 260; // let the reply chime ring before the voice starts
const RELISTEN_DELAY_MS = 350; // after speaking, let the audio settle before the mic opens again
const FEED_DELAY_MS = 40; // streamed text: look for newly complete sentences at most this often
const CHARS_PER_SEC = 14.5; // typical speech rate at voiceRate 1.0 (caption timing estimate)
const CONFIRM_MS = 60000; // "Shall I draw a blueprint of …?" waits this long for a yes
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
const voicedRuns = new WeakSet(); // runs whose answer Voice Mode had begun to say when it closed

/**
 * True when Voice Mode had already begun saying this run's answer (not just "Let me check…") when
 * it was closed: the app then doesn't read the same reply aloud again when it finishes in the chat.
 */
export function voiceModeSpoke(run) {
  return !!run && typeof run === 'object' && voicedRuns.has(run);
}

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

// Segments that are a tool call: the answer is the text written after the last of them.
const ACTIONS = new Set(['tool', 'mission', 'hologram', 'blueprint']);

/**
 * The Markdown of a turn's final answer: the text written after the last tool call, mission,
 * hologram or blueprint (so the "I'll deploy six agents…" preamble is not read out as the summary).
 */
export function finalAnswerMarkdown(turn) {
  const segs = Array.isArray(turn && turn.segments) ? turn.segments : [];
  const isText = (s) => s && s.kind === 'text' && typeof s.text === 'string' && s.text.trim() !== '';
  let cut = -1;
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const kind = segs[i] && segs[i].kind;
    if (ACTIONS.has(kind)) {
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

function reqOf(segment) {
  return Number.isFinite(segment && segment.req) ? segment.req : 0;
}

/** True once the answer itself is being written: text after the last search, mission, hologram or blueprint (any text without one). */
function answerBegun(turn) {
  const segs = Array.isArray(turn && turn.segments) ? turn.segments : [];
  let last = -1;
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const kind = segs[i] && segs[i].kind;
    if (ACTIONS.has(kind)) {
      last = i;
      break;
    }
  }
  for (let i = last + 1; i < segs.length; i += 1) {
    const seg = segs[i];
    if (seg && seg.kind === 'text' && typeof seg.text === 'string' && seg.text.trim()) return true;
  }
  return false;
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
    visuals,
    createMicBands,
    screens,
  } = opts;

  const mount = container && typeof container.appendChild === 'function' ? container : document.body;
  const reducedMotion = prefersReducedMotion();
  const prevFocus = document.activeElement;

  const S = {
    state: 'idle',
    closed: false,
    sttOk: probe(() => typeof stt.startListening === 'function' && (typeof stt.sttSupported !== 'function' || !!stt.sttSupported())),
    ttsOk: probe(() => typeof tts.speak === 'function' && (typeof tts.ttsSupported !== 'function' || !!tts.ttsSupported())),
    sttBlocked: false, // the owner's microphone permission was refused (no hands-free re-listening)
    typing: false,
    continuous: readContinuous(),
    listen: null, // { gesture, text, stopRequested, handle, timers, heard }
    run: null, // { run, offs, lastAgent, feed, ... } | { pending: true } | { pending: true, held: text } (waits for S.bg)
    bg: null, // a run whose spoken part is over, left writing its details in the chat while Voice Mode listens
    speech: null, // { token, kind: 'live'|'summary'|'full'|'apology', text, map, stream|handle, timers, ... }
    speechToken: 0,
    answer: null, // { md, summary (what was spoken), full, more }
    showFull: false,
    karaoke: null, // { spans, els, texts, cursor, word }
    userEl: null,
    silentTries: 0,
    retryTimer: 0,
    idleReason: 'ready',
    statusIcon: '',
    coreAgentSig: '',
    unlocked: false,
    announced: '',
    confirm: null, // { proceed, cmd, at }: "Shall I draw a blueprint of …?" waits for yes or no
    heldWords: '', // said while a hologram built and not a viewer command: handled once the reply is said
    canListen: false, // last value sent to the viewer's mic (a hologram of this reply is building)
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
        'data-mission': 'false',
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

  // Living Core v2 (SPEC 2.4.13): while Jarvis listens, the mic's real bands drive the core's voice
  // band (one AnalyserNode, listening only; released when listening ends or the page hides). The
  // app passes createMicBands only where a second mic stream is safe beside speech recognition;
  // elsewhere, and if it fails, the synthetic envelope stays.
  let micBands = null;
  try {
    if (typeof createMicBands === 'function' && typeof core.setBands === 'function') {
      micBands = createMicBands({
        onBands: (b) => {
          try {
            core.setBands(b);
          } catch {
            /* optional */
          }
        },
      });
    }
  } catch (err) {
    console.warn('[voice] mic bands unavailable', err);
    micBands = null;
  }

  const offs = [
    on(document, 'keydown', onKeydown, true),
    on(document, 'visibilitychange', onVisibility),
    on(window, 'online', onConnectivity),
    on(window, 'offline', onConnectivity),
  ];
  // A hologram or blueprint viewer over Voice Mode makes it inert (overlay.js): the core's level
  // animation stops while it is covered and starts again once it shows.
  let inertObserver = null;
  try {
    if (typeof MutationObserver === 'function') {
      inertObserver = new MutationObserver(() => updateLevelLoop());
      inertObserver.observe(root, { attributes: true, attributeFilter: ['inert'] });
    }
  } catch {
    inertObserver = null;
  }

  unlockSpeech(); // inside the opening gesture (iOS)
  keepAwake();

  const api = {
    close: () => close(),
    get state() {
      return S.state;
    },
    el: root,
    /** Words typed in a viewer over Voice Mode, or its 2D request: a Voice Mode turn. */
    ask: (text, options) => askFromViewer(text, options),
    /** The core's tap (v5). */
    tap: () => onCoreTap(),
    /**
     * The mic button of a viewer over Voice Mode: like the core, except while a hologram of this
     * reply is building, when it listens for a command (acted on the live model) instead of stopping.
     */
    viewerTap: () => onViewerMic(),
    /** "Stop building" in the viewer: stop the turn (v5 Stop). True when there was one to stop. */
    stop: () => stopFromViewer(),
    /** A short line under Voice Mode's caption (e.g. "New chat: older chats can’t show holograms."). */
    note: (text) => {
      if (!S.closed && typeof text === 'string') setSub(text);
    },
  };
  const instance = { api, focus: () => focusDefault() };

  if (activeRun && typeof activeRun.on === 'function' && activeRun.turn && activeRun.turn.status === 'running') {
    S.run = { pending: true };
    setVoiceState('thinking');
    setStatus('Thinking…', 'sparkle');
    const asked = userTextFor(activeRun);
    if (asked) showCaption('quote', `“${asked}”`);
    else showCaption('hint', 'Working on it.');
    attachRun(activeRun, S.run, false); // the owner started it in the chat; exiting never stops a run
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
    } else if (S.run && spokenDone(S.run) && isTalking(liveOf(S.run))) {
      // Saying the last of the spoken part: the voice stops; the details keep being written.
      ic = 'stop';
      label = 'Stop';
      aria = 'Stop speaking';
      coreAria = 'Stop speaking and listen';
    } else if (S.run && spokenDone(S.run)) {
      ic = 'stop';
      label = 'Stop writing';
      aria = 'Stop writing the details';
      coreAria = 'Talk to Jarvis';
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
    mainBtn.btn.dataset.action = label.toLowerCase().replace(/\s+/g, '-');
    coreBtn.setAttribute('aria-label', coreAria);

    typeBtn.btn.hidden = !S.sttOk;
    typeBtn.btn.setAttribute('aria-expanded', String(S.typing));
    typeBtn.btn.classList.toggle('is-on', S.typing);
    form.hidden = !S.typing;
    root.dataset.typing = String(S.typing);
    sendBtn.disabled = !!S.run;
    renderReadFull();
    syncVisuals();
  }

  function renderReadFull() {
    const A = S.answer;
    const more = !!A && !!A.full && (typeof A.more === 'boolean' ? A.more : A.full.length > A.summary.length + 24);
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
    // The spoken part is complete (its last sentences are being said, or the details below the
    // line are being written): stop the voice and listen; the details keep coming in the chat.
    if (S.run && spokenDone(S.run)) return releaseRun();
    // Speaking the reply while it is still being written: interrupt both and listen (what was
    // written so far stays in the chat); also when sentences are already with the voice but it
    // hasn't said it started (some voices never do). Thinking or working: stop.
    if (S.run) return abortRun({ listen: S.state === 'speaking' || voiceStarting(liveOf(S.run)) });
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
    if (S.run && spokenDone(S.run) && isTalking(liveOf(S.run))) {
      // Stop the voice only (as in v4): the details are still being written, then shown to read.
      cancelSpeech();
      renderRunNow();
      return;
    }
    if (S.run) return abortRun(); // Stop (or "Stop writing" once the spoken part is over)
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
    // A hologram or blueprint viewer is open over Voice Mode (which it made inert): the keys are its own.
    if (root.inert) return;
    // Modal: the app's global shortcuts (new chat, focus composer…) must not act underneath.
    // Default actions (typing, Enter to submit, Space on buttons) are unaffected.
    event.stopPropagation();
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
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
    if (micBands) {
      if (next === 'listening' && !reducedMotion) micBands.start();
      else micBands.stop();
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
        if (S.answer && !S.karaoke) renderSpoken(S.answer.summary, 'answer');
        if (captions.dataset.kind === 'context') captions.dataset.kind = 'jarvis';
        finishKaraoke();
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
      case 'offline-kept':
        setStatus('Offline', 'wifi-off');
        showCaption('error', 'You’re offline, so I can’t answer just yet.', 'Your request is in the box below — send it once you’re back online.');
        announce('Offline. Your request was kept.');
        break;
      case 'back-online':
        setStatus('Ready', 'dot');
        showCaption('hint', 'You’re back online.', 'Your request is waiting below — send it when you’re ready.');
        announce('Back online');
        break;
      case 'unsupported':
        setStatus('Type to talk', 'edit');
        showCaption('hint', 'Voice input isn’t available in this browser.', `Type below — your keyboard’s dictation key works too.${S.ttsOk ? ' I’ll answer out loud.' : ''}`);
        announce('Voice input is not available. Type your message instead.');
        break;
      default:
        setStatus(S.sttOk ? 'Ready' : 'Type to talk', S.sttOk ? 'dot' : 'edit');
        if (reason !== 'keep') {
          if (S.typing) showCaption('hint', 'Type your request below.', S.sttOk ? 'Or tap the core to talk.' : '');
          else showCaption('hint', S.sttOk ? 'Tap the core to talk.' : 'Type your request below.');
        }
        announce('Ready');
    }
    if (offline && reason !== 'offline-kept') {
      setStatus('Offline', 'wifi-off');
      if (reason !== 'answered') setSub('You’re offline — I’ll need a connection to answer.');
      announce('Offline');
    }
    renderControls();
  }

  function onConnectivity() {
    if (S.closed || S.listen || S.run || S.speech) return;
    if (S.state !== 'idle' && S.state !== 'offline') return;
    const kept = S.idleReason === 'offline-kept' || S.idleReason === 'back-online';
    goIdle(kept ? (isOnline() ? 'back-online' : 'offline-kept') : S.idleReason);
  }

  function onVisibility() {
    if (S.closed) return;
    if (document.hidden) {
      // Pause listening (including a listen that was about to start again).
      const wasListening = !!S.listen || !!S.retryTimer;
      clearRetry();
      stopListening();
      if (wasListening && !S.run && !S.speech) goIdle('paused');
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
    fadeIn(captions);
  }

  /** A soft entrance when the captions change to something new (never per partial word). */
  function fadeIn(el) {
    if (reducedMotion || typeof el.animate !== 'function') return;
    try {
      el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    } catch {
      /* ignore */
    }
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
    setCaptionLength(captionLength(text));
    const texts = spans.map((sp) => text.slice(sp.start, sp.end));
    const els = texts.map((t) => h('span', { class: 'vm-s is-future', text: t }));
    captions.appendChild(h('p', { class: 'vm-cap vm-cap--jarvis' }, els));
    S.karaoke = { spans, els, texts, cursor: -1, word: -1 };
  }

  function captionLength(text) {
    const t = String(text || '').trim();
    return t.length > 300 || /\n/.test(t) ? 'long' : t.length > 130 ? 'medium' : 'short';
  }

  /** Captions that grow while the reply is spoken (one span per appended sentence). */
  function startLiveCaptions() {
    showCaption('jarvis', '');
    captions.dataset.tone = 'answer';
    const p = h('p', { class: 'vm-cap vm-cap--jarvis' });
    captions.appendChild(p);
    S.karaoke = { spans: [], els: [], texts: [], cursor: -1, word: -1, p };
    return S.karaoke;
  }

  function addLiveCaption(K, start, text) {
    if (!K || S.karaoke !== K || !K.p.isConnected) return;
    const el = h('span', { class: 'vm-s is-future', text });
    K.p.appendChild(el);
    K.spans.push({ start, end: start + text.length });
    K.els.push(el);
    K.texts.push(text);
  }

  function setKaraoke(index) {
    const K = S.karaoke;
    if (!K || !K.els.length) return;
    const i = Math.max(0, Math.min(K.els.length - 1, index));
    if (i === K.cursor) return;
    clearWord(K);
    K.cursor = i;
    if (captions.dataset.done) delete captions.dataset.done;
    K.els.forEach((el, k) => {
      el.className = `vm-s ${k < i ? 'is-past' : k === i ? 'is-current' : 'is-future'}`;
    });
    scrollCaptionTo(K.els[i]);
  }

  function sentenceAt(K, charIndex) {
    let idx = 0;
    for (let k = 0; k < K.spans.length; k += 1) {
      if (K.spans[k].start <= charIndex) idx = k;
      else break;
    }
    return idx;
  }

  function setKaraokeChar(charIndex) {
    const K = S.karaoke;
    if (!K || !K.spans.length) return;
    setKaraoke(sentenceAt(K, charIndex));
  }

  /** The word being spoken (boundary events): its sentence is current and the word glows. */
  function setKaraokeWord(charIndex, length) {
    const K = S.karaoke;
    if (!K || !K.spans.length) return;
    const k = sentenceAt(K, charIndex);
    setKaraoke(k);
    const text = K.texts[k] || '';
    const rel = charIndex - K.spans[k].start;
    if (!(length > 0) || rel < 0 || rel >= text.length) {
      clearWord(K);
      return;
    }
    const end = Math.min(text.length, rel + length);
    const el = K.els[k];
    clearWord(K);
    el.replaceChildren(text.slice(0, rel), h('span', { class: 'vm-w', text: text.slice(rel, end) }), text.slice(end));
    K.word = k;
  }

  function clearWord(K) {
    if (!K || !(K.word >= 0)) return;
    const el = K.els[K.word];
    if (el) el.textContent = K.texts[K.word] || '';
    K.word = -1;
  }

  function finishKaraoke() {
    const K = S.karaoke;
    if (!K) return;
    clearWord(K);
    K.cursor = -1;
    captions.dataset.done = 'true';
    for (const el of K.els) el.className = 'vm-s';
  }

  /** Scroll as little as possible so the sentence being spoken is fully in view. */
  function scrollCaptionTo(el) {
    if (!el || captions.scrollHeight <= captions.clientHeight + 2) return;
    const box = captions.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pad = 14; // stay clear of the faded edges
    const top = r.top - box.top + captions.scrollTop;
    const bottom = r.bottom - box.top + captions.scrollTop;
    const viewTop = captions.scrollTop + pad;
    const viewBottom = captions.scrollTop + captions.clientHeight - pad;
    let target;
    if (bottom - top > captions.clientHeight - pad * 2 || top < viewTop) target = top - pad;
    else if (bottom > viewBottom) target = bottom - captions.clientHeight + pad;
    else return;
    target = Math.max(0, Math.round(target));
    try {
      captions.scrollTo({ top: target, behavior: reducedMotion ? 'auto' : 'smooth' });
    } catch {
      captions.scrollTop = target;
    }
  }

  // =============================================================================== listening

  /**
   * duringBuild: the owner tapped the viewer's mic while a hologram of the streaming reply builds.
   * The reply goes on (its speech is not cut; no new sentence is spoken while the mic is open), and
   * what is heard is taken by heardDuringBuild(); the listen is one utterance (no retries).
   */
  function startListening({ gesture = false, retry = false, keepAnswer = false, duringBuild = false } = {}) {
    if (S.closed || (S.run && !duringBuild)) return;
    clearRetry();
    if (!S.sttOk) {
      S.typing = true;
      goIdle('unsupported');
      focusInput();
      return;
    }
    if (!duringBuild) cancelSpeech();
    stopListening();
    if (gesture) {
      S.silentTries = 0;
      S.typing = false;
      unlockSpeech();
    }
    const L = { gesture, text: '', stopRequested: false, handle: null, timers: [], heard: false, duringBuild };
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
    if (S.sttBlocked) {
      S.sttBlocked = false; // permission was fixed: hands-free can resume
      root.dataset.stt = 'ok';
    }
    const firstWords = !L.text;
    L.text = text;
    showUserWords(text);
    bumpLevel(0.5 + ((text.length * 7) % 10) / 30);
    if (firstWords) renderControls();
    else syncVisuals();
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
    const text = (L.text || '').trim();
    if (L.duringBuild) {
      play('listen-stop');
      afterBuildListen(text);
      return;
    }
    if (reason === 'cancel') {
      play('listen-stop');
      goIdle('ready');
      return;
    }
    if (text) {
      S.silentTries = 0;
      play('listen-stop');
      heard(text);
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
        if (S.closed || S.listen || S.run || S.speech) return;
        if (document.hidden) goIdle('paused');
        else startListening({ retry: true });
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
    if (L.duringBuild) {
      // A listen while the hologram builds failed: the reply carries on (the viewer's mic shows it).
      afterBuildListen('');
      return;
    }
    // The platform's messages are already short and actionable (e.g. iPhone: turn on Dictation).
    const detail = err && typeof err.message === 'string' ? asSentence(clip(singleLine(err.message), 160)) : '';
    if (code === 'not-allowed') {
      if (!L.gesture) {
        // Hands-free re-listening only ever follows a tap-started session the browser accepted,
        // so a refusal here means it wants a fresh tap (iOS), not that the mic is blocked.
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

  /**
   * Ask Jarvis: a Voice Mode turn (the spoken reply channel). opts: { mode, blueprintFor } (a 2D
   * request from a hologram viewer over Voice Mode). Returns { run } | { held: true } | { pending:
   * true } | { error } (the error is also said).
   */
  function send(text, opts = {}) {
    const words = String(text || '').trim();
    if (!words || S.closed) return { error: 'Nothing to send.' };
    if (S.run) return { error: 'I’m still working on the previous request.' };
    S.confirm = null; // a new request: a pending "Shall I draw …?" is moot
    clearRetry();
    cancelSpeech();
    stopListening();
    if (S.bg) {
      // The previous reply is still writing its details in the chat (one turn at a time): ask
      // this once it is done.
      S.run = { pending: true, held: words, opts };
      setVoiceState('thinking');
      setStatus('Finishing the details on screen…', 'edit');
      showCaption('quote', `“${words}”`, 'I’ll take that as soon as the details are on screen.');
      announce('Jarvis will answer once the details are on screen');
      return { held: true };
    }
    S.answer = null;
    S.showFull = false;
    S.silentTries = 0;
    syncCoreAgents(null);
    if (!isOnline()) {
      // Keep their words so nothing is lost.
      S.typing = true;
      input.value = words;
      goIdle('offline-kept');
      return { error: 'You’re offline. Reconnect and try again.' };
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
      const input = { mode: opts && MODES.includes(opts.mode) ? opts.mode : resolveMode() };
      if (opts && opts.blueprintFor) input.blueprintFor = opts.blueprintFor;
      result = startTurn(words, input);
    } catch (err) {
      S.run = null;
      sendFailed(err);
      return { error: errorText(err) || 'I couldn’t start that request.' };
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
      return { pending: true };
    }
    attachRun(result, pending);
    return S.run && S.run.run === result ? { run: result } : { error: 'Jarvis couldn’t start that request.' };
  }

  function attachRun(run, pending, owned = true) {
    if (S.closed || S.run !== pending) {
      if (owned) abortQuietly(run);
      return;
    }
    if (!run || typeof run.on !== 'function') {
      S.run = null;
      sendFailed(new Error('Jarvis couldn’t start that request.'));
      return;
    }
    // feed: which sentences to speak next while the reply streams (null: speak the summary at the
    // end, as for a reply started in the chat). liveDone: its speech already ended normally;
    // liveOff: its speech was stopped or failed (nothing more is spoken for this reply).
    // answerFrom: where the answer itself (text after the last search or mission) starts in the
    // live speech's text; answerHeard: a chunk of it began to play.
    // visuals: ids of the holograms and blueprints of this reply already shown over Voice Mode.
    const R = { run, owned, offs: [], lastAgent: null, announcedMission: '', feed: null, feedTimer: 0, liveDone: false, liveOff: false, answerFrom: -1, answerHeard: false, visuals: new Set() };
    S.run = R;
    if (speaksWhileStreaming(R)) {
      R.feed = createSpokenFeed({ convert: speechMarkdown });
      // Opened while a reply was already under way: what is on screen already is not read out.
      if (!owned) {
        try {
          R.feed.skip(run.turn && run.turn.segments);
        } catch (err) {
          console.warn('[voice] could not read the reply so far', err);
        }
      }
    }
    const onEvent = (event, type) => {
      const kind = type || (event && event.type);
      if (S.bg === R && kind === 'end') return finishBackground(R, (event && event.turn) || run.turn);
      if (S.run !== R) return;
      if (kind === 'agent' && event && event.agent) {
        const a = event.agent;
        if (a.activity && AGENT_ACTIVE.has(a.status)) R.lastAgent = a;
      }
      if (kind === 'end') {
        finishRun(R, (event && event.turn) || run.turn);
        return;
      }
      if (kind === 'segment' && event && event.segment) {
        showVisual(R, event.segment);
        // The viewer's mic listens while this reply's hologram builds, and stops him again after.
        if (event.segment.kind === 'hologram' && S.canListen !== (!S.listen && S.sttOk && buildingVisual(R))) syncVisuals();
      }
      if (R.feed && (kind === 'segment' || kind === 'segment-removed')) scheduleFeed(R);
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
    if (R.feed) scheduleFeed(R);
  }

  /** Voice Mode's own questions (spoken turns) are read aloud while the reply streams in. */
  function speaksWhileStreaming(R) {
    if (!S.ttsOk || typeof tts.createSpeechStream !== 'function') return false;
    return R.owned || !!(R.run.turn && R.run.turn.spoken === true);
  }

  function detachRun(R) {
    for (const off of R.offs || []) callQuietly(off);
    R.offs = [];
    if (R.feedTimer) clearTimeout(R.feedTimer);
    R.feedTimer = 0;
  }

  function scheduleRunRender() {
    if (!runFrame) runFrame = requestAnimationFrame(renderRun);
  }
  function cancelRunRender() {
    if (runFrame) cancelAnimationFrame(runFrame);
    runFrame = 0;
  }
  /** Render now (the voice started or paused: the state changes at once). */
  function renderRunNow() {
    cancelRunRender();
    renderRun();
  }

  function renderRun() {
    runFrame = 0;
    const R = S.run;
    if (!R || !R.run || S.closed) return;
    const turn = R.run.turn;
    if (!turn) return;
    if (S.listen) return; // the owner is speaking a command while it builds: the listening state stays
    const missions = Object.values(turn.missions || {}).filter(Boolean);
    const latest = latestMission(missions);
    const active = latest && (latest.status === 'planning' || latest.status === 'running') ? latest : null;
    const talking = isTalking(liveOf(R));
    const next = talking ? 'speaking' : active ? 'working' : 'thinking';
    if (S.state !== next) setVoiceState(next);
    if (talking) {
      setStatus('Speaking', 'speaker');
    } else {
      const st = runStatus(turn, missions, active);
      setStatus(st.text, st.icon);
    }
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
      // k/N counts successful reports, like the core's readout; failures are named in the strip.
      const finished = agents.filter((a) => AGENT_FINISHED.has(a.status)).length;
      const done = agents.filter((a) => a.status === 'done').length;
      if (!finished) return { text: `${wave}${n} agent${n === 1 ? '' : 's'} in the field`, icon: 'agents' };
      return { text: `${wave}${done}/${n} agents reporting`, icon: 'agents' };
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
    if (seg && seg.kind === 'hologram' && seg.status === 'building') return { text: 'Building the hologram…', icon: 'hologram' };
    if (seg && seg.kind === 'blueprint' && seg.status === 'building') return { text: 'Drawing the blueprint…', icon: 'blueprint' };
    if (seg && seg.kind === 'text' && seg.text) return { text: hadMission ? 'Writing your briefing…' : 'Writing…', icon: 'edit' };
    if (seg && seg.kind === 'memory') return { text: 'Updating memory…', icon: 'memory' };
    if (hadMission) return { text: 'Synthesizing the findings…', icon: 'layers' };
    return { text: 'Thinking…', icon: 'sparkle' };
  }

  function showMission(show) {
    missionEl.hidden = !show;
    root.dataset.mission = String(show);
  }

  function renderMission(latest, active, R) {
    const agents = latest && Array.isArray(latest.agents) ? latest.agents : [];
    const show = agents.length > 0;
    showMission(show);
    if (!show) {
      for (const chip of agentChips.values()) chip.li.remove();
      agentChips.clear();
      return;
    }
    const finished = agents.filter((a) => AGENT_FINISHED.has(a.status)).length;
    const done = agents.filter((a) => a.status === 'done').length;
    const failed = agents.filter((a) => a.status === 'error').length;
    setText(mWave, `Wave ${latest.wave || 1}`);
    setText(mTitle, latest.title || 'Mission');
    setText(mCount, `${done}/${agents.length}`);
    mFill.style.setProperty('--p', String(agents.length ? done / agents.length : 0));
    missionEl.dataset.status = latest.status || '';
    missionEl.dataset.compact = agents.length > 8 ? 'true' : 'false';
    missionEl.setAttribute('aria-label', `Mission: ${done} of ${agents.length} agents reported${failed ? `, ${failed} failed` : ''}`);

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
    else if (!active && finished === agents.length) line = failed || done < finished ? `${done} reported · ${finished - done} ${failed === finished - done ? 'failed' : 'did not finish'}` : 'All agents have reported.';
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
    if (S.bg === R) return finishBackground(R, turn);
    if (S.run !== R) return;
    // The owner is speaking a command while the hologram builds: the reply is delivered once the
    // words are in (afterBuildListen), so the voice never talks over the open microphone.
    if (S.listen && S.listen.duringBuild && !S.closed) {
      R.endedTurn = turn || (R.run && R.run.turn) || null;
      return;
    }
    S.run = null;
    detachRun(R);
    cancelRunRender();
    showMission(false);
    if (S.closed) return;
    const status = turn && turn.status;
    // Words held while it built are taken once the reply has been said (dropped if it failed or stopped).
    if (R.heldWords) {
      if (status === 'done') S.heldWords = R.heldWords;
      R.heldWords = '';
    }
    syncVisuals();
    if (status === 'done') {
      deliverAnswer(turn, R);
      return;
    }
    cancelSpeech(); // a reply that failed or stopped is not read out any further
    if (status === 'error') deliverError(turn);
    else if (status === 'interrupted') deliverInterrupted();
    else if (status === 'stopped') {
      syncCoreAgents(null);
      goIdle('stopped');
    } else {
      syncCoreAgents(null);
      goIdle('ready');
    }
  }

  /** Stop the turn and its speech; then listen (the owner interrupted the voice) or wait. */
  function abortRun({ listen = false } = {}) {
    const R = S.run;
    if (!R) return;
    S.run = null;
    S.confirm = null;
    S.heldWords = '';
    // "blueprint the …" still looking in the library: whatever it finds, nothing starts.
    if (R.ctl) callQuietly(() => R.ctl.abort());
    detachRun(R);
    cancelRunRender();
    cancelSpeech();
    if (R.run) abortQuietly(R.run);
    if (R.held && S.bg) {
      // Stop while a question waits for the previous reply's details: stop that reply too.
      const B = S.bg;
      S.bg = null;
      detachRun(B);
      abortQuietly(B.run);
    }
    showMission(false);
    syncCoreAgents(null);
    haptic('light');
    if (listen && S.sttOk) startListening({ gesture: true, keepAnswer: true });
    else goIdle('stopped');
  }

  /** The spoken part of this reply is complete: everything Jarvis says of it was handed to the voice. */
  function spokenDone(R) {
    if (!R || !R.feed || R.pending) return false;
    try {
      return R.liveDone || R.feed.state().finished;
    } catch {
      return false;
    }
  }

  /**
   * Interrupted once the spoken part is complete: stop the voice and listen. The run keeps writing
   * the details in the chat (S.bg); what the owner asks meanwhile is sent once it is done.
   */
  function releaseRun() {
    const R = S.run;
    if (!R) return;
    S.run = null;
    S.bg = R;
    cancelRunRender();
    cancelSpeech();
    showMission(false);
    syncCoreAgents(null);
    haptic('light');
    finishKaraoke();
    // What was said stays on screen as context while listening (no "Read full answer" yet).
    let said = '';
    try {
      said = String(R.feed.state().spoken || '').trim();
    } catch {
      said = '';
    }
    S.answer = said ? { md: '', summary: said, full: '' } : null;
    if (S.sttOk) {
      startListening({ gesture: true, keepAnswer: true });
      if (S.listen) setSub('Finishing the details on screen…');
    } else goIdle('keep');
  }

  /** A run left writing its details (S.bg) ended: offer its answer, then ask what was held. */
  function finishBackground(R, turn) {
    if (S.bg !== R) return;
    S.bg = null;
    detachRun(R);
    if (S.closed) return;
    if (turn && turn.status === 'done') {
      const md = finalAnswerMarkdown(turn);
      const full = fullDisplayText(md);
      if (R.feed) {
        try {
          R.feed.update({ segments: turn.segments, done: true });
        } catch {
          /* what was said so far */
        }
        S.answer = answerFromFeed(R, md, full);
      } else S.answer = { md, summary: speechText(md, 'summary') || clip(full, 400), full };
      S.showFull = false;
    }
    if (S.listen && capSub.textContent === 'Finishing the details on screen…') setSub('');
    const holder = S.run && S.run.held ? S.run : null;
    if (!holder) {
      renderControls();
      return;
    }
    // The app lets go of the finished run only after run.done settles: ask after that.
    Promise.resolve(R.run && R.run.done)
      .catch(() => null)
      .then(() =>
        setTimeout(() => {
          if (S.closed || S.run !== holder) return;
          S.run = null;
          send(holder.held, holder.opts);
        }, 0),
      );
  }

  // -------------------------------------------------------------- holograms and blueprints (v6)

  /** True while a hologram or blueprint viewer covers Voice Mode. */
  function viewerOpen() {
    try {
      return !!(visuals && typeof visuals.isOpen === 'function' && visuals.isOpen());
    } catch {
      return false;
    }
  }

  /** A streaming reply of Voice Mode's whose hologram is still building in the open viewer. */
  function buildingVisual(R) {
    if (!R || !R.run || R.pending || !R.visuals || !viewerOpen()) return false;
    const segs = R.run.turn && Array.isArray(R.run.turn.segments) ? R.run.turn.segments : [];
    return segs.some((s) => s && s.kind === 'hologram' && s.status === 'building' && R.visuals.has(s.id));
  }

  /**
   * Screens (v7): "put it on my other screen", "float it", "bring it back" act at once (no turn),
   * then Jarvis says a short line ("It's on screen 2.", or "Tap Open on screen 2, and it'll
   * appear." when the browser needs a tap first). True when the words were a screen command.
   */
  function screenCommand(text) {
    if (!screens || typeof screens.command !== 'function') return false;
    let res = null;
    try {
      res = screens.command(text);
    } catch (err) {
      console.warn('[voice] the screen command failed', err);
      res = null;
    }
    if (!res || !res.handled) return false;
    showCaption('quote', `“${text}”`);
    const marker = { pending: true, viewer: true, screens: true };
    S.run = marker;
    setVoiceState('thinking');
    setStatus('One moment…', 'sparkle');
    Promise.resolve(res.done).then(
      (out) => {
        if (S.closed || S.run !== marker) return;
        S.run = null;
        speakAck(out && typeof out.ack === 'string' ? out.ack : '');
      },
      () => {
        if (S.closed || S.run !== marker) return;
        S.run = null;
        speakAck('I couldn’t open that screen.');
      },
    );
    return true;
  }

  /**
   * What the owner said: a screen command, a local command while a viewer covers Voice Mode,
   * otherwise a turn.
   */
  function heard(text) {
    // "Shall I draw a blueprint of …?" was asked: yes draws it, no drops it; anything else drops the
    // question and is taken as usual.
    const asked = S.confirm;
    S.confirm = null;
    if (asked && Date.now() - asked.at < CONFIRM_MS) {
      const reply = confirmReply(text);
      if (reply === 'yes') return confirmBlueprint(text, asked);
      if (reply === 'no') {
        showCaption('quote', `“${text}”`);
        speakAck('Okay, no blueprint.');
        return;
      }
    }
    // Said while a hologram of the reply builds (the owner tapped the viewer's mic): see below.
    if (S.run && S.run.run) {
      heardDuringBuild(text, S.run);
      return;
    }
    // Screens (v7): acts at once (no turn). While a reply streams it waits with the other words
    // (above) and is taken here once the reply has been said.
    if (screenCommand(text)) return;
    // A 2D request heard here is cancelled by Stop while its library lookup is still running.
    // With no viewer open, the app may open the hologram shown last for a command about it.
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let res = null;
    if (visuals && typeof visuals.command === 'function') {
      try {
        res = visuals.command(text, { signal: ctl ? ctl.signal : null, spoken: true });
      } catch (err) {
        console.warn('[voice] the viewer could not take that command', err);
        res = null;
      }
    }
    if (res && res.handled) viewerCommand(text, res, ctl);
    else send(text);
  }

  /**
   * Words heard while a hologram of the streaming reply builds: a viewer command acts on the live
   * model at once (its toast says so; speaking now would cut the reply's own speech). A question,
   * or a 2D request (it needs the finished hologram), waits until the reply has been said.
   */
  function heardDuringBuild(text, R) {
    let res = null;
    if (viewerOpen() && typeof visuals.command === 'function') {
      try {
        res = visuals.command(text, { spoken: false, later: true });
      } catch (err) {
        console.warn('[voice] the viewer could not take that command', err);
        res = null;
      }
    }
    if (!(res && res.handled && !res.done)) {
      R.heldWords = text;
      try {
        if (typeof visuals.note === 'function') visuals.note('I’ll take that once the hologram is built.');
      } catch {
        /* decoration */
      }
    }
    showCaption('quote', `“${text}”`);
    resumeRun(R);
  }

  /** Back to the reply after a listen while it streams: its state, status and speech carry on. */
  function resumeRun(R) {
    if (S.closed || S.run !== R) return;
    renderRunNow();
    renderControls();
    if (R.feed) scheduleFeed(R);
  }

  /**
   * A listen started while a hologram built is over (`text` heard, or nothing): act on the words,
   * then go back to the reply. When the reply ended meanwhile, it is delivered now and the words
   * are taken once it has been said.
   */
  function afterBuildListen(text) {
    const R = S.run;
    const ended = R && R.endedTurn;
    if (ended) {
      R.endedTurn = null;
      if (text) S.heldWords = text;
      finishRun(R, ended);
      return;
    }
    if (text) heard(text);
    else if (R && R.run) resumeRun(R);
    else goIdle('ready');
  }

  /** The viewer's mic: listens for a command while a hologram of this reply builds, else the core's tap. */
  function onViewerMic() {
    if (S.closed) return;
    if (!S.listen && S.sttOk && buildingVisual(S.run)) {
      haptic('light');
      unlockSpeech();
      clearRetry();
      startListening({ gesture: true, duringBuild: true });
      return;
    }
    onCoreTap();
  }

  /** "Stop building" in the viewer: stop the turn as Stop does (v5). False when none is running here. */
  function stopFromViewer() {
    if (S.closed) return false;
    if (S.listen && S.listen.duringBuild) stopListening();
    if (S.run && S.run.run) {
      abortRun();
      return true;
    }
    return false;
  }

  /** Words held while a hologram built: taken once the reply has been said (true when they were). */
  function takeHeld() {
    const words = S.heldWords;
    if (!words || S.closed || S.run || S.listen) return false;
    S.heldWords = '';
    heard(words);
    return true;
  }

  /**
   * A viewer command heard while a viewer covers Voice Mode has acted (free: no turn). Jarvis says a
   * short acknowledgement, then listens again (Continuous). "blueprint the <part>" waits for its
   * outcome: a saved sheet opened (said so), the paid build started as a Voice Mode turn (the app
   * hands it to ask(), which takes over), a question first (a softer wording: "Shall I draw …?"),
   * or it can't be done (said why). `ctl` aborts the lookup when the owner says Stop meanwhile.
   */
  function viewerCommand(text, res, ctl = null) {
    const cmd = res.command && typeof res.command === 'object' ? res.command : {};
    showCaption('quote', `“${text}”`);
    if (res.done && typeof res.done.then === 'function') {
      waitForBlueprint(res.done, cmd, ctl);
      return;
    }
    speakAck(commandAck(cmd));
  }

  /** "Getting the blueprint…" until `done` says what happened (Stop aborts `ctl`: nothing starts). */
  function waitForBlueprint(done, cmd, ctl) {
    const marker = { pending: true, viewer: true, ctl };
    S.run = marker;
    setVoiceState('thinking');
    setStatus(cmd.action === 'blueprint' ? 'Getting the blueprint…' : 'One moment…', cmd.action === 'blueprint' ? 'blueprint' : 'sparkle');
    Promise.resolve(done).then(
      (out) => viewerOutcome(marker, cmd, out),
      (err) => viewerOutcome(marker, cmd, { error: errorText(err) || 'That didn’t work.' }),
    );
    return marker;
  }

  /** "Yes" to "Shall I draw a blueprint of …?": build it now (a Voice Mode turn, through ask()). */
  function confirmBlueprint(text, asked) {
    showCaption('quote', `“${text}”`);
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const marker = waitForBlueprint(new Promise((resolve) => setTimeout(() => resolve(proceed()), 0)), asked.cmd, ctl);
    function proceed() {
      if (S.run !== marker || S.closed) return { error: 'Stopped.', stopped: true };
      try {
        return asked.proceed({ signal: ctl ? ctl.signal : null });
      } catch (err) {
        return { error: errorText(err) || 'That didn’t work.' };
      }
    }
  }

  function viewerOutcome(marker, cmd, out) {
    if (S.closed || S.run !== marker) return; // a turn started through ask(), or the owner stopped it
    S.run = null;
    const o = out && typeof out === 'object' ? out : {};
    if (o.stopped) {
      goIdle('stopped');
      return;
    }
    if (o.confirm && typeof o.confirm.proceed === 'function') {
      // Nothing saved and the words were not an outright request: ask before spending money.
      S.confirm = { proceed: o.confirm.proceed, cmd, at: Date.now() };
      speakAck(blueprintQuestion(o.confirm));
      return;
    }
    if (o.error) speakAck(asSentence(clip(singleLine(o.error), 220)));
    else speakAck(o.opened ? savedBlueprintAck(cmd) : '');
  }

  /** Say a short line (shown in the captions too), then listen again when Continuous is on. */
  function speakAck(text) {
    if (S.closed) return;
    const line = String(text || '').trim();
    if (line && S.ttsOk) {
      speak(line, 'ack');
      return;
    }
    if (line) {
      renderSpoken(line, 'answer');
      finishKaraoke();
    }
    afterSpeech();
  }

  /**
   * ask(): words typed in a viewer over Voice Mode, or its 2D request, sent as a Voice Mode turn.
   * A 2D request the owner stopped while it looked in the library (its signal aborted) never starts.
   */
  function askFromViewer(text, options) {
    if (S.closed) return { error: 'Voice Mode is closed.' };
    const o = options && typeof options === 'object' ? options : {};
    if (o.signal && o.signal.aborted) return { error: 'Stopped.', stopped: true };
    if (S.run && S.run.viewer) S.run = null; // "blueprint the …" was waiting for this turn
    return send(text, { mode: o.mode, blueprintFor: o.blueprintFor || null });
  }

  /**
   * Something a Voice Mode reply shows: a hologram opens over Voice Mode as soon as it starts
   * building (the live build is visible), a blueprint once it is drawn. Once per segment; a reply
   * started in the chat (not a Voice Mode turn) stays in the chat.
   */
  function showVisual(R, seg) {
    if (!visuals || typeof visuals.open !== 'function' || !seg || typeof seg.id !== 'string') return;
    if (!(R.owned || (R.run.turn && R.run.turn.spoken === true))) return;
    const ready = seg.kind === 'hologram' ? seg.status !== 'error' : seg.kind === 'blueprint' && seg.status === 'done';
    if (!ready || R.visuals.has(seg.id)) return;
    R.visuals.add(seg.id);
    try {
      visuals.open(R.run, seg);
    } catch (err) {
      console.warn('[voice] could not show it', err);
    }
    updateLevelLoop(); // the viewer covers Voice Mode now
    syncVisuals(); // its mic listens while this hologram builds
  }

  /**
   * A viewer over Voice Mode shows on its mic button whether Jarvis listens (and what is heard);
   * canListen: a hologram of this reply is building, so a tap listens for a command (Stop is the
   * viewer's own button then).
   */
  function syncVisuals() {
    if (!visuals || typeof visuals.sync !== 'function' || S.closed) return;
    const canListen = !S.listen && S.sttOk && buildingVisual(S.run);
    S.canListen = canListen;
    try {
      visuals.sync({
        state: S.state,
        label: coreBtn.getAttribute('aria-label') || '',
        listening: !!S.listen,
        heard: S.listen ? S.listen.text || '' : '',
        busy: !!S.run || !!S.speech,
        canListen,
      });
    } catch {
      /* decoration */
    }
  }

  // ------------------------------------------------------------------- speaking while it streams

  function scheduleFeed(R) {
    if (R.feedTimer || !R.feed) return;
    if (S.listen) return; // the microphone is open (a command while it builds): nothing new is said
    R.feedTimer = setTimeout(() => {
      R.feedTimer = 0;
      if (S.run === R && !S.closed) feedLive(R, false);
    }, FEED_DELAY_MS);
  }

  /** Speak the reply's newly complete sentences (done: the turn is over, speak the rest). */
  function feedLive(R, done) {
    if (!R.feed || S.closed) return null;
    let step;
    try {
      step = R.feed.update({ segments: R.run.turn && R.run.turn.segments, done });
    } catch (err) {
      console.warn('[voice] could not follow the reply', err);
      return null;
    }
    if (R.liveOff || (!step.pieces.length && !step.finish)) return step;
    let sp = liveOf(R);
    if (!sp) {
      if (!step.pieces.length || R.liveDone) return step;
      sp = startLive(R);
      if (!sp) return step;
    }
    // From here on the pieces are the answer itself (not the "Let me check…" said before a search).
    if (R.answerFrom < 0 && step.pieces.length && answerBegun(R.run.turn)) R.answerFrom = sp.display.length;
    for (const piece of step.pieces) appendLive(sp, piece);
    if (step.finish && !sp.finished) {
      sp.finished = true;
      try {
        sp.stream.finish();
      } catch (err) {
        console.warn('[voice] speech failed', err);
      }
      renderControls(); // the spoken part is complete: a tap now stops only the voice
    }
    return step;
  }

  function liveOf(R) {
    const sp = S.speech;
    return sp && sp.kind === 'live' && sp.run === R ? sp : null;
  }

  /** The voice is audible (or about to be): a chunk started and the stream isn't waiting for text. */
  function isTalking(sp) {
    return !!sp && sp.started && !sp.idle;
  }

  /** Sentences are with the voice and not all said yet (it may be talking without having said so). */
  function voiceStarting(sp) {
    return !!sp && !sp.idle && !!sp.display;
  }

  function startLive(R) {
    cancelSpeech();
    const s = getS();
    const sp = newSpeech('live', R);
    S.speech = sp;
    root.dataset.speech = 'live';
    sp.karaoke = startLiveCaptions();
    try {
      sp.stream =
        tts.createSpeechStream({
          voiceURI: typeof s.voiceURI === 'string' ? s.voiceURI : '',
          rate: speechRate(),
          onStart: () => onSpeechStart(sp),
          onChunk: (c) => onSpeechChunk(sp, c),
          onBoundary: (b) => onSpeechBoundary(sp, b),
          onIdle: () => onLiveIdle(sp),
          onEnd: (info) => onSpeechEnd(sp, info),
        }) || null;
    } catch (err) {
      console.warn('[voice] speech failed', err);
      sp.stream = null;
    }
    if (!sp.stream || typeof sp.stream.append !== 'function') {
      if (S.speech === sp) S.speech = null;
      delete root.dataset.speech;
      R.liveOff = true;
      return null;
    }
    startEstimator(sp);
    renderControls();
    return sp;
  }

  function appendLive(sp, piece) {
    if (!piece || sp.token !== S.speechToken) return;
    const start = sp.display.length;
    sp.display += piece;
    addLiveCaption(sp.karaoke, start, piece);
    if (S.karaoke === sp.karaoke) setCaptionLength(captionLength(sp.display));
    const form = spokenForm(sp.display);
    sp.text = form.spoken;
    sp.map = form.map;
    try {
      sp.stream.append(piece);
    } catch (err) {
      console.warn('[voice] speech failed', err);
    }
  }

  /** Everything written so far is spoken and the reply is still being written (or working). */
  function onLiveIdle(sp) {
    if (sp.token !== S.speechToken) return;
    sp.idle = true;
    sp.chunk = null;
    if (S.karaoke === sp.karaoke) finishKaraoke();
    if (S.run && S.run === sp.run) renderRunNow();
    else renderControls();
  }

  function deliverAnswer(turn, R) {
    syncCoreAgents(null); // the mission is over: the core turns to the voice
    const md = finalAnswerMarkdown(turn);
    const full = fullDisplayText(md);
    if (R && R.feed) {
      const live = liveOf(R);
      if (live || R.liveDone || R.liveOff) {
        // Spoken (or being spoken) while it streamed: say the rest; no chime over the voice.
        if (live) feedLive(R, true);
        S.answer = answerFromFeed(R, md, full);
        S.showFull = false;
        announce('Answer ready');
        if (live && S.speech === live) {
          renderControls();
          return; // the stream's end carries on (listen again, or wait)
        }
        if (R.liveDone && !R.liveOff) {
          afterSpeech();
          return;
        }
        // The voice stopped (someone else's speech, or the voice isn't working): show the whole
        // spoken part to read instead, and wait for a tap.
        try {
          R.feed.update({ segments: turn && turn.segments, done: true });
        } catch {
          /* show what was said */
        }
        S.answer = answerFromFeed(R, md, full);
        renderSpoken(S.answer.summary, 'answer');
        finishKaraoke();
        goIdle('answered');
        takeHeld();
        return;
      }
      // Nothing was spoken yet (a one-sentence reply, or a fast one): the spoken part, after the chime.
      let step = null;
      try {
        step = R.feed.update({ segments: turn && turn.segments, done: true });
      } catch (err) {
        console.warn('[voice] could not read the reply', err);
      }
      if (step && step.pieces.length && S.ttsOk) {
        S.answer = answerFromFeed(R, md, full);
        S.showFull = false;
        play('reply-done');
        haptic('success');
        announce('Answer ready');
        speak(S.answer.summary, 'summary', sounds ? REPLY_CHIME_MS : 0);
        return;
      }
    }
    // Nothing to speak from the stream (only a mission card, empty text, or a reply started in the
    // chat): the answer's summary paragraph, after the chime.
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
      takeHeld();
    }
  }

  /** S.answer for a reply spoken from its stream: what was said, and the whole answer. */
  function answerFromFeed(R, md, full) {
    const st = R.feed.state();
    const summary = st.spoken.trim() || clip(full, 400) || `Done, ${ownerName()}. The details are in the chat.`;
    return { md, summary, full: full || summary, more: !!full && (st.cut || st.capped || full.length > summary.length + 24) };
  }

  function deliverError(turn) {
    const err = turnError(turn);
    const name = ownerName();
    if (err && err.kind === 'refusal') {
      fail('Can’t help with that', `I’m afraid I can’t help with that one, ${name}.`);
      return;
    }
    const message = asSentence(clip(singleLine((err && err.message) || 'Something went wrong on my end.'), 220));
    fail('Something went wrong', `My apologies, ${name}. ${message}`);
  }

  function deliverInterrupted() {
    const text = `The connection dropped before I could finish, ${ownerName()}. Our progress is saved — resume it from the chat once you’re back online.`;
    fail('Connection lost', text, isOnline() ? 'error' : 'offline', 'wifi-off');
  }

  function sendFailed(err) {
    fail('Couldn’t send', `My apologies, ${ownerName()}. ${asSentence(clip(singleLine(errorText(err) || 'I couldn’t start that request.'), 220))}`);
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

  function newSpeech(kind, run = null) {
    return {
      token: ++S.speechToken,
      kind, // 'live' (the reply as it streams) | 'summary' | 'full' | 'apology' | 'ack' (a viewer command acted)
      run, // live: the run it belongs to
      display: '', // the caption text (live: everything appended so far)
      text: '', // display with whitespace collapsed, as the engine counts offsets
      map: [], // text index -> display index
      stream: null, // live: tts.createSpeechStream()
      handle: null, // others: tts.speak()
      karaoke: null,
      timers: [],
      started: false, // audio has started (onStart, a chunk or a word event)
      boundary: false, // this voice sends word events
      idle: false, // live: everything appended so far is spoken; waiting for more text
      finished: false, // live: stream.finish() was called
      chunk: null, // { start, end, at }: the chunk playing now (offsets in text)
    };
  }

  /**
   * Speak `display` in one go (shown as captions, may contain paragraph breaks). The engine gets
   * the same text, so its offsets (whitespace collapsed) map back to the display with spokenForm().
   */
  function speak(display, kind, delay = 0) {
    cancelSpeech();
    const sp = newSpeech(kind);
    const form = spokenForm(display);
    sp.display = String(display ?? '');
    sp.text = form.spoken;
    sp.map = form.map;
    S.speech = sp;
    root.dataset.speech = kind;
    if (kind === 'summary' || kind === 'full' || kind === 'ack') {
      setVoiceState('speaking');
      setStatus(kind === 'full' ? 'Reading the full answer' : 'Speaking', 'speaker');
      announce(kind === 'ack' ? sp.display : 'Jarvis is speaking');
    }
    renderSpoken(sp.display, kind === 'apology' ? 'error' : 'answer');
    sp.karaoke = S.karaoke;
    setKaraoke(0);
    renderControls();

    const begin = () => {
      if (sp.token !== S.speechToken || S.closed) return;
      const s = getS();
      try {
        sp.handle =
          tts.speak(sp.display, {
            voiceURI: typeof s.voiceURI === 'string' ? s.voiceURI : '',
            rate: speechRate(),
            onStart: () => onSpeechStart(sp),
            onChunk: (c) => onSpeechChunk(sp, c),
            onBoundary: (b) => onSpeechBoundary(sp, b),
            onEnd: (info) => onSpeechEnd(sp, info),
          }) || null;
      } catch (err) {
        console.warn('[voice] speech failed', err);
        speechFinished(sp, 'failed');
        return;
      }
      startEstimator(sp);
    };
    if (delay > 0) sp.timers.push(setTimeout(begin, delay));
    else begin();
  }

  function onSpeechStart(sp) {
    if (sp.token !== S.speechToken || sp.started) return;
    sp.started = true;
    if (sp.kind === 'live') announce('Jarvis is speaking');
  }

  /** A chunk starts playing: highlight it, and show that Jarvis is speaking. */
  function onSpeechChunk(sp, c) {
    if (sp.token !== S.speechToken || !c) return;
    const start = Number(c.start);
    const end = Number(c.end);
    if (!Number.isFinite(start) || start < 0) return;
    // `at`: when it started, which the engine may only learn later (a voice without start events).
    const at = Number(c.at) <= Date.now() && Number(c.at) > Date.now() - 60000 ? Number(c.at) : Date.now();
    sp.chunk = { start, end: Number.isFinite(end) && end > start ? end : start + 1, at };
    sp.idle = false;
    if (!sp.started) onSpeechStart(sp);
    if (S.karaoke === sp.karaoke) setKaraokeChar(displayIndex(sp, start));
    if (sp.kind !== 'live') return;
    if (sp.run && sp.run.answerFrom >= 0 && displayIndex(sp, Math.max(start, sp.chunk.end - 1)) >= sp.run.answerFrom) sp.run.answerHeard = true;
    if (S.run && S.run === sp.run) renderRunNow();
    else if (S.state !== 'speaking') {
      setVoiceState('speaking');
      setStatus('Speaking', 'speaker');
    }
  }

  /**
   * The stream (or speak()) ended, exactly once: 'done' | 'empty' (finished), 'cancelled' |
   * 'interrupted' (someone else stopped it; our own cancels never get here, the token changed),
   * 'error' | 'unsupported' (speech isn't working).
   */
  function onSpeechEnd(sp, info) {
    if (sp.token !== S.speechToken) return;
    const reason = info && info.reason;
    if (reason === 'done' || reason === 'empty') speechFinished(sp, 'done');
    else if (reason === 'cancelled' || reason === 'interrupted') speechFinished(sp, 'interrupted');
    else speechFinished(sp, 'failed');
  }

  function onSpeechBoundary(sp, event) {
    if (sp.token !== S.speechToken || !event) return;
    if (event.name && event.name !== 'word' && event.name !== 'sentence') return;
    const ci = Number(event.charIndex);
    if (!Number.isFinite(ci) || ci < 0) return;
    if (!sp.started) onSpeechStart(sp);
    sp.idle = false;
    sp.boundary = true;
    if (S.karaoke === sp.karaoke) {
      const len = event.name === 'sentence' ? 0 : Number(event.charLength);
      setKaraokeWord(displayIndex(sp, ci), Number.isFinite(len) && len > 0 ? len : 0);
    }
    // The core's bump follows the spoken word's length (real speech data, never chance: SPEC 2.4.1).
    const wordLen = Number(event.charLength);
    bumpLevel(0.55 + Math.min(0.35, (Number.isFinite(wordLen) && wordLen > 0 ? wordLen : 4) * 0.045));
  }

  function displayIndex(sp, spokenIndex) {
    if (!sp.map.length) return spokenIndex;
    return sp.map[Math.max(0, Math.min(sp.map.length - 1, spokenIndex))];
  }

  /**
   * Voices without word events: move the highlight through the chunk that is playing by elapsed
   * time (restarting at every chunk, so it never drifts far). Time while the page is hidden
   * doesn't count (iOS pauses speech in the background).
   */
  function startEstimator(sp) {
    let hiddenAt = 0;
    const timer = setInterval(() => {
      if (sp.token !== S.speechToken) {
        clearInterval(timer);
        return;
      }
      const c = sp.chunk;
      if (document.hidden) {
        if (!hiddenAt) hiddenAt = Date.now();
        return;
      }
      if (hiddenAt) {
        if (c) c.at += Date.now() - hiddenAt;
        hiddenAt = 0;
      }
      if (sp.boundary || sp.idle || !c || S.karaoke !== sp.karaoke) return;
      const ci = c.start + Math.floor(((Date.now() - c.at) / 1000) * CHARS_PER_SEC * speechRate());
      setKaraokeChar(displayIndex(sp, Math.min(ci, c.end - 1)));
    }, 250);
    sp.timers.push(timer);
  }

  /** The speech `sp` is over: 'done' (spoken to the end), 'interrupted' or 'failed'. */
  function speechFinished(sp, how) {
    if (sp.token !== S.speechToken) return;
    S.speechToken += 1;
    S.speech = null;
    clearTimers(sp.timers);
    delete root.dataset.speech;
    if (S.closed) return;
    if (S.karaoke === sp.karaoke) finishKaraoke();
    if (sp.kind === 'live' && S.run && S.run === sp.run) {
      // The spoken part is over (or speech stopped) while the reply is still being written:
      // nothing more is spoken for it; the end of the turn decides what comes next.
      if (how === 'done') sp.run.liveDone = true;
      else sp.run.liveOff = true;
      renderRunNow();
      renderControls();
      return;
    }
    if (sp.kind === 'apology') {
      afterApology();
      return;
    }
    if (how === 'done') afterSpeech();
    else {
      goIdle('answered'); // interrupted, or speech isn't working: no microphone over it
      takeHeld();
    }
  }

  /** After a reply was spoken to the end: listen again (continuous) or wait for a tap. */
  function afterSpeech() {
    if (S.closed) return;
    finishKaraoke();
    // A viewer over Voice Mode captions what was just said: it can make room for the model now.
    try {
      if (visuals && typeof visuals.spoken === 'function') visuals.spoken();
    } catch {
      /* decoration */
    }
    if (takeHeld()) return; // what the owner said while the hologram built comes first
    if (S.continuous && S.sttOk && !S.typing && !S.sttBlocked && !document.hidden) {
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
    delete root.dataset.speech;
    if (sp.kind === 'live' && sp.run) sp.run.liveOff = true;
    const handle = sp.stream || sp.handle;
    try {
      // The engine cancels itself; an extra stopSpeaking() would only delay the next speech.
      if (handle && typeof handle.cancel === 'function') handle.cancel();
      else if (tts && typeof tts.stopSpeaking === 'function') tts.stopSpeaking();
    } catch {
      /* ignore */
    }
  }

  /** Markdown -> the text to read aloud (written for the ear). */
  function speechMarkdown(md) {
    if (typeof markdownToPlainText === 'function') return String(markdownToPlainText(md, { speech: true }) || '');
    if (tts && typeof tts.toSpeech === 'function') return String(tts.toSpeech(md, 'full') || '');
    return String(md || '');
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
    // Not while a hologram or blueprint viewer covers Voice Mode (inert): nobody sees the core then.
    const want = !reducedMotion && !document.hidden && !S.closed && !root.inert && (S.state === 'listening' || S.state === 'speaking');
    root.dataset.levelLoop = want ? 'on' : 'off'; // test hook: the core's level animation runs
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
    if (S.state === 'speaking' && S.speech && S.speech.started && !S.speech.boundary && !S.speech.idle) {
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
    // Jarvis had begun saying this answer (or all of its spoken part): when it finishes in the
    // chat, the chat doesn't read it aloud again.
    for (const R of [S.run, S.bg]) if (R && R.run && (R.liveDone || R.answerHeard || R === S.bg)) voicedRuns.add(R.run);
    cancelSpeech();
    if (S.bg) {
      const B = S.bg;
      S.bg = null;
      detachRun(B);
    }
    if (S.run) {
      // Leaving only stops listening and speaking: a running reply or mission carries on in the
      // chat (the app keeps the screen awake for it and shows Stop), so paid work is never lost
      // just to look at Mission Control. STOP, or a tap on the core, stops it.
      const R = S.run;
      S.run = null;
      if (R.offs) detachRun(R);
    }
    cancelRunRender();
    if (levelFrame) cancelAnimationFrame(levelFrame);
    levelFrame = 0;
    if (inertObserver) callQuietly(() => inertObserver.disconnect());
    S.confirm = null;
    S.heldWords = '';
    if (micBands) callQuietly(() => micBands.destroy());
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

/** Make sure a message ends like a sentence before another sentence follows it. */
function asSentence(s) {
  const t = String(s ?? '').trim();
  return !t || /[.!?…]["'”’)\]]*$/.test(t) ? t : `${t}.`;
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
