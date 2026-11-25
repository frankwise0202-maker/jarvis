// Sync through the home base (v7.6, SPEC §24.7): an iPhone and a Mac, two browser contexts on one fake
// Core (core-fakes.mjs keeps the uploaded backups in t.coreSync, like the Core's sync module), see each
// other's conversations. The backup goes gzip-compressed with the device's name and never carries the
// API key; a conversation deleted on one device never comes back there and is never deleted on the
// other. The card's states: a Jarvis Core 1.0, too big, unreachable, off.

import { tid } from '../harness.mjs';
import { CORE_URL } from '../core-fakes.mjs';
import { MOCK_API_KEY } from '../../server.mjs';

const LINKED = { settings: { homeBaseUrl: CORE_URL } };
const NETWORK_NOISE = [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/, /Access-Control-Allow-Origin|CORS policy/];
const SHOTS = '/tmp/claude-0/-home-user-jarvis/aa519e1c-700d-5a0c-b92e-8ae78b238fc5/scratchpad/core-shots/app76';

async function shot(t, name, page = t.page) {
  const file = await t.screenshot(name, page);
  try {
    const { mkdir, copyFile } = await import('node:fs/promises');
    await mkdir(SHOTS, { recursive: true });
    await copyFile(file, `${SHOTS}/${t.scenario.name}-${name}.png`);
  } catch {
    /* only a copy */
  }
}

async function openSync(t, page) {
  await (await t.visible('settings-button', { page })).click();
  await t.visible('settings-sheet', { page });
  await page.evaluate(() => document.querySelector('#settings-homebase')?.scrollIntoView());
  const card = await t.visible('sync-settings', { page });
  await card.scrollIntoViewIfNeeded();
  return card;
}

