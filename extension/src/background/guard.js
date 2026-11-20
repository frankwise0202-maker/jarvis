// The client-side safety guard (safety rules 3 and 4). Pure functions, no chrome.* access: the
// service worker uses them before every input it sends, and the page agent (page/agent.js, which
// bundles this module) uses them again at the moment the page receives that input.
//
// Jarvis denies by default (see actions.js): every step that can change a page or the owner's
// accounts waits for the owner's approval of that exact step, except reading, scrolling and plain
// links within a site. This module says what a step would do, so that the owner's prompt names
// it, and so that nothing consequential is ever covered by the owner's "everyday steps" setting:
//
// classifyAction(descriptor) decides whether activating an element (a click, Enter or Space on
// it, or submitting the form it belongs to) looks like a consequential action: a purchase or
// payment, placing an order, sending a message or email, posting or publishing, deleting,
// changing account or security settings, accepting terms or granting access, or downloading or
// running a file. Switches, checkboxes and radios go through classifyToggle(), keyboard shortcuts
// outside text fields through classifyShortcutKey(), and native confirm() dialogs through
// classifyDialogText().
//
// secretKind(field) decides whether a form field holds a secret Jarvis must never type into or
// read out: a password (or one-time code), a card number, a card security code, or a national ID.
//
// The descriptors come from the page agent (extension/src/page/agent.js, describe()).

import { addressKey } from './address.js';

export const CATEGORIES = Object.freeze({
  purchase: 'a purchase or payment',
  send: 'sending a message or email',
  post: 'posting or publishing',
  delete: 'deleting something',
  account: 'changing account or security settings',
  agreement: 'accepting terms or granting access',
  download: 'downloading or running a file',
});

/** The categories Claude can name in request_confirmation (part of the frozen tool schema). */
export const CATEGORY_NAMES = Object.freeze(Object.keys(CATEGORIES));

/**
 * Every category the guard can stop an action for: the request_confirmation ones, plus a click or
 * key press inside a box embedded from another site, which Jarvis cannot see into.
 */
export const GUARD_CATEGORIES = Object.freeze({
  ...CATEGORIES,
  frame: 'acting inside a box embedded from another site, which Jarvis cannot see into',
  flow: 'carrying what Jarvis read on one site to another site',
  change: 'a step that changes something on the page',
  dialog: "answering the page's question",
  shortcut: 'a keyboard shortcut, which can send, delete or change things on the page',
});

/** Categories a refusal blocks for the rest of the task on that site (the others: that one step). */
export const STICKY_DECLINES = Object.freeze(new Set([...Object.keys(CATEGORIES), 'frame', 'shortcut']));

/** Short names for the side panel's chip on an approval prompt. */
export const CATEGORY_CHIPS = Object.freeze({
  purchase: 'Purchase or payment',
  send: 'Sending a message',
  post: 'Posting',
  delete: 'Deleting',
  account: 'Account or security',
  agreement: 'Accepting terms',
  download: 'Downloading a file',
  frame: 'Another site’s box',
  flow: 'What Jarvis read',
  change: 'Page step',
  dialog: 'The page asks',
  shortcut: 'Keyboard shortcut',
});

