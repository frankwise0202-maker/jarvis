// Walkthroughs (Track 2: B1, B3-B7): this builder's voice and typed commands (v8.1; tours writes this file).
//
// Two matchers in the router's `top` layer, before the hologram's own words (src/lib/tour.js does the
// matching; whole sentences only):
//   tour        only while a tour runs: next, back, repeat, pause, continue, end ("stop the tour",
//               "that's enough"), a choice at a decision ("enclosed", "opened", "both", "you pick"),
//               "show it enclosed / opened", "skip to the fan". "Back" alone means the previous step
//               here (outside a tour it still turns the model to its back view).
//   tour.start  while a hologram is on screen, or the newest reply showed one (critique L3: not an older
//               one): "walk me through it" (the object tour), "walk me through the battery" (the part
//               tour); and, with a part selected and no tour, "show it enclosed / opened" (that view of
//               the part). Registered as tour-start while the router's ids can't hold a dot.
// A bare "stop" is the stop layer's (voice): it stops Jarvis's voice, and a tour whose narration is
// cut pauses by itself.
//
// Every action is free and undoable, and none carries the owner's words out. A word that moves the
// tour on says no line of its own: the step it starts is said (Voice Mode lets that narration go on).
// Pause, end and a word that can't act say a short line (R9).
//
// deps (this module's own, added in app.js): tours: { viewer() → the open hologram viewer or null,
//   openReply() → the viewer opened on the newest reply's hologram, or null }. The viewer does the
//   work: startTour, tour(), tourCommand(action), showView(view, partId).
//
// Keep this module importable in Node (no DOM at import time): the T3 harness
// (test/unit/command-router.test.mjs) registers every module with fake deps. Its phrases go in the
// tours section of test/unit/fixtures/voice-corpus.mjs, and its collisions in the tours section of
// test/unit/fixtures/collisions.mjs.

import { matchShowView, matchTourCommand, matchTourStart } from '../../lib/tour.js';

const SURFACES = ['voice', 'hologram'];
const START_SURFACES = ['voice', 'hologram', 'chat'];
const START_IDS = ['tour.start', 'tour-start'];

const LINES = {
  paused: 'Paused. Say continue when you’re ready.',
  waiting: 'I’ll wait.',
  ended: 'Okay, that’s the end of the tour.',
  last: 'That was the last step. Say back to hear it again, or stop the tour.',
  building: 'I’ll walk you through it once it’s built.',
  nogl: 'This device can’t show the hologram, so I can’t walk you through it.',
  none: 'I can’t walk you through that one.',
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The tour's choices as the matcher wants them (the state may carry just their ids). */
function choicesOf(tour) {
  return (Array.isArray(tour.choices) ? tour.choices : []).map((c) => (typeof c === 'string' ? { id: c, label: c } : c)).filter((c) => isObj(c) && typeof c.id === 'string');
}

const partsOf = (holo) => (holo && Array.isArray(holo.parts) ? holo.parts : []);

/** The tour words while a tour runs (state.tour, filled by app.js routerState). */
export function matchTourWords(text, state) {
  const tour = state && state.tour;
  if (!isObj(tour) || !tour.active) return null;
  const m = matchTourCommand(text, {
    atChoice: !!tour.atChoice,
    choices: choicesOf(tour),
    defaultId: tour.defaultId || null,
    parts: partsOf(state.hologram),
    stepWaits: !!tour.waits,
    paused: !!tour.paused,
    justSaid: !!tour.justSaid,
  });
  if (!m) return null;
  const { action, ...args } = m;
  return { do: action, ...args };
}

/**
 * The words that start a tour, or (no tour, a part selected) show it enclosed or opened: the
 * hologram on screen, else the newest reply's (state.tourReply, filled by app.js routerState).
 */
export function matchTourStartWords(text, state) {
  if (!isObj(state) || (isObj(state.tour) && state.tour.active)) return null;
  const holo = isObj(state.hologram) && state.hologram.open ? state.hologram : null;
  const reply = !holo && isObj(state.tourReply) ? state.tourReply : null;
  const shown = holo || reply;
  if (!shown) return null;
  const start = matchTourStart(text, { parts: partsOf(shown), title: shown.title || '' });
  if (start) return { do: 'tour-start', partId: start.partId || null, reopen: !holo };
  if (holo && holo.selected) {
    const view = matchShowView(text);
    if (view) return { do: 'tour-view', view, partId: holo.selected };
  }
  return null;
}

/**
 * @param {{ register: Function }} router  the app's command router
 * @param {object} deps  shared: { getSettings, saveSettings, toast, voice() (the open Voice Mode's api,
 *   or null), routerState(surface, local), phone, demo }, plus this module's own: tours (above)
 */
export function register(router, deps = {}) {
  const own = deps && isObj(deps.tours) ? deps.tours : {};
  const viewerNow = () => {
    try {
      return typeof own.viewer === 'function' ? own.viewer() : null;
    } catch {
      return null;
    }
  };

  router.register({
    id: 'tour',
    layer: 'top',
    surfaces: SURFACES,
    match: (text, state) => matchTourWords(text, state),
    run(action) {
      const viewer = viewerNow();
      if (!viewer || typeof viewer.tourCommand !== 'function') return false;
      const before = typeof viewer.tour === 'function' ? viewer.tour() : null;
      if (action.do === 'tour-next' && before && before.status === 'done') return { say: LINES.last };
      const ok = viewer.tourCommand(action);
      if (action.do === 'tour-end') return { say: LINES.ended };
      if (action.do === 'tour-pause') return { say: ok ? LINES.paused : LINES.waiting };
      if (ok && typeof ok === 'object' && typeof ok.say === 'string') return { say: ok.say };
      return ok ? { say: '' } : false;
    },
  });

  const start = {
    layer: 'top',
    surfaces: START_SURFACES,
    match: (text, state) => matchTourStartWords(text, state),
    run(action) {
      let viewer = viewerNow();
      if (action.do === 'tour-view') {
        if (!viewer || typeof viewer.showView !== 'function') return false;
        const out = viewer.showView(action.view, action.partId);
        return out && out.say ? { say: out.say } : false;
      }
      if (!viewer && action.reopen && typeof own.openReply === 'function') {
        try {
          viewer = own.openReply();
        } catch {
          viewer = null;
        }
      }
      if (!viewer || typeof viewer.startTour !== 'function') return false;
      const res = viewer.startTour({ partId: action.partId || null });
      if (res && res.ok) return { say: '' }; // the tour's first step is its line
      return { say: LINES[res && res.reason] || LINES.none };
    },
  };
  // The router's ids may not hold a dot yet (voice's order names it tour.start).
  let registered = false;
  for (const id of START_IDS) {
    if (registered) break;
    try {
      router.register({ ...start, id });
      registered = true;
    } catch (err) {
      if (!/needs an id/.test(String(err && err.message))) throw err;
    }
  }
}
