// Unit tests for conversation storage (db.js) and backup/restore/reset (backup.js), SPEC §5,
// run in real Chromium with real IndexedDB (see platform.harness.test.mjs).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, PAGE_HTML } from './platform.harness.test.mjs';

const SW = 'self.addEventListener("fetch", () => {});';
let h;

before(async () => {
  h = await createHarness(
    {
      db: 'src/platform/db.js',
      backup: 'src/platform/backup.js',
      settings: 'src/platform/settings.js',
      secrets: 'src/platform/secrets.js',
      memory: 'src/platform/memory.js',
      spend: 'src/platform/spend.js',
    },
    {
      routes: {
        '/app/': { body: PAGE_HTML, type: 'text/html; charset=utf-8' },
        '/app/sw.js': { body: SW, type: 'text/javascript' },
        '/other/sw.js': { body: SW, type: 'text/javascript' },
      },
    },
  );
});

after(async () => {
  if (h) await h.close();
});

// Installed in every page: a conversation factory shaped like SPEC §6.
const FACTORY = () => {
  window.conv = (id, updatedAt, userTexts = ['Hello'], extra = {}) => {
    const turns = [];
    for (const [i, text] of userTexts.entries()) {
      turns.push({ id: `${id}-u${i}`, role: 'user', text, mode: 'auto', createdAt: updatedAt - 100 + i });
      turns.push({ id: `${id}-j${i}`, role: 'jarvis', status: 'done', createdAt: updatedAt - 50 + i, endedAt: updatedAt, segments: [{ id: 's', kind: 'text', text: 'Hi', req: 0, citations: [] }], missions: {}, usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 0 }, costUsd: 0.01, stats: { agents: 0, searches: 0, sources: 0, waves: 0, durationMs: 5 }, error: null, mode: 'auto', leadModel: 'claude-opus-5-5', workerModel: 'claude-sonnet-5-5', depth: 'balanced' });
    }
    return { id, v: 1, title: userTexts[0].slice(0, 60), createdAt: updatedAt - 1000, updatedAt, system: 'SYSTEM', tools: [{ name: 'deploy_agents' }], apiMessages: [{ role: 'user', content: [{ type: 'text', text: userTexts[0] }] }], turns, pending: null, ...extra };
  };
};

const newPage = (opts = {}) => h.newPage({ ...opts, init: opts.init || FACTORY });

// ---- db ---------------------------------------------------------------------------------

test('db: save, list (newest first, with previews), get, delete, delete all', async () => {
  const page = await newPage();
  const r = await page.evaluate(async () => {
    const db = window.__mods.db;
    const out = {};
    out.save = await db.saveConversation(conv('a', 1000, ['First question', 'Second\nquestion   spread over lines']));
    await db.saveConversation(conv('b', 3000, ['B question']));
    await db.saveConversation({ ...conv('c', 2000, ['x'.repeat(200)]), title: '' });
    out.list = await db.listConversations();
    out.get = await db.getConversation('a');
    out.missing = await db.getConversation('nope');
    out.badId = await db.getConversation(42);
    out.get.turns.length = 0; // mutating a returned copy must not affect storage
    out.again = (await db.getConversation('a')).turns.length;
    await db.deleteConversation('b');
    out.afterDelete = (await db.listConversations()).map((m) => m.id);
    out.getDeleted = await db.getConversation('b');
    out.persistent = db.isPersistent();
    return out;
  });
  assert.equal(r.save, true);
  assert.deepEqual(r.list.map((m) => m.id), ['b', 'c', 'a']);
  assert.deepEqual(r.list[2], { id: 'a', title: 'First question', createdAt: 0, updatedAt: 1000, preview: 'Second question spread over lines', turnCount: 4 });
  assert.equal(r.list[1].title, 'x'.repeat(119) + '…'); // empty title falls back to the first user text
  assert.equal(r.list[1].preview.length, 120);
  assert.equal(r.list[1].preview.endsWith('…'), true);
  assert.equal(r.get.id, 'a');
  assert.equal(r.get.system, 'SYSTEM');
  assert.equal(r.missing, null);
  assert.equal(r.badId, null);
  assert.equal(r.again, 4);
  assert.deepEqual(r.afterDelete, ['c', 'a']);
  assert.equal(r.getDeleted, null);
  assert.equal(r.persistent, true);

  // Survives a reload, and the IndexedDB layout is what SPEC §5 says.
  const page2 = await page.context().newPage();
  await page2.goto(h.url);
  await page2.waitForFunction(() => window.__ready === true);
  const r2 = await page2.evaluate(async () => {
    const ids = (await window.__mods.db.listConversations()).map((m) => m.id);
    const layout = await new Promise((resolve) => {
      const req = indexedDB.open('jarvis');
      req.onsuccess = () => {
        const d = req.result;
        const tx = d.transaction(['conversations', 'meta']);
        resolve({ version: d.version, stores: [...d.objectStoreNames].sort(), keyPaths: [tx.objectStore('conversations').keyPath, tx.objectStore('meta').keyPath] });
        d.close();
      };
    });
    await window.__mods.db.deleteAllConversations();
    return { ids, layout, after: await window.__mods.db.listConversations() };
  });
  assert.deepEqual(r2.ids, ['c', 'a']);
  assert.deepEqual(r2.layout, { version: 1, stores: ['conversations', 'meta'], keyPaths: ['id', 'id'] });
  assert.deepEqual(r2.after, []);
});

