// Unit tests for the HUD comms model (src/ui/hud/comms.js) and the new format helpers.
// Pure Node (no DOM): the comms model is plain data.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as comms from '../../src/ui/hud/comms.js';
import * as fmt from '../../src/ui/hud/format.js';
const { observeMission, getMissionLog, agentTrail, resetComms, missionTotals, pageLabel, MAX_ENTRIES } = comms;

let idn = 0;
const T0 = Date.UTC(2026, 10, 19, 6, 41, 0);

function agent(codename, extra = {}) {
  return {
    id: `a-${++idn}`,
    codename,
    role: `${codename} role`,
    task: 'task',
    web: true,
    model: 'claude-sonnet-5-5',
    status: 'queued',
    activity: 'Being briefed',
    thinking: '',
    report: '',
    sources: [],
    searches: [],
    fetches: [],
    usage: {},
    costUsd: 0,
    attempts: 0,
    startedAt: null,
    endedAt: null,
    error: null,
    ...extra,
  };
}

function mission(agents, extra = {}) {
  return { id: `m-${++idn}`, wave: 1, title: 'Kyoto in April', toolUseId: 't', createdAt: T0, startedAt: null, endedAt: null, status: 'planning', agents, ...extra };
}

const lines = (m) => getMissionLog(m.id).entries.map((e) => `${e.who} ${e.text}`);
const kinds = (m) => getMissionLog(m.id).entries.map((e) => e.kind);

test('live mission: launch, per-agent progress, report, failure and the wave end line', () => {
  resetComms();
  const atlas = agent('Atlas');
  const vega = agent('Vega');
  const m = mission([atlas, vega]);
  observeMission(m, T0);
  assert.deepEqual(lines(m), ['WAVE 1 planning · briefing agents']);
  observeMission(m, T0 + 10); // nothing changed: nothing added
  assert.equal(getMissionLog(m.id).entries.length, 1);

  m.status = 'running';
  m.startedAt = T0 + 1000;
  observeMission(m, T0 + 1000);
  assert.equal(lines(m).at(-1), 'WAVE 1 launched · 2 agents — Kyoto in April');

  Object.assign(atlas, { status: 'starting', attempts: 1, startedAt: T0 + 1100 });
  observeMission(m, T0 + 1100);
  Object.assign(atlas, { status: 'thinking' });
  observeMission(m, T0 + 1200);
  Object.assign(atlas, { status: 'searching', activity: 'Searching “kyoto ryok' });
  observeMission(m, T0 + 1300); // query not final yet: no line
  atlas.searches.push('kyoto ryokan prices april');
  observeMission(m, T0 + 1400);
  Object.assign(atlas, { status: 'reading' });
  atlas.fetches.push('https://www.japan-guide.com/e/e3913.html?x=1#top');
  observeMission(m, T0 + 1500);
  Object.assign(atlas, { status: 'writing' });
  atlas.sources = [{ url: 'https://a.example/1' }, { url: 'https://a.example/2' }];
  observeMission(m, T0 + 1600);
  Object.assign(atlas, { status: 'done', endedAt: T0 + 49100 });
  observeMission(m, T0 + 49100);

  Object.assign(vega, { status: 'starting', attempts: 1, startedAt: T0 + 2000 });
  observeMission(m, T0 + 2000);
  Object.assign(vega, { status: 'error', endedAt: T0 + 3000, error: { kind: 'rate_limit', message: 'Rate limited', retryable: true } });
  m.status = 'partial';
  m.endedAt = T0 + 72000;
  observeMission(m, T0 + 72000);

  assert.deepEqual(lines(m), [
    'WAVE 1 planning · briefing agents',
    'WAVE 1 launched · 2 agents — Kyoto in April',
    'ATLAS online · Atlas role',
    'ATLAS thinking',
    'ATLAS searching “kyoto ryokan prices april”',
    'ATLAS reading japan-guide.com/e/e3913.html',
    'ATLAS writing report',
    'ATLAS report filed · 2 sources · 48s',
    'VEGA online · Vega role',
    'VEGA failed: rate limited',
    'WAVE 1 complete · 1/2 agents · 1 failed · 1 search · 2 sources · 1m 11s',
  ]);
  const log = getMissionLog(m.id);
  const tones = log.entries.map((e) => e.tone);
  assert.equal(tones[7], 'ok');
  assert.equal(tones[9], 'err');
  assert.equal(tones[10], 'warn'); // partial
  assert.equal(log.entries[9].detail, 'Rate limited');
  assert.equal(log.entries[4].at, T0 + 1400);
  assert.ok(log.entries.every((e, i, all) => i === 0 || e.seq > all[i - 1].seq), 'sequence numbers increase');
  assert.ok(log.entries.every((e) => e.replay === false));
});

