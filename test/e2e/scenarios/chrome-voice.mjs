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

import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';
import { CORE_URL, createFakeChromePeer, seedChromeLink, CHROME_TEST_KEY } from '../core-fakes.mjs';

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

/** A Mac with Jarvis for Chrome linked (the fake extension online), the fake recognizer and voice, Voice Mode open. */
async function linkedVoiceMode(t, { queue = [''], dev = false } = {}) {
  const page = await t.newPage();
  await seedChromeLink(page.context(), { key: CHROME_TEST_KEY });
  await page.addInitScript(installFakeSpeech, { noSpeechMs: 4000 });
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

async function withPeer(peer, fn) {
  try {
    await fn();
  } finally {
    await peer.stop();
  }
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
          // It went on as usual: Optics' own "open the camera" took it (E2). v8.1 (changed on purpose, ROUTING-14): with
          // the camera not allowed yet, as in this harness, E2's line is "Tap Look to turn the camera on." (Optics opens
          // with that tap); with it allowed, Optics opens. Never a question for Jarvis, never a Chrome task.
          const optics = await t.page.locator(tid('optics')).count();
          const tapLook = after.includes('Tap Look to turn the camera on.');
          t.assert(optics > 0 || tapLook, `the words went on as usual: Optics, or E2's "Tap Look" (said: ${JSON.stringify(after)})`);
          t.assert(t.requests('lead').length === 0, `no question for Jarvis (${t.requests('lead').length} requests)`);
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
];
