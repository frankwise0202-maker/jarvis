// Jarvis for Chrome, linked through the home base (v8.1, SPEC §32.1, wire v1). The fake Core's relay
// (core-fakes.mjs: the Core's own relay store) and a fake Jarvis for Chrome (createFakeChromePeer) at the other end.
//   chrome-link-settings  Settings → Jarvis for Chrome on a Mac: Link, Copy link code, the fake extension pastes
//                         it, "Linked · online", the clipboard cleared, hello both ways, Test (a ping round trip),
//                         a reload stays linked,
//                         the key in no export, Unlink tells the extension; offline when it stops reading; the
//                         iPhone only says where to link and never reads the relay.
//   chrome-link-open      "open YouTube in Chrome" with the link online: the open message (url, no rectangle,
//                         focused) and its reply, said; with the extension offline: the normal tab (G1).
//   chrome-link-retry     CHROME-LINK-R2-1 (ported from the second review's r2-retry-stopped): a Chrome task said in
//                         Voice Mode whose start can't reach the home base, said again 20 s later; Jarvis for Chrome
//                         sends the task's news before its reply, as the real one does: the retry runs, never stopped
//                         as a "late start".

import { readFileSync } from 'node:fs';
import { tid } from '../harness.mjs';
import { CORE_URL, CORE_ORIGIN, createFakeChromePeer, seedChromeLink, CHROME_TEST_KEY } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';

const LINKED_HOME = { settings: { homeBaseUrl: CORE_URL } };
// A read that waits for the relay is cut off when the page goes away (a reload): the browser logs it.
const NETWORK_NOISE = [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/, /net::ERR_ABORTED/];

async function openChromeSettings(t, page = t.page) {
  await (await t.visible('settings-button', { page })).click();
  await t.visible('settings-sheet', { page });
  const card = page.locator(tid('chrome-link-settings'));
  await card.waitFor({ state: 'attached', timeout: 10000 });
  await card.scrollIntoViewIfNeeded();
  await card.waitFor({ state: 'visible', timeout: 5000 });
  return card;
}

async function closeSettings(t, page = t.page) {
  await page.locator(`${tid('settings-sheet')} ${tid('settings-close')}`).click();
  await page.locator(tid('settings-sheet')).waitFor({ state: 'hidden', timeout: 5000 });
}

const cardState = async (card) => ({ state: await card.getAttribute('data-state'), online: await card.getAttribute('data-online') });

async function waitCard(t, card, state, online = null) {
  await t.waitFor(async () => {
    const s = await cardState(card);
    return s.state === state && (online === null || s.online === String(online));
  }, { timeout: 15000, message: async () => `the card to be ${state}${online === null ? '' : online ? ' · online' : ' · offline'} (it is ${JSON.stringify(await cardState(card))}: ${await t.text(card.locator(tid('chrome-link-state')))})` });
}

const relayCalls = (t) => t.core.requests.filter((r) => r.includes('/api/relay/'));

/**
 * On the next load of `page` only, the stored link says Jarvis for Chrome was last heard from `agoMs` ago, as if
 * that much time had passed. Set before the app's code runs, so nothing the page before it still had in flight (a
 * status check that saves the record) can write over it.
 */
async function rewindLastHeard(page, agoMs) {
  const tag = `__e2e_rewind_${Math.random().toString(36).slice(2)}`;
  await page.addInitScript(
    ({ tag: once, agoMs: ago }) => {
      try {
        if (sessionStorage.getItem(once)) return;
        sessionStorage.setItem(once, '1');
        const r = JSON.parse(localStorage.getItem('jarvis.chromeLink.v1') || 'null');
        if (r) {
          r.extSeenAt = Date.now() - ago;
          if (r.heardAt) r.heardAt = Date.now() - ago; // (the last message from it, kept since REDTEAM-LINK-6)
          localStorage.setItem('jarvis.chromeLink.v1', JSON.stringify(r));
        }
      } catch {
        /* storage unavailable */
      }
    },
    { tag, agoMs },
  );
}

