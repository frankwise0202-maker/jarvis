// Chat scenarios: quick answer, web search, follow-up turn (prefix check), persistence +
// history, XSS safety, memory.

import { tid } from '../harness.mjs';

/** Dangerous things that must never appear inside rendered model output. */
async function scanForInjection(t, rootSelector) {
  return t.page.evaluate((sel) => {
    const problems = [];
    for (const root of document.querySelectorAll(sel)) {
      // (Disabled checkboxes are how Markdown task lists render; any other input is injected.)
      for (const tag of ['script', 'img', 'iframe', 'object', 'embed', 'form', 'style', 'svg foreignObject', 'input:not([type="checkbox"][disabled])', 'textarea', 'video', 'audio']) {
        const n = root.querySelectorAll(tag).length;
        if (n) problems.push(`${n} <${tag}> element(s)`);
      }
      for (const el of root.querySelectorAll('*')) {
        for (const a of el.attributes) {
          if (/^on/i.test(a.name)) problems.push(`<${el.tagName.toLowerCase()} ${a.name}=…>`);
        }
      }
      for (const a of root.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href') || '';
        if (!/^(https?:|mailto:)/i.test(href.trim())) problems.push(`link with unsafe href "${href.slice(0, 60)}"`);
        else if (/^https?:/i.test(href) && (a.getAttribute('target') !== '_blank' || !/noopener/.test(a.getAttribute('rel') || ''))) {
          problems.push(`external link without target=_blank rel=noopener: ${href.slice(0, 60)}`);
        }
      }
    }
    if (window.__xss) problems.push('window.__xss was set');
    return [...new Set(problems)];
  }, rootSelector);
}

