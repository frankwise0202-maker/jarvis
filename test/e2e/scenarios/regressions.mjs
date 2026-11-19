// Final-review regressions: a suggestion's mode applies to that run only; Stop after part of the
// answer is on screen keeps the exchange (and Voice Mode never withdraws a spoken question); the
// swarm team size is for one message; leaving Voice Mode never stops a running reply; a window
// that closes mid-run frees the conversation for the other window at once.

import { ACTIVE_AGENT_STATUSES, tid } from '../harness.mjs';
import { turnContextOf } from '../../mock/content.mjs';
import { installFakeSpeech } from './features.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The <turn_context> of the newest owner message in the latest lead request. */
function lastTurnContext(t) {
  const messages = t.requests('lead').at(-1)?.body?.messages || [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const ctx = turnContextOf(messages[i]);
    if (messages[i].role === 'user' && ctx.present) {
      const raw = messages[i].content.find((b) => b.type === 'text' && /<turn_context>/.test(b.text))?.text || '';
      return { ...ctx, raw };
    }
  }
  return { present: false, mode: '', raw: '' };
}

async function waitForNewTurn(t, before, page = t.page) {
  await t.waitFor(async () => (await t.count('turn-jarvis', undefined, page)) > before, { timeout: 10000, message: 'a new Jarvis turn' });
  return page.locator(tid('turn-jarvis')).nth(before);
}

