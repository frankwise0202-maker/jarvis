// Unit tests for settings, secrets, memory, spend and the localStorage wrapper (SPEC §2, §5),
// run in real Chromium on a real origin (see platform.harness.test.mjs). Every test gets a
// fresh browser context, i.e. empty storage and freshly loaded modules.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './platform.harness.test.mjs';

let h;

before(async () => {
  h = await createHarness({
    settings: 'src/platform/settings.js',
    secrets: 'src/platform/secrets.js',
    memory: 'src/platform/memory.js',
    spend: 'src/platform/spend.js',
    storage: 'src/platform/storage.js',
  });
});

after(async () => {
  if (h) await h.close();
});

// addInitScript function: writes the given { key: value } pairs into localStorage.
const seed = (entries) => {
  for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
};

// ---- settings ---------------------------------------------------------------------------

test('settings: defaults match SPEC and are frozen', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(() => {
    const { getSettings, DEFAULT_SETTINGS } = window.__mods.settings;
    const s = getSettings();
    try {
      s.maxAgents = 99; // frozen: ignored (or a TypeError in strict code)
    } catch {
      /* expected in strict mode */
    }
    return { s, d: DEFAULT_SETTINGS, frozen: Object.isFrozen(s) && Object.isFrozen(s.features), same: getSettings() === s, maxAgents: s.maxAgents };
  });
  const expected = {
    userName: '', leadModel: 'claude-opus-5-5', workerModel: 'claude-sonnet-5-5', depth: 'balanced', mode: 'auto',
    maxAgents: 8, maxParallel: 4, maxWaves: 3, showThinking: true, speakReplies: 'off', voiceURI: '', voiceRate: 1,
    listenLang: '', location: '', memoryEnabled: true, spendWarnUsd: 20, onboarded: false, features: { fallbacks: true, compaction: true },
    // Feature pack (SPEC §14) and wave B (SPEC §15.1).
    followups: true, tone: 'butler', verbosity: 'balanced', theme: 'arc', sounds: true, soundVolume: 0.6, haptics: true,
    notifyOnFinish: true, voiceContinuous: true,
    naturalVoice: false, naturalVoiceId: 'bm_george', // the opt-in natural voice (prototype C)
    opticsCameraId: '', opticsCameraLabel: '', // Optics: the camera chosen last on this device (v7)
    listenWait: 'normal', listenSend: 'show', // listening (v7.2): the silence window, the 2-second check
    wakeClap: true, wakeClapSensitivity: 'normal', wakeWord: false, wakeReturn: true, // Wake Jarvis (Standby, v7.4)
    homeBaseUrl: '', // the home base (Jarvis Core) address, not linked (v7.5)
    homeBaseHear: false, homeBaseSpeak: false, // hearing and voice through the home base, off (v7.7 beta)
  };
  assert.deepEqual(r.s, expected);
  assert.deepEqual(r.d, expected);
  assert.equal(r.frozen, true);
  assert.equal(r.same, true);
  assert.equal(r.maxAgents, 8);
});

test('settings: a partial seed (as E2E writes it) is merged over the defaults', async () => {
  const page = await h.newPage({ init: seed, initArg: { 'jarvis.settings.v1': '{"onboarded":true,"userName":"Tony"}' } });
  const s = await page.evaluate(() => window.__mods.settings.getSettings());
  assert.equal(s.onboarded, true);
  assert.equal(s.userName, 'Tony');
  assert.equal(s.maxAgents, 8);
  assert.deepEqual(s.features, { fallbacks: true, compaction: true });
});

