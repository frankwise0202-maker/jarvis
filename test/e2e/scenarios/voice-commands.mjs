// Voice for everything (v8.1, C1-C4; SPEC §30): the app's own words, said in Voice Mode or typed in the
// chat, act at once and free, each with its one short line; ordinary questions still reach Jarvis
// exactly once. The fake recognizer (features.mjs installFakeSpeech) hears one queued phrase per listen,
// so each phrase is said while Jarvis is silent (after his line, or after a tap), never over his speech.

import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';
import { typeCommand, toastText } from './screens.mjs';
import { installCameraRig } from '../camera-rig.mjs';
import { cameraArgs, instrument, waitLive } from './optics.mjs';

const said = (t) => t.page.evaluate(() => window.__voice.said.map((s) => String(s)));
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const settings = (t) => t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}'));

/** Jarvis has said `line` (a RegExp or a string), at least `times` times. */
async function saysLine(t, line, { times = 1, timeout = 15000 } = {}) {
  const re = line instanceof RegExp ? line : new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  await t.waitFor(async () => (await said(t)).filter((s) => re.test(norm(s))).length >= times, {
    timeout,
    message: async () => `Jarvis to say ${re} ${times > 1 ? `${times} times ` : ''}(said: ${JSON.stringify((await said(t)).slice(-6))})`,
  });
}

/** Open Voice Mode from the header with these phrases queued (one per listen). */
async function openVoice(t, phrases) {
  await t.page.evaluate((list) => window.__voice.queue.push(...list), phrases);
  await (await t.visible('voice-open')).click();
  return t.visible('voice-mode');
}

/** Voice Mode is idle (waiting for a tap); then a tap listens and hears the next phrase. */
async function tapWith(t, phrase) {
  const vm = t.page.locator(tid('voice-mode'));
  await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'idle', { timeout: 15000, message: 'Voice Mode to wait for a tap' });
  await t.page.evaluate((p) => window.__voice.queue.push(p), phrase);
  await t.page.locator(tid('voice-core')).click();
}

async function voiceClosed(t) {
  await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {
    throw new Error('Voice Mode should close');
  });
}

/** Close a sheet by its own close button (Escape could land in a field it focused). */
async function closeSheet(t, testid, closeTestid) {
  const sheet = t.page.locator(tid(testid));
  if (!(await sheet.count())) return;
  const btn = t.page.locator(tid(closeTestid)).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  else await t.page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}

/** No request reached Claude (the lead model) so far. */
function noRequests(t, what) {
  const n = t.requests('lead').length;
  t.assert(n === 0, `${what}: no request to Claude (${n})`);
}

