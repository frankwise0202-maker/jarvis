// Jarvis for Chrome by voice, the words (v8.1, G4 app side; src/lib/chrome-task-words.js): which of
// the owner's sentences become a Chrome task, the task's text, the Chrome context and its expiry, and
// the lines around a task. Run in plain Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHROME_CONTEXT_MS,
  TASK_CHECK_HIDDEN_MS,
  TASK_CHECK_MS,
  chromeTaskText,
  dollarsSaid,
  inChromeContext,
  matchChromeStatus,
  matchChromeStop,
  matchChromeTask,
  matchClickAround,
  matchTaskAnswer,
  isTaskAnswerCancel,
  namesJarvisThing,
  sayable,
  taskCheckLine,
  taskCheckMs,
  taskDoneLine,
  taskRefusal,
  taskStatusLine,
} from '../../src/lib/chrome-task-words.js';

const NOW = 1_800_000_000_000;
const none = { now: NOW, chrome: { linked: true, online: true, task: null, contextUntil: 0 } };
const ctx = { now: NOW, chrome: { linked: true, online: true, task: null, contextUntil: NOW + 60000 } };
const afterTask = { now: NOW, chrome: { linked: true, online: true, task: { id: 't1', status: 'done', text: 'find a 4K monitor' }, contextUntil: NOW + 60000 } };
const running = { now: NOW, chrome: { linked: true, online: true, task: { id: 't1', status: 'running' }, contextUntil: 0 } };
// The newest reply has links (the router's state.reply.links): "open the second link" is then G1's (lead decision D1).
const LINKS = { reply: { links: [{ url: 'https://example.com/monitors', title: 'Monitors' }, { url: 'https://example.org/review', title: 'A review' }] } };
const withLinks = (st) => ({ ...st, ...LINKS });
const taskText = (s, st) => {
  const r = matchChromeTask(s, st);
  return r ? r.text : null;
};

// The critique's probe (probes/critique/p1-chrome-context.mjs and p1-out.txt): the draft's Chrome
// context rule took these. Under the final words none of them is a task, in a Chrome context or not.
// (Two laptop brand names are swapped for generic words, as the brief asks of fixtures.)
const PROBE_COMMANDS = [
  'open the camera',
  'open the voice settings',
  'open the library',
  'open the home base',
  'open the first link',
  'open the second link in Chrome',
  'go to amazon.com',
  'open the laptop support page in Chrome',
];
const PROBE_SENTENCES = [
  'compare the 14-inch laptop and the MacBook Air',
  'open the pod bay doors',
  'go to bed',
  'go to the store',
  'open the hologram of the battery',
  'open the window it is hot',
  'open the blinds',
  'open the door',
  'open the fridge',
  'open the camera app on my phone',
  'open the settings app on my iPhone',
  'go to amazon and buy a charger',
];
// The draft's own commands said within 2 minutes of "pull this up in Chrome" (the probe's last list).
const DRAFT_NOT_TASKS = [
  'open the library',
  'open the camera',
  'open the home base',
  'go to the battery',
  'go to standby',
  'open the second link',
  'compare them',
  'open the hologram window',
  'go to my other screen',
  'click around for me',
  'hey Jarvis open the camera',
];
const DRAFT_TASKS = ['pick the cheaper one', 'sort by price', 'scroll down'];

test('the critique probe: its 8 free commands and 12 ordinary sentences never become tasks, in a Chrome context or not', () => {
  // As in the probe, the newest reply has the links its "open the first link" opens.
  for (const s of [...PROBE_COMMANDS, ...PROBE_SENTENCES]) {
    for (const [name, st] of [['none', none], ['context', ctx], ['after a task', afterTask], ['running', running]]) {
      assert.equal(matchChromeTask(s, withLinks(st)), null, `${name}: ${s}`);
    }
  }
  for (const s of PROBE_SENTENCES) {
    for (const [name, st] of [['none', none], ['context', ctx], ['after a task', afterTask], ['running', running]]) {
      assert.equal(matchChromeTask(s, st), null, `${name}, no reply links: ${s}`);
    }
  }
});

