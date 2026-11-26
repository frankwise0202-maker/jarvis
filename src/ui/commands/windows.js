// Windows and Chrome tabs (Track 4: D1-D6, G1): this builder's voice and typed commands (v8.1, SPEC §31).
//
//   windows           "close the camera window", "close everything", "side by side", "camera on the left,
//                     hologram on the right", "do this in this window", "show me the hologram window",
//                     "swap them", "make it bigger", "float yourself" (src/lib/window-commands.js) -> the
//                     Screens controller's windowCommand(); Jarvis says one short line (screenAck), the
//                     chat and the fields show it (screenMessage)
//   chrome-open       "pull this up in Chrome", "open the second link", "google USB-C chargers", "open
//                     YouTube", "close that tab" (src/lib/chrome-commands.js) -> src/ui/browser-tab.js: the
//                     Jarvis window when Jarvis for Chrome is linked and online, else a tab, or a window
//                     beside Jarvis while Optics, a walkthrough or the live view is on screen. A search's
//                     action has `check`: Voice Mode shows and says the words for 2 seconds first (R8).
//   windows-hologram  the hologram's own words ("explode it", "show the battery") while it is in a window
//                     and no viewer is open here (D3): they act in that window (Voice Mode)
// Screens' own words ("put the camera in a window", "bring the hologram back", "close the other screen")
// stay today's `screens` matcher (command-router.js), carried out by each surface through the controller.
//
// app.js calls register() once at start (registerCommandModules) with the shared deps plus these:
//   screens          the Screens controller (src/ui/screens/controller.js)
//   tabs             createBrowserTabs(…) (src/ui/browser-tab.js)
//   thisInputs()     resolveThis's inputs now: { linkOnScreen, look, liveSummary, hologram, reply, lastQuestion }
//   links()          the newest reply's links [{ url, title }]
//   closeViewers()   "close everything": the main window's viewers close too (Voice Mode stays)
//
// Keep this module importable in Node (no DOM at import time): the T3 harness
// (test/unit/command-router.test.mjs) registers every module with fake deps. Its phrases are in the
// windows section of test/unit/fixtures/voice-corpus.mjs, its collisions in the windows section of
// test/unit/fixtures/collisions.mjs.

import { matchWindowCommand } from '../../lib/window-commands.js';
import { matchChromeCommand } from '../../lib/chrome-commands.js';
import { matchHologramCommand } from '../../lib/hologram-commands.js';
import { matchOpticsCommand } from '../../lib/optics-commands.js';
import { resolveThis } from '../../lib/this-target.js';
import { WINDOW_HOLOGRAM_ACTIONS, screenAck, screenMessage } from '../screens/controller.js';
import { commandAck } from '../voice-visuals.js';

const call = (fn, fallback, ...args) => {
  try {
    return typeof fn === 'function' ? fn(...args) : fallback;
  } catch {
    return fallback;
  }
};
const IN_WINDOW = new Set([...WINDOW_HOLOGRAM_ACTIONS, 'close']);
// Words that name the hologram itself ("explode the hologram", "rotate the model"): its window takes them
// even with Optics on top here (ROUTING-10).
const NAMES_HOLOGRAM = /\b(?:holograms?|models?)\b/i;
const CLOSE_WORDS = /^\W*(?:close|close it)\W*$/i;

/**
 * With Optics open here, the words Optics itself takes ("close", "close it", "expand it", "expand the picture",
 * "show me the camera"): they stay Optics' unless they name the hologram (ROUTING-10). Every other hologram
 * command still acts in the window, free (D3; ROUTING-R2-1).
 */
function opticsKeeps(text, state) {
  const o = state && state.optics;
  if (!(o && o.open)) return false;
  const words = String(text || '');
  if (NAMES_HOLOGRAM.test(words)) return false;
  return CLOSE_WORDS.test(words) || !!matchOpticsCommand(words, { frozen: o.mode === 'frozen' });
}

/** The window showing a hologram (the one with the focus, else the newest: the last in the list). */
function hologramWindow(state) {
  const list = (state && Array.isArray(state.windows) ? state.windows : []).filter((w) => w && w.kind === 'hologram');
  return list.find((w) => w.focused) || list[list.length - 1] || null;
}

/**
 * @param {{ register: Function }} router  the app's command router
 * @param {object} deps  shared: { getSettings, saveSettings, toast, voice(), routerState(surface, local),
 *   phone, demo }, plus screens, tabs, thisInputs(), links(), closeViewers() (app.js)
 */
export function register(router, deps = {}) {
  const spoken = (ctx) => !!(ctx && (ctx.spoken || ctx.surface === 'voice'));
  const sourceOf = (ctx) => (ctx && ctx.via === 'voice' ? 'voice' : 'typed');

  router.register({
    id: 'windows',
    layer: 'destination',
    match: (text, state) => matchWindowCommand(text, state),
    run: (action, ctx) => {
      const screens = deps.screens;
      if (!screens || typeof screens.windowCommand !== 'function') return false;
      return screens.windowCommand(action, { source: sourceOf(ctx) }).then((o) => {
        if (o && o.viewers) call(deps.closeViewers, null);
        return { say: spoken(ctx) ? screenAck(o) : screenMessage(o) };
      });
    },
  });

  router.register({
    id: 'chrome-open',
    layer: 'destination',
    match: (text, state) => matchChromeCommand(text, state),
    run: (action, ctx) => {
      const tabs = deps.tabs;
      if (!tabs || typeof tabs.pullUp !== 'function') return false;
      if (action.do === 'chrome-close-tab') return { say: tabs.closeTab().line };
      const kind = action.target && action.target.kind;
      const thisTarget = kind === 'this' || kind === 'this-search' ? resolveThis(call(deps.thisInputs, {}) || {}) : null;
      return tabs.pullUp(action, { thisTarget, links: call(deps.links, []) || [], source: sourceOf(ctx) }).then((o) => ({ say: o.line }));
    },
  });

  // D3: the hologram is in a window and no viewer is open here (a hologram, a blueprint): its words act
  // there. A command a window can't run (photos, a blueprint, the parts list) is left to the next one in
  // the order (the hologram shown last opens here again, as before). With Optics on top here, Optics keeps
  // its own words ("close", "expand it", "show me the camera"; ROUTING-10) and the window everything else it
  // takes, as without Optics ("explode it", "show the battery": ROUTING-R2-1).
  router.register({
    id: 'windows-hologram',
    layer: 'top',
    surfaces: ['voice'],
    match: (text, state) => {
      if ((state.hologram && state.hologram.open) || state.blueprintOpen) return null;
      if (opticsKeeps(text, state)) return null;
      const w = hologramWindow(state);
      if (!w) return null;
      const cmd = matchHologramCommand(String(text || ''), Array.isArray(w.parts) ? w.parts : [], { selected: w.selected || null });
      if (!cmd || !IN_WINDOW.has(cmd.action)) return null;
      return { do: 'windows-hologram', command: cmd, undo: cmd.action !== 'close' };
    },
    run: (action) => {
      const res = deps.screens && typeof deps.screens.commandIn === 'function' ? call(() => deps.screens.commandIn('hologram', action.command), null) : null;
      if (!res) return false;
      return { say: action.command.action === 'close' ? 'Closed the hologram window.' : commandAck(action.command) };
    },
  });
}
