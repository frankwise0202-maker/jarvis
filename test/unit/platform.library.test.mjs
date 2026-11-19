// Unit tests for the saved library (src/platform/library.js), the database upgrade to version 2
// (db.js) and the library in backups (backup.js), in real Chromium with real IndexedDB (see
// platform.harness.test.mjs).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHarness, PAGE_HTML } from './platform.harness.test.mjs';
import { normalizeHologramSpec } from '../../src/lib/hologram-spec.js';
import { normalizeBlueprintSpec } from '../../src/lib/blueprint-spec.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../mock/fixtures/${name}.json`, import.meta.url), 'utf8'));
const SPECS = {
  camry: normalizeHologramSpec(fixture('camry')).spec,
  battery: normalizeHologramSpec(fixture('battery')).spec,
  alternatorPart: normalizeBlueprintSpec(fixture('alternator-part')).spec,
  cutaway: normalizeBlueprintSpec(fixture('battery-cutaway')).spec,
};
// A small, valid JPEG data URL and an oversized one.
const JPEG = `data:image/jpeg;base64,${Buffer.from('fake jpeg bytes for a thumbnail').toString('base64')}`;
const HUGE = `data:image/jpeg;base64,${'A'.repeat(61 * 1024)}`;

let h;

before(async () => {
  h = await createHarness(
    {
      db: 'src/platform/db.js',
      library: 'src/platform/library.js',
      backup: 'src/platform/backup.js',
      settings: 'src/platform/settings.js',
      prompts: 'src/engine/prompts.js',
    },
    { routes: { '/app/': { body: PAGE_HTML, type: 'text/html; charset=utf-8' } } },
  );
});

after(async () => {
  if (h) await h.close();
});

// Installed in every page before the bundle: helpers for raw IndexedDB access.
const HELPERS = () => {
  window.rawOpen = (version) => new Promise((resolve, reject) => {
    const req = version ? indexedDB.open('jarvis', version) : indexedDB.open('jarvis');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      if (version === 1) for (const name of ['conversations', 'meta']) req.result.createObjectStore(name, { keyPath: 'id' });
    };
  });
  window.rawAll = async (store) => {
    const db = await window.rawOpen();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  };
  window.rawPut = async (store, value) => {
    const db = await window.rawOpen();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  };
  window.canonical = (value) => JSON.stringify(value, (key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
};

const newPage = (opts = {}) => h.newPage({ ...opts, init: opts.init || HELPERS });
const LIB_ID = /^lib_[a-z0-9]{10}$/;

// ---- the database upgrade --------------------------------------------------------------

test('upgrade: a real version 1 database (conversations, split history, meta) upgrades to version 2 untouched', async () => {
  const page = await libPage();
  const r = await page.evaluate(async () => {
    const { LEAD_SYSTEM_V2, leadToolsV3 } = window.__mods.prompts;
    // Exactly what version 1 of the app stored: a split conversation record, its API history
    // record keyed [id, 'api'], a conversation stored whole by an even older version, and meta rows.
    const v1 = await window.rawOpen(1);
    const main = { id: 'c1', v: 1, title: 'Old chat', createdAt: 1000, updatedAt: 2000, system: LEAD_SYSTEM_V2, tools: leadToolsV3(), turns: [{ id: 'u', role: 'user', text: 'Hello', mode: 'auto', createdAt: 1000 }], pending: null, apiSplit: { count: 1, rev: 'r1' }, rev: 3 };
    const history = { id: ['c1', 'api'], rev: 'r1', apiMessages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }] };
    const whole = { id: 'c0', v: 1, title: 'Older', createdAt: 10, updatedAt: 20, system: LEAD_SYSTEM_V2, tools: leadToolsV3(), apiMessages: [], turns: [], pending: null };
    await new Promise((resolve, reject) => {
      const tx = v1.transaction(['conversations', 'meta'], 'readwrite');
      tx.objectStore('conversations').put(main);
      tx.objectStore('conversations').put(history);
      tx.objectStore('conversations').put(whole);
      tx.objectStore('meta').put({ id: 'c1', title: 'Old chat', createdAt: 1000, updatedAt: 2000, preview: 'Hello', turnCount: 1 });
      tx.objectStore('meta').put({ id: 'c0', title: 'Older', createdAt: 10, updatedAt: 20, preview: '', turnCount: 0 });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    // An "old window" keeps its version 1 connection open and steps aside on versionchange, as
    // Jarvis's own windows do.
    let steppedAside = false;
    v1.onversionchange = () => {
      steppedAside = true;
      v1.close();
    };
    const before = { conversations: window.canonical(await window.rawAll('conversations')), meta: window.canonical(await window.rawAll('meta')) };

    const { db, library } = window.__mods;
    const list = await db.listConversations();
    const c1 = await db.getConversation('c1');
    const c0 = await db.getConversation('c0');
    const after = { conversations: window.canonical(await window.rawAll('conversations')), meta: window.canonical(await window.rawAll('meta')) };
    const raw = await window.rawOpen();
    const tx = raw.transaction('library');
    const store = tx.objectStore('library');
    const layout = { version: raw.version, stores: [...raw.objectStoreNames].sort(), keyPath: store.keyPath, indexes: [...store.indexNames].sort(), byCreated: store.index('byCreated').keyPath, byPart: store.index('byPart').keyPath };
    raw.close();
    const saved = await library.saveLibraryItem({ kind: 'hologram', title: 'Battery', spec: window.battery, conversationId: 'c1' });
    return { steppedAside, before, after, list: list.map((m) => m.id), c1, c0, layout, saved, persistence: db.getPersistence() };
  });
  assert.equal(r.steppedAside, true, 'the old connection was asked to close for the upgrade');
  assert.equal(r.after.conversations, r.before.conversations, 'every conversation record is byte-for-byte as version 1 stored it');
  assert.equal(r.after.meta, r.before.meta);
  assert.deepEqual(r.list, ['c1', 'c0']);
  assert.deepEqual(r.c1.apiMessages, [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }]);
  assert.equal(r.c1.title, 'Old chat');
  assert.equal('apiSplit' in r.c1 || 'rev' in r.c1, false);
  assert.deepEqual(r.c0.apiMessages, []);
  assert.deepEqual(r.layout, { version: 2, stores: ['conversations', 'library', 'meta'], keyPath: 'id', indexes: ['byCreated', 'byPart', 'bySegment'], byCreated: 'createdAt', byPart: 'partKey' });
  assert.match(r.saved.id, LIB_ID);
  assert.equal(r.saved.persisted, true);
  assert.deepEqual(r.persistence, { persistent: true, reason: null });
});

