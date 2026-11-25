// Unit tests for sync through the home base (v7.6, SPEC §24.7): the pure rules (src/lib/sync.js) and
// the controller (src/ui/sync.js createSync) with a fake Core client, fake data and a fake clock.
// The merge itself runs against real IndexedDB in platform.sync.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newDeviceId,
  validDeviceId,
  isMirrorId,
  mirrorIdOf,
  mirrorTitle,
  fingerprintText,
  utf8Bytes,
  syncDevicesView,
  devicesToPull,
  conversationAction,
  mirrorAction,
  syncProblem,
  lastSyncedText,
  formatMegabytes,
  SYNC_MAX_BYTES,
  SYNC_DEBOUNCE_MS,
  SYNC_INTERVAL_MS,
} from '../../src/lib/sync.js';
import { createSync, addedText, SYNC_KEY, SYNC_KNOWN_KEY } from '../../src/ui/sync.js';

// ---- the pure rules ---------------------------------------------------------------------------------

test('sync: device ids are random, the Core’s shape (a-z, 0-9, -; 8 to 64), and checked', () => {
  const id = newDeviceId(Uint8Array.from({ length: 12 }, (_, i) => i * 21));
  assert.equal(id, 'jd-00152a3f54697e93a8bdd2e7');
  assert.ok(validDeviceId(id));
  assert.match(newDeviceId(crypto.getRandomValues(new Uint8Array(12))), /^jd-[0-9a-f]{24}$/);
  assert.throws(() => newDeviceId(new Uint8Array(4)));
  for (const bad of ['', 'short', 'UPPER-case-id', 'has space id', 'x'.repeat(65), 'jd_underscore', null, 42]) assert.equal(validDeviceId(bad), false, String(bad));
});

test('sync: another device’s version of a conversation has its own id and title, and is recognised', () => {
  assert.equal(mirrorIdOf('c_abc', 'jd-1234567890'), 'c_abc~sync-jd-1234567890');
  assert.ok(isMirrorId('c_abc~sync-jd-1234567890'));
  assert.equal(isMirrorId('c_abc~backup-6000'), false, 'an import’s copy is an ordinary conversation');
  assert.equal(isMirrorId(undefined), false);
  assert.equal(mirrorTitle('Espresso machines', 'Mac'), 'Espresso machines (from Mac)');
  assert.equal(mirrorTitle('  ', ''), 'Conversation (from another device)');
  assert.equal(mirrorTitle('Plan', 'Mac\u0000‮ evil'), 'Plan (from Mac evil)', 'the label is cleaned');
});

test('sync: the fingerprint ignores only exportedAt; sizes count UTF-8 bytes like the Core', () => {
  const a = '{"app":"jarvis","version":1,"exportedAt":"2026-11-25T07:00:00.000Z","settings":{"userName":"exportedAt"}}';
  const b = '{"app":"jarvis","version":1,"exportedAt":"2026-11-25T07:10:00.000Z","settings":{"userName":"exportedAt"}}';
  assert.equal(fingerprintText(a), fingerprintText(b));
  assert.equal(fingerprintText(a), '{"app":"jarvis","version":1,"settings":{"userName":"exportedAt"}}');
  assert.notEqual(fingerprintText(a), fingerprintText(a.replace('"userName":"exportedAt"', '"userName":"Frank"')));
  for (const s of ['plain', 'café ☕', '👍🏽 emoji and 漢字', '\ud800 lone surrogate', '']) assert.equal(utf8Bytes(s), Buffer.byteLength(s, 'utf8'), s);
  assert.equal(SYNC_MAX_BYTES, 50 * 1024 * 1024);
  assert.equal(formatMegabytes(52_428_801), '52 MB');
  assert.equal(formatMegabytes(1_500_000), '1.5 MB');
});

test('sync: the Core’s device list is checked (ids, labels, times, sizes) and sorted newest first', () => {
  const v = syncDevicesView({
    devices: [
      { id: 'jd-aaaaaaaaaaaa', label: 'iPhone', updatedAt: '2026-11-25T06:00:00.000Z', bytes: 1200 },
      { id: 'jd-bbbbbbbbbbbb', label: 'Mac\u0007', updatedAt: '2026-11-25T07:00:00.000Z', bytes: null },
      { id: '../etc/passwd', label: 'x', updatedAt: '2026-11-25T08:00:00.000Z' },
      { id: 'jd-aaaaaaaaaaaa', label: 'duplicate' },
      { id: 'jd-cccccccccccc', label: '', updatedAt: 'not a time', bytes: -4 },
      'junk',
    ],
  });
  assert.deepEqual(v.devices.map((d) => [d.id, d.label, d.bytes]), [
    ['jd-bbbbbbbbbbbb', 'Mac', null],
    ['jd-aaaaaaaaaaaa', 'iPhone', 1200],
    ['jd-cccccccccccc', 'Device', null],
  ]);
  assert.equal(v.devices[0].at, Date.parse('2026-11-25T07:00:00.000Z'));
  assert.equal(v.devices[2].at, null);
  assert.equal(syncDevicesView({ nope: [] }), null);
  assert.equal(syncDevicesView(null), null);
});

