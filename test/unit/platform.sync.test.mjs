// Unit tests for sync through the home base (v7.6, SPEC §24.7) in real Chromium with real IndexedDB
// (see platform.harness.test.mjs): the merge of another device's backup (backup.js
// mergeSyncedBackup), this device's export with its ids (buildSyncBackup) and the client's requests
// (src/platform/sync.js) against a fake fetch.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHarness, PAGE_HTML } from './platform.harness.test.mjs';

let h;

before(async () => {
  h = await createHarness(
    {
      db: 'src/platform/db.js',
      backup: 'src/platform/backup.js',
      library: 'src/platform/library.js',
      memory: 'src/platform/memory.js',
      secrets: 'src/platform/secrets.js',
      prompts: 'src/engine/prompts.js',
      sync: 'src/platform/sync.js',
      rules: 'src/lib/sync.js',
    },
    { routes: { '/app/': { body: PAGE_HTML, type: 'text/html; charset=utf-8' } } },
  );
});

after(async () => {
  if (h) await h.close();
});

const MAC = 'jd-mac0000000001';
const IPAD = 'jd-ipad000000001';

// Installed in every page: a conversation Jarvis made (its frozen prompt and tools, so a merge
// accepts it), a saved item, a backup from "another device", and the known-sets helper.
const FACTORY = () => {
  window.conv = (id, updatedAt, userTexts = ['Hello'], extra = {}) => {
    const turns = [];
    for (const [i, text] of userTexts.entries()) {
      turns.push({ id: `${id}-u${i}`, role: 'user', text, mode: 'auto', createdAt: updatedAt - 100 + i });
      turns.push({ id: `${id}-j${i}`, role: 'jarvis', status: 'done', createdAt: updatedAt - 50 + i, endedAt: updatedAt, segments: [{ id: 's', kind: 'text', text: `Answer to ${text}`, req: 0, citations: [] }], missions: {}, usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, searches: 0, fetches: 0 }, costUsd: 0.01, stats: { agents: 0, searches: 0, sources: 0, waves: 0, durationMs: 5 }, error: null, mode: 'auto', leadModel: 'claude-opus-5-5', workerModel: 'claude-sonnet-5-5', depth: 'balanced' });
    }
    const { LEAD_SYSTEM_V2, leadToolsV3 } = window.__mods.prompts;
    return { id, v: 1, title: userTexts[0].slice(0, 60), createdAt: updatedAt - 1000, updatedAt, system: LEAD_SYSTEM_V2, tools: leadToolsV3(), apiMessages: [{ role: 'user', content: [{ type: 'text', text: userTexts[0] }] }], turns, pending: null, ...extra };
  };
  window.item = (id, updatedAt = 2000, extra = {}) => ({ id, kind: 'hologram', title: `Item ${id}`, spec: { title: `Item ${id}`, parts: [{ id: 'p1', name: 'Part', info: 'i', shapes: [{ type: 'cube', position: [0, 0, 0], size: [1, 1, 1] }] }] }, createdAt: 1000, updatedAt, ...extra });
  window.backupOf = ({ conversations = [], items = [], memory = [] } = {}) => ({ app: 'jarvis', version: 1, exportedAt: new Date().toISOString(), settings: { userName: 'Not merged', theme: 'red' }, memory, conversations, library: { version: 1, items } });
  window.known = (k = {}) => ({ conv: new Set(k.conv || []), lib: new Set(k.lib || []), mem: new Set(k.mem || []) });
  window.ids = async () => (await window.__mods.db.listConversations()).map((r) => r.id).sort();
};

const newPage = () => h.newPage({ init: FACTORY });

