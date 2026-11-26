// The voice policy (Voice from Jarvis, G5): which of Jarvis for Chrome's questions the owner may
// answer from Jarvis, the web app (by voice, or with the buttons on Jarvis's card, which count as
// voice), and what Jarvis says aloud for each. The extension decides; the app only mirrors it.
//
// | The extension asks                     | From Jarvis (voice or its card)          | A click here |
// | A new site: Allow once                 | only a site the owner named or opened by | yes          |
// |                                        | voice in this task                       |              |
// | A new site: Always for this site       | no                                       | yes          |
// | Deny, Cancel, Stop                     | yes, at once                             | yes          |
// | A page step (not consequential) on a   | "approve": a click, picking an option;   | yes          |
// | site set to Always                     | typing only while the task has read no   |              |
// |                                        | other site                               |              |
// | Anything marked (a purchase or payment,| no: why ("That's a purchase."), and the  | yes          |
// | sending, posting, deleting, account or | app adds "It needs a click in the Jarvis |              |
// | security, terms, a download, another   | window."                                 |              |
// | site's box, a keyboard shortcut, the   |                                          |              |
// | page's "Are you sure?", a page load    |                                          |              |
// | nobody approved, "Carry on to …?",     |                                          |              |
// | "Send this address to …?"), and every  |                                          |              |
// | other step (a key, a drag, an address) |                                          |              |
// | Budget reached: Continue               | yes ("spend more in Chrome")             | yes          |
// | Step limit reached: Continue           | yes ("more steps in Chrome")             | yes          |
//
// Everything in the second column but Deny, Cancel and Stop needs "Approve everyday steps by
// voice" (a setting, off by default) and, before that, VOICE_APPROVALS_AVAILABLE: until the
// red-team round passes, the setting is hidden and every approval is a click. A decision counts
// only for the prompt it names, still open and unchanged (its hash), and a yes only at least 1.5 s
// after the prompt appeared (a no counts at once). One approval still covers one step on one
// element, once (README: Approving steps): a voice approval goes through the same prompt as a click.
//
// What goes to Jarvis with each prompt (lead decision D4): `spoken`, the question alone ("Let it
// work on bestbuy.com for this task?"), which Jarvis says after "Chrome asks:" and before what can
// be said; and `voice.why`, one short sentence on why it needs a click ("That's a purchase.",
// "Approving by voice is off."), or '' while voice approvals aren't offered at all (Jarvis then says
// "That needs a click in the Jarvis window."). A refused answer carries the same reason.
//
// Pure: no chrome.* access.

import { toB64u } from './envelope.js';
import { formatUsd } from '../shared/util.js';

/** Whether "Approve everyday steps by voice" exists at all. It ships after its red-team round. */
export const VOICE_APPROVALS_AVAILABLE = false;

/** A decision for a prompt younger than this is refused (it may not have been heard yet). */
export const MIN_PROMPT_AGE_MS = 1500;

export const CLICK_ONLY = 'That needs a click in the Jarvis window.';
export const WHY_SWITCH_OFF = 'Approving by voice is off.';
export const WHY_SITE_NOT_NAMED = 'You didn’t name or open that site by voice.';
export const WHY_ALWAYS = 'That allows the site for every task.';
export const WHY_NOT_ALWAYS = 'That site isn’t set to Always.';
export const WHY_READ_ELSEWHERE = 'This task has read another site.';
export const WHY_TOO_SOON = 'That question has only just appeared.';
export const WHY_NO_SUCH_CHOICE = 'That isn’t one of the answers to this question.';

/** Why a step marked by the guard (or Jarvis's own question about it) needs a click, by its category. */
export const WHY_CATEGORY = Object.freeze({
  purchase: 'That’s a purchase.',
  send: 'That sends a message.',
  post: 'That posts something.',
  delete: 'That deletes something.',
  account: 'That changes your account or security.',
  agreement: 'That accepts terms.',
  download: 'That’s a download.',
  frame: 'That’s inside another site’s box.',
  flow: 'That carries what it read to another site.',
  dialog: 'That answers the page’s own question.',
  shortcut: 'That’s a keyboard shortcut.',
});