test('sync: only the other devices whose backup changed since the last merge are pulled', () => {
  const devices = [
    { id: 'jd-self00000000', updatedAt: 't3' },
    { id: 'jd-mac000000000', updatedAt: 't2' },
    { id: 'jd-ipad00000000', updatedAt: 't1' },
    { id: 'jd-new000000000', updatedAt: '' },
  ];
  const pull = devicesToPull(devices, { selfId: 'jd-self00000000', merged: { 'jd-mac000000000': 't2', 'jd-ipad00000000': 't0' } });
  assert.deepEqual(pull.map((d) => d.id), ['jd-ipad00000000']);
  assert.deepEqual(devicesToPull(devices, { selfId: 'jd-self00000000' }).map((d) => d.id), ['jd-mac000000000', 'jd-ipad00000000']);
});

test('sync: conversation conflicts — the newer wins, a conversation never loses turns, deletions are never undone or spread', () => {
  const r = (updatedAt, turnIds, id = 'c1') => ({ id, updatedAt, turnIds });
  // Missing here.
  assert.equal(conversationAction({ remote: r(5, ['a']), local: null }), 'add');
  assert.equal(conversationAction({ remote: r(5, ['a']), local: null, known: true }), 'deleted', 'deleted here: it stays away');
  // The same version.
  assert.equal(conversationAction({ remote: r(5, ['a']), local: r(5, ['a']) }), 'same');
  assert.equal(conversationAction({ remote: r(5, ['a']), local: r(5, []), busy: true }), 'same');
  // Theirs moved on (every local turn is in theirs): replaced. Ours moved on: nothing to do.
  assert.equal(conversationAction({ remote: r(6, ['a', 'b']), local: r(5, ['a']) }), 'replace');
  assert.equal(conversationAction({ remote: r(4, ['a']), local: r(5, ['a', 'b']) }), 'older');
  // Running here: left for the next sync.
  assert.equal(conversationAction({ remote: r(6, ['a', 'b']), local: r(5, ['a']), busy: true }), 'busy');
  // They went different ways (each has turns the other lacks): theirs is kept next to ours, whichever is newer.
  assert.equal(conversationAction({ remote: r(6, ['a', 'theirs']), local: r(5, ['a', 'ours']) }), 'mirror');
  assert.equal(conversationAction({ remote: r(4, ['a', 'theirs']), local: r(5, ['a', 'ours']) }), 'mirror');
  // A retried answer on the other device (a turn replaced): this device's turn is never dropped.
  assert.equal(conversationAction({ remote: r(9, ['u0', 'j0-retry']), local: r(5, ['u0', 'j0']) }), 'mirror');
  // Another device's copy of a third device's version is never passed on.
  assert.equal(conversationAction({ remote: r(9, ['a'], 'c1~sync-jd-ipad00000000'), local: null }), 'pass');
  assert.equal(conversationAction({ remote: null }), 'pass');
  // The kept version follows that device.
  assert.equal(mirrorAction({ remote: r(7, []), mirror: null }), 'add');
  assert.equal(mirrorAction({ remote: r(7, []), mirror: null, known: true }), 'deleted');
  assert.equal(mirrorAction({ remote: r(7, []), mirror: r(6, []) }), 'replace');
  assert.equal(mirrorAction({ remote: r(7, []), mirror: r(7, []) }), 'same');
});

