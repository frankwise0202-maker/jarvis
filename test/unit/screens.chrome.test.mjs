// "Pull this up in Chrome" (v8.1, G1): the matcher, the address for each target, the address rules
// and the lines Jarvis says (src/lib/chrome-commands.js). Pure.
//   - only browser words open the browser; "search for flights to Denver" stays a question
//   - a search goes through the 2-second check (the words leave the Mac); "this", links, sites don't
//   - http(s) only, no user name or password; never javascript:, data: or file:
//   - an address that does something is found by the extension's own classifier (one rule for both)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHROME_SITES, addressAction, chromeLine, matchChromeCommand, normalizeChromeText, planChromeOpen, safeAddress, searchUrl } from '../../src/lib/chrome-commands.js';
import { classifyAddress } from '../../extension/src/background/address.js';
import { matchScreenCommand } from '../../src/lib/screen-commands.js';

// The router's state with a newest reply that has links (and one without).
const LINKS = { reply: { links: [{ url: 'https://example.com/a', title: 'A' }, { url: 'https://example.com/b', title: 'B' }] } };
const NO_LINKS = { reply: { links: [] } };
const target = (t, state = LINKS) => {
  const m = matchChromeCommand(t, state);
  return m && m.do === 'chrome-open' ? { ...m.target, where: m.where, check: m.check } : m && m.do;
};

test('ROUTING-3: a sentence about a Google product is no search; "google stock price" keeps Google in the query', () => {
  // Statements about one of Google's products reach Jarvis (never a search for the words after "Google").
  for (const t of ["Google Home isn't responding", "Google Docs won't open", 'Google Maps keeps freezing', 'Google Photos stopped backing up', 'Google Meet has no sound', 'Google Maps sent me the wrong way', 'Google Calendar deleted my event', 'Google Nest thermostat keeps resetting', 'Google Pixel battery drains fast']) {
    assert.equal(matchChromeCommand(t, NO_LINKS), null, t);
  }
  // A search whose subject is Google itself keeps the word.
  assert.deepEqual(target('google stock price'), { kind: 'search', query: 'google stock price', where: 'auto', check: true });
  assert.deepEqual(target('google earnings today'), { kind: 'search', query: 'google earnings today', where: 'auto', check: true });
  assert.deepEqual(target('google home depot hours'), { kind: 'search', query: 'google home depot hours', where: 'auto', check: true });
  // Unchanged: a plain search, a question searched, Google Maps opened.
  assert.deepEqual(target('google USB-C chargers'), { kind: 'search', query: 'usb-c chargers', where: 'auto', check: true });
  assert.deepEqual(target('google how do I reset Google Home'), { kind: 'search', query: 'how do i reset google home', where: 'auto', check: true });
  assert.deepEqual(target('google my phone keeps restarting'), { kind: 'search', query: 'my phone keeps restarting', where: 'auto', check: true });
  assert.deepEqual(target('google maps'), { kind: 'site', url: 'https://maps.google.com/', name: 'Google Maps', where: 'auto', check: false });
});

