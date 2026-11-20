// The consequential-action guard and the secret-field checks (safety rules 3 and 4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Approvals, APPROVAL_USES, classifyAction, classifySubmitKey, secretKind, secretRefusal } from '../../../extension/src/background/guard.js';

const button = (name, extra = {}) => ({ tag: 'button', role: 'button', name, ...extra });
const link = (name, href = 'https://shop.example/x', extra = {}) => ({ tag: 'a', role: 'link', name, href, ...extra });
const cat = (d) => classifyAction(d)?.category ?? null;

test('purchases and payments', () => {
  for (const name of ['Buy now', 'Buy it now', 'Place order', 'Place your order', 'Complete purchase', 'Confirm and pay', 'Pay now', 'Pay $279.99', 'Submit payment', 'Subscribe', 'Start free trial', 'Donate', 'Book now', 'Place bid', 'Send money']) {
    assert.equal(cat(button(name)), 'purchase', name);
  }
});

test('reversible shopping steps are not consequential', () => {
  for (const name of ['Add to cart', 'Add to bag', 'View cart', 'Proceed to checkout', 'Checkout', 'Continue to payment', 'Search', 'Remove', 'Next', 'Sign in', 'Show more', 'Buying guide']) {
    assert.equal(cat(button(name)), null, name);
  }
  assert.equal(cat(link('Buy', 'https://apple.example/buy-mac', { name: 'Buy a Mac' })), null, 'a navigation link');
});

test('sending, posting, deleting, account changes, agreements, downloads', () => {
  assert.equal(cat(button('Send')), 'send');
  assert.equal(cat(button('Send message')), 'send');
  assert.equal(cat(button('Post')), 'post');
  assert.equal(cat(button('Publish')), 'post');
  assert.equal(cat(button('Tweet')), 'post');
  assert.equal(cat(button('Delete')), 'delete');
  assert.equal(cat(button('Move to trash')), 'delete');
  assert.equal(cat(button('Cancel subscription')), 'delete');
  assert.equal(cat(button('Change password')), 'account');
  assert.equal(cat(button('Turn off two-factor authentication')), 'account');
  assert.equal(cat(button('Authorize')), 'account');
  assert.equal(cat(button('I agree')), 'agreement');
  assert.equal(cat(button('Accept terms')), 'agreement');
  assert.equal(cat(button('Download')), 'download');
  assert.equal(cat(link('Get the app', 'https://x.example/setup.dmg')), 'download');
  assert.equal(cat(link('Report', 'https://x.example/r.pdf', { download: true })), 'download');
});

test('"Save changes" counts as an account change only on settings pages', () => {
  assert.equal(cat(button('Save changes', { pageUrl: 'https://mail.example/settings/security' })), 'account');
  assert.equal(cat(button('Save changes', { pageUrl: 'https://docs.example/edit/123' })), null);
});

test('generic buttons take their meaning from the dialog or form', () => {
  assert.equal(cat(button('Confirm', { dialogText: 'Are you sure you want to delete this file? This cannot be undone.' })), 'delete');
  assert.equal(cat(button('Continue', { form: { hasCardField: true } })), 'purchase');
  assert.equal(cat(button('OK', { dialogText: 'Your session will expire soon.' })), null);
  assert.equal(cat(button('Submit', { isSubmit: true, form: { isSearch: false, hasMessageField: true } })), 'send');
  assert.equal(cat(button('Submit', { isSubmit: true, form: { isSearch: true } })), null);
});

test('composer buttons next to a text box send', () => {
  assert.equal(cat(button('Reply', { nearTextbox: true })), 'send');
  assert.equal(cat(button('Comment', { nearTextbox: true })), 'post');
  assert.equal(cat(button('Reply')), null, '"Reply" alone just opens a composer');
});

test('consent checkboxes', () => {
  assert.equal(cat({ tag: 'input', role: 'checkbox', isCheckbox: true, name: 'I agree to the Terms of Service', checked: false }), 'agreement');
  assert.equal(cat({ tag: 'input', role: 'checkbox', isCheckbox: true, name: 'Remember me', checked: false }), null);
});

