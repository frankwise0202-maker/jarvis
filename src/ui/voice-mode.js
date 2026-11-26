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
// Listening (v7.2): Jarvis, not the browser, decides when the owner has finished (stt.js: a silence
// window from Settings → Voice → Wait after I stop talking, longer after "…and", never past 60 s).
// Then, with "Show what I said for 2 seconds, then send" (the default), what was heard is shown big
// with a 2-second countdown ring and "Send now" before it is sent: tap the words to fix them (the
// countdown stops and a field opens), or say "cancel" / "never mind" (nothing is sent), "no, I said
// …" (the words are corrected and the countdown starts again; when Jarvis can only guess where the
// fix goes, the guess is shown and waits for "yes", Send or a tap), "wait", or simply go on talking
// (the words are added). The microphone keeps listening during those 2 seconds (the same recognizer).
// Local commands (Screens, Apple Music, the hologram viewer, Optics) act at once without the check,
// and the recognizer's alternatives are tried for them too (another reading for Apple Music only
// when the best one is nothing else: not a command, not about a part of the hologram on screen).
//
// Tap the core: listening = stop and send (at once, no check); the 2-second check = send now;
// thinking/working = stop the turn; speaking = stop
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
//   look                  Optics, the camera (app.js): { supported() -> boolean, open() } adds a
//                           Look button to the dock. open() shows Optics over Voice Mode; while it
//                           is open, `visuals` routes what is heard to it first ("what am I looking
//                           at?" is a Look, spoken like any reply), and its mic button is the core.
//                           ask(text, { …, attachments, optics }) sends a Look as a Voice Mode turn
//                           with its frame (the Optics frame record goes to startTurn).
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
//                           note(text, { heard })  a caption in the viewer ("I'll take that once …";
//                                               heard: what was heard, during the 2-second check)
//                           vocabulary()        { parts }: the open (or last shown) hologram's part
//                                               names, listened for and preferred among the readings
//                           spoken()            a reply or acknowledgement has been said (the
//                                               viewer's caption of it can leave)
//   screens               Screens (v7, app.js): command(text) -> null (not a screen command) or
//                           { handled: true, done: Promise<{ ack }> }. Checked first for every
//                           thing heard ("put it on my other screen", "float it", "bring it back"):
//                           it acts at once (free: no turn) and Jarvis says the short ack.
//   music                 Apple Music (app.js): command(text) -> null (not a music command) or
//                           { handled: true, done: Promise<{ ack, segment? }> }: "play Back in Black"
//                           searches (free: no turn), shows the Music card here and Jarvis says one
//                           short line. card(segment) -> { el, update, destroy, current } (a Music
//                           card, also for each of a reply's find_music results: they stack, a new
//                           question clears them); onListen() before the mic opens and onSpeak()
//                           when Jarvis starts speaking (a playing preview pauses: previews never
//                           play while Jarvis listens, during the 2-second check (the cards step
//                           aside for it; api.isListening() is true) or over his voice). Music
//                           commands act at once, without the check. After a card is shown
//                           Jarvis waits for a tap instead of listening again, so the owner can tap
//                           Preview (or Open in Apple Music: the hint says which).
//   homeBase              Home base (v7.5, SPEC §23): command(text) -> null (not "how's the home base",
//                           "home base status" …) or { handled: true, done: Promise<{ ack }> }: the
//                           Jarvis Core's own assistant answers (free: no turn) and Jarvis says it. Heard
//                           or typed here; acts at once, without the 2-second check. v7.6 (SPEC §24):
//                           also "brief me", "research … in the background", "what did the home base
//                           find?", "watch for …" (the home base's brain; said, no turn).
//   standby               Standby (v7.4, SPEC §22): an object (present = available). "Jarvis, standby",
//                           "go to sleep" or "go back to sleep" (heard or typed, the whole sentence) gets
//                           a short reply, then Voice Mode closes with onClose({ reason: 'standby' }) and
//                           the app opens Standby, free.
//   wake                  the wake routine (v7.4, SPEC §22), when Voice Mode is opened by two claps or
//                           "Hey Jarvis" in Standby: { trigger: 'clap'|'word', name() -> the greeting
//                           name, offer() -> Promise<{ artist, segment, playText, found } | null> (the
//                           Music card offered: Apple Music, free; `found` is shown again on "yes",
//                           without a second search), briefing() -> { text, mode, part } | { done:
//                           Promise<{ ack }> } (v7.6: the home base's briefing, said; free) | null,
//                           returnToStandby() -> boolean (Settings), canSleep() -> boolean (no preview
//                           playing), onAwake({ line, hidden }), pending() -> [lines] (v8.1, lead decision
//                           D3: what waited for the owner, said before the greeting, Chrome's question
//                           first: src/lib/wake/pending.js) }. The core boots with the wake sound
//                           while the microphone listens a moment for "wake up", "daddy's home", "I'm
//                           home" ("Welcome home, Frank."); otherwise the greeting follows the time of
//                           day ("Good evening, Frank."). Woken by "Hey Jarvis", a question said right
//                           away is asked; woken by claps, other words then are not sent anywhere (the
//                           claps may have been something else, the words the room's talk): he greets.
//                           Then one line offers music and the briefing and Jarvis listens (the v7.2
//                           rules): "yes" / "play it" shows the Music card (a tap plays it), "brief me"
//                           runs the briefing, "no" / "go back to sleep" returns to Standby; anything
//                           else is an ordinary question. The routine itself never asks Claude
//                           anything. After the conversation (silence, Exit) Voice Mode goes back to
//                           Standby when returnToStandby() says so.
//   router                v8.1 (contract (b)): the app's command router for what is heard here:
//                           { route(readings, local, { after }) -> hit | null, run(hit, ctx) }. route()
//                           merges `local` (what Voice Mode knows: its questions, its prompt, whether
//                           it speaks …) into the app's state; heard() carries out what it picks
//                           (act()). Without one, only Voice Mode's own words are local.
//   holdCapMs             v8.1 (tests: 'jarvis.dev.voice'): a shorter cap for hold() than its 2 minutes
//   hiddenCount           MAC-R2-3: { get() -> { asked, braked }, set({ asked, braked }) }: the hidden count (A6) kept
//                           by the app across sessions. Woken by claps in the background, a session goes on from it
//                           (after the brake it starts braked: only the routine's free answers); "Hey Jarvis", a tap or
//                           key, or Jarvis on screen start it again. Without it: each session from 0, as before.
//   onActive(on, { now }) MAC-R2-1: true while Voice Mode can hear the owner or is answering (a listen, the 2-second
//                           check, a turn, speech), false when it sits idle; at close, false with { now: true }. The
//                           app's voice lock follows it (a Standby in another window stays asleep only meanwhile).
//   listenWhileHidden     v8.1 (Track 1 fills it): () -> boolean, Voice Mode goes on listening while
//                           Jarvis is hidden (a Mac). Default () => false: away() is document.hidden.
//                           v8.1 hands-free (SPEC §28.1): with it, such a session also restarts its
//                           recognizer there (stt.js background), plays its listen and error chimes there,
//                           shows its state in the tab title ("Listening · Jarvis") and one notification
//                           ("Jarvis is listening. Ask away, or say “go back to sleep”."), closed at the end.
//                           After an answer, a woken session and every session while hidden listen once for
//                           a follow-up (8 s), and while hidden at most 3 questions in a row are taken
//                           without the wake words, a tap or a key (src/lib/hands-free.js followUp).
// The returned api also has ask(text, { mode, blueprintFor, signal }) -> { run } | { held } |
// { error } (words typed in a viewer over Voice Mode, or a 2D request: sent as a Voice Mode turn;
// one whose signal was aborted by Stop never starts), tap() (the core's tap), viewerTap() (the
// viewer's mic button: the core's tap, except that while a hologram of the reply builds it listens
// for a command), stop() (the viewer's "Stop building"), note(text) (a line under the caption) and
// say(line) (v8.0: a line Jarvis says by himself, Optics' live view; see sayLine()).
// v8.1 seams (contract (a)): question(spec) (an owner question on the stack), prompt(spec) (the
// standing channel, Jarvis for Chrome), narrate(spec) (a tour's words, with its chunk events),
// hold(reason) / release(reason) (a woken session stays out of Standby, at most 2 minutes after the
// owner's last words). See each below.
// v8.1 hands-free: bargeIn(trigger) (A8, SPEC §28.4): Standby heard two claps ('clap') or "Hey Jarvis" ('word')
// while its microphone stayed on through the session (app.js decides when it may: a Mac in setup 1 or 3 whose
// hands-free Test passed). It acts only while George speaks, never on his own "Jarvis" (the self-mask), and then
// is the core's tap while he speaks: he stops and listens. True when it acted.
//
// All text reaches the page through dom.js helpers (textContent). Never innerHTML.

