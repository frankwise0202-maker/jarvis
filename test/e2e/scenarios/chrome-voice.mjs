// Jarvis for Chrome by voice (v8.1 G4, G5; SPEC §32.3): tasks said in Voice Mode, and Chrome's questions
// answered by voice, against the fake home base relay and a fake Jarvis for Chrome (core-fakes.mjs
// createFakeChromePeer, wire v1) with the fake recognizer and voice (features.mjs installFakeSpeech).
//   chrome-voice-task        "… in Chrome": the spoken check with the price, the card in Voice Mode, nothing
//                            sent before the countdown ends ("okay" lets it count on); start; "what are you
//                            doing in Chrome?"; "stop Chrome"; a second task withdrawn with "cancel" (nothing
//                            sent); no Claude request
//   chrome-voice-context     "open YouTube in Chrome" opens it in the Jarvis window: a Chrome context, where
//                            "add the cheapest one to the cart" is a task and "open the camera" is not
//   chrome-voice-approve     Chrome asks (a step allowed by voice): said, the card; "approve", "Approving · say
//                            cancel", then one decision bound to the prompt's hash; answered: the card closes
//   chrome-voice-misheard    "yes" alone answers nothing (Jarvis says what to say); "approve" heard with "no" as
//                            another reading is asked again; "cancel" during the check sends nothing
//   chrome-voice-click-only  a purchase: no Approve by voice or on the card, the card and Jarvis say it needs a
//                            click in the Jarvis window; "deny" goes out at once
//   chrome-voice-stack       an owner question that keeps (a tour decision's stand-in) and Chrome's question
//                            open together: "continue" and "enclosed" answer the question, "approve" the prompt
// The fixes after the red team, with a voice slow enough (12 characters a second) for a line to be cut:
//   chrome-voice-check-cut   REDTEAM-VOICE-1, MAC-1: Stop or a tap while the check line is said, or Stop during the
//                            countdown, withdraws it; nothing reaches Jarvis for Chrome (control: said in full, it goes)
//   chrome-voice-approve-cut REDTEAM-VOICE-1: Stop during "Approving. Say cancel to stop." approves nothing
//   chrome-voice-pending     REDTEAM-VOICE-6: Chrome's question waiting while Jarvis speaks, then an owner question:
//                            both are said
//   chrome-voice-homebase    VT-MISSED-1: hearing through the home base (no live words), "Cancel." said during the
//                            countdown pauses it while the home base hears it, and withdraws it
//   chrome-voice-two-windows REDTEAM-VOICE-7: two Jarvis windows, Voice Mode open in the one that doesn't hold the link:
//                            Chrome's question is said and answered there, a task said there is ended there
//   chrome-voice-mic-off     REDTEAM-VOICE-11, PRIVACY-1: Continuous off: Chrome's question opens no microphone
//                            ("Tap me to answer."); after a tap, "approve" counts
// v8.1.1 (the second review):
//   chrome-voice-stop-quiet  CHROME-VOICE-R2-2: Stop pressed while Chrome's question is said leaves Jarvis quiet (it stays
//   chrome-voice-stop-quiet-off  on its card); the same with Continuous off
//   chrome-voice-bargein-stop    CHROME-VOICE-R2-1: woken, George says Chrome's question; "Hey Jarvis" over it, then
//                            "Stop.": the words are heard and the waiting task stops; the question isn't said again

import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';
import { installFakeMic } from '../fake-mic.mjs';
import { CORE_URL, createFakeChromePeer, seedChromeLink, CHROME_TEST_KEY } from '../core-fakes.mjs';
import * as Sig from '../../unit/wake.signals.mjs';

const LINKED_HOME = { settings: { homeBaseUrl: CORE_URL } };
// A read that waits for the relay is cut off when the page goes away (a reload): the browser logs it.
const NETWORK_NOISE = [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/, /net::ERR_ABORTED/];
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const CART = {
  kind: 'confirm',
  category: 'change',
  consequential: false,
  site: 'bestbuy.com',
  title: 'Approve this step?',
  spoken: 'Add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com?',
  body: 'Click the button that says “Add to Cart” next to the 27-inch 4K monitor on bestbuy.com.',
  address: '',
  choices: [
    { id: 'approve', label: 'Approve' },
    { id: 'cancel', label: 'Cancel' },
  ],
  voice: { allowed: true, why: '' },
};
const PURCHASE = {
  ...CART,
  category: 'purchase',
  consequential: true,
  title: 'Jarvis asks for your approval',
  spoken: 'Place the order for $279.99 on bestbuy.com?',
  body: 'Click the button that says “Place order” on bestbuy.com. This looks like a purchase.',
  voice: { allowed: false, why: 'That’s a purchase.' },
};

/**
 * A Mac with Jarvis for Chrome linked (the fake extension online), the fake recognizer and voice, Voice Mode open.
 * cps: the fake voice's speed (characters a second; slow enough for a line to be cut); mic: the fake microphone too.
 */
async function linkedVoiceMode(t, { queue = [''], dev = false, cps = undefined, mic = false } = {}) {
  const page = await t.newPage();
  await seedChromeLink(page.context(), { key: CHROME_TEST_KEY });
  await page.addInitScript(installFakeSpeech, { noSpeechMs: 4000, ...(cps ? { cps } : {}) });
  if (mic) await page.addInitScript(installFakeMic);
  await page.addInitScript(
    ({ q, devHook }) => {
      window.__voice.queue = q;
      if (devHook) localStorage.setItem('jarvis.dev.chromeVoice', '1');
    },
    { q: queue, devHook: dev },
  );
  await t.goto('/');
  const peer = createFakeChromePeer(t.core.relay, { autoTask: true }).start();
  await t.waitFor(() => peer.received.some((m) => m.kind === 'hello'), { timeout: 15000, message: 'the app’s hello' });
  // Online once the extension's hello back has arrived (its long poll answers at once).
  await page.waitForTimeout(1500);
  await (await t.visible('voice-open')).click();
  await t.visible('voice-mode');
  return { page, peer };
}

const saidLines = (t) => t.page.evaluate(() => window.__voice.said.map((s) => String(s).replace(/\s+/g, ' ').trim()));

