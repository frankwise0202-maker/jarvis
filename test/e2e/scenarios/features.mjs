// Feature pack v1.1 (SPEC §14) smoke test: follow-up chips, protocols and the theme picker.
// These modules are wired in by an integrator; until a feature is on screen this scenario
// records a note ("not wired yet") instead of failing, then tests it fully once it appears.

import { tid } from '../harness.mjs';

async function isShown(t, name, timeout = 0) {
  const loc = t.page.locator(tid(name)).first();
  if (!timeout) return loc.isVisible().catch(() => false);
  return loc.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
}

export default [
  {
    name: 'feature-pack',
    title: 'Feature pack v1.1 when wired in: follow-up chips, protocols, theme picker',
    device: 'desktop',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');

      await t.step('protocols (SPEC §14.2)', async () => {
        if (!(await isShown(t, 'protocol-grid', 3000))) {
          t.note('protocols: not wired yet');
          return;
        }
        const tiles = t.page.locator(tid('protocol-tile'));
        t.assert((await tiles.count()) >= 8, `The protocol grid should show the 8 built-in protocols (found ${await tiles.count()})`);
        const ids = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
        t.assert(ids.every(Boolean) && new Set(ids).size === ids.length, 'Every protocol tile needs a unique data-id');
        await t.screenshot('1-protocols');
        // Run one that needs input (an input row opens) and check it starts a turn.
        const before = await t.count('turn-jarvis');
        let started = false;
        for (let i = 0; i < Math.min(await tiles.count(), 8) && !started; i++) {
          await tiles.nth(i).click();
          if (await isShown(t, 'protocol-input', 1500)) {
            await t.page.locator(tid('protocol-input')).first().fill('black holes');
            await t.page.locator(tid('protocol-run')).first().click();
            started = true;
          } else if ((await t.count('turn-jarvis')) > before) {
            started = true;
          }
        }
        t.assert(started, 'Running a protocol should start a Jarvis turn');
        await t.waitFor(async () => (await t.count('turn-jarvis')) > before, { timeout: 10000, message: 'the protocol to start a Jarvis turn' });
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).nth(before), ['done'], { timeout: 90000 });
        t.note(`protocols: ${ids.length} tiles, one run`);
      });

      await t.step('follow-up chips (SPEC §14.5)', async () => {
        const turn = await t.send('What is the capital of France?');
        await t.waitForTurn(turn, ['done']);
        if (!(await isShown(t, 'followup', 8000))) {
          t.note('follow-ups: not wired yet');
          return;
        }
        const chips = t.page.locator(tid('followup'));
        const texts = await chips.allTextContents();
        t.assert(texts.length >= 1 && texts.length <= 3, `Show 1-3 follow-up chips (got ${texts.length})`);
        t.assert(texts.every((x) => x.trim().length > 0 && x.trim().length <= 70), 'Follow-up chips hold short questions (≤ 70 characters)');
        const structured = t.requests('structured');
        t.assert(structured.length >= 1 && structured.every((r) => r.status === 200 && r.body.model === 'claude-haiku-5-5' && r.body.stream !== true), 'Follow-ups come from a non-streaming claude-haiku-5-5 structured-output request');
        await t.screenshot('2-followups');
        const before = await t.count('turn-jarvis');
        await chips.first().click();
        await t.waitFor(async () => (await t.count('turn-jarvis')) > before, { timeout: 10000, message: 'tapping a follow-up to send it' });
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).nth(before), ['done']);
        t.note(`follow-ups: ${texts.length} chips`);
      });

      await t.step('theme picker (SPEC §14.3)', async () => {
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        if (!(await isShown(t, 'theme-picker', 2000))) {
          t.note('themes: not wired yet');
        } else {
          const swatches = t.page.locator(tid('theme-swatch'));
          t.assert((await swatches.count()) >= 6, 'At least 6 themes');
          const current = await t.page.evaluate(() => document.documentElement.dataset.theme || 'arc');
          const ids = await swatches.evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
          const next = ids.find((id) => id && id !== current);
          await swatches.nth(ids.indexOf(next)).click();
          await t.waitFor(async () => (await t.page.evaluate(() => document.documentElement.dataset.theme)) === next, { timeout: 3000, message: `<html data-theme="${next}">` });
          await t.screenshot('3-theme');
          t.note(`themes: switched ${current} → ${next}`);
        }
        await (await t.visible('settings-close')).click();
      });
    },
  },
];
