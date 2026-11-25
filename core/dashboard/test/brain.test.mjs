// Unit tests for app/brain.js: the home base brain's state mapping (key, spend, watchers, missions,
// the briefing) and the morning schedule (from the briefing time to 10:00 on the Core's clock and
// time zone, the 10-minute idle return, DST, kiosk only).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  briefingLead,
  dayKeyOf,
  fmtUsd,
  greetingFor,
  inMorning,
  keyState,
  missionRows,
  morningOn,
  morningWindow,
  normBrain,
  normBriefing,
  normJob,
  normList,
  normWatcher,
  spendState,
  todaysBriefing,
  upsert,
  watcherState,
} from '../app/brain.js';
import { makeBrain } from './brain-fixtures.mjs';

const NY = 'America/New_York';
const brainOf = (preset, at = '2026-11-25T12:05:00Z') => {
  const d = makeBrain(preset, Date.parse(at), { timeZone: NY });
  return { brain: normBrain(d.brain), jobs: normList({ jobs: d.jobs }, 'jobs', normJob), watchers: normList({ watchers: d.watchers }, 'watchers', normWatcher), briefing: normBriefing(d.briefing) };
};

test('an old Core (no brain) or a body that is not a brain gives null', () => {
  assert.equal(normBrain(null), null);
  assert.equal(normBrain({ error: 'not_found', message: 'Not found' }), null);
  assert.equal(normBrain([]), null);
  assert.equal(morningWindow(null), null, 'no brain: no morning mode');
  assert.equal(keyState(null), null);
  assert.equal(spendState(null), null);
  assert.equal(watcherState(null, []), null);
});

test('key status: a working key, no key, the SDK missing, a key not checked yet', () => {
  assert.deepEqual(keyState(brainOf('ok').brain), { state: 'set', level: 'ok', word: 'KEY SET', text: '…Ab3D' });
  const none = keyState(brainOf('nokey').brain);
  assert.equal(none.state, 'none');
  assert.equal(none.text, 'Add your key from Jarvis on your phone');
  const sdk = keyState(brainOf('sdk').brain);
  assert.equal(sdk.state, 'sdk');
  assert.equal(sdk.text, 'Run jarvis-core update');
  assert.equal(sdk.level, 'warn');
  // The SDK missing beats a missing key: nothing can run until the update.
  assert.equal(keyState(normBrain({ version: '1.1.0', key: { set: false }, sdk: { installed: false } })).state, 'sdk');
  const unverified = keyState(normBrain({ version: '1.1.0', key: { set: true, hint: '…Zz9Q', verified: false } }));
  assert.equal(unverified.state, 'unverified');
  assert.match(unverified.text, /…Zz9Q/);
});

test('spend against the caps: ok, 80 % warns, the cap (or the Core saying so) alerts', () => {
  const ok = spendState(brainOf('ok').brain);
  assert.equal(ok.level, 'ok');
  assert.equal(ok.today.text, '$0.42 of $5');
  assert.equal(ok.month.text, '$3.10 of $50');
  assert.ok(Math.abs(ok.today.frac - 0.084) < 1e-9);
  assert.equal(ok.capWords, null);
  const busy = spendState(brainOf('busy').brain);
  assert.equal(busy.today.level, 'warn', '$4.21 of $5 is over 80 %');
  assert.equal(busy.level, 'warn');
  const over = spendState(brainOf('overcap').brain);
  assert.equal(over.level, 'alert');
  assert.equal(over.today.level, 'alert');
  assert.equal(over.capReached, 'daily');
  assert.match(over.capWords, /Daily cap reached/);
  const monthly = spendState(normBrain({ version: '1.1.0', limits: { dailyUsd: 5, monthlyUsd: 50 }, spend: { todayUsd: 1, monthUsd: 50, capReached: 'monthly' } }));
  assert.equal(monthly.month.level, 'alert');
  assert.match(monthly.capWords, /next month/);
  const unknown = spendState(normBrain({ version: '1.1.0', limits: {}, spend: {} }));
  assert.equal(unknown.today.text, null, 'unknown spend is not shown as $0');
  assert.equal(fmtUsd(0), '$0');
  assert.equal(fmtUsd(5), '$5');
  assert.equal(fmtUsd(0.004), '<$0.01');
  assert.equal(fmtUsd(12.5), '$12.50');
});

test('watchers: the active count and the latest one met', () => {
  const { brain, watchers } = brainOf('ok');
  const w = watcherState(brain, watchers);
  assert.equal(w.active, 2);
  assert.equal(w.latestMet.what, 'LG 27GP850 under $300');
  // A watcher met over the stream replaces its old copy; the latest met wins.
  const later = upsert(watchers, normWatcher({ id: 'w_2', what: 'Concert tickets', status: 'met', lastCheckAt: '2026-11-25T12:04:00Z', lastResult: { met: true, summary: 'On sale' } }), 20);
  assert.equal(later.length, watchers.length);
  assert.equal(watcherState(normBrain({ version: '1.1.0', watchers: {} }), later).latestMet.what, 'Concert tickets');
  assert.equal(watcherState(brainOf('nokey').brain, []).active, 0);
});