test('searches and reads that land between two looks are ordered by the current status', () => {
  resetComms();
  const a = agent('Nova', { status: 'starting', attempts: 1, startedAt: T0 });
  const m = mission([a], { status: 'running', startedAt: T0 });
  observeMission(m, T0);
  a.searches.push('q1');
  a.fetches.push('https://example.com/a');
  a.status = 'reading';
  observeMission(m, T0 + 100);
  a.searches.push('q2');
  a.fetches.push('https://example.com/b');
  a.status = 'searching';
  observeMission(m, T0 + 200);
  assert.deepEqual(kinds(m).slice(-4), ['search', 'read', 'read', 'search']);
  const trail = agentTrail(m.id, a.id);
  assert.deepEqual(trail.map((s) => `${s.kind}${s.index}@${s.at - T0}`), ['search0@100', 'read0@100', 'read1@200', 'search1@200']);
});

test('rate-limit pause, retry from scratch, and a resume after an interruption', () => {
  resetComms();
  const a = agent('Echo', { status: 'searching', attempts: 1, startedAt: T0, searches: ['first'] });
  const m = mission([a], { status: 'running', startedAt: T0 });
  observeMission(m, T0);
  Object.assign(a, { status: 'queued', activity: 'Rate limited — retrying in 5s' });
  observeMission(m, T0 + 100);
  assert.equal(lines(m).at(-1), 'ECHO rate limited — retrying in 5s');
  assert.equal(getMissionLog(m.id).entries.at(-1).tone, 'warn');
  Object.assign(a, { status: 'starting', attempts: 2, searches: [], fetches: [], activity: 'Starting' });
  observeMission(m, T0 + 5100);
  assert.equal(lines(m).at(-1), 'ECHO retrying · attempt 2');
  assert.deepEqual(agentTrail(m.id, a.id), [], 'the trail restarts with the new attempt');
  a.searches.push('second');
  a.status = 'searching';
  observeMission(m, T0 + 5200);
  assert.equal(lines(m).at(-1), 'ECHO searching “second”');
  assert.equal(agentTrail(m.id, a.id).length, 1);

  // Network drop → interrupted; then a resume resets the agent and the mission runs again.
  Object.assign(a, { status: 'interrupted', endedAt: T0 + 6000, error: { kind: 'network', message: 'x' } });
  m.status = 'interrupted';
  m.endedAt = T0 + 6000;
  observeMission(m, T0 + 6000);
  assert.deepEqual(lines(m).slice(-2), ['ECHO interrupted · connection lost', 'WAVE 1 interrupted · 0/1 done · resume to continue']);
  Object.assign(a, { status: 'queued', attempts: 0, searches: [], fetches: [], startedAt: null, endedAt: null, error: null, activity: '' });
  m.status = 'running';
  m.endedAt = null;
  observeMission(m, T0 + 9000);
  assert.equal(lines(m).at(-1), 'WAVE 1 resuming · 1 agent');
  Object.assign(a, { status: 'starting', attempts: 1, startedAt: T0 + 9100 });
  observeMission(m, T0 + 9100);
  assert.equal(lines(m).at(-1), 'ECHO back online');
  Object.assign(a, { status: 'done', endedAt: T0 + 20000, sources: [{ url: 'https://x.example' }] });
  m.status = 'done';
  m.endedAt = T0 + 20000;
  observeMission(m, T0 + 20000);
  assert.deepEqual(lines(m).slice(-2), ['ECHO report filed · 1 source · 10s', 'WAVE 1 complete · 1/1 agents · 0 searches · 1 source · 20s']);
});

