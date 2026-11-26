// Jarvis for Chrome: the link's own words (v8.1, chrome-relay; SPEC §32.1). Two free, local commands, said in Voice
// Mode or typed in the chat:
//   "is Jarvis for Chrome linked?" (… online / connected / working / set up; "is Chrome linked?"; "Jarvis for Chrome
//     status")                     → the link's state: linked and online; linked but the Jarvis window isn't
//                                     open; not linked (and how to link it); on an iPhone, that it's the Mac's.
//   "link Jarvis for Chrome" ("set up Jarvis for Chrome", "connect Chrome to Jarvis", "how do I link Jarvis for
//     Chrome")                     → typed: Settings → Jarvis for Chrome opens (Link and Copy link code are there;
//                                     the copy and the paste stay the owner's taps); said: the steps, while Voice
//                                     Mode stays open.
// Everything about a task or a page ("… in Chrome", "what are you doing in Chrome", the answers to Chrome's
// questions) is chrome-voice's; opening pages is windows'. These words name the link or Jarvis for Chrome itself,
// so they never take a sentence about Chrome's pages.
//
// app.js registers it with deps { …shared, chromeLink (app.chromeLink, or null), openSettings({ section }) }.
// Keep this module importable in Node (no DOM at import time): the T3 harness (test/unit/command-router.test.mjs)
// registers every module with fake deps. Phrases: the chrome-relay section of test/unit/fixtures/voice-corpus.mjs;
// it claims no sentence another matcher claims (the chrome-relay section of collisions.mjs stays empty).

const EXT = '(?:jarvis for chrome|jarvis 4 chrome|the jarvis for chrome extension|the chrome extension|jarvis chrome extension|the jarvis extension|your chrome extension|chrome for jarvis)';
const LINK_TARGET = `(?:${EXT}|chrome to jarvis|jarvis to chrome|jarvis and chrome|jarvis with chrome|chrome with jarvis|the chrome link)`;

const LEAD = /^(?:(?:hey|ok|okay|so|um|uh|and|alright|well|now)\s+)*(?:jarvis\s+)?(?:(?:please|can you|could you|would you|will you|go ahead and|i want to|i want you to|i'd like to|id like to|i need to|lets|let's)\s+)?/;
const TAIL = /(?:\s+(?:please|now|for me|jarvis|thanks|thank you))+$/;