async function waitSaid(t, test, what, { timeout = 20000 } = {}) {
  const ok = (line) => (typeof test === 'string' ? line.includes(test) : test.test(line));
  await t.waitFor(async () => (await saidLines(t)).some(ok), { timeout, message: async () => `Jarvis to say ${what} (said: ${JSON.stringify(await saidLines(t))})` });
}

/** The owner says `text` (heard by the listen running, or the next one): `alts` are the recognizer's other readings. */
const hear = (t, text, { alts = [], at = 600 } = {}) => t.page.evaluate(({ text: x, alts: a, at: when }) => window.__voice.say({ parts: [{ at: when, text: x, final: true, alts: a }] }), { text, alts, at });

const kinds = (peer, kind) => peer.received.filter((m) => m.kind === kind);

/** The fake voice's log entry for the latest saying of `text`: { at, endAt } (endAt 0 while it is being said). */
const sayingOf = (t, text) =>
  t.page.evaluate((x) => {
    const n = (s) => String(s).replace(/\s+/g, ' ').trim();
    const e = [...window.__voice.log].reverse().find((l) => n(l.text) === x);
    return e ? { at: e.at, endAt: e.endAt } : null;
  }, text);
// George through the fake home base, with barge-in (A8) on a Mac whose hands-free test passed (CHROME-VOICE-R2-1).
const GEORGE = { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'owner' };
const BARGE_IN = { audioSetup: 'speaker-mac-mic' };
const TEST_PASSED = JSON.stringify({ at: 1_800_000_000_000, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: true, measured: { setup: 'speaker-mac-mic', wakeMic: '', speaker: '', clap: true, word: true } });
const TASK_LINE = 'Chrome, up to a dollar: find a 4K monitor under $300 and add it to the cart. Say cancel to stop.';
const HUB_LINE = 'Chrome, up to a dollar: find a USB-C hub. Say cancel to stop.';
const WITHDRAWN = 'Okay, nothing sent to Chrome.';

async function withPeer(peer, fn) {
  try {
    await fn();
  } finally {
    await peer.stop();
  }
}

/** CHROME-VOICE-R2-2: Stop while Chrome's question is said (a voice at 12 characters a second): quiet after it, the card stays. */
async function stopLeavesQuiet(t) {
  const { page, peer } = await linkedVoiceMode(t, { cps: 12 });
  await withPeer(peer, async () => {
    await t.waitFor(async () => (await t.locator('voice-mode').getAttribute('data-state')) !== 'listening', { timeout: 30000, message: 'the opening listen over' });
    await peer.task({ id: 'task-q', status: 'running', text: 'find a 4K monitor and add it to the cart', costUsd: 0.05, limitUsd: 1 });
    await peer.prompt(CART);
    const sayings = async () => (await saidLines(t)).filter((l) => l.startsWith('Chrome asks:')).length;
    await t.waitFor(async () => (await sayings()) === 1, { timeout: 30000, message: async () => `the question said (said ${JSON.stringify(await saidLines(t))})` });
    const log = [];
    for (let i = 1; i <= 2; i++) {
      if ((await sayings()) !== i) break;
      await page.waitForTimeout(1500); // mid-line (the line lasts about 10 s at 12 characters a second)
      const btn = t.locator('voice-mic');
      const action = await btn.getAttribute('data-action');
      const before = (await saidLines(t)).length;
      await btn.click();
      log.push(`Stop ${i} pressed (button read ${action})`);
      await page.waitForTimeout(6000);
      const after = (await saidLines(t)).slice(before);
      log.push(`after Stop ${i}: "Chrome asks" said ${await sayings()} times; said since: ${JSON.stringify(after)}; state ${await t.locator('voice-mode').getAttribute('data-state')}`);
      t.assert(after.length === 0, `Stop ${i} left Jarvis quiet (${log.join(' | ')})`);
    }
    t.note(log.join(' | '));
    t.assert((await sayings()) === 1, `said once (${log.join(' | ')})`);
    t.assert((await t.locator('voice-mode').getAttribute('data-state')) !== 'speaking', 'not speaking');
    t.assert(await t.page.locator(tid('voice-chrome-prompt-card')).isVisible(), 'the question stays on its card');
    t.assert(kinds(peer, 'answer').length === 0, 'nothing answered');
  });
}

