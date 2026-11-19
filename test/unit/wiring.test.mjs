// Wave B wiring (SPEC §15): backups carry the owner's custom protocols and usage statistics
// (merged on import, never double counted), and the new settings keys are validated.
// The merge rules run in plain Node against a fake localStorage (fresh module instances per
// test); the full backup round trip runs in Chromium with real IndexedDB (platform harness).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './platform.harness.test.mjs';
import { normalizeSettings, DEFAULT_SETTINGS, LEAD_MODEL_IDS } from '../../src/platform/settings.js';

class FakeStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

let instance = 0;
async function fresh(rel, storage = new FakeStorage()) {
  globalThis.localStorage = storage;
  const mod = await import(`${new URL(rel, import.meta.url).href}?wiring=${++instance}`);
  return { mod, storage };
}

// ---- custom protocols ------------------------------------------------------------------------

const proto = (id, name, updatedAt, extra = {}) => ({ id, name, prompt: `Do the ${name.toLowerCase()} thing, thoroughly and with sources.`, mode: 'auto', icon: 'bolt', createdAt: 1000, updatedAt, ...extra });

test('protocols: export lists only custom protocols as plain data', async () => {
  const { mod } = await fresh('../../src/ui/protocols.js');
  assert.deepEqual(mod.exportCustomProtocols(), []);
  const saved = mod.saveCustomProtocol({ name: 'Market Wrap', prompt: 'A weekly market wrap with four agents.', mode: 'swarm', icon: 'dollar' });
  assert.equal(saved.ok, true);
  const out = mod.exportCustomProtocols();
  assert.equal(out.length, 1);
  assert.deepEqual(Object.keys(out[0]).sort(), ['createdAt', 'icon', 'id', 'mode', 'name', 'prompt', 'updatedAt']);
  assert.equal(out[0].name, 'Market Wrap');
  out[0].name = 'mutated';
  assert.equal(mod.exportCustomProtocols()[0].name, 'Market Wrap', 'exports are copies');
});

test('protocols: import adds new ids, replaces only newer copies, skips name clashes and junk, is idempotent', async () => {
  const storage = new FakeStorage({ 'jarvis.protocols.v1': JSON.stringify([proto('custom-a', 'Alpha', 5000), proto('custom-b', 'Bravo', 5000)]) });
  const { mod } = await fresh('../../src/ui/protocols.js', storage);
  let changes = 0;
  mod.onProtocolsChange(() => changes++);
  const backup = [
    proto('custom-a', 'Alpha renamed', 9000), // newer: replaces
    proto('custom-b', 'Bravo old', 1000), // older: ignored
    proto('custom-c', 'Charlie', 2000), // new
    proto('custom-d', 'alpha renamed', 2000), // name clash with the updated Alpha: skipped
    proto('morning-briefing', 'Not a built-in', 2000), // built-in id: rejected
    { id: 'custom-e', name: '', prompt: 'x' }, // invalid
    null,
    'junk',
  ];
  assert.equal(mod.importCustomProtocols(backup), 2);
  const names = mod.exportCustomProtocols().map((p) => `${p.id}:${p.name}`);
  assert.deepEqual(names, ['custom-a:Alpha renamed', 'custom-b:Bravo', 'custom-c:Charlie']);
  assert.ok(changes >= 1, 'grids are told to refresh');
  assert.equal(JSON.parse(storage.getItem('jarvis.protocols.v1')).length, 3, 'persisted');
  assert.equal(mod.importCustomProtocols(backup), 0, 'importing the same backup again changes nothing');
  assert.equal(mod.importCustomProtocols('nope'), 0);
  assert.equal(mod.listProtocols().filter((p) => p.custom).length, 3);
});

test('protocols: import respects the 24-protocol limit', async () => {
  const { mod } = await fresh('../../src/ui/protocols.js');
  const many = Array.from({ length: 30 }, (_, i) => proto(`custom-${i}`, `Protocol ${i}`, 1000 + i));
  assert.equal(mod.importCustomProtocols(many), mod.CUSTOM_PROTOCOL_LIMITS.count);
  assert.equal(mod.exportCustomProtocols().length, mod.CUSTOM_PROTOCOL_LIMITS.count);
});

// ---- statistics ------------------------------------------------------------------------------

const agent = (id, role, status = 'done') => ({ id, codename: id, role, status, searches: ['q'], sources: [{ url: `https://example.com/${id}` }], usage: {}, costUsd: 0.01 });
const swarmTurn = (id, n, endedAt = Date.now()) => ({
  id,
  role: 'jarvis',
  status: 'done',
  createdAt: endedAt - 60000,
  endedAt,
  costUsd: 0.1 * n,
  missions: { [`m-${id}`]: { id: `m-${id}`, wave: 1, title: 'Mission', status: 'done', agents: Array.from({ length: n }, (_, i) => agent(`${id}-a${i}`, i % 2 ? 'Market analyst' : 'Battery tech analyst')) } },
  segments: [{ id: 's1', kind: 'mission', missionId: `m-${id}` }, { id: 's2', kind: 'text', text: 'Answer', citations: [] }],
  stats: { agents: n, searches: n, sources: n, waves: 1, durationMs: 60000 },
});