test('the owner\'s words: "pull this up in Chrome", links, Google, sites', () => {
  assert.deepEqual(target('Pull this up in Google Chrome.'), { kind: 'this', where: 'auto', check: false });
  assert.deepEqual(target('Hey Jarvis, pull this up in Chrome'), { kind: 'this', where: 'auto', check: false });
  assert.deepEqual(target('open that in a new tab'), { kind: 'this', where: 'auto', check: false });
  assert.deepEqual(target('put it in Chrome'), { kind: 'this', where: 'auto', check: false });
  assert.deepEqual(target('open the second link'), { kind: 'link', ordinal: 2, where: 'auto', check: false });
  assert.deepEqual(target('open the first link in Chrome'), { kind: 'link', ordinal: 1, where: 'auto', check: false });
  assert.deepEqual(target('open link 3'), { kind: 'link', ordinal: 3, where: 'auto', check: false });
  assert.deepEqual(target('open link three'), { kind: 'link', ordinal: 3, where: 'auto', check: false });
  assert.deepEqual(target('open the last link'), { kind: 'link', ordinal: -1, where: 'auto', check: false });
  assert.deepEqual(target('open the source'), { kind: 'link', ordinal: 1, where: 'auto', check: false });
  assert.deepEqual(target('google USB-C chargers'), { kind: 'search', query: 'usb-c chargers', where: 'auto', check: true });
  assert.deepEqual(target('search Google for the E14 battery'), { kind: 'search', query: 'the e14 battery', where: 'auto', check: true });
  assert.deepEqual(target('search for usb c chargers in Chrome'), { kind: 'search', query: 'usb c chargers', where: 'auto', check: true });
  assert.deepEqual(target('look up heat pipes on Google'), { kind: 'search', query: 'heat pipes', where: 'auto', check: true });
  assert.deepEqual(target('google what is a heat pipe'), { kind: 'search', query: 'what is a heat pipe', where: 'auto', check: true });
  assert.deepEqual(target('google it'), { kind: 'this-search', where: 'auto', check: false });
  assert.deepEqual(target('look it up on Google'), { kind: 'this-search', where: 'auto', check: false });
  assert.deepEqual(target('open YouTube'), { kind: 'site', url: 'https://www.youtube.com/', name: 'YouTube', where: 'auto', check: false });
  assert.deepEqual(target('go to amazon.com'), { kind: 'site', url: 'https://amazon.com/', name: 'amazon.com', where: 'auto', check: false });
  assert.deepEqual(target('google maps'), { kind: 'site', url: 'https://maps.google.com/', name: 'Google Maps', where: 'auto', check: false });
  assert.deepEqual(target('open the Lenovo support page in Chrome'), { kind: 'search', query: 'lenovo support page', where: 'auto', check: true });
  assert.equal(target('close that tab'), 'chrome-close-tab');
});

test('"in my Chrome", "in a normal tab": the owner\'s usual window, never the Jarvis window', () => {
  assert.equal(matchChromeCommand('pull this up in my Chrome').where, 'mine');
  assert.equal(matchChromeCommand('open it in a normal tab').where, 'mine');
  assert.equal(matchChromeCommand('open the second link in my browser', LINKS).where, 'mine');
  assert.equal(matchChromeCommand('search for heat pipes in my normal Chrome').where, 'mine');
  assert.equal(matchChromeCommand('pull this up in Chrome').where, 'auto');
  assert.equal(matchChromeCommand('open that in a new tab').where, 'auto');
});

test('the router\'s fields: free; opening is never taken from an alternative reading; searches checked', () => {
  const m = matchChromeCommand('pull this up in Chrome');
  assert.deepEqual([m.do, m.free, m.undo, m.check, m.camera], ['chrome-open', true, false, false, false]);
  assert.equal(matchChromeCommand('google heat pipes').check, true);
  assert.equal(matchChromeCommand('open youtube').check, false);
});

test('not Chrome: no browser word, questions, statements, tasks for Jarvis for Chrome', () => {
  const negatives = [
    'search for flights to Denver next Friday',
    'look it up',
    'look it up online',
    'search it up online',
    'research the best laptops under 800 dollars',
    'find me a 4K monitor under 300 dollars',
    'pull this up',
    'open my email',
    'open the door',
    'go to bed',
    'go to the store',
    'go to amazon and buy a charger',
    'open youtube music on my phone',
    'open a new tab in my life',
    'close the tab on my phone',
    'google is a company',
    'google maps is down again',
    'google and apple compared',
    'chrome plating costs',
    'how do I open a new window in Chrome',
    'is Chrome better than Safari',
    'what is a browser tab',
    'open the camera in Chrome',
    'open settings in Chrome',
    // tasks: Jarvis for Chrome clicks around (chrome-task-words.js), not a search tab
    'find a 4K monitor under $300 and add it to the cart in Chrome',
    'search for a 4k monitor and add the cheapest one to the cart in Chrome',
    'open the lenovo store and add a battery to my cart in Chrome',
    // Screens' own words
    'open the link on my other screen',
    'put the report in a window',
    '',
  ];
  for (const t of negatives) assert.equal(matchChromeCommand(t), null, `"${t}"`);
  assert.ok(matchScreenCommand('open the link on my other screen'), 'Screens takes it');
});