test('upgrade: an older app version (still cached) opens the version 2 database as it is', async () => {
  const page = await newPage();
  const r = await page.evaluate(async () => {
    const { db } = window.__mods;
    await db.saveConversation({ id: 'x', v: 1, title: 't', createdAt: 1, updatedAt: 2, system: '', tools: [], apiMessages: [], turns: [], pending: null });
    // What version 1's db.js does: open('jarvis', 1) fails with VersionError, then openExisting()
    // opens the current version and uses it when conversations and meta are there.
    const versionError = await new Promise((resolve) => {
      const req = indexedDB.open('jarvis', 1);
      req.onsuccess = () => {
        req.result.close();
        resolve('opened');
      };
      req.onerror = (e) => {
        e.preventDefault();
        resolve(req.error && req.error.name);
      };
    });
    const existing = await window.rawOpen();
    const usable = existing.objectStoreNames.contains('conversations') && existing.objectStoreNames.contains('meta');
    const rows = await new Promise((resolve) => {
      const q = existing.transaction('meta').objectStore('meta').getAll();
      q.onsuccess = () => resolve(q.result.map((m) => m.id));
    });
    existing.close();
    return { versionError, usable, rows };
  });
  assert.equal(r.versionError, 'VersionError');
  assert.equal(r.usable, true);
  assert.deepEqual(r.rows, ['x']);
});

// ---- the library API --------------------------------------------------------------------

const SPEC_INIT = (specs) => {
  window.camry = specs.camry;
  window.battery = specs.battery;
  window.alternatorPart = specs.alternatorPart;
  window.cutaway = specs.cutaway;
};

async function libPage() {
  const page = await newPage();
  await page.evaluate(SPEC_INIT, SPECS);
  return page;
}

