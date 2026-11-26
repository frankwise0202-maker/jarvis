// Optics (Track 5: E0-E7): this builder's voice and typed commands (v8.1; optics writes this file).
//
// app.js calls register() once at start (registerCommandModules), with the app's shared deps plus
// the ones added in this module's own call there. Today's Optics words (a Look, Flip, Watch, the live
// view…) stay the router's own `optics` and `camera` entries (command-router.js); these are the new
// ones:
//
//   optics-card      (destination) a Look on screen or set aside beside the live video (E1):
//                    "expand the picture", "show the picture big", "put the picture aside", "close
//                    the picture"; typed in Optics' field as well as said. Before Screens: "put the
//                    picture to the side" is the card's while Optics shows a Look (a float otherwise).
//   optics-research  (top) "research this", "look this up", "dig into this", "research this in the
//                    background" (E3): the price first (an offer: quick, mission, home base), in Voice
//                    Mode and in Optics' field. Before Optics' own words, so "research this?" is never
//                    a Look.
//   optics-research-answer
//                    (answer) "mission" or "home base" for the open research offer (the dear ways):
//                    through the 2-second check (check: true); "quick" and "cancel" are the offer's own
//                    answers (Voice Mode's question), at once.
//   optics-open      (app) "open optics", "open the camera", "camera on", "start the camera", "show me
//                    the camera", "switch cameras", "use the Logitech camera" with Optics closed (E2):
//                    free, no Look; never from another reading (camera: true). With Optics open: "Optics
//                    is on." (never a paid question).
//   optics-close     (app) "close the camera", "camera off" with Optics closed: free, works from
//                    anywhere (the camera on another screen goes off too); typed in Optics' own field,
//                    Optics closes.
//   optics-camera-part
//                    (top) R10: with a hologram on top, camera words that name its camera part ("open
//                    the camera", "camera on" over a laptop hologram) select that part as today, and
//                    Jarvis adds "Say 'open Optics' for your camera." ("open optics" always opens Optics).
//   optics-idle      (app) v8.1 fix MONEY-7: with Optics closed, "stop video mode", "video mode off",
//                    "stop live view", "stop watching", "expand the picture", "back to live", "close the
//                    picture": a free line ("The live view is off.", "There's no picture on screen.").
//                    v8.1.1 fix MONEY-R2-4: the off words also with a hologram or blueprint on screen, or
//                    Optics under a hologram (its live view and Watch stopped there).
//
// What acts is the app's (its deps, below): this module stays importable in Node (no DOM): the T3
// harness (test/unit/command-router.test.mjs) registers it with fake deps. Its phrases are in the
// optics section of test/unit/fixtures/voice-corpus.mjs, its collisions in collisions.mjs.

import { matchHologramCommand } from '../../lib/hologram-commands.js';
import { isCameraCloseRequest, isOpticsOpenRequest, matchOpticsClosedWords, matchOpticsCommand, opticsClosedLine } from '../../lib/optics-commands.js';
import { matchOfferChoice, matchResearchThis } from '../../lib/research-offer.js';
import { isBareNo } from '../../lib/command-order.js';

// "My screen", "my camera": the owner's own, never a hologram's part (R10's "my …": ROUTING-7, ROUTING-R2-8).
const MY_THING = /\bmy (?:screen|display|monitor|camera|webcam|web cam|cam)\b/i;

/** The research offer's id on Voice Mode's question stack (app.js researchThis). */
export const RESEARCH_OFFER_ID = 'research-offer';

/** R10: said after a hologram's camera part is selected by camera words. */
export const OPTICS_HINT = 'Say ‘open Optics’ for your camera.';

const CARD_ACTIONS = new Set(['expand', 'aside', 'close-card']);

/** Whether Optics is the thing on top (no hologram or blueprint over it). */
const opticsOnTop = (s) => !!(s.optics && s.optics.open) && !s.hologram && !s.blueprintOpen;

/** A `run` result from what the app's dep returned: { say } | Promise<{ say }> | false. */
function outcome(value) {
  if (value === false || value === null || value === undefined) return false;
  if (typeof value.then === 'function') return value.then((v) => (v && typeof v.say === 'string' ? v : { say: '' }));
  return typeof value.say === 'string' ? value : { say: '' };
}