export default [
  {
    name: 'voice-commands-free',
    title:
      'Voice for everything: the app\'s own words said in Voice Mode act at once, each with its one line, and none reaches Claude: speak slower and faster, the spend readout, new chat, repeat that, read the full answer, be quiet, "stop" with nothing running, the device voice, send right away, turn off continuous, stop listening, exit Voice Mode',
    device: 'mac',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      const phrases = [
        ['speak slower', 'Slower.'],
        ['speak faster', 'Faster.'],
        ['how much have I spent today', 'Nothing spent today.'],
        ['how much have I spent this month', 'Nothing spent this month.'],
        ['new chat', 'New chat.'],
        ['repeat that', 'New chat.'],
        ['read the full answer', "There's nothing more to read."],
        ['be quiet', 'Okay.'],
        ['Jarvis, stop.', 'Okay.'],
        ["use the Mac's voice", /^This is the (?:Mac|computer)'s own voice\.$/],
        ['send right away', "I'll send what I hear right away."],
        ['turn off continuous', 'Continuous conversation off. Tap me when you need me.'],
      ];
      const vm = await openVoice(
        t,
        phrases.map(([p]) => p),
      );

      await t.step('each phrase acts at once and says its line (Continuous: the next one is heard after it)', async () => {
        await saysLine(t, 'Continuous conversation off. Tap me when you need me.', { timeout: 90000 });
        const lines = (await said(t)).map(norm);
        let from = 0;
        for (const [phrase, line] of phrases) {
          const i = lines.findIndex((s, k) => k >= from && (line instanceof RegExp ? line.test(s) : s === line));
          t.assert(i >= 0, `"${phrase}" → "${line}" (said: ${JSON.stringify(lines)})`);
          from = i + 1;
        }
        noRequests(t, 'twelve commands');
        await t.screenshot('1-commands');
      });

      await t.step('the settings they changed: the speed back where it was, send right away, Continuous off', async () => {
        const s = await settings(t);
        t.assert(!('voiceRate' in s) || Math.abs(s.voiceRate - 1) < 1e-9, `speed 1.0 after slower then faster (${s.voiceRate})`);
        t.assert(s.listenSend === 'now', `send right away (${s.listenSend})`);
        t.assert(s.voiceContinuous === false, `Continuous off (${s.voiceContinuous})`);
        t.assert((await t.page.locator('[data-testid="voice-mode"] [role="switch"]').getAttribute('aria-checked')) === 'false', 'the Continuous switch follows');
      });

      await t.step('"stop listening": Jarvis says so and waits for a tap; "exit Voice Mode" closes it', async () => {
        await tapWith(t, 'stop listening');
        await saysLine(t, "I've stopped listening. Tap me when you need me.");
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'idle', { timeout: 10000, message: 'Voice Mode to wait for a tap' });
        await tapWith(t, 'exit voice mode');
        await saysLine(t, 'Closing Voice Mode.');
        await voiceClosed(t);
        noRequests(t, 'every command');
        await t.screenshot('2-closed');
      });
    },
  },
  {
    name: 'voice-commands-app',
    title:
      'Voice for everything: "open settings" said in Voice Mode is answered, then Voice Mode leaves for Settings; "open the library" the same; "show mission control" with no mission says so; "open the home base" with none linked opens its setup; typed in the chat, "open the voice settings" and "open history" act at once with their line; nothing reaches Claude',
    device: 'mac',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');

      await t.step('"open settings" in Voice Mode: the line, then Settings, Voice Mode gone', async () => {
        await openVoice(t, ['Jarvis, open settings.']);
        await saysLine(t, 'Settings are open.');
        await voiceClosed(t);
        await t.visible('settings-sheet', { message: 'Settings open, as its button opens them' });
        await t.screenshot('1-settings');
        await closeSheet(t, 'settings-sheet', 'settings-close');
      });

      await t.step('"show mission control" with no mission: said, and Voice Mode stays; "open the library": the library', async () => {
        await openVoice(t, ['show mission control', 'open the library']);
        await saysLine(t, "There's no mission to show yet.");
        await saysLine(t, 'Your library is open.');
        await voiceClosed(t);
        await t.visible('library-sheet', { message: 'the library opens' });
        await closeSheet(t, 'library-sheet', 'sheet-close');
      });

      await t.step('"open the home base" with none linked: its setup, in Settings → Home base', async () => {
        await openVoice(t, ['open the home base']);
        await saysLine(t, "The home base isn't linked yet. Here's how to set it up.");
        await voiceClosed(t);
        await t.visible('settings-sheet', { message: 'Settings open at the home base' });
        await t.waitFor(async () => (await t.page.locator('.set-nav-btn.is-active').getAttribute('data-section')) === 'homebase', { timeout: 8000, message: 'the Home base section in view' });
        await t.screenshot('2-homebase-setup');
        await closeSheet(t, 'settings-sheet', 'settings-close');
      });

      await t.step('typed in the chat: "open the voice settings" and "open history" act at once with their line', async () => {
        await typeCommand(t, 'open the voice settings');
        await t.visible('settings-sheet');
        await t.waitFor(async () => /Voice settings are open\./.test(await toastText(t)), { timeout: 5000, message: async () => `the line as a toast (${await toastText(t)})` });
        await t.waitFor(async () => (await t.page.locator('.set-nav-btn.is-active').getAttribute('data-section')) === 'voice', { timeout: 8000, message: 'the Voice section in view' });
        await closeSheet(t, 'settings-sheet', 'settings-close');
        await typeCommand(t, 'open history');
        await t.waitFor(async () => (await t.page.locator('[data-sidebar]').first().getAttribute('data-sidebar')) === 'open', { timeout: 5000, message: 'the history list opens (desktop: the sidebar)' });
        await t.waitFor(async () => /Your history is open\./.test(await toastText(t)), { timeout: 5000, message: 'its line' });
        noRequests(t, 'the app commands');
        await t.screenshot('3-typed');
      });
    },
  },
  {
    name: 'voice-commands-screen-look',
    title:
      'Voice for everything (C5): "look at my screen" in Voice Mode offers a one-tap button with a Look\'s price (the screen\'s share picker needs a tap); typed in the chat, the line is a toast with its Look button; nothing reaches Claude until it is tapped',
    device: 'mac',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await t.step('said in Voice Mode: the line with the price, and the button', async () => {
        await openVoice(t, ['Jarvis, look at my screen.']);
        await saysLine(t, "Tap Look at my screen when you're ready. A Look costs about 3 cents.");
        const btn = await t.visible('voice-screen-look', { message: 'the one-tap button' });
        t.assert(/Look at my screen · about 3¢/.test(norm(await t.text(btn))), `its label shows the price (${norm(await t.text(btn))})`);
        noRequests(t, 'the offer');
        await t.screenshot('1-offer');
        await (await t.visible('voice-close')).click();
        await voiceClosed(t);
      });
      await t.step('typed in the chat: a toast with its Look button', async () => {
        await typeCommand(t, 'look at my screen');
        await t.waitFor(async () => /Tap Look to look at your screen/.test(await toastText(t)), { timeout: 5000, message: async () => `the toast (${await toastText(t)})` });
        t.assert(await t.page.locator('.toast button', { hasText: 'Look' }).first().isVisible(), 'the toast carries the Look button');
        noRequests(t, 'the offer');
      });
    },
  },
  {
    name: 'voice-commands-brief',
    title:
      'Voice for everything (C6): "brief me" with no home base linked says the briefing\'s price and waits; "no" sends nothing',
    device: 'mac',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await t.step('the price first, then "no": nothing is sent', async () => {
        await openVoice(t, ['brief me', 'no']);
        await saysLine(t, 'Your briefing sends a team of agents to look up the news, about $1.70. Shall I run it?');
        await saysLine(t, 'Okay, no briefing.');
        noRequests(t, '"no" to the briefing');
        await t.screenshot('1-no-briefing');
      });
    },
  },
  {
    name: 'voice-commands-questions',
    title:
      'Voice for everything: ten ordinary questions, some of them with Optics open, each reach Jarvis exactly once (one request each), and none is taken by a command',
    device: 'mac',
    timeout: 300000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: [{ label: 'FaceTime HD Camera (Built-in) (05ac:8514)' }] });
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      // Sent right away (no 2-second check) so each question is one request as soon as it is heard.
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}');
        localStorage.setItem('jarvis.settings.v1', JSON.stringify({ ...s, listenSend: 'now' }));
      });
      await page.reload();
      const plain = ['What is the weather tomorrow?', 'How do I close all my Chrome tabs?', 'Start a new conversation with my boss about the budget.', 'Read me a poem.', 'Stop worrying about the deadline, just summarize it.'];
      const withOptics = ['How do I reset my router?', 'How much have I spent on groceries this month?', 'Is it going to rain this weekend?', 'Tell me a joke.', 'What should I cook tonight?'];

      await t.step('five questions in Voice Mode: one request each', async () => {
        await openVoice(t, []);
        for (const [i, q] of plain.entries()) {
          await tapWith(t, q);
          await t.waitFor(() => t.requests('lead').length >= i + 1, { timeout: 30000, message: `"${q}" to be sent` });
          await t.waitFor(async () => ['idle', 'listening'].includes(await page.locator(tid('voice-mode')).getAttribute('data-state')), { timeout: 45000, message: 'the answer to end' });
        }
        t.assert(t.requests('lead').length === plain.length, `exactly one request each (${t.requests('lead').length})`);
      });

      await t.step('Optics open over Voice Mode: five more, one request each (a time like "this weekend" is not a Look)', async () => {
        await page.locator(tid('voice-look')).click();
        await t.visible('optics');
        await waitLive(t);
        const before = t.requests('lead').length;
        for (const [i, q] of withOptics.entries()) {
          await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'idle', { timeout: 30000, message: 'Voice Mode to wait for a tap' });
          await page.evaluate((p) => window.__voice.queue.push(p), q);
          await page.locator(tid('optics-mic')).click();
          await t.waitFor(() => t.requests('lead').length >= before + i + 1, { timeout: 30000, message: `"${q}" to be sent` });
          await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) !== 'thinking', { timeout: 45000, message: 'the answer to end' });
        }
        await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'idle', { timeout: 45000, message: 'the last answer to end' });
        t.assert(t.requests('lead').length === before + withOptics.length, `exactly one request each (${t.requests('lead').length - before})`);
        const frames = t.requests('lead').slice(before).filter((r) => JSON.stringify(r.body).includes('"type":"image"')).length;
        t.assert(frames === 0, `no question with a time word went as a Look (${frames} with a frame)`);
        await t.screenshot('1-optics');
      });
    },
  },
];
