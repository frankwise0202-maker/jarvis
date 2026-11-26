// Walkthroughs (Track 2: B1, B3-B7): this builder's voice and typed commands (v8.1; tours writes this file).
//
// app.js calls register() once at start (registerCommandModules), with the app's shared deps plus
// the ones added in this module's own call there. Register each matcher with the command router
// (src/lib/command-router.js, contract (b)). For example,
// "walk me through the battery", "next", "enclosed" (layer top: before the hologram's words):
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
// tours section of test/unit/fixtures/voice-corpus.mjs, and its collisions in the tours section of
// test/unit/fixtures/collisions.mjs.

/**
 * @param {{ register: Function }} router  the app's command router
 * @param {object} deps  shared: { getSettings, saveSettings, toast, voice() (the open Voice Mode's api,
 *   or null), routerState(surface, local), phone, demo }, plus this module's own (app.js)
 */
export function register(router, deps) {}