test('library: save, get (re-validated), list newest first (metadata only), kind filter, limit', async () => {
  const page = await libPage();
  const r = await page.evaluate(async () => {
    const { library } = window.__mods;
    const a = await library.saveLibraryItem({ kind: 'hologram', title: '2024 Toyota Camry Hybrid (XV70)', subject: 'Sedan', spec: window.camry, stats: { parts: 9999 }, conversationId: 'conv-1', turnId: 'turn-1', segmentId: 'seg-1', costUsd: 0.4321 });
    await new Promise((res) => setTimeout(res, 5));
    const b = await library.saveLibraryItem({ kind: 'blueprint', title: 'Alternator', spec: window.alternatorPart, parent: { model: a.id, part: 'dcdc-converter' }, partName: 'DC-DC converter', segmentId: 'seg-2' });
    await new Promise((res) => setTimeout(res, 5));
    const c = await library.saveLibraryItem({ kind: 'hologram', title: 'Battery', spec: window.battery, segmentId: 'seg-3' });
    const item = await library.getLibraryItem(a.id);
    const all = await library.listLibraryItems();
    return {
      ids: [a.id, b.id, c.id],
      persisted: [a.persisted, b.persisted, c.persisted],
      item,
      list: all.map((x) => x.id),
      rowKeys: Object.keys(all[0]).sort(),
      holograms: (await library.listLibraryItems({ kind: 'hologram' })).map((x) => x.id),
      blueprints: (await library.listLibraryItems({ kind: 'blueprint' })).map((x) => [x.id, x.sheet, x.parent, x.partName, x.stats.parts]),
      limited: (await library.listLibraryItems({ limit: 1 })).map((x) => x.id),
      missing: await library.getLibraryItem('lib_nothere00'),
      bad: await library.getLibraryItem('../etc'),
    };
  });
  const [a, b, c] = r.ids;
  for (const id of r.ids) assert.match(id, LIB_ID);
  assert.equal(new Set(r.ids).size, 3);
  assert.deepEqual(r.persisted, [true, true, true]);
  assert.equal(r.item.kind, 'hologram');
  assert.equal(r.item.title, '2024 Toyota Camry Hybrid (XV70)');
  assert.equal(r.item.subject, 'Sedan');
  assert.deepEqual(r.item.spec, SPECS.camry);
  assert.deepEqual(r.item.stats, { parts: 43, shapes: 127 }, 'stats come from the validated spec, not the caller');
  assert.equal(r.item.conversationId, 'conv-1');
  assert.equal(r.item.costUsd, 0.4321);
  assert.equal(r.item.thumbnail, null);
  assert.equal(r.item.parent, null);
  assert.deepEqual(r.list, [c, b, a]);
  assert.equal(r.rowKeys.includes('spec'), false);
  assert.equal(r.rowKeys.includes('partKey'), false);
  assert.ok(r.rowKeys.includes('thumbnail') && r.rowKeys.includes('stats') && r.rowKeys.includes('title'));
  assert.deepEqual(r.holograms, [c, a]);
  assert.deepEqual(r.blueprints, [[b, 'part', { model: a, part: 'dcdc-converter' }, 'DC-DC converter', 18]]);
  assert.deepEqual(r.limited, [c]);
  assert.equal(r.missing, null);
  assert.equal(r.bad, null);
});

test('library: findPartBlueprint (newest for the part, whole-object with null), idempotent per segment', async () => {
  const page = await libPage();
  const r = await page.evaluate(async () => {
    const { library } = window.__mods;
    const model = (await library.saveLibraryItem({ kind: 'hologram', spec: window.camry })).id;
    const older = (await library.saveLibraryItem({ kind: 'blueprint', spec: window.alternatorPart, parent: { model, part: 'dcdc-converter' }, segmentId: 's1' })).id;
    await new Promise((res) => setTimeout(res, 5));
    const newer = (await library.saveLibraryItem({ kind: 'blueprint', spec: window.alternatorPart, parent: { model, part: 'dcdc-converter' }, segmentId: 's2' })).id;
    const whole = (await library.saveLibraryItem({ kind: 'blueprint', spec: window.cutaway, parent: { model, part: null }, segmentId: 's3' })).id;
    const again = await library.saveLibraryItem({ kind: 'blueprint', spec: window.alternatorPart, parent: { model, part: 'dcdc-converter' }, segmentId: 's2' });
    return {
      model, older, newer, whole, again,
      part: (await library.findPartBlueprint(model, 'dcdc-converter'))?.id,
      object: (await library.findPartBlueprint(model, null))?.id,
      none: await library.findPartBlueprint(model, 'radiator'),
      badModel: await library.findPartBlueprint('nope', 'x'),
      badPart: await library.findPartBlueprint(model, 'Bad Part!'),
      count: (await library.listLibraryItems()).length,
    };
  });
  assert.equal(r.part, r.newer);
  assert.equal(r.object, r.whole);
  assert.equal(r.none, null);
  assert.equal(r.badModel, null);
  assert.equal(r.badPart, null);
  assert.deepEqual(r.again, { id: r.newer, persisted: true }, 'saving the same segment again returns the saved item');
  assert.equal(r.count, 4);
});