test('db: saves are serialized and coalesced; reads see earlier writes; the last state wins', async () => {
  const page = await newPage();
  const r = await page.evaluate(async () => {
    const db = window.__mods.db;
    let puts = 0;
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'conversations') puts++;
      return realPut.apply(this, args);
    };
    const c = conv('live', 1000, ['Q0']);
    const promises = [];
    for (let i = 1; i <= 50; i++) {
      c.turns.push({ id: `u${i}`, role: 'user', text: `Q${i}`, mode: 'auto', createdAt: i });
      c.updatedAt = 1000 + i;
      promises.push(db.saveConversation(c)); // not awaited: like a streaming turn
    }
    const readBack = await db.getConversation('live'); // queued after the saves
    const results = await Promise.all(promises);
    const meta = (await db.listConversations())[0];
    IDBObjectStore.prototype.put = realPut;
    return { puts, turns: readBack.turns.length, updatedAt: readBack.updatedAt, results: [...new Set(results)], meta };
  });
  assert.ok(r.puts <= 3, `expected coalesced writes, saw ${r.puts}`);
  assert.equal(r.turns, 52);
  assert.equal(r.updatedAt, 1050);
  assert.deepEqual(r.results, [true]);
  assert.equal(r.meta.preview, 'Q50');
  assert.equal(r.meta.turnCount, 52);
});

test('db: a deleted conversation is not resurrected by a late save; restoreConversation can bring it back', async () => {
  const page = await newPage();
  const r = await page.evaluate(async () => {
    const db = window.__mods.db;
    const c = conv('gone', 1000);
    await db.saveConversation(c);
    const pending = db.saveConversation(c); // still queued when the owner deletes it
    await db.deleteConversation('gone');
    c.updatedAt = 2000;
    const late = await db.saveConversation(c); // e.g. a turn finishing after the delete
    const out = { pending: await pending, late, afterDelete: await db.getConversation('gone') };
    out.restored = await db.restoreConversation(c);
    out.afterRestore = (await db.getConversation('gone')).updatedAt;
    return out;
  });
  assert.deepEqual(r, { pending: false, late: false, afterDelete: null, restored: true, afterRestore: 2000 });
});

test('db: values that cannot be structured-cloned are stored via JSON; invalid input never throws', async () => {
  const page = await newPage();
  const r = await page.evaluate(async () => {
    const db = window.__mods.db;
    const c = conv('fn', 1000);
    c.helper = () => 1; // functions are not structured-clonable
    const saved = await db.saveConversation(c);
    const got = await db.getConversation('fn');
    const invalid = await Promise.all([db.saveConversation(null), db.saveConversation({}), db.saveConversation({ id: 7 }), db.deleteConversation(null)]);
    return { saved, hasHelper: 'helper' in got, title: got.title, invalid, persistent: db.isPersistent() };
  });
  assert.deepEqual(r, { saved: true, hasHelper: false, title: 'Hello', invalid: [false, false, false, undefined], persistent: true });
});

test('db: without IndexedDB (blocked / private mode) history works in memory and isPersistent() is false', async () => {
  const page = await newPage({
    init: () => {
      Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true });
      window.conv = (id, updatedAt) => ({ id, v: 1, title: id, createdAt: updatedAt, updatedAt, system: '', tools: [], apiMessages: [], turns: [{ id: 'u', role: 'user', text: `ask ${id}`, mode: 'auto', createdAt: 1 }], pending: null });
    },
  });
  const r = await page.evaluate(async () => {
    const db = window.__mods.db;
    const saved = [await db.saveConversation(conv('x', 1)), await db.saveConversation(conv('y', 2))];
    const list = (await db.listConversations()).map((m) => m.id);
    const got = (await db.getConversation('x')).title;
    await db.deleteConversation('y');
    return { saved, list, got, after: (await db.listConversations()).map((m) => m.id), persistent: db.isPersistent() };
  });
  assert.deepEqual(r, { saved: [false, false], list: ['y', 'x'], got: 'x', after: ['x'], persistent: false });
});

