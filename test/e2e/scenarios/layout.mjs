// Layout checks at iPhone 13 (390×844), a small phone (375×667) and desktop (1440×900):
// no horizontal overflow (SPEC §2), tap targets ≥ 44 px and 16 px inputs on phones, and
// screenshots of the key states into test/artifacts/.

import { ACTIVE_AGENT_STATUSES, tid } from '../harness.mjs';
import { openMissionControl } from './chat.mjs';

const TAP_TARGETS = ['composer-send', 'history-button', 'settings-button', 'mode-auto', 'mode-quick', 'mode-swarm'];

function layoutScenario(name, device, label) {
  return {
    name,
    title: `Layout at ${label}: no horizontal overflow, phone ergonomics, screenshots of key states`,
    device,
    timeout: 180000,
    async run(t) {
      await t.newPage();
      const phone = t.devices[device].phone;
      await t.goto('/');
      await t.visible('empty-state');
      await t.page.waitForTimeout(800); // let the hero core settle
      await t.screenshot('1-empty');
      await t.checkNoHorizontalOverflow('empty state');

      if (phone) {
        await t.step('tap targets and input size', async () => {
          const small = [];
          for (const id of TAP_TARGETS) {
            const loc = t.page.locator(tid(id)).first();
            if (!(await loc.isVisible().catch(() => false))) continue;
            const box = await loc.boundingBox();
            if (box && (box.width < 43.5 || box.height < 43.5)) small.push(`${id} ${Math.round(box.width)}×${Math.round(box.height)}`);
          }
          t.assert(!small.length, `Tap targets must be at least 44×44 px (SPEC §2): ${small.join(', ')}`);
          const fontSize = await t.page.locator(tid('composer-input')).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
          t.assert(fontSize >= 16, `The composer input needs a font size of at least 16 px to avoid iOS zoom (got ${fontSize}px)`);
        });
      }

      const long = await t.send('[[long]] A guide to buying an electric car');
      await t.waitForTurn(long, ['done']);
      await t.page.waitForTimeout(500);
      await t.checkNoHorizontalOverflow('long Markdown answer (table, code, long URL)');
      await t.screenshot('2-long-answer');

      const swarm = await t.send('[[swarm:6]] Compare the best electric SUVs of 2026');
      const card = swarm.locator(tid('mission-card')).first();
      await card.waitFor({ state: 'visible', timeout: 20000 });
      await t.waitFor(async () => (await card.locator(tid('agent-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).some((s) => ACTIVE_AGENT_STATUSES.includes(s)), { timeout: 30000, message: 'agents to start working' });
      await t.page.waitForTimeout(600);
      await t.checkNoHorizontalOverflow('mission running');
      await t.screenshot('3-mission-live');
      await t.waitForTurn(swarm, ['done'], { timeout: 120000 });
      await t.page.waitForTimeout(500);
      await t.checkNoHorizontalOverflow('swarm finished');
      await t.screenshot('4-swarm-done');

      if (phone) {
        await openMissionControl(t, swarm);
        await t.page.waitForTimeout(600);
        await t.checkNoHorizontalOverflow('Mission Control sheet');
        await t.screenshot('5-mission-control');
        await t.page.keyboard.press('Escape');
      } else {
        await t.visible('mission-control', { message: 'On desktop, Mission Control is a side panel' });
        await t.visible('history-drawer', { message: 'On desktop, History is a sidebar' });
      }
    },
  };
}

export default [
  layoutScenario('layout-iphone13', 'iphone13', 'iPhone 13 (390×844)'),
  layoutScenario('layout-small', 'small', '375×667'),
  layoutScenario('layout-desktop', 'desktop', '1440×900'),
];