test('settings: corrupt or invalid stored values fall back to defaults; numbers are clamped', async () => {
  for (const raw of ['not json', '[]', 'null', '42', '"str"']) {
    const page = await h.newPage({ init: seed, initArg: { 'jarvis.settings.v1': raw } });
    const s = await page.evaluate(() => window.__mods.settings.getSettings());
    assert.deepEqual(s, await page.evaluate(() => JSON.parse(JSON.stringify(window.__mods.settings.DEFAULT_SETTINGS))), raw);
  }
  const bad = {
    maxAgents: 'lots', depth: 'ultra', features: 'x', voiceRate: 99, leadModel: 'gpt-4', speakReplies: true, maxParallel: -5,
    userName: 12, workerModel: 'claude-haiku-5-5', maxWaves: 2.6, listenLang: 'en_GB', location: '  Austin,\n Texas  ', spendWarnUsd: 'NaN',
    showThinking: 'yes', extra: 'dropped',
  };
  // A "__proto__" key in stored JSON must not pollute prototypes.
  const raw = JSON.stringify(bad).replace(/^\{/, '{"__proto__":{"polluted":true},');
  const page = await h.newPage({ init: seed, initArg: { 'jarvis.settings.v1': raw } });
  const s = await page.evaluate(() => window.__mods.settings.getSettings());
  assert.equal(s.maxAgents, 8);
  assert.equal(s.depth, 'balanced');
  assert.deepEqual(s.features, { fallbacks: true, compaction: true });
  assert.equal(s.voiceRate, 1.5);
  assert.equal(s.leadModel, 'claude-opus-5-5');
  assert.equal(s.speakReplies, 'off');
  assert.equal(s.maxParallel, 1);
  assert.equal(s.userName, '');
  assert.equal(s.workerModel, 'claude-haiku-5-5');
  assert.equal(s.maxWaves, 3);
  assert.equal(s.listenLang, 'en-GB');
  assert.equal(s.location, 'Austin, Texas');
  assert.equal(s.spendWarnUsd, 20);
  assert.equal(s.showThinking, true);
  assert.equal('extra' in s, false);
  assert.equal(await page.evaluate(() => ({}).polluted), undefined);
});

test('settings: saveSettings validates, clamps, deep-merges features, persists and notifies', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(() => {
    const { saveSettings, getSettings, onSettingsChange } = window.__mods.settings;
    const seen = [];
    const off = onSettingsChange((s) => seen.push(s.maxAgents));
    onSettingsChange(() => {
      throw new Error('a broken listener must not break saving');
    });
    const out = {};
    out.low = saveSettings({ maxAgents: 0, maxParallel: 11, maxWaves: 9, voiceRate: 0.1, spendWarnUsd: -3 });
    out.high = saveSettings({ maxAgents: 25, voiceRate: 1.234 });
    out.round = saveSettings({ maxAgents: 7.6, maxParallel: '3' });
    out.enum = saveSettings({ depth: 'ultra', mode: 'swarm', speakReplies: 'summary', leadModel: 'nope' });
    out.text = saveSettings({ userName: '  Tony \u0007  Stark  '.padEnd(80, 'x'), listenLang: 'not a lang!' });
    out.features = saveSettings({ features: { fallbacks: false, unknown: true } });
    out.noop = saveSettings({ features: { fallbacks: false } }) === out.features;
    out.notObject = saveSettings('maxAgents=3') === getSettings();
    off();
    saveSettings({ maxAgents: 2 });
    out.seen = seen;
    out.stored = JSON.parse(localStorage.getItem('jarvis.settings.v1'));
    return out;
  });
  assert.deepEqual([r.low.maxAgents, r.low.maxParallel, r.low.maxWaves, r.low.voiceRate, r.low.spendWarnUsd], [1, 10, 4, 0.7, 0]);
  assert.deepEqual([r.high.maxAgents, r.high.voiceRate], [20, 1.23]);
  assert.deepEqual([r.round.maxAgents, r.round.maxParallel], [8, 3]);
  assert.deepEqual([r.enum.depth, r.enum.mode, r.enum.speakReplies, r.enum.leadModel], ['balanced', 'swarm', 'summary', 'claude-opus-5-5']);
  assert.equal(r.text.userName.length, 40);
  assert.ok(r.text.userName.startsWith('Tony Stark'));
  assert.equal(r.text.listenLang, '', 'an invalid language keeps the current one (the device language)');
  assert.deepEqual(r.features.features, { fallbacks: false, compaction: true });
  assert.equal(r.noop, true);
  assert.equal(r.notObject, true);
  assert.deepEqual(r.seen, [1, 20, 8, 8, 8, 8]);
  assert.equal(r.stored.maxAgents, 2);
  assert.deepEqual(r.stored.features, { fallbacks: false, compaction: true });
  // Persisted across a reload.
  const page2 = await page.context().newPage();
  await page2.goto(h.url);
  await page2.waitForFunction(() => window.__ready === true);
  assert.equal(await page2.evaluate(() => window.__mods.settings.getSettings().maxAgents), 2);
});