test('db: a failing write (quota) keeps the conversation in memory and flags isPersistent()', async () => {
  const page = await newPage();
  const r = await page.evaluate(async () => {
    const db = window.__mods.db;
    await db.saveConversation(conv('ok', 1000));
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const saved = await db.saveConversation(conv('big', 2000));
    IDBObjectStore.prototype.put = realPut;
    return { saved, list: (await db.listConversations()).map((m) => m.id), got: !!(await db.getConversation('big')), persistent: db.isPersistent() };
  });
  assert.deepEqual(r, { saved: false, list: ['big', 'ok'], got: true, persistent: false });
});

// ---- backup -----------------------------------------------------------------------------

const KEY = 'sk-ant-api03-SECRETSECRETSECRETSECRET-abcd';

test('backup: export has settings (minus onboarded/features), memory and conversations; never the key or spend', async () => {
  const page = await newPage();
  const r = await page.evaluate(async (key) => {
    const { db, backup, settings, secrets, memory, spend } = window.__mods;
    secrets.setApiKey(key);
    settings.saveSettings({ userName: 'Tony', onboarded: true, features: { fallbacks: false }, maxAgents: 12 });
    memory.addMemory('Prefers metric units');
    memory.addMemory(`My key is ${key}`);
    spend.addSpend(3.21);
    await db.saveConversation(conv('one', 1000));
    await db.saveConversation(conv('two', 2000, [`oops, my key is ${key}`]));
    const blob = await backup.exportBackup();
    const text = await blob.text();
    const stored = await db.getConversation('one');
    return { type: blob.type, text, data: JSON.parse(text), excluded: blob.excludedConversations, stored, name: backup.backupFileName(new Date(2026, 10, 19)) };
  }, KEY);
  assert.equal(r.type, 'application/json');
  assert.equal(r.data.app, 'jarvis');
  assert.equal(r.data.version, 1);
  assert.ok(!Number.isNaN(Date.parse(r.data.exportedAt)));
  assert.equal(r.data.settings.userName, 'Tony');
  assert.equal(r.data.settings.maxAgents, 12);
  assert.equal('onboarded' in r.data.settings, false);
  assert.equal('features' in r.data.settings, false);
  assert.deepEqual(r.data.memory.map((m) => m.text), ['Prefers metric units', 'My key is [API key removed]']);
  // A conversation is never edited (frozen history): the one containing the key is left out and reported.
  assert.deepEqual(r.data.conversations.map((c) => c.id), ['one']);
  assert.deepEqual(r.excluded, [{ id: 'two' }]);
  assert.deepEqual(r.data.conversations[0], r.stored, 'exported conversations are byte-for-byte what is stored');
  assert.equal(r.text.includes(KEY), false, 'the API key must never be exported');
  assert.equal(r.text.includes('SECRETSECRET'), false);
  assert.equal(/"apiKey"|"spend"|"totalUsd"|"monthUsd"/.test(r.text), false);
  assert.deepEqual(Object.keys(r.data).sort(), ['app', 'conversations', 'exportedAt', 'memory', 'settings', 'version']);
  assert.equal(r.name, 'jarvis-backup-2026-11-19.json');
});