export default [
  {
    name: 'chrome-voice-task',
    title: '"Find a 4K monitor under $300 and add it to the cart in Chrome": the spoken check with the price and the card, nothing sent before it ends ("okay" lets it count on); then the task, "what are you doing in Chrome?", "stop Chrome"; a second task withdrawn with "cancel"; never a Claude request',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { peer } = await linkedVoiceMode(t, { queue: ['Find a 4K monitor under $300 and add it to the cart in Chrome.'] });
      await withPeer(peer, async () => {
        await t.step('the check: said and shown with the price; Cancel and Start now; "okay" lets it count on; nothing sent yet', async () => {
          await waitSaid(t, 'Chrome, up to a dollar: find a 4K monitor under $300 and add it to the cart. Say cancel to stop.', 'the check with the price');
          // An affirmation during the check: it counts on from the start (never withdrawn, never Claude's).
          await hear(t, 'Okay.', { at: 200 });
          const card = await t.visible('voice-chrome-task-card');
          t.assert((await card.getAttribute('data-status')) === 'checking', 'the card is starting');
          t.assert(norm(await t.text(card.locator(tid('voice-chrome-task-card-text')))) === '“find a 4K monitor under $300 and add it to the cart”', 'the owner’s words, without "in Chrome"');
          t.assert(/up to a dollar/.test(await t.text(card)), 'the price on the card');
          t.assert(await card.locator(tid('voice-chrome-task-card-cancel')).isVisible(), 'Cancel');
          t.assert(await card.locator(tid('voice-chrome-task-card-start')).isVisible(), 'Start now');
          t.assert(kinds(peer, 'start').length === 0, 'nothing sent to the extension before the countdown ends');
          await t.screenshot('1-check');
        });
        await t.step('2 s later: the task starts with exactly those words; "Chrome is on it."', async () => {
          const start = await peer.waitFor('start');
          t.assert(start.body.text === 'find a 4K monitor under $300 and add it to the cart', `the task's words (${start.body.text})`);
          t.assert(start.body.chat === 'new' && start.body.from === 'voice', `a new chat, from voice (${JSON.stringify(start.body)})`);
          await waitSaid(t, 'Chrome is on it.', '"Chrome is on it."');
          t.assert(!(await saidLines(t)).includes('Okay, nothing sent to Chrome.'), '"okay" withdrew nothing');
        });
        await t.step('its latest step on the card, and said when asked "what are you doing in Chrome?" (free)', async () => {
          await peer.task({ id: 'task-1', status: 'running', text: 'find a 4K monitor under $300 and add it to the cart', narration: 'Comparing three monitors on bestbuy.com.', costUsd: 0.08, limitUsd: 1 });
          const card = await t.visible('voice-chrome-task-card');
          await t.waitFor(async () => /Comparing three monitors/.test(await t.text(card)), { timeout: 10000, message: 'the latest step on the card' });
          t.assert(/8¢ of \$1\.00/.test(await t.text(card)), 'the cost against its budget');
          await hear(t, 'What are you doing in Chrome?');
          await waitSaid(t, 'Chrome is working on: find a 4K monitor under $300 and add it to the cart. Latest: Comparing three monitors on bestbuy.com.', 'the latest step');
          await t.screenshot('2-running');
        });
        await t.step('"stop Chrome" stops it at once', async () => {
          await hear(t, 'Stop Chrome.');
          await peer.waitFor('stop');
          await waitSaid(t, 'Chrome stopped.', '"Chrome stopped."');
        });
        await t.step('a second task, withdrawn with "cancel" during its check: nothing sent', async () => {
          await hear(t, 'In Chrome, add the cheapest one to the cart.');
          await waitSaid(t, 'Chrome, up to a dollar: add the cheapest one to the cart. Say cancel to stop.', 'the second check');
          await hear(t, 'Cancel.', { at: 300 });
          await waitSaid(t, 'Okay, nothing sent to Chrome.', 'that nothing was sent');
          await t.page.waitForTimeout(3000);
          t.assert(kinds(peer, 'start').length === 1, `still one start (${kinds(peer, 'start').length})`);
          t.assert((await t.locator('voice-chrome-task-card').getAttribute('data-status')) === 'cancelled', 'the card says it wasn’t sent');
        });
        t.assert(t.requests('lead').length === 0, `no Claude request (${t.requests('lead').length})`);
      });
    },
  },

  {
    name: 'chrome-voice-context',
    title: '"Open YouTube in Chrome" opens it in the Jarvis window: within 2 minutes "add the cheapest one to the cart" is a task, "open the camera" is not (it goes on as usual)',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { peer } = await linkedVoiceMode(t, { queue: ['Open YouTube in Chrome.'] });
      await withPeer(peer, async () => {
        await t.step('opened in the Jarvis window: a Chrome context', async () => {
          const open = await peer.waitFor('open');
          t.assert(open.body.url === 'https://www.youtube.com/', `the address (${open.body.url})`);
          await t.waitFor(async () => (await saidLines(t)).length >= 1, { timeout: 10000, message: 'Jarvis to say it is open' });
        });
        await t.step('"add the cheapest one to the cart": a task (checked, then sent)', async () => {
          await hear(t, 'Add the cheapest one to the cart.');
          await waitSaid(t, 'Chrome, up to a dollar: add the cheapest one to the cart. Say cancel to stop.', 'the check');
          const start = await peer.waitFor('start');
          t.assert(start.body.text === 'add the cheapest one to the cart', `the words (${start.body.text})`);
          await waitSaid(t, 'Chrome is on it.', '"Chrome is on it."');
        });
        await t.step('"open the camera" in the Chrome context: not a task', async () => {
          const before = (await saidLines(t)).length;
          await hear(t, 'Open the camera.');
          await t.page.waitForTimeout(4000);
          const after = (await saidLines(t)).slice(before);
          t.assert(!after.some((l) => /Chrome, up to/.test(l)), `no Chrome check (${JSON.stringify(after)})`);
          t.assert(kinds(peer, 'start').length === 1, 'no second task');
          // It went on as usual: Optics' own "open the camera" (by voice on a Mac it asks for the tap the camera needs:
          // "Tap Look to turn the camera on.", or it opens), or a question for Jarvis.
          const optics = await t.page.locator(tid('optics')).count();
          const review = await t.page.locator(tid('voice-review')).isVisible().catch(() => false);
          const opticsLine = after.includes('Tap Look to turn the camera on.');
          t.assert(optics > 0 || opticsLine || review || t.requests('lead').length > 0, `the words went on as usual (Optics, or Jarvis): ${JSON.stringify(after)}`);
        });
      });
    },
  },

  {
    name: 'chrome-voice-approve',
    title: 'Chrome asks (a step allowed by voice): said and shown; "approve" → "Approving · say cancel" → one decision with the prompt\'s hash; answered: the card closes',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { peer } = await linkedVoiceMode(t);
      await withPeer(peer, async () => {
        await peer.task({ id: 'task-7', status: 'running', text: 'find a 4K monitor and add it to the cart', narration: 'On bestbuy.com.', costUsd: 0.05, limitUsd: 1 });
        const p = await peer.prompt(CART);
        await t.step('said from the extension\'s own line, with what to say; the card in Voice Mode', async () => {
          await waitSaid(t, 'Chrome asks: Add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com? Say approve, or cancel.', 'the prompt');
          t.assert(!(await saidLines(t)).some((l) => /jarvis for chrome/i.test(l)), 'never "Jarvis for Chrome"');
          const card = await t.visible('voice-chrome-prompt-card');
          t.assert((await card.getAttribute('data-voice')) === 'allowed', 'a yes by voice is allowed');
          t.assert(await card.locator(tid('voice-chrome-prompt-card-yes')).isVisible(), 'Approve on the card');
          await t.screenshot('1-asked');
        });
        await t.step('"approve": the check, then one decision bound to the hash', async () => {
          await hear(t, 'Approve.');
          await waitSaid(t, 'Approving. Say cancel to stop.', 'the check');
          t.assert(kinds(peer, 'answer').length === 0, 'nothing sent during the check');
          const a = await peer.waitFor('answer');
          t.assert(a.body.promptId === p.promptId && a.body.hash === p.hash, `the prompt and its hash (${JSON.stringify(a.body)})`);
          t.assert(a.body.choice === 'approve' && a.body.via === 'voice', `approve, by voice (${JSON.stringify(a.body)})`);
          await t.page.waitForTimeout(2500);
          t.assert(kinds(peer, 'answer').length === 1, 'exactly one decision');
        });
        await t.step('answered: the card says so and goes', async () => {
          await peer.promptClosed(p.promptId, 'voice');
          await t.waitFor(async () => (await t.page.locator(tid('voice-chrome-prompt-card')).count()) === 0, { timeout: 10000, message: 'the card to go' });
        });
        t.assert(t.requests('lead').length === 0, 'no Claude request');
      });
    },
  },

  {
    name: 'chrome-voice-misheard',
    title: 'A misheard yes approves nothing: "yes" alone answers nothing; "approve" with "no" as another reading is asked again; "cancel" during the check sends nothing',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { peer } = await linkedVoiceMode(t);
      await withPeer(peer, async () => {
        await peer.prompt(CART);
        await waitSaid(t, 'Chrome asks: Add the 27-inch 4K monitor', 'the prompt');
        await t.step('"yes" alone: nothing goes out; Jarvis says what to say', async () => {
          await hear(t, 'Yes.');
          await waitSaid(t, /^Say approve, or cancel\.$/, 'the hint');
          t.assert(kinds(peer, 'answer').length === 0, 'no decision');
        });
        await t.step('"approve" with "no" as another reading: asked again, nothing goes out', async () => {
          await hear(t, 'Approve.', { alts: ['No.'] });
          await waitSaid(t, /^I’m not sure I heard that right\. Chrome asks: Add the 27-inch/, 'the prompt again');
          t.assert(kinds(peer, 'answer').length === 0, 'no decision');
        });
        await t.step('"approve", then "cancel" during the check: nothing goes out', async () => {
          await hear(t, 'Approve.');
          await waitSaid(t, 'Approving. Say cancel to stop.', 'the check');
          await hear(t, 'Cancel.', { at: 250 });
          await waitSaid(t, 'Okay, not approved.', 'the check withdrawn');
          await t.page.waitForTimeout(3500);
          t.assert(kinds(peer, 'answer').length === 0, `no decision (${kinds(peer, 'answer').length})`);
        });
        t.assert(t.requests('lead').length === 0, 'no Claude request');
      });
    },
  },

  {
    name: 'chrome-voice-click-only',
    title: 'A purchase: no Approve by voice or on Jarvis\'s card; Jarvis and the card say it needs a click in the Jarvis window; "approve" sends nothing; "deny" goes out at once',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { peer } = await linkedVoiceMode(t);
      await withPeer(peer, async () => {
        const p = await peer.prompt(PURCHASE);
        await t.step('said: what it is and where to click; the card has no Approve', async () => {
          await waitSaid(t, 'Chrome asks: Place the order for $279.99 on bestbuy.com? That’s a purchase. It needs a click in the Jarvis window. Option-Shift-J opens its side panel.', 'the purchase prompt');
          const card = await t.visible('voice-chrome-prompt-card');
          t.assert((await card.getAttribute('data-voice')) === 'click', 'click only');
          t.assert(!(await card.locator(tid('voice-chrome-prompt-card-yes')).isVisible()), 'no Approve');
          t.assert(norm(await t.text(card.locator(tid('voice-chrome-prompt-card-click-only')))) === 'That’s a purchase. It needs a click in the Jarvis window. ⌥⇧J opens its side panel.', 'the card says the same');
          t.assert((await t.page.locator(tid('chrome-prompt-card')).count()) === 1, 'the card in the chat too');
          await t.screenshot('1-click-only');
        });
        await t.step('"approve": Jarvis says it needs a click; nothing goes out', async () => {
          const before = (await saidLines(t)).length;
          await hear(t, 'Approve.');
          await t.waitFor(async () => (await saidLines(t)).slice(before).some((l) => /^That’s a purchase\. It needs a click in the Jarvis window\./.test(l)), { timeout: 15000, message: 'the click line' });
          await t.page.waitForTimeout(1500);
          t.assert(kinds(peer, 'answer').length === 0, 'no decision');
        });
        await t.step('"deny": at once', async () => {
          await hear(t, 'Deny.');
          const a = await peer.waitFor('answer');
          t.assert(a.body.promptId === p.promptId && a.body.hash === p.hash && a.body.choice === 'cancel' && a.body.via === 'voice', `the no, bound (${JSON.stringify(a.body)})`);
        });
      });
    },
  },

  {
    name: 'chrome-voice-stack',
    title: 'An owner question that keeps (a tour decision\'s stand-in) and Chrome\'s question open together: neither expires the other; "continue" and "enclosed" answer the question, never the prompt; "approve" answers the prompt',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { page, peer } = await linkedVoiceMode(t, { dev: true });
      const ask = () =>
        page.evaluate(() => {
          window.__answers = window.__answers || [];
          return window.__jarvisChromeVoice.question({
            id: 'tour-choice',
            say: 'Do you want to see it enclosed, or opened?',
            keep: true,
            choices: [
              { id: 'enclosed', label: 'Enclosed', words: ['enclosed', 'closed'] },
              { id: 'opened', label: 'Opened', words: ['opened', 'open'] },
              { id: 'next', label: 'Continue', words: ['continue', 'next'] },
            ],
            onAnswer: (id) => window.__answers.push(id),
          });
        });
      const answers = () => page.evaluate(() => window.__answers || []);
      const QUESTION = 'Do you want to see it enclosed, or opened?';
      const asked = async () => (await saidLines(t)).filter((l) => l.includes(QUESTION)).length;
      /** Ask the stand-in's question (again), and wait until it has been said once more. */
      const askAndWait = async (what) => {
        const before = await asked();
        t.assert(await ask(), `the question is asked (${what})`);
        await t.waitFor(async () => (await asked()) > before, { timeout: 20000, message: `the question said (${what})` });
      };
      await withPeer(peer, async () => {
        const p = await peer.prompt(CART);
        await waitSaid(t, 'Chrome asks: Add the 27-inch 4K monitor', 'the prompt');
        await t.step('the question asked beside the prompt: "continue" is the question\'s, never the prompt\'s', async () => {
          await askAndWait('first');
          await hear(t, 'Continue.');
          await t.waitFor(async () => (await answers()).includes('next'), { timeout: 10000, message: async () => `the question to take "continue" (${JSON.stringify(await answers())})` });
          t.assert(kinds(peer, 'answer').length === 0, 'the prompt got nothing');
        });
        await t.step('asked again: "enclosed" answers the question', async () => {
          await askAndWait('again');
          await hear(t, 'Enclosed.');
          await t.waitFor(async () => (await answers()).includes('enclosed'), { timeout: 10000, message: 'the question to take "enclosed"' });
          t.assert(kinds(peer, 'answer').length === 0, 'the prompt got nothing');
        });
        await t.step('"approve" with the question asked last: the prompt (said again first if its 30 s are over), one decision with its hash', async () => {
          // (A tour's decision would go on talking after its answer; the stand-in asks again instead, so the
          // microphone is open, and the question is the one asked last.)
          await askAndWait('a third time');
          await hear(t, 'Approve.');
          await t.waitFor(async () => (await saidLines(t)).some((l) => l === 'Approving. Say cancel to stop.' || /^Let me ask again\./.test(l)), { timeout: 15000, message: 'the check, or the prompt again' });
          if (!(await saidLines(t)).includes('Approving. Say cancel to stop.')) {
            await hear(t, 'Approve.');
            await waitSaid(t, 'Approving. Say cancel to stop.', 'the check');
          }
          const a = await peer.waitFor('answer');
          t.assert(a.body.promptId === p.promptId && a.body.hash === p.hash && a.body.choice === 'approve', `the prompt's decision (${JSON.stringify(a.body)})`);
          t.assert(!(await answers()).includes('approve'), 'never the question');
        });
      });
    },
  },
  {
    name: 'chrome-voice-check-cut',
    title: 'REDTEAM-VOICE-1, MAC-1 (a voice at 12 characters a second): Stop while the check line is said, a tap on the core while it is said, and Stop during the countdown each withdraw it, said; nothing reaches Jarvis for Chrome. Control: said in full, it goes 2 s later',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 240000,
    async run(t) {
      const { peer } = await linkedVoiceMode(t, { queue: ['Find a 4K monitor under $300 and add it to the cart in Chrome.'], cps: 12 });
      await withPeer(peer, async () => {
        const withdrawnCount = async () => (await saidLines(t)).filter((l) => l === WITHDRAWN).length;
        await t.step('Stop (the dock\'s button) while the line is said: withdrawn at once, said', async () => {
          await waitSaid(t, TASK_LINE, 'the check line');
          await t.page.waitForTimeout(1500); // the line lasts about 8 s at 12 characters a second
          const line = await sayingOf(t, TASK_LINE);
          t.assert(line && !line.endAt, 'still being said');
          const btn = t.locator('voice-mic');
          t.assert((await btn.getAttribute('data-action')) === 'stop', `the button reads Stop (${await btn.getAttribute('data-action')})`);
          await btn.click();
          await t.waitFor(async () => (await withdrawnCount()) === 1, { timeout: 15000, message: async () => `the withdrawal said (said: ${JSON.stringify(await saidLines(t))})` });
          await t.page.waitForTimeout(4000);
          t.assert(kinds(peer, 'start').length === 0, `nothing sent (${kinds(peer, 'start').length})`);
          t.assert((await t.locator('voice-chrome-task-card').getAttribute('data-status')) === 'cancelled', 'the card says it wasn\'t sent');
          await t.screenshot('1-stopped-mid-line');
        });
        await t.step('a tap on the core while the line is said, then silence: withdrawn', async () => {
          await t.waitFor(async () => (await t.locator('voice-mode').getAttribute('data-state')) === 'listening', { timeout: 20000, message: 'listening again' });
          await hear(t, 'In Chrome, find a USB-C hub.');
          await waitSaid(t, HUB_LINE, 'the second check line');
          await t.page.waitForTimeout(1200);
          await t.locator('voice-core').click();
          await t.waitFor(async () => (await withdrawnCount()) === 2, { timeout: 15000, message: 'withdrawn' });
          await t.page.waitForTimeout(5000);
          t.assert(kinds(peer, 'start').length === 0, 'nothing sent');
        });
        await t.step('Stop during the countdown (the line said in full): withdrawn', async () => {
          await t.waitFor(async () => (await t.locator('voice-mode').getAttribute('data-state')) === 'listening', { timeout: 20000, message: 'listening again' });
          const before = (await saidLines(t)).filter((l) => l === HUB_LINE).length;
          await hear(t, 'In Chrome, find a USB-C hub.');
          await t.waitFor(async () => (await saidLines(t)).filter((l) => l === HUB_LINE).length > before, { timeout: 15000, message: 'the third check line' });
          await t.waitFor(async () => ((await sayingOf(t, HUB_LINE)) || {}).endAt > 0, { timeout: 20000, message: 'said in full' });
          await t.page.waitForTimeout(700);
          const btn = t.locator('voice-mic');
          t.assert((await btn.getAttribute('data-action')) === 'stop', 'the button reads Stop during the countdown');
          await btn.click();
          await t.waitFor(async () => (await withdrawnCount()) === 3, { timeout: 15000, message: 'withdrawn' });
          await t.page.waitForTimeout(4000);
          t.assert(kinds(peer, 'start').length === 0, 'nothing sent');
        });
        await t.step('control: the same task with nothing pressed goes 2 s after the line said in full', async () => {
          await t.waitFor(async () => (await t.locator('voice-mode').getAttribute('data-state')) === 'listening', { timeout: 20000, message: 'listening again' });
          const before = (await saidLines(t)).filter((l) => l === HUB_LINE).length;
          await hear(t, 'In Chrome, find a USB-C hub.');
          await t.waitFor(async () => (await saidLines(t)).filter((l) => l === HUB_LINE).length > before, { timeout: 15000, message: 'the check line' });
          const start = await peer.waitFor('start', { timeoutMs: 30000 });
          const line = await sayingOf(t, HUB_LINE);
          t.assert(line && line.endAt > 0, 'the start came after the line was said in full');
          t.assert(start.body.text === 'find a USB-C hub', `the words (${start.body.text})`);
          await waitSaid(t, 'Chrome is on it.', '"Chrome is on it."');
        });
        t.assert(t.requests('lead').length === 0, `no Claude request (${t.requests('lead').length})`);
      });
    },
  },

  {
    name: 'chrome-voice-approve-cut',
    title: 'REDTEAM-VOICE-1 (a voice at 12 characters a second): Stop pressed during "Approving. Say cancel to stop." approves nothing ("Okay, not approved."); the prompt stays open',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { peer } = await linkedVoiceMode(t, { cps: 12 });
      await withPeer(peer, async () => {
        await peer.task({ id: 'task-8', status: 'running', text: 'find a 4K monitor and add it to the cart', narration: 'On bestbuy.com.', costUsd: 0.05, limitUsd: 1 });
        await peer.prompt(CART);
        await waitSaid(t, 'Chrome asks: Add the 27-inch 4K monitor', 'the prompt');
        await t.waitFor(async () => (await t.locator('voice-mode').getAttribute('data-state')) === 'listening', { timeout: 30000, message: 'its answer listen' });
        await hear(t, 'Approve.');
        await waitSaid(t, 'Approving. Say cancel to stop.', 'the approval\'s check');
        await t.page.waitForTimeout(800); // mid-line
        t.assert(!((await sayingOf(t, 'Approving. Say cancel to stop.')) || {}).endAt, 'still being said');
        await t.locator('voice-mic').click();
        await waitSaid(t, 'Okay, not approved.', 'the withdrawal');
        await t.page.waitForTimeout(4000);
        t.assert(kinds(peer, 'answer').length === 0, `no decision (${JSON.stringify(kinds(peer, 'answer').map((m) => m.body))})`);
        t.assert((await t.page.locator(tid('voice-chrome-prompt-card')).count()) === 1, 'the prompt is still open');
        t.assert(t.requests('lead').length === 0, 'no Claude request');
      });
    },
  },

  {
    name: 'chrome-voice-pending',
    title: 'REDTEAM-VOICE-6 (a voice at 12 characters a second): Chrome\'s question arrives during a long line, then an owner question (a tour decision\'s stand-in) is asked before Jarvis is free: both are said, neither replaces the other',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { page, peer } = await linkedVoiceMode(t, { dev: true, cps: 12 });
      await withPeer(peer, async () => {
        await peer.task({ id: 'task-6', status: 'running', text: 'find a 4K monitor under $300 and add it to the cart', narration: 'Comparing three 27-inch monitors on bestbuy.com, then the reviews of the cheapest one.', costUsd: 0.04, limitUsd: 1 });
        await page.waitForTimeout(1500);
        await hear(t, 'What are you doing in Chrome?');
        await waitSaid(t, /^Chrome is working on: /, 'the long status line');
        await peer.prompt(CART);
        await page.waitForTimeout(1500); // the prompt is in, waiting for Jarvis to be free
        t.assert(!((await sayingOf(t, (await saidLines(t)).find((l) => l.startsWith('Chrome is working on: ')))) || {}).endAt, 'the status line is still being said');
        const asked = await page.evaluate(() =>
          window.__jarvisChromeVoice.question({
            id: 'tour-case',
            say: 'Shall I keep the case on, or take it off?',
            keep: true,
            choices: [
              { id: 'on', label: 'Keep it on', words: ['keep it on', 'on'] },
              { id: 'off', label: 'Take it off', words: ['take it off', 'off'] },
            ],
            onAnswer: () => {},
          }),
        );
        t.assert(asked, 'the owner question was asked');
        await waitSaid(t, 'Shall I keep the case on, or take it off?', 'the owner question', { timeout: 40000 });
        await waitSaid(t, /^Chrome asks: Add the 27-inch 4K monitor/, 'Chrome\'s question too', { timeout: 40000 });
        t.assert(kinds(peer, 'answer').length === 0, 'nothing answered');
      });
    },
  },

  {
    name: 'chrome-voice-homebase',
    title: 'VT-MISSED-1: hearing through the home base (Whisper: no live words), "Cancel." said during the task\'s countdown pauses it while the home base hears it, then withdraws it: nothing reaches Jarvis for Chrome, and "Cancel." is never a question for Claude',
    device: 'mac',
    seed: { settings: { homeBaseUrl: CORE_URL, homeBaseHear: true } },
    fakeCore: { senses: { hear: 'ready', speak: 'ready', hearQueue: ['Find a 4K monitor under $300 and add it to the cart in Chrome.', 'Cancel.'] } },
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { page, peer } = await linkedVoiceMode(t, { mic: true });
      await withPeer(peer, async () => {
        await t.visible('voice-homebase-mark', { timeout: 10000 });
        const speech = (seconds, seed) => Array.from(Sig.concat(Sig.silence(0.3), Sig.speechLike({ seconds, peakDb: -14, seed }), Sig.silence(1.6)));
        await page.evaluate((x) => window.__fakeMic.play(x), speech(2.2, 21));
        await waitSaid(t, TASK_LINE, 'the check line (heard through the home base)');
        // "Cancel." as soon as the countdown's listen is open (the 2 s run from the end of the line).
        const cancel = Array.from(Sig.concat(Sig.silence(0.15), Sig.speechLike({ seconds: 0.6, peakDb: -14, seed: 5 }), Sig.silence(1.6)));
        const timing = await page.evaluate(
          async ({ line, samples }) => {
            const n = (s) => String(s).replace(/\s+/g, ' ').trim();
            const until = (f) => new Promise((res) => { const tick = () => (f() ? res() : setTimeout(tick, 15)); tick(); });
            await until(() => window.__voice.log.some((l) => n(l.text) === line && l.endAt > 0));
            const end = [...window.__voice.log].reverse().find((l) => n(l.text) === line).endAt;
            await until(() => document.querySelector('[data-testid="voice-mode"]').getAttribute('data-state') === 'listening');
            const playAt = performance.now() - end;
            await window.__fakeMic.play(samples);
            return { playAt };
          },
          { line: TASK_LINE, samples: cancel },
        );
        t.note(`"Cancel." played ${Math.round(timing.playAt)} ms after the line ended`);
        await waitSaid(t, WITHDRAWN, 'the withdrawal', { timeout: 20000 });
        await page.waitForTimeout(3000);
        t.assert(kinds(peer, 'start').length === 0, `nothing sent to Jarvis for Chrome (${kinds(peer, 'start').length})`);
        t.assert(t.requests('lead').length === 0, `"Cancel." never became a Claude request (${t.requests('lead').length})`);
        t.assert(t.core.senses.hears.filter((h) => h.seconds > 0.5).length >= 2, 'both utterances went to the home base');
      });
    },
  },
  {
    name: 'chrome-voice-two-windows',
    title: 'REDTEAM-VOICE-7: two Jarvis windows, Voice Mode open in the second (the first holds the link): Chrome\'s question is said and shown there, "approve" there goes out with its hash, and a task said there is ended there; the first window shows the cards and stays quiet',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 240000,
    async run(t) {
      const a = await t.newPage();
      await seedChromeLink(a.context(), { key: CHROME_TEST_KEY });
      await a.addInitScript(installFakeSpeech, { noSpeechMs: 4000 });
      await a.addInitScript(() => {
        window.__voice.queue = [''];
      });
      await t.goto('/');
      const peer = createFakeChromePeer(t.core.relay, { autoTask: true }).start();
      await withPeer(peer, async () => {
        await t.waitFor(() => peer.received.some((m) => m.kind === 'hello'), { timeout: 15000, message: 'the first window\'s hello' });
        await a.waitForTimeout(1500);
        // The second window: the same profile (its storage, its locks, its channels), opened after the first.
        const b = await a.context().newPage();
        t.attachPageGuards(b);
        await b.addInitScript(installFakeSpeech, { noSpeechMs: 4000 });
        await b.addInitScript(() => {
          window.__voice.queue = [''];
        });
        await t.goto('/', { page: b });
        await (await t.visible('voice-open', { page: b })).click();
        await t.visible('voice-mode', { page: b });
        await b.waitForTimeout(1500);
        const saidIn = (page) => page.evaluate(() => window.__voice.said.map((x) => String(x).replace(/\s+/g, ' ').trim()));
        const hearIn = (page, text) => page.evaluate((x) => window.__voice.say({ parts: [{ at: 600, text: x, final: true }] }), text);
        await t.step('Chrome asks: said and shown in the window where Voice Mode is open', async () => {
          await peer.task({ id: 'task-2w', status: 'running', text: 'find a 4K monitor and add it to the cart', narration: 'On bestbuy.com.', costUsd: 0.05, limitUsd: 1 });
          const p = await peer.prompt(CART);
          await t.waitFor(async () => (await saidIn(b)).some((l) => l.startsWith('Chrome asks: Add the 27-inch 4K monitor')), { timeout: 20000, message: async () => `said in the second window (${JSON.stringify(await saidIn(b))})` });
          t.assert((await b.locator(tid('voice-chrome-prompt-card')).count()) === 1, 'its card in Voice Mode there');
          t.assert((await a.locator(tid('chrome-prompt-card')).count()) === 1, 'the first window shows the card in its chat');
          t.assert(!(await saidIn(a)).some((l) => l.startsWith('Chrome asks')), 'the first window says nothing');
          await t.screenshot('1-second-window', b);
          await t.waitFor(async () => (await b.locator(tid('voice-mode')).getAttribute('data-state')) === 'listening', { timeout: 20000, message: 'its answer listen' });
          await hearIn(b, 'Approve.');
          await t.waitFor(async () => (await saidIn(b)).includes('Approving. Say cancel to stop.'), { timeout: 15000, message: 'the approval\'s check' });
          const ans = await peer.waitFor('answer', { timeoutMs: 20000 });
          t.assert(ans.body.promptId === p.promptId && ans.body.hash === p.hash && ans.body.choice === 'approve', `the decision with its hash (${JSON.stringify(ans.body)})`);
          await peer.promptClosed(p.promptId, 'voice');
          await t.waitFor(async () => (await b.locator(tid('voice-chrome-prompt-card')).count()) === 0, { timeout: 15000, message: 'the card goes in the second window' });
        });
        await t.step('a task said in the second window ends there', async () => {
          await peer.done({ id: 'task-2w', status: 'done', answer: '' });
          await b.waitForTimeout(1500);
          await t.waitFor(async () => (await b.locator(tid('voice-mode')).getAttribute('data-state')) === 'listening', { timeout: 20000, message: 'listening' });
          await hearIn(b, 'In Chrome, find a USB-C hub.');
          const start = await peer.waitFor('start', { timeoutMs: 30000 });
          t.assert(start.body.text === 'find a USB-C hub', `the words (${start.body.text})`);
          await t.waitFor(async () => (await saidIn(b)).includes('Chrome is on it.'), { timeout: 15000, message: '"Chrome is on it." there' });
          await peer.done({ status: 'done', answer: 'The Anker 7-in-1 hub is $34.99.' }); // (the task it runs now)
          await t.waitFor(async () => (await saidIn(b)).some((l) => l === 'Chrome is done. The Anker 7-in-1 hub is $34.99.'), { timeout: 20000, message: async () => `the end said in the second window (${JSON.stringify(await saidIn(b))})` });
          await t.waitFor(async () => (await b.locator(tid('voice-chrome-task-card')).getAttribute('data-status')) === 'done', { timeout: 10000, message: 'its card says done' });
          t.assert(!(await saidIn(a)).some((l) => l.startsWith('Chrome is done')), 'the first window says nothing');
        });
        t.assert(t.requests('lead').length === 0, `no Claude request (${t.requests('lead').length})`);
      });
    },
  },

  {
    name: 'chrome-voice-mic-off',
    title: 'REDTEAM-VOICE-11, PRIVACY-1: Continuous off: Chrome\'s question is said with "Tap me to answer." and opens no microphone; after a tap, "approve" counts and goes out with its hash',
    device: 'mac',
    seed: { settings: { homeBaseUrl: CORE_URL, voiceContinuous: false } },
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    async run(t) {
      const { page, peer } = await linkedVoiceMode(t);
      await withPeer(peer, async () => {
        // The opening listen (a tap's) hears nobody; Continuous off, he waits for a tap.
        await t.waitFor(async () => (await t.locator('voice-mode').getAttribute('data-state')) !== 'listening', { timeout: 30000, message: 'idle' });
        await page.waitForTimeout(1000);
        const listens = await page.evaluate(() => window.__voice.listens);
        await peer.task({ id: 'task-m', status: 'running', text: 'find a 4K monitor and add it to the cart', narration: 'On bestbuy.com.', costUsd: 0.05, limitUsd: 1 });
        const p = await peer.prompt(CART);
        await waitSaid(t, 'Chrome asks: Add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com? Say approve, or cancel. Tap me to answer.', 'the prompt with "Tap me to answer."');
        // Nothing listens after it (so room talk can't become a Claude question).
        await page.waitForTimeout(6000);
        t.assert((await page.evaluate(() => window.__voice.listens)) === listens, `no listen opened by the extension (${(await page.evaluate(() => window.__voice.listens)) - listens})`);
        t.assert((await t.locator('voice-mode').getAttribute('data-state')) !== 'listening', 'not listening');
        // The owner taps and says "approve".
        await t.locator('voice-core').click();
        await hear(t, 'Approve.', { at: 1200 });
        await waitSaid(t, 'Approving. Say cancel to stop.', 'the approval\'s check (the 30 s counted from the tap)');
        const ans = await peer.waitFor('answer', { timeoutMs: 20000 });
        t.assert(ans.body.promptId === p.promptId && ans.body.hash === p.hash && ans.body.choice === 'approve', `one decision with its hash (${JSON.stringify(ans.body)})`);
      });
    },
  },

  {
    name: 'chrome-voice-stop-quiet',
    title: 'CHROME-VOICE-R2-2: Stop pressed while "Chrome asks: …" is said leaves Jarvis quiet (it isn\'t said again by itself); the question stays on its card',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    run: stopLeavesQuiet,
  },

  {
    name: 'chrome-voice-stop-quiet-off',
    title: 'CHROME-VOICE-R2-2, Continuous off: Stop pressed while "Chrome asks: …" is said leaves Jarvis quiet; the question stays on its card',
    device: 'mac',
    seed: { settings: { homeBaseUrl: CORE_URL, voiceContinuous: false } },
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 180000,
    run: stopLeavesQuiet,
  },

  {
    name: 'chrome-voice-bargein-stop',
    title: 'CHROME-VOICE-R2-1: woken by "Hey Jarvis", George says Chrome\'s question; "Hey Jarvis" over it, then "Stop.": the barge-in\'s listen hears the words, the waiting task stops, and the question isn\'t said again over them',
    device: 'mac',
    fakeMusic: true,
    fakeCore: { senses: { speak: 'ready' } },
    allowConsole: NETWORK_NOISE,
    timeout: 240000,
    async run(t) {
      const page = await t.newPage({ device: 'mac', settings: { ...GEORGE, ...BARGE_IN, wakeWord: true } });
      await seedChromeLink(page.context(), { key: CHROME_TEST_KEY });
      await page.addInitScript(installFakeSpeech, {});
      await page.addInitScript(installFakeMic, { wakeLock: true });
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await page.addInitScript(
        ({ test }) => {
          localStorage.setItem('jarvis.handsFreeTest.v1', test);
          localStorage.setItem('jarvis.dev.wakeWord', 'stub');
        },
        { test: TEST_PASSED },
      );
      await t.goto('/', { page });
      const peer = createFakeChromePeer(t.core.relay, { autoTask: true }).start();
      await withPeer(peer, async () => {
        await t.waitFor(() => peer.received.some((m) => m.kind === 'hello'), { timeout: 15000, message: 'the app’s hello' });
        await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'George ready' });
        await page.waitForTimeout(1500);
        await (await t.visible('quick-key-standby')).click();
        await t.waitFor(async () => (await page.evaluate(() => document.querySelector('[data-testid="standby"]')?.dataset.word)) === 'ready', { timeout: 15000, message: 'the wake word stand-in ready' });
        // The wake window hears nobody; the offer's listen hears a question (the routine steps aside: a Claude turn).
        await page.evaluate(() => window.__voice.queue.push('', 'What is the capital of France?'));
        t.assert(await page.evaluate(() => window.__jarvisWake.say()), 'woken by the stand-in');
        await page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
        await t.waitFor(() => t.core.senses.speaks.some((x) => /Paris/.test(x.text)), { timeout: 30000, message: () => `the answer (speaks: ${JSON.stringify(t.core.senses.speaks.map((x) => x.text))})` });
        await t.waitFor(async () => ['listening', 'idle'].includes(await page.evaluate(() => document.querySelector('[data-testid="voice-mode"]')?.getAttribute('data-state'))), { timeout: 30000, message: 'the answer said' });
        // A task waits on a click-only question; George says it.
        await peer.task({ id: 'task-1', status: 'running', text: 'find a 4K monitor and add it to the cart', costUsd: 0.05, limitUsd: 1 });
        await peer.prompt(PURCHASE);
        const asked = () => t.core.senses.speaks.filter((x) => /Chrome asks/.test(x.text)).length;
        await t.waitFor(() => asked() >= 1, { timeout: 30000, message: () => `George to say Chrome's question (speaks: ${JSON.stringify(t.core.senses.speaks.map((x) => x.text))})` });
        await page.waitForTimeout(1600); // past the wake's 1.5 s guard, George mid-question
        await page.evaluate(() => window.__voice.queue.push('Stop.'));
        t.assert(await page.evaluate(() => window.__jarvisWake.say()), 'the stand-in heard "Hey Jarvis" over George');
        await t.waitFor(() => kinds(peer, 'stop').length >= 1, { timeout: 15000, message: () => `the owner's "Stop." to reach Jarvis for Chrome (George: ${JSON.stringify(t.core.senses.speaks.map((x) => x.text).slice(-6))})` });
        await page.waitForTimeout(4000);
        const speaks = t.core.senses.speaks.map((x) => x.text);
        t.note(`stops ${kinds(peer, 'stop').length}; George: ${JSON.stringify(speaks.slice(-6))}`);
        await t.screenshot('after-bargein');
        t.assert(asked() === 1, `the question isn't said again over the owner's words ("Chrome asks" said ${asked()} times; George: ${JSON.stringify(speaks.slice(-6))})`);
      });
    },
  },
];