test('settings (v7.2): listening follows the device language by default; the old stored default en-US is migrated once; wait and send choices are validated', async () => {
  // Saved before v7.2: every save wrote listenLang 'en-US' (the old default), and no listenWait.
  const old = await h.newPage({ init: seed, initArg: { 'jarvis.settings.v1': JSON.stringify({ onboarded: true, listenLang: 'en-US', userName: 'Tony' }) } });
  const migrated = await old.evaluate(() => window.__mods.settings.getSettings());
  assert.equal(migrated.listenLang, '', 'the old default now follows the device');
  assert.equal(migrated.userName, 'Tony');
  // A language the owner chose (anything but the old default) stays, and so does en-US saved by v7.2.
  const chosen = await h.newPage({ init: seed, initArg: { 'jarvis.settings.v1': JSON.stringify({ listenLang: 'en-GB' }) } });
  assert.equal(await chosen.evaluate(() => window.__mods.settings.getSettings().listenLang), 'en-GB');
  const kept = await h.newPage({ init: seed, initArg: { 'jarvis.settings.v1': JSON.stringify({ listenLang: 'en-US', listenWait: 'long' }) } });
  assert.deepEqual(
    await kept.evaluate(() => {
      const s = window.__mods.settings.getSettings();
      return [s.listenLang, s.listenWait];
    }),
    ['en-US', 'long'],
  );
  const r = await old.evaluate(() => {
    const { saveSettings } = window.__mods.settings;
    const out = {};
    out.us = saveSettings({ listenLang: 'en-US' }).listenLang;
    out.auto = saveSettings({ listenLang: '  ' }).listenLang;
    out.wait = saveSettings({ listenWait: 'short' }).listenWait;
    out.badWait = saveSettings({ listenWait: 'forever' }).listenWait;
    out.send = saveSettings({ listenSend: 'now' }).listenSend;
    out.badSend = saveSettings({ listenSend: true }).listenSend;
    out.stored = JSON.parse(localStorage.getItem('jarvis.settings.v1'));
    return out;
  });
  assert.deepEqual([r.us, r.auto, r.wait, r.badWait, r.send, r.badSend], ['en-US', '', 'short', 'short', 'now', 'now']);
  assert.equal(r.stored.listenWait, 'short', 'saved with the new keys, so the migration never runs again');
});

test('settings: the Optics camera choice keeps a device id and a one-line label; anything else is refused', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(() => {
    const { saveSettings } = window.__mods.settings;
    const id = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
    const ok = saveSettings({ opticsCameraId: id, opticsCameraLabel: '  Logitech BRIO\n(046d:085e)  ' });
    const spaces = saveSettings({ opticsCameraId: 'has spaces in it' });
    const long = saveSettings({ opticsCameraId: 'x'.repeat(300), opticsCameraLabel: 'L'.repeat(300) });
    const wrongType = saveSettings({ opticsCameraId: 42, opticsCameraLabel: { label: 'x' } });
    const cleared = saveSettings({ opticsCameraId: '', opticsCameraLabel: '' });
    return { ok, spaces, long, wrongType, cleared, id };
  });
  assert.equal(r.ok.opticsCameraId, r.id);
  assert.equal(r.ok.opticsCameraLabel, 'Logitech BRIO (046d:085e)');
  assert.equal(r.spaces.opticsCameraId, r.id, 'an id with spaces keeps the previous one');
  assert.equal(r.long.opticsCameraId, r.id, 'an over-long id keeps the previous one');
  assert.equal(r.long.opticsCameraLabel.length, 120);
  assert.equal(r.wrongType.opticsCameraId, r.id);
  assert.equal(r.wrongType.opticsCameraLabel, r.long.opticsCameraLabel);
  assert.deepEqual([r.cleared.opticsCameraId, r.cleared.opticsCameraLabel], ['', '']);
});

test('settings: resetSettings restores defaults and notifies; other tabs are followed', async () => {
  const page = await h.newPage();
  const other = await page.context().newPage();
  await other.goto(h.url);
  await other.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => {
    window.__seen = [];
    window.__mods.settings.onSettingsChange((s) => window.__seen.push(s.userName));
    window.__mods.settings.getSettings();
  });
  await other.evaluate(() => window.__mods.settings.saveSettings({ userName: 'From another tab' }));
  await page.waitForFunction(() => window.__seen.length === 1);
  const r = await page.evaluate(() => {
    const { resetSettings, getSettings } = window.__mods.settings;
    const before = getSettings().userName;
    const after = resetSettings();
    return { before, after: after.userName, stored: localStorage.getItem('jarvis.settings.v1'), seen: window.__seen };
  });
  assert.deepEqual(r, { before: 'From another tab', after: '', stored: null, seen: ['From another tab', ''] });
});