test('Enter submits through the form; search forms and message line breaks are fine', () => {
  const field = (form, extra = {}) => ({ tag: 'input', role: 'textbox', name: 'x', form, ...extra });
  assert.equal(classifySubmitKey(field({ isSearch: true, submitLabel: 'Search' })), null);
  assert.equal(classifySubmitKey(field({ isSearch: false, submitLabel: 'Place order' }))?.category, 'purchase');
  assert.equal(classifySubmitKey(field({ isSearch: false, submitLabel: 'Sign in' })), null);
  assert.equal(classifySubmitKey(field({ isSearch: false, submitLabel: 'Continue', hasCardField: true }))?.category, 'purchase');
  const textarea = { tag: 'textarea', role: 'textbox', multiline: true, nearbyButtons: ['Send', 'Discard'] };
  // RT2-A03: support chats and messengers send on a plain Enter in a textarea too.
  assert.equal(classifySubmitKey(textarea)?.category, 'send', 'Enter in a textarea next to Send may send it');
  assert.equal(classifySubmitKey(textarea, { modified: true })?.category, 'send', 'cmd+Enter sends');
  assert.equal(classifySubmitKey({ tag: 'textarea', role: 'textbox', multiline: true, nearbyButtons: ['Save'] }), null, 'no send or post button: a line break');
  assert.equal(classifySubmitKey({ tag: 'textarea', role: 'textbox', multiline: true }), null);
  assert.equal(classifySubmitKey({ tag: 'textarea', role: 'textbox', multiline: true, form: { isSearch: false, submitLabel: 'Post reply' } })?.category, 'post', 'a form whose button posts');
  const chat = { tag: 'div', role: 'textbox', isContentEditable: true, enterSends: true, nearbyButtons: ['Send'] };
  assert.equal(classifySubmitKey(chat)?.category, 'send', 'chat boxes send on Enter');
  assert.equal(classifySubmitKey(button('Delete account'))?.category, 'delete', 'Enter on a focused button activates it');
});

test('secret fields: passwords, card numbers, security codes, IDs and payment frames', () => {
  assert.equal(secretKind({ type: 'password' }), 'password');
  assert.equal(secretKind({ type: 'text', autocomplete: 'one-time-code' }), 'password');
  assert.equal(secretKind({ type: 'text', autocomplete: 'cc-number' }), 'card');
  assert.equal(secretKind({ type: 'text', autocomplete: 'cc-csc' }), 'cvv');
  assert.equal(secretKind({ type: 'text', name: 'cardnumber' }), 'card');
  assert.equal(secretKind({ type: 'tel', placeholder: '1234 1234 1234 1234' }), 'card');
  assert.equal(secretKind({ type: 'text', label: 'Security code' }), 'cvv');
  assert.equal(secretKind({ type: 'text', name: 'cvc' }), 'cvv');
  assert.equal(secretKind({ type: 'text', label: 'Social Security number' }), 'id');
  assert.equal(secretKind({ type: 'text', label: 'Enter your PIN' }), 'password');
  assert.equal(secretKind({ iframe: { src: 'https://js.stripe.com/v3/elements-inner-card-abc.html' } }), 'card');
  assert.equal(secretKind({ iframe: { src: 'https://accounts.google.com/signin' } }), 'password');
  for (const f of [{ type: 'email', name: 'email' }, { type: 'text', name: 'q', placeholder: 'Search' }, { type: 'text', label: 'Passport photo caption' }, { type: 'text', label: 'Card holder name' }, { iframe: { src: 'https://www.youtube.com/embed/x' } }]) {
    assert.equal(secretKind(f), null, JSON.stringify(f));
  }
  assert.match(secretRefusal('password'), /^Refused: this field holds a password\..*Please sign in yourself, then tell me to continue/);
});

