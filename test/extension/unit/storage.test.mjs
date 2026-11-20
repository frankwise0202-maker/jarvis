// Key storage and the rest of chrome.storage: the key lives only in chrome.storage.local, is never
// logged or synced, and goes only to the API base (api.anthropic.com in release builds).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBrowser } from '../helpers/fake-chrome.mjs';
import { createStore, maskKey, validateApiKey, normalizeSettings, HISTORY_MAX, HISTORY_THUMBS } from '../../../extension/src/shared/storage.js';
import { createClient } from '../../../extension/src/background/api.js';

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ';

test('API key format checks', () => {
  assert.equal(validateApiKey('').ok, false);
  assert.match(validateApiKey('sk-ant-abc def').error, /spaces/);
  assert.match(validateApiKey('sk-proj-1234567890abcdefghijklmn').error, /start with "sk-ant-"/);
  assert.match(validateApiKey('sk-ant-123').error, /incomplete/);
  assert.deepEqual(validateApiKey(`  ${KEY}\n`), { ok: true, key: KEY });
  assert.equal(maskKey(KEY), 'sk-ant-…GHIJ');
  assert.ok(!maskKey(KEY).includes(KEY.slice(8, -4)));
});

test('the key is stored only in chrome.storage.local, never synced and never logged', async () => {
  const fb = createFakeBrowser();
  const store = createStore(fb.chrome);
  const logged = [];
  const saved = {};
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    saved[level] = console[level];
    console[level] = (...a) => logged.push(a.map(String).join(' '));
  }
  try {
    await store.confirmProfile(); // the first-run screen comes before the key
    const res = await store.setApiKey(KEY);
    assert.deepEqual(res, { ok: true, masked: 'sk-ant-…GHIJ' });
    assert.equal(await store.getApiKey(), KEY);
    assert.deepEqual(Object.keys(fb.chrome.storage.local.data).sort(), ['jarvis.apiKey', 'jarvis.profile']);
    assert.deepEqual(fb.chrome.storage.sync.data, {}, 'nothing in sync storage');
    assert.deepEqual(fb.chrome.storage.session.data, {});
    const bad = await store.setApiKey('nope');
    assert.equal(bad.ok, false);
    assert.equal(await store.getApiKey(), KEY, 'a bad key does not replace a good one');
    await store.clearApiKey();
    assert.equal(await store.getApiKey(), null);
  } finally {
    for (const level of Object.keys(saved)) console[level] = saved[level];
  }
  assert.ok(!logged.some((l) => l.includes(KEY)), 'the key never reaches the console');
});

test('the SDK sends the key to api.anthropic.com and nowhere else', async () => {
  const seen = [];
  const fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    seen.push({ url: String(url), auth: headers.get('authorization') || headers.get('x-api-key'), direct: headers.get('anthropic-dangerous-direct-browser-access') });
    return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createClient({ apiKey: KEY, fetch });
  await client.models.list();
  assert.equal(seen.length, 1);
  assert.ok(seen[0].url.startsWith('https://api.anthropic.com/v1/'), seen[0].url);
  assert.ok(seen[0].auth.includes(KEY));
  assert.equal(seen[0].direct, 'true');
});

test('release builds ignore the dev API base; dev builds accept only http(s) URLs', async () => {
  const fb = createFakeBrowser();
  await fb.chrome.storage.local.set({ 'jarvis.dev.apiBase': 'http://127.0.0.1:9999' });
  const store = createStore(fb.chrome);
  assert.equal(await store.getApiBase(), undefined, 'no __DEV__: the real API');
  globalThis.__DEV__ = true;
  try {
    assert.equal(await store.getApiBase(), 'http://127.0.0.1:9999');
    await fb.chrome.storage.local.set({ 'jarvis.dev.apiBase': 'javascript:alert(1)' });
    assert.equal(await store.getApiBase(), undefined);
  } finally {
    delete globalThis.__DEV__;
  }
});

test('settings are normalised', async () => {
  assert.deepEqual(normalizeSettings({ model: 'gpt-x', budgetUsd: 999, maxSteps: 0, incognito: 'yes' }), { model: 'claude-sonnet-5-5', budgetUsd: 50, maxSteps: 1, incognito: false });
  assert.deepEqual(normalizeSettings(undefined), { model: 'claude-sonnet-5-5', budgetUsd: 1, maxSteps: 40, incognito: false });
  const store = createStore(createFakeBrowser().chrome);
  const s = await store.setSettings({ model: 'claude-opus-5-5', budgetUsd: 2.5 });
  assert.equal(s.model, 'claude-opus-5-5');
  assert.equal(s.budgetUsd, 2.5);
  assert.equal((await store.getSettings()).maxSteps, 40);
});

test('history: kept locally, thumbnails only on recent tasks, nothing while incognito, can be cleared', async () => {
  const fb = createFakeBrowser();
  const store = createStore(fb.chrome);
  for (let i = 0; i < HISTORY_MAX + 5; i++) await store.saveTask({ id: `t${i}`, text: `task ${i}`, steps: [{ label: 'x', thumb: 'data:image/jpeg;base64,AAAA' }] });
  const list = await store.getHistory();
  assert.equal(list.length, HISTORY_MAX);
  assert.equal(list[0].id, `t${HISTORY_MAX + 4}`, 'newest first');
  assert.ok(list.slice(0, HISTORY_THUMBS).every((t) => t.steps[0].thumb));
  assert.ok(list.slice(HISTORY_THUMBS).every((t) => !('thumb' in t.steps[0])));
  await store.setSettings({ incognito: true });
  assert.equal(await store.saveTask({ id: 'secret', text: 'secret', steps: [] }), false);
  assert.ok(!(await store.getHistory()).some((t) => t.id === 'secret'));
  await store.clearHistory();
  assert.deepEqual(await store.getHistory(), []);
});

test('sites allowed permanently can be listed and forgotten', async () => {
  const store = createStore(createFakeBrowser().chrome);
  await store.allowSiteAlways('bestbuy.com');
  await store.allowSiteAlways('amazon.com');
  assert.deepEqual(Object.keys(await store.getSites()).sort(), ['amazon.com', 'bestbuy.com']);
  await store.forgetSite('amazon.com');
  assert.deepEqual(await store.getSites(), { 'bestbuy.com': 'always' });
});
