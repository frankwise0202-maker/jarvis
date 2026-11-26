// The Jarvis for Chrome link key never leaves this device by a backup or sync (v8.1, SPEC §32.1, critique M2):
// in real Chromium with real localStorage and IndexedDB (platform.harness), a device linked (and one waiting with a
// fresh code) exports a backup, builds and uploads its sync backup (the body as the home base would receive it,
// gunzipped), and none of them holds the key, the link code or the storage entry. A backup that carries a link
// (someone else's) never plants one on import; Reset forgets the link.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHarness, PAGE_HTML } from './platform.harness.test.mjs';

let h;

before(async () => {
  h = await createHarness(
    {
      link: 'src/platform/chrome-link.js',
      backup: 'src/platform/backup.js',
      settings: 'src/platform/settings.js',
      sync: 'src/platform/sync.js',
      db: 'src/platform/db.js',
      memory: 'src/platform/memory.js',
      secrets: 'src/platform/secrets.js',
      prompts: 'src/engine/prompts.js',
    },
    { routes: { '/app/': { body: PAGE_HTML, type: 'text/html; charset=utf-8' } } },
  );
});

after(async () => {
  if (h) await h.close();
});

const BASE = 'https://alienware.tail4e5f6a.ts.net/';

test('the link key and code are in no export, no sync backup and no sync upload; the link lives only in jarvis.chromeLink.v1', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(async (BASE) => {
    const { link, backup, settings, sync, db, memory, prompts } = window.__mods;
    settings.saveSettings({ homeBaseUrl: BASE, userName: 'Tony' });
    memory.addMemory('Prefers the Jarvis window on the right');
    const conv = {
      id: 'c1', v: 1, title: 'Monitors', createdAt: 1000, updatedAt: 2000, system: prompts.LEAD_SYSTEM_LATEST, tools: prompts.leadToolsLatest(),
      apiMessages: [{ role: 'user', content: [{ type: 'text', text: 'pull this up in Chrome' }] }],
      turns: [{ id: 'u1', role: 'user', text: 'pull this up in Chrome', mode: 'auto', createdAt: 1000 }], pending: null,
    };
    await db.saveConversation(conv);
    // Link: a key and a code (no network here: the relay is never reached).
    const made = link.createChromeLink({ getHomeBase: () => settings.getSettings().homeBaseUrl, fetchImpl: async () => new Response('{}', { status: 404 }), locks: null, channel: null, clipboard: null, computer: true });
    const begun = made.control.begin();
    const code = made.control.code();
    const stored = JSON.parse(localStorage.getItem(link.CHROME_LINK_KEY));
    made.destroy();
    const texts = {};
    const check = async (label) => {
      const file = await (await backup.exportBackup()).text();
      const built = await backup.buildSyncBackup();
      let uploaded = null;
      const fetchImpl = async (url, init) => {
        uploaded = { url, body: init.body instanceof Uint8Array ? Array.from(init.body) : init.body, headers: init.headers };
        return new Response(JSON.stringify({ ok: true, bytes: 1, storedAt: '2026-11-26T09:00:00.000Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      };
      const gz = await sync.gzipText(built.json);
      await sync.uploadSyncBackup(BASE, 'jd-0123456789abcdef', built.json, { label: 'Mac', gzipped: gz, fetchImpl });
      const gzipped = uploaded.body;
      const plain = [];
      await sync.uploadSyncBackup(BASE, 'jd-0123456789abcdef', built.json, { label: 'Mac', gzipped: null, fetchImpl: async (url, init) => { plain.push(init.body); return fetchImpl(url, init); } });
      texts[label] = { file, built: built.json, gzipped, plain: plain[0], settings: localStorage.getItem('jarvis.settings.v1') };
    };
    await check('pending');
    // Linked (the extension answered): the stored record gains linkedAt; nothing else changes.
    localStorage.setItem(link.CHROME_LINK_KEY, JSON.stringify({ ...stored, linkedAt: Date.now(), extSeenAt: Date.now() }));
    await check('linked');
    return { begun, code, key: stored.key, stored, texts, keys: Object.keys(localStorage) };
  }, BASE);
  assert.deepEqual(r.begun, { ok: true });
  assert.equal(r.key.length, 43);
  assert.ok(r.code && r.code.length > 60);
  assert.ok(r.keys.includes('jarvis.chromeLink.v1'));
  for (const [label, t] of Object.entries(r.texts)) {
    const gunzipped = gunzipSync(Buffer.from(t.gzipped)).toString('utf8');
    const all = { export: t.file, 'sync backup': t.built, 'sync upload (gzip)': gunzipped, 'sync upload (plain)': t.plain, settings: t.settings };
    for (const [what, text] of Object.entries(all)) {
      assert.equal(typeof text, 'string', `${label} ${what}`);
      assert.ok(!text.includes(r.key), `${label}: the key is not in the ${what}`);
      assert.ok(!text.includes(r.code), `${label}: the link code is not in the ${what}`);
      assert.ok(!text.includes(r.code.slice(10, 50)), `${label}: no piece of the link code in the ${what}`);
      assert.ok(!/chromeLink/i.test(text), `${label}: nothing named for the link in the ${what}`);
    }
    // What the upload carried is this device's backup (so the check above covers what the home base receives).
    assert.equal(gunzipped, t.built);
    assert.ok(JSON.parse(t.file).conversations.length === 1, 'the backup is a real one');
  }
});

test('LINK-5: a conversation holding the link code or the link key stays out of exports and sync; elsewhere they are masked', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(async (BASE) => {
    const { link, backup, settings, db, memory, prompts } = window.__mods;
    settings.saveSettings({ homeBaseUrl: BASE });
    const made = link.createChromeLink({ getHomeBase: () => settings.getSettings().homeBaseUrl, fetchImpl: async () => new Response('{}', { status: 404 }), locks: null, channel: null, clipboard: null, computer: true });
    made.control.begin();
    const code = made.control.code();
    const key = JSON.parse(localStorage.getItem(link.CHROME_LINK_KEY)).key;
    made.destroy();
    const conv = (id, text) => ({
      id, v: 1, title: 'Chat', createdAt: 1000, updatedAt: 2000, system: prompts.LEAD_SYSTEM_LATEST, tools: prompts.leadToolsLatest(),
      apiMessages: [{ role: 'user', content: [{ type: 'text', text }] }],
      turns: [{ id: `u-${id}`, role: 'user', text, mode: 'auto', createdAt: 1000 }], pending: null,
    });
    await db.saveConversation(conv('with-code', `here is the code ${code}`));
    await db.saveConversation(conv('with-key', `the key is ${key}`));
    await db.saveConversation(conv('plain', 'pull this up in Chrome'));
    memory.addMemory(`The Chrome code was ${code}`);
    const file = await (await backup.exportBackup()).text();
    const built = await backup.buildSyncBackup();
    return { file, sync: built.json, excluded: built.excluded.map((x) => x.id).sort(), code, key };
  }, BASE);
  for (const [label, text] of [['export', r.file], ['sync', r.sync]]) {
    assert.equal(text.includes(r.code), false, `${label}: no link code`);
    assert.equal(text.includes(r.key), false, `${label}: no link key`);
    const data = JSON.parse(text);
    assert.deepEqual(data.conversations.map((c) => c.id), ['plain'], `${label}: the conversations holding one are left out`);
    assert.ok(JSON.stringify(data.memory).includes('[link code removed]'), `${label}: masked in a remembered fact`);
  }
  assert.deepEqual(r.excluded, ['with-code', 'with-key']);
});

test('a backup that carries a link (someone else\'s) never plants one; Reset forgets the link', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(async () => {
    const { link, backup } = window.__mods;
    const planted = { v: 1, core: 'https://evil.tail0000.ts.net', key: 'A'.repeat(43), linkedAt: 1, extSeenAt: 1, madeAt: 1 };
    const file = { app: 'jarvis', version: 1, exportedAt: new Date().toISOString(), settings: { userName: 'Not me' }, memory: [], conversations: [], chromeLink: planted, 'jarvis.chromeLink.v1': planted };
    let imported = null;
    try {
      imported = await backup.importBackup(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    } catch (err) {
      imported = { error: String(err && err.message) };
    }
    const afterImport = localStorage.getItem(link.CHROME_LINK_KEY);
    // A real link, then Reset.
    localStorage.setItem(link.CHROME_LINK_KEY, JSON.stringify({ ...planted, core: 'https://alienware.tail4e5f6a.ts.net' }));
    localStorage.setItem(link.CHROME_LINK_INBOX_KEY, JSON.stringify({ core: 'https://alienware.tail4e5f6a.ts.net', cursor: null, seen: [] }));
    const reset = await backup.resetApp();
    return { imported: !!imported, afterImport, afterReset: [localStorage.getItem(link.CHROME_LINK_KEY), localStorage.getItem(link.CHROME_LINK_INBOX_KEY)], reset: reset.ok };
  });
  assert.equal(r.imported, true);
  assert.equal(r.afterImport, null, 'an import never creates a link');
  assert.deepEqual(r.afterReset, [null, null], 'Reset forgets the link and its inbox');
});