test('backup: import merges conversations (newer wins), memory and settings; ignores keys it must not touch', async () => {
  const source = await newPage();
  const file = await source.evaluate(async () => {
    const { db, backup, settings, memory } = window.__mods;
    settings.saveSettings({ userName: 'From backup', depth: 'deep' });
    memory.addMemory('Lives in Austin');
    memory.addMemory('Prefers metric units');
    await db.saveConversation(conv('keep-local', 4000, ['older in backup']));
    await db.saveConversation(conv('replace', 6000, ['newer in backup']));
    await db.saveConversation(conv('new', 1000, ['only in backup']));
    const data = JSON.parse(await (await backup.exportBackup()).text());
    data.settings.onboarded = false; // must be ignored
    data.settings.features = { fallbacks: false }; // must be ignored
    data.settings.apiKey = 'sk-ant-should-never-be-imported-0000000000';
    data.apiKey = 'sk-ant-should-never-be-imported-0000000000';
    data.conversations.push({ id: '' }, { id: 'no-dates' }, null, 'junk', { id: 'turns-bad', createdAt: 1, updatedAt: 1, turns: [null, { role: 'hacker' }] });
    return JSON.stringify(data);
  });

  const page = await newPage();
  const r = await page.evaluate(async (json) => {
    const { db, backup, settings, secrets, memory } = window.__mods;
    settings.saveSettings({ onboarded: true });
    memory.addMemory('prefers METRIC units');
    await db.saveConversation(conv('keep-local', 5000, ['local is newer']));
    await db.saveConversation(conv('replace', 5000, ['local is older']));
    const result = await backup.importBackup(new File([json], 'jarvis-backup.json', { type: 'application/json' }));
    const list = await db.listConversations();
    return {
      result,
      ids: list.map((m) => m.id),
      keep: (await db.getConversation('keep-local')).turns[0].text,
      replaced: (await db.getConversation('replace')).turns[0].text,
      bad: (await db.getConversation('turns-bad')).turns.length,
      memory: memory.listMemory().map((m) => m.text),
      settings: settings.getSettings(),
      key: secrets.getApiKey(),
    };
  }, file);
  assert.deepEqual(r.result, { conversations: 3, memory: 1, settings: true });
  assert.deepEqual(r.ids, ['replace', 'keep-local', 'new', 'turns-bad']);
  assert.equal(r.keep, 'local is newer');
  assert.equal(r.replaced, 'newer in backup');
  assert.equal(r.bad, 0);
  // Merged chronologically (the backup's fact is older); the duplicate was not added twice.
  assert.deepEqual(r.memory, ['Lives in Austin', 'prefers METRIC units']);
  assert.equal(r.settings.userName, 'From backup');
  assert.equal(r.settings.depth, 'deep');
  assert.equal(r.settings.onboarded, true);
  assert.deepEqual(r.settings.features, { fallbacks: true, compaction: true });
  assert.equal(r.key, '');

  // Importing the same file again changes nothing.
  const again = await page.evaluate((json) => window.__mods.backup.importBackup(json), file);
  assert.deepEqual(again, { conversations: 0, memory: 0, settings: true });
});

test('backup: invalid files are rejected with a clear message', async () => {
  const page = await newPage();
  const errors = await page.evaluate(async () => {
    const { importBackup } = window.__mods.backup;
    const out = [];
    for (const input of ['not json', '{"app":"other","version":1}', '{"app":"jarvis"}', '{"app":"jarvis","version":2}', '{"app":"jarvis","version":1,"conversations":{}}', '[]', null]) {
      try {
        await importBackup(input);
        out.push('accepted');
      } catch (err) {
        out.push(err.message);
      }
    }
    return out;
  });
  assert.deepEqual(errors, [
    "This file isn't a Jarvis backup (it isn't valid JSON).",
    "This file isn't a Jarvis backup.",
    "This Jarvis backup is missing its version, so it can't be imported.",
    'This backup was made by a newer version of Jarvis. Update Jarvis, then try again.',
    'This Jarvis backup is damaged (conversations).',
    "This file isn't a Jarvis backup.",
    "This file isn't a Jarvis backup.",
  ]);
});

test('backup: resetApp clears everything Jarvis stored, only its own service worker and caches', async () => {
  const page = await newPage({ path: '/app/' });
  const r = await page.evaluate(async (key) => {
    const { db, backup, settings, secrets, memory, spend } = window.__mods;
    secrets.setApiKey(key);
    settings.saveSettings({ userName: 'Tony', onboarded: true });
    memory.addMemory('A fact');
    spend.addSpend(1);
    localStorage.setItem('jarvis.ui.sidebar', 'open');
    localStorage.setItem('jarvis.dev.apiBase', location.origin);
    localStorage.setItem('other-app', 'keep');
    await db.saveConversation(conv('c1', 1000));
    await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
    await navigator.serviceWorker.register('/other/sw.js', { scope: '/other/' });
    await (await caches.open('jarvis-abc12345')).put('/x', new Response('x'));
    await (await caches.open('someone-else')).put('/y', new Response('y'));
    const result = await backup.resetApp();
    return {
      result,
      settings: settings.getSettings(),
      key: secrets.getApiKey(),
      memory: memory.listMemory().length,
      spend: { ...spend.getSpend() },
      convs: (await db.listConversations()).length,
      keys: Object.keys(localStorage).sort(),
      scopes: (await navigator.serviceWorker.getRegistrations()).map((reg) => new URL(reg.scope).pathname),
      caches: (await caches.keys()).sort(),
    };
  }, KEY);
  assert.deepEqual(r.result, { ok: true, failed: [] });
  assert.equal(r.settings.userName, '');
  assert.equal(r.settings.onboarded, false);
  assert.equal(r.key, '');
  assert.equal(r.memory, 0);
  assert.equal(r.spend.totalUsd, 0);
  assert.equal(r.convs, 0);
  assert.deepEqual(r.keys, ['jarvis.dev.apiBase', 'other-app']);
  assert.deepEqual(r.scopes, ['/other/']);
  assert.deepEqual(r.caches, ['someone-else']);
});
