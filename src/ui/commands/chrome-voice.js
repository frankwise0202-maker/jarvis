// Jarvis for Chrome by voice, the app side (Track 3: G4, G5): this builder's voice and typed commands (v8.1; chrome-voice writes this file).
//
// app.js calls register() once at start (registerCommandModules), with the app's shared deps plus
// the ones added in this module's own call there. Register each matcher with the command router
// (src/lib/command-router.js, contract (b)). For example,
// "… in Chrome" tasks (layer destination, a carrier):
//
//   router.register({
//     id: 'my-words',                  // unique
//     layer: 'app',                    // one of LAYERS: its place in each surface's order
//     surfaces: ['voice', 'chat'],     // default: all four ('voice', 'chat', 'hologram', 'optics')
//     carrier: false,                  // true: it carries the owner's words out (no word cap)
//     match: (text, state, ctx) => …,  // pure: an action { do, free, undo, check, camera, …args } or null
//     run: (action, ctx) => …,         // acts: { say } | Promise<{ say }> | false (it couldn't after all)
//   });
//
// Keep this module importable in Node (no DOM at import time): the T3 harness
// (test/unit/command-router.test.mjs) registers every module with fake deps. Its phrases go in the
// chrome-voice section of test/unit/fixtures/voice-corpus.mjs, and its collisions in the chrome-voice section of
// test/unit/fixtures/collisions.mjs.

/**
 * @param {{ register: Function }} router  the app's command router
 * @param {object} deps  shared: { getSettings, saveSettings, toast, voice() (the open Voice Mode's api,
 *   or null), routerState(surface, local), phone, demo }, plus this module's own (app.js)
 */
export function register(router, deps) {}