test('lead decision D1: page words are Jarvis for Chrome\'s tasks; "open the Nth link" only with reply links', () => {
  // Sentences that start with "click": never this matcher's (in a Chrome context they are tasks).
  for (const t of ['click the first result', 'click the first link', 'click on the second link', 'click add to cart', 'Click the cheapest one in Chrome']) {
    for (const st of [LINKS, NO_LINKS]) assert.equal(matchChromeCommand(t, st), null, `"${t}" (reply links: ${st === LINKS})`);
  }
  // Page objects: never a Google search, never "this".
  for (const t of [
    'open the cheapest one in Chrome',
    'open the second result in Chrome',
    'open the first result',
    'open the first result in Chrome',
    'open that result in Chrome',
    'open the second item in Chrome',
    'open this product in Chrome',
    'open the listing in Chrome',
    'go to the cart in Chrome',
    'open the cheapest 4K monitor in Chrome',
    'google the cheapest one',
    'search for that result in Chrome',
    'look up the first result on Google',
    'search this site for USB-C chargers in Chrome',
    'scroll down in Chrome',
    'pull that one up in Chrome',
  ]) {
    for (const st of [LINKS, NO_LINKS]) assert.equal(matchChromeCommand(t, st), null, `"${t}" (reply links: ${st === LINKS})`);
  }
  // "Open the second link": the newest reply's link when it has links; otherwise declined (in a
  // Chrome context it becomes a task).
  assert.deepEqual(target('open the second link', LINKS), { kind: 'link', ordinal: 2, where: 'auto', check: false });
  assert.equal(matchChromeCommand('open the second link', NO_LINKS), null, 'no links in the newest reply');
  assert.equal(matchChromeCommand('open the second link'), null, 'no reply state: declined');
  assert.equal(matchChromeCommand('open the second link in Chrome', NO_LINKS), null, 'never a search for "second link"');
  assert.deepEqual(target('open the second link', { reply: { links: 3 } }), { kind: 'link', ordinal: 2, where: 'auto', check: false }, 'a count of links works too');
  // Still Chrome's: searches that merely contain such words, sites, "this".
  assert.deepEqual(target('google best USB-C chargers'), { kind: 'search', query: 'best usb-c chargers', where: 'auto', check: true });
  assert.deepEqual(target('search for top deals on laptops in Chrome'), { kind: 'search', query: 'top deals on laptops', where: 'auto', check: true });
  assert.equal(target('open Best Buy in Chrome').kind, 'site');
  assert.equal(target('pull this up in Chrome').kind, 'this');
  assert.equal(target('open this page in Chrome').kind, 'this');
});

test('normalization keeps addresses and model names whole', () => {
  assert.equal(normalizeChromeText('Hey Jarvis, go to Amazon.com, please.'), 'go to amazon.com');
  assert.equal(normalizeChromeText("Google USB-C chargers for me"), 'google usb-c chargers');
  assert.equal(normalizeChromeText("what's that"), 'whats that');
});

