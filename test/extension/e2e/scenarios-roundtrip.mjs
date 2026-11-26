// chrome-relay-roundtrip (v8.1, Track 6): both ends of the link in one Chromium, linked with a test
// key, with nothing faked between them but the network:
//
//   Jarvis's end      the app's own src/platform/chrome-link.js (app.chromeLink, contract (f)) and
//                     src/lib/relay-envelope.js, loaded as the browser loads them, in a page at
//                     http://app.localhost; it reaches its home base at https://alienware.tail4e5f6a.ts.net
//                     (answered through context.route, as the app's E2E does)
//   the home base     the Core's own relay store (core/server/http/relay-routes.mjs), through the
//                     app E2E's fake Core (test/e2e/core-fakes.mjs: answerRelay, fakeRelay)
//   Jarvis for Chrome the real unpacked extension (development build), reaching the same relay at
//                     this test server's /api/relay/*, with the mock Claude API and the test shop
//
// open → a task → a voice approval → done. Voice approvals aren't available in a release yet: the
// development build turns them on here (jarvis.dev.voiceApprovals), as relay-approve-voice does.
//
// Not in the default run (it needs Jarvis's chrome-link from chrome-relay); the integrator runs it:
//   flock /tmp/jarvis-scratch/live/browser.lock node test/extension/e2e/run.mjs --only chrome-relay-roundtrip

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, tid, waitFor } from './harness.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Jarvis's end: the app's own chrome-link module in a page, its events kept for the test. */
const PAGE = (homeBase) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Jarvis (round trip)</title></head>
<body><h1>Jarvis</h1><pre id="state">starting</pre>
<script type="module">
  import { createChromeLink } from '/src/platform/chrome-link.js';
  const link = createChromeLink({ getHomeBase: () => ${JSON.stringify(homeBase)}, version: '8.1-roundtrip' });
  window.chromeLink = link.api;
  window.events = { prompts: [], closed: [], done: [] };
  link.api.onPrompt((p) => window.events.prompts.push(p));
  link.api.onPromptClosed((id, info) => window.events.closed.push({ id, ...(info || {}) }));
  link.api.onDone((d) => window.events.done.push(d));
  const show = () => (document.getElementById('state').textContent = JSON.stringify(link.api.state(), null, 1));
  link.api.subscribe(show);
  show();