test('stats: export is undefined until something is recorded, then plain data', async () => {
  const { mod } = await fresh('../../src/ui/stats.js');
  assert.equal(mod.exportStats(), undefined);
  mod.recordTurn(swarmTurn('t1', 4));
  const out = mod.exportStats();
  assert.equal(out.totals.agents, 4);
  assert.equal(out.totals.turns, 1);
  assert.ok(Array.isArray(out.seen) && out.seen.length === 1);
});

test('stats: importing onto a fresh device restores the history; re-importing never double counts', async () => {
  const source = await fresh('../../src/ui/stats.js');
  source.mod.recordTurn(swarmTurn('t1', 4));
  source.mod.recordTurn(swarmTurn('t2', 6));
  const backup = JSON.parse(JSON.stringify(source.mod.exportStats()));

  const { mod } = await fresh('../../src/ui/stats.js');
  let notified = 0;
  mod.onStatsChange(() => notified++);
  assert.equal(mod.importStats(backup), true);
  assert.equal(notified, 1);
  const s = mod.getStats();
  assert.equal(s.totals.agents, 10);
  assert.equal(s.totals.turns, 2);
  assert.equal(s.totals.missions, 2);
  assert.deepEqual(s.topRoles.map((r) => r[0]).sort(), ['Battery tech analyst', 'Market analyst']);
  assert.equal(mod.importStats(backup), false, 'the same backup again changes nothing');
  assert.equal(mod.getStats().totals.agents, 10);

  // A turn that was already counted (e.g. a resumed one) is not counted twice after a restore.
  assert.equal(mod.recordTurn(swarmTurn('t2', 6)), false);
  assert.equal(mod.getStats().totals.agents, 10);
  // New work on this device still adds up.
  mod.recordTurn(swarmTurn('t3', 2));
  assert.equal(mod.getStats().totals.agents, 12);
  assert.equal(mod.importStats(backup), false, 'an older backup never lowers the counts');
  assert.equal(mod.getStats().totals.agents, 12);
});

test('stats: merging keeps the larger count per field and per day; junk is ignored', async () => {
  const a = await fresh('../../src/ui/stats.js');
  a.mod.recordTurn(swarmTurn('x1', 3));
  const fromA = a.mod.exportStats();
  const { mod } = await fresh('../../src/ui/stats.js');
  mod.recordTurn(swarmTurn('y1', 5));
  assert.equal(mod.importStats(fromA), true);
  const s = mod.getStats();
  assert.equal(s.totals.agents, 5, 'max per field (never a sum that could double count)');
  assert.equal(s.totals.turns, 1);
  for (const junk of [null, 'x', [], { totals: 'no' }, { totals: { agents: -4 } }]) assert.equal(mod.importStats(junk), false);
});

// ---- settings --------------------------------------------------------------------------------

test('settings: wave-B keys have the SPEC defaults and validate', () => {
  for (const [k, v] of Object.entries({ followups: true, tone: 'butler', verbosity: 'balanced', theme: 'arc', sounds: true, soundVolume: 0.6, haptics: true, notifyOnFinish: true, voiceContinuous: true })) {
    assert.equal(DEFAULT_SETTINGS[k], v, k);
  }
  const ok = normalizeSettings({ tone: 'playful', verbosity: 'detailed', theme: 'ember', soundVolume: 0.333, followups: false, voiceContinuous: false });
  assert.equal(ok.tone, 'playful');
  assert.equal(ok.verbosity, 'detailed');
  assert.equal(ok.theme, 'ember');
  assert.equal(ok.soundVolume, 0.33);
  assert.equal(ok.followups, false);
  assert.equal(ok.voiceContinuous, false);
  const bad = normalizeSettings({ tone: 'sarcastic', verbosity: 'verbose', theme: 'Not A Theme!', soundVolume: 7, sounds: 'yes', haptics: 1 });
  assert.equal(bad.tone, 'butler');
  assert.equal(bad.verbosity, 'balanced');
  assert.equal(bad.theme, 'arc');
  assert.equal(bad.soundVolume, 1);
  assert.equal(bad.sounds, true);
  assert.equal(bad.haptics, true);
});

test('settings: Claude Haiku can be an agent but never the lead (a stored Haiku lead becomes Sonnet)', () => {
  assert.deepEqual([...LEAD_MODEL_IDS].sort(), ['claude-opus-5-5', 'claude-sonnet-5-5']);
  assert.equal(normalizeSettings({ leadModel: 'claude-haiku-5-5' }).leadModel, 'claude-sonnet-5-5');
  assert.equal(normalizeSettings({ leadModel: 'claude-sonnet-5-5' }).leadModel, 'claude-sonnet-5-5');
  assert.equal(normalizeSettings({ leadModel: 'gpt-4' }).leadModel, 'claude-opus-5-5');
  assert.equal(normalizeSettings({ workerModel: 'claude-haiku-5-5' }).workerModel, 'claude-haiku-5-5');
});