test('library: thumbnails (jpeg/png data URLs up to 60 KB only), delete is final for the session', async () => {
  const page = await libPage();
  const r = await page.evaluate(async ({ jpeg, huge }) => {
    const { library } = window.__mods;
    const id = (await library.saveLibraryItem({ kind: 'hologram', spec: window.battery })).id;
    const results = {
      ok: await library.setLibraryThumbnail(id, jpeg),
      png: await library.setLibraryThumbnail(id, 'data:image/png;base64,iVBORw0KGgo='),
      huge: await library.setLibraryThumbnail(id, huge),
      svg: await library.setLibraryThumbnail(id, 'data:image/svg+xml;base64,PHN2Zz4='),
      url: await library.setLibraryThumbnail(id, 'https://example.com/x.jpg'),
      js: await library.setLibraryThumbnail(id, 'javascript:alert(1)'),
      missing: await library.setLibraryThumbnail('lib_nothere00', jpeg),
    };
    const thumb = (await library.getLibraryItem(id)).thumbnail;
    const rowThumb = (await library.listLibraryItems())[0].thumbnail;
    const deleted = await library.deleteLibraryItem(id);
    const deletedAgain = await library.deleteLibraryItem(id);
    const afterDelete = { get: await library.getLibraryItem(id), list: (await library.listLibraryItems()).length, thumb: await library.setLibraryThumbnail(id, jpeg) };
    const raw = (await window.rawAll('library')).length;
    let rejected = null;
    try {
      await library.saveLibraryItem({ kind: 'hologram', spec: { title: 'nothing to show', parts: [] } });
    } catch (err) {
      rejected = err.name;
    }
    let rejectedKind = null;
    try {
      await library.saveLibraryItem({ kind: 'video', spec: window.battery });
    } catch (err) {
      rejectedKind = err.name;
    }
    return { results, thumb, rowThumb, deleted, deletedAgain, afterDelete, raw, rejected, rejectedKind };
  }, { jpeg: JPEG, huge: HUGE });
  assert.deepEqual(r.results, { ok: true, png: true, huge: false, svg: false, url: false, js: false, missing: false });
  assert.equal(r.thumb, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(r.rowThumb, r.thumb, 'list rows carry the thumbnail for the library sheet');
  assert.equal(r.deleted, true);
  assert.equal(r.deletedAgain, false);
  assert.deepEqual(r.afterDelete, { get: null, list: 0, thumb: false });
  assert.equal(r.raw, 0);
  assert.equal(r.rejected, 'TypeError');
  assert.equal(r.rejectedKind, 'TypeError');
});

test('library: a damaged stored record is never handed to a renderer; text is cleaned', async () => {
  const page = await libPage();
  const r = await page.evaluate(async () => {
    const { library } = window.__mods;
    const id = (await library.saveLibraryItem({ kind: 'hologram', spec: window.battery })).id;
    const stored = (await window.rawAll('library'))[0];
    // Someone (an older version, a bug, devtools) edits the records directly.
    await window.rawPut('library', { ...stored, title: 'Battery‮\u0007 <b>x</b>', stats: { parts: -1, shapes: 'lots' }, parent: { model: '<script>' } });
    const cleaned = await library.getLibraryItem(id);
    await window.rawPut('library', { ...stored, id: 'lib_broken0000', segmentId: '', spec: { title: 'x', parts: [{ id: 'a', shapes: [{ type: 'warp' }] }] } });
    await window.rawPut('library', { ...stored, id: 'lib_strange000', segmentId: '', kind: 'malware' });
    return {
      cleaned: { title: cleaned.title, stats: cleaned.stats, parent: cleaned.parent },
      broken: await library.getLibraryItem('lib_broken0000'),
      strange: await library.getLibraryItem('lib_strange000'),
      listed: (await library.listLibraryItems()).map((x) => x.id).sort(),
    };
  });
  assert.equal(r.cleaned.title, 'Battery <b>x</b>');
  assert.deepEqual(r.cleaned.stats, { parts: 9, shapes: 10 });
  assert.equal(r.cleaned.parent, null);
  assert.equal(r.broken, null, 'a spec that cannot be shown is never returned');
  assert.equal(r.strange, null);
  assert.ok(!r.listed.includes('lib_strange000'), 'unknown kinds are not listed');
});

test('library: two windows hear each other\'s changes and can save at the same time', async () => {
  const page = await libPage();
  const other = await page.context().newPage();
  await other.addInitScript(HELPERS);
  await other.goto(h.url);
  await other.waitForFunction(() => window.__ready === true);
  await other.evaluate(SPEC_INIT, SPECS);
  await other.evaluate(() => {
    window.heard = [];
    window.__mods.library.onLibraryChange((e) => window.heard.push(e));
  });
  await page.evaluate(() => {
    window.heard = [];
    window.__mods.library.onLibraryChange((e) => window.heard.push(e));
  });
  // Both windows save at once; then one sets a thumbnail and the other deletes.
  const [a, b] = await Promise.all([
    page.evaluate(() => window.__mods.library.saveLibraryItem({ kind: 'hologram', spec: window.camry, segmentId: 'win-a' })),
    other.evaluate(() => window.__mods.library.saveLibraryItem({ kind: 'hologram', spec: window.battery, segmentId: 'win-b' })),
  ]);
  assert.notEqual(a.id, b.id);
  await page.evaluate((id) => window.__mods.library.setLibraryThumbnail(id, 'data:image/png;base64,iVBORw0KGgo='), b.id);
  await other.evaluate((id) => window.__mods.library.deleteLibraryItem(id), a.id);
  await page.waitForFunction(() => window.heard.length >= 4);
  await other.waitForFunction(() => window.heard.length >= 4);
  const mine = await page.evaluate(() => window.heard);
  const theirs = await other.evaluate(() => window.heard);
  const sorted = (list) => list.map((e) => `${e.type} ${e.id} ${e.remote ? 'remote' : 'local'}`).sort();
  assert.deepEqual(sorted(mine), sorted([
    { type: 'saved', id: a.id, remote: false },
    { type: 'saved', id: b.id, remote: true },
    { type: 'thumbnail', id: b.id, remote: false },
    { type: 'deleted', id: a.id, remote: true },
  ]));
  assert.deepEqual(sorted(theirs), sorted([
    { type: 'saved', id: b.id, remote: false },
    { type: 'saved', id: a.id, remote: true },
    { type: 'thumbnail', id: b.id, remote: true },
    { type: 'deleted', id: a.id, remote: false },
  ]));
  const lists = await Promise.all([page, other].map((p) => p.evaluate(async () => (await window.__mods.library.listLibraryItems()).map((x) => [x.id, x.thumbnail]))));
  assert.deepEqual(lists[0], [[b.id, 'data:image/png;base64,iVBORw0KGgo=']]);
  assert.deepEqual(lists[1], lists[0]);
  assert.equal(await page.evaluate((id) => window.__mods.library.getLibraryItem(id), a.id), null, 'deleted in the other window: gone here too');
  await other.close();
});

test('library: storage full keeps items in memory (they still open), reports it like db.js, and writes them later', async () => {
  const page = await libPage();
  const r = await page.evaluate(async () => {
    const { library, db } = window.__mods;
    await db.listConversations(); // open the database first
    const heard = [];
    db.onPersistenceChange((p) => heard.push(p));
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put(value) {
      if (this.name === 'library') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return realPut.call(this, value);
    };
    const full = await library.saveLibraryItem({ kind: 'hologram', spec: window.camry, segmentId: 'q1' });
    const whileFull = {
      persistence: db.getPersistence(),
      isPersistent: db.isPersistent(),
      get: (await library.getLibraryItem(full.id))?.title,
      list: (await library.listLibraryItems()).map((x) => x.id),
      thumb: await library.setLibraryThumbnail(full.id, 'data:image/png;base64,iVBORw0KGgo='),
      again: await library.saveLibraryItem({ kind: 'hologram', spec: window.camry, segmentId: 'q1' }),
      raw: (await window.rawAll('library')).length,
    };
    IDBObjectStore.prototype.put = realPut; // space was freed
    const next = await library.saveLibraryItem({ kind: 'hologram', spec: window.battery, segmentId: 'q2' });
    const raw = (await window.rawAll('library')).map((x) => [x.id, x.thumbnail]).sort();
    return { full, whileFull, next, raw, persistence: db.getPersistence(), heard };
  });
  assert.match(r.full.id, LIB_ID);
  assert.equal(r.full.persisted, false);
  assert.deepEqual(r.whileFull.persistence, { persistent: false, reason: 'quota' });
  assert.equal(r.whileFull.isPersistent, false);
  assert.equal(r.whileFull.get, '2024 Toyota Camry Hybrid (XV70)');
  assert.deepEqual(r.whileFull.list, [r.full.id]);
  assert.equal(r.whileFull.thumb, true);
  assert.deepEqual(r.whileFull.again, { id: r.full.id, persisted: false }, 'the same segment is not saved twice');
  assert.equal(r.whileFull.raw, 0);
  assert.equal(r.next.persisted, true);
  assert.deepEqual(r.raw, [[r.full.id, 'data:image/png;base64,iVBORw0KGgo='], [r.next.id, null]].sort(), 'the waiting item was written with its thumbnail');
  assert.deepEqual(r.persistence, { persistent: true, reason: null });
  assert.deepEqual(r.heard, [{ persistent: false, reason: 'quota' }, { persistent: true, reason: null }]);
});

test('library: without IndexedDB (private mode) items live in memory for the session', async () => {
  const page = await newPage({
    init: () => {
      Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true });
    },
  });
  await page.evaluate(SPEC_INIT, SPECS);
  const r = await page.evaluate(async () => {
    const { library, db } = window.__mods;
    const a = await library.saveLibraryItem({ kind: 'hologram', spec: window.battery });
    return { a, get: (await library.getLibraryItem(a.id))?.kind, list: (await library.listLibraryItems()).length, persistence: db.getPersistence() };
  });
  assert.equal(r.a.persisted, false);
  assert.equal(r.get, 'hologram');
  assert.equal(r.list, 1);
  assert.deepEqual(r.persistence, { persistent: false, reason: 'unavailable' });
});