test('sync: every failure in a sentence (a 1.0 Core, too big, unreachable, down, refused, busy, full, rate)', () => {
  assert.equal(syncProblem({ kind: 'http', status: 404, code: 'not_found' }).state, 'old');
  assert.match(syncProblem({ kind: 'http', status: 404 }).message, /Jarvis Core 1\.1.*jarvis-core update/);
  assert.equal(syncProblem({ kind: 'http', status: 503, code: 'sync_unavailable' }).state, 'old');
  const big = syncProblem({ kind: 'toobig', bytes: 61_000_000 });
  assert.equal(big.state, 'toobig');
  assert.match(big.message, /too big to sync \(61 MB\).*50 MB/);
  assert.equal(syncProblem({ kind: 'http', status: 413, code: 'too_large' }).state, 'toobig');
  assert.equal(syncProblem({ kind: 'unreachable' }).state, 'offline');
  assert.match(syncProblem({ kind: 'unreachable' }).message, /Tailscale/);
  assert.equal(syncProblem({ kind: 'down' }).state, 'down');
  assert.match(syncProblem({ kind: 'refused', message: 'no Tailscale identity' }).message, /it said: no Tailscale identity/);
  assert.equal(syncProblem({ kind: 'http', status: 409, code: 'busy' }).state, 'busy');
  assert.equal(syncProblem({ kind: 'http', status: 507, code: 'disk_full' }).state, 'full');
  assert.equal(syncProblem({ kind: 'rate' }).state, 'rate');
  assert.equal(syncProblem({ kind: 'starting' }).state, 'starting');
  assert.match(syncProblem({ kind: 'http', status: 400, code: 'bad_backup', message: 'that isn’t a Jarvis backup' }).message, /isn’t a Jarvis backup/);
  assert.equal(syncProblem(null).state, 'error');
  assert.equal(lastSyncedText(null), 'Not synced yet');
  assert.match(lastSyncedText(Date.now()), /^Last synced \d/);
  assert.match(lastSyncedText(Date.parse('2026-01-03T10:00:00Z'), Date.parse('2026-01-05T10:00:00Z')), /^Last synced Jan 3, /);
  assert.equal(addedText({ conversations: 2, library: 1, memory: 0 }), '2 conversations and 1 saved hologram or blueprint');
  assert.equal(addedText({ conversations: 1, library: 0, memory: 3 }), '1 conversation and 3 remembered facts');
  assert.equal(addedText({ conversations: 0, library: 0, memory: 0 }), '');
});

// ---- the controller ----------------------------------------------------------------------------------

const BASE = 'https://alienware.tail4e5f6a.ts.net/';

function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

function fakeTimers() {
  let t = 1_000_000;
  let seq = 0;
  const timeouts = new Map();
  const intervals = new Map();
  return {
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timeouts.set(id, { fn, at: t + ms });
      return id;
    },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (fn, ms) => {
      const id = ++seq;
      intervals.set(id, { fn, ms, next: t + ms });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    /** Moves the clock on, firing what comes due (in order). */
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, x] of timeouts) if (x.at <= end && (!next || x.at < next.at)) next = { id, at: x.at, fn: x.fn, kind: 'timeout' };
        for (const [id, x] of intervals) if (x.next <= end && (!next || x.next < next.at)) next = { id, at: x.next, fn: x.fn, kind: 'interval' };
        if (!next) break;
        t = next.at;
        if (next.kind === 'timeout') timeouts.delete(next.id);
        else intervals.get(next.id).next += intervals.get(next.id).ms;
        next.fn();
      }
      t = end;
    },
    pending: () => timeouts.size,
  };
}

/** A fake home base: devices and their backups; records what the app asked. */
function fakeCore() {
  const core = {
    devices: new Map(), // id -> { label, updatedAt, json }
    calls: [],
    listAnswer: null, // a failure to answer GET api/sync with
    uploadAnswer: null,
    clock: 0,
    list: async (base) => {
      core.calls.push(`list ${base}`);
      if (core.listAnswer) return core.listAnswer;
      return { ok: true, devices: [...core.devices].map(([id, d]) => ({ id, label: d.label, updatedAt: d.updatedAt, at: Date.parse(d.updatedAt), bytes: d.json.length })) };
    },
    download: async (base, id) => {
      core.calls.push(`get ${id}`);
      const d = core.devices.get(id);
      return d ? { ok: true, data: JSON.parse(d.json) } : { ok: false, kind: 'http', status: 404, code: 'not_found' };
    },
    upload: async (base, id, json, { label, gzipped }) => {
      core.calls.push(`put ${id} ${label} ${gzipped ? 'gzip' : 'plain'}`);
      if (core.uploadAnswer) return core.uploadAnswer;
      core.devices.set(id, { label, updatedAt: new Date(Date.UTC(2026, 10, 25, 7, 0, ++core.clock)).toISOString(), json });
      return { ok: true, bytes: json.length, storedAt: Date.now() };
    },
  };
  return core;
}

