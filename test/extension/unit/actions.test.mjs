// Deny by default (background/actions.js): which steps need the owner's approval, which are plain
// navigation or reading, and the owner's "everyday steps" switch, which covers only searching,
// pages of results, filters and sorting, never anything consequential or unclear.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrowsChangeChoice, assessClick, assessFormInput, assessKey, assessType, isSearchField, plainLinkDestination } from '../../../extension/src/background/actions.js';
import { parseKeys, isPasteChord, isCopyCutChord, chordEvents } from '../../../extension/src/background/keys.js';

const PAGE = 'https://shop.example/results?q=monitor';
const link = (href, extra = {}) => ({ tag: 'a', role: 'link', href, name: 'Dell S2721QS 27" 4K', text: 'Dell S2721QS 27" 4K', pageUrl: PAGE, ...extra });
const button = (name, extra = {}) => ({ tag: 'button', role: 'button', name, text: name, pageUrl: PAGE, ...extra });
const search = (extra = {}) => ({ tag: 'input', type: 'search', role: 'searchbox', name: 'Search products', field: { tag: 'input', type: 'search', name: 'q' }, form: { isSearch: true, method: 'get' }, pageUrl: PAGE, ...extra });
const chord = (text) => parseKeys(text)[0];

test('deny by default: every click asks except one plain click on an ordinary same-site link', () => {
  assert.equal(assessClick({ desc: link('/product/dell'), pageUrl: PAGE }).verdict, 'allow');
  for (const [desc, why] of [
    [button('Add to cart'), 'a button'],
    [button('Next'), 'a "Next" outside pagination'],
    [{ tag: 'div', role: '', name: '', text: '', unlabelled: 'an unlabelled div', pageUrl: PAGE }, 'something unlabelled'],
    [link('/product/dell', { targetBlank: true }), 'a link that opens a new window'],
    [link('https://other.example/x'), 'a link to another site'],
    [link('/files/setup.dmg'), 'a link to an installer'],
    [link('/files/report.pdf'), 'a link to a file'],
    [link('/act/delete?id=1', { name: 'Remove', text: 'Remove' }), 'a link whose address does something'],
    [link('/messages/2', { name: 'Archive', text: 'Archive' }), 'a link whose wording does something'],
    [link('#', { name: 'Show', text: 'Show' }), 'a script link'],
    [link('javascript:void(0)'), 'a javascript: link'],
    [link('/product/dell', { download: true }), 'a download link'],
    [{ tag: 'a', role: 'button', href: '/product/dell', name: 'Dell', text: 'Dell', pageUrl: PAGE }, 'a link made a button'],
  ]) {
    assert.equal(assessClick({ desc, pageUrl: PAGE }).verdict, 'ask', why);
  }
  assert.equal(assessClick({ desc: link('/product/dell'), pageUrl: PAGE, button: 'middle' }).verdict, 'ask', 'a middle click (new tab)');
  assert.equal(assessClick({ desc: link('/product/dell'), pageUrl: PAGE, button: 'right' }).verdict, 'ask', 'a right click');
  assert.equal(assessClick({ desc: link('/product/dell'), pageUrl: PAGE, count: 2 }).verdict, 'ask', 'a double click');
  assert.equal(assessClick({ desc: link('/product/dell'), pageUrl: PAGE, modifiers: 4 }).verdict, 'ask', 'cmd+click (new tab)');
  assert.equal(assessClick({ desc: link('https://other.example/x'), pageUrl: PAGE }).dest, 'https://other.example/x', 'the destination is checked and shown');
  assert.equal(plainLinkDestination(link('/product/dell?ref=share'), PAGE), '', 'action words in the address');
});

test('consequential steps always ask and are never covered by the everyday switch', () => {
  for (const desc of [button('Buy now'), button('Place order'), button('Send'), button('Delete'), button('Confirm transfer'), link('/act/unsubscribe', { name: 'Unsubscribe', text: 'Unsubscribe' }), button('Apply', { pageUrl: 'https://shop.example/settings/security' })]) {
    const v = assessClick({ desc, pageUrl: desc.pageUrl, everyday: true });
    assert.equal(v.verdict, 'ask', desc.name);
    assert.ok(v.guard, `${desc.name} is recognised`);
  }
  assert.equal(assessFormInput({ desc: { tag: 'select', role: 'combobox', name: 'Sort by' }, option: { text: 'Delete all messages' }, everyday: true }).verdict, 'ask');
  assert.equal(assessFormInput({ desc: { tag: 'input', type: 'checkbox', role: 'checkbox', isToggle: true, name: 'Two-factor authentication', inFilters: true }, willCheck: false, everyday: true }).verdict, 'ask');
});