test('missions: research only, running and queued first, then newest first, with a word per status', () => {
  const { jobs } = brainOf('busy');
  const rows = missionRows(jobs, 10);
  assert.ok(rows.every((r) => r.kind === 'research'), 'no watcher checks or briefing calls');
  assert.deepEqual(rows.slice(0, 2).map((r) => r.status), ['running', 'queued']);
  const finished = rows.slice(2);
  for (let i = 1; i < finished.length; i++) assert.ok(finished[i - 1].when >= finished[i].when, 'finished ones newest first');
  assert.deepEqual(
    rows.map((r) => r.word),
    ['RUNNING', 'QUEUED', 'DONE', 'DONE', 'FAILED', 'DONE', 'CANCELLED'],
  );
  assert.equal(rows.find((r) => r.status === 'failed').level, 'alert');
  assert.equal(missionRows(brainOf('overcap').jobs, 10).find((r) => r.status === 'blocked').level, 'warn');
  assert.equal(missionRows(jobs).length, 6, 'six rows at most');
  // A job from the stream (ISO times) replaces the listed one.
  const moved = upsert(jobs, normJob({ id: 'j_6', kind: 'research', title: 'Robot vacuums', status: 'done', finishedAt: '2026-11-25T12:06:00Z' }), 30);
  assert.equal(moved.filter((j) => j.id === 'j_6').length, 1);
  assert.equal(missionRows(moved)[0].status, 'queued');
});

test('the briefing: today only, headlines capped and https only, the full one has a lead', () => {
  const { briefing } = brainOf('long');
  assert.equal(briefing.headlines.length, 6);
  const b = normBriefing({
    date: '2026-11-25',
    generatedAt: '2026-11-25T12:00:00Z',
    kind: 'free',
    headlines: [{ title: 'A', url: 'javascript:alert(1)' }, { title: 'B', url: 'https://example.com/b' }, { title: '' }, ...Array.from({ length: 9 }, (_, i) => ({ title: `H${i}` }))],
    music: { suggestion: 'Something calm', appleMusicUrl: 'https://evil.example.com/x' },
    weather: null,
  });
  assert.equal(b.headlines.length, 6);
  assert.equal(b.headlines[0].url, null, 'only https links');
  assert.equal(b.headlines[1].url, 'https://example.com/b');
  assert.equal(b.music.url, null, 'only Apple Music links');
  assert.equal(b.weather, null);
  assert.equal(normBriefing({ error: 'none_yet' }), null);
  // Today's on the Core's clock and zone: 2026-11-25T03:00Z is still the 24th in New York.
  assert.equal(dayKeyOf(Date.parse('2026-11-25T03:00:00Z'), NY), '2026-11-24');
  assert.equal(todaysBriefing(b, Date.parse('2026-11-25T03:00:00Z'), NY), null);
  assert.equal(todaysBriefing(b, Date.parse('2026-11-25T12:00:00Z'), NY), b);
  assert.equal(briefingLead(b), null, 'a free briefing has no lead');
  const full = brainOf('full').briefing;
  const lead = briefingLead(full);
  assert.ok(lead && !/^Good morning/.test(lead), 'the lead leaves out the greeting');
  assert.equal(greetingFor('Frank'), 'Good morning, Frank.');
  assert.equal(greetingFor(null), 'Good morning.');
});

// --- the morning schedule ------------------------------------------------------------------------

const at = (iso) => Date.parse(iso);
const brain = (time, enabled = true) => normBrain({ version: '1.1.0', briefing: { enabled, time } });

test('the morning window: the briefing time (07:00 by default) to 10:00', () => {
  assert.deepEqual(morningWindow(brain('07:00')), { start: 420, end: 600 });
  assert.deepEqual(morningWindow(brain(undefined)), { start: 420, end: 600 }, 'no time: 07:00');
  assert.deepEqual(morningWindow(brain('6:30')), { start: 390, end: 600 });
  assert.equal(morningWindow(brain('10:00')), null, 'a briefing at 10:00 or later has no morning screen');
  assert.equal(morningWindow(brain('07:00', false)), null, 'the briefing turned off');
});

test('morning mode: 07:00 to 10:00 on the Core clock in the Core time zone, kiosk only', () => {
  const win = morningWindow(brain('07:00'));
  // 2026-11-25 in New York is EST (UTC−5): 07:00 local = 12:00Z.
  assert.equal(morningOn({ kiosk: true, win, nowMs: at('2026-11-25T11:59:00Z'), timeZone: NY }), false, '06:59');
  assert.equal(morningOn({ kiosk: true, win, nowMs: at('2026-11-25T12:00:00Z'), timeZone: NY }), true, '07:00');
  assert.equal(morningOn({ kiosk: true, win, nowMs: at('2026-11-25T14:59:59Z'), timeZone: NY }), true, '09:59:59');
  assert.equal(morningOn({ kiosk: true, win, nowMs: at('2026-11-25T15:00:00Z'), timeZone: NY }), false, '10:00');
  assert.equal(morningOn({ kiosk: false, win, nowMs: at('2026-11-25T12:30:00Z'), timeZone: NY }), false, 'never on a remote viewer');
  assert.equal(morningOn({ kiosk: true, win: null, nowMs: at('2026-11-25T12:30:00Z'), timeZone: NY }), false, 'never without a brain');
  // The same instant is morning only where the Core's clock says so.
  const noonUtc = at('2026-11-25T12:00:00Z');
  assert.equal(inMorning(noonUtc, NY, win), true, '07:00 in New York');
  assert.equal(inMorning(noonUtc, 'Europe/London', win), false, '12:00 in London');
  assert.equal(inMorning(noonUtc, 'Asia/Tokyo', win), false, '21:00 in Tokyo');
  assert.equal(inMorning(at('2026-11-25T08:00:00Z'), 'Europe/London', win), true, '08:00 in London');
});