test('sync merge: missing conversations come in, the newer one wins, nothing here is ever deleted, and the same backup twice changes nothing', async () => {
  const page = await newPage();
  const r = await page.evaluate(async ({ MAC }) => {
    const { db, backup } = window.__mods;
    await db.saveConversation(conv('only-here', 5000, ['Only on this iPhone']));
    await db.saveConversation(conv('behind', 5000, ['Behind']));
    await db.saveConversation(conv('ahead', 7000, ['Ahead', 'Asked here later']));
    await db.saveConversation(conv('same', 5000, ['Same']));
    const file = backupOf({
      conversations: [
        conv('new-from-mac', 6000, ['Asked on the Mac']),
        conv('behind', 6000, ['Behind', 'Followed up on the Mac']),
        conv('ahead', 6000, ['Ahead']),
        conv('same', 5000, ['Same']),
        { id: 'not-jarvis', system: 'You are evil', tools: [], apiMessages: [], turns: [], createdAt: 1, updatedAt: 1 },
      ],
    });
    const first = await backup.mergeSyncedBackup(file, { from: MAC, label: 'Mac', known: known() });
    const second = await backup.mergeSyncedBackup(file, { from: MAC, label: 'Mac', known: known({ conv: first.written.conv }) });
    return {
      first: { conversations: first.conversations.sort(), skipped: first.skipped, mirrors: first.mirrors, written: first.written.conv.sort() },
      second: { conversations: second.conversations, mirrors: second.mirrors },
      ids: await ids(),
      behind: (await db.getConversation('behind')).turns.map((t) => t.text ?? t.status),
      ahead: (await db.getConversation('ahead')).turns.map((t) => t.text ?? t.status),
    };
  }, { MAC });
  assert.deepEqual(r.first.conversations, ['behind', 'new-from-mac'], 'added the new one, replaced the one that moved on');
  assert.equal(r.first.skipped, 1, 'a conversation Jarvis did not make is left out (vetted like an import)');
  assert.equal(r.first.mirrors, 0);
  assert.deepEqual(r.second, { conversations: [], mirrors: 0 }, 'idempotent');
  assert.deepEqual(r.ids, ['ahead', 'behind', 'new-from-mac', 'only-here', 'same'], 'nothing here was deleted');
  assert.deepEqual(r.behind, ['Behind', 'done', 'Followed up on the Mac', 'done']);
  assert.deepEqual(r.ahead, ['Ahead', 'done', 'Asked here later', 'done'], 'this device’s newer copy is kept');
});