/** Why another page step needs a click, by its kind (the executor's step kinds). */
export const WHY_KIND = Object.freeze({
  click: 'That isn’t a simple button press.',
  type: 'That types more than one line.',
  key: 'That’s a key press.',
  drag: 'That’s a drag.',
  form: 'That changes a field.',
  navigate: 'That opens an address that acts.',
  tab: 'That closes a tab.',
});

// The answers that say no: taken from Jarvis at once, whatever the settings.
export const DECLINES = Object.freeze({ site: 'deny', confirm: 'cancel', budget: 'stop', steps: 'stop' });

/**
 * The page steps "approve" may cover from Jarvis (prompt facts `step`): one plain left click on an
 * element that opens no address shown on the card, picking an option or ticking a box; and text
 * Claude chose (typing, a value set into a field) only while the task has read no other site.
 */
export const VOICE_STEPS = Object.freeze({ click: 'any', option: 'any', text: 'no-other-site' });

/**
 * The table's yes-answers, as data. `allows(prompt, facts, ctx)` returns null (allowed) or the short
 * reason it needs a click. facts: what the extension knows about the prompt beyond its card (see
 * Controller.askNow): for a page step { step, kind }; ctx: { voiceSites (the sites the owner named or
 * opened by voice in this task), alwaysSites ({ site: 'always' }), readElsewhere(site) }.
 */
export const VOICE_ROWS = Object.freeze([
  { kind: 'site', choice: 'once', allows: (p, f, ctx) => (p.site && ctx.voiceSites?.has(p.site) ? null : WHY_SITE_NOT_NAMED) },
  { kind: 'site', choice: 'always', allows: () => WHY_ALWAYS },
  { kind: 'confirm', choice: 'approve', allows: (p, f, ctx) => stepReason(p, f, ctx) },
  { kind: 'budget', choice: 'continue', allows: () => null },
  { kind: 'steps', choice: 'continue', allows: () => null },
]);

/**
 * Why "approve" can't come from Jarvis for this confirm prompt (a short sentence), or null: the
 * guard's own page step, not marked, on a site set to Always (see VOICE_STEPS).
 */
export function stepReason(p, facts, ctx) {
  if (p.kind !== 'confirm') return CLICK_ONLY;
  if (p.consequential || p.source !== 'guard' || p.category !== 'change') {
    if (facts?.load) return 'The page did that by itself.';
    if (facts?.noBar) return 'Its control bar can’t be shown there.';
    return WHY_CATEGORY[p.category] || 'That’s a step with consequences.';
  }
  if (!p.site || ctx.alwaysSites?.[p.site] !== 'always') return WHY_NOT_ALWAYS;
  const rule = VOICE_STEPS[facts?.step];
  if (rule === 'any') return null;
  if (rule === 'no-other-site') {
    // (Not known counts as read.)
    if (facts.readElsewhere || typeof ctx.readElsewhere !== 'function') return WHY_READ_ELSEWHERE;
    try {
      return ctx.readElsewhere(p.site) === false ? null : WHY_READ_ELSEWHERE;
    } catch {
      return WHY_READ_ELSEWHERE;
    }
  }
  return WHY_KIND[facts?.kind] || 'That isn’t an everyday step.';
}

/** A page step the "approve" row covers. */
export function isEverydayStep(p, facts, ctx) {
  return stepReason(p, facts, ctx) === null;
}

/** Whether the owner's voice approvals are on: available in this release, and switched on. */
export const approvalsOn = (setting, available = VOICE_APPROVALS_AVAILABLE) => available === true && setting === true;

/** Why the switch stands in the way: '' while voice approvals aren't offered, else that it's off. */
const switchReason = (ctx) => (ctx.available ? WHY_SWITCH_OFF : '');

