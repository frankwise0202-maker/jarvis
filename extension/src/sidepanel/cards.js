// The cards the owner answers with a click: a task's prompt (a site's permission, an approval, a
// limit) and, for Voice from Jarvis, an address Jarvis asked to open that waits for a click. The
// side panel and the small approval window (approve.html) show the same cards.

import { h, append } from './dom.js';
import { icon } from './icons.js';
import { displayText } from '../shared/util.js';

/**
 * A prompt's body as nodes: an address it shows (prompt.address, already made fully visible by the
 * service worker) goes on its own line, in a monospace block, whole; the rest is plain text.
 */
export function promptBody(prompt) {
  const body = displayText(prompt.body);
  const address = displayText(prompt.address || '');
  const at = address ? body.indexOf(address) : -1;
  if (at < 0) return [body];
  return [body.slice(0, at), h('code', { class: 'prompt__address', attrs: { 'data-testid': 'prompt-address' }, text: address }), body.slice(at + address.length)];
}

/** A task's prompt with its choices; `onChoose(choiceId)` once a button is pressed (all are then disabled). */
export function promptCard(prompt, { onChoose }) {
  const ic = { site: 'globe', confirm: 'shield', budget: 'dollar', steps: 'refresh' }[prompt.kind] || 'info';
  const choices = h(
    'div',
    { class: 'prompt__choices' },
    (prompt.choices || []).map((c) =>
      h('button', { class: `btn btn--${c.tone === 'primary' ? 'primary' : c.tone === 'danger' ? 'danger' : 'ghost'}`, type: 'button', attrs: { 'data-testid': 'prompt-choice', 'data-choice': c.id }, on: { click: (e) => {
        for (const b of e.currentTarget.parentElement.querySelectorAll('button')) b.disabled = true;
        onChoose(c.id);
      } } }, c.label),
    ),
  );
  const kindChip = prompt.detail ? h('span', { class: 'chip chip--kind', attrs: { 'data-testid': 'prompt-category' }, text: prompt.detail.charAt(0).toUpperCase() + prompt.detail.slice(1) }) : null;
  const sourceChip = prompt.source === 'guard'
    ? h('span', { class: `chip${prompt.consequential ? ' chip--warn' : ''}`, text: prompt.consequential ? 'Stopped by the safety check' : 'Jarvis asks before each step' })
    : h('span', { class: 'chip', text: 'Jarvis asked first' });
  const meta = prompt.kind === 'confirm' ? h('div', { class: 'prompt__meta' }, prompt.site ? h('span', { class: 'chip', text: prompt.site }) : null, kindChip, sourceChip) : null;
  return h(
    'div',
    { class: 'prompt', attrs: { 'data-testid': 'prompt', 'data-kind': prompt.kind, 'data-prompt-id': prompt.id, 'data-source': prompt.source || '', 'data-consequential': prompt.kind === 'confirm' ? String(!!prompt.consequential) : '', role: 'alertdialog', 'aria-label': prompt.title } },
    h('div', { class: 'prompt__head' }, h('span', { class: 'prompt__icon' }, icon(ic, { size: 18 })), h('span', { class: 'prompt__title', text: prompt.title })),
    h('p', { class: 'prompt__body', attrs: { 'data-testid': 'prompt-body' } }, promptBody(prompt)),
    prompt.facts ? h('p', { class: 'prompt__facts', attrs: { 'data-testid': 'prompt-facts' }, text: displayText(prompt.facts) }) : null,
    meta,
    choices,
  );
}

/**
 * Voice from Jarvis: an address Jarvis asked to open that says it does something (or hides
 * something). It opens only with the owner's click on Open. card: { id, shown, site, detail }.
 */
export function openCard(card, { onChoose }) {
  const buttons = h(
    'div',
    { class: 'prompt__choices' },
    h('button', { class: 'btn btn--primary', type: 'button', attrs: { 'data-testid': 'open-card-choice', 'data-choice': 'open' }, on: { click: (e) => choose(e, 'open') } }, 'Open it'),
    h('button', { class: 'btn btn--ghost', type: 'button', attrs: { 'data-testid': 'open-card-choice', 'data-choice': 'dismiss' }, on: { click: (e) => choose(e, 'dismiss') } }, 'Don’t open'),
  );
  function choose(e, choice) {
    for (const b of e.currentTarget.parentElement.querySelectorAll('button')) b.disabled = true;
    onChoose(choice);
  }
  const body = h('p', { class: 'prompt__body', attrs: { 'data-testid': 'open-card-body' } });
  append(body, 'Jarvis asked to open this address here:', h('code', { class: 'prompt__address', attrs: { 'data-testid': 'open-card-address' }, text: displayText(card.shown) }), `${card.detail ? `${displayText(card.detail)} ` : ''}An address like this can do something on the site (add to a cart, delete, sign out), so it opens only if you click Open it.`);
  return h(
    'div',
    { class: 'prompt prompt--open', attrs: { 'data-testid': 'open-card', 'data-card-id': card.id, role: 'alertdialog', 'aria-label': 'Open this address?' } },
    h('div', { class: 'prompt__head' }, h('span', { class: 'prompt__icon' }, icon('globe', { size: 18 })), h('span', { class: 'prompt__title', text: 'Open this address?' })),
    body,
    h('div', { class: 'prompt__meta' }, card.site ? h('span', { class: 'chip', text: card.site }) : null, h('span', { class: 'chip chip--voice', text: 'From Jarvis (voice)' })),
    buttons,
  );
}