// ---- secrets ----------------------------------------------------------------------------

test('secrets: key storage, trimming, masking and shape check', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(() => {
    const { getApiKey, setApiKey, clearApiKey, maskKey, looksLikeApiKey, hasApiKey } = window.__mods.secrets;
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789-WXYZ';
    const out = { empty: getApiKey(), has0: hasApiKey() };
    out.set = setApiKey(`  ${key}\n`);
    out.get = getApiKey();
    out.stored = localStorage.getItem('jarvis.apiKey');
    out.mask = maskKey(key);
    out.maskTest = maskKey('sk-ant-test-0123456789abcdefghijklmnop');
    out.maskShort = maskKey('sk-ant-abc');
    out.maskEmpty = maskKey('');
    out.looks = [key, ' ' + key + ' ', 'sk-ant-short', 'sk-other-0123456789abcdefghijklmnop', 'sk-ant-0123456789abcdefghij!@#', '', null, 42].map(looksLikeApiKey);
    clearApiKey();
    out.cleared = [getApiKey(), localStorage.getItem('jarvis.apiKey'), hasApiKey()];
    setApiKey(key);
    setApiKey('   ');
    out.blankClears = getApiKey();
    return out;
  });
  const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789-WXYZ';
  assert.equal(r.empty, '');
  assert.equal(r.has0, false);
  assert.equal(r.set, key);
  assert.equal(r.get, key);
  assert.equal(r.stored, key);
  assert.equal(r.mask, 'sk-ant-…WXYZ');
  assert.equal(r.maskTest, 'sk-ant-…mnop');
  assert.equal(r.maskShort, '…');
  assert.equal(r.maskEmpty, '');
  assert.deepEqual(r.looks, [true, true, false, false, false, false, false, false]);
  assert.deepEqual(r.cleared, ['', null, false]);
  assert.equal(r.blankClears, '');
});

test('secrets: the dev API base is honored only for this origin or localhost/127.0.0.1', async () => {
  const cases = [
    [null, ''],
    ['', ''],
    ['SAME', 'SAME'],
    ['SAME/some/path?x=1', 'SAME'],
    ['http://localhost:9999', 'http://localhost:9999'],
    ['http://localhost:9999/', 'http://localhost:9999'],
    ['https://LOCALHOST:8443/v1', 'https://localhost:8443'],
    ['http://127.0.0.1:1234', 'http://127.0.0.1:1234'],
    ['https://evil.example', ''],
    ['https://api.anthropic.com', ''],
    ['http://localhost.evil.example', ''],
    ['http://127.0.0.1.nip.io', ''],
    ['http://user:pass@localhost:1', ''],
    ['javascript:alert(1)', ''],
    ['ftp://localhost', ''],
    ['not a url', ''],
    ['//localhost:1', ''],
  ];
  for (const [value, expected] of cases) {
    const page = await h.newPage({
      init: (v) => {
        if (v !== null) localStorage.setItem('jarvis.dev.apiBase', v.replace('SAME', location.origin));
      },
      initArg: value,
    });
    const got = await page.evaluate(() => window.__mods.secrets.getDevApiBase());
    assert.equal(got, expected.replace('SAME', h.url), `apiBase ${value}`);
  }
  // Never read from the URL.
  const page = await h.newPage({ path: '/?jarvis.dev.apiBase=http://localhost:1&apiBase=http://localhost:1' });
  assert.equal(await page.evaluate(() => window.__mods.secrets.getDevApiBase()), '');
});

// ---- memory -----------------------------------------------------------------------------

test('memory: normalization, case-insensitive dedupe, 300-char cap, change events', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(() => {
    const { addMemory, listMemory, onMemoryChange } = window.__mods.memory;
    let events = 0;
    onMemoryChange(() => events++);
    const a = addMemory('  Prefers   metric\nunits\u0007 ');
    const dup = addMemory('PREFERS METRIC UNITS');
    const long = addMemory('x'.repeat(500));
    const empty = addMemory('   \n ');
    const notString = addMemory(42);
    return { a, dupSameId: dup.id === a.id, longLen: long.text.length, longEnd: long.text.slice(-1), empty, notString, list: listMemory().map((m) => m.text), events, stored: JSON.parse(localStorage.getItem('jarvis.memory.v1')) };
  });
  assert.equal(r.a.text, 'Prefers metric units');
  assert.equal(typeof r.a.id, 'string');
  assert.equal(typeof r.a.createdAt, 'number');
  assert.equal(r.dupSameId, true);
  assert.equal(r.longLen, 300);
  assert.equal(r.longEnd, '…');
  assert.equal(r.empty, null);
  assert.equal(r.notString, null);
  assert.deepEqual(r.list, ['Prefers metric units', 'x'.repeat(299) + '…']);
  assert.equal(r.events, 2);
  assert.deepEqual(Object.keys(r.stored[0]).sort(), ['createdAt', 'id', 'text']);
});