// Reasons about something the owner could change (name the site, set it to Always, a task that
// read nothing else): said only while voice approvals are on; otherwise the switch is the reason.
const CONDITIONS = new Set([WHY_SITE_NOT_NAMED, WHY_NOT_ALWAYS, WHY_READ_ELSEWHERE]);

/**
 * Why a yes-answer can't come from Jarvis (a short sentence; '' when only the switch stands in the
 * way while voice approvals aren't offered), or null when it may.
 */
function yesReason(prompt, facts, choice, ctx) {
  const row = VOICE_ROWS.find((r) => r.kind === prompt.kind && r.choice === choice);
  const why = row ? row.allows(prompt, facts, ctx) : CLICK_ONLY;
  if (why && (ctx.approvals || !CONDITIONS.has(why))) return why;
  return ctx.approvals ? null : switchReason(ctx);
}

/**
 * Whether `choice` may answer `prompt` from Jarvis. ctx: { now, shownAt, approvals (approvalsOn),
 * available (voice approvals offered at all), voiceSites, alwaysSites, readElsewhere }. Returns
 * { ok: true } or { ok: false, reason, why } (why: a short sentence). (That the prompt is still
 * open and unchanged is the caller's check: see promptHash.)
 */
export function voiceDecision(prompt, facts, choice, ctx) {
  const ids = (prompt?.choices || []).map((c) => c.id);
  if (!ids.includes(choice)) return { ok: false, reason: 'bad', why: WHY_NO_SUCH_CHOICE };
  if (DECLINES[prompt.kind] === choice) return { ok: true };
  const why = yesReason(prompt, facts, choice, ctx);
  if (why !== null) return { ok: false, reason: 'refused', why: why || CLICK_ONLY };
  if (!(ctx.now - ctx.shownAt >= MIN_PROMPT_AGE_MS)) return { ok: false, reason: 'refused', why: WHY_TOO_SOON };
  return { ok: true };
}

/**
 * What the app shows and says about answering `prompt` by voice: { allowed, why } (why: one short
 * sentence, or '' when only the switch stands in the way while voice approvals aren't offered).
 */
export function voiceSummary(prompt, facts, ctx) {
  const yes = (prompt?.choices || []).map((c) => c.id).filter((id) => DECLINES[prompt.kind] !== id);
  let why = null;
  for (const choice of yes) {
    const no = yesReason(prompt, facts, choice, ctx);
    if (no === null) return { allowed: true, why: '' };
    if (why === null) why = no;
  }
  return { allowed: false, why: why ?? '' };
}

// ---------------------------------------------------------------------------------------------
// The prompt's hash: what a decision is bound to.

/** JSON with object keys sorted (the same content always gives the same text). */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const bytesOf = (s) => new TextEncoder().encode(s).length;

/** `s` cut to at most `n` bytes of UTF-8 (whole characters, "…" at the end), so a prompt always fits a message. */
export function capBytes(s, n) {
  if (bytesOf(s) <= n) return s;
  const chars = [...s];
  let out = '';
  let used = 3; // "…"
  for (const c of chars) {
    const b = bytesOf(c);
    if (used + b > n) break;
    out += c;
    used += b;
  }
  return `${out}…`;
}

/** The fields of a prompt as Jarvis receives them (and as the hash covers them). */
export function promptFields(p) {
  return {
    kind: String(p.kind || ''),
    category: String(p.category || ''),
    site: capBytes(String(p.site || ''), 300),
    title: capBytes(String(p.title || ''), 600),
    body: capBytes(p.facts ? `${p.body || ''}\n${p.facts}` : String(p.body || ''), 6000),
    address: capBytes(String(p.address || ''), 4000),
    choices: (p.choices || []).slice(0, 4).map((c) => ({ id: String(c.id), label: capBytes(String(c.label), 160) })),
  };
}