test('a single failed search or page read becomes a warning line', () => {
  resetComms();
  const a = agent('Iris', { status: 'searching', attempts: 1, startedAt: T0 });
  const m = mission([a], { status: 'running', startedAt: T0 });
  observeMission(m, T0);
  a.activity = 'Search unavailable (too_many_requests)';
  observeMission(m, T0 + 1);
  a.activity = 'Couldn’t read that page (url_not_accessible)';
  a.status = 'reading';
  observeMission(m, T0 + 2);
  assert.deepEqual(lines(m).slice(-2), ['IRIS search unavailable (too_many_requests)', 'IRIS couldn’t read that page (url_not_accessible)']);
});

test('backlog: a finished mission seen for the first time is rebuilt in a sensible order', () => {
  resetComms();
  const a = agent('Atlas', { status: 'done', attempts: 1, startedAt: T0 + 1000, endedAt: T0 + 60000, searches: ['q1', 'q2'], fetches: ['https://example.com/p'], sources: [{ url: 'https://s/1' }] });
  const b = agent('Nova', { status: 'error', attempts: 1, startedAt: T0 + 2000, endedAt: T0 + 5000, error: { kind: 'unknown', message: 'The agent finished without writing a report.' } });
  const c = agent('Echo'); // never started (e.g. stopped while queued)
  c.status = 'stopped';
  c.endedAt = T0 + 61000;
  const m = mission([a, b, c], { status: 'stopped', startedAt: T0, endedAt: T0 + 61000 });
  observeMission(m, T0 + 999999);
  const log = getMissionLog(m.id);
  assert.deepEqual(lines(m), [
    'WAVE 1 launched · 3 agents — Kyoto in April',
    'ATLAS online · Atlas role',
    'ATLAS searching “q1”',
    'ATLAS searching “q2”',
    'ATLAS reading example.com/p',
    'NOVA online · Nova role',
    'NOVA failed: the agent finished without writing a report',
    'ATLAS report filed · 1 source · 59s',
    'ECHO stopped by owner', // never started: no "online" line
    'WAVE 1 stopped by owner · 1/3 done',
  ]);
  assert.ok(log.entries.every((e) => e.replay));
  assert.equal(log.entries[2].at, null, 'rebuilt searches have no time of their own');
  assert.equal(log.entries[1].at, T0 + 1000);
  assert.deepEqual(agentTrail(m.id, a.id).map((s) => `${s.kind}${s.index}:${s.at}`), ['search0:null', 'search1:null', 'read0:null']);
  // Observing the unchanged mission again adds nothing.
  observeMission(m, T0 + 1000000);
  assert.equal(log.entries.length, 10);
});

test('planned extras released at launch are forgotten; agents can appear while planning', () => {
  resetComms();
  const m = mission([]);
  observeMission(m, T0);
  const a = agent('Atlas');
  const b = agent('Nova');
  m.agents.push(a, b);
  observeMission(m, T0 + 10);
  assert.equal(getMissionLog(m.id).agents.size, 2);
  m.agents = [a];
  m.status = 'running';
  m.startedAt = T0 + 20;
  observeMission(m, T0 + 20);
  assert.equal(getMissionLog(m.id).agents.size, 1);
  assert.equal(lines(m).at(-1), 'WAVE 1 launched · 1 agent — Kyoto in April');
});

test('the log is capped and keeps the newest entries', () => {
  resetComms();
  const a = agent('Atlas', { status: 'searching', attempts: 1, startedAt: T0 });
  const m = mission([a], { status: 'running', startedAt: T0 });
  observeMission(m, T0);
  for (let i = 0; i < MAX_ENTRIES + 50; i++) {
    a.searches.push(`q${i}`);
    observeMission(m, T0 + i);
  }
  const log = getMissionLog(m.id);
  assert.equal(log.entries.length, MAX_ENTRIES);
  assert.equal(log.entries.at(-1).text, `searching “q${MAX_ENTRIES + 49}”`);
  assert.ok(log.trimmed >= 50);
  assert.equal(agentTrail(m.id, a.id).length, MAX_ENTRIES + 50, 'the agent trail is not capped by the log');
});

