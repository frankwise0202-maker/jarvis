// A Chrome profile of its own: the side panel's first-run screen ("Use Jarvis in its own Chrome
// profile") comes before the API key can be saved; its box must be ticked; the confirmation is
// kept in chrome.storage.local; Settings always shows "For use in your Jarvis profile only" with
// the steps behind it; a key saved before the screen existed waits for it too.

import { assert, tid, waitFor } from './harness.mjs';
import { TEST_API_KEY } from '../mock/claude-mock.mjs';

const stored = (run) => run.sw.evaluate(async () => chrome.storage.local.get(['jarvis.profile', 'jarvis.apiKey']));

const gate = {
  name: 'profile-gate',
  title: 'first run: no key before “This is a separate Chrome profile just for Jarvis…” is ticked; remembered after',
  start: { seed: false, deviceScaleFactor: 2, panelSize: { width: 380, height: 840 } },
  async run(run) {
    const p = run.panel;
    await p.locator(tid('profile-gate')).waitFor();
    // The screen: why, the steps, the box (not ticked) and Continue (waiting for it); no key field.
    assert((await p.locator('.profile__title').textContent()) === 'Use Jarvis in its own Chrome profile', 'the title');
    const why = await p.locator(tid('profile-why')).textContent();
    assert(/if a web page ever tricks Jarvis, your main accounts, email, passwords and cards are out of its reach/.test(why), why);
    assert((await p.locator(`${tid('profile-steps')} li`).count()) === 6, 'six steps');
    const steps = await p.locator(tid('profile-steps')).textContent();
    for (const words of ['profile picture', 'Continue without an account', 'Autofill and passwords', 'chrome://extensions', 'Load unpacked', 'jarvis-for-chrome', 'Never your email or your bank', 'profile picture → Jarvis']) assert(steps.includes(words), `the steps say “${words}”`);
    assert((await p.locator(tid('profile-confirm')).textContent()) === 'This is a separate Chrome profile just for Jarvis, with no saved passwords or cards', 'the box’s words');
    assert(!(await p.isChecked(tid('profile-check'))), 'the box starts unticked');
    assert(await p.isDisabled(tid('profile-continue')), 'Continue waits for the box');
    assert((await p.locator(tid('setup-key')).count()) === 0 && (await p.locator(tid('composer')).count()) === 0, 'no key field and no task box yet');
    assert((await p.locator(tid('profile-next')).textContent()) === 'Next: your Anthropic API key.', 'says what comes next');
    await p.waitForTimeout(300);
    await run.shot('1-screen');

    // Pressing Continue anyway does nothing; the store in the service worker refuses a key too.
    await p.click(tid('profile-continue'), { force: true });
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    assert(await p.locator(tid('profile-gate')).isVisible(), 'still on the profile screen');
    const res = await run.sw.evaluate((key) => globalThis.__jarvisController.store.setApiKey(key), TEST_API_KEY);
    assert(res.ok === false && res.needsProfile === true, `the store refuses the key (${JSON.stringify(res)})`);
    let s = await stored(run);
    assert(!('jarvis.profile' in s) && !('jarvis.apiKey' in s), `nothing saved (${JSON.stringify(s)})`);

    // Nothing is remembered without the box: the panel opens at the same screen again.
    await p.reload();
    await p.locator(tid('profile-gate')).waitFor();
    assert(!(await p.isChecked(tid('profile-check'))), 'still unticked');

    // Ticking enables Continue and unticking disables it again; the words tick it too.
    await p.check(tid('profile-check'));
    assert(!(await p.isDisabled(tid('profile-continue'))), 'Continue enabled once ticked');
    await p.uncheck(tid('profile-check'));
    assert(await p.isDisabled(tid('profile-continue')), 'Continue disabled once unticked');
    await p.click(`${tid('profile-confirm')} span`);
    assert(await p.isChecked(tid('profile-check')), 'clicking the words ticks the box');
    await p.locator(tid('profile-continue')).scrollIntoViewIfNeeded();
    await p.waitForTimeout(200);
    await run.shot('2-ticked');
    await p.click(tid('profile-continue'));

    // The key screen; the confirmation is kept in chrome.storage.local (never sync).
    await p.locator(tid('setup')).waitFor();
    s = await stored(run);
    assert(s['jarvis.profile']?.separate === true && s['jarvis.profile'].at > 0 && !('jarvis.apiKey' in s), `confirmation saved, no key yet (${JSON.stringify(s)})`);
    const sync = await run.sw.evaluate(async () => Object.keys(await chrome.storage.sync.get(null)));
    assert(sync.length === 0, `nothing in sync storage (${sync})`);
    assert((await p.locator(`${tid('setup')} ${tid('profile-note')} summary`).textContent()).includes('For use in your Jarvis profile only'), 'the key screen says what the profile is for');

    // Remembered: the panel now opens at the key screen.
    await p.reload();
    await p.locator(tid('setup')).waitFor();
    assert((await p.locator(tid('profile-gate')).count()) === 0, 'the profile screen is not shown again');

    // Now the key is saved, and the panel opens at the main view from then on.
    await p.fill(tid('setup-key'), TEST_API_KEY);
    await p.click(tid('setup-save'));
    await p.locator(tid('empty')).waitFor();
    s = await stored(run);
    assert(s['jarvis.apiKey'] === TEST_API_KEY, 'the key is saved');
    await p.reload();
    await p.locator(tid('composer')).waitFor();
    assert((await p.locator(tid('profile-gate')).count()) === 0 && (await p.locator(tid('setup')).count()) === 0, 'straight to the main view');

    // A task runs.
    run.server.mock.script([() => ({ answer: 'Hello from the Jarvis profile.' })]);
    await run.send('Say hello');
    await run.waitStatus('done');
  },
};

