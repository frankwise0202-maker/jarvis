// src/ui/commands/chrome.js (v8.1, chrome-relay): the link's own words. "Is Jarvis for Chrome linked?" says the
// link's state; "link Jarvis for Chrome" opens Settings → Jarvis for Chrome when typed and says the steps when
// spoken; both free; nothing about Chrome's pages or general questions about Chrome; not in the demo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { matchChromeLinkCommand, chromeLinkLine, register, LINK_STEPS_SAID } from '../../src/ui/commands/chrome.js';

test('the link\'s words: its state and setting it up; free; nothing else about Chrome', () => {
  const status = { do: 'chrome-link-status', free: true, undo: true };
  const setup = { do: 'chrome-link-setup', free: true, undo: true };
  for (const words of ['is Jarvis for Chrome linked?', 'Hey Jarvis, is Chrome linked', 'Is Jarvis for Chrome online?', 'is the Chrome link working', 'are you still connected to Jarvis for Chrome?', 'Jarvis for Chrome status', 'what is the status of the Chrome link', 'is the Chrome extension set up?', 'Jarvis, is Jarvis for Chrome still connected, please']) {
    assert.deepEqual(matchChromeLinkCommand(words), status, words);
  }
  for (const words of ['link Jarvis for Chrome', 'please set up Jarvis for Chrome', 'connect Chrome to Jarvis', 'Jarvis, can you link Jarvis and Chrome for me?', 'how do I link Jarvis for Chrome', 'pair the Chrome extension', 'hook up Jarvis for Chrome']) {
    assert.deepEqual(matchChromeLinkCommand(words), setup, words);
  }
  for (const words of [
    'is Chrome better than Safari?', 'is Chrome slow on a Mac', 'how do I link two Google accounts', 'what does the Grammarly Chrome extension do',
    'are you connected to the internet?', 'is the link in your answer safe', 'set up a new Chrome profile for my kids', 'how do I connect my printer to Chrome',
    'pull this up in Chrome', 'open YouTube in Chrome', 'what are you doing in Chrome', 'chrome status', 'is chrome done', 'stop Chrome', 'unlink Jarvis for Chrome',
    'open Jarvis for Chrome settings', 'find a 4K monitor under $300 and add it to the cart in Chrome', '', 'link '.repeat(40),
  ]) {
    assert.equal(matchChromeLinkCommand(words), null, words.slice(0, 60));
  }
});

test('what Jarvis says about the link', () => {
  assert.equal(chromeLinkLine({ linked: true, online: true }), 'Jarvis for Chrome is linked and online.');
  assert.match(chromeLinkLine({ linked: true, online: false }), /linked, but I can’t reach it\. Open the Jarvis window/);
  assert.match(chromeLinkLine({ linked: false, online: false }), /isn’t linked\. Say “link Jarvis for Chrome”/);
  assert.match(chromeLinkLine(null), /isn’t linked/);
  assert.match(chromeLinkLine({ linked: true, online: true }, { phone: true }), /on your Mac/);
});

test('REDTEAM-VOICE-15: said aloud, the link\'s lines never name "Jarvis for Chrome" (his own name sets off his barge-in)', () => {
  const states = [null, { linked: false, online: false }, { linked: true, online: true }, { linked: true, online: false }];
  for (const st of states) {
    for (const phone of [false, true]) assert.doesNotMatch(chromeLinkLine(st, { phone, spoken: true }), /jarvis for chrome/i, JSON.stringify({ st, phone }));
  }
  assert.doesNotMatch(LINK_STEPS_SAID, /jarvis for chrome/i);
  // What it tells the owner to say to set it up is a sentence the link's words take.
  const say = /Say “([^”]+)”/.exec(chromeLinkLine(null, { spoken: true }))[1];
  assert.equal(matchChromeLinkCommand(say).do, 'chrome-link-setup', say);
  // Shown, the name stays (the Settings section is called that).
  assert.match(chromeLinkLine({ linked: true, online: true }), /^Jarvis for Chrome is linked/);
  const said = [];
  const r = fakeRouter();
  register(r, { chromeLink: { state: () => ({ linked: true, online: true }) }, openSettings: () => {}, phone: false, demo: false });
  for (const words of ['is Jarvis for Chrome linked', 'link Jarvis for Chrome']) said.push(r.entries[0].run(r.entries[0].match(words), { surface: 'voice' }).say);
  for (const line of said) assert.doesNotMatch(line, /jarvis for chrome/i, line);
});

function fakeRouter() {
  const entries = [];
  return { entries, register: (e) => entries.push(e) && (() => {}) };
}

test('register: typed, "link Jarvis for Chrome" opens Settings at Jarvis for Chrome; said, the steps; the state said either way', () => {
  const opened = [];
  let state = { linked: false, online: false, voiceApprovals: false, task: null };
  const r = fakeRouter();
  register(r, { chromeLink: { state: () => state }, openSettings: (o) => opened.push(o), phone: false, demo: false });
  const [entry] = r.entries;
  assert.equal(entry.id, 'chrome-link');
  assert.equal(entry.layer, 'app');
  assert.deepEqual(entry.surfaces, ['voice', 'chat']);
  const setup = entry.match('link Jarvis for Chrome');
  const typed = entry.run(setup, { surface: 'chat', via: 'typed' });
  assert.deepEqual(opened, [{ section: 'chrome' }]);
  assert.match(typed.say, /in Settings: press Link, then Copy link code/);
  const said = entry.run(setup, { surface: 'voice', via: 'voice' });
  assert.equal(said.say, LINK_STEPS_SAID);
  assert.equal(opened.length, 1, 'no sheet over Voice Mode');
  state = { ...state, linked: true, online: true };
  // (Said aloud: "Chrome", never "Jarvis for Chrome": REDTEAM-VOICE-15.)
  assert.equal(entry.run(setup, { surface: 'voice' }).say, 'Chrome is already linked and online.');
  assert.equal(entry.run(entry.match('is Chrome linked?'), { surface: 'voice' }).say, 'Chrome is linked and online.');
  assert.equal(entry.run(entry.match('is Chrome linked?'), { surface: 'chat' }).say, 'Jarvis for Chrome is linked and online.');
  state = { ...state, online: false };
  assert.match(entry.run(entry.match('is Chrome linked?'), { surface: 'chat' }).say, /can’t reach it/);
});

test('register: an iPhone says it is the Mac\'s; without a link it says how; the demo has none of it', () => {
  const r = fakeRouter();
  register(r, { chromeLink: null, openSettings: () => {}, phone: true, demo: false });
  const [entry] = r.entries;
  assert.match(entry.run(entry.match('is Jarvis for Chrome linked'), { surface: 'voice' }).say, /on your Mac/);
  assert.match(entry.run(entry.match('link Jarvis for Chrome'), { surface: 'chat' }).say, /on your Mac/);
  const r2 = fakeRouter();
  register(r2, { chromeLink: null, phone: false, demo: false });
  assert.match(r2.entries[0].run(r2.entries[0].match('is Chrome linked'), { surface: 'voice' }).say, /isn’t linked/);
  const demo = fakeRouter();
  register(demo, { chromeLink: null, phone: false, demo: true });
  assert.equal(demo.entries[0].match('is Chrome linked'), null);
});