// ---- backups ------------------------------------------------------------------------------

test('backup: the library travels with thumbnails; import re-validates, merges by id (newer wins); reset clears it', async () => {
  const source = await libPage();
  const file = await source.evaluate(async () => {
    const { library, backup } = window.__mods;
    const model = (await library.saveLibraryItem({ kind: 'hologram', title: 'Camry', spec: window.camry, conversationId: 'c1' })).id;
    await library.setLibraryThumbnail(model, 'data:image/png;base64,iVBORw0KGgo=');
    await library.saveLibraryItem({ kind: 'blueprint', spec: window.alternatorPart, parent: { model, part: 'dcdc-converter' }, partName: 'DC-DC converter' });
    return (await backup.exportBackup()).text();
  });
  const exported = JSON.parse(file);
  assert.equal(exported.library.version, 1);
  assert.equal(exported.library.items.length, 2);
  const holo = exported.library.items.find((x) => x.kind === 'hologram');
  const bp = exported.library.items.find((x) => x.kind === 'blueprint');
  assert.equal(holo.thumbnail, 'data:image/png;base64,iVBORw0KGgo=');
  assert.deepEqual(holo.spec, SPECS.camry);
  assert.deepEqual(bp.parent, { model: holo.id, part: 'dcdc-converter' });
  assert.equal('partKey' in holo, false);

  const page = await libPage();
  const r = await page.evaluate(async (json) => {
    const { library, backup } = window.__mods;
    const result = await backup.importBackup(json);
    const again = await backup.importBackup(json);
    const items = await library.listLibraryItems();
    const holo = await library.getLibraryItem(items.find((x) => x.kind === 'hologram').id);
    const found = await library.findPartBlueprint(holo.id, 'dcdc-converter');
    const reset = await backup.resetApp();
    return { result, again, ids: items.map((x) => x.id), holo: { title: holo.title, thumb: holo.thumbnail, spec: holo.spec }, found: found && found.id, reset, after: (await library.listLibraryItems()).length };
  }, file);
  assert.equal(r.result.library, 2);
  assert.equal(r.again.library, 0, 'importing the same file again changes nothing');
  assert.deepEqual(r.ids.sort(), exported.library.items.map((x) => x.id).sort(), 'ids are kept');
  assert.equal(r.holo.thumb, 'data:image/png;base64,iVBORw0KGgo=');
  assert.deepEqual(r.holo.spec, SPECS.camry);
  assert.equal(r.found, bp.id);
  assert.equal(r.reset.ok, true);
  assert.equal(r.after, 0);
});