/** This device's data: build() exports `exportText` with its ids; merge() records what it was given. */
function fakeData() {
  const d = {
    exportText: '{"app":"jarvis","version":1,"exportedAt":"X","conversations":[{"id":"c-mine"}]}',
    ids: { conv: ['c-mine'], lib: [], mem: [] },
    merges: [],
    builds: 0,
    mergeAnswer: () => ({ conversations: ['c-theirs'], mirrors: 0, library: 1, memory: 0, busy: 0, skipped: 0, written: { conv: ['c-theirs'], lib: ['lib_theirs0001'], mem: [] } }),
    build: async () => ({ builds: ++d.builds, json: d.exportText.replace('"X"', `"${new Date().toISOString()}"`), ids: d.ids, excluded: [] }),
    merge: async (data, opts) => {
      d.merges.push({ data, from: opts.from, label: opts.label, known: { conv: [...opts.known.conv], lib: [...opts.known.lib], mem: [...opts.known.mem] } });
      return d.mergeAnswer(data, opts);
    },
  };
  return d;
}

function setup({ linked = true, storage = memoryStorage(), core = fakeCore(), data = fakeData(), ...rest } = {}) {
  const timers = fakeTimers();
  let settings = { homeBaseUrl: linked ? BASE : '' };
  const settingsListeners = new Set();
  const merged = [];
  const sync = createSync({
    getSettings: () => settings,
    onSettingsChange: (fn) => {
      settingsListeners.add(fn);
      return () => settingsListeners.delete(fn);
    },
    client: core,
    data,
    storage,
    hash: async (text) => `h:${text}`,
    gzip: async (text) => ({ gz: text.length }),
    now: timers.now,
    label: 'iPhone',
    onMerged: (res) => merged.push(res),
    randomBytes: () => Uint8Array.from({ length: 12 }, (_, i) => i + 1),
    locks: null,
    timers,
    doc: null,
    ...rest,
  });
  const relink = (url) => {
    settings = { homeBaseUrl: url };
    for (const fn of settingsListeners) fn(settings);
  };
  return { sync, core, data, storage, timers, merged, relink };
}

test('sync controller: the first sync pulls the other device’s backup, merges it, then sends this device’s (gzip, its name)', async () => {
  const { sync, core, data, storage, merged } = setup();
  core.devices.set('jd-mac000000000', { label: 'Mac', updatedAt: '2026-11-25T06:59:00.000Z', json: '{"app":"jarvis","version":1,"conversations":[]}' });
  const st = await sync.syncNow();
  const self = 'jd-0102030405060708090a0b0c';
  assert.equal(sync.deviceId(), self);
  assert.deepEqual(core.calls, [`list ${BASE}`, 'get jd-mac000000000', `put ${self} iPhone gzip`]);
  assert.equal(data.merges.length, 1);
  assert.equal(data.merges[0].from, 'jd-mac000000000');
  assert.equal(data.merges[0].label, 'Mac');
  assert.equal(merged.length, 1, 'the app hears what came in (to refresh History)');
  assert.equal(st.phase, 'done');
  assert.ok(st.lastSyncedAt);
  assert.deepEqual(st.added, { conversations: 1, library: 1, memory: 0 });
  assert.deepEqual(st.devices.map((d) => d.label), ['Mac']);
  const rec = JSON.parse(storage.getItem(SYNC_KEY));
  assert.equal(rec.deviceId, self);
  assert.equal(rec.merged['jd-mac000000000'], '2026-11-25T06:59:00.000Z');
  const known = JSON.parse(storage.getItem(SYNC_KNOWN_KEY));
  assert.deepEqual(known.conv.sort(), ['c-mine', 'c-theirs'], 'what this device has had is remembered (from its export and the merge)');
  assert.deepEqual(known.lib, ['lib_theirs0001']);
});