/** The fake Jarvis for Chrome stops reading its box (a read in progress ends first). */
async function goOffline(peer) {
  peer.setOnline(false, { seenAgoMs: 5 * 60_000 });
  await new Promise((r) => setTimeout(r, 800));
}

// ---- Voice Mode for chrome-link-retry (the same as chrome-voice.mjs's, kept here so the two files stay apart) ----
/** A Mac linked to the fake Jarvis for Chrome (online), the fake recognizer and voice, Voice Mode open. */
async function linkedVoiceMode(t) {
  const page = await t.newPage();
  await seedChromeLink(page.context(), { key: CHROME_TEST_KEY });
  await page.addInitScript(installFakeSpeech, { noSpeechMs: 4000 });
  await page.addInitScript(() => {
    window.__voice.queue = [''];
  });
  await t.goto('/');
  const peer = createFakeChromePeer(t.core.relay, { autoTask: true }).start();
  await t.waitFor(() => peer.received.some((m) => m.kind === 'hello'), { timeout: 15000, message: 'the app’s hello' });
  await page.waitForTimeout(1500); // online once the extension's hello back has arrived
  await (await t.visible('voice-open')).click();
  await t.visible('voice-mode');
  return { page, peer };
}
const saidLines = (t) => t.page.evaluate(() => window.__voice.said.map((s) => String(s).replace(/\s+/g, ' ').trim()));
const hear = (t, text) => t.page.evaluate((x) => window.__voice.say({ parts: [{ at: 600, text: x, final: true, alts: [] }] }), text);
const kinds = (peer, kind) => peer.received.filter((m) => m.kind === kind);

