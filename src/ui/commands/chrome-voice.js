// Jarvis for Chrome by voice, the app side (Track 3: G4, G5): this builder's voice and typed commands (v8.1; chrome-voice writes this file).
//
// app.js calls register() once at start (registerCommandModules), with the app's shared deps plus
// `chromeVoice()`: the controller (src/ui/chrome-task.js createChromeVoice), or null. The matchers are
// pure (src/lib/chrome-task-words.js, src/lib/chrome-prompt-words.js); the controller acts. In Voice
// Mode, 'chrome-prompt' is carried out by its prompt channel (voice-mode.js answerPrompt: the 30-s
// window, the other readings, the check) and the others by actChrome (the controller's line is said).
//
//   id             layer        what
//   chrome-prompt  answer       Voice Mode only: a Chrome check's words ("cancel", "no, I said …", "start
//                               now"), the open prompt's reserved words, a bare "cancel" / "no" when the
//                               prompt was asked last, a bare "yes" (never an answer: Jarvis says what to say)
//   chrome-stop    stop         "stop Chrome", "cancel the Chrome task" (a bare "stop" is voice's 'stop')
//   chrome-task    destination  "… in Chrome", "have Chrome …", page words in a Chrome context: a carrier
//                               (no word cap). Its action says check: false: the task has one check, its
//                               own spoken one (the lead's D2), never the generic 2-second check. Paid and
//                               not undoable, so never from another reading.
//   chrome-ask     destination  "click around for me" ("What should I do in Chrome?")
//   chrome-status  destination  "what are you doing in Chrome?" (free)
//   chrome-answer  destination  a yes naming Chrome with nothing asked ("Chrome isn't asking anything right
//                               now."; with a card waiting in the chat: its buttons answer it)
//
// Typed (the chat, a hologram's or Optics' field), a task gets its card with the price and a 2-s countdown
// in the chat; a field over the chat shows the check's line too.
//
// Keep this module importable in Node (no DOM at import time): the T3 harness
// (test/unit/command-router.test.mjs) registers every module with fake deps. Its phrases go in the
// chrome-voice section of test/unit/fixtures/voice-corpus.mjs, and its collisions in the chrome-voice section of
// test/unit/fixtures/collisions.mjs.

import { matchChromeStatus, matchChromeStop, matchChromeTask, matchClickAround, taskRefusal } from '../../lib/chrome-task-words.js';
import { matchChromeAnswer, matchNothingAsked } from '../../lib/chrome-prompt-words.js';

/**
 * @param {{ register: Function }} router  the app's command router
 * @param {object} deps  shared: { getSettings, saveSettings, toast, voice() (the open Voice Mode's api,
 *   or null), routerState(surface, local), phone, demo }, plus this module's own (app.js):
 *   chromeVoice() → the controller (createChromeVoice) or null
 */
export function register(router, deps = {}) {
  const controller = () => {
    try {
      return deps && typeof deps.chromeVoice === 'function' ? deps.chromeVoice() || null : null;
    } catch {
      return null;
    }
  };
  /** The controller acts; its line is said in Voice Mode and shown elsewhere. False: it couldn't after all. */
  const run = (action, ctx = {}) => {
    const surface = ctx && typeof ctx.surface === 'string' ? ctx.surface : 'voice';
    const c = controller();
    if (!c) {
      const r = taskRefusal('unlinked');
      return { say: surface === 'voice' ? r.say : r.show };
    }
    const out = c.run(action, { surface });
    if (!out) return false;
    return { say: surface === 'voice' ? out.ack || '' : out.show || '' };
  };

  // The wake greeting's first words while Chrome waits for an answer (the lead's D3: mac-hf's one hook;
  // `waits`: said before any other line).
  const pending = deps && deps.wakePending;
  if (pending && typeof pending.add === 'function') {
    pending.add(
      () => {
        const c = controller();
        return c && typeof c.pending === 'function' ? c.pending() : null;
      },
      { waits: true },
    );
  }

  // Voice Mode only, like its 'prompt' and 'question': in the chat a prompt's card answers it.
  router.register({ id: 'chrome-prompt', layer: 'answer', surfaces: ['voice'], match: (text, state) => matchChromeAnswer(text, state), run });
  router.register({
    id: 'chrome-stop',
    layer: 'stop',
    match: (text, state) => {
      const m = matchChromeStop(text, state);
      return m && m.named ? m : null;
    },
    run,
  });
  router.register({
    id: 'chrome-task',
    layer: 'destination',
    carrier: true,
    match: (text, state) => {
      const m = matchChromeTask(text, state);
      return m ? { ...m, check: false } : null;
    },
    run,
  });
  router.register({ id: 'chrome-ask', layer: 'destination', match: (text) => matchClickAround(text), run });
  router.register({ id: 'chrome-status', layer: 'destination', match: (text) => matchChromeStatus(text), run });
  router.register({ id: 'chrome-answer', layer: 'destination', match: (text, state) => matchNothingAsked(text, state), run });
}
