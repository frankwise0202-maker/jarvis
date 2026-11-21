// Presence (SPEC 2.4): the pure data model (state words, telemetry, situation line, Needs-you,
// chronometer, hero sizes), the HUD preferences store, and the "real data or nothing" rule for the
// HUD's drawing code. Runs in plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stateWord,
  clockText,
  telemetryOf,
  money,
  runningMissions,
  situationLine,
  emptyLedger,
  normalizeLedger,
  noteUnread,
  noteSeen,
  noteBriefing,
  forgetConversation,
  briefingHabit,
  deriveNeeds,
  readyBriefing,
  interruptedInfo,
  unreadFromTurn,
  chronometer,
  heroSize,
  partOfDay,
  dayKeyOf,
} from '../../src/ui/presence/model.js';
import { gaugeFraction, phaseOf, CORE_STATES } from '../../src/ui/hud/core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- state word ---------------------------------------------------------------------------------

test('state words are the exact SPEC strings, with a tone per state', () => {
  const w = (state, extra = {}) => stateWord({ state, ...extra });
  assert.equal(w('idle').word, 'STANDING BY');
  assert.equal(w('listening').word, 'LISTENING');
  assert.equal(w('thinking').word, 'THINKING');
  assert.equal(w('working', { agents: 3 }).word, 'WORKING · 3 AGENTS');
  assert.equal(w('working', { agents: 1 }).word, 'WORKING · 1 AGENT');
  assert.equal(w('working', { agents: 0 }).word, 'WORKING');
  assert.equal(w('speaking').word, 'SPEAKING');
  assert.equal(w('optics').word, 'OPTICS LIVE');
  assert.equal(w('analyzing').word, 'ANALYZING');
  assert.equal(w('watching', { watchLeftMs: 252000 }).word, 'WATCHING 4:12');
  assert.equal(w('offline').word, 'OFFLINE');
  assert.equal(w('error').word, 'ERROR');
  assert.equal(w('idle', { updated: true }).word, 'SYSTEMS UPDATED');
  assert.equal(w('nonsense').word, 'STANDING BY');
  // No phone-call states (owner decision: no COMMS).
  for (const s of ['dialing', 'call', 'comms']) assert.equal(w(s).word, 'STANDING BY');
  // Label / detail split for narrow headers.
  assert.deepEqual([w('working', { agents: 3 }).label, w('working', { agents: 3 }).detail], ['WORKING', '3 AGENTS']);
  assert.equal(w('idle').tone, 'ok');
  assert.equal(w('thinking').tone, 'think');
  assert.equal(w('error').tone, 'err');
  assert.equal(w('offline').tone, 'warn');
  assert.equal(w('listening').tone, 'active');
});

test('clockText counts down without ever showing 0:00 while time is left', () => {
  assert.equal(clockText(252000), '4:12');
  assert.equal(clockText(500), '0:01');
  assert.equal(clockText(0), '0:00');
  assert.equal(clockText(-5), '0:00');
  assert.equal(clockText(NaN), '0:00');
});

// ---- telemetry -----------------------------------------------------------------------------------

test('telemetry: spend is this month over the alert, unknown when either is missing; amber above 100%', () => {
  const t = telemetryOf({ monthUsd: 1.6, todayUsd: 0.42, spendAlertUsd: 20, activeAgents: 3, maxAgents: 8, mission: { done: 2, total: 6 } });
  assert.equal(t.core.spend, 0.08);
  assert.deepEqual(t.core.agents, [3, 8]);
  assert.deepEqual(t.core.mission, [2, 6]);
  assert.equal(t.spendOver, false);
  assert.deepEqual(t.labels, { spend: 'SPEND 8%', agents: 'AGENTS 3/8', mission: 'MISSION 2/6' });
  assert.equal(t.todayUsd, 0.42);

  const off = telemetryOf({ monthUsd: 5, spendAlertUsd: 0 });
  assert.equal(off.core.spend, null, 'alert off: unknown, not 0');
  assert.equal(off.labels.spend, 'SPEND —');
  const demo = telemetryOf({ monthUsd: null, spendAlertUsd: 20 });
  assert.equal(demo.core.spend, null, 'no spend data (demo): unknown');
  assert.equal(demo.core.mission, null);
  assert.equal(demo.labels.mission, 'MISSION —');

  const over = telemetryOf({ monthUsd: 26, spendAlertUsd: 20 });
  assert.equal(over.spendOver, true);
  assert.equal(over.labels.spend, 'SPEND 130%');
  assert.deepEqual(telemetryOf({ activeAgents: -2, maxAgents: 0 }).core.agents, [0, 1]);
});