test('approvals cover one element on one site, once, for a short time', () => {
  let now = 1000;
  const a = new Approvals(() => now);
  // (A plain click on that element, read by the guard as the owner's card showed it: see RT5B-01.)
  const el = { site: 'shop.example', tabId: 'tab-1', url: 'https://shop.example/p', doc: 3, targetId: 7, ctx: 'Dell S2721QS — $279.99', selection: '0|', kind: 'click', verdict: { consequential: false, category: 'change', label: 'Continue' } };
  assert.equal(a.consume(el), null);
  assert.equal(a.grant({ category: 'purchase', ...el, text: 'Buy the Dell' }), true);
  assert.equal(a.consume({ ...el, site: 'other.example' }), null, 'other site');
  for (let i = 0; i < APPROVAL_USES; i++) assert.equal(a.consume(el)?.category, 'purchase');
  assert.equal(a.consume(el), null, 'used up');
  a.grant({ category: 'delete', ...el, site: 'mail.example' });
  now += 3 * 60 * 1000;
  assert.equal(a.consume({ ...el, site: 'mail.example' }), null, 'expired');
  a.decline('purchase', 'shop.example');
  assert.equal(a.isDeclined('purchase', 'shop.example'), true);
  assert.equal(a.isDeclined('purchase', 'other.example'), false);
  // An ordinary step the owner cancels blocks that element and its address, not every step.
  a.decline('change', 'shop.example', { element: 'tab-1|3|9', href: 'https://shop.example/act/delete?id=1#x' });
  assert.equal(a.isDeclined('change', 'shop.example'), false);
  assert.equal(a.isDeclinedElement('tab-1|3|9'), true);
  assert.equal(a.isDeclinedHref('https://shop.example/act/delete?id=1'), true);
  assert.equal(a.isDeclinedHref('https://shop.example/act/delete?id=2'), false);
});

test('a click into a cross-origin payment frame is a purchase', () => {
  assert.equal(cat({ tag: 'iframe', role: 'iframe', name: 'PayPal', iframe: { src: 'https://www.paypal.com/smart/buttons?x=1', title: 'PayPal' } }), 'purchase');
  assert.equal(cat({ tag: 'iframe', role: 'iframe', name: 'Video', iframe: { src: 'https://www.youtube.com/embed/x', title: 'Video' } }), null);
});

// ---------------------------------------------------------------------------------------------
// Review fixes (safety review S2, S3, S5, S6, S7, S9, S10, S11, S15; function review F1)

import { classifyDialogText, classifyOption, classifyShortcutKey, classifySpaceKey, classifyToggle, isEditableFocus, isNonNavigatingLink, pageKey } from '../../../extension/src/background/guard.js';

test('S5: switches, checkboxes and radios are judged by what they change, ticked or unticked', () => {
  const sw = (name, checked, extra = {}) => ({ tag: 'button', role: 'switch', isToggle: true, isCheckbox: true, name, checked, ...extra });
  const box = (name, checked, extra = {}) => ({ tag: 'input', type: 'checkbox', role: 'checkbox', isToggle: true, isCheckbox: true, name, checked, ...extra });
  assert.equal(cat(sw('Disable two-factor authentication', true)), 'account', 'a switch that turns 2FA off');
  assert.equal(cat(sw('Two-factor authentication', true, { pageUrl: 'https://acct.example/settings/security' })), 'account', 'a bare 2FA switch');
  assert.equal(cat(sw('Two-factor authentication', false)), 'account', 'turning it on is a security change too');
  assert.equal(cat(box('Require a security key when signing in', true)), 'account', 'unticking a security requirement');
  assert.equal(cat(box('Delete all my data', false)), 'delete');
  assert.equal(cat(box('I agree to the Terms of Service and authorize a recurring $49.99/month charge', false)), 'agreement');
  assert.equal(cat({ tag: 'input', type: 'radio', role: 'radio', isToggle: true, name: 'Delete all messages permanently', checked: false }), 'delete', 'a radio');
  assert.equal(classifyToggle(box('Turn off two-factor authentication', false), { willCheck: true })?.category, 'account');
  const radio = (name) => ({ tag: 'input', type: 'radio', role: 'radio', isToggle: true, name, checked: false });
  for (const harmless of [box('Remember me', false), box('Send me a copy', false), box('Show password', false), sw('Dark mode', false), box('I agree to the Terms', true), radio('Pay with PayPal'), radio('Upgrade to Premium ($9.99/month)'), box('Keep me signed in', false), box('Email me news and offers', false)]) {
    assert.equal(cat(harmless), null, harmless.name);
  }
});

test('S5: a select whose option deletes is consequential', () => {
  assert.equal(classifyOption({ name: 'Actions' }, 'Delete all messages')?.category, 'delete');
  assert.equal(classifyOption({ name: 'Actions' }, 'Mark all as read'), null);
  assert.equal(classifyOption({ name: 'Quantity' }, '2'), null);
});