// ---- backup round trip in Chromium -----------------------------------------------------------

let h;
before(async () => {
  h = await createHarness({
    backup: 'src/platform/backup.js',
    db: 'src/platform/db.js',
    protocols: 'src/ui/protocols.js',
    stats: 'src/ui/stats.js',
  });
});
after(async () => {
  if (h) await h.close();
});

test('backup: registered parts travel in the backup and merge on import; reset clears them', async () => {
  const source = await h.newPage();
  const file = await source.evaluate(async () => {
    const { backup, protocols, stats } = window.__mods;
    // As app.js does at boot.
    backup.registerBackupPart('protocols', { exportData: () => protocols.exportCustomProtocols(), importData: (v) => protocols.importCustomProtocols(v) });
    backup.registerBackupPart('stats', { exportData: () => stats.exportStats(), importData: (v) => stats.importStats(v) });
    protocols.saveCustomProtocol({ name: 'Weekend Planner', prompt: 'Plan a great weekend near me with four agents.', mode: 'swarm', icon: 'pin' });
    stats.recordTurn({ id: 't1', role: 'jarvis', status: 'done', createdAt: Date.now() - 1000, endedAt: Date.now(), missions: { m: { id: 'm', wave: 1, status: 'done', agents: [{ id: 'a', codename: 'Atlas', role: 'Analyst', status: 'done', searches: [], sources: [] }] } }, segments: [], stats: { agents: 1 } });
    return (await backup.exportBackup()).text();
  });
  const data = JSON.parse(file);
  assert.equal(data.protocols.length, 1);
  assert.equal(data.protocols[0].name, 'Weekend Planner');
  assert.equal(data.stats.totals.agents, 1);

  const page = await h.newPage();
  const r = await page.evaluate(async (json) => {
    const { backup, protocols, stats } = window.__mods;
    backup.registerBackupPart('protocols', { exportData: () => protocols.exportCustomProtocols(), importData: (v) => protocols.importCustomProtocols(v) });
    backup.registerBackupPart('stats', { exportData: () => stats.exportStats(), importData: (v) => stats.importStats(v) });
    const first = await backup.importBackup(json);
    const second = await backup.importBackup(json);
    const result = { first, second, names: protocols.listProtocols().filter((p) => p.custom).map((p) => p.name), agents: stats.getStats().totals.agents };
    await backup.resetApp();
    result.after = { protocols: localStorage.getItem('jarvis.protocols.v1'), stats: localStorage.getItem('jarvis.stats.v1') };
    return result;
  }, file);
  // Settings are the defaults on both sides, so none changed (only changes are reported). The
  // exported backup also carries the (here empty) saved library, which the result reports.
  assert.deepEqual(r.first, { conversations: 0, copies: 0, replaced: [], memory: 0, settings: false, settingsChanged: [], skipped: 0, library: 0, protocols: 1, stats: true });
  assert.deepEqual(r.second, { conversations: 0, copies: 0, replaced: [], memory: 0, settings: false, settingsChanged: [], skipped: 0, library: 0, protocols: 0, stats: false });
  assert.deepEqual(r.names, ['Weekend Planner']);
  assert.equal(r.agents, 1);
  assert.deepEqual(r.after, { protocols: null, stats: null });
});

test('backup: part names are validated and a failing part never breaks a backup', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(async () => {
    const { backup } = window.__mods;
    const errors = [];
    for (const name of ['settings', 'conversations', 'library', 'apiKey', 'Bad Name', '', 42]) {
      try {
        backup.registerBackupPart(name, { exportData: () => 1, importData: () => 1 });
        errors.push('accepted');
      } catch (err) {
        errors.push(err instanceof TypeError ? 'TypeError' : String(err));
      }
    }
    const off = backup.registerBackupPart('broken', { exportData: () => { throw new Error('boom'); }, importData: () => { throw new Error('boom'); } });
    const data = JSON.parse(await (await backup.exportBackup()).text());
    const imported = await backup.importBackup({ app: 'jarvis', version: 1, broken: [1] });
    off();
    const keysAfter = Object.keys(JSON.parse(await (await backup.exportBackup()).text())).sort();
    return { errors, hasBroken: 'broken' in data, imported, keysAfter };
  });
  assert.deepEqual(r.errors, ['TypeError', 'TypeError', 'TypeError', 'TypeError', 'TypeError', 'TypeError', 'TypeError']);
  assert.equal(r.hasBroken, false);
  assert.deepEqual(r.imported, { conversations: 0, copies: 0, replaced: [], memory: 0, settings: false, settingsChanged: [], skipped: 0, broken: 0 });
  assert.deepEqual(r.keysAfter, ['app', 'conversations', 'exportedAt', 'library', 'memory', 'settings', 'version']);
});