test('the probe\'s draft commands in a Chrome context: Jarvis\'s own stay his; only page-bound words go to Chrome', () => {
  // (After "pull this up in Chrome" opened one of the newest reply's links: the reply has links.)
  for (const s of DRAFT_NOT_TASKS) assert.equal(matchChromeTask(s, withLinks(ctx)), null, s);
  for (const s of DRAFT_TASKS) {
    assert.ok(matchChromeTask(s, ctx), `in context: ${s}`);
    assert.equal(matchChromeTask(s, none), null, `no context: ${s}`);
  }
  assert.ok(matchClickAround('click around for me'), '"click around for me" asks what to do instead');
});

test('any time: "in Chrome, …", "… in Chrome", "use Jarvis for Chrome to …", "have Chrome …"; the task text is the owner\'s words without the carrier and fillers', () => {
  const rows = [
    ['find a 4K monitor under $300 and add it to the cart in Chrome', 'find a 4K monitor under $300 and add it to the cart'],
    ['Jarvis, please find a 4K monitor under $300 and add it to the cart in Chrome.', 'find a 4K monitor under $300 and add it to the cart'],
    ['Hey Jarvis, can you find a 4K monitor under $300 and add it to the cart in Google Chrome?', 'find a 4K monitor under $300 and add it to the cart'],
    ['In Chrome, add the cheapest one to the cart please', 'add the cheapest one to the cart'],
    ['in chrome compare the two cheapest monitors', 'compare the two cheapest monitors'],
    ['Use Jarvis for Chrome to compare the two cheapest monitors', 'compare the two cheapest monitors'],
    ['Have Chrome find the return policy for me', 'find the return policy'],
    ['Have Jarvis for Chrome sign me up for the newsletter', 'sign me up for the newsletter'],
    ['tell Chrome to read me the reviews', 'read me the reviews'],
    ['check the price of the 27-inch one on Chrome', 'check the price of the 27-inch one'],
    ['Find the cheapest USB-C charger and tell me the price in Chrome', 'find the cheapest USB-C charger and tell me the price'],
    ['Best Buy: add a 4K monitor under $300 to the cart in Chrome', 'Best Buy: add a 4K monitor under $300 to the cart'],
  ];
  for (const [said, words] of rows) {
    const r = matchChromeTask(said, none);
    assert.ok(r, said);
    assert.equal(r.text, words, said);
    assert.equal(r.via, 'carrier');
    assert.equal(r.chat, 'new');
    assert.equal(r.do, 'chrome-task');
    // Paid and not undoable: never taken from another reading, and always checked first.
    assert.deepEqual([r.free, r.undo, r.check], [false, false, true]);
    assert.equal(chromeTaskText(said), words, `chromeTaskText: ${said}`);
  }
  // A mid-sentence "in Chrome" is not an anchor (carriers are anchored by their prefix or suffix).
  assert.equal(matchChromeTask('find a monitor in Chrome under $300 for my desk', none), null);
  // One word is not a task.
  assert.equal(matchChromeTask('in Chrome, go', none), null);
});