test('a key or the mouse returns to the system report; the morning comes back after 10 idle minutes, until 10:00', () => {
  const win = morningWindow(brain('07:00'));
  const input = at('2026-11-25T12:30:00Z'); // 07:30 New York
  const on = (iso) => morningOn({ kiosk: true, win, nowMs: at(iso), timeZone: NY, lastInputAt: input });
  assert.equal(on('2026-11-25T12:30:00Z'), false, 'at the touch');
  assert.equal(on('2026-11-25T12:39:59Z'), false, '9:59 later');
  assert.equal(on('2026-11-25T12:40:00Z'), true, '10 minutes idle: back');
  const late = at('2026-11-25T14:55:00Z'); // 09:55
  assert.equal(morningOn({ kiosk: true, win, nowMs: at('2026-11-25T15:05:00Z'), timeZone: NY, lastInputAt: late }), false, 'not after 10:00');
  assert.equal(morningOn({ kiosk: true, win, nowMs: at('2026-11-25T14:59:00Z'), timeZone: NY, lastInputAt: late }), false, 'still within the 10 minutes at 09:59');
});

test('DST: the morning follows the wall clock on the days the clocks change', () => {
  const win = morningWindow(brain('07:00'));
  // 2026-03-08, New York springs forward at 02:00 (EST → EDT, UTC−4): 07:00 local = 11:00Z.
  assert.equal(inMorning(at('2026-03-08T10:59:00Z'), NY, win), false, '06:59 EDT');
  assert.equal(inMorning(at('2026-03-08T11:00:00Z'), NY, win), true, '07:00 EDT');
  assert.equal(inMorning(at('2026-03-08T13:59:00Z'), NY, win), true, '09:59 EDT');
  assert.equal(inMorning(at('2026-03-08T14:00:00Z'), NY, win), false, '10:00 EDT');
  // 2026-11-01, New York falls back at 02:00 (EDT → EST, UTC−5): 07:00 local = 12:00Z.
  assert.equal(inMorning(at('2026-11-01T11:00:00Z'), NY, win), false, '06:00 EST (07:00 the day before the change would have been 11:00Z)');
  assert.equal(inMorning(at('2026-11-01T12:00:00Z'), NY, win), true, '07:00 EST');
  assert.equal(inMorning(at('2026-11-01T14:59:00Z'), NY, win), true, '09:59 EST');
  // A briefing time inside the skipped hour (02:30 on the spring-forward day) starts at 03:00.
  const early = morningWindow(brain('02:30'));
  assert.equal(inMorning(at('2026-03-08T06:59:00Z'), NY, early), false, '01:59 EST');
  assert.equal(inMorning(at('2026-03-08T07:00:00Z'), NY, early), true, '03:00 EDT, the first minute after 01:59');
});

test('the morning card fits a busy night: the research first, three items, the rest counted', async () => {
  const { morningFinished } = await import('../app/brain-view.js');
  const job = (i, status = 'done') => ({ id: `j_${i}`, title: `Research ${i}`, status, summary: `Found ${i}` });
  const watcher = (i, status = 'met') => ({ id: `w_${i}`, what: `Watcher ${i}`, status, summary: `Met ${i}` });
  const busy = morningFinished({ jobs: [1, 2, 3, 4, 5].map((i) => job(i, i === 3 ? 'failed' : 'done')), watchers: [1, 2, 3].map((i) => watcher(i)) });
  assert.deepEqual(busy.shown.map((x) => x.title), ['Research 1', 'Research 2', 'Research 3']);
  assert.equal(busy.more, 5);
  assert.equal(busy.busy, true);
  const calm = morningFinished({ jobs: [job(1)], watchers: [watcher(1, 'watching'), { ...watcher(2), summary: '' , status: 'watching' }] });
  assert.deepEqual(calm.shown.map((x) => x.title), ['Research 1', 'Watcher 1'], 'a watcher still watching shows only with something to say');
  assert.equal(calm.more, 0);
  assert.equal(calm.busy, false);
  const three = morningFinished({ jobs: [], watchers: [watcher(2, 'watching'), watcher(1)].concat([watcher(3)]) });
  assert.deepEqual(three.shown.map((x) => x.title), ['Watcher 1', 'Watcher 3', 'Watcher 2'], 'met watchers first');
  assert.equal(three.busy, true);
  assert.equal(three.more, 0);
});