import { h, clear, setText, on } from './dom.js';
import { icon } from './icons.js';
import { createSpokenFeed, splitSentences } from './voice-stream.js';
import { commandAck, savedBlueprintAck, blueprintQuestion, confirmReply, partHint, nothingBackAck } from './voice-visuals.js';
import { act as appAction, appCommandLine } from '../lib/app-commands.js';
import { REVIEW_MS, reviewReply, planCorrection, pickHeard, namesPart, listenPhrases } from './voice-heard.js';
import { openingIntent, routineReply, answerParts, greetingLine, suggestionLine, partOfDayFor } from '../lib/wake/phrases.js';
import { createVoiceTag } from './voice-tag.js';
import { createQuestionStack, createPromptChannel, boundAction } from '../lib/voice-questions.js';
import { createVoiceHold, HOLD_CAP_MS } from '../lib/voice-hold.js';
import { ANSWER_WINDOW_MS, WITHDRAWN_LINE, againLine, chooseAnswer, isNoWord, matchChromeAnswer } from '../lib/chrome-prompt-words.js';
import { TASK_CHECK_HIDDEN_MS, TASK_CHECK_MS } from '../lib/chrome-task-words.js';
import { createRouter, registerTodayCommands, emptyState } from '../lib/command-router.js';
import { followUp, createSelfMask, HANDS_FREE, startsWithWakeWords } from '../lib/hands-free.js';
import { sessionTitle, notify, closeNotify } from './attention.js';

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
const REVIEW_MIC_MS = 30000; // a paused 2-second check keeps listening for a correction this long
const PROMPT_VOICE_MS = 30000; // MAC-R5-1: a Chrome question said in full keeps a tapped Voice Mode busy this long
const WAKE_WINDOW_MS = 2400; // woken: how long the microphone waits for "wake up, daddy's home" before the greeting
// Hearing through the home base (v7.7, beta, SPEC §25): its words come once the owner has finished
// (Whisper hears whole utterances), so a tap that says "I'm done" waits for them this long at most
// (the home base answers within 4 s, or this device's recognizer takes over).
const HOME_HEAR_GRACE_MS = 6000;
const HOME_HEAR_CHECK_MS = 7000; // the 2-second check waits this long for words the home base is hearing
const WAKE_BOOT_MS = 1700; // woken in a background tab (no listening there): the greeting follows the boot
const WAKE_OFFER_WAIT_MS = 2500; // the Music card offered may take this long to find (else just the briefing)
const SLEEP_SILENT_MS = 2500; // a woken session that went quiet returns to Standby after this
const SLEEP_IDLE_MS = 60000; // ... and one left idle (an answer read, a card shown) after this
// v8.1 (A2): a woken session that ended in an apology or a voice-input error returns after this (time for a tap;
// then "Hey Jarvis" works again: Standby listens only once he is back there).
const SLEEP_FAILED_MS = 10000;
const SESSION_NOTE = 'session'; // v8.1: the hands-free session's notification (attention.js notify tag)
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
// v8.1 walkthroughs: whether this device's own voice sends start events (learned from a tour's first
// chunk: real events come at once, an assumed start after 3 s); null until known. Sets the fallback.
let deviceStartEvents = null;
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
const ACTIONS = new Set(['tool', 'mission', 'hologram', 'blueprint', 'music']);

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
    look,
    mode,
    container,
    visuals,
    createMicBands,
    screens,
    music,
    homeBase,
    standby,
    wake,
    voiceLabel,
    router,
    listenWhileHidden,
    holdCapMs,
    onActive,
    hiddenCount,
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
    lastLine: '', // v8.1: the last short line said ("repeat that" when no answer was given yet)
    preface: null, // v8.1: { text, at }: said before the next turn's answer (Optics' "New look.")
    karaoke: null, // { spans, els, texts, cursor, word }
    userEl: null,
    silentTries: 0,
    retryTimer: 0,
    idleReason: 'ready',
    statusIcon: '',
    coreAgentSig: '',
    unlocked: false,
    announced: '',
    pendingAsk: null, // v8.1: a question (or the prompt) to say once Voice Mode is free (afterSpeech)
    heldWords: '', // said while a hologram built and not a viewer command: handled once the reply is said
    canListen: false, // last value sent to the viewer's mic (a hologram of this reply is building)
    noRelisten: false, // a Music card was just shown: wait for a tap (Preview) instead of listening again
    review: null, // the 2-second check: { text, alts, L (its listen, still listening), mode, remaining, … }
    mic: null, // a finished listen whose recognizer still runs: the check may keep it (handed over in heard())
    wake: null, // the wake routine: { phase: 'opening'|'greeting'|'asking', offer, timer } (v7.4)
    wakeSession: false, // this Voice Mode was opened from Standby (it goes back there afterwards)
    sleepAfter: false, // "go back to sleep": Standby once the short reply has been said
    sleepTimer: 0,
    // v8.1 hands-free (A1, A2, A6)
    asked: 0, // questions taken since the last wake words, tap or key (the hidden brake; claps don't reset it)
    braked: false, // the brake was said: no more follow-up listens until the owner calls him again
    typingForced: false, // S.typing was set by a voice-input error, not by the owner (it doesn't hold off Standby)
    awayNoted: false, // this session's "Jarvis is listening" notification was shown
    deaf: false, // the recognizer failed in the background: said once; no more listening there
    active: false, // MAC-R2-1: last told to onActive (he can hear the owner or is answering)
  };
  let runFrame = 0; // pending requestAnimationFrame for run rendering
  let levelFrame = 0; // audio-level animation loop
  let levelValue = 0;
  let levelTarget = 0;
  let levelSent = -1;
  let levelLast = 0;
  // The natural voice's own 8 bands (its output analyser) drive the core's voice band while it
  // speaks, as the mic's bands do while Jarvis listens (Living Core v2).
  const outBands = new Float32Array(8);
  let outBandsOn = false;

  // v8.1 seams (contract (a)). The owner questions stack (the newest asked and answered first), the
  // standing prompt channel (Jarvis for Chrome) beside it, and the hold (a woken session stays out of
  // Standby while something holds it, at most 2 minutes after the owner's last words).
  const questions = createQuestionStack({ onAsk: (q, { again }) => askQuestion(q, again) });
  // v8.1: when each open question (and the prompt) was last asked, in order: a bare "cancel" or "no"
  // answers the one asked last (command-order.js askedLast).
  const askedAt = new Map();
  let askSeq = 0;
  const prompts = createPromptChannel({ onSay: (p) => askQuestion(p, false) });
  // v8.1 chrome-voice: the prompt channel's own part (see "v8.1 Jarvis for Chrome by voice" below).
  //   check      the spoken check counting down: { kind: 'task' | 'approve', phase: 'saying' | 'counting' |
  //              'paused', timer, until, ms, interrupted, spec }
  //   saidAt     when the open prompt (saidKey) was last said in full (the 30 s; when it was asked is
  //              voice's askedAt above)
  //   greeting   { id, line }: a prompt the wake greeting says ("Chrome is waiting for you: …")
  //   lastDone   { text, at }: the last line spoken to the end
  //   pendingPrompt  the prompt waiting to be said once Voice Mode is free: its own slot, so an owner question
  //              waiting beside it never takes its place (REDTEAM-VOICE-6)
  //   unheard    the open prompt's key when it was said in full with no listen after it (Continuous off, the
  //              brake, a hidden idle session): its 30 s start at the owner's next listen (PRIVACY-1)
  //   hiddenIdle hidden, and the owner's follow-up window is over (a hidden listen ended with nothing, or he was
  //              hidden while nothing was under way): Chrome's lines open no microphone (PRIVACY-1). A tap, a
  //              key, a wake, a barge-in, the owner's words or Jarvis on screen again end it.
  const C = { check: null, saidAt: 0, saidKey: 0, greeting: null, lastDone: null, hint: '', pump: 0, pendingPrompt: null, unheard: 0, hiddenIdle: false, sayings: 0, sayingSp: null, stopped: 0, hushKey: 0 };
  // holdCapMs (v8.1, tests only: 'jarvis.dev.voice' through app.js): a shorter hold, never a longer one.
  const hold = createVoiceHold(Number(holdCapMs) > 0 ? { capMs: Math.min(HOLD_CAP_MS, Number(holdCapMs)) } : {});
  const listenHidden = typeof listenWhileHidden === 'function' ? listenWhileHidden : () => false;
  const selfMask = createSelfMask(); // v8.1 (A8): his own "Jarvis" never interrupts him
  let ownRouter = null; // without the app's router: one with today's matchers, for Voice Mode's own words

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
  // v7.7 (beta): "via home base" while the home base hears this listen (Whisper on the Alienware).
  const hbMark = h('span', { class: 'vm-hb-mark', hidden: true, attrs: { 'data-testid': 'voice-homebase-mark', title: 'Heard by your home base (Whisper on the Alienware)' } }, icon('server', { size: 12, strokeWidth: 2 }), h('span', { text: 'via home base' }));
  // v7.8: the voice speaking now, on the status line beside "Speaking": "George · home base", "George ·
  // this device", "iPhone voice" / "built-in voice". It changes when George hands over mid-reply (the
  // router's onVoiceChange) and goes when the voice stops. On the status line, it never moves the layout.
  const voiceTag = createVoiceTag({ testid: 'voice-label', className: 'vm-voice-tag' });
  const statusEl = h('div', { class: 'vm-status' }, statusIconEl, statusText, hbMark, voiceTag.el);

  const captions = h('div', { class: 'vm-captions', attrs: { 'data-testid': 'voice-captions', 'data-kind': 'hint' } });
  // Apple Music: the Music card of a "play …" (or the cards of a reply's find_music calls, stacked)
  // sits under the captions.
  const musicEl = h('div', { class: 'vm-music', hidden: true, attrs: { 'data-testid': 'voice-music' } });
  // v8.1 Jarvis for Chrome: its task card and prompt cards (src/ui/chrome-task.js) sit under the captions too.
  const chromeEl = h('div', { class: 'vm-chrome', attrs: { 'data-testid': 'voice-chrome' } });
  const musicViews = new Map(); // segment id -> card view, in the order shown
  const MAX_VOICE_CARDS = 6;
  const capSub = h('p', { class: 'vm-cap-sub', hidden: true });

  // The 2-second check (v7.2): what was heard, big; tap it to fix it; Send now with the countdown ring.
  const reviewText = h('button', {
    class: 'vm-review-text',
    type: 'button',
    attrs: { 'data-testid': 'voice-review-text', 'aria-label': 'Fix what I heard' },
    on: { click: () => onReviewEdit() },
  });
  const reviewInput = h('input', {
    class: 'vm-input vm-review-input',
    type: 'text',
    attrs: {
      'aria-label': 'Fix what I heard',
      'data-testid': 'voice-review-input',
      autocomplete: 'off',
      autocapitalize: 'sentences',
      spellcheck: 'true',
      enterkeyhint: 'send',
      maxlength: '4000',
    },
  });
  const reviewSendBtn = h('button', { class: 'vm-send', type: 'submit', attrs: { 'aria-label': 'Send', 'data-testid': 'voice-review-send' } }, icon('send', { size: 20 }));
  const reviewForm = h('form', { class: 'vm-form vm-review-form', hidden: true, attrs: { autocomplete: 'off' }, on: { submit: onReviewSubmit } }, reviewInput, reviewSendBtn);
  const reviewHeard = h('p', { class: 'vm-review-heard', hidden: true, attrs: { 'data-testid': 'voice-review-heard' } });
  const reviewRing = h('span', { class: 'vm-review-ring', attrs: { 'aria-hidden': 'true' } });
  const reviewNowLabel = h('span', { class: 'vm-review-now-label', text: 'Send now' });
  const reviewNow = h('button', { class: 'vm-review-now', type: 'button', attrs: { 'data-testid': 'voice-review-now' }, on: { click: () => reviewSend('button') } }, reviewRing, reviewNowLabel);
  const reviewCancelBtn = h('button', { class: 'vm-review-cancel', type: 'button', attrs: { 'data-testid': 'voice-review-cancel' }, on: { click: () => reviewDiscard('button') } }, h('span', { text: 'Cancel' }));
  const reviewHint = h('p', { class: 'vm-review-hint', attrs: { 'data-testid': 'voice-review-hint' } });
  const reviewEl = h(
    'div',
    { class: 'vm-review', hidden: true, attrs: { 'data-testid': 'voice-review', role: 'group', 'aria-label': 'What I heard' } },
    reviewText,
    reviewForm,
    reviewHeard,
    h('div', { class: 'vm-review-bar' }, reviewNow, reviewCancelBtn),
    reviewHint,
  );

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
  // v8.1 (SHOULD C5): a one-tap offer ("Look at my screen · about 3¢"): what only a tap can start.
  const offerLabel = h('span', { class: 'vm-pill-label' });
  const offerBtn = h('button', { class: 'vm-pill vm-offer', type: 'button', hidden: true, attrs: { 'data-testid': 'voice-offer' }, on: { click: () => takeOffer() } }, offerLabel);
  let offer = null; // { onTap, timer }

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
  // Optics: Look opens the camera over Voice Mode (call from this tap: iOS asks for the camera only in a gesture).
  const lookOk = !!look && typeof look.open === 'function' && probe(() => typeof look.supported !== 'function' || !!look.supported());
  const lookBtn = lookOk ? dockButton('vm-dock-look', 'voice-look', 'camera', 'Look', onLook) : null;
  if (lookBtn) lookBtn.btn.setAttribute('aria-label', 'Look: show Jarvis what the camera sees');
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
    h('div', { class: 'vm-stage' }, coreBtn, statusEl, captions, reviewEl, capSub, musicEl, chromeEl, missionEl, readFull, offerBtn),
    h(
      'div',
      { class: 'vm-bottom' },
      form,
      lookBtn
        ? h('div', { class: 'vm-dock vm-dock--look' }, h('div', { class: 'vm-dock-side' }, lookBtn.btn, typeBtn.btn), mainBtn.btn, exitBtn.btn)
        : h('div', { class: 'vm-dock' }, typeBtn.btn, mainBtn.btn, exitBtn.btn),
      hints,
    ),
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
  // v7.8: the voice label follows the voice that actually speaks.
  const valueOf = (fn) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };
  const showVoice = (engine) => {
    const words = engine && typeof voiceLabel === 'function' ? String(valueOf(() => voiceLabel(engine)) || '') : '';
    voiceTag.set(engine && words ? engine : null, words);
    root.dataset.voice = engine && words ? engine : '';
  };
  if (tts && typeof tts.onVoiceChange === 'function') {
    const offVoice = valueOf(() => tts.onVoiceChange((engine) => !S.closed && showVoice(engine)));
    if (typeof offVoice === 'function') offs.push(offVoice);
    if (typeof tts.voiceNow === 'function') showVoice(valueOf(() => tts.voiceNow()) || null);
  }
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

  // Inside the opening gesture (iOS). v7.8.1: opened by the wake routine (claps or "Hey Jarvis") there is no
  // gesture: the router is told so (what it knows about George's stuck sound stays, and the greeting doesn't
  // wait for it), and the one-shot unlock waits for the first real tap in Voice Mode.
  unlockSpeech({ tap: !(wake && typeof wake === 'object') });
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
    /**
     * Apple Music: a preview is starting, so Jarvis stops talking (a short line or an answer that
     * was being read) and waits for a tap instead of listening. True when he was speaking.
     */
    hush: () => {
      if (S.closed || !S.speech || S.run) return false;
      cancelSpeech();
      S.noRelisten = false;
      goIdle('music');
      return true;
    },
    /**
     * Whether the microphone is open or the 2-second check is on screen (its microphone may still
     * be listening for "cancel" or "no, I said …"): previews never start then.
     */
    isListening: () => !S.closed && (!!S.listen || !!S.review),
    /**
     * MAC-R3-4: whether it can hear the owner or is answering (what onActive reports), or (MAC-R4-2) Chrome's question
     * waits to be said, its check runs, or (MAC-R5-1) the question is in its voice window: 30 s after it was said in
     * full (said or heard: speech and the listen above). Left on its card after that: not. Idle or offline: false.
     */
    isActive: () =>
      !S.closed &&
      (S.active ||
        !!(S.listen || S.review || S.run || S.speech || S.retryTimer) ||
        !!(C.pendingPrompt || C.check) ||
        ((prompts.current() || {}).key === C.saidKey && Math.max(C.saidAt || 0, C.voiceAt || 0) > 0 && Date.now() - Math.max(C.saidAt || 0, C.voiceAt || 0) < PROMPT_VOICE_MS)),
    /** v8.0 Optics' live view: a short line Jarvis says by himself. True when it is said (sayLine()). */
    say: (text) => sayLine(text),
    /** v8.1 (A8): Standby heard two claps ('clap') or "Hey Jarvis" ('word') while he speaks. True when it acted. */
    bargeIn: (trigger) => bargeIn(trigger),
    /** v8.1 (C2): "turn off continuous" by voice: the switch follows (the setting is saved by the command). */
    setContinuous: (on) => setContinuous(on),
    /** v8.1 (C2): leave Voice Mode for something the owner asked to see ("open settings"): not into Standby. */
    leave: () => close('command'),
    /**
     * v8.1 (SHOULD C5): a one-tap button under the captions ({ label, testid, onTap, ttlMs = 60000 }):
     * for what only a tap may start (the screen's share picker). A new offer replaces it.
     */
    offer: (spec) => showOffer(spec),
    /**
     * v8.1 (contract (a)): an owner question, said now (or once Voice Mode is free) and answered by
     * voice: { id, say, choices: [{ id, label, words: [...] }], match(text, readings) → choiceId | null,
     * check = false, keep = false, timeoutMs = 60000, onAnswer(choiceId, { words, via: 'voice' | 'tap' }),
     * onExpire(reason) } → { cancel(), answer(choiceId) }. Questions stack: the newest is asked and
     * answered first; when it is answered, cancelled or expires, the one under it is said again (a
     * covered question's clock stops). keep: other words leave it open (they are routed as usual);
     * otherwise they drop it (onExpire('dropped')). check: the 2-second check before onAnswer. An
     * answer is consumed: it never also goes to Claude. onExpire never sends or spends anything.
     * answer(choiceId): a tap on the question's own button (via 'tap').
     */
    question: (spec) => askNew(spec),
    /**
     * v8.1 (contract (a); Track 3 fills it for Jarvis for Chrome): the standing prompt, one at a time:
     * { id, say, answers: [{ id, words: [...], check }], onAnswer(answerId, { words, via }), onClosed() }
     * → { update({ say, answers }), close() }. Said once Voice Mode is free; its answer words are
     * reserved (no other feature uses them). Questions never expire it, and it never expires them.
     */
    prompt: (spec) => openPrompt(spec),
    /**
     * v8.1 Jarvis for Chrome (chrome-voice, src/ui/chrome-task.js): say(line) says a line when Voice
     * Mode is free (an open prompt doesn't stop it; a check does), false otherwise; check({ kind, show,
     * say, cancelLine, onGo, onCancel(how), onCount(ms) }) the spoken check (said, then 2 s, or 5 s
     * while hidden, with the microphone open: "cancel", "no", "stop" withdraw it; nothing goes out
     * before it ends) -> { cancel(), go() }; card(view) shows a card under the captions; greeted(id,
     * line) says the wake greeting carries prompt `id`'s line.
     */
    chrome: {
      say: (line) => chromeSay(line),
      check: (spec) => startCheck(spec),
      card: (view) => showChromeCard(view),
      // The wake greeting says the prompt `id` ("Chrome is waiting for you: …", the line): said there once.
      greeted: (id, line) => {
        C.greeting = typeof id === 'string' && typeof line === 'string' && line ? { id, line } : null;
        return !!C.greeting;
      },
    },
    /**
     * v8.1 (contract (a); Track 2 fills the tour): say `text` (one step per line), spoken as kind
     * 'tour': { text, kind = 'tour', onChunk({ start, end }) (offsets in `text`, as each chunk starts
     * playing), onEnd(reason) ('done' | 'interrupted' | 'failed' | 'cancelled'), listenAfter = null
     * (null: today's rule after speech; false: no listening; { noSpeechMs }: one listen) } → { cancel() }.
     */
    narrate: (spec) => narrate(spec),
    /**
     * v8.1 (contract (a)): while held, a woken session doesn't go back to Standby, for at most 2
     * minutes after the owner's last words; then it does, and whatever held it stays where it was.
     */
    hold: (reason) => holdSession(reason),
    release: (reason) => releaseSession(reason),
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
  } else if (wake && typeof wake === 'object') {
    startWake();
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
    if (S.review) {
      ic = 'send';
      label = 'Send';
      aria = 'Send now';
      coreAria = 'Send now';
    } else if (S.listen) {
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
    const busy = !!S.run || !!S.review || (!!S.listen && !!S.listen.text);
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

  /** Look: Optics opens over Voice Mode (the camera starts within this tap). */
  function onLook() {
    if (S.closed || !lookBtn) return;
    haptic('light');
    unlockSpeech();
    try {
      look.open();
    } catch (err) {
      console.warn('[voice] the camera could not open', err);
    }
    updateLevelLoop();
    syncVisuals();
  }

  function onCoreTap() {
    if (S.closed) return;
    disarmSleep();
    haptic('light');
    unlockSpeech();
    clearRetry();
    if (S.review) return reviewSend('tap'); // the 2-second check: send now
    if (chromeStop()) return; // v8.1 chrome-voice: a tap withdraws a Chrome check (said, or counting down)
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
    disarmSleep();
    unlockSpeech();
    clearRetry();
    if (S.review) return reviewSend('tap');
    if (chromeStop()) return; // v8.1 chrome-voice: Stop withdraws a Chrome check (said, or counting down)
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
      chromeOwnerStop(S.speech); // CHROME-VOICE-R2-2: Stop silences Chrome's question too (it stays on its card)
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

  /** v8.1: Continuous set by a spoken command (the setting itself is saved by the command). */
  function setContinuous(on) {
    if (S.closed || S.continuous === !!on) return;
    S.continuous = !!on;
    contSwitch.setAttribute('aria-checked', String(S.continuous));
    announce(S.continuous ? 'Continuous conversation on' : 'Continuous conversation off');
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
    if (S.review) {
      // Type instead: the words being checked go to the text box, to fix and send from there.
      const R = endReview();
      S.typing = true;
      input.value = R && R.mode === 'editing' ? reviewInput.value.trim() || R.text : R ? R.text : '';
      goIdle('ready');
      focusInput();
      return;
    }
    S.typing = !S.typing;
    S.typingForced = false; // v8.1 (A2): the owner's own choice from here (typing holds off Standby)
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
    disarmSleep();
    hold.heard(); // v8.1: the owner's words
    // Woken: a typed answer to the offer ("yes", "brief me", "no") is taken like a spoken one.
    if (S.wake && wakeHeard([text])) return;
    // v8.1 (C1): typed here, the words go through the router like spoken ones (R1: the same words do
    // the same thing): one reading, and no 2-second check (Enter sends; a command acts at once).
    const local = { ...routeLocal([text]), via: 'typed' };
    let hit = chromeCheckFirst(routeWords([text], local)); // v8.1 chrome-voice: a check counting was asked last
    chromeOtherWords(hit); // v8.1 chrome-voice: other words withdraw a Chrome check, typed too
    if (dropsQuestion(hit)) questions.dropTop('dropped');
    while (hit) {
      // An approval for Chrome keeps its check, typed too (it approves a step on a web page).
      if (act(hit, [text], { reviewed: hit.id !== 'prompt', typed: true })) return;
      hit = routeWords([text], local, hit);
      chromeOtherWords(hit);
    }
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
      if (S.review && S.review.mode === 'editing') {
        reviewStopEditing();
        return;
      }
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
    reportActive(next);
    if (handsFree()) callQuietly(() => sessionTitle(next)); // v8.1 (A1): "Listening · Jarvis" while hidden
    if (next !== 'idle' && next !== 'offline') disarmSleep();
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

  /**
   * MAC-R2-1: tell the app (onActive) whether this Voice Mode can hear the owner or is answering: a listen (or one about
   * to start again), the 2-second check, a turn or speech. Idle, an error or offline: not. The app's voice lock follows
   * it, so a Standby in another window stays asleep only while Jarvis is busy here, never while he merely sits open.
   */
  function reportActive(state) {
    if (typeof onActive !== 'function' || S.closed) return;
    const on = state === 'listening' || state === 'thinking' || state === 'working' || state === 'speaking' || !!(S.listen || S.review || S.run || S.speech || S.retryTimer);
    if (on === S.active) return;
    S.active = on;
    callQuietly(() => onActive(on));
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
    // A woken session that is over (quiet, or idle a while) goes back to Standby (Settings).
    if (S.wakeSession) armSleep(reason === 'silent' ? SLEEP_SILENT_MS : SLEEP_IDLE_MS);
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
      case 'music':
        // A Music card was shown: no listening now, so a tap on Preview can play (never over the mic).
        setStatus('Ready', 'dot');
        finishKaraoke();
        if (captions.dataset.kind === 'context') captions.dataset.kind = 'jarvis';
        setSub(S.sttOk && !S.typing ? musicHint() : '');
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
      case 'discarded':
        setStatus('Ready', 'dot');
        showCaption('hint', 'Okay, not sent.', tapHint);
        announce('Not sent');
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
    if (S.closed || S.listen || S.run || S.speech || S.review) return;
    if (S.state !== 'idle' && S.state !== 'offline') return;
    const kept = S.idleReason === 'offline-kept' || S.idleReason === 'back-online';
    goIdle(kept ? (isOnline() ? 'back-online' : 'offline-kept') : S.idleReason);
  }

  /**
   * v8.1: Jarvis is away for listening: hidden, unless listening while hidden is allowed (Track 1's
   * listenWhileHidden, a Mac). With the default it is exactly document.hidden.
   */
  function away() {
    if (!document.hidden) return false;
    return !probe(() => listenHidden());
  }

  /** v8.1 (A1): this session goes on in the background (a computer, the setting on, a session the owner started). */
  function handsFree() {
    return probe(() => listenHidden());
  }

  /**
   * v8.1 (A1): Jarvis is hidden and this session goes on there: one notification per session says so (its click
   * brings him forward); it closes when the session ends.
   */
  function noteAway() {
    if (S.closed || S.awayNoted || !document.hidden || !handsFree()) return;
    // Only while the session is under way (an idle one, after the brake for instance, listens to nothing).
    if (!(S.listen || S.review || S.run || S.speech || S.retryTimer || S.wake)) return;
    S.awayNoted = true;
    callQuietly(() => notify({ tag: SESSION_NOTE, title: 'Jarvis is listening', body: 'Ask away, or say “go back to sleep”.' }));
  }

  /**
   * v8.1 (A1): the recognizer fails in the background (a Chrome or Mac setting; device test 2): he says so once,
   * the notification says the same, and he stops listening there (a woken session goes back to Standby).
   */
  function hiddenDeaf() {
    const line = 'I can’t hear you while I’m in the background. Click me.';
    S.awayNoted = true;
    callQuietly(() => notify({ tag: SESSION_NOTE, title: 'Jarvis can’t hear you', body: line }));
    if (S.deaf) {
      goIdle('ready');
      if (S.wakeSession) armSleep(SLEEP_FAILED_MS);
      return;
    }
    S.deaf = true;
    play('error');
    speakAck(line);
  }

  function onVisibility() {
    if (S.closed) return;
    if (!document.hidden) {
      S.asked = 0; // MAC-R2-3: Jarvis on screen: the hidden count starts again
      S.braked = false;
    }
    if (away()) {
      // Pause listening (including a listen that was about to start again).
      const wasListening = !!S.listen || !!S.retryTimer;
      clearRetry();
      stopListening();
      // The 2-second check waits (nothing is sent while the owner is away); its microphone closes.
      if (S.review) reviewPause('paused', { closeMic: true });
      else if (wasListening && !S.run && !S.speech) goIdle('paused');
    } else if (document.hidden) {
      noteAway(); // v8.1 (A1): hidden on a Mac, the session goes on there: one notification says so
    } else if (S.wake && S.wake.phase === 'asking' && !S.listen && !S.run && !S.speech && !S.review && S.sttOk && !S.typing && !S.sttBlocked) {
      // Woken in a background tab (a Mac): the offer was said out loud; now that Jarvis is on screen,
      // he listens for the answer.
      startListening({ keepAnswer: true });
    }
    chromeVisibility(); // v8.1 chrome-voice: hidden with nothing under way, Chrome's lines open no microphone
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
    // The same line is updated in place (no fade per word); the type only ever grows while the
    // owner talks, so a revised word near the 90-character mark never makes it jump back and forth.
    if (S.userEl.textContent !== text) setText(S.userEl, text);
    if (text.length > 90 && captions.dataset.length !== 'medium') setCaptionLength('medium');
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
   *
   * The recognizer runs until stt.js decides the owner has finished (Settings → Voice → Wait after I
   * stop talking). With the 2-second check on, it keeps listening after that (keepListening): the
   * check takes it over to hear "cancel" or "no, I said …" without starting a new one.
   */
  function startListening({ gesture = false, retry = false, keepAnswer = false, duringBuild = false, wakeWindow = false, noSpeechMs = 0, oneTry = false, owner = false } = {}) {
    if (S.closed || (S.run && !duringBuild)) return;
    clearRetry();
    disarmSleep();
    if (S.review) endReview(); // a new listen replaces a check still on screen (nothing is sent)
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
      // v8.1 (A6): a tap or a key: the owner is here; the hidden count starts again.
      S.asked = 0;
      S.braked = false;
      S.deaf = false;
      S.typingForced = false;
      S.sleepAfter = false; // MAC-8: a tap during "Very good, Tony." (or the brake line): they changed their mind
    }
    const review = !duringBuild && reviewOn();
    // noSpeechMs, oneTry (v8.1, narrate()'s listenAfter): its own silence window, and no second try.
    // owner (v8.1.1): a barge-in's listen: the owner's, as a tap's is (nothing Jarvis says by himself takes it),
    // without a tap's side effects above.
    const L = { gesture, text: '', stopRequested: false, handle: null, timers: [], heard: false, duringBuild, review, alts: [], sendNow: false, keepAnswer, wakeWindow, noSpeechMs: Number(noSpeechMs) > 0 ? Number(noSpeechMs) : 0, oneTry: !!oneTry, owner: !!owner };
    S.listen = L;
    chromeListens(L); // v8.1 chrome-voice: a prompt said with no listen counts as asked from here
    S.noRelisten = false;
    // A preview playing now would be heard as speech: it pauses before the mic opens.
    try {
      if (music && typeof music.onListen === 'function') music.onListen();
    } catch {
      /* decoration */
    }
    syncCoreAgents(null);
    setVoiceState('listening');
    setStatus(retry ? 'Listening again…' : 'Listening…', 'mic');
    if (wakeWindow) showCaption('hint', 'Waking up…');
    else if (retry) showCaption('hint', 'I didn’t catch anything — take your time.', 'Still listening.');
    else if (keepAnswer && S.answer) showContext();
    else showCaption('hint', greeting());
    announce(retry ? 'Listening again' : 'Listening');
    play('listen-start');

    let handle = null;
    try {
      const st = getS();
      handle = stt.startListening({
        lang: st.listenLang, // '' = the device's language (stt.js)
        wait: st.listenWait,
        phrases: listenPhrases({ partNames: partNamesNow() }), // Chrome's contextual biasing, when it has it
        keepListening: review,
        background: handsFree(), // v8.1 (A1): restarted in the background too, as on screen (a Mac)
        noSpeechMs: L.noSpeechMs || undefined, // v8.1 (A6): the follow-up window's own silence (8 s)
        // The check takes over this recognizer once the words are on screen: its events go there.
        onPartial: (value) => (reviewing(L) ? reviewPartial(value) : onPartial(L, value)),
        onFinal: (value, info) => (reviewing(L) ? reviewFinal(value) : onFinal(L, value, info)),
        onEnd: () => (reviewing(L) ? reviewMicEnded(L) : finishListening(L, 'end')),
        onError: (err) => (reviewing(L) ? reviewMicEnded(L) : onListenError(L, err)),
        // v7.7 (beta): Voice Mode's own listens may be heard by the home base (Whisper), when the
        // owner turned that on and it is ready (app.js's listening wraps stt.js; otherwise these two
        // are ignored). Not the wake window (2.4 s for "wake up") or a listen while a hologram builds.
        homeBase: !duringBuild && !wakeWindow,
        onHomeBase: (info) => (reviewing(L) ? reviewHomeBase(L, info) : onHomeBase(L, info)),
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
        if (S.listen === L && !L.text && !L.hb) finishListening(L, 'silence');
      }, L.noSpeechMs || SILENCE_MS),
      setTimeout(() => requestSend(L, true), MAX_LISTEN_MS),
    );
    // Woken: if the owner says nothing right away ("wake up, daddy's home"), Jarvis greets.
    if (wakeWindow) {
      L.timers.push(
        setTimeout(() => {
          if (S.listen === L && !L.text) finishListening(L, 'silence');
        }, WAKE_WINDOW_MS),
      );
    }
  }

  function onPartial(L, value) {
    if (S.listen !== L) return;
    const text = toText(value).trim();
    chromeHeard(text); // v8.1 chrome-voice: talking pauses a Chrome check; words taken back let it go on
    if (!text) {
      // The recognizer took the words back (a noise first heard as "uh"): they are never sent, and
      // the listen goes on as before them.
      if (L.text) {
        L.text = '';
        if (L.keepAnswer && S.answer) showContext();
        else showCaption('hint', greeting());
        renderControls();
      }
      return;
    }
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

  function onFinal(L, value, info) {
    if (S.listen !== L) return;
    const text = toText(value).trim();
    if (text) L.text = text;
    L.alts = info && Array.isArray(info.alternatives) ? info.alternatives.filter((a) => typeof a === 'string' && a.trim()) : [];
    finishListening(L, 'final');
  }

  /** Tap while listening: stop and send what was heard (or just stop when nothing was). */
  function requestSend(L, auto) {
    if (S.listen !== L) return;
    // v7.7: words the home base is still hearing count as words (its text comes once it answers).
    const hearing = L.hb === 'speech' || L.hb === 'sending';
    if (!L.text && !hearing && !auto) {
      finishListening(L, 'cancel');
      return;
    }
    if (L.stopRequested) return;
    L.stopRequested = true;
    if (!auto) L.sendNow = true; // a tap means "I'm done, send now": no 2-second check
    stopHandle(L.handle);
    setStatus('Got it', 'check');
    // Give the recognizer a moment to deliver its final transcript, then send what we have. The home
    // base's words come when it answers: they are waited for (it answers within 4 s, or falls back).
    const since = Date.now();
    const grace = () => {
      if (S.listen !== L) return;
      if (!L.text && (L.hb === 'speech' || L.hb === 'sending') && Date.now() - since < HOME_HEAR_GRACE_MS) {
        L.timers.push(setTimeout(grace, 250));
        return;
      }
      finishListening(L, 'stop');
    };
    L.timers.push(setTimeout(grace, STOP_GRACE_MS));
  }

  /**
   * v7.7 (beta): what the home base's hearing is doing for this listen (no live words: Whisper hears
   * whole utterances). 'listening' and 'speech' show "via home base"; 'sending' says the words are
   * on their way; 'fallback' means this device's recognizer took the listen over: when the owner had
   * already spoken, Jarvis asks for it again.
   */
  function onHomeBase(L, info) {
    const phase = info && info.phase;
    // The listen is over (sent, cancelled, closed): the mark goes, unless the check holds a newer one.
    if (phase === 'idle' && S.listen !== L && !(S.review && S.review.L && S.review.L !== L)) showHomeBaseMark(null);
    if (S.listen !== L || S.closed) return;
    chromeHomeBase(phase); // v8.1 chrome-voice: the home base hearing the owner pauses a Chrome check
    if (phase === 'listening' || phase === 'speech' || phase === 'sending') {
      const wasSpeaking = L.hb === 'speech';
      L.hb = phase;
      showHomeBaseMark(phase);
      if (phase === 'speech') {
        L.heard = true;
        if (S.sttBlocked) {
          S.sttBlocked = false;
          root.dataset.stt = 'ok';
        }
        if (!wasSpeaking) bumpLevel(0.7);
        if (!L.stopRequested) setStatus('Listening…', 'mic');
      } else if (phase === 'sending' && !L.stopRequested) setStatus('Hearing you…', 'mic');
      return;
    }
    if (phase === 'heard') {
      L.hb = 'heard';
      return;
    }
    if (phase === 'fallback') {
      const spoke = L.hb === 'speech' || L.hb === 'sending';
      L.hb = null;
      showHomeBaseMark(null);
      if (spoke && info.reason !== 'mic') {
        const why = info.reason === 'slow' ? 'The home base took too long.' : 'I couldn’t reach the home base.';
        showCaption('hint', `${why} Say that again?`, 'Listening on this device for now.');
        announce(`${why} Say that again.`);
      }
      // This device's recognizer listens from here: our own no-speech watchdog for it.
      L.timers.push(
        setTimeout(() => {
          if (S.listen === L && !L.text) finishListening(L, 'silence');
        }, SILENCE_MS),
      );
      return;
    }
    if (phase === 'idle') {
      if (L.hb !== 'heard') L.hb = null;
      showHomeBaseMark(null);
    }
  }

  function showHomeBaseMark(phase) {
    hbMark.hidden = !phase;
    if (phase) hbMark.dataset.phase = phase;
    else delete hbMark.dataset.phase;
    if (phase) root.dataset.hear = 'homebase';
    else delete root.dataset.hear;
  }

  function finishListening(L, reason) {
    if (S.listen !== L) return;
    S.listen = null;
    clearTimers(L.timers);
    // Stop the recognizer, unless it ended by itself, or ended this turn by itself (it stops on
    // its own then), or delivered it and keeps listening for the 2-second check (heard() below
    // decides whether the check takes it over; it is stopped there otherwise).
    const keepsMic = reason === 'final' && L.review && !S.closed && !!(L.text || '').trim();
    if (reason !== 'end' && !keepsMic && !(reason === 'final' && !L.review)) abortHandle(L.handle);
    if (S.closed) return;
    const text = (L.text || '').trim();
    if (L.duringBuild) {
      play('listen-stop');
      afterBuildListen(text);
      return;
    }
    if (!text && S.wake && S.wake.phase === 'opening') {
      greetWake(false); // woken, and nothing said right away: Jarvis greets
      return;
    }
    if (reason === 'cancel') {
      play('listen-stop');
      if (C.check) {
        withdrawCheck(C.check, 'voice'); // v8.1 chrome-voice: the owner stopped the check's listen: nothing goes
        return;
      }
      goIdle('ready');
      return;
    }
    C.hiddenIdle = !text && !!document.hidden; // v8.1 chrome-voice: a hidden listen ended with nothing (words: the owner is here)
    if (text) {
      S.silentTries = 0;
      const calls = startsWithWakeWords(text);
      if (calls) {
        // MAC-V-1: "Hey Jarvis, …": the owner calling him, not the room's talk: the hidden count starts again.
        S.asked = 0;
        S.braked = false;
      }
      play('listen-stop');
      // The check may keep this recognizer (to hear "cancel" or "no, I said …"); otherwise it stops.
      S.mic = reason === 'final' && L.review ? L : null;
      try {
        // v8.1 (A6), MAC-R3-3: one more question without the wake words or a tap, counted by heard() only when the
        // words are paid or sent (a free command is not a question).
        heard(text, L.alts, { sendNow: L.sendNow, counts: !calls && !L.wakeWindow });
      } finally {
        if (S.mic === L) {
          S.mic = null;
          abortHandle(L.handle);
        }
      }
      return;
    }
    if (C.check && chromeHeard('')) return; // v8.1 chrome-voice: a Chrome check goes on (or ends) by itself
    if (L.stopRequested) {
      goIdle('ready');
      return;
    }
    if (away()) {
      goIdle('paused');
      return;
    }
    S.silentTries += 1;
    // A walkthrough's decision always waits: listen again until its 60 s run out (critique H5).
    if ((S.silentTries < SILENT_TRIES_MAX || decisionWaits()) && !L.oneTry) {
      setStatus('Listening again…', 'mic');
      S.retryTimer = setTimeout(() => {
        S.retryTimer = 0;
        if (S.closed || S.listen || S.run || S.speech) return;
        if (away()) goIdle('paused');
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
    if (S.wake && S.wake.phase === 'opening' && !(L.text || '').trim()) {
      // Woken and the microphone can't hear the opening words (no speech, or the browser wants a
      // tap first): Jarvis greets anyway.
      S.listen = null;
      clearTimers(L.timers);
      abortHandle(L.handle);
      if (!S.closed) greetWake(false);
      return;
    }
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
    // v8.1 (A1): the recognizer can't listen in the background here (a refusal, or the microphone failing).
    if (document.hidden && handsFree() && (code === 'not-allowed' || code === 'other')) {
      hiddenDeaf();
      return;
    }
    // The platform's messages are already short and actionable (e.g. iPhone: turn on Dictation).
    const detail = err && typeof err.message === 'string' ? asSentence(clip(singleLine(err.message), 160)) : '';
    if (code === 'not-allowed') {
      if (!L.gesture || (err && err.restarted)) {
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
    S.typingForced = true; // v8.1 (A2): not the owner's typing: it doesn't hold off Standby
    setVoiceState('error');
    setStatus(title, 'alert');
    showCaption('error', text, sub);
    announce(`${title}. ${text}`);
    play('error');
    haptic('error');
    renderControls();
    if (S.wakeSession) armSleep(SLEEP_FAILED_MS); // v8.1 (A2): never stuck here for the night
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

  // ======================================================================= the 2-second check

  /** True while the check holds this listen's recognizer (its events are the check's then). */
  function reviewing(L) {
    return !!S.review && S.review.L === L;
  }

  /**
   * "Show, then send" (Settings → Voice → After I stop talking): what was heard is shown big for 2
   * seconds with a countdown ring and Send now, then sent. The listen's recognizer keeps listening
   * (S.mic, handed over by finishListening): "cancel" or "never mind" drops it, "no, I said …"
   * corrects it and counts again, "wait" stops the countdown, more words are added. A tap on the
   * words opens a field to fix them (the countdown and the microphone stop).
   * v8.1 (Phase 0 item 3): `action` binds what the check shows (a router hit: a command, or an answer
   * to a question or the prompt). Sent unchanged, it runs that action; corrected words ("no, I said
   * …", an edit) are routed again, as before.
   */
  function startReview(text, { action = null } = {}) {
    const mic = S.mic && S.mic.handle ? S.mic : null;
    S.mic = null;
    if (S.review) endReview();
    // guess: a correction Jarvis wasn't sure how to apply, shown for the owner to confirm ({ from, said })
    // listenTimer: while the owner talks during the check, the fallback that lets it go on (reviewPartial)
    // shown: the words as the check first showed them (with `action`, the words it is bound to)
    const R = { text, shown: text, action: action && typeof action === 'object' ? action : null, L: mic, mode: 'counting', paused: false, remaining: REVIEW_MS, deadline: 0, timer: 0, frame: 0, micTimer: 0, listenTimer: 0, guess: null };
    S.review = R;
    S.karaoke = null;
    S.userEl = null;
    captions.hidden = true;
    syncMusicShown(); // the Music cards step aside (and no preview plays) while the words are checked
    reviewForm.hidden = true;
    reviewHeard.hidden = true;
    reviewText.hidden = false;
    reviewEl.hidden = false;
    setReviewText(text);
    setText(reviewHint, reviewHintText(R));
    setSub('');
    setVoiceState(mic ? 'listening' : 'idle');
    announce(`I heard: ${clip(singleLine(text), 200)}. Sending in 2 seconds.`);
    fadeIn(reviewEl);
    reviewNote(`“${clip(singleLine(text), 120)}” · sending in 2 s (say “cancel” or “no, I said …”)`);
    reviewCount(REVIEW_MS);
  }

  /** The line under the check: what the owner can do now. */
  function reviewHintText(R) {
    if (R.guess) return R.L ? 'Say “yes” or tap Send, or tap the words to fix them.' : 'Tap Send, or tap the words to fix them.';
    return R.L ? 'Tap the words to fix them, or say “no, I said …” or “cancel”.' : 'Tap the words to fix them.';
  }

  function setReviewText(text) {
    const R = S.review;
    if (!R) return;
    R.text = text;
    setText(reviewText, text);
    reviewText.setAttribute('aria-label', `Fix what I heard: ${clip(singleLine(text), 300)}`);
    reviewEl.dataset.length = text.length > 90 ? 'long' : 'short';
    // The check is taller than a caption (the words, Send now, the hint): the core steps back.
    root.dataset.caplen = text.length > 90 ? 'long' : 'medium';
    syncVisuals();
  }

  function renderReview() {
    const R = S.review;
    if (!R || S.closed) return;
    root.dataset.review = R.mode;
    reviewEl.dataset.state = R.mode;
    setText(reviewNowLabel, R.mode === 'counting' ? 'Send now' : 'Send');
    const [status, ic] = {
      counting: ['Sending…', 'send'],
      listening: ['Listening…', 'mic'],
      paused: R.guess ? ['Is that right?', 'info'] : ['Ready when you are', 'pause'],
      editing: ['Fix what I heard', 'edit'],
    }[R.mode] || ['Sending…', 'send'];
    setStatus(status, ic);
    drawRing();
    renderControls();
  }

  /** The countdown ring: how much of the 2 seconds has passed (0..1, a CSS variable). */
  function drawRing() {
    const R = S.review;
    if (!R) return;
    const left = R.mode === 'counting' ? Math.max(0, R.deadline - performance.now()) : R.remaining;
    reviewEl.style.setProperty('--vm-review-p', (1 - Math.min(1, Math.max(0, left / REVIEW_MS))).toFixed(3));
  }

  /** Count `ms` down, then send. */
  function reviewCount(ms) {
    const R = S.review;
    if (!R || S.closed) return;
    clearTimeout(R.timer);
    clearTimeout(R.micTimer);
    clearTimeout(R.listenTimer);
    R.micTimer = 0;
    R.listenTimer = 0;
    R.mode = 'counting';
    R.paused = false;
    R.remaining = ms;
    R.deadline = performance.now() + ms;
    R.timer = setTimeout(() => {
      if (S.review === R && R.mode === 'counting') reviewSend('timer');
    }, ms);
    renderReview();
    const tick = () => {
      R.frame = 0;
      if (S.review !== R || R.mode !== 'counting') return;
      drawRing();
      R.frame = requestAnimationFrame(tick);
    };
    if (!R.frame) R.frame = requestAnimationFrame(tick);
  }

  /** Stop the countdown: 'listening' (the owner talks), 'paused' ("wait", or away) or 'editing'. */
  function reviewPause(mode, { closeMic = false } = {}) {
    const R = S.review;
    if (!R) return;
    if (R.mode === 'counting') R.remaining = Math.max(0, R.deadline - performance.now());
    clearTimeout(R.timer);
    R.timer = 0;
    if (mode !== 'listening') {
      clearTimeout(R.listenTimer);
      R.listenTimer = 0;
    }
    R.mode = mode;
    if (mode === 'paused') R.paused = true;
    if (closeMic && R.L) {
      const L = R.L;
      R.L = null;
      abortHandle(L.handle);
      reviewHeard.hidden = true;
      setText(reviewHint, reviewHintText(R)); // nothing more is heard: no "say …"
    }
    // A paused check still hears a correction for a while; then its microphone closes (Send stays).
    clearTimeout(R.micTimer);
    R.micTimer = 0;
    if (R.L && mode === 'paused') {
      R.micTimer = setTimeout(() => {
        if (S.review === R && R.mode === 'paused') reviewPause('paused', { closeMic: true });
      }, REVIEW_MIC_MS);
    }
    if (!S.closed) setVoiceState(R.L && mode !== 'editing' ? 'listening' : 'idle');
    renderReview();
    // v8.1 (A2): a check left paused in a woken session goes back to Standby after a quiet minute (nothing sent).
    if (mode === 'paused' && S.wakeSession && !S.closed) armSleep(SLEEP_IDLE_MS);
  }

  /**
   * Words heard during the check: the countdown waits while the owner talks. The words the
   * recognizer takes back (an empty partial: a noise first heard as "uh") let it go on; so does a
   * turn that never ends in words (no final within the silence window and 1 s after the last ones).
   */
  function reviewPartial(value) {
    const R = S.review;
    if (!R || R.mode === 'editing') return;
    const t = toText(value).trim();
    if (!t) {
      if (R.mode === 'listening') reviewResume(R);
      return;
    }
    setText(reviewHeard, `“${t}”`);
    reviewHeard.hidden = false;
    bumpLevel(0.5 + ((t.length * 7) % 10) / 30);
    if (R.mode !== 'listening') reviewPause('listening');
    clearTimeout(R.listenTimer);
    R.listenTimer = setTimeout(() => {
      if (S.review === R && R.mode === 'listening') reviewResume(R);
    }, reviewListenMs(t));
  }

  /**
   * v7.7 (beta): the home base hears the check's words (no live words: they come once the owner
   * has finished). Talking pauses the countdown until they come (or 7 s at most); a home base that
   * fails mid-check pauses it for good ("Ready when you are"): a "cancel" it never heard must not
   * become a send.
   */
  function reviewHomeBase(L, info) {
    const R = S.review;
    const phase = info && info.phase;
    if (!R || R.L !== L || R.mode === 'editing') {
      if (phase === 'idle' || phase === 'fallback') showHomeBaseMark(null);
      return;
    }
    if (phase === 'listening' || phase === 'speech' || phase === 'sending') {
      showHomeBaseMark(phase);
      if (phase === 'listening') {
        if (R.mode === 'listening' && R.hb) reviewResume(R); // a noise, or no words after all
        R.hb = false;
        return;
      }
      R.hb = true;
      setText(reviewHeard, '…');
      reviewHeard.hidden = false;
      if (R.mode !== 'listening') reviewPause('listening');
      clearTimeout(R.listenTimer);
      R.listenTimer = setTimeout(() => {
        if (S.review === R && R.mode === 'listening') reviewResume(R);
      }, HOME_HEAR_CHECK_MS);
      return;
    }
    if (phase === 'fallback') {
      showHomeBaseMark(null);
      if (R.hb) {
        R.hb = false;
        reviewPause('paused');
        setText(reviewHeard, 'The home base didn’t hear that. Say it again, or tap Send.');
        reviewHeard.hidden = false;
      }
      return;
    }
    if (phase === 'idle') showHomeBaseMark(null);
    if (phase === 'heard') R.hb = false;
  }

  /** The owner said nothing after all: the countdown goes on (or the check waits, when it did). */
  function reviewResume(R) {
    clearTimeout(R.listenTimer);
    R.listenTimer = 0;
    guessHeard(R);
    if (R.paused) reviewPause('paused');
    else reviewCount(REVIEW_MS);
  }

  /** Under a guess, what the owner said for it stays shown ("No, I said Paris"); otherwise nothing. */
  function guessHeard(R) {
    setText(reviewHeard, R.guess ? `“${clip(singleLine(R.guess.said), 140)}”` : '');
    reviewHeard.hidden = !R.guess;
  }

  /** How long the check waits for words it is hearing to end: their silence window (stt.js) and 1 s. */
  function reviewListenMs(text) {
    try {
      const wait = typeof stt.listenWaitMs === 'function' ? stt.listenWaitMs(getS().listenWait) : 1600;
      return (typeof stt.turnSilenceMs === 'function' ? stt.turnSilenceMs(text, wait) : wait + 1000) + 1000;
    } catch {
      return 3600;
    }
  }

  /** What the owner said during the check: cancel, a correction, send, wait, or more words. */
  function reviewFinal(value) {
    const R = S.review;
    if (!R || R.mode === 'editing') return;
    clearTimeout(R.listenTimer);
    R.listenTimer = 0;
    const said = toText(value).trim();
    reviewHeard.hidden = true;
    setText(reviewHeard, '');
    const reply = reviewReply(said, R.text);
    switch (reply.kind) {
      case 'cancel':
        reviewDiscard('voice');
        return;
      case 'send':
        reviewSend('voice');
        return;
      case 'wait':
        guessHeard(R);
        reviewPause('paused');
        announce('Waiting. Say what to change, or tap Send.');
        return;
      case 'filler':
        guessHeard(R);
        if (R.paused) reviewPause('paused');
        else reviewCount(REVIEW_MS);
        return;
      case 'correct': {
        // A fix while a guess is shown corrects the words as they were before the guess.
        const from = R.guess ? R.guess.from : R.text;
        const plan = planCorrection(from, reply.text);
        if (plan.sure) {
          R.guess = null;
          setReviewText(plan.text);
          setText(reviewHint, reviewHintText(R));
          announce(`Corrected: ${clip(singleLine(R.text), 200)}`);
          reviewNote(`Got it: “${clip(singleLine(R.text), 140)}”.`);
          reviewCount(REVIEW_MS);
          return;
        }
        // Jarvis isn't sure where the fix goes (nothing sounds like it, or there are two numbers):
        // the guess is shown and the countdown waits for the owner ("yes", Send, or a tap to fix it).
        R.guess = { from, said };
        setReviewText(plan.text);
        guessHeard(R);
        setText(reviewHint, reviewHintText(R));
        reviewPause('paused');
        announce(`Is that right: ${clip(singleLine(R.text), 200)}? Say yes, or tap the words to fix them.`);
        reviewNote(`Is that right? “${clip(singleLine(R.text), 140)}”`);
        return;
      }
      default:
        R.guess = null;
        setReviewText(addWords(R.text, reply.text));
        setText(reviewHint, reviewHintText(R));
        reviewCount(REVIEW_MS);
    }
  }

  /** The check's recognizer ended (or failed): the check goes on without it. */
  function reviewMicEnded(L) {
    const R = S.review;
    if (!R || R.L !== L) return;
    R.L = null;
    reviewHeard.hidden = true;
    setText(reviewHint, reviewHintText(R));
    if (R.mode === 'listening') {
      if (R.paused) reviewPause('paused');
      else reviewCount(REVIEW_MS);
    } else if (R.mode !== 'editing') {
      setVoiceState('idle');
      renderReview();
    }
  }

  /** Send what was heard now (the countdown ended, Send now, the core, or "send it"). */
  function reviewSend() {
    const R = S.review;
    if (!R || S.closed) return;
    const text = (R.mode === 'editing' ? reviewInput.value : R.text).trim();
    endReview();
    if (!text) {
      goIdle('ready');
      return;
    }
    // v8.1: unchanged words run the action the check showed (it still has to be possible).
    const bound = boundAction(R, text);
    if (bound && act({ ...bound, reading: text }, [text], { reviewed: true })) return;
    // Checked: local commands still come first (a correction may have made it one), then the turn.
    heard(text, [], { reviewed: true });
  }

  /** "Cancel" / "never mind" (or the Cancel button): nothing is sent. */
  function reviewDiscard() {
    if (!endReview()) return;
    play('listen-stop');
    goIdle('discarded');
    reviewNote('Okay, not sent.');
  }

  /** A tap on the words: a field to fix them (the countdown and the microphone stop). */
  function onReviewEdit() {
    const R = S.review;
    if (!R || S.closed || R.mode === 'editing') return;
    haptic('light');
    R.guess = null; // the owner fixes the words themselves
    reviewPause('editing', { closeMic: true });
    reviewInput.value = R.text;
    reviewText.hidden = true;
    reviewForm.hidden = false;
    setText(reviewHint, 'Fix the words, then send.');
    try {
      reviewInput.focus({ preventScroll: true }); // inside the tap: the iPhone keyboard opens
      const n = reviewInput.value.length;
      reviewInput.setSelectionRange(n, n);
    } catch {
      /* ignore */
    }
  }

  /** Escape in the field: keep the words as they are now, without sending. */
  function reviewStopEditing() {
    const R = S.review;
    if (!R || R.mode !== 'editing') return;
    const t = reviewInput.value.trim();
    if (t) setReviewText(t);
    reviewForm.hidden = true;
    reviewText.hidden = false;
    setText(reviewHint, 'Tap Send when you’re ready.');
    reviewPause('paused');
    try {
      reviewNow.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  function onReviewSubmit(event) {
    event.preventDefault();
    reviewSend();
  }

  /** Close the check (its microphone stops). Returns it, or null when there was none. */
  function endReview() {
    const R = S.review;
    if (!R) return null;
    S.review = null;
    clearTimeout(R.timer);
    clearTimeout(R.micTimer);
    clearTimeout(R.listenTimer);
    if (R.frame) cancelAnimationFrame(R.frame);
    R.frame = 0;
    if (R.L) abortHandle(R.L.handle);
    R.L = null;
    const hadFocus = root.contains(document.activeElement) && reviewEl.contains(document.activeElement);
    reviewEl.hidden = true;
    reviewForm.hidden = true;
    reviewHeard.hidden = true;
    captions.hidden = false;
    delete root.dataset.review;
    syncMusicShown();
    if (!S.closed) {
      if (hadFocus) focusDefault();
      renderControls();
    }
    return R;
  }

  /** A line in the viewer covering Voice Mode (a hologram's caption), when one is open: what was heard. */
  function reviewNote(text) {
    if (!viewerOpen() || !visuals || typeof visuals.note !== 'function') return;
    try {
      visuals.note(text, { heard: true });
    } catch {
      /* decoration */
    }
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
    questions.dropUnkept('replaced'); // a new request: a pending "Shall I draw …?" is moot
    clearRetry();
    cancelSpeech();
    stopListening();
    if (S.review) endReview();
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
    clearMusicCard(); // a new question: the last Music card goes (it stays in the chat)
    syncCoreAgents(null);
    if (!isOnline()) {
      // Keep their words so nothing is lost.
      S.typing = true;
      input.value = words;
      goIdle('offline-kept');
      return { error: 'You’re offline. Reconnect and try again.' };
    }
    const pending = { pending: true, preface: takePreface() };
    S.run = pending;
    setVoiceState('thinking');
    setStatus('Thinking…', 'sparkle');
    showCaption('quote', `“${opts && typeof opts.caption === 'string' && opts.caption ? opts.caption : words}”`);
    announce('Jarvis is thinking');
    let result;
    try {
      if (typeof startTurn !== 'function') throw new Error('Voice mode is not connected to Jarvis yet.');
      const input = { mode: opts && MODES.includes(opts.mode) ? opts.mode : resolveMode() };
      if (opts && opts.blueprintFor) input.blueprintFor = opts.blueprintFor;
      // An Optics Look heard here: its frame goes with the words.
      if (opts && Array.isArray(opts.attachments) && opts.attachments.length) input.attachments = opts.attachments;
      if (opts && opts.optics) input.optics = opts.optics;
      if (opts && opts.newChat) input.newChat = true; // the wake routine's briefing: a chat of its own
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
    const R = { run, owned, offs: [], lastAgent: null, announcedMission: '', feed: null, feedTimer: 0, liveDone: false, liveOff: false, answerFrom: -1, answerHeard: false, visuals: new Set(), preface: (pending && pending.preface) || '' };
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
        if (event.segment.kind === 'music' && (R.owned || (R.run.turn && R.run.turn.spoken === true))) showMusicCard(event.segment);
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
    questions.dropUnkept('replaced');
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
   * Show a Music card under the captions. The cards of one reply stack (two find_music picks: a
   * song and an album); `fresh` (a new "play …") clears the last ones first; the same one updates.
   */
  function showMusicCard(seg, { fresh = false } = {}) {
    if (!music || typeof music.card !== 'function' || !seg || typeof seg.id !== 'string' || S.closed) return;
    try {
      if (fresh) clearMusicCard();
      const shown = musicViews.get(seg.id);
      if (shown) {
        shown.update(seg);
      } else {
        const view = music.card(seg);
        if (!view || !view.el) return;
        musicViews.set(seg.id, view);
        musicEl.appendChild(view.el);
        while (musicViews.size > MAX_VOICE_CARDS) dropMusicCard(musicViews.keys().next().value);
      }
      syncMusicShown(); // a smaller core makes room for the cards
      root.dataset.musicCards = String(musicViews.size);
      if (seg.status === 'done' && Array.isArray(seg.items) && seg.items.length) S.noRelisten = true;
    } catch (err) {
      console.warn('[voice] the Music card could not be shown', err);
    }
  }

  function dropMusicCard(segId) {
    const view = musicViews.get(segId);
    musicViews.delete(segId);
    if (!view) return;
    try {
      if (typeof view.destroy === 'function') view.destroy();
    } catch {
      /* ignore */
    }
    if (view.el) view.el.remove();
  }

  function clearMusicCard() {
    for (const id of [...musicViews.keys()]) dropMusicCard(id);
    musicEl.replaceChildren();
    syncMusicShown();
    delete root.dataset.musicCards;
  }

  /**
   * The Music cards show (and the core shrinks for them) unless the 2-second check is on screen: it
   * needs the room, and a preview never plays during it. A question sent from the check clears
   * them (send); a check that ends with nothing sent shows them again.
   */
  function syncMusicShown() {
    const shown = musicViews.size > 0 && !S.review;
    musicEl.hidden = !shown;
    root.classList.toggle('vm--music', shown);
  }

  /** The hint under a shown card, from what it offers: a Preview only for songs that have one. */
  function musicHint() {
    const items = [];
    for (const view of musicViews.values()) {
      const item = typeof view.current === 'function' ? view.current() : null;
      if (item) items.push(item);
    }
    const several = items.length > 1;
    if (items.some((item) => item.type === 'song' && item.previewUrl)) return several ? 'Tap Preview to hear a clip, or the core to talk.' : 'Tap Preview to hear it, or the core to talk.';
    if (items.length) return several ? 'Tap Open in Apple Music to play one, or the core to talk.' : 'Tap Open in Apple Music to play it, or the core to talk.';
    return 'Tap the core to talk.';
  }

  /**
   * Home base (v7.5, free, no turn): "how's the home base?" asks the Jarvis Core's own assistant and
   * Jarvis says its answer. True when the words were a home base command.
   */
  function homeBaseCommand(text) {
    if (!homeBase || typeof homeBase.command !== 'function') return false;
    let res = null;
    try {
      res = homeBase.command(text);
    } catch (err) {
      console.warn('[voice] the home base command failed', err);
      res = null;
    }
    if (!res || !res.handled) return false;
    sayLocal(text, res.done, 'Asking the home base…', 'I couldn’t reach the home base just now.');
    return true;
  }

  /**
   * A free local answer (the home base): the caption, "thinking" until `done` gives { ack }, then
   * said. v7.6: `done` may give { send, mode } instead (the home base couldn't brief: out of reach, a
   * 1.0 Core): those words are asked of Jarvis as before (`newChat`: the wake routine's briefing).
   */
  function sayLocal(text, done, status, failLine, { newChat = false, priceFirst = null } = {}) {
    showCaption('quote', `“${text}”`);
    const marker = { pending: true, viewer: true, homeBase: true };
    S.run = marker;
    setVoiceState('thinking');
    setStatus(status, 'sparkle');
    Promise.resolve(done).then(
      (out) => {
        if (S.closed || S.run !== marker) return;
        S.run = null;
        // MONEY-4: what it falls back to is paid (the briefing protocol): its price is asked first.
        if (out && out.paid === true && typeof out.send === 'string' && out.send.trim() && typeof priceFirst === 'function') {
          priceFirst(out);
          return;
        }
        if (out && typeof out.send === 'string' && out.send.trim()) {
          const sendOpts = { caption: text };
          if (out.mode) sendOpts.mode = out.mode;
          if (newChat) sendOpts.newChat = true;
          const res = send(out.send, sendOpts);
          if (res && res.error) speakAck(res.error);
          return;
        }
        speakAck(out && typeof out.ack === 'string' ? out.ack : '');
      },
      () => {
        if (S.closed || S.run !== marker) return;
        S.run = null;
        speakAck(failLine);
      },
    );
  }

  /**
   * Apple Music (free, no turn): "play Back in Black" finds it and shows the Music card here; Jarvis
   * says one short line ("Here's Back in Black by AC/DC. Tap Open in Apple Music to play it.") and
   * then waits for a tap. "Stop the music" stops a preview. True when the words were a music command.
   * `extra.found`: what was already found for them (the wake routine's offer): no second search.
   */
  function musicCommand(text, extra = null) {
    if (!music || typeof music.command !== 'function') return false;
    let res = null;
    try {
      res = extra ? music.command(text, extra) : music.command(text);
    } catch (err) {
      console.warn('[voice] the music command failed', err);
      res = null;
    }
    if (!res || !res.handled) return false;
    showCaption('quote', `“${text}”`);
    const marker = { pending: true, viewer: true, music: true };
    S.run = marker;
    setVoiceState('thinking');
    setStatus(res.stop ? 'One moment…' : 'Searching Apple Music…', res.stop ? 'sparkle' : 'search');
    Promise.resolve(res.done).then(
      (out) => {
        if (S.closed || S.run !== marker) return;
        S.run = null;
        if (out && out.segment) showMusicCard(out.segment, { fresh: true });
        speakAck(out && typeof out.ack === 'string' ? out.ack : '');
      },
      () => {
        if (S.closed || S.run !== marker) return;
        S.run = null;
        speakAck('I couldn’t reach Apple Music just now.');
      },
    );
    return true;
  }

  /**
   * What the owner said: a local command, an answer, otherwise a turn. `alts`: the recognizer's other
   * readings, tried for the local commands too (the first reading that is a command acts) and for an
   * open hologram's part names. v8.1: the app's router picks the command, in Voice Mode's order
   * (command-router.js TODAY_ORDER.voice): the Standby words, the prompt's and the question's answers,
   * words held while a hologram of the reply builds, then for each reading Screens, the home base,
   * Apple Music (the best reading only), the viewers' words (Optics on top, a blueprint sheet's close
   * words, the hologram, camera words with Optics closed), then Apple Music by another reading. act()
   * carries it out; one that can't after all hands the words to the next in the order. A turn is
   * shown for 2 seconds first (the check) unless it was checked already (opts.reviewed), the owner
   * tapped to send it now (opts.sendNow) or Settings say "Send right away".
   */
  function heard(text, alts = [], opts = {}) {
    const readings = [text];
    for (const a of Array.isArray(alts) ? alts : []) {
      const t = typeof a === 'string' ? a.trim() : '';
      if (t && !readings.some((r) => r.toLowerCase() === t.toLowerCase())) readings.push(t);
    }
    hold.heard(); // the owner's words: a held session's 2 minutes start again
    // Woken from Standby: "wake up, daddy's home" (the greeting), then the answer to its offer.
    if (S.wake && wakeHeard(readings)) return;
    // MAC-R2-3, MAC-R3-3: braked in the background (woken by claps after the brake): free commands are carried out,
    // stops above all; words that would be paid get the brake line again, and nothing is sent.
    const braked = brakedHidden();
    let counted = false;
    const paid = () => {
      if (counted || !opts.counts) return;
      counted = true;
      S.asked += 1;
    };
    const parts = partNamesNow();
    const local = routeLocal(readings, parts);
    let hit = chromeCheckFirst(routeWords(readings, local)); // v8.1 chrome-voice: a check counting was asked last
    // v8.1 chrome-voice: words that aren't a Chrome check's own (cancel, start now, "no, I said …")
    // withdraw it (nothing goes to Chrome), said, and are routed as usual once that is said (ROUTING-R2-5). An answer
    // to Chrome's question is answerPrompt's to weigh: during a check its own words come first (a bare "cancel"
    // withdraws the approval; it is never the prompt's no then).
    if (chromeOtherWords(hit, () => heard(text, alts, opts))) return;
    // A question waiting that doesn't keep goes once other words are heard ("Shall I draw a blueprint
    // of …?": anything but yes or no drops it, and the words are taken as usual). Words for Chrome's question
    // or its check (chrome-prompt) are an answer too, like the prompt's own.
    if (dropsQuestion(hit)) questions.dropTop('dropped');
    while (hit) {
      if (paidHit(hit)) {
        if (braked) break;
        paid();
      }
      if (act(hit, readings, opts)) return;
      hit = routeWords(readings, local, hit);
      chromeOtherWords(hit);
    }
    if (braked) {
      S.wake = null;
      showCaption('quote', `“${text}”`);
      brake();
      return;
    }
    paid(); // a turn
    // A question about the hologram on screen: the reading that names one of its parts.
    const words = pickHeard(text, readings.slice(1), parts);
    if (opts.reviewed || opts.sendNow || !reviewOn()) send(words);
    else startReview(words);
  }

  /**
   * MAC-R3-3: whether carrying out `hit` may cost money, turn the camera on or send the words out (a question in the
   * hidden count, A6; refused while braked in the background): what the router's flags mark (not free, the camera, the
   * check), a Chrome task (asked for or started), the briefing, a home base job (MAC-R4-1: research and a watch run on
   * the owner's key, though the router calls them free; only its results are free), and a question's answer other
   * than no (a price question's "yes" is what pays). "Stop watching" and the other stops are free.
   */
  function paidHit(hit) {
    if (!hit) return true;
    const a = hit.action || {};
    if (a.free === false || a.camera === true || a.check === true) return true;
    if (hit.id === 'chrome-task' || hit.id === 'chrome-ask' || hit.id === 'briefing') return true;
    if (hit.id === 'brain' && a.kind !== 'results') return true;
    if (hit.id === 'question') return !a.dismiss && a.choice !== 'no';
    return false;
  }

  /**
   * Whether words the router gave to `hit` drop the question waiting on top (one that doesn't keep). Not the
   * Standby words, nor an answer: the question's own, the prompt's, Chrome's, or another answer-layer entry's
   * (the research offer's "mission", which waits in the 2-second check: corrected there, "no, I said quick" is
   * still the offer's answer; ROUTING-12). Words held while a reply builds are no answer.
   */
  function dropsQuestion(hit) {
    if (!hit) return true;
    if (hit.id === 'standby' || hit.id === 'question' || hit.id === 'prompt' || hit.id === 'chrome-prompt') return false;
    return !(hit.layer === 'answer' && hit.id !== 'reply-building');
  }

  /** What Voice Mode adds to the router's state (contract (b)): its own part of the moment. */
  function routeLocal(readings, parts = partNamesNow()) {
    return {
      surface: 'voice',
      via: 'voice',
      speaking: !!S.speech,
      check: !!S.review,
      questions: questions.list().map((q) => ({ ...q, askedAt: askedAt.get(`q${q.key}`) || 0 })),
      prompt: chromePromptView(),
      chromeCheck: C.check ? { kind: C.check.kind } : null,
      replying: !!(S.run && S.run.run),
      standby: { available: canStandby(), open: false },
      voiceOpen: true,
      bestNamesPart: namesPart(readings[0], parts),
    };
  }

  function withAsked(p) {
    return p ? { ...p, askedAt: askedAt.get(`p${p.key}`) || 0 } : null;
  }

  /** The router's pick for `readings` (after `after`: the next one in the order), or null: a turn. */
  function routeWords(readings, local, after = null) {
    if (router && typeof router.route === 'function') {
      try {
        return router.route(readings, local, after ? { after } : {}) || null;
      } catch (err) {
        console.warn('[voice] the router failed', err);
        return null;
      }
    }
    // No app router: today's matchers, with what Voice Mode itself knows (Standby, its questions).
    if (!ownRouter) {
      ownRouter = createRouter();
      registerTodayCommands(ownRouter);
    }
    return ownRouter.route(readings, { ...emptyState('voice'), ...local }, after ? { after } : {});
  }

  /**
   * Carry out what the router picked: true when it took the words; false hands them to the next one
   * in the order (it couldn't after all). Today's matchers are carried out here as before; any other
   * goes through its own run() (registered by a src/ui/commands module) and Jarvis says its line.
   */
  function act(hit, readings, opts = {}) {
    const words = hit.reading;
    switch (hit.id) {
      case 'standby':
        // "Jarvis, standby" / "go to sleep": back to Standby, at once and free.
        if (!canStandby()) return false;
        goToStandby(words);
        return true;
      case 'question':
        return answerQuestion(hit, opts);
      case 'prompt':
      case 'chrome-prompt':
        return answerPrompt(hit, readings, opts);
      case 'chrome-task':
      case 'chrome-ask':
      case 'chrome-stop':
      case 'chrome-status':
      case 'chrome-answer':
        return actChrome(hit);
      case 'reply-building':
        // Said while a hologram of the reply builds (the owner tapped the viewer's mic): see below.
        if (!(S.run && S.run.run)) return false;
        heardDuringBuild(readings[0], S.run, readings);
        return true;
      case 'screens':
        // Screens (v7): acts at once (no turn). While a reply streams it waits with the other words
        // (above) and is taken here once the reply has been said.
        return screenCommand(words);
      case 'homebase':
      case 'brain':
        // Home base (v7.5): "how's the home base?" is answered by the Jarvis Core (free: no turn).
        return homeBaseCommand(words);
      case 'music':
        // Apple Music: "play Back in Black" searches at once (free: no turn) and shows the card here.
        return musicCommand(words);
      case 'optics':
      case 'blueprint':
      case 'hologram':
      case 'camera': {
        // A 2D request heard here is cancelled by Stop while its library lookup is still running.
        // With no viewer open, the app may open the hologram shown last for a command about it.
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const res = viewerWords(words, { signal: ctl ? ctl.signal : null, spoken: true });
        if (!(res && res.handled)) return false;
        viewerCommand(words, res, ctl, hit);
        return true;
      }
      case 'voice-controls':
        return voiceControl(hit);
      case 'briefing':
        return askBriefing(hit);
      default:
        return actRouted(hit, opts);
    }
  }

  /**
   * A command registered by a src/ui/commands module: its run() acts, and Jarvis says its line. One
   * whose action has `check` (dear, or carrying the owner's words out) always goes through the
   * 2-second check first, which then runs it (startReview); only a send from the check skips it.
   */
  function actRouted(hit, opts = {}) {
    if (hit.action && hit.action.check && !opts.reviewed) {
      startReview(hit.reading, { action: hit });
      return true;
    }
    if (!router || typeof router.run !== 'function') return false;
    let out;
    try {
      out = router.run(hit, { surface: 'voice', via: 'voice', reading: hit.reading, spoken: true, voice: api });
    } catch (err) {
      console.warn('[voice] the command failed', err);
      out = false;
    }
    if (out === false) return false;
    showCaption('quote', `“${hit.reading}”`);
    const marker = { pending: true, viewer: true, routed: hit.id };
    S.run = marker;
    setVoiceState('thinking');
    setStatus('One moment…', 'sparkle');
    Promise.resolve(out).then(
      (o) => {
        if (S.closed || S.run !== marker) return;
        S.run = null;
        const line = o && typeof o.say === 'string' ? o.say : '';
        // v8.1 (C2): something to look at ("open settings"): the line, then Voice Mode leaves for it.
        if (o && typeof o.leave === 'function') {
          sayThen(line, () => {
            close('command');
            o.leave();
          });
          return;
        }
        speakAck(line);
      },
      () => {
        if (S.closed || S.run !== marker) return;
        S.run = null;
        speakAck('That didn’t work.');
      },
    );
    return true;
  }

  /**
   * v8.1 (C2): Voice Mode's own controls, heard: "stop talking" / "be quiet" ("Okay.", then listening
   * again as after any line), "read the full answer" (the details, read), "repeat that" (the last
   * answer, else the last line, said again), "stop listening" (a woken session goes back to Standby;
   * a tapped one stops and waits for a tap), "exit Voice Mode" (the line, then Voice Mode closes).
   */
  function voiceControl(hit) {
    const a = hit.action || {};
    showCaption('quote', `“${hit.reading}”`);
    const line = (outcome) => appCommandLine(a, outcome);
    switch (a.do) {
      case 'hush':
        chromeOwnerStop(S.speech); // CHROME-VOICE-R3-2: as the dock's Stop: Chrome's question isn't said again by itself
        cancelSpeech();
        speakAck(line());
        return true;
      case 'read-full': {
        const A = S.answer;
        const text = A ? A.full || A.summary : '';
        if (text && S.ttsOk) {
          speak(text, 'full');
          return true;
        }
        if (A && A.full) {
          S.showFull = true;
          renderSpoken(A.full, 'answer');
          finishKaraoke();
          renderReadFull();
          afterSpeech();
          return true;
        }
        speakAck(line({ none: true }));
        return true;
      }
      case 'repeat': {
        const A = S.answer;
        if (A && A.summary && S.ttsOk) speak(A.summary, 'summary');
        else if (S.lastLine && S.ttsOk) speak(S.lastLine, 'ack');
        else speakAck(A && A.summary ? A.summary : S.lastLine || line({ none: true }));
        return true;
      }
      case 'mic-off':
        if (S.wakeSession && canStandby()) {
          S.wake = null;
          S.sleepAfter = true;
          speakAck(line({ woken: true }));
          return true;
        }
        sayThen(line({ woken: false }), () => goIdle('ready'));
        return true;
      case 'exit-voice':
        sayThen(line(), () => close('exit'));
        return true;
      default:
        return false;
    }
  }

  /** v8.1 (SHOULD C5): show a one-tap offer (see api.offer). */
  function showOffer(spec = {}) {
    if (S.closed || !spec || typeof spec.onTap !== 'function') return false;
    clearOffer();
    offerLabel.textContent = String(spec.label || '').slice(0, 80);
    if (spec.testid) offerBtn.setAttribute('data-testid', String(spec.testid));
    offerBtn.hidden = false;
    offer = { onTap: spec.onTap, timer: setTimeout(clearOffer, Number.isFinite(spec.ttlMs) ? spec.ttlMs : 60000) };
    return true;
  }

  function clearOffer() {
    if (offer && offer.timer) clearTimeout(offer.timer);
    offer = null;
    offerBtn.hidden = true;
    offerBtn.setAttribute('data-testid', 'voice-offer');
  }

  /** The offer's tap: inside the gesture, as its button would be (a share picker may open). */
  function takeOffer() {
    const o = offer;
    clearOffer();
    if (!o || S.closed) return;
    try {
      o.onTap();
    } catch (err) {
      console.warn('[voice] the offer failed', err);
    }
  }

  /**
   * v8.1 (SHOULD C6): "brief me" with no home base: the price first, as a question; "yes" sends the
   * briefing protocol as a turn of its own (a new chat, like the wake routine's briefing).
   */
  function askBriefing(hit) {
    showCaption('quote', `“${hit.reading}”`);
    askNew({
      id: 'briefing',
      say: appCommandLine(hit.action),
      match: (text) => {
        const reply = confirmReply(text);
        return reply === 'yes' || reply === 'no' ? reply : null;
      },
      timeoutMs: CONFIRM_MS,
      onAnswer: (choice, { words }) => {
        showCaption('quote', `“${words}”`);
        if (choice !== 'yes') {
          speakAck('Okay, no briefing.');
          return;
        }
        let out = null;
        try {
          out = router && typeof router.run === 'function' ? router.run(hit, { surface: 'voice', voice: api }) : null;
        } catch (err) {
          console.warn('[voice] the briefing could not start', err);
        }
        if (!out || typeof out.send !== 'string' || !out.send.trim()) {
          speakAck('I couldn’t start the briefing.');
          return;
        }
        const res = send(out.send, { caption: words, mode: out.mode, newChat: true });
        if (res && res.error) speakAck(res.error);
      },
    });
    return true;
  }

  /**
   * MONEY-4, MAC-5: a paid briefing the wake routine would start (the briefing protocol, with no home
   * base or one that can't brief) is asked first, as C6's "brief me" is: "Your briefing sends a team of
   * agents to look up the news, about $1.55. Shall I run it?" (`b.usd`: the owner's team size and
   * depth, MONEY-5). Only "yes" sends `b.text`, in a chat of its own; "no" sends nothing.
   */
  function askPaidBriefing(words, b) {
    if (words) showCaption('quote', `“${words}”`);
    // Heard while the routine's listen is still open: it ends here, so the question is said at once.
    if (S.listen) stopListening();
    const usd = Number(b && b.usd);
    askNew({
      id: 'briefing',
      say: appCommandLine(appAction('brief', usd > 0 ? { free: false, usd } : { free: false })),
      match: (text) => {
        const reply = confirmReply(text);
        return reply === 'yes' || reply === 'no' ? reply : null;
      },
      timeoutMs: CONFIRM_MS,
      onAnswer: (choice, { words: answer }) => {
        showCaption('quote', `“${answer}”`);
        if (choice !== 'yes') {
          speakAck('Okay, no briefing.');
          return;
        }
        try {
          if (b && typeof b.sent === 'function') b.sent();
        } catch {
          /* bookkeeping only */
        }
        const res = send(b.text, { mode: b.mode, caption: answer, newChat: true });
        if (res && res.error) speakAck(res.error);
      },
    });
    return true;
  }

  /** Say `line`, then `then()` instead of listening again (also when speech fails, or is off). */
  function sayThen(line, then) {
    const text = String(line || '').trim();
    if (text && S.ttsOk) {
      speak(text, 'ack', 0, { afterLine: then });
      return;
    }
    if (text) {
      renderSpoken(text, 'answer');
      finishKaraoke();
    }
    then();
  }

  /** visuals.command(), quietly (null when there is no viewer bridge or it fails). */
  function viewerWords(words, options) {
    if (!visuals || typeof visuals.command !== 'function') return null;
    try {
      return visuals.command(words, options);
    } catch (err) {
      console.warn('[voice] the viewer could not take that command', err);
      return null;
    }
  }

  /** The open (or last shown) hologram's part names and their other names, for the words heard. */
  function partNamesNow() {
    if (!visuals || typeof visuals.vocabulary !== 'function') return [];
    try {
      const v = visuals.vocabulary();
      return v && Array.isArray(v.parts) ? v.parts.filter((n) => typeof n === 'string' && n.trim()).slice(0, 120) : [];
    } catch {
      return [];
    }
  }

  /** Settings → Voice → After I stop talking: show what was heard for 2 seconds first (the default). */
  function reviewOn() {
    return getS().listenSend !== 'now';
  }

  /**
   * Words heard while a hologram of the streaming reply builds: a viewer command acts on the live
   * model at once (its toast says so; speaking now would cut the reply's own speech). A question,
   * or a 2D request (it needs the finished hologram), waits until the reply has been said.
   */
  function heardDuringBuild(text, R, readings = [text]) {
    let res = null;
    if (viewerOpen()) {
      for (const words of readings) {
        res = viewerWords(words, { spoken: false, later: true });
        if (res && res.handled) break;
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
    if (!words || S.closed || S.run || S.listen || S.review) return false;
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
  function viewerCommand(text, res, ctl = null, hit = null) {
    const cmd = res.command && typeof res.command === 'object' ? res.command : {};
    showCaption('quote', `“${text}”`);
    if (res.done && typeof res.done.then === 'function') {
      // v8.1 (E1, optics): a Look taken by the picture-aside rule says "New look." first: its reply's
      // speech starts with it (a line said now would be cut by the turn the Look starts).
      if (cmd.action === 'optics' && cmd.kind === 'look' && typeof cmd.ack === 'string' && cmd.ack.trim()) S.preface = { text: clip(singleLine(cmd.ack), 60), at: Date.now() };
      waitForBlueprint(res.done, cmd, ctl);
      return;
    }
    // v8.1 C3: "go back" with the hologram on screen and no sheet over it is answered, not swallowed.
    if (hit && hit.id === 'hologram' && cmd.action === 'close-blueprint') {
      speakAck(nothingBackAck());
      return;
    }
    // v8.1 R10: a part took camera words ("open the camera" on a laptop): say how to reach the camera.
    speakAck([commandAck(cmd), partHint(text, cmd)].filter(Boolean).join(' '));
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
      askBlueprint(o.confirm, cmd);
      return;
    }
    if (o.error) speakAck(asSentence(clip(singleLine(o.error), 220)));
    // What happened, said (Optics' live view started by voice: "Live view on…", or the pause at the limit).
    else if (typeof o.ack === 'string' && o.ack.trim()) speakAck(clip(singleLine(o.ack), 220));
    else speakAck(o.opened ? savedBlueprintAck(cmd) : '');
  }

  /**
   * v8.0 Optics' live view: a line Jarvis says by himself ("That's a Duracell AA"), only while Voice
   * Mode is free: no turn, no speech, no 2-second check or question waiting, the wake routine over,
   * and no words heard. A listen the owner opened (a tap, or any listen with Continuous off, which
   * only a tap or a question of Jarvis's opens) is theirs: the line is only shown, so their question
   * is never lost. Continuous's own listen that has heard nothing yet is put aside for the line (the
   * microphone never hears Jarvis) and listening starts again after it. True when said.
   */
  function sayLine(text) {
    const line = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (S.closed || !line || !S.ttsOk) return false;
    if (S.run || S.speech || S.review || questions.size() || prompts.current() || S.wake || S.mic || C.check) return false;
    const L = S.listen;
    if (L && (L.gesture || L.owner || !S.continuous)) return false; // (owner: a barge-in's listen, v8.1.1)
    if (L && (L.text || L.heard || L.duringBuild || (L.hb && L.hb !== 'listening'))) return false;
    if (L) stopListening();
    clearRetry();
    speakAck(line);
    return true;
  }

  /** Say a short line (shown in the captions too), then listen again when Continuous is on. */
  function speakAck(text) {
    if (S.closed) return;
    const line = String(text || '').trim();
    if (line) S.lastLine = line; // v8.1: "repeat that" with no answer yet says the last line again
    // v8.1: a word that moved a walkthrough on ("next", "enclosed", "repeat" at its question) has no
    // line of its own: the step (or the question) being said is it, so that speech goes on undisturbed.
    if (!line && S.speech && (S.speech.kind === 'tour' || S.speech.kind === 'ack')) {
      setVoiceState('speaking');
      setStatus('Speaking', 'speaker');
      renderControls();
      return;
    }
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
    if (S.run && S.run.viewer) S.run = null; // "blueprint the …" (or an Optics Look) was waiting for this turn
    return send(text, { mode: o.mode, blueprintFor: o.blueprintFor || null, attachments: Array.isArray(o.attachments) ? o.attachments : null, optics: o.optics || null });
  }

  // ===================================================================== v8.1 seams (contract (a))

  /** "Shall I draw a blueprint of …?" (v6), on the question stack: yes builds it, no drops it. */
  function askBlueprint(confirm, cmd) {
    askNew({
      id: 'blueprint',
      say: blueprintQuestion(confirm),
      match: (text) => {
        const reply = confirmReply(text);
        return reply === 'yes' || reply === 'no' ? reply : null;
      },
      timeoutMs: CONFIRM_MS,
      onAnswer: (choice, { words }) => {
        if (choice === 'yes') {
          confirmBlueprint(words, { proceed: confirm.proceed, cmd });
          return;
        }
        showCaption('quote', `“${words}”`);
        speakAck('Okay, no blueprint.');
      },
    });
  }

  /** api.question(): a new question on top of the stack (see the api). */
  function askNew(spec) {
    if (S.closed || !spec || typeof spec !== 'object') return { cancel: () => false, answer: () => false };
    return questions.push(spec);
  }

  /** api.prompt(): the standing prompt, one at a time (see the api). */
  function openPrompt(spec) {
    if (S.closed || !spec || typeof spec !== 'object') return { update: () => false, close: () => false };
    // v8.1 chrome-voice: what to say to it (a bare "yes" never answers it: Jarvis says this instead).
    C.hint = typeof spec.hint === 'string' ? spec.hint.slice(0, 200) : '';
    const handle = prompts.open(spec);
    promptPump();
    return handle;
  }

  /**
   * Voice Mode can say a line now: no turn, no speech, no check, no routine, and no listen of the
   * owner's (a tap's, or any with Continuous off) or with words heard (sayLine()'s rule, v8.0).
   */
  function canSayNow() {
    if (S.closed || S.run || S.speech || S.review || S.wake || S.mic || C.check) return false;
    const L = S.listen;
    if (L && (L.gesture || L.owner || !S.continuous)) return false; // (owner: a barge-in's listen, CHROME-VOICE-R2-1)
    return !(L && (L.text || L.heard || L.duringBuild || (L.hb && L.hb !== 'listening')));
  }

  /** Say a question's (or the prompt's) line: a listen that has heard nothing yet is put aside for it. */
  function sayAsked(line) {
    if (S.listen) stopListening();
    clearRetry();
    speakAck(line);
  }

  /**
   * A question to say (the stack's onAsk, and the prompt's): a new one at once when Voice Mode is
   * free; otherwise, and for one asked again (the one over it is done), once Voice Mode is free.
   */
  function askQuestion(q, again) {
    if (S.closed || !q || !q.say) return;
    const isPrompt = !!q.answers;
    askedAt.set(`${isPrompt ? 'p' : 'q'}${q.key}`, ++askSeq);
    if (!again && canSayNow()) {
      if (isPrompt) sayPrompt(q);
      else sayAsked(q.say);
      return;
    }
    if (isPrompt) {
      // v8.1 chrome-voice: the prompt waits in its own slot; a question waiting too never takes its place.
      C.pendingPrompt = q;
      promptPump();
      return;
    }
    S.pendingAsk = { q, isPrompt };
    setTimeout(() => {
      if (S.pendingAsk && S.pendingAsk.q === q && canSayNow()) sayPendingAsk();
    }, 0);
  }

  /** The question (or prompt) waiting to be said, if it is still open: true when it is said now. */
  function sayPendingAsk() {
    const pending = S.pendingAsk;
    if (C.check) return false; // v8.1 chrome-voice: never over a Chrome check; it is said after it
    S.pendingAsk = null;
    if (!pending || S.closed) return false;
    const { q, isPrompt } = pending;
    const open = isPrompt ? (prompts.current() || {}).key === q.key : questions.list().some((x) => x.key === q.key);
    if (!open) return false;
    if (isPrompt) {
      if (greetedPrompt(q)) return false; // the wake greeting has just said it
      sayPrompt(q);
    } else sayAsked(q.say);
    return true;
  }

  /** The top question answered by voice: consumed (its onAnswer runs); with `check`, after the check. */
  function answerQuestion(hit, opts = {}) {
    const top = questions.top();
    if (!top || top.id !== hit.action.question) return false;
    if (hit.action.dismiss) {
      // v8.1: a bare "cancel" or "no" to the question asked last, with no choice of its own for it:
      // the question goes (onExpire('dismissed')), the one under it is asked again.
      showCaption('quote', `“${hit.reading}”`);
      questions.dismissTop('dismissed');
      if (!S.speech && !S.pendingAsk) speakAck('Okay.');
      return true;
    }
    if (top.check && !opts.reviewed) {
      startReview(hit.reading, { action: hit });
      return true;
    }
    return questions.answer(top.id, hit.action.choice, { words: hit.reading, via: 'voice' });
  }

  // answerPrompt(): see "v8.1 Jarvis for Chrome by voice" below.

  /** api.narrate(): a tour's words, spoken as kind 'tour' with its chunk events (see the api). */
  function narrate(spec = {}) {
    const o = spec && typeof spec === 'object' ? spec : {};
    const text = String(o.text ?? '');
    const kind = typeof o.kind === 'string' && o.kind ? o.kind : 'tour';
    const onEnd = typeof o.onEnd === 'function' ? o.onEnd : null;
    if (S.closed || !text.trim() || !S.ttsOk) {
      if (onEnd) setTimeout(() => callQuietly(() => onEnd(S.closed ? 'cancelled' : 'failed')), 0);
      return { cancel: () => false };
    }
    const listenAfter = o.listenAfter === false || (o.listenAfter && typeof o.listenAfter === 'object') ? o.listenAfter : null;
    clearRetry();
    if (S.listen) stopListening();
    speak(text, kind, 0, { onChunk: typeof o.onChunk === 'function' ? o.onChunk : null, onEnd, listenAfter });
    const sp = S.speech;
    // Which voice says it: the narrator's fallbacks differ (George 4 s; the device voice 1.5 s with
    // start events, else its 3 s assumption: src/lib/tour.js voicePacing).
    const voice = narrationVoice();
    if (sp) {
      sp.voice = voice;
      sp.begunAt = Date.now();
    }
    return {
      voice,
      cancel() {
        if (!sp || S.speech !== sp) return false;
        cancelSpeech();
        if (!S.closed && !S.run && !S.listen && !S.review) goIdle('keep');
        return true;
      },
    };
  }

  /** The voice a narration started with: { kind: 'george' } or { kind: 'device', startEvents }. */
  function narrationVoice() {
    let engine = null;
    try {
      // The voice router reports the device voice at once; George's stream may still wait for him.
      if (typeof tts.voiceNow !== 'function') return { kind: 'device', startEvents: deviceStartEvents };
      engine = tts.voiceNow() || (typeof tts.activeEngine === 'function' ? tts.activeEngine() : null);
    } catch {
      engine = 'device';
    }
    return engine === 'device' ? { kind: 'device', startEvents: deviceStartEvents } : { kind: 'george' };
  }

  /** A walkthrough's decision waits on top of the questions: Voice Mode keeps listening for its answer. */
  function decisionWaits() {
    const q = questions.top();
    return !!(q && q.keep && String(q.id || '').startsWith('tour:'));
  }

  /** A narration ended (once): its onEnd(reason). */
  function endNarration(sp, reason) {
    if (!sp || !sp.onEnd || sp.ended) return;
    sp.ended = true;
    const fn = sp.onEnd;
    callQuietly(() => fn(reason));
  }

  /** api.hold(): a woken session stays out of Standby while held (at most 2 minutes after the owner's last words). */
  function holdSession(reason) {
    if (!S.closed) hold.hold(reason);
  }

  /** api.release(): once nothing holds it, the usual return to Standby applies again. */
  function releaseSession(reason) {
    if (hold.release(reason) && !S.closed && S.wakeSession && S.sleepTimer) armSleep(S.idleReason === 'silent' ? SLEEP_SILENT_MS : SLEEP_IDLE_MS);
  }


  // ================================================== v8.1 Jarvis for Chrome by voice (chrome-voice)
  // The prompt channel's internals (contract (a) api.prompt; brief G5) and the spoken check (G4; the
  // lead's decision D2). src/ui/chrome-task.js drives them through api.prompt and api.chrome.
  //   - A prompt is said once Voice Mode is free (askQuestion → sayPrompt). It waits in its own slot
  //     (C.pendingPrompt): an owner question waiting beside it is said too, first, and never takes its place.
  //     One listen follows it only when this session would listen anyway (Continuous on, no brake, not a
  //     hidden idle session; rule 4: never because the extension said so); otherwise "Tap me to answer.", and
  //     its 30 s start at the owner's next listen. Said to the end, it opens the 30-second window for a yes;
  //     cut short (barge-in, a tap, Stop), it is said again first. A prompt the wake greeting said ("Chrome is
  //     waiting for you: …") counts as said there.
  //   - Its answers (the router's 'prompt' and 'chrome-prompt'): a no acts at once. A yes counts
  //     only from the best reading, within the window, and when no other reading is a no, cancel or
  //     stop word (else Jarvis says why and asks again); then the check ("Approving: … · say cancel"),
  //     and only then onAnswer, which sends it with the prompt's hash.
  //   - The spoken check (a task's "Chrome, up to a dollar: … Say cancel to stop.", or a yes's): said,
  //     then 2 s (5 s while Jarvis is hidden) with the microphone open. Only a line said in full counts
  //     down: Stop or a tap while it is said (or counting) withdraws it at once, and a barge-in leaves it
  //     to the owner's words (silence withdraws it; "okay" has the line said again). Talking pauses it,
  //     also when the home base hears the owner (no live words there); "cancel", "no" or "stop" withdraws
  //     it (before the prompt's own words: never the prompt's no then), and "stop" also stops a task that
  //     runs; any other reading that is a no withdraws it too; "no, I said …" withdraws it and routes the
  //     new words (a task's as a Chrome task); "yes" or "okay" lets it count on; other words withdraw it;
  //     "start now" lets it go. Nothing goes to Chrome before it ends, and closing Voice Mode withdraws it.

  /**
   * Words heard during a check that no answer layer took for Chrome (`hit`: the router's pick, or null)
   * withdraw it: nothing goes to Chrome. Answers ('prompt', 'chrome-prompt') are answerPrompt's to weigh.
   * With `then` (spoken words, ROUTING-R2-5): never silently: "Okay, nothing sent to Chrome." is said first, and
   * then() routes the words once it is said (true: they wait for it); a tap or a barge-in over it drops them.
   */
  function chromeOtherWords(hit, then = null) {
    const K = C.check;
    if (!K || (hit && (hit.id === 'prompt' || hit.id === 'chrome-prompt'))) return false;
    withdrawCheck(K, 'other');
    if (typeof then !== 'function' || S.closed) return false;
    const line = String(K.spec.cancelLine || 'Okay.');
    showCaption('hint', '');
    if (!S.ttsOk) {
      showCaption('hint', line);
      return false;
    }
    speak(line, 'ack', 0, { onEnd: (how) => (how === 'done' || how === 'failed') && !S.closed && then(), listenAfter: false });
    return true;
  }

  /**
   * A Chrome check counting down was asked last ("… Say cancel to stop."): a bare "cancel" or "no" is its own,
   * never an owner question's under it (a walkthrough's decision stays and keeps waiting; ROUTING-1). The router asks
   * the questions first in the answer layer; this hands such words to the check.
   */
  function chromeCheckFirst(hit) {
    if (!C.check || !hit || hit.id !== 'question') return hit;
    const own = matchChromeAnswer(hit.reading, { chromeCheck: { kind: C.check.kind } });
    return own && own.how === 'withdraw' ? { ...hit, id: 'chrome-prompt', action: own } : hit;
  }

  /** The open prompt as the router sees it (state.prompt): its answers, when it was asked (voice's order) and said. */
  function chromePromptView() {
    const p = withAsked(prompts.current());
    return p ? { ...p, chrome: true, saidAt: C.saidKey === p.key ? C.saidAt : 0 } : null;
  }

  /**
   * A prompt waiting to be said (askQuestion put it aside: Voice Mode was busy) is said as soon as Voice
   * Mode is free, also when nothing else is spoken first (a listen of the owner's that ends in silence).
   */
  function promptPump() {
    if (C.pump) return;
    C.pump = setInterval(() => {
      if (S.closed || !prompts.current()) {
        clearInterval(C.pump);
        C.pump = 0;
        C.pendingPrompt = null;
        return;
      }
      if (!C.pendingPrompt || !canSayNow()) return;
      // A question waiting beside it is said first; the prompt follows once that is said (afterSpeech).
      if (S.pendingAsk && sayPendingAsk()) return;
      sayPendingPrompt();
    }, 400);
  }

  /** The prompt waiting in its own slot, if it is still open: true when it is said now. */
  function sayPendingPrompt() {
    const q = C.pendingPrompt;
    if (!q || S.closed || C.check) return false; // never over a Chrome check; it is said after it
    if (C.hushKey && C.hushKey === q.key) return false; // the owner pressed Stop: it waits for their next listen
    C.pendingPrompt = null;
    if ((prompts.current() || {}).key !== q.key) return false;
    if (greetedPrompt(q)) return false; // the wake greeting has just said it
    sayPrompt(q);
    return true;
  }

  /**
   * Whether a line from Chrome (its question, its news) may open the microphone after it: only when this
   * session would listen anyway (rule 4: never because the extension said so; PRIVACY-1).
   *   'listen'    Continuous on, the brake not said, and not a hidden session whose follow-up window is over
   *               (nor one deaf in the background)
   *   'withheld'  no listen: the owner answers after a tap ("Tap me to answer.")
   *   'none'      no microphone here at all (typing, no recognizer): nothing to withhold
   */
  function chromeListenRule() {
    if (!S.sttOk || S.typing || S.sttBlocked) return 'none';
    if (!S.continuous || S.braked) return 'withheld';
    if (document.hidden && (C.hiddenIdle || S.deaf)) return 'withheld';
    return 'listen';
  }

  /**
   * Say the prompt (`before`: a line first, said with it). One listen for its answer after it, when this session
   * would listen anyway (a prompt a yes can be said to: its 30-s window; a click-only one: today's rule).
   * Otherwise "Tap me to answer.", no listen, and its 30 s start at the owner's next listen (PRIVACY-1).
   */
  function sayPrompt(p, before = '') {
    if (S.listen) stopListening();
    clearRetry();
    askedAt.set(`p${p.key}`, ++askSeq); // asked again now (a bare "cancel" or "no" is its if it was asked last)
    C.saidKey = p.key;
    C.saidAt = 0; // the window opens when this saying ends
    C.unheard = 0;
    if (C.pendingPrompt && C.pendingPrompt.key === p.key) C.pendingPrompt = null; // said now: not again from its slot
    const saying = ++C.sayings; // (an older saying it replaces ends 'cancelled': that one isn't cut short)
    const yes = Array.isArray(p.answers) && p.answers.some((a) => a && a.check);
    const rule = chromeListenRule();
    const tail = rule === 'withheld' && yes ? ' Tap me to answer.' : '';
    const line = `${before ? `${before} ${p.say}` : p.say}${tail}`;
    if (!S.ttsOk) {
      // No voice here: shown is all there is, so it counts as said.
      renderSpoken(line, 'answer');
      finishKaraoke();
      C.saidAt = Date.now();
      afterSpeech();
      return;
    }
    const listenAfter = rule !== 'listen' ? false : yes ? { noSpeechMs: ANSWER_WINDOW_MS } : null;
    const spoken = (how) => {
      if (how === 'done' || how === 'failed') C.voiceAt = Date.now(); // MAC-R5-1: its voice window (isActive) starts
      promptSpoken(p, how, rule === 'withheld', saying);
    };
    speak(line, 'ack', 0, { onEnd: spoken, listenAfter });
    C.sayingSp = S.speech; // (the dock's Stop knows its own saying: CHROME-VOICE-R2-2)
  }

  function promptSpoken(p, how, unheard = false, saying = C.sayings) {
    const cur = prompts.current();
    if (!cur || cur.key !== p.key || saying !== C.sayings) return;
    if (how === 'done' || how === 'failed') {
      // Said in full (or the voice failed: shown is all there is). With no listen after it, its 30 s start when
      // the owner next listens (chromeListens).
      if (unheard) C.unheard = p.key;
      else C.saidAt = Date.now();
    } else if (C.stopped !== saying) askQuestion(cur, true); // cut short (a barge-in, a tap): said again once the owner's listen has ended
    // (Cut by the dock's Stop, CHROME-VOICE-R2-2: Jarvis stays quiet. It stays open on its card, not heard in full: a yes
    // has it said again first ('unsaid'), and the wake greeting or "what does Chrome want?" say it.)
  }

  /**
   * The dock's Stop while Jarvis speaks (CHROME-VOICE-R2-2), or "be quiet" (R3-2): Chrome's question being said is not
   * said again by itself, and one waiting to be said (a re-ask after a cut too) waits for the owner's next tap or
   * barge-in listen.
   */
  function chromeOwnerStop(sp) {
    if (sp && sp === C.sayingSp) C.stopped = C.sayings;
    C.hushKey = C.pendingPrompt ? C.pendingPrompt.key : 0;
  }

  /** The wake greeting said this prompt to the end just now: it counts as said (and isn't said twice). */
  function greetedPrompt(p) {
    const g = C.greeting;
    const done = C.lastDone;
    if (!g || g.id !== p.id || !done || Date.now() - done.at > 3000 || !done.text.includes(g.line)) return false;
    C.greeting = null;
    askedAt.set(`p${p.key}`, ++askSeq);
    C.saidKey = p.key;
    C.saidAt = done.at;
    return true;
  }

  /**
   * The open prompt answered by voice (router ids 'prompt' and 'chrome-prompt'), a word for the check
   * that counts down, or a bare yes (the hint: what to say). True when the words were taken.
   */
  function answerPrompt(hit, readings = [hit.reading], opts = {}) {
    let a = hit.action || {};
    // While a check counts down, its own words come first ("cancel" withdraws the check, never a no
    // to the prompt the router's 'prompt' would make of it).
    if (C.check && a.do !== 'chrome-check') {
      const own = matchChromeAnswer(hit.reading, { chromeCheck: { kind: C.check.kind } }, readings);
      if (own) a = own;
    }
    if (a.do === 'chrome-check') return checkWords(a, readings, hit.reading);
    if (a.do === 'chrome-hint') {
      // A bare "yes" (or "okay", "continue") never answers Chrome: Jarvis says what does.
      if (!prompts.current() || !C.hint) return false;
      showCaption('quote', `“${hit.reading}”`);
      speakAck(C.hint);
      return true;
    }
    const p = prompts.current();
    if (!p) return false;
    const answerId = a.do === 'prompt-answer' ? (a.prompt === p.id ? a.answer : null) : a.answer;
    const answer = (Array.isArray(p.answers) ? p.answers : []).find((x) => x && x.id === answerId);
    if (!answer) return false;
    showCaption('quote', `“${hit.reading}”`);
    const words = hit.reading;
    if (!answer.check) {
      prompts.answer(p.id, answer.id, { words, via: 'voice' });
      if (!S.speech && !S.closed && !C.check) goIdle('ready');
      return true;
    }
    // A yes: only from the best reading (the router never takes it from another), in the window, and
    // when no other reading is a no; then the check.
    // (The router matched these words to this answer: they count as its words here too, whatever fillers.)
    const asMatched = { ...answer, words: [...(Array.isArray(answer.words) ? answer.words : []), words] };
    const verdict = chooseAnswer({ readings: [words, ...readings.filter((r) => r !== words)], answers: [asMatched], saidAt: C.saidKey === p.key && C.saidAt ? C.saidAt : null, now: Date.now() });
    if (!verdict) return false;
    if (verdict.again) {
      sayPrompt(p, againLine(verdict.again));
      return true;
    }
    const lines = answer.check && typeof answer.check === 'object' ? answer.check : {};
    startCheck({
      kind: 'approve',
      show: lines.show || 'Approving · say cancel',
      say: lines.say || 'Approving. Say cancel to stop.',
      cancelLine: WITHDRAWN_LINE,
      onGo: () => {
        const now = prompts.current();
        if (now && now.key === p.key) prompts.answer(p.id, answer.id, { words, via: 'voice' });
      },
      // "Stop" or "stop Chrome" during it: not approved, and the task waiting on this prompt stops too.
      onStop: () => {
        const now = prompts.current();
        const stop = now && now.key === p.key ? (Array.isArray(now.answers) ? now.answers : []).find((x) => x && x.stopTask) : null;
        return !!stop && prompts.answer(p.id, stop.id, { words, via: 'voice', quiet: true });
      },
    });
    return true;
  }

  /**
   * Words heard while a check counts down (matchChromeAnswer's 'chrome-check'). `readings`: all of them;
   * `best`: the one the router took. Any other reading that is a no withdraws it (a "no" heard as "go").
   */
  function checkWords(a, readings, best = '') {
    const K = C.check;
    if (!K) return false;
    const others = (Array.isArray(readings) ? readings : []).filter((r) => typeof r === 'string' && r !== best);
    if ((a.how === 'go' || a.how === 'keep') && others.some((r) => isNoWord(r))) {
      withdrawCheck(K, 'voice');
      return true;
    }
    if ((a.how === 'go' || a.how === 'keep') && K.interrupted) {
      // The line was cut short (a barge-in): the price may not have been heard. It is said again in full first.
      sayCheck(K);
      return true;
    }
    if (a.how === 'go') {
      goCheck(K);
      return true;
    }
    if (a.how === 'keep') {
      // "Yes", "okay", "thanks": it counts on, the full time again, with the microphone open for a
      // "cancel" (nothing goes sooner, and the words are never Claude's).
      countCheck(K);
      // (Once this recognizer has stopped: finishListening ends it after heard() returns.)
      clearRetry();
      S.retryTimer = setTimeout(() => {
        S.retryTimer = 0;
        if (C.check === K && !S.closed && !S.listen && !S.speech && !S.run && S.sttOk && !S.typing) startListening({ keepAnswer: true, noSpeechMs: K.ms + 2000, oneTry: true });
      }, RELISTEN_DELAY_MS);
      return true;
    }
    if (a.how === 'withdraw') {
      // "Stop" (not "cancel" or "no") while a task runs or waits: that task stops too (REDTEAM-VOICE-4).
      let stopping = false;
      if (a.stop && typeof K.spec.onStop === 'function') {
        try {
          stopping = !!K.spec.onStop();
        } catch {
          stopping = false;
        }
      }
      if (!stopping) {
        withdrawCheck(K, 'voice');
        return true;
      }
      withdrawCheck(K, 'stopped');
      if (!S.closed) speakAck(`${K.kind === 'task' ? 'Okay, nothing sent.' : WITHDRAWN_LINE} Chrome is stopping.`);
      return true;
    }
    // "No, I said …": the check goes, and the corrected words are routed again from the top (D2). A task's
    // stay a Chrome task ("no, I said find a 5K monitor" keeps its "in Chrome"), unless they name one of
    // Jarvis's own things or are a question without page words (REDTEAM-VOICE-12).
    withdrawCheck(K, 'corrected');
    if (!a.words) return true;
    if (K.kind === 'task') {
      const words = String(a.words).trim().replace(/[.!?]+$/, '');
      const carried = /\b(?:in|on|using) (?:google )?chrome$/i.test(words) || /^in (?:google )?chrome\b/i.test(words) ? words : `${words} in Chrome`;
      const local = routeLocal([carried]);
      const hit = routeWords([carried], local);
      if (hit && hit.id === 'chrome-task' && act(hit, [carried])) return true;
    }
    heard(a.words, []);
    return true;
  }

  /**
   * The spoken check (api.chrome.check): `say` is said and `show` shown; once said in full, it counts 2 s
   * (5 s while Jarvis is hidden) with one listen open, then onGo(). Never two at once (a new one withdraws
   * the old one). spec: { kind, show, say, cancelLine, onGo, onCancel(how), onCount(ms), onStop() → true when
   * a task that runs is being stopped } -> { cancel(), go() }
   */
  function startCheck(spec = {}) {
    const o = spec && typeof spec === 'object' ? spec : {};
    if (S.closed) {
      callQuietly(() => o.onCancel && o.onCancel('closed'));
      return { cancel: () => false, go: () => false };
    }
    if (C.check) withdrawCheck(C.check, 'replaced');
    const K = { kind: o.kind === 'approve' ? 'approve' : 'task', phase: 'saying', timer: 0, until: 0, ms: 0, interrupted: false, spec: o, sp: null, hb: false, hbTimer: 0 };
    C.check = K;
    clearRetry();
    if (S.listen) stopListening();
    sayCheck(K);
    return {
      cancel: () => {
        if (C.check !== K) return false;
        endCheck();
        if (S.speech) cancelSpeech();
        if (!S.closed && !S.listen && !S.run) goIdle('ready');
        return true;
      },
      go: () => (C.check === K ? (goCheck(K), true) : false),
    };
  }

  /** Say the check's line (again); only once it is said in full does it count down (REDTEAM-VOICE-1). */
  function sayCheck(K) {
    if (C.check !== K || S.closed) return;
    clearTimeout(K.timer);
    K.timer = 0;
    K.phase = 'saying';
    K.interrupted = false;
    K.sp = null;
    const say = String(K.spec.say || '').trim();
    if (!say || !S.ttsOk) {
      countCheck(K); // no voice here: the card and the caption show the check
      return;
    }
    if (S.listen) stopListening();
    speak(say, 'ack', 0, { onEnd: (how) => checkLineEnded(K, how), listenAfter: { noSpeechMs: TASK_CHECK_HIDDEN_MS + 2000 } });
    if (C.check === K && S.speech && S.speech.onEnd) K.sp = S.speech;
  }

  /**
   * The check's line ended. Said in full: it counts down. The voice failing before a word came out: the card
   * and the caption are the check, and it counts. Cut short (Stop, a tap, a barge-in, another line): it never
   * counts down. With a listen open (a barge-in) the owner's words decide and silence withdraws it; with
   * none, it is withdrawn now ("Okay, nothing sent to Chrome.").
   */
  function checkLineEnded(K, how) {
    if (C.check !== K) return;
    if (how === 'done' || (how === 'failed' && !(K.sp && K.sp.started))) {
      countCheck(K);
      return;
    }
    K.phase = 'paused';
    K.interrupted = true;
    clearTimeout(K.timer);
    K.timer = 0;
    if (!S.listen) withdrawCheck(K, 'voice');
  }

  /**
   * Stop or a tap (the dock's main button, the core, Space) while a Chrome check is said or counts down:
   * withdrawn at once, said ("Okay, nothing sent to Chrome." / "Okay, not approved."). Words being heard
   * decide instead (the tap sends them). True when it acted.
   */
  function chromeStop() {
    const K = C.check;
    if (!K || S.closed) return false;
    const L = S.listen;
    if (L && (L.text || L.hb === 'speech' || L.hb === 'sending')) return false;
    if (L) stopListening();
    withdrawCheck(K, 'voice');
    return true;
  }

  /** A listen starts: a prompt said with no listen after it counts as asked from now (its 30 s; PRIVACY-1). */
  function chromeListens(L) {
    if (L && L.gesture) C.hiddenIdle = false;
    // A prompt held by the dock's Stop (or "be quiet") is said once the owner's next listen is over: a tap's or a
    // barge-in's, never Continuous's own (CHROME-VOICE-R2-2, R3-2).
    if (L && (L.gesture || L.owner)) C.hushKey = 0;
    const p = prompts.current();
    if (C.unheard && p && p.key === C.unheard) {
      C.saidKey = p.key;
      C.saidAt = Date.now();
    }
    C.unheard = 0;
  }

  /** Hidden while nothing is under way: the owner's follow-up window is over (PRIVACY-1). On screen: it isn't. */
  function chromeVisibility() {
    if (!document.hidden) C.hiddenIdle = false;
    else if (!S.listen && !S.speech && !S.run && !S.review && !S.retryTimer && !S.wake && !C.check) C.hiddenIdle = true;
  }

  /**
   * The home base hears this listen (no live words: Whisper hears whole utterances, so there are no
   * partials). While a Chrome check counts down, its 'speech' and 'sending' pause it as words heard do
   * (VT-MISSED-1); 'listening' again with no words lets it go on (or withdraws one cut short). Words that
   * never come within HOME_HEAR_CHECK_MS, or a home base that fails while the owner talked, withdraw it: a
   * "cancel" it never delivered must not become a send.
   */
  function chromeHomeBase(phase) {
    const K = C.check;
    if (!K || S.closed) return;
    if (phase === 'speech' || phase === 'sending') {
      if (K.phase === 'counting') {
        clearTimeout(K.timer);
        K.timer = 0;
        K.phase = 'paused';
      }
      K.hb = true;
      clearTimeout(K.hbTimer);
      K.hbTimer = setTimeout(() => {
        K.hbTimer = 0;
        if (C.check === K && K.hb) withdrawCheck(K, 'voice');
      }, HOME_HEAR_CHECK_MS);
      return;
    }
    if (!K.hb) return;
    if (phase === 'listening' || phase === 'idle') {
      // No words after all (a cough, the room): the full time again, or withdrawn when the line was cut short.
      K.hb = false;
      clearTimeout(K.hbTimer);
      K.hbTimer = 0;
      if (K.phase !== 'paused') return;
      if (K.interrupted) withdrawCheck(K, 'voice');
      else countCheck(K);
      return;
    }
    if (phase === 'fallback') {
      // This device's recognizer takes over and the owner is asked to say it again: it stays paused, and
      // silence now withdraws it.
      K.hb = false;
      clearTimeout(K.hbTimer);
      K.hbTimer = 0;
      K.interrupted = true;
    }
  }

  /** Count the check down: 2 s after it was said, or 5 s while Jarvis is hidden. */
  function countCheck(K) {
    if (C.check !== K || S.closed) return;
    clearTimeout(K.timer);
    K.hb = false;
    clearTimeout(K.hbTimer);
    K.hbTimer = 0;
    K.phase = 'counting';
    K.ms = document.hidden ? TASK_CHECK_HIDDEN_MS : TASK_CHECK_MS;
    K.until = Date.now() + K.ms;
    K.timer = setTimeout(() => goCheck(K), K.ms);
    showCaption('hint', String(K.spec.show || K.spec.say || ''));
    setStatus(K.kind === 'task' ? 'Starting soon…' : 'Approving…', 'send');
    callQuietly(() => K.spec.onCount && K.spec.onCount(K.ms));
  }

  /** The owner talks during a check (text), or the words were taken back or never came (''). True when the check took it. */
  function chromeHeard(text) {
    const K = C.check;
    if (!K) return false;
    if (text) {
      if (K.phase === 'counting') {
        clearTimeout(K.timer);
        K.timer = 0;
        K.phase = 'paused';
      }
      return true;
    }
    if (K.phase !== 'paused') return K.phase === 'counting';
    if (K.interrupted) withdrawCheck(K, 'voice'); // cut short, and nothing said: nothing goes
    else countCheck(K); // nothing said after all: the full time again
    return true;
  }

  function endCheck(reason = '') {
    const K = C.check;
    if (!K) return null;
    C.check = null;
    clearTimeout(K.timer);
    K.timer = 0;
    clearTimeout(K.hbTimer);
    K.hbTimer = 0;
    if (reason === 'closed') callQuietly(() => K.spec.onCancel && K.spec.onCancel('closed'));
    return K;
  }

  /**
   * The check withdrawn: nothing goes out. `how`: 'voice' (said why), 'stopped' (its words also stopped a
   * task; the caller says the line), 'corrected', 'other', 'replaced'.
   */
  function withdrawCheck(K, how) {
    if (C.check !== K) return;
    endCheck();
    if (S.speech) cancelSpeech();
    callQuietly(() => K.spec.onCancel && K.spec.onCancel(how));
    if (how === 'voice' && !S.closed) {
      showCaption('hint', '');
      speakAck(String(K.spec.cancelLine || 'Okay.'));
    }
  }

  /** The check ran out (or "start now"): it goes. */
  function goCheck(K) {
    if (C.check !== K || S.closed) return;
    endCheck();
    // Its listen, if it heard nothing, makes way for what comes next ("Chrome is on it.").
    if (S.listen && !S.listen.text && !S.listen.heard) stopListening();
    if (!S.speech && !S.listen && !S.run) goIdle('ready');
    callQuietly(() => K.spec.onGo && K.spec.onGo());
  }

  /**
   * api.chrome.say(): a line when Voice Mode is free (an open prompt doesn't stop it; a check does). It opens
   * the microphone after it only when this session would listen anyway (PRIVACY-1: never because the extension
   * said something).
   */
  function chromeSay(text) {
    const line = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!line) return true;
    if (!canSayNow()) return false;
    if (chromeListenRule() === 'listen' || !S.ttsOk) {
      sayAsked(line);
      return true;
    }
    if (S.listen) stopListening();
    clearRetry();
    S.lastLine = line;
    speak(line, 'ack', 0, { listenAfter: false });
    return true;
  }

  /**
   * Woken, the opening words are a stop for Chrome or an answer to its question (REDTEAM-VOICE-10): "stop
   * Chrome", a bare "stop" while a task runs, the prompt's reserved words. After two claps (which may have been
   * a bang) only the stops and the no words count; after "Hey Jarvis", the owner's own words, any answer.
   */
  function chromeWakeWords(readings, spoken) {
    let hit = null;
    try {
      hit = routeWords(readings, routeLocal(readings));
    } catch {
      hit = null;
    }
    if (!hit) return false;
    const a = hit.action || {};
    if (hit.id === 'chrome-stop') return true;
    if (hit.id === 'stop') return Array.isArray(a.targets) && a.targets.includes('chrome');
    if ((hit.id !== 'prompt' && hit.id !== 'chrome-prompt') || !a.answer) return false; // (a bare "yes": the greeting)
    if (spoken) return true;
    const p = prompts.current();
    const answer = p && Array.isArray(p.answers) ? p.answers.find((x) => x && x.id === a.answer) : null;
    return !!(answer && (answer.negative || answer.stopTask));
  }

  /** api.chrome.card(): a Chrome card under the captions (it leaves when its view is destroyed). */
  function showChromeCard(view) {
    if (S.closed || !view || !view.el) return false;
    chromeEl.appendChild(view.el);
    return true;
  }

  /** "In Chrome, …", "click around for me", "stop Chrome", "what are you doing in Chrome?": run, then its line. */
  function actChrome(hit) {
    if (!router || typeof router.run !== 'function') return false;
    showCaption('quote', `“${hit.reading}”`); // first: the check that may start says its own line over it
    let out;
    try {
      out = router.run(hit, { surface: 'voice', via: 'voice', reading: hit.reading, spoken: true, voice: api });
    } catch (err) {
      console.warn('[voice] the Chrome command failed', err);
      out = false;
    }
    if (out === false) return false;
    Promise.resolve(out).then(
      (o) => {
        const line = o && typeof o.say === 'string' ? o.say : '';
        if (S.closed || !line) return;
        let tries = 0;
        const sayIt = () => {
          if (S.closed) return;
          if (chromeSay(line)) return;
          if ((tries += 1) < 25) setTimeout(sayIt, 400);
        };
        sayIt();
      },
      () => {},
    );
    if (!S.speech && !S.listen && !C.check && !S.run) goIdle('ready');
    return true;
  }

  // ============================================================================ the wake routine

  /**
   * Woken from Standby (two claps or "Hey Jarvis"): the core boots with the wake sound while the
   * microphone listens a moment for "wake up, daddy's home"; then the greeting and the offer.
   * Nothing here asks Claude: the offer's Music card is an Apple Music search (free).
   */
  function startWake() {
    S.wakeSession = true;
    startCount();
    C.hiddenIdle = false; // v8.1 chrome-voice: woken, the owner is here
    const W = { phase: 'opening', offer: null, timer: 0, hidden: !!document.hidden };
    S.wake = W;
    W.offer = Promise.resolve()
      .then(() => (typeof wake.offer === 'function' ? wake.offer() : null))
      .catch(() => null);
    setVoiceState('idle');
    setStatus('Waking up…', 'sparkle');
    showCaption('hint', 'Waking up…');
    announce('Jarvis is waking up');
    try {
      if (typeof core.boot === 'function') core.boot();
    } catch {
      /* decoration */
    }
    try {
      // The one sound allowed in a background tab: the owner clapped and should hear him wake.
      if (sounds && typeof sounds.play === 'function') sounds.play('wake', { hidden: true });
    } catch {
      /* decoration */
    }
    if (S.sttOk && !away()) startListening({ wakeWindow: true });
    else W.timer = setTimeout(() => greetWake(false), WAKE_BOOT_MS);
    noteAway(); // MAC-7: woken in the background on a Mac: the notification at once (a question may skip the greeting)
  }

  /** The greeting and the offer: "Good evening, Frank. Shall I put on some AC/DC? Or I can …". */
  async function greetWake(home) {
    const W = S.wake;
    if (!W || W.phase !== 'opening' || S.closed) return;
    W.phase = 'greeting';
    clearTimeout(W.timer);
    stopListening();
    setVoiceState('idle');
    setStatus('Waking up…', 'sparkle');
    let offer = null;
    try {
      offer = await Promise.race([W.offer, new Promise((r) => setTimeout(() => r(null), WAKE_OFFER_WAIT_MS))]);
    } catch {
      offer = null;
    }
    if (S.closed || S.wake !== W) return;
    W.phase = 'asking';
    W.offerData = offer && typeof offer === 'object' ? offer : null;
    const name = typeof wake.name === 'function' ? wake.name() : ownerName();
    const part = partOfDayFor(new Date());
    const music = W.offerData && W.offerData.segment && W.offerData.artist ? W.offerData : null;
    // v8.1 (D3): what waited for the owner comes first ("Chrome is waiting for you: …"), then the greeting.
    const line = [...wakePendingLines(), greetingLine({ now: new Date(), name, home }), suggestionLine({ artist: music ? music.artist : '', part })].join(' ');
    W.line = line;
    // v8.1 (A6), MAC-R2-3: the count started with the wake (startWake); MAC-R3-1: a "Hey Jarvis" heard since (the
    // wake window's words, Standby's barge-in) started it again, and it stays so.
    if (music) {
      showMusicCard(music.segment, { fresh: true });
      S.noRelisten = false; // the offer waits for an answer, not for a tap
    }
    try {
      if (typeof wake.onAwake === 'function') wake.onAwake({ line, hidden: !!document.hidden });
    } catch {
      /* decoration */
    }
    speakAck(line);
    noteAway(); // v8.1 (A1): woken in the background on a Mac: one notification ("Jarvis is listening …")
  }

  /**
   * MAC-R2-3: where this woken session's hidden count starts. "Hey Jarvis", or Jarvis on screen (or no hands-free here):
   * from 0. Two claps in the background (the weak signal: a knock, a bang on TV): from the count the app kept across
   * sessions, braked once it reached HANDS_FREE.hiddenQuestions (a TV can't buy 3 more paid questions per false bang).
   */
  function startCount() {
    if (wake.trigger === 'word' || !document.hidden || !handsFree()) {
      S.asked = 0;
      S.braked = false;
      return;
    }
    let c = null;
    try {
      c = hiddenCount && typeof hiddenCount.get === 'function' ? hiddenCount.get() : null;
    } catch {
      c = null;
    }
    const asked = c && Number.isFinite(Number(c.asked)) ? Math.max(0, Number(c.asked)) : 0;
    S.asked = asked;
    S.braked = !!(c && c.braked) || asked >= HANDS_FREE.hiddenQuestions;
  }

  /** MAC-R2-3: braked in the background (a session that started braked): only the routine's free answers are taken. */
  function brakedHidden() {
    return S.braked && !!document.hidden && handsFree();
  }

  /** v8.1 (D3): the lines said before the greeting (wake.pending()), tidied; [] without the hook. */
  function wakePendingLines() {
    let v = null;
    try {
      v = typeof wake.pending === 'function' ? wake.pending() : null;
    } catch {
      v = null;
    }
    const list = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
    return list.map((x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '')).filter(Boolean);
  }

  /**
   * What the owner said while woken: the opening words ("wake up, daddy's home", "go back to
   * sleep"), or the answer to the offer. True when the routine took them; anything else ends the
   * routine and is an ordinary question (heard() goes on).
   */
  function wakeHeard(readings) {
    const W = S.wake;
    if (!W) return false;
    const name = typeof wake.name === 'function' ? wake.name() : '';
    if (W.phase === 'opening') {
      const intents = readings.map((r) => openingIntent(r, { name }));
      if (intents.includes('home')) {
        greetWake(true);
        return true;
      }
      const sleepAt = intents.indexOf('sleep');
      if (sleepAt >= 0 && canStandby()) {
        S.wake = null;
        goToStandby(readings[sleepAt]);
        return true;
      }
      // v8.1 chrome-voice (REDTEAM-VOICE-10): "Hey Jarvis, stop Chrome", "… stop" while a Chrome task runs, "…
      // deny": short, but no greeting. The routine steps aside and the words go on to the router.
      if (chromeWakeWords(readings, wake.trigger === 'word')) {
        S.wake = null;
        clearTimeout(W.timer);
        return false;
      }
      // A fragment ("up", "Jarvis"): the greeting as if nothing was said.
      if (intents[0] === 'greet') {
        greetWake(false);
        return true;
      }
      // Woken by two claps, other words are not a question for Jarvis: the "claps" may have been
      // something else (a beat, a bang) and the room's own talk goes nowhere. He greets; once he is
      // awake, what the owner asks is asked.
      if (wake.trigger !== 'word') {
        greetWake(false);
        return true;
      }
      // "Hey Jarvis, what's the weather?": the routine steps aside; that is the question. MAC-7: what waited for
      // the owner (D3: the speakerphone line, Chrome's question) is said before its answer instead of the greeting.
      S.wake = null;
      clearTimeout(W.timer);
      // MAC-R2-5: asked for only when an answer says them (a free command, a check withdrawn or a turn that fails
      // first leave them for the next greeting: wake.pending() counts a line it gives as said).
      S.preface = { lazy: true, at: Date.now() };
      return false;
    }
    if (W.phase !== 'asking') return false;
    for (const words of readings) {
      let reply = routineReply(words);
      if (!reply) continue;
      // "Yes" to "Shall I run your evening briefing?" (no music found, offline say): the briefing.
      if (reply === 'music' && !(W.offerData && W.offerData.playText)) reply = 'brief';
      S.wake = null;
      if (reply === 'music') {
        const offer = W.offerData;
        if (offer && offer.playText && musicCommand(offer.playText, offer.found ? { found: offer.found } : null)) return true;
        showCaption('quote', `“${words}”`);
        speakAck('I couldn’t find the music just now.');
        return true;
      }
      if (reply === 'brief' && brakedHidden()) {
        brake(); // MAC-R2-3: braked: the briefing waits for "Hey Jarvis" or a tap
        return true;
      }
      if (reply === 'brief') {
        const b = typeof wake.briefing === 'function' ? wake.briefing() : null;
        clearMusicCard();
        // v7.6: with a home base linked, its own briefing, said out loud (free: no turn). When it
        // can't brief, the protocol it falls back to is asked first with its price (MONEY-4).
        if (b && b.done && typeof b.done.then === 'function') {
          sayLocal(words, b.done, 'Getting your briefing from the home base…', 'I couldn’t reach the home base just now.', {
            newChat: true,
            priceFirst: (out) => askPaidBriefing(null, { text: out.send, mode: out.mode, usd: out.usd, sent: out.sent }),
          });
          return true;
        }
        if (!b || !b.text) {
          showCaption('quote', `“${words}”`);
          speakAck('I can’t run the briefing just now.');
          return true;
        }
        // MONEY-4, MAC-5: the briefing protocol is a paid team of agents: its price first, then "yes"
        // (C6's question). Room talk answering the offer, while hidden or after claps, never starts it.
        return askPaidBriefing(words, b);
      }
      goToStandby(words, { offered: true });
      return true;
    }
    // "Yes, play some AC/DC" / "No, play Highway to Hell": what follows the answer word is a music
    // command (local and free); the offer's own card when it names the music offered.
    for (const words of readings) {
      const p = answerParts(words);
      if (!p || !/^(?:play|put on)\b/.test(p.rest)) continue;
      const offer = W.offerData;
      const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const same = p.answer !== 'no' && !!offer && !!offer.playText && !!squash(offer.artist) && squash(p.rest).includes(squash(offer.artist));
      S.wake = null;
      if (musicCommand(same ? offer.playText : p.rest, same && offer.found ? { found: offer.found } : null)) return true;
      S.wake = W; // not a music command after all
    }
    S.wake = null;
    return false;
  }

  /** "Go back to sleep" / "Jarvis, standby": a short reply, then Standby. */
  function canStandby() {
    return !!standby && typeof standby === 'object';
  }

  function goToStandby(words, { offered = false } = {}) {
    if (!canStandby()) {
      showCaption('quote', `“${words}”`);
      speakAck(offered ? 'Very good.' : '');
      return;
    }
    S.wake = null;
    showCaption('quote', `“${words}”`);
    S.sleepAfter = true;
    speakAck(`Very good, ${typeof wake === 'object' && wake && typeof wake.name === 'function' ? wake.name() : ownerName()}.`);
  }

  /** Close Voice Mode and open Standby again (the app does the latter: onClose { reason }). */
  function closeToStandby() {
    if (S.closed) return;
    close('standby');
  }

  function armSleep(ms) {
    disarmSleep();
    if (!wake || typeof wake !== 'object' || typeof wake.returnToStandby !== 'function') return;
    if (!probe(() => wake.returnToStandby())) return;
    S.sleepTimer = setTimeout(() => {
      S.sleepTimer = 0;
      if (S.closed) return;
      // v8.1 (A2): busy (listening, a turn, speech, the check counting or hearing words, the owner typing): try
      // again later instead of giving up for good. A check left paused goes back to Standby (nothing is sent).
      const typing = S.typing && !S.typingForced;
      const checking = !!S.review && S.review.mode !== 'paused';
      if (S.listen || S.run || S.speech || checking || typing) {
        armSleep(SLEEP_IDLE_MS);
        return;
      }
      // v8.1: held (a tour waiting at a decision): not before 2 minutes after the owner's last words.
      const held = hold.remainingMs();
      if (held > 0) {
        armSleep(held);
        return;
      }
      if (typeof wake.canSleep === 'function' && !probe(() => wake.canSleep())) {
        armSleep(SLEEP_IDLE_MS); // a preview is playing: later
        return;
      }
      closeToStandby();
    }, ms);
  }

  function disarmSleep() {
    if (S.sleepTimer) clearTimeout(S.sleepTimer);
    S.sleepTimer = 0;
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
        listening: !!S.listen || !!(S.review && S.review.L),
        heard: S.listen ? S.listen.text || '' : S.review ? S.review.text : '',
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
    selfMask.begin('', speechRate()); // v8.1 (A8): the reply's text comes as it streams (appendLive)
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
    if (R.preface) {
      const line = prefaceText(R.preface);
      R.preface = '';
      if (line) appendLive(sp, `${line} `);
    }
    return sp;
  }

  /**
   * v8.1: a short line said before the next turn's answer ("New look."), if it is still fresh. MAC-R2-5: the wake's
   * waiting lines come as a function, asked for only as the answer starts to say them (prefaceText()).
   */
  function takePreface() {
    const p = S.preface;
    S.preface = null;
    if (!p || Date.now() - p.at >= 15000) return '';
    return p.lazy ? () => wakePendingLines().join(' ') : p.text;
  }

  /** MAC-R2-5: a turn's preface as text (a lazy one is asked for now, as it is said). */
  function prefaceText(p) {
    if (typeof p !== 'function') return p || '';
    try {
      return String(p() || '');
    } catch {
      return '';
    }
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
    if (S.speech === sp) selfMask.text(sp.text);
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

  /** The answer said at the end, after the turn's preface ("New look.") when its live speech never said it. */
  function withPreface(R, text) {
    const line = R && R.preface ? prefaceText(R.preface) : '';
    if (R) R.preface = '';
    return line ? `${line} ${text}` : text;
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
        speak(withPreface(R, S.answer.summary), 'summary', sounds ? REPLY_CHIME_MS : 0);
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
      speak(withPreface(R, summary), 'summary', sounds ? REPLY_CHIME_MS : 0);
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
    // v8.1 (E0, optics): the live view's dollar this hour would be passed: said as it is (it says what
    // to do: wait, or "stop live view"), and Jarvis listens again as after any line.
    if (err && err.kind === 'live_cap' && err.message) {
      speakAck(asSentence(clip(singleLine(err.message), 240)));
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
    if (S.wakeSession) armSleep(SLEEP_FAILED_MS); // v8.1 (A2): a woken session that failed goes back to Standby
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
      onChunk: null, // v8.1 narrate(): each chunk as it starts, { start, end } in the display text
      onEnd: null, // v8.1 narrate(): onEnd(reason), once
      listenAfter: null, // v8.1 narrate(): null (today's rule) | false | { noSpeechMs }
      voice: null, // v8.1 narrate(): the voice it started with ({ kind, startEvents })
      begunAt: 0, // v8.1 narrate(): when it was asked for
      chunked: false, // v8.1 narrate(): its first chunk was seen
      ended: false,
    };
  }

  /**
   * Speak `display` in one go (shown as captions, may contain paragraph breaks). The engine gets
   * the same text, so its offsets (whitespace collapsed) map back to the display with spokenForm().
   */
  function speak(display, kind, delay = 0, extra = null) {
    cancelSpeech();
    const sp = newSpeech(kind);
    if (extra) Object.assign(sp, extra); // narrate(): its chunk and end callbacks, and what follows it
    const form = spokenForm(display);
    sp.display = String(display ?? '');
    sp.text = form.spoken;
    sp.map = form.map;
    S.speech = sp;
    selfMask.begin(sp.text, speechRate()); // v8.1 (A8): where "Jarvis" is in what he is about to say
    root.dataset.speech = kind;
    if (kind === 'summary' || kind === 'full' || kind === 'ack' || kind === 'tour') {
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
    pauseMusicForSpeech();
    if (sp.kind === 'live') announce('Jarvis is speaking');
  }

  /** Jarvis's voice starts (a line, an answer, or the next sentences of a reply): a preview pauses. */
  function pauseMusicForSpeech() {
    try {
      if (music && typeof music.onSpeak === 'function') music.onSpeak();
    } catch {
      /* decoration */
    }
  }

  /** A chunk starts playing: highlight it, and show that Jarvis is speaking. */
  function onSpeechChunk(sp, c) {
    if (sp.token !== S.speechToken || !c) return;
    pauseMusicForSpeech(); // also when a reply speaks again after a pause (a preview tapped meanwhile)
    const start = Number(c.start);
    const end = Number(c.end);
    if (!Number.isFinite(start) || start < 0) return;
    selfMask.chunk({ start }); // v8.1 (A8)
    // `at`: when it started, which the engine may only learn later (a voice without start events).
    const at = Number(c.at) <= Date.now() && Number(c.at) > Date.now() - 60000 ? Number(c.at) : Date.now();
    sp.chunk = { start, end: Number.isFinite(end) && end > start ? end : start + 1, at };
    sp.idle = false;
    if (!sp.started) onSpeechStart(sp);
    if (S.karaoke === sp.karaoke) setKaraokeChar(displayIndex(sp, start));
    // v8.1 narrate(): the device voice's first chunk tells whether it sends start events.
    if (sp.kind === 'tour' && !sp.chunked && sp.voice && sp.voice.kind === 'device' && sp.begunAt) {
      sp.chunked = true;
      deviceStartEvents = Date.now() - sp.begunAt < 2000;
    }
    // v8.1 narrate(): the narrator learns each chunk as it starts (offsets in the text it gave).
    if (sp.onChunk) {
      const from = displayIndex(sp, start);
      const to = displayIndex(sp, Math.max(start, sp.chunk.end - 1)) + 1;
      callQuietly(() => sp.onChunk({ start: from, end: to }));
    }
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
    selfMask.boundary({ charIndex: ci }); // v8.1 (A8)
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
    selfMask.end(); // v8.1 (A8)
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
    // v8.1 narrate(): the narrator hears how it ended first; if it went on (its next steps), they keep the floor.
    if (sp.onEnd) {
      endNarration(sp, how);
      if (S.closed || S.speech || S.listen || S.run || S.review) return;
    }
    // v8.1: a line with something to do after it (leave Voice Mode, stop listening) does it, said or not.
    if (typeof sp.afterLine === 'function') {
      sp.afterLine();
      return;
    }
    if (how === 'done' || S.sleepAfter) afterSpeech(sp);
    else {
      goIdle('answered'); // interrupted, or speech isn't working: no microphone over it
      takeHeld();
    }
  }

  /**
   * After a reply was spoken to the end: listen again (continuous) or wait for a tap. `sp`: the speech
   * that ended; a narration's listenAfter (v8.1) says false (no listening) or { noSpeechMs } (one listen).
   */
  function afterSpeech(sp = null) {
    if (S.closed) return;
    if (sp && sp.display) C.lastDone = { text: String(sp.display), at: Date.now() }; // v8.1 chrome-voice
    if (S.sleepAfter) {
      S.sleepAfter = false;
      closeToStandby();
      return;
    }
    finishKaraoke();
    // A viewer over Voice Mode captions what was just said: it can make room for the model now.
    try {
      if (visuals && typeof visuals.spoken === 'function') visuals.spoken();
    } catch {
      /* decoration */
    }
    if (takeHeld()) return; // what the owner said while the hologram built comes first
    if (sayPendingAsk()) return; // v8.1: a question (or the prompt) that waited for Jarvis to be free
    if (sayPendingPrompt()) return; // v8.1 chrome-voice: then Chrome's question, from its own slot
    if (S.noRelisten) {
      // A Music card is up: the owner's next move is probably Preview or Open in Apple Music.
      S.noRelisten = false;
      goIdle('music');
      return;
    }
    // v8.1 narrate(): no listening after it, or one listen with its own silence window.
    const after = sp ? sp.listenAfter : null;
    if (after === false) {
      goIdle('answered');
      return;
    }
    // MAC-R2-3: a woken session that started braked still hears the answer to its offer, once (only the routine's free
    // answers count: anything else gets the brake line).
    const offerBraked = S.braked && !!S.wake && S.wake.phase === 'asking' && !(S.deaf && document.hidden);
    // v8.1 (A1, A6): the brake was said, or he can't hear in the background: no more listening there.
    if ((S.braked && !offerBraked) || (S.deaf && document.hidden)) {
      goIdle('answered');
      if (S.deaf && S.wakeSession) armSleep(SLEEP_FAILED_MS);
      return;
    }
    const once = !!after && typeof after === 'object';
    // Woken: the offer was just made, so Jarvis listens for the answer (Continuous or not). So does a
    // walkthrough's decision ("enclosed, or opened?"), while it waits.
    const asking = (!!S.wake && S.wake.phase === 'asking') || decisionWaits();
    // v8.1 (A6): in a hands-free session (a computer: handsFree()), a woken session and every session while Jarvis
    // is hidden listen once for a follow-up (8 s); while hidden, after 3 questions in a row without the wake words,
    // a tap or a key: the brake. Elsewhere (an iPhone, the setting off): today's rule.
    const hf = handsFree();
    const plan = once ? null : offerBraked ? { listen: true, brake: false, noSpeechMs: HANDS_FREE.followUpMs, tries: 1 } : followUp({ woken: S.wakeSession && hf, away: !!document.hidden && hf, continuous: S.continuous, asking, asked: S.asked });
    if (plan && plan.brake) {
      brake();
      return;
    }
    if ((once || (plan && plan.listen)) && S.sttOk && !S.typing && !S.sttBlocked && !away()) {
      // Hands-free: listen again once the speaker has gone quiet.
      const followListen = plan && plan.tries === 1 ? { keepAnswer: true, noSpeechMs: plan.noSpeechMs, oneTry: true } : { keepAnswer: true };
      const listen = once ? { keepAnswer: true, noSpeechMs: Number(after.noSpeechMs) || 0, oneTry: true } : followListen;
      setStatus('Your turn', 'mic');
      S.retryTimer = setTimeout(() => {
        S.retryTimer = 0;
        if (!S.closed && !S.listen && !S.run && !S.speech && !away()) startListening(listen);
        else if (!S.closed && !S.listen && !S.run && !S.speech) goIdle('answered');
      }, RELISTEN_DELAY_MS);
      renderControls();
      return;
    }
    goIdle('answered');
  }

  /**
   * v8.1 (A6): the brake. While Jarvis is hidden, 3 questions in a row were taken without the wake words, a tap
   * or a key (a TV can't run up paid questions): he says so, then goes back to Standby (woken, Return to standby
   * on) or stops listening. The wake words, a tap or a key start the count again (claps don't: MAC-4).
   */
  function brake() {
    S.braked = true;
    S.sleepAfter = !!S.wakeSession && probe(() => wake && typeof wake === 'object' && typeof wake.returnToStandby === 'function' && wake.returnToStandby());
    speakAck('Say “Hey Jarvis” when you need me.');
  }

  /**
   * v8.1 barge-in (A8): two claps or "Hey Jarvis" while Jarvis speaks (Standby's microphone stayed on: app.js
   * decides when it may). Only while George speaks: the Mac's own voice is played by macOS, outside Chrome's
   * echo reference. Never on his own "Jarvis" (the self-mask, for the wake word). Then it is the core's tap while
   * he speaks: he stops and listens; a tour's narration ends ('cancelled') and the tour pauses at its step.
   */
  function bargeIn(trigger) {
    // MAC-R4-4: "Hey Jarvis" (not his own: the self-mask) is the owner calling him, whatever happens next: over the Mac's
    // own voice or in the gap before a listen too, the hidden count starts again. MAC-R5-2: but the Mac's own voice is
    // outside the echo reference, so over it only a line without "Jarvis" of his own; never the brake line, nor once he
    // is going back to sleep.
    const saying = S.speech ? String(S.speech.text || '') : '';
    const echoFree = valueOf(() => (tts && typeof tts.voiceNow === 'function' ? tts.voiceNow() : null));
    const ownJarvis = !!S.speech && echoFree !== 'natural' && echoFree !== 'homebase' && /jarvis/i.test(saying);
    if (trigger === 'word' && !S.closed && !selfMask.masked() && !S.sleepAfter && !ownJarvis && !/when you need me/i.test(saying)) {
      S.asked = 0;
      S.braked = false;
    }
    if (trigger === 'word' && !S.closed && !S.speech && (S.listen || S.review)) {
      // MAC-V-1: "Hey Jarvis" while he listens: nothing to interrupt, but it is the owner calling him.
      S.asked = 0;
      S.braked = false;
      return false;
    }
    if (S.closed || !S.speech || S.review || S.listen) return false;
    const voice = valueOf(() => (tts && typeof tts.voiceNow === 'function' ? tts.voiceNow() : null));
    if (voice !== 'natural' && voice !== 'homebase') return false;
    const word = trigger === 'word';
    if (word && selfMask.masked()) return false;
    // MAC-4: claps are the weak signal (a door, knocks, a TV's bang). They stop him but don't start the hidden count
    // again; at its limit they open no more listens (he finishes, then the brake). Only the wake words do.
    if (!word && document.hidden && handsFree() && (S.braked || S.asked >= HANDS_FREE.hiddenQuestions)) return false;
    if (word) {
      S.asked = 0; // the owner called him: the hidden count starts again
      S.braked = false;
    }
    const count = { asked: S.asked, braked: S.braked };
    S.deaf = false;
    C.hiddenIdle = false; // v8.1 chrome-voice
    S.sleepAfter = false; // MAC-8: the sleep or brake line was cut: the owner wants him after all
    hold.heard();
    disarmSleep();
    clearRetry();
    if (S.run && spokenDone(S.run)) releaseRun();
    else if (S.run) abortRun({ listen: true });
    else {
      cancelSpeech();
      // CHROME-VOICE-R2-1: the owner's listen: a Chrome line waiting (its question, said again or not yet said, or
      // its news) waits until it ends, so the words after "Hey Jarvis" are heard.
      startListening({ keepAnswer: !!S.answer, owner: true });
    }
    // The listen a reply's interruption opens is a tap's (it starts the count again): not after claps.
    S.asked = count.asked;
    S.braked = count.braked;
    return true;
  }

  function cancelSpeech() {
    const sp = S.speech;
    if (!sp) return;
    selfMask.end();
    S.speechToken += 1;
    S.speech = null;
    clearTimers(sp.timers);
    delete root.dataset.speech;
    // v8.1 narrate(): the narrator hears it was cut (a tap, a listen, another line), after this turn of events.
    if (sp.onEnd && !sp.ended) setTimeout(() => endNarration(sp, 'cancelled'), 0);
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

  /** Once per Voice Mode, inside a tap. `tap: false` (opened by the wake routine): said so, and not used up. */
  function unlockSpeech({ tap = true } = {}) {
    if (S.unlocked || !S.ttsOk) return;
    if (tap) S.unlocked = true;
    try {
      if (typeof tts.unlockSpeech === 'function') {
        if (tap) tts.unlockSpeech();
        else tts.unlockSpeech({ tap: false });
      }
    } catch {
      /* ignore */
    }
  }

  // =================================================================================== level

  function bumpLevel(v) {
    levelTarget = Math.max(levelTarget, Math.min(1, v));
  }

  /** The natural voice's output bands to the core while it plays; null hands the band back. */
  function feedOutputBands(on) {
    if (typeof core.setBands !== 'function') return;
    let filled = false;
    if (on) {
      try {
        filled = typeof tts.getOutputBands === 'function' && tts.getOutputBands(outBands) === true;
      } catch {
        filled = false;
      }
    }
    if (filled) {
      if (!outBandsOn) root.dataset.bands = 'output'; // test hook: the voice band follows the natural voice
      outBandsOn = true;
      try {
        core.setBands(outBands);
      } catch {
        /* optional */
      }
    } else if (outBandsOn) {
      outBandsOn = false;
      delete root.dataset.bands;
      try {
        core.setBands(null); // the level-driven band again (or the mic's, which push their own)
      } catch {
        /* optional */
      }
    }
  }

  /** 0..1 from the speech engine's output analyser (the natural voice), or null (device voice). */
  function outputLevel() {
    try {
      if (tts && typeof tts.getOutputLevel === 'function') {
        const v = tts.getOutputLevel();
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      }
    } catch {
      /* no level */
    }
    return null;
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
    if (!want || S.state !== 'speaking') feedOutputBands(false);
  }

  function levelTick(ts) {
    levelFrame = 0;
    const dt = levelLast ? Math.min(100, ts - levelLast) : 16;
    levelLast = ts;
    const real = outputLevel();
    feedOutputBands(real !== null && S.state === 'speaking');
    if (real !== null) {
      // The natural voice plays through Web Audio: the core follows its real loudness, eased. The
      // target is set, not raised, so the word bumps (estimated for this voice) never add to it.
      levelTarget = Math.min(1, Math.max(0, real));
    } else {
      if (S.state === 'speaking' && S.speech && S.speech.started && !S.speech.boundary && !S.speech.idle) {
        // No word events from this voice: a soft synthetic envelope keeps the core "talking".
        const t = ts / 1000;
        bumpLevel(0.3 + 0.28 * Math.abs(Math.sin(t * 5.3) * Math.sin(t * 1.7 + 0.6)));
      }
      levelTarget *= Math.exp(-dt / 240);
    }
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

  function close(reason = 'exit') {
    if (S.closed) return;
    S.closed = true;
    disarmSleep();
    // MAC-R2-1: closed: the app's voice lock goes at once (also when it was idle, waiting its moment to go).
    if (typeof onActive === 'function') callQuietly(() => onActive(false, { now: true }));
    S.active = false;
    // MAC-R2-3: the hidden count goes on in the next session (only while Jarvis is in the background).
    if (hiddenCount && typeof hiddenCount.set === 'function') callQuietly(() => hiddenCount.set(document.hidden && handsFree() ? { asked: S.asked, braked: S.braked } : { asked: 0, braked: false }));
    callQuietly(() => sessionTitle(null)); // v8.1 (A1): the tab title comes back
    if (S.awayNoted) callQuietly(() => closeNotify(SESSION_NOTE)); // and the session's notification goes
    if (current === instance) current = null;
    clearRetry();
    stopListening();
    endReview(); // words still being checked are not sent
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
    callQuietly(() => clearOffer());
    callQuietly(() => questions.clear('closed'));
    callQuietly(() => endCheck('closed')); // v8.1 chrome-voice: a Chrome check withdrawn, nothing sent
    clearInterval(C.pump);
    callQuietly(() => prompts.close());
    S.pendingAsk = null;
    C.pendingPrompt = null;
    S.heldWords = '';
    callQuietly(() => clearMusicCard()); // a preview playing carries on (its card is in the chat too)
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
      if (typeof onClose === 'function') onClose({ reason: typeof reason === 'string' ? reason : 'exit', wakeSession: S.wakeSession });
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
      // v8.1 (A1): in a hands-free session the listen and error chimes also play while hidden (sounds.js).
      if (sounds && typeof sounds.play === 'function') sounds.play(name, handsFree() ? { hidden: true } : undefined);
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

/** More words for a sentence being checked ("…tomorrow." + "and in Boston" -> "…tomorrow and in Boston"). */
function addWords(text, more) {
  let a = String(text ?? '').trim();
  const b = String(more ?? '').trim();
  if (!a) return b;
  if (!b) return a;
  if (/^[a-z]/.test(b)) a = a.replace(/[.!?…]+$/, '');
  return `${a} ${b}`;
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