export default [
  {
    name: 'chrome-link-settings',
    title: 'Settings → Jarvis for Chrome on a Mac: Link, Copy link code, the extension pastes it, Linked · online, the clipboard cleared, hello both ways; a reload stays linked; the key in no export; offline when it stops reading; Unlink tells it; the iPhone never reads the relay',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      await t.newPage();
      await t.page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: t.url });
      await t.goto('/');
      const peer = createFakeChromePeer(t.core.relay, { key: null }).start();
      const clipboard = () => t.page.evaluate(() => navigator.clipboard.readText());
      try {
        let card;
        await t.step('not linked: what it does, and Link; nothing asked of the relay', async () => {
          card = await openChromeSettings(t);
          await waitCard(t, card, 'off');
          t.assert((await t.text(card.locator(tid('chrome-link-state')))) === 'Not linked', 'Not linked');
          t.assert(await card.locator(tid('chrome-link-link')).isEnabled(), 'Link is offered (a home base is linked)');
          t.assert(/clicks and types for you/.test(await t.text(card)), 'it says what Jarvis for Chrome does');
          t.assert(relayCalls(t).length === 0, `nothing asked of the relay before linking (${relayCalls(t).join(', ')})`);
          await t.screenshot('1-not-linked');
        });

        let code;
        await t.step('Link → Copy link code: the steps; the code carries the home base and a key', async () => {
          await card.locator(tid('chrome-link-link')).click();
          await waitCard(t, card, 'pending');
          t.assert(await card.locator(tid('chrome-link-steps')).isVisible(), 'the steps');
          t.assert(/Voice from Jarvis/.test(await t.text(card.locator(tid('chrome-link-steps')))), 'where to paste it');
          await card.locator(tid('chrome-link-copy')).click();
          code = await t.waitFor(async () => {
            const text = await clipboard();
            return text && text.length > 60 ? text : null;
          }, { timeout: 5000, message: 'the link code on the clipboard' });
          const link = JSON.parse(Buffer.from(code, 'base64url').toString('utf8'));
          t.assert(link.v === 1 && link.core === CORE_ORIGIN && /^[A-Za-z0-9_-]{43}$/.test(link.key), `the code is { v: 1, core, key } (${JSON.stringify(Object.keys(link))}, core ${link.core})`);
          t.assert(/Link code copied/.test(await t.text(card.locator(tid('chrome-link-result')))), 'it says it copied');
          t.assert(!(await card.locator(tid('chrome-link-code')).isVisible()), 'the code isn’t shown on screen (it was copied)');
          await t.waitFor(() => t.core.relay.reads['to-app'] > 0, { timeout: 10000, message: 'the app waiting on its box' });
          await t.screenshot('2-linking');
        });

        await t.step('Jarvis for Chrome pastes it: Linked · online, hello both ways, the clipboard cleared', async () => {
          await peer.link(code);
          await waitCard(t, card, 'linked', true);
          t.assert((await t.text(card.locator(tid('chrome-link-state')))) === 'Linked · online', 'Linked · online');
          const hello = await peer.waitFor('hello');
          t.assert(hello.body.app === 'jarvis' && typeof hello.body.version === 'string', `the app says hello (${JSON.stringify(hello.body)})`);
          await t.waitFor(async () => (await clipboard()) === '', { timeout: 5000, message: 'the link code cleared from the clipboard' });
          // Test: a round trip to Jarvis for Chrome, and whether it takes tasks from Jarvis.
          await card.locator(tid('chrome-link-test')).click();
          await t.waitFor(async () => /Jarvis for Chrome answered in [\d.]+ s\. Tasks from Jarvis are on\./.test(await t.text(card.locator(tid('chrome-link-result')))), { timeout: 10000, message: async () => `Test to say it answered (got "${await t.text(card.locator(tid('chrome-link-result')))}")` });
          t.assert((await peer.waitFor('ping')).kind === 'ping', 'the ping reached it');
          await t.screenshot('3-linked');
        });

        await t.step('the key lives only in its own entry: not in Settings, not in an export', async () => {
          const stored = await t.page.evaluate(() => ({ link: localStorage.getItem('jarvis.chromeLink.v1'), settings: localStorage.getItem('jarvis.settings.v1') }));
          const record = JSON.parse(stored.link);
          t.assert(record.key === peer.key && record.core === CORE_ORIGIN && record.linkedAt > 0, 'the link record');
          t.assert(!stored.settings.includes(peer.key), 'not in Settings');
          const exportBtn = t.page.locator(tid('export-backup'));
          await exportBtn.scrollIntoViewIfNeeded();
          const [download] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }), exportBtn.click()]);
          const json = readFileSync(await download.path(), 'utf8');
          t.assert(JSON.parse(json).app === 'jarvis', 'a backup');
          t.assert(!json.includes(peer.key), 'the key is not in the export');
          t.assert(!json.includes(code.slice(8, 60)), 'nor the link code');
          t.assert(!/chromeLink/i.test(json), 'nor anything named for the link');
        });

        await t.step('a reload stays linked and says hello again', async () => {
          await closeSettings(t);
          const hellos = peer.received.filter((m) => m.kind === 'hello').length;
          await t.reload();
          card = await openChromeSettings(t);
          await waitCard(t, card, 'linked', true);
          await t.waitFor(() => peer.received.filter((m) => m.kind === 'hello').length > hellos, { timeout: 10000, message: 'a hello after the reload' });
        });

        await t.step('offline when Jarvis for Chrome stops reading (the relay last saw it long ago); online again', async () => {
          await closeSettings(t);
          await goOffline(peer);
          // Its hello a moment ago still counts for a minute; a page opened two minutes later wouldn't. Reload with
          // the stored "last heard" moved back, as if two minutes had passed.
          await rewindLastHeard(t.page, 2 * 60_000);
          await t.reload();
          card = await openChromeSettings(t);
          await waitCard(t, card, 'linked', false);
          t.assert((await t.text(card.locator(tid('chrome-link-state')))) === 'Linked · offline', 'Linked · offline');
          t.assert(/Open the Jarvis window/.test(await t.text(card)), 'what to do');
          await t.screenshot('4-offline');
          peer.setOnline(true);
          await closeSettings(t);
          card = await openChromeSettings(t); // opening Settings asks the home base again
          await waitCard(t, card, 'linked', true);
        });

        await t.step('Unlink (two taps): Jarvis for Chrome is told; the key is gone', async () => {
          const unlink = card.locator(tid('chrome-link-unlink'));
          await unlink.click();
          t.assert(/Tap again/.test(await t.text(unlink)), 'asks for a second tap');
          await unlink.click();
          await peer.waitFor('unlinked');
          await waitCard(t, card, 'off');
          t.assert(!peer.linked, 'the extension forgot it too');
          const left = await t.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jarvis.chromeLink')));
          t.assert(left.length === 0, `nothing left (${left.join(', ')})`);
          await t.screenshot('5-unlinked');
          await t.checkNoHorizontalOverflow('Settings → Jarvis for Chrome');
        });

        await t.step('the iPhone: one line about linking on the computer; never reads the relay', async () => {
          const phone = await t.newPage({ device: 'iphone13', seed: LINKED_HOME });
          const phoneCore = t.core; // the newest context's fake Core: the iPhone's own requests
          await seedChromeLink(phone.context()); // even with a link stored, the iPhone doesn't use it
          await t.goto('/', { page: phone });
          const phoneCard = await openChromeSettings(t, phone);
          await waitCard(t, phoneCard, 'phone');
          t.assert(/on your computer/.test(await t.text(phoneCard)), 'where to link it');
          t.assert(!(await phoneCard.locator(tid('chrome-link-link')).isVisible()), 'no Link on the iPhone');
          await new Promise((r) => setTimeout(r, 1000));
          const phoneRelay = phoneCore.requests.filter((r) => r.includes('/api/relay/'));
          t.assert(phoneRelay.length === 0, `the iPhone never reads the relay (${phoneRelay.join(', ')})`);
          await t.screenshot('6-iphone', phone);
          await t.checkNoHorizontalOverflow('the iPhone card', phone);
        });
      } finally {
        await peer.stop();
      }
    },
  },

  {
    name: 'chrome-link-open',
    title: '"open YouTube in Chrome" with Jarvis for Chrome linked and online: the open message (no rectangle, focused) and its reply; refused with why; with it offline: the normal tab',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 150000,
    async run(t) {
      const page = await t.newPage();
      await seedChromeLink(page.context(), { key: CHROME_TEST_KEY });
      // The normal tab (G1) is window.open (a blank tab whose address is then set): recorded here instead of a
      // real page outside the test.
      await page.addInitScript(() => {
        window.__opened = [];
        window.open = (url) => {
          const rec = { url: String(url), sent: null };
          window.__opened.push(rec);
          return {
            opener: null,
            closed: false,
            location: {
              replace(u) {
                rec.sent = String(u);
              },
              assign(u) {
                rec.sent = String(u);
              },
            },
            focus() {},
            close() {},
            moveTo() {},
            resizeTo() {},
            document: { hasFocus: () => false },
          };
        };
      });
      const opened = () => page.evaluate(() => window.__opened.map((r) => (r.url === 'about:blank' ? r.sent : r.url)).filter(Boolean));
      await t.goto('/');
      const peer = createFakeChromePeer(t.core.relay).start();
      // A typed command's line is a toast (app.js runChat).
      const toastSays = (re, what) =>
        t.waitFor(async () => {
          const texts = await page.locator(tid('toast')).allTextContents();
          return texts.some((x) => re.test(x.replace(/\s+/g, ' ')));
        }, { timeout: 10000, message: async () => `${what} (toasts: ${JSON.stringify(await page.locator(tid('toast')).allTextContents())})` });
      try {
        await t.step('linked and online: the extension opens it', async () => {
          await t.waitFor(() => peer.received.some((m) => m.kind === 'hello'), { timeout: 10000, message: 'the app’s hello' });
          const card = await openChromeSettings(t);
          await waitCard(t, card, 'linked', true); // its hello back has arrived: online
          await closeSettings(t);
          const input = await t.visible('composer-input');
          await input.fill('open YouTube in Chrome');
          await (await t.visible('composer-send')).click();
          const open = await peer.waitFor('open');
          t.assert(open.body.url === 'https://www.youtube.com/', `the address (${open.body.url})`);
          t.assert(open.body.rect === null && open.body.focus === true, `no rectangle, focused (${JSON.stringify(open.body)})`);
          await toastSays(/open in the Jarvis window/, 'Jarvis to say it is open in the Jarvis window');
          t.assert((await opened()).length === 0, 'no normal tab');
          t.assert(t.requests('lead').length === 0, 'free: no Claude request');
          await t.screenshot('1-opened');
        });

        await t.step('refused: why is said, nothing else opens', async () => {
          peer.answer('open', { ok: false, reason: 'blocked', why: 'Jarvis for Chrome can’t open that: it is on your blocked list.' });
          const input = await t.visible('composer-input');
          await input.fill('open YouTube in Chrome');
          await (await t.visible('composer-send')).click();
          await peer.waitFor('open');
          await toastSays(/can’t open that address: .*blocked list/, 'the reason, said');
          t.assert((await opened()).length === 0, 'no normal tab for a refusal');
          peer.answer('open', undefined);
        });

        await t.step('offline: the normal tab, said once', async () => {
          await goOffline(peer);
          await rewindLastHeard(page, 2 * 60_000);
          await t.reload();
          await page.evaluate(() => {
            window.__opened = [];
          });
          const sent = peer.received.filter((m) => m.kind === 'open').length;
          const input = await t.visible('composer-input');
          await input.fill('open YouTube in Chrome');
          await (await t.visible('composer-send')).click();
          await t.waitFor(async () => (await opened()).length === 1, { timeout: 10000, message: 'a normal tab' });
          t.assert((await opened())[0] === 'https://www.youtube.com/', `the same address (${(await opened())[0]})`);
          t.assert(peer.received.filter((m) => m.kind === 'open').length === sent, 'nothing sent to an offline extension');
          await t.screenshot('2-normal-tab');
        });
      } finally {
        await peer.stop();
      }
    },
  },
  {
    name: 'chrome-link-retry',
    title: 'A Chrome task whose start couldn’t reach the home base, said again 20 s later: the retry runs; with its news before its reply (as the real Jarvis for Chrome sends them) it is never stopped as a “late start” (CHROME-LINK-R2-1)',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { peer } = await linkedVoiceMode(t);
      try {
        await t.step('the first try: the home base can’t be reached as the start goes out', async () => {
          await hear(t, 'Find a USB-C hub in Chrome.');
          await t.waitFor(async () => (await saidLines(t)).some((l) => /find a USB-C hub\. Say cancel to stop\./.test(l)), { timeout: 20000, message: async () => `the check (said: ${JSON.stringify(await saidLines(t))})` });
          t.core.relay.mode = 'unreachable';
          await t.page.waitForTimeout(4500);
          t.core.relay.mode = 'ok';
          t.assert(kinds(peer, 'start').length === 0, 'no start reached Jarvis for Chrome');
        });
        await t.step('20 s later the owner says it again: it goes through (news, then the reply); never stopped', async () => {
          await t.page.waitForTimeout(15000);
          peer.answer('start', null); // the reply is sent by hand, after the task's news
          const before = (await saidLines(t)).length;
          await t.locator('voice-core').click(); // the owner taps the core to talk again
          await hear(t, 'Find a USB-C hub in Chrome.');
          await t.waitFor(async () => (await saidLines(t)).slice(before).some((l) => /find a USB-C hub\. Say cancel to stop\./.test(l)), { timeout: 20000, message: async () => `the second check (said: ${JSON.stringify((await saidLines(t)).slice(-4))})` });
          const start = await peer.waitFor('start', { timeoutMs: 30000 });
          await peer.task({ id: 'task-retry', status: 'running', text: 'find a USB-C hub', narration: 'Starting the task.' });
          await peer.send('reply', { re: start.id, ok: true, id: 'task-retry' });
          await t.waitFor(async () => (await saidLines(t)).some((l) => l.includes('Chrome is on it.')), { timeout: 20000, message: async () => `"Chrome is on it." (said: ${JSON.stringify((await saidLines(t)).slice(-4))})` });
          await t.page.waitForTimeout(4000);
          const said = await saidLines(t);
          t.assert(kinds(peer, 'stop').length === 0, `the retried task was stopped (${kinds(peer, 'stop').length} stop(s)); said: ${JSON.stringify(said.slice(-3))}`);
          t.assert(!said.some((l) => l.includes('Chrome started late')), 'no "started late" for the task the owner just started');
        });
      } finally {
        await peer.stop();
      }
    },
  },
];
