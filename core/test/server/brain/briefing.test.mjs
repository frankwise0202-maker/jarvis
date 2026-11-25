// node --test: the morning briefing (free and full), its scheduler across daylight saving time, the
// settings it uses (geocoding, validation) and the tolerant feed parser. Weather and feeds come from
// core/fixtures/brain; Claude is the local fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeClaude, toolUse, search } from './fake-claude.mjs';
import { makeBrain, tmp, KEY, MORNING, TZ } from './helpers.mjs';
import { createManualClock } from '../../../server/clock.mjs';
import { createFixtureFetch } from '../../../server/brain/fixture-fetch.mjs';
import { parseFeed, mergeHeadlines } from '../../../server/brain/rss.mjs';
import { parseForecast } from '../../../server/brain/weather.mjs';
import { nextDailyAt } from '../../../server/brain/schedule.mjs';
import { overnightReport } from '../../../server/brain/homebase.mjs';
import { readWhatsNew } from '../../../server/brain/briefing.mjs';
import { fixtureCore } from '../helpers.mjs';
import { setLocale } from '../../../server/format.mjs';

const LOCATION = { lat: -41.2866, lon: 174.7756, label: 'Wellington, New Zealand' };

function whatsNew() {
  const dir = tmp();
  const file = path.join(dir, 'whats-new.json');
  fs.writeFileSync(file, JSON.stringify([
    { date: '2026-11-25', title: 'Your home base can research for you', detail: 'Ask it from the Home base sheet.' },
    { date: '2026-11-01', title: 'An old one', detail: 'Not shown any more.' },
  ]));
  return file;
}