/** Lower case, no punctuation (apostrophes joined), one space; with `strip`, the usual polite lead and tail dropped. */
export function normalizeLinkWords(text, { strip = true } = {}) {
  let s = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (strip) for (let i = 0; i < 3; i++) s = s.replace(LEAD, '').replace(TAIL, '').trim();
  return s.replace(/'/g, '');
}

const STATUS_RE = [
  new RegExp(`^(?:is|are) (?:${EXT}|chrome|the chrome link|the link to chrome|the link with chrome|chrome and jarvis|jarvis and chrome)(?: still)? (?:linked|connected|online|working|set up|paired|there|on)(?: (?:to|with) (?:jarvis|you|me))?$`),
  new RegExp(`^(?:are you|is jarvis) (?:still )?(?:linked|connected|paired) (?:to|with) (?:${EXT}|chrome)$`),
  new RegExp(`^(?:${EXT}|chrome link|the chrome link) status$`),
  new RegExp(`^(?:whats|what is) the status of (?:${EXT}|the chrome link)$`),
];

// ("Open … settings" stays voice's, and "open <a site>" windows'.)
const SETUP_RE = [
  new RegExp(`^(?:link|connect|pair|set up|setup|hook up|link up)(?: up)? ${LINK_TARGET}$`),
  new RegExp(`^how do i (?:link|connect|set up) ${LINK_TARGET}$`),
];

/** The link's words: { do: 'chrome-link-status' | 'chrome-link-setup', free, undo } or null. */
export function matchChromeLinkCommand(text) {
  // Both as said and without the polite lead and tail ("Jarvis, …, please"): "Jarvis for Chrome status" and
  // "connect Chrome to Jarvis" keep their own "Jarvis".
  const forms = [normalizeLinkWords(text, { strip: false }), normalizeLinkWords(text)].filter((s) => s && s.length <= 80);
  if (forms.some((s) => STATUS_RE.some((re) => re.test(s)))) return { do: 'chrome-link-status', free: true, undo: true };
  if (forms.some((s) => SETUP_RE.some((re) => re.test(s)))) return { do: 'chrome-link-setup', free: true, undo: true };
  return null;
}

// Said aloud, the lines never name "Jarvis for Chrome": his own name would set off his barge-in (G5, A8;
// REDTEAM-VOICE-15). They say "Chrome", "your Chrome link"; what is shown keeps the name.
export const LINK_STEPS_SAID = 'To link Chrome, open Settings, then the Chrome section, press Link and copy the code. Then, in the Jarvis window, open its side panel, Settings, Voice from Jarvis, and paste it.';

/**
 * What Jarvis says (spoken: true) or shows about the link (state: app.chromeLink.state(), or null when there is
 * none).
 */
export function chromeLinkLine(state, { phone = false, spoken = false } = {}) {
  if (spoken) {
    if (phone) return 'Your Chrome link is made on your Mac: link it from Settings there.';
    if (!state || !state.linked) return 'Chrome isn’t linked. Say “connect Chrome to Jarvis” to set it up.';
    if (state.online) return 'Chrome is linked and online.';
    return 'Chrome is linked, but I can’t reach it. Open the Jarvis window and keep it open.';
  }
  if (phone) return 'Jarvis for Chrome links with Jarvis on your Mac: link it from Settings there.';
  if (!state || !state.linked) return 'Jarvis for Chrome isn’t linked. Say “link Jarvis for Chrome” to set it up.';
  if (state.online) return 'Jarvis for Chrome is linked and online.';
  return 'Jarvis for Chrome is linked, but I can’t reach it. Open the Jarvis window and keep it open.';
}

/**
 * @param {{ register: Function }} router  the app's command router
 * @param {object} deps  shared: { getSettings, saveSettings, toast, voice(), routerState(surface, local), phone, demo },
 *   plus chromeLink (app.chromeLink, or null) and openSettings({ section }) (app.js)
 */
export function register(router, deps) {
  const link = () => (deps && deps.chromeLink && typeof deps.chromeLink.state === 'function' ? deps.chromeLink : null);
  router.register({
    id: 'chrome-link',
    layer: 'app',
    surfaces: ['voice', 'chat'],
    match: (text) => (deps && deps.demo ? null : matchChromeLinkCommand(text)),
    run(action, ctx) {
      const phone = !!(deps && deps.phone);
      const l = link();
      let state = null;
      try {
        state = l ? l.state() : null;
      } catch {
        state = null;
      }
      // Set up: typed, Settings opens there; said, the steps (a sheet over Voice Mode would hide it).
      const said = !!(ctx && ctx.surface === 'voice');
      if (action.do === 'chrome-link-status') return { say: chromeLinkLine(state, { phone, spoken: said }) };
      if (!said && deps && typeof deps.openSettings === 'function') {
        try {
          deps.openSettings({ section: 'chrome' });
        } catch {
          /* Settings couldn't open: the words still say where */
        }
      }
      if (phone) return { say: chromeLinkLine(null, { phone, spoken: said }) };
      if (state && state.linked) return { say: `${said ? 'Chrome' : 'Jarvis for Chrome'} is already linked${state.online ? ' and online' : ''}.${said ? '' : ' Its settings are open.'}` };
      return { say: said ? LINK_STEPS_SAID : 'Here’s Jarvis for Chrome in Settings: press Link, then Copy link code, and paste it in its side panel.' };
    },
  });
}