test('opening a page is G1\'s (free, no task): "pull this up", links, searches, sites, a new tab, unless more is asked', () => {
  for (const s of [
    'pull this up in Chrome',
    'pull this up in Google Chrome',
    'open this in Chrome',
    'open that in a new tab',
    'put it in another tab',
    'open the second link in Chrome',
    'open link 3',
    'search for usb c chargers in Chrome',
    'look up the return policy in Chrome',
    'look it up in Chrome',
    'search it up in Google Chrome',
    'look them up in Chrome',
    'open this one in Chrome',
    'send it to Chrome',
    'google it',
    'google usb c chargers',
    'search Google for the laptop battery',
    'open youtube in Chrome',
    'go to amazon.com',
    'open bestbuy.com',
  ]) {
    assert.equal(matchChromeTask(s, withLinks(none)), null, `none: ${s}`);
    assert.equal(matchChromeTask(s, withLinks(ctx)), null, `context: ${s}`);
  }
  // "Open the Nth link" is the reply's link only when the newest reply has links (D1). With none, it is a
  // link on the page: a task in a Chrome context or with "in Chrome", else Claude's (null here).
  for (const s of ['open the second link', 'open the first link', 'open link 3', 'follow the link']) {
    assert.equal(taskText(s, ctx), s, `context, no reply links: ${s}`);
    assert.equal(matchChromeTask(s, ctx).via, 'context');
    assert.equal(matchChromeTask(s, none), null, `no context: ${s}`);
    assert.equal(matchChromeTask(s, withLinks(ctx)), null, `the reply's link: ${s}`);
  }
  assert.equal(taskText('open the second link in Chrome', none), 'open the second link', 'no reply links: "in Chrome" makes it a task');
  for (const s of ['pull this up in Chrome', 'open youtube in Chrome', 'google usb c chargers', 'open that in a new tab']) {
    assert.equal(matchChromeTask(s, ctx), null, `G1's with or without reply links: ${s}`);
  }
  // With an action or a thing on the page, it is a task; so is "find …" (not one of G1's searches).
  assert.equal(taskText('find a 4K monitor and add it to the cart in Chrome', none), 'find a 4K monitor and add it to the cart');
  assert.equal(taskText('find a 4K monitor in Chrome', none), 'find a 4K monitor');
  assert.equal(taskText('open the second result in Chrome', none), 'open the second result');
  assert.equal(taskText('open the cheapest one in Chrome', none), 'open the cheapest one');
  assert.equal(taskText('in Chrome, open youtube', none), 'open youtube', 'a leading "in Chrome" is a task (G1 takes only its own shapes)');
});

test('in a Chrome context only: click, scroll, add … to the cart, on this page or site, sort by, filter by, search this site for, go back a page', () => {
  const rows = [
    ['add the cheapest one to the cart', 'add the cheapest one to the cart'],
    ['add it to my cart', 'add it to my cart'],
    ['click the first result', 'click the first result'],
    ['click on Reviews', 'click on Reviews'],
    ['scroll down', 'scroll down'],
    ['scroll to the reviews', 'scroll to the reviews'],
    ['sort by price', 'sort by price'],
    ['sort them by rating', 'sort them by rating'],
    ['filter by brand', 'filter by brand'],
    ['search this site for standing desks', 'search this site for standing desks'],
    ['go back a page', 'go back a page'],
    ['go to the next page', 'go to the next page'],
    ['find the return policy on this page', 'find the return policy on this page'],
    ['what is the return policy on this site', 'what is the return policy on this site'],
    ['pick the cheaper one', 'pick the cheaper one'],
    ['open the first result', 'open the first result'],
    ['compare the two cheapest ones', 'compare the two cheapest ones'],
    ['tell me about the second one', 'tell me about the second one'],
    ['add the cheapest camera to the cart', 'add the cheapest camera to the cart'],
    ['add the screen protector to the cart', 'add the screen protector to the cart'],
    ['click order history', 'click order history'],
  ];
  for (const [said, words] of rows) {
    const r = matchChromeTask(said, ctx);
    assert.ok(r, `context: ${said}`);
    assert.equal(r.text, words, said);
    assert.equal(r.via, 'context');
    assert.equal(matchChromeTask(said, none), null, `no context: ${said}`);
  }
  // "Open …", "go to …", "compare …", "pick …" need a thing on the page.
  for (const s of ['compare them', 'pick one', 'open the menu', 'go to the store', 'go to checkout', 'compare prices']) assert.equal(matchChromeTask(s, ctx), null, s);
  // "click around" is its own command.
  assert.equal(matchChromeTask('click around', ctx), null);
});

