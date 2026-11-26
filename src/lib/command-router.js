// The command router (v8.1, SPEC §30): one place decides which local command takes the owner's words,
// on every surface: Voice Mode, the chat box, a hologram's command field and Optics' field and mic.
// Pure: no DOM and no app state. The app holds one instance (app.js), each surface asks it with the
// state of the moment (routerState(surface) in app.js) and carries out what it picked.
//
//   const router = createRouter();                       // the order: FINAL_ORDER (command-order.js)
//   router.register({ id, layer, surfaces, carrier, match, run });
//   const hit = router.route(readings, state);           // { id, action, reading, ... } | null (Claude)
//   router.route(readings, state, { after: hit });       // the next one in the order, when the surface
//                                                        // found that `hit` couldn't act after all
//   router.run(hit, ctx);                                // the entry's own run(), for registered commands
//
// v8.1 Phase 0 moved today's four routing chains in unchanged (registerTodayCommands, TODAY_ORDER):
// Voice Mode's heard(), the chat box, the hologram's field and Optics' field and mic; each kept its
// own order through its table (test/unit/command-router.today.test.mjs proves the router with
// TODAY_ORDER picks what each chain picked). The app routes by the final order (C1, Track 3):
// FINAL_ORDER in src/lib/command-order.js, one order for every surface, with its rules:
//   R3  a reading of more than MAX_WORDS (18) words goes only to carriers;
//   R7  another reading counts only when the best one isn't a question, and only for an action that
//       is free, undoable, unchecked and touches neither the camera nor the microphone;
//   the answer layer: a bare "cancel" or "no" answers whatever was asked last (the prompt or the top
//       question, by `askedAt`), and "stop" is never an answer (the stop layer takes it).

import { standbyCommand } from './wake/phrases.js';
import { matchScreenCommand } from './screen-commands.js';
import { matchMusicCommand } from './music-commands.js';
import { matchHomeBaseCommand } from './homebase.js';
import { matchBrainCommand } from './brain.js';
import { matchHologramCommand, commandNeedingPart, normalizeCommandText } from './hologram-commands.js';
import { matchOpticsCommand, voiceCameraRequest, voiceLiveViewRequest } from './optics-commands.js';
import { matchQuestionAnswer, matchPromptAnswer } from './voice-questions.js';
import { LAYERS, FINAL_ORDER, MAX_WORDS, isQuestion, isBareNo, isStopWord, askedLast } from './command-order.js';

/** The layers, in the final order (C1): what a new matcher declares it is. */
export { LAYERS, FINAL_ORDER, MAX_WORDS };
/** Where words come from. */
export const SURFACES = Object.freeze(['voice', 'chat', 'hologram', 'optics']);

/**
 * The state a matcher sees (contract (b)): app.js's routerState(surface) starts from this and fills
 * what exists; each track fills its own fields. Every field is always present.
 *   surface        'voice' | 'chat' | 'hologram' | 'optics'
 *   via            'voice' (heard) | 'typed'
 *   speaking       Jarvis is speaking (Voice Mode)
 *   check          the 2-second check is on screen (Voice Mode)
 *   questions      open owner questions, newest first: [{ id, choices, match, keep, check, askedAt }]
 *                  (Voice Mode; askedAt: when it was last said, for "asked last")
 *   prompt         the standing prompt (Jarvis for Chrome): { id, answers: [{ id, words, check, negative }],
 *                  askedAt } | null (an answer with `negative` is what a bare "cancel" or "no" means)
 *   replying       Voice Mode's own reply is streaming (words wait for it: a hologram building)
 *   tour           { active, atChoice, choices, stepId } | null                       (Track 2)
 *   hologram       the viewer on screen: { open, inWindow, parts: [{ id, name, aka }], selected } | null
 *   blueprintOpen  a blueprint sheet is on screen
 *   optics         { open, mode: 'live'|'aside'|'frozen'|null, liveView, card, cameraAllowed, sceneChanged } | null
 *   camera         Voice Mode's camera words with Optics closed: { supported, allowed, ios }
 *   windows        [{ id, kind, label, focused }]                                    (Track 4)
 *   reply          { links, hologram }: hologram = the one shown last over Voice Mode, while it can
 *                  open again for a command about it: { title, parts } | null
 *   chrome         { linked, online, task, contextUntil }                            (Track 6)
 *   music          { playing }
 *   homebase       { available (a home base object), linked (its brain is linked) }
 *   standby        { available (the Standby words can act here), open }
 *   voiceOpen      Voice Mode is open
 *   bestNamesPart  the best reading names a part of the hologram on screen (Voice Mode)
 *   hidden, phone
 */