test('the everyday switch covers searching, pages of results, filters and sorting, and nothing else', () => {
  const on = (desc, extra = {}) => assessClick({ desc, pageUrl: PAGE, everyday: true, ...extra }).verdict;
  // Covered.
  assert.equal(on(search()), 'allow', 'clicking into a search box');
  assert.equal(on(button('Next', { inPagination: true })), 'allow', 'pagination');
  assert.equal(on(button('2', { inPagination: true })), 'allow');
  assert.equal(on(button('Load more')), 'allow');
  assert.equal(on({ tag: 'input', type: 'checkbox', role: 'checkbox', isToggle: true, name: '4K', inFilters: true, pageUrl: PAGE }), 'allow', 'a filter');
  assert.equal(assessFormInput({ desc: { tag: 'select', role: 'combobox', name: 'Sort by' }, option: { text: 'Price: low to high' }, everyday: true, pageUrl: PAGE }).verdict, 'allow', 'sorting');
  assert.equal(assessFormInput({ desc: search(), everyday: true }).verdict, 'allow', 'filling the search box');
  assert.equal(assessType({ focus: search(), text: '4k monitor\n', everyday: true }).verdict, 'allow', 'typing a search and submitting it');
  assert.equal(assessKey({ chord: chord('Enter'), focus: search(), everyday: true }).verdict, 'allow', 'Enter in a search box');
  // Not covered: everything else, and the same controls where they could matter.
  assert.equal(on(button('Add to cart')), 'ask', 'add to cart is not everyday');
  assert.equal(on(button('Next')), 'ask', '"Next" outside pagination (a checkout step)');
  assert.equal(on(button('Next', { inPagination: true, form: { hasCardField: true } })), 'ask', 'in a payment form');
  assert.equal(on(button('Next', { inPagination: true, pageUrl: 'https://shop.example/settings/privacy' }), { pageUrl: 'https://shop.example/settings/privacy' }), 'ask', 'on a settings page');
  assert.equal(on({ tag: 'input', type: 'text', role: 'textbox', name: 'Full name', field: { type: 'text', name: 'name' }, pageUrl: PAGE }), 'ask', 'another text field');
  assert.equal(on(search({ form: { isSearch: true, method: 'get', hasPasswordField: true } })), 'ask', 'a "search" field in a sign-in form');
  assert.equal(assessType({ focus: search({ form: { isSearch: true, method: 'post' } }), text: 'x\n', everyday: true }).verdict, 'ask', 'submitting a POST form');
  assert.equal(assessType({ focus: search(), text: 'a\nb', everyday: true }).verdict, 'ask', 'line breaks in the middle');
  assert.equal(assessType({ focus: { tag: 'textarea', role: 'textbox', name: 'Message', multiline: true }, text: 'hi', everyday: true }).verdict, 'ask', 'typing a message');
  assert.equal(assessKey({ chord: chord('s'), focus: search(), everyday: true }).verdict, 'allow');
  assert.equal(assessKey({ chord: chord('alt+s'), focus: search(), everyday: true }).verdict, 'ask', 'a shortcut in a search box');
  assert.equal(assessKey({ chord: chord('Tab'), focus: search(), everyday: true }).verdict, 'ask');
  // Off (the default): everything asks.
  assert.equal(assessClick({ desc: search(), pageUrl: PAGE }).verdict, 'ask');
  assert.equal(assessType({ focus: search(), text: 'monitor' }).verdict, 'ask');
  assert.equal(assessClick({ desc: button('Load more'), pageUrl: PAGE }).verdict, 'ask');
  assert.equal(isSearchField({ tag: 'input', type: 'password', field: { type: 'password' }, role: 'textbox', form: { isSearch: true } }), false);
});