test('never a task: Jarvis\'s own things, questions without page words (R4), a hologram\'s parts (R10)', () => {
  for (const s of [
    'open the camera in Chrome',
    'in Chrome, open my settings',
    'scroll down in the chat',
    'click the camera',
    'sort my history by date',
    'add the hologram to my blueprints',
    'filter the library by date',
    'scroll the live view',
    'show the tour on my other screen in Chrome',
    'play the music in Chrome',
    'go to standby in Chrome',
    'click the camera window',
  ]) {
    assert.equal(matchChromeTask(s, ctx), null, s);
  }
  for (const s of ['what is the cheapest one', 'how much is the second one', 'is it in stock', 'how do I open a new window in Chrome', 'can I add it to the cart', 'which one is better in Chrome']) {
    assert.equal(matchChromeTask(s, ctx), null, `R4: ${s}`);
  }
  assert.ok(matchChromeTask('how much is the second one on this page', ctx), 'a question with page words is the page\'s');
  // "Can you …" is polite, not a question.
  assert.equal(taskText('can you add it to the cart', ctx), 'add it to the cart');
  // R10: with a hologram on top, its parts' names are its own.
  const holo = { ...ctx, hologram: { open: true, parts: ['Battery', 'Keyboard', { name: 'Trackpad', aliases: ['touchpad'] }] } };
  for (const s of ['click the battery', 'scroll to the keyboard', 'click the touchpad']) assert.equal(matchChromeTask(s, holo), null, `R10: ${s}`);
  assert.ok(matchChromeTask('click the battery', ctx), 'no hologram: the page\'s battery');
  assert.ok(matchChromeTask('click the first result', holo), 'other words still go to Chrome');
});

test('Jarvis\'s things are named as his: "the camera", "my other screen", "open settings"; a page\'s are not', () => {
  for (const s of ['open the camera', 'my other screen', 'the voice settings', 'open settings', 'the camera window', 'in chat', 'close the window please', 'optics', 'the live view', 'standby', 'the home base', 'full screen', 'new chat', 'settings please']) {
    assert.equal(namesJarvisThing(s), true, s);
  }
  for (const s of ['the cheapest camera', 'a 4K screen', 'the screen protector', 'order history', 'my order history', 'a camera bag', 'chat with the seller', 'the 27-inch display', 'window blinds', 'a webcam under $50']) {
    assert.equal(namesJarvisThing(s), false, s);
  }
});

test('the chat: a context sentence after a task, or a follow-up word, carries on the same chat', () => {
  const r = matchChromeTask('Now add the second one too', afterTask);
  assert.equal(r.text, 'add the second one too');
  assert.equal(r.chat, 'same');
  assert.equal(matchChromeTask('add the cheapest one to the cart', afterTask).chat, 'same');
  assert.equal(matchChromeTask('add the cheapest one to the cart', ctx).chat, 'new', 'after "pull this up" only: no chat to carry on');
  assert.equal(matchChromeTask('now add a USB-C hub to the cart too in Chrome', afterTask).chat, 'same', 'a follow-up word with the carrier');
  assert.equal(matchChromeTask('now find a USB-C hub too in Chrome', afterTask).chat, 'same');
  assert.equal(matchChromeTask('find a USB-C hub and add it to the cart in Chrome', afterTask).chat, 'new', 'a fresh request');
  const late = { ...afterTask, now: NOW + 120001 };
  assert.equal(matchChromeTask('now add the second one too in Chrome', late).chat, 'new', 'the context is over');
});

test('the Chrome context lasts 2 minutes (and while a task runs), then page words are Claude\'s again', () => {
  assert.equal(CHROME_CONTEXT_MS, 120000);
  const at = (ms) => ({ now: NOW + ms, chrome: { linked: true, online: true, task: null, contextUntil: NOW + CHROME_CONTEXT_MS } });
  assert.equal(inChromeContext(at(0)), true);
  assert.equal(inChromeContext(at(119999)), true);
  assert.equal(inChromeContext(at(120000)), false);
  assert.ok(matchChromeTask('add the cheapest one to the cart', at(119000)));
  assert.equal(matchChromeTask('add the cheapest one to the cart', at(121000)), null);
  assert.equal(matchChromeTask('scroll down', at(121000)), null);
  // A running (or waiting) task keeps the context, whatever the clock says.
  for (const status of ['running', 'waiting', 'paused', 'starting']) assert.equal(inChromeContext({ now: NOW, chrome: { task: { id: 't', status }, contextUntil: 0 } }), true, status);
  for (const status of ['done', 'stopped', 'failed']) assert.equal(inChromeContext({ now: NOW, chrome: { task: { id: 't', status }, contextUntil: 0 } }), false, status);
  assert.equal(inChromeContext({}), false);
  assert.equal(matchChromeTask('scroll down', {}), null, 'no state: no context');
});

