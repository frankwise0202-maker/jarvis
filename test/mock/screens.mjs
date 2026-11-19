// Screens in the mock (lead tools version 5): [[screen:<what>:<where>]] makes Jarvis call
// open_screen; the request that carries its tool_result gets one short sentence, as the V4 prompt's
// "Camera and screens" section asks ("It's on your second screen, sir."). Only when the request
// defines open_screen (an older conversation gets a plain answer instead, as the real API would).
//
//   [[screen]]                         open_screen { what: 'this', where: 'other_screen' }
//   [[screen:answer:beside]]           what and where (open_screen's enums; unknown words fall back)
//   [[screen:hologram:other_screen:3]] with a monitor number
//   [[screen:link:window]]             a link: the first http(s) URL in the owner's text

import { newToolUseId, truncate } from './util.mjs';

export const SCREEN_TOOL_NAME = 'open_screen';
const WHATS = ['this', 'hologram', 'blueprint', 'mission', 'answer', 'photo', 'camera', 'link'];
const WHERES = ['other_screen', 'beside', 'window', 'back'];
const PLACE_WORDS = { other_screen: 'your other screen', beside: 'a floating panel beside you', window: 'its own window', back: 'your main screen' };

/** open_screen's input from the directive argument ("what:where[:n]") and the owner's words. */
export function screenInputOf(arg, prompt = '') {
  const [rawWhat = '', rawWhere = '', rawScreen = ''] = String(arg || '').split(':').map((s) => s.trim().toLowerCase());
  const what = WHATS.includes(rawWhat) ? rawWhat : 'this';
  const where = WHERES.includes(rawWhere) ? rawWhere : 'other_screen';
  const input = { what, where };
  const n = parseInt(rawScreen, 10);
  if (Number.isInteger(n) && n >= 1 && n <= 9) input.screen = n;
  if (what === 'link') {
    const m = /https?:\/\/[^\s<>()"']+/i.exec(String(prompt || ''));
    if (m) input.url = m[0];
  }
  return input;
}

/** The lead's response: a thought, then the open_screen call (no text first: the result is said after). */
export function openScreenPlan({ think, input }) {
  return {
    blocks: [
      think(`The owner asked me to put ${input.what === 'this' ? 'what they are looking at' : `the ${input.what}`} on ${PLACE_WORDS[input.where]}. The app places it; I'll confirm in one sentence.`),
      { type: 'tool_use', id: newToolUseId(), name: SCREEN_TOOL_NAME, input },
    ],
    stop_reason: 'tool_use',
    pace: 'quick',
  };
}

/** The one short sentence after an open_screen result (read from the result text, like Claude would). */
export function screenFollowUpText(result, resultText) {
  const text = String(resultText || '');
  if (result?.is_error) return `I couldn't do that: ${truncate(text, 160)}`;
  const tap = /"([^"]+)" button/.exec(text);
  if (/needs one tap/.test(text)) return `Tap “${tap ? tap[1] : 'Open'}” and it'll appear, sir.`;
  if (/allow window management/.test(text)) return 'Tap Allow once, and I can use your other screen, sir.';
  if (/^Nothing was open/.test(text)) return 'Nothing was open on another screen, sir.';
  if (/^Closed /.test(text)) return "It's back on your main screen, sir.";
  if (/floating beside/.test(text)) return "It's floating beside your work, sir.";
  if (/in its own window/.test(text)) return "It's open in its own window, sir.";
  if (/opened full screen in the app/.test(text)) return "Your phone has one screen, so it's open full screen here, sir.";
  const screen = / on screen (\d+) /.exec(text);
  if (screen) return `It's on screen ${screen[1]}, sir.`;
  return 'Done, sir.';
}