test('gauge fractions from the core API: numbers, [value, max], or null', () => {
  assert.equal(gaugeFraction(0.25), 0.25);
  assert.equal(gaugeFraction([3, 8]), 0.375);
  assert.equal(gaugeFraction([3, 0]), null);
  assert.equal(gaugeFraction(null), null);
  assert.equal(gaugeFraction(undefined), null);
  assert.equal(gaugeFraction('x'), null);
  assert.equal(gaugeFraction(-1), 0);
  assert.equal(gaugeFraction([9, 8]), 1.125, 'over the max is kept (the core clamps the ticks and shows amber for spend)');
});

test('money formats spend readouts', () => {
  assert.equal(money(0.42), '$0.42');
  assert.equal(money(0), '$0.00');
  assert.equal(money(0.004), '<$0.01');
  assert.equal(money(null), '—');
});

// ---- running missions and the situation line --------------------------------------------------------

test('runningMissions reads planning/running missions only, with active and finished agents', () => {
  const turn = {
    missions: {
      a: { status: 'running', title: 'EV SUVs', agents: [{ status: 'searching' }, { status: 'done' }, { status: 'queued' }, { status: 'error' }] },
      b: { status: 'done', title: 'Old', agents: [{ status: 'done' }] },
    },
  };
  assert.deepEqual(runningMissions([turn, null, {}]), [{ title: 'EV SUVs', active: 1, done: 2, total: 4 }]);
});

test('situation line: weather, then the goal (live work, a ready briefing, needs, or nothing), then the Core', () => {
  assert.equal(situationLine({}), 'Nothing needs you.');
  assert.equal(situationLine({ running: [{ title: 'EV SUVs', active: 2 }] }), '2 agents still working on “EV SUVs”.');
  assert.equal(situationLine({ running: [{ title: 'EV SUVs', active: 1 }] }), '1 agent still working on “EV SUVs”.');
  assert.equal(situationLine({ running: [{ title: 'EV SUVs', active: 0 }] }), 'Working on “EV SUVs”.');
  assert.equal(situationLine({ busy: ['Lisbon weekend'] }), 'Working on “Lisbon weekend”.');
  assert.equal(situationLine({ busy: [''] }), 'Working on it.');
  assert.equal(situationLine({ briefingReady: 'Evening briefing' }), 'Your evening briefing is ready.');
  assert.equal(situationLine({ needs: [{ id: 'a' }] }), 'One thing needs you.');
  assert.equal(situationLine({ needs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }), 'Three things need you.');
  assert.equal(situationLine({ weather: '18° and clear.', needs: [] }), '18° and clear. Nothing needs you.');
  assert.equal(situationLine({ coreLine: 'Jarvis Core is offline.' }), 'Nothing needs you. Jarvis Core is offline.');
  const long = situationLine({ running: [{ title: 'Compare the best family electric SUVs: range, price, safety', active: 3 }] });
  assert.ok(long.length < 80 && long.includes('…'), long);
});

// ---- Needs-you ledger and items ----------------------------------------------------------------------

const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

test('ledger: unread missions are deduped and capped; seen clears them; junk is dropped', () => {
  let l = emptyLedger();
  for (let i = 0; i < 15; i++) l = noteUnread(l, { convId: `c${i}`, turnId: 't', title: `M${i}`, agents: 3, at: 1000 + i });
  assert.equal(l.unread.length, 12, 'capped at 12');
  l = noteUnread(l, { convId: 'c14', turnId: 't', title: 'again', at: 5000 });
  assert.equal(l.unread.filter((u) => u.convId === 'c14').length, 1, 'deduped by conversation + turn');
  l = noteSeen(l, 'c14', 6000);
  assert.equal(l.unread.some((u) => u.convId === 'c14'), false, 'opening the conversation clears it');
  l = noteUnread(l, { convId: 'c14', turnId: 't2', at: 7000 });
  assert.equal(l.unread.some((u) => u.convId === 'c14'), true, 'a later run is unread again');
  l = forgetConversation(l, 'c14');
  assert.equal(l.unread.some((u) => u.convId === 'c14'), false);
  assert.deepEqual(normalizeLedger('junk'), emptyLedger());
  assert.deepEqual(normalizeLedger({ unread: [null, { convId: 'x' }], seen: { a: 'no' }, briefings: { nope: ['morning'], '2026-11-19': ['lunch'] } }), emptyLedger());
});

test('briefings: two weeks kept; a habit is two runs in the previous seven days', () => {
  let l = emptyLedger();
  for (let d = 1; d <= 20; d++) l = noteBriefing(l, day(2026, 11, d), 'morning');
  assert.equal(Object.keys(l.briefings).length, 14);
  const today = day(2026, 11, 21, 8);
  assert.equal(briefingHabit(l, today, 'morning'), true);
  assert.equal(briefingHabit(l, today, 'evening'), false);
  let one = noteBriefing(emptyLedger(), day(2026, 11, 20), 'evening');
  assert.equal(briefingHabit(one, day(2026, 11, 21, 19), 'evening'), false, 'one run is not a habit');
  one = noteBriefing(one, day(2026, 11, 18), 'evening');
  assert.equal(briefingHabit(one, day(2026, 11, 21, 19), 'evening'), true);
});