test('addresses: http and https only, no user name or password; the search address', () => {
  assert.equal(safeAddress('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeAddress('http://example.com'), 'http://example.com/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'https://user:pw@example.com/', 'https://user@example.com/', 'ftp://example.com/', 'chrome://settings', '//example.com', `https://example.com/${'a'.repeat(2100)}`, null, 42]) {
    assert.equal(safeAddress(bad), null, String(bad).slice(0, 40));
  }
  assert.equal(searchUrl('USB-C chargers & cables'), 'https://www.google.com/search?q=USB-C%20chargers%20%26%20cables');
  for (const [, [url]] of Object.entries(CHROME_SITES)) assert.equal(safeAddress(url), url, url);
});

test('an address that does something: the extension\'s own classifier, in plain words', () => {
  assert.deepEqual(addressAction('https://shop.example.com/product?add-to-cart=42'), { category: 'change', word: 'add-to-cart', does: 'adds to a cart' });
  assert.equal(addressAction('https://shop.example.com/orders/7/cancel').does, 'deletes or cancels something');
  assert.equal(addressAction('https://example.com/account/logout').does, 'changes something about an account');
  assert.equal(addressAction('https://example.com/buy-now?item=3').does, 'buys or pays for something');
  assert.equal(addressAction('https://www.example.com/reviews/kia-ev9'), null);
  assert.equal(addressAction(searchUrl('delete my account')), null, 'a search for words opens results');
  assert.equal(addressAction('not a url'), null);
  // One rule for both: the app asks exactly when the extension would.
  for (const url of ['https://a.example/cart.php?product=42', 'https://a.example/act/delete?id=7', 'https://a.example/?token=abc', 'https://a.example/item/42', 'https://a.example/search?q=delete']) {
    assert.equal(!!addressAction(url), !!classifyAddress(url), url);
  }
});

test('which address: links, "this" from resolveThis, searches, sites; nothing to pull up', () => {
  const links = [
    { url: 'https://example.com/one', title: 'One' },
    { url: 'https://example.com/two', title: 'Two' },
  ];
  assert.deepEqual(planChromeOpen({ kind: 'link', ordinal: 2 }, { links }), { url: 'https://example.com/two', kind: 'page', title: 'Two' });
  assert.deepEqual(planChromeOpen({ kind: 'link', ordinal: -1 }, { links }), { url: 'https://example.com/two', kind: 'page', title: 'Two' });
  assert.deepEqual(planChromeOpen({ kind: 'link', ordinal: 3 }, { links }), { error: 'no-link', say: 'That reply has 2 links.' });
  assert.equal(planChromeOpen({ kind: 'link', ordinal: 1 }, { links: [] }).error, 'no-link');
  const it = (thisTarget, kind = 'this') => planChromeOpen({ kind }, { thisTarget });
  assert.deepEqual(it({ kind: 'link', words: 'Kia EV9 review', url: 'https://example.com/ev9' }), { url: 'https://example.com/ev9', kind: 'page', title: 'Kia EV9 review' });
  assert.deepEqual(it({ kind: 'look', words: 'USB-C charger' }), { url: searchUrl('USB-C charger'), kind: 'search', words: 'USB-C charger' });
  assert.deepEqual(it({ kind: 'live', words: 'a red mug' }).words, 'a red mug');
  assert.deepEqual(it({ kind: 'hologram', words: 'Laptop battery' }).kind, 'search');
  assert.deepEqual(it({ kind: 'question', words: 'best heat pipes' }).words, 'best heat pipes');
  assert.deepEqual(it({ kind: 'reply', words: '', urls: ['https://example.com/a'] }), { url: 'https://example.com/a', kind: 'page' });
  assert.deepEqual(it({ kind: 'reply', words: '', urls: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'] }), { url: 'https://example.com/a', kind: 'page', note: 'That reply has 3 links; I opened the first.' });
  assert.deepEqual(it({ kind: 'none', words: '' }), { error: 'nothing', say: 'There’s nothing to pull up yet.' });
  assert.deepEqual(it(null), { error: 'nothing', say: 'There’s nothing to pull up yet.' });
  // "Google it" with a link on screen: its words, not the page.
  assert.equal(it({ kind: 'link', words: 'Kia EV9 review', url: 'https://example.com/ev9' }, 'this-search').kind, 'search');
  // A bad address from a reply never opens.
  assert.equal(it({ kind: 'link', words: 'x', url: 'javascript:alert(1)' }).error, 'bad-url');
  assert.equal(it({ kind: 'reply', urls: ['https://u:p@example.com/'] }).error, 'bad-url');
  assert.deepEqual(planChromeOpen({ kind: 'search', query: 'heat pipes' }), { url: searchUrl('heat pipes'), kind: 'search', words: 'heat pipes' });
  assert.deepEqual(planChromeOpen({ kind: 'site', url: 'https://www.youtube.com/', name: 'YouTube' }), { url: 'https://www.youtube.com/', kind: 'site', title: 'YouTube' });
});

test('what Jarvis says', () => {
  assert.equal(chromeLine({ status: 'opened', via: 'tab', kind: 'page' }), 'It’s open in Chrome.');
  assert.equal(chromeLine({ status: 'opened', via: 'tab', kind: 'search', words: 'USB-C chargers' }), 'Searching Google for USB-C chargers.');
  assert.equal(chromeLine({ status: 'opened', via: 'window', kind: 'page' }), 'It’s open beside me.');
  assert.equal(chromeLine({ status: 'opened', via: 'jarvis', beside: true }), 'It’s open in the Jarvis window, beside me.');
  assert.equal(chromeLine({ status: 'opened', via: 'jarvis' }), 'It’s open in the Jarvis window.');
  // The link down: the line says where the page went, and never "Jarvis for Chrome" aloud (lead's fix).
  assert.equal(chromeLine({ status: 'opened', via: 'tab', kind: 'page', fellBack: true }), 'I can’t reach the Jarvis window, so it’s in a normal tab.');
  assert.equal(chromeLine({ status: 'opened', via: 'window', kind: 'page', fellBack: true }), 'I can’t reach the Jarvis window, so I opened it beside me.', 'placed beside Jarvis (Optics, a tour or the live view on screen)');
  assert.equal(chromeLine({ status: 'opened', via: 'tab', kind: 'search', words: 'heat pipes', fellBack: true }), 'I can’t reach the Jarvis window, so I’m searching Google for heat pipes in a normal tab.');
  assert.equal(chromeLine({ status: 'opened', via: 'window', kind: 'search', words: 'heat pipes', fellBack: true }), 'I can’t reach the Jarvis window, so I’m searching Google for heat pipes beside me.');
  assert.equal(chromeLine({ status: 'opened', via: 'tab', kind: 'page', note: 'That reply has 3 links; I opened the first.' }), 'It’s open in Chrome. That reply has 3 links; I opened the first.');
  assert.equal(chromeLine({ status: 'needs_click', via: 'tab', does: 'adds to a cart' }), 'That address looks like it adds to a cart, so it opens only when you click Open.');
  assert.equal(chromeLine({ status: 'needs_click', via: 'jarvis' }), 'That address looks like it does something, so it waits for your click in the Jarvis window.');
  assert.equal(chromeLine({ status: 'needs_click', via: 'tab', does: 'adds to a cart', fellBack: true }), 'I can’t reach the Jarvis window. That address looks like it adds to a cart, so it opens only when you click Open.', 'the link down: said once, though nothing opened yet');
  // Every line is spoken in Voice Mode: none says "Jarvis for Chrome".
  for (const o of [
    { status: 'opened', via: 'jarvis' },
    { status: 'opened', via: 'jarvis', beside: true },
    { status: 'opened', via: 'tab', kind: 'page' },
    { status: 'opened', via: 'window', kind: 'page' },
    { status: 'opened', via: 'tab', kind: 'page', fellBack: true },
    { status: 'opened', via: 'window', kind: 'page', fellBack: true },
    { status: 'opened', via: 'tab', kind: 'search', words: 'x', fellBack: true },
    { status: 'opened', via: 'window', kind: 'search', words: 'x', fellBack: true },
    { status: 'needs_click', via: 'jarvis' },
    { status: 'needs_click', via: 'tab', does: 'adds to a cart', fellBack: true },
    { status: 'needs_tap' },
    { status: 'needs_tap', hidden: true },
    { status: 'closed', count: 1 },
    { status: 'error', why: 'the Chrome Web Store is off limits' },
  ]) {
    assert.doesNotMatch(chromeLine(o), /Jarvis for Chrome/, JSON.stringify(o));
  }
  assert.equal(chromeLine({ status: 'needs_tap' }), 'Tap Open in Chrome, and it’ll open.');
  assert.equal(chromeLine({ status: 'needs_tap', hidden: true }), 'I couldn’t open it: allow pop-ups for Jarvis once.');
  assert.equal(chromeLine({ status: 'nothing', say: 'There’s nothing to pull up yet.' }), 'There’s nothing to pull up yet.');
  assert.equal(chromeLine({ status: 'error', why: 'files on this computer are off limits' }), 'I can’t open that address: files on this computer are off limits.');
  assert.equal(chromeLine({ status: 'closed', count: 1 }), 'Closed the tab.');
  assert.equal(chromeLine({ status: 'closed', count: 0 }), 'I can only close a tab I opened.');
});