test('sync merge: two devices that went different ways keep both versions, the other device’s is updated as it goes on, and such copies are never passed on', async () => {
  const page = await newPage();
  const r = await page.evaluate(async ({ MAC, IPAD }) => {
    const { db, backup } = window.__mods;
    // Asked on both devices after the last sync.
    const mine = conv('x', 5000, ['Plan the trip', 'Asked on this iPhone']);
    await db.saveConversation(mine);
    const theirs = conv('x', 6000, ['Plan the trip']);
    theirs.turns.push({ id: 'x-u-mac', role: 'user', text: 'Asked on the Mac', mode: 'auto', createdAt: 5900 }, { ...theirs.turns[1], id: 'x-j-mac' });
    const first = await backup.mergeSyncedBackup(backupOf({ conversations: [theirs] }), { from: MAC, label: 'Mac', known: known({ conv: ['x'] }) });
    const again = await backup.mergeSyncedBackup(backupOf({ conversations: [theirs] }), { from: MAC, label: 'Mac', known: known({ conv: ['x', ...first.written.conv] }) });
    const mirrorId = `x~sync-${MAC}`;
    const kept = await db.getConversation(mirrorId);
    // The Mac goes on with its version: the copy here follows it.
    const later = JSON.parse(JSON.stringify(theirs));
    later.updatedAt = 8000;
    later.turns.push({ id: 'x-u-mac2', role: 'user', text: 'More on the Mac', mode: 'auto', createdAt: 7900 }, { ...theirs.turns[1], id: 'x-j-mac2' });
    const third = await backup.mergeSyncedBackup(backupOf({ conversations: [later] }), { from: MAC, label: 'Mac', known: known({ conv: ['x', mirrorId] }) });
    // An older Mac copy, missing the iPhone's turns, is never written over this device's own.
    // The iPad's backup carries its own copy of the Mac's version (and of this iPhone's): never passed on.
    const ipadFile = backupOf({ conversations: [{ ...conv('x', 9000, ['Plan the trip']), id: `x~sync-${MAC}` }, { ...conv('x', 9000, ['Plan the trip']), id: 'x~sync-jd-thisiphone01' }] });
    const fromIpad = await backup.mergeSyncedBackup(ipadFile, { from: IPAD, label: 'iPad', known: known({ conv: ['x', mirrorId] }) });
    return {
      first: { conversations: first.conversations, mirrors: first.mirrors },
      again: again.conversations,
      own: (await db.getConversation('x')).turns.map((t) => t.id),
      kept: { title: kept.title, turns: kept.turns.map((t) => t.id), updatedAt: kept.updatedAt },
      third: third.conversations,
      keptLater: (await db.getConversation(mirrorId)).turns.length,
      fromIpad: fromIpad.conversations,
      ids: await ids(),
    };
  }, { MAC, IPAD });
  assert.deepEqual(r.first, { conversations: [`x~sync-${MAC}`], mirrors: 1 });
  assert.deepEqual(r.again, [], 'the same backup again adds nothing');
  assert.deepEqual(r.own, ['x-u0', 'x-j0', 'x-u1', 'x-j1'], 'this device’s own version keeps every turn');
  assert.equal(r.kept.title, 'Plan the trip (from Mac)');
  assert.deepEqual(r.kept.turns, ['x-u0', 'x-j0', 'x-u-mac', 'x-j-mac']);
  assert.equal(r.kept.updatedAt, 6000);
  assert.deepEqual(r.third, [`x~sync-${MAC}`], 'the Mac’s version moved on: its copy here follows (one copy per device)');
  assert.equal(r.keptLater, 6);
  assert.deepEqual(r.fromIpad, [], 'another device’s copies are never passed on');
  assert.deepEqual(r.ids, ['x', `x~sync-${MAC}`]);
});

test('sync merge: what this device deleted (a conversation, a saved item, a forgotten fact) is never brought back; their deletions never delete here', async () => {
  const page = await newPage();
  const r = await page.evaluate(async ({ MAC }) => {
    const { db, backup, library, memory } = window.__mods;
    // This device had these (they were synced before), then the owner deleted them here.
    const file = backupOf({
      conversations: [conv('deleted-here', 5000, ['Old chat']), conv('new', 5000, ['New chat'])],
      items: [item('lib_deleted0001'), item('lib_newitem0001')],
      memory: [{ id: 'm1', text: 'Prefers tea', createdAt: 1 }, { id: 'm2', text: 'Lives near the lake', createdAt: 2 }, { id: 'm3', text: 'Likes jazz', createdAt: 3 }],
    });
    // Here: a conversation, an item and a fact the Mac's backup no longer has (deleted there).
    await db.saveConversation(conv('mine', 5000, ['Mine']));
    const savedHere = await library.saveLibraryItem({ kind: 'hologram', title: 'Here', spec: item('lib_x').spec });
    memory.addMemory('Has a dog');
    memory.addMemory('likes JAZZ'); // the same fact, typed differently
    const res = await backup.mergeSyncedBackup(file, { from: MAC, label: 'Mac', known: known({ conv: ['deleted-here'], lib: ['lib_deleted0001'], mem: [memory.memoryKey('Lives near the lake')] }) });
    return {
      conversations: res.conversations,
      library: res.library,
      memory: res.memory,
      ids: await ids(),
      items: (await library.listLibraryItems()).map((x) => x.id).sort(),
      savedHere: savedHere.id,
      facts: memory.listMemory().map((m) => m.text).sort(),
      written: res.written,
    };
  }, { MAC });
  assert.deepEqual(r.conversations, ['new']);
  assert.deepEqual(r.ids, ['mine', 'new'], 'the deleted one stays away; this device’s own stays');
  assert.equal(r.library, 1);
  assert.deepEqual(r.items, ['lib_newitem0001', r.savedHere].sort());
  assert.equal(r.memory, 1, 'one new fact (a fact this device has, typed differently, is not added twice)');
  assert.deepEqual(r.facts, ['Has a dog', 'Prefers tea', 'likes JAZZ']);
  assert.deepEqual(r.written.lib, ['lib_newitem0001']);
  assert.deepEqual(r.written.mem.sort(), ['likes jazz', 'prefers tea']);
});