export function emptyState(surface = 'voice') {
  return {
    surface,
    via: 'voice',
    speaking: false,
    check: false,
    questions: [],
    prompt: null,
    replying: false,
    tour: null,
    hologram: null,
    blueprintOpen: false,
    optics: null,
    camera: { supported: false, allowed: 'unknown', ios: false },
    windows: [],
    reply: { links: [], hologram: null },
    chrome: { linked: false, online: false, task: null, contextUntil: 0 },
    music: { playing: false },
    homebase: { available: false, linked: false },
    standby: { available: false, open: false },
    voiceOpen: false,
    bestNamesPart: false,
    hidden: false,
    phone: false,
  };
}

/**
 * Each surface's order: the passes the router makes over the readings, in turn.
 *   use          the matchers, in order: ids, or '@<layer>' for every matcher registered in that layer
 *                that the surface's table doesn't name (in registration order)
 *   readings     'all' (default: the best first, then each alternative) | 'best' | 'alternatives'
 *   best         ids taken on the best reading only (Apple Music: "play …" from another reading only
 *                when the best one is nothing else, in the pass after)
 *   anyReading   ids that take an alternative reading as today, whatever their action (Phase 0 kept
 *                today's behaviour; Track 3 applies R7 and empties these lists)
 *   when         'bestNamesNoPart': the pass runs only when the best reading names no part of the
 *                hologram on screen
 * Within a pass the readings come in turn and, for each, the matchers in turn: the first reading
 * that any of them takes wins (today's loop in Voice Mode).
 *
 * Phase 0 keeps today's matchers exactly in today's order; the '@layer' slots place new matchers
 * where the final order (C1) puts them: stop words and destinations before Screens, the thing on top
 * just before today's viewer words, app commands after them, media and camera after today's.
 * Track 3 declares the final order.
 */
export const TODAY_ORDER = deepFreeze({
  // Voice Mode's heard() (v7.8.1 voice-mode.js:2780-2846): Standby words (any reading), the question
  // waiting ("Shall I draw a blueprint …?"), words while its reply's hologram builds, then for each
  // reading Screens, the home base and its brain, Apple Music (best reading only) and the viewers
  // (Optics on top, a blueprint sheet's close words, the hologram, camera words with Optics closed),
  // then Apple Music from another reading.
  voice: [
    { use: ['standby', '@standby'], anyReading: ['standby'] },
    { use: ['prompt', 'question', '@answer'], anyReading: ['question'] },
    { use: ['reply-building'], readings: 'best' },
    {
      use: ['@stop', '@destination', 'screens', 'homebase', 'brain', 'music', '@top', 'optics', 'blueprint', 'hologram', '@app', '@media', 'camera', '@camera'],
      best: ['music'],
      anyReading: ['screens', 'homebase', 'brain', 'optics', 'blueprint', 'hologram', 'camera'],
    },
    { use: ['music'], readings: 'alternatives', anyReading: ['music'], when: 'bestNamesNoPart' },
  ],
  // The chat box (typed, or its microphone's words once in the box; v7.8.1 app.js:568).
  chat: [{ use: ['@standby', '@answer', '@stop', '@destination', 'screens', 'music', 'standby', 'homebase', 'brain', '@top', '@app', '@media', '@camera'] }],
  // A hologram's command field and its own microphone (v7.8.1 viewer.js:1532-1536; app.js sendFromViewer).
  hologram: [{ use: ['@standby', '@answer', '@stop', '@destination', '@top', 'hologram', 'screens', '@app', 'music', '@media', '@camera'] }],
  // Optics' field and its own microphone (v7.8.1 optics.js:1192-1206, 1662-1683; v8.0's typed live view words).
  optics: [{ use: ['@standby', '@answer', '@stop', '@destination', 'screens', '@top', 'optics', '@app', '@media', '@camera'] }],
});

