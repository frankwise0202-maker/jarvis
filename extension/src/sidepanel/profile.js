// "Use Jarvis in its own Chrome profile": the words of the first-run screen that comes before the
// API key can be saved, and the setup steps, which Settings shows again. Jarvis for Chrome ships
// for a Chrome profile of its own, with no saved passwords or cards: if a web page ever tricks
// Jarvis, the owner's main accounts, email, passwords and cards are in another profile, out of its
// reach (extension/README.md: Install, Why a separate profile, Known limits).
//
// The text is data (nothing touches the DOM until a render function is called), so the unit tests
// can check the steps and that the README's Install section uses the same words. In the steps,
// **…** marks Chrome's own words (shown bold) and `…` an address to type (shown as code).

import { h } from './dom.js';
import { icon } from './icons.js';

export const PROFILE_TITLE = 'Use Jarvis in its own Chrome profile';

export const PROFILE_WHY =
  'A Chrome profile is like a second Chrome, with its own sign-ins, passwords and cards. Give Jarvis one of its own: if a web page ever tricks Jarvis, your main accounts, email, passwords and cards are out of its reach.';

export const PROFILE_STEPS = Object.freeze([
  'Click your **profile picture** (or the person icon) at the top right of Chrome, then **Add** (or **Add Chrome profile**).',
  'Choose **Continue without an account**, name it **Jarvis**, pick a color and click **Done**. A new Chrome window opens in the Jarvis profile.',
  'In that window, don’t turn on sync and don’t import anything. In **Settings** → **Autofill and passwords**, turn off saving passwords, payment methods and addresses.',
  'Add Jarvis in that window: `chrome://extensions` → **Developer mode** → **Load unpacked** → the unzipped **jarvis-for-chrome** folder. Pin it, open the side panel and follow the setup.',
  'In that window only, sign in to the sites you want Jarvis to use, like a shopping site. Never your email or your bank.',
  'Next time, open the Jarvis window first: **profile picture** → **Jarvis**.',
]);

/** Under the steps: what to do when the panel was opened in the owner's usual profile. */
export const PROFILE_ELSEWHERE = 'Reading this in your usual profile? Set up the Jarvis profile first, then remove Jarvis from this one (`chrome://extensions` → **Remove**).';

export const PROFILE_CONFIRM = 'This is a separate Chrome profile just for Jarvis, with no saved passwords or cards';

/** The small line Settings always shows (and the key screen), with the steps behind it. */
export const PROFILE_LINE = 'For use in your Jarvis profile only';

/** A step's text as parts: { text, kind: 'text' | 'strong' | 'code' }. */
export function parseRich(text) {
  const parts = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), kind: 'text' });
    parts.push(m[1] !== undefined ? { text: m[1], kind: 'strong' } : { text: m[2], kind: 'code' });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last), kind: 'text' });
  return parts;
}

/** Chrome's own words in the steps (the bold parts and the addresses), in order, without repeats. */
export function stepTerms(steps = PROFILE_STEPS) {
  const out = [];
  for (const step of steps) for (const p of parseRich(step)) if (p.kind !== 'text' && !out.includes(p.text)) out.push(p.text);
  return out;
}

function rich(text) {
  return parseRich(text).map((p) => (p.kind === 'strong' ? h('strong', { text: p.text }) : p.kind === 'code' ? h('code', { text: p.text }) : p.text));
}

/** The numbered steps. */
export function profileSteps() {
  return h(
    'ol',
    { class: 'profile-steps', attrs: { 'data-testid': 'profile-steps' } },
    PROFILE_STEPS.map((step) => h('li', null, rich(step))),
  );
}

/** The note under the steps (for a panel opened in the usual profile). */
export function profileElsewhere() {
  return h('p', { class: 'hint profile-elsewhere' }, rich(PROFILE_ELSEWHERE));
}

/**
 * "For use in your Jarvis profile only", a line that opens in place to show why and the steps
 * again (a <details>, so nothing typed elsewhere on the screen is lost).
 */
export function profileNote() {
  return h(
    'details',
    { class: 'profile-note', attrs: { 'data-testid': 'profile-note' } },
    h(
      'summary',
      { attrs: { 'data-testid': 'profile-note-toggle' } },
      icon('shield', { size: 15 }),
      h('span', { class: 'profile-note__text', text: PROFILE_LINE }),
      h('span', { class: 'profile-note__more' }, h('span', { text: 'Steps' }), icon('chevron-right', { size: 14 })),
    ),
    h('div', { class: 'profile-note__body' }, h('p', { class: 'profile-note__why', text: PROFILE_WHY }), profileSteps(), profileElsewhere()),
  );
}