const settingsLine = {
  name: 'profile-settings',
  title: 'Settings always shows “For use in your Jarvis profile only”, with the steps behind it',
  start: { deviceScaleFactor: 2, panelSize: { width: 380, height: 840 } },
  async run(run) {
    const p = run.panel;
    await p.locator(tid('composer')).waitFor();
    await p.click(tid('open-settings'));
    const note = p.locator(`.sheet ${tid('profile-note')}`);
    await note.waitFor();
    assert((await note.locator('summary').textContent()).includes('For use in your Jarvis profile only'), 'the line');
    assert(!(await note.locator(tid('profile-steps')).isVisible()), 'the steps start folded');
    // The line comes first in Settings, above the API key.
    const first = await p.locator('.sheet__body > *').first().getAttribute('data-testid');
    assert(first === 'profile-note', `first in Settings (${first})`);
    await note.locator(tid('profile-note-toggle')).click();
    await waitFor(() => note.locator(tid('profile-steps')).isVisible(), { message: 'the steps' });
    assert((await note.locator(`${tid('profile-steps')} li`).count()) === 6, 'six steps');
    assert(/out of its reach/.test(await note.locator('.profile-note__why').textContent()), 'and why');
    await p.waitForTimeout(300);
    await run.shot('steps');
    await note.locator(tid('profile-note-toggle')).click();
    await waitFor(async () => !(await note.locator(tid('profile-steps')).isVisible()), { message: 'the steps folded again' });
    // Looking at the steps changes nothing.
    await p.click(tid('sheet-back'));
    const v = await stored(run);
    assert(v['jarvis.profile']?.separate === true, JSON.stringify(v));
  },
};

const olderKey = {
  name: 'profile-older-key',
  title: 'a key saved before the profile screen existed: the screen comes first, and no task starts before it',
  start: { profile: false },
  async run(run) {
    const p = run.panel;
    await p.locator(tid('profile-gate')).waitFor();
    assert((await p.locator(tid('composer')).count()) === 0, 'no task box before the profile screen');
    assert((await p.locator(tid('profile-next')).count()) === 0, 'no “Next: your Anthropic API key”: the key is already saved');
    // The service worker doesn't start a task either.
    await run.sw.evaluate(() => globalThis.__jarvisController.start({ text: 'Say hello' }));
    const t = await run.sw.evaluate(() => {
      const task = globalThis.__jarvisController.tasks.at(-1);
      return task && { status: task.status, error: task.error };
    });
    assert(t?.status === 'error' && /confirm that this Chrome profile is just for Jarvis/.test(t.error), JSON.stringify(t));
    assert(run.server.mock.requests.length === 0, 'nothing sent to the API');
    // Ticked: the saved key is kept, straight to the main view, and tasks run.
    await run.passProfileGate();
    await p.locator(tid('composer')).waitFor();
    assert((await p.locator(tid('setup')).count()) === 0, 'no key screen: the key was kept');
    run.server.mock.script([() => ({ answer: 'Hello.' })]);
    await run.send('Say hello');
    await run.waitStatus('done');
  },
};

export const PROFILE_SCENARIOS = [gate, settingsLine, olderKey];