/** Lowercase, collapse whitespace, keep letters/digits/$ and a few separators. */
export function normalizeLabel(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9$€£¥'&+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Phrases are matched as whole words against the element's normalized label.
const RULES = [
  {
    category: 'purchase',
    patterns: [
      /\bbuy( it)? now\b/, /\bbuy now with\b/, /^buy( it)?( again)?$/, /^buy\b(?! ?(guide|guides|online pickup))/,
      /\bpurchase\b(?! (history|protection|guide))/, /\bplace (your |my |the )?order\b/, /\b(complete|confirm|submit|finish|review and pay|finalize) (your |my |the )?(order|purchase|payment|checkout|booking)\b/,
      /^pay\b/, /\bpay (now|securely|with|in full|\$|€|£|¥)/, /\bpay \d/, /\border now\b/, /\bcheckout now\b/, /\bconfirm and pay\b/, /\bsubmit payment\b/,
      /\bsubscribe( now| today)?$/, /\bstart (my |your )?(free )?(trial|subscription|membership)\b/, /\bupgrade (now|to|plan)\b/, /\bjoin (now|prime|premium)\b/,
      /\bdonate\b/, /\brent( now| for)\b/, /\bbook (now|it|this|your|tickets?|room)\b/, /^book$/, /\breserve( now| this| table|$)/,
      /\bplace (a )?bid\b/, /^bid\b/, /\bmake (an )?offer\b/, /\badd (funds|money)\b/, /\bsend money\b/, /\btransfer (money|funds|now)\b/, /^transfer$/, /\btop up\b/,
      // Moving an amount of money: "Transfer $500 to Alex", "Send €20", "Wire $1,000".
      /\b(transfer|send|wire|pay|tip|gift)\s?[$€£¥]\s?\d/, /\bwire (money|funds|transfer)\b/,
      /\bredeem\b/, /\bclaim (offer|deal)\b/,
      // Money-moving wording without a price on the button ("Confirm transfer", "Make payment").
      /\b(confirm|make|schedule|submit|send|complete|review and send|authori[sz]e) (a |an |the |your |my |this )?(transfer|payment|wire|withdrawal|deposit|sale|bid|trade|money)\b/,
      /\bwithdraw\b/, /\bcash ?out\b/, /^sell\b/, /\bsell (now|it|all|shares|order|this)\b/, /\bconfirm (sale|sell|trade|swap)\b/,
      /\bsubmit (bid|offer|order|trade)\b/, /\brequest (a |your )?(ride|pickup|delivery)\b/, /^order( now| it)?$/, /\bpay (bill|invoice|balance)\b/,
    ],
  },
  {
    category: 'send',
    patterns: [/^send\b/, /\bsend (it|now|message|email|e-mail|mail|reply|invite|invitation|request|text|sms|dm|note|feedback|money)\b/, /\bsubmit (message|email|inquiry|enquiry|request|form)\b/, /^invite\b/, /\bsend invites?\b/],
  },
  {
    category: 'post',
    patterns: [/^post\b/, /\bpost (it|now|comment|reply|update|review|story|this|to)\b/, /\bpublish\b/, /^tweet\b/, /\bgo live\b/, /\bsubmit (review|post|comment|story|answer|question|listing)\b/, /^(share|share now|share post)$/, /^upload( now)?$/, /\bpublish now\b/, /^repost$/],
  },
  {
    category: 'delete',
    patterns: [
      /\bdelete\b/, /\bpermanently\b/, /\berase\b/, /\bwipe\b/, /\bempty (the )?(trash|bin|recycle)\b/, /\bmove to (the )?(trash|bin)\b/, /^trash$/, /^discard\b/,
      /\bremove (my |your |the )?(account|everything|all|permanently|forever|data|profile|page|repository|repo|channel|workspace|member|user)\b/,
      /\bcancel (my |your |the )?(order|subscription|membership|account|plan|booking|reservation|service)\b/, /\bclose (my |your |the )?account\b/, /\bdeactivate\b/, /\bclear (all|history|data|everything)\b/,
      /\bremove (this |the |my |your )?(card|payment method|bank( account)?|device|phone( number)?|email( address)?|passkey|security key|authenticator|recovery \w+|address|item|message|file|files|photo|photos|post|comment)\b/,
      /\bempty (inbox|folder|cart)\b/, /\bdelete all\b/, /\bpurge\b/, /\bdestroy\b/,
    ],
  },
  {
    category: 'account',
    patterns: [
      /\b(change|update|reset|set) (your |my |the )?(password|passcode|pin|email( address)?|phone( number)?|username|security|recovery)\b/,
      /\b(enable|disable|turn on|turn off|remove|add|set up|setup) (two-factor|2fa|2-step|two-step|mfa|multi-factor|passkey|authenticator|security key)/,
      /\bsign out (of |from )?(all|every|other)\b/, /\blog out (of |from )?(all|every|other)\b/, /\brevoke\b/, /\bauthori[sz]e\b/, /\ballow access\b/, /\bgrant (access|permission|permissions)\b/,
      /\b(connect|link) (my |your |an? )?(account|app|bank|card)\b/, /\btransfer ownership\b/, /\bmake (owner|admin)\b/, /\badd (user|member|admin|collaborator)\b/, /\bunsubscribe\b/,
      /\bsave (changes|settings|preferences|profile|security)\b/, /\bupdate (profile|account|settings|security|billing|payment method)\b/,
      /\bunlink\b/, /\bdisconnect\b(?! from (wi-?fi|vpn))/, /\bturn off (2-step|two-step|two-factor|2fa|mfa|verification|login alerts?|sign-in alerts?)\b/,
    ],
  },
  {
    category: 'agreement',
    patterns: [/\bi agree\b/, /\bagree (and|&|to)\b/, /^agree$/, /\baccept (the |all )?(terms|agreement|license|licence|eula|conditions|policy|invitation|invite|offer)\b/, /\bi accept\b/, /^accept and continue$/, /\bsign (the )?(agreement|contract|document)\b/, /\be-?sign\b/],
  },
  {
    category: 'download',
    patterns: [/\bdownload\b/, /^install\b/, /\binstall (now|app|extension|update)\b/, /^run\b/, /\brun (it|now|file|program|installer)\b/, /\bopen file\b/, /\blaunch (app|installer)\b/],
  },
];

// Labels that commit whatever the surrounding form or dialog is about.
const GENERIC_COMMIT = /^(confirm|ok|okay|yes|yes,? .{0,30}|continue|submit|done|apply|save|update|next|proceed|finish|i understand|got it, ?continue|accept)$/;

// Context words strong enough to classify a generic commit button inside a form or dialog.
const CONTEXT_RULES = [
  { category: 'delete', pattern: /\b(delete|deleted|deleting|permanently|erase|remove (your|the|this) (account|data)|cannot be undone|can't be undone|close your account|deactivate|danger zone)\b/ },
  { category: 'purchase', pattern: /\b(place (your )?order|card number|payment details|pay now|complete (your )?purchase|confirm (your )?(order|purchase|payment)|you will be charged|will be charged)\b/ },
  // A transfer or payment review: an amount of money next to transfer/payment wording.
  { category: 'purchase', pattern: /([$€£¥] ?\d[\d,.]*.{0,80}\b(transfer|payment|recipient|withdraw|wire|send to)\b|\b(transfer|payment|recipient|withdraw|wire|amount)\b.{0,80}[$€£¥] ?\d)/ },
  { category: 'send', pattern: /\b(send (this )?(message|email)|new message)\b/ },
  { category: 'post', pattern: /\b(publish|post (this|publicly)|go live)\b/ },
  { category: 'account', pattern: /\b(change (your )?password|new password|security settings|two-factor|two factor|2fa|2-step|two-step|2-step verification|multi-factor|recovery (email|phone)|account settings|passkeys?|security keys?)\b/ },
  { category: 'agreement', pattern: /\b(terms of (service|use)|license agreement|i agree|consent to)\b/ },
];

// An order-review step: the page names how the owner pays, and a total. A generic "Continue" or
// "Next" there commits the purchase even without any "Place order" wording.
const ORDER_REVIEW = /\b(payment( method)?|paying with|pay with|(visa|mastercard|amex|american express|discover|card|debit card|credit card) ending( in)?|review (your )?order|order review)\b/;
const ORDER_TOTAL = /\b(total|order total|amount due|you pay)\b/;

// Bare verbs whose object is somewhere else on the page ("Turn off" under "2-Step Verification",
// "Remove" in a card's "Danger zone"): the heading, legend or dialog around them says what.
const BARE_VERB = /^(turn off|turn on|switch off|switch on|disable|enable|remove|delete|unlink|disconnect|deactivate|revoke|reset|confirm|yes|ok|okay|continue|cancel|stop|end|close|leave|archive|send|post|submit|apply|save|update)( it| this| now)?$/;

/** Whether a label only means something with the text around it (see BARE_VERB, GENERIC_COMMIT). */
export function needsContext(label) {
  const n = normalizeLabel(label);
  return !!n && (BARE_VERB.test(n) || GENERIC_COMMIT.test(n));
}

// Words that mark a switch, checkbox or radio as a security setting wherever it is.
const SECURITY_TOGGLE = /\b(two-factor|two factor|2fa|2-step|two-step|mfa|multi-factor|security key|passkeys?|authenticator|login alerts?|sign-in alerts?|recovery (email|phone|codes?)|app passwords?|require (a )?password)\b/;

// Links that really navigate only count with these unambiguous phrases (a "Buy" link in a menu is
// rarely the commit step); links that do not navigate are judged like buttons.
const STRONG_LINK = [
  /\b(buy now|buy it now|place (your )?order|pay now|complete (your )?(order|purchase)|delete|send now|publish|download|unsubscribe|i agree|install)\b/,
  /^(buy|pay|send|post)$/,
  /^pay\b.*([$€£¥] ?\d|\d)/, /\bpay (securely|in full)\b/, /\b(checkout|order) now\b/, /\bconfirm and pay\b/, /\bsubmit payment\b/,
  /\b(confirm|submit|complete|finali[sz]e|finish) (your |my |the )?(order|purchase|payment|booking)\b/, /\bsend money\b/,
];

export const SETTINGS_PATH = /\/(settings|account|accounts|security|profile|preferences|privacy|billing|admin|manage)(\/|$|\?|#)/i;
export const RISKY_FILE = /\.(exe|msi|msix|dmg|pkg|app|apk|aab|deb|rpm|sh|bash|zsh|command|bat|cmd|ps1|vbs|jar|iso|img|scr|run|bin|xpi|crx|appimage|torrent)(\?|#|$)/i;
export const FILE_LIKE = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz|pdf|docx?|xlsx?|pptx?|csv|mp4|mov|mp3|wav)(\?|#|$)/i;

function firstMatch(label, { skip = [] } = {}) {
  for (const rule of RULES) {
    if (skip.includes(rule.category)) continue;
    for (const p of rule.patterns) if (p.test(label)) return rule.category;
  }
  return null;
}

function contextCategory(text) {
  const t = normalizeLabel(text);
  if (!t) return null;
  for (const rule of CONTEXT_RULES) if (rule.pattern.test(t)) return rule.category;
  return null;
}

const lower = (v) => String(v || '').toLowerCase();

export const isButtonLike = (d) => {
  const role = lower(d?.role);
  const tag = lower(d?.tag);
  const type = lower(d?.type);
  return role === 'button' || role === 'menuitem' || role === 'option' || tag === 'button' || (tag === 'input' && ['submit', 'button', 'image', 'reset'].includes(type)) || role === 'tab';
};

export const isLink = (d) => lower(d?.role) === 'link' || lower(d?.tag) === 'a';

const TOGGLE_ROLES = new Set(['checkbox', 'switch', 'radio', 'menuitemcheckbox', 'menuitemradio']);

/** A switch, checkbox or radio (clicking it, or Space on it, changes a setting). */
export function isToggle(d) {
  if (!d || typeof d !== 'object') return false;
  const type = lower(d.type);
  return !!(d.isToggle || d.isCheckbox || TOGGLE_ROLES.has(lower(d.role)) || (lower(d.tag) === 'input' && (type === 'checkbox' || type === 'radio')));
}

export const isRadio = (d) => lower(d?.role) === 'radio' || lower(d?.role) === 'menuitemradio' || (lower(d?.tag) === 'input' && lower(d?.type) === 'radio');

/** A link that does not go anywhere: no href, "#", javascript:, or this same page (a JS handler does the work). */
export function isNonNavigatingLink(d) {
  if (!isLink(d)) return false;
  const href = String(d.href ?? '').trim();
  if (!href || href === '#' || href.startsWith('#') || /^javascript:/i.test(href)) return true;
  const page = String(d.pageUrl || '');
  if (!page) return false;
  try {
    const a = new URL(href, page);
    const b = new URL(page);
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

/** The texts the owner and the page give an element: what it shows, its accessible name, its value. */
function labelsOf(d) {
  const out = [];
  const seen = new Set();
  for (const raw of [d.text, d.name, d.value]) {
    const shown = String(raw ?? '').trim();
    const norm = normalizeLabel(shown);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ norm, shown: shown.slice(0, 80) });
  }
  return out;
}

function result(category, label, reason, d) {
  const out = { category, label: label.slice(0, 80), reason: reason || CATEGORIES[category] };
  // When the accessible name differs from what the element shows, the owner sees both.
  const name = String(d?.name ?? '').trim();
  if (name && normalizeLabel(name) !== normalizeLabel(label)) out.alias = name.slice(0, 80);
  return out;
}

/**
 * Whether activating this element (click, Enter or Space on it) looks consequential.
 * Returns { category, label, reason, alias? } or null.
 */
export function classifyAction(d) {
  if (!d || typeof d !== 'object') return null;
  const labels = labelsOf(d);
  const first = labels[0]?.shown || '';

  // Downloads: a download attribute, or a link to an installer or archive.
  const href = String(d.href || '');
  if (d.download || (isLink(d) && RISKY_FILE.test(href))) return result('download', first, 'downloading a file', d);
  if (isLink(d) && FILE_LIKE.test(href) && labels.some((l) => /\bdownload\b/.test(l.norm))) return result('download', first, 'downloading a file', d);

  // A click into a cross-origin payment frame (PayPal, Apple Pay, Google Pay, card widgets) whose
  // buttons Jarvis cannot read.
  if (d.iframe && PAYMENT_FRAME.test(`${d.iframe.src || ''} ${d.iframe.name || ''} ${d.iframe.title || ''} ${d.iframe.id || ''}`)) {
    return { category: 'purchase', label: String(d.iframe.title || d.name || 'a payment button').slice(0, 80), reason: 'a payment button in a secure frame' };
  }

  // Switches, checkboxes and radios change a setting whichever way they go.
  if (isToggle(d)) return classifyToggle(d, { willCheck: isRadio(d) ? true : !d.checked });

  const nonNavigating = isNonNavigatingLink(d);
  for (const { norm, shown } of labels) {
    const byLabel = firstMatch(norm);
    if (!byLabel) continue;
    // A plain navigation link labelled "Buy" or "Download" on a menu is rarely the commit step;
    // links that really navigate only count when the phrase is unambiguous.
    if (isLink(d) && !isButtonLike(d) && !nonNavigating && !STRONG_LINK.some((p) => p.test(norm))) continue;
    if (byLabel === 'account' && /^(save|update)\b/.test(norm) && !SETTINGS_PATH.test(String(d.pageUrl || '')) && !/\b(password|security|email|phone)\b/.test(norm)) {
      // "Save changes" outside a settings page (e.g. an editor) is not an account change.
      continue;
    }
    return result(byLabel, shown, null, d);
  }

  // Generic commit buttons ("Confirm", "Continue", "Submit") take their meaning from context.
  const generic = labels.find((l) => GENERIC_COMMIT.test(l.norm)) || (d.isSubmit && !labels.length ? { norm: '', shown: '' } : null);
  if (generic && (isButtonLike(d) || d.isSubmit || nonNavigating)) {
    const shown = generic.shown || first;
    if (d.form?.hasCardField) return result('purchase', shown, 'submitting payment details', d);
    const ctx = contextCategory(`${d.dialogText || ''} ${d.form?.text || ''}`);
    if (ctx) return result(ctx, shown, null, d);
    const around = normalizeLabel(`${d.dialogText || ''} ${d.form?.text || ''} ${d.contextText || ''}`);
    if (ORDER_REVIEW.test(around) && ORDER_TOTAL.test(around)) return result('purchase', shown, 'confirming a purchase on its order-review page', d);
    if (SETTINGS_PATH.test(String(d.pageUrl || '')) && /^(save|update|apply|confirm|submit)$/.test(generic.norm)) return result('account', shown, 'changing account settings', d);
    if (d.isSubmit && d.form && !d.form.isSearch && d.form.hasMessageField && !d.form.hasPasswordField) return result('send', shown, 'submitting a message', d);
  }

  // Composer buttons ("Reply", "Comment", "Share") next to a text box send what was written.
  if (isButtonLike(d) && d.nearTextbox) {
    const composer = labels.find((l) => /^(reply|reply all|comment|respond|submit|share|add comment)$/.test(l.norm));
    if (composer) return result(/comment/.test(composer.norm) ? 'post' : 'send', composer.shown, null, d);
  }

  // A bare verb takes its object from the heading, legend or dialog around it: "Turn off" under
  // "2-Step Verification" turns off 2-step verification; "Remove" under "Danger zone: delete
  // your account" deletes the account.
  if (isButtonLike(d) || d.isSubmit || nonNavigating || (isLink(d) && !nonNavigating && STRONG_LINK.some((p) => labels.some((l) => p.test(l.norm))))) {
    for (const { norm, shown } of labels) {
      if (!BARE_VERB.test(norm)) continue;
      for (const around of [d.headingText, d.dialogText, d.groupLabel]) {
        const ctx = normalizeLabel(around);
        if (!ctx) continue;
        const byBoth = firstMatch(`${norm} ${ctx}`) || contextCategory(ctx);
        if (byBoth) return result(byBoth, shown, `${CATEGORIES[byBoth]} ("${String(around).trim().slice(0, 60)}")`, d);
      }
    }
  }
  return null;
}

/**
 * A switch, checkbox or radio about to be ticked (`willCheck`) or unticked: does that change
 * something that matters (consent, account security, deleting, paying, publishing)?
 * Returns { category, label, reason, alias? } or null.
 */
export function classifyToggle(d, { willCheck = true } = {}) {
  if (!d || typeof d !== 'object') return null;
  const labels = labelsOf(d);
  const shown = labels[0]?.shown || 'a setting';
  // A radio "Off" or a switch "Enabled" means what its group says: "Two-factor authentication: Off".
  const group = String(d.groupLabel || '').trim();
  if (group) {
    const g = normalizeLabel(group);
    for (const { norm, shown: s } of labels) {
      const both = `${g} ${norm}`;
      const turnsOff = /\b(off|no|disabled?|none|never|turn off|don't|do not)\b/.test(norm);
      if (SECURITY_TOGGLE.test(both) && (turnsOff || !willCheck || isRadio(d))) {
        return result('account', s, `${willCheck ? 'choosing' : 'turning off'} "${s.slice(0, 40)}" for "${group.slice(0, 60)}" (changing account or security settings)`, d);
      }
      const skip = ['send', 'download'];
      if (isRadio(d)) skip.push('purchase');
      const byBoth = firstMatch(both, { skip });
      if (byBoth && byBoth !== 'agreement') return result(byBoth, s, `${willCheck ? 'choosing' : 'turning off'} "${s.slice(0, 40)}" for "${group.slice(0, 60)}" (${CATEGORIES[byBoth]})`, d);
    }
  }
  const verb = willCheck ? 'turning on' : 'turning off';
  for (const { norm, shown: s } of labels) {
    // (a) consent: ticking "I agree to the terms" accepts them.
    if (willCheck && /\b(agree|terms|consent|authori[sz]e|accept)\b/.test(norm)) return result('agreement', s, 'accepting terms', d);
    // (b) the label names a consequential change ("Disable two-factor", "Delete all my data"),
    // either way round. Unticking an agreement only withdraws it; "Send me a copy" sends nothing;
    // a radio like "Pay with PayPal" chooses how to pay (the order button is what buys).
    const skip = ['send', 'download'];
    if (!willCheck) skip.push('agreement');
    if (isRadio(d)) skip.push('purchase');
    const byLabel = firstMatch(norm, { skip });
    if (byLabel) return result(byLabel, s, `${verb} "${s.slice(0, 60)}" (${CATEGORIES[byLabel]})`, d);
    // (c) a security setting by its name ("Two-factor authentication", "Require a security key").
    if (SECURITY_TOGGLE.test(norm) || /\b(two-factor|2fa|recovery (email|phone)|security settings)\b/.test(norm)) {
      return result('account', s, `${verb} "${s.slice(0, 60)}" (changing account or security settings)`, d);
    }
  }
  // (d) on a settings page, anything security-related.
  if (SETTINGS_PATH.test(String(d.pageUrl || '')) && labels.some((l) => /\b(security|password|sign-in|sign in|login|privacy|recovery|verification)\b/.test(l.norm))) {
    return result('account', shown, `${verb} "${shown.slice(0, 60)}" (changing account or security settings)`, d);
  }
  return null;
}

/**
 * Choosing `optionText` in a select (a dropdown whose change handler may act at once): does that
 * choice look consequential ("Delete all messages")? Returns { category, label, reason } or null.
 */
export function classifyOption(select, optionText) {
  const opt = normalizeLabel(optionText);
  if (!opt) return null;
  const name = String(select?.name || '').trim();
  const shown = `${String(optionText).trim().slice(0, 60)}${name ? ` (in "${name.slice(0, 40)}")` : ''}`;
  const byOption = firstMatch(opt, { skip: ['send', 'download'] });
  if (byOption) return { category: byOption, label: shown, reason: `choosing "${String(optionText).trim().slice(0, 60)}" (${CATEGORIES[byOption]})` };
  const both = normalizeLabel(`${name} ${optionText}`);
  const byBoth = firstMatch(both, { skip: ['send', 'download'] });
  if (byBoth && byBoth !== 'account') return { category: byBoth, label: shown, reason: `choosing "${String(optionText).trim().slice(0, 60)}" (${CATEGORIES[byBoth]})` };
  return null;
}

/**
 * Enter (or ctrl/cmd+Enter) pressed while `focus` has the keyboard focus: what it would submit.
 * Returns { category, label, reason } or null.
 */
export function classifySubmitKey(focus, { modified = false } = {}) {
  if (!focus || typeof focus !== 'object') return null;
  // Enter on a focused button or link activates it.
  if (isButtonLike(focus) || isLink(focus)) return classifyAction(focus);
  const role = lower(focus.role);
  const tag = lower(focus.tag);
  const isMultiline = tag === 'textarea' || focus.isContentEditable || (role === 'textbox' && focus.multiline);
  // In a form, Enter submits through the form's default (first) submit button.
  if (focus.form && !focus.form.isSearch && !(isMultiline && !modified)) {
    const submit = focus.form.submitLabel || '';
    const asButton = { ...focus, role: 'button', tag: 'button', type: 'submit', name: submit, text: submit, value: '', isSubmit: true, nearTextbox: false, isCheckbox: false, isToggle: false, checked: false };
    const c = classifyAction(asButton);
    if (c) return c;
    if (focus.form.hasCardField) return { category: 'purchase', label: submit || 'the form', reason: 'submitting payment details' };
  }
  // In a multi-line field a page may send on Enter too (support chats, messengers): a form whose
  // submit button sends or posts, or a Send/Post button around the field.
  if (isMultiline && focus.form && !focus.form.isSearch && focus.form.submitLabel) {
    const c = classifyAction({ role: 'button', tag: 'button', name: focus.form.submitLabel, nearTextbox: true });
    if (c && (c.category === 'send' || c.category === 'post')) return { ...c, reason: `${c.reason} (Enter here may send it)` };
  }
  // Chat and mail composers send on Enter (or ctrl/cmd+Enter) when a Send/Post button sits nearby.
  if ((isMultiline || role === 'textbox' || tag === 'input') && Array.isArray(focus.nearbyButtons)) {
    for (const b of focus.nearbyButtons) {
      const c = classifyAction({ role: 'button', tag: 'button', name: b, nearTextbox: true });
      if (c && (c.category === 'send' || c.category === 'post')) return { ...c, reason: `${c.reason} (Enter here may send it)` };
    }
  }
  return null;
}

/**
 * A key chord with Ctrl, Cmd or Alt pressed in a text field (other than plain editing: select
 * all, undo, redo, word-wise movement): composers send or post on such shortcuts (Alt+S,
 * Cmd+Enter). Returns the send/post classification when the composer has such a button.
 */
export function classifyComposerShortcut(chord, focus) {
  if (!chord || !focus || typeof focus !== 'object') return null;
  const mods = Array.isArray(chord.mods) ? chord.mods : [];
  if (!mods.some((m) => m === 'ctrl' || m === 'meta' || m === 'alt')) return null;
  for (const b of Array.isArray(focus.nearbyButtons) ? focus.nearbyButtons : []) {
    const c = classifyAction({ role: 'button', tag: 'button', name: b, nearTextbox: true });
    if (c && (c.category === 'send' || c.category === 'post')) return { ...c, reason: `${c.reason} (a shortcut here may send it)` };
  }
  return null;
}

/** Space pressed on `focus`: it presses a focused button or link and flips a focused switch. */
export function classifySpaceKey(focus) {
  if (!focus || typeof focus !== 'object') return null;
  if (isToggle(focus)) return classifyToggle(focus, { willCheck: isRadio(focus) ? true : !focus.checked });
  return classifyAction(focus);
}

const EDITABLE_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number', 'password', 'date', 'datetime-local', 'month', 'week', 'time']);

/** True when keys typed now edit text (an input, a textarea, a rich-text editor): not shortcuts. */
export function isEditableFocus(d) {
  if (!d || typeof d !== 'object' || d.iframe) return false;
  if (d.isContentEditable) return true;
  const tag = lower(d.tag);
  const role = lower(d.role);
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') return EDITABLE_INPUT_TYPES.has(lower(d.type || d.field?.type));
  return role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton';
}

/**
 * A key pressed while focus is not in a text field: Delete/Backspace (any modifiers) and bare
 * single-character keys are web-app shortcuts that can delete or archive the selected item (Drive,
 * Gmail, file lists). `chord` is { key, mods, printable } with `key` the DOM key name ("Delete",
 * "e"). Returns { category: 'delete', label, reason } or null.
 */
export function classifyShortcutKey(chord, focus) {
  if (!chord || isEditableFocus(focus)) return null;
  const key = String(chord.key || '');
  const mods = Array.isArray(chord.mods) ? chord.mods : [];
  const label = String(focus?.name || focus?.text || '').trim().slice(0, 80) || 'the selected item';
  if (key === 'Delete' || key === 'Backspace') return { category: 'delete', label, reason: 'a key that can delete the selected item' };
  const bare = !mods.some((m) => m === 'ctrl' || m === 'meta' || m === 'alt');
  if (bare && chord.printable && key.length === 1 && key !== ' ') return { category: 'delete', label, reason: 'a keyboard shortcut that can delete, archive or send the selected item' };
  return null;
}

/**
 * The text of a native confirm() dialog: what accepting it would do (the same rules as buttons,
 * then the context words), or null.
 */
export function classifyDialogText(message) {
  const t = normalizeLabel(message);
  if (!t) return null;
  return firstMatch(t) || contextCategory(t);
}

// ---------------------------------------------------------------------------------------------
// Secret fields

const PASSWORD_HINT = /\b(pass(word|wd|code|phrase)?|pwd|pin|secret|otp|one[- ]?time|verification code|security answer)\b/;
const CARD_HINT = /\b(card ?(number|no|num|#)|cc ?(num|number|no)|credit ?card|debit ?card|cardnumber|ccnumber|ccnum|pan|card details)\b/;
const CVV_HINT = /\b(cvv2?|cvc2?|csc|cvn|cid|security code|card verification|verification value|card code)\b/;
const ID_HINT = /\b(ssn|social security|national insurance|tax id|itin|sin number|passport number)\b/;
export const PAYMENT_FRAME = /stripe|braintree|adyen|checkout\.com|paypal|venmo|applepay|apple-pay|googlepay|google-pay|pay\.google|shop-pay|shopify-pay|klarna|affirm|afterpay|card|payment|cvv|cvc|securefield|secure-field|hosted-field|hostedfield|recurly|squareup|square|spreedly|authorize\.net|cybersource|worldpay|3ds|tokeni[sz]/i;
const CREDENTIAL_FRAME = /login|signin|sign-in|auth|accounts\.|password|identity|sso/i;

/** Words used to describe a field: label, name, id, placeholder, aria-label, autocomplete. */
function fieldText(f) {
  return normalizeLabel([f.label, f.name, f.id, f.placeholder, f.ariaLabel, f.title, f.autocomplete, f.dataHint].filter(Boolean).join(' ').replace(/[_-]+/g, ' '));
}

/**
 * The kind of secret this field holds, or null: 'password', 'card', 'cvv' or 'id'.
 * `f` is a field descriptor; an `iframe` descriptor ({ src, name, title }) means the focus is
 * inside a cross-origin frame Jarvis cannot inspect, judged by what the frame looks like.
 */
export function secretKind(f) {
  if (!f || typeof f !== 'object') return null;
  if (f.iframe) {
    const s = `${f.iframe.src || ''} ${f.iframe.name || ''} ${f.iframe.title || ''} ${f.iframe.id || ''}`;
    if (PAYMENT_FRAME.test(s)) return 'card';
    if (CREDENTIAL_FRAME.test(s)) return 'password';
    return null;
  }
  const type = String(f.type || '').toLowerCase();
  const ac = String(f.autocomplete || '').toLowerCase();
  if (type === 'password' || /\b(current-password|new-password|one-time-code)\b/.test(ac)) return 'password';
  if (/\bcc-csc\b/.test(ac)) return 'cvv';
  if (/\bcc-number\b/.test(ac)) return 'card';
  const text = fieldText(f);
  if (CVV_HINT.test(text)) return 'cvv';
  if (CARD_HINT.test(text)) return 'card';
  if (/^\d{4}( \d{4}){3}$/.test(String(f.placeholder || '').trim()) || /^(•|\*|x){4}( (•|\*|x){4}){3}/i.test(String(f.placeholder || '').trim())) return 'card';
  if (ID_HINT.test(text)) return 'id';
  // Password hints only count on text-like fields (a "PIN" checkbox or button is not a secret).
  if (PASSWORD_HINT.test(text) && (!type || ['text', 'tel', 'number', 'password', ''].includes(type) || f.tag === 'textarea')) return 'password';
  return null;
}

/**
 * The kind of secret an element holds, from the page agent's description of it: the one rule for
 * typing into a field and for reading its value back (read_page, find, screenshots).
 * 'password' | 'card' | 'cvv' | 'id' | null.
 */
export function secretKindOf(desc) {
  if (!desc || typeof desc !== 'object') return null;
  if (desc.iframe) return secretKind({ iframe: desc.iframe });
  if (desc.field) {
    const kind = secretKind(desc.field);
    if (kind) return kind;
    // Its accessible name too: aria-labelledby ("Card PIN"), a label the field info misses.
    const name = String(desc.name || '').trim();
    if (name) {
      const byName = secretKind({ ...desc.field, label: `${desc.field.label || ''} ${name}` });
      if (byName) return byName;
    }
  }
  if (desc.looksSecret) return 'password';
  const role = lower(desc.role);
  if (desc.isContentEditable || role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton') return secretKind({ label: desc.name, ariaLabel: desc.name });
  return null;
}

export const SECRET_NAMES = Object.freeze({ password: 'a password', card: 'a card number', cvv: 'a card security code', id: 'an ID number' });

/** The message Claude and the owner see when Jarvis refuses to type into a secret field. */
export function secretRefusal(kind) {
  const what = SECRET_NAMES[kind] || 'a secret';
  const owner = kind === 'password' ? 'Please sign in yourself, then tell me to continue.' : 'Please enter it yourself, then tell me to continue.';
  return `Refused: this field holds ${what}. Jarvis never types or reads passwords, card numbers or security codes. Ask the owner to do this part themselves ("${owner}") and end your turn.`;
}

// ---------------------------------------------------------------------------------------------
// Approvals: what the owner has approved with request_confirmation during the current task.

export const APPROVAL_TTL_MS = 60 * 1000;
export const APPROVAL_USES = 1;

/** The page an approval is bound to: origin, path and query (not the #fragment). */
export function pageKey(url) {
  try {
    const u = new URL(String(url));
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return '';
  }
}

/**
 * A selection key that cannot be trusted: the page has parts Jarvis cannot read (a closed shadow
 * root, a frame from another site) where items could be selected. Such a key never matches.
 */
export const UNKNOWN_SELECTION = '?';
export const isUnknownSelection = (key) => String(key || '').startsWith(UNKNOWN_SELECTION);

/** What the owner was shown about an element, or what a step on it would do: { consequential, category, label }. */
function sameVerdict(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  return !!a.consequential === !!b.consequential && String(a.category || 'change') === String(b.category || 'change') && String(a.label || '') === String(b.label || '');
}

/**
 * Per-task approvals and refusals.
 *
 * An approval (from request_confirmation) is bound to one element: the same element (by identity,
 * in the same document, tab and page it was asked on), with the same item around it (its row, card
 * or form: the product's name and price, the message's subject) and the same items selected on the
 * page, once, within a minute. It covers one input only: a plain left click on that element (never
 * a key, whose own meaning the card did not show: Ctrl+Enter in a text box sends), and only while
 * the guard reads that click exactly as the owner's card showed it (the same verdict: consequential
 * or not, the kind of action, the label), and, for a step the guard calls consequential, only when
 * Claude named that same kind of action. Anything else asks the owner again; so does a page where
 * Jarvis cannot see everything that could be selected (an unknown selection never matches). The
 * guard's own Approve covers only the step it was shown for and is never stored here.
 *
 * A refusal of a consequential kind of action (a purchase, sending, posting, deleting, an account
 * change, accepting terms, a download, a box from another site) blocks that kind on that site for
 * the rest of the task without asking again (one made while no site was open blocks it
 * everywhere: that direction fails safe). A refusal of any other step blocks that element, and the
 * address it would open (any site, this one included), in every spelling of it (addressKey).
 *
 * The addresses that approved consequential steps opened are remembered too: opening one again
 * (reload, back, forward, navigate, the page itself) would repeat what the owner approved once.
 */
export class Approvals {
  constructor(now = () => Date.now()) {
    this.now = now;
    this.granted = [];
    this.declined = new Set();
    this.declinedElements = new Set();
    this.declinedHrefs = new Set();
    this.actionResults = new Map(); // addressKey -> what the approved step was ({ category, label })
  }

  /**
   * Records an approval bound to an element ({ category, site, tabId, url, doc, targetId, ctx,
   * selection, text, kind, verdict }). `kind`: the one input it covers ('click', a plain left
   * click); `verdict`: what the owner's card said about the element ({ consequential, category,
   * label }). Without a site, an element, the input or the verdict it is not stored. Returns
   * whether it was.
   */
  grant({ category, site, tabId = '', url = '', doc, targetId, ctx = '', selection = '', text = '', kind = '', verdict = null } = {}) {
    if (!category || !site || targetId === undefined || targetId === null || targetId === '' || doc === undefined || doc === null || !tabId) return false;
    if (kind !== 'click' || !verdict || typeof verdict !== 'object') return false;
    const shown = { consequential: !!verdict.consequential, category: String(verdict.category || 'change'), label: String(verdict.label || '') };
    this.granted.push({ category, site, tabId: String(tabId), page: pageKey(url), doc, targetId: String(targetId), ctx: String(ctx || ''), selection: String(selection || ''), text: String(text || ''), kind, verdict: shown, expires: this.now() + APPROVAL_TTL_MS, uses: APPROVAL_USES });
    return true;
  }

  live() {
    const now = this.now();
    this.granted = this.granted.filter((a) => a.expires > now && a.uses > 0);
    return this.granted;
  }

  /**
   * Uses up the approval for a step on exactly that element, in that state, if there is one.
   * `kind`: the step's input ('click' for a plain left click; anything else never matches);
   * `verdict`: what the guard says that step would do ({ consequential, category, label }), which
   * must be what the owner's card showed, and, when consequential, the kind of action Claude named.
   * Returns the approval (its category and text) or null.
   */
  consume({ site, tabId, url, doc, targetId, ctx = '', selection = '', kind = '', verdict = null } = {}) {
    if (!site || targetId === undefined || targetId === null) return null;
    // One plain click, never a key or any other input (fail closed).
    if (kind !== 'click' || !verdict || typeof verdict !== 'object') return null;
    // What is selected must be known, now and when the owner approved (fail closed).
    if (isUnknownSelection(selection)) return null;
    const match = this.live().find(
      (a) =>
        a.site === site && a.tabId === String(tabId || '') && a.page === pageKey(url) && a.doc === doc && a.targetId === String(targetId) && a.ctx === String(ctx || '') && a.selection === String(selection || '') && !isUnknownSelection(a.selection) &&
        a.kind === kind && sameVerdict(a.verdict, verdict) && (!verdict.consequential || a.category === String(verdict.category || '')),
    );
    if (!match) return null;
    match.uses -= 1;
    return match;
  }

  /** Whether a live approval is bound to this element (Jarvis then checks the selection closely). */
  hasBinding({ tabId, doc, targetId } = {}) {
    return this.live().some((a) => a.tabId === String(tabId || '') && a.doc === doc && a.targetId === String(targetId));
  }

  /** Records a refusal: the kind of action on the site (consequential kinds), the element, the address. */
  decline(category, site, { element = '', href = '' } = {}) {
    if (STICKY_DECLINES.has(category)) this.declined.add(`${category}|${site || '*'}`);
    if (element) this.declinedElements.add(String(element));
    for (const h of [].concat(href || [])) {
      const key = addressKey(h);
      if (key) this.declinedHrefs.add(key);
    }
  }

  /** An approved consequential step opened `url`: opening it again would repeat that step. */
  noteActionResult(url, { category = 'change', label = '' } = {}) {
    const key = addressKey(url);
    if (key) this.actionResults.set(key, { category, label: String(label || '').slice(0, 80) });
  }

  /** What approved step opened `url` before ({ category, label }), or null. */
  actionResult(url) {
    const key = addressKey(url);
    return (key && this.actionResults.get(key)) || null;
  }

  isDeclined(category, site) {
    return this.declined.has(`${category}|${site || '*'}`) || this.declined.has(`${category}|*`);
  }

  isDeclinedElement(key) {
    return !!key && this.declinedElements.has(String(key));
  }

  /** Whether the owner declined a step that would have opened this address, however it is written (navigate must not open it either). */
  isDeclinedHref(url) {
    const key = addressKey(url);
    return !!key && this.declinedHrefs.has(key);
  }
}

/** Whether a classification came from a generic commit label ("Continue", "OK"). */
export function isGenericLabel(label) {
  return GENERIC_COMMIT.test(normalizeLabel(label));
}