test('carriers have no word cap (anchored by their prefix or suffix), up to a long monologue', () => {
  const long = `in Chrome, ${'find a monitor with a good stand and a matte screen and '.repeat(3)}add it to the cart`;
  assert.ok(matchChromeTask(long, none), 'about 40 words');
  const monologue = `in Chrome, ${'and then we went to the park and '.repeat(10)}that was it`;
  assert.equal(matchChromeTask(monologue, none), null, 'over 60 words');
});

test('"click around for me", "stop Chrome", "what are you doing in Chrome?"', () => {
  for (const s of ['click around for me', 'Click around for me.', 'Jarvis, click around for me in Chrome', 'click around in Chrome', 'go click around']) assert.deepEqual(matchClickAround(s), { do: 'chrome-ask', free: true, undo: true }, s);
  for (const s of ['click around the menu', 'click the button around the corner', 'clicking sounds']) assert.equal(matchClickAround(s), null, s);
  for (const s of ['stop Chrome', 'Stop Chrome!', 'cancel the Chrome task', 'stop the task in Chrome', 'Jarvis, stop Chrome', 'Chrome, stop', 'stop what you\'re doing in Chrome', 'stop it in Chrome']) {
    assert.equal((matchChromeStop(s, none) || {}).named, true, s);
  }
  assert.equal(matchChromeStop('stop', none), null, 'nothing runs: a bare stop is not Chrome\'s');
  assert.deepEqual(matchChromeStop('stop', running), { do: 'chrome-stop', named: false, free: true, undo: false });
  assert.equal(matchChromeStop('stop the music', running), null);
  assert.equal(matchChromeStop('stop the tour', running), null);
  for (const s of ['what are you doing in Chrome?', "What's Chrome doing?", 'how is the Chrome task going', 'is Chrome done yet', 'what has Chrome done so far']) assert.deepEqual(matchChromeStatus(s), { do: 'chrome-status', free: true, undo: true }, s);
  for (const s of ['what are you doing', 'what is Chrome', 'how is Chrome better than Safari']) assert.equal(matchChromeStatus(s), null, s);
  // None of them is a task.
  for (const s of ['what are you doing in Chrome', 'click around for me in Chrome']) assert.equal(matchChromeTask(s, ctx), null, s);
});

test('the answer to "What should I do in Chrome?" is the task, unless it is a no or one of Jarvis\'s things', () => {
  assert.deepEqual(matchTaskAnswer('find me a 4K monitor under 300 dollars'), { text: 'find me a 4K monitor under 300 dollars' });
  assert.deepEqual(matchTaskAnswer('In Chrome, compare the two cheapest ones.'), { text: 'compare the two cheapest ones' });
  for (const s of ['never mind', 'nothing', 'cancel', 'no thanks']) {
    assert.equal(matchTaskAnswer(s), null, s);
    assert.equal(isTaskAnswerCancel(s), true, s);
  }
  for (const s of ['open the camera', 'what time is it', 'go']) assert.equal(matchTaskAnswer(s), null, s);
  assert.equal(isTaskAnswerCancel('find a monitor'), false);
});

test('the check is shown and spoken with the price: 2 s, or 5 s while Jarvis is hidden', () => {
  assert.equal(taskCheckLine({ text: 'find a 4K monitor under $300 and add it to the cart', limitUsd: 1 }), 'Chrome, up to a dollar: find a 4K monitor under $300 and add it to the cart. Say cancel to stop.');
  assert.equal(taskCheckLine({ text: 'what is the return policy on this page?', limitUsd: 2 }), 'Chrome, up to two dollars: what is the return policy on this page? Say cancel to stop.');
  assert.equal(taskCheckLine({ text: 'scroll down' }), 'Chrome, up to a dollar: scroll down. Say cancel to stop.', 'the extension\'s default budget');
  assert.deepEqual([taskCheckMs(), taskCheckMs({ hidden: false }), taskCheckMs({ hidden: true })], [2000, 2000, 5000]);
  assert.deepEqual([TASK_CHECK_MS, TASK_CHECK_HIDDEN_MS], [2000, 5000]);
  assert.deepEqual([dollarsSaid(1), dollarsSaid(2), dollarsSaid(0.5), dollarsSaid(1.5), dollarsSaid(25), dollarsSaid(0), dollarsSaid('x')], ['a dollar', 'two dollars', '50 cents', '$1.50', '$25', 'a dollar', 'a dollar']);
});