test('Needs-you: interrupted, failed, spend, finished, briefing — most urgent first, current chat excluded', () => {
  const now = day(2026, 11, 21, 8);
  let l = emptyLedger();
  l = noteUnread(l, { convId: 'done1', turnId: 't1', title: 'Best family EV SUVs', status: 'done', agents: 6, failed: 0, at: now.getTime() - 3600e3 });
  l = noteUnread(l, { convId: 'err1', turnId: 't2', title: 'Robot vacuums', status: 'error', agents: 0, at: now.getTime() - 600e3 });
  l = noteUnread(l, { convId: 'brief', turnId: 't3', title: 'Morning briefing', status: 'done', agents: 6, briefing: 'morning', at: now.getTime() - 60e3 });
  for (let d = 18; d <= 20; d++) l = noteBriefing(l, day(2026, 11, d, 8), 'morning');
  const items = deriveNeeds({
    ledger: l,
    interrupted: [{ convId: 'int1', turnId: 'tx', title: 'Kyoto in April', done: 2, total: 6 }],
    spend: { monthUsd: 23.4, alertUsd: 20, dismissed: false },
    now,
    currentConvId: null,
    locale: 'en-US',
  });
  assert.deepEqual(items.map((i) => i.kind), ['interrupted', 'failed', 'spend', 'finished', 'finished', 'briefing']);
  const byKind = Object.fromEntries(items.map((i) => [i.kind, i]));
  assert.equal(byKind.interrupted.action, 'Resume');
  assert.equal(byKind.interrupted.title, 'Kyoto in April');
  assert.equal(byKind.interrupted.detail, 'MISSION INTERRUPTED · 2 OF 6 AGENTS DONE');
  assert.equal(byKind.failed.action, 'Retry');
  assert.equal(byKind.spend.action, 'Review');
  assert.equal(byKind.spend.detail, '$23.40 THIS MONTH · ALERT $20');
  assert.equal(byKind.briefing.action, 'Run');
  const finished = items.filter((i) => i.kind === 'finished');
  assert.equal(finished[0].title, 'Morning briefing is ready', 'the newest first');
  assert.equal(finished[1].title, 'Best family EV SUVs');
  assert.match(finished[1].detail, /^DONE · 6 AGENTS · /);
  assert.equal(readyBriefing(items), 'Morning briefing');

  // The conversation on screen is already in view; a dismissed spend banner stays dismissed;
  // the morning briefing that ran today is not asked for again.
  const quiet = deriveNeeds({ ledger: noteBriefing(l, now, 'morning'), interrupted: [{ convId: 'int1', title: 'x' }], spend: { monthUsd: 23.4, alertUsd: 20, dismissed: true }, now, currentConvId: 'int1' });
  assert.deepEqual(quiet.map((i) => i.kind), ['failed', 'finished', 'finished']);
  assert.deepEqual(deriveNeeds({ ledger: emptyLedger(), now }), []);
});

test('interruptedInfo and unreadFromTurn read the stored conversation shape', () => {
  const conv = {
    id: 'c1',
    title: 'EV SUVs',
    turns: [
      { id: 'u1', role: 'user', text: 'x' },
      { id: 'j1', role: 'jarvis', status: 'interrupted', missions: { m: { title: 'Family EV SUVs', agents: [{ status: 'done' }, { status: 'searching' }, { status: 'error' }] } } },
    ],
  };
  assert.deepEqual(interruptedInfo(conv), { convId: 'c1', turnId: 'j1', title: 'Family EV SUVs', done: 1, total: 3 });
  assert.equal(interruptedInfo({ id: 'x', turns: [{ role: 'user' }] }), null);
  const u = unreadFromTurn(conv, { ...conv.turns[1], status: 'done', endedAt: 1234 }, 'evening');
  assert.deepEqual(u, { convId: 'c1', turnId: 'j1', title: 'Family EV SUVs', status: 'done', agents: 3, failed: 1, briefing: 'evening', at: 1234 });
  assert.equal(unreadFromTurn(conv, { id: 'q', status: 'done', missions: {} }), null, 'a quick reply is not a Needs-you item');
  assert.equal(unreadFromTurn(conv, { id: 'q', status: 'error', missions: {} }).status, 'error', 'a failed request is');
});

// ---- chronometer, part of day, hero sizes -----------------------------------------------------------