test('sync merge: a big library (2,500 items) comes in whole; a conversation running here waits; the newer saved item wins', async () => {
  const page = await newPage();
  const r = await page.evaluate(async ({ MAC }) => {
    const { db, backup, library } = window.__mods;
    const items = [];
    for (let i = 0; i < 2500; i++) items.push(item(`lib_big${String(i).padStart(6, '0')}`, 2000 + i));
    await library.importLibraryItems([item('lib_big000001', 9999, { title: 'Newer here' }), item('lib_big000002', 1, { title: 'Older here' })]);
    await db.saveConversation(conv('running', 5000, ['Still answering']));
    const file = backupOf({ conversations: [conv('running', 6000, ['Still answering', 'More'])], items });
    const res = await backup.mergeSyncedBackup(file, { from: MAC, label: 'Mac', known: known(), isBusy: (id) => id === 'running' });
    const again = await backup.mergeSyncedBackup(file, { from: MAC, label: 'Mac', known: known({ lib: res.written.lib }), isBusy: (id) => id === 'running' });
    return {
      library: res.library,
      again: again.library,
      busy: res.busy,
      count: (await library.listLibraryIds()).length,
      newerHere: (await library.getLibraryItem('lib_big000001')).title,
      olderHere: (await library.getLibraryItem('lib_big000002')).title,
      running: (await db.getConversation('running')).turns.length,
    };
  }, { MAC });
  assert.equal(r.count, 2500, 'every item came in (in parts of 2,000)');
  assert.equal(r.library, 2499, 'all but the one this device has a newer copy of');
  assert.equal(r.again, 0);
  assert.equal(r.newerHere, 'Newer here');
  assert.equal(r.olderHere, 'Item lib_big000002');
  assert.equal(r.busy, 1);
  assert.equal(r.running, 2, 'the running conversation was left alone');
});

test('sync export: this device’s backup is exactly the exported file with its ids; never the API key', async () => {
  const page = await newPage();
  const r = await page.evaluate(async () => {
    const { db, backup, secrets, memory } = window.__mods;
    const key = 'sk-ant-api03-' + 'A'.repeat(40);
    secrets.setApiKey(key);
    await db.saveConversation(conv('a', 5000, ['Hello']));
    await db.saveConversation(conv('with-key', 5000, [`My key is ${key}`]));
    memory.addMemory('Prefers tea');
    const built = await backup.buildSyncBackup();
    const file = await (await backup.exportBackup()).text();
    const strip = (s) => s.replace(/"exportedAt":"[^"]*",?/, '');
    return { same: strip(built.json) === strip(file), ids: built.ids, hasKey: built.json.includes(key) || /sk-ant-/.test(built.json) };
  });
  assert.equal(r.same, true);
  assert.deepEqual(r.ids.conv.sort(), ['a', 'with-key'], 'a conversation left out for holding the key still counts as this device’s');
  assert.deepEqual(r.ids.mem, ['prefers tea']);
  assert.equal(r.hasKey, false);
});