test('S10: links that do not navigate are judged like buttons; strong phrases on real links', () => {
  const page = 'https://shop.example/review';
  const a = (name, href, extra = {}) => ({ tag: 'a', role: href ? 'link' : '', name, href, pageUrl: page, ...extra });
  assert.equal(cat(a('Pay $279.99', `${page}#`)), 'purchase');
  assert.equal(cat(a('Confirm purchase', 'javascript:void(0)')), 'purchase');
  assert.equal(cat(a('Send message', '')), 'send');
  assert.equal(cat(a('Submit order', `${page}`)), 'purchase', 'a link to this same page');
  assert.equal(cat(a('Submit order', 'https://shop.example/order/submit')), 'purchase', 'a strong phrase on a real link');
  assert.equal(cat(a('Pay $279.99', 'https://shop.example/pay')), 'purchase');
  assert.equal(isNonNavigatingLink(a('x', `${page}#top`)), true);
  assert.equal(isNonNavigatingLink(a('x', 'https://shop.example/other')), false);
  for (const [name, href] of [['Buy a Mac', 'https://apple.example/buy-mac'], ['Pay bills', 'https://bank.example/bills'], ['Send message', 'https://mail.example/messages/new'], ['Order history', 'https://shop.example/orders'], ['Proceed to checkout', '#'], ['Add to cart', '#']]) {
    assert.equal(cat(a(name, href)), null, `${name} -> ${href}`);
  }
});

test('S10: a generic "Continue" on an order-review step is a purchase', () => {
  const review = 'Review your order Dell S2721QS 27 4K monitor $279.99 Ship to 1 Main St. Payment: Visa ending 4242. Total $279.99.';
  assert.equal(cat(button('Continue', { contextText: review })), 'purchase');
  assert.equal(cat(button('Continue', { dialogText: 'Payment: Visa ending 4242. Total $279.99.' })), 'purchase', 'in a payment dialog');
  assert.equal(cat(button('Continue', { contextText: 'Your cart: Dell monitor $279.99. Subtotal $279.99.' })), null, 'a cart page');
  assert.equal(cat(button('Continue', { contextText: 'Create your account. Email, password.' })), null, 'a sign-up page');
});

test('S11: the visible text counts as much as the accessible name', () => {
  const c = classifyAction({ tag: 'button', role: 'button', name: 'Add to wishlist', text: 'Buy now — $999' });
  assert.equal(c?.category, 'purchase');
  assert.equal(c.label, 'Buy now — $999', 'the owner is shown what the button shows');
  assert.equal(c.alias, 'Add to wishlist');
  assert.equal(cat({ tag: 'button', role: 'button', name: 'Delete', text: '' }), 'delete', 'an icon button named by aria-label');
});

test('S6: moving an amount of money is a purchase or payment', () => {
  for (const name of ['Transfer $500 to Alex', 'Send $20', 'Wire $1,000 now', 'Pay €15 to Sam']) assert.equal(cat(button(name)), 'purchase', name);
});

test('S2: Space on a focused button presses it, and flips a focused switch', () => {
  assert.equal(classifySpaceKey(button('Buy now'))?.category, 'purchase');
  assert.equal(classifySpaceKey({ tag: 'button', role: 'switch', isToggle: true, name: 'Disable two-factor authentication', checked: true })?.category, 'account');
  assert.equal(classifySpaceKey(button('Add to cart')), null);
});

test('S15: Delete, Backspace and single-key shortcuts outside text fields may delete', () => {
  const row = { tag: 'li', role: 'option', name: 'Tax return 2025.pdf' };
  const key = (k, mods = [], printable = false) => ({ key: k, mods, printable });
  assert.equal(classifyShortcutKey(key('Delete'), row)?.category, 'delete');
  assert.equal(classifyShortcutKey(key('Delete'), row)?.label, 'Tax return 2025.pdf');
  assert.equal(classifyShortcutKey(key('Backspace', ['meta']), row)?.category, 'delete');
  assert.equal(classifyShortcutKey(key('e', [], true), null)?.category, 'delete', 'Gmail "e" with focus on the page');
  assert.equal(classifyShortcutKey(key('E', ['shift'], true), row)?.category, 'delete');
  for (const [k, focus] of [[key('ArrowDown'), row], [key('Tab'), row], [key('Escape'), row], [key('a', ['meta'], false), row], [key(' ', [], true), row]]) {
    assert.equal(classifyShortcutKey(k, focus), null, JSON.stringify(k));
  }
  for (const field of [{ tag: 'input', type: 'text' }, { tag: 'textarea' }, { tag: 'div', isContentEditable: true }, { tag: 'input', type: 'search' }]) {
    assert.equal(isEditableFocus(field), true);
    assert.equal(classifyShortcutKey(key('Backspace'), field), null, 'editing text');
    assert.equal(classifyShortcutKey(key('e', [], true), field), null);
  }
});