test('free briefing (no key): weather, 6 headlines general/tech, overnight report, what\'s new, music; markdown and spoken', async () => {
  const { core } = fixtureCore('ok');
  setLocale('en-US'); // the server tests' helpers pin en-GB; the owner's Core says "Wednesday, November 25"
  const { brain, push } = makeBrain({ core, whatsNewFile: whatsNew() });
  try {
    await brain.putSettings({ briefing: { location: LOCATION } });
    const b = await brain.runBriefing();
    assert.equal(b.kind, 'free');
    assert.equal(b.date, '2026-11-25');
    assert.equal(b.greeting, 'Good morning, Frank.');
    assert.deepEqual(b.weather, {
      label: 'Wellington, New Zealand',
      units: 'F',
      now: { temp: 41, summary: 'Partly cloudy', code: 2 },
      today: { high: 52, low: 38, rainChancePct: 20, summary: 'Overcast, high 52°, low 38°, 20% chance of rain' },
    });
    assert.equal(b.headlines.length, 6);
    assert.deepEqual(b.headlines.map((h) => h.source), ['NPR', 'Ars Technica', 'BBC News', 'The Verge', 'NPR', 'Ars Technica']);
    assert.equal(b.headlines[0].title, 'Holiday travel hits a record as storms threaten the Northeast');
    assert.equal(b.headlines[3].title, 'Apple’s next iPhone update fixes the alarm bug');
    assert.ok(!b.headlines.some((h) => /old story/.test(h.title)), 'week-old items are left out');
    assert.equal(b.homebase.level, 'ok');
    assert.ok(Array.isArray(b.homebase.notes) && b.homebase.notes.length >= 1);
    assert.deepEqual(b.whatsNew, [{ title: 'Your home base can research for you', detail: 'Ask it from the Home base sheet.' }]);
    assert.match(b.music.appleMusicUrl, /^https:\/\/music\.apple\.com\/us\/search\?term=/);
    assert.match(b.markdown, /^\*\*Good morning, Frank\.\*\* It's Wednesday, November 25\./);
    assert.match(b.markdown, /\[Holiday travel hits a record as storms threaten the Northeast\]\(https:\/\/www\.npr\.org\//);
    assert.match(b.spoken, /^Good morning, Frank\. It's Wednesday, November 25\. It's partly cloudy and 41 degrees, with a high of 52\./);
    assert.ok(!/[[\]*]|https?:/.test(b.spoken), 'spoken text has no links or markdown');
    assert.deepEqual(brain.latestBriefing(), b);
    assert.equal(push.sent.length, 0, 'a briefing asked for by hand sends no notification');
    assert.equal(brain.info().briefing.lastAt, b.generatedAt);
    // Without a location there is no weather (and a hint where to set it), and nothing fails.
    await brain.putSettings({ briefing: { location: null } });
    const nl = await brain.runBriefing();
    assert.equal(nl.weather, null);
    assert.match(nl.markdown, /share your location from Jarvis/);
    // Feeds and weather offline: still a briefing.
    const offline = makeBrain({ core, fetchFn: createFixtureFetch({ overrides: { '.': new TypeError('fetch failed') } }) });
    await offline.brain.putSettings({ briefing: { location: LOCATION } });
    const ob = await offline.brain.runBriefing();
    assert.equal(ob.weather, null);
    assert.deepEqual(ob.headlines, []);
    assert.match(ob.markdown, /Good morning, Frank/);
    await offline.brain.stop();
  } finally {
    await brain.stop();
  }
});

test('full briefing (key set): one Claude call with web search (3 uses), Jarvis writes it; at most $0.30 a day', async () => {
  const fake = await startFakeClaude({
    script: (body) => {
      assert.equal(body.model, 'claude-sonnet-5-5');
      const tools = body.tools.map((t) => t.name);
      assert.deepEqual(tools, ['web_search', 'write_briefing']);
      assert.equal(body.tools[0].max_uses, 3);
      assert.match(body.messages[0].content[0].text, /<facts>/);
      assert.match(body.messages[0].content[0].text, /Holiday travel hits a record/);
      assert.match(body.system[0].text, /calm, warm, understated British voice/);
      return {
        blocks: [
          toolUse('write_briefing', {
            markdown: '**Good morning, Frank.** A grey, mild start.\n\n- [Holiday travel hits a record](https://www.npr.org/2026/11/25/holiday-travel-record)',
            spoken: 'Good morning, Frank. A grey, mild start to the day.',
            headlines: [
              { title: 'Holiday travel hits a record', source: 'NPR', url: 'https://www.npr.org/2026/11/25/holiday-travel-record' },
              { title: 'Bad link', source: 'X', url: 'javascript:alert(1)' },
            ],
          }),
        ],
        stop: 'tool_use',
        usage: { input_tokens: 115_000, output_tokens: 6_000 },
      };
    },
  });
  const { core } = fixtureCore('ok');
  const { brain } = makeBrain({ fake, core });
  try {
    await brain.setKey({ key: KEY });
    await brain.putSettings({ briefing: { location: LOCATION } });
    const b = await brain.runBriefing();
    assert.equal(b.kind, 'full');
    assert.match(b.markdown, /A grey, mild start/);
    assert.equal(b.spoken, 'Good morning, Frank. A grey, mild start to the day.');
    assert.deepEqual(b.headlines, [{ title: 'Holiday travel hits a record', source: 'NPR', url: 'https://www.npr.org/2026/11/25/holiday-travel-record' }]);
    assert.ok(b.weather && b.homebase && b.music, 'the free facts stay');
    assert.equal(fake.messageRequests.length, 1);
    const jobs = brain.listJobs({ kind: 'briefing' });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, 'done');
    // 115k in, 6k out (its max_tokens) on Sonnet 5.5 = 0.23 + 0.06 = 0.29: under $0.02 is left today.
    assert.equal(jobs[0].costUsd, 0.29);
    const again = await brain.runBriefing();
    assert.equal(again.kind, 'free');
    assert.equal(fake.messageRequests.length, 1, 'the $0.30 daily briefing cap holds: no second call');
    assert.deepEqual(fake.violations, []);
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('full briefing falls back to the free one when Claude fails', async () => {
  const fake = await startFakeClaude({ script: () => ({ status: 529, errorType: 'overloaded_error', message: 'Overloaded' }) });
  const { brain } = makeBrain({ fake });
  try {
    await brain.setKey({ key: KEY });
    const b = await brain.runBriefing();
    assert.equal(b.kind, 'free');
    assert.match(b.markdown, /Good morning, Frank/);
    assert.equal(brain.listJobs({ kind: 'briefing' })[0].status, 'failed');
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('scheduler: 07:00 local every day across daylight saving time, once per day, notification, no repeat after a restart, catch-up', async () => {
  // DST ends in New York on Sunday 2026-11-01: 07:00 is 11:00Z on Saturday and 12:00Z on Sunday.
  assert.equal(new Date(nextDailyAt('07:00', TZ, Date.parse('2026-10-31T16:00:00Z'))).toISOString(), '2026-11-01T12:00:00.000Z');
  assert.equal(new Date(nextDailyAt('07:00', TZ, Date.parse('2026-03-07T17:00:00Z'))).toISOString(), '2026-03-08T11:00:00.000Z');
  assert.equal(new Date(nextDailyAt('07:00', TZ, Date.parse('2026-03-08T10:59:00Z'))).toISOString(), '2026-03-08T11:00:00.000Z');
  assert.equal(new Date(nextDailyAt('07:00', TZ, Date.parse('2026-11-01T11:30:00Z'))).toISOString(), '2026-11-01T12:00:00.000Z', '06:30 EST, after the change');

  const data = tmp();
  const clock = createManualClock(Date.parse('2026-10-31T16:00:00Z'));
  const first = makeBrain({ clock, dataDir: data });
  const b1 = first.brain;
  assert.equal(b1.info().briefing.nextAt, '2026-11-01T12:00:00.000Z');
  clock.set(Date.parse('2026-11-01T11:59:00Z'));
  assert.equal(b1.briefings.tick(), null, 'not yet (06:59 EST)');
  clock.set(Date.parse('2026-11-01T12:00:20Z'));
  const ran = b1.briefings.tick();
  assert.ok(ran, 'due at 07:00 EST');
  const briefing = await ran;
  assert.equal(briefing.date, '2026-11-01');
  assert.equal(b1.briefings.tick(), null, 'only once');
  assert.equal(b1.info().briefing.nextAt, '2026-11-02T12:00:00.000Z');
  assert.equal(first.push.sent.length, 1);
  assert.deepEqual(first.push.sent[0], { title: 'Good morning, Frank.', body: first.push.sent[0].body, url: 'https://frankwise0202-maker.github.io/jarvis/?homebase=briefing', tag: 'briefing' });
  assert.match(first.push.sent[0].body, /Your briefing is ready/);
  await b1.stop();

  // A restart ten minutes later does not repeat it.
  clock.set(Date.parse('2026-11-01T12:10:00Z'));
  const second = makeBrain({ clock, dataDir: data });
  assert.equal(second.brain.info().briefing.nextAt, '2026-11-02T12:00:00.000Z');
  assert.equal(second.brain.latestBriefing().date, '2026-11-01');
  await second.brain.stop();

  // Down at 07:00 the next day, back at 08:00: the missed briefing runs at once.
  clock.set(Date.parse('2026-11-02T13:00:00Z'));
  const third = makeBrain({ clock, dataDir: data });
  assert.equal(third.brain.info().briefing.nextAt, '2026-11-02T12:00:00.000Z');
  const late = await third.brain.briefings.tick();
  assert.equal(late.date, '2026-11-02');
  assert.equal(third.brain.info().briefing.nextAt, '2026-11-03T12:00:00.000Z');
  // Turned off: nothing is scheduled; a new time reschedules.
  await third.brain.putSettings({ briefing: { enabled: false } });
  assert.equal(third.brain.info().briefing.nextAt, null);
  await third.brain.putSettings({ briefing: { enabled: true, time: '6:30' } });
  assert.equal(third.brain.info().briefing.time, '06:30');
  assert.equal(third.brain.info().briefing.nextAt, '2026-11-03T11:30:00.000Z');
  await third.brain.stop();
});

/** A Core that has just started: its internet check has not answered yet. */
function startingCore(clock) {
  return {
    startedAt: clock.now(),
    snapshot: { health: { level: 'ok', summary: 'All systems normal' }, services: { internet: { status: 'unknown' } } },
    history: { query: () => ({ t: [], series: {} }) },
    events: { between: () => [] },
  };
}

test('a missed 07:00 after a boot waits for the network and the first readings (2 minutes at most), then catches up', async () => {
  // The machine was off at 07:00 and boots at 08:00 New York time; the network comes up 20 s later.
  const clock = createManualClock(Date.parse('2026-11-26T13:00:00Z'));
  const real = createFixtureFetch();
  let networkUp = false;
  const fetchFn = (url, opts) => (networkUp ? real(url, opts) : Promise.reject(Object.assign(new TypeError('fetch failed'), { code: 'ENETUNREACH' })));
  const core = startingCore(clock);
  const { brain, push } = makeBrain({ clock, core, fetchFn });
  try {
    await brain.putSettings({ briefing: { location: LOCATION } });
    brain.briefings.reschedule();
    assert.equal(brain.info().briefing.nextAt, '2026-11-26T12:00:00.000Z', 'the missed 07:00 is due');
    brain.tick(); // what start() does at once
    assert.equal(brain.briefings.tick(), null, 'not in the first moments after a start');
    assert.equal(brain.latestBriefing(), null);
    clock.set(clock.now() + 20_000);
    networkUp = true;
    core.snapshot.services.internet.status = 'up';
    const b = await brain.briefings.tick();
    assert.ok(b, 'made once the internet is up');
    assert.equal(b.date, '2026-11-26');
    assert.equal(b.weather?.label, 'Wellington, New Zealand');
    assert.ok(b.headlines.length > 0);
    assert.equal(push.sent.length, 1);
    assert.equal(brain.info().briefing.nextAt, '2026-11-27T12:00:00.000Z');
    // No internet answer at all: it still comes, 2 minutes after the start.
    const clock2 = createManualClock(Date.parse('2026-11-26T13:00:00Z'));
    const second = makeBrain({ clock: clock2, core: startingCore(clock2) });
    await second.brain.putSettings({ briefing: { location: LOCATION } });
    second.brain.briefings.reschedule();
    clock2.set(clock2.now() + 60_000);
    assert.equal(second.brain.briefings.tick(), null, 'still waiting after a minute');
    clock2.set(clock2.now() + 61_000);
    const late = await second.brain.briefings.tick();
    assert.ok(late && late.weather, 'made at the 2-minute deadline');
    await second.brain.stop();
  } finally {
    await brain.stop();
  }
});

test('a scheduled briefing made while the feeds and the weather fail is made again 7 minutes later, quietly', async () => {
  const clock = createManualClock(Date.parse('2026-11-26T11:59:00Z')); // 06:59 in New York
  const real = createFixtureFetch();
  let networkUp = false;
  const fetchFn = (url, opts) => (networkUp ? real(url, opts) : Promise.reject(new TypeError('fetch failed')));
  const data = tmp();
  const { brain, push, logs } = makeBrain({ clock, fetchFn, dataDir: data });
  const events = [];
  brain.on('briefing', (e) => events.push(e));
  try {
    await brain.putSettings({ briefing: { location: LOCATION } });
    clock.set(Date.parse('2026-11-26T12:00:10Z'));
    const first = await brain.briefings.tick();
    assert.equal(first.weather, null);
    assert.deepEqual(first.headlines, []);
    assert.equal(push.sent.length, 1);
    assert.ok(logs.some((l) => /made again in 7 minutes/.test(l)));
    networkUp = true;
    clock.set(clock.now() + 5 * 60_000);
    assert.equal(brain.briefings.tick(), null, 'not yet');
    clock.set(clock.now() + 2 * 60_000 + 1000);
    const again = await brain.briefings.tick();
    assert.ok(again, 'made again');
    assert.equal(again.date, '2026-11-26');
    assert.equal(again.weather?.label, 'Wellington, New Zealand');
    assert.ok(again.headlines.length > 0);
    assert.deepEqual(brain.latestBriefing(), again);
    assert.equal(push.sent.length, 1, 'no second notification');
    assert.equal(events.length, 2, 'the dashboard and the app hear about the better one');
    clock.set(clock.now() + 30 * 60_000);
    assert.equal(brain.briefings.tick(), null, 'only once');
    assert.equal(brain.info().briefing.nextAt, '2026-11-27T12:00:00.000Z');
  } finally {
    await brain.stop();
  }
});

test('core/whats-new.json announces this release: valid entries, the newest shown in the briefing (4 at most)', () => {
  const file = fileURLToPath(new URL('../../../whats-new.json', import.meta.url));
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(list) && list.length > 0, 'what\'s new in Jarvis has entries');
  for (const e of list) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(typeof e.title === 'string' && e.title.trim() && e.title.length <= 120, e.title);
    assert.ok(typeof e.detail === 'string' && e.detail.trim() && e.detail.length <= 400, e.detail);
    assert.ok(!/[[\]*`#]|https?:/.test(`${e.title} ${e.detail}`), 'plain words: they are read aloud too');
  }
  const newest = list.map((e) => e.date).sort().at(-1);
  const shown = readWhatsNew(file, newest);
  assert.ok(shown.length >= 1 && shown.length <= 4);
  assert.deepEqual(shown[0], { title: list.find((e) => e.date === newest).title, detail: list.find((e) => e.date === newest).detail });
});

test('overnight report: tonight\'s update, a rollback and restarts are told; a rollback is something to look at', () => {
  setLocale('en-US');
  const t = MORNING;
  const report = (evs, level = 'ok') => overnightReport({
    core: { snapshot: { health: { level, summary: 'All systems normal' } }, history: { query: () => ({ t: [], series: {} }) }, events: { between: (a, b) => evs.filter((e) => e.t >= a && e.t <= b) } },
    now: t,
    fromMs: t - 12 * 3600_000,
    timeZone: TZ,
  });
  const update = { t: t - 7.5 * 3600_000, level: 'info', kind: 'system', rule: 'core.update', message: 'Jarvis Core updated itself to a1b2c3d' };
  const start = { t: t - 7.4 * 3600_000, level: 'info', kind: 'system', rule: 'core.start', message: 'Jarvis Core started (version 1.1.0)' };
  const rollback = { t: t - 3 * 3600_000, level: 'warn', kind: 'system', rule: 'core.rollback', message: 'An automatic update to d4e5f6a didn\'t start properly, so Jarvis Core went back to a1b2c3d' };
  const all = report([update, start, rollback]);
  assert.equal(all.summary, 'All clear now, after one thing overnight.');
  assert.deepEqual(all.notes, ['11:30 PM: Jarvis Core updated itself to a1b2c3d', "4:00 AM: An automatic update to d4e5f6a didn't start properly, so Jarvis Core went back to a1b2c3d"]);
  // An update and its restart: a normal night, and it says so.
  const updated = report([update, start]);
  assert.equal(updated.summary, 'All systems normal overnight.');
  assert.deepEqual(updated.notes, ['11:30 PM: Jarvis Core updated itself to a1b2c3d']);
  // A restart by hand is told too; a quiet night says there were no restarts.
  const restarted = report([{ ...start, t: t - 2 * 3600_000 }]);
  assert.deepEqual(restarted.notes, ['5:00 AM: Jarvis Core started (version 1.1.0)']);
  assert.deepEqual(report([]).notes, ['No restarts overnight']);
  const crashed = report([{ t: t - 3600_000, level: 'warn', kind: 'system', rule: 'core.crash', message: 'Jarvis Core restarted after an unexpected stop' }, { ...start, t: t - 3600_000 + 1000 }]);
  assert.equal(crashed.summary, 'All clear now, after one thing overnight.');
  assert.deepEqual(crashed.notes, ['6:00 AM: Jarvis Core restarted after an unexpected stop']);
});

test('settings: limits, time, units, owner; a city is geocoded (Open-Meteo); coordinates rounded to 2 decimals; bad input refused', async () => {
  const config = { ownerName: 'Frank' };
  const { brain } = makeBrain({});
  try {
    let info = await brain.putSettings({ briefing: { location: { city: 'Wellington' } } });
    assert.deepEqual(info.briefing.location, { label: 'Wellington, New Zealand', lat: -41.29, lon: 174.78 });
    info = await brain.putSettings({ briefing: { location: { lat: 12.3456, lon: -45.6789 }, units: 'C' } });
    assert.deepEqual(info.briefing.location, { label: 'Your location', lat: 12.35, lon: -45.68 });
    assert.equal(info.briefing.units, 'C');
    info = await brain.putSettings({ limits: { dailyUsd: 2.5, monthlyUsd: 20 }, owner: { name: '  Frank W.  ' } });
    assert.deepEqual(info.limits, { dailyUsd: 2.5, monthlyUsd: 20 });
    assert.equal(info.owner.name, 'Frank W.');
    const bad = async (body, code) => assert.rejects(brain.putSettings(body), (e) => e.status === 400 && e.code === code, JSON.stringify(body));
    await bad({ limits: { dailyUsd: 51 } }, 'bad_limits');
    await bad({ limits: { dailyUsd: -1 } }, 'bad_limits');
    await bad({ limits: { monthlyUsd: 501 } }, 'bad_limits');
    await bad({ limits: { dailyUsd: '5' } }, 'bad_limits');
    await bad({ briefing: { time: '25:00' } }, 'bad_time');
    await bad({ briefing: { units: 'K' } }, 'bad_units');
    await bad({ briefing: { location: { lat: 91, lon: 0 } } }, 'bad_location');
    await bad({ briefing: { location: { city: 'Nowhereville' } } }, 'city_not_found');
    await bad({ owner: { name: '   ' } }, 'bad_owner');
    await bad({ colour: 'blue' }, 'bad_settings');
    await bad([], 'bad_settings');
    assert.deepEqual(brain.info().limits, { dailyUsd: 2.5, monthlyUsd: 20 }, 'a refused change changes nothing');
    const offline = makeBrain({ fetchFn: createFixtureFetch({ overrides: { geocoding: new TypeError('fetch failed') } }) });
    await assert.rejects(offline.brain.putSettings({ briefing: { location: { city: 'Wellington' } } }), (e) => e.status === 503 && e.code === 'geocoding_unavailable');
    await offline.brain.stop();
    assert.equal(config.ownerName, 'Frank');
  } finally {
    await brain.stop();
  }
});

test('feed parser: RSS, Atom, CDATA and entities; never throws, linear on hostile input', () => {
  const fx = (n) => fs.readFileSync(path.resolve(import.meta.dirname, '../../../fixtures/brain', n), 'utf8');
  const npr = parseFeed(fx('npr.xml'));
  assert.equal(npr.length, 3);
  assert.equal(npr[1].title, 'Senate passes the farm bill & sends it to the House');
  assert.equal(npr[0].publishedAt, Date.parse('2026-11-25T11:12:00Z'));
  const verge = parseFeed(fx('verge.xml'));
  assert.equal(verge[0].url, 'https://www.theverge.com/2026/11/25/iphone-alarm-fix');
  assert.equal(verge[1].url, 'https://www.theverge.com/2026/11/25/eink-laptop');
  assert.equal(parseFeed(fx('ars.xml'))[0].publishedAt, Date.parse('2026-11-25T09:00:00Z'));
  for (const junk of [null, undefined, 42, {}, '', 'plain text', '<rss><item><title>no end', '<item></item>', '<item><title>x</title><link>javascript:alert(1)</link></item>', '\u0000￿<entry><link href="http://a.example/"/>', '<items><item >\n<title>t</title><link>https://ok.example/a</link></item></items>']) {
    assert.ok(Array.isArray(parseFeed(junk)));
  }
  assert.deepEqual(parseFeed('<items><item >\n<title>t</title><link>https://ok.example/a</link></item></items>'), [{ title: 't', url: 'https://ok.example/a', publishedAt: null }]);
  // Random bytes and hostile shapes, fast.
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const t0 = Date.now();
  for (let i = 0; i < 200; i += 1) {
    let s = '';
    for (let j = 0; j < 2000; j += 1) s += '<>/itemntrylk="&;# ab'[Math.floor(rnd() * 22)] ?? 'x';
    assert.ok(Array.isArray(parseFeed(s)));
  }
  assert.ok(Array.isArray(parseFeed('<item>'.repeat(200_000))));
  assert.ok(Array.isArray(parseFeed(`<item><title>${'&#x41;'.repeat(100_000)}</title><link>https://a.example/</link></item>`)));
  assert.ok(Array.isArray(parseFeed('<entry>'.repeat(100_000) + '</entry>')));
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
  // Merge: alternating general and tech, no repeats.
  const lists = [
    { feed: { name: 'G1', kind: 'general' }, items: [{ title: 'A', url: 'https://g/1' }, { title: 'B', url: 'https://g/2' }] },
    { feed: { name: 'T1', kind: 'tech' }, items: [{ title: 'a', url: 'https://g/1' }, { title: 'C', url: 'https://t/2' }] },
  ];
  assert.deepEqual(mergeHeadlines(lists, 6).map((h) => h.title), ['A', 'B', 'C']);
});

test('weather parser: Open-Meteo JSON in, null for anything without numbers', () => {
  assert.equal(parseForecast(null, { units: 'F' }), null);
  assert.equal(parseForecast({ current: {} }, { units: 'F' }), null);
  const w = parseForecast({ current: { temperature_2m: 5.4, weather_code: 61 }, daily: { temperature_2m_max: [8], temperature_2m_min: [1], precipitation_probability_max: [80], weather_code: [63] } }, { units: 'C', label: 'Here' });
  assert.deepEqual(w, { label: 'Here', units: 'C', now: { temp: 5, summary: 'Light rain', code: 61 }, today: { high: 8, low: 1, rainChancePct: 80, summary: 'Rain, high 8°, low 1°, 80% chance of rain' } });
});