test('backup: hostile library items are rejected or cleaned; a newer local copy is kept', async () => {
  const page = await libPage();
  const r = await page.evaluate(async ({ jpeg, huge }) => {
    const { library, backup } = window.__mods;
    const local = (await library.saveLibraryItem({ kind: 'hologram', title: 'Local newer', spec: window.battery })).id;
    const now = Date.now();
    const item = (extra) => ({ id: 'lib_imported01', kind: 'hologram', title: 'Imported', spec: window.battery, createdAt: 1000, updatedAt: 2000, ...extra });
    const items = [
      item({ id: 'lib_ok00000001', thumbnail: jpeg, parent: { model: 'lib_ok00000002', part: 'x' }, extra: '<script>', costUsd: 0.25 }),
      item({ id: 'lib_ok00000002', kind: 'blueprint', spec: window.cutaway, thumbnail: 'https://evil.example/x.png', parent: { model: 'lib_ok00000001', part: 'Bad Part' }, partName: 'P' }),
      item({ id: 'lib_ok00000003', thumbnail: huge, title: 'x'.repeat(500), conversationId: 'y'.repeat(500), createdAt: -5, updatedAt: 'soon' }),
      item({ id: 'lib_ok00000004', spec: { title: 'Aliases', parts: [{ id: 'P1', name: 'Part', info: 'i', shapes: [{ type: 'cube', position: [0, 0, 0], size: [1, 1, 1] }] }] } }),
      item({ id: 'NOT-AN-ID' }),
      item({ id: 'lib_short' }),
      item({ id: 'lib_badkind001', kind: 'video' }),
      item({ id: 'lib_badspec001', spec: { title: 'x', parts: [] } }),
      item({ id: 'lib_nospec0001', spec: null }),
      null,
      'junk',
      item({ id: local, title: 'Older in backup', updatedAt: 1 }),
      item({ id: 'lib_svgthumb01', thumbnail: 'data:image/svg+xml;base64,PHN2Zz4=' }),
    ];
    const result = await backup.importBackup({ app: 'jarvis', version: 1, library: { version: 1, items } });
    const get = (id) => library.getLibraryItem(id);
    const out = {
      result,
      ok1: await get('lib_ok00000001'),
      ok2: await get('lib_ok00000002'),
      ok3: await get('lib_ok00000003'),
      ok4: await get('lib_ok00000004'),
      svg: (await get('lib_svgthumb01'))?.thumbnail,
      local: (await get(local)).title,
      all: (await library.listLibraryItems()).map((x) => x.id).sort(),
      newer: await backup.importBackup({ app: 'jarvis', version: 1, library: { version: 2, items: [item({ id: 'lib_future0001' })] } }),
      bare: await backup.importBackup({ app: 'jarvis', version: 1, library: [item({ id: 'lib_bare000001' })] }),
    };
    let damaged = null;
    try {
      await backup.importBackup({ app: 'jarvis', version: 1, library: 'everything' });
    } catch (err) {
      damaged = err.message;
    }
    out.damaged = damaged;
    out.now = now;
    return out;
  }, { jpeg: JPEG, huge: HUGE });
  assert.equal(r.result.library, 5, 'ok1-ok4 and the svg one (without its thumbnail); nothing else');
  assert.equal(r.ok1.thumbnail, JPEG);
  assert.equal(r.ok1.parent, null, 'holograms have no parent');
  assert.equal('extra' in r.ok1, false);
  assert.equal(r.ok1.costUsd, 0.25);
  assert.equal(r.ok2.thumbnail, null, 'only data: thumbnails');
  assert.equal(r.ok2.parent, null, 'an invalid part id unlinks the blueprint');
  assert.equal(r.ok2.sheet, 'cutaway');
  assert.equal(r.ok3.thumbnail, null, 'oversized thumbnail dropped, item kept');
  assert.equal(r.ok3.title.length, 80);
  assert.equal(r.ok3.conversationId, '');
  assert.ok(r.ok3.createdAt >= r.now - 60000, 'a bad date becomes the import time');
  assert.deepEqual(r.ok4.spec.parts[0].shapes, [{ type: 'box', at: [0, 0, 0], size: [1, 1, 1] }], 'specs are re-normalized');
  assert.equal(r.ok4.spec.parts[0].id, 'p1');
  assert.equal(r.svg, null);
  assert.equal(r.local, 'Local newer', 'the newer local copy wins');
  assert.equal(r.all.length, 6);
  assert.equal(r.newer.library, 0, 'a library from a newer app version is left out');
  assert.equal(r.bare.library, 1, 'a bare array is accepted');
  assert.match(r.damaged, /damaged \(library\)/);
});