test('chronometer: no seconds, the locale’s 12/24-hour clock, a long date', () => {
  const d = new Date(2026, 10, 19, 21, 47, 33);
  const us = chronometer(d, 'en-US');
  assert.equal(us.digits, '9:47');
  assert.equal(us.period, 'PM');
  assert.equal(us.date, 'THURSDAY NOVEMBER 19');
  const gb = chronometer(d, 'en-GB');
  assert.equal(gb.digits, '21:47');
  assert.equal(gb.period, '');
  assert.equal(gb.date, 'THURSDAY 19 NOVEMBER');
  assert.equal(partOfDay(new Date(2026, 0, 1, 11, 59)), 'morning');
  assert.equal(partOfDay(new Date(2026, 0, 1, 12)), 'afternoon');
  assert.equal(partOfDay(new Date(2026, 0, 1, 17)), 'evening');
  assert.equal(dayKeyOf(d), '2026-11-19');
});

test('hero sizes follow SPEC 2.4.4: 232 desktop; 184 / 148 / 120 on phones by height', () => {
  assert.equal(heroSize({ width: 1440, height: 900 }), 232);
  assert.equal(heroSize({ width: 390, height: 844 }), 184);
  assert.equal(heroSize({ width: 390, height: 740 }), 184);
  assert.equal(heroSize({ width: 375, height: 667 }), 148);
  assert.equal(heroSize({ width: 375, height: 620 }), 148);
  assert.equal(heroSize({ width: 320, height: 568 }), 120);
});

// ---- the core's states and phases ------------------------------------------------------------------------

test('the core knows the Presence states (no call state) and phases come from ids, not chance', () => {
  assert.deepEqual([...CORE_STATES].sort(), ['error', 'idle', 'listening', 'offline', 'optics', 'speaking', 'standby', 'thinking', 'working']);
  assert.equal(phaseOf('agent-1'), phaseOf('agent-1'));
  assert.notEqual(phaseOf('agent-1'), phaseOf('agent-2'));
  for (const id of ['a', 'b', 'Atlas', '#3']) {
    const p = phaseOf(id);
    assert.ok(p >= 0 && p < 1, `${id}: ${p}`);
  }
});

// ---- acceptance check: real data or nothing ------------------------------------------------------------

test('no Math.random in the HUD and Presence drawing code (SPEC 2.4.21)', () => {
  const dirs = ['src/ui/hud', 'src/ui/presence'];
  const files = ['src/ui/header.js', 'src/ui/chat.js', 'src/ui/voice-mode.js', 'src/styles/presence.css'];
  for (const dir of dirs) for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.js')) files.push(path.join(dir, f));
  const hits = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/Math\.random\s*\(/.test(text)) hits.push(rel);
  }
  assert.deepEqual(hits, []);
});

// ---- HUD preferences --------------------------------------------------------------------------------------

class FakeStorage {
  constructor() {
    this.map = new Map();
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

let fresh = 0;
async function hudModule(storage) {
  globalThis.localStorage = storage;
  return import(`../../src/ui/presence/hud-prefs.js?t=${++fresh}`);
}

test('HUD prefs: Calm, Full motion and once-a-session boot by default; validated, saved, announced, backed up', async () => {
  const storage = new FakeStorage();
  try {
    const m = await hudModule(storage);
    assert.deepEqual({ ...m.getHud() }, { density: 'calm', motion: 'full', boot: 'session' });
    assert.ok(Object.isFrozen(m.getHud()));
    assert.equal(m.exportHud(), undefined, 'nothing to back up until the owner changes something');
    const seen = [];
    const off = m.onHudChange((p) => seen.push(p.density));
    assert.equal(m.saveHud({ density: 'full', motion: 'sideways', boot: 'never', extra: 1 }).density, 'full');
    assert.deepEqual({ ...m.getHud() }, { density: 'full', motion: 'full', boot: 'never' }, 'invalid values keep the current value; unknown keys are dropped');
    assert.deepEqual(JSON.parse(storage.getItem(m.HUD_KEY)), { density: 'full', motion: 'full', boot: 'never' });
    m.saveHud({ density: 'full' });
    assert.deepEqual(seen, ['full'], 'one notification per real change');
    off();
    assert.deepEqual(m.exportHud(), { density: 'full', motion: 'full', boot: 'never' });
    assert.equal(m.importHud({ density: 'calm', motion: 'still' }), 1);
    assert.equal(m.getHud().motion, 'still');
    assert.equal(m.importHud({ density: 'calm', motion: 'still' }), 0, 'importing the same prefs changes nothing');
    assert.equal(m.importHud('junk'), 0);
    // A damaged stored value falls back to the defaults.
    storage.setItem(m.HUD_KEY, '{nope');
    m.resetHudCache();
    assert.deepEqual({ ...m.getHud() }, { density: 'calm', motion: 'full', boot: 'session' });
  } finally {
    delete globalThis.localStorage;
  }
});