export default [
  {
    name: 'quick-answer',
    title: 'A quick question streams thinking and a Markdown answer',
    device: 'iphone13',
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.visible('empty-state');
      await t.screenshot('1-empty');
      const turn = await t.send('What is the capital of France?');
      await t.waitForTurn(turn, ['done']);
      const text = await t.text(turn.locator(tid('segment-text')).first());
      t.assert(text.includes('Paris'), `The answer should mention Paris; got "${text.slice(0, 120)}"`);
      t.assert((await turn.locator(tid('segment-thinking')).count()) >= 1, 'Summarized thinking should be shown (showThinking defaults to true)');
      await t.visible('turn-stats', { message: 'A finished turn shows its stats line' });
      await t.visible('turn-user', { message: 'The user message is shown' });
      await t.visible('composer-send', { message: 'Send is back once the turn finished' });
      await t.screenshot('2-answer');

      const [lead] = t.requests('lead');
      t.assert(lead, 'The app should have sent a lead request');
      const b = lead.body;
      // A new conversation can show holograms (lead tools V4): the Balanced lead budget has room for
      // a vehicle hologram plus thinking (visualLeadMaxTokens, SPEC §16); older ones keep 16000.
      t.assert(b.model === 'claude-opus-5-5' && b.max_tokens === 32000, `Lead request: claude-opus-5-5 with max_tokens 32000 (Balanced depth in a conversation with the hologram tools; engine hardening P2c); got ${b.model} / ${b.max_tokens}`);
      t.assert(b.stream === true, 'Lead requests stream');
      t.assert(b.thinking?.type === 'adaptive' && b.thinking?.display === 'summarized', 'Lead request: adaptive thinking, display summarized');
      t.assert(b.output_config?.effort === 'medium', 'Lead request: effort medium for the balanced depth');
      t.assert(b.cache_control?.type === 'ephemeral', 'Lead request: automatic prompt caching (top-level cache_control)');
      const first = b.messages.at(-1).content;
      t.assert(Array.isArray(first) && /^<turn_context>/.test(first[0]?.text) && /Address the owner as: Tony/.test(first[0].text), 'The user message starts with the <turn_context> block naming the owner (SPEC §8.4)');
    },
  },

  {
    name: 'search',
    title: '[[search]] shows a web_search tool row and a cited answer',
    device: 'iphone13',
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[search]] latest EV battery news');
      await t.waitForTurn(turn, ['done']);
      const tool = turn.locator(tid('segment-tool', { 'data-tool': 'web_search' })).first();
      await tool.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
        throw new Error('A web_search tool segment should be shown');
      });
      t.assert((await tool.getAttribute('data-status')) === 'done', 'The web_search tool segment should end with data-status="done"');
      const links = turn.locator(`${tid('segment-text')} a[href^="https://"]`);
      t.assert((await links.count()) > 0, 'The answer should contain source links');
      t.assert((await links.first().getAttribute('target')) === '_blank' && /noopener/.test((await links.first().getAttribute('rel')) || ''), 'Links open in a new tab with rel="noopener noreferrer"');
      await t.screenshot('cited-answer');
    },
  },

  {
    name: 'follow-up',
    title: 'A follow-up turn after a swarm sends append-only history (passes the prefix check)',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const first = await t.send('[[swarm:3]] Compare heat pumps and gas boilers');
      await t.waitForTurn(first, ['done'], { timeout: 60000 });
      const second = await t.send('Thanks. And what about Germany, what is its capital?');
      await t.waitForTurn(second, ['done']);
      const text = await t.text(second.locator(tid('segment-text')).first());
      t.assert(text.includes('Berlin'), `The follow-up answer should mention Berlin; got "${text.slice(0, 120)}"`);
      const leads = t.requests('lead');
      t.assert(leads.length >= 3 && leads.every((r) => r.status === 200), `All lead requests should succeed (got ${leads.map((r) => r.status).join(', ')})`);
      t.assertAppendOnly();
      const last = leads.at(-1).body.messages;
      t.assert(last.some((m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((c) => c.type === 'thinking')), 'The replayed history keeps the thinking blocks');
      await t.screenshot('follow-up');
    },
  },

  {
    name: 'persistence',
    title: 'A conversation survives a reload and opens from History',
    device: 'iphone13',
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('What is the capital of France?');
      await t.waitForTurn(turn, ['done']);
      const leadCount = t.requests('lead').length;
      await t.page.waitForTimeout(1200); // let the throttled save land
      await t.reload();

      await t.step('open the conversation from History', async () => {
        if (!(await t.page.locator(tid('history-item')).first().isVisible())) {
          await (await t.visible('history-button')).click();
        }
        await t.visible('history-drawer');
        const item = await t.visible('history-item', { message: 'The saved conversation should be listed in History' });
        t.assert(/capital of France/i.test(await t.text(item)), 'The history row should show the conversation title or preview');
        await t.screenshot('1-history');
        await item.click();
      });

      const restored = t.page.locator(tid('turn-jarvis')).first();
      await restored.waitFor({ state: 'visible', timeout: 10000 });
      t.assert((await restored.getAttribute('data-status')) === 'done', 'The restored turn keeps its "done" status');
      t.assert((await t.text(restored)).includes('Paris'), 'The restored answer is shown');
      t.assert(/capital of France/i.test(await t.text(t.page.locator(tid('turn-user')).first())), 'The restored user message is shown');
      t.assert(t.requests('lead').length === leadCount, 'Reloading and opening history must not call the API again');
      await t.screenshot('2-restored');
    },
  },

  {
    name: 'xss',
    title: 'XSS payloads in model output and agent reports render as inert text',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const title = await t.page.title();
      const turn = await t.send('[[xss]] show me some HTML');
      await t.waitForTurn(turn, ['done']);
      await t.page.waitForTimeout(500);
      const problems = await scanForInjection(t, tid('turn-jarvis'));
      t.assert(problems.length === 0, `Unsafe content in the transcript: ${problems.join('; ')}`);
      t.assert((await t.text(turn)).includes('<script>'), 'The payload should be visible as plain text');
      t.assert((await t.page.title()) === title, 'The document title must not change');
      await t.screenshot('1-transcript');

      await t.step('agent reports in Mission Control', async () => {
        const swarm = await t.send('[[swarm:2]] [[xss]] research markup safety');
        await t.waitForTurn(swarm, ['done'], { timeout: 60000 });
        await openMissionControl(t, swarm);
        const mc = await t.visible('mission-control');
        for (const card of await mc.locator(tid('agent-card')).all()) {
          await card.click().catch(() => {}); // expand when cards are collapsible
        }
        await t.page.waitForTimeout(500);
        const mcProblems = await scanForInjection(t, `${tid('mission-control')}, ${tid('turn-jarvis')}`);
        t.assert(mcProblems.length === 0, `Unsafe content in Mission Control or the transcript: ${mcProblems.join('; ')}`);
        await t.screenshot('2-mission-control');
      });
    },
  },

  {
    name: 'memory',
    title: '[[memory]] shows a memory segment, and Settings lists the remembered fact',
    device: 'iphone13',
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[memory]] I prefer metric units');
      await t.waitForTurn(turn, ['done']);
      const seg = turn.locator(tid('segment-memory')).first();
      await seg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
        throw new Error('A memory segment should be shown');
      });
      t.assert(/metric/i.test(await t.text(seg)), 'The memory segment should show the fact');
      await t.screenshot('1-memory-segment');

      await (await t.visible('settings-button')).click();
      await t.visible('settings-sheet');
      const item = t.page.locator(tid('memory-item')).filter({ hasText: 'Prefers metric units' }).first();
      await item.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {
        throw new Error('Settings → Memory should list "Prefers metric units"');
      });
      await item.scrollIntoViewIfNeeded().catch(() => {});
      await t.screenshot('2-settings-memory');
      await (await t.visible('settings-close')).click();
      await t.page.locator(tid('settings-sheet')).waitFor({ state: 'hidden', timeout: 5000 });

      // A fact saved by mistake (or because a web page asked for it) is one tap from gone.
      await t.step('Undo on the memory chip', async () => {
        t.assert((await seg.getAttribute('data-state')) === 'remembered', 'The chip starts as "remembered"');
        const undo = seg.locator(tid('memory-undo'));
        await undo.click();
        await t.waitFor(async () => (await seg.getAttribute('data-state')) === 'forgotten', { timeout: 3000, message: 'the chip to switch to "forgotten"' });
        t.assert(/forgotten/i.test(await t.text(seg)), 'The chip says "Forgotten"');
        t.assert(!(await undo.isVisible()), 'Undo goes away once the fact is forgotten');
        t.assert(await t.page.evaluate(() => document.activeElement?.classList.contains('memory-manage')), 'Focus moves to "Manage" (not lost)');
        const stored = await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.memory.v1') || '[]'));
        t.assert(!stored.some((m) => /metric/i.test(m.text)), 'The fact is removed from memory');
        await t.screenshot('3-memory-undone');
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        await t.page.waitForTimeout(300);
        t.assert((await t.page.locator(tid('memory-item')).filter({ hasText: 'Prefers metric units' }).count()) === 0, 'Settings → Memory no longer lists it');
        await (await t.visible('settings-close')).click();
      });
    },
  },
];

/** Open Mission Control for a turn (desktop shows it as a panel already). */
export async function openMissionControl(t, turn) {
  const mc = t.page.locator(tid('mission-control')).first();
  if (await mc.isVisible()) return mc;
  const open = (turn || t.page).locator(tid('open-mission')).first();
  if (await open.count()) await open.click();
  else await (turn || t.page).locator(tid('mission-card')).first().click();
  await mc.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
    throw new Error('Mission Control should open (data-testid="mission-control")');
  });
  return mc;
}