test('refusals are said plainly, and "Jarvis for Chrome" is never said', () => {
  const rows = {
    offline: 'I can’t reach Chrome. Open the Jarvis window and keep it open.',
    unlinked: 'Chrome isn’t linked yet. Link it in Settings.',
    off: 'Tasks from Jarvis are turned off in Chrome.',
    busy: 'Chrome is busy with another task. Stop it first?',
    cap: 'That’s today’s 30 tasks.',
  };
  for (const [reason, say] of Object.entries(rows)) {
    const r = taskRefusal(reason);
    assert.equal(r.say, say, reason);
    assert.doesNotMatch(r.say, /jarvis for chrome/i, reason);
  }
  assert.equal(taskRefusal('offline').show, 'I can’t reach Jarvis for Chrome. Open the Jarvis window and keep it open.', 'the brief\'s words on screen');
  assert.equal(taskRefusal('bad', 'the text was empty').say, 'Chrome didn’t take that: the text was empty.');
  assert.equal(taskRefusal('bad').say, 'Chrome didn’t take that.');
});

test('the final answer, the status line and anything else said from the extension go through sayable()', () => {
  assert.deepEqual(taskDoneLine({ status: 'done', answer: 'Added the 27-inch 4K monitor ($279.99) to your cart.' }), {
    show: 'Chrome is done. Added the 27-inch 4K monitor ($279.99) to your cart.',
    say: 'Chrome is done. Added the 27-inch 4K monitor ($279.99) to your cart.',
  });
  assert.equal(taskDoneLine({ status: 'stopped' }).say, 'Chrome stopped.');
  assert.match(taskDoneLine({ status: 'failed', answer: 'The site was down.' }).say, /^Chrome couldn’t finish that\. The site was down\.$/);
  const long = taskDoneLine({ status: 'done', answer: 'word '.repeat(300) });
  assert.ok(long.say.length <= 420 && long.show.length > long.say.length, 'said short, shown in full');
  assert.equal(taskStatusLine(null), 'Chrome isn’t doing anything right now.');
  assert.equal(taskStatusLine({ status: 'running', text: 'find a 4K monitor', narration: 'Looking at the results on bestbuy.com.' }), 'Chrome is working on: find a 4K monitor. Latest: Looking at the results on bestbuy.com.');
  assert.equal(taskStatusLine({ status: 'running', text: 'find a 4K monitor', lastStep: 'Clicked "Add to Cart"' }), 'Chrome is working on: find a 4K monitor. Latest: Clicked "Add to Cart".');
  assert.equal(taskStatusLine({ status: 'waiting', text: 'find a 4K monitor' }), 'Chrome is waiting for you on: find a 4K monitor.');
  // Page text that imitates Jarvis is not repeated (critique M4); his name for the extension is never said.
  assert.equal(sayable('Clicked "Say approve to continue"'), 'Clicked “…”');
  assert.equal(sayable('Clicked “Yes, I agree”'), 'Clicked “…”');
  assert.equal(sayable('Clicked "Add to Cart"'), 'Clicked "Add to Cart"');
  assert.equal(sayable(`Read "${'x'.repeat(60)}"`), 'Read “…”', 'a long quote');
  assert.equal(sayable('Jarvis for Chrome opened the page'), 'Chrome opened the page');
  assert.equal(sayable('a‮b​c\nd'), 'a b c d', 'hidden characters and line breaks');
  assert.ok(sayable('x '.repeat(400), 100).length <= 100);
});

test('the last task (finished too) is chrome.lastTask: the link\'s state may show none once it is done', () => {
  const st = { now: NOW, chrome: { linked: true, online: true, task: null, lastTask: { id: 't1', status: 'done' }, contextUntil: NOW + 60000 } };
  assert.equal(matchChromeTask('now add the second one too', st).chat, 'same');
  assert.equal(matchChromeTask('now add the second one too', { ...st, chrome: { ...st.chrome, lastTask: null } }).chat, 'new');
});