/**
 * @param {{ register: Function }} router  the app's command router
 * @param {object} deps  shared: { getSettings, saveSettings, toast, voice() (the open Voice Mode's api,
 *   or null), routerState(surface, local), phone, demo }, plus this module's own (app.js):
 *   opticsCommand(text, ctx) → { say } | Promise | false   Optics' own command for these words
 *   openOptics({ text, surface, via }) → { say } | Promise | false   E2 (the camera rules)
 *   closeCamera({ surface }) → { say } | false
 *   researchThis({ where, deep, surface, via, text }) → { say } | Promise | false   E3 (the offer)
 *   answerResearch(choiceId) → { say } | Promise | false   a dear way said for the open offer
 *   hologramPart({ text, surface, hint }) → { say } | false   R10: the hologram's own command, then the hint
 */
export function register(router, deps) {
  const call = (name, ...args) => {
    const fn = deps && deps[name];
    if (typeof fn !== 'function') return false;
    try {
      return outcome(fn(...args));
    } catch (err) {
      console.error(`[jarvis] optics ${name} failed:`, err);
      return false;
    }
  };

  // E1: the Look's card, while one is on screen (aside on a Mac, or frozen).
  router.register({
    id: 'optics-card',
    layer: 'destination',
    surfaces: ['voice', 'optics'],
    match(text, s) {
      if (!(s.optics && s.optics.open && s.optics.card)) return null;
      if (s.surface === 'voice' && !opticsOnTop(s)) return null;
      const cmd = matchOpticsCommand(text, { frozen: true });
      return cmd && CARD_ACTIONS.has(cmd.action) ? { do: 'optics-card', command: cmd } : null;
    },
    run: (action, ctx) => call('opticsCommand', ctx.reading, ctx),
  });

  // R10 (E2): with a hologram on top, "open the camera" means its camera part (the hologram selects
  // it, as today) and Jarvis says how to reach Optics. Before the hologram's own entry (same words).
  // R10's "my …" (ROUTING-7, ROUTING-R2-8): "open my camera" is the owner's camera, never the part (in Voice Mode,
  // optics-open's; typed in the hologram's field, a question for Jarvis, as "open optics" is there).
  router.register({
    id: 'optics-camera-part',
    layer: 'top',
    surfaces: ['voice', 'hologram'],
    match(text, s, ctx) {
      const holo = s.hologram;
      if (!holo || !holo.open || holo.inWindow || !Array.isArray(holo.parts) || !holo.parts.length) return null;
      const words = String(text || '');
      if (!isOpticsOpenRequest(words) || /\boptics\b/i.test(words)) return null;
      // Nor through another reading of them (v8.1.1: a viewer's microphone gives every reading, MONEY-R2-5).
      const best = ctx && Array.isArray(ctx.readings) ? String(ctx.readings[0] || '') : '';
      if (MY_THING.test(words) || MY_THING.test(best)) return null;
      const cmd = matchHologramCommand(words, holo.parts, { selected: holo.selected || null });
      return cmd && cmd.action === 'select' ? { do: 'hologram-part', command: cmd, free: true } : null;
    },
    run: (action, ctx) => call('hologramPart', { text: ctx.reading, surface: ctx.surface, hint: OPTICS_HINT }),
  });

  // E3: "research this", the price first.
  router.register({
    id: 'optics-research',
    layer: 'top',
    surfaces: ['voice', 'optics'],
    match(text, s) {
      const m = matchResearchThis(text);
      if (!m) return null;
      // PRIVACY-4: with Optics open, "research this" may take a Look first (a picture to Claude, paid),
      // so it is taken from the best reading only (R7), never from one the recognizer was less sure of.
      const looks = !!(s && s.optics && s.optics.open);
      return looks ? { do: 'research', where: m.where, deep: m.deep, camera: true, free: false } : { do: 'research', where: m.where, deep: m.deep };
    },
    run: (action, ctx) => call('researchThis', { where: action.where, deep: action.deep, surface: ctx.surface, via: ctx.via, text: ctx.reading }),
  });

  // E3: "mission" / "home base" for the open offer: the dear ways go through the 2-second check.
  router.register({
    id: 'optics-research-answer',
    layer: 'answer',
    surfaces: ['voice'],
    match(text, s) {
      const q = Array.isArray(s.questions) ? s.questions[0] : null;
      if (!q || q.id !== RESEARCH_OFFER_ID || !Array.isArray(q.choices)) return null;
      const choice = matchOfferChoice(text, q.choices.filter((c) => c && c.dear));
      return choice ? { do: 'research-answer', choice, check: true, free: false, undo: false } : null;
    },
    run: (action) => call('answerResearch', action.choice),
  });

  // ROUTING-R2-10: the research offer answered in Optics' field while its card is up (app.js routerState
  // `researchOffer`): typed, any way, as the card's buttons; said to Optics' microphone, the cheap ways act and a dear
  // one asks for the card's tap (no 2-second check there). Never a one-word paid question about the Look.
  router.register({
    id: 'optics-research-field',
    layer: 'answer',
    surfaces: ['optics'],
    match(text, s) {
      const offer = s.researchOffer;
      if (!offer || !Array.isArray(offer.choices)) return null;
      // Every form of no Voice Mode takes since R2-4 ("nope", "no, cancel that") is the offer's cancel (ROUTING-R3-3).
      const id = matchOfferChoice(text, offer.choices) || (isBareNo(text) && offer.choices.some((c) => c && c.id === 'cancel') ? 'cancel' : null);
      if (!id) return null;
      const choice = offer.choices.find((c) => c && c.id === id) || {};
      if (choice.dear && s.via === 'voice') return { do: 'research-tap', choice: id, label: String(choice.label || ''), undo: false };
      return { do: 'research-answer', choice: id, free: id === 'cancel', undo: false };
    },
    run: (action) => {
      if (action.do === 'research-tap') {
        const name = action.label.split('·')[0].trim() || 'it';
        return { say: `Tap ${name} on the card to start it.` };
      }
      return call('answerResearch', action.choice);
    },
  });

  // E2: "open optics" with Optics closed (Voice Mode, or typed in the chat: Enter is a gesture); with
  // Optics open already (said, or typed in its field), Jarvis just says so: never a paid question.
  router.register({
    id: 'optics-open',
    layer: 'app',
    surfaces: ['voice', 'chat', 'optics'],
    match(text, s) {
      const open = !!(s.optics && s.optics.open);
      if (s.surface === 'optics' && !open) return null;
      if (!open && !(s.camera && s.camera.supported)) return null;
      if (!isOpticsOpenRequest(text)) return null;
      // A camera switch with Optics open is Optics' own word ("switch cameras": Flip).
      if (open && matchOpticsCommand(text)) return null;
      return { do: 'optics-open', open, camera: true };
    },
    run: (action, ctx) => call('openOptics', { text: ctx.reading, surface: ctx.surface, via: ctx.via, open: action.open }),
  });

  // "Close the camera" with Optics closed (free, from anywhere: a camera on another screen goes off
  // too), or typed in Optics' own field (where typed words are otherwise a question).
  router.register({
    id: 'optics-close',
    layer: 'app',
    surfaces: ['voice', 'chat', 'optics'],
    match(text, s) {
      const open = !!(s.optics && s.optics.open);
      if (open && !(s.surface === 'optics' && s.via === 'typed')) return null;
      return isCameraCloseRequest(text) ? { do: 'camera-off', open } : null;
    },
    run: (action, ctx) => (action.open ? call('opticsCommand', ctx.reading, ctx) : call('closeCamera', { surface: ctx.surface })),
  });

  // MONEY-7: with Optics closed, the live view's and Watch's off words and the picture's own words
  // ("stop video mode", "stop live view", "stop watching", "expand the picture", "back to live", "close
  // the picture") have nothing to act on: a free line ("The live view is off."), never a paid question.
  // v8.1.1 fix MONEY-R2-4: the off words are never about a hologram, a blueprint or a window: the free
  // line whenever this window's live view (or Watch) isn't running, Optics open under a hologram included
  // (covering Optics stops both). With Optics on top they stay Optics' own, as before.
  router.register({
    id: 'optics-idle',
    layer: 'app',
    match(text, s) {
      const m = matchOpticsClosedWords(text);
      if (!m) return null;
      const optics = s.optics && s.optics.open ? s.optics : null;
      if (m.kind === 'picture') {
        // Only with nothing the picture's words could be about: Optics, a hologram or blueprint, a window.
        if (optics || (s.hologram && s.hologram.open) || s.blueprintOpen) return null;
        if (Array.isArray(s.windows) && s.windows.length) return null;
        return { do: 'optics-idle', kind: m.kind };
      }
      if (optics && (opticsOnTop(s) || (m.kind === 'watch' ? optics.watch : optics.liveView))) return null;
      return { do: 'optics-idle', kind: m.kind };
    },
    run: (action) => ({ say: opticsClosedLine(action.kind) }),
  });
}