test('sync controller: nothing changed -> nothing pulled or sent; a change is sent; a Core that lost the backup gets it again', async () => {
  const { sync, core, data } = setup();
  core.devices.set('jd-mac000000000', { label: 'Mac', updatedAt: '2026-11-25T06:59:00.000Z', json: '{"app":"jarvis","version":1}' });
  await sync.syncNow();
  core.calls.length = 0;
  const builds = data.builds;
  await sync.syncNow();
  assert.deepEqual(core.calls, [`list ${BASE}`], 'unchanged on both sides: one list, no download, no upload');
  assert.equal(data.builds, builds, 'no change noted: this device’s history is not even read');
  sync.noteChange(); // something was saved, but it comes out the same (exportedAt alone differs)
  await sync.syncNow();
  assert.equal(data.builds, builds + 1);
  assert.deepEqual(core.calls, [`list ${BASE}`, `list ${BASE}`], 'the same backup is not sent again');
  data.exportText = data.exportText.replace('c-mine', 'c-mine-2');
  data.ids = { conv: ['c-mine-2'], lib: [], mem: [] };
  sync.noteChange();
  await sync.syncNow();
  assert.equal(core.calls.filter((c) => c.startsWith('put ')).length, 1, 'a change is sent');
  core.calls.length = 0;
  core.devices.delete(sync.deviceId()); // e.g. the Core was reinstalled
  await sync.syncNow();
  assert.equal(core.calls.filter((c) => c.startsWith('put ')).length, 1, 'not on the Core any more: sent again');
  // The Mac uploads again: pulled again.
  core.devices.get('jd-mac000000000').updatedAt = '2026-11-25T07:30:00.000Z';
  core.calls.length = 0;
  await sync.syncNow();
  assert.deepEqual(core.calls, [`list ${BASE}`, 'get jd-mac000000000']);
  assert.deepEqual(data.merges.at(-1).known.conv.sort(), ['c-mine', 'c-mine-2', 'c-theirs'], 'the merge is told what this device had');
});

test('sync controller: a 1.0 Core (404) and an unreachable home base say so and send nothing; too big is never sent but still pulls', async () => {
  const a = setup();
  a.core.listAnswer = { ok: false, kind: 'http', status: 404, code: 'not_found' };
  let st = await a.sync.syncNow();
  assert.equal(st.phase, 'failed');
  assert.equal(st.problem.state, 'old');
  assert.deepEqual(a.core.calls, [`list ${BASE}`]);
  a.core.listAnswer = { ok: false, kind: 'unreachable' };
  st = await a.sync.syncNow();
  assert.equal(st.problem.state, 'offline');
  assert.equal(st.lastSyncedAt, null);

  const b = setup();
  b.core.devices.set('jd-mac000000000', { label: 'Mac', updatedAt: '2026-11-25T06:59:00.000Z', json: '{"app":"jarvis","version":1}' });
  b.data.exportText = `{"app":"jarvis","version":1,"exportedAt":"X","big":"${'x'.repeat(SYNC_MAX_BYTES)}"}`;
  st = await b.sync.syncNow();
  assert.equal(st.phase, 'failed');
  assert.equal(st.problem.state, 'toobig');
  assert.match(st.problem.message, /too big to sync \(52 MB\)/);
  assert.deepEqual(b.core.calls, [`list ${BASE}`, 'get jd-mac000000000'], 'the other device’s backup still came in; nothing was sent');
  const builds = b.data.builds;
  st = await b.sync.syncNow();
  assert.equal(st.problem && st.problem.state, 'toobig', 'it keeps saying so (never "synced")');
  assert.equal(b.data.builds, builds, 'and doesn’t read the big history again until something changes');
  b.data.exportText = '{"app":"jarvis","version":1,"exportedAt":"X","small":true}';
  b.sync.noteChange(); // the owner deleted the conversations with photos
  st = await b.sync.syncNow();
  assert.equal(st.phase, 'done', 'small enough again: sent');
  assert.ok(b.core.calls.some((c) => c.startsWith('put ')));

  const c = setup();
  c.core.uploadAnswer = { ok: false, kind: 'http', status: 413, code: 'too_large', message: 'the backup is larger than 50 MB' };
  st = await c.sync.syncNow();
  assert.equal(st.problem.state, 'toobig', 'the Core’s own 413 says the same');
});

test('sync controller: a conversation running here is left for next time (that device is pulled again)', async () => {
  const { sync, core, data } = setup();
  core.devices.set('jd-mac000000000', { label: 'Mac', updatedAt: '2026-11-25T06:59:00.000Z', json: '{"app":"jarvis","version":1}' });
  data.mergeAnswer = () => ({ conversations: [], mirrors: 0, library: 0, memory: 0, busy: 1, skipped: 0, written: { conv: [], lib: [], mem: [] } });
  await sync.syncNow();
  core.calls.length = 0;
  data.mergeAnswer = () => ({ conversations: ['c-busy'], mirrors: 0, library: 0, memory: 0, busy: 0, skipped: 0, written: { conv: ['c-busy'], lib: [], mem: [] } });
  await sync.syncNow();
  assert.deepEqual(core.calls.slice(0, 2), [`list ${BASE}`, 'get jd-mac000000000']);
  core.calls.length = 0;
  await sync.syncNow();
  assert.deepEqual(core.calls, [`list ${BASE}`], 'merged whole now: not pulled again');
});