test('memory: at most 100 facts, oldest dropped first', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(() => {
    const { addMemory, listMemory } = window.__mods.memory;
    for (let i = 1; i <= 105; i++) addMemory(`fact number ${i}`);
    const list = listMemory();
    return { n: list.length, first: list[0].text, last: list[list.length - 1].text, stored: JSON.parse(localStorage.getItem('jarvis.memory.v1')).length };
  });
  assert.deepEqual(r, { n: 100, first: 'fact number 6', last: 'fact number 105', stored: 100 });
});

test('memory: remove by id, by text, by unique loose match; clear', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(() => {
    const { addMemory, listMemory, removeMemory, clearMemory } = window.__mods.memory;
    const a = addMemory('Lives in Austin');
    addMemory('Prefers metric units');
    addMemory('Likes C++');
    addMemory('Likes C');
    const out = {};
    out.byId = removeMemory(a.id);
    out.byText = removeMemory('prefers METRIC units');
    out.ambiguousLoose = removeMemory('likes c!!!');
    out.missing = removeMemory('never said that');
    out.invalid = [removeMemory(''), removeMemory(null)];
    out.left = listMemory().map((m) => m.text);
    addMemory('Has a dog named Rex');
    out.loose = removeMemory('"Has a dog named Rex."');
    clearMemory();
    out.cleared = [listMemory().length, localStorage.getItem('jarvis.memory.v1')];
    return out;
  });
  assert.equal(r.byId, true);
  assert.equal(r.byText, true);
  assert.equal(r.ambiguousLoose, false);
  assert.equal(r.missing, false);
  assert.deepEqual(r.invalid, [false, false]);
  assert.deepEqual(r.left, ['Likes C++', 'Likes C']);
  assert.equal(r.loose, true);
  assert.deepEqual(r.cleared, [0, null]);
});

test('memory: corrupt storage is ignored; partially valid lists are sanitized', async () => {
  const bad = await h.newPage({ init: seed, initArg: { 'jarvis.memory.v1': '{broken' } });
  assert.deepEqual(await bad.evaluate(() => window.__mods.memory.listMemory()), []);
  const mixed = JSON.stringify([{ id: 'a', text: 'One', createdAt: 1 }, 'Two', { text: 'one' }, { id: 'a', text: 'Three' }, null, { text: '' }, { text: 7 }]);
  const page = await h.newPage({ init: seed, initArg: { 'jarvis.memory.v1': mixed } });
  const list = await page.evaluate(() => window.__mods.memory.listMemory());
  assert.deepEqual(list.map((m) => m.text), ['One', 'Two', 'Three']);
  assert.equal(new Set(list.map((m) => m.id)).size, 3);
});

// ---- spend ------------------------------------------------------------------------------

test('spend: accumulates, ignores invalid amounts, rolls over by local month', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(() => {
    const { addSpend, getSpend, onSpendChange } = window.__mods.spend;
    let events = 0;
    onSpendChange(() => events++);
    const nov = new Date(2026, 10, 30, 23, 59);
    const dec = new Date(2026, 11, 1, 0, 1);
    const out = {};
    out.start = getSpend(nov);
    addSpend(0.25, nov);
    addSpend(1.5, nov);
    for (const bad of [-1, NaN, Infinity, '2', null, undefined, 0]) addSpend(bad, nov);
    out.nov = getSpend(nov);
    out.dec = addSpend(2, dec);
    out.jan = getSpend(new Date(2027, 0, 5));
    out.stored = JSON.parse(localStorage.getItem('jarvis.spend.v1'));
    out.events = events;
    return out;
  });
  assert.equal(r.start.month, '2026-11');
  assert.equal(r.start.monthUsd, 0);
  assert.deepEqual({ ...r.nov }, { month: '2026-11', monthUsd: 1.75, totalUsd: 1.75 });
  assert.deepEqual({ ...r.dec }, { month: '2026-12', monthUsd: 2, totalUsd: 3.75 });
  assert.deepEqual({ ...r.jan }, { month: '2027-01', monthUsd: 0, totalUsd: 3.75 });
  assert.deepEqual(r.stored, { month: '2026-12', monthUsd: 2, totalUsd: 3.75 });
  assert.equal(r.events, 3);
});

