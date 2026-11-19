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
  assert.equal(classifySubmitKey(textarea), null, 'Enter in a textarea adds a line');
  assert.equal(classifySubmitKey(textarea, { modified: true })?.category, 'send', 'cmd+Enter sends');
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

test('approvals cover one category on one site, a few actions, for a short time', () => {
  let now = 1000;
  const a = new Approvals(() => now);
  assert.equal(a.consume('purchase', 'shop.example'), false);
  a.grant('purchase', 'shop.example');
  assert.equal(a.consume('send', 'shop.example'), false, 'other category');
  assert.equal(a.consume('purchase', 'other.example'), false, 'other site');
  for (let i = 0; i < APPROVAL_USES; i++) assert.equal(a.consume('purchase', 'shop.example'), true);
  assert.equal(a.consume('purchase', 'shop.example'), false, 'used up');
  a.grant('delete', 'mail.example');
  now += 3 * 60 * 1000;
  assert.equal(a.consume('delete', 'mail.example'), false, 'expired');
  a.decline('purchase', 'shop.example');
  assert.equal(a.isDeclined('purchase', 'shop.example'), true);
  assert.equal(a.isDeclined('purchase', 'other.example'), false);
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

test('S3/F1/S9: an approval covers one action, once, on its page, tab and site, within a minute', () => {
  let now = 1000;
  const a = new Approvals(() => now);
  const dell = { tabId: 'tab-1', url: 'https://shop.example/product/dell?x=1#reviews', text: 'Buy the Dell S2721QS 27-inch 4K monitor for $279.99 with Buy now' };
  assert.equal(a.grant('purchase', 'shop.example', dell), true);
  assert.equal(a.consume('purchase', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/product/lg', label: 'Buy now' }), false, 'another product page');
  assert.equal(a.consume('purchase', 'shop.example', { tabId: 'tab-2', url: 'https://shop.example/product/dell?x=1', label: 'Buy now' }), false, 'another tab');
  assert.equal(a.consume('purchase', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/product/dell?x=1', label: 'Delete review' }), false, 'a button the owner did not approve');
  assert.equal(a.consume('purchase', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/product/dell?x=1', label: 'Buy now' }), true, 'the approved action');
  assert.equal(a.consume('purchase', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/product/dell?x=1', label: 'Buy now' }), false, 'once only');
  a.grant('purchase', 'shop.example', dell);
  assert.equal(a.consume('purchase', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/product/dell?x=1', label: 'Continue', generic: true }), true, 'a generic commit takes the approved meaning');
  a.grant('purchase', 'shop.example', dell);
  now += 61 * 1000;
  assert.equal(a.consume('purchase', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/product/dell?x=1', label: 'Buy now' }), false, 'expired after a minute');
  // S9: an approval asked while no website was open matches nothing.
  assert.equal(a.grant('purchase', '', { text: 'Sign up for the newsletter' }), false);
  assert.equal(a.consume('purchase', 'shop.example', { label: 'Buy now' }), false);
  assert.equal(a.consumeForDialog(null, 'shop.example', {}), false);
  assert.equal(pageKey('https://shop.example/a?b=1#c'), 'https://shop.example/a?b=1');
});
