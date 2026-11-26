// v8.1 Microphone and speaker in backups (src/platform/backup.js, SPEC §28.2): the setup and the chosen devices
// are this computer's own (device ids are per site and browser; another device's speakerphone means nothing
// here): never in an export or a sync upload, never applied from a backup. Runs in real Chromium with real
// IndexedDB (platform.harness).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, PAGE_HTML } from './platform.harness.test.mjs';

const AUDIO = { audioSetup: 'switch', audioInputId: 'sp-mic', audioInputLabel: 'Desk Speakerphone (Bluetooth)', audioOutputId: 'sp-out', audioOutputLabel: 'Desk Speakerphone (Bluetooth)' };
const KEYS = Object.keys(AUDIO);

let h;
before(async () => {
  h = await createHarness(
    { db: 'src/platform/db.js', backup: 'src/platform/backup.js', settings: 'src/platform/settings.js' },
    { routes: { '/app/': { body: PAGE_HTML, type: 'text/html; charset=utf-8' } } },
  );
});
after(async () => {
  if (h) await h.close();
});

test('the microphone and speaker setup stays on this computer: not exported, not synced, not imported', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(
    async ({ audio, keys }) => {
      const { backup, settings } = window.__mods;
      settings.saveSettings({ ...audio, userName: 'Owner' });
      const saved = settings.getSettings();
      const exported = JSON.parse(await (await backup.exportBackup()).text());
      const synced = JSON.parse((await backup.buildSyncBackup()).json);
      // Another computer's backup carrying its own setup: nothing of it is applied here.
      settings.saveSettings({ audioSetup: '', audioInputId: '', audioInputLabel: '', audioOutputId: '', audioOutputLabel: '' });
      await backup.importBackup({ app: 'jarvis', version: 1, settings: { ...audio, userName: 'Imported' } });
      const after = settings.getSettings();
      return {
        saved: keys.map((k) => saved[k]),
        exported: keys.filter((k) => k in exported.settings),
        synced: keys.filter((k) => k in synced.settings),
        exportedName: exported.settings.userName,
        after: keys.map((k) => after[k]),
        afterName: after.userName,
      };
    },
    { audio: AUDIO, keys: KEYS },
  );
  assert.deepEqual(r.saved, KEYS.map((k) => AUDIO[k]), 'the settings hold the setup');
  assert.deepEqual(r.exported, [], 'not in an export');
  assert.deepEqual(r.synced, [], 'not in a sync upload');
  assert.equal(r.exportedName, 'Owner', 'the profile still is');
  assert.deepEqual(r.after, ['', '', '', '', ''], 'never applied from a backup');
  assert.equal(r.afterName, 'Imported', 'the profile is');
});