test('spend: today\'s total of every source (getTodaySpend) is kept beside the month, rolls over by local day, and is reset with it', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(() => {
    const { addSpend, getTodaySpend, resetSpend } = window.__mods.spend;
    const morning = new Date(2026, 10, 20, 8, 0);
    const evening = new Date(2026, 10, 20, 22, 0);
    const next = new Date(2026, 10, 21, 0, 5);
    const out = {};
    out.start = getTodaySpend(morning);
    addSpend(0.01, morning); // a reply
    addSpend(0.0057, evening); // a Watch frame
    addSpend(0.0004, evening); // follow-up suggestions
    out.today = getTodaySpend(evening);
    out.nextBefore = getTodaySpend(next);
    addSpend(0.02, next);
    out.next = getTodaySpend(next);
    out.stored = JSON.parse(localStorage.getItem('jarvis.spend.day.v1'));
    out.month = JSON.parse(localStorage.getItem('jarvis.spend.v1'));
    resetSpend();
    out.reset = getTodaySpend(next);
    out.left = localStorage.getItem('jarvis.spend.day.v1');
    return out;
  });
  assert.equal(r.start, 0);
  assert.equal(r.today, 0.0161);
  assert.equal(r.nextBefore, 0, 'a new day starts at zero');
  assert.equal(r.next, 0.02);
  assert.deepEqual(r.stored, { day: '2026-11-21', usd: 0.02 });
  assert.deepEqual(r.month, { month: '2026-11', monthUsd: 0.0361, totalUsd: 0.0361 }, 'the month record keeps its shape');
  assert.equal(r.reset, 0);
  assert.equal(r.left, null);
});

test('spend: corrupt storage reads as zero', async () => {
  for (const raw of ['nope', '{"month":"2026-13","monthUsd":5,"totalUsd":"x"}', '[]']) {
    const page = await h.newPage({ init: seed, initArg: { 'jarvis.spend.v1': raw } });
    const s = await page.evaluate(() => ({ ...window.__mods.spend.getSpend() }));
    assert.equal(s.monthUsd, 0, raw);
    assert.equal(s.totalUsd, 0, raw);
  }
});

// ---- storage fallback -------------------------------------------------------------------

test('storage: when localStorage throws (private mode / full), everything keeps working in memory', async () => {
  const page = await h.newPage({
    init: () => {
      Storage.prototype.setItem = function () {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    },
  });
  const r = await page.evaluate(() => {
    const { saveSettings, getSettings } = window.__mods.settings;
    const { setApiKey, getApiKey } = window.__mods.secrets;
    const { addMemory, listMemory } = window.__mods.memory;
    const { addSpend, getSpend } = window.__mods.spend;
    const { isStoragePersistent } = window.__mods.storage;
    saveSettings({ userName: 'Pepper' });
    setApiKey('sk-ant-test-0123456789abcdefghijklmnop');
    addMemory('Works offline');
    addSpend(0.5);
    return { name: getSettings().userName, key: getApiKey(), mem: listMemory().length, spend: getSpend().monthUsd, persistent: isStoragePersistent(), ls: localStorage.length };
  });
  assert.deepEqual(r, { name: 'Pepper', key: 'sk-ant-test-0123456789abcdefghijklmnop', mem: 1, spend: 0.5, persistent: false, ls: 0 });
});

test('storage: when localStorage itself is inaccessible (blocked site data), defaults load and nothing throws', async () => {
  const page = await h.newPage({
    init: () => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    },
  });
  const r = await page.evaluate(() => {
    const { saveSettings, getSettings } = window.__mods.settings;
    const { setApiKey, getApiKey, getDevApiBase } = window.__mods.secrets;
    const before = getSettings().maxAgents;
    saveSettings({ maxAgents: 12 });
    setApiKey('sk-ant-test-0123456789abcdefghijklmnop');
    return { before, after: getSettings().maxAgents, key: getApiKey(), base: getDevApiBase() };
  });
  assert.deepEqual(r, { before: 8, after: 12, key: 'sk-ant-test-0123456789abcdefghijklmnop', base: '' });
});