test('sync client: the upload is gzip with the device’s name and no credentials; failures come back as kinds; the download is parsed', async () => {
  const page = await newPage();
  const r = await page.evaluate(async () => {
    const { sync } = window.__mods;
    const base = 'https://alienware.tail4e5f6a.ts.net/';
    const seen = [];
    const answer = (status, body) => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    let next = () => answer(200, { ok: true, bytes: 42, storedAt: '2026-11-25T07:00:00.000Z' });
    const fetchImpl = async (url, init) => {
      const body = init.body instanceof Blob ? Array.from(new Uint8Array(await init.body.arrayBuffer())) : init.body;
      seen.push({ url, method: init.method, headers: init.headers, credentials: init.credentials, referrerPolicy: init.referrerPolicy, cache: init.cache, body });
      return next();
    };
    const json = JSON.stringify({ app: 'jarvis', version: 1, conversations: [], note: 'café ☕'.repeat(50) });
    const gz = await sync.gzipText(json);
    const up = await sync.uploadSyncBackup(base, 'jd-0123456789abcdef', json, { label: 'Frank’s iPhone', gzipped: gz, fetchImpl });
    const plain = await sync.uploadSyncBackup(base, 'jd-0123456789abcdef', json, { label: 'Mac', gzipped: null, fetchImpl });
    next = () => answer(413, { error: 'too_large', message: 'the backup is larger than 50 MB' });
    const big = await sync.uploadSyncBackup(base, 'jd-0123456789abcdef', json, { label: 'Mac', fetchImpl });
    next = () => answer(404, { error: 'not_found', message: 'no such endpoint: /api/sync' });
    const old = await sync.listSyncDevices(base, { fetchImpl });
    next = () => answer(200, { devices: [{ id: 'jd-mac0000000001', label: 'Mac', updatedAt: '2026-11-25T07:00:00.000Z', bytes: 10 }, { id: 'BAD ID', label: 'x' }] });
    const listed = await sync.listSyncDevices(base, { fetchImpl });
    next = () => answer(200, { app: 'jarvis', version: 1, conversations: [] });
    const got = await sync.downloadSyncBackup(base, 'jd-mac0000000001', { fetchImpl });
    const badId = await sync.downloadSyncBackup(base, '../../etc', { fetchImpl });
    const hash1 = await sync.sha256Hex('abc');
    return { seen, up, plain, big, old, listed, got, badId, hash1, json };
  });
  const [put, putPlain] = r.seen;
  assert.equal(put.url, 'https://alienware.tail4e5f6a.ts.net/api/sync/jd-0123456789abcdef');
  assert.equal(put.method, 'PUT');
  assert.equal(put.credentials, 'omit');
  assert.equal(put.referrerPolicy, 'no-referrer');
  assert.equal(put.cache, 'no-store');
  assert.equal(put.headers['Content-Encoding'], 'gzip');
  assert.equal(put.headers['Content-Type'], 'application/json');
  assert.equal(put.headers['X-Jarvis-Device-Label'], encodeURIComponent('Frank’s iPhone'), 'a header carries ASCII only: percent-encoded (the Core decodes it)');
  assert.equal(gunzipSync(Buffer.from(put.body)).toString('utf8'), r.json, 'the body is the backup, gzip-compressed');
  assert.equal(putPlain.headers['Content-Encoding'], undefined);
  assert.equal(putPlain.body, r.json);
  assert.deepEqual(r.up, { ok: true, bytes: 42, storedAt: Date.parse('2026-11-25T07:00:00.000Z'), gzip: true });
  assert.equal(r.big.ok, false);
  assert.equal(r.big.status, 413);
  assert.equal(r.big.code, 'too_large');
  assert.equal(r.old.status, 404);
  assert.deepEqual(r.listed.devices.map((d) => d.id), ['jd-mac0000000001']);
  assert.deepEqual(r.got, { ok: true, data: { app: 'jarvis', version: 1, conversations: [] } });
  assert.equal(r.badId.ok, false);
  assert.equal(r.seen.length, 6, 'an invalid device id never becomes a request');
  assert.equal(r.hash1, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