test('backup: hologram and blueprint chat cards survive a round trip; specs are re-validated, nothing is left building', async () => {
  const page = await libPage();
  const r = await page.evaluate(async () => {
    const { backup, db } = window.__mods;
    const { LEAD_SYSTEM_V3, leadToolsV4 } = window.__mods.prompts;
    const segs = [
      { id: 'h1', kind: 'hologram', req: 0, toolUseId: 'toolu_1', status: 'done', title: 'Battery', subtitle: 'AA', spec: window.battery, stats: { parts: 9, shapes: 10 }, warnings: ['w'], libraryId: 'lib_abcdefghij', fromLibrary: false },
      { id: 'h2', kind: 'hologram', req: 0, toolUseId: 'toolu_2', status: 'building', title: 'Half', subtitle: '', spec: { ...window.battery, parts: window.battery.parts.slice(0, 2) }, stats: { parts: 2, shapes: 2 }, warnings: [], libraryId: null, fromLibrary: false },
      { id: 'b1', kind: 'blueprint', req: 1, toolUseId: 'toolu_3', status: 'done', title: 'Alt', subject: '', sheet: 'part', spec: window.alternatorPart, stats: {}, warnings: [], libraryId: 'lib_bbbbbbbbbb', for: { model: 'lib_abcdefghij', part: 'dcdc-converter' }, fromLibrary: true },
      { id: 'b2', kind: 'blueprint', req: 1, toolUseId: 'toolu_4', status: 'done', title: 'Broken', spec: { title: 'nothing' }, libraryId: '<img>', for: { model: 'nope' } },
      { id: 'h3', kind: 'hologram', req: 1, toolUseId: 'toolu_5', status: 'done', title: 'Evil', spec: { title: 'x', parts: [{ id: 'a', shapes: [{ type: 'warp' }] }] } },
    ];
    const conv = {
      id: 'holo', v: 1, title: 'Holograms', createdAt: 1000, updatedAt: 2000, system: LEAD_SYSTEM_V3, tools: leadToolsV4(),
      apiMessages: [{ role: 'user', content: [{ type: 'text', text: 'Show me' }] }],
      turns: [
        { id: 'u', role: 'user', text: 'Blueprint: DC-DC converter (Camry)', mode: 'auto', createdAt: 1000 },
        { id: 'j', role: 'jarvis', status: 'done', createdAt: 1001, endedAt: 2000, mode: 'auto', leadModel: 'claude-opus-5-5', workerModel: 'claude-sonnet-5-5', depth: 'balanced', segments: segs, missions: {}, usage: {}, costUsd: 0, stats: {}, error: null, blueprintFor: { model: 'lib_abcdefghij', part: 'dcdc-converter' } },
      ],
      pending: null,
    };
    const result = await backup.importBackup({ app: 'jarvis', version: 1, conversations: [conv] });
    const back = await db.getConversation('holo');
    return { result, turn: back.turns[1] };
  });
  assert.equal(r.result.conversations, 1);
  const byId = Object.fromEntries(r.turn.segments.map((s) => [s.id, s]));
  assert.deepEqual(r.turn.blueprintFor, { model: 'lib_abcdefghij', part: 'dcdc-converter' });
  assert.equal(byId.h1.status, 'done');
  assert.deepEqual(byId.h1.spec, SPECS.battery);
  assert.deepEqual(byId.h1.stats, { parts: 9, shapes: 10 });
  assert.equal(byId.h1.libraryId, 'lib_abcdefghij');
  assert.deepEqual(byId.h1.warnings, ['w']);
  assert.equal(byId.h2.status, 'error', 'a card that never finished is not still building');
  assert.equal(byId.h2.spec.parts.length, 2, 'it keeps what was built');
  assert.equal(byId.b1.status, 'done');
  assert.deepEqual(byId.b1.spec, SPECS.alternatorPart);
  assert.equal(byId.b1.stats.parts, 18);
  assert.equal(byId.b1.fromLibrary, true);
  assert.deepEqual(byId.b1.for, { model: 'lib_abcdefghij', part: 'dcdc-converter' });
  assert.equal(byId.b2.status, 'error');
  assert.equal(byId.b2.spec, null);
  assert.equal(byId.b2.libraryId, null);
  assert.equal(byId.b2.for, null);
  assert.equal(byId.h3.status, 'error');
  assert.equal(byId.h3.spec, null);
});

