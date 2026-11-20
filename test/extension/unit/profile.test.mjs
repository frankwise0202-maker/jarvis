// A Chrome profile of its own (the first-run gate): the API key can't be saved before the owner
// confirms that this Chrome profile is just for Jarvis, with no saved passwords or cards; the
// confirmation is kept in chrome.storage.local; no task starts without it (also with a key an
// older version saved); and the panel's steps and the README's Install section say the same.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeBrowser, fakeEncoder } from '../helpers/fake-chrome.mjs';
import { createClaudeMock, TEST_API_KEY } from '../mock/claude-mock.mjs';
import { Controller } from '../../../extension/src/background/controller.js';
import { createClient } from '../../../extension/src/background/api.js';
import { KEYS, PROFILE_REQUIRED, createStore, normalizeProfile } from '../../../extension/src/shared/storage.js';
import { PORT_NAME } from '../../../extension/src/shared/protocol.js';
import { PROFILE_CONFIRM, PROFILE_ELSEWHERE, PROFILE_LINE, PROFILE_STEPS, PROFILE_TITLE, PROFILE_WHY, parseRich, stepTerms } from '../../../extension/src/sidepanel/profile.js';

const README = new URL('../../../extension/README.md', import.meta.url);

test('the API key can’t be saved before the separate-profile confirmation', async () => {
  const fb = createFakeBrowser();
  const store = createStore(fb.chrome);
  assert.equal(await store.getProfile(), null, 'nothing confirmed on a fresh install');
  const res = await store.setApiKey(TEST_API_KEY);
  assert.deepEqual(res, { ok: false, needsProfile: true, error: PROFILE_REQUIRED });
  assert.match(res.error, /separate Chrome profile just for Jarvis/);
  assert.equal(await store.getApiKey(), null);
  assert.deepEqual(fb.chrome.storage.local.data, {}, 'nothing written');
  // A malformed key is refused for the profile first, not for its shape.
  assert.equal((await store.setApiKey('nope')).needsProfile, true);

  const confirmed = await store.confirmProfile(1_700_000_000_000);
  assert.deepEqual(confirmed, { separate: true, at: 1_700_000_000_000 });
  assert.deepEqual(await store.setApiKey(TEST_API_KEY), { ok: true, masked: 'sk-ant-…wxyz' });
  assert.equal(await store.getApiKey(), TEST_API_KEY);
  assert.equal((await store.setApiKey('nope')).needsProfile, undefined, 'after it, keys are only checked for their shape');
});

test('the confirmation is remembered in chrome.storage.local only, and outlives removing the key', async () => {
  const fb = createFakeBrowser();
  await createStore(fb.chrome).confirmProfile(42);
  assert.deepEqual(fb.chrome.storage.local.data[KEYS.profile], { separate: true, at: 42 });
  assert.equal(KEYS.profile, 'jarvis.profile');
  assert.deepEqual(fb.chrome.storage.sync.data, {}, 'never synced');
  assert.deepEqual(fb.chrome.storage.session.data, {});
  // A panel opened later (a new store on the same storage) sees it.
  const later = createStore(fb.chrome);
  assert.deepEqual(await later.getProfile(), { separate: true, at: 42 });
  await later.setApiKey(TEST_API_KEY);
  await later.clearApiKey(); // Settings → Remove
  assert.deepEqual(await later.getProfile(), { separate: true, at: 42 }, 'removing the key keeps the confirmation');
  assert.equal((await later.setApiKey(TEST_API_KEY)).ok, true, 'a new key can be saved straight away');
});

test('only a real confirmation counts', () => {
  for (const raw of [undefined, null, true, 'yes', 1, {}, { separate: 'yes' }, { separate: 1 }, { confirmed: true }, []]) assert.equal(normalizeProfile(raw), null, JSON.stringify(raw));
  assert.deepEqual(normalizeProfile({ separate: true, at: 5 }), { separate: true, at: 5 });
  assert.deepEqual(normalizeProfile({ separate: true }), { separate: true, at: 0 });
  assert.deepEqual(normalizeProfile({ separate: true, at: 'x' }), { separate: true, at: 0 });
});

