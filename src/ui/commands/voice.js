// Voice for everything (Track 3: C1-C6): this builder's voice and typed commands (v8.1; voice writes this file).
//
// app.js calls register() once at start (registerCommandModules), with the app's shared deps plus
// the ones added in this module's own call there. Three matchers, from src/lib/app-commands.js:
//   stop            layer stop (3), every surface: a bare "stop" stops everything that runs (the tour
//                   pauses; a Chrome task, the live view, a preview and Jarvis's voice stop); nothing
//                   running: "Okay."
//   voice-controls  layer app (6), Voice Mode only: "stop talking", "read the full answer", "repeat
//                   that", "stop listening", "exit Voice Mode" (Voice Mode carries them out itself)
//   app             layer app (6), every surface: "new chat", "open history / settings / the library /
//                   mission control / the home base", "speak slower", "turn off continuous", "send
//                   right away", "use George", "how much have I spent today"
//   screen-look     SHOULD C5, layer destination, every surface: "look at my screen" offers a one-tap
//                   button with a Look's price (the screen's share picker needs a tap)
//   briefing        SHOULD C6, layer app, Voice Mode: "brief me" with no home base linked: Voice Mode
//                   asks with the price first; run() gives the briefing protocol's words to send
// Each says one short line (appCommandLine). Keep this module importable in Node (no DOM at import
// time): the T3 harness (test/unit/command-router.test.mjs) registers it with fake deps.

import { matchAppCommand, matchVoiceControl, matchStopWord, matchScreenLook, matchBriefing, appCommandLine, nextVoiceRate } from '../../lib/app-commands.js';

const call = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);

/**
 * @param {{ register: Function }} router  the app's command router
 * @param {object} deps  shared: { getSettings, saveSettings, toast, voice() (the open Voice Mode's api,
 *   or null), routerState(surface, local), phone, demo }, plus this module's own (app.js):
 *   newChat()                        a new chat, as ⌘K
 *   openSheet(sheet, { section, surface })  opens history, settings, the library, Mission Control or
 *                                    the home base as its button does → { linked?, none?, leave? } (what
 *                                    the line says; leave: Voice Mode says the line, closes, then calls it)
 *   useVoice(which)                  'george' | 'device' → Promise<{ ok, needsDownload, device }>
 *   spend()                          { todayUsd, monthUsd, liveUsd }
 *   stopTarget(target)               stops one thing a bare "stop" names ('tour', 'chrome', 'liveview',
 *                                    'music', 'speech')
 *   screenLook({ surface })          offers the button: { supported, shown } (shown: its line is on it already)
 *   briefing()                       the briefing protocol's words: { send, mode } | false
 */
export function register(router, deps = {}) {
  router.register({
    id: 'stop',
    layer: 'stop',
    match: (text, state) => matchStopWord(text, state),
    run: (action) => {
      // What each stop did, where it says (the Chrome target: { withdrawn, stopping }), shapes the line.
      const did = {};
      for (const target of action.targets || []) {
        try {
          did[target] = call(deps.stopTarget, target);
        } catch (err) {
          console.warn(`[voice] couldn't stop ${target}`, err);
        }
      }
      return { say: appCommandLine(action, { stopped: did }) };
    },
  });

  // Voice Mode's own controls: Voice Mode acts on them itself (voice-mode.js act()).
  router.register({
    id: 'voice-controls',
    layer: 'app',
    surfaces: ['voice'],
    match: (text, state) => matchVoiceControl(text, state),
  });

  router.register({
    id: 'app',
    layer: 'app',
    match: (text, state) => matchAppCommand(text, state),
    run: (action, ctx = {}) => runApp(action, ctx, deps),
  });

  // SHOULD C5: "look at my screen" (a place the owner names: before the hologram's own "look at <part>").
  router.register({
    id: 'screen-look',
    layer: 'destination',
    match: (text) => matchScreenLook(text),
    run: (action, ctx = {}) => {
      const out = call(deps.screenLook, { surface: ctx.surface || 'chat' }) || {};
      return { say: out.shown ? '' : appCommandLine(action, out) };
    },
  });

  // SHOULD C6: "brief me" with no home base: Voice Mode asks first (the price), then sends what run() gives.
  router.register({
    id: 'briefing',
    layer: 'app',
    surfaces: ['voice'],
    match: (text, state) => matchBriefing(text, state),
    run: () => call(deps.briefing) || false,
  });
}

/** Carry out one of the app's commands: { say, leave? } (or a promise of it), the line Jarvis says. */
export function runApp(action, ctx, deps) {
  const settings = () => call(deps.getSettings) || {};
  switch (action.do) {
    case 'new-chat':
      call(deps.newChat);
      return { say: appCommandLine(action) };
    case 'open': {
      const out = call(deps.openSheet, action.sheet, { section: action.section || null, surface: ctx.surface || 'chat' }) || {};
      return { say: appCommandLine(action, out), ...(typeof out.leave === 'function' ? { leave: out.leave } : {}) };
    }
    case 'voice-rate': {
      const now = Number(settings().voiceRate) || 1;
      const rate = nextVoiceRate(now, !!action.faster);
      if (rate !== now) call(deps.saveSettings, { voiceRate: rate });
      return { say: appCommandLine(action, { rate, limit: rate === now }) };
    }
    case 'setting': {
      call(deps.saveSettings, { [action.key]: action.value });
      const v = action.key === 'voiceContinuous' ? call(deps.voice) : null;
      if (v && typeof v.setContinuous === 'function') v.setContinuous(!!action.value);
      return { say: appCommandLine(action) };
    }
    case 'voice':
      return Promise.resolve(call(deps.useVoice, action.which)).then((out) => ({ say: appCommandLine(action, out || {}) }));
    case 'spend':
      return { say: appCommandLine(action, call(deps.spend) || {}) };
    default:
      return false;
  }
}