/** base64url of the first 16 bytes of SHA-256 over the canonical JSON of the prompt's fields. */
export async function promptHash(p) {
  const f = promptFields(p);
  const canon = canonicalJson({ kind: f.kind, category: f.category, site: f.site, title: f.title, body: f.body, address: f.address, choices: f.choices });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon));
  return toB64u(new Uint8Array(digest).slice(0, 16));
}

// ---------------------------------------------------------------------------------------------
// What Jarvis says aloud: the extension's own words, from its own fields (the kind of question,
// the site, the category, a price). Page text is quoted only briefly, after a fixed lead-in ("the
// button says"), and never when it holds a word Jarvis or the owner use to answer: a page's label
// must not sound like Jarvis telling the owner what to say.

/** Words never spoken inside a quote (checked on the letters alone: "a p p r o v e" counts). */
export const NEVER_QUOTED = /approve|cancel|say|yes|allow|deny|stop|jarvis/;

/**
 * The same words, and the reserved answer phrases, by their sound (REDTEAM-LINK-8): matched on the letters after
 * foldSounds, so "Aprove", "Approove", "Ah-prove", "Kancel", "Cancle", "Appr0ve", "Alow once" and "Javis" are never
 * quoted either, nor "Spend more in Chrome" or "More steps in Chrome". ("Stahp" is left: its fold, "stap", would take
 * every "Staples" with it; the extension's own policy decides every answer, never the quote.)
 */
export const NEVER_QUOTED_SOUNDS = Object.freeze(['approve', 'aprov', 'ahprov', 'cancel', 'kancel', 'kansel', 'cancle', 'say', 'yes', 'allow', 'deny', 'stop', 'jarvis', 'javis', 'spendmore', 'moresteps']);

const lettersOf = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** Letters as they sound: digits read as letters, then doubled letters, k for c, ph for f, a silent h folded. */
export function foldSounds(text) {
  const letters = String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[0134578@$]/g, (d) => ({ 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' })[d])
    .replace(/[^a-z]/g, '');
  return letters
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/q/g, 'k')
    .replace(/k/g, 'c')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/([aeiou])h(?![aeiou])/g, '$1')
    .replace(/(.)\1+/g, '$1');
}

const FOLDED_NEVER = NEVER_QUOTED_SOUNDS.map(foldSounds);
/** True when the text holds an answer word, spelled as it is or as it sounds. */
export function soundsLikeAnswer(text) {
  if (NEVER_QUOTED.test(lettersOf(text))) return true;
  const folded = foldSounds(text);
  return FOLDED_NEVER.some((w) => folded.includes(w));
}

