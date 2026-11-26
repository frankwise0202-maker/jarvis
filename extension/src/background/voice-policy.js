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
// | Anything marked (a purchase or payment,| no: "That needs a click in the Jarvis    | yes          |
// | sending, posting, deleting, account or | window."                                 |              |
// | security, terms, a download, another   |                                          |              |
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
// only for the prompt it names, still open and unchanged (its hash), and at least 1.5 s after the
// prompt appeared. One approval still covers one step on one element, once (README: Approving
// steps): a voice approval goes through the same prompt as a click.
//
// Pure: no chrome.* access.

import { CATEGORIES, GUARD_CATEGORIES } from './guard.js';
import { toB64u } from './envelope.js';
import { formatUsd } from '../shared/util.js';

/** Whether "Approve everyday steps by voice" exists at all. It ships after its red-team round. */
export const VOICE_APPROVALS_AVAILABLE = false;

/** A decision for a prompt younger than this is refused (it may not have been heard yet). */
export const MIN_PROMPT_AGE_MS = 1500;

export const CLICK_ONLY = 'That needs a click in the Jarvis window.';
export const WHY_SITE_NOT_NAMED = 'That needs a click in the Jarvis window: by voice, Jarvis allows only a site you named or opened by voice for this task.';
export const WHY_TOO_SOON = 'That question has only just appeared. Answer it again in a moment.';
export const WHY_NO_SUCH_CHOICE = 'That isn’t one of the answers to this question.';

// The answers that say no: taken from Jarvis at once, whatever the settings.
export const DECLINES = Object.freeze({ site: 'deny', confirm: 'cancel', budget: 'stop', steps: 'stop' });

/**
 * The page steps "approve" may cover from Jarvis (prompt facts `step`): one plain left click on an
 * element that opens no address shown on the card, picking an option or ticking a box; and text
 * Claude chose (typing, a value set into a field) only while the task has read no other site.
 */
export const VOICE_STEPS = Object.freeze({ click: 'any', option: 'any', text: 'no-other-site' });

/**
 * The table's yes-answers, as data. `allows(prompt, facts, ctx)` returns null (allowed) or why not.
 * facts: what the extension knows about the prompt beyond its card (see Controller.askNow): for a
 * page step { step }; ctx: { voiceSites (the sites the owner named or opened by voice in this task),
 * alwaysSites ({ site: 'always' }), readElsewhere(site) }.
 */
export const VOICE_ROWS = Object.freeze([
  { kind: 'site', choice: 'once', allows: (p, f, ctx) => (p.site && ctx.voiceSites?.has(p.site) ? null : WHY_SITE_NOT_NAMED) },
  { kind: 'site', choice: 'always', allows: () => CLICK_ONLY },
  { kind: 'confirm', choice: 'approve', allows: (p, f, ctx) => (isEverydayStep(p, f, ctx) ? null : CLICK_ONLY) },
  { kind: 'budget', choice: 'continue', allows: () => null },
  { kind: 'steps', choice: 'continue', allows: () => null },
]);

/** A page step the "approve" row covers (see VOICE_STEPS). */
export function isEverydayStep(p, facts, ctx) {
  if (p.kind !== 'confirm' || p.source !== 'guard' || p.category !== 'change' || p.consequential) return false;
  if (!p.site || ctx.alwaysSites?.[p.site] !== 'always') return false;
  const rule = VOICE_STEPS[facts?.step];
  if (rule === 'any') return true;
  if (rule === 'no-other-site') {
    // (Not known counts as read.)
    if (facts.readElsewhere || typeof ctx.readElsewhere !== 'function') return false;
    try {
      return ctx.readElsewhere(p.site) === false;
    } catch {
      return false;
    }
  }
  return false;
}

/** Whether the owner's voice approvals are on: available in this release, and switched on. */
export const approvalsOn = (setting, available = VOICE_APPROVALS_AVAILABLE) => available === true && setting === true;

/**
 * Whether `choice` may answer `prompt` from Jarvis. ctx: { now, shownAt, approvals (approvalsOn),
 * voiceSites, alwaysSites, readElsewhere }. Returns { ok: true } or { ok: false, reason, why }.
 * (That the prompt is still open and unchanged is the caller's check: see promptHash.)
 */