test('RT2-A04: keys that would change a select, a radio or a slider are refused; scrolling keys with nothing focused or in a text field need nothing (elsewhere they ask, RT3-06)', () => {
  const select = { tag: 'select', role: 'combobox', name: 'Actions' };
  const radio = { tag: 'input', type: 'radio', role: 'radio', name: 'Disable two-factor authentication', isToggle: true };
  for (const k of ['d', 'End', 'Home', 'PageDown', 'ArrowDown', 'ArrowUp', 'shift+ArrowDown']) assert.equal(assessKey({ chord: chord(k), focus: select }).verdict, 'refuse', `select: ${k}`);
  for (const k of ['ArrowDown', 'ArrowRight', 'Home', 'End']) assert.equal(assessKey({ chord: chord(k), focus: radio }).verdict, 'refuse', `radio: ${k}`);
  assert.match(assessKey({ chord: chord('ArrowDown'), focus: select }).text, /use form_input/);
  assert.equal(assessKey({ chord: chord('ArrowDown'), focus: { tag: 'input', type: 'range', role: 'slider' } }).verdict, 'refuse');
  assert.equal(assessKey({ chord: chord('ArrowDown'), focus: { tag: 'div', role: 'listbox' } }).verdict, 'refuse');
  // Scrolling keys with nothing focused (Jarvis scrolls the page itself, sending no key) and in a
  // text field (the caret) need nothing; on a focused link or button they ask like any key (RT3-06:
  // pages bind arrows to actions).
  for (const focus of [null, { tag: 'textarea', role: 'textbox', multiline: true }]) {
    for (const k of ['ArrowDown', 'PageDown', 'End', 'Home']) assert.equal(assessKey({ chord: chord(k), focus }).verdict, 'allow', `${k} on ${focus?.tag || 'the page'}`);
  }
  for (const k of ['ArrowDown', 'PageDown', 'End', 'Home']) assert.equal(assessKey({ chord: chord(k), focus: null }).scroll, true, `${k} on the page is scrolled, not sent`);
  for (const focus of [link('/x'), button('Help')]) {
    for (const k of ['ArrowDown', 'PageDown', 'End', 'Home']) assert.equal(assessKey({ chord: chord(k), focus }).verdict, 'ask', `${k} on ${focus.tag}`);
  }
  // In lists, menus and tabs, arrows move a selection: they ask like any other key.
  assert.equal(assessKey({ chord: chord('ArrowDown'), focus: { tag: 'li', role: 'option', name: 'Tax return.pdf' } }).verdict, 'ask');
  assert.equal(arrowsChangeChoice({ tag: 'input', type: 'text', role: 'combobox' }), false, 'a text combobox moves its caret');
});

test('RT2-A03/A05: Enter in a chat box, Cmd/Ctrl+Enter and Alt+S in composers ask as sending; other chords as shortcuts', () => {
  const chat = { tag: 'textarea', role: 'textbox', multiline: true, name: 'Message', nearbyButtons: ['Send'] };
  for (const k of ['Enter', 'cmd+Enter', 'ctrl+Enter', 'alt+s', 'ctrl+alt+s', 'ctrl+shift+Enter']) {
    const v = assessKey({ chord: chord(k), focus: chat });
    assert.equal(v.verdict, 'ask', k);
    assert.equal(v.guard?.category, 'send', k);
  }
  const plainField = { tag: 'input', type: 'text', role: 'textbox', name: 'Title' };
  assert.equal(assessKey({ chord: chord('ctrl+shift+d'), focus: plainField }).guard?.category, 'shortcut');
  assert.equal(assessKey({ chord: chord('alt+s'), focus: null }).guard?.category, 'shortcut', 'Alt+S on the page');
  for (const k of ['cmd+a', 'cmd+z', 'cmd+shift+z', 'alt+ArrowLeft', 'cmd+Backspace', 'shift+ArrowRight']) {
    const v = assessKey({ chord: chord(k), focus: plainField });
    assert.ok(v.verdict === 'allow' || (v.verdict === 'ask' && !v.guard), `${k}: editing, not a shortcut (${JSON.stringify(v)})`);
  }
  assert.equal(assessKey({ chord: chord('Backspace'), focus: plainField }).verdict, 'ask', 'deleting text is a step too');
  assert.equal(assessKey({ chord: chord('Backspace'), focus: plainField }).guard, null);
});

test('RT2-A09/T6: the clipboard is never used: paste, copy and cut chords are refused; no key event carries a paste command', () => {
  for (const k of ['cmd+v', 'ctrl+v', 'cmd+shift+v', 'ctrl+shift+v', 'cmd+alt+shift+v', 'shift+Insert']) {
    assert.equal(isPasteChord(chord(k)), true, k);
    const v = assessKey({ chord: chord(k), focus: search() });
    assert.equal(v.verdict, 'refuse', k);
    assert.match(v.text, /^Refused: Jarvis never pastes/);
  }
  for (const k of ['cmd+c', 'ctrl+x', 'ctrl+Insert', 'shift+Delete']) assert.equal(isCopyCutChord(chord(k)), true, k);
  assert.equal(isPasteChord(chord('v')), false);
  assert.equal(isPasteChord(chord('shift+v')), false);
  for (const k of ['cmd+v', 'ctrl+v', 'cmd+c', 'ctrl+x']) assert.equal(chordEvents(chord(k)).keyDown.commands, undefined, `${k} sends no editing command`);
  assert.deepEqual(chordEvents(chord('cmd+a')).keyDown.commands, ['selectAll']);
});