test('least recently observed mission logs are evicted', () => {
  resetComms();
  const first = mission([], { status: 'done', startedAt: T0, endedAt: T0 + 1 });
  observeMission(first, T0);
  for (let i = 0; i < 30; i++) observeMission(mission([], { status: 'done', startedAt: T0, endedAt: T0 + 1 }), T0);
  assert.equal(getMissionLog(first.id), null);
});

test('hostile text stays plain text and long values are shortened', () => {
  resetComms();
  const a = agent('<img src=x onerror=alert(1)>', { status: 'searching', attempts: 1, startedAt: T0, role: 'x'.repeat(500) });
  const m = mission([a], { status: 'running', startedAt: T0, title: '<script>alert(1)</script>' });
  observeMission(m, T0);
  a.searches.push(`${'long '.repeat(80)}<b>`);
  observeMission(m, T0 + 1);
  const log = getMissionLog(m.id);
  assert.equal(log.entries.at(-1).who, '<IMG SRC=X ONERROR=ALERT(1)>');
  assert.ok(log.entries.at(-1).text.length < 180);
  assert.ok(log.entries[1].text.length < 90);
});

test('missionTotals and pageLabel', () => {
  const m = mission(
    [
      agent('A', { status: 'done', searches: ['a', 'b'], sources: [{ url: 'u1' }, { url: 'u2' }] }),
      agent('B', { status: 'error', searches: ['c'], sources: [{ url: 'u2' }] }),
      agent('C', { status: 'interrupted' }),
      agent('D', { status: 'stopped' }),
      agent('E', { status: 'reading', fetches: ['https://x'] }),
    ],
    { status: 'running', startedAt: T0 },
  );
  const t = missionTotals(m, T0 + 5000);
  assert.deepEqual({ ...t }, { total: 5, done: 1, failed: 1, stopped: 1, interrupted: 1, active: 1, searches: 3, fetches: 1, sources: 2, durationMs: 5000 });
  assert.equal(pageLabel('https://www.japan-guide.com/e/e3913.html?q=1#x'), 'japan-guide.com/e/e3913.html');
  assert.equal(pageLabel('https://example.com/'), 'example.com');
  assert.equal(pageLabel('https://example.com/caf%C3%A9/%E0%A4%A'), 'example.com/caf%C3%A9/%E0%A4%A', 'malformed escapes stay encoded');
  assert.ok(pageLabel(`https://example.com/${'a/'.repeat(60)}`).endsWith('…'));
  assert.equal(pageLabel('not a url'), 'not a url');
});

test('format: fmtClock, fmtOffset, errorPhrase', () => {
  const d = new Date(2026, 10, 19, 6, 4, 9).getTime();
  assert.equal(fmt.fmtClock(d), '06:04:09');
  assert.equal(fmt.fmtClock(0), '');
  assert.equal(fmt.fmtClock('nope'), '');
  assert.equal(fmt.fmtOffset(7000), '0:07');
  assert.equal(fmt.fmtOffset(65000), '1:05');
  assert.equal(fmt.fmtOffset(3723000), '1:02:03');
  assert.equal(fmt.fmtOffset(-1), '');
  assert.equal(fmt.fmtOffset(null), '0:00');
  assert.equal(fmt.errorPhrase({ kind: 'rate_limit', message: 'x' }), 'rate limited');
  assert.equal(fmt.errorPhrase({ kind: 'network' }), 'connection lost');
  assert.equal(fmt.errorPhrase({ kind: 'unknown', message: 'The agent finished without writing a report.' }), 'the agent finished without writing a report');
  assert.equal(fmt.errorPhrase(null), 'unknown error');
  assert.ok(fmt.errorPhrase({ kind: 'weird', message: 'y'.repeat(200) }).length <= 61);
});