export function voiceDecision(prompt, facts, choice, ctx) {
  const ids = (prompt?.choices || []).map((c) => c.id);
  if (!ids.includes(choice)) return { ok: false, reason: 'bad', why: WHY_NO_SUCH_CHOICE };
  if (DECLINES[prompt.kind] === choice) return { ok: true };
  if (!ctx.approvals) return { ok: false, reason: 'refused', why: CLICK_ONLY };
  const row = VOICE_ROWS.find((r) => r.kind === prompt.kind && r.choice === choice);
  const why = row ? row.allows(prompt, facts, ctx) : CLICK_ONLY;
  if (why) return { ok: false, reason: 'refused', why };
  if (!(ctx.now - ctx.shownAt >= MIN_PROMPT_AGE_MS)) return { ok: false, reason: 'refused', why: WHY_TOO_SOON };
  return { ok: true };
}

/** What the app shows and says about answering `prompt` by voice: { allowed, why }. */
export function voiceSummary(prompt, facts, ctx) {
  const yes = (prompt?.choices || []).map((c) => c.id).filter((id) => DECLINES[prompt.kind] !== id);
  if (!ctx.approvals) return { allowed: false, why: CLICK_ONLY };
  let why = CLICK_ONLY;
  for (const choice of yes) {
    const row = VOICE_ROWS.find((r) => r.kind === prompt.kind && r.choice === choice);
    const no = row ? row.allows(prompt, facts, ctx) : CLICK_ONLY;
    if (!no) return { allowed: true, why: '' };
    if (choice === yes[0]) why = no;
  }
  return { allowed: false, why };
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

const lettersOf = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

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
  if (!s || NEVER_QUOTED.test(lettersOf(s))) return '';
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
  return NEVER_QUOTED.test(lettersOf(s)) ? 'a site whose name is on the card in the Jarvis window' : s;
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

// What a page step does, said aloud: by its everyday kind (facts.step), else by its kind.
const STEP_WORDS = { click: 'click', option: 'pick an option', text: 'type' };
const KIND_WORDS = { click: 'click', type: 'type', key: 'press a key', drag: 'drag something', form: 'change a field', navigate: 'open an address', tab: 'close a tab' };

/**
 * What Jarvis says for a prompt (prompt: the card; facts: { step, kind, label, typed, item } for a
 * page step, { label, item } for Jarvis's own question, { spent, limit, next } for the budget,
 * { limit, more } for the step limit, { load: true } for a page load nobody approved,
 * { noBar: true } for acting without the control bar).
 */
export function spokenLine(p, facts = {}) {
  const site = p.site ? spokenSite(p.site) : 'this page';
  if (p.kind === 'site') return `Jarvis for Chrome asks to work on ${site}.`;
  if (p.kind === 'budget') return `This Chrome task has used its ${formatUsd(facts.limit)} budget. Going on allows up to ${formatUsd(facts.next)}.`;
  if (p.kind === 'steps') return `This Chrome task has taken its ${Number(facts.limit) || 0} steps. Going on allows ${Number(facts.more) || 0} more.`;
  if (p.kind !== 'confirm') return `Jarvis for Chrome asks you something on ${site}.`;
  if (p.category === 'flow') return /^Send this address/.test(p.title || '') ? `Jarvis for Chrome read another site in this task and asks to open an address on ${site}.` : `Jarvis for Chrome read another site in this task and asks to carry on to ${site}.`;
  if (p.category === 'dialog') return `The page on ${site} asks a question.`;
  if (facts.load) return `A page on ${site} wants to open or send something by itself.`;
  if (facts.noBar) return `Jarvis for Chrome can't show its control bar on ${site} and asks to go on without it.`;
  if (p.category === 'download') return `A page on ${site} wants to save a file to your Downloads folder.`;
  const price = priceIn(facts.label, facts.item);
  const label = quoteForVoice(facts.label);
  const quote = label ? ` The button says “${label}”.` : '';
  const priced = price ? ` The price shown is ${price}.` : '';
  if (p.source !== 'guard') return `Jarvis for Chrome asks before ${CATEGORIES[p.category] || 'a step that does something'} on ${site}.${quote}${priced}`;
  const what = STEP_WORDS[facts.step] || KIND_WORDS[facts.kind] || 'take a step';
  const marked = p.consequential ? `, and it looks like ${GUARD_CATEGORIES[p.category] || 'something with consequences'}` : '';
  // The element's label is quoted for a click or an option; the text for typing; nothing else.
  const typing = facts.step === 'text' || facts.kind === 'type';
  const typed = typing ? quoteForVoice(facts.typed) : '';
  const shown = typing ? (typed ? ` The text is “${typed}”.` : '') : ['click', 'option'].includes(facts.step) || facts.kind === 'click' ? quote : '';
  return `Jarvis for Chrome wants to ${what} on ${site}${marked}.${shown}${priced}`;
}