test('S7: what a confirm() dialog asks about', () => {
  assert.equal(classifyDialogText('Permanently delete your account and all your data? This cannot be undone.'), 'delete');
  assert.equal(classifyDialogText('Place your order for $279.99?'), 'purchase');
  assert.equal(classifyDialogText('Send this message?'), 'send');
  assert.equal(classifyDialogText('Are you sure?'), null);
});

test('S3/F1/S9/RT2-A01: an approval covers one element, in its state, once, on its page, tab and site, within a minute', () => {
  let now = 1000;
  const a = new Approvals(() => now);
  const cable = { site: 'shop.example', tabId: 'tab-1', url: 'https://shop.example/deals?x=1#top', doc: 2, targetId: 11, ctx: 'USB-C cable, 1 m — $9.00 Buy now', selection: '0|', kind: 'click', verdict: { consequential: true, category: 'purchase', label: 'Buy now' } };
  const here = { ...cable, url: 'https://shop.example/deals?x=1' };
  assert.equal(a.grant({ category: 'purchase', ...cable, text: 'Buy the USB-C cable (1 m) for $9.00' }), true);
  assert.equal(a.consume({ ...here, url: 'https://shop.example/product/lg' }), null, 'another page');
  assert.equal(a.consume({ ...here, tabId: 'tab-2' }), null, 'another tab');
  assert.equal(a.consume({ ...here, doc: 3 }), null, 'another document of the page');
  // RT2-A01: the same label on another item ("Buy now" next to a $2,499 laptop) is another element.
  assert.equal(a.consume({ ...here, targetId: 12, ctx: 'MacBook Pro 16" — $2,499.00 Buy now' }), null, 'a same-labelled button on another item');
  assert.equal(a.consume({ ...here, targetId: 12, ctx: cable.ctx }), null, 'another element, even showing the same item');
  // RT2-A13: the same element after the page swapped the item it belongs to.
  assert.equal(a.consume({ ...here, ctx: 'MacBook Pro 16" — $2,499.00 Buy now' }), null, 'the item changed');
  // RT2-A01: a toolbar button after the selection changed ("Select all", then "Delete").
  assert.equal(a.consume({ ...here, selection: '3|Acme|Accountant|Mom' }), null, 'the selection changed');
  // A generic "Continue" or "Yes, delete all" is covered only by an approval bound to it.
  assert.equal(a.consume({ ...here, targetId: 13, ctx: 'Empty inbox? Yes, delete all' }), null, 'a generic label elsewhere');
  assert.ok(a.consume(here), 'the approved element, as the owner saw it');
  assert.equal(a.consume(here), null, 'once only');
  a.grant({ category: 'purchase', ...cable });
  now += 61 * 1000;
  assert.equal(a.consume(here), null, 'expired after a minute');
  // S9: an approval asked while no website was open, or for no element, matches nothing.
  assert.equal(a.grant({ category: 'purchase', ...cable, site: '' }), false);
  assert.equal(a.grant({ category: 'purchase', ...cable, targetId: undefined }), false);
  assert.equal(a.grant({ category: 'purchase', ...cable, tabId: '' }), false);
  assert.equal(a.live().length, 0);
  // RT2-A07: there is no way for a page's question to use an approval up.
  assert.equal(a.consumeForDialog, undefined);
  assert.equal(pageKey('https://shop.example/a?b=1#c'), 'https://shop.example/a?b=1');
});

// ---------------------------------------------------------------------------------------------
// Second review (RT2-A10, T4): what the owner's prompt says a step would do