const DEFAULT_FLAGS = Object.freeze({ free: true, undo: true, check: false, camera: false, mic: false });

/**
 * An action with its flags filled in: { do, free = true, undo = true, check = false, camera = false,
 * mic = false, ...args } (mic: it turns the microphone off or Voice Mode away, v8.1).
 */
export function normalizeAction(action, id = '') {
  const a = action && typeof action === 'object' ? action : {};
  const out = { ...DEFAULT_FLAGS, ...a };
  out.do = typeof a.do === 'string' && a.do ? a.do : id;
  for (const key of Object.keys(DEFAULT_FLAGS)) out[key] = !!out[key];
  return out;
}

/** R7: another reading may be taken only for an action that is free, undoable, unchecked, no camera, no microphone. */
export function alternativeAllowed(action) {
  const a = normalizeAction(action);
  return a.free && a.undo && !a.check && !a.camera && !a.mic;
}

/** The readings, best first: trimmed, non-empty, each once (case aside), as Voice Mode's heard() kept them. */
export function cleanReadings(readings) {
  const list = Array.isArray(readings) ? readings : [readings];
  const out = [];
  for (const r of list) {
    const t = typeof r === 'string' ? r.trim() : '';
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** Words in a sentence (for the word cap). */
export function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * A router. `order`: the per-surface tables (default FINAL_ORDER, src/lib/command-order.js).
 * `wordCap`: R3's cap on the words of a reading a matcher is asked about (carriers are exempt):
 * MAX_WORDS (18) by default. `questionFirst`: R7, no other reading is tried when the best one is a
 * question (on by default). TODAY_ORDER (Phase 0's tables) had neither, and keeps that by default.
 */
export function createRouter({ order = FINAL_ORDER, wordCap = order === TODAY_ORDER ? Infinity : MAX_WORDS, questionFirst = order !== TODAY_ORDER } = {}) {
  const entries = new Map(); // id -> entry, in registration order
  const tables = new Map(Object.entries(order || {}));
  let version = 0;
  const plans = new Map(); // surface -> { version, passes }

  /**
   * Add a matcher (contract (b)). Returns a function that removes it.
   *   id         unique ('screens', 'tour-words', …)
   *   layer      one of LAYERS
   *   surfaces   where it listens (default: all four)
   *   carrier    it carries the owner's words out (a Chrome task, music, research): exempt from the
   *              word cap, so anchor it by its own prefix or suffix
   *   match(text, state, { readings, index, surface }) → action | null: pure; index 0 is the best reading
   *   run(action, ctx) → { say? } | Promise<{ say? }> | false (optional): carries the action out (false:
   *              it couldn't after all, and the router goes on). Today's chains are carried out by
   *              their surfaces themselves, by id, and have no run.
   */
  function register({ id, layer, surfaces = SURFACES, carrier = false, match, run = null } = {}) {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) throw new TypeError(`router: a matcher needs an id (got ${JSON.stringify(id)})`);
    if (entries.has(id)) throw new Error(`router: "${id}" is registered already`);
    if (!LAYERS.includes(layer)) throw new TypeError(`router: "${id}" has an unknown layer ${JSON.stringify(layer)}`);
    if (typeof match !== 'function') throw new TypeError(`router: "${id}" needs match(text, state)`);
    const list = (Array.isArray(surfaces) ? surfaces : [surfaces]).filter((s) => SURFACES.includes(s));
    const entry = Object.freeze({ id, layer, surfaces: Object.freeze(list), carrier: !!carrier, match, run: typeof run === 'function' ? run : null });
    entries.set(id, entry);
    version += 1;
    return () => {
      if (entries.get(id) === entry) {
        entries.delete(id);
        version += 1;
      }
    };
  }

  /** The surface's passes with its slots turned into matcher ids (cached until a matcher comes or goes). */
  function planFor(surface) {
    const cached = plans.get(surface);
    if (cached && cached.version === version) return cached.passes;
    const table = tables.get(surface) || [];
    const named = new Set();
    for (const pass of table) for (const slot of pass.use || []) if (!slot.startsWith('@')) named.add(slot);
    const passes = table.map((pass) => {
      const ids = [];
      for (const slot of pass.use || []) {
        if (slot.startsWith('@')) {
          const layer = slot.slice(1);
          for (const e of entries.values()) if (e.layer === layer && !named.has(e.id) && e.surfaces.includes(surface) && !ids.includes(e.id)) ids.push(e.id);
        } else if (entries.has(slot) && entries.get(slot).surfaces.includes(surface) && !ids.includes(slot)) {
          ids.push(slot);
        }
      }
      return { ids, readings: pass.readings || 'all', best: new Set(pass.best || []), anyReading: new Set(pass.anyReading || []), when: pass.when || null };
    });
    plans.set(surface, { version, passes });
    return passes;
  }

  /**
   * The first matcher, in the surface's order, that takes one of the readings: { id, layer, carrier,
   * action, reading, index (0 = the best reading), pos }, or null (the words go to Claude). `after`: a
   * hit from before, to go on from the one after it (that hit's surface couldn't act on it). A matcher
   * that throws is skipped.
   */
  function route(readings, state = {}, { after = null } = {}) {
    const list = cleanReadings(readings);
    if (!list.length) return null;
    const st = state && typeof state === 'object' ? state : {};
    const surface = SURFACES.includes(st.surface) ? st.surface : 'voice';
    const passes = planFor(surface);
    const from = after && after.pos ? after.pos : null;
    // R7: the best reading is a question ("what's the best camera"): no other reading is tried.
    const readable = questionFirst && isQuestion(list[0]) ? 1 : list.length;
    for (let p = from ? from.pass : 0; p < passes.length; p += 1) {
      const pass = passes[p];
      if (pass.when === 'bestNamesNoPart' && st.bestNamesPart) continue;
      const first = pass.readings === 'alternatives' ? 1 : 0;
      const last = pass.readings === 'best' ? Math.min(1, readable) : readable;
      for (let i = first; i < last; i += 1) {
        if (from && p === from.pass && i < from.index) continue;
        const reading = list[i];
        for (let j = 0; j < pass.ids.length; j += 1) {
          if (from && p === from.pass && i === from.index && j <= from.slot) continue;
          const id = pass.ids[j];
          if (i > 0 && pass.best.has(id)) continue;
          const entry = entries.get(id);
          if (!entry) continue;
          if (!entry.carrier && wordCount(reading) > wordCap) continue;
          let action = null;
          try {
            action = entry.match(reading, st, { readings: list, index: i, surface });
          } catch {
            action = null; // a matcher that throws is skipped: the words go on down the order
          }
          if (!action || typeof action !== 'object') continue;
          const normal = normalizeAction(action, id);
          if (i > 0 && !pass.anyReading.has(id) && !alternativeAllowed(normal)) continue;
          return { id, layer: entry.layer, carrier: entry.carrier, action: normal, reading, index: i, pos: { pass: p, index: i, slot: j } };
        }
      }
    }
    return null;
  }

  /** Carry out a hit with its entry's run(): what run() returns, or false (no run, or it is gone). */
  function run(hit, ctx = {}) {
    const entry = hit && entries.get(hit.id);
    if (!entry || !entry.run) return false;
    return entry.run(hit.action, { ...ctx, hit });
  }

  return {
    register,
    route,
    run,
    has: (id) => entries.has(id),
    /** The registered matchers: [{ id, layer, surfaces, carrier, match, run }], in registration order. */
    entries: () => [...entries.values()],
    /** A surface's matcher ids, pass by pass, as route() tries them (for tests and the T3 harness). */
    order: (surface) => planFor(surface).map((p) => [...p.ids]),
    /** Replace a surface's table (Track 3's final order; tests). */
    setOrder(surface, passes) {
      if (!SURFACES.includes(surface)) throw new TypeError(`router: unknown surface ${JSON.stringify(surface)}`);
      tables.set(surface, deepFreeze(JSON.parse(JSON.stringify(passes || []))));
      version += 1;
    },
  };
}

// ================================================================== today's matchers (Phase 0)

/** Hologram commands that open the hologram shown last over Voice Mode again (free), once it was closed. */
export const REOPEN_ACTIONS = Object.freeze(new Set(['explode', 'collapse', 'select', 'focus', 'isolate', 'labels-on', 'labels-off', 'view', 'parts-list', 'photos', 'show-all', 'zoom-in', 'zoom-out', 'rotate', 'blueprint']));

const opticsOnTop = (s) => !!(s.optics && s.optics.open) && !s.hologram && !s.blueprintOpen;

/** A hologram command for the parts given (or one that needs a part: "isolate it"). */
function partsCommand(text, parts, selected) {
  const cmd = matchHologramCommand(text, Array.isArray(parts) ? parts : [], { selected: selected || null });
  if (cmd) return { do: 'hologram', command: cmd, free: cmd.action !== 'blueprint' };
  const wants = commandNeedingPart(text);
  return wants ? { do: 'hologram', command: { action: wants }, needsPart: true } : null;
}

// Optics' words: what each one does to money and the camera (R6, R7).
const OPTICS_PAID = new Set(['look', 'ask', 'more', 'part', 'hologram']);
const OPTICS_CAMERA = new Set(['look', 'flip', 'live']);

function opticsAction(cmd) {
  const on = cmd.action === 'watch' || cmd.action === 'liveview' ? cmd.on === true : false;
  return {
    do: 'optics',
    command: cmd,
    free: !OPTICS_PAID.has(cmd.action) && !on,
    camera: OPTICS_CAMERA.has(cmd.action) || on,
  };
}

/** The prompt's answer whose `negative` marks it as its no (else one called deny or cancel), or null. */
function negativeAnswer(prompt) {
  const answers = Array.isArray(prompt && prompt.answers) ? prompt.answers.filter((a) => a && typeof a.id === 'string') : [];
  const a = answers.find((x) => x.negative) || answers.find((x) => x.id === 'deny' || x.id === 'cancel');
  return a ? a.id : null;
}

/** The answer layer, the prompt (critique H4): its reserved words; a bare no only when it was asked last. */
function promptAnswer(text, s) {
  if (!s.prompt) return null;
  const hit = matchPromptAnswer(s.prompt, text);
  if (hit) return hit;
  if (!isBareNo(text) || askedLast(s) !== 'prompt') return null;
  const no = negativeAnswer(s.prompt);
  return no ? { do: 'prompt-answer', prompt: s.prompt.id, answer: no, check: false, undo: false } : null;
}

/**
 * The answer layer, the top question: its choice (never "stop": the stop layer's); a bare "cancel" or
 * "no" only when it was asked last (after the prompt), and then a question with no such choice is set
 * aside (`dismiss`) rather than passed on. An answer can't be undone: the best reading only (R7).
 */
function questionAnswer(text, s, ctx) {
  const top = Array.isArray(s.questions) && s.questions.length ? s.questions[0] : null;
  if (!top || isStopWord(text)) return null;
  const bare = isBareNo(text);
  if (bare && askedLast(s) === 'prompt') return null;
  const hit = matchQuestionAnswer(s.questions, text, ctx && ctx.readings);
  if (hit) return { ...hit, undo: false };
  return bare ? { do: 'answer', question: top.id, choice: null, dismiss: true, check: false, undo: false } : null;
}

/**
 * Screens' words, with v8.1's fixes (C3): "expand this in a different window" is a window, not an
 * explode (F2); "bring … back" and "close …" go to the hologram or blueprint on top when no screen is
 * open and it takes them ("bring everything back": every part shown), as in its own field (F3, R5).
 */
function screensCommand(text, s) {
  let m = matchScreenCommand(text);
  if (!m && /^\W*(?:(?:hey|ok|okay)\W+)?(?:jarvis\W+)?expand\b/i.test(String(text || ''))) m = matchScreenCommand(String(text).replace(/\bexpand\b/i, 'open'));
  if (!m) return null;
  if ((m.action === 'back' || m.action === 'close') && !(Array.isArray(s.windows) && s.windows.length)) {
    if (s.hologram && s.hologram.open && partsCommand(text, s.hologram.parts, s.hologram.selected)) return null;
    if (s.blueprintOpen && m.action === 'close') return null;
  }
  return m;
}

const TODAY_COMMANDS = [
  // "Jarvis, standby", "go to sleep": Voice Mode closes into Standby; elsewhere (the chat, a hologram's
  // field, Optics' field), Standby opens (v8.1 C2: the Standby words everywhere).
  {
    id: 'standby',
    layer: 'standby',
    match: (text, s) => (s.standby && s.standby.available && standbyCommand(text) ? { do: 'standby' } : null),
  },
  // The standing prompt (Jarvis for Chrome): its reserved answer words; a bare "cancel" or "no" when
  // it was asked last means its no (the answer marked `negative`).
  { id: 'prompt', layer: 'answer', surfaces: ['voice'], match: (text, s) => promptAnswer(text, s) },
  // The owner question on top of the stack (the blueprint question, a tour decision, the research offer).
  { id: 'question', layer: 'answer', surfaces: ['voice'], match: (text, s, ctx) => questionAnswer(text, s, ctx) },
  // Words heard while Voice Mode's own reply streams (the owner tapped the viewer's mic while a
  // hologram builds): a viewer command acts on the live model, anything else waits for the reply.
  { id: 'reply-building', layer: 'answer', surfaces: ['voice'], match: (text, s) => (s.replying ? { do: 'reply-building' } : null) },
  // Screens: "put it on my other screen", "float it", "bring it back".
  { id: 'screens', layer: 'destination', match: (text, s) => (screensCommand(text, s) ? { do: 'screens' } : null) },
  // The home base (v7.5): "how's the home base?".
  {
    id: 'homebase',
    layer: 'media',
    surfaces: ['voice', 'chat'],
    match: (text, s) => (s.homebase && s.homebase.available && matchHomeBaseCommand(text) ? { do: 'homebase' } : null),
  },
  // Its brain (v7.6), while one is linked: "brief me", "research … in the background", "watch for …".
  {
    id: 'brain',
    layer: 'media',
    surfaces: ['voice', 'chat'],
    carrier: true,
    match: (text, s) => {
      if (!(s.homebase && s.homebase.available && s.homebase.linked)) return null;
      const cmd = matchBrainCommand(text);
      return cmd ? { do: 'brain', kind: cmd.kind, free: cmd.kind !== 'brief', undo: cmd.kind === 'results' } : null;
    },
  },
  // Apple Music: "play Back in Black" (in a hologram's field only while Voice Mode is closed).
  {
    id: 'music',
    layer: 'media',
    surfaces: ['voice', 'chat', 'hologram'],
    carrier: true,
    match: (text, s) => {
      if (s.surface === 'hologram' && s.voiceOpen) return null;
      const cmd = matchMusicCommand(text);
      return cmd ? { do: 'music', kind: cmd.action } : null;
    },
  },
  // Optics' words: in Voice Mode while Optics is on top; in Optics' own field and microphone (typed
  // there, only the live view's words and "stop watching" (v8.0); the rest is the Look's question).
  {
    id: 'optics',
    layer: 'top',
    surfaces: ['voice', 'optics'],
    carrier: true, // a question about "this" carries the owner's words to a Look (R3)
    match: (text, s) => {
      if (!(s.optics && s.optics.open)) return null;
      if (s.surface === 'voice' && !opticsOnTop(s)) return null;
      const cmd = matchOpticsCommand(text, { frozen: s.optics.mode === 'frozen' });
      if (!cmd) return null;
      if (s.surface === 'optics' && s.via === 'typed' && !(cmd.action === 'liveview' || (cmd.action === 'watch' && !cmd.on))) return null;
      return opticsAction(cmd);
    },
  },
  // A blueprint sheet on top (Voice Mode): "close", "close the blueprint", "back to the hologram", "go back".
  {
    id: 'blueprint',
    layer: 'top',
    surfaces: ['voice'],
    match: (text, s) => {
      if (!s.blueprintOpen) return null;
      const cmd = matchHologramCommand(String(text || ''), [], {});
      const back = /^(?:go )?back$/.test(normalizeCommandText(text));
      return (cmd && (cmd.action === 'close' || cmd.action === 'close-blueprint')) || back ? { do: 'close-blueprint' } : null;
    },
  },
  // The hologram's commands: on screen, or (Voice Mode) the one shown last, which opens again for them.
  {
    id: 'hologram',
    layer: 'top',
    surfaces: ['voice', 'hologram'],
    match: (text, s) => {
      if (s.surface === 'voice' && opticsOnTop(s)) return null;
      if (s.hologram && s.hologram.open) return partsCommand(text, s.hologram.parts, s.hologram.selected);
      if (s.surface !== 'voice' || s.blueprintOpen) return null;
      const last = s.reply && s.reply.hologram;
      if (!last || !Array.isArray(last.parts) || !last.parts.length) return null;
      const cmd = matchHologramCommand(String(text || ''), last.parts, {});
      return cmd && REOPEN_ACTIONS.has(cmd.action) ? { do: 'hologram', command: cmd, reopen: true, free: cmd.action !== 'blueprint' } : null;
    },
  },
  // Camera words with Optics closed (Voice Mode): "what am I looking at?", "live view"; never while
  // a hologram or blueprint is on screen (the words are about it, v8.0).
  {
    id: 'camera',
    layer: 'camera',
    surfaces: ['voice'],
    match: (text, s) => {
      if ((s.optics && s.optics.open) || !(s.camera && s.camera.supported)) return null;
      const how = { viewerOpen: !!(s.hologram || s.blueprintOpen), cameraAllowed: s.camera.allowed, ios: !!s.camera.ios };
      const live = voiceLiveViewRequest(text, how);
      if (live) return { do: 'camera', live, free: false, camera: true };
      const look = voiceCameraRequest(text, how);
      return look ? { do: 'camera', look, free: false, camera: true } : null;
    },
  },
];

// Phase 0's versions of the matchers v8.1 changed (C1-C3), for the proof that the router with
// TODAY_ORDER picks what today's chains picked (test/unit/command-router.today.test.mjs).
const PHASE0 = {
  standby: { surfaces: ['voice', 'chat'] },
  prompt: { match: (text, s) => matchPromptAnswer(s.prompt, text) },
  question: { match: (text, s, ctx) => matchQuestionAnswer(s.questions, text, ctx && ctx.readings) },
  screens: { match: (text) => (matchScreenCommand(text) ? { do: 'screens' } : null) },
  optics: { carrier: false },
};

/** The ids of today's matchers (registerTodayCommands), which the surfaces carry out themselves. */
export const TODAY_IDS = Object.freeze(TODAY_COMMANDS.map((c) => c.id));

/**
 * Register today's matchers, as v8.1 has them (the Standby words on every surface, the answer layer's
 * arbitration, Screens' fixes). `phase0`: exactly as Phase 0 moved them in. Returns the unregister
 * functions.
 */
export function registerTodayCommands(router, { phase0 = false } = {}) {
  return TODAY_COMMANDS.map((c) => router.register(phase0 && PHASE0[c.id] ? { ...c, ...PHASE0[c.id] } : c));
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}