test('engine wave-B texts: staggered starts add no noise; a retry countdown is one line; names keep their capitals', () => {
  resetComms();
  const a = agent('Atlas');
  const b = agent('Nova');
  const m = mission([a, b], { status: 'running', startedAt: T0 });
  observeMission(m, T0);
  const before = getMissionLog(m.id).entries.length;
  b.activity = 'Lined up to start'; // staggered start (status stays queued)
  observeMission(m, T0 + 1);
  b.activity = 'Waiting for a free slot';
  observeMission(m, T0 + 2);
  assert.equal(getMissionLog(m.id).entries.length, before, 'queued → queued activity changes write nothing');
  Object.assign(a, { status: 'starting', attempts: 1, startedAt: T0 + 10, activity: 'Starting' });
  observeMission(m, T0 + 10);
  Object.assign(a, { status: 'queued', activity: 'Claude is busy — retrying in 12s' });
  observeMission(m, T0 + 20);
  for (let s = 11; s > 0; s--) {
    a.activity = `Claude is busy — retrying in ${s}s`; // the engine counts down every second
    observeMission(m, T0 + 20 + (12 - s) * 1000);
  }
  a.activity = 'Waiting for a free slot';
  observeMission(m, T0 + 33000);
  Object.assign(a, { status: 'starting', attempts: 2, activity: 'Starting' });
  observeMission(m, T0 + 34000);
  Object.assign(a, { status: 'queued', activity: 'Anthropic’s API had a hiccup — retrying in 3s' });
  observeMission(m, T0 + 35000);
  Object.assign(a, { status: 'starting', attempts: 3, activity: 'Starting' });
  observeMission(m, T0 + 38000);
  Object.assign(a, { status: 'queued', activity: 'Rate limited — retrying in 40s' });
  observeMission(m, T0 + 39000);
  assert.deepEqual(lines(m).slice(before), [
    'ATLAS online · Atlas role',
    'ATLAS Claude is busy — retrying in 12s',
    'ATLAS retrying · attempt 2',
    'ATLAS Anthropic’s API had a hiccup — retrying in 3s',
    'ATLAS retrying · attempt 3',
    'ATLAS rate limited — retrying in 40s',
  ]);
  assert.ok(getMissionLog(m.id).entries.slice(before + 1).every((e) => e.tone === 'warn'));
});

test('format: isRetrying', () => {
  assert.equal(fmt.isRetrying({ status: 'queued', activity: 'Rate limited — retrying in 12s' }), true);
  assert.equal(fmt.isRetrying({ status: 'queued', activity: 'Claude is busy — retrying in 1s' }), true);
  assert.equal(fmt.isRetrying({ status: 'queued', activity: 'Lined up to start' }), false);
  assert.equal(fmt.isRetrying({ status: 'searching', activity: 'Searching “retrying in 5s”' }), false, 'a query that mentions it is not a countdown');
  assert.equal(fmt.isRetrying({ status: 'searching', activity: 'Connection dropped — retrying in 3s' }), true, 'a transient wait while running');
  assert.equal(fmt.isRetrying({ status: 'done', activity: 'Rate limited — retrying in 3s' }), false);
  assert.equal(fmt.isRetrying(null), false);
  assert.equal(fmt.isRetryActivity('Anthropic’s API had a hiccup — retrying in 2s'), true);
});

test('a transient retry countdown on a running agent is one warning line, then work resumes', () => {
  resetComms();
  const a = agent('Echo', { status: 'searching', attempts: 1, startedAt: T0, activity: 'Searching' });
  const m = mission([a], { status: 'running', startedAt: T0 });
  observeMission(m, T0);
  const before = getMissionLog(m.id).entries.length;
  for (let s = 4; s > 0; s--) {
    a.activity = `Connection dropped — retrying in ${s}s`;
    observeMission(m, T0 + (5 - s) * 1000);
  }
  a.activity = 'Searching “kyoto rainy day”';
  a.searches.push('kyoto rainy day');
  observeMission(m, T0 + 6000);
  assert.deepEqual(lines(m).slice(before), ['ECHO connection dropped — retrying in 4s', 'ECHO searching “kyoto rainy day”']);
});