import { classifyComposerShortcut, needsContext, secretKindOf } from '../../../extension/src/background/guard.js';

test('RT2-A10: explicit money, removal and account wording is recognised', () => {
  const b = (name, extra = {}) => cat({ tag: 'button', role: 'button', name, text: name, ...extra });
  for (const n of ['Confirm transfer', 'Make payment', 'Make a payment', 'Schedule payment', 'Withdraw funds', 'Cash out', 'Sell now', 'Submit bid', 'Confirm sale', 'Request ride', 'Order']) assert.equal(b(n), 'purchase', n);
  for (const n of ['Remove card', 'Remove payment method', 'Remove device']) assert.equal(b(n), 'delete', n);
  for (const n of ['Unlink account', 'Disconnect']) assert.equal(b(n), 'account', n);
  assert.equal(b('Disconnect from Wi-Fi'), null);
  for (const n of ['Save for later', 'Add to cart', 'Order history']) assert.equal(b(n), null, n);
  // A bare verb takes its object from the heading, legend or dialog around it.
  assert.equal(b('Turn off', { headingText: '2-Step Verification' }), 'account');
  assert.equal(b('Remove', { headingText: 'Danger zone' }), 'delete');
  assert.equal(b('Turn off'), null, 'alone it says nothing');
  assert.equal(b('Confirm', { isSubmit: true, form: { text: 'From: Checking ••1234 To: Alex Amount: $5,000.00' } }), 'purchase', 'a generic Confirm on a transfer review');
  assert.equal(needsContext('Turn off'), true);
  assert.equal(needsContext('Buy now'), false);
  // A radio or switch means what its group says.
  const radio = (name, groupLabel) => classifyToggle({ tag: 'input', type: 'radio', role: 'radio', isToggle: true, name, groupLabel }, { willCheck: true });
  assert.equal(radio('Off', 'Two-factor authentication for payments')?.category, 'account');
  assert.equal(radio('Price: low to high', 'Sort by'), null);
});

test('RT2-A05: a shortcut in a composer with a Send button is sending', () => {
  const editor = { tag: 'div', role: 'textbox', isContentEditable: true, nearbyButtons: ['Bold', 'Italic', 'Send'] };
  assert.equal(classifyComposerShortcut({ key: 's', mods: ['alt'] }, editor)?.category, 'send');
  assert.equal(classifyComposerShortcut({ key: 's', mods: ['ctrl', 'alt'] }, editor)?.category, 'send');
  assert.equal(classifyComposerShortcut({ key: 's', mods: [] }, editor), null, 'a typed letter');
  assert.equal(classifyComposerShortcut({ key: 's', mods: ['alt'] }, { ...editor, nearbyButtons: ['Save'] }), null);
});

test('T4: reading and typing use one secret rule (the page agent bundles secretKindOf)', () => {
  const field = (f, extra = {}) => ({ tag: 'input', role: 'textbox', field: { tag: 'input', type: 'text', ...f }, ...extra });
  const cases = [
    [field({ name: 'card-number', id: 'card-number' }), 'card'],
    [field({ name: 'card_number' }), 'card'],
    [field({ name: 'cc-number' }), 'card'],
    [field({ name: 'cvc2' }), 'cvv'],
    [field({ name: 'cvv2' }), 'cvv'],
    [field({ name: 'security_code' }), 'cvv'],
    [field({ name: 'pinfield' }, { name: 'Card PIN' }), 'password'],
    [field({ name: 'otp' }), 'password'],
    [field({ name: 'ssn' }), 'id'],
    [field({ name: 'pwd' }), 'password'],
    [field({ name: 'passwd' }), 'password'],
    [field({ name: 'x', placeholder: '1234 1234 1234 1234' }), 'card'],
    [field({ name: 'x' }, { name: 'Password' }), 'password'],
    [{ tag: 'div', role: 'textbox', isContentEditable: true, name: 'Password' }, 'password'],
    [field({ name: 'fullname' }, { name: 'Full name' }), null],
    [field({ name: 'q', type: 'search' }, { name: 'Search products', role: 'searchbox' }), null],
  ];
  for (const [desc, kind] of cases) assert.equal(secretKindOf(desc), kind, JSON.stringify(desc));
});