test('no task starts before the confirmation, even with a key an older version saved', async () => {
  const fb = createFakeBrowser();
  const store = createStore(fb.chrome);
  await fb.chrome.storage.local.set({ [KEYS.apiKey]: TEST_API_KEY }); // saved before the profile screen existed
  const mock = createClaudeMock();
  mock.script([() => ({ answer: 'Hello.' })]);
  const controller = new Controller({ chrome: fb.chrome, store, pageSource: '/* agent */', createClient: ({ apiKey }) => createClient({ apiKey, baseURL: 'http://mock.local', fetch: mock.fetch }), encoder: fakeEncoder, platform: 'mac' });
  fb.onCdpEvent = (tabId, m, p, sid) => controller.driver.onCdpEvent(tabId, m, p, sid);
  fb.chrome.tabs.onCreated.addListener((t) => controller.driver.onTabCreated(t));
  fb.chrome.tabs.onRemoved.addListener((id) => controller.driver.onTabRemoved(id));
  fb.addTab({ url: 'https://shop.example/', page: { title: 'Shop', elements: [] } });
  const received = [];
  controller.connect({ name: PORT_NAME, postMessage: (m) => received.push(m), onDisconnect: { addListener() {} }, onMessage: { addListener() {} } });
  await controller.start({ text: 'Say hello', windowId: 1 });
  const task = controller.tasks.at(-1);
  assert.equal(task.status, 'error');
  assert.match(task.error, /side panel.*confirm that this Chrome profile is just for Jarvis/);
  assert.equal(mock.requests.length, 0, 'nothing sent to the API');
  assert.equal(controller.run, null, 'Jarvis isn’t working');
  assert.ok(received.some((m) => m.type === 'task' && m.task.status === 'error'), 'the panel is told');

  // After the owner ticks the box, the same key works.
  await store.confirmProfile();
  await controller.start({ text: 'Say hello', windowId: 1 });
  const end = Date.now() + 4000;
  while (controller.tasks.at(-1).status !== 'done' && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  assert.equal(controller.tasks.at(-1).status, 'done', controller.tasks.at(-1).error || '');
  assert.equal(mock.requests.length, 1);
});

test('the first-run screen: plain words, the box and six steps in order', () => {
  assert.equal(PROFILE_TITLE, 'Use Jarvis in its own Chrome profile');
  assert.equal(PROFILE_CONFIRM, 'This is a separate Chrome profile just for Jarvis, with no saved passwords or cards');
  assert.equal(PROFILE_LINE, 'For use in your Jarvis profile only');
  assert.match(PROFILE_WHY, /if a web page ever tricks Jarvis, your main accounts, email, passwords and cards are out of its reach/);
  assert.equal(PROFILE_STEPS.length, 6);
  const plain = PROFILE_STEPS.map((s) => parseRich(s).map((p) => p.text).join(''));
  // The order the owner does them in: make the profile, lock it down, add Jarvis there, sign in, come back.
  const order = [
    [0, /profile picture.*top right of Chrome.*Add \(or Add Chrome profile\)/],
    [1, /Continue without an account.*name it Jarvis.*pick a color.*Done.*new Chrome window opens in the Jarvis profile/],
    [2, /In that window, don’t turn on sync and don’t import anything/],
    [2, /Settings → Autofill and passwords, turn off saving passwords, payment methods and addresses/],
    [3, /chrome:\/\/extensions → Developer mode → Load unpacked → the unzipped jarvis-for-chrome folder/],
    [3, /Pin it, open the side panel and follow the setup/],
    [4, /In that window only, sign in to the sites you want Jarvis to use.*Never your email or your bank/],
    [5, /open the Jarvis window first: profile picture → Jarvis/],
  ];
  for (const [i, re] of order) assert.match(plain[i], re, `step ${i + 1}`);
  assert.match(PROFILE_ELSEWHERE, /usual profile.*remove Jarvis from this one/);
  for (const s of [...PROFILE_STEPS, PROFILE_ELSEWHERE]) assert.ok(!/\*\*|`/.test(parseRich(s).map((p) => p.text).join('')), `markup closed in: ${s}`);
});

test('step text: **Chrome’s words** and `addresses` are marked; nothing else', () => {
  assert.deepEqual(parseRich('Open `chrome://extensions` → **Developer mode**.'), [
    { text: 'Open ', kind: 'text' },
    { text: 'chrome://extensions', kind: 'code' },
    { text: ' → ', kind: 'text' },
    { text: 'Developer mode', kind: 'strong' },
    { text: '.', kind: 'text' },
  ]);
  assert.deepEqual(parseRich('plain'), [{ text: 'plain', kind: 'text' }]);
  assert.deepEqual(stepTerms(), ['profile picture', 'Add', 'Add Chrome profile', 'Continue without an account', 'Jarvis', 'Done', 'Settings', 'Autofill and passwords', 'chrome://extensions', 'Developer mode', 'Load unpacked', 'jarvis-for-chrome']);
});

test('the README’s Install section starts with the same profile steps', async () => {
  const md = await readFile(README, 'utf8');
  const flat = (text) => text.replace(/\s+/g, ' '); // markdown wraps lines anywhere
  const at = md.indexOf('\n## Install');
  assert.ok(at > 0, 'an Install section');
  const install = flat(md.slice(at, md.indexOf('\n## ', at + 5)));
  for (const term of stepTerms()) assert.ok(install.includes(term), `Install mentions ${term}`);
  for (const words of ['Continue without an account', "don't turn on sync and don't import anything", 'Autofill and passwords**, and turn off saving passwords, payment methods and addresses', 'In the Jarvis window only, sign in', 'Never your email or your bank', '**profile picture** → **Jarvis**']) assert.ok(install.includes(words), `Install: ${words}`);
  // The profile comes first: it is made before Jarvis is downloaded and loaded into it.
  const first = (s) => install.indexOf(s);
  assert.ok(first('Add Chrome profile') > 0 && first('Add Chrome profile') < first('jarvis-for-chrome.zip'), 'profile steps before the download');
  assert.ok(first('jarvis-for-chrome.zip') < first('Load unpacked'), 'then the extension');
  assert.ok(install.includes(PROFILE_CONFIRM), 'the box’s words, so the owner recognises them');
  assert.ok(install.includes(PROFILE_LINE), 'and the Settings line');
  assert.match(install, /### Why a separate profile/);
  assert.match(install, /If a web page ever tricks Jarvis, .*your main accounts, your email, your saved passwords and your cards are in your usual profile, out of its reach/);
  // The honest note opens Known limits.
  const limits = flat(md.slice(md.indexOf('### Known limits'), md.indexOf('\n- ', md.indexOf('### Known limits'))));
  assert.match(limits, /Five rounds of testers have attacked Jarvis for Chrome on purpose/);
  assert.match(limits, /That is why it lives in a Chrome profile of its own .* and asks before every step that changes anything/);
});