const pressed = (t, mode, page = t.page) => page.locator(tid(`mode-${mode}`)).getAttribute('aria-pressed');
const userTexts = (m) => (Array.isArray(m.content) ? m.content : []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

export default [
  {
    name: 'suggestion-mode',
    title: 'A home-screen suggestion runs in its own mode once; the composer, follow-up chips and typed messages keep the owner\'s mode',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const swarm = await t.visible('suggestion', { attrs: { 'data-mode': 'swarm' }, message: 'The home screen offers a Swarm suggestion' });
      await swarm.click();
      const first = await waitForNewTurn(t, 0);
      t.assert((await pressed(t, 'auto')) === 'true', `The composer keeps Auto after a Swarm suggestion (mode-swarm aria-pressed=${await pressed(t, 'swarm')})`);
      await t.waitForTurn(first, ['done']);
      t.assert(lastTurnContext(t).mode === 'swarm', `The suggestion itself runs in Swarm mode (got "${lastTurnContext(t).mode}")`);
      t.assert(/swarm/i.test(await t.text(t.page.locator(tid('turn-user')).first().locator('.turn-mode'))), 'Its message is tagged Swarm');
      t.assert((await pressed(t, 'auto')) === 'true', 'The composer still shows Auto once the suggestion has run');

      await t.step('a follow-up chip goes out in the owner\'s mode', async () => {
        const chip = first.locator(tid('followup')).first();
        await chip.waitFor({ state: 'visible', timeout: 15000 });
        await chip.click();
        const next = await waitForNewTurn(t, 1);
        await t.waitForTurn(next, ['done']);
        t.assert(lastTurnContext(t).mode === 'auto', `The follow-up chip runs in Auto, not the suggestion's Swarm (got "${lastTurnContext(t).mode}")`);
      });

      await t.step('a typed message goes out in the owner\'s mode', async () => {
        const typed = await t.send('Thanks! Which one is cheapest?');
        await t.waitForTurn(typed, ['done']);
        t.assert(lastTurnContext(t).mode === 'auto', `A typed message runs in Auto (got "${lastTurnContext(t).mode}")`);
      });
      await t.screenshot('1-after-suggestion');
    },
  },

  {
    name: 'stop-mid-answer',
    title: 'Stop while the answer streams keeps the question and the partial answer in the conversation (no "back in the box"); the next message has its context',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.waitForTurn(await t.send('What is the capital of France?'), ['done']);
      const turn = await t.send('[[slow]] [[long]] Explain the history of the Roman Empire in detail');
      const answer = turn.locator(tid('segment-text')).first();
      await t.waitFor(async () => ((await answer.textContent().catch(() => '')) || '').length > 300, { timeout: 45000, message: 'more than 300 characters of the answer on screen' });
      await t.page.locator(tid('composer-stop')).click();
      await t.waitForTurn(turn, ['stopped'], { timeout: 15000 });
      const shown = await t.text(answer);
      t.assert(shown.length > 300, 'The partial answer stays on screen');
      await sleep(600);
      t.assert((await t.page.locator(tid('toast')).filter({ hasText: 'back in the box' }).count()) === 0, 'No "Stopped before Jarvis replied" toast once part of the answer was shown');
      t.assert((await t.page.locator(tid('composer-input')).inputValue()) === '', 'The question is not put back in the message box');
      await t.screenshot('1-stopped');

      const next = await t.send('Summarize what you just told me in one sentence');
      await t.waitForTurn(next, ['done']);
      const messages = t.requests('lead').at(-1).body.messages;
      t.assert(messages.map((m) => m.role).join(',') === 'user,assistant,user,assistant,user', `The next request keeps the stopped exchange (roles: ${messages.map((m) => m.role).join(',')})`);
      t.assert(/Roman Empire/.test(userTexts(messages[2])), 'The stopped question is still in the history');
      const partial = messages[3].content;
      t.assert(partial.length === 1 && partial[0].type === 'text' && partial[0].text.length > 100, 'The answer shown so far follows it as a text-only assistant message');
      t.assertAppendOnly();
    },
  },

  {
    name: 'swarm-size-once',
    title: 'The swarm team size applies to one message: the next one uses the default again; a withdrawn message gets its size back',
    device: 'desktop',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.selectMode('swarm');
      const chip = await t.visible('swarm-size');
      const pick = async (n) => {
        await chip.click();
        await (await t.visible(`swarm-size-${n}`)).click();
        t.assert((await chip.getAttribute('data-value')) === String(n), `The chip shows ${n}`);
      };
      await pick(20);
      const first = await t.send('[[swarm:2]] Compare two standing desks');
      t.assert((await chip.getAttribute('data-value')) === '8', `Right after sending, the team size is back to the default 8 (got ${await chip.getAttribute('data-value')})`);
      await t.waitForTurn(first, ['done'], { timeout: 90000 });
      t.assert(/^Agent limits: up to 20 agents per wave/m.test(lastTurnContext(t).raw), 'That message ran with the 20 agents picked for it');

      const second = await t.send('[[swarm:2]] And two office chairs');
      await t.waitForTurn(second, ['done'], { timeout: 90000 });
      t.assert(/^Agent limits: up to 8 agents per wave/m.test(lastTurnContext(t).raw), `The next swarm message uses the default 8 (got "${(lastTurnContext(t).raw.match(/Agent limits:[^\n]*/) || [''])[0]}")`);

      await t.step('Stop before any reply: the message comes back with its team size', async () => {
        await pick(15);
        const before = await t.count('turn-jarvis');
        await t.page.locator(tid('composer-input')).fill('[[slow]] Which desk is quieter?');
        await t.page.locator(tid('composer-send')).click();
        const turn = await waitForNewTurn(t, before);
        await t.waitFor(async () => !(await t.page.locator(tid('composer-stop')).getAttribute('class')).includes('is-arming'), { timeout: 3000, message: 'Stop to arm' });
        await t.page.locator(tid('composer-stop')).click();
        await t.waitForTurn(turn, ['stopped'], { timeout: 15000 });
        await t.waitFor(async () => (await t.page.locator(tid('composer-input')).inputValue()) === '[[slow]] Which desk is quieter?', { timeout: 5000, message: 'the withdrawn message back in the box' });
        t.assert((await chip.getAttribute('data-value')) === '15', `The team size picked for it comes back too (got ${await chip.getAttribute('data-value')})`);
        await t.page.locator(tid('composer-send')).click();
        const again = await waitForNewTurn(t, before + 1);
        await t.waitForTurn(again, ['done'], { timeout: 60000 });
        t.assert(/^Agent limits: up to 15 agents per wave/m.test(lastTurnContext(t).raw), 'Sent again, it runs with 15');
      });
    },
  },

  {
    name: 'voice-exit-keeps-run',
    title: 'Voice Mode: Exit leaves a running swarm going in the chat; a spoken question that is interrupted stays in the conversation',
    device: 'iphone13',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['[[swarm:3]] [[slow]] Research tidal power'];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      const turn = await waitForNewTurn(t, 0);
      const card = turn.locator(tid('mission-card')).first();
      await card.waitFor({ state: 'attached', timeout: 30000 });
      await t.waitFor(async () => (await card.locator(tid('agent-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).some((s) => ACTIVE_AGENT_STATUSES.includes(s)), { timeout: 45000, message: 'an agent at work' });
      await t.screenshot('1-voice-working');

      await t.step('Exit while the agents work: the mission carries on in the chat', async () => {
        await (await t.visible('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
        await t.visible('composer-stop', { message: 'The chat shows the reply still running (Stop)' });
        await t.waitForTurn(turn, ['done'], { timeout: 90000 });
        t.assert((await card.getAttribute('data-status')) === 'done', `The mission finished (got ${await card.getAttribute('data-status')})`);
        await t.screenshot('2-done-after-exit');
      });

      await t.step('an interrupted spoken question stays in the conversation', async () => {
        await t.page.evaluate(() => {
          window.__voice.queue.push('[[slow]] What is the capital of Spain?', 'And what about Germany?');
        });
        await (await t.visible('voice-open')).click();
        const vm = await t.visible('voice-mode');
        const asked = await waitForNewTurn(t, 1);
        await (await t.visible('voice-core')).click(); // tap the core while Jarvis thinks: stop
        await t.waitForTurn(asked, ['stopped'], { timeout: 15000 });
        await t.waitFor(async () => !['thinking', 'working'].includes(await vm.getAttribute('data-state')), { timeout: 5000, message: 'Voice Mode to stop working' });
        await (await t.visible('voice-core')).click(); // listen again
        const next = await waitForNewTurn(t, 2);
        await t.waitForTurn(next, ['done']);
        const messages = t.requests('lead').at(-1).body.messages;
        t.assert(messages.some((m) => m.role === 'user' && /capital of Spain/.test(userTexts(m))), 'The interrupted question is still in the history for the next one');
        await (await t.visible('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
        t.assert((await t.page.locator(tid('composer-input')).inputValue()) === '', 'Nothing was put in the hidden message box');
        t.assert((await t.page.locator(tid('toast')).filter({ hasText: 'back in the box' }).count()) === 0, 'No "back in the box" toast');
      });
    },
  },

  {
    name: 'voice-close-home',
    title: 'Closing Voice Mode from the home screen leaves the greeting and core in view (no scroll to the bottom)',
    device: 'iphone13',
    timeout: 60000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = []; // nothing is said
      });
      await t.goto('/');
      await t.visible('empty-state');
      const scrollable = await t.page.evaluate(() => {
        const sc = document.querySelector('.chat-scroll');
        return sc.scrollHeight > sc.clientHeight + 40;
      });
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await (await t.visible('voice-close')).click();
      await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
      await sleep(300);
      const r = await t.page.evaluate(() => {
        const g = document.querySelector('.greeting').getBoundingClientRect();
        return { scrollTop: document.querySelector('.chat-scroll').scrollTop, top: Math.round(g.top), bottom: Math.round(g.bottom), height: window.innerHeight };
      });
      t.assert(r.scrollTop === 0, `The home screen is not scrolled (scrollTop ${r.scrollTop}${scrollable ? '' : '; it fits without scrolling here'})`);
      t.assert(r.top >= 0 && r.bottom <= r.height, `The greeting stays in view (top ${r.top}px, bottom ${r.bottom}px)`);
      await t.screenshot('1-home-after-voice');
    },
  },

  {
    name: 'two-windows-close',
    title: 'Two windows: the other one shows a run as it starts; when the running window closes, Resume appears at once and a new message there is kept',
    device: 'desktop',
    timeout: 150000,
    async run(t) {
      const a = await t.newPage();
      await t.goto('/');
      await t.waitForTurn(await t.send('What is the capital of France?'), ['done']);
      await sleep(1200); // the finished turn is saved

      const b = await a.context().newPage(); // same profile: shared storage, like a second tab
      t.attachPageGuards(b);
      await t.goto('/', { page: b });
      await b.locator(tid('turn-jarvis')).first().waitFor({ state: 'visible', timeout: 10000 }); // reopened the same conversation

      const turn = await t.send('[[swarm:2]] [[slow]] Research tidal power');
      await t.visible('running-elsewhere', { page: b, timeout: 8000, message: 'The other window shows the run as soon as it starts' });
      const card = turn.locator(tid('mission-card')).first();
      await card.waitFor({ state: 'visible', timeout: 30000 });
      await t.waitFor(async () => (await card.locator(tid('agent-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).some((s) => ACTIVE_AGENT_STATUSES.includes(s)), { timeout: 45000, message: 'an agent at work' });
      await sleep(1500); // a throttled save has written the running state

      await t.step('the running window closes (Leave on the "leave site?" prompt)', async () => {
        a.removeAllListeners('dialog');
        a.on('dialog', (d) => d.accept().catch(() => {}));
        await a.close({ runBeforeUnload: true });
        await t.waitFor(() => a.isClosed(), { timeout: 10000, message: 'the first window to close' });
        await t.visible('resume-button', { page: b, timeout: 8000, message: 'The other window offers Resume within seconds, not after a 30 s timeout' });
        t.assert((await b.locator(tid('running-elsewhere')).count()) === 0, 'No "Running in another window" card any more');
        await t.screenshot('1-resume-offered', b);
      });

      await t.step('a new message in the remaining window is saved', async () => {
        const before = await b.locator(tid('turn-jarvis')).count();
        await b.locator(tid('composer-input')).fill('Hello again');
        await b.locator(tid('composer-send')).click();
        await t.waitForTurn(b.locator(tid('turn-jarvis')).nth(before), ['done'], { timeout: 30000 });
        t.assert((await b.locator(tid('toast')).filter({ hasText: 'another window' }).count()) === 0, 'No conflict with the closed window');
        await sleep(1200);
        await t.reload(b);
        const users = await b.locator(tid('turn-user')).allTextContents();
        t.assert(users.some((x) => /Hello again/.test(x)), `"Hello again" survives a reload (user messages: ${users.map((x) => x.trim().slice(0, 30)).join(' | ')})`);
      });
    },
  },
];