test('db: replacing the last (unsent) message object is stored, as the engine does to complete a turn context', async () => {
  const page = await libPage();
  const r = await page.evaluate(async () => {
    const { db } = window.__mods;
    const { LEAD_SYSTEM_V3, leadToolsV4 } = window.__mods.prompts;
    const conv = { id: 'ctx', v: 1, title: 't', createdAt: 1, updatedAt: 2, system: LEAD_SYSTEM_V3, tools: leadToolsV4(), turns: [], pending: null,
      apiMessages: [{ role: 'user', content: [{ type: 'text', text: '<turn_context>\nMemory: none saved\n</turn_context>' }, { type: 'text', text: 'Hi' }] }] };
    await db.saveConversation(conv); // the engine's first save, before the library answered
    const first = conv.apiMessages[0];
    conv.apiMessages[0] = { ...first, content: [{ ...first.content[0], text: '<turn_context>\nMemory: none saved\nSaved holograms and blueprints (reopen with open_saved instead of rebuilding):\n- lib_ab12cd34ef · hologram · "Camry" (43 parts)\n</turn_context>' }, first.content[1]] };
    conv.updatedAt = 3;
    await db.saveConversation(conv);
    return (await db.getConversation('ctx')).apiMessages[0].content[0].text;
  });
  assert.match(r, /Saved holograms and blueprints/);
});