</script></body></html>`;

const roundtrip = {
  name: 'chrome-relay-roundtrip',
  title: 'one Chromium: Jarvis’s chrome-link, the Core’s relay store and the real extension, one test key: open → task → a voice approval → done',
  optIn: true,
  start: { always: ['shop.localhost'], approveSteps: false },
  async run(run) {
    const fakes = path.join(REPO, 'test/e2e/core-fakes.mjs');
    assert(existsSync(path.join(REPO, 'src/platform/chrome-link.js')) && existsSync(fakes), 'Jarvis’s chrome-link and the fake Core are in this tree (merge v81-chrome-relay)');
    const { CHROME_TEST_KEY, CORE_ORIGIN, CORE_URL, answerRelay, chromeLinkRecord, fakeRelay } = await import(fakes);
    const { mock, sites } = run.server;

    // One home base relay: the Core's own store, for both ends.
    const relay = fakeRelay();
    const answer = async ({ method, url, body, contentType }) => answerRelay(relay, { method, pathname: url.pathname, search: url.search, body: body || '', contentType: contentType || '' });
    run.server.useRelay(async (req, res, bodyText) => {
      const out = await answer({ method: req.method, url: new URL(req.url, 'http://127.0.0.1'), body: bodyText, contentType: req.headers['content-type'] });
      if (!out) return req.socket.destroy();
      res.writeHead(out.status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(out.body));
    });
    await run.context.route(`${CORE_ORIGIN}/api/relay/**`, async (route) => {
      const req = route.request();
      const origin = req.headers().origin;
      const cors = origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
      try {
        if (req.method() === 'OPTIONS') return await route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' } });
        const out = await answer({ method: req.method(), url: new URL(req.url()), body: req.postData(), contentType: req.headers()['content-type'] });
        if (!out) return await route.abort('internetdisconnected');
        return await route.fulfill({ status: out.status, contentType: 'application/json; charset=utf-8', headers: { ...cors, 'cache-control': 'no-store' }, body: JSON.stringify(out.body) });
      } catch {
        /* the page or the browser went while a long poll waited */
      }
    });

    // The test key on both sides: the extension's chromeLink, Jarvis's jarvis.chromeLink.v1.
    await run.sw.evaluate(
      ({ core, key }) =>
        chrome.storage.local.set({
          'jarvis.voice': { tasksFromJarvis: true, approvals: true },
          'jarvis.dev.voiceApprovals': true,
          chromeLink: { v: 1, core, key, linkedAt: Date.now() },
        }),
      { core: run.server.apiBase, key: CHROME_TEST_KEY },
    );
    const appUrl = run.server.serveApp(PAGE(CORE_URL));
    const record = JSON.stringify(chromeLinkRecord({ key: CHROME_TEST_KEY }));
    await run.context.addInitScript(
      ({ origin, record }) => {
        if (location.origin === origin && !localStorage.getItem('jarvis.chromeLink.v1')) localStorage.setItem('jarvis.chromeLink.v1', record);
      },
      { origin: new URL(appUrl).origin, record },
    );
    const app = await run.context.newPage();
    run.watchPage(app, 'panel');
    await app.goto(appUrl);
    const state = () => app.evaluate(() => window.chromeLink?.state());
    await waitFor(async () => (await state())?.online === true, { timeout: 30000, message: async () => `Jarvis sees Jarvis for Chrome online (${JSON.stringify(await state())})` });
    assert((await state()).voiceApprovals === true, 'the status says voice approvals are on');

    // open: the page opens in the Jarvis window, no debugger.
    const product = run.server.siteUrl('shop', '/product/dell-s2721qs');
    const opened = await app.evaluate((url) => window.chromeLink.open(url, { rect: null, focus: true }), product);
    assert(opened.ok === true && opened.site === 'shop.localhost', `opened (${JSON.stringify(opened)})`);
    await waitFor(async () => (await run.sw.evaluate(async (u) => (await chrome.tabs.query({})).some((t) => (t.pendingUrl || t.url) === u), product)), { message: 'the tab' });
    assert((await run.attachedTabs()).length === 0, 'no debugger on it');

    // A task from Jarvis: it reaches an everyday step on shop.localhost (set to Always).
    mock.script([
      () => ({ calls: [{ name: 'read_page', input: { filter: 'interactive' } }] }),
      (ctx) => ({ calls: [{ name: 'left_click', input: { target: { type: 'ref', ref: ctx.ref(/button "Add to cart"/) } } }] }),
      (ctx) => ({ answer: ctx.results[0]?.isError ? 'It was not done.' : 'I added the Dell S2721QS to your cart.' }),
    ]);
    const started = await app.evaluate(() => window.chromeLink.startTask({ text: 'Add the Dell monitor to the cart', chat: 'new' }));
    assert(started.ok === true && /^task_/.test(started.id), `started (${JSON.stringify(started)})`);
    const prompt = await waitFor(() => app.evaluate(() => window.events.prompts.find((p) => p.kind === 'confirm')), { timeout: 30000, message: 'the step’s question at Jarvis' });
    assert(prompt.category === 'change' && prompt.consequential === false && prompt.voice.allowed === true, JSON.stringify(prompt));
    assert(prompt.spoken === 'Jarvis for Chrome wants to click on shop.localhost. The button says “Add to cart”.', prompt.spoken);
    await run.lastCard().locator(tid('prompt')).waitFor();
    assert(await run.lastCard().locator(tid('task-from')).isVisible(), 'marked From Jarvis (voice)');

    // A voice approval, as Jarvis sends it once the owner said "approve".
    await sleep(1600);
    const yes = await app.evaluate((p) => window.chromeLink.answer({ promptId: p.promptId, hash: p.hash, choice: 'approve', via: 'voice' }), prompt);
    assert(yes.ok === true, `approved (${JSON.stringify(yes)})`);
    const done = await waitFor(() => app.evaluate(() => window.events.done[0]), { timeout: 30000, message: 'done at Jarvis' });
    assert(done.id === started.id && done.status === 'done' && /added the Dell/.test(done.answer), JSON.stringify(done));
    assert(sites.state.cart.length === 1 && sites.state.cart[0] === 'dell-s2721qs', `in the cart (${JSON.stringify(sites.state.cart)})`);
    const closed = await app.evaluate(() => window.events.closed);
    assert(closed.some((c) => c.id === prompt.promptId), `prompt-closed reached Jarvis (${JSON.stringify(closed)})`);
    const steps = await run.steps();
    assert(steps.some((s) => s.label === 'Approved by voice from Jarvis: “Approve” (page step on shop.localhost).'), steps.map((s) => s.label).join(' | '));
    await run.shot('panel');
    await run.shot('jarvis', app);
  },
};

export const ROUNDTRIP_SCENARIOS = [roundtrip];