async function closeSettings(t, page) {
  await (await t.visible('settings-close', { page })).click();
  await page.locator(tid('settings-sheet')).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

async function statusText(t, page) {
  return t.text(page.locator(tid('sync-status')));
}

/** Sync now, from the open card; waits for "Last synced". */
async function syncNow(t, page) {
  const lists = t.coreSync.lists;
  await page.locator(tid('sync-now')).click();
  await t.waitFor(async () => t.coreSync.lists > lists && (await page.locator(tid('sync-status')).getAttribute('data-tone')) === 'ok', {
    timeout: 20000,
    message: async () => `the sync to finish (status: "${await statusText(t, page)}")`,
  });
}

async function historyTitles(t, page) {
  const drawer = page.locator(tid('history-drawer'));
  if (!(await drawer.isVisible().catch(() => false))) {
    const btn = page.locator(tid('history-button'));
    if (await btn.isVisible().catch(() => false)) await btn.click();
    await drawer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  }
  return page.locator(tid('history-item')).allTextContents();
}

async function closeHistory(page) {
  // The phone's drawer is a sheet: Escape closes it (the desktop's rail stays).
  await page.keyboard.press('Escape').catch(() => {});
}

/** A new chat (the header's New chat, or Ctrl+K), so a question doesn't continue the open one. */
async function newChat(page) {
  const btn = page.locator(tid('header-new-chat'));
  if (await btn.isVisible().catch(() => false)) await btn.click();
  else await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
}

async function ask(t, page, text) {
  await newChat(page);
  const turn = await t.send(text, { page });
  await t.waitForTurn(turn, ['done']);
  await page.waitForTimeout(1200); // let the throttled save land
}

export default [
  {
    name: 'sync-devices',
    title: 'Sync through the home base: an iPhone and a Mac (two browser contexts, one fake Core) see each other’s conversations; each backup goes gzip with the device’s name and never the API key; a conversation deleted on the iPhone never comes back there and stays on the Mac',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { brain: {} },
    timeout: 300000,
    async run(t) {
      const phone = await t.newPage({ device: 'iphone13' });
      await t.goto('/', { page: phone });
      let phoneId = '';
      await t.step('the iPhone sends its backup a few seconds after it opens', async () => {
        await t.waitFor(() => t.coreSync.puts.length >= 1, { timeout: 20000, message: 'the first upload' });
        const put = t.coreSync.puts[0];
        phoneId = put.id;
        t.assert(/^jd-[0-9a-f]{24}$/.test(put.id), `a random device id (${put.id})`);
        t.assert(put.label === 'iPhone', `named after the device (${put.label})`);
        t.assert(put.encoding === 'gzip', `gzip-compressed (${put.encoding})`);
      });

      await t.step('a question on the iPhone, then Sync now', async () => {
        await ask(t, phone, 'What is the capital of France?');
        await openSync(t, phone);
        await syncNow(t, phone);
        const stored = t.coreSync.devices.get(phoneId).text;
        t.assert(/capital of France/.test(stored), 'the iPhone’s backup carries the conversation');
        t.assert(!stored.includes(MOCK_API_KEY) && !/sk-ant-/i.test(stored), 'the backup never carries the API key');
        t.assert(/Last synced/.test(await statusText(t, phone)), 'the card says when it last synced');
        await shot(t, '1-iphone-card', phone);
        await closeSettings(t, phone);
      });

      const mac = await t.newPage({ device: 'mac' });
      await t.goto('/', { page: mac });
      await t.step('the Mac brings in the iPhone’s conversation by itself', async () => {
        await t.waitFor(async () => (await historyTitles(t, mac)).some((x) => /capital of France/i.test(x)), { timeout: 25000, message: 'the iPhone’s conversation in the Mac’s History' });
        t.assert(t.coreSync.gets.includes(phoneId), 'the Mac pulled the iPhone’s backup');
        const macPut = t.coreSync.puts.find((p) => p.id !== phoneId);
        t.assert(macPut && macPut.label === 'Mac', `the Mac sent its own backup, named (${macPut && macPut.label})`);
        const item = mac.locator(tid('history-item')).filter({ hasText: /capital of France/i }).first();
        await item.locator('.history-open').click();
        const answer = mac.locator(tid('turn-jarvis')).first();
        await answer.waitFor({ state: 'visible', timeout: 10000 });
        t.assert((await t.text(answer)).includes('Paris'), 'the answer came along');
        await shot(t, '2-mac-history', mac);
      });

      await t.step('carried on on the Mac: the iPhone’s open conversation shows the new turn', async () => {
        // The Mac has the iPhone's conversation open (from History): a follow-up there.
        const turn = await t.send('And what is its population?', { page: mac });
        await t.waitForTurn(turn, ['done']);
        await mac.waitForTimeout(1200);
        await openSync(t, mac);
        await syncNow(t, mac);
        await closeSettings(t, mac);
        // The iPhone still has that conversation open: it is replaced (theirs has every turn of it) and reloaded.
        await openSync(t, phone);
        await syncNow(t, phone);
        await closeSettings(t, phone);
        await t.waitFor(async () => (await phone.locator(tid('turn-user')).allTextContents()).some((x) => /population/i.test(x)), { timeout: 10000, message: 'the follow-up asked on the Mac in the iPhone’s open conversation' });
        t.assert((await phone.locator(tid('turn-jarvis')).count()) === 2, 'both answers show');
        await shot(t, '2b-iphone-carried-on', phone);
      });

      await t.step('a question on the Mac reaches the iPhone', async () => {
        await ask(t, mac, 'Recommend an espresso machine under $500');
        await openSync(t, mac);
        await syncNow(t, mac);
        await shot(t, '3-mac-card', mac);
        await closeSettings(t, mac);
        await openSync(t, phone);
        await syncNow(t, phone);
        t.assert(/Brought in 1 conversation/.test(await statusText(t, phone)), `the card says what came in ("${await statusText(t, phone)}")`);
        await shot(t, '4-iphone-brought-in', phone);
        await closeSettings(t, phone);
        const titles = await historyTitles(t, phone);
        t.assert(titles.some((x) => /espresso/i.test(x)), `the Mac’s conversation is in the iPhone’s History (${titles.join(' | ')})`);
      });

      await t.step('deleted on the iPhone: it never comes back there, and stays on the Mac', async () => {
        const row = phone.locator(tid('history-item')).filter({ hasText: /espresso/i }).first();
        await row.locator(tid('history-delete')).click();
        await row.locator(tid('history-delete')).click(); // tap again to confirm
        await t.waitFor(async () => !(await historyTitles(t, phone)).some((x) => /espresso/i.test(x)), { timeout: 5000, message: 'the conversation to leave the iPhone’s History' });
        await closeHistory(phone);
        // The Mac changes something (so its backup is new), the iPhone pulls it again.
        await ask(t, mac, 'What is the capital of Italy?');
        await openSync(t, mac);
        await syncNow(t, mac);
        await closeSettings(t, mac);
        const gets = t.coreSync.gets.length;
        await openSync(t, phone);
        await syncNow(t, phone);
        t.assert(t.coreSync.gets.length > gets, 'the iPhone pulled the Mac’s new backup');
        await closeSettings(t, phone);
        const titles = await historyTitles(t, phone);
        t.assert(titles.some((x) => /capital of Italy/i.test(x)), `the Mac’s new conversation came in (${titles.join(' | ')})`);
        t.assert(!titles.some((x) => /espresso/i.test(x)), `the deleted conversation did not come back (${titles.join(' | ')})`);
        await shot(t, '5-iphone-history', phone);
        await closeHistory(phone);
        const macTitles = await historyTitles(t, mac);
        t.assert(macTitles.some((x) => /espresso/i.test(x)), `still on the Mac: a deletion never spreads (${macTitles.join(' | ')})`);
        t.assert(macTitles.filter((x) => /capital of France/i.test(x)).length === 1, 'no duplicates on the Mac');
      });
    },
  },

  {
    name: 'sync-states',
    title: 'Sync’s card on an iPhone: a Jarvis Core 1.0 says it needs an update, too big (the Core’s 413), unreachable, then Sync now works; off sends nothing and stays off after a reload',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { brain: false },
    allowConsole: NETWORK_NOISE,
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.step('a Jarvis Core 1.0 (no api/sync) says it needs an update', async () => {
        await openSync(t, t.page);
        await t.waitFor(async () => /Jarvis Core 1\.1/.test(await statusText(t, t.page)), { timeout: 20000, message: async () => `the old-Core sentence (got "${await statusText(t, t.page)}")` });
        t.assert((await statusText(t, t.page)).includes('jarvis-core update'), 'it says what to run');
        t.assert(t.coreSync.puts.length === 0, 'nothing was sent');
        await shot(t, '1-old-core');
      });
      await t.step('too big: the Core refuses it (413) and the card says why', async () => {
        t.core.brain.enabled = true; // updated to 1.1
        t.coreSync.mode = 'toolarge';
        await t.page.locator(tid('sync-now')).click();
        await t.waitFor(async () => /too big to sync/.test(await statusText(t, t.page)), { timeout: 15000, message: async () => `the too-big sentence (got "${await statusText(t, t.page)}")` });
        t.assert(/50 MB/.test(await statusText(t, t.page)), 'it names the limit');
        await shot(t, '2-too-big');
        t.coreSync.mode = 'ok';
      });
      await t.step('unreachable: the card says so', async () => {
        t.core.mode = 'unreachable';
        await t.page.locator(tid('sync-now')).click();
        await t.waitFor(async () => /Can’t reach the home base/.test(await statusText(t, t.page)), { timeout: 20000, message: async () => `the unreachable sentence (got "${await statusText(t, t.page)}")` });
        await shot(t, '3-unreachable');
        t.core.mode = 'ok';
      });
      await t.step('reachable again: Sync now works', async () => {
        await syncNow(t, t.page);
        t.assert(t.coreSync.puts.length === 1, `one upload (${t.coreSync.puts.length})`);
        await shot(t, '4-synced');
      });
      await t.step('off: nothing is sent, and it stays off after a reload', async () => {
        await t.page.locator(tid('sync-enabled')).click();
        await t.waitFor(async () => /Sync is off/.test(await statusText(t, t.page)), { timeout: 5000, message: 'the off sentence' });
        t.assert(!(await t.page.locator(tid('sync-now')).isVisible()), 'no Sync now while off');
        await shot(t, '5-off');
        const lists = t.coreSync.lists;
        await t.reload();
        await t.page.waitForTimeout(4500); // past the sync after the boot
        t.assert(t.coreSync.lists === lists, 'no sync after the reload while off');
        await openSync(t, t.page);
        t.assert(!(await t.page.locator(tid('sync-enabled')).isChecked()), 'still off');
      });
    },
  },
];