/** Text that may be spoken: Latin letters, digits and plain punctuation only (else ''). */
function speakable(text) {
  const s = String(text ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/[“”"‘’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  // A letter from another alphabet can look (and sound) like a Latin one: no quote at all.
  if (/[^\p{Script=Latin}\p{Script=Common}\p{Mn}]/u.test(s)) return '';
  return s.replace(/[^\p{L}\p{N} $€£¥%&+.,:'()/-]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Page text for a spoken quote: at most about `max` characters, or '' when it may not be said. */
export function quoteForVoice(text, max = 40) {
  let s = speakable(text);
  if (!s || soundsLikeAnswer(s)) return '';
  if (s.length > max) {
    s = s.slice(0, max);
    const cut = s.lastIndexOf(' ');
    s = `${(cut >= max * 0.6 ? s.slice(0, cut) : s).replace(/[\s.,:;-]+$/, '')}…`;
  }
  return s;
}

/** A site's name as said aloud (a name that holds an answer word is left on the card). */
export function spokenSite(site) {
  const s = speakable(site);
  if (!s) return 'a site';
  return soundsLikeAnswer(s) ? 'a site whose name is on the card in the Jarvis window' : s;
}

const PRICE = /[$€£¥]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|[$€£¥]\s?\d+(?:\.\d{2})?/;

/** The first price in the step's own text (its label, the item it belongs to), or ''. */
export function priceIn(...texts) {
  for (const t of texts) {
    const m = PRICE.exec(String(t || ''));
    if (m) return m[0].replace(/\s/g, '');
  }
  return '';
}

// What a step does, asked aloud: by its everyday kind (facts.step), else by its kind.
const STEP_ASKS = { click: 'Click a button', option: 'Pick an option', text: 'Type in a box' };
const KIND_ASKS = { click: 'Click a button', type: 'Type in a box', key: 'Press a key', drag: 'Drag something', form: 'Change a field', navigate: 'Open an address', tab: 'Close a tab' };
// What a marked step does, asked aloud, by its category (the guard's, or Jarvis's own question's).
const CATEGORY_ASKS = {
  purchase: 'Make a purchase or payment',
  send: 'Send a message',
  post: 'Post something',
  delete: 'Delete something',
  account: 'Change account or security settings',
  agreement: 'Accept terms',
  frame: 'Act inside another site’s box',
  shortcut: 'Press a keyboard shortcut',
};
export const SPOKEN_MAX = 280; // what Jarvis says of it

/**
 * The question Jarvis asks for a prompt, alone (D4: Jarvis adds "Chrome asks:" and what can be
 * said). prompt: the card; facts: { step, kind, label, typed, item } for a page step, { label, item }
 * for Jarvis's own question, { limit, next } for the budget, { limit, more } for the step limit,
 * { load: true } for a page load nobody approved, { noBar: true } for acting without the bar.
 */
export function spokenLine(p, facts = {}) {
  const line = spokenParts(p, facts);
  const whole = `${line.ask}${line.more}`;
  return whole.length <= SPOKEN_MAX ? whole : line.ask.slice(0, SPOKEN_MAX);
}

function spokenParts(p, facts) {
  const site = p.site ? spokenSite(p.site) : 'this page';
  const ask = (text, more = '') => ({ ask: text, more });
  if (p.kind === 'site') return ask(`Let it work on ${site} for this task?`);
  if (p.kind === 'budget') return ask(`Keep going past this task’s ${formatUsd(facts.limit)} budget, up to ${formatUsd(facts.next)}?`);
  if (p.kind === 'steps') return ask(`Keep going past this task’s ${Number(facts.limit) || 0} steps, with ${Number(facts.more) || 0} more?`);
  if (p.kind !== 'confirm') return ask(`Go ahead on ${site}?`);
  if (p.category === 'flow') return ask(/^Send this address/.test(p.title || '') ? `Open an address on ${site} after reading another site in this task?` : `Carry on to ${site} after reading another site in this task?`);
  if (p.category === 'dialog') return ask(`Answer OK to the question the page on ${site} asked?`);
  if (facts.load) return ask(`Let a page on ${site} open or send something by itself?`);
  if (facts.noBar) return ask(`Go on without the control bar on ${site}?`);
  if (p.category === 'download') return ask(`Save a file from ${site} to your Downloads folder?`);
  const price = priceIn(facts.label, facts.item);
  const priced = price ? ` The price shown is ${price}.` : '';
  const label = quoteForVoice(facts.label);
  const marked = p.consequential || p.source !== 'guard' ? CATEGORY_ASKS[p.category] : '';
  if (p.source !== 'guard') return ask(`${marked || 'Take a step'} on ${site}?`, `${label ? ` The button says “${label}”.` : ''}${priced}`);
  const typing = facts.step === 'text' || facts.kind === 'type';
  const what = marked || STEP_ASKS[facts.step] || KIND_ASKS[facts.kind] || 'Take a step';
  // The element's label is quoted for a click or an option; the text for typing; nothing else.
  let quote = '';
  if (typing) {
    const typed = quoteForVoice(facts.typed);
    if (typed) quote = ` The text is “${typed}”.`;
  } else if (label && (facts.step === 'click' || facts.kind === 'click' || marked)) quote = ` The button says “${label}”.`;
  else if (label && facts.step === 'option') quote = ` The option says “${label}”.`;
  return ask(`${what} on ${site}?`, `${quote}${priced}`);
}