test('sync controller: at start, 2 minutes after the last change, every 10 minutes; its own merge is not a change; off and unlinked do nothing', async () => {
  const { sync, core, timers, data } = setup();
  const flush = () => new Promise((r) => setImmediate(r));
  sync.start();
  timers.advance(2999);
  assert.equal(core.calls.length, 0);
  timers.advance(1);
  await flush();
  assert.equal(core.calls[0], `list ${BASE}`, 'a sync 3 s after the boot');
  await sync.syncNow();
  core.calls.length = 0;
  // Changes: one sync 2 minutes after the last one.
  sync.noteChange();
  timers.advance(60_000);
  sync.noteChange();
  timers.advance(SYNC_DEBOUNCE_MS - 1);
  assert.equal(core.calls.length, 0);
  data.exportText = data.exportText.replace('c-mine', 'c-changed');
  timers.advance(1);
  await flush();
  assert.equal(core.calls.filter((c) => c === `list ${BASE}`).length, 1);
  assert.equal(core.calls.filter((c) => c.startsWith('put ')).length, 1);
  // A merge's own writes (library 'imported', memory) don't schedule another sync.
  core.devices.set('jd-mac000000000', { label: 'Mac', updatedAt: '2026-11-25T08:00:00.000Z', json: '{"app":"jarvis","version":1}' });
  data.mergeAnswer = () => {
    sync.noteChange();
    return { conversations: [], mirrors: 0, library: 0, memory: 1, busy: 0, skipped: 0, written: { conv: [], lib: [], mem: ['tea'] } };
  };
  await sync.syncNow();
  const before = timers.pending();
  assert.equal(before, 0, 'no sync was scheduled by the merge itself');
  // Every 10 minutes while open.
  core.calls.length = 0;
  timers.advance(SYNC_INTERVAL_MS + 60_000);
  await flush();
  assert.ok(core.calls.includes(`list ${BASE}`), 'the 10-minute sync ran');
  // Off: nothing.
  sync.setEnabled(false);
  await flush();
  core.calls.length = 0;
  sync.noteChange();
  timers.advance(SYNC_INTERVAL_MS * 2);
  await flush();
  await sync.syncNow();
  assert.deepEqual(core.calls, []);
  assert.equal(sync.getState().phase, 'off');
  // Back on: a sync at once.
  sync.setEnabled(true);
  await flush();
  assert.ok(core.calls.includes(`list ${BASE}`));
  sync.destroy();
});

test('sync controller: no home base linked: nothing at all; linking one syncs soon (on by default)', async () => {
  const { sync, core, timers, relink } = setup({ linked: false });
  const flush = () => new Promise((r) => setImmediate(r));
  sync.start();
  timers.advance(SYNC_INTERVAL_MS * 2);
  await flush();
  await sync.syncNow();
  assert.deepEqual(core.calls, []);
  assert.equal(sync.getState().phase, 'unset');
  relink(BASE);
  assert.equal(sync.getState().phase, 'idle');
  timers.advance(1500);
  await flush();
  await sync.syncNow();
  assert.equal(core.calls[0], `list ${BASE}`);
  relink('');
  assert.equal(sync.getState().phase, 'unset');
  sync.destroy();
});

test('sync controller: a stored device id and the owner’s choice survive a reload; damaged storage starts fresh', async () => {
  const storage = memoryStorage({ [SYNC_KEY]: JSON.stringify({ deviceId: 'jd-stored0000001', enabled: false }), [SYNC_KNOWN_KEY]: '{not json' });
  const { sync, core } = setup({ storage });
  assert.equal(sync.getState().phase, 'off');
  sync.setEnabled(true);
  await sync.syncNow();
  assert.equal(sync.deviceId(), 'jd-stored0000001');
  assert.ok(core.calls.some((c) => c.startsWith('put jd-stored0000001 ')));
  const bad = setup({ storage: memoryStorage({ [SYNC_KEY]: JSON.stringify({ deviceId: '../../x', enabled: 'yes' }) }) });
  assert.equal(bad.sync.getState().phase, 'idle', 'on by default');
  await bad.sync.syncNow();
  assert.equal(bad.sync.deviceId(), 'jd-0102030405060708090a0b0c', 'an invalid stored id is replaced');
});
