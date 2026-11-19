// Swarm scenarios: a 6-agent mission end to end, Stop mid-swarm, a rate-limited swarm, and
// dropped worker streams followed by Resume.

import { ACTIVE_AGENT_STATUSES, tid } from '../harness.mjs';
import { canonicalJson } from '../../mock/util.mjs';
import { openMissionControl } from './chat.mjs';

const chipStatuses = (card) => card.locator(tid('agent-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
const chipCodenames = (card) => card.locator(tid('agent-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-codename')));

async function waitForAgents(t, card, count, { timeout = 30000 } = {}) {
  await t.waitFor(async () => (await card.locator(tid('agent-chip')).count()) === count, { timeout, message: `${count} agent chips in the mission card` });
}

async function waitAllAgents(t, card, status, { timeout = 60000 } = {}) {
  await t.waitFor(async () => {
    const s = await chipStatuses(card);
    return s.length > 0 && s.every((x) => x === status);
  }, { timeout, message: `every agent chip to reach data-status="${status}" (now: ${(await chipStatuses(card).catch(() => [])).join(', ')})` });
}

async function waitSomeActive(t, card, { timeout = 30000 } = {}) {
  await t.waitFor(async () => (await chipStatuses(card)).some((s) => ACTIVE_AGENT_STATUSES.includes(s)), { timeout, message: 'an agent to start working (starting/thinking/searching/reading/writing)' });
}

export default [
  {
    name: 'swarm',
    title: '[[swarm:6]]: live mission card, 6 agents reach done, final answer, stats, Mission Control with 6 agent cards',
    device: 'iphone13',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[swarm:6]] Compare the best electric SUVs of 2026', { mode: 'swarm' });
      const card = turn.locator(tid('mission-card')).first();
      await card.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {
        throw new Error('A mission card should appear in the turn while agents are planned');
      });
      await waitForAgents(t, card, 6);
      await waitSomeActive(t, card);
      await t.screenshot('1-mission-live');
      await waitAllAgents(t, card, 'done', { timeout: 90000 });
      await t.waitForTurn(turn, ['done'], { timeout: 60000 });
      t.assert((await card.getAttribute('data-status')) === 'done', `The mission card should end with data-status="done" (got ${await card.getAttribute('data-status')})`);

      const codenames = await chipCodenames(card);
      t.assert(codenames.every(Boolean) && new Set(codenames).size === 6, `Six distinct codenames expected, got ${codenames.join(', ')}`);
      const answer = await t.text(turn.locator(tid('segment-text')).last());
      for (const c of codenames) t.assert(answer.includes(c), `The final answer should name agent ${c} (the mock names every codename it receives)`);
      t.assert((await turn.locator(`${tid('segment-text')} a[href^="https://"]`).count()) > 0, 'The final answer should link sources');
      const stats = await t.text(turn.locator(tid('turn-stats')).first());
      t.assert(/\b6 agents\b/.test(stats), `The stats line should say "6 agents"; got "${stats}"`);
      await t.screenshot('2-final-answer');

      const mc = await openMissionControl(t, turn);
      await t.waitFor(async () => (await mc.locator(tid('agent-card')).count()) === 6, { timeout: 10000, message: '6 agent cards in Mission Control' });
      const cardStatuses = await mc.locator(tid('agent-card')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
      t.assert(cardStatuses.every((s) => s === 'done'), `Every agent card should be done; got ${cardStatuses.join(', ')}`);
      await t.screenshot('3-mission-control');
      await t.page.keyboard.press('Escape');

      await t.step('request contract (SPEC §8.4–8.5)', async () => {
        const workers = t.requests('worker');
        t.assert(workers.length === 6 && workers.every((r) => r.status === 200), `Expected 6 successful worker requests, got ${workers.map((r) => r.status).join(', ')}`);
        const sys = canonicalJson(workers[0].body.system);
        const tools = canonicalJson(workers[0].body.tools);
        t.assert(workers.every((r) => canonicalJson(r.body.system) === sys && canonicalJson(r.body.tools) === tools), 'All workers share one system prompt and tool list (cached prefix)');
        t.assert(workers.every((r) => r.body.model === 'claude-sonnet-5-5' && r.body.max_tokens === 32000), 'Workers use claude-sonnet-5-5 with max_tokens 32000');
        const names = workers[0].body.tools.map((x) => `${x.name}:${x.max_uses}`).join(',');
        t.assert(names === 'web_search:5,web_fetch:3', `Balanced-depth worker tools should be web_search(5) + web_fetch(3); got ${names}`);
        const leads = t.requests('lead');
        const results = leads.at(-1).body.messages.at(-1).content.filter((b) => b.type === 'tool_result');
        t.assert(results.length === 1, 'One tool_result answers the deploy_agents call');
        const text = typeof results[0].content === 'string' ? results[0].content : results[0].content.map((b) => b.text || '').join('');
        t.assert((text.match(/<agent_report\s+codename="/g) || []).length === 6, 'The tool_result carries 6 <agent_report> blocks (SPEC §8.4)');
      });
    },
  },

  {
    name: 'stop-swarm',
    title: 'Stop mid-swarm ([[slow]]): the turn stops, and a new message then succeeds',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[swarm:4]] [[slow]] Research the history of the bicycle');
      const card = turn.locator(tid('mission-card')).first();
      await card.waitFor({ state: 'visible', timeout: 30000 });
      await waitSomeActive(t, card, { timeout: 45000 });
      await t.visible('composer-stop', { message: 'Stop should be visible while a turn runs' });
      await t.screenshot('1-running');
      await t.page.locator(tid('composer-stop')).click();
      await t.waitForTurn(turn, ['stopped'], { timeout: 15000 });
      await t.visible('composer-send', { message: 'Send should be back after Stop' });
      const statuses = await chipStatuses(card);
      t.assert(!statuses.some((s) => ACTIVE_AGENT_STATUSES.includes(s)), `No agent should still be working after Stop; got ${statuses.join(', ')}`);
      await t.screenshot('2-stopped');

      const next = await t.send('What is the capital of France?');
      await t.waitForTurn(next, ['done']);
      t.assert((await t.text(next.locator(tid('segment-text')).first())).includes('Paris'), 'The new message is answered');
      const history = t.requests('lead').at(-1).body.messages;
      const closed = history.some((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result' && b.is_error === true));
      t.assert(closed, 'The stopped tool round should be closed with is_error tool_result blocks (SPEC §8.6)');
      await t.screenshot('3-next-message');
    },
  },

  {
    name: 'ratelimit-swarm',
    title: 'A rate-limited swarm ([[ratelimit:6]]: first 6 worker requests get 429) still completes',
    device: 'iphone13',
    timeout: 150000,
    allowConsole: [/status of 429/],
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[swarm:5]] [[ratelimit:6]] Compare budget smartphones');
      const card = turn.locator(tid('mission-card')).first();
      await card.waitFor({ state: 'visible', timeout: 20000 });
      await waitForAgents(t, card, 5);
      await waitAllAgents(t, card, 'done', { timeout: 120000 });
      await t.waitForTurn(turn, ['done'], { timeout: 60000 });
      const rejected = t.requests('worker').filter((r) => r.status === 429).length;
      t.assert(rejected === 6, `The mock should have rate-limited 6 worker requests (got ${rejected})`);
      await t.screenshot('completed');
    },
  },

  {
    name: 'resume',
    title: "Dropped worker streams ([[dropworkers]]) interrupt the turn; Resume re-runs them and finishes",
    device: 'iphone13',
    timeout: 150000,
    // Chromium logs the truncated responses as failed resource loads.
    allowConsole: [/ERR_INCOMPLETE_CHUNKED_ENCODING/, /Failed to load resource: net::ERR_/],
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[swarm:3]] [[dropworkers]] Research tidal power');
      await t.waitForTurn(turn, ['interrupted'], { timeout: 60000 });
      const card = turn.locator(tid('mission-card')).first();
      const resume = await t.visible('resume-button', { message: 'An interrupted turn should offer resume-button' });
      await t.screenshot('1-interrupted');
      await resume.click();
      await t.waitFor(async () => (await t.turnStatus(turn)) !== 'interrupted', { timeout: 10000, message: 'the turn to leave the interrupted state after Resume' });
      await t.waitForTurn(turn, ['done'], { timeout: 90000 });
      await waitAllAgents(t, card, 'done', { timeout: 10000 });
      const codenames = await chipCodenames(card);
      t.assert(codenames.length === 3, `3 agents expected, got ${codenames.length}`);
      const answer = await t.text(turn.locator(tid('segment-text')).last());
      for (const c of codenames) t.assert(answer.includes(c), `The final answer should name ${c}`);
      const outcomes = t.requests('worker').map((r) => r.outcome);
      t.assert(outcomes.filter((o) => o === 'cut').length === 3 && outcomes.filter((o) => o === 'ok').length === 3, `Each worker should be cut once then succeed (outcomes: ${outcomes.join(', ')})`);
      await t.screenshot('2-resumed');
    },
  },
];
